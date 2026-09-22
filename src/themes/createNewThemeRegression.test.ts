import assert from 'node:assert';
import {
  getDefaultThemeForGameType as getClientDefaultTheme,
  defaultCatchBrandTheme,
  carnivalTheme,
  memoryMatchTheme,
  reactionTheme,
} from './index';
import {
  getDefaultThemeForGameType as getServerDefaultTheme,
  DEFAULT_CATCH_BRAND_THEME,
  DEFAULT_CARNIVAL_THEME,
  DEFAULT_MEMORY_THEME,
  DEFAULT_REACTION_THEME,
  DEFAULT_DURIAN_THEME,
} from '../../server/db/themes';

console.log('======================================================');
console.log('RUNNING CREATE NEW THEME REGRESSION TESTS');
console.log('======================================================');

// 1. Client-side getDefaultThemeForGameType returns authoritative defaults
assert.strictEqual(
  getClientDefaultTheme('catch-brand').id,
  'default',
  'Client catch-brand default must be "default" (defaultCatchBrandTheme)'
);
assert.strictEqual(
  getClientDefaultTheme('catch-brand').background_url,
  '/assets/games/catch-brand/themes/default/background.png'
);
assert.strictEqual(
  getClientDefaultTheme('memory-match').id,
  'memory-match',
  'Client memory-match default must be memoryMatchTheme'
);
assert.strictEqual(
  getClientDefaultTheme('reaction-tap').id,
  'reaction-tap',
  'Client reaction-tap default must be reactionTheme'
);
assert.strictEqual(
  getClientDefaultTheme(undefined).id,
  'default',
  'Client undefined gameType must fall back to defaultCatchBrandTheme'
);
console.log('✓ PASS: Client getDefaultThemeForGameType returns correct game defaults');

// 2. Server-side getDefaultThemeForGameType returns authoritative defaults
assert.strictEqual(
  getServerDefaultTheme('catch-brand').slug,
  'default',
  'Server catch-brand default must be "default"'
);
assert.strictEqual(
  getServerDefaultTheme('catch-brand').background_url,
  '/assets/games/catch-brand/themes/default/background.png'
);
assert.strictEqual(
  getServerDefaultTheme('memory-match').slug,
  'memory-match',
  'Server memory-match default must be "memory-match"'
);
assert.strictEqual(
  getServerDefaultTheme('reaction-tap').slug,
  'reaction-tap',
  'Server reaction-tap default must be "reaction-tap"'
);
assert.strictEqual(
  getServerDefaultTheme(undefined).slug,
  'default',
  'Server undefined gameType must fall back to DEFAULT_CATCH_BRAND_THEME'
);
console.log('✓ PASS: Server getDefaultThemeForGameType returns correct game defaults');

// 3. DEFAULT_DURIAN_THEME is mapped to DEFAULT_CATCH_BRAND_THEME, not Carnival
assert.strictEqual(
  DEFAULT_DURIAN_THEME.slug,
  'default',
  'DEFAULT_DURIAN_THEME must map to DEFAULT_CATCH_BRAND_THEME'
);
assert.strictEqual(
  DEFAULT_DURIAN_THEME.background_url,
  '/assets/games/catch-brand/themes/default/background.png'
);
assert.notStrictEqual(
  DEFAULT_DURIAN_THEME.background_url,
  DEFAULT_CARNIVAL_THEME.background_url,
  'DEFAULT_DURIAN_THEME must NOT inherit Carnival background'
);
console.log('✓ PASS: DEFAULT_DURIAN_THEME is safely aliased to DEFAULT_CATCH_BRAND_THEME');

// 4. Create New Theme "Start from scratch" does NOT inherit Carnival even if Carnival is in existingThemes
function simulateCreateFromScratch(gameSlug: string, existingThemes: any[]) {
  const isReactionGame = gameSlug.includes('reaction');
  const isMemoryGame = !isReactionGame && gameSlug.includes('memory');
  const resolvedGameSlug = isReactionGame ? 'reaction-tap' : isMemoryGame ? 'memory-match' : 'catch-brand';
  
  // Clean baseline resolution matching CreateThemeDialog.tsx
  const defaultBase = getClientDefaultTheme(resolvedGameSlug);
  const base = defaultBase;

  return {
    game_slug: resolvedGameSlug,
    background_url: base.background_url,
    basket_config: (isReactionGame || isMemoryGame) ? null : JSON.parse(JSON.stringify(base.basket_config)),
    items_config: JSON.parse(JSON.stringify(base.items_config || [])),
  };
}

const scratchCatchBrand = simulateCreateFromScratch('catch-brand', [carnivalTheme]);
assert.strictEqual(
  scratchCatchBrand.background_url,
  '/assets/games/catch-brand/themes/default/background.png',
  'Scratch Catch The Brand theme must have default background'
);
assert.strictEqual(
  scratchCatchBrand.basket_config?.imageUrl,
  '/assets/games/catch-brand/themes/default/basket.png',
  'Scratch Catch The Brand theme must have default basket'
);
assert.ok(
  scratchCatchBrand.items_config[0]?.imageUrl.includes('catch-brand/themes/default'),
  'Scratch Catch The Brand items must point to default catch-brand assets'
);
assert.ok(
  !scratchCatchBrand.background_url.includes('carnival'),
  'Scratch Catch The Brand must NOT contain carnival in background_url'
);
console.log('✓ PASS: Create New Theme from scratch for Catch The Brand uses defaultCatchBrandTheme, ignoring existing Carnival');

// 5. Create New Theme "Duplicate" preserves explicit source
function simulateDuplicate(sourceThemeId: string, existingThemes: any[]) {
  const source = existingThemes.find((t) => t.id === sourceThemeId);
  if (!source) throw new Error('Source not found');
  return {
    game_slug: source.game_slug || source.games?.slug || 'catch-brand',
    background_url: source.background_url,
    basket_config: JSON.parse(JSON.stringify(source.basket_config || {})),
    items_config: JSON.parse(JSON.stringify(source.items_config || [])),
  };
}

const duplicatedCarnival = simulateDuplicate('carnival', [carnivalTheme, defaultCatchBrandTheme]);
assert.strictEqual(
  duplicatedCarnival.background_url,
  '/assets/themes/carnival/background.png',
  'Duplicating Carnival must preserve Carnival background'
);
assert.strictEqual(
  duplicatedCarnival.basket_config?.imageUrl,
  '/assets/themes/carnival/basket.png',
  'Duplicating Carnival must preserve Carnival basket'
);
console.log('✓ PASS: Duplicating Carnival preserves explicit Carnival source assets');

console.log('======================================================');
console.log('ALL CREATE NEW THEME REGRESSION TESTS PASSED!');
console.log('======================================================');
