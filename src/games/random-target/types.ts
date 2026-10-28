import { BaseGameConfig } from '../types';

export type RandomTargetThemeType = 'desert-quick-draw' | 'ocean-treasure-hunt' | 'custom';

export interface TargetDefinition {
  id: string;
  name: string;
  imageUrl: string;
  score: number; // positive for awards (e.g. +10), negative for penalties (e.g. -10)
  isPenalty: boolean;
  spawnWeight: number; // 1 - 100 relative weight
  size: number; // in pixels (default ~84-96)
  hitEffectType: 'sparks' | 'bubbles' | 'dust' | 'splash' | 'sparkle';
}

export interface ToolDefinition {
  id: string;
  name: string;
  imageUrl: string;
  type: 'pistol' | 'fishing-rod' | 'custom';
  position: 'bottom-right';
  size: number; // width/height in px
  projectileEffect: 'bullet-trail' | 'fishing-line' | 'magic-spark';
  recoilAngleDeg: number; // max recoil rotation in degrees
  projectileSpeedMs?: number; // duration of projectile travel animation in ms
}

export interface PlayAreaConfig {
  topPercent: number; // e.g. 15% (below top HUD)
  bottomPercent: number; // e.g. 75% (above bottom tool)
  leftPercent: number; // e.g. 8%
  rightPercent: number; // e.g. 80% (away from bottom-right tool corner)
}

export interface RandomTargetGameConfig extends BaseGameConfig {
  themeType?: RandomTargetThemeType;
  gameDurationSeconds: number;
  initialSpawnIntervalMs: number; // e.g. 1000ms
  minSpawnIntervalMs: number; // e.g. 450ms
  targetLifetimeMs: number; // e.g. 1800ms
  minTargetLifetimeMs: number; // e.g. 1100ms
  maxSimultaneousTargets: number; // e.g. 4
  difficultyProgression: 'linear' | 'exponential' | 'none';
  startingScore: number;
  allowNegativeScore: boolean; // default false (clamped at 0)
  soundEnabled: boolean;
  soundVolume: number;
  bgmEnabled: boolean;

  // Thematic elements
  positiveTarget: TargetDefinition;
  negativeTarget: TargetDefinition;
  interactionTool: ToolDefinition;
  playArea: PlayAreaConfig;
}

export interface ActiveTarget {
  uid: string;
  definitionId: string;
  name: string;
  imageUrl: string;
  score: number;
  isPenalty: boolean;
  xPercent: number; // 0 - 100
  yPercent: number; // 0 - 100
  size: number;
  spawnTimeMs: number;
  lifetimeMs: number;
  state: 'spawning' | 'active' | 'hit' | 'expired';
  hitEffectType: 'sparks' | 'bubbles' | 'dust' | 'splash' | 'sparkle';
}

export interface HitFeedback {
  id: string;
  x: number; // screen/design coordinates
  y: number;
  scoreDelta: number;
  isPenalty: boolean;
  label: string;
  createdAt: number;
}

export interface ProjectileAnimation {
  id: string;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  type: 'bullet-trail' | 'fishing-line' | 'magic-spark';
  progress: number; // 0 to 1
  createdAt: number;
}

export interface RandomTargetStats {
  score: number;
  positiveHits: number;
  negativeHits: number;
  totalHits: number;
  missedTargets: number;
  accuracy: number; // 0 - 100%
  highestStreak: number;
  currentStreak: number;
}

