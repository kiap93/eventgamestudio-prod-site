import type { MemoryMatchGameConfig } from '../games/memory-match/types';

export interface ThemeBrandingConfig {

  gameTitle: string;
  subtitle?: string;
  logoUrl?: string | null;
  clientLogoUrl?: string | null;
}

export interface ThemeDropItem {
  id: string;
  name: string;
  imageUrl?: string | null;
  points: number;
  speedMultiplier: number;
  spawnWeight: number; // 1 - 100 relative weight
  enabled: boolean;
  isHazard: boolean;
  isBonus?: boolean;
  collisionRadiusRatio?: number;
  collisionCenterXRatio?: number;
  collisionCenterYRatio?: number;
}

export interface ThemeBasketConfig {
  name: string;
  imageUrl?: string | null;
  width: number;
  height: number;
  catchAreaRatio: number;
  speed: number;
  collisionWidthRatio?: number;
  collisionHeightRatio?: number;
  collisionOffsetYRatio?: number;
}

export interface ThemeDifficultyStage {
  timeThreshold: number; // seconds elapsed
  spawnInterval: number; // ms
  speedMin: number;
  speedMax: number;
  hazardRatio: number; // 0.0 to 1.0
  bonusRatio: number; // 0.0 to 1.0
  stageName: string;
}

export interface ThemePhysicsConfig {
  gameDurationSeconds: number;
  baseFallSpeed: number;
  fallSpeedMultiplier: number;
  spawnIntervalMin: number;
  spawnIntervalMax: number;
  difficultyStages: ThemeDifficultyStage[];
}

export interface ThemeVisualsConfig {
  particleGood?: string;
  particleBad?: string;
  particleBonus?: string;
  primary?: string;
  secondary?: string;
  accent?: string;
  hudColor?: string;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  textColor?: string;
  cardBackUrl?: string | null;
  cardFrontBg?: string;
  cardGoodBg?: string;
  cardGoodBorder?: string;
  cardBadBg?: string;
  cardBadBorder?: string;
  bgGradientFrom?: string;
  bgGradientVia?: string;
  bgGradientTo?: string;
}

export interface ThemeSoundsConfig {
  catchGood?: string | null;
  catchBad?: string | null;
  catchBonus?: string | null;
  gameStart?: string | null;
  gameOver?: string | null;
  bgm?: string | null;
  catchGoodUrl?: string | null;
  catchBadUrl?: string | null;
  catchBonusUrl?: string | null;
  gameStartUrl?: string | null;
  gameOverUrl?: string | null;
  bgmUrl?: string | null;
  soundVolume?: number;
  soundEnabled?: boolean;
  bgmEnabled?: boolean;
  bgmMelody?: 'arcade' | 'festive_chime' | 'cny_pentatonic' | 'spooky_synth';
  goodCatchPitch?: 'high_ping' | 'festive_bell' | 'gong' | 'plop';
  hazardTone?: 'low_buzz' | 'spooky_screech' | 'firecracker_pop';
}

export interface GameLayoutElement {
  visible: boolean;
  x: number; // percentage from left (0 to 100)
  y: number; // percentage from top (0 to 100)
  width?: number; // percentage of game width (0 to 100)
  height?: number; // percentage of game height (0 to 100)
}

export interface GameLayoutConfig {
  clientLogo: GameLayoutElement;
  scoreHud: GameLayoutElement;
  timer: GameLayoutElement;
  gameTitle: GameLayoutElement;
  footerSponsor: GameLayoutElement;
  [key: string]: GameLayoutElement | undefined;
}

/**
 * Single Source of Truth for a Game Theme
 */
export interface GameTheme {
  id: string;
  organization_id?: string;
  game_id?: string | null;
  game_name?: string;
  game_slug?: string;
  game_type?: string;
  name: string;
  slug: string;
  base_theme_id?: string;
  description?: string | null;
  status: 'active' | 'archived' | 'draft';
  is_default?: boolean;
  is_system?: boolean;
  ownership_type?: 'system' | 'organization';

  // Configuration groups
  branding: ThemeBrandingConfig;
  background_url: string;
  basket_config: ThemeBasketConfig | null;
  items_config: ThemeDropItem[];
  physics_config: ThemePhysicsConfig;
  visuals_config: ThemeVisualsConfig;
  sounds_config: ThemeSoundsConfig;
  layout?: GameLayoutConfig;
  game_config?: Record<string, any>;

  // Convenience / Backward-compatibility properties
  gameTitle?: string;
  subtitle?: string;
  background?: string;
  catcher?: string;
  catcherName?: string;
  fallingObject?: string;
  fallingObjectName?: string;
  badFallingObject?: string;
  badFallingObjectName?: string;
  bonusFallingObject?: string;
  bonusFallingObjectName?: string;
  logo?: string;
  clientLogo?: string;
  colors?: ThemeVisualsConfig;
  sounds?: ThemeSoundsConfig;
  particles?: {
    good?: string;
    bad?: string;
    bonus?: string;
  };
}

/**
 * Resolves the true game_type of a theme.
 * The theme itself is the primary source of truth for its game type.
 */
export function getThemeGameType(theme?: Partial<GameTheme> | null, fallbackGameType?: string): string {
  if (!theme) return fallbackGameType || 'catch-brand';
  if (theme.game_type) return theme.game_type;
  if (theme.game_slug) return theme.game_slug;
  if (
    theme.base_theme_id === 'memory-carnival' ||
    theme.base_theme_id === 'memory-match' ||
    theme.id === 'memory-carnival' ||
    theme.id === 'memory-match' ||
    theme.slug?.includes('memory') ||
    (theme.name && theme.name.toLowerCase().includes('memory'))
  ) {
    return 'memory-match';
  }
  return fallbackGameType || 'catch-brand';
}

