/**
 * Shared Result Screen Types, Schemas, and Element Generators.
 * Decoupled from specific game implementations (Memory Match, Reaction Game, etc.)
 * 1000 x 1000 Logical Canvas Architecture
 */

export type ScreenBackgroundType = 'color' | 'theme' | 'image';

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
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  padding?: number;
  shadow?: boolean;
  opacity?: number;

  fontFamily?: string;
  fontSize?: number;
  textColor?: string;
  rankColor?: string;
  scoreColor?: string;
  headerColor?: string;

  rowSpacing?: number;
  rowBackgroundColor?: string;
  alternateRowBackgroundColor?: string;
  highlightCurrentPlayer?: boolean;
  highlightColor?: string;

  showHeader?: boolean;
  headerText?: string;
  showRank?: boolean;
  showPlayerName?: boolean;
  showScore?: boolean;
  showMoves?: boolean;
  showTime?: boolean;
  showAccuracy?: boolean;

  maxRows?: number;

  submission?: ResultLeaderboardSubmissionConfig;
  inputPlaceholder?: string;
  inputMaxLength?: number;
  submitButtonText?: string;
  successMessage?: string;
}

export interface ResultLeaderboardSubmissionConfig {
  inputPlaceholder?: string;
  inputMaxLength?: number;
  submitButtonText?: string;
  successMessage?: string;
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
  width: number;
  height: number;
}

export interface ResultScreenBackgroundConfig {
  type: ScreenBackgroundType;
  imageUrl?: string | null;
  color?: string | null;
  overlayOpacity?: number;
}

export interface ResultScreenConfig {
  backgroundType?: ScreenBackgroundType;
  backgroundColor?: string;
  backgroundImageUrl?: string | null;
  backgroundOverlayOpacity?: number;

  showScore?: boolean;
  showMoves?: boolean;
  showPairs?: boolean;
  showAccuracy?: boolean;

  canvas?: ResultScreenCanvasConfig;
  background?: ResultScreenBackgroundConfig;
  elements?: ResultScreenElement[];
}

export type MemoryMatchResultScreenConfig = ResultScreenConfig;

export const DEFAULT_RESULT_CANVAS_CONFIG: ResultScreenCanvasConfig = {
  width: 1000,
  height: 1000,
};

/**
 * Generates backward-compatible Result Screen elements for Memory Match.
 */