export const DEFAULT_DESERT_CONFIG: RandomTargetGameConfig = {
  themeType: 'desert-quick-draw',
  gameDurationSeconds: 30,
  initialSpawnIntervalMs: 1100,
  minSpawnIntervalMs: 500,
  targetLifetimeMs: 1750,
  minTargetLifetimeMs: 1050,
  maxSimultaneousTargets: 4,
  difficultyProgression: 'linear',
  startingScore: 0,
  allowNegativeScore: false,
  soundEnabled: true,
  soundVolume: 0.8,
  bgmEnabled: true,
  positiveTarget: {
    id: 'desert-bandit',
    name: 'Bandit Outlaw',
    imageUrl: '/assets/games/random-target/themes/desert-quick-draw/bandit.png',
    score: 10,
    isPenalty: false,
    spawnWeight: 70,
    size: 88,
    hitEffectType: 'sparks',
  },
  negativeTarget: {
    id: 'desert-merchant',
    name: 'Town Merchant',
    imageUrl: '/assets/games/random-target/themes/desert-quick-draw/merchant.png',
    score: -10,
    isPenalty: true,
    spawnWeight: 30,
    size: 88,
    hitEffectType: 'dust',
  },
  interactionTool: {
    id: 'desert-pistol',
    name: 'Sheriff Revolver',
    imageUrl: '/assets/games/random-target/themes/desert-quick-draw/pistol.png',
    type: 'pistol',
    position: 'bottom-right',
    size: 160,
    projectileEffect: 'bullet-trail',
    recoilAngleDeg: -22,
    projectileSpeedMs: 160,
  },
  playArea: {
    topPercent: 14,
    bottomPercent: 78,
    leftPercent: 8,
    rightPercent: 78,
  },
};

export const DEFAULT_OCEAN_CONFIG: RandomTargetGameConfig = {
  themeType: 'ocean-treasure-hunt',
  gameDurationSeconds: 30,
  initialSpawnIntervalMs: 1100,
  minSpawnIntervalMs: 500,
  targetLifetimeMs: 1750,
  minTargetLifetimeMs: 1050,
  maxSimultaneousTargets: 4,
  difficultyProgression: 'linear',
  startingScore: 0,
  allowNegativeScore: false,
  soundEnabled: true,
  soundVolume: 0.8,
  bgmEnabled: true,
  positiveTarget: {
    id: 'ocean-treasure',
    name: 'Sunken Treasure',
    imageUrl: '/assets/games/random-target/themes/ocean-treasure-hunt/treasure.png',
    score: 10,
    isPenalty: false,
    spawnWeight: 70,
    size: 90,
    hitEffectType: 'sparkle',
  },
  negativeTarget: {
    id: 'ocean-shark',
    name: 'Hungry Shark',
    imageUrl: '/assets/games/random-target/themes/ocean-treasure-hunt/shark.png',
    score: -10,
    isPenalty: true,
    spawnWeight: 30,
    size: 92,
    hitEffectType: 'splash',
  },
  interactionTool: {
    id: 'ocean-fishing-rod',
    name: 'Angler Fishing Rod',
    imageUrl: '/assets/games/random-target/themes/ocean-treasure-hunt/fishing_rod.png',
    type: 'fishing-rod',
    position: 'bottom-right',
    size: 170,
    projectileEffect: 'fishing-line',
    recoilAngleDeg: -18,
    projectileSpeedMs: 200,
  },
  playArea: {
    topPercent: 14,
    bottomPercent: 78,
    leftPercent: 8,
    rightPercent: 78,
  },
};

export const DEFAULT_RANDOM_TARGET_DESERT_THEME: RandomTargetGameConfig = DEFAULT_DESERT_CONFIG;
export const DEFAULT_RANDOM_TARGET_OCEAN_THEME: RandomTargetGameConfig = DEFAULT_OCEAN_CONFIG;

const VALID_HIT_EFFECT_TYPES = new Set(['sparks', 'bubbles', 'dust', 'splash', 'sparkle']);
const VALID_TOOL_TYPES = new Set(['pistol', 'fishing-rod', 'custom']);
const VALID_PROJECTILE_EFFECTS = new Set(['bullet-trail', 'fishing-line', 'magic-spark']);

/**
 * Checks whether an asset URL is a legacy or stale Desert Quick Draw path
 * that should be migrated to the canonical Desert Quick Draw theme assets.
 */
export function isLegacyDesertAssetUrl(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return true;
  const clean = url.trim().toLowerCase();
  if (!clean) return true;
  return (
    clean.includes('bandit_target_1792994318514') ||
    clean.includes('merchant_target_1792994318429') ||
    clean.includes('western_pistol_1792994340847') ||
    clean.includes('desert_arcade_bg_1792994317277') ||
    clean.endsWith('/desert-quick-draw/target_positive.png') ||
    clean.endsWith('/desert-quick-draw/target_negative.png') ||
    clean.endsWith('/desert-quick-draw/tool_gun.png') ||
    clean.includes('/games/random-target/themes/default/')
  );
}

