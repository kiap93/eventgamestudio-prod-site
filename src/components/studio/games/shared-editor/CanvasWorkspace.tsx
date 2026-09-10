/**
 * Shared Visual Editor Engine - Canvas Workspace Component
 * Universal canvas workspace for Start Screen (dynamic 1024x576 / 576x1024)
 * and Result Screen (1000x1000), supporting zoom, pan, drag, multi-select,
 * snapping guides, live measurements, resize, and rotation.
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  BaseVisualElement,
  ResizeHandle,
  ZOOM_PRESETS,
  AlignmentType,
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
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCw,
  Lock,
  Grid,
  Magnet,
  Ruler,
} from 'lucide-react';

export interface CanvasWorkspaceProps<T extends BaseVisualElement = BaseVisualElement> {
  canvasWidth: number;
  canvasHeight: number;
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
  renderElementContent: (
    element: T,
    isSelected: boolean,
    context: {
      parentWidth: number;
      parentHeight: number;
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

interface InteractionState {
  mode: 'none' | 'dragging' | 'resizing' | 'rotating';
  activeElementId: string | null;
  handle?: ResizeHandle;
  initialMousePos: { x: number; y: number };
  initialElementRects: Record<string, { x: number; y: number; width: number; height: number }>;
  initialRotation?: number;
  centerPos?: { x: number; y: number };
}

interface MarqueeBox {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

export const CanvasWorkspace = <T extends BaseVisualElement = BaseVisualElement>({
  canvasWidth,
  canvasHeight,
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
  renderElementContent,
  onGestureStart,
  onGestureEnd,
  onUndo,
  onRedo,
  onDelete,
  onDuplicate,
}: CanvasWorkspaceProps<T>) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  // Viewport State
  const [zoom, setZoom] = useState<number>(0.75);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [isSpacePressed, setIsSpacePressed] = useState<boolean>(false);
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Helper overlays state
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [gridSize, setGridSize] = useState<GridSizePreset>(50);
  const [enableSnapping, setEnableSnapping] = useState<boolean>(true);
  const [showMeasurements, setShowMeasurements] = useState<boolean>(true);

  const [activeGuides, setActiveGuides] = useState<AlignmentGuide[]>([]);
  const [activeMeasurements, setActiveMeasurements] = useState<SpacingMeasurement[]>([]);

  // Drag / Resize / Rotate / Marquee interactions
  const [interactionState, setInteractionState] = useState<InteractionState>({
    mode: 'none',
    activeElementId: null,
    initialMousePos: { x: 0, y: 0 },
    initialElementRects: {},
  });

  const [marqueeBox, setMarqueeBox] = useState<MarqueeBox | null>(null);
  const [previewFeedback, setPreviewFeedback] = useState<string | null>(null);

  // Fit Canvas on mount or dimension change
  const handleFitToScreen = useCallback(() => {
    if (!containerRef.current) return;
    const containerW = containerRef.current.clientWidth;
    const containerH = containerRef.current.clientHeight;

    const padding = 80;
    const scaleX = (containerW - padding) / canvasWidth;
    const scaleY = (containerH - padding) / canvasHeight;
    const newZoom = Math.max(0.2, Math.min(1.2, Number(Math.min(scaleX, scaleY).toFixed(2))));

    setZoom(newZoom);
    setPan({ x: 0, y: 0 });
  }, [canvasWidth, canvasHeight]);

  useEffect(() => {
    handleFitToScreen();
  }, [handleFitToScreen]);

  // Spacebar panning listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA' ||
        document.activeElement?.tagName === 'SELECT'
      ) {
        return;
      }

      if (e.code === 'Space' && !e.repeat) {
        setIsSpacePressed(true);
      }

      // Undo / Redo shortcuts
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

      // Duplicate shortcut
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        onDuplicate?.();
      }

      // Delete shortcut
      if (e.key === 'Backspace' || e.key === 'Delete') {
        if (selectedIds.length > 0) {
          e.preventDefault();
          onDelete?.();
        }
      }

      // Escape to deselect
      if (e.key === 'Escape') {
        onClearSelection();
      }

      // Arrow keys nudging
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        if (selectedIds.length > 0) {
          e.preventDefault();
          const step = e.shiftKey ? 10 : 1;
          const deltaX = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
          const deltaY = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;

          const updates: Record<string, Partial<T>> = {};
          for (const id of selectedIds) {
            const info = findElementAndParent(id, elements);
            if (info && !info.element.locked) {
              updates[id] = {
                x: info.element.x + deltaX,
                y: info.element.y + deltaY,
              } as Partial<T>;
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
        setIsSpacePressed(false);
        setIsPanning(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [
    elements,
    selectedIds,
    onUndo,
    onRedo,
    onDelete,
    onDuplicate,
    onClearSelection,
    onUpdateElements,
    findElementAndParent,
  ]);

  // Mouse Wheel Zoom / Pan
  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const zoomDelta = e.deltaY > 0 ? -0.05 : 0.05;
      setZoom((prev) => Math.max(0.2, Math.min(2.0, Number((prev + zoomDelta).toFixed(2)))));
    } else {
      setPan((prev) => ({
        x: prev.x - e.deltaX,
        y: prev.y - e.deltaY,
      }));
    }
  };

  // Pointer Down on Canvas background
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || isSpacePressed) {
      setIsPanning(true);
      panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
      return;
    }

    // Clicked background -> clear selection and start marquee selection
    if (e.target === canvasRef.current || e.target === containerRef.current) {
      onClearSelection();

      if (canvasRef.current && !isPreviewMode) {
        const rect = canvasRef.current.getBoundingClientRect();
        const startX = (e.clientX - rect.left) / zoom;
        const startY = (e.clientY - rect.top) / zoom;
        setMarqueeBox({
          startX,
          startY,
          currentX: startX,
          currentY: startY,
        });
      }
    }
  };

  // Drag Start
  const handleElementMouseDown = (el: T, e: React.MouseEvent) => {
    e.stopPropagation();

    if (isPreviewMode) return;
    if (isSpacePressed) return;

    if (!selectedIds.includes(el.id)) {
      onSelectElement(el.id, e);
    }

    if (el.locked) return;

    onGestureStart?.(elements);

    const initialRects: Record<string, { x: number; y: number; width: number; height: number }> = {};
    const idsToTrack = selectedIds.includes(el.id) ? selectedIds : [el.id];

    for (const id of idsToTrack) {
      const info = findElementAndParent(id, elements);
      if (info && !info.element.locked) {
        initialRects[id] = {
          x: info.element.x,
          y: info.element.y,
          width: info.element.width,
          height: info.element.height,
        };
      }
    }

    setInteractionState({
      mode: 'dragging',
      activeElementId: el.id,
      initialMousePos: { x: e.clientX, y: e.clientY },
      initialElementRects: initialRects,
    });
  };

  // Resize Start
  const handleResizeStart = (el: T, handle: ResizeHandle, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isPreviewMode || el.locked) return;

    onGestureStart?.(elements);

    setInteractionState({
      mode: 'resizing',
      activeElementId: el.id,
      handle,
      initialMousePos: { x: e.clientX, y: e.clientY },
      initialElementRects: {
        [el.id]: {
          x: el.x,
          y: el.y,
          width: el.width,
          height: el.height,
        },
      },
    });
  };

  // Rotate Start
  const handleRotateStart = (el: T, parentW: number, parentH: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isPreviewMode || el.locked) return;

    onGestureStart?.(elements);

    const canvasRect = canvasRef.current?.getBoundingClientRect();
    if (!canvasRect) return;

    const elCenterX = canvasRect.left + (el.x + el.width / 2) * zoom + pan.x;
    const elCenterY = canvasRect.top + (el.y + el.height / 2) * zoom + pan.y;

    setInteractionState({
      mode: 'rotating',
      activeElementId: el.id,
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

  // Pointer Move
  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({
        x: e.clientX - panStartRef.current.x,
        y: e.clientY - panStartRef.current.y,
      });
      return;
    }

    if (marqueeBox) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const currentX = (e.clientX - rect.left) / zoom;
        const currentY = (e.clientY - rect.top) / zoom;
        setMarqueeBox((prev) => (prev ? { ...prev, currentX, currentY } : null));
      }
      return;
    }

    if (interactionState.mode === 'dragging') {
      const deltaScreenX = e.clientX - interactionState.initialMousePos.x;
      const deltaScreenY = e.clientY - interactionState.initialMousePos.y;
      const deltaCanvasX = deltaScreenX / zoom;
      const deltaCanvasY = deltaScreenY / zoom;

      const updates: Record<string, Partial<T>> = {};
      const primaryId = selectedIds[0];
      const primaryInfo = findElementAndParent(primaryId, elements);

      let snapOffsetX = 0;
      let snapOffsetY = 0;

      if (enableSnapping && primaryInfo) {
        const initialRect = interactionState.initialElementRects[primaryId];
        if (initialRect) {
          const targetX = initialRect.x + deltaCanvasX;
          const targetY = initialRect.y + deltaCanvasY;

          const pWidth = primaryInfo.parent ? primaryInfo.parent.width : canvasWidth;
          const pHeight = primaryInfo.parent ? primaryInfo.parent.height : canvasHeight;

          const siblingList: T[] = primaryInfo.parent ? primaryInfo.parent.children || [] : elements;
          const otherElements = siblingList.filter((s) => !selectedIds.includes(s.id));

          const snapResult = calculateSnap(
            {
              x: targetX,
              y: targetY,
              width: initialRect.width,
              height: initialRect.height,
            },
            pWidth,
            pHeight,
            otherElements,
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
          updates[id] = { x: nextX, y: nextY } as Partial<T>;
        }
      }

      if (Object.keys(updates).length > 0) {
        onUpdateElements(updates);
      }

      // Live measurements
      if (showMeasurements && primaryInfo) {
        const pWidth = primaryInfo.parent ? primaryInfo.parent.width : canvasWidth;
        const pHeight = primaryInfo.parent ? primaryInfo.parent.height : canvasHeight;
        const initialRect = interactionState.initialElementRects[primaryId];
        if (initialRect) {
          const siblingList: T[] = primaryInfo.parent ? primaryInfo.parent.children || [] : elements;
          const currentBounds = {
            x: Math.round(initialRect.x + deltaCanvasX + snapOffsetX),
            y: Math.round(initialRect.y + deltaCanvasY + snapOffsetY),
            width: initialRect.width,
            height: initialRect.height,
          };
          const measurements = calculateMeasurements(
            currentBounds,
            pWidth,
            pHeight,
            siblingList,
            primaryId
          );
          setActiveMeasurements(measurements);
        }
      }
      return;
    }

    if (interactionState.mode === 'resizing' && interactionState.activeElementId && interactionState.handle) {
      const elId = interactionState.activeElementId;
      const initial = interactionState.initialElementRects[elId];
      if (!initial) return;

      const deltaX = (e.clientX - interactionState.initialMousePos.x) / zoom;
      const deltaY = (e.clientY - interactionState.initialMousePos.y) / zoom;

      let nextX = initial.x;
      let nextY = initial.y;
      let nextW = initial.width;
      let nextH = initial.height;

      const handle = interactionState.handle;

      if (handle.includes('e') || handle === 'r' || handle === 'tr' || handle === 'br' || handle === 'ne' || handle === 'se') {
        nextW = Math.max(20, Math.round(initial.width + deltaX));
      }
      if (handle.includes('s') || handle === 'b' || handle === 'bl' || handle === 'br' || handle === 'sw' || handle === 'se') {
        nextH = Math.max(20, Math.round(initial.height + deltaY));
      }
      if (handle.includes('w') || handle === 'l' || handle === 'tl' || handle === 'bl' || handle === 'nw' || handle === 'sw') {
        const proposedW = Math.max(20, Math.round(initial.width - deltaX));
        nextX = initial.x + (initial.width - proposedW);
        nextW = proposedW;
      }
      if (handle.includes('n') || handle === 't' || handle === 'tl' || handle === 'tr' || handle === 'nw' || handle === 'ne') {
        const proposedH = Math.max(20, Math.round(initial.height - deltaY));
        nextY = initial.y + (initial.height - proposedH);
        nextH = proposedH;
      }

      // Aspect ratio lock with Shift key
      if (e.shiftKey && initial.width > 0 && initial.height > 0) {
        const ratio = initial.width / initial.height;
        if (nextW / ratio < nextH) {
          nextH = Math.round(nextW / ratio);
        } else {
          nextW = Math.round(nextH * ratio);
        }
      }

      // Snapping during resize
      if (enableSnapping) {
        const elInfo = findElementAndParent(elId, elements);
        if (elInfo) {
          const pWidth = elInfo.parent ? elInfo.parent.width : canvasWidth;
          const pHeight = elInfo.parent ? elInfo.parent.height : canvasHeight;
          const siblings: T[] = elInfo.parent ? elInfo.parent.children || [] : elements;

          const resizeSnap = calculateResizeSnap(
            handle,
            { x: nextX, y: nextY, width: nextW, height: nextH },
            pWidth,
            pHeight,
            siblings,
            [elId],
            8 / zoom,
            !elInfo.parent
          );

          nextX = resizeSnap.box.x;
          nextY = resizeSnap.box.y;
          nextW = resizeSnap.box.width;
          nextH = resizeSnap.box.height;
          setActiveGuides(resizeSnap.guides);
        }
      } else {
        setActiveGuides([]);
      }

      onUpdateSingleElement(elId, (prev) => ({
        ...prev,
        x: nextX,
        y: nextY,
        width: nextW,
        height: nextH,
      }));
      return;
    }

    if (interactionState.mode === 'rotating' && interactionState.activeElementId && interactionState.centerPos) {
      const elId = interactionState.activeElementId;
      const dx = e.clientX - interactionState.centerPos.x;
      const dy = e.clientY - interactionState.centerPos.y;

      let angleDeg = Math.round((Math.atan2(dy, dx) * 180) / Math.PI + 90);
      if (angleDeg < 0) angleDeg += 360;

      // 15-degree snap with Shift
      if (e.shiftKey) {
        angleDeg = Math.round(angleDeg / 15) * 15;
      }

      onUpdateSingleElement(elId, (prev) => ({
        ...prev,
        rotation: angleDeg,
      }));
    }
  };

  // Pointer Up
  const handleMouseUp = () => {
    if (isPanning) {
      setIsPanning(false);
    }

    // Finish marquee selection
    if (marqueeBox) {
      const mLeft = Math.min(marqueeBox.startX, marqueeBox.currentX);
      const mTop = Math.min(marqueeBox.startY, marqueeBox.currentY);
      const mRight = Math.max(marqueeBox.startX, marqueeBox.currentX);
      const mBottom = Math.max(marqueeBox.startY, marqueeBox.currentY);

      if (mRight - mLeft > 5 || mBottom - mTop > 5) {
        const newlySelected: string[] = [];
        for (const el of elements) {
          if (el.locked || el.visible === false) continue;
          const elRight = el.x + el.width;
          const elBottom = el.y + el.height;
          // Check rectangle intersection
          if (el.x < mRight && elRight > mLeft && el.y < mBottom && elBottom > mTop) {
            newlySelected.push(el.id);
          }
        }
        if (newlySelected.length > 0) {
          onSelectElement(newlySelected[0]);
          for (let i = 1; i < newlySelected.length; i++) {
            onSelectElement(newlySelected[i], { shiftKey: true } as any);
          }
        }
      }
      setMarqueeBox(null);
    }

    if (interactionState.mode !== 'none') {
      onGestureEnd?.(elements);
      setInteractionState({
        mode: 'none',
        activeElementId: null,
        initialMousePos: { x: 0, y: 0 },
        initialElementRects: {},
      });
      setActiveGuides([]);
      setActiveMeasurements([]);
    }
  };

  const handleSafeEditorAction = (actionName: string) => {
    setPreviewFeedback(`${actionName} triggered`);
    setTimeout(() => setPreviewFeedback(null), 1800);
  };

  // Recursive element tree rendering
  const renderElement = (
    el: T,
    parentWidth: number,
    parentHeight: number,
    depth: number = 0
  ): React.ReactNode => {
    if (el.visible === false && isPreviewMode) {
      return null;
    }

    const isSelected = selectedIds.includes(el.id);
    const isPrimarySelected = selectedIds[0] === el.id;

    return (
      <div
        key={el.id}
        id={`canvas-el-${el.id}`}
        onMouseDown={(e) => handleElementMouseDown(el, e)}
        className={`absolute select-none transition-shadow ${
          !isPreviewMode ? 'cursor-move' : ''
        } ${el.visible === false ? 'opacity-40 grayscale' : ''}`}
        style={{
          transform: `translate(${el.x}px, ${el.y}px) rotate(${el.rotation || 0}deg)`,
          width: el.width,
          height: el.height,
          zIndex: el.zIndex || 1,
          opacity: el.opacity ?? 1,
          transformOrigin: 'center center',
        }}
      >
        {/* Child Element Content */}
        {renderElementContent(el, isSelected, {
          parentWidth,
          parentHeight,
          isEditor: !isPreviewMode,
          renderChild: (child, pW, pH) => renderElement(child, pW, pH, depth + 1),
        })}

        {/* Selection Outline & Handles */}
        {!isPreviewMode && isSelected && (
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
      {/* Background Dots Backdrop */}
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

      {/* Floating Safe Action Toast */}
      {previewFeedback && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-slate-900/95 backdrop-blur-md border border-amber-500/80 text-amber-300 font-bold text-xs rounded-full shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-150">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
          <span>{previewFeedback}</span>
        </div>
      )}

      {/* Viewport Toolbar */}
      <div className="absolute bottom-4 left-4 z-40 bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-xl px-2.5 py-1.5 flex items-center gap-2 shadow-2xl text-slate-300">
        <button
          onClick={() => setZoom((z) => Math.max(0.2, Number((z - 0.1).toFixed(2))))}
          className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white"
          title="Zoom Out (Ctrl -)"
        >
          <ZoomOut className="w-4 h-4" />
        </button>

        <select
          value={Math.round(zoom * 100)}
          onChange={(e) => setZoom(Number(e.target.value) / 100)}
          className="bg-slate-950 border border-slate-700 text-amber-400 text-xs font-mono font-bold rounded px-1.5 py-1 outline-none cursor-pointer"
        >
          {ZOOM_PRESETS.map((preset) => (
            <option key={preset} value={Math.round(preset * 100)}>
              {Math.round(preset * 100)}%
            </option>
          ))}
        </select>

        <button
          onClick={() => setZoom((z) => Math.min(2.0, Number((z + 0.1).toFixed(2))))}
          className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white"
          title="Zoom In (Ctrl +)"
        >
          <ZoomIn className="w-4 h-4" />
        </button>

        <div className="w-px h-4 bg-slate-700 mx-1" />

        <button
          onClick={handleFitToScreen}
          className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white flex items-center gap-1 text-xs"
          title="Fit Canvas to Viewport"
        >
          <Maximize2 className="w-3.5 h-3.5" />
          <span>Fit</span>
        </button>

        <div className="w-px h-4 bg-slate-700 mx-1" />

        {/* Grid Toggle */}
        <button
          onClick={() => setShowGrid((g) => !g)}
          className={`p-1.5 rounded-lg transition-colors ${
            showGrid
              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
              : 'hover:bg-slate-800 text-slate-400'
          }`}
          title="Toggle Grid Overlay"
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

        {/* Snap Toggle */}
        <button
          onClick={() => setEnableSnapping((s) => !s)}
          className={`p-1.5 rounded-lg transition-colors ${
            enableSnapping
              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
              : 'hover:bg-slate-800 text-slate-400'
          }`}
          title="Toggle Magnetic Smart Snapping"
        >
          <Magnet className="w-4 h-4" />
        </button>

        {/* Spacing Measurements Toggle */}
        <button
          onClick={() => setShowMeasurements((m) => !m)}
          className={`p-1.5 rounded-lg transition-colors ${
            showMeasurements
              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
              : 'hover:bg-slate-800 text-slate-400'
          }`}
          title="Toggle Real-Time Gap Measurements"
        >
          <Ruler className="w-4 h-4" />
        </button>
      </div>

      {/* Logical Canvas Container */}
      <div
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: 'center center',
          transition: isPanning ? 'none' : 'transform 0.05s ease-out',
        }}
      >
        <div
          ref={canvasRef}
          className="relative shadow-2xl overflow-hidden border border-slate-700/80"
          style={{
            width: canvasWidth,
            height: canvasHeight,
          }}
        >
          {/* Canvas Background Layer */}
          {renderBackground ? (
            renderBackground(canvasWidth, canvasHeight)
          ) : (
            <div className="absolute inset-0 bg-slate-900" />
          )}

          {/* Grid Overlay */}
          {!isPreviewMode && showGrid && (
            <div
              className="absolute inset-0 pointer-events-none opacity-15"
              style={{
                backgroundImage: `linear-gradient(to right, rgba(255,255,255,0.2) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.2) 1px, transparent 1px)`,
                backgroundSize: `${gridSize}px ${gridSize}px`,
              }}
            />
          )}

          {/* Render Elements Recursively */}
          {elements.map((el) => renderElement(el, canvasWidth, canvasHeight))}

          {/* Snapping Guide Lines */}
          {!isPreviewMode &&
            activeGuides.map((guide) => (
              <div
                key={guide.id}
                className="absolute pointer-events-none z-50 bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.8)]"
                style={{
                  left: guide.type === 'vertical' ? guide.position : guide.start,
                  top: guide.type === 'horizontal' ? guide.position : guide.start,
                  width:
                    guide.type === 'vertical'
                      ? 1
                      : Math.max(1, guide.end - guide.start),
                  height:
                    guide.type === 'horizontal'
                      ? 1
                      : Math.max(1, guide.end - guide.start),
                }}
              />
            ))}

          {/* Live Spacing Measurements */}
          {!isPreviewMode &&
            showMeasurements &&
            activeMeasurements.map((m) => (
              <div
                key={m.id}
                className="absolute pointer-events-none z-50 flex items-center justify-center font-mono text-[10px] font-bold text-amber-300"
                style={{
                  left: Math.min(m.x1, m.x2),
                  top: Math.min(m.y1, m.y2),
                  width: Math.max(16, Math.abs(m.x2 - m.x1)),
                  height: Math.max(16, Math.abs(m.y2 - m.y1)),
                }}
              >
                <div className="absolute inset-0 border border-dashed border-amber-400/80" />
                <span className="relative z-10 px-1 py-0.5 rounded bg-slate-950/90 border border-amber-500/60 shadow">
                  {m.label}
                </span>
              </div>
            ))}

          {/* Marquee Selection Box */}
          {marqueeBox && (
            <div
              className="absolute pointer-events-none z-50 border-2 border-amber-400 bg-amber-400/15"
              style={{
                left: Math.min(marqueeBox.startX, marqueeBox.currentX),
                top: Math.min(marqueeBox.startY, marqueeBox.currentY),
                width: Math.abs(marqueeBox.currentX - marqueeBox.startX),
                height: Math.abs(marqueeBox.currentY - marqueeBox.startY),
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
};
