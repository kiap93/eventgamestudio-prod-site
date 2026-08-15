import { getSupabaseServerClient } from '../supabase.js';
import { GameRecord, BasketConfig, ItemConfig, SettingsConfig } from './types.js';
import crypto from 'node:crypto';

export const DEFAULT_BASKET_CONFIG: BasketConfig = {
  name: 'Standard Basket',
  imageUrl: null,
  width: 90,
  height: 48,
  catchAreaRatio: 0.85,
};

export const DEFAULT_ITEMS_CONFIG: ItemConfig[] = [
  { id: 'green_durian', name: 'Fresh Green Durian', points: 100, speedMultiplier: 1.0, enabled: true, isHazard: false },
  { id: 'golden_durian', name: 'Golden Musang King', points: 250, speedMultiplier: 1.2, enabled: true, isHazard: false },
  { id: 'orange_durian', name: 'Spiky Hazard', points: -150, speedMultiplier: 1.3, enabled: true, isHazard: true },
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
    name: 'Durian Catcher',
    slug: 'durian-catcher',
    game_type: 'catch-brand',
    description: 'Catch falling branded collectibles with precision paddle/basket mechanics and dynamic hazard avoidance.',
    icon_name: 'Gamepad2',
  },
  {
    name: 'Memory Match',
    slug: 'memory-match',
    game_type: 'memory-match',
    description: 'Grid-based card flip memory matching challenge featuring your custom product graphics and icons.',
    icon_name: 'Layers',
  },
  {
    name: 'Speed Reflex Tap',
    slug: 'reaction-tap',
    game_type: 'reaction-tap',
    description: 'High-speed reaction tap tester testing player agility and focus on appearing sponsor tokens.',
    icon_name: 'Zap',
  },
];

export async function getGameById(gameId: string, env?: Record<string, any>): Promise<GameRecord | null> {
  const supabase = getSupabaseServerClient(env);
  const { data, error } = await supabase
    .from('games')
    .select('*')
    .eq('id', gameId)
    .maybeSingle();

  if (error) {
    console.error('Error in getGameById:', error);
    throw new Error(`Failed to get game by id: ${error.message}`);
  }

  return data as GameRecord | null;
}

export async function getGamesByOrgId(organizationId: string, env?: Record<string, any>): Promise<GameRecord[]> {
  const supabase = getSupabaseServerClient(env);
  const { data: gamesData, error } = await supabase
    .from('games')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: true });

  if (error) {
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
  const supabase = getSupabaseServerClient(env);
  const id = params.id || crypto.randomUUID();
  const now = new Date().toISOString();
  const slug = params.slug || params.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const game_type = params.game_type || 'catch-brand';

  const { data, error } = await supabase
    .from('games')
    .insert({
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
    })
    .select()
    .single();

  if (error) {
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
  const existingGames = await getGamesByOrgId(organizationId, env);
  if (existingGames.length >= CATALOG_GAMES.length) {
    return existingGames;
  }

  const existingTypes = new Set(existingGames.map((g) => g.game_type || g.slug));

  for (const catalogGame of CATALOG_GAMES) {
    if (!existingTypes.has(catalogGame.game_type) && !existingTypes.has(catalogGame.slug)) {
      try {
        await createGame(
          {
            organization_id: organizationId,
            name: catalogGame.name,
            slug: catalogGame.slug,
            game_type: catalogGame.game_type,
            description: catalogGame.description,
            icon_name: catalogGame.icon_name,
            background_url: '/assets/background.png',
            basket_config: DEFAULT_BASKET_CONFIG,
            items_config: DEFAULT_ITEMS_CONFIG,
            settings_config: DEFAULT_SETTINGS_CONFIG,
          },
          env
        );
      } catch (err: any) {
        console.warn('Could not seed game:', catalogGame.name, err.message);
      }
    }
  }

  return await getGamesByOrgId(organizationId, env);
}

export async function ensureDefaultGame(organizationId: string, orgName: string, env?: Record<string, any>): Promise<GameRecord> {
  const games = await ensureDefaultGames(organizationId, orgName, env);
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

  const { data, error } = await supabase
    .from('games')
    .update(payload)
    .eq('id', gameId)
    .select()
    .single();

  if (error) {
    console.error('Error in updateGameCustomization:', error);
    throw new Error(`Failed to update game: ${error.message}`);
  }

  return data as GameRecord;
}

// ============================================================================
// DEVELOPER ADMIN PLATFORM GAMES MANAGEMENT
// ============================================================================

export async function ensureSystemCatalogGames(env?: Record<string, any>): Promise<GameRecord[]> {
  const supabase = getSupabaseServerClient(env);

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

  for (const catalogGame of CATALOG_GAMES) {
    if (!existingTypes.has(catalogGame.game_type) && !existingTypes.has(catalogGame.slug)) {
      try {
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        await supabase.from('games').insert({
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
          background_url: '/assets/background.png',
          basket_config: DEFAULT_BASKET_CONFIG,
          items_config: DEFAULT_ITEMS_CONFIG,
          settings_config: DEFAULT_SETTINGS_CONFIG,
          created_at: now,
          updated_at: now,
        });
      } catch (err: any) {
        console.warn('Could not seed system game:', catalogGame.name, err.message);
      }
    }
  }

  return await getAllPlatformGames(env);
}

export async function getAllPlatformGames(env?: Record<string, any>): Promise<GameRecord[]> {
  const supabase = getSupabaseServerClient(env);

  // Fetch all games
  const { data: gamesData, error } = await supabase
    .from('games')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error in getAllPlatformGames:', error);
    throw new Error(`Failed to list platform games: ${error.message}`);
  }

  let games = (gamesData || []) as GameRecord[];

  // If no system games exist yet, initialize them
  if (games.length === 0 || !games.some((g) => g.is_system || !g.organization_id)) {
    for (const catalogGame of CATALOG_GAMES) {
      if (!games.some((g) => g.slug === catalogGame.slug || g.game_type === catalogGame.game_type)) {
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
              background_url: '/assets/background.png',
              basket_config: DEFAULT_BASKET_CONFIG,
              items_config: DEFAULT_ITEMS_CONFIG,
              settings_config: DEFAULT_SETTINGS_CONFIG,
              created_at: now,
              updated_at: now,
            })
            .select()
            .single();
          if (created) games.push(created as GameRecord);
        } catch (_err) {}
      }
    }
  }

  // Count themes per game (system default themes and all themes)
  const { data: themesData } = await supabase
    .from('game_themes')
    .select('id, game_id, is_system, ownership_type');

  const themeCountsByGame = new Map<string, number>();
  const systemThemeCountsByGame = new Map<string, number>();

  if (themesData) {
    for (const t of themesData) {
      if (t.game_id) {
        themeCountsByGame.set(t.game_id, (themeCountsByGame.get(t.game_id) || 0) + 1);
        if (t.is_system || t.ownership_type === 'system') {
          systemThemeCountsByGame.set(t.game_id, (systemThemeCountsByGame.get(t.game_id) || 0) + 1);
        }
      }
    }
  }

  return games.map((game) => ({
    ...game,
    is_system: game.is_system ?? (game.organization_id === null || game.ownership_type === 'system'),
    ownership_type: game.ownership_type || (game.organization_id ? 'organization' : 'system'),
    game_type: game.game_type || 'catch-brand',
    theme_count: themeCountsByGame.get(game.id) || 0,
    system_theme_count: systemThemeCountsByGame.get(game.id) || 0,
  } as any));
}

