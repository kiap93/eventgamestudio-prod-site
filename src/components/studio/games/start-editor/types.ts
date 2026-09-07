import React from 'react';
import {
  StartScreenElement,
  StartScreenCardElement,
  StartScreenGroupElement,
  StartScreenTextElement,
  StartScreenTitleElement,
  StartScreenDescriptionElement,
  StartScreenImageElement,
  StartScreenButtonElement,
  StartScreenBadgeElement,
  StartScreenRulesElement,
  StartScreenIconElement,
  StartScreenLeaderboardElement,
  StartScreenElementType,
  StartScreenConfig,
} from '../../../../games/shared/startScreenTypes';
import {
  InteractionMode,
  ResizeHandle as ResultResizeHandle,
  EditorInteractionState,
  ZoomPanState,
  ZOOM_PRESETS,
} from '../result-editor/types';

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

export type { InteractionMode, EditorInteractionState, ZoomPanState };
export { ZOOM_PRESETS };

/**
 * Factory for creating default Start Screen elements
 */
export const createDefaultStartElement = (
  type: StartScreenElementType,
  id: string,
  gameType: string = 'memory-match'
): StartScreenElement => {
  switch (type) {
    case 'card':
      return {
        id,
        type: 'card',
        x: 180,
        y: 180,
        width: 640,
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
          backdropBlur: true,
        },
        children: [],
      } as StartScreenCardElement;

    case 'group':
      return {
        id,
        type: 'group',
        x: 200,
        y: 200,
        width: 400,
        height: 300,
        rotation: 0,
        visible: true,
        locked: false,
        opacity: 1,
        zIndex: 1,
        children: [],
      } as StartScreenGroupElement;

    case 'image':
      return {
        id,
        type: 'image',
        x: 350,
        y: 120,
        width: 300,
        height: 160,
        rotation: 0,
        visible: true,
        locked: false,
        opacity: 1,
        zIndex: 2,
        imageUrl: null,
        objectFit: 'contain',
      } as StartScreenImageElement;

    case 'title':
      return {
        id,
        type: 'title',
        x: 150,
        y: 220,
        width: 700,
        height: 70,
        rotation: 0,
        visible: true,
        locked: false,
        opacity: 1,
        zIndex: 2,
        text: gameType === 'memory-match' ? 'MEMORY MATCH' : gameType === 'reaction-tap' ? 'REFLEX CHALLENGE' : 'CATCH THE BRAND',
        style: {
          fontSize: 38,
          fontWeight: '900',
          color: '#ffffff',
          textAlign: 'center',
          textTransform: 'uppercase',
          letterSpacing: 2,
          textShadow: '0 4px 14px rgba(0,0,0,0.6)',
        },
      } as StartScreenTitleElement;

    case 'description':
      return {
        id,
        type: 'description',
        x: 150,
        y: 300,
        width: 700,
        height: 50,
        rotation: 0,
        visible: true,
        locked: false,
        opacity: 1,
        zIndex: 2,
        text: 'Flip cards, find all matching pairs, and score max bonus points!',
        style: {
          fontSize: 16,
          fontWeight: 500,
          color: '#cbd5e1',
          textAlign: 'center',
          lineHeight: 1.5,
        },
      } as StartScreenDescriptionElement;

    case 'text':
      return {
        id,
        type: 'text',
        x: 250,
        y: 360,
        width: 500,
        height: 40,
        rotation: 0,
        visible: true,
        locked: false,
        opacity: 1,
        zIndex: 2,
        text: 'Special Event Activation',
        style: {
          fontSize: 14,
          fontWeight: 600,
          color: '#94a3b8',
          textAlign: 'center',
        },
      } as StartScreenTextElement;

    case 'badge':
      return {
        id,
        type: 'badge',
        metric: 'grid',
        x: 350,
        y: 360,
        width: 160,
        height: 80,
        rotation: 0,
        visible: true,
        locked: false,
        opacity: 1,
        zIndex: 2,
        label: 'GRID',
        value: '4×4 Cards',
        style: {
          backgroundColor: 'rgba(2, 6, 23, 0.85)',
          borderColor: '#334155',
          borderWidth: 1,
          borderRadius: 16,
          labelColor: '#94a3b8',
          valueColor: '#fbbf24',
          fontSize: 16,
          textAlign: 'center',
          layout: 'vertical',
          gap: 4,
        },
      } as StartScreenBadgeElement;

    case 'button':
      return {
        id,
        type: 'button',
        x: 240,
        y: 470,
        width: 520,
        height: 72,
        rotation: 0,
        visible: true,
        locked: false,
        opacity: 1,
        zIndex: 3,
        text: 'START GAME',
        action: 'startGame',
        iconName: 'play',
        style: {
          backgroundColor: '#f59e0b',
          textColor: '#020617',
          fontSize: 22,
          fontWeight: '900',
          borderRadius: 18,
          borderWidth: 0,
          shadow: true,
          pulse: true,
          letterSpacing: 1.5,
          textTransform: 'uppercase',
        },
      } as StartScreenButtonElement;

    case 'rules':
      return {
        id,
        type: 'rules',
        gameType,
        x: 220,
        y: 350,
        width: 560,
        height: 110,
        rotation: 0,
        visible: true,
        locked: false,
        opacity: 1,
        zIndex: 2,
        title: 'HOW TO PLAY',
        description: 'Match cards before the clock expires to claim victory!',
        style: {
          backgroundColor: 'rgba(2, 6, 23, 0.8)',
          borderColor: '#334155',
          borderWidth: 1,
          borderRadius: 18,
          textColor: '#e2e8f0',
          fontSize: 14,
          showIcons: true,
        },
      } as StartScreenRulesElement;

    case 'icon':
      return {
        id,
        type: 'icon',
        x: 460,
        y: 130,
        width: 80,
        height: 80,
        rotation: 0,
        visible: true,
        locked: false,
        opacity: 1,
        zIndex: 2,
        iconName: 'Grid3X3',
        style: {
          backgroundColor: 'rgba(245, 158, 11, 0.15)',
          borderColor: 'rgba(245, 158, 11, 0.4)',
          borderWidth: 2,
          borderRadius: 22,
          iconColor: '#fbbf24',
          shadow: true,
        },
      } as StartScreenIconElement;

    case 'leaderboard':
      return {
        id,
        type: 'leaderboard',
        x: 250,
        y: 340,
        width: 500,
        height: 160,
        rotation: 0,
        visible: true,
        locked: false,
        opacity: 1,
        zIndex: 2,
        maxRows: 3,
        showHeader: true,
        headerText: 'TOP HIGH SCORES',
        style: {
          backgroundColor: 'rgba(2, 6, 23, 0.85)',
          borderColor: '#334155',
          borderWidth: 1,
          borderRadius: 18,
          fontSize: 13,
          textColor: '#e2e8f0',
          rankColor: '#fbbf24',
          scoreColor: '#38bdf8',
          showHeader: true,
        },
      } as StartScreenLeaderboardElement;

    default:
      return {
        id,
        type: 'text',
        x: 350,
        y: 300,
        width: 300,
        height: 50,
        rotation: 0,
        visible: true,
        locked: false,
        opacity: 1,
        zIndex: 2,
        text: 'New Element',
      } as StartScreenTextElement;
  }
};

