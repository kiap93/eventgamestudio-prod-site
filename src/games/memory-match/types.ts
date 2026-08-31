import { BaseGameConfig } from '../types';

export interface MemoryCard {
  id: string;
  pairId: string;
  name: string;
  imageUrl?: string | null;
  iconName?: string;
  color?: string;
  bgColor?: string;
  borderColor?: string;
  points: number;
  isFlipped: boolean;
  isMatched: boolean;
  isShaking?: boolean;
  rotation?: number; // Deterministic rotation angle in degrees
}

export interface MemoryMatchPairConfig {
  id: string;
  name: string;
  imageUrl?: string | null;
  iconName?: string;
  color?: string;
  bgColor?: string;
  borderColor?: string;
  points?: number;
}

export type MemoryMatchLayoutMode = 'grid' | 'random';
export type MemoryMatchCardRotationMode = 'none' | 'fixed' | 'random';

export interface MemoryMatchCardConfig {
  width: number; // Card width in pixels (e.g. 60 - 240, default: 120)
  height: number; // Card height in pixels (e.g. 60 - 240, default: 120)
  borderRadius: number; // Corner radius in pixels (e.g. 0 - 36, default: 16)
  rotationMode: MemoryMatchCardRotationMode; // 'none' | 'fixed' | 'random'
  rotation: number; // Fixed rotation angle in degrees (e.g. -45 to 45 deg, default: 0)
  rotationRange?: number; // Random tilt range in degrees (e.g. 0 to 25 deg, default: 8)
}

export interface MemoryMatchRandomLayoutConfig {
  minSpacing: number; // default: 12 (range: 0-40 px)
  rotationMin: number; // default: -8 (range: -15 to 0 deg)
  rotationMax: number; // default: 8 (range: 0 to 15 deg)
}

export interface MemoryMatchBoardConfig {
  layoutMode: MemoryMatchLayoutMode; // 'grid' | 'random'
  rows: number; // default: 4 (range: 2 to 6)
  cols: number; // default: 4 (range: 2 to 6)
  cardGap: number; // default: 12 px
  randomLayout: MemoryMatchRandomLayoutConfig;
  card?: MemoryMatchCardConfig;
}

export interface MemoryMatchGridConfig {
  rows: number; // default: 4
  cols: number; // default: 4
}

export interface MemoryMatchGameplayConfig {
  gameDurationSeconds: number; // default: 45
  mismatchDelayMs: number; // default: 850
  matchPoints: number; // default: 100
  comboPoints: number; // default: 30
}

export interface MemoryMatchUiConfig {
  showLeaderboard?: boolean; // default: true
}

export type ScreenBackgroundType = 'color' | 'theme' | 'image';

export interface MemoryMatchStartScreenConfig {
  backgroundType: ScreenBackgroundType;
  backgroundColor: string; // default '#0f172a'
  backgroundImageUrl?: string | null;
  backgroundOverlayOpacity?: number; // 0 to 1, default 0.3

  showIcon: boolean;
  showGridInfo: boolean;
  showPairsInfo: boolean;
  showTimerInfo: boolean;
}

/* ==========================================================================
 * RESULT SCREEN ELEMENT SCHEMA (1000 x 1000 Logical Canvas)
 * ========================================================================== */

export type ResultScreenElementType =
  | 'card'
  | 'image'
  | 'text'
  | 'score'
  | 'moves'
  | 'pairs'
  | 'time'
  | 'accuracy'
  | 'button'
  | 'group';

export interface ResultScreenBaseElement {
  id: string;
  type: ResultScreenElementType;
  x: number; // 0-1000 coordinate relative to parent
  y: number; // 0-1000 coordinate relative to parent
  width: number;
  height: number;
  rotation?: number; // Rotation in degrees (default: 0)
  visible?: boolean; // Visibility toggle (default: true)
  opacity?: number; // 0 to 1 (default: 1)
  zIndex?: number; // Stacking order (default: 1)
}

export interface ResultCardStyle {
  backgroundColor?: string;
  backgroundImageUrl?: string | null;
  backgroundSize?: 'cover' | 'contain' | 'auto';
  backgroundPosition?: string;
  backgroundRepeat?: 'no-repeat' | 'repeat' | 'repeat-x' | 'repeat-y';
  borderWidth?: number;
  borderColor?: string;
  borderRadius?: number;
  shadow?: boolean;
  opacity?: number;
}

export interface ResultCardElement extends ResultScreenBaseElement {
  type: 'card';
  style?: ResultCardStyle;
  children?: ResultScreenElement[];
}

export interface ResultImageStyle {
  objectFit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
  objectPosition?: string;
  borderRadius?: number;
  borderWidth?: number;
  borderColor?: string;
  shadow?: boolean;
  opacity?: number;
}

export interface ResultImageElement extends ResultScreenBaseElement {
  type: 'image';
  imageUrl: string | null;
  objectFit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
  objectPosition?: string;
  style?: ResultImageStyle;
}

