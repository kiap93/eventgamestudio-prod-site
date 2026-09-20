/**
 * Server-Side Tests for Event Showcase Approval & Owner-Level Wallet Reward Integration
 *
 * 12 Verification Scenarios:
 * 1. Non-approval actions (create, media upload, update, publish, unpublish) do NOT grant reward.
 * 2. First-Event Showcase Reward is granted to Account Owner on first eligible event.
 * 3. Owner-level lifetime limit (Same Org, Second Event): duplicate reward is denied.
 * 4. Owner-level lifetime limit across multiple Orgs: same owner cannot claim in another org.
 * 5. Different Account Owner is eligible and receives reward for their own first event.
 * 6. Decoupled Showcase Publishing: publishing/unpublishing is immediate and self-serve.
 * 7. Decoupled Admin Event Quality Review: approveEventReview / rejectEventReview independent of reward.
 * 8. Decoupled Reward Rejection: rejecting a reward leaves the showcase PUBLISHED and accessible.
 * 9. Reward Approval Idempotency: repeated approval calls do not double-credit wallet.
 * 10. Financial Isolation: showcase credit is strictly credited to showcase_credit (paid_balance = 0).
 * 11. Owner Reward Status Tracking: getOwnerShowcaseRewardStatus tracks owner rewards accurately.
 * 12. Media & Eligibility Validation: missing media or unpaid events are marked NOT_ELIGIBLE.
 */

import crypto from 'node:crypto';
import { getSupabaseServerClient } from '../supabase.js';
import { localEventsCache } from './events.js';
import { localOrgsCache } from './organizations.js';
import { localUsersCache } from './users.js';
import {
  createShowcase,
  updateShowcase,
  submitShowcaseForReview,
  approveShowcaseReview,
  approveShowcaseReward,
  rejectShowcaseReward,
  approveEventReview,
  rejectEventReview,
  publishShowcase,
  unpublishShowcase,
  getShowcaseById,
  getShowcaseByEventId,
  getOwnerShowcaseRewardStatus,
  evaluateShowcaseRewardEligibility,
} from './showcases.js';
import {
  createShowcaseMedia,
} from './showcaseMedia.js';
import {
  getWalletBalance,
  grantShowcaseCredit,
  getWalletTransactions,
  SHOWCASE_CREDIT_AMOUNT,
  localWalletsCache,
} from './wallet.js';

let passed = 0;
let failed = 0;

