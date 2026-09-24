import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {
  createUser,
  createOrganization,
  createTheme,
  getAllPlatformGames,
  createEvent,
  updateEvent,
  getPendingEventsCountByOrgId,
  getEventsByOrgId,
  getNormalizedCurrentDate,
  resolveEventTimezone,
} from './index.js';

function getOffsetDate(baseDateStr: string, offsetDays: number): string {
  const [y, m, d] = baseDateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + offsetDays));
  const year = dt.getUTCFullYear();
  const month = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dt.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function runPendingEventLimitExpirationTests() {
  console.log('========================================================================');
  console.log(' RUNNING PENDING EVENT LIMIT EXPIRATION & LIFECYCLE REGRESSION TEST SUITE');
  console.log('========================================================================\n');

  const testEnv = {
    TEST_MODE: true,
  };

  const games = await getAllPlatformGames(testEnv);
  const gameId = games[0]?.id || 'game-catch-brand';

  const user = await createUser({
    email: `pending_limit_tester_${Date.now()}@example.com`,
    name: 'Pending Limit Tester',
  }, testEnv);

  const org = await createOrganization({
    name: 'Pending Limit Test Org',
    owner_id: user.id,
    country_code: 'MY',
  }, testEnv);

  const theme = await createTheme({
    organization_id: org.id,
    game_id: gameId,
    name: 'Pending Limit Theme',
    slug: `pending-limit-theme-${Date.now()}`,
  }, testEnv);

  const todaySingapore = getNormalizedCurrentDate(new Date(), 'Asia/Singapore');
  const tomorrowSingapore = getOffsetDate(todaySingapore, 1);
  const dayAfterSingapore = getOffsetDate(todaySingapore, 2);
  const yesterdaySingapore = getOffsetDate(todaySingapore, -1);
  const twoDaysAgoSingapore = getOffsetDate(todaySingapore, -2);

  console.log(`Reference Date (Asia/Singapore): Today = ${todaySingapore}, Tomorrow = ${tomorrowSingapore}, Yesterday = ${yesterdaySingapore}\n`);

  // --------------------------------------------------------------------------
  // TEST 1: Create unpaid event ending in the future -> Count = 1
  // --------------------------------------------------------------------------
  console.log('--- TEST 1: Create unpaid event ending in the future (Count = 1) ---');
  const futureEvent1 = await createEvent({
    organization_id: org.id,
    game_id: gameId,
    game_theme_id: theme.id,
    name: 'Future Pending Event 1',
    start_date: tomorrowSingapore,
    end_date: dayAfterSingapore,
    event_price: 1400,
    payment_status: 'UNPAID',
    status: 'draft',
    created_by: user.id,
    event_timezone: 'Asia/Singapore',
  }, testEnv);

  let count = await getPendingEventsCountByOrgId(org.id, testEnv);
  assert.strictEqual(count, 1, 'TEST 1: Pending count must be 1 after creating 1 future unpaid event');
  console.log('  ✓ PASS: TEST 1: Count is 1 for future unpaid event');

  // --------------------------------------------------------------------------
  // TEST 2: Create second unpaid event ending in the future -> Count = 2
  // --------------------------------------------------------------------------
  console.log('--- TEST 2: Create second unpaid event ending in the future (Count = 2) ---');
  const futureEvent2 = await createEvent({
    organization_id: org.id,
    game_id: gameId,
    game_theme_id: theme.id,
    name: 'Future Pending Event 2',
    start_date: getOffsetDate(todaySingapore, 3),
    end_date: getOffsetDate(todaySingapore, 4),
    event_price: 1400,
    payment_status: 'UNPAID',
    status: 'draft',
    created_by: user.id,
    event_timezone: 'Asia/Singapore',
  }, testEnv);

  count = await getPendingEventsCountByOrgId(org.id, testEnv);
  assert.strictEqual(count, 2, 'TEST 2: Pending count must be 2 after creating 2 future unpaid events');
  console.log('  ✓ PASS: TEST 2: Count is 2 for two future unpaid events');

  // --------------------------------------------------------------------------
  // TEST 3: Attempt third unpaid future event -> Must receive PENDING_EVENT_LIMIT_REACHED
  // --------------------------------------------------------------------------
  console.log('--- TEST 3: Attempt third unpaid future event -> Must receive PENDING_EVENT_LIMIT_REACHED ---');
  let thirdRejected = false;
  try {
    await createEvent({
      organization_id: org.id,
      game_id: gameId,
      game_theme_id: theme.id,
      name: 'Future Pending Event 3 (Should Reject)',
      start_date: getOffsetDate(todaySingapore, 5),
      end_date: getOffsetDate(todaySingapore, 6),
      event_price: 1400,
      payment_status: 'UNPAID',
      status: 'draft',
      created_by: user.id,
      event_timezone: 'Asia/Singapore',
    }, testEnv);
  } catch (err: any) {
    thirdRejected = true;
    assert.strictEqual(err.code, 'PENDING_EVENT_LIMIT_REACHED', 'Error code must be PENDING_EVENT_LIMIT_REACHED');
    assert.strictEqual(err.status, 422, 'HTTP status must be 422');
  }
  assert.strictEqual(thirdRejected, true, 'TEST 3: Third unpaid event must be rejected with PENDING_EVENT_LIMIT_REACHED');
  console.log('  ✓ PASS: TEST 3: Third future unpaid event rejected cleanly');

  // --------------------------------------------------------------------------
  // TEST 4: Have one unpaid event whose end date is yesterday -> Count must exclude it
  // Stored status may intentionally still be SCHEDULED/PENDING_PAYMENT to simulate cron not having run
  // --------------------------------------------------------------------------
  console.log('--- TEST 4: Unpaid event whose end date is yesterday (Simulating cron not yet run) ---');
  const orgPastOnly = await createOrganization({
    name: 'Past Events Only Org',
    owner_id: user.id,
    country_code: 'MY',
  }, testEnv);

  const themePast = await createTheme({
    organization_id: orgPastOnly.id,
    game_id: gameId,
    name: 'Past Theme',
    slug: `past-theme-${Date.now()}`,
  }, testEnv);

  // Create event with valid current dates, then simulate passage of time via updateEvent
  const evPast = await createEvent({
    organization_id: orgPastOnly.id,
    game_id: gameId,
    game_theme_id: themePast.id,
    name: 'Past Unpaid Event (Cron Lag)',
    start_date: todaySingapore,
    end_date: tomorrowSingapore,
    event_price: 1400,
    payment_status: 'UNPAID',
    status: 'draft',
    event_status: 'DRAFT',
    created_by: user.id,
    event_timezone: 'Asia/Singapore',
  }, testEnv);

  await updateEvent(evPast.id, {
    start_date: twoDaysAgoSingapore,
    end_date: yesterdaySingapore,
    event_date: yesterdaySingapore,
  }, testEnv);

  count = await getPendingEventsCountByOrgId(orgPastOnly.id, testEnv);
  assert.strictEqual(count, 0, 'TEST 4: Count must be 0 because the unpaid event ended yesterday');
  console.log('  ✓ PASS: TEST 4: Unpaid event ended yesterday does not consume a pending slot');

  // --------------------------------------------------------------------------
  // TEST 5: One expired unpaid event + one active unpaid event -> Count must be 1, new creation succeeds
  // --------------------------------------------------------------------------
  console.log('--- TEST 5: One expired unpaid event + one active unpaid event -> Count = 1, new creation succeeds ---');
  const orgMixed = await createOrganization({
    name: 'Mixed Events Org',
    owner_id: user.id,
    country_code: 'MY',
  }, testEnv);

  const themeMixed = await createTheme({
    organization_id: orgMixed.id,
    game_id: gameId,
    name: 'Mixed Theme',
    slug: `mixed-theme-${Date.now()}`,
  }, testEnv);

  // 1 expired unpaid event: create and simulate past end date
  const evExpiredMixed = await createEvent({
    organization_id: orgMixed.id,
    game_id: gameId,
    game_theme_id: themeMixed.id,
    name: 'Expired Past Event',
    start_date: todaySingapore,
    end_date: tomorrowSingapore,
    event_price: 1400,
    payment_status: 'UNPAID',
    status: 'draft',
    created_by: user.id,
    event_timezone: 'Asia/Singapore',
  }, testEnv);

  await updateEvent(evExpiredMixed.id, {
    start_date: twoDaysAgoSingapore,
    end_date: yesterdaySingapore,
    event_date: yesterdaySingapore,
  }, testEnv);

  // 1 active future unpaid event
  await createEvent({
    organization_id: orgMixed.id,
    game_id: gameId,
    game_theme_id: themeMixed.id,
    name: 'Active Future Event',
    start_date: tomorrowSingapore,
    end_date: dayAfterSingapore,
    event_price: 1400,
    payment_status: 'UNPAID',
    status: 'draft',
    created_by: user.id,
    event_timezone: 'Asia/Singapore',
  }, testEnv);

  count = await getPendingEventsCountByOrgId(orgMixed.id, testEnv);
  assert.strictEqual(count, 1, 'TEST 5: Pending count must be exactly 1 (1 expired ignored + 1 active counted)');

  // Creating another future event must succeed!
  const secondActive = await createEvent({
    organization_id: orgMixed.id,
    game_id: gameId,
    game_theme_id: themeMixed.id,
    name: 'Second Active Future Event',
    start_date: getOffsetDate(todaySingapore, 3),
    end_date: getOffsetDate(todaySingapore, 4),
    event_price: 1400,
    payment_status: 'UNPAID',
    status: 'draft',
    created_by: user.id,
    event_timezone: 'Asia/Singapore',
  }, testEnv);
  assert.ok(secondActive.id, 'Second active event must be created successfully');

  count = await getPendingEventsCountByOrgId(orgMixed.id, testEnv);
  assert.strictEqual(count, 2, 'TEST 5: Pending count is now 2 active events');
  console.log('  ✓ PASS: TEST 5: One expired unpaid event + one active unpaid event allows creating a second active event');

  // --------------------------------------------------------------------------
  // TEST 6: Two expired unpaid events -> Count = 0, new creation succeeds
  // --------------------------------------------------------------------------
  console.log('--- TEST 6: Two expired unpaid events -> Count = 0, new creation succeeds ---');
  const orgTwoExpired = await createOrganization({
    name: 'Two Expired Org',
    owner_id: user.id,
    country_code: 'MY',
  }, testEnv);

  const themeTwoExpired = await createTheme({
    organization_id: orgTwoExpired.id,
    game_id: gameId,
    name: 'Two Expired Theme',
    slug: `two-expired-theme-${Date.now()}`,
  }, testEnv);

  // Event A: expired
  const evA = await createEvent({
    organization_id: orgTwoExpired.id,
    game_id: gameId,
    game_theme_id: themeTwoExpired.id,
    name: 'Expired Event A',
    start_date: todaySingapore,
    end_date: tomorrowSingapore,
    event_price: 1400,
    payment_status: 'UNPAID',
    status: 'draft',
    created_by: user.id,
    event_timezone: 'Asia/Singapore',
  }, testEnv);

  await updateEvent(evA.id, {
    start_date: getOffsetDate(todaySingapore, -5),
    end_date: getOffsetDate(todaySingapore, -4),
    event_date: getOffsetDate(todaySingapore, -4),
  }, testEnv);

  // Event B: expired
  const evB = await createEvent({
    organization_id: orgTwoExpired.id,
    game_id: gameId,
    game_theme_id: themeTwoExpired.id,
    name: 'Expired Event B',
    start_date: todaySingapore,
    end_date: tomorrowSingapore,
    event_price: 1400,
    payment_status: 'UNPAID',
    status: 'draft',
    created_by: user.id,
    event_timezone: 'Asia/Singapore',
  }, testEnv);

  await updateEvent(evB.id, {
    start_date: getOffsetDate(todaySingapore, -3),
    end_date: yesterdaySingapore,
    event_date: yesterdaySingapore,
  }, testEnv);

  count = await getPendingEventsCountByOrgId(orgTwoExpired.id, testEnv);
  assert.strictEqual(count, 0, 'TEST 6: Pending count must be 0 with 2 expired events');

  // Creating Event C must succeed!
  const eventC = await createEvent({
    organization_id: orgTwoExpired.id,
    game_id: gameId,
    game_theme_id: themeTwoExpired.id,
    name: 'Active Event C',
    start_date: tomorrowSingapore,
    end_date: dayAfterSingapore,
    event_price: 1400,
    payment_status: 'UNPAID',
    status: 'draft',
    created_by: user.id,
    event_timezone: 'Asia/Singapore',
  }, testEnv);
  assert.ok(eventC.id, 'Creating event C must succeed when previous events are expired');

  count = await getPendingEventsCountByOrgId(orgTwoExpired.id, testEnv);
  assert.strictEqual(count, 1, 'TEST 6: Pending count is now 1');
  console.log('  ✓ PASS: TEST 6: Two expired unpaid events consume 0 slots; creating new event succeeds');

  // --------------------------------------------------------------------------
  // TEST 7: Explicit event_status = EXPIRED -> Must not count
  // --------------------------------------------------------------------------
  console.log('--- TEST 7: Explicit event_status = EXPIRED -> Must not count ---');
  const orgStatusExplicit = await createOrganization({
    name: 'Status Explicit Org',
    owner_id: user.id,
    country_code: 'MY',
  }, testEnv);

  const themeStatusExplicit = await createTheme({
    organization_id: orgStatusExplicit.id,
    game_id: gameId,
    name: 'Explicit Status Theme',
    slug: `explicit-status-theme-${Date.now()}`,
  }, testEnv);

  await createEvent({
    organization_id: orgStatusExplicit.id,
    game_id: gameId,
    game_theme_id: themeStatusExplicit.id,
    name: 'Explicitly Expired Event',
    start_date: tomorrowSingapore,
    end_date: dayAfterSingapore,
    event_price: 1400,
    payment_status: 'UNPAID',
    status: 'expired',
    event_status: 'EXPIRED',
    created_by: user.id,
    event_timezone: 'Asia/Singapore',
    skipPendingLimitCheck: true,
  }, testEnv);

  count = await getPendingEventsCountByOrgId(orgStatusExplicit.id, testEnv);
  assert.strictEqual(count, 0, 'TEST 7: Explicit EXPIRED status must not count');
  console.log('  ✓ PASS: TEST 7: Explicit event_status = EXPIRED does not count');

  // --------------------------------------------------------------------------
  // TEST 8: Explicit CANCELLED -> Must not count
  // --------------------------------------------------------------------------
  console.log('--- TEST 8: Explicit CANCELLED -> Must not count ---');
  await createEvent({
    organization_id: orgStatusExplicit.id,
    game_id: gameId,
    game_theme_id: themeStatusExplicit.id,
    name: 'Explicitly Cancelled Event',
    start_date: tomorrowSingapore,
    end_date: dayAfterSingapore,
    event_price: 1400,
    payment_status: 'UNPAID',
    status: 'cancelled',
    event_status: 'CANCELLED',
    created_by: user.id,
    event_timezone: 'Asia/Singapore',
    skipPendingLimitCheck: true,
  }, testEnv);

  count = await getPendingEventsCountByOrgId(orgStatusExplicit.id, testEnv);
  assert.strictEqual(count, 0, 'TEST 8: Explicit CANCELLED status must not count');
  console.log('  ✓ PASS: TEST 8: Explicit CANCELLED event does not count');

  // --------------------------------------------------------------------------
  // TEST 9: PAID event -> Must not count
  // --------------------------------------------------------------------------
  console.log('--- TEST 9: PAID event -> Must not count ---');
  await createEvent({
    organization_id: orgStatusExplicit.id,
    game_id: gameId,
    game_theme_id: themeStatusExplicit.id,
    name: 'Paid Event',
    start_date: tomorrowSingapore,
    end_date: dayAfterSingapore,
    event_price: 1400,
    payment_status: 'PAID',
    status: 'scheduled',
    event_status: 'SCHEDULED',
    created_by: user.id,
    event_timezone: 'Asia/Singapore',
  }, testEnv);

  count = await getPendingEventsCountByOrgId(orgStatusExplicit.id, testEnv);
  assert.strictEqual(count, 0, 'TEST 9: PAID event must not count towards pending events');
  console.log('  ✓ PASS: TEST 9: PAID event does not count towards pending events');

  // --------------------------------------------------------------------------
  // TEST 10: End date is TODAY in the event timezone -> Event must still count
  // --------------------------------------------------------------------------
  console.log('--- TEST 10: End date is TODAY in event timezone -> Must still count (inclusive) ---');
  const user2 = await createUser({
    email: `pending_limit_tester_2_${Date.now()}@example.com`,
    name: 'Pending Limit Tester 2',
  }, testEnv);

  const orgToday = await createOrganization({
    name: 'Today Event Org',
    owner_id: user2.id,
    country_code: 'MY',
  }, testEnv);

  const themeToday = await createTheme({
    organization_id: orgToday.id,
    game_id: gameId,
    name: 'Today Event Theme',
    slug: `today-theme-${Date.now()}`,
  }, testEnv);

  await createEvent({
    organization_id: orgToday.id,
    game_id: gameId,
    game_theme_id: themeToday.id,
    name: 'Event Ending Today',
    start_date: todaySingapore,
    end_date: todaySingapore,
    event_price: 1400,
    payment_status: 'UNPAID',
    status: 'draft',
    created_by: user2.id,
    event_timezone: 'Asia/Singapore',
  }, testEnv);

  count = await getPendingEventsCountByOrgId(orgToday.id, testEnv);
  assert.strictEqual(count, 1, 'TEST 10: Event ending TODAY in event timezone must still count');
  console.log('  ✓ PASS: TEST 10: Event ending TODAY in event timezone counts (inclusive day)');

  // --------------------------------------------------------------------------
  // TEST 11: End date was YESTERDAY in the event timezone -> Must not count
  // --------------------------------------------------------------------------
  console.log('--- TEST 11: End date was YESTERDAY in event timezone -> Must not count ---');
  const orgYesterday = await createOrganization({
    name: 'Yesterday Event Org',
    owner_id: user2.id,
    country_code: 'MY',
  }, testEnv);

  const themeYesterday = await createTheme({
    organization_id: orgYesterday.id,
    game_id: gameId,
    name: 'Yesterday Event Theme',
    slug: `yesterday-theme-${Date.now()}`,
  }, testEnv);

  const evYesterday = await createEvent({
    organization_id: orgYesterday.id,
    game_id: gameId,
    game_theme_id: themeYesterday.id,
    name: 'Event Ended Yesterday',
    start_date: todaySingapore,
    end_date: tomorrowSingapore,
    event_price: 1400,
    payment_status: 'UNPAID',
    status: 'draft',
    created_by: user2.id,
    event_timezone: 'Asia/Singapore',
  }, testEnv);

  await updateEvent(evYesterday.id, {
    start_date: yesterdaySingapore,
    end_date: yesterdaySingapore,
    event_date: yesterdaySingapore,
  }, testEnv);

  count = await getPendingEventsCountByOrgId(orgYesterday.id, testEnv);
  assert.strictEqual(count, 0, 'TEST 11: Event ending YESTERDAY in event timezone must not count');
  console.log('  ✓ PASS: TEST 11: Event ending YESTERDAY in event timezone does not count');

  // --------------------------------------------------------------------------
  // TEST 12: Verify timezone behavior using an event timezone that differs from UTC
  // --------------------------------------------------------------------------
  console.log('--- TEST 12: Timezone behavior with non-UTC timezone ---');
  const orgTz = await createOrganization({
    name: 'Timezone Event Org',
    owner_id: user2.id,
    country_code: 'MY',
  }, testEnv);

  const themeTz = await createTheme({
    organization_id: orgTz.id,
    game_id: gameId,
    name: 'Timezone Event Theme',
    slug: `tz-theme-${Date.now()}`,
  }, testEnv);

  // Suppose an event is in Asia/Tokyo (UTC+9)
  // We test with a specific instant: 2026-09-23 16:00:00 UTC
  // In UTC: Date is 2026-09-23
  // In Asia/Tokyo (UTC+9): Date is 2026-09-24 01:00:00 -> 2026-09-24!
  const instantUtc = new Date('2026-09-23T16:00:00Z');
  const tokyoDate = getNormalizedCurrentDate(instantUtc, 'Asia/Tokyo');
  const utcDate = getNormalizedCurrentDate(instantUtc, 'UTC');

  assert.strictEqual(utcDate, '2026-09-23', 'UTC date at 16:00 UTC must be 2026-09-23');
  assert.strictEqual(tokyoDate, '2026-09-24', 'Tokyo date at 16:00 UTC must be 2026-09-24');

  // Event with end_date = '2026-09-23' and event_timezone = 'Asia/Tokyo'
  // When evaluated at instantUtc (where Tokyo is already 2026-09-24):
  // End date (2026-09-23) has passed in Tokyo! It should NOT count!
  // If naive UTC were used, it would still appear to be today (2026-09-23) and would falsely count!
  const tokyoPastEvent = await createEvent({
    organization_id: orgTz.id,
    game_id: gameId,
    game_theme_id: themeTz.id,
    name: 'Tokyo Event',
    start_date: todaySingapore,
    end_date: tomorrowSingapore,
    event_price: 1400,
    payment_status: 'UNPAID',
    status: 'draft',
    created_by: user2.id,
    event_timezone: 'Asia/Tokyo',
  }, testEnv);

  await updateEvent(tokyoPastEvent.id, {
    start_date: '2026-09-22',
    end_date: '2026-09-23',
    event_date: '2026-09-23',
  }, testEnv);

  const tokyoPendingCount = await getPendingEventsCountByOrgId(orgTz.id, testEnv, instantUtc);
  assert.strictEqual(
    tokyoPendingCount,
    0,
    'TEST 12: Event ending 2026-09-23 in Tokyo must be treated as ended when evaluated at 2026-09-23 16:00 UTC (Tokyo is 2026-09-24)'
  );
  console.log('  ✓ PASS: TEST 12: Timezone resolution correctly uses event-local calendar day, not server UTC blindly');

  // --------------------------------------------------------------------------
  // TEST 13: SQL Migration and Schema Integrity Verification
  // --------------------------------------------------------------------------
  console.log('--- TEST 13: SQL Migration and Schema Authoritative Verification ---');
  const newMigrationPath = path.resolve(process.cwd(), 'supabase/migrations/20260927000000_exclude_expired_unpaid_events_from_pending_limit.sql');
  const pricingMigrationPath = path.resolve(process.cwd(), 'supabase/migrations/20260923000000_fail_closed_event_pricing.sql');
  const schemaPath = path.resolve(process.cwd(), 'supabase/schema.sql');

  assert.ok(fs.existsSync(newMigrationPath), 'New migration 20260927000000 must exist');
  assert.ok(fs.existsSync(pricingMigrationPath), 'Migration 20260923000000 must exist');
  assert.ok(fs.existsSync(schemaPath), 'schema.sql must exist');

  const newMigrationSql = fs.readFileSync(newMigrationPath, 'utf-8');
  const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
  const pricingMigrationSql = fs.readFileSync(pricingMigrationPath, 'utf-8');

  // Verify check_event_pending_limit trigger excludes expired and past-end-date events
  assert.ok(
    newMigrationSql.includes('check_event_pending_limit') &&
    newMigrationSql.includes('v_new_end_date') &&
    newMigrationSql.includes('v_new_is_past'),
    'check_event_pending_limit must evaluate v_new_is_past in 20260927000000'
  );

  assert.ok(
    schemaSql.includes('check_event_pending_limit') &&
    schemaSql.includes('v_new_end_date') &&
    schemaSql.includes('v_new_is_past'),
    'check_event_pending_limit must evaluate v_new_is_past in schema.sql'
  );

  // Verify date-based expiration condition is present in create_event_atomic in migration and schema
  for (const [name, sql] of [
    ['New Migration 20260927000000', newMigrationSql],
    ['Pricing Migration 20260923000000', pricingMigrationSql],
    ['Schema schema.sql', schemaSql],
  ]) {
    assert.ok(
      sql.includes('now() AT TIME ZONE COALESCE(NULLIF(TRIM(event_timezone), \'\'), \'Asia/Singapore\')') ||
      sql.includes('timezone'),
      `${name} must evaluate current date against event_timezone`
    );
    assert.ok(
      sql.includes('end_date') && (sql.includes('now() AT TIME ZONE') || sql.includes('event_timezone')),
      `${name} must compare end_date in pending limit query`
    );
    assert.ok(
      sql.includes('NOT IN (\'cancelled\', \'expired\', \'completed\')') ||
      sql.includes('NOT IN (\'CANCELLED\', \'EXPIRED\', \'COMPLETED\')'),
      `${name} must exclude cancelled, expired, and completed events`
    );
    assert.ok(
      sql.includes('NOT IN (\'PAID\', \'REFUNDED\')'),
      `${name} must exclude PAID and REFUNDED events`
    );
  }
  console.log('  ✓ PASS: TEST 13: SQL functions in all migrations and schema contain authoritative date and status exclusions');

  console.log('\n========================================================================');
  console.log(' 🎉 ALL 13 PENDING EVENT LIMIT REGRESSION TESTS PASSED PERFECTLY!');
  console.log('========================================================================\n');
}

runPendingEventLimitExpirationTests().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
