import { GameDefinition, CatchBrandConfig, DEFAULT_GAME_TYPE } from './types';
import { CatchBrandGame } from './catch-brand/CatchBrandGame';
import { MemoryMatchGame } from './memory-match/MemoryMatchGame';
import { MemoryMatchConfig } from './memory-match/types';
import { ReactionGame } from './reaction-time/ReactionGame';
import { DEFAULT_REACTION_CONFIG, ReactionGameConfig } from './reaction-time/types';
import { SpeedQuizUnavailablePlaceholder } from './speed-quiz/SpeedQuizUnavailablePlaceholder';
import { Match3Game } from './match-3/Match3Game';
import { DEFAULT_MATCH3_CONFIG, Match3GameConfig } from './match-3/types';
import { RandomTargetGame } from './random-target/RandomTargetGame';
import { DEFAULT_DESERT_CONFIG, RandomTargetGameConfig } from './random-target/types';
import {
  normalizeGameType,
  tryNormalizeGameType,
  resolveAuthoritativeGameType,
  AuthoritativeGameTypeContext,
} from '../themes/types';

export {
  DEFAULT_GAME_TYPE,
  tryNormalizeGameType,
  resolveAuthoritativeGameType,
  type AuthoritativeGameTypeContext,
};

const CANONICAL_GAME_REGISTRY: Record<string, GameDefinition<any>> = {
  'catch-brand': {
    id: 'catch-brand',
    name: 'Catch the Brand',
    shortName: 'Catch',
    description: 'Fast-paced arcade catcher! Catch good brand objects, dodge hazardous obstacles, and collect golden bonus items.',
    iconName: 'ShoppingBasket',
    category: 'action',
    minPlayers: 1,
    maxPlayers: 1,
    defaultDurationSeconds: 20,
    supportedInputTypes: ['keyboard', 'touch', 'mouse', 'motion'],
    defaultConfig: {
      gameDurationSeconds: 20,
      fallSpeedMultiplier: 0.7,
      soundVolume: 0.8,
      soundEnabled: true,
      bgmEnabled: true,
      goodItemScore: 10,
      badItemScore: -10,
      bonusItemScore: 50,
    } as CatchBrandConfig,
    component: CatchBrandGame,
    isAvailable: true,
  },
  'reaction-tap': {
    id: 'reaction-tap',
    name: 'Formula Reaction Lights',
    shortName: 'Reaction',
    description: 'Measure reaction speed in an F1-style starting light sequence. When the lights go out, react as fast as you can!',
    iconName: 'Zap',
    category: 'reaction',
    minPlayers: 1,
    maxPlayers: 1,
    defaultDurationSeconds: 15,
    supportedInputTypes: ['keyboard', 'touch', 'mouse'],
    defaultConfig: DEFAULT_REACTION_CONFIG as ReactionGameConfig,
    component: ReactionGame,
    isAvailable: true,
    comingSoon: false,
  },
  'memory-match': {
    id: 'memory-match',
    name: 'Brand Memory Match',
    shortName: 'Memory',
    description: 'Classic card flip and memory puzzle matching custom branded products and logos.',
    iconName: 'Grid3X3',
    category: 'puzzle',
    minPlayers: 1,
    maxPlayers: 1,
    defaultDurationSeconds: 45,
    supportedInputTypes: ['touch', 'mouse'],
    defaultConfig: {
      gameDurationSeconds: 45,
      soundVolume: 0.8,
      soundEnabled: true,
      bgmEnabled: true,
      gridRows: 4,
      gridCols: 4,
      pairCount: 8,
      mismatchDelayMs: 850,
      matchPoints: 100,
      comboPoints: 30,
    } as MemoryMatchConfig,
    component: MemoryMatchGame,
    isAvailable: true,
  },
  'speed-quiz': {
    id: 'speed-quiz',
    name: 'Event Trivia Speed Quiz',
    shortName: 'Quiz',
    description: 'Interactive timed multiple-choice trivia challenge for live event booths and activations.',
    iconName: 'HelpCircle',
    category: 'trivia',
    minPlayers: 1,
    maxPlayers: 4,
    defaultDurationSeconds: 30,
    supportedInputTypes: ['keyboard', 'touch', 'mouse'],
    defaultConfig: {
      gameDurationSeconds: 30,
      soundVolume: 0.8,
      soundEnabled: true,
      bgmEnabled: true,
    },
    component: SpeedQuizUnavailablePlaceholder,
    isAvailable: false,
    comingSoon: true,
  },
  'match-3': {
    id: 'match-3',
    name: 'Match-3',
    shortName: 'Match-3',
    description: 'Swap matching tiles to create combinations, trigger special tiles, build combos, and achieve the highest score before time runs out.',
    iconName: 'Sparkles',
    category: 'puzzle',
    minPlayers: 1,
    maxPlayers: 1,
    defaultDurationSeconds: 60,
    supportedInputTypes: ['touch', 'mouse', 'keyboard'],
    defaultConfig: DEFAULT_MATCH3_CONFIG as Match3GameConfig,
    component: Match3Game,
    isAvailable: true,
  },
  'random-target': {
    id: 'random-target',
    name: 'Random Target Arcade',
    shortName: 'Target',
    description: 'Tap appearing targets before time runs out! Hit positive score targets and avoid penalty obstacles across Desert and Ocean themes.',
    iconName: 'Crosshair',
    category: 'action',
    minPlayers: 1,
    maxPlayers: 1,
    defaultDurationSeconds: 30,
    supportedInputTypes: ['touch', 'mouse'],
    defaultConfig: DEFAULT_DESERT_CONFIG as RandomTargetGameConfig,
    component: RandomTargetGame,
    isAvailable: true,
  },
};

