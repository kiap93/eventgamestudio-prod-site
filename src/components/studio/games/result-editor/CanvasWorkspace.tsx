import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ResultScreenElement,
  ResultCardElement,
  ResultGroupElement,
  MemoryMatchResultScreenConfig,
} from '../../../../games/memory-match/types';
import { ResultElementContent } from '../../../../games/memory-match/ResultElementContent';
import { resolveScreenBackground } from '../../../../themes/screenBackground';
import { GameTheme } from '../../../../themes/types';
import {
  EditorInteractionState,
  InteractionMode,
  ResizeHandle,
  ZOOM_PRESETS,
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
  resultConfig: MemoryMatchResultScreenConfig;
  theme: Partial<GameTheme>;
  elements: ResultScreenElement[];
  selectedIds: string[];
  onSelectElement: (id: string, e?: React.MouseEvent) => void;
  onClearSelection: () => void;
  onUpdateElements: (updates: Record<string, Partial<ResultScreenElement>>) => void;
  onUpdateSingleElement: (id: string, updater: (prev: ResultScreenElement) => ResultScreenElement) => void;
  findElementAndParent: (
    id: string,
    list: ResultScreenElement[]
  ) => { element: ResultScreenElement; parent: ResultCardElement | ResultGroupElement | null } | null;
}

