import {
  MemoryMatchBoardConfig,
  MemoryMatchGridConfig,
  MemoryMatchRandomLayoutConfig,
  MemoryMatchCardConfig,
  MemoryMatchLayoutMode,
  MIN_BOARD_ROWS,
  MAX_BOARD_ROWS,
  MIN_BOARD_COLS,
  MAX_BOARD_COLS,
  MIN_TOTAL_CARDS,
  MAX_TOTAL_CARDS,
} from './types';

export {
  MIN_BOARD_ROWS,
  MAX_BOARD_ROWS,
  MIN_BOARD_COLS,
  MAX_BOARD_COLS,
  MIN_TOTAL_CARDS,
  MAX_TOTAL_CARDS,
};

export interface CardLayoutPosition {
  x: number; // Center X percentage (0 - 100%) or coordinate
  y: number; // Center Y percentage (0 - 100%) or coordinate
  rotation: number; // Rotation in degrees
  width: number; // Authoritative card width in px
  height: number; // Authoritative card height in px
  widthPercent: number; // Responsive width %
  heightPercent: number; // Responsive height %
  zIndex: number;
}

export type CardPosition = CardLayoutPosition;

export interface BoardDimensionResult {
  rows: number;
  cols: number;
  totalCards: number;
  isEven: boolean;
  requiredPairs: number;
  warning?: string;
}

export const DEFAULT_CARD_CONFIG: MemoryMatchCardConfig = {
  width: 90,
  height: 90,
  borderRadius: 14,
  rotationMode: 'none',
  rotation: 0,
  rotationRange: 8,
};

export const DEFAULT_RANDOM_LAYOUT_CONFIG: MemoryMatchRandomLayoutConfig = {
  minSpacing: 10,
  rotationMin: -8,
  rotationMax: 8,
};

export const DEFAULT_BOARD_CONFIG: MemoryMatchBoardConfig = {
  layoutMode: 'grid',
  rows: 4,
  cols: 4,
  cardGap: 10,
  randomLayout: DEFAULT_RANDOM_LAYOUT_CONFIG,
  card: DEFAULT_CARD_CONFIG,
};

/**
 * Normalizes card dimension, corner radius, and rotation parameters safely.
 */
export function normalizeCardConfig(
  rawCard?: Partial<MemoryMatchCardConfig> | null
): MemoryMatchCardConfig {
  const width = typeof rawCard?.width === 'number' ? Math.max(50, Math.min(300, rawCard.width)) : DEFAULT_CARD_CONFIG.width;
  const height = typeof rawCard?.height === 'number' ? Math.max(50, Math.min(300, rawCard.height)) : DEFAULT_CARD_CONFIG.height;
  const borderRadius = typeof rawCard?.borderRadius === 'number' ? Math.max(0, Math.min(48, rawCard.borderRadius)) : DEFAULT_CARD_CONFIG.borderRadius;
  const rotationMode = rawCard?.rotationMode === 'fixed' || rawCard?.rotationMode === 'random' || rawCard?.rotationMode === 'none'
    ? rawCard.rotationMode
    : DEFAULT_CARD_CONFIG.rotationMode;
  const rotation = typeof rawCard?.rotation === 'number' ? Math.max(-45, Math.min(45, rawCard.rotation)) : DEFAULT_CARD_CONFIG.rotation;
  const rotationRange = typeof rawCard?.rotationRange === 'number' ? Math.max(0, Math.min(30, rawCard.rotationRange)) : DEFAULT_CARD_CONFIG.rotationRange;

  return {
    width,
    height,
    borderRadius,
    rotationMode,
    rotation,
    rotationRange,
  };
}

/**
 * Calculates total card count and matching pairs from rows and cols.
 */
export function calculateBoardDimensions(rows: number, cols: number): BoardDimensionResult {
  const safeRows = Math.min(MAX_BOARD_ROWS, Math.max(MIN_BOARD_ROWS, Math.floor(rows || 4)));
  const safeCols = Math.min(MAX_BOARD_COLS, Math.max(MIN_BOARD_COLS, Math.floor(cols || 4)));
  const totalCards = safeRows * safeCols;
  const isEven = totalCards % 2 === 0;
  const requiredPairs = Math.floor(totalCards / 2);

  let warning: string | undefined = undefined;
  if (!isEven) {
    warning = `Odd card count (${totalCards}). Memory match requires an even number of cards.`;
  } else if (totalCards > MAX_TOTAL_CARDS) {
    warning = `Total card count (${totalCards}) exceeds maximum allowed cards (${MAX_TOTAL_CARDS}).`;
  }

  return {
    rows: safeRows,
    cols: safeCols,
    totalCards,
    isEven,
    requiredPairs,
    warning,
  };
}

