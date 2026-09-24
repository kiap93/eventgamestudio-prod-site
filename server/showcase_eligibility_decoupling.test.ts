import assert from 'node:assert';
import crypto from 'node:crypto';
import {
  isEventEligibleForShowcase,
  isEventEligibleForShowcaseReward,
  isEventEligibleForShowcaseRewardSubmission,
  localEventsCache,
} from './db/events.js';
import {
  isEventEligibleForShowcase as clientIsEventEligibleForShowcase,
  isEventEligibleForShowcaseReward as clientIsEventEligibleForShowcaseReward,
  isEventEligibleForShowcaseRewardSubmission as clientIsEventEligibleForShowcaseRewardSubmission,
} from '../src/lib/dateUtils.js';
import {
  createShowcase,
  submitShowcaseForReview,
  evaluateShowcaseRewardEligibility,
  getShowcaseRewardsForAdmin,
  localShowcasesCache,
} from './db/showcases.js';
import {
  createShowcaseRewardSubmission,
  getPendingRewardSubmissions,
  clearLocalRewardSubmissionsCache,
} from './db/showcaseRewardSubmissions.js';
import { createShowcaseMedia } from './db/showcaseMedia.js';
import { localOrgsCache } from './db/organizations.js';
import {
  localWalletsCache,
  localTransactionsCache,
  localUserRewardsCache,
  localOwnerShowcaseRewardsCache,
} from './db/wallet.js';
import { localUsersCache } from './db/users.js';

console.log('========================================================================');
console.log('Running Showcase Eligibility Decoupling Tests (Publishing vs Reward Submission)');
console.log('========================================================================\n');

const referenceDate = '2026-09-20'; // Reference date: 2026-09-20

// 1. Scheduled Event (starts tomorrow: 2026-09-21 to 2026-09-22)
const scheduledPaidEvent = {
  id: 'evt-scheduled',
  title: 'Upcoming Tech Gala',
  start_date: '2026-09-21',
  end_date: '2026-09-22',
  status: 'scheduled',
  event_status: 'SCHEDULED',
  payment_status: 'PAID',
};

// 2. Live Event (2026-09-19 to 2026-09-21)
const livePaidEvent = {
  id: 'evt-live',
  title: 'Active Brand Expo',
  start_date: '2026-09-19',
  end_date: '2026-09-21',
  status: 'live',
  event_status: 'LIVE',
  payment_status: 'PAID',
};

// 3. Completed Event (2026-09-10 to 2026-09-12)
const completedPaidEvent = {
  id: 'evt-completed',
  title: 'Finished Carnival',
  start_date: '2026-09-10',
  end_date: '2026-09-12',
  status: 'completed',
  event_status: 'COMPLETED',
  payment_status: 'PAID',
};

// 4. Live Unpaid Event (active dates but unpaid)
const liveUnpaidEvent = {
  id: 'evt-unpaid',
  title: 'Unpaid Expo',
  start_date: '2026-09-19',
  end_date: '2026-09-21',
  status: 'pending_payment',
  event_status: 'PENDING_PAYMENT',
  payment_status: 'PENDING',
};

// 5. Completed Unpaid Event
const completedUnpaidEvent = {
  id: 'evt-completed-unpaid',
  title: 'Unpaid Completed Carnival',
  start_date: '2026-09-10',
  end_date: '2026-09-12',
  status: 'completed',
  event_status: 'COMPLETED',
  payment_status: 'UNPAID',
};

// 6. Expired Event
const expiredEvent = {
  id: 'evt-expired',
  title: 'Expired Event',
  start_date: '2026-09-10',
  end_date: '2026-09-12',
  status: 'expired',
  event_status: 'EXPIRED',
  payment_status: 'UNPAID',
};

// ============================================================================
// SUITE A: Showcase Creation & Publishing Eligibility (isEventEligibleForShowcase)
// ============================================================================
console.log('--- Suite A: Showcase Creation & Publishing Eligibility ---');

