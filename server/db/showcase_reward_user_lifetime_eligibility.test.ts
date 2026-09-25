/**
 * Showcase RM300 Reward User-Level Lifetime Eligibility Regression Test Suite
 *
 * Verifies that the RM300 Showcase Reward is strictly a ONE-TIME PER USER/ACCOUNT OWNER
 * lifetime reward across ALL events and organizations.
 *
 * Tests:
 * TEST 1: User has never claimed RM300 -> Event A submission: ALLOWED.
 * TEST 2: User already has approved RM300 from Event A -> opens Event B: NOT ELIGIBLE.
 * TEST 3: User already has approved RM300 from Event A -> attempts POST submission for Event B: REJECTED (422 LIFETIME_REWARD_EXHAUSTED).
 * TEST 4: User has PENDING RM300 submission for Event A -> attempts Event B: REJECTED (409 SUBMISSION_PENDING).
 * TEST 5: Two simultaneous Event A/B submissions by same user: Only ONE succeeds, race condition prevented.
 * TEST 6: Event A belongs to Org A, Event B belongs to Org B (same owner): Consuming on Org A leaves Org B strictly ineligible.
 * TEST 7: Two different users submit RM300 for their own events: BOTH can be eligible.
 * TEST 8: Admin approves Event A RM300 -> Admin attempts to approve another submission from same user: SECOND approval fails atomically.
 * TEST 9: User changes event_id manually in API request: Authorization and lifetime user checks cannot be bypassed.
 * TEST 10: User submission was REJECTED: User can retry submission if eligible, but cannot have multiple concurrent active submissions.
 */

import assert from 'node:assert';
import crypto from 'node:crypto';
import {
  createShowcaseRewardSubmission,
  getShowcaseRewardSubmissionById,
  getShowcaseRewardSubmissionForEvent,
  getActiveUserShowcaseRewardSubmission,
  approveShowcaseRewardSubmission,
  rejectShowcaseRewardSubmission,
  clearLocalRewardSubmissionsCache,
  localRewardSubmissionsCache,
} from './showcaseRewardSubmissions.js';
import {
  createShowcase,
  updateShowcase,
  getShowcaseByEventId,
  localShowcasesCache,
} from './showcases.js';
import { createShowcaseMedia } from './showcaseMedia.js';
import { localEventsCache } from './events.js';
import { localOrgsCache } from './organizations.js';
import { localMembersCache } from './members.js';
import {
  localWalletsCache,
  localTransactionsCache,
  localUserRewardsCache,
  localOwnerShowcaseRewardsCache,
  getWalletBalance,
} from './wallet.js';
import {
  getShowcaseRewardEligibility,
  hasUserClaimedReward,
} from './rewards.js';

let passed = 0;
let failed = 0;

function reportPass(msg: string) {
  passed++;
  console.log(`  ✓ PASS: ${msg}`);
}

function reportFail(msg: string, err?: any) {
  failed++;
  console.error(`  ✗ FAIL: ${msg}`, err || '');
}

console.log('========================================================================');
console.log(' RUNNING: Showcase RM300 Reward User-Level Lifetime Eligibility Tests');
console.log('========================================================================\n');