export interface ResultTextStyle {
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

export interface ResultTextElement extends ResultScreenBaseElement {
  type: 'text';
  text: string;
  style?: ResultTextStyle;
}

export interface ResultStatStyle {
  labelColor?: string;
  valueColor?: string;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  fontSize?: number;
  showLabel?: boolean;
  textAlign?: 'left' | 'center' | 'right';
  verticalAlign?: 'top' | 'center' | 'bottom';
  layout?: 'vertical' | 'horizontal';
  gap?: number;

  // Granular Label Typography
  labelFontFamily?: string;
  labelFontSize?: number;
  labelFontWeight?: string | number;
  labelFontStyle?: 'normal' | 'italic';
  labelLetterSpacing?: number;
  labelTextTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  labelTextShadow?: string;

  // Granular Value Typography
  valueFontFamily?: string;
  valueFontSize?: number;
  valueFontWeight?: string | number;
  valueFontStyle?: 'normal' | 'italic';
  valueLetterSpacing?: number;
  valueTextTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  valueLineHeight?: number;
  valueTextShadow?: string;
}

export interface ResultScoreElement extends ResultScreenBaseElement {
  type: 'score';
  label?: string;
  style?: ResultStatStyle;
}

export interface ResultMovesElement extends ResultScreenBaseElement {
  type: 'moves';
  label?: string;
  style?: ResultStatStyle;
}

export interface ResultPairsElement extends ResultScreenBaseElement {
  type: 'pairs';
  label?: string;
  style?: ResultStatStyle;
}

export interface ResultTimeElement extends ResultScreenBaseElement {
  type: 'time';
  label?: string;
  style?: ResultStatStyle;
}

export interface ResultAccuracyElement extends ResultScreenBaseElement {
  type: 'accuracy';
  label?: string;
  style?: ResultStatStyle;
}

export interface ResultButtonStyle {
  backgroundColor?: string;
  textColor?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string | number;
  fontStyle?: 'normal' | 'italic';
  letterSpacing?: number;
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  borderRadius?: number;
  borderWidth?: number;
  borderColor?: string;
  shadow?: boolean;
  textShadow?: string;
  opacity?: number;
}

export interface ResultButtonElement extends ResultScreenBaseElement {
  type: 'button';
  text: string;
  action: 'playAgain' | 'exit' | string;
  style?: ResultButtonStyle;
}

export interface ResultGroupElement extends ResultScreenBaseElement {
  type: 'group';
  children?: ResultScreenElement[];
}

export type ResultScreenElement =
  | ResultCardElement
  | ResultImageElement
  | ResultTextElement
  | ResultScoreElement
  | ResultMovesElement
  | ResultPairsElement
  | ResultTimeElement
  | ResultAccuracyElement
  | ResultButtonElement
  | ResultGroupElement;

export interface ResultScreenCanvasConfig {
  width: number; // default: 1000
  height: number; // default: 1000
}

export interface ResultScreenBackgroundConfig {
  type: ScreenBackgroundType;
  imageUrl?: string | null;
  color?: string | null;
  overlayOpacity?: number;
}

export interface MemoryMatchResultScreenConfig {
  // Legacy / Direct Background Properties
  backgroundType: ScreenBackgroundType;
  backgroundColor: string; // default '#0f172a'
  backgroundImageUrl?: string | null;
  backgroundOverlayOpacity?: number; // 0 to 1, default 0.3

  // Legacy Visibility Toggles
  showScore?: boolean;
  showMoves?: boolean;
  showPairs?: boolean;
  showAccuracy?: boolean;

