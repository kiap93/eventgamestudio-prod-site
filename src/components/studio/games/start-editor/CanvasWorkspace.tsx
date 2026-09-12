import React from 'react';
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
import { CanvasWorkspace as SharedCanvasWorkspace } from '../shared-editor/CanvasWorkspace';

export interface CanvasWorkspaceProps {
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
  const canvasWidth = startConfig.canvas?.width || 1024;
  const canvasHeight = startConfig.canvas?.height || 576;
  const bg = resolveScreenBackground(startConfig, theme);

  return (
    <SharedCanvasWorkspace<StartScreenElement>
      canvasWidth={canvasWidth}
      canvasHeight={canvasHeight}
      canvasId="start-screen-pro-canvas"
      elements={elements}
      selectedIds={selectedIds}
      isPreviewMode={isPreviewMode}
      onExitPreview={onExitPreview}
      onSelectElement={onSelectElement}
      onClearSelection={onClearSelection}
      onUpdateElements={onUpdateElements}
      onUpdateSingleElement={onUpdateSingleElement}
      findElementAndParent={findElementAndParent}
      backgroundContainerStyle={bg.containerStyle}
      backgroundOverlayStyle={bg.overlayStyle}
      renderElementContent={(el, parentWidth, parentHeight, { renderChild, isEditor }) => (
        <StartElementContent
          element={el}
          parentWidth={parentWidth}
          parentHeight={parentHeight}
          isSimulation={true}
          isEditor={isEditor}
          gameType={gameType}
          gameMeta={gameMeta}
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
