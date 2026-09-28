import { GameTheme, ThemeDropItem } from './types';
import { normalizeGameLayout } from './layout';
import { defaultCatchBrandTheme } from './defaultCatchBrand';
import { carnivalTheme } from './carnival';
import { christmasTheme } from './christmas';
import { cnyTheme } from './cny';
import { halloweenTheme } from './halloween';
import { mangoTheme } from './mango';
import { memoryMatchTheme } from './memory-match';
import { reactionTheme } from './reaction-time';
import {
  resolveThemeDefaultBgImage,
  resolveThemeDefaultBasketImage,
  resolveThemeDefaultItemImage,
} from './gameAssetResolver';

/**
 * Default active theme ID.
 */
export const DEFAULT_ACTIVE_THEME_ID = 'default';

export const THEME_REGISTRY: Record<string, GameTheme> = {
  default: defaultCatchBrandTheme,
  'catch-brand': defaultCatchBrandTheme,
  carnival: carnivalTheme,
  christmas: christmasTheme,
  'chinese-new-year': cnyTheme,
  cny: cnyTheme,
  halloween: halloweenTheme,
  mango: mangoTheme,
  'memory-carnival': memoryMatchTheme,
  'memory-match': memoryMatchTheme,
  'reaction-tap': reactionTheme,
  'reaction-time': reactionTheme,
  // Alias durian to default for seamless backwards-compatibility
  durian: defaultCatchBrandTheme,
};

let currentActiveTheme: GameTheme = defaultCatchBrandTheme;

/**
 * Resolves the authoritative default theme for a given game type or slug.
 * Used for "Start from scratch" theme creation and clean baselines.
 * Catch The Brand -> defaultCatchBrandTheme
 * Memory Match -> memoryMatchTheme
 * Reaction Time / Tap -> reactionTheme
 */
export function getDefaultThemeForGameType(gameType?: string | null): GameTheme {
  const clean = (gameType || '').toLowerCase().trim();
  if (
    clean === 'reaction-tap' ||
    clean === 'reaction-time' ||
    clean === 'reaction-tap-f1-reflex' ||
    clean.includes('reaction') ||
    clean.includes('reflex') ||
    clean.includes('formula')
  ) {
    return reactionTheme;
  }
  if (clean === 'memory-match' || clean.includes('memory')) {
    return memoryMatchTheme;
  }
  return defaultCatchBrandTheme;
}

export function resolveThemeBaseId(raw: any): string {
  if (!raw) return 'default';
  if (raw.base_theme_id) return raw.base_theme_id === 'durian' ? 'default' : raw.base_theme_id;
  if (raw.baseThemeId) return raw.baseThemeId === 'durian' ? 'default' : raw.baseThemeId;

  const id = (raw.id || '').toLowerCase();
  const slug = (raw.slug || '').toLowerCase();
  const name = (raw.name || '').toLowerCase();
  const gameSlug = (raw.game_slug || (raw.games?.slug) || '').toLowerCase();
  const gameType = (raw.game_type || raw.game_id || '').toLowerCase();

  if (
    id === 'reaction-tap' ||
    id === 'reaction-time' ||
    slug.includes('reaction') ||
    name.includes('reaction') ||
    name.includes('reflex') ||
    gameSlug === 'reaction-tap' ||
    gameSlug === 'reaction-time' ||
    gameType === 'reaction-tap' ||
    gameType === 'reaction-time'
  ) {
    return 'reaction-tap';
  }
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
  if (id === 'default' || slug === 'default') {
    return 'default';
  }
  if (id === 'carnival' || slug.includes('carnival') || name.includes('carnival')) {
    return 'carnival';
  }
  if (id === 'christmas' || slug.includes('christmas') || name.includes('christmas')) {
    return 'christmas';
  }
  if (
    id === 'chinese-new-year' ||
    id === 'cny' ||
    slug.includes('cny') ||
    slug.includes('chinese-new-year') ||
    name.includes('lunar') ||
    name.includes('chinese')
  ) {
    return 'cny';
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
    return matched === 'durian' ? 'default' : matched;
  }

  return 'default';
}

/**
 * Normalizes a theme object (whether from DB or preset) into a fully populated GameTheme
 */
