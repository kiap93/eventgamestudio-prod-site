/**
 * Result Screen Editor - Layer Operations
 * Re-exports and delegates to the unified Shared Visual Editor layerOperations engine.
 */
export {
  canGroupElements,
  canUngroupElements,
  groupElements,
  ungroupElements,
  reorderSiblingLayers,
  moveElementToContainer,
  duplicateElement,
  deleteElements,
  toggleElementVisibility,
  toggleElementsLock,
} from '../shared-editor/layerOperations';