/**
 * Safely normalizes any board configuration input (handling legacy grid objects and missing fields).
 */
export function normalizeBoardConfig(
  rawBoard?: Partial<MemoryMatchBoardConfig> | null,
  legacyGrid?: Partial<MemoryMatchGridConfig> | null
): MemoryMatchBoardConfig {
  const rows = Number(rawBoard?.rows) || Number(legacyGrid?.rows) || 4;
  const cols = Number(rawBoard?.cols) || Number(legacyGrid?.cols) || 4;
  const rawMode = rawBoard?.layoutMode;
  const layoutMode: MemoryMatchLayoutMode =
    rawMode === 'random' || rawMode === 'up-down' || rawMode === 'up-down-rotation'
      ? rawMode
      : 'grid';
  const cardGap = typeof rawBoard?.cardGap === 'number' ? Math.max(0, Math.min(80, rawBoard.cardGap)) : 12;

  const rawRandom = rawBoard?.randomLayout;
  const minSpacing =
    typeof rawRandom?.minSpacing === 'number'
      ? Math.max(0, Math.min(40, rawRandom.minSpacing))
      : DEFAULT_RANDOM_LAYOUT_CONFIG.minSpacing;

  let rotationMin =
    typeof rawRandom?.rotationMin === 'number'
      ? Math.max(-15, Math.min(0, rawRandom.rotationMin))
      : DEFAULT_RANDOM_LAYOUT_CONFIG.rotationMin;

  let rotationMax =
    typeof rawRandom?.rotationMax === 'number'
      ? Math.max(0, Math.min(15, rawRandom.rotationMax))
      : DEFAULT_RANDOM_LAYOUT_CONFIG.rotationMax;

  if (rotationMin > rotationMax) {
    [rotationMin, rotationMax] = [rotationMax, rotationMin];
  }

  const card = normalizeCardConfig(rawBoard?.card);

  return {
    layoutMode,
    rows: Math.max(MIN_BOARD_ROWS, Math.min(MAX_BOARD_ROWS, rows)),
    cols: Math.max(MIN_BOARD_COLS, Math.min(MAX_BOARD_COLS, cols)),
    cardGap,
    randomLayout: {
      minSpacing,
      rotationMin,
      rotationMax,
    },
    card,
  };
}

/**
 * Validates board layout validity.
 */
export function validateBoardLayout(board?: Partial<MemoryMatchBoardConfig> | null): {
  isValid: boolean;
  totalCards: number;
  requiredPairs: number;
  error?: string;
} {
  const normalized = normalizeBoardConfig(board);
  const dims = calculateBoardDimensions(normalized.rows, normalized.cols);

  if (!dims.isEven) {
    return {
      isValid: false,
      totalCards: dims.totalCards,
      requiredPairs: dims.requiredPairs,
      error: `Card dimensions ${dims.rows} × ${dims.cols} produce an odd count (${dims.totalCards}). Even total is required.`,
    };
  }

  if (dims.totalCards > MAX_TOTAL_CARDS) {
    return {
      isValid: false,
      totalCards: dims.totalCards,
      requiredPairs: dims.requiredPairs,
      error: `Card count (${dims.totalCards}) exceeds maximum supported cards (${MAX_TOTAL_CARDS}).`,
    };
  }

  return {
    isValid: true,
    totalCards: dims.totalCards,
    requiredPairs: dims.requiredPairs,
  };
}

/**
 * Calculates CSS Grid layout styles for Grid mode, adapting to non-square card dimensions.
 */
export function calculateGridLayout(
  rows: number,
  cols: number,
  cardGap = 12,
  cardConfig?: Partial<MemoryMatchCardConfig> | null
) {
  const safeRows = Math.max(MIN_BOARD_ROWS, Math.min(MAX_BOARD_ROWS, rows));
  const safeCols = Math.max(MIN_BOARD_COLS, Math.min(MAX_BOARD_COLS, cols));
  const card = normalizeCardConfig(cardConfig);

  const containerAspect = (safeCols * card.width) / (safeRows * card.height);
  const cardAspect = card.width / card.height;

  return {
    gridTemplateColumns: `repeat(${safeCols}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${safeRows}, minmax(0, 1fr))`,
    aspectRatio: `${containerAspect}`,
    cardAspectRatio: `${cardAspect}`,
    gap: `${cardGap}px`,
  };
}

