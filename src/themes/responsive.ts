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
    visible: true,
    x: 4,
    y: 3,
    width: 22,
  },
  gameTitle: {
    visible: true,
    x: 28,
    y: 3,
    width: 48,
  },
  scoreHud: {
    visible: true,
    x: 4,
    y: 10,
    width: 44,
  },
  timer: {
    visible: true,
    x: 52,
    y: 10,
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
    x: 4,
    y: 3,
    width: 22,
  },
  gameTitle: {
    visible: true,
    x: 28,
    y: 3,
    width: 48,
  },
  scoreHud: {
    visible: true,
    x: 4,
    y: 9,
    width: 44,
  },
  timer: {
    visible: true,
    x: 52,
    y: 9,
    width: 44,
  },
  movesHud: {
    visible: true,
    x: 4,
    y: 15.5,
    width: 44,
  },
  pairsHud: {
    visible: true,
    x: 52,
    y: 15.5,
    width: 44,
  },
  memoryCardBoard: {
    visible: true,
    x: 50,
    y: 55,
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
    clientLogo: {
      ...portraitDefaults.clientLogo,
      visible: layout.clientLogo?.visible ?? true,
    },
    gameTitle: {
      ...portraitDefaults.gameTitle,
      visible: layout.gameTitle?.visible ?? true,
    },
    scoreHud: {
      ...portraitDefaults.scoreHud,
      visible: layout.scoreHud?.visible ?? true,
    },
    timer: {
      ...portraitDefaults.timer,
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
  orientationPreference: GameOrientation = 'auto'
): ResponsiveLayoutState {
  const [state, setState] = useState<ResponsiveLayoutState>(() => {
    const initialWidth = typeof window !== 'undefined' ? window.innerWidth : LANDSCAPE_DESIGN_WIDTH;
    const initialHeight = typeof window !== 'undefined' ? window.innerHeight : LANDSCAPE_DESIGN_HEIGHT;
    const orientation = getOrientation(initialWidth, initialHeight, orientationPreference);
    const isPortrait = orientation === 'portrait';
    const uiScale = calculateResponsiveUiScale(initialWidth, initialHeight, isPortrait);
    const designWidth = isPortrait ? PORTRAIT_DESIGN_WIDTH : LANDSCAPE_DESIGN_WIDTH;
    const designHeight = isPortrait ? PORTRAIT_DESIGN_HEIGHT : LANDSCAPE_DESIGN_HEIGHT;

    return {
      width: initialWidth,
      height: initialHeight,
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
        const targetEl = (currentEl.parentElement as HTMLElement) || currentEl;
        const rect = targetEl.getBoundingClientRect();
        const width = targetEl.clientWidth || rect.width || (window.visualViewport ? window.visualViewport.width : window.innerWidth);
        const height = targetEl.clientHeight || rect.height || (window.visualViewport ? window.visualViewport.height : window.innerHeight);

        if (width <= 0 || height <= 0) return;

        const orientation = getOrientation(width, height, orientationPreference);
        const isPortrait = orientation === 'portrait';
        const uiScale = calculateResponsiveUiScale(width, height, isPortrait);
        const designWidth = isPortrait ? PORTRAIT_DESIGN_WIDTH : LANDSCAPE_DESIGN_WIDTH;
        const designHeight = isPortrait ? PORTRAIT_DESIGN_HEIGHT : LANDSCAPE_DESIGN_HEIGHT;
        const safeArea = getSafeAreaInsets();

        // Inject CSS custom variables onto the container
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
            Math.abs(prev.width - width) < 2 &&
            Math.abs(prev.height - height) < 2
          ) {
            return prev;
          }

          return {
            width,
            height,
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
  }, [containerRef, orientationPreference]);

  return state;
}

/**
 * Backward-compatible useGameUiScale hook that uses the responsive engine.
 */
export function useGameUiScale(containerRef: RefObject<HTMLElement | null>): number {
  const { uiScale } = useResponsiveLayout(containerRef, 'auto');
  return uiScale;
}
