import {
  getOrientation,
  calculateResponsiveUiScale,
  getEffectiveGameLayout,
  LANDSCAPE_DESIGN_WIDTH,
  LANDSCAPE_DESIGN_HEIGHT,
  PORTRAIT_DESIGN_WIDTH,
  PORTRAIT_DESIGN_HEIGHT,
} from './responsive';
import { normalizeGameLayout, GameLayoutConfig } from './layout';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  ✓ ${msg}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${msg}`);
    failed++;
  }
}

function assertCloseTo(val: number, expected: number, delta = 0.05, msg: string) {
  assert(Math.abs(val - expected) <= delta, `${msg} (got ${val}, expected ~${expected})`);
}

console.log('======================================================');
console.log('Running Responsive Game System Acceptance Tests');
console.log('======================================================');

// getOrientation
console.log('\n[getOrientation Tests]');
assert(getOrientation(1920, 1080, 'auto') === 'landscape', 'detects landscape when width > height in auto mode');
assert(getOrientation(1024, 768, 'auto') === 'landscape', 'detects 1024x768 as landscape');
assert(getOrientation(390, 844, 'auto') === 'portrait', 'detects 390x844 as portrait');
assert(getOrientation(412, 915, 'auto') === 'portrait', 'detects 412x915 as portrait');
assert(getOrientation(768, 1024, 'auto') === 'portrait', 'detects 768x1024 as portrait');
assert(getOrientation(390, 844, 'landscape') === 'landscape', 'honors forced landscape preference');
assert(getOrientation(1920, 1080, 'portrait') === 'portrait', 'honors forced portrait preference');

// calculateResponsiveUiScale
console.log('\n[calculateResponsiveUiScale Tests]');
assertCloseTo(calculateResponsiveUiScale(1920, 1080, false), 1.875, 0.05, 'scales correctly for 1920x1080 in landscape');
assertCloseTo(calculateResponsiveUiScale(1024, 576, false), 1.0, 0.05, 'scales correctly for 1024x576 in landscape');
assertCloseTo(calculateResponsiveUiScale(390, 844, true), 390 / PORTRAIT_DESIGN_WIDTH, 0.05, 'scales correctly for mobile portrait 390x844');
assert(calculateResponsiveUiScale(100, 100, false) >= 0.1, 'respects min scale bound');
assert(calculateResponsiveUiScale(10000, 10000, false) <= 4.0, 'respects max scale bound');

// getEffectiveGameLayout
console.log('\n[getEffectiveGameLayout Tests]');
const baseLayout: GameLayoutConfig = normalizeGameLayout(undefined, 'memory-match');
const effectiveLandscape = getEffectiveGameLayout(baseLayout, false, 'memory-match');
assert(effectiveLandscape.orientation === 'auto', 'returns auto orientation in landscape');
assert(effectiveLandscape.scoreHud?.x === baseLayout.scoreHud?.x, 'returns exact base scoreHud x');
assert(effectiveLandscape.scoreHud?.y === baseLayout.scoreHud?.y, 'returns exact base scoreHud y');

const effectivePortrait = getEffectiveGameLayout(baseLayout, true, 'memory-match');
assert(effectivePortrait.scoreHud?.x === 4, 'Memory match portrait scoreHud x is 4');
assert(effectivePortrait.scoreHud?.y === 9, 'Memory match portrait scoreHud y is 9');
assert(effectivePortrait.timer?.x === 52, 'Memory match portrait timer x is 52');
assert(effectivePortrait.timer?.y === 9, 'Memory match portrait timer y is 9');
assert(effectivePortrait.memoryCardBoard?.x === 50, 'Memory match portrait board x is 50');
assert(effectivePortrait.memoryCardBoard?.y === 55, 'Memory match portrait board y is 55');

const catchBase = normalizeGameLayout(undefined, 'catch-brand');
const effectiveCatch = getEffectiveGameLayout(catchBase, true, 'catch-brand');
assert(effectiveCatch.scoreHud?.x === 4, 'Catch-brand portrait scoreHud x is 4');
assert(effectiveCatch.scoreHud?.y === 10, 'Catch-brand portrait scoreHud y is 10');
assert(effectiveCatch.footerSponsor?.y === 94, 'Catch-brand portrait footerSponsor y is 94');

const customThemeLayout: GameLayoutConfig = {
  ...baseLayout,
  portraitLayout: {
    scoreHud: { visible: true, x: 25, y: 10, width: 35 },
    timer: { visible: true, x: 75, y: 10, width: 30 },
  },
};
const effectiveCustom = getEffectiveGameLayout(customThemeLayout, true, 'memory-match');
assert(effectiveCustom.scoreHud?.x === 25, 'custom scoreHud x is 25');
assert(effectiveCustom.timer?.x === 75, 'custom timer x is 75');

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
