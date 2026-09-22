import { calculateCatchBrandHudPosition } from './GameLayoutHudOverlay';
import {
  LAYOUT_ELEMENTS_META,
  DEFAULT_CATCH_BRAND_LAYOUT,
  GameLayoutConfig,
} from '../../themes/layout';

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
console.log('Running Catch the Brand HUD Positioning Acceptance Tests');
console.log('======================================================');

// 1. DEFAULT UI TESTS (When no customization has been made)
console.log('\n[Default UI Positioning Tests]');

// Landscape Default UI: ScoreHud
const defaultScoreLandscape = calculateCatchBrandHudPosition({
  key: 'scoreHud',
  elem: { x: 3.5, y: 3.5, width: 17, visible: true },
  meta: LAYOUT_ELEMENTS_META.scoreHud,
  layoutSource: undefined,
  effectiveIsPortrait: false,
  isVisible: true,
});
assertCloseTo(defaultScoreLandscape.posX, 3.5, 0.01, 'Default landscape scoreHud X is 3.5%');
assertCloseTo(defaultScoreLandscape.posY, 3.5, 0.01, 'Default landscape scoreHud Y is 3.5%');
assert(!defaultScoreLandscape.hasCustomValue, 'Default landscape scoreHud reports hasCustomValue = false');

// Landscape Default UI: Timer
const defaultTimerLandscape = calculateCatchBrandHudPosition({
  key: 'timer',
  elem: { x: 79.5, y: 11, width: 17, visible: true },
  meta: LAYOUT_ELEMENTS_META.timer,
  layoutSource: undefined,
  effectiveIsPortrait: false,
  isVisible: true,
});
assertCloseTo(defaultTimerLandscape.posX, 79.5, 0.01, 'Default landscape timer X is 79.5%');
assertCloseTo(defaultTimerLandscape.posY, 11, 0.01, 'Default landscape timer Y is 11%');
assert(!defaultTimerLandscape.hasCustomValue, 'Default landscape timer reports hasCustomValue = false');

// Landscape Default UI: GameTitle (horizontally centered)
const defaultTitleLandscape = calculateCatchBrandHudPosition({
  key: 'gameTitle',
  elem: { x: 35, y: 3.5, width: 30, visible: true },
  meta: LAYOUT_ELEMENTS_META.gameTitle,
  layoutSource: undefined,
  effectiveIsPortrait: false,
  isVisible: true,
});
assertCloseTo(defaultTitleLandscape.posX, 35, 0.01, 'Default landscape gameTitle is centered at X=35%');
assertCloseTo(defaultTitleLandscape.posY, 3.5, 0.01, 'Default landscape gameTitle Y is 3.5%');

// Landscape Default UI: ClientLogo (horizontally centered below title)
const defaultLogoLandscape = calculateCatchBrandHudPosition({
  key: 'clientLogo',
  elem: { x: 41, y: 9.5, width: 18, visible: true },
  meta: LAYOUT_ELEMENTS_META.clientLogo,
  layoutSource: undefined,
  effectiveIsPortrait: false,
  clientLogoUrl: 'https://example.com/logo.png',
  isVisible: true,
});
assertCloseTo(defaultLogoLandscape.posX, 41, 0.01, 'Default landscape clientLogo is centered at X=41%');
assertCloseTo(defaultLogoLandscape.posY, 9.5, 0.01, 'Default landscape clientLogo Y is 9.5%');

// Portrait Default UI: ScoreHud & Timer side-by-side
const defaultScorePortraitNoLogo = calculateCatchBrandHudPosition({
  key: 'scoreHud',
  elem: { x: 4, y: 9.5, width: 44, visible: true },
  meta: LAYOUT_ELEMENTS_META.scoreHud,
  layoutSource: undefined,
  effectiveIsPortrait: true,
  isVisible: true,
});
assertCloseTo(defaultScorePortraitNoLogo.posX, 4, 0.01, 'Default portrait scoreHud without logo X is 4%');
assertCloseTo(defaultScorePortraitNoLogo.posY, 9.5, 0.01, 'Default portrait scoreHud without logo Y is 9.5%');

const defaultTimerPortraitNoLogo = calculateCatchBrandHudPosition({
  key: 'timer',
  elem: { x: 52, y: 9.5, width: 44, visible: true },
  meta: LAYOUT_ELEMENTS_META.timer,
  layoutSource: undefined,
  effectiveIsPortrait: true,
  isVisible: true,
});
assertCloseTo(defaultTimerPortraitNoLogo.posX, 52, 0.01, 'Default portrait timer without logo X is 52%');
assertCloseTo(defaultTimerPortraitNoLogo.posY, 9.5, 0.01, 'Default portrait timer without logo Y is 9.5%');

// Portrait Default UI with valid ClientLogo (shifts HUD down)
const defaultScorePortraitWithLogo = calculateCatchBrandHudPosition({
  key: 'scoreHud',
  elem: { x: 4, y: 13.5, width: 44, visible: true },
  meta: LAYOUT_ELEMENTS_META.scoreHud,
  layoutSource: undefined,
  effectiveIsPortrait: true,
  clientLogoUrl: 'https://example.com/logo.png',
  isVisible: true,
});
assertCloseTo(defaultScorePortraitWithLogo.posY, 13.5, 0.01, 'Default portrait scoreHud with logo shifts to Y=13.5%');

// 2. CUSTOMIZATION VALUE TESTS (When customization already has value, HUD follows custom position)
console.log('\n[Customized HUD Positioning Tests]');

// Custom landscape scoreHud position: user customized to (20%, 15%)
const customLayoutSource: GameLayoutConfig = {
  ...DEFAULT_CATCH_BRAND_LAYOUT,
  scoreHud: { visible: true, x: 20, y: 15, width: 25 },
  timer: { visible: true, x: 65, y: 25, width: 22 },
};