/**
 * Checks whether an asset URL is a legacy or stale Ocean Treasure Hunt path
 * that should be migrated to the canonical Ocean Treasure Hunt theme assets.
 */
export function isLegacyOceanAssetUrl(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return true;
  const clean = url.trim().toLowerCase();
  if (!clean) return true;
  return (
    clean.includes('treasure_target_1792994339565') ||
    clean.includes('shark_target_1792994339948') ||
    clean.includes('fishing_rod_1792994341884') ||
    clean.includes('ocean_arcade_bg_1792994317724') ||
    clean.endsWith('/ocean-treasure-hunt/target_positive.png') ||
    clean.endsWith('/ocean-treasure-hunt/target_negative.png') ||
    clean.endsWith('/ocean-treasure-hunt/tool_net.png') ||
    clean.includes('/games/random-target/themes/default/')
  );
}

/**
 * Checks whether an asset URL is any legacy or stale Random Target asset URL.
 */
export function isLegacyRandomTargetAssetUrl(url?: string | null): boolean {
  return isLegacyDesertAssetUrl(url) || isLegacyOceanAssetUrl(url);
}

/**
 * Checks whether an asset URL is a built-in Desert Quick Draw default asset URL.
 */
export function isDefaultDesertAssetUrl(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return false;
  const clean = url.trim().toLowerCase();
  return (
    isLegacyDesertAssetUrl(clean) ||
    clean.includes('/themes/desert-quick-draw/bandit.png') ||
    clean.includes('/themes/desert-quick-draw/merchant.png') ||
    clean.includes('/themes/desert-quick-draw/pistol.png') ||
    clean.includes('/themes/desert-quick-draw/background.png')
  );
}

/**
 * Checks whether an asset URL is a built-in Ocean Treasure Hunt default asset URL.
 */
export function isDefaultOceanAssetUrl(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return false;
  const clean = url.trim().toLowerCase();
  return (
    isLegacyOceanAssetUrl(clean) ||
    clean.includes('/themes/ocean-treasure-hunt/treasure.png') ||
    clean.includes('/themes/ocean-treasure-hunt/shark.png') ||
    clean.includes('/themes/ocean-treasure-hunt/fishing_rod.png') ||
    clean.includes('/themes/ocean-treasure-hunt/background.png')
  );
}

/**
 * Inspects a single theme or config object for authoritative Ocean vs Desert signals.
 * Returns 'ocean-treasure-hunt', 'desert-quick-draw', or null if inconclusive.
 */
