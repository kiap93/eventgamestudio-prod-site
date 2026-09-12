/**
 * Shared Start Screen Types, Schemas, and Element Generators.
 * Supports all games: Catch The Brand, Memory Match, Reaction Tap.
 * 1000 x 1000 Logical Canvas Architecture.
 */

import { ScreenBackgroundType } from './resultScreenTypes';
import { GameTheme } from '../../themes/types';

export type { ScreenBackgroundType };

export const LANDSCAPE_START_CANVAS = {
  width: 1024,
  height: 576,
};

export const PORTRAIT_START_CANVAS = {
  width: 576,
  height: 1024,
};

export const SQUARE_START_CANVAS = {
  width: 1000,
  height: 1000,
};

export const DEFAULT_START_CANVAS_CONFIG = LANDSCAPE_START_CANVAS;

export type StartScreenElementType =
  | 'card'
  | 'text'
  | 'title'
  | 'description'
  | 'image'
  | 'button'
  | 'badge'
  | 'rules'
  | 'icon'
  | 'keyboard-hints'
  | 'group'
  | 'leaderboard';

export interface StartScreenBaseElement {
  id: string;
  type: StartScreenElementType;
  x: number; // coordinate relative to parent (ROOT or CARD/GROUP)
  y: number; // coordinate relative to parent (ROOT or CARD/GROUP)
  width: number;
  height: number;
  rotation?: number; // Rotation in degrees (default: 0)
  visible?: boolean; // Visibility toggle (default: true)
  opacity?: number; // 0 to 1 (default: 1)
  zIndex?: number; // Stacking order (default: 1)
  locked?: boolean; // Lock toggle in editor (default: false)
}

export interface StartCardStyle {
  backgroundColor?: string;
  backgroundImageUrl?: string | null;
  borderWidth?: number;
  borderColor?: string;
  borderRadius?: number;
  shadow?: boolean;
  opacity?: number;
  backdropBlur?: boolean;
}

export interface StartCardElement extends StartScreenBaseElement {
  type: 'card';
  style?: StartCardStyle;
  children?: StartScreenElement[];
}

export interface StartTextStyle {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string | number;
  fontStyle?: 'normal' | 'italic';
  color?: string;
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  lineHeight?: number;
  letterSpacing?: number;
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  textShadow?: string;
  opacity?: number;
}

export interface StartTextElement extends StartScreenBaseElement {
  type: 'text';
  text: string;
  style?: StartTextStyle;
}

export interface StartTitleElement extends StartScreenBaseElement {
  type: 'title';
  text: string;
  style?: StartTextStyle;
}

export interface StartDescriptionElement extends StartScreenBaseElement {
  type: 'description';
  text: string;
  style?: StartTextStyle;
}

export interface StartImageStyle {
  objectFit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
  borderRadius?: number;
  borderWidth?: number;
  borderColor?: string;
  shadow?: boolean;
  opacity?: number;
}

export interface StartImageElement extends StartScreenBaseElement {
  type: 'image';
  imageUrl: string | null;
  alt?: string;
  objectFit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
  style?: StartImageStyle;
}

export interface StartButtonStyle {
  backgroundColor?: string;
  textColor?: string;
  fontSize?: number;
  fontWeight?: string | number;
  borderRadius?: number;
  borderWidth?: number;
  borderColor?: string;
  shadow?: boolean;
  gradient?: boolean;
  gradientFrom?: string;
  gradientTo?: string;
  color?: string;
  pulse?: boolean;
  letterSpacing?: number;
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
}

export type StartButtonAction = 'start' | 'leaderboard' | 'guide' | 'settings' | string;

export interface StartButtonElement extends StartScreenBaseElement {
  type: 'button';
  action: StartButtonAction;
  text: string;
  icon?: string;
  iconName?: string;
  style?: StartButtonStyle;
}

export interface StartBadgeStyle {
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  labelColor?: string;
  valueColor?: string;
  fontSize?: number;
  textAlign?: string;
  layout?: 'vertical' | 'horizontal';
  gap?: number;
}

export type StartBadgeMetric = 'grid' | 'pairs' | 'timer' | 'duration' | 'rounds' | 'lights' | string;

