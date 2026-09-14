import assert from 'node:assert';
import {
  resolveEventTimezone,
  isValidTimezone,
  getDefaultTimezoneForCountry,
  SUPPORTED_TIMEZONES,
} from '../../src/lib/countryUtils.js';
import {
  getNormalizedEventDates,
  getNormalizedCurrentDate,
  getCalendarDateInTimezone,
  getUtcBoundaryInTimezone,
  getTimezoneOffsetMs,
  normalizeEventDateBoundaries,
  isSetupDayStarted,
  canAccessLiveEvent,
  canAccessClientLiveGame,
  getClientLiveGameAccessDetails,
  runEventLifecycleMaintenance,
  localEventsCache,
  createEvent,
  updateEvent,
} from './events.js';
import { calculateEventCalendarDays } from './platformSettings.js';

console.log('======================================================');
console.log('Running Event Timezone Authoritative Regression Suite');
console.log('======================================================');

// ----------------------------------------------------
// Section 1: Canonical Timezone Resolver Hierarchy
// ----------------------------------------------------
console.log('\n--- Section 1: Timezone Resolution Hierarchy ---');

// 1a. Explicit event_timezone takes precedence
const eventWithTz = { event_timezone: 'Asia/Tokyo' };
assert.strictEqual(resolveEventTimezone(eventWithTz), 'Asia/Tokyo');
console.log('  ✓ 1a. Explicit event_timezone takes highest priority');

// 1b. Legacy event.timezone fallback supported
const eventWithLegacyTz = { timezone: 'Europe/London' };
assert.strictEqual(resolveEventTimezone(eventWithLegacyTz), 'Europe/London');
console.log('  ✓ 1b. Legacy event.timezone supported as fallback');

// 1c. Organization country default timezone used when no event timezone
const eventWithOrg = {
  event_timezone: null,
  organization: { country_code: 'TH' },
};
assert.strictEqual(resolveEventTimezone(eventWithOrg), 'Asia/Bangkok');
console.log('  ✓ 1c. Organization country_code default used when event_timezone is null');

// 1d. Organization country_code direct property
const eventWithOrgDirect = {
  country_code: 'JP',
};
assert.strictEqual(resolveEventTimezone(eventWithOrgDirect), 'Asia/Tokyo');
console.log('  ✓ 1d. Direct country_code property resolved to correct default timezone');

// 1e. Malaysia defaults to Asia/Kuala_Lumpur
assert.strictEqual(getDefaultTimezoneForCountry('MY'), 'Asia/Kuala_Lumpur');
assert.strictEqual(resolveEventTimezone({ organization: { country_code: 'MY' } }), 'Asia/Kuala_Lumpur');
console.log('  ✓ 1e. MY defaults to Asia/Kuala_Lumpur');

// 1f. Singapore fallback if country code is missing or unknown
assert.strictEqual(resolveEventTimezone({}), 'Asia/Singapore');
assert.strictEqual(resolveEventTimezone({ organization: { country_code: 'XX' } }), 'Asia/Singapore');
console.log('  ✓ 1f. Asia/Singapore is authoritative global fallback');

// 1g. Invalid or bogus timezone strings safely fallback
assert.strictEqual(resolveEventTimezone({ event_timezone: 'Fake/Invalid_Zone' }), 'Asia/Singapore');
assert.strictEqual(resolveEventTimezone({ event_timezone: '   ' }), 'Asia/Singapore');
console.log('  ✓ 1g. Invalid or whitespace timezone strings fallback safely');

// 1h. Validation helper accurately identifies valid IANA timezones
assert.strictEqual(isValidTimezone('Asia/Singapore'), true);
assert.strictEqual(isValidTimezone('America/New_York'), true);
assert.strictEqual(isValidTimezone('Not/A_Real_Timezone'), false);
assert.strictEqual(isValidTimezone(''), false);
console.log('  ✓ 1h. isValidTimezone correctly validates IANA timezone identifiers');

// ----------------------------------------------------
// Section 2: Exact Boundary Calculations Across Timezones
// ----------------------------------------------------
console.log('\n--- Section 2: Exact Boundary UTC Conversions ---');

