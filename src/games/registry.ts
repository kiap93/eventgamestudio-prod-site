import { GameDefinition, CatchBrandConfig, DEFAULT_GAME_TYPE } from './types';
import { CatchBrandGame } from './catch-brand/CatchBrandGame';
import { MemoryMatchGame } from './memory-match/MemoryMatchGame';
import { MemoryMatchConfig } from './memory-match/types';
import { ReactionGame } from './reaction-time/ReactionGame';
import { DEFAULT_REACTION_CONFIG, ReactionGameConfig } from './reaction-time/types';
import { SpeedQuizUnavailablePlaceholder } from './speed-quiz/SpeedQuizUnavailablePlaceholder';

export { DEFAULT_GAME_TYPE };

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
    }
    return Reflect.get(target, prop);
  },
  has(target, prop: string | symbol) {
    if (typeof prop === 'string' && (prop === 'reaction-time' || prop === 'reaction-tap-f1-reflex')) {
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
  if (!gameType) {
    return GAME_REGISTRY[DEFAULT_GAME_TYPE];
  }
  const normalized = gameType.trim().toLowerCase().replace(/_/g, '-');
  if (GAME_REGISTRY[normalized]) {
    return GAME_REGISTRY[normalized];
  }
  if (normalized.includes('reaction') || normalized.includes('reflex')) {
    return GAME_REGISTRY['reaction-tap'];
  }
  if (normalized.includes('memory') || normalized.includes('match')) {
    return GAME_REGISTRY['memory-match'];
  }
  if (normalized.includes('catch') || normalized.includes('catcher') || normalized.includes('basket')) {
    return GAME_REGISTRY['catch-brand'];
  }
  if (normalized.includes('quiz') || normalized.includes('trivia')) {
    return GAME_REGISTRY['speed-quiz'];
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
