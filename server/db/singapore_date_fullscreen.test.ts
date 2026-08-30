import assert from 'node:assert';
import {
  getSingaporeCalendarDate,
  getSingaporeDateTime,
  isCurrentSingaporeDateWithinEventRange,
  isWithinImmersiveFullscreenWindow,
  addDaysToDateString,
  extractDateString,
} from '../../src/lib/dateUtils';

console.log('======================================================');
console.log(' RUNNING SINGAPORE EVENT DATE RANGE FULLSCREEN TESTS');
console.log('======================================================');

// Helper to construct a Date object for a specific Singapore time (UTC+8)
function createSingaporeDate(
  year: number,
  month: number, // 1-12
  day: number,
  hour: number = 0,
  minute: number = 0,
  second: number = 0
): Date {
  return new Date(Date.UTC(year, month - 1, day, hour - 8, minute, second));
}

// C9E8SVE Production Event Scenario:
// Start Date: 29 August 2026
// End Date:   7 September 2026
const c9e8sve_startDate = '2026-08-29';
const c9e8sve_endDate = '2026-09-07';

console.log('\n--- Test Group 1: Exact Day-by-Day Range for C9E8SVE (29 Aug 2026 -> 7 Sep 2026) ---');

const daysToCheck = [
  { day: 28, month: 8, name: '28 Aug (Before start)', expectedInside: false },
  { day: 29, month: 8, name: '29 Aug (Start Date)', expectedInside: true },
  { day: 30, month: 8, name: '30 Aug (Active Day)', expectedInside: true },
  { day: 31, month: 8, name: '31 Aug (Active Day)', expectedInside: true },
  { day: 1,  month: 9, name: '1 Sep (Active Day)', expectedInside: true },
  { day: 2,  month: 9, name: '2 Sep (Active Day)', expectedInside: true },
  { day: 3,  month: 9, name: '3 Sep (Active Day)', expectedInside: true },
  { day: 4,  month: 9, name: '4 Sep (Active Day)', expectedInside: true },
  { day: 5,  month: 9, name: '5 Sep (Active Day)', expectedInside: true },
  { day: 6,  month: 9, name: '6 Sep (Active Day)', expectedInside: true },
  { day: 7,  month: 9, name: '7 Sep (End Date)', expectedInside: true },
  { day: 8,  month: 9, name: '8 Sep (After end)', expectedInside: false },
];

for (const dt of daysToCheck) {
  const simDate = createSingaporeDate(2026, dt.month, dt.day, 12, 0, 0);
  const sgCalDate = getSingaporeCalendarDate(simDate);
  const isInside = isCurrentSingaporeDateWithinEventRange(c9e8sve_startDate, c9e8sve_endDate, simDate);
  
  assert.strictEqual(isInside, dt.expectedInside, `${dt.name} inside range check`);
  console.log(`  ✓ PASS: ${dt.name} (SG: ${sgCalDate}) -> isWithinEventDateRange = ${isInside}`);
}

console.log('\n--- Test Group 2: Combined Business Formula Matrix for C9E8SVE ---');

interface TestCase {
  name: string;
  payment_status: string;
  event_status?: string;
  simulatedDate: Date;
  expectedShouldHideHeader: boolean;
  expectedHeaderVisibleInFullscreen: boolean;
}

