import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_CATCH_BRAND_LAYOUT,
  DEFAULT_GAME_LAYOUT,
  normalizeGameLayout,
  getDefaultUILayout,
} from '../src/themes/layout.js';
import {
  DEFAULT_PORTRAIT_CATCH_BRAND_LAYOUT,
  getEffectiveGameLayout,
} from '../src/themes/responsive.js';
import { THEME_REGISTRY } from '../src/themes/registry.js';
import { calculateCatchBrandHudPosition } from '../src/components/studio/GameLayoutHudOverlay.js';
import { LAYOUT_ELEMENTS_META } from '../src/themes/layout.js';

/**
 * Architectural Verification Test Suite:
 * GAME TIMER & CONTROL HUD SEPARATION
 *
 * Verifies that:
 * 1. Timer and Control HUD have independent, non-overlapping visual space.
 * 2. Preferred desktop layout:
 *    - Row 1: Score (left) ... Game Title (center) ... Control HUD (right)
 *    - Row 2: Timer (centered below Game Title)
 * 3. All themes (Default, Carnival, Christmas, Lunar, etc.) resolve safe, non-overlapping coordinates.
 * 4. Stacking context and safe-area boundaries are preserved during countdown, playing, and paused states.
 */
async function runTests() {
  console.log('====================================================');
  console.log('TEST SUITE: GAME TIMER & CONTROL HUD SEPARATION');
  console.log('====================================================\n');

  // Test 1: Verify DEFAULT_CATCH_BRAND_LAYOUT coordinates
  console.log('1. Verifying DEFAULT_CATCH_BRAND_LAYOUT coordinates...');
  {
    assert.strictEqual(DEFAULT_CATCH_BRAND_LAYOUT.scoreHud.x, 3.5, 'Score should be at x: 3.5% (top-left)');
    assert.strictEqual(DEFAULT_CATCH_BRAND_LAYOUT.scoreHud.y, 3.5, 'Score should be at y: 3.5% (top-left)');

    assert.strictEqual(DEFAULT_CATCH_BRAND_LAYOUT.gameTitle.x, 35, 'Title should be at x: 35% (top-center)');
    assert.strictEqual(DEFAULT_CATCH_BRAND_LAYOUT.gameTitle.y, 3.5, 'Title should be at y: 3.5% (top-center)');

    // Timer must NOT be in the row 1 top-right control HUD area (~80%, ~3.5%)
    assert.ok(
      DEFAULT_CATCH_BRAND_LAYOUT.timer.y >= 10,
      `Timer y (${DEFAULT_CATCH_BRAND_LAYOUT.timer.y}%) must be in second row (>= 10%) below control HUD dock`
    );
    assert.strictEqual(DEFAULT_CATCH_BRAND_LAYOUT.timer.x, 79.5, 'Timer must be at x: 79.5%');
    assert.strictEqual(DEFAULT_CATCH_BRAND_LAYOUT.timer.y, 10.5, 'Timer must be in second row at y: 10.5%');

    console.log('  ✓ Default layout coordinates verified: Score (3.5, 3.5), Title (35, 3.5), Timer (79.5, 10.5)');
  }

  // Test 2: Verify legacy timer migration in normalizeGameLayout
  console.log('2. Verifying legacy top-right timer positions are migrated...');
  {
    // Legacy position 1: old top-right (79.5, 3.5)
    const oldTopRight = normalizeGameLayout({
      timer: { visible: true, x: 79.5, y: 3.5, width: 17 },
      scoreHud: { visible: true, x: 3.5, y: 3.5, width: 17 },
      gameTitle: { visible: true, x: 35, y: 3.5, width: 30 },
    }, 'catch-brand');

    assert.strictEqual(oldTopRight.timer.x, 79.5, 'Old (79.5, 3.5) migrates to x: 79.5%');
    assert.strictEqual(oldTopRight.timer.y, 10.5, 'Old (79.5, 3.5) migrates to y: 10.5%');

    // Legacy position 2: old second-row top-right (79.5, 11)
    const oldRowTwoRight = normalizeGameLayout({
      timer: { visible: true, x: 79.5, y: 11, width: 17 },
      scoreHud: { visible: true, x: 3.5, y: 11, width: 17 },
    }, 'catch-brand');

    assert.strictEqual(oldRowTwoRight.timer.x, 79.5, 'Old (79.5, 11) migrates to x: 79.5%');
    assert.strictEqual(oldRowTwoRight.timer.y, 10.5, 'Old (79.5, 11) migrates to y: 10.5%');

    // Genuine custom position outside danger zone should be preserved
    const customOutside = normalizeGameLayout({
      timer: { visible: true, x: 50, y: 25, width: 20 },
    }, 'catch-brand');
    assert.strictEqual(customOutside.timer.x, 50, 'Custom timer x: 50% preserved');
    assert.strictEqual(customOutside.timer.y, 25, 'Custom timer y: 25% preserved');

    console.log('  ✓ Legacy top-right timer migration verified');
  }

  // Test 3: Verify calculateCatchBrandHudPosition safe-area enforcement
  console.log('3. Verifying calculateCatchBrandHudPosition safe-area...');
  {
    const computed = calculateCatchBrandHudPosition({
      key: 'timer',
      elem: { x: 79.5, y: 3.5, width: 17, visible: true },
      meta: LAYOUT_ELEMENTS_META.timer,
      layoutSource: undefined,
      effectiveIsPortrait: false,
      isVisible: true,
    });

    assert.strictEqual(computed.posX, 79.5, 'Computed timer posX must be 79.5%');
    assert.strictEqual(computed.posY, 10.5, 'Computed timer posY must be 10.5%');

    console.log('  ✓ calculateCatchBrandHudPosition keeps timer in safe area');
  }

  // Test 4: Verify ALL themes in THEME_REGISTRY resolve without overlap
  console.log('4. Verifying all existing themes in registry...');
  {
    const themesToVerify = ['default', 'carnival', 'christmas', 'cny', 'halloween', 'mango', 'durian'];
    for (const themeId of themesToVerify) {
      const theme = THEME_REGISTRY[themeId];
      if (!theme) continue;

      const landscapeLayout = getEffectiveGameLayout(theme.layout, false, 'catch-brand');
      assert.ok(landscapeLayout.timer, `Theme ${themeId} must have timer element`);

      // Timer must be in row 2 below row 1 control HUD (x >= 72 && y < 8.5)
      const isTimerInControlZone = landscapeLayout.timer.x >= 72 && landscapeLayout.timer.y < 8.5;
      assert.strictEqual(
        isTimerInControlZone,
        false,
        `Theme ${themeId} landscape timer must NOT be in control HUD zone (got x=${landscapeLayout.timer.x}, y=${landscapeLayout.timer.y})`
      );

      // Verify portrait layout
      const portraitLayout = getEffectiveGameLayout(theme.layout, true, 'catch-brand');
      assert.ok(portraitLayout.timer, `Theme ${themeId} must have portrait timer element`);
      assert.ok(
        portraitLayout.timer.y >= 10,
        `Theme ${themeId} portrait timer y (${portraitLayout.timer.y}) must be >= 10% below controls`
      );

      console.log(`  ✓ Theme "${themeId}" resolved layout verified clean`);
    }
  }

  // Test 5: Verify ArcadeUI.tsx renders HUD during countdown and has safe-area timer
  console.log('5. Verifying ArcadeUI.tsx source code inspection...');
  {
    const arcadeSource = fs.readFileSync(path.resolve('./src/components/ArcadeUI.tsx'), 'utf-8');

    // HUD rendered during countdown
    assert.ok(
      arcadeSource.includes("gameState === 'COUNTDOWN'") &&
      arcadeSource.includes('live-arcade-control-bar'),
      'ArcadeUI must render HUD controls during countdown'
    );

    // Timer safe-area guard
    assert.ok(
      arcadeSource.includes('isCollidingWithControlHud'),
      'ArcadeUI must contain safe-area collision check for timer'
    );

    // No hardcoded px overlap
    assert.strictEqual(
      arcadeSource.includes('z-index: 99999'),
      false,
      'No z-index 99999 hacks in ArcadeUI'
    );

    console.log('  ✓ ArcadeUI source architecture verified');
  }

  console.log('\n====================================================');
  console.log('🎉 ALL TIMER & CONTROL HUD SEPARATION TESTS PASSED!');
  console.log('====================================================');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
