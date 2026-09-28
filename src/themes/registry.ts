import { GameTheme, ThemeDropItem, ThemeBasketConfig } from './types';
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
  isUUID,
  isStaleAssetUrl,
  isSystemTheme,
  getCanonicalAssetThemeId,
  resolveGameAsset,
  resolveThemeDefaultBgImage,
  resolveThemeDefaultBasketImage,
  resolveThemeDefaultItemImage,
  THEME_ASSET_ALIASES,
} from './gameAssetResolver';

/**
 * Default active theme ID.
 */
export const DEFAULT_ACTIVE_THEME_ID = 'default';

export const THEME_REGISTRY: Record<string, GameTheme> = {
  default: defaultCatchBrandTheme,
  'catch-brand': defaultCatchBrandTheme,
  carnival: carnivalTheme,
  'carnival-fiesta': carnivalTheme,
  christmas: christmasTheme,
  'christmas-rush': christmasTheme,
  'chinese-new-year': cnyTheme,
  'cny-fortune': cnyTheme,
  cny: cnyTheme,
  halloween: halloweenTheme,
  'halloween-spooky': halloweenTheme,
  'spooky-halloween': halloweenTheme,
  mango: mangoTheme,
  'mango-festival': mangoTheme,
  'mango-harvest': mangoTheme,
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

  // Handle string input (e.g. legacy 'chinese-new-year' or slug/id string)
  if (typeof raw === 'string') {
    const clean = raw.trim().toLowerCase();
    if (isUUID(clean)) {
      return 'default';
    }
    if (THEME_ASSET_ALIASES[clean]) {
      return THEME_ASSET_ALIASES[clean];
    }
    if (THEME_REGISTRY[clean]) {
      const regMatch = THEME_REGISTRY[clean];
      if (regMatch.id && !isUUID(regMatch.id)) {
        return THEME_ASSET_ALIASES[regMatch.id] || regMatch.id;
      }
    }
    if (clean === 'durian') return 'default';
    if (clean.includes('christmas')) return 'christmas';
    if (clean.includes('cny') || clean.includes('chinese-new-year') || clean.includes('lunar')) return 'cny';
    if (clean.includes('carnival')) return 'carnival';
    if (clean.includes('halloween') || clean.includes('spooky')) return 'halloween';
    if (clean.includes('mango')) return 'mango';
    if (clean.includes('memory')) return 'memory-match';
    if (clean.includes('reaction') || clean.includes('reflex')) return 'reaction-tap';
    return 'default';
  }

  // 1. Explicit canonical asset theme metadata if available
  const explicitAssetTheme = (
    raw.asset_theme_id ||
    raw.assetThemeId ||
    raw.canonical_asset_theme_id ||
    raw.canonicalAssetThemeId
  );
  if (explicitAssetTheme && typeof explicitAssetTheme === 'string') {
    const cleanExplicit = explicitAssetTheme.trim().toLowerCase();
    if (!isUUID(cleanExplicit)) {
      if (THEME_ASSET_ALIASES[cleanExplicit]) return THEME_ASSET_ALIASES[cleanExplicit];
      if (THEME_REGISTRY[cleanExplicit]) return cleanExplicit;
      if (cleanExplicit === 'christmas' || cleanExplicit === 'cny' || cleanExplicit === 'carnival' || cleanExplicit === 'default') {
        return cleanExplicit;
      }
    }
  }

  // 2. Check raw.slug
  const slug = String(raw.slug || '').toLowerCase().trim();
  if (slug) {
    if (THEME_ASSET_ALIASES[slug]) return THEME_ASSET_ALIASES[slug];
    if (slug.includes('christmas')) return 'christmas';
    if (slug.includes('cny') || slug.includes('chinese-new-year') || slug.includes('lunar')) return 'cny';
    if (slug.includes('carnival')) return 'carnival';
    if (slug.includes('halloween') || slug.includes('spooky')) return 'halloween';
    if (slug.includes('mango')) return 'mango';
    if (slug.includes('memory')) return 'memory-match';
    if (slug.includes('reaction') || slug.includes('reflex')) return 'reaction-tap';
  }

  // 3. Check raw.name
  const name = String(raw.name || raw.branding?.gameTitle || '').toLowerCase().trim();
  if (name) {
    if (name.includes('christmas')) return 'christmas';
    if (name.includes('lunar') || name.includes('chinese new year') || name.includes('cny') || name.includes('angpow') || name.includes('fortune')) return 'cny';
    if (name.includes('carnival')) return 'carnival';
    if (name.includes('halloween') || name.includes('spooky')) return 'halloween';
    if (name.includes('mango')) return 'mango';
    if (name.includes('memory')) return 'memory-match';
    if (name.includes('reaction') || name.includes('reflex')) return 'reaction-tap';
  }

  // 4. Check raw.id if it is a known canonical theme ID (and NOT a UUID)
  const id = String(raw.id || '').toLowerCase().trim();
  if (id && !isUUID(id)) {
    if (THEME_ASSET_ALIASES[id]) return THEME_ASSET_ALIASES[id];
    if (THEME_REGISTRY[id]) {
      const regMatch = THEME_REGISTRY[id];
      if (regMatch.id && !isUUID(regMatch.id)) {
        return THEME_ASSET_ALIASES[regMatch.id] || regMatch.id;
      }
    }
    if (id.includes('christmas')) return 'christmas';
    if (id.includes('chinese-new-year') || id.includes('cny') || id.includes('lunar')) return 'cny';
    if (id.includes('carnival')) return 'carnival';
    if (id.includes('halloween')) return 'halloween';
    if (id.includes('mango')) return 'mango';
    if (id.includes('memory')) return 'memory-match';
    if (id.includes('reaction') || id.includes('reflex')) return 'reaction-tap';
    if (id === 'durian') return 'default';
  }

  // 5. Check raw.base_theme_id or raw.baseThemeId
  const rawBase = String(raw.base_theme_id || raw.baseThemeId || '').toLowerCase().trim();
  if (rawBase) {
    if (!isUUID(rawBase)) {
      if (rawBase === 'durian') return 'default';
      if (THEME_ASSET_ALIASES[rawBase]) return THEME_ASSET_ALIASES[rawBase];
      if (THEME_REGISTRY[rawBase]) return rawBase;
      if (rawBase.includes('christmas')) return 'christmas';
      if (rawBase.includes('cny') || rawBase.includes('chinese-new-year') || rawBase.includes('lunar')) return 'cny';
      if (rawBase.includes('carnival')) return 'carnival';
      if (rawBase.includes('halloween')) return 'halloween';
      if (rawBase.includes('mango')) return 'mango';
      if (rawBase.includes('memory')) return 'memory-match';
      if (rawBase.includes('reaction')) return 'reaction-tap';
    } else {
      // It's a UUID! Check if this base theme is in THEME_REGISTRY
      const reg = THEME_REGISTRY[rawBase];
      if (reg) {
        return resolveThemeBaseId(reg);
      }
    }
  }

  // 6. Game type fallback
  const gameSlug = String(raw.game_slug || (raw.games?.slug) || '').toLowerCase();
  const gameType = String(raw.game_type || raw.game_id || '').toLowerCase();

  if (gameSlug.includes('memory') || gameType.includes('memory')) {
    return 'memory-match';
  }
  if (gameSlug.includes('reaction') || gameType.includes('reaction')) {
    return 'reaction-tap';
  }

  return 'default';
}

