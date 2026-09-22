import { useState, useEffect, useMemo, RefObject } from 'react';
import { GameLayoutConfig, GameLayoutElement, GameOrientation } from './types';
import {
  DEFAULT_CATCH_BRAND_LAYOUT,
  DEFAULT_MEMORY_MATCH_LAYOUT,
  normalizeGameLayout,
} from './layout';

export type { GameOrientation };
export type EffectiveOrientation = 'portrait' | 'landscape';

/**
 * Standard Design Coordinate Systems
 * Landscape: 16:9 (1024 x 576)
 * Portrait: 9:16 (576 x 1024)
 */
export const LANDSCAPE_DESIGN_WIDTH = 1024;
export const LANDSCAPE_DESIGN_HEIGHT = 576;
export const PORTRAIT_DESIGN_WIDTH = 576;
export const PORTRAIT_DESIGN_HEIGHT = 1024;

// Backward-compatible aliases
export const DESIGN_WIDTH = LANDSCAPE_DESIGN_WIDTH;
export const DESIGN_HEIGHT = LANDSCAPE_DESIGN_HEIGHT;

export interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ResponsiveLayoutState {
  width: number;
  height: number;
  stageWidth: number;
  stageHeight: number;
  aspectRatio: number;
  orientation: EffectiveOrientation;
  isPortrait: boolean;
  isLandscape: boolean;
  uiScale: number;
  designWidth: number;
  designHeight: number;
  safeArea: SafeAreaInsets;
}

/**
 * Resolves effective orientation based on viewport dimensions and configuration mode.
 * - 'portrait': Forces portrait presentation.
 * - 'landscape': Forces landscape presentation.
 * - 'auto' (default): Automatically detects orientation from dimensions (height > width * 1.05).
 */
export function getOrientation(
  width: number,
  height: number,
  preference: GameOrientation = 'auto'
): EffectiveOrientation {
  if (preference === 'portrait') return 'portrait';
  if (preference === 'landscape') return 'landscape';

  // Auto mode: genuine vertical aspect ratio indicates portrait (requiring at least 5% vertical dominance
  // to prevent accidental portrait flipping on square or near-square desktop modal containers).
  if (height > 0 && width > 0 && height > width * 1.05) {
    return 'portrait';
  }
  return 'landscape';
}

/**
 * Authoritative Orientation Resolution for any game rendering context.
 * Combines theme layout preference, viewport dimensions, and optional explicit override.
 */
export function resolveEffectiveGameOrientation(
  themeOrientation: GameOrientation | undefined,
  viewportWidth: number,
  viewportHeight: number,
  overrideOrientation?: EffectiveOrientation | null
): EffectiveOrientation {
  if (overrideOrientation) return overrideOrientation;
  if (themeOrientation === 'portrait') return 'portrait';
  if (themeOrientation === 'landscape') return 'landscape';
  return getOrientation(viewportWidth, viewportHeight, 'auto');
}

export const resolveEffectiveOrientation = resolveEffectiveGameOrientation;

/**
 * Calculates responsive UI scale factor based on container dimensions and orientation.
 */
export function calculateResponsiveUiScale(
  viewportWidth: number,
  viewportHeight: number,
  isPortrait: boolean
): number {
  if (!viewportWidth || !viewportHeight || isNaN(viewportWidth) || isNaN(viewportHeight)) {
    return 1;
  }
  const designW = isPortrait ? PORTRAIT_DESIGN_WIDTH : LANDSCAPE_DESIGN_WIDTH;
  const designH = isPortrait ? PORTRAIT_DESIGN_HEIGHT : LANDSCAPE_DESIGN_HEIGHT;

  const scaleX = viewportWidth / designW;
  const scaleY = viewportHeight / designH;
  const scale = Math.min(scaleX, scaleY);
  return Math.max(0.1, Math.min(4.0, scale));
}

/**
 * Calculates authoritative 16:9 (or 9:16 portrait) stage dimensions that fit inside available space.
 */
