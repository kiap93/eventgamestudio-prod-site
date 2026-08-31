import React from 'react';
import {
  ResultScreenElement,
  ResultCardElement,
  ResultGroupElement,
  ResultTextElement,
  ResultImageElement,
  ResultScoreElement,
  ResultMovesElement,
  ResultPairsElement,
  ResultTimeElement,
  ResultAccuracyElement,
  ResultButtonElement,
  ResultScreenElementType,
  MemoryMatchResultScreenConfig,
} from '../../../../games/memory-match/types';

export type InteractionMode = 'idle' | 'drag' | 'resize' | 'rotate' | 'pan';
export type ResizeHandle = 'tl' | 'tr' | 'bl' | 'br' | 't' | 'b' | 'l' | 'r';

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
  zoom: number; // e.g. 1.0 = 100%
  panX: number;
  panY: number;
}

export const ZOOM_PRESETS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0] as const;

// Create default element factory
export const createDefaultElement = (
  type: ResultScreenElementType,
  id: string
): ResultScreenElement => {
  switch (type) {
    case 'card':
      return {
        id,
        type: 'card',
        x: 200,
        y: 180,
        width: 600,
        height: 580,
        rotation: 0,
        visible: true,
        locked: false,
        opacity: 1,
        zIndex: 1,
        style: {
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          borderWidth: 1,
          borderColor: '#334155',
          borderRadius: 24,
          shadow: true,
        },
        children: [],
      } as ResultCardElement;

    case 'image':
      return {
        id,
        type: 'image',
        x: 350,
        y: 200,
        width: 300,
        height: 180,
        rotation: 0,
        visible: true,
        locked: false,
        opacity: 1,
        zIndex: 2,
        imageUrl: null,
        objectFit: 'contain',
      } as ResultImageElement;

    case 'text':
      return {
        id,
        type: 'text',
        x: 200,
        y: 200,
        width: 600,
        height: 60,
        rotation: 0,
        visible: true,
        locked: false,
        opacity: 1,
        zIndex: 2,
        text: 'Victory!',
        style: {
          fontSize: 42,
          fontWeight: '900',
          color: '#fbbf24',
          textAlign: 'center',
          letterSpacing: 2,
        },
      } as ResultTextElement;

    case 'score':
      return {
        id,
        type: 'score',
        x: 250,
        y: 360,
        width: 500,
        height: 110,
        rotation: 0,
        visible: true,
        locked: false,
        opacity: 1,
        zIndex: 2,
        label: 'FINAL SCORE',
        style: {
          labelColor: '#94a3b8',
          valueColor: '#fbbf24',
          backgroundColor: 'rgba(2, 6, 23, 0.85)',
          borderColor: '#334155',
          borderRadius: 18,
          fontSize: 36,
          textAlign: 'center',
          layout: 'vertical',
        },
      } as ResultScoreElement;

    case 'moves':
      return {
        id,
        type: 'moves',
        x: 250,
        y: 490,
        width: 235,
        height: 85,
        rotation: 0,
        visible: true,
        locked: false,
        opacity: 1,
        zIndex: 2,
        label: 'MOVES',
        style: {
          labelColor: '#94a3b8',
          valueColor: '#38bdf8',
          backgroundColor: 'rgba(2, 6, 23, 0.85)',
          borderColor: '#334155',
          borderRadius: 16,
          fontSize: 24,
          textAlign: 'center',
          layout: 'vertical',
        },
      } as ResultMovesElement;

    case 'pairs':
      return {
        id,
        type: 'pairs',
        x: 515,
        y: 490,
        width: 235,
        height: 85,
        rotation: 0,
        visible: true,
        locked: false,
        opacity: 1,
        zIndex: 2,
        label: 'PAIRS',
        style: {
          labelColor: '#94a3b8',
          valueColor: '#34d399',
          backgroundColor: 'rgba(2, 6, 23, 0.85)',
          borderColor: '#334155',
          borderRadius: 16,
          fontSize: 24,
          textAlign: 'center',
          layout: 'vertical',
        },
      } as ResultPairsElement;

    case 'time':
      return {
        id,
        type: 'time',
        x: 250,
        y: 590,
        width: 235,
        height: 85,
        rotation: 0,
        visible: true,
        locked: false,
        opacity: 1,
        zIndex: 2,
        label: 'TIME',
        style: {
          labelColor: '#94a3b8',
          valueColor: '#38bdf8',
          backgroundColor: 'rgba(2, 6, 23, 0.85)',
          borderColor: '#334155',
          borderRadius: 16,
          fontSize: 24,
          textAlign: 'center',
          layout: 'vertical',
        },
      } as ResultTimeElement;

    case 'accuracy':
      return {
        id,
        type: 'accuracy',
        x: 515,
        y: 590,
        width: 235,
        height: 85,
        rotation: 0,
        visible: true,
        locked: false,
        opacity: 1,
        zIndex: 2,
        label: 'ACCURACY',
        style: {
          labelColor: '#94a3b8',
          valueColor: '#c084fc',
          backgroundColor: 'rgba(2, 6, 23, 0.85)',
          borderColor: '#334155',
          borderRadius: 16,
          fontSize: 24,
          textAlign: 'center',
          layout: 'vertical',
        },
      } as ResultAccuracyElement;

    case 'button':
      return {
        id,
        type: 'button',
        x: 250,
        y: 700,
        width: 500,
        height: 65,
        rotation: 0,
        visible: true,
        locked: false,
        opacity: 1,
        zIndex: 2,
        text: 'PLAY AGAIN',
        action: 'playAgain',
        style: {
          backgroundColor: '#f59e0b',
          textColor: '#020617',
          fontSize: 20,
          fontWeight: '900',
          borderRadius: 18,
          shadow: true,
        },
      } as ResultButtonElement;

    case 'group':
      return {
        id,
        type: 'group',
        x: 200,
        y: 200,
        width: 600,
        height: 600,
        rotation: 0,
        visible: true,
        locked: false,
        opacity: 1,
        zIndex: 1,
        children: [],
      } as ResultGroupElement;

    default:
      return {
        id,
        type: 'text',
        x: 250,
        y: 250,
        width: 200,
        height: 50,
        rotation: 0,
        visible: true,
        locked: false,
        opacity: 1,
        zIndex: 2,
        text: 'Element',
      } as ResultTextElement;
  }
};

