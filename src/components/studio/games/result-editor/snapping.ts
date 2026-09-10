/**
 * Result Screen Editor - Snapping Engine
 * Re-exports and delegates to the unified Shared Visual Editor snapping engine.
 */
export {
  calculateSnap,
  calculateResizeSnap,
  DEFAULT_SNAP_THRESHOLD,
} from '../shared-editor/snapping';
export type {
  AlignmentGuide,
  SnapBox,
  SnapResult,
  ResizeSnapResult,
} from '../shared-editor/snapping';
