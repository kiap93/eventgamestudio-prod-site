import React from 'react';
import { GameTheme, isMemoryMatchTheme, isReactionTheme } from '../../themes';
import { MemoryMatchScreensCustomizer } from './games/MemoryMatchCustomizer';
import { ReactionScreensCustomizer } from './games/ReactionGameCustomizer';
import { CatchBrandScreensCustomizer } from './games/CatchBrandCustomizer';

interface ScreensTabProps {
  theme: GameTheme;
  onChange: (updated: GameTheme) => void;
  onUploadAsset: (file: File, fieldKey: string) => Promise<string>;
  uploadingAsset: string | null;
}

export const ScreensTab: React.FC<ScreensTabProps> = ({
  theme,
  onChange,
  onUploadAsset,
  uploadingAsset,
}) => {
  if (isReactionTheme(theme)) {
    return (
      <ReactionScreensCustomizer
        theme={theme}
        onChange={onChange}
        onUploadAsset={onUploadAsset}
        uploadingAsset={uploadingAsset}
      />
    );
  }

  const isMemoryMatch = isMemoryMatchTheme(theme);

  if (isMemoryMatch) {
    return (
      <MemoryMatchScreensCustomizer
        theme={theme}
        onChange={onChange}
        onUploadAsset={onUploadAsset}
        uploadingAsset={uploadingAsset}
      />
    );
  }

  return (
    <CatchBrandScreensCustomizer
      theme={theme}
      onChange={onChange}
      onUploadAsset={onUploadAsset}
      uploadingAsset={uploadingAsset}
    />
  );
};
