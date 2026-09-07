import { GameTheme } from './types';
import { DEFAULT_REACTION_CONFIG } from '../games/reaction-time/types';

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

  background_url: '',
  basket_config: null,
  game_config: DEFAULT_REACTION_CONFIG as any,

  items_config: [],

  gameplay: {
    gameDurationSeconds: 45,
    speedMultiplier: 1.0,
    itemScale: 1.0,
  },

  screens: {
    gameplay: {
      background: {
        type: 'solid',
        color: '#070b14',
      },
    },
  },
};
