import React, { useRef, useState, useLayoutEffect } from 'react';
import {
  StartScreenConfig,
  StartScreenElement,
  StartScreenGameMeta,
} from './startScreenTypes';
import { resolveScreenBackground } from '../../themes/screenBackground';
import { GameTheme, getThemeGameType } from '../../themes/types';
import { StartElementContent } from './StartElementContent';
import {
  getStartScreenConfig,
  normalizeStartScreenConfigForStage,
  needsStartScreenElementNormalization,
  resolveGameMetaForStartScreen,
} from './startScreenResolver';
import { StartScreenErrorBoundary } from './StartScreenErrorBoundary';

export const LOGICAL_CANVAS_WIDTH = 1024;
export const LOGICAL_CANVAS_HEIGHT = 576;

export interface StartScreenRendererProps {
  startConfig?: StartScreenConfig | null;
  config?: StartScreenConfig | null;
  theme?: Partial<GameTheme> | null;
  gameType?: string;
  targetDimensions?: {
    width: number;
    height: number;
  };
  gameMeta?: StartScreenGameMeta;
  onStartGame: () => void;
  onShowLeaderboard?: () => void;
  onShowGuide?: () => void;
  onOpenSettings?: () => void;
  className?: string;
  isSimulation?: boolean;
  isEventPreview?: boolean;
  isEventTest?: boolean;
  suppressBackground?: boolean;
}

