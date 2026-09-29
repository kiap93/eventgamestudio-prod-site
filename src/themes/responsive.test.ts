import {
  getOrientation,
  calculateResponsiveUiScale,
  getEffectiveGameLayout,
  LANDSCAPE_DESIGN_WIDTH,
  LANDSCAPE_DESIGN_HEIGHT,
  PORTRAIT_DESIGN_WIDTH,
  PORTRAIT_DESIGN_HEIGHT,
} from './responsive';
import { normalizeGameLayout, GameLayoutConfig, calculateDraggedPosition } from './layout';

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
assert(effectivePortrait.scoreHud?.x === 2, 'Memory match portrait scoreHud x is 2');
assert(effectivePortrait.scoreHud?.y === 2.0, 'Memory match portrait scoreHud y is 2.0');
assert(effectivePortrait.movesHud?.x === 19.5, 'Memory match portrait movesHud x is 19.5');
assert(effectivePortrait.pairsHud?.x === 37, 'Memory match portrait pairsHud x is 37');
assert(effectivePortrait.timer?.x === 54.5, 'Memory match portrait timer x is 54.5');
assert(effectivePortrait.timer?.y === 2.0, 'Memory match portrait timer y is 2.0');
assert(effectivePortrait.memoryCardBoard?.x === 50, 'Memory match portrait board x is 50');
assert(effectivePortrait.memoryCardBoard?.y === 53, 'Memory match portrait board y is 53');

const catchBase = normalizeGameLayout(undefined, 'catch-brand');
const effectiveCatch = getEffectiveGameLayout(catchBase, true, 'catch-brand');
assert(effectiveCatch.scoreHud?.x === 4, 'Catch-brand portrait scoreHud x is 4');
assert(effectiveCatch.scoreHud?.y === 13, 'Catch-brand portrait scoreHud y is 13 (stable default)');
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

// Memory match unified status row layout tests
console.log('\n[Memory Match Unified Status Row Layout Tests]');
assert(baseLayout.scoreHud?.x === 2.5, 'Memory match landscape scoreHud x is placed first in row (2.5)');
assert(baseLayout.scoreHud?.y === 2.5, 'Memory match landscape scoreHud y is placed in row 1 (2.5)');
assert(baseLayout.movesHud?.x === 21, 'Memory match landscape movesHud x is placed second in row (21)');
assert(baseLayout.movesHud?.y === 2.5, 'Memory match landscape movesHud y is placed in row 1 (2.5)');
assert(baseLayout.pairsHud?.x === 39.5, 'Memory match landscape pairsHud x is placed third in row (39.5)');
assert(baseLayout.pairsHud?.y === 2.5, 'Memory match landscape pairsHud y is placed in row 1 (2.5)');
assert(baseLayout.timer?.x === 58, 'Memory match landscape timer x is placed fourth in row (58)');
assert(baseLayout.timer?.y === 2.5, 'Memory match landscape timer y is placed in row 1 (2.5)');
assert(baseLayout.gameTitle?.x === 36, 'Memory match landscape gameTitle x is centered (36)');
assert(baseLayout.gameTitle?.width === 28, 'Memory match landscape gameTitle width is 28 (center at 50)');
assert(baseLayout.gameTitle?.y === 8.5, 'Memory match landscape gameTitle y is in row 2 (8.5)');
assert(baseLayout.clientLogo?.visible === true, 'Memory match landscape clientLogo is visible by default');
assert(baseLayout.clientLogo?.x === 2.5, 'Memory match landscape clientLogo x is placed in row 2 (2.5)');
assert(baseLayout.clientLogo?.y === 8.5, 'Memory match landscape clientLogo y is placed in row 2 (8.5)');

