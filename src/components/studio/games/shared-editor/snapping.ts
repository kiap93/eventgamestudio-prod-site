/**
 * Shared Visual Editor Engine - Snapping & Alignment Guides
 * Works universally for both Start Screen and Result Screen editors.
 */
import { BaseVisualElement, ResizeHandle } from './types';

export interface AlignmentGuide {
  id: string;
  type: 'vertical' | 'horizontal';
  position: number; // coordinate in parent/canvas coordinate space
  start: number; // start coordinate along perpendicular axis
  end: number; // end coordinate along perpendicular axis
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
 */
export function calculateSnap<T extends Partial<BaseVisualElement> = Partial<BaseVisualElement>>(
  targetBox: SnapBox,
  parentWidth: number,
  parentHeight: number,
  siblings: T[],
  excludedIds: string[] = [],
  threshold = DEFAULT_SNAP_THRESHOLD,
  isRoot = true
): SnapResult {
  let bestDeltaX: number | null = null;
  let bestGuideX: AlignmentGuide | null = null;
  let bestDeltaY: number | null = null;
  let bestGuideY: AlignmentGuide | null = null;

  const validSiblings = siblings.filter(
    (sib) =>
      sib.id &&
      !excludedIds.includes(sib.id) &&
      sib.visible !== false &&
      Number.isFinite(sib.x) &&
      Number.isFinite(sib.y) &&
      Number.isFinite(sib.width) &&
      Number.isFinite(sib.height)
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
    const sX = sib.x!;
    const sY = sib.y!;
    const sW = sib.width!;
    const sH = sib.height!;
    const sibRight = sX + sW;
    const sibCenterX = Math.round(sX + sW / 2);
    const sibYStart = sY;
    const sibYEnd = sY + sH;

    xTargets.push(
      {
        x: sX,
        targetType: 'sibling-edge',
        label: `${sib.type || 'Element'} Left (${Math.round(sX)})`,
        sibYStart,
        sibYEnd,
      },
      {
        x: sibCenterX,
        targetType: 'sibling-center',
        label: `${sib.type || 'Element'} Center X`,
        sibYStart,
        sibYEnd,
      },
      {
        x: sibRight,
        targetType: 'sibling-edge',
        label: `${sib.type || 'Element'} Right (${Math.round(sibRight)})`,
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
    const sX = sib.x!;
    const sY = sib.y!;
    const sW = sib.width!;
    const sH = sib.height!;
    const sibBottom = sY + sH;
    const sibCenterY = Math.round(sY + sH / 2);
    const sibXStart = sX;
    const sibXEnd = sX + sW;

    yTargets.push(
      {
        y: sY,
        targetType: 'sibling-edge',
        label: `${sib.type || 'Element'} Top (${Math.round(sY)})`,
        sibXStart,
        sibXEnd,
      },
      {
        y: sibCenterY,
        targetType: 'sibling-center',
        label: `${sib.type || 'Element'} Center Y`,
        sibXStart,
        sibXEnd,
      },
      {
        y: sibBottom,
        targetType: 'sibling-edge',
        label: `${sib.type || 'Element'} Bottom (${Math.round(sibBottom)})`,
        sibXStart,
        sibXEnd,
      }
    );
  }

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

export interface ResizeSnapResult {
  box: SnapBox;
  guides: AlignmentGuide[];
}

/**
 * Calculates snapping during element resize operations based on active resize handle.
 * Supports both (handle, tentativeBox, ...) and (tentativeBox, handle, ...) signatures.
 */
export function calculateResizeSnap<T extends Partial<BaseVisualElement> = Partial<BaseVisualElement>>(
  arg1: ResizeHandle | SnapBox,
  arg2: ResizeHandle | SnapBox,
  parentWidth: number,
  parentHeight: number,
  siblings: T[],
  excludedIds: string[] = [],
  threshold = DEFAULT_SNAP_THRESHOLD,
  isRoot = true
): ResizeSnapResult {
  let handle: ResizeHandle;
  let tentativeBox: SnapBox;

  if (typeof arg1 === 'string') {
    handle = arg1 as ResizeHandle;
    tentativeBox = arg2 as SnapBox;
  } else {
    tentativeBox = arg1 as SnapBox;
    handle = arg2 as ResizeHandle;
  }

  const guides: AlignmentGuide[] = [];
  let { x, y, width, height } = tentativeBox;

  const validSiblings = siblings.filter(
    (sib) =>
      sib.id &&
      !excludedIds.includes(sib.id) &&
      sib.visible !== false &&
      Number.isFinite(sib.x) &&
      Number.isFinite(sib.y) &&
      Number.isFinite(sib.width) &&
      Number.isFinite(sib.height)
  );

  // Determine active edge movements
  const movesLeft = handle === 'tl' || handle === 'bl' || handle === 'l' || handle === 'nw' || handle === 'sw' || handle === 'w';
  const movesRight = handle === 'tr' || handle === 'br' || handle === 'r' || handle === 'ne' || handle === 'se' || handle === 'e';
  const movesTop = handle === 'tl' || handle === 'tr' || handle === 't' || handle === 'nw' || handle === 'ne' || handle === 'n';
  const movesBottom = handle === 'bl' || handle === 'br' || handle === 'b' || handle === 'sw' || handle === 'se' || handle === 's';

  // 1. Horizontal resize edge snap
  if (movesRight) {
    const tentativeRight = x + width;
    let bestDelta: number | null = null;
    let bestGuide: AlignmentGuide | null = null;

    // Check parent bounds & center
    const targets = [
      { x: parentWidth, label: isRoot ? 'Canvas Right' : 'Container Right' },
      { x: Math.round(parentWidth / 2), label: isRoot ? 'Canvas Center X' : 'Container Center X' },
    ];
    for (const sib of validSiblings) {
      targets.push({ x: sib.x!, label: `${sib.type || 'Element'} Left` });
      targets.push({ x: sib.x! + sib.width!, label: `${sib.type || 'Element'} Right` });
    }

    for (const target of targets) {
      const diff = target.x - tentativeRight;
      if (Math.abs(diff) <= threshold) {
        if (bestDelta === null || Math.abs(diff) < Math.abs(bestDelta)) {
          bestDelta = diff;
          bestGuide = {
            id: `resize-x-${target.x}`,
            type: 'vertical',
            position: target.x,
            start: Math.max(0, y - 10),
            end: Math.min(parentHeight, y + height + 10),
            targetType: 'sibling-edge',
            label: target.label,
          };
        }
      }
    }

    if (bestDelta !== null) {
      width = Math.max(20, width + bestDelta);
      if (bestGuide) guides.push(bestGuide);
    }
  } else if (movesLeft) {
    const tentativeLeft = x;
    let bestDelta: number | null = null;
    let bestGuide: AlignmentGuide | null = null;

    const targets = [
      { x: 0, label: isRoot ? 'Canvas Left' : 'Container Left' },
      { x: Math.round(parentWidth / 2), label: isRoot ? 'Canvas Center X' : 'Container Center X' },
    ];
    for (const sib of validSiblings) {
      targets.push({ x: sib.x!, label: `${sib.type || 'Element'} Left` });
      targets.push({ x: sib.x! + sib.width!, label: `${sib.type || 'Element'} Right` });
    }

    for (const target of targets) {
      const diff = target.x - tentativeLeft;
      if (Math.abs(diff) <= threshold) {
        if (bestDelta === null || Math.abs(diff) < Math.abs(bestDelta)) {
          bestDelta = diff;
          bestGuide = {
            id: `resize-x-${target.x}`,
            type: 'vertical',
            position: target.x,
            start: Math.max(0, y - 10),
            end: Math.min(parentHeight, y + height + 10),
            targetType: 'sibling-edge',
            label: target.label,
          };
        }
      }
    }

    if (bestDelta !== null) {
      const newWidth = width - bestDelta;
      if (newWidth >= 20) {
        x += bestDelta;
        width = newWidth;
        if (bestGuide) guides.push(bestGuide);
      }
    }
  }

  // 2. Vertical resize edge snap
  if (movesBottom) {
    const tentativeBottom = y + height;
    let bestDelta: number | null = null;
    let bestGuide: AlignmentGuide | null = null;

    const targets = [
      { y: parentHeight, label: isRoot ? 'Canvas Bottom' : 'Container Bottom' },
      { y: Math.round(parentHeight / 2), label: isRoot ? 'Canvas Center Y' : 'Container Center Y' },
    ];
    for (const sib of validSiblings) {
      targets.push({ y: sib.y!, label: `${sib.type || 'Element'} Top` });
      targets.push({ y: sib.y! + sib.height!, label: `${sib.type || 'Element'} Bottom` });
    }

    for (const target of targets) {
      const diff = target.y - tentativeBottom;
      if (Math.abs(diff) <= threshold) {
        if (bestDelta === null || Math.abs(diff) < Math.abs(bestDelta)) {
          bestDelta = diff;
          bestGuide = {
            id: `resize-y-${target.y}`,
            type: 'horizontal',
            position: target.y,
            start: Math.max(0, x - 10),
            end: Math.min(parentWidth, x + width + 10),
            targetType: 'sibling-edge',
            label: target.label,
          };
        }
      }
    }

    if (bestDelta !== null) {
      height = Math.max(20, height + bestDelta);
      if (bestGuide) guides.push(bestGuide);
    }
  } else if (movesTop) {
    const tentativeTop = y;
    let bestDelta: number | null = null;
    let bestGuide: AlignmentGuide | null = null;

    const targets = [
      { y: 0, label: isRoot ? 'Canvas Top' : 'Container Top' },
      { y: Math.round(parentHeight / 2), label: isRoot ? 'Canvas Center Y' : 'Container Center Y' },
    ];
    for (const sib of validSiblings) {
      targets.push({ y: sib.y!, label: `${sib.type || 'Element'} Top` });
      targets.push({ y: sib.y! + sib.height!, label: `${sib.type || 'Element'} Bottom` });
    }

    for (const target of targets) {
      const diff = target.y - tentativeTop;
      if (Math.abs(diff) <= threshold) {
        if (bestDelta === null || Math.abs(diff) < Math.abs(bestDelta)) {
          bestDelta = diff;
          bestGuide = {
            id: `resize-y-${target.y}`,
            type: 'horizontal',
            position: target.y,
            start: Math.max(0, x - 10),
            end: Math.min(parentWidth, x + width + 10),
            targetType: 'sibling-edge',
            label: target.label,
          };
        }
      }
    }

    if (bestDelta !== null) {
      const newHeight = height - bestDelta;
      if (newHeight >= 20) {
        y += bestDelta;
        height = newHeight;
        if (bestGuide) guides.push(bestGuide);
      }
    }
  }

  return {
    box: { x, y, width, height },
    guides,
  };
}