/**
 * Tree search helper for finding an element and its parent container in Start Screen
 */
export const findElementAndParent = (
  id: string,
  list: StartScreenElement[],
  parent: StartScreenCardElement | StartScreenGroupElement | null = null
): { element: StartScreenElement; parent: StartScreenCardElement | StartScreenGroupElement | null } | null => {
  for (const el of list) {
    if (el.id === id) {
      return { element: el, parent };
    }
    if (el.type === 'card' && (el as StartScreenCardElement).children) {
      const res = findElementAndParent(id, (el as StartScreenCardElement).children || [], el as StartScreenCardElement);
      if (res) return res;
    }
    if (el.type === 'group' && (el as StartScreenGroupElement).children) {
      const res = findElementAndParent(id, (el as StartScreenGroupElement).children || [], el as StartScreenGroupElement);
      if (res) return res;
    }
  }
  return null;
};

/**
 * Prevent cyclical nesting
 */
export const isDescendantOf = (
  candidateDescendantId: string,
  ancestorId: string,
  list: StartScreenElement[]
): boolean => {
  const ancestor = findElementAndParent(ancestorId, list)?.element;
  if (!ancestor) return false;
  const checkChildren = (el: StartScreenElement): boolean => {
    const children =
      el.type === 'card'
        ? (el as StartScreenCardElement).children
        : el.type === 'group'
        ? (el as StartScreenGroupElement).children
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

/**
 * Get valid containers for an element to move into
 */
export const getAvailableContainers = (
  elementIdToMove: string,
  list: StartScreenElement[]
) => {
  const containers: Array<{
    id: string;
    label: string;
    type: 'card' | 'group';
    element: StartScreenCardElement | StartScreenGroupElement;
  }> = [];
  const traverse = (items: StartScreenElement[], prefix = '') => {
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
            element: item as StartScreenCardElement | StartScreenGroupElement,
          });
          const children = (item as StartScreenCardElement | StartScreenGroupElement).children || [];
          traverse(children, `${prefix}  `);
        }
      }
    }
  };
  traverse(list);
  return containers;
};
