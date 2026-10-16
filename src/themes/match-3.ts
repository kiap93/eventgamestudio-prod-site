import { GameTheme } from './types';
import { DEFAULT_MATCH3_CONFIG } from '../games/match-3/types';
import { DEFAULT_MATCH3_LAYOUT } from './layout';

export const match3Theme: GameTheme = {
  id: 'match-3',
  base_theme_id: 'match-3',
  name: 'Match-3 Classic',
  slug: 'match-3',
  game_id: 'match-3',
  game_slug: 'match-3',
  game_type: 'match-3',
  game_name: 'Match-3',
  description: 'Swap matching tiles to create combinations, trigger special tiles, build combos, and achieve the highest score before time runs out.',
  status: 'active',
  is_default: true,
  is_system: true,
  is_system_theme: true,
  ownership_type: 'system',

  branding: {
    gameTitle: 'MATCH-3 CASCADE',
    subtitle: 'Swap tiles, trigger special combos, and build massive streaks!',
    logoUrl: null,
    clientLogoUrl: null,
  },

  background_url: '/assets/games/match-3/themes/default/background.png',
  basket_config: null,
  game_config: DEFAULT_MATCH3_CONFIG as any,

  items_config: [],

  physics_config: {
    gameDurationSeconds: 60,
    baseFallSpeed: 500,
    fallSpeedMultiplier: 1.0,
    spawnIntervalMin: 500,
    spawnIntervalMax: 1000,
    difficultyStages: [],
  },

  visuals_config: {
    primaryColor: '#f59e0b',
    secondaryColor: '#ec4899',
    accentColor: '#38bdf8',
    textColor: '#ffffff',
    bgGradientFrom: '#0f172a',
    bgGradientVia: '#1e1b4b',
    bgGradientTo: '#020617',
  },

  sounds_config: {
    catchGoodUrl: null,
    catchBadUrl: null,
    catchBonusUrl: null,
    gameStartUrl: null,
    gameOverUrl: null,
    bgmUrl: null,
    soundVolume: 0.8,
    soundEnabled: true,
    bgmEnabled: true,
  },

  layout: {
    ...DEFAULT_MATCH3_LAYOUT,
    scoreHud: { visible: true, x: 2.5, y: 2.5, width: 18 },
    timer: { visible: true, x: 79.5, y: 2.5, width: 18 },
    gameTitle: { visible: true, x: 35, y: 2.5, width: 30 },
    footerSponsor: { visible: true, x: 24, y: 94, width: 52 },
    clientLogo: { visible: true, x: 2.5, y: 8.5, width: 16 },
  },
};
