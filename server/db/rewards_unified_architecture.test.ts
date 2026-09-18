import assert from 'node:assert';
import crypto from 'node:crypto';
import { createUser } from './users.js';
import {
  createOrganization,
  getOrganizationById,
  deleteOrganization,
} from './organizations.js';
import {
  addMember,
  removeMember,
  updateMemberRole,
} from './members.js';
import {
  createInvitation,
  markInvitationAccepted,
} from './invitations.js';
import {
  grantWelcomeCredit,
  grantShowcaseCredit,
  hasUserReceivedWelcomeCredit,
  hasUserReceivedShowcaseCredit,
  getWalletBalance,
  recalculateWalletBalances,
  localWalletsCache,
  localTransactionsCache,
  localUserRewardsCache,
  localOwnerShowcaseRewardsCache,
} from './wallet.js';
import { getSupabaseServerClient } from '../supabase.js';
import {
  evaluatePromotionEligibility,
  hasUserClaimedReward,
  isUserOrganizationOwner,
} from './rewards.js';

async function runUnifiedRewardsTests() {
  console.log('================================================================');
  console.log('UNIFIED REWARDS ARCHITECTURE VERIFICATION SUITE (11 SCENARIOS)');
  console.log('Owner-Only, User-Level, One-Time Promotions (Welcome & Showcase)');
  console.log('================================================================\n');

  // Clear in-memory caches to isolate test suite
  localUserRewardsCache.clear();
  localOwnerShowcaseRewardsCache.clear();

  // --------------------------------------------------------------------------
  // Scenario 1: Organization owner is recognized; non-owner member is rejected
  // --------------------------------------------------------------------------
  console.log('Scenario 1: Organization owner is recognized; non-owner member is rejected...');
  {
    const owner = await createUser({
      email: `owner-s1-${crypto.randomUUID().slice(0, 8)}@example.com`,
      name: 'Scenario 1 Owner',
    });
    const member = await createUser({
      email: `member-s1-${crypto.randomUUID().slice(0, 8)}@example.com`,
      name: 'Scenario 1 Member',
    });

    const org = await createOrganization({
      name: 'Owner Verification Org',
      owner_id: owner.id,
    });

    await addMember({
      organization_id: org.id,
      user_id: member.id,
      role: 'admin',
    });

    assert.strictEqual(await isUserOrganizationOwner(owner.id, org.id), true, 'Owner should be verified as owner');
    assert.strictEqual(await isUserOrganizationOwner(member.id, org.id), false, 'Admin member should NOT be verified as owner');
    console.log('  ✓ PASSED: Owner authorized; admin member rejected as owner.');
  }

  // --------------------------------------------------------------------------
  // Scenario 2: Non-owner member cannot receive Welcome Credit
  // --------------------------------------------------------------------------
  console.log('\nScenario 2: Non-owner member cannot receive Welcome Credit...');
  {
    const owner = await createUser({
      email: `owner-s2-${crypto.randomUUID().slice(0, 8)}@example.com`,
      name: 'Scenario 2 Owner',
    });
    const member = await createUser({
      email: `member-s2-${crypto.randomUUID().slice(0, 8)}@example.com`,
      name: 'Scenario 2 Member',
    });

    const org = await createOrganization({
      name: 'Non Owner Welcome Org',
      owner_id: owner.id,
    });

    await addMember({
      organization_id: org.id,
      user_id: member.id,
      role: 'admin',
    });

    const result = await grantWelcomeCredit({
      organizationId: org.id,
      userId: member.id,
      createdBy: owner.id,
    });

    assert.strictEqual(result.notEligible, true, 'Non-owner should be flagged as notEligible');
    assert.strictEqual(result.alreadyGranted, false, 'Non-owner should not be flagged as alreadyGranted');
    assert.strictEqual(result.transaction, null, 'No transaction should be created for non-owner');
    assert.strictEqual(await hasUserReceivedWelcomeCredit(member.id), false, 'Member should not be marked as having received credit');
    console.log('  ✓ PASSED: Non-owner member denied Welcome Credit with notEligible flag.');
  }

  // --------------------------------------------------------------------------
  // Scenario 3: Non-owner member cannot receive Showcase Reward
  // --------------------------------------------------------------------------
  console.log('\nScenario 3: Non-owner member cannot receive Showcase Reward...');
  {
    const owner = await createUser({
      email: `owner-s3-${crypto.randomUUID().slice(0, 8)}@example.com`,
      name: 'Scenario 3 Owner',
    });
    const member = await createUser({
      email: `member-s3-${crypto.randomUUID().slice(0, 8)}@example.com`,
      name: 'Scenario 3 Member',
    });
    const eventId = crypto.randomUUID();

    const org = await createOrganization({
      name: 'Non Owner Showcase Org',
      owner_id: owner.id,
    });

    await addMember({
      organization_id: org.id,
      user_id: member.id,
      role: 'designer',
    });

    const result = await grantShowcaseCredit({
      organizationId: org.id,
      eventId,
      ownerUserId: member.id,
      createdBy: owner.id,
    });

    assert.strictEqual(result.notEligible, true, 'Non-owner should be flagged as notEligible');
    assert.strictEqual(result.alreadyGranted, false, 'Non-owner should not be flagged as alreadyGranted');
    assert.strictEqual(result.transaction, null, 'No transaction should be created for non-owner');
    assert.strictEqual(await hasUserReceivedShowcaseCredit(member.id), false, 'Member should not be marked as having received reward');
    console.log('  ✓ PASSED: Non-owner member denied Showcase Reward with notEligible flag.');
  }

  // --------------------------------------------------------------------------
  // Scenario 4: Owner receives Welcome Credit in Org 1; rejected in Org 2 (lifetime limit)
  // --------------------------------------------------------------------------
  console.log('\nScenario 4: Owner receives Welcome Credit in Org 1; rejected in Org 2 (lifetime limit)...');
  {
    const owner = await createUser({
      email: `owner-s4-${crypto.randomUUID().slice(0, 8)}@example.com`,
      name: 'Scenario 4 Owner',
    });

    const org1 = await createOrganization({
      name: 'Org 1',
      owner_id: owner.id,
    });

    const org2 = await createOrganization({
      name: 'Org 2',
      owner_id: owner.id,
    });

    const org1Wallet = await getWalletBalance(org1.id);
    assert.strictEqual(Number(org1Wallet.welcome_credit), 800, 'Org 1 automatically receives RM800 welcome credit upon creation');
    assert.strictEqual(await hasUserReceivedWelcomeCredit(owner.id), true, 'Owner should have lifetime credit recorded');
    assert.strictEqual(await hasUserClaimedReward(owner.id, 'WELCOME_CREDIT'), true, 'User reward should be recorded');

    // Subsequent grant attempt in Org 1 returns alreadyGranted
    const result1 = await grantWelcomeCredit({
      organizationId: org1.id,
      userId: owner.id,
      createdBy: owner.id,
    });
    assert.strictEqual(result1.alreadyGranted, true, 'Subsequent grant in Org 1 returns alreadyGranted');

    // Attempt grant in Org 2 for same owner
    const result2 = await grantWelcomeCredit({
      organizationId: org2.id,
      userId: owner.id,
      createdBy: owner.id,
    });

    assert.strictEqual(result2.alreadyGranted, true, 'Second grant must be rejected with alreadyGranted');
    const org2Wallet = await getWalletBalance(org2.id);
    assert.strictEqual(Number(org2Wallet.welcome_credit), 0, 'Org 2 wallet must receive RM0.00 welcome credit');
    console.log('  ✓ PASSED: Owner lifetime Welcome Credit limit strictly enforced across multiple organizations.');
  }

  // --------------------------------------------------------------------------
  // Scenario 5: Owner receives Showcase Reward once; rejected on second showcase (lifetime limit)
  // --------------------------------------------------------------------------
  console.log('\nScenario 5: Owner receives Showcase Reward once; rejected on second showcase (lifetime limit)...');
  {
    const owner = await createUser({
      email: `owner-s5-${crypto.randomUUID().slice(0, 8)}@example.com`,
      name: 'Scenario 5 Owner',
    });
    const event1 = crypto.randomUUID();
    const event2 = crypto.randomUUID();

    const org = await createOrganization({
      name: 'Showcase Org',
      owner_id: owner.id,
    });

    const result1 = await grantShowcaseCredit({
      organizationId: org.id,
      eventId: event1,
      ownerUserId: owner.id,
      createdBy: owner.id,
    });

    assert.strictEqual(result1.alreadyGranted, false, 'First showcase reward should succeed');
    assert.ok(result1.transaction, 'Transaction should be generated for first showcase reward');
    assert.strictEqual(await hasUserReceivedShowcaseCredit(owner.id), true, 'Owner should have showcase credit recorded');
    assert.strictEqual(await hasUserClaimedReward(owner.id, 'SHOWCASE_REWARD'), true, 'User reward should be recorded');

    // Second showcase reward attempt
    const result2 = await grantShowcaseCredit({
      organizationId: org.id,
      eventId: event2,
      ownerUserId: owner.id,
      createdBy: owner.id,
    });

    assert.strictEqual(result2.alreadyGranted, true, 'Second showcase reward must be rejected with alreadyGranted');
    assert.strictEqual(result2.transaction?.event_id, event1, 'No new transaction for event 2 should be granted');
    console.log('  ✓ PASSED: Owner lifetime Showcase Reward limit strictly enforced across multiple events.');
  }

  // --------------------------------------------------------------------------
  // Scenario 6: Welcome Credit and Showcase Reward are independently tracked per owner lifetime
  // --------------------------------------------------------------------------
  console.log('\nScenario 6: Welcome Credit and Showcase Reward are independently tracked per owner lifetime...');
  {
    const owner = await createUser({
      email: `owner-s6-${crypto.randomUUID().slice(0, 8)}@example.com`,
      name: 'Scenario 6 Owner',
    });
    const eventId = crypto.randomUUID();

    const org = await createOrganization({
      name: 'Dual Promo Org',
      owner_id: owner.id,
    });

    // 1. Owner receives Welcome Credit automatically upon first org creation
    assert.strictEqual(await hasUserClaimedReward(owner.id, 'WELCOME_CREDIT'), true);
    const orgWallet = await getWalletBalance(org.id);
    assert.strictEqual(Number(orgWallet.welcome_credit), 800);

    const welcomeResult = await grantWelcomeCredit({
      organizationId: org.id,
      userId: owner.id,
      createdBy: owner.id,
    });
    assert.strictEqual(welcomeResult.alreadyGranted, true);

    // 2. Owner is STILL eligible for Showcase Reward!
    assert.strictEqual(await hasUserClaimedReward(owner.id, 'SHOWCASE_REWARD'), false, 'Claiming welcome credit does NOT consume showcase reward');

    const showcaseResult = await grantShowcaseCredit({
      organizationId: org.id,
      eventId,
      ownerUserId: owner.id,
      createdBy: owner.id,
    });
    assert.strictEqual(showcaseResult.alreadyGranted, false, 'Showcase reward grant should succeed independently');
    assert.strictEqual(await hasUserClaimedReward(owner.id, 'SHOWCASE_REWARD'), true);

    // 3. Now both are claimed once
    assert.strictEqual(await hasUserClaimedReward(owner.id, 'WELCOME_CREDIT'), true);
    assert.strictEqual(await hasUserClaimedReward(owner.id, 'SHOWCASE_REWARD'), true);
    console.log('  ✓ PASSED: Both promotions operate under independent lifetime tracking.');
  }

  // --------------------------------------------------------------------------
  // Scenario 7: evaluatePromotionEligibility correctly reports eligibility across roles
  // --------------------------------------------------------------------------
  console.log('\nScenario 7: evaluatePromotionEligibility correctly reports eligibility according to business rules...');
  {
    const owner = await createUser({
      email: `owner-s7-${crypto.randomUUID().slice(0, 8)}@example.com`,
      name: 'Scenario 7 Owner',
    });
    const member = await createUser({
      email: `member-s7-${crypto.randomUUID().slice(0, 8)}@example.com`,
      name: 'Scenario 7 Member',
    });

    const org = await createOrganization({
      name: 'Evaluation Org',
      owner_id: owner.id,
    });

    await addMember({
      organization_id: org.id,
      user_id: member.id,
      role: 'viewer',
    });

    // Member evaluation
    const memberWelcome = await evaluatePromotionEligibility({
      userId: member.id,
      organizationId: org.id,
      rewardType: 'WELCOME_CREDIT',
    });
    assert.strictEqual(memberWelcome.eligible, false, 'Member must NOT be eligible');
    assert.strictEqual(memberWelcome.isOwner, false, 'Member is not owner');

    // Owner evaluation for welcome credit (already automatically claimed upon org creation)
    const ownerWelcomeInitial = await evaluatePromotionEligibility({
      userId: owner.id,
      organizationId: org.id,
      rewardType: 'WELCOME_CREDIT',
    });
    assert.strictEqual(ownerWelcomeInitial.eligible, false, 'Owner already claimed welcome credit on creation');
    assert.strictEqual(ownerWelcomeInitial.isOwner, true, 'Owner verified');
    assert.strictEqual(ownerWelcomeInitial.alreadyClaimed, true, 'Already claimed on creation');

    // Owner evaluation for showcase reward (not claimed yet)
    const ownerShowcaseInitial = await evaluatePromotionEligibility({
      userId: owner.id,
      organizationId: org.id,
      rewardType: 'SHOWCASE_REWARD',
    });
    assert.strictEqual(ownerShowcaseInitial.eligible, true, 'Showcase reward not claimed yet');
    assert.strictEqual(ownerShowcaseInitial.isOwner, true);
    assert.strictEqual(ownerShowcaseInitial.alreadyClaimed, false);
    console.log('  ✓ PASSED: evaluatePromotionEligibility produces correct status across all roles and states.');
  }

  // --------------------------------------------------------------------------
  // Scenario 8: Deleting organization does not reset owner lifetime claim history
  // --------------------------------------------------------------------------
  console.log('\nScenario 8: Deleting organization does not reset owner lifetime claim history...');
  {
    const owner = await createUser({
      email: `owner-s8-${crypto.randomUUID().slice(0, 8)}@example.com`,
      name: 'Scenario 8 Owner',
    });

    const org = await createOrganization({
      name: 'To Be Deleted Org',
      owner_id: owner.id,
    });

    await grantWelcomeCredit({
      organizationId: org.id,
      userId: owner.id,
      createdBy: owner.id,
    });

    assert.strictEqual(await hasUserClaimedReward(owner.id, 'WELCOME_CREDIT'), true);

    // Delete organization
    await deleteOrganization(org.id);

    // Owner still marked as having claimed Welcome Credit
    assert.strictEqual(await hasUserClaimedReward(owner.id, 'WELCOME_CREDIT'), true, 'Deleting org does NOT reset user lifetime eligibility');

    // Create new organization
    const org2 = await createOrganization({
      name: 'New Org After Delete',
      owner_id: owner.id,
    });

    // Attempt grant in new organization
    const result2 = await grantWelcomeCredit({
      organizationId: org2.id,
      userId: owner.id,
      createdBy: owner.id,
    });
    assert.strictEqual(result2.alreadyGranted, true, 'Subsequent org after deletion cannot receive welcome credit');
    console.log('  ✓ PASSED: Deleting organization preserves user lifetime reward history.');
  }

  // --------------------------------------------------------------------------
  // Scenario 9: Spending wallet credits does not reset owner promotion eligibility
  // --------------------------------------------------------------------------
  console.log('\nScenario 9: Spending wallet credits does not reset owner promotion eligibility...');
  {
    const owner = await createUser({
      email: `owner-s9-${crypto.randomUUID().slice(0, 8)}@example.com`,
      name: 'Scenario 9 Owner',
    });

    const org = await createOrganization({
      name: 'Wallet Drain Org',
      owner_id: owner.id,
    });

    await grantWelcomeCredit({
      organizationId: org.id,
      userId: owner.id,
      createdBy: owner.id,
    });

    const walletBefore = await getWalletBalance(org.id);
    assert.strictEqual(Number(walletBefore.welcome_credit), 800);

    // Simulate spending/consuming the welcome credit completely down to RM0 via ledger usage
    const spendId = crypto.randomUUID();
    localTransactionsCache.set(spendId, {
      id: spendId,
      organization_id: org.id,
      owner_user_id: owner.id,
      transaction_type: 'CREDIT_USAGE',
      balance_type: 'WELCOME_CREDIT',
      amount: -800,
      currency: 'MYR',
      status: 'COMPLETED',
      reference_id: 'spend_welcome_credit',
      event_id: null,
      metadata: {},
      created_by: owner.id,
      description: 'Spend welcome credit',
      created_at: new Date().toISOString(),
    });
    localWalletsCache.delete(org.id);
    const walletAfter = await recalculateWalletBalances(org.id);
    assert.strictEqual(Number(walletAfter.welcome_credit), 0, 'Wallet welcome credit drained to RM0');

    // Claim state remains authoritative
    assert.strictEqual(await hasUserClaimedReward(owner.id, 'WELCOME_CREDIT'), true, 'User reward remains recorded even with RM0 wallet balance');

    const evalResult = await evaluatePromotionEligibility({
      userId: owner.id,
      organizationId: org.id,
      rewardType: 'WELCOME_CREDIT',
    });
    assert.strictEqual(evalResult.eligible, false, 'Owner with RM0 wallet balance is NOT eligible after having claimed once');
    assert.strictEqual(evalResult.alreadyClaimed, true);

    const reGrant = await grantWelcomeCredit({
      organizationId: org.id,
      userId: owner.id,
      createdBy: owner.id,
    });
    assert.strictEqual(reGrant.alreadyGranted, true, 'Re-grant attempt rejected despite RM0 wallet balance');
    console.log('  ✓ PASSED: Promotion eligibility is strictly independent of current wallet balance.');
  }

  // --------------------------------------------------------------------------
  // Scenario 10: Concurrent requests safety (race condition protection)
  // --------------------------------------------------------------------------
  console.log('\nScenario 10: Concurrent requests safety (race condition protection)...');
  {
    const owner = await createUser({
      email: `owner-s10-${crypto.randomUUID().slice(0, 8)}@example.com`,
      name: 'Scenario 10 Owner',
    });

    const [orgA, orgB, orgC] = await Promise.all([
      createOrganization({ name: 'Concurrent Org A', owner_id: owner.id }),
      createOrganization({ name: 'Concurrent Org B', owner_id: owner.id }),
      createOrganization({ name: 'Concurrent Org C', owner_id: owner.id }),
    ]);

    // Attempt 3 simultaneous grants across orgs for same owner (org creation already granted to exactly 1)
    const [resA, resB, resC] = await Promise.all([
      grantWelcomeCredit({ organizationId: orgA.id, userId: owner.id, createdBy: owner.id }),
      grantWelcomeCredit({ organizationId: orgB.id, userId: owner.id, createdBy: owner.id }),
      grantWelcomeCredit({ organizationId: orgC.id, userId: owner.id, createdBy: owner.id }),
    ]);

    const results = [resA, resB, resC];
    const successes = results.filter((r) => !r.alreadyGranted);
    const rejected = results.filter((r) => r.alreadyGranted);

    assert.strictEqual(successes.length, 0, `0 manual grants succeed because already claimed on org creation (got ${successes.length})`);
    assert.strictEqual(rejected.length, 3, `All 3 manual grants must be rejected as already granted (got ${rejected.length})`);

    const [wA, wB, wC] = await Promise.all([
      getWalletBalance(orgA.id),
      getWalletBalance(orgB.id),
      getWalletBalance(orgC.id),
    ]);

    const totalCredits = Number(wA.welcome_credit) + Number(wB.welcome_credit) + Number(wC.welcome_credit);
    assert.strictEqual(totalCredits, 800, `Total credits across all 3 orgs must equal exactly RM800 (got ${totalCredits})`);
    console.log('  ✓ PASSED: Concurrent grant attempts serialized cleanly; exactly 1 grant awarded.');
  }

  // --------------------------------------------------------------------------
  // Scenario 11: Member lifecycle events never grant or consume promotions
  // --------------------------------------------------------------------------
  console.log('\nScenario 11: Member lifecycle events never grant or consume promotions...');
  {
    const owner = await createUser({
      email: `owner-s11-${crypto.randomUUID().slice(0, 8)}@example.com`,
      name: 'Scenario 11 Owner',
    });
    const candidate = await createUser({
      email: `candidate-s11-${crypto.randomUUID().slice(0, 8)}@example.com`,
      name: 'Scenario 11 Candidate',
    });

    const org = await createOrganization({
      name: 'Lifecycle Org',
      owner_id: owner.id,
    });

    // 1. Create invitation
    const invitation = await createInvitation({
      organization_id: org.id,
      email: candidate.email,
      role: 'viewer',
      invited_by: owner.id,
    });
    assert.strictEqual(await hasUserClaimedReward(candidate.id, 'WELCOME_CREDIT'), false);

    // 2. Accept invitation & join
    await markInvitationAccepted(invitation.id);
    const member = await addMember({
      organization_id: org.id,
      user_id: candidate.id,
      role: 'viewer',
    });
    assert.strictEqual(await hasUserClaimedReward(candidate.id, 'WELCOME_CREDIT'), false);

    // 3. Promote member to admin
    await updateMemberRole(org.id, candidate.id, 'admin');
    assert.strictEqual(await hasUserClaimedReward(candidate.id, 'WELCOME_CREDIT'), false);

    // 4. Remove member
    await removeMember(member.id);
    assert.strictEqual(await hasUserClaimedReward(candidate.id, 'WELCOME_CREDIT'), false);

    // 5. Candidate creates their OWN organization later -> automatically receives RM800 as OWNER!
    const candidateOrg = await createOrganization({
      name: "Candidate's Own Org",
      owner_id: candidate.id,
    });

    const candidateWallet = await getWalletBalance(candidateOrg.id);
    assert.strictEqual(Number(candidateWallet.welcome_credit), 800, 'Candidate automatically receives RM800 welcome credit on their first org');
    assert.strictEqual(await hasUserClaimedReward(candidate.id, 'WELCOME_CREDIT'), true);

    const candidateEval = await evaluatePromotionEligibility({
      userId: candidate.id,
      organizationId: candidateOrg.id,
      rewardType: 'WELCOME_CREDIT',
    });
    assert.strictEqual(candidateEval.eligible, false, 'Candidate already claimed upon creating first org');
    assert.strictEqual(candidateEval.isOwner, true);
    assert.strictEqual(candidateEval.alreadyClaimed, true);

    const candidateGrant = await grantWelcomeCredit({
      organizationId: candidateOrg.id,
      userId: candidate.id,
      createdBy: candidate.id,
    });
    assert.strictEqual(candidateGrant.alreadyGranted, true, 'Subsequent manual grant rejected as already granted');
    console.log('  ✓ PASSED: Member lifecycle operations never grant or consume promotional eligibility.');
  }

  console.log('\n================================================================');
  console.log('🎉 ALL 11 UNIFIED REWARDS ARCHITECTURE SCENARIOS PASSED CLEANLY!');
  console.log('================================================================\n');

  process.exit(0);
}

runUnifiedRewardsTests().catch((err) => {
  console.error('Unified Rewards Architecture Test Failed:', err);
  process.exit(1);
});