export interface StartBadgeElement extends StartScreenBaseElement {
  type: 'badge';
  metric?: StartBadgeMetric;
  label?: string;
  value?: string;
  icon?: string;
  style?: StartBadgeStyle;
}

export interface StartRulesStyle {
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  textColor?: string;
  fontSize?: number;
  showIcons?: boolean;
}

export interface StartRulesElement extends StartScreenBaseElement {
  type: 'rules';
  ruleType?: 'catch-brand' | 'memory-match' | 'reaction-tap' | 'custom';
  gameType?: string;
  title?: string;
  description?: string;
  goodItemTitle?: string;
  goodItemSubtitle?: string;
  goodItemImg?: string | null;
  badItemTitle?: string;
  badItemSubtitle?: string;
  badItemImg?: string | null;
  style?: StartRulesStyle;
  items?: Array<{
    title: string;
    subtitle?: string;
    icon?: string;
    image?: string;
    color?: string;
  }>;
}

export interface StartIconStyle {
  iconColor?: string;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  shadow?: boolean;
}

export interface StartIconElement extends StartScreenBaseElement {
  type: 'icon';
  iconName: string;
  iconColor?: string;
  backgroundColor?: string;
  borderColor?: string;
  borderRadius?: number;
  style?: StartIconStyle;
}

export interface StartKeyboardHintsElement extends StartScreenBaseElement {
  type: 'keyboard-hints';
  text?: string;
  showKeys?: boolean;
  keys?: string[];
}

export interface StartGroupElement extends StartScreenBaseElement {
  type: 'group';
  children?: StartScreenElement[];
}

export interface StartLeaderboardStyle {
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  fontSize?: number;
  textColor?: string;
  rankColor?: string;
  scoreColor?: string;
  showHeader?: boolean;
}

export interface StartLeaderboardElement extends StartScreenBaseElement {
  type: 'leaderboard';
  maxRows?: number;
  showHeader?: boolean;
  headerText?: string;
  style?: StartLeaderboardStyle;
}

export type StartScreenElement =
  | StartCardElement
  | StartTextElement
  | StartTitleElement
  | StartDescriptionElement
  | StartImageElement
  | StartButtonElement
  | StartBadgeElement
  | StartRulesElement
  | StartIconElement
  | StartKeyboardHintsElement
  | StartGroupElement
  | StartLeaderboardElement;

// Exported alias types for convenience across editor modules
export type StartScreenCardElement = StartCardElement;
export type StartScreenGroupElement = StartGroupElement;
export type StartScreenTextElement = StartTextElement;
export type StartScreenTitleElement = StartTitleElement;
export type StartScreenDescriptionElement = StartDescriptionElement;
export type StartScreenImageElement = StartImageElement;
export type StartScreenButtonElement = StartButtonElement;
export type StartScreenBadgeElement = StartBadgeElement;
export type StartScreenRulesElement = StartRulesElement;
export type StartScreenIconElement = StartIconElement;
export type StartScreenKeyboardHintsElement = StartKeyboardHintsElement;
export type StartScreenLeaderboardElement = StartLeaderboardElement;

export interface StartScreenBackgroundConfig {
  type: ScreenBackgroundType;
  imageUrl?: string | null;
  color?: string;
  overlayOpacity?: number;
}

export interface StartScreenCanvasConfig {
  width: number;
  height: number;
  coordinateSpace?: string;
  version?: number;
}

export interface StartScreenGameMeta {
  gameTitle?: string;
  gameSubtitle?: string;
  logoUrl?: string | null;
  // Memory Match
  rows?: number;
  cols?: number;
  totalCards?: number;
  totalPairs?: number;
  duration?: number;
  // Reaction
  roundsCount?: number;
  lightCount?: number;
  // Catch The Brand
  fallingItemName?: string;
  fallingItemImg?: string | null;
  goodItemImg?: string | null;
  badFallingItemName?: string;
  badFallingItemImg?: string | null;
  badItemImg?: string | null;
  catcherImg?: string | null;
  // Generic
  [key: string]: any;
}

export interface StartScreenConfig {
  // Legacy compatibility fields
  backgroundType?: ScreenBackgroundType;
  backgroundColor?: string;
  backgroundImageUrl?: string | null;
  backgroundOverlayOpacity?: number;
  showIcon?: boolean;
  showGridInfo?: boolean;
  showPairsInfo?: boolean;
  showTimerInfo?: boolean;
  showRules?: boolean;
  showKeyboardHints?: boolean;
  showLeaderboard?: boolean;
  showGuide?: boolean;
  showRoundsInfo?: boolean;
  showLightsInfo?: boolean;
  [key: string]: any;

