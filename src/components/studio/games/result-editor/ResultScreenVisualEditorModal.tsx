import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  ResultScreenElement,
  ResultCardElement,
  ResultGroupElement,
  ResultTextElement,
  ResultImageElement,
  ResultScoreElement,
  ResultMovesElement,
  ResultPairsElement,
  ResultTimeElement,
  ResultAccuracyElement,
  ResultButtonElement,
  ResultScreenElementType,
  MemoryMatchResultScreenConfig,
} from '../../../../games/memory-match/types';
import { GameTheme } from '../../../../themes/types';
import {
  createDefaultElement,
  findElementAndParent,
  getAvailableContainers,
  isDescendantOf,
} from './types';
import {
  groupElements,
  ungroupElements,
  toggleElementsLock,
  reorderSiblingLayers,
} from './layerOperations';
import { LayerTreePanel } from './LayerTreePanel';
import { CanvasWorkspace } from './CanvasWorkspace';
import { PropertyInspectorPanel } from './PropertyInspectorPanel';
import { EditorTopBar } from './EditorTopBar';
import { PresetLibraryModal } from './PresetLibraryModal';
import { SaveTemplateModal } from './SaveTemplateModal';
import { useResultScreenHistory, filterValidSelectedIds } from './history';
import { Layers, Sliders, Layout } from 'lucide-react';

export interface ResultScreenVisualEditorModalProps {
  resultConfig: MemoryMatchResultScreenConfig;
  theme: Partial<GameTheme>;
  onChange: (updatedConfig: Partial<MemoryMatchResultScreenConfig>) => void;
  onUploadAsset?: (file: File, type: string) => Promise<string>;
  isOpen: boolean;
  onClose: () => void;
}

