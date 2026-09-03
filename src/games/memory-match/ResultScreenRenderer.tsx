import React from 'react';
import {
  ResultScreenElement,
  ResultCardElement,
  ResultGroupElement,
  MemoryMatchResultScreenConfig,
  generateDefaultResultScreenElements,
} from './types';
import { resolveScreenBackground } from '../../themes/screenBackground';
import { GameTheme } from '../../themes/types';
import { ResultElementContent } from './ResultElementContent';
import { EventLeaderboardEntry } from '../../types';

export interface ResultScreenStats {
  score: number;
  moves: number;
  matchedPairsCount: number;
  totalPairs: number;
  accuracyPercent: number;
  timeElapsedSeconds?: number;
  isVictory?: boolean;
}

export interface ResultScreenRendererProps {
  resultConfig?: MemoryMatchResultScreenConfig | null;
  stats: ResultScreenStats;
  theme?: Partial<GameTheme> | null;
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
}

export const ResultScreenRenderer: React.FC<ResultScreenRendererProps> = ({
  resultConfig,
  stats,
  theme,
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
}) => {
  const bg = resolveScreenBackground(resultConfig, theme);
  const canvasWidth = resultConfig?.canvas?.width || 1000;
  const canvasHeight = resultConfig?.canvas?.height || 1000;

  const elements: ResultScreenElement[] =
    Array.isArray(resultConfig?.elements) && resultConfig.elements.length > 0
      ? resultConfig.elements
      : generateDefaultResultScreenElements(resultConfig || undefined);

  // Recursive element renderer
  const renderElement = (
    el: ResultScreenElement,
    parentWidth: number,
    parentHeight: number,
    isRoot: boolean = false
  ): React.ReactNode => {
    if (el.visible === false) return null;

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
      className={`absolute inset-0 w-full h-full flex items-center justify-center overflow-hidden select-none z-[100] ${className}`}
      style={{
        ...bg.containerStyle,
        zIndex: 100,
      }}
    >
      {/* Background Overlay */}
      <div className="absolute inset-0 pointer-events-none" style={bg.overlayStyle} />

      {/* 1000 x 1000 Logical Canvas scaled responsively to fill container */}
      <div
        className="relative w-full h-full max-w-full max-h-full aspect-square"
        style={{
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
