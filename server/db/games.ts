import { getSupabaseServerClient, isSupabaseConfigured } from '../supabase.js';
import { GameRecord, BasketConfig, ItemConfig, SettingsConfig } from './types.js';
import crypto from 'node:crypto';

const localGamesCache = new Map<string, GameRecord>();

export const DEFAULT_BASKET_CONFIG: BasketConfig = {
  name: 'Standard Basket',
  imageUrl: null,
  width: 90,
  height: 48,
  catchAreaRatio: 0.85,
};

export const DEFAULT_ITEMS_CONFIG: ItemConfig[] = [
  { id: 'ticket', name: 'Golden Carnival Ticket', points: 100, speedMultiplier: 1.0, enabled: true, isHazard: false },
  { id: 'star', name: 'Cosmic Carnival Star', points: 250, speedMultiplier: 1.2, enabled: true, isHazard: false },
  { id: 'mask', name: 'Carnival Cursed Mask', points: -150, speedMultiplier: 1.3, enabled: true, isHazard: true },
];

export const DEFAULT_SETTINGS_CONFIG: SettingsConfig = {
  durationSeconds: 30,
  baseFallSpeed: 1.0,
  spawnRateMultiplier: 1.0,
  soundVolume: 0.8,
  soundEnabled: true,
  bgmEnabled: true,
  cameraControlEnabled: true,
};

export const CATALOG_GAMES = [
  {
    name: 'Catch the Brand',
    slug: 'catch-brand',
    game_type: 'catch-brand',
    description: 'Fast-paced arcade catcher! Catch good brand objects, dodge hazardous obstacles, and collect golden bonus items.',
    icon_name: 'Gamepad2',
  },
  {
    name: 'Brand Memory Match',
    slug: 'memory-match',
    game_type: 'memory-match',
    description: 'Classic card flip and memory puzzle matching custom branded products and logos.',
    icon_name: 'Grid3X3',
  },
];

export class GameConflictError extends Error {
  code: 'GAME_TYPE_ALREADY_REGISTERED' | 'GAME_SLUG_ALREADY_REGISTERED';
  constructor(code: 'GAME_TYPE_ALREADY_REGISTERED' | 'GAME_SLUG_ALREADY_REGISTERED', message: string) {
    super(message);
    this.name = 'GameConflictError';
    this.code = code;
  }
}

/**
 * Safely inserts into the 'games' table by catching PostgREST schema cache errors
 * (e.g. "Could not find the 'description' column of 'games' in the schema cache")
 * and retrying with the missing column omitted.
 */
async function safeInsertGame(
  supabase: any,
  initialPayload: Record<string, any>
): Promise<{ data: any; error: any }> {
  let payload = { ...initialPayload };
  for (let attempt = 0; attempt < 8; attempt++) {
    const { data, error } = await supabase
      .from('games')
      .insert(payload)
      .select()
      .single();

    if (!error) {
      return { data: { ...initialPayload, ...data }, error: null };
    }

    const missingColMatch = error.message?.match(/Could not find the '([^']+)' column of 'games'/i);
    if (missingColMatch && missingColMatch[1] && payload[missingColMatch[1]] !== undefined) {
      const missingCol = missingColMatch[1];
      console.warn(`[Supabase Schema Fallback] Column '${missingCol}' not found in 'games' table. Retrying insert without this column...`);
      delete payload[missingCol];
      continue;
    }

    return { data: null, error };
  }
  return { data: null, error: new Error('Failed to insert game after multiple fallback attempts') };
}

/**
 * Safely updates the 'games' table by catching PostgREST schema cache errors
 * and retrying with the missing column omitted.
 */
async function safeUpdateGame(
  supabase: any,
  gameId: string,
  initialPayload: Record<string, any>
): Promise<{ data: any; error: any }> {
  let payload = { ...initialPayload };
  for (let attempt = 0; attempt < 8; attempt++) {
    const { data, error } = await supabase
      .from('games')
      .update(payload)
      .eq('id', gameId)
      .select()
      .single();

    if (!error) {
      return { data: { ...initialPayload, ...data }, error: null };
    }

    const missingColMatch = error.message?.match(/Could not find the '([^']+)' column of 'games'/i);
    if (missingColMatch && missingColMatch[1] && payload[missingColMatch[1]] !== undefined) {
      const missingCol = missingColMatch[1];
      console.warn(`[Supabase Schema Fallback] Column '${missingCol}' not found in 'games' table. Retrying update without this column...`);
      delete payload[missingCol];
      continue;
    }

    return { data: null, error };
  }
  return { data: null, error: new Error('Failed to update game after multiple fallback attempts') };
}

