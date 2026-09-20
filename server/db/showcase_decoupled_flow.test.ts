/**
 * Server-Side Tests for Decoupled Showcase Flow:
 * - Showcase publishing does NOT require admin approval (self-serve).
 * - Public visibility depends strictly on status = 'PUBLISHED' (and not BLOCKED/DELETED).
 * - RM300 First-Event Reward lifecycle is completely separated from publishing.
 * - Admin reward approval / rejection does NOT alter showcase publication status.
 * - Admin moderation (BLOCK / UNBLOCK / DELETE) functions as expected.
 */

import crypto from 'node:crypto';
import { localEventsCache } from './events.js';
import { localOrgsCache } from './organizations.js';
import { createShowcaseMedia } from './showcaseMedia.js';
import {
  createShowcase,
  publishShowcase,
  unpublishShowcase,
  blockShowcase,
  unblockShowcase,
  adminDeleteShowcase,
  deleteShowcase,
  approveShowcaseReward,
  rejectShowcaseReward,
  getShowcaseById,
  getShowcaseByEventId,
  localShowcasesCache,
} from './showcases.js';
import { getWalletBalance, SHOWCASE_CREDIT_AMOUNT } from './wallet.js';

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
    console.log(`  ✓ PASS: ${message} (expected ${expected}, got ${actual})`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${message} (expected ${expected}, got ${actual})`);
  }
}

async function runTests() {
  console.log('========================================================================');
  console.log(' RUNNING: Decoupled Showcase Architecture & Moderation Tests');
  console.log('========================================================================\n');

  const testOrgId = crypto.randomUUID();
  const testOwnerId = crypto.randomUUID();
  const testEventId1 = crypto.randomUUID();
  const testEventId2 = crypto.randomUUID();

  // Seed org
  localOrgsCache.set(testOrgId, {
    id: testOrgId,
    name: 'Test Corp',
    slug: 'test-corp',
    owner_id: testOwnerId,
    country_code: 'MY',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as any);

  // Seed events
  localEventsCache.set(testEventId1, {
    id: testEventId1,
    organization_id: testOrgId,
    name: 'Brand Launch 2026',
    game_theme_id: '1a480be3-5313-49ba-a9c2-f5b2293576cf',
    status: 'COMPLETED',
    event_status: 'COMPLETED',
    payment_status: 'PAID',
    event_date: '2026-09-01',
    start_date: '2026-09-01',
    end_date: '2026-09-02',
    starts_at: '2026-09-01T00:00:00.000Z',
    expires_at: '2026-09-02T23:59:59.000Z',
    public_token: 'TOK1',
    created_by: testOwnerId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as any);

  localEventsCache.set(testEventId2, {
    id: testEventId2,
    organization_id: testOrgId,
    name: 'Spring Festival Kiosk',
    game_theme_id: '1a480be3-5313-49ba-a9c2-f5b2293576cf',
    status: 'COMPLETED',
    event_status: 'COMPLETED',
    payment_status: 'PAID',
    event_date: '2026-09-01',
    start_date: '2026-09-01',
    end_date: '2026-09-02',
    starts_at: '2026-09-01T00:00:00.000Z',
    expires_at: '2026-09-02T23:59:59.000Z',
    public_token: 'TOK2',
    created_by: testOwnerId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as any);

  // --------------------------------------------------------------------------
  // TEST 1: Showcase Publishing is Self-Serve (No Admin Approval Required)
  // --------------------------------------------------------------------------
  console.log('--- Test 1: Showcase Publishing is Self-Serve ---');
  const sc1 = await createShowcase({
    event_id: testEventId1,
    organization_id: testOrgId,
    created_by: testOwnerId,
    title: 'Brand Launch 2026',
    description: 'Successful nationwide kiosk activation with 5,000 attendees.',
    client_name: 'Acme Corp',
    status: 'DRAFT',
  });

  assertEqual(sc1.status, 'DRAFT', 'Newly created showcase can start as DRAFT');
  assertEqual(sc1.review_status, 'DRAFT', 'Initial review_status is DRAFT');

  // Add 3 photos for RM300 reward eligibility
  for (let i = 1; i <= 3; i++) {
    await createShowcaseMedia({
      showcase_id: sc1.id,
      organization_id: testOrgId,
      media_type: 'IMAGE',
      media_url: `https://example.com/photo${i}.jpg`,
      file_name: `photo${i}.jpg`,
      file_size: 102400,
      mime_type: 'image/jpeg',
      sort_order: i - 1,
    });
  }

  // Publish without any admin intervention
  const publishedSc1 = await publishShowcase(testEventId1);
  assert(!!publishedSc1, 'publishShowcase returns published showcase');
  assertEqual(publishedSc1?.status, 'PUBLISHED', 'Showcase status is PUBLISHED immediately');
  assertEqual(publishedSc1?.publication_status, 'PUBLISHED', 'publication_status is PUBLISHED');
  assert(publishedSc1?.published_at !== null, 'published_at timestamp is set upon publishing');

  // --------------------------------------------------------------------------
  // TEST 2: Public Visibility Checks
  // --------------------------------------------------------------------------
  console.log('\n--- Test 2: Public Visibility Rules ---');
  // Check public visibility rule: status === 'PUBLISHED' && status !== 'BLOCKED' && status !== 'DELETED'
  const isPubliclyVisible = (sc: any) =>
    (sc.status === 'PUBLISHED' || sc.publication_status === 'PUBLISHED') &&
    sc.status !== 'BLOCKED' &&
    sc.status !== 'DELETED';

  assert(isPubliclyVisible(publishedSc1!), 'Published showcase is publicly visible');

  // Unpublish
  const unpublishedSc1 = await unpublishShowcase(testEventId1);
  assertEqual(unpublishedSc1?.status, 'UNPUBLISHED', 'Unpublished showcase status is UNPUBLISHED');
  assertEqual(isPubliclyVisible(unpublishedSc1!), false, 'Unpublished showcase is NOT publicly visible');

  // Re-publish
  const republishedSc1 = await publishShowcase(testEventId1);
  assertEqual(republishedSc1?.status, 'PUBLISHED', 'Re-published showcase status is PUBLISHED');
  assertEqual(isPubliclyVisible(republishedSc1!), true, 'Re-published showcase is publicly visible again');

  // --------------------------------------------------------------------------
  // TEST 3: RM300 Reward Approval Does NOT Alter Publication Status
  // --------------------------------------------------------------------------
  console.log('\n--- Test 3: Reward Approval Decoupled from Publication Status ---');
  // Mock reward state to AWAITING_APPROVAL
  republishedSc1!.reward_review_status = 'AWAITING_APPROVAL';
  republishedSc1!.reward_status = 'PENDING';
  localShowcasesCache.set(republishedSc1!.event_id, republishedSc1!);

  const rewardApprovalResult = await approveShowcaseReward(republishedSc1!.id, 'admin-user-1');
  assert(!!rewardApprovalResult.showcase && !rewardApprovalResult.alreadyRewarded, 'approveShowcaseReward succeeds');
  
  const sc1AfterReward = await getShowcaseById(republishedSc1!.id);
  assertEqual(sc1AfterReward?.reward_review_status, 'REWARDED', 'reward_review_status transitioned to REWARDED');
  assertEqual(sc1AfterReward?.reward_status, 'REWARDED', 'reward_status transitioned to REWARDED');
  assertEqual(sc1AfterReward?.status, 'PUBLISHED', 'Showcase status REMAINS PUBLISHED after reward approval');
  assertEqual(isPubliclyVisible(sc1AfterReward!), true, 'Showcase remains publicly visible after reward approval');

  // --------------------------------------------------------------------------
  // TEST 4: Reward Rejection Does NOT Unpublish or Block Showcase
  // --------------------------------------------------------------------------
  console.log('\n--- Test 4: Reward Rejection Does NOT Unpublish Showcase ---');
  const sc2 = await createShowcase({
    event_id: testEventId2,
    organization_id: testOrgId,
    created_by: testOwnerId,
    title: 'Spring Festival Kiosk',
    description: 'Interactive speed quiz game activation at shopping mall.',
    client_name: 'Metro Mall',
    status: 'PUBLISHED',
  });

  assertEqual(sc2.status, 'PUBLISHED', 'Showcase 2 created and published');
  assertEqual(isPubliclyVisible(sc2), true, 'Showcase 2 is publicly visible');

  // Admin declines the reward (e.g. insufficient photos for RM300 credit)
  const rejectionResult = await rejectShowcaseReward(sc2.id, 'admin-user-1', 'Need more attendee photos for credit grant');
  assert(!!rejectionResult && rejectionResult.reward_review_status === 'REJECTED', 'rejectShowcaseReward succeeds');

  const sc2AfterRejection = await getShowcaseById(sc2.id);
  assertEqual(sc2AfterRejection?.reward_review_status, 'REJECTED', 'reward_review_status is REJECTED');
  assertEqual(sc2AfterRejection?.reward_rejection_reason, 'Need more attendee photos for credit grant', 'Rejection reason is stored');
  assertEqual(sc2AfterRejection?.status, 'PUBLISHED', 'Showcase status REMAINS PUBLISHED despite reward rejection');
  assertEqual(isPubliclyVisible(sc2AfterRejection!), true, 'Showcase 2 remains publicly visible');

  // --------------------------------------------------------------------------
  // TEST 5: Admin Moderation Pipeline (BLOCK & UNBLOCK)
  // --------------------------------------------------------------------------
  console.log('\n--- Test 5: Admin Moderation (BLOCK & UNBLOCK) ---');
  // Admin blocks showcase due to moderation issue
  const blockedSc2 = await blockShowcase(sc2.id, 'admin-user-1', 'Inappropriate logo uploaded');
  assert(!!blockedSc2, 'blockShowcase returns updated showcase');
  assertEqual(blockedSc2?.status, 'BLOCKED', 'Showcase status is BLOCKED');
  assertEqual(blockedSc2?.moderation_reason, 'Inappropriate logo uploaded', 'Moderation reason recorded');
  assertEqual(isPubliclyVisible(blockedSc2!), false, 'Blocked showcase is NOT publicly visible');

  // Admin unblocks showcase
  const unblockedSc2 = await unblockShowcase(sc2.id, 'admin-user-1', 'Issue resolved by organizer');
  assert(!!unblockedSc2, 'unblockShowcase returns updated showcase');
  assertEqual(unblockedSc2?.status, 'PUBLISHED', 'Unblocked showcase restored to PUBLISHED');
  assertEqual(isPubliclyVisible(unblockedSc2!), true, 'Unblocked showcase is publicly visible again');

  // --------------------------------------------------------------------------
  // TEST 6: Soft Deletion
  // --------------------------------------------------------------------------
  console.log('\n--- Test 6: Showcase Soft Deletion ---');
  const deletedSc2 = await adminDeleteShowcase(sc2.id, 'admin-user-1', 'Organizer requested deletion');
  assert(!!deletedSc2, 'adminDeleteShowcase returns soft-deleted showcase');
  assertEqual(deletedSc2?.status, 'DELETED', 'Showcase status is DELETED');
  assert(deletedSc2?.deleted_at !== null, 'deleted_at timestamp is set');
  assertEqual(isPubliclyVisible(deletedSc2!), false, 'Deleted showcase is NOT publicly visible');

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log(` RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Fatal error running tests:', err);
  process.exit(1);
});
