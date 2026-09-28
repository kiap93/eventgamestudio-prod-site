import { ThemeBasketConfig } from './types';

/**
 * Catcher Sizing & Aspect-Ratio Helper for Event Game Studio Catch The Brand games.
 *
 * Ensures that the catcher / basket artwork strictly preserves its natural,
 * intrinsic aspect ratio across all screen resolutions, orientations (landscape/portrait),
 * and game environments (Demo, Live, Studio Preview).
 *
 * Invariant:
 *   catcherHeight / catcherWidth === texture.height / texture.width
 */

export interface CatcherDisplaySize {
  width: number;
  height: number;
  aspectRatio: number; // width / height
  heightToWidthRatio: number; // height / width
}

/**
 * Helper to safely extract intrinsic pixel dimensions from any texture representation
 * (Phaser.Textures.Texture, Phaser.Textures.Frame, HTMLImageElement, HTMLCanvasElement, or plain object).
 */
export function getTextureNaturalDimensions(texture?: any): { width: number; height: number } {
  if (!texture) return { width: 0, height: 0 };

  // 1. Phaser Texture source[0] (Standard Phaser 3/4 texture source)
  const src = texture.source?.[0];
  if (src && typeof src.width === 'number' && typeof src.height === 'number' && src.width > 0 && src.height > 0) {
    return { width: src.width, height: src.height };
  }

  // 2. getSourceImage() method on Phaser Texture or Sprite
  if (typeof texture.getSourceImage === 'function') {
    try {
      const img = texture.getSourceImage();
      if (img) {
        const w = img.naturalWidth || img.width || 0;
        const h = img.naturalHeight || img.height || 0;
        if (w > 0 && h > 0) return { width: w, height: h };
      }
    } catch {
      // Ignore errors from unready canvas/image
    }
  }

  // 3. Phaser Frame
  const realW = texture.realWidth || texture.width || 0;
  const realH = texture.realHeight || texture.height || 0;
  if (realW > 0 && realH > 0) {
    return { width: realW, height: realH };
  }

  // 4. Standard HTMLImageElement properties
  const natW = texture.naturalWidth || 0;
  const natH = texture.naturalHeight || 0;
  if (natW > 0 && natH > 0) {
    return { width: natW, height: natH };
  }

  return { width: 0, height: 0 };
}

/**
 * Canonical Catcher Sizing Calculation.
 *
 * Calculates the desired catcher width relative to the actual Phaser game viewport,
 * and derives the height strictly from the texture's natural aspect ratio.
 *
 * @param gameWidth Actual viewport / canvas logical width
 * @param gameHeight Actual viewport / canvas logical height
 * @param texture Texture or image source providing natural dimensions
 * @param basketConfig Optional theme basket configuration (with custom width override if any)
 * @returns {CatcherDisplaySize} Calculated width, height, and aspect ratios
 */
export function calculateCatcherSize(
  gameWidth: number,
  gameHeight: number,
  texture?: any,
  basketConfig?: Partial<ThemeBasketConfig> | null
): CatcherDisplaySize {
  const safeW = gameWidth > 0 ? gameWidth : 1024;
  const safeH = gameHeight > 0 ? gameHeight : 576;
  const isPortrait = safeH > safeW;

  // 1. Resolve natural texture aspect ratio
  const { width: naturalW, height: naturalH } = getTextureNaturalDimensions(texture);
  let heightToWidthRatio: number;
  let aspectRatio: number;

  if (naturalW > 0 && naturalH > 0) {
    heightToWidthRatio = naturalH / naturalW;
    aspectRatio = naturalW / naturalH;
  } else {
    // Default fallback: 1.5 aspect ratio (3:2), matching canonical basket PNGs (1536x1024)
    heightToWidthRatio = 2 / 3; // 0.6667
    aspectRatio = 1.5;
  }

  // 2. Base width calculation relative to the game viewport
  const customBaseWidth =
    typeof basketConfig?.width === 'number' && basketConfig.width > 0
      ? basketConfig.width
      : 140;

  let desiredWidth: number;
  if (isPortrait) {
    // Standard portrait design coordinate system: 576 x 1024
    // Baseline: 140px on 576px wide canvas (~24.3% of viewport width)
    const baseRatio = customBaseWidth / 576;
    desiredWidth = Math.round(safeW * baseRatio);
    // Reasonable clamp for portrait viewports: [80px, 200px] or max 35% of width
    const minW = Math.max(60, Math.min(80, Math.round(safeW * 0.15)));
    const maxW = Math.max(160, Math.round(safeW * 0.35));
    desiredWidth = Math.max(minW, Math.min(maxW, desiredWidth));
  } else {
    // Standard landscape design coordinate system: 1024 x 576
    // Baseline: 140px on 1024px wide canvas (~13.67% of viewport width)
    const baseRatio = customBaseWidth / 1024;
    desiredWidth = Math.round(safeW * baseRatio);
    // Reasonable clamp for landscape viewports: [90px, 240px] or max 24% of width
    const minW = Math.max(80, Math.min(90, Math.round(safeW * 0.08)));
    const maxW = Math.max(180, Math.round(safeW * 0.24));
    desiredWidth = Math.max(minW, Math.min(maxW, desiredWidth));
  }

  // 3. Derive height strictly from natural aspect ratio (NEVER independently)
  let desiredHeight = Math.round(desiredWidth * heightToWidthRatio);

  // 4. Apply height boundaries if the texture is unusually tall or short
  const maxHeight = Math.round(safeH * 0.28);
  if (desiredHeight > maxHeight) {
    desiredHeight = maxHeight;
    desiredWidth = Math.max(1, Math.round(desiredHeight * aspectRatio));
  }

  const minHeight = 36;
  if (desiredHeight < minHeight) {
    desiredHeight = minHeight;
    desiredWidth = Math.max(1, Math.round(desiredHeight * aspectRatio));
  }

  return {
    width: desiredWidth,
    height: desiredHeight,
    aspectRatio,
    heightToWidthRatio,
  };
}

/**
 * Calculates the centered Y coordinate for the catcher sprite
 * ensuring proportional bottom clearance without touching the lower screen bezel.
 *
 * @param gameHeight Actual viewport / canvas logical height
 * @param basketHeight Current rendered height of the basket
 * @param isPortrait Whether current presentation is portrait
 * @returns {number} Y coordinate for sprite center (origin: 0.5, 0.5)
 */
export function calculateCatcherTargetY(
  gameHeight: number,
  basketHeight: number,
  isPortrait?: boolean
): number {
  const safeH = gameHeight > 0 ? gameHeight : 576;
  const portrait = isPortrait ?? safeH > 700;

  // Adaptive bottom margin: comfortable clearance from bottom cabinet/touch bezel
  const bottomPadding = portrait
    ? Math.max(30, Math.round(safeH * 0.05))
    : Math.max(20, Math.round(safeH * 0.04));

  return Math.round(safeH - basketHeight / 2 - bottomPadding);
}
