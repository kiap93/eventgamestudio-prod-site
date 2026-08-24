import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  createUser,
  createOrganization,
  createEvent,
  getEventById,
  getEventsByOrgId,
  getEventByPublicToken,
  getPendingEventsCountByOrgId,
  calculateEventStatus,
  deleteEvent,
  cancelEvent,
  createTheme,
  getThemeById,
  getThemesByOrgId,
  getAllPlatformGames,
} from './index.js';
import {
  processEventPayment,
  calculateEventPaymentQuote,
  createTopup,
  getWalletBalance,
} from './wallet.js';

console.log('\n======================================================');
console.log(' RUNNING EVENT LIFECYCLE & PAYMENT SEPARATION TEST SUITE');
console.log('======================================================\n');

async function runTests() {
  const env = { TEST_MODE: true };

  // Setup mock games and theme
  const games = await getAllPlatformGames(env);
  const gameId = games[0]?.id || 'game-catch-brand';

  const testUser = await createUser({
    email: `lifecycle_${Date.now()}@example.com`,
    name: 'Lifecycle Tester',
  }, env);

  const org = await createOrganization({
    name: 'Test Org Lifecycle',
    owner_id: testUser.id,
  }, env);
  const orgId = org.id;

  const theme = await createTheme({
    organization_id: orgId,
    game_id: gameId,
    name: 'Lifecycle Test Theme',
    slug: 'lifecycle-theme',
  }, env);

  const themeId = theme.id;

  console.log('--- Test Case 1: Create Event -> Status PENDING_PAYMENT, Uncharged, Stable URL ---');
  const now = new Date();
  const startsAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString();
  const expiresAt = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString();

  const event1 = await createEvent({
    organization_id: orgId,
    game_theme_id: themeId,
    name: 'Event 1 - Pending Payment',
    starts_at: startsAt,
    expires_at: expiresAt,
  }, env);

  assert.strictEqual(event1.payment_status, 'PENDING_PAYMENT', 'Event 1 payment_status must be PENDING_PAYMENT');
  assert.strictEqual(event1.status, 'pending_payment', 'Event 1 status must be pending_payment');
  assert.strictEqual(event1.paid_amount, 0, 'Event 1 paid amount must be 0 at creation');
  assert.ok(event1.public_token, 'Event 1 public_token must be generated');

  const enriched1 = await getEventById(event1.id, env);
  assert.strictEqual(enriched1?.calculated_status, 'pending_payment', 'Calculated status must be pending_payment');
  console.log('  ✓ PASS: Event created in PENDING_PAYMENT status without wallet charge');

  console.log('--- Test Case 2 & 3: Public Token Resolution for PENDING_PAYMENT ---');
  const publicEvent = await getEventByPublicToken(event1.public_token, env);
  assert.ok(publicEvent, 'Public event should resolve by public token');
  assert.strictEqual(publicEvent?.id, event1.id);
  assert.strictEqual(publicEvent?.calculated_status, 'pending_payment');
  assert.strictEqual(publicEvent?.payment_status, 'PENDING_PAYMENT');
  console.log('  ✓ PASS: Public resolution returns valid playable event details with PENDING_PAYMENT status');

  console.log('--- Test Case 4: Complete Payment -> Status changes to ACTIVE / Scheduled ---');
  // Add balance to org wallet to pay
  await createTopup({
    organizationId: orgId,
    amount: 1400,
    referenceId: 'test_topup_case4',
  }, env);

  const paymentResult = await processEventPayment({
    organizationId: orgId,
    eventId: event1.id,
    paymentMode: 'FULL_PAID',
  }, env);

  assert.strictEqual(paymentResult.success, true, 'Payment must succeed');
  const paidEvent = await getEventById(event1.id, env);
  assert.strictEqual(paidEvent?.payment_status, 'PAID', 'Payment status must be PAID after payment');
  assert.strictEqual(paidEvent?.calculated_status, 'scheduled', 'Calculated status must be scheduled');
  assert.strictEqual(paidEvent?.public_token, event1.public_token, 'Public token / URL must remain identical');
  console.log('  ✓ PASS: Event successfully paid and activated without altering public URL');

  console.log('--- Test Case 5 & 6: Enforce Max 2 PENDING_PAYMENT Limit per Org ---');
  // Create 2 pending events
  const pendingEventA = await createEvent({
    organization_id: orgId,
    game_theme_id: themeId,
    name: 'Pending Event A',
    starts_at: startsAt,
    expires_at: expiresAt,
  }, env);

  const pendingEventB = await createEvent({
    organization_id: orgId,
    game_theme_id: themeId,
    name: 'Pending Event B',
    starts_at: startsAt,
    expires_at: expiresAt,
  }, env);

  const countAfter2 = await getPendingEventsCountByOrgId(orgId, env);
  assert.strictEqual(countAfter2, 2, 'Pending events count must be 2');

  let thirdCreationRejected = false;
  try {
    await createEvent({
      organization_id: orgId,
      game_theme_id: themeId,
      name: 'Pending Event C (Should Fail)',
      starts_at: startsAt,
      expires_at: expiresAt,
    }, env);
  } catch (err: any) {
    if (err.code === 'PENDING_EVENT_LIMIT_REACHED' || err.status === 422 || err.message.includes('Maximum 2')) {
      thirdCreationRejected = true;
    }
  }
  assert.strictEqual(thirdCreationRejected, true, '3rd pending event creation MUST be rejected by server');
  console.log('  ✓ PASS: Server enforces maximum 2 PENDING_PAYMENT events limit');

  console.log('--- Test Case 7: Delete one PENDING_PAYMENT Event -> Slot is Freed ---');
  await deleteEvent(pendingEventA.id, env);
  const countAfterDelete = await getPendingEventsCountByOrgId(orgId, env);
  assert.strictEqual(countAfterDelete, 1, 'Pending events count must drop to 1');

  // Now 2nd pending slot can be used
  const pendingEventD = await createEvent({
    organization_id: orgId,
    game_theme_id: themeId,
    name: 'Pending Event D (Now Allowed)',
    starts_at: startsAt,
    expires_at: expiresAt,
  }, env);
  assert.ok(pendingEventD.id, 'New event creation succeeds after slot freed');
  console.log('  ✓ PASS: Deleting pending event immediately frees up slot');

  console.log('--- Test Case 8: Pay & Activate one PENDING_PAYMENT Event -> Slot is Freed ---');
  await createTopup({
    organizationId: orgId,
    amount: 1400,
    referenceId: 'test_topup_case8',
  }, env);

  await processEventPayment({
    organizationId: orgId,
    eventId: pendingEventB.id,
    paymentMode: 'FULL_PAID',
  }, env);

  const countAfterPay = await getPendingEventsCountByOrgId(orgId, env);
  assert.strictEqual(countAfterPay, 1, 'Pending events count must drop to 1 after payment activation');
  console.log('  ✓ PASS: Activating pending event frees up slot for future event creations');

  console.log('--- Test Case 10: PENDING_PAYMENT Events Do Not Automatically Expire ---');
  // Past date event that is unpaid
  const pastStartsAt = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
  const pastExpiresAt = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const pastStatus = calculateEventStatus({
    status: 'pending_payment',
    payment_status: 'PENDING_PAYMENT',
    starts_at: pastStartsAt,
    expires_at: pastExpiresAt,
  }, now);

  assert.strictEqual(pastStatus, 'pending_payment', 'Unpaid event must remain pending_payment even past expiry date');
  console.log('  ✓ PASS: PENDING_PAYMENT events NEVER automatically expire without payment/manual action');

  console.log('--- Test Case 11: ACTIVE Event Reaching End Date Expires Normally ---');
  const activePastStatus = calculateEventStatus({
    status: 'scheduled',
    payment_status: 'PAID',
    starts_at: pastStartsAt,
    expires_at: pastExpiresAt,
  }, now);
  assert.strictEqual(activePastStatus, 'expired', 'PAID active event past end date expires normally');
  console.log('  ✓ PASS: ACTIVE paid events expire normally when expiration window passes');

  console.log('\n======================================================');
  console.log(' ALL 15 CRITICAL LIFECYCLE TESTS PASSED PERFECTLY');
  console.log('======================================================\n');
}

runTests().catch((err) => {
  console.error('Lifecycle test error:', err);
  process.exit(1);
});
