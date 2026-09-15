import assert from 'node:assert';
import { createOrganization } from './organizations.js';
import { createUser } from './users.js';
import { getWalletBalance, createTopup, processTopupOrderStatus, createTopupOrder, grantWelcomeCredit } from './wallet.js';
import { createEventWithAtomicPayment } from './events.js';
import { createTheme } from './themes.js';
import { ensureDefaultGame } from './games.js';

async function runTests() {
  console.log('--- STARTING CREATE EVENT PAYMENT FLOW & TOP UP SHORTFALL TESTS ---');

  // Test 1: Create Organization and grant Welcome Credit (Starts with 0 paid balance and RM800 Welcome Credit)
  const testUser = await createUser({
    email: `test-${crypto.randomUUID().slice(0, 8)}@example.com`,
    name: 'Shortfall Tester',
  });
  const testUserId = testUser.id;
  const org = await createOrganization({
    name: 'Shortfall Test Corp ' + Date.now(),
    owner_id: testUserId,
  });
  await grantWelcomeCredit({ organizationId: org.id, userId: testUserId });

  const initialWallet = await getWalletBalance(org.id);
  console.log('1. Initial Wallet:', initialWallet);
  assert.strictEqual(initialWallet.paid_balance, 0);
  assert.strictEqual(initialWallet.welcome_credit, 800);

  // Setup game & theme
  const game = await ensureDefaultGame(org.id, 'Test Game');
  const theme = await createTheme({
    organization_id: org.id,
    game_id: game.id,
    name: 'Winter Theme',
  });

  // Test 2: Attempt to create event when available balance (0) < paidAmount (600 with Welcome Credit)
  // Backend MUST throw error with code: 'INSUFFICIENT_BALANCE', required: 600, available: 0, shortfall: 600
  let caughtError: any = null;
  try {
    await createEventWithAtomicPayment({
      organization_id: org.id,
      game_theme_id: theme.id,
      name: 'Underfunded Event',
      starts_at: new Date(Date.now() + 86400000).toISOString(),
      expires_at: new Date(Date.now() + 86400000 + 3600000).toISOString(),
      status: 'scheduled',
      payment_mode: 'WELCOME_CREDIT',
    });
  } catch (err: any) {
    caughtError = err;
  }

  console.log('2. Insufficient balance error caught:', caughtError?.code, caughtError?.shortfall);
  assert.ok(caughtError, 'Expected createEventWithAtomicPayment to fail on insufficient balance');
  assert.strictEqual(caughtError.code, 'INSUFFICIENT_BALANCE');
  assert.strictEqual(caughtError.required, 600);
  assert.strictEqual(caughtError.available, 0);
  assert.strictEqual(caughtError.shortfall, 600);

  // Test 3: Create Top Up Order with exact shortfall (RM 600)
  const topUpOrder = await createTopupOrder({
    organizationId: org.id,
    userId: testUserId,
    amount: 600,
    currency: 'MYR',
    notes: 'Cover shortfall for event creation',
  });

  assert.strictEqual(topUpOrder.status, 'PENDING');
  assert.strictEqual(topUpOrder.top_up_amount, 600);

  // Wallet balance must NOT be credited while order is PENDING
  const walletWhilePending = await getWalletBalance(org.id);
  assert.strictEqual(walletWhilePending.paid_balance, 0, 'Pending order must not credit wallet');

  // Test 4: Settle Top Up Order to PAID via trusted settlement
  const settleResult = await processTopupOrderStatus({
    orderId: topUpOrder.id,
    newStatus: 'PAID',
    paymentMethod: 'card',
    paymentReference: 'test_ref_shortfall_paid',
    processedBy: testUserId,
    isTrustedSettlement: true,
  });

  assert.strictEqual(settleResult.order.status, 'PAID');
  const walletAfterTopUp = await getWalletBalance(org.id);
  console.log('3. Wallet after Top Up:', walletAfterTopUp);
  assert.strictEqual(walletAfterTopUp.paid_balance, 600);

  // Test 5: Now availableBalance (600) >= paidAmount (600) -> Event creation succeeds!
  const eventResult = await createEventWithAtomicPayment({
    organization_id: org.id,
    game_theme_id: theme.id,
    name: 'Successfully Funded Event',
    starts_at: new Date(Date.now() + 86400000).toISOString(),
    expires_at: new Date(Date.now() + 86400000 + 3600000).toISOString(),
    status: 'scheduled',
    payment_mode: 'WELCOME_CREDIT',
  });

  console.log('4. Created Event Result:', eventResult.event.id, eventResult.event.name);
  assert.ok(eventResult.event.id);
  assert.strictEqual(eventResult.event.payment_status, 'PAID');
  assert.strictEqual(eventResult.payment.paymentCalculation.paidAmount, 600);
  assert.strictEqual(eventResult.payment.paymentCalculation.totalDiscount, 800);

  // Wallet balance after payment: paid_balance should now be 0, welcome_credit should be 0
  const finalWallet = await getWalletBalance(org.id);
  console.log('5. Final Wallet:', finalWallet);
  assert.strictEqual(finalWallet.paid_balance, 0);
  assert.strictEqual(finalWallet.welcome_credit, 0);

  console.log('--- ALL PAYMENT FLOW & SHORTFALL TESTS PASSED SUCCESSFULLY! ---');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
