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

export type StartScreenCoordinateSpace =
  | 'square-1000x1000'
  | 'landscape-1024x576'
  | 'portrait-576x1024'
  | 'custom';

/**
 * Detects the coordinate space that the elements in the configuration belong to.
 * Does NOT rely solely on canvas.width/canvas.height because configurations can
 * have canvas=1024x576 while elements still contain legacy 1000x1000 coordinates.
 */
export function detectStartScreenCoordinateSpace(
  config?: StartScreenConfig | null
): StartScreenCoordinateSpace {
  if (!config) return 'landscape-1024x576';

  const canvas = config.canvas;
  const elements = config.elements || [];

  // 0. Explicit coordinateSpace or version 2 marker
  // If explicitly normalized or authored with coordinateSpace, trust it immediately
  if (canvas?.coordinateSpace === 'landscape-1024x576') return 'landscape-1024x576';
  if (canvas?.coordinateSpace === 'portrait-576x1024') return 'portrait-576x1024';
  if (canvas?.coordinateSpace === 'square-1000x1000') return 'square-1000x1000';

  if (canvas?.version === 2) {
    if (canvas.coordinateSpace === 'landscape-1024x576') return 'landscape-1024x576';
    if (canvas.coordinateSpace === 'portrait-576x1024') return 'portrait-576x1024';
    if (canvas.coordinateSpace === 'square-1000x1000') return 'square-1000x1000';
  }

  // 1. Inspect root card element if present
  const card = elements.find((e) => e.type === 'card' || e.id === 'main-start-card');

  if (card) {
    const cardY = Number.isFinite(card.y) ? card.y : 0;
    const cardH = Number.isFinite(card.height) ? card.height : 0;
    const cardX = Number.isFinite(card.x) ? card.x : 0;
    const cardW = Number.isFinite(card.width) ? card.width : 0;

    // Check if card matches known legacy 1000x1000 defaults:
    // Legacy Memory Match: x=140, y=180, width=720, height=500..650
    // Legacy Reaction Tap: x=140, y=180, width=720, height=500..580
    // Notice: cardY >= 135, cardW ~ 720 (680-740), cardH >= 480
    // On a 576-tall stage, cardY + cardH (180 + 500 = 680) extends far beyond 576.
    const isLegacyCardY = cardY >= 135;
    const isLegacyCardBottom = (cardY + cardH) > 560;
    const isLegacyCardW = cardW >= 680 && cardW <= 740;
    const isLegacyCardH = cardH >= 480;

    if (isLegacyCardY && (isLegacyCardBottom || isLegacyCardW || isLegacyCardH)) {
      return 'square-1000x1000';
    }

    // Check if card matches normalized landscape 1024x576:
    // (x ≈ 132, y ≈ 53, width ≈ 760, height ≈ 470, cardY + cardH <= 576)
    const isLandscapeCard =
      cardY < 100 &&
      (cardY + cardH) <= 576 &&
      cardW >= 700 &&
      cardW <= 800;

    if (isLandscapeCard) {
      return 'landscape-1024x576';
    }

    // Check if card matches normalized portrait 576x1024:
    // (x ≈ 35, y ≈ 82, width ≈ 506, height ≈ 860, cardX + cardW <= 576)
    const isPortraitCard =
      (cardX + cardW) <= 576 &&
      cardH >= 700 &&
      cardW <= 540;

    if (isPortraitCard) {
      return 'portrait-576x1024';
    }
  }

  // 2. Explicit coordinateSpace or version marker check
  if (canvas?.coordinateSpace === 'landscape-1024x576') {
    return 'landscape-1024x576';
  }
  if (canvas?.coordinateSpace === 'portrait-576x1024') {
    return 'portrait-576x1024';
  }
  if (canvas?.coordinateSpace === 'square-1000x1000') {
    return 'square-1000x1000';
  }

  // 3. Inspect non-card elements bounding box
  if (elements.length > 0) {
    let maxY = 0;
    let maxX = 0;
    for (const el of elements) {
      if (Number.isFinite(el.y) && Number.isFinite(el.height)) {
        maxY = Math.max(maxY, el.y + el.height);
      }
      if (Number.isFinite(el.x) && Number.isFinite(el.width)) {
        maxX = Math.max(maxX, el.x + el.width);
      }
    }
    // In legacy 1000x1000, elements often reach Y > 576 and X > 576
    if (maxY > 576 * 1.05 && maxX > 576) {
      return 'square-1000x1000';
    }
  }

  // 4. Canvas dimension fallback
  const cW = canvas?.width || 1000;
  const cH = canvas?.height || 1000;
  if (Math.abs(cW - 1000) < 20 && Math.abs(cH - 1000) < 20) {
    return 'square-1000x1000';
  }
  if (Math.abs(cW - 1024) < 20 && Math.abs(cH - 576) < 20) {
    return 'landscape-1024x576';
  }
  if (Math.abs(cW - 576) < 20 && Math.abs(cH - 1024) < 20) {
    return 'portrait-576x1024';
  }

  return 'custom';
}

