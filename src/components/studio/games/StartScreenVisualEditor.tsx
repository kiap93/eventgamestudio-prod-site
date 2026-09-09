import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  StartScreenConfig,
  StartScreenElement,
  StartScreenCardElement,
  StartScreenGroupElement,
  StartScreenElementType,
} from '../../../games/shared/startScreenTypes';
import { GameTheme } from '../../../themes/types';
import {
  createDefaultStartElement,
  findElementAndParent,
  getAvailableContainers,
  isDescendantOf,
} from './start-editor/types';
import {
  canGroupElements,
  canUngroupElements,
  groupSelectedElements,
  ungroupSelectedElements,
  reorderSiblingLayers,
  moveElementToContainer,
  duplicateElement,
  deleteElements,
  toggleElementLock,
  toggleElementVisibility,
} from './start-editor/layerOperations';
import { alignElements, ElementAlignment } from './start-editor/alignmentOperations';
import { LayerTreePanel } from './start-editor/LayerTreePanel';
import { CanvasWorkspace } from './start-editor/CanvasWorkspace';
import { PropertyInspectorPanel } from './start-editor/PropertyInspectorPanel';
import { EditorTopBar } from './start-editor/EditorTopBar';
import { PresetLibraryModal } from './start-editor/PresetLibraryModal';
import { SaveTemplateModal } from './start-editor/SaveTemplateModal';
import { useStartScreenHistory, filterValidStartSelectedIds } from './start-editor/history';
import { generateDefaultStartScreenElements } from '../../../games/shared/startScreenTypes';
import { normalizeStartScreenConfigForStage } from '../../../games/shared/startScreenResolver';

export interface StartScreenVisualEditorProps {
  startConfig: StartScreenConfig;
  theme: Partial<GameTheme>;
  gameType?: string;
  onChange: (updatedConfig: Partial<StartScreenConfig>) => void;
  isOpen?: boolean;
  onClose?: () => void;
  isModal?: boolean;
  onToggleFullscreen?: () => void;
  onUploadAsset?: (file: File, type: string) => Promise<string>;
}

