import { calculateCatchBrandHudPosition } from './GameLayoutHudOverlay';
import {
  LAYOUT_ELEMENTS_META,
  DEFAULT_CATCH_BRAND_LAYOUT,
  normalizeGameLayout,
  GameLayoutConfig,
} from '../../themes/layout';
import {
  DEFAULT_PORTRAIT_CATCH_BRAND_LAYOUT,
  getEditableGameLayout,
} from '../../themes/responsive';

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

// ====================================================================
// TEST CASE A: NO LOGO
// - Score remains top-left (3.5, 3.5)
// - Timer remains top-right (79.5, 3.5)
// - Client Logo is hidden
// - Score position does not change
// ====================================================================
console.log('\n[TEST CASE A: No Logo]');

const scoreNoLogo = calculateCatchBrandHudPosition({
  key: 'scoreHud',
  elem: { x: 3.5, y: 3.5, width: 17, visible: true },
  meta: LAYOUT_ELEMENTS_META.scoreHud,
  layoutSource: undefined,
  effectiveIsPortrait: false,
  clientLogoUrl: null,
  isVisible: true,
});
assertCloseTo(scoreNoLogo.posX, 3.5, 0.01, 'A: Score remains top-left X = 3.5%');
assertCloseTo(scoreNoLogo.posY, 3.5, 0.01, 'A: Score remains top-left Y = 3.5%');

const timerNoLogo = calculateCatchBrandHudPosition({
  key: 'timer',
  elem: { x: 79.5, y: 3.5, width: 17, visible: true },
  meta: LAYOUT_ELEMENTS_META.timer,
  layoutSource: undefined,
  effectiveIsPortrait: false,
  clientLogoUrl: null,
  isVisible: true,
});
assertCloseTo(timerNoLogo.posX, 79.5, 0.01, 'A: Timer remains top-right X = 79.5%');
assertCloseTo(timerNoLogo.posY, 3.5, 0.01, 'A: Timer remains top-right Y = 3.5%');

const titleNoLogo = calculateCatchBrandHudPosition({
  key: 'gameTitle',
  elem: { x: 35, y: 3.5, width: 30, visible: true },
  meta: LAYOUT_ELEMENTS_META.gameTitle,
  layoutSource: undefined,
  effectiveIsPortrait: false,
  clientLogoUrl: null,
  isVisible: true,
});
assertCloseTo(titleNoLogo.posX, 35, 0.01, 'A: Game Title is centered at X = 35%');
assertCloseTo(titleNoLogo.posY, 3.5, 0.01, 'A: Game Title Y = 3.5%');

// Client logo default configuration should be hidden (visible = false)
assert(DEFAULT_CATCH_BRAND_LAYOUT.clientLogo.visible === false, 'A: Default clientLogo visible is false');

// ====================================================================
// TEST CASE B: VALID LOGO
// - Score remains exactly the same position (3.5, 3.5)
// - Timer remains exactly the same position (79.5, 3.5)
// - Client Logo appears in its secondary row (3.5, 9.5)
// ====================================================================
console.log('\n[TEST CASE B: Valid Logo]');

const scoreWithLogo = calculateCatchBrandHudPosition({
  key: 'scoreHud',
  elem: { x: 3.5, y: 3.5, width: 17, visible: true },
  meta: LAYOUT_ELEMENTS_META.scoreHud,
  layoutSource: undefined,
  effectiveIsPortrait: false,
  clientLogoUrl: 'https://example.com/customer-logo.png',
  isVisible: true,
});
assertCloseTo(scoreWithLogo.posX, scoreNoLogo.posX, 0.001, 'B: Score X matches exactly between with-logo and no-logo');
assertCloseTo(scoreWithLogo.posY, scoreNoLogo.posY, 0.001, 'B: Score Y matches exactly between with-logo and no-logo (3.5%)');

const timerWithLogo = calculateCatchBrandHudPosition({
  key: 'timer',
  elem: { x: 79.5, y: 3.5, width: 17, visible: true },
  meta: LAYOUT_ELEMENTS_META.timer,
  layoutSource: undefined,
  effectiveIsPortrait: false,
  clientLogoUrl: 'https://example.com/customer-logo.png',
  isVisible: true,
});
assertCloseTo(timerWithLogo.posX, timerNoLogo.posX, 0.001, 'B: Timer X matches exactly between with-logo and no-logo');
assertCloseTo(timerWithLogo.posY, timerNoLogo.posY, 0.001, 'B: Timer Y matches exactly between with-logo and no-logo (3.5%)');

