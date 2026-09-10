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
  determineEventRefund,
  runEventLifecycleMaintenance,
  getClientLiveGameAccessDetails,
} from './index.js';
import {
  processEventPayment,
  calculateEventPaymentQuote,
  createTopup,
  getWalletBalance,
  getLedgerTransactions,
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
  // Event scheduled for 10 September 2026 (starts at 10:00:00 UTC)
  const testEventSep10 = {
    starts_at: '2026-09-10T10:00:00.000Z',
    start_date: '2026-09-10',
    event_date: '2026-09-10',
  };
  const setupDayTime = getSetupDayStartTime(testEventSep10);
  // In UTC+8 (SGT), Setup Day is 9 September 00:00:00 SGT, which is 2026-09-08T16:00:00.000Z
  assert.strictEqual(setupDayTime.toISOString(), '2026-09-08T16:00:00.000Z', 'Setup Day must start on 9 Sep at 00:00:00 SGT');
  console.log('  ✓ PASS: Setup Day correctly calculated as 9 September 00:00:00 SGT');

  console.log('--- Case 1: Before Setup Day (8 Sep) Lifecycle & Cancellation ---');
  // Dedicated organization and theme for Setup Day tests
  const setupOrg = await createOrganization({
    name: 'Setup Day Test Org',
    owner_id: testUser.id,
  }, env);
  const setupTheme = await createTheme({
    organization_id: setupOrg.id,
    game_id: gameId,
    name: 'Setup Day Test Theme',
    slug: 'setup-day-theme',
  }, env);

  // Event: 10 Sep, Current Date: 8 Sep (10:00 UTC) -> Before Setup Day
  const date8Sep = new Date('2026-09-08T10:00:00.000Z');
  assert.strictEqual(isSetupDayStarted(testEventSep10, date8Sep), false, 'Setup day not started on 8 Sep 10:00 UTC');

  // Create an unpaid event scheduled for 10 Sep
  const sep10EventUnpaid = await createEvent({
    organization_id: setupOrg.id,
    game_theme_id: setupTheme.id,
    name: 'Case 1 Unpaid Sep 10 Event',
    event_date: '2026-09-10',
    start_date: '2026-09-10',
    end_date: '2026-09-11',
    starts_at: '2026-09-10T00:00:00.000Z',
    expires_at: '2026-09-11T23:59:59.000Z',
    currentDate: date8Sep,
  }, env);

  // Maintenance run before Setup Day: NO automatic payment
  const maintCase1 = await runEventLifecycleMaintenance(env, date8Sep);
  assert.strictEqual(maintCase1.paidEvents.includes(sep10EventUnpaid.id), false, 'No automatic payment on 8 Sep');
  const evCase1AfterMaint = await getEventById(sep10EventUnpaid.id, env);
  assert.ok(
    evCase1AfterMaint?.payment_status === 'UNPAID' || evCase1AfterMaint?.payment_status === 'PENDING_PAYMENT',
    'Payment status remains unpaid/pending_payment'
  );

  // Cancellation check before Setup Day (Unpaid)
  const cancelCheckUnpaid = canCancelEvent(sep10EventUnpaid, date8Sep);
  assert.strictEqual(cancelCheckUnpaid.canCancel, true, 'Cancellation allowed before Setup Day for unpaid event');
  assert.strictEqual(cancelCheckUnpaid.canRefund, false, 'No refund needed since unpaid');

  // Now create a paid event scheduled for 10 Sep to verify pre-Setup-Day paid cancellation & refund
  await createTopup({
    organizationId: setupOrg.id,
    amount: 2500,
    referenceId: 'topup_case1_paid',
  }, env);
  const sep10EventPaid = await createEvent({
    organization_id: setupOrg.id,
    game_theme_id: setupTheme.id,
    name: 'Case 1 Paid Sep 10 Event',
    event_date: '2026-09-10',
    start_date: '2026-09-10',
    end_date: '2026-09-11',
    starts_at: '2026-09-10T00:00:00.000Z',
    expires_at: '2026-09-11T23:59:59.000Z',
    currentDate: date8Sep,
  }, env);
  await processEventPayment({
    organizationId: setupOrg.id,
    eventId: sep10EventPaid.id,
    paymentMode: 'FULL_PAID',
    eventName: sep10EventPaid.name,
  }, env);

  const cancelCheckPaid = canCancelEvent(await getEventById(sep10EventPaid.id, env)!, date8Sep);
  assert.strictEqual(cancelCheckPaid.canCancel, true, 'Cancellation allowed before Setup Day for paid event');
  assert.strictEqual(cancelCheckPaid.canRefund, true, 'Refund allowed before Setup Day for paid event');
  assert.ok(cancelCheckPaid.refundPaidAmount > 0, 'Refund amount matches paid amount');

  // Cancel the paid event before Setup Day and verify refund works
  const cancelResult = await cancelEvent(sep10EventPaid.id, {
    cancelledBy: testUser.id,
    reason: 'Pre-Setup Day cancellation',
    now: date8Sep,
  }, env);
  assert.strictEqual(cancelResult.refundResult?.success, true, 'Refund successfully executed before Setup Day');
  console.log('  ✓ PASS: Case 1 - Before Setup Day: No automatic payment, cancellation and refund allowed');

  console.log('--- Case 2: Setup Day (9 Sep), Unpaid Event ---');
  // Event: 10 Sep, Current Date: 9 Sep (02:00 UTC) -> On Setup Day
  const date9Sep = new Date('2026-09-09T02:00:00.000Z');
  assert.strictEqual(isSetupDayStarted(testEventSep10, date9Sep), true, 'Setup day started on 9 Sep');

  // Top up org wallet so funds exist (proving worker will NOT silently auto-charge)
  await createTopup({
    organizationId: setupOrg.id,
    amount: 5000,
    referenceId: 'case2_wallet_funds',
  }, env);
  const balanceBeforeCase2 = await getWalletBalance(setupOrg.id, env);

  // Run lifecycle maintenance on Setup Day
  const maintCase2 = await runEventLifecycleMaintenance(env, date9Sep);
  assert.strictEqual(maintCase2.paidEvents.includes(sep10EventUnpaid.id), false, 'CRITICAL: Must NEVER auto-pay on Setup Day');

  // Verify wallet balance is completely unchanged
  const balanceAfterCase2 = await getWalletBalance(setupOrg.id, env);
  assert.strictEqual(balanceAfterCase2.paid_balance, balanceBeforeCase2.paid_balance, 'Wallet balance unchanged by maintenance');

  // Verify event status remains unpaid
  const sep10UnpaidAfterMaint = await getEventById(sep10EventUnpaid.id, env);
  assert.ok(
    sep10UnpaidAfterMaint?.payment_status === 'UNPAID' || sep10UnpaidAfterMaint?.payment_status === 'PENDING_PAYMENT',
    'Event payment status remains unpaid/pending_payment'
  );

  // Verify event is now strictly non-refundable and non-cancellable
  const cancelCheckSetupUnpaid = canCancelEvent(sep10UnpaidAfterMaint!, date9Sep);
  assert.strictEqual(cancelCheckSetupUnpaid.canCancel, false, 'Cancellation BLOCKED once Setup Day starts');
  assert.strictEqual(cancelCheckSetupUnpaid.code, 'SETUP_DAY_STARTED', 'Code is SETUP_DAY_STARTED');

  // Attempting to cancel must throw error
  let cancelSetupThrew = false;
  try {
    await cancelEvent(sep10EventUnpaid.id, {
      cancelledBy: testUser.id,
      reason: 'Trying to cancel on Setup Day',
      now: date9Sep,
    }, env);
  } catch (err: any) {
    cancelSetupThrew = true;
  }
  assert.strictEqual(cancelSetupThrew, true, 'cancelEvent must reject cancellation once Setup Day reached');

  // Verify Live URL remains blocked because event is unpaid
  const liveAccessSetupUnpaid = getClientLiveGameAccessDetails(sep10UnpaidAfterMaint!, date9Sep);
  assert.strictEqual(liveAccessSetupUnpaid.canAccess, false, 'Live URL must be blocked for unpaid event on Setup Day');
  assert.strictEqual(liveAccessSetupUnpaid.code, 'PAYMENT_REQUIRED', 'Reason is PAYMENT_REQUIRED');
  console.log('  ✓ PASS: Case 2 - Setup Day Unpaid: No auto-payment, wallet untouched, non-cancellable, Live URL blocked');

  console.log('--- Case 3: Setup Day (9 Sep), Paid Event ---');
  // Create an event that was explicitly paid by the user
  const sep10PaidEvent = await createEvent({
    organization_id: setupOrg.id,
    game_theme_id: setupTheme.id,
    name: 'Case 3 Explicitly Paid Event',
    event_date: '2026-09-10',
    start_date: '2026-09-10',
    end_date: '2026-09-11',
    starts_at: '2026-09-10T00:00:00.000Z',
    expires_at: '2026-09-11T23:59:59.000Z',
    currentDate: date8Sep,
  }, env);
  await processEventPayment({
    organizationId: setupOrg.id,
    eventId: sep10PaidEvent.id,
    paymentMode: 'FULL_PAID',
    eventName: sep10PaidEvent.name,
  }, env);

  const balanceBeforeCase3 = await getWalletBalance(setupOrg.id, env);

  // Run lifecycle maintenance on Setup Day
  const maintCase3 = await runEventLifecycleMaintenance(env, date9Sep);
  assert.strictEqual(maintCase3.paidEvents.includes(sep10PaidEvent.id), false, 'No re-payment attempted on paid event');

  const balanceAfterCase3 = await getWalletBalance(setupOrg.id, env);
  assert.strictEqual(balanceAfterCase3.paid_balance, balanceBeforeCase3.paid_balance, 'No additional wallet deduction');

  // Verify Live URL is available on Setup Day for paid event
  const sep10PaidRecord = await getEventById(sep10PaidEvent.id, env);
  const liveAccessSetupPaid = getClientLiveGameAccessDetails(sep10PaidRecord!, date9Sep);
  assert.strictEqual(liveAccessSetupPaid.canAccess, true, 'Live URL is available on Setup Day for paid event');

  // Verify cancellation and refunds are blocked once Setup Day starts
  const cancelCheckSetupPaid = canCancelEvent(sep10PaidRecord!, date9Sep);
  assert.strictEqual(cancelCheckSetupPaid.canCancel, false, 'Cancellation blocked for paid event on Setup Day');
  assert.strictEqual(cancelCheckSetupPaid.code, 'SETUP_DAY_STARTED', 'Code is SETUP_DAY_STARTED');
  console.log('  ✓ PASS: Case 3 - Setup Day Paid: No extra charge, Live URL available, refund/cancellation blocked');

  console.log('--- Case 4: Event Started (10 Sep), Unpaid Event ---');
  // Current date is 10 Sep (event has started), but event is still unpaid
  const date10Sep = new Date('2026-09-10T02:00:00.000Z');
  const balanceBeforeCase4 = await getWalletBalance(setupOrg.id, env);

  // Maintenance must NOT auto-charge
  const maintCase4 = await runEventLifecycleMaintenance(env, date10Sep);
  assert.strictEqual(maintCase4.paidEvents.includes(sep10EventUnpaid.id), false, 'No automatic payment even after event start');

  const balanceAfterCase4 = await getWalletBalance(setupOrg.id, env);
  assert.strictEqual(balanceAfterCase4.paid_balance, balanceBeforeCase4.paid_balance, 'Wallet not silently charged');

  // Live URL remains blocked
  const liveAccessStartedUnpaid = getClientLiveGameAccessDetails(sep10UnpaidAfterMaint!, date10Sep);
  assert.strictEqual(liveAccessStartedUnpaid.canAccess, false, 'Live URL remains blocked for unpaid event during event window');
  assert.strictEqual(liveAccessStartedUnpaid.code, 'PAYMENT_REQUIRED', 'Access code is PAYMENT_REQUIRED');

  // User can still make an explicit payment if needed
  const explicitPayResult = await processEventPayment({
    organizationId: setupOrg.id,
    eventId: sep10EventUnpaid.id,
    paymentMode: 'FULL_PAID',
    eventName: sep10EventUnpaid.name,
  }, env);
  assert.strictEqual(explicitPayResult.success, true, 'Explicit user payment is successful');

  const sep10PaidNow = await getEventById(sep10EventUnpaid.id, env);
  assert.strictEqual(sep10PaidNow?.payment_status, 'PAID', 'Event becomes PAID after explicit user action');

  // Now live game access opens
  const liveAccessAfterExplicitPay = getClientLiveGameAccessDetails(sep10PaidNow!, date10Sep);
  assert.strictEqual(liveAccessAfterExplicitPay.canAccess, true, 'Live game opens immediately after explicit payment');
  console.log('  ✓ PASS: Case 4 - Event Started Unpaid: Never auto-charged, Live URL blocked until explicit payment');

  console.log('--- Case 5: Event Ended (12 Sep), Unpaid Event Transitions to EXPIRED ---');
  // Create another unpaid event in its own org so no pending limits are hit
  const case5Org = await createOrganization({
    name: 'Case 5 Org',
    owner_id: testUser.id,
  }, env);
  const case5Theme = await createTheme({
    organization_id: case5Org.id,
    game_id: gameId,
    name: 'Case 5 Theme',
    slug: 'case-5-theme',
  }, env);
  const unpaidEventEndedTest = await createEvent({
    organization_id: case5Org.id,
    game_theme_id: case5Theme.id,
    name: 'Case 5 Unpaid Ended Event',
    event_date: '2026-09-10',
    start_date: '2026-09-10',
    end_date: '2026-09-11',
    starts_at: '2026-09-10T00:00:00.000Z',
    expires_at: '2026-09-11T23:59:59.000Z',
    currentDate: date8Sep,
  }, env);

  const date12Sep = new Date('2026-09-12T01:00:00.000Z');
  const balanceBeforeCase5 = await getWalletBalance(case5Org.id, env);

  // Run maintenance after end date
  const maintCase5 = await runEventLifecycleMaintenance(env, date12Sep);
  assert.ok(maintCase5.expiredEvents.includes(unpaidEventEndedTest.id), 'Unpaid event marked EXPIRED after end date');
  assert.strictEqual(maintCase5.paidEvents.includes(unpaidEventEndedTest.id), false, 'Never auto-charged on expiry');

  const balanceAfterCase5 = await getWalletBalance(case5Org.id, env);
  assert.strictEqual(balanceAfterCase5.paid_balance, balanceBeforeCase5.paid_balance, 'Wallet balance remains intact');

  const endedEventRecord = await getEventById(unpaidEventEndedTest.id, env);
  assert.strictEqual(endedEventRecord?.event_status, 'EXPIRED', 'Event status transitioned to EXPIRED');
  assert.strictEqual(endedEventRecord?.status, 'expired', 'Status transitioned to expired');
  console.log('  ✓ PASS: Case 5 - Event Ended Unpaid: Transitions to EXPIRED with 0 wallet charge');

  console.log('--- Case 6: Cron Runs Repeatedly (Idempotency & Zero Auto-Deductions) ---');
  // Create an unpaid event in a dedicated org for cron tests
  const cronOrg = await createOrganization({
    name: 'Cron Test Org',
    owner_id: testUser.id,
  }, env);
  const cronTheme = await createTheme({
    organization_id: cronOrg.id,
    game_id: gameId,
    name: 'Cron Theme',
    slug: 'cron-theme',
  }, env);
  const cronTestEvent = await createEvent({
    organization_id: cronOrg.id,
    game_theme_id: cronTheme.id,
    name: 'Case 6 Cron Repeat Test Event',
    event_date: '2026-09-15',
    start_date: '2026-09-15',
    end_date: '2026-09-16',
    starts_at: '2026-09-15T00:00:00.000Z',
    expires_at: '2026-09-16T23:59:59.000Z',
    currentDate: new Date('2026-09-14T01:00:00.000Z'),
  }, env);

  const date14Sep = new Date('2026-09-14T02:00:00.000Z');
  const balanceBeforeCron = await getWalletBalance(cronOrg.id, env);
  const txnCountBefore = (await getLedgerTransactions(cronOrg.id, env)).length;

  // Run maintenance 5 times consecutively simulating 1-minute crons
  for (let i = 1; i <= 5; i++) {
    const cronMaint = await runEventLifecycleMaintenance(env, date14Sep);
    assert.strictEqual(cronMaint.paidEvents.includes(cronTestEvent.id), false, `Run ${i}: Must not auto-pay`);
  }

  const balanceAfterCron = await getWalletBalance(cronOrg.id, env);
  const txnCountAfter = (await getLedgerTransactions(cronOrg.id, env)).length;

  assert.strictEqual(balanceAfterCron.paid_balance, balanceBeforeCron.paid_balance, 'Wallet balance remains strictly unchanged across cron runs');
  assert.strictEqual(txnCountAfter, txnCountBefore, 'Zero payment transactions created by cron runs');

  const cronEventAfter = await getEventById(cronTestEvent.id, env);
  assert.ok(
    cronEventAfter?.payment_status === 'UNPAID' || cronEventAfter?.payment_status === 'PENDING_PAYMENT',
    'Event payment status remains UNPAID or PENDING_PAYMENT'
  );
  console.log('  ✓ PASS: Case 6 - Cron Idempotency: Repeated maintenance runs never charge or change payment status');

  console.log('--- Case 7: Paid Event Expiry Transitions to COMPLETED ---');
  const case7Org = await createOrganization({
    name: 'Case 7 Org',
    owner_id: testUser.id,
  }, env);
  const case7Theme = await createTheme({
    organization_id: case7Org.id,
    game_id: gameId,
    name: 'Case 7 Theme',
    slug: 'case-7-theme',
  }, env);
  await createTopup({
    organizationId: case7Org.id,
    amount: 3000,
    referenceId: 'topup_case7_paid',
  }, env);
  const case7PaidEvent = await createEvent({
    organization_id: case7Org.id,
    game_theme_id: case7Theme.id,
    name: 'Case 7 Paid Event',
    event_date: '2026-09-15',
    start_date: '2026-09-15',
    end_date: '2026-09-16',
    starts_at: '2026-09-15T00:00:00.000Z',
    expires_at: '2026-09-16T23:59:59.000Z',
    currentDate: new Date('2026-09-14T01:00:00.000Z'),
  }, env);
  await processEventPayment({
    organizationId: case7Org.id,
    eventId: case7PaidEvent.id,
    paymentMode: 'FULL_PAID',
    eventName: case7PaidEvent.name,
  }, env);

  const date17Sep = new Date('2026-09-17T01:00:00.000Z');
  const maintCase7 = await runEventLifecycleMaintenance(env, date17Sep);
  assert.ok(maintCase7.completedEvents.includes(case7PaidEvent.id), 'Paid event transitioned to COMPLETED after end date');

  const paidEndedRecord = await getEventById(case7PaidEvent.id, env);
  assert.strictEqual(paidEndedRecord?.event_status, 'COMPLETED', 'Event status is COMPLETED');
  assert.strictEqual(paidEndedRecord?.status, 'completed', 'Status is completed');
  console.log('  ✓ PASS: Case 7 - Paid Event Expiry: Transitions to COMPLETED');

  console.log('\n======================================================');
  console.log(' ALL CRITICAL LIFECYCLE & REGRESSION TESTS PASSED!');
  console.log('======================================================\n');
}

runTests().catch((err) => {
  console.error('Lifecycle test error:', err);
  process.exit(1);
});
