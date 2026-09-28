import assert from 'node:assert';
import {
  canDeleteEvent,
  canCancelEvent,
  determineEventRefund,
  deleteEvent,
  cancelEvent,
  localEventsCache,
  getEventById,
} from './events';
import {
  createUser,
  createOrganization,
  addMember,
  createTheme,
  localUsersCache,
  localMembersCache,
  localThemesCache,
} from './index';
import {
  getWalletBalance,
  getLedgerTransactions,
  processEventPayment,
  refundEventPayment,
  localWalletsCache,
  createTopup,
} from './wallet';
import { signAppToken } from '../auth';
import worker from '../../worker';

console.log('======================================================');
console.log('Running Authoritative Event Deletion & Refund Policy Tests');
console.log('======================================================\n');

async function runAllTests() {
  const env = {
    JWT_SECRET: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    SUPABASE_URL: 'https://placeholder.supabase.co',
    SUPABASE_ANON_KEY: 'placeholder-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'placeholder-service-key',
    NODE_ENV: 'test',
  };

  // Setup user, org, and theme
  const owner = await createUser({ email: 'owner@test.com', name: 'Org Owner' }, env);
  const admin = await createUser({ email: 'admin@test.com', name: 'Org Admin' }, env);
  const designer = await createUser({ email: 'designer@test.com', name: 'Org Designer' }, env);
  const stranger = await createUser({ email: 'stranger@test.com', name: 'Stranger' }, env);

  const org = await createOrganization(
    { name: 'Policy Test Org', owner_id: owner.id, country_code: 'SG' },
    env
  );

  await addMember({ organization_id: org.id, user_id: admin.id, role: 'admin' }, env);
  await addMember({ organization_id: org.id, user_id: designer.id, role: 'designer' }, env);

  const ownerJwt = await signAppToken(owner.id, org.id, 'owner', undefined, env);
  const designerJwt = await signAppToken(designer.id, org.id, 'designer', undefined, env);
  const strangerJwt = await signAppToken(stranger.id, undefined, undefined, undefined, env);

  const theme = await createTheme(
    {
      organization_id: org.id,
      name: 'Test Catch Brand Theme',
      game_id: 'catch-brand',
    },
    env
  );

  // Helper to create events in local memory cache
  let eventSeq = 1;
  function createTestEvent(overrides: Record<string, any>) {
    const id = `ev-policy-${eventSeq++}`;
    const base = {
      id,
      organization_id: org.id,
      game_id: 'catch-brand',
      game_theme_id: theme.id,
      name: `Policy Event ${id}`,
      start_date: '2026-10-10',
      end_date: '2026-10-11',
      starts_at: '2026-10-09T16:00:00.000Z', // 2026-10-10 00:00:00 SGT
      expires_at: '2026-10-11T15:59:59.999Z', // 2026-10-11 23:59:59.999 SGT
      status: 'scheduled',
      event_status: 'SCHEDULED',
      payment_status: 'UNPAID',
      paid_amount: 0,
      discount_amount: 0,
      event_price: 1900,
      event_currency: 'MYR',
      public_token: `TOK${id.replace(/-/g, '')}`,
      event_timezone: 'Asia/Singapore',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const ev = { ...base, ...overrides };
    localEventsCache.set(id, ev as any);
    return ev;
  }

  // Current date for test baseline: 2026-10-01 (well before Setup Day 2026-10-09)
  const dateBeforeSetup = new Date('2026-10-01T10:00:00.000Z');
  // Setup Day date: 2026-10-09 (Singapore date 2026-10-09 is 1 day before start_date 2026-10-10)
  const dateOnSetup = new Date('2026-10-09T04:00:00.000Z');
  // Live date: 2026-10-10
  const dateLive = new Date('2026-10-10T04:00:00.000Z');
  // Completed / Expired date: 2026-10-12
  const dateAfterEnd = new Date('2026-10-12T04:00:00.000Z');

  console.log('--- SECTION 1: EVENT DELETION MATRIX TESTS ---');

  // Test 1: unpaid + before Setup Day -> DELETE ALLOWED
  const ev1 = createTestEvent({
    payment_status: 'UNPAID',
    paid_amount: 0,
  });
  const del1 = canDeleteEvent(ev1, dateBeforeSetup);
  assert.strictEqual(del1.canDelete, true, 'Test 1: Unpaid before Setup Day must be deletable');
  assert.strictEqual(del1.code, 'ELIGIBLE_FOR_DELETION');
  await deleteEvent(ev1.id, { now: dateBeforeSetup }, env);
  assert.strictEqual(localEventsCache.has(ev1.id), false, 'Test 1: Event must be deleted from storage');
  console.log('  ✓ 1. unpaid + before Setup Day → SUCCESS');

  // Test 2: paid + before Setup Day -> DELETE REJECTED
  const ev2 = createTestEvent({
    payment_status: 'PAID',
    paid_amount: 1900,
  });
  const del2 = canDeleteEvent(ev2, dateBeforeSetup);
  assert.strictEqual(del2.canDelete, false, 'Test 2: Paid before Setup Day cannot be deleted');
  assert.strictEqual(del2.code, 'EVENT_PAID');
  await assert.rejects(
    async () => deleteEvent(ev2.id, { now: dateBeforeSetup }, env),
    /This paid event cannot be deleted/
  );
  console.log('  ✓ 2. paid + before Setup Day → DELETE REJECTED');

  // Test 3: unpaid + Setup Day -> DELETE REJECTED
  const ev3 = createTestEvent({
    payment_status: 'UNPAID',
    paid_amount: 0,
  });
  const del3 = canDeleteEvent(ev3, dateOnSetup);
  assert.strictEqual(del3.canDelete, false, 'Test 3: Unpaid on Setup Day cannot be deleted');
  assert.strictEqual(del3.code, 'SETUP_DAY_STARTED');
  await assert.rejects(
    async () => deleteEvent(ev3.id, { now: dateOnSetup }, env),
    /Setup Day has started/
  );
  console.log('  ✓ 3. unpaid + Setup Day → DELETE REJECTED');

  // Test 4: paid + Setup Day -> DELETE REJECTED
  const ev4 = createTestEvent({
    payment_status: 'PAID',
    paid_amount: 1900,
  });
  const del4 = canDeleteEvent(ev4, dateOnSetup);
  assert.strictEqual(del4.canDelete, false, 'Test 4: Paid on Setup Day cannot be deleted');
  assert.strictEqual(del4.code, 'SETUP_DAY_STARTED');
  await assert.rejects(
    async () => deleteEvent(ev4.id, { now: dateOnSetup }, env),
    /Setup Day has started/
  );
  console.log('  ✓ 4. paid + Setup Day → DELETE REJECTED');

  // Test 5: paid + LIVE -> DELETE REJECTED
  const ev5 = createTestEvent({
    payment_status: 'PAID',
    paid_amount: 1900,
    status: 'live',
    event_status: 'LIVE',
  });
  const del5 = canDeleteEvent(ev5, dateLive);
  assert.strictEqual(del5.canDelete, false, 'Test 5: Live event cannot be deleted');
  assert.strictEqual(del5.code, 'EVENT_LIVE');
  await assert.rejects(
    async () => deleteEvent(ev5.id, { now: dateLive }, env),
    /live event cannot be deleted/
  );
  console.log('  ✓ 5. paid + LIVE → DELETE REJECTED');

  // Test 6: paid + COMPLETED -> DELETE REJECTED
  const ev6 = createTestEvent({
    payment_status: 'PAID',
    paid_amount: 1900,
    status: 'completed',
    event_status: 'COMPLETED',
  });
  const del6 = canDeleteEvent(ev6, dateAfterEnd);
  assert.strictEqual(del6.canDelete, false, 'Test 6: Completed event cannot be deleted');
  assert.strictEqual(del6.code, 'EVENT_ENDED');
  await assert.rejects(
    async () => deleteEvent(ev6.id, { now: dateAfterEnd }, env),
    /event has ended and cannot be deleted/
  );
  console.log('  ✓ 6. paid + COMPLETED → DELETE REJECTED');

  // Test 7: unpaid + EXPIRED -> DELETE REJECTED
  const ev7 = createTestEvent({
    payment_status: 'UNPAID',
    paid_amount: 0,
    status: 'expired',
    event_status: 'EXPIRED',
  });
  const del7 = canDeleteEvent(ev7, dateAfterEnd);
  assert.strictEqual(del7.canDelete, false, 'Test 7: Expired unpaid event cannot be deleted');
  assert.strictEqual(del7.code, 'EVENT_ENDED');
  await assert.rejects(
    async () => deleteEvent(ev7.id, { now: dateAfterEnd }, env),
    /event has ended and cannot be deleted/
  );
  console.log('  ✓ 7. unpaid + EXPIRED → DELETE REJECTED');

  // Test 8: paid + EXPIRED -> DELETE REJECTED
  const ev8 = createTestEvent({
    payment_status: 'PAID',
    paid_amount: 1900,
    status: 'expired',
    event_status: 'COMPLETED',
  });
  const del8 = canDeleteEvent(ev8, dateAfterEnd);
  assert.strictEqual(del8.canDelete, false, 'Test 8: Expired paid event cannot be deleted');
  assert.strictEqual(del8.code, 'EVENT_ENDED');
  await assert.rejects(
    async () => deleteEvent(ev8.id, { now: dateAfterEnd }, env),
    /event has ended and cannot be deleted/
  );
  console.log('  ✓ 8. paid + EXPIRED → DELETE REJECTED');

  // Test 9: CANCELLED -> DELETE REJECTED
  const ev9 = createTestEvent({
    payment_status: 'REFUNDED',
    paid_amount: 1900,
    status: 'cancelled',
    event_status: 'CANCELLED',
    cancel_reason: 'USER_CANCELLED',
  });
  const del9 = canDeleteEvent(ev9, dateBeforeSetup);
  assert.strictEqual(del9.canDelete, false, 'Test 9: Cancelled event cannot be deleted');
  assert.strictEqual(del9.code, 'ALREADY_CANCELLED');
  await assert.rejects(
    async () => deleteEvent(ev9.id, { now: dateBeforeSetup }, env),
    /Cancelled events cannot be deleted/
  );
  console.log('  ✓ 9. CANCELLED → DELETE REJECTED');

  console.log('\n--- SECTION 2: CANCELLATION & REFUND MATRIX TESTS ---');

  // Setup wallet topup for payment tests
  await createTopup({
    organizationId: org.id,
    amount: 10000,
    referenceId: 'topup_policy_test_01',
    description: 'Topup for policy test',
  }, env);

  // Test 10: paid + before Setup Day -> SUCCESS
  const ev10 = createTestEvent({
    payment_status: 'UNPAID',
    event_price: 1900,
  });
  await processEventPayment({
    organizationId: org.id,
    eventId: ev10.id,
    eventName: ev10.name,
    paymentMode: 'FULL_PAID',
  }, env);
  const ev10Paid = await getEventById(ev10.id, env);
  assert.strictEqual(ev10Paid?.payment_status, 'PAID');

  const cancelCheck10 = canCancelEvent(ev10Paid, dateBeforeSetup);
  assert.strictEqual(cancelCheck10.canCancel, true, 'Test 10: Paid event before Setup Day can be cancelled');
  assert.strictEqual(cancelCheck10.canRefund, true, 'Test 10: Paid event before Setup Day is eligible for refund');

  const balanceBefore10 = await getWalletBalance(org.id, env);
  const cancelRes10 = await cancelEvent(ev10.id, { now: dateBeforeSetup, reason: 'Testing cancellation' }, env);
  assert.strictEqual(cancelRes10.status, 'cancelled');
  assert.strictEqual(cancelRes10.event_status, 'CANCELLED');
  assert.strictEqual(cancelRes10.payment_status, 'REFUNDED');

  const balanceAfter10 = await getWalletBalance(org.id, env);
  assert.strictEqual(
    balanceAfter10.paid_balance,
    balanceBefore10.paid_balance + 1900,
    'Test 10: Paid balance must be refunded exactly RM1900'
  );
  console.log('  ✓ 10. paid + before Setup Day → SUCCESS (refunded to wallet ledger)');

  // Test 11: unpaid + before Setup Day -> refund/cancel rejected
  const ev11 = createTestEvent({
    payment_status: 'UNPAID',
    paid_amount: 0,
  });
  const cancelCheck11 = canCancelEvent(ev11, dateBeforeSetup);
  assert.strictEqual(cancelCheck11.canCancel, false, 'Test 11: Unpaid event cannot be cancelled/refunded');
  assert.strictEqual(cancelCheck11.code, 'EVENT_NOT_PAID');
  await assert.rejects(
    async () => cancelEvent(ev11.id, { now: dateBeforeSetup }, env),
    /Unpaid events cannot be cancelled or refunded/
  );
  console.log('  ✓ 11. unpaid + before Setup Day → refund rejected');

  // Test 12: paid + Setup Day -> refund rejected
  const ev12 = createTestEvent({
    payment_status: 'PAID',
    paid_amount: 1900,
  });
  const cancelCheck12 = canCancelEvent(ev12, dateOnSetup);
  assert.strictEqual(cancelCheck12.canCancel, false, 'Test 12: Cannot cancel on Setup Day');
  assert.strictEqual(cancelCheck12.canRefund, false);
  assert.strictEqual(cancelCheck12.code, 'SETUP_DAY_STARTED');
  await assert.rejects(
    async () => cancelEvent(ev12.id, { now: dateOnSetup }, env),
    /Once Setup Day starts, cancellation and refunds are not allowed/
  );
  console.log('  ✓ 12. paid + Setup Day → refund rejected');

  // Test 13: paid + LIVE -> refund rejected
  const ev13 = createTestEvent({
    payment_status: 'PAID',
    paid_amount: 1900,
    status: 'live',
    event_status: 'LIVE',
  });
  const cancelCheck13 = canCancelEvent(ev13, dateLive);
  assert.strictEqual(cancelCheck13.canCancel, false, 'Test 13: Cannot cancel during live window');
  assert.strictEqual(cancelCheck13.canRefund, false);
  await assert.rejects(
    async () => cancelEvent(ev13.id, { now: dateLive }, env),
    /cannot be cancelled/
  );
  console.log('  ✓ 13. paid + LIVE → refund rejected');

  // Test 14: paid + COMPLETED -> refund rejected
  const ev14 = createTestEvent({
    payment_status: 'PAID',
    paid_amount: 1900,
    status: 'completed',
    event_status: 'COMPLETED',
  });
  const cancelCheck14 = canCancelEvent(ev14, dateAfterEnd);
  assert.strictEqual(cancelCheck14.canCancel, false, 'Test 14: Cannot cancel completed event');
  assert.strictEqual(cancelCheck14.canRefund, false);
  assert.strictEqual(cancelCheck14.code, 'EVENT_COMPLETED');
  await assert.rejects(
    async () => cancelEvent(ev14.id, { now: dateAfterEnd }, env),
    /Completed or expired events cannot be cancelled/
  );
  console.log('  ✓ 14. paid + COMPLETED → refund rejected');

  // Test 15: paid + EXPIRED -> refund rejected
  const ev15 = createTestEvent({
    payment_status: 'PAID',
    paid_amount: 1900,
    status: 'expired',
    event_status: 'COMPLETED',
  });
  const cancelCheck15 = canCancelEvent(ev15, dateAfterEnd);
  assert.strictEqual(cancelCheck15.canCancel, false, 'Test 15: Cannot cancel expired event');
  assert.strictEqual(cancelCheck15.canRefund, false);
  assert.strictEqual(cancelCheck15.code, 'EVENT_COMPLETED');
  await assert.rejects(
    async () => cancelEvent(ev15.id, { now: dateAfterEnd }, env),
    /Completed or expired events cannot be cancelled/
  );
  console.log('  ✓ 15. paid + EXPIRED → refund rejected');

  // Test 16: already CANCELLED -> second refund rejected
  const ev16 = createTestEvent({
    payment_status: 'REFUNDED',
    paid_amount: 1900,
    status: 'cancelled',
    event_status: 'CANCELLED',
    cancel_reason: 'USER_CANCELLED',
  });
  const cancelCheck16 = canCancelEvent(ev16, dateBeforeSetup);
  assert.strictEqual(cancelCheck16.canCancel, false, 'Test 16: Already cancelled event cannot be cancelled again');
  assert.strictEqual(cancelCheck16.canRefund, false);
  assert.strictEqual(cancelCheck16.code, 'ALREADY_CANCELLED');
  await assert.rejects(
    async () => cancelEvent(ev16.id, { now: dateBeforeSetup }, env),
    /Event is already cancelled/
  );
  console.log('  ✓ 16. already CANCELLED → second refund rejected');

  console.log('\n--- SECTION 3: HTTP API & SECURITY GUARDS TESTS ---');

  // Test 17: unauthorized user (no JWT) -> rejected 401
  const evSec = createTestEvent({ payment_status: 'UNPAID', paid_amount: 0 });
  const noAuthDelRes = await worker.fetch(
    new Request(`https://api.eventgamestudio.local/api/events/${evSec.id}`, {
      method: 'DELETE',
    }),
    env
  );
  assert.strictEqual(noAuthDelRes.status, 401, 'Test 17: Direct DELETE without token must return 401');

  const noAuthCancelRes = await worker.fetch(
    new Request(`https://api.eventgamestudio.local/api/events/${evSec.id}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'No auth' }),
    }),
    env
  );
  assert.strictEqual(noAuthCancelRes.status, 401, 'Test 17: Direct Cancel without token must return 401');
  console.log('  ✓ 17. unauthorized user → rejected (401 Unauthorized)');

  // Test 18: stranger / member without event.manage permission -> rejected 403
  const strangerDelRes = await worker.fetch(
    new Request(`https://api.eventgamestudio.local/api/events/${evSec.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${strangerJwt}` },
    }),
    env
  );
  assert.strictEqual(strangerDelRes.status, 403, 'Test 18: Stranger DELETE must return 403');

  const designerDelRes = await worker.fetch(
    new Request(`https://api.eventgamestudio.local/api/events/${evSec.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${designerJwt}` },
    }),
    env
  );
  assert.strictEqual(designerDelRes.status, 403, 'Test 18: Designer DELETE must return 403');
  console.log('  ✓ 18. organization member without event.manage → rejected (403 Forbidden)');

  // Test 19: direct API DELETE request on paid event -> same lifecycle protection (422)
  const evPaidApi = createTestEvent({
    payment_status: 'PAID',
    paid_amount: 1900,
  });
  const apiDelPaidRes = await worker.fetch(
    new Request(`https://api.eventgamestudio.local/api/events/${evPaidApi.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${ownerJwt}` },
    }),
    env
  );
  assert.strictEqual(apiDelPaidRes.status, 422, 'Test 19: Direct API DELETE on paid event must return 422');
  const apiDelPaidData = await apiDelPaidRes.json() as any;
  assert.strictEqual(apiDelPaidData.code, 'EVENT_PAID');
  assert.match(apiDelPaidData.error, /This paid event cannot be deleted/);
  console.log('  ✓ 19. direct API DELETE request → same lifecycle protection (422 EVENT_PAID)');

  // Test 20: direct API refund/cancel request on unpaid event -> rejected (422)
  const evUnpaidApi = createTestEvent({
    payment_status: 'UNPAID',
    paid_amount: 0,
  });
  const apiCancelUnpaidRes = await worker.fetch(
    new Request(`https://api.eventgamestudio.local/api/events/${evUnpaidApi.id}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerJwt}`,
      },
      body: JSON.stringify({ reason: 'Cancel unpaid' }),
    }),
    env
  );
  assert.strictEqual(apiCancelUnpaidRes.status, 422, 'Test 20: Direct API cancel on unpaid event must return 422');
  const apiCancelUnpaidData = await apiCancelUnpaidRes.json() as any;
  assert.strictEqual(apiCancelUnpaidData.code, 'EVENT_NOT_PAID');
  console.log('  ✓ 20. direct API refund request → same lifecycle protection (422 EVENT_NOT_PAID)');

  console.log('\n--- SECTION 4: CONCURRENCY & RACE-CONDITION TEST ---');

  // Test 21: Two simultaneous cancellation/refund requests
  const evRace = createTestEvent({
    payment_status: 'UNPAID',
    event_price: 1400,
  });
  await processEventPayment({
    organizationId: org.id,
    eventId: evRace.id,
    eventName: evRace.name,
    paymentMode: 'FULL_PAID',
  }, env);

  const balanceBeforeRace = await getWalletBalance(org.id, env);

  // Send Request A and Request B concurrently
  const [resultA, resultB] = await Promise.allSettled([
    cancelEvent(evRace.id, { now: dateBeforeSetup, reason: 'Concurrent request A' }, env),
    cancelEvent(evRace.id, { now: dateBeforeSetup, reason: 'Concurrent request B' }, env),
  ]);

  // Exactly one must succeed, and exactly one must fail with ALREADY_CANCELLED
  const successfulRuns = [resultA, resultB].filter((r) => r.status === 'fulfilled');
  const rejectedRuns = [resultA, resultB].filter((r) => r.status === 'rejected');

  assert.strictEqual(successfulRuns.length, 1, 'Test 21: Exactly ONE concurrent cancellation request must succeed');
  assert.strictEqual(rejectedRuns.length, 1, 'Test 21: Exactly ONE concurrent cancellation request must be rejected');

  const rejectedError = (rejectedRuns[0] as PromiseRejectedResult).reason;
  assert.strictEqual(rejectedError.code, 'ALREADY_CANCELLED', 'Test 21: Second request must be rejected with ALREADY_CANCELLED');

  const balanceAfterRace = await getWalletBalance(org.id, env);
  assert.strictEqual(
    balanceAfterRace.paid_balance,
    balanceBeforeRace.paid_balance + 1400,
    'Test 21: Wallet balance must be credited exactly once (no double refund)'
  );

  const ledgerAfterRace = await getLedgerTransactions(org.id, env);
  const refundTxns = ledgerAfterRace.filter((t) => t.event_id === evRace.id && t.transaction_type === 'REFUND');
  assert.strictEqual(refundTxns.length, 1, 'Test 21: Ledger must contain exactly 1 refund transaction');
  console.log('  ✓ 21. race-condition: 2 parallel requests → exactly 1 refund, 1 cancellation, 0 duplicate txns');

  console.log('\n======================================================');
  console.log('ALL 21 EVENT DELETION & REFUND POLICY TESTS PASSED!');
  console.log('======================================================');
}

runAllTests().catch((err) => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
