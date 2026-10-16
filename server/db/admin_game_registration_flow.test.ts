import { test, expect, beforeEach, describe } from 'bun:test';
import {
  getAllPlatformGames,
  createPlatformGame,
  GameConflictError,
  localGamesCache,
  BASELINE_PLATFORM_GAMES,
  CATALOG_GAMES,
} from './games.js';
import { getSystemThemesByGameId } from './themes.js';
import { localGamePricingCache } from './gamePricing.js';

// Setup minimal DOM mocks so registry imports cleanly in node/bun environment
if (typeof globalThis.window === 'undefined') {
  class MockHTMLCanvasElement {}
  const mockCtx = {
    fillStyle: '',
    fillRect: () => {},
    getImageData: () => ({ data: [0, 0, 0, 0] }),
    putImageData: () => {},
  };
  (globalThis as any).HTMLCanvasElement = MockHTMLCanvasElement;
  (globalThis as any).window = globalThis;
  (globalThis as any).document = {
    documentElement: {},
    createElement: () => Object.assign(new MockHTMLCanvasElement(), { getContext: () => mockCtx }),
  };
  (globalThis as any).navigator = { maxTouchPoints: 0, userAgent: 'node' };
  (globalThis as any).Image = class {};
}

describe('Admin Panel Register New System Game Flow', () => {
  beforeEach(() => {
    // Reset local cache to baseline platform games
    localGamesCache.clear();
  });

  test('1. Baseline platform games only auto-seed catch-brand, reaction-tap, and memory-match', async () => {
    const baselineTypes = BASELINE_PLATFORM_GAMES.map((g) => g.game_type);
    expect(baselineTypes).toContain('catch-brand');
    expect(baselineTypes).toContain('reaction-tap');
    expect(baselineTypes).toContain('memory-match');
    expect(baselineTypes).not.toContain('speed-quiz');
    expect(baselineTypes).not.toContain('match-3');

    // CATALOG_GAMES contains definitions for reference
    const catalogTypes = CATALOG_GAMES.map((g) => g.game_type);
    expect(catalogTypes).toContain('match-3');

    const games = await getAllPlatformGames();
    const gameTypes = games.map((g) => g.game_type);

    expect(gameTypes).toContain('catch-brand');
    expect(gameTypes).toContain('reaction-tap');
    expect(gameTypes).toContain('memory-match');
    // Match-3 is NOT pre-registered in baseline games
    expect(gameTypes).not.toContain('match-3');
    expect(gameTypes).not.toContain('speed-quiz');
  });

  test('2. GAME_REGISTRY lists all 5 canonical engines with match-3 and speed-quiz present', async () => {
    const { GAME_REGISTRY } = await import('../../src/games/registry.js');
    const keys = Object.keys(GAME_REGISTRY);

    expect(keys).toEqual(['catch-brand', 'reaction-tap', 'memory-match', 'speed-quiz', 'match-3']);

    // Check match-3 definition
    const m3Def = GAME_REGISTRY['match-3'];
    expect(m3Def).toBeDefined();
    expect(m3Def.name).toBe('Match-3');
    expect(m3Def.description).toBe(
      'Swap matching tiles to create combinations, trigger special tiles, build combos, and achieve the highest score before time runs out.'
    );
    expect(m3Def.iconName).toBe('Sparkles');
    expect(m3Def.isAvailable).toBe(true);

    // Check speed-quiz definition
    const sqDef = GAME_REGISTRY['speed-quiz'];
    expect(sqDef).toBeDefined();
    expect(sqDef.name).toBe('Event Trivia Speed Quiz');
    expect(sqDef.isAvailable).toBe(false);
  });

  test('3. Simulated dropdown calculation matches expected Available vs Registered states', async () => {
    const { GAME_REGISTRY } = await import('../../src/games/registry.js');
    const existingGames = await getAllPlatformGames();
    const registeredTypeKeys = new Set(existingGames.map((g) => g.game_type));

    const allAvailableTypes = Object.keys(GAME_REGISTRY);

    const dropdownOptions = allAvailableTypes.map((typeKey) => {
      const def = GAME_REGISTRY[typeKey];
      const isRegistered = registeredTypeKeys.has(typeKey);
      return {
        key: typeKey,
        name: def?.name || typeKey,
        status: isRegistered ? 'Registered' : 'Available',
      };
    });

    expect(dropdownOptions).toEqual([
      { key: 'catch-brand', name: 'Catch the Brand', status: 'Registered' },
      { key: 'reaction-tap', name: 'Formula Reaction Lights', status: 'Registered' },
      { key: 'memory-match', name: 'Brand Memory Match', status: 'Registered' },
      { key: 'speed-quiz', name: 'Event Trivia Speed Quiz', status: 'Available' },
      { key: 'match-3', name: 'Match-3', status: 'Available' },
    ]);
  });

  test('4. Registering Match-3 via createPlatformGame succeeds, seeds themes and pricing', async () => {
    const newGame = await createPlatformGame({
      name: 'Match-3',
      slug: 'match-3',
      game_type: 'match-3',
      description:
        'Swap matching tiles to create combinations, trigger special tiles, build combos, and achieve the highest score before time runs out.',
      icon_name: 'Sparkles',
      status: 'active',
    });

    expect(newGame).toBeDefined();
    expect(newGame.id).toBeDefined();
    expect(newGame.name).toBe('Match-3');
    expect(newGame.slug).toBe('match-3');
    expect(newGame.game_type).toBe('match-3');
    expect(newGame.icon_name).toBe('Sparkles');
    expect(newGame.status).toBe('active');

    // Verify themes were seeded for this game
    const themes = await getSystemThemesByGameId(newGame.id);
    expect(themes.length).toBeGreaterThan(0);

    // Verify pricing tiers were seeded
    const pricing = localGamePricingCache.get(newGame.id);
    expect(pricing).toBeDefined();
    expect(pricing!.length).toBeGreaterThan(0);

    // Verify subsequent getAllPlatformGames now reflects match-3 as registered
    const gamesAfter = await getAllPlatformGames();
    const typesAfter = new Set(gamesAfter.map((g) => g.game_type));
    expect(typesAfter.has('match-3')).toBe(true);

    // Check conflict protection: attempting to register match-3 again throws GameConflictError
    let threwConflict = false;
    try {
      await createPlatformGame({
        name: 'Match-3 Duplicate',
        slug: 'match-3-dup',
        game_type: 'match-3',
      });
    } catch (err: any) {
      threwConflict = true;
      expect(err instanceof GameConflictError || err.message.includes('already registered')).toBe(true);
    }
    expect(threwConflict).toBe(true);
  });
});
