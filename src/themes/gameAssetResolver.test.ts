import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {
  resolveGameAsset,
  getAssetThemeId,
  validateGameThemeAssets,
  resolveThemeDefaultBgImage,
  resolveThemeDefaultBasketImage,
  resolveThemeDefaultItemImage,
  THEME_ASSET_ALIASES,
} from './gameAssetResolver';
import { christmasTheme } from './christmas';
import { cnyTheme } from './cny';
import { carnivalTheme } from './carnival';
import { defaultCatchBrandTheme } from './defaultCatchBrand';
import { THEME_REGISTRY, normalizeGameTheme } from './registry';

console.log('======================================================');
console.log('RUNNING GAME ASSET RESOLVER & THEME NORMALIZATION TESTS');
console.log('======================================================');

// 1. Verify getAssetThemeId normalization & aliases
assert.strictEqual(getAssetThemeId(christmasTheme), 'christmas');
assert.strictEqual(getAssetThemeId({ id: 'christmas-rush' }), 'christmas');
assert.strictEqual(getAssetThemeId({ slug: 'christmas-rush' }), 'christmas');
assert.strictEqual(getAssetThemeId({ base_theme_id: 'christmas' }), 'christmas');

assert.strictEqual(getAssetThemeId(cnyTheme), 'cny');
assert.strictEqual(getAssetThemeId({ id: 'cny' }), 'cny');
assert.strictEqual(getAssetThemeId({ id: 'chinese-new-year' }), 'cny');
assert.strictEqual(getAssetThemeId({ slug: 'cny-fortune' }), 'cny');
assert.strictEqual(getAssetThemeId({ base_theme_id: 'cny' }), 'cny');
assert.strictEqual(getAssetThemeId({ base_theme_id: 'chinese-new-year' }), 'cny');
console.log('✓ PASS: getAssetThemeId correctly normalizes Christmas and CNY IDs and aliases');

// 2. Verify Christmas URL resolution
const christmasAssets = {
  background: resolveGameAsset({ gameType: 'catch-brand', themeId: 'christmas', assetType: 'background' }),
  catcher: resolveGameAsset({ gameType: 'catch-brand', themeId: 'christmas', assetType: 'catcher' }),
  goodItem: resolveGameAsset({ gameType: 'catch-brand', themeId: 'christmas', assetType: 'goodItem' }),
  hazardItem: resolveGameAsset({ gameType: 'catch-brand', themeId: 'christmas', assetType: 'hazardItem' }),
  bonusItem: resolveGameAsset({ gameType: 'catch-brand', themeId: 'christmas', assetType: 'bonusItem' }),
};

assert.strictEqual(christmasAssets.background, '/assets/games/catch-brand/themes/christmas/background.png');
assert.strictEqual(christmasAssets.catcher, '/assets/games/catch-brand/themes/christmas/basket.png');
assert.strictEqual(christmasAssets.goodItem, '/assets/games/catch-brand/themes/christmas/item_normal_01.png');
assert.strictEqual(christmasAssets.hazardItem, '/assets/games/catch-brand/themes/christmas/item_hazard_01.png');
assert.strictEqual(christmasAssets.bonusItem, '/assets/games/catch-brand/themes/christmas/item_bonus_01.png');
console.log('✓ PASS: Christmas theme resolves all 5 assets to canonical paths');

// 2b. Verify Christmas alias resolution
const christmasAliasBg = resolveGameAsset({ gameType: 'catch-brand', themeId: 'christmas-rush', assetType: 'background' });
assert.strictEqual(christmasAliasBg, '/assets/games/catch-brand/themes/christmas/background.png');
console.log('✓ PASS: "christmas-rush" alias resolves to christmas folder');

// 3. Verify CNY URL resolution
const cnyAssets = {
  background: resolveGameAsset({ gameType: 'catch-brand', themeId: 'cny', assetType: 'background' }),
  catcher: resolveGameAsset({ gameType: 'catch-brand', themeId: 'cny', assetType: 'catcher' }),
  goodItem: resolveGameAsset({ gameType: 'catch-brand', themeId: 'cny', assetType: 'goodItem' }),
  hazardItem: resolveGameAsset({ gameType: 'catch-brand', themeId: 'cny', assetType: 'hazardItem' }),
  bonusItem: resolveGameAsset({ gameType: 'catch-brand', themeId: 'cny', assetType: 'bonusItem' }),
};

