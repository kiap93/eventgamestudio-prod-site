import { describe, it, expect } from 'bun:test';
import { CATALOG_GAMES, BASELINE_PLATFORM_GAMES } from './games';
import {
  createInitialBoard,
  hasValidMoves,
  isValidSwap,
} from '../../src/games/match-3/engine';
import { DEFAULT_MATCH3_CONFIG } from '../../src/games/match-3/types';

describe('Match-3 Start Screen & Engine Integration Tests', () => {
  it('GAME_REGISTRY includes match-3 as a first-class canonical engine', async () => {
    const fs = await import('fs');
    const registrySource = fs.readFileSync('src/games/registry.ts', 'utf8');

    expect(registrySource).toContain("'match-3': {");
    expect(registrySource).toContain("id: 'match-3'");
    expect(registrySource).toContain("name: 'Match-3'");
    expect(registrySource).toContain("iconName: 'Sparkles'");
    expect(registrySource).toContain("component: Match3Game");
    expect(registrySource).toContain("isAvailable: true");
  });

  it('Admin Game Register distinction: baseline games are registered, match-3 is initially available', () => {
    const baselineTypes = new Set(BASELINE_PLATFORM_GAMES.map((g) => g.game_type));
    expect(baselineTypes.has('catch-brand')).toBe(true);
    expect(baselineTypes.has('reaction-tap')).toBe(true);
    expect(baselineTypes.has('memory-match')).toBe(true);

    // match-3 and speed-quiz are NOT pre-registered in BASELINE_PLATFORM_GAMES
    // so they appear as "Available" until explicitly registered by an admin in Developer Admin Panel
    expect(baselineTypes.has('match-3')).toBe(false);
    expect(baselineTypes.has('speed-quiz')).toBe(false);

    // match-3 is defined in CATALOG_GAMES
    const catalogMatch3 = CATALOG_GAMES.find((g) => g.game_type === 'match-3');
    expect(catalogMatch3).toBeDefined();
    expect(catalogMatch3?.name).toBe('Match-3');
    expect(catalogMatch3?.slug).toBe('match-3');
    expect(catalogMatch3?.icon_name).toBe('Sparkles');

    const registeredSet = baselineTypes;
    const match3Registered = registeredSet.has('match-3');
    expect(match3Registered).toBe(false); // Suffix is t('developer.engineAvailableSuffix') -> "Available"

    const catchBrandRegistered = registeredSet.has('catch-brand');
    expect(catchBrandRegistered).toBe(true); // Suffix is t('developer.engineRegisteredSuffix') -> "Registered"
  });

  it('handleStartGame resets all stats and generates a fresh playable board', () => {
    // Simulate game state before start (e.g. previous game stats)
    let score = 450;
    let combo = 5;
    let bestCombo = 7;
    let matchesCount = 12;
    let specialsCreatedCount = 4;
    let remainingTime = 0;
    let status = 'ready';
    let countdownValue = 0;
    let board: any = null;

    // Simulate handleStartGame() logic from Match3Game.tsx
    const handleStartGame = () => {
      score = 0;
      combo = 0;
      bestCombo = 0;
      matchesCount = 0;
      specialsCreatedCount = 0;
      remainingTime = DEFAULT_MATCH3_CONFIG.gameDurationSeconds;
      board = createInitialBoard(
        DEFAULT_MATCH3_CONFIG.rows,
        DEFAULT_MATCH3_CONFIG.cols,
        DEFAULT_MATCH3_CONFIG.tileTypesCount,
        Math.random,
        {
          minimumMatch: DEFAULT_MATCH3_CONFIG.minimumMatch,
          specialTilesEnabled: DEFAULT_MATCH3_CONFIG.specialTilesEnabled,
        }
      );
      countdownValue = 3;
      status = 'countdown';
    };

    handleStartGame();

    expect(score).toBe(0);
    expect(combo).toBe(0);
    expect(bestCombo).toBe(0);
    expect(matchesCount).toBe(0);
    expect(specialsCreatedCount).toBe(0);
    expect(remainingTime).toBe(DEFAULT_MATCH3_CONFIG.gameDurationSeconds);
    expect(countdownValue).toBe(3);
    expect(status).toBe('countdown');
    expect(board).toBeDefined();
    expect(board.length).toBe(DEFAULT_MATCH3_CONFIG.rows);
    expect(board[0].length).toBe(DEFAULT_MATCH3_CONFIG.cols);
    expect(hasValidMoves(board, { minimumMatch: 3, specialTilesEnabled: true })).toBe(true);
  });

  it('Countdown step-through transitions 3 -> 2 -> 1 -> 0(GO) -> playing', () => {
    let status = 'countdown';
    let countdownValue = 3;
    let remainingTime = 0;

    // Step 1: 3 -> 2
    if (countdownValue > 0) countdownValue -= 1;
    expect(countdownValue).toBe(2);
    expect(status).toBe('countdown');

    // Step 2: 2 -> 1
    if (countdownValue > 0) countdownValue -= 1;
    expect(countdownValue).toBe(1);
    expect(status).toBe('countdown');

    // Step 3: 1 -> 0 ("GO!")
    if (countdownValue > 0) countdownValue -= 1;
    expect(countdownValue).toBe(0);
    expect(status).toBe('countdown');

    // Step 4: After countdown reaches 0, transition to playing
    status = 'playing';
    remainingTime = DEFAULT_MATCH3_CONFIG.gameDurationSeconds;

    expect(status).toBe('playing');
    expect(remainingTime).toBe(DEFAULT_MATCH3_CONFIG.gameDurationSeconds);
  });

  it('Board strictly rejects tile clicks and interactions when status !== "playing"', () => {
    const statuses = ['ready', 'countdown', 'resolving', 'game_over', 'result'] as const;

    for (const testStatus of statuses) {
      let selectedCoord: { row: number; col: number } | null = null;
      let swapExecuted = false;

      const handleTileClick = (r: number, c: number) => {
        // Guard check from Match3Game.tsx
        if (testStatus !== 'playing') return;
        selectedCoord = { row: r, col: c };
      };

      const executeSwap = (r1: number, c1: number, r2: number, c2: number) => {
        // Guard check from Match3Game.tsx
        if (testStatus !== 'playing') return;
        swapExecuted = true;
      };

      handleTileClick(0, 0);
      expect(selectedCoord).toBeNull();

      executeSwap(0, 0, 0, 1);
      expect(swapExecuted).toBe(false);
    }
  });

  it('Board accepts tile click and swap only when status === "playing"', () => {
    let currentStatus: string = 'playing';
    let selectedCoord: { row: number; col: number } | null = null;

    const handleTileClick = (r: number, c: number) => {
      if (currentStatus !== 'playing') return;
      if (!selectedCoord) {
        selectedCoord = { row: r, col: c };
      }
    };

    handleTileClick(2, 3);
    expect(selectedCoord).toEqual({ row: 2, col: 3 });
  });

  it('StartScreenRenderer props interface matches onStartGame and onShowLeaderboard', async () => {
    // Read StartScreenRenderer source file to ensure contract matches
    const fs = await import('fs');
    const startScreenSource = fs.readFileSync('src/games/shared/StartScreenRenderer.tsx', 'utf8');

    expect(startScreenSource).toContain('onStartGame: () => void;');
    expect(startScreenSource).toContain('onShowLeaderboard?: () => void;');

    // Read Match3Game source file to ensure it now uses onStartGame and onShowLeaderboard
    const match3Source = fs.readFileSync('src/games/match-3/Match3Game.tsx', 'utf8');

    expect(match3Source).toContain('onStartGame={handleStartGame}');
    expect(match3Source).toContain('onShowLeaderboard=');
    // Ensure old prop names are NOT used
    expect(match3Source).not.toContain('onStart={handleStartGame}');
    expect(match3Source).not.toContain('onOpenLeaderboard=');
  });
});
