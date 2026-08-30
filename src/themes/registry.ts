import { GameTheme, ThemeDropItem } from './types';
import { normalizeGameLayout } from './layout';
import { carnivalTheme } from './carnival';
import { christmasTheme } from './christmas';
import { cnyTheme } from './cny';
import { halloweenTheme } from './halloween';
import { mangoTheme } from './mango';
import { memoryMatchTheme } from './memory-match';

/**
 * Default active theme ID.
 */
export const DEFAULT_ACTIVE_THEME_ID = 'carnival';

export const THEME_REGISTRY: Record<string, GameTheme> = {
  carnival: carnivalTheme,
  christmas: christmasTheme,
  'chinese-new-year': cnyTheme,
  halloween: halloweenTheme,
  mango: mangoTheme,
  'memory-carnival': memoryMatchTheme,
  'memory-match': memoryMatchTheme,
  // Alias durian to carnival for seamless backwards-compatibility
  durian: carnivalTheme,
};

let currentActiveTheme: GameTheme = carnivalTheme;

export function resolveThemeBaseId(raw: any): string {
  if (!raw) return 'carnival';
  if (raw.base_theme_id) return raw.base_theme_id === 'durian' ? 'carnival' : raw.base_theme_id;
  if (raw.baseThemeId) return raw.baseThemeId === 'durian' ? 'carnival' : raw.baseThemeId;

  const id = (raw.id || '').toLowerCase();
  const slug = (raw.slug || '').toLowerCase();
  const name = (raw.name || '').toLowerCase();
  const gameSlug = (raw.game_slug || (raw.games?.slug) || '').toLowerCase();
  const gameType = (raw.game_type || raw.game_id || '').toLowerCase();

  if (
    id === 'memory-carnival' ||
    id === 'memory-match' ||
    slug.includes('memory') ||
    name.includes('memory') ||
    gameSlug === 'memory-match' ||
    gameType === 'memory-match'
  ) {
    return 'memory-match';
  }
  if (id === 'carnival' || slug.includes('carnival') || name.includes('carnival')) {
    return 'carnival';
  }
  if (id === 'christmas' || slug.includes('christmas') || name.includes('christmas')) {
    return 'christmas';
  }
  if (
    id === 'chinese-new-year' ||
    slug.includes('cny') ||
    slug.includes('chinese-new-year') ||
    name.includes('lunar') ||
    name.includes('chinese')
  ) {
    return 'chinese-new-year';
  }
  if (
    id === 'halloween' ||
    slug.includes('halloween') ||
    name.includes('halloween') ||
    name.includes('spooky')
  ) {
    return 'halloween';
  }
  if (id === 'mango' || slug.includes('mango') || name.includes('mango')) {
    return 'mango';
  }

  // Check if raw.id is in registry
  if (raw.id && THEME_REGISTRY[raw.id]?.base_theme_id) {
    const matched = THEME_REGISTRY[raw.id].base_theme_id!;
    return matched === 'durian' ? 'carnival' : matched;
  }

  return 'carnival';
}

/**
 * Resolves theme-specific default artwork for a drop item if imageUrl is empty/null.
 */
export function resolveThemeDefaultItemImage(
  theme: Partial<GameTheme> | any,
  item: Partial<ThemeDropItem> | any
): string {
  const baseId = resolveThemeBaseId(theme);

  if (baseId === 'memory-match' || baseId === 'memory-carnival') {
    return '';
  }

  const isHazard = item.isHazard || (item.points !== undefined && item.points < 0);
  const isBonus = item.isBonus || (item.points !== undefined && item.points >= 50);

  if (baseId === 'christmas') {
    if (isHazard) return '/assets/coal.png';
    if (isBonus) return '/assets/golden_star.png';
    return '/assets/christmas_gift.png';
  }
  if (baseId === 'chinese-new-year') {
    if (isHazard) return '/assets/firecracker.png';
    if (isBonus) return '/assets/gold_ingot.png';
    return '/assets/angpow.png';
  }
  if (baseId === 'halloween') {
    if (isHazard) return '/assets/poison_spider.png';
    if (isBonus) return '/assets/golden_skull.png';
    return '/assets/spooky_candy.png';
  }
  if (baseId === 'mango') {
    if (isHazard) return '/assets/sour_mango.png';
    if (isBonus) return '/assets/honey_mango.png';
    return '/assets/ripe_mango.png';
  }
  // Default Carnival theme assets
  if (isHazard) return '/assets/themes/carnival/item_hazard_01.png';
  if (isBonus) return '/assets/themes/carnival/item_bonus_01.png';
  return '/assets/themes/carnival/item_normal_01.png';
}

