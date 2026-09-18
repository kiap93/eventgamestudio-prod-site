import React, { useRef, useState, useLayoutEffect, useEffect } from 'react';
import {
  ResultScreenElement,
  ResultCardElement,
  ResultGroupElement,
  MemoryMatchResultScreenConfig,
  generateDefaultResultScreenElements,
  generateDefaultCatchBrandResultScreenElements,
  generateDefaultReactionResultScreenElements,
} from './resultScreenTypes';
import { resolveScreenBackground } from '../../themes/screenBackground';
import { GameTheme, GameLayoutConfig, getThemeGameType } from '../../themes/types';
import { ResultElementContent } from './ResultElementContent';
import { EventLeaderboardEntry } from '../../types';

export const RESULT_LOGICAL_CANVAS_WIDTH = 1024;
export const RESULT_LOGICAL_CANVAS_HEIGHT = 576;
export const RESULT_CANVAS_WIDTH = 1024;
export const RESULT_CANVAS_HEIGHT = 576;
const LOGICAL_CANVAS_WIDTH = 1024;
const LOGICAL_CANVAS_HEIGHT = 576;

export type LayoutAlignmentPosition = 'left' | 'center' | 'right';
export type LayoutVerticalAlignment = 'top' | 'center' | 'bottom';

export interface ResultScreenAlignment {
  position: LayoutAlignmentPosition;
  verticalAlign: LayoutVerticalAlignment;
  justifyContent: 'flex-start' | 'center' | 'flex-end';
  alignItems: 'flex-start' | 'center' | 'flex-end';
  justifyClass: string;
  itemsClass: string;
  marginClass: string;
  coordX: number;
  coordY: number;
}

/**
 * Resolves Result Screen alignment based on theme/layout customization configuration.
 * Maps layout.position ('left' | 'center' | 'right') or board x/y coordinates to
 * CSS flexbox alignment rules (justify-content, align-items, margin: auto).
 */
export function resolveResultScreenLayout(
  layout?: Partial<GameLayoutConfig> | null
): ResultScreenAlignment {
  const rawPos = (
    layout?.position ||
    layout?.contentAlignment ||
    layout?.horizontalAlignment ||
    ''
  ).toLowerCase();

  let position: LayoutAlignmentPosition = 'center';
  if (rawPos === 'left' || rawPos === 'start' || rawPos === 'flex-start') {
    position = 'left';
  } else if (rawPos === 'right' || rawPos === 'end' || rawPos === 'flex-end') {
    position = 'right';
  } else if (rawPos === 'center' || rawPos === 'middle') {
    position = 'center';
  } else if (typeof layout?.memoryCardBoard?.x === 'number') {
    const x = layout.memoryCardBoard.x;
    if (x < 40) position = 'left';
    else if (x > 60) position = 'right';
    else position = 'center';
  }

  const rawVAlign = (
    layout?.verticalAlignment ||
    layout?.verticalAlign ||
    ''
  ).toLowerCase();

  let verticalAlign: LayoutVerticalAlignment = 'center';
  if (rawVAlign === 'top' || rawVAlign === 'start' || rawVAlign === 'flex-start') {
    verticalAlign = 'top';
  } else if (rawVAlign === 'bottom' || rawVAlign === 'end' || rawVAlign === 'flex-end') {
    verticalAlign = 'bottom';
  } else if (typeof layout?.memoryCardBoard?.y === 'number') {
    const y = layout.memoryCardBoard.y;
    if (y < 40) verticalAlign = 'top';
    else if (y > 60) verticalAlign = 'bottom';
    else verticalAlign = 'center';
  }

  const justifyContent =
    position === 'left' ? 'flex-start' : position === 'right' ? 'flex-end' : 'center';
  const alignItems =
    verticalAlign === 'top' ? 'flex-start' : verticalAlign === 'bottom' ? 'flex-end' : 'center';

  const justifyClass =
    position === 'left' ? 'justify-start' : position === 'right' ? 'justify-end' : 'justify-center';
  const itemsClass =
    verticalAlign === 'top' ? 'items-start' : verticalAlign === 'bottom' ? 'items-end' : 'items-center';
  const marginClass =
    position === 'left' ? 'mr-auto ml-0' : position === 'right' ? 'ml-auto mr-0' : 'mx-auto';

  const coordX = position === 'left' ? 30 : position === 'right' ? 70 : 50;
  const coordY = verticalAlign === 'top' ? 30 : verticalAlign === 'bottom' ? 70 : 50;

  return {
    position,
    verticalAlign,
    justifyContent,
    alignItems,
    justifyClass,
    itemsClass,
    marginClass,
    coordX,
    coordY,
  };
}

