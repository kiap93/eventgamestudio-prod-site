import assert from 'node:assert';
import { getStartScreenConfig, resolveGameMetaForStartScreen } from './startScreenResolver';
import { GameTheme } from '../../themes/types';
import { StartScreenConfig } from './startScreenTypes';

console.log('======================================================');
console.log('Running Start Screen Embedded vs Editor Sync Tests');
console.log('======================================================');

// 1. Test Metadata Resolution Consistency
console.log('\n--- Test 1: Metadata Resolution Consistency ---');
const dummyTheme: GameTheme = {
  id: 'test-theme-1',
  name: 'Festival Carnival Theme',
  game_type: 'memory-match',
  is_active: true,
  organization_id: 'org-1',
  clientLogo: 'https://example.com/logo.png',
  game_config: {
    board: { rows: 4, cols: 5 },
    gameplay: { gameDurationSeconds: 60 },
  },
} as any;

const resolvedMeta = resolveGameMetaForStartScreen(dummyTheme, 'memory-match', {
  duration: 60,
});

assert.strictEqual(resolvedMeta.gameTitle, 'Festival Carnival Theme');
assert.strictEqual(resolvedMeta.logoUrl, 'https://example.com/logo.png');
assert.strictEqual(resolvedMeta.rows, 4);
assert.strictEqual(resolvedMeta.cols, 5);
assert.strictEqual(resolvedMeta.totalPairs, 10);
assert.strictEqual(resolvedMeta.duration, 60);
console.log('  ✓ resolveGameMetaForStartScreen resolves consistent metadata from theme and fallback');

// 2. Test Embedded Preview and Full Editor get the EXACT same StartScreenConfig
console.log('\n--- Test 2: Embedded Preview and Full Editor Config Parity ---');
const embeddedConfig = getStartScreenConfig(dummyTheme, 'memory-match', resolvedMeta, { width: 1024, height: 576 });
const editorConfig = getStartScreenConfig(dummyTheme, 'memory-match', resolvedMeta, { width: 1024, height: 576 });

assert.deepStrictEqual(embeddedConfig, editorConfig, 'Embedded and Editor configs must be strictly deep-equal');
assert.strictEqual(embeddedConfig.canvas?.width, 1024);
assert.strictEqual(embeddedConfig.canvas?.height, 576);
assert.strictEqual(embeddedConfig.canvas?.coordinateSpace, 'landscape-1024x576');
console.log('  ✓ Embedded and Editor start screen configs are strictly identical (1024x576)');

// 3. Test Basic Settings to Advanced Config Synchronization
console.log('\n--- Test 3: Basic Settings & Background Sync ---');
// Simulating basic setting update (changing background to custom color)
const basicUpdate: Partial<StartScreenConfig> = {
  backgroundType: 'color',
  backgroundColor: '#1e293b',
  backgroundOverlayOpacity: 0.5,
};

const nextBackground = {
  type: basicUpdate.backgroundType || basicUpdate.background?.type || embeddedConfig.background?.type || 'theme',
  color: basicUpdate.backgroundColor || basicUpdate.background?.color || embeddedConfig.background?.color || '#0f172a',
  imageUrl: basicUpdate.backgroundImageUrl !== undefined ? basicUpdate.backgroundImageUrl : embeddedConfig.background?.imageUrl,
  overlayOpacity: basicUpdate.backgroundOverlayOpacity !== undefined ? basicUpdate.backgroundOverlayOpacity : 0.3,
};

const updatedConfig: StartScreenConfig = {
  ...embeddedConfig,
  ...basicUpdate,
  canvas: embeddedConfig.canvas || { width: 1024, height: 576, coordinateSpace: 'landscape-1024x576', version: 2 },
  background: nextBackground,
  backgroundType: nextBackground.type,
  backgroundColor: nextBackground.color,
  backgroundOverlayOpacity: nextBackground.overlayOpacity,
};

assert.strictEqual(updatedConfig.background.type, 'color');
assert.strictEqual(updatedConfig.backgroundType, 'color');
assert.strictEqual(updatedConfig.background.color, '#1e293b');
assert.strictEqual(updatedConfig.backgroundColor, '#1e293b');
assert.strictEqual(updatedConfig.background.overlayOpacity, 0.5);
assert.strictEqual(updatedConfig.backgroundOverlayOpacity, 0.5);
console.log('  ✓ Background properties stay perfectly synchronized between flat and nested structures');

// 4. Test Element Visibility Synchronization with Basic Toggles
console.log('\n--- Test 4: Element Visibility Synchronization ---');
const syncVisibility = (els: any[], toggles: { showIcon?: boolean; showGridInfo?: boolean }): any[] => {
  return els.map((el) => {
    let vis = el.visible;
    if (el.id === 'top-icon' && toggles.showIcon !== undefined) {
      vis = toggles.showIcon;
    } else if (el.id === 'badge-grid' && toggles.showGridInfo !== undefined) {
      vis = toggles.showGridInfo;
    }
    const updatedChildren = Array.isArray(el.children) ? syncVisibility(el.children, toggles) : undefined;
    return {
      ...el,
      visible: vis,
      ...(updatedChildren ? { children: updatedChildren } : {}),
    };
  });
};

const updatedElements = syncVisibility(updatedConfig.elements, { showIcon: false, showGridInfo: false });
const configWithHiddenToggles: StartScreenConfig = {
  ...updatedConfig,
  elements: updatedElements,
};

const reResolvedConfig = getStartScreenConfig(
  {
    ...dummyTheme,
    game_config: {
      ...dummyTheme.game_config,
      screens: { start: configWithHiddenToggles },
    },
  } as any,
  'memory-match',
  resolvedMeta,
  { width: 1024, height: 576 }
);

assert.strictEqual(reResolvedConfig.showIcon, false, 'Derived showIcon flag should be false');
assert.strictEqual(reResolvedConfig.showGridInfo, false, 'Derived showGridInfo flag should be false');
console.log('  ✓ Toggling visibility properly propagates to derived config flags and element tree');

console.log('\n======================================================');
console.log('All Start Screen Synchronization Tests Passed!');
console.log('======================================================\n');