/**
 * Determines whether Start Screen elements need normalization to match target dimensions.
 * Idempotent: returns false if elements are already normalized to the target stage.
 */
export function needsStartScreenElementNormalization(
  config?: StartScreenConfig | null,
  targetWidth: number = 1024,
  targetHeight: number = 576
): boolean {
  if (!config) return false;

  const currentSpace = detectStartScreenCoordinateSpace(config);
  const targetSpace: StartScreenCoordinateSpace =
    targetWidth >= targetHeight ? 'landscape-1024x576' : 'portrait-576x1024';

  // If elements already match the target coordinate space, no normalization needed
  if (currentSpace === targetSpace) {
    return false;
  }

  // If switching between coordinate spaces (square, landscape, portrait), normalization is required
  if (
    currentSpace === 'square-1000x1000' ||
    currentSpace === 'landscape-1024x576' ||
    currentSpace === 'portrait-576x1024'
  ) {
    return true;
  }

  // For custom coordinate spaces, check if elements overflow target canvas
  const elements = config.elements || [];
  for (const el of elements) {
    if ((el.y + el.height) > targetHeight * 1.05 || (el.x + el.width) > targetWidth * 1.05) {
      return true;
    }
  }

  return false;
}

/**
 * Recursively normalizes child elements relative to their parent container.
 */
function normalizeElementChildren(
  children: StartScreenElement[],
  scaleX: number,
  scaleY: number
): StartScreenElement[] {
  return children.map((child) => {
    const childStyle = (child as any).style;
    const fontScale = Math.min(scaleX, scaleY);
    const normChild: StartScreenElement = {
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
                ? Math.max(10, Math.round(childStyle.fontSize * fontScale))
                : undefined,
            },
          }
        : {}),
    };

    if (Array.isArray((child as any).children) && (child as any).children.length > 0) {
      (normChild as any).children = normalizeElementChildren(
        (child as any).children,
        scaleX,
        scaleY
      );
    }
    return normChild;
  });
}

/**
 * Normalizes a Start Screen configuration for the target game stage dimensions.
 * Specifically converts legacy 1000 x 1000 square configurations to
 * 16:9 (1024 x 576) or 9:16 (576 x 1024) without corrupting the underlying saved theme.
 * Idempotent: Calling normalize multiple times produces identical output.
 */