// 2a. Tokyo (UTC+9): 2026-09-20 00:00:00 Tokyo time = 2026-09-19 15:00:00 UTC
const tokyoStart = getUtcBoundaryInTimezone('2026-09-20', 'start', 'Asia/Tokyo');
assert.strictEqual(tokyoStart.toISOString(), '2026-09-19T15:00:00.000Z');
console.log('  ✓ 2a. Tokyo start of day matches 15:00:00.000Z previous day UTC');

// 2b. Tokyo (UTC+9): 2026-09-20 23:59:59.999 Tokyo time = 2026-09-20 14:59:59.999 UTC
const tokyoEnd = getUtcBoundaryInTimezone('2026-09-20', 'end', 'Asia/Tokyo');
assert.strictEqual(tokyoEnd.toISOString(), '2026-09-20T14:59:59.999Z');
console.log('  ✓ 2b. Tokyo end of day matches 14:59:59.999Z same day UTC');

// 2c. New York (EDT, UTC-4 in September): 2026-09-20 00:00:00 EDT = 2026-09-20 04:00:00 UTC
const nyStart = getUtcBoundaryInTimezone('2026-09-20', 'start', 'America/New_York');
assert.strictEqual(nyStart.toISOString(), '2026-09-20T04:00:00.000Z');
console.log('  ✓ 2c. New York EDT start of day matches 04:00:00.000Z UTC');

// 2d. New York (EDT, UTC-4): 2026-09-20 23:59:59.999 EDT = 2026-09-21 03:59:59.999 UTC
const nyEnd = getUtcBoundaryInTimezone('2026-09-20', 'end', 'America/New_York');
assert.strictEqual(nyEnd.toISOString(), '2026-09-21T03:59:59.999Z');
console.log('  ✓ 2d. New York EDT end of day matches 03:59:59.999Z next day UTC');

// 2e. normalizeEventDateBoundaries produces exact timezone-aware timestamps
const normalizedTokyo = normalizeEventDateBoundaries({
  start_date: '2026-09-20',
  end_date: '2026-09-22',
  event_timezone: 'Asia/Tokyo',
});
assert.strictEqual(normalizedTokyo.startDate, '2026-09-20');
assert.strictEqual(normalizedTokyo.endDate, '2026-09-22');
assert.strictEqual(normalizedTokyo.liveOpenDate, '2026-09-19'); // Setup Day
assert.strictEqual(normalizedTokyo.starts_at, '2026-09-19T15:00:00.000Z');
assert.strictEqual(normalizedTokyo.expires_at, '2026-09-22T14:59:59.999Z');
assert.strictEqual(normalizedTokyo.setup_starts_at, '2026-09-18T15:00:00.000Z');
console.log('  ✓ 2e. normalizeEventDateBoundaries correctly aligns Setup Day and UTC boundaries');

// ----------------------------------------------------
// Section 3: Timezone-Aware Setup Day and Live Window Logic
// ----------------------------------------------------
console.log('\n--- Section 3: Timezone-Aware Live & Setup Day Window ---');

const nyEvent = {
  start_date: '2026-09-20',
  end_date: '2026-09-22',
  event_timezone: 'America/New_York',
  starts_at: '2026-09-20T04:00:00.000Z',
  expires_at: '2026-09-23T03:59:59.999Z',
  setup_starts_at: '2026-09-19T04:00:00.000Z',
};

// Setup day is 2026-09-19 New York time (starts at 2026-09-19T04:00:00.000Z)
// At 2026-09-19T02:00:00.000Z:
// In Singapore: 10:00 AM Sept 19 (Setup day in SG)
// In New York: 10:00 PM Sept 18 (Setup day NOT started in NY yet!)
const beforeNySetup = new Date('2026-09-19T02:00:00.000Z');
assert.strictEqual(
  isSetupDayStarted(nyEvent, beforeNySetup),
  false,
  'New York event must NOT have Setup Day started at 2026-09-19T02:00:00.000Z'
);

// At 2026-09-19T05:00:00.000Z:
// In New York: 1:00 AM Sept 19 (Setup day has started in NY!)
const afterNySetup = new Date('2026-09-19T05:00:00.000Z');
assert.strictEqual(
  isSetupDayStarted(nyEvent, afterNySetup),
  true,
  'New York event MUST have Setup Day started at 2026-09-19T05:00:00.000Z'
);
console.log('  ✓ 3a. isSetupDayStarted respects event_timezone and does not activate early from browser/SG offset');

