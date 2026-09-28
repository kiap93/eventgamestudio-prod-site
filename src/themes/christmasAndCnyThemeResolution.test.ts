import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {
  getCanonicalAssetThemeId,
  getAssetThemeId,
  resolveGameAsset,
  resolveThemeDefaultBgImage,
  resolveThemeDefaultBasketImage,
  resolveThemeDefaultItemImage,
} from './gameAssetResolver';
import { resolveThemeBaseId, normalizeGameTheme } from './registry';
import { normalizeServerThemeAssets } from '../../server/db/themes';

console.log('======================================================');
console.log('RUNNING CHRISTMAS AND CNY THEME RESOLUTION TESTS');
console.log('======================================================');

// 1. resolveThemeBaseId test cases specified in user prompt
assert.strictEqual(resolveThemeBaseId({ id: 'christmas' }), 'christmas');
assert.strictEqual(resolveThemeBaseId({ slug: 'christmas-rush' }), 'christmas');
assert.strictEqual(
  resolveThemeBaseId({ name: 'Christmas Gift Rush', slug: 'christmas-rush' }),
  'christmas'
);
assert.strictEqual(resolveThemeBaseId({ id: 'chinese-new-year' }), 'cny');
assert.strictEqual(resolveThemeBaseId({ slug: 'cny-fortune' }), 'cny');
assert.strictEqual(
  resolveThemeBaseId({ name: 'Lunar New Year Fortune', slug: 'cny-fortune' }),
  'cny'
);
assert.strictEqual(resolveThemeBaseId('chinese-new-year'), 'cny');
assert.strictEqual(resolveThemeBaseId({ name: 'Lunar New Year' }), 'cny');
console.log('✓ PASS: resolveThemeBaseId correctly resolves all prompt test cases');

// 2. Database UUID handling: Never return UUID as canonical asset theme ID
const dummyUuid = 'd82fb101-7ec2-4d56-a947-8a6bb526cf54';
const dbThemeChristmas = {
  id: 'a1111111-2222-3333-4444-555555555555',
  base_theme_id: dummyUuid,
  slug: 'christmas-rush',
  name: 'Christmas Gift Rush',
};
const resolvedBaseChristmas = resolveThemeBaseId(dbThemeChristmas);
assert.strictEqual(resolvedBaseChristmas, 'christmas', 'Must resolve to christmas, never UUID');
assert.notStrictEqual(resolvedBaseChristmas, dummyUuid, 'Must NOT return UUID');

const dbThemeCny = {
  id: 'b1111111-2222-3333-4444-555555555555',
  base_theme_id: dummyUuid,
  slug: 'cny-fortune',
  name: 'Lunar New Year Fortune',
};
const resolvedBaseCny = resolveThemeBaseId(dbThemeCny);
assert.strictEqual(resolvedBaseCny, 'cny', 'Must resolve to cny, never UUID');
assert.notStrictEqual(resolvedBaseCny, dummyUuid, 'Must NOT return UUID');
console.log('✓ PASS: UUID base_theme_id never leaks into canonical asset theme resolution');

// 3. getCanonicalAssetThemeId
assert.strictEqual(getCanonicalAssetThemeId('default'), 'default');
assert.strictEqual(getCanonicalAssetThemeId('carnival'), 'carnival');
assert.strictEqual(getCanonicalAssetThemeId('christmas'), 'christmas');
assert.strictEqual(getCanonicalAssetThemeId('christmas-rush'), 'christmas');
assert.strictEqual(getCanonicalAssetThemeId('chinese-new-year'), 'cny');
assert.strictEqual(getCanonicalAssetThemeId('cny'), 'cny');
assert.strictEqual(getCanonicalAssetThemeId('cny-fortune'), 'cny');
assert.strictEqual(getCanonicalAssetThemeId(dummyUuid), 'default');
console.log('✓ PASS: getCanonicalAssetThemeId handles strings and objects cleanly');

