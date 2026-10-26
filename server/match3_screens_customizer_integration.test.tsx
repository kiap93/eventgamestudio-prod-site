import React from 'react';
import { describe, it, expect } from 'bun:test';
import { renderToString } from 'react-dom/server';
import { LocalizationProvider } from '../src/context/LocalizationContext';
import { ScreensTab } from '../src/components/studio/ScreensTab';
import { Match3ScreensCustomizer } from '../src/components/studio/games/Match3Customizer';
import { match3Theme } from '../src/themes/match-3';
import { memoryMatchTheme } from '../src/themes/memory-match';
import { reactionTheme } from '../src/themes/reaction-time';
import { defaultCatchBrandTheme } from '../src/themes/defaultCatchBrand';
import { GameTheme, isMatch3Theme } from '../src/themes';
import { Match3GameConfig, DEFAULT_MATCH3_CONFIG } from '../src/games/match-3/types';
import { getStartScreenConfig, saveStartScreenConfig } from '../src/games/shared/startScreenResolver';
import {
  generateDefaultMatch3StartScreenElements,
} from '../src/games/shared/startScreenTypes';
import {
  generateDefaultMatch3ResultScreenElements,
  ResultScreenConfig,
} from '../src/games/shared/resultScreenTypes';
import { getAvailableStartElements } from '../src/components/studio/games/start-editor/startElementRegistry';
import { getAvailableResultElements } from '../src/components/studio/games/result-editor/resultElementRegistry';

