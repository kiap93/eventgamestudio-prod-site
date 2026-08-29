import assert from 'node:assert';
import {
  getSingaporeCalendarDate,
  getSingaporeDateTime,
  isWithinImmersiveFullscreenWindow,
  addDaysToDateString,
  extractDateString,
} from '../../src/lib/dateUtils';

console.log('======================================================');
console.log(' RUNNING SINGAPORE IMMERSIVE FULLSCREEN DATE TESTS');
console.log('======================================================');

// Helper to construct a Date object for a specific Singapore time (UTC+8)
// Example: singaporeDate(2026, 8, 28, 23, 59, 59) -> UTC is 2026-08-28 15:59:59
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

const eventDate = '2026-08-30';

console.log('\n--- Test Group 1: Exact Singapore Date Window for 2026-08-30 ---');

// Test 1: 2026-08-28 23:59:59 SG (Two days before)
const dAug28_2359 = createSingaporeDate(2026, 8, 28, 23, 59, 59);
const sgAug28 = getSingaporeCalendarDate(dAug28_2359);
const winAug28 = isWithinImmersiveFullscreenWindow(eventDate, dAug28_2359);
assert.strictEqual(sgAug28, '2026-08-28', 'SG date must be 2026-08-28');
assert.strictEqual(winAug28, false, 'Aug 28 (two days before) must NOT be in fullscreen window');
console.log('  ✓ PASS: Aug 28 23:59:59 SG is outside window (isWithinEventDateWindow = false)');

// Test 2: 2026-08-29 00:00:00 SG (One day before - START OF WINDOW)
const dAug29_0000 = createSingaporeDate(2026, 8, 29, 0, 0, 0);
const sgAug29_start = getSingaporeCalendarDate(dAug29_0000);
const winAug29_start = isWithinImmersiveFullscreenWindow(eventDate, dAug29_0000);
assert.strictEqual(sgAug29_start, '2026-08-29', 'SG date must be 2026-08-29');
assert.strictEqual(winAug29_start, true, 'Aug 29 00:00:00 SG must be inside fullscreen window');
console.log('  ✓ PASS: Aug 29 00:00:00 SG is inside window (isWithinEventDateWindow = true)');

// Test 3: 2026-08-29 15:30:00 SG (One day before - afternoon)
const dAug29_1530 = createSingaporeDate(2026, 8, 29, 15, 30, 0);
const winAug29_mid = isWithinImmersiveFullscreenWindow(eventDate, dAug29_1530);
assert.strictEqual(winAug29_mid, true, 'Aug 29 afternoon must be inside window');
console.log('  ✓ PASS: Aug 29 afternoon is inside window (isWithinEventDateWindow = true)');

// Test 4: 2026-08-30 00:00:00 SG (Event Date - start)
const dAug30_0000 = createSingaporeDate(2026, 8, 30, 0, 0, 0);
const sgAug30 = getSingaporeCalendarDate(dAug30_0000);
const winAug30_start = isWithinImmersiveFullscreenWindow(eventDate, dAug30_0000);
assert.strictEqual(sgAug30, '2026-08-30', 'SG date must be 2026-08-30');
assert.strictEqual(winAug30_start, true, 'Aug 30 00:00:00 SG must be inside window');
console.log('  ✓ PASS: Aug 30 00:00:00 SG (Event Date start) is inside window (isWithinEventDateWindow = true)');

// Test 5: 2026-08-30 23:59:59 SG (Event Date - end)
const dAug30_2359 = createSingaporeDate(2026, 8, 30, 23, 59, 59);
const winAug30_end = isWithinImmersiveFullscreenWindow(eventDate, dAug30_2359);
assert.strictEqual(winAug30_end, true, 'Aug 30 23:59:59 SG must be inside window');
console.log('  ✓ PASS: Aug 30 23:59:59 SG (Event Date end) is inside window (isWithinEventDateWindow = true)');

// Test 6: 2026-08-31 00:00:00 SG (One day after - END OF WINDOW)
const dAug31_0000 = createSingaporeDate(2026, 8, 31, 0, 0, 0);
const sgAug31 = getSingaporeCalendarDate(dAug31_0000);
const winAug31 = isWithinImmersiveFullscreenWindow(eventDate, dAug31_0000);
assert.strictEqual(sgAug31, '2026-08-31', 'SG date must be 2026-08-31');
assert.strictEqual(winAug31, false, 'Aug 31 (one day after) must NOT be in fullscreen window');
console.log('  ✓ PASS: Aug 31 00:00:00 SG (Day after event) is outside window (isWithinEventDateWindow = false)');