export interface ResultScreenStats {
  score: number;
  moves?: number;
  matchedPairsCount?: number;
  totalPairs?: number;
  accuracyPercent?: number;
  timeElapsedSeconds?: number;
  isVictory?: boolean;
  averageReactionTimeMs?: number;
  bestReactionTimeMs?: number;
  worstReactionTimeMs?: number;
  falseStartsCount?: number;
  roundsCount?: number;
  rounds?: Array<{ round: number; reactionTimeMs: number; falseStart?: boolean }>;
  rating?: string;
  gameType?: string;
}

export interface ResultScreenRendererProps {
  resultConfig?: MemoryMatchResultScreenConfig | null;
  stats: ResultScreenStats;
  theme?: Partial<GameTheme> | null;
  layout?: Partial<GameLayoutConfig> | null;
  onAction?: (action: 'playAgain' | 'exit' | string) => void;
  leaderboardSlot?: React.ReactNode;
  leaderboardData?: EventLeaderboardEntry[];
  loadingLeaderboard?: boolean;
  leaderboardError?: string | null;
  currentPlayerName?: string;
  currentEntryId?: string;
  scoreSubmitted?: boolean;
  submittedRank?: number | null;
  isSubmittingScore?: boolean;
  submissionError?: string | null;
  onSubmitScore?: (playerName: string) => Promise<{ success: boolean; rank?: number; error?: string } | void> | void;
  className?: string;
  isSimulation?: boolean;
  isEventPreview?: boolean;
  isEventTest?: boolean;
  targetDimensions?: { width: number; height: number };
  isPortrait?: boolean;
  onScaleChange?: (scale: number, availableWidth: number, availableHeight: number) => void;
}

