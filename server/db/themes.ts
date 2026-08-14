import { getSupabaseServerClient } from '../supabase.js';
import {
  GameThemeRecord,
  ThemeBrandingConfig,
  ThemeBasketConfig,
  ThemeDropItem,
  ThemePhysicsConfig,
  ThemeVisualsConfig,
  ThemeSoundsConfig,
} from './types.js';
import crypto from 'node:crypto';

// ============================================================================
// DEFAULT REFERENCE THEME TEMPLATES
// ============================================================================

export const DEFAULT_DURIAN_THEME: Omit<GameThemeRecord, 'id' | 'organization_id' | 'created_at' | 'updated_at'> = {
  name: 'Durian Catcher',
  slug: 'durian-catcher',
  description: 'Classic retro arcade theme: Catch delicious green durians in a lush tropical forest.',
  status: 'active',
  is_active: true,
  branding: {
    gameTitle: 'DURIAN CATCHER',
    subtitle: 'Catch falling green durians, avoid spiky orange ones!',
    logoUrl: null,
    clientLogoUrl: null,
  },
  background_url: '/assets/background.png',
  basket_config: {
    name: 'Bamboo Basket',
    imageUrl: '/assets/basket.png',
    width: 140,
    height: 70,
    catchAreaRatio: 0.72,
    speed: 550,
    collisionWidthRatio: 0.7235,
    collisionHeightRatio: 0.13,
    collisionOffsetYRatio: 0.3394,
  },
  items_config: [
    {
      id: 'green_durian',
      name: 'Fresh Green Durian',
      imageUrl: '/assets/durian_green.png',
      points: 10,
      speedMultiplier: 1.0,
      spawnWeight: 75,
      enabled: true,
      isHazard: false,
      isBonus: false,
      collisionRadiusRatio: 0.3,
      collisionCenterXRatio: 0.5,
      collisionCenterYRatio: 0.54,
    },
    {
      id: 'orange_durian',
      name: 'Spiky Hazard Durian',
      imageUrl: '/assets/durian_brown.png',
      points: -10,
      speedMultiplier: 1.15,
      spawnWeight: 20,
      enabled: true,
      isHazard: true,
      isBonus: false,
      collisionRadiusRatio: 0.3,
      collisionCenterXRatio: 0.5,
      collisionCenterYRatio: 0.54,
    },
    {
      id: 'golden_durian',
      name: 'Golden Musang King',
      imageUrl: '/assets/durian_green.png', // Procedural gold shader or asset
      points: 50,
      speedMultiplier: 1.3,
      spawnWeight: 5,
      enabled: true,
      isHazard: false,
      isBonus: true,
      collisionRadiusRatio: 0.3,
      collisionCenterXRatio: 0.5,
      collisionCenterYRatio: 0.54,
    },
  ],
  physics_config: {
    gameDurationSeconds: 20,
    baseFallSpeed: 500,
    fallSpeedMultiplier: 0.7,
    spawnIntervalMin: 550,
    spawnIntervalMax: 1000,
    difficultyStages: [
      {
        timeThreshold: 0,
        spawnInterval: 1000,
        speedMin: 350,
        speedMax: 500,
        hazardRatio: 0.2,
        bonusRatio: 0.05,
        stageName: 'Stage 1: Calm Forest',
      },
      {
        timeThreshold: 7,
        spawnInterval: 750,
        speedMin: 400,
        speedMax: 600,
        hazardRatio: 0.3,
        bonusRatio: 0.08,
        stageName: 'Stage 2: Breezy Grove',
      },
      {
        timeThreshold: 14,
        spawnInterval: 550,
        speedMin: 500,
        speedMax: 700,
        hazardRatio: 0.4,
        bonusRatio: 0.12,
        stageName: 'Stage 3: Durian Storm!',
      },
    ],
  },
  visuals_config: {
    particleGood: 'particle_leaf',
    particleBad: 'particle_spike',
    particleBonus: 'particle_gold',
    primaryColor: '#10b981',
    secondaryColor: '#f59e0b',
    accentColor: '#ffee58',
    textColor: '#ffffff',
    cardGoodBg: 'rgba(6, 78, 59, 0.7)',
    cardGoodBorder: 'rgba(16, 185, 129, 0.5)',
    cardBadBg: 'rgba(136, 19, 55, 0.7)',
    cardBadBorder: 'rgba(244, 63, 94, 0.5)',
    bgGradientFrom: '#0a1d12',
    bgGradientVia: '#0c2012',
    bgGradientTo: '#102a18',
  },
  sounds_config: {
    catchGoodUrl: null,
    catchBadUrl: null,
    catchBonusUrl: null,
    gameStartUrl: null,
    gameOverUrl: null,
    bgmUrl: null,
    soundVolume: 0.8,
    soundEnabled: true,
    bgmEnabled: true,
  },
  layout: {
    clientLogo: { visible: true, x: 4, y: 4, width: 14 },
    scoreHud: { visible: true, x: 4, y: 14, width: 18 },
    timer: { visible: true, x: 78, y: 4, width: 18 },
    gameTitle: { visible: true, x: 38, y: 4, width: 24 },
    footerSponsor: { visible: true, x: 35, y: 92, width: 30 },
  },
};

