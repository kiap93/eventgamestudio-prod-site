import assert from 'node:assert';
import {
  calculateEventStatus,
  canAccessLiveEvent,
  deriveEventLifecycleStatus,
  isEventExplicitlyCancelled,
  getNormalizedEventDates,
  getNormalizedCurrentDate,
} from '../../src/lib/dateUtils';

console.log('======================================================');
console.log('RUNNING DATE-ONLY LIFECYCLE & USER CASE VERIFICATION');
console.log('======================================================');

// The exact case reported by user:
// Event Date: 07 Sep 2026 -> 07 Sep 2026
// Payment: RM 320.00 Paid
// Current date: 07 Sep 2026
// Expected UI status: LIVE (not CANCELLED, not CONCLUDED)

const sep7Event = {
  id: 'test-sep-7-event',
  name: 'Sep 7 Corporate Carnival',
  start_date: '2026-09-07',
  end_date: '2026-09-07',
  event_date: '2026-09-07',
  starts_at: '2026-09-07T00:00:00.000Z',
  expires_at: '2026-09-07T23:59:59.999Z',
  payment_status: 'PAID',
  paid_amount: 320,
  status: 'scheduled',
};

// 1. On 07 Sep 2026:
const nowSep7 = new Date('2026-09-07T12:00:00.000Z');
console.log('--- TEST 1: User Reported Case on 07 Sep 2026 ---');
const statusOnSep7 = calculateEventStatus(sep7Event, nowSep7);
const lifecycleOnSep7 = deriveEventLifecycleStatus(sep7Event, nowSep7);
const isCancelledOnSep7 = isEventExplicitlyCancelled(sep7Event);
const canAccessOnSep7 = canAccessLiveEvent(sep7Event, nowSep7);

console.log('Status on Sep 7:', statusOnSep7);
console.log('Lifecycle on Sep 7:', lifecycleOnSep7);
console.log('Is cancelled?:', isCancelledOnSep7);
console.log('Can access live?:', canAccessOnSep7);

assert.strictEqual(statusOnSep7, 'live', 'Status must be live on event date');
assert.strictEqual(lifecycleOnSep7, 'LIVE', 'Lifecycle status must be LIVE on event date');
assert.strictEqual(isCancelledOnSep7, false, 'Paid active event must NOT be cancelled');
assert.strictEqual(canAccessOnSep7, true, 'Live access must be granted');
console.log('✓ PASS: User reported case is LIVE and playable on 07 Sep 2026\n');

// 2. Before event date (06 Sep 2026):
console.log('--- TEST 2: Before Event Date (06 Sep 2026) ---');
const nowSep6 = new Date('2026-09-06T15:00:00.000Z');
const statusOnSep6 = calculateEventStatus(sep7Event, nowSep6);
const lifecycleOnSep6 = deriveEventLifecycleStatus(sep7Event, nowSep6);

assert.strictEqual(statusOnSep6, 'scheduled', 'Status must be scheduled before event date');
assert.strictEqual(lifecycleOnSep6, 'SCHEDULED', 'Lifecycle must be SCHEDULED before event date');
console.log('✓ PASS: Event is SCHEDULED before event date\n');

// 3. After event date (08 Sep 2026):
console.log('--- TEST 3: After Event Date (08 Sep 2026) ---');
const nowSep8 = new Date('2026-09-08T01:00:00.000Z');
const statusOnSep8 = calculateEventStatus(sep7Event, nowSep8);
const lifecycleOnSep8 = deriveEventLifecycleStatus(sep7Event, nowSep8);

assert.strictEqual(statusOnSep8, 'expired', 'Status must be expired/concluded after event date');
assert.strictEqual(lifecycleOnSep8, 'COMPLETED', 'Lifecycle must be COMPLETED after event date');
console.log('✓ PASS: Event is CONCLUDED only after the event date has completely finished\n');

// 4. Even if legacy or erroneous cancel_reason: 'PAYMENT_TIMEOUT' is present on a PAID event, it MUST NOT be cancelled
console.log('--- TEST 4: Erroneous PAYMENT_TIMEOUT on Paid Event ---');
const taintedEvent = {
  ...sep7Event,
  cancel_reason: 'PAYMENT_TIMEOUT',
  status: 'cancelled',
  event_status: 'CANCELLED',
};

const isCancelledTainted = isEventExplicitlyCancelled(taintedEvent);
const statusTainted = calculateEventStatus(taintedEvent, nowSep7);
const lifecycleTainted = deriveEventLifecycleStatus(taintedEvent, nowSep7);

assert.strictEqual(isCancelledTainted, false, 'Paid event with PAYMENT_TIMEOUT must NOT be considered cancelled');
assert.strictEqual(statusTainted, 'live', 'Tainted paid event on event date must recover to live');
assert.strictEqual(lifecycleTainted, 'LIVE', 'Lifecycle must recover to LIVE');
console.log('✓ PASS: Tainted PAYMENT_TIMEOUT on paid event is safely recovered\n');

// 5. Explicit user cancellation MUST be respected:
console.log('--- TEST 5: Explicit Cancellation ---');
const explicitlyCancelledEvent = {
  ...sep7Event,
  status: 'cancelled',
  event_status: 'CANCELLED',
  cancel_reason: 'USER_CANCELLED',
};

const isExplicitlyCancelled = isEventExplicitlyCancelled(explicitlyCancelledEvent);
const statusCancelled = calculateEventStatus(explicitlyCancelledEvent, nowSep7);
const lifecycleCancelled = deriveEventLifecycleStatus(explicitlyCancelledEvent, nowSep7);

assert.strictEqual(isExplicitlyCancelled, true, 'Explicit USER_CANCELLED must be cancelled');
assert.strictEqual(statusCancelled, 'cancelled', 'Status must be cancelled');
assert.strictEqual(lifecycleCancelled, 'CANCELLED', 'Lifecycle must be CANCELLED');
console.log('✓ PASS: Explicit cancellation is correctly honoured\n');

// 6. Unpaid event on event date:
console.log('--- TEST 6: Unpaid Event on Event Date ---');
const unpaidEvent = {
  ...sep7Event,
  payment_status: 'PENDING_PAYMENT',
  paid_amount: 0,
};

const isUnpaidCancelled = isEventExplicitlyCancelled(unpaidEvent);
const statusUnpaid = calculateEventStatus(unpaidEvent, nowSep7);
const accessUnpaid = canAccessLiveEvent(unpaidEvent, nowSep7);

assert.strictEqual(isUnpaidCancelled, false, 'Unpaid event is NOT cancelled');
assert.strictEqual(statusUnpaid, 'pending_payment', 'Status is pending_payment');
assert.strictEqual(accessUnpaid, false, 'Unpaid event cannot be played');
console.log('✓ PASS: Unpaid event requires payment but is NOT cancelled\n');

console.log('======================================================');
console.log('ALL DATE-ONLY LIFECYCLE TESTS PASSED!');
console.log('======================================================');