export async function getGameById(gameId: string, env?: Record<string, any>): Promise<GameRecord | null> {
  const supabase = getSupabaseServerClient(env);
  const { data, error } = await supabase
    .from('games')
    .select('*')
    .eq('id', gameId)
    .maybeSingle();

  if (error) {
    if (error.message?.includes('Placeholder') || error.code === 'PGRST000') {
      const match = CATALOG_GAMES.find((g) => g.slug === gameId || g.game_type === gameId) || CATALOG_GAMES[0];
      return {
        id: gameId,
        organization_id: '00000000-0000-0000-0000-000000000001',
        name: match.name,
        slug: match.slug,
        game_type: match.game_type as any,
        description: match.description,
        branding: { gameTitle: match.name } as any,
        basket_config: DEFAULT_BASKET_CONFIG,
        items_config: DEFAULT_ITEMS_CONFIG,
        settings_config: DEFAULT_SETTINGS_CONFIG,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as unknown as GameRecord;
    }
    console.error('Error in getGameById:', error);
    throw new Error(`Failed to get game by id: ${error.message}`);
  }

  return data as GameRecord | null;
}

export async function getGamesByOrgId(organizationId: string, env?: Record<string, any>): Promise<GameRecord[]> {
  if (!isSupabaseConfigured(env)) {
    const games = Array.from(localGamesCache.values()).filter((g) => g.organization_id === organizationId);
    return games;
  }

  const supabase = getSupabaseServerClient(env);
  const { data: gamesData, error } = await supabase
    .from('games')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: true });

  if (error) {
    if (error.message?.includes('Placeholder') || error.code === 'PGRST000') {
      const games = Array.from(localGamesCache.values()).filter((g) => g.organization_id === organizationId);
      return games;
    }
    console.error('Error in getGamesByOrgId:', error);
    throw new Error(`Failed to list games: ${error.message}`);
  }

  const games = (gamesData || []) as GameRecord[];

  // Fetch theme counts per game
  const { data: themesData } = await supabase
    .from('game_themes')
    .select('id, game_id')
    .eq('organization_id', organizationId);

  const themeCountsByGame = new Map<string, number>();
  if (themesData) {
    for (const theme of themesData) {
      if (theme.game_id) {
        themeCountsByGame.set(theme.game_id, (themeCountsByGame.get(theme.game_id) || 0) + 1);
      }
    }
  }

  return games.map((game) => ({
    ...game,
    game_type: game.game_type || 'catch-brand',
    theme_count: themeCountsByGame.get(game.id) || 0,
  }));
}

export async function createGame(
  params: {
    id?: string;
    organization_id: string;
    name: string;
    slug?: string;
    game_type?: string;
    description?: string | null;
    icon_name?: string | null;
    status?: 'active' | 'archived' | 'draft';
    background_url?: string | null;
    basket_config?: BasketConfig | any;
    items_config?: ItemConfig[] | any;
    settings_config?: SettingsConfig | any;
  },
  env?: Record<string, any>
): Promise<GameRecord> {
  const id = params.id || crypto.randomUUID();
  const now = new Date().toISOString();
  const slug = params.slug || params.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const game_type = params.game_type || 'catch-brand';

  const newGame: GameRecord = {
    id,
    organization_id: params.organization_id,
    name: params.name,
    slug,
    game_type,
    description: params.description || null,
    icon_name: params.icon_name || null,
    status: params.status || 'active',
    background_url: params.background_url || 'forest',
    basket_config: params.basket_config ?? DEFAULT_BASKET_CONFIG,
    items_config: params.items_config ?? DEFAULT_ITEMS_CONFIG,
    settings_config: params.settings_config ?? DEFAULT_SETTINGS_CONFIG,
    created_at: now,
    updated_at: now,
  } as GameRecord;

  if (!isSupabaseConfigured(env)) {
    localGamesCache.set(id, newGame);
    return newGame;
  }

  const supabase = getSupabaseServerClient(env);
  const { data, error } = await safeInsertGame(supabase, {
    id,
    organization_id: params.organization_id,
    name: params.name,
    slug,
    game_type,
    description: params.description || null,
    icon_name: params.icon_name || null,
    status: params.status || 'active',
    background_url: params.background_url || 'forest',
    basket_config: params.basket_config ?? DEFAULT_BASKET_CONFIG,
    items_config: params.items_config ?? DEFAULT_ITEMS_CONFIG,
    settings_config: params.settings_config ?? DEFAULT_SETTINGS_CONFIG,
    created_at: now,
    updated_at: now,
  });

  if (error) {
    if (error.message?.includes('Placeholder') || error.code === 'PGRST000') {
      localGamesCache.set(id, newGame);
      return newGame;
    }
    console.error('Error in createGame:', error);
    throw new Error(`Failed to create game: ${error.message}`);
  }

  return data as GameRecord;
}