// Live window check:
// An event that is PAID opens on Setup Day
const paidNyEvent = {
  ...nyEvent,
  payment_status: 'PAID',
  status: 'live',
  event_status: 'LIVE',
};
assert.strictEqual(canAccessLiveEvent(paidNyEvent, beforeNySetup), false);
assert.strictEqual(canAccessLiveEvent(paidNyEvent, afterNySetup), true);

// At 2026-09-23T03:00:00.000Z:
// In New York: 11:00 PM Sept 22 (End day is Sept 22, still within 23:59:59.999 NY time)
const duringEndDayNy = new Date('2026-09-23T03:00:00.000Z');
assert.strictEqual(
  canAccessLiveEvent(paidNyEvent, duringEndDayNy),
  true,
  'Paid event remains playable through 23:59:59.999 local event timezone'
);

// At 2026-09-23T04:00:01.000Z:
// In New York: 12:00:01 AM Sept 23 (End day has passed in NY!)
const afterEndDayNy = new Date('2026-09-23T04:00:01.000Z');
assert.strictEqual(
  canAccessLiveEvent(paidNyEvent, afterEndDayNy),
  false,
  'Paid event access closes after 23:59:59.999 local event timezone'
);
console.log('  ✓ 3b. canAccessLiveEvent correctly enforces local midnight boundaries for end_date');

// ----------------------------------------------------
// Section 4: Calendar Duration Invariance
// ----------------------------------------------------
console.log('\n--- Section 4: Calendar Days Duration Invariance ---');

// 1-day event: start_date === end_date
assert.strictEqual(calculateEventCalendarDays('2026-09-20', '2026-09-20'), 1);
// 3-day event: 20, 21, 22
assert.strictEqual(calculateEventCalendarDays('2026-09-20', '2026-09-22'), 3);
// 7-day event
assert.strictEqual(calculateEventCalendarDays('2026-09-01', '2026-09-07'), 7);
console.log('  ✓ 4a. Duration formula is strictly calendar-day inclusive without timezone drift');

// ----------------------------------------------------
// Section 5: Immutability and Update Recalculation
// ----------------------------------------------------
console.log('\n--- Section 5: Immutability After Payment & Recalculation ---');

const mockTestEnv = {
  NODE_ENV: 'development',
  SUPABASE_URL: 'https://placeholder.supabase.co',
  SUPABASE_ANON_KEY: 'placeholder-anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'placeholder-service-key',
  JWT_SECRET: '0123456789abcdef0123456789abcdef',
};

// Seed test event in cache
const testEventId = 'e48a1234-5678-4321-abcd-ef0123456789';
localEventsCache.set(testEventId, {
  id: testEventId,
  organization_id: 'org-123',
  game_id: 'catch-brand',
  game_theme_id: 'theme-123',
  name: 'Editable Timezone Event',
  start_date: '2026-09-25',
  end_date: '2026-09-26',
  event_date: '2026-09-25',
  starts_at: '2026-09-24T16:00:00.000Z', // Asia/Singapore 00:00
  expires_at: '2026-09-26T15:59:59.999Z',
  setup_starts_at: '2026-09-23T16:00:00.000Z',
  event_timezone: 'Asia/Singapore',
  payment_status: 'UNPAID',
  status: 'draft',
  event_status: 'DRAFT',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
} as any);

// 5a. When unpaid, updating event_timezone succeeds and recalculates UTC timestamps
const updatedTz = await updateEvent(
  testEventId,
  {
    event_timezone: 'Asia/Tokyo',
  },
  mockTestEnv
);

assert.strictEqual(updatedTz.event_timezone, 'Asia/Tokyo');
// 2026-09-25 00:00:00 Tokyo = 2026-09-24 15:00:00 UTC (1 hour earlier than Singapore)
assert.strictEqual(updatedTz.starts_at, '2026-09-24T15:00:00.000Z');
assert.strictEqual(updatedTz.expires_at, '2026-09-26T14:59:59.999Z');
assert.strictEqual(updatedTz.setup_starts_at, '2026-09-23T15:00:00.000Z');
console.log('  ✓ 5a. Unpaid event timezone change successfully recalculates UTC boundaries');

