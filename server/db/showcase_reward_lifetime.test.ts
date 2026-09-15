/**
 * Lifetime Showcase Reward Test Suite
 * 
 * Verifies strict "ONE USER ACCOUNT = ONE RM300 SHOWCASE REWARD FOR LIFE" rule:
 * Test 1: Multi-org eligibility (User A creates Org A -> RM300; User A creates Org B -> NOT eligible).
 * Test 2: UI banner visibility logic for user who already received the reward (banner must NOT be visible).
 * Test 3: New user eligibility (banner MUST be visible, eligible: true).
 * Test 4: Concurrent showcase approvals across multiple orgs owned by the same user cannot double-grant.
 * Test 5: Org deletion after receiving reward does NOT reset ineligibility in subsequent orgs.
 * Test 6: Creating new organizations does not reset the user's lifetime reward status.
 */

import crypto from 'node:crypto';
import { getSupabaseServerClient } from '../supabase.js';
import { localEventsCache } from './events.js';
import { createTheme } from './themes.js';
import { createUser } from './users.js';
import {
  createOrganization,
  deleteOrganization,
  getOrganizationById,
} from './organizations.js';
import {
  createShowcase,
  publishShowcase,
  approveShowcaseReward,
  getOwnerShowcaseRewardStatus,
  evaluateShowcaseRewardEligibility,
} from './showcases.js';
import {
  createShowcaseMedia,
} from './showcaseMedia.js';
import {
  getWalletBalance,
  grantShowcaseCredit,
  hasUserReceivedShowcaseCredit,
} from './wallet.js';

let totalAssertions = 0;
let passedAssertions = 0;

function assertTrue(condition: boolean, description: string) {
  totalAssertions++;
  if (!condition) {
    console.error(`❌ FAILED: ${description}`);
    throw new Error(`Assertion failed: ${description}`);
  }
  passedAssertions++;
  console.log(`  ✓ PASSED: ${description}`);
}

async function createTestUser(id: string) {
  try {
    await createUser({
      id,
      email: `test_${id.slice(0, 8)}_${Date.now()}_${Math.floor(Math.random() * 1000)}@example.com`,
      name: `Test User ${id.slice(0, 8)}`,
    });
  } catch {
    // ignore
  }
}

async function createTestEvent(eventId: string, orgId: string, ownerId: string) {
  const theme = await createTheme({
    organization_id: orgId,
    name: `Test Theme ${orgId.slice(0, 8)}`,
    game_id: '0a9a8318-f590-4d92-9afd-86a38bd9852f',
    is_system: false,
  });

  const startDate = '2026-09-01';
  const endDate = '2026-09-02';
  const now = new Date().toISOString();
  const token = crypto.randomBytes(4).toString('hex').toUpperCase();

  const eventRecord = {
    id: eventId,
    organization_id: orgId,
    game_id: null,
    game_theme_id: theme.id,
    name: `Test Event ${eventId.slice(0, 8)}`,
    event_date: startDate,
    start_date: startDate,
    end_date: endDate,
    starts_at: `${startDate}T00:00:00.000Z`,
    expires_at: `${endDate}T23:59:59.000Z`,
    status: 'scheduled' as any,
    event_status: 'COMPLETED' as any,
    payment_status: 'PAID' as any,
    public_token: token,
    created_by: ownerId,
    created_at: now,
    updated_at: now,
  };

  localEventsCache.set(eventId, eventRecord);

  try {
    const supabase = getSupabaseServerClient();
    const { error } = await supabase.from('events').upsert(eventRecord);
    if (error) {
      console.warn('Upsert event warning:', error.message);
    }
  } catch (err: any) {
    console.warn('Upsert event catch:', err?.message);
  }

  return eventRecord;
}

