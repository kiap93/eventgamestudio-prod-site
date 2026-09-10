/**
 * Start Screen Editor - Layer Operations
 * Re-exports and delegates to the unified Shared Visual Editor layerOperations engine.
 */
export {
  canGroupElements,
  canUngroupElements,
  groupElements,
  groupSelectedElements,
  ungroupElements,
  ungroupSelectedElements,
  reorderSiblingLayers,
  moveElementToContainer,
  duplicateElement,
  deleteElements,
  toggleElementLock,
  toggleElementsLock,
  toggleElementVisibility,
} from '../shared-editor/layerOperations';