const logoWithLogo = calculateCatchBrandHudPosition({
  key: 'clientLogo',
  elem: { x: 3.5, y: 9.5, width: 18, visible: true },
  meta: LAYOUT_ELEMENTS_META.clientLogo,
  layoutSource: undefined,
  effectiveIsPortrait: false,
  clientLogoUrl: 'https://example.com/customer-logo.png',
  isVisible: true,
});
assertCloseTo(logoWithLogo.posX, 3.5, 0.01, 'B: Client Logo appears at secondary row X = 3.5% (below score)');
assertCloseTo(logoWithLogo.posY, 9.5, 0.01, 'B: Client Logo appears at secondary row Y = 9.5%');
assertCloseTo(logoWithLogo.widthPercent, 18, 0.01, 'B: Client Logo width is 18%');

// ====================================================================
// TEST CASE C: CUSTOM SCORE POSITION
// - custom Score position is preserved regardless of logo presence
// ====================================================================
console.log('\n[TEST CASE C: Custom Score Position]');

const customScoreLayout: GameLayoutConfig = {
  ...DEFAULT_CATCH_BRAND_LAYOUT,
  scoreHud: { visible: true, x: 20, y: 15, width: 25 },
};

const customScoreNoLogo = calculateCatchBrandHudPosition({
  key: 'scoreHud',
  elem: { x: 20, y: 15, width: 25, visible: true },
  meta: LAYOUT_ELEMENTS_META.scoreHud,
  layoutSource: customScoreLayout,
  effectiveIsPortrait: false,
  clientLogoUrl: null,
  isVisible: true,
});
assert(customScoreNoLogo.hasCustomValue === true, 'C: Custom Score reports hasCustomValue = true (no logo)');
assertCloseTo(customScoreNoLogo.posX, 20, 0.01, 'C: Custom Score preserves X = 20% (no logo)');
assertCloseTo(customScoreNoLogo.posY, 15, 0.01, 'C: Custom Score preserves Y = 15% (no logo)');
assertCloseTo(customScoreNoLogo.widthPercent, 25, 0.01, 'C: Custom Score preserves width = 25%');

const customScoreWithLogo = calculateCatchBrandHudPosition({
  key: 'scoreHud',
  elem: { x: 20, y: 15, width: 25, visible: true },
  meta: LAYOUT_ELEMENTS_META.scoreHud,
  layoutSource: customScoreLayout,
  effectiveIsPortrait: false,
  clientLogoUrl: 'https://example.com/customer-logo.png',
  isVisible: true,
});
assert(customScoreWithLogo.hasCustomValue === true, 'C: Custom Score reports hasCustomValue = true (with logo)');
assertCloseTo(customScoreWithLogo.posX, 20, 0.01, 'C: Custom Score preserves X = 20% (with logo)');
assertCloseTo(customScoreWithLogo.posY, 15, 0.01, 'C: Custom Score preserves Y = 15% (with logo)');

// ====================================================================
// TEST CASE D: CUSTOM LOGO POSITION
// - custom Logo position is preserved
// ====================================================================
console.log('\n[TEST CASE D: Custom Logo Position]');

const customLogoLayout: GameLayoutConfig = {
  ...DEFAULT_CATCH_BRAND_LAYOUT,
  clientLogo: { visible: true, x: 80, y: 5, width: 15 },
};

const customLogo = calculateCatchBrandHudPosition({
  key: 'clientLogo',
  elem: { x: 80, y: 5, width: 15, visible: true },
  meta: LAYOUT_ELEMENTS_META.clientLogo,
  layoutSource: customLogoLayout,
  effectiveIsPortrait: false,
  clientLogoUrl: 'https://example.com/customer-logo.png',
  isVisible: true,
});
assert(customLogo.hasCustomValue === true, 'D: Custom Logo reports hasCustomValue = true');
assertCloseTo(customLogo.posX, 80, 0.01, 'D: Custom Logo preserves X = 80%');
assertCloseTo(customLogo.posY, 5, 0.01, 'D: Custom Logo preserves Y = 5%');
assertCloseTo(customLogo.widthPercent, 15, 0.01, 'D: Custom Logo preserves width = 15%');

// ====================================================================
// TEST CASE E: REMOVE LOGO AFTER HAVING A LOGO
// - Score does not move
// - Timer does not move
// - Logo disappears
// ====================================================================
console.log('\n[TEST CASE E: Remove Logo After Having Logo]');