function detectThemeTypeFromObject(obj?: any): RandomTargetThemeType | null {
  if (!obj || typeof obj !== 'object') return null;

  // 1. Canonical asset_theme_id / base_theme_id (authoritative theme lineage)
  const assetId = String(
    obj.asset_theme_id || obj.assetThemeId || obj.canonical_asset_theme_id || obj.canonicalAssetThemeId || ''
  ).trim().toLowerCase();
  const baseId = String(obj.base_theme_id || obj.baseThemeId || '').trim().toLowerCase();

  if (
    assetId.includes('ocean') ||
    assetId.includes('treasure-hunt') ||
    baseId.includes('ocean') ||
    baseId.includes('treasure-hunt')
  ) {
    return 'ocean-treasure-hunt';
  }
  if (
    assetId.includes('desert') ||
    assetId.includes('quick-draw') ||
    baseId.includes('desert') ||
    baseId.includes('quick-draw')
  ) {
    return 'desert-quick-draw';
  }

  // 2. Theme ID, slug, name, and branding title
  const id = String(obj.id || '').trim().toLowerCase();
  const slug = String(obj.slug || '').trim().toLowerCase();
  const name = String(obj.name || obj.branding?.gameTitle || obj.gameTitle || '').trim().toLowerCase();
  const bgUrl = String(obj.background_url || obj.background || '').trim().toLowerCase();

  if (
    id.includes('ocean') ||
    id.includes('treasure-hunt') ||
    slug.includes('ocean') ||
    slug.includes('treasure-hunt') ||
    name.includes('ocean') ||
    name.includes('treasure hunt') ||
    bgUrl.includes('/ocean-treasure-hunt/') ||
    bgUrl.includes('ocean_arcade_bg')
  ) {
    return 'ocean-treasure-hunt';
  }
  if (
    id.includes('desert') ||
    id.includes('quick-draw') ||
    slug.includes('desert') ||
    slug.includes('quick-draw') ||
    name.includes('desert') ||
    name.includes('quick draw')
  ) {
    return 'desert-quick-draw';
  }

  // 3. Explicit themeType on config or game_config (for UUID / custom-named themes)
  const explicitType = String(
    obj.themeType || obj.game_config?.themeType || ''
  ).trim().toLowerCase();
  if (explicitType === 'ocean-treasure-hunt') return 'ocean-treasure-hunt';
  if (explicitType === 'desert-quick-draw') return 'desert-quick-draw';

  // 4. Inspect game_config / target / tool definitions (works even when ID is a UUID and name/slug were customized)
  const gc = obj.game_config && typeof obj.game_config === 'object' ? obj.game_config : obj;
  const toolType = String(gc.interactionTool?.type || gc.tool?.type || '').trim().toLowerCase();
  const toolId = String(gc.interactionTool?.id || gc.tool?.id || '').trim().toLowerCase();
  const toolImg = String(gc.interactionTool?.imageUrl || gc.tool?.imageUrl || '').trim().toLowerCase();
  const posId = String(gc.positiveTarget?.id || '').trim().toLowerCase();
  const posImg = String(gc.positiveTarget?.imageUrl || '').trim().toLowerCase();
  const negId = String(gc.negativeTarget?.id || '').trim().toLowerCase();
  const negImg = String(gc.negativeTarget?.imageUrl || '').trim().toLowerCase();

  if (
    toolType === 'fishing-rod' ||
    toolType === 'net' ||
    toolId === 'ocean-fishing-rod' ||
    toolImg.includes('/ocean-treasure-hunt/') ||
    toolImg.includes('fishing_rod') ||
    posId === 'ocean-treasure' ||
    posImg.includes('/ocean-treasure-hunt/') ||
    posImg.includes('treasure_target') ||
    negId === 'ocean-shark' ||
    negImg.includes('/ocean-treasure-hunt/') ||
    negImg.includes('shark_target')
  ) {
    return 'ocean-treasure-hunt';
  }

  if (
    bgUrl.includes('/desert-quick-draw/') ||
    bgUrl.includes('desert_arcade_bg') ||
    toolId === 'desert-pistol' ||
    posId === 'desert-bandit' ||
    negId === 'desert-merchant'
  ) {
    return 'desert-quick-draw';
  }

  return null;
}

/**
 * Authoritatively resolves the Random Target theme type ('ocean-treasure-hunt' or 'desert-quick-draw').
 * Prioritizes `activeTheme` over `propConfig` so that a generic `DEFAULT_DESERT_CONFIG` passed as a fallback
 * prop by `GameShell` never overrides an Ocean Treasure Hunt `activeTheme`.
 */
export function resolveRandomTargetThemeType(
  activeTheme?: any,
  propConfig?: any
): RandomTargetThemeType {
  const fromTheme = detectThemeTypeFromObject(activeTheme);
  if (fromTheme) return fromTheme;

  const fromProp = detectThemeTypeFromObject(propConfig);
  if (fromProp) return fromProp;

  return 'desert-quick-draw';
}

/**
 * Determines whether a theme or config object represents the Ocean Treasure Hunt theme.
 */
export function isOceanTreasureHuntTheme(theme?: any, propConfig?: any): boolean {
  return resolveRandomTargetThemeType(theme, propConfig) === 'ocean-treasure-hunt';
}

/**
 * Normalizes any existing, partial, or legacy game_config into the canonical RandomTargetGameConfig schema.
 * Transparently migrates legacy fields:
 * - `spawnIntervalInitialMs` -> `initialSpawnIntervalMs`
 * - `tool` -> `interactionTool`
 * - `targets` array -> `positiveTarget` & `negativeTarget`
 * - Replaces stale or cross-theme default Desert Quick Draw / Ocean Treasure Hunt asset paths with canonical PNG theme paths
 * - Preserves legitimate user customizations (scores, weights, sizes, durations, and custom uploaded asset URLs)
 */