export async function createPlatformGame(
  params: {
    name: string;
    slug?: string;
    game_type: string;
    description?: string | null;
    icon_name?: string | null;
    status?: 'active' | 'archived' | 'draft';
    background_url?: string | null;
    basket_config?: any;
    items_config?: any;
    settings_config?: any;
  },
  env?: Record<string, any>
): Promise<GameRecord> {
  const supabase = getSupabaseServerClient(env);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const slug = params.slug || params.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  const { data, error } = await supabase
    .from('games')
    .insert({
      id,
      organization_id: null,
      is_system: true,
      ownership_type: 'system',
      name: params.name,
      slug,
      game_type: params.game_type,
      description: params.description || null,
      icon_name: params.icon_name || 'Gamepad2',
      status: params.status || 'active',
      background_url: params.background_url || '/assets/background.png',
      basket_config: params.basket_config ?? DEFAULT_BASKET_CONFIG,
      items_config: params.items_config ?? DEFAULT_ITEMS_CONFIG,
      settings_config: params.settings_config ?? DEFAULT_SETTINGS_CONFIG,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (error) {
    console.error('Error in createPlatformGame:', error);
    throw new Error(`Failed to create platform game: ${error.message}`);
  }

  return {
    ...data,
    is_system: true,
    ownership_type: 'system',
    theme_count: 0,
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
    status?: 'active' | 'archived' | 'draft';
    active_theme_id?: string | null;
    background_url?: string | null;
    basket_config?: any;
    items_config?: any;
    settings_config?: any;
  },
  env?: Record<string, any>
): Promise<GameRecord> {
  const supabase = getSupabaseServerClient(env);
  const now = new Date().toISOString();

  const payload: any = {
    updated_at: now,
  };

  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.slug !== undefined) payload.slug = updates.slug;
  if (updates.game_type !== undefined) payload.game_type = updates.game_type;
  if (updates.description !== undefined) payload.description = updates.description;
  if (updates.icon_name !== undefined) payload.icon_name = updates.icon_name;
  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.active_theme_id !== undefined) payload.active_theme_id = updates.active_theme_id;
  if (updates.background_url !== undefined) payload.background_url = updates.background_url;
  if (updates.basket_config !== undefined) payload.basket_config = updates.basket_config;
  if (updates.items_config !== undefined) payload.items_config = updates.items_config;
  if (updates.settings_config !== undefined) payload.settings_config = updates.settings_config;

  const { data, error } = await supabase
    .from('games')
    .update(payload)
    .eq('id', gameId)
    .select()
    .single();

  if (error) {
    console.error('Error in updatePlatformGame:', error);
    throw new Error(`Failed to update platform game: ${error.message}`);
  }

  return data as GameRecord;
}

export async function deletePlatformGame(gameId: string, env?: Record<string, any>): Promise<void> {
  const supabase = getSupabaseServerClient(env);

  // Check if any events reference themes belonging to this game
  const { data: themes } = await supabase
    .from('game_themes')
    .select('id')
    .eq('game_id', gameId);

  if (themes && themes.length > 0) {
    const themeIds = themes.map((t) => t.id);
    const { data: events } = await supabase
      .from('events')
      .select('id')
      .in('game_theme_id', themeIds)
      .limit(1);

    if (events && events.length > 0) {
      throw new Error('Cannot delete game: Live or scheduled events are actively using themes from this game.');
    }
  }

  const { error } = await supabase.from('games').delete().eq('id', gameId);
  if (error) {
    console.error('Error in deletePlatformGame:', error);
    throw new Error(`Failed to delete platform game: ${error.message}`);
  }
}

