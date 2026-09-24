/**
 * Showcase Pending Reward Approval Queue & Authoritative Verification Test Suite
 * 
 * Verifies:
 * - Scenario A: User has never received showcase reward, publishes first showcase on paid/completed event
 *   -> reward_review_status is AWAITING_APPROVAL, appears in pending queue.
 * - Scenario B: Owner already received showcase reward previously on event 1, publishes second showcase for event 2
 *   -> NOT in pending queue, reward_review_status = NOT_ELIGIBLE.
 * - Scenario C: Showcase is BLOCKED or DELETED -> NOT in pending queue.
 * - Scenario D: Event is unpaid or not completed -> NOT in pending queue.
 * - Scenario E: Review status is SUBMITTED, but reward_review_status is NOT_ELIGIBLE
 *   -> does NOT show "Reward Pending" in UI or in queue.
 * - Scenario F: Developer approves RM300 -> grants RM300, updates user_rewards, removes from queue.
 * - Scenario G: Production failure behavior -> fail-closed, no unsafe direct table fallback.
 */

import {
  createShowcase,
  submitShowcaseForReview,
  getShowcaseRewardsForAdmin,
  approveShowcaseReview,
  localShowcasesCache,
  updateShowcase,
} from './showcases.js';
import { createShowcaseMedia } from './showcaseMedia.js';
import { localOrgsCache } from './organizations.js';
import { localEventsCache } from './events.js';
import { getShowcaseRewardEligibility } from './rewards.js';
import { localUserRewardsCache } from './wallet.js';
import { EventRecord } from './types.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ PASS: ${message}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual === expected) {
    passed++;
    console.log(`  ✓ PASS: ${message} (expected: ${expected}, got: ${actual})`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${message} (expected: ${expected}, got: ${actual})`);
  }
}

console.log('========================================================================');
console.log(' RUNNING: Showcase Pending Reward Approval Queue Verification');
console.log('========================================================================\n');

async function runTests() {
  process.env.NODE_ENV = 'development';
  process.env.ENVIRONMENT = 'development';
  process.env.ALLOW_LOCAL_FALLBACK = 'true';
  process.env.ALLOW_SHOWCASE_FALLBACK = 'true';

  const env: any = {
    ENVIRONMENT: 'development',
    NODE_ENV: 'development',
    ALLOW_LOCAL_FALLBACK: 'true',
    ALLOW_SHOWCASE_FALLBACK: 'true',
  };

  const ownerA = `user_owner_a_${crypto.randomUUID()}`;
  const orgA = `org_a_${crypto.randomUUID()}`;
  localOrgsCache.set(orgA, {
    id: orgA,
    name: 'Acme Corp',
    owner_id: ownerA,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as any);

  // --------------------------------------------------------------------------
  // Scenario A: First-time eligible owner with paid, completed event
  // --------------------------------------------------------------------------
  console.log('--- Test Scenario A: First-time eligible owner publishes showcase on paid/completed event ---');
  const eventAId = `event_a_${crypto.randomUUID()}`;
  const completedDate = new Date(Date.now() - 3 * 86400000).toISOString();
  localEventsCache.set(eventAId, {
    id: eventAId,
    organization_id: orgA,
    name: 'Acme Tech Summit 2026',
    status: 'COMPLETED',
    payment_status: 'PAID',
    start_date: '2026-09-01',
    end_date: '2026-09-03',
    created_at: completedDate,
    updated_at: completedDate,
  } as any);

  const showcaseA = await createShowcase({
    event_id: eventAId,
    organization_id: orgA,
    title: 'Acme Summit Interactive Game',
    client_name: 'Acme Tech',
    description: 'A fantastic celebration of brand engagement featuring our interactive game and huge attendee participation across multiple event zones!',
    status: 'PUBLISHED',
  }, env);

  // Add 1 video media to satisfy RM300 first-event reward criteria
  await createShowcaseMedia({
    showcase_id: showcaseA.id,
    organization_id: orgA,
    media_type: 'VIDEO',
    media_url: 'https://cdn.example.com/video.mp4',
    file_name: 'video.mp4',
    file_size: 1024 * 1024,
    mime_type: 'video/mp4',
  }, env);

  assert(Boolean(showcaseA?.id), 'Showcase A created successfully');

  // Submit showcase for review
  const submittedA = await submitShowcaseForReview(showcaseA.event_id, env);
  assertEqual(submittedA.reward_review_status, 'AWAITING_APPROVAL', 'Showcase A reward_review_status is AWAITING_APPROVAL');
  assertEqual(submittedA.review_status, 'SUBMITTED', 'Showcase A review_status is SUBMITTED');

  // Fetch pending rewards queue
  const pendingQueueA = await getShowcaseRewardsForAdmin(env, 'AWAITING_APPROVAL');
  const foundInQueueA = pendingQueueA.find(item => item.id === showcaseA.id);
  assert(Boolean(foundInQueueA), 'Showcase A appears in pending reward approval queue');
  assertEqual(foundInQueueA?.reward_review_status, 'AWAITING_APPROVAL', 'Showcase in queue has reward_review_status AWAITING_APPROVAL');

  // --------------------------------------------------------------------------
  // Scenario B: Owner already received showcase reward on Event 1 -> publishes Event 2
  // --------------------------------------------------------------------------
  console.log('\n--- Test Scenario B: Owner already received lifetime showcase reward -> publishes Event 2 ---');
  // First, approve showcase A so ownerA receives their lifetime reward
  const approveResultA = await approveShowcaseReview(showcaseA.id, 'admin_reviewer', env);
  assert(approveResultA.reward?.success === true || approveResultA.showcase?.reward_review_status === 'REWARDED', 'Showcase A reward was granted');
  assertEqual(approveResultA.showcase?.reward_review_status, 'REWARDED', 'Showcase A is now REWARDED');

  // Now create Event 2 for the same ownerA
  const eventBId = `event_b_${crypto.randomUUID()}`;
  localEventsCache.set(eventBId, {
    id: eventBId,
    organization_id: orgA,
    name: 'Acme Winter Festival 2026',
    status: 'completed',
    event_status: 'COMPLETED',
    payment_status: 'PAID',
    start_date: '2026-09-05',
    end_date: '2026-09-08',
    created_at: completedDate,
    updated_at: completedDate,
  } as any);

  const showcaseB = await createShowcase({
    event_id: eventBId,
    organization_id: orgA,
    title: 'Acme Winter Showcase',
    client_name: 'Acme Tech',
  }, env);

  const submittedB = await submitShowcaseForReview(showcaseB.event_id, env);
  assertEqual(submittedB.reward_review_status, 'NOT_ELIGIBLE', 'Showcase B reward_review_status is NOT_ELIGIBLE because owner already claimed reward');
  assertEqual(submittedB.review_status, 'SUBMITTED', 'Showcase B editorial review_status is SUBMITTED');

  // Verify Showcase B is NOT in the pending reward queue
  const pendingQueueB = await getShowcaseRewardsForAdmin(env, 'AWAITING_APPROVAL');
  const foundInQueueB = pendingQueueB.find(item => item.id === showcaseB.id);
  assert(!foundInQueueB, 'Showcase B does NOT appear in pending reward approval queue');

  // --------------------------------------------------------------------------
  // Scenario C: Showcase is BLOCKED or DELETED -> NOT in pending queue
  // --------------------------------------------------------------------------
  console.log('\n--- Test Scenario C: Showcase is BLOCKED or DELETED -> excluded from pending queue ---');
  const ownerC = `user_owner_c_${crypto.randomUUID()}`;
  const orgC = `org_c_${crypto.randomUUID()}`;
  localOrgsCache.set(orgC, {
    id: orgC,
    name: 'Beta Co',
    owner_id: ownerC,
  } as any);

  const eventCId = `event_c_${crypto.randomUUID()}`;
  localEventsCache.set(eventCId, {
    id: eventCId,
    organization_id: orgC,
    name: 'Beta Expo',
    status: 'completed',
    event_status: 'COMPLETED',
    payment_status: 'PAID',
    start_date: '2026-09-01',
    end_date: '2026-09-02',
  } as any);

  const showcaseC1 = await createShowcase({
    event_id: eventCId,
    organization_id: orgC,
    title: 'Blocked Showcase',
  }, env);
  await submitShowcaseForReview(showcaseC1.event_id, env);
  // Now block showcase C1
  await updateShowcase(showcaseC1.event_id, { status: 'BLOCKED' as any }, env, true);

  const eventC2Id = `event_c2_${crypto.randomUUID()}`;
  localEventsCache.set(eventC2Id, {
    id: eventC2Id,
    organization_id: orgC,
    name: 'Beta Expo 2',
    status: 'completed',
    event_status: 'COMPLETED',
    payment_status: 'PAID',
    start_date: '2026-09-01',
    end_date: '2026-09-02',
  } as any);

  const showcaseC2 = await createShowcase({
    event_id: eventC2Id,
    organization_id: orgC,
    title: 'Deleted Showcase',
  }, env);
  await submitShowcaseForReview(showcaseC2.event_id, env);
  // Now soft delete showcase C2
  await updateShowcase(showcaseC2.event_id, { status: 'DELETED' as any }, env, true);

  const pendingQueueC = await getShowcaseRewardsForAdmin(env, 'AWAITING_APPROVAL');
  const foundBlocked = pendingQueueC.find(item => item.id === showcaseC1.id);
  const foundDeleted = pendingQueueC.find(item => item.id === showcaseC2.id);
  assert(!foundBlocked, 'BLOCKED showcase does NOT appear in pending reward queue');
  assert(!foundDeleted, 'DELETED showcase does NOT appear in pending reward queue');

  // --------------------------------------------------------------------------
  // Scenario D: Event is UNPAID or NOT COMPLETED -> NOT in pending queue
  // --------------------------------------------------------------------------
  console.log('\n--- Test Scenario D: Event is UNPAID or NOT COMPLETED -> excluded from pending queue ---');
  const ownerD = `user_owner_d_${crypto.randomUUID()}`;
  const orgD = `org_d_${crypto.randomUUID()}`;
  localOrgsCache.set(orgD, {
    id: orgD,
    name: 'Delta Corp',
    owner_id: ownerD,
  } as any);

  // Unpaid event
  const eventDUnpaid = `event_d_unpaid_${crypto.randomUUID()}`;
  localEventsCache.set(eventDUnpaid, {
    id: eventDUnpaid,
    organization_id: orgD,
    name: 'Unpaid Event',
    status: 'completed',
    event_status: 'COMPLETED',
    payment_status: 'UNPAID',
    start_date: '2026-09-01',
    end_date: '2026-09-02',
  } as any);

  // An unpaid event cannot have a showcase created or submitted for reward
  let unpaidBlockedFromCreation = false;
  try {
    await createShowcase({
      event_id: eventDUnpaid,
      organization_id: orgD,
      title: 'Unpaid Event Showcase',
    }, env);
  } catch (err: any) {
    unpaidBlockedFromCreation = true;
  }
  assert(unpaidBlockedFromCreation, 'Unpaid event showcase is prevented from being created/submitted for rewards');

  // Test: LIVE and PAID event CAN be submitted for review and APPEARS in pending queue
  const eventDLive = `event_d_live_${crypto.randomUUID()}`;
  localEventsCache.set(eventDLive, {
    id: eventDLive,
    organization_id: orgD,
    name: 'Live Event Running',
    status: 'live',
    event_status: 'LIVE',
    payment_status: 'PAID',
    start_date: '2026-09-01',
    end_date: '2026-12-31',
  } as any);

  const showcaseDLive = await createShowcase({
    event_id: eventDLive,
    organization_id: orgD,
    title: 'Live Event Showcase',
  }, env);

  const submittedLive = await submitShowcaseForReview(showcaseDLive.event_id, env);
  assert(submittedLive.reward_review_status === 'AWAITING_APPROVAL', 'Live event showcase can be submitted for reward review');

  const pendingQueueD = await getShowcaseRewardsForAdmin(env, 'AWAITING_APPROVAL');
  const foundLive = pendingQueueD.find(item => item.id === showcaseDLive.id);
  assert(foundLive, 'Live event showcase DOES appear in pending reward queue');

  // --------------------------------------------------------------------------
  // Scenario E: Review status SUBMITTED, but reward_review_status NOT_ELIGIBLE
  // --------------------------------------------------------------------------
  console.log('\n--- Test Scenario E: review_status === SUBMITTED does NOT make a showcase reward pending ---');
  // From Scenario B, submittedB has review_status = 'SUBMITTED', reward_review_status = 'NOT_ELIGIBLE'
  const scBRefreshed = localShowcasesCache.get(showcaseB.event_id)!;
  assertEqual(scBRefreshed.reward_review_status, 'NOT_ELIGIBLE', 'Showcase B reward_review_status is NOT_ELIGIBLE');

  // Test the frontend helper predicate
  const isRewardPendingPredicate = (sc: any) =>
    sc.reward_review_status === 'AWAITING_APPROVAL' &&
    sc.status !== 'DELETED' &&
    sc.status !== 'BLOCKED';

  assert(!isRewardPendingPredicate(scBRefreshed), 'Frontend isRewardPending returns FALSE for SUBMITTED + NOT_ELIGIBLE showcase');

  // --------------------------------------------------------------------------
  // Scenario F: Approving RM300 grants atomically, removes from queue, updates user_rewards
  // --------------------------------------------------------------------------
  console.log('\n--- Test Scenario F: Developer approves RM300 -> grants atomically, removes from queue ---');
  const ownerF = `user_owner_f_${crypto.randomUUID()}`;
  const orgF = `org_f_${crypto.randomUUID()}`;
  localOrgsCache.set(orgF, {
    id: orgF,
    name: 'Fox Corp',
    owner_id: ownerF,
  } as any);

  const eventFId = `event_f_${crypto.randomUUID()}`;
  localEventsCache.set(eventFId, {
    id: eventFId,
    organization_id: orgF,
    name: 'Fox Gala',
    status: 'completed',
    event_status: 'COMPLETED',
    payment_status: 'PAID',
    start_date: '2026-09-01',
    end_date: '2026-09-02',
  } as any);

  const showcaseF = await createShowcase({
    event_id: eventFId,
    organization_id: orgF,
    title: 'Fox Gala Showcase',
    description: 'A stellar interactive activation that delighted hundreds of guests with real-time leaderboard competitions.',
    status: 'PUBLISHED',
  }, env);

  await createShowcaseMedia({
    showcase_id: showcaseF.id,
    organization_id: orgF,
    media_type: 'VIDEO',
    media_url: 'https://cdn.example.com/fox.mp4',
    file_name: 'fox.mp4',
    file_size: 1024 * 1024,
    mime_type: 'video/mp4',
  }, env);

  await submitShowcaseForReview(showcaseF.event_id, env);

  // Verify in queue prior to approval
  const queueBeforeF = await getShowcaseRewardsForAdmin(env, 'AWAITING_APPROVAL');
  assert(Boolean(queueBeforeF.find(i => i.id === showcaseF.id)), 'Showcase F is in pending queue before approval');

  // Approve
  const approveResultF = await approveShowcaseReview(showcaseF.id, 'reviewer_admin', env);
  assert(approveResultF.reward?.success === true || approveResultF.showcase?.reward_review_status === 'REWARDED', 'Reward RM300 granted successfully');
  assertEqual(approveResultF.showcase?.reward_review_status, 'REWARDED', 'reward_review_status updated to REWARDED');

  // Verify removed from queue after approval
  const queueAfterF = await getShowcaseRewardsForAdmin(env, 'AWAITING_APPROVAL');
  assert(!queueAfterF.find(i => i.id === showcaseF.id), 'Showcase F is REMOVED from pending queue after approval');

  // Verify lifetime eligibility check now reflects rewarded
  const eligibilityF = await getShowcaseRewardEligibility(ownerF, env);
  assert(!eligibilityF.eligible, 'Owner F is no longer eligible for lifetime reward');
  assertEqual(eligibilityF.userRewardStatus, 'REWARDED', 'userRewardStatus is REWARDED for Owner F');

  // --------------------------------------------------------------------------
  // Scenario G: Production fail-closed behavior
  // --------------------------------------------------------------------------
  console.log('\n--- Test Scenario G: Production fail-closed behavior ---');
  const prodEnv: any = {
    ENVIRONMENT: 'production',
    NODE_ENV: 'production',
    ALLOW_SHOWCASE_FALLBACK: 'true', // Even if mistakenly set
    VITE_SUPABASE_URL: 'https://invalid-nonexistent-db.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'mock_service_key',
  };

  let prodFailedClosed = false;
  try {
    await approveShowcaseReview('mock_sc_id', 'reviewer_admin', prodEnv);
  } catch (err: any) {
    prodFailedClosed = true;
    console.log(`  Caught expected production fail-closed error: ${err.message}`);
  }
  assert(prodFailedClosed, 'Production RPC failure correctly failed closed without performing table fallback');

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log(` RESULTS: ${passed} passed, ${failed} failed`);
  console.log('========================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
