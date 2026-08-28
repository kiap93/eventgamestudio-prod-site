import { MemoryMatchBoardConfig, MemoryMatchGridConfig, MemoryMatchRandomLayoutConfig } from './types';

export interface CardLayoutPosition {
  x: number; // Center X percentage (0 - 100%)
  y: number; // Center Y percentage (0 - 100%)
  rotation: number; // Rotation in degrees (e.g. -8 to 8)
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

export const DEFAULT_RANDOM_LAYOUT_CONFIG: MemoryMatchRandomLayoutConfig = {
  minSpacing: 12,
  rotationMin: -8,
  rotationMax: 8,
};

export const DEFAULT_BOARD_CONFIG: MemoryMatchBoardConfig = {
  layoutMode: 'grid',
  rows: 4,
  cols: 4,
  cardGap: 12,
  randomLayout: DEFAULT_RANDOM_LAYOUT_CONFIG,
};

/**
 * Calculates total card count and matching pairs from rows and cols.
 */
export function calculateBoardDimensions(rows: number, cols: number): BoardDimensionResult {
  const safeRows = Math.min(6, Math.max(2, Math.floor(rows || 4)));
  const safeCols = Math.min(6, Math.max(2, Math.floor(cols || 4)));
  const totalCards = safeRows * safeCols;
  const isEven = totalCards % 2 === 0;
  const requiredPairs = Math.floor(totalCards / 2);

  return {
    rows: safeRows,
    cols: safeCols,
    totalCards,
    isEven,
    requiredPairs,
    warning: !isEven
      ? `Odd card count (${totalCards}). Memory match requires an even number of cards.`
      : undefined,
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
  const layoutMode = rawBoard?.layoutMode === 'random' ? 'random' : 'grid';
  const cardGap = typeof rawBoard?.cardGap === 'number' ? Math.max(4, Math.min(32, rawBoard.cardGap)) : 12;

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

  return {
    layoutMode,
    rows: Math.max(2, Math.min(6, rows)),
    cols: Math.max(2, Math.min(6, cols)),
    cardGap,
    randomLayout: {
      minSpacing,
      rotationMin,
      rotationMax,
    },
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

  return {
    isValid: true,
    totalCards: dims.totalCards,
    requiredPairs: dims.requiredPairs,
  };
}

/**
 * Calculates CSS Grid layout styles for Grid mode.
 */
export function calculateGridLayout(rows: number, cols: number, cardGap = 12) {
  const safeRows = Math.max(2, Math.min(6, rows));
  const safeCols = Math.max(2, Math.min(6, cols));

  return {
    gridTemplateColumns: `repeat(${safeCols}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${safeRows}, minmax(0, 1fr))`,
    aspectRatio: `${safeCols} / ${safeRows}`,
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
 * - Accounts for rotation range and card dimensions
 */
export function generateRandomCardPositions(
  cardCount: number,
  boardConfig?: Partial<MemoryMatchBoardConfig> | null
): CardLayoutPosition[] {
  const count = Math.max(2, cardCount);
  const normalized = normalizeBoardConfig(boardConfig);
  const { minSpacing, rotationMin, rotationMax } = normalized.randomLayout;

  // Approximate optimal card size based on total card count
  const colsApprox = Math.ceil(Math.sqrt(count * 1.15));
  const rowsApprox = Math.ceil(count / colsApprox);

  // Card dimension percentages scaled for comfortable visibility and interaction
  const cardWidthPercent = Math.min(23, Math.max(9.5, Math.floor(76 / colsApprox)));
  const cardHeightPercent = Math.min(28, Math.max(12, Math.floor(80 / rowsApprox)));

  // Bounding margins to keep cards strictly inside container
  const halfW = cardWidthPercent / 2;
  const halfH = cardHeightPercent / 2;
  const marginPercent = 3.5;
  const minX = halfW + marginPercent;
  const maxX = 100 - halfW - marginPercent;
  const minY = halfH + marginPercent;
  const maxY = 100 - halfH - marginPercent;

  // Min center-to-center distance required between cards
  const spacingPercent = (minSpacing / 500) * 100;
  const minDistanceX = cardWidthPercent * 0.72 + spacingPercent;
  const minDistanceY = cardHeightPercent * 0.72 + spacingPercent;

  const positions: CardLayoutPosition[] = [];
  const maxAttempts = 80;

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
        const rotSpan = rotationMax - rotationMin;
        const candidateRot =
          rotSpan > 0 ? rotationMin + Math.random() * rotSpan : (rotationMin + rotationMax) / 2;

        positions.push({
          x: Math.round(candidateX * 10) / 10,
          y: Math.round(candidateY * 10) / 10,
          rotation: Math.round(candidateRot * 10) / 10,
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

      const rotSpan = rotationMax - rotationMin;
      const rot = rotSpan > 0 ? rotationMin + Math.random() * rotSpan : 0;

      positions.push({
        x: Math.min(maxX, Math.max(minX, Math.round((baseX + jitterX) * 10) / 10)),
        y: Math.min(maxY, Math.max(minY, Math.round((baseY + jitterY) * 10) / 10)),
        rotation: Math.round(rot * 10) / 10,
        widthPercent: cardWidthPercent,
        heightPercent: cardHeightPercent,
        zIndex: i + 1,
      });
    }
  }

  return positions;
}
