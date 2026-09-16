import assert from 'node:assert';
import crypto from 'node:crypto';
import {
  createOrganization,
  getOrganizationById,
  deleteOrganization,
  addMember,
  grantWelcomeCredit,
  grantShowcaseCredit,
  hasUserReceivedWelcomeCredit,
  hasUserReceivedShowcaseCredit,
  evaluatePromotionEligibility,
  hasUserClaimedReward,
  isUserOrganizationOwner,
  getWalletBalance,
  localUserRewardsCache,
  localOwnerShowcaseRewardsCache,
} from './index.js';

async function runUnifiedRewardsTests() {
  console.log('================================================================');
  console.log('UNIFIED REWARDS ARCHITECTURE TESTS (OWNER-ONLY, USER-LEVEL, ONE-TIME)');
  console.log('================================================================');

  // Clear in-memory caches to isolate test suite
  localUserRewardsCache.clear();
  localOwnerShowcaseRewardsCache.clear();

  // Scenario 1: Organization owner is recognized; non-owner member is rejected
  console.log('\nScenario 1: Organization owner is recognized; non-owner member is rejected...');
  {
    const ownerUserId = `owner-${crypto.randomUUID().slice(0, 8)}`;
    const memberUserId = `member-${crypto.randomUUID().slice(0, 8)}`;

    const org = await createOrganization({
      name: 'Owner Verification Org',
      owner_id: ownerUserId,
    });

    await addMember({
      organization_id: org.id,
      user_id: memberUserId,
      role: 'admin',
    });

    assert.strictEqual(await isUserOrganizationOwner(ownerUserId, org.id), true, 'Owner should be verified as owner');
    assert.strictEqual(await isUserOrganizationOwner(memberUserId, org.id), false, 'Admin member should NOT be verified as owner');
    console.log('  ✓ PASSED: Owner authorized; admin member rejected as owner.');
  }

  // Scenario 2: Non-owner member cannot receive Welcome Credit
  console.log('\nScenario 2: Non-owner member cannot receive Welcome Credit...');
  {
    const ownerUserId = `owner-${crypto.randomUUID().slice(0, 8)}`;
    const memberUserId = `member-${crypto.randomUUID().slice(0, 8)}`;

    const org = await createOrganization({
      name: 'Non Owner Welcome Org',
      owner_id: ownerUserId,
    });

    await addMember({
      organization_id: org.id,
      user_id: memberUserId,
      role: 'admin',
    });

    const result = await grantWelcomeCredit({
      organizationId: org.id,
      userId: memberUserId,
      createdBy: 'admin-system',
    });

    assert.strictEqual(result.notEligible, true, 'Non-owner should be flagged as notEligible');
    assert.strictEqual(result.alreadyGranted, false, 'Non-owner should not be flagged as alreadyGranted');
    assert.strictEqual(result.transaction, null, 'No transaction should be created for non-owner');
    assert.strictEqual(await hasUserReceivedWelcomeCredit(memberUserId), false, 'Member should not be marked as having received credit');
    console.log('  ✓ PASSED: Non-owner member denied Welcome Credit with notEligible flag.');
  }

  // Scenario 3: Non-owner member cannot receive Showcase Reward
  console.log('\nScenario 3: Non-owner member cannot receive Showcase Reward...');
  {
    const ownerUserId = `owner-${crypto.randomUUID().slice(0, 8)}`;
    const memberUserId = `member-${crypto.randomUUID().slice(0, 8)}`;
    const eventId = crypto.randomUUID();

    const org = await createOrganization({
      name: 'Non Owner Showcase Org',
      owner_id: ownerUserId,
    });

    await addMember({
      organization_id: org.id,
      user_id: memberUserId,
      role: 'designer',
    });

    const result = await grantShowcaseCredit({
      organizationId: org.id,
      eventId,
      ownerUserId: memberUserId,
      createdBy: 'admin-system',
    });

    assert.strictEqual(result.notEligible, true, 'Non-owner should be flagged as notEligible');
    assert.strictEqual(result.alreadyGranted, false, 'Non-owner should not be flagged as alreadyGranted');
    assert.strictEqual(result.transaction, null, 'No transaction should be created for non-owner');
    assert.strictEqual(await hasUserReceivedShowcaseCredit(memberUserId), false, 'Member should not be marked as having received reward');
    console.log('  ✓ PASSED: Non-owner member denied Showcase Reward with notEligible flag.');
  }

  // Scenario 4: Owner receives Welcome Credit in Org 1; rejected in Org 2 (lifetime limit)
  console.log('\nScenario 4: Owner receives Welcome Credit in Org 1; rejected in Org 2 (lifetime limit)...');
  {
    const ownerUserId = `owner-${crypto.randomUUID().slice(0, 8)}`;

    const org1 = await createOrganization({
      name: 'Org 1',
      owner_id: ownerUserId,
    });

    const org2 = await createOrganization({
      name: 'Org 2',
      owner_id: ownerUserId,
    });

    const result1 = await grantWelcomeCredit({
      organizationId: org1.id,
      userId: ownerUserId,
      createdBy: 'admin-system',
    });

    assert.strictEqual(result1.alreadyGranted, false, 'First grant should succeed');
    assert.ok(result1.transaction, 'Transaction should be generated for first grant');
    assert.strictEqual(await hasUserReceivedWelcomeCredit(ownerUserId), true, 'Owner should have lifetime credit recorded');
    assert.strictEqual(await hasUserClaimedReward(ownerUserId, 'WELCOME_CREDIT'), true, 'User reward should be recorded');

    // Attempt grant in Org 2 for same owner
    const result2 = await grantWelcomeCredit({
      organizationId: org2.id,
      userId: ownerUserId,
      createdBy: 'admin-system',
    });

    assert.strictEqual(result2.alreadyGranted, true, 'Second grant must be rejected with alreadyGranted');
    const org2Wallet = await getWalletBalance(org2.id);
    assert.strictEqual(org2Wallet.welcome_credit, 0, 'Org 2 wallet must receive RM0.00 welcome credit');
    console.log('  ✓ PASSED: Owner lifetime Welcome Credit limit strictly enforced across multiple organizations.');
  }

  // Scenario 5: Owner receives Showcase Reward once; rejected on second showcase (lifetime limit)
  console.log('\nScenario 5: Owner receives Showcase Reward once; rejected on second showcase (lifetime limit)...');
  {
    const ownerUserId = `owner-${crypto.randomUUID().slice(0, 8)}`;
    const event1 = crypto.randomUUID();
    const event2 = crypto.randomUUID();

    const org = await createOrganization({
      name: 'Showcase Org',
      owner_id: ownerUserId,
    });

    const result1 = await grantShowcaseCredit({
      organizationId: org.id,
      eventId: event1,
      ownerUserId,
      createdBy: 'admin-system',
    });

    assert.strictEqual(result1.alreadyGranted, false, 'First showcase reward should succeed');
    assert.ok(result1.transaction, 'Transaction should be generated for first showcase reward');
    assert.strictEqual(await hasUserReceivedShowcaseCredit(ownerUserId), true, 'Owner should have showcase credit recorded');
    assert.strictEqual(await hasUserClaimedReward(ownerUserId, 'SHOWCASE_REWARD'), true, 'User reward should be recorded');

    // Second showcase reward attempt
    const result2 = await grantShowcaseCredit({
      organizationId: org.id,
      eventId: event2,
      ownerUserId,
      createdBy: 'admin-system',
    });

    assert.strictEqual(result2.alreadyGranted, true, 'Second showcase reward must be rejected with alreadyGranted');
    assert.strictEqual(result2.transaction?.event_id, event1, 'No new transaction for event 2 should be granted');
    console.log('  ✓ PASSED: Owner lifetime Showcase Reward limit strictly enforced across multiple events.');
  }

  // Scenario 6: Welcome Credit and Showcase Reward are independently tracked per owner lifetime
  console.log('\nScenario 6: Welcome Credit and Showcase Reward are independently tracked per owner lifetime...');
  {
    const ownerUserId = `owner-${crypto.randomUUID().slice(0, 8)}`;
    const eventId = crypto.randomUUID();

    const org = await createOrganization({
      name: 'Dual Promo Org',
      owner_id: ownerUserId,
    });

    // 1. Owner receives Welcome Credit
    const welcomeResult = await grantWelcomeCredit({
      organizationId: org.id,
      userId: ownerUserId,
      createdBy: 'admin-system',
    });
    assert.strictEqual(welcomeResult.alreadyGranted, false);
    assert.strictEqual(await hasUserClaimedReward(ownerUserId, 'WELCOME_CREDIT'), true);

    // 2. Owner is STILL eligible for Showcase Reward!
    assert.strictEqual(await hasUserClaimedReward(ownerUserId, 'SHOWCASE_REWARD'), false, 'Claiming welcome credit does NOT consume showcase reward');

    const showcaseResult = await grantShowcaseCredit({
      organizationId: org.id,
      eventId,
      ownerUserId,
      createdBy: 'admin-system',
    });
    assert.strictEqual(showcaseResult.alreadyGranted, false, 'Showcase reward grant should succeed independently');
    assert.strictEqual(await hasUserClaimedReward(ownerUserId, 'SHOWCASE_REWARD'), true);

    // 3. Now both are claimed once
    assert.strictEqual(await hasUserClaimedReward(ownerUserId, 'WELCOME_CREDIT'), true);
    assert.strictEqual(await hasUserClaimedReward(ownerUserId, 'SHOWCASE_REWARD'), true);
    console.log('  ✓ PASSED: Both promotions operate under independent lifetime tracking.');
  }

  // Scenario 7: evaluatePromotionEligibility correctly reports eligibility according to business rules
  console.log('\nScenario 7: evaluatePromotionEligibility correctly reports eligibility according to business rules...');
  {
    const ownerUserId = `owner-${crypto.randomUUID().slice(0, 8)}`;
    const memberUserId = `member-${crypto.randomUUID().slice(0, 8)}`;

    const org = await createOrganization({
      name: 'Evaluation Org',
      owner_id: ownerUserId,
    });

    await addMember({
      organization_id: org.id,
      user_id: memberUserId,
      role: 'viewer',
    });

    // Member evaluation
    const memberWelcome = await evaluatePromotionEligibility({
      userId: memberUserId,
      organizationId: org.id,
      rewardType: 'WELCOME_CREDIT',
    });
    assert.strictEqual(memberWelcome.eligible, false, 'Member must NOT be eligible');
    assert.strictEqual(memberWelcome.isOwner, false, 'Member is not owner');

    // Owner initial evaluation
    const ownerWelcomeInitial = await evaluatePromotionEligibility({
      userId: ownerUserId,
      organizationId: org.id,
      rewardType: 'WELCOME_CREDIT',
    });
    assert.strictEqual(ownerWelcomeInitial.eligible, true, 'New owner must be eligible');
    assert.strictEqual(ownerWelcomeInitial.isOwner, true, 'Owner verified');
    assert.strictEqual(ownerWelcomeInitial.alreadyClaimed, false, 'Not claimed yet');

    // Owner claims Welcome Credit
    await grantWelcomeCredit({
      organizationId: org.id,
      userId: ownerUserId,
      createdBy: 'admin-system',
    });

    // Owner post-claim evaluation
    const ownerWelcomePost = await evaluatePromotionEligibility({
      userId: ownerUserId,
      organizationId: org.id,
      rewardType: 'WELCOME_CREDIT',
    });
    assert.strictEqual(ownerWelcomePost.eligible, false, 'Claimed owner must no longer be eligible');
    assert.strictEqual(ownerWelcomePost.isOwner, true);
    assert.strictEqual(ownerWelcomePost.alreadyClaimed, true);
    console.log('  ✓ PASSED: evaluatePromotionEligibility produces correct status across all roles and states.');
  }

  // Scenario 8: Deleting organization does not reset owner lifetime claim history
  console.log('\nScenario 8: Deleting organization does not reset owner lifetime claim history...');
  {
    const ownerUserId = `owner-${crypto.randomUUID().slice(0, 8)}`;

    const org = await createOrganization({
      name: 'To Be Deleted Org',
      owner_id: ownerUserId,
    });

    await grantWelcomeCredit({
      organizationId: org.id,
      userId: ownerUserId,
      createdBy: 'admin-system',
    });

    assert.strictEqual(await hasUserClaimedReward(ownerUserId, 'WELCOME_CREDIT'), true);

    // Delete organization
    await deleteOrganization(org.id);

    // Owner still marked as having claimed Welcome Credit
    assert.strictEqual(await hasUserClaimedReward(ownerUserId, 'WELCOME_CREDIT'), true, 'Deleting org does NOT reset user lifetime eligibility');

    // Create new organization
    const org2 = await createOrganization({
      name: 'New Org After Delete',
      owner_id: ownerUserId,
    });

    // Attempt grant in new organization
    const result2 = await grantWelcomeCredit({
      organizationId: org2.id,
      userId: ownerUserId,
      createdBy: 'admin-system',
    });
    assert.strictEqual(result2.alreadyGranted, true, 'Subsequent org after deletion cannot receive welcome credit');
    console.log('  ✓ PASSED: Deleting organization preserves user lifetime reward history.');
  }

  console.log('================================================================');
  console.log('🎉 ALL UNIFIED REWARDS ARCHITECTURE TESTS PASSED CLEANLY!');
  console.log('================================================================');
}

runUnifiedRewardsTests().catch((err) => {
  console.error('Unified Rewards Architecture Test Failed:', err);
  process.exit(1);
});
