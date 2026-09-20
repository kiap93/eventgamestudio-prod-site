import assert from 'node:assert';
import {
  isEventEligibleForShowcase,
  isEventEligibleForShowcaseReward,
} from './db/events.js';
import {
  isEventEligibleForShowcase as clientIsEventEligibleForShowcase,
  isEventEligibleForShowcaseReward as clientIsEventEligibleForShowcaseReward,
} from '../src/lib/dateUtils.js';

console.log('========================================================================');
console.log('Running Showcase Eligibility Decoupling Tests (Publishing vs Reward)');
console.log('========================================================================\n');

const referenceDate = '2026-09-20'; // Reference date: 2026-09-20

// 1. Scheduled Event (starts tomorrow: 2026-09-21 to 2026-09-22)
const scheduledPaidEvent = {
  id: 'evt-scheduled',
  title: 'Upcoming Tech Gala',
  start_date: '2026-09-21',
  end_date: '2026-09-22',
  status: 'scheduled',
  payment_status: 'PAID',
};

// 2. Live Event (2026-09-19 to 2026-09-21)
const livePaidEvent = {
  id: 'evt-live',
  title: 'Active Brand Expo',
  start_date: '2026-09-19',
  end_date: '2026-09-21',
  status: 'live',
  payment_status: 'PAID',
};

// 3. Completed Event (2026-09-10 to 2026-09-12)
const completedPaidEvent = {
  id: 'evt-completed',
  title: 'Finished Carnival',
  start_date: '2026-09-10',
  end_date: '2026-09-12',
  status: 'completed',
  payment_status: 'PAID',
};

// 4. Unpaid Event (active dates but unpaid)
const liveUnpaidEvent = {
  id: 'evt-unpaid',
  title: 'Unpaid Expo',
  start_date: '2026-09-19',
  end_date: '2026-09-21',
  status: 'pending_payment',
  payment_status: 'PENDING',
};

// 5. Expired Event
const expiredEvent = {
  id: 'evt-expired',
  title: 'Expired Event',
  start_date: '2026-09-10',
  end_date: '2026-09-12',
  status: 'expired',
  payment_status: 'UNPAID',
};

// --- Test Suite: Publishing Eligibility ---
console.log('Test 1: Allows showcase creation and publishing when event is LIVE and PAID');
const liveServerRes = isEventEligibleForShowcase(livePaidEvent, referenceDate);
const liveClientRes = clientIsEventEligibleForShowcase(livePaidEvent, referenceDate);
assert.strictEqual(liveServerRes.eligible, true, 'Server must allow LIVE paid event');
assert.strictEqual(liveClientRes.eligible, true, 'Client must allow LIVE paid event');
console.log('  ✓ LIVE paid event is eligible for showcase publishing');

console.log('Test 2: Allows showcase creation and publishing when event is COMPLETED and PAID');
const compServerRes = isEventEligibleForShowcase(completedPaidEvent, referenceDate);
const compClientRes = clientIsEventEligibleForShowcase(completedPaidEvent, referenceDate);
assert.strictEqual(compServerRes.eligible, true, 'Server must allow COMPLETED paid event');
assert.strictEqual(compClientRes.eligible, true, 'Client must allow COMPLETED paid event');
console.log('  ✓ COMPLETED paid event is eligible for showcase publishing');

console.log('Test 3: Rejects showcase creation when event has NOT yet started (SCHEDULED)');
const schedServerRes = isEventEligibleForShowcase(scheduledPaidEvent, referenceDate);
const schedClientRes = clientIsEventEligibleForShowcase(scheduledPaidEvent, referenceDate);
assert.strictEqual(schedServerRes.eligible, false);
assert.strictEqual(schedServerRes.code, 'EVENT_NOT_STARTED');
assert.strictEqual(schedClientRes.eligible, false);
assert.strictEqual(schedClientRes.code, 'EVENT_NOT_STARTED');
console.log('  ✓ SCHEDULED event is rejected with EVENT_NOT_STARTED');

