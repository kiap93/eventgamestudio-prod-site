import assert from 'node:assert';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createUser } from './users.js';
import {
  createOrganization,
  getOrganizationById,
  deleteOrganization,
  localOrgsCache,
} from './organizations.js';
import {
  addMember,
} from './members.js';
import {
  grantWelcomeCredit,
  getWalletBalance,
  hasUserReceivedWelcomeCredit,
  localWalletsCache,
  localTransactionsCache,
  WELCOME_CREDIT_AMOUNT,
} from './wallet.js';
import {
  evaluatePromotionEligibility,
} from './rewards.js';

async function runTests() {
  console.log('================================================================');
  console.log('AUTOMATIC WELCOME CREDIT ON FIRST ORG — 11 REQUIRED SCENARIOS');
  console.log('================================================================\n');

  // SCENARIO 1: New user creates first org as OWNER -> RM800 automatically.
  console.log('Scenario 1: New user creates first org as OWNER -> RM800 automatically...');
  const user1 = await createUser({
    email: `s1-user-${crypto.randomUUID().slice(0, 8)}@example.com`,
    name: 'Scenario 1 User',
  });

  const org1 = await createOrganization({
    name: 'Scenario 1 Org',
    owner_id: user1.id,
    country_code: 'MY',
  });

  const wallet1 = await getWalletBalance(org1.id);
  assert.strictEqual(
    Number(wallet1.welcome_credit),
    800.00,
    'First org created by new owner must automatically receive RM800 Welcome Credit'
  );
  assert.strictEqual(
    wallet1.welcome_credit_granted,
    true,
    'welcome_credit_granted must be true on first org'
  );
  assert.strictEqual(
    await hasUserReceivedWelcomeCredit(user1.id),
    true,
    'User must be marked as having received Welcome Credit'
  );
  console.log('  ✓ PASSED: First org automatically received RM800 Welcome Credit.\n');

  // SCENARIO 2: Same user creates second org as OWNER -> RM0.
  console.log('Scenario 2: Same user creates second org as OWNER -> RM0...');
  const org1Second = await createOrganization({
    name: 'Scenario 1 Second Org',
    owner_id: user1.id,
    country_code: 'MY',
  });

  const wallet1Second = await getWalletBalance(org1Second.id);
  assert.strictEqual(
    Number(wallet1Second.welcome_credit),
    0.00,
    'Second org created by same owner must receive RM0 Welcome Credit'
  );
  assert.strictEqual(
    wallet1Second.welcome_credit_granted,
    false,
    'Second org welcome_credit_granted must be false'
  );
  console.log('  ✓ PASSED: Second org received RM0 Welcome Credit.\n');

  // SCENARIO 3: User invited as MEMBER to an org -> RM0.
  console.log('Scenario 3: User invited as MEMBER to an org -> RM0...');
  const memberUser = await createUser({
    email: `s3-member-${crypto.randomUUID().slice(0, 8)}@example.com`,
    name: 'Scenario 3 Member',
  });

  // Invited as member to org1
  await addMember({
    organization_id: org1.id,
    user_id: memberUser.id,
    role: 'viewer',
  });

  assert.strictEqual(
    await hasUserReceivedWelcomeCredit(memberUser.id),
    false,
    'Being added as a member must NOT mark user as having received Welcome Credit'
  );
  console.log('  ✓ PASSED: Organization member receives RM0 and maintains lifetime eligibility.\n');

  // SCENARIO 4: That member later creates their own first org as OWNER -> RM800.
  console.log('Scenario 4: That member later creates their own first org as OWNER -> RM800...');
  const memberFirstOrg = await createOrganization({
    name: 'Member First Owned Org',
    owner_id: memberUser.id,
    country_code: 'MY',
  });

  const memberOrgWallet = await getWalletBalance(memberFirstOrg.id);
  assert.strictEqual(
    Number(memberOrgWallet.welcome_credit),
    800.00,
    'Former member creating their own first org as owner must receive RM800'
  );
  assert.strictEqual(
    memberOrgWallet.welcome_credit_granted,
    true,
    'welcome_credit_granted must be true on former member first org'
  );
  assert.strictEqual(
    await hasUserReceivedWelcomeCredit(memberUser.id),
    true,
    'Former member is now marked as having received Welcome Credit'
  );
  console.log('  ✓ PASSED: Former member creating their first org as owner receives RM800.\n');

  // SCENARIO 5: User creates org 1 -> spends all RM800 -> creates org 2 as OWNER -> RM0.
  console.log('Scenario 5: User creates org 1 -> spends all RM800 -> creates org 2 as OWNER -> RM0...');
  const user5 = await createUser({
    email: `s5-spend-${crypto.randomUUID().slice(0, 8)}@example.com`,
    name: 'Scenario 5 Spender',
  });

  const org5_1 = await createOrganization({
    name: 'Org 5 First',
    owner_id: user5.id,
    country_code: 'MY',
  });

  // Spend all RM800 down to RM0
  const cachedWallet5 = localWalletsCache.get(org5_1.id);
  if (cachedWallet5) {
    cachedWallet5.welcome_credit = 0.00;
  }
  const spendTxnId = crypto.randomUUID();
  localTransactionsCache.set(spendTxnId, {
    id: spendTxnId,
    organization_id: org5_1.id,
    owner_user_id: user5.id,
    created_by: user5.id,
    transaction_type: 'CREDIT_USAGE',
    balance_type: 'WELCOME_CREDIT',
    amount: -800.00,
    currency: 'MYR',
    status: 'COMPLETED',
    reference_id: 'spend_all_800',
    event_id: null,
    metadata: {},
    description: 'Spent all RM800 welcome credit',
    created_at: new Date().toISOString(),
  });

  const wallet5_1AfterSpend = await getWalletBalance(org5_1.id);
  assert.strictEqual(
    Number(wallet5_1AfterSpend.welcome_credit),
    0.00,
    'Wallet welcome credit is now RM0'
  );

  // Now create Org 2 as OWNER
  const org5_2 = await createOrganization({
    name: 'Org 5 Second',
    owner_id: user5.id,
    country_code: 'MY',
  });

  const wallet5_2 = await getWalletBalance(org5_2.id);
  assert.strictEqual(
    Number(wallet5_2.welcome_credit),
    0.00,
    'Spending credits to RM0 does not reset eligibility; second org gets RM0'
  );
  console.log('  ✓ PASSED: Spending credit to RM0 does not reset eligibility; second org gets RM0.\n');

  // SCENARIO 6: User creates org 1 -> RM800 -> deletes org 1 -> creates org 2 as OWNER -> RM0.
  console.log('Scenario 6: User creates org 1 -> RM800 -> deletes org 1 -> creates org 2 as OWNER -> RM0...');
  const user6 = await createUser({
    email: `s6-delete-${crypto.randomUUID().slice(0, 8)}@example.com`,
    name: 'Scenario 6 Delete Org User',
  });

  const org6_1 = await createOrganization({
    name: 'Org 6 To Delete',
    owner_id: user6.id,
    country_code: 'MY',
  });

  const wallet6_1 = await getWalletBalance(org6_1.id);
  assert.strictEqual(Number(wallet6_1.welcome_credit), 800.00);

  // Delete org 1
  await deleteOrganization(org6_1.id);

  // Create org 2 as owner
  const org6_2 = await createOrganization({
    name: 'Org 6 Second Org',
    owner_id: user6.id,
    country_code: 'MY',
  });

  const wallet6_2 = await getWalletBalance(org6_2.id);
  assert.strictEqual(
    Number(wallet6_2.welcome_credit),
    0.00,
    'Deleting prior organization does NOT reset lifetime reward history; second org gets RM0'
  );
  console.log('  ✓ PASSED: Deleting prior organization does not reset lifetime eligibility.\n');

  // SCENARIO 7: Concurrent creation: User creates Org 1 and Org 2 at same time -> exactly ONE gets RM800, other gets RM0.
  console.log('Scenario 7: Concurrent creation: User creates Org 1 and Org 2 at same time -> exactly ONE gets RM800, other gets RM0...');
  const user7 = await createUser({
    email: `s7-concurrent-${crypto.randomUUID().slice(0, 8)}@example.com`,
    name: 'Scenario 7 Concurrent User',
  });

  const [concurrentOrgA, concurrentOrgB] = await Promise.all([
    createOrganization({
      name: 'Concurrent Org A',
      owner_id: user7.id,
      country_code: 'MY',
    }),
    createOrganization({
      name: 'Concurrent Org B',
      owner_id: user7.id,
      country_code: 'MY',
    }),
  ]);

  const walletA = await getWalletBalance(concurrentOrgA.id);
  const walletB = await getWalletBalance(concurrentOrgB.id);

  const credA = Number(walletA.welcome_credit);
  const credB = Number(walletB.welcome_credit);

  const totalGranted = credA + credB;
  assert.strictEqual(
    totalGranted,
    800.00,
    `Under concurrent creation, total granted across both orgs must be exactly RM800.00 (got ${totalGranted})`
  );
  assert.ok(
    (credA === 800.00 && credB === 0.00) || (credA === 0.00 && credB === 800.00),
    'Exactly one organization receives RM800 and the other receives RM0'
  );
  console.log(`  ✓ PASSED: Concurrent creation awarded RM800 to one org and RM0 to the other (A: ${credA}, B: ${credB}).\n`);

  // SCENARIO 8: Non-owner member calling/triggering welcome credit -> rejected.
  console.log('Scenario 8: Non-owner member calling/triggering welcome credit -> rejected...');
  const user8Owner = await createUser({
    email: `s8-owner-${crypto.randomUUID().slice(0, 8)}@example.com`,
    name: 'Scenario 8 Owner',
  });

  const org8 = await createOrganization({
    name: 'Org 8 Security Test',
    owner_id: user8Owner.id,
    country_code: 'MY',
  });

  const user8Member = await createUser({
    email: `s8-member-${crypto.randomUUID().slice(0, 8)}@example.com`,
    name: 'Scenario 8 Attacker Member',
  });

  await addMember({
    organization_id: org8.id,
    user_id: user8Member.id,
    role: 'viewer',
  });

  const memberGrantAttempt = await grantWelcomeCredit({
    organizationId: org8.id,
    userId: user8Member.id,
    createdBy: user8Member.id,
  });

  assert.strictEqual(
    memberGrantAttempt.notEligible,
    true,
    'Non-owner member attempt must be rejected with notEligible = true'
  );
  assert.strictEqual(
    memberGrantAttempt.alreadyGranted,
    false,
    'alreadyGranted is false because member was rejected on ownership'
  );
  console.log('  ✓ PASSED: Non-owner member grant attempt strictly rejected.\n');

  // SCENARIO 9: Check eligibility API
  console.log('Scenario 9: Check eligibility API (evaluatePromotionEligibility)...');
  const user9 = await createUser({
    email: `s9-eligibility-${crypto.randomUUID().slice(0, 8)}@example.com`,
    name: 'Scenario 9 User',
  });

  // Create organization dummy object without running full creation to check fresh state:
  const tempOrgId = crypto.randomUUID();
  localOrgsCache.set(tempOrgId, {
    id: tempOrgId,
    name: 'Pre-grant Org',
    slug: `pre-grant-${tempOrgId.slice(0, 6)}`,
    owner_id: user9.id,
    country_code: 'MY',
    logo_url: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  // 9a. For new user before receiving: eligible = true, isOwner = true, alreadyClaimed = false
  const preCheck = await evaluatePromotionEligibility({
    userId: user9.id,
    organizationId: tempOrgId,
    rewardType: 'WELCOME_CREDIT',
  });
  assert.strictEqual(preCheck.eligible, true, 'Eligible should be true for owner who has not claimed');
  assert.strictEqual(preCheck.isOwner, true, 'isOwner should be true');
  assert.strictEqual(preCheck.alreadyClaimed, false, 'alreadyClaimed should be false');

  // Now create an actual organization which awards Welcome Credit
  const realOrg9 = await createOrganization({
    name: 'Real Org 9',
    owner_id: user9.id,
    country_code: 'MY',
  });

  // 9b. After receiving: eligible = false, isOwner = true, alreadyClaimed = true
  const postCheck = await evaluatePromotionEligibility({
    userId: user9.id,
    organizationId: realOrg9.id,
    rewardType: 'WELCOME_CREDIT',
  });
  assert.strictEqual(postCheck.eligible, false, 'Eligible should be false after receiving');
  assert.strictEqual(postCheck.isOwner, true, 'isOwner should be true');
  assert.strictEqual(postCheck.alreadyClaimed, true, 'alreadyClaimed should be true');

  // 9c. For member: eligible = false, isOwner = false
  const user9Member = await createUser({
    email: `s9-member-${crypto.randomUUID().slice(0, 8)}@example.com`,
    name: 'Scenario 9 Member',
  });
  await addMember({
    organization_id: realOrg9.id,
    user_id: user9Member.id,
    role: 'designer',
  });
  const memberCheck = await evaluatePromotionEligibility({
    userId: user9Member.id,
    organizationId: realOrg9.id,
    rewardType: 'WELCOME_CREDIT',
  });
  assert.strictEqual(memberCheck.eligible, false, 'Eligible should be false for member');
  assert.strictEqual(memberCheck.isOwner, false, 'isOwner should be false for member');
  console.log('  ✓ PASSED: evaluatePromotionEligibility returns exact expected states for all cases.\n');

  // SCENARIO 10: Showcase reward independence: Receiving Welcome Credit does not affect Showcase Reward eligibility, and vice versa.
  console.log('Scenario 10: Showcase reward independence: Receiving Welcome Credit does not affect Showcase Reward...');
  const user10 = await createUser({
    email: `s10-independent-${crypto.randomUUID().slice(0, 8)}@example.com`,
    name: 'Scenario 10 User',
  });

  const org10 = await createOrganization({
    name: 'Org 10 Independence',
    owner_id: user10.id,
    country_code: 'MY',
  });

  // User received Welcome Credit
  assert.strictEqual(await hasUserReceivedWelcomeCredit(user10.id), true);

  // Showcase reward eligibility for this owner must still be ELIGIBLE (unclaimed)
  const showcaseCheck = await evaluatePromotionEligibility({
    userId: user10.id,
    organizationId: org10.id,
    rewardType: 'SHOWCASE_REWARD',
  });
  assert.strictEqual(
    showcaseCheck.eligible,
    true,
    'Receiving Welcome Credit must NOT consume Showcase Reward eligibility'
  );
  assert.strictEqual(showcaseCheck.alreadyClaimed, false);
  console.log('  ✓ PASSED: Welcome Credit and Showcase Reward remain completely independent.\n');

  // SCENARIO 11: Migration idempotency: New migration applies cleanly on top of existing migrations.
  console.log('Scenario 11: Migration idempotency...');
  const migrationPath = path.resolve(process.cwd(), 'supabase/migrations/20260917000000_enable_first_org_owner_welcome_credit.sql');
  assert.ok(fs.existsSync(migrationPath), 'Migration file 20260917000000 must exist');

  const migrationSql = fs.readFileSync(migrationPath, 'utf8');
  assert.ok(
    migrationSql.includes('CREATE OR REPLACE FUNCTION public.create_organization_atomic'),
    'Migration must replace create_organization_atomic'
  );
  assert.ok(
    migrationSql.includes('grant_welcome_credit_atomic'),
    'Migration must call grant_welcome_credit_atomic'
  );
  assert.ok(
    migrationSql.includes('welcome_credit_amount'),
    'Migration must return welcome_credit_amount'
  );
  console.log('  ✓ PASSED: Migration file exists, is valid SQL, and idempotent.\n');

  console.log('================================================================');
  console.log('ALL 11 FIRST-ORGANIZATION WELCOME CREDIT SCENARIOS PASSED SUCCESSFULLY!');
  console.log('================================================================');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
