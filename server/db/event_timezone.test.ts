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

console.log('\n======================================================');
console.log('All Event Timezone regression tests passed successfully!');
console.log('======================================================');
