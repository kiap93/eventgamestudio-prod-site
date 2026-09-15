import React from 'react';
import {
  ResultScreenElement,
  ResultCardElement,
  ResultGroupElement,
  MemoryMatchResultScreenConfig,
  generateDefaultResultScreenElements,
  generateDefaultReactionResultScreenElements,
} from './resultScreenTypes';
import { resolveScreenBackground } from '../../themes/screenBackground';
import { GameTheme, GameLayoutConfig, getThemeGameType } from '../../themes/types';
import { ResultElementContent } from './ResultElementContent';
import { EventLeaderboardEntry } from '../../types';

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
}) => {
  const bg = resolveScreenBackground(resultConfig, theme);
  const canvasWidth = targetDimensions?.width || resultConfig?.canvas?.width || 1000;
  const canvasHeight = targetDimensions?.height || resultConfig?.canvas?.height || 1000;

  const effectiveLayout = layout || theme?.layout;
  const alignment = resolveResultScreenLayout(effectiveLayout);

  const isReactionGame =
    stats.gameType === 'reaction-time' ||
    stats.gameType === 'reaction-tap' ||
    (theme && getThemeGameType(theme) === 'reaction-time');

  const elements: ResultScreenElement[] =
    Array.isArray(resultConfig?.elements) && resultConfig.elements.length > 0
      ? resultConfig.elements
      : isReactionGame
      ? generateDefaultReactionResultScreenElements()
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
      className={`result-screen-root absolute inset-0 w-full h-full flex ${alignment.itemsClass} ${alignment.justifyClass} overflow-hidden select-none z-[100] ${className}`}
      style={{
        ...bg.containerStyle,
        justifyContent: alignment.justifyContent,
        alignItems: alignment.alignItems,
        zIndex: 100,
      }}
    >
      {/* Background Overlay */}
      <div className="absolute inset-0 pointer-events-none" style={bg.overlayStyle} />

      {/* Logical Canvas scaled responsively to fill container */}
      <div
        className={`result-screen-canvas relative w-full h-full max-w-full max-h-full flex ${alignment.itemsClass} ${alignment.justifyClass}`}
        style={{
          aspectRatio: `${canvasWidth} / ${canvasHeight}`,
          justifyContent: alignment.justifyContent,
          alignItems: alignment.alignItems,
          containerType: 'inline-size',
        }}
      >
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
  );
};

