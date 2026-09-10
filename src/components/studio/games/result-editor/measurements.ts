/**
 * Result Screen Editor - Spacing & Measurements
 * Re-exports and delegates to the unified Shared Visual Editor measurements engine.
 */
export {
  calculateMeasurements,
  GRID_SIZE_PRESETS,
} from '../shared-editor/measurements';
export type {
  SpacingMeasurement,
  ElementBounds,
  GridSizePreset,
} from '../shared-editor/measurements';