export async function ensureDefaultGames(
  organizationId: string,
  _orgName?: string,
  env?: Record<string, any>
): Promise<GameRecord[]> {
  return await getAvailableGamesForStudio(organizationId, env);
}

export async function ensureDefaultGame(organizationId: string, _orgName?: string, env?: Record<string, any>): Promise<GameRecord> {
  const games = await getAvailableGamesForStudio(organizationId, env);
  return games[0];
}

export async function updateGameCustomization(
  gameId: string,
  updates: {
    background_url?: string | null;
    basket_config?: any;
    items_config?: any;
    settings_config?: any;
    name?: string;
  },
  env?: Record<string, any>
): Promise<GameRecord> {
  const supabase = getSupabaseServerClient(env);
  const now = new Date().toISOString();

  const payload: any = {
    updated_at: now,
  };

  if (updates.background_url !== undefined) payload.background_url = updates.background_url;
  if (updates.basket_config !== undefined) payload.basket_config = updates.basket_config;
  if (updates.items_config !== undefined) payload.items_config = updates.items_config;
  if (updates.settings_config !== undefined) payload.settings_config = updates.settings_config;
  if (updates.name !== undefined) payload.name = updates.name;

  const { data, error } = await safeUpdateGame(supabase, gameId, payload);

  if (error) {
    console.error('Error in updateGameCustomization:', error);
    throw new Error(`Failed to update game: ${error.message}`);
  }

  return data as GameRecord;
}

// ============================================================================
// DEVELOPER ADMIN PLATFORM GAMES MANAGEMENT
// ============================================================================

export async function cleanupDuplicateSystemGames(env?: Record<string, any>): Promise<void> {
  try {
    const supabase = getSupabaseServerClient(env);
    
    // Clean up any rogue org-specific games by reassigning their themes to system games if needed, or removing orphan duplicates
    const { data: orgGames } = await supabase
      .from('games')
      .select('id, name, slug, game_type, organization_id')
      .not('organization_id', 'is', null);

    if (orgGames && orgGames.length > 0) {
      const { data: systemGames } = await supabase
        .from('games')
        .select('id, game_type, slug')
        .or('is_system.eq.true,organization_id.is.null');

      const systemMap = new Map<string, string>();
      if (systemGames) {
        for (const sg of systemGames) {
          if (sg.game_type) systemMap.set(sg.game_type, sg.id);
          if (sg.slug) systemMap.set(sg.slug, sg.id);
        }
      }

      for (const og of orgGames) {
        const canonicalSystemId = systemMap.get(og.game_type || '') || systemMap.get(og.slug || '');
        if (canonicalSystemId) {
          await supabase.from('game_themes').update({ game_id: canonicalSystemId }).eq('game_id', og.id);
          await supabase.from('events').update({ game_id: canonicalSystemId }).eq('game_id', og.id);
        }
        await supabase.from('games').delete().eq('id', og.id);
      }
    }

    const { data: systemGames, error } = await supabase
      .from('games')
      .select('id, name, slug, game_type, created_at')
      .or('is_system.eq.true,organization_id.is.null');

    if (error || !systemGames || systemGames.length === 0) return;

    // Group by game_type
    const byType = new Map<string, typeof systemGames>();
    for (const g of systemGames) {
      const type = g.game_type || 'catch-brand';
      const list = byType.get(type) || [];
      list.push(g);
      byType.set(type, list);
    }

    for (const [, gamesList] of byType.entries()) {
      if (gamesList.length > 1) {
        // Fetch theme counts to determine canonical game
        const { data: themes } = await supabase
          .from('game_themes')
          .select('id, game_id')
          .in('game_id', gamesList.map((g) => g.id));

        const themeCounts = new Map<string, number>();
        if (themes) {
          for (const t of themes) {
            if (t.game_id) themeCounts.set(t.game_id, (themeCounts.get(t.game_id) || 0) + 1);
          }
        }

        // Sort descending by theme count, then ascending by created_at (oldest/most active first)
        gamesList.sort((a, b) => {
          const aThemes = themeCounts.get(a.id) || 0;
          const bThemes = themeCounts.get(b.id) || 0;
          if (bThemes !== aThemes) return bThemes - aThemes;
          return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
        });

        const canonical = gamesList[0];
        const duplicates = gamesList.slice(1);

        for (const dup of duplicates) {
          console.warn(`[System Games] Merging duplicate game ${dup.name} (${dup.id}) into canonical game ${canonical.name} (${canonical.id})`);
          // Reassign themes from duplicate to canonical game
          await supabase.from('game_themes').update({ game_id: canonical.id }).eq('game_id', dup.id);
          // Reassign events from duplicate to canonical game
          await supabase.from('events').update({ game_id: canonical.id }).eq('game_id', dup.id);
          // Delete duplicate game record
          await supabase.from('games').delete().eq('id', dup.id);
        }
      }
    }
  } catch (err: any) {
    console.error('Error in cleanupDuplicateSystemGames:', err);
  }
}