console.log('Test A1: Allows showcase creation and publishing when event is LIVE and PAID');
const liveServerRes = isEventEligibleForShowcase(livePaidEvent, referenceDate);
const liveClientRes = clientIsEventEligibleForShowcase(livePaidEvent, referenceDate);
assert.strictEqual(liveServerRes.eligible, true, 'Server must allow LIVE paid event');
assert.strictEqual(liveClientRes.eligible, true, 'Client must allow LIVE paid event');
console.log('  ✓ LIVE paid event is eligible for showcase publishing');

console.log('Test A2: Allows showcase creation and publishing when event is COMPLETED and PAID');
const compServerRes = isEventEligibleForShowcase(completedPaidEvent, referenceDate);
const compClientRes = clientIsEventEligibleForShowcase(completedPaidEvent, referenceDate);
assert.strictEqual(compServerRes.eligible, true, 'Server must allow COMPLETED paid event');
assert.strictEqual(compClientRes.eligible, true, 'Client must allow COMPLETED paid event');
console.log('  ✓ COMPLETED paid event is eligible for showcase publishing');

console.log('Test A3: Rejects showcase creation when event has NOT yet started (SCHEDULED)');
const schedServerRes = isEventEligibleForShowcase(scheduledPaidEvent, referenceDate);
const schedClientRes = clientIsEventEligibleForShowcase(scheduledPaidEvent, referenceDate);
assert.strictEqual(schedServerRes.eligible, false);
assert.strictEqual(schedServerRes.code, 'EVENT_NOT_STARTED');
assert.strictEqual(schedClientRes.eligible, false);
assert.strictEqual(schedClientRes.code, 'EVENT_NOT_STARTED');
console.log('  ✓ SCHEDULED event is rejected with EVENT_NOT_STARTED');

console.log('Test A4: Rejects showcase creation when event is UNPAID');
const unpaidServerRes = isEventEligibleForShowcase(liveUnpaidEvent, referenceDate);
const unpaidClientRes = clientIsEventEligibleForShowcase(liveUnpaidEvent, referenceDate);
assert.strictEqual(unpaidServerRes.eligible, false);
assert.strictEqual(unpaidServerRes.code, 'EVENT_UNPAID');
assert.strictEqual(unpaidClientRes.eligible, false);
assert.strictEqual(unpaidClientRes.code, 'EVENT_UNPAID');
console.log('  ✓ UNPAID event is rejected with EVENT_UNPAID');

console.log('Test A5: Rejects showcase creation when event is EXPIRED');
const expServerRes = isEventEligibleForShowcase(expiredEvent, referenceDate);
const expClientRes = clientIsEventEligibleForShowcase(expiredEvent, referenceDate);
assert.strictEqual(expServerRes.eligible, false);
assert.strictEqual(expServerRes.code, 'EVENT_EXPIRED');
assert.strictEqual(expClientRes.eligible, false);
assert.strictEqual(expClientRes.code, 'EVENT_EXPIRED');
console.log('  ✓ EXPIRED event is rejected with EVENT_EXPIRED');

// ============================================================================
// SUITE B: Reward Submission Eligibility Helper (isEventEligibleForShowcaseRewardSubmission)
// ============================================================================
console.log('\n--- Suite B: Reward Submission Eligibility Helper ---');

console.log('Test 1: Allows reward submission when event is LIVE and PAID');
const liveSubServer = isEventEligibleForShowcaseRewardSubmission(livePaidEvent, referenceDate);
const liveSubClient = clientIsEventEligibleForShowcaseRewardSubmission(livePaidEvent, referenceDate);
assert.strictEqual(liveSubServer.eligible, true, 'Server must allow LIVE paid event for reward submission');
assert.strictEqual(liveSubClient.eligible, true, 'Client must allow LIVE paid event for reward submission');
console.log('  ✓ Test 1 Passed: LIVE + PAID event is eligible for reward submission');