const StartScreenContent: React.FC<StartScreenRendererProps> = ({
  startConfig,
  config,
  theme,
  gameType,
  targetDimensions,
  gameMeta,
  onStartGame,
  onShowLeaderboard,
  onShowGuide,
  onOpenSettings,
  className = '',
  isSimulation = false,
  suppressBackground = false,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerDimensions, setContainerDimensions] = useState<{
    width: number;
    height: number;
  }>({
    width: 0,
    height: 0,
  });

  const logicalW = targetDimensions?.width || LOGICAL_CANVAS_WIDTH;
  const logicalH = targetDimensions?.height || LOGICAL_CANVAS_HEIGHT;

  // Dynamically observe container dimensions with ResizeObserver
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      let w = el.clientWidth || rect.width;
      let h = el.clientHeight || rect.height;

      // Fall back to parent container if the absolute inner container has 0 dimensions
      if ((w <= 0 || h <= 0) && el.parentElement) {
        const parentRect = el.parentElement.getBoundingClientRect();
        w = el.parentElement.clientWidth || parentRect.width;
        h = el.parentElement.clientHeight || parentRect.height;
      }

      // If width is available but height is pending (common with CSS aspect-ratio), calculate from 16:9 ratio
      if (w > 0 && h <= 0) {
        h = (w * logicalH) / logicalW;
      } else if (h > 0 && w <= 0) {
        w = (h * logicalW) / logicalH;
      }

      if (w > 0 && h > 0) {
        setContainerDimensions((prev) => {
          if (Math.abs(prev.width - w) < 0.5 && Math.abs(prev.height - h) < 0.5) {
            return prev;
          }
          return { width: w, height: h };
        });
      }
    };

    measure();

    // Secondary delayed checks to catch layout settling in tab switches and flex containers
    const rafId = requestAnimationFrame(measure);
    const timer1 = setTimeout(measure, 50);
    const timer2 = setTimeout(measure, 150);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => {
        measure();
      });
      ro.observe(el);
      if (el.parentElement) {
        ro.observe(el.parentElement);
      }
    }

    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timer1);
      clearTimeout(timer2);
      ro?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [logicalW, logicalH]);

  const targetGameType = gameType || (theme ? getThemeGameType(theme) : 'catch-brand');
  const effectiveMeta = resolveGameMetaForStartScreen(theme, targetGameType, gameMeta);

  // Authoritative config resolution: always 1024x576 canonical canvas
  const resolvedConfig = getStartScreenConfig(
    theme,
    targetGameType,
    effectiveMeta,
    { width: logicalW, height: logicalH }
  );

  // Merge any caller-provided startConfig (or legacy config prop) if present
  const inputConfig = startConfig || config;
  let mergedConfig: StartScreenConfig = {
    ...resolvedConfig,
    ...(inputConfig || {}),
    canvas: inputConfig?.canvas || resolvedConfig.canvas,
    background: inputConfig?.background || resolvedConfig.background,
    elements: (inputConfig?.elements && inputConfig.elements.length > 0)
      ? inputConfig.elements
      : resolvedConfig.elements,
  };

  // If configuration is legacy square-1000x1000, normalize once to the 1024x576 logical canvas
  if (needsStartScreenElementNormalization(mergedConfig, logicalW, logicalH)) {
    mergedConfig = normalizeStartScreenConfigForStage(
      mergedConfig,
      logicalW,
      logicalH
    );
  }

  const finalConfig = mergedConfig;
  const bg = resolveScreenBackground(finalConfig as any, theme);
  const elements: StartScreenElement[] = Array.isArray(finalConfig.elements)
    ? finalConfig.elements
    : [];

  // Determine physical container dimensions from state or live DOM
  let containerW = containerDimensions.width;
  let containerH = containerDimensions.height;

  if (containerW <= 0 || containerH <= 0) {
    const el = containerRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      containerW = el.clientWidth || rect.width;
      containerH = el.clientHeight || rect.height;
      if ((containerW <= 0 || containerH <= 0) && el.parentElement) {
        const pRect = el.parentElement.getBoundingClientRect();
        containerW = el.parentElement.clientWidth || pRect.width;
        containerH = el.parentElement.clientHeight || pRect.height;
      }
      if (containerW > 0 && containerH <= 0) {
        containerH = (containerW * logicalH) / logicalW;
      } else if (containerH > 0 && containerW <= 0) {
        containerW = (containerH * logicalW) / logicalH;
      }
    }
  }

  const effectiveContainerW = containerW > 0 ? containerW : logicalW;
  const effectiveContainerH = containerH > 0 ? containerH : logicalH;

  // Strict uniform scaling formula:
  // scale = min(containerWidth / 1024, containerHeight / 576)
  const scale = Math.min(
    effectiveContainerW / logicalW,
    effectiveContainerH / logicalH
  );
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;

  // Recursive element renderer respecting ROOT (1024x576) vs CARD/GROUP coordinates
  const renderElement = (
    el: StartScreenElement,
    parentW: number,
    parentH: number,
    isRoot: boolean = false
  ): React.ReactNode => {
    if (!el || el.visible === false) return null;

    const safeParentW = Number.isFinite(parentW) && parentW > 0 ? parentW : LOGICAL_CANVAS_WIDTH;
    const safeParentH = Number.isFinite(parentH) && parentH > 0 ? parentH : LOGICAL_CANVAS_HEIGHT;

    const x = Number.isFinite(el.x) ? el.x : 0;
    const y = Number.isFinite(el.y) ? el.y : 0;
    const w = Number.isFinite(el.width) && el.width > 0 ? el.width : 100;
    const h = Number.isFinite(el.height) && el.height > 0 ? el.height : 40;

    const leftPercent = `${(x / safeParentW) * 100}%`;
    const topPercent = `${(y / safeParentH) * 100}%`;
    const widthPercent = `${(w / safeParentW) * 100}%`;
    const heightPercent = `${(h / safeParentH) * 100}%`;

    const commonStyle: React.CSSProperties = {
      position: 'absolute',
      left: leftPercent,
      top: topPercent,
      width: widthPercent,
      height: heightPercent,
      opacity: Number.isFinite(el.opacity) ? el.opacity : 1,
      zIndex: Number.isFinite(el.zIndex) ? el.zIndex : 1,
      transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
      boxSizing: 'border-box',
    };

    return (
      <div key={el.id} id={el.id} style={commonStyle}>
        <StartElementContent
          element={el}
          parentWidth={safeParentW}
          parentHeight={safeParentH}
          gameMeta={effectiveMeta}
          theme={theme}
          onStartGame={onStartGame}
          onShowLeaderboard={onShowLeaderboard}
          onShowGuide={onShowGuide}
          onOpenSettings={onOpenSettings}
          renderChild={(child, childParentW, childParentH) =>
            renderElement(child, childParentW, childParentH, false)
          }
          isSimulation={isSimulation}
        />
      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 w-full h-full flex items-center justify-center overflow-hidden select-none z-40 ${className}`}
      style={{
        ...(!suppressBackground ? bg.containerStyle : {}),
        zIndex: 40,
      }}
    >
      {/* Outer Background Overlay Layer for letterboxing */}
      {!suppressBackground && (
        <div className="absolute inset-0 pointer-events-none" style={bg.overlayStyle} />
      )}

      {/* Logical 1024x576 Canvas: exact coordinates, scaled down uniformly and centered */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: `${logicalW}px`,
          height: `${logicalH}px`,
          minWidth: `${logicalW}px`,
          minHeight: `${logicalH}px`,
          maxWidth: `${logicalW}px`,
          maxHeight: `${logicalH}px`,
          transform: `translate(-50%, -50%) scale(${safeScale})`,
          transformOrigin: 'center center',
          ...(!suppressBackground ? bg.containerStyle : {}),
        }}
        className="shrink-0 overflow-hidden select-none shadow-2xl rounded-2xl"
      >
        {/* Canvas Background Overlay */}
        {!suppressBackground && (
          <div
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={bg.overlayStyle}
          />
        )}

        {/* All Elements at exact 1024x576 logical coordinates */}
        {elements.map((el) =>
          renderElement(el, logicalW, logicalH, true)
        )}
      </div>
    </div>
  );
};

export const StartScreenRenderer: React.FC<StartScreenRendererProps> = (props) => {
  return (
    <StartScreenErrorBoundary
      gameTitle={props.gameMeta?.gameTitle || props.theme?.name}
      gameSubtitle={props.gameMeta?.gameSubtitle}
      onStartGame={props.onStartGame}
      onShowLeaderboard={props.onShowLeaderboard}
      onShowGuide={props.onShowGuide}
    >
      <StartScreenContent {...props} />
    </StartScreenErrorBoundary>
  );
};
