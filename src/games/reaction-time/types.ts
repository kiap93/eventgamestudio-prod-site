import { BaseGameConfig } from '../types';
import { ResultScreenConfig, generateDefaultReactionResultScreenElements } from '../shared/resultScreenTypes';

export interface ReactionScreensConfig {
  result?: ResultScreenConfig;
}

export type ReactionLightShape = 'circle' | 'rounded' | 'pill';
export type FalseStartRule = 'retry' | 'penalty_1000ms' | 'disqualify';

export type ReactionGameState =
  | 'IDLE'
  | 'READY'
  | 'LIGHT_SEQUENCE'
  | 'RANDOM_WAIT'
  | 'GO'
  | 'WAITING_FOR_INPUT'
  | 'ROUND_RESULT'
  | 'FALSE_START'
  | 'FINAL_RESULT';

export interface ReactionRoundResult {
  round: number;
  reactionTimeMs: number;
  falseStart?: boolean;
  timestamp?: number;
}

export interface ReactionGameConfig extends BaseGameConfig {
  roundsCount: number; // default 5 (1 to 10)
  lightCount: number; // default 5 (3, 4, or 5)
  lightShape: ReactionLightShape; // 'circle' | 'rounded' | 'pill'
  lightOffColor: string; // default '#1e293b'
  lightActiveColor: string; // default '#ef4444' (F1 Red)
  lightGoColor: string; // default '#22c55e' (Green)
  lightGoBehavior: 'all-off' | 'all-green'; // default 'all-off' (classic F1)
  minRandomDelayMs: number; // default 1200
  maxRandomDelayMs: number; // default 3500
  sequenceIntervalMs: number; // default 1000 ms per light
  falseStartRule: FalseStartRule; // default 'retry'
  readyTitle: string; // default "READY TO RACE?"
  readyInstructions: string; // default "When all red lights extinguish, react as fast as possible!"
  goText: string; // default "GO!"
  falseStartText: string; // default "JUMP START!"
  screens?: ReactionScreensConfig;
}

export const DEFAULT_REACTION_CONFIG: ReactionGameConfig = {
  roundsCount: 5,
  lightCount: 5,
  lightShape: 'circle',
  lightOffColor: '#1e293b',
  lightActiveColor: '#ef4444',
  lightGoColor: '#22c55e',
  lightGoBehavior: 'all-off',
  minRandomDelayMs: 1200,
  maxRandomDelayMs: 3500,
  sequenceIntervalMs: 1000,
  falseStartRule: 'retry',
  readyTitle: 'READY TO RACE?',
  readyInstructions: 'When all lights go out, click, tap, or press SPACE as fast as you can!',
  goText: 'GO!',
  falseStartText: 'JUMP START!',
  soundVolume: 0.8,
  soundEnabled: true,
  bgmEnabled: false,
  screens: {
    result: {
      backgroundType: 'theme',
      backgroundColor: '#070b14',
      backgroundImageUrl: null,
      backgroundOverlayOpacity: 0.3,
      canvas: { width: 1000, height: 1000 },
      elements: generateDefaultReactionResultScreenElements(),
    },
  },
};

export interface ReactionRatingTier {
  tier: string;
  badgeColor: string;
  description: string;
  maxMs: number;
}

export const REACTION_RATING_TIERS: ReactionRatingTier[] = [
  { tier: 'SUPERHUMAN', badgeColor: '#fbbf24', description: 'Formula 1 driver reflexes!', maxMs: 200 },
  { tier: 'PRO RACER', badgeColor: '#38bdf8', description: 'Elite reaction speed!', maxMs: 240 },
  { tier: 'LIGHTNING FAST', badgeColor: '#34d399', description: 'Faster than 90% of humans!', maxMs: 280 },
  { tier: 'GREAT REFLEXES', badgeColor: '#a855f7', description: 'Sharp and alert!', maxMs: 330 },
  { tier: 'AVERAGE', badgeColor: '#94a3b8', description: 'Standard human reaction time.', maxMs: 400 },
  { tier: 'NEEDS COFFEE', badgeColor: '#f87171', description: 'A bit sluggish, try again!', maxMs: Infinity },
];

export function getReactionRating(averageMs: number): ReactionRatingTier {
  for (const tier of REACTION_RATING_TIERS) {
    if (averageMs <= tier.maxMs) {
      return tier;
    }
  }
  return REACTION_RATING_TIERS[REACTION_RATING_TIERS.length - 1];
}
