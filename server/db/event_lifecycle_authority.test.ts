import assert from 'node:assert';
import {
  deriveEventLifecycleStatus,
  isEventPlayable,
  getEventByPublicToken,
} from './events.js';
import { EventRecord } from './types.js';

console.log('======================================================');
console.log(' RUNNING 5-STATE EVENT LIFECYCLE AUTHORITY TEST SUITE');
console.log('======================================================\n');

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean) {
  if (condition) {
    passed++;
    console.log(`  ✓ PASS: ${name}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${name}`);
  }
}

async function runTests() {
  const now = new Date('2026-06-15T12:00:00Z');
  const pastStart = '2026-06-10T00:00:00Z';
  const pastExpire = '2026-06-12T23:59:59Z';
  const liveStart = '2026-06-15T00:00:00Z';
  const liveExpire = '2026-06-16T23:59:59Z';
  const futureStart = '2026-06-20T00:00:00Z';
  const futureExpire = '2026-06-25T23:59:59Z';

  console.log('--- SCENARIO 1: Unpaid Event ---');
  const unpaidEvent: Partial<EventRecord> = {
    id: 'evt-unpaid',
    name: 'Unpaid Event',
    payment_status: 'UNPAID',
    status: 'draft',
    starts_at: liveStart,
    expires_at: liveExpire,
  };
  const unpaidStatus = deriveEventLifecycleStatus(unpaidEvent, now);
  check('Unpaid event derives DRAFT status', unpaidStatus === 'DRAFT');
  check('Unpaid event is NOT playable', isEventPlayable(unpaidEvent, now) === false);

  console.log('\n--- SCENARIO 2: Payment Pending Event ---');
  const pendingEvent: Partial<EventRecord> = {
    id: 'evt-pending',
    name: 'Pending Payment Event',
    payment_status: 'PENDING_PAYMENT',
    status: 'pending_payment',
    starts_at: liveStart,
    expires_at: liveExpire,
  };
  const pendingStatus = deriveEventLifecycleStatus(pendingEvent, now);
  check('Pending payment event derives PENDING_PAYMENT status', pendingStatus === 'PENDING_PAYMENT');
  check('Pending payment event is NOT playable', isEventPlayable(pendingEvent, now) === false);

  console.log('\n--- SCENARIO 3: Paid Before Starts_at (Scheduled) ---');
  const scheduledEvent: Partial<EventRecord> = {
    id: 'evt-scheduled',
    name: 'Scheduled Event',
    payment_status: 'PAID',
    status: 'scheduled',
    starts_at: futureStart,
    expires_at: futureExpire,
  };
  const scheduledStatus = deriveEventLifecycleStatus(scheduledEvent, now);
  check('Paid before start derives SCHEDULED status', scheduledStatus === 'SCHEDULED');
  check('Paid before start is NOT playable', isEventPlayable(scheduledEvent, now) === false);

  console.log('\n--- SCENARIO 4: Paid + Live Window (starts_at <= now < expires_at) ---');
  const liveEvent: Partial<EventRecord> = {
    id: 'evt-live',
    name: 'Live Event',
    payment_status: 'PAID',
    status: 'live',
    starts_at: liveStart,
    expires_at: liveExpire,
  };
  const liveStatus = deriveEventLifecycleStatus(liveEvent, now);
  check('Paid inside active window derives LIVE status', liveStatus === 'LIVE');
  check('Paid inside active window IS playable', isEventPlayable(liveEvent, now) === true);

  console.log('\n--- SCENARIO 5: Paid + Expired (now >= expires_at) ---');
  const expiredEvent: Partial<EventRecord> = {
    id: 'evt-expired',
    name: 'Expired Event',
    payment_status: 'PAID',
    status: 'expired',
    starts_at: pastStart,
    expires_at: pastExpire,
  };
  const expiredStatus = deriveEventLifecycleStatus(expiredEvent, now);
  check('Paid past expiry derives COMPLETED status', expiredStatus === 'COMPLETED');
  check('Paid past expiry is NOT playable', isEventPlayable(expiredEvent, now) === false);

  console.log('\n--- SCENARIO 6: Cancelled Event ---');
  const cancelledEvent: Partial<EventRecord> = {
    id: 'evt-cancelled',
    name: 'Cancelled Event',
    payment_status: 'PAID',
    status: 'cancelled',
    event_status: 'CANCELLED',
    cancel_reason: 'USER_CANCELLED',
    starts_at: liveStart,
    expires_at: liveExpire,
  };
  const cancelledStatus = deriveEventLifecycleStatus(cancelledEvent, now);
  check('Cancelled event derives CANCELLED status', cancelledStatus === 'CANCELLED');
  check('Cancelled event is NOT playable', isEventPlayable(cancelledEvent, now) === false);

  console.log('\n--- SCENARIO 7: Stored LIVE status override prevention (now >= expires_at) ---');
  const staleLiveEvent: Partial<EventRecord> = {
    id: 'evt-stale-live',
    name: 'Stale Live Event in DB',
    payment_status: 'PAID',
    status: 'live',
    event_status: 'LIVE', // Stored in DB as LIVE, but actually expired
    starts_at: pastStart,
    expires_at: pastExpire,
  };
  const staleStatus = deriveEventLifecycleStatus(staleLiveEvent, now);
  check('Stored LIVE status cannot override expired timestamp (derives COMPLETED)', staleStatus === 'COMPLETED');
  check('Stale LIVE event is NOT playable', isEventPlayable(staleLiveEvent, now) === false);

  console.log('\n======================================================');
  console.log(` RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