/**
 * Authoritative game registry.
 * Proxied so that alias lookups (e.g. 'reaction-time') seamlessly resolve to the canonical definition,
 * while Object.keys(), Object.values(), and Object.entries() strictly iterate only over unique canonical games.
 */
export const GAME_REGISTRY: Record<string, GameDefinition<any>> = new Proxy(CANONICAL_GAME_REGISTRY, {
  get(target, prop: string | symbol) {
    if (typeof prop === 'string') {
      if (prop in target) {
        return target[prop];
      }
      if (prop === 'reaction-time' || prop === 'reaction-tap-f1-reflex') {
        return target['reaction-tap'];
      }
      if (prop === 'random_target' || prop === 'target-arcade' || prop === 'desert-quick-draw' || prop === 'ocean-treasure-hunt') {
        return target['random-target'];
      }
    }
    return Reflect.get(target, prop);
  },
  has(target, prop: string | symbol) {
    if (typeof prop === 'string' && (prop === 'reaction-time' || prop === 'reaction-tap-f1-reflex' || prop === 'random_target' || prop === 'target-arcade' || prop === 'desert-quick-draw' || prop === 'ocean-treasure-hunt')) {
      return true;
    }
    return Reflect.has(target, prop);
  },
  ownKeys(target) {
    return Reflect.ownKeys(target);
  },
  getOwnPropertyDescriptor(target, prop) {
    return Reflect.getOwnPropertyDescriptor(target, prop);
  },
});

/**
 * Safely resolves a game definition by game type or ID.
 * Defaults to 'catch-brand' if the specified type does not exist or is empty.
 */
export function getGameDefinition(gameType?: string | null): GameDefinition {
  const normalized = normalizeGameType(gameType, DEFAULT_GAME_TYPE);
  if (GAME_REGISTRY[normalized]) {
    return GAME_REGISTRY[normalized];
  }
  return GAME_REGISTRY[DEFAULT_GAME_TYPE];
}

/**
 * Returns all registered game definitions.
 */
export function getAllGameDefinitions(): GameDefinition[] {
  return Object.values(GAME_REGISTRY);
}

/**
 * Returns only actively available game definitions.
 */
export function getAvailableGameDefinitions(): GameDefinition[] {
  return Object.values(GAME_REGISTRY).filter((game) => game.isAvailable);
}