export const StartScreenVisualEditor: React.FC<StartScreenVisualEditorProps> = ({
  startConfig,
  theme,
  gameType = 'memory-match',
  onChange,
  isOpen = true,
  onClose,
  isModal = false,
  onToggleFullscreen,
  onUploadAsset,
}) => {
  // Effective config with automatic game-stage canvas matching
  const effectiveConfig = useMemo(() => {
    const orientation = theme?.orientation || 'landscape';
    const stageW = orientation === 'portrait' ? 576 : 1024;
    const stageH = orientation === 'portrait' ? 1024 : 576;

    return normalizeStartScreenConfigForStage(startConfig, stageW, stageH);
  }, [startConfig, theme?.orientation]);

  // Elements initialization with fallback
  const initialElements = useMemo(() => {
    if (effectiveConfig.elements && effectiveConfig.elements.length > 0) {
      return effectiveConfig.elements;
    }
    const def = generateDefaultStartScreenElements(gameType, theme, undefined, effectiveConfig);
    if (effectiveConfig.canvas?.width && effectiveConfig.canvas?.height) {
      const normalized = normalizeStartScreenConfigForStage(
        { canvas: { width: 1000, height: 1000 }, elements: def },
        effectiveConfig.canvas.width,
        effectiveConfig.canvas.height
      );
      return normalized.elements || def;
    }
    return def;
  }, [effectiveConfig, theme, gameType]);

  // History management
  const {
    elements: currentElements,
    pushSnapshot: setSnapshot,
    beginGesture: recordGestureStart,
    endGesture: recordGestureEnd,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useStartScreenHistory(initialElements);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isLayerTreeCollapsed, setIsLayerTreeCollapsed] = useState<boolean>(false);
  const [isPreviewMode, setIsPreviewMode] = useState<boolean>(false);

  // Modals state
  const [isPresetModalOpen, setIsPresetModalOpen] = useState(false);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);

  // Keep parent config synced whenever elements change
  const syncToParent = useCallback(
    (newElements: StartScreenElement[]) => {
      const stageW = effectiveConfig.canvas?.width || 1024;
      const stageH = effectiveConfig.canvas?.height || 576;
      const targetSpace = stageW >= stageH ? 'landscape-1024x576' : 'portrait-576x1024';
      onChange({
        ...effectiveConfig,
        canvas: {
          ...(effectiveConfig.canvas || {}),
          width: stageW,
          height: stageH,
          coordinateSpace: targetSpace,
          version: 2,
        },
        elements: newElements,
      });
    },
    [onChange, effectiveConfig]
  );

  // Update elements and save to history
  const updateElementsWithHistory = useCallback(
    (newElements: StartScreenElement[]) => {
      setSnapshot(newElements);
      syncToParent(newElements);
    },
    [setSnapshot, syncToParent]
  );

  // Clean invalid selectedIds if elements are deleted
  useEffect(() => {
    setSelectedIds((prev) => filterValidStartSelectedIds(prev, currentElements));
  }, [currentElements]);

  // Find currently selected primary element
  const selectedElementInfo = useMemo(() => {
    if (selectedIds.length === 0) return null;
    return findElementAndParent(selectedIds[0], currentElements);
  }, [selectedIds, currentElements]);

  const selectedElement = selectedElementInfo ? selectedElementInfo.element : null;

  // Selection handler
  const handleSelectElement = useCallback((id: string, e?: React.MouseEvent) => {
    if (e && (e.shiftKey || e.ctrlKey || e.metaKey)) {
      setSelectedIds((prev) =>
        prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
      );
    } else {
      setSelectedIds([id]);
    }
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedIds([]);
  }, []);

  // Update batch elements (e.g. from dragging/nudging multiple)
  const handleUpdateBatchElements = useCallback(
    (updates: Record<string, Partial<StartScreenElement>>) => {
      const updateRecursive = (list: StartScreenElement[]): StartScreenElement[] => {
        return list.map((item) => {
          let updated = item;
          if (updates[item.id]) {
            updated = { ...item, ...updates[item.id] } as StartScreenElement;
          }
          if (updated.type === 'card' || updated.type === 'group') {
            const container = updated as StartScreenCardElement | StartScreenGroupElement;
            return {
              ...updated,
              children: updateRecursive(container.children || []),
            };
          }
          return updated;
        });
      };

      const nextElements = updateRecursive(currentElements);
      setSnapshot(nextElements);
      syncToParent(nextElements);
    },
    [currentElements, setSnapshot, syncToParent]
  );

  // Update single element (e.g. from property inspector or resize)
  const handleUpdateSingleElement = useCallback(
    (id: string, updater: (prev: StartScreenElement) => StartScreenElement) => {
      const updateRecursive = (list: StartScreenElement[]): StartScreenElement[] => {
        return list.map((item) => {
          if (item.id === id) {
            return updater(item);
          }
          if (item.type === 'card' || item.type === 'group') {
            const container = item as StartScreenCardElement | StartScreenGroupElement;
            return {
              ...item,
              children: updateRecursive(container.children || []),
            };
          }
          return item;
        });
      };

      const nextElements = updateRecursive(currentElements);
      setSnapshot(nextElements);
      syncToParent(nextElements);
    },
    [currentElements, setSnapshot, syncToParent]
  );

  // Add new root element
  const handleAddNewRootElement = useCallback(
    (type: StartScreenElementType) => {
      const newEl = createDefaultStartElement(type, gameType);
      const nextElements = [...currentElements, newEl];
      updateElementsWithHistory(nextElements);
      setSelectedIds([newEl.id]);
    },
    [currentElements, gameType, updateElementsWithHistory]
  );

  // Add child element into a container
  const handleAddChildElement = useCallback(
    (parentId: string, type: StartScreenElementType) => {
      const newEl = createDefaultStartElement(type, gameType);
      // Position inside container nicely
      newEl.x = 20;
      newEl.y = 20;

      const updateRecursive = (list: StartScreenElement[]): StartScreenElement[] => {
        return list.map((item) => {
          if (item.id === parentId && (item.type === 'card' || item.type === 'group')) {
            const container = item as StartScreenCardElement | StartScreenGroupElement;
            return {
              ...item,
              children: [...(container.children || []), newEl],
            };
          }
          if (item.type === 'card' || item.type === 'group') {
            const container = item as StartScreenCardElement | StartScreenGroupElement;
            return {
              ...item,
              children: updateRecursive(container.children || []),
            };
          }
          return item;
        });
      };

      const nextElements = updateRecursive(currentElements);
      updateElementsWithHistory(nextElements);
      setSelectedIds([newEl.id]);
    },
    [currentElements, gameType, updateElementsWithHistory]
  );

  // Duplicate selected elements
  const handleDuplicateSelected = useCallback(() => {
    if (selectedIds.length === 0) return;
    let list = currentElements;
    const newSelected: string[] = [];

    for (const id of selectedIds) {
      const res = duplicateElement(list, id);
      list = res.newElements;
      if (res.duplicatedId) {
        newSelected.push(res.duplicatedId);
      }
    }

    updateElementsWithHistory(list);
    if (newSelected.length > 0) {
      setSelectedIds(newSelected);
    }
  }, [selectedIds, currentElements, updateElementsWithHistory]);

  // Delete selected elements
  const handleDeleteSelected = useCallback(() => {
    if (selectedIds.length === 0) return;
    const nextElements = deleteElements(currentElements, selectedIds);
    updateElementsWithHistory(nextElements);
    setSelectedIds([]);
  }, [selectedIds, currentElements, updateElementsWithHistory]);

  // Toggle lock
  const handleToggleLock = useCallback(
    (id: string) => {
      const nextElements = toggleElementLock(currentElements, id);
      updateElementsWithHistory(nextElements);
    },
    [currentElements, updateElementsWithHistory]
  );

  // Toggle visibility
  const handleToggleVisibility = useCallback(
    (id: string) => {
      const nextElements = toggleElementVisibility(currentElements, id);
      updateElementsWithHistory(nextElements);
    },
    [currentElements, updateElementsWithHistory]
  );

  // Move layer order
  const handleMoveLayer = useCallback(
    (id: string, direction: 'forward' | 'backward' | 'front' | 'back') => {
      const nextElements = reorderSiblingLayers(currentElements, id, direction);
      updateElementsWithHistory(nextElements);
    },
    [currentElements, updateElementsWithHistory]
  );

  // Center horizontally on canvas
  const handleCenterSelectedHorizontal = useCallback(() => {
    if (selectedIds.length === 0) return;
    const updates: Record<string, Partial<StartScreenElement>> = {};

    for (const id of selectedIds) {
      const info = findElementAndParent(id, currentElements);
      if (info && !info.element.locked) {
        const parentW = info.parent ? info.parent.width : 1000;
        updates[id] = {
          x: Math.round((parentW - info.element.width) / 2),
        };
      }
    }

    if (Object.keys(updates).length > 0) {
      handleUpdateBatchElements(updates);
    }
  }, [selectedIds, currentElements, handleUpdateBatchElements]);

  // Center vertically on canvas
  const handleCenterSelectedVertical = useCallback(() => {
    if (selectedIds.length === 0) return;
    const updates: Record<string, Partial<StartScreenElement>> = {};

    for (const id of selectedIds) {
      const info = findElementAndParent(id, currentElements);
      if (info && !info.element.locked) {
        const parentH = info.parent ? info.parent.height : 1000;
        updates[id] = {
          y: Math.round((parentH - info.element.height) / 2),
        };
      }
    }

    if (Object.keys(updates).length > 0) {
      handleUpdateBatchElements(updates);
    }
  }, [selectedIds, currentElements, handleUpdateBatchElements]);

  // Comprehensive Element Alignment (Left, Center, Right, Top, Middle, Bottom, Distribute)
  const handleAlignSelected = useCallback(
    (alignment: ElementAlignment) => {
      if (selectedIds.length === 0) return;
      const stageW = effectiveConfig.canvas?.width || 1024;
      const stageH = effectiveConfig.canvas?.height || 576;
      const nextElements = alignElements(currentElements, selectedIds, alignment, stageW, stageH);
      updateElementsWithHistory(nextElements);
    },
    [selectedIds, effectiveConfig.canvas?.width, effectiveConfig.canvas?.height, currentElements, updateElementsWithHistory]
  );

  // Bulk Lock Toggle for selected elements
  const handleBulkLockToggle = useCallback(() => {
    if (selectedIds.length === 0) return;
    const shouldLock = !isAllSelectedLocked;
    const updateRecursive = (list: StartScreenElement[]): StartScreenElement[] => {
      return list.map((item) => {
        let updated = item;
        if (selectedIds.includes(item.id)) {
          updated = { ...item, locked: shouldLock };
        }
        if (updated.type === 'card' || updated.type === 'group') {
          const container = updated as StartScreenCardElement | StartScreenGroupElement;
          return {
            ...updated,
            children: updateRecursive(container.children || []),
          };
        }
        return updated;
      });
    };
    const nextElements = updateRecursive(currentElements);
    updateElementsWithHistory(nextElements);
  }, [selectedIds, isAllSelectedLocked, currentElements, updateElementsWithHistory]);

  // Grouping
  const canGroup = useMemo(
    () => canGroupElements(currentElements, selectedIds),
    [currentElements, selectedIds]
  );

  const canUngroup = useMemo(
    () => canUngroupElements(currentElements, selectedIds),
    [currentElements, selectedIds]
  );

  const handleGroupSelected = useCallback(() => {
    const res = groupSelectedElements(currentElements, selectedIds);
    if (res.groupId) {
      updateElementsWithHistory(res.newElements);
      setSelectedIds([res.groupId]);
    }
  }, [currentElements, selectedIds, updateElementsWithHistory]);

  const handleUngroupSelected = useCallback(() => {
    const res = ungroupSelectedElements(currentElements, selectedIds);
    if (res.unpackedIds.length > 0) {
      updateElementsWithHistory(res.newElements);
      setSelectedIds(res.unpackedIds);
    }
  }, [currentElements, selectedIds, updateElementsWithHistory]);

  // Reset to default layout
  const handleResetLayout = useCallback(() => {
    if (window.confirm('Reset Start Screen layout to default preset? Any unsaved changes will be lost.')) {
      const defaults = generateDefaultStartScreenElements(gameType, theme, undefined, effectiveConfig);
      if (effectiveConfig.canvas?.width && effectiveConfig.canvas?.height) {
        const normalized = normalizeStartScreenConfigForStage(
          { canvas: { width: 1000, height: 1000 }, elements: defaults },
          effectiveConfig.canvas.width,
          effectiveConfig.canvas.height
        );
        updateElementsWithHistory(normalized.elements || defaults);
      } else {
        updateElementsWithHistory(defaults);
      }
      setSelectedIds([]);
    }
  }, [effectiveConfig, theme, gameType, updateElementsWithHistory]);

  // Apply preset
  const handleApplyPreset = useCallback(
    (newElements: StartScreenElement[]) => {
      updateElementsWithHistory(newElements);
      setSelectedIds([]);
    },
    [updateElementsWithHistory]
  );

  // Check if all selected elements are locked
  const isAllSelectedLocked = useMemo(() => {
    if (selectedIds.length === 0) return false;
    return selectedIds.every((id) => {
      const info = findElementAndParent(id, currentElements);
      return info?.element.locked;
    });
  }, [selectedIds, currentElements]);

  // Move element to container
  const handleMoveToContainer = useCallback(
    (elementId: string, targetContainerId: string | null) => {
      const nextElements = moveElementToContainer(currentElements, elementId, targetContainerId);
      updateElementsWithHistory(nextElements);
    },
    [currentElements, updateElementsWithHistory]
  );

  if (!isOpen) return null;

  return (
    <div
      className={`flex flex-col bg-slate-950 text-slate-100 overflow-hidden ${
        isModal ? 'fixed inset-0 z-50 w-screen h-screen' : 'relative w-full h-full min-h-[600px]'
      }`}
    >
      {/* Top Controls & Action Toolbar */}
      <EditorTopBar
        selectedIds={selectedIds}
        totalElementsCount={currentElements.length}
        gameType={gameType}
        isPreviewMode={isPreviewMode}
        onTogglePreviewMode={() => setIsPreviewMode((p) => !p)}
        onAlignSelected={handleAlignSelected}
        canvasWidth={effectiveConfig.canvas?.width || 1024}
        canvasHeight={effectiveConfig.canvas?.height || 576}
        onAddNewRootElement={handleAddNewRootElement}
        onCenterSelectedHorizontal={handleCenterSelectedHorizontal}
        onCenterSelectedVertical={handleCenterSelectedVertical}
        onMoveSelectedLayer={(dir) => {
          if (selectedIds[0]) handleMoveLayer(selectedIds[0], dir);
        }}
        onDuplicateSelected={handleDuplicateSelected}
        onDeleteSelected={handleDeleteSelected}
        onResetLayout={handleResetLayout}
        onOpenPresets={() => setIsPresetModalOpen(true)}
        onSaveAsTemplate={() => setIsSaveModalOpen(true)}
        onClose={onClose || (() => {})}
        canGroup={canGroup}
        canUngroup={canUngroup}
        onGroupSelected={handleGroupSelected}
        onUngroupSelected={handleUngroupSelected}
        onToggleLockSelected={() => {
          if (selectedIds[0]) handleToggleLock(selectedIds[0]);
        }}
        isAllSelectedLocked={isAllSelectedLocked}
        isModal={isModal}
        onToggleFullscreen={onToggleFullscreen}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
      />

      {/* Main Workspace Body */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left: Layer Tree Panel (hidden in full live preview mode) */}
        {!isPreviewMode && (
          <LayerTreePanel
            elements={currentElements}
            selectedIds={selectedIds}
            gameType={gameType}
            onSelectElement={handleSelectElement}
            onToggleVisibility={handleToggleVisibility}
            onToggleLock={handleToggleLock}
            onDeleteElement={(id) => {
              const nextElements = deleteElements(currentElements, [id]);
              updateElementsWithHistory(nextElements);
              setSelectedIds((prev) => prev.filter((i) => i !== id));
            }}
            onDuplicateElement={(id) => {
              const res = duplicateElement(currentElements, id);
              updateElementsWithHistory(res.newElements);
              if (res.duplicatedId) setSelectedIds([res.duplicatedId]);
            }}
            onMoveLayer={handleMoveLayer}
            onMoveToContainer={handleMoveToContainer}
            onAddChildElement={handleAddChildElement}
            isCollapsed={isLayerTreeCollapsed}
            onToggleCollapse={() => setIsLayerTreeCollapsed((c) => !c)}
            canvasWidth={effectiveConfig.canvas?.width}
            canvasHeight={effectiveConfig.canvas?.height}
          />
        )}

        {/* Center: Canvas Workspace */}
        <div className="flex-1 h-full relative overflow-hidden bg-slate-950">
          <CanvasWorkspace
            startConfig={effectiveConfig}
            theme={theme}
            gameType={gameType}
            elements={currentElements}
            selectedIds={selectedIds}
            isPreviewMode={isPreviewMode}
            onExitPreview={() => setIsPreviewMode(false)}
            onSelectElement={handleSelectElement}
            onClearSelection={handleClearSelection}
            onUpdateElements={handleUpdateBatchElements}
            onUpdateSingleElement={handleUpdateSingleElement}
            findElementAndParent={findElementAndParent}
            onGestureStart={recordGestureStart}
            onGestureEnd={recordGestureEnd}
            onUndo={undo}
            onRedo={redo}
            onDelete={handleDeleteSelected}
            onDuplicate={handleDuplicateSelected}
          />
        </div>

        {/* Right: Property Inspector Panel (hidden in full live preview mode) */}
        {!isPreviewMode && (
          <PropertyInspectorPanel
            selectedElement={selectedElement}
            selectedIds={selectedIds}
            elements={currentElements}
            startConfig={effectiveConfig}
            theme={theme}
            gameType={gameType}
            canvasWidth={effectiveConfig.canvas?.width || 1024}
            canvasHeight={effectiveConfig.canvas?.height || 576}
            onAlignSelected={handleAlignSelected}
            onGroupSelected={handleGroupSelected}
            canGroup={canGroup}
            onBulkLockToggle={handleBulkLockToggle}
            isAllSelectedLocked={isAllSelectedLocked}
            onUpdateElement={(updater) => {
              if (selectedElement) {
                handleUpdateSingleElement(selectedElement.id, updater);
              }
            }}
            onUpdateConfig={(updater) => {
              onChange(updater(effectiveConfig));
            }}
            onDuplicateSelected={handleDuplicateSelected}
            onDeleteSelected={handleDeleteSelected}
            onToggleLockSelected={() => {
              if (selectedElement) handleToggleLock(selectedElement.id);
            }}
            onToggleVisibilitySelected={() => {
              if (selectedElement) handleToggleVisibility(selectedElement.id);
            }}
            onMoveToContainer={handleMoveToContainer}
            onUploadAsset={onUploadAsset}
          />
        )}
      </div>

      {/* Preset Library Modal */}
      <PresetLibraryModal
        isOpen={isPresetModalOpen}
        gameType={gameType}
        onClose={() => setIsPresetModalOpen(false)}
        onApplyPreset={handleApplyPreset}
      />

      {/* Save Template Modal */}
      <SaveTemplateModal
        isOpen={isSaveModalOpen}
        gameType={gameType}
        elements={currentElements}
        onClose={() => setIsSaveModalOpen(false)}
      />
    </div>
  );
};