// Custom HUD position preservation tests (verifying removal of arbitrary rejection / auto-heal)
const customHudLayout = normalizeGameLayout(
  {
    movesHud: { visible: true, x: 25, y: 20, width: 18 },
    pairsHud: { visible: true, x: 30, y: 20, width: 18 },
  },
  'memory-match'
);
assert(customHudLayout.movesHud?.x === 25, 'Moves HUD at X=25% is preserved (no snap-back)');
assert(customHudLayout.movesHud?.y === 20, 'Moves HUD at Y=20% is preserved (no snap-back)');
assert(customHudLayout.pairsHud?.x === 30, 'Pairs HUD at X=30% is preserved (no snap-back)');
assert(customHudLayout.pairsHud?.y === 20, 'Pairs HUD at Y=20% is preserved (no snap-back)');

// calculateDraggedPosition Unit Tests
console.log('\n[Shared calculateDraggedPosition Drag Engine Tests]');
const mockPreviewRect = { left: 100, top: 50, width: 800, height: 600 };

// Test 1: Drag Moves HUD from X=4%, Y=34% to X=25%, Y=20% preserving drag offset
// Pointer down at 10% X (180px), 37% Y (272px): dragOffsetX = 10 - 4 = 6%, dragOffsetY = 37 - 34 = 3%
// Pointer moves to 31% X (348px), 23% Y (188px):
const dragResult = calculateDraggedPosition({
  elementId: 'movesHud',
  pointerX: 100 + 0.31 * 800, // 348
  pointerY: 50 + 0.23 * 600,  // 188
  previewRect: mockPreviewRect,
  dragOffsetX: 6,
  dragOffsetY: 3,
  elementWidth: 18,
  elementHeight: 8,
});
assert(dragResult.x === 25, `Moves HUD dragged to X=25% (got ${dragResult.x})`);
assert(dragResult.y === 20, `Moves HUD dragged to Y=20% (got ${dragResult.y})`);

// Test 2: Clamp boundaries dynamically according to element dimensions (width 20, height 10)
// Drag past right edge
const clampedRight = calculateDraggedPosition({
  elementId: 'scoreHud',
  pointerX: 100 + 0.95 * 800,
  pointerY: 50 + 0.50 * 600,
  previewRect: mockPreviewRect,
  dragOffsetX: 0,
  dragOffsetY: 0,
  elementWidth: 20,
  elementHeight: 10,
});
assert(clampedRight.x === 80, `Right boundary clamped to 100 - width = 80% (got ${clampedRight.x})`);

// Drag past left edge
const clampedLeft = calculateDraggedPosition({
  elementId: 'scoreHud',
  pointerX: 100 - 50,
  pointerY: 50 + 0.50 * 600,
  previewRect: mockPreviewRect,
  dragOffsetX: 0,
  dragOffsetY: 0,
  elementWidth: 20,
  elementHeight: 10,
});
assert(clampedLeft.x === 0, `Left boundary clamped to 0% (got ${clampedLeft.x})`);

// Drag past bottom edge
const clampedBottom = calculateDraggedPosition({
  elementId: 'timer',
  pointerX: 100 + 0.50 * 800,
  pointerY: 50 + 0.98 * 600,
  previewRect: mockPreviewRect,
  dragOffsetX: 0,
  dragOffsetY: 0,
  elementWidth: 15,
  elementHeight: 8,
});
assert(clampedBottom.y === 92, `Bottom boundary clamped to 100 - height = 92% (got ${clampedBottom.y})`);

// Test 3: Center-anchored element (memoryCardBoard)
const boardDrag = calculateDraggedPosition({
  elementId: 'memoryCardBoard',
  pointerX: 100 + 0.55 * 800,
  pointerY: 50 + 0.60 * 600,
  previewRect: mockPreviewRect,
  dragOffsetX: 5,
  dragOffsetY: 10,
  elementWidth: 50,
  elementHeight: 40,
  isCenterAnchored: true,
});
assert(boardDrag.x === 50, `Board center X maintained at 50% (got ${boardDrag.x})`);
assert(boardDrag.y === 50, `Board center Y maintained at 50% (got ${boardDrag.y})`);

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
