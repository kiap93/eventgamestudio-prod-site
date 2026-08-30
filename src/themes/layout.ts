import React, { useState, useEffect, RefObject } from 'react';
import { GameLayoutConfig, GameLayoutElement } from './types';

export type { GameLayoutConfig, GameLayoutElement };

/**
 * Logical 16:9 Game Design Coordinate System
 */
export const DESIGN_WIDTH = 1024;
export const DESIGN_HEIGHT = 576;
export const DESIGN_ASPECT_RATIO = DESIGN_WIDTH / DESIGN_HEIGHT; // 16 / 9 (1.7777777778)

/**
 * Calculates a single proportional UI scale factor based on container dimensions
 */
export function calculateGameUiScale(viewportWidth: number, viewportHeight: number): number {
  if (!viewportWidth || !viewportHeight || isNaN(viewportWidth) || isNaN(viewportHeight)) {
    return 1;
  }
  const scaleX = viewportWidth / DESIGN_WIDTH;
  const scaleY = viewportHeight / DESIGN_HEIGHT;
  return Math.min(scaleX, scaleY);
}

/**
 * React hook to observe container size and maintain a single responsive UI scale
 */
export function useGameUiScale(containerRef: RefObject<HTMLElement | null>): number {
  const [scale, setScale] = useState<number>(1);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let rafId: number | null = null;

    const measureAndUpdate = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const currentEl = containerRef.current;
        if (!currentEl) return;
        const targetEl = (currentEl.parentElement as HTMLElement) || currentEl;
        const width = targetEl.clientWidth || targetEl.getBoundingClientRect().width;
        const height = targetEl.clientHeight || targetEl.getBoundingClientRect().height;
        if (width > 0 && height > 0) {
          const nextScale = calculateGameUiScale(width, height);
          setScale((prev) => (Math.abs(prev - nextScale) > 0.001 ? nextScale : prev));
          currentEl.style.setProperty('--game-ui-scale', String(nextScale));
        }
      });
    };

    measureAndUpdate();

    // Secondary delayed check for layout settle on fullscreen/orientation changes
    const delayedMeasure = () => {
      measureAndUpdate();
      setTimeout(measureAndUpdate, 60);
      setTimeout(measureAndUpdate, 200);
    };

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        measureAndUpdate();
      });
      resizeObserver.observe(el);
    }

    window.addEventListener('resize', measureAndUpdate);
    window.addEventListener('orientationchange', delayedMeasure);
    document.addEventListener('fullscreenchange', delayedMeasure);
    document.addEventListener('webkitfullscreenchange', delayedMeasure);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      if (resizeObserver) resizeObserver.disconnect();
      window.removeEventListener('resize', measureAndUpdate);
      window.removeEventListener('orientationchange', delayedMeasure);
      document.removeEventListener('fullscreenchange', delayedMeasure);
      document.removeEventListener('webkitfullscreenchange', delayedMeasure);
    };
  }, [containerRef]);

  return scale;
}

/**
 * Standard default layout configuration (percentages 0-100 relative to viewport)
 */
export const DEFAULT_CATCH_BRAND_LAYOUT: GameLayoutConfig = {
  clientLogo: {
    visible: true,
    x: 4,
    y: 4,
    width: 14,
  },
  scoreHud: {
    visible: true,
    x: 4,
    y: 15,
    width: 18,
  },
  timer: {
    visible: true,
    x: 78,
    y: 15,
    width: 18,
  },
  gameTitle: {
    visible: true,
    x: 36,
    y: 4,
    width: 28,
  },
  footerSponsor: {
    visible: true,
    x: 32,
    y: 92,
    width: 36,
  },
};

export const DEFAULT_MEMORY_MATCH_LAYOUT: GameLayoutConfig = {
  clientLogo: {
    visible: true,
    x: 4,
    y: 4,
    width: 14,
  },
  scoreHud: {
    visible: true,
    x: 4,
    y: 15,
    width: 18,
  },
  movesHud: {
    visible: true,
    x: 24,
    y: 15,
    width: 18,
  },
  pairsHud: {
    visible: true,
    x: 44,
    y: 15,
    width: 18,
  },
  timer: {
    visible: true,
    x: 78,
    y: 15,
    width: 18,
  },
  gameTitle: {
    visible: true,
    x: 36,
    y: 4,
    width: 28,
  },
  footerSponsor: {
    visible: true,
    x: 32,
    y: 92,
    width: 36,
  },
};

