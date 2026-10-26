import { test, expect, describe, beforeEach } from 'bun:test';
import {
  updatePlatformGame,
  getGameById,
  getAllPlatformGames,
  isProductionEngine,
  isInDevelopmentEngine,
  validateGameEngineForActivation,
  GameEngineValidationError,
  PRODUCTION_GAME_ENGINES,
  IN_DEVELOPMENT_GAME_ENGINES,
  localGamesCache,
} from './games.js';
import { handleApiError } from '../errors.js';

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

describe('Match-3 Production Engine Recognition & Game Activation Validation', () => {
  const MATCH3_GAME_ID = '72375f03-944c-43ee-a4e4-cf697fc2edb8';
  const CATCH_GAME_ID = '53a6d134-4ea5-41bf-9f3b-c9beb3c7544d';

  beforeEach(() => {
    // Reset test seed in localGamesCache for deterministic assertions
    localGamesCache.set(MATCH3_GAME_ID, {
      id: MATCH3_GAME_ID,
      organization_id: null,
      is_system: true,
      ownership_type: 'system',
      name: 'Match-3',
      slug: 'match-3',
      game_type: 'match-3',
      description: 'Swap matching tiles to create combinations',
      icon_name: 'Sparkles',
      status: 'draft',
      background_url: '/assets/games/match-3/themes/default/background.png',
      basket_config: null,
      items_config: [],
      settings_config: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    localGamesCache.set(CATCH_GAME_ID, {
      id: CATCH_GAME_ID,
      organization_id: null,
      is_system: true,
      ownership_type: 'system',
      name: 'Catch the Brand',
      slug: 'catch-brand',
      game_type: 'catch-brand',
      description: 'Fast-paced arcade catcher',
      icon_name: 'ShoppingBasket',
      status: 'active',
      background_url: '/assets/games/catch-brand/themes/default/background.png',
      basket_config: {},
      items_config: [],
      settings_config: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  });

  test('1. Authoritative registry and validation helpers recognize match-3 as a production engine', async () => {
    expect(PRODUCTION_GAME_ENGINES.has('match-3')).toBe(true);
    expect(PRODUCTION_GAME_ENGINES.has('catch-brand')).toBe(true);
    expect(PRODUCTION_GAME_ENGINES.has('memory-match')).toBe(true);
    expect(PRODUCTION_GAME_ENGINES.has('reaction-tap')).toBe(true);

    expect(isProductionEngine('match-3')).toBe(true);
    expect(isProductionEngine('MATCH-3')).toBe(true);
    expect(isProductionEngine('catch-brand')).toBe(true);
    expect(isProductionEngine('unknown-engine')).toBe(false);
    expect(isProductionEngine('speed-quiz')).toBe(false);

    expect(isInDevelopmentEngine('speed-quiz')).toBe(true);
    expect(isInDevelopmentEngine('match-3')).toBe(false);

    const { GAME_REGISTRY } = await import('../../src/games/registry.js');
    expect(GAME_REGISTRY['match-3']).toBeDefined();
    expect(GAME_REGISTRY['match-3'].isAvailable).toBe(true);
  });

  test('2. A production-ready match-3 game can be activated', async () => {
    const updated = await updatePlatformGame(MATCH3_GAME_ID, {
      status: 'active',
    });

    expect(updated).toBeDefined();
    expect(updated.id).toBe(MATCH3_GAME_ID);
    expect(updated.status).toBe('active');
    expect(updated.game_type).toBe('match-3');

    // Confirm retrieval by ID reflects active status
    const retrieved = await getGameById(MATCH3_GAME_ID);
    expect(retrieved).toBeDefined();
    expect(retrieved?.status).toBe('active');
    expect(retrieved?.game_type).toBe('match-3');
  });

  test('3. An existing valid engine can still be activated', async () => {
    // Put catch-brand in draft then activate it
    localGamesCache.set(CATCH_GAME_ID, {
      ...localGamesCache.get(CATCH_GAME_ID)!,
      status: 'draft',
    });

    const updated = await updatePlatformGame(CATCH_GAME_ID, {
      status: 'active',
    });

    expect(updated).toBeDefined();
    expect(updated.status).toBe('active');
    expect(updated.game_type).toBe('catch-brand');
  });

  test('4. An unknown engine ID is rejected with a structured validation error', async () => {
    let threw = false;
    try {
      await updatePlatformGame(MATCH3_GAME_ID, {
        status: 'active',
        game_type: 'unrecognized-custom-engine',
      });
    } catch (err: any) {
      threw = true;
      expect(err instanceof GameEngineValidationError).toBe(true);
      expect(err.statusCode).toBe(422);
      expect(err.code).toBe('UNRECOGNIZED_PRODUCTION_ENGINE');
      expect(err.message).toContain('is not a recognized production engine');
    }
    expect(threw).toBe(true);
  });

  test('5. A known but unavailable or incomplete engine cannot be activated', async () => {
    let threw = false;
    try {
      await updatePlatformGame(MATCH3_GAME_ID, {
        status: 'active',
        game_type: 'speed-quiz',
      });
    } catch (err: any) {
      threw = true;
      expect(err instanceof GameEngineValidationError).toBe(true);
      expect(err.statusCode).toBe(422);
      expect(err.code).toBe('GAME_ENGINE_UNAVAILABLE');
      expect(err.message).toContain('is currently under development and cannot be activated');
    }
    expect(threw).toBe(true);
  });

  test('6. Updating an already active game does not bypass validation', async () => {
    // Start with active game
    localGamesCache.set(MATCH3_GAME_ID, {
      ...localGamesCache.get(MATCH3_GAME_ID)!,
      status: 'active',
    });

    // Attempting to change game_type of an already active game to an unrecognized engine
    let threw = false;
    try {
      await updatePlatformGame(MATCH3_GAME_ID, {
        game_type: 'quantum-arcade-xyz',
      });
    } catch (err: any) {
      threw = true;
      expect(err instanceof GameEngineValidationError).toBe(true);
      expect(err.statusCode).toBe(422);
      expect(err.code).toBe('UNRECOGNIZED_PRODUCTION_ENGINE');
    }
    expect(threw).toBe(true);

    // Attempting to change game_type of an already active game to an in-development engine
    let threwUnavailable = false;
    try {
      await updatePlatformGame(MATCH3_GAME_ID, {
        game_type: 'speed-quiz',
      });
    } catch (err: any) {
      threwUnavailable = true;
      expect(err instanceof GameEngineValidationError).toBe(true);
      expect(err.statusCode).toBe(422);
      expect(err.code).toBe('GAME_ENGINE_UNAVAILABLE');
    }
    expect(threwUnavailable).toBe(true);
  });

  test('7. The saved engine ID remains match-3 after updating metadata', async () => {
    const updated = await updatePlatformGame(MATCH3_GAME_ID, {
      name: 'Match-3 Branded Edition',
      description: 'Updated Match-3 description for events',
      status: 'active',
    });

    expect(updated.name).toBe('Match-3 Branded Edition');
    expect(updated.description).toBe('Updated Match-3 description for events');
    expect(updated.status).toBe('active');
    expect(updated.game_type).toBe('match-3');

    // Never reverts or falls back to catch-brand
    expect(updated.game_type).not.toBe('catch-brand');
  });

  test('8. The developer game update endpoint error handler returns HTTP 422 instead of HTTP 500 on validation failure', () => {
    const mockReq = {
      originalUrl: `/api/developer/games/${MATCH3_GAME_ID}`,
      method: 'PUT',
      headers: {},
    } as any;

    let responseStatus = 0;
    let responseBody: any = null;

    const mockRes = {
      setHeader: () => {},
      status: (code: number) => {
        responseStatus = code;
        return {
          json: (body: any) => {
            responseBody = body;
          },
        };
      },
    } as any;

    // Simulate validation error thrown during PUT
    const validationError = new GameEngineValidationError(
      'Cannot activate game: Game engine "speed-quiz" is currently under development and cannot be activated.',
      'GAME_ENGINE_UNAVAILABLE',
      422
    );

    handleApiError(validationError, mockReq, mockRes);

    expect(responseStatus).toBe(422);
    expect(responseStatus).not.toBe(500);
    expect(responseBody.error).toContain('Cannot activate game');
    expect(responseBody.code).toBe('GAME_ENGINE_UNAVAILABLE');
  });

  test('9. Unrecognized production engine error also returns HTTP 422 instead of HTTP 500', () => {
    const mockReq = {
      originalUrl: `/api/developer/games/${MATCH3_GAME_ID}`,
      method: 'PUT',
      headers: {},
    } as any;

    let responseStatus = 0;
    let responseBody: any = null;

    const mockRes = {
      setHeader: () => {},
      status: (code: number) => {
        responseStatus = code;
        return {
          json: (body: any) => {
            responseBody = body;
          },
        };
      },
    } as any;

    const validationError = new GameEngineValidationError(
      'Cannot activate game: Game engine "invalid-engine-id" is not a recognized production engine.',
      'UNRECOGNIZED_PRODUCTION_ENGINE',
      422
    );

    handleApiError(validationError, mockReq, mockRes);

    expect(responseStatus).toBe(422);
    expect(responseStatus).not.toBe(500);
    expect(responseBody.error).toContain('is not a recognized production engine');
    expect(responseBody.code).toBe('UNRECOGNIZED_PRODUCTION_ENGINE');
  });
});
