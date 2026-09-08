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
  'text',
  'image',
  'button',
  'badge',
  'rules',
  'icon',
  'keyboard-hints',
  'group',
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
 * The Authoritative Single Resolver for Start Screen Configuration.
 * Guaranteed to produce a complete, non-corrupt, valid StartScreenConfig.
 */
export function getStartScreenConfig(
  theme?: Partial<GameTheme> | null,
  gameType?: string,
  gameMeta?: StartScreenGameMeta
): StartScreenConfig {
  const resolvedGameType = getThemeGameType(theme, gameType || 'catch-brand');
  const gc = (theme?.game_config || {}) as Record<string, any>;
  const rawScreens = gc.screens || (theme as any)?.screens;
  const rawStart = rawScreens?.start;

  // 1. Resolve canvas (default 1000 x 1000)
  const canvasWidth =
    Number.isFinite(rawStart?.canvas?.width) && Number(rawStart.canvas.width) > 0
      ? Number(rawStart.canvas.width)
      : DEFAULT_START_CANVAS_CONFIG.width;
  const canvasHeight =
    Number.isFinite(rawStart?.canvas?.height) && Number(rawStart.canvas.height) > 0
      ? Number(rawStart.canvas.height)
      : DEFAULT_START_CANVAS_CONFIG.height;
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

  return {
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
}
