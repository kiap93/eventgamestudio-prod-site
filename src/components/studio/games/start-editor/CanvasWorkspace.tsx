import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  StartScreenElement,
  StartScreenCardElement,
  StartScreenGroupElement,
  StartScreenConfig,
  StartScreenGameMeta,
} from '../../../../games/shared/startScreenTypes';
import { StartElementContent } from '../../../../games/shared/StartElementContent';
import { resolveScreenBackground } from '../../../../themes/screenBackground';
import { GameTheme } from '../../../../themes/types';
import {
  EditorInteractionState,
  InteractionMode,
  ZOOM_PRESETS,
} from '../result-editor/types';
import { ResizeHandle } from './types';
import {
  calculateSnap,
  calculateResizeSnap,
  AlignmentGuide,
} from '../result-editor/snapping';
import {
  calculateMeasurements,
  SpacingMeasurement,
  GRID_SIZE_PRESETS,
  GridSizePreset,
} from '../result-editor/measurements';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCcw,
  RotateCw,
  Lock,
  Move,
  MousePointer,
  Grid,
  Magnet,
  Ruler,
} from 'lucide-react';

interface CanvasWorkspaceProps {
  startConfig: StartScreenConfig;
  theme: Partial<GameTheme>;
  gameType?: string;
  gameMeta?: StartScreenGameMeta;
  elements: StartScreenElement[];
  selectedIds: string[];
  isPreviewMode?: boolean;
  onExitPreview?: () => void;
  onSelectElement: (id: string, e?: React.MouseEvent) => void;
  onClearSelection: () => void;
  onUpdateElements: (updates: Record<string, Partial<StartScreenElement>>) => void;
  onUpdateSingleElement: (id: string, updater: (prev: StartScreenElement) => StartScreenElement) => void;
  findElementAndParent: (
    id: string,
    list: StartScreenElement[]
  ) => { element: StartScreenElement; parent: StartScreenCardElement | StartScreenGroupElement | null } | null;
  onGestureStart?: (currentElements: StartScreenElement[]) => void;
  onGestureEnd?: (finalElements: StartScreenElement[]) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
}