export const DEFAULT_GAME_LAYOUT: GameLayoutConfig = DEFAULT_CATCH_BRAND_LAYOUT;

/**
 * Returns a fresh, deep-copied default GameLayoutConfig instance for a given game type.
 * Shared across Admin developer theme creation and User studio theme creation flows.
 */
export function getDefaultUILayout(gameType?: string): GameLayoutConfig {
  if (gameType === 'memory-match') {
    return JSON.parse(JSON.stringify(DEFAULT_MEMORY_MATCH_LAYOUT));
  }
  return JSON.parse(JSON.stringify(DEFAULT_CATCH_BRAND_LAYOUT));
}

export type CommonLayoutElementKey =
  | 'clientLogo'
  | 'scoreHud'
  | 'timer'
  | 'gameTitle'
  | 'footerSponsor';

export type MemoryMatchLayoutElementKey =
  | CommonLayoutElementKey
  | 'movesHud'
  | 'pairsHud';

export type CatchBrandLayoutElementKey = CommonLayoutElementKey;

export type LayoutElementKey = CommonLayoutElementKey | 'movesHud' | 'pairsHud';

export interface LayoutElementMeta {
  key: LayoutElementKey;
  label: string;
  shortName: string;
  description: string;
  iconName: string;
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
}

export const LAYOUT_ELEMENTS_META: Record<LayoutElementKey, LayoutElementMeta> = {
  clientLogo: {
    key: 'clientLogo',
    label: 'Client Logo',
    shortName: 'Logo',
    description: 'Event or client brand mark in the game viewport',
    iconName: 'Image',
    defaultWidth: 14,
    minWidth: 6,
    maxWidth: 40,
  },
  scoreHud: {
    key: 'scoreHud',
    label: 'Score HUD',
    shortName: 'Score',
    description: 'Current player score and point tally display',
    iconName: 'Trophy',
    defaultWidth: 18,
    minWidth: 10,
    maxWidth: 35,
  },
  movesHud: {
    key: 'movesHud',
    label: 'Moves HUD',
    shortName: 'Moves',
    description: 'Number of card pair attempts taken by the player',
    iconName: 'Footprints',
    defaultWidth: 18,
    minWidth: 10,
    maxWidth: 35,
  },
  pairsHud: {
    key: 'pairsHud',
    label: 'Pairs HUD',
    shortName: 'Pairs',
    description: 'Current matched card pairs tally display',
    iconName: 'Sparkles',
    defaultWidth: 18,
    minWidth: 10,
    maxWidth: 35,
  },
  timer: {
    key: 'timer',
    label: 'Timer',
    shortName: 'Time',
    description: 'Countdown time remaining in seconds',
    iconName: 'Timer',
    defaultWidth: 18,
    minWidth: 10,
    maxWidth: 35,
  },
  gameTitle: {
    key: 'gameTitle',
    label: 'Game Title',
    shortName: 'Title',
    description: 'Campaign game title heading badge',
    iconName: 'Type',
    defaultWidth: 28,
    minWidth: 14,
    maxWidth: 60,
  },
  footerSponsor: {
    key: 'footerSponsor',
    label: 'Footer / Sponsor',
    shortName: 'Footer',
    description: 'Promotional tagline, sponsor acknowledgment, or event disclaimer',
    iconName: 'Megaphone',
    defaultWidth: 36,
    minWidth: 15,
    maxWidth: 80,
  },
};

export const CATCH_BRAND_LAYOUT_ELEMENT_KEYS: LayoutElementKey[] = [
  'clientLogo',
  'scoreHud',
  'timer',
  'gameTitle',
  'footerSponsor',
];

export const MEMORY_MATCH_LAYOUT_ELEMENT_KEYS: LayoutElementKey[] = [
  'clientLogo',
  'scoreHud',
  'movesHud',
  'pairsHud',
  'timer',
  'gameTitle',
  'footerSponsor',
];

export const LAYOUT_ELEMENT_KEYS: LayoutElementKey[] = CATCH_BRAND_LAYOUT_ELEMENT_KEYS;

/**
 * Returns the exact list of configurable HUD element keys for a given game type.
 * Catch The Brand -> 5 elements (no Moves, no Pairs)
 * Memory Match -> 7 elements (including Moves, Pairs)
 */
