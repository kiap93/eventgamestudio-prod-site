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

export const MIN_BOARD_ROWS = 2;
export const MAX_BOARD_ROWS = 8;
export const MIN_BOARD_COLS = 2;
export const MAX_BOARD_COLS = 8;
export const MIN_TOTAL_CARDS = 4;
export const MAX_TOTAL_CARDS = 48;

export type MemoryMatchLayoutMode = 'grid' | 'random' | 'up-down' | 'up-down-rotation';
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
  layoutMode: MemoryMatchLayoutMode; // 'grid' | 'random' | 'up-down' | 'up-down-rotation'
  rows: number; // default: 4 (range: 2 to 8)
  cols: number; // default: 4 (range: 2 to 8)
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

export * from "../shared/resultScreenTypes";
export * from "../shared/startScreenTypes";
import { ScreenBackgroundType } from "../shared/resultScreenTypes";
import { StartScreenConfig } from "../shared/startScreenTypes";

export interface MemoryMatchStartScreenConfig extends StartScreenConfig {
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
  | 'leaderboard'
  | 'group'
  | 'average-reaction'
  | 'best-reaction'
  | 'worst-reaction'
  | 'round-results'
  | 'rating';

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
  locked?: boolean; // Lock toggle (default: false)
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

export interface ResultAverageReactionElement extends ResultScreenBaseElement {
  type: 'average-reaction';
  label?: string;
  style?: ResultStatStyle;
}

export interface ResultBestReactionElement extends ResultScreenBaseElement {
  type: 'best-reaction';
  label?: string;
  style?: ResultStatStyle;
}

export interface ResultWorstReactionElement extends ResultScreenBaseElement {
  type: 'worst-reaction';
  label?: string;
  style?: ResultStatStyle;
}

export interface ResultRoundResultsElement extends ResultScreenBaseElement {
  type: 'round-results';
  label?: string;
  style?: ResultStatStyle & {
    chipBackgroundColor?: string;
    chipTextColor?: string;
    chipBorderColor?: string;
    chipBorderRadius?: number;
  };
}

export interface ResultRatingElement extends ResultScreenBaseElement {
  type: 'rating';
  label?: string;
  style?: ResultStatStyle & {
    badgeColor?: string;
  };
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

export interface ResultLeaderboardStyle {
  // Container & Background styling
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  padding?: number;
  shadow?: boolean;
  opacity?: number;

  // Typography & Colors
  fontFamily?: string;
  fontSize?: number; // base font size in canvas units (default: 16)
  textColor?: string; // default row text color
  rankColor?: string; // color of rank numbers/badges
  scoreColor?: string; // color of score numbers
  headerColor?: string; // color of table/section header

  // Row Styling
  rowSpacing?: number;
  rowBackgroundColor?: string;
  alternateRowBackgroundColor?: string;
  highlightCurrentPlayer?: boolean;
  highlightColor?: string;

  // Header & Columns visibility
  showHeader?: boolean;
  headerText?: string;
  showRank?: boolean;
  showPlayerName?: boolean;
  showScore?: boolean;
  showMoves?: boolean;
  showTime?: boolean;
  showAccuracy?: boolean;

  // Data Limits
  maxRows?: number; // default: 5 (range: 1-10)

