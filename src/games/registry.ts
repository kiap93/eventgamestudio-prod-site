import { GameDefinition, CatchBrandConfig } from './types';
import { CatchBrandGame } from './catch-brand/CatchBrandGame';
import { MemoryMatchGame } from './memory-match/MemoryMatchGame';
import { MemoryMatchConfig } from './memory-match/types';
import { GameTheme } from '../themes/types';

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
    customization: {
      supportsItems: true,
      itemsTabLabel: '2. Items',
      supportsCatcher: true,
      supportsCardBack: false,
      supportsPhysics: true,
      gameplayTabTitle: 'Match Dynamics & Speed',
      gameplayDescription: 'Adjust game session duration, falling velocity, and catcher responsiveness',
    },
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
    customization: {
      supportsItems: false,
      itemsTabLabel: '2. Symbols',
      supportsCatcher: false,
      supportsCardBack: false,
      supportsPhysics: false,
      gameplayTabTitle: 'Reflex Speed & Timer',
      gameplayDescription: 'Configure tap targets, reaction intervals, and score multipliers',
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
    customization: {
      supportsItems: true,
      itemsTabLabel: '2. Cards',
      supportsCatcher: false,
      supportsCardBack: true,
      supportsPhysics: false,
      gameplayTabTitle: 'Card Puzzle & Scoring Rules',
      gameplayDescription: 'Configure session timer, card grid resolution, mismatch reveal delay, and combo multipliers',
    },
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
    customization: {
      supportsItems: false,
      itemsTabLabel: '2. Questions',
      supportsCatcher: false,
      supportsCardBack: false,
      supportsPhysics: false,
      gameplayTabTitle: 'Quiz Rounds & Timing',
      gameplayDescription: 'Configure trivia question sets, time per question, and scoring bonuses',
    },
    component: CatchBrandGame, // Fallback until implemented
    isAvailable: false,
    comingSoon: true,
  },
};

/**
 * Safely resolves a game definition by game type or ID.
 * Defaults to 'catch-brand' if the specified type does not exist or is empty (for public / demo landing only).
 */
export function getGameDefinition(gameType?: string | null): GameDefinition {
  if (!gameType) {
    return GAME_REGISTRY[DEFAULT_GAME_TYPE];
  }
  const normalized = gameType.trim().toLowerCase();
  return GAME_REGISTRY[normalized] || GAME_REGISTRY[DEFAULT_GAME_TYPE];
}

/**
 * STRICTLY resolves a game definition by game type or ID.
 * Returns null if the specified type does not exist or is empty.
 * Use this in Theme Management, Theme Editor, and Game Details to prevent silent fallback!
 */
export function getGameDefinitionStrict(gameType?: string | null): GameDefinition | null {
  if (!gameType) return null;
  const normalized = gameType.trim().toLowerCase();
  return GAME_REGISTRY[normalized] || null;
}

/**
 * Resolves the game type string strictly from a GameTheme object or available games list.
 * Inspects theme.game_type, theme.game_slug, base_theme_id, and matched game IDs.
 */
export function resolveGameTypeFromTheme(
  theme?: GameTheme | null,
  availableGames?: Array<{ id: string; game_type?: string; slug?: string }>
): string | null {
  if (!theme) return null;

  // 1. Direct explicit game_type on theme
  if (theme.game_type) {
    const direct = theme.game_type.trim().toLowerCase();
    if (GAME_REGISTRY[direct]) return direct;
  }

  // 2. Explicit game_slug on theme
  if (theme.game_slug) {
    const slug = theme.game_slug.trim().toLowerCase();
    if (GAME_REGISTRY[slug]) return slug;
  }

  // 3. Lookup via theme.game_id in availableGames
  if (theme.game_id && Array.isArray(availableGames) && availableGames.length > 0) {
    const matchedGame = availableGames.find((g) => g.id === theme.game_id);
    if (matchedGame) {
      const gType = (matchedGame.game_type || matchedGame.slug || '').trim().toLowerCase();
      if (gType && GAME_REGISTRY[gType]) return gType;
    }
  }

  // 4. Memory Match base theme detection
  const baseId = (theme.base_theme_id || '').toLowerCase();
  const themeSlug = (theme.slug || '').toLowerCase();
  const themeName = (theme.name || '').toLowerCase();

  if (
    baseId === 'memory-carnival' ||
    baseId === 'memory-match' ||
    themeSlug.includes('memory') ||
    themeName.includes('memory match') ||
    themeName.includes('memory')
  ) {
    return 'memory-match';
  }

  // 5. Check if base_theme_id matches any registered game
  if (baseId && GAME_REGISTRY[baseId]) {
    return baseId;
  }

  // 6. If baseId is one of the classic catch presets
  if (
    baseId === 'carnival' ||
    baseId === 'christmas' ||
    baseId === 'chinese-new-year' ||
    baseId === 'halloween' ||
    baseId === 'mango' ||
    baseId === 'durian'
  ) {
    return 'catch-brand';
  }

  return null;
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

