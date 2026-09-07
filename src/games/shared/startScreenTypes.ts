import { ScreenBackgroundType } from './resultScreenTypes';
import { GameTheme } from '../../themes/types';

/* ==========================================================================
 * START SCREEN ELEMENT SCHEMA (1000 x 1000 Logical Canvas)
 * ========================================================================== */

export type StartScreenElementType =
  | 'card'
  | 'group'
  | 'image'
  | 'text'
  | 'title'
  | 'description'
  | 'badge'
  | 'button'
  | 'rules'
  | 'icon'
  | 'leaderboard';

export interface StartScreenBaseElement {
  id: string;
  type: StartScreenElementType;
  x: number; // 0-1000 coordinate relative to parent
  y: number; // 0-1000 coordinate relative to parent
  width: number;
  height: number;
  rotation?: number; // Rotation in degrees (default: 0)
  visible?: boolean; // Visibility toggle (default: true)
  opacity?: number; // 0 to 1 (default: 1)
  zIndex?: number; // Stacking order (default: 1)
  locked?: boolean; // Lock toggle (default: false)
}

export interface StartCardStyle {
  backgroundColor?: string;
  backgroundImageUrl?: string | null;
  backgroundSize?: 'cover' | 'contain' | 'auto';
  backgroundPosition?: string;
  backgroundRepeat?: 'no-repeat' | 'repeat' | 'repeat-x' | 'repeat-y';
  borderWidth?: number;
  borderColor?: string;
  borderRadius?: number;
  shadow?: boolean;
  padding?: number;
  backdropBlur?: boolean;
}

export interface StartScreenCardElement extends StartScreenBaseElement {
  type: 'card';
  style?: StartCardStyle;
  children?: StartScreenElement[];
}

export interface StartScreenGroupElement extends StartScreenBaseElement {
  type: 'group';
  children?: StartScreenElement[];
}

export interface StartImageStyle {
  objectFit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
  objectPosition?: string;
  borderRadius?: number;
  borderWidth?: number;
  borderColor?: string;
  shadow?: boolean;
  opacity?: number;
}

export interface StartScreenImageElement extends StartScreenBaseElement {
  type: 'image';
  imageUrl: string | null;
  objectFit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
  objectPosition?: string;
  style?: StartImageStyle;
}

export interface StartTextStyle {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string | number;
  fontStyle?: 'normal' | 'italic';
  color?: string;
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  verticalAlign?: 'top' | 'center' | 'bottom';
  lineHeight?: number;
  letterSpacing?: number;
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  textDecoration?: 'none' | 'underline' | 'line-through';
  textShadow?: string;
  opacity?: number;
}

export interface StartScreenTextElement extends StartScreenBaseElement {
  type: 'text';
  text: string;
  style?: StartTextStyle;
}

export interface StartScreenTitleElement extends StartScreenBaseElement {
  type: 'title';
  text?: string; // If undefined or empty, uses theme.name || fallback
  style?: StartTextStyle;
}

export interface StartScreenDescriptionElement extends StartScreenBaseElement {
  type: 'description';
  text?: string; // If undefined or empty, uses theme.description || fallback
  style?: StartTextStyle;
}

export interface StartBadgeStyle {
  labelColor?: string;
  valueColor?: string;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  fontSize?: number;
  showLabel?: boolean;
  textAlign?: 'left' | 'center' | 'right';
  layout?: 'vertical' | 'horizontal';
  gap?: number;
}

export type StartBadgeMetric =
  | 'grid'
  | 'pairs'
  | 'timer'
  | 'rounds'
  | 'lights'
  | 'target-item'
  | 'hazard-item'
  | 'custom';

export interface StartScreenBadgeElement extends StartScreenBaseElement {
  type: 'badge';
  metric: StartBadgeMetric;
  label?: string;
  value?: string;
  customText?: string;
  iconName?: string;
  style?: StartBadgeStyle;
}

