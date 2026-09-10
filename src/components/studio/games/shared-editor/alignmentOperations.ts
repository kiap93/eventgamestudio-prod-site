/**
 * Shared Visual Editor Engine - Multi-Element Alignment & Distribution Operations
 * Supports both canvas-relative and selection-relative alignment.
 */
import { BaseVisualElement, AlignmentType, findElementAndParent } from './types';

export type { AlignmentType };
export type ElementAlignment = AlignmentType;

/**
 * Calculates updated coordinates for selected elements according to the chosen alignment type.
 * Respects parent container dimensions (or canvas dimensions for root elements)
 * and locks (locked elements are never modified).
 */
export function alignElements<T extends BaseVisualElement = BaseVisualElement>(
  elements: T[],
  selectedIds: string[],
  alignment: AlignmentType,
  canvasWidth: number = 1000,
  canvasHeight: number = 1000
): {
  newElements: T[];
  updatedElements: T[]; // alias
  updatedCount: number;
} {
  if (!selectedIds || selectedIds.length === 0) {
    return { newElements: elements, updatedElements: elements, updatedCount: 0 };
  }

  // Collect info for all selected elements
  const selectedInfos = selectedIds
    .map((id) => findElementAndParent(id, elements))
    .filter((info): info is NonNullable<typeof info> => info !== null && !info.element.locked);

  if (selectedInfos.length === 0) {
    return { newElements: elements, updatedElements: elements, updatedCount: 0 };
  }

  const updates: Record<string, Partial<T>> = {};

  // Case 1: Single element alignment (align relative to its parent container or canvas)
  if (selectedInfos.length === 1) {
    const { element, parent } = selectedInfos[0];
    const parentW = parent ? parent.width : canvasWidth;
    const parentH = parent ? parent.height : canvasHeight;

    switch (alignment) {
      case 'left':
        updates[element.id] = { x: 0 } as Partial<T>;
        break;
      case 'center-h':
        updates[element.id] = { x: Math.round((parentW - element.width) / 2) } as Partial<T>;
        break;
      case 'right':
        updates[element.id] = { x: Math.round(parentW - element.width) } as Partial<T>;
        break;
      case 'top':
        updates[element.id] = { y: 0 } as Partial<T>;
        break;
      case 'center-v':
        updates[element.id] = { y: Math.round((parentH - element.height) / 2) } as Partial<T>;
        break;
      case 'bottom':
        updates[element.id] = { y: Math.round(parentH - element.height) } as Partial<T>;
        break;
      case 'distribute-h':
      case 'distribute-v':
        // Distribution requires at least 3 elements
        break;
    }
  } else {
    // Case 2: Multi-element alignment
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
          updates[element.id] = { x: Math.round(minX) } as Partial<T>;
        }
        break;
      case 'center-h':
        for (const { element } of selectedInfos) {
          updates[element.id] = {
            x: Math.round(boundingCenterX - element.width / 2),
          } as Partial<T>;
        }
        break;
      case 'right':
        for (const { element } of selectedInfos) {
          updates[element.id] = {
            x: Math.round(maxX - element.width),
          } as Partial<T>;
        }
        break;
      case 'top':
        for (const { element } of selectedInfos) {
          updates[element.id] = { y: Math.round(minY) } as Partial<T>;
        }
        break;
      case 'center-v':
        for (const { element } of selectedInfos) {
          updates[element.id] = {
            y: Math.round(boundingCenterY - element.height / 2),
          } as Partial<T>;
        }
        break;
      case 'bottom':
        for (const { element } of selectedInfos) {
          updates[element.id] = {
            y: Math.round(maxY - element.height),
          } as Partial<T>;
        }
        break;
      case 'distribute-h': {
        if (selectedInfos.length >= 3) {
          // Sort elements horizontally by X
          const sorted = [...selectedInfos].sort((a, b) => a.element.x - b.element.x);
          const totalWidths = sorted.reduce((sum, item) => sum + item.element.width, 0);
          const availableSpace = maxX - minX - totalWidths;
          const gap = availableSpace / (sorted.length - 1);

          let currentX = minX;
          for (let i = 0; i < sorted.length; i++) {
            const { element } = sorted[i];
            updates[element.id] = { x: Math.round(currentX) } as Partial<T>;
            currentX += element.width + gap;
          }
        }
        break;
      }
      case 'distribute-v': {
        if (selectedInfos.length >= 3) {
          // Sort elements vertically by Y
          const sorted = [...selectedInfos].sort((a, b) => a.element.y - b.element.y);
          const totalHeights = sorted.reduce((sum, item) => sum + item.element.height, 0);
          const availableSpace = maxY - minY - totalHeights;
          const gap = availableSpace / (sorted.length - 1);

          let currentY = minY;
          for (let i = 0; i < sorted.length; i++) {
            const { element } = sorted[i];
            updates[element.id] = { y: Math.round(currentY) } as Partial<T>;
            currentY += element.height + gap;
          }
        }
        break;
      }
    }
  }

  const updatedCount = Object.keys(updates).length;
  if (updatedCount === 0) {
    return { newElements: elements, updatedElements: elements, updatedCount: 0 };
  }

  // Apply updates to the element hierarchy
  function applyUpdates(list: T[]): T[] {
    return list.map((item) => {
      let current = item;
      if (updates[item.id]) {
        current = { ...current, ...updates[item.id] };
      }
      if (Array.isArray(item.children)) {
        current = { ...current, children: applyUpdates(item.children as T[]) };
      }
      return current;
    });
  }

  const newElements = applyUpdates(elements);
  return { newElements, updatedElements: newElements, updatedCount };
}