export function normalizeStartScreenConfigForStage(
  config: StartScreenConfig,
  targetWidth: number = 1024,
  targetHeight: number = 576
): StartScreenConfig {
  if (!config) return config;

  const targetSpace: StartScreenCoordinateSpace =
    targetWidth >= targetHeight ? 'landscape-1024x576' : 'portrait-576x1024';

  // Fast check: if elements already match target coordinate space, return unmodified or stamped
  if (!needsStartScreenElementNormalization(config, targetWidth, targetHeight)) {
    if (
      config.canvas?.width === targetWidth &&
      config.canvas?.height === targetHeight &&
      config.canvas?.coordinateSpace === targetSpace
    ) {
      return config;
    }
    return {
      ...config,
      canvas: {
        ...(config.canvas || {}),
        width: targetWidth,
        height: targetHeight,
        coordinateSpace: targetSpace,
        version: 2,
      },
    };
  }

  const detectedSourceSpace = detectStartScreenCoordinateSpace(config);
  const isSourceSquare = detectedSourceSpace === 'square-1000x1000';
  const isSourcePortrait = detectedSourceSpace === 'portrait-576x1024';
  const isSourceLandscape = detectedSourceSpace === 'landscape-1024x576';

  const sourceW = isSourceSquare
    ? 1000
    : isSourcePortrait
    ? 576
    : isSourceLandscape
    ? 1024
    : config.canvas?.width || 1000;

  const sourceH = isSourceSquare
    ? 1000
    : isSourcePortrait
    ? 1024
    : isSourceLandscape
    ? 576
    : config.canvas?.height || 1000;

  const isTargetLandscape = targetWidth >= targetHeight;
  const isTargetPortrait = targetHeight > targetWidth;

  const elements = config.elements || [];

  const normalizedElements = elements.map((el) => {
    if (el.type === 'card' || el.id === 'main-start-card') {
      if (isTargetLandscape) {
        // Landscape 1024 x 576: Center card with ~74% width (760px) and ~82% height (470px)
        const newCardWidth = Math.min(Math.round(targetWidth * 0.742), 760);
        const newCardHeight = Math.min(Math.round(targetHeight * 0.816), 470);
        const newCardX = Math.round((targetWidth - newCardWidth) / 2);
        const newCardY = Math.round((targetHeight - newCardHeight) / 2);

        // Calculate original card bounds and children bounds
        const cardChildren = Array.isArray((el as any).children) ? ((el as any).children as StartScreenElement[]) : [];
        const originalCardW = el.width || (isSourceSquare ? 720 : 760);
        let maxChildBottom = 0;
        for (const c of cardChildren) {
          if (Number.isFinite(c.y) && Number.isFinite(c.height)) {
            maxChildBottom = Math.max(maxChildBottom, c.y + c.height);
          }
        }
        const originalCardH = Math.max(el.height || (isSourceSquare ? 600 : 470), maxChildBottom + 10);

        const scaleX = newCardWidth / originalCardW;
        // Ensure scaleY guarantees all children fit within the new card height with bottom breathing room
        const scaleY = maxChildBottom > 0
          ? Math.min(newCardHeight / originalCardH, (newCardHeight - 20) / maxChildBottom)
          : newCardHeight / originalCardH;

        const normalizedChildren = normalizeElementChildren(cardChildren, scaleX, scaleY);

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

        const cardChildren = Array.isArray((el as any).children) ? ((el as any).children as StartScreenElement[]) : [];
        const originalCardW = el.width || (isSourceSquare ? 720 : 506);
        let maxChildBottom = 0;
        for (const c of cardChildren) {
          if (Number.isFinite(c.y) && Number.isFinite(c.height)) {
            maxChildBottom = Math.max(maxChildBottom, c.y + c.height);
          }
        }
        const originalCardH = Math.max(el.height || (isSourceSquare ? 600 : 860), maxChildBottom + 10);

        const scaleX = newCardWidth / originalCardW;
        const scaleY = maxChildBottom > 0
          ? Math.min(newCardHeight / originalCardH, (newCardHeight - 30) / maxChildBottom)
          : newCardHeight / originalCardH;

        const normalizedChildren = normalizeElementChildren(cardChildren, scaleX, scaleY);

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
    const scaleX = targetWidth / sourceW;
    const scaleY = targetHeight / sourceH;
    const childStyle = (el as any).style;
    const fontScale = Math.min(scaleX, scaleY);
    return {
      ...el,
      x: Math.round(el.x * scaleX),
      y: Math.round(el.y * scaleY),
      width: Math.round(el.width * scaleX),
      height: Math.round(el.height * scaleY),
      ...(childStyle
        ? {
            style: {
              ...childStyle,
              fontSize: childStyle.fontSize
                ? Math.max(10, Math.round(childStyle.fontSize * fontScale))
                : undefined,
            },
          }
        : {}),
      ...(Array.isArray((el as any).children)
        ? {
            children: normalizeElementChildren((el as any).children, scaleX, scaleY),
          }
        : {}),
    };
  });

  return {
    ...config,
    canvas: {
      width: targetWidth,
      height: targetHeight,
      coordinateSpace: targetSpace,
      version: 2,
    },
    elements: normalizedElements,
  };
}

/**
 * Canonical game metadata resolver for Start Screen rendering and editing.
 * Guarantees that title, rows, cols, total cards, total pairs, duration, and logo
 * are consistently resolved across Embedded Previews and Full Visual Editors.
 */
export function resolveGameMetaForStartScreen(
  theme?: Partial<GameTheme> | null,
  gameType?: string,
  overrides?: StartScreenGameMeta
): StartScreenGameMeta {
  const resolvedGameType = getThemeGameType(theme, gameType || 'catch-brand');
  const gc = (theme?.game_config || {}) as Record<string, any>;
  const branding = (theme as any)?.branding;

  // 1. Logo
  const logoUrl =
    overrides?.logoUrl !== undefined
      ? overrides.logoUrl
      : (branding?.clientLogoUrl || (theme as any)?.clientLogo || (theme as any)?.logo || null);

  // 2. Game Title & Subtitle
  const defaultTitle =
    resolvedGameType === 'catch-brand'
      ? 'Catch The Brand'
      : resolvedGameType === 'reaction-tap'
      ? 'Reaction Tap'
      : 'Memory Match';

  const gameTitle = overrides?.gameTitle || theme?.name || defaultTitle;
  const gameSubtitle = overrides?.gameSubtitle || theme?.description || '';

  // 3. Memory Match specifics
  const rawRows = overrides?.rows ?? gc.board?.rows ?? gc.grid?.rows ?? 4;
  const rawCols = overrides?.cols ?? gc.board?.cols ?? gc.grid?.cols ?? 4;
  const rows = Math.max(2, Math.min(6, Number(rawRows) || 4));
  const cols = Math.max(2, Math.min(6, Number(rawCols) || 4));
  const calculatedTotalCards = (rows * cols) % 2 === 0 ? rows * cols : rows * cols - 1;
  const totalCards = overrides?.totalCards ?? calculatedTotalCards;
  const totalPairs = overrides?.totalPairs ?? Math.floor(totalCards / 2);

  // 4. Durations
  const memoryDuration = gc.gameplay?.gameDurationSeconds ?? gc.gameplay?.duration ?? gc.duration ?? 45;
  const catchDuration = gc.gameplay?.duration ?? gc.duration ?? 30;
  const defaultDuration = resolvedGameType === 'catch-brand' ? catchDuration : memoryDuration;
  const duration = overrides?.duration ?? defaultDuration;

  // 5. Reaction Tap specifics
  const roundsCount = overrides?.roundsCount ?? gc.roundsCount ?? 5;
  const lightCount = overrides?.lightCount ?? gc.lightCount ?? 5;

  // 6. Catch The Brand specifics
  const themeAssets = (theme as any)?.theme_assets || {};
  const dropItems = (theme as any)?.drop_items || [];
  const fallingItemName = overrides?.fallingItemName ?? gc.gameplay?.fallingItemName ?? 'Target Item';
  const badFallingItemName = overrides?.badFallingItemName ?? gc.gameplay?.badFallingItemName ?? 'Hazard Item';

  const goodDrop = Array.isArray(dropItems) ? dropItems.find((i: any) => i.type === 'normal' || i.type === 'good') : null;
  const badDrop = Array.isArray(dropItems) ? dropItems.find((i: any) => i.type === 'hazard' || i.type === 'bad') : null;

  const fallingItemImg =
    overrides?.fallingItemImg ??
    (theme as any)?.falling_item_url ??
    (theme as any)?.fallingItemUrl ??
    themeAssets.good_item ??
    themeAssets.item_normal_01 ??
    themeAssets.reward ??
    goodDrop?.url ??
    null;

  const badFallingItemImg =
    overrides?.badFallingItemImg ??
    (theme as any)?.bad_falling_item_url ??
    (theme as any)?.badFallingItemUrl ??
    themeAssets.hazard ??
    themeAssets.item_hazard_01 ??
    badDrop?.url ??
    null;

  const catcherImg =
    overrides?.catcherImg ??
    (theme as any)?.catcher_url ??
    (theme as any)?.catcherUrl ??
    (theme as any)?.basket_url ??
    themeAssets.basket ??
    themeAssets.catcher ??
    (theme as any)?.catcher ??
    (theme as any)?.basket ??
    null;

  return {
    gameTitle,
    gameSubtitle,
    logoUrl,
    rows,
    cols,
    totalCards,
    totalPairs,
    duration,
    roundsCount,
    lightCount,
    fallingItemName,
    fallingItemImg,
    goodItemImg: overrides?.goodItemImg ?? fallingItemImg,
    badFallingItemName,
    badFallingItemImg,
    badItemImg: overrides?.badItemImg ?? badFallingItemImg,
    catcherImg,
    ...(overrides || {}),
  };
}

/**
 * Recursively checks element visibility in a tree of elements.
 */
export function findStartScreenElementVisibility(
  elements: StartScreenElement[],
  id: string
): boolean | undefined {
  for (const el of elements) {
    if (el.id === id) return el.visible !== false;
    if (Array.isArray((el as any).children)) {
      const found = findStartScreenElementVisibility((el as any).children, id);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

/**
 * Recursively updates an element's visibility in a StartScreenElement tree by ID.
 */
export function updateStartScreenElementVisibility(
  elements: StartScreenElement[],
  id: string,
  visible: boolean
): StartScreenElement[] {
  return elements.map((el) => {
    let nextVis = el.visible;
    if (el.id === id) {
      nextVis = visible;
    }
    const children = Array.isArray((el as any).children)
      ? updateStartScreenElementVisibility((el as any).children, id, visible)
      : undefined;
    return {
      ...el,
      visible: nextVis,
      ...(children ? { children } : {}),
    };
  });
}

/**
 * Recursively updates multiple elements' visibility in a StartScreenElement tree by an ID map.
 */
export function updateStartScreenElementsVisibilityMap(
  elements: StartScreenElement[],
  visibilityMap: Record<string, boolean>
): StartScreenElement[] {
  return elements.map((el) => {
    let nextVis = el.visible;
    if (el.id in visibilityMap) {
      nextVis = visibilityMap[el.id];
    }
    const children = Array.isArray((el as any).children)
      ? updateStartScreenElementsVisibilityMap((el as any).children, visibilityMap)
      : undefined;
    return {
      ...el,
      visible: nextVis,
      ...(children ? { children } : {}),
    };
  });
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
  const effectiveMeta = resolveGameMetaForStartScreen(theme, resolvedGameType, gameMeta);
  const gc = (theme?.game_config || {}) as Record<string, any>;
  const rawScreens = gc.screens || (theme as any)?.screens;
  const rawStart = rawScreens?.start;

  // 1. Resolve canvas (default 1024 x 576 or target dimensions)
  const defaultW = targetDimensions?.width || DEFAULT_START_CANVAS_CONFIG.width;
  const defaultH = targetDimensions?.height || DEFAULT_START_CANVAS_CONFIG.height;

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

  // 2. Resolve background with bidirectional priority (prefer explicit background object from visual editor, then fallback to legacy)
  const bgType =
    (rawStart?.background?.type)
      ? rawStart.background.type
      : ((rawStart?.backgroundType === 'color' || rawStart?.backgroundType === 'image' || rawStart?.backgroundType === 'theme')
          ? rawStart.backgroundType
          : 'theme');

  const bgColor =
    (typeof rawStart?.background?.color === 'string' && rawStart.background.color)
      ? rawStart.background.color
      : ((typeof rawStart?.backgroundColor === 'string' && rawStart.backgroundColor)
          ? rawStart.backgroundColor
          : '#0f172a');

  const bgImageUrl =
    rawStart?.background?.imageUrl !== undefined
      ? rawStart.background.imageUrl
      : (rawStart?.backgroundImageUrl !== undefined ? rawStart.backgroundImageUrl : null);

  const bgOverlayOpacity =
    typeof rawStart?.background?.overlayOpacity === 'number'
      ? Math.max(0, Math.min(1, rawStart.background.overlayOpacity))
      : (typeof rawStart?.backgroundOverlayOpacity === 'number'
          ? Math.max(0, Math.min(1, rawStart.backgroundOverlayOpacity))
          : 0.3);

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

  // 4. Fallback generation only if genuinely no valid elements exist
  if (elements.length === 0) {
    elements = generateDefaultStartScreenElements(
      resolvedGameType,
      theme,
      effectiveMeta,
      rawStart
    );
    // If elements were generated from 1000x1000 generators and raw canvas wasn't defined,
    // ensure canvas indicates 1000x1000 source coordinates so step 5 normalizes them to target stage
    if (resolvedGameType !== 'catch-brand' && (!rawStart?.canvas?.width || (rawStart.canvas.width === 1000 && rawStart.canvas.height === 1000))) {
      canvas.width = 1000;
      canvas.height = 1000;
    }
  }

  // 4b. Synchronize legacy visibility flags with element tree visibility
  const topIconVis = findStartScreenElementVisibility(elements, 'top-icon');
  const gridVis = findStartScreenElementVisibility(elements, 'badge-grid');
  const pairsVis = findStartScreenElementVisibility(elements, 'badge-pairs');
  const timerVis = findStartScreenElementVisibility(elements, 'badge-timer');

  const showIcon = topIconVis !== undefined ? topIconVis : (rawStart?.showIcon !== false);
  const showGridInfo = gridVis !== undefined ? gridVis : (rawStart?.showGridInfo !== false);
  const showPairsInfo = pairsVis !== undefined ? pairsVis : (rawStart?.showPairsInfo !== false);
  const showTimerInfo = timerVis !== undefined ? timerVis : (rawStart?.showTimerInfo !== false);

  const resolvedConfig: StartScreenConfig = {
    // Legacy fields for backward compatibility
    backgroundType: bgType,
    backgroundColor: bgColor,
    backgroundImageUrl: bgImageUrl,
    backgroundOverlayOpacity: bgOverlayOpacity,
    showIcon,
    showGridInfo,
    showPairsInfo,
    showTimerInfo,

    // Visual Editor architecture
    canvas,
    background,
    elements,
  };

  // 5. If elements are legacy (square-1000x1000), normalize to the canonical 1024x576 canvas.
  // The 1024x576 logical canvas is the single source of truth and must never be reflowed into another aspect ratio.
  if (needsStartScreenElementNormalization(resolvedConfig, 1024, 576)) {
    return normalizeStartScreenConfigForStage(resolvedConfig, 1024, 576);
  }

  return resolvedConfig;
}

/**
 * Authoritatively saves a StartScreenConfig into a theme object, updating both
 * theme.game_config.screens.start and top-level theme.screens.start for complete backward compatibility.
 */
export function saveStartScreenConfig<T extends Partial<GameTheme>>(
  theme: T,
  startConfig: StartScreenConfig,
  gameType?: string
): T {
  const existingGameConfig = (theme?.game_config || {}) as any;
  const existingScreens = (existingGameConfig?.screens || {}) as any;

  // Harmonize background object and legacy top-level properties
  const synchronizedStartConfig: StartScreenConfig = {
    ...startConfig,
    background: {
      type: startConfig.backgroundType || startConfig.background?.type || 'theme',
      color: startConfig.backgroundColor || startConfig.background?.color || '#0f172a',
      imageUrl:
        startConfig.backgroundImageUrl !== undefined
          ? startConfig.backgroundImageUrl
          : (startConfig.background?.imageUrl ?? null),
      overlayOpacity:
        startConfig.backgroundOverlayOpacity !== undefined
          ? startConfig.backgroundOverlayOpacity
          : (startConfig.background?.overlayOpacity ?? 0.3),
    },
    backgroundType: startConfig.backgroundType || startConfig.background?.type || 'theme',
    backgroundColor: startConfig.backgroundColor || startConfig.background?.color || '#0f172a',
    backgroundImageUrl:
      startConfig.backgroundImageUrl !== undefined
        ? startConfig.backgroundImageUrl
        : (startConfig.background?.imageUrl ?? null),
    backgroundOverlayOpacity:
      startConfig.backgroundOverlayOpacity !== undefined
        ? startConfig.backgroundOverlayOpacity
        : (startConfig.background?.overlayOpacity ?? 0.3),
  };

  return {
    ...theme,
    game_config: {
      ...existingGameConfig,
      screens: {
        ...existingScreens,
        start: synchronizedStartConfig,
      },
    },
    screens: {
      ...((theme as any)?.screens || {}),
      start: synchronizedStartConfig as any,
    },
  };
}