export const PRESET_THEMES: Array<Omit<GameThemeRecord, 'id' | 'organization_id' | 'created_at' | 'updated_at'>> = [
  DEFAULT_DURIAN_THEME,
  {
    name: 'Christmas Gift Rush',
    slug: 'christmas-rush',
    description: 'Catch holiday presents in Santa sack, beware of lumps of coal!',
    status: 'active',
    is_active: false,
    branding: {
      gameTitle: 'CHRISTMAS GIFT RUSH',
      subtitle: 'Catch holiday presents, avoid lumps of coal!',
      logoUrl: null,
      clientLogoUrl: null,
    },
    background_url: 'theme_christmas_bg',
    basket_config: {
      name: "Santa's Sack",
      imageUrl: null,
      width: 140,
      height: 70,
      catchAreaRatio: 0.75,
      speed: 560,
    },
    items_config: [
      {
        id: 'gift_box',
        name: 'Christmas Present',
        imageUrl: null,
        points: 10,
        speedMultiplier: 1.0,
        spawnWeight: 75,
        enabled: true,
        isHazard: false,
        isBonus: false,
      },
      {
        id: 'coal_lump',
        name: 'Lump of Coal',
        imageUrl: null,
        points: -10,
        speedMultiplier: 1.2,
        spawnWeight: 20,
        enabled: true,
        isHazard: true,
        isBonus: false,
      },
      {
        id: 'golden_star',
        name: 'Golden Star',
        imageUrl: null,
        points: 50,
        speedMultiplier: 1.35,
        spawnWeight: 5,
        enabled: true,
        isHazard: false,
        isBonus: true,
      },
    ],
    physics_config: {
      gameDurationSeconds: 20,
      baseFallSpeed: 500,
      fallSpeedMultiplier: 0.75,
      spawnIntervalMin: 500,
      spawnIntervalMax: 950,
      difficultyStages: [
        { timeThreshold: 0, spawnInterval: 950, speedMin: 350, speedMax: 500, hazardRatio: 0.2, bonusRatio: 0.05, stageName: 'Stage 1: Snow Flurry' },
        { timeThreshold: 7, spawnInterval: 700, speedMin: 420, speedMax: 620, hazardRatio: 0.3, bonusRatio: 0.08, stageName: 'Stage 2: Blizzard Rush' },
        { timeThreshold: 14, spawnInterval: 500, speedMin: 520, speedMax: 720, hazardRatio: 0.4, bonusRatio: 0.12, stageName: 'Stage 3: North Pole Storm!' },
      ],
    },
    visuals_config: {
      particleGood: 'particle_gold',
      particleBad: 'particle_spike',
      particleBonus: 'particle_gold',
      primaryColor: '#ef4444',
      secondaryColor: '#10b981',
      accentColor: '#fbbf24',
      textColor: '#ffffff',
      cardGoodBg: 'rgba(185, 28, 28, 0.7)',
      cardGoodBorder: 'rgba(239, 68, 68, 0.5)',
      cardBadBg: 'rgba(31, 41, 55, 0.7)',
      cardBadBorder: 'rgba(75, 85, 99, 0.5)',
      bgGradientFrom: '#0f172a',
      bgGradientTo: '#064e3b',
    },
    sounds_config: { soundVolume: 0.8, soundEnabled: true, bgmEnabled: true },
  },
  {
    name: 'Lunar New Year Fortune',
    slug: 'cny-fortune',
    description: 'Catch lucky red packets and gold ingots, dodge fiery firecrackers!',
    status: 'active',
    is_active: false,
    branding: {
      gameTitle: 'LUNAR NEW YEAR FORTUNE',
      subtitle: 'Catch lucky red packets, avoid exploding firecrackers!',
      logoUrl: null,
      clientLogoUrl: null,
    },
    background_url: 'theme_chinese-new-year_bg',
    basket_config: {
      name: 'Fortune Basket',
      imageUrl: null,
      width: 140,
      height: 70,
      catchAreaRatio: 0.75,
      speed: 550,
    },
    items_config: [
      {
        id: 'red_packet',
        name: 'Red Packet (Angpow)',
        imageUrl: null,
        points: 10,
        speedMultiplier: 1.0,
        spawnWeight: 75,
        enabled: true,
        isHazard: false,
        isBonus: false,
      },
      {
        id: 'firecracker',
        name: 'Exploding Firecracker',
        imageUrl: null,
        points: -10,
        speedMultiplier: 1.25,
        spawnWeight: 20,
        enabled: true,
        isHazard: true,
        isBonus: false,
      },
      {
        id: 'gold_ingot',
        name: 'Gold Ingot (Yuanbao)',
        imageUrl: null,
        points: 50,
        speedMultiplier: 1.3,
        spawnWeight: 5,
        enabled: true,
        isHazard: false,
        isBonus: true,
      },
    ],
    physics_config: {
      gameDurationSeconds: 20,
      baseFallSpeed: 520,
      fallSpeedMultiplier: 0.7,
      spawnIntervalMin: 550,
      spawnIntervalMax: 1000,
      difficultyStages: [
        { timeThreshold: 0, spawnInterval: 1000, speedMin: 350, speedMax: 500, hazardRatio: 0.2, bonusRatio: 0.05, stageName: 'Stage 1: Spring Blessing' },
        { timeThreshold: 7, spawnInterval: 750, speedMin: 420, speedMax: 600, hazardRatio: 0.3, bonusRatio: 0.08, stageName: 'Stage 2: Dragon Dance' },
        { timeThreshold: 14, spawnInterval: 550, speedMin: 520, speedMax: 720, hazardRatio: 0.4, bonusRatio: 0.12, stageName: 'Stage 3: Fortune Cascade!' },
      ],
    },
    visuals_config: {
      particleGood: 'particle_gold',
      particleBad: 'particle_spike',
      particleBonus: 'particle_gold',
      primaryColor: '#dc2626',
      secondaryColor: '#eab308',
      accentColor: '#fde047',
      textColor: '#ffffff',
      cardGoodBg: 'rgba(153, 27, 27, 0.7)',
      cardGoodBorder: 'rgba(220, 38, 38, 0.5)',
      cardBadBg: 'rgba(69, 10, 10, 0.7)',
      cardBadBorder: 'rgba(185, 28, 28, 0.5)',
      bgGradientFrom: '#450a0a',
      bgGradientTo: '#991b1b',
    },
    sounds_config: { soundVolume: 0.8, soundEnabled: true, bgmEnabled: true },
  },
  {
    name: 'Spooky Halloween',
    slug: 'spooky-halloween',
    description: 'Catch delicious Halloween candy in a pumpkin bucket, avoid scary spiders!',
    status: 'active',
    is_active: false,
    branding: {
      gameTitle: 'SPOOKY HALLOWEEN CATCH',
      subtitle: 'Catch tasty candies, avoid venomous spiders!',
      logoUrl: null,
      clientLogoUrl: null,
    },
    background_url: 'theme_halloween_bg',
    basket_config: {
      name: 'Jack-o-Lantern Bucket',
      imageUrl: null,
      width: 140,
      height: 70,
      catchAreaRatio: 0.75,
      speed: 550,
    },
    items_config: [
      {
        id: 'spooky_candy',
        name: 'Sweet Candy',
        imageUrl: null,
        points: 10,
        speedMultiplier: 1.0,
        spawnWeight: 75,
        enabled: true,
        isHazard: false,
        isBonus: false,
      },
      {
        id: 'creepy_spider',
        name: 'Creepy Spider',
        imageUrl: null,
        points: -10,
        speedMultiplier: 1.2,
        spawnWeight: 20,
        enabled: true,
        isHazard: true,
        isBonus: false,
      },
      {
        id: 'gold_skull',
        name: 'Golden Skull',
        imageUrl: null,
        points: 50,
        speedMultiplier: 1.3,
        spawnWeight: 5,
        enabled: true,
        isHazard: false,
        isBonus: true,
      },
    ],
    physics_config: {
      gameDurationSeconds: 20,
      baseFallSpeed: 500,
      fallSpeedMultiplier: 0.7,
      spawnIntervalMin: 550,
      spawnIntervalMax: 1000,
      difficultyStages: [
        { timeThreshold: 0, spawnInterval: 1000, speedMin: 350, speedMax: 500, hazardRatio: 0.2, bonusRatio: 0.05, stageName: 'Stage 1: Twilight Woods' },
        { timeThreshold: 7, spawnInterval: 750, speedMin: 400, speedMax: 600, hazardRatio: 0.3, bonusRatio: 0.08, stageName: 'Stage 2: Witching Hour' },
        { timeThreshold: 14, spawnInterval: 550, speedMin: 500, speedMax: 700, hazardRatio: 0.4, bonusRatio: 0.12, stageName: 'Stage 3: Full Moon Fright!' },
      ],
    },
    visuals_config: {
      particleGood: 'particle_gold',
      particleBad: 'particle_spike',
      particleBonus: 'particle_gold',
      primaryColor: '#ea580c',
      secondaryColor: '#a855f7',
      accentColor: '#facc15',
      textColor: '#ffffff',
      cardGoodBg: 'rgba(124, 45, 18, 0.7)',
      cardGoodBorder: 'rgba(234, 88, 12, 0.5)',
      cardBadBg: 'rgba(76, 29, 149, 0.7)',
      cardBadBorder: 'rgba(168, 85, 247, 0.5)',
      bgGradientFrom: '#111827',
      bgGradientTo: '#4c1d95',
    },
    sounds_config: { soundVolume: 0.8, soundEnabled: true, bgmEnabled: true },
  },
  {
    name: 'Mango Orchard Harvest',
    slug: 'mango-harvest',
    description: 'Catch sweet honey mangoes in a wooden crate, dodge sour rotten ones!',
    status: 'active',
    is_active: false,
    branding: {
      gameTitle: 'MANGO ORCHARD HARVEST',
      subtitle: 'Catch sweet ripe mangoes, avoid sour green ones!',
      logoUrl: null,
      clientLogoUrl: null,
    },
    background_url: 'theme_mango_bg',
    basket_config: {
      name: 'Fruit Crate',
      imageUrl: null,
      width: 140,
      height: 70,
      catchAreaRatio: 0.75,
      speed: 550,
    },
    items_config: [
      {
        id: 'ripe_mango',
        name: 'Ripe Honey Mango',
        imageUrl: null,
        points: 10,
        speedMultiplier: 1.0,
        spawnWeight: 75,
        enabled: true,
        isHazard: false,
        isBonus: false,
      },
      {
        id: 'sour_mango',
        name: 'Sour Rotten Mango',
        imageUrl: null,
        points: -10,
        speedMultiplier: 1.15,
        spawnWeight: 20,
        enabled: true,
        isHazard: true,
        isBonus: false,
      },
      {
        id: 'golden_mango',
        name: 'Golden Alphonso Mango',
        imageUrl: null,
        points: 50,
        speedMultiplier: 1.3,
        spawnWeight: 5,
        enabled: true,
        isHazard: false,
        isBonus: true,
      },
    ],
    physics_config: {
      gameDurationSeconds: 20,
      baseFallSpeed: 500,
      fallSpeedMultiplier: 0.7,
      spawnIntervalMin: 550,
      spawnIntervalMax: 1000,
      difficultyStages: [
        { timeThreshold: 0, spawnInterval: 1000, speedMin: 350, speedMax: 500, hazardRatio: 0.2, bonusRatio: 0.05, stageName: 'Stage 1: Morning Grove' },
        { timeThreshold: 7, spawnInterval: 750, speedMin: 400, speedMax: 600, hazardRatio: 0.3, bonusRatio: 0.08, stageName: 'Stage 2: Sunny Breeze' },
        { timeThreshold: 14, spawnInterval: 550, speedMin: 500, speedMax: 700, hazardRatio: 0.4, bonusRatio: 0.12, stageName: 'Stage 3: Golden Harvest!' },
      ],
    },
    visuals_config: {
      particleGood: 'particle_leaf',
      particleBad: 'particle_spike',
      particleBonus: 'particle_gold',
      primaryColor: '#eab308',
      secondaryColor: '#f97316',
      accentColor: '#84cc16',
      textColor: '#ffffff',
      cardGoodBg: 'rgba(161, 98, 7, 0.7)',
      cardGoodBorder: 'rgba(234, 179, 8, 0.5)',
      cardBadBg: 'rgba(77, 124, 15, 0.7)',
      cardBadBorder: 'rgba(132, 204, 22, 0.5)',
      bgGradientFrom: '#0284c7',
      bgGradientTo: '#15803d',
    },
    sounds_config: { soundVolume: 0.8, soundEnabled: true, bgmEnabled: true },
  },
];