export type StartButtonAction =
  | 'startGame'
  | 'viewLeaderboard'
  | 'howToPlay'
  | 'settings'
  | 'exit';

export interface StartButtonStyle {
  backgroundColor?: string;
  textColor?: string;
  fontSize?: number;
  fontWeight?: string | number;
  fontFamily?: string;
  fontStyle?: 'normal' | 'italic';
  borderRadius?: number;
  borderWidth?: number;
  borderColor?: string;
  shadow?: boolean;
  pulse?: boolean;
  paddingX?: number;
  paddingY?: number;
  letterSpacing?: number;
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
}

export interface StartScreenButtonElement extends StartScreenBaseElement {
  type: 'button';
  text: string;
  action: StartButtonAction;
  iconName?: 'play' | 'trophy' | 'help' | 'settings' | 'none';
  style?: StartButtonStyle;
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

export interface StartScreenRulesElement extends StartScreenBaseElement {
  type: 'rules';
  gameType?: string;
  title?: string;
  description?: string;
  style?: StartRulesStyle;
}

export interface StartIconStyle {
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  iconColor?: string;
  size?: number;
  shadow?: boolean;
}

export interface StartScreenIconElement extends StartScreenBaseElement {
  type: 'icon';
  iconName?: string;
  imageUrl?: string | null;
  style?: StartIconStyle;
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
  headerText?: string;
}

export interface StartScreenLeaderboardElement extends StartScreenBaseElement {
  type: 'leaderboard';
  maxRows?: number;
  showHeader?: boolean;
  headerText?: string;
  style?: StartLeaderboardStyle;
}

export type StartScreenElement =
  | StartScreenCardElement
  | StartScreenGroupElement
  | StartScreenImageElement
  | StartScreenTextElement
  | StartScreenTitleElement
  | StartScreenDescriptionElement
  | StartScreenBadgeElement
  | StartScreenButtonElement
  | StartScreenRulesElement
  | StartScreenIconElement
  | StartScreenLeaderboardElement;

export interface StartScreenCanvasConfig {
  width: number; // default: 1000
  height: number; // default: 1000
}

export interface StartScreenBackgroundConfig {
  type: ScreenBackgroundType;
  imageUrl?: string | null;
  color?: string | null;
  overlayOpacity?: number;
}

export interface StartScreenConfig {
  // Legacy / Direct Background Properties
  backgroundType?: ScreenBackgroundType;
  backgroundColor?: string; // default '#0f172a'
  backgroundImageUrl?: string | null;
  backgroundOverlayOpacity?: number; // 0 to 1, default 0.3

  // Legacy Visibility Toggles
  showIcon?: boolean;
  showGridInfo?: boolean;
  showPairsInfo?: boolean;
  showTimerInfo?: boolean;