assert.strictEqual(cnyAssets.background, '/assets/games/catch-brand/themes/cny/background.png');
assert.strictEqual(cnyAssets.catcher, '/assets/games/catch-brand/themes/cny/basket.png');
assert.strictEqual(cnyAssets.goodItem, '/assets/games/catch-brand/themes/cny/item_normal_01.png');
assert.strictEqual(cnyAssets.hazardItem, '/assets/games/catch-brand/themes/cny/item_hazard_01.png');
assert.strictEqual(cnyAssets.bonusItem, '/assets/games/catch-brand/themes/cny/item_bonus_01.png');
console.log('✓ PASS: CNY theme resolves all 5 assets to canonical paths');

// 3b. Verify CNY alias resolution
const cnyAliases = ['cny-fortune', 'chinese-new-year'];
for (const alias of cnyAliases) {
  const bg = resolveGameAsset({ gameType: 'catch-brand', themeId: alias, assetType: 'background' });
  const basket = resolveGameAsset({ gameType: 'catch-brand', themeId: alias, assetType: 'catcher' });
  assert.strictEqual(bg, '/assets/games/catch-brand/themes/cny/background.png', `Alias ${alias} background`);
  assert.strictEqual(basket, '/assets/games/catch-brand/themes/cny/basket.png', `Alias ${alias} basket`);
}
console.log('✓ PASS: "cny-fortune" and "chinese-new-year" aliases resolve to cny folder');

// 4. Verify validateGameThemeAssets()
const valChristmas = validateGameThemeAssets(christmasTheme);
assert.strictEqual(valChristmas.valid, true, 'Christmas validation must pass');
assert.strictEqual(valChristmas.missing.length, 0, 'Christmas must have 0 missing assets');
assert.strictEqual(valChristmas.found.length, 5, 'Christmas must have 5 found assets');
assert.ok(valChristmas.found.some((f) => f.includes('/assets/games/catch-brand/themes/christmas/background.png')));
assert.ok(valChristmas.found.some((f) => f.includes('/assets/games/catch-brand/themes/christmas/basket.png')));
assert.ok(valChristmas.found.some((f) => f.includes('/assets/games/catch-brand/themes/christmas/item_normal_01.png')));
assert.ok(valChristmas.found.some((f) => f.includes('/assets/games/catch-brand/themes/christmas/item_hazard_01.png')));
assert.ok(valChristmas.found.some((f) => f.includes('/assets/games/catch-brand/themes/christmas/item_bonus_01.png')));

const valCny = validateGameThemeAssets(cnyTheme);
assert.strictEqual(valCny.valid, true, 'CNY validation must pass');
assert.strictEqual(valCny.missing.length, 0, 'CNY must have 0 missing assets');
assert.strictEqual(valCny.found.length, 5, 'CNY must have 5 found assets');
assert.ok(valCny.found.some((f) => f.includes('/assets/games/catch-brand/themes/cny/background.png')));
assert.ok(valCny.found.some((f) => f.includes('/assets/games/catch-brand/themes/cny/basket.png')));
assert.ok(valCny.found.some((f) => f.includes('/assets/games/catch-brand/themes/cny/item_normal_01.png')));
assert.ok(valCny.found.some((f) => f.includes('/assets/games/catch-brand/themes/cny/item_hazard_01.png')));
assert.ok(valCny.found.some((f) => f.includes('/assets/games/catch-brand/themes/cny/item_bonus_01.png')));
console.log('✓ PASS: validateGameThemeAssets passes for Christmas and CNY with 5/5 assets');

// 5. Verify resolveThemeDefault* helper functions
assert.strictEqual(resolveThemeDefaultBgImage(christmasTheme), '/assets/games/catch-brand/themes/christmas/background.png');
assert.strictEqual(resolveThemeDefaultBasketImage(christmasTheme), '/assets/games/catch-brand/themes/christmas/basket.png');
assert.strictEqual(
  resolveThemeDefaultItemImage(christmasTheme, { isHazard: false, isBonus: false }),
  '/assets/games/catch-brand/themes/christmas/item_normal_01.png'
);
assert.strictEqual(
  resolveThemeDefaultItemImage(christmasTheme, { isHazard: true, isBonus: false }),
  '/assets/games/catch-brand/themes/christmas/item_hazard_01.png'
);
assert.strictEqual(
  resolveThemeDefaultItemImage(christmasTheme, { isHazard: false, isBonus: true }),
  '/assets/games/catch-brand/themes/christmas/item_bonus_01.png'
);

assert.strictEqual(resolveThemeDefaultBgImage(cnyTheme), '/assets/games/catch-brand/themes/cny/background.png');
assert.strictEqual(resolveThemeDefaultBasketImage(cnyTheme), '/assets/games/catch-brand/themes/cny/basket.png');
assert.strictEqual(
  resolveThemeDefaultItemImage(cnyTheme, { isHazard: false, isBonus: false }),
  '/assets/games/catch-brand/themes/cny/item_normal_01.png'
);
assert.strictEqual(
  resolveThemeDefaultItemImage(cnyTheme, { isHazard: true, isBonus: false }),
  '/assets/games/catch-brand/themes/cny/item_hazard_01.png'
);
assert.strictEqual(
  resolveThemeDefaultItemImage(cnyTheme, { isHazard: false, isBonus: true }),
  '/assets/games/catch-brand/themes/cny/item_bonus_01.png'
);
console.log('✓ PASS: resolveThemeDefault* helpers return exact canonical paths for Christmas and CNY');

