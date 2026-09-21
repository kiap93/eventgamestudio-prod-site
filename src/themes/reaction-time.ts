import { GameTheme } from './types';
import { DEFAULT_REACTION_CONFIG } from '../games/reaction-time/types';
import { DEFAULT_GAME_LAYOUT } from './layout';

export const reactionTheme: GameTheme = {
  id: 'reaction-tap',
  base_theme_id: 'reaction-tap',
  name: 'Formula Reflex Challenge',
  slug: 'reaction-tap',
  game_id: 'reaction-tap-f1-reflex',
  game_slug: 'reaction-tap',
  game_type: 'reaction-tap',
  game_name: 'Reaction Game',
  description: 'Test your reaction speed in this Formula 1 style reaction lights challenge. When the lights go out, react as fast as you can!',
  status: 'active',
  is_default: false,
  is_system: true,
  is_system_theme: true,
  ownership_type: 'system',

  branding: {
    gameTitle: 'FORMULA REFLEX',
    subtitle: 'When the lights go out, react as fast as you can!',
    logoUrl: null,
    clientLogoUrl: null,
  },

  background_url: '/assets/games/reaction-tap/themes/default/background.png',
  basket_config: null,
  game_config: DEFAULT_REACTION_CONFIG as any,

  items_config: [],

  physics_config: {
    gameDurationSeconds: 45,
    baseFallSpeed: 500,
    fallSpeedMultiplier: 1.0,
    spawnIntervalMin: 500,
    spawnIntervalMax: 1000,
    difficultyStages: [],
  },

  visuals_config: {
    primaryColor: '#ef4444',
    secondaryColor: '#10b981',
    accentColor: '#38bdf8',
    textColor: '#ffffff',
    bgGradientFrom: '#070b14',
    bgGradientVia: '#0b1329',
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
    bgmEnabled: false,
  },

  layout: DEFAULT_GAME_LAYOUT,
};