// 5b. When paid, updating event_timezone is rejected
localEventsCache.set(testEventId, {
  ...updatedTz,
  payment_status: 'PAID',
  status: 'live',
  event_status: 'LIVE',
});

let paidUpdateError: any = null;
try {
  await updateEvent(
    testEventId,
    {
      event_timezone: 'America/New_York',
    },
    mockTestEnv
  );
} catch (err: any) {
  paidUpdateError = err;
}

assert.ok(paidUpdateError, 'Expected updateEvent to reject on paid event');
assert.strictEqual(paidUpdateError.code, 'EVENT_LOCKED_AFTER_PAYMENT');
console.log('  ✓ 5b. Paid event timezone is strictly immutable (EVENT_LOCKED_AFTER_PAYMENT)');

// ----------------------------------------------------
// Section 6: Client Live Game Access Evaluation Across Timezones
// ----------------------------------------------------
console.log('\n--- Section 6: Client Live Game Access Evaluation ---');

const londonEvent = {
  start_date: '2026-09-25',
  end_date: '2026-09-26',
  event_timezone: 'Europe/London',
  payment_status: 'PAID',
  status: 'live',
  event_status: 'LIVE',
};

// 2026-09-24 22:30:00 UTC:
// In Singapore: 06:30 Sept 25 (Event start date)
// In London (BST UTC+1): 23:30 Sept 24 (Setup day in London)
// Because Setup Day is live-accessible for paid events, this is accessible:
const londonInstantSetup = new Date('2026-09-24T22:30:00.000Z');
assert.strictEqual(canAccessClientLiveGame(londonEvent, londonInstantSetup), true);

// 2026-09-23 22:30:00 UTC:
// In London: 23:30 Sept 23 (Before Setup day)
const londonBeforeSetup = new Date('2026-09-23T22:30:00.000Z');
assert.strictEqual(canAccessClientLiveGame(londonEvent, londonBeforeSetup), false);
const beforeDetails = getClientLiveGameAccessDetails(londonEvent, londonBeforeSetup);
assert.strictEqual(beforeDetails.code, 'EVENT_NOT_OPEN');
assert.strictEqual(beforeDetails.event_timezone, 'Europe/London');
console.log('  ✓ 6a. canAccessClientLiveGame correctly respects event_timezone and Setup Day');

// 2026-09-26 22:59:00 UTC:
// In London (BST UTC+1): 23:59 Sept 26 (still end_date in London)
const londonEndDay = new Date('2026-09-26T22:59:00.000Z');
assert.strictEqual(canAccessClientLiveGame(londonEvent, londonEndDay), true);

// 2026-09-26 23:01:00 UTC:
// In London (BST UTC+1): 00:01 Sept 27 (day has ended in London)
const londonAfterEnd = new Date('2026-09-26T23:01:00.000Z');
assert.strictEqual(canAccessClientLiveGame(londonEvent, londonAfterEnd), false);
const afterDetails = getClientLiveGameAccessDetails(londonEvent, londonAfterEnd);
assert.strictEqual(afterDetails.code, 'EVENT_COMPLETED');
console.log('  ✓ 6b. canAccessClientLiveGame closes live access at local midnight in event timezone');

// ----------------------------------------------------
// Section 7: Daylight Saving Time (DST) Transitions
// ----------------------------------------------------
console.log('\n--- Section 7: Daylight Saving Transitions ---');

// America/New_York DST end in 2026 is November 1.
// 2026-10-15 is during EDT (UTC-4)
const summerBoundaryStart = getUtcBoundaryInTimezone('2026-10-15', 'start', 'America/New_York');
assert.strictEqual(summerBoundaryStart.toISOString(), '2026-10-15T04:00:00.000Z');
const summerBoundaryEnd = getUtcBoundaryInTimezone('2026-10-15', 'end', 'America/New_York');
assert.strictEqual(summerBoundaryEnd.toISOString(), '2026-10-16T03:59:59.999Z');

// 2026-11-15 is during EST (UTC-5)
const winterBoundaryStart = getUtcBoundaryInTimezone('2026-11-15', 'start', 'America/New_York');
assert.strictEqual(winterBoundaryStart.toISOString(), '2026-11-15T05:00:00.000Z');
const winterBoundaryEnd = getUtcBoundaryInTimezone('2026-11-15', 'end', 'America/New_York');
assert.strictEqual(winterBoundaryEnd.toISOString(), '2026-11-16T04:59:59.999Z');
console.log('  ✓ 7a. America/New_York boundary correctly shifts between EDT (UTC-4) and EST (UTC-5)');

