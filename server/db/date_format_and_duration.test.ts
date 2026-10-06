import assert from 'node:assert';
import * as clientDateUtils from '../../src/lib/dateUtils.js';
import * as serverDateUtils from './platformSettings.js';

console.log('=================================================================');
console.log('--- RUNNING DATE FORMAT, DURATION & PARITY TEST SUITE ---');
console.log('=================================================================');

// 1. VERIFY CLIENT DATE UTILS
console.log('1. Testing client dateUtils.ts...');
assert.strictEqual(
  clientDateUtils.formatDateApi('10/05/2026'),
  '2026-05-10',
  'formatDateApi("10/05/2026") must be "2026-05-10" (10 May 2026)'
);
assert.strictEqual(
  clientDateUtils.formatDateDisplay('2026-05-10'),
  '10/05/2026',
  'formatDateDisplay("2026-05-10") must be "10/05/2026"'
);
assert.strictEqual(
  clientDateUtils.calculateEventCalendarDays('2026-05-10', '2026-05-10'),
  1,
  '2026-05-10 -> 2026-05-10 must be 1 day'
);
assert.strictEqual(
  clientDateUtils.calculateEventCalendarDays('2026-05-10', '2026-05-12'),
  3,
  '2026-05-10 -> 2026-05-12 must be 3 days'
);
assert.strictEqual(
  clientDateUtils.calculateEventCalendarDays('2026-05-10', '2026-05-16'),
  7,
  '2026-05-10 -> 2026-05-16 must be 7 days'
);
assert.strictEqual(
  clientDateUtils.calculateEventCalendarDays('2026-05-10', '2026-05-17'),
  8,
  '2026-05-10 -> 2026-05-17 must be 8 days'
);
assert.strictEqual(
  clientDateUtils.calculateEventCalendarDays('2026-10-05', '2026-10-05'),
  1,
  '2026-10-05 -> 2026-10-05 must be 1 day'
);
assert.strictEqual(
  clientDateUtils.calculateEventCalendarDays('2026-10-05', '2026-10-07'),
  3,
  '2026-10-05 -> 2026-10-07 must be 3 days'
);
assert.strictEqual(
  clientDateUtils.calculateEventCalendarDays('2026-12-31', '2027-01-01'),
  2,
  '2026-12-31 -> 2027-01-01 must be 2 days (year boundary)'
);
assert.strictEqual(
  clientDateUtils.calculateEventCalendarDays('2028-02-28', '2028-02-29'),
  2,
  '2028-02-28 -> 2028-02-29 must be 2 days (leap year)'
);
assert.strictEqual(
  clientDateUtils.calculateEventCalendarDays('2026-01-01', '2026-01-31'),
  31,
  '2026-01-01 -> 2026-01-31 must be 31 days'
);

// Verify explicit parsing for 10 May 2026
const parsedDateOnly = clientDateUtils.parseDateOnly('2026-05-10');
assert.strictEqual(parsedDateOnly.getFullYear(), 2026, 'parseDateOnly year must be 2026');
assert.strictEqual(parsedDateOnly.getMonth(), 4, 'parseDateOnly month must be 4 (May)');
assert.strictEqual(parsedDateOnly.getDate(), 10, 'parseDateOnly date must be 10');

const parsedDisplay = clientDateUtils.parseDisplayDate('10/05/2026');
assert.strictEqual(parsedDisplay.getFullYear(), 2026, 'parseDisplayDate year must be 2026');
assert.strictEqual(parsedDisplay.getMonth(), 4, 'parseDisplayDate month must be 4 (May)');
assert.strictEqual(parsedDisplay.getDate(), 10, 'parseDisplayDate date must be 10');

// Verify getCalendarDateInTimezone never flips month/day
const may10 = new Date(2026, 4, 10, 12, 0, 0);
assert.strictEqual(
  clientDateUtils.getCalendarDateInTimezone(may10, 'Asia/Singapore'),
  '2026-05-10',
  'getCalendarDateInTimezone for 10 May 2026 must be 2026-05-10'
);

// Verify getTodayDateString deterministic reference date flow
const refDateMay10 = new Date('2026-05-10T12:00:00Z');
const todaySingapore = clientDateUtils.getTodayDateString('Asia/Singapore', refDateMay10);
assert.strictEqual(
  todaySingapore,
  '2026-05-10',
  'getTodayDateString("Asia/Singapore", refDateMay10) must return "2026-05-10"'
);
assert.strictEqual(
  clientDateUtils.formatDateDisplay(todaySingapore),
  '10/05/2026',
  'formatDateDisplay of todaySingapore must be "10/05/2026"'
);

