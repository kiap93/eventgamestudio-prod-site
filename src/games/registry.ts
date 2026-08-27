import { GameDefinition, CatchBrandConfig } from './types';
import { CatchBrandGame } from './catch-brand/CatchBrandGame';
import { MemoryMatchGame } from './memory-match/MemoryMatchGame';
import { MemoryMatchConfig } from './memory-match/types';

export const DEFAULT_GAME_TYPE = 'catch-brand';

export const GAME_REGISTRY: Record<string, GameDefinition<any>> = {
  'catch-brand': {
    id: 'catch-brand',
    name: 'Catch the Brand',
    shortName: 'Catch',
    description: 'Fast-paced arcade catcher! Catch good brand objects, dodge hazardous obstacles, and collect golden bonus items.',
    iconName: 'Gamepad2',
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
    name: 'Speed Reflex Tap',
    shortName: 'Reflex',
    description: 'Test your reflexes! Tap flashing brand symbols in rapid succession before time runs out.',
    iconName: 'Zap',
    category: 'reaction',
    minPlayers: 1,
    maxPlayers: 1,
    defaultDurationSeconds: 15,
    supportedInputTypes: ['touch', 'mouse'],
    defaultConfig: {
      gameDurationSeconds: 15,
      soundVolume: 0.8,
      soundEnabled: true,
      bgmEnabled: true,
    },
    component: CatchBrandGame, // Fallback until implemented
    isAvailable: false,
    comingSoon: true,
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
    component: CatchBrandGame, // Fallback until implemented
    isAvailable: false,
    comingSoon: true,
  },
};

/**
 * Safely resolves a game definition by game type or ID.
 * Defaults to 'catch-brand' if the specified type does not exist or is empty.
 */
export function getGameDefinition(gameType?: string | null): GameDefinition {
  if (!gameType) {
    return GAME_REGISTRY[DEFAULT_GAME_TYPE];
  }
  const normalized = gameType.trim().toLowerCase();
  return GAME_REGISTRY[normalized] || GAME_REGISTRY[DEFAULT_GAME_TYPE];
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