export const ResultScreenRenderer: React.FC<ResultScreenRendererProps> = ({
  resultConfig,
  stats,
  theme,
  layout,
  onAction,
  leaderboardSlot,
  leaderboardData,
  loadingLeaderboard,
  leaderboardError,
  currentPlayerName,
  currentEntryId,
  scoreSubmitted,
  submittedRank,
  isSubmittingScore,
  submissionError,
  onSubmitScore,
  className = '',
  isSimulation = false,
  isEventPreview = false,
  isEventTest = false,
  targetDimensions,
  isPortrait,
  onScaleChange,
}) => {
  const bg = resolveScreenBackground(resultConfig, theme);

  // Logical design coordinates: fixed 1024 × 576 pixels (standard 16:9 design resolution)
  const canvasWidth = targetDimensions?.width || LOGICAL_CANVAS_WIDTH;
  const canvasHeight = targetDimensions?.height || LOGICAL_CANVAS_HEIGHT;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerDimensions, setContainerDimensions] = useState<{
    width: number;
    height: number;
  }>({
    width: 0,
    height: 0,
  });

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
        h = (w * canvasHeight) / canvasWidth;
      } else if (h > 0 && w <= 0) {
        w = (h * canvasWidth) / canvasHeight;
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
  }, [canvasWidth, canvasHeight]);

  // Determine physical available dimensions from state or live DOM
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
        containerH = (containerW * canvasHeight) / canvasWidth;
      } else if (containerH > 0 && containerW <= 0) {
        containerW = (containerH * canvasWidth) / canvasHeight;
      }
    }
  }

  const effectiveContainerW = containerW > 0 ? containerW : canvasWidth;
  const effectiveContainerH = containerH > 0 ? containerH : canvasHeight;

  // Strict uniform scaling preserving 16:9 aspect ratio:
  // scale = Math.min(availableWidth / canvasWidth, availableHeight / canvasHeight)
  const scale = Math.min(
    effectiveContainerW / canvasWidth,
    effectiveContainerH / canvasHeight
  );
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;

  useEffect(() => {
    onScaleChange?.(safeScale, effectiveContainerW, effectiveContainerH);
  }, [safeScale, effectiveContainerW, effectiveContainerH, onScaleChange]);

  const scaledWidth = canvasWidth * safeScale;
  const scaledHeight = canvasHeight * safeScale;

  const effectiveLayout = layout || theme?.layout;
  const alignment = resolveResultScreenLayout(effectiveLayout);

  const isReactionGame =
    stats.gameType === 'reaction-time' ||
    stats.gameType === 'reaction-tap' ||
    (theme && (getThemeGameType(theme) === 'reaction-time' || getThemeGameType(theme) === 'reaction-tap'));

  const isCatchBrandGame =
    stats.gameType === 'catch-brand' ||
    (!isReactionGame && theme && getThemeGameType(theme) === 'catch-brand');

  const elements: ResultScreenElement[] =
    Array.isArray(resultConfig?.elements) && resultConfig.elements.length > 0
      ? resultConfig.elements
      : isReactionGame
      ? generateDefaultReactionResultScreenElements()
      : isCatchBrandGame
      ? generateDefaultCatchBrandResultScreenElements(resultConfig || undefined)
      : generateDefaultResultScreenElements(resultConfig || undefined);

  // Recursive element renderer
  const renderElement = (
    el: ResultScreenElement,
    parentWidth: number,
    parentHeight: number,
    isRoot: boolean = false
  ): React.ReactNode => {
    if (el.visible === false) return null;

    if (isRoot) {
      // The Root Result Card ("Board Cleared!", statistics cards, play again button)
      // follows the configured game layout positioning rules (CENTER, LEFT, or RIGHT).
      // Uses the exact same horizontal and vertical positioning rules as the live game:
      // absolute positioning with left/top percentage and transform translate(-50%, -50%),
      // ensuring perfect horizontal and vertical centering within the game viewport.
      const cardWidth = Math.min(el.width, 740);
      const cardHeight = el.height;

      const rootStyle: React.CSSProperties = {
        position: 'absolute',
        left: `${alignment.coordX}%`,
        top: `${alignment.coordY}%`,
        transform: `translate(-50%, -50%) ${el.rotation ? `rotate(${el.rotation}deg)` : ''}`.trim(),
        width: isPortrait ? 'min(94%, 560px)' : 'min(90%, 700px)',
        maxWidth: '100%',
        maxHeight: isPortrait ? '94%' : '88%',
        aspectRatio: `${cardWidth} / ${cardHeight}`,
        opacity: el.opacity ?? 1,
        zIndex: el.zIndex ?? 1,
        boxSizing: 'border-box',
        margin: '0',
      };

      return (
        <div
          key={el.id}
          id={el.id}
          className="result-screen-card-container flex flex-col items-center justify-center pointer-events-auto"
          style={rootStyle}
        >
          <ResultElementContent
            element={el}
            parentWidth={cardWidth}
            parentHeight={cardHeight}
            stats={stats}
            isSimulation={isSimulation}
            isEventPreview={isEventPreview}
            isEventTest={isEventTest}
            onAction={onAction}
            renderChild={(child, pW, pH) => renderElement(child, pW, pH, false)}
            leaderboardData={leaderboardData}
            loadingLeaderboard={loadingLeaderboard}
            leaderboardError={leaderboardError}
            currentPlayerName={currentPlayerName}
            currentEntryId={currentEntryId}
            scoreSubmitted={scoreSubmitted}
            submittedRank={submittedRank}
            isSubmittingScore={isSubmittingScore}
            submissionError={submissionError}
            onSubmitScore={onSubmitScore}
          />
        </div>
      );
    }

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
      boxSizing: 'border-box',
    };

    return (
      <div key={el.id} id={el.id} style={commonStyle}>
        <ResultElementContent
          element={el}
          parentWidth={parentWidth}
          parentHeight={parentHeight}
          stats={stats}
          isSimulation={isSimulation}
          isEventPreview={isEventPreview}
          isEventTest={isEventTest}
          onAction={onAction}
          renderChild={(child, pW, pH) => renderElement(child, pW, pH, false)}
          leaderboardData={leaderboardData}
          loadingLeaderboard={loadingLeaderboard}
          leaderboardError={leaderboardError}
          currentPlayerName={currentPlayerName}
          currentEntryId={currentEntryId}
          scoreSubmitted={scoreSubmitted}
          submittedRank={submittedRank}
          isSubmittingScore={isSubmittingScore}
          submissionError={submissionError}
          onSubmitScore={onSubmitScore}
        />
      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      className={`result-screen-root absolute inset-0 w-full h-full flex items-center justify-center overflow-hidden select-none z-[100] ${className}`}
      style={{
        ...bg.containerStyle,
        zIndex: 100,
      }}
    >
      {/* Viewport Background Overlay */}
      <div className="absolute inset-0 pointer-events-none" style={bg.overlayStyle} />

      {/* Layer B: Canvas Frame - preserves 16:9 aspect ratio and scaled layout dimensions */}
      <div
        className="result-screen-frame shrink-0 relative shadow-2xl rounded-2xl overflow-hidden"
        style={{
          width: `${scaledWidth}px`,
          height: `${scaledHeight}px`,
          maxWidth: '100%',
          maxHeight: '100%',
        }}
      >
        {/* Layer C: Canvas Content - renders at fixed 1024x576 logical coordinates, scaled uniformly */}
        <div
          className="result-screen-canvas shrink-0 select-none relative"
          style={{
            width: `${canvasWidth}px`,
            height: `${canvasHeight}px`,
            minWidth: `${canvasWidth}px`,
            minHeight: `${canvasHeight}px`,
            transform: `scale(${safeScale})`,
            transformOrigin: 'top left',
            ...bg.containerStyle,
            containerType: 'inline-size',
          }}
        >
          {/* Inner Canvas Background Overlay */}
          <div className="absolute inset-0 pointer-events-none" style={bg.overlayStyle} />

          {/* All Elements at logical coordinates */}
          {elements.map((el) => renderElement(el, canvasWidth, canvasHeight, true))}

          {/* Canvas-level Leaderboard Slot (if provided by live game) */}
          {leaderboardSlot && (
            <div
              style={{
                position: 'absolute',
                bottom: '5%',
                left: '10%',
                width: '80%',
                zIndex: 30,
              }}
            >
              {leaderboardSlot}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