/**
 * Resolves theme-specific default basket image
 */
export function resolveThemeDefaultBasketImage(theme: Partial<GameTheme> | any): string {
  const baseId = resolveThemeBaseId(theme);
  if (baseId === 'memory-match' || baseId === 'memory-carnival') return '';
  if (baseId === 'christmas') return '/assets/santa_sack.png';
  if (baseId === 'chinese-new-year') return '/assets/fortune_basket.png';
  if (baseId === 'halloween') return '/assets/pumpkin_bucket.png';
  if (baseId === 'mango') return '/assets/fruit_crate.png';
  return '/assets/themes/carnival/basket.png';
}

/**
 * Resolves theme-specific default background image
 */
export function resolveThemeDefaultBgImage(theme: Partial<GameTheme> | any): string {
  const baseId = resolveThemeBaseId(theme);
  if (baseId === 'memory-match' || baseId === 'memory-carnival') return '';
  if (baseId === 'christmas') return '/assets/christmas_bg.png';
  if (baseId === 'chinese-new-year') return '/assets/cny_bg.png';
  if (baseId === 'halloween') return '/assets/halloween_bg.png';
  if (baseId === 'mango') return '/assets/mango_bg.png';
  return '/assets/themes/carnival/background.png';
}

/**
 * Normalizes a theme object (whether from DB or preset) into a fully populated GameTheme
 */
