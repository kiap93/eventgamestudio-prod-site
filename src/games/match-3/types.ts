import { BaseGameConfig } from '../types';
import type { StartScreenConfig } from '../shared/startScreenTypes';
import type { ResultScreenConfig } from '../shared/resultScreenTypes';

export interface Match3ScreensConfig {
  start?: StartScreenConfig;
  result?: ResultScreenConfig;
  [key: string]: any;
}

export type SpecialTileType = 'rocket-horizontal' | 'rocket-vertical' | 'bomb' | 'color-bomb' | null;

export type Match3HazardType = 'stone' | 'ice' | 'bubble';

export interface Match3HazardConfig {
  enabled: boolean;
  type: Match3HazardType;
  initialCount: number; // e.g. 2 to 6 hazards on initial board
  pointsPenalty?: number; // points deducted if matched / penalty
  clearCondition: 'adjacent_match' | 'direct_match';
}

export const DEFAULT_MATCH3_HAZARD_CONFIG: Match3HazardConfig = {
  enabled: false,
  type: 'stone',
  initialCount: 3,
  pointsPenalty: 0,
  clearCondition: 'adjacent_match',
};

export interface Match3Tile {
  id: string;
  row: number;
  col: number;
  type: string; // e.g. 'tile-01', 'tile-02', etc.
  special?: SpecialTileType;
  hazard?: Match3HazardType | null;
  hazardHealth?: number; // for obstacles that require hits
  isMatched?: boolean;
  isClearing?: boolean;
  isNew?: boolean;
}

export type Match3ObjectiveType = 'score' | 'collect' | 'remove';

export interface Match3Objective {
  type: Match3ObjectiveType;
  targetScore: number;
  targetTileType?: string;
  targetCollectCount?: number;
  collectedCount?: number;
  targetHazardCount?: number;
  hazardsClearedCount?: number;
}

export interface Match3ScoringConfig {
  match3Points: number;
  match4Points: number;
  match5Points: number;
  rocketPoints: number;
  bombPoints: number;
  colorBombPoints: number;
  comboMultipliers: Record<number, number>;
}

export interface Match3EngineOptions {
  minimumMatch?: number;
  comboEnabled?: boolean;
  specialTilesEnabled?: boolean;
  cascadeEnabled?: boolean;
  shuffleWhenNoMoves?: boolean;
  hazardConfig?: Match3HazardConfig;
}

export const DEFAULT_MATCH3_SCORING: Match3ScoringConfig = {
  match3Points: 100,
  match4Points: 180,
  match5Points: 300,
  rocketPoints: 250,
  bombPoints: 250,
  colorBombPoints: 500,
  comboMultipliers: {
    1: 1.0,
    2: 1.5,
    3: 2.0,
    4: 2.5,
    5: 3.0,
  },
};

export interface Match3GameConfig extends BaseGameConfig {
  gameDurationSeconds: number;
  rows: number;
  cols: number;
  tileTypesCount: number;
  minimumMatch: number;
  comboEnabled: boolean;
  specialTilesEnabled: boolean;
  cascadeEnabled: boolean;
  shuffleWhenNoMoves: boolean;
  objective: Match3Objective;
  scoring: Match3ScoringConfig;
  hazardConfig: Match3HazardConfig;
  tileDefinitions?: TileVisualDefinition[];
  screens?: Match3ScreensConfig;
}

export const DEFAULT_MATCH3_CONFIG: Match3GameConfig = {
  gameDurationSeconds: 60,
  rows: 8,
  cols: 8,
  tileTypesCount: 6,
  minimumMatch: 3,
  comboEnabled: true,
  specialTilesEnabled: true,
  cascadeEnabled: true,
  shuffleWhenNoMoves: true,
  objective: {
    type: 'score',
    targetScore: 10000,
    targetTileType: 'tile-01',
    targetCollectCount: 30,
    collectedCount: 0,
    targetHazardCount: 3,
    hazardsClearedCount: 0,
  },
  scoring: DEFAULT_MATCH3_SCORING,
  hazardConfig: DEFAULT_MATCH3_HAZARD_CONFIG,
  soundVolume: 0.8,
  soundEnabled: true,
  bgmEnabled: true,
};

