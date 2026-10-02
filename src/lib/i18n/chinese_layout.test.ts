import { translate, t } from './i18n';
import { LOCALES } from '../../locales';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ ${testName}${detail ? ` -> ${detail}` : ''}`);
    failed++;
  }
}

console.log('\n======================================================');
console.log('Running Chinese Typography & DevAdmin Navigation Tests');
console.log('======================================================\n');

// 1. zh-CN locale exists in LOCALES registry
assert(Boolean(LOCALES['zh-CN']), 'zh-CN locale is registered in LOCALES');

// 2. DevAdmin navigation labels exist and are concise
const navKeys = [
  'developer.gamesAndSystemThemes',
  'nav.organizations',
  'nav.showcaseReviews',
  'developer.eventPricingControl',
  'developer.gmailApiEmail',
  'developer.errorLogs',
  'developer.contactSupportSettings',
  'developer.customerInvitations',
];

for (const key of navKeys) {
  const zhVal = translate('zh-CN', key);
  const enVal = translate('en', key);

  assert(Boolean(zhVal) && zhVal !== key, `Key '${key}' resolves in zh-CN: "${zhVal}"`);
  assert(Boolean(enVal) && enVal !== key, `Key '${key}' resolves in en: "${enVal}"`);

  // Ensure concise label length in Chinese (<= 8 characters) to avoid vertical multi-character wrapping
  assert(
    zhVal.length <= 8,
    `Key '${key}' Chinese label is concise (${zhVal.length} chars: "${zhVal}")`
  );

  // Ensure no accidental linebreaks or whitespace within the label
  assert(!zhVal.includes('\n'), `Key '${key}' contains no line breaks`);
}

// 3. Game card action buttons translations exist and are concise
const gameActionKeys = [
  'developer.tabPricing',
  'developer.tabThemes',
  'developer.themeTemplates',
  'developer.gameId',
  'developer.gameSlug',
  'common.activate',
  'common.deactivate',
  'common.delete',
];

for (const key of gameActionKeys) {
  const zhVal = translate('zh-CN', key);
  assert(Boolean(zhVal) && zhVal !== key, `Action key '${key}' resolves in zh-CN: "${zhVal}"`);
}

// 4. Default English fallback does not regress
const enThemes = translate('en', 'developer.gamesAndSystemThemes');
assert(enThemes === 'Games & System Themes', 'English gamesAndSystemThemes translation preserved');

const enOrgs = translate('en', 'nav.organizations');
assert(enOrgs === 'Organizations', 'English nav.organizations translation preserved');

console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
if (failed > 0) {
  process.exit(1);
}
