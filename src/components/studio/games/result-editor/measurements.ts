import { ResultScreenElement } from '../../../../games/memory-match/types';

export interface SpacingMeasurement {
  id: string;
  type: 'parent-edge' | 'sibling-gap';
  direction: 'top' | 'bottom' | 'left' | 'right';
  distance: number; // in logical px
  // Line coordinate segment in container space
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label: string;
}

export interface ElementBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const GRID_SIZE_PRESETS = [10, 20, 25, 50, 100] as const;
export type GridSizePreset = (typeof GRID_SIZE_PRESETS)[number];

/**
 * Calculates spacing and distance measurements from an active element to its parent container
 * edges and to nearby sibling elements within the same container.
 */
export function calculateMeasurements(
  element: ElementBounds,
  parentWidth: number,
  parentHeight: number,
  siblings: ResultScreenElement[] = [],
  activeElementId?: string
): SpacingMeasurement[] {
  const measurements: SpacingMeasurement[] = [];
  const elRight = element.x + element.width;
  const elBottom = element.y + element.height;
  const elCenterX = element.x + element.width / 2;
  const elCenterY = element.y + element.height / 2;

  // 1. Parent container edge measurements
  // Top edge
  if (element.y > 0) {
    measurements.push({
      id: 'parent-top',
      type: 'parent-edge',
      direction: 'top',
      distance: Math.round(element.y),
      x1: elCenterX,
      y1: 0,
      x2: elCenterX,
      y2: element.y,
      label: `${Math.round(element.y)}px`,
    });
  }

  // Bottom edge
  const bottomDist = parentHeight - elBottom;
  if (bottomDist > 0) {
    measurements.push({
      id: 'parent-bottom',
      type: 'parent-edge',
      direction: 'bottom',
      distance: Math.round(bottomDist),
      x1: elCenterX,
      y1: elBottom,
      x2: elCenterX,
      y2: parentHeight,
      label: `${Math.round(bottomDist)}px`,
    });
  }

  // Left edge
  if (element.x > 0) {
    measurements.push({
      id: 'parent-left',
      type: 'parent-edge',
      direction: 'left',
      distance: Math.round(element.x),
      x1: 0,
      y1: elCenterY,
      x2: element.x,
      y2: elCenterY,
      label: `${Math.round(element.x)}px`,
    });
  }

  // Right edge
  const rightDist = parentWidth - elRight;
  if (rightDist > 0) {
    measurements.push({
      id: 'parent-right',
      type: 'parent-edge',
      direction: 'right',
      distance: Math.round(rightDist),
      x1: elRight,
      y1: elCenterY,
      x2: parentWidth,
      y2: elCenterY,
      label: `${Math.round(rightDist)}px`,
    });
  }

  // 2. Sibling gap measurements (find closest siblings in cardinal directions)
  const validSiblings = siblings.filter(
    (s) => s.id !== activeElementId && s.visible !== false
  );

  let closestLeft: { sib: ResultScreenElement; gap: number } | null = null;
  let closestRight: { sib: ResultScreenElement; gap: number } | null = null;
  let closestAbove: { sib: ResultScreenElement; gap: number } | null = null;
  let closestBelow: { sib: ResultScreenElement; gap: number } | null = null;

  for (const sib of validSiblings) {
    const sibRight = sib.x + sib.width;
    const sibBottom = sib.y + sib.height;

    // Check vertical overlap for horizontal spacing
    const verticalOverlap =
      Math.max(0, Math.min(elBottom, sibBottom) - Math.max(element.y, sib.y)) > 0;

    if (verticalOverlap) {
      // Sibling is to the left
      if (sibRight <= element.x) {
        const gap = element.x - sibRight;
        if (!closestLeft || gap < closestLeft.gap) {
          closestLeft = { sib, gap };
        }
      }
      // Sibling is to the right
      if (sib.x >= elRight) {
        const gap = sib.x - elRight;
        if (!closestRight || gap < closestRight.gap) {
          closestRight = { sib, gap };
        }
      }
    }

    // Check horizontal overlap for vertical spacing
    const horizontalOverlap =
      Math.max(0, Math.min(elRight, sibRight) - Math.max(element.x, sib.x)) > 0;

    if (horizontalOverlap) {
      // Sibling is above
      if (sibBottom <= element.y) {
        const gap = element.y - sibBottom;
        if (!closestAbove || gap < closestAbove.gap) {
          closestAbove = { sib, gap };
        }
      }
      // Sibling is below
      if (sib.y >= elBottom) {
        const gap = sib.y - elBottom;
        if (!closestBelow || gap < closestBelow.gap) {
          closestBelow = { sib, gap };
        }
      }
    }
  }

  // Add closest sibling measurements
  if (closestLeft) {
    const sibRight = closestLeft.sib.x + closestLeft.sib.width;
    const midY = Math.max(element.y, closestLeft.sib.y) + 15;
    measurements.push({
      id: `sibling-left-${closestLeft.sib.id}`,
      type: 'sibling-gap',
      direction: 'left',
      distance: Math.round(closestLeft.gap),
      x1: sibRight,
      y1: midY,
      x2: element.x,
      y2: midY,
      label: `${Math.round(closestLeft.gap)}px`,
    });
  }

  if (closestRight) {
    const midY = Math.max(element.y, closestRight.sib.y) + 15;
    measurements.push({
      id: `sibling-right-${closestRight.sib.id}`,
      type: 'sibling-gap',
      direction: 'right',
      distance: Math.round(closestRight.gap),
      x1: elRight,
      y1: midY,
      x2: closestRight.sib.x,
      y2: midY,
      label: `${Math.round(closestRight.gap)}px`,
    });
  }

  if (closestAbove) {
    const sibBottom = closestAbove.sib.y + closestAbove.sib.height;
    const midX = Math.max(element.x, closestAbove.sib.x) + 15;
    measurements.push({
      id: `sibling-above-${closestAbove.sib.id}`,
      type: 'sibling-gap',
      direction: 'top',
      distance: Math.round(closestAbove.gap),
      x1: midX,
      y1: sibBottom,
      x2: midX,
      y2: element.y,
      label: `${Math.round(closestAbove.gap)}px`,
    });
  }

  if (closestBelow) {
    const midX = Math.max(element.x, closestBelow.sib.x) + 15;
    measurements.push({
      id: `sibling-below-${closestBelow.sib.id}`,
      type: 'sibling-gap',
      direction: 'bottom',
      distance: Math.round(closestBelow.gap),
      x1: midX,
      y1: elBottom,
      x2: midX,
      y2: closestBelow.sib.y,
      label: `${Math.round(closestBelow.gap)}px`,
    });
  }

  return measurements;
}

/**
 * Calculates snap point for a given coordinate to nearest grid line.
 */
export function snapToGrid(val: number, gridSize: number, threshold = 6): number {
  const remainder = val % gridSize;
  if (remainder <= threshold) {
    return val - remainder;
  }
  if (gridSize - remainder <= threshold) {
    return val + (gridSize - remainder);
  }
  return val;
}