export function calculateResponsiveStageDimensions(
  availableWidth: number,
  availableHeight: number,
  isPortrait: boolean
): { stageWidth: number; stageHeight: number; uiScale: number } {
  const designW = isPortrait ? PORTRAIT_DESIGN_WIDTH : LANDSCAPE_DESIGN_WIDTH;
  const designH = isPortrait ? PORTRAIT_DESIGN_HEIGHT : LANDSCAPE_DESIGN_HEIGHT;
  const targetRatio = designW / designH;

  const safeW = availableWidth > 0 ? availableWidth : designW;
  const safeH = availableHeight > 0 ? availableHeight : designH;
  const availableRatio = safeW / safeH;

  let stageWidth: number;
  let stageHeight: number;

  if (availableRatio > targetRatio) {
    // Viewport is wider than target aspect ratio -> fit to height
    stageHeight = Math.floor(safeH);
    stageWidth = Math.floor(stageHeight * targetRatio);
  } else {
    // Viewport is taller than target aspect ratio -> fit to width
    stageWidth = Math.floor(safeW);
    stageHeight = Math.floor(stageWidth / targetRatio);
  }

  stageWidth = Math.max(1, stageWidth);
  stageHeight = Math.max(1, stageHeight);
  const uiScale = Math.min(stageWidth / designW, stageHeight / designH);

  return { stageWidth, stageHeight, uiScale };
}

/**
 * Returns the authoritative runtime design dimensions and aspect ratio for the game stage.
 * - Landscape: 1024 x 576 (16:9)
 * - Portrait: 576 x 1024 (9:16)
 */
export function getGameStageDimensions(isPortrait: boolean): {
  width: number;
  height: number;
  aspectRatio: number;
  aspectRatioStr: string;
} {
  if (isPortrait) {
    return {
      width: PORTRAIT_DESIGN_WIDTH,
      height: PORTRAIT_DESIGN_HEIGHT,
      aspectRatio: PORTRAIT_DESIGN_WIDTH / PORTRAIT_DESIGN_HEIGHT, // 9 / 16 (0.5625)
      aspectRatioStr: '9 / 16',
    };
  }
  return {
    width: LANDSCAPE_DESIGN_WIDTH,
    height: LANDSCAPE_DESIGN_HEIGHT,
    aspectRatio: LANDSCAPE_DESIGN_WIDTH / LANDSCAPE_DESIGN_HEIGHT, // 16 / 9 (1.7777777778)
    aspectRatioStr: '16 / 9',
  };
}

/**
 * Measures mobile device safe-area insets using CSS environment variables.
 */
export function getSafeAreaInsets(): SafeAreaInsets {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }

  try {
    const computedStyle = window.getComputedStyle(document.documentElement);
    const parseInset = (val: string | null): number => {
      if (!val) return 0;
      const num = parseFloat(val);
      return isNaN(num) ? 0 : num;
    };

    return {
      top: parseInset(computedStyle.getPropertyValue('--safe-area-top')) || 0,
      right: parseInset(computedStyle.getPropertyValue('--safe-area-right')) || 0,
      bottom: parseInset(computedStyle.getPropertyValue('--safe-area-bottom')) || 0,
      left: parseInset(computedStyle.getPropertyValue('--safe-area-left')) || 0,
    };
  } catch {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }
}

/**
 * Default portrait HUD layout for Catch The Brand (576 x 1024 space)
 */
export const DEFAULT_PORTRAIT_CATCH_BRAND_LAYOUT: GameLayoutConfig = {
  orientation: 'auto',
  clientLogo: {
    visible: false,
    x: 36,
    y: 7.5,
    width: 28,
  },
  gameTitle: {
    visible: true,
    x: 24,
    y: 2.5,
    width: 52,
  },
  scoreHud: {
    visible: true,
    x: 4,
    y: 13,
    width: 44,
  },
  timer: {
    visible: true,
    x: 52,
    y: 13,
    width: 44,
  },
  footerSponsor: {
    visible: true,
    x: 6,
    y: 94,
    width: 88,
  },
};

/**
 * Default portrait HUD layout for Memory Match (576 x 1024 space)
 */
