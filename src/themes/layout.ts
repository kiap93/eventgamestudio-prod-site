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
        const currentRect = currentEl.getBoundingClientRect();
        let width = currentEl.clientWidth || currentRect.width;
        let height = currentEl.clientHeight || currentRect.height;
        if (width <= 0 || height <= 0) {
          const targetEl = (currentEl.parentElement as HTMLElement) || currentEl;
          width = targetEl.clientWidth || targetEl.getBoundingClientRect().width;
          height = targetEl.clientHeight || targetEl.getBoundingClientRect().height;
        }
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
    visible: false,
    x: 41,
    y: 9.5,
    width: 18,
  },
  scoreHud: {
    visible: true,
    x: 3.5,
    y: 3.5,
    width: 17,
  },
  timer: {
    visible: true,
    x: 79.5,
    y: 11,
    width: 17,
  },
  gameTitle: {
    visible: true,
    x: 35,
    y: 3.5,
    width: 30,
  },
  footerSponsor: {
    visible: true,
    x: 24,
    y: 92,
    width: 52,
  },
};

export const DEFAULT_MEMORY_MATCH_LAYOUT: GameLayoutConfig = {
  clientLogo: {
    visible: false,
    x: 2.5,
    y: 8.5,
    width: 16,
  },
  // ROW 1 — STATUS + CONTROLS: [SCORE] [MOVES] [PAIRS] [TIME] ... [CONTROLS]
  // Four status panels in one horizontal row, identical height, consistent spacing, compact width
  // Ordered strictly: SCORE → MOVES → PAIRS → TIME
  // Upper-right area (~78% to ~98%) remains clear for independent CONTROLS dock
  scoreHud: {
    visible: true,
    x: 2.5,
    y: 2.5,
    width: 16,
  },
  movesHud: {
    visible: true,
    x: 21,
    y: 2.5,
    width: 16,
  },
  pairsHud: {
    visible: true,
    x: 39.5,
    y: 2.5,
    width: 16,
  },
  timer: {
    visible: true,
    x: 58,
    y: 2.5,
    width: 16,
  },
  // ROW 2 — CLIENT LOGO + TITLE: [INVISIBLE CLIENT LOGO] ... [GAME TITLE]
  // Game title centered horizontally relative to the GAME CANVAS (x: 36, width: 28 -> center at 50%)
  gameTitle: {
    visible: true,
    x: 36,
    y: 8.5,
    width: 28,
  },
  footerSponsor: {
    visible: true,
    x: 24,
    y: 92.5,
    width: 52,
  },
  memoryCardBoard: {
    visible: true,
    x: 50,
    y: 53,
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
  | 'pairsHud'
  | 'memoryCardBoard';

export type CatchBrandLayoutElementKey = CommonLayoutElementKey;

export type LayoutElementKey =
  | CommonLayoutElementKey
  | 'movesHud'
  | 'pairsHud'
  | 'memoryCardBoard';

export interface LayoutElementMeta {
  key: LayoutElementKey;
  label: string;
  shortName: string;
  description: string;
  iconName: string;
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
  allowResize?: boolean;
}

export const LAYOUT_ELEMENTS_META: Record<LayoutElementKey, LayoutElementMeta> = {
  clientLogo: {
    key: 'clientLogo',
    label: 'Client Logo',
    shortName: 'Logo',
    description: 'Second-row branding logo positioned below the game title',
    iconName: 'Image',
    defaultWidth: 18,
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
  memoryCardBoard: {
    key: 'memoryCardBoard',
    label: 'Memory Card Board',
    shortName: 'Board',
    description: 'The memory card board area (center-positioned)',
    iconName: 'Grid',
    defaultWidth: 50,
    minWidth: 20,
    maxWidth: 90,
    allowResize: false,
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
  'memoryCardBoard',
];

export const LAYOUT_ELEMENT_KEYS: LayoutElementKey[] = CATCH_BRAND_LAYOUT_ELEMENT_KEYS;

/**
 * Returns the exact list of configurable HUD element keys for a given game type.
 * Catch The Brand -> 5 elements (no Moves, no Pairs)
 * Memory Match -> 8 elements (including Moves, Pairs, Memory Card Board)
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
 * For Memory Match, automatically provides safe default movesHud, pairsHud, and memoryCardBoard if missing from old themes.
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
    let x = typeof el.x === 'number' && !isNaN(el.x) ? Math.max(0, Math.min(100, el.x)) : fallback.x;
    let y = typeof el.y === 'number' && !isNaN(el.y) ? Math.max(0, Math.min(100, el.y)) : fallback.y;
    let width =
      typeof el.width === 'number' && !isNaN(el.width)
        ? Math.max(4, Math.min(100, el.width))
        : fallback.width;

    // Migrate legacy Catch the Brand top-left (3.5, 3.5) logo coordinates to clean centered second row
    if (!isMemory && key === 'clientLogo' && Math.abs(x - 3.5) < 0.1 && Math.abs(y - 3.5) < 0.1) {
      x = 41;
      y = 9.5;
      width = 18;
    }

    // Migrate uncustomized legacy Memory Match coordinates to the new two-row default layout
    // If the user customized any element (custom x/y/width), their customization is preserved
    if (isMemory && fallback) {
      const isLegacyDefaultScore =
        key === 'scoreHud' &&
        ((Math.abs(x - 4) < 0.2 && Math.abs(y - 18) < 0.5) ||
          (Math.abs(x - 3.5) < 0.2 && Math.abs(y - 11) < 0.5) ||
          (Math.abs(x - 6) < 0.2 && Math.abs(y - 2.5) < 0.5) ||
          (Math.abs(x - 3.5) < 0.2 && Math.abs(y - 3.5) < 0.5));
      const isLegacyDefaultMoves =
        key === 'movesHud' &&
        ((Math.abs(x - 4) < 0.2 && Math.abs(y - 34) < 0.5) ||
          (Math.abs(x - 3.5) < 0.2 && Math.abs(y - 20.5) < 0.5) ||
          (Math.abs(x - 29) < 0.2 && Math.abs(y - 2.5) < 0.5) ||
          (Math.abs(x - 27.5) < 0.2 && Math.abs(y - 3.5) < 0.5));
      const isLegacyDefaultTimer =
        key === 'timer' &&
        ((Math.abs(x - 76) < 0.5 && Math.abs(y - 18) < 0.5) ||
          (Math.abs(x - 78.5) < 0.5 && Math.abs(y - 11) < 0.5) ||
          (Math.abs(x - 52) < 0.5 && Math.abs(y - 2.5) < 0.5) ||
          (Math.abs(x - 51.5) < 0.5 && Math.abs(y - 3.5) < 0.5) ||
          (Math.abs(x - 75.5) < 0.5 && Math.abs(y - 3.5) < 0.5));
      const isLegacyDefaultPairs =
        key === 'pairsHud' &&
        ((Math.abs(x - 76) < 0.5 && Math.abs(y - 34) < 0.5) ||
          (Math.abs(x - 78.5) < 0.5 && Math.abs(y - 20.5) < 0.5) ||
          (Math.abs(x - 75) < 0.5 && Math.abs(y - 2.5) < 0.5) ||
          (Math.abs(x - 75.5) < 0.5 && Math.abs(y - 3.5) < 0.5) ||
          (Math.abs(x - 51.5) < 0.5 && Math.abs(y - 3.5) < 0.5));
      const isLegacyDefaultTitle =
        key === 'gameTitle' &&
        ((Math.abs(x - 34) < 0.5 && Math.abs(y - 3) < 0.5) ||
          (Math.abs(x - 33) < 0.5 && Math.abs(y - 3) < 0.5) ||
          (Math.abs(x - 35) < 0.5 && Math.abs(y - 10.5) < 0.5));
      const isLegacyDefaultLogo =
        key === 'clientLogo' &&
        ((Math.abs(x - 4) < 0.5 && Math.abs(y - 3) < 0.5) ||
          (Math.abs(x - 3.5) < 0.5 && Math.abs(y - 10.5) < 0.5));

      if (
        isLegacyDefaultScore ||
        isLegacyDefaultMoves ||
        isLegacyDefaultTimer ||
        isLegacyDefaultPairs ||
        isLegacyDefaultTitle ||
        isLegacyDefaultLogo
      ) {
        x = fallback.x;
        y = fallback.y;
        if (fallback.width !== undefined) {
          width = fallback.width;
        }
      }
    }
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
    orientation: raw.orientation === 'portrait' || raw.orientation === 'landscape' || raw.orientation === 'auto'
      ? raw.orientation
      : 'auto',
    ...(raw.position ? { position: raw.position } : {}),
    ...(raw.contentAlignment ? { contentAlignment: raw.contentAlignment } : {}),
    ...(raw.horizontalAlignment ? { horizontalAlignment: raw.horizontalAlignment } : {}),
    ...(raw.verticalAlignment ? { verticalAlignment: raw.verticalAlignment } : {}),
    ...(raw.portraitLayout && typeof raw.portraitLayout === 'object' ? { portraitLayout: raw.portraitLayout } : {}),
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

  if (isMemory || raw.memoryCardBoard) {
    res.memoryCardBoard = normalizeElement(
      'memoryCardBoard',
      DEFAULT_MEMORY_MATCH_LAYOUT.memoryCardBoard
    );
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

/**
 * Calculates center percentage X & Y for quick 9-point board placement
 */
export function getBoardQuickPositionCoords(anchor: QuickPositionAnchor): { x: number; y: number } {
  switch (anchor) {
    case 'top-left':
      return { x: 30, y: 30 };
    case 'top-center':
      return { x: 50, y: 30 };
    case 'top-right':
      return { x: 70, y: 30 };
    case 'center-left':
      return { x: 30, y: 50 };
    case 'center':
      return { x: 50, y: 50 };
    case 'center-right':
      return { x: 70, y: 50 };
    case 'bottom-left':
      return { x: 30, y: 70 };
    case 'bottom-center':
      return { x: 50, y: 70 };
    case 'bottom-right':
      return { x: 70, y: 70 };
    default:
      return { x: 50, y: 50 };
  }
}

// ============================================================================
// SHARED DRAG & POSITIONING ENGINE
// ============================================================================

export interface DragPositionParams {
  elementId: string;
  pointerX: number;
  pointerY: number;
  previewRect: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  dragOffsetX: number; // in percentage (0-100)
  dragOffsetY: number; // in percentage (0-100)
  elementWidth: number; // in percentage (0-100)
  elementHeight?: number; // in percentage (0-100)
  isCenterAnchored?: boolean; // true for memoryCardBoard (center % translate(-50%, -50%))
}

export interface DraggedPositionResult {
  x: number;
  y: number;
  rawX: number;
  rawY: number;
  clampedX: number;
  clampedY: number;
}

/**
 * Common positioning engine used by ALL Game UI Layout elements.
 * Calculates percentage-based coordinates (0-100%) relative to the active preview canvas,
 * preserves grab point drag offset to prevent jumping, and clamps dynamically within valid canvas boundaries.
 */
export function calculateDraggedPosition(params: DragPositionParams): DraggedPositionResult {
  const {
    elementId,
    pointerX,
    pointerY,
    previewRect,
    dragOffsetX,
    dragOffsetY,
    elementWidth,
    elementHeight = 8,
    isCenterAnchored = false,
  } = params;

  if (!previewRect || previewRect.width <= 0 || previewRect.height <= 0) {
    return { x: 0, y: 0, rawX: 0, rawY: 0, clampedX: 0, clampedY: 0 };
  }

  // 1. Calculate pointer coordinates as percentages of the preview rectangle
  const pointerPercentX = ((pointerX - previewRect.left) / previewRect.width) * 100;
  const pointerPercentY = ((pointerY - previewRect.top) / previewRect.height) * 100;

  // 2. Subtract the initial drag offset to preserve pointer grab point inside element
  const rawX = pointerPercentX - dragOffsetX;
  const rawY = pointerPercentY - dragOffsetY;

  // 3. Determine valid boundaries according to element geometry
  let minX = 0;
  let maxX = Math.max(0, 100 - elementWidth);
  let minY = 0;
  let maxY = Math.max(0, 100 - elementHeight);

  if (isCenterAnchored) {
    // For center-anchored elements (e.g. memoryCardBoard):
    // element position represents the center point (x%, y%)
    const halfW = Math.max(2, elementWidth / 2);
    const halfH = Math.max(2, elementHeight / 2);
    minX = Math.min(halfW, 10);
    maxX = Math.max(100 - halfW, 90);
    minY = Math.min(halfH, 10);
    maxY = Math.max(100 - halfH, 90);
  }

  // 4. Clamp coordinates strictly to valid bounds
  const clampedX = Math.max(minX, Math.min(rawX, maxX));
  const clampedY = Math.max(minY, Math.min(rawY, maxY));

  // Round to 1 decimal place for clean percentage values
  const finalX = Math.round(clampedX * 10) / 10;
  const finalY = Math.round(clampedY * 10) / 10;

  // 5. Debug log as mandated by Root Requirement 13
  console.log('[LayoutDrag]', {
    elementId,
    'previewRect.left': previewRect.left,
    'previewRect.top': previewRect.top,
    'previewRect.width': previewRect.width,
    'previewRect.height': previewRect.height,
    pointerX,
    pointerY,
    rawX,
    rawY,
    elementWidth,
    elementHeight,
    clampedX,
    clampedY,
  });

  return {
    x: finalX,
    y: finalY,
    rawX,
    rawY,
    clampedX,
    clampedY,
  };
}

