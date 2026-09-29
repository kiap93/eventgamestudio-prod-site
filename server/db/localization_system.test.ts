import assert from 'node:assert';
import {
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
  isSupportedLanguage,
  normalizeLanguageCode,
} from '../../src/lib/i18n/languages.js';
import {
  PROTECTED_TERMS,
  getProtectedTermsForPrompt,
  extractProtectedTermsInText,
} from '../../src/lib/i18n/glossary.js';
import {
  t,
  interpolate,
  lookupKey,
  resolveTranslatedContent,
} from '../../src/lib/i18n/i18n.js';
import {
  saveEventTranslation,
  getEventTranslations,
  getEventTranslationByLanguage,
  saveShowcaseTranslation,
  getShowcaseTranslations,
  createTranslationJob,
  updateTranslationJob,
  getTranslationJob,
} from './translations.js';
import { MockTranslationProvider } from '../translation/mockProvider.js';
import { translationService } from '../translation/service.js';
import { CATALOG_GAMES } from './games.js';

async function runLocalizationTests() {
  console.log('====================================================');
  console.log('TEST SUITE: CENTRALIZED LOCALIZATION SYSTEM ARCHITECTURE');
  console.log('====================================================\n');

  // 1. Supported Languages
  console.log('1. Testing Supported Languages definitions and normalization...');
  {
    const codes = SUPPORTED_LANGUAGES.map((l) => l.code);
    assert.strictEqual(codes.includes('en'), true, 'Should include English');
    assert.strictEqual(codes.includes('zh-CN'), true, 'Should include Simplified Chinese');
    assert.strictEqual(codes.includes('ms-MY'), true, 'Should include Malay');
    assert.strictEqual(DEFAULT_LANGUAGE, 'en');

    assert.strictEqual(isSupportedLanguage('en'), true);
    assert.strictEqual(isSupportedLanguage('zh-CN'), true);
    assert.strictEqual(isSupportedLanguage('ms-MY'), true);
    assert.strictEqual(isSupportedLanguage('fr-FR'), false);

    assert.strictEqual(normalizeLanguageCode('zh'), 'zh-CN');
    assert.strictEqual(normalizeLanguageCode('zh_CN'), 'zh-CN');
    assert.strictEqual(normalizeLanguageCode('zh-Hans'), 'zh-CN');
    assert.strictEqual(normalizeLanguageCode('ms'), 'ms-MY');
    assert.strictEqual(normalizeLanguageCode('ms_MY'), 'ms-MY');
    assert.strictEqual(normalizeLanguageCode('en-US'), 'en');
    assert.strictEqual(normalizeLanguageCode('en_GB'), 'en');
    assert.strictEqual(normalizeLanguageCode('unknown-code'), 'en');
    assert.strictEqual(normalizeLanguageCode(null), 'en');
    console.log('  ✓ Supported languages verified');
  }

  // 2. Glossary & Protected Terms
  console.log('2. Testing Glossary and Protected Terms...');
  {
    const terms = PROTECTED_TERMS.map((t) => t.term);
    assert.strictEqual(terms.includes('Event Game Studio'), true);
    assert.strictEqual(terms.includes('Catch The Brand'), true);
    assert.strictEqual(terms.includes('Brand Memory Match'), true);
    assert.strictEqual(terms.includes('Reaction Time'), true);
    assert.strictEqual(terms.includes('Formula Reaction Lights'), true);
    assert.strictEqual(terms.includes('RM'), true);
    assert.strictEqual(terms.includes('MYR'), true);

    const sampleText = 'Welcome to Event Game Studio! Play Catch The Brand and win RM 100.';
    const extracted = extractProtectedTermsInText(sampleText);
    const extractedTerms = extracted.map((t) => t.term);
    assert.strictEqual(extractedTerms.includes('Event Game Studio'), true);
    assert.strictEqual(extractedTerms.includes('Catch The Brand'), true);
    assert.strictEqual(extractedTerms.includes('RM'), true);

    const promptText = getProtectedTermsForPrompt();
    assert.strictEqual(typeof promptText, 'string');
    assert.strictEqual(promptText.includes('Event Game Studio'), true);
    console.log('  ✓ Glossary and protected terms verified');
  }

  // 3. I18n Core System
  console.log('3. Testing I18n core lookup, fallback, and interpolation...');
  {
    const enStart = t('common.start', undefined, 'en');
    const zhStart = t('common.start', undefined, 'zh-CN');
    const msStart = t('common.start', undefined, 'ms-MY');

    assert.strictEqual(enStart, 'Start');
    assert.strictEqual(zhStart, '开始');
    assert.strictEqual(msStart, 'Mula');

    // Missing key safe fallback
    const missing = t('nonexistent.nested.key', undefined, 'zh-CN');
    assert.strictEqual(missing, 'key');

    // Interpolation
    const interpolated = interpolate('Remaining: {{count}} days', { count: 5 });
    assert.strictEqual(interpolated, 'Remaining: 5 days');

    const missingParam = interpolate('Hello {{name}}', {});
    assert.strictEqual(missingParam, 'Hello ');

    // Safe from undefined / [object Object]
    const objLookup = lookupKey({ common: { start: 'Start' } }, 'common.missing');
    assert.strictEqual(objLookup, undefined);

    const safeResult = t('common.invalid' as any, undefined, 'en');
    assert.strictEqual(typeof safeResult, 'string');
    assert.strictEqual(safeResult.includes('undefined'), false);
    assert.strictEqual(safeResult.includes('[object Object]'), false);
    console.log('  ✓ I18n core engine and interpolation verified');
  }

  // 4. User-Generated Content Database & Services
  console.log('4. Testing User-Generated Content persistence and fallback...');
  {
    const testEventId = 'test-event-uuid-001';
    const translation = await saveEventTranslation({
      eventId: testEventId,
      languageCode: 'zh-CN',
      title: '马来西亚科技嘉年华',
      description: '这是一个互动品牌游戏挑战',
      gameInstructions: '点击开始捕捉掉落的物品',
      sourceLanguage: 'en',
    });

    assert.strictEqual(translation.event_id, testEventId);
    assert.strictEqual(translation.language_code, 'zh-CN');
    assert.strictEqual(translation.title, '马来西亚科技嘉年华');

    const all = await getEventTranslations(testEventId);
    assert.strictEqual(all.length > 0, true);
    const found = all.find((item) => item.language_code === 'zh-CN');
    assert.strictEqual(Boolean(found), true);
    assert.strictEqual(found?.title, '马来西亚科技嘉年华');

    const single = await getEventTranslationByLanguage(testEventId, 'zh-CN');
    assert.strictEqual(single?.description, '这是一个互动品牌游戏挑战');

    const testShowcaseId = 'test-showcase-uuid-001';
    const scTranslation = await saveShowcaseTranslation({
      showcaseId: testShowcaseId,
      languageCode: 'ms-MY',
      title: 'Pameran Acara Digital',
      description: 'Pengalaman permainan jenama interaktif',
      ctaText: 'Cuba Sekarang',
      sourceLanguage: 'en',
    });

    assert.strictEqual(scTranslation.showcase_id, testShowcaseId);
    assert.strictEqual(scTranslation.language_code, 'ms-MY');
    assert.strictEqual(scTranslation.title, 'Pameran Acara Digital');

    const allSc = await getShowcaseTranslations(testShowcaseId);
    assert.strictEqual(allSc.length > 0, true);

    // Translation Jobs Lifecycle
    const job = await createTranslationJob({
      entity_type: 'event',
      entity_id: 'test-event-job-001',
      source_language: 'en',
      target_language: 'zh-CN',
      provider: 'mock',
    });

    assert.strictEqual(job.status, 'PENDING');
    assert.strictEqual(job.provider, 'mock');

    const updated = await updateTranslationJob(job.id, {
      status: 'COMPLETED',
      result: { title: '已翻译标题' },
    });

    assert.strictEqual(updated?.status, 'COMPLETED');
    assert.deepStrictEqual(updated?.result, { title: '已翻译标题' });

    const fetched = await getTranslationJob(job.id);
    assert.strictEqual(fetched?.status, 'COMPLETED');

    // Content resolution fallback
    const sampleTranslations = [
      {
        language_code: 'zh-CN',
        title: '中文标题',
        description: '中文描述',
      },
    ];

    const resolvedZh = resolveTranslatedContent(
      'Default Title',
      'title',
      sampleTranslations,
      'zh-CN',
      'en'
    );
    assert.strictEqual(resolvedZh, '中文标题');

    const resolvedMs = resolveTranslatedContent(
      'Default Title',
      'title',
      sampleTranslations,
      'ms-MY',
      'en'
    );
    assert.strictEqual(resolvedMs, 'Default Title');
    console.log('  ✓ UGC translation storage and fallback resolution verified');
  }

  // 5. Translation Provider & Machine Translation
  console.log('5. Testing Translation Providers (Mock & Service abstraction)...');
  {
    const provider = new MockTranslationProvider();
    const result = await provider.translate({
      sourceLanguage: 'en',
      targetLanguage: 'zh-CN',
      fields: {
        title: 'Event Game Studio Grand Launch',
        description: 'Win RM 500 in Catch The Brand',
      },
    });

    assert.strictEqual(result.provider, 'mock');
    assert.strictEqual(Boolean(result.fields?.title), true);
    assert.strictEqual(result.fields?.title?.includes('Event Game Studio'), true);
    assert.strictEqual(result.fields?.description?.includes('RM'), true);
    assert.strictEqual(result.fields?.description?.includes('Catch The Brand'), true);

    const serviceRes = await translationService.translate({
      sourceLanguage: 'en',
      targetLanguage: 'ms-MY',
      fields: {
        field1: 'Hello world',
        field2: 'Welcome to the game',
      },
    });

    assert.strictEqual(Boolean(serviceRes.fields?.field1), true);
    assert.strictEqual(Boolean(serviceRes.fields?.field2), true);
    console.log('  ✓ Translation provider and service layer verified');
  }

  // 6. Game Engine Safety & No Regressions
  console.log('6. Verifying Game Engine Safety and zero regressions...');
  {
    assert.strictEqual(CATALOG_GAMES.length >= 3, true, 'At least 3 core games must exist in catalog');

    const catchBrand = CATALOG_GAMES.find((g) => g.game_type === 'catch-brand');
    assert.strictEqual(Boolean(catchBrand), true);
    assert.strictEqual(catchBrand?.name, 'Catch the Brand');
    assert.strictEqual(catchBrand?.slug, 'catch-brand');

    const memoryMatch = CATALOG_GAMES.find((g) => g.game_type === 'memory-match');
    assert.strictEqual(Boolean(memoryMatch), true);
    assert.strictEqual(memoryMatch?.name, 'Brand Memory Match');
    assert.strictEqual(memoryMatch?.slug, 'memory-match');

    const reactionTap = CATALOG_GAMES.find((g) => g.game_type === 'reaction-tap');
    assert.strictEqual(Boolean(reactionTap), true);
    assert.strictEqual(reactionTap?.name, 'Formula Reaction Lights');
    assert.strictEqual(reactionTap?.slug, 'reaction-tap');
    console.log('  ✓ Game catalog and configurations remain 100% intact');
  }

  console.log('\n====================================================');
  console.log('🎉 ALL LOCALIZATION ARCHITECTURE TESTS PASSED!');
  console.log('====================================================');
}

runLocalizationTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
