import { GameTheme, ThemeDropItem, ThemeDifficultyStage } from './themes/types';

export type GameState = 'START' | 'COUNTDOWN' | 'PLAYING' | 'PAUSED' | 'GAME_OVER';

export type DurianType = 'GREEN' | 'ORANGE' | 'GOLDEN' | 'GOOD' | 'BAD' | 'BONUS';

export interface DurianConfig {
  type: DurianType;
  scoreValue: number;
  textureKey: string;
  speedMin: number;
  speedMax: number;
}

export type DifficultyStage = ThemeDifficultyStage;

export interface GameStats {
  score: number;
  highScore: number;
  greenCaught: number; // good items caught
  orangeCaught: number; // hazard items caught
  goldenCaught: number; // bonus items caught
  duriansMissed: number; // missed items
  timeRemaining: number;
  // Dynamic breakdown map by item ID
  itemsCaughtById?: Record<string, number>;
}

export interface GameSettings {
  volume: number;
  soundEnabled: boolean;
  bgmEnabled: boolean;
  fallSpeedMultiplier: number;
  gameDurationSeconds: number;
  cameraControlEnabled?: boolean;
}

export * from './themes/types';