export async function ensureSystemCatalogGames(env?: Record<string, any>): Promise<GameRecord[]> {
  const supabase = getSupabaseServerClient(env);

  // First run cleanup to eliminate any existing duplicates
  await cleanupDuplicateSystemGames(env);

  // Check if system games already exist
  const { data: existingGames, error } = await supabase
    .from('games')
    .select('*')
    .or('is_system.eq.true,organization_id.is.null');

  if (error) {
    console.error('Error checking system games:', error);
  }

  const list = (existingGames || []) as GameRecord[];
  const existingTypes = new Set(list.map((g) => g.game_type || g.slug));

  // Ensure each catalog game exists in platform games
  for (const catalogGame of CATALOG_GAMES) {
    if (!existingTypes.has(catalogGame.game_type) && !existingTypes.has(catalogGame.slug)) {
      try {
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        const { data: created } = await supabase
          .from('games')
          .insert({
            id,
            organization_id: null,
            is_system: true,
            ownership_type: 'system',
            name: catalogGame.name,
            slug: catalogGame.slug,
            game_type: catalogGame.game_type,
            description: catalogGame.description,
            icon_name: catalogGame.icon_name,
            status: 'active',
            background_url: '/assets/themes/carnival/background.png',
            basket_config: DEFAULT_BASKET_CONFIG,
            items_config: DEFAULT_ITEMS_CONFIG,
            settings_config: DEFAULT_SETTINGS_CONFIG,
            created_at: now,
            updated_at: now,
          })
          .select()
          .single();

        if (created) {
          list.push(created as GameRecord);
          // Seed default system themes for this new platform game
          try {
            const { ensureSystemDefaultThemesForGame } = await import('./themes.js');
            await ensureSystemDefaultThemesForGame(created.id, created.game_type, env);
          } catch (themeErr: any) {
            console.warn('Could not seed system themes for game:', catalogGame.name, themeErr?.message);
          }
        }
      } catch (err: any) {
        console.warn('Could not seed baseline system game:', catalogGame.name, err.message);
      }
    }
  }

  return await getAllPlatformGames(env);
}

