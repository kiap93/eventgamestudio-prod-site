import React from 'react';
import { GameTheme } from '../../themes/types';
import { CatchBrandGameplayCustomizer } from './games/CatchBrandCustomizer';
import { MemoryMatchGameplayCustomizer } from './games/MemoryMatchCustomizer';

interface GameplayTabProps {
  theme: GameTheme;
  onChange: (updated: GameTheme) => void;
  gameType?: string;
}

export const GameplayTab: React.FC<GameplayTabProps> = ({
  theme,
  onChange,
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
      <MemoryMatchGameplayCustomizer
        theme={theme}
        onChange={onChange}
      />
    );
  }

  return (
    <CatchBrandGameplayCustomizer
      theme={theme}
      onChange={onChange}
    />
  );
};
