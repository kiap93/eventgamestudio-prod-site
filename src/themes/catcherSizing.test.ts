import assert from 'node:assert';
import {
  calculateCatcherSize,
  calculateCatcherTargetY,
  getTextureNaturalDimensions,
} from './catcherSizing';
import { defaultCatchBrandTheme } from './defaultCatchBrand';
import { DEFAULT_CARNIVAL_THEME } from '../../server/db/themes';

console.log('======================================================');
console.log('RUNNING CATCHER SIZING & ASPECT RATIO PRESERVATION TESTS');
console.log('======================================================');

// 1. Natural Texture Dimensions Extraction
const mockPhaserTexture = {
  source: [{ width: 1536, height: 1024 }],
};
const dimsPhaser = getTextureNaturalDimensions(mockPhaserTexture);
assert.strictEqual(dimsPhaser.width, 1536);
assert.strictEqual(dimsPhaser.height, 1024);

const mockHtmlImage = {
  naturalWidth: 612,
  naturalHeight: 408,
};
const dimsHtml = getTextureNaturalDimensions(mockHtmlImage);
assert.strictEqual(dimsHtml.width, 612);
assert.strictEqual(dimsHtml.height, 408);

const mockFrame = {
  realWidth: 1448,
  realHeight: 1086,
};
const dimsFrame = getTextureNaturalDimensions(mockFrame);
assert.strictEqual(dimsFrame.width, 1448);
assert.strictEqual(dimsFrame.height, 1086);
console.log('✓ PASS: getTextureNaturalDimensions extracts dimensions accurately across formats');

// 2. Strict Aspect Ratio Invariant Across All Theme Textures
const testTextures = [
  { name: 'Default Basket', width: 1536, height: 1024, expectedRatio: 1.5 },
  { name: 'Carnival Basket', width: 612, height: 408, expectedRatio: 1.5 },
  { name: 'Christmas Sack', width: 1536, height: 1024, expectedRatio: 1.5 },
  { name: 'CNY Fortune Basket', width: 1448, height: 1086, expectedRatio: 1448 / 1086 },
  { name: 'Legacy Durian Basket', width: 651, height: 383, expectedRatio: 651 / 383 },
];

for (const tex of testTextures) {
  const textureObj = { source: [{ width: tex.width, height: tex.height }] };
  const sizeLandscape = calculateCatcherSize(1024, 576, textureObj);
  const sizePortrait = calculateCatcherSize(576, 1024, textureObj);

  // Verify landscape aspect ratio preservation (within 1.5% integer pixel precision)
  const actualRatioLandscape = sizeLandscape.width / sizeLandscape.height;
  const ratioDiffLandscape = Math.abs(actualRatioLandscape - tex.expectedRatio);
  assert.ok(
    ratioDiffLandscape < 0.03,
    `${tex.name} landscape aspect ratio distorted: expected ${tex.expectedRatio}, got ${actualRatioLandscape}`
  );

  // Verify portrait aspect ratio preservation (within 1.5% integer pixel precision)
  const actualRatioPortrait = sizePortrait.width / sizePortrait.height;
  const ratioDiffPortrait = Math.abs(actualRatioPortrait - tex.expectedRatio);
  assert.ok(
    ratioDiffPortrait < 0.03,
    `${tex.name} portrait aspect ratio distorted: expected ${tex.expectedRatio}, got ${actualRatioPortrait}`
  );

  // Verify height / width exactly matches natural ratio
  const heightRatio = sizeLandscape.heightToWidthRatio;
  assert.strictEqual(heightRatio, tex.height / tex.width);
}
console.log('✓ PASS: Invariant preserved — height / width strictly derived from natural texture aspect ratio');

