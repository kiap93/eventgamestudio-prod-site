import React from 'react';
import { StartScreenConfig, StartScreenGameMeta } from '../../../../games/shared/startScreenTypes';
import { GameTheme } from '../../../../themes/types';
import { StartScreenVisualEditor } from '../StartScreenVisualEditor';

export interface StartScreenVisualEditorModalProps {
  startConfig: StartScreenConfig;
  theme: Partial<GameTheme>;
  gameType?: string;
  gameMeta?: StartScreenGameMeta;
  onChange: (updatedConfig: Partial<StartScreenConfig>) => void;
  isOpen: boolean;
  onClose: () => void;
  onUploadAsset?: (file: File, type: string) => Promise<string>;
}

export const StartScreenVisualEditorModal: React.FC<StartScreenVisualEditorModalProps> = ({
  startConfig,
  theme,
  gameType = 'memory-match',
  gameMeta,
  onChange,
  isOpen,
  onClose,
  onUploadAsset,
}) => {
  if (!isOpen) return null;

  return (
    <StartScreenVisualEditor
      startConfig={startConfig}
      theme={theme}
      gameType={gameType}
      gameMeta={gameMeta}
      onChange={onChange}
      isOpen={isOpen}
      onClose={onClose}
      isModal={true}
      onUploadAsset={onUploadAsset}
    />
  );
};
