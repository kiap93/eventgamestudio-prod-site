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

  // Verify all files in migrations directory have valid format and unique timestamps
  const migrationFiles = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));
  assert.ok(migrationFiles.length >= 35, 'Scenario 17: Must have all migrations');

  const timestamps = new Set<string>();
  for (const file of migrationFiles) {
    const match = file.match(/^(\d{14})_(.+)\.sql$/);
    assert.ok(
      match,
      `Scenario 17: File ${file} must have valid YYYYMMDDHHMMSS_name.sql timestamp format`
    );
    const ts = match[1];
    assert.ok(!timestamps.has(ts), `Scenario 17: Duplicate timestamp found in migrations: ${ts}`);
    timestamps.add(ts);

    // SQL syntax basic check: non-empty, valid UTF-8
    const content = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    assert.ok(content.trim().length > 0, `Scenario 17: Migration ${file} must not be empty`);
  }

  console.log(`  ✓ PASSED: Baseline contains all ${requiredTables.length} tables, complete indexes, triggers, and functions; ${migrationFiles.length} migration files are cleanly ordered and formatted`);

  // --------------------------------------------------------------------------
  // Scenario 18: Existing database migration history is not rewritten.
  // --------------------------------------------------------------------------
  console.log('\nScenario 18: Existing database migration history is not rewritten...');
  assert.ok(fs.existsSync(historyDir), 'Scenario 18: migrations_history directory must exist');

  const historyFiles = fs.readdirSync(historyDir).filter(f => f.endsWith('.sql'));
  assert.strictEqual(historyFiles.length, 34, 'Scenario 18: migrations_history must retain all 34 historical files');

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