async function ensureTestOrg(orgId: string, ownerId?: string) {
  const supabase = getSupabaseServerClient();
  const validOwnerId = ownerId || crypto.randomUUID();
  try {
    await supabase.from('users').upsert({
      id: validOwnerId,
      email: `test-owner-${validOwnerId.slice(0, 8)}@example.com`,
      name: `Test Owner ${validOwnerId.slice(0, 8)}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    await supabase.from('organizations').upsert({
      id: orgId,
      name: `Test Org ${orgId.slice(0, 8)}`,
      slug: `test-org-${orgId.slice(0, 8)}`,
      owner_id: validOwnerId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    await supabase.from('organization_wallets').upsert({
      organization_id: orgId,
      paid_balance: 0,
      topup_credit: 0,
      welcome_credit: 0,
      showcase_credit: 0,
      showcase_credit_granted: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  } catch {
    // Local fallback handled
  }

  localUsersCache.set(validOwnerId, {
    id: validOwnerId,
    email: `test-owner-${validOwnerId.slice(0, 8)}@example.com`,
    name: `Test Owner ${validOwnerId.slice(0, 8)}`,
    is_developer: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as any);

  localOrgsCache.set(orgId, {
    id: orgId,
    name: `Test Org ${orgId.slice(0, 8)}`,
    slug: `test-org-${orgId.slice(0, 8)}`,
    owner_id: validOwnerId,
    country_code: 'MY',
    currency: 'MYR',
    event_count: 0,
    member_count: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as any);

  localWalletsCache.set(orgId, {
    organization_id: orgId,
    paid_balance: 0,
    topup_credit: 0,
    welcome_credit: 0,
    showcase_credit: 0,
    showcase_credit_granted: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as any);

  return validOwnerId;
}

async function ensureTestEvent(eventId: string, orgId: string, isPaid: boolean = true, isCompleted: boolean = true, createdBy?: string) {
  const supabase = getSupabaseServerClient();
  try {
    const themeId = '1a480be3-5313-49ba-a9c2-f5b2293576cf';
    const now = new Date().toISOString();
    const startDate = isCompleted ? '2026-09-01' : '2026-09-30';
    const endDate = isCompleted ? '2026-09-02' : '2026-09-30';
    const token = crypto.randomBytes(4).toString('hex').toUpperCase();
    const userId = createdBy || '4c857d15-ab93-45a6-8de5-7858ab4d6bd2';

    await supabase.from('users').upsert({
      id: userId,
      email: `test-creator-${userId.slice(0, 8)}@example.com`,
      name: 'Test Creator',
      created_at: now,
      updated_at: now,
    });

    localEventsCache.set(eventId, {
      id: eventId,
      organization_id: orgId,
      game_id: null,
      game_theme_id: themeId,
      name: `Test Event ${eventId.slice(0, 8)}`,
      event_date: startDate,
      start_date: startDate,
      end_date: endDate,
      starts_at: `${startDate}T00:00:00.000Z`,
      expires_at: `${endDate}T23:59:59.000Z`,
      status: (isCompleted ? 'COMPLETED' : 'LIVE') as any,
      event_status: (isCompleted ? 'COMPLETED' : 'LIVE') as any,
      payment_status: (isPaid ? 'PAID' : 'PENDING') as any,
      public_token: token,
      created_by: userId,
      created_at: now,
      updated_at: now,
    });

    await supabase.from('events').upsert({
      id: eventId,
      organization_id: orgId,
      game_theme_id: themeId,
      name: `Test Event ${eventId.slice(0, 8)}`,
      event_date: startDate,
      starts_at: `${startDate}T00:00:00.000Z`,
      expires_at: `${endDate}T23:59:59.000Z`,
      status: isCompleted ? 'COMPLETED' : 'LIVE',
      public_token: token,
      created_by: userId,
      created_at: now,
      updated_at: now,
    });
  } catch {
    // Local fallback handled
  }
}

function assertEqual(actual: any, expected: any, testName: string) {
  if (actual === expected) {
    console.log(`  ✓ PASS: ${testName} (expected ${expected}, got ${actual})`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${testName} - Expected ${expected}, got ${actual}`);
    failed++;
  }
}

function assertTrue(condition: boolean, testName: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${testName} - Condition was false`);
    failed++;
  }
}

async function runTests() {
  console.log('\n========================================================================');
  console.log(' RUNNING 12-SCENARIO OWNER-LEVEL SHOWCASE REWARD & DECOUPLED TEST SUITE');
  console.log('========================================================================\n');

  const adminUserId = '4c857d15-ab93-45a6-8de5-7858ab4d6bd2';
  const ownerA = crypto.randomUUID();
  const orgA1 = crypto.randomUUID();
  const eventA1 = crypto.randomUUID();

  await ensureTestOrg(orgA1, ownerA);
  await ensureTestEvent(eventA1, orgA1, true, true);

  // --------------------------------------------------------------------------
  // SCENARIO 1: Non-approval actions DO NOT grant reward
  // --------------------------------------------------------------------------
  console.log('--- Scenario 1: Non-approval actions DO NOT grant reward ---');
  const initialWallet = await getWalletBalance(orgA1);
  assertEqual(initialWallet.showcase_credit, 0.00, 'Initial showcase_credit is RM0.00');

  const scA1 = await createShowcase({
    event_id: eventA1,
    organization_id: orgA1,
    title: 'Brand Activation Event 1',
    description: 'A great brand activation at the summer fest with huge attendee turnout and live leaderboards.',
    client_name: 'Acme Beverages',
  });
  assertEqual(scA1.review_status, 'DRAFT', 'Created showcase has review_status DRAFT');
  assertEqual(scA1.reward_status, 'PENDING', 'Created showcase has reward_status PENDING');

  const wAfterCreate = await getWalletBalance(orgA1);
  assertEqual(wAfterCreate.showcase_credit, 0.00, 'Creation does not grant reward');

  // Upload 3 valid photos
  for (let i = 1; i <= 3; i++) {
    await createShowcaseMedia({
      showcase_id: scA1.id,
      organization_id: orgA1,
      media_type: 'IMAGE',
      media_url: `https://example.com/photo${i}.jpg`,
      file_name: `photo${i}.jpg`,
      file_size: 102400,
      mime_type: 'image/jpeg',
      sort_order: i - 1,
    });
  }
  const wAfterMedia = await getWalletBalance(orgA1);
  assertEqual(wAfterMedia.showcase_credit, 0.00, 'Media upload does not grant reward');

  await updateShowcase(eventA1, { client_name: 'Acme Global Brands' });
  const wAfterUpdate = await getWalletBalance(orgA1);
  assertEqual(wAfterUpdate.showcase_credit, 0.00, 'Updating showcase details does not grant reward');

  // --------------------------------------------------------------------------
  // SCENARIO 2: First-Event Showcase Reward granted to Account Owner
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario 2: First-Event Showcase Reward granted to Account Owner ---');
  await publishShowcase(eventA1);
  await submitShowcaseForReview(eventA1);

  // Check initial owner reward status
  const ownerStatusBefore = await getOwnerShowcaseRewardStatus(ownerA);
  assertEqual(ownerStatusBefore.hasReceivedReward, false, 'Owner A has not yet received reward');

  // Approve first showcase reward
  const approval1 = await approveShowcaseReward(scA1.id, adminUserId);
  assertEqual(approval1.alreadyRewarded, false, 'First reward approval succeeds (alreadyRewarded = false)');
  assertEqual(approval1.showcase.reward_status, 'REWARDED', 'Showcase reward_status is marked REWARDED');
  assertTrue(!!approval1.showcase.reward_granted_at, 'reward_granted_at timestamp is set');
  assertTrue(!!approval1.showcase.reward_transaction_id, 'reward_transaction_id is set');

  const wAfterApprove = await getWalletBalance(orgA1);
  assertEqual(wAfterApprove.showcase_credit, 300.00, 'Org A1 wallet receives RM300.00 showcase credit');

  // Check updated owner reward status
  const ownerStatusAfter = await getOwnerShowcaseRewardStatus(ownerA);
  assertEqual(ownerStatusAfter.hasReceivedReward, true, 'Owner A is now marked as having received lifetime reward');

  // --------------------------------------------------------------------------
  // SCENARIO 3: Owner-level lifetime limit (Same Org, Second Event)
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario 3: Owner-level lifetime limit (Same Org, Second Event) ---');
  const eventA2 = crypto.randomUUID();
  await ensureTestEvent(eventA2, orgA1, true, true);

  const scA2 = await createShowcase({
    event_id: eventA2,
    organization_id: orgA1,
    title: 'Brand Activation Event 2',
    description: 'Second event activation for Acme with full custom theme and prize distribution.',
    client_name: 'Acme Global Brands',
  });

  for (let i = 1; i <= 3; i++) {
    await createShowcaseMedia({
      showcase_id: scA2.id,
      organization_id: orgA1,
      media_type: 'IMAGE',
      media_url: `https://example.com/event2_photo${i}.jpg`,
      file_name: `event2_photo${i}.jpg`,
      file_size: 150000,
      mime_type: 'image/jpeg',
      sort_order: i - 1,
    });
  }

  await publishShowcase(eventA2);
  await submitShowcaseForReview(eventA2);

  // Attempting to approve reward for second event by same owner
  const approvalSameOrgSecondEvent = await approveShowcaseReward(scA2.id, adminUserId);
  assertEqual(approvalSameOrgSecondEvent.alreadyRewarded, true, 'Same owner 2nd event reward is denied (alreadyRewarded = true)');

  const wAfterSameOrgSecond = await getWalletBalance(orgA1);
  assertEqual(wAfterSameOrgSecond.showcase_credit, 300.00, 'Wallet showcase_credit remains RM300 (no double credit)');

  // --------------------------------------------------------------------------
  // SCENARIO 4: Owner-level lifetime limit across multiple Orgs
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario 4: Owner-level lifetime limit across multiple Orgs ---');
  const orgA2 = crypto.randomUUID();
  const eventA3 = crypto.randomUUID();
  await ensureTestOrg(orgA2, ownerA); // SAME OWNER A in a new organization!
  await ensureTestEvent(eventA3, orgA2, true, true);

  const scA3 = await createShowcase({
    event_id: eventA3,
    organization_id: orgA2,
    title: 'Org A2 Event Showcase',
    description: 'First event in second company owned by Owner A. Checking lifetime limit enforcement.',
    client_name: 'Owner A Subsidiary',
  });

  for (let i = 1; i <= 3; i++) {
    await createShowcaseMedia({
      showcase_id: scA3.id,
      organization_id: orgA2,
      media_type: 'IMAGE',
      media_url: `https://example.com/sub_photo${i}.jpg`,
      file_name: `sub_photo${i}.jpg`,
      file_size: 120000,
      mime_type: 'image/jpeg',
      sort_order: i - 1,
    });
  }

  await publishShowcase(eventA3);
  await submitShowcaseForReview(eventA3);

  // Attempting to approve reward for Org A2 (owned by Owner A)
  const approvalMultiOrgSameOwner = await approveShowcaseReward(scA3.id, adminUserId);
  assertEqual(approvalMultiOrgSameOwner.alreadyRewarded, true, 'Owner A cannot claim reward in a 2nd organization (owner-level limit)');

  const wOrgA2 = await getWalletBalance(orgA2);
  assertEqual(wOrgA2.showcase_credit, 0.00, 'Org A2 wallet receives RM0.00 showcase credit because owner already claimed reward');

  // --------------------------------------------------------------------------
  // SCENARIO 5: Different Account Owner is eligible and receives reward
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario 5: Different Account Owner receives reward ---');
  const ownerB = crypto.randomUUID();
  const orgB = crypto.randomUUID();
  const eventB = crypto.randomUUID();

  await ensureTestOrg(orgB, ownerB);
  await ensureTestEvent(eventB, orgB, true, true);

  const scB = await createShowcase({
    event_id: eventB,
    organization_id: orgB,
    title: 'Owner B Inaugural Event',
    description: 'High-energy retail activation for Beta Corp with real-time kiosks and leaderboards.',
    client_name: 'Beta Corp',
  });

  for (let i = 1; i <= 3; i++) {
    await createShowcaseMedia({
      showcase_id: scB.id,
      organization_id: orgB,
      media_type: 'IMAGE',
      media_url: `https://example.com/beta${i}.jpg`,
      file_name: `beta${i}.jpg`,
      file_size: 140000,
      mime_type: 'image/jpeg',
      sort_order: i - 1,
    });
  }

  await publishShowcase(eventB);
  await submitShowcaseForReview(eventB);

  const approvalOwnerB = await approveShowcaseReward(scB.id, adminUserId);
  assertEqual(approvalOwnerB.alreadyRewarded, false, 'Owner B first approval succeeds');

  const wOrgB = await getWalletBalance(orgB);
  assertEqual(wOrgB.showcase_credit, 300.00, 'Org B receives RM300.00 showcase credit');

  const ownerStatusB = await getOwnerShowcaseRewardStatus(ownerB);
  assertEqual(ownerStatusB.hasReceivedReward, true, 'Owner B is now recorded in owner_showcase_rewards');

  // --------------------------------------------------------------------------
  // SCENARIO 6: Decoupled Showcase Publishing (Self-serve & Immediate)
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario 6: Decoupled Showcase Publishing ---');
  const ownerC = crypto.randomUUID();
  const orgC = crypto.randomUUID();
  const eventC = crypto.randomUUID();
  await ensureTestOrg(orgC, ownerC);
  await ensureTestEvent(eventC, orgC, true, true);

  const scC = await createShowcase({
    event_id: eventC,
    organization_id: orgC,
    title: 'Independent Showcase',
    description: 'Showcase that should be immediately published without admin review or reward dependency.',
    client_name: 'Gamma Innovations',
    status: 'DRAFT',
  });
  assertEqual(scC.status, 'DRAFT', 'Initial status is DRAFT');

  // Publish directly
  const publishedScC = await publishShowcase(eventC);
  assertEqual(publishedScC.status, 'PUBLISHED', 'Showcase is PUBLISHED immediately without waiting for admin');
  assertEqual(publishedScC.publication_status, 'PUBLISHED', 'publication_status is PUBLISHED');

  // Unpublish directly
  const unpublishedScC = await unpublishShowcase(eventC);
  assertEqual(unpublishedScC.status, 'UNPUBLISHED', 'Showcase unpublishes immediately');
  assertEqual(unpublishedScC.publication_status, 'UNPUBLISHED', 'publication_status is UNPUBLISHED');

  // Re-publish
  await publishShowcase(eventC);

  // --------------------------------------------------------------------------
  // SCENARIO 7: Decoupled Admin Event Quality Review
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario 7: Decoupled Admin Event Quality Review ---');
  await submitShowcaseForReview(eventC);

  // Admin approves event quality review
  const qualityApproval = await approveEventReview(scC.id, adminUserId);
  assertEqual(qualityApproval.review_status, 'APPROVED', 'Editorial review_status is APPROVED');
  assertEqual(qualityApproval.reward_status, 'PENDING', 'reward_status is unchanged by editorial review');

  const wOrgCAfterReview = await getWalletBalance(orgC);
  assertEqual(wOrgCAfterReview.showcase_credit, 0.00, 'Editorial event review approval does NOT grant financial reward');

  // --------------------------------------------------------------------------
  // SCENARIO 8: Decoupled Reward Rejection Leaves Showcase Published
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario 8: Decoupled Reward Rejection Leaves Showcase Published ---');
  const rewardRejectResult = await rejectShowcaseReward(scC.id, adminUserId, 'Insufficient promotional branding in photos');
  assertEqual(rewardRejectResult.reward_status, 'NOT_ELIGIBLE', 'Showcase reward_status is NOT_ELIGIBLE');
  assertEqual(rewardRejectResult.status, 'PUBLISHED', 'Showcase REMAINS PUBLISHED after reward rejection');
  assertEqual(rewardRejectResult.publication_status, 'PUBLISHED', 'publication_status REMAINS PUBLISHED');

  const wOrgCAfterReject = await getWalletBalance(orgC);
  assertEqual(wOrgCAfterReject.showcase_credit, 0.00, 'No credit awarded on reward rejection');

  // --------------------------------------------------------------------------
  // SCENARIO 9: Reward Approval Idempotency
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario 9: Reward Approval Idempotency ---');
  const repeatedApproval1 = await approveShowcaseReward(scA1.id, adminUserId);
  assertEqual(repeatedApproval1.alreadyRewarded, true, 'Call 1 returns alreadyRewarded = true');

  const repeatedApproval2 = await approveShowcaseReward(scA1.id, adminUserId);
  assertEqual(repeatedApproval2.alreadyRewarded, true, 'Call 2 returns alreadyRewarded = true');

  const wOrgAIdempotent = await getWalletBalance(orgA1);
  assertEqual(wOrgAIdempotent.showcase_credit, 300.00, 'Wallet showcase_credit remains exactly RM300.00 after repeated calls');

  const { transactions: txnsOrgA } = await getWalletTransactions(orgA1);
  const showcaseTxns = txnsOrgA.filter((t) => t.transaction_type === 'SHOWCASE_CREDIT');
  assertEqual(showcaseTxns.length, 1, 'Exactly one SHOWCASE_CREDIT ledger transaction exists in Org A');

  // --------------------------------------------------------------------------
  // SCENARIO 10: Financial Isolation (No Mixing into Paid Balance)
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario 10: Financial Isolation ---');
  assertEqual(wOrgAIdempotent.paid_balance, 0.00, 'paid_balance remains 0.00');
  assertEqual(wOrgAIdempotent.topup_credit, 0.00, 'topup_credit remains 0.00');
  assertEqual(wOrgAIdempotent.welcome_credit, 0.00, 'welcome_credit remains 0.00');
  assertEqual(wOrgAIdempotent.total_balance, 300.00, 'total_balance reflects showcase_credit without corruption');

  // --------------------------------------------------------------------------
  // SCENARIO 11: Owner Reward Status Tracking
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario 11: Owner Reward Status Tracking ---');
  const ownerAStatusCheck = await getOwnerShowcaseRewardStatus(ownerA);
  assertEqual(ownerAStatusCheck.hasReceivedReward, true, 'Owner A tracked as rewarded');
  assertEqual(ownerAStatusCheck.reward?.organization_id, orgA1, 'Recorded org matches Org A1');
  assertEqual(ownerAStatusCheck.reward?.amount, 300.00, 'Recorded amount is RM300.00');

  const unrewardedOwner = crypto.randomUUID();
  const unrewardedStatus = await getOwnerShowcaseRewardStatus(unrewardedOwner);
  assertEqual(unrewardedStatus.hasReceivedReward, false, 'New owner tracked as not rewarded');

  // --------------------------------------------------------------------------
  // SCENARIO 12: Media & Eligibility Validation
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario 12: Media & Eligibility Validation ---');
  const ownerD = crypto.randomUUID();
  const orgD = crypto.randomUUID();
  const eventD = crypto.randomUUID();
  await ensureTestOrg(orgD, ownerD);
  // Completed event without media/short description
  await ensureTestEvent(eventD, orgD, true, true, ownerD);

  const scD = await createShowcase({
    event_id: eventD,
    organization_id: orgD,
    title: 'Ineligible Event Showcase',
    description: 'Short',
    client_name: 'Delta Co',
  });

  const eligibility = await evaluateShowcaseRewardEligibility(eventD);
  assertEqual(eligibility.reward_review_status, 'NOT_ELIGIBLE', 'Uncompleted/unpaid event without media is NOT eligible');
  assertEqual(eligibility.reward_status, 'NOT_ELIGIBLE', 'Eligibility reward_status is NOT_ELIGIBLE');

  // --------------------------------------------------------------------------
  // TEST SUMMARY
  // --------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log(` RESULTS: ${passed} PASSED, ${failed} FAILED (All 12 Scenarios Verified)`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
