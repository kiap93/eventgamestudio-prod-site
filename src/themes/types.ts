import type {
  MemoryMatchGameConfig,
  MemoryMatchBoardConfig,
  MemoryMatchCardConfig,
  MemoryMatchLayoutMode,
  ScreenBackgroundType,
  MemoryMatchStartScreenConfig,
  MemoryMatchResultScreenConfig,
  MemoryMatchScreensConfig,
  ResultScreenElementType,
  ResultScreenBaseElement,
  ResultCardStyle,
  ResultCardElement,
  ResultImageElement,
  ResultTextStyle,
  ResultTextElement,
  ResultStatStyle,
  ResultScoreElement,
  ResultMovesElement,
  ResultPairsElement,
  ResultTimeElement,
  ResultAccuracyElement,
  ResultButtonStyle,
  ResultButtonElement,
  ResultLeaderboardStyle,
  ResultLeaderboardElement,
  ResultGroupElement,
  ResultScreenElement,
  ResultScreenCanvasConfig,
  ResultScreenBackgroundConfig,
} from '../games/memory-match/types';

import {
  generateDefaultResultScreenElements,
  DEFAULT_RESULT_CANVAS_CONFIG,
  generateDefaultStartScreenElements,
  DEFAULT_START_CANVAS_CONFIG,
  MIN_BOARD_ROWS,
  MAX_BOARD_ROWS,
  MIN_BOARD_COLS,
  MAX_BOARD_COLS,
} from '../games/memory-match/types';

export type {
  ScreenBackgroundType,
  MemoryMatchStartScreenConfig,
  MemoryMatchResultScreenConfig,
  MemoryMatchScreensConfig,
  ResultScreenElementType,
  ResultScreenBaseElement,
  ResultCardStyle,
  ResultCardElement,
  ResultImageElement,
  ResultTextStyle,
  ResultTextElement,
  ResultStatStyle,
  ResultScoreElement,
  ResultMovesElement,
  ResultPairsElement,
  ResultTimeElement,
  ResultAccuracyElement,
  ResultButtonStyle,
  ResultButtonElement,
  ResultLeaderboardStyle,
  ResultLeaderboardElement,
  ResultGroupElement,
  ResultScreenElement,
  ResultScreenCanvasConfig,
  ResultScreenBackgroundConfig,
};

export {
  generateDefaultResultScreenElements,
  DEFAULT_RESULT_CANVAS_CONFIG,
};

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
  scale?: number; // Optional scale factor (e.g. 1.0, 1.5, 0.5) preserving aspect ratio
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
  cardFrontBgOpacity?: number;
  cardGoodBg?: string;
  cardGoodBgOpacity?: number;
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

export type GameOrientation = 'auto' | 'portrait' | 'landscape';

export interface GameLayoutElement {
  visible: boolean;
  x: number; // percentage from left (0 to 100)
  y: number; // percentage from top (0 to 100)
  width?: number; // percentage of game width (0 to 100)
  height?: number; // percentage of game height (0 to 100)
}

export interface GameLayoutConfig {
  orientation?: GameOrientation;
  position?: 'left' | 'center' | 'right' | string;
  contentAlignment?: 'left' | 'center' | 'right' | string;
  horizontalAlignment?: 'left' | 'center' | 'right' | string;
  verticalAlignment?: 'top' | 'center' | 'bottom' | string;
  clientLogo: GameLayoutElement;
  scoreHud: GameLayoutElement;
  timer: GameLayoutElement;
  gameTitle: GameLayoutElement;
  footerSponsor: GameLayoutElement;
  movesHud?: GameLayoutElement;
  pairsHud?: GameLayoutElement;
  memoryCardBoard?: GameLayoutElement;
  portraitLayout?: Partial<GameLayoutConfig>;
  [key: string]: any;
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
  asset_theme_id?: string;
  description?: string | null;
  status: 'active' | 'archived' | 'draft';
  is_default?: boolean;
  is_system?: boolean;
  is_system_theme?: boolean;
  ownership_type?: 'system' | 'organization';