export function normalizeGameTheme(raw: any): GameTheme {
  if (!raw) return carnivalTheme;

  const base_theme_id = resolveThemeBaseId(raw);
  const resolvedGameType =
    raw.game_type ||
    raw.game_slug ||
    raw.games?.slug ||
    raw.games?.game_type ||
    (base_theme_id === 'memory-match' || base_theme_id === 'memory-carnival' || (raw.slug || '').includes('memory') || (raw.name || '').toLowerCase().includes('memory') ? 'memory-match' : 'catch-brand');

  const isMemory = resolvedGameType === 'memory-match' || base_theme_id === 'memory-match' || base_theme_id === 'memory-carnival';
  const basePreset = isMemory ? memoryMatchTheme : (THEME_REGISTRY[base_theme_id] || carnivalTheme);

  const id = raw.id || raw.slug || 'theme-' + Date.now();
  const name = String(raw.name || raw.branding?.gameTitle || basePreset?.name || (isMemory ? 'Brand Memory Match' : 'Custom Theme'));
  const slug = raw.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const description = raw.description ?? basePreset.description;
  const status = raw.status || 'active';

  const branding = {
    gameTitle: raw.branding?.gameTitle || raw.gameTitle || (isMemory ? 'BRAND MEMORY MATCH' : name.toUpperCase()),
    subtitle: raw.branding?.subtitle || raw.subtitle || basePreset.branding?.subtitle || (isMemory ? 'Flip cards, match 8 pairs, and beat the clock!' : 'Catch falling items, avoid hazards!'),
    logoUrl: raw.branding?.logoUrl ?? raw.logo ?? null,
    clientLogoUrl: raw.branding?.clientLogoUrl ?? raw.clientLogo ?? null,
  };

  const background_url = isMemory
    ? (raw.background_url || raw.background || null)
    : (raw.background_url || raw.background || basePreset.background_url || resolveThemeDefaultBgImage({ base_theme_id }));

  let rawGameConfig = raw.game_config;
  if (typeof rawGameConfig === 'string') {
    try {
      rawGameConfig = JSON.parse(rawGameConfig);
    } catch {
      rawGameConfig = undefined;
    }
  }

  let game_config: Record<string, any> | undefined = undefined;
  if (rawGameConfig && typeof rawGameConfig === 'object') {
    game_config = {
      ...(basePreset.game_config || {}),
      ...rawGameConfig,
    };
    if (Array.isArray(rawGameConfig.pairs)) {
      game_config.pairs = rawGameConfig.pairs;
    }
    if (rawGameConfig.cardBackUrl !== undefined) {
      game_config.cardBackUrl = rawGameConfig.cardBackUrl;
    }
    if (rawGameConfig.board !== undefined) {
      game_config.board = rawGameConfig.board;
    } else if (rawGameConfig.grid && basePreset.game_config?.board) {
      game_config.board = {
        ...basePreset.game_config.board,
        rows: rawGameConfig.grid.rows ?? basePreset.game_config.board.rows,
        cols: rawGameConfig.grid.cols ?? basePreset.game_config.board.cols,
      };
    }
    if (rawGameConfig.grid !== undefined) {
      game_config.grid = rawGameConfig.grid;
    }
    if (rawGameConfig.gameplay !== undefined) {
      game_config.gameplay = rawGameConfig.gameplay;
    }
    if (rawGameConfig.ui !== undefined) {
      game_config.ui = rawGameConfig.ui;
    }
    if (rawGameConfig.card !== undefined) {
      game_config.card = rawGameConfig.card;
    }
    if (rawGameConfig.screens !== undefined) {
      game_config.screens = rawGameConfig.screens;
    }
  } else if (basePreset.game_config) {
    game_config = { ...basePreset.game_config };
  }

  const cardBackUrl =
    game_config?.cardBackUrl !== undefined
      ? game_config.cardBackUrl
      : (raw.visuals_config?.cardBackUrl ?? basePreset.visuals_config?.cardBackUrl ?? null);

  if (game_config && game_config.cardBackUrl === undefined && cardBackUrl !== undefined) {
    game_config.cardBackUrl = cardBackUrl;
  }

  const basket_config = isMemory
    ? null
    : {
        name: raw.basket_config?.name || raw.catcherName || basePreset.basket_config?.name || 'Catcher Basket',
        imageUrl: raw.basket_config?.imageUrl ?? raw.catcher ?? basePreset.basket_config?.imageUrl ?? '/assets/basket.png',
        width: raw.basket_config?.width || basePreset.basket_config?.width || 140,
        height: raw.basket_config?.height || basePreset.basket_config?.height || 70,
        catchAreaRatio: raw.basket_config?.catchAreaRatio || basePreset.basket_config?.catchAreaRatio || 0.72,
        speed: raw.basket_config?.speed || basePreset.basket_config?.speed || 550,
        collisionWidthRatio: raw.basket_config?.collisionWidthRatio || basePreset.basket_config?.collisionWidthRatio || 0.7235,
        collisionHeightRatio: raw.basket_config?.collisionHeightRatio || basePreset.basket_config?.collisionHeightRatio || 0.13,
        collisionOffsetYRatio: raw.basket_config?.collisionOffsetYRatio || basePreset.basket_config?.collisionOffsetYRatio || 0.3394,
      };

  let rawItems = (isMemory && Array.isArray(game_config?.pairs) && game_config.pairs.length > 0)
    ? game_config.pairs
    : (Array.isArray(raw.items_config) && raw.items_config.length > 0
        ? raw.items_config
        : basePreset.items_config);

  const items_config: ThemeDropItem[] = isMemory
    ? rawItems.map((item: any, index: number) => ({
        id: item.id || `pair_${index}`,
        name: item.name || `Pair ${index + 1}`,
        imageUrl: item.imageUrl || null,
        points: item.points !== undefined ? Number(item.points) : 100,
        speedMultiplier: 1.0,
        spawnWeight: 1,
        enabled: item.enabled !== false,
        isHazard: false,
        isBonus: false,
      }))
    : rawItems.map((item: any, index: number) => {
        const points = item.points !== undefined ? Number(item.points) : (index === 0 ? 10 : index === 1 ? -10 : 50);
        const isHazard = item.isHazard !== undefined ? !!item.isHazard : points < 0;
        const isBonus = item.isBonus !== undefined ? !!item.isBonus : points >= 50;

        return {
          id: item.id || `item_${index}`,
          name: item.name || (isHazard ? 'Hazard Item' : isBonus ? 'Bonus Item' : 'Good Item'),
          imageUrl: item.imageUrl || null,
          points,
          speedMultiplier: item.speedMultiplier !== undefined ? Number(item.speedMultiplier) : 1.0,
          spawnWeight: item.spawnWeight !== undefined ? Number(item.spawnWeight) : 10,
          enabled: item.enabled !== false,
          isHazard,
          isBonus,
          collisionRadiusRatio: item.collisionRadiusRatio,
          collisionCenterXRatio: item.collisionCenterXRatio,
          collisionCenterYRatio: item.collisionCenterYRatio,
        };
      });

  if (isMemory && game_config && (!Array.isArray(game_config.pairs) || game_config.pairs.length === 0)) {
    game_config.pairs = items_config.map((item) => ({
      id: item.id,
      name: item.name,
      imageUrl: item.imageUrl,
      points: item.points,
    }));
  }

  const physics_config = {
    gameDurationSeconds: raw.physics_config?.gameDurationSeconds || basePreset.physics_config.gameDurationSeconds || 20,
    baseFallSpeed: raw.physics_config?.baseFallSpeed || basePreset.physics_config.baseFallSpeed || 500,
    fallSpeedMultiplier: raw.physics_config?.fallSpeedMultiplier || basePreset.physics_config.fallSpeedMultiplier || 0.7,
    spawnIntervalMin: raw.physics_config?.spawnIntervalMin || basePreset.physics_config.spawnIntervalMin || 550,
    spawnIntervalMax: raw.physics_config?.spawnIntervalMax || basePreset.physics_config.spawnIntervalMax || 1000,
    difficultyStages: Array.isArray(raw.physics_config?.difficultyStages) && raw.physics_config.difficultyStages.length > 0
      ? raw.physics_config.difficultyStages
      : basePreset.physics_config.difficultyStages,
  };

  const visuals_config = {
    particleGood: raw.visuals_config?.particleGood || raw.particles?.good || basePreset.visuals_config.particleGood,
    particleBad: raw.visuals_config?.particleBad || raw.particles?.bad || basePreset.visuals_config.particleBad,
    particleBonus: raw.visuals_config?.particleBonus || raw.particles?.bonus || basePreset.visuals_config.particleBonus,
    primaryColor: raw.visuals_config?.primaryColor || raw.colors?.primary || basePreset.visuals_config.primaryColor,
    secondaryColor: raw.visuals_config?.secondaryColor || raw.colors?.secondary || basePreset.visuals_config.secondaryColor,
    accentColor: raw.visuals_config?.accentColor || raw.colors?.accent || basePreset.visuals_config.accentColor,
    textColor: raw.visuals_config?.textColor || raw.colors?.text || '#ffffff',
    cardBackUrl,
    cardFrontBg: raw.visuals_config?.cardFrontBg || raw.colors?.cardFrontBg || basePreset.visuals_config.cardFrontBg || '#0F172A',
    cardFrontBgOpacity: raw.visuals_config?.cardFrontBgOpacity ?? raw.colors?.cardFrontBgOpacity ?? basePreset.visuals_config.cardFrontBgOpacity ?? 0.95,
    cardGoodBg: raw.visuals_config?.cardGoodBg || raw.colors?.cardGoodBg || basePreset.visuals_config.cardGoodBg,
    cardGoodBorder: raw.visuals_config?.cardGoodBorder || raw.colors?.cardGoodBorder || basePreset.visuals_config.cardGoodBorder,
    cardBadBg: raw.visuals_config?.cardBadBg || raw.colors?.cardBadBg || basePreset.visuals_config.cardBadBg,
    cardBadBorder: raw.visuals_config?.cardBadBorder || raw.colors?.cardBadBorder || basePreset.visuals_config.cardBadBorder,
    bgGradientFrom: raw.visuals_config?.bgGradientFrom || basePreset.visuals_config.bgGradientFrom,
    bgGradientVia: raw.visuals_config?.bgGradientVia || basePreset.visuals_config.bgGradientVia,
    bgGradientTo: raw.visuals_config?.bgGradientTo || basePreset.visuals_config.bgGradientTo,
  };

  const sounds_config = {
    catchGoodUrl: raw.sounds_config?.catchGoodUrl ?? raw.sounds?.catchGood ?? null,
    catchBadUrl: raw.sounds_config?.catchBadUrl ?? raw.sounds?.catchBad ?? null,
    catchBonusUrl: raw.sounds_config?.catchBonusUrl ?? raw.sounds?.catchBonus ?? null,
    gameStartUrl: raw.sounds_config?.gameStartUrl ?? raw.sounds?.gameStart ?? null,
    gameOverUrl: raw.sounds_config?.gameOverUrl ?? raw.sounds?.gameOver ?? null,
    bgmUrl: raw.sounds_config?.bgmUrl ?? null,
    soundVolume: raw.sounds_config?.soundVolume ?? 0.8,
    soundEnabled: raw.sounds_config?.soundEnabled ?? true,
    bgmEnabled: raw.sounds_config?.bgmEnabled ?? true,
  };

  // Populate backward-compat props using theme defaults if custom image is not set
  const firstGood = items_config.find((i: ThemeDropItem) => !i.isHazard && !i.isBonus) || items_config[0];
  const firstBad = items_config.find((i: ThemeDropItem) => i.isHazard);
  const firstBonus = items_config.find((i: ThemeDropItem) => i.isBonus);

  const goodEffectiveImg = (firstGood && firstGood.imageUrl)
    ? firstGood.imageUrl
    : resolveThemeDefaultItemImage({ base_theme_id }, { isHazard: false, isBonus: false });

  const badEffectiveImg = (firstBad && firstBad.imageUrl)
    ? firstBad.imageUrl
    : resolveThemeDefaultItemImage({ base_theme_id }, { isHazard: true, isBonus: false });

  const bonusEffectiveImg = (firstBonus && firstBonus.imageUrl)
    ? firstBonus.imageUrl
    : resolveThemeDefaultItemImage({ base_theme_id }, { isHazard: false, isBonus: true });

  const catcherEffectiveImg = basket_config?.imageUrl || (isMemory ? '' : resolveThemeDefaultBasketImage({ base_theme_id }));

  return {
    id,
    organization_id: raw.organization_id,
    game_id: raw.game_id || raw.games?.id || (resolvedGameType === 'memory-match' ? 'memory-match' : null),
    game_name: raw.game_name || raw.games?.name || (resolvedGameType === 'memory-match' ? 'Brand Memory Match' : 'Catch the Brand'),
    game_slug: raw.game_slug || raw.games?.slug || resolvedGameType,
    game_type: resolvedGameType,
    is_system: Boolean(raw.is_system),
    ownership_type: raw.ownership_type || (raw.is_system ? 'system' : 'organization'),
    name,
    slug,
    base_theme_id,
    description,
    status,
    is_default: Boolean(raw.is_default),
    branding,
    background_url,
    basket_config,
    items_config,
    physics_config,
    visuals_config,
    sounds_config,
    layout: normalizeGameLayout(raw.layout ?? raw.layout_config ?? basePreset.layout),
    game_config,

    // Backward-compat props resolved with theme defaults
    gameTitle: branding.gameTitle,
    subtitle: branding.subtitle,
    background: background_url,
    catcher: catcherEffectiveImg || undefined,
    catcherName: basket_config?.name || undefined,
    fallingObject: goodEffectiveImg,
    fallingObjectName: firstGood?.name || 'Good Item',
    badFallingObject: badEffectiveImg,
    badFallingObjectName: firstBad?.name || 'Hazard Item',
    bonusFallingObject: bonusEffectiveImg,
    bonusFallingObjectName: firstBonus?.name || 'Bonus Item',
    logo: branding.logoUrl || undefined,
    clientLogo: branding.clientLogoUrl || undefined,
    colors: visuals_config,
    sounds: sounds_config,
    particles: {
      good: visuals_config.particleGood,
      bad: visuals_config.particleBad,
      bonus: visuals_config.particleBonus,
    },
  };
}

