import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useLocalization } from '../../../../context/LocalizationContext';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCw,
  Lock,
  Grid,
  Magnet,
  Ruler,
  MousePointer,
  RotateCcw,
} from 'lucide-react';
import {
  BaseVisualElement,
  ResizeHandle,
  ZOOM_PRESETS,
  AlignmentType,
  EditorInteractionState,
} from './types';
import {
  calculateSnap,
  calculateResizeSnap,
  AlignmentGuide,
} from './snapping';
import {
  calculateMeasurements,
  SpacingMeasurement,
  GRID_SIZE_PRESETS,
  GridSizePreset,
} from './measurements';

export interface SharedCanvasWorkspaceProps<T extends BaseVisualElement = BaseVisualElement> {
  canvasWidth?: number;
  canvasHeight?: number;
  canvasId?: string;

  elements: T[];
  selectedIds: string[];
  isPreviewMode?: boolean;
  onExitPreview?: () => void;
  onSelectElement: (id: string, e?: React.MouseEvent) => void;
  onClearSelection: () => void;
  onUpdateElements: (updates: Record<string, Partial<T>>) => void;
  onUpdateSingleElement: (id: string, updater: (prev: T) => T) => void;
  findElementAndParent: (
    id: string,
    list: T[]
  ) => { element: T; parent: any } | null;

  renderBackground?: (width: number, height: number) => React.ReactNode;
  backgroundContainerStyle?: React.CSSProperties;
  backgroundOverlayStyle?: React.CSSProperties;

  renderElementContent: (
    element: T,
    parentWidth: number,
    parentHeight: number,
    context: {
      isEditor: boolean;
      renderChild: (child: T, pW: number, pH: number) => React.ReactNode;
    }
  ) => React.ReactNode;

  onGestureStart?: (currentElements: T[]) => void;
  onGestureEnd?: (finalElements: T[]) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  onAlignSelected?: (type: AlignmentType) => void;
}

export type CanvasWorkspaceProps<T extends BaseVisualElement = BaseVisualElement> =
  SharedCanvasWorkspaceProps<T>;

