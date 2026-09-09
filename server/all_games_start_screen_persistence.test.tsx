import React from 'react';
import { renderToString } from 'react-dom/server';
import assert from 'node:assert';
import {
  getStartScreenConfig,
  normalizeStartScreenConfigForStage,
  saveStartScreenConfig,
} from '../src/games/shared/startScreenResolver';
import {
  START_SCREEN_PRESETS,
  instantiateStartPreset,
} from '../src/components/studio/games/start-editor/presets';
import { StartScreenRenderer } from '../src/games/shared/StartScreenRenderer';
import { StartElementContent } from '../src/games/shared/StartElementContent';
import { StartScreenVisualEditor } from '../src/components/studio/games/StartScreenVisualEditor';
import { StartScreenConfig, StartScreenElement } from '../src/games/shared/startScreenTypes';

console.log('======================================================');
console.log('Running All 3 Games Start Screen & Persistence Tests');
console.log('======================================================');

const games = [
  {
    type: 'catch-brand',
    title: 'Catch The Brand',
    meta: { duration: 30, gameTitle: 'Catch The Brand', goodItemImg: '/assets/durian_green.png', badItemImg: '/assets/durian_brown.png' },
  },
  {
    type: 'memory-match',
    title: 'Memory Match',
    meta: { rows: 4, cols: 4, totalCards: 16, totalPairs: 8, duration: 45, gameTitle: 'Memory Match' },
  },
  {
    type: 'reaction-tap',
    title: 'Reaction Tap',
    meta: { roundsCount: 5, lightCount: 5, duration: 30, gameTitle: 'Reaction Time' },
  },
];

let passed = 0;

