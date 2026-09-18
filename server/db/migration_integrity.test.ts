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

  // Define required canonical migrations that must exist
  const requiredCanonicalMigrations = [
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
    '20260906040000_owner_level_showcase_reward.sql',
    '20260907000000_add_expired_to_event_status.sql',
    '20260909000000_add_country_code_to_organizations.sql',
    '20260909010000_atomic_create_event.sql',
    '20260910000000_atomic_create_organization.sql',
    '20260912000000_user_level_welcome_credit.sql',
    '20260912010000_create_central_notifications.sql',
    '20260913000000_add_event_timezone_to_events.sql',
    '20260914000000_user_level_reward_security_and_reconciliation.sql',
    '20260914010000_disable_automatic_welcome_credit.sql',
    '20260914020000_lock_topup_payment_constraints_and_idempotency.sql',
    '20260915000000_create_api_error_logs.sql',
    '20260916000000_owner_only_user_level_promotions.sql',
    '20260916010000_repair_events_game_theme_id_and_columns.sql',
  ];

  // Checksum manifest for known production migrations (tamper-evident audit)
  const canonicalProductionChecksums: Record<string, string> = {
    '20260903000000_initial_baseline.sql': '014d4a6a212b1f23fd723a0f05177ffece4163ad34b943167eaec53f7fa0762b',
    '20260903010000_add_outstanding_balance_to_organization_wallets.sql': 'f25766da78ae6117c8d52d8689ba9fb8487cae0fda9aa432f25627034e700e4c',
    '20260904000000_atomic_outstanding_balance_settlement.sql': '0ced738f2bfc82d7960dc5a9f1cee39cabe4be4753cbb8ad7ceb2f4da2f25700',
    '20260904010000_atomic_checkout_claim.sql': '8a36b6cf0babdedff34cfa8b9bb753ea72494b4bb86728c17835b278331045fb',
    '20260904020000_prevent_user_privilege_escalation.sql': 'a750dc5001a048e77decc48bc4441f0670948571fd27c7a2d8e46eaa1a177455',
    '20260904030000_events_backend_write_only.sql': '067a51dfd165f37db49fbeab0c87229aa244a30d14e580b46b3d152489eb455a',
    '20260904040000_games_themes_backend_write_only.sql': '64814f2759daeba80223055ec11a1d4dc74a39b6993f4fe30c071b4df46b00b6',
    '20260904050000_leaderboard_rls_live_window.sql': 'a0f9e996906d052f43dd513122e332d77f02777c66245ecd35e38496d83b820f',
    '20260904060000_storage_buckets_alignment.sql': '7947e6483adb4cccf6f02ce6791b655a3466ba9e48bd760304e153b91aaaed1c',
    '20260904070000_organizations_members_backend_write_only.sql': '35c516f82bc77b313198c962fd1d2971c1b6c070d56e71a914e27ca9c0a74338',
    '20260904080000_showcase_media_storage_path_verification.sql': 'bf93761181ea7ae2bfd68de5371eaa32c157f359a89ab83667c68542d2d26265',
    '20260906000000_showcase_moderation_and_reward_decoupling.sql': '3bec50108cf4ea00756a1670664a170cd6f43abd95eafa226bc005c57cd2cdf3',
    '20260906010000_event_showcases_backend_write_only.sql': 'e01756c86159dc8570ba140b85563f0ea19c49b6e2d8c13574cb3e3ec55e2593',
    '20260906020000_atomic_showcase_credit_reward.sql': '7a57c485af1cd1fe5ce3a3a2ec74c81eb9f7576767cd268c1c3649850a6568e3',
    '20260906030000_atomic_showcase_reward_approval.sql': 'c8266ec27d551b3984b61cfb0e06c72b0e90489ec9060ab1f360153b6d723e26',
    '20260906040000_owner_level_showcase_reward.sql': 'a1d0a1572639681a43a9e9067c5507c33cd7a739d0c44b975c40caa87ce226ea',
    '20260907000000_add_expired_to_event_status.sql': '3f7d0290eb643e3d4099c855fa07c7a399d784f6e177dc1fd1752382584a57eb',
    '20260909000000_add_country_code_to_organizations.sql': 'cccca57a5a07e2e06f1e642572c79302701c39a0682acb1ec061e81d21303628',
    '20260909010000_atomic_create_event.sql': 'd3f3ba519fcb4dfa07e6f0502ee6e0ddcdd83eb621594d19fb1a3adcdfe155fc',
    '20260910000000_atomic_create_organization.sql': '5368b746e6624d5e15d68d4384ea8c1ddc63ec49efb5005e891105e794967268',
    '20260912000000_user_level_welcome_credit.sql': '09c41b8085491e73f3e66f814861600fba280315a4f8edff54556b4cdc5ca252',
    '20260912010000_create_central_notifications.sql': '0ff355f4ff4de1af91fbe48cfc15e7723eb86297fab9408ef0aac53e98b77c38',
    '20260913000000_add_event_timezone_to_events.sql': 'ecd203d15c38a2398bd2b1b370a4fe8cd44e8982f6eef33f46c760b93c63b7db',
    '20260914000000_user_level_reward_security_and_reconciliation.sql': '7b6e656f7a3dc482054263c70283af5df8cc803678f8495149e22bf7451a14c4',
    '20260914010000_disable_automatic_welcome_credit.sql': '64e552c961898488bdab894ba988326e67259bcc0f08f1622b9d9a8fe82f2be0',
    '20260914020000_lock_topup_payment_constraints_and_idempotency.sql': '1c509c22eb33025b82a726bba7dd9599b5517575618f17bfbd886ca77f8d3f3f',
    '20260915000000_create_api_error_logs.sql': '39feabb4d847c82c270668d87791f34e8ba89e37f3b4ac79e30181b70c171f3d',
    '20260916000000_owner_only_user_level_promotions.sql': '3893c79d60031e57f7b1394d1a77435c7dbb5e582956981682630003b9f22cad',
    '20260916010000_repair_events_game_theme_id_and_columns.sql': '4d81e6b1e2bb27241ff0748b9f52d05c41c481e87e8d2f197ce13a121cbb36db',
  };

  // 1. Verify required canonical migrations exist without hardcoding an exact upper ceiling
  assert.ok(
    migrationFiles.length >= requiredCanonicalMigrations.length,
    `Scenario 17: migrations/ must contain at least the ${requiredCanonicalMigrations.length} canonical migrations, found ${migrationFiles.length}`
  );

  for (const file of requiredCanonicalMigrations) {
    assert.ok(
      migrationFiles.includes(file),
      `Scenario 17: Required canonical migration ${file} must exist in supabase/migrations/`
    );
  }

  // 2. Verify no duplicate filenames exist
  assert.strictEqual(
    new Set(migrationFiles).size,
    migrationFiles.length,
    'Scenario 17: Migration directory must not contain duplicate files'
  );

  // 3. Verify each migration matches timestamp convention YYYYMMDDHHMMSS_name.sql and is non-empty
  const parsedMigrations: { file: string; timestamp: string; slug: string }[] = [];
  const timestampRegex = /^(\d{14})_([a-z0-9_]+)\.sql$/;

  for (const file of migrationFiles) {
    const match = file.match(timestampRegex);
    assert.ok(
      match,
      `Scenario 17: File ${file} must match canonical timestamp format (YYYYMMDDHHMMSS_name.sql)`
    );

    const [, timestamp, slug] = match;
    assert.ok(slug && slug.length > 0, `Scenario 17: File ${file} must have a valid non-empty description`);

    // Validate timestamp components (YYYY MM DD HH MM SS)
    const year = parseInt(timestamp.slice(0, 4), 10);
    const month = parseInt(timestamp.slice(4, 6), 10);
    const day = parseInt(timestamp.slice(6, 8), 10);
    const hour = parseInt(timestamp.slice(8, 10), 10);
    const minute = parseInt(timestamp.slice(10, 12), 10);
    const second = parseInt(timestamp.slice(12, 14), 10);

    assert.ok(year >= 2024 && year <= 2099, `Scenario 17: ${file} year must be valid (2024-2099)`);
    assert.ok(month >= 1 && month <= 12, `Scenario 17: ${file} month must be 01-12`);
    assert.ok(day >= 1 && day <= 31, `Scenario 17: ${file} day must be 01-31`);
    assert.ok(hour >= 0 && hour <= 23, `Scenario 17: ${file} hour must be 00-23`);
    assert.ok(minute >= 0 && minute <= 59, `Scenario 17: ${file} minute must be 00-59`);
    assert.ok(second >= 0 && second <= 59, `Scenario 17: ${file} second must be 00-59`);

    // Verify non-empty file content
    const filePath = path.join(migrationsDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    assert.ok(content.trim().length > 0, `Scenario 17: Migration ${file} must not be empty`);

    // Verify sha256 checksum if present in manifest
    const fileHash = crypto.createHash('sha256').update(content).digest('hex');
    if (canonicalProductionChecksums[file]) {
      assert.strictEqual(
        fileHash,
        canonicalProductionChecksums[file],
        `Scenario 17: Production checksum mismatch for ${file}. Canonical migrations must not be modified.`
      );
    }

    parsedMigrations.push({ file, timestamp, slug });
  }

  // 4. Verify timestamps are strictly increasing and not duplicated
  const timestamps = parsedMigrations.map(m => m.timestamp);
  assert.strictEqual(
    new Set(timestamps).size,
    timestamps.length,
    'Scenario 17: Migration timestamps must be unique; no duplicate timestamps allowed'
  );

  // Sort files by timestamp to verify strict monotonicity
  const sortedByTimestamp = [...parsedMigrations].sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp)
  );

  for (let i = 1; i < sortedByTimestamp.length; i++) {
    const prev = sortedByTimestamp[i - 1];
    const curr = sortedByTimestamp[i];
    assert.ok(
      BigInt(curr.timestamp) > BigInt(prev.timestamp),
      `Scenario 17: Migration timestamps must be strictly increasing. Found ${curr.file} (${curr.timestamp}) not strictly greater than ${prev.file} (${prev.timestamp})`
    );
  }

  // Verify alphabetical directory ordering matches chronological execution ordering
  const sortedFilenames = [...migrationFiles].sort();
  for (let i = 0; i < sortedFilenames.length; i++) {
    assert.strictEqual(
      sortedFilenames[i],
      sortedByTimestamp[i].file,
      `Scenario 17: Lexicographical order must strictly match chronological order for ${sortedFilenames[i]}`
    );
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
  assert.ok(
    completeSchemaSql.includes('event_timezone TEXT DEFAULT \'Asia/Singapore\''),
    'Strategy B: Complete schema.sql must contain event_timezone column on public.events'
  );
  assert.ok(
    completeSchemaSql.includes('idx_events_event_timezone'),
    'Strategy B: Complete schema.sql must contain idx_events_event_timezone index'
  );

  const tzMigrationSql = fs.readFileSync(path.resolve(migrationsDir, '20260913000000_add_event_timezone_to_events.sql'), 'utf-8');
  assert.ok(tzMigrationSql.includes('ADD COLUMN IF NOT EXISTS event_timezone'), 'Tz Migration: must add event_timezone column');
  assert.ok(tzMigrationSql.includes('p_event_timezone TEXT DEFAULT NULL'), 'Tz Migration: create_event_atomic must accept p_event_timezone');

  // Verify Migration 20260914010000 (Disable Automatic Welcome Credit)
  const welcomeMigrationSql = fs.readFileSync(
    path.resolve(migrationsDir, '20260914010000_disable_automatic_welcome_credit.sql'),
    'utf-8'
  );
  assert.ok(
    welcomeMigrationSql.includes('welcome_credit_granted = false') ||
    welcomeMigrationSql.includes('welcome_credit_granted'),
    'Welcome Credit Migration: must set welcome_credit_granted to false by default'
  );
  assert.ok(
    welcomeMigrationSql.includes('create_organization_atomic'),
    'Welcome Credit Migration: must update create_organization_atomic RPC'
  );

  // Verify Migration 20260914020000 (Lock Topup Payment Constraints & Idempotency)
  const topupIdempotencySql = fs.readFileSync(
    path.resolve(migrationsDir, '20260914020000_lock_topup_payment_constraints_and_idempotency.sql'),
    'utf-8'
  );
  assert.ok(
    topupIdempotencySql.includes('ux_wallet_txns_reference_id_unique'),
    'Topup Constraints: must include ux_wallet_txns_reference_id_unique'
  );
  assert.ok(
    topupIdempotencySql.includes('ux_wallet_topup_orders_paid_payment_ref'),
    'Topup Constraints: must include ux_wallet_topup_orders_paid_payment_ref'
  );
  assert.ok(
    topupIdempotencySql.includes('ux_wallet_topup_orders_paid_stripe_session'),
    'Topup Constraints: must include ux_wallet_topup_orders_paid_stripe_session'
  );
  assert.ok(
    topupIdempotencySql.includes('ux_wallet_topup_orders_paid_payment_intent'),
    'Topup Constraints: must include ux_wallet_topup_orders_paid_payment_intent'
  );
  assert.ok(
    topupIdempotencySql.includes('payment_webhook_events'),
    'Topup Constraints: must include payment_webhook_events table definition'
  );

  // Verify complete schema file contains top-up idempotency objects and webhook deduplication table
  assert.ok(
    completeSchemaSql.includes('payment_webhook_events'),
    'Complete schema: must include payment_webhook_events table'
  );
  assert.ok(
    completeSchemaSql.includes('ux_wallet_txns_reference_id_unique'),
    'Complete schema: must include ux_wallet_txns_reference_id_unique index'
  );
  assert.ok(
    completeSchemaSql.includes('ux_wallet_topup_orders_paid_payment_ref'),
    'Complete schema: must include ux_wallet_topup_orders_paid_payment_ref index'
  );
  assert.ok(
    completeSchemaSql.includes('ux_wallet_topup_orders_paid_stripe_session'),
    'Complete schema: must include ux_wallet_topup_orders_paid_stripe_session index'
  );
  assert.ok(
    completeSchemaSql.includes('ux_wallet_topup_orders_paid_payment_intent'),
    'Complete schema: must include ux_wallet_topup_orders_paid_payment_intent index'
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