/**
 * Normalizes a theme object (whether from DB or preset) into a fully populated GameTheme
 */
export function normalizeGameTheme(raw: any): GameTheme {
  if (!raw) return defaultCatchBrandTheme;

  const canonicalBaseId = resolveThemeBaseId(raw);
  const canonicalAssetThemeId = getCanonicalAssetThemeId(raw);

  const rawBaseThemeId = raw.base_theme_id || raw.baseThemeId;
  // If raw.base_theme_id is a UUID, preserve it for database FK referential integrity.
  // If not a UUID or not set, use canonicalBaseId.
  const base_theme_id = (rawBaseThemeId && isUUID(rawBaseThemeId))
    ? rawBaseThemeId
    : (rawBaseThemeId === 'durian' ? 'default' : (rawBaseThemeId || canonicalBaseId));

  const resolvedGameType =
    raw.game_type ||
    raw.game_slug ||
    raw.games?.slug ||
    raw.games?.game_type ||
    (canonicalBaseId === 'memory-match' || canonicalBaseId === 'memory-carnival' || (raw.slug || '').includes('memory') || (raw.name || '').toLowerCase().includes('memory')
      ? 'memory-match'
      : canonicalBaseId === 'reaction-tap' || canonicalBaseId === 'reaction-time' || (raw.slug || '').includes('reaction') || (raw.name || '').toLowerCase().includes('reaction')
      ? 'reaction-tap'
      : 'catch-brand');

  const isMemory = resolvedGameType === 'memory-match' || canonicalBaseId === 'memory-match' || canonicalBaseId === 'memory-carnival';
  const isReaction = resolvedGameType === 'reaction-tap' || resolvedGameType === 'reaction-time' || canonicalBaseId === 'reaction-tap' || canonicalBaseId === 'reaction-time';

  const basePreset = isMemory
    ? memoryMatchTheme
    : isReaction
    ? reactionTheme
    : (THEME_REGISTRY[canonicalBaseId] || THEME_REGISTRY[canonicalAssetThemeId] || defaultCatchBrandTheme);

  const id = raw.id || raw.slug || 'theme-' + Date.now();
  const name = String(raw.name || raw.branding?.gameTitle || basePreset?.name || (isMemory ? 'Brand Memory Match' : isReaction ? 'Reaction Tap' : 'Custom Theme'));
  const slug = raw.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const description = raw.description ?? basePreset.description;
  const status = raw.status || 'active';

  const isSystem = Boolean(
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
      slug === 'christmas-rush' ||
      slug === 'cny-fortune' ||
      slug === 'carnival' ||
      slug === 'default' ||
      slug === 'halloween-spooky' ||
      slug === 'spooky-halloween' ||
      slug === 'mango-festival' ||
      slug === 'mango-harvest'
    ))
  );

  const branding = {
    gameTitle: raw.branding?.gameTitle || raw.gameTitle || (isMemory ? 'BRAND MEMORY MATCH' : isReaction ? 'REACTION TAP' : name.toUpperCase()),
    subtitle: raw.branding?.subtitle || raw.subtitle || basePreset.branding?.subtitle || (isMemory ? 'Flip cards, match 8 pairs, and beat the clock!' : isReaction ? 'Tap the lights as fast as you can!' : 'Catch falling items, avoid hazards!'),
    logoUrl: raw.branding?.logoUrl ?? raw.logo ?? null,
    clientLogoUrl: raw.branding?.clientLogoUrl ?? raw.clientLogo ?? null,
  };

  // Authoritative background URL resolution:
  // For system themes or when background_url is stale/empty, resolve from canonical asset hierarchy.
  // For custom organization themes, preserve explicit custom uploaded assets.
  let background_url: string;
  if (isSystem) {
    background_url = resolveGameAsset({ gameType: resolvedGameType, themeId: canonicalAssetThemeId, assetType: 'background' }) ||
      basePreset.background_url ||
      `/assets/games/${resolvedGameType}/themes/default/background.png`;
  } else {
    const rawBg = raw.background_url || raw.background;
    if (rawBg && typeof rawBg === 'string' && rawBg.trim() !== '' && !isStaleAssetUrl(rawBg)) {
      background_url = rawBg.trim();
    } else {
      background_url = resolveGameAsset({ gameType: resolvedGameType, themeId: canonicalAssetThemeId, assetType: 'background' }) ||
        basePreset.background_url ||
        `/assets/games/${resolvedGameType}/themes/default/background.png`;
    }
  }

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

  // Authoritative catcher / basket resolution:
  // For system themes or when imageUrl is stale/empty, resolve from canonical asset hierarchy.
  // For custom organization themes, preserve explicit custom uploaded assets.
  let basket_config: ThemeBasketConfig | null = null;
  if (!isMemory && !isReaction) {
    let basketImg: string;
    if (isSystem) {
      basketImg = resolveGameAsset({ gameType: 'catch-brand', themeId: canonicalAssetThemeId, assetType: 'catcher' }) ||
        basePreset.basket_config?.imageUrl ||
        '/assets/games/catch-brand/themes/default/basket.png';
    } else {
      const rawBasketImg = raw.basket_config?.imageUrl ?? raw.catcher;
      if (rawBasketImg && typeof rawBasketImg === 'string' && rawBasketImg.trim() !== '' && !isStaleAssetUrl(rawBasketImg)) {
        basketImg = rawBasketImg.trim();
      } else {
        basketImg = resolveGameAsset({ gameType: 'catch-brand', themeId: canonicalAssetThemeId, assetType: 'catcher' }) ||
          basePreset.basket_config?.imageUrl ||
          '/assets/games/catch-brand/themes/default/basket.png';
      }
    }

    basket_config = {
      name: raw.basket_config?.name || raw.catcherName || basePreset.basket_config?.name || 'Catcher Basket',
      imageUrl: basketImg,
      width: raw.basket_config?.width || basePreset.basket_config?.width || 140,
      height: raw.basket_config?.height || basePreset.basket_config?.height || 70,
      catchAreaRatio: raw.basket_config?.catchAreaRatio || basePreset.basket_config?.catchAreaRatio || 0.72,
      speed: raw.basket_config?.speed || basePreset.basket_config?.speed || 550,
      collisionWidthRatio: raw.basket_config?.collisionWidthRatio || basePreset.basket_config?.collisionWidthRatio || 0.7235,
      collisionHeightRatio: raw.basket_config?.collisionHeightRatio || basePreset.basket_config?.collisionHeightRatio || 0.13,
      collisionOffsetYRatio: raw.basket_config?.collisionOffsetYRatio || basePreset.basket_config?.collisionOffsetYRatio || 0.3394,
    };
  }

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

        let itemImg: string | null = null;
        if (isSystem) {
          const assetType = isHazard ? 'hazardItem' : isBonus ? 'bonusItem' : 'goodItem';
          itemImg = resolveGameAsset({ gameType: 'catch-brand', themeId: canonicalAssetThemeId, assetType }) ||
            (isHazard ? '/assets/games/catch-brand/themes/default/item_hazard_01.png' : isBonus ? '/assets/games/catch-brand/themes/default/item_bonus_01.png' : '/assets/games/catch-brand/themes/default/item_normal_01.png');
        } else {
          if (item.imageUrl && typeof item.imageUrl === 'string' && item.imageUrl.trim() !== '' && !isStaleAssetUrl(item.imageUrl)) {
            itemImg = item.imageUrl.trim();
          } else {
            const assetType = isHazard ? 'hazardItem' : isBonus ? 'bonusItem' : 'goodItem';
            itemImg = resolveGameAsset({ gameType: 'catch-brand', themeId: canonicalAssetThemeId, assetType }) ||
              (isHazard ? '/assets/games/catch-brand/themes/default/item_hazard_01.png' : isBonus ? '/assets/games/catch-brand/themes/default/item_bonus_01.png' : '/assets/games/catch-brand/themes/default/item_normal_01.png');
          }
        }

        return {
          id: item.id || `item_${index}`,
          name: item.name || (isHazard ? 'Hazard Item' : isBonus ? 'Bonus Item' : 'Good Item'),
          imageUrl: itemImg,
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

  const isSystemThemeResult = Boolean(
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
    is_system: isSystemThemeResult,
    is_system_theme: isSystemThemeResult,
    ownership_type: raw.ownership_type || (isSystemThemeResult ? 'system' : 'organization'),
    name,
    slug,
    base_theme_id,
    asset_theme_id: canonicalAssetThemeId,
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
