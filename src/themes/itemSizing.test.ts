import { getDropItemDisplaySize, DEFAULT_MAX_DROP_ITEM_SIZE } from './itemSizing';

console.log('======================================================');
console.log('Running Drop Item Aspect Ratio & Sizing Acceptance Tests');
console.log('======================================================');

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

// ----------------------------------------------------
// TEST 1: 512x128 Horizontal Ticket
// Expected: Visibly horizontal (64x16), NOT square (64x64)
// Aspect ratio: 4.0
// ----------------------------------------------------
console.log('\n[Test 1: 512x128 Horizontal Ticket]');
{
  const result = getDropItemDisplaySize(512, 128);
  assert(result.width === 64, `Width should be 64px, got ${result.width}`);
  assert(result.height === 16, `Height should be 16px, got ${result.height}`);
  assert(result.width !== result.height, `Item must NOT be square (w=${result.width}, h=${result.height})`);
  assert(result.width / result.height === 4.0, `Aspect ratio must be exactly 4.0, got ${result.width / result.height}`);
  assert(result.aspectRatio === 4.0, `Reported aspectRatio should be 4.0, got ${result.aspectRatio}`);
}

// ----------------------------------------------------
// TEST 2: 256x256 Square Icon
// Expected: Square (64x64)
// Aspect ratio: 1.0
// ----------------------------------------------------
console.log('\n[Test 2: 256x256 Square Icon]');
{
  const result = getDropItemDisplaySize(256, 256);
  assert(result.width === 64, `Width should be 64px, got ${result.width}`);
  assert(result.height === 64, `Height should be 64px, got ${result.height}`);
  assert(result.width === result.height, `Item must be square (w=${result.width}, h=${result.height})`);
  assert(result.aspectRatio === 1.0, `Aspect ratio should be 1.0, got ${result.aspectRatio}`);
}

// ----------------------------------------------------
// TEST 3: 128x256 Vertical Asset
// Expected: Visibly vertical (32x64), NOT square
// Aspect ratio: 0.5
// ----------------------------------------------------
console.log('\n[Test 3: 128x256 Vertical Asset]');
{
  const result = getDropItemDisplaySize(128, 256);
  assert(result.width === 32, `Width should be 32px, got ${result.width}`);
  assert(result.height === 64, `Height should be 64px, got ${result.height}`);
  assert(result.width !== result.height, `Item must NOT be square (w=${result.width}, h=${result.height})`);
  assert(result.width / result.height === 0.5, `Aspect ratio must be exactly 0.5, got ${result.width / result.height}`);
  assert(result.aspectRatio === 0.5, `Reported aspectRatio should be 0.5, got ${result.aspectRatio}`);
}

// ----------------------------------------------------
// TEST 4: 800x200 Banner
// Expected: Visibly horizontal (64x16), NOT square
// Aspect ratio: 4.0
// ----------------------------------------------------
console.log('\n[Test 4: 800x200 Banner]');
{
  const result = getDropItemDisplaySize(800, 200);
  assert(result.width === 64, `Width should be 64px, got ${result.width}`);
  assert(result.height === 16, `Height should be 16px, got ${result.height}`);
  assert(result.width / result.height === 4.0, `Aspect ratio must be exactly 4.0, got ${result.width / result.height}`);
}

// ----------------------------------------------------
// TEST 5: Real Carnival Theme Assets
// item_normal_01.png is 612x408 (3:2 ratio)
// item_bonus_01.png is 523x477 (~1.1:1 ratio)
// ----------------------------------------------------
console.log('\n[Test 5: Real Carnival Theme Assets]');
{
  const ticket = getDropItemDisplaySize(612, 408);
  assert(ticket.width === 64, `612x408 item width should be 64px, got ${ticket.width}`);
  assert(ticket.height === 43, `612x408 item height should be 43px (408 * 64/612 = 42.67 -> 43), got ${ticket.height}`);
  assert(ticket.width !== ticket.height, '612x408 item must NOT be forced into square');

  const star = getDropItemDisplaySize(523, 477);
  assert(star.width === 64, `523x477 item width should be 64px, got ${star.width}`);
  assert(star.height === 58, `523x477 item height should be 58px (477 * 64/523 = 58.37 -> 58), got ${star.height}`);
}

// ----------------------------------------------------
// TEST 6: Custom Scale Support (Section 8)
// scale = 1.5 -> display dimensions * 1.5
// scale = 0.5 -> display dimensions * 0.5
// Invariant: aspectRatio preserved
// ----------------------------------------------------
console.log('\n[Test 6: Custom Scale Multiplier]');
{
  // 512x128 with scale = 1.5
  const scaledUp = getDropItemDisplaySize(512, 128, DEFAULT_MAX_DROP_ITEM_SIZE, 1.5);
  assert(scaledUp.width === 96, `Scaled 1.5x width should be 96px, got ${scaledUp.width}`);
  assert(scaledUp.height === 24, `Scaled 1.5x height should be 24px, got ${scaledUp.height}`);
  assert(scaledUp.width / scaledUp.height === 4.0, `Aspect ratio preserved under 1.5x scale (got ${scaledUp.width / scaledUp.height})`);

  // 512x128 with scale = 0.5
  const scaledDown = getDropItemDisplaySize(512, 128, DEFAULT_MAX_DROP_ITEM_SIZE, 0.5);
  assert(scaledDown.width === 32, `Scaled 0.5x width should be 32px, got ${scaledDown.width}`);
  assert(scaledDown.height === 8, `Scaled 0.5x height should be 8px, got ${scaledDown.height}`);
  assert(scaledDown.width / scaledDown.height === 4.0, `Aspect ratio preserved under 0.5x scale (got ${scaledDown.width / scaledDown.height})`);
}

// ----------------------------------------------------
// TEST 7: Missing / Zero / Invalid Dimension Fallback
// ----------------------------------------------------
console.log('\n[Test 7: Missing & Invalid Dimension Fallbacks]');
{
  const zeroW = getDropItemDisplaySize(0, 100);
  assert(zeroW.width === 64 && zeroW.height === 64, 'Zero width falls back to default size');

  const zeroH = getDropItemDisplaySize(100, 0);
  assert(zeroH.width === 64 && zeroH.height === 64, 'Zero height falls back to default size');

  const nullDims = getDropItemDisplaySize(null, null);
  assert(nullDims.width === 64 && nullDims.height === 64, 'Null dimensions fall back to default size');

  const undefinedDims = getDropItemDisplaySize(undefined, undefined);
  assert(undefinedDims.width === 64 && undefinedDims.height === 64, 'Undefined dimensions fall back to default size');
}

console.log('\n======================================================');
console.log(`Drop Item Aspect Ratio Tests: ${passed} passed, ${failed} failed`);
console.log('======================================================');

if (failed > 0) {
  process.exit(1);
}