export const DEFAULT_PORTRAIT_MEMORY_MATCH_LAYOUT: GameLayoutConfig = {
  orientation: 'auto',
  clientLogo: {
    visible: true,
    x: 2,
    y: 6.8,
    width: 16,
  },
  // Row 1: Unified status row [SCORE] [MOVES] [PAIRS] [TIME]
  // Strict order: SCORE → MOVES → PAIRS → TIME
  scoreHud: {
    visible: true,
    x: 2,
    y: 2.0,
    width: 16,
  },
  movesHud: {
    visible: true,
    x: 19.5,
    y: 2.0,
    width: 16,
  },
  pairsHud: {
    visible: true,
    x: 37,
    y: 2.0,
    width: 16,
  },
  timer: {
    visible: true,
    x: 54.5,
    y: 2.0,
    width: 16,
  },
  // Row 2: Game title centered horizontally relative to game canvas
  gameTitle: {
    visible: true,
    x: 20,
    y: 6.8,
    width: 60,
  },
  memoryCardBoard: {
    visible: true,
    x: 50,
    y: 53,
    width: 92,
  },
  footerSponsor: {
    visible: true,
    x: 6,
    y: 94,
    width: 88,
  },
};

/**
 * Returns the effective layout adapted for either landscape or portrait orientation.
 * When in landscape, returns the original layout configuration without modification.
 * When in portrait, seamlessly maps HUD coordinates for optimal mobile/tablet readability.
 */
export function getEffectiveGameLayout(
  layout: GameLayoutConfig,
  isPortrait: boolean,
  gameType?: string
): GameLayoutConfig {
  const isMemory = gameType === 'memory-match';

  // 1. Landscape mode preserves original theme layout verbatim
  if (!isPortrait) {
    return {
      ...layout,
      orientation: layout?.orientation || 'auto',
    };
  }

  // 2. If an explicit portrait layout configuration exists, use it
  if (layout.portraitLayout && typeof layout.portraitLayout === 'object') {
    const basePortrait = isMemory
      ? DEFAULT_PORTRAIT_MEMORY_MATCH_LAYOUT
      : DEFAULT_PORTRAIT_CATCH_BRAND_LAYOUT;
    return normalizeGameLayout(
      {
        ...basePortrait,
        ...layout.portraitLayout,
        // Preserve parent element visibilities if not explicitly overridden in portrait
        clientLogo: { ...basePortrait.clientLogo, ...layout.portraitLayout.clientLogo, visible: layout.clientLogo?.visible ?? basePortrait.clientLogo.visible },
        scoreHud: { ...basePortrait.scoreHud, ...layout.portraitLayout.scoreHud, visible: layout.scoreHud?.visible ?? basePortrait.scoreHud.visible },
        timer: { ...basePortrait.timer, ...layout.portraitLayout.timer, visible: layout.timer?.visible ?? basePortrait.timer.visible },
        gameTitle: { ...basePortrait.gameTitle, ...layout.portraitLayout.gameTitle, visible: layout.gameTitle?.visible ?? basePortrait.gameTitle.visible },
        footerSponsor: { ...basePortrait.footerSponsor, ...layout.portraitLayout.footerSponsor, visible: layout.footerSponsor?.visible ?? basePortrait.footerSponsor.visible },
        ...(isMemory ? {
          movesHud: { ...basePortrait.movesHud, ...layout.portraitLayout.movesHud, visible: layout.movesHud?.visible ?? basePortrait.movesHud?.visible },
          pairsHud: { ...basePortrait.pairsHud, ...layout.portraitLayout.pairsHud, visible: layout.pairsHud?.visible ?? basePortrait.pairsHud?.visible },
          memoryCardBoard: { ...basePortrait.memoryCardBoard, ...layout.portraitLayout.memoryCardBoard, visible: layout.memoryCardBoard?.visible ?? basePortrait.memoryCardBoard?.visible },
        } : {}),
      },
      gameType
    );
  }

  // 3. Smart portrait layout mapping
  const portraitDefaults = isMemory
    ? DEFAULT_PORTRAIT_MEMORY_MATCH_LAYOUT
    : DEFAULT_PORTRAIT_CATCH_BRAND_LAYOUT;

  const res: GameLayoutConfig = {
    orientation: layout.orientation || 'auto',
    ...(layout.position ? { position: layout.position } : {}),
    ...(layout.contentAlignment ? { contentAlignment: layout.contentAlignment } : {}),
    ...(layout.horizontalAlignment ? { horizontalAlignment: layout.horizontalAlignment } : {}),
    ...(layout.verticalAlignment ? { verticalAlignment: layout.verticalAlignment } : {}),
    clientLogo: {
      ...portraitDefaults.clientLogo,
      visible: layout.clientLogo?.visible ?? portraitDefaults.clientLogo.visible,
    },
    gameTitle: {
      ...portraitDefaults.gameTitle,
      y: !isMemory && !layout.clientLogo?.visible ? 3 : portraitDefaults.gameTitle.y,
      visible: layout.gameTitle?.visible ?? true,
    },
    scoreHud: {
      ...portraitDefaults.scoreHud,
      y: !isMemory && !layout.clientLogo?.visible ? 9.5 : portraitDefaults.scoreHud.y,
      visible: layout.scoreHud?.visible ?? true,
    },
    timer: {
      ...portraitDefaults.timer,
      y: !isMemory && !layout.clientLogo?.visible ? 9.5 : portraitDefaults.timer.y,
      visible: layout.timer?.visible ?? true,
    },
    footerSponsor: {
      ...portraitDefaults.footerSponsor,
      visible: layout.footerSponsor?.visible ?? true,
    },
  };

  if (isMemory) {
    res.movesHud = {
      ...portraitDefaults.movesHud!,
      visible: layout.movesHud?.visible ?? true,
    };
    res.pairsHud = {
      ...portraitDefaults.pairsHud!,
      visible: layout.pairsHud?.visible ?? true,
    };
    res.memoryCardBoard = {
      ...portraitDefaults.memoryCardBoard!,
      visible: layout.memoryCardBoard?.visible ?? true,
    };
  }

  return res;
}

