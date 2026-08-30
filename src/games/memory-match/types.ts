import { BaseGameConfig } from '../types';

export interface MemoryCard {
  id: string;
  pairId: string;
  name: string;
  imageUrl?: string | null;
  iconName?: string;
  color?: string;
  bgColor?: string;
  borderColor?: string;
  points: number;
  isFlipped: boolean;
  isMatched: boolean;
  isShaking?: boolean;
  rotation?: number; // Deterministic rotation angle in degrees
}

export interface MemoryMatchPairConfig {
  id: string;
  name: string;
  imageUrl?: string | null;
  iconName?: string;
  color?: string;
  bgColor?: string;
  borderColor?: string;
  points?: number;
}

export type MemoryMatchLayoutMode = 'grid' | 'random';
export type MemoryMatchCardRotationMode = 'none' | 'fixed' | 'random';

export interface MemoryMatchCardConfig {
  width: number; // Card width in pixels (e.g. 60 - 240, default: 120)
  height: number; // Card height in pixels (e.g. 60 - 240, default: 120)
  borderRadius: number; // Corner radius in pixels (e.g. 0 - 36, default: 16)
  rotationMode: MemoryMatchCardRotationMode; // 'none' | 'fixed' | 'random'
  rotation: number; // Fixed rotation angle in degrees (e.g. -45 to 45 deg, default: 0)
  rotationRange?: number; // Random tilt range in degrees (e.g. 0 to 25 deg, default: 8)
}

export interface MemoryMatchRandomLayoutConfig {
  minSpacing: number; // default: 12 (range: 0-40 px)
  rotationMin: number; // default: -8 (range: -15 to 0 deg)
  rotationMax: number; // default: 8 (range: 0 to 15 deg)
}

export interface MemoryMatchBoardConfig {
  layoutMode: MemoryMatchLayoutMode; // 'grid' | 'random'
  rows: number; // default: 4 (range: 2 to 6)
  cols: number; // default: 4 (range: 2 to 6)
  cardGap: number; // default: 12 px
  randomLayout: MemoryMatchRandomLayoutConfig;
  card?: MemoryMatchCardConfig;
}

export interface MemoryMatchGridConfig {
  rows: number; // default: 4
  cols: number; // default: 4
}

export interface MemoryMatchGameplayConfig {
  gameDurationSeconds: number; // default: 45
  mismatchDelayMs: number; // default: 850
  matchPoints: number; // default: 100
  comboPoints: number; // default: 30
}

export interface MemoryMatchUiConfig {
  showLeaderboard?: boolean; // default: true
}

export type ScreenBackgroundType = 'color' | 'theme' | 'image';

export interface MemoryMatchStartScreenConfig {
  backgroundType: ScreenBackgroundType;
  backgroundColor: string; // default '#0f172a'
  backgroundImageUrl?: string | null;
  backgroundOverlayOpacity?: number; // 0 to 1, default 0.3

  showIcon: boolean;
  showGridInfo: boolean;
  showPairsInfo: boolean;
  showTimerInfo: boolean;
}

export interface MemoryMatchResultScreenConfig {
  backgroundType: ScreenBackgroundType;
  backgroundColor: string; // default '#0f172a'
  backgroundImageUrl?: string | null;
  backgroundOverlayOpacity?: number; // 0 to 1, default 0.3

  showScore: boolean;
  showMoves: boolean;
  showPairs: boolean;
  showAccuracy: boolean;
}

export interface MemoryMatchScreensConfig {
  start: MemoryMatchStartScreenConfig;
  result: MemoryMatchResultScreenConfig;
}

export interface MemoryMatchGameConfig {
  cardBackUrl?: string | null;
  card?: MemoryMatchCardConfig;
  pairs: MemoryMatchPairConfig[];
  board: MemoryMatchBoardConfig;
  grid?: MemoryMatchGridConfig;
  gameplay: MemoryMatchGameplayConfig;
  ui?: MemoryMatchUiConfig;
  screens?: MemoryMatchScreensConfig;
}

export interface MemoryMatchConfig extends BaseGameConfig {
  gridRows?: number; // default: 4
  gridCols?: number; // default: 4
  pairCount?: number; // default: 8
  mismatchDelayMs?: number; // default: 850ms
  matchPoints?: number; // default: 100
  comboPoints?: number; // default: 30
  timeBonusMultiplier?: number; // default: 10
}