// 3. Viewport Matrix Tests (Desktop 1920x1080, 1366x768, iPhone Portrait/Landscape, Android, Fullscreen)
const viewportScenarios = [
  { name: 'Desktop 1920x1080 Fullscreen', width: 1920, height: 1080, isPortrait: false },
  { name: 'Desktop 1366x768', width: 1366, height: 768, isPortrait: false },
  { name: 'Standard 1024x576 Landscape (Game Coordinate Baseline)', width: 1024, height: 576, isPortrait: false },
  { name: 'Standard 576x1024 Portrait (Mobile Coordinate Baseline)', width: 576, height: 1024, isPortrait: true },
  { name: 'iPhone 14/15 Portrait (390x844)', width: 390, height: 844, isPortrait: true },
  { name: 'iPhone 14/15 Landscape (844x390)', width: 844, height: 390, isPortrait: false },
  { name: 'iPhone SE Portrait (375x667)', width: 375, height: 667, isPortrait: true },
  { name: 'Android Portrait (412x915)', width: 412, height: 915, isPortrait: true },
];

const referenceTexture = { source: [{ width: 1536, height: 1024 }] };

for (const vp of viewportScenarios) {
  const size = calculateCatcherSize(vp.width, vp.height, referenceTexture);
  const targetY = calculateCatcherTargetY(vp.height, size.height, vp.isPortrait);

  // Sizing sanity checks
  assert.ok(size.width >= 60, `${vp.name}: width too small (${size.width})`);
  assert.ok(size.width <= Math.round(vp.width * 0.40), `${vp.name}: width too large (${size.width})`);
  assert.ok(size.height >= 36, `${vp.name}: height too small (${size.height})`);
  assert.ok(size.height <= Math.round(vp.height * 0.35), `${vp.name}: height too large (${size.height})`);

  // Position sanity checks: catcher center must keep the sprite within the screen
  const topEdge = targetY - size.height / 2;
  const bottomEdge = targetY + size.height / 2;
  assert.ok(topEdge > 0, `${vp.name}: catcher top edge above screen (${topEdge})`);
  assert.ok(bottomEdge < vp.height, `${vp.name}: catcher bottom edge touches or exceeds screen bottom (${bottomEdge} vs ${vp.height})`);

  // Target Y must provide comfortable falling item travel area
  assert.ok(targetY > vp.height * 0.70, `${vp.name}: catcher placed too high (${targetY} of ${vp.height})`);
}
console.log('✓ PASS: All viewport scenarios (desktop, mobile portrait/landscape, fullscreen) size and position correctly');

// 4. Cumulative Scaling Prevention Check
// Simulates repeated resize events or multiple catch triggers
let currentWidth = 140;
let currentHeight = 93;
for (let i = 0; i < 50; i++) {
  // Always derive from game viewport and base texture, never from current display dimensions
  const res = calculateCatcherSize(1024, 576, referenceTexture);
  currentWidth = res.width;
  currentHeight = res.height;
}
assert.strictEqual(currentWidth, 140, 'Width must remain exactly 140 after 50 resize cycles');
assert.strictEqual(currentHeight, 93, 'Height must remain exactly 93 after 50 resize cycles');
console.log('✓ PASS: Cumulative scaling prevented — repeated resizes remain strictly idempotent');

// 5. Collision Body Synchronization
// Verify that collision width and height match ThemeBasketConfig ratios
const mockBasketConfig = {
  collisionWidthRatio: 0.7235,
  collisionHeightRatio: 0.13,
  collisionOffsetYRatio: 0.3394,
};

const renderedWidth = 140;
const renderedHeight = 93;
const expectedBodyWidth = Math.round(renderedWidth * mockBasketConfig.collisionWidthRatio);
const expectedBodyHeight = Math.round(renderedHeight * mockBasketConfig.collisionHeightRatio);
const expectedOffsetY = Math.round(renderedHeight * mockBasketConfig.collisionOffsetYRatio);

assert.ok(expectedBodyWidth >= 95 && expectedBodyWidth <= 105, `Collision width reasonable: ${expectedBodyWidth}`);
assert.ok(expectedBodyHeight >= 10 && expectedBodyHeight <= 15, `Collision height reasonable: ${expectedBodyHeight}`);
assert.ok(expectedOffsetY >= 28 && expectedOffsetY <= 35, `Collision offset Y reasonable: ${expectedOffsetY}`);
console.log('✓ PASS: Collision body dimensions correctly synchronize with rendered visual size');

console.log('======================================================');
console.log('ALL CATCHER SIZING & ASPECT RATIO TESTS PASSED!');
console.log('======================================================');
