import {
  grantWelcomeCredit,
  hasUserReceivedWelcomeCredit,
  grantShowcaseCredit,
  hasUserReceivedShowcaseCredit,
  getWalletBalance,
} from './wallet.js';
import {
  createOrganization,
  deleteOrganization,
  getOrganizationById,
  localOrgsCache,
} from './organizations.js';
import { evaluateShowcaseRewardEligibility } from './showcases.js';
import crypto from 'node:crypto';

function assertTrue(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`❌ FAILED: ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  }
  console.log(`  ✓ PASSED: ${msg}`);
}

async function runLifetimeRewardsTestSuite() {
  console.log('======================================================');
  console.log('USER LIFETIME REWARDS AUDIT TEST SUITE');
  console.log('Welcome Credit (RM800) & Showcase Credit (RM300)');
  console.log('Strict One-Time Per User Lifetime Across All Orgs');
  console.log('======================================================\n');

  const testUserId = `test-user-${crypto.randomUUID()}`;
  const testUserEmail = `user-${Date.now()}@example.com`;

  // ---------------------------------------------------------
  // TEST 1: User creates Organization A
  // Eligible for RM800 Welcome Credit on first org
  // ---------------------------------------------------------
  console.log('Test 1: User creates Organization A (first org)...');
  const orgA = await createOrganization({
    name: 'User Org Alpha',
    owner_id: testUserId,
    country_code: 'MY',
  });

  assertTrue(Boolean(orgA?.id), 'Organization A created successfully');
  const hasReceivedWelcome = await hasUserReceivedWelcomeCredit(testUserId);
  assertTrue(hasReceivedWelcome, 'hasUserReceivedWelcomeCredit returns true for user after Org A creation');

  const walletA = await getWalletBalance(orgA.id);
  assertTrue(walletA.welcome_credit === 800, 'Org A wallet received RM800 Welcome Credit');
  assertTrue(walletA.welcome_credit_granted === true, 'Org A wallet welcome_credit_granted is true');

  // ---------------------------------------------------------
  // TEST 2: User creates Organization B
  // Must NOT receive Welcome Credit
  // ---------------------------------------------------------
  console.log('\nTest 2: Same user creates Organization B (second org)...');
  const orgB = await createOrganization({
    name: 'User Org Beta',
    owner_id: testUserId,
    country_code: 'MY',
  });

  assertTrue(Boolean(orgB?.id), 'Organization B created successfully');
  const walletB = await getWalletBalance(orgB.id);
  assertTrue(walletB.welcome_credit === 0, 'Org B wallet has RM0 Welcome Credit (NOT eligible)');
  assertTrue(walletB.welcome_credit_granted === false, 'Org B wallet welcome_credit_granted is false');

  // Direct grantWelcomeCredit call on Org B must also be rejected
  const manualGrantB = await grantWelcomeCredit({
    organizationId: orgB.id,
    userId: testUserId,
    createdBy: testUserId,
  });
  assertTrue(manualGrantB.alreadyGranted === true, 'Manual grantWelcomeCredit on Org B returns alreadyGranted: true');
  assertTrue(manualGrantB.wallet.welcome_credit === 0, 'Org B wallet remains RM0 after manual grant attempt');

  // ---------------------------------------------------------
  // TEST 3: User creates Organization C
  // Must NOT receive Welcome Credit
  // ---------------------------------------------------------
  console.log('\nTest 3: Same user creates Organization C (third org)...');
  const orgC = await createOrganization({
    name: 'User Org Gamma',
    owner_id: testUserId,
    country_code: 'MY',
  });

  assertTrue(Boolean(orgC?.id), 'Organization C created successfully');
  const walletC = await getWalletBalance(orgC.id);
  assertTrue(walletC.welcome_credit === 0, 'Org C wallet has RM0 Welcome Credit (NOT eligible)');
  assertTrue(walletC.welcome_credit_granted === false, 'Org C wallet welcome_credit_granted is false');

  // ---------------------------------------------------------
  // TEST 4: Deleting an organization must NOT reset eligibility
  // ---------------------------------------------------------
  console.log('\nTest 4: Deleting Organization A and creating Organization D...');
  await deleteOrganization(orgA.id);
  const deletedOrg = await getOrganizationById(orgA.id);
  assertTrue(!deletedOrg, 'Organization A deleted from cache');

  const stillRecorded = await hasUserReceivedWelcomeCredit(testUserId);
  assertTrue(stillRecorded, 'hasUserReceivedWelcomeCredit remains true after Org A deletion');

  const orgD = await createOrganization({
    name: 'User Org Delta',
    owner_id: testUserId,
    country_code: 'MY',
  });

  const walletD = await getWalletBalance(orgD.id);
  assertTrue(walletD.welcome_credit === 0, 'Org D wallet has RM0 Welcome Credit (deleting org did NOT reset eligibility)');
  assertTrue(walletD.welcome_credit_granted === false, 'Org D wallet welcome_credit_granted is false');

  // ---------------------------------------------------------
  // TEST 5: Showcase Reward (RM300) Lifetime Limit per user
  // First grant succeeds for Organization B
  // ---------------------------------------------------------
  console.log('\nTest 5: Granting first Showcase Credit to user under Organization B...');
  const initialShowcaseCheck = await hasUserReceivedShowcaseCredit(testUserId);
  assertTrue(!initialShowcaseCheck, 'User has not received showcase credit initially');

  const showcaseGrant1 = await grantShowcaseCredit({
    organizationId: orgB.id,
    ownerUserId: testUserId,
    eventId: crypto.randomUUID(),
    createdBy: testUserId,
  });

  assertTrue(showcaseGrant1.alreadyGranted === false, 'First showcase grant succeeded');
  assertTrue(showcaseGrant1.wallet.showcase_credit === 300, 'Org B received RM300 Showcase Credit');

  const postShowcaseCheck = await hasUserReceivedShowcaseCredit(testUserId);
  assertTrue(postShowcaseCheck, 'hasUserReceivedShowcaseCredit returns true after first grant');

  // ---------------------------------------------------------
  // TEST 6: Showcase Reward (RM300) for user under Organization C or D
  // Must be rejected (one-time lifetime limit per user/owner)
  // ---------------------------------------------------------
  console.log('\nTest 6: Attempting second Showcase Credit for same user under Organization C and D...');
  const showcaseGrant2 = await grantShowcaseCredit({
    organizationId: orgC.id,
    ownerUserId: testUserId,
    eventId: crypto.randomUUID(),
    createdBy: testUserId,
  });

  assertTrue(showcaseGrant2.alreadyGranted === true, 'Second showcase grant under Org C was rejected as already granted');
  assertTrue(showcaseGrant2.wallet.showcase_credit === 0, 'Org C received RM0 showcase credit');

  const showcaseGrant3 = await grantShowcaseCredit({
    organizationId: orgD.id,
    ownerUserId: testUserId,
    eventId: crypto.randomUUID(),
    createdBy: testUserId,
  });

  assertTrue(showcaseGrant3.alreadyGranted === true, 'Third showcase grant under Org D was rejected as already granted');
  assertTrue(showcaseGrant3.wallet.showcase_credit === 0, 'Org D received RM0 showcase credit');

  // ---------------------------------------------------------
  // TEST 7: Concurrent creation of multiple orgs by new user
  // Must grant Welcome Credit to at most ONE org
  // ---------------------------------------------------------
  console.log('\nTest 7: Concurrent creation of 3 orgs by a brand new user...');
  const concurrentUser = `test-concurrent-${crypto.randomUUID()}`;

  const [raceOrg1, raceOrg2, raceOrg3] = await Promise.all([
    createOrganization({ name: 'Race Org 1', owner_id: concurrentUser }),
    createOrganization({ name: 'Race Org 2', owner_id: concurrentUser }),
    createOrganization({ name: 'Race Org 3', owner_id: concurrentUser }),
  ]);

  const raceWallet1 = await getWalletBalance(raceOrg1.id);
  const raceWallet2 = await getWalletBalance(raceOrg2.id);
  const raceWallet3 = await getWalletBalance(raceOrg3.id);

  const totalWelcomeCredits = raceWallet1.welcome_credit + raceWallet2.welcome_credit + raceWallet3.welcome_credit;
  assertTrue(
    totalWelcomeCredits === 800,
    `Exactly RM800 welcome credit awarded across 3 concurrent org creations (got RM${totalWelcomeCredits})`
  );

  const grantedCount = [raceWallet1.welcome_credit_granted, raceWallet2.welcome_credit_granted, raceWallet3.welcome_credit_granted].filter(Boolean).length;
  assertTrue(grantedCount === 1, `Exactly 1 organization marked welcome_credit_granted (got ${grantedCount})`);

  console.log('\n======================================================');
  console.log('ALL LIFETIME REWARD AUDIT TESTS PASSED SUCCESSFULLY! ✓');
  console.log('======================================================\n');
}

runLifetimeRewardsTestSuite().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