// 4. normalizeGameTheme retains DB UUID base_theme_id while setting asset_theme_id
const normalizedDbChristmas = normalizeGameTheme({
  ...dbThemeChristmas,
  is_system: true,
});
assert.strictEqual(normalizedDbChristmas.base_theme_id, dummyUuid, 'Database FK referential integrity preserved');
assert.strictEqual(normalizedDbChristmas.asset_theme_id, 'christmas', 'asset_theme_id must be "christmas"');
assert.strictEqual(
  normalizedDbChristmas.background_url,
  '/assets/games/catch-brand/themes/christmas/background.png'
);
assert.strictEqual(
  normalizedDbChristmas.basket_config?.imageUrl,
  '/assets/games/catch-brand/themes/christmas/basket.png'
);
assert.strictEqual(
  normalizedDbChristmas.items_config[0]?.imageUrl,
  '/assets/games/catch-brand/themes/christmas/item_normal_01.png'
);
assert.strictEqual(
  normalizedDbChristmas.items_config[1]?.imageUrl,
  '/assets/games/catch-brand/themes/christmas/item_hazard_01.png'
);
assert.strictEqual(
  normalizedDbChristmas.items_config[2]?.imageUrl,
  '/assets/games/catch-brand/themes/christmas/item_bonus_01.png'
);

const normalizedDbCny = normalizeGameTheme({
  ...dbThemeCny,
  is_system: true,
});
assert.strictEqual(normalizedDbCny.base_theme_id, dummyUuid, 'Database FK referential integrity preserved');
assert.strictEqual(normalizedDbCny.asset_theme_id, 'cny', 'asset_theme_id must be "cny"');
assert.strictEqual(
  normalizedDbCny.background_url,
  '/assets/games/catch-brand/themes/cny/background.png'
);
assert.strictEqual(
  normalizedDbCny.basket_config?.imageUrl,
  '/assets/games/catch-brand/themes/cny/basket.png'
);
assert.strictEqual(
  normalizedDbCny.items_config[0]?.imageUrl,
  '/assets/games/catch-brand/themes/cny/item_normal_01.png'
);
assert.strictEqual(
  normalizedDbCny.items_config[1]?.imageUrl,
  '/assets/games/catch-brand/themes/cny/item_hazard_01.png'
);
assert.strictEqual(
  normalizedDbCny.items_config[2]?.imageUrl,
  '/assets/games/catch-brand/themes/cny/item_bonus_01.png'
);
console.log('✓ PASS: normalizeGameTheme preserves DB UUID base_theme_id and sets canonical asset_theme_id');

// 5. Custom theme fallback: Cloned theme preserving custom asset and falling back to base theme canonical assets
const customChristmasTheme = normalizeGameTheme({
  id: 'custom-org-theme-123',
  organization_id: 'org-456',
  base_theme_id: 'christmas',
  is_system: false,
  background_url: 'https://storage.googleapis.com/bucket/custom_bg.png',
  basket_config: {
    imageUrl: null, // should fall back to christmas basket!
  },
  items_config: [
    { id: 'item_0', imageUrl: '' }, // should fall back to christmas item_normal_01
    { id: 'item_1', isHazard: true, imageUrl: '/assets/themes/stale/bad.png' }, // stale url should fall back to christmas item_hazard_01
  ],
});

assert.strictEqual(
  customChristmasTheme.background_url,
  'https://storage.googleapis.com/bucket/custom_bg.png',
  'Custom uploaded background must be preserved'
);
assert.strictEqual(
  customChristmasTheme.basket_config?.imageUrl,
  '/assets/games/catch-brand/themes/christmas/basket.png',
  'Empty basket must fall back to Christmas basket, NOT default or carnival'
);
assert.strictEqual(
  customChristmasTheme.items_config[0]?.imageUrl,
  '/assets/games/catch-brand/themes/christmas/item_normal_01.png',
  'Empty item must fall back to Christmas normal item'
);
assert.strictEqual(
  customChristmasTheme.items_config[1]?.imageUrl,
  '/assets/games/catch-brand/themes/christmas/item_hazard_01.png',
  'Stale item URL must fall back to Christmas hazard item'
);
console.log('✓ PASS: Custom theme preserves custom uploads and safely falls back to base theme assets');