/**
 * Registers multiple themes into the registry (e.g. fetched from Supabase)
 */
export function registerThemes(themes: any[]): void {
  for (const t of themes) {
    const normalized = normalizeGameTheme(t);
    THEME_REGISTRY[normalized.id] = normalized;
    if (normalized.slug) {
      THEME_REGISTRY[normalized.slug] = normalized;
    }
  }
  if (!currentActiveTheme && themes.length > 0) {
    currentActiveTheme = normalizeGameTheme(themes[0]);
  }
}

/**
 * Get current active theme with fallback protection
 */
export function getActiveTheme(): GameTheme {
  return currentActiveTheme;
}

/**
 * Retrieve a theme by ID or slug with safe fallback to carnivalTheme
 */
export function getThemeById(id: string): GameTheme {
  const theme = THEME_REGISTRY[id];
  if (theme) {
    return theme;
  }
  return currentActiveTheme || carnivalTheme;
}

/**
 * Set active theme globally
 */
export function setActiveTheme(theme: GameTheme): GameTheme {
  const normalized = normalizeGameTheme(theme);
  currentActiveTheme = normalized;
  THEME_REGISTRY[normalized.id] = normalized;
  if (normalized.slug) {
    THEME_REGISTRY[normalized.slug] = normalized;
  }
  try {
    localStorage.setItem('active_game_theme_id', normalized.id);
  } catch {
    // Ignore storage issues
  }
  return currentActiveTheme;
}

/**
 * Set active theme ID globally
 */
export function setActiveThemeId(id: string): GameTheme {
  const theme = THEME_REGISTRY[id];
  if (theme) {
    return setActiveTheme(theme);
  }
  return getActiveTheme();
}

/**
 * Initialize active theme from localStorage or default
 */
export function initActiveTheme(): GameTheme {
  try {
    const saved = localStorage.getItem('active_game_theme_id');
    if (saved && THEME_REGISTRY[saved]) {
      currentActiveTheme = THEME_REGISTRY[saved];
    }
  } catch {
    // Ignore
  }
  return currentActiveTheme;
}

/**
 * Register a custom theme dynamically
 */
export function registerCustomTheme(theme: GameTheme): GameTheme {
  return setActiveTheme(theme);
}
