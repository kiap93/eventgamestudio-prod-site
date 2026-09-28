import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {
  resolveGameAsset,
  resolveThemeAsset,
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
import { halloweenTheme } from './halloween';
import { mangoTheme } from './mango';
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

// Halloween aliases and canonical ID
assert.strictEqual(getAssetThemeId(halloweenTheme), 'halloween');
assert.strictEqual(getAssetThemeId('halloween'), 'halloween');
assert.strictEqual(getAssetThemeId('halloween-spooky'), 'halloween');
assert.strictEqual(getAssetThemeId('spooky-halloween'), 'halloween');
assert.strictEqual(getAssetThemeId({ id: 'halloween' }), 'halloween');
assert.strictEqual(getAssetThemeId({ slug: 'halloween-spooky' }), 'halloween');
assert.strictEqual(getAssetThemeId({ slug: 'spooky-halloween' }), 'halloween');
assert.strictEqual(getAssetThemeId({ base_theme_id: 'halloween' }), 'halloween');

// Mango aliases and canonical ID
assert.strictEqual(getAssetThemeId(mangoTheme), 'mango');
assert.strictEqual(getAssetThemeId('mango'), 'mango');
assert.strictEqual(getAssetThemeId('mango-festival'), 'mango');
assert.strictEqual(getAssetThemeId('mango-harvest'), 'mango');
assert.strictEqual(getAssetThemeId({ id: 'mango' }), 'mango');
assert.strictEqual(getAssetThemeId({ slug: 'mango-festival' }), 'mango');
assert.strictEqual(getAssetThemeId({ slug: 'mango-harvest' }), 'mango');
assert.strictEqual(getAssetThemeId({ base_theme_id: 'mango' }), 'mango');

console.log('✓ PASS: getAssetThemeId correctly normalizes Christmas, CNY, Halloween, and Mango IDs and aliases');

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

// 3c. Verify Halloween URL resolution (Requirement 11)
const halloweenAssets = {
  background: resolveGameAsset({ gameType: 'catch-brand', themeId: 'halloween', assetType: 'background' }),
  catcher: resolveGameAsset({ gameType: 'catch-brand', themeId: 'halloween', assetType: 'catcher' }),
  goodItem: resolveGameAsset({ gameType: 'catch-brand', themeId: 'halloween', assetType: 'goodItem' }),
  hazardItem: resolveGameAsset({ gameType: 'catch-brand', themeId: 'halloween', assetType: 'hazardItem' }),
  bonusItem: resolveGameAsset({ gameType: 'catch-brand', themeId: 'halloween', assetType: 'bonusItem' }),
};

assert.strictEqual(halloweenAssets.background, '/assets/games/catch-brand/themes/halloween/background.png');
assert.strictEqual(halloweenAssets.catcher, '/assets/games/catch-brand/themes/halloween/basket.png');
assert.strictEqual(halloweenAssets.goodItem, '/assets/games/catch-brand/themes/halloween/item_normal_01.png');
assert.strictEqual(halloweenAssets.hazardItem, '/assets/games/catch-brand/themes/halloween/item_hazard_01.png');
assert.strictEqual(halloweenAssets.bonusItem, '/assets/games/catch-brand/themes/halloween/item_bonus_01.png');
console.log('✓ PASS: Halloween theme resolves all 5 assets to canonical paths');

// 3d. Verify Halloween alias resolution (halloween-spooky -> halloween)
const halloweenAliases = ['halloween-spooky', 'spooky-halloween'];
for (const alias of halloweenAliases) {
  const bg = resolveGameAsset({ gameType: 'catch-brand', themeId: alias, assetType: 'background' });
  const basket = resolveGameAsset({ gameType: 'catch-brand', themeId: alias, assetType: 'catcher' });
  assert.strictEqual(bg, '/assets/games/catch-brand/themes/halloween/background.png', `Alias ${alias} background`);
  assert.strictEqual(basket, '/assets/games/catch-brand/themes/halloween/basket.png', `Alias ${alias} basket`);
}
console.log('✓ PASS: "halloween-spooky" and "spooky-halloween" aliases resolve to halloween folder');

// 3e. Verify Mango URL resolution (Requirement 11)
const mangoAssets = {
  background: resolveGameAsset({ gameType: 'catch-brand', themeId: 'mango', assetType: 'background' }),
  catcher: resolveGameAsset({ gameType: 'catch-brand', themeId: 'mango', assetType: 'catcher' }),
  goodItem: resolveGameAsset({ gameType: 'catch-brand', themeId: 'mango', assetType: 'goodItem' }),
  hazardItem: resolveGameAsset({ gameType: 'catch-brand', themeId: 'mango', assetType: 'hazardItem' }),
  bonusItem: resolveGameAsset({ gameType: 'catch-brand', themeId: 'mango', assetType: 'bonusItem' }),
};

assert.strictEqual(mangoAssets.background, '/assets/games/catch-brand/themes/mango/background.png');
assert.strictEqual(mangoAssets.catcher, '/assets/games/catch-brand/themes/mango/basket.png');
assert.strictEqual(mangoAssets.goodItem, '/assets/games/catch-brand/themes/mango/item_normal_01.png');
assert.strictEqual(mangoAssets.hazardItem, '/assets/games/catch-brand/themes/mango/item_hazard_01.png');
assert.strictEqual(mangoAssets.bonusItem, '/assets/games/catch-brand/themes/mango/item_bonus_01.png');
console.log('✓ PASS: Mango theme resolves all 5 assets to canonical paths');

// 3f. Verify Mango alias resolution (mango-festival -> mango)
const mangoAliases = ['mango-festival', 'mango-harvest'];
for (const alias of mangoAliases) {
  const bg = resolveGameAsset({ gameType: 'catch-brand', themeId: alias, assetType: 'background' });
  const basket = resolveGameAsset({ gameType: 'catch-brand', themeId: alias, assetType: 'catcher' });
  assert.strictEqual(bg, '/assets/games/catch-brand/themes/mango/background.png', `Alias ${alias} background`);
  assert.strictEqual(basket, '/assets/games/catch-brand/themes/mango/basket.png', `Alias ${alias} basket`);
}
console.log('✓ PASS: "mango-festival" and "mango-harvest" aliases resolve to mango folder');

// 3g. Verify resolveThemeAsset helper function
assert.strictEqual(resolveThemeAsset('halloween', 'background'), '/assets/games/catch-brand/themes/halloween/background.png');
assert.strictEqual(resolveThemeAsset('halloween', 'catcher'), '/assets/games/catch-brand/themes/halloween/basket.png');
assert.strictEqual(resolveThemeAsset('mango', 'hazard'), '/assets/games/catch-brand/themes/mango/item_hazard_01.png');
assert.strictEqual(resolveThemeAsset('mango', 'good'), '/assets/games/catch-brand/themes/mango/item_normal_01.png');
assert.strictEqual(resolveThemeAsset('mango', 'bonus'), '/assets/games/catch-brand/themes/mango/item_bonus_01.png');
console.log('✓ PASS: resolveThemeAsset helper correctly resolves halloween and mango assets');

// 4. Verify validateGameThemeAssets()
for (const [themeObj, name] of [[christmasTheme, 'Christmas'], [cnyTheme, 'CNY'], [halloweenTheme, 'Halloween'], [mangoTheme, 'Mango']] as const) {
  const val = validateGameThemeAssets(themeObj);
  assert.strictEqual(val.valid, true, `${name} validation must pass`);
  assert.strictEqual(val.missing.length, 0, `${name} must have 0 missing assets`);
  assert.strictEqual(val.found.length, 5, `${name} must have 5 found assets`);
}
console.log('✓ PASS: validateGameThemeAssets passes for Christmas, CNY, Halloween, and Mango with 5/5 assets');

// 5. Verify resolveThemeDefault* helper functions
assert.strictEqual(resolveThemeDefaultBgImage(halloweenTheme), '/assets/games/catch-brand/themes/halloween/background.png');
assert.strictEqual(resolveThemeDefaultBasketImage(halloweenTheme), '/assets/games/catch-brand/themes/halloween/basket.png');
assert.strictEqual(resolveThemeDefaultItemImage(halloweenTheme, { isHazard: false, isBonus: false }), '/assets/games/catch-brand/themes/halloween/item_normal_01.png');
assert.strictEqual(resolveThemeDefaultItemImage(halloweenTheme, { isHazard: true, isBonus: false }), '/assets/games/catch-brand/themes/halloween/item_hazard_01.png');
assert.strictEqual(resolveThemeDefaultItemImage(halloweenTheme, { isHazard: false, isBonus: true }), '/assets/games/catch-brand/themes/halloween/item_bonus_01.png');

assert.strictEqual(resolveThemeDefaultBgImage(mangoTheme), '/assets/games/catch-brand/themes/mango/background.png');
assert.strictEqual(resolveThemeDefaultBasketImage(mangoTheme), '/assets/games/catch-brand/themes/mango/basket.png');
assert.strictEqual(resolveThemeDefaultItemImage(mangoTheme, { isHazard: false, isBonus: false }), '/assets/games/catch-brand/themes/mango/item_normal_01.png');
assert.strictEqual(resolveThemeDefaultItemImage(mangoTheme, { isHazard: true, isBonus: false }), '/assets/games/catch-brand/themes/mango/item_hazard_01.png');
assert.strictEqual(resolveThemeDefaultItemImage(mangoTheme, { isHazard: false, isBonus: true }), '/assets/games/catch-brand/themes/mango/item_bonus_01.png');
console.log('✓ PASS: resolveThemeDefault* helpers return exact canonical paths for Halloween and Mango');

// 6. Verify NO FALLBACK TO CARNIVAL OR DEFAULT for Christmas, CNY, Halloween, Mango
for (const theme of [christmasTheme, cnyTheme, halloweenTheme, mangoTheme]) {
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
console.log('✓ PASS: Neither Christmas, CNY, Halloween, nor Mango falls back to Carnival or Default');

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

// 8b. Verify normalizeGameTheme for Halloween and Mango
const normHalloween = normalizeGameTheme({ slug: 'halloween-spooky', name: 'Halloween' });
assert.strictEqual(normHalloween.asset_theme_id, 'halloween');
assert.strictEqual(normHalloween.background_url, '/assets/games/catch-brand/themes/halloween/background.png');
assert.strictEqual(normHalloween.basket_config?.imageUrl, '/assets/games/catch-brand/themes/halloween/basket.png');
assert.strictEqual(normHalloween.items_config[0].imageUrl, '/assets/games/catch-brand/themes/halloween/item_normal_01.png');

const normMango = normalizeGameTheme({ slug: 'mango-festival', name: 'Mango Orchard' });
assert.strictEqual(normMango.asset_theme_id, 'mango');
assert.strictEqual(normMango.background_url, '/assets/games/catch-brand/themes/mango/background.png');
assert.strictEqual(normMango.basket_config?.imageUrl, '/assets/games/catch-brand/themes/mango/basket.png');
assert.strictEqual(normMango.items_config[0].imageUrl, '/assets/games/catch-brand/themes/mango/item_normal_01.png');
console.log('✓ PASS: normalizeGameTheme normalizes halloween-spooky and mango-festival to canonical assets');

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
  'assets/games/catch-brand/themes/halloween/background.png',
  'assets/games/catch-brand/themes/halloween/basket.png',
  'assets/games/catch-brand/themes/halloween/item_normal_01.png',
  'assets/games/catch-brand/themes/halloween/item_hazard_01.png',
  'assets/games/catch-brand/themes/halloween/item_bonus_01.png',
  'assets/games/catch-brand/themes/mango/background.png',
  'assets/games/catch-brand/themes/mango/basket.png',
  'assets/games/catch-brand/themes/mango/item_normal_01.png',
  'assets/games/catch-brand/themes/mango/item_hazard_01.png',
  'assets/games/catch-brand/themes/mango/item_bonus_01.png',
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
const memoryBg = resolveGameAsset({ gameType: 'memory-match', themeId: 'halloween', assetType: 'background' });
assert.strictEqual(memoryBg, '/assets/games/memory-match/themes/default/background.png');
const memoryCatcher = resolveGameAsset({ gameType: 'memory-match', themeId: 'mango', assetType: 'catcher' });
assert.strictEqual(memoryCatcher, null, 'Memory match does not have a catcher asset');
console.log('✓ PASS: Game isolation preserved across games');

console.log('======================================================');
console.log('ALL GAME ASSET RESOLVER TESTS PASSED SUCCESSFULLY!');
console.log('======================================================');
