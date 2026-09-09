import assert from 'node:assert';
import {
  PLATFORM_BUSINESS_TIMEZONE as CLIENT_TIMEZONE,
  PLATFORM_BUSINESS_TIMEZONE_LABEL as CLIENT_TIMEZONE_LABEL,
  getCalendarDateInTimezone,
  getSingaporeCalendarDate,
  getNormalizedCurrentDate as getClientNormalizedDate,
  calculateEventStatus as calculateClientStatus,
  deriveEventLifecycleStatus as deriveClientLifecycleStatus,
} from '../src/lib/dateUtils.js';
import {
  PLATFORM_BUSINESS_TIMEZONE as SERVER_TIMEZONE,
  PLATFORM_BUSINESS_TIMEZONE_LABEL as SERVER_TIMEZONE_LABEL,
  getNormalizedCurrentDate as getServerNormalizedDate,
  calculateEventStatus as calculateServerStatus,
  deriveEventLifecycleStatus as deriveServerLifecycleStatus,
} from './db/events.js';

console.log('======================================================');
console.log('Running Platform Business Timezone & Lifecycle Tests');
console.log('======================================================');

// 1. Canonical Declaration Tests
console.log('--- Section 1: Explicit Timezone Declaration ---');
assert.strictEqual(CLIENT_TIMEZONE, 'Asia/Singapore', 'Client timezone must be Asia/Singapore');
assert.strictEqual(SERVER_TIMEZONE, 'Asia/Singapore', 'Server timezone must be Asia/Singapore');
assert.ok(CLIENT_TIMEZONE_LABEL.includes('Asia/Singapore / Malaysia'), 'Client label must declare Asia/Singapore / Malaysia');
assert.ok(CLIENT_TIMEZONE_LABEL.includes('UTC+8'), 'Client label must declare UTC+8');
assert.ok(SERVER_TIMEZONE_LABEL.includes('Asia/Singapore / Malaysia'), 'Server label must declare Asia/Singapore / Malaysia');
assert.ok(SERVER_TIMEZONE_LABEL.includes('UTC+8'), 'Server label must declare UTC+8');
console.log('  ✓ 1. Timezone constants and labels verified');

// 2. Normalization & Skew Prevention
console.log('--- Section 2: Date Normalization & Skew Prevention ---');
// 2026-09-01 16:30:00 UTC is 2026-09-02 00:30:00 in Singapore/Malaysia (UTC+8)
const testDate = new Date('2026-09-01T16:30:00.000Z');
const sgDateClient = getSingaporeCalendarDate(testDate);
const sgDateHelper = getCalendarDateInTimezone(testDate, 'Asia/Singapore');
const sgDateServer = getServerNormalizedDate(testDate);

assert.strictEqual(sgDateClient, '2026-09-02', 'Client Singapore date must be 2026-09-02');
assert.strictEqual(sgDateHelper, '2026-09-02', 'Helper Singapore date must be 2026-09-02');
assert.strictEqual(sgDateServer, '2026-09-02', 'Server Singapore date must be 2026-09-02');
console.log('  ✓ 2. Date normalization in UTC+8 verified without skew');

// 3. International Multi-Timezone Architecture Support
console.log('--- Section 3: Multi-Timezone Support ---');
// 2026-09-01 15:30:00 UTC:
// - In Bangkok (UTC+7): 22:30 on 2026-09-01
// - In Singapore (UTC+8): 23:30 on 2026-09-01
// - In Tokyo (UTC+9): 00:30 on 2026-09-02
const instant = new Date('2026-09-01T15:30:00.000Z');

const bangkokDate = getCalendarDateInTimezone(instant, 'Asia/Bangkok');
const sgDate = getCalendarDateInTimezone(instant, 'Asia/Singapore');
const tokyoDate = getCalendarDateInTimezone(instant, 'Asia/Tokyo');

assert.strictEqual(bangkokDate, '2026-09-01', 'Bangkok date should be 2026-09-01');
assert.strictEqual(sgDate, '2026-09-01', 'Singapore date should be 2026-09-01');
assert.strictEqual(tokyoDate, '2026-09-02', 'Tokyo date should be 2026-09-02');
console.log('  ✓ 3. Multi-country timezones calculate distinct calendar dates correctly');

// 4. Lifecycle Evaluation with event_timezone fallback to Asia/Singapore
console.log('--- Section 4: Event Lifecycle Timezone Sensitivity ---');
const event = {
  id: 'event-tz-test',
  start_date: '2026-09-02',
  end_date: '2026-09-02',
  payment_status: 'PAID',
  status: 'scheduled',
};

// At instant 2026-09-01 15:30:00 UTC:
// - Singapore (UTC+8): 2026-09-01 23:30:00 (Setup Day -> scheduled)
// - Tokyo (UTC+9): 2026-09-02 00:30:00 (Live Day -> live)
const defaultClientStatus = calculateClientStatus(event, instant);
const defaultServerStatus = calculateServerStatus(event, instant);
assert.strictEqual(defaultClientStatus, 'scheduled', 'Default client status must be scheduled');
assert.strictEqual(defaultServerStatus, 'scheduled', 'Default server status must be scheduled');

const tokyoEvent = { ...event, event_timezone: 'Asia/Tokyo' };
const tokyoClientStatus = calculateClientStatus(tokyoEvent, instant);
const tokyoServerStatus = calculateServerStatus(tokyoEvent, instant);
assert.strictEqual(tokyoClientStatus, 'live', 'Tokyo event client status must be live');
assert.strictEqual(tokyoServerStatus, 'live', 'Tokyo event server status must be live');

assert.strictEqual(deriveClientLifecycleStatus(event, instant), 'SCHEDULED');
assert.strictEqual(deriveServerLifecycleStatus(event, instant), 'SCHEDULED');
assert.strictEqual(deriveClientLifecycleStatus(tokyoEvent, instant), 'LIVE');
assert.strictEqual(deriveServerLifecycleStatus(tokyoEvent, instant), 'LIVE');
console.log('  ✓ 4. Lifecycle state calculation evaluates against event timezone and defaults to Asia/Singapore');

console.log('======================================================');
console.log('All Platform Business Timezone Tests Passed Successfully!');
console.log('======================================================');
