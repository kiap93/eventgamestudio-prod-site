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
  ResultScreenElementType,
  MemoryMatchResultScreenConfig,
  generateDefaultResultScreenElements,
} from '../../../games/memory-match/types';
import { GameTheme } from '../../../themes/types';
import { resolveScreenBackground } from '../../../themes/screenBackground';
import {
  Layers,
  Square,
  Image as ImageIcon,
  Type,
  Award,
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
  Upload,
  SlidersHorizontal,
  Palette,
  Loader2,
  RefreshCw,
  ArrowUp,
  ArrowDown,
  CornerDownRight,
  LogOut,
  FolderPlus,
} from 'lucide-react';

interface ResultScreenVisualEditorProps {
  resultConfig: MemoryMatchResultScreenConfig;
  theme: Partial<GameTheme>;
  onChange: (updatedConfig: Partial<MemoryMatchResultScreenConfig>) => void;
  onUploadAsset?: (file: File, type: string) => Promise<string>;
}

export const ResultScreenVisualEditor: React.FC<ResultScreenVisualEditorProps> = ({
  resultConfig,
  theme,
  onChange,
  onUploadAsset,
}) => {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Logical canvas dimensions (always 1000 x 1000)
  const canvasWidth = resultConfig.canvas?.width || 1000;
  const canvasHeight = resultConfig.canvas?.height || 1000;

  // Selected element ID
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
  } | null>(null);

  // Elements array guarantee
  const elements: ResultScreenElement[] =
    Array.isArray(resultConfig.elements) && resultConfig.elements.length > 0
      ? resultConfig.elements
      : generateDefaultResultScreenElements(resultConfig);

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

  const selectedResult = selectedId ? findElementAndParent(selectedId, elements) : null;
  const selectedElement = selectedResult?.element || null;
  const selectedParentElement = selectedResult?.parent || null;

  // Update elements helper
  const updateElements = (newElements: ResultScreenElement[]) => {
    onChange({
      elements: newElements,
    });
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
      updateElements([...listWithoutElement, updatedElement]);
    } else {
      const insertRecursive = (list: ResultScreenElement[]): ResultScreenElement[] => {
        return list.map((item) => {
          if (item.id === targetContainerId) {
            const children = (item as ResultCardElement | ResultGroupElement).children || [];
            return {
              ...item,
              children: [...children, updatedElement],
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

    updateElementById(parentId, (prev) => ({
      ...prev,
      children: [...((prev as ResultCardElement | ResultGroupElement).children || []), newChild],
    }));

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

      updateElementById(parentEl.id, (prev) => ({
        ...prev,
        children: [...((prev as ResultCardElement | ResultGroupElement).children || []), newElement],
      }));
      setExpandedCardIds((prev) => ({ ...prev, [parentEl.id]: true }));
    } else {
      // Add at root level
      updateElements([...elements, newElement]);
    }

    setSelectedId(newId);
    setAddMenuOpen(false);
  };

  // Delete Element (Removes container and its entire subtree cleanly)
  const handleDeleteElement = (id: string) => {
    const recursiveDelete = (list: ResultScreenElement[]): ResultScreenElement[] => {
      return list
        .filter((item) => item.id !== id)
        .map((item) => {
          if (item.type === 'card' && (item as ResultCardElement).children) {
            return {
              ...item,
              children: recursiveDelete((item as ResultCardElement).children || []),
            } as ResultCardElement;
          }
          if (item.type === 'group' && (item as ResultGroupElement).children) {
            return {
              ...item,
              children: recursiveDelete((item as ResultGroupElement).children || []),
            } as ResultGroupElement;
          }
          return item;
        });
    };

    updateElements(recursiveDelete(elements));
    if (selectedId === id || (selectedId && isDescendantOf(selectedId, id, elements))) {
      setSelectedId(null);
    }
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
      updateElementById(found.parent.id, (prev) => ({
        ...prev,
        children: [...((prev as ResultCardElement | ResultGroupElement).children || []), duplicated],
      }));
    } else {
      updateElements([...elements, duplicated]);
    }

    setSelectedId(duplicated.id);
  };

  // Move Layer Ordering (Up = higher z / forward, Down = lower z / backward)
  const handleMoveLayer = (id: string, direction: 'up' | 'down') => {
    const reorderList = (list: ResultScreenElement[]): ResultScreenElement[] => {
      const index = list.findIndex((item) => item.id === id);
      if (index !== -1) {
        const newList = [...list];
        if (direction === 'up' && index < newList.length - 1) {
          const temp = newList[index];
          newList[index] = newList[index + 1];
          newList[index + 1] = temp;
        } else if (direction === 'down' && index > 0) {
          const temp = newList[index];
          newList[index] = newList[index - 1];
          newList[index - 1] = temp;
        }
        return newList;
      }
      return list.map((item) => {
        if (item.type === 'card' && (item as ResultCardElement).children) {
          return {
            ...item,
            children: reorderList((item as ResultCardElement).children || []),
          } as ResultCardElement;
        }
        if (item.type === 'group' && (item as ResultGroupElement).children) {
          return {
            ...item,
            children: reorderList((item as ResultGroupElement).children || []),
          } as ResultGroupElement;
        }
        return item;
      });
    };

    updateElements(reorderList(elements));
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
    setSelectedId(el.id);

    setInteractionMode('drag');
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
    setSelectedId(el.id);

    setInteractionMode('resize');
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
    setSelectedId(el.id);

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
        centerX,
        centerY,
        startAngle,
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
        const nextX = Math.round(initialX + deltaLogicalX);
        const nextY = Math.round(initialY + deltaLogicalY);

        updateElementById(elementId, (prev) => ({
          ...prev,
          x: nextX,
          y: nextY,
        } as ResultScreenElement));
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
      setInteractionMode('idle');
      interactionRef.current = null;
    };

    if (interactionMode !== 'idle') {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [interactionMode, canvasWidth, canvasHeight]);

  // Keyboard Navigation & Shortcuts (Arrow nudge, Delete, Escape)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName?.toLowerCase();
      const isEditingText =
        activeTag === 'input' ||
        activeTag === 'textarea' ||
        activeTag === 'select' ||
        (document.activeElement as HTMLElement)?.isContentEditable;

      if (isEditingText || !selectedId) return;

      const step = e.shiftKey ? 10 : 1;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        updateElementById(selectedId, (prev) => ({
          ...prev,
          x: Math.round(prev.x - step),
        } as ResultScreenElement));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        updateElementById(selectedId, (prev) => ({
          ...prev,
          x: Math.round(prev.x + step),
        } as ResultScreenElement));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        updateElementById(selectedId, (prev) => ({
          ...prev,
          y: Math.round(prev.y - step),
        } as ResultScreenElement));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        updateElementById(selectedId, (prev) => ({
          ...prev,
          y: Math.round(prev.y + step),
        } as ResultScreenElement));
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        handleDeleteElement(selectedId);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setSelectedId(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedId, elements]);

  const bg = resolveScreenBackground(resultConfig, theme);

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
      case 'group':
        return <FolderTree className="w-3.5 h-3.5 text-slate-400" />;
      default:
        return <Box className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  // Render an element on the canvas with interactive selection bounds & drag handles
  const renderCanvasElement = (
    el: ResultScreenElement,
    parentWidth: number,
    parentHeight: number
  ): React.ReactNode => {
    const isSelected = selectedId === el.id;
    const isVisible = el.visible !== false;
    const isParentOfSelected = selectedParentElement?.id === el.id;

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

    let innerContent: React.ReactNode = null;

    switch (el.type) {
      case 'card': {
        const cardEl = el as ResultCardElement;
        const style = cardEl.style;
        innerContent = (
          <div
            style={{
              width: '100%',
              height: '100%',
              backgroundColor: style?.backgroundColor || 'rgba(15, 23, 42, 0.95)',
              backgroundImage: style?.backgroundImageUrl ? `url(${style.backgroundImageUrl})` : undefined,
              backgroundSize: style?.backgroundSize || 'cover',
              backgroundPosition: style?.backgroundPosition || 'center',
              backgroundRepeat: style?.backgroundRepeat || 'no-repeat',
              borderWidth: typeof style?.borderWidth === 'number' ? `${(style.borderWidth / parentWidth) * 100}cqi` : '1px',
              borderStyle: 'solid',
              borderColor: style?.borderColor || '#334155',
              borderRadius: typeof style?.borderRadius === 'number' ? `${(style.borderRadius / parentWidth) * 100}cqi` : '24px',
              boxShadow: style?.shadow !== false ? '0 25px 50px -12px rgba(0, 0, 0, 0.5)' : undefined,
              backdropFilter: 'blur(12px)',
              position: 'relative',
              overflow: 'hidden',
              containerType: 'inline-size',
            }}
          >
            {Array.isArray(cardEl.children) &&
              cardEl.children.map((child) => renderCanvasElement(child, cardEl.width, cardEl.height))}
          </div>
        );
        break;
      }

      case 'group': {
        const groupEl = el as ResultGroupElement;
        innerContent = (
          <div className="w-full h-full relative">
            {Array.isArray(groupEl.children) &&
              groupEl.children.map((child) => renderCanvasElement(child, groupEl.width, groupEl.height))}
          </div>
        );
        break;
      }

      case 'text': {
        const textEl = el as ResultTextElement;
        const textStyle = textEl.style;
        innerContent = (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent:
                textStyle?.textAlign === 'left'
                  ? 'flex-start'
                  : textStyle?.textAlign === 'right'
                  ? 'flex-end'
                  : 'center',
              color: textStyle?.color || '#ffffff',
              fontSize: textStyle?.fontSize ? `clamp(11px, ${textStyle.fontSize * 0.55}cqi, 40px)` : '1.5cqi',
              fontWeight: textStyle?.fontWeight || 'bold',
              lineHeight: textStyle?.lineHeight ?? 1.2,
              userSelect: 'none',
            }}
            className="truncate select-none pointer-events-none"
          >
            <span className="truncate w-full">{textEl.text}</span>
          </div>
        );
        break;
      }

      case 'image': {
        const imgEl = el as ResultImageElement;
        innerContent = (
          <div className="w-full h-full flex items-center justify-center overflow-hidden pointer-events-none select-none">
            {imgEl.imageUrl ? (
              <img
                src={imgEl.imageUrl}
                alt=""
                className="w-full h-full select-none"
                style={{ objectFit: imgEl.objectFit || 'contain' }}
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-slate-800/40 rounded-xl text-slate-500 border border-slate-700/50">
                <ImageIcon className="w-8 h-8 opacity-40" />
              </div>
            )}
          </div>
        );
        break;
      }

      case 'score': {
        const statEl = el as ResultScoreElement;
        const style = statEl.style;
        innerContent = (
          <div
            style={{
              width: '100%',
              height: '100%',
              backgroundColor: style?.backgroundColor || 'rgba(2, 6, 23, 0.85)',
              borderColor: style?.borderColor || '#334155',
              borderWidth: '1px',
              borderStyle: 'solid',
              borderRadius: typeof style?.borderRadius === 'number' ? `${(style.borderRadius / parentHeight) * 100}%` : '16px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '4px 8px',
            }}
            className="shadow-inner text-center overflow-hidden pointer-events-none select-none"
          >
            {style?.showLabel !== false && (
              <span
                style={{
                  color: style?.labelColor || '#94a3b8',
                  textAlign: style?.textAlign || 'center',
                }}
                className="text-[10px] font-bold uppercase tracking-wider block truncate w-full"
              >
                {statEl.label || 'SCORE'}
              </span>
            )}
            <span
              style={{
                color: style?.valueColor || '#fbbf24',
                fontSize: style?.fontSize ? `clamp(11px, ${style.fontSize * 0.55}cqi, 48px)` : undefined,
                textAlign: style?.textAlign || 'center',
              }}
              className="text-base sm:text-2xl font-black font-mono block tracking-tight truncate w-full"
            >
              1,250
            </span>
          </div>
        );
        break;
      }

      case 'moves': {
        const statEl = el as ResultMovesElement;
        const style = statEl.style;
        innerContent = (
          <div
            style={{
              width: '100%',
              height: '100%',
              backgroundColor: style?.backgroundColor || 'rgba(2, 6, 23, 0.85)',
              borderColor: style?.borderColor || '#334155',
              borderWidth: '1px',
              borderStyle: 'solid',
              borderRadius: typeof style?.borderRadius === 'number' ? `${(style.borderRadius / parentHeight) * 100}%` : '16px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '4px 8px',
            }}
            className="shadow-inner text-center overflow-hidden pointer-events-none select-none"
          >
            {style?.showLabel !== false && (
              <span
                style={{
                  color: style?.labelColor || '#94a3b8',
                  textAlign: style?.textAlign || 'center',
                }}
                className="text-[10px] font-bold uppercase tracking-wider block truncate w-full"
              >
                {statEl.label || 'MOVES'}
              </span>
            )}
            <span
              style={{
                color: style?.valueColor || '#67e8f9',
                fontSize: style?.fontSize ? `clamp(11px, ${style.fontSize * 0.55}cqi, 48px)` : undefined,
                textAlign: style?.textAlign || 'center',
              }}
              className="text-base sm:text-2xl font-black font-mono block tracking-tight truncate w-full"
            >
              14
            </span>
          </div>
        );
        break;
      }

      case 'pairs': {
        const statEl = el as ResultPairsElement;
        const style = statEl.style;
        innerContent = (
          <div
            style={{
              width: '100%',
              height: '100%',
              backgroundColor: style?.backgroundColor || 'rgba(2, 6, 23, 0.85)',
              borderColor: style?.borderColor || '#334155',
              borderWidth: '1px',
              borderStyle: 'solid',
              borderRadius: typeof style?.borderRadius === 'number' ? `${(style.borderRadius / parentHeight) * 100}%` : '16px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '4px 8px',
            }}
            className="shadow-inner text-center overflow-hidden pointer-events-none select-none"
          >
            {style?.showLabel !== false && (
              <span
                style={{
                  color: style?.labelColor || '#94a3b8',
                  textAlign: style?.textAlign || 'center',
                }}
                className="text-[10px] font-bold uppercase tracking-wider block truncate w-full"
              >
                {statEl.label || 'PAIRS'}
              </span>
            )}
            <span
              style={{
                color: style?.valueColor || '#34d399',
                fontSize: style?.fontSize ? `clamp(11px, ${style.fontSize * 0.55}cqi, 48px)` : undefined,
                textAlign: style?.textAlign || 'center',
              }}
              className="text-base sm:text-2xl font-black font-mono block tracking-tight truncate w-full"
            >
              8/8
            </span>
          </div>
        );
        break;
      }

      case 'time': {
        const statEl = el as ResultTimeElement;
        const style = statEl.style;
        innerContent = (
          <div
            style={{
              width: '100%',
              height: '100%',
              backgroundColor: style?.backgroundColor || 'rgba(2, 6, 23, 0.85)',
              borderColor: style?.borderColor || '#334155',
              borderWidth: '1px',
              borderStyle: 'solid',
              borderRadius: typeof style?.borderRadius === 'number' ? `${(style.borderRadius / parentHeight) * 100}%` : '16px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '4px 8px',
            }}
            className="shadow-inner text-center overflow-hidden pointer-events-none select-none"
          >
            {style?.showLabel !== false && (
              <span
                style={{
                  color: style?.labelColor || '#94a3b8',
                  textAlign: style?.textAlign || 'center',
                }}
                className="text-[10px] font-bold uppercase tracking-wider block truncate w-full"
              >
                {statEl.label || 'TIME'}
              </span>
            )}
            <span
              style={{
                color: style?.valueColor || '#38bdf8',
                fontSize: style?.fontSize ? `clamp(11px, ${style.fontSize * 0.55}cqi, 48px)` : undefined,
                textAlign: style?.textAlign || 'center',
              }}
              className="text-base sm:text-2xl font-black font-mono block tracking-tight truncate w-full"
            >
              24s
            </span>
          </div>
        );
        break;
      }

      case 'accuracy': {
        const statEl = el as ResultAccuracyElement;
        const style = statEl.style;
        innerContent = (
          <div
            style={{
              width: '100%',
              height: '100%',
              backgroundColor: style?.backgroundColor || 'rgba(2, 6, 23, 0.85)',
              borderColor: style?.borderColor || '#334155',
              borderWidth: '1px',
              borderStyle: 'solid',
              borderRadius: typeof style?.borderRadius === 'number' ? `${(style.borderRadius / parentHeight) * 100}%` : '16px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '4px 8px',
            }}
            className="shadow-inner text-center overflow-hidden pointer-events-none select-none"
          >
            {style?.showLabel !== false && (
              <span
                style={{
                  color: style?.labelColor || '#94a3b8',
                  textAlign: style?.textAlign || 'center',
                }}
                className="text-[10px] font-bold uppercase tracking-wider block truncate w-full"
              >
                {statEl.label || 'ACCURACY'}
              </span>
            )}
            <span
              style={{
                color: style?.valueColor || '#c084fc',
                fontSize: style?.fontSize ? `clamp(11px, ${style.fontSize * 0.55}cqi, 48px)` : undefined,
                textAlign: style?.textAlign || 'center',
              }}
              className="text-base sm:text-2xl font-black font-mono block tracking-tight truncate w-full"
            >
              88%
            </span>
          </div>
        );
        break;
      }

      case 'button': {
        const btnEl = el as ResultButtonElement;
        const style = btnEl.style;
        innerContent = (
          <div
            style={{
              width: '100%',
              height: '100%',
              backgroundColor: style?.backgroundColor || '#f59e0b',
              color: style?.textColor || '#020617',
              borderColor: style?.borderColor,
              borderWidth: typeof style?.borderWidth === 'number' ? `${style.borderWidth}px` : undefined,
              borderStyle: typeof style?.borderWidth === 'number' && style.borderWidth > 0 ? 'solid' : undefined,
              borderRadius: typeof style?.borderRadius === 'number' ? `${(style.borderRadius / parentHeight) * 100}%` : '18px',
              fontSize: style?.fontSize ? `clamp(12px, ${style.fontSize * 0.55}cqi, 26px)` : '1.3cqi',
              fontWeight: style?.fontWeight || '900',
              boxShadow: style?.shadow !== false ? '0 10px 25px -5px rgba(245, 158, 11, 0.4)' : undefined,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
            className="uppercase tracking-wider pointer-events-none select-none"
          >
            <RotateCcw className="w-4 h-4 shrink-0" />
            <span className="truncate">{btnEl.text}</span>
          </div>
        );
        break;
      }
    }

    return (
      <div
        key={el.id}
        id={`canvas-el-${el.id}`}
        style={commonStyle}
        onMouseDown={(e) => handleMouseDown(e, el, parentWidth, parentHeight)}
        className="group relative"
      >
        {innerContent}

        {/* Selection bounding box, 8 resize handles, and rotation stalk */}
        {isSelected && (
          <div className="absolute -inset-0.5 border-2 border-amber-400 pointer-events-none z-50">
            {/* Rotation Stalk and Knob */}
            <div className="absolute -top-7 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-auto">
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
              className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-amber-400 border border-slate-950 rounded-sm cursor-nwse-resize pointer-events-auto hover:scale-125 transition-transform shadow"
              title="Resize Top-Left"
            />
            <div
              onMouseDown={(e) => handleResizeMouseDown(e, el, parentWidth, parentHeight, 'tr')}
              className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-amber-400 border border-slate-950 rounded-sm cursor-nesw-resize pointer-events-auto hover:scale-125 transition-transform shadow"
              title="Resize Top-Right"
            />
            <div
              onMouseDown={(e) => handleResizeMouseDown(e, el, parentWidth, parentHeight, 'bl')}
              className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-amber-400 border border-slate-950 rounded-sm cursor-nesw-resize pointer-events-auto hover:scale-125 transition-transform shadow"
              title="Resize Bottom-Left"
            />
            <div
              onMouseDown={(e) => handleResizeMouseDown(e, el, parentWidth, parentHeight, 'br')}
              className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-amber-400 border border-slate-950 rounded-sm cursor-nwse-resize pointer-events-auto hover:scale-125 transition-transform shadow"
              title="Resize Bottom-Right"
            />

            {/* Edge Resize Handles */}
            <div
              onMouseDown={(e) => handleResizeMouseDown(e, el, parentWidth, parentHeight, 't')}
              className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-amber-400 border border-slate-950 rounded-sm cursor-ns-resize pointer-events-auto hover:scale-125 transition-transform shadow"
              title="Resize Top Edge"
            />
            <div
              onMouseDown={(e) => handleResizeMouseDown(e, el, parentWidth, parentHeight, 'b')}
              className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-amber-400 border border-slate-950 rounded-sm cursor-ns-resize pointer-events-auto hover:scale-125 transition-transform shadow"
              title="Resize Bottom Edge"
            />
            <div
              onMouseDown={(e) => handleResizeMouseDown(e, el, parentWidth, parentHeight, 'l')}
              className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-3 h-3 bg-amber-400 border border-slate-950 rounded-sm cursor-ew-resize pointer-events-auto hover:scale-125 transition-transform shadow"
              title="Resize Left Edge"
            />
            <div
              onMouseDown={(e) => handleResizeMouseDown(e, el, parentWidth, parentHeight, 'r')}
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
    const isSelected = selectedId === el.id;
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
          onClick={() => setSelectedId(el.id)}
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
                : `${el.type.charAt(0).toUpperCase() + el.type.slice(1)}`}
            </span>

            {/* Item Count for Card/Group */}
            {isCardOrGroup && (
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-400 border border-slate-700 shrink-0">
                {children?.length || 0}
              </span>
            )}
          </div>

          {/* Action buttons on hover / active */}
          <div className="flex items-center gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
            {/* Move Layer Up / Down */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleMoveLayer(el.id, 'up');
              }}
              className="p-1 rounded hover:bg-slate-700/80 text-slate-400 hover:text-slate-200"
              title="Move Forward / Up"
            >
              <ArrowUp className="w-3 h-3" />
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleMoveLayer(el.id, 'down');
              }}
              className="p-1 rounded hover:bg-slate-700/80 text-slate-400 hover:text-slate-200"
              title="Move Backward / Down"
            >
              <ArrowDown className="w-3 h-3" />
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

  const handleAlignCenterX = () => {
    if (!selectedElement) return;
    const parentW = selectedParentElement ? selectedParentElement.width : canvasWidth;
    const newX = Math.max(0, Math.round((parentW - selectedElement.width) / 2));
    updateElementById(selectedElement.id, (prev) => ({ ...prev, x: newX }));
  };

  const handleAlignCenterY = () => {
    if (!selectedElement) return;
    const parentH = selectedParentElement ? selectedParentElement.height : canvasHeight;
    const newY = Math.max(0, Math.round((parentH - selectedElement.height) / 2));
    updateElementById(selectedElement.id, (prev) => ({ ...prev, y: newY }));
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
            <div className="absolute right-0 top-full mt-2 w-52 bg-slate-950 border border-slate-800 rounded-2xl p-2 shadow-2xl z-50 space-y-1">
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
                <Type className="w-4 h-4 text-slate-300" />
                <span>Text Label</span>
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
                <Award className="w-4 h-4 text-amber-400" />
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
                onClick={() => handleAddElement('accuracy')}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-200 hover:bg-slate-900 transition-colors text-left"
              >
                <Zap className="w-4 h-4 text-purple-400" />
                <span>Accuracy %</span>
              </button>
              <button
                type="button"
                onClick={() => handleAddElement('time')}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-200 hover:bg-slate-900 transition-colors text-left"
              >
                <Clock className="w-4 h-4 text-sky-400" />
                <span>Time Elapsed</span>
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
                <span>Action Button</span>
              </button>
            </div>
          )}
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

        {/* CENTER PANEL: Visual 1000x1000 Design Canvas */}
        <div className="lg:col-span-5 flex flex-col items-center justify-center">
          <div
            ref={canvasRef}
            onClick={() => setSelectedId(null)}
            className="relative w-full aspect-square max-w-[480px] rounded-2xl border-2 border-slate-700/80 shadow-2xl overflow-hidden select-none"
            style={{
              ...bg.containerStyle,
              containerType: 'inline-size',
            }}
          >
            {/* Background Overlay */}
            <div className="absolute inset-0 pointer-events-none" style={bg.overlayStyle} />

            {/* Canvas Elements */}
            {elements.map((el) => renderCanvasElement(el, canvasWidth, canvasHeight))}
          </div>

          <div className="flex items-center gap-2 mt-2 text-[11px] text-slate-500 font-mono">
            <span>Canvas: 1000 × 1000 px</span>
            <span>•</span>
            <span>Drag items to move</span>
          </div>
        </div>

        {/* RIGHT PANEL: Properties / Inspector */}
        <div className="lg:col-span-4 bg-slate-950 border border-slate-800 rounded-2xl p-3.5 space-y-3 max-h-[700px] overflow-y-auto">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-amber-400" />
              <span>Property Inspector</span>
            </span>
            {selectedElement && (
              <span className="text-[10px] font-mono text-amber-400/80 font-bold uppercase">
                {selectedElement.type}
              </span>
            )}
          </div>

          {selectedElement ? (
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
                        onClick={() => handleMoveLayer(selectedElement.id, 'up')}
                        className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-slate-200 text-[11px] font-medium flex items-center gap-1 transition-colors"
                        title="Bring Forward / Up in Layer Stack"
                      >
                        <ArrowUp className="w-3 h-3" />
                        <span>Bring Forward</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveLayer(selectedElement.id, 'down')}
                        className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-slate-200 text-[11px] font-medium flex items-center gap-1 transition-colors"
                        title="Send Backward / Down in Layer Stack"
                      >
                        <ArrowDown className="w-3 h-3" />
                        <span>Send Backward</span>
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
                                  : `${child.type.charAt(0).toUpperCase() + child.type.slice(1)}`}
                              </span>
                            </div>

                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMoveLayer(child.id, 'up');
                                }}
                                className="p-0.5 rounded text-slate-500 hover:text-slate-200"
                                title="Move Up"
                              >
                                <ArrowUp className="w-2.5 h-2.5" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMoveLayer(child.id, 'down');
                                }}
                                className="p-0.5 rounded text-slate-500 hover:text-slate-200"
                                title="Move Down"
                              >
                                <ArrowDown className="w-2.5 h-2.5" />
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

              {/* Quick Alignment Helpers */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <SlidersHorizontal className="w-3 h-3 text-amber-400" />
                  <span>Alignment</span>
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={handleAlignCenterX}
                    className="py-1.5 px-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-300 text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors"
                  >
                    <span>Center Horizontally</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleAlignCenterY}
                    className="py-1.5 px-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-300 text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors"
                  >
                    <span>Center Vertically</span>
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
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800">
                  <div>
                    <span className="text-[10px] text-slate-500 block mb-1">Z-Index</span>
                    <input
                      type="number"
                      value={selectedElement.zIndex ?? 1}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        updateElementById(selectedElement.id, (prev) => ({ ...prev, zIndex: val }));
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
                                } as ResultScreenElement));
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
                                } as ResultScreenElement));
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
                                } as ResultScreenElement));
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

                    {/* Drop Shadow Toggle */}
                    <label className="flex items-center gap-2 cursor-pointer pt-1">
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
                  </div>
                );
              })()}

              {/* 2. IMAGE ELEMENT */}
              {selectedElement.type === 'image' && (() => {
                const imgEl = selectedElement as ResultImageElement;
                return (
                  <div className="space-y-3 bg-slate-900/80 border border-slate-800 rounded-xl p-3">
                    <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">
                      Image Properties
                    </span>

                    {/* Image URL with Upload Button */}
                    <div className="space-y-1">
                      <span className="text-[11px] text-slate-400 block">Image Source URL</span>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={imgEl.imageUrl || ''}
                          placeholder="https://..."
                          onChange={(e) => {
                            const val = e.target.value;
                            updateElementById(selectedElement.id, (prev) => ({
                              ...prev,
                              imageUrl: val || null,
                            } as ResultScreenElement));
                          }}
                          className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-slate-200 text-xs font-mono"
                        />
                        {onUploadAsset && (
                          <button
                            type="button"
                            onClick={() => {
                              setUploadTarget({ elementId: selectedElement.id, field: 'imageUrl' });
                              fileInputRef.current?.click();
                            }}
                            disabled={isUploadingAsset}
                            className="p-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg transition-colors"
                            title="Upload Image"
                          >
                            {isUploadingAsset ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Object Fit */}
                    <div className="space-y-1">
                      <span className="text-[11px] text-slate-400 block">Object Fit Mode</span>
                      <div className="grid grid-cols-3 gap-1">
                        {(['contain', 'cover', 'fill'] as const).map((fit) => (
                          <button
                            key={fit}
                            type="button"
                            onClick={() => {
                              updateElementById(selectedElement.id, (prev) => ({
                                ...prev,
                                objectFit: fit,
                              } as ResultScreenElement));
                            }}
                            className={`py-1 rounded-lg text-xs font-semibold uppercase transition-colors ${
                              (imgEl.objectFit || 'contain') === fit
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold'
                                : 'bg-slate-950 text-slate-400 border border-slate-800 hover:bg-slate-800'
                            }`}
                          >
                            {fit}
                          </button>
                        ))}
                      </div>
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
                    <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider block">
                      Text Properties
                    </span>

                    {/* Content Text */}
                    <div className="space-y-1">
                      <span className="text-[11px] text-slate-400 block">Text Content</span>
                      <input
                        type="text"
                        value={textEl.text}
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

                    {/* Font Size & Weight */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-[11px] text-slate-400 block">Font Size (px)</span>
                        <input
                          type="number"
                          min={8}
                          max={120}
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
                          value={textStyle.fontWeight || 'bold'}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateElementById(selectedElement.id, (prev) => ({
                              ...prev,
                              style: { ...(prev as ResultTextElement).style, fontWeight: val },
                            } as ResultScreenElement));
                          }}
                          className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-100 text-xs mt-1"
                        >
                          <option value="normal">Normal</option>
                          <option value="600">Semi Bold</option>
                          <option value="bold">Bold</option>
                          <option value="900">Black (900)</option>
                        </select>
                      </div>
                    </div>

                    {/* Text Alignment */}
                    <div className="space-y-1">
                      <span className="text-[11px] text-slate-400 block">Text Alignment</span>
                      <div className="grid grid-cols-3 gap-1">
                        {(['left', 'center', 'right'] as const).map((align) => (
                          <button
                            key={align}
                            type="button"
                            onClick={() => {
                              updateElementById(selectedElement.id, (prev) => ({
                                ...prev,
                                style: { ...(prev as ResultTextElement).style, textAlign: align },
                              } as ResultScreenElement));
                            }}
                            className={`py-1 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition-colors ${
                              (textStyle.textAlign || 'center') === align
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold'
                                : 'bg-slate-950 text-slate-400 border border-slate-800 hover:bg-slate-800'
                            }`}
                          >
                            {align === 'left' && <AlignLeft className="w-3.5 h-3.5" />}
                            {align === 'center' && <AlignCenter className="w-3.5 h-3.5" />}
                            {align === 'right' && <AlignRight className="w-3.5 h-3.5" />}
                            <span className="capitalize text-[11px]">{align}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Text Color */}
                    <div className="space-y-1">
                      <span className="text-[11px] text-slate-400 block">Text Color</span>
                      <div className="flex items-center gap-2">
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
                          className="w-7 h-7 rounded border border-slate-700 cursor-pointer bg-transparent"
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
                          className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-200 text-xs font-mono"
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
                    <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">
                      Stat Widget Settings
                    </span>

                    {/* Label Text */}
                    <div className="space-y-1">
                      <span className="text-[11px] text-slate-400 block">Label Text</span>
                      <input
                        type="text"
                        value={statEl.label || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          updateElementById(selectedElement.id, (prev) => ({
                            ...prev,
                            label: val,
                          } as ResultScreenElement));
                        }}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100 text-xs font-semibold"
                      />
                    </div>

                    {/* Show Label Toggle */}
                    <label className="flex items-center gap-2 cursor-pointer">
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
                        className="rounded border-slate-700 text-amber-500 accent-amber-500"
                      />
                      <span className="text-slate-300 text-xs font-medium">Show Label Text</span>
                    </label>

                    {/* Font Size & Alignment */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-[11px] text-slate-400 block">Font Size (px)</span>
                        <input
                          type="number"
                          min={10}
                          max={80}
                          value={statStyle.fontSize ?? 24}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            updateElementById(selectedElement.id, (prev) => ({
                              ...prev,
                              style: { ...(prev as any).style, fontSize: val },
                            } as ResultScreenElement));
                          }}
                          className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-100 font-mono text-xs mt-1"
                        />
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-400 block">Border Radius (px)</span>
                        <input
                          type="number"
                          min={0}
                          max={60}
                          value={statStyle.borderRadius ?? 16}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            updateElementById(selectedElement.id, (prev) => ({
                              ...prev,
                              style: { ...(prev as any).style, borderRadius: val },
                            } as ResultScreenElement));
                          }}
                          className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-100 font-mono text-xs mt-1"
                        />
                      </div>
                    </div>

                    {/* Text Alignment */}
                    <div className="space-y-1">
                      <span className="text-[11px] text-slate-400 block">Alignment</span>
                      <div className="grid grid-cols-3 gap-1">
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
                            className={`py-1 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition-colors ${
                              (statStyle.textAlign || 'center') === align
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold'
                                : 'bg-slate-950 text-slate-400 border border-slate-800 hover:bg-slate-800'
                            }`}
                          >
                            <span className="capitalize text-[11px]">{align}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Colors: Value Color, Label Color, Background */}
                    <div className="space-y-2 pt-1 border-t border-slate-800">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-slate-400">Value Color</span>
                        <div className="flex items-center gap-2">
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
                          <span className="font-mono text-[11px] text-slate-300">
                            {statStyle.valueColor || '#fbbf24'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-slate-400">Label Color</span>
                        <div className="flex items-center gap-2">
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
                          <span className="font-mono text-[11px] text-slate-300">
                            {statStyle.labelColor || '#94a3b8'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-slate-400">Card Background</span>
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
                          <span className="font-mono text-[11px] text-slate-300">
                            {statStyle.backgroundColor || 'Dark'}
                          </span>
                        </div>
                      </div>
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
                    <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">
                      Button Settings
                    </span>

                    {/* Button Text */}
                    <div className="space-y-1">
                      <span className="text-[11px] text-slate-400 block">Button Text</span>
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
                          <span className="font-mono text-[10px] text-slate-300">
                            {btnStyle.backgroundColor || '#f59e0b'}
                          </span>
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
                          <span className="font-mono text-[10px] text-slate-300">
                            {btnStyle.textColor || '#020617'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Font Size & Radius */}
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
                        <span className="text-[11px] text-slate-400 block">Border Radius (px)</span>
                        <input
                          type="number"
                          min={0}
                          max={60}
                          value={btnStyle.borderRadius ?? 18}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            updateElementById(selectedElement.id, (prev) => ({
                              ...prev,
                              style: { ...(prev as ResultButtonElement).style, borderRadius: val },
                            } as ResultScreenElement));
                          }}
                          className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-100 font-mono text-xs mt-1"
                        />
                      </div>
                    </div>

                    {/* Shadow Toggle */}
                    <label className="flex items-center gap-2 cursor-pointer pt-1">
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
                      <span className="text-slate-300 text-xs font-medium">Button Glow & Shadow</span>
                    </label>
                  </div>
                );
              })()}

              {/* 6. GROUP ELEMENT */}
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
    </div>
  );
};
