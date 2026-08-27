import React from 'react';
import { GameTheme } from '../../themes/types';
import { CatchBrandItemsCustomizer } from './games/CatchBrandCustomizer';
import { MemoryMatchCardsCustomizer } from './games/MemoryMatchCustomizer';

interface ItemsTabProps {
  theme: GameTheme;
  onChange: (updated: GameTheme) => void;
  onUploadAsset: (file: File, fieldKey: string) => Promise<string>;
  uploadingAsset: string | null;
  gameType?: string;
}

export const ItemsTab: React.FC<ItemsTabProps> = ({
  theme,
  onChange,
  onUploadAsset,
  uploadingAsset,
  gameType,
}) => {
  const resolvedGameType =
    (gameType || theme.game_type || theme.game_slug || '').toLowerCase();
  const isMemoryMatch =
    resolvedGameType === 'memory-match' ||
    theme.slug?.includes('memory') ||
    theme.base_theme_id === 'memory-carnival';

  if (isMemoryMatch) {
    return (
      <MemoryMatchCardsCustomizer
        theme={theme}
        onChange={onChange}
        onUploadAsset={onUploadAsset}
        uploadingAsset={uploadingAsset}
      />
    );
  }

  return (
    <CatchBrandItemsCustomizer
      theme={theme}
      onChange={onChange}
      onUploadAsset={onUploadAsset}
      uploadingAsset={uploadingAsset}
    />
  );
};
