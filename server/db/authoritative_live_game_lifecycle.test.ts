import assert from 'node:assert';
import {
  calculateEventStatus,
  deriveEventLifecycleStatus,
  isEventExplicitlyCancelled,
  canAccessLiveEvent,
  canAccessClientLiveGame,
  getClientLiveGameAccessDetails,
} from '../../src/lib/dateUtils';
import {
  isEventExplicitlyCancelled as serverIsExplicitlyCancelled,
  canAccessLiveEvent as serverCanAccessLiveEvent,
  canAccessClientLiveGame as serverCanAccessClientLiveGame,
  getClientLiveGameAccessDetails as serverGetClientLiveGameAccessDetails,
  deriveEventLifecycleStatus as serverDeriveEventLifecycleStatus,
  calculateEventStatus as serverCalculateEventStatus,
} from './events.js';

console.log('================================================================');
console.log('AUTHORITATIVE LIVE GAME LIFECYCLE & ACCESS BUSINESS RULE TESTS');
console.log('================================================================\n');

// -----------------------------------------------------------------------------
// SCENARIO MATRIX: Event 2-Sep to 3-Sep (Setup Day: 1-Sep)
// -----------------------------------------------------------------------------
const event2To3SepPaid = {
  id: 'event-sep-2-3-paid',
  name: 'Sep 2-3 Carnival (Paid)',
  start_date: '2026-09-02',
  end_date: '2026-09-03',
  event_date: '2026-09-02',
  payment_status: 'PAID',
  paid_amount: 1900,
  status: 'scheduled',
};

const event2To3SepUnpaid = {
  id: 'event-sep-2-3-unpaid',
  name: 'Sep 2-3 Carnival (Unpaid)',
  start_date: '2026-09-02',
  end_date: '2026-09-03',
  event_date: '2026-09-02',
  payment_status: 'PENDING',
  paid_amount: 0,
  status: 'pending_payment',
};

const event2To3SepPaymentExpired = {
  id: 'event-sep-2-3-pay-expired',
  name: 'Sep 2-3 Carnival (Payment Expired)',
  start_date: '2026-09-02',
  end_date: '2026-09-03',
  event_date: '2026-09-02',
  payment_status: 'EXPIRED',
  paid_amount: 0,
  status: 'pending_payment',
};

// Test dates:
const dateAug31 = new Date('2026-08-31T12:00:00.000Z'); // Before setup day
const dateSep01 = new Date('2026-09-01T12:00:00.000Z'); // Setup day (1-Sep)
const dateSep02 = new Date('2026-09-02T12:00:00.000Z'); // Start date (2-Sep)
const dateSep03 = new Date('2026-09-03T12:00:00.000Z'); // End date (3-Sep)
const dateSep04 = new Date('2026-09-04T12:00:00.000Z'); // After end date (4-Sep)

console.log('--- TEST 1: Before Setup Day (31-Aug) ---');
{
  const paidDetails = getClientLiveGameAccessDetails(event2To3SepPaid, dateAug31);
  assert.strictEqual(paidDetails.canAccess, false);
  assert.strictEqual(paidDetails.code, 'EVENT_NOT_OPEN');
  assert.strictEqual(paidDetails.is_scheduled, true);
  assert.strictEqual(isEventExplicitlyCancelled(event2To3SepPaid), false);
  console.log('✓ 31-Aug Paid: EVENT_NOT_OPEN, is_scheduled = true, NOT cancelled');

  const unpaidDetails = getClientLiveGameAccessDetails(event2To3SepUnpaid, dateAug31);
  assert.strictEqual(unpaidDetails.canAccess, false);
  assert.strictEqual(isEventExplicitlyCancelled(event2To3SepUnpaid), false);
  console.log('✓ 31-Aug Unpaid: NOT cancelled');
}