export const CanvasWorkspace = <T extends BaseVisualElement = BaseVisualElement>({
  canvasWidth = 1000,
  canvasHeight = 1000,
  canvasId = 'pro-canvas-workspace',
  elements,
  selectedIds,
  isPreviewMode = false,
  onExitPreview,
  onSelectElement,
  onClearSelection,
  onUpdateElements,
  onUpdateSingleElement,
  findElementAndParent,
  renderBackground,
  backgroundContainerStyle,
  backgroundOverlayStyle,
  renderElementContent,
  onGestureStart,
  onGestureEnd,
  onUndo,
  onRedo,
  onDelete,
  onDuplicate,
}: SharedCanvasWorkspaceProps<T>) => {
  const { t } = useLocalization();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Viewport Zoom & Pan
  const [zoom, setZoom] = useState<number>(0.85);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const panOffsetRef = useRef(panOffset);
  panOffsetRef.current = panOffset;
  const hasUserManuallyZoomed = useRef(false);

  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ startX: number; startY: number; initialPanX: number; initialPanY: number }>({
    startX: 0,
    startY: 0,
    initialPanX: 0,
    initialPanY: 0,
  });

  // Hotkey & Tool States
  const [isSpaceHeld, setIsSpaceHeld] = useState(false);
  const [isAltHeld, setIsAltHeld] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [gridSize, setGridSize] = useState<GridSizePreset>(20);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [showMeasurements, setShowMeasurements] = useState(false);
  const [mouseLogicalCoords, setMouseLogicalCoords] = useState<{ x: number; y: number } | null>(null);

  // Marquee Drag Box
  const [marqueeBox, setMarqueeBox] = useState<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);

  // Active interaction (drag, resize, rotate)
  const [interactionState, setInteractionState] = useState<EditorInteractionState>({
    mode: 'idle',
    elementId: '',
    startX: 0,
    startY: 0,
    initialX: 0,
    initialY: 0,
    initialWidth: 0,
    initialHeight: 0,
    initialRotation: 0,
    parentWidth: canvasWidth,
    parentHeight: canvasHeight,
  });

  // Snapping & Spacing Overlays
  const [activeGuides, setActiveGuides] = useState<{ containerId: string; guides: AlignmentGuide[] } | null>(null);
  const [activeMeasurements, setActiveMeasurements] = useState<{
    containerId: string;
    measurements: SpacingMeasurement[];
  } | null>(null);

  // Primary active element info
  const primarySelectedId = selectedIds[0] || null;
  const primaryInfo = primarySelectedId ? findElementAndParent(primarySelectedId, elements) : null;
  const primaryElement = primaryInfo?.element || null;

  // Idle Spacing Measurements when an element is selected and showMeasurements or Alt is active
  const idleMeasurements = useMemo(() => {
    if ((!showMeasurements && !isAltHeld) || !primaryElement || isPreviewMode) {
      return null;
    }
    const targetInfo = findElementAndParent(primaryElement.id, elements);
    const parentElement = targetInfo?.parent;
    const containerId = parentElement ? parentElement.id : 'root';
    const parentW = parentElement ? parentElement.width : canvasWidth;
    const parentH = parentElement ? parentElement.height : canvasHeight;
    const siblings: T[] = parentElement ? parentElement.children || [] : elements;

    return {
      containerId,
      measurements: calculateMeasurements(
        {
          x: primaryElement.x,
          y: primaryElement.y,
          width: primaryElement.width,
          height: primaryElement.height,
        },
        parentW,
        parentH,
        siblings,
        primaryElement.id
      ),
    };
  }, [showMeasurements, isAltHeld, primaryElement, elements, canvasWidth, canvasHeight, findElementAndParent, isPreviewMode]);

  const effectiveMeasurements = activeMeasurements || idleMeasurements;

  // Fit to Screen Calculation
  const handleFitToScreen = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const width = rect.width || containerRef.current.clientWidth;
    const height = rect.height || containerRef.current.clientHeight;
    if (width <= 0 || height <= 0) return;

    // Center workspace padding: 64px horizontal margin, 80px vertical margin (accommodating bottom floating toolbar)
    const availableW = Math.max(200, width - 64);
    const availableH = Math.max(200, height - 80);

    const fitScale = Math.min(availableW / canvasWidth, availableH / canvasHeight);
    const clampedScale = Math.max(0.25, Math.min(2.0, Math.round(fitScale * 100) / 100));

    setZoom(clampedScale);
    setPanOffset({ x: 0, y: 0 });
  }, [canvasWidth, canvasHeight]);

  // Initial fit on mount & animation settle
  useEffect(() => {
    handleFitToScreen();
    const raf = requestAnimationFrame(() => handleFitToScreen());
    const t1 = setTimeout(() => handleFitToScreen(), 100);
    const t2 = setTimeout(() => handleFitToScreen(), 300);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [handleFitToScreen]);

  // Auto-fit dynamically on container resize if user has not manually adjusted zoom
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 200 && entry.contentRect.height > 200) {
          if (!hasUserManuallyZoomed.current) {
            handleFitToScreen();
          }
        }
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [handleFitToScreen]);

  // Direct Mouse Wheel Zoom centered around cursor via non-passive listener
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();

      const containerRect = container.getBoundingClientRect();
      const mouseX = e.clientX - containerRect.left;
      const mouseY = e.clientY - containerRect.top;

      const centerX = containerRect.width / 2;
      const centerY = containerRect.height / 2;

      // Smooth, responsive zoom stepping
      const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
      const currentZ = zoomRef.current;
      const newZoom = Math.max(0.25, Math.min(3.0, Math.round(currentZ * zoomFactor * 100) / 100));

      if (newZoom !== currentZ) {
        const deltaZoomRatio = newZoom / currentZ;
        const currentPan = panOffsetRef.current;
        const newPanX = mouseX - centerX - (mouseX - centerX - currentPan.x) * deltaZoomRatio;
        const newPanY = mouseY - centerY - (mouseY - centerY - currentPan.y) * deltaZoomRatio;

        hasUserManuallyZoomed.current = true;
        setZoom(newZoom);
        setPanOffset({ x: newPanX, y: newPanY });
      }
    };

    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, []);

  // Keyboard Shortcuts (Space pan, Alt measurement, Backspace delete, Undo, Redo, Duplicate, Escape, Arrow nudge)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if typing in an input or textarea
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      if (e.code === 'Space' && !e.repeat) {
        setIsSpaceHeld(true);
      }
      if (e.key === 'Alt') {
        setIsAltHeld(true);
      }

      // Undo / Redo
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          onRedo?.();
        } else {
          onUndo?.();
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        onRedo?.();
      }

      // Duplicate
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        onDuplicate?.();
      }

      // Delete
      if (e.key === 'Backspace' || e.key === 'Delete') {
        if (selectedIds.length > 0) {
          e.preventDefault();
          onDelete?.();
        }
      }

      // Escape to clear selection
      if (e.key === 'Escape') {
        onClearSelection();
      }

      // Arrow keys nudge
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        if (selectedIds.length > 0) {
          e.preventDefault();
          const step = e.shiftKey ? 10 : 1;
          const deltaX = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
          const deltaY = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;

          const updates: Record<string, Partial<T>> = {};
          for (const id of selectedIds) {
            const found = findElementAndParent(id, elements);
            if (found && !found.element.locked) {
              const pW = found.parent ? found.parent.width : canvasWidth;
              const pH = found.parent ? found.parent.height : canvasHeight;
              const nextX = Math.max(0, Math.min(pW - found.element.width, found.element.x + deltaX));
              const nextY = Math.max(0, Math.min(pH - found.element.height, found.element.y + deltaY));
              updates[id] = { x: nextX, y: nextY } as Partial<T>;
            }
          }
          if (Object.keys(updates).length > 0) {
            onUpdateElements(updates);
          }
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpaceHeld(false);
      }
      if (e.key === 'Alt') {
        setIsAltHeld(false);
      }
    };

    const handleBlur = () => {
      setIsSpaceHeld(false);
      setIsAltHeld(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [selectedIds, elements, canvasWidth, canvasHeight, onUndo, onRedo, onDuplicate, onDelete, onClearSelection, onUpdateElements, findElementAndParent]);

  // Viewport / Background Mouse Down (Space / Middle pan OR marquee selection)
  const handleViewportMouseDown = (e: React.MouseEvent) => {
    // Middle click or Space held = Pan
    if (e.button === 1 || isSpaceHeld) {
      e.preventDefault();
      setIsPanning(true);
      panStartRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        initialPanX: panOffset.x,
        initialPanY: panOffset.y,
      };
      return;
    }

    // Clicking outside canvas on workspace container
    if (e.target === containerRef.current) {
      if (!e.shiftKey && !e.metaKey && !e.ctrlKey) {
        onClearSelection();
      }
      setIsPanning(true);
      panStartRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        initialPanX: panOffset.x,
        initialPanY: panOffset.y,
      };
      return;
    }

    // Clicking on empty canvas area (not an interactive element)
    if (canvasRef.current && !isPreviewMode) {
      const canvasRect = canvasRef.current.getBoundingClientRect();
      const clickLogicalX = (e.clientX - canvasRect.left) * (canvasWidth / canvasRect.width);
      const clickLogicalY = (e.clientY - canvasRect.top) * (canvasHeight / canvasRect.height);

      if (!e.shiftKey && !e.metaKey && !e.ctrlKey) {
        onClearSelection();
      }

      setMarqueeBox({
        startX: clickLogicalX,
        startY: clickLogicalY,
        currentX: clickLogicalX,
        currentY: clickLogicalY,
      });
    }
  };

  // Element Mouse Down (Selection & Multi-Drag Initiation)
  const handleElementMouseDown = (
    e: React.MouseEvent,
    el: T,
    parentWidth: number,
    parentHeight: number
  ) => {
    if (isPreviewMode) return;

    if (e.button === 1 || isSpaceHeld) {
      return; // Defer to viewport pan
    }

    e.stopPropagation();

    // Selection Handling
    let currentSelectedIds = selectedIds;
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      onSelectElement(el.id, e);
      currentSelectedIds = selectedIds.includes(el.id)
        ? selectedIds.filter((id) => id !== el.id)
        : [...selectedIds, el.id];
    } else {
      if (!selectedIds.includes(el.id)) {
        onSelectElement(el.id);
        currentSelectedIds = [el.id];
      }
    }

    if (el.locked) return;

    onGestureStart?.(elements);

    // Capture initial positions of all selected elements for simultaneous multi-drag
    const initialPositions: Record<string, { x: number; y: number; width: number; height: number }> = {};
    for (const id of currentSelectedIds) {
      const found = findElementAndParent(id, elements);
      if (found && !found.element.locked) {
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

    setInteractionState({
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
    });
  };

  // Resize Handle Mouse Down
  const handleResizeMouseDown = (
    e: React.MouseEvent,
    el: T,
    parentWidth: number,
    parentHeight: number,
    handle: ResizeHandle
  ) => {
    if (isPreviewMode || el.locked) return;
    e.stopPropagation();

    onGestureStart?.(elements);

    setInteractionState({
      mode: 'resize',
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
      handle,
    });
  };

  // Rotation Knob Mouse Down
  const handleRotateMouseDown = (
    e: React.MouseEvent,
    el: T,
    parentWidth: number,
    parentHeight: number
  ) => {
    if (isPreviewMode || el.locked) return;
    e.stopPropagation();

    onGestureStart?.(elements);

    const canvasRect = canvasRef.current?.getBoundingClientRect();
    if (!canvasRect) return;

    const elCenterX = canvasRect.left + ((el.x + el.width / 2) / parentWidth) * canvasRect.width;
    const elCenterY = canvasRect.top + ((el.y + el.height / 2) / parentHeight) * canvasRect.height;

    const dx = e.clientX - elCenterX;
    const dy = e.clientY - elCenterY;
    const startAngle = Math.atan2(dy, dx) * (180 / Math.PI);

    setInteractionState({
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
      centerX: elCenterX,
      centerY: elCenterY,
      startAngle,
    });
  };

  // Window Mouse Move (Panning, Marquee, Drag, Resize, Rotate)
  useEffect(() => {
    const handleWindowMouseMove = (e: MouseEvent) => {
      // 1. Panning
      if (isPanning) {
        const deltaX = e.clientX - panStartRef.current.startX;
        const deltaY = e.clientY - panStartRef.current.startY;
        setPanOffset({
          x: panStartRef.current.initialPanX + deltaX,
          y: panStartRef.current.initialPanY + deltaY,
        });
        return;
      }

      // 2. Marquee Selection
      if (marqueeBox && canvasRef.current) {
        const canvasRect = canvasRef.current.getBoundingClientRect();
        const currentX = (e.clientX - canvasRect.left) * (canvasWidth / canvasRect.width);
        const currentY = (e.clientY - canvasRect.top) * (canvasHeight / canvasRect.height);
        setMarqueeBox((prev) => (prev ? { ...prev, currentX, currentY } : null));
        return;
      }

      // 3. Interactive Mode (Drag, Resize, Rotate)
      const {
        mode,
        elementId,
        startX,
        startY,
        initialX,
        initialY,
        initialWidth,
        initialHeight,
        initialRotation,
        parentWidth,
        parentHeight,
        handle,
        centerX,
        centerY,
        startAngle,
        initialPositions,
      } = interactionState;

      if (mode === 'idle' || !elementId) return;

      const canvasRect = canvasRef.current?.getBoundingClientRect();
      if (!canvasRect) return;

      const scaleRatio = canvasWidth / canvasRect.width;
      const deltaLogicalX = (e.clientX - startX) * scaleRatio;
      const deltaLogicalY = (e.clientY - startY) * scaleRatio;

      // DRAGGING
      if (mode === 'drag') {
        const positions: Record<string, { x: number; y: number; width: number; height: number }> =
          initialPositions || {
            [elementId]: { x: initialX, y: initialY, width: initialWidth, height: initialHeight },
          };
        const targetPos = positions[elementId] || {
          x: initialX,
          y: initialY,
          width: initialWidth,
          height: initialHeight,
        };

        let effectiveDeltaX = deltaLogicalX;
        let effectiveDeltaY = deltaLogicalY;

        // Snapping calculations on primary element if enabled and not Alt
        if (snapEnabled && !isAltHeld) {
          const targetInfo = findElementAndParent(elementId, elements);
          const parentElement = targetInfo?.parent;
          const isRoot = !parentElement;
          const containerId = parentElement ? parentElement.id : 'root';
          const siblings: T[] = parentElement ? parentElement.children || [] : elements;

          const snap = calculateSnap(
            {
              x: targetPos.x + deltaLogicalX,
              y: targetPos.y + deltaLogicalY,
              width: targetPos.width,
              height: targetPos.height,
            },
            parentWidth,
            parentHeight,
            siblings,
            Object.keys(positions),
            8,
            isRoot
          );

          effectiveDeltaX = snap.x - targetPos.x;
          effectiveDeltaY = snap.y - targetPos.y;

          // If no sibling/edge snap occurred and grid is shown, soft-snap to grid lines
          if (!snap.snappedX && showGrid && gridSize > 0) {
            const rawX = targetPos.x + deltaLogicalX;
            const nearestGridX = Math.round(rawX / gridSize) * gridSize;
            if (Math.abs(rawX - nearestGridX) <= 6) {
              effectiveDeltaX = nearestGridX - targetPos.x;
            }
          }
          if (!snap.snappedY && showGrid && gridSize > 0) {
            const rawY = targetPos.y + deltaLogicalY;
            const nearestGridY = Math.round(rawY / gridSize) * gridSize;
            if (Math.abs(rawY - nearestGridY) <= 6) {
              effectiveDeltaY = nearestGridY - targetPos.y;
            }
          }

          if (snap.guides.length > 0) {
            setActiveGuides({ containerId, guides: snap.guides });
          } else {
            setActiveGuides(null);
          }
        } else {
          setActiveGuides(null);
        }

        // Live measurements
        if ((showMeasurements || isAltHeld) && primaryInfo) {
          const pWidth = primaryInfo.parent ? primaryInfo.parent.width : canvasWidth;
          const pHeight = primaryInfo.parent ? primaryInfo.parent.height : canvasHeight;
          const siblings: T[] = primaryInfo.parent ? primaryInfo.parent.children || [] : elements;
          const containerId = primaryInfo.parent ? primaryInfo.parent.id : 'root';

          const measurements = calculateMeasurements(
            {
              x: targetPos.x + effectiveDeltaX,
              y: targetPos.y + effectiveDeltaY,
              width: targetPos.width,
              height: targetPos.height,
            },
            pWidth,
            pHeight,
            siblings,
            elementId
          );
          setActiveMeasurements({ containerId, measurements });
        } else {
          setActiveMeasurements(null);
        }

        // Apply clamped updates to all selected elements respecting each element's own parent bounds
        const updates: Record<string, Partial<T>> = {};
        for (const [id, pos] of Object.entries(positions)) {
          const targetInfo = findElementAndParent(id, elements);
          const pW = targetInfo?.parent ? targetInfo.parent.width : canvasWidth;
          const pH = targetInfo?.parent ? targetInfo.parent.height : canvasHeight;
          const nextX = Math.round(pos.x + effectiveDeltaX);
          const nextY = Math.round(pos.y + effectiveDeltaY);
          const clampedX = Math.max(0, Math.min(pW - pos.width, nextX));
          const clampedY = Math.max(0, Math.min(pH - pos.height, nextY));
          updates[id] = { x: clampedX, y: clampedY } as Partial<T>;
        }

        onUpdateElements(updates);
        return;
      }

      // RESIZING
      if (mode === 'resize' && handle) {
        let newX = initialX;
        let newY = initialY;
        let newWidth = initialWidth;
        let newHeight = initialHeight;

        if (handle.includes('r') || handle === 'tr' || handle === 'br') {
          newWidth = Math.max(16, initialWidth + deltaLogicalX);
        }
        if (handle.includes('l') || handle === 'tl' || handle === 'bl') {
          const proposedW = initialWidth - deltaLogicalX;
          if (proposedW >= 16) {
            newWidth = proposedW;
            newX = initialX + deltaLogicalX;
          } else {
            newWidth = 16;
            newX = initialX + (initialWidth - 16);
          }
        }
        if (handle.includes('b') || handle === 'bl' || handle === 'br') {
          newHeight = Math.max(16, initialHeight + deltaLogicalY);
        }
        if (handle.includes('t') || handle === 'tl' || handle === 'tr') {
          const proposedH = initialHeight - deltaLogicalY;
          if (proposedH >= 16) {
            newHeight = proposedH;
            newY = initialY + deltaLogicalY;
          } else {
            newHeight = 16;
            newY = initialY + (initialHeight - 16);
          }
        }

        // Shift key to preserve aspect ratio
        if (e.shiftKey && initialWidth > 0 && initialHeight > 0) {
          const ratio = initialWidth / initialHeight;
          if (newWidth / ratio < newHeight) {
            newHeight = Math.round(newWidth / ratio);
          } else {
            newWidth = Math.round(newHeight * ratio);
          }
        }

        // Resize snapping
        if (snapEnabled && !isAltHeld) {
          const targetInfo = findElementAndParent(elementId, elements);
          const parentElement = targetInfo?.parent;
          const isRoot = !parentElement;
          const containerId = parentElement ? parentElement.id : 'root';
          const siblings: T[] = parentElement ? parentElement.children || [] : elements;

          const resizeSnap = calculateResizeSnap(
            handle,
            { x: newX, y: newY, width: newWidth, height: newHeight },
            parentWidth,
            parentHeight,
            siblings,
            [elementId],
            8,
            isRoot
          );

          newX = resizeSnap.box.x;
          newY = resizeSnap.box.y;
          newWidth = resizeSnap.box.width;
          newHeight = resizeSnap.box.height;

          // If no sibling/edge snap occurred and grid is shown, soft-snap resize to grid lines
          if (!resizeSnap.snappedX && showGrid && gridSize > 0) {
            const nearestGridW = Math.max(10, Math.round(newWidth / gridSize) * gridSize);
            if (Math.abs(newWidth - nearestGridW) <= 6) {
              newWidth = nearestGridW;
            }
          }
          if (!resizeSnap.snappedY && showGrid && gridSize > 0) {
            const nearestGridH = Math.max(10, Math.round(newHeight / gridSize) * gridSize);
            if (Math.abs(newHeight - nearestGridH) <= 6) {
              newHeight = nearestGridH;
            }
          }

          if (resizeSnap.guides.length > 0) {
            setActiveGuides({ containerId, guides: resizeSnap.guides });
          } else {
            setActiveGuides(null);
          }
        } else {
          setActiveGuides(null);
        }

        // Measurements during resize
        if ((showMeasurements || isAltHeld) && primaryInfo) {
          const pWidth = primaryInfo.parent ? primaryInfo.parent.width : canvasWidth;
          const pHeight = primaryInfo.parent ? primaryInfo.parent.height : canvasHeight;
          const siblings: T[] = primaryInfo.parent ? primaryInfo.parent.children || [] : elements;
          const containerId = primaryInfo.parent ? primaryInfo.parent.id : 'root';

          const measurements = calculateMeasurements(
            { x: newX, y: newY, width: newWidth, height: newHeight },
            pWidth,
            pHeight,
            siblings,
            elementId
          );
          setActiveMeasurements({ containerId, measurements });
        } else {
          setActiveMeasurements(null);
        }

        onUpdateSingleElement(elementId, (prev) => ({
          ...prev,
          x: Math.round(newX),
          y: Math.round(newY),
          width: Math.round(newWidth),
          height: Math.round(newHeight),
        }));
        return;
      }

      // ROTATING
      if (mode === 'rotate' && centerX !== undefined && centerY !== undefined && startAngle !== undefined) {
        const dx = e.clientX - centerX;
        const dy = e.clientY - centerY;
        const currentAngle = Math.atan2(dy, dx) * (180 / Math.PI);
        let angleDelta = currentAngle - startAngle;

        let finalRotation = (initialRotation + angleDelta) % 360;
        if (finalRotation < 0) finalRotation += 360;

        // Snapping: 15-degree steps with Shift, or 0, 45, 90, 180 snap within 3 degrees
        if (e.shiftKey) {
          finalRotation = Math.round(finalRotation / 15) * 15;
        } else {
          const snapAngles = [0, 45, 90, 135, 180, 225, 270, 315, 360];
          for (const sa of snapAngles) {
            if (Math.abs(finalRotation - sa) < 3) {
              finalRotation = sa % 360;
              break;
            }
          }
        }

        onUpdateSingleElement(elementId, (prev) => ({
          ...prev,
          rotation: Math.round(finalRotation),
        }));
      }
    };

    const handleWindowMouseUp = (e: MouseEvent) => {
      // End Panning
      if (isPanning) {
        setIsPanning(false);
      }

      // End Marquee Selection
      if (marqueeBox) {
        const minX = Math.min(marqueeBox.startX, marqueeBox.currentX);
        const maxX = Math.max(marqueeBox.startX, marqueeBox.currentX);
        const minY = Math.min(marqueeBox.startY, marqueeBox.currentY);
        const maxY = Math.max(marqueeBox.startY, marqueeBox.currentY);

        // Only commit if dragged more than 4px
        if (maxX - minX > 4 || maxY - minY > 4) {
          const intersectingIds: string[] = [];
          for (const el of elements) {
            if (el.visible === false || el.locked) continue;
            const elRight = el.x + el.width;
            const elBottom = el.y + el.height;
            if (el.x < maxX && elRight > minX && el.y < maxY && elBottom > minY) {
              intersectingIds.push(el.id);
            }
          }
          if (intersectingIds.length > 0) {
            if (e.shiftKey || e.metaKey || e.ctrlKey) {
              const combined = Array.from(new Set([...selectedIds, ...intersectingIds]));
              combined.forEach((id) => onSelectElement(id, { shiftKey: true } as any));
            } else {
              onSelectElement(intersectingIds[0]);
              for (let i = 1; i < intersectingIds.length; i++) {
                onSelectElement(intersectingIds[i], { shiftKey: true } as any);
              }
            }
          }
        }
        setMarqueeBox(null);
      }

      // End Interaction
      if (interactionState.mode !== 'idle') {
        onGestureEnd?.(elements);
        setInteractionState({
          mode: 'idle',
          elementId: '',
          startX: 0,
          startY: 0,
          initialX: 0,
          initialY: 0,
          initialWidth: 0,
          initialHeight: 0,
          initialRotation: 0,
          parentWidth: canvasWidth,
          parentHeight: canvasHeight,
        });
        setActiveGuides(null);
        setActiveMeasurements(null);
      }
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [
    isPanning,
    marqueeBox,
    interactionState,
    canvasWidth,
    canvasHeight,
    elements,
    selectedIds,
    snapEnabled,
    showMeasurements,
    isAltHeld,
    primaryInfo,
    onGestureEnd,
    onUpdateElements,
    onUpdateSingleElement,
    onSelectElement,
    findElementAndParent,
  ]);

  // Track Mouse Logical Position on Canvas
  const handleMouseMoveOnCanvas = (e: React.MouseEvent) => {
    if (!canvasRef.current) return;
    const canvasRect = canvasRef.current.getBoundingClientRect();
    const logicalX = Math.round((e.clientX - canvasRect.left) * (canvasWidth / canvasRect.width));
    const logicalY = Math.round((e.clientY - canvasRect.top) * (canvasHeight / canvasRect.height));
    setMouseLogicalCoords({
      x: Math.max(0, Math.min(canvasWidth, logicalX)),
      y: Math.max(0, Math.min(canvasHeight, logicalY)),
    });
  };

  // Render Snapping Alignment Guides
  const renderGuides = (containerId: string, parentWidth: number, parentHeight: number) => {
    if (!activeGuides || activeGuides.containerId !== containerId || isPreviewMode) return null;

    return (
      <div className="absolute inset-0 pointer-events-none z-50">
        {activeGuides.guides.map((guide) => {
          if (guide.type === 'vertical') {
            const leftPercent = `${(guide.position / parentWidth) * 100}%`;
            const topPercent = `${(guide.start / parentHeight) * 100}%`;
            const heightPercent = `${((guide.end - guide.start) / parentHeight) * 100}%`;

            return (
              <div
                key={guide.id}
                className="absolute w-[1px] bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.8)] flex flex-col items-center"
                style={{ left: leftPercent, top: topPercent, height: heightPercent }}
              >
                {guide.label && (
                  <span className="mt-1 px-1 py-0.5 rounded bg-amber-500 text-slate-950 font-mono text-[9px] font-bold shadow-md">
                    {guide.label}
                  </span>
                )}
              </div>
            );
          } else {
            const topPercent = `${(guide.position / parentHeight) * 100}%`;
            const leftPercent = `${(guide.start / parentWidth) * 100}%`;
            const widthPercent = `${((guide.end - guide.start) / parentWidth) * 100}%`;

            return (
              <div
                key={guide.id}
                className="absolute h-[1px] bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.8)] flex items-center justify-center"
                style={{ top: topPercent, left: leftPercent, width: widthPercent }}
              >
                {guide.label && (
                  <span className="px-1 py-0.5 rounded bg-amber-500 text-slate-950 font-mono text-[9px] font-bold shadow-md">
                    {guide.label}
                  </span>
                )}
              </div>
            );
          }
        })}
      </div>
    );
  };

  // Render Spacing Measurements
  const renderMeasurements = (containerId: string, parentWidth: number, parentHeight: number) => {
    if (!effectiveMeasurements || effectiveMeasurements.containerId !== containerId || isPreviewMode) return null;

    return (
      <div className="absolute inset-0 pointer-events-none z-50">
        {effectiveMeasurements.measurements.map((m) => {
          const x1P = (m.x1 / parentWidth) * 100;
          const y1P = (m.y1 / parentHeight) * 100;
          const x2P = (m.x2 / parentWidth) * 100;
          const y2P = (m.y2 / parentHeight) * 100;

          const isVertical = m.direction === 'top' || m.direction === 'bottom';
          const leftP = Math.min(x1P, x2P);
          const topP = Math.min(y1P, y2P);
          const widthP = isVertical ? 0 : Math.abs(x2P - x1P);
          const heightP = isVertical ? Math.abs(y2P - y1P) : 0;

          return (
            <div
              key={m.id}
              className="absolute flex items-center justify-center"
              style={{
                left: `${leftP}%`,
                top: `${topP}%`,
                width: isVertical ? '1px' : `${widthP}%`,
                height: isVertical ? `${heightP}%` : '1px',
              }}
            >
              <div
                className={`absolute border-rose-500/90 ${
                  isVertical ? 'w-0 h-full border-l border-dashed' : 'w-full h-0 border-t border-dashed'
                }`}
              />
              <span className="px-1 py-0.5 rounded bg-rose-950/90 text-rose-300 border border-rose-500/60 font-mono text-[9px] font-bold shadow whitespace-nowrap z-10">
                {m.label}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  // Render Canvas Elements Recursively
  const renderCanvasElement = (el: T, parentWidth: number, parentHeight: number): React.ReactNode => {
    const isVisible = el.visible !== false;
    if (!isVisible && isPreviewMode) return null;

    const isSelected = selectedIds.includes(el.id);
    const isPrimarySelected = el.id === primarySelectedId;
    const isLocked = el.locked === true;
    const isParentOfSelected =
      selectedIds.length > 0 &&
      selectedIds.some((selId) => {
        const selInfo = findElementAndParent(selId, elements);
        return selInfo?.parent?.id === el.id;
      });

    const leftPercent = `${(el.x / parentWidth) * 100}%`;
    const topPercent = `${(el.y / parentHeight) * 100}%`;
    const widthPercent = `${(el.width / parentWidth) * 100}%`;
    const heightPercent = `${(el.height / parentHeight) * 100}%`;

    const isCard = el.type === 'card';
    const cardRadius = isCard ? ((el as any).style?.borderRadius ?? 24) : undefined;

    const commonStyle: React.CSSProperties = {
      position: 'absolute',
      left: leftPercent,
      top: topPercent,
      width: widthPercent,
      height: heightPercent,
      opacity: isVisible ? el.opacity ?? 1 : 0.2,
      zIndex: el.zIndex ?? 1,
      transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
      boxSizing: 'border-box',
      cursor: isSpaceHeld ? 'grab' : isLocked ? 'default' : 'move',
      pointerEvents: isVisible ? 'auto' : 'none',
      outline: isParentOfSelected ? '2px dashed rgba(59, 130, 246, 0.7)' : undefined,
      outlineOffset: isParentOfSelected ? '2px' : undefined,
      borderRadius: cardRadius !== undefined ? `${cardRadius}px` : undefined,
    };

    return (
      <div
        key={el.id}
        id={`pro-el-${el.id}`}
        style={commonStyle}
        onMouseDown={(e) => handleElementMouseDown(e, el, parentWidth, parentHeight)}
        className="group relative select-none"
      >
        {/* Child Element Content */}
        {renderElementContent(el, parentWidth, parentHeight, {
          isEditor: !isPreviewMode,
          renderChild: (child, pW, pH) => renderCanvasElement(child, pW, pH),
        })}

        {/* Guides & measurements inside this container if it has children */}
        {renderGuides(el.id, el.width, el.height)}
        {renderMeasurements(el.id, el.width, el.height)}

        {/* Selection Bounding Box & Handles (Editor Only) */}
        {!isPreviewMode && isSelected && (
          <div
            className={`absolute inset-0 pointer-events-none border-2 ${
              isLocked
                ? 'border-rose-500/80 shadow-[0_0_12px_rgba(244,63,94,0.4)]'
                : 'border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.5)]'
            }`}
            style={{
              borderRadius: cardRadius !== undefined ? `${cardRadius}px` : undefined,
            }}
          >
            {/* Primary Element Controls */}
            {isPrimarySelected && (
              <>
                {/* Element Badge / HUD */}
                <div
                  className={`absolute -top-7 left-0 px-2 py-0.5 rounded text-[10px] font-mono font-bold flex items-center gap-1.5 shadow-md whitespace-nowrap ${
                    isLocked ? 'bg-rose-600 text-white' : 'bg-amber-500 text-slate-950'
                  }`}
                >
                  {isLocked && <Lock className="w-3 h-3" />}
                  <span>{el.type.toUpperCase()}</span>
                  <span className="opacity-75">
                    ({Math.round(el.x)}, {Math.round(el.y)}) • {Math.round(el.width)}×{Math.round(el.height)}
                    {el.rotation ? ` • ${Math.round(el.rotation)}°` : ''}
                  </span>
                </div>

                {/* Unlocked Transform Controls */}
                {!isLocked && (
                  <>
                    {/* Rotation Knob */}
                    <div className="absolute -top-7 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-auto">
                      <div
                        onMouseDown={(e) => handleRotateMouseDown(e, el, parentWidth, parentHeight)}
                        className="w-4 h-4 bg-amber-400 border-2 border-slate-950 rounded-full cursor-grab active:cursor-grabbing flex items-center justify-center shadow hover:scale-125 transition-transform"
                        title="Drag to rotate (Shift for 15° snap)"
                      >
                        <RotateCw className="w-2.5 h-2.5 text-slate-950" />
                      </div>
                      <div className="w-[1px] h-3 bg-amber-400" />
                    </div>

                    {/* 8 Resize Handles */}
                    <div
                      onMouseDown={(e) => handleResizeMouseDown(e, el, parentWidth, parentHeight, 'tl')}
                      className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-amber-500 rounded-xs cursor-nwse-resize pointer-events-auto shadow hover:scale-125 transition-transform"
                    />
                    <div
                      onMouseDown={(e) => handleResizeMouseDown(e, el, parentWidth, parentHeight, 'tr')}
                      className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-amber-500 rounded-xs cursor-nesw-resize pointer-events-auto shadow hover:scale-125 transition-transform"
                    />
                    <div
                      onMouseDown={(e) => handleResizeMouseDown(e, el, parentWidth, parentHeight, 'bl')}
                      className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-amber-500 rounded-xs cursor-nesw-resize pointer-events-auto shadow hover:scale-125 transition-transform"
                    />
                    <div
                      onMouseDown={(e) => handleResizeMouseDown(e, el, parentWidth, parentHeight, 'br')}
                      className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-amber-500 rounded-xs cursor-nwse-resize pointer-events-auto shadow hover:scale-125 transition-transform"
                    />
                    <div
                      onMouseDown={(e) => handleResizeMouseDown(e, el, parentWidth, parentHeight, 't')}
                      className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-2 border-amber-500 rounded-xs cursor-ns-resize pointer-events-auto shadow hover:scale-125 transition-transform"
                    />
                    <div
                      onMouseDown={(e) => handleResizeMouseDown(e, el, parentWidth, parentHeight, 'b')}
                      className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-2 border-amber-500 rounded-xs cursor-ns-resize pointer-events-auto shadow hover:scale-125 transition-transform"
                    />
                    <div
                      onMouseDown={(e) => handleResizeMouseDown(e, el, parentWidth, parentHeight, 'l')}
                      className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-3 h-3 bg-white border-2 border-amber-500 rounded-xs cursor-ew-resize pointer-events-auto shadow hover:scale-125 transition-transform"
                    />
                    <div
                      onMouseDown={(e) => handleResizeMouseDown(e, el, parentWidth, parentHeight, 'r')}
                      className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-3 h-3 bg-white border-2 border-amber-500 rounded-xs cursor-ew-resize pointer-events-auto shadow hover:scale-125 transition-transform"
                    />
                  </>
                )}
              </>
            )}

            {/* Non-primary multi-selected element indicator */}
            {!isPrimarySelected && (
              <div className="absolute -top-5 left-0 px-1.5 py-0.5 rounded bg-amber-500/90 text-slate-950 font-mono text-[9px] font-bold shadow">
                {el.type.toUpperCase()} ({Math.round(el.x)}, {Math.round(el.y)})
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const roundedZoom = Math.round(zoom * 100);
  const zoomOptions = useMemo(() => {
    const basePresets = [25, 50, 75, 100, 125, 150, 200];
    if (!basePresets.includes(roundedZoom)) {
      return [...basePresets, roundedZoom].sort((a, b) => a - b);
    }
    return basePresets;
  }, [roundedZoom]);

  return (
    <div
      ref={containerRef}
      onMouseDown={handleViewportMouseDown}
      className={`w-full h-full flex-1 min-h-0 relative bg-slate-950 overflow-hidden flex items-center justify-center select-none ${
        isSpaceHeld || isPanning ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'
      }`}
    >
      {/* Top Floating Helper Tooltip */}
      {!isPreviewMode && (
        <div className="absolute top-4 left-4 z-40 bg-slate-900/85 backdrop-blur-md border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-300 font-mono shadow-xl pointer-events-none flex items-center gap-2">
          <MousePointer className="w-3.5 h-3.5 text-amber-400" />
          <span>Space+Drag to pan • Wheel to zoom • Shift+Click multi-select • Alt to measure / bypass snap</span>
        </div>
      )}

      {/* Floating Preview Mode Banner */}
      {isPreviewMode && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 bg-slate-900/90 backdrop-blur-md border border-amber-500/50 rounded-full px-4 py-1.5 flex items-center gap-3 shadow-2xl">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-semibold text-slate-200">
            Preview Mode • Interactive Screen Experience
          </span>
          {onExitPreview && (
            <button
              onClick={onExitPreview}
              className="ml-1 px-2.5 py-0.5 rounded-full bg-amber-500 hover:bg-amber-400 text-slate-950 text-[11px] font-bold shadow transition-colors cursor-pointer"
            >
              Exit Preview
            </button>
          )}
        </div>
      )}

      {/* Viewport Transform Wrapper */}
      <div
        style={{
          transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
          transformOrigin: 'center center',
          transition: isPanning || interactionState.mode !== 'idle' ? 'none' : 'transform 0.05s ease-out',
        }}
        className="shrink-0 flex items-center justify-center p-8 pointer-events-auto"
      >
        {/* Logical Canvas Screen */}
        <div
          ref={canvasRef}
          id={canvasId}
          onMouseMove={handleMouseMoveOnCanvas}
          onMouseLeave={() => setMouseLogicalCoords(null)}
          className="relative rounded-3xl border-2 border-slate-700/80 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] overflow-hidden select-none"
          style={{
            width: `${canvasWidth}px`,
            height: `${canvasHeight}px`,
            ...backgroundContainerStyle,
            containerType: 'inline-size',
          }}
        >
          {/* Custom Background or Overlay */}
          {renderBackground ? (
            renderBackground(canvasWidth, canvasHeight)
          ) : (
            <div className="absolute inset-0 bg-slate-900" />
          )}

          {backgroundOverlayStyle && (
            <div className="absolute inset-0 pointer-events-none" style={backgroundOverlayStyle} />
          )}

          {/* Dynamic Logical Design Grid (strictly aligned with canvas dimensions & coordinate space) */}
          {!isPreviewMode && showGrid && (
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none z-30"
              style={{ overflow: 'hidden' }}
            >
              <defs>
                {/* Minor grid subdivisions if gridSize >= 20 */}
                {gridSize >= 20 && (
                  <pattern
                    id={`grid-minor-${canvasId}`}
                    width={gridSize / 2}
                    height={gridSize / 2}
                    patternUnits="userSpaceOnUse"
                  >
                    <path
                      d={`M ${gridSize / 2} 0 L 0 0 0 ${gridSize / 2}`}
                      fill="none"
                      stroke="rgba(148, 163, 184, 0.18)"
                      strokeWidth="1"
                    />
                  </pattern>
                )}
                {/* Major grid lines based on selected gridSize */}
                <pattern
                  id={`grid-major-${canvasId}`}
                  width={gridSize}
                  height={gridSize}
                  patternUnits="userSpaceOnUse"
                >
                  {gridSize >= 20 && (
                    <rect
                      width={gridSize}
                      height={gridSize}
                      fill={`url(#grid-minor-${canvasId})`}
                    />
                  )}
                  <path
                    d={`M ${gridSize} 0 L 0 0 0 ${gridSize}`}
                    fill="none"
                    stroke="rgba(148, 163, 184, 0.38)"
                    strokeWidth="1"
                  />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill={`url(#grid-major-${canvasId})`} />
              {/* Canvas Center Axis Markers */}
              <line
                x1={canvasWidth / 2}
                y1={0}
                x2={canvasWidth / 2}
                y2={canvasHeight}
                stroke="rgba(34, 211, 238, 0.7)"
                strokeWidth="1.5"
                strokeDasharray="4 4"
              />
              <line
                x1={0}
                y1={canvasHeight / 2}
                x2={canvasWidth}
                y2={canvasHeight / 2}
                stroke="rgba(34, 211, 238, 0.7)"
                strokeWidth="1.5"
                strokeDasharray="4 4"
              />
            </svg>
          )}

          {/* Render Elements Tree */}
          {elements.map((el) => renderCanvasElement(el, canvasWidth, canvasHeight))}

          {/* Root Level Snapping Guides & Spacing Measurements (layered on top of elements) */}
          {renderGuides('root', canvasWidth, canvasHeight)}
          {renderMeasurements('root', canvasWidth, canvasHeight)}

          {/* Marquee Selection Drag Box */}
          {marqueeBox && (
            <div
              className="absolute pointer-events-none z-50 border-2 border-amber-400 bg-amber-400/20 rounded-xs"
              style={{
                left: `${(Math.min(marqueeBox.startX, marqueeBox.currentX) / canvasWidth) * 100}%`,
                top: `${(Math.min(marqueeBox.startY, marqueeBox.currentY) / canvasHeight) * 100}%`,
                width: `${(Math.abs(marqueeBox.currentX - marqueeBox.startX) / canvasWidth) * 100}%`,
                height: `${(Math.abs(marqueeBox.currentY - marqueeBox.startY) / canvasHeight) * 100}%`,
              }}
            />
          )}
        </div>
      </div>

      {/* Floating Bottom Status & Zoom Toolbar */}
      <div className="absolute bottom-4 left-4 z-40 bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-xl px-2.5 py-1.5 flex items-center gap-2 shadow-2xl text-slate-300">
        <button
          onClick={() => {
            hasUserManuallyZoomed.current = true;
            setZoom((z) => Math.max(0.25, Math.round((z - 0.1) * 100) / 100));
          }}
          className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
          title={t('editor.zoomOutTooltip', undefined, 'Zoom Out')}
        >
          <ZoomOut className="w-4 h-4" />
        </button>

        <select
          value={roundedZoom}
          onChange={(e) => {
            hasUserManuallyZoomed.current = true;
            setZoom(Number(e.target.value) / 100);
          }}
          className="bg-slate-950 border border-slate-700 text-amber-400 text-xs font-mono font-bold rounded px-1.5 py-1 outline-none cursor-pointer"
          title={t('editor.zoomLevel', undefined, 'Zoom Level')}
        >
          {zoomOptions.map((preset) => (
            <option key={preset} value={preset}>
              {preset}%
            </option>
          ))}
        </select>

        <button
          onClick={() => {
            hasUserManuallyZoomed.current = true;
            setZoom((z) => Math.min(3.0, Math.round((z + 0.1) * 100) / 100));
          }}
          className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
          title={t('editor.zoomInTooltip', undefined, 'Zoom In')}
        >
          <ZoomIn className="w-4 h-4" />
        </button>

        <div className="w-px h-4 bg-slate-700 mx-1" />

        <button
          onClick={() => {
            hasUserManuallyZoomed.current = false;
            handleFitToScreen();
          }}
          className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white flex items-center gap-1 text-xs cursor-pointer"
          title={t('editor.fitToScreen', undefined, 'Fit to Screen')}
        >
          <Maximize2 className="w-3.5 h-3.5" />
          <span>{t('editor.fitToScreen', undefined, 'Fit')}</span>
        </button>

        <button
          onClick={() => {
            hasUserManuallyZoomed.current = true;
            setZoom(1.0);
            setPanOffset({ x: 0, y: 0 });
          }}
          className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white text-xs cursor-pointer font-mono"
          title={t('editor.resetZoomTooltip', undefined, 'Reset Zoom to 100%')}
        >
          100%
        </button>

        <div className="w-px h-4 bg-slate-700 mx-1" />

        {/* Grid Overlay Toggle */}
        <button
          onClick={() => setShowGrid((g) => !g)}
          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
            showGrid
              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
              : 'hover:bg-slate-800 text-slate-400'
          }`}
          title="Toggle Grid"
        >
          <Grid className="w-4 h-4" />
        </button>

        {showGrid && (
          <select
            value={gridSize}
            onChange={(e) => setGridSize(Number(e.target.value) as GridSizePreset)}
            className="bg-slate-950 border border-slate-700 text-slate-300 text-[11px] font-mono rounded px-1 py-0.5 outline-none cursor-pointer"
          >
            {GRID_SIZE_PRESETS.map((sz) => (
              <option key={sz} value={sz}>
                {sz}px
              </option>
            ))}
          </select>
        )}

        {/* Magnetic Snapping Toggle */}
        <button
          onClick={() => setSnapEnabled((s) => !s)}
          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
            snapEnabled
              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
              : 'hover:bg-slate-800 text-slate-400'
          }`}
          title="Toggle Magnetic Snap (Hold Alt to bypass)"
        >
          <Magnet className="w-4 h-4" />
        </button>

        {/* Distance Measurements Toggle */}
        <button
          onClick={() => setShowMeasurements((m) => !m)}
          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
            showMeasurements
              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
              : 'hover:bg-slate-800 text-slate-400'
          }`}
          title="Toggle Distance Measurements (Hold Alt to inspect)"
        >
          <Ruler className="w-4 h-4" />
        </button>

        {/* Selection / Cursor Status Badges */}
        {primaryElement && (
          <>
            <div className="w-px h-4 bg-slate-700 mx-1" />
            <span className="text-xs font-mono text-slate-400 px-1">
              {selectedIds.length > 1
                ? `${selectedIds.length} items`
                : `${primaryElement.type}: ${Math.round(primaryElement.width)}×${Math.round(primaryElement.height)}`}
            </span>
          </>
        )}

        {mouseLogicalCoords && (
          <>
            <div className="w-px h-4 bg-slate-700 mx-1" />
            <span className="text-xs font-mono text-slate-500 px-1">
              X: {mouseLogicalCoords.x}, Y: {mouseLogicalCoords.y}
            </span>
          </>
        )}
      </div>
    </div>
  );
};
