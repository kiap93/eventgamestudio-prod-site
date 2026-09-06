/**
 * Item Sizing & Aspect-Ratio Helper for Event Game Studio Drop Items & Hazards.
 *
 * Ensures that all collectible drop items and hazards preserve their original,
 * intrinsic image aspect ratio without stretching, squashing, or forced square distortion.
 *
 * Default maximum dimension: 64px (in logical game coordinates).
 * Formula:
 *   aspectRatio = naturalWidth / naturalHeight
 *   scale = (maxSize / Math.max(naturalWidth, naturalHeight)) * scaleMultiplier
 *   width = naturalWidth * scale
 *   height = naturalHeight * scale
 *
 * Invariant:
 *   renderedWidth / renderedHeight == naturalWidth / naturalHeight
 */

export const DEFAULT_MAX_DROP_ITEM_SIZE = 64;

export interface DropItemDisplaySize {
  width: number;
  height: number;
  aspectRatio: number;
}

/**
 * Calculates proportional display dimensions for a drop item or hazard based on
 * its natural image dimensions, fitting within maxSize while preserving aspect ratio.
 *
 * @param imageWidth Natural/intrinsic width of the uploaded artwork
 * @param imageHeight Natural/intrinsic height of the uploaded artwork
 * @param maxSize Maximum allowed dimension (default: 64)
 * @param scaleMultiplier Optional scale factor (e.g. 1.0, 1.5, 0.5, default: 1.0)
 * @returns {DropItemDisplaySize} Scaled width, height, and original aspect ratio
 */
export function getDropItemDisplaySize(
  imageWidth: number | undefined | null,
  imageHeight: number | undefined | null,
  maxSize: number = DEFAULT_MAX_DROP_ITEM_SIZE,
  scaleMultiplier: number = 1.0
): DropItemDisplaySize {
  const w = Number(imageWidth) || 0;
  const h = Number(imageHeight) || 0;

  // Safe fallback if intrinsic dimensions are missing or invalid
  if (w <= 0 || h <= 0) {
    const s = Math.max(1, Math.round(maxSize * (scaleMultiplier > 0 ? scaleMultiplier : 1.0)));
    return {
      width: s,
      height: s,
      aspectRatio: 1.0,
    };
  }

  const aspectRatio = w / h;
  const maxDimension = Math.max(w, h);
  const baseScale = maxSize / maxDimension;
  const safeMultiplier = typeof scaleMultiplier === 'number' && scaleMultiplier > 0 ? scaleMultiplier : 1.0;
  const effectiveScale = baseScale * safeMultiplier;

  // Round to nearest integer pixel in logical game coordinates
  const displayWidth = Math.max(1, Math.round(w * effectiveScale));
  const displayHeight = Math.max(1, Math.round(h * effectiveScale));

  return {
    width: displayWidth,
    height: displayHeight,
    aspectRatio,
  };
}