/**
 * Checks if a theme belongs to Memory Match.
 */
export function isMemoryMatchTheme(theme?: Partial<GameTheme> | null, fallbackGameType?: string): boolean {
  return getThemeGameType(theme, fallbackGameType) === 'memory-match';
}

export const DEFAULT_MEMORY_MATCH_CONFIG: MemoryMatchGameConfig = {
  cardBackUrl: null,
  pairs: [
    { id: 'pair_diamond', name: 'Diamond', imageUrl: null, points: 100, iconName: 'Sparkles', color: '#6366f1', bgColor: 'rgba(99, 102, 241, 0.15)', borderColor: '#6366f1' },
    { id: 'pair_crown', name: 'Crown', imageUrl: null, points: 100, iconName: 'Award', color: '#eab308', bgColor: 'rgba(234, 179, 8, 0.15)', borderColor: '#eab308' },
    { id: 'pair_star', name: 'Star', imageUrl: null, points: 100, iconName: 'Star', color: '#f59e0b', bgColor: 'rgba(245, 158, 11, 0.15)', borderColor: '#f59e0b' },
    { id: 'pair_heart', name: 'Heart', imageUrl: null, points: 100, iconName: 'Gift', color: '#ec4899', bgColor: 'rgba(236, 72, 153, 0.15)', borderColor: '#ec4899' },
    { id: 'pair_lightning', name: 'Lightning', imageUrl: null, points: 100, iconName: 'Zap', color: '#38bdf8', bgColor: 'rgba(56, 189, 248, 0.15)', borderColor: '#38bdf8' },
    { id: 'pair_shield', name: 'Shield', imageUrl: null, points: 100, iconName: 'Medal', color: '#10b981', bgColor: 'rgba(16, 185, 129, 0.15)', borderColor: '#10b981' },
    { id: 'pair_trophy', name: 'Trophy', imageUrl: null, points: 100, iconName: 'Trophy', color: '#a855f7', bgColor: 'rgba(168, 85, 247, 0.15)', borderColor: '#a855f7' },
    { id: 'pair_rocket', name: 'Rocket', imageUrl: null, points: 100, iconName: 'Flame', color: '#f97316', bgColor: 'rgba(249, 115, 22, 0.15)', borderColor: '#f97316' },
  ],
  grid: {
    rows: 4,
    cols: 4,
  },
  gameplay: {
    gameDurationSeconds: 45,
    mismatchDelayMs: 850,
    matchPoints: 100,
    comboPoints: 30,
  },
};

/**
 * Resolves the authoritative MemoryMatchGameConfig from theme.game_config,
 * with safe fallback to legacy fields (items_config, visuals_config, physics_config)
 * ONLY if game_config is missing or empty.
 */
export function getMemoryMatchConfig(theme?: Partial<GameTheme> | null): MemoryMatchGameConfig {
  const gc = theme?.game_config as Partial<MemoryMatchGameConfig> | undefined;

  const hasGameConfig =
    gc &&
    typeof gc === 'object' &&
    (Array.isArray(gc.pairs) || gc.gameplay !== undefined || gc.cardBackUrl !== undefined);

  if (hasGameConfig) {
    return {
      cardBackUrl: gc.cardBackUrl !== undefined ? gc.cardBackUrl : (theme?.visuals_config?.cardBackUrl || null),
      pairs: Array.isArray(gc.pairs) && gc.pairs.length > 0
        ? gc.pairs
        : DEFAULT_MEMORY_MATCH_CONFIG.pairs,
      grid: {
        rows: gc.grid?.rows ?? 4,
        cols: gc.grid?.cols ?? 4,
      },
      gameplay: {
        gameDurationSeconds: gc.gameplay?.gameDurationSeconds ?? theme?.physics_config?.gameDurationSeconds ?? 45,
        mismatchDelayMs: gc.gameplay?.mismatchDelayMs ?? theme?.physics_config?.spawnIntervalMin ?? 850,
        matchPoints: gc.gameplay?.matchPoints ?? 100,
        comboPoints: gc.gameplay?.comboPoints ?? 30,
      },
    };
  }

  // Legacy fallback: convert from items_config, visuals_config, physics_config
  const legacyPairs = theme?.items_config && theme.items_config.length > 0
    ? theme.items_config.slice(0, 8).map((item, idx) => ({
        id: item.id || `pair_${idx + 1}`,
        name: item.name || `Card Pair ${idx + 1}`,
        imageUrl: item.imageUrl || null,
        points: item.points || 100,
        iconName: item.isBonus ? 'Star' : item.isHazard ? 'Flame' : 'Sparkles',
        color: item.isBonus ? '#eab308' : item.isHazard ? '#f43f5e' : '#6366f1',
        bgColor: item.isBonus ? 'rgba(234, 179, 8, 0.15)' : item.isHazard ? 'rgba(244, 63, 94, 0.15)' : 'rgba(99, 102, 241, 0.15)',
        borderColor: item.isBonus ? '#eab308' : item.isHazard ? '#f43f5e' : '#6366f1',
      }))
    : DEFAULT_MEMORY_MATCH_CONFIG.pairs;

  return {
    cardBackUrl: theme?.visuals_config?.cardBackUrl || null,
    pairs: legacyPairs,
    grid: {
      rows: 4,
      cols: 4,
    },
    gameplay: {
      gameDurationSeconds: theme?.physics_config?.gameDurationSeconds ?? 45,
      mismatchDelayMs: theme?.physics_config?.spawnIntervalMin ?? 850,
      matchPoints: 100,
      comboPoints: 30,
    },
  };
}