  // Player Submission config
  submission?: ResultLeaderboardSubmissionConfig;
  inputPlaceholder?: string;
  inputMaxLength?: number;
  submitButtonText?: string;
  successMessage?: string;
}

export interface ResultLeaderboardSubmissionConfig {
  inputPlaceholder?: string; // default: 'Enter your name'
  inputMaxLength?: number; // default: 20
  submitButtonText?: string; // default: 'SUBMIT SCORE'
  successMessage?: string; // default: 'Score submitted!'
}

export interface ResultLeaderboardElement extends ResultScreenBaseElement {
  type: 'leaderboard';
  maxRows?: number;
  headerText?: string;
  showHeader?: boolean;
  showRank?: boolean;
  showPlayerName?: boolean;
  showScore?: boolean;
  showMoves?: boolean;
  showTime?: boolean;
  showAccuracy?: boolean;
  submission?: ResultLeaderboardSubmissionConfig;
  inputPlaceholder?: string;
  inputMaxLength?: number;
  submitButtonText?: string;
  successMessage?: string;
  style?: ResultLeaderboardStyle;
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
  | ResultLeaderboardElement
  | ResultGroupElement
  | ResultAverageReactionElement
  | ResultBestReactionElement
  | ResultWorstReactionElement
  | ResultRoundResultsElement
  | ResultRatingElement;

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
  backgroundType?: ScreenBackgroundType;
  backgroundColor?: string; // default '#0f172a'
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

/**
 * Generates default Result Screen elements tailored for Reaction Game.
 * Layout:
 * - GREAT! (Title)
 * - 219 ms AVERAGE REACTION
 * - BEST 195 ms, WORST 247 ms
 * - ROUND RESULTS 218 231 195 247 204
 * - LEADERBOARD
 * - [ PLAY AGAIN ]
 */
export function generateDefaultReactionResultScreenElements(_legacy?: Partial<MemoryMatchResultScreenConfig>): ResultScreenElement[] {
  const cardChildren: ResultScreenElement[] = [
    // 1. Result Title
    {
      id: 'title-reaction',
      type: 'text',
      x: 40,
      y: 30,
      width: 640,
      height: 48,
      rotation: 0,
      visible: true,
      opacity: 1,
      zIndex: 2,
      text: 'GREAT REFLEXES!',
      style: {
        fontSize: 34,
        fontWeight: '900',
        color: '#ffffff',
        textAlign: 'center',
        letterSpacing: 1,
      },
    },
    // 2. Average Reaction Big Metric
    {
      id: 'stat-average-reaction',
      type: 'average-reaction',
      x: 40,
      y: 88,
      width: 640,
      height: 108,
      rotation: 0,
      visible: true,
      opacity: 1,
      zIndex: 2,
      label: 'AVERAGE REACTION',
      style: {
        labelColor: '#94a3b8',
        valueColor: '#38bdf8',
        backgroundColor: 'rgba(2, 6, 23, 0.85)',
        borderColor: '#334155',
        borderRadius: 18,
        fontSize: 40,
        textAlign: 'center',
      },
    },
    // 3. Best Reaction
    {
      id: 'stat-best-reaction',
      type: 'best-reaction',
      x: 40,
      y: 208,
      width: 310,
      height: 80,
      rotation: 0,
      visible: true,
      opacity: 1,
      zIndex: 2,
      label: 'BEST REACTION',
      style: {
        labelColor: '#94a3b8',
        valueColor: '#34d399',
        backgroundColor: 'rgba(2, 6, 23, 0.85)',
        borderColor: '#334155',
        borderRadius: 16,
        fontSize: 24,
        textAlign: 'center',
      },
    },
    // 4. Worst Reaction
    {
      id: 'stat-worst-reaction',
      type: 'worst-reaction',
      x: 370,
      y: 208,
      width: 310,
      height: 80,
      rotation: 0,
      visible: true,
      opacity: 1,
      zIndex: 2,
      label: 'WORST REACTION',
      style: {
        labelColor: '#94a3b8',
        valueColor: '#f87171',
        backgroundColor: 'rgba(2, 6, 23, 0.85)',
        borderColor: '#334155',
        borderRadius: 16,
        fontSize: 24,
        textAlign: 'center',
      },
    },
    // 5. Round Results Chips
    {
      id: 'stat-round-results',
      type: 'round-results',
      x: 40,
      y: 300,
      width: 640,
      height: 90,
      rotation: 0,
      visible: true,
      opacity: 1,
      zIndex: 2,
      label: 'ROUND RESULTS',
      style: {
        labelColor: '#94a3b8',
        valueColor: '#ffffff',
        backgroundColor: 'rgba(2, 6, 23, 0.85)',
        borderColor: '#334155',
        borderRadius: 16,
        fontSize: 18,
        textAlign: 'center',
      },
    },
    // 6. Leaderboard Component
    {
      id: 'leaderboard-reaction',
      type: 'leaderboard',
      x: 40,
      y: 402,
      width: 640,
      height: 250,
      rotation: 0,
      visible: true,
      opacity: 1,
      zIndex: 2,
      headerText: 'TOP REACTION TIMES',
      style: {
        backgroundColor: 'rgba(2, 6, 23, 0.85)',
        borderColor: '#334155',
        borderRadius: 16,
        showHeader: true,
        headerText: 'TOP REACTION TIMES',
        fontSize: 14,
        textColor: '#e2e8f0',
        rankColor: '#fbbf24',
        scoreColor: '#38bdf8',
      },
    },
    // 7. Play Again Action Button
    {
      id: 'btn-play-again',
      type: 'button',
      x: 110,
      y: 672,
      width: 500,
      height: 60,
      rotation: 0,
      visible: true,
      opacity: 1,
      zIndex: 2,
      text: 'PLAY AGAIN',
      action: 'playAgain',
      style: {
        backgroundColor: '#ef4444',
        textColor: '#ffffff',
        fontSize: 18,
        fontWeight: '900',
        borderRadius: 18,
        shadow: true,
      },
    },
  ];

  return [
    {
      id: 'card-result-main',
      type: 'card',
      x: 140,
      y: 110,
      width: 720,
      height: 760,
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