export type Match3Status = 'ready' | 'countdown' | 'playing' | 'resolving' | 'game_over' | 'result';

export interface Match3Stats {
  score: number;
  combo: number;
  bestCombo: number;
  matches: number;
  specialTilesCreated: number;
  duration: number;
  isVictory?: boolean;
}

export interface Match3GameState {
  status: Match3Status;
  board: Match3Tile[][];
  score: number;
  combo: number;
  bestCombo: number;
  matches: number;
  specialTilesCreated: number;
  remainingTime: number;
  objective: Match3Objective;
  stats?: Match3Stats;
}

// Visual Tile Definitions for Generic Tile IDs
export interface TileVisualDefinition {
  id: string; // 'tile-01', etc.
  name: string;
  color: string;
  bgColor: string;
  borderColor: string;
  glowColor: string;
  symbol: string; // Lucide icon or geometric shape representation
  imageUrl?: string | null;
}

export const DEFAULT_TILE_DEFINITIONS: TileVisualDefinition[] = [
  {
    id: 'tile-01',
    name: 'Ruby Gem',
    color: '#ef4444',
    bgColor: 'linear-gradient(135deg, #f87171, #dc2626)',
    borderColor: '#fca5a5',
    glowColor: 'rgba(239, 68, 68, 0.5)',
    symbol: 'Diamond',
  },
  {
    id: 'tile-02',
    name: 'Sapphire Crystal',
    color: '#3b82f6',
    bgColor: 'linear-gradient(135deg, #60a5fa, #2563eb)',
    borderColor: '#93c5fd',
    glowColor: 'rgba(59, 130, 246, 0.5)',
    symbol: 'Hexagon',
  },
  {
    id: 'tile-03',
    name: 'Emerald Shield',
    color: '#10b981',
    bgColor: 'linear-gradient(135deg, #34d399, #059669)',
    borderColor: '#6ee7b7',
    glowColor: 'rgba(16, 185, 129, 0.5)',
    symbol: 'Shield',
  },
  {
    id: 'tile-04',
    name: 'Topaz Sun',
    color: '#f59e0b',
    bgColor: 'linear-gradient(135deg, #fbbf24, #d97706)',
    borderColor: '#fde68a',
    glowColor: 'rgba(245, 158, 11, 0.5)',
    symbol: 'Sun',
  },
  {
    id: 'tile-05',
    name: 'Amethyst Orb',
    color: '#a855f7',
    bgColor: 'linear-gradient(135deg, #c084fc, #9333ea)',
    borderColor: '#e9d5ff',
    glowColor: 'rgba(168, 85, 247, 0.5)',
    symbol: 'Circle',
  },
  {
    id: 'tile-06',
    name: 'Cyan Teardrop',
    color: '#06b6d4',
    bgColor: 'linear-gradient(135deg, #22d3ee, #0891b2)',
    borderColor: '#a5f3fc',
    glowColor: 'rgba(6, 182, 212, 0.5)',
    symbol: 'Droplet',
  },
  {
    id: 'tile-07',
    name: 'Rose Heart',
    color: '#ec4899',
    bgColor: 'linear-gradient(135deg, #f472b6, #db2777)',
    borderColor: '#fbcfe8',
    glowColor: 'rgba(236, 72, 153, 0.5)',
    symbol: 'Heart',
  },
  {
    id: 'tile-08',
    name: 'Star Gold',
    color: '#eab308',
    bgColor: 'linear-gradient(135deg, #facc15, #ca8a04)',
    borderColor: '#fef08a',
    glowColor: 'rgba(234, 179, 8, 0.5)',
    symbol: 'Star',
  },
];
