import React, { useState, useRef, useEffect, useCallback } from 'react';
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
  ResultLeaderboardElement,
  ResultLeaderboardStyle,
  ResultScreenElementType,
  MemoryMatchResultScreenConfig,
  generateDefaultResultScreenElements,
} from '../../../games/memory-match/types';
import {
  ResultElementContent,
  FONT_FAMILY_PRESETS,
} from '../../../games/memory-match/ResultElementContent';
import { GameTheme } from '../../../themes/types';
import { resolveScreenBackground } from '../../../themes/screenBackground';
import {
  Layers,
  Square,
  Image as ImageIcon,
  Type,
  Award,
  Trophy,
  Zap,
  Clock,
  Sparkles,
  MousePointerClick,
  FolderTree,
  Plus,
  Trash2,
  Copy,
  Eye,
  EyeOff,
  ChevronRight,
  ChevronDown,
  Move,
  RotateCcw,
  RotateCw,
  Sliders,
  CheckCircle2,
  Box,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Italic,
  Underline,
  Strikethrough,
  AlignCenterHorizontal,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignVerticalDistributeCenter,
  Upload,
  SlidersHorizontal,
  Palette,
  Loader2,
  RefreshCw,
  ArrowUp,
  ArrowDown,
  ChevronsUp,
  ChevronsDown,
  CornerDownRight,
  LogOut,
  FolderPlus,
  Grid,
  Maximize2,
  Magnet,
  Ruler,
  LayoutTemplate,
  BookmarkPlus,
  Undo2,
  Redo2,
} from 'lucide-react';
import { ResultScreenVisualEditorModal } from './result-editor/ResultScreenVisualEditorModal';
import {
  calculateSnap,
  calculateResizeSnap,
  AlignmentGuide,
  calculateMeasurements,
  SpacingMeasurement,
  GRID_SIZE_PRESETS,
  GridSizePreset,
  PresetLibraryModal,
  SaveTemplateModal,
  useResultScreenHistory,
  filterValidSelectedIds,
} from './result-editor';

export interface ResultScreenVisualEditorProps {
  resultConfig: MemoryMatchResultScreenConfig;
  theme: Partial<GameTheme>;
  onChange: (updatedConfig: Partial<MemoryMatchResultScreenConfig>) => void;
  onUploadAsset?: (file: File, type: string) => Promise<string>;
  onFullscreenChange?: (isFullscreen: boolean) => void;
}

