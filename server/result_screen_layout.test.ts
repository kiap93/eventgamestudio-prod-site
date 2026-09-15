import assert from 'node:assert';
import { resolveResultScreenLayout } from '../src/games/shared/ResultScreenRenderer';
import { normalizeGameLayout } from '../src/themes/layout';
import { getEffectiveGameLayout } from '../src/themes/responsive';

console.log('======================================================');
console.log('Running Result Screen Layout Positioning Tests');
console.log('======================================================');

// 1. Default to center alignment when no layout position is specified
{
  const alignment = resolveResultScreenLayout(null);
  assert.strictEqual(alignment.position, 'center');
  assert.strictEqual(alignment.verticalAlign, 'center');
  assert.strictEqual(alignment.justifyContent, 'center');
  assert.strictEqual(alignment.alignItems, 'center');
  assert.strictEqual(alignment.justifyClass, 'justify-center');
  assert.strictEqual(alignment.itemsClass, 'items-center');
  assert.strictEqual(alignment.marginClass, 'mx-auto');
  console.log('  ✓ Test 1: Defaults to center alignment when no layout position is specified');
}

// 2. Correctly resolves position: "center"
{
  const alignment = resolveResultScreenLayout({ position: 'center' });
  assert.strictEqual(alignment.position, 'center');
  assert.strictEqual(alignment.justifyContent, 'center');
  assert.strictEqual(alignment.justifyClass, 'justify-center');
  assert.strictEqual(alignment.marginClass, 'mx-auto');
  console.log('  ✓ Test 2: Correctly resolves position: "center"');
}

// 3. Correctly resolves contentAlignment: "center"
{
  const alignment = resolveResultScreenLayout({ contentAlignment: 'center' });
  assert.strictEqual(alignment.position, 'center');
  assert.strictEqual(alignment.justifyContent, 'center');
  assert.strictEqual(alignment.justifyClass, 'justify-center');
  assert.strictEqual(alignment.marginClass, 'mx-auto');
  console.log('  ✓ Test 3: Correctly resolves contentAlignment: "center"');
}

// 4. Correctly resolves horizontalAlignment: "center"
{
  const alignment = resolveResultScreenLayout({ horizontalAlignment: 'center' });
  assert.strictEqual(alignment.position, 'center');
  assert.strictEqual(alignment.justifyContent, 'center');
  assert.strictEqual(alignment.justifyClass, 'justify-center');
  assert.strictEqual(alignment.marginClass, 'mx-auto');
  console.log('  ✓ Test 4: Correctly resolves horizontalAlignment: "center"');
}

// 5. Correctly resolves position: "left"
{
  const alignment = resolveResultScreenLayout({ position: 'left' });
  assert.strictEqual(alignment.position, 'left');
  assert.strictEqual(alignment.justifyContent, 'flex-start');
  assert.strictEqual(alignment.justifyClass, 'justify-start');
  assert.strictEqual(alignment.marginClass, 'mr-auto ml-0');
  console.log('  ✓ Test 5: Correctly resolves position: "left"');
}

// 6. Correctly resolves position: "right"
{
  const alignment = resolveResultScreenLayout({ position: 'right' });
  assert.strictEqual(alignment.position, 'right');
  assert.strictEqual(alignment.justifyContent, 'flex-end');
  assert.strictEqual(alignment.justifyClass, 'justify-end');
  assert.strictEqual(alignment.marginClass, 'ml-auto mr-0');
  console.log('  ✓ Test 6: Correctly resolves position: "right"');
}

// 7. Correctly resolves vertical alignment: "top", "center", "bottom"
{
  const topAlign = resolveResultScreenLayout({ verticalAlignment: 'top' });
  assert.strictEqual(topAlign.verticalAlign, 'top');
  assert.strictEqual(topAlign.alignItems, 'flex-start');
  assert.strictEqual(topAlign.itemsClass, 'items-start');

  const bottomAlign = resolveResultScreenLayout({ verticalAlignment: 'bottom' });
  assert.strictEqual(bottomAlign.verticalAlign, 'bottom');
  assert.strictEqual(bottomAlign.alignItems, 'flex-end');
  assert.strictEqual(bottomAlign.itemsClass, 'items-end');

  const centerAlign = resolveResultScreenLayout({ verticalAlignment: 'center' });
  assert.strictEqual(centerAlign.verticalAlign, 'center');
  assert.strictEqual(centerAlign.alignItems, 'center');
  assert.strictEqual(centerAlign.itemsClass, 'items-center');
  console.log('  ✓ Test 7: Correctly resolves vertical alignment ("top", "center", "bottom")');
}

// 8. Derives alignment from memoryCardBoard coordinates as fallback
{
  const leftBoard = resolveResultScreenLayout({
    memoryCardBoard: { visible: true, x: 20, y: 50 },
  } as any);
  assert.strictEqual(leftBoard.position, 'left');

  const rightBoard = resolveResultScreenLayout({
    memoryCardBoard: { visible: true, x: 75, y: 50 },
  } as any);
  assert.strictEqual(rightBoard.position, 'right');

  const centerBoard = resolveResultScreenLayout({
    memoryCardBoard: { visible: true, x: 50, y: 50 },
  } as any);
  assert.strictEqual(centerBoard.position, 'center');
  console.log('  ✓ Test 8: Derives alignment from memoryCardBoard coordinates as fallback');
}

// 9. Preserves alignment properties across normalizeGameLayout
{
  const raw = {
    position: 'center',
    contentAlignment: 'center',
    horizontalAlignment: 'center',
    verticalAlignment: 'center',
  };
  const normalized = normalizeGameLayout(raw, 'memory-match');
  assert.strictEqual(normalized.position, 'center');
  assert.strictEqual(normalized.contentAlignment, 'center');
  assert.strictEqual(normalized.horizontalAlignment, 'center');
  assert.strictEqual(normalized.verticalAlignment, 'center');
  console.log('  ✓ Test 9: Preserves alignment properties across normalizeGameLayout');
}

// 10. Preserves alignment properties across getEffectiveGameLayout
{
  const raw = normalizeGameLayout({
    position: 'center',
    verticalAlignment: 'center',
  }, 'memory-match');

  const landscape = getEffectiveGameLayout(raw, false, 'memory-match');
  assert.strictEqual(landscape.position, 'center');
  assert.strictEqual(landscape.verticalAlignment, 'center');

  const portrait = getEffectiveGameLayout(raw, true, 'memory-match');
  assert.strictEqual(portrait.position, 'center');
  assert.strictEqual(portrait.verticalAlignment, 'center');
  console.log('  ✓ Test 10: Preserves alignment properties across getEffectiveGameLayout');
}

console.log('======================================================');
console.log('Result Screen Layout Tests Finished: 10 passed, 0 failed');
console.log('======================================================');