  // Advanced Flexible Canvas & Elements Architecture
  canvas?: StartScreenCanvasConfig;
  background?: StartScreenBackgroundConfig;
  elements?: StartScreenElement[];
}

export const DEFAULT_START_CANVAS_CONFIG: StartScreenCanvasConfig = {
  width: 1000,
  height: 1000,
};

/**
 * Generates backward-compatible Start Screen elements based on legacy flags or game type.
 * Positions elements inside a parent Card on a 1000x1000 logical canvas.
 */
export function generateDefaultStartScreenElements(
  startConfig?: Partial<StartScreenConfig>,
  theme?: Partial<GameTheme>,
  gameType: string = 'memory-match'
): StartScreenElement[] {
  const showIcon = startConfig?.showIcon !== false;
  const showGrid = startConfig?.showGridInfo !== false;
  const showPairs = startConfig?.showPairsInfo !== false;
  const showTimer = startConfig?.showTimerInfo !== false;

  const cardChildren: StartScreenElement[] = [];

  // 1. Game Icon / Emblem
  if (showIcon) {
    cardChildren.push({
      id: 'icon-start-emblem',
      type: 'icon',
      x: 320,
      y: 40,
      width: 80,
      height: 80,
      rotation: 0,
      visible: true,
      opacity: 1,
      zIndex: 2,
      iconName: gameType === 'memory-match' ? 'Grid3X3' : gameType === 'reaction-tap' ? 'Zap' : 'Sparkles',
      style: {
        backgroundColor: 'rgba(245, 158, 11, 0.15)',
        borderColor: 'rgba(245, 158, 11, 0.4)',
        borderWidth: 2,
        borderRadius: 24,
        iconColor: '#fbbf24',
        shadow: true,
      },
    });
  }

  // 2. Game Title
  cardChildren.push({
    id: 'title-start-heading',
    type: 'title',
    x: 40,
    y: showIcon ? 135 : 60,
    width: 640,
    height: 70,
    rotation: 0,
    visible: true,
    opacity: 1,
    zIndex: 2,
    text: theme?.name || (gameType === 'memory-match' ? 'Memory Match' : gameType === 'reaction-tap' ? 'Reflex Champion' : 'Catch The Brand'),
    style: {
      fontSize: 38,
      fontWeight: '900',
      color: '#ffffff',
      textAlign: 'center',
      textTransform: 'uppercase',
      letterSpacing: 2,
      textShadow: '0 4px 12px rgba(0,0,0,0.6)',
    },
  });

  // 3. Game Subtitle / Instructions
  cardChildren.push({
    id: 'desc-start-sub',
    type: 'description',
    x: 60,
    y: showIcon ? 215 : 140,
    width: 600,
    height: 60,
    rotation: 0,
    visible: true,
    opacity: 1,
    zIndex: 2,
    text: theme?.description || (gameType === 'memory-match'
      ? 'Flip cards, match identical pairs, and beat the clock!'
      : gameType === 'reaction-tap'
      ? 'When the lights go out, tap as fast as you can!'
      : 'Catch positive brand items and avoid hazards!'),
    style: {
      fontSize: 16,
      fontWeight: 500,
      color: '#cbd5e1',
      textAlign: 'center',
      lineHeight: 1.5,
    },
  });

  // 4. Badges / Game Info Pills
  if (gameType === 'memory-match') {
    const badgeConfigs: Array<{ id: string; metric: StartBadgeMetric; label: string; value: string; color: string }> = [];
    if (showGrid) badgeConfigs.push({ id: 'badge-grid', metric: 'grid', label: 'GRID', value: '4×4 Cards', color: '#fbbf24' });
    if (showPairs) badgeConfigs.push({ id: 'badge-pairs', metric: 'pairs', label: 'PAIRS', value: '8 Pairs', color: '#34d399' });
    if (showTimer) badgeConfigs.push({ id: 'badge-timer', metric: 'timer', label: 'TIMER', value: '45s', color: '#38bdf8' });

    if (badgeConfigs.length > 0) {
      const badgeWidth = Math.min(180, Math.floor(580 / badgeConfigs.length));
      const totalWidth = badgeConfigs.length * badgeWidth + (badgeConfigs.length - 1) * 16;
      const startX = Math.floor((720 - totalWidth) / 2);

      badgeConfigs.forEach((b, idx) => {
        cardChildren.push({
          id: b.id,
          type: 'badge',
          metric: b.metric,
          x: startX + idx * (badgeWidth + 16),
          y: showIcon ? 300 : 225,
          width: badgeWidth,
          height: 85,
          rotation: 0,
          visible: true,
          opacity: 1,
          zIndex: 2,
          label: b.label,
          value: b.value,
          style: {
            backgroundColor: 'rgba(2, 6, 23, 0.85)',
            borderColor: '#334155',
            borderWidth: 1,
            borderRadius: 18,
            labelColor: '#94a3b8',
            valueColor: b.color,
            fontSize: 18,
            textAlign: 'center',
            layout: 'vertical',
            gap: 4,
          },
        });
      });
    }
  } else if (gameType === 'reaction-tap' || gameType === 'reaction-time') {
    cardChildren.push({
      id: 'badge-rounds',
      type: 'badge',
      metric: 'rounds',
      x: 150,
      y: showIcon ? 300 : 225,
      width: 190,
      height: 85,
      rotation: 0,
      visible: true,
      opacity: 1,
      zIndex: 2,
      label: 'ROUNDS',
      value: '5 Rounds',
      style: {
        backgroundColor: 'rgba(2, 6, 23, 0.85)',
        borderColor: '#334155',
        borderWidth: 1,
        borderRadius: 18,
        labelColor: '#94a3b8',
        valueColor: '#38bdf8',
        fontSize: 18,
        textAlign: 'center',
        layout: 'vertical',
        gap: 4,
      },
    });

    cardChildren.push({
      id: 'badge-lights',
      type: 'badge',
      metric: 'lights',
      x: 380,
      y: showIcon ? 300 : 225,
      width: 190,
      height: 85,
      rotation: 0,
      visible: true,
      opacity: 1,
      zIndex: 2,
      label: 'LIGHTS',
      value: '5 Lights Out',
      style: {
        backgroundColor: 'rgba(2, 6, 23, 0.85)',
        borderColor: '#334155',
        borderWidth: 1,
        borderRadius: 18,
        labelColor: '#94a3b8',
        valueColor: '#fbbf24',
        fontSize: 18,
        textAlign: 'center',
        layout: 'vertical',
        gap: 4,
      },
    });
  } else {
    // Catch The Brand rules / items info
    cardChildren.push({
      id: 'rules-catch-brand',
      type: 'rules',
      gameType: 'catch-brand',
      x: 80,
      y: showIcon ? 295 : 220,
      width: 560,
      height: 120,
      rotation: 0,
      visible: true,
      opacity: 1,
      zIndex: 2,
      title: 'GAME RULES',
      style: {
        backgroundColor: 'rgba(2, 6, 23, 0.75)',
        borderColor: '#334155',
        borderWidth: 1,
        borderRadius: 20,
        textColor: '#e2e8f0',
        fontSize: 14,
        showIcons: true,
      },
    });
  }

  // 5. Start Game Action Button
  cardChildren.push({
    id: 'btn-start-game',
    type: 'button',
    x: 100,
    y: showIcon ? 430 : 355,
    width: 520,
    height: 76,
    rotation: 0,
    visible: true,
    opacity: 1,
    zIndex: 3,
    text: gameType === 'memory-match' ? 'START MATCH' : 'START GAME',
    action: 'startGame',
    iconName: 'play',
    style: {
      backgroundColor: '#f59e0b',
      textColor: '#020617',
      fontSize: 22,
      fontWeight: '900',
      borderRadius: 20,
      borderWidth: 0,
      shadow: true,
      pulse: true,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
    },
  });

  // 6. Secondary Controls / Hints
  cardChildren.push({
    id: 'text-footer-hint',
    type: 'text',
    x: 110,
    y: showIcon ? 530 : 455,
    width: 500,
    height: 40,
    rotation: 0,
    visible: true,
    opacity: 0.8,
    zIndex: 2,
    text: 'Click, tap, or press [SPACE] to start',
    style: {
      fontSize: 13,
      fontWeight: 600,
      color: '#94a3b8',
      textAlign: 'center',
      letterSpacing: 0.5,
    },
  });

  return [
    {
      id: 'card-start-main',
      type: 'card',
      x: 140,
      y: 180,
      width: 720,
      height: showIcon ? 600 : 520,
      rotation: 0,
      visible: true,
      opacity: 1,
      zIndex: 1,
      style: {
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        borderWidth: 1,
        borderColor: '#334155',
        borderRadius: 28,
        shadow: true,
        backdropBlur: true,
      },
      children: cardChildren,
    },
  ];
}
