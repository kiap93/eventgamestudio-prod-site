/**
 * Authoritative Start Screen Configuration Resolver & Sanitizer.
 * Central single-source-of-truth for all games:
 * Catch The Brand, Memory Match, Reaction Tap.
 */

import {
  StartScreenConfig,
  StartScreenElement,
  StartScreenCanvasConfig,
  StartScreenBackgroundConfig,
  StartScreenGameMeta,
  DEFAULT_START_CANVAS_CONFIG,
  generateDefaultStartScreenElements,
} from './startScreenTypes';
import { GameTheme, getThemeGameType } from '../../themes/types';

const VALID_ELEMENT_TYPES = new Set([
  'card',
  'title',
  'description',
  'text',
  'image',
  'button',
  'badge',
  'rules',
  'icon',
  'keyboard-hints',
  'group',
  'leaderboard',
]);

/**
 * Sanitizes a single Start Screen element, guaranteeing finite numbers,
 * positive dimensions, safe defaults, and recursive sanitization for card/group children.
 * Rejects completely corrupt, null, or unrecognized element types.
 */
export function sanitizeStartScreenElement(
  rawEl: any,
  fallbackParentWidth: number = 1000,
  fallbackParentHeight: number = 1000
): StartScreenElement | null {
  if (!rawEl || typeof rawEl !== 'object') {
    return null;
  }

  const rawType = String(rawEl.type || '').trim().toLowerCase();
  if (!VALID_ELEMENT_TYPES.has(rawType)) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[StartScreenResolver] Unknown or unsupported element type: "${rawEl.type}"`);
    }
    return null;
  }

  const id = typeof rawEl.id === 'string' && rawEl.id.trim().length > 0
    ? rawEl.id
    : `el_${Math.random().toString(36).substring(2, 9)}`;

  const x = Number.isFinite(rawEl.x) ? Number(rawEl.x) : 0;
  const y = Number.isFinite(rawEl.y) ? Number(rawEl.y) : 0;
  const width = Number.isFinite(rawEl.width) && Number(rawEl.width) > 0
    ? Number(rawEl.width)
    : Math.min(200, fallbackParentWidth);
  const height = Number.isFinite(rawEl.height) && Number(rawEl.height) > 0
    ? Number(rawEl.height)
    : Math.min(60, fallbackParentHeight);
  const rotation = Number.isFinite(rawEl.rotation) ? Number(rawEl.rotation) : 0;
  const opacity = Number.isFinite(rawEl.opacity)
    ? Math.max(0, Math.min(1, Number(rawEl.opacity)))
    : 1;
  const zIndex = Number.isFinite(rawEl.zIndex)
    ? Math.max(1, Math.min(999, Math.floor(Number(rawEl.zIndex))))
    : 1;
  const visible = rawEl.visible !== false;
  const locked = Boolean(rawEl.locked);

  const base: any = {
    ...rawEl,
    id,
    type: rawType,
    x,
    y,
    width,
    height,
    rotation,
    opacity,
    zIndex,
    visible,
    locked,
  };

  // If this is a container (card or group), sanitize its nested children
  if (Array.isArray(rawEl.children)) {
    const validChildren: StartScreenElement[] = [];
    for (const child of rawEl.children) {
      const sanitizedChild = sanitizeStartScreenElement(child, width, height);
      if (sanitizedChild) {
        validChildren.push(sanitizedChild);
      }
    }
    base.children = validChildren;
  }

  return base as StartScreenElement;
}

/**
 * Sanitizes an entire array of elements.
 */
export function sanitizeStartScreenElements(
  elements?: any[] | null,
  canvasWidth: number = 1000,
  canvasHeight: number = 1000
): StartScreenElement[] {
  if (!Array.isArray(elements) || elements.length === 0) {
    return [];
  }

  const validList: StartScreenElement[] = [];
  for (const item of elements) {
    const sanitized = sanitizeStartScreenElement(item, canvasWidth, canvasHeight);
    if (sanitized) {
      validList.push(sanitized);
    }
  }
  return validList;
}

/**
 * Normalizes a Start Screen configuration for the target game stage dimensions.
 * Specifically converts legacy 1000 x 1000 square configurations to
 * 16:9 (1024 x 576) or 9:16 (576 x 1024) without corrupting the underlying saved theme.
 */
export function normalizeStartScreenConfigForStage(
  config: StartScreenConfig,
  targetWidth: number = 1024,
  targetHeight: number = 576
): StartScreenConfig {
  if (!config) return config;

  const currentW = config.canvas?.width || 1000;
  const currentH = config.canvas?.height || 1000;

  // If already matches target canvas dimensions within tolerance, return as is
  if (Math.abs(currentW - targetWidth) < 2 && Math.abs(currentH - targetHeight) < 2) {
    return config;
  }

  const isCurrentSquare = Math.abs(currentW - currentH) < 80;
  const isTargetLandscape = targetWidth > targetHeight;
  const isTargetPortrait = targetHeight > targetWidth;

  const elements = config.elements || [];

  const normalizedElements = elements.map((el) => {
    if (el.type === 'card' && isCurrentSquare) {
      if (isTargetLandscape) {
        // Landscape 1024 x 576: Center card with ~74% width (760px) and ~82% height (470px)
        const newCardWidth = Math.min(Math.round(targetWidth * 0.742), 760);
        const newCardHeight = Math.min(Math.round(targetHeight * 0.816), 470);
        const newCardX = Math.round((targetWidth - newCardWidth) / 2);
        const newCardY = Math.round((targetHeight - newCardHeight) / 2);

        const originalCardW = el.width || 720;
        const originalCardH = el.height || 600;
        const scaleX = newCardWidth / originalCardW;
        const scaleY = newCardHeight / originalCardH;

        const normalizedChildren = (el.children || []).map((child) => {
          const childStyle = (child as any).style;
          return {
            ...child,
            x: Math.round(child.x * scaleX),
            y: Math.round(child.y * scaleY),
            width: Math.round(child.width * scaleX),
            height: Math.round(child.height * scaleY),
            ...(childStyle
              ? {
                  style: {
                    ...childStyle,
                    fontSize: childStyle.fontSize
                      ? Math.max(10, Math.round(childStyle.fontSize * Math.min(scaleX, scaleY)))
                      : undefined,
                  },
                }
              : {}),
          };
        });

        return {
          ...el,
          x: newCardX,
          y: newCardY,
          width: newCardWidth,
          height: newCardHeight,
          children: normalizedChildren,
        };
      } else if (isTargetPortrait) {
        // Portrait 576 x 1024: Center card with ~88% width (506px) and ~84% height (860px)
        const newCardWidth = Math.min(Math.round(targetWidth * 0.878), 506);
        const newCardHeight = Math.min(Math.round(targetHeight * 0.84), 860);
        const newCardX = Math.round((targetWidth - newCardWidth) / 2);
        const newCardY = Math.round((targetHeight - newCardHeight) / 2);

        const originalCardW = el.width || 720;
        const originalCardH = el.height || 600;
        const scaleX = newCardWidth / originalCardW;
        const scaleY = newCardHeight / originalCardH;

        const normalizedChildren = (el.children || []).map((child) => {
          const childStyle = (child as any).style;
          return {
            ...child,
            x: Math.round(child.x * scaleX),
            y: Math.round(child.y * scaleY),
            width: Math.round(child.width * scaleX),
            height: Math.round(child.height * scaleY),
            ...(childStyle
              ? {
                  style: {
                    ...childStyle,
                    fontSize: childStyle.fontSize
                      ? Math.max(10, Math.round(childStyle.fontSize * Math.min(scaleX, scaleY)))
                      : undefined,
                  },
                }
              : {}),
          };
        });

        return {
          ...el,
          x: newCardX,
          y: newCardY,
          width: newCardWidth,
          height: newCardHeight,
          children: normalizedChildren,
        };
      }
    }

    // Generic linear scaling for non-card root elements
    const scaleX = targetWidth / currentW;
    const scaleY = targetHeight / currentH;
    return {
      ...el,
      x: Math.round(el.x * scaleX),
      y: Math.round(el.y * scaleY),
      width: Math.round(el.width * scaleX),
      height: Math.round(el.height * scaleY),
    };
  });

  return {
    ...config,
    canvas: {
      width: targetWidth,
      height: targetHeight,
    },
    elements: normalizedElements,
  };
}

/**
 * The Authoritative Single Resolver for Start Screen Configuration.
 * Guaranteed to produce a complete, non-corrupt, valid StartScreenConfig.
 */
export function getStartScreenConfig(
  theme?: Partial<GameTheme> | null,
  gameType?: string,
  gameMeta?: StartScreenGameMeta,
  targetDimensions?: { width: number; height: number }
): StartScreenConfig {
  const resolvedGameType = getThemeGameType(theme, gameType || 'catch-brand');
  const gc = (theme?.game_config || {}) as Record<string, any>;
  const rawScreens = gc.screens || (theme as any)?.screens;
  const rawStart = rawScreens?.start;

  // 1. Resolve canvas (default 1024 x 576 for catch-brand or target dimensions)
  const defaultW = targetDimensions?.width || (resolvedGameType === 'catch-brand' ? 1024 : DEFAULT_START_CANVAS_CONFIG.width);
  const defaultH = targetDimensions?.height || (resolvedGameType === 'catch-brand' ? 576 : DEFAULT_START_CANVAS_CONFIG.height);

  const canvasWidth =
    Number.isFinite(rawStart?.canvas?.width) && Number(rawStart.canvas.width) > 0
      ? Number(rawStart.canvas.width)
      : defaultW;
  const canvasHeight =
    Number.isFinite(rawStart?.canvas?.height) && Number(rawStart.canvas.height) > 0
      ? Number(rawStart.canvas.height)
      : defaultH;
  const canvas: StartScreenCanvasConfig = {
    width: canvasWidth,
    height: canvasHeight,
  };

  // 2. Resolve background
  const bgType =
    rawStart?.background?.type ||
    (rawStart?.backgroundType === 'color' ||
    rawStart?.backgroundType === 'image' ||
    rawStart?.backgroundType === 'theme'
      ? rawStart.backgroundType
      : 'theme');

  const bgColor =
    rawStart?.background?.color ||
    (typeof rawStart?.backgroundColor === 'string' ? rawStart.backgroundColor : '#0f172a');

  const bgImageUrl =
    rawStart?.background?.imageUrl ?? rawStart?.backgroundImageUrl ?? null;

  const bgOverlayOpacity =
    typeof rawStart?.background?.overlayOpacity === 'number'
      ? Math.max(0, Math.min(1, rawStart.background.overlayOpacity))
      : typeof rawStart?.backgroundOverlayOpacity === 'number'
      ? Math.max(0, Math.min(1, rawStart.backgroundOverlayOpacity))
      : 0.3;

  const background: StartScreenBackgroundConfig = {
    type: bgType,
    color: bgColor,
    imageUrl: bgImageUrl,
    overlayOpacity: bgOverlayOpacity,
  };

  // 3. Resolve & Sanitize Elements
  let elements: StartScreenElement[] = [];
  if (Array.isArray(rawStart?.elements) && rawStart.elements.length > 0) {
    elements = sanitizeStartScreenElements(rawStart.elements, canvas.width, canvas.height);
  }

  // 4. Fallback generation if no valid elements exist
  if (elements.length === 0) {
    elements = generateDefaultStartScreenElements(
      resolvedGameType,
      theme,
      gameMeta,
      rawStart
    );
  }

  const resolvedConfig: StartScreenConfig = {
    // Legacy fields for backward compatibility
    backgroundType: bgType,
    backgroundColor: bgColor,
    backgroundImageUrl: bgImageUrl,
    backgroundOverlayOpacity: bgOverlayOpacity,
    showIcon: rawStart?.showIcon !== false,
    showGridInfo: rawStart?.showGridInfo !== false,
    showPairsInfo: rawStart?.showPairsInfo !== false,
    showTimerInfo: rawStart?.showTimerInfo !== false,

    // Visual Editor architecture
    canvas,
    background,
    elements,
  };

  // 5. If target dimensions provided or Catch The Brand with legacy square canvas, normalize to target dimensions
  if (targetDimensions) {
    return normalizeStartScreenConfigForStage(resolvedConfig, targetDimensions.width, targetDimensions.height);
  } else if (resolvedGameType === 'catch-brand' && canvas.width === 1000 && canvas.height === 1000) {
    return normalizeStartScreenConfigForStage(resolvedConfig, 1024, 576);
  }

  return resolvedConfig;
}