export async function getAllPlatformGames(env?: Record<string, any>): Promise<GameRecord[]> {
  const supabase = getSupabaseServerClient(env);

  // Perform deduplication check
  await cleanupDuplicateSystemGames(env);

  // Fetch all system games
  const { data: gamesData, error } = await supabase
    .from('games')
    .select('*')
    .or('is_system.eq.true,organization_id.is.null')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error in getAllPlatformGames:', error);
    throw new Error(`Failed to list platform games: ${error.message}`);
  }

  let games = (gamesData || []) as GameRecord[];
  const existingTypes = new Set(games.map((g) => g.game_type || g.slug));

  // If any catalog game is missing, initialize it
  for (const catalogGame of CATALOG_GAMES) {
    if (!existingTypes.has(catalogGame.game_type) && !existingTypes.has(catalogGame.slug)) {
      try {
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        const { data: created } = await supabase
          .from('games')
          .insert({
            id,
            organization_id: null,
            is_system: true,
            ownership_type: 'system',
            name: catalogGame.name,
            slug: catalogGame.slug,
            game_type: catalogGame.game_type,
            description: catalogGame.description,
            icon_name: catalogGame.icon_name,
            status: 'active',
            background_url: '/assets/themes/carnival/background.png',
            basket_config: DEFAULT_BASKET_CONFIG,
            items_config: DEFAULT_ITEMS_CONFIG,
            settings_config: DEFAULT_SETTINGS_CONFIG,
            created_at: now,
            updated_at: now,
          })
          .select()
          .single();
        if (created) {
          games.push(created as GameRecord);
          try {
            const { ensureSystemDefaultThemesForGame } = await import('./themes.js');
            await ensureSystemDefaultThemesForGame(created.id, created.game_type, env);
          } catch (_err) {}
        }
      } catch (_err) {}
    }
  }

  // Count themes per game (system default themes and all themes)
  const { data: themesData } = await supabase
    .from('game_themes')
    .select('id, game_id, is_system, ownership_type');

  const themeCountsByGame = new Map<string, number>();
  const systemThemeCountsByGame = new Map<string, number>();
  const themeToGameMap = new Map<string, string>();

  if (themesData) {
    for (const t of themesData) {
      if (t.game_id) {
        themeToGameMap.set(t.id, t.game_id);
        themeCountsByGame.set(t.game_id, (themeCountsByGame.get(t.game_id) || 0) + 1);
        if (t.is_system || t.ownership_type === 'system') {
          systemThemeCountsByGame.set(t.game_id, (systemThemeCountsByGame.get(t.game_id) || 0) + 1);
        }
      }
    }
  }

  // Count events per game (via events.game_id and events.game_theme_id)
  const { data: eventsData } = await supabase
    .from('events')
    .select('id, game_id, game_theme_id');

  const eventCountsByGame = new Map<string, number>();
  if (eventsData) {
    for (const ev of eventsData) {
      const gId = ev.game_id || (ev.game_theme_id ? themeToGameMap.get(ev.game_theme_id) : null);
      if (gId) {
        eventCountsByGame.set(gId, (eventCountsByGame.get(gId) || 0) + 1);
      }
    }
  }

  return games.map((game) => ({
    ...game,
    is_system: true,
    ownership_type: 'system',
    status: (game.status as any) || 'active',
    game_type: game.game_type || 'catch-brand',
    theme_count: themeCountsByGame.get(game.id) || 0,
    system_theme_count: systemThemeCountsByGame.get(game.id) || 0,
    events_count: eventCountsByGame.get(game.id) || 0,
  } as any));
}

