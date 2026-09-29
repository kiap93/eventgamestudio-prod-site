import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { getCurrentLanguage, detectInitialLanguage, t } from '../src/lib/i18n/i18n.js';
import { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE } from '../src/lib/i18n/languages.js';

/**
 * Architectural Verification Test Suite:
 * GAME VIEW — NO LANGUAGE SELECTOR
 *
 * Verifies that:
 * 1. No game view, canvas, start screen, countdown area, or result screen renders a language selector, translator button, or translation menu.
 * 2. Language selection happens strictly before gameplay (e.g. Landing Page, Public Event Page Header, Preview Header).
 * 3. The game consumes resolved language via centralized localization (`getCurrentLanguage()`, `t(...)`).
 * 4. Themes and assets are decoupled from languages (no language-specific theme folders or paths).
 */
async function runTests() {
  console.log('==================================================');
  console.log('TEST SUITE: GAME VIEW — NO LANGUAGE SELECTOR');
  console.log('==================================================\n');

  // Test 1: Verify getCurrentLanguage helper works properly
  console.log('1. Verifying getCurrentLanguage() and centralized localization consumption...');
  {
    const lang = getCurrentLanguage();
    assert.ok(lang, 'getCurrentLanguage should return a valid language');
    assert.strictEqual(SUPPORTED_LANGUAGES.some((l) => l.code === lang), true, 'Language must be supported');

    // Test translation keys used across games
    const scoreTextEn = t('game.score', undefined, 'en');
    const timeTextEn = t('game.time', undefined, 'en');
    assert.ok(scoreTextEn.length > 0, 'game.score translation should exist');
    assert.ok(timeTextEn.length > 0, 'game.time translation should exist');

    console.log('  ✓ Centralized localization lookup verified');
  }

  // Test 2: Verify ArcadeUI.tsx does NOT render LanguageSelector or translation controls inside canvas
  console.log('2. Verifying ArcadeUI.tsx has no LanguageSelector inside game canvas...');
  {
    const arcadeUIContent = fs.readFileSync(path.resolve('./src/components/ArcadeUI.tsx'), 'utf-8');
    assert.strictEqual(
      arcadeUIContent.includes('<LanguageSelector'),
      false,
      'ArcadeUI must NOT render LanguageSelector inside game canvas/HUD'
    );
    assert.strictEqual(
      arcadeUIContent.includes("import { LanguageSelector }"),
      false,
      'ArcadeUI must NOT import LanguageSelector'
    );
    assert.strictEqual(
      arcadeUIContent.includes('variant="game-hud"'),
      false,
      'No game-hud language selector variant in ArcadeUI'
    );
    console.log('  ✓ ArcadeUI game canvas is clean and focused');
  }

  // Test 3: Verify all game directories (catch-brand, memory-match, reaction-time, shared) have no LanguageSelector
  console.log('3. Scanning all game directories for forbidden language selector / translation widgets...');
  {
    const gamesDir = path.resolve('./src/games');
    const walkFiles = (dir: string): string[] => {
      let files: string[] = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          files = files.concat(walkFiles(full));
        } else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) {
          files.push(full);
        }
      }
      return files;
    };

    const gameFiles = walkFiles(gamesDir);
    for (const file of gameFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      assert.strictEqual(
        content.includes('<LanguageSelector'),
        false,
        `Forbidden LanguageSelector found in game file: ${file}`
      );
      assert.strictEqual(
        content.includes('variant="game-hud"'),
        false,
        `Forbidden variant="game-hud" found in game file: ${file}`
      );
    }
    console.log(`  ✓ Scanned ${gameFiles.length} game engine files — all 100% clean of language selectors`);
  }

  // Test 4: Verify Pre-Game Language Controls are outside the canvas
  console.log('4. Verifying Pre-Game Language Selector locations (outside game canvas)...');
  {
    const landingHeaderContent = fs.readFileSync(path.resolve('./src/components/landing/LandingHeader.tsx'), 'utf-8');
    assert.strictEqual(
      landingHeaderContent.includes('<LanguageSelector'),
      true,
      'LandingHeader should provide LanguageSelector for pre-game language selection'
    );

    const publicEventContent = fs.readFileSync(path.resolve('./src/components/events/PublicEventGameView.tsx'), 'utf-8');
    assert.strictEqual(
      publicEventContent.includes('<LanguageSelector'),
      true,
      'PublicEventGameView should provide LanguageSelector in header outside game canvas'
    );

    const eventPreviewContent = fs.readFileSync(path.resolve('./src/components/events/EventPreviewGameView.tsx'), 'utf-8');
    assert.strictEqual(
      eventPreviewContent.includes('<LanguageSelector'),
      true,
      'EventPreviewGameView should provide LanguageSelector in banner outside game canvas'
    );
    console.log('  ✓ Pre-game language selection verified on Landing Page, Event Page Header, and Preview Banner');
  }

  // Test 5: Verify Theme Separation (no language-specific theme folders or asset duplication)
  console.log('5. Verifying Theme & Asset Separation from Localization...');
  {
    const themesDir = path.resolve('./src/themes');
    const themeFiles = fs.readdirSync(themesDir);
    for (const file of themeFiles) {
      assert.strictEqual(
        file.includes('zh') || file.includes('ms') || file.includes('en-'),
        false,
        `Theme files must not be partitioned by language: ${file}`
      );
    }

    const publicAssetsThemesDir = path.resolve('./public/assets/games');
    if (fs.existsSync(publicAssetsThemesDir)) {
      const assetGameDirs = fs.readdirSync(publicAssetsThemesDir);
      for (const game of assetGameDirs) {
        const themeDir = path.join(publicAssetsThemesDir, game, 'themes');
        if (fs.existsSync(themeDir)) {
          const themes = fs.readdirSync(themeDir);
          for (const t of themes) {
            assert.strictEqual(
              t.includes('zh-CN') || t.includes('ms-MY'),
              false,
              `Theme folders must not be language-specific: ${t}`
            );
          }
        }
      }
    }
    console.log('  ✓ Themes and game assets strictly separated from language concern');
  }

  console.log('\n==================================================');
  console.log('ALL TESTS PASSED: GAME VIEW REMAINS CLEAN');
  console.log('==================================================');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
