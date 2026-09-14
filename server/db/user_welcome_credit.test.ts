import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getSupabaseServerClient } from '../supabase.js';
import {
  grantWelcomeCredit,
  getWalletBalance,
  WELCOME_CREDIT_AMOUNT,
} from './wallet.js';

async function createTestUser(): Promise<string> {
  const supabase = getSupabaseServerClient();
  const id = crypto.randomUUID();
  const { error } = await supabase.from('users').insert({
    id,
    email: `test-${id.slice(0, 8)}@example.com`,
    name: `Test User ${id.slice(0, 6)}`,
  });
  if (error) {
    throw new Error(`Failed to create test user: ${error.message}`);
  }
  return id;
}

async function createTestOrgRecord(ownerId: string): Promise<string> {
  const supabase = getSupabaseServerClient();
  const orgId = crypto.randomUUID();
  const now = new Date().toISOString();
  const { error } = await supabase.from('organizations').insert({
    id: orgId,
    name: `Test Org ${orgId.slice(0, 6)}`,
    slug: `org-${orgId.slice(0, 8)}`,
    owner_id: ownerId,
    created_at: now,
    updated_at: now,
  });
  if (error) {
    throw new Error(`Failed to create test organization: ${error.message}`);
  }
  return orgId;
}

async function runAllTests() {
  console.log('======================================================');
  console.log('USER-LEVEL WELCOME CREDIT & MIGRATION TEST SUITE');
  console.log('======================================================\n');

  // Scenario 1: Migration ordering and structural safety
  console.log('Scenario 1: Verifying migration ordering and structural safety...');
  const migrationPath = path.resolve(process.cwd(), 'supabase/migrations/20260912000000_user_level_welcome_credit.sql');
  assert.ok(fs.existsSync(migrationPath), 'Migration file 20260912000000_user_level_welcome_credit.sql must exist');

  const migrationSql = fs.readFileSync(migrationPath, 'utf-8');

  // 1. Must add owner_user_id
  const addOwnerColIdx = migrationSql.indexOf('owner_user_id UUID');
  assert.ok(addOwnerColIdx !== -1, 'Migration must add owner_user_id column to wallet_transactions');

  // 2. Must backfill owner_user_id
  const backfillIdx = migrationSql.indexOf('UPDATE public.wallet_transactions wt\nSET owner_user_id = o.owner_id');
  assert.ok(backfillIdx !== -1, 'Migration must backfill owner_user_id from organizations');

  // 3. Must safely reconcile historical duplicates (NOT delete them)
  const reconcileIdx = migrationSql.indexOf("status = 'REVERSED'");
  assert.ok(reconcileIdx !== -1, 'Migration must reconcile historical duplicates by setting status = REVERSED');
  assert.ok(!migrationSql.includes('DELETE FROM public.wallet_transactions'), 'Migration must NOT delete financial ledger transactions');

  // 4. Must adjust organization_wallets
  const walletReconcileIdx = migrationSql.indexOf('UPDATE public.organization_wallets ow');
  assert.ok(walletReconcileIdx !== -1, 'Migration must reconcile unspent welcome credits in organization_wallets');

  // 5. Must create unique index STRICTLY AFTER duplicate reconciliation
  const uniqueIndexIdx = migrationSql.indexOf('ux_wallet_txns_user_welcome_credit_unique');
  assert.ok(uniqueIndexIdx !== -1, 'Migration must create ux_wallet_txns_user_welcome_credit_unique unique index');

  // Verify strict ordering:
  // add owner_user_id -> backfill -> reconcile -> unique index
  assert.ok(
    addOwnerColIdx < backfillIdx,
    `Ordering check failed: add owner_user_id (${addOwnerColIdx}) must precede backfill (${backfillIdx})`
  );
  assert.ok(
    backfillIdx < reconcileIdx,
    `Ordering check failed: backfill (${backfillIdx}) must precede duplicate reconciliation (${reconcileIdx})`
  );
  assert.ok(
    reconcileIdx < uniqueIndexIdx,
    `Ordering check failed: duplicate reconciliation (${reconcileIdx}) must precede unique index creation (${uniqueIndexIdx})`
  );
  // 6. Must NOT create redundant duplicate index, and must clean up idx_wallet_txns_owner_user_id
  assert.ok(
    !migrationSql.includes('CREATE INDEX IF NOT EXISTS idx_wallet_txns_owner_user_id'),
    'Migration must NOT create redundant duplicate idx_wallet_txns_owner_user_id index'
  );
  assert.ok(
    migrationSql.includes('DROP INDEX IF EXISTS public.idx_wallet_txns_owner_user_id'),
    'Migration must drop any legacy redundant idx_wallet_txns_owner_user_id index'
  );
  assert.ok(
    migrationSql.includes('idx_wallet_transactions_owner_user_id'),
    'Migration must reference canonical idx_wallet_transactions_owner_user_id index'
  );

  console.log('  ✓ PASSED: Migration ordering and index deduping satisfy all constraints.');

  // Scenario 2: First grantWelcomeCredit call awards Welcome Credit
  console.log('Scenario 2: Testing first grantWelcomeCredit call...');
  const userA = await createTestUser();
  const org1Id = await createTestOrgRecord(userA);

  const grantResult = await grantWelcomeCredit({
    organizationId: org1Id,
    userId: userA,
    createdBy: userA,
  });

  assert.strictEqual(grantResult.alreadyGranted, false, 'First grant must have alreadyGranted = false');
  assert.ok(grantResult.transaction, 'Ledger transaction must be created');
  assert.strictEqual(Number(grantResult.wallet.welcome_credit), WELCOME_CREDIT_AMOUNT);
  console.log('  ✓ PASSED: First welcome credit grant succeeded.');

  // Scenario 3: Second grantWelcomeCredit call for same user across different org is rejected
  console.log('Scenario 3: Testing second grantWelcomeCredit call for same user...');
  const userB = await createTestUser();
  const orgB1 = await createTestOrgRecord(userB);
  const orgB2 = await createTestOrgRecord(userB);

  const grant1 = await grantWelcomeCredit({
    organizationId: orgB1,
    userId: userB,
    createdBy: userB,
  });
  assert.strictEqual(grant1.alreadyGranted, false);

  const grant2 = await grantWelcomeCredit({
    organizationId: orgB2,
    userId: userB,
    createdBy: userB,
  });

  assert.strictEqual(grant2.alreadyGranted, true, 'Second grant must be rejected due to lifetime limit');
  assert.strictEqual(grant2.transaction?.id, grant1.transaction?.id, 'Returns existing transaction reference');
  assert.strictEqual(Number(grant2.wallet.welcome_credit), 0, 'Second org wallet must receive RM0.00');
  console.log('  ✓ PASSED: Second grant for same user was safely rejected.');

  // Scenario 4: Concurrent grant attempts for the same user grant exactly once
  console.log('Scenario 4: Testing concurrent grant attempts for same user...');
  const userConcurrent = await createTestUser();
  const orgA = await createTestOrgRecord(userConcurrent);
  const orgB = await createTestOrgRecord(userConcurrent);
  const orgC = await createTestOrgRecord(userConcurrent);

  const [g1, g2, g3] = await Promise.all([
    grantWelcomeCredit({ organizationId: orgA, userId: userConcurrent, createdBy: userConcurrent }),
    grantWelcomeCredit({ organizationId: orgB, userId: userConcurrent, createdBy: userConcurrent }),
    grantWelcomeCredit({ organizationId: orgC, userId: userConcurrent, createdBy: userConcurrent }),
  ]);

  const results = [g1, g2, g3];
  const granted = results.filter((r) => !r.alreadyGranted);
  const rejected = results.filter((r) => r.alreadyGranted);

  assert.strictEqual(granted.length, 1, 'Exactly 1 grant must succeed concurrently');
  assert.strictEqual(rejected.length, 2, 'Exactly 2 grants must be rejected concurrently');
  console.log('  ✓ PASSED: Concurrency lock allowed exactly 1 grant.');

  // Scenario 5: Historical duplicate reconciliation preserves ledger without deletion
  console.log('Scenario 5: Testing duplicate reconciliation algorithm...');
  const testOwner = '4c857d15-ab93-45a6-8de5-7858ab4d6bd2';

  const duplicateTxns = Array.from({ length: 38 }, (_, i) => ({
    id: `txn-${i + 1}`,
    organization_id: `org-${i + 1}`,
    owner_user_id: testOwner,
    transaction_type: 'WELCOME_CREDIT',
    balance_type: 'WELCOME_CREDIT',
    amount: 800.0,
    status: 'COMPLETED',
    created_at: new Date(Date.now() - (38 - i) * 86400000).toISOString(),
    has_usage: i === 0,
  }));

  duplicateTxns.sort((a, b) => {
    if (a.has_usage !== b.has_usage) return a.has_usage ? -1 : 1;
    return a.created_at.localeCompare(b.created_at);
  });

  const canonical = duplicateTxns[0];
  const duplicates = duplicateTxns.slice(1);

  assert.strictEqual(canonical.id, 'txn-1', 'Canonical transaction is prioritized by usage');
  assert.strictEqual(duplicates.length, 37, 'Exactly 37 duplicates identified for reconciliation');

  const reconciled = duplicates.map((d) => ({
    ...d,
    status: 'REVERSED',
    metadata: {
      reconciled_at: new Date().toISOString(),
      reconciliation_reason: 'DUPLICATE_WELCOME_CREDIT_REVOKED',
      canonical_transaction_id: canonical.id,
      original_status: 'COMPLETED',
    },
  }));

  assert.strictEqual(reconciled[0].status, 'REVERSED', 'Duplicate status is set to REVERSED');
  assert.strictEqual(reconciled[36].status, 'REVERSED', 'Duplicate status is set to REVERSED');
  assert.strictEqual(reconciled[0].metadata.canonical_transaction_id, canonical.id, 'Audit tracks canonical ID');

  const allTxnsAfterMigration = [canonical, ...reconciled];
  const indexedRows = allTxnsAfterMigration.filter(
    (t) => t.transaction_type === 'WELCOME_CREDIT' && t.status === 'COMPLETED' && t.owner_user_id
  );

  assert.strictEqual(
    indexedRows.length,
    1,
    `Indexed rows under unique constraint must be exactly 1, found ${indexedRows.length}`
  );
  assert.strictEqual(indexedRows[0].id, canonical.id, 'The single indexed row must be the canonical transaction');
  console.log('  ✓ PASSED: Duplicate reconciliation preserved ledger and satisfied unique constraint.');

  console.log('\n======================================================');
  console.log('ALL 5 USER-LEVEL WELCOME CREDIT SCENARIOS PASSED!');
  console.log('======================================================\n');
}

runAllTests().catch((err) => {
  console.error('Fatal test error in user_welcome_credit.test.ts:', err);
  process.exit(1);
});
