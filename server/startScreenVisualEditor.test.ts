/**
 * Start Screen Visual Editor & Resolver Automated Tests
 */
import assert from 'node:assert';
import {
  getStartScreenConfig,
  sanitizeStartScreenElements,
} from '../src/games/shared/startScreenResolver';
import {
  StartScreenConfig,
  StartScreenCardElement,
  StartScreenTitleElement,
  StartScreenButtonElement,
} from '../src/games/shared/startScreenTypes';
import { START_SCREEN_PRESETS } from '../src/components/studio/games/start-editor/presets';
import {
  duplicateElement,
  deleteElements,
  reorderSiblingLayers,
  canGroupElements,
  groupSelectedElements,
  ungroupSelectedElements,
} from '../src/components/studio/games/start-editor/layerOperations';
import { GameTheme } from '../src/themes/types';

console.log('======================================================');
console.log('Running Start Screen Visual Editor & Resolver Tests');
console.log('======================================================');

let passed = 0;

// Test 1: Resolves start screen configuration with valid defaults
{
  const config = getStartScreenConfig(undefined, 'memory-match');
  assert.ok(config, 'Config should be resolved');
  assert.ok(config.canvas.width === 1000 || config.canvas.width === 1024, 'Canvas width should be 1000 or 1024');
  assert.ok(config.canvas.height === 1000 || config.canvas.height === 576, 'Canvas height should be 1000 or 576');
  assert.ok(Array.isArray(config.elements), 'Elements should be an array');
  assert.ok(config.elements.length > 0, 'Elements should not be empty');

  const hasButton = config.elements.some(
    (el) =>
      el.type === 'button' ||
      (el.type === 'card' &&
        (el as StartScreenCardElement).children?.some((c) => c.type === 'button'))
  );
  assert.ok(hasButton, 'Default elements should contain a button');
  console.log('  ✓ 1. Resolves start screen configuration with valid defaults');
  passed++;
}

// Test 2: Preserves customized elements and background
{
  const mockTheme: Partial<GameTheme> = {
    game_type: 'memory-match',
    game_config: {
      screens: {
        start: {
          backgroundType: 'color',
          backgroundColor: '#0a0f1d',
          canvas: { width: 1000, height: 1000 },
          elements: [
            {
              id: 'custom-card',
              type: 'card',
              x: 100,
              y: 100,
              width: 800,
              height: 800,
              zIndex: 1,
              style: {
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                borderRadius: 32,
                borderColor: '#f59e0b',
                borderWidth: 2,
              },
              children: [
                {
                  id: 'custom-title',
                  type: 'title',
                  x: 50,
                  y: 80,
                  width: 700,
                  height: 100,
                  zIndex: 2,
                  text: 'Mega Tournament Memory',
                  style: {
                    fontSize: 48,
                    color: '#fbbf24',
                  },
                },
                {
                  id: 'custom-btn',
                  type: 'button',
                  x: 200,
                  y: 600,
                  width: 400,
                  height: 80,
                  zIndex: 3,
                  text: 'START GAME',
                  action: 'startGame',
                },
              ],
            },
          ],
        },
      },
    },
  };

  const resolved = getStartScreenConfig(mockTheme, 'memory-match');
  assert.strictEqual(resolved.elements.length, 1);
  assert.strictEqual(resolved.elements[0].id, 'custom-card');
  const card = resolved.elements[0] as StartScreenCardElement;
  assert.strictEqual(card.children?.length, 2);
  assert.strictEqual(card.children?.[0].type, 'title');
  assert.strictEqual(card.children?.[1].type, 'button');
  console.log('  ✓ 2. Preserves customized elements and background configuration');
  passed++;
}

// Test 3: Loads and validates all 6 start screen presets
{
  assert.strictEqual(START_SCREEN_PRESETS.length, 6);

  for (const preset of START_SCREEN_PRESETS) {
    assert.ok(preset.id);
    assert.ok(preset.name);
    assert.strictEqual(typeof preset.elements, 'function');
    const elements = preset.elements({}, 'memory-match');
    assert.ok(elements.length > 0);

    const sanitized = sanitizeStartScreenElements(elements);
    assert.strictEqual(sanitized.length, elements.length);
  }
  console.log('  ✓ 3. Loads and sanitizes all 6 start screen presets');
  passed++;
}

// Test 4: Layer operations (duplicate, delete, reorder)
{
  const initialElements: StartScreenCardElement[] = [
    {
      id: 'el-1',
      type: 'card',
      x: 100,
      y: 100,
      width: 300,
      height: 300,
      zIndex: 1,
    },
    {
      id: 'el-2',
      type: 'card',
      x: 450,
      y: 100,
      width: 300,
      height: 300,
      zIndex: 2,
    },
  ];

  const dupRes = duplicateElement(initialElements, 'el-1');
  assert.strictEqual(dupRes.newElements.length, 3);
  assert.ok(dupRes.duplicatedId);

  const delRes = deleteElements(dupRes.newElements, ['el-2']);
  assert.strictEqual(delRes.length, 2);
  assert.strictEqual(delRes.find((e) => e.id === 'el-2'), undefined);

  const reordered = reorderSiblingLayers(delRes, 'el-1', 'backward');
  assert.ok(reordered);
  console.log('  ✓ 4. Layer operations: duplicate, delete, and reorder');
  passed++;
}

// Test 5: Grouping and ungrouping operations
{
  const elements = [
    {
      id: 't-1',
      type: 'title' as const,
      text: 'Sample Title',
      x: 100,
      y: 100,
      width: 300,
      height: 60,
      zIndex: 1,
    },
    {
      id: 'b-1',
      type: 'button' as const,
      text: 'Start',
      action: 'startGame' as const,
      x: 100,
      y: 200,
      width: 300,
      height: 60,
      zIndex: 2,
    },
  ];

  assert.ok(canGroupElements(elements, ['t-1', 'b-1']));
  const groupRes = groupSelectedElements(elements, ['t-1', 'b-1']);
  assert.strictEqual(groupRes.newElements.length, 1);
  assert.strictEqual(groupRes.newElements[0].type, 'group');
  assert.ok(groupRes.groupId);

  const ungroupRes = ungroupSelectedElements(groupRes.newElements, [groupRes.groupId!]);
  assert.strictEqual(ungroupRes.newElements.length, 2);
  assert.strictEqual(ungroupRes.unpackedIds.length, 2);
  console.log('  ✓ 5. Grouping and ungrouping elements');
  passed++;
}

console.log('======================================================');
console.log(`Results: ${passed} passed, 0 failed`);
console.log('======================================================');
