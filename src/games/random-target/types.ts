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
    imageUrl: '/assets/images/bandit_target_1792994318514.jpg',
    score: 10,
    isPenalty: false,
    spawnWeight: 70,
    size: 88,
    hitEffectType: 'sparks',
  },
  negativeTarget: {
    id: 'desert-merchant',
    name: 'Town Merchant',
    imageUrl: '/assets/images/merchant_target_1792994318429.jpg',
    score: -10,
    isPenalty: true,
    spawnWeight: 30,
    size: 88,
    hitEffectType: 'dust',
  },
  interactionTool: {
    id: 'desert-pistol',
    name: 'Sheriff Revolver',
    imageUrl: '/assets/images/western_pistol_1792994340847.jpg',
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
    imageUrl: '/assets/images/treasure_target_1792994339565.jpg',
    score: 10,
    isPenalty: false,
    spawnWeight: 70,
    size: 90,
    hitEffectType: 'sparkle',
  },
  negativeTarget: {
    id: 'ocean-shark',
    name: 'Hungry Shark',
    imageUrl: '/assets/images/shark_target_1792994339948.jpg',
    score: -10,
    isPenalty: true,
    spawnWeight: 30,
    size: 92,
    hitEffectType: 'splash',
  },
  interactionTool: {
    id: 'ocean-fishing-rod',
    name: 'Angler Fishing Rod',
    imageUrl: '/assets/images/fishing_rod_1792994341884.jpg',
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

/**
 * Normalizes any existing, partial, or legacy game_config into the canonical RandomTargetGameConfig schema.
 * Transparently migrates legacy fields:
 * - `spawnIntervalInitialMs` -> `initialSpawnIntervalMs`
 * - `tool` -> `interactionTool`
 * - `targets` array -> `positiveTarget` & `negativeTarget`
 */
export function normalizeRandomTargetConfig(
  raw?: any,
  defaultThemeConfig: RandomTargetGameConfig = DEFAULT_DESERT_CONFIG
): RandomTargetGameConfig {
  if (!raw || typeof raw !== 'object') {
    return { ...defaultThemeConfig };
  }

  const base: RandomTargetGameConfig = { ...defaultThemeConfig, ...raw };

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
        size: typeof pos.size === 'number' ? pos.size : (typeof pos.scale === 'number' ? Math.round(pos.scale * 88) : 88),
      };
    }
    if (neg) {
      base.negativeTarget = {
        ...defaultThemeConfig.negativeTarget,
        ...neg,
        score: typeof neg.score === 'number' ? neg.score : (typeof neg.penalty === 'number' ? -Math.abs(neg.penalty) : -10),
        isPenalty: true,
        size: typeof neg.size === 'number' ? neg.size : (typeof neg.scale === 'number' ? Math.round(neg.scale * 88) : 88),
      };
    }
  }

  // Deep-merge positiveTarget, negativeTarget, interactionTool, and playArea with defaults
  base.positiveTarget = {
    ...defaultThemeConfig.positiveTarget,
    ...(raw.positiveTarget && typeof raw.positiveTarget === 'object' ? raw.positiveTarget : {}),
    ...(base.positiveTarget && typeof base.positiveTarget === 'object' ? base.positiveTarget : {}),
    isPenalty: false,
  };
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
  };
  if (typeof base.interactionTool.size !== 'number' || base.interactionTool.size <= 0) {
    base.interactionTool.size = defaultThemeConfig.interactionTool.size;
  }

  base.playArea = {
    ...defaultThemeConfig.playArea,
    ...(raw.playArea && typeof raw.playArea === 'object' ? raw.playArea : {}),
  };

  return base;
}
