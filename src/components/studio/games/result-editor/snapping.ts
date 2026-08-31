import { ResultScreenElement } from '../../../../games/memory-match/types';

export interface AlignmentGuide {
  id: string;
  type: 'vertical' | 'horizontal';
  position: number; // coordinate in parent/canvas coordinate space
  start: number; // start coordinate along the perpendicular axis
  end: number; // end coordinate along the perpendicular axis
  targetType: 'canvas-edge' | 'canvas-center' | 'sibling-edge' | 'sibling-center';
  label?: string;
}

export interface SnapBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SnapResult {
  x: number;
  y: number;
  snappedX: boolean;
  snappedY: boolean;
  guides: AlignmentGuide[];
}

export const DEFAULT_SNAP_THRESHOLD = 8; // logical pixels

/**
 * Calculates snapping against parent container edges/center and sibling elements.
 * 
 * Rules:
 * - Root elements snap against 1000x1000 canvas edges (0, 1000) and center (500), plus sibling root elements.
 * - Child elements snap against parent container edges (0, parentWidth), center (parentWidth/2), plus sibling children of the SAME parent.
 * - Children NEVER snap to elements in other containers or other cards.
 */
export function calculateSnap(
  targetBox: SnapBox,
  parentWidth: number,
  parentHeight: number,
  siblings: ResultScreenElement[],
  excludedIds: string[] = [],
  threshold = DEFAULT_SNAP_THRESHOLD,
  isRoot = true
): SnapResult {
  let bestDeltaX: number | null = null;
  let bestGuideX: AlignmentGuide | null = null;
  let bestDeltaY: number | null = null;
  let bestGuideY: AlignmentGuide | null = null;

  const validSiblings = siblings.filter(
    (sib) => !excludedIds.includes(sib.id) && sib.visible !== false
  );

  // 1. Candidate X Snap Lines (Vertical lines)
  interface XTarget {
    x: number;
    targetType: 'canvas-edge' | 'canvas-center' | 'sibling-edge' | 'sibling-center';
    label?: string;
    sibYStart?: number;
    sibYEnd?: number;
  }

  const xTargets: XTarget[] = [
    // Parent / Canvas edges & center
    {
      x: 0,
      targetType: isRoot ? 'canvas-edge' : 'sibling-edge',
      label: isRoot ? 'Canvas Left (0)' : 'Container Left (0)',
      sibYStart: 0,
      sibYEnd: parentHeight,
    },
    {
      x: Math.round(parentWidth / 2),
      targetType: isRoot ? 'canvas-center' : 'sibling-center',
      label: isRoot ? 'Canvas Center X' : 'Container Center X',
      sibYStart: 0,
      sibYEnd: parentHeight,
    },
    {
      x: parentWidth,
      targetType: isRoot ? 'canvas-edge' : 'sibling-edge',
      label: isRoot ? `Canvas Right (${parentWidth})` : `Container Right (${parentWidth})`,
      sibYStart: 0,
      sibYEnd: parentHeight,
    },
  ];

  for (const sib of validSiblings) {
    const sibRight = sib.x + sib.width;
    const sibCenterX = Math.round(sib.x + sib.width / 2);
    const sibYStart = sib.y;
    const sibYEnd = sib.y + sib.height;

    xTargets.push(
      {
        x: sib.x,
        targetType: 'sibling-edge',
        label: `${sib.type} Left (${Math.round(sib.x)})`,
        sibYStart,
        sibYEnd,
      },
      {
        x: sibCenterX,
        targetType: 'sibling-center',
        label: `${sib.type} Center X`,
        sibYStart,
        sibYEnd,
      },
      {
        x: sibRight,
        targetType: 'sibling-edge',
        label: `${sib.type} Right (${Math.round(sibRight)})`,
        sibYStart,
        sibYEnd,
      }
    );
  }

  // 2. Candidate Y Snap Lines (Horizontal lines)
  interface YTarget {
    y: number;
    targetType: 'canvas-edge' | 'canvas-center' | 'sibling-edge' | 'sibling-center';
    label?: string;
    sibXStart?: number;
    sibXEnd?: number;
  }

  const yTargets: YTarget[] = [
    // Parent / Canvas edges & center
    {
      y: 0,
      targetType: isRoot ? 'canvas-edge' : 'sibling-edge',
      label: isRoot ? 'Canvas Top (0)' : 'Container Top (0)',
      sibXStart: 0,
      sibXEnd: parentWidth,
    },
    {
      y: Math.round(parentHeight / 2),
      targetType: isRoot ? 'canvas-center' : 'sibling-center',
      label: isRoot ? 'Canvas Center Y' : 'Container Center Y',
      sibXStart: 0,
      sibXEnd: parentWidth,
    },
    {
      y: parentHeight,
      targetType: isRoot ? 'canvas-edge' : 'sibling-edge',
      label: isRoot ? `Canvas Bottom (${parentHeight})` : `Container Bottom (${parentHeight})`,
      sibXStart: 0,
      sibXEnd: parentWidth,
    },
  ];

  for (const sib of validSiblings) {
    const sibBottom = sib.y + sib.height;
    const sibCenterY = Math.round(sib.y + sib.height / 2);
    const sibXStart = sib.x;
    const sibXEnd = sib.x + sib.width;

    yTargets.push(
      {
        y: sib.y,
        targetType: 'sibling-edge',
        label: `${sib.type} Top (${Math.round(sib.y)})`,
        sibXStart,
        sibXEnd,
      },
      {
        y: sibCenterY,
        targetType: 'sibling-center',
        label: `${sib.type} Center Y`,
        sibXStart,
        sibXEnd,
      },
      {
        y: sibBottom,
        targetType: 'sibling-edge',
        label: `${sib.type} Bottom (${Math.round(sibBottom)})`,
        sibXStart,
        sibXEnd,
      }
    );
  }

  // Points of the moving box
  const boxLeft = targetBox.x;
  const boxCenterX = targetBox.x + targetBox.width / 2;
  const boxRight = targetBox.x + targetBox.width;

  const boxTop = targetBox.y;
  const boxCenterY = targetBox.y + targetBox.height / 2;
  const boxBottom = targetBox.y + targetBox.height;

  // Test X Snapping
  for (const target of xTargets) {
    // 1. Box Left to Target
    const dLeft = target.x - boxLeft;
    if (Math.abs(dLeft) <= threshold) {
      if (bestDeltaX === null || Math.abs(dLeft) < Math.abs(bestDeltaX)) {
        bestDeltaX = dLeft;
        const startY = Math.min(boxTop, target.sibYStart ?? 0);
        const endY = Math.max(boxBottom, target.sibYEnd ?? parentHeight);
        bestGuideX = {
          id: `guide-x-${target.x}`,
          type: 'vertical',
          position: target.x,
          start: Math.max(0, startY - 10),
          end: Math.min(parentHeight, endY + 10),
          targetType: target.targetType,
          label: target.label,
        };
      }
    }

    // 2. Box Center to Target
    const dCenter = target.x - boxCenterX;
    if (Math.abs(dCenter) <= threshold) {
      if (bestDeltaX === null || Math.abs(dCenter) < Math.abs(bestDeltaX)) {
        bestDeltaX = dCenter;
        const startY = Math.min(boxTop, target.sibYStart ?? 0);
        const endY = Math.max(boxBottom, target.sibYEnd ?? parentHeight);
        bestGuideX = {
          id: `guide-x-${target.x}`,
          type: 'vertical',
          position: target.x,
          start: Math.max(0, startY - 10),
          end: Math.min(parentHeight, endY + 10),
          targetType: target.targetType,
          label: target.label,
        };
      }
    }

    // 3. Box Right to Target
    const dRight = target.x - boxRight;
    if (Math.abs(dRight) <= threshold) {
      if (bestDeltaX === null || Math.abs(dRight) < Math.abs(bestDeltaX)) {
        bestDeltaX = dRight;
        const startY = Math.min(boxTop, target.sibYStart ?? 0);
        const endY = Math.max(boxBottom, target.sibYEnd ?? parentHeight);
        bestGuideX = {
          id: `guide-x-${target.x}`,
          type: 'vertical',
          position: target.x,
          start: Math.max(0, startY - 10),
          end: Math.min(parentHeight, endY + 10),
          targetType: target.targetType,
          label: target.label,
        };
      }
    }
  }

  // Test Y Snapping
  for (const target of yTargets) {
    // 1. Box Top to Target
    const dTop = target.y - boxTop;
    if (Math.abs(dTop) <= threshold) {
      if (bestDeltaY === null || Math.abs(dTop) < Math.abs(bestDeltaY)) {
        bestDeltaY = dTop;
        const startX = Math.min(boxLeft, target.sibXStart ?? 0);
        const endX = Math.max(boxRight, target.sibXEnd ?? parentWidth);
        bestGuideY = {
          id: `guide-y-${target.y}`,
          type: 'horizontal',
          position: target.y,
          start: Math.max(0, startX - 10),
          end: Math.min(parentWidth, endX + 10),
          targetType: target.targetType,
          label: target.label,
        };
      }
    }

    // 2. Box Center to Target
    const dCenter = target.y - boxCenterY;
    if (Math.abs(dCenter) <= threshold) {
      if (bestDeltaY === null || Math.abs(dCenter) < Math.abs(bestDeltaY)) {
        bestDeltaY = dCenter;
        const startX = Math.min(boxLeft, target.sibXStart ?? 0);
        const endX = Math.max(boxRight, target.sibXEnd ?? parentWidth);
        bestGuideY = {
          id: `guide-y-${target.y}`,
          type: 'horizontal',
          position: target.y,
          start: Math.max(0, startX - 10),
          end: Math.min(parentWidth, endX + 10),
          targetType: target.targetType,
          label: target.label,
        };
      }
    }

    // 3. Box Bottom to Target
    const dBottom = target.y - boxBottom;
    if (Math.abs(dBottom) <= threshold) {
      if (bestDeltaY === null || Math.abs(dBottom) < Math.abs(bestDeltaY)) {
        bestDeltaY = dBottom;
        const startX = Math.min(boxLeft, target.sibXStart ?? 0);
        const endX = Math.max(boxRight, target.sibXEnd ?? parentWidth);
        bestGuideY = {
          id: `guide-y-${target.y}`,
          type: 'horizontal',
          position: target.y,
          start: Math.max(0, startX - 10),
          end: Math.min(parentWidth, endX + 10),
          targetType: target.targetType,
          label: target.label,
        };
      }
    }
  }

  const snappedX = bestDeltaX !== null ? Math.round(targetBox.x + bestDeltaX) : targetBox.x;
  const snappedY = bestDeltaY !== null ? Math.round(targetBox.y + bestDeltaY) : targetBox.y;

  const guides: AlignmentGuide[] = [];
  if (bestGuideX) guides.push(bestGuideX);
  if (bestGuideY) guides.push(bestGuideY);

  return {
    x: snappedX,
    y: snappedY,
    snappedX: bestDeltaX !== null,
    snappedY: bestDeltaY !== null,
    guides,
  };
}