// ============================================================================
// THEME DATABASE OPERATIONS
// ============================================================================

export async function getThemesByOrgId(
  organizationId: string,
  gameId?: string,
  env?: Record<string, any>
): Promise<GameThemeRecord[]> {
  const supabase = getSupabaseServerClient(env);
  let query = supabase
    .from('game_themes')
    .select('*, games(id, name, slug, game_type)')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: true });

  if (gameId) {
    query = query.eq('game_id', gameId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error in getThemesByOrgId:', error);
    throw new Error(`Failed to list themes: ${error.message}`);
  }

  const list = (data || []) as any[];
  return list.map((item) => ({
    ...item,
    game_id: item.game_id || item.games?.id || null,
    game_name: item.games?.name || 'Durian Catcher',
    game_slug: item.games?.slug || 'durian-catcher',
  })) as GameThemeRecord[];
}

export async function getThemeById(themeId: string, env?: Record<string, any>): Promise<GameThemeRecord | null> {
  const supabase = getSupabaseServerClient(env);
  const { data, error } = await supabase
    .from('game_themes')
    .select('*, games(id, name, slug, game_type)')
    .eq('id', themeId)
    .maybeSingle();

  if (error) {
    console.error('Error in getThemeById:', error);
    throw new Error(`Failed to get theme: ${error.message}`);
  }

  if (!data) return null;

  const item = data as any;
  return {
    ...item,
    game_id: item.game_id || item.games?.id || null,
    game_name: item.games?.name || 'Durian Catcher',
    game_slug: item.games?.slug || 'durian-catcher',
  } as GameThemeRecord;
}

