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

export interface MemoryMatchGameConfig {
  cardBackUrl?: string | null;
  pairs: MemoryMatchPairConfig[];
  grid: MemoryMatchGridConfig;
  gameplay: MemoryMatchGameplayConfig;
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