/**
 * Primary centralized responsive layout hook.
 * Observes container dimensions, visualViewport changes, safe areas, and device orientation.
 */
export function useResponsiveLayout(
  containerRef: RefObject<HTMLElement | null>,
  orientationPreference: GameOrientation = 'auto',
  overrideOrientation?: EffectiveOrientation | null
): ResponsiveLayoutState {
  const [state, setState] = useState<ResponsiveLayoutState>(() => {
    const initialWidth = typeof window !== 'undefined' ? window.innerWidth : LANDSCAPE_DESIGN_WIDTH;
    const initialHeight = typeof window !== 'undefined' ? window.innerHeight : LANDSCAPE_DESIGN_HEIGHT;
    const orientation = resolveEffectiveGameOrientation(
      orientationPreference,
      initialWidth,
      initialHeight,
      overrideOrientation
    );
    const isPortrait = orientation === 'portrait';
    const designWidth = isPortrait ? PORTRAIT_DESIGN_WIDTH : LANDSCAPE_DESIGN_WIDTH;
    const designHeight = isPortrait ? PORTRAIT_DESIGN_HEIGHT : LANDSCAPE_DESIGN_HEIGHT;
    const { stageWidth, stageHeight, uiScale } = calculateResponsiveStageDimensions(
      initialWidth,
      initialHeight,
      isPortrait
    );

    return {
      width: initialWidth,
      height: initialHeight,
      stageWidth,
      stageHeight,
      aspectRatio: initialWidth / (initialHeight || 1),
      orientation,
      isPortrait,
      isLandscape: !isPortrait,
      uiScale,
      designWidth,
      designHeight,
      safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
    };
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let rafId: number | null = null;

    const measureAndUpdate = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const currentEl = containerRef.current;
        if (!currentEl) return;

        // Prefer container element, fallback to parent or visual viewport
        const currentRect = currentEl.getBoundingClientRect();
        let width = currentEl.clientWidth || currentRect.width;
        let height = currentEl.clientHeight || currentRect.height;

        if (width <= 0 || height <= 0) {
          const parentEl = currentEl.parentElement as HTMLElement | null;
          if (parentEl) {
            const parentRect = parentEl.getBoundingClientRect();
            width = parentEl.clientWidth || parentRect.width;
            height = parentEl.clientHeight || parentRect.height;
          }
        }

        if (width <= 0 || height <= 0) {
          width = window.visualViewport ? window.visualViewport.width : window.innerWidth;
          height = window.visualViewport ? window.visualViewport.height : window.innerHeight;
        }

        if (width <= 0 || height <= 0) return;

        const orientation = resolveEffectiveGameOrientation(
          orientationPreference,
          width,
          height,
          overrideOrientation
        );
        const isPortrait = orientation === 'portrait';
        const designWidth = isPortrait ? PORTRAIT_DESIGN_WIDTH : LANDSCAPE_DESIGN_WIDTH;
        const designHeight = isPortrait ? PORTRAIT_DESIGN_HEIGHT : LANDSCAPE_DESIGN_HEIGHT;
        const { stageWidth, stageHeight, uiScale } = calculateResponsiveStageDimensions(
          width,
          height,
          isPortrait
        );
        const safeArea = getSafeAreaInsets();

        // Inject CSS custom variables onto the container
        currentEl.style.setProperty('--game-stage-width', `${stageWidth}px`);
        currentEl.style.setProperty('--game-stage-height', `${stageHeight}px`);
        currentEl.style.setProperty('--game-ui-scale', String(uiScale));
        currentEl.style.setProperty('--game-design-width', `${designWidth}px`);
        currentEl.style.setProperty('--game-design-height', `${designHeight}px`);
        currentEl.style.setProperty('--is-portrait', isPortrait ? '1' : '0');
        currentEl.style.setProperty('--safe-area-top', `${safeArea.top}px`);
        currentEl.style.setProperty('--safe-area-bottom', `${safeArea.bottom}px`);
        currentEl.style.setProperty('--safe-area-left', `${safeArea.left}px`);
        currentEl.style.setProperty('--safe-area-right', `${safeArea.right}px`);

        setState((prev) => {
          if (
            Math.abs(prev.uiScale - uiScale) < 0.001 &&
            prev.isPortrait === isPortrait &&
            prev.orientation === orientation &&
            Math.abs(prev.stageWidth - stageWidth) < 2 &&
            Math.abs(prev.stageHeight - stageHeight) < 2 &&
            Math.abs(prev.width - width) < 2 &&
            Math.abs(prev.height - height) < 2
          ) {
            return prev;
          }

          return {
            width,
            height,
            stageWidth,
            stageHeight,
            aspectRatio: width / (height || 1),
            orientation,
            isPortrait,
            isLandscape: !isPortrait,
            uiScale,
            designWidth,
            designHeight,
            safeArea,
          };
        });
      });
    };

    measureAndUpdate();

    // Cascading settle checks for fullscreen and mobile address bar animation settling
    const delayedMeasure = () => {
      measureAndUpdate();
      setTimeout(measureAndUpdate, 60);
      setTimeout(measureAndUpdate, 200);
      setTimeout(measureAndUpdate, 400);
    };

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        measureAndUpdate();
      });
      resizeObserver.observe(el);
      if (el.parentElement) {
        resizeObserver.observe(el.parentElement);
      }
    }

    window.addEventListener('resize', measureAndUpdate);
    window.addEventListener('orientationchange', delayedMeasure);
    document.addEventListener('fullscreenchange', delayedMeasure);
    document.addEventListener('webkitfullscreenchange', delayedMeasure);

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', measureAndUpdate);
    }

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      if (resizeObserver) resizeObserver.disconnect();
      window.removeEventListener('resize', measureAndUpdate);
      window.removeEventListener('orientationchange', delayedMeasure);
      document.removeEventListener('fullscreenchange', delayedMeasure);
      document.removeEventListener('webkitfullscreenchange', delayedMeasure);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', measureAndUpdate);
      }
    };
  }, [containerRef, orientationPreference, overrideOrientation]);

  return state;
}

/**
 * Backward-compatible useGameUiScale hook that uses the responsive engine.
 */
export function useGameUiScale(containerRef: RefObject<HTMLElement | null>): number {
  const { uiScale } = useResponsiveLayout(containerRef, 'auto');
  return uiScale;
}
