import {
  StartScreenElement,
  StartScreenCardElement,
  StartScreenGroupElement,
} from '../../../../games/shared/startScreenTypes';
import { findElementAndParent } from './types';

export type AlignmentType =
  | 'left'
  | 'center-h'
  | 'right'
  | 'top'
  | 'center-v'
  | 'bottom'
  | 'distribute-h'
  | 'distribute-v';

export type ElementAlignment = AlignmentType;

/**
 * Calculates updated coordinates for selected elements according to the chosen alignment type.
 * Respects parent container dimensions (or canvas dimensions for root elements)
 * and locks (locked elements are never modified).
 */
export function alignElements(
  elements: StartScreenElement[],
  selectedIds: string[],
  alignment: AlignmentType,
  canvasWidth: number = 1024,
  canvasHeight: number = 576
): {
  newElements: StartScreenElement[];
  updatedCount: number;
} {
  if (!selectedIds || selectedIds.length === 0) {
    return { newElements: elements, updatedCount: 0 };
  }

  // Collect info for all selected elements
  const selectedInfos = selectedIds
    .map((id) => findElementAndParent(id, elements))
    .filter((info): info is NonNullable<typeof info> => info !== null && !info.element.locked);

  if (selectedInfos.length === 0) {
    return { newElements: elements, updatedCount: 0 };
  }

  const updates: Record<string, Partial<StartScreenElement>> = {};

  // Case 1: Single element alignment (align relative to its parent container or canvas)
  if (selectedInfos.length === 1) {
    const { element, parent } = selectedInfos[0];
    const parentW = parent ? parent.width : canvasWidth;
    const parentH = parent ? parent.height : canvasHeight;

    switch (alignment) {
      case 'left':
        updates[element.id] = { x: 0 };
        break;
      case 'center-h':
        updates[element.id] = { x: Math.round((parentW - element.width) / 2) };
        break;
      case 'right':
        updates[element.id] = { x: Math.round(parentW - element.width) };
        break;
      case 'top':
        updates[element.id] = { y: 0 };
        break;
      case 'center-v':
        updates[element.id] = { y: Math.round((parentH - element.height) / 2) };
        break;
      case 'bottom':
        updates[element.id] = { y: Math.round(parentH - element.height) };
        break;
      case 'distribute-h':
      case 'distribute-v':
        // Distribution requires at least 3 elements
        break;
    }
  } else {
    // Case 2: Multi-element alignment
    // Calculate bounding box of selection
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const { element } of selectedInfos) {
      minX = Math.min(minX, element.x);
      minY = Math.min(minY, element.y);
      maxX = Math.max(maxX, element.x + element.width);
      maxY = Math.max(maxY, element.y + element.height);
    }

    const boundingCenterX = minX + (maxX - minX) / 2;
    const boundingCenterY = minY + (maxY - minY) / 2;

    switch (alignment) {
      case 'left':
        for (const { element } of selectedInfos) {
          updates[element.id] = { x: Math.round(minX) };
        }
        break;

      case 'center-h':
        for (const { element } of selectedInfos) {
          updates[element.id] = { x: Math.round(boundingCenterX - element.width / 2) };
        }
        break;

      case 'right':
        for (const { element } of selectedInfos) {
          updates[element.id] = { x: Math.round(maxX - element.width) };
        }
        break;

      case 'top':
        for (const { element } of selectedInfos) {
          updates[element.id] = { y: Math.round(minY) };
        }
        break;

      case 'center-v':
        for (const { element } of selectedInfos) {
          updates[element.id] = { y: Math.round(boundingCenterY - element.height / 2) };
        }
        break;

      case 'bottom':
        for (const { element } of selectedInfos) {
          updates[element.id] = { y: Math.round(maxY - element.height) };
        }
        break;

      case 'distribute-h': {
        if (selectedInfos.length >= 3) {
          // Sort by X coordinate
          const sorted = [...selectedInfos].sort((a, b) => a.element.x - b.element.x);
          const first = sorted[0].element;
          const last = sorted[sorted.length - 1].element;

          const totalSpan = (last.x + last.width) - first.x;
          const totalElementWidths = sorted.reduce((sum, s) => sum + s.element.width, 0);
          const availableGapSpace = totalSpan - totalElementWidths;

          if (availableGapSpace >= 0) {
            const gap = availableGapSpace / (sorted.length - 1);
            let currentX = first.x;
            for (let i = 0; i < sorted.length; i++) {
              updates[sorted[i].element.id] = { x: Math.round(currentX) };
              currentX += sorted[i].element.width + gap;
            }
          } else {
            // Equal center-to-center spacing
            const startCenter = first.x + first.width / 2;
            const endCenter = last.x + last.width / 2;
            const step = (endCenter - startCenter) / (sorted.length - 1);
            for (let i = 0; i < sorted.length; i++) {
              const targetCenter = startCenter + i * step;
              updates[sorted[i].element.id] = {
                x: Math.round(targetCenter - sorted[i].element.width / 2),
              };
            }
          }
        }
        break;
      }

      case 'distribute-v': {
        if (selectedInfos.length >= 3) {
          // Sort by Y coordinate
          const sorted = [...selectedInfos].sort((a, b) => a.element.y - b.element.y);
          const first = sorted[0].element;
          const last = sorted[sorted.length - 1].element;

          const totalSpan = (last.y + last.height) - first.y;
          const totalElementHeights = sorted.reduce((sum, s) => sum + s.element.height, 0);
          const availableGapSpace = totalSpan - totalElementHeights;

          if (availableGapSpace >= 0) {
            const gap = availableGapSpace / (sorted.length - 1);
            let currentY = first.y;
            for (let i = 0; i < sorted.length; i++) {
              updates[sorted[i].element.id] = { y: Math.round(currentY) };
              currentY += sorted[i].element.height + gap;
            }
          } else {
            // Equal center-to-center spacing
            const startCenter = first.y + first.height / 2;
            const endCenter = last.y + last.height / 2;
            const step = (endCenter - startCenter) / (sorted.length - 1);
            for (let i = 0; i < sorted.length; i++) {
              const targetCenter = startCenter + i * step;
              updates[sorted[i].element.id] = {
                y: Math.round(targetCenter - sorted[i].element.height / 2),
              };
            }
          }
        }
        break;
      }
    }
  }

  const updatedCount = Object.keys(updates).length;
  if (updatedCount === 0) {
    return { newElements: elements, updatedCount: 0 };
  }

  // Immutably apply updates throughout element tree
  const applyRecursive = (list: StartScreenElement[]): StartScreenElement[] => {
    return list.map((item) => {
      let updated = item;
      if (updates[item.id]) {
        updated = { ...item, ...updates[item.id] } as StartScreenElement;
      }
      if (updated.type === 'card' || updated.type === 'group') {
        const container = updated as StartScreenCardElement | StartScreenGroupElement;
        return {
          ...updated,
          children: applyRecursive(container.children || []),
        };
      }
      return updated;
    });
  };

  return {
    newElements: applyRecursive(elements),
    updatedCount,
  };
}