  // Configuration groups
  branding: ThemeBrandingConfig;
  background_url: string;
  basket_config: ThemeBasketConfig | null;
  /**
   * @deprecated For Memory Match, game_config.pairs is the sole authoritative source of truth.
   * items_config is retained only as a legacy mirror to preserve schema compatibility with older readers.
   */
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

import { isUUID } from './gameAssetResolver';
export { isUUID };

/**
 * Attempts to normalize a candidate game type or alias to a canonical GameTypeId.
 * Returns null if the candidate is empty, a UUID, or unrecognized.
 */
export function tryNormalizeGameType(gameType?: string | null): string | null {
  if (!gameType || typeof gameType !== 'string') return null;
  const clean = gameType.trim().toLowerCase();
  if (
    clean === 'random-target' ||
    clean === 'random_target' ||
    clean === 'randomtarget' ||
    clean === 'random-target-arcade' ||
    clean === 'target-arcade' ||
    clean === 'desert-quick-draw' ||
    clean === 'ocean-treasure-hunt' ||
    clean === 'quick-draw' ||
    clean === 'treasure-hunt' ||
    clean.includes('random-target') ||
    clean.includes('quick-draw') ||
    clean.includes('treasure-hunt')
  ) {
    return 'random-target';
  }
  if (
    clean === 'match-3' ||
    clean === 'match3' ||
    clean === 'match_3' ||
    clean === 'match 3' ||
    clean === 'cascade' ||
    clean.startsWith('match-3') ||
    clean.startsWith('match3') ||
    clean.includes('match-3') ||
    clean.includes('match3') ||
    clean.includes('match 3') ||
    clean.includes('cascade')
  ) {
    return 'match-3';
  }
  if (
    clean === 'reaction-tap' ||
    clean === 'reaction-time' ||
    clean === 'reaction_tap' ||
    clean === 'reaction' ||
    clean === 'reflex' ||
    clean.includes('reaction') ||
    clean.includes('reflex')
  ) {
    return 'reaction-tap';
  }
  if (
    clean === 'memory-match' ||
    clean === 'memory_match' ||
    clean === 'memory-carnival' ||
    clean === 'memory' ||
    (clean.includes('memory') && !clean.includes('3'))
  ) {
    return 'memory-match';
  }
  if (
    clean === 'speed-quiz' ||
    clean === 'speed_quiz' ||
    clean.includes('quiz') ||
    clean.includes('trivia')
  ) {
    return 'speed-quiz';
  }
  if (
    clean === 'catch-brand' ||
    clean === 'catch_brand' ||
    clean === 'catch-the-brand' ||
    clean === 'catch' ||
    clean === 'catcher' ||
    clean === 'durian' ||
    clean.includes('catch-brand') ||
    clean.includes('catch_brand') ||
    clean.includes('catch-the-brand')
  ) {
    return 'catch-brand';
  }
  return null;
}

/**
 * Maps game type aliases (e.g. 'match3' -> 'match-3', 'reaction-time' -> 'reaction-tap')
 */
export function normalizeGameType(gameType?: string | null, fallback: string = 'catch-brand'): string {
  const norm = tryNormalizeGameType(gameType);
  if (norm) return norm;
  return fallback;
}

export interface AuthoritativeGameTypeContext {
  /** Active game record or nested game object */
  game?: {
    id?: string | null;
    game_type?: string | null;
    slug?: string | null;
    name?: string | null;
    game_type_id?: string | null;
    [key: string]: any;
  } | null;
  /** Active event record or event preview/public DTO */
  event?: {
    id?: string | null;
    game_type?: string | null;
    slug?: string | null;
    name?: string | null;
    game?: any;
    game_theme?: any;
    theme?: any;
    [key: string]: any;
  } | null;
  /** Explicit game type supplied to the game shell or caller */
  shellGameType?: string | null;
  /** Explicit game type parameter */
  gameType?: string | null;
  /** Explicit slug */
  slug?: string | null;
  /** Explicit game type ID */
  gameTypeId?: string | null;
  /** Theme object */
  theme?: Partial<GameTheme> | null;
  /** Game name, event name, or title */
  name?: string | null;
  /** Fallback */
  fallback?: string;
}

/**
 * Strictly checks if a theme genuinely declares or possesses identifiable Catch The Brand properties.
 * Prevents generic custom themes with no distinctive assets from prematurely claiming catch-brand.
 */
export function isIdentifiableCatcherTheme(theme?: Partial<GameTheme> | null): boolean {
  if (!theme) return false;
  const baseThemeId = String(theme.base_theme_id || '').toLowerCase();
  const themeId = String(theme.id || '').toLowerCase();
  const themeSlug = String(theme.slug || '').toLowerCase();
  const themeName = String(theme.name || '').toLowerCase();

  if (
    theme.game_type === 'catch-brand' ||
    theme.game_slug === 'catch-brand' ||
    baseThemeId === 'catch-brand' ||
    baseThemeId === 'durian' ||
    baseThemeId === 'carnival' ||
    baseThemeId === 'christmas' ||
    baseThemeId === 'cny' ||
    baseThemeId === 'halloween' ||
    baseThemeId === 'mango' ||
    themeId === 'catch-brand' ||
    themeId === 'durian' ||
    themeId === 'carnival' ||
    themeId === 'christmas' ||
    themeId === 'cny' ||
    themeId === 'halloween' ||
    themeId === 'mango' ||
    themeSlug.includes('catch') ||
    themeSlug.includes('basket') ||
    themeSlug.includes('durian') ||
    themeName.includes('catch the brand') ||
    themeName.includes('durian')
  ) {
    return true;
  }

  // Structural Catch-The-Brand properties
  if (
    theme.basket_config !== undefined &&
    theme.basket_config !== null &&
    (theme.basket_config.width > 0 || Boolean(theme.basket_config.name))
  ) {
    return true;
  }
  if (Array.isArray(theme.items_config) && theme.items_config.length > 0) {
    return true;
  }
  if (Array.isArray((theme as any).drop_items) && (theme as any).drop_items.length > 0) {
    return true;
  }
  if ((theme as any).theme_assets?.basket || (theme as any).theme_assets?.good_item) {
    return true;
  }

  return false;
}

/**
 * Authoritative Canonical Game Type Resolver.
 * Follows strict precedence:
 * 1. Explicit, valid game type from the active game/event record.
 * 2. Explicit game type supplied to the game shell.
 * 3. Other reliable game identifiers, including game type ID and slug.
 * 4. Theme game type when the active game type is genuinely unavailable.
 * 5. Existing name/ID heuristics where appropriate.
 * 6. 'catch-brand' only as the final fallback for genuinely unknown games.
 */
export function resolveAuthoritativeGameType(
  contextOrGameType?: string | AuthoritativeGameTypeContext | null,
  fallback: string = 'catch-brand'
): string {
  if (!contextOrGameType) {
    return fallback;
  }

  if (typeof contextOrGameType === 'string') {
    return normalizeGameType(contextOrGameType, fallback);
  }

  const ctx = contextOrGameType;
  const defaultFallback = ctx.fallback || fallback || 'catch-brand';

  // 1. Explicit shellGameType or explicit gameType specified directly by caller
  const explicitCandidates = [
    ctx.shellGameType,
    ctx.gameType,
  ];
  for (const candidate of explicitCandidates) {
    const norm = tryNormalizeGameType(candidate);
    if (norm) {
      return norm;
    }
  }

  // 2. Event-bound game type (authoritative for live / preview events)
  const eventCandidates = [
    ctx.event?.game?.game_type,
    ctx.event?.game_type,
    ctx.event?.game?.slug,
    ctx.event?.slug,
  ];
  for (const candidate of eventCandidates) {
    const norm = tryNormalizeGameType(candidate);
    if (norm) {
      return norm;
    }
  }

  // 3. Authoritative game record
  const gameCandidates = [
    ctx.game?.game_type,
    ctx.game?.game_type_id,
    ctx.game?.slug,
    ctx.game?.id,
    ctx.gameTypeId,
    ctx.slug,
  ];
  for (const candidate of gameCandidates) {
    const norm = tryNormalizeGameType(candidate);
    if (norm) {
      return norm;
    }
  }

  // 4. Theme game type when the active game type is genuinely unavailable
  const themeCandidate = ctx.theme || ctx.event?.game_theme || ctx.event?.theme;
  if (themeCandidate) {
    const themeGameType = getThemeGameType(themeCandidate);
    if (themeGameType && themeGameType !== 'catch-brand') {
      return themeGameType;
    }
    // Only claim catch-brand if the theme genuinely has Catch-The-Brand identifiers
    if (themeGameType === 'catch-brand' && isIdentifiableCatcherTheme(themeCandidate)) {
      return 'catch-brand';
    }
  }

  // 5. Existing name/ID heuristics where appropriate
  const nameCandidates = [
    ctx.game?.name,
    ctx.event?.name,
    ctx.name,
    themeCandidate?.name,
    themeCandidate?.branding?.gameTitle,
  ];
  for (const name of nameCandidates) {
    if (name && typeof name === 'string') {
      const lower = name.toLowerCase();
      if (
        lower.includes('random target') ||
        lower.includes('target arcade') ||
        lower.includes('quick draw') ||
        lower.includes('treasure hunt')
      ) {
        return 'random-target';
      }
      if (
        lower.includes('match-3') ||
        lower.includes('match 3') ||
        lower.includes('match3') ||
        lower.includes('cascade')
      ) {
        return 'match-3';
      }
      if (lower.includes('reaction') || lower.includes('reflex')) {
        return 'reaction-tap';
      }
      if (lower.includes('memory')) {
        return 'memory-match';
      }
      if (lower.includes('quiz') || lower.includes('trivia')) {
        return 'speed-quiz';
      }
      if (lower.includes('catch') || lower.includes('catcher') || lower.includes('durian') || lower.includes('basket')) {
        return 'catch-brand';
      }
    }
  }

  // 6. catch-brand only as the final fallback for genuinely unknown games
  return defaultFallback;
}

/**
 * Resolves the true game_type of a theme.
 * The theme itself is the primary source of truth for its game type.
 */
export function getThemeGameType(theme?: Partial<GameTheme> | null, fallbackGameType?: string): string {
  if (!theme) return normalizeGameType(fallbackGameType || 'catch-brand');

  // Check tileDefinitions or Match-3 distinctive properties in game_config FIRST (strictly unique to Match-3)
  const gc = theme.game_config as any;
  if (
    gc &&
    (Array.isArray(gc.tileDefinitions) ||
      gc.match3Config ||
      gc.minimumMatch !== undefined ||
      gc.cascadeEnabled !== undefined ||
      gc.specialTilesEnabled !== undefined ||
      gc.tileTypesCount !== undefined ||
      (gc.rows !== undefined && gc.cols !== undefined && (gc.rows >= 3 || gc.cols >= 3)) ||
      gc.scoring?.match3Points !== undefined ||
      gc.scoring?.rocketPoints !== undefined ||
      gc.screens?.start?.gameType === 'match-3' ||
      gc.screens?.result?.gameType === 'match-3')
  ) {
    return 'match-3';
  }
  if (
    gc &&
    (gc.randomTargetConfig ||
      gc.positiveTarget ||
      gc.negativeTarget ||
      gc.interactionTool ||
      gc.screens?.start?.gameType === 'random-target' ||
      gc.screens?.result?.gameType === 'random-target')
  ) {
    return 'random-target';
  }
  if (gc && (gc.cardPairs || gc.memoryConfig || gc.screens?.start?.gameType === 'memory-match' || gc.screens?.result?.gameType === 'memory-match')) {
    return 'memory-match';
  }
  if (gc && (gc.reactionConfig || gc.lightsCount !== undefined || gc.screens?.start?.gameType === 'reaction-tap' || gc.screens?.start?.gameType === 'reaction-time')) {
    return 'reaction-tap';
  }

  // Check game_id only if not a UUID
  const rawGameId = String(theme.game_id || '').toLowerCase().trim();
  if (rawGameId && !isUUID(rawGameId)) {
    const normGameId = tryNormalizeGameType(rawGameId);
    if (normGameId) {
      return normGameId;
    }
  }

  const baseThemeId = String(theme.base_theme_id || '').toLowerCase();
  const themeId = String(theme.id || '').toLowerCase();
  const themeSlug = String(theme.slug || '').toLowerCase();
  const themeName = String(theme.name || '').toLowerCase();
  const brandingTitle = String(theme.branding?.gameTitle || '').toLowerCase();

  if (
    baseThemeId === 'match-3' ||
    baseThemeId === 'match3' ||
    themeId === 'match-3' ||
    themeId === 'match3' ||
    themeSlug === 'match-3' ||
    themeSlug.includes('match-3') ||
    themeSlug.includes('match3') ||
    themeName.includes('match-3') ||
    themeName.includes('match 3') ||
    themeName.includes('match3') ||
    themeName.includes('cascade') ||
    brandingTitle.includes('match-3') ||
    brandingTitle.includes('match 3') ||
    brandingTitle.includes('match3') ||
    brandingTitle.includes('cascade')
  ) {
    return 'match-3';
  }

  if (
    baseThemeId === 'reaction-time' ||
    baseThemeId === 'reaction-tap' ||
    themeId === 'reaction-time' ||
    themeId === 'reaction-tap' ||
    themeSlug.includes('reaction') ||
    themeSlug.includes('reflex') ||
    themeName.includes('reaction') ||
    themeName.includes('reflex')
  ) {
    return 'reaction-tap';
  }
  if (
    baseThemeId === 'memory-carnival' ||
    baseThemeId === 'memory-match' ||
    themeId === 'memory-carnival' ||
    themeId === 'memory-match' ||
    themeSlug.includes('memory') ||
    themeName.includes('memory')
  ) {
    return 'memory-match';
  }
  if (
    baseThemeId === 'random-target' ||
    baseThemeId === 'desert-quick-draw' ||
    baseThemeId === 'ocean-treasure-hunt' ||
    themeId === 'random-target' ||
    themeId === 'desert-quick-draw' ||
    themeId === 'ocean-treasure-hunt' ||
    themeSlug.includes('random-target') ||
    themeSlug.includes('quick-draw') ||
    themeSlug.includes('treasure-hunt') ||
    themeName.includes('random target') ||
    themeName.includes('quick draw') ||
    themeName.includes('treasure hunt') ||
    brandingTitle.includes('random target') ||
    brandingTitle.includes('quick draw') ||
    brandingTitle.includes('treasure hunt')
  ) {
    return 'random-target';
  }

  // Check explicit properties on theme object next, prioritizing non-catch-brand candidates
  const explicitCandidates = [
    theme.game_type,
    theme.game_slug,
    (theme as any).game_type_id,
    (theme as any).game?.game_type,
    (theme as any).game?.slug,
    (theme as any).games?.game_type,
    (theme as any).games?.slug,
  ];

  for (const c of explicitCandidates) {
    const norm = tryNormalizeGameType(c);
    if (norm && norm !== 'catch-brand') {
      return norm;
    }
  }
  for (const c of explicitCandidates) {
    const norm = tryNormalizeGameType(c);
    if (norm) {
      return norm;
    }
  }

  // If a non-catch-brand fallback was explicitly provided (e.g. from container or event context), respect it
  if (fallbackGameType) {
    const normFallback = tryNormalizeGameType(fallbackGameType);
    if (normFallback && normFallback !== 'catch-brand') {
      return normFallback;
    }
  }

  if (
    themeSlug.includes('catch') ||
    themeSlug.includes('basket') ||
    themeSlug.includes('durian') ||
    themeName.includes('catch') ||
    themeName.includes('catcher')
  ) {
    return 'catch-brand';
  }
  return normalizeGameType(fallbackGameType || 'catch-brand');
}

/**
 * Checks if a theme belongs to Random Target Arcade.
 */
export function isRandomTargetTheme(theme?: Partial<GameTheme> | null, fallbackGameType?: string): boolean {
  return getThemeGameType(theme, fallbackGameType) === 'random-target';
}

/**
 * Checks if a theme belongs to Match-3.
 */
export function isMatch3Theme(theme?: Partial<GameTheme> | null, fallbackGameType?: string): boolean {
  return getThemeGameType(theme, fallbackGameType) === 'match-3';
}

/**
 * Checks if a theme belongs to Reaction Game.
 */
export function isReactionTheme(theme?: Partial<GameTheme> | null, fallbackGameType?: string): boolean {
  const gt = getThemeGameType(theme, fallbackGameType);
  return gt === 'reaction-tap' || gt === 'reaction-time';
}

/**
 * Checks if a theme belongs to Memory Match.
 */
export function isMemoryMatchTheme(theme?: Partial<GameTheme> | null, fallbackGameType?: string): boolean {
  return getThemeGameType(theme, fallbackGameType) === 'memory-match';
}

/**
 * Checks if a theme belongs to a game with a catcher/basket (e.g. Catch The Brand).
 */
export function isCatcherGameTheme(theme?: Partial<GameTheme> | null, fallbackGameType?: string): boolean {
  const gt = getThemeGameType(theme, fallbackGameType);
  return gt === 'catch-brand' || gt === 'catch-the-brand';
}

export const DEFAULT_CARD_CONFIG: MemoryMatchCardConfig = {
  width: 120,
  height: 120,
  borderRadius: 16,
  rotationMode: 'none',
  rotation: 0,
  rotationRange: 8,
};

export const DEFAULT_START_SCREEN_CONFIG: MemoryMatchStartScreenConfig = {
  backgroundType: 'theme',
  backgroundColor: '#0f172a',
  backgroundImageUrl: null,
  backgroundOverlayOpacity: 0.3,

  showIcon: true,
  showGridInfo: true,
  showPairsInfo: true,
  showTimerInfo: true,

  canvas: DEFAULT_START_CANVAS_CONFIG,
  background: {
    type: 'theme',
    imageUrl: null,
    color: '#0f172a',
    overlayOpacity: 0.3,
  },
  elements: [],
};

export const DEFAULT_RESULT_SCREEN_CONFIG: MemoryMatchResultScreenConfig = {
  backgroundType: 'theme',
  backgroundColor: '#0f172a',
  backgroundImageUrl: null,
  backgroundOverlayOpacity: 0.3,

  showScore: true,
  showMoves: true,
  showPairs: true,
  showAccuracy: true,

  canvas: DEFAULT_RESULT_CANVAS_CONFIG,
  background: {
    type: 'theme',
    imageUrl: null,
    color: '#0f172a',
    overlayOpacity: 0.3,
  },
  elements: generateDefaultResultScreenElements({
    showScore: true,
    showMoves: true,
    showPairs: true,
    showAccuracy: true,
  }),
};

export const DEFAULT_SCREENS_CONFIG: MemoryMatchScreensConfig = {
  start: DEFAULT_START_SCREEN_CONFIG,
  result: DEFAULT_RESULT_SCREEN_CONFIG,
};

export const DEFAULT_MEMORY_MATCH_CONFIG: MemoryMatchGameConfig = {
  cardBackUrl: '/assets/games/memory-match/themes/default/cardback.png',
  card: DEFAULT_CARD_CONFIG,
  pairs: [
    { id: 'pair_diamond', name: 'Diamond', imageUrl: '/assets/games/memory-match/themes/default/pair01.png', points: 100, iconName: 'Sparkles', color: '#6366f1', bgColor: 'rgba(99, 102, 241, 0.15)', borderColor: '#6366f1' },
    { id: 'pair_crown', name: 'Crown', imageUrl: '/assets/games/memory-match/themes/default/pair02.png', points: 100, iconName: 'Award', color: '#eab308', bgColor: 'rgba(234, 179, 8, 0.15)', borderColor: '#eab308' },
    { id: 'pair_star', name: 'Star', imageUrl: '/assets/games/memory-match/themes/default/pair03.png', points: 100, iconName: 'Star', color: '#f59e0b', bgColor: 'rgba(245, 158, 11, 0.15)', borderColor: '#f59e0b' },
    { id: 'pair_heart', name: 'Heart', imageUrl: '/assets/games/memory-match/themes/default/pair04.png', points: 100, iconName: 'Gift', color: '#ec4899', bgColor: 'rgba(236, 72, 153, 0.15)', borderColor: '#ec4899' },
    { id: 'pair_lightning', name: 'Lightning', imageUrl: '/assets/games/memory-match/themes/default/pair05.png', points: 100, iconName: 'Zap', color: '#38bdf8', bgColor: 'rgba(56, 189, 248, 0.15)', borderColor: '#38bdf8' },
    { id: 'pair_shield', name: 'Shield', imageUrl: '/assets/games/memory-match/themes/default/pair06.png', points: 100, iconName: 'Medal', color: '#10b981', bgColor: 'rgba(16, 185, 129, 0.15)', borderColor: '#10b981' },
    { id: 'pair_trophy', name: 'Trophy', imageUrl: '/assets/games/memory-match/themes/default/pair07.png', points: 100, iconName: 'Trophy', color: '#a855f7', bgColor: 'rgba(168, 85, 247, 0.15)', borderColor: '#a855f7' },
    { id: 'pair_rocket', name: 'Rocket', imageUrl: '/assets/games/memory-match/themes/default/pair08.png', points: 100, iconName: 'Flame', color: '#f97316', bgColor: 'rgba(249, 115, 22, 0.15)', borderColor: '#f97316' },
  ],
  board: {
    layoutMode: 'grid',
    rows: 4,
    cols: 4,
    cardGap: 12,
    randomLayout: {
      minSpacing: 12,
      rotationMin: -8,
      rotationMax: 8,
    },
    card: DEFAULT_CARD_CONFIG,
  },
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
  ui: {
    showLeaderboard: true,
  },
  screens: DEFAULT_SCREENS_CONFIG,
};

/**
 * Resolves the authoritative MemoryMatchGameConfig from theme.game_config,
 * with safe fallback to legacy fields (items_config, visuals_config, physics_config)
 * and backward-compatible normalization for board layout, card dimension, and screen settings.
 */
export function getMemoryMatchConfig(theme?: Partial<GameTheme> | null): MemoryMatchGameConfig {
  const gc = theme?.game_config as Partial<MemoryMatchGameConfig> | undefined;

  const hasGameConfig =
    gc &&
    typeof gc === 'object' &&
    (Array.isArray(gc.pairs) || gc.gameplay !== undefined || gc.cardBackUrl !== undefined || gc.board !== undefined || gc.grid !== undefined || gc.card !== undefined || gc.ui !== undefined || gc.screens !== undefined);

  if (hasGameConfig) {
    const rawBoard = gc.board;
    const rawGrid = gc.grid;
    const rawCard = gc.card || rawBoard?.card;
    const rawUi = gc.ui;
    const showLeaderboard = rawUi?.showLeaderboard !== undefined ? Boolean(rawUi.showLeaderboard) : true;

    const rows = Math.max(MIN_BOARD_ROWS, Math.min(MAX_BOARD_ROWS, Number(rawBoard?.rows) || Number(rawGrid?.rows) || 4));
    const cols = Math.max(MIN_BOARD_COLS, Math.min(MAX_BOARD_COLS, Number(rawBoard?.cols) || Number(rawGrid?.cols) || 4));
    const rawMode = rawBoard?.layoutMode;
    const layoutMode: MemoryMatchLayoutMode =
      rawMode === 'random' || rawMode === 'up-down' || rawMode === 'up-down-rotation'
        ? rawMode
        : 'grid';
    const cardGap = typeof rawBoard?.cardGap === 'number' ? Math.max(0, Math.min(80, rawBoard.cardGap)) : 12;

    const rawRandom = rawBoard?.randomLayout;
    const minSpacing = typeof rawRandom?.minSpacing === 'number' ? Math.max(0, Math.min(40, rawRandom.minSpacing)) : 12;
    let rotationMin = typeof rawRandom?.rotationMin === 'number' ? Math.max(-15, Math.min(0, rawRandom.rotationMin)) : -8;
    let rotationMax = typeof rawRandom?.rotationMax === 'number' ? Math.max(0, Math.min(15, rawRandom.rotationMax)) : 8;
    if (rotationMin > rotationMax) {
      [rotationMin, rotationMax] = [rotationMax, rotationMin];
    }

    // Resolve card dimensions and rotation configuration
    const cardWidth = typeof rawCard?.width === 'number' ? Math.max(50, Math.min(300, rawCard.width)) : DEFAULT_CARD_CONFIG.width;
    const cardHeight = typeof rawCard?.height === 'number' ? Math.max(50, Math.min(300, rawCard.height)) : DEFAULT_CARD_CONFIG.height;
    const cardBorderRadius = typeof rawCard?.borderRadius === 'number' ? Math.max(0, Math.min(48, rawCard.borderRadius)) : DEFAULT_CARD_CONFIG.borderRadius;
    const rotationMode = rawCard?.rotationMode === 'fixed' || rawCard?.rotationMode === 'random' || rawCard?.rotationMode === 'none'
      ? rawCard.rotationMode
      : DEFAULT_CARD_CONFIG.rotationMode;
    const cardRotation = typeof rawCard?.rotation === 'number' ? Math.max(-45, Math.min(45, rawCard.rotation)) : DEFAULT_CARD_CONFIG.rotation;
    const cardRotationRange = typeof rawCard?.rotationRange === 'number' ? Math.max(0, Math.min(30, rawCard.rotationRange)) : DEFAULT_CARD_CONFIG.rotationRange;

    const resolvedCardConfig: MemoryMatchCardConfig = {
      width: cardWidth,
      height: cardHeight,
      borderRadius: cardBorderRadius,
      rotationMode,
      rotation: cardRotation,
      rotationRange: cardRotationRange,
    };

    const resolvedBoard: MemoryMatchBoardConfig = {
      layoutMode,
      rows,
      cols,
      cardGap,
      randomLayout: {
        minSpacing,
        rotationMin,
        rotationMax,
      },
      card: resolvedCardConfig,
    };

    const rawScreens = gc.screens;
    const rawStart = rawScreens?.start;
    const rawResult = rawScreens?.result;

    const resolvedScreens: MemoryMatchScreensConfig = {
      start: {
        backgroundType: rawStart?.backgroundType === 'color' || rawStart?.backgroundType === 'image' || rawStart?.backgroundType === 'theme'
          ? rawStart.backgroundType
          : (rawStart?.background?.type || 'theme'),
        backgroundColor: (rawStart?.backgroundColor && typeof rawStart.backgroundColor === 'string')
          ? rawStart.backgroundColor
          : (rawStart?.background?.color || '#0f172a'),
        backgroundImageUrl: rawStart?.backgroundImageUrl ?? rawStart?.background?.imageUrl ?? null,
        backgroundOverlayOpacity: typeof rawStart?.backgroundOverlayOpacity === 'number'
          ? Math.max(0, Math.min(1, rawStart.backgroundOverlayOpacity))
          : typeof rawStart?.background?.overlayOpacity === 'number'
          ? Math.max(0, Math.min(1, rawStart.background.overlayOpacity))
          : 0.3,
        showIcon: rawStart?.showIcon !== false,
        showGridInfo: rawStart?.showGridInfo !== false,
        showPairsInfo: rawStart?.showPairsInfo !== false,
        showTimerInfo: rawStart?.showTimerInfo !== false,
        canvas: rawStart?.canvas?.width && rawStart?.canvas?.height
          ? { width: rawStart.canvas.width, height: rawStart.canvas.height }
          : DEFAULT_START_CANVAS_CONFIG,
        background: {
          type: rawStart?.background?.type || (rawStart?.backgroundType === 'color' || rawStart?.backgroundType === 'image' || rawStart?.backgroundType === 'theme' ? rawStart.backgroundType : 'theme'),
          imageUrl: rawStart?.background?.imageUrl ?? rawStart?.backgroundImageUrl ?? null,
          color: rawStart?.background?.color ?? rawStart?.backgroundColor ?? '#0f172a',
          overlayOpacity: typeof rawStart?.background?.overlayOpacity === 'number'
            ? Math.max(0, Math.min(1, rawStart.background.overlayOpacity))
            : typeof rawStart?.backgroundOverlayOpacity === 'number'
            ? Math.max(0, Math.min(1, rawStart.backgroundOverlayOpacity))
            : 0.3,
        },
        elements: Array.isArray(rawStart?.elements) && rawStart.elements.length > 0
          ? rawStart.elements
          : generateDefaultStartScreenElements('memory-match', theme, {
              rows,
              cols,
              totalCards: (rows * cols) % 2 === 0 ? rows * cols : rows * cols - 1,
              totalPairs: Math.floor(((rows * cols) % 2 === 0 ? rows * cols : rows * cols - 1) / 2),
              duration: typeof gc.gameplay?.gameDurationSeconds === 'number' ? gc.gameplay.gameDurationSeconds : 45,
              gameTitle: theme?.name || 'Memory Match',
              logoUrl: theme?.branding?.clientLogoUrl || (theme as any)?.clientLogo || (theme as any)?.logo || null,
            }, rawStart),
      },
      result: {
        backgroundType: rawResult?.backgroundType === 'color' || rawResult?.backgroundType === 'image' || rawResult?.backgroundType === 'theme'
          ? rawResult.backgroundType
          : (rawResult?.background?.type || 'theme'),
        backgroundColor: (rawResult?.backgroundColor && typeof rawResult.backgroundColor === 'string')
          ? rawResult.backgroundColor
          : (rawResult?.background?.color || '#0f172a'),
        backgroundImageUrl: rawResult?.backgroundImageUrl ?? rawResult?.background?.imageUrl ?? null,
        backgroundOverlayOpacity: typeof rawResult?.backgroundOverlayOpacity === 'number'
          ? Math.max(0, Math.min(1, rawResult.backgroundOverlayOpacity))
          : typeof rawResult?.background?.overlayOpacity === 'number'
          ? Math.max(0, Math.min(1, rawResult.background.overlayOpacity))
          : 0.3,
        showScore: rawResult?.showScore !== false,
        showMoves: rawResult?.showMoves !== false,
        showPairs: rawResult?.showPairs !== false,
        showAccuracy: rawResult?.showAccuracy !== false,
        canvas: rawResult?.canvas?.width && rawResult?.canvas?.height
          ? { width: rawResult.canvas.width, height: rawResult.canvas.height }
          : DEFAULT_RESULT_CANVAS_CONFIG,
        background: {
          type: rawResult?.background?.type || (rawResult?.backgroundType === 'color' || rawResult?.backgroundType === 'image' || rawResult?.backgroundType === 'theme' ? rawResult.backgroundType : 'theme'),
          imageUrl: rawResult?.background?.imageUrl ?? rawResult?.backgroundImageUrl ?? null,
          color: rawResult?.background?.color ?? rawResult?.backgroundColor ?? '#0f172a',
          overlayOpacity: typeof rawResult?.background?.overlayOpacity === 'number'
            ? Math.max(0, Math.min(1, rawResult.background.overlayOpacity))
            : typeof rawResult?.backgroundOverlayOpacity === 'number'
            ? Math.max(0, Math.min(1, rawResult.backgroundOverlayOpacity))
            : 0.3,
        },
        elements: Array.isArray(rawResult?.elements) && rawResult.elements.length > 0
          ? rawResult.elements
          : generateDefaultResultScreenElements(rawResult),
      },
    };

    return {
      cardBackUrl: gc.cardBackUrl !== undefined ? gc.cardBackUrl : (theme?.visuals_config?.cardBackUrl || null),
      card: resolvedCardConfig,
      pairs: Array.isArray(gc.pairs) && gc.pairs.length > 0
        ? gc.pairs
        : DEFAULT_MEMORY_MATCH_CONFIG.pairs,
      board: resolvedBoard,
      grid: {
        rows: resolvedBoard.rows,
        cols: resolvedBoard.cols,
      },
      gameplay: {
        gameDurationSeconds: gc.gameplay?.gameDurationSeconds ?? theme?.physics_config?.gameDurationSeconds ?? 45,
        mismatchDelayMs: gc.gameplay?.mismatchDelayMs ?? theme?.physics_config?.spawnIntervalMin ?? 850,
        matchPoints: gc.gameplay?.matchPoints ?? 100,
        comboPoints: gc.gameplay?.comboPoints ?? 30,
      },
      ui: {
        showLeaderboard,
      },
      screens: resolvedScreens,
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
    card: DEFAULT_CARD_CONFIG,
    pairs: legacyPairs,
    board: {
      layoutMode: 'grid',
      rows: 4,
      cols: 4,
      cardGap: 12,
      randomLayout: {
        minSpacing: 12,
        rotationMin: -8,
        rotationMax: 8,
      },
      card: DEFAULT_CARD_CONFIG,
    },
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
    ui: {
      showLeaderboard: true,
    },
    screens: DEFAULT_SCREENS_CONFIG,
  };
}

export const CARD_FRONT_BG_PRESETS: Array<{ name: string; hex: string }> = [
  { name: 'Navy', hex: '#0F172A' },
  { name: 'Black', hex: '#000000' },
  { name: 'White', hex: '#FFFFFF' },
  { name: 'Gold', hex: '#F59E0B' },
  { name: 'Red', hex: '#EF4444' },
  { name: 'Green', hex: '#10B981' },
  { name: 'Blue', hex: '#3B82F6' },
  { name: 'Purple', hex: '#8B5CF6' },
  { name: 'Teal', hex: '#14B8A6' },
];

/**
 * Safely computes the CSS background color for a face-up unmatched Memory Match card
 * from the theme's cardFrontBg (hex/rgb/rgba) and cardFrontBgOpacity (0 to 1).
 */
export function getCardFrontBg(
  cardFrontBg?: string | null,
  cardFrontBgOpacity?: number | null
): string {
  const defaultBg = '#0F172A';
  const defaultOpacity = 0.95;

  const rawColor = (cardFrontBg && cardFrontBg.trim() !== '') ? cardFrontBg.trim() : defaultBg;
  const opacity = typeof cardFrontBgOpacity === 'number' && !isNaN(cardFrontBgOpacity)
    ? Math.max(0, Math.min(1, cardFrontBgOpacity))
    : defaultOpacity;

  // Handle rgb / rgba string
  if (rawColor.startsWith('rgba') || rawColor.startsWith('rgb')) {
    const rgbaMatch = /^rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*[\d.]+\s*)?\)$/i.exec(rawColor);
    if (rgbaMatch) {
      return `rgba(${rgbaMatch[1]}, ${rgbaMatch[2]}, ${rgbaMatch[3]}, ${opacity})`;
    }
    return rawColor;
  }