/**
 * Generates stable, non-overlapping random card positions completely bounded inside the play area.
 * Returns normalized percentage coordinates (0 - 100%) so layout scales responsively
 * across mobile, tablet, and desktop viewports.
 *
 * Guaranteed properties:
 * - Cards are always 100% inside board boundaries [margin, 100 - margin]
 * - Uses bounded random placement attempts with minimum spacing constraint
 * - Falls back to a deterministic jittered cell distribution if random placement cannot fit all cards
 * - Accounts for card width/height proportions and rotation settings
 */
export function generateRandomCardPositions(
  cardCount: number,
  boardConfig?: Partial<MemoryMatchBoardConfig> | null,
  cardConfigInput?: Partial<MemoryMatchCardConfig> | null
): CardLayoutPosition[] {
  const count = Math.max(2, cardCount);
  const normalized = normalizeBoardConfig(boardConfig);
  const card = normalizeCardConfig(cardConfigInput || normalized.card);
  const { minSpacing, rotationMin, rotationMax } = normalized.randomLayout;

  // Approximate optimal card size based on total card count and card aspect ratio
  const colsApprox = Math.ceil(Math.sqrt(count * 1.15));
  const rowsApprox = Math.ceil(count / colsApprox);

  // Authoritative card dimensions directly from card config (independent from layout mode)
  const configuredCardWidth = card.width;
  const configuredCardHeight = card.height;

  // Normalized logical percentage dimensions on 1000x1000 canvas
  const cardWidthPercent = Math.min(26, Math.max(6, Math.round((configuredCardWidth / 1000) * 100 * 10) / 10));
  const cardHeightPercent = Math.min(30, Math.max(6, Math.round((configuredCardHeight / 1000) * 100 * 10) / 10));

  // Bounding margins to keep cards strictly inside container
  const halfW = cardWidthPercent / 2;
  const halfH = cardHeightPercent / 2;
  const marginPercent = 3.5;
  const minX = halfW + marginPercent;
  const maxX = 100 - halfW - marginPercent;
  const minY = halfH + marginPercent;
  const maxY = 100 - halfH - marginPercent;

  // Min center-to-center distance required between cards (uses Card Gap as spacing clearance)
  const effectiveCardGap = typeof normalized.cardGap === 'number' ? normalized.cardGap : (minSpacing ?? 12);
  const spacingPercent = (effectiveCardGap / 500) * 100;
  const minDistanceX = cardWidthPercent * 0.72 + spacingPercent;
  const minDistanceY = cardHeightPercent * 0.72 + spacingPercent;

  const positions: CardLayoutPosition[] = [];
  const maxAttempts = 80;

  // Determine rotation range from card config or random layout config
  let rotMin = rotationMin;
  let rotMax = rotationMax;

  if (card.rotationMode === 'none') {
    rotMin = 0;
    rotMax = 0;
  } else if (card.rotationMode === 'fixed') {
    rotMin = card.rotation;
    rotMax = card.rotation;
  } else if (card.rotationMode === 'random') {
    const range = card.rotationRange ?? 8;
    rotMin = -range;
    rotMax = range;
  }

  for (let i = 0; i < count; i++) {
    let placed = false;

    // Try random candidate coordinates with minimum clearance
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const candidateX = minX + Math.random() * (maxX - minX);
      const candidateY = minY + Math.random() * (maxY - minY);

      let overlaps = false;
      for (const existing of positions) {
        const dx = Math.abs(candidateX - existing.x);
        const dy = Math.abs(candidateY - existing.y);

        if (dx < minDistanceX && dy < minDistanceY) {
          overlaps = true;
          break;
        }
      }

      if (!overlaps) {
        const rotSpan = rotMax - rotMin;
        const candidateRot =
          rotSpan > 0 ? rotMin + Math.random() * rotSpan : (rotMin + rotMax) / 2;

        positions.push({
          x: Math.round(candidateX * 10) / 10,
          y: Math.round(candidateY * 10) / 10,
          rotation: Math.round(candidateRot * 10) / 10,
          width: configuredCardWidth,
          height: configuredCardHeight,
          widthPercent: cardWidthPercent,
          heightPercent: cardHeightPercent,
          zIndex: i + 1,
        });
        placed = true;
        break;
      }
    }

    // Fallback: Deterministic jittered cell slot
    if (!placed) {
      const cellCols = colsApprox;
      const cellRows = rowsApprox;
      const colIdx = i % cellCols;
      const rowIdx = Math.floor(i / cellCols);

      const cellWidth = (maxX - minX) / Math.max(1, cellCols - 1 || 1);
      const cellHeight = (maxY - minY) / Math.max(1, cellRows - 1 || 1);

      const jitterRangeX = cellWidth * 0.15;
      const jitterRangeY = cellHeight * 0.15;

      const baseX = cellCols === 1 ? 50 : minX + colIdx * cellWidth;
      const baseY = cellRows === 1 ? 50 : minY + rowIdx * cellHeight;

      const jitterX = (Math.random() - 0.5) * 2 * jitterRangeX;
      const jitterY = (Math.random() - 0.5) * 2 * jitterRangeY;

      const rotSpan = rotMax - rotMin;
      const rot = rotSpan > 0 ? rotMin + Math.random() * rotSpan : (rotMin + rotMax) / 2;

      positions.push({
        x: Math.min(maxX, Math.max(minX, Math.round((baseX + jitterX) * 10) / 10)),
        y: Math.min(maxY, Math.max(minY, Math.round((baseY + jitterY) * 10) / 10)),
        rotation: Math.round(rot * 10) / 10,
        width: configuredCardWidth,
        height: configuredCardHeight,
        widthPercent: cardWidthPercent,
        heightPercent: cardHeightPercent,
        zIndex: i + 1,
      });
    }
  }

  return positions;
}

