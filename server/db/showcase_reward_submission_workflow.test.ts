/**
 * Showcase RM300 Reward Submission Workflow Test Suite
 * 
 * Verifies all 13 critical requirements:
 * Test 1: eligible user submits showcase for reward -> submission created -> status PENDING
 * Test 2: non-owner submits -> rejected / forbidden
 * Test 3: user submits unpublished / incomplete showcase -> rejected with clear validation error
 * Test 4: user submits when they already received RM300 showcase reward on another event -> rejected (lifetime limit)
 * Test 5: user submits while a submission is already pending -> duplicate rejected
 * Test 6: user submits after a previous submission was rejected -> properly handles re-evaluation
 * Test 7: admin views pending queue -> sees submitted showcase
 * Test 8: admin approves submission -> grants RM300 once -> submission status APPROVED -> wallet balance increases by 300
 * Test 9: admin tries to approve already approved submission -> idempotent / prevents second reward
 * Test 10: admin rejects submission -> submission status REJECTED -> no wallet credit granted
 * Test 11: rejected submission disappears from pending queue
 * Test 12: approved submission disappears from pending queue
 * Test 13: concurrent approval attempts do not double credit RM300
 */

import {
  createShowcaseRewardSubmission,
  getShowcaseRewardSubmissionById,
  getShowcaseRewardSubmissionForEvent,
  getPendingRewardSubmissions,
  approveShowcaseRewardSubmission,
  rejectShowcaseRewardSubmission,
  clearLocalRewardSubmissionsCache,
} from './showcaseRewardSubmissions.js';
import {
  createShowcase,
  localShowcasesCache,
  updateShowcase,
} from './showcases.js';
import { createShowcaseMedia } from './showcaseMedia.js';
import { localOrgsCache, createOrganization } from './organizations.js';
import { localEventsCache, createEvent } from './events.js';
import { localMembersCache } from './members.js';
import {
  localWalletsCache,
  localTransactionsCache,
  localUserRewardsCache,
  localOwnerShowcaseRewardsCache,
  getWalletBalance,
} from './wallet.js';
import { EventRecord, OrganizationRecord, UserRecord, OrgMemberRecord, OrganizationWalletRecord } from './types.js';
import fs from 'node:fs';
import path from 'node:path';

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
console.log(' RUNNING: Showcase RM300 Reward Submission Workflow Test Suite');
console.log('========================================================================\n');

