/**
 * Shared Visual Editor Engine - Spacing & Distance Measurements
 * Computes live edge distances and inter-element sibling gaps during drag/resize.
 */
import { BaseVisualElement } from './types';

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
export function calculateMeasurements<T extends Partial<BaseVisualElement> = Partial<BaseVisualElement>>(
  element: ElementBounds,
  parentWidth: number,
  parentHeight: number,
  siblings: T[] = [],
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

  // 2. Nearest Sibling Gaps (Horizontal and Vertical)
  const validSiblings = siblings.filter(
    (sib) =>
      sib.id !== activeElementId &&
      sib.visible !== false &&
      Number.isFinite(sib.x) &&
      Number.isFinite(sib.y) &&
      Number.isFinite(sib.width) &&
      Number.isFinite(sib.height)
  );

  let nearestAbove: { dist: number; sib: T; overlapY: number } | null = null;
  let nearestBelow: { dist: number; sib: T; overlapY: number } | null = null;
  let nearestLeft: { dist: number; sib: T; overlapX: number } | null = null;
  let nearestRight: { dist: number; sib: T; overlapX: number } | null = null;

  for (const sib of validSiblings) {
    const sX = sib.x!;
    const sY = sib.y!;
    const sW = sib.width!;
    const sH = sib.height!;
    const sibRight = sX + sW;
    const sibBottom = sY + sH;

    // Check horizontal overlap for vertical gaps
    const xOverlap = Math.min(elRight, sibRight) - Math.max(element.x, sX);
    if (xOverlap > 0) {
      const midX = Math.max(element.x, sX) + xOverlap / 2;
      // Sibling is above
      if (sibBottom <= element.y) {
        const gap = element.y - sibBottom;
        if (nearestAbove === null || gap < nearestAbove.dist) {
          nearestAbove = { dist: gap, sib, overlapY: midX };
        }
      }
      // Sibling is below
      else if (sY >= elBottom) {
        const gap = sY - elBottom;
        if (nearestBelow === null || gap < nearestBelow.dist) {
          nearestBelow = { dist: gap, sib, overlapY: midX };
        }
      }
    }

    // Check vertical overlap for horizontal gaps
    const yOverlap = Math.min(elBottom, sibBottom) - Math.max(element.y, sY);
    if (yOverlap > 0) {
      const midY = Math.max(element.y, sY) + yOverlap / 2;
      // Sibling is to the left
      if (sibRight <= element.x) {
        const gap = element.x - sibRight;
        if (nearestLeft === null || gap < nearestLeft.dist) {
          nearestLeft = { dist: gap, sib, overlapX: midY };
        }
      }
      // Sibling is to the right
      else if (sX >= elRight) {
        const gap = sX - elRight;
        if (nearestRight === null || gap < nearestRight.dist) {
          nearestRight = { dist: gap, sib, overlapX: midY };
        }
      }
    }
  }

  if (nearestAbove && nearestAbove.dist > 0 && nearestAbove.dist < 200) {
    const sY = nearestAbove.sib.y!;
    const sH = nearestAbove.sib.height!;
    measurements.push({
      id: `gap-above-${nearestAbove.sib.id}`,
      type: 'sibling-gap',
      direction: 'top',
      distance: Math.round(nearestAbove.dist),
      x1: nearestAbove.overlapY,
      y1: sY + sH,
      x2: nearestAbove.overlapY,
      y2: element.y,
      label: `${Math.round(nearestAbove.dist)}px`,
    });
  }

  if (nearestBelow && nearestBelow.dist > 0 && nearestBelow.dist < 200) {
    const sY = nearestBelow.sib.y!;
    measurements.push({
      id: `gap-below-${nearestBelow.sib.id}`,
      type: 'sibling-gap',
      direction: 'bottom',
      distance: Math.round(nearestBelow.dist),
      x1: nearestBelow.overlapY,
      y1: elBottom,
      x2: nearestBelow.overlapY,
      y2: sY,
      label: `${Math.round(nearestBelow.dist)}px`,
    });
  }

  if (nearestLeft && nearestLeft.dist > 0 && nearestLeft.dist < 200) {
    const sX = nearestLeft.sib.x!;
    const sW = nearestLeft.sib.width!;
    measurements.push({
      id: `gap-left-${nearestLeft.sib.id}`,
      type: 'sibling-gap',
      direction: 'left',
      distance: Math.round(nearestLeft.dist),
      x1: sX + sW,
      y1: nearestLeft.overlapX,
      x2: element.x,
      y2: nearestLeft.overlapX,
      label: `${Math.round(nearestLeft.dist)}px`,
    });
  }

  if (nearestRight && nearestRight.dist > 0 && nearestRight.dist < 200) {
    const sX = nearestRight.sib.x!;
    measurements.push({
      id: `gap-right-${nearestRight.sib.id}`,
      type: 'sibling-gap',
      direction: 'right',
      distance: Math.round(nearestRight.dist),
      x1: elRight,
      y1: nearestRight.overlapX,
      x2: sX,
      y2: nearestRight.overlapX,
      label: `${Math.round(nearestRight.dist)}px`,
    });
  }

  return measurements;
}