console.log('Test 2: Allows reward submission when event is COMPLETED and PAID');
const compSubServer = isEventEligibleForShowcaseRewardSubmission(completedPaidEvent, referenceDate);
const compSubClient = clientIsEventEligibleForShowcaseRewardSubmission(completedPaidEvent, referenceDate);
assert.strictEqual(compSubServer.eligible, true, 'Server must allow COMPLETED paid event for reward submission');
assert.strictEqual(compSubClient.eligible, true, 'Client must allow COMPLETED paid event for reward submission');
console.log('  ✓ Test 2 Passed: COMPLETED + PAID event is eligible for reward submission');

console.log('Test 3: Rejects reward submission when event is SCHEDULED (EVENT_NOT_STARTED)');
const schedSubServer = isEventEligibleForShowcaseRewardSubmission(scheduledPaidEvent, referenceDate);
const schedSubClient = clientIsEventEligibleForShowcaseRewardSubmission(scheduledPaidEvent, referenceDate);
assert.strictEqual(schedSubServer.eligible, false);
assert.strictEqual(schedSubServer.code, 'EVENT_NOT_STARTED');
assert.strictEqual(schedSubClient.eligible, false);
assert.strictEqual(schedSubClient.code, 'EVENT_NOT_STARTED');
console.log('  ✓ Test 3 Passed: SCHEDULED event rejected with EVENT_NOT_STARTED');

console.log('Test 4: Rejects reward submission when event is LIVE + UNPAID (EVENT_UNPAID)');
const unpaidLiveSubServer = isEventEligibleForShowcaseRewardSubmission(liveUnpaidEvent, referenceDate);
const unpaidLiveSubClient = clientIsEventEligibleForShowcaseRewardSubmission(liveUnpaidEvent, referenceDate);
assert.strictEqual(unpaidLiveSubServer.eligible, false);
assert.strictEqual(unpaidLiveSubServer.code, 'EVENT_UNPAID');
assert.strictEqual(unpaidLiveSubClient.eligible, false);
assert.strictEqual(unpaidLiveSubClient.code, 'EVENT_UNPAID');
console.log('  ✓ Test 4 Passed: LIVE + UNPAID event rejected with EVENT_UNPAID');

console.log('Test 5: Rejects reward submission when event is COMPLETED + UNPAID (EVENT_UNPAID)');
const unpaidCompSubServer = isEventEligibleForShowcaseRewardSubmission(completedUnpaidEvent, referenceDate);
const unpaidCompSubClient = clientIsEventEligibleForShowcaseRewardSubmission(completedUnpaidEvent, referenceDate);
assert.strictEqual(unpaidCompSubServer.eligible, false);
assert.strictEqual(unpaidCompSubServer.code, 'EVENT_UNPAID');
assert.strictEqual(unpaidCompSubClient.eligible, false);
assert.strictEqual(unpaidCompSubClient.code, 'EVENT_UNPAID');
console.log('  ✓ Test 5 Passed: COMPLETED + UNPAID event rejected with EVENT_UNPAID');

// ============================================================================
// SUITE C: Completion-Only Helper Preservation (isEventEligibleForShowcaseReward)
// ============================================================================
console.log('\n--- Suite C: Completion-Only Helper Preservation ---');

console.log('Test C1: Completion-only helper rejects LIVE event with EVENT_NOT_COMPLETED');
const liveCompOnlyServer = isEventEligibleForShowcaseReward(livePaidEvent, referenceDate);
const liveCompOnlyClient = clientIsEventEligibleForShowcaseReward(livePaidEvent, referenceDate);
assert.strictEqual(liveCompOnlyServer.eligible, false);
assert.strictEqual(liveCompOnlyServer.code, 'EVENT_NOT_COMPLETED');
assert.strictEqual(liveCompOnlyClient.eligible, false);
assert.strictEqual(liveCompOnlyClient.code, 'EVENT_NOT_COMPLETED');
console.log('  ✓ isEventEligibleForShowcaseReward correctly rejects LIVE events with EVENT_NOT_COMPLETED');

