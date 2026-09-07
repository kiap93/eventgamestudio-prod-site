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
  getSetupDayStartTime,
  isSetupDayStarted,
  canCancelEvent,
  runEventLifecycleMaintenance,
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

  assert.ok(
    event1.payment_status === 'UNPAID' || event1.payment_status === 'PENDING_PAYMENT',
    'Event 1 payment_status must be UNPAID or PENDING_PAYMENT'
  );
  assert.strictEqual(event1.paid_amount, 0, 'Event 1 paid amount must be 0 at creation');
  assert.ok(event1.public_token, 'Event 1 public_token must be generated');

  const enriched1 = await getEventById(event1.id, env);
  assert.ok(enriched1, 'Event 1 must be found');
  console.log('  ✓ PASS: Event created in UNPAID/PENDING_PAYMENT status without wallet charge');

  console.log('--- Test Case 2 & 3: Public Token Resolution for PENDING_PAYMENT ---');
  // Without allowUnpaid, pending payment event is NOT playable (returns null)
  const playableCheck = await getEventByPublicToken(event1.public_token, env, { allowUnpaid: false });
  assert.strictEqual(playableCheck, null, 'Public playable access must be blocked for UNPAID event');

  // With allowUnpaid: true, public event details resolve (for showing payment-required screen)
  const publicEvent = await getEventByPublicToken(event1.public_token, env, { allowUnpaid: true });
  assert.ok(publicEvent, 'Public event metadata should resolve with allowUnpaid: true');
  assert.strictEqual(publicEvent?.id, event1.id);
  assert.ok(
    publicEvent?.payment_status === 'UNPAID' || publicEvent?.payment_status === 'PENDING_PAYMENT',
    'Public event payment status must be UNPAID or PENDING_PAYMENT'
  );
  console.log('  ✓ PASS: Public resolution correctly guards playability while resolving metadata with allowUnpaid');

  console.log('--- Test Case 4: Complete Payment -> Status changes to ACTIVE / Scheduled ---');
  // Add balance to org wallet to pay
  await createTopup({
    organizationId: orgId,
    amount: event1.event_price || 1400,
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
  assert.ok(paidEvent?.calculated_status === 'scheduled' || paidEvent?.calculated_status === 'live', 'Calculated status must be scheduled or live');
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
    amount: pendingEventB.event_price || 1400,
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

  console.log('--- Test Case 9: Deterministic Setup Day Calculation ---');
  // Event scheduled for 2 September 2026 10:00:00 UTC
  const testEventSep2 = {
    starts_at: '2026-09-02T10:00:00.000Z',
    event_date: '2026-09-02',
  };
  const setupDayTime = getSetupDayStartTime(testEventSep2);
  assert.strictEqual(setupDayTime.toISOString(), '2026-09-01T00:00:00.000Z', 'Setup Day must start on 1 Sep at 00:00:00 UTC');
  console.log('  ✓ PASS: Setup Day correctly calculated as 1 September 00:00:00 UTC');

  console.log('--- Test Case 10: Before Setup Day (31 Aug) Lifecycle Checks ---');
  const date31Aug = new Date('2026-08-31T20:00:00.000Z');
  assert.strictEqual(isSetupDayStarted(testEventSep2, date31Aug), false, 'Setup day not started on 31 Aug');

  // Create an unpaid event scheduled for 2 Sep (created before Setup Day on 31 Aug)
  const sepEvent = await createEvent({
    organization_id: orgId,
    game_theme_id: themeId,
    name: 'September Carnival Event',
    event_date: '2026-09-02',
    starts_at: '2026-09-02T10:00:00.000Z',
    expires_at: '2026-09-03T23:59:59.000Z',
    currentDate: date31Aug,
  }, env);

  const cancelCheckBeforeSetup = canCancelEvent(sepEvent, date31Aug);
  assert.strictEqual(cancelCheckBeforeSetup.canCancel, true, 'Cancellation allowed before Setup Day');
  assert.strictEqual(cancelCheckBeforeSetup.canRefund, false, 'No refund needed since unpaid');
  console.log('  ✓ PASS: Before Setup Day, event is unpaid and cancellation is allowed');

  console.log('--- Test Case 11: Setup Day (1 Sep 00:00:00) Automated Payment Deduction by Worker ---');
  // Top-up org wallet with funds for the event
  await createTopup({
    organizationId: orgId,
    amount: sepEvent.event_price || 1400,
    referenceId: 'test_topup_sep_event',
  }, env);

  const balanceBefore = await getWalletBalance(orgId, env);
  const date1Sep = new Date('2026-09-01T00:05:00.000Z');

  // Run lifecycle maintenance at 1 Sep 00:05:00
  const maintResult = await runEventLifecycleMaintenance(env, date1Sep);
  assert.ok(maintResult.paidEvents.includes(sepEvent.id), 'Sep event must be paid by maintenance worker');

  const sepEventAfterMaint = await getEventById(sepEvent.id, env);
  assert.strictEqual(sepEventAfterMaint?.payment_status, 'PAID', 'Event payment status must be PAID');
  assert.strictEqual(sepEventAfterMaint?.event_status, 'LIVE', 'Event status must be LIVE/scheduled');

  const balanceAfter = await getWalletBalance(orgId, env);
  assert.strictEqual(balanceAfter.paid_balance, balanceBefore.paid_balance - (sepEvent.event_price || 1400), 'Event price deducted from wallet');
  console.log('  ✓ PASS: Setup Day worker atomically deducts wallet balance and stamps PAID/LIVE');

  console.log('--- Test Case 12: Worker Idempotency on Setup Day ---');
  // Run maintenance worker again at 1 Sep 01:00:00
  const date1SepLater = new Date('2026-09-01T01:00:00.000Z');
  const maintResultReplay = await runEventLifecycleMaintenance(env, date1SepLater);
  assert.strictEqual(maintResultReplay.paidEvents.includes(sepEvent.id), false, 'Already paid event must not be paid again');

  const balanceAfterReplay = await getWalletBalance(orgId, env);
  assert.strictEqual(balanceAfterReplay.paid_balance, balanceAfter.paid_balance, 'Balance must remain unchanged on replay');
  console.log('  ✓ PASS: Worker is idempotent and prevents duplicate payment deductions');

  console.log('--- Test Case 13: Post-Payment Cancellation Rejection ---');
  const cancelCheckAfterPayment = canCancelEvent(sepEventAfterMaint!, date1Sep);
  assert.strictEqual(cancelCheckAfterPayment.canCancel, false, 'Cancellation rejected after payment');
  assert.strictEqual(cancelCheckAfterPayment.code, 'PAYMENT_COMMITTED', 'Code is PAYMENT_COMMITTED');

  let cancelThrew = false;
  try {
    await cancelEvent(sepEvent.id, { cancelledBy: testUser.id, reason: 'User changed mind', now: date1Sep }, env);
  } catch (err: any) {
    if (err.message.includes('cancellation and refunds are disabled') || err.code === 'PAYMENT_COMMITTED') {
      cancelThrew = true;
    }
  }
  assert.strictEqual(cancelThrew, true, 'cancelEvent must throw when attempting to cancel a paid event');
  console.log('  ✓ PASS: Post-payment cancellation, refunds, and credit reversals are strictly rejected');

  console.log('--- Test Case 14: Insufficient Balance on Setup Day Keeps Payment Pending ---');
  // Create another org with 0 balance and an event on 2 Sep
  const poorOrg = await createOrganization({
    name: 'Poor Org',
    owner_id: testUser.id,
  }, env);

  const poorTheme = await createTheme({
    organization_id: poorOrg.id,
    game_id: gameId,
    name: 'Poor Org Theme',
    slug: 'poor-theme',
  }, env);

  const unpaidSepEvent = await createEvent({
    organization_id: poorOrg.id,
    game_theme_id: poorTheme.id,
    name: 'Unfunded Sep Event',
    event_date: '2026-09-02',
    starts_at: '2026-09-02T10:00:00.000Z',
    expires_at: '2026-09-03T23:59:59.000Z',
    currentDate: date31Aug,
  }, env);

  // Run maintenance on 1 Sep
  const maintPoor = await runEventLifecycleMaintenance(env, date1Sep);
  assert.ok(maintPoor.paymentFailedEvents.includes(unpaidSepEvent.id), 'Payment failure recorded in maintenance');

  const checkUnfunded = await getEventById(unpaidSepEvent.id, env);
  assert.ok(
    checkUnfunded?.payment_status === 'UNPAID' || checkUnfunded?.payment_status === 'PENDING_PAYMENT',
    'Payment status remains UNPAID or PENDING_PAYMENT'
  );
  console.log('  ✓ PASS: Insufficient balance on Setup Day leaves event unpaid without throwing/crashing worker');

  console.log('--- Test Case 15: Event Completion at Expiry Window ---');
  const date4Sep = new Date('2026-09-04T01:00:00.000Z');
  const maintCompleted = await runEventLifecycleMaintenance(env, date4Sep);
  assert.ok(maintCompleted.completedEvents.includes(sepEvent.id), 'Sep event marked completed after expiry');

  const completedEvent = await getEventById(sepEvent.id, env);
  assert.strictEqual(completedEvent?.event_status, 'COMPLETED', 'Event status is COMPLETED');
  assert.strictEqual(completedEvent?.status, 'expired', 'Status is expired');
  console.log('  ✓ PASS: Paid event expires and is marked COMPLETED at end of event window');

  console.log('\n======================================================');
  console.log(' ALL 15 CRITICAL LIFECYCLE TESTS PASSED PERFECTLY');
  console.log('======================================================\n');
}

runTests().catch((err) => {
  console.error('Lifecycle test error:', err);
  process.exit(1);
});
