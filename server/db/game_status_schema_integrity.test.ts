import { describe, it, expect, beforeEach } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { createEvent, localEventsCache } from './events.js';
import { localGamePricingCache } from './gamePricing.js';
import { localThemesCache } from './themes.js';
import { localOrgsCache } from './organizations.js';
import { localGamesCache } from './games.js';
import type { GameRecord } from './types.js';

const testEnv = {
  NODE_ENV: 'test',
  SUPABASE_URL: 'https://placeholder-project.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'placeholder-service-key',
};

const orgId = '11111111-1111-1111-1111-111111111111';

// Game IDs for various statuses
const activeGameId = '22222222-2222-2222-2222-222222222222';
const inactiveGameId = '33333333-3333-3333-3333-333333333333';
const archivedGameId = '44444444-4444-4444-4444-444444444444';
const draftGameId = '55555555-5555-5555-5555-555555555555';
const nullStatusGameId = '66666666-6666-6666-6666-666666666666';

// Themes for each game
const activeThemeId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const inactiveThemeId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const archivedThemeId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const draftThemeId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const nullStatusThemeId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

function setupMockData() {
  localEventsCache.clear();
  localGamePricingCache.clear();
  localThemesCache.clear();
  localOrgsCache.clear();
  localGamesCache.clear();

  // 1. Setup Organization
  localOrgsCache.set(orgId, {
    id: orgId,
    name: 'Schema Test Org',
    slug: 'schema-test-org',
    owner_id: 'owner-user-1',
    country_code: 'MY',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as any);

  // 2. Setup Games with all 4 statuses + null status
  const games: GameRecord[] = [
    {
      id: activeGameId,
      name: 'Active Game',
      slug: 'active-game',
      game_type: 'catch-brand',
      status: 'active',
      is_system: true,
      ownership_type: 'system',
      background_url: '/assets/bg.png',
      basket_config: null,
      items_config: null,
      settings_config: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: inactiveGameId,
      name: 'Inactive Game',
      slug: 'inactive-game',
      game_type: 'memory-match',
      status: 'inactive',
      is_system: true,
      ownership_type: 'system',
      background_url: '/assets/bg.png',
      basket_config: null,
      items_config: null,
      settings_config: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: archivedGameId,
      name: 'Archived Game',
      slug: 'archived-game',
      game_type: 'reaction-tap',
      status: 'archived',
      is_system: true,
      ownership_type: 'system',
      background_url: '/assets/bg.png',
      basket_config: null,
      items_config: null,
      settings_config: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: draftGameId,
      name: 'Draft Game',
      slug: 'draft-game',
      game_type: 'match-3',
      status: 'draft',
      is_system: true,
      ownership_type: 'system',
      background_url: '/assets/bg.png',
      basket_config: null,
      items_config: null,
      settings_config: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: nullStatusGameId,
      name: 'Null Status Game',
      slug: 'null-status-game',
      game_type: 'speed-quiz',
      status: null as any,
      is_system: true,
      ownership_type: 'system',
      background_url: '/assets/bg.png',
      basket_config: null,
      items_config: null,
      settings_config: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  for (const g of games) {
    localGamesCache.set(g.id, g);
  }

  // 3. Setup Themes matching each game
  localThemesCache.set(activeThemeId, {
    id: activeThemeId,
    organization_id: orgId,
    game_id: activeGameId,
    name: 'Active Theme',
    status: 'active',
    is_system: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as any);

  localThemesCache.set(inactiveThemeId, {
    id: inactiveThemeId,
    organization_id: orgId,
    game_id: inactiveGameId,
    name: 'Inactive Theme',
    status: 'active',
    is_system: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as any);

  localThemesCache.set(archivedThemeId, {
    id: archivedThemeId,
    organization_id: orgId,
    game_id: archivedGameId,
    name: 'Archived Theme',
    status: 'active',
    is_system: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as any);

  localThemesCache.set(draftThemeId, {
    id: draftThemeId,
    organization_id: orgId,
    game_id: draftGameId,
    name: 'Draft Theme',
    status: 'active',
    is_system: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as any);

  localThemesCache.set(nullStatusThemeId, {
    id: nullStatusThemeId,
    organization_id: orgId,
    game_id: nullStatusGameId,
    name: 'Null Status Theme',
    status: 'active',
    is_system: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as any);

  // 4. Setup Pricing for the games (1 day = RM1,400)
  for (const g of games) {
    localGamePricingCache.set(g.id, [
      {
        id: `pricing-${g.id}`,
        game_id: g.id,
        country_code: 'MY',
        min_days: 1,
        max_days: 1,
        price: 1400,
        currency: 'MYR',
        is_active: true,
        is_base: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]);
  }
}

describe('Game Status & Schema Availability Single Source of Truth', () => {
  beforeEach(() => {
    setupMockData();
  });

  it('1. permits event creation when game status is "active"', async () => {
    const event = await createEvent({
      organization_id: orgId,
      game_id: activeGameId,
      game_theme_id: activeThemeId,
      name: 'Active Game Event',
      start_date: '2026-12-01',
      end_date: '2026-12-01',
      event_price: 1400,
      event_currency: 'MYR',
      created_by: 'owner-user-1',
    }, testEnv);

    expect(event).toBeDefined();
    expect(event.id).toBeDefined();
    expect(event.game_id).toBe(activeGameId);
    expect(event.status).toBe('draft');
  });

  it('2. rejects event creation when game status is "inactive"', async () => {
    let thrownError: any = null;
    try {
      await createEvent({
        organization_id: orgId,
        game_id: inactiveGameId,
        game_theme_id: inactiveThemeId,
        name: 'Inactive Game Event',
        start_date: '2026-12-01',
        end_date: '2026-12-01',
        created_by: 'owner-user-1',
      }, testEnv);
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).not.toBeNull();
    expect(thrownError.code).toBe('GAME_INACTIVE');
    expect(thrownError.status).toBe(422);
  });

  it('3. rejects event creation when game status is "archived"', async () => {
    let thrownError: any = null;
    try {
      await createEvent({
        organization_id: orgId,
        game_id: archivedGameId,
        game_theme_id: archivedThemeId,
        name: 'Archived Game Event',
        start_date: '2026-12-01',
        end_date: '2026-12-01',
        created_by: 'owner-user-1',
      }, testEnv);
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).not.toBeNull();
    expect(thrownError.code).toBe('GAME_INACTIVE');
    expect(thrownError.status).toBe(422);
  });

  it('4. rejects event creation when game status is "draft"', async () => {
    let thrownError: any = null;
    try {
      await createEvent({
        organization_id: orgId,
        game_id: draftGameId,
        game_theme_id: draftThemeId,
        name: 'Draft Game Event',
        start_date: '2026-12-01',
        end_date: '2026-12-01',
        created_by: 'owner-user-1',
      }, testEnv);
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).not.toBeNull();
    expect(thrownError.code).toBe('GAME_INACTIVE');
    expect(thrownError.status).toBe(422);
  });

  it('5. rejects event creation when game status is missing or null', async () => {
    let thrownError: any = null;
    try {
      await createEvent({
        organization_id: orgId,
        game_id: nullStatusGameId,
        game_theme_id: nullStatusThemeId,
        name: 'Null Status Game Event',
        start_date: '2026-12-01',
        end_date: '2026-12-01',
        created_by: 'owner-user-1',
      }, testEnv);
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).not.toBeNull();
    expect(thrownError.code).toBe('GAME_INACTIVE');
    expect(thrownError.status).toBe(422);
  });

  it('6. rejects event creation when game is not found', async () => {
    let thrownError: any = null;
    try {
      await createEvent({
        organization_id: orgId,
        game_id: '00000000-0000-0000-0000-000000000000',
        game_theme_id: activeThemeId,
        name: 'Nonexistent Game Event',
        start_date: '2026-12-01',
        end_date: '2026-12-01',
        created_by: 'owner-user-1',
      }, testEnv);
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).not.toBeNull();
    expect(thrownError.code).toBe('THEME_GAME_MISMATCH');
  });

  it('7. verifies SQL migrations and schema do not reference nonexistent v_game.is_active or v_game.engine_status', () => {
    const filesToCheck = [
      'supabase/migrations/20261020000000_fix_game_status_in_atomic_create_event.sql',
      'supabase/migrations/20261012000000_country_based_atomic_create_event.sql',
      'supabase/migrations/20260928000000_update_pending_event_limit_to_5.sql',
      'supabase/schema.sql',
    ];

    for (const relPath of filesToCheck) {
      const fullPath = path.resolve(process.cwd(), relPath);
      expect(fs.existsSync(fullPath)).toBe(true);

      const content = fs.readFileSync(fullPath, 'utf8');

      // Assert no v_game.is_active
      expect(content.includes('v_game.is_active')).toBe(false);

      // Assert no v_game.engine_status
      expect(content.includes('v_game.engine_status')).toBe(false);

      // Assert create_event_atomic checks v_game.status
      expect(content.includes('v_game.status')).toBe(true);
    }
  });
});
