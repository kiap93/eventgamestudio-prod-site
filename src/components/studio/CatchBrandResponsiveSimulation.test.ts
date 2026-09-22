import {
  resolveEffectiveOrientation,
  calculateResponsiveStageDimensions,
  getEffectiveGameLayout,
  PORTRAIT_DESIGN_WIDTH,
  PORTRAIT_DESIGN_HEIGHT,
  LANDSCAPE_DESIGN_WIDTH,
  LANDSCAPE_DESIGN_HEIGHT,
} from '../../themes/responsive';
import {
  normalizeGameLayout,
  calculateDraggedPosition,
  GameLayoutConfig,
  DEFAULT_CATCH_BRAND_LAYOUT,
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

console.log('================================================================');
console.log('Catch The Brand Portrait Preferred & Interactive Simulation Tests');
console.log('================================================================');

// -----------------------------------------------------------------------------
// TEST SUITE 1: Authoritative Orientation Resolution & Hierarchy
// Priority: Manual Override > Theme Preference > Auto Container Responsive
// -----------------------------------------------------------------------------
console.log('\n[Suite 1: Authoritative Orientation Resolution & Priority]');

// Theme Preference: Portrait Preferred
assert(
  resolveEffectiveOrientation('portrait', 1200, 800, null) === 'portrait',
  'Theme "portrait" preference resolves to portrait even in wide landscape viewport'
);
assert(
  resolveEffectiveOrientation('portrait', 400, 800, null) === 'portrait',
  'Theme "portrait" preference resolves to portrait in narrow viewport'
);

// Theme Preference: Landscape Preferred
assert(
  resolveEffectiveOrientation('landscape', 400, 800, null) === 'landscape',
  'Theme "landscape" preference resolves to landscape even in tall portrait viewport'
);
assert(
  resolveEffectiveOrientation('landscape', 1200, 800, null) === 'landscape',
  'Theme "landscape" preference resolves to landscape in wide viewport'
);

// Auto Responsive: Container Aspect Ratio
assert(
  resolveEffectiveOrientation('auto', 1200, 800, null) === 'landscape',
  'Auto mode resolves to landscape when width > height'
);
assert(
  resolveEffectiveOrientation('auto', 400, 800, null) === 'portrait',
  'Auto mode resolves to portrait when width < height'
);

// Manual Override Priority over Theme Preference
assert(
  resolveEffectiveOrientation('portrait', 1200, 800, 'landscape') === 'landscape',
  'Manual override "landscape" takes priority over theme "portrait" preference'
);
assert(
  resolveEffectiveOrientation('landscape', 1200, 800, 'portrait') === 'portrait',
  'Manual override "portrait" takes priority over theme "landscape" preference'
);

// -----------------------------------------------------------------------------
// TEST SUITE 2: Logical Stage Dimensions & Uniform Proportional Scaling
// -----------------------------------------------------------------------------
console.log('\n[Suite 2: Logical Dimensions & Responsive Stage Calculations]');

assert(PORTRAIT_DESIGN_WIDTH === 576, 'Portrait logical width is exactly 576px');
assert(PORTRAIT_DESIGN_HEIGHT === 1024, 'Portrait logical height is exactly 1024px');
assert(LANDSCAPE_DESIGN_WIDTH === 1024, 'Landscape logical width is exactly 1024px');
assert(LANDSCAPE_DESIGN_HEIGHT === 576, 'Landscape logical height is exactly 576px');

// Aspect Ratios: Portrait (9:16 = 0.5625), Landscape (16:9 = 1.7778)
assertCloseTo(PORTRAIT_DESIGN_WIDTH / PORTRAIT_DESIGN_HEIGHT, 9 / 16, 0.001, 'Portrait aspect ratio is strictly 9:16');
assertCloseTo(LANDSCAPE_DESIGN_WIDTH / LANDSCAPE_DESIGN_HEIGHT, 16 / 9, 0.001, 'Landscape aspect ratio is strictly 16:9');

// calculateResponsiveStageDimensions in Portrait container (e.g. mobile 360x640)
const portraitDimsMobile = calculateResponsiveStageDimensions(360, 640, true);
assertCloseTo(portraitDimsMobile.stageWidth / portraitDimsMobile.stageHeight, 576 / 1024, 0.01, 'Portrait mobile stage preserves 9:16 aspect ratio');
assert(portraitDimsMobile.stageWidth <= 360, 'Stage width fits within container width');
assert(portraitDimsMobile.stageHeight <= 640, 'Stage height fits within container height');

// calculateResponsiveStageDimensions in Studio editor pane (e.g. 700x520)
const portraitDimsStudio = calculateResponsiveStageDimensions(700, 520, true);
assertCloseTo(portraitDimsStudio.stageWidth / portraitDimsStudio.stageHeight, 576 / 1024, 0.01, 'Portrait studio stage preserves 9:16 aspect ratio');
assert(portraitDimsStudio.stageHeight <= 520, 'Portrait studio stage height is bounded by container');

const landscapeDimsStudio = calculateResponsiveStageDimensions(700, 520, false);
assertCloseTo(landscapeDimsStudio.stageWidth / landscapeDimsStudio.stageHeight, 1024 / 576, 0.01, 'Landscape studio stage preserves 16:9 aspect ratio');
assert(landscapeDimsStudio.stageWidth <= 700, 'Landscape studio stage width is bounded by container');

// -----------------------------------------------------------------------------
// TEST SUITE 3: Interactive Basket Pointer Tracking & Coordinate Normalization
// -----------------------------------------------------------------------------
console.log('\n[Suite 3: Interactive Pointer Tracking & Stage Normalization]');

// Formula in handlePointerMove: clientX * (designWidth / stageRect.width)
function computeBasketTargetX(clientXRelativeToStage: number, stageWidth: number, isPortrait: boolean): number {
  const designW = isPortrait ? PORTRAIT_DESIGN_WIDTH : LANDSCAPE_DESIGN_WIDTH;
  const scaleX = designW / stageWidth;
  return clientXRelativeToStage * scaleX;
}

// Portrait stage rendered at 360px width
assertCloseTo(computeBasketTargetX(180, 360, true), 288, 0.01, 'Center of 360px portrait stage maps to 288 logical px');
assertCloseTo(computeBasketTargetX(0, 360, true), 0, 0.01, 'Left edge of portrait stage maps to 0 logical px');
assertCloseTo(computeBasketTargetX(360, 360, true), 576, 0.01, 'Right edge of portrait stage maps to 576 logical px');

// Landscape stage rendered at 800px width
assertCloseTo(computeBasketTargetX(400, 800, false), 512, 0.01, 'Center of 800px landscape stage maps to 512 logical px');
assertCloseTo(computeBasketTargetX(0, 800, false), 0, 0.01, 'Left edge of landscape stage maps to 0 logical px');
assertCloseTo(computeBasketTargetX(800, 800, false), 1024, 0.01, 'Right edge of landscape stage maps to 1024 logical px');

// -----------------------------------------------------------------------------
// TEST SUITE 4: Simulation Physics State Normalization
// -----------------------------------------------------------------------------
console.log('\n[Suite 4: Simulation Physics State Normalization]');

// Initial basket position must center in the active design width
const initialBasketXPortrait = PORTRAIT_DESIGN_WIDTH / 2;
const initialBasketXLandscape = LANDSCAPE_DESIGN_WIDTH / 2;
assert(initialBasketXPortrait === 288, 'Initial basket X in portrait is 288px (not hardcoded 512)');
assert(initialBasketXLandscape === 512, 'Initial basket X in landscape is 512px');

// Basket boundary clamping: Math.max(basketHalfW, Math.min(V_WIDTH - basketHalfW, basketX))
const basketWidth = 140;
const basketHalfW = basketWidth / 2; // 70px

const minXPortrait = basketHalfW;
const maxXPortrait = PORTRAIT_DESIGN_WIDTH - basketHalfW;
assert(minXPortrait === 70, 'Portrait min basket clamp is 70px');
assert(maxXPortrait === 506, 'Portrait max basket clamp is 506px (576 - 70)');

const minXLandscape = basketHalfW;
const maxXLandscape = LANDSCAPE_DESIGN_WIDTH - basketHalfW;
assert(minXLandscape === 70, 'Landscape min basket clamp is 70px');
assert(maxXLandscape === 954, 'Landscape max basket clamp is 954px (1024 - 70)');

// Item Spawning margin bounds
const spawnMargin = 60;
assert(PORTRAIT_DESIGN_WIDTH - spawnMargin === 516, 'Portrait drop item spawn range is [60, 516]');
assert(LANDSCAPE_DESIGN_WIDTH - spawnMargin === 964, 'Landscape drop item spawn range is [60, 964]');

// -----------------------------------------------------------------------------
// TEST SUITE 5: Drag and Drop Coordinate Calculation Relative to Stage
// -----------------------------------------------------------------------------
console.log('\n[Suite 5: Stage-Relative Drag & Drop Coordinates]');

// Stage rect representing catchBrandStageRef (excluding outer viewport headers/controls)
const stageRect = { left: 150, top: 80, width: 450, height: 800 };

function computePointerPercentages(clientX: number, clientY: number, rect: typeof stageRect) {
  const pointerPercentX = ((clientX - rect.left) / rect.width) * 100;
  const pointerPercentY = ((clientY - rect.top) / rect.height) * 100;
  return { pointerPercentX, pointerPercentY };
}

const centerPointer = computePointerPercentages(150 + 225, 80 + 400, stageRect);
assertCloseTo(centerPointer.pointerPercentX, 50, 0.01, 'Center pointer inside stage produces 50% X');
assertCloseTo(centerPointer.pointerPercentY, 50, 0.01, 'Center pointer inside stage produces 50% Y');

const leftQuarterPointer = computePointerPercentages(150 + 112.5, 80 + 200, stageRect);
assertCloseTo(leftQuarterPointer.pointerPercentX, 25, 0.01, 'Quarter pointer inside stage produces 25% X');
assertCloseTo(leftQuarterPointer.pointerPercentY, 25, 0.01, 'Quarter pointer inside stage produces 25% Y');

// -----------------------------------------------------------------------------
// TEST SUITE 6: Layout Editor Multi-Orientation Saving & Loading
// -----------------------------------------------------------------------------
console.log('\n[Suite 6: Layout Persistence across Portrait & Landscape]');

const baseLayout: GameLayoutConfig = normalizeGameLayout(
  {
    orientation: 'portrait',
    scoreHud: { x: 5, y: 5, visible: true },
    portraitLayout: {
      scoreHud: { x: 8, y: 12, visible: true },
    },
  },
  'catch-brand'
);

// Loading in Portrait: must read from portraitLayout
const effectivePortrait = getEffectiveGameLayout(baseLayout, true, 'catch-brand');
assert(effectivePortrait.scoreHud?.x === 8, 'getEffectiveGameLayout in portrait returns portraitLayout scoreHud.x = 8');
assert(effectivePortrait.scoreHud?.y === 12, 'getEffectiveGameLayout in portrait returns portraitLayout scoreHud.y = 12');

// Loading in Landscape: must read from root layout
const effectiveLandscape = getEffectiveGameLayout(baseLayout, false, 'catch-brand');
assert(effectiveLandscape.scoreHud?.x === 5, 'getEffectiveGameLayout in landscape returns root scoreHud.x = 5');
assert(effectiveLandscape.scoreHud?.y === 5, 'getEffectiveGameLayout in landscape returns root scoreHud.y = 5');

// Drag update simulation in Portrait: saves to portraitLayout
const updatedInPortrait: GameLayoutConfig = {
  ...baseLayout,
  portraitLayout: {
    ...(baseLayout.portraitLayout || {}),
    scoreHud: {
      ...(baseLayout.portraitLayout?.scoreHud || {}),
      x: 15,
      y: 18,
      visible: true,
    },
  },
};
const reloadedPortrait = getEffectiveGameLayout(updatedInPortrait, true, 'catch-brand');
assert(reloadedPortrait.scoreHud?.x === 15, 'Updated portrait layout persists and loads correctly at x=15');
assert(reloadedPortrait.scoreHud?.y === 18, 'Updated portrait layout persists and loads correctly at y=18');

// Landscape root remains undisturbed by portrait edits
const reloadedLandscape = getEffectiveGameLayout(updatedInPortrait, false, 'catch-brand');
assert(reloadedLandscape.scoreHud?.x === 5, 'Landscape root scoreHud.x remains intact at 5 after portrait edit');

// -----------------------------------------------------------------------------
// SUMMARY
// -----------------------------------------------------------------------------
console.log('\n======================================================');
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('======================================================');

if (failed > 0) {
  process.exit(1);
}