  // Visual Editor schema
  canvas?: StartScreenCanvasConfig;
  background?: StartScreenBackgroundConfig;
  elements?: StartScreenElement[];
}

/**
 * Generate default Start Screen elements for Catch The Brand.
 * Root canvas: 1024 x 576 (16:9).
 * Central card: x=132, y=53, width=760, height=470 (~74% width, ~82% height).
 * Children coordinates are relative to the central card.
 */
export function generateDefaultCatchBrandStartScreenElements(
  theme?: Partial<GameTheme> | null,
  gameMeta?: StartScreenGameMeta
): StartScreenElement[] {
  const title = gameMeta?.gameTitle || theme?.name || 'CATCH THE BRAND';
  const subtitle = gameMeta?.gameSubtitle || 'Catch the good items, dodge hazards, and score big!';
  const logo = gameMeta?.logoUrl || theme?.clientLogo || theme?.logo || null;

  const cardChildren: StartScreenElement[] = [
    // Header section: Logo or Eyebrow
    ...(logo
      ? ([
          {
            id: 'client-logo',
            type: 'image',
            x: 280,
            y: 14,
            width: 200,
            height: 38,
            imageUrl: logo,
            objectFit: 'contain',
          },
        ] as StartScreenElement[])
      : ([
          {
            id: 'eyebrow-text',
            type: 'text',
            x: 60,
            y: 16,
            width: 640,
            height: 20,
            text: 'RETRO ARCADE ENGINE',
            style: {
              fontSize: 12,
              fontWeight: 'bold',
              color: '#34d399',
              textAlign: 'center',
              letterSpacing: 2,
              textTransform: 'uppercase',
            },
          },
        ] as StartScreenElement[])),
    // Title
    {
      id: 'game-title',
      type: 'text',
      x: 20,
      y: logo ? 56 : 40,
      width: 720,
      height: logo ? 40 : 48,
      text: title,
      style: {
        fontSize: logo ? 30 : 34,
        fontWeight: 900,
        color: '#fef08a',
        textAlign: 'center',
        letterSpacing: 1,
        textTransform: 'uppercase',
      },
    },
    // Subtitle
    {
      id: 'game-subtitle',
      type: 'text',
      x: 30,
      y: logo ? 100 : 94,
      width: 700,
      height: 24,
      text: subtitle,
      style: {
        fontSize: 13,
        fontWeight: 500,
        color: '#cbd5e1',
        textAlign: 'center',
        lineHeight: 1.4,
      },
    },
    // Rules Cards (Good Item vs Bad Item)
    {
      id: 'rules-cards',
      type: 'rules',
      ruleType: 'catch-brand',
      x: 40,
      y: logo ? 130 : 126,
      width: 680,
      height: 155,
      goodItemTitle: gameMeta?.fallingItemName || 'Target Item',
      goodItemSubtitle: '+10 POINTS',
      goodItemImg: gameMeta?.goodItemImg || gameMeta?.fallingItemImg || null,
      badItemTitle: gameMeta?.badFallingItemName || 'Hazard Item',
      badItemSubtitle: '-10 POINTS',
      badItemImg: gameMeta?.badItemImg || gameMeta?.badFallingItemImg || null,
    },
    // Start Game Button (Emerald Gradient)
    {
      id: 'start-button',
      type: 'button',
      action: 'start',
      x: 90,
      y: logo ? 298 : 294,
      width: 580,
      height: 58,
      text: 'START GAME',
      icon: 'Play',
      style: {
        backgroundColor: '#10b981',
        textColor: '#022c22',
        fontSize: 20,
        fontWeight: 900,
        borderRadius: 18,
        shadow: true,
        gradient: true,
        gradientFrom: '#10b981',
        gradientTo: '#0d9488',
      },
    },
    // Footer actions & keyboard hints
    {
      id: 'keyboard-hints',
      type: 'keyboard-hints',
      x: 40,
      y: 374,
      width: 200,
      height: 36,
      keys: ['← →', 'A D'],
    },
    {
      id: 'leaderboard-btn',
      type: 'button',
      action: 'leaderboard',
      x: 380,
      y: 374,
      width: 150,
      height: 36,
      text: 'Leaderboard',
      icon: 'Trophy',
      style: {
        backgroundColor: 'transparent',
        textColor: '#fbbf24',
        fontSize: 14,
        fontWeight: 700,
      },
    },
    {
      id: 'guide-btn',
      type: 'button',
      action: 'guide',
      x: 550,
      y: 374,
      width: 140,
      height: 36,
      text: 'Guide',
      icon: 'HelpCircle',
      style: {
        backgroundColor: 'transparent',
        textColor: '#fbbf24',
        fontSize: 14,
        fontWeight: 700,
      },
    },
  ];

  return [
    {
      id: 'main-start-card',
      type: 'card',
      x: 132,
      y: 53,
      width: 760,
      height: 470,
      style: {
        backgroundColor: 'rgba(15, 23, 42, 0.85)',
        borderWidth: 2,
        borderColor: '#f59e0b',
        borderRadius: 24,
        shadow: true,
        backdropBlur: true,
      },
      children: cardChildren,
    },
  ];
}

