import {
  detectStartScreenCoordinateSpace,
  needsStartScreenElementNormalization,
  normalizeStartScreenConfigForStage,
  getStartScreenConfig,
} from './startScreenResolver';
import { generateDefaultStartScreenElements, StartScreenConfig } from './startScreenTypes';

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

console.log('======================================================');
console.log('Running Start Screen Resolver & Normalization Tests');
console.log('======================================================');

// TEST 1: Detect legacy 1000x1000 elements even when canvas is set to 1024x576
console.log('\n--- Test 1: Coordinate Space Detection ---');
const legacyElementsMM = generateDefaultStartScreenElements('memory-match');
const legacyConfigWith1024Canvas: StartScreenConfig = {
  canvas: { width: 1024, height: 576 },
  elements: legacyElementsMM,
};

const detected = detectStartScreenCoordinateSpace(legacyConfigWith1024Canvas);
assert(detected === 'square-1000x1000', `Detects legacy coordinates despite 1024x576 canvas (got ${detected})`);

const needsNorm = needsStartScreenElementNormalization(legacyConfigWith1024Canvas, 1024, 576);
assert(needsNorm === true, `Needs normalization is true for legacy elements with 1024x576 canvas`);

// TEST 2: Normalization moves card and fits within 1024x576
console.log('\n--- Test 2: Card and Element Transformation ---');
const normalized = normalizeStartScreenConfigForStage(legacyConfigWith1024Canvas, 1024, 576);

assert(normalized.canvas.width === 1024, 'Canvas width is 1024');
assert(normalized.canvas.height === 576, 'Canvas height is 576');
assert(normalized.canvas.coordinateSpace === 'landscape-1024x576', 'Canvas coordinateSpace is landscape-1024x576');

const normCard = normalized.elements.find((e) => e.type === 'card');
assert(Boolean(normCard), 'Card exists in normalized elements');

if (normCard) {
  assert(normCard.x === 132, `Card x is centered at 132 (got ${normCard.x})`);
  assert(normCard.y === 53, `Card y is centered at 53 (got ${normCard.y})`);
  assert(normCard.width === 760, `Card width is 760 (got ${normCard.width})`);
  assert(normCard.height === 470, `Card height is 470 (got ${normCard.height})`);
  assert(normCard.y + normCard.height <= 576, `Card bottom (${normCard.y + normCard.height}) is within 576 stage height`);

  // Verify all child elements fit within the card
  let maxChildBottom = 0;
  for (const child of normCard.children || []) {
    const bottom = child.y + child.height;
    if (bottom > maxChildBottom) {
      maxChildBottom = bottom;
    }
  }
  assert(maxChildBottom <= normCard.height, `All children fit within card height (${maxChildBottom} <= ${normCard.height})`);

  // Verify Start Match button is visible and not clipped
  const startBtn = (normCard.children || []).find((c) => c.type === 'button');
  assert(Boolean(startBtn), 'Start button exists inside card');
  if (startBtn) {
    assert(startBtn.y + startBtn.height <= normCard.height, `Start button bottom (${startBtn.y + startBtn.height}) <= card height (${normCard.height})`);
  }
}

// TEST 3: Idempotency (normalize(normalize(config)) === normalize(config))
console.log('\n--- Test 3: Normalization Idempotency ---');
const doubleNormalized = normalizeStartScreenConfigForStage(normalized, 1024, 576);
const doubleCard = doubleNormalized.elements.find((e) => e.type === 'card');

if (normCard && doubleCard) {
  assert(doubleCard.x === normCard.x, `Idempotent x: ${doubleCard.x} === ${normCard.x}`);
  assert(doubleCard.y === normCard.y, `Idempotent y: ${doubleCard.y} === ${normCard.y}`);
  assert(doubleCard.width === normCard.width, `Idempotent width: ${doubleCard.width} === ${normCard.width}`);
  assert(doubleCard.height === normCard.height, `Idempotent height: ${doubleCard.height} === ${normCard.height}`);

  const normBtn = (normCard.children || []).find((c) => c.type === 'button');
  const doubleBtn = (doubleCard.children || []).find((c) => c.type === 'button');
  if (normBtn && doubleBtn) {
    assert(doubleBtn.y === normBtn.y, `Button y is idempotent: ${doubleBtn.y} === ${normBtn.y}`);
    assert(doubleBtn.height === normBtn.height, `Button height is idempotent: ${doubleBtn.height} === ${normBtn.height}`);
  }
}

// TEST 4: Reaction Game Start Screen
console.log('\n--- Test 4: Reaction Game Start Screen Normalization ---');
const reactionConfig = getStartScreenConfig(
  null,
  'reaction-time',
  { gameTitle: 'REACTION SPEED', gameSubtitle: 'TEST YOUR REFLEXES' },
  { width: 1024, height: 576 }
);

const reactionCard = reactionConfig.elements.find((e) => e.type === 'card');
assert(Boolean(reactionCard), 'Reaction card exists');
if (reactionCard) {
  assert(reactionCard.y === 53, `Reaction card y is centered at 53 (got ${reactionCard.y})`);
  assert(reactionCard.y + reactionCard.height <= 576, `Reaction card bottom <= 576 (got ${reactionCard.y + reactionCard.height})`);

  let maxReactionChildBottom = 0;
  for (const child of reactionCard.children || []) {
    maxReactionChildBottom = Math.max(maxReactionChildBottom, child.y + child.height);
  }
  assert(maxReactionChildBottom <= reactionCard.height, `Reaction children fit inside card (${maxReactionChildBottom} <= ${reactionCard.height})`);
}

// TEST 5: Catch The Brand 1024x576 Preservation
console.log('\n--- Test 5: Catch The Brand 1024x576 Untouched ---');
const ctbConfig = getStartScreenConfig(
  null,
  'catch-brand',
  undefined,
  { width: 1024, height: 576 }
);
const ctbCard = ctbConfig.elements.find((e) => e.type === 'card');
if (ctbCard) {
  assert(ctbCard.y + ctbCard.height <= 576, `Catch the brand card bottom <= 576 (got ${ctbCard.y + ctbCard.height})`);
}

console.log('\n======================================================');
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('======================================================');

if (failed > 0) {
  process.exit(1);
}