export async function getActiveThemeForOrg(
  organizationId: string,
  gameId?: string,
  env?: Record<string, any>
): Promise<GameThemeRecord | null> {
  const supabase = getSupabaseServerClient(env);
  let query = supabase
    .from('game_themes')
    .select('*, games(id, name, slug, game_type)')
    .eq('organization_id', organizationId)
    .eq('is_active', true);

  if (gameId) {
    query = query.eq('game_id', gameId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    console.error('Error in getActiveThemeForOrg:', error);
    throw new Error(`Failed to get active theme: ${error.message}`);
  }

  if (!data) return null;
  const item = data as any;
  return {
    ...item,
    game_id: item.game_id || item.games?.id || null,
    game_name: item.games?.name || 'Durian Catcher',
    game_slug: item.games?.slug || 'durian-catcher',
  } as GameThemeRecord;
}

export async function createTheme(
  params: {
    organization_id: string;
    game_id?: string | null;
    name: string;
    slug?: string;
    description?: string | null;
    status?: 'active' | 'archived' | 'draft';
    is_active?: boolean;
    branding?: ThemeBrandingConfig;
    background_url?: string | null;
    basket_config?: ThemeBasketConfig;
    items_config?: ThemeDropItem[];
    physics_config?: ThemePhysicsConfig;
    visuals_config?: ThemeVisualsConfig;
    sounds_config?: ThemeSoundsConfig;
    layout?: any;
  },
  env?: Record<string, any>
): Promise<GameThemeRecord> {
  const supabase = getSupabaseServerClient(env);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const slug = params.slug || params.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  let resolvedGameId = params.game_id;
  if (!resolvedGameId) {
    const { data: games } = await supabase
      .from('games')
      .select('id')
      .eq('organization_id', params.organization_id)
      .limit(1);
    if (games && games.length > 0) {
      resolvedGameId = games[0].id;
    }
  }

  // If this new theme is marked active, deactivate others in this game and org
  if (params.is_active && resolvedGameId) {
    await supabase
      .from('game_themes')
      .update({ is_active: false, updated_at: now })
      .eq('organization_id', params.organization_id)
      .eq('game_id', resolvedGameId);
  }

  const { data, error } = await supabase
    .from('game_themes')
    .insert({
      id,
      organization_id: params.organization_id,
      game_id: resolvedGameId || null,
      name: params.name,
      slug,
      description: params.description ?? null,
      status: params.status || 'active',
      is_active: params.is_active ?? false,
      branding: params.branding ?? DEFAULT_DURIAN_THEME.branding,
      background_url: params.background_url ?? DEFAULT_DURIAN_THEME.background_url,
      basket_config: params.basket_config ?? DEFAULT_DURIAN_THEME.basket_config,
      items_config: params.items_config ?? DEFAULT_DURIAN_THEME.items_config,
      physics_config: params.physics_config ?? DEFAULT_DURIAN_THEME.physics_config,
      visuals_config: params.visuals_config ?? DEFAULT_DURIAN_THEME.visuals_config,
      sounds_config: params.sounds_config ?? DEFAULT_DURIAN_THEME.sounds_config,
      layout: params.layout ?? DEFAULT_DURIAN_THEME.layout,
      created_at: now,
      updated_at: now,
    })
    .select('*, games(id, name, slug, game_type)')
    .single();

  if (error) {
    console.error('Error in createTheme:', error);
    throw new Error(`Failed to create theme: ${error.message}`);
  }

  const item = data as any;
  return {
    ...item,
    game_id: item.game_id || item.games?.id || null,
    game_name: item.games?.name || 'Durian Catcher',
    game_slug: item.games?.slug || 'durian-catcher',
  } as GameThemeRecord;
}

export async function updateTheme(
  themeId: string,
  updates: Partial<Omit<GameThemeRecord, 'id' | 'organization_id' | 'created_at'>>,
  env?: Record<string, any>
): Promise<GameThemeRecord> {
  const supabase = getSupabaseServerClient(env);
  const now = new Date().toISOString();

  // If is_active is set to true, deactivate other themes in the same game & organization
  if (updates.is_active) {
    const existing = await getThemeById(themeId, env);
    if (existing) {
      let deactivateQuery = supabase
        .from('game_themes')
        .update({ is_active: false, updated_at: now })
        .eq('organization_id', existing.organization_id);

      if (existing.game_id) {
        deactivateQuery = deactivateQuery.eq('game_id', existing.game_id);
      }
      await deactivateQuery;
    }
  }

  const payload: any = {
    ...updates,
    updated_at: now,
  };

  const { data, error } = await supabase
    .from('game_themes')
    .update(payload)
    .eq('id', themeId)
    .select('*, games(id, name, slug, game_type)')
    .single();

  if (error) {
    console.error('Error in updateTheme:', error);
    throw new Error(`Failed to update theme: ${error.message}`);
  }

  const item = data as any;
  return {
    ...item,
    game_id: item.game_id || item.games?.id || null,
    game_name: item.games?.name || 'Durian Catcher',
    game_slug: item.games?.slug || 'durian-catcher',
  } as GameThemeRecord;
}

export async function activateTheme(
  organizationId: string,
  themeId: string,
  env?: Record<string, any>
): Promise<GameThemeRecord> {
  const supabase = getSupabaseServerClient(env);
  const now = new Date().toISOString();

  const theme = await getThemeById(themeId, env);
  if (!theme) {
    throw new Error('Theme not found to activate');
  }

  const targetGameId = theme.game_id;

  // 1. Deactivate themes for this specific game (or org)
  let deactivateQuery = supabase
    .from('game_themes')
    .update({ is_active: false, updated_at: now })
    .eq('organization_id', organizationId);

  if (targetGameId) {
    deactivateQuery = deactivateQuery.eq('game_id', targetGameId);
  }
  await deactivateQuery;

  // 2. Activate target theme
  const { data, error } = await supabase
    .from('game_themes')
    .update({ is_active: true, updated_at: now })
    .eq('id', themeId)
    .eq('organization_id', organizationId)
    .select('*, games(id, name, slug, game_type)')
    .single();

  if (error) {
    console.error('Error in activateTheme:', error);
    throw new Error(`Failed to activate theme: ${error.message}`);
  }

  // 3. Update active_theme_id on the specific game
  if (targetGameId) {
    await supabase
      .from('games')
      .update({ active_theme_id: themeId, updated_at: now })
      .eq('id', targetGameId);
  }

  const item = data as any;
  return {
    ...item,
    game_id: item.game_id || item.games?.id || null,
    game_name: item.games?.name || 'Durian Catcher',
    game_slug: item.games?.slug || 'durian-catcher',
  } as GameThemeRecord;
}

export async function duplicateTheme(
  themeId: string,
  newName?: string,
  env?: Record<string, any>
): Promise<GameThemeRecord> {
  const existing = await getThemeById(themeId, env);
  if (!existing) {
    throw new Error('Theme not found to duplicate');
  }

  const name = newName || `${existing.name} (Copy)`;
  const slug = `${existing.slug}-copy-${Date.now().toString().slice(-4)}`;

  return await createTheme(
    {
      organization_id: existing.organization_id,
      game_id: existing.game_id,
      name,
      slug,
      description: existing.description,
      status: 'draft',
      is_active: false,
      branding: existing.branding,
      background_url: existing.background_url,
      basket_config: existing.basket_config,
      items_config: existing.items_config,
      physics_config: existing.physics_config,
      visuals_config: existing.visuals_config,
      sounds_config: existing.sounds_config,
      layout: existing.layout,
    },
    env
  );
}

export async function deleteTheme(themeId: string, env?: Record<string, any>): Promise<void> {
  const supabase = getSupabaseServerClient(env);
  const theme = await getThemeById(themeId, env);
  if (!theme) return;

  // Prevent deleting if it's the only active theme
  if (theme.is_active) {
    const all = await getThemesByOrgId(theme.organization_id, theme.game_id || undefined, env);
    if (all.length > 1) {
      const nextTheme = all.find((t) => t.id !== themeId);
      if (nextTheme) {
        await activateTheme(theme.organization_id, nextTheme.id, env);
      }
    }
  }

  const { error } = await supabase
    .from('game_themes')
    .delete()
    .eq('id', themeId);

  if (error) {
    console.error('Error in deleteTheme:', error);
    throw new Error(`Failed to delete theme: ${error.message}`);
  }
}

/**
 * Ensures that the organization has games and default themes available.
 */
export async function ensureDefaultThemes(
  organizationId: string,
  orgName: string,
  env?: Record<string, any>
): Promise<GameThemeRecord[]> {
  const supabase = getSupabaseServerClient(env);

  // 1. Ensure games exist in this organization
  const { ensureDefaultGames } = await import('./games.js');
  const games = await ensureDefaultGames(organizationId, orgName, env);
  const mainGame = games[0];
  const memoryGame = games.find((g) => g.game_type === 'memory-match') || games[1];
  const reflexGame = games.find((g) => g.game_type === 'reaction-tap') || games[2];

  const existing = await getThemesByOrgId(organizationId, undefined, env);
  if (existing.length > 0) {
    // Backfill game_id if any existing theme lacks it
    for (const t of existing) {
      if (!t.game_id && mainGame) {
        await supabase
          .from('game_themes')
          .update({ game_id: mainGame.id })
          .eq('id', t.id);
        t.game_id = mainGame.id;
      }
    }
    return await getThemesByOrgId(organizationId, undefined, env);
  }

  const created: GameThemeRecord[] = [];

  for (let i = 0; i < PRESET_THEMES.length; i++) {
    const preset = PRESET_THEMES[i];
    const isFirst = i === 0;
    let targetGameId = mainGame?.id;
    if (preset.slug.includes('memory') && memoryGame) {
      targetGameId = memoryGame.id;
    } else if (preset.slug.includes('reflex') && reflexGame) {
      targetGameId = reflexGame.id;
    }

    const theme = await createTheme(
      {
        organization_id: organizationId,
        game_id: targetGameId,
        name: isFirst ? `${orgName} Corporate Durian` : preset.name,
        slug: preset.slug,
        description: preset.description,
        status: preset.status,
        is_active: isFirst,
        branding: preset.branding,
        background_url: preset.background_url,
        basket_config: preset.basket_config,
        items_config: preset.items_config,
        physics_config: preset.physics_config,
        visuals_config: preset.visuals_config,
        sounds_config: preset.sounds_config,
        layout: (preset as any).layout ?? DEFAULT_DURIAN_THEME.layout,
      },
      env
    );
    created.push(theme);
  }

  return created;
}