export async function createPlatformGame(
  params: {
    name: string;
    slug?: string;
    game_type: string;
    description?: string | null;
    icon_name?: string | null;
    status?: 'active' | 'inactive' | 'archived' | 'draft';
    background_url?: string | null;
    basket_config?: any;
    items_config?: any;
    settings_config?: any;
  },
  env?: Record<string, any>
): Promise<GameRecord> {
  const supabase = getSupabaseServerClient(env);
  const cleanName = params.name.trim();
  const cleanGameType = (params.game_type || '').trim();
  const cleanSlug = (params.slug || cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')).trim();

  if (!cleanName) {
    throw new Error('Game title is required');
  }
  if (!cleanGameType) {
    throw new Error('Game engine / type is required');
  }

  // 1. Explicit Check for Existing System Game with same game_type
  const { data: existingTypeGame } = await supabase
    .from('games')
    .select('id, name, game_type, slug')
    .or('is_system.eq.true,organization_id.is.null')
    .eq('game_type', cleanGameType)
    .maybeSingle();

  if (existingTypeGame) {
    throw new GameConflictError(
      'GAME_TYPE_ALREADY_REGISTERED',
      `This game type "${cleanGameType}" is already registered as a system game ("${existingTypeGame.name}"). Please manage themes under the existing game instead of creating a duplicate.`
    );
  }

  // 2. Explicit Check for Existing System Game with same slug
  const { data: existingSlugGame } = await supabase
    .from('games')
    .select('id, name, game_type, slug')
    .or('is_system.eq.true,organization_id.is.null')
    .eq('slug', cleanSlug)
    .maybeSingle();

  if (existingSlugGame) {
    throw new GameConflictError(
      'GAME_SLUG_ALREADY_REGISTERED',
      `This system game slug "${cleanSlug}" is already in use by "${existingSlugGame.name}". Please choose another slug.`
    );
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const insertPayload = {
    id,
    organization_id: null,
    is_system: true,
    ownership_type: 'system',
    name: cleanName,
    slug: cleanSlug,
    game_type: cleanGameType,
    description: params.description ? params.description.trim() : null,
    icon_name: params.icon_name || 'Gamepad2',
    status: params.status || 'active',
    background_url: params.background_url || '/assets/themes/carnival/background.png',
    basket_config: params.basket_config ?? DEFAULT_BASKET_CONFIG,
    items_config: params.items_config ?? DEFAULT_ITEMS_CONFIG,
    settings_config: params.settings_config ?? DEFAULT_SETTINGS_CONFIG,
    created_at: now,
    updated_at: now,
  };

  const { data, error } = await safeInsertGame(supabase, insertPayload);

  if (error) {
    if (error.code === '23505' || error.message?.includes('ux_system_games_game_type') || error.message?.includes('game_type')) {
      throw new GameConflictError(
        'GAME_TYPE_ALREADY_REGISTERED',
        'This game type is already registered as a system game.'
      );
    }
    if (error.code === '23505' || error.message?.includes('ux_system_games_slug') || error.message?.includes('slug')) {
      throw new GameConflictError(
        'GAME_SLUG_ALREADY_REGISTERED',
        'This system game slug is already in use.'
      );
    }
    console.error('Error in createPlatformGame:', error);
    throw new Error(`Failed to create platform game: ${error.message}`);
  }

  return {
    ...data,
    is_system: true,
    ownership_type: 'system',
    theme_count: 0,
    system_theme_count: 0,
    events_count: 0,
  } as GameRecord;
}

export async function updatePlatformGame(
  gameId: string,
  updates: {
    name?: string;
    slug?: string;
    game_type?: string;
    description?: string | null;
    icon_name?: string | null;
    status?: 'active' | 'inactive' | 'archived' | 'draft';
    background_url?: string | null;
    basket_config?: any;
    items_config?: any;
    settings_config?: any;
  },
  env?: Record<string, any>
): Promise<GameRecord> {
  const supabase = getSupabaseServerClient(env);
  const now = new Date().toISOString();

  // If game_type is being updated, verify no other system game has it
  if (updates.game_type !== undefined) {
    const cleanGameType = updates.game_type.trim();
    const { data: conflictType } = await supabase
      .from('games')
      .select('id, name, game_type')
      .or('is_system.eq.true,organization_id.is.null')
      .eq('game_type', cleanGameType)
      .neq('id', gameId)
      .maybeSingle();

    if (conflictType) {
      throw new GameConflictError(
        'GAME_TYPE_ALREADY_REGISTERED',
        `This game type "${cleanGameType}" is already registered by "${conflictType.name}".`
      );
    }
  }

  // If slug is being updated, verify no other system game has it
  if (updates.slug !== undefined) {
    const cleanSlug = updates.slug.trim();
    const { data: conflictSlug } = await supabase
      .from('games')
      .select('id, name, slug')
      .or('is_system.eq.true,organization_id.is.null')
      .eq('slug', cleanSlug)
      .neq('id', gameId)
      .maybeSingle();

    if (conflictSlug) {
      throw new GameConflictError(
        'GAME_SLUG_ALREADY_REGISTERED',
        `This system game slug "${cleanSlug}" is already in use by "${conflictSlug.name}".`
      );
    }
  }

  const payload: any = {
    updated_at: now,
  };

  if (updates.name !== undefined) payload.name = updates.name.trim();
  if (updates.slug !== undefined) payload.slug = updates.slug.trim();
  if (updates.game_type !== undefined) payload.game_type = updates.game_type.trim();
  if (updates.description !== undefined) payload.description = updates.description?.trim() || null;
  if (updates.icon_name !== undefined) payload.icon_name = updates.icon_name;
  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.background_url !== undefined) payload.background_url = updates.background_url;
  if (updates.basket_config !== undefined) payload.basket_config = updates.basket_config;
  if (updates.items_config !== undefined) payload.items_config = updates.items_config;
  if (updates.settings_config !== undefined) payload.settings_config = updates.settings_config;

  const { data, error } = await safeUpdateGame(supabase, gameId, payload);

  if (error) {
    if (error.code === '23505' || error.message?.includes('ux_system_games_game_type') || error.message?.includes('game_type')) {
      throw new GameConflictError(
        'GAME_TYPE_ALREADY_REGISTERED',
        'This game type is already registered as a system game.'
      );
    }
    if (error.code === '23505' || error.message?.includes('ux_system_games_slug') || error.message?.includes('slug')) {
      throw new GameConflictError(
        'GAME_SLUG_ALREADY_REGISTERED',
        'This system game slug is already in use.'
      );
    }
    console.error('Error in updatePlatformGame:', error);
    throw new Error(`Failed to update platform game: ${error.message}`);
  }

  return data as GameRecord;
}

export async function deletePlatformGame(gameId: string, env?: Record<string, any>): Promise<void> {
  const supabase = getSupabaseServerClient(env);

  // 1. Direct check: Check if any events reference this game directly via events.game_id
  const { data: directEvents, error: directEventsErr } = await supabase
    .from('events')
    .select('id')
    .eq('game_id', gameId)
    .limit(1);

  if (directEvents && directEvents.length > 0) {
    const err: any = new Error('This game cannot be deleted because it is already used by one or more events. Deactivate it instead.');
    err.code = 'GAME_IN_USE';
    err.status = 409;
    throw err;
  }

  // 2. Check if any events reference themes belonging to this game
  const { data: themes } = await supabase
    .from('game_themes')
    .select('id')
    .eq('game_id', gameId);

  if (themes && themes.length > 0) {
    const themeIds = themes.map((t) => t.id);
    const { data: themeEvents } = await supabase
      .from('events')
      .select('id')
      .in('game_theme_id', themeIds)
      .limit(1);

    if (themeEvents && themeEvents.length > 0) {
      const err: any = new Error('This game cannot be deleted because it is already used by one or more events. Deactivate it instead.');
      err.code = 'GAME_IN_USE';
      err.status = 409;
      throw err;
    }
  }

  // 3. Perform delete
  const { error } = await supabase.from('games').delete().eq('id', gameId);
  if (error) {
    if (error.code === '23503' || error.message?.includes('foreign key') || error.message?.includes('restrict')) {
      const err: any = new Error('This game cannot be deleted because it is already used by one or more events. Deactivate it instead.');
      err.code = 'GAME_IN_USE';
      err.status = 409;
      throw err;
    }
    console.error('Error in deletePlatformGame:', error);
    throw new Error(`Failed to delete platform game: ${error.message}`);
  }
}

/**
 * Retrieves the list of active games available for an organization in Game Studio.
 * Games are platform-level entities registered by Developer/Admin in Supabase.
 */
export async function getAvailableGamesForStudio(organizationId: string, env?: Record<string, any>): Promise<GameRecord[]> {
  const supabase = getSupabaseServerClient(env);
  await cleanupDuplicateSystemGames(env);

  // Fetch all active system games registered by Admin/Developer
  const { data: gamesData, error } = await supabase
    .from('games')
    .select('*')
    .or('is_system.eq.true,organization_id.is.null')
    .eq('status', 'active')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error in getAvailableGamesForStudio:', error);
    throw new Error(`Failed to list available games: ${error.message}`);
  }

  let games = (gamesData || []) as GameRecord[];

  // If no system games yet exist in the database, seed only the baseline system game
  if (games.length === 0) {
    const platformGames = await ensureSystemCatalogGames(env);
    games = platformGames.filter((g) => g.status === 'active');
  }

  // Count available themes for this organization (system themes + organization custom themes for this game)
  const { data: themesData } = await supabase
    .from('game_themes')
    .select('id, game_id, organization_id, is_system, status')
    .or(`organization_id.eq.${organizationId},is_system.eq.true`)
    .eq('status', 'active');

  const themeCountsByGame = new Map<string, number>();
  if (themesData) {
    for (const t of themesData) {
      if (t.game_id) {
        themeCountsByGame.set(t.game_id, (themeCountsByGame.get(t.game_id) || 0) + 1);
      }
    }
  }

  return games.map((game) => ({
    ...game,
    is_system: true,
    ownership_type: 'system',
    theme_count: themeCountsByGame.get(game.id) || 0,
  }));
}


