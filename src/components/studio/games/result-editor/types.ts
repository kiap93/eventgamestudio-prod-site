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
  ResultLeaderboardElement,
  ResultAverageReactionElement,
  ResultBestReactionElement,
  ResultWorstReactionElement,
  ResultRoundResultsElement,
  ResultRatingElement,
  ResultTargetScoreElement,
  ResultStarRatingElement,
  ResultMatchesElement,
  ResultSpecialsElement,
  ResultComboElement,
  ResultScreenElementType,
  MemoryMatchResultScreenConfig,
} from '../../../../games/memory-match/types';
import { normalizeGameType } from '../../../../themes/types';

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
  id: string,
  gameType?: string,
  subType?: string
): ResultScreenElement => {
  const normGame = normalizeGameType(gameType || '');
  const isMatch3 = normGame === 'match-3';

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
        x: subType === 'logo' ? 380 : 350,
        y: subType === 'logo' ? 40 : 200,
        width: subType === 'logo' ? 240 : 300,
        height: subType === 'logo' ? 100 : 180,
        rotation: 0,
        visible: true,
        locked: false,
        opacity: 1,
        zIndex: 2,
        imageUrl: null,
        objectFit: 'contain',
      } as ResultImageElement;

    case 'text':
      if (subType === 'title') {
        return {
          id,
          type: 'text',
          x: 100,
          y: 40,
          width: 800,
          height: 60,
          rotation: 0,
          visible: true,
          locked: false,
          opacity: 1,
          zIndex: 2,
          text: isMatch3 ? 'SWEET VICTORY!' : 'Victory!',
          style: {
            fontSize: 44,
            fontWeight: '900',
            color: '#fbbf24',
            textAlign: 'center',
            letterSpacing: 2,
          },
        } as ResultTextElement;
      }
      if (subType === 'message') {
        return {
          id,
          type: 'text',
          x: 100,
          y: 110,
          width: 800,
          height: 48,
          rotation: 0,
          visible: true,
          locked: false,
          opacity: 1,
          zIndex: 2,
          text: isMatch3 ? 'Outstanding Cascade Combos!' : 'Great performance!',
          style: {
            fontSize: 22,
            fontWeight: '600',
            color: '#cbd5e1',
            textAlign: 'center',
            letterSpacing: 1,
          },
        } as ResultTextElement;
      }
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
        text: isMatch3 ? 'Match-3 Text' : 'Victory!',
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
          fontSize: isMatch3 ? 40 : 36,
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
      if (subType === 'exit') {
        return {
          id,
          type: 'button',
          x: 250,
          y: 780,
          width: 500,
          height: 55,
          rotation: 0,
          visible: true,
          locked: false,
          opacity: 1,
          zIndex: 2,
          text: 'EXIT GAME',
          action: 'exit',
          style: {
            backgroundColor: '#334155',
            textColor: '#f8fafc',
            fontSize: 18,
            fontWeight: '800',
            borderRadius: 16,
            shadow: false,
          },
        } as ResultButtonElement;
      }
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

    case 'leaderboard':
      return {
        id,
        type: 'leaderboard',
        x: 150,
        y: 280,
        width: 700,
        height: 380,
        rotation: 0,
        visible: true,
        locked: false,
        opacity: 1,
        zIndex: 2,
        headerText: 'LEADERBOARD',
        showHeader: true,
        showRank: true,
        showPlayerName: true,
        showScore: true,
        showMoves: false,
        showTime: false,
        showAccuracy: false,
        maxRows: 5,
        submission: {
          inputPlaceholder: 'Enter your name',
          inputMaxLength: 20,
          submitButtonText: 'SUBMIT SCORE',
          successMessage: 'Score submitted!',
        },
        style: {
          backgroundColor: 'rgba(15, 23, 42, 0.92)',
          borderColor: '#334155',
          borderWidth: 1,
          borderRadius: 20,
          padding: 12,
          shadow: true,
          fontSize: 16,
          textColor: '#f8fafc',
          rankColor: '#fbbf24',
          scoreColor: '#fbbf24',
          headerColor: '#fbbf24',
          rowSpacing: 6,
          highlightCurrentPlayer: true,
          highlightColor: 'rgba(245, 158, 11, 0.2)',
          submission: {
            inputPlaceholder: 'Enter your name',
            inputMaxLength: 20,
            submitButtonText: 'SUBMIT SCORE',
            successMessage: 'Score submitted!',
          },
        },
      } as ResultLeaderboardElement;

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

    case 'average-reaction':
      return {
        id,
        type: 'average-reaction',
        x: 200,
        y: 250,
        width: 600,
        height: 110,
        rotation: 0,
        visible: true,
        locked: false,
        opacity: 1,
        zIndex: 2,
        label: 'AVERAGE REACTION',
        style: {
          labelColor: '#94a3b8',
          valueColor: '#38bdf8',
          backgroundColor: 'rgba(2, 6, 23, 0.85)',
          borderColor: '#334155',
          borderRadius: 18,
          fontSize: 42,
          textAlign: 'center',
          layout: 'vertical',
        },
      } as ResultAverageReactionElement;

    case 'best-reaction':
      return {
        id,
        type: 'best-reaction',
        x: 200,
        y: 380,
        width: 290,
        height: 85,
        rotation: 0,
        visible: true,
        locked: false,
        opacity: 1,
        zIndex: 2,
        label: 'BEST REACTION',
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
      } as ResultBestReactionElement;

    case 'worst-reaction':
      return {
        id,
        type: 'worst-reaction',
        x: 510,
        y: 380,
        width: 290,
        height: 85,
        rotation: 0,
        visible: true,
        locked: false,
        opacity: 1,
        zIndex: 2,
        label: 'WORST REACTION',
        style: {
          labelColor: '#94a3b8',
          valueColor: '#f87171',
          backgroundColor: 'rgba(2, 6, 23, 0.85)',
          borderColor: '#334155',
          borderRadius: 16,
          fontSize: 24,
          textAlign: 'center',
          layout: 'vertical',
        },
      } as ResultWorstReactionElement;

    case 'round-results':
      return {
        id,
        type: 'round-results',
        x: 200,
        y: 480,
        width: 600,
        height: 90,
        rotation: 0,
        visible: true,
        locked: false,
        opacity: 1,
        zIndex: 2,
        label: 'ROUND RESULTS',
        style: {
          labelColor: '#94a3b8',
          valueColor: '#ffffff',
          backgroundColor: 'rgba(2, 6, 23, 0.85)',
          borderColor: '#334155',
          borderRadius: 16,
          fontSize: 18,
          textAlign: 'center',
        },
      } as ResultRoundResultsElement;

    case 'rating':
      return {
        id,
        type: 'rating',
        x: 350,
        y: 190,
        width: 300,
        height: 60,
        rotation: 0,
        visible: true,
        locked: false,
        opacity: 1,
        zIndex: 2,
        label: 'RATING',
        style: {
          labelColor: '#94a3b8',
          valueColor: '#fbbf24',
          backgroundColor: 'rgba(2, 6, 23, 0.85)',
          borderColor: '#334155',
          borderRadius: 16,
          fontSize: 26,
          textAlign: 'center',
        },
      } as ResultRatingElement;

    case 'target-score':
      return {
        id,
        type: 'target-score',
        x: 250,
        y: 480,
        width: 235,
        height: 85,
        rotation: 0,
        visible: true,
        locked: false,
        opacity: 1,
        zIndex: 2,
        label: 'TARGET SCORE',
        style: {
          labelColor: '#94a3b8',
          valueColor: '#a78bfa',
          backgroundColor: 'rgba(2, 6, 23, 0.85)',
          borderColor: '#334155',
          borderRadius: 16,
          fontSize: 24,
          textAlign: 'center',
          layout: 'vertical',
        },
      } as ResultTargetScoreElement;

    case 'star-rating':
      return {
        id,
        type: 'star-rating',
        x: 300,
        y: 270,
        width: 400,
        height: 80,
        rotation: 0,
        visible: true,
        locked: false,
        opacity: 1,
        zIndex: 2,
        label: 'RATING',
        starsCount: 3,
        style: {
          starCount: 3,
          starSize: 38,
          starSpacing: 10,
          filledColor: '#fbbf24',
          emptyColor: '#334155',
          showLabel: false,
          label: 'STAR RATING',
          labelColor: '#94a3b8',
          fontSize: 18,
          backgroundColor: 'transparent',
          borderRadius: 12,
        },
      } as ResultStarRatingElement;

    case 'matches':
      return {
        id,
        type: 'matches',
        x: 250,
        y: 580,
        width: 235,
        height: 85,
        rotation: 0,
        visible: true,
        locked: false,
        opacity: 1,
        zIndex: 2,
        label: 'MATCHES CLEARED',
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
      } as ResultMatchesElement;

    case 'combo':
      return {
        id,
        type: 'combo',
        x: 515,
        y: 580,
        width: 235,
        height: 85,
        rotation: 0,
        visible: true,
        locked: false,
        opacity: 1,
        zIndex: 2,
        label: 'BEST COMBO',
        style: {
          labelColor: '#94a3b8',
          valueColor: '#fb923c',
          backgroundColor: 'rgba(2, 6, 23, 0.85)',
          borderColor: '#334155',
          borderRadius: 16,
          fontSize: 24,
          textAlign: 'center',
          layout: 'vertical',
        },
      } as ResultComboElement;

    case 'specials':
      return {
        id,
        type: 'specials',
        x: 515,
        y: 480,
        width: 235,
        height: 85,
        rotation: 0,
        visible: true,
        locked: false,
        opacity: 1,
        zIndex: 2,
        label: 'SPECIALS CREATED',
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
      } as ResultSpecialsElement;

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