console.log('\n--- TEST 2: Setup Day (1-Sep) ---');
{
  // 1-Sep: unpaid => Live Game BLOCKED
  const unpaidDetails = getClientLiveGameAccessDetails(event2To3SepUnpaid, dateSep01);
  assert.strictEqual(unpaidDetails.canAccess, false, '1-Sep unpaid must be blocked');
  assert.strictEqual(unpaidDetails.code, 'PAYMENT_REQUIRED', '1-Sep unpaid code must be PAYMENT_REQUIRED');
  assert.strictEqual(unpaidDetails.is_pending_payment, true);
  assert.strictEqual(isEventExplicitlyCancelled(event2To3SepUnpaid), false, '1-Sep unpaid must NOT be cancelled');
  console.log('✓ 1-Sep Unpaid: Live Game BLOCKED (PAYMENT_REQUIRED), NOT cancelled');

  // 1-Sep: paid => Live Game AVAILABLE
  const paidDetails = getClientLiveGameAccessDetails(event2To3SepPaid, dateSep01);
  assert.strictEqual(paidDetails.canAccess, true, '1-Sep paid must be accessible');
  assert.strictEqual(canAccessLiveEvent(event2To3SepPaid, dateSep01), true);
  assert.strictEqual(isEventExplicitlyCancelled(event2To3SepPaid), false);
  console.log('✓ 1-Sep Paid: Live Game AVAILABLE');
}

console.log('\n--- TEST 3: Start Date (2-Sep) ---');
{
  // 2-Sep: unpaid => Live Game BLOCKED
  const unpaidDetails = getClientLiveGameAccessDetails(event2To3SepUnpaid, dateSep02);
  assert.strictEqual(unpaidDetails.canAccess, false, '2-Sep unpaid must be blocked');
  assert.strictEqual(unpaidDetails.code, 'PAYMENT_REQUIRED', '2-Sep unpaid code must be PAYMENT_REQUIRED');
  assert.strictEqual(isEventExplicitlyCancelled(event2To3SepUnpaid), false, '2-Sep unpaid must NOT be cancelled');
  console.log('✓ 2-Sep Unpaid: Live Game BLOCKED (PAYMENT_REQUIRED), NOT cancelled');

  // 2-Sep: paid => Live Game AVAILABLE
  const paidDetails = getClientLiveGameAccessDetails(event2To3SepPaid, dateSep02);
  assert.strictEqual(paidDetails.canAccess, true, '2-Sep paid must be accessible');
  assert.strictEqual(canAccessLiveEvent(event2To3SepPaid, dateSep02), true);
  assert.strictEqual(isEventExplicitlyCancelled(event2To3SepPaid), false);
  console.log('✓ 2-Sep Paid: Live Game AVAILABLE');
}

console.log('\n--- TEST 4: End Date (3-Sep) ---');
{
  // 3-Sep: unpaid => Live Game BLOCKED
  const unpaidDetails = getClientLiveGameAccessDetails(event2To3SepUnpaid, dateSep03);
  assert.strictEqual(unpaidDetails.canAccess, false, '3-Sep unpaid must be blocked');
  assert.strictEqual(unpaidDetails.code, 'PAYMENT_REQUIRED', '3-Sep unpaid code must be PAYMENT_REQUIRED');
  assert.strictEqual(isEventExplicitlyCancelled(event2To3SepUnpaid), false, '3-Sep unpaid must NOT be cancelled');
  console.log('✓ 3-Sep Unpaid: Live Game BLOCKED (PAYMENT_REQUIRED), NOT cancelled');

  // 3-Sep: paid => Live Game AVAILABLE
  const paidDetails = getClientLiveGameAccessDetails(event2To3SepPaid, dateSep03);
  assert.strictEqual(paidDetails.canAccess, true, '3-Sep paid must be accessible');
  assert.strictEqual(canAccessLiveEvent(event2To3SepPaid, dateSep03), true);
  assert.strictEqual(isEventExplicitlyCancelled(event2To3SepPaid), false);
  console.log('✓ 3-Sep Paid: Live Game AVAILABLE');
}