async function runTests() {
  process.env.NODE_ENV = 'development';

  // Clean local upload json files for a pristine test run
  const uploadsDir = path.join(process.cwd(), 'uploads');
  for (const f of ['showcases.json', 'showcase_media.json', 'showcase_reward_submissions.json']) {
    const p = path.join(uploadsDir, f);
    if (fs.existsSync(p)) {
      try {
        fs.unlinkSync(p);
      } catch {}
    }
  }

  // Clear caches
  clearLocalRewardSubmissionsCache();
  localShowcasesCache.clear();
  localOwnerShowcaseRewardsCache.clear();
  localEventsCache.clear();
  localOrgsCache.clear();
  localMembersCache.clear();
  localWalletsCache.clear();
  localTransactionsCache.clear();
  localUserRewardsCache.clear();

  // Setup Test Fixtures
  const ownerUser: UserRecord = {
    id: 'user_owner_workflow_001',
    google_id: null,
    avatar_url: null,
    email: 'owner1@example.com',
    name: 'Owner One',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const memberUser: UserRecord = {
    id: 'user_member_workflow_002',
    google_id: null,
    avatar_url: null,
    email: 'member@example.com',
    name: 'Member Two',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const adminUser: UserRecord = {
    id: 'user_admin_workflow_003',
    google_id: null,
    avatar_url: null,
    email: 'admin@platform.com',
    name: 'Admin Developer',
    is_developer: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const org: OrganizationRecord = {
    id: 'org_workflow_001',
    name: 'Acme Events Co',
    slug: 'acme-events',
    owner_id: ownerUser.id,
    logo_url: null,
    country_code: 'MY',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  localOrgsCache.set(org.id, org);

  // Initialize wallet for org
  localWalletsCache.set(org.id, {
    id: 'wallet_' + org.id,
    organization_id: org.id,
    paid_balance: 0,
    welcome_credit: 0,
    showcase_credit: 0,
    topup_credit: 0,
    currency: 'MYR',
    welcome_credit_granted: false,
    showcase_credit_granted: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  // Owner membership
  const ownerMember: OrgMemberRecord = {
    id: 'mem_owner_001',
    organization_id: org.id,
    user_id: ownerUser.id,
    role: 'owner',
    created_at: new Date().toISOString(),
  };
  localMembersCache.set(ownerMember.id, ownerMember);

  // Non-owner member
  const nonOwnerMember: OrgMemberRecord = {
    id: 'mem_nonowner_002',
    organization_id: org.id,
    user_id: memberUser.id,
    role: 'admin',
    created_at: new Date().toISOString(),
  };
  localMembersCache.set(nonOwnerMember.id, nonOwnerMember);

  // Completed & paid event
  const completedPaidEvent: EventRecord = {
    id: 'event_completed_001',
    organization_id: org.id,
    game_theme_id: 'theme_001',
    public_token: 'token_001',
    starts_at: '2026-01-01T00:00:00.000Z',
    expires_at: '2026-01-02T23:59:59.999Z',
    name: 'Annual Gala 2026',
    status: 'completed',
    payment_status: 'PAID',
    game_id: 'catch-brand',
    start_date: '2026-01-01',
    end_date: '2026-01-02',
    created_at: new Date('2026-01-01').toISOString(),
    updated_at: new Date('2026-01-03').toISOString(),
  };
  localEventsCache.set(completedPaidEvent.id, completedPaidEvent);

  // Create showcase for the event (initial status PUBLISHED, but no media yet)
  const showcase = await createShowcase({
    event_id: completedPaidEvent.id,
    organization_id: org.id,
    title: 'Annual Gala 2026 Showcase',
    description: 'An awesome carnival game activation for 500 attendees.',
    client_name: 'Acme Corp',
    cover_image_url: 'https://example.com/cover.jpg',
    status: 'PUBLISHED',
  });

  // -------------------------------------------------------------------------
  // Test 3: user submits unpublished / incomplete showcase -> rejected
  // -------------------------------------------------------------------------
  console.log('\n--- Scenario 1: Unpublished & Incomplete Showcase Validation (Test 3) ---');
  // Part A: Incomplete media (0 photos)
  try {
    await createShowcaseRewardSubmission({
      eventId: completedPaidEvent.id,
      userId: ownerUser.id,
    });
    assert(false, 'Test 3 Failed: Should reject submission for incomplete showcase (missing media)');
  } catch (err: any) {
    assert(
      err.message.includes('photos') || err.message.includes('media') || err.message.includes('qualify') || err.code === 'INSUFFICIENT_MEDIA',
      `Test 3A Passed: Rejected incomplete showcase lacking media (${err.message})`
    );
  }

  // Part B: Unpublish the showcase and test publication validation
  await updateShowcase(completedPaidEvent.id, {
    status: 'UNPUBLISHED',
  });

  try {
    await createShowcaseRewardSubmission({
      eventId: completedPaidEvent.id,
      userId: ownerUser.id,
    });
    assert(false, 'Test 3 Failed: Should reject submission for unpublished showcase');
  } catch (err: any) {
    assert(
      err.message.includes('published') || err.message.includes('PUBLISHED') || err.code === 'SHOWCASE_NOT_PUBLISHED',
      `Test 3B Passed: Rejected submission for unpublished showcase (${err.message})`
    );
  }

  // Re-publish the showcase and add 3 photos to satisfy completeness
  await updateShowcase(completedPaidEvent.id, {
    status: 'PUBLISHED',
  });

  await createShowcaseMedia({
    showcase_id: showcase.id,
    organization_id: org.id,
    media_type: 'IMAGE',
    media_url: 'https://example.com/photo1.jpg',
    file_name: 'photo1.jpg',
    file_size: 1024,
    mime_type: 'image/jpeg',
  });
  await createShowcaseMedia({
    showcase_id: showcase.id,
    organization_id: org.id,
    media_type: 'IMAGE',
    media_url: 'https://example.com/photo2.jpg',
    file_name: 'photo2.jpg',
    file_size: 1024,
    mime_type: 'image/jpeg',
  });
  await createShowcaseMedia({
    showcase_id: showcase.id,
    organization_id: org.id,
    media_type: 'IMAGE',
    media_url: 'https://example.com/photo3.jpg',
    file_name: 'photo3.jpg',
    file_size: 1024,
    mime_type: 'image/jpeg',
  });

  // -------------------------------------------------------------------------
  // Test 2: non-owner submits -> rejected / forbidden
  // -------------------------------------------------------------------------
  console.log('\n--- Scenario 2: Non-Owner Submission Guard ---');
  try {
    await createShowcaseRewardSubmission({
      eventId: completedPaidEvent.id,
      userId: memberUser.id, // non-owner
    });
    assert(false, 'Test 2 Failed: Should reject submission from non-owner');
  } catch (err: any) {
    assert(
      err.message.includes('owner') || err.message.includes('Owner') || err.status === 403,
      `Test 2 Passed: Rejected non-owner submission (${err.message})`
    );
  }

  // -------------------------------------------------------------------------
  // Test 1: eligible user submits showcase for reward -> submission created -> status PENDING
  // -------------------------------------------------------------------------
  console.log('\n--- Scenario 3: Eligible User Submission (Test 1) ---');
  const submission = await createShowcaseRewardSubmission({
    eventId: completedPaidEvent.id,
    userId: ownerUser.id,
  });

  assert(Boolean(submission.id), 'Test 1 Passed: Submission ID created');
  assertEqual(submission.status, 'PENDING', 'Test 1 Passed: Initial status is PENDING');
  assertEqual(submission.reward_amount, 300, 'Test 1 Passed: Reward amount is 300');
  assertEqual(submission.user_id, ownerUser.id, 'Test 1 Passed: User ID matches owner');
  assertEqual(submission.event_id, completedPaidEvent.id, 'Test 1 Passed: Event ID matches');

  // Verify retrieval
  const fetchedSub = await getShowcaseRewardSubmissionForEvent(completedPaidEvent.id);
  assert(Boolean(fetchedSub), 'Submission can be retrieved for event');
  assertEqual(fetchedSub?.id, submission.id, 'Retrieved submission matches created');

  // -------------------------------------------------------------------------
  // Test 5: user submits while a submission is already pending -> duplicate rejected
  // -------------------------------------------------------------------------
  console.log('\n--- Scenario 4: Duplicate Submission Guard (Test 5) ---');
  try {
    await createShowcaseRewardSubmission({
      eventId: completedPaidEvent.id,
      userId: ownerUser.id,
    });
    assert(false, 'Test 5 Failed: Should reject second submission while first is pending');
  } catch (err: any) {
    assert(
      err.message.includes('pending') || err.message.includes('already submitted') || err.status === 409,
      `Test 5 Passed: Duplicate submission prevented (${err.message})`
    );
  }

  // -------------------------------------------------------------------------
  // Test 7: admin views pending queue -> sees submitted showcase
  // -------------------------------------------------------------------------
  console.log('\n--- Scenario 5: Admin Pending Queue View (Test 7) ---');
  const pendingQueue = await getPendingRewardSubmissions(undefined, 'PENDING');
  assert(pendingQueue.length >= 1, `Test 7 Passed: Pending queue contains item(s) (count: ${pendingQueue.length})`);
  const foundInQueue = pendingQueue.find((q) => q.id === submission.id || q.submission_id === submission.id);
  assert(Boolean(foundInQueue), 'Test 7 Passed: Created submission is present in pending queue');

  // -------------------------------------------------------------------------
  // Test 10: admin rejects submission -> submission status REJECTED -> no wallet credit granted
  // -------------------------------------------------------------------------
  console.log('\n--- Scenario 6: Admin Rejects Submission (Test 10 & 11) ---');
  const rejectionResult = await rejectShowcaseRewardSubmission({
    submissionId: submission.id,
    reviewerId: adminUser.id,
    rejectionReason: 'Please add higher-resolution photos of the actual event setup.',
  });

  assertEqual(rejectionResult.submission.status, 'REJECTED', 'Test 10 Passed: Status is REJECTED');
  assertEqual(
    rejectionResult.submission.rejection_reason,
    'Please add higher-resolution photos of the actual event setup.',
    'Test 10 Passed: Rejection reason recorded'
  );

  const walletAfterReject = await getWalletBalance(org.id);
  assertEqual(walletAfterReject.showcase_credit, 0, 'Test 10 Passed: No wallet credit granted upon rejection');

  // Test 11: rejected submission disappears from pending queue
  const queueAfterReject = await getPendingRewardSubmissions(undefined, 'PENDING');
  const inQueueAfterReject = queueAfterReject.some((q) => q.id === submission.id || q.submission_id === submission.id);
  assert(!inQueueAfterReject, 'Test 11 Passed: Rejected submission removed from PENDING queue');

  // -------------------------------------------------------------------------
  // Test 6: user re-submits after rejection -> handles new submission
  // -------------------------------------------------------------------------
  console.log('\n--- Scenario 7: Resubmission After Rejection (Test 6) ---');
  const resubmission = await createShowcaseRewardSubmission({
    eventId: completedPaidEvent.id,
    userId: ownerUser.id,
  });
  assertEqual(resubmission.status, 'PENDING', 'Test 6 Passed: Resubmission created with status PENDING');

  // -------------------------------------------------------------------------
  // Test 8: admin approves submission -> grants RM300 once -> status APPROVED -> wallet increases
  // -------------------------------------------------------------------------
  console.log('\n--- Scenario 8: Admin Approval & RM300 Credit (Test 8 & 12) ---');
  const initialWallet = await getWalletBalance(org.id);
  const approveResult = await approveShowcaseRewardSubmission({
    submissionId: resubmission.id,
    reviewerId: adminUser.id,
  });

  assertEqual(approveResult.submission.status, 'APPROVED', 'Test 8 Passed: Submission status is APPROVED');
  assert(!approveResult.alreadyRewarded, 'Test 8 Passed: First approval is not alreadyRewarded');
  const rewardTxnId = approveResult.submission.reward_transaction_id || approveResult.showcase?.reward_transaction_id || approveResult.reward?.transaction?.id;
  assert(Boolean(rewardTxnId), 'Test 8 Passed: Reward transaction ID generated');

  const updatedWallet = await getWalletBalance(org.id);
  assertEqual(
    updatedWallet.showcase_credit,
    initialWallet.showcase_credit + 300,
    'Test 8 Passed: Wallet showcase credit increased exactly by RM300'
  );

  // Test 12: approved submission disappears from pending queue
  const queueAfterApprove = await getPendingRewardSubmissions(undefined, 'PENDING');
  const inQueueAfterApprove = queueAfterApprove.some((q) => q.id === resubmission.id || q.submission_id === resubmission.id);
  assert(!inQueueAfterApprove, 'Test 12 Passed: Approved submission removed from PENDING queue');

  // -------------------------------------------------------------------------
  // Test 9: admin tries to approve already approved submission -> idempotent / prevents second reward
  // -------------------------------------------------------------------------
  console.log('\n--- Scenario 9: Idempotent Double-Approval Guard (Test 9) ---');
  const secondApproval = await approveShowcaseRewardSubmission({
    submissionId: resubmission.id,
    reviewerId: adminUser.id,
  });

  assert(secondApproval.alreadyRewarded === true, 'Test 9 Passed: Flags alreadyRewarded === true');
  const walletAfterSecondApprove = await getWalletBalance(org.id);
  assertEqual(
    walletAfterSecondApprove.showcase_credit,
    updatedWallet.showcase_credit,
    'Test 9 Passed: Second approval does NOT add any additional credit'
  );

  // -------------------------------------------------------------------------
  // Test 4: user submits when they already received RM300 showcase reward on another event -> rejected
  // -------------------------------------------------------------------------
  console.log('\n--- Scenario 10: Lifetime Limit Across Events (Test 4) ---');
  // Create second completed event for same owner
  const secondEvent: EventRecord = {
    id: 'event_completed_002',
    organization_id: org.id,
    game_theme_id: 'theme_002',
    public_token: 'token_002',
    starts_at: '2026-03-01T00:00:00.000Z',
    expires_at: '2026-03-02T23:59:59.999Z',
    name: 'Spring Conference 2026',
    status: 'completed',
    payment_status: 'PAID',
    game_id: 'memory-match',
    start_date: '2026-03-01',
    end_date: '2026-03-02',
    created_at: new Date('2026-03-01').toISOString(),
    updated_at: new Date('2026-03-03').toISOString(),
  };
  localEventsCache.set(secondEvent.id, secondEvent);

  const secondShowcase = await createShowcase({
    event_id: secondEvent.id,
    organization_id: org.id,
    title: 'Spring Conference Showcase',
    description: 'A comprehensive spring conference event showcase featuring great audience engagement and games.',
    client_name: 'Spring Co',
    cover_image_url: 'https://example.com/cover2.jpg',
  });
  await createShowcaseMedia({
    showcase_id: secondShowcase.id,
    organization_id: org.id,
    media_type: 'IMAGE',
    media_url: 'https://example.com/photo2-1.jpg',
    file_name: 'photo2-1.jpg',
    file_size: 1024,
    mime_type: 'image/jpeg',
  });
  await createShowcaseMedia({
    showcase_id: secondShowcase.id,
    organization_id: org.id,
    media_type: 'IMAGE',
    media_url: 'https://example.com/photo2-2.jpg',
    file_name: 'photo2-2.jpg',
    file_size: 1024,
    mime_type: 'image/jpeg',
  });
  await createShowcaseMedia({
    showcase_id: secondShowcase.id,
    organization_id: org.id,
    media_type: 'IMAGE',
    media_url: 'https://example.com/photo2-3.jpg',
    file_name: 'photo2-3.jpg',
    file_size: 1024,
    mime_type: 'image/jpeg',
  });
  await updateShowcase(secondEvent.id, {
    status: 'PUBLISHED',
  });

  try {
    await createShowcaseRewardSubmission({
      eventId: secondEvent.id,
      userId: ownerUser.id,
    });
    assert(false, 'Test 4 Failed: Should reject submission for user who already claimed reward');
  } catch (err: any) {
    assert(
      err.message.toLowerCase().includes('already') ||
      err.message.toLowerCase().includes('lifetime') ||
      err.code === 'LIFETIME_REWARD_EXHAUSTED' ||
      err.status === 422 ||
      err.status === 400,
      `Test 4 Passed: Lifetime limit enforced across events (${err.message})`
    );
  }

  // -------------------------------------------------------------------------
  // Test 13: concurrent approval attempts do not double credit RM300
  // -------------------------------------------------------------------------
  console.log('\n--- Scenario 11: Concurrent Approvals Race-Condition Guard (Test 13) ---');
  // Create an un-rewarded owner for concurrency test
  const concurrentOwner: UserRecord = {
    id: 'user_owner_concurrent_999',
    google_id: null,
    avatar_url: null,
    email: 'concurrent@example.com',
    name: 'Concurrent Owner',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const concurrentOrg: OrganizationRecord = {
    id: 'org_concurrent_999',
    name: 'Concurrent Org',
    slug: 'concurrent-org',
    owner_id: concurrentOwner.id,
    logo_url: null,
    country_code: 'MY',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  localOrgsCache.set(concurrentOrg.id, concurrentOrg);

  localWalletsCache.set(concurrentOrg.id, {
    id: 'wallet_' + concurrentOrg.id,
    organization_id: concurrentOrg.id,
    paid_balance: 0,
    welcome_credit: 0,
    showcase_credit: 0,
    topup_credit: 0,
    currency: 'MYR',
    welcome_credit_granted: false,
    showcase_credit_granted: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const concurrentMember: OrgMemberRecord = {
    id: 'mem_concurrent_999',
    organization_id: concurrentOrg.id,
    user_id: concurrentOwner.id,
    role: 'owner',
    created_at: new Date().toISOString(),
  };
  localMembersCache.set(concurrentMember.id, concurrentMember);

  const concurrentEvent: EventRecord = {
    id: 'event_concurrent_999',
    organization_id: concurrentOrg.id,
    game_theme_id: 'theme_999',
    public_token: 'token_999',
    starts_at: '2026-05-01T00:00:00.000Z',
    expires_at: '2026-05-02T23:59:59.999Z',
    name: 'Concurrent Festival',
    status: 'completed',
    payment_status: 'PAID',
    game_id: 'reaction-tap',
    start_date: '2026-05-01',
    end_date: '2026-05-02',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  localEventsCache.set(concurrentEvent.id, concurrentEvent);

  const concurrentShowcase = await createShowcase({
    event_id: concurrentEvent.id,
    organization_id: concurrentOrg.id,
    title: 'Concurrent Festival Showcase',
    description: 'A great concurrent festival showcase activation demonstrating awesome live interactive gameplay for guests.',
    client_name: 'Concurrent Festival',
    cover_image_url: 'https://example.com/cover3.jpg',
  });
  await createShowcaseMedia({
    showcase_id: concurrentShowcase.id,
    organization_id: concurrentOrg.id,
    media_type: 'IMAGE',
    media_url: 'https://example.com/photo3-1.jpg',
    file_name: 'photo3-1.jpg',
    file_size: 1024,
    mime_type: 'image/jpeg',
  });
  await createShowcaseMedia({
    showcase_id: concurrentShowcase.id,
    organization_id: concurrentOrg.id,
    media_type: 'IMAGE',
    media_url: 'https://example.com/photo3-2.jpg',
    file_name: 'photo3-2.jpg',
    file_size: 1024,
    mime_type: 'image/jpeg',
  });
  await createShowcaseMedia({
    showcase_id: concurrentShowcase.id,
    organization_id: concurrentOrg.id,
    media_type: 'IMAGE',
    media_url: 'https://example.com/photo3-3.jpg',
    file_name: 'photo3-3.jpg',
    file_size: 1024,
    mime_type: 'image/jpeg',
  });
  await updateShowcase(concurrentEvent.id, {
    status: 'PUBLISHED',
  });

  const concurrentSubmission = await createShowcaseRewardSubmission({
    eventId: concurrentEvent.id,
    userId: concurrentOwner.id,
  });

  // Launch 5 concurrent approval calls simultaneously
  const results = await Promise.all([
    approveShowcaseRewardSubmission({ submissionId: concurrentSubmission.id, reviewerId: adminUser.id }),
    approveShowcaseRewardSubmission({ submissionId: concurrentSubmission.id, reviewerId: adminUser.id }),
    approveShowcaseRewardSubmission({ submissionId: concurrentSubmission.id, reviewerId: adminUser.id }),
    approveShowcaseRewardSubmission({ submissionId: concurrentSubmission.id, reviewerId: adminUser.id }),
    approveShowcaseRewardSubmission({ submissionId: concurrentSubmission.id, reviewerId: adminUser.id }),
  ]);

  const freshlyRewardedCount = results.filter((r) => r.alreadyRewarded === false).length;
  const alreadyRewardedCount = results.filter((r) => r.alreadyRewarded === true).length;

  assertEqual(freshlyRewardedCount, 1, 'Test 13 Passed: Exactly one call successfully granted reward');
  assertEqual(alreadyRewardedCount, 4, 'Test 13 Passed: 4 calls safely returned alreadyRewarded === true');

  const concurrentWallet = await getWalletBalance(concurrentOrg.id);
  assertEqual(
    concurrentWallet.showcase_credit,
    300,
    'Test 13 Passed: Wallet credited exactly RM300 (zero double crediting under concurrency)'
  );

  console.log('\n========================================================================');
  console.log(` SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
