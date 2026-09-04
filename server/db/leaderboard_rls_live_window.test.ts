import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { canAccessLiveEvent } from './events.js';
import { determineScoreEnvironment } from './highScores.js';

async function runLeaderboardRlsTests() {
  console.log('====================================================');
  console.log('TEST SUITE: LEADERBOARD RLS LIVE WINDOW SECURITY');
  console.log('====================================================\n');

  const schemaPath = path.resolve(process.cwd(), 'supabase/schema.sql');
  const migrationPath = path.resolve(process.cwd(), 'supabase/migrations/20260904050000_leaderboard_rls_live_window.sql');

  assert.ok(fs.existsSync(schemaPath), 'schema.sql must exist');
  assert.ok(fs.existsSync(migrationPath), 'Migration 20260904050000 must exist');

  const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
  const migrationContent = fs.readFileSync(migrationPath, 'utf-8');

  // --------------------------------------------------------------------------
  // Check 1: RLS policy exists and enforces PAID check
  // --------------------------------------------------------------------------
  console.log('Check 1: RLS policy requires payment_status = PAID...');
  assert.ok(
    schemaContent.includes('CREATE POLICY "Anyone can view high scores of published events"'),
    'schema.sql must define policy "Anyone can view high scores of published events"'
  );
  assert.ok(
    schemaContent.includes("e.payment_status = 'PAID'"),
    'schema.sql policy must explicitly require e.payment_status = PAID for public access'
  );
  assert.ok(
    migrationContent.includes("e.payment_status = 'PAID'"),
    'migration must explicitly require e.payment_status = PAID for public access'
  );
  console.log('  ✓ PASSED: Payment requirement enforced in database policy');

  // --------------------------------------------------------------------------
  // Check 2: RLS policy enforces Singapore calendar date live window
  // --------------------------------------------------------------------------
  console.log('Check 2: RLS policy enforces Singapore live window (start_date - 1 day through end_date)...');
  assert.ok(
    schemaContent.includes("NOW() AT TIME ZONE 'Asia/Singapore'"),
    'schema.sql policy must compute dates in Asia/Singapore timezone'
  );
  assert.ok(
    schemaContent.includes(') - 1'),
    'schema.sql policy must allow live access starting from setup day (start_date - 1 day)'
  );
  assert.ok(
    migrationContent.includes("NOW() AT TIME ZONE 'Asia/Singapore'"),
    'migration must compute dates in Asia/Singapore timezone'
  );
  console.log('  ✓ PASSED: Singapore timezone boundary logic present in policy');

  // --------------------------------------------------------------------------
  // Check 3: RLS policy enforces cancelled event rejection
  // --------------------------------------------------------------------------
  console.log('Check 3: RLS policy checks cancelled status and cancel_reason...');
  assert.ok(
    schemaContent.includes("!= 'cancelled'") && schemaContent.includes('e.cancel_reason IS NULL'),
    'schema.sql policy must reject cancelled events from public view'
  );
  console.log('  ✓ PASSED: Cancelled events are excluded from public view');

  // --------------------------------------------------------------------------
  // Check 4: RLS policy strictly hides TEST scores from public
  // --------------------------------------------------------------------------
  console.log('Check 4: RLS policy strictly hides TEST scores from public queries...');
  assert.ok(
    schemaContent.includes("score_environment NOT IN ('test', 'TEST')") ||
    schemaContent.includes("score_environment IS NULL OR event_high_scores.score_environment NOT IN ('test', 'TEST')"),
    'schema.sql policy must filter out test score environments for public access'
  );
  assert.ok(
    schemaContent.includes("score_mode != 'TEST'"),
    'schema.sql policy must filter out TEST score mode for public access'
  );
  console.log('  ✓ PASSED: TEST scores are strictly prohibited from public select');

  // --------------------------------------------------------------------------
  // Check 5: Organization members and developer admins retain access to test scores
  // --------------------------------------------------------------------------
  console.log('Check 5: Organization members retain access to their own test scores...');
  assert.ok(
    schemaContent.includes('public.get_org_role(e.organization_id) IS NOT NULL'),
    'schema.sql must allow org members to view event high scores'
  );
  assert.ok(
    schemaContent.includes('public.is_developer_admin()'),
    'schema.sql must allow developer admins to view event high scores'
  );
  console.log('  ✓ PASSED: Organization members and developer admins retain full access');

  // --------------------------------------------------------------------------
  // Check 6: Functional validation of canAccessLiveEvent and determineScoreEnvironment
  // --------------------------------------------------------------------------
  console.log('Check 6: Functional validation of live window and test score detection...');

  const futurePaidEvent = {
    id: 'evt-future-1',
    start_date: '2026-10-01',
    end_date: '2026-10-02',
    event_date: '2026-10-01',
    starts_at: '2026-10-01T00:00:00Z',
    expires_at: '2026-10-02T23:59:59Z',
    payment_status: 'PAID',
    status: 'scheduled',
    event_status: 'DRAFT',
  };

  // Simulated current date: 2026-09-15 (before live window)
  const isFutureLive = canAccessLiveEvent(futurePaidEvent, new Date('2026-09-15T12:00:00Z'));
  assert.strictEqual(isFutureLive, false, 'Future paid event before setup day must NOT be live');

  const futureScoreEnv = determineScoreEnvironment(futurePaidEvent, new Date('2026-09-15T12:00:00Z'));
  assert.strictEqual(futureScoreEnv, 'test', 'Score environment before start date must be TEST');

  // Setup day: 2026-09-30 (start_date - 1 day) -> Strictly pre-event TEST mode
  const setupDayScoreEnv = determineScoreEnvironment(futurePaidEvent, new Date('2026-09-30T12:00:00Z'));
  assert.strictEqual(setupDayScoreEnv, 'test', 'Score environment on setup day must be strictly TEST mode');

  // Start day: 2026-10-01
  const isEventDayLive = canAccessLiveEvent(futurePaidEvent, new Date('2026-10-01T12:00:00Z'));
  assert.strictEqual(isEventDayLive, true, 'Event must be accessible on start date');

  const eventDayScoreEnv = determineScoreEnvironment(futurePaidEvent, new Date('2026-10-01T12:00:00Z'));
  assert.strictEqual(eventDayScoreEnv, 'live', 'Score environment on start date must be LIVE');

  // After end day: 2026-10-03
  const isExpiredLive = canAccessLiveEvent(futurePaidEvent, new Date('2026-10-03T12:00:00Z'));
  assert.strictEqual(isExpiredLive, false, 'Event must NOT be accessible after end date');

  console.log('  ✓ PASSED: Functional logic matches Singapore live window boundaries');

  console.log('\n====================================================');
  console.log('🎉 ALL LEADERBOARD RLS LIVE WINDOW TESTS PASSED!');
  console.log('====================================================\n');
}

runLeaderboardRlsTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