const customScoreLandscape = calculateCatchBrandHudPosition({
  key: 'scoreHud',
  elem: { x: 20, y: 15, width: 25, visible: true },
  meta: LAYOUT_ELEMENTS_META.scoreHud,
  layoutSource: customLayoutSource,
  effectiveIsPortrait: false,
  isVisible: true,
});
assert(customScoreLandscape.hasCustomValue === true, 'Customized scoreHud reports hasCustomValue = true');
assertCloseTo(customScoreLandscape.posX, 20, 0.01, 'Follows custom X=20%');
assertCloseTo(customScoreLandscape.posY, 15, 0.01, 'Follows custom Y=15%');
assertCloseTo(customScoreLandscape.widthPercent, 25, 0.01, 'Follows custom width=25%');

// Custom landscape timer position: user customized to (65%, 25%)
const customTimerLandscape = calculateCatchBrandHudPosition({
  key: 'timer',
  elem: { x: 65, y: 25, width: 22, visible: true },
  meta: LAYOUT_ELEMENTS_META.timer,
  layoutSource: customLayoutSource,
  effectiveIsPortrait: false,
  isVisible: true,
});
assert(customTimerLandscape.hasCustomValue === true, 'Customized timer reports hasCustomValue = true');
assertCloseTo(customTimerLandscape.posX, 65, 0.01, 'Follows custom X=65%');
assertCloseTo(customTimerLandscape.posY, 25, 0.01, 'Follows custom Y=25%');
assertCloseTo(customTimerLandscape.widthPercent, 22, 0.01, 'Follows custom width=22%');

// Custom clientLogo position: user moved logo to top right (80%, 5%)
const customLogoLayout: GameLayoutConfig = {
  ...DEFAULT_CATCH_BRAND_LAYOUT,
  clientLogo: { visible: true, x: 80, y: 5, width: 15 },
};

const customLogoLandscape = calculateCatchBrandHudPosition({
  key: 'clientLogo',
  elem: { x: 80, y: 5, width: 15, visible: true },
  meta: LAYOUT_ELEMENTS_META.clientLogo,
  layoutSource: customLogoLayout,
  effectiveIsPortrait: false,
  clientLogoUrl: 'https://example.com/logo.png',
  isVisible: true,
});
assert(customLogoLandscape.hasCustomValue === true, 'Customized clientLogo reports hasCustomValue = true');
assertCloseTo(customLogoLandscape.posX, 80, 0.01, 'Custom clientLogo follows X=80%');
assertCloseTo(customLogoLandscape.posY, 5, 0.01, 'Custom clientLogo follows Y=5%');
assertCloseTo(customLogoLandscape.widthPercent, 15, 0.01, 'Custom clientLogo follows width=15%');

// Custom portrait layout: user customized portraitLayout explicitly
const customPortraitLayout: GameLayoutConfig = {
  ...DEFAULT_CATCH_BRAND_LAYOUT,
  portraitLayout: {
    scoreHud: { visible: true, x: 10, y: 30, width: 35 },
    timer: { visible: true, x: 55, y: 30, width: 35 },
  },
};

const customScorePortrait = calculateCatchBrandHudPosition({
  key: 'scoreHud',
  elem: { x: 10, y: 30, width: 35, visible: true },
  meta: LAYOUT_ELEMENTS_META.scoreHud,
  layoutSource: customPortraitLayout,
  effectiveIsPortrait: true,
  isVisible: true,
});
assert(customScorePortrait.hasCustomValue === true, 'Portrait customized scoreHud reports hasCustomValue = true');
assertCloseTo(customScorePortrait.posX, 10, 0.01, 'Portrait custom scoreHud follows X=10%');
assertCloseTo(customScorePortrait.posY, 30, 0.01, 'Portrait custom scoreHud follows Y=30%');

// 3. MIXED CUSTOMIZATION (One element customized, another element default)
console.log('\n[Mixed Customization Tests]');

// Layout has customized scoreHud, but default gameTitle
const mixedLayout: GameLayoutConfig = {
  ...DEFAULT_CATCH_BRAND_LAYOUT,
  scoreHud: { visible: true, x: 12, y: 18, width: 20 },
};

const mixedScore = calculateCatchBrandHudPosition({
  key: 'scoreHud',
  elem: { x: 12, y: 18, width: 20, visible: true },
  meta: LAYOUT_ELEMENTS_META.scoreHud,
  layoutSource: mixedLayout,
  effectiveIsPortrait: false,
  isVisible: true,
});
assert(mixedScore.hasCustomValue === true, 'Mixed: scoreHud follows custom position (X=12%, Y=18%)');
assertCloseTo(mixedScore.posX, 12, 0.01, 'Mixed: scoreHud X is 12%');
assertCloseTo(mixedScore.posY, 18, 0.01, 'Mixed: scoreHud Y is 18%');

const mixedTitle = calculateCatchBrandHudPosition({
  key: 'gameTitle',
  elem: { x: 35, y: 3.5, width: 30, visible: true },
  meta: LAYOUT_ELEMENTS_META.gameTitle,
  layoutSource: mixedLayout,
  effectiveIsPortrait: false,
  isVisible: true,
});
assert(mixedTitle.hasCustomValue === false, 'Mixed: uncustomized gameTitle falls back to default UI');
assertCloseTo(mixedTitle.posX, 35, 0.01, 'Mixed: gameTitle is centered at X=35%');
assertCloseTo(mixedTitle.posY, 3.5, 0.01, 'Mixed: gameTitle Y is 3.5%');

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