export function generateDefaultResultScreenElements(
  legacy?: Partial<ResultScreenConfig>
): ResultScreenElement[] {
  const showScore = legacy?.showScore !== false;
  const showMoves = legacy?.showMoves !== false;
  const showPairs = legacy?.showPairs !== false;
  const showAccuracy = legacy?.showAccuracy !== false;

  const cardChildren: ResultScreenElement[] = [
    {
      id: 'title-win',
      type: 'text',
      x: 40,
      y: 36,
      width: 640,
      height: 48,
      rotation: 0,
      visible: true,
      opacity: 1,
      zIndex: 2,
      text: 'YOU WON!',
      style: {
        fontSize: 34,
        fontWeight: '900',
        color: '#ffffff',
        textAlign: 'center',
        letterSpacing: 1,
      },
    },
  ];

  if (showScore) {
    cardChildren.push({
      id: 'stat-score',
      type: 'score',
      x: 40,
      y: 96,
      width: 640,
      height: 104,
      rotation: 0,
      visible: true,
      opacity: 1,
      zIndex: 2,
      label: 'FINAL SCORE',
      style: {
        labelColor: '#94a3b8',
        valueColor: '#10b981',
        backgroundColor: 'rgba(2, 6, 23, 0.85)',
        borderColor: '#334155',
        borderRadius: 18,
        fontSize: 38,
        textAlign: 'center',
      },
    });
  }

  const secondaryStats: ResultScreenElement[] = [];

  if (showMoves) {
    secondaryStats.push({
      id: 'stat-moves',
      type: 'moves',
      x: 0,
      y: 0,
      width: 0,
      height: 84,
      rotation: 0,
      visible: true,
      opacity: 1,
      zIndex: 2,
      label: 'MOVES',
      style: {
        labelColor: '#94a3b8',
        valueColor: '#ffffff',
        backgroundColor: 'rgba(2, 6, 23, 0.85)',
        borderColor: '#334155',
        borderRadius: 16,
        fontSize: 22,
        textAlign: 'center',
      },
    } as ResultScreenElement);
  }

  if (showPairs) {
    secondaryStats.push({
      id: 'stat-pairs',
      type: 'pairs',
      x: 0,
      y: 0,
      width: 0,
      height: 84,
      rotation: 0,
      visible: true,
      opacity: 1,
      zIndex: 2,
      label: 'PAIRS',
      style: {
        labelColor: '#94a3b8',
        valueColor: '#ffffff',
        backgroundColor: 'rgba(2, 6, 23, 0.85)',
        borderColor: '#334155',
        borderRadius: 16,
        fontSize: 22,
        textAlign: 'center',
      },
    } as ResultScreenElement);
  }

  if (showAccuracy) {
    secondaryStats.push({
      id: 'stat-accuracy',
      type: 'accuracy',
      x: 0,
      y: 0,
      width: 0,
      height: 84,
      rotation: 0,
      visible: true,
      opacity: 1,
      zIndex: 2,
      label: 'ACCURACY',
      style: {
        labelColor: '#94a3b8',
        valueColor: '#ffffff',
        backgroundColor: 'rgba(2, 6, 23, 0.85)',
        borderColor: '#334155',
        borderRadius: 16,
        fontSize: 22,
        textAlign: 'center',
      },
    } as ResultScreenElement);
  }

  const secCount = secondaryStats.length;
  if (secCount > 0) {
    const gap = 16;
    const totalW = 640;
    const itemW = Math.floor((totalW - gap * (secCount - 1)) / secCount);
    const startX = 40;
    const secY = showScore ? 216 : 96;

    secondaryStats.forEach((stat, idx) => {
      stat.x = startX + idx * (itemW + gap);
      stat.y = secY;
      stat.width = itemW;
      cardChildren.push(stat);
    });
  }

  const secY = showScore ? 216 : 96;
  const lbY = secCount > 0 ? secY + 84 + 18 : showScore ? 216 : 96;

  cardChildren.push({
    id: 'leaderboard-main',
    type: 'leaderboard',
    x: 40,
    y: lbY,
    width: 640,
    height: 300,
    rotation: 0,
    visible: true,
    opacity: 1,
    zIndex: 2,
    headerText: 'EVENT LEADERBOARD',
    style: {
      backgroundColor: 'rgba(2, 6, 23, 0.85)',
      borderColor: '#334155',
      borderRadius: 18,
      showHeader: true,
      headerText: 'EVENT LEADERBOARD',
      fontSize: 14,
      textColor: '#e2e8f0',
      rankColor: '#fbbf24',
      scoreColor: '#10b981',
    },
  });

  const btnY = lbY + 300 + 20;

  cardChildren.push({
    id: 'btn-play-again',
    type: 'button',
    x: 110,
    y: btnY,
    width: 500,
    height: 60,
    rotation: 0,
    visible: true,
    opacity: 1,
    zIndex: 2,
    text: 'PLAY AGAIN',
    action: 'playAgain',
    style: {
      backgroundColor: '#10b981',
      textColor: '#ffffff',
      fontSize: 18,
      fontWeight: '900',
      borderRadius: 18,
      shadow: true,
    },
  });

  return [
    {
      id: 'card-result-main',
      type: 'card',
      x: 140,
      y: 60,
      width: 720,
      height: 840,
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
 */
export function generateDefaultReactionResultScreenElements(
  _legacy?: Partial<ResultScreenConfig>
): ResultScreenElement[] {
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
    // 5.5. Reaction Rating
    {
      id: 'stat-reaction-rating',
      type: 'rating',
      x: 40,
      y: 400,
      width: 640,
      height: 60,
      rotation: 0,
      visible: true,
      opacity: 1,
      zIndex: 2,
      label: 'RATING',
      style: {
        labelColor: '#94a3b8',
        valueColor: '#fbbf24',
        backgroundColor: 'rgba(2, 6, 23, 0.85)',
        borderColor: '#334155',
        borderRadius: 16,
        fontSize: 24,
        textAlign: 'center',
      },
    },
    // 6. Leaderboard Component
    {
      id: 'leaderboard-reaction',
      type: 'leaderboard',
      x: 40,
      y: 470,
      width: 640,
      height: 200,
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
      y: 685,
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

/**
 * Generates default Result Screen elements tailored for Catch The Brand.
 */
export function generateDefaultCatchBrandResultScreenElements(
  _legacy?: Partial<ResultScreenConfig>
): ResultScreenElement[] {
  const cardChildren: ResultScreenElement[] = [
    // 1. Result Title
    {
      id: 'title-catch',
      type: 'text',
      x: 40,
      y: 30,
      width: 640,
      height: 48,
      rotation: 0,
      visible: true,
      opacity: 1,
      zIndex: 2,
      text: 'GAME OVER!',
      style: {
        fontSize: 34,
        fontWeight: '900',
        color: '#ffffff',
        textAlign: 'center',
        letterSpacing: 1,
      },
    },
    // 2. Final Score Big Metric
    {
      id: 'stat-score',
      type: 'score',
      x: 40,
      y: 88,
      width: 640,
      height: 108,
      rotation: 0,
      visible: true,
      opacity: 1,
      zIndex: 2,
      label: 'FINAL SCORE',
      style: {
        labelColor: '#94a3b8',
        valueColor: '#10b981',
        backgroundColor: 'rgba(2, 6, 23, 0.85)',
        borderColor: '#334155',
        borderRadius: 18,
        fontSize: 40,
        textAlign: 'center',
      },
    },
    // 3. Time Elapsed
    {
      id: 'stat-time',
      type: 'time',
      x: 40,
      y: 208,
      width: 310,
      height: 80,
      rotation: 0,
      visible: true,
      opacity: 1,
      zIndex: 2,
      label: 'TIME ELAPSED',
      style: {
        labelColor: '#94a3b8',
        valueColor: '#38bdf8',
        backgroundColor: 'rgba(2, 6, 23, 0.85)',
        borderColor: '#334155',
        borderRadius: 16,
        fontSize: 24,
        textAlign: 'center',
      },
    },
    // 4. Catch Accuracy
    {
      id: 'stat-accuracy',
      type: 'accuracy',
      x: 370,
      y: 208,
      width: 310,
      height: 80,
      rotation: 0,
      visible: true,
      opacity: 1,
      zIndex: 2,
      label: 'CATCH ACCURACY',
      style: {
        labelColor: '#94a3b8',
        valueColor: '#fbbf24',
        backgroundColor: 'rgba(2, 6, 23, 0.85)',
        borderColor: '#334155',
        borderRadius: 16,
        fontSize: 24,
        textAlign: 'center',
      },
    },
    // 5. Leaderboard Component
    {
      id: 'leaderboard-catch',
      type: 'leaderboard',
      x: 40,
      y: 300,
      width: 640,
      height: 350,
      rotation: 0,
      visible: true,
      opacity: 1,
      zIndex: 2,
      headerText: 'EVENT LEADERBOARD',
      style: {
        backgroundColor: 'rgba(2, 6, 23, 0.85)',
        borderColor: '#334155',
        borderRadius: 16,
        showHeader: true,
        headerText: 'EVENT LEADERBOARD',
        fontSize: 14,
        textColor: '#e2e8f0',
        rankColor: '#fbbf24',
        scoreColor: '#10b981',
      },
    },
    // 6. Play Again Action Button
    {
      id: 'btn-play-again',
      type: 'button',
      x: 110,
      y: 665,
      width: 500,
      height: 60,
      rotation: 0,
      visible: true,
      opacity: 1,
      zIndex: 2,
      text: 'PLAY AGAIN',
      action: 'playAgain',
      style: {
        backgroundColor: '#f59e0b',
        textColor: '#020617',
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
      y: 115,
      width: 720,
      height: 750,
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
 * Recursively queries element visibility in a ResultScreenElement tree.
 * Matches by exact ID or element type (or array of matchers).
 */
export function findResultScreenElementVisibility(
  elements: ResultScreenElement[],
  idOrType: string | string[]
): boolean | undefined {
  if (!Array.isArray(elements) || elements.length === 0) return undefined;
  const matchers = Array.isArray(idOrType) ? idOrType : [idOrType];
  for (const el of elements) {
    if (matchers.includes(el.id) || matchers.includes(el.type)) return el.visible !== false;
    if (Array.isArray((el as any).children)) {
      const found = findResultScreenElementVisibility((el as any).children, matchers);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

/**
 * Recursively updates element visibility in a ResultScreenElement tree.
 * Matches by exact ID or element type (or array of matchers).
 */
export function updateResultScreenElementVisibility(
  elements: ResultScreenElement[],
  idOrType: string | string[],
  visible: boolean
): ResultScreenElement[] {
  if (!Array.isArray(elements)) return [];
  const matchers = Array.isArray(idOrType) ? idOrType : [idOrType];
  return elements.map((el) => {
    let nextVis = el.visible;
    if (matchers.includes(el.id) || matchers.includes(el.type)) {
      nextVis = visible;
    }
    const children = Array.isArray((el as any).children)
      ? updateResultScreenElementVisibility((el as any).children, matchers, visible)
      : undefined;
    return {
      ...el,
      visible: nextVis,
      ...(children ? { children } : {}),
    };
  });
}

/**
 * Ensures element visibility in a ResultScreenElement tree.
 * If element exists, updates visibility. If it doesn't exist and visible=true, creates and appends it.
 */
export function ensureResultScreenElementVisibility(
  elements: ResultScreenElement[],
  idOrType: string | string[],
  visible: boolean,
  fallbackCreate?: () => ResultScreenElement
): ResultScreenElement[] {
  const exists = findResultScreenElementVisibility(elements, idOrType);
  if (exists === undefined && visible && fallbackCreate) {
    const newEl = fallbackCreate();
    let inserted = false;
    const mapped = elements.map((el) => {
      if (!inserted && (el.type === 'card' || el.id === 'card-result-main')) {
        inserted = true;
        const currentChildren = Array.isArray((el as any).children) ? (el as any).children : [];
        return {
          ...el,
          children: [...currentChildren, newEl],
        };
      }
      return el;
    });
    if (inserted) return mapped;
    return [...elements, newEl];
  }
  return updateResultScreenElementVisibility(elements, idOrType, visible);
}

/**
 * Recursively finds text content for a text element by ID or type.
 */
export function findResultScreenElementText(
  elements: ResultScreenElement[],
  idOrType: string
): string | undefined {
  for (const el of elements) {
    if ((el.id === idOrType || el.type === idOrType) && el.type === 'text') {
      return (el as ResultTextElement).text;
    }
    if (Array.isArray((el as any).children)) {
      const found = findResultScreenElementText((el as any).children, idOrType);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

/**
 * Recursively updates text content for a text element by ID or type.
 */
export function updateResultScreenElementText(
  elements: ResultScreenElement[],
  idOrType: string,
  newText: string
): ResultScreenElement[] {
  return elements.map((el) => {
    let nextEl = { ...el };
    if ((el.id === idOrType || el.type === idOrType) && el.type === 'text') {
      (nextEl as ResultTextElement).text = newText;
    }
    if (Array.isArray((el as any).children)) {
      (nextEl as any).children = updateResultScreenElementText((el as any).children, idOrType, newText);
    }
    return nextEl;
  });
}

/**
 * Recursively updates button label text by ID or action.
 */
export function updateResultScreenButtonText(
  elements: ResultScreenElement[],
  idOrAction: string,
  newText: string
): ResultScreenElement[] {
  return elements.map((el) => {
    let nextEl = { ...el };
    if (el.type === 'button') {
      const btn = el as ResultButtonElement;
      if (btn.id === idOrAction || btn.action === idOrAction) {
        btn.text = newText;
      }
    }
    if (Array.isArray((el as any).children)) {
      (nextEl as any).children = updateResultScreenButtonText((el as any).children, idOrAction, newText);
    }
    return nextEl;
  });
}

export const DEFAULT_RESULT_SCREEN_CONFIG: ResultScreenConfig = {
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