/**
 * Calculates a single card position in the Up-Down staggered grid layout.
 * Returns normalized percentage coordinates (0 - 100%).
 * The layout algorithm owns X and Y positioning only.
 * Card dimensions (width, height) are owned strictly by the card configuration.
 */
export function calculateUpDownPosition(
  colIdx: number,
  rowIdx: number,
  cols: number,
  rows: number,
  bounds: { minX: number; maxX: number; usableMinY: number; usableMaxY: number; offsetY: number }
): { x: number; y: number } {
  const colX = cols === 1 ? 50 : bounds.minX + (colIdx / (cols - 1)) * (bounds.maxX - bounds.minX);
  const baseY = rows === 1 ? 50 : bounds.usableMinY + (rowIdx / (rows - 1)) * (bounds.usableMaxY - bounds.usableMinY);

  // Alternate: even columns higher (Up), odd columns lower (Down)
  const isUp = colIdx % 2 === 0;
  const cardY = isUp ? baseY - bounds.offsetY : baseY + bounds.offsetY;

  return {
    x: Math.min(bounds.maxX, Math.max(bounds.minX, Math.round(colX * 10) / 10)),
    y: Math.round(cardY * 10) / 10,
  };
}

/**
 * Generates fixed Up-Down alternating staggered card positions.
 * Cards alternate between higher and lower vertical positions across columns
 * to create a clear up-down visual rhythm while preventing overlaps and respecting bounds.
 *
 * Card dimensions (width, height) remain authoritative from card configuration
 * and are completely independent from the layout algorithm.
 *
 * If withRandomRotation is true (Up-Down + Random Rotation), applies the existing
 * random rotation behavior from Memory Match.
 */
