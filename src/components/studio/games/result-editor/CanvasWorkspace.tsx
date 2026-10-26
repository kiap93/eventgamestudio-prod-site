import React, { useMemo } from 'react';
import {
  ResultScreenElement,
  ResultCardElement,
  ResultGroupElement,
  MemoryMatchResultScreenConfig,
} from '../../../../games/memory-match/types';
import { ResultElementContent } from '../../../../games/memory-match/ResultElementContent';
import { resolveScreenBackground } from '../../../../themes/screenBackground';
import { GameTheme, normalizeGameType } from '../../../../themes/types';
import { CanvasWorkspace as SharedCanvasWorkspace } from '../shared-editor/CanvasWorkspace';

export interface CanvasWorkspaceProps {
  resultConfig: MemoryMatchResultScreenConfig;
  theme: Partial<GameTheme>;
  gameType?: string;
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
  onGestureStart?: (currentElements: ResultScreenElement[]) => void;
  onGestureEnd?: (finalElements: ResultScreenElement[]) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
}

export const CanvasWorkspace: React.FC<CanvasWorkspaceProps> = ({
  resultConfig,
  theme,
  gameType,
  elements,
  selectedIds,
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
  const canvasWidth = resultConfig.canvas?.width || 1000;
  const canvasHeight = resultConfig.canvas?.height || 1000;
  const bg = resolveScreenBackground(resultConfig, theme);

  const normGame = normalizeGameType(gameType || '');
  const isMatch3 = normGame === 'match-3';
  const isReaction = normGame === 'reaction-tap' || normGame === 'reaction-time';

  const simulatedStats = useMemo(() => {
    if (isMatch3) {
      return {
        score: 8450,
        targetScore: 5000,
        stars: 3,
        matches: 24,
        bestCombo: 5,
        specialTilesCreated: 6,
        moves: 24,
        timeElapsedSeconds: 45,
        isVictory: true,
        gameType: 'match-3',
      };
    }
    if (isReaction) {
      return {
        score: 219,
        averageReactionTimeMs: 219,
        bestReactionTimeMs: 195,
        worstReactionTimeMs: 247,
        rating: 'SUPERHUMAN',
        gameType: 'reaction-time',
      };
    }
    return {
      score: 1250,
      moves: 14,
      matchedPairsCount: 8,
      totalPairs: 8,
      accuracyPercent: 88,
      timeElapsedSeconds: 24,
      isVictory: true,
      gameType: 'memory-match',
    };
  }, [isMatch3, isReaction]);

  return (
    <SharedCanvasWorkspace<ResultScreenElement>
      canvasWidth={canvasWidth}
      canvasHeight={canvasHeight}
      canvasId="result-screen-pro-canvas"
      elements={elements}
      selectedIds={selectedIds}
      onSelectElement={onSelectElement}
      onClearSelection={onClearSelection}
      onUpdateElements={onUpdateElements}
      onUpdateSingleElement={onUpdateSingleElement}
      findElementAndParent={findElementAndParent}
      backgroundContainerStyle={bg.containerStyle}
      backgroundOverlayStyle={bg.overlayStyle}
      renderElementContent={(el, parentWidth, parentHeight, { renderChild, isEditor }) => (
        <ResultElementContent
          element={el}
          parentWidth={parentWidth}
          parentHeight={parentHeight}
          isSimulation={true}
          isEditor={isEditor}
          renderChild={renderChild}
          theme={theme}
          stats={simulatedStats}
        />
      )}
      onGestureStart={onGestureStart}
      onGestureEnd={onGestureEnd}
      onUndo={onUndo}
      onRedo={onRedo}
      onDelete={onDelete}
      onDuplicate={onDuplicate}
    />
  );
};