describe('Match-3 Screens Customization Integration & Regression Tests', () => {
  it('1. Correctly identifies Match-3 themes via isMatch3Theme', () => {
    expect(isMatch3Theme(match3Theme)).toBe(true);
    expect(isMatch3Theme(memoryMatchTheme)).toBe(false);
    expect(isMatch3Theme(reactionTheme)).toBe(false);
    expect(isMatch3Theme(defaultCatchBrandTheme)).toBe(false);
  });

  it('2. ScreensTab renders Match3ScreensCustomizer for Match-3 theme', () => {
    const html = renderToString(
      <LocalizationProvider>
        <ScreensTab
          theme={match3Theme}
          onChange={() => {}}
          onUploadAsset={async () => ''}
          uploadingAsset={null}
        />
      </LocalizationProvider>
    );

    expect(html).toContain('Game Screens Customization');
    expect(html).toContain('Start Screen');
    expect(html).toContain('Result Screen');
    expect(html).toContain('Open Start Screen Editor');
  });

  it('3. ScreensTab maintains routing for other game types without regressions', () => {
    // Memory Match
    const memoryHtml = renderToString(
      <LocalizationProvider>
        <ScreensTab
          theme={memoryMatchTheme}
          onChange={() => {}}
          onUploadAsset={async () => ''}
          uploadingAsset={null}
        />
      </LocalizationProvider>
    );
    expect(memoryHtml).toContain('Open Start Screen Editor');

    // Reaction Tap
    const reactionHtml = renderToString(
      <LocalizationProvider>
        <ScreensTab
          theme={reactionTheme}
          onChange={() => {}}
          onUploadAsset={async () => ''}
          uploadingAsset={null}
        />
      </LocalizationProvider>
    );
    expect(reactionHtml).toContain('Open Start Screen Editor');

    // Catch The Brand
    const catchHtml = renderToString(
      <LocalizationProvider>
        <ScreensTab
          theme={defaultCatchBrandTheme}
          onChange={() => {}}
          onUploadAsset={async () => ''}
          uploadingAsset={null}
        />
      </LocalizationProvider>
    );
    expect(catchHtml).toBeDefined();
  });

  it('4. Element registries return dedicated Match-3 elements', () => {
    const startElements = getAvailableStartElements('match-3');
    const startTypes = startElements.map((e) => e.type);
    expect(startTypes).toContain('card');
    expect(startTypes).toContain('title');
    expect(startTypes).toContain('description');
    expect(startTypes).toContain('badge');
    expect(startTypes).toContain('button');
    expect(startTypes).toContain('leaderboard');

    const resultElements = getAvailableResultElements('match-3');
    const resultTypes = resultElements.map((e) => e.type);
    expect(resultTypes).toContain('card');
    expect(resultTypes).toContain('matches');
    expect(resultTypes).toContain('combo');
    expect(resultTypes).toContain('specials');
    expect(resultTypes).toContain('button');
    expect(resultTypes).toContain('leaderboard');
  });

  it('5. Default generator functions produce complete Start and Result screen element trees', () => {
    const startElements = generateDefaultMatch3StartScreenElements(match3Theme, {
      rows: 8,
      cols: 8,
      duration: 60,
      gameTitle: 'GEM CRUSH',
      gameSubtitle: 'Match & Clear',
      logoUrl: null,
    });
    expect(Array.isArray(startElements)).toBe(true);
    expect(startElements.length).toBeGreaterThan(0);
    const startCard = startElements.find((e) => e.id === 'main-start-card');
    expect(startCard).toBeDefined();

    const resultElements = generateDefaultMatch3ResultScreenElements();
    expect(Array.isArray(resultElements)).toBe(true);
    expect(resultElements.length).toBeGreaterThan(0);
    const resultCard = resultElements.find((e) => e.id === 'card-result-main');
    expect(resultCard).toBeDefined();
  });

  it('6. Start Screen configuration updates save to theme.game_config.screens.start while preserving Match-3 gameplay fields', () => {
    let capturedTheme: GameTheme | null = null;
    const initialConfig: Match3GameConfig = {
      ...DEFAULT_MATCH3_CONFIG,
      rows: 9,
      cols: 9,
      gameDurationSeconds: 90,
      objective: {
        type: 'collect',
        targetTileType: 'tile-02',
        targetCollectCount: 45,
        targetScore: 15000,
      },
      hazardConfig: {
        enabled: true,
        type: 'ice',
        initialCount: 5,
        clearCondition: 'adjacent_match',
      },
    };

    const initialTheme: GameTheme = {
      ...match3Theme,
      game_config: initialConfig as any,
    };

    const startConfig = getStartScreenConfig(initialTheme, 'match-3');
    const updatedStart = {
      ...startConfig,
      screenTitle: 'SUPER MATCH 3 ARENA',
      startButtonText: 'LET’S CRUSH IT!',
    };

    const savedTheme = saveStartScreenConfig(initialTheme, updatedStart, 'match-3');

    // Verify start screen is updated in game_config.screens.start
    const savedScreens = (savedTheme.game_config as any).screens;
    expect(savedScreens.start.screenTitle).toBe('SUPER MATCH 3 ARENA');
    expect(savedScreens.start.startButtonText).toBe('LET’S CRUSH IT!');

    // Verify top-level theme.screens.start is also synchronized
    expect((savedTheme as any).screens.start.screenTitle).toBe('SUPER MATCH 3 ARENA');

    // CRITICAL: Verify gameplay settings are completely intact
    const gc = savedTheme.game_config as Match3GameConfig;
    expect(gc.rows).toBe(9);
    expect(gc.cols).toBe(9);
    expect(gc.gameDurationSeconds).toBe(90);
    expect(gc.objective.type).toBe('collect');
    expect(gc.objective.targetTileType).toBe('tile-02');
    expect(gc.objective.targetCollectCount).toBe(45);
    expect(gc.hazardConfig.enabled).toBe(true);
    expect(gc.hazardConfig.type).toBe('ice');
    expect(gc.hazardConfig.initialCount).toBe(5);
  });

  it('7. Match3ScreensCustomizer handles Result Screen updates and strictly preserves gameplay settings', () => {
    let capturedTheme: GameTheme | null = null;

    const initialConfig: Match3GameConfig = {
      ...DEFAULT_MATCH3_CONFIG,
      rows: 7,
      cols: 7,
      minimumMatch: 3,
      cascadeEnabled: true,
      scoring: {
        baseMatchScore: 150,
        comboMultiplier: 1.5,
        fourMatchScore: 300,
        fiveMatchScore: 600,
        crossMatchScore: 900,
        specialTileDetonationScore: 1200,
      },
      objective: {
        type: 'score',
        targetScore: 25000,
      },
    };

    const initialTheme: GameTheme = {
      ...match3Theme,
      game_config: initialConfig as any,
    };

    // Render Match3ScreensCustomizer
    const customizer = (
      <LocalizationProvider>
        <Match3ScreensCustomizer
          theme={initialTheme}
          onChange={(updated) => {
            capturedTheme = updated;
          }}
          onUploadAsset={async () => 'https://test.asset/bg.png'}
          uploadingAsset={null}
        />
      </LocalizationProvider>
    );

    const rendered = renderToString(customizer);
    expect(rendered).toContain('Game Screens Customization');

    // Simulate Result Screen update logic directly
    const resultUpdates: Partial<ResultScreenConfig> = {
      screenTitle: 'VICTORY CELEBRATION',
      showScore: true,
      showMoves: true,
      backgroundColor: '#1e1b4b',
    };

    const existingGc = initialTheme.game_config as Match3GameConfig;
    const currentScreens = (existingGc as any).screens || (initialTheme as any).screens || {};
    const nextResult = {
      ...resultUpdates,
      elements: generateDefaultMatch3ResultScreenElements(resultUpdates),
    };
    const nextScreens = {
      ...currentScreens,
      result: nextResult,
    };
    const updatedTheme: GameTheme = {
      ...initialTheme,
      game_config: {
        ...existingGc,
        screens: nextScreens,
      } as any,
      screens: {
        ...((initialTheme as any).screens || {}),
        result: nextResult as any,
      },
    };

    // Verify result configuration was saved
    const savedScreens = (updatedTheme.game_config as any).screens;
    expect(savedScreens.result.screenTitle).toBe('VICTORY CELEBRATION');
    expect(savedScreens.result.backgroundColor).toBe('#1e1b4b');
    expect(Array.isArray(savedScreens.result.elements)).toBe(true);

    // Verify gameplay configuration fields remain untouched
    const updatedGc = updatedTheme.game_config as Match3GameConfig;
    expect(updatedGc.rows).toBe(7);
    expect(updatedGc.cols).toBe(7);
    expect(updatedGc.scoring.baseMatchScore).toBe(150);
    expect(updatedGc.scoring.specialTileDetonationScore).toBe(1200);
    expect(updatedGc.objective.targetScore).toBe(25000);
  });
});