  let hex = rawColor.startsWith('#') ? rawColor.slice(1) : rawColor;
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }

  const match = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (match) {
    const r = parseInt(match[1], 16);
    const g = parseInt(match[2], 16);
    const b = parseInt(match[3], 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }

  return rawColor;
}

export const CARD_GOOD_BG_PRESETS: Array<{ name: string; hex: string }> = [
  { name: 'Emerald', hex: '#064E3B' },
  { name: 'Forest', hex: '#052E16' },
  { name: 'Teal', hex: '#134E4A' },
  { name: 'Navy', hex: '#0F172A' },
  { name: 'Black', hex: '#000000' },
  { name: 'Gold', hex: '#78350F' },
  { name: 'Purple', hex: '#581C87' },
  { name: 'Rose', hex: '#881337' },
  { name: 'Green', hex: '#10B981' },
];

/**
 * Safely computes the CSS background color for a successfully matched Memory Match card
 * from the theme's cardGoodBg (hex/rgb/rgba) and cardGoodBgOpacity (0 to 1).
 */
export function getCardGoodBg(
  cardGoodBg?: string | null,
  cardGoodBgOpacity?: number | null
): string {
  const defaultBg = '#064E3B';
  const defaultOpacity = 0.85;

  const rawColor = (cardGoodBg && cardGoodBg.trim() !== '') ? cardGoodBg.trim() : defaultBg;
  const opacity = typeof cardGoodBgOpacity === 'number' && !isNaN(cardGoodBgOpacity)
    ? Math.max(0, Math.min(1, cardGoodBgOpacity))
    : defaultOpacity;

  // Handle rgb / rgba string
  if (rawColor.startsWith('rgba') || rawColor.startsWith('rgb')) {
    const rgbaMatch = /^rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*[\d.]+\s*)?\)$/i.exec(rawColor);
    if (rgbaMatch) {
      return `rgba(${rgbaMatch[1]}, ${rgbaMatch[2]}, ${rgbaMatch[3]}, ${opacity})`;
    }
    return rawColor;
  }

  let hex = rawColor.startsWith('#') ? rawColor.slice(1) : rawColor;
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }

  const match = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (match) {
    const r = parseInt(match[1], 16);
    const g = parseInt(match[2], 16);
    const b = parseInt(match[3], 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }

  return rawColor;
}

