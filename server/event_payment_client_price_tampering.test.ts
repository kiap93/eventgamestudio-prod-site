import assert from 'node:assert';
import crypto from 'node:crypto';
import { createUser } from './db/users.js';
import { createOrganization } from './db/organizations.js';
import { createTheme } from './db/themes.js';
import { ensureDefaultGame } from './db/games.js';
import { createEvent, getEventById } from './db/events.js';
import {
  processEventPayment,
  calculateEventPaymentQuote,
  createTopup,
  getWalletBalance,
} from './db/wallet.js';
import { signAppToken } from './auth.js';
import worker from '../worker.js';

console.log('======================================================');
console.log('Running Event Payment Client Price Tampering Tests');
console.log('======================================================\n');

async function runTests() {
  const workerEnv = {
    JWT_SECRET: '0123456789abcdef0123456789abcdef',
    SUPABASE_URL: 'https://placeholder.supabase.co',
    SUPABASE_ANON_KEY: 'placeholder-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'placeholder-service-key',
    NODE_ENV: 'development',
  };

  const testUser = await createUser({
    email: `tamper-test-${crypto.randomUUID().slice(0, 8)}@example.com`,
    name: 'Tamper Test Owner',
  });

  const org = await createOrganization({
    name: `Tamper Test Org ${Date.now()}`,
    owner_id: testUser.id,
  });

  const userJwt = await signAppToken(
    testUser.id,
    org.id,
    'owner',
    workerEnv.JWT_SECRET,
    workerEnv
  );

  const game = await ensureDefaultGame(org.id, 'Price Tamper Game');
  const theme = await createTheme({
    organization_id: org.id,
    game_id: game.id,
    name: 'Price Tamper Theme',
  });

  // Fund the organization wallet sufficiently so payments can succeed
  await createTopup({
    organizationId: org.id,
    amount: 10000,
    referenceId: `seed_wallet_${Date.now()}`,
    description: 'Seed wallet balance for test',
  });

  // --------------------------------------------------------------------------
  // TEST 1: calculateEventPaymentQuote prioritizes event.event_price over client override
  // --------------------------------------------------------------------------
  console.log('--- Test 1: calculateEventPaymentQuote Ignores Client-Supplied eventPrice ---');

  const event1 = await createEvent({
    organization_id: org.id,
    game_theme_id: theme.id,
    name: 'Tamper Quote Event',
    start_date: '2026-10-01',
    end_date: '2026-10-01', // 1 day: RM1,400 authoritative price
    event_price: 1400,
    created_by: testUser.id,
  });

  // Call calculateEventPaymentQuote passing a malicious eventPrice of 100
  const quote = await calculateEventPaymentQuote({
    organizationId: org.id,
    eventId: event1.id,
    eventPrice: 100, // Attacker trying to spoof quote at RM100
    creditChoice: 'NONE',
  });

  assert.strictEqual(
    quote.event_price,
    1400,
    `Quote event_price must be authoritative 1400, not client-supplied 100 (got ${quote.event_price})`
  );
  console.log('  ✓ 1. calculateEventPaymentQuote strictly loads event.event_price (1400) and ignores client override (100)');

  // --------------------------------------------------------------------------
  // TEST 2: processEventPayment directly ignores params.eventPrice when eventId has event_price
  // --------------------------------------------------------------------------
  console.log('\n--- Test 2: processEventPayment Directly Ignores Malicious eventPrice ---');

  const event2 = await createEvent({
    organization_id: org.id,
    game_theme_id: theme.id,
    name: 'Tamper Process Event',
    start_date: '2026-10-02',
    end_date: '2026-10-02', // 1 day: RM1,400
    event_price: 1400,
    created_by: testUser.id,
  });

  const paymentResult = await processEventPayment({
    organizationId: org.id,
    eventId: event2.id,
    eventName: event2.name,
    paymentMode: 'FULL_PAID',
    eventPrice: 50, // Attacker trying to pay RM50 instead of RM1,400
    createdBy: testUser.id,
  });

  assert.strictEqual(
    paymentResult.paymentCalculation.eventPrice,
    1400,
    `paymentCalculation.eventPrice must be 1400, not 50 (got ${paymentResult.paymentCalculation.eventPrice})`
  );
  assert.strictEqual(
    paymentResult.quote.event_price,
    1400,
    `quote.event_price must be 1400, not 50 (got ${paymentResult.quote.event_price})`
  );
  console.log('  ✓ 2. processEventPayment calculates pre-payment and quote using authoritative 1400, ignoring client 50');

  // --------------------------------------------------------------------------
  // TEST 3: POST /api/events/:eventId/pay Ignores Client-Supplied event_price in Request Body
  // --------------------------------------------------------------------------
  console.log('\n--- Test 3: POST /api/events/:eventId/pay Ignores Client-Supplied event_price ---');

  const event3 = await createEvent({
    organization_id: org.id,
    game_theme_id: theme.id,
    name: 'Tamper Direct Pay Route Event',
    start_date: '2026-10-03',
    end_date: '2026-10-03',
    event_price: 1400,
    created_by: testUser.id,
  });

  const payReq = new Request(`https://api.eventgamestudio.local/api/events/${event3.id}/pay`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${userJwt}`,
    },
    body: JSON.stringify({
      payment_mode: 'FULL_PAID',
      event_price: 10, // Malicious client attempt to pay RM10
    }),
  });

  const payRes = await worker.fetch(payReq, workerEnv);
  assert.strictEqual(payRes.status, 200, `Payment route should succeed (status ${payRes.status})`);

  const payData: any = await payRes.json();
  assert.strictEqual(
    payData.payment.paymentCalculation.eventPrice,
    1400,
    `Returned payment calculation must use authoritative price 1400, not 10 (got ${payData.payment.paymentCalculation.eventPrice})`
  );
  assert.strictEqual(
    payData.payment.quote.event_price,
    1400,
    `Returned quote must use authoritative price 1400 (got ${payData.payment.quote.event_price})`
  );

  const verifiedEvent3 = await getEventById(event3.id);
  assert.strictEqual(verifiedEvent3?.payment_status, 'PAID', 'Event must now be marked PAID');
  assert.strictEqual(verifiedEvent3?.event_price, 1400, 'Event price must remain intact at 1400');
  console.log('  ✓ 3. POST /api/events/:eventId/pay ignored client-supplied event_price (10) and charged authoritative 1400');

  // --------------------------------------------------------------------------
  // TEST 4: POST /api/organizations/:orgId/wallet/pay-event Ignores Client-Supplied event_price
  // --------------------------------------------------------------------------
  console.log('\n--- Test 4: POST /api/organizations/:orgId/wallet/pay-event Ignores Client-Supplied event_price ---');

  const event4 = await createEvent({
    organization_id: org.id,
    game_theme_id: theme.id,
    name: 'Tamper Wallet Pay Route Event',
    start_date: '2026-10-04',
    end_date: '2026-10-04',
    event_price: 1400,
    created_by: testUser.id,
  });

  const walletPayReq = new Request(`https://api.eventgamestudio.local/api/organizations/${org.id}/wallet/pay-event`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${userJwt}`,
    },
    body: JSON.stringify({
      event_id: event4.id,
      event_price: 25, // Malicious client attempt to pay RM25
      payment_mode: 'FULL_PAID',
    }),
  });

  const walletPayRes = await worker.fetch(walletPayReq, workerEnv);
  assert.strictEqual(walletPayRes.status, 200, `Wallet pay route should succeed (status ${walletPayRes.status})`);

  const walletPayData: any = await walletPayRes.json();
  assert.strictEqual(
    walletPayData.calculation.eventPrice,
    1400,
    `Calculation price must be authoritative 1400, not 25 (got ${walletPayData.calculation.eventPrice})`
  );
  assert.strictEqual(
    walletPayData.quote.event_price,
    1400,
    `Quote price must be authoritative 1400, not 25 (got ${walletPayData.quote.event_price})`
  );

  const verifiedEvent4 = await getEventById(event4.id);
  assert.strictEqual(verifiedEvent4?.payment_status, 'PAID', 'Event 4 must now be marked PAID');
  console.log('  ✓ 4. POST /api/organizations/:orgId/wallet/pay-event ignored client event_price (25) and charged 1400');

  console.log('\n======================================================');
  console.log('All Event Payment Price Tampering Tests Passed Successfully!');
  console.log('======================================================');
}

runTests().catch((err) => {
  console.error('Test failure:', err);
  process.exit(1);
});