// Verify window.__EVENT_REFERENCE_DATE__ behavior for dev/testing
(globalThis as any).window = (globalThis as any).window || {};
(globalThis as any).window.__EVENT_REFERENCE_DATE__ = '2026-05-10';
const todayFromWindowRef = clientDateUtils.getTodayDateString('Asia/Singapore');
assert.strictEqual(
  todayFromWindowRef,
  '2026-05-10',
  'getTodayDateString with window.__EVENT_REFERENCE_DATE__ = "2026-05-10" must return "2026-05-10"'
);
delete (globalThis as any).window.__EVENT_REFERENCE_DATE__;

// Verify window.__ENV__.VITE_EVENT_REFERENCE_DATE behavior (injected via /env.js)
(globalThis as any).window.__ENV__ = { VITE_EVENT_REFERENCE_DATE: '2026-05-10' };
const todayFromEnvJs = clientDateUtils.getTodayDateString('Asia/Singapore');
assert.strictEqual(
  todayFromEnvJs,
  '2026-05-10',
  'getTodayDateString with window.__ENV__.VITE_EVENT_REFERENCE_DATE = "2026-05-10" must return "2026-05-10"'
);

// Verify when reference date is removed, it automatically reverts to real system date
delete (globalThis as any).window.__ENV__.VITE_EVENT_REFERENCE_DATE;
const savedProcEnv = process.env.VITE_EVENT_REFERENCE_DATE;
const savedImportEnv = import.meta.env?.VITE_EVENT_REFERENCE_DATE;
delete process.env.VITE_EVENT_REFERENCE_DATE;
if (import.meta.env) delete import.meta.env.VITE_EVENT_REFERENCE_DATE;

const realCurrentToday = clientDateUtils.getTodayDateString('Asia/Singapore');
const expectedRealToday = clientDateUtils.getCalendarDateInTimezone(new Date(), 'Asia/Singapore');
assert.strictEqual(
  realCurrentToday,
  expectedRealToday,
  'When development reference date is removed, getTodayDateString must use real current date'
);

if (savedImportEnv && import.meta.env) import.meta.env.VITE_EVENT_REFERENCE_DATE = savedImportEnv;
if (savedProcEnv) process.env.VITE_EVENT_REFERENCE_DATE = savedProcEnv;

// Verify parseDisplayDate correctly parses "10/05/2026" as 10 May 2026
const parsedMay10 = clientDateUtils.parseDisplayDate('10/05/2026');
assert.strictEqual(parsedMay10.getFullYear(), 2026, 'Year must be 2026');
assert.strictEqual(parsedMay10.getMonth(), 4, 'Month index must be 4 (May)');
assert.strictEqual(parsedMay10.getDate(), 10, 'Day must be 10');

// Verify parseDateOnly correctly parses "2026-05-10" as 10 May 2026
const parsedDateOnlyMay10 = clientDateUtils.parseDateOnly('2026-05-10');
assert.strictEqual(parsedDateOnlyMay10.getFullYear(), 2026, 'Year must be 2026');
assert.strictEqual(parsedDateOnlyMay10.getMonth(), 4, 'Month index must be 4 (May)');
assert.strictEqual(parsedDateOnlyMay10.getDate(), 10, 'Day must be 10');

// Verify CustomDatePicker input expectations for 10 May 2026
const partsYmd = todaySingapore.split('-');
assert.strictEqual(partsYmd[0], '2026', 'Year must be 2026');
assert.strictEqual(partsYmd[1], '05', 'Month must be 05 (May)');
assert.strictEqual(partsYmd[2], '10', 'Day must be 10');
assert.strictEqual(
  clientDateUtils.calculateEventCalendarDays(todaySingapore, todaySingapore),
  1,
  'Default 1-day event duration must be 1 day'
);

// Display format inputs: DD/MM/YYYY inputs into calculateEventCalendarDays
assert.strictEqual(
  clientDateUtils.calculateEventCalendarDays('10/05/2026', '10/05/2026'),
  1,
  '10/05/2026 -> 10/05/2026 must be 1 day'
);
assert.strictEqual(
  clientDateUtils.calculateEventCalendarDays('10/05/2026', '12/05/2026'),
  3,
  '10/05/2026 -> 12/05/2026 must be 3 days'
);
assert.strictEqual(
  clientDateUtils.calculateEventCalendarDays('05/10/2026', '07/10/2026'),
  3,
  '05/10/2026 -> 07/10/2026 must be 3 days'
);
assert.strictEqual(
  clientDateUtils.calculateEventCalendarDays('31/12/2026', '01/01/2027'),
  2,
  '31/12/2026 -> 01/01/2027 must be 2 days'
);
assert.strictEqual(
  clientDateUtils.calculateEventCalendarDays('28/02/2028', '29/02/2028'),
  2,
  '28/02/2028 -> 29/02/2028 must be 2 days'
);
console.log('✓ All client dateUtils assertions passed.');