/**
 * Generate default Start Screen elements for Memory Match.
 * Root canvas: 1000 x 1000.
 * Central card: x=140, y=180, width=720, height=600.
 * Children coordinates are relative to the central card.
 */
export function generateDefaultMemoryMatchStartScreenElements(
  theme?: Partial<GameTheme> | null,
  gameMeta?: StartScreenGameMeta,
  legacyConfig?: {
    showIcon?: boolean;
    showGridInfo?: boolean;
    showPairsInfo?: boolean;
    showTimerInfo?: boolean;
  }
): StartScreenElement[] {
  const title = gameMeta?.gameTitle || theme?.name || 'BRAND MEMORY MATCH';
  const totalCards = gameMeta?.totalCards ?? 16;
  const totalPairs = gameMeta?.totalPairs ?? Math.floor(totalCards / 2);
  const duration = gameMeta?.duration ?? 45;

  const showIcon = legacyConfig?.showIcon !== false;
  const showGrid = legacyConfig?.showGridInfo !== false;
  const showPairs = legacyConfig?.showPairsInfo !== false;
  const showTimer = legacyConfig?.showTimerInfo !== false;

  const cardChildren: StartScreenElement[] = [];

  // Top Icon
  if (showIcon) {
    cardChildren.push({
      id: 'top-icon',
      type: 'icon',
      iconName: 'Grid3X3',
      x: 325,
      y: 40,
      width: 70,
      height: 70,
      iconColor: '#f59e0b',
      backgroundColor: 'rgba(245, 158, 11, 0.15)',
      borderColor: 'rgba(245, 158, 11, 0.4)',
      borderRadius: 20,
    });
  }

  const titleY = showIcon ? 125 : 55;

  // Title
  cardChildren.push({
    id: 'game-title',
    type: 'text',
    x: 40,
    y: titleY,
    width: 640,
    height: 55,
    text: title,
    style: {
      fontSize: 34,
      fontWeight: 900,
      color: '#ffffff',
      textAlign: 'center',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
  });

  // Description
  cardChildren.push({
    id: 'game-instructions',
    type: 'text',
    x: 50,
    y: titleY + 60,
    width: 620,
    height: 45,
    text: 'Flip cards, find all {totalPairs} matching pairs, and score max bonus points before time expires!',
    style: {
      fontSize: 16,
      fontWeight: 400,
      color: '#94a3b8',
      textAlign: 'center',
      lineHeight: 1.4,
    },
  });

  // Dynamic Badges (Grid, Pairs, Timer)
  const badges: StartBadgeElement[] = [];
  if (showGrid) {
    badges.push({
      id: 'badge-grid',
      type: 'badge',
      metric: 'grid',
      label: 'GRID',
      value: `${totalCards} Cards`,
      x: 0,
      y: 0,
      width: 190,
      height: 70,
      style: {
        backgroundColor: 'rgba(2, 6, 23, 0.8)',
        borderColor: '#1e293b',
        borderWidth: 1,
        borderRadius: 16,
        labelColor: '#64748b',
        valueColor: '#f59e0b',
        fontSize: 16,
      },
    });
  }
  if (showPairs) {
    badges.push({
      id: 'badge-pairs',
      type: 'badge',
      metric: 'pairs',
      label: 'PAIRS',
      value: `${totalPairs} Pairs`,
      x: 0,
      y: 0,
      width: 190,
      height: 70,
      style: {
        backgroundColor: 'rgba(2, 6, 23, 0.8)',
        borderColor: '#1e293b',
        borderWidth: 1,
        borderRadius: 16,
        labelColor: '#64748b',
        valueColor: '#10b981',
        fontSize: 16,
      },
    });
  }
  if (showTimer) {
    badges.push({
      id: 'badge-timer',
      type: 'badge',
      metric: 'timer',
      label: 'TIMER',
      value: `${duration}s`,
      x: 0,
      y: 0,
      width: 190,
      height: 70,
      style: {
        backgroundColor: 'rgba(2, 6, 23, 0.8)',
        borderColor: '#1e293b',
        borderWidth: 1,
        borderRadius: 16,
        labelColor: '#64748b',
        valueColor: '#06b6d4',
        fontSize: 16,
      },
    });
  }

  // Layout badges horizontally
  const badgeY = titleY + 120;
  if (badges.length > 0) {
    const totalW = badges.length * 190 + (badges.length - 1) * 20;
    const startX = (720 - totalW) / 2;
    badges.forEach((b, i) => {
      b.x = startX + i * 210;
      b.y = badgeY;
      cardChildren.push(b);
    });
  }

  // Start Button
  const buttonY = badges.length > 0 ? badgeY + 100 : badgeY + 30;
  cardChildren.push({
    id: 'start-button',
    type: 'button',
    action: 'start',
    x: 60,
    y: buttonY,
    width: 600,
    height: 70,
    text: 'START MATCH',
    icon: 'Play',
    style: {
      backgroundColor: '#f59e0b',
      textColor: '#020617',
      fontSize: 22,
      fontWeight: 900,
      borderRadius: 20,
      shadow: true,
      gradient: true,
      gradientFrom: '#f59e0b',
      gradientTo: '#fbbf24',
    },
  });

  // Secondary actions
  cardChildren.push({
    id: 'leaderboard-btn',
    type: 'button',
    action: 'leaderboard',
    x: 285,
    y: buttonY + 85,
    width: 150,
    height: 35,
    text: 'Leaderboard',
    icon: 'Trophy',
    style: {
      backgroundColor: 'transparent',
      textColor: '#f59e0b',
      fontSize: 14,
      fontWeight: 700,
    },
  });

  const cardHeight = buttonY + 140;

  return [
    {
      id: 'main-start-card',
      type: 'card',
      x: 140,
      y: 180,
      width: 720,
      height: cardHeight,
      style: {
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        borderWidth: 1,
        borderColor: '#334155',
        borderRadius: 28,
        shadow: true,
      },
      children: cardChildren,
    },
  ];
}

/**
 * Generate default Start Screen elements for Reaction Tap.
 * Root canvas: 1000 x 1000.
 * Central card: x=140, y=180, width=720, height=580.
 * Children coordinates are relative to the central card.
 */
export function generateDefaultReactionStartScreenElements(
  theme?: Partial<GameTheme> | null,
  gameMeta?: StartScreenGameMeta
): StartScreenElement[] {
  const title = gameMeta?.gameTitle || theme?.name || 'FORMULA REACTION LIGHTS';
  const rounds = gameMeta?.roundsCount ?? 5;
  const lights = gameMeta?.lightCount ?? 5;

  const cardChildren: StartScreenElement[] = [
    // Top Icon
    {
      id: 'top-icon',
      type: 'icon',
      iconName: 'Zap',
      x: 325,
      y: 40,
      width: 70,
      height: 70,
      iconColor: '#ef4444',
      backgroundColor: 'rgba(239, 68, 68, 0.15)',
      borderColor: 'rgba(239, 68, 68, 0.4)',
      borderRadius: 20,
    },
    // Title
    {
      id: 'game-title',
      type: 'text',
      x: 40,
      y: 125,
      width: 640,
      height: 55,
      text: title,
      style: {
        fontSize: 34,
        fontWeight: 900,
        color: '#ffffff',
        textAlign: 'center',
        textTransform: 'uppercase',
        letterSpacing: 1,
      },
    },
    // Instructions
    {
      id: 'game-instructions',
      type: 'text',
      x: 50,
      y: 185,
      width: 620,
      height: 45,
      text: 'Watch the red lights illuminate. When all lights extinguish (LIGHTS OUT), tap or press SPACE as fast as you can!',
      style: {
        fontSize: 16,
        fontWeight: 400,
        color: '#94a3b8',
        textAlign: 'center',
        lineHeight: 1.4,
      },
    },
    // Badges (Rounds & Lights)
    {
      id: 'badge-rounds',
      type: 'badge',
      metric: 'rounds',
      label: 'ROUNDS',
      value: `${rounds} Rounds`,
      x: 135,
      y: 245,
      width: 210,
      height: 70,
      style: {
        backgroundColor: 'rgba(2, 6, 23, 0.8)',
        borderColor: '#1e293b',
        borderWidth: 1,
        borderRadius: 16,
        labelColor: '#64748b',
        valueColor: '#ef4444',
        fontSize: 16,
      },
    },
    {
      id: 'badge-lights',
      type: 'badge',
      metric: 'lights',
      label: 'GANTRY',
      value: `${lights} Lights`,
      x: 375,
      y: 245,
      width: 210,
      height: 70,
      style: {
        backgroundColor: 'rgba(2, 6, 23, 0.8)',
        borderColor: '#1e293b',
        borderWidth: 1,
        borderRadius: 16,
        labelColor: '#64748b',
        valueColor: '#f59e0b',
        fontSize: 16,
      },
    },
    // Start Game Button
    {
      id: 'start-button',
      type: 'button',
      action: 'start',
      x: 60,
      y: 345,
      width: 600,
      height: 70,
      text: 'START REACTION TEST',
      icon: 'Play',
      style: {
        backgroundColor: '#ef4444',
        textColor: '#ffffff',
        fontSize: 22,
        fontWeight: 900,
        borderRadius: 20,
        shadow: true,
        gradient: true,
        gradientFrom: '#ef4444',
        gradientTo: '#dc2626',
      },
    },
    // Leaderboard button
    {
      id: 'leaderboard-btn',
      type: 'button',
      action: 'leaderboard',
      x: 285,
      y: 435,
      width: 150,
      height: 35,
      text: 'Leaderboard',
      icon: 'Trophy',
      style: {
        backgroundColor: 'transparent',
        textColor: '#ef4444',
        fontSize: 14,
        fontWeight: 700,
      },
    },
  ];

  return [
    {
      id: 'main-start-card',
      type: 'card',
      x: 140,
      y: 180,
      width: 720,
      height: 500,
      style: {
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        borderWidth: 1,
        borderColor: '#334155',
        borderRadius: 28,
        shadow: true,
      },
      children: cardChildren,
    },
  ];
}

/**
 * Universal default Start Screen element generator.
 */
export function generateDefaultStartScreenElements(
  gameTypeOrConfig?: string | Partial<StartScreenConfig>,
  theme?: Partial<GameTheme> | null,
  gameMetaOrGameType?: StartScreenGameMeta | string,
  legacyConfig?: any
): StartScreenElement[] {
  let gameType = 'catch-brand';
  let gameMeta: StartScreenGameMeta | undefined;
  let config = legacyConfig;

  if (typeof gameTypeOrConfig === 'string') {
    gameType = gameTypeOrConfig;
    if (typeof gameMetaOrGameType === 'object' && gameMetaOrGameType !== null) {
      gameMeta = gameMetaOrGameType;
    }
  } else if (typeof gameMetaOrGameType === 'string') {
    gameType = gameMetaOrGameType;
    config = gameTypeOrConfig;
  } else if (gameTypeOrConfig && typeof gameTypeOrConfig === 'object') {
    config = gameTypeOrConfig;
  }

  const normType = (gameType || '').trim().toLowerCase().replace(/_/g, '-');

  if (normType === 'reaction-tap' || normType === 'reaction-time') {
    return generateDefaultReactionStartScreenElements(theme, gameMeta);
  }
  if (normType === 'memory-match') {
    return generateDefaultMemoryMatchStartScreenElements(theme, gameMeta, config);
  }
  return generateDefaultCatchBrandStartScreenElements(theme, gameMeta);
}