console.log('\n--- TEST 5: After End Date (4-Sep onwards) ---');
{
  // After 3-Sep: => Live Game CLOSED regardless of payment.
  const paidDetails = getClientLiveGameAccessDetails(event2To3SepPaid, dateSep04);
  assert.strictEqual(paidDetails.canAccess, false, 'After 3-Sep paid event Live Game must be closed');
  assert.ok(paidDetails.code === 'EVENT_COMPLETED' || paidDetails.code === 'EVENT_EXPIRED');
  assert.strictEqual(paidDetails.is_expired, true);
  assert.strictEqual(isEventExplicitlyCancelled(event2To3SepPaid), false, 'Expired paid event is NOT cancelled');
  console.log('✓ 4-Sep Paid: Live Game CLOSED (EVENT_EXPIRED), NOT cancelled');

  const unpaidDetails = getClientLiveGameAccessDetails(event2To3SepUnpaid, dateSep04);
  assert.strictEqual(unpaidDetails.canAccess, false, 'After 3-Sep unpaid event Live Game must be closed');
  assert.strictEqual(unpaidDetails.code, 'EVENT_EXPIRED');
  assert.strictEqual(unpaidDetails.is_expired, true);
  assert.strictEqual(isEventExplicitlyCancelled(event2To3SepUnpaid), false, 'Expired unpaid event is NOT cancelled');
  console.log('✓ 4-Sep Unpaid: Live Game CLOSED (EVENT_EXPIRED), NOT cancelled');

  const payExpiredDetails = getClientLiveGameAccessDetails(event2To3SepPaymentExpired, dateSep04);
  assert.strictEqual(payExpiredDetails.canAccess, false);
  assert.strictEqual(payExpiredDetails.code, 'EVENT_EXPIRED');
  assert.strictEqual(isEventExplicitlyCancelled(event2To3SepPaymentExpired), false, 'Payment expired is NOT cancelled');
  console.log('✓ 4-Sep Payment Expired: Live Game CLOSED (EVENT_EXPIRED), NOT cancelled');
}

console.log('\n--- TEST 6: Authoritative Separation of Statuses ---');
{
  // Payment statuses: PENDING, PAID, EXPIRED, REFUNDED
  // Event status must NOT automatically become CANCELLED because:
  // - payment is unpaid
  // - payment becomes EXPIRED
  // - event end date has passed
  // - Live Game access is closed

  // 1. Unpaid event
  assert.strictEqual(isEventExplicitlyCancelled({ payment_status: 'PENDING' }), false);
  assert.strictEqual(isEventExplicitlyCancelled({ payment_status: 'UNPAID' }), false);

  // 2. Payment becomes EXPIRED
  assert.strictEqual(isEventExplicitlyCancelled({ payment_status: 'EXPIRED' }), false);

  // 3. Automated PAYMENT_TIMEOUT cancel_reason
  assert.strictEqual(isEventExplicitlyCancelled({ cancel_reason: 'PAYMENT_TIMEOUT' }), false);

  // 4. Past end date
  assert.strictEqual(isEventExplicitlyCancelled({ end_date: '2020-01-01', status: 'expired' }), false);

  // 5. Legacy status === 'cancelled' without explicit user/admin reason
  assert.strictEqual(isEventExplicitlyCancelled({ status: 'cancelled', payment_status: 'PENDING' }), false);
  assert.strictEqual(isEventExplicitlyCancelled({ status: 'cancelled', event_status: 'CANCELLED', payment_status: 'UNPAID' }), false);

  // 6. Explicit USER_CANCELLED or ADMIN_CANCELLED
  assert.strictEqual(isEventExplicitlyCancelled({ cancel_reason: 'USER_CANCELLED' }), true);
  assert.strictEqual(isEventExplicitlyCancelled({ cancel_reason: 'ADMIN_CANCELLED' }), true);
  assert.strictEqual(isEventExplicitlyCancelled({ cancel_reason: 'ORGANIZER_REQUESTED_CANCELLATION' }), true);

  console.log('✓ Verified: Event status is completely decoupled from payment and date status');
}

console.log('\n--- TEST 7: Client & Server Helpers Exact Parity ---');
{
  // Server helpers must match client helpers exactly
  assert.strictEqual(
    serverIsExplicitlyCancelled(event2To3SepUnpaid),
    isEventExplicitlyCancelled(event2To3SepUnpaid)
  );
  assert.strictEqual(
    serverCanAccessLiveEvent(event2To3SepPaid, dateSep02),
    canAccessLiveEvent(event2To3SepPaid, dateSep02)
  );
  assert.deepStrictEqual(
    serverGetClientLiveGameAccessDetails(event2To3SepUnpaid, dateSep02),
    getClientLiveGameAccessDetails(event2To3SepUnpaid, dateSep02)
  );
  assert.deepStrictEqual(
    serverGetClientLiveGameAccessDetails(event2To3SepPaid, dateSep04),
    getClientLiveGameAccessDetails(event2To3SepPaid, dateSep04)
  );
  console.log('✓ Parity confirmed between src/lib/dateUtils and server/db/events.ts');
}

console.log('\n================================================================');
console.log('ALL AUTHORITATIVE BUSINESS RULE TESTS PASSED SUCCESSFULLY!');
console.log('================================================================');