// 6. Server normalizeServerThemeAssets
const serverNormChristmas = normalizeServerThemeAssets({
  slug: 'christmas-rush',
  is_system: true,
  background_url: '/assets/stale_bg.png',
  basket_config: { imageUrl: '/assets/stale_basket.png' },
  items_config: [{ id: 'item_0' }, { id: 'item_1', isHazard: true }, { id: 'item_2', isBonus: true }],
});
assert.strictEqual(serverNormChristmas.background_url, '/assets/games/catch-brand/themes/christmas/background.png');
assert.strictEqual(serverNormChristmas.basket_config?.imageUrl, '/assets/games/catch-brand/themes/christmas/basket.png');
assert.strictEqual(serverNormChristmas.items_config[0]?.imageUrl, '/assets/games/catch-brand/themes/christmas/item_normal_01.png');
assert.strictEqual(serverNormChristmas.items_config[1]?.imageUrl, '/assets/games/catch-brand/themes/christmas/item_hazard_01.png');
assert.strictEqual(serverNormChristmas.items_config[2]?.imageUrl, '/assets/games/catch-brand/themes/christmas/item_bonus_01.png');

const serverNormCny = normalizeServerThemeAssets({
  slug: 'cny-fortune',
  is_system: true,
  background_url: '/assets/stale_bg.png',
  basket_config: { imageUrl: '/assets/stale_basket.png' },
  items_config: [{ id: 'item_0' }, { id: 'item_1', isHazard: true }, { id: 'item_2', isBonus: true }],
});
assert.strictEqual(serverNormCny.background_url, '/assets/games/catch-brand/themes/cny/background.png');
assert.strictEqual(serverNormCny.basket_config?.imageUrl, '/assets/games/catch-brand/themes/cny/basket.png');
assert.strictEqual(serverNormCny.items_config[0]?.imageUrl, '/assets/games/catch-brand/themes/cny/item_normal_01.png');
assert.strictEqual(serverNormCny.items_config[1]?.imageUrl, '/assets/games/catch-brand/themes/cny/item_hazard_01.png');
assert.strictEqual(serverNormCny.items_config[2]?.imageUrl, '/assets/games/catch-brand/themes/cny/item_bonus_01.png');
console.log('✓ PASS: Server normalizeServerThemeAssets delivers canonical assets');

// 7. Verify all 5 CNY and Christmas assets physically exist on disk
const cnyExpectedFiles = [
  'public/assets/games/catch-brand/themes/cny/background.png',
  'public/assets/games/catch-brand/themes/cny/basket.png',
  'public/assets/games/catch-brand/themes/cny/item_normal_01.png',
  'public/assets/games/catch-brand/themes/cny/item_hazard_01.png',
  'public/assets/games/catch-brand/themes/cny/item_bonus_01.png',
];

for (const file of cnyExpectedFiles) {
  assert.ok(fs.existsSync(file), `Physical file must exist: ${file}`);
  const stat = fs.statSync(file);
  assert.ok(stat.size > 1000, `File ${file} must have valid size (>1000 bytes, was ${stat.size})`);
}

const christmasExpectedFiles = [
  'public/assets/games/catch-brand/themes/christmas/background.png',
  'public/assets/games/catch-brand/themes/christmas/basket.png',
  'public/assets/games/catch-brand/themes/christmas/item_normal_01.png',
  'public/assets/games/catch-brand/themes/christmas/item_hazard_01.png',
  'public/assets/games/catch-brand/themes/christmas/item_bonus_01.png',
];

for (const file of christmasExpectedFiles) {
  assert.ok(fs.existsSync(file), `Physical file must exist: ${file}`);
  const stat = fs.statSync(file);
  assert.ok(stat.size > 1000, `File ${file} must have valid size (>1000 bytes, was ${stat.size})`);
}
console.log('✓ PASS: All 10 Christmas and CNY canonical image files exist with valid sizes');

// 8. Verify legacy directories do NOT exist
const legacyLnyDir = 'public/assets/games/catch-brand/themes/lunar new year';
assert.strictEqual(fs.existsSync(legacyLnyDir), false, 'Legacy "lunar new year" directory must NOT exist');

const legacyThemesDir = 'public/assets/themes';
assert.strictEqual(fs.existsSync(legacyThemesDir), false, 'Legacy "public/assets/themes" directory must NOT exist');
console.log('✓ PASS: No legacy directories exist');

console.log('======================================================');
console.log('ALL CHRISTMAS AND CNY THEME RESOLUTION TESTS PASSED!');
console.log('======================================================');
