import React from 'react';
import {
  ResultScreenElement,
  ResultCardElement,
  ResultGroupElement,
  MemoryMatchResultScreenConfig,
} from '../../../../games/memory-match/types';
import { ResultElementContent } from '../../../../games/memory-match/ResultElementContent';
import { resolveScreenBackground } from '../../../../themes/screenBackground';
import { GameTheme } from '../../../../themes/types';
import { CanvasWorkspace as SharedCanvasWorkspace } from '../shared-editor/CanvasWorkspace';

export interface CanvasWorkspaceProps {
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