export function normalizeGameTheme(raw: any): GameTheme {
  if (!raw) return defaultCatchBrandTheme;

  const base_theme_id = resolveThemeBaseId(raw);
  const resolvedGameType =
    raw.game_type ||
    raw.game_slug ||
    raw.games?.slug ||
    raw.games?.game_type ||
    (base_theme_id === 'memory-match' || base_theme_id === 'memory-carnival' || (raw.slug || '').includes('memory') || (raw.name || '').toLowerCase().includes('memory')
      ? 'memory-match'
      : base_theme_id === 'reaction-tap' || base_theme_id === 'reaction-time' || (raw.slug || '').includes('reaction') || (raw.name || '').toLowerCase().includes('reaction')
      ? 'reaction-tap'
      : 'catch-brand');

  const isMemory = resolvedGameType === 'memory-match' || base_theme_id === 'memory-match' || base_theme_id === 'memory-carnival';
  const isReaction = resolvedGameType === 'reaction-tap' || resolvedGameType === 'reaction-time' || base_theme_id === 'reaction-tap' || base_theme_id === 'reaction-time';

  const basePreset = isMemory
    ? memoryMatchTheme
    : isReaction
    ? reactionTheme
    : (THEME_REGISTRY[base_theme_id] || defaultCatchBrandTheme);

  const id = raw.id || raw.slug || 'theme-' + Date.now();
  const name = String(raw.name || raw.branding?.gameTitle || basePreset?.name || (isMemory ? 'Brand Memory Match' : isReaction ? 'Reaction Tap' : 'Custom Theme'));
  const slug = raw.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const description = raw.description ?? basePreset.description;
  const status = raw.status || 'active';

  const branding = {
    gameTitle: raw.branding?.gameTitle || raw.gameTitle || (isMemory ? 'BRAND MEMORY MATCH' : isReaction ? 'REACTION TAP' : name.toUpperCase()),
    subtitle: raw.branding?.subtitle || raw.subtitle || basePreset.branding?.subtitle || (isMemory ? 'Flip cards, match 8 pairs, and beat the clock!' : isReaction ? 'Tap the lights as fast as you can!' : 'Catch falling items, avoid hazards!'),
    logoUrl: raw.branding?.logoUrl ?? raw.logo ?? null,
    clientLogoUrl: raw.branding?.clientLogoUrl ?? raw.clientLogo ?? null,
  };

  const background_url = raw.background_url || raw.background || basePreset.background_url || resolveThemeDefaultBgImage({ ...raw, base_theme_id, game_type: resolvedGameType });

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

  const basket_config = (isMemory || isReaction)
    ? null
    : {
        name: raw.basket_config?.name || raw.catcherName || basePreset.basket_config?.name || 'Catcher Basket',
        imageUrl: raw.basket_config?.imageUrl ?? raw.catcher ?? basePreset.basket_config?.imageUrl ?? '/assets/games/catch-brand/themes/default/basket.png',
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
        : (basePreset.items_config || []));

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
    : isReaction
    ? []
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
          scale: item.scale !== undefined ? Number(item.scale) : 1.0,
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
    : (isMemory || isReaction ? '' : resolveThemeDefaultItemImage({ ...raw, base_theme_id, game_type: resolvedGameType }, { isHazard: false, isBonus: false }));

  const badEffectiveImg = (firstBad && firstBad.imageUrl)
    ? firstBad.imageUrl
    : (isMemory || isReaction ? '' : resolveThemeDefaultItemImage({ ...raw, base_theme_id, game_type: resolvedGameType }, { isHazard: true, isBonus: false }));

  const bonusEffectiveImg = (firstBonus && firstBonus.imageUrl)
    ? firstBonus.imageUrl
    : (isMemory || isReaction ? '' : resolveThemeDefaultItemImage({ ...raw, base_theme_id, game_type: resolvedGameType }, { isHazard: false, isBonus: true }));

  const catcherEffectiveImg = basket_config?.imageUrl || ((isMemory || isReaction) ? '' : resolveThemeDefaultBasketImage({ ...raw, base_theme_id, game_type: resolvedGameType }));

    const isSystemTheme = Boolean(
      raw.is_system ||
      raw.is_system_theme ||
      raw.ownership_type === 'system' ||
      (!raw.organization_id && (
        id === 'default' ||
        id === 'carnival' ||
        id === 'christmas' ||
        id === 'chinese-new-year' ||
        id === 'cny' ||
        id === 'halloween' ||
        id === 'mango' ||
        id === 'memory-match' ||
        id === 'memory-carnival' ||
        id === 'reaction-tap' ||
        id === 'reaction-time'
      ))
    );

    return {
      id,
      organization_id: raw.organization_id,
      game_id: raw.game_id || raw.games?.id || (resolvedGameType === 'memory-match' ? 'memory-match' : resolvedGameType === 'reaction-tap' ? 'reaction-tap' : 'catch-brand'),
      game_name: raw.game_name || raw.games?.name || (resolvedGameType === 'memory-match' ? 'Brand Memory Match' : resolvedGameType === 'reaction-tap' ? 'Reaction Tap' : 'Catch the Brand'),
      game_slug: raw.game_slug || raw.games?.slug || resolvedGameType,
      game_type: resolvedGameType,
      is_system: isSystemTheme,
      is_system_theme: isSystemTheme,
      ownership_type: raw.ownership_type || (isSystemTheme ? 'system' : 'organization'),
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
   * Returns all unique themes registered in the registry, defensively deduplicated by theme.id
   */
  export function getAllUniqueThemes(): GameTheme[] {
    return Array.from(
      new Map(Object.values(THEME_REGISTRY).map((theme) => [theme.id, theme])).values()
    );
  }

  /**
   * Returns only system themes, defensively deduplicated by theme.id
   */
  export function getSystemThemes(gameSlugOrId?: string): GameTheme[] {
    const uniqueThemes = getAllUniqueThemes();
    return uniqueThemes.filter((theme) => {
      const isSys = Boolean(
        theme.is_system_theme ||
        theme.is_system ||
        theme.ownership_type === 'system' ||
        !theme.organization_id
      );
      if (!isSys) return false;
      if (gameSlugOrId) {
        const target = gameSlugOrId.toLowerCase();
        if (target === 'memory-match') {
          return theme.game_slug === 'memory-match' || theme.game_type === 'memory-match' || theme.id === 'memory-match';
        }
        if (target === 'reaction-tap' || target === 'reaction-time') {
          return theme.game_slug === 'reaction-tap' || theme.game_type === 'reaction-tap' || theme.id === 'reaction-tap';
        }
        if (target === 'catch-brand' || target === 'catch') {
          return theme.game_type === 'catch-brand' || theme.game_slug === 'catch-brand' || (!theme.game_type && theme.id !== 'memory-match' && theme.id !== 'reaction-tap');
        }
      }
      return true;
    });
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
 * Retrieve a theme by ID or slug with safe fallback to defaultCatchBrandTheme
 */
export function getThemeById(id: string): GameTheme {
  const theme = THEME_REGISTRY[id];
  if (theme) {
    return theme;
  }
  return currentActiveTheme || defaultCatchBrandTheme;
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