export function normalizeRandomTargetConfig(
  raw?: any,
  defaultThemeConfig: RandomTargetGameConfig = DEFAULT_DESERT_CONFIG
): RandomTargetGameConfig {
  const isOceanDefault =
    defaultThemeConfig.themeType === 'ocean-treasure-hunt' ||
    defaultThemeConfig.interactionTool?.type === 'fishing-rod' ||
    defaultThemeConfig.positiveTarget?.id === 'ocean-treasure';

  const canonicalThemeType: RandomTargetThemeType = isOceanDefault
    ? 'ocean-treasure-hunt'
    : 'desert-quick-draw';

  if (!raw || typeof raw !== 'object') {
    return {
      ...defaultThemeConfig,
      themeType: canonicalThemeType,
      positiveTarget: { ...defaultThemeConfig.positiveTarget },
      negativeTarget: { ...defaultThemeConfig.negativeTarget },
      interactionTool: { ...defaultThemeConfig.interactionTool },
      playArea: { ...defaultThemeConfig.playArea },
    };
  }

  const base: RandomTargetGameConfig = {
    ...defaultThemeConfig,
    ...raw,
    themeType: canonicalThemeType,
  };

  // 1. Legacy spawn interval migration
  if (typeof raw.spawnIntervalInitialMs === 'number' && !raw.initialSpawnIntervalMs) {
    base.initialSpawnIntervalMs = raw.spawnIntervalInitialMs;
  }

  // 2. Legacy interaction tool migration
  if (raw.tool && typeof raw.tool === 'object') {
    base.interactionTool = {
      ...defaultThemeConfig.interactionTool,
      ...raw.tool,
      size: typeof raw.tool.size === 'number' ? raw.tool.size : (typeof raw.tool.width === 'number' ? raw.tool.width : defaultThemeConfig.interactionTool.size),
      projectileSpeedMs: typeof raw.tool.projectileSpeedMs === 'number' ? raw.tool.projectileSpeedMs : (defaultThemeConfig.interactionTool.projectileSpeedMs || 180),
    };
  }

  // 3. Legacy targets array migration
  if (Array.isArray(raw.targets) && raw.targets.length > 0) {
    const pos = raw.targets.find((t: any) => t.isPositive || !t.isPenalty || t.points > 0);
    const neg = raw.targets.find((t: any) => t.isPenalty || !t.isPositive || t.penalty > 0 || t.score < 0);

    if (pos) {
      base.positiveTarget = {
        ...defaultThemeConfig.positiveTarget,
        ...pos,
        score: typeof pos.score === 'number' ? pos.score : (typeof pos.points === 'number' ? pos.points : 10),
        isPenalty: false,
        size: typeof pos.size === 'number' ? pos.size : (typeof pos.scale === 'number' ? Math.round(pos.scale * 88) : defaultThemeConfig.positiveTarget.size),
      };
    }
    if (neg) {
      base.negativeTarget = {
        ...defaultThemeConfig.negativeTarget,
        ...neg,
        score: typeof neg.score === 'number' ? neg.score : (typeof neg.penalty === 'number' ? -Math.abs(neg.penalty) : -10),
        isPenalty: true,
        size: typeof neg.size === 'number' ? neg.size : (typeof neg.scale === 'number' ? Math.round(neg.scale * 88) : defaultThemeConfig.negativeTarget.size),
      };
    }
  }

  // Helper to check if an asset URL is a legacy URL or a cross-theme default URL for the wrong theme
  const shouldReplaceWithDefaultAsset = (url?: string | null): boolean => {
    if (isLegacyRandomTargetAssetUrl(url)) return true;
    if (isOceanDefault && isDefaultDesertAssetUrl(url)) return true;
    if (!isOceanDefault && isDefaultOceanAssetUrl(url)) return true;
    return false;
  };

  // Deep-merge positiveTarget, negativeTarget, interactionTool, and playArea with defaults
  base.positiveTarget = {
    ...defaultThemeConfig.positiveTarget,
    ...(raw.positiveTarget && typeof raw.positiveTarget === 'object' ? raw.positiveTarget : {}),
    ...(base.positiveTarget && typeof base.positiveTarget === 'object' ? base.positiveTarget : {}),
    isPenalty: false,
  };
  if (shouldReplaceWithDefaultAsset(base.positiveTarget.imageUrl)) {
    base.positiveTarget.imageUrl = defaultThemeConfig.positiveTarget.imageUrl;
  }
  if (
    base.positiveTarget.name === 'Gold Bullseye Target' ||
    base.positiveTarget.name === 'Golden Pearl Shell' ||
    (isOceanDefault && base.positiveTarget.name === DEFAULT_DESERT_CONFIG.positiveTarget.name) ||
    (!isOceanDefault && base.positiveTarget.name === DEFAULT_OCEAN_CONFIG.positiveTarget.name)
  ) {
    base.positiveTarget.name = defaultThemeConfig.positiveTarget.name;
  }
  if (
    (isOceanDefault && base.positiveTarget.id === DEFAULT_DESERT_CONFIG.positiveTarget.id) ||
    (!isOceanDefault && base.positiveTarget.id === DEFAULT_OCEAN_CONFIG.positiveTarget.id)
  ) {
    base.positiveTarget.id = defaultThemeConfig.positiveTarget.id;
  }
  if (
    !VALID_HIT_EFFECT_TYPES.has(base.positiveTarget.hitEffectType) ||
    (isOceanDefault &&
      base.positiveTarget.hitEffectType === DEFAULT_DESERT_CONFIG.positiveTarget.hitEffectType &&
      raw.positiveTarget?.id === DEFAULT_DESERT_CONFIG.positiveTarget.id) ||
    (!isOceanDefault &&
      base.positiveTarget.hitEffectType === DEFAULT_OCEAN_CONFIG.positiveTarget.hitEffectType &&
      raw.positiveTarget?.id === DEFAULT_OCEAN_CONFIG.positiveTarget.id)
  ) {
    base.positiveTarget.hitEffectType = defaultThemeConfig.positiveTarget.hitEffectType;
  }
  if (typeof base.positiveTarget.score !== 'number' || !Number.isFinite(base.positiveTarget.score)) {
    base.positiveTarget.score = defaultThemeConfig.positiveTarget.score;
  } else {
    base.positiveTarget.score = Math.max(0, Math.trunc(base.positiveTarget.score));
  }
  if (typeof base.positiveTarget.size !== 'number' || base.positiveTarget.size <= 0) {
    base.positiveTarget.size = defaultThemeConfig.positiveTarget.size;
  }
  if (typeof base.positiveTarget.spawnWeight !== 'number' || base.positiveTarget.spawnWeight <= 0) {
    base.positiveTarget.spawnWeight = defaultThemeConfig.positiveTarget.spawnWeight;
  }

  base.negativeTarget = {
    ...defaultThemeConfig.negativeTarget,
    ...(raw.negativeTarget && typeof raw.negativeTarget === 'object' ? raw.negativeTarget : {}),
    ...(base.negativeTarget && typeof base.negativeTarget === 'object' ? base.negativeTarget : {}),
    isPenalty: true,
  };
  if (shouldReplaceWithDefaultAsset(base.negativeTarget.imageUrl)) {
    base.negativeTarget.imageUrl = defaultThemeConfig.negativeTarget.imageUrl;
  }
  if (
    base.negativeTarget.name === 'Red TNT Barrel' ||
    base.negativeTarget.name === 'Spiky Sea Mine' ||
    (isOceanDefault && base.negativeTarget.name === DEFAULT_DESERT_CONFIG.negativeTarget.name) ||
    (!isOceanDefault && base.negativeTarget.name === DEFAULT_OCEAN_CONFIG.negativeTarget.name)
  ) {
    base.negativeTarget.name = defaultThemeConfig.negativeTarget.name;
  }
  if (
    (isOceanDefault && base.negativeTarget.id === DEFAULT_DESERT_CONFIG.negativeTarget.id) ||
    (!isOceanDefault && base.negativeTarget.id === DEFAULT_OCEAN_CONFIG.negativeTarget.id)
  ) {
    base.negativeTarget.id = defaultThemeConfig.negativeTarget.id;
  }
  if (
    !VALID_HIT_EFFECT_TYPES.has(base.negativeTarget.hitEffectType) ||
    (isOceanDefault &&
      base.negativeTarget.hitEffectType === DEFAULT_DESERT_CONFIG.negativeTarget.hitEffectType &&
      raw.negativeTarget?.id === DEFAULT_DESERT_CONFIG.negativeTarget.id) ||
    (!isOceanDefault &&
      base.negativeTarget.hitEffectType === DEFAULT_OCEAN_CONFIG.negativeTarget.hitEffectType &&
      raw.negativeTarget?.id === DEFAULT_OCEAN_CONFIG.negativeTarget.id)
  ) {
    base.negativeTarget.hitEffectType = defaultThemeConfig.negativeTarget.hitEffectType;
  }
  if (typeof base.negativeTarget.score !== 'number' || !Number.isFinite(base.negativeTarget.score)) {
    base.negativeTarget.score = defaultThemeConfig.negativeTarget.score;
  } else {
    const intNeg = Math.trunc(base.negativeTarget.score);
    base.negativeTarget.score = intNeg > 0 ? -intNeg : intNeg;
  }
  if (typeof base.negativeTarget.size !== 'number' || base.negativeTarget.size <= 0) {
    base.negativeTarget.size = defaultThemeConfig.negativeTarget.size;
  }
  if (typeof base.negativeTarget.spawnWeight !== 'number' || base.negativeTarget.spawnWeight <= 0) {
    base.negativeTarget.spawnWeight = defaultThemeConfig.negativeTarget.spawnWeight;
  }

  base.interactionTool = {
    ...defaultThemeConfig.interactionTool,
    ...(raw.interactionTool && typeof raw.interactionTool === 'object' ? raw.interactionTool : {}),
    ...(base.interactionTool && typeof base.interactionTool === 'object' ? base.interactionTool : {}),
    position: 'bottom-right',
  };
  if (shouldReplaceWithDefaultAsset(base.interactionTool.imageUrl)) {
    base.interactionTool.imageUrl = defaultThemeConfig.interactionTool.imageUrl;
  }
  if (
    base.interactionTool.name === 'Golden Fishing Net' ||
    (isOceanDefault && base.interactionTool.name === DEFAULT_DESERT_CONFIG.interactionTool.name) ||
    (!isOceanDefault && base.interactionTool.name === DEFAULT_OCEAN_CONFIG.interactionTool.name)
  ) {
    base.interactionTool.name = defaultThemeConfig.interactionTool.name;
  }
  if (
    (isOceanDefault && base.interactionTool.id === DEFAULT_DESERT_CONFIG.interactionTool.id) ||
    (!isOceanDefault && base.interactionTool.id === DEFAULT_OCEAN_CONFIG.interactionTool.id)
  ) {
    base.interactionTool.id = defaultThemeConfig.interactionTool.id;
  }
  if (
    !VALID_TOOL_TYPES.has(base.interactionTool.type) ||
    (isOceanDefault && base.interactionTool.type === 'pistol' && isDefaultOceanAssetUrl(base.interactionTool.imageUrl)) ||
    (!isOceanDefault && base.interactionTool.type === 'fishing-rod' && isDefaultDesertAssetUrl(base.interactionTool.imageUrl))
  ) {
    base.interactionTool.type = defaultThemeConfig.interactionTool.type;
  }
  if (
    !VALID_PROJECTILE_EFFECTS.has(base.interactionTool.projectileEffect) ||
    (isOceanDefault && base.interactionTool.projectileEffect === 'bullet-trail' && base.interactionTool.type === 'fishing-rod') ||
    (!isOceanDefault && base.interactionTool.projectileEffect === 'fishing-line' && base.interactionTool.type === 'pistol')
  ) {
    base.interactionTool.projectileEffect = defaultThemeConfig.interactionTool.projectileEffect;
  }
  if (typeof base.interactionTool.size !== 'number' || base.interactionTool.size <= 0) {
    base.interactionTool.size = defaultThemeConfig.interactionTool.size;
  }
  if (typeof base.interactionTool.recoilAngleDeg !== 'number' || !Number.isFinite(base.interactionTool.recoilAngleDeg)) {
    base.interactionTool.recoilAngleDeg = defaultThemeConfig.interactionTool.recoilAngleDeg;
  }
  if (typeof base.interactionTool.projectileSpeedMs !== 'number' || base.interactionTool.projectileSpeedMs <= 0) {
    base.interactionTool.projectileSpeedMs = defaultThemeConfig.interactionTool.projectileSpeedMs || 160;
  }

  base.playArea = {
    ...defaultThemeConfig.playArea,
    ...(raw.playArea && typeof raw.playArea === 'object' ? raw.playArea : {}),
  };

  return base;
}

