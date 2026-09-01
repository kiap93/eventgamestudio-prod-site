import assert from 'node:assert';
import {
  RESULT_SCREEN_PRESETS,
  instantiateResultPreset,
  cloneElementsWithFreshIds,
} from './presets';
import { ResultCardElement, ResultGroupElement, ResultScreenElement } from '../../../../games/memory-match/types';

export function runPresetsTestSuite() {
  console.log('[TEST] Running Built-in Result Screen Layout Presets Test Suite...');

  // 1. Verify 6 standard presets exist
  assert.strictEqual(RESULT_SCREEN_PRESETS.length, 6, 'Should have exactly 6 presets');
  const expectedPresetIds = [
    'classic-center',
    'two-cards',
    'score-focus',
    'stats-dashboard',
    'minimal',
    'split-layout',
  ];

  expectedPresetIds.forEach((id) => {
    const found = RESULT_SCREEN_PRESETS.find((p) => p.id === id);
    assert.ok(found, `Preset ${id} must exist in registry`);
    assert.ok(found.name.length > 0, `Preset ${id} must have a name`);
    assert.ok(found.description.length > 0, `Preset ${id} must have a description`);
  });
  console.log('  ✓ All 6 expected preset definitions exist with valid metadata');

  // Helper to traverse all elements
  function getAllElementsFlat(elements: ResultScreenElement[]): ResultScreenElement[] {
    const flat: ResultScreenElement[] = [];
    function traverse(list: ResultScreenElement[]) {
      for (const el of list) {
        flat.push(el);
        if (el.type === 'card' && (el as ResultCardElement).children) {
          traverse((el as ResultCardElement).children);
        }
        if (el.type === 'group' && (el as ResultGroupElement).children) {
          traverse((el as ResultGroupElement).children);
        }
      }
    }
    traverse(elements);
    return flat;
  }

  // 2. Validate every preset's elements tree
  for (const preset of RESULT_SCREEN_PRESETS) {
    const elements = instantiateResultPreset(preset.id);
    assert.ok(elements && elements.length > 0, `Preset ${preset.id} must generate elements`);

    const flat = getAllElementsFlat(elements);
    const idSet = new Set<string>();

    for (const el of flat) {
      // Uniqueness of IDs
      assert.ok(!idSet.has(el.id), `Duplicate ID ${el.id} found in preset ${preset.id}`);
      idSet.add(el.id);

      // Coordinate boundary sanity check (1000x1000)
      assert.ok(el.x >= 0 && el.x <= 1000, `Element ${el.id} (${el.type}) x=${el.x} out of 1000x1000 bounds`);
      assert.ok(el.y >= 0 && el.y <= 1000, `Element ${el.id} (${el.type}) y=${el.y} out of 1000x1000 bounds`);
      assert.ok(el.width > 0 && el.width <= 1000, `Element ${el.id} width=${el.width} invalid`);
      assert.ok(el.height > 0 && el.height <= 1000, `Element ${el.id} height=${el.height} invalid`);

      // Editable properties presence
      assert.strictEqual(typeof el.visible, 'boolean', `Element ${el.id} must have visible property`);
      assert.strictEqual(typeof el.locked, 'boolean', `Element ${el.id} must have locked property`);
      assert.strictEqual(typeof el.opacity, 'number', `Element ${el.id} must have opacity property`);
      assert.strictEqual(typeof el.rotation, 'number', `Element ${el.id} must have rotation property`);
      assert.strictEqual(typeof el.zIndex, 'number', `Element ${el.id} must have zIndex property`);

      // Button actions check
      if (el.type === 'button') {
        assert.ok(
          el.action === 'playAgain' || el.action === 'home' || el.action === 'custom',
          `Button ${el.id} must have a valid action`
        );
        assert.ok(el.text && el.text.length > 0, `Button ${el.id} must have button text`);
      }
    }

    // Check that preset contains playAgain button action
    const hasPlayAgain = flat.some((el) => el.type === 'button' && el.action === 'playAgain');
    assert.ok(hasPlayAgain, `Preset ${preset.id} must contain a Play Again button action`);

    // Check that preset contains score metric
    const hasScore = flat.some((el) => el.type === 'score');
    assert.ok(hasScore, `Preset ${preset.id} must contain a score element`);

    console.log(`  ✓ Preset "${preset.name}" (${preset.id}) passed validation with ${flat.length} total elements`);
  }

  // 3. Test cloneElementsWithFreshIds generates different IDs on each call
  const inst1 = instantiateResultPreset('classic-center')!;
  const inst2 = instantiateResultPreset('classic-center')!;
  const flat1 = getAllElementsFlat(inst1);
  const flat2 = getAllElementsFlat(inst2);

  assert.strictEqual(flat1.length, flat2.length);
  for (let i = 0; i < flat1.length; i++) {
    assert.notStrictEqual(flat1[i].id, flat2[i].id, 'Cloned preset instances must have distinct IDs');
  }
  console.log('  ✓ Presets generate completely fresh, unique IDs on instantiation');

  console.log('[TEST] All Built-in Result Screen Layout Presets tests passed!\n');
}

// Auto-run when executed directly
if (process.argv[1]?.includes('presets.test')) {
  runPresetsTestSuite();
}