export function generateUpDownCardPositions(
  cardCount: number,
  boardConfig?: Partial<MemoryMatchBoardConfig> | null,
  cardConfigInput?: Partial<MemoryMatchCardConfig> | null,
  withRandomRotation = false
): CardLayoutPosition[] {
  const count = Math.max(2, cardCount);
  const normalized = normalizeBoardConfig(boardConfig);
  const card = normalizeCardConfig(cardConfigInput || normalized.card);
  const { rotationMin, rotationMax } = normalized.randomLayout;

  const cols = Math.max(MIN_BOARD_COLS, Math.min(MAX_BOARD_COLS, normalized.cols));
  const rows = Math.max(MIN_BOARD_ROWS, Math.min(MAX_BOARD_ROWS, normalized.rows));

  // Authoritative card dimensions directly from card config (independent from layout mode)
  const configuredCardWidth = card.width;
  const configuredCardHeight = card.height;
  const cardGap = typeof normalized.cardGap === 'number' ? normalized.cardGap : 12;

  // Unscaled pixel bounding box matching exact card spacing:
  // horizontal distance between adjacent card centers = configuredCardWidth + cardGap
  // vertical distance between adjacent row baselines = configuredCardHeight + cardGap
  const boardWidthPx = Math.max(1, cols * configuredCardWidth + Math.max(0, cols - 1) * cardGap);
  const offsetYPx = Math.max(12, Math.round(configuredCardHeight * 0.15));
  const boardHeightPx = Math.max(1, rows * configuredCardHeight + Math.max(0, rows - 1) * cardGap + offsetYPx * 2);

  // Normalized logical percentage dimensions
  const cardWidthPercent = Math.min(40, Math.max(6, Math.round((configuredCardWidth / boardWidthPx) * 100 * 10) / 10));
  const cardHeightPercent = Math.min(40, Math.max(6, Math.round((configuredCardHeight / boardHeightPx) * 100 * 10) / 10));

  const halfW = cardWidthPercent / 2;
  const halfH = cardHeightPercent / 2;
  const marginPercent = 1.0;
  const minX = halfW + marginPercent;
  const maxX = 100 - halfW - marginPercent;
  const minY = halfH + marginPercent;
  const maxY = 100 - halfH - marginPercent;

  const totalHeightSpan = Math.max(10, maxY - minY);
  let offsetY = Math.min(cardHeightPercent * 0.28, (totalHeightSpan / Math.max(1, rows - 1)) * 0.22);
  offsetY = Math.max(2.5, Math.round(offsetY * 10) / 10);

  let usableMinY = minY + offsetY;
  let usableMaxY = maxY - offsetY;

  if (usableMinY > usableMaxY) {
    offsetY = Math.max(0, totalHeightSpan * 0.1);
    usableMinY = minY + offsetY;
    usableMaxY = maxY - offsetY;
  }

  // Determine rotation range
  let rotMin = rotationMin;
  let rotMax = rotationMax;

  if (withRandomRotation) {
    const range = card.rotationRange ?? (card.rotationMode === 'random' ? card.rotationRange : (rotationMax || 8));
    rotMin = typeof rotationMin === 'number' && rotationMin !== 0 ? rotationMin : -range;
    rotMax = typeof rotationMax === 'number' && rotationMax !== 0 ? rotationMax : range;
  } else {
    if (card.rotationMode === 'fixed') {
      rotMin = card.rotation;
      rotMax = card.rotation;
    } else {
      rotMin = 0;
      rotMax = 0;
    }
  }

  const positions: CardLayoutPosition[] = [];

  for (let i = 0; i < count; i++) {
    const colIdx = i % cols;
    const rowIdx = Math.floor(i / cols) % rows;

    const { x, y } = calculateUpDownPosition(colIdx, rowIdx, cols, rows, {
      minX,
      maxX,
      usableMinY,
      usableMaxY,
      offsetY,
    });

    let rotation = 0;
    if (withRandomRotation) {
      const rotSpan = rotMax - rotMin;
      rotation = rotSpan > 0 ? rotMin + Math.random() * rotSpan : (rotMin + rotMax) / 2;
    } else if (card.rotationMode === 'fixed') {
      rotation = card.rotation;
    }

    positions.push({
      x,
      y: Math.min(maxY, Math.max(minY, y)),
      rotation: Math.round(rotation * 10) / 10,
      width: configuredCardWidth,
      height: configuredCardHeight,
      widthPercent: cardWidthPercent,
      heightPercent: cardHeightPercent,
      zIndex: i + 1,
    });
  }

  if (positions.length !== count) {
    console.warn('generateUpDownCardPositions position count mismatch', {
      expected: count,
      actual: positions.length,
      cardCount,
      rows,
      cols,
    });
  }

  return positions.slice(0, count);
}

/**
 * Master dispatcher for generating card positions according to board layoutMode.
 * Strictly guarantees positions.length === cardCount.
 */
export function generateCardPositions(
  cardCount: number,
  boardConfig?: Partial<MemoryMatchBoardConfig> | null,
  cardConfigInput?: Partial<MemoryMatchCardConfig> | null
): CardLayoutPosition[] {
  const normalized = normalizeBoardConfig(boardConfig);
  let positions: CardLayoutPosition[];
  if (normalized.layoutMode === 'up-down') {
    positions = generateUpDownCardPositions(cardCount, normalized, cardConfigInput, false);
  } else if (normalized.layoutMode === 'up-down-rotation') {
    positions = generateUpDownCardPositions(cardCount, normalized, cardConfigInput, true);
  } else {
    positions = generateRandomCardPositions(cardCount, normalized, cardConfigInput);
  }

  if (positions.length !== cardCount) {
    console.warn('generateCardPositions position count mismatch', {
      expected: cardCount,
      actual: positions.length,
      layoutMode: normalized.layoutMode,
    });
    if (positions.length > cardCount) {
      positions = positions.slice(0, cardCount);
    }
  }

  return positions;
}