/**
 * Calculates snapping for resize operations along active edge handles.
 */
export function calculateResizeSnap(
  currentBox: SnapBox,
  handle: string,
  parentWidth: number,
  parentHeight: number,
  siblings: ResultScreenElement[],
  excludedIds: string[] = [],
  threshold = DEFAULT_SNAP_THRESHOLD,
  isRoot = true
): { box: SnapBox; guides: AlignmentGuide[] } {
  let { x, y, width, height } = currentBox;
  const guides: AlignmentGuide[] = [];

  const validSiblings = siblings.filter(
    (sib) => !excludedIds.includes(sib.id) && sib.visible !== false
  );

  // Horizontal handles snapping (l, r, tl, tr, bl, br)
  if (handle.includes('l')) {
    // Snapping the left edge (x)
    let bestDelta: number | null = null;
    let guide: AlignmentGuide | null = null;

    const targets = [
      0,
      Math.round(parentWidth / 2),
      ...validSiblings.flatMap((s) => [s.x, Math.round(s.x + s.width / 2), s.x + s.width]),
    ];

    for (const t of targets) {
      const d = t - x;
      if (Math.abs(d) <= threshold && width - d >= 20) {
        if (bestDelta === null || Math.abs(d) < Math.abs(bestDelta)) {
          bestDelta = d;
          guide = {
            id: `resize-guide-x-${t}`,
            type: 'vertical',
            position: t,
            start: 0,
            end: parentHeight,
            targetType: t === 0 || t === parentWidth ? 'canvas-edge' : 'sibling-edge',
          };
        }
      }
    }

    if (bestDelta !== null) {
      x += bestDelta;
      width -= bestDelta;
      if (guide) guides.push(guide);
    }
  } else if (handle.includes('r')) {
    // Snapping the right edge (x + width)
    const right = x + width;
    let bestDelta: number | null = null;
    let guide: AlignmentGuide | null = null;

    const targets = [
      parentWidth,
      Math.round(parentWidth / 2),
      ...validSiblings.flatMap((s) => [s.x, Math.round(s.x + s.width / 2), s.x + s.width]),
    ];

    for (const t of targets) {
      const d = t - right;
      if (Math.abs(d) <= threshold && width + d >= 20) {
        if (bestDelta === null || Math.abs(d) < Math.abs(bestDelta)) {
          bestDelta = d;
          guide = {
            id: `resize-guide-x-${t}`,
            type: 'vertical',
            position: t,
            start: 0,
            end: parentHeight,
            targetType: t === 0 || t === parentWidth ? 'canvas-edge' : 'sibling-edge',
          };
        }
      }
    }

    if (bestDelta !== null) {
      width += bestDelta;
      if (guide) guides.push(guide);
    }
  }

  // Vertical handles snapping (t, b, tl, tr, bl, br)
  if (handle.includes('t')) {
    // Snapping the top edge (y)
    let bestDelta: number | null = null;
    let guide: AlignmentGuide | null = null;

    const targets = [
      0,
      Math.round(parentHeight / 2),
      ...validSiblings.flatMap((s) => [s.y, Math.round(s.y + s.height / 2), s.y + s.height]),
    ];

    for (const t of targets) {
      const d = t - y;
      if (Math.abs(d) <= threshold && height - d >= 20) {
        if (bestDelta === null || Math.abs(d) < Math.abs(bestDelta)) {
          bestDelta = d;
          guide = {
            id: `resize-guide-y-${t}`,
            type: 'horizontal',
            position: t,
            start: 0,
            end: parentWidth,
            targetType: t === 0 || t === parentHeight ? 'canvas-edge' : 'sibling-edge',
          };
        }
      }
    }

    if (bestDelta !== null) {
      y += bestDelta;
      height -= bestDelta;
      if (guide) guides.push(guide);
    }
  } else if (handle.includes('b')) {
    // Snapping the bottom edge (y + height)
    const bottom = y + height;
    let bestDelta: number | null = null;
    let guide: AlignmentGuide | null = null;

    const targets = [
      parentHeight,
      Math.round(parentHeight / 2),
      ...validSiblings.flatMap((s) => [s.y, Math.round(s.y + s.height / 2), s.y + s.height]),
    ];

    for (const t of targets) {
      const d = t - bottom;
      if (Math.abs(d) <= threshold && height + d >= 20) {
        if (bestDelta === null || Math.abs(d) < Math.abs(bestDelta)) {
          bestDelta = d;
          guide = {
            id: `resize-guide-y-${t}`,
            type: 'horizontal',
            position: t,
            start: 0,
            end: parentWidth,
            targetType: t === 0 || t === parentHeight ? 'canvas-edge' : 'sibling-edge',
          };
        }
      }
    }

    if (bestDelta !== null) {
      height += bestDelta;
      if (guide) guides.push(guide);
    }
  }

  return {
    box: { x, y, width, height },
    guides,
  };
}