  // New Flexible Canvas & Elements Architecture
  canvas?: ResultScreenCanvasConfig;
  background?: ResultScreenBackgroundConfig;
  elements?: ResultScreenElement[];
}

export const DEFAULT_RESULT_CANVAS_CONFIG: ResultScreenCanvasConfig = {
  width: 1000,
  height: 1000,
};

/**
 * Generates backward-compatible Result Screen elements based on legacy flags.
 * Positions elements inside a parent Card on a 1000x1000 logical canvas.
 */
export function generateDefaultResultScreenElements(
  legacy?: Partial<MemoryMatchResultScreenConfig>
): ResultScreenElement[] {
  const showScore = legacy?.showScore !== false;
  const showMoves = legacy?.showMoves !== false;
  const showPairs = legacy?.showPairs !== false;
  const showAccuracy = legacy?.showAccuracy !== false;

  const cardChildren: ResultScreenElement[] = [
    // 1. Result Title
    {
      id: 'title-text',
      type: 'text',
      x: 35,
      y: 35,
      width: 630,
      height: 55,
      rotation: 0,
      visible: true,
      opacity: 1,
      zIndex: 2,
      text: 'Board Cleared!',
      style: {
        fontSize: 34,
        fontWeight: '900',
        color: '#ffffff',
        textAlign: 'center',
      },
    },
    // 2. Subtitle
    {
      id: 'subtitle-text',
      type: 'text',
      x: 35,
      y: 95,
      width: 630,
      height: 35,
      rotation: 0,
      visible: true,
      opacity: 1,
      zIndex: 2,
      text: 'All matching pairs discovered',
      style: {
        fontSize: 16,
        fontWeight: '500',
        color: '#94a3b8',
        textAlign: 'center',
      },
    },
  ];

  // Dynamic statistics elements positioning
  const activeStats: Array<{
    id: string;
    type: 'score' | 'moves' | 'pairs' | 'accuracy';
    label: string;
    valueColor: string;
  }> = [];

  if (showScore) {
    activeStats.push({
      id: 'stat-score',
      type: 'score',
      label: 'SCORE',
      valueColor: '#fbbf24',
    });
  }
  if (showMoves) {
    activeStats.push({
      id: 'stat-moves',
      type: 'moves',
      label: 'MOVES',
      valueColor: '#67e8f9',
    });
  }
  if (showPairs) {
    activeStats.push({
      id: 'stat-pairs',
      type: 'pairs',
      label: 'PAIRS',
      valueColor: '#34d399',
    });
  }
  if (showAccuracy) {
    activeStats.push({
      id: 'stat-accuracy',
      type: 'accuracy',
      label: 'ACCURACY',
      valueColor: '#c084fc',
    });
  }

  const statCount = activeStats.length;
  if (statCount > 0) {
    if (statCount <= 2) {
      // 1 row
      const colWidth = (630 - (statCount - 1) * 16) / statCount;
      activeStats.forEach((st, idx) => {
        cardChildren.push({
          id: st.id,
          type: st.type,
          x: 35 + idx * (colWidth + 16),
          y: 160,
          width: colWidth,
          height: 110,
          rotation: 0,
          visible: true,
          opacity: 1,
          zIndex: 2,
          label: st.label,
          style: {
            labelColor: '#94a3b8',
            valueColor: st.valueColor,
            backgroundColor: 'rgba(2, 6, 23, 0.85)',
            borderColor: '#334155',
            borderRadius: 16,
            fontSize: 26,
            textAlign: 'center',
          },
        } as ResultScreenElement);
      });
    } else {
      // 2 rows of 2 (or 1 in bottom row if 3)
      const colWidth = (630 - 16) / 2;
      activeStats.forEach((st, idx) => {
        const row = Math.floor(idx / 2);
        const col = idx % 2;
        const xPos =
          statCount === 3 && idx === 2
            ? 35 + colWidth / 2 + 8
            : 35 + col * (colWidth + 16);
        cardChildren.push({
          id: st.id,
          type: st.type,
          x: xPos,
          y: 155 + row * 115,
          width: colWidth,
          height: 100,
          rotation: 0,
          visible: true,
          opacity: 1,
          zIndex: 2,
          label: st.label,
          style: {
            labelColor: '#94a3b8',
            valueColor: st.valueColor,
            backgroundColor: 'rgba(2, 6, 23, 0.85)',
            borderColor: '#334155',
            borderRadius: 16,
            fontSize: 24,
            textAlign: 'center',
          },
        } as ResultScreenElement);
      });
    }
  }

  // 3. Play Again Action Button
  const buttonY = statCount > 2 ? 415 : statCount > 0 ? 305 : 180;
  cardChildren.push({
    id: 'btn-play-again',
    type: 'button',
    x: 85,
    y: buttonY,
    width: 530,
    height: 70,
    rotation: 0,
    visible: true,
    opacity: 1,
    zIndex: 2,
    text: 'PLAY AGAIN',
    action: 'playAgain',
    style: {
      backgroundColor: '#f59e0b',
      textColor: '#020617',
      fontSize: 20,
      fontWeight: '900',
      borderRadius: 18,
      shadow: true,
    },
  });

  const cardHeight = buttonY + 70 + 40;
  const cardY = Math.max(80, Math.floor((1000 - cardHeight) / 2));

  // Result Card Container
  return [
    {
      id: 'card-result-main',
      type: 'card',
      x: 150,
      y: cardY,
      width: 700,
      height: cardHeight,
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
      },
      children: cardChildren,
    },
  ];
}

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
  elements: generateDefaultResultScreenElements(),
};

export interface MemoryMatchScreensConfig {
  start: MemoryMatchStartScreenConfig;
  result: MemoryMatchResultScreenConfig;
}

export interface MemoryMatchGameConfig {
  cardBackUrl?: string | null;
  card?: MemoryMatchCardConfig;
  pairs: MemoryMatchPairConfig[];
  board: MemoryMatchBoardConfig;
  grid?: MemoryMatchGridConfig;
  gameplay: MemoryMatchGameplayConfig;
  ui?: MemoryMatchUiConfig;
  screens?: MemoryMatchScreensConfig;
}

export interface MemoryMatchConfig extends BaseGameConfig {
  gridRows?: number; // default: 4
  gridCols?: number; // default: 4
  pairCount?: number; // default: 8
  mismatchDelayMs?: number; // default: 850ms
  matchPoints?: number; // default: 100
  comboPoints?: number; // default: 30
  timeBonusMultiplier?: number; // default: 10
}

