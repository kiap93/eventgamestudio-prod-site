/**
 * Shared Visual Editor Engine - Common Types & Navigation Utilities
 * Supports both Start Screen and Result Screen element structures.
 */
import React from 'react';

export type InteractionMode = 'idle' | 'drag' | 'resize' | 'rotate' | 'pan';

export type ResizeHandle =
  | 'tl'
  | 'tr'
  | 'bl'
  | 'br'
  | 't'
  | 'b'
  | 'l'
  | 'r'
  | 'nw'
  | 'n'
  | 'ne'
  | 'e'
  | 'se'
  | 's'
  | 'sw'
  | 'w';

export interface BaseVisualElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  visible?: boolean;
  locked?: boolean;
  opacity?: number;
  zIndex?: number;
  children?: any[];
  style?: Record<string, any>;
  [key: string]: any;
}

export interface EditorInteractionState {
  mode: InteractionMode;
  elementId: string;
  startX: number;
  startY: number;
  initialX: number;
  initialY: number;
  initialWidth: number;
  initialHeight: number;
  initialRotation: number;
  parentWidth: number;
  parentHeight: number;
  handle?: ResizeHandle;
  centerX?: number;
  centerY?: number;
  startAngle?: number;
  initialPositions?: Record<string, { x: number; y: number; width: number; height: number }>;
}

export interface ZoomPanState {
  zoom: number;
  panOffset: { x: number; y: number };
}

export const ZOOM_PRESETS = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0] as const;

export type AlignmentType =
  | 'left'
  | 'center-h'
  | 'right'
  | 'top'
  | 'center-v'
  | 'bottom'
  | 'distribute-h'
  | 'distribute-v';

/**
 * Recursively find an element and its immediate parent container (Card or Group) by ID.
 */
export function findElementAndParent<T extends BaseVisualElement = BaseVisualElement>(
  id: string,
  list: T[],
  parent: T | null = null
): { element: T; parent: T | null } | null {
  for (const item of list) {
    if (item.id === id) {
      return { element: item, parent };
    }
    if (Array.isArray(item.children) && item.children.length > 0) {
      const found = findElementAndParent(id, item.children as T[], item);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Checks if candidate is descendant of ancestor.
 */
export function isDescendantOf<T extends BaseVisualElement = BaseVisualElement>(
  candidateDescendantId: string,
  ancestorId: string,
  list: T[]
): boolean {
  const ancestorInfo = findElementAndParent(ancestorId, list);
  if (!ancestorInfo || !Array.isArray(ancestorInfo.element.children)) return false;

  function searchChildren(children: T[]): boolean {
    for (const child of children) {
      if (child.id === candidateDescendantId) return true;
      if (Array.isArray(child.children) && searchChildren(child.children as T[])) {
        return true;
      }
    }
    return false;
  }

  return searchChildren(ancestorInfo.element.children as T[]);
}

/**
 * Returns available containers that elementId can move into.
 */
export function getAvailableContainers<T extends BaseVisualElement = BaseVisualElement>(
  elementIdToMove: string,
  list: T[]
): Array<{ id: string; label: string; type: string }> {
  const containers: Array<{ id: string; label: string; type: string }> = [];

  function traverse(items: T[], depth: number = 0) {
    for (const item of items) {
      const isContainer = item.type === 'card' || item.type === 'group';
      if (isContainer) {
        if (item.id !== elementIdToMove && !isDescendantOf(item.id, elementIdToMove, list)) {
          containers.push({
            id: item.id,
            label: `${'  '.repeat(depth)}${item.type === 'card' ? 'Card' : 'Group'}: ${item.id.slice(0, 10)}`,
            type: item.type,
          });
        }
        if (Array.isArray(item.children)) {
          traverse(item.children as T[], depth + 1);
        }
      }
    }
  }

  traverse(list, 0);
  return containers;
}

/**
 * Finds the deepest container (card or group) containing the given point (in root space).
 */
export function findDeepestContainerAtPoint<T extends BaseVisualElement = BaseVisualElement>(
  x: number,
  y: number,
  elements: T[],
  parentOffset = { x: 0, y: 0 },
  excludedId?: string
): { container: T; offset: { x: number; y: number } } | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if (el.id === excludedId) continue;
    if (el.type === 'card' || el.type === 'group') {
      const elAbsX = parentOffset.x + el.x;
      const elAbsY = parentOffset.y + el.y;
      if (
        x >= elAbsX &&
        x <= elAbsX + el.width &&
        y >= elAbsY &&
        y <= elAbsY + el.height
      ) {
        if (Array.isArray(el.children) && el.children.length > 0) {
          const deeper = findDeepestContainerAtPoint(
            x,
            y,
            el.children as T[],
            { x: elAbsX, y: elAbsY },
            excludedId
          );
          if (deeper) return deeper;
        }
        return { container: el, offset: { x: elAbsX, y: elAbsY } };
      }
    }
  }
  return null;
}