export const ResultScreenVisualEditorModal: React.FC<ResultScreenVisualEditorModalProps> = ({
  resultConfig,
  theme,
  onChange,
  onUploadAsset,
  isOpen,
  onClose,
}) => {
  const elements = resultConfig.elements || [];
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isLeftCollapsed, setIsLeftCollapsed] = useState(false);
  const [isRightCollapsed, setIsRightCollapsed] = useState(false);
  const [isPresetsModalOpen, setIsPresetsModalOpen] = useState(false);
  const [isSaveTemplateModalOpen, setIsSaveTemplateModalOpen] = useState(false);

  // Gesture tracking ref for batching continuous interactions (drag, resize, rotate)
  const isGestureActiveRef = React.useRef(false);

  // Mobile active tab ('layers' | 'canvas' | 'inspector')
  const [mobileActiveTab, setMobileActiveTab] = useState<'layers' | 'canvas' | 'inspector'>('canvas');

  const canvasWidth = resultConfig.canvas?.width || 1000;
  const canvasHeight = resultConfig.canvas?.height || 1000;

  // History Manager Hook
  const {
    canUndo,
    canRedo,
    undo,
    redo,
    recordChange,
    beginGesture,
    commitGesture,
    cancelGesture,
    resetHistory,
  } = useResultScreenHistory(elements, (newElements) => {
    onChange({
      elements: newElements,
    });
  });

  // Re-sync history baseline on modal open
  useEffect(() => {
    if (isOpen) {
      resetHistory(elements);
    }
  }, [isOpen]);

  // Handle undo with selection pruning
  const handleUndo = useCallback(() => {
    const restored = undo();
    if (restored) {
      setSelectedIds((prev) => filterValidSelectedIds(prev, restored));
    }
  }, [undo]);

  // Handle redo with selection pruning
  const handleRedo = useCallback(() => {
    const restored = redo();
    if (restored) {
      setSelectedIds((prev) => filterValidSelectedIds(prev, restored));
    }
  }, [redo]);

  // Sync update elements helper
  const updateElements = useCallback(
    (newElements: ResultScreenElement[]) => {
      if (isGestureActiveRef.current) {
        onChange({
          elements: newElements,
        });
      } else {
        recordChange(newElements);
      }
    },
    [onChange, recordChange]
  );

  // Gesture Start callback from CanvasWorkspace
  const handleGestureStart = useCallback(
    (currentElements: ResultScreenElement[]) => {
      isGestureActiveRef.current = true;
      beginGesture(currentElements);
    },
    [beginGesture]
  );

  // Gesture End callback from CanvasWorkspace
  const handleGestureEnd = useCallback(
    (finalElements: ResultScreenElement[]) => {
      isGestureActiveRef.current = false;
      commitGesture(finalElements);
    },
    [commitGesture]
  );

  // Mutate multiple elements at once (clean single tree pass)
  const updateMultipleElements = useCallback(
    (updates: Record<string, Partial<ResultScreenElement>>) => {
      const recursiveUpdate = (list: ResultScreenElement[]): ResultScreenElement[] => {
        return list.map((item) => {
          let updatedItem = item;
          if (updates[item.id]) {
            updatedItem = { ...item, ...updates[item.id] } as ResultScreenElement;
          }
          if (updatedItem.type === 'card' && (updatedItem as ResultCardElement).children) {
            return {
              ...updatedItem,
              children: recursiveUpdate((updatedItem as ResultCardElement).children || []),
            } as ResultCardElement;
          }
          if (updatedItem.type === 'group' && (updatedItem as ResultGroupElement).children) {
            return {
              ...updatedItem,
              children: recursiveUpdate((updatedItem as ResultGroupElement).children || []),
            } as ResultGroupElement;
          }
          return updatedItem;
        });
      };

      updateElements(recursiveUpdate(elements));
    },
    [elements, updateElements]
  );

  // Mutate a specific element
  const updateElementById = useCallback(
    (id: string, updater: (prev: ResultScreenElement) => ResultScreenElement) => {
      const recursiveUpdate = (list: ResultScreenElement[]): ResultScreenElement[] => {
        return list.map((item) => {
          if (item.id === id) {
            return updater(item);
          }
          if (item.type === 'card' && (item as ResultCardElement).children) {
            return {
              ...item,
              children: recursiveUpdate((item as ResultCardElement).children || []),
            } as ResultCardElement;
          }
          if (item.type === 'group' && (item as ResultGroupElement).children) {
            return {
              ...item,
              children: recursiveUpdate((item as ResultGroupElement).children || []),
            } as ResultGroupElement;
          }
          return item;
        });
      };

      updateElements(recursiveUpdate(elements));
    },
    [elements, updateElements]
  );

  // Selection toggle helper
  const handleSelectElement = useCallback(
    (id: string, e?: React.MouseEvent) => {
      const isToggle = e ? e.shiftKey || e.metaKey || e.ctrlKey : false;
      if (!isToggle) {
        setSelectedIds([id]);
        return;
      }

      const clickedInfo = findElementAndParent(id, elements);
      if (!clickedInfo) return;

      if (selectedIds.length === 0) {
        setSelectedIds([id]);
        return;
      }

      const firstSelectedInfo = findElementAndParent(selectedIds[0], elements);
      const firstParentId = firstSelectedInfo?.parent?.id || 'root';
      const clickedParentId = clickedInfo?.parent?.id || 'root';

      if (firstParentId !== clickedParentId) {
        setSelectedIds([id]);
        return;
      }

      if (selectedIds.includes(id)) {
        setSelectedIds(selectedIds.filter((item) => item !== id));
      } else {
        setSelectedIds([...selectedIds, id]);
      }
    },
    [elements, selectedIds]
  );

  // Selected items derivation
  const selectedItemsInfo = selectedIds
    .map((id) => findElementAndParent(id, elements))
    .filter(
      (res): res is { element: ResultScreenElement; parent: ResultCardElement | ResultGroupElement | null } =>
        res !== null
    );

  const selectedElements = selectedItemsInfo.map((info) => info.element);
  const commonParent = selectedItemsInfo.length > 0 ? selectedItemsInfo[0].parent : null;
  const selectedElement = selectedElements.length > 0 ? selectedElements[selectedElements.length - 1] : null;
  const selectedParentElement = selectedElement ? findElementAndParent(selectedElement.id, elements)?.parent || null : null;

  // Can Group calculation: >= 2 items selected and all have the exact same parent
  const canGroup = useMemo(() => {
    if (selectedIds.length < 2) return false;
    if (selectedItemsInfo.length !== selectedIds.length) return false;
    const firstParentId = selectedItemsInfo[0]?.parent?.id || 'root';
    return selectedItemsInfo.every((item) => (item.parent?.id || 'root') === firstParentId);
  }, [selectedIds, selectedItemsInfo]);

  // Can Ungroup calculation: selectedIds has at least one group element
  const canUngroup = useMemo(() => {
    if (selectedIds.length === 0) return false;
    return selectedElements.some((el) => el.type === 'group');
  }, [selectedIds, selectedElements]);

  // Is selection locked: true if all selected elements are locked
  const isSelectionLocked = useMemo(() => {
    if (selectedElements.length === 0) return false;
    return selectedElements.every((el) => el.locked);
  }, [selectedElements]);

  // Toggle Visibility
  const handleToggleVisibility = useCallback(
    (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      updateElementById(id, (prev) => ({
        ...prev,
        visible: prev.visible === false ? true : false,
      }));
    },
    [updateElementById]
  );

  // Toggle Lock for a single element
  const handleToggleLock = useCallback(
    (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      updateElementById(id, (prev) => ({
        ...prev,
        locked: !prev.locked,
      }));
    },
    [updateElementById]
  );

  // Toggle Lock for all currently selected elements
  const handleToggleLockSelected = useCallback(() => {
    if (selectedIds.length === 0) return;
    const nextLockedState = !isSelectionLocked;
    const newElements = toggleElementsLock(elements, selectedIds, nextLockedState);
    updateElements(newElements);
  }, [selectedIds, isSelectionLocked, elements, updateElements]);

  // Handle Grouping selected elements
  const handleGroup = useCallback(() => {
    if (!canGroup) return;
    const { updatedElements, newGroupId } = groupElements(elements, selectedIds);
    updateElements(updatedElements);
    if (newGroupId) {
      setSelectedIds([newGroupId]);
    }
  }, [canGroup, elements, selectedIds, updateElements]);

  // Handle Ungrouping selected elements
  const handleUngroup = useCallback(
    (targetIds?: string[]) => {
      const idsToUngroup = targetIds || selectedIds;
      const { updatedElements, unpackedIds } = ungroupElements(elements, idsToUngroup);
      updateElements(updatedElements);
      if (unpackedIds.length > 0) {
        setSelectedIds(unpackedIds);
      }
    },
    [elements, selectedIds, updateElements]
  );

  // Reorder layer stacking with normalized zIndex + sibling-only boundaries
  const handleMoveLayer = useCallback(
    (idOrIds: string | string[], direction: 'forward' | 'backward' | 'front' | 'back') => {
      const targetIds = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
      if (targetIds.length === 0) return;

      const newElements = reorderSiblingLayers(elements, targetIds, direction);
      updateElements(newElements);
    },
    [elements, updateElements]
  );

  // Add new root element
  const handleAddNewRootElement = useCallback(
    (type: ResultScreenElementType) => {
      const id = `${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const newEl = createDefaultElement(type, id);
      newEl.zIndex = elements.length + 1;
      updateElements([...elements, newEl]);
      setSelectedIds([id]);
    },
    [elements, updateElements]
  );

  // Add child element into container
  const handleAddChildElement = useCallback(
    (parentId: string, type: ResultScreenElementType) => {
      const id = `${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const newEl = createDefaultElement(type, id);

      const parentInfo = findElementAndParent(parentId, elements);
      const parentW = parentInfo ? parentInfo.element.width : 600;
      const parentH = parentInfo ? parentInfo.element.height : 600;

      newEl.x = Math.max(0, Math.round((parentW - newEl.width) / 2));
      newEl.y = Math.max(0, Math.round((parentH - newEl.height) / 2));

      const addChildToTree = (list: ResultScreenElement[]): ResultScreenElement[] => {
        return list.map((item) => {
          if (item.id === parentId) {
            const currentChildren =
              item.type === 'card'
                ? (item as ResultCardElement).children || []
                : item.type === 'group'
                ? (item as ResultGroupElement).children || []
                : [];
            newEl.zIndex = currentChildren.length + 1;
            return {
              ...item,
              children: [...currentChildren, newEl],
            } as ResultCardElement | ResultGroupElement;
          }
          if (item.type === 'card' && (item as ResultCardElement).children) {
            return {
              ...item,
              children: addChildToTree((item as ResultCardElement).children || []),
            } as ResultCardElement;
          }
          if (item.type === 'group' && (item as ResultGroupElement).children) {
            return {
              ...item,
              children: addChildToTree((item as ResultGroupElement).children || []),
            } as ResultGroupElement;
          }
          return item;
        });
      };

      updateElements(addChildToTree(elements));
      setSelectedIds([id]);
    },
    [elements, updateElements]
  );

  // Reparent element
  const handleReparentElement = useCallback(
    (elementId: string, newParentId: string) => {
      const found = findElementAndParent(elementId, elements);
      if (!found) return;
      const { element: elToMove } = found;

      const removeElement = (list: ResultScreenElement[]): ResultScreenElement[] => {
        return list
          .filter((item) => item.id !== elementId)
          .map((item) => {
            if (item.type === 'card' && (item as ResultCardElement).children) {
              return {
                ...item,
                children: removeElement((item as ResultCardElement).children || []),
              } as ResultCardElement;
            }
            if (item.type === 'group' && (item as ResultGroupElement).children) {
              return {
                ...item,
                children: removeElement((item as ResultGroupElement).children || []),
              } as ResultGroupElement;
            }
            return item;
          });
      };

      const cleanedElements = removeElement(elements);

      if (newParentId === 'root') {
        const updatedEl: ResultScreenElement = {
          ...elToMove,
          x: Math.max(0, Math.min(canvasWidth - elToMove.width, elToMove.x)),
          y: Math.max(0, Math.min(canvasHeight - elToMove.height, elToMove.y)),
          zIndex: cleanedElements.length + 1,
        };
        updateElements([...cleanedElements, updatedEl]);
        return;
      }

      const insertIntoParent = (list: ResultScreenElement[]): ResultScreenElement[] => {
        return list.map((item) => {
          if (item.id === newParentId && (item.type === 'card' || item.type === 'group')) {
            const currentChildren = (item as ResultCardElement | ResultGroupElement).children || [];
            const updatedEl: ResultScreenElement = {
              ...elToMove,
              x: Math.max(0, Math.min(item.width - elToMove.width, Math.round((item.width - elToMove.width) / 2))),
              y: Math.max(0, Math.min(item.height - elToMove.height, Math.round((item.height - elToMove.height) / 2))),
              zIndex: currentChildren.length + 1,
            };
            return {
              ...item,
              children: [...currentChildren, updatedEl],
            } as ResultCardElement | ResultGroupElement;
          }
          if (item.type === 'card' && (item as ResultCardElement).children) {
            return {
              ...item,
              children: insertIntoParent((item as ResultCardElement).children || []),
            } as ResultCardElement;
          }
          if (item.type === 'group' && (item as ResultGroupElement).children) {
            return {
              ...item,
              children: insertIntoParent((item as ResultGroupElement).children || []),
            } as ResultGroupElement;
          }
          return item;
        });
      };

      updateElements(insertIntoParent(cleanedElements));
    },
    [elements, updateElements, canvasWidth, canvasHeight]
  );

  // Duplicate single element
  const handleDuplicateElement = useCallback(
    (id: string) => {
      const found = findElementAndParent(id, elements);
      if (!found) return;
      const { element: original, parent } = found;

      const cloneItem = (item: ResultScreenElement, offset = 30): ResultScreenElement => {
        const newId = `${item.type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        const base = {
          ...item,
          id: newId,
          x: item.x + offset,
          y: item.y + offset,
        };
        if (item.type === 'card' && (item as ResultCardElement).children) {
          return {
            ...base,
            children: ((item as ResultCardElement).children || []).map((c) => cloneItem(c, 0)),
          } as ResultCardElement;
        }
        if (item.type === 'group' && (item as ResultGroupElement).children) {
          return {
            ...base,
            children: ((item as ResultGroupElement).children || []).map((c) => cloneItem(c, 0)),
          } as ResultGroupElement;
        }
        return base as ResultScreenElement;
      };

      const cloned = cloneItem(original);

      if (!parent) {
        cloned.zIndex = elements.length + 1;
        updateElements([...elements, cloned]);
      } else {
        const insertClone = (list: ResultScreenElement[]): ResultScreenElement[] => {
          return list.map((item) => {
            if (item.id === parent.id) {
              const currentChildren = (item as ResultCardElement | ResultGroupElement).children || [];
              cloned.zIndex = currentChildren.length + 1;
              return {
                ...item,
                children: [...currentChildren, cloned],
              } as ResultCardElement | ResultGroupElement;
            }
            if (item.type === 'card' && (item as ResultCardElement).children) {
              return {
                ...item,
                children: insertClone((item as ResultCardElement).children || []),
              } as ResultCardElement;
            }
            if (item.type === 'group' && (item as ResultGroupElement).children) {
              return {
                ...item,
                children: insertClone((item as ResultGroupElement).children || []),
              } as ResultGroupElement;
            }
            return item;
          });
        };
        updateElements(insertClone(elements));
      }

      setSelectedIds([cloned.id]);
    },
    [elements, updateElements]
  );

  // Duplicate all selected
  const handleDuplicateSelected = useCallback(() => {
    if (selectedIds.length === 0) return;
    const newIds: string[] = [];

    for (const id of selectedIds) {
      handleDuplicateElement(id);
    }
  }, [selectedIds, handleDuplicateElement]);

  // Delete single element
  const handleDeleteElement = useCallback(
    (id: string) => {
      const removeRecursive = (list: ResultScreenElement[]): ResultScreenElement[] => {
        return list
          .filter((item) => item.id !== id)
          .map((item) => {
            if (item.type === 'card' && (item as ResultCardElement).children) {
              return {
                ...item,
                children: removeRecursive((item as ResultCardElement).children || []),
              } as ResultCardElement;
            }
            if (item.type === 'group' && (item as ResultGroupElement).children) {
              return {
                ...item,
                children: removeRecursive((item as ResultGroupElement).children || []),
              } as ResultGroupElement;
            }
            return item;
          });
      };

      updateElements(removeRecursive(elements));
      setSelectedIds((prev) => prev.filter((item) => item !== id));
    },
    [elements, updateElements]
  );

  // Delete selected elements
  const handleDeleteSelected = useCallback(() => {
    if (selectedIds.length === 0) return;
    const idsToDelete = new Set(selectedIds);

    const removeRecursive = (list: ResultScreenElement[]): ResultScreenElement[] => {
      return list
        .filter((item) => !idsToDelete.has(item.id))
        .map((item) => {
          if (item.type === 'card' && (item as ResultCardElement).children) {
            return {
              ...item,
              children: removeRecursive((item as ResultCardElement).children || []),
            } as ResultCardElement;
          }
          if (item.type === 'group' && (item as ResultGroupElement).children) {
            return {
              ...item,
              children: removeRecursive((item as ResultGroupElement).children || []),
            } as ResultGroupElement;
          }
          return item;
        });
    };

    updateElements(removeRecursive(elements));
    setSelectedIds([]);
  }, [selectedIds, elements, updateElements]);

  // Reset to default layout
  const handleResetLayout = useCallback(() => {
    const defaultElements: ResultScreenElement[] = [
      {
        id: 'card-container-main',
        type: 'card',
        x: 180,
        y: 140,
        width: 640,
        height: 720,
        rotation: 0,
        visible: true,
        locked: false,
        opacity: 1,
        zIndex: 1,
        style: {
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          borderWidth: 1,
          borderColor: '#334155',
          borderRadius: 28,
          shadow: true,
        },
        children: [
          {
            id: 'res-title-victory',
            type: 'text',
            x: 20,
            y: 35,
            width: 600,
            height: 60,
            rotation: 0,
            visible: true,
            locked: false,
            opacity: 1,
            zIndex: 1,
            text: 'Victory!',
            style: {
              fontSize: 44,
              fontWeight: '900',
              color: '#fbbf24',
              textAlign: 'center',
              letterSpacing: 2,
            },
          } as ResultTextElement,
          {
            id: 'res-stat-score',
            type: 'score',
            x: 70,
            y: 115,
            width: 500,
            height: 120,
            rotation: 0,
            visible: true,
            locked: false,
            opacity: 1,
            zIndex: 2,
            label: 'FINAL SCORE',
            style: {
              labelColor: '#94a3b8',
              valueColor: '#fbbf24',
              backgroundColor: 'rgba(2, 6, 23, 0.85)',
              borderColor: '#334155',
              borderRadius: 20,
              fontSize: 40,
              textAlign: 'center',
              layout: 'vertical',
            },
          } as ResultScoreElement,
          {
            id: 'res-stat-moves',
            type: 'moves',
            x: 70,
            y: 255,
            width: 240,
            height: 90,
            rotation: 0,
            visible: true,
            locked: false,
            opacity: 1,
            zIndex: 3,
            label: 'MOVES',
            style: {
              labelColor: '#94a3b8',
              valueColor: '#38bdf8',
              backgroundColor: 'rgba(2, 6, 23, 0.85)',
              borderColor: '#334155',
              borderRadius: 16,
              fontSize: 26,
              textAlign: 'center',
              layout: 'vertical',
            },
          } as ResultMovesElement,
          {
            id: 'res-stat-pairs',
            type: 'pairs',
            x: 330,
            y: 255,
            width: 240,
            height: 90,
            rotation: 0,
            visible: true,
            locked: false,
            opacity: 1,
            zIndex: 4,
            label: 'PAIRS',
            style: {
              labelColor: '#94a3b8',
              valueColor: '#34d399',
              backgroundColor: 'rgba(2, 6, 23, 0.85)',
              borderColor: '#334155',
              borderRadius: 16,
              fontSize: 26,
              textAlign: 'center',
              layout: 'vertical',
            },
          } as ResultPairsElement,
          {
            id: 'res-stat-time',
            type: 'time',
            x: 70,
            y: 365,
            width: 240,
            height: 90,
            rotation: 0,
            visible: true,
            locked: false,
            opacity: 1,
            zIndex: 5,
            label: 'TIME',
            style: {
              labelColor: '#94a3b8',
              valueColor: '#38bdf8',
              backgroundColor: 'rgba(2, 6, 23, 0.85)',
              borderColor: '#334155',
              borderRadius: 16,
              fontSize: 26,
              textAlign: 'center',
              layout: 'vertical',
            },
          } as ResultTimeElement,
          {
            id: 'res-stat-accuracy',
            type: 'accuracy',
            x: 330,
            y: 365,
            width: 240,
            height: 90,
            rotation: 0,
            visible: true,
            locked: false,
            opacity: 1,
            zIndex: 6,
            label: 'ACCURACY',
            style: {
              labelColor: '#94a3b8',
              valueColor: '#c084fc',
              backgroundColor: 'rgba(2, 6, 23, 0.85)',
              borderColor: '#334155',
              borderRadius: 16,
              fontSize: 26,
              textAlign: 'center',
              layout: 'vertical',
            },
          } as ResultAccuracyElement,
          {
            id: 'res-btn-play-again',
            type: 'button',
            x: 70,
            y: 500,
            width: 500,
            height: 70,
            rotation: 0,
            visible: true,
            locked: false,
            opacity: 1,
            zIndex: 7,
            text: 'PLAY AGAIN',
            action: 'playAgain',
            style: {
              backgroundColor: '#f59e0b',
              textColor: '#020617',
              fontSize: 22,
              fontWeight: '900',
              borderRadius: 20,
              shadow: true,
            },
          } as ResultButtonElement,
        ],
      } as ResultCardElement,
    ];

    updateElements(defaultElements);
    setSelectedIds([]);
  }, [updateElements]);

  // Center selected horizontally
  const handleCenterSelectedHorizontal = useCallback(() => {
    if (selectedElements.length === 0) return;
    const containerW = commonParent ? commonParent.width : canvasWidth;

    if (selectedElements.length === 1) {
      const el = selectedElements[0];
      const newX = Math.max(0, Math.round((containerW - el.width) / 2));
      updateElementById(el.id, (prev) => ({ ...prev, x: newX }));
    } else {
      const minX = Math.min(...selectedElements.map((e) => e.x));
      const maxX = Math.max(...selectedElements.map((e) => e.x + e.width));
      const bboxW = maxX - minX;
      const targetMinX = Math.round((containerW - bboxW) / 2);
      const deltaX = targetMinX - minX;

      const updates: Record<string, Partial<ResultScreenElement>> = {};
      for (const el of selectedElements) {
        const newX = Math.max(0, Math.min(containerW - el.width, Math.round(el.x + deltaX)));
        updates[el.id] = { x: newX };
      }
      updateMultipleElements(updates);
    }
  }, [selectedElements, commonParent, canvasWidth, updateElementById, updateMultipleElements]);

  // Center selected vertically
  const handleCenterSelectedVertical = useCallback(() => {
    if (selectedElements.length === 0) return;
    const containerH = commonParent ? commonParent.height : canvasHeight;

    if (selectedElements.length === 1) {
      const el = selectedElements[0];
      const newY = Math.max(0, Math.round((containerH - el.height) / 2));
      updateElementById(el.id, (prev) => ({ ...prev, y: newY }));
    } else {
      const minY = Math.min(...selectedElements.map((e) => e.y));
      const maxY = Math.max(...selectedElements.map((e) => e.y + e.height));
      const bboxH = maxY - minY;
      const targetMinY = Math.round((containerH - bboxH) / 2);
      const deltaY = targetMinY - minY;

      const updates: Record<string, Partial<ResultScreenElement>> = {};
      for (const el of selectedElements) {
        const newY = Math.max(0, Math.min(containerH - el.height, Math.round(el.y + deltaY)));
        updates[el.id] = { y: newY };
      }
      updateMultipleElements(updates);
    }
  }, [selectedElements, commonParent, canvasHeight, updateElementById, updateMultipleElements]);

  // Global Keyboard shortcuts in modal
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName?.toLowerCase();
      const isEditingText =
        activeTag === 'input' ||
        activeTag === 'textarea' ||
        activeTag === 'select' ||
        (document.activeElement as HTMLElement)?.isContentEditable;

      if (isEditingText) return;

      // Undo / Redo Shortcuts (Ctrl+Z, Cmd+Z, Ctrl+Shift+Z, Cmd+Shift+Z, Ctrl+Y)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
        return;
      }

      // Duplicate Shortcut (Ctrl+D / Cmd+D)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') {
        if (selectedIds.length > 0) {
          e.preventDefault();
          handleDuplicateSelected();
          return;
        }
      }

      if (e.key === 'Escape') {
        if (selectedIds.length > 0) {
          e.preventDefault();
          setSelectedIds([]);
        } else {
          e.preventDefault();
          onClose();
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedIds.length > 0) {
          e.preventDefault();
          handleDeleteSelected();
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        if (e.shiftKey) {
          if (canUngroup) handleUngroup();
        } else {
          if (canGroup) handleGroup();
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        if (selectedIds.length > 0) {
          handleToggleLockSelected();
        }
      } else if ((e.metaKey || e.ctrlKey) && (e.key === ']' || e.key === '}')) {
        e.preventDefault();
        if (selectedIds.length > 0) {
          handleMoveLayer(selectedIds, e.shiftKey ? 'front' : 'forward');
        }
      } else if ((e.metaKey || e.ctrlKey) && (e.key === '[' || e.key === '{')) {
        e.preventDefault();
        if (selectedIds.length > 0) {
          handleMoveLayer(selectedIds, e.shiftKey ? 'back' : 'backward');
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        if (selectedElements.length > 0) {
          e.preventDefault();
          const step = e.shiftKey ? 10 : 1;
          const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
          const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;

          const parentW = commonParent ? commonParent.width : canvasWidth;
          const parentH = commonParent ? commonParent.height : canvasHeight;

          const updates: Record<string, Partial<ResultScreenElement>> = {};
          for (const el of selectedElements) {
            if (!el.locked) {
              const nextX = Math.max(0, Math.min(parentW - el.width, el.x + dx));
              const nextY = Math.max(0, Math.min(parentH - el.height, el.y + dy));
              updates[el.id] = { x: nextX, y: nextY };
            }
          }
          updateMultipleElements(updates);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isOpen,
    selectedIds,
    selectedElements,
    commonParent,
    canvasWidth,
    canvasHeight,
    canGroup,
    canUngroup,
    updateMultipleElements,
    handleDeleteSelected,
    handleDuplicateSelected,
    handleGroup,
    handleUngroup,
    handleToggleLockSelected,
    handleMoveLayer,
    handleUndo,
    handleRedo,
    onClose,
  ]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/98 text-slate-100 flex flex-col select-none overflow-hidden animate-in fade-in duration-200">
      {/* Top Navigation Bar */}
      <EditorTopBar
        selectedIds={selectedIds}
        totalElementsCount={elements.length}
        onAddNewRootElement={handleAddNewRootElement}
        onCenterSelectedHorizontal={handleCenterSelectedHorizontal}
        onCenterSelectedVertical={handleCenterSelectedVertical}
        onMoveSelectedLayer={(dir) => handleMoveLayer(selectedIds, dir)}
        onDuplicateSelected={handleDuplicateSelected}
        onDeleteSelected={handleDeleteSelected}
        onResetLayout={handleResetLayout}
        onOpenPresets={() => setIsPresetsModalOpen(true)}
        onSaveAsTemplate={() => setIsSaveTemplateModalOpen(true)}
        onClose={onClose}
        canGroup={canGroup}
        canUngroup={canUngroup}
        onGroupSelected={handleGroup}
        onUngroupSelected={() => handleUngroup()}
        onToggleLockSelected={handleToggleLockSelected}
        isSelectionLocked={isSelectionLocked}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={handleUndo}
        onRedo={handleRedo}
      />

      {/* Main 3-Column Workspace */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Column: Layers Panel (Desktop or Active Mobile Tab) */}
        <div
          className={`${
            mobileActiveTab === 'layers' ? 'flex w-full absolute inset-0 z-30' : 'hidden'
          } md:flex shrink-0`}
        >
          <LayerTreePanel
            elements={elements}
            selectedIds={selectedIds}
            onSelectElement={handleSelectElement}
            onToggleVisibility={handleToggleVisibility}
            onToggleLock={handleToggleLock}
            onMoveLayer={handleMoveLayer}
            onDuplicateElement={handleDuplicateElement}
            onDeleteElement={handleDeleteElement}
            onAddChildElement={handleAddChildElement}
            onAddNewRootElement={handleAddNewRootElement}
            onGroup={handleGroup}
            onUngroup={handleUngroup}
            canGroup={canGroup}
            canUngroup={canUngroup}
            onToggleLockSelected={handleToggleLockSelected}
            isSelectionLocked={isSelectionLocked}
            isCollapsed={isLeftCollapsed}
            onToggleCollapse={() => setIsLeftCollapsed(!isLeftCollapsed)}
            onOpenPresets={() => setIsPresetsModalOpen(true)}
          />
        </div>

        {/* Center Column: Interactive Canvas Workspace */}
        <div
          className={`${
            mobileActiveTab === 'canvas' ? 'flex flex-1 w-full h-full' : 'hidden'
          } md:flex flex-1 h-full overflow-hidden`}
        >
          <CanvasWorkspace
            resultConfig={resultConfig}
            theme={theme}
            elements={elements}
            selectedIds={selectedIds}
            onSelectElement={handleSelectElement}
            onClearSelection={() => setSelectedIds([])}
            onUpdateElements={updateMultipleElements}
            onUpdateSingleElement={updateElementById}
            findElementAndParent={findElementAndParent}
            onGestureStart={handleGestureStart}
            onGestureEnd={handleGestureEnd}
          />
        </div>

        {/* Right Column: Property Inspector Panel (Desktop or Active Mobile Tab) */}
        <div
          className={`${
            mobileActiveTab === 'inspector' ? 'flex w-full absolute inset-0 z-30' : 'hidden'
          } md:flex shrink-0`}
        >
          <PropertyInspectorPanel
            elements={elements}
            selectedIds={selectedIds}
            selectedElement={selectedElement}
            selectedParentElement={selectedParentElement}
            selectedElements={selectedElements}
            commonParent={commonParent}
            resultConfig={resultConfig}
            theme={theme}
            onSelectId={(id) => setSelectedIds(id ? [id] : [])}
            onSelectIds={setSelectedIds}
            onUpdateElementById={updateElementById}
            onUpdateMultipleElements={updateMultipleElements}
            onMoveLayer={handleMoveLayer}
            onReparentElement={handleReparentElement}
            onAddChildElement={handleAddChildElement}
            onAddNewRootElement={handleAddNewRootElement}
            onDuplicateElement={handleDuplicateElement}
            onDeleteElement={handleDeleteElement}
            onDuplicateSelected={handleDuplicateSelected}
            onDeleteSelected={handleDeleteSelected}
            onGroup={handleGroup}
            onUngroup={handleUngroup}
            canGroup={canGroup}
            canUngroup={canUngroup}
            onToggleLockSelected={handleToggleLockSelected}
            isSelectionLocked={isSelectionLocked}
            onUploadAsset={onUploadAsset}
            onUpdateConfig={onChange}
            isCollapsed={isRightCollapsed}
            onToggleCollapse={() => setIsRightCollapsed(!isRightCollapsed)}
          />
        </div>
      </div>

      {/* Mobile Responsive Bottom Tab Bar */}
      <div className="md:hidden h-12 bg-slate-950 border-t border-slate-800 flex items-center justify-around z-40 shrink-0">
        <button
          type="button"
          onClick={() => setMobileActiveTab('layers')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold ${
            mobileActiveTab === 'layers' ? 'bg-amber-500 text-slate-950' : 'text-slate-400'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Layers</span>
        </button>
        <button
          type="button"
          onClick={() => setMobileActiveTab('canvas')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold ${
            mobileActiveTab === 'canvas' ? 'bg-amber-500 text-slate-950' : 'text-slate-400'
          }`}
        >
          <Layout className="w-3.5 h-3.5" />
          <span>Canvas</span>
        </button>
        <button
          type="button"
          onClick={() => setMobileActiveTab('inspector')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold ${
            mobileActiveTab === 'inspector' ? 'bg-amber-500 text-slate-950' : 'text-slate-400'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>Properties</span>
        </button>
      </div>

      {/* Preset Library & Custom Templates Modal */}
      <PresetLibraryModal
        isOpen={isPresetsModalOpen}
        onClose={() => setIsPresetsModalOpen(false)}
        hasExistingElements={elements.length > 0}
        onOpenSaveTemplateModal={() => setIsSaveTemplateModalOpen(true)}
        onApplyPreset={(newElements) => {
          updateElements(newElements);
          setSelectedIds([]);
        }}
      />

      {/* Save Custom Template Modal */}
      <SaveTemplateModal
        isOpen={isSaveTemplateModalOpen}
        onClose={() => setIsSaveTemplateModalOpen(false)}
        elements={elements}
        onTemplateSaved={(savedTemplate) => {
          // Template saved into persistent storage
        }}
      />
    </div>
  );
};