// 2. VERIFY SERVER DATE UTILS & PARITY
console.log('2. Testing server platformSettings.ts & parity with client...');
assert.strictEqual(
  serverDateUtils.formatDateApi('10/05/2026'),
  '2026-05-10',
  'Server formatDateApi("10/05/2026") must be "2026-05-10"'
);
assert.strictEqual(
  serverDateUtils.formatDateDisplay('2026-05-10'),
  '10/05/2026',
  'Server formatDateDisplay("2026-05-10") must be "10/05/2026"'
);
assert.strictEqual(
  serverDateUtils.calculateEventCalendarDays('2026-05-10', '2026-05-10'),
  1
);
assert.strictEqual(
  serverDateUtils.calculateEventCalendarDays('2026-05-10', '2026-05-12'),
  3
);
assert.strictEqual(
  serverDateUtils.calculateEventCalendarDays('2026-10-05', '2026-10-05'),
  1
);
assert.strictEqual(
  serverDateUtils.calculateEventCalendarDays('2026-10-05', '2026-10-07'),
  3
);
assert.strictEqual(
  serverDateUtils.calculateEventCalendarDays('2026-12-31', '2027-01-01'),
  2
);
assert.strictEqual(
  serverDateUtils.calculateEventCalendarDays('2028-02-28', '2028-02-29'),
  2
);
assert.strictEqual(
  serverDateUtils.calculateEventCalendarDays('2026-01-01', '2026-01-31'),
  31
);
assert.strictEqual(
  serverDateUtils.calculateEventCalendarDays('10/05/2026', '12/05/2026'),
  3
);

// 3. PARITY COMPARISON ACROSS A RANGE OF DATES
console.log('3. Checking client/server parity across test date matrix...');
const testDates = [
  ['2026-05-10', '2026-05-10'],
  ['2026-05-10', '2026-05-11'],
  ['2026-05-10', '2026-05-12'],
  ['2026-05-10', '2026-05-16'],
  ['2026-05-10', '2026-05-17'],
  ['2026-09-01', '2026-09-02'],
  ['2026-10-05', '2026-10-05'],
  ['2026-10-05', '2026-10-07'],
  ['2026-12-31', '2027-01-01'],
  ['2028-02-28', '2028-02-29'],
  ['10/05/2026', '12/05/2026'],
];

for (const [d1, d2] of testDates) {
  const clientDays = clientDateUtils.calculateEventCalendarDays(d1, d2);
  const serverDays = serverDateUtils.calculateEventCalendarDays(d1, d2);
  assert.strictEqual(
    clientDays,
    serverDays,
    `Client and server duration must match for ${d1} -> ${d2}`
  );
  assert.strictEqual(
    clientDateUtils.formatDateApi(d1),
    serverDateUtils.formatDateApi(d1),
    `Client and server formatDateApi must match for ${d1}`
  );
  assert.strictEqual(
    clientDateUtils.formatDateDisplay(d1),
    serverDateUtils.formatDateDisplay(d1),
    `Client and server formatDateDisplay must match for ${d1}`
  );
}
console.log('✓ Client and server date calculations exhibit 100% parity.');

// 4. VERIFY PRICING CALCULATION ACCURACY
console.log('4. Verifying event pricing calculation across durations...');
// 10 May -> 10 May = 1 day
assert.strictEqual(clientDateUtils.calculateEventCalendarDays('2026-05-10', '2026-05-10'), 1);
// 10 May -> 11 May = 2 days
assert.strictEqual(clientDateUtils.calculateEventCalendarDays('2026-05-10', '2026-05-11'), 2);
// 10 May -> 12 May = 3 days
assert.strictEqual(clientDateUtils.calculateEventCalendarDays('2026-05-10', '2026-05-12'), 3);
// 10 May -> 16 May = 7 days
assert.strictEqual(clientDateUtils.calculateEventCalendarDays('2026-05-10', '2026-05-16'), 7);
// 10 May -> 17 May = 8 days
assert.strictEqual(clientDateUtils.calculateEventCalendarDays('2026-05-10', '2026-05-17'), 8);

console.log('=================================================================');
console.log('ALL DATE FORMAT, DURATION & PARITY TESTS PASSED!');
console.log('=================================================================');