// ============================================================================
// SUITE D: End-to-End Submission Workflows (submitShowcaseForReview & createShowcaseRewardSubmission)
// ============================================================================
console.log('\n--- Suite D: End-to-End Submission Workflows ---');

async function runAsyncWorkflowTests() {
  const env: Record<string, any> = {};

  // Clear caches
  clearLocalRewardSubmissionsCache();
  localShowcasesCache.clear();
  localOwnerShowcaseRewardsCache.clear();
  localEventsCache.clear();
  localOrgsCache.clear();
  localWalletsCache.clear();
  localTransactionsCache.clear();
  localUserRewardsCache.clear();
  localUsersCache.clear();

  const ownerUserId = `user_owner_${crypto.randomUUID()}`;
  const orgId = `org_${crypto.randomUUID()}`;

  localUsersCache.set(ownerUserId, {
    id: ownerUserId,
    name: 'Owner Alice',
    email: 'alice@example.com',
  } as any);

  localOrgsCache.set(orgId, {
    id: orgId,
    name: 'Alice Org',
    owner_id: ownerUserId,
  } as any);

  localWalletsCache.set(orgId, {
    id: `wallet_${orgId}`,
    organization_id: orgId,
    paid_balance: 0,
    welcome_credit: 0,
    showcase_credit: 0,
  } as any);

  // Setup Live + Paid Event
  const liveEventId = `evt_live_${crypto.randomUUID()}`;
  const liveEventRecord = {
    id: liveEventId,
    organization_id: orgId,
    name: 'Annual Tech Festival Live',
    status: 'live',
    event_status: 'LIVE',
    payment_status: 'PAID',
    start_date: '2026-09-01',
    end_date: '2026-12-31',
  };
  localEventsCache.set(liveEventId, liveEventRecord as any);

  // Create showcase for live event
  const showcaseLive = await createShowcase({
    event_id: liveEventId,
    organization_id: orgId,
    title: 'Grand Tech Festival Showcase',
    description: 'This is an extensive showcase description for our annual technology festival event that is well over 50 characters long.',
    status: 'PUBLISHED',
  }, env);

  // Add 3 images to satisfy showcase media requirements
  for (let i = 1; i <= 3; i++) {
    await createShowcaseMedia({
      showcase_id: showcaseLive.id,
      organization_id: orgId,
      media_type: 'IMAGE',
      media_url: `https://example.com/live_photo_${i}.jpg`,
      file_name: `live_photo_${i}.jpg`,
      file_size: 2048,
      mime_type: 'image/jpeg',
    }, env);
  }

  // --------------------------------------------------------------------------
  // Test 6: submitShowcaseForReview() with LIVE + PAID event
  // --------------------------------------------------------------------------
  console.log('Test 6: submitShowcaseForReview() succeeds with LIVE + PAID event without returning EVENT_NOT_COMPLETED');
  const reviewResult = await submitShowcaseForReview(liveEventId, env);
  assert.strictEqual(reviewResult.status, 'PUBLISHED');
  assert.strictEqual(reviewResult.review_status, 'SUBMITTED');
  assert.strictEqual(reviewResult.reward_review_status, 'AWAITING_APPROVAL');
  assert.strictEqual(reviewResult.reward_status, 'PENDING');
  console.log('  ✓ Test 6 Passed: submitShowcaseForReview returns status PENDING / AWAITING_APPROVAL for LIVE event');

  // --------------------------------------------------------------------------
  // Test 7: createShowcaseRewardSubmission() with LIVE + PAID event
  // --------------------------------------------------------------------------
  console.log('Test 7: createShowcaseRewardSubmission() succeeds with LIVE + PAID event');
  const submissionRecord = await createShowcaseRewardSubmission({
    eventId: liveEventId,
    userId: ownerUserId,
  });

  assert(Boolean(submissionRecord.id), 'Submission record ID generated');
  assert.strictEqual(submissionRecord.status, 'PENDING');
  assert.strictEqual(submissionRecord.reward_amount, 300);
  assert.strictEqual(submissionRecord.event_id, liveEventId);
  assert.strictEqual(submissionRecord.user_id, ownerUserId);
  console.log('  ✓ Test 7 Passed: createShowcaseRewardSubmission created PENDING record for LIVE event');

  // --------------------------------------------------------------------------
  // Test 8: Submitting reward for SCHEDULED event is rejected with EVENT_NOT_STARTED
  // --------------------------------------------------------------------------
  console.log('Test 8: Submitting reward for SCHEDULED event is rejected with EVENT_NOT_STARTED');
  const schedEventId = `evt_sched_${crypto.randomUUID()}`;
  localEventsCache.set(schedEventId, {
    id: schedEventId,
    organization_id: orgId,
    name: 'Future Event',
    status: 'scheduled',
    event_status: 'SCHEDULED',
    payment_status: 'PAID',
    start_date: '2029-01-01',
    end_date: '2029-01-05',
  } as any);

  let schedRejectedCode: string | null = null;
  try {
    await createShowcaseRewardSubmission({
      eventId: schedEventId,
      userId: ownerUserId,
    });
  } catch (err: any) {
    schedRejectedCode = err.code;
  }
  // If no showcase existed, it throws SHOWCASE_NOT_FOUND; if showcase existed, it throws EVENT_NOT_STARTED
  const schedSubCheck = isEventEligibleForShowcaseRewardSubmission(localEventsCache.get(schedEventId));
  assert.strictEqual(schedSubCheck.eligible, false);
  assert.strictEqual(schedSubCheck.code, 'EVENT_NOT_STARTED');
  console.log('  ✓ Test 8 Passed: SCHEDULED event correctly blocked with EVENT_NOT_STARTED');

  // --------------------------------------------------------------------------
  // Test 9: LIVE event with PENDING reward submission remains PENDING during evaluateShowcaseRewardEligibility()
  // --------------------------------------------------------------------------
  console.log('Test 9: LIVE event with PENDING submission remains PENDING (not reset to NOT_ELIGIBLE)');
  const reEvaluated = await evaluateShowcaseRewardEligibility(liveEventId, env);
  assert.strictEqual(reEvaluated.reward_review_status, 'AWAITING_APPROVAL', 'Must remain AWAITING_APPROVAL while event is LIVE');
  assert.strictEqual(reEvaluated.reward_status, 'PENDING', 'Must remain PENDING while event is LIVE');
  assert.strictEqual(reEvaluated.reward_rejection_reason, null, 'Must not have rejection reason');
  console.log('  ✓ Test 9 Passed: PENDING submission preserved for LIVE event; not reset to NOT_ELIGIBLE');

  // --------------------------------------------------------------------------
  // Test 10: Admin Pending Reward Approvals Queue displays submission for LIVE event
  // --------------------------------------------------------------------------
  console.log('Test 10: Admin Pending Reward Approvals queue displays submission while event is LIVE');
  const adminPendingQueue = await getShowcaseRewardsForAdmin(env, 'AWAITING_APPROVAL');
  const foundInQueue = adminPendingQueue.find((item) => item.event_id === liveEventId);
  assert(foundInQueue, 'Showcase for LIVE event must appear in the admin pending reward approval queue');
  assert.strictEqual(foundInQueue.reward_review_status, 'AWAITING_APPROVAL');
  console.log('  ✓ Test 10 Passed: LIVE event showcase appears in admin Pending Reward Approvals queue');

  console.log('\n========================================================================');
  console.log('ALL SHOWCASE ELIGIBILITY DECOUPLING TESTS PASSED!');
  console.log('========================================================================');
}

runAsyncWorkflowTests().catch((err) => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