console.log('Test 4: Rejects showcase creation when event is UNPAID');
const unpaidServerRes = isEventEligibleForShowcase(liveUnpaidEvent, referenceDate);
const unpaidClientRes = clientIsEventEligibleForShowcase(liveUnpaidEvent, referenceDate);
assert.strictEqual(unpaidServerRes.eligible, false);
assert.strictEqual(unpaidServerRes.code, 'EVENT_UNPAID');
assert.strictEqual(unpaidClientRes.eligible, false);
assert.strictEqual(unpaidClientRes.code, 'EVENT_UNPAID');
console.log('  ✓ UNPAID event is rejected with EVENT_UNPAID');

console.log('Test 5: Rejects showcase creation when event is EXPIRED');
const expServerRes = isEventEligibleForShowcase(expiredEvent, referenceDate);
const expClientRes = clientIsEventEligibleForShowcase(expiredEvent, referenceDate);
assert.strictEqual(expServerRes.eligible, false);
assert.strictEqual(expServerRes.code, 'EVENT_EXPIRED');
assert.strictEqual(expClientRes.eligible, false);
assert.strictEqual(expClientRes.code, 'EVENT_EXPIRED');
console.log('  ✓ EXPIRED event is rejected with EVENT_EXPIRED');

// --- Test Suite: Reward Eligibility ---
console.log('Test 6: Disallows reward review while event is still LIVE (reward strictly requires completed event)');
const liveRewardServerRes = isEventEligibleForShowcaseReward(livePaidEvent, referenceDate);
const liveRewardClientRes = clientIsEventEligibleForShowcaseReward(livePaidEvent, referenceDate);
assert.strictEqual(liveRewardServerRes.eligible, false);
assert.strictEqual(liveRewardServerRes.code, 'EVENT_NOT_COMPLETED');
assert.ok(liveRewardServerRes.reason?.includes('once the event has completed'));
assert.strictEqual(liveRewardClientRes.eligible, false);
assert.strictEqual(liveRewardClientRes.code, 'EVENT_NOT_COMPLETED');
assert.ok(liveRewardClientRes.reason?.includes('once the event has completed'));
console.log('  ✓ LIVE event cannot be submitted for reward review until completed');

console.log('Test 7: Disallows reward review when event is SCHEDULED');
const schedRewardServerRes = isEventEligibleForShowcaseReward(scheduledPaidEvent, referenceDate);
const schedRewardClientRes = clientIsEventEligibleForShowcaseReward(scheduledPaidEvent, referenceDate);
assert.strictEqual(schedRewardServerRes.eligible, false);
assert.strictEqual(schedRewardServerRes.code, 'EVENT_NOT_COMPLETED');
assert.strictEqual(schedRewardClientRes.eligible, false);
assert.strictEqual(schedRewardClientRes.code, 'EVENT_NOT_COMPLETED');
console.log('  ✓ SCHEDULED event cannot be submitted for reward review');

console.log('Test 8: Allows reward review when event is COMPLETED and PAID');
const compRewardServerRes = isEventEligibleForShowcaseReward(completedPaidEvent, referenceDate);
const compRewardClientRes = clientIsEventEligibleForShowcaseReward(completedPaidEvent, referenceDate);
assert.strictEqual(compRewardServerRes.eligible, true);
assert.strictEqual(compRewardClientRes.eligible, true);
console.log('  ✓ COMPLETED paid event is eligible for reward review');

console.log('Test 9: Disallows reward review when event is COMPLETED but UNPAID');
const unpaidCompleted = { ...completedPaidEvent, payment_status: 'PENDING' };
const unpaidRewardServerRes = isEventEligibleForShowcaseReward(unpaidCompleted, referenceDate);
const unpaidRewardClientRes = clientIsEventEligibleForShowcaseReward(unpaidCompleted, referenceDate);
assert.strictEqual(unpaidRewardServerRes.eligible, false);
assert.strictEqual(unpaidRewardServerRes.code, 'EVENT_UNPAID');
assert.strictEqual(unpaidRewardClientRes.eligible, false);
assert.strictEqual(unpaidRewardClientRes.code, 'EVENT_UNPAID');
console.log('  ✓ UNPAID completed event is rejected for reward review');

console.log('\n========================================================================');
console.log('ALL SHOWCASE ELIGIBILITY DECOUPLING TESTS PASSED (9/9)!');
console.log('========================================================================');
