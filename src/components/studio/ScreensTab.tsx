import React from 'react';
import { GameTheme, isMemoryMatchTheme, isReactionTheme } from '../../themes';
import { MemoryMatchScreensCustomizer } from './games/MemoryMatchCustomizer';
import { ReactionScreensCustomizer } from './games/ReactionGameCustomizer';
import { Tv, Sparkles } from 'lucide-react';

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
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 text-center space-y-4 shadow-xl">
      <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400">
        <Tv className="w-6 h-6" />
      </div>
      <div className="max-w-md mx-auto space-y-1.5">
        <h3 className="text-base font-bold text-slate-100">Game Screens Customization</h3>
        <p className="text-xs text-slate-400 leading-relaxed">
          Screen customization is available for Memory Match themes to independently configure Start Screen and Result Screen backgrounds, statistics, and elements.
        </p>
      </div>
    </div>
  );
};