export const CanvasWorkspace: React.FC<CanvasWorkspaceProps> = ({
  resultConfig,
  theme,
  elements,
  selectedIds,
  onSelectElement,
  onClearSelection,
  onUpdateElements,
  onUpdateSingleElement,
  findElementAndParent,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  // Logical canvas dimensions (always 1000 x 1000)
  const canvasWidth = resultConfig.canvas?.width || 1000;
  const canvasHeight = resultConfig.canvas?.height || 1000;

  // Zoom & Pan state
  const [zoom, setZoom] = useState<number>(0.8);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isSpaceHeld, setIsSpaceHeld] = useState<boolean>(false);
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [mouseLogicalCoords, setMouseLogicalCoords] = useState<{ x: number; y: number } | null>(null);
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [gridSize, setGridSize] = useState<GridSizePreset>(50);
  const [snapEnabled, setSnapEnabled] = useState<boolean>(true);
  const [showMeasurements, setShowMeasurements] = useState<boolean>(true);
  const [isAltHeld, setIsAltHeld] = useState<boolean>(false);

  // Active alignment guides state (transient editor-only overlay)
  const [activeGuides, setActiveGuides] = useState<{
    containerId: string | 'root';
    guides: AlignmentGuide[];
  } | null>(null);

  // Pan interaction tracking
  const panStartRef = useRef<{
    startX: number;
    startY: number;
    initialPanX: number;
    initialPanY: number;
  } | null>(null);

  // Direct manipulation interaction state (drag, resize, rotate)
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('idle');
  const interactionRef = useRef<EditorInteractionState | null>(null);

  // Resolved screen background
  const bg = resolveScreenBackground(resultConfig, theme);

  // Selected element derivation
  const selectedResult = selectedIds.length > 0 ? findElementAndParent(selectedIds[selectedIds.length - 1], elements) : null;
  const selectedElement = selectedResult?.element || null;
  const selectedParentElement = selectedResult?.parent || null;

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

  // Fit Canvas to Screen
  const handleFitToScreen = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const availableW = Math.max(300, rect.width - 60);
    const availableH = Math.max(300, rect.height - 60);

    const fitScale = Math.min(availableW / canvasWidth, availableH / canvasHeight);
    const clampedScale = Math.max(0.3, Math.min(1.8, Math.round(fitScale * 100) / 100));

    setZoom(clampedScale);
    setPanOffset({ x: 0, y: 0 });
  }, [canvasWidth, canvasHeight]);

  // Initial fit on mount
  useEffect(() => {
    // slight delay to let layout compute
    const timer = setTimeout(() => {
      handleFitToScreen();
    }, 50);
    return () => clearTimeout(timer);
  }, [handleFitToScreen]);

  // Spacebar and Alt key listeners for Panning & Measurement mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Alt') {
        setIsAltHeld(true);
      }
      if (e.code === 'Space' && !e.repeat) {
        const activeTag = document.activeElement?.tagName?.toLowerCase();
        const isEditingText =
          activeTag === 'input' ||
          activeTag === 'textarea' ||
          activeTag === 'select' ||
          (document.activeElement as HTMLElement)?.isContentEditable;
        if (!isEditingText) {
          e.preventDefault();
          setIsSpaceHeld(true);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Alt') {
        setIsAltHeld(false);
      }
      if (e.code === 'Space') {
        setIsSpaceHeld(false);
        if (isPanning) {
          setIsPanning(false);
          panStartRef.current = null;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isPanning]);

  // Mouse wheel zoom centered on cursor
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();

    if (!containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();

    // Wheel delta
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    const newZoom = Math.max(0.25, Math.min(3.0, Math.round(zoom * zoomFactor * 100) / 100));

    if (newZoom === zoom) return;

    // Center zoom on mouse point
    const mouseX = e.clientX - containerRect.left;
    const mouseY = e.clientY - containerRect.top;
    const centerX = containerRect.width / 2;
    const centerY = containerRect.height / 2;

    const deltaZoomRatio = newZoom / zoom;
    const newPanX = mouseX - centerX - (mouseX - centerX - panOffset.x) * deltaZoomRatio;
    const newPanY = mouseY - centerY - (mouseY - centerY - panOffset.y) * deltaZoomRatio;

    setZoom(newZoom);
    setPanOffset({ x: newPanX, y: newPanY });
  };

  // Canvas viewport background mousedown (for pan or deselect)
  const handleViewportMouseDown = (e: React.MouseEvent) => {
    // If middle click or space is held or clicking workspace background
    if (e.button === 1 || isSpaceHeld || e.target === containerRef.current) {
      e.preventDefault();
      setIsPanning(true);
      panStartRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        initialPanX: panOffset.x,
        initialPanY: panOffset.y,
      };
      if (e.target === containerRef.current && !isSpaceHeld && e.button === 0) {
        onClearSelection();
      }
    }
  };

  // Track cursor logical coordinates
  const handleMouseMoveOnCanvas = (e: React.MouseEvent) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const localX = (e.clientX - rect.left) * (canvasWidth / rect.width);
    const localY = (e.clientY - rect.top) * (canvasHeight / rect.height);

    if (localX >= 0 && localX <= canvasWidth && localY >= 0 && localY <= canvasHeight) {
      setMouseLogicalCoords({ x: Math.round(localX), y: Math.round(localY) });
    } else {
      setMouseLogicalCoords(null);
    }
  };

  // Element Mouse Down (drag start)
  const handleElementMouseDown = (
    e: React.MouseEvent,
    el: ResultScreenElement,
    parentWidth: number,
    parentHeight: number
  ) => {
    // If space is held, pass through to panning
    if (isSpaceHeld || e.button === 1) return;

    e.stopPropagation();

    // If element is locked, select it but do not initiate drag
    if (el.locked) {
      onSelectElement(el.id, e);
      return;
    }

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

    // Capture initial positions for multi-drag
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
      initialPositions,
    };
  };

  // Resize Mouse Down
  const handleResizeMouseDown = (
    e: React.MouseEvent,
    el: ResultScreenElement,
    parentWidth: number,
    parentHeight: number,
    handle: ResizeHandle
  ) => {
    if (isSpaceHeld || el.locked) return;
    e.stopPropagation();

    onSelectElement(el.id);
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

  // Rotate Mouse Down
  const handleRotateMouseDown = (
    e: React.MouseEvent,
    el: ResultScreenElement,
    parentWidth: number,
    parentHeight: number
  ) => {
    if (isSpaceHeld || el.locked) return;
    e.stopPropagation();

    onSelectElement(el.id);

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

  // Global mousemove & mouseup handler for drag / resize / rotate / pan
  useEffect(() => {
    const handleWindowMouseMove = (e: MouseEvent) => {
      // 1. Handle Panning
      if (isPanning && panStartRef.current) {
        const deltaX = e.clientX - panStartRef.current.startX;
        const deltaY = e.clientY - panStartRef.current.startY;
        setPanOffset({
          x: panStartRef.current.initialPanX + deltaX,
          y: panStartRef.current.initialPanY + deltaY,
        });
        return;
      }

      // 2. Handle Element Direct Manipulation
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

        // Determine parent container and siblings for snapping
        const targetInfo = findElementAndParent(elementId, elements);
        const parentElement = targetInfo?.parent;
        const isRoot = !parentElement;
        const containerId = parentElement ? parentElement.id : 'root';
        const siblings = parentElement ? parentElement.children || [] : elements;

        // Raw proposed translation
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

        onUpdateElements(updates);
      } else if (mode === 'resize' && handle) {
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

        onUpdateSingleElement(elementId, (prev) => ({
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

        const snapAngles = [0, 45, 90, 135, 180, 225, 270, 315, 360];
        for (const snap of snapAngles) {
          if (Math.abs(nextRotation - snap) <= 3) {
            nextRotation = snap === 360 ? 0 : snap;
            break;
          }
        }

        onUpdateSingleElement(elementId, (prev) => ({
          ...prev,
          rotation: Math.round(nextRotation),
        } as ResultScreenElement));
      }
    };

    const handleWindowMouseUp = () => {
      setActiveGuides(null);
      if (isPanning) {
        setIsPanning(false);
        panStartRef.current = null;
      }
      if (interactionMode !== 'idle') {
        setInteractionMode('idle');
        interactionRef.current = null;
      }
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [isPanning, interactionMode, canvasWidth, canvasHeight, onUpdateElements, onUpdateSingleElement]);

  // Render Alignment Guides Overlay (Editor-only visual alignment guides)
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
            {/* Glowing guide line */}
            <div className="w-full h-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.9)] opacity-95" />
            {/* Target alignment label badge */}
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
            {/* Glowing guide line */}
            <div className="w-full h-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.9)] opacity-95" />
            {/* Target alignment label badge */}
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

  // Render an element on canvas
  const renderCanvasElement = (
    el: ResultScreenElement,
    parentWidth: number,
    parentHeight: number
  ): React.ReactNode => {
    const isSelected = selectedIds.includes(el.id);
    const isSingleSelected = selectedIds.length === 1 && selectedIds[0] === el.id;
    const isVisible = el.visible !== false;
    const isLocked = el.locked === true;
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
      opacity: isVisible ? el.opacity ?? 1 : 0.2,
      zIndex: el.zIndex ?? 1,
      transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
      boxSizing: 'border-box',
      cursor: isSpaceHeld ? 'grab' : isLocked ? 'default' : 'move',
      pointerEvents: isVisible ? 'auto' : 'none',
      outline: isParentOfSelected ? '2px dashed rgba(59, 130, 246, 0.7)' : undefined,
      outlineOffset: isParentOfSelected ? '2px' : undefined,
    };

    return (
      <div
        key={el.id}
        id={`canvas-el-${el.id}`}
        style={commonStyle}
        onMouseDown={(e) => handleElementMouseDown(e, el, parentWidth, parentHeight)}
        className="group relative select-none"
      >
        <ResultElementContent
          element={el}
          parentWidth={parentWidth}
          parentHeight={parentHeight}
          isSimulation={true}
          renderChild={(child, pW, pH) => renderCanvasElement(child, pW, pH)}
        />

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

        {/* Selection Bounding Box, Handles, and Rotation */}
        {isSelected && (
          <div className="absolute -inset-0.5 border-2 border-amber-400 pointer-events-none z-50 rounded-sm">
            {isSingleSelected ? (
              <>
                {/* Locked indicator badge */}
                {isLocked ? (
                  <div className="absolute -top-6 left-0 bg-slate-950/95 border border-amber-500 text-amber-300 font-mono text-[9px] px-1.5 py-0.5 rounded shadow flex items-center gap-1">
                    <Lock className="w-2.5 h-2.5 text-amber-400" />
                    <span>LOCKED</span>
                  </div>
                ) : (
                  <>
                    {/* Rotation Knob */}
                    <div
                      className="absolute -top-7 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-auto"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div
                        onMouseDown={(e) => handleRotateMouseDown(e, el, parentWidth, parentHeight)}
                        className="w-5 h-5 rounded-full bg-amber-400 hover:bg-amber-300 border-2 border-slate-950 flex items-center justify-center cursor-grab active:cursor-grabbing shadow-md hover:scale-125 transition-transform"
                        title="Drag to Rotate"
                      >
                        <RotateCw className="w-2.5 h-2.5 text-slate-950 stroke-[3]" />
                      </div>
                      <div className="w-0.5 h-2 bg-amber-400" />
                    </div>

                    {/* Corner Resize Handles */}
                    <div
                      onMouseDown={(e) => handleResizeMouseDown(e, el, parentWidth, parentHeight, 'tl')}
                      className="absolute -top-1.5 -left-1.5 w-3.5 h-3.5 bg-amber-400 border border-slate-950 rounded-sm cursor-nwse-resize pointer-events-auto hover:scale-125 transition-transform shadow"
                      title="Resize Top-Left"
                    />
                    <div
                      onMouseDown={(e) => handleResizeMouseDown(e, el, parentWidth, parentHeight, 'tr')}
                      className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-amber-400 border border-slate-950 rounded-sm cursor-nesw-resize pointer-events-auto hover:scale-125 transition-transform shadow"
                      title="Resize Top-Right"
                    />
                    <div
                      onMouseDown={(e) => handleResizeMouseDown(e, el, parentWidth, parentHeight, 'bl')}
                      className="absolute -bottom-1.5 -left-1.5 w-3.5 h-3.5 bg-amber-400 border border-slate-950 rounded-sm cursor-nesw-resize pointer-events-auto hover:scale-125 transition-transform shadow"
                      title="Resize Bottom-Left"
                    />
                    <div
                      onMouseDown={(e) => handleResizeMouseDown(e, el, parentWidth, parentHeight, 'br')}
                      className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 bg-amber-400 border border-slate-950 rounded-sm cursor-nwse-resize pointer-events-auto hover:scale-125 transition-transform shadow"
                      title="Resize Bottom-Right"
                    />

                    {/* Edge Resize Handles */}
                    <div
                      onMouseDown={(e) => handleResizeMouseDown(e, el, parentWidth, parentHeight, 't')}
                      className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3.5 h-3.5 bg-amber-400 border border-slate-950 rounded-sm cursor-ns-resize pointer-events-auto hover:scale-125 transition-transform shadow"
                      title="Resize Top Edge"
                    />
                    <div
                      onMouseDown={(e) => handleResizeMouseDown(e, el, parentWidth, parentHeight, 'b')}
                      className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3.5 h-3.5 bg-amber-400 border border-slate-950 rounded-sm cursor-ns-resize pointer-events-auto hover:scale-125 transition-transform shadow"
                      title="Resize Bottom Edge"
                    />
                    <div
                      onMouseDown={(e) => handleResizeMouseDown(e, el, parentWidth, parentHeight, 'l')}
                      className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-3.5 h-3.5 bg-amber-400 border border-slate-950 rounded-sm cursor-ew-resize pointer-events-auto hover:scale-125 transition-transform shadow"
                      title="Resize Left Edge"
                    />
                    <div
                      onMouseDown={(e) => handleResizeMouseDown(e, el, parentWidth, parentHeight, 'r')}
                      className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-3.5 h-3.5 bg-amber-400 border border-slate-950 rounded-sm cursor-ew-resize pointer-events-auto hover:scale-125 transition-transform shadow"
                      title="Resize Right Edge"
                    />
                  </>
                )}

                {/* HUD Coordinates Badge */}
                <div className="absolute -top-7 right-0 bg-slate-950/95 border border-amber-500/70 text-amber-300 font-mono text-[9px] px-2 py-0.5 rounded shadow-lg flex items-center gap-1.5 whitespace-nowrap pointer-events-none z-50">
                  <span className="font-bold uppercase text-amber-400">{el.type}</span>
                  <span>•</span>
                  <span>({Math.round(el.x)}, {Math.round(el.y)})</span>
                  <span>•</span>
                  <span>{Math.round(el.width)}×{Math.round(el.height)}</span>
                  {typeof el.rotation === 'number' && el.rotation !== 0 && (
                    <>
                      <span>•</span>
                      <span>{Math.round(el.rotation)}°</span>
                    </>
                  )}
                </div>
              </>
            ) : (
              /* Multi-Selection Badge */
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

  return (
    <div
      ref={containerRef}
      onMouseDown={handleViewportMouseDown}
      onWheel={handleWheel}
      className={`flex-1 relative bg-slate-925 overflow-hidden flex items-center justify-center select-none ${
        isSpaceHeld || isPanning ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'
      }`}
      style={{
        backgroundImage: showGrid
          ? 'radial-gradient(circle, rgba(255, 255, 255, 0.07) 1px, transparent 1px)'
          : undefined,
        backgroundSize: '24px 24px',
      }}
    >
      {/* Scaled & Panned Canvas Viewport */}
      <div
        style={{
          transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
          transformOrigin: 'center center',
          transition: isPanning || interactionMode !== 'idle' ? 'none' : 'transform 0.08s ease-out',
        }}
        className="shrink-0 flex items-center justify-center p-8 pointer-events-auto"
      >
        <div
          ref={canvasRef}
          id="result-screen-pro-canvas"
          onMouseMove={handleMouseMoveOnCanvas}
          onMouseLeave={() => setMouseLogicalCoords(null)}
          className="relative w-[1000px] h-[1000px] rounded-3xl border-2 border-slate-700/80 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] overflow-hidden select-none"
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

          {/* Render All Canvas Elements */}
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
      </div>

      {/* Floating Bottom Status & Zoom Toolbar */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-slate-900/95 border border-slate-800 backdrop-blur-md rounded-2xl px-3 py-2 shadow-2xl flex items-center gap-3 z-40 text-xs text-slate-200">
        {/* Zoom Out */}
        <button
          type="button"
          onClick={() => setZoom((prev) => Math.max(0.25, Math.round((prev - 0.1) * 100) / 100))}
          className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          title="Zoom Out (-)"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>

        {/* Zoom Preset Selector */}
        <div className="flex items-center gap-1 font-mono font-bold text-amber-400 text-xs">
          <select
            value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            className="bg-slate-950 border border-slate-700/80 rounded-lg px-2 py-0.5 text-xs text-amber-300 font-mono focus:outline-none cursor-pointer"
          >
            {ZOOM_PRESETS.map((p) => (
              <option key={p} value={p}>
                {Math.round(p * 100)}%
              </option>
            ))}
            {!ZOOM_PRESETS.includes(zoom as any) && (
              <option value={zoom}>
                {Math.round(zoom * 100)}%
              </option>
            )}
          </select>
        </div>

        {/* Zoom In */}
        <button
          type="button"
          onClick={() => setZoom((prev) => Math.min(3.0, Math.round((prev + 0.1) * 100) / 100))}
          className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          title="Zoom In (+)"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>

        <div className="w-px h-4 bg-slate-800" />

        {/* Fit to Screen Button */}
        <button
          type="button"
          onClick={handleFitToScreen}
          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded-lg text-[11px] font-semibold text-slate-200 flex items-center gap-1 transition-colors"
          title="Fit Canvas to Viewport"
        >
          <Maximize2 className="w-3 h-3 text-amber-400" />
          <span>Fit</span>
        </button>

        {/* Reset Zoom to 100% */}
        <button
          type="button"
          onClick={() => {
            setZoom(1.0);
            setPanOffset({ x: 0, y: 0 });
          }}
          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded-lg text-[11px] font-semibold text-slate-200 flex items-center gap-1 transition-colors"
          title="Reset Zoom to 100%"
        >
          <RotateCcw className="w-3 h-3 text-amber-400" />
          <span>100%</span>
        </button>

        <div className="w-px h-4 bg-slate-800" />

        {/* Grid Controls (Toggle + Size selector) */}
        <div className="flex items-center gap-1 bg-slate-950/80 p-0.5 rounded-xl border border-slate-800">
          <button
            type="button"
            onClick={() => setShowGrid(!showGrid)}
            className={`p-1.5 rounded-lg transition-colors flex items-center gap-1 text-[11px] font-semibold ${
              showGrid ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'hover:bg-slate-800 text-slate-400 border border-transparent'
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
              className="bg-slate-900 border border-slate-700/80 text-amber-300 text-[10px] font-mono rounded px-1 py-0.5 focus:outline-none cursor-pointer"
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
          className={`p-1.5 rounded-lg transition-colors flex items-center gap-1 text-[11px] font-semibold ${
            showMeasurements
              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
              : 'hover:bg-slate-800 text-slate-400 border border-transparent'
          }`}
          title="Toggle Spacing & Measurement Indicators (or hold Alt)"
        >
          <Ruler className="w-3.5 h-3.5" />
          <span>Measure</span>
        </button>

        {/* Smart Snapping & Guides Toggle */}
        <button
          type="button"
          onClick={() => setSnapEnabled(!snapEnabled)}
          className={`p-1.5 rounded-lg transition-colors flex items-center gap-1 text-[11px] font-semibold ${
            snapEnabled
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              : 'hover:bg-slate-800 text-slate-400 border border-transparent'
          }`}
          title="Toggle Smart Snapping & Alignment Guides (Hold Alt to bypass)"
        >
          <Magnet className="w-3.5 h-3.5" />
          <span>Snap</span>
        </button>

        {/* Status details: Selection info & Mouse Coordinates */}
        {(selectedElement || mouseLogicalCoords) && (
          <div className="hidden sm:flex items-center gap-2 font-mono text-[10px] text-slate-400 border-l border-slate-800 pl-2">
            {selectedElement && (
              <div className="flex items-center gap-1 text-slate-300">
                <span className="text-amber-400 font-bold uppercase">{selectedElement.type}</span>
                <span>({Math.round(selectedElement.x)}, {Math.round(selectedElement.y)})</span>
                <span>•</span>
                <span>{Math.round(selectedElement.width)}×{Math.round(selectedElement.height)}</span>
              </div>
            )}
            {mouseLogicalCoords && (
              <div className="text-slate-400 border-l border-slate-800 pl-2">
                Cursor: <span className="text-amber-300 font-bold">{mouseLogicalCoords.x}</span>, <span className="text-amber-300 font-bold">{mouseLogicalCoords.y}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Top Floating Helper Tooltip */}
      <div className="absolute top-4 left-4 pointer-events-none hidden md:flex items-center gap-2 bg-slate-900/80 border border-slate-800 px-3 py-1.5 rounded-xl text-[11px] text-slate-400 font-mono shadow-md backdrop-blur-sm">
        <span>Space + Drag to pan</span>
        <span>•</span>
        <span>Wheel to zoom</span>
        <span>•</span>
        <span>Shift+Click multi-select</span>
        <span>•</span>
        <span>Alt to measure / bypass snap</span>
      </div>
    </div>
  );
};
