import assert from 'node:assert';
import {
  THEME_REGISTRY,
  getThemeById,
  normalizeGameTheme,
  resolveThemeBaseId,
} from './registry';
import { defaultCatchBrandTheme } from './defaultCatchBrand';
import { carnivalTheme } from './carnival';
import { memoryMatchTheme } from './memory-match';
import {
  resolveThemeDefaultBgImage,
  resolveThemeDefaultBasketImage,
  resolveThemeDefaultItemImage,
} from './gameAssetResolver';
import {
  getDefaultThemeForGameType,
  PRESET_THEMES,
  DEFAULT_CATCH_BRAND_THEME,
  DEFAULT_CARNIVAL_THEME,
  DEFAULT_MEMORY_THEME,
} from '../../server/db/themes';

console.log('======================================================');
console.log('RUNNING CATCH THE BRAND DEFAULT THEME ARCHITECTURE TESTS');
console.log('======================================================');

// 1. Backend: getDefaultThemeForGameType returns DEFAULT_CATCH_BRAND_THEME for catch-brand
const defaultCbTheme = getDefaultThemeForGameType('catch-brand');
assert.strictEqual(defaultCbTheme.slug, 'default', 'catch-brand default theme slug must be "default"');
assert.strictEqual(defaultCbTheme.is_default, true, 'catch-brand default theme must have is_default === true');
assert.strictEqual(defaultCbTheme.background_url, '/assets/games/catch-brand/themes/default/background.png');
console.log('✓ PASS: Backend getDefaultThemeForGameType returns default catch-brand theme');

// 2. Backend: Memory match default is distinct and does not fall back to carnival or catch-brand
const defaultMemTheme = getDefaultThemeForGameType('memory-match');
assert.strictEqual(defaultMemTheme.slug, 'memory-match', 'memory-match default theme slug must be "memory-match"');
assert.strictEqual(defaultMemTheme.background_url, '/assets/games/memory-match/themes/default/background.png');
console.log('✓ PASS: Backend getDefaultThemeForGameType returns memory-match theme for memory-match');

// 3. Backend: PRESET_THEMES contains both DEFAULT_CATCH_BRAND_THEME and DEFAULT_CARNIVAL_THEME
const presetSlugs = PRESET_THEMES.map((p) => p.slug);
assert.strictEqual(presetSlugs.includes('default'), true, 'PRESET_THEMES must contain default');
assert.strictEqual(presetSlugs.includes('carnival'), true, 'PRESET_THEMES must retain carnival');
console.log('✓ PASS: Backend PRESET_THEMES contains default and retains carnival');

// 4. Frontend: normalizeGameTheme with empty or default returns default Catch The Brand theme
const normalizedEmpty = normalizeGameTheme(null);
assert.strictEqual(normalizedEmpty.id, 'default', 'Normalized null must be "default"');
assert.strictEqual(normalizedEmpty.background_url, '/assets/games/catch-brand/themes/default/background.png');

const normalizedEmptyObj = normalizeGameTheme({});
assert.strictEqual(normalizedEmptyObj.base_theme_id, 'default');
assert.strictEqual(normalizedEmptyObj.background_url, '/assets/games/catch-brand/themes/default/background.png');
console.log('✓ PASS: normalizeGameTheme defaults to default Catch The Brand theme');

// 5. Frontend: Explicit Carnival theme preserves its Carnival identity and assets
const normalizedCarnival = normalizeGameTheme(carnivalTheme);
assert.strictEqual(normalizedCarnival.id, 'carnival');
assert.strictEqual(normalizedCarnival.base_theme_id, 'carnival');
assert.strictEqual(normalizedCarnival.background_url, '/assets/themes/carnival/background.png');
assert.strictEqual(normalizedCarnival.basket_config?.imageUrl, '/assets/themes/carnival/basket.png');
console.log('✓ PASS: Explicit Carnival theme preserves Carnival identity and assets');

// 6. Frontend: resolveThemeBaseId maps default to 'default', carnival to 'carnival'
assert.strictEqual(resolveThemeBaseId({ id: 'default' }), 'default');
assert.strictEqual(resolveThemeBaseId({ slug: 'default' }), 'default');
assert.strictEqual(resolveThemeBaseId({ id: 'carnival' }), 'carnival');
assert.strictEqual(resolveThemeBaseId({ slug: 'carnival' }), 'carnival');
assert.strictEqual(resolveThemeBaseId({ id: 'unknown-id', game_type: 'catch-brand' }), 'default');
console.log('✓ PASS: resolveThemeBaseId correctly distinguishes default and carnival');

// 7. Frontend: getThemeById fallbacks to defaultCatchBrandTheme when active theme is null
const nonExistentTheme = getThemeById('non-existent-theme-xyz');
assert.ok(nonExistentTheme, 'Must return a valid theme');
assert.strictEqual(nonExistentTheme.id, 'default', 'Fallback theme must be default');
console.log('✓ PASS: getThemeById falls back to defaultCatchBrandTheme');

// 8. Asset Resolver: game-scoped paths for catch-brand default vs carnival
const defaultBg = resolveThemeDefaultBgImage({ base_theme_id: 'default', game_type: 'catch-brand' });
assert.strictEqual(defaultBg, '/assets/games/catch-brand/themes/default/background.png');

const defaultBasket = resolveThemeDefaultBasketImage({ base_theme_id: 'default', game_type: 'catch-brand' });
assert.strictEqual(defaultBasket, '/assets/games/catch-brand/themes/default/basket.png');

const defaultItem = resolveThemeDefaultItemImage({ base_theme_id: 'default', game_type: 'catch-brand' }, 'goodItem');
assert.strictEqual(defaultItem, '/assets/games/catch-brand/themes/default/item_normal_01.png');
console.log('✓ PASS: Asset Resolver produces canonical game-scoped paths for catch-brand default');

console.log('======================================================');
console.log('ALL CATCH THE BRAND DEFAULT THEME ARCHITECTURE TESTS PASSED!');
console.log('======================================================');