// Before removal: active logo
const stateBeforeRemoval = {
  score: calculateCatchBrandHudPosition({
    key: 'scoreHud',
    elem: { x: 3.5, y: 3.5, width: 17, visible: true },
    meta: LAYOUT_ELEMENTS_META.scoreHud,
    layoutSource: undefined,
    effectiveIsPortrait: false,
    clientLogoUrl: 'https://example.com/logo.png',
    isVisible: true,
  }),
  timer: calculateCatchBrandHudPosition({
    key: 'timer',
    elem: { x: 79.5, y: 3.5, width: 17, visible: true },
    meta: LAYOUT_ELEMENTS_META.timer,
    layoutSource: undefined,
    effectiveIsPortrait: false,
    clientLogoUrl: 'https://example.com/logo.png',
    isVisible: true,
  }),
};

// After removal: clientLogoUrl cleared (null / empty string)
const stateAfterRemoval = {
  score: calculateCatchBrandHudPosition({
    key: 'scoreHud',
    elem: { x: 3.5, y: 3.5, width: 17, visible: true },
    meta: LAYOUT_ELEMENTS_META.scoreHud,
    layoutSource: undefined,
    effectiveIsPortrait: false,
    clientLogoUrl: null,
    isVisible: true,
  }),
  timer: calculateCatchBrandHudPosition({
    key: 'timer',
    elem: { x: 79.5, y: 3.5, width: 17, visible: true },
    meta: LAYOUT_ELEMENTS_META.timer,
    layoutSource: undefined,
    effectiveIsPortrait: false,
    clientLogoUrl: null,
    isVisible: true,
  }),
};

assertCloseTo(stateAfterRemoval.score.posX, stateBeforeRemoval.score.posX, 0.001, 'E: Score X does not move after removing logo');
assertCloseTo(stateAfterRemoval.score.posY, stateBeforeRemoval.score.posY, 0.001, 'E: Score Y does not move after removing logo');
assertCloseTo(stateAfterRemoval.timer.posX, stateBeforeRemoval.timer.posX, 0.001, 'E: Timer X does not move after removing logo');
assertCloseTo(stateAfterRemoval.timer.posY, stateBeforeRemoval.timer.posY, 0.001, 'E: Timer Y does not move after removing logo');

// ====================================================================
// TEST CASE F: EXISTING LEGACY LAYOUT MIGRATION
// - recognized legacy default coordinates migrate to the new default
// - genuine custom coordinates are not overwritten
// ====================================================================
console.log('\n[TEST CASE F: Legacy Layout Migration]');

// Legacy layout 1: old logo at (3.5, 3.5), old score below logo at (3.5, 11), old timer at (79.5, 11)
const legacyRawLayout1 = {
  clientLogo: { visible: false, x: 3.5, y: 3.5, width: 18 },
  scoreHud: { visible: true, x: 3.5, y: 11, width: 17 },
  timer: { visible: true, x: 79.5, y: 11, width: 17 },
  gameTitle: { visible: true, x: 35, y: 3.5, width: 30 },
  footerSponsor: { visible: true, x: 24, y: 92, width: 52 },
};

const migratedLayout1 = normalizeGameLayout(legacyRawLayout1, 'catch-brand');
assertCloseTo(migratedLayout1.scoreHud.x, 3.5, 0.01, 'F1: Migrated legacy scoreHud X is 3.5% (top-left)');
assertCloseTo(migratedLayout1.scoreHud.y, 3.5, 0.01, 'F1: Migrated legacy scoreHud Y is 3.5% (top-left)');
assertCloseTo(migratedLayout1.timer.x, 79.5, 0.01, 'F1: Migrated legacy timer X is 79.5% (top-right)');
assertCloseTo(migratedLayout1.timer.y, 3.5, 0.01, 'F1: Migrated legacy timer Y is 3.5% (top-right)');
assertCloseTo(migratedLayout1.clientLogo.x, 3.5, 0.01, 'F1: Migrated legacy clientLogo X is 3.5% (second row)');
assertCloseTo(migratedLayout1.clientLogo.y, 9.5, 0.01, 'F1: Migrated legacy clientLogo Y is 9.5% (second row)');

// Legacy layout 2: previous centered logo at (41, 9.5), timer at (79.5, 11)
const legacyRawLayout2 = {
  clientLogo: { visible: false, x: 41, y: 9.5, width: 18 },
  scoreHud: { visible: true, x: 3.5, y: 3.5, width: 17 },
  timer: { visible: true, x: 79.5, y: 11, width: 17 },
  gameTitle: { visible: true, x: 35, y: 3.5, width: 30 },
  footerSponsor: { visible: true, x: 24, y: 92, width: 52 },
};