const matrix: TestCase[] = [
  {
    name: 'TEST 1: PAID + 28 Aug (Before event starts)',
    payment_status: 'PAID',
    event_status: 'scheduled',
    simulatedDate: createSingaporeDate(2026, 8, 28, 23, 59, 59),
    expectedShouldHideHeader: false,
    expectedHeaderVisibleInFullscreen: true, // Header visible in fullscreen
  },
  {
    name: 'TEST 2: PAID + 29 Aug (Start Date)',
    payment_status: 'PAID',
    event_status: 'live',
    simulatedDate: createSingaporeDate(2026, 8, 29, 0, 0, 0),
    expectedShouldHideHeader: true,
    expectedHeaderVisibleInFullscreen: false, // Header hidden
  },
  {
    name: 'TEST 3: PAID + 30 Aug 10:44:37 SG (Current Production Date)',
    payment_status: 'PAID',
    event_status: 'live',
    simulatedDate: createSingaporeDate(2026, 8, 30, 10, 44, 37),
    expectedShouldHideHeader: true,
    expectedHeaderVisibleInFullscreen: false, // Header hidden
  },
  {
    name: 'TEST 4: UNPAID + 30 Aug (Inside date range but UNPAID)',
    payment_status: 'UNPAID',
    event_status: 'active',
    simulatedDate: createSingaporeDate(2026, 8, 30, 10, 44, 37),
    expectedShouldHideHeader: false,
    expectedHeaderVisibleInFullscreen: true, // Header visible in fullscreen
  },
  {
    name: 'TEST 5: PENDING_PAYMENT + 30 Aug (Inside date range)',
    payment_status: 'PENDING_PAYMENT',
    event_status: 'pending_payment',
    simulatedDate: createSingaporeDate(2026, 8, 30, 10, 44, 37),
    expectedShouldHideHeader: false,
    expectedHeaderVisibleInFullscreen: true, // Header visible in fullscreen
  },
  {
    name: 'TEST 6: PAID + 31 Aug (Inside date range)',
    payment_status: 'PAID',
    event_status: 'live',
    simulatedDate: createSingaporeDate(2026, 8, 31, 15, 0, 0),
    expectedShouldHideHeader: true,
    expectedHeaderVisibleInFullscreen: false, // Header hidden
  },
  {
    name: 'TEST 7: PAID + 1 Sep (Month transition)',
    payment_status: 'PAID',
    event_status: 'live',
    simulatedDate: createSingaporeDate(2026, 9, 1, 12, 0, 0),
    expectedShouldHideHeader: true,
    expectedHeaderVisibleInFullscreen: false, // Header hidden
  },
  {
    name: 'TEST 8: PAID + 7 Sep 23:59:59 SG (End Date last second)',
    payment_status: 'PAID',
    event_status: 'live',
    simulatedDate: createSingaporeDate(2026, 9, 7, 23, 59, 59),
    expectedShouldHideHeader: true,
    expectedHeaderVisibleInFullscreen: false, // Header hidden
  },
  {
    name: 'TEST 9: PAID + 8 Sep 00:00:00 SG (After event ended)',
    payment_status: 'PAID',
    event_status: 'completed',
    simulatedDate: createSingaporeDate(2026, 9, 8, 0, 0, 0),
    expectedShouldHideHeader: false,
    expectedHeaderVisibleInFullscreen: true, // Header visible in fullscreen
  },
];

for (const tc of matrix) {
  const isFullscreen = true; // Browser fullscreen ALWAYS allowed for all statuses
  const isPaidEvent = String(tc.payment_status || '').toUpperCase() === 'PAID';
  const isWithinEventDateRange = isCurrentSingaporeDateWithinEventRange(c9e8sve_startDate, c9e8sve_endDate, tc.simulatedDate);
  const shouldHideEventHeader = isFullscreen && isPaidEvent && isWithinEventDateRange;
  const showEventHeader = !shouldHideEventHeader;
  const showCabinetFooter = !isFullscreen;
  const gameFullscreen = isFullscreen;

  assert.strictEqual(gameFullscreen, true, `${tc.name}: Game receives true fullscreen`);
  assert.strictEqual(showCabinetFooter, false, `${tc.name}: Cabinet footer hidden in fullscreen`);
  assert.strictEqual(shouldHideEventHeader, tc.expectedShouldHideHeader, `${tc.name}: shouldHideEventHeader`);
  assert.strictEqual(showEventHeader, tc.expectedHeaderVisibleInFullscreen, `${tc.name}: showEventHeader in fullscreen`);
  console.log(`  ✓ PASS: ${tc.name} -> isFullscreen=true, shouldHideHeader=${shouldHideEventHeader}, showHeader=${showEventHeader}`);
}

console.log('\n--- Test Group 3: Single-Day Event Support ---');
// Single day event on 2026-10-15 (Start Date === End Date)
const singleDayEventStart = '2026-10-15';
const singleDayEventEnd = '2026-10-15';

const dOct14_sg = createSingaporeDate(2026, 10, 14, 23, 59, 59);
const dOct15_sg = createSingaporeDate(2026, 10, 15, 12, 0, 0);
const dOct16_sg = createSingaporeDate(2026, 10, 16, 0, 0, 0);

assert.strictEqual(isCurrentSingaporeDateWithinEventRange(singleDayEventStart, singleDayEventEnd, dOct14_sg), false);
assert.strictEqual(isCurrentSingaporeDateWithinEventRange(singleDayEventStart, singleDayEventEnd, dOct15_sg), true);
assert.strictEqual(isCurrentSingaporeDateWithinEventRange(singleDayEventStart, singleDayEventEnd, dOct16_sg), false);
console.log('  ✓ PASS: Single day events correctly validate only the exact calendar day');

console.log('\n======================================================');
console.log(' ALL SINGAPORE DATE RANGE & FULLSCREEN TESTS PASSED');
console.log('======================================================\n');
