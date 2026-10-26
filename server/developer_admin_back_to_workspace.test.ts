import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { parseRoute } from '../src/hooks/useRouteContext';
import { matchesMainSection, MAIN_NAVIGATION_ITEMS } from '../src/lib/navigation';
import { en, zhCN, msMY } from '../src/locales';

console.log('--- RUNNING DEVELOPER ADMIN BACK TO WORKSPACE NAVIGATION TESTS ---');

// Test 1: Verify the DeveloperAdminLayout source code navigates to /events and not /studio
console.log('Test 1: Verify DeveloperAdminLayout.tsx navigates to /events and never /studio');
const layoutFilePath = path.resolve(process.cwd(), 'src/components/developer/DeveloperAdminLayout.tsx');
const layoutContent = fs.readFileSync(layoutFilePath, 'utf-8');

// Ensure no navigateTo('/studio') exists in DeveloperAdminLayout
assert.strictEqual(
  layoutContent.includes("navigateTo('/studio')"),
  false,
  'DeveloperAdminLayout.tsx MUST NOT contain navigateTo(\'/studio\')'
);

// Verify navigateTo('/events') is present for returning to workspace
assert.strictEqual(
  layoutContent.includes("navigateTo('/events')"),
  true,
  'DeveloperAdminLayout.tsx must contain navigateTo(\'/events\')'
);

// Verify button label references backToWorkspace
assert.strictEqual(
  layoutContent.includes("t('developer.backToWorkspace', undefined, 'Back to Workspace')"),
  true,
  'DeveloperAdminLayout.tsx must render backToWorkspace with fallback "Back to Workspace"'
);

// Test 2: Verify localization strings in en, zh-CN, ms-MY
console.log('Test 2: Verify localization strings for developer workspace navigation');
assert.strictEqual(en.developer.backToWorkspace, 'Back to Workspace');
assert.strictEqual(en.developer.returnToStudio, 'Back to Workspace');
assert.strictEqual(zhCN.developer.backToWorkspace, '返回工作区');
assert.strictEqual(msMY.developer.backToWorkspace, 'Kembali ke Ruang Kerja');

// Test 3: Verify the destination route /events is recognized as the Events workspace
console.log('Test 3: Verify destination route /events resolves to Events workspace');
const eventsItem = MAIN_NAVIGATION_ITEMS.find((item) => item.id === 'events');
assert.ok(eventsItem, 'Events navigation item must exist in MAIN_NAVIGATION_ITEMS');
assert.strictEqual(eventsItem?.href, '/events');

const parsed = parseRoute('/events');
assert.strictEqual(parsed.mode, 'studio'); // In this architecture, 'studio' is the authenticated workspace mode rendering DashboardLayout
assert.strictEqual(matchesMainSection('/events', '/events'), true);
assert.strictEqual(matchesMainSection('/events', '/games'), false);

// Contrast with /studio which leads to game customizer
assert.strictEqual(matchesMainSection('/studio', '/games'), true);
assert.strictEqual(matchesMainSection('/studio', '/events'), false);

console.log('--- ALL DEVELOPER ADMIN BACK TO WORKSPACE NAVIGATION TESTS PASSED ---');