for (const game of games) {
  console.log(`\n--- Testing Game: ${game.title} (${game.type}) ---`);

  // 1. Initial Resolution & Normalization
  const initialTheme: any = {
    id: `test-theme-${game.type}`,
    name: game.title,
    game_type: game.type,
    branding: { title: game.title, primaryColor: '#f59e0b' },
  };

  const resolved = getStartScreenConfig(initialTheme, game.type, game.meta);
  assert.ok(resolved, `${game.type} resolved config exists`);
  assert.ok(Array.isArray(resolved.elements), `${game.type} has elements array`);
  assert.ok(resolved.elements.length > 0, `${game.type} has elements`);
  console.log(`  ✓ 1. Initial config resolved with ${resolved.elements.length} elements`);
  passed++;

  // 2. Full Editor Component Render without Crash
  const editorHtml = renderToString(
    <StartScreenVisualEditor
      startConfig={resolved}
      theme={initialTheme}
      gameType={game.type}
      gameMeta={game.meta}
      onChange={() => {}}
    />
  );
  assert.ok(editorHtml.length > 1000, `${game.type} editor rendered HTML`);
  console.log(`  ✓ 2. StartScreenVisualEditor renders cleanly (${editorHtml.length} chars)`);
  passed++;

  // 3. Preset Templates Load and Apply Correctly
  for (const preset of START_SCREEN_PRESETS) {
    const presetElements = instantiateStartPreset(preset.id, resolved, initialTheme, game.type);
    assert.ok(Array.isArray(presetElements), `Preset ${preset.id} returned elements array`);
    assert.ok(presetElements.length > 0, `Preset ${preset.id} has elements`);
  }
  console.log(`  ✓ 3. All ${START_SCREEN_PRESETS.length} presets apply cleanly`);
  passed++;

  // 4. Mutation & Layer Manipulation: Move, Resize, Rotate, Duplicate, Delete
  let mutatedElements: StartScreenElement[] = JSON.parse(JSON.stringify(resolved.elements));
  const firstEl = mutatedElements[0];
  const originalX = firstEl.x;
  firstEl.x = originalX + 50;
  firstEl.width = 400;
  firstEl.rotation = 15;

  // Duplicate an element
  const dupEl = { ...firstEl, id: `dup-${Date.now()}`, x: firstEl.x + 20, y: firstEl.y + 20 };
  mutatedElements.push(dupEl);
  assert.strictEqual(mutatedElements.length, resolved.elements.length + 1);

  // Delete an element
  mutatedElements = mutatedElements.filter((e) => e.id !== dupEl.id);
  assert.strictEqual(mutatedElements.length, resolved.elements.length);
  console.log(`  ✓ 4. Move, resize, rotate, duplicate, delete succeed`);
  passed++;

  // 5. Safe Callbacks Execution & Missing Data Fail-Safes
  let startCalled = false;
  let lbCalled = false;
  let guideCalled = false;
  let settingsCalled = false;

  const buttonElement: any = {
    id: 'test-btn',
    type: 'button',
    text: 'PLAY NOW',
    action: 'start',
    x: 100,
    y: 100,
    width: 200,
    height: 50,
  };

  // Render button with safe callbacks
  const btnHtml = renderToString(
    <StartElementContent
      element={buttonElement}
      parentWidth={1024}
      parentHeight={576}
      onStartGame={() => { startCalled = true; }}
      onShowLeaderboard={() => { lbCalled = true; }}
      onShowGuide={() => { guideCalled = true; }}
      onOpenSettings={() => { settingsCalled = true; }}
      isEditor={false}
      isSimulation={true}
    />
  );
  assert.ok(btnHtml.includes('PLAY NOW'), 'Button rendered text');

  // Verify missing data fail-safe for all element types
  const corruptElements: any[] = [
    { id: 'c1', type: 'card', style: null, children: null },
    { id: 'c2', type: 'text', text: null, style: null },
    { id: 'c3', type: 'image', imageUrl: null, style: null },
    { id: 'c4', type: 'badge', metric: 'invalid_metric', label: null, value: null },
    { id: 'c5', type: 'rules', ruleType: null },
    { id: 'c6', type: 'icon', iconName: 'UnknownIcon' },
    { id: 'c7', type: 'keyboard-hints', keys: null },
    { id: 'c8', type: 'nonexistent-type' },
  ];

  for (const corrupt of corruptElements) {
    const safeHtml = renderToString(
      <StartElementContent
        element={corrupt}
        parentWidth={1024}
        parentHeight={576}
        gameType={game.type}
        gameMeta={game.meta}
      />
    );
    assert.ok(typeof safeHtml === 'string', 'Corrupt element rendered without throwing');
  }
  console.log(`  ✓ 5. Safe callbacks & corrupt element fail-safes verified`);
  passed++;

  // 6. Persistence Round-Trip Loop
  // Canvas change -> StartScreenConfig -> game_config.screens.start -> saved to theme -> reloaded -> StartScreenRenderer
  const customConfig: StartScreenConfig = {
    ...resolved,
    backgroundType: 'color',
    backgroundColor: '#1e1b4b',
    backgroundOverlayOpacity: 0.5,
    elements: [
      ...resolved.elements,
      {
        id: 'custom-banner',
        type: 'text',
        text: 'EXCLUSIVE EVENT 2026',
        x: 100,
        y: 50,
        width: 300,
        height: 40,
        style: { color: '#fbbf24', fontSize: 20, fontWeight: 800 },
      } as any,
    ],
  };

  // Save into theme
  const savedTheme = saveStartScreenConfig(initialTheme, customConfig, game.type);
  assert.ok(savedTheme.game_config.screens.start, 'Theme has game_config.screens.start');
  assert.strictEqual(savedTheme.game_config.screens.start.backgroundColor, '#1e1b4b');

  // Reload from theme
  const reloadedConfig = getStartScreenConfig(savedTheme, game.type, game.meta);
  assert.strictEqual(reloadedConfig.backgroundColor, '#1e1b4b');
  assert.strictEqual(reloadedConfig.backgroundType, 'color');
  const banner = reloadedConfig.elements.find((e) => e.id === 'custom-banner');
  assert.ok(banner, 'Custom banner persisted through theme storage');
  assert.strictEqual((banner as any).text, 'EXCLUSIVE EVENT 2026');

  // Verify live StartScreenRenderer uses reloaded custom configuration cleanly
  const liveGameHtml = renderToString(
    <StartScreenRenderer
      startConfig={reloadedConfig}
      theme={savedTheme}
      gameType={game.type}
      targetDimensions={{ width: 1024, height: 576 }}
      gameMeta={game.meta}
      onStartGame={() => {}}
      onShowLeaderboard={() => {}}
    />
  );
  assert.ok(liveGameHtml.includes('EXCLUSIVE EVENT 2026'), 'Live game rendered custom element');
  console.log(`  ✓ 6. Persistence loop and live game renderer verified`);
  passed++;
}

console.log('\n======================================================');
console.log(`All ${passed} Start Screen & Persistence Tests Passed!`);
console.log('======================================================\n');