export const CanvasWorkspace: React.FC<CanvasWorkspaceProps> = ({
  startConfig,
  theme,
  gameType = 'memory-match',
  gameMeta,
  elements,
  selectedIds,
  isPreviewMode = false,
  onExitPreview,
  onSelectElement,
  onClearSelection,
  onUpdateElements,
  onUpdateSingleElement,
  findElementAndParent,
  onGestureStart,
  onGestureEnd,
  onUndo,
  onRedo,
  onDelete,
  onDuplicate,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  // Viewport / Zoom / Pan state
  const [zoom, setZoom] = useState<number>(0.65);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [isSpacePressed, setIsSpacePressed] = useState<boolean>(false);
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Grid, Snapping & Measurement toggles
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [gridSize, setGridSize] = useState<GridSizePreset>(20);
  const [enableSnapping, setEnableSnapping] = useState<boolean>(true);
  const [showMeasurements, setShowMeasurements] = useState<boolean>(true);
  const [activeGuides, setActiveGuides] = useState<AlignmentGuide[]>([]);
  const [activeMeasurements, setActiveMeasurements] = useState<SpacingMeasurement[]>([]);

  // Drag / Resize / Rotate interaction state
  const [interactionState, setInteractionState] = useState<EditorInteractionState>({
    mode: 'idle',
    handle: null,
    dragStartPos: { x: 0, y: 0 },
    initialElementRects: {},
    initialMousePos: { x: 0, y: 0 },
    initialRotation: 0,
    centerPos: { x: 0, y: 0 },
  });

  const gestureStartedRef = useRef(false);

  // Marquee selection box
  const [marqueeBox, setMarqueeBox] = useState<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);

  // Background resolution
  const bg = resolveScreenBackground(startConfig, theme);

  // Canvas bounds matching startConfig.canvas (1024x576 for 16:9, 576x1024 for 9:16)
  const CANVAS_WIDTH = startConfig?.canvas?.width || 1024;
  const CANVAS_HEIGHT = startConfig?.canvas?.height || 576;

  // Auto-fit zoom on mount or resize
  const autoFitZoom = useCallback(() => {
    if (!containerRef.current) return;
    const { clientWidth, clientHeight } = containerRef.current;
    if (clientWidth <= 0 || clientHeight <= 0) return;

    const padding = 48;
    const availableWidth = clientWidth - padding * 2;
    const availableHeight = clientHeight - padding * 2;

    const scaleX = availableWidth / CANVAS_WIDTH;
    const scaleY = availableHeight / CANVAS_HEIGHT;
    const fitScale = Math.min(scaleX, scaleY, 1.2);

    const targetZoom = Math.max(0.2, Math.min(fitScale, 1.0));
    setZoom(Number(targetZoom.toFixed(2)));
    setPan({ x: 0, y: 0 });
  }, [CANVAS_WIDTH, CANVAS_HEIGHT]);

  useEffect(() => {
    autoFitZoom();
    window.addEventListener('resize', autoFitZoom);
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      ro = new ResizeObserver(() => {
        autoFitZoom();
      });
      ro.observe(containerRef.current);
    }
    return () => {
      window.removeEventListener('resize', autoFitZoom);
      ro?.disconnect();
    };
  }, [autoFitZoom]);

  // Handle Wheel Zoom & Pan
  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom((prev) => {
        const next = Math.max(0.2, Math.min(2.5, prev * zoomFactor));
        return Number(next.toFixed(2));
      });
    } else {
      setPan((prev) => ({
        x: prev.x - e.deltaX,
        y: prev.y - e.deltaY,
      }));
    }
  };

  // Middle-mouse, Alt key, or Space key panning
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && (e.altKey || isSpacePressed))) {
      e.preventDefault();
      setIsPanning(true);
      panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
      return;
    }

    if (isPreviewMode) return;

    // Canvas marquee selection start
    if (e.target === canvasRef.current || e.target === containerRef.current) {
      if (!e.shiftKey) {
        onClearSelection();
      }
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const canvasX = (e.clientX - rect.left) / zoom;
        const canvasY = (e.clientY - rect.top) / zoom;
        setMarqueeBox({
          startX: canvasX,
          startY: canvasY,
          currentX: canvasX,
          currentY: canvasY,
        });
      }
    }
  };

  // Keyboard Shortcuts (Arrow keys nudge, Delete, Undo/Redo, Space pan, etc.)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Space key for panning canvas
      if (e.code === 'Space' && !e.repeat) {
        const activeEl = document.activeElement;
        const isInput =
          activeEl &&
          (activeEl.tagName === 'INPUT' ||
            activeEl.tagName === 'TEXTAREA' ||
            activeEl.tagName === 'SELECT' ||
            activeEl.getAttribute('contenteditable') === 'true');
        if (!isInput) {
          e.preventDefault();
          setIsSpacePressed(true);
          return;
        }
      }

      // Don't intercept editing shortcuts if user is typing in an input/textarea/select
      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.tagName === 'SELECT' ||
          activeEl.getAttribute('contenteditable') === 'true')
      ) {
        return;
      }

      // Undo / Redo
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          if (onRedo) onRedo();
        } else {
          if (onUndo) onUndo();
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        if (onRedo) onRedo();
        return;
      }

      // Duplicate (Ctrl/Cmd + D)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        if (onDuplicate) onDuplicate();
        return;
      }

      // Delete (Delete or Backspace)
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedIds.length > 0) {
          e.preventDefault();
          if (onDelete) onDelete();
          return;
        }
      }

      // Deselect (Escape)
      if (e.key === 'Escape') {
        onClearSelection();
        return;
      }

      // Grid toggle (G)
      if (e.key.toLowerCase() === 'g' && !e.ctrlKey && !e.metaKey) {
        setShowGrid((prev) => !prev);
        return;
      }

      // Snapping toggle (S)
      if (e.key.toLowerCase() === 's' && !e.ctrlKey && !e.metaKey) {
        setEnableSnapping((prev) => !prev);
        return;
      }

      // Arrow Key Nudge
      if (
        selectedIds.length > 0 &&
        ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)
      ) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        let dx = 0;
        let dy = 0;
        if (e.key === 'ArrowLeft') dx = -step;
        if (e.key === 'ArrowRight') dx = step;
        if (e.key === 'ArrowUp') dy = -step;
        if (e.key === 'ArrowDown') dy = step;

        const updates: Record<string, Partial<StartScreenElement>> = {};
        for (const id of selectedIds) {
          const info = findElementAndParent(id, elements);
          if (info && !info.element.locked) {
            updates[id] = {
              x: Math.round(info.element.x + dx),
              y: Math.round(info.element.y + dy),
            };
          }
        }
        if (Object.keys(updates).length > 0) {
          if (onGestureStart) onGestureStart(elements);
          onUpdateElements(updates);
          if (onGestureEnd) onGestureEnd(elements);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [
    selectedIds,
    elements,
    findElementAndParent,
    onUpdateElements,
    onUndo,
    onRedo,
    onDelete,
    onDuplicate,
    onClearSelection,
    onGestureStart,
    onGestureEnd,
  ]);

  // Handle Drag Start for an element
  const handleElementMouseDown = (
    el: StartScreenElement,
    parentWidth: number,
    parentHeight: number,
    e: React.MouseEvent
  ) => {
    if (isPreviewMode) return;
    if (isSpacePressed) return;

    if (el.locked) {
      e.stopPropagation();
      return;
    }

    if (e.button !== 0) return; // Left click only
    e.stopPropagation();

    // Update selection if not already selected
    if (!selectedIds.includes(el.id)) {
      onSelectElement(el.id, e);
    }

    const currentSelected = selectedIds.includes(el.id)
      ? selectedIds
      : e.shiftKey
      ? [...selectedIds, el.id]
      : [el.id];

    // Snapshot initial positions
    const initialRects: Record<string, { x: number; y: number; width: number; height: number }> = {};
    for (const id of currentSelected) {
      const info = findElementAndParent(id, elements);
      if (info) {
        initialRects[id] = {
          x: info.element.x,
          y: info.element.y,
          width: info.element.width,
          height: info.element.height,
        };
      }
    }

    if (onGestureStart && !gestureStartedRef.current) {
      gestureStartedRef.current = true;
      onGestureStart(elements);
    }

    setInteractionState({
      mode: 'dragging',
      handle: null,
      dragStartPos: { x: el.x, y: el.y },
      initialElementRects: initialRects,
      initialMousePos: { x: e.clientX, y: e.clientY },
      initialRotation: el.rotation || 0,
      centerPos: { x: 0, y: 0 },
    });
  };

  // Handle Resize Start
  const handleResizeStart = (
    el: StartScreenElement,
    handle: ResizeHandle,
    e: React.MouseEvent
  ) => {
    if (el.locked) return;
    e.stopPropagation();

    if (onGestureStart && !gestureStartedRef.current) {
      gestureStartedRef.current = true;
      onGestureStart(elements);
    }

    setInteractionState({
      mode: 'resizing',
      handle,
      dragStartPos: { x: el.x, y: el.y },
      initialElementRects: {
        [el.id]: {
          x: el.x,
          y: el.y,
          width: el.width,
          height: el.height,
        },
      },
      initialMousePos: { x: e.clientX, y: e.clientY },
      initialRotation: el.rotation || 0,
      centerPos: { x: 0, y: 0 },
    });
  };

  // Handle Rotate Start
  const handleRotateStart = (
    el: StartScreenElement,
    parentWidth: number,
    parentHeight: number,
    e: React.MouseEvent
  ) => {
    if (el.locked) return;
    e.stopPropagation();

    const canvasRect = canvasRef.current?.getBoundingClientRect();
    if (!canvasRect) return;

    // Center of element in screen coordinates
    const elCenterX = canvasRect.left + (el.x + el.width / 2) * zoom;
    const elCenterY = canvasRect.top + (el.y + el.height / 2) * zoom;

    if (onGestureStart && !gestureStartedRef.current) {
      gestureStartedRef.current = true;
      onGestureStart(elements);
    }

    setInteractionState({
      mode: 'rotating',
      handle: null,
      dragStartPos: { x: el.x, y: el.y },
      initialElementRects: {
        [el.id]: {
          x: el.x,
          y: el.y,
          width: el.width,
          height: el.height,
        },
      },
      initialMousePos: { x: e.clientX, y: e.clientY },
      initialRotation: el.rotation || 0,
      centerPos: { x: elCenterX, y: elCenterY },
    });
  };

  // Global Pointer Move
  const handleMouseMove = (e: React.MouseEvent) => {
    // Pan
    if (isPanning) {
      setPan({
        x: e.clientX - panStartRef.current.x,
        y: e.clientY - panStartRef.current.y,
      });
      return;
    }

    // Marquee
    if (marqueeBox) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const currentX = (e.clientX - rect.left) / zoom;
        const currentY = (e.clientY - rect.top) / zoom;
        setMarqueeBox((prev) => (prev ? { ...prev, currentX, currentY } : null));
      }
      return;
    }

    // Dragging
    if (interactionState.mode === 'dragging') {
      const deltaScreenX = e.clientX - interactionState.initialMousePos.x;
      const deltaScreenY = e.clientY - interactionState.initialMousePos.y;
      const deltaCanvasX = deltaScreenX / zoom;
      const deltaCanvasY = deltaScreenY / zoom;

      const updates: Record<string, Partial<StartScreenElement>> = {};
      const primaryId = selectedIds[0];
      const primaryInfo = findElementAndParent(primaryId, elements);

      let snapOffsetX = 0;
      let snapOffsetY = 0;

      if (enableSnapping && primaryInfo) {
        const initialRect = interactionState.initialElementRects[primaryId];
        if (initialRect) {
          const targetX = initialRect.x + deltaCanvasX;
          const targetY = initialRect.y + deltaCanvasY;

          const pWidth = primaryInfo.parent ? primaryInfo.parent.width : CANVAS_WIDTH;
          const pHeight = primaryInfo.parent ? primaryInfo.parent.height : CANVAS_HEIGHT;

          // Sibling elements for snapping
          const siblingList = primaryInfo.parent ? primaryInfo.parent.children || [] : elements;
          const otherElements = siblingList.filter((s) => !selectedIds.includes(s.id));

          const siblingBoxes = otherElements.map((el) => ({
            x: el.x,
            y: el.y,
            width: el.width,
            height: el.height,
          }));

          const snapResult = calculateSnap(
            {
              x: targetX,
              y: targetY,
              width: initialRect.width,
              height: initialRect.height,
            },
            pWidth,
            pHeight,
            siblingBoxes,
            selectedIds,
            8 / zoom,
            !primaryInfo.parent
          );

          snapOffsetX = snapResult.x - targetX;
          snapOffsetY = snapResult.y - targetY;
          setActiveGuides(snapResult.guides);
        }
      } else {
        setActiveGuides([]);
      }

      for (const id of selectedIds) {
        const initialRect = interactionState.initialElementRects[id];
        if (initialRect) {
          const nextX = Math.round(initialRect.x + deltaCanvasX + snapOffsetX);
          const nextY = Math.round(initialRect.y + deltaCanvasY + snapOffsetY);
          updates[id] = { x: nextX, y: nextY };
        }
      }

      if (Object.keys(updates).length > 0) {
        onUpdateElements(updates);
      }

      // Measurements
      if (showMeasurements && primaryInfo) {
        const initialRect = interactionState.initialElementRects[primaryId];
        if (initialRect) {
          const pWidth = primaryInfo.parent ? primaryInfo.parent.width : CANVAS_WIDTH;
          const pHeight = primaryInfo.parent ? primaryInfo.parent.height : CANVAS_HEIGHT;
          const siblingList = primaryInfo.parent ? primaryInfo.parent.children || [] : elements;
          const otherElements = siblingList.filter((s) => !selectedIds.includes(s.id));

          const measurements = calculateMeasurements(
            {
              x: initialRect.x + deltaCanvasX + snapOffsetX,
              y: initialRect.y + deltaCanvasY + snapOffsetY,
              width: initialRect.width,
              height: initialRect.height,
            },
            pWidth,
            pHeight,
            otherElements as any,
            primaryId
          );
          setActiveMeasurements(measurements);
        }
      } else {
        setActiveMeasurements([]);
      }
      return;
    }

    // Resizing
    if (interactionState.mode === 'resizing' && interactionState.handle) {
      const primaryId = selectedIds[0];
      const initialRect = interactionState.initialElementRects[primaryId];
      const info = findElementAndParent(primaryId, elements);

      if (initialRect && info) {
        const deltaX = (e.clientX - interactionState.initialMousePos.x) / zoom;
        const deltaY = (e.clientY - interactionState.initialMousePos.y) / zoom;

        let newX = initialRect.x;
        let newY = initialRect.y;
        let newWidth = initialRect.width;
        let newHeight = initialRect.height;

        const handle = interactionState.handle;

        if (handle.includes('e')) newWidth = Math.max(20, initialRect.width + deltaX);
        if (handle.includes('w')) {
          const w = Math.max(20, initialRect.width - deltaX);
          newX = initialRect.x + (initialRect.width - w);
          newWidth = w;
        }
        if (handle.includes('s')) newHeight = Math.max(20, initialRect.height + deltaY);
        if (handle.includes('n')) {
          const h = Math.max(20, initialRect.height - deltaY);
          newY = initialRect.y + (initialRect.height - h);
          newHeight = h;
        }

        // Shift key locks aspect ratio
        if (e.shiftKey) {
          const originalRatio = initialRect.width / initialRect.height;
          if (handle === 'se' || handle === 'nw') {
            newHeight = newWidth / originalRatio;
          } else if (handle === 'ne' || handle === 'sw') {
            newHeight = newWidth / originalRatio;
          }
        }

        onUpdateSingleElement(primaryId, (prev) => ({
          ...prev,
          x: Math.round(newX),
          y: Math.round(newY),
          width: Math.round(newWidth),
          height: Math.round(newHeight),
        }));
      }
      return;
    }

    // Rotating
    if (interactionState.mode === 'rotating') {
      const primaryId = selectedIds[0];
      const { centerPos, initialRotation } = interactionState;

      const angleRad = Math.atan2(e.clientY - centerPos.y, e.clientX - centerPos.x);
      let angleDeg = Math.round((angleRad * 180) / Math.PI) + 90;

      // Shift key snaps to 15-degree steps
      if (e.shiftKey) {
        angleDeg = Math.round(angleDeg / 15) * 15;
      }

      // Normalize between -180 and 180
      while (angleDeg > 180) angleDeg -= 360;
      while (angleDeg < -180) angleDeg += 360;

      onUpdateSingleElement(primaryId, (prev) => ({
        ...prev,
        rotation: angleDeg,
      }));
      return;
    }
  };

  // Global Pointer Up
  const handleMouseUp = () => {
    if (isPanning) {
      setIsPanning(false);
    }

    if (marqueeBox) {
      // Find all elements that intersect the marquee box
      const minX = Math.min(marqueeBox.startX, marqueeBox.currentX);
      const maxX = Math.max(marqueeBox.startX, marqueeBox.currentX);
      const minY = Math.min(marqueeBox.startY, marqueeBox.currentY);
      const maxY = Math.max(marqueeBox.startY, marqueeBox.currentY);

      if (maxX - minX > 5 || maxY - minY > 5) {
        const newlySelected: string[] = [];
        for (const el of elements) {
          if (
            el.x < maxX &&
            el.x + el.width > minX &&
            el.y < maxY &&
            el.y + el.height > minY
          ) {
            newlySelected.push(el.id);
          }
        }
        if (newlySelected.length > 0) {
          newlySelected.forEach((id, idx) => {
            onSelectElement(id, { shiftKey: idx > 0 } as any);
          });
        }
      }
      setMarqueeBox(null);
    }

    if (gestureStartedRef.current) {
      gestureStartedRef.current = false;
      if (onGestureEnd) {
        onGestureEnd(elements);
      }
    }

    setInteractionState({
      mode: 'idle',
      handle: null,
      dragStartPos: { x: 0, y: 0 },
      initialElementRects: {},
      initialMousePos: { x: 0, y: 0 },
      initialRotation: 0,
      centerPos: { x: 0, y: 0 },
    });
    setActiveGuides([]);
    setActiveMeasurements([]);
  };

  // Recursive element renderer with visual selection chrome & resize handles
  const renderElement = (
    el: StartScreenElement,
    parentWidth: number,
    parentHeight: number,
    depth: number = 0
  ): React.ReactNode => {
    if (el.visible === false) return null;

    const isSelected = !isPreviewMode && selectedIds.includes(el.id);
    const isPrimarySelected = !isPreviewMode && selectedIds[0] === el.id;

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
      opacity: el.opacity ?? 1,
      zIndex: el.zIndex ?? 1,
      transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
      cursor: isPreviewMode ? 'default' : isSpacePressed ? (isPanning ? 'grabbing' : 'grab') : el.locked ? 'not-allowed' : 'move',
      boxSizing: 'border-box',
    };

    return (
      <div
        key={el.id}
        id={`editor-el-${el.id}`}
        style={commonStyle}
        onMouseDown={(e) => handleElementMouseDown(el, parentWidth, parentHeight, e)}
        className="group/element"
      >
        {/* Render actual visual component */}
        <StartElementContent
          element={el}
          parentWidth={parentWidth}
          parentHeight={parentHeight}
          theme={theme}
          gameType={gameType}
          gameMeta={gameMeta}
          isEditor={true}
          isSimulation={true}
          onStartGame={() => {}}
          onShowLeaderboard={() => {}}
          onShowGuide={() => {}}
          onOpenSettings={() => {}}
          renderChild={(child, pW, pH) => renderElement(child, pW, pH, depth + 1)}
        />

        {/* Selection Outline & Handles */}
        {isSelected && (
          <div
            className={`absolute inset-0 pointer-events-none border-2 transition-colors ${
              el.locked
                ? 'border-rose-500/80 shadow-[0_0_12px_rgba(244,63,94,0.4)]'
                : 'border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.5)]'
            }`}
          >
            {/* Element Label Pill */}
            <div
              className={`absolute -top-7 left-0 px-2 py-0.5 rounded text-[11px] font-mono font-bold flex items-center gap-1.5 shadow-md ${
                el.locked
                  ? 'bg-rose-600 text-white'
                  : 'bg-amber-500 text-slate-950'
              }`}
            >
              {el.locked && <Lock className="w-3 h-3" />}
              <span>{el.type.toUpperCase()}</span>
              <span className="opacity-75 text-[10px]">
                {Math.round(el.width)}×{Math.round(el.height)}
              </span>
            </div>

            {/* Resize Handles (Only for primary unlocked element) */}
            {isPrimarySelected && !el.locked && (
              <>
                {/* 8 Resize Points */}
                {(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as ResizeHandle[]).map(
                  (handle) => {
                    let handleClass = '';
                    if (handle === 'nw') handleClass = '-top-1.5 -left-1.5 cursor-nwse-resize';
                    if (handle === 'n') handleClass = '-top-1.5 left-1/2 -translate-x-1/2 cursor-ns-resize';
                    if (handle === 'ne') handleClass = '-top-1.5 -right-1.5 cursor-nesw-resize';
                    if (handle === 'e') handleClass = 'top-1/2 -right-1.5 -translate-y-1/2 cursor-ew-resize';
                    if (handle === 'se') handleClass = '-bottom-1.5 -right-1.5 cursor-nwse-resize';
                    if (handle === 's') handleClass = '-bottom-1.5 left-1/2 -translate-x-1/2 cursor-ns-resize';
                    if (handle === 'sw') handleClass = '-bottom-1.5 -left-1.5 cursor-nesw-resize';
                    if (handle === 'w') handleClass = 'top-1/2 -left-1.5 -translate-y-1/2 cursor-ew-resize';

                    return (
                      <div
                        key={handle}
                        onMouseDown={(e) => handleResizeStart(el, handle, e)}
                        className={`absolute w-3 h-3 bg-white border-2 border-amber-500 rounded-xs pointer-events-auto shadow hover:scale-125 transition-transform ${handleClass}`}
                      />
                    );
                  }
                )}

                {/* Rotation Handle */}
                <div
                  onMouseDown={(e) => handleRotateStart(el, parentWidth, parentHeight, e)}
                  className="absolute -top-7 left-1/2 -translate-x-1/2 w-4 h-4 bg-amber-400 border-2 border-slate-950 rounded-full cursor-grab active:cursor-grabbing pointer-events-auto flex items-center justify-center shadow hover:scale-125 transition-transform"
                >
                  <RotateCw className="w-2.5 h-2.5 text-slate-950" />
                </div>
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      className={`relative w-full h-full bg-slate-950 overflow-hidden select-none flex items-center justify-center ${
        isPanning ? 'cursor-grabbing' : isSpacePressed ? 'cursor-grab' : 'cursor-default'
      }`}
    >
      {/* Background Dots Canvas Backdrop */}
      <div
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.3) 1px, transparent 0)',
          backgroundSize: '24px 24px',
        }}
      />

      {/* Floating Preview Mode Banner */}
      {isPreviewMode && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 bg-slate-900/90 backdrop-blur-md border border-amber-500/50 rounded-full px-4 py-1.5 flex items-center gap-3 shadow-2xl">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-semibold text-slate-200">
            Preview Mode • Live Start Screen Experience
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

      {/* Floating Viewport / Canvas Controls Toolbar */}
      <div className="absolute bottom-4 left-4 z-40 bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-xl px-2.5 py-1.5 flex items-center gap-2 shadow-2xl text-slate-300">
        <button
          onClick={() => setZoom((z) => Math.max(0.2, Number((z - 0.1).toFixed(2))))}
          className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white"
          title="Zoom Out (Ctrl -)"
        >
          <ZoomOut className="w-4 h-4" />
        </button>

        {/* Zoom Dropdown Presets */}
        <select
          value={Math.round(zoom * 100)}
          onChange={(e) => setZoom(Number(e.target.value) / 100)}
          className="bg-slate-950 border border-slate-700 text-amber-400 text-xs font-mono font-bold rounded px-1.5 py-1 outline-none cursor-pointer"
        >
          <option value="25">25%</option>
          <option value="50">50%</option>
          <option value="65">65%</option>
          <option value="75">75%</option>
          <option value="100">100%</option>
          <option value="125">125%</option>
          <option value="150">150%</option>
          <option value="200">200%</option>
        </select>

        <button
          onClick={() => setZoom((z) => Math.min(2.5, Number((z + 0.1).toFixed(2))))}
          className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white"
          title="Zoom In (Ctrl +)"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <div className="w-px h-4 bg-slate-700 mx-0.5" />
        <button
          onClick={autoFitZoom}
          className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white"
          title="Reset View / Fit to Window"
        >
          <Maximize2 className="w-4 h-4" />
        </button>

        <div className="w-px h-4 bg-slate-700 mx-0.5" />

        {/* Grid Toggle */}
        <button
          onClick={() => setShowGrid((g) => !g)}
          className={`p-1.5 rounded-lg transition-colors ${
            showGrid ? 'bg-amber-500/20 text-amber-400' : 'hover:bg-slate-800 text-slate-400'
          }`}
          title="Toggle Grid Overlay (G)"
        >
          <Grid className="w-4 h-4" />
        </button>

        {/* Snap Toggle */}
        <button
          onClick={() => setEnableSnapping((s) => !s)}
          className={`p-1.5 rounded-lg transition-colors ${
            enableSnapping ? 'bg-amber-500/20 text-amber-400' : 'hover:bg-slate-800 text-slate-400'
          }`}
          title="Toggle Smart Snapping (S)"
        >
          <Magnet className="w-4 h-4" />
        </button>

        {/* Measurements Toggle */}
        <button
          onClick={() => setShowMeasurements((m) => !m)}
          className={`p-1.5 rounded-lg transition-colors ${
            showMeasurements ? 'bg-amber-500/20 text-amber-400' : 'hover:bg-slate-800 text-slate-400'
          }`}
          title="Toggle Distance Measurements"
        >
          <Ruler className="w-4 h-4" />
        </button>
      </div>

      {/* Logical Canvas Container */}
      <div
        ref={canvasRef}
        style={{
          width: `${CANVAS_WIDTH}px`,
          height: `${CANVAS_HEIGHT}px`,
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: 'center center',
          ...bg.containerStyle,
        }}
        className="relative shrink-0 shadow-2xl rounded-2xl border-2 border-slate-700/60 overflow-hidden"
      >
        {/* Background Overlay Layer */}
        <div
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={bg.overlayStyle}
        />

        {/* Grid Overlay */}
        {!isPreviewMode && showGrid && (
          <div
            className="absolute inset-0 w-full h-full pointer-events-none opacity-20"
            style={{
              backgroundImage: `linear-gradient(to right, rgba(255,255,255,0.2) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.2) 1px, transparent 1px)`,
              backgroundSize: `${gridSize}px ${gridSize}px`,
            }}
          />
        )}

        {/* Element Layers */}
        {elements.map((el) => renderElement(el, CANVAS_WIDTH, CANVAS_HEIGHT, 0))}

        {/* Alignment Snapping Guides */}
        {!isPreviewMode &&
          activeGuides.map((guide, idx) => {
            const isVert =
              (guide as any).type === 'vertical' || (guide as any).orientation === 'vertical';
            return (
              <div
                key={`guide-${idx}`}
                className="absolute pointer-events-none z-50 transition-opacity duration-75"
                style={{
                  left: isVert ? `${guide.position}px` : `${guide.start ?? 0}px`,
                  top: isVert ? `${guide.start ?? 0}px` : `${guide.position}px`,
                  width: isVert ? '1.5px' : `${(guide.end ?? CANVAS_WIDTH) - (guide.start ?? 0)}px`,
                  height: isVert ? `${(guide.end ?? CANVAS_HEIGHT) - (guide.start ?? 0)}px` : '1.5px',
                  transform: isVert ? 'translateX(-50%)' : 'translateY(-50%)',
                }}
              >
                <div className="w-full h-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.95)] opacity-95" />
                {guide.label && (
                  <div className="absolute top-1 left-1.5 -translate-y-1/2 bg-slate-950/95 border border-amber-400/80 text-amber-300 font-mono text-[9px] font-bold px-1.5 py-0.5 rounded shadow-lg whitespace-nowrap">
                    {guide.label}
                  </div>
                )}
              </div>
            );
          })}

        {/* Spacing / Distance Measurements */}
        {!isPreviewMode &&
          showMeasurements &&
          activeMeasurements.map((m, idx) => (
            <div
              key={`measurement-${idx}`}
              className="absolute pointer-events-none z-50 flex items-center justify-center"
              style={{
                left: `${m.startX}px`,
                top: `${m.startY}px`,
                width: `${Math.abs(m.endX - m.startX)}px`,
                height: `${Math.abs(m.endY - m.startY)}px`,
              }}
            >
              <span className="bg-slate-900/90 text-amber-300 font-mono text-[10px] px-1 rounded border border-amber-500/40">
                {m.distance}px
              </span>
            </div>
          ))}

        {/* Marquee Selection Box */}
        {!isPreviewMode && marqueeBox && (
          <div
            className="absolute border border-amber-400 bg-amber-500/10 pointer-events-none z-50"
            style={{
              left: `${Math.min(marqueeBox.startX, marqueeBox.currentX)}px`,
              top: `${Math.min(marqueeBox.startY, marqueeBox.currentY)}px`,
              width: `${Math.abs(marqueeBox.currentX - marqueeBox.startX)}px`,
              height: `${Math.abs(marqueeBox.currentY - marqueeBox.startY)}px`,
            }}
          />
        )}
      </div>
    </div>
  );
};
