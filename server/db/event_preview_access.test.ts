import assert from 'node:assert';
import { canAccessPreviewEvent as serverCanAccessPreview, isEventExplicitlyCancelled as serverIsCancelled } from './events';
import { canAccessPreviewEvent as clientCanAccessPreview, isEventExplicitlyCancelled as clientIsCancelled, getEventAvailabilityState } from '../../src/lib/dateUtils';

console.log('======================================================');
console.log('RUNNING EVENT PREVIEW ACCESS VERIFICATION TESTS');
console.log('======================================================');

// 1. Scheduled event (before event window)
const scheduledEvent = {
  id: 'ev-scheduled',
  event_status: 'SCHEDULED',
  status: 'scheduled',
  payment_status: 'PAID',
  start_date: '2026-10-01',
  end_date: '2026-10-02',
};
assert.strictEqual(serverCanAccessPreview(scheduledEvent), true, 'Server: Scheduled event should allow preview');
assert.strictEqual(clientCanAccessPreview(scheduledEvent), true, 'Client: Scheduled event should allow preview');
assert.strictEqual(getEventAvailabilityState(scheduledEvent).previewUrlAvailable, true, 'Client: previewUrlAvailable should be true');
console.log('✓ PASS: Scheduled event allows preview');

// 2. Pending payment event
const pendingPaymentEvent = {
  id: 'ev-pending',
  event_status: 'PENDING_PAYMENT',
  status: 'pending_payment',
  payment_status: 'UNPAID',
  start_date: '2026-10-01',
  end_date: '2026-10-02',
};
assert.strictEqual(serverCanAccessPreview(pendingPaymentEvent), true, 'Server: Pending payment event should allow preview');
assert.strictEqual(clientCanAccessPreview(pendingPaymentEvent), true, 'Client: Pending payment event should allow preview');
assert.strictEqual(getEventAvailabilityState(pendingPaymentEvent).previewUrlAvailable, true, 'Client: previewUrlAvailable should be true for unpaid');
console.log('✓ PASS: Pending payment event allows preview');

// 3. Live event (during event window)
const liveEvent = {
  id: 'ev-live',
  event_status: 'LIVE',
  status: 'live',
  payment_status: 'PAID',
  start_date: '2026-09-01',
  end_date: '2026-09-10',
};
assert.strictEqual(serverCanAccessPreview(liveEvent), true, 'Server: Live event should allow preview');
assert.strictEqual(clientCanAccessPreview(liveEvent), true, 'Client: Live event should allow preview');
assert.strictEqual(getEventAvailabilityState(liveEvent).previewUrlAvailable, true, 'Client: previewUrlAvailable should be true for live');
console.log('✓ PASS: Live event allows preview');

// 4. Concluded event (after event window)
const concludedEvent = {
  id: 'ev-concluded',
  event_status: 'COMPLETED',
  status: 'expired',
  payment_status: 'PAID',
  start_date: '2026-08-01',
  end_date: '2026-08-02',
};
assert.strictEqual(serverCanAccessPreview(concludedEvent), true, 'Server: Concluded event should allow preview');
assert.strictEqual(clientCanAccessPreview(concludedEvent), true, 'Client: Concluded event should allow preview');
assert.strictEqual(getEventAvailabilityState(concludedEvent).previewUrlAvailable, true, 'Client: previewUrlAvailable should be true for concluded');
console.log('✓ PASS: Concluded event allows preview');

// 5. Cancelled event (explicitly cancelled)
const cancelledEvent = {
  id: 'ev-cancelled',
  event_status: 'CANCELLED',
  status: 'cancelled',
  cancel_reason: 'Client requested cancellation',
  payment_status: 'REFUNDED',
  start_date: '2026-10-01',
  end_date: '2026-10-02',
};
assert.strictEqual(serverCanAccessPreview(cancelledEvent), false, 'Server: Explicitly cancelled event should NOT allow preview');
assert.strictEqual(clientCanAccessPreview(cancelledEvent), false, 'Client: Explicitly cancelled event should NOT allow preview');
assert.strictEqual(serverIsCancelled(cancelledEvent), true, 'Server: Cancelled event is recognized as cancelled');
assert.strictEqual(clientIsCancelled(cancelledEvent), true, 'Client: Cancelled event is recognized as cancelled');
assert.strictEqual(getEventAvailabilityState(cancelledEvent).previewUrlAvailable, false, 'Client: previewUrlAvailable should be false for cancelled');
console.log('✓ PASS: Cancelled event denies preview');

console.log('======================================================');
console.log('ALL PREVIEW ACCESS VERIFICATION TESTS PASSED!');
console.log('======================================================');