// ----------------------------------------------------
// Section 8: Authoritative Derivation Overrides Client Timestamps
// ----------------------------------------------------
console.log('\n--- Section 8: Server Authoritative Timestamp Derivation ---');

// When client sends conflicting/misleading UTC timestamps with start_date and event_timezone:
const normConflicting = normalizeEventDateBoundaries({
  start_date: '2026-09-20',
  end_date: '2026-09-22',
  event_timezone: 'America/New_York',
  starts_at: '2026-09-20T00:00:00.000Z', // misleading client-generated timestamp
  expires_at: '2026-09-22T23:59:59.999Z',
});

// The server MUST derive starts_at as 2026-09-20T04:00:00.000Z (00:00 EDT)
assert.strictEqual(normConflicting.starts_at, '2026-09-20T04:00:00.000Z');
assert.strictEqual(normConflicting.expires_at, '2026-09-23T03:59:59.999Z');
assert.strictEqual(normConflicting.setup_starts_at, '2026-09-19T04:00:00.000Z');
console.log('  ✓ 8a. Server normalizer completely ignores conflicting client-provided UTC timestamps');

// ----------------------------------------------------
// Section 9: Lifecycle Maintenance Multi-Timezone Evaluation
// ----------------------------------------------------
console.log('\n--- Section 9: Lifecycle Maintenance Multi-Timezone Evaluation ---');

const tokyoMaintId = 'e48a9999-1111-2222-3333-444455556666';
const nyMaintId = 'e48a8888-1111-2222-3333-444455556666';

// Both events are for start_date: 2026-09-20, end_date: 2026-09-20
localEventsCache.set(tokyoMaintId, {
  id: tokyoMaintId,
  organization_id: 'org-maint',
  game_id: 'catch-brand',
  game_theme_id: 'theme-123',
  name: 'Tokyo Live Event',
  start_date: '2026-09-20',
  end_date: '2026-09-20',
  event_date: '2026-09-20',
  starts_at: '2026-09-19T15:00:00.000Z',
  expires_at: '2026-09-20T14:59:59.999Z',
  setup_starts_at: '2026-09-18T15:00:00.000Z',
  event_timezone: 'Asia/Tokyo',
  payment_status: 'PAID',
  status: 'scheduled',
  event_status: 'SCHEDULED',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
} as any);

localEventsCache.set(nyMaintId, {
  id: nyMaintId,
  organization_id: 'org-maint',
  game_id: 'catch-brand',
  game_theme_id: 'theme-123',
  name: 'NY Scheduled Event',
  start_date: '2026-09-20',
  end_date: '2026-09-20',
  event_date: '2026-09-20',
  starts_at: '2026-09-20T04:00:00.000Z',
  expires_at: '2026-09-21T03:59:59.999Z',
  setup_starts_at: '2026-09-19T04:00:00.000Z',
  event_timezone: 'America/New_York',
  payment_status: 'PAID',
  status: 'scheduled',
  event_status: 'SCHEDULED',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
} as any);

// At 2026-09-19 16:00:00 UTC:
// In Tokyo (UTC+9): 2026-09-20 01:00 (Start date reached! Should transition to LIVE)
// In NY (EDT UTC-4): 2026-09-19 12:00 (Setup day! Should stay SCHEDULED)
const instantMaint = new Date('2026-09-19T16:00:00.000Z');
await runEventLifecycleMaintenance(mockTestEnv, instantMaint);

const cachedTokyo = localEventsCache.get(tokyoMaintId);
const cachedNy = localEventsCache.get(nyMaintId);

assert.strictEqual(cachedTokyo?.status, 'live');
assert.strictEqual(cachedTokyo?.event_status, 'LIVE');
assert.strictEqual(cachedNy?.status, 'scheduled');
assert.strictEqual(cachedNy?.event_status, 'SCHEDULED');
console.log('  ✓ 9a. runEventLifecycleMaintenance accurately transitions Tokyo to LIVE while NY stays SCHEDULED');

console.log('\n======================================================');
console.log('All Event Timezone regression tests passed successfully!');
console.log('======================================================');
