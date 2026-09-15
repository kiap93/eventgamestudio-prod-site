import assert from 'node:assert';
import crypto from 'node:crypto';
import { createOrganization, getOrganizationById } from './organizations.js';
import { addMember, getOrgMembers } from './members.js';
import { getWalletBalance } from './wallet.js';
import { ensureDefaultGame } from './games.js';

async function runAtomicOrgCreationTests() {
  console.log('======================================================');
  console.log('Running Atomic Organization Creation & Member Tests');
  console.log('======================================================\n');

  // --- Test 1: Single Owner Membership Created via createOrganization ---
  console.log('Test 1: createOrganization adds the owner membership exactly once');
  const ownerId = crypto.randomUUID();
  const orgName = `TechCorp ${Date.now()}`;

  const org = await createOrganization({
    name: orgName,
    owner_id: ownerId,
    country_code: 'SG',
  });

  assert.ok(org.id, 'Organization must have an ID');
  assert.strictEqual(org.owner_id, ownerId, 'Organization owner_id must match');
  assert.strictEqual(org.country_code, 'SG', 'Organization country_code must match');

  // Verify membership count for this organization
  const members = await getOrgMembers(org.id);
  assert.strictEqual(
    members.length,
    1,
    `New organization must have exactly 1 member, but found ${members.length}`
  );
  assert.strictEqual(members[0].user_id, ownerId, 'Member user_id must be the owner');
  assert.strictEqual(members[0].role, 'owner', 'Member role must be owner');
  console.log('  ✓ PASSED: Organization created with exactly 1 owner membership.');

  // --- Test 2: Wallet Initialized with RM0 Balances (Automatic Welcome Credit Discontinued) ---
  console.log('\nTest 2: Organization wallet is initialized with RM0.00 balances and welcome_credit_granted = false');
  const wallet = await getWalletBalance(org.id);
  assert.ok(wallet, 'Wallet must be initialized for the new organization');
  assert.strictEqual(
    Number(wallet.welcome_credit),
    0,
    `Welcome credit must be 0, got ${wallet.welcome_credit}`
  );
  assert.strictEqual(
    Number(wallet.paid_balance),
    0,
    `Paid balance must be 0, got ${wallet.paid_balance}`
  );
  assert.strictEqual(wallet.welcome_credit_granted, false, 'welcome_credit_granted must be false');
  console.log('  ✓ PASSED: Wallet correctly initialized with RM0 balances and no automatic welcome credit.');

  // --- Test 3: Idempotency of addMember ---
  console.log('\nTest 3: Calling addMember a second time does not duplicate or throw');
  const secondMemberAttempt = await addMember({
    organization_id: org.id,
    user_id: ownerId,
    role: 'owner',
  });

  assert.ok(secondMemberAttempt, 'Second addMember attempt should return a valid record');
  assert.strictEqual(secondMemberAttempt.user_id, ownerId);

  const membersAfterSecondAttempt = await getOrgMembers(org.id);
  assert.strictEqual(
    membersAfterSecondAttempt.length,
    1,
    `Organization member count must remain 1 after second addMember, found ${membersAfterSecondAttempt.length}`
  );
  console.log('  ✓ PASSED: Duplicate member addition is safely idempotent.');

  // --- Test 4: Default Game Creation ---
  console.log('\nTest 4: Default game creation works cleanly after organization creation');
  const game = await ensureDefaultGame(org.id, org.name);
  assert.ok(game, 'Default game should be returned');
  assert.ok(game.id, 'Default game must have an ID');
  assert.ok(game.name, 'Default game must have a name');
  console.log('  ✓ PASSED: Default game retrieved/created without duplicate member interference.');

  console.log('\n======================================================');
  console.log('🎉 ALL ATOMIC ORG CREATION TESTS PASSED!');
  console.log('======================================================\n');
}

runAtomicOrgCreationTests().catch((err) => {
  console.error('❌ Test execution failed:', err);
  process.exit(1);
});