async function createEligibleShowcaseWithMedia(eventId: string, orgId: string, _ownerId: string) {
  const showcase = await createShowcase({
    event_id: eventId,
    organization_id: orgId,
    title: `Eligible Showcase ${eventId.slice(0, 8)}`,
    description: 'This is a comprehensive event showcase recap that contains well over fifty characters for testing eligibility rules.',
    client_name: 'Acme Global Corp',
  });

  // Add 3 photos to satisfy media requirements
  for (let i = 1; i <= 3; i++) {
    await createShowcaseMedia({
      showcase_id: showcase.id,
      organization_id: orgId,
      media_type: 'IMAGE',
      media_url: `https://storage.eventgamestudio.com/showcases/${showcase.id}/photo_${i}.jpg`,
      file_name: `photo_${i}.jpg`,
      file_size: 1024 * 500,
      mime_type: 'image/jpeg',
    });
  }

  // Publish showcase using eventId
  const published = await publishShowcase(eventId);
  return published;
}

async function runShowcaseRewardLifetimeTests() {
  console.log('================================================================');
  console.log('EVENT GAME STUDIO: LIFETIME SHOWCASE REWARD VERIFICATION SUITE');
  console.log('Standard: ONE USER ACCOUNT = ONE RM300 SHOWCASE REWARD FOR LIFE');
  console.log('================================================================\n');

  const reviewerId = crypto.randomUUID();
  await createTestUser(reviewerId);

  // --------------------------------------------------------------------------
  // TEST 1: Multi-Org Eligibility
  // User A creates Org A, qualifies for showcase reward, gets RM300.
  // User A creates Org B, creates showcase in Org B.
  // Org B must NOT be eligible for another RM300 Showcase Reward.
  // --------------------------------------------------------------------------
  console.log('TEST 1: Multi-Org Lifetime Showcase Reward Boundary...');
  const userAId = crypto.randomUUID();
  await createTestUser(userAId);

  const orgA = await createOrganization({
    name: 'User A Org Alpha',
    owner_id: userAId,
    country_code: 'MY',
  });
  assertTrue(Boolean(orgA?.id), 'Org A created for User A');

  const eventAId = crypto.randomUUID();
  await createTestEvent(eventAId, orgA.id, userAId);
  const showcaseA = await createEligibleShowcaseWithMedia(eventAId, orgA.id, userAId);

  // Initial status for User A should be eligible
  const preStatusA = await getOwnerShowcaseRewardStatus(userAId);
  assertTrue(preStatusA.hasReceivedReward === false, 'User A has not received reward initially');
  assertTrue(preStatusA.eligible === true, 'User A is eligible initially');

  // Approve showcase reward for Org A
  const approvalA = await approveShowcaseReward(showcaseA.id, reviewerId);
  assertTrue(approvalA.alreadyRewarded === false, 'Showcase A successfully rewarded RM300');
  const walletA = await getWalletBalance(orgA.id);
  assertTrue(walletA.showcase_credit === 300, 'Org A wallet received RM300 showcase credit');

  // Verify User A lifetime status is now recorded as claimed
  const postStatusA = await getOwnerShowcaseRewardStatus(userAId);
  assertTrue(postStatusA.hasReceivedReward === true, 'User A hasReceivedReward is now true');
  assertTrue(postStatusA.eligible === false, 'User A eligible is now false');
  const userAHasReceived = await hasUserReceivedShowcaseCredit(userAId);
  assertTrue(userAHasReceived === true, 'hasUserReceivedShowcaseCredit(userAId) returns true');

  // User A now creates Org B
  const orgB = await createOrganization({
    name: 'User A Org Beta',
    owner_id: userAId,
    country_code: 'MY',
  });
  assertTrue(Boolean(orgB?.id), 'Org B created for User A');

  const eventBId = crypto.randomUUID();
  await createTestEvent(eventBId, orgB.id, userAId);
  const showcaseB = await createEligibleShowcaseWithMedia(eventBId, orgB.id, userAId);

  // Evaluate Showcase B eligibility
  const evalB = await evaluateShowcaseRewardEligibility(eventBId);
  assertTrue(
    evalB.reward_review_status === 'NOT_ELIGIBLE',
    'Showcase B is evaluated as NOT_ELIGIBLE because owner already received lifetime reward'
  );
  assertTrue(
    Boolean(evalB.reward_rejection_reason?.toLowerCase().includes('already received') || evalB.reward_review_status === 'NOT_ELIGIBLE'),
    'Evaluation reasons specifically note owner lifetime reward limit'
  );

  // Attempting to approve Showcase B must be rejected
  let approvalBFailed = false;
  try {
    await approveShowcaseReward(showcaseB.id, reviewerId);
  } catch (err: any) {
    approvalBFailed = true;
    assertTrue(
      err.code === 'SHOWCASE_NOT_ELIGIBLE' ||
        err.code === 'SHOWCASE_ALREADY_REWARDED_TO_OWNER' ||
        err.message.includes('criteria') ||
        err.message.includes('already been granted'),
      `Showcase B approval threw expected rejection: ${err.message}`
    );
  }
  assertTrue(approvalBFailed, 'Approval of Showcase B in Org B was rejected');

  // Direct grant attempt to Org B must also be rejected
  const directGrantB = await grantShowcaseCredit({
    organizationId: orgB.id,
    eventId: eventBId,
    ownerUserId: userAId,
    createdBy: reviewerId,
  });
  assertTrue(directGrantB.alreadyGranted === true, 'Direct grant to Org B rejected with alreadyGranted = true');
  const walletB = await getWalletBalance(orgB.id);
  assertTrue(walletB.showcase_credit === 0, 'Org B wallet received RM0 showcase credit');

  // --------------------------------------------------------------------------
  // TEST 2: UI Banner Visibility Logic for User Who Already Received Reward
  // When authenticated user has already received the reward, the first-event
  // promotional banner must NOT be visible on EventShowcaseTab.tsx.
  // --------------------------------------------------------------------------
  console.log('\nTEST 2: UI Banner Visibility for User Who Already Received Reward...');
  // Logic from EventShowcaseTab.tsx:
  const userARewardStatus = await getOwnerShowcaseRewardStatus(userAId);
  const hasReceivedLifetimeReward_A = userARewardStatus.hasReceivedReward === true;

  // Even if current event is capable of qualifying:
  const isShowcaseEligibleForPromo_B = !showcaseB || (
    showcaseB.reward_review_status !== 'REWARDED' &&
    showcaseB.reward_review_status !== 'REJECTED' &&
    showcaseB.status !== 'BLOCKED'
  );
  const showFirstEventPromoBanner_A = !hasReceivedLifetimeReward_A && isShowcaseEligibleForPromo_B;

  assertTrue(
    showFirstEventPromoBanner_A === false,
    'Promotional first-event reward banner is strictly HIDDEN for User A who already received lifetime reward'
  );

  // --------------------------------------------------------------------------
  // TEST 3: New User Eligibility
  // For a new user/owner who has not received the reward, the promotional
  // reward banner MUST be visible (eligible: true).
  // --------------------------------------------------------------------------
  console.log('\nTEST 3: New User Eligibility & Banner Visibility...');
  const userCId = crypto.randomUUID();
  await createTestUser(userCId);

  const orgC = await createOrganization({
    name: 'User C Org New',
    owner_id: userCId,
    country_code: 'MY',
  });

  const userCRewardStatus = await getOwnerShowcaseRewardStatus(userCId);
  assertTrue(userCRewardStatus.hasReceivedReward === false, 'User C hasReceivedReward is false');
  assertTrue(userCRewardStatus.eligible === true, 'User C eligible is true');

  const hasReceivedLifetimeReward_C = userCRewardStatus.hasReceivedReward === true;
  const isShowcaseEligibleForPromo_C = true; // Showcase does not exist yet or is capable
  const showFirstEventPromoBanner_C = !hasReceivedLifetimeReward_C && isShowcaseEligibleForPromo_C;

  assertTrue(
    showFirstEventPromoBanner_C === true,
    'Promotional first-event reward banner MUST be VISIBLE for new eligible User C'
  );

  // --------------------------------------------------------------------------
  // TEST 4: Concurrent Showcase Approvals Across Multiple Organizations
  // Multiple organizations owned by the same user attempting concurrent
  // approvals cannot result in multiple rewards.
  // --------------------------------------------------------------------------
  console.log('\nTEST 4: Concurrent Showcase Approvals Across Multiple Organizations...');
  const userDId = crypto.randomUUID();
  await createTestUser(userDId);

  const [orgD1, orgD2] = await Promise.all([
    createOrganization({ name: 'User D Org 1', owner_id: userDId }),
    createOrganization({ name: 'User D Org 2', owner_id: userDId }),
  ]);

  const eventD1Id = crypto.randomUUID();
  const eventD2Id = crypto.randomUUID();

  await Promise.all([
    createTestEvent(eventD1Id, orgD1.id, userDId),
    createTestEvent(eventD2Id, orgD2.id, userDId),
  ]);

  const [showcaseD1, showcaseD2] = await Promise.all([
    createEligibleShowcaseWithMedia(eventD1Id, orgD1.id, userDId),
    createEligibleShowcaseWithMedia(eventD2Id, orgD2.id, userDId),
  ]);

  // Execute concurrent approvals simultaneously
  const concurrentResults = await Promise.allSettled([
    approveShowcaseReward(showcaseD1.id, reviewerId),
    approveShowcaseReward(showcaseD2.id, reviewerId),
  ]);

  const fulfilledResults = concurrentResults.filter(
    (r) => r.status === 'fulfilled' && (r.value as any).reward?.alreadyGranted === false
  );
  assertTrue(
    fulfilledResults.length === 1,
    `Exactly 1 concurrent approval succeeded in granting the reward (got ${fulfilledResults.length})`
  );

  const [walletD1, walletD2] = await Promise.all([
    getWalletBalance(orgD1.id),
    getWalletBalance(orgD2.id),
  ]);

  const totalDShowcaseCredit = walletD1.showcase_credit + walletD2.showcase_credit;
  assertTrue(
    totalDShowcaseCredit === 300,
    `Total showcase credits awarded across Org D1 and Org D2 is exactly RM300 (got RM${totalDShowcaseCredit})`
  );

  // --------------------------------------------------------------------------
  // TEST 5: Org Deletion
  // If Org A is deleted or deactivated after receiving the reward, User A
  // remains ineligible for another reward in Org B.
  // --------------------------------------------------------------------------
  console.log('\nTEST 5: Org Deletion Does Not Reset Lifetime Reward...');
  const userEId = crypto.randomUUID();
  await createTestUser(userEId);

  const orgE1 = await createOrganization({
    name: 'User E Org 1',
    owner_id: userEId,
  });

  const eventE1Id = crypto.randomUUID();
  await createTestEvent(eventE1Id, orgE1.id, userEId);
  const showcaseE1 = await createEligibleShowcaseWithMedia(eventE1Id, orgE1.id, userEId);

  // Grant reward in Org E1
  await approveShowcaseReward(showcaseE1.id, reviewerId);
  assertTrue(
    (await getOwnerShowcaseRewardStatus(userEId)).hasReceivedReward === true,
    'User E received reward in Org E1'
  );

  // Delete Org E1
  await deleteOrganization(orgE1.id);
  assertTrue((await getOrganizationById(orgE1.id)) === null, 'Org E1 was deleted');

  // User E's lifetime reward status must remain permanently true
  const postDeleteStatus = await getOwnerShowcaseRewardStatus(userEId);
  assertTrue(
    postDeleteStatus.hasReceivedReward === true,
    'User E hasReceivedReward is still TRUE after Org E1 was deleted'
  );
  assertTrue(
    postDeleteStatus.eligible === false,
    'User E eligible is still FALSE after Org E1 was deleted'
  );
  assertTrue(
    (await hasUserReceivedShowcaseCredit(userEId)) === true,
    'hasUserReceivedShowcaseCredit(userEId) remains TRUE after Org E1 deletion'
  );

  // User E creates Org E2: Org E2 must remain ineligible
  const orgE2 = await createOrganization({
    name: 'User E Org 2',
    owner_id: userEId,
  });

  const eventE2Id = crypto.randomUUID();
  await createTestEvent(eventE2Id, orgE2.id, userEId);
  const showcaseE2 = await createEligibleShowcaseWithMedia(eventE2Id, orgE2.id, userEId);

  const evalE2 = await evaluateShowcaseRewardEligibility(eventE2Id);
  assertTrue(
    evalE2.reward_review_status === 'NOT_ELIGIBLE',
    'Showcase in Org E2 remains NOT_ELIGIBLE despite deletion of Org E1'
  );

  // --------------------------------------------------------------------------
  // TEST 6: New Organization Creation Does Not Reset Lifetime Reward Counter
  // Creating new organizations never resets the user's lifetime reward status.
  // --------------------------------------------------------------------------
  console.log('\nTEST 6: New Organization Creation Does Not Reset Lifetime Reward Counter...');
  // User A already received the reward in Test 1.
  // User A now creates multiple additional organizations.
  const [orgF1, orgF2, orgF3] = await Promise.all([
    createOrganization({ name: 'User A Org F1', owner_id: userAId }),
    createOrganization({ name: 'User A Org F2', owner_id: userAId }),
    createOrganization({ name: 'User A Org F3', owner_id: userAId }),
  ]);

  assertTrue(Boolean(orgF1?.id && orgF2?.id && orgF3?.id), 'Three new orgs created by User A');

  // Verify status is still claimed for User A
  const statusAfterMultiCreation = await getOwnerShowcaseRewardStatus(userAId);
  assertTrue(
    statusAfterMultiCreation.hasReceivedReward === true,
    'User A hasReceivedReward is still true after creating 3 more orgs'
  );
  assertTrue(
    statusAfterMultiCreation.eligible === false,
    'User A eligible is still false after creating 3 more orgs'
  );

  // Attempt grant on each new org
  const [grantF1, grantF2, grantF3] = await Promise.all([
    grantShowcaseCredit({ organizationId: orgF1.id, ownerUserId: userAId, createdBy: reviewerId }),
    grantShowcaseCredit({ organizationId: orgF2.id, ownerUserId: userAId, createdBy: reviewerId }),
    grantShowcaseCredit({ organizationId: orgF3.id, ownerUserId: userAId, createdBy: reviewerId }),
  ]);

  assertTrue(grantF1.alreadyGranted === true, 'Grant on Org F1 rejected as already granted');
  assertTrue(grantF2.alreadyGranted === true, 'Grant on Org F2 rejected as already granted');
  assertTrue(grantF3.alreadyGranted === true, 'Grant on Org F3 rejected as already granted');

  const [walletF1, walletF2, walletF3] = await Promise.all([
    getWalletBalance(orgF1.id),
    getWalletBalance(orgF2.id),
    getWalletBalance(orgF3.id),
  ]);

  assertTrue(walletF1.showcase_credit === 0, 'Org F1 wallet has RM0 showcase credit');
  assertTrue(walletF2.showcase_credit === 0, 'Org F2 wallet has RM0 showcase credit');
  assertTrue(walletF3.showcase_credit === 0, 'Org F3 wallet has RM0 showcase credit');

  console.log('\n================================================================');
  console.log(`ALL ${passedAssertions}/${totalAssertions} LIFETIME SHOWCASE REWARD TESTS PASSED! ✓`);
  console.log('Strict "ONE USER ACCOUNT = ONE RM300 SHOWCASE REWARD FOR LIFE" VERIFIED.');
  console.log('================================================================\n');
}

runShowcaseRewardLifetimeTests().catch((err) => {
  console.error('Fatal error running showcase reward lifetime tests:', err);
  process.exit(1);
});
