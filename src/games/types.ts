import React from 'react';
import { GameTheme } from '../themes/types';
import { GameSettings, GameState, GameStats } from '../types';

export type GameTypeId = 'catch-brand' | 'reaction-tap' | 'memory-match' | 'speed-quiz';

export interface BaseGameConfig {
  gameDurationSeconds?: number;
  soundVolume?: number;
  soundEnabled?: boolean;
  bgmEnabled?: boolean;
}

export interface CatchBrandConfig extends BaseGameConfig {
  fallSpeedMultiplier?: number;
  cameraControlEnabled?: boolean;
  goodItemScore?: number;
  badItemScore?: number;
  bonusItemScore?: number;
}

export interface GameComponentProps<TConfig extends BaseGameConfig = BaseGameConfig> {
  activeTheme: GameTheme;
  settings: GameSettings;
  config?: TConfig;
  eventId?: string;
  publicToken?: string;
  isEventPreview?: boolean;
  onStatsChange?: (stats: GameStats) => void;
  onGameStateChange?: (state: GameState) => void;
  isMuted: boolean;
  isFullscreen: boolean;
  onToggleFullscreen?: () => void;
  onToggleMute?: () => void;
}

export interface GameDefinition<TConfig extends BaseGameConfig = BaseGameConfig> {
  id: GameTypeId | string;
  name: string;
  shortName: string;
  description: string;
  iconName: string;
  thumbnailUrl?: string;
  category: 'action' | 'reaction' | 'puzzle' | 'trivia';
  minPlayers: number;
  maxPlayers: number;
  defaultDurationSeconds: number;
  supportedInputTypes: ('keyboard' | 'touch' | 'mouse' | 'motion' | 'camera')[];
  defaultConfig: TConfig;
  component: React.ComponentType<GameComponentProps<TConfig>>;
  isAvailable: boolean;
  comingSoon?: boolean;
}