const migratedLayout2 = normalizeGameLayout(legacyRawLayout2, 'catch-brand');
assertCloseTo(migratedLayout2.clientLogo.x, 3.5, 0.01, 'F2: Centered logo (41, 9.5) migrates to left-side (3.5, 9.5)');
assertCloseTo(migratedLayout2.clientLogo.y, 9.5, 0.01, 'F2: Centered logo Y remains 9.5%');
assertCloseTo(migratedLayout2.timer.y, 3.5, 0.01, 'F2: Timer (79.5, 11) migrates to top row (79.5, 3.5)');

// Genuine custom layout: user placed score at (18, 22), timer at (60, 30), logo at (75, 40)
const genuineCustomLayout = {
  clientLogo: { visible: true, x: 75, y: 40, width: 14 },
  scoreHud: { visible: true, x: 18, y: 22, width: 20 },
  timer: { visible: true, x: 60, y: 30, width: 20 },
  gameTitle: { visible: true, x: 35, y: 3.5, width: 30 },
  footerSponsor: { visible: true, x: 24, y: 92, width: 52 },
};

const preservedCustomLayout = normalizeGameLayout(genuineCustomLayout, 'catch-brand');
assertCloseTo(preservedCustomLayout.scoreHud.x, 18, 0.01, 'F3: Genuine custom score X=18% is NOT overwritten');
assertCloseTo(preservedCustomLayout.scoreHud.y, 22, 0.01, 'F3: Genuine custom score Y=22% is NOT overwritten');
assertCloseTo(preservedCustomLayout.timer.x, 60, 0.01, 'F3: Genuine custom timer X=60% is NOT overwritten');
assertCloseTo(preservedCustomLayout.timer.y, 30, 0.01, 'F3: Genuine custom timer Y=30% is NOT overwritten');
assertCloseTo(preservedCustomLayout.clientLogo.x, 75, 0.01, 'F3: Genuine custom logo X=75% is NOT overwritten');
assertCloseTo(preservedCustomLayout.clientLogo.y, 40, 0.01, 'F3: Genuine custom logo Y=40% is NOT overwritten');

// ====================================================================
// TEST CASE G: PORTRAIT STABILITY
// - Score & timer default positions are completely stable
// - Neither shifts when logo exists or is missing
// ====================================================================
console.log('\n[TEST CASE G: Portrait Stability]');

const portraitNoLogo = calculateCatchBrandHudPosition({
  key: 'scoreHud',
  elem: { x: 4, y: 13, width: 44, visible: true },
  meta: LAYOUT_ELEMENTS_META.scoreHud,
  layoutSource: undefined,
  effectiveIsPortrait: true,
  clientLogoUrl: null,
  isVisible: true,
});
assertCloseTo(portraitNoLogo.posX, 4, 0.01, 'G: Portrait scoreHud X is 4% (no logo)');
assertCloseTo(portraitNoLogo.posY, 13, 0.01, 'G: Portrait scoreHud Y is 13% (no logo)');

const portraitWithLogo = calculateCatchBrandHudPosition({
  key: 'scoreHud',
  elem: { x: 4, y: 13, width: 44, visible: true },
  meta: LAYOUT_ELEMENTS_META.scoreHud,
  layoutSource: undefined,
  effectiveIsPortrait: true,
  clientLogoUrl: 'https://example.com/logo.png',
  isVisible: true,
});
assertCloseTo(portraitWithLogo.posX, 4, 0.01, 'G: Portrait scoreHud X is 4% (with logo)');
assertCloseTo(portraitWithLogo.posY, 13, 0.01, 'G: Portrait scoreHud Y is 13% (with logo)');
assertCloseTo(portraitWithLogo.posY, portraitNoLogo.posY, 0.001, 'G: Portrait scoreHud Y NEVER shifts based on logo presence');

const portraitTimerNoLogo = calculateCatchBrandHudPosition({
  key: 'timer',
  elem: { x: 52, y: 13, width: 44, visible: true },
  meta: LAYOUT_ELEMENTS_META.timer,
  layoutSource: undefined,
  effectiveIsPortrait: true,
  clientLogoUrl: null,
  isVisible: true,
});
const portraitTimerWithLogo = calculateCatchBrandHudPosition({
  key: 'timer',
  elem: { x: 52, y: 13, width: 44, visible: true },
  meta: LAYOUT_ELEMENTS_META.timer,
  layoutSource: undefined,
  effectiveIsPortrait: true,
  clientLogoUrl: 'https://example.com/logo.png',
  isVisible: true,
});
assertCloseTo(portraitTimerWithLogo.posY, portraitTimerNoLogo.posY, 0.001, 'G: Portrait timer Y NEVER shifts based on logo presence (stable at 13%)');

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
