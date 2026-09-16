import assert from 'node:assert';
import crypto from 'node:crypto';
import { createUser } from './users.js';
import { createOrganization, getOrganizationById } from './organizations.js';
import { getWalletBalance, getWalletTransactions } from './wallet.js';
import {
  createShowcase,
  getShowcaseByEventId,
  updateShowcase,
  publishShowcase,
  unpublishShowcase,
} from './showcases.js';
import { localEventsCache } from './events.js';

async function runOrgCreationZeroRewardsTest() {
  console.log('================================================================');
  console.log('ORGANIZATION CREATION ZERO REWARDS & SHOWCASE PRESERVATION TEST');
  console.log('================================================================\n');

  // Step 1: Create a test user
  const userId = crypto.randomUUID();
  const testUser = await createUser({
    id: userId,
    email: `sameuser-${userId.slice(0, 8)}@example.com`,
    name: 'Multi Org User',
  });
  console.log(`Created test user: ${testUser.id} (${testUser.email})`);

  // Step 2: Same user creates Org 1
  console.log('\n--- Test 1: Same user creates Organization 1 ---');
  const org1 = await createOrganization({
    name: 'Alpha Enterprise 1',
    owner_id: testUser.id,
    country_code: 'MY',
  });
  assert.ok(org1?.id, 'Org 1 must be created successfully');
  assert.strictEqual(org1.owner_id, testUser.id);

  const wallet1 = await getWalletBalance(org1.id);
  assert.strictEqual(
    Number(wallet1.paid_balance),
    0,
    `Org 1 paid_balance must be 0, got ${wallet1.paid_balance}`
  );
  assert.strictEqual(
    Number(wallet1.welcome_credit),
    0,
    `Org 1 welcome_credit must be 0, got ${wallet1.welcome_credit}`
  );
  assert.strictEqual(
    Number(wallet1.topup_credit),
    0,
    `Org 1 topup_credit must be 0, got ${wallet1.topup_credit}`
  );
  assert.strictEqual(
    Number(wallet1.total_balance),
    0,
    `Org 1 total_balance must be 0, got ${wallet1.total_balance}`
  );
  assert.strictEqual(
    wallet1.welcome_credit_granted,
    false,
    'Org 1 welcome_credit_granted must be false'
  );

  const txnsRes1 = await getWalletTransactions(org1.id);
  const txns1 = txnsRes1.transactions;
  assert.strictEqual(
    txns1.length,
    0,
    `Org 1 must have 0 wallet transactions, but found ${txns1.length}`
  );
  assert.strictEqual(txnsRes1.total, 0);
  console.log('  ✓ PASSED: Org 1 created with RM0 balances and ZERO transactions.');

  // Step 3: Same user creates Org 2
  console.log('\n--- Test 2: Same user creates Organization 2 ---');
  const org2 = await createOrganization({
    name: 'Alpha Enterprise 2',
    owner_id: testUser.id,
    country_code: 'SG',
  });
  assert.ok(org2?.id, 'Org 2 must be created successfully');
  assert.strictEqual(org2.owner_id, testUser.id);

  const wallet2 = await getWalletBalance(org2.id);
  assert.strictEqual(
    Number(wallet2.paid_balance),
    0,
    `Org 2 paid_balance must be 0, got ${wallet2.paid_balance}`
  );
  assert.strictEqual(
    Number(wallet2.welcome_credit),
    0,
    `Org 2 welcome_credit must be 0, got ${wallet2.welcome_credit}`
  );
  assert.strictEqual(
    Number(wallet2.topup_credit),
    0,
    `Org 2 topup_credit must be 0, got ${wallet2.topup_credit}`
  );
  assert.strictEqual(
    Number(wallet2.total_balance),
    0,
    `Org 2 total_balance must be 0, got ${wallet2.total_balance}`
  );
  assert.strictEqual(
    wallet2.welcome_credit_granted,
    false,
    'Org 2 welcome_credit_granted must be false'
  );

  const txnsRes2 = await getWalletTransactions(org2.id);
  const txns2 = txnsRes2.transactions;
  assert.strictEqual(
    txns2.length,
    0,
    `Org 2 must have 0 wallet transactions, but found ${txns2.length}`
  );
  assert.strictEqual(txnsRes2.total, 0);
  console.log('  ✓ PASSED: Org 2 created with RM0 balances and ZERO transactions.');

  // Step 4: Same user creates Org 3
  console.log('\n--- Test 3: Same user creates Organization 3 ---');
  const org3 = await createOrganization({
    name: 'Alpha Enterprise 3',
    owner_id: testUser.id,
    country_code: 'MY',
  });
  assert.ok(org3?.id, 'Org 3 must be created successfully');
  assert.strictEqual(org3.owner_id, testUser.id);

  const wallet3 = await getWalletBalance(org3.id);
  assert.strictEqual(
    Number(wallet3.paid_balance),
    0,
    `Org 3 paid_balance must be 0, got ${wallet3.paid_balance}`
  );
  assert.strictEqual(
    Number(wallet3.welcome_credit),
    0,
    `Org 3 welcome_credit must be 0, got ${wallet3.welcome_credit}`
  );
  assert.strictEqual(
    Number(wallet3.topup_credit),
    0,
    `Org 3 topup_credit must be 0, got ${wallet3.topup_credit}`
  );
  assert.strictEqual(
    Number(wallet3.total_balance),
    0,
    `Org 3 total_balance must be 0, got ${wallet3.total_balance}`
  );
  assert.strictEqual(
    wallet3.welcome_credit_granted,
    false,
    'Org 3 welcome_credit_granted must be false'
  );

  const txnsRes3 = await getWalletTransactions(org3.id);
  const txns3 = txnsRes3.transactions;
  assert.strictEqual(
    txns3.length,
    0,
    `Org 3 must have 0 wallet transactions, but found ${txns3.length}`
  );
  assert.strictEqual(txnsRes3.total, 0);
  console.log('  ✓ PASSED: Org 3 created with RM0 balances and ZERO transactions.');

  // Step 5: Verify no RM800 or RM300 transactions across any of the organizations
  console.log('\n--- Test 4: Verify no automatic 800 or 300 transactions created ---');
  const allTxns = [...txns1, ...txns2, ...txns3];
  const rewardTxns = allTxns.filter(
    (t: any) =>
      Number(t.amount) === 800 ||
      Number(t.amount) === 300 ||
      t.type === 'WELCOME_CREDIT' ||
      t.type === 'SHOWCASE_REWARD'
  );
  assert.strictEqual(
    rewardTxns.length,
    0,
    `Expected 0 promotional/reward transactions, found ${rewardTxns.length}`
  );
  console.log('  ✓ PASSED: No automatic 800 or 300 credit ledger transactions were created.');

  // Step 6: Verify Event Showcase functionality continues working normally
  console.log('\n--- Test 5: Verify Event Showcase continues working normally ---');
  const eventId = crypto.randomUUID();
  const startDate = '2026-09-01';
  const endDate = '2026-09-02';
  const now = new Date().toISOString();

  localEventsCache.set(eventId, {
    id: eventId,
    organization_id: org1.id,
    game_id: null,
    game_theme_id: '1a480be3-5313-49ba-a9c2-f5b2293576cf',
    name: 'Tech Carnival 2026',
    event_date: startDate,
    start_date: startDate,
    end_date: endDate,
    starts_at: `${startDate}T00:00:00.000Z`,
    expires_at: `${endDate}T23:59:59.000Z`,
    status: 'COMPLETED' as any,
    event_status: 'COMPLETED' as any,
    payment_status: 'PAID' as any,
    public_token: crypto.randomBytes(4).toString('hex').toUpperCase(),
    created_by: testUser.id,
    created_at: now,
    updated_at: now,
  });

  // Create showcase
  const showcase = await createShowcase({
    event_id: eventId,
    organization_id: org1.id,
    title: 'Carnival Activation Highlight',
    description: 'A great brand activation event with thousands of attendees playing the game.',
    client_name: 'Tech Brand Inc',
  });
  assert.ok(showcase?.id, 'Showcase must be created successfully');
  assert.strictEqual(showcase.status, 'PUBLISHED', 'Default status is PUBLISHED under publish-first model');
  console.log('  ✓ Showcase created successfully in PUBLISHED status');

  // Update showcase
  const updatedShowcase = await updateShowcase(eventId, {
    title: 'Carnival Activation Highlight (Updated)',
  });
  assert.strictEqual(updatedShowcase.title, 'Carnival Activation Highlight (Updated)');
  console.log('  ✓ Showcase updated successfully');

  // Unpublish showcase
  const unpublished = await unpublishShowcase(eventId);
  assert.strictEqual(unpublished.status, 'UNPUBLISHED');
  console.log('  ✓ Showcase unpublished successfully');

  // Publish showcase
  const published = await publishShowcase(eventId);
  assert.strictEqual(published.status, 'PUBLISHED');
  assert.ok(published.published_at, 'published_at must be populated');
  console.log('  ✓ Showcase published successfully');

  // Retrieve showcase
  const fetched = await getShowcaseByEventId(eventId);
  assert.strictEqual(fetched?.id, showcase.id);
  console.log('  ✓ Showcase retrieved by event ID successfully');

  console.log('\n================================================================');
  console.log('🎉 ALL ZERO REWARDS & SHOWCASE PRESERVATION TESTS PASSED!');
  console.log('================================================================\n');
}

runOrgCreationZeroRewardsTest().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