async function runTestSuite() {
  // Clear all local caches
  clearLocalRewardSubmissionsCache();
  localShowcasesCache.clear();
  localOwnerShowcaseRewardsCache.clear();
  localEventsCache.clear();
  localOrgsCache.clear();
  localMembersCache.clear();
  localWalletsCache.clear();
  localTransactionsCache.clear();
  localUserRewardsCache.clear();

  const testEnv: Record<string, any> = { ALLOW_LOCAL_FALLBACK: true, NODE_ENV: 'test' };

  // Helper to create test fixtures
  async function setupEventAndShowcase(params: {
    userId: string;
    orgId: string;
    eventId: string;
    showcaseId?: string;
    eventName?: string;
  }) {
    const { userId, orgId, eventId, eventName = 'Corporate Event' } = params;

    // Org
    localOrgsCache.set(orgId, {
      id: orgId,
      name: `Org for ${userId}`,
      owner_id: userId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any);

    // Membership
    localMembersCache.set(`${orgId}:${userId}`, {
      id: crypto.randomUUID(),
      organization_id: orgId,
      user_id: userId,
      role: 'owner',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any);

    // Event (PAID & COMPLETED)
    localEventsCache.set(eventId, {
      id: eventId,
      organization_id: orgId,
      name: eventName,
      start_date: '2026-09-01',
      end_date: '2026-09-02',
      status: 'completed',
      event_status: 'COMPLETED',
      payment_status: 'PAID',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any);

    // Wallet
    localWalletsCache.set(orgId, {
      id: crypto.randomUUID(),
      organization_id: orgId,
      paid_balance: 0,
      welcome_credit: 0,
      showcase_credit: 0,
      showcase_credit_granted: false,
      topup_credit: 0,
      outstanding_balance: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any);

    // Showcase (PUBLISHED, description >= 50 chars, title, 3 photos)
    const scId = params.showcaseId || crypto.randomUUID();
    const showcaseRecord = {
      id: scId,
      event_id: eventId,
      organization_id: orgId,
      title: `${eventName} Showcase`,
      description: 'This is an authentic comprehensive event showcase with extensive description exceeding fifty characters.',
      status: 'PUBLISHED',
      publication_status: 'PUBLISHED',
      reward_status: 'NOT_SUBMITTED',
      reward_review_status: 'PENDING',
      owner_user_id: userId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    localShowcasesCache.set(eventId, showcaseRecord as any);

    // 3 media items
    for (let i = 0; i < 3; i++) {
      await createShowcaseMedia({
        showcase_id: scId,
        organization_id: orgId,
        storage_path: `showcases/${scId}/photo_${i}.jpg`,
        media_url: `https://storage.example.com/showcases/${scId}/photo_${i}.jpg`,
        file_name: `photo_${i}.jpg`,
        file_size: 1024,
        mime_type: 'image/jpeg',
        media_type: 'IMAGE',
      }, testEnv);
    }

    return showcaseRecord;
  }

  // --------------------------------------------------------------------------
  // TEST 1: User has never claimed RM300 -> Event A submission: ALLOWED
  // --------------------------------------------------------------------------
  console.log('--- TEST 1: User has never claimed RM300 -> Event A submission: ALLOWED ---');
  const user1 = crypto.randomUUID();
  const org1A = crypto.randomUUID();
  const event1A = crypto.randomUUID();

  await setupEventAndShowcase({ userId: user1, orgId: org1A, eventId: event1A, eventName: 'User1 Event A' });

  // Check initial eligibility
  const eligBefore = await getShowcaseRewardEligibility(user1, testEnv);
  assert.strictEqual(eligBefore.eligible, true, 'User1 should be eligible initially');
  assert.strictEqual(eligBefore.userRewardStatus, 'ELIGIBLE');

  const sub1A = await createShowcaseRewardSubmission({
    eventId: event1A,
    userId: user1,
    env: testEnv,
  });

  assert.ok(sub1A.id, 'Submission should be created with an ID');
  assert.strictEqual(sub1A.status, 'PENDING', 'Submission status should be PENDING');
  assert.strictEqual(sub1A.user_id, user1, 'Submission must record user1');
  assert.strictEqual(sub1A.event_id, event1A, 'Submission must record event1A');
  reportPass('TEST 1: User can submit showcase for RM300 when they have never claimed');

  // --------------------------------------------------------------------------
  // TEST 2: User already has approved RM300 from Event A -> opens Event B: NOT ELIGIBLE
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 2: User already has approved RM300 from Event A -> opens Event B: NOT ELIGIBLE ---');
  // Admin approves Event A submission
  const reviewerAdmin = crypto.randomUUID();
  const approveResult1A = await approveShowcaseRewardSubmission({
    submissionId: sub1A.id,
    reviewerId: reviewerAdmin,
    env: testEnv,
  });
  assert.strictEqual(approveResult1A.submission.status, 'APPROVED', 'Submission 1A should be APPROVED');

  // Verify wallet received RM300
  const balance1A = await getWalletBalance(org1A, testEnv);
  assert.strictEqual(balance1A.showcase_credit, 300, 'Org1A should have 300 showcase credit');

  // User 1 creates Event B
  const event1B = crypto.randomUUID();
  await setupEventAndShowcase({ userId: user1, orgId: org1A, eventId: event1B, eventName: 'User1 Event B' });

  // Authoritative check on Event B
  const eligEventB = await getShowcaseRewardEligibility(user1, testEnv);
  assert.strictEqual(eligEventB.eligible, false, 'User1 must NOT be eligible on Event B after Event A approval');
  assert.strictEqual(eligEventB.alreadyClaimed, true, 'alreadyClaimed must be true');
  assert.strictEqual(eligEventB.userRewardStatus, 'REWARDED', 'userRewardStatus must be REWARDED');
  assert.strictEqual(eligEventB.code, 'LIFETIME_REWARD_EXHAUSTED', 'code must be LIFETIME_REWARD_EXHAUSTED');
  reportPass('TEST 2: User who has approved RM300 from Event A is NOT eligible on Event B');

  // --------------------------------------------------------------------------
  // TEST 3: User already has approved RM300 from Event A -> attempts POST submission for Event B: REJECTED
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 3: POST submission for Event B directly through API: REJECTED ---');
  let rejectedError: any = null;
  try {
    await createShowcaseRewardSubmission({
      eventId: event1B,
      userId: user1,
      env: testEnv,
    });
  } catch (err: any) {
    rejectedError = err;
  }

  assert.ok(rejectedError, 'POST submission for Event B must throw an error');
  assert.strictEqual(rejectedError.code, 'LIFETIME_REWARD_EXHAUSTED', 'Error code must be LIFETIME_REWARD_EXHAUSTED');
  assert.strictEqual(rejectedError.status, 422, 'Status must be 422');
  assert.ok(
    rejectedError.message.includes('already been claimed') || rejectedError.message.includes('RM300 Showcase Reward'),
    'Error message must clearly state reward has already been claimed'
  );
  reportPass('TEST 3: Direct API POST submission for Event B is rejected with 422 LIFETIME_REWARD_EXHAUSTED');

  // --------------------------------------------------------------------------
  // TEST 4: User has PENDING RM300 submission for Event A -> attempts Event B: REJECTED
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 4: User has PENDING submission on Event A -> attempts Event B: REJECTED ---');
  const user2 = crypto.randomUUID();
  const org2 = crypto.randomUUID();
  const event2A = crypto.randomUUID();
  const event2B = crypto.randomUUID();

  await setupEventAndShowcase({ userId: user2, orgId: org2, eventId: event2A, eventName: 'User2 Event A' });
  await setupEventAndShowcase({ userId: user2, orgId: org2, eventId: event2B, eventName: 'User2 Event B' });

  // User 2 submits Event A -> PENDING
  const sub2A = await createShowcaseRewardSubmission({
    eventId: event2A,
    userId: user2,
    env: testEnv,
  });
  assert.strictEqual(sub2A.status, 'PENDING');

  // Check user2 eligibility across all events
  const elig2 = await getShowcaseRewardEligibility(user2, testEnv);
  assert.strictEqual(elig2.eligible, false, 'User2 should not be eligible while submission 2A is pending');
  assert.strictEqual(elig2.hasPendingSubmission, true, 'hasPendingSubmission must be true');
  assert.strictEqual(elig2.code, 'SUBMISSION_PENDING', 'code must be SUBMISSION_PENDING');

  // User 2 attempts to submit Event B while Event A is pending
  let pendingBlockError: any = null;
  try {
    await createShowcaseRewardSubmission({
      eventId: event2B,
      userId: user2,
      env: testEnv,
    });
  } catch (err: any) {
    pendingBlockError = err;
  }

  assert.ok(pendingBlockError, 'Submission on Event B while Event A is pending must be rejected');
  assert.strictEqual(pendingBlockError.code, 'SUBMISSION_PENDING', 'Error code must be SUBMISSION_PENDING');
  assert.strictEqual(pendingBlockError.status, 409, 'Error status must be 409 Conflict');
  assert.ok(
    pendingBlockError.message.includes('pending review') || pendingBlockError.message.includes('Only one pending submission'),
    'Error message must state a submission is already pending review'
  );
  reportPass('TEST 4: User with a PENDING submission on Event A cannot submit Event B (409 SUBMISSION_PENDING)');

  // --------------------------------------------------------------------------
  // TEST 5: Two simultaneous Event A/B submissions by same user: Only ONE succeeds
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 5: Simultaneous Event A/B submissions by same user: Only ONE succeeds ---');
  const user3 = crypto.randomUUID();
  const org3 = crypto.randomUUID();
  const event3A = crypto.randomUUID();
  const event3B = crypto.randomUUID();

  await setupEventAndShowcase({ userId: user3, orgId: org3, eventId: event3A, eventName: 'Concurrent Event A' });
  await setupEventAndShowcase({ userId: user3, orgId: org3, eventId: event3B, eventName: 'Concurrent Event B' });

  // Fire both simultaneously
  const results = await Promise.allSettled([
    createShowcaseRewardSubmission({ eventId: event3A, userId: user3, env: testEnv }),
    createShowcaseRewardSubmission({ eventId: event3B, userId: user3, env: testEnv }),
  ]);

  const fulfilled = results.filter((r) => r.status === 'fulfilled');
  const rejected = results.filter((r) => r.status === 'rejected');

  assert.strictEqual(fulfilled.length, 1, 'Strictly ONE submission must succeed under concurrency');
  assert.strictEqual(rejected.length, 1, 'The competing concurrent submission must be rejected');

  const rejectedReason: any = (rejected[0] as PromiseRejectedResult).reason;
  assert.ok(
    rejectedReason.code === 'SUBMISSION_PENDING' || rejectedReason.code === 'LIFETIME_REWARD_EXHAUSTED',
    `Rejected concurrent request must have safe business code, got: ${rejectedReason.code}`
  );
  reportPass('TEST 5: Distributed lock and state check ensures only 1 of 2 concurrent submissions succeeds');

  // --------------------------------------------------------------------------
  // TEST 6: Event A belongs to Org A, Event B belongs to Org B (same user owns both)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 6: Cross-Organization Isolation: Consuming on Org A makes Org B ineligible ---');
  const user4 = crypto.randomUUID();
  const org4A = crypto.randomUUID();
  const org4B = crypto.randomUUID();
  const event4A = crypto.randomUUID();
  const event4B = crypto.randomUUID();

  await setupEventAndShowcase({ userId: user4, orgId: org4A, eventId: event4A, eventName: 'Org A Event' });
  await setupEventAndShowcase({ userId: user4, orgId: org4B, eventId: event4B, eventName: 'Org B Event' });

  // User 4 submits and gets approved for Org A Event
  const sub4A = await createShowcaseRewardSubmission({ eventId: event4A, userId: user4, env: testEnv });
  await approveShowcaseRewardSubmission({ submissionId: sub4A.id, reviewerId: reviewerAdmin, env: testEnv });

  // Check Org B Event eligibility
  const elig4B = await getShowcaseRewardEligibility(user4, testEnv);
  assert.strictEqual(elig4B.eligible, false, 'User4 must be ineligible on Org B after reward on Org A');
  assert.strictEqual(elig4B.alreadyClaimed, true, 'alreadyClaimed must be true across organizations');

  let orgBSubmitError: any = null;
  try {
    await createShowcaseRewardSubmission({ eventId: event4B, userId: user4, env: testEnv });
  } catch (err: any) {
    orgBSubmitError = err;
  }
  assert.ok(orgBSubmitError, 'Submission on Org B must fail');
  assert.strictEqual(orgBSubmitError.code, 'LIFETIME_REWARD_EXHAUSTED', 'Must fail with LIFETIME_REWARD_EXHAUSTED');
  reportPass('TEST 6: Reward consumed in Organization A strictly prevents claim in Organization B');

  // --------------------------------------------------------------------------
  // TEST 7: Two different users submit RM300 for their own events: BOTH can be eligible
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 7: Two different users: BOTH can be eligible ---');
  const user5X = crypto.randomUUID();
  const user5Y = crypto.randomUUID();
  const org5X = crypto.randomUUID();
  const org5Y = crypto.randomUUID();
  const event5X = crypto.randomUUID();
  const event5Y = crypto.randomUUID();

  await setupEventAndShowcase({ userId: user5X, orgId: org5X, eventId: event5X, eventName: 'User X Event' });
  await setupEventAndShowcase({ userId: user5Y, orgId: org5Y, eventId: event5Y, eventName: 'User Y Event' });

  const sub5X = await createShowcaseRewardSubmission({ eventId: event5X, userId: user5X, env: testEnv });
  const sub5Y = await createShowcaseRewardSubmission({ eventId: event5Y, userId: user5Y, env: testEnv });

  assert.ok(sub5X.id, 'User X submission succeeds');
  assert.ok(sub5Y.id, 'User Y submission succeeds');
  assert.strictEqual(sub5X.status, 'PENDING');
  assert.strictEqual(sub5Y.status, 'PENDING');
  reportPass('TEST 7: Different users are independently evaluated and can both submit');

  // --------------------------------------------------------------------------
  // TEST 8: Admin approves Event A RM300 -> attempts to approve another submission: MUST FAIL ATOMICALLY
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 8: Admin approves Event A RM300 -> second approval fails atomically ---');
  const user6 = crypto.randomUUID();
  const org6 = crypto.randomUUID();
  const event6A = crypto.randomUUID();
  const event6B = crypto.randomUUID();

  await setupEventAndShowcase({ userId: user6, orgId: org6, eventId: event6A, eventName: 'Event 6A' });
  await setupEventAndShowcase({ userId: user6, orgId: org6, eventId: event6B, eventName: 'Event 6B' });

  // Create submission A
  const sub6A = await createShowcaseRewardSubmission({ eventId: event6A, userId: user6, env: testEnv });

  // Simulate an edge case where submission B was created (e.g. before lock or mock insertion)
  const sc6B = await getShowcaseByEventId(event6B, testEnv);
  const sub6BRecord = {
    id: crypto.randomUUID(),
    showcase_id: sc6B!.id,
    event_id: event6B,
    user_id: user6,
    status: 'PENDING' as const,
    reward_amount: 300,
    submitted_at: new Date().toISOString(),
    reviewed_at: null,
    reviewed_by: null,
    rejection_reason: null,
    reward_transaction_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  localRewardSubmissionsCache.set(sub6BRecord.id, sub6BRecord);

  // Admin approves Submission A
  const app6A = await approveShowcaseRewardSubmission({ submissionId: sub6A.id, reviewerId: reviewerAdmin, env: testEnv });
  assert.strictEqual(app6A.submission.status, 'APPROVED', 'First approval must succeed');

  // Admin attempts to approve Submission B for the same user
  let secondApproveError: any = null;
  try {
    await approveShowcaseRewardSubmission({ submissionId: sub6BRecord.id, reviewerId: reviewerAdmin, env: testEnv });
  } catch (err: any) {
    secondApproveError = err;
  }

  assert.ok(secondApproveError, 'Second approval must fail');
  assert.strictEqual(secondApproveError.code, 'LIFETIME_REWARD_EXHAUSTED', 'Second approval must fail with LIFETIME_REWARD_EXHAUSTED');
  assert.ok(
    secondApproveError.message.includes('invariant violation') || secondApproveError.message.includes('lifetime showcase reward credit'),
    'Error message must state invariant violation'
  );

  // Verify wallet only got 300 once, not 600
  const balance6 = await getWalletBalance(org6, testEnv);
  assert.strictEqual(balance6.showcase_credit, 300, 'Wallet must strictly contain RM300, never RM600');
  reportPass('TEST 8: Admin approval re-checks lifetime user reward state; second approval fails atomically');

  // --------------------------------------------------------------------------
  // TEST 9: User changes event_id manually in API request: Cannot bypass lifetime check
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 9: Manipulating event_id cannot bypass user lifetime checks ---');
  const user7 = crypto.randomUUID();
  const org7 = crypto.randomUUID();
  const event7Real = crypto.randomUUID();
  const fakeEventId = crypto.randomUUID();

  await setupEventAndShowcase({ userId: user7, orgId: org7, eventId: event7Real, eventName: 'Real Event' });

  // Approve reward for user7
  const sub7 = await createShowcaseRewardSubmission({ eventId: event7Real, userId: user7, env: testEnv });
  await approveShowcaseRewardSubmission({ submissionId: sub7.id, reviewerId: reviewerAdmin, env: testEnv });

  // User 7 crafts a request with a fake event_id
  let fakeEventError: any = null;
  try {
    await createShowcaseRewardSubmission({ eventId: fakeEventId, userId: user7, env: testEnv });
  } catch (err: any) {
    fakeEventError = err;
  }
  assert.ok(fakeEventError, 'Request with manipulated event_id must fail');
  reportPass('TEST 9: Manipulated event_id fails and cannot bypass user-level checks');

  // --------------------------------------------------------------------------
  // TEST 10: Rejected submission can be retried once fixed, but no multiple active
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 10: Rejected submission can be retried once, but no multiple active ---');
  const user8 = crypto.randomUUID();
  const org8 = crypto.randomUUID();
  const event8 = crypto.randomUUID();

  await setupEventAndShowcase({ userId: user8, orgId: org8, eventId: event8, eventName: 'Retry Event' });

  const sub8 = await createShowcaseRewardSubmission({ eventId: event8, userId: user8, env: testEnv });
  assert.strictEqual(sub8.status, 'PENDING');

  // Admin rejects submission
  const rej8 = await rejectShowcaseRewardSubmission({
    submissionId: sub8.id,
    reviewerId: reviewerAdmin,
    rejectionReason: 'Please provide clearer event branding photos.',
    env: testEnv,
  });
  assert.strictEqual(rej8.submission.status, 'REJECTED');

  // Since user never received reward and has no pending submission now, they can resubmit
  const elig8AfterReject = await getShowcaseRewardEligibility(user8, testEnv);
  assert.strictEqual(elig8AfterReject.eligible, true, 'User should be eligible to resubmit after rejection');

  const resub8 = await createShowcaseRewardSubmission({ eventId: event8, userId: user8, env: testEnv });
  assert.strictEqual(resub8.status, 'PENDING', 'Resubmission should now be pending');

  // But trying to submit a second time while resub8 is pending must be rejected
  let duplicateActiveError: any = null;
  try {
    await createShowcaseRewardSubmission({ eventId: event8, userId: user8, env: testEnv });
  } catch (err: any) {
    duplicateActiveError = err;
  }
  assert.ok(duplicateActiveError, 'Multiple active submissions must still be blocked');
  assert.strictEqual(duplicateActiveError.code, 'SUBMISSION_PENDING');
  reportPass('TEST 10: Rejection allows single clean retry; prevents multiple concurrent submissions');

  // --------------------------------------------------------------------------
  // TEST 11: getActiveUserShowcaseRewardSubmission returns the active record
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 11: getActiveUserShowcaseRewardSubmission returns user active record ---');
  const activeSub = await getActiveUserShowcaseRewardSubmission(user8, testEnv);
  assert.ok(activeSub, 'Should find active submission for user8');
  assert.strictEqual(activeSub.id, resub8.id);
  assert.strictEqual(activeSub.status, 'PENDING');
  reportPass('TEST 11: getActiveUserShowcaseRewardSubmission resolves user active claim correctly');

  console.log('\n========================================================================');
  console.log(` ALL TESTS COMPLETED: ${passed} Passed, ${failed} Failed`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