// Tree search helper
export const findElementAndParent = (
  id: string,
  list: ResultScreenElement[],
  parent: ResultCardElement | ResultGroupElement | null = null
): { element: ResultScreenElement; parent: ResultCardElement | ResultGroupElement | null } | null => {
  for (const el of list) {
    if (el.id === id) {
      return { element: el, parent };
    }
    if (el.type === 'card' && (el as ResultCardElement).children) {
      const res = findElementAndParent(id, (el as ResultCardElement).children || [], el as ResultCardElement);
      if (res) return res;
    }
    if (el.type === 'group' && (el as ResultGroupElement).children) {
      const res = findElementAndParent(id, (el as ResultGroupElement).children || [], el as ResultGroupElement);
      if (res) return res;
    }
  }
  return null;
};

// Prevent cyclical nesting
export const isDescendantOf = (
  candidateDescendantId: string,
  ancestorId: string,
  list: ResultScreenElement[]
): boolean => {
  const ancestor = findElementAndParent(ancestorId, list)?.element;
  if (!ancestor) return false;
  const checkChildren = (el: ResultScreenElement): boolean => {
    const children =
      el.type === 'card'
        ? (el as ResultCardElement).children
        : el.type === 'group'
        ? (el as ResultGroupElement).children
        : undefined;
    if (!children) return false;
    for (const child of children) {
      if (child.id === candidateDescendantId) return true;
      if (checkChildren(child)) return true;
    }
    return false;
  };
  return checkChildren(ancestor);
};

// Get valid containers for an element
export const getAvailableContainers = (
  elementIdToMove: string,
  list: ResultScreenElement[]
) => {
  const containers: Array<{
    id: string;
    label: string;
    type: 'card' | 'group';
    element: ResultCardElement | ResultGroupElement;
  }> = [];
  const traverse = (items: ResultScreenElement[], prefix = '') => {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type === 'card' || item.type === 'group') {
        if (item.id !== elementIdToMove && !isDescendantOf(item.id, elementIdToMove, list)) {
          const label =
            item.type === 'card'
              ? `${prefix}Card (${item.id.slice(0, 8)})`
              : `${prefix}Group (${item.id.slice(0, 8)})`;
          containers.push({
            id: item.id,
            label,
            type: item.type,
            element: item as ResultCardElement | ResultGroupElement,
          });
          const children = (item as ResultCardElement | ResultGroupElement).children || [];
          traverse(children, `${prefix}  `);
        }
      }
    }
  };
  traverse(list);
  return containers;
};