/**
 * Resolves the effective runtime RandomTargetGameConfig from `activeTheme` and `propConfig`.
 * Ensures `activeTheme.game_config` is prioritized over a generic `DEFAULT_DESERT_CONFIG` passed via `propConfig`,
 * and that Ocean Treasure Hunt never inherits Desert Quick Draw default assets (or vice versa).
 */
export function resolveEffectiveRandomTargetConfig(
  activeTheme?: any,
  propConfig?: Partial<RandomTargetGameConfig> | null
): RandomTargetGameConfig {
  const themeType = resolveRandomTargetThemeType(activeTheme, propConfig);
  const baseDefault =
    themeType === 'ocean-treasure-hunt' ? DEFAULT_OCEAN_CONFIG : DEFAULT_DESERT_CONFIG;

  const themeGameConfig =
    activeTheme?.game_config && typeof activeTheme.game_config === 'object'
      ? activeTheme.game_config
      : null;

  // If propConfig is the unmodified GAME_REGISTRY default (DEFAULT_DESERT_CONFIG) while activeTheme is provided,
  // do not allow propConfig to overwrite activeTheme.game_config.
  const isUnmodifiedRegistryDefaultProp =
    propConfig === DEFAULT_DESERT_CONFIG || propConfig === DEFAULT_OCEAN_CONFIG;

  const mergedRaw = isUnmodifiedRegistryDefaultProp
    ? {
        ...(propConfig || {}),
        ...(themeGameConfig || {}),
      }
    : {
        ...(themeGameConfig || {}),
        ...(propConfig || {}),
        positiveTarget: {
          ...(themeGameConfig?.positiveTarget || {}),
          ...(propConfig?.positiveTarget || {}),
        },
        negativeTarget: {
          ...(themeGameConfig?.negativeTarget || {}),
          ...(propConfig?.negativeTarget || {}),
        },
        interactionTool: {
          ...(themeGameConfig?.interactionTool || {}),
          ...(propConfig?.interactionTool || {}),
        },
        playArea: {
          ...(themeGameConfig?.playArea || {}),
          ...(propConfig?.playArea || {}),
        },
      };

  return normalizeRandomTargetConfig(mergedRaw, baseDefault);
}

