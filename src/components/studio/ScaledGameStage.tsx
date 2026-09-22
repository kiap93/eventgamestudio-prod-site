import React, { useRef, useState, useEffect, useMemo } from 'react';
import {
  REACTION_GAME_DESIGN_WIDTH,
  REACTION_GAME_DESIGN_HEIGHT,
} from '../../games/reaction-time/types';

/**
 * Calculates uniform scale factor fitting a logical design box inside available viewport.
 * Uses exact aspect-ratio preservation formula:
 * scale = Math.min(availableWidth / designWidth, availableHeight / designHeight)
 */
export function calculateGameScale(
  availableWidth: number,
  availableHeight: number,
  designWidth: number = REACTION_GAME_DESIGN_WIDTH,
  designHeight: number = REACTION_GAME_DESIGN_HEIGHT
): number {
  if (!availableWidth || !availableHeight || availableWidth <= 0 || availableHeight <= 0) {
    return 1;
  }
  const scaleX = availableWidth / designWidth;
  const scaleY = availableHeight / designHeight;
  const rawScale = Math.min(scaleX, scaleY);
  return Math.max(0.1, Math.min(4.0, rawScale));
}

export interface ScaledGameStageProps {
  children: React.ReactNode;
  /** Fixed logical design width in px, defaults to 1024 */
  designWidth?: number;
  /** Fixed logical design height in px, defaults to 576 */
  designHeight?: number;
  /** Authoritative scale factor computed by parent container */
  scale?: number;
  /** Available viewport width override */
  viewportWidth?: number;
  /** Available viewport height override */
  viewportHeight?: number;
  /** Additional CSS class for outer viewport wrapper */
  className?: string;
  /** Additional CSS class for inner scaled stage element */
  stageClassName?: string;
  /** Style overrides for outer container */
  style?: React.CSSProperties;
  /** Style overrides for inner scaled stage */
  stageStyle?: React.CSSProperties;
  /** Element ID for DOM targeting */
  id?: string;
  /** Show development-only diagnostic HUD */
  debug?: boolean;
}

/**
 * ScaledGameStage
 *
 * Provides a single authoritative 1024 × 576 logical game stage.
 * Scales uniformly and centers inside the available viewport without distorting
 * internal element proportions or triggering independent media query jumps.
 */
export const ScaledGameStage: React.FC<ScaledGameStageProps> = ({
  children,
  designWidth = REACTION_GAME_DESIGN_WIDTH,
  designHeight = REACTION_GAME_DESIGN_HEIGHT,
  scale: externalScale,
  viewportWidth: externalViewportWidth,
  viewportHeight: externalViewportHeight,
  className = '',
  stageClassName = '',
  style,
  stageStyle,
  id = 'scaled-game-stage-wrapper',
  debug = false,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Internal measurement fallback if external dimensions are not provided
  const [measuredDimensions, setMeasuredDimensions] = useState<{ width: number; height: number }>({
    width: externalViewportWidth ?? designWidth,
    height: externalViewportHeight ?? designHeight,
  });

  useEffect(() => {
    // If parent provides explicit viewport dimensions and scale, avoid redundant observer
    if (externalScale !== undefined && externalViewportWidth !== undefined && externalViewportHeight !== undefined) {
      return;
    }

    const el = containerRef.current;
    if (!el) return;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      const w = el.clientWidth || rect.width;
      const h = el.clientHeight || rect.height;
      if (w > 0 && h > 0) {
        setMeasuredDimensions((prev) => {
          if (Math.abs(prev.width - w) < 1 && Math.abs(prev.height - h) < 1) {
            return prev;
          }
          return { width: w, height: h };
        });
      }
    };

    measure();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => {
        measure();
      });
      observer.observe(el);
      return () => observer.disconnect();
    } else {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
  }, [externalScale, externalViewportWidth, externalViewportHeight]);

  const activeViewportWidth = externalViewportWidth ?? measuredDimensions.width;
  const activeViewportHeight = externalViewportHeight ?? measuredDimensions.height;

  // Compute authoritative scale factor
  const computedScale = useMemo(() => {
    if (externalScale !== undefined && !isNaN(externalScale) && externalScale > 0) {
      return externalScale;
    }
    return calculateGameScale(activeViewportWidth, activeViewportHeight, designWidth, designHeight);
  }, [externalScale, activeViewportWidth, activeViewportHeight, designWidth, designHeight]);

  const isDev = Boolean(import.meta.env.DEV);
  const showDiagnostic = debug && isDev;

  return (
    <div
      ref={containerRef}
      id={id}
      className={`scaled-game-stage-wrapper relative w-full h-full min-w-0 min-h-0 overflow-hidden flex items-center justify-center select-none ${className}`}
      style={{
        ...style,
        '--game-scale': computedScale,
        '--game-ui-scale': computedScale,
        '--game-design-width': `${designWidth}px`,
        '--game-design-height': `${designHeight}px`,
      } as React.CSSProperties}
    >
      {/* Centered, proportionally scaled 1024 x 576 logical design stage */}
      <div
        id={`${id}-stage`}
        className={`scaled-game-stage absolute left-1/2 top-1/2 shrink-0 select-none overflow-hidden ${stageClassName}`}
        style={{
          width: `${designWidth}px`,
          height: `${designHeight}px`,
          minWidth: `${designWidth}px`,
          minHeight: `${designHeight}px`,
          maxWidth: `${designWidth}px`,
          maxHeight: `${designHeight}px`,
          transform: `translate(-50%, -50%) scale(${computedScale})`,
          transformOrigin: 'center center',
          ...stageStyle,
        }}
      >
        {children}
      </div>

      {/* Development-only diagnostic HUD */}
      {showDiagnostic && (
        <div
          aria-hidden="true"
          className="scaled-game-stage-debug absolute bottom-2 right-2 z-50 pointer-events-none bg-slate-950/85 text-emerald-400 border border-emerald-500/30 rounded px-2 py-1 font-mono text-[10px] leading-tight shadow-md backdrop-blur-sm select-none"
        >
          <div>Viewport: {Math.round(activeViewportWidth)} × {Math.round(activeViewportHeight)}</div>
          <div>Design: {designWidth} × {designHeight}</div>
          <div>Scale: {computedScale.toFixed(5)}</div>
        </div>
      )}
    </div>
  );
};
