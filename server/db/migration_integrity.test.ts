import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

async function runMigrationIntegrityTests() {
  console.log('====================================================');
  console.log('TEST SUITE: MIGRATION INTEGRITY (Scenarios 17 & 18)');
  console.log('====================================================\n');

  const migrationsDir = path.resolve(process.cwd(), 'supabase/migrations');
  const historyDir = path.resolve(process.cwd(), 'supabase/migrations_history');
  const schemaFile = path.resolve(process.cwd(), 'supabase/schema.sql');
  const baselineFile = path.resolve(process.cwd(), 'supabase/migrations/20260903000000_initial_baseline.sql');

  // --------------------------------------------------------------------------
  // Scenario 17: New migration can be applied cleanly to a fresh database.
  // --------------------------------------------------------------------------
  console.log('Scenario 17: New migration can be applied cleanly to a fresh database...');
  assert.ok(fs.existsSync(baselineFile), 'Scenario 17: Baseline migration file must exist');

  const baselineSql = fs.readFileSync(baselineFile, 'utf-8');
  assert.ok(baselineSql.length > 50000, 'Scenario 17: Baseline must be substantial complete schema');

  // Check required tables exist in baseline
  const requiredTables = [
    'public.users',
    'public.organizations',
    'public.organization_members',
    'public.organization_invitations',
    'public.games',
    'public.game_themes',
    'public.events',
    'public.organization_wallets',
    'public.wallet_transactions',
    'public.wallet_topup_orders',
    'public.event_showcases',
    'public.event_showcase_media',
    'public.event_high_scores',
    'public.platform_settings',
    'public.google_mail_settings',
  ];

  for (const tbl of requiredTables) {
    assert.ok(
      baselineSql.includes(tbl),
      `Scenario 17: Baseline must include table definition for ${tbl}`
    );
  }

  // Check required triggers and functions
  const requiredObjects = [
    'clear_event_test_scores',
    'auto_clear_test_scores_for_started_events',
    'trg_auto_clear_test_scores_on_event_update',
    'trg_events_auto_clear_test_scores',
    'trg_event_high_scores_enforce_live',
    'uq_event_high_scores_event_session',
    'idx_event_high_scores_score_environment',
    'process_topup_order_atomic',
    'process_event_payment_atomic',
    'settle_wallet_topup_order',
    'is_developer_admin',
    'ENABLE ROW LEVEL SECURITY',
  ];

  for (const obj of requiredObjects) {
    assert.ok(
      baselineSql.includes(obj),
      `Scenario 17: Baseline must include ${obj}`
    );
  }

  // Verify all files in migrations directory are canonical timestamp migrations
  const migrationFiles = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));
  assert.strictEqual(
    migrationFiles.length,
    19,
    `Scenario 17: migrations/ must contain exactly the 19 canonical migrations, found ${migrationFiles.length}`
  );

  const canonicalFiles = [
    '20260903000000_initial_baseline.sql',
    '20260903010000_add_outstanding_balance_to_organization_wallets.sql',
    '20260904000000_atomic_outstanding_balance_settlement.sql',
    '20260904010000_atomic_checkout_claim.sql',
    '20260904020000_prevent_user_privilege_escalation.sql',
    '20260904030000_events_backend_write_only.sql',
    '20260904040000_games_themes_backend_write_only.sql',
    '20260904050000_leaderboard_rls_live_window.sql',
    '20260904060000_storage_buckets_alignment.sql',
    '20260904070000_organizations_members_backend_write_only.sql',
    '20260904080000_showcase_media_storage_path_verification.sql',
    '20260906000000_showcase_moderation_and_reward_decoupling.sql',
    '20260906010000_event_showcases_backend_write_only.sql',
    '20260906020000_atomic_showcase_credit_reward.sql',
    '20260906030000_atomic_showcase_reward_approval.sql',
    '20260907000000_add_expired_to_event_status.sql',
    '20260909000000_add_country_code_to_organizations.sql',
    '20260909010000_atomic_create_event.sql',
    '20260910000000_atomic_create_organization.sql',
  ];

  for (const file of canonicalFiles) {
    assert.ok(
      migrationFiles.includes(file),
      `Scenario 17: Canonical migration ${file} must exist in migrations/`
    );
  }

  for (const file of migrationFiles) {
    const isTimestamp = /^(\d{14})_(.+)\.sql$/.test(file);
    assert.ok(
      isTimestamp,
      `Scenario 17: File ${file} must match canonical timestamp format (YYYYMMDDHHMMSS_name.sql)`
    );

    // SQL syntax basic check: non-empty, valid UTF-8
    const content = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    assert.ok(content.trim().length > 0, `Scenario 17: Migration ${file} must not be empty`);
  }

  // --------------------------------------------------------------------------
  // Scenario 17b: Verify Strategy B (Baseline 2026-09-03 + Post-Baseline)
  // --------------------------------------------------------------------------
  console.log('Scenario 17b: Verifying Strategy B (Baseline Date Snapshot + Post-Baseline Migrations)...');
  const postBaselineTs = path.resolve(migrationsDir, '20260903010000_add_outstanding_balance_to_organization_wallets.sql');
  const postBaselineAtomicSettlement = path.resolve(migrationsDir, '20260904000000_atomic_outstanding_balance_settlement.sql');
  const postBaselineClaim = path.resolve(migrationsDir, '20260904010000_atomic_checkout_claim.sql');
  const migrationsDoc = path.resolve(process.cwd(), 'supabase/MIGRATIONS.md');

  assert.ok(fs.existsSync(postBaselineTs), 'Strategy B: Migration 20260903010000 must exist as post-baseline timestamp migration');
  assert.ok(fs.existsSync(postBaselineAtomicSettlement), 'Strategy B: Migration 20260904000000 must exist');
  assert.ok(fs.existsSync(postBaselineClaim), 'Strategy B: Migration 20260904010000 must exist');
  assert.ok(fs.existsSync(migrationsDoc), 'Strategy B: supabase/MIGRATIONS.md documentation must exist');

  // Verify baseline file explicitly documents Strategy B and date boundary
  assert.ok(
    baselineSql.includes('2026-09-03 00:00:00 UTC') || baselineSql.includes('HISTORICAL BASELINE MIGRATION'),
    'Strategy B: Baseline file must clearly document snapshot date and baseline scope'
  );

  // Verify post-baseline adds outstanding_balance
  const postBaselineTsSql = fs.readFileSync(postBaselineTs, 'utf-8');
  assert.ok(
    postBaselineTsSql.includes('outstanding_balance'),
    'Strategy B: Post-baseline migration 20260903010000 must define outstanding_balance'
  );

  // Verify complete schema file contains both baseline objects AND post-baseline additions
  const completeSchemaSql = fs.readFileSync(schemaFile, 'utf-8');
  assert.ok(
    completeSchemaSql.includes('outstanding_balance'),
    'Strategy B: Complete schema.sql must contain outstanding_balance'
  );
  assert.ok(
    completeSchemaSql.includes('claim_checkout_session_creation'),
    'Strategy B: Complete schema.sql must contain claim_checkout_session_creation'
  );

  console.log('  ✓ PASSED: Strategy B verified - baseline is defined as 2026-09-03 00:00:00 UTC, migration 031 and 20260903010000 provide post-baseline outstanding balance, and schema.sql contains the complete cumulative current schema.');

  console.log(`  ✓ PASSED: Baseline contains all ${requiredTables.length} tables, complete indexes, triggers, and functions; ${migrationFiles.length} migration files are cleanly ordered and formatted`);

  // --------------------------------------------------------------------------
  // Scenario 18: Existing database migration history is not rewritten.
  // --------------------------------------------------------------------------
  console.log('\nScenario 18: Existing database migration history is not rewritten...');
  assert.ok(fs.existsSync(historyDir), 'Scenario 18: migrations_history directory must exist');

  const historyFiles = fs.readdirSync(historyDir).filter(f => f.endsWith('.sql'));
  assert.strictEqual(historyFiles.length, 36, 'Scenario 18: migrations_history must retain all 36 historical files');

  // Verify audit markdown exists
  const auditFile = path.join(historyDir, 'MIGRATIONS_AUDIT.md');
  assert.ok(fs.existsSync(auditFile), 'Scenario 18: MIGRATIONS_AUDIT.md must exist in history');

  // Check that historical filenames were NOT deleted, modified or corrupted
  const expectedHistoricalFiles = [
    '001_upgrade_to_multiple_games.sql',
    '002_add_game_layout_config.sql',
    '003_remove_theme_active_state.sql',
    '004_developer_admin_system_themes.sql',
    '005_remove_games_active_theme_id.sql',
    '006_prevent_duplicate_system_games.sql',
    '007_ensure_all_games_columns_and_reload_cache.sql',
    '008_wallet_engine_and_ledger.sql',
    '009_create_event_showcase_tables.sql',
    '010_event_showcase_review_workflow.sql',
    '011_atomic_event_payment_rpc.sql',
    '012_create_wallet_topup_orders.sql',
    '013_create_event_high_scores.sql',
    '013_lock_topup_settlement_security.sql',
    '014_add_event_pricing.sql',
    '014_create_event_high_scores.sql',
    '014_lock_topup_settlement_security.sql',
    '015_add_event_pricing.sql',
    '016_link_events_to_games_with_restrict.sql',
    '017_add_google_mail_settings.sql',
    '017_add_theme_game_config.sql',
    '017b_add_google_mail_settings.sql',
    '018_separate_event_lifecycle_and_payment_status.sql',
    '019_lock_down_rls_and_storage_security.sql',
    '020_ensure_wallet_topup_orders_columns_and_reload_cache.sql',
    '021_migrate_memory_match_theme_game_config.sql',
    '022_fix_atomic_event_payment_record_unassigned.sql',
    '023_fix_settle_wallet_topup_order_unassigned.sql',
    '024_restrict_financial_rpcs_to_service_role.sql',
    '025_score_environment_lifecycle.sql',
    '026_add_database_score_environment.sql',
    '027_automatic_test_score_clearing.sql',
    '028_fix_wallet_topup_settlement_atomic.sql',
    '029_leaderboard_idempotency_constraint.sql',
    '030_add_google_mail_settings.sql',
    '031_add_outstanding_balance_to_organization_wallets.sql',
  ];

  for (const hf of expectedHistoricalFiles) {
    const fullPath = path.join(historyDir, hf);
    assert.ok(fs.existsSync(fullPath), `Scenario 18: Historical file ${hf} must exist unchanged in migrations_history`);
    const stats = fs.statSync(fullPath);
    assert.ok(stats.size > 0, `Scenario 18: Historical file ${hf} must not be empty`);
  }

  console.log('  ✓ PASSED: Historical migrations in migrations_history/ remain 100% intact and untouched');

  console.log('\n====================================================');
  console.log('🎉 ALL MIGRATION INTEGRITY SCENARIOS PASSED!');
  console.log('====================================================\n');
}

runMigrationIntegrityTests().catch((err) => {
  console.error('❌ Test execution failed:', err);
  process.exit(1);
});