export function getLayoutElementKeys(gameType?: string): LayoutElementKey[] {
  if (gameType === 'memory-match') {
    return MEMORY_MATCH_LAYOUT_ELEMENT_KEYS;
  }
  return CATCH_BRAND_LAYOUT_ELEMENT_KEYS;
}

/**
 * Normalizes a raw layout object (or undefined) into a full, valid GameLayoutConfig
 * based on the target game type.
 * For Memory Match, automatically provides safe default movesHud and pairsHud if missing from old themes.
 */
export function normalizeGameLayout(raw: any, gameType?: string): GameLayoutConfig {
  const isMemory = gameType === 'memory-match';
  const defaults = isMemory ? DEFAULT_MEMORY_MATCH_LAYOUT : DEFAULT_CATCH_BRAND_LAYOUT;

  if (!raw || typeof raw !== 'object') {
    return JSON.parse(JSON.stringify(defaults));
  }

  const normalizeElement = (key: LayoutElementKey, defaultEl?: GameLayoutElement): GameLayoutElement => {
    const fallback = defaultEl || { visible: true, x: 0, y: 0, width: 20 };
    const el = raw[key];
    if (!el || typeof el !== 'object') {
      return { ...fallback };
    }

    const visible = el.visible !== undefined ? !!el.visible : fallback.visible;
    const x = typeof el.x === 'number' && !isNaN(el.x) ? Math.max(0, Math.min(100, el.x)) : fallback.x;
    const y = typeof el.y === 'number' && !isNaN(el.y) ? Math.max(0, Math.min(100, el.y)) : fallback.y;
    const width =
      typeof el.width === 'number' && !isNaN(el.width)
        ? Math.max(4, Math.min(100, el.width))
        : fallback.width;
    const height =
      typeof el.height === 'number' && !isNaN(el.height)
        ? Math.max(2, Math.min(100, el.height))
        : fallback.height;

    return {
      visible,
      x,
      y,
      ...(width !== undefined ? { width } : {}),
      ...(height !== undefined ? { height } : {}),
    };
  };

  const res: GameLayoutConfig = {
    clientLogo: normalizeElement('clientLogo', defaults.clientLogo),
    scoreHud: normalizeElement('scoreHud', defaults.scoreHud),
    timer: normalizeElement('timer', defaults.timer),
    gameTitle: normalizeElement('gameTitle', defaults.gameTitle),
    footerSponsor: normalizeElement('footerSponsor', defaults.footerSponsor),
  };

  if (isMemory || raw.movesHud) {
    res.movesHud = normalizeElement('movesHud', DEFAULT_MEMORY_MATCH_LAYOUT.movesHud);
  }

  if (isMemory || raw.pairsHud) {
    res.pairsHud = normalizeElement('pairsHud', DEFAULT_MEMORY_MATCH_LAYOUT.pairsHud);
  }

  return res;
}

export type QuickPositionAnchor =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'center-left'
  | 'center'
  | 'center-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

/**
 * Calculates percentage X & Y for quick 9-point placement grid
 */
export function getQuickPositionCoords(
  anchor: QuickPositionAnchor,
  elementWidth: number = 20,
  estimatedHeight: number = 8
): { x: number; y: number } {
  const pad = 4; // 4% padding from edge

  switch (anchor) {
    case 'top-left':
      return { x: pad, y: pad };
    case 'top-center':
      return { x: Math.max(0, (100 - elementWidth) / 2), y: pad };
    case 'top-right':
      return { x: Math.max(0, 100 - elementWidth - pad), y: pad };
    case 'center-left':
      return { x: pad, y: Math.max(0, (100 - estimatedHeight) / 2) };
    case 'center':
      return {
        x: Math.max(0, (100 - elementWidth) / 2),
        y: Math.max(0, (100 - estimatedHeight) / 2),
      };
    case 'center-right':
      return {
        x: Math.max(0, 100 - elementWidth - pad),
        y: Math.max(0, (100 - estimatedHeight) / 2),
      };
    case 'bottom-left':
      return { x: pad, y: Math.max(0, 100 - estimatedHeight - pad) };
    case 'bottom-center':
      return {
        x: Math.max(0, (100 - elementWidth) / 2),
        y: Math.max(0, 100 - estimatedHeight - pad),
      };
    case 'bottom-right':
      return {
        x: Math.max(0, 100 - elementWidth - pad),
        y: Math.max(0, 100 - estimatedHeight - pad),
      };
    default:
      return { x: pad, y: pad };
  }
}