/**
 * Resolves the authoritative background image URL for a Random Target theme.
 * Prevents legacy or cross-theme default backgrounds from overriding the selected theme's background,
 * while preserving legitimate user-uploaded custom backgrounds.
 */
export function resolveRandomTargetBackgroundUrl(
  activeTheme?: any,
  isOcean?: boolean
): string {
  const ocean =
    typeof isOcean === 'boolean' ? isOcean : isOceanTreasureHuntTheme(activeTheme);
  const canonicalBg = ocean
    ? '/assets/games/random-target/themes/ocean-treasure-hunt/background.png'
    : '/assets/games/random-target/themes/desert-quick-draw/background.png';

  const rawBg = activeTheme?.background_url || activeTheme?.background;
  if (!rawBg || typeof rawBg !== 'string' || !rawBg.trim()) {
    return canonicalBg;
  }

  const trimmed = rawBg.trim();
  const lower = trimmed.toLowerCase();

  if (
    isLegacyRandomTargetAssetUrl(trimmed) ||
    lower.includes('/catch-brand/') ||
    lower.includes('/memory-match/') ||
    lower.includes('/reaction-tap/') ||
    lower.includes('/match-3/') ||
    (ocean && isDefaultDesertAssetUrl(trimmed)) ||
    (!ocean && isDefaultOceanAssetUrl(trimmed))
  ) {
    return canonicalBg;
  }

  return trimmed;
}