console.log('\n--- Test Group 2: Combined Business Formula Matrix ---');

interface TestCase {
  name: string;
  payment_status: string;
  simulatedDate: Date;
  expectedCanUseImmersive: boolean;
  expectedHeaderVisibleInFullscreen: boolean;
}

const matrix: TestCase[] = [
  {
    name: 'TEST A: PAID + Aug 29 (One day before)',
    payment_status: 'PAID',
    simulatedDate: dAug29_1530,
    expectedCanUseImmersive: true,
    expectedHeaderVisibleInFullscreen: false, // Header hidden
  },
  {
    name: 'TEST B: PAID + Aug 30 (Event date)',
    payment_status: 'PAID',
    simulatedDate: dAug30_0000,
    expectedCanUseImmersive: true,
    expectedHeaderVisibleInFullscreen: false, // Header hidden
  },
  {
    name: 'TEST C: PAID + Aug 28 (Two days before)',
    payment_status: 'PAID',
    simulatedDate: dAug28_2359,
    expectedCanUseImmersive: false,
    expectedHeaderVisibleInFullscreen: true, // Header visible
  },
  {
    name: 'TEST D: PAID + Aug 31 (One day after)',
    payment_status: 'PAID',
    simulatedDate: dAug31_0000,
    expectedCanUseImmersive: false,
    expectedHeaderVisibleInFullscreen: true, // Header visible
  },
  {
    name: 'TEST E: UNPAID + Aug 29 (Valid date window)',
    payment_status: 'UNPAID',
    simulatedDate: dAug29_1530,
    expectedCanUseImmersive: false,
    expectedHeaderVisibleInFullscreen: true, // Header visible
  },
  {
    name: 'TEST E2: PENDING_PAYMENT + Aug 30 (Valid date window)',
    payment_status: 'PENDING_PAYMENT',
    simulatedDate: dAug30_0000,
    expectedCanUseImmersive: false,
    expectedHeaderVisibleInFullscreen: true, // Header visible
  },
];

for (const tc of matrix) {
  const isPaidEvent = String(tc.payment_status || '').toUpperCase() === 'PAID';
  const isWithinEventDateWindow = isWithinImmersiveFullscreenWindow(eventDate, tc.simulatedDate);
  const canUseImmersiveFullscreen = isPaidEvent && isWithinEventDateWindow;

  // In fullscreen (isFullscreen = true):
  const isFullscreen = true;
  const isImmersiveFullscreen = isFullscreen && canUseImmersiveFullscreen;
  const showEventHeader = !isImmersiveFullscreen;

  assert.strictEqual(canUseImmersiveFullscreen, tc.expectedCanUseImmersive, `${tc.name}: canUseImmersiveFullscreen`);
  assert.strictEqual(showEventHeader, tc.expectedHeaderVisibleInFullscreen, `${tc.name}: showEventHeader in fullscreen`);
  console.log(`  ✓ PASS: ${tc.name} -> canUseImmersive=${canUseImmersiveFullscreen}, headerVisible=${showEventHeader}`);
}

console.log('\n--- Test Group 3: Month Boundary Transitions ---');
// Event on 2026-09-01 (Sept 1) -> Window is Aug 31 (2026-08-31) and Sept 1 (2026-09-01)
const sept1Event = '2026-09-01';
const dAug30_sg = createSingaporeDate(2026, 8, 30, 12, 0, 0);
const dAug31_sg = createSingaporeDate(2026, 8, 31, 12, 0, 0);
const dSept1_sg = createSingaporeDate(2026, 9, 1, 12, 0, 0);
const dSept2_sg = createSingaporeDate(2026, 9, 2, 12, 0, 0);

assert.strictEqual(isWithinImmersiveFullscreenWindow(sept1Event, dAug30_sg), false);
assert.strictEqual(isWithinImmersiveFullscreenWindow(sept1Event, dAug31_sg), true);
assert.strictEqual(isWithinImmersiveFullscreenWindow(sept1Event, dSept1_sg), true);
assert.strictEqual(isWithinImmersiveFullscreenWindow(sept1Event, dSept2_sg), false);
console.log('  ✓ PASS: Month boundary: Aug 31 and Sept 1 are within window for Sept 1 event');

console.log('\n======================================================');
console.log(' ALL SINGAPORE DATE & IMMERSIVE FULLSCREEN TESTS PASSED');
console.log('======================================================\n');