export const ResultScreenVisualEditor: React.FC<ResultScreenVisualEditorProps> = ({
  resultConfig,
  theme,
  onChange,
  onUploadAsset,
  onFullscreenChange,
}) => {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Logical canvas dimensions (always 1000 x 1000)
  const canvasWidth = resultConfig.canvas?.width || 1000;
  const canvasHeight = resultConfig.canvas?.height || 1000;

  // Selected element IDs (supports multi-selection of sibling elements)
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPresetsModalOpen, setIsPresetsModalOpen] = useState(false);
  const [isSaveTemplateModalOpen, setIsSaveTemplateModalOpen] = useState(false);

  // Notify parent of fullscreen state changes
  useEffect(() => {
    onFullscreenChange?.(isModalOpen);
  }, [isModalOpen, onFullscreenChange]);
  const selectedId = selectedIds.length > 0 ? selectedIds[selectedIds.length - 1] : null;
  const setSelectedId = useCallback((id: string | null) => {
    setSelectedIds(id ? [id] : []);
  }, []);

  const [expandedCardIds, setExpandedCardIds] = useState<Record<string, boolean>>({});
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [activeChildAddContainerId, setActiveChildAddContainerId] = useState<string | null>(null);

  // Uploading state
  const [isUploadingAsset, setIsUploadingAsset] = useState(false);
  const [uploadTarget, setUploadTarget] = useState<{
    elementId: string;
    field: 'cardBg' | 'imageUrl';
  } | null>(null);

  // Direct manipulation interaction state
  type InteractionMode = 'idle' | 'drag' | 'resize' | 'rotate';
  type ResizeHandle = 'tl' | 'tr' | 'bl' | 'br' | 't' | 'b' | 'l' | 'r';

  const [interactionMode, setInteractionMode] = useState<InteractionMode>('idle');
  const [snapEnabled, setSnapEnabled] = useState<boolean>(true);
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [gridSize, setGridSize] = useState<GridSizePreset>(50);
  const [showMeasurements, setShowMeasurements] = useState<boolean>(true);
  const [isAltHeld, setIsAltHeld] = useState<boolean>(false);
  const [mouseLogicalCoords, setMouseLogicalCoords] = useState<{ x: number; y: number } | null>(null);
  const [activeGuides, setActiveGuides] = useState<{
    containerId: string | 'root';
    guides: AlignmentGuide[];
  } | null>(null);

  const interactionRef = useRef<{
    mode: InteractionMode;
    elementId: string;
    startX: number;
    startY: number;
    initialX: number;
    initialY: number;
    initialWidth: number;
    initialHeight: number;
    initialRotation: number;
    parentWidth: number;
    parentHeight: number;
    handle?: ResizeHandle;
    centerX?: number;
    centerY?: number;
    startAngle?: number;
    initialPositions?: Record<string, { x: number; y: number; width: number; height: number }>;
  } | null>(null);

  // Elements array guarantee
  const elements: ResultScreenElement[] =
    Array.isArray(resultConfig.elements) && resultConfig.elements.length > 0
      ? resultConfig.elements
      : generateDefaultResultScreenElements(resultConfig);

  const elementsRef = useRef<ResultScreenElement[]>(elements);
  elementsRef.current = elements;

  // Gesture tracking ref for batching continuous interactions (drag, resize, rotate)
  const isGestureActiveRef = useRef(false);

  // History Manager Hook
  const history = useResultScreenHistory(elements, (newElements) => {
    onChange({
      elements: newElements,
    });
  });

  const {
    canUndo,
    canRedo,
    undo,
    redo,
    recordChange,
    beginGesture,
    commitGesture,
  } = history;

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

  // Default element factory helper
  const createDefaultElement = (
    type: ResultScreenElementType,
    id: string
  ): ResultScreenElement => {
    switch (type) {
      case 'card':
        return {
          id,
          type: 'card',
          x: 200,
          y: 200,
          width: 600,
          height: 500,
          rotation: 0,
          visible: true,
          opacity: 1,
          zIndex: 1,
          style: {
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            borderWidth: 1,
            borderColor: '#334155',
            borderRadius: 24,
            shadow: true,
          },
          children: [],
        } as ResultCardElement;

      case 'image':
        return {
          id,
          type: 'image',
          x: 250,
          y: 250,
          width: 200,
          height: 200,
          rotation: 0,
          visible: true,
          opacity: 1,
          zIndex: 2,
          imageUrl: null,
          objectFit: 'contain',
        } as ResultImageElement;

      case 'text':
        return {
          id,
          type: 'text',
          x: 250,
          y: 250,
          width: 500,
          height: 60,
          rotation: 0,
          visible: true,
          opacity: 1,
          zIndex: 2,
          text: 'Victory!',
          style: {
            fontSize: 32,
            fontWeight: '900',
            color: '#ffffff',
            textAlign: 'center',
          },
        } as ResultTextElement;

      case 'score':
        return {
          id,
          type: 'score',
          x: 250,
          y: 250,
          width: 240,
          height: 100,
          rotation: 0,
          visible: true,
          opacity: 1,
          zIndex: 2,
          label: 'SCORE',
          style: {
            labelColor: '#94a3b8',
            valueColor: '#fbbf24',
            backgroundColor: 'rgba(2, 6, 23, 0.85)',
            borderColor: '#334155',
            borderRadius: 16,
            fontSize: 24,
            textAlign: 'center',
          },
        } as ResultScoreElement;

      case 'moves':
        return {
          id,
          type: 'moves',
          x: 250,
          y: 250,
          width: 240,
          height: 100,
          rotation: 0,
          visible: true,
          opacity: 1,
          zIndex: 2,
          label: 'MOVES',
          style: {
            labelColor: '#94a3b8',
            valueColor: '#67e8f9',
            backgroundColor: 'rgba(2, 6, 23, 0.85)',
            borderColor: '#334155',
            borderRadius: 16,
            fontSize: 24,
            textAlign: 'center',
          },
        } as ResultMovesElement;

      case 'pairs':
        return {
          id,
          type: 'pairs',
          x: 250,
          y: 250,
          width: 240,
          height: 100,
          rotation: 0,
          visible: true,
          opacity: 1,
          zIndex: 2,
          label: 'PAIRS',
          style: {
            labelColor: '#94a3b8',
            valueColor: '#34d399',
            backgroundColor: 'rgba(2, 6, 23, 0.85)',
            borderColor: '#334155',
            borderRadius: 16,
            fontSize: 24,
            textAlign: 'center',
          },
        } as ResultPairsElement;

      case 'time':
        return {
          id,
          type: 'time',
          x: 250,
          y: 250,
          width: 240,
          height: 100,
          rotation: 0,
          visible: true,
          opacity: 1,
          zIndex: 2,
          label: 'TIME',
          style: {
            labelColor: '#94a3b8',
            valueColor: '#38bdf8',
            backgroundColor: 'rgba(2, 6, 23, 0.85)',
            borderColor: '#334155',
            borderRadius: 16,
            fontSize: 24,
            textAlign: 'center',
          },
        } as ResultTimeElement;

      case 'accuracy':
        return {
          id,
          type: 'accuracy',
          x: 250,
          y: 250,
          width: 240,
          height: 100,
          rotation: 0,
          visible: true,
          opacity: 1,
          zIndex: 2,
          label: 'ACCURACY',
          style: {
            labelColor: '#94a3b8',
            valueColor: '#c084fc',
            backgroundColor: 'rgba(2, 6, 23, 0.85)',
            borderColor: '#334155',
            borderRadius: 16,
            fontSize: 24,
            textAlign: 'center',
          },
        } as ResultAccuracyElement;

      case 'button':
        return {
          id,
          type: 'button',
          x: 250,
          y: 700,
          width: 500,
          height: 70,
          rotation: 0,
          visible: true,
          opacity: 1,
          zIndex: 2,
          text: 'PLAY AGAIN',
          action: 'playAgain',
          style: {
            backgroundColor: '#f59e0b',
            textColor: '#020617',
            fontSize: 20,
            fontWeight: '900',
            borderRadius: 18,
            shadow: true,
          },
        } as ResultButtonElement;

      case 'leaderboard':
        return {
          id,
          type: 'leaderboard',
          x: 200,
          y: 200,
          width: 600,
          height: 400,
          rotation: 0,
          visible: true,
          opacity: 1,
          zIndex: 2,
          headerText: 'LEADERBOARD',
          showHeader: true,
          showRank: true,
          showPlayerName: true,
          showScore: true,
          showMoves: false,
          showTime: false,
          showAccuracy: false,
          maxRows: 5,
          style: {
            backgroundColor: 'rgba(15, 23, 42, 0.92)',
            borderColor: '#334155',
            borderWidth: 1,
            borderRadius: 20,
            padding: 12,
            shadow: true,
            fontSize: 16,
            textColor: '#f8fafc',
            rankColor: '#fbbf24',
            scoreColor: '#fbbf24',
            headerColor: '#fbbf24',
            rowSpacing: 6,
            highlightCurrentPlayer: true,
            highlightColor: 'rgba(245, 158, 11, 0.2)',
          },
        } as ResultLeaderboardElement;

      case 'group':
        return {
          id,
          type: 'group',
          x: 200,
          y: 200,
          width: 600,
          height: 600,
          rotation: 0,
          visible: true,
          opacity: 1,
          zIndex: 1,
          children: [],
        } as ResultGroupElement;

      default:
        return {
          id,
          type: 'text',
          x: 250,
          y: 250,
          width: 200,
          height: 50,
          rotation: 0,
          visible: true,
          opacity: 1,
          zIndex: 2,
          text: 'Element',
        } as ResultTextElement;
    }
  };

  // Find element by ID (including nested inside cards/groups)
  const findElementAndParent = useCallback(
    (
      id: string,
      list: ResultScreenElement[],
      parent: ResultCardElement | ResultGroupElement | null = null
    ): { element: ResultScreenElement; parent: ResultCardElement | ResultGroupElement | null } | null => {
      for (const el of list) {
        if (el.id === id) {
          return { element: el, parent };
        }
        if (el.type === 'card' && (el as ResultCardElement).children) {
          const res = findElementAndParent(id, (el as ResultCardElement).children || [], el as ResultCardElement);
          if (res) return res;
        }
        if (el.type === 'group' && (el as ResultGroupElement).children) {
          const res = findElementAndParent(id, (el as ResultGroupElement).children || [], el as ResultGroupElement);
          if (res) return res;
        }
      }
      return null;
    },
    []
  );

  // Get absolute canvas coordinates for any element ID (1000x1000 coordinate space)
  const getElementAbsolutePosition = useCallback(
    (id: string, list: ResultScreenElement[]): { x: number; y: number } | null => {
      const findAbs = (
        searchId: string,
        currentList: ResultScreenElement[],
        accumX = 0,
        accumY = 0
      ): { x: number; y: number } | null => {
        for (const el of currentList) {
          if (el.id === searchId) {
            return { x: accumX + el.x, y: accumY + el.y };
          }
          if (el.type === 'card' && (el as ResultCardElement).children) {
            const res = findAbs(searchId, (el as ResultCardElement).children || [], accumX + el.x, accumY + el.y);
            if (res) return res;
          }
          if (el.type === 'group' && (el as ResultGroupElement).children) {
            const res = findAbs(searchId, (el as ResultGroupElement).children || [], accumX + el.x, accumY + el.y);
            if (res) return res;
          }
        }
        return null;
      };
      return findAbs(id, list);
    },
    []
  );

  // Check if an element is a descendant of a specific parent (prevents cyclical parenting)
  const isDescendantOf = useCallback(
    (candidateDescendantId: string, ancestorId: string, list: ResultScreenElement[]): boolean => {
      const ancestor = findElementAndParent(ancestorId, list)?.element;
      if (!ancestor) return false;
      const checkChildren = (el: ResultScreenElement): boolean => {
        const children =
          el.type === 'card'
            ? (el as ResultCardElement).children
            : el.type === 'group'
            ? (el as ResultGroupElement).children
            : undefined;
        if (!children) return false;
        for (const child of children) {
          if (child.id === candidateDescendantId) return true;
          if (checkChildren(child)) return true;
        }
        return false;
      };
      return checkChildren(ancestor);
    },
    [findElementAndParent]
  );

  // Get all container candidates (excluding the element itself and its descendants)
  const getAvailableContainers = useCallback(
    (elementIdToMove: string, list: ResultScreenElement[]) => {
      const containers: Array<{
        id: string;
        label: string;
        type: 'card' | 'group';
        element: ResultCardElement | ResultGroupElement;
      }> = [];
      const traverse = (items: ResultScreenElement[], prefix = '') => {
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item.type === 'card' || item.type === 'group') {
            if (item.id !== elementIdToMove && !isDescendantOf(item.id, elementIdToMove, list)) {
              const label =
                item.type === 'card'
                  ? `${prefix}Card (${item.id.slice(0, 8)})`
                  : `${prefix}Group (${item.id.slice(0, 8)})`;
              containers.push({
                id: item.id,
                label,
                type: item.type,
                element: item as ResultCardElement | ResultGroupElement,
              });
              const children = (item as ResultCardElement | ResultGroupElement).children || [];
              traverse(children, `${prefix}  `);
            }
          }
        }
      };
      traverse(list);
      return containers;
    },
    [isDescendantOf]
  );

  // Selected elements derivation
  const selectedItemsInfo = selectedIds
    .map((id) => findElementAndParent(id, elements))
    .filter(
      (res): res is { element: ResultScreenElement; parent: ResultCardElement | ResultGroupElement | null } =>
        res !== null
    );

  const selectedElements = selectedItemsInfo.map((info) => info.element);
  const commonParent = selectedItemsInfo.length > 0 ? selectedItemsInfo[0].parent : null;

  const selectedResult = selectedId ? findElementAndParent(selectedId, elements) : null;
  const selectedElement = selectedResult?.element || null;
  const selectedParentElement = selectedResult?.parent || null;

  // Selection toggle helper (preserves sibling constraint for multi-selection)
  const handleSelectElement = (
    id: string,
    e?: React.MouseEvent,
    elementsList: ResultScreenElement[] = elements
  ) => {
    const isToggle = e ? e.shiftKey || e.metaKey || e.ctrlKey : false;
    if (!isToggle) {
      setSelectedIds([id]);
      return;
    }

    const clickedInfo = findElementAndParent(id, elementsList);
    if (!clickedInfo) return;

    if (selectedIds.length === 0) {
      setSelectedIds([id]);
      return;
    }

    // Sibling constraint: multi-selection is allowed only among elements sharing the same container
    const firstSelectedInfo = findElementAndParent(selectedIds[0], elementsList);
    const firstParentId = firstSelectedInfo?.parent?.id || 'root';
    const clickedParentId = clickedInfo?.parent?.id || 'root';

    if (firstParentId !== clickedParentId) {
      setSelectedIds([id]);
      return;
    }

    if (selectedIds.includes(id)) {
      const next = selectedIds.filter((item) => item !== id);
      setSelectedIds(next);
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  // Update elements helper
  const updateElements = (newElements: ResultScreenElement[]) => {
    if (isGestureActiveRef.current) {
      onChange({
        elements: newElements,
      });
    } else {
      recordChange(newElements);
    }
  };

  // Mutate multiple elements at once (clean single tree pass)
  const updateMultipleElements = (
    updates: Record<string, Partial<ResultScreenElement>>
  ) => {
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
  };

  // Mutate a specific element
  const updateElementById = (
    id: string,
    updater: (prev: ResultScreenElement) => ResultScreenElement
  ) => {
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
  };

  // Reparent element with accurate coordinate conversion (maintains exact visual position on canvas)
  const handleReparentElement = (elementId: string, targetContainerId: string | 'root') => {
    const found = findElementAndParent(elementId, elements);
    if (!found) return;

    const currentElement = found.element;
    const currentParent = found.parent;

    // If already at target, do nothing
    if (targetContainerId === 'root' && !currentParent) return;
    if (currentParent && currentParent.id === targetContainerId) return;

    // Calculate current absolute position on 1000x1000 canvas
    const currentAbsPos = getElementAbsolutePosition(elementId, elements);
    if (!currentAbsPos) return;

    let newLocalX = currentAbsPos.x;
    let newLocalY = currentAbsPos.y;

    // If moving into another container, subtract the target container's absolute position
    if (targetContainerId !== 'root') {
      const targetAbsPos = getElementAbsolutePosition(targetContainerId, elements);
      if (!targetAbsPos) return;
      newLocalX = currentAbsPos.x - targetAbsPos.x;
      newLocalY = currentAbsPos.y - targetAbsPos.y;
    }

    // Create the updated element with new local coordinates
    const updatedElement: ResultScreenElement = {
      ...currentElement,
      x: Math.round(newLocalX),
      y: Math.round(newLocalY),
    };

    // Step 1: Remove from old location
    const removeRecursive = (list: ResultScreenElement[]): ResultScreenElement[] => {
      return list
        .filter((item) => item.id !== elementId)
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

    const listWithoutElement = removeRecursive(elements);

    // Step 2: Insert into new target location
    if (targetContainerId === 'root') {
      const nextRoot = [...listWithoutElement, updatedElement].map((el, idx) => ({
        ...el,
        zIndex: idx + 1,
      }));
      updateElements(nextRoot);
    } else {
      const insertRecursive = (list: ResultScreenElement[]): ResultScreenElement[] => {
        return list.map((item) => {
          if (item.id === targetContainerId) {
            const children = (item as ResultCardElement | ResultGroupElement).children || [];
            const nextChildren = [...children, updatedElement].map((c, idx) => ({
              ...c,
              zIndex: idx + 1,
            }));
            return {
              ...item,
              children: nextChildren,
            } as ResultCardElement | ResultGroupElement;
          }
          if (item.type === 'card' && (item as ResultCardElement).children) {
            return {
              ...item,
              children: insertRecursive((item as ResultCardElement).children || []),
            } as ResultCardElement;
          }
          if (item.type === 'group' && (item as ResultGroupElement).children) {
            return {
              ...item,
              children: insertRecursive((item as ResultGroupElement).children || []),
            } as ResultGroupElement;
          }
          return item;
        });
      };
      updateElements(insertRecursive(listWithoutElement));
      // Ensure target container is expanded in the tree
      setExpandedCardIds((prev) => ({ ...prev, [targetContainerId]: true }));
    }

    setSelectedId(elementId);
  };

  // Add Child Element into a specific container
  const handleAddChildElement = (parentId: string, type: ResultScreenElementType) => {
    const found = findElementAndParent(parentId, elements);
    if (!found) return;
    const parentContainer = found.element as ResultCardElement | ResultGroupElement;

    const newId = `${type}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`;
    const newChild = createDefaultElement(type, newId);

    // Center placement inside parent container
    newChild.x = Math.max(0, Math.floor((parentContainer.width - newChild.width) / 2));
    newChild.y = Math.max(0, Math.floor((parentContainer.height - newChild.height) / 2));

    updateElementById(parentId, (prev) => {
      const currentChildren = (prev as ResultCardElement | ResultGroupElement).children || [];
      const nextChildren = [...currentChildren, newChild].map((c, idx) => ({
        ...c,
        zIndex: idx + 1,
      }));
      return {
        ...prev,
        children: nextChildren,
      };
    });

    setExpandedCardIds((prev) => ({ ...prev, [parentId]: true }));
    setSelectedId(newId);
  };

  // Add Element (Root or into currently selected container)
  const handleAddElement = (type: ResultScreenElementType) => {
    const newId = `${type}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`;
    const newElement = createDefaultElement(type, newId);

    // If a card or group is selected and user isn't adding a card, add as child
    if (selectedElement && (selectedElement.type === 'card' || selectedElement.type === 'group') && type !== 'card') {
      const parentEl = selectedElement as ResultCardElement | ResultGroupElement;
      newElement.x = Math.max(0, Math.floor((parentEl.width - newElement.width) / 2));
      newElement.y = Math.max(0, Math.floor((parentEl.height - newElement.height) / 2));

      updateElementById(parentEl.id, (prev) => {
        const currentChildren = (prev as ResultCardElement | ResultGroupElement).children || [];
        const nextChildren = [...currentChildren, newElement].map((c, idx) => ({
          ...c,
          zIndex: idx + 1,
        }));
        return {
          ...prev,
          children: nextChildren,
        };
      });
      setExpandedCardIds((prev) => ({ ...prev, [parentEl.id]: true }));
    } else {
      // Add at root level
      const nextElements = [...elements, newElement].map((el, idx) => ({
        ...el,
        zIndex: idx + 1,
      }));
      updateElements(nextElements);
    }

    setSelectedId(newId);
    setAddMenuOpen(false);
  };

  // Delete Element (Removes container and its entire subtree cleanly)
  const handleDeleteElement = (id: string) => {
    const recursiveDelete = (list: ResultScreenElement[]): ResultScreenElement[] => {
      const filtered = list.filter((item) => item.id !== id);
      return filtered.map((item, idx) => {
        const withZ = { ...item, zIndex: idx + 1 };
        if (withZ.type === 'card' && (withZ as ResultCardElement).children) {
          return {
            ...withZ,
            children: recursiveDelete((withZ as ResultCardElement).children || []),
          } as ResultCardElement;
        }
        if (withZ.type === 'group' && (withZ as ResultGroupElement).children) {
          return {
            ...withZ,
            children: recursiveDelete((withZ as ResultGroupElement).children || []),
          } as ResultGroupElement;
        }
        return withZ;
      });
    };

    updateElements(recursiveDelete(elements));
    setSelectedIds((prev) => prev.filter((item) => item !== id && !isDescendantOf(item, id, elements)));
  };

  // Delete all currently selected elements
  const handleDeleteSelected = () => {
    if (selectedIds.length === 0) return;
    const idsToDelete = new Set(selectedIds);

    const recursiveDelete = (list: ResultScreenElement[]): ResultScreenElement[] => {
      const filtered = list.filter((item) => !idsToDelete.has(item.id));
      return filtered.map((item, idx) => {
        const withZ = { ...item, zIndex: idx + 1 };
        if (withZ.type === 'card' && (withZ as ResultCardElement).children) {
          return {
            ...withZ,
            children: recursiveDelete((withZ as ResultCardElement).children || []),
          } as ResultCardElement;
        }
        if (withZ.type === 'group' && (withZ as ResultGroupElement).children) {
          return {
            ...withZ,
            children: recursiveDelete((withZ as ResultGroupElement).children || []),
          } as ResultGroupElement;
        }
        return withZ;
      });
    };

    updateElements(recursiveDelete(elements));
    setSelectedIds([]);
  };

  // Deep Duplicate Element (Duplicating a Card duplicates its entire child subtree with unique IDs)
  const handleDuplicateElement = (id: string) => {
    const found = findElementAndParent(id, elements);
    if (!found) return;

    const duplicateDeep = (el: ResultScreenElement): ResultScreenElement => {
      const clonedId = `${el.type}-${Date.now().toString(36)}-${Math.floor(Math.random() * 10000)}`;
      const cloned: any = {
        ...el,
        id: clonedId,
        style: (el as any).style ? { ...(el as any).style } : undefined,
      };

      if (el.type === 'card' && (el as ResultCardElement).children) {
        cloned.children = (el as ResultCardElement).children?.map(duplicateDeep);
      }
      if (el.type === 'group' && (el as ResultGroupElement).children) {
        cloned.children = (el as ResultGroupElement).children?.map(duplicateDeep);
      }

      return cloned;
    };

    const duplicated = duplicateDeep(found.element);
    const parentW = found.parent ? found.parent.width : canvasWidth;
    const parentH = found.parent ? found.parent.height : canvasHeight;
    duplicated.x = Math.min(found.element.x + 30, Math.max(0, parentW - duplicated.width));
    duplicated.y = Math.min(found.element.y + 30, Math.max(0, parentH - duplicated.height));

    if (found.parent) {
      updateElementById(found.parent.id, (prev) => {
        const currentChildren = (prev as ResultCardElement | ResultGroupElement).children || [];
        const originalIdx = currentChildren.findIndex((c) => c.id === id);
        const insertIdx = originalIdx !== -1 ? originalIdx + 1 : currentChildren.length;
        const newChildren = [...currentChildren];
        newChildren.splice(insertIdx, 0, duplicated);
        const normalizedChildren = newChildren.map((c, idx) => ({ ...c, zIndex: idx + 1 }));
        return {
          ...prev,
          children: normalizedChildren,
        };
      });
    } else {
      const originalIdx = elements.findIndex((el) => el.id === id);
      const insertIdx = originalIdx !== -1 ? originalIdx + 1 : elements.length;
      const newElements = [...elements];
      newElements.splice(insertIdx, 0, duplicated);
      const normalizedElements = newElements.map((el, idx) => ({ ...el, zIndex: idx + 1 }));
      updateElements(normalizedElements);
    }

    setSelectedIds([duplicated.id]);
  };

  // Duplicate all currently selected elements
  const handleDuplicateSelected = () => {
    if (selectedElements.length === 0) return;

    const duplicateDeep = (el: ResultScreenElement): ResultScreenElement => {
      const clonedId = `${el.type}-${Date.now().toString(36)}-${Math.floor(Math.random() * 10000)}`;
      const cloned: any = {
        ...el,
        id: clonedId,
        style: (el as any).style ? { ...(el as any).style } : undefined,
      };
      if (el.type === 'card' && (el as ResultCardElement).children) {
        cloned.children = (el as ResultCardElement).children?.map(duplicateDeep);
      }
      if (el.type === 'group' && (el as ResultGroupElement).children) {
        cloned.children = (el as ResultGroupElement).children?.map(duplicateDeep);
      }
      return cloned;
    };

    const newSelectedIds: string[] = [];
    const parentContainerW = commonParent ? commonParent.width : canvasWidth;
    const parentContainerH = commonParent ? commonParent.height : canvasHeight;

    if (commonParent) {
      const currentChildren = [...(commonParent.children || [])];
      selectedElements.forEach((el) => {
        const dup = duplicateDeep(el);
        dup.x = Math.min(el.x + 30, Math.max(0, parentContainerW - dup.width));
        dup.y = Math.min(el.y + 30, Math.max(0, parentContainerH - dup.height));
        const originalIdx = currentChildren.findIndex((c) => c.id === el.id);
        const insertIdx = originalIdx !== -1 ? originalIdx + 1 : currentChildren.length;
        currentChildren.splice(insertIdx, 0, dup);
        newSelectedIds.push(dup.id);
      });
      const normalizedChildren = currentChildren.map((c, idx) => ({ ...c, zIndex: idx + 1 }));
      updateElementById(commonParent.id, (prev) => ({
        ...prev,
        children: normalizedChildren,
      }));
    } else {
      const currentElements = [...elements];
      selectedElements.forEach((el) => {
        const dup = duplicateDeep(el);
        dup.x = Math.min(el.x + 30, Math.max(0, parentContainerW - dup.width));
        dup.y = Math.min(el.y + 30, Math.max(0, parentContainerH - dup.height));
        const originalIdx = currentElements.findIndex((c) => c.id === el.id);
        const insertIdx = originalIdx !== -1 ? originalIdx + 1 : currentElements.length;
        currentElements.splice(insertIdx, 0, dup);
        newSelectedIds.push(dup.id);
      });
      const normalizedElements = currentElements.map((el, idx) => ({ ...el, zIndex: idx + 1 }));
      updateElements(normalizedElements);
    }

    setSelectedIds(newSelectedIds);
  };

  // Move Layer Ordering: Single Source of Truth with Sibling Scoping
  // Supports 'forward' | 'backward' | 'front' | 'back' | 'up' | 'down'
  const handleMoveLayer = (
    target: string | string[],
    direction: 'forward' | 'backward' | 'front' | 'back' | 'up' | 'down'
  ) => {
    const targetIds = Array.isArray(target) ? target : [target];
    if (targetIds.length === 0) return;

    const isForward = direction === 'forward' || direction === 'up';
    const isBackward = direction === 'backward' || direction === 'down';
    const isFront = direction === 'front';
    const isBack = direction === 'back';

    const reorderSiblings = (list: ResultScreenElement[]): ResultScreenElement[] => {
      const hasTarget = list.some((item) => targetIds.includes(item.id));

      if (hasTarget) {
        let newList = [...list];

        if (isForward) {
          // Bring Forward: move towards higher index (front)
          for (let i = newList.length - 2; i >= 0; i--) {
            if (targetIds.includes(newList[i].id) && !targetIds.includes(newList[i + 1].id)) {
              const temp = newList[i];
              newList[i] = newList[i + 1];
              newList[i + 1] = temp;
            }
          }
        } else if (isBackward) {
          // Send Backward: move towards lower index (back)
          for (let i = 1; i < newList.length; i++) {
            if (targetIds.includes(newList[i].id) && !targetIds.includes(newList[i - 1].id)) {
              const temp = newList[i];
              newList[i] = newList[i - 1];
              newList[i - 1] = temp;
            }
          }
        } else if (isFront) {
          // Bring To Front: move targets to the end of list
          const nonTargets = newList.filter((item) => !targetIds.includes(item.id));
          const targets = newList.filter((item) => targetIds.includes(item.id));
          newList = [...nonTargets, ...targets];
        } else if (isBack) {
          // Send To Back: move targets to the start of list
          const nonTargets = newList.filter((item) => !targetIds.includes(item.id));
          const targets = newList.filter((item) => targetIds.includes(item.id));
          newList = [...targets, ...nonTargets];
        }

        // Normalize zIndex strictly to 1, 2, 3... to maintain single source of truth
        const normalized = newList.map((item, idx) => ({
          ...item,
          zIndex: idx + 1,
        }));

        // Traverse children of any container in this list
        return normalized.map((item) => {
          if (item.type === 'card' && (item as ResultCardElement).children) {
            return {
              ...item,
              children: reorderSiblings((item as ResultCardElement).children || []),
            } as ResultCardElement;
          }
          if (item.type === 'group' && (item as ResultGroupElement).children) {
            return {
              ...item,
              children: reorderSiblings((item as ResultGroupElement).children || []),
            } as ResultGroupElement;
          }
          return item;
        });
      }

      // Check nested children if targets were not in this level
      return list.map((item) => {
        if (item.type === 'card' && (item as ResultCardElement).children) {
          return {
            ...item,
            children: reorderSiblings((item as ResultCardElement).children || []),
          } as ResultCardElement;
        }
        if (item.type === 'group' && (item as ResultGroupElement).children) {
          return {
            ...item,
            children: reorderSiblings((item as ResultGroupElement).children || []),
          } as ResultGroupElement;
        }
        return item;
      });
    };

    updateElements(reorderSiblings(elements));
  };

  // Direct Z-Index value modification: updates stacking and normalizes sibling order
  const handleUpdateZIndex = (id: string, newZIndex: number) => {
    const updateZInList = (list: ResultScreenElement[]): ResultScreenElement[] => {
      const targetIndex = list.findIndex((item) => item.id === id);
      if (targetIndex !== -1) {
        // Update element with requested zIndex
        const updatedList = list.map((item) =>
          item.id === id ? { ...item, zIndex: Number(newZIndex) || 1 } : item
        );
        // Stable sort siblings by zIndex (ties preserve current relative order)
        const sortedList = [...updatedList].sort((a, b) => (a.zIndex ?? 1) - (b.zIndex ?? 1));
        // Normalize sequential zIndex
        return sortedList.map((item, idx) => ({
          ...item,
          zIndex: idx + 1,
        }));
      }

      return list.map((item) => {
        if (item.type === 'card' && (item as ResultCardElement).children) {
          return {
            ...item,
            children: updateZInList((item as ResultCardElement).children || []),
          } as ResultCardElement;
        }
        if (item.type === 'group' && (item as ResultGroupElement).children) {
          return {
            ...item,
            children: updateZInList((item as ResultGroupElement).children || []),
          } as ResultGroupElement;
        }
        return item;
      });
    };

    updateElements(updateZInList(elements));
  };

  // Toggle Visibility
  const handleToggleVisibility = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    updateElementById(id, (prev) => ({
      ...prev,
      visible: prev.visible === false ? true : false,
    }));
  };

  // Direct Manipulation Handlers: Drag, Resize, and Rotate
  const handleMouseDown = (
    e: React.MouseEvent,
    el: ResultScreenElement,
    parentWidth: number,
    parentHeight: number
  ) => {
    e.stopPropagation();

    let currentSelectedIds = selectedIds;
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      handleSelectElement(el.id, e);
      currentSelectedIds = selectedIds.includes(el.id)
        ? selectedIds.filter((id) => id !== el.id)
        : [...selectedIds, el.id];
    } else {
      if (!selectedIds.includes(el.id)) {
        setSelectedIds([el.id]);
        currentSelectedIds = [el.id];
      }
    }

    // Capture initial positions for multi-drag
    const initialPositions: Record<string, { x: number; y: number; width: number; height: number }> = {};
    for (const id of currentSelectedIds) {
      const found = findElementAndParent(id, elements);
      if (found) {
        initialPositions[id] = {
          x: found.element.x,
          y: found.element.y,
          width: found.element.width,
          height: found.element.height,
        };
      }
    }
    if (!initialPositions[el.id]) {
      initialPositions[el.id] = {
        x: el.x,
        y: el.y,
        width: el.width,
        height: el.height,
      };
    }

    setInteractionMode('drag');
    isGestureActiveRef.current = true;
    beginGesture(elements);
    interactionRef.current = {
      mode: 'drag',
      elementId: el.id,
      startX: e.clientX,
      startY: e.clientY,
      initialX: el.x,
      initialY: el.y,
      initialWidth: el.width,
      initialHeight: el.height,
      initialRotation: el.rotation || 0,
      parentWidth,
      parentHeight,
      initialPositions,
    };
  };

  const handleResizeMouseDown = (
    e: React.MouseEvent,
    el: ResultScreenElement,
    parentWidth: number,
    parentHeight: number,
    handle: ResizeHandle
  ) => {
    e.stopPropagation();
    setSelectedIds([el.id]);

    setInteractionMode('resize');
    isGestureActiveRef.current = true;
    beginGesture(elements);
    interactionRef.current = {
      mode: 'resize',
      elementId: el.id,
      handle,
      startX: e.clientX,
      startY: e.clientY,
      initialX: el.x,
      initialY: el.y,
      initialWidth: el.width,
      initialHeight: el.height,
      initialRotation: el.rotation || 0,
      parentWidth,
      parentHeight,
    };
  };

  const handleRotateMouseDown = (
    e: React.MouseEvent,
    el: ResultScreenElement,
    parentWidth: number,
    parentHeight: number
  ) => {
    e.stopPropagation();
    setSelectedIds([el.id]);

    const elDom = document.getElementById(`canvas-el-${el.id}`);
    let centerX = e.clientX;
    let centerY = e.clientY;
    if (elDom) {
      const rect = elDom.getBoundingClientRect();
      centerX = rect.left + rect.width / 2;
      centerY = rect.top + rect.height / 2;
    }

    const startAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);

    setInteractionMode('rotate');
    isGestureActiveRef.current = true;
    beginGesture(elements);
    interactionRef.current = {
      mode: 'rotate',
      elementId: el.id,
      startX: e.clientX,
      startY: e.clientY,
      initialX: el.x,
      initialY: el.y,
      initialWidth: el.width,
      initialHeight: el.height,
      initialRotation: el.rotation || 0,
      parentWidth,
      parentHeight,
      centerX,
      centerY,
      startAngle,
    };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (interactionMode === 'idle' || !interactionRef.current || !canvasRef.current) return;

      const {
        mode,
        elementId,
        handle,
        startX,
        startY,
        initialX,
        initialY,
        initialWidth,
        initialHeight,
        initialRotation,
        parentWidth,
        parentHeight,
        centerX,
        centerY,
        startAngle,
        initialPositions,
      } = interactionRef.current;

      const canvasRect = canvasRef.current.getBoundingClientRect();
      if (!canvasRect || canvasRect.width === 0 || canvasRect.height === 0) return;

      const scaleFactorX = canvasWidth / canvasRect.width;
      const scaleFactorY = canvasHeight / canvasRect.height;

      const deltaScreenX = e.clientX - startX;
      const deltaScreenY = e.clientY - startY;

      const deltaLogicalX = deltaScreenX * scaleFactorX;
      const deltaLogicalY = deltaScreenY * scaleFactorY;

      if (mode === 'drag') {
        const positions: Record<string, { x: number; y: number; width: number; height: number }> =
          initialPositions || {
            [elementId]: { x: initialX, y: initialY, width: initialWidth, height: initialHeight },
          };

        const targetInfo = findElementAndParent(elementId, elements);
        const parentElement = targetInfo?.parent;
        const isRoot = !parentElement;
        const containerId = parentElement ? parentElement.id : 'root';
        const siblings = parentElement ? parentElement.children || [] : elements;

        let effectiveDeltaX = deltaLogicalX;
        let effectiveDeltaY = deltaLogicalY;

        if (snapEnabled && !e.altKey) {
          const proposedBox = {
            x: initialX + deltaLogicalX,
            y: initialY + deltaLogicalY,
            width: initialWidth,
            height: initialHeight,
          };

          const snapResult = calculateSnap(
            proposedBox,
            parentWidth,
            parentHeight,
            siblings,
            Object.keys(positions),
            8,
            isRoot
          );

          effectiveDeltaX = snapResult.x - initialX;
          effectiveDeltaY = snapResult.y - initialY;

          if (snapResult.guides.length > 0) {
            setActiveGuides({
              containerId,
              guides: snapResult.guides,
            });
          } else {
            setActiveGuides(null);
          }
        } else {
          setActiveGuides(null);
        }

        const updates: Record<string, Partial<ResultScreenElement>> = {};
        for (const [id, pos] of Object.entries(positions)) {
          const nextX = Math.round(pos.x + effectiveDeltaX);
          const nextY = Math.round(pos.y + effectiveDeltaY);
          const clampedX = Math.max(0, Math.min(parentWidth - pos.width, nextX));
          const clampedY = Math.max(0, Math.min(parentHeight - pos.height, nextY));
          updates[id] = { x: clampedX, y: clampedY };
        }

        updateMultipleElements(updates);
      } else if (mode === 'resize' && handle) {
        // Project screen delta to element's local unrotated coordinate space if rotated
        const rad = ((initialRotation || 0) * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const localDeltaX = deltaLogicalX * cos + deltaLogicalY * sin;
        const localDeltaY = -deltaLogicalX * sin + deltaLogicalY * cos;

        let nextX = initialX;
        let nextY = initialY;
        let nextWidth = initialWidth;
        let nextHeight = initialHeight;
        const minDim = 20;

        // Horizontal sizing
        if (handle === 'r' || handle === 'tr' || handle === 'br') {
          nextWidth = Math.max(minDim, Math.round(initialWidth + localDeltaX));
        } else if (handle === 'l' || handle === 'tl' || handle === 'bl') {
          const maxDeltaX = initialWidth - minDim;
          const clampedDeltaX = Math.min(maxDeltaX, localDeltaX);
          nextWidth = Math.round(initialWidth - clampedDeltaX);
          if (!initialRotation) {
            nextX = Math.round(initialX + clampedDeltaX);
          } else {
            nextX = Math.round(initialX + clampedDeltaX * cos);
            nextY = Math.round(initialY + clampedDeltaX * sin);
          }
        }

        // Vertical sizing
        if (handle === 'b' || handle === 'bl' || handle === 'br') {
          nextHeight = Math.max(minDim, Math.round(initialHeight + localDeltaY));
        } else if (handle === 't' || handle === 'tl' || handle === 'tr') {
          const maxDeltaY = initialHeight - minDim;
          const clampedDeltaY = Math.min(maxDeltaY, localDeltaY);
          nextHeight = Math.round(initialHeight - clampedDeltaY);
          if (!initialRotation) {
            nextY = Math.round(initialY + clampedDeltaY);
          } else {
            nextX = Math.round(nextX - clampedDeltaY * sin);
            nextY = Math.round(nextY + clampedDeltaY * cos);
          }
        }

        // Apply resize snapping if unrotated
        if (snapEnabled && !initialRotation && !e.altKey) {
          const targetInfo = findElementAndParent(elementId, elements);
          const parentElement = targetInfo?.parent;
          const isRoot = !parentElement;
          const containerId = parentElement ? parentElement.id : 'root';
          const siblings = parentElement ? parentElement.children || [] : elements;

          const resizeSnap = calculateResizeSnap(
            { x: nextX, y: nextY, width: nextWidth, height: nextHeight },
            handle,
            parentWidth,
            parentHeight,
            siblings,
            [elementId],
            8,
            isRoot
          );

          nextX = resizeSnap.box.x;
          nextY = resizeSnap.box.y;
          nextWidth = resizeSnap.box.width;
          nextHeight = resizeSnap.box.height;

          if (resizeSnap.guides.length > 0) {
            setActiveGuides({ containerId, guides: resizeSnap.guides });
          } else {
            setActiveGuides(null);
          }
        } else {
          setActiveGuides(null);
        }

        updateElementById(elementId, (prev) => ({
          ...prev,
          x: nextX,
          y: nextY,
          width: nextWidth,
          height: nextHeight,
        } as ResultScreenElement));
      } else if (mode === 'rotate' && centerX !== undefined && centerY !== undefined && startAngle !== undefined) {
        const currentAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
        const angleDiff = currentAngle - startAngle;
        let nextRotation = (initialRotation + angleDiff) % 360;
        if (nextRotation < 0) nextRotation += 360;

        // Soft snap to common angles (0°, 45°, 90°, 135°, 180°, 225°, 270°, 315°) within 3 degrees
        const snapAngles = [0, 45, 90, 135, 180, 225, 270, 315, 360];
        for (const snap of snapAngles) {
          if (Math.abs(nextRotation - snap) <= 3) {
            nextRotation = snap === 360 ? 0 : snap;
            break;
          }
        }

        updateElementById(elementId, (prev) => ({
          ...prev,
          rotation: Math.round(nextRotation),
        } as ResultScreenElement));
      }
    };

    const handleMouseUp = () => {
      setActiveGuides(null);
      setInteractionMode('idle');
      interactionRef.current = null;
      if (isGestureActiveRef.current) {
        isGestureActiveRef.current = false;
        commitGesture(elementsRef.current);
      }
    };

    if (interactionMode !== 'idle') {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [interactionMode, canvasWidth, canvasHeight, elements, commitGesture]);

  // Keyboard Navigation & Shortcuts (Undo/Redo, Arrow nudge, Delete, Escape)
  useEffect(() => {
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

      if (selectedIds.length === 0) return;

      const step = e.shiftKey ? 10 : 1;

      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;

        const parentContainerW = commonParent ? commonParent.width : canvasWidth;
        const parentContainerH = commonParent ? commonParent.height : canvasHeight;

        const updates: Record<string, Partial<ResultScreenElement>> = {};
        for (const el of selectedElements) {
          const nextX = Math.round(el.x + dx);
          const nextY = Math.round(el.y + dy);
          const clampedX = Math.max(0, Math.min(parentContainerW - el.width, nextX));
          const clampedY = Math.max(0, Math.min(parentContainerH - el.height, nextY));
          updates[el.id] = { x: clampedX, y: clampedY };
        }
        updateMultipleElements(updates);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        handleDeleteSelected();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setSelectedIds([]);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Alt') {
        setIsAltHeld(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [selectedIds, selectedElements, commonParent, canvasWidth, canvasHeight, elements, handleUndo, handleRedo]);

  const bg = resolveScreenBackground(resultConfig, theme);

  // Active Spacing Measurements (Editor-only overlay)
  const activeMeasurements = (showMeasurements || isAltHeld) && selectedElement
    ? {
        containerId: selectedParentElement ? selectedParentElement.id : 'root',
        measurements: calculateMeasurements(
          selectedElement,
          selectedParentElement ? selectedParentElement.width : canvasWidth,
          selectedParentElement ? selectedParentElement.height : canvasHeight,
          selectedParentElement ? selectedParentElement.children || [] : elements,
          selectedElement.id
        ),
      }
    : null;

  // Layer Row Icon Resolver
  const getElementIcon = (type: ResultScreenElementType) => {
    switch (type) {
      case 'card':
        return <Square className="w-3.5 h-3.5 text-blue-400" />;
      case 'image':
        return <ImageIcon className="w-3.5 h-3.5 text-emerald-400" />;
      case 'text':
        return <Type className="w-3.5 h-3.5 text-slate-300" />;
      case 'score':
        return <Award className="w-3.5 h-3.5 text-amber-400" />;
      case 'moves':
        return <RotateCcw className="w-3.5 h-3.5 text-cyan-400" />;
      case 'pairs':
        return <Sparkles className="w-3.5 h-3.5 text-emerald-400" />;
      case 'time':
        return <Clock className="w-3.5 h-3.5 text-sky-400" />;
      case 'accuracy':
        return <Zap className="w-3.5 h-3.5 text-purple-400" />;
      case 'button':
        return <MousePointerClick className="w-3.5 h-3.5 text-amber-400" />;
      case 'leaderboard':
        return <Trophy className="w-3.5 h-3.5 text-amber-400" />;
      case 'group':
        return <FolderTree className="w-3.5 h-3.5 text-slate-400" />;
      default:
        return <Box className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  // Render Alignment Guides Overlay
  const renderGuides = (guides: AlignmentGuide[], pW: number, pH: number) => {
    return guides.map((g) => {
      if (g.type === 'vertical') {
        const leftPercent = `${(g.position / pW) * 100}%`;
        const topPercent = `${(g.start / pH) * 100}%`;
        const heightPercent = `${((g.end - g.start) / pH) * 100}%`;
        return (
          <div
            key={g.id}
            className="absolute pointer-events-none z-50 transition-opacity duration-75"
            style={{
              left: leftPercent,
              top: topPercent,
              height: heightPercent,
              width: '1.5px',
              transform: 'translateX(-50%)',
            }}
          >
            <div className="w-full h-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.9)] opacity-95" />
            {g.label && (
              <div className="absolute top-1 left-1.5 -translate-y-1/2 bg-slate-950/90 border border-amber-400/80 text-amber-300 font-mono text-[9px] font-bold px-1.5 py-0.5 rounded shadow-lg whitespace-nowrap">
                {g.label}
              </div>
            )}
          </div>
        );
      } else {
        const topPercent = `${(g.position / pH) * 100}%`;
        const leftPercent = `${(g.start / pW) * 100}%`;
        const widthPercent = `${((g.end - g.start) / pW) * 100}%`;
        return (
          <div
            key={g.id}
            className="absolute pointer-events-none z-50 transition-opacity duration-75"
            style={{
              top: topPercent,
              left: leftPercent,
              width: widthPercent,
              height: '1.5px',
              transform: 'translateY(-50%)',
            }}
          >
            <div className="w-full h-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.9)] opacity-95" />
            {g.label && (
              <div className="absolute left-1 top-1.5 -translate-x-1/2 bg-slate-950/90 border border-amber-400/80 text-amber-300 font-mono text-[9px] font-bold px-1.5 py-0.5 rounded shadow-lg whitespace-nowrap">
                {g.label}
              </div>
            )}
          </div>
        );
      }
    });
  };

  // Render Spacing and Distance Measurements Overlay (Editor-only)
  const renderMeasurements = (
    measurements: SpacingMeasurement[],
    pW: number,
    pH: number
  ) => {
    return measurements.map((m) => {
      const isHorizontal = m.direction === 'left' || m.direction === 'right';
      const x1Percent = `${(m.x1 / pW) * 100}%`;
      const y1Percent = `${(m.y1 / pH) * 100}%`;
      const x2Percent = `${(m.x2 / pW) * 100}%`;
      const y2Percent = `${(m.y2 / pH) * 100}%`;

      const midX = (m.x1 + m.x2) / 2;
      const midY = (m.y1 + m.y2) / 2;
      const midXPercent = `${(midX / pW) * 100}%`;
      const midYPercent = `${(midY / pH) * 100}%`;

      return (
        <React.Fragment key={m.id}>
          {/* Measurement Line & Endcaps */}
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none z-40 overflow-visible"
            style={{ width: '100%', height: '100%' }}
          >
            <line
              x1={x1Percent}
              y1={y1Percent}
              x2={x2Percent}
              y2={y2Percent}
              stroke="#f43f5e"
              strokeWidth="1.5"
              strokeDasharray="3 3"
            />
            {isHorizontal ? (
              <>
                <line
                  x1={x1Percent}
                  y1={`${((m.y1 - 5) / pH) * 100}%`}
                  x2={x1Percent}
                  y2={`${((m.y1 + 5) / pH) * 100}%`}
                  stroke="#f43f5e"
                  strokeWidth="1.5"
                />
                <line
                  x1={x2Percent}
                  y1={`${((m.y2 - 5) / pH) * 100}%`}
                  x2={x2Percent}
                  y2={`${((m.y2 + 5) / pH) * 100}%`}
                  stroke="#f43f5e"
                  strokeWidth="1.5"
                />
              </>
            ) : (
              <>
                <line
                  x1={`${((m.x1 - 5) / pW) * 100}%`}
                  y1={y1Percent}
                  x2={`${((m.x1 + 5) / pW) * 100}%`}
                  y2={y1Percent}
                  stroke="#f43f5e"
                  strokeWidth="1.5"
                />
                <line
                  x1={`${((m.x2 - 5) / pW) * 100}%`}
                  y1={y2Percent}
                  x2={`${((m.x2 + 5) / pW) * 100}%`}
                  y2={y2Percent}
                  stroke="#f43f5e"
                  strokeWidth="1.5"
                />
              </>
            )}
          </svg>

          {/* Distance Badge Chip */}
          <div
            className="absolute pointer-events-none z-50 -translate-x-1/2 -translate-y-1/2 bg-rose-950/95 border border-rose-500/80 text-rose-200 font-mono text-[9px] font-bold px-1.5 py-0.5 rounded shadow-lg whitespace-nowrap"
            style={{
              left: midXPercent,
              top: midYPercent,
            }}
          >
            {m.label}
          </div>
        </React.Fragment>
      );
    });
  };

  // Render an element on the canvas with interactive selection bounds & drag handles
  const renderCanvasElement = (
    el: ResultScreenElement,
    parentWidth: number,
    parentHeight: number
  ): React.ReactNode => {
    const isSelected = selectedIds.includes(el.id);
    const isSingleSelected = selectedIds.length === 1 && selectedIds[0] === el.id;
    const isMultiSelected = selectedIds.length > 1 && isSelected;
    const isVisible = el.visible !== false;
    const isParentOfSelected = selectedParentElement?.id === el.id;
    const isContainer = el.type === 'card' || el.type === 'group';

    const leftPercent = `${(el.x / parentWidth) * 100}%`;
    const topPercent = `${(el.y / parentHeight) * 100}%`;
    const widthPercent = `${(el.width / parentWidth) * 100}%`;
    const heightPercent = `${(el.height / parentHeight) * 100}%`;

    const commonStyle: React.CSSProperties = {
      position: 'absolute',
      left: leftPercent,
      top: topPercent,
      width: widthPercent,
      height: heightPercent,
      opacity: isVisible ? el.opacity ?? 1 : 0.25,
      zIndex: el.zIndex ?? 1,
      transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
      boxSizing: 'border-box',
      cursor: 'grab',
      outline: isParentOfSelected ? '2px dashed rgba(59, 130, 246, 0.7)' : undefined,
      outlineOffset: isParentOfSelected ? '2px' : undefined,
    };

    const innerContent = (
      <ResultElementContent
        element={el}
        parentWidth={parentWidth}
        parentHeight={parentHeight}
        isSimulation={true}
        isEditor={true}
        renderChild={(child, pW, pH) => renderCanvasElement(child, pW, pH)}
      />
    );

    return (
      <div
        key={el.id}
        id={`canvas-el-${el.id}`}
        style={commonStyle}
        onMouseDown={(e) => handleMouseDown(e, el, parentWidth, parentHeight)}
        onClick={(e) => e.stopPropagation()}
        className="group relative"
      >
        {innerContent}

        {/* Alignment Guides for nested container children */}
        {isContainer && activeGuides?.containerId === el.id && (
          <div className="absolute inset-0 pointer-events-none z-50 overflow-visible">
            {renderGuides(activeGuides.guides, el.width, el.height)}
          </div>
        )}

        {/* Spacing & Distance Measurements for nested container children */}
        {isContainer && activeMeasurements?.containerId === el.id && (
          <div className="absolute inset-0 pointer-events-none z-40 overflow-visible">
            {renderMeasurements(activeMeasurements.measurements, el.width, el.height)}
          </div>
        )}

        {/* Selection bounding box, 8 resize handles, and rotation stalk */}
        {isSelected && (
          <div className="absolute -inset-0.5 border-2 border-amber-400 pointer-events-none z-50">
            {isSingleSelected ? (
              <>
                {/* Rotation Stalk and Knob */}
                <div
                  className="absolute -top-7 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-auto"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div
                    onMouseDown={(e) => handleRotateMouseDown(e, el, parentWidth, parentHeight)}
                    className="w-5 h-5 rounded-full bg-amber-400 hover:bg-amber-300 border-2 border-slate-950 flex items-center justify-center cursor-grab active:cursor-grabbing shadow-md hover:scale-125 transition-transform"
                    title="Drag to Rotate (Degrees)"
                  >
                    <RotateCw className="w-2.5 h-2.5 text-slate-950 stroke-[3]" />
                  </div>
                  <div className="w-0.5 h-2 bg-amber-400" />
                </div>

                {/* Corner Resize Handles */}
                <div
                  onMouseDown={(e) => handleResizeMouseDown(e, el, parentWidth, parentHeight, 'tl')}
                  onClick={(e) => e.stopPropagation()}
                  className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-amber-400 border border-slate-950 rounded-sm cursor-nwse-resize pointer-events-auto hover:scale-125 transition-transform shadow"
                  title="Resize Top-Left"
                />
                <div
                  onMouseDown={(e) => handleResizeMouseDown(e, el, parentWidth, parentHeight, 'tr')}
                  onClick={(e) => e.stopPropagation()}
                  className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-amber-400 border border-slate-950 rounded-sm cursor-nesw-resize pointer-events-auto hover:scale-125 transition-transform shadow"
                  title="Resize Top-Right"
                />
                <div
                  onMouseDown={(e) => handleResizeMouseDown(e, el, parentWidth, parentHeight, 'bl')}
                  onClick={(e) => e.stopPropagation()}
                  className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-amber-400 border border-slate-950 rounded-sm cursor-nesw-resize pointer-events-auto hover:scale-125 transition-transform shadow"
                  title="Resize Bottom-Left"
                />
                <div
                  onMouseDown={(e) => handleResizeMouseDown(e, el, parentWidth, parentHeight, 'br')}
                  onClick={(e) => e.stopPropagation()}
                  className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-amber-400 border border-slate-950 rounded-sm cursor-nwse-resize pointer-events-auto hover:scale-125 transition-transform shadow"
                  title="Resize Bottom-Right"
                />

                {/* Edge Resize Handles */}
                <div
                  onMouseDown={(e) => handleResizeMouseDown(e, el, parentWidth, parentHeight, 't')}
                  onClick={(e) => e.stopPropagation()}
                  className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-amber-400 border border-slate-950 rounded-sm cursor-ns-resize pointer-events-auto hover:scale-125 transition-transform shadow"
                  title="Resize Top Edge"
                />
                <div
                  onMouseDown={(e) => handleResizeMouseDown(e, el, parentWidth, parentHeight, 'b')}
                  onClick={(e) => e.stopPropagation()}
                  className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-amber-400 border border-slate-950 rounded-sm cursor-ns-resize pointer-events-auto hover:scale-125 transition-transform shadow"
                  title="Resize Bottom Edge"
                />
                <div
                  onMouseDown={(e) => handleResizeMouseDown(e, el, parentWidth, parentHeight, 'l')}
                  onClick={(e) => e.stopPropagation()}
                  className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-3 h-3 bg-amber-400 border border-slate-950 rounded-sm cursor-ew-resize pointer-events-auto hover:scale-125 transition-transform shadow"
                  title="Resize Left Edge"
                />
                <div
                  onMouseDown={(e) => handleResizeMouseDown(e, el, parentWidth, parentHeight, 'r')}
                  onClick={(e) => e.stopPropagation()}
                  className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-3 h-3 bg-amber-400 border border-slate-950 rounded-sm cursor-ew-resize pointer-events-auto hover:scale-125 transition-transform shadow"
                  title="Resize Right Edge"
                />

                {/* Live Manipulation HUD Badge */}
                <div className="absolute -top-7 right-0 bg-slate-950/95 border border-amber-500/70 text-amber-300 font-mono text-[9px] px-2 py-0.5 rounded shadow-lg flex items-center gap-1.5 whitespace-nowrap pointer-events-none z-50">
                  <span className="font-bold uppercase text-amber-400">{el.type}</span>
                  <span>•</span>
                  <span>
                    ({Math.round(el.x)}, {Math.round(el.y)})
                  </span>
                  <span>•</span>
                  <span>
                    {Math.round(el.width)}×{Math.round(el.height)}
                  </span>
                  {typeof el.rotation === 'number' && el.rotation !== 0 ? (
                    <>
                      <span>•</span>
                      <span>{Math.round(el.rotation)}°</span>
                    </>
                  ) : null}
                </div>
              </>
            ) : (
              /* Multi-Selection Overlay Badge */
              <div className="absolute -top-5 left-0 bg-amber-500 text-slate-950 font-mono text-[9px] font-black px-1.5 py-0.2 rounded shadow flex items-center gap-1 uppercase tracking-wider">
                <span>{el.type}</span>
                <span className="opacity-75">({Math.round(el.x)}, {Math.round(el.y)})</span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Render layer list item (recursive for card/group children)
  const renderLayerItem = (
    el: ResultScreenElement,
    depth = 0,
    parentEl: ResultCardElement | ResultGroupElement | null = null,
    isLastChild = false
  ) => {
    const isSelected = selectedIds.includes(el.id);
    const isVisible = el.visible !== false;
    const isCardOrGroup = el.type === 'card' || el.type === 'group';
    const isExpanded = expandedCardIds[el.id] !== false; // expanded by default
    const children =
      el.type === 'card'
        ? (el as ResultCardElement).children
        : el.type === 'group'
        ? (el as ResultGroupElement).children
        : undefined;

    const availableContainers = getAvailableContainers(el.id, elements);
    const isChildAddOpen = activeChildAddContainerId === el.id;

    return (
      <div key={el.id} className="space-y-0.5 relative">
        <div
          onClick={(e) => handleSelectElement(el.id, e)}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          className={`flex items-center justify-between py-1.5 pr-2 rounded-xl cursor-pointer transition-colors text-xs font-semibold select-none group relative ${
            isSelected
              ? 'bg-amber-500/20 border border-amber-500/50 text-amber-300 shadow-sm'
              : 'hover:bg-slate-800/80 text-slate-300 border border-transparent'
          }`}
        >
          {/* Tree guide line for nested children */}
          {depth > 0 && (
            <div
              style={{ left: `${(depth - 1) * 16 + 14}px` }}
              className="absolute top-1/2 -translate-y-1/2 w-2.5 h-3.5 border-l-2 border-b-2 border-slate-700/80 rounded-bl-sm pointer-events-none"
            />
          )}

          <div className="flex items-center gap-1.5 min-w-0 truncate">
            {/* Expand / Collapse Chevron for containers */}
            {isCardOrGroup ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setExpandedCardIds((prev) => ({ ...prev, [el.id]: !isExpanded }));
                }}
                className="p-0.5 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 transition-colors"
                title={isExpanded ? 'Collapse Container' : 'Expand Container'}
              >
                {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
            ) : (
              <span className="w-3.5 h-3.5 flex items-center justify-center text-slate-600 text-[10px]">
                •
              </span>
            )}

            <div className="shrink-0">{getElementIcon(el.type)}</div>

            <span className="truncate max-w-[110px]">
              {el.type === 'text'
                ? `"${(el as ResultTextElement).text || 'Text'}"`
                : el.type === 'button'
                ? `Btn: ${(el as ResultButtonElement).text || 'Action'}`
                : el.type === 'leaderboard'
                ? (el as ResultLeaderboardElement).headerText || 'Leaderboard'
                : `${el.type.charAt(0).toUpperCase() + el.type.slice(1)}`}
            </span>

            {/* Item Count for Card/Group */}
            {isCardOrGroup && (
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-400 border border-slate-700 shrink-0">
                {children?.length || 0}
              </span>
            )}

            {/* Z-Index / Layer order badge */}
            <span
              className="text-[9px] font-mono text-slate-400 bg-slate-850 px-1 py-0.2 rounded border border-slate-700/60 shrink-0 select-none"
              title={`Layer Stacking Order: Z-${el.zIndex ?? 1}`}
            >
              z:{el.zIndex ?? 1}
            </span>
          </div>

          {/* Action buttons on hover / active */}
          <div className="flex items-center gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
            {/* Bring To Front */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleMoveLayer(el.id, 'front');
              }}
              className="p-1 rounded hover:bg-slate-700/80 text-slate-400 hover:text-amber-300"
              title="Bring To Front"
            >
              <ChevronsUp className="w-3 h-3" />
            </button>

            {/* Move Layer Forward / Up */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleMoveLayer(el.id, 'forward');
              }}
              className="p-1 rounded hover:bg-slate-700/80 text-slate-400 hover:text-slate-200"
              title="Bring Forward (1 step)"
            >
              <ArrowUp className="w-3 h-3" />
            </button>

            {/* Move Layer Backward / Down */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleMoveLayer(el.id, 'backward');
              }}
              className="p-1 rounded hover:bg-slate-700/80 text-slate-400 hover:text-slate-200"
              title="Send Backward (1 step)"
            >
              <ArrowDown className="w-3 h-3" />
            </button>

            {/* Send To Back */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleMoveLayer(el.id, 'back');
              }}
              className="p-1 rounded hover:bg-slate-700/80 text-slate-400 hover:text-amber-300"
              title="Send To Back"
            >
              <ChevronsDown className="w-3 h-3" />
            </button>

            {/* Add Child button for Card/Group */}
            {isCardOrGroup && (
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveChildAddContainerId(isChildAddOpen ? null : el.id);
                  }}
                  className={`p-1 rounded transition-colors ${
                    isChildAddOpen
                      ? 'bg-blue-600 text-white'
                      : 'hover:bg-blue-900/50 text-blue-400 hover:text-blue-200'
                  }`}
                  title="Add child element into container"
                >
                  <Plus className="w-3 h-3" />
                </button>

                {/* Child Add Dropdown Menu */}
                {isChildAddOpen && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-0 top-full mt-1 w-44 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 p-1.5 space-y-1"
                  >
                    <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                      Add to {el.type === 'card' ? 'Card' : 'Group'}
                    </div>
                    {(
                      [
                        { type: 'text', label: 'Text Block' },
                        { type: 'score', label: 'Score Display' },
                        { type: 'moves', label: 'Moves Counter' },
                        { type: 'pairs', label: 'Pairs Counter' },
                        { type: 'time', label: 'Time Elapsed' },
                        { type: 'accuracy', label: 'Accuracy Stat' },
                        { type: 'image', label: 'Image Box' },
                        { type: 'button', label: 'Button' },
                        { type: 'leaderboard', label: 'Leaderboard' },
                        { type: 'group', label: 'Group Wrapper' },
                      ] as const
                    ).map((item) => (
                      <button
                        key={item.type}
                        type="button"
                        onClick={() => {
                          handleAddChildElement(el.id, item.type);
                          setActiveChildAddContainerId(null);
                        }}
                        className="w-full text-left px-2 py-1 rounded-lg text-xs text-slate-200 hover:bg-amber-500/20 hover:text-amber-300 flex items-center gap-2 transition-colors"
                      >
                        {getElementIcon(item.type)}
                        <span>{item.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Visibility Toggle */}
            <button
              type="button"
              onClick={(e) => handleToggleVisibility(el.id, e)}
              className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-slate-200"
              title={isVisible ? 'Hide' : 'Show'}
            >
              {isVisible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3 text-slate-600" />}
            </button>

            {/* Duplicate */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleDuplicateElement(el.id);
              }}
              className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-slate-200"
              title="Duplicate"
            >
              <Copy className="w-3 h-3" />
            </button>

            {/* Delete */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteElement(el.id);
              }}
              className="p-1 rounded hover:bg-rose-950/60 text-slate-400 hover:text-rose-400"
              title="Delete"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Render child elements if container is expanded */}
        {isCardOrGroup && isExpanded && Array.isArray(children) && children.length > 0 && (
          <div className="space-y-0.5 border-l border-slate-800/80 ml-3 pl-1">
            {children.map((child, idx) =>
              renderLayerItem(
                child,
                depth + 1,
                el as ResultCardElement | ResultGroupElement,
                idx === children.length - 1
              )
            )}
          </div>
        )}
      </div>
    );
  };

  // Handle Asset File Upload
  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadTarget || !onUploadAsset) return;

    try {
      setIsUploadingAsset(true);
      const url = await onUploadAsset(file, 'result-asset');
      if (url) {
        if (uploadTarget.field === 'cardBg') {
          updateElementById(uploadTarget.elementId, (prev) => ({
            ...prev,
            style: {
              ...(prev as ResultCardElement).style,
              backgroundImageUrl: url,
            },
          } as ResultScreenElement));
        } else if (uploadTarget.field === 'imageUrl') {
          updateElementById(uploadTarget.elementId, (prev) => ({
            ...prev,
            imageUrl: url,
          } as ResultScreenElement));
        }
      }
    } catch (err) {
      console.error('Failed to upload asset', err);
    } finally {
      setIsUploadingAsset(false);
      setUploadTarget(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ----------------------------------------------------
  // Phase 8.1 Professional Alignment & Layout Functions
  // ----------------------------------------------------

  // 1. Center Horizontally (Canvas or Parent)
  const handleCenterHorizontally = () => {
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
  };

  // 2. Center Vertically (Canvas or Parent)
  const handleCenterVertically = () => {
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
  };

  // 3. Center Both (Horizontally and Vertically)
  const handleCenterBoth = () => {
    if (selectedElements.length === 0) return;
    const containerW = commonParent ? commonParent.width : canvasWidth;
    const containerH = commonParent ? commonParent.height : canvasHeight;

    if (selectedElements.length === 1) {
      const el = selectedElements[0];
      const newX = Math.max(0, Math.round((containerW - el.width) / 2));
      const newY = Math.max(0, Math.round((containerH - el.height) / 2));
      updateElementById(el.id, (prev) => ({ ...prev, x: newX, y: newY }));
    } else {
      const minX = Math.min(...selectedElements.map((e) => e.x));
      const maxX = Math.max(...selectedElements.map((e) => e.x + e.width));
      const bboxW = maxX - minX;
      const targetMinX = Math.round((containerW - bboxW) / 2);
      const deltaX = targetMinX - minX;

      const minY = Math.min(...selectedElements.map((e) => e.y));
      const maxY = Math.max(...selectedElements.map((e) => e.y + e.height));
      const bboxH = maxY - minY;
      const targetMinY = Math.round((containerH - bboxH) / 2);
      const deltaY = targetMinY - minY;

      const updates: Record<string, Partial<ResultScreenElement>> = {};
      for (const el of selectedElements) {
        const newX = Math.max(0, Math.min(containerW - el.width, Math.round(el.x + deltaX)));
        const newY = Math.max(0, Math.min(containerH - el.height, Math.round(el.y + deltaY)));
        updates[el.id] = { x: newX, y: newY };
      }
      updateMultipleElements(updates);
    }
  };

  // 4. Align Left
  const handleAlignLeft = () => {
    if (selectedElements.length === 0) return;
    if (selectedElements.length === 1) {
      updateElementById(selectedElements[0].id, (prev) => ({ ...prev, x: 0 }));
    } else {
      const minX = Math.min(...selectedElements.map((e) => e.x));
      const updates: Record<string, Partial<ResultScreenElement>> = {};
      for (const el of selectedElements) {
        updates[el.id] = { x: minX };
      }
      updateMultipleElements(updates);
    }
  };

  // 5. Align Center (Horizontally)
  const handleAlignCenter = () => {
    if (selectedElements.length === 0) return;
    const containerW = commonParent ? commonParent.width : canvasWidth;
    if (selectedElements.length === 1) {
      handleCenterHorizontally();
    } else {
      const minX = Math.min(...selectedElements.map((e) => e.x));
      const maxX = Math.max(...selectedElements.map((e) => e.x + e.width));
      const centerX = (minX + maxX) / 2;
      const updates: Record<string, Partial<ResultScreenElement>> = {};
      for (const el of selectedElements) {
        const newX = Math.max(0, Math.min(containerW - el.width, Math.round(centerX - el.width / 2)));
        updates[el.id] = { x: newX };
      }
      updateMultipleElements(updates);
    }
  };

  // 6. Align Right
  const handleAlignRight = () => {
    if (selectedElements.length === 0) return;
    const containerW = commonParent ? commonParent.width : canvasWidth;
    if (selectedElements.length === 1) {
      updateElementById(selectedElements[0].id, (prev) => ({ ...prev, x: Math.max(0, containerW - prev.width) }));
    } else {
      const maxX = Math.max(...selectedElements.map((e) => e.x + e.width));
      const updates: Record<string, Partial<ResultScreenElement>> = {};
      for (const el of selectedElements) {
        const newX = Math.max(0, Math.min(containerW - el.width, Math.round(maxX - el.width)));
        updates[el.id] = { x: newX };
      }
      updateMultipleElements(updates);
    }
  };

  // 7. Align Top
  const handleAlignTop = () => {
    if (selectedElements.length === 0) return;
    if (selectedElements.length === 1) {
      updateElementById(selectedElements[0].id, (prev) => ({ ...prev, y: 0 }));
    } else {
      const minY = Math.min(...selectedElements.map((e) => e.y));
      const updates: Record<string, Partial<ResultScreenElement>> = {};
      for (const el of selectedElements) {
        updates[el.id] = { y: minY };
      }
      updateMultipleElements(updates);
    }
  };

  // 8. Align Middle (Vertically)
  const handleAlignMiddle = () => {
    if (selectedElements.length === 0) return;
    const containerH = commonParent ? commonParent.height : canvasHeight;
    if (selectedElements.length === 1) {
      handleCenterVertically();
    } else {
      const minY = Math.min(...selectedElements.map((e) => e.y));
      const maxY = Math.max(...selectedElements.map((e) => e.y + e.height));
      const centerY = (minY + maxY) / 2;
      const updates: Record<string, Partial<ResultScreenElement>> = {};
      for (const el of selectedElements) {
        const newY = Math.max(0, Math.min(containerH - el.height, Math.round(centerY - el.height / 2)));
        updates[el.id] = { y: newY };
      }
      updateMultipleElements(updates);
    }
  };

  // 9. Align Bottom
  const handleAlignBottom = () => {
    if (selectedElements.length === 0) return;
    const containerH = commonParent ? commonParent.height : canvasHeight;
    if (selectedElements.length === 1) {
      updateElementById(selectedElements[0].id, (prev) => ({ ...prev, y: Math.max(0, containerH - prev.height) }));
    } else {
      const maxY = Math.max(...selectedElements.map((e) => e.y + e.height));
      const updates: Record<string, Partial<ResultScreenElement>> = {};
      for (const el of selectedElements) {
        const newY = Math.max(0, Math.min(containerH - el.height, Math.round(maxY - el.height)));
        updates[el.id] = { y: newY };
      }
      updateMultipleElements(updates);
    }
  };

  // 10. Distribute Horizontally (3+ elements)
  const handleDistributeHorizontally = () => {
    if (selectedElements.length < 3) return;
    const containerW = commonParent ? commonParent.width : canvasWidth;
    const sorted = [...selectedElements].sort((a, b) => a.x - b.x);
    const minX = sorted[0].x;
    const lastEl = sorted[sorted.length - 1];
    const maxX = lastEl.x + lastEl.width;
    const totalItemWidths = sorted.reduce((sum, item) => sum + item.width, 0);
    const totalGap = (maxX - minX) - totalItemWidths;
    const gap = totalGap / (sorted.length - 1);

    let currentX = minX;
    const updates: Record<string, Partial<ResultScreenElement>> = {};

    for (let i = 0; i < sorted.length; i++) {
      const el = sorted[i];
      if (i === 0) {
        updates[el.id] = { x: minX };
        currentX += el.width + gap;
      } else if (i === sorted.length - 1) {
        const newX = Math.max(0, Math.min(containerW - el.width, Math.round(maxX - el.width)));
        updates[el.id] = { x: newX };
      } else {
        const newX = Math.max(0, Math.min(containerW - el.width, Math.round(currentX)));
        updates[el.id] = { x: newX };
        currentX += el.width + gap;
      }
    }

    updateMultipleElements(updates);
  };

  // 11. Distribute Vertically (3+ elements)
  const handleDistributeVertically = () => {
    if (selectedElements.length < 3) return;
    const containerH = commonParent ? commonParent.height : canvasHeight;
    const sorted = [...selectedElements].sort((a, b) => a.y - b.y);
    const minY = sorted[0].y;
    const lastEl = sorted[sorted.length - 1];
    const maxY = lastEl.y + lastEl.height;
    const totalItemHeights = sorted.reduce((sum, item) => sum + item.height, 0);
    const totalGap = (maxY - minY) - totalItemHeights;
    const gap = totalGap / (sorted.length - 1);

    let currentY = minY;
    const updates: Record<string, Partial<ResultScreenElement>> = {};

    for (let i = 0; i < sorted.length; i++) {
      const el = sorted[i];
      if (i === 0) {
        updates[el.id] = { y: minY };
        currentY += el.height + gap;
      } else if (i === sorted.length - 1) {
        const newY = Math.max(0, Math.min(containerH - el.height, Math.round(maxY - el.height)));
        updates[el.id] = { y: newY };
      } else {
        const newY = Math.max(0, Math.min(containerH - el.height, Math.round(currentY)));
        updates[el.id] = { y: newY };
        currentY += el.height + gap;
      }
    }

    updateMultipleElements(updates);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-6 space-y-4 shadow-xl">
      {/* Hidden file input for asset uploads */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelected}
        className="hidden"
      />

      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 shadow-sm">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-black text-slate-100 flex items-center gap-2">
              <span>Result Screen Visual Layout Editor</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                1000×1000 Canvas
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              Drag elements directly on canvas or manage hierarchy in the layer tree
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Undo / Redo Group */}
          <div className="flex items-center bg-slate-900 border border-slate-700 rounded-xl p-0.5 shadow">
            <button
              type="button"
              disabled={!canUndo}
              onClick={handleUndo}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-all ${
                canUndo
                  ? 'text-slate-200 hover:text-white hover:bg-slate-800 active:scale-95'
                  : 'text-slate-600 opacity-40 cursor-not-allowed'
              }`}
              title="Undo (Ctrl+Z / Cmd+Z)"
            >
              <Undo2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Undo</span>
            </button>
            <div className="w-[1px] h-4 bg-slate-800 mx-0.5" />
            <button
              type="button"
              disabled={!canRedo}
              onClick={handleRedo}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-all ${
                canRedo
                  ? 'text-slate-200 hover:text-white hover:bg-slate-800 active:scale-95'
                  : 'text-slate-600 opacity-40 cursor-not-allowed'
              }`}
              title="Redo (Ctrl+Shift+Z / Cmd+Shift+Z / Ctrl+Y)"
            >
              <Redo2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Redo</span>
            </button>
          </div>

          {/* Templates Modal */}
          <button
            type="button"
            onClick={() => setIsPresetsModalOpen(true)}
            className="px-3 py-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 active:scale-95 text-amber-300 font-bold text-xs rounded-xl shadow flex items-center gap-1.5 cursor-pointer transition-all"
            title="Browse layout presets and saved custom templates"
          >
            <LayoutTemplate className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Templates</span>
          </button>

          {/* Save As Template Button */}
          <button
            type="button"
            onClick={() => setIsSaveTemplateModalOpen(true)}
            className="px-3 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 active:scale-95 text-amber-300 font-bold text-xs rounded-xl shadow flex items-center gap-1.5 cursor-pointer transition-all"
            title="Save current layout as a reusable custom template"
          >
            <BookmarkPlus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Save Template</span>
          </button>

          {/* Open Pro Fullscreen Studio Modal */}
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="px-3 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 active:scale-95 text-slate-200 font-bold text-xs rounded-xl shadow flex items-center gap-1.5 cursor-pointer transition-all"
            title="Open Fullscreen Studio Modal"
          >
            <Maximize2 className="w-3.5 h-3.5 text-amber-400" />
            <span>Fullscreen Studio</span>
          </button>

          {/* Quick Add Menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setAddMenuOpen(!addMenuOpen)}
              className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-black text-xs rounded-xl shadow-lg shadow-amber-500/20 flex items-center gap-1.5 cursor-pointer transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Add Element</span>
            </button>

          {addMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setAddMenuOpen(false)}
              />
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute right-0 top-full mt-2 w-56 bg-slate-950 border border-slate-800 rounded-2xl p-2 shadow-2xl z-50 space-y-1 max-h-[80vh] overflow-y-auto"
              >
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-2.5 py-1">
                  Containers
                </div>
                <button
                  type="button"
                  onClick={() => handleAddElement('card')}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-200 hover:bg-slate-900 transition-colors text-left"
                >
                  <Square className="w-4 h-4 text-blue-400" />
                  <span>Card Container</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleAddElement('group')}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-200 hover:bg-slate-900 transition-colors text-left"
                >
                  <FolderTree className="w-4 h-4 text-slate-400" />
                  <span>Group Wrapper</span>
                </button>

                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-2.5 py-1 pt-2 border-t border-slate-800/80">
                  Visual Elements
                </div>
                <button
                  type="button"
                  onClick={() => handleAddElement('text')}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-200 hover:bg-slate-900 transition-colors text-left"
                >
                  <Type className="w-4 h-4 text-amber-400" />
                  <span>Text Block</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleAddElement('image')}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-200 hover:bg-slate-900 transition-colors text-left"
                >
                  <ImageIcon className="w-4 h-4 text-emerald-400" />
                  <span>Image / Icon</span>
                </button>

                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-2.5 py-1 pt-2 border-t border-slate-800/80">
                  Live Game Stats
                </div>
                <button
                  type="button"
                  onClick={() => handleAddElement('score')}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-200 hover:bg-slate-900 transition-colors text-left"
                >
                  <Award className="w-4 h-4 text-yellow-400" />
                  <span>Final Score</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleAddElement('moves')}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-200 hover:bg-slate-900 transition-colors text-left"
                >
                  <RotateCcw className="w-4 h-4 text-cyan-400" />
                  <span>Total Moves</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleAddElement('pairs')}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-200 hover:bg-slate-900 transition-colors text-left"
                >
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  <span>Matched Pairs</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleAddElement('time')}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-200 hover:bg-slate-900 transition-colors text-left"
                >
                  <Clock className="w-4 h-4 text-sky-400" />
                  <span>Time Elapsed</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleAddElement('accuracy')}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-200 hover:bg-slate-900 transition-colors text-left"
                >
                  <Zap className="w-4 h-4 text-purple-400" />
                  <span>Accuracy</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleAddElement('leaderboard')}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-200 hover:bg-slate-900 transition-colors text-left"
                >
                  <Trophy className="w-4 h-4 text-amber-400" />
                  <span>Leaderboard</span>
                </button>

                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-2.5 py-1 pt-2 border-t border-slate-800/80">
                  Interactive Controls
                </div>
                <button
                  type="button"
                  onClick={() => handleAddElement('button')}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-200 hover:bg-slate-900 transition-colors text-left"
                >
                  <MousePointerClick className="w-4 h-4 text-amber-400" />
                  <span>Button</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>

      {/* 3-Panel Workspace Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* LEFT PANEL: Layer / Element Tree */}
        <div className="lg:col-span-3 bg-slate-950 border border-slate-800 rounded-2xl p-3.5 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-amber-400" />
              <span>Layers ({elements.length})</span>
            </span>
          </div>

          <div className="space-y-1 max-h-[580px] overflow-y-auto pr-1">
            {elements.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-500">No elements on canvas</div>
            ) : (
              elements.map((el) => renderLayerItem(el))
            )}
          </div>
        </div>

        {/* CENTER PANEL: Visual 1000x1000 Design Canvas & Layout Toolbar */}
        <div className="lg:col-span-5 flex flex-col items-center justify-center space-y-2.5">
          {/* Quick Layout & Alignment Floating Toolbar */}
          <div className="w-full max-w-[480px] bg-slate-950/95 border border-slate-800/90 rounded-xl px-2.5 py-1.5 flex items-center justify-between gap-1 shadow-lg backdrop-blur-md">
            {/* Centering Group */}
            <div className="flex items-center gap-0.5">
              <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest px-1 mr-0.5 select-none hidden sm:inline">
                Center
              </span>
              <button
                type="button"
                disabled={selectedElements.length === 0}
                onClick={handleCenterHorizontally}
                className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-800/80 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400 transition-colors"
                title="Center Horizontally (X)"
              >
                <AlignCenterHorizontal className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                disabled={selectedElements.length === 0}
                onClick={handleCenterVertically}
                className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-800/80 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400 transition-colors"
                title="Center Vertically (Y)"
              >
                <AlignCenterVertical className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                disabled={selectedElements.length === 0}
                onClick={handleCenterBoth}
                className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-800/80 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400 transition-colors text-[10px] font-bold"
                title="Center Both (X & Y)"
              >
                <Box className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="w-px h-4 bg-slate-800/80 mx-0.5" />

            {/* Alignment Group */}
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                disabled={selectedElements.length === 0}
                onClick={handleAlignLeft}
                className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-800/80 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400 transition-colors"
                title="Align Left"
              >
                <AlignLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                disabled={selectedElements.length === 0}
                onClick={handleAlignCenter}
                className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-800/80 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400 transition-colors"
                title="Align Center"
              >
                <AlignCenter className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                disabled={selectedElements.length === 0}
                onClick={handleAlignRight}
                className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-800/80 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400 transition-colors"
                title="Align Right"
              >
                <AlignRight className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                disabled={selectedElements.length === 0}
                onClick={handleAlignTop}
                className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-800/80 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400 transition-colors"
                title="Align Top"
              >
                <AlignStartVertical className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                disabled={selectedElements.length === 0}
                onClick={handleAlignMiddle}
                className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-800/80 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400 transition-colors"
                title="Align Middle"
              >
                <AlignCenterVertical className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                disabled={selectedElements.length === 0}
                onClick={handleAlignBottom}
                className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-800/80 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400 transition-colors"
                title="Align Bottom"
              >
                <AlignEndVertical className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="w-px h-4 bg-slate-800/80 mx-0.5" />

            {/* Distribution Group */}
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                disabled={selectedElements.length < 3}
                onClick={handleDistributeHorizontally}
                className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-800/80 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400 transition-colors"
                title={selectedElements.length < 3 ? 'Distribute Horizontally (Requires 3+ items)' : 'Distribute Horizontally'}
              >
                <AlignHorizontalDistributeCenter className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                disabled={selectedElements.length < 3}
                onClick={handleDistributeVertically}
                className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-800/80 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400 transition-colors"
                title={selectedElements.length < 3 ? 'Distribute Vertically (Requires 3+ items)' : 'Distribute Vertically'}
              >
                <AlignVerticalDistributeCenter className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="w-px h-4 bg-slate-800/80 mx-0.5" />

            {/* Layer Stacking Group */}
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                disabled={selectedElements.length === 0}
                onClick={() => handleMoveLayer(selectedIds, 'front')}
                className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-800/80 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400 transition-colors"
                title="Bring To Front"
              >
                <ChevronsUp className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                disabled={selectedElements.length === 0}
                onClick={() => handleMoveLayer(selectedIds, 'forward')}
                className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-800/80 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400 transition-colors"
                title="Bring Forward (1 step)"
              >
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                disabled={selectedElements.length === 0}
                onClick={() => handleMoveLayer(selectedIds, 'backward')}
                className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-800/80 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400 transition-colors"
                title="Send Backward (1 step)"
              >
                <ArrowDown className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                disabled={selectedElements.length === 0}
                onClick={() => handleMoveLayer(selectedIds, 'back')}
                className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-800/80 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400 transition-colors"
                title="Send To Back"
              >
                <ChevronsDown className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="w-px h-4 bg-slate-800/80 mx-0.5" />

            {/* Grid Controls (Toggle + Size selector) */}
            <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
              <button
                type="button"
                onClick={() => setShowGrid(!showGrid)}
                className={`p-1.5 rounded-lg transition-colors flex items-center gap-1 text-[10px] font-semibold ${
                  showGrid
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'hover:bg-slate-800/80 text-slate-400 border border-transparent'
                }`}
                title="Toggle Grid (Design Space 1000×1000)"
              >
                <Grid className="w-3.5 h-3.5" />
                <span>Grid</span>
              </button>
              {showGrid && (
                <select
                  value={gridSize}
                  onChange={(e) => setGridSize(parseInt(e.target.value, 10) as GridSizePreset)}
                  className="bg-slate-950 border border-slate-700/80 text-amber-300 text-[10px] font-mono rounded px-1 py-0.5 focus:outline-none cursor-pointer"
                  title="Grid Unit Size"
                >
                  {GRID_SIZE_PRESETS.map((sz) => (
                    <option key={sz} value={sz}>
                      {sz}px
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Measurement / Spacing Tools Toggle */}
            <button
              type="button"
              onClick={() => setShowMeasurements(!showMeasurements)}
              className={`p-1.5 rounded-lg transition-colors flex items-center gap-1 text-[10px] font-semibold ${
                showMeasurements
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                  : 'hover:bg-slate-800/80 text-slate-400 border border-transparent'
              }`}
              title="Toggle Spacing & Measurement Indicators (or hold Alt)"
            >
              <Ruler className="w-3.5 h-3.5" />
              <span>Measure</span>
            </button>

            {/* Smart Snap Toggle */}
            <button
              type="button"
              onClick={() => setSnapEnabled(!snapEnabled)}
              className={`p-1.5 rounded-lg transition-colors flex items-center gap-1 text-[10px] font-semibold ${
                snapEnabled
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'hover:bg-slate-800/80 text-slate-400 border border-transparent'
              }`}
              title="Toggle Smart Snapping & Alignment Guides (Hold Alt to bypass)"
            >
              <Magnet className="w-3.5 h-3.5" />
              <span>Snap</span>
            </button>

            {selectedElements.length > 0 && (
              <div className="flex items-center gap-1 pl-1">
                <span className="text-[10px] font-mono text-amber-400 font-bold bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/30">
                  {selectedElements.length} sel
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedIds([])}
                  className="text-[10px] text-slate-500 hover:text-slate-300 px-1 py-0.5 rounded"
                  title="Clear Selection (Esc)"
                >
                  ✕
                </button>
              </div>
            )}
          </div>

          <div
            ref={canvasRef}
            onClick={() => setSelectedIds([])}
            onMouseMove={(e) => {
              if (!canvasRef.current) return;
              const rect = canvasRef.current.getBoundingClientRect();
              const relX = e.clientX - rect.left;
              const relY = e.clientY - rect.top;
              const logicalX = Math.round((relX / rect.width) * canvasWidth);
              const logicalY = Math.round((relY / rect.height) * canvasHeight);
              setMouseLogicalCoords({
                x: Math.max(0, Math.min(canvasWidth, logicalX)),
                y: Math.max(0, Math.min(canvasHeight, logicalY)),
              });
            }}
            onMouseLeave={() => setMouseLogicalCoords(null)}
            className="relative w-full aspect-square max-w-[480px] rounded-2xl border-2 border-slate-700/80 shadow-2xl overflow-hidden select-none"
            style={{
              ...bg.containerStyle,
              containerType: 'inline-size',
            }}
          >
            {/* Background Overlay */}
            <div className="absolute inset-0 pointer-events-none" style={bg.overlayStyle} />

            {/* Grid lines overlay (dynamic logical design grid 1000x1000) */}
            {showGrid && (
              <div className="absolute inset-0 pointer-events-none overflow-hidden">
                {/* Minor grid subdivisions */}
                {gridSize >= 20 && (
                  <div
                    className="absolute inset-0 opacity-[0.04]"
                    style={{
                      backgroundImage: 'linear-gradient(to right, rgba(255,255,255,0.7) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.7) 1px, transparent 1px)',
                      backgroundSize: `${gridSize / 2}px ${gridSize / 2}px`,
                    }}
                  />
                )}
                {/* Major grid lines based on selected gridSize */}
                <div
                  className="absolute inset-0 opacity-[0.14]"
                  style={{
                    backgroundImage: 'linear-gradient(to right, rgba(255,255,255,0.9) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.9) 1px, transparent 1px)',
                    backgroundSize: `${gridSize}px ${gridSize}px`,
                  }}
                />
                {/* Canvas Center Axis Markers (500, 500) */}
                <div className="absolute left-1/2 top-0 bottom-0 w-[1px] bg-cyan-400/30 pointer-events-none" />
                <div className="absolute top-1/2 left-0 right-0 h-[1px] bg-cyan-400/30 pointer-events-none" />
              </div>
            )}

            {/* Canvas Elements */}
            {elements.map((el) => renderCanvasElement(el, canvasWidth, canvasHeight))}

            {/* Root Canvas Alignment Guides */}
            {activeGuides?.containerId === 'root' && (
              <div className="absolute inset-0 pointer-events-none z-50 overflow-visible">
                {renderGuides(activeGuides.guides, canvasWidth, canvasHeight)}
              </div>
            )}

            {/* Root Canvas Spacing & Distance Measurements */}
            {activeMeasurements?.containerId === 'root' && (
              <div className="absolute inset-0 pointer-events-none z-40 overflow-visible">
                {renderMeasurements(activeMeasurements.measurements, canvasWidth, canvasHeight)}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 mt-1 text-[11px] text-slate-400 font-mono">
            <span>Canvas: 1000 × 1000 px</span>
            {mouseLogicalCoords && (
              <>
                <span>•</span>
                <span className="text-amber-300">
                  Cursor: {mouseLogicalCoords.x}, {mouseLogicalCoords.y}
                </span>
              </>
            )}
            {selectedElement && (
              <>
                <span>•</span>
                <span className="text-slate-300">
                  {selectedElement.type} ({Math.round(selectedElement.x)}, {Math.round(selectedElement.y)}) {Math.round(selectedElement.width)}×{Math.round(selectedElement.height)}
                </span>
              </>
            )}
            <span>•</span>
            <span className="text-slate-500">Alt to measure / bypass snap</span>
          </div>
        </div>

        {/* RIGHT PANEL: Properties / Inspector */}
        <div className="lg:col-span-4 bg-slate-950 border border-slate-800 rounded-2xl p-3.5 space-y-3 max-h-[700px] overflow-y-auto">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-amber-400" />
              <span>Property Inspector</span>
            </span>
            {selectedElements.length > 1 ? (
              <span className="text-[10px] font-mono text-amber-400 font-bold uppercase bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
                {selectedElements.length} Selected
              </span>
            ) : selectedElement ? (
              <span className="text-[10px] font-mono text-amber-400/80 font-bold uppercase">
                {selectedElement.type}
              </span>
            ) : null}
          </div>

          {/* MULTI-ELEMENT SELECTION INSPECTOR */}
          {selectedElements.length > 1 ? (
            <div className="space-y-3.5 text-xs">
              {/* Header card */}
              <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Grid className="w-4 h-4 text-amber-400" />
                    <span className="font-bold text-slate-100 uppercase tracking-wider">
                      Multi-Selection ({selectedElements.length} Items)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedIds([])}
                    className="text-[10px] text-slate-400 hover:text-slate-200 px-2 py-0.5 rounded bg-slate-800 border border-slate-700"
                  >
                    Deselect All
                  </button>
                </div>

                {/* Common container info */}
                <div className="text-[11px] pt-1 border-t border-slate-800/80 flex items-center justify-between">
                  <span className="text-slate-400">Target Container:</span>
                  <span className="font-mono text-amber-400/90 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                    {commonParent ? `${commonParent.type.toUpperCase()} (${commonParent.id.slice(0, 6)})` : 'Root Canvas (1000×1000)'}
                  </span>
                </div>

                {/* Selected items chips */}
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                    Selected Items:
                  </span>
                  <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto pr-1">
                    {selectedElements.map((el) => (
                      <div
                        key={el.id}
                        onClick={() => setSelectedIds([el.id])}
                        className="flex items-center gap-1 bg-slate-950 hover:bg-slate-800 border border-slate-700/80 px-2 py-1 rounded-lg text-[10px] cursor-pointer transition-colors"
                        title="Click to isolate this element"
                      >
                        {getElementIcon(el.type)}
                        <span className="font-bold text-slate-300 capitalize">{el.type}</span>
                        <span className="text-slate-500 font-mono text-[9px]">({Math.round(el.x)}, {Math.round(el.y)})</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Centering Tools */}
              <div className="space-y-1.5 p-3 bg-slate-900/60 border border-slate-800/80 rounded-xl">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <AlignCenterHorizontal className="w-3 h-3 text-amber-400" />
                  <span>Container Centering (Bounded)</span>
                </span>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={handleCenterHorizontally}
                    className="py-1.5 px-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-200 text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors"
                    title="Center group horizontally in container"
                  >
                    <AlignCenterHorizontal className="w-3 h-3 text-amber-400" />
                    <span>Center X</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleCenterVertically}
                    className="py-1.5 px-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-200 text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors"
                    title="Center group vertically in container"
                  >
                    <AlignCenterVertical className="w-3 h-3 text-amber-400" />
                    <span>Center Y</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleCenterBoth}
                    className="py-1.5 px-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-200 text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors"
                    title="Center group both horizontally and vertically"
                  >
                    <Box className="w-3 h-3 text-amber-400" />
                    <span>Center Both</span>
                  </button>
                </div>
              </div>

              {/* Relative Alignment Tools */}
              <div className="space-y-1.5 p-3 bg-slate-900/60 border border-slate-800/80 rounded-xl">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <SlidersHorizontal className="w-3 h-3 text-amber-400" />
                  <span>Align Relative to Selection</span>
                </span>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={handleAlignLeft}
                    className="py-1.5 px-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-200 text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors"
                  >
                    <AlignLeft className="w-3 h-3 text-amber-400" />
                    <span>Align Left</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleAlignCenter}
                    className="py-1.5 px-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-200 text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors"
                  >
                    <AlignCenter className="w-3 h-3 text-amber-400" />
                    <span>Align Center</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleAlignRight}
                    className="py-1.5 px-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-200 text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors"
                  >
                    <AlignRight className="w-3 h-3 text-amber-400" />
                    <span>Align Right</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleAlignTop}
                    className="py-1.5 px-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-200 text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors"
                  >
                    <AlignStartVertical className="w-3 h-3 text-amber-400" />
                    <span>Align Top</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleAlignMiddle}
                    className="py-1.5 px-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-200 text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors"
                  >
                    <AlignCenterVertical className="w-3 h-3 text-amber-400" />
                    <span>Align Middle</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleAlignBottom}
                    className="py-1.5 px-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-200 text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors"
                  >
                    <AlignEndVertical className="w-3 h-3 text-amber-400" />
                    <span>Align Bottom</span>
                  </button>
                </div>
              </div>

              {/* Distribution Tools */}
              <div className="space-y-1.5 p-3 bg-slate-900/60 border border-slate-800/80 rounded-xl">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <AlignHorizontalDistributeCenter className="w-3 h-3 text-amber-400" />
                  <span>Distribute Spacing (3+ Items)</span>
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    disabled={selectedElements.length < 3}
                    onClick={handleDistributeHorizontally}
                    className="py-1.5 px-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-200 text-[11px] font-semibold flex items-center justify-center gap-1 disabled:opacity-30 transition-colors"
                  >
                    <AlignHorizontalDistributeCenter className="w-3 h-3 text-amber-400" />
                    <span>Distribute Horizontally</span>
                  </button>
                  <button
                    type="button"
                    disabled={selectedElements.length < 3}
                    onClick={handleDistributeVertically}
                    className="py-1.5 px-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-200 text-[11px] font-semibold flex items-center justify-center gap-1 disabled:opacity-30 transition-colors"
                  >
                    <AlignVerticalDistributeCenter className="w-3 h-3 text-amber-400" />
                    <span>Distribute Vertically</span>
                  </button>
                </div>
              </div>

              {/* Batch Actions (Duplicate / Delete) */}
              <div className="space-y-1.5 p-3 bg-slate-900/60 border border-slate-800/80 rounded-xl">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <Layers className="w-3 h-3 text-amber-400" />
                  <span>Layer Stacking ({selectedElements.length} Items)</span>
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleMoveLayer(selectedIds, 'front')}
                    className="py-1.5 px-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-200 text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors"
                    title="Bring selected elements to the very front"
                  >
                    <ChevronsUp className="w-3 h-3 text-amber-400" />
                    <span>Bring To Front</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMoveLayer(selectedIds, 'forward')}
                    className="py-1.5 px-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-200 text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors"
                    title="Bring selected elements forward 1 step"
                  >
                    <ArrowUp className="w-3 h-3 text-amber-400" />
                    <span>Bring Forward</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMoveLayer(selectedIds, 'backward')}
                    className="py-1.5 px-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-200 text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors"
                    title="Send selected elements backward 1 step"
                  >
                    <ArrowDown className="w-3 h-3 text-amber-400" />
                    <span>Send Backward</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMoveLayer(selectedIds, 'back')}
                    className="py-1.5 px-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-200 text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors"
                    title="Send selected elements to the very back"
                  >
                    <ChevronsDown className="w-3 h-3 text-amber-400" />
                    <span>Send To Back</span>
                  </button>
                </div>
              </div>

              {/* Batch Actions (Duplicate / Delete) */}
              <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={handleDuplicateSelected}
                  className="flex-1 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-xl flex items-center justify-center gap-1.5 font-bold text-slate-200 text-xs transition-colors cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Duplicate ({selectedElements.length})</span>
                </button>
                <button
                  type="button"
                  onClick={handleDeleteSelected}
                  className="flex-1 py-2 bg-rose-950/40 hover:bg-rose-950/80 border border-rose-900/60 rounded-xl flex items-center justify-center gap-1.5 font-bold text-rose-300 text-xs transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete ({selectedElements.length})</span>
                </button>
              </div>
            </div>
          ) : selectedElement ? (
            <div className="space-y-3.5 text-xs">
              {/* Element Header Badge & Hierarchy */}
              <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    {getElementIcon(selectedElement.type)}
                    <span className="font-bold text-slate-100 uppercase tracking-wider">
                      {selectedElement.type}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={(e) => handleToggleVisibility(selectedElement.id, e)}
                      className={`p-1.5 rounded-lg border transition-colors ${
                        selectedElement.visible !== false
                          ? 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
                          : 'bg-rose-950/40 border-rose-900/50 text-rose-400'
                      }`}
                      title={selectedElement.visible !== false ? 'Hide Element' : 'Show Element'}
                    >
                      {selectedElement.visible !== false ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDuplicateElement(selectedElement.id)}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition-colors"
                      title="Duplicate"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteElement(selectedElement.id)}
                      className="p-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-950/80 border border-rose-900/60 text-rose-400 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* ID and Parent Info */}
                <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-800/80">
                  <span className="text-slate-500 font-medium">ID:</span>
                  <span className="font-mono text-slate-400 text-[10px] truncate max-w-[170px]">
                    {selectedElement.id}
                  </span>
                </div>

                {/* Parent Container & Reparenting Controls */}
                <div className="pt-2 border-t border-slate-800/80 space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400 font-medium">Location:</span>
                    {selectedParentElement ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setSelectedId(selectedParentElement.id)}
                          className="font-mono text-blue-400 text-[11px] hover:underline flex items-center gap-1 bg-blue-950/40 px-2 py-0.5 rounded border border-blue-900/50"
                          title="Select Parent Container"
                        >
                          <Square className="w-2.5 h-2.5" />
                          <span>{selectedParentElement.type === 'card' ? 'Card' : 'Group'} ({selectedParentElement.id.slice(0, 6)})</span>
                        </button>
                      </div>
                    ) : (
                      <span className="text-slate-400 text-[11px] bg-slate-800/80 px-2 py-0.5 rounded font-mono">
                        Root Canvas (1000×1000)
                      </span>
                    )}
                  </div>

                  {/* Move to Container / Move to Root actions */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Hierarchy Placement
                      </span>
                      {selectedParentElement && (
                        <button
                          type="button"
                          onClick={() => handleReparentElement(selectedElement.id, 'root')}
                          className="text-[10px] text-amber-400 hover:text-amber-300 flex items-center gap-1 hover:underline"
                          title="Convert to Root element (maintains visual position)"
                        >
                          <LogOut className="w-3 h-3" />
                          <span>Move to Root Canvas</span>
                        </button>
                      )}
                    </div>

                    {/* Move into another container selector */}
                    {(() => {
                      const available = getAvailableContainers(selectedElement.id, elements);
                      if (available.length === 0 && !selectedParentElement) return null;
                      return (
                        <div className="flex items-center gap-1.5 mt-1">
                          <CornerDownRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          <select
                            value={selectedParentElement ? selectedParentElement.id : 'root'}
                            onChange={(e) => handleReparentElement(selectedElement.id, e.target.value)}
                            className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-slate-200 text-xs truncate"
                          >
                            <option value="root">Root Canvas</option>
                            {available.map((c) => (
                              <option key={c.id} value={c.id}>
                                Move into: {c.type === 'card' ? 'Card' : 'Group'} ({c.id.slice(0, 8)})
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Layer Z-Ordering */}
                  <div className="flex items-center justify-between pt-1 border-t border-slate-800/60">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Layer Order
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleMoveLayer(selectedElement.id, 'front')}
                        className="px-1.5 py-1 bg-slate-800 hover:bg-slate-700 rounded text-slate-200 text-[10px] font-medium flex items-center gap-0.5 transition-colors"
                        title="Bring To Front"
                      >
                        <ChevronsUp className="w-3 h-3 text-amber-400" />
                        <span className="hidden sm:inline">Front</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveLayer(selectedElement.id, 'forward')}
                        className="px-1.5 py-1 bg-slate-800 hover:bg-slate-700 rounded text-slate-200 text-[10px] font-medium flex items-center gap-0.5 transition-colors"
                        title="Bring Forward (1 step)"
                      >
                        <ArrowUp className="w-3 h-3 text-amber-400" />
                        <span className="hidden sm:inline">Forward</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveLayer(selectedElement.id, 'backward')}
                        className="px-1.5 py-1 bg-slate-800 hover:bg-slate-700 rounded text-slate-200 text-[10px] font-medium flex items-center gap-0.5 transition-colors"
                        title="Send Backward (1 step)"
                      >
                        <ArrowDown className="w-3 h-3 text-amber-400" />
                        <span className="hidden sm:inline">Backward</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveLayer(selectedElement.id, 'back')}
                        className="px-1.5 py-1 bg-slate-800 hover:bg-slate-700 rounded text-slate-200 text-[10px] font-medium flex items-center gap-0.5 transition-colors"
                        title="Send To Back"
                      >
                        <ChevronsDown className="w-3 h-3 text-amber-400" />
                        <span className="hidden sm:inline">Back</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Container Children Manager (if selected element is a Card or Group) */}
              {(selectedElement.type === 'card' || selectedElement.type === 'group') && (() => {
                const containerEl = selectedElement as ResultCardElement | ResultGroupElement;
                const children = containerEl.children || [];
                return (
                  <div className="p-3 bg-slate-900/90 border border-blue-900/40 rounded-xl space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <FolderTree className="w-3.5 h-3.5 text-blue-400" />
                        <span className="text-[11px] font-bold text-blue-300 uppercase tracking-wider">
                          Container Children ({children.length})
                        </span>
                      </div>
                      <div className="relative">
                        <select
                          value=""
                          onChange={(e) => {
                            if (e.target.value) {
                              handleAddChildElement(containerEl.id, e.target.value as ResultScreenElementType);
                            }
                          }}
                          className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-[11px] px-2 py-1 rounded-lg transition-colors cursor-pointer"
                        >
                          <option value="" disabled>
                            + Add Child Element
                          </option>
                          <option value="text">Text Block</option>
                          <option value="score">Score Display</option>
                          <option value="moves">Moves Counter</option>
                          <option value="pairs">Pairs Counter</option>
                          <option value="time">Time Elapsed</option>
                          <option value="accuracy">Accuracy Stat</option>
                          <option value="image">Image Box</option>
                          <option value="button">Button</option>
                          <option value="leaderboard">Leaderboard</option>
                          <option value="group">Group Wrapper</option>
                        </select>
                      </div>
                    </div>

                    {children.length === 0 ? (
                      <div className="p-3 text-center text-slate-500 text-[11px] bg-slate-950/60 rounded-lg border border-slate-800/80">
                        This container has no child elements. Add child elements above or move elements from the layer tree.
                      </div>
                    ) : (
                      <div className="space-y-1 max-h-44 overflow-y-auto pr-1">
                        {children.map((child, idx) => (
                          <div
                            key={child.id}
                            onClick={() => setSelectedId(child.id)}
                            className="flex items-center justify-between p-1.5 bg-slate-950/80 hover:bg-slate-800 rounded-lg border border-slate-800 text-[11px] cursor-pointer group"
                          >
                            <div className="flex items-center gap-1.5 truncate">
                              <span className="text-slate-500 font-mono text-[9px]">{idx + 1}.</span>
                              {getElementIcon(child.type)}
                              <span className="text-slate-200 truncate max-w-[120px]">
                                {child.type === 'text'
                                  ? `"${(child as ResultTextElement).text || 'Text'}"`
                                  : child.type === 'button'
                                  ? `Btn: ${(child as ResultButtonElement).text || 'Action'}`
                                  : child.type === 'leaderboard'
                                  ? (child as ResultLeaderboardElement).headerText || 'Leaderboard'
                                  : `${child.type.charAt(0).toUpperCase() + child.type.slice(1)}`}
                              </span>
                            </div>

                            <div className="flex items-center gap-0.5">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMoveLayer(child.id, 'front');
                                }}
                                className="p-0.5 rounded text-slate-500 hover:text-amber-300"
                                title="Bring To Front"
                              >
                                <ChevronsUp className="w-2.5 h-2.5" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMoveLayer(child.id, 'forward');
                                }}
                                className="p-0.5 rounded text-slate-500 hover:text-slate-200"
                                title="Bring Forward"
                              >
                                <ArrowUp className="w-2.5 h-2.5" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMoveLayer(child.id, 'backward');
                                }}
                                className="p-0.5 rounded text-slate-500 hover:text-slate-200"
                                title="Send Backward"
                              >
                                <ArrowDown className="w-2.5 h-2.5" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMoveLayer(child.id, 'back');
                                }}
                                className="p-0.5 rounded text-slate-500 hover:text-amber-300"
                                title="Send To Back"
                              >
                                <ChevronsDown className="w-2.5 h-2.5" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleReparentElement(child.id, 'root');
                                }}
                                className="p-0.5 rounded text-amber-500/70 hover:text-amber-400"
                                title="Move out to Root"
                              >
                                <LogOut className="w-2.5 h-2.5" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteElement(child.id);
                                }}
                                className="p-0.5 rounded text-rose-500/70 hover:text-rose-400"
                                title="Delete"
                              >
                                <Trash2 className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Complete Alignment & Centering Tools */}
              <div className="space-y-2 p-3 bg-slate-900/60 border border-slate-800/80 rounded-xl">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <SlidersHorizontal className="w-3 h-3 text-amber-400" />
                  <span>Alignment & Centering</span>
                </span>

                {/* Centering buttons */}
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={handleCenterHorizontally}
                    className="py-1.5 px-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-200 text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors"
                    title="Center element horizontally in parent container"
                  >
                    <AlignCenterHorizontal className="w-3 h-3 text-amber-400" />
                    <span>Center X</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleCenterVertically}
                    className="py-1.5 px-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-200 text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors"
                    title="Center element vertically in parent container"
                  >
                    <AlignCenterVertical className="w-3 h-3 text-amber-400" />
                    <span>Center Y</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleCenterBoth}
                    className="py-1.5 px-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-200 text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors"
                    title="Center element horizontally & vertically"
                  >
                    <Box className="w-3 h-3 text-amber-400" />
                    <span>Both</span>
                  </button>
                </div>

                {/* Edge alignment buttons */}
                <div className="grid grid-cols-3 gap-1.5 pt-1 border-t border-slate-800/60">
                  <button
                    type="button"
                    onClick={handleAlignLeft}
                    className="py-1 px-1.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded text-slate-300 text-[10px] font-medium flex items-center justify-center gap-1 transition-colors"
                    title="Snap to Left Edge"
                  >
                    <AlignLeft className="w-2.5 h-2.5" />
                    <span>Left</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleAlignCenter}
                    className="py-1 px-1.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded text-slate-300 text-[10px] font-medium flex items-center justify-center gap-1 transition-colors"
                    title="Center Horizontally"
                  >
                    <AlignCenter className="w-2.5 h-2.5" />
                    <span>Center</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleAlignRight}
                    className="py-1 px-1.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded text-slate-300 text-[10px] font-medium flex items-center justify-center gap-1 transition-colors"
                    title="Snap to Right Edge"
                  >
                    <AlignRight className="w-2.5 h-2.5" />
                    <span>Right</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleAlignTop}
                    className="py-1 px-1.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded text-slate-300 text-[10px] font-medium flex items-center justify-center gap-1 transition-colors"
                    title="Snap to Top Edge"
                  >
                    <AlignStartVertical className="w-2.5 h-2.5" />
                    <span>Top</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleAlignMiddle}
                    className="py-1 px-1.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded text-slate-300 text-[10px] font-medium flex items-center justify-center gap-1 transition-colors"
                    title="Center Vertically"
                  >
                    <AlignCenterVertical className="w-2.5 h-2.5" />
                    <span>Middle</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleAlignBottom}
                    className="py-1 px-1.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded text-slate-300 text-[10px] font-medium flex items-center justify-center gap-1 transition-colors"
                    title="Snap to Bottom Edge"
                  >
                    <AlignEndVertical className="w-2.5 h-2.5" />
                    <span>Bottom</span>
                  </button>
                </div>
              </div>

              {/* Logical 1000x1000 Geometry & Dimensions */}
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <Move className="w-3 h-3 text-amber-400" />
                  <span>Geometry (1000×1000 Units)</span>
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-2">
                    <span className="text-[10px] font-bold text-slate-500 block">POS X</span>
                    <input
                      type="number"
                      value={selectedElement.x}
                      onChange={(e) => {
                        const val = Math.round(Number(e.target.value));
                        updateElementById(selectedElement.id, (prev) => ({ ...prev, x: val }));
                      }}
                      className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-100 font-mono text-xs mt-1"
                    />
                  </div>
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-2">
                    <span className="text-[10px] font-bold text-slate-500 block">POS Y</span>
                    <input
                      type="number"
                      value={selectedElement.y}
                      onChange={(e) => {
                        const val = Math.round(Number(e.target.value));
                        updateElementById(selectedElement.id, (prev) => ({ ...prev, y: val }));
                      }}
                      className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-100 font-mono text-xs mt-1"
                    />
                  </div>
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-2">
                    <span className="text-[10px] font-bold text-slate-500 block">WIDTH</span>
                    <input
                      type="number"
                      min={10}
                      value={selectedElement.width}
                      onChange={(e) => {
                        const val = Math.max(10, Math.round(Number(e.target.value)));
                        updateElementById(selectedElement.id, (prev) => ({ ...prev, width: val }));
                      }}
                      className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-100 font-mono text-xs mt-1"
                    />
                  </div>
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-2">
                    <span className="text-[10px] font-bold text-slate-500 block">HEIGHT</span>
                    <input
                      type="number"
                      min={10}
                      value={selectedElement.height}
                      onChange={(e) => {
                        const val = Math.max(10, Math.round(Number(e.target.value)));
                        updateElementById(selectedElement.id, (prev) => ({ ...prev, height: val }));
                      }}
                      className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-100 font-mono text-xs mt-1"
                    />
                  </div>
                </div>
              </div>

              {/* Transform: Rotation, Opacity, Z-Index */}
              <div className="space-y-2.5 bg-slate-900/60 border border-slate-800/80 rounded-xl p-3">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Transform & Layering
                </span>

                {/* Rotation */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-400">Rotation</span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs text-amber-400 font-bold">
                        {selectedElement.rotation ?? 0}°
                      </span>
                      {Boolean(selectedElement.rotation) && (
                        <button
                          type="button"
                          onClick={() => updateElementById(selectedElement.id, (p) => ({ ...p, rotation: 0 }))}
                          className="text-[10px] text-slate-500 hover:text-slate-300 underline"
                        >
                          reset
                        </button>
                      )}
                    </div>
                  </div>
                  <input
                    type="range"
                    min="-180"
                    max="180"
                    step="1"
                    value={selectedElement.rotation ?? 0}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      updateElementById(selectedElement.id, (prev) => ({ ...prev, rotation: val }));
                    }}
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                </div>

                {/* Opacity */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-400">Opacity</span>
                    <span className="font-mono text-xs text-slate-300 font-bold">
                      {Math.round((selectedElement.opacity ?? 1) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={selectedElement.opacity ?? 1}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      updateElementById(selectedElement.id, (prev) => ({ ...prev, opacity: val }));
                    }}
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                </div>

                {/* Z-Index & Visibility */}
                <div className="space-y-2 pt-1 border-t border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                      Layer Position
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleMoveLayer(selectedElement.id, 'front')}
                        className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-amber-400 transition-colors"
                        title="Bring To Front"
                      >
                        <ChevronsUp className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveLayer(selectedElement.id, 'forward')}
                        className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-amber-400 transition-colors"
                        title="Bring Forward (1 step)"
                      >
                        <ArrowUp className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveLayer(selectedElement.id, 'backward')}
                        className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-amber-400 transition-colors"
                        title="Send Backward (1 step)"
                      >
                        <ArrowDown className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveLayer(selectedElement.id, 'back')}
                        className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-amber-400 transition-colors"
                        title="Send To Back"
                      >
                        <ChevronsDown className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[10px] text-slate-500 block mb-1">Z-Index (1 - N)</span>
                      <input
                        type="number"
                        min={1}
                        value={selectedElement.zIndex ?? 1}
                        onChange={(e) => {
                          const val = Math.max(1, Math.round(Number(e.target.value)));
                          handleUpdateZIndex(selectedElement.id, val);
                        }}
                        className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-100 font-mono text-xs"
                      />
                    </div>
                    <div className="flex flex-col justify-end">
                      <button
                        type="button"
                        onClick={(e) => handleToggleVisibility(selectedElement.id, e)}
                        className={`w-full py-1.5 px-2 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                          selectedElement.visible !== false
                            ? 'bg-slate-900 border-slate-700 text-slate-200'
                            : 'bg-rose-950/40 border-rose-900/60 text-rose-400'
                        }`}
                      >
                        {selectedElement.visible !== false ? (
                          <>
                            <Eye className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Visible</span>
                          </>
                        ) : (
                          <>
                            <EyeOff className="w-3.5 h-3.5" />
                            <span>Hidden</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Type-Specific Style & Properties */}

              {/* 1. CARD ELEMENT */}
              {selectedElement.type === 'card' && (() => {
                const cardEl = selectedElement as ResultCardElement;
                const cardStyle = cardEl.style || {};
                return (
                  <div className="space-y-3.5 bg-slate-900/80 border border-slate-800 rounded-xl p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider block">
                        Card Container Styling
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {(cardEl.children || []).length} children
                      </span>
                    </div>

                    {/* Background Color & Presets */}
                    <div className="space-y-1.5">
                      <span className="text-[11px] text-slate-400 block font-medium">Background Color</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={cardStyle.backgroundColor?.startsWith('#') ? cardStyle.backgroundColor : '#0f172a'}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateElementById(selectedElement.id, (prev) => ({
                              ...prev,
                              style: { ...(prev as ResultCardElement).style, backgroundColor: val },
                            } as ResultScreenElement));
                          }}
                          className="w-8 h-8 rounded border border-slate-700 cursor-pointer bg-transparent"
                        />
                        <input
                          type="text"
                          value={cardStyle.backgroundColor || ''}
                          placeholder="e.g. rgba(15, 23, 42, 0.95)"
                          onChange={(e) => {
                            const val = e.target.value;
                            updateElementById(selectedElement.id, (prev) => ({
                              ...prev,
                              style: { ...(prev as ResultCardElement).style, backgroundColor: val },
                            } as ResultScreenElement));
                          }}
                          className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-200 text-xs font-mono"
                        />
                      </div>

                      {/* Quick Color Presets */}
                      <div className="flex items-center gap-1.5 pt-0.5">
                        <span className="text-[10px] text-slate-400">Presets:</span>
                        {[
                          { name: 'Obsidian', color: 'rgba(15, 23, 42, 0.95)' },
                          { name: 'Dark Glass', color: 'rgba(2, 6, 23, 0.85)' },
                          { name: 'Midnight', color: 'rgba(10, 15, 30, 0.92)' },
                          { name: 'Deep Indigo', color: 'rgba(30, 27, 75, 0.9)' },
                          { name: 'Charcoal', color: 'rgba(24, 24, 27, 0.95)' },
                          { name: 'Clean White', color: 'rgba(255, 255, 255, 0.95)' },
                        ].map((preset) => (
                          <button
                            key={preset.name}
                            type="button"
                            onClick={() => {
                              updateElementById(selectedElement.id, (prev) => ({
                                ...prev,
                                style: { ...(prev as ResultCardElement).style, backgroundColor: preset.color },
                              } as ResultScreenElement));
                            }}
                            title={preset.name}
                            className="w-4 h-4 rounded-full border border-slate-600 hover:scale-110 transition-transform"
                            style={{ backgroundColor: preset.color }}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Background Image & Upload */}
                    <div className="space-y-1.5">
                      <span className="text-[11px] text-slate-400 block font-medium">Background Image</span>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={cardStyle.backgroundImageUrl || ''}
                          placeholder="https://... (Image URL)"
                          onChange={(e) => {
                            const val = e.target.value;
                            updateElementById(selectedElement.id, (prev) => ({
                              ...prev,
                              style: { ...(prev as ResultCardElement).style, backgroundImageUrl: val || undefined },
                            } as ResultScreenElement));
                          }}
                          className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-slate-200 text-xs font-mono"
                        />
                        {cardStyle.backgroundImageUrl && (
                          <button
                            type="button"
                            onClick={() => {
                              updateElementById(selectedElement.id, (prev) => ({
                                ...prev,
                                style: { ...(prev as ResultCardElement).style, backgroundImageUrl: undefined },
                              } as ResultScreenElement));
                            }}
                            className="p-1.5 bg-rose-950/60 hover:bg-rose-900 border border-rose-800 text-rose-300 rounded-lg transition-colors"
                            title="Remove Background Image"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {onUploadAsset && (
                          <button
                            type="button"
                            onClick={() => {
                              setUploadTarget({ elementId: selectedElement.id, field: 'cardBg' });
                              fileInputRef.current?.click();
                            }}
                            disabled={isUploadingAsset}
                            className="p-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg transition-colors"
                            title="Upload Image to Card Background"
                          >
                            {isUploadingAsset ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </div>

                      {/* Background Size & Position & Repeat */}
                      {cardStyle.backgroundImageUrl && (
                        <div className="grid grid-cols-3 gap-1.5 pt-1">
                          <div>
                            <span className="text-[10px] text-slate-400 block">Fit / Size</span>
                            <select
                              value={cardStyle.backgroundSize || 'cover'}
                              onChange={(e) => {
                                const val = e.target.value as 'cover' | 'contain' | 'auto';
                                updateElementById(selectedElement.id, (prev) => ({
                                  ...prev,
                                  style: { ...(prev as ResultCardElement).style, backgroundSize: val },
                                }));
                              }}
                              className="w-full bg-slate-950 border border-slate-700 rounded px-1.5 py-1 text-slate-200 text-[11px] mt-0.5"
                            >
                              <option value="cover">Cover (Fill)</option>
                              <option value="contain">Contain</option>
                              <option value="auto">Auto (1:1)</option>
                            </select>
                          </div>

                          <div>
                            <span className="text-[10px] text-slate-400 block">Position</span>
                            <select
                              value={cardStyle.backgroundPosition || 'center'}
                              onChange={(e) => {
                                const val = e.target.value;
                                updateElementById(selectedElement.id, (prev) => ({
                                  ...prev,
                                  style: { ...(prev as ResultCardElement).style, backgroundPosition: val },
                                }));
                              }}
                              className="w-full bg-slate-950 border border-slate-700 rounded px-1.5 py-1 text-slate-200 text-[11px] mt-0.5"
                            >
                              <option value="center">Center</option>
                              <option value="top">Top</option>
                              <option value="bottom">Bottom</option>
                              <option value="left">Left</option>
                              <option value="right">Right</option>
                            </select>
                          </div>

                          <div>
                            <span className="text-[10px] text-slate-400 block">Repeat</span>
                            <select
                              value={cardStyle.backgroundRepeat || 'no-repeat'}
                              onChange={(e) => {
                                const val = e.target.value as 'no-repeat' | 'repeat' | 'repeat-x' | 'repeat-y';
                                updateElementById(selectedElement.id, (prev) => ({
                                  ...prev,
                                  style: { ...(prev as ResultCardElement).style, backgroundRepeat: val },
                                }));
                              }}
                              className="w-full bg-slate-950 border border-slate-700 rounded px-1.5 py-1 text-slate-200 text-[11px] mt-0.5"
                            >
                              <option value="no-repeat">No Repeat</option>
                              <option value="repeat">Repeat (Tile)</option>
                              <option value="repeat-x">Repeat X</option>
                              <option value="repeat-y">Repeat Y</option>
                            </select>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Border & Radius */}
                    <div className="space-y-1.5">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-[11px] text-slate-400 block font-medium">Border Width (px)</span>
                          <input
                            type="number"
                            min={0}
                            value={cardStyle.borderWidth ?? 1}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              updateElementById(selectedElement.id, (prev) => ({
                                ...prev,
                                style: { ...(prev as ResultCardElement).style, borderWidth: val },
                              } as ResultScreenElement));
                            }}
                            className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-100 font-mono text-xs mt-1"
                          />
                        </div>
                        <div>
                          <span className="text-[11px] text-slate-400 block font-medium">Border Radius (px)</span>
                          <input
                            type="number"
                            min={0}
                            value={cardStyle.borderRadius ?? 24}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              updateElementById(selectedElement.id, (prev) => ({
                                ...prev,
                                style: { ...(prev as ResultCardElement).style, borderRadius: val },
                              } as ResultScreenElement));
                            }}
                            className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-100 font-mono text-xs mt-1"
                          />
                        </div>
                      </div>

                      {/* Border Radius Presets */}
                      <div className="flex items-center gap-1.5 pt-0.5">
                        <span className="text-[10px] text-slate-400">Radius:</span>
                        {[
                          { label: '0px', val: 0 },
                          { label: '12px', val: 12 },
                          { label: '24px', val: 24 },
                          { label: '36px', val: 36 },
                          { label: '48px', val: 48 },
                        ].map((r) => (
                          <button
                            key={r.label}
                            type="button"
                            onClick={() => {
                              updateElementById(selectedElement.id, (prev) => ({
                                ...prev,
                                style: { ...(prev as ResultCardElement).style, borderRadius: r.val },
                              } as ResultScreenElement));
                            }}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono border transition-colors ${
                              (cardStyle.borderRadius ?? 24) === r.val
                                ? 'bg-blue-600 border-blue-500 text-white'
                                : 'bg-slate-950 border-slate-700 text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            {r.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Border Color */}
                    <div className="space-y-1">
                      <span className="text-[11px] text-slate-400 block font-medium">Border Color</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={cardStyle.borderColor?.startsWith('#') ? cardStyle.borderColor : '#334155'}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateElementById(selectedElement.id, (prev) => ({
                              ...prev,
                              style: { ...(prev as ResultCardElement).style, borderColor: val },
                            } as ResultScreenElement));
                          }}
                          className="w-7 h-7 rounded border border-slate-700 cursor-pointer bg-transparent"
                        />
                        <input
                          type="text"
                          value={cardStyle.borderColor || '#334155'}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateElementById(selectedElement.id, (prev) => ({
                              ...prev,
                              style: { ...(prev as ResultCardElement).style, borderColor: val },
                            } as ResultScreenElement));
                          }}
                          className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-200 text-xs font-mono"
                        />
                      </div>
                    </div>

                    {/* Drop Shadow Toggle & Clipping Note */}
                    <div className="pt-1 border-t border-slate-800 space-y-1.5">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={cardStyle.shadow !== false}
                          onChange={(e) => {
                            const val = e.target.checked;
                            updateElementById(selectedElement.id, (prev) => ({
                              ...prev,
                              style: { ...(prev as ResultCardElement).style, shadow: val },
                            } as ResultScreenElement));
                          }}
                          className="rounded border-slate-700 text-amber-500 accent-amber-500"
                        />
                        <span className="text-slate-300 text-xs font-medium">Enable Soft Drop Shadow</span>
                      </label>
                      <span className="text-[10px] text-slate-500 block leading-tight">
                        Background images and nested elements are automatically clipped to rounded corners.
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* 2. IMAGE ELEMENT */}
              {selectedElement.type === 'image' && (() => {
                const imgEl = selectedElement as ResultImageElement;
                const imgStyle = imgEl.style || {};
                const currentFit = imgStyle.objectFit || imgEl.objectFit || 'contain';
                const currentPos = imgStyle.objectPosition || imgEl.objectPosition || 'center';

                // Curated game & theme assets library presets for instant selection
                const PRESET_IMAGE_ASSETS = [
                  { label: 'Theme Background', url: '/assets/themes/carnival/background.png', category: 'Carnival' },
                  { label: 'Carnival Cart / Basket', url: '/assets/themes/carnival/basket.png', category: 'Carnival' },
                  { label: 'Golden Ticket Item', url: '/assets/themes/carnival/item_normal_01.png', category: 'Carnival' },
                  { label: 'Cursed Mask Item', url: '/assets/themes/carnival/item_hazard_01.png', category: 'Carnival' },
                  { label: 'Bonus Star Item', url: '/assets/themes/carnival/item_bonus_01.png', category: 'Carnival' },
                  { label: 'Green Durian Badge', url: '/assets/durian_green.png', category: 'Durian' },
                  { label: 'Brown Durian Badge', url: '/assets/durian_brown.png', category: 'Durian' },
                  { label: 'Studio Logo', url: '/logo.png', category: 'Branding' },
                  { label: 'Default Background', url: '/assets/background.png', category: 'General' },
                ];

                const POSITION_ANCHOR_GRID = [
                  { label: 'TL', value: 'top left', title: 'Top Left' },
                  { label: 'T', value: 'top center', title: 'Top Center' },
                  { label: 'TR', value: 'top right', title: 'Top Right' },
                  { label: 'L', value: 'center left', title: 'Center Left' },
                  { label: 'C', value: 'center', title: 'Center' },
                  { label: 'R', value: 'center right', title: 'Center Right' },
                  { label: 'BL', value: 'bottom left', title: 'Bottom Left' },
                  { label: 'B', value: 'bottom center', title: 'Bottom Center' },
                  { label: 'BR', value: 'bottom right', title: 'Bottom Right' },
                ];

                const isAnchorActive = (anchorVal: string) => {
                  const normalizedCurrent = (currentPos || '').toLowerCase().trim();
                  if (anchorVal === 'center' && (normalizedCurrent === 'center' || normalizedCurrent === '50% 50%' || normalizedCurrent === 'center center')) return true;
                  if (anchorVal === 'top left' && (normalizedCurrent === 'top left' || normalizedCurrent === '0% 0%' || normalizedCurrent === 'left top')) return true;
                  if (anchorVal === 'top center' && (normalizedCurrent === 'top center' || normalizedCurrent === 'top' || normalizedCurrent === '50% 0%')) return true;
                  if (anchorVal === 'top right' && (normalizedCurrent === 'top right' || normalizedCurrent === '100% 0%' || normalizedCurrent === 'right top')) return true;
                  if (anchorVal === 'center left' && (normalizedCurrent === 'center left' || normalizedCurrent === 'left' || normalizedCurrent === '0% 50%')) return true;
                  if (anchorVal === 'center right' && (normalizedCurrent === 'center right' || normalizedCurrent === 'right' || normalizedCurrent === '100% 50%')) return true;
                  if (anchorVal === 'bottom left' && (normalizedCurrent === 'bottom left' || normalizedCurrent === '0% 100%' || normalizedCurrent === 'left bottom')) return true;
                  if (anchorVal === 'bottom center' && (normalizedCurrent === 'bottom center' || normalizedCurrent === 'bottom' || normalizedCurrent === '50% 100%')) return true;
                  if (anchorVal === 'bottom right' && (normalizedCurrent === 'bottom right' || normalizedCurrent === '100% 100%' || normalizedCurrent === 'right bottom')) return true;
                  return normalizedCurrent === anchorVal;
                };

                return (
                  <div className="space-y-3.5 bg-slate-900/80 border border-slate-800 rounded-xl p-3.5">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                        <ImageIcon className="w-3.5 h-3.5" />
                        <span>Image Asset & Position Controls</span>
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {imgEl.width}×{imgEl.height} px
                      </span>
                    </div>

                    {/* Image Preview & Asset Management */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-slate-300">Asset Source</span>
                        {imgEl.imageUrl ? (
                          <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/30">
                            Asset Loaded
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/30">
                            No Asset
                          </span>
                        )}
                      </div>

                      {/* Image Preview Thumbnail */}
                      <div className="relative w-full h-24 bg-slate-950/80 rounded-xl border border-slate-800 overflow-hidden flex items-center justify-center p-2 group">
                        {imgEl.imageUrl ? (
                          <img
                            src={imgEl.imageUrl}
                            alt=""
                            className="max-h-full max-w-full rounded object-contain transition-transform group-hover:scale-105"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="text-center space-y-1">
                            <ImageIcon className="w-6 h-6 text-slate-600 mx-auto" />
                            <span className="text-[11px] text-slate-500 block">No image selected</span>
                          </div>
                        )}
                        {imgEl.imageUrl && (
                          <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-slate-950/80 p-1 rounded-lg border border-slate-700">
                            <button
                              type="button"
                              onClick={() => {
                                updateElementById(selectedElement.id, (prev) => ({
                                  ...prev,
                                  imageUrl: null,
                                } as ResultScreenElement));
                              }}
                              className="p-1 text-rose-400 hover:bg-rose-950/50 rounded transition-colors"
                              title="Remove Image"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* URL Input & Quick Actions */}
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={imgEl.imageUrl || ''}
                          placeholder="https://... or /assets/..."
                          onChange={(e) => {
                            const val = e.target.value;
                            updateElementById(selectedElement.id, (prev) => ({
                              ...prev,
                              imageUrl: val || null,
                            } as ResultScreenElement));
                          }}
                          className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 text-xs font-mono placeholder:text-slate-600"
                        />
                        {imgEl.imageUrl && (
                          <button
                            type="button"
                            onClick={() => {
                              updateElementById(selectedElement.id, (prev) => ({
                                ...prev,
                                imageUrl: null,
                              } as ResultScreenElement));
                            }}
                            className="p-1.5 bg-rose-950/60 hover:bg-rose-900 border border-rose-800 text-rose-300 rounded-lg transition-colors shrink-0"
                            title="Remove Image"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                        {onUploadAsset && (
                          <button
                            type="button"
                            onClick={() => {
                              setUploadTarget({ elementId: selectedElement.id, field: 'imageUrl' });
                              fileInputRef.current?.click();
                            }}
                            disabled={isUploadingAsset}
                            className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-emerald-600/20 flex items-center gap-1.5 shrink-0"
                            title={imgEl.imageUrl ? 'Replace Image' : 'Upload Image'}
                          >
                            {isUploadingAsset ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Upload className="w-3.5 h-3.5" />
                            )}
                            <span>{imgEl.imageUrl ? 'Replace' : 'Upload'}</span>
                          </button>
                        )}
                      </div>

                      {/* Preset Game / Theme Asset Library */}
                      <div className="space-y-1.5 pt-1">
                        <span className="text-[10px] text-slate-400 font-semibold block uppercase tracking-wider">
                          Select from Built-in Assets:
                        </span>
                        <div className="grid grid-cols-3 gap-1.5 max-h-36 overflow-y-auto pr-1">
                          {PRESET_IMAGE_ASSETS.map((preset) => (
                            <button
                              key={preset.url}
                              type="button"
                              onClick={() => {
                                updateElementById(selectedElement.id, (prev) => ({
                                  ...prev,
                                  imageUrl: preset.url,
                                } as ResultScreenElement));
                              }}
                              className={`p-1.5 rounded-lg border text-left flex flex-col items-center gap-1 transition-all ${
                                imgEl.imageUrl === preset.url
                                  ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 shadow-sm'
                                  : 'bg-slate-950/70 border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              <div className="w-8 h-8 rounded bg-slate-900 flex items-center justify-center overflow-hidden border border-slate-800/80">
                                <img
                                  src={preset.url}
                                  alt={preset.label}
                                  className="w-full h-full object-contain"
                                  referrerPolicy="no-referrer"
                                />
                              </div>
                              <span className="text-[9px] font-medium truncate w-full text-center leading-tight">
                                {preset.label}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Object Fit Controls */}
                    <div className="space-y-2 pt-2 border-t border-slate-800">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-slate-300">Object Fit Mode</span>
                        <span className="text-[10px] font-mono text-emerald-400 capitalize">{currentFit}</span>
                      </div>
                      <div className="grid grid-cols-5 gap-1">
                        {[
                          { id: 'contain', label: 'Contain', desc: 'Preserve aspect ratio, fit within bounds' },
                          { id: 'cover', label: 'Cover', desc: 'Fill container completely, crop overflow' },
                          { id: 'fill', label: 'Fill', desc: 'Stretch to exact element width and height' },
                          { id: 'none', label: 'None', desc: 'Natural size without scaling' },
                          { id: 'scale-down', label: 'Scale', desc: 'Downscale if larger, else original' },
                        ].map((fit) => (
                          <button
                            key={fit.id}
                            type="button"
                            onClick={() => {
                              updateElementById(selectedElement.id, (prev) => ({
                                ...prev,
                                objectFit: fit.id as any,
                                style: { ...(prev as ResultImageElement).style, objectFit: fit.id as any },
                              } as ResultScreenElement));
                            }}
                            title={fit.desc}
                            className={`py-1.5 px-1 rounded-lg text-[10px] font-bold uppercase truncate border transition-all text-center ${
                              currentFit === fit.id
                                ? 'bg-emerald-500/25 text-emerald-300 border-emerald-500/50 shadow-sm'
                                : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-slate-200'
                            }`}
                          >
                            {fit.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Object Position Controls (9-Point Anchor Grid + Custom) */}
                    <div className="space-y-2 pt-2 border-t border-slate-800">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-slate-300">Object Position Alignment</span>
                        <span className="text-[10px] font-mono text-emerald-400">{currentPos}</span>
                      </div>

                      <div className="grid grid-cols-2 gap-3 items-center">
                        {/* 9-Point Visual Anchor Grid */}
                        <div className="bg-slate-950 p-1.5 rounded-xl border border-slate-800">
                          <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block text-center mb-1">
                            9-Point Anchor Grid
                          </span>
                          <div className="grid grid-cols-3 gap-1">
                            {POSITION_ANCHOR_GRID.map((anchor) => {
                              const active = isAnchorActive(anchor.value);
                              return (
                                <button
                                  key={anchor.value}
                                  type="button"
                                  onClick={() => {
                                    updateElementById(selectedElement.id, (prev) => ({
                                      ...prev,
                                      objectPosition: anchor.value,
                                      style: { ...(prev as ResultImageElement).style, objectPosition: anchor.value },
                                    } as ResultScreenElement));
                                  }}
                                  title={anchor.title}
                                  className={`py-1 rounded text-[10px] font-mono font-bold transition-all border ${
                                    active
                                      ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-sm scale-105'
                                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-slate-200'
                                  }`}
                                >
                                  {anchor.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Dropdown & Custom Position Input */}
                        <div className="space-y-2">
                          <div>
                            <span className="text-[10px] text-slate-400 block mb-0.5">Preset Anchor</span>
                            <select
                              value={currentPos}
                              onChange={(e) => {
                                const val = e.target.value;
                                updateElementById(selectedElement.id, (prev) => ({
                                  ...prev,
                                  objectPosition: val,
                                  style: { ...(prev as ResultImageElement).style, objectPosition: val },
                                } as ResultScreenElement));
                              }}
                              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-200 text-xs font-mono"
                            >
                              <option value="center">Center</option>
                              <option value="top">Top</option>
                              <option value="bottom">Bottom</option>
                              <option value="left">Left</option>
                              <option value="right">Right</option>
                              <option value="top left">Top Left</option>
                              <option value="top right">Top Right</option>
                              <option value="bottom left">Bottom Left</option>
                              <option value="bottom right">Bottom Right</option>
                            </select>
                          </div>

                          <div>
                            <span className="text-[10px] text-slate-400 block mb-0.5">Custom (e.g. 50% 50%)</span>
                            <input
                              type="text"
                              value={currentPos}
                              placeholder="50% 50%"
                              onChange={(e) => {
                                const val = e.target.value;
                                updateElementById(selectedElement.id, (prev) => ({
                                  ...prev,
                                  objectPosition: val,
                                  style: { ...(prev as ResultImageElement).style, objectPosition: val },
                                } as ResultScreenElement));
                              }}
                              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-slate-200 text-xs font-mono"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Quick Transform & Sizing Helpers */}
                    <div className="space-y-1.5 pt-2 border-t border-slate-800">
                      <span className="text-[10px] text-slate-400 font-semibold block uppercase tracking-wider">
                        Quick Sizing & Alignment
                      </span>
                      <div className="grid grid-cols-3 gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            const side = Math.max(selectedElement.width, selectedElement.height);
                            updateElementById(selectedElement.id, (prev) => ({
                              ...prev,
                              width: side,
                              height: side,
                            }));
                          }}
                          className="px-2 py-1.5 bg-slate-950 hover:bg-slate-800 border border-slate-700 text-slate-300 rounded-lg text-[10px] font-mono transition-colors text-center"
                          title="Make 1:1 Square"
                        >
                          Square (1:1)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const parentW = commonParent ? commonParent.width : canvasWidth;
                            updateElementById(selectedElement.id, (prev) => ({
                              ...prev,
                              x: 0,
                              width: parentW,
                            }));
                          }}
                          className="px-2 py-1.5 bg-slate-950 hover:bg-slate-800 border border-slate-700 text-slate-300 rounded-lg text-[10px] font-mono transition-colors text-center"
                          title="Fit Container Width"
                        >
                          Fit Width
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const containerW = commonParent ? commonParent.width : canvasWidth;
                            const containerH = commonParent ? commonParent.height : canvasHeight;
                            updateElementById(selectedElement.id, (prev) => ({
                              ...prev,
                              x: Math.max(0, Math.round((containerW - prev.width) / 2)),
                              y: Math.max(0, Math.round((containerH - prev.height) / 2)),
                            }));
                          }}
                          className="px-2 py-1.5 bg-slate-950 hover:bg-slate-800 border border-slate-700 text-slate-300 rounded-lg text-[10px] font-mono transition-colors text-center"
                          title="Center in Parent"
                        >
                          Center Frame
                        </button>
                      </div>
                    </div>

                    {/* Border & Radius Framing */}
                    <div className="space-y-2 pt-2 border-t border-slate-800">
                      <span className="text-[11px] font-semibold text-slate-300 block">Frame & Border Styling</span>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-[11px] text-slate-400 block">Border Width (px)</span>
                          <input
                            type="number"
                            min={0}
                            max={20}
                            value={imgStyle.borderWidth ?? 0}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              updateElementById(selectedElement.id, (prev) => ({
                                ...prev,
                                style: { ...(prev as ResultImageElement).style, borderWidth: val },
                              } as ResultScreenElement));
                            }}
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-slate-100 font-mono text-xs mt-1"
                          />
                        </div>
                        <div>
                          <span className="text-[11px] text-slate-400 block">Border Radius (px)</span>
                          <input
                            type="number"
                            min={0}
                            max={9999}
                            value={imgStyle.borderRadius ?? 0}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              updateElementById(selectedElement.id, (prev) => ({
                                ...prev,
                                style: { ...(prev as ResultImageElement).style, borderRadius: val },
                              } as ResultScreenElement));
                            }}
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-slate-100 font-mono text-xs mt-1"
                          />
                        </div>
                      </div>

                      {/* Radius Presets */}
                      <div className="flex items-center gap-1.5 pt-0.5">
                        <span className="text-[10px] text-slate-400">Presets:</span>
                        {[
                          { label: '0px', val: 0 },
                          { label: '8px', val: 8 },
                          { label: '16px', val: 16 },
                          { label: '24px', val: 24 },
                          { label: 'Circle', val: 9999 },
                        ].map((r) => (
                          <button
                            key={r.label}
                            type="button"
                            onClick={() => {
                              updateElementById(selectedElement.id, (prev) => ({
                                ...prev,
                                style: { ...(prev as ResultImageElement).style, borderRadius: r.val },
                              } as ResultScreenElement));
                            }}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono border transition-colors ${
                              (imgStyle.borderRadius ?? 0) === r.val
                                ? 'bg-emerald-600 border-emerald-500 text-white font-bold'
                                : 'bg-slate-950 border-slate-700 text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            {r.label}
                          </button>
                        ))}
                      </div>

                      {/* Border Color */}
                      {(imgStyle.borderWidth ?? 0) > 0 && (
                        <div className="space-y-1 pt-1">
                          <span className="text-[11px] text-slate-400 block">Border Color</span>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={imgStyle.borderColor?.startsWith('#') ? imgStyle.borderColor : '#10b981'}
                              onChange={(e) => {
                                const val = e.target.value;
                                updateElementById(selectedElement.id, (prev) => ({
                                  ...prev,
                                  style: { ...(prev as ResultImageElement).style, borderColor: val },
                                } as ResultScreenElement));
                              }}
                              className="w-7 h-7 rounded border border-slate-700 cursor-pointer bg-transparent"
                            />
                            <input
                              type="text"
                              value={imgStyle.borderColor || '#10b981'}
                              onChange={(e) => {
                                const val = e.target.value;
                                updateElementById(selectedElement.id, (prev) => ({
                                  ...prev,
                                  style: { ...(prev as ResultImageElement).style, borderColor: val },
                                } as ResultScreenElement));
                              }}
                              className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-slate-200 text-xs font-mono"
                            />
                          </div>
                        </div>
                      )}

                      {/* Image Drop Shadow */}
                      <label className="flex items-center gap-2 cursor-pointer pt-1">
                        <input
                          type="checkbox"
                          checked={imgStyle.shadow === true}
                          onChange={(e) => {
                            const val = e.target.checked;
                            updateElementById(selectedElement.id, (prev) => ({
                              ...prev,
                              style: { ...(prev as ResultImageElement).style, shadow: val },
                            } as ResultScreenElement));
                          }}
                          className="rounded border-slate-700 text-emerald-500 accent-emerald-500 cursor-pointer"
                        />
                        <span className="text-slate-300 text-xs font-medium">Enable Soft Drop Shadow</span>
                      </label>
                    </div>
                  </div>
                );
              })()}

              {/* 3. TEXT ELEMENT */}
              {selectedElement.type === 'text' && (() => {
                const textEl = selectedElement as ResultTextElement;
                const textStyle = textEl.style || {};
                return (
                  <div className="space-y-3 bg-slate-900/80 border border-slate-800 rounded-xl p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">
                        Text & Typography
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">1000×1000 scaled</span>
                    </div>

                    {/* Content Text */}
                    <div className="space-y-1">
                      <span className="text-[11px] text-slate-400 block">Text Content</span>
                      <textarea
                        rows={2}
                        value={textEl.text}
                        onChange={(e) => {
                          const val = e.target.value;
                          updateElementById(selectedElement.id, (prev) => ({
                            ...prev,
                            text: val,
                          } as ResultScreenElement));
                        }}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100 text-xs font-semibold resize-none"
                      />
                    </div>

                    {/* Font Family */}
                    <div className="space-y-1">
                      <span className="text-[11px] text-slate-400 block">Font Family</span>
                      <select
                        value={textStyle.fontFamily || 'inherit'}
                        onChange={(e) => {
                          const val = e.target.value;
                          updateElementById(selectedElement.id, (prev) => ({
                            ...prev,
                            style: { ...(prev as ResultTextElement).style, fontFamily: val },
                          } as ResultScreenElement));
                        }}
                        className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-100 text-xs"
                      >
                        <option value="inherit">Inherit / Default</option>
                        {FONT_FAMILY_PRESETS.map((preset) => (
                          <option key={preset.label} value={preset.value}>
                            {preset.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Font Size & Weight */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-[11px] text-slate-400 block">Font Size (px)</span>
                        <input
                          type="number"
                          min={6}
                          max={160}
                          value={textStyle.fontSize ?? 32}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            updateElementById(selectedElement.id, (prev) => ({
                              ...prev,
                              style: { ...(prev as ResultTextElement).style, fontSize: val },
                            } as ResultScreenElement));
                          }}
                          className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-100 font-mono text-xs mt-1"
                        />
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-400 block">Font Weight</span>
                        <select
                          value={String(textStyle.fontWeight || 'bold')}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateElementById(selectedElement.id, (prev) => ({
                              ...prev,
                              style: { ...(prev as ResultTextElement).style, fontWeight: val },
                            } as ResultScreenElement));
                          }}
                          className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-100 text-xs mt-1"
                        >
                          <option value="400">Normal (400)</option>
                          <option value="500">Medium (500)</option>
                          <option value="600">Semi Bold (600)</option>
                          <option value="bold">Bold (700)</option>
                          <option value="800">Extra Bold (800)</option>
                          <option value="900">Black (900)</option>
                        </select>
                      </div>
                    </div>

                    {/* Horizontal & Vertical Alignment */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <span className="text-[11px] text-slate-400 block">Align H</span>
                        <div className="grid grid-cols-4 gap-0.5">
                          {(['left', 'center', 'right', 'justify'] as const).map((align) => (
                            <button
                              key={align}
                              type="button"
                              title={align}
                              onClick={() => {
                                updateElementById(selectedElement.id, (prev) => ({
                                  ...prev,
                                  style: { ...(prev as ResultTextElement).style, textAlign: align },
                                } as ResultScreenElement));
                              }}
                              className={`py-1 rounded text-xs font-semibold flex items-center justify-center transition-colors ${
                                (textStyle.textAlign || 'center') === align
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                  : 'bg-slate-950 text-slate-400 border border-slate-800 hover:bg-slate-800'
                              }`}
                            >
                              {align === 'left' && <AlignLeft className="w-3.5 h-3.5" />}
                              {align === 'center' && <AlignCenter className="w-3.5 h-3.5" />}
                              {align === 'right' && <AlignRight className="w-3.5 h-3.5" />}
                              {align === 'justify' && <AlignJustify className="w-3.5 h-3.5" />}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <span className="text-[11px] text-slate-400 block">Align V</span>
                        <div className="grid grid-cols-3 gap-0.5">
                          {(['top', 'center', 'bottom'] as const).map((valign) => (
                            <button
                              key={valign}
                              type="button"
                              title={valign}
                              onClick={() => {
                                updateElementById(selectedElement.id, (prev) => ({
                                  ...prev,
                                  style: { ...(prev as ResultTextElement).style, verticalAlign: valign },
                                } as ResultScreenElement));
                              }}
                              className={`py-1 rounded text-[10px] font-semibold flex items-center justify-center uppercase transition-colors ${
                                (textStyle.verticalAlign || 'center') === valign
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                  : 'bg-slate-950 text-slate-400 border border-slate-800 hover:bg-slate-800'
                              }`}
                            >
                              {valign === 'top' ? 'Top' : valign === 'center' ? 'Mid' : 'Bot'}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Font Style, Transform & Decoration */}
                    <div className="grid grid-cols-3 gap-1.5">
                      <div>
                        <span className="text-[10px] text-slate-400 block mb-0.5">Style</span>
                        <button
                          type="button"
                          onClick={() => {
                            const next = textStyle.fontStyle === 'italic' ? 'normal' : 'italic';
                            updateElementById(selectedElement.id, (prev) => ({
                              ...prev,
                              style: { ...(prev as ResultTextElement).style, fontStyle: next },
                            } as ResultScreenElement));
                          }}
                          className={`w-full py-1 rounded text-xs flex items-center justify-center gap-1 border ${
                            textStyle.fontStyle === 'italic'
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                              : 'bg-slate-950 text-slate-400 border-slate-800'
                          }`}
                        >
                          <Italic className="w-3.5 h-3.5" />
                          <span>Italic</span>
                        </button>
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-400 block mb-0.5">Case</span>
                        <select
                          value={textStyle.textTransform || 'none'}
                          onChange={(e) => {
                            const val = e.target.value as any;
                            updateElementById(selectedElement.id, (prev) => ({
                              ...prev,
                              style: { ...(prev as ResultTextElement).style, textTransform: val },
                            } as ResultScreenElement));
                          }}
                          className="w-full bg-slate-950 border border-slate-700 rounded px-1.5 py-1 text-slate-100 text-[11px]"
                        >
                          <option value="none">Normal</option>
                          <option value="uppercase">UPPER</option>
                          <option value="lowercase">lower</option>
                          <option value="capitalize">Capital</option>
                        </select>
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-400 block mb-0.5">Decoration</span>
                        <select
                          value={textStyle.textDecoration || 'none'}
                          onChange={(e) => {
                            const val = e.target.value as any;
                            updateElementById(selectedElement.id, (prev) => ({
                              ...prev,
                              style: { ...(prev as ResultTextElement).style, textDecoration: val },
                            } as ResultScreenElement));
                          }}
                          className="w-full bg-slate-950 border border-slate-700 rounded px-1.5 py-1 text-slate-100 text-[11px]"
                        >
                          <option value="none">None</option>
                          <option value="underline">Underline</option>
                          <option value="line-through">Strike</option>
                        </select>
                      </div>
                    </div>

                    {/* Line Height & Letter Spacing */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-[11px] text-slate-400 block">Line Height</span>
                        <input
                          type="number"
                          step={0.1}
                          min={0.6}
                          max={3.0}
                          value={textStyle.lineHeight ?? 1.2}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            updateElementById(selectedElement.id, (prev) => ({
                              ...prev,
                              style: { ...(prev as ResultTextElement).style, lineHeight: val },
                            } as ResultScreenElement));
                          }}
                          className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-100 font-mono text-xs mt-1"
                        />
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-400 block">Letter Spacing (px)</span>
                        <input
                          type="number"
                          step={1}
                          min={-4}
                          max={30}
                          value={textStyle.letterSpacing ?? 0}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            updateElementById(selectedElement.id, (prev) => ({
                              ...prev,
                              style: { ...(prev as ResultTextElement).style, letterSpacing: val },
                            } as ResultScreenElement));
                          }}
                          className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-100 font-mono text-xs mt-1"
                        />
                      </div>
                    </div>

                    {/* Text Shadow Presets */}
                    <div className="space-y-1">
                      <span className="text-[11px] text-slate-400 block">Text Shadow</span>
                      <div className="grid grid-cols-3 gap-1">
                        {[
                          { label: 'None', val: '' },
                          { label: 'Subtle Drop', val: '0 2px 4px rgba(0, 0, 0, 0.6)' },
                          { label: 'Deep Drop', val: '0 4px 12px rgba(0, 0, 0, 0.9)' },
                          { label: 'Amber Glow', val: '0 0 16px rgba(245, 158, 11, 0.75)' },
                          { label: 'Cyan Glow', val: '0 0 16px rgba(6, 182, 212, 0.75)' },
                          { label: 'Retro Outline', val: '1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000' },
                        ].map((preset) => (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() => {
                              updateElementById(selectedElement.id, (prev) => ({
                                ...prev,
                                style: { ...(prev as ResultTextElement).style, textShadow: preset.val || undefined },
                              } as ResultScreenElement));
                            }}
                            className={`py-1 px-1.5 rounded text-[10px] font-medium truncate border transition-colors ${
                              (textStyle.textShadow || '') === preset.val
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold'
                                : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800'
                            }`}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Text Color & Opacity */}
                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800">
                      <div>
                        <span className="text-[11px] text-slate-400 block">Text Color</span>
                        <div className="flex items-center gap-1.5 mt-1">
                          <input
                            type="color"
                            value={textStyle.color?.startsWith('#') ? textStyle.color : '#ffffff'}
                            onChange={(e) => {
                              const val = e.target.value;
                              updateElementById(selectedElement.id, (prev) => ({
                                ...prev,
                                style: { ...(prev as ResultTextElement).style, color: val },
                              } as ResultScreenElement));
                            }}
                            className="w-6 h-6 rounded border border-slate-700 cursor-pointer bg-transparent"
                          />
                          <input
                            type="text"
                            value={textStyle.color || '#ffffff'}
                            onChange={(e) => {
                              const val = e.target.value;
                              updateElementById(selectedElement.id, (prev) => ({
                                ...prev,
                                style: { ...(prev as ResultTextElement).style, color: val },
                              } as ResultScreenElement));
                            }}
                            className="w-20 bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-slate-200 text-[11px] font-mono"
                          />
                        </div>
                      </div>

                      <div>
                        <span className="text-[11px] text-slate-400 block">
                          Opacity ({Math.round((textStyle.opacity ?? 1) * 100)}%)
                        </span>
                        <input
                          type="range"
                          min={0.1}
                          max={1}
                          step={0.05}
                          value={textStyle.opacity ?? 1}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            updateElementById(selectedElement.id, (prev) => ({
                              ...prev,
                              style: { ...(prev as ResultTextElement).style, opacity: val },
                            } as ResultScreenElement));
                          }}
                          className="w-full mt-2 accent-amber-500 cursor-pointer"
                        />
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* 4. STAT ELEMENTS (Score, Moves, Pairs, Time, Accuracy) */}
              {(selectedElement.type === 'score' ||
                selectedElement.type === 'moves' ||
                selectedElement.type === 'pairs' ||
                selectedElement.type === 'time' ||
                selectedElement.type === 'accuracy') && (() => {
                const statEl = selectedElement as
                  | ResultScoreElement
                  | ResultMovesElement
                  | ResultPairsElement
                  | ResultTimeElement
                  | ResultAccuracyElement;
                const statStyle = statEl.style || {};

                return (
                  <div className="space-y-3 bg-slate-900/80 border border-slate-800 rounded-xl p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">
                        Dynamic Stat: {selectedElement.type}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">Live Data</span>
                    </div>

                    {/* Layout Mode (Stack vs Row) & Alignment */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-[11px] text-slate-400 block">Layout Direction</span>
                        <div className="grid grid-cols-2 gap-1 mt-1">
                          <button
                            type="button"
                            onClick={() => {
                              updateElementById(selectedElement.id, (prev) => ({
                                ...prev,
                                style: { ...(prev as any).style, layout: 'vertical' },
                              } as ResultScreenElement));
                            }}
                            className={`py-1 rounded text-[11px] font-semibold border ${
                              (statStyle.layout || 'vertical') === 'vertical'
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                : 'bg-slate-950 text-slate-400 border-slate-800'
                            }`}
                          >
                            Column
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              updateElementById(selectedElement.id, (prev) => ({
                                ...prev,
                                style: { ...(prev as any).style, layout: 'horizontal' },
                              } as ResultScreenElement));
                            }}
                            className={`py-1 rounded text-[11px] font-semibold border ${
                              statStyle.layout === 'horizontal'
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                : 'bg-slate-950 text-slate-400 border-slate-800'
                            }`}
                          >
                            Row
                          </button>
                        </div>
                      </div>

                      <div>
                        <span className="text-[11px] text-slate-400 block">Alignment</span>
                        <div className="grid grid-cols-3 gap-1 mt-1">
                          {(['left', 'center', 'right'] as const).map((align) => (
                            <button
                              key={align}
                              type="button"
                              onClick={() => {
                                updateElementById(selectedElement.id, (prev) => ({
                                  ...prev,
                                  style: { ...(prev as any).style, textAlign: align },
                                } as ResultScreenElement));
                              }}
                              className={`py-1 rounded text-[10px] font-semibold flex items-center justify-center transition-colors ${
                                (statStyle.textAlign || 'center') === align
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                  : 'bg-slate-950 text-slate-400 border border-slate-800 hover:bg-slate-800'
                              }`}
                            >
                              <span className="capitalize">{align}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Gap */}
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-[11px] text-slate-400">Label/Value Gap (px)</span>
                        <span className="font-mono text-[10px] text-slate-300">{statStyle.gap ?? 4}px</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={30}
                        value={statStyle.gap ?? 4}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          updateElementById(selectedElement.id, (prev) => ({
                            ...prev,
                            style: { ...(prev as any).style, gap: val },
                          } as ResultScreenElement));
                        }}
                        className="w-full accent-amber-500 cursor-pointer"
                      />
                    </div>

                    {/* SECTION: LABEL TYPOGRAPHY */}
                    <div className="p-2.5 bg-slate-950/70 border border-slate-800/80 rounded-lg space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">
                          Label Typography
                        </span>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={statStyle.showLabel !== false}
                            onChange={(e) => {
                              const val = e.target.checked;
                              updateElementById(selectedElement.id, (prev) => ({
                                ...prev,
                                style: { ...(prev as any).style, showLabel: val },
                              } as ResultScreenElement));
                            }}
                            className="rounded border-slate-700 text-amber-500 accent-amber-500 w-3.5 h-3.5"
                          />
                          <span className="text-[11px] text-slate-300">Show</span>
                        </label>
                      </div>

                      {statStyle.showLabel !== false && (
                        <>
                          <div className="space-y-1">
                            <span className="text-[10px] text-slate-400 block">Custom Label</span>
                            <input
                              type="text"
                              value={statEl.label || ''}
                              placeholder="Default Stat Label"
                              onChange={(e) => {
                                const val = e.target.value;
                                updateElementById(selectedElement.id, (prev) => ({
                                  ...prev,
                                  label: val,
                                } as ResultScreenElement));
                              }}
                              className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100 text-xs"
                            />
                          </div>

                          <div className="space-y-1">
                            <span className="text-[10px] text-slate-400 block">Label Font Family</span>
                            <select
                              value={statStyle.labelFontFamily || 'inherit'}
                              onChange={(e) => {
                                const val = e.target.value;
                                updateElementById(selectedElement.id, (prev) => ({
                                  ...prev,
                                  style: { ...(prev as any).style, labelFontFamily: val },
                                } as ResultScreenElement));
                              }}
                              className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100 text-xs"
                            >
                              <option value="inherit">Inherit / Default</option>
                              {FONT_FAMILY_PRESETS.map((preset) => (
                                <option key={preset.label} value={preset.value}>
                                  {preset.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <span className="text-[10px] text-slate-400 block">Size (px)</span>
                              <input
                                type="number"
                                min={6}
                                max={48}
                                value={statStyle.labelFontSize ?? 12}
                                onChange={(e) => {
                                  const val = Number(e.target.value);
                                  updateElementById(selectedElement.id, (prev) => ({
                                    ...prev,
                                    style: { ...(prev as any).style, labelFontSize: val },
                                  } as ResultScreenElement));
                                }}
                                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100 font-mono text-xs"
                              />
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400 block">Weight</span>
                              <select
                                value={String(statStyle.labelFontWeight || 'bold')}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  updateElementById(selectedElement.id, (prev) => ({
                                    ...prev,
                                    style: { ...(prev as any).style, labelFontWeight: val },
                                  } as ResultScreenElement));
                                }}
                                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100 text-xs"
                              >
                                <option value="400">Normal (400)</option>
                                <option value="600">Semi Bold (600)</option>
                                <option value="bold">Bold (700)</option>
                                <option value="900">Black (900)</option>
                              </select>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <span className="text-[10px] text-slate-400 block">Transform</span>
                              <select
                                value={statStyle.labelTextTransform || 'uppercase'}
                                onChange={(e) => {
                                  const val = e.target.value as any;
                                  updateElementById(selectedElement.id, (prev) => ({
                                    ...prev,
                                    style: { ...(prev as any).style, labelTextTransform: val },
                                  } as ResultScreenElement));
                                }}
                                className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-slate-100 text-[11px]"
                              >
                                <option value="uppercase">UPPERCASE</option>
                                <option value="none">None</option>
                                <option value="capitalize">Capitalize</option>
                                <option value="lowercase">lowercase</option>
                              </select>
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400 block">Label Color</span>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <input
                                  type="color"
                                  value={statStyle.labelColor?.startsWith('#') ? statStyle.labelColor : '#94a3b8'}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    updateElementById(selectedElement.id, (prev) => ({
                                      ...prev,
                                      style: { ...(prev as any).style, labelColor: val },
                                    } as ResultScreenElement));
                                  }}
                                  className="w-6 h-6 rounded border border-slate-700 cursor-pointer bg-transparent"
                                />
                                <span className="font-mono text-[10px] text-slate-300 truncate">
                                  {statStyle.labelColor || '#94a3b8'}
                                </span>
                              </div>
                            </div>
                          </div>
                        </>
                      )}
                    </div>

                    {/* SECTION: VALUE TYPOGRAPHY */}
                    <div className="p-2.5 bg-slate-950/70 border border-slate-800/80 rounded-lg space-y-2">
                      <span className="text-[10px] font-bold text-amber-300 uppercase tracking-wider block">
                        Value (Number) Typography
                      </span>

                      <div className="space-y-1">
                        <span className="text-[10px] text-slate-400 block">Value Font Family</span>
                        <select
                          value={statStyle.valueFontFamily || 'monospace'}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateElementById(selectedElement.id, (prev) => ({
                              ...prev,
                              style: { ...(prev as any).style, valueFontFamily: val },
                            } as ResultScreenElement));
                          }}
                          className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100 text-xs"
                        >
                          <option value="monospace">Monospace (Default Data)</option>
                          {FONT_FAMILY_PRESETS.map((preset) => (
                            <option key={preset.label} value={preset.value}>
                              {preset.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-[10px] text-slate-400 block">Value Size (px)</span>
                          <input
                            type="number"
                            min={10}
                            max={100}
                            value={statStyle.valueFontSize ?? statStyle.fontSize ?? 26}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              updateElementById(selectedElement.id, (prev) => ({
                                ...prev,
                                style: { ...(prev as any).style, valueFontSize: val, fontSize: val },
                              } as ResultScreenElement));
                            }}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100 font-mono text-xs"
                          />
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block">Value Weight</span>
                          <select
                            value={String(statStyle.valueFontWeight || '900')}
                            onChange={(e) => {
                              const val = e.target.value;
                              updateElementById(selectedElement.id, (prev) => ({
                                ...prev,
                                style: { ...(prev as any).style, valueFontWeight: val },
                              } as ResultScreenElement));
                            }}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100 text-xs"
                          >
                            <option value="400">Normal (400)</option>
                            <option value="600">Semi Bold (600)</option>
                            <option value="bold">Bold (700)</option>
                            <option value="900">Black (900)</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-[10px] text-slate-400 block">Value Color</span>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <input
                              type="color"
                              value={statStyle.valueColor?.startsWith('#') ? statStyle.valueColor : '#fbbf24'}
                              onChange={(e) => {
                                const val = e.target.value;
                                updateElementById(selectedElement.id, (prev) => ({
                                  ...prev,
                                  style: { ...(prev as any).style, valueColor: val },
                                } as ResultScreenElement));
                              }}
                              className="w-6 h-6 rounded border border-slate-700 cursor-pointer bg-transparent"
                            />
                            <span className="font-mono text-[10px] text-slate-300 truncate">
                              {statStyle.valueColor || '#fbbf24'}
                            </span>
                          </div>
                        </div>

                        <div>
                          <span className="text-[10px] text-slate-400 block">Letter Spacing</span>
                          <input
                            type="number"
                            step={1}
                            min={-2}
                            max={20}
                            value={statStyle.valueLetterSpacing ?? 0}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              updateElementById(selectedElement.id, (prev) => ({
                                ...prev,
                                style: { ...(prev as any).style, valueLetterSpacing: val },
                              } as ResultScreenElement));
                            }}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100 font-mono text-xs"
                          />
                        </div>
                      </div>

                      {/* Value Shadow Presets */}
                      <div className="space-y-1">
                        <span className="text-[10px] text-slate-400 block">Value Text Shadow</span>
                        <div className="grid grid-cols-3 gap-1">
                          {[
                            { label: 'None', val: '' },
                            { label: 'Subtle Drop', val: '0 2px 4px rgba(0, 0, 0, 0.6)' },
                            { label: 'Deep Drop', val: '0 4px 12px rgba(0, 0, 0, 0.9)' },
                            { label: 'Gold Glow', val: '0 0 14px rgba(251, 191, 36, 0.75)' },
                            { label: 'Cyan Glow', val: '0 0 14px rgba(103, 232, 249, 0.75)' },
                            { label: 'Emerald Glow', val: '0 0 14px rgba(52, 211, 153, 0.75)' },
                          ].map((preset) => (
                            <button
                              key={preset.label}
                              type="button"
                              onClick={() => {
                                updateElementById(selectedElement.id, (prev) => ({
                                  ...prev,
                                  style: { ...(prev as any).style, valueTextShadow: preset.val || undefined },
                                } as ResultScreenElement));
                              }}
                              className={`py-0.5 px-1 rounded text-[9px] font-medium truncate border transition-colors ${
                                (statStyle.valueTextShadow || '') === preset.val
                                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold'
                                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
                              }`}
                            >
                              {preset.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* SECTION: CONTAINER BOX STYLING */}
                    <div className="space-y-2.5 pt-2 border-t border-slate-800">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        Widget Card Frame
                      </span>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-[10px] text-slate-400 block">Radius (px)</span>
                          <input
                            type="number"
                            min={0}
                            max={50}
                            value={statStyle.borderRadius ?? 16}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              updateElementById(selectedElement.id, (prev) => ({
                                ...prev,
                                style: { ...(prev as any).style, borderRadius: val },
                              } as ResultScreenElement));
                            }}
                            className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-100 font-mono text-xs mt-0.5"
                          />
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block">Border Width (px)</span>
                          <input
                            type="number"
                            min={0}
                            max={20}
                            value={statStyle.borderWidth ?? 0}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              updateElementById(selectedElement.id, (prev) => ({
                                ...prev,
                                style: { ...(prev as any).style, borderWidth: val },
                              } as ResultScreenElement));
                            }}
                            className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-100 font-mono text-xs mt-0.5"
                          />
                        </div>
                      </div>

                      {/* Radius Presets */}
                      <div className="flex items-center gap-1.5 pt-0.5">
                        <span className="text-[10px] text-slate-400">Radius:</span>
                        {[
                          { label: '0px', val: 0 },
                          { label: '8px', val: 8 },
                          { label: '16px', val: 16 },
                          { label: '24px', val: 24 },
                        ].map((r) => (
                          <button
                            key={r.label}
                            type="button"
                            onClick={() => {
                              updateElementById(selectedElement.id, (prev) => ({
                                ...prev,
                                style: { ...(prev as any).style, borderRadius: r.val },
                              } as ResultScreenElement));
                            }}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono border transition-colors ${
                              (statStyle.borderRadius ?? 16) === r.val
                                ? 'bg-amber-600 border-amber-500 text-white'
                                : 'bg-slate-950 border-slate-700 text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            {r.label}
                          </button>
                        ))}
                      </div>

                      {/* Card Background Color */}
                      <div className="space-y-1">
                        <span className="text-[10px] text-slate-400 block">Card Background</span>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={statStyle.backgroundColor?.startsWith('#') ? statStyle.backgroundColor : '#020617'}
                            onChange={(e) => {
                              const val = e.target.value;
                              updateElementById(selectedElement.id, (prev) => ({
                                ...prev,
                                style: { ...(prev as any).style, backgroundColor: val },
                              } as ResultScreenElement));
                            }}
                            className="w-6 h-6 rounded border border-slate-700 cursor-pointer bg-transparent"
                          />
                          <input
                            type="text"
                            value={statStyle.backgroundColor || ''}
                            placeholder="e.g. rgba(2, 6, 23, 0.6) or #020617"
                            onChange={(e) => {
                              const val = e.target.value;
                              updateElementById(selectedElement.id, (prev) => ({
                                ...prev,
                                style: { ...(prev as any).style, backgroundColor: val || undefined },
                              } as ResultScreenElement));
                            }}
                            className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-200 text-xs font-mono"
                          />
                        </div>
                      </div>

                      {/* Border Color */}
                      {(statStyle.borderWidth ?? 0) > 0 && (
                        <div className="space-y-1">
                          <span className="text-[10px] text-slate-400 block">Border Color</span>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={statStyle.borderColor?.startsWith('#') ? statStyle.borderColor : '#334155'}
                              onChange={(e) => {
                                const val = e.target.value;
                                updateElementById(selectedElement.id, (prev) => ({
                                  ...prev,
                                  style: { ...(prev as any).style, borderColor: val },
                                } as ResultScreenElement));
                              }}
                              className="w-6 h-6 rounded border border-slate-700 cursor-pointer bg-transparent"
                            />
                            <input
                              type="text"
                              value={statStyle.borderColor || '#334155'}
                              onChange={(e) => {
                                const val = e.target.value;
                                updateElementById(selectedElement.id, (prev) => ({
                                  ...prev,
                                  style: { ...(prev as any).style, borderColor: val },
                                } as ResultScreenElement));
                              }}
                              className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-200 text-xs font-mono"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* 5. BUTTON ELEMENT */}
              {selectedElement.type === 'button' && (() => {
                const btnEl = selectedElement as ResultButtonElement;
                const btnStyle = btnEl.style || {};

                return (
                  <div className="space-y-3 bg-slate-900/80 border border-slate-800 rounded-xl p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">
                        Action Button Settings
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">Interactive</span>
                    </div>

                    {/* Action Type */}
                    <div className="space-y-1">
                      <span className="text-[11px] text-slate-400 block">Trigger Action</span>
                      <select
                        value={btnEl.action || 'playAgain'}
                        onChange={(e) => {
                          const val = e.target.value;
                          updateElementById(selectedElement.id, (prev) => ({
                            ...prev,
                            action: val,
                          } as ResultScreenElement));
                        }}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-slate-100 text-xs"
                      >
                        <option value="playAgain">Play Again (Restart Match)</option>
                        <option value="exit">Exit to Menu</option>
                      </select>
                    </div>

                    {/* Button Text */}
                    <div className="space-y-1">
                      <span className="text-[11px] text-slate-400 block">Button Label Text</span>
                      <input
                        type="text"
                        value={btnEl.text}
                        onChange={(e) => {
                          const val = e.target.value;
                          updateElementById(selectedElement.id, (prev) => ({
                            ...prev,
                            text: val,
                          } as ResultScreenElement));
                        }}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100 text-xs font-semibold"
                      />
                    </div>

                    {/* Button Font Family */}
                    <div className="space-y-1">
                      <span className="text-[11px] text-slate-400 block">Font Family</span>
                      <select
                        value={btnStyle.fontFamily || 'inherit'}
                        onChange={(e) => {
                          const val = e.target.value;
                          updateElementById(selectedElement.id, (prev) => ({
                            ...prev,
                            style: { ...(prev as ResultButtonElement).style, fontFamily: val },
                          } as ResultScreenElement));
                        }}
                        className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-100 text-xs"
                      >
                        <option value="inherit">Inherit / Default</option>
                        {FONT_FAMILY_PRESETS.map((preset) => (
                          <option key={preset.label} value={preset.value}>
                            {preset.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Font Size & Weight */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-[11px] text-slate-400 block">Font Size (px)</span>
                        <input
                          type="number"
                          min={10}
                          max={60}
                          value={btnStyle.fontSize ?? 20}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            updateElementById(selectedElement.id, (prev) => ({
                              ...prev,
                              style: { ...(prev as ResultButtonElement).style, fontSize: val },
                            } as ResultScreenElement));
                          }}
                          className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-100 font-mono text-xs mt-1"
                        />
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-400 block">Font Weight</span>
                        <select
                          value={String(btnStyle.fontWeight || '900')}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateElementById(selectedElement.id, (prev) => ({
                              ...prev,
                              style: { ...(prev as ResultButtonElement).style, fontWeight: val },
                            } as ResultScreenElement));
                          }}
                          className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-100 text-xs mt-1"
                        >
                          <option value="500">Medium (500)</option>
                          <option value="600">Semi Bold (600)</option>
                          <option value="bold">Bold (700)</option>
                          <option value="800">Extra Bold (800)</option>
                          <option value="900">Black (900)</option>
                        </select>
                      </div>
                    </div>

                    {/* Font Style & Case & Letter Spacing */}
                    <div className="grid grid-cols-3 gap-1.5">
                      <div>
                        <span className="text-[10px] text-slate-400 block">Style</span>
                        <select
                          value={btnStyle.fontStyle || 'normal'}
                          onChange={(e) => {
                            const val = e.target.value as 'normal' | 'italic';
                            updateElementById(selectedElement.id, (prev) => ({
                              ...prev,
                              style: { ...(prev as ResultButtonElement).style, fontStyle: val },
                            } as ResultScreenElement));
                          }}
                          className="w-full bg-slate-950 border border-slate-700 rounded px-1 py-1 text-slate-100 text-xs mt-0.5"
                        >
                          <option value="normal">Normal</option>
                          <option value="italic">Italic</option>
                        </select>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">Case</span>
                        <select
                          value={btnStyle.textTransform || 'uppercase'}
                          onChange={(e) => {
                            const val = e.target.value as any;
                            updateElementById(selectedElement.id, (prev) => ({
                              ...prev,
                              style: { ...(prev as ResultButtonElement).style, textTransform: val },
                            } as ResultScreenElement));
                          }}
                          className="w-full bg-slate-950 border border-slate-700 rounded px-1 py-1 text-slate-100 text-xs mt-0.5"
                        >
                          <option value="uppercase">UPPER</option>
                          <option value="none">Normal</option>
                          <option value="capitalize">Capital</option>
                        </select>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">Spacing (px)</span>
                        <input
                          type="number"
                          step={1}
                          min={-2}
                          max={20}
                          value={btnStyle.letterSpacing ?? 1}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            updateElementById(selectedElement.id, (prev) => ({
                              ...prev,
                              style: { ...(prev as ResultButtonElement).style, letterSpacing: val },
                            } as ResultScreenElement));
                          }}
                          className="w-full bg-slate-950 border border-slate-700 rounded px-1.5 py-1 text-slate-100 font-mono text-xs mt-0.5"
                        />
                      </div>
                    </div>

                    {/* Background Color & Text Color */}
                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800">
                      <div>
                        <span className="text-[11px] text-slate-400 block">Background</span>
                        <div className="flex items-center gap-1.5 mt-1">
                          <input
                            type="color"
                            value={btnStyle.backgroundColor?.startsWith('#') ? btnStyle.backgroundColor : '#f59e0b'}
                            onChange={(e) => {
                              const val = e.target.value;
                              updateElementById(selectedElement.id, (prev) => ({
                                ...prev,
                                style: { ...(prev as ResultButtonElement).style, backgroundColor: val },
                              } as ResultScreenElement));
                            }}
                            className="w-6 h-6 rounded border border-slate-700 cursor-pointer bg-transparent"
                          />
                          <input
                            type="text"
                            value={btnStyle.backgroundColor || '#f59e0b'}
                            onChange={(e) => {
                              const val = e.target.value;
                              updateElementById(selectedElement.id, (prev) => ({
                                ...prev,
                                style: { ...(prev as ResultButtonElement).style, backgroundColor: val },
                              } as ResultScreenElement));
                            }}
                            className="flex-1 bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-slate-200 text-xs font-mono"
                          />
                        </div>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-400 block">Text Color</span>
                        <div className="flex items-center gap-1.5 mt-1">
                          <input
                            type="color"
                            value={btnStyle.textColor?.startsWith('#') ? btnStyle.textColor : '#020617'}
                            onChange={(e) => {
                              const val = e.target.value;
                              updateElementById(selectedElement.id, (prev) => ({
                                ...prev,
                                style: { ...(prev as ResultButtonElement).style, textColor: val },
                              } as ResultScreenElement));
                            }}
                            className="w-6 h-6 rounded border border-slate-700 cursor-pointer bg-transparent"
                          />
                          <input
                            type="text"
                            value={btnStyle.textColor || '#020617'}
                            onChange={(e) => {
                              const val = e.target.value;
                              updateElementById(selectedElement.id, (prev) => ({
                                ...prev,
                                style: { ...(prev as ResultButtonElement).style, textColor: val },
                              } as ResultScreenElement));
                            }}
                            className="flex-1 bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-slate-200 text-xs font-mono"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Quick Button Color Presets */}
                    <div className="flex items-center gap-1.5 pt-0.5">
                      <span className="text-[10px] text-slate-400">Presets:</span>
                      {[
                        { label: 'Amber Gold', bg: '#f59e0b', text: '#020617', border: '#b45309' },
                        { label: 'Emerald', bg: '#10b981', text: '#ffffff', border: '#047857' },
                        { label: 'Indigo', bg: '#6366f1', text: '#ffffff', border: '#4338ca' },
                        { label: 'Rose', bg: '#f43f5e', text: '#ffffff', border: '#be123c' },
                        { label: 'Cyan', bg: '#06b6d4', text: '#020617', border: '#0e7490' },
                        { label: 'White Light', bg: '#f8fafc', text: '#0f172a', border: '#cbd5e1' },
                      ].map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => {
                            updateElementById(selectedElement.id, (prev) => ({
                              ...prev,
                              style: {
                                ...(prev as ResultButtonElement).style,
                                backgroundColor: preset.bg,
                                textColor: preset.text,
                                borderColor: preset.border,
                              },
                            } as ResultScreenElement));
                          }}
                          title={preset.label}
                          className="w-4 h-4 rounded-full border border-slate-600 hover:scale-110 transition-transform"
                          style={{ backgroundColor: preset.bg }}
                        />
                      ))}
                    </div>

                    {/* Border Width & Border Color */}
                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800">
                      <div>
                        <span className="text-[11px] text-slate-400 block">Border Width (px)</span>
                        <input
                          type="number"
                          min={0}
                          max={10}
                          value={btnStyle.borderWidth ?? 0}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            updateElementById(selectedElement.id, (prev) => ({
                              ...prev,
                              style: { ...(prev as ResultButtonElement).style, borderWidth: val },
                            } as ResultScreenElement));
                          }}
                          className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-100 font-mono text-xs mt-1"
                        />
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-400 block">Border Color</span>
                        <div className="flex items-center gap-1.5 mt-1">
                          <input
                            type="color"
                            value={btnStyle.borderColor?.startsWith('#') ? btnStyle.borderColor : '#b45309'}
                            onChange={(e) => {
                              const val = e.target.value;
                              updateElementById(selectedElement.id, (prev) => ({
                                ...prev,
                                style: { ...(prev as ResultButtonElement).style, borderColor: val },
                              } as ResultScreenElement));
                            }}
                            className="w-6 h-6 rounded border border-slate-700 cursor-pointer bg-transparent"
                          />
                          <input
                            type="text"
                            value={btnStyle.borderColor || ''}
                            placeholder="#b45309"
                            onChange={(e) => {
                              const val = e.target.value;
                              updateElementById(selectedElement.id, (prev) => ({
                                ...prev,
                                style: { ...(prev as ResultButtonElement).style, borderColor: val || undefined },
                              } as ResultScreenElement));
                            }}
                            className="flex-1 bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-slate-200 text-xs font-mono"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Radius & Presets */}
                    <div className="space-y-1 pt-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-slate-400 block">Border Radius (px)</span>
                        <input
                          type="number"
                          min={0}
                          max={9999}
                          value={btnStyle.borderRadius ?? 18}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            updateElementById(selectedElement.id, (prev) => ({
                              ...prev,
                              style: { ...(prev as ResultButtonElement).style, borderRadius: val },
                            } as ResultScreenElement));
                          }}
                          className="w-20 bg-slate-950 border border-slate-700 rounded px-2 py-0.5 text-slate-100 font-mono text-xs text-right"
                        />
                      </div>
                      <div className="flex items-center gap-1.5 pt-0.5">
                        <span className="text-[10px] text-slate-400">Radius:</span>
                        {[
                          { label: '0px', val: 0 },
                          { label: '8px', val: 8 },
                          { label: '18px', val: 18 },
                          { label: '24px', val: 24 },
                          { label: 'Pill', val: 9999 },
                        ].map((r) => (
                          <button
                            key={r.label}
                            type="button"
                            onClick={() => {
                              updateElementById(selectedElement.id, (prev) => ({
                                ...prev,
                                style: { ...(prev as ResultButtonElement).style, borderRadius: r.val },
                              } as ResultScreenElement));
                            }}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono border transition-colors ${
                              (btnStyle.borderRadius ?? 18) === r.val
                                ? 'bg-amber-600 border-amber-500 text-white'
                                : 'bg-slate-950 border-slate-700 text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            {r.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Text Shadow Presets */}
                    <div className="space-y-1 pt-1 border-t border-slate-800">
                      <span className="text-[10px] text-slate-400 block">Button Text Shadow</span>
                      <div className="grid grid-cols-3 gap-1">
                        {[
                          { label: 'None', val: '' },
                          { label: 'Subtle Drop', val: '0 1px 2px rgba(0, 0, 0, 0.5)' },
                          { label: 'Deep Drop', val: '0 2px 4px rgba(0, 0, 0, 0.8)' },
                          { label: 'Gold Glow', val: '0 0 10px rgba(251, 191, 36, 0.8)' },
                          { label: 'Cyan Glow', val: '0 0 10px rgba(103, 232, 249, 0.8)' },
                          { label: 'Dark Outline', val: '0 0 2px #000, 0 0 2px #000' },
                        ].map((preset) => (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() => {
                              updateElementById(selectedElement.id, (prev) => ({
                                ...prev,
                                style: { ...(prev as ResultButtonElement).style, textShadow: preset.val || undefined },
                              } as ResultScreenElement));
                            }}
                            className={`py-0.5 px-1 rounded text-[9px] font-medium truncate border transition-colors ${
                              (btnStyle.textShadow || '') === preset.val
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold'
                                : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
                            }`}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Glow & Shadow Toggle */}
                    <div className="pt-2 border-t border-slate-800">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={btnStyle.shadow !== false}
                          onChange={(e) => {
                            const val = e.target.checked;
                            updateElementById(selectedElement.id, (prev) => ({
                              ...prev,
                              style: { ...(prev as ResultButtonElement).style, shadow: val },
                            } as ResultScreenElement));
                          }}
                          className="rounded border-slate-700 text-amber-500 accent-amber-500"
                        />
                        <span className="text-slate-300 text-xs font-medium">Enable Button Glow & Shadow</span>
                      </label>
                    </div>
                  </div>
                );
              })()}

              {/* 6. LEADERBOARD ELEMENT */}
              {selectedElement.type === 'leaderboard' && (() => {
                const lbEl = selectedElement as ResultLeaderboardElement;
                const style = lbEl.style || {};

                const maxRows = lbEl.maxRows ?? style.maxRows ?? 5;
                const showHeader = (lbEl.showHeader ?? style.showHeader) !== false;
                const headerText = lbEl.headerText || style.headerText || 'LEADERBOARD';
                const showRank = (lbEl.showRank ?? style.showRank) !== false;
                const showPlayerName = (lbEl.showPlayerName ?? style.showPlayerName) !== false;
                const showScore = (lbEl.showScore ?? style.showScore) !== false;
                const showMoves = Boolean(lbEl.showMoves ?? style.showMoves);
                const showTime = Boolean(lbEl.showTime ?? style.showTime);
                const showAccuracy = Boolean(lbEl.showAccuracy ?? style.showAccuracy);
                const highlightCurrentPlayer = style.highlightCurrentPlayer !== false;

                return (
                  <div className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-xl space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                      <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Trophy className="w-3.5 h-3.5" />
                        <span>Leaderboard Settings</span>
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">Dynamic Ranking</span>
                    </div>

                    {/* Header Title & Visibility */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] text-slate-400">Header Title</label>
                        <label className="flex items-center gap-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={showHeader}
                            onChange={(e) =>
                              updateElementById(lbEl.id, (prev) => ({
                                ...prev,
                                showHeader: e.target.checked,
                                style: { ...(prev as ResultLeaderboardElement).style, showHeader: e.target.checked },
                              } as ResultScreenElement))
                            }
                            className="rounded bg-slate-950 border-slate-700 text-amber-500 focus:ring-0 w-3 h-3"
                          />
                          <span className="text-[10px] text-slate-400">Show</span>
                        </label>
                      </div>
                      {showHeader && (
                        <input
                          type="text"
                          value={headerText}
                          onChange={(e) =>
                            updateElementById(lbEl.id, (prev) => ({
                              ...prev,
                              headerText: e.target.value,
                              style: { ...(prev as ResultLeaderboardElement).style, headerText: e.target.value },
                            } as ResultScreenElement))
                          }
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-200 font-bold text-xs"
                        />
                      )}
                    </div>

                    {/* Max Rows (1 to 10) */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] text-slate-400">Displayed Rows</label>
                        <span className="text-[10px] font-mono text-amber-400 font-bold">{maxRows}</span>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={10}
                        value={maxRows}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || 5;
                          updateElementById(lbEl.id, (prev) => ({
                            ...prev,
                            maxRows: val,
                            style: { ...(prev as ResultLeaderboardElement).style, maxRows: val },
                          } as ResultScreenElement));
                        }}
                        className="w-full accent-amber-500"
                      />
                    </div>

                    {/* Visible Columns Grid */}
                    <div className="space-y-1.5 pt-1 border-t border-slate-800/80">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        Visible Columns
                      </label>
                      <div className="grid grid-cols-2 gap-1.5">
                        <label className="flex items-center gap-1.5 text-xs text-slate-300 p-1.5 rounded-lg bg-slate-950/60 border border-slate-800/60 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={showRank}
                            onChange={(e) =>
                              updateElementById(lbEl.id, (prev) => ({
                                ...prev,
                                showRank: e.target.checked,
                                style: { ...(prev as ResultLeaderboardElement).style, showRank: e.target.checked },
                              } as ResultScreenElement))
                            }
                            className="rounded bg-slate-950 border-slate-700 text-amber-500 focus:ring-0 w-3 h-3"
                          />
                          <span className="text-[11px]">Rank (#)</span>
                        </label>

                        <label className="flex items-center gap-1.5 text-xs text-slate-300 p-1.5 rounded-lg bg-slate-950/60 border border-slate-800/60 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={showPlayerName}
                            onChange={(e) =>
                              updateElementById(lbEl.id, (prev) => ({
                                ...prev,
                                showPlayerName: e.target.checked,
                                style: { ...(prev as ResultLeaderboardElement).style, showPlayerName: e.target.checked },
                              } as ResultScreenElement))
                            }
                            className="rounded bg-slate-950 border-slate-700 text-amber-500 focus:ring-0 w-3 h-3"
                          />
                          <span className="text-[11px]">Player Name</span>
                        </label>

                        <label className="flex items-center gap-1.5 text-xs text-slate-300 p-1.5 rounded-lg bg-slate-950/60 border border-slate-800/60 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={showScore}
                            onChange={(e) =>
                              updateElementById(lbEl.id, (prev) => ({
                                ...prev,
                                showScore: e.target.checked,
                                style: { ...(prev as ResultLeaderboardElement).style, showScore: e.target.checked },
                              } as ResultScreenElement))
                            }
                            className="rounded bg-slate-950 border-slate-700 text-amber-500 focus:ring-0 w-3 h-3"
                          />
                          <span className="text-[11px]">Score</span>
                        </label>

                        <label className="flex items-center gap-1.5 text-xs text-slate-300 p-1.5 rounded-lg bg-slate-950/60 border border-slate-800/60 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={showMoves}
                            onChange={(e) =>
                              updateElementById(lbEl.id, (prev) => ({
                                ...prev,
                                showMoves: e.target.checked,
                                style: { ...(prev as ResultLeaderboardElement).style, showMoves: e.target.checked },
                              } as ResultScreenElement))
                            }
                            className="rounded bg-slate-950 border-slate-700 text-amber-500 focus:ring-0 w-3 h-3"
                          />
                          <span className="text-[11px]">Moves</span>
                        </label>

                        <label className="flex items-center gap-1.5 text-xs text-slate-300 p-1.5 rounded-lg bg-slate-950/60 border border-slate-800/60 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={showTime}
                            onChange={(e) =>
                              updateElementById(lbEl.id, (prev) => ({
                                ...prev,
                                showTime: e.target.checked,
                                style: { ...(prev as ResultLeaderboardElement).style, showTime: e.target.checked },
                              } as ResultScreenElement))
                            }
                            className="rounded bg-slate-950 border-slate-700 text-amber-500 focus:ring-0 w-3 h-3"
                          />
                          <span className="text-[11px]">Time</span>
                        </label>

                        <label className="flex items-center gap-1.5 text-xs text-slate-300 p-1.5 rounded-lg bg-slate-950/60 border border-slate-800/60 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={showAccuracy}
                            onChange={(e) =>
                              updateElementById(lbEl.id, (prev) => ({
                                ...prev,
                                showAccuracy: e.target.checked,
                                style: { ...(prev as ResultLeaderboardElement).style, showAccuracy: e.target.checked },
                              } as ResultScreenElement))
                            }
                            className="rounded bg-slate-950 border-slate-700 text-amber-500 focus:ring-0 w-3 h-3"
                          />
                          <span className="text-[11px]">Accuracy</span>
                        </label>
                      </div>
                    </div>

                    {/* Highlight Current Player Option */}
                    <div className="pt-1">
                      <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={highlightCurrentPlayer}
                          onChange={(e) =>
                            updateElementById(lbEl.id, (prev) => ({
                              ...prev,
                              style: {
                                ...(prev as ResultLeaderboardElement).style,
                                highlightCurrentPlayer: e.target.checked,
                              },
                            } as ResultScreenElement))
                          }
                          className="rounded bg-slate-950 border-slate-700 text-amber-500 focus:ring-0 w-3.5 h-3.5"
                        />
                        <span>Highlight Current Player Row</span>
                      </label>
                    </div>

                    {/* Typography & Sizing */}
                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800/80">
                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-400">Base Font Size</label>
                        <input
                          type="number"
                          value={style.fontSize ?? 16}
                          onChange={(e) =>
                            updateElementById(lbEl.id, (prev) => ({
                              ...prev,
                              style: {
                                ...(prev as ResultLeaderboardElement).style,
                                fontSize: parseInt(e.target.value) || 16,
                              },
                            } as ResultScreenElement))
                          }
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-slate-200 font-mono text-xs"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-400">Corner Radius</label>
                        <input
                          type="number"
                          value={style.borderRadius ?? 18}
                          onChange={(e) =>
                            updateElementById(lbEl.id, (prev) => ({
                              ...prev,
                              style: {
                                ...(prev as ResultLeaderboardElement).style,
                                borderRadius: parseInt(e.target.value) || 0,
                              },
                            } as ResultScreenElement))
                          }
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-slate-200 font-mono text-xs"
                        />
                      </div>
                    </div>

                    {/* Colors */}
                    <div className="space-y-1.5 pt-1 border-t border-slate-800/80">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        Theme Colors
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="space-y-1">
                          <span className="text-[9px] text-slate-400 block">Header</span>
                          <input
                            type="color"
                            value={style.headerColor?.startsWith('#') && style.headerColor.length === 7 ? style.headerColor : '#fbbf24'}
                            onChange={(e) =>
                              updateElementById(lbEl.id, (prev) => ({
                                ...prev,
                                style: { ...(prev as ResultLeaderboardElement).style, headerColor: e.target.value },
                              } as ResultScreenElement))
                            }
                            className="w-full h-6 rounded border border-slate-700 bg-transparent cursor-pointer"
                          />
                        </div>

                        <div className="space-y-1">
                          <span className="text-[9px] text-slate-400 block">Scores</span>
                          <input
                            type="color"
                            value={style.scoreColor?.startsWith('#') && style.scoreColor.length === 7 ? style.scoreColor : '#fbbf24'}
                            onChange={(e) =>
                              updateElementById(lbEl.id, (prev) => ({
                                ...prev,
                                style: { ...(prev as ResultLeaderboardElement).style, scoreColor: e.target.value },
                              } as ResultScreenElement))
                            }
                            className="w-full h-6 rounded border border-slate-700 bg-transparent cursor-pointer"
                          />
                        </div>

                        <div className="space-y-1">
                          <span className="text-[9px] text-slate-400 block">Text</span>
                          <input
                            type="color"
                            value={style.textColor?.startsWith('#') && style.textColor.length === 7 ? style.textColor : '#f8fafc'}
                            onChange={(e) =>
                              updateElementById(lbEl.id, (prev) => ({
                                ...prev,
                                style: { ...(prev as ResultLeaderboardElement).style, textColor: e.target.value },
                              } as ResultScreenElement))
                            }
                            className="w-full h-6 rounded border border-slate-700 bg-transparent cursor-pointer"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Player Submission Form Labels & Config */}
                    <div className="space-y-2 pt-1 border-t border-slate-800/80">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        Player Submission Form
                      </span>

                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-400">Input Placeholder</label>
                        <input
                          type="text"
                          value={lbEl.inputPlaceholder ?? style.inputPlaceholder ?? lbEl.submission?.inputPlaceholder ?? 'Enter your name'}
                          onChange={(e) =>
                            updateElementById(lbEl.id, (prev) => ({
                              ...prev,
                              inputPlaceholder: e.target.value,
                              style: { ...(prev as ResultLeaderboardElement).style, inputPlaceholder: e.target.value },
                            } as ResultScreenElement))
                          }
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-200 text-xs"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-[10px] text-slate-400">Max Name Length</label>
                          <input
                            type="number"
                            min={3}
                            max={50}
                            value={lbEl.inputMaxLength ?? style.inputMaxLength ?? lbEl.submission?.inputMaxLength ?? 20}
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || 20;
                              updateElementById(lbEl.id, (prev) => ({
                                ...prev,
                                inputMaxLength: val,
                                style: { ...(prev as ResultLeaderboardElement).style, inputMaxLength: val },
                              } as ResultScreenElement));
                            }}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-slate-200 font-mono text-xs"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] text-slate-400">Button Label</label>
                          <input
                            type="text"
                            value={lbEl.submitButtonText ?? style.submitButtonText ?? lbEl.submission?.submitButtonText ?? 'SUBMIT SCORE'}
                            onChange={(e) =>
                              updateElementById(lbEl.id, (prev) => ({
                                ...prev,
                                submitButtonText: e.target.value,
                                style: { ...(prev as ResultLeaderboardElement).style, submitButtonText: e.target.value },
                              } as ResultScreenElement))
                            }
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-slate-200 text-xs font-semibold"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-400">Success Message</label>
                        <input
                          type="text"
                          value={lbEl.successMessage ?? style.successMessage ?? lbEl.submission?.successMessage ?? 'Score submitted!'}
                          onChange={(e) =>
                            updateElementById(lbEl.id, (prev) => ({
                              ...prev,
                              successMessage: e.target.value,
                              style: { ...(prev as ResultLeaderboardElement).style, successMessage: e.target.value },
                            } as ResultScreenElement))
                          }
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-200 text-xs"
                        />
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* 7. GROUP ELEMENT */}
              {selectedElement.type === 'group' && (() => {
                const groupEl = selectedElement as ResultGroupElement;
                return (
                  <div className="space-y-2 bg-slate-900/80 border border-slate-800 rounded-xl p-3">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Group Container
                    </span>
                    <p className="text-xs text-slate-400">
                      Contains {groupEl.children?.length || 0} child element(s). Moves together as a collective unit.
                    </p>
                  </div>
                );
              })()}

              {/* Quick Actions (Duplicate / Delete) */}
              <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => handleDuplicateElement(selectedElement.id)}
                  className="flex-1 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-xl flex items-center justify-center gap-1.5 font-bold text-slate-200 text-xs transition-colors cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Duplicate</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteElement(selectedElement.id)}
                  className="flex-1 py-2 bg-rose-950/40 hover:bg-rose-950/80 border border-rose-900/60 rounded-xl flex items-center justify-center gap-1.5 font-bold text-rose-300 text-xs transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-slate-500 space-y-2">
              <SlidersHorizontal className="w-8 h-8 mx-auto opacity-30 text-slate-400" />
              <p>Select any element on the canvas or layer tree to view and edit its properties.</p>
            </div>
          )}
        </div>
      </div>

      {/* Pro Fullscreen Studio Modal */}
      {isModalOpen && (
        <ResultScreenVisualEditorModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          resultConfig={resultConfig}
          theme={theme}
          onChange={onChange}
          onUploadAsset={onUploadAsset}
          historyController={history}
        />
      )}

      {/* Preset Library & Custom Templates Modal */}
      {isPresetsModalOpen && (
        <PresetLibraryModal
          isOpen={isPresetsModalOpen}
          onClose={() => setIsPresetsModalOpen(false)}
          hasExistingElements={(resultConfig.elements || []).length > 0}
          onOpenSaveTemplateModal={() => setIsSaveTemplateModalOpen(true)}
          onApplyPreset={(newElements) => {
            updateElements(newElements);
            setSelectedIds([]);
          }}
        />
      )}

      {/* Save Custom Template Modal */}
      {isSaveTemplateModalOpen && (
        <SaveTemplateModal
          isOpen={isSaveTemplateModalOpen}
          onClose={() => setIsSaveTemplateModalOpen(false)}
          elements={resultConfig.elements || []}
          onTemplateSaved={(savedTemplate) => {
            // Saved successfully
          }}
        />
      )}
    </div>
  );
};
