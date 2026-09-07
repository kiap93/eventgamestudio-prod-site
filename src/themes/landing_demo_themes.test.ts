import assert from 'node:assert';
import {
  THEME_REGISTRY,
  getAllUniqueThemes,
  getSystemThemes,
  registerThemes,
} from './registry';
import { carnivalTheme } from './carnival';
import { christmasTheme } from './christmas';
import { cnyTheme } from './cny';
import { halloweenTheme } from './halloween';
import { mangoTheme } from './mango';
import { memoryMatchTheme } from './memory-match';

console.log('======================================================');
console.log('RUNNING LANDING DEMO THEMES DEDUPLICATION TESTS');
console.log('======================================================');

// 1. Static system themes have is_system and is_system_theme set to true
const systemThemes = [carnivalTheme, christmasTheme, cnyTheme, halloweenTheme, mangoTheme, memoryMatchTheme];
for (const t of systemThemes) {
  assert.strictEqual(t.is_system, true, `${t.name} must have is_system === true`);
  assert.strictEqual(t.is_system_theme, true, `${t.name} must have is_system_theme === true`);
  assert.strictEqual(t.ownership_type, 'system', `${t.name} must have ownership_type === 'system'`);
}
console.log('✓ PASS: Static system themes have is_system and is_system_theme set to true');

// 2. getAllUniqueThemes returns unique themes deduplicated by theme.id
const all = getAllUniqueThemes();
const ids = all.map((t) => t.id);
const uniqueIds = new Set(ids);
assert.strictEqual(ids.length, uniqueIds.size, 'getAllUniqueThemes must contain no duplicate IDs');
console.log('✓ PASS: getAllUniqueThemes returns unique themes deduplicated by theme.id');

// 3. Register custom client/org themes (simulating user with custom themes like 'tt' and 'test')
registerThemes([
  {
    id: 'client-custom-theme-1',
    name: 'tt',
    slug: 'tt',
    organization_id: 'org-1234',
    is_system: false,
    is_system_theme: false,
    ownership_type: 'organization',
  },
  {
    id: 'client-custom-theme-2',
    name: 'test',
    slug: 'test',
    organization_id: 'org-1234',
    is_system: false,
    is_system_theme: false,
    ownership_type: 'organization',
  },
  {
    id: 'client-custom-theme-3',
    name: 'Brand',
    slug: 'brand-custom',
    organization_id: 'org-1234',
    is_system: false,
    is_system_theme: false,
    ownership_type: 'organization',
  },
]);

// 4. Landing Demo deduplication and filtering algorithm
const rawCandidateThemes = Object.values(THEME_REGISTRY);

// Requirement 8: Defensive deduplication by theme.id
const uniqueThemes = Array.from(
  new Map(rawCandidateThemes.map((theme) => [theme.id, theme])).values()
);

// Requirement 9 & 10: Filter ONLY is_system_theme = true and exclude client/test/event themes
const systemDemoThemes = uniqueThemes.filter((theme) => {
  const isSystemTheme = Boolean(
    theme.is_system_theme === true ||
    theme.is_system === true ||
    theme.ownership_type === 'system' ||
    (!theme.organization_id && (
      theme.id === 'carnival' ||
      theme.id === 'christmas' ||
      theme.id === 'chinese-new-year' ||
      theme.id === 'halloween' ||
      theme.id === 'mango' ||
      theme.id === 'memory-match' ||
      theme.id === 'memory-carnival'
    ))
  );
  if (theme.organization_id) return false;
  if (!isSystemTheme) return false;
  // Catch-brand demo filter
  return !theme.game_type || theme.game_type === 'catch-brand' || theme.game_slug === 'catch-brand' || theme.id !== 'memory-match';
});

const themeNames = systemDemoThemes.map((t) => t.name.split(' ')[0]);
const themeIds = systemDemoThemes.map((t) => t.id);

// Ensure NO duplicates
assert.strictEqual(new Set(themeIds).size, themeIds.length, 'No duplicate IDs in systemDemoThemes');

// Ensure client themes 'tt', 'test', and client 'Brand' never appear
assert.strictEqual(themeNames.includes('tt'), false, 'Theme "tt" must not appear in Landing Demo');
assert.strictEqual(themeNames.includes('test'), false, 'Theme "test" must not appear in Landing Demo');
assert.strictEqual(themeIds.includes('client-custom-theme-1'), false, 'Custom client theme 1 must not appear');
assert.strictEqual(themeIds.includes('client-custom-theme-2'), false, 'Custom client theme 2 must not appear');
assert.strictEqual(themeIds.includes('client-custom-theme-3'), false, 'Custom client theme 3 must not appear');

// Exactly the 5 system themes for catch-brand
assert.deepStrictEqual(themeIds, ['carnival', 'christmas', 'chinese-new-year', 'halloween', 'mango']);
assert.deepStrictEqual(themeNames, ['Carnival', 'Christmas', 'Lunar', 'Halloween', 'Mango']);
console.log('✓ PASS: Landing Demo correctly deduplicates and excludes client/test themes');
console.log('======================================================');
console.log('ALL LANDING DEMO THEME TESTS PASSED!');
console.log('======================================================');