// 6. Verify NO FALLBACK TO CARNIVAL OR DEFAULT for Christmas/CNY
for (const theme of [christmasTheme, cnyTheme]) {
  const bg = resolveThemeDefaultBgImage(theme);
  const basket = resolveThemeDefaultBasketImage(theme);
  const good = resolveThemeDefaultItemImage(theme, { isHazard: false, isBonus: false });
  const hazard = resolveThemeDefaultItemImage(theme, { isHazard: true, isBonus: false });
  const bonus = resolveThemeDefaultItemImage(theme, { isHazard: false, isBonus: true });

  for (const url of [bg, basket, good, hazard, bonus]) {
    assert.strictEqual(url.includes('carnival'), false, `Theme ${theme.name} must never fall back to carnival: ${url}`);
    assert.strictEqual(url.includes('/default/'), false, `Theme ${theme.name} must never fall back to default: ${url}`);
  }
}
console.log('✓ PASS: Neither Christmas nor CNY falls back to Carnival or Default');

// 7. Verify Carnival is NOT broken and resolves correctly
const carnivalBg = resolveGameAsset({ gameType: 'catch-brand', themeId: 'carnival', assetType: 'background' });
const carnivalBasket = resolveGameAsset({ gameType: 'catch-brand', themeId: 'carnival', assetType: 'catcher' });
assert.strictEqual(carnivalBg, '/assets/games/catch-brand/themes/carnival/background.png');
assert.strictEqual(carnivalBasket, '/assets/games/catch-brand/themes/carnival/basket.png');
console.log('✓ PASS: Carnival remains intact and resolves to /assets/games/catch-brand/themes/carnival/');

// 8. Verify Default is NOT broken and resolves correctly
const defaultBg = resolveGameAsset({ gameType: 'catch-brand', themeId: 'default', assetType: 'background' });
assert.strictEqual(defaultBg, '/assets/games/catch-brand/themes/default/background.png');
console.log('✓ PASS: Default remains intact and resolves to /assets/games/catch-brand/themes/default/');

// 9. Verify physical files exist on disk in public directory
const publicDir = path.resolve('public');
const filesToCheck = [
  'assets/games/catch-brand/themes/christmas/background.png',
  'assets/games/catch-brand/themes/christmas/basket.png',
  'assets/games/catch-brand/themes/christmas/item_normal_01.png',
  'assets/games/catch-brand/themes/christmas/item_hazard_01.png',
  'assets/games/catch-brand/themes/christmas/item_bonus_01.png',
  'assets/games/catch-brand/themes/cny/background.png',
  'assets/games/catch-brand/themes/cny/basket.png',
  'assets/games/catch-brand/themes/cny/item_normal_01.png',
  'assets/games/catch-brand/themes/cny/item_hazard_01.png',
  'assets/games/catch-brand/themes/cny/item_bonus_01.png',
  'assets/games/catch-brand/themes/carnival/background.png',
  'assets/games/catch-brand/themes/carnival/basket.png',
  'assets/games/catch-brand/themes/default/background.png',
  'assets/games/catch-brand/themes/default/basket.png',
];

for (const relFile of filesToCheck) {
  const fullPath = path.join(publicDir, relFile);
  assert.ok(fs.existsSync(fullPath), `Physical file must exist on disk: ${relFile}`);
  const stat = fs.statSync(fullPath);
  assert.ok(stat.size > 1000, `File ${relFile} must have non-trivial size (actual: ${stat.size} bytes)`);
}
console.log(`✓ PASS: All ${filesToCheck.length} verified image assets exist on disk with valid file sizes`);

// 10. Verify Game Isolation
const memoryBg = resolveGameAsset({ gameType: 'memory-match', themeId: 'christmas', assetType: 'background' });
assert.strictEqual(memoryBg, '/assets/games/memory-match/themes/default/background.png');
const memoryCatcher = resolveGameAsset({ gameType: 'memory-match', themeId: 'cny', assetType: 'catcher' });
assert.strictEqual(memoryCatcher, null, 'Memory match does not have a catcher asset');
console.log('✓ PASS: Game isolation preserved across games');

console.log('======================================================');
console.log('ALL GAME ASSET RESOLVER TESTS PASSED SUCCESSFULLY!');
console.log('======================================================');
