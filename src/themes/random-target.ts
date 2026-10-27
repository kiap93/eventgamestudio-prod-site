import { GameTheme } from './types';
import {
  DEFAULT_DESERT_CONFIG,
  DEFAULT_OCEAN_CONFIG,
  RandomTargetGameConfig,
  normalizeRandomTargetConfig,
} from '../games/random-target/types';
import { DEFAULT_MATCH3_LAYOUT } from './layout';

export { normalizeRandomTargetConfig };

export const desertQuickDrawTheme: GameTheme = {
  id: 'desert-quick-draw',
  name: 'Desert Quick Draw',
  slug: 'desert-quick-draw',
  game_id: 'random-target',
  game_name: 'Random Target Arcade',
  game_slug: 'random-target',
  game_type: 'random-target',
  description: 'Step into the wild west! Shoot bandit outlaws to earn points and avoid innocent town merchants in a fast-paced quick draw showdown.',
  status: 'active',
  is_default: true,
  is_system: true,
  is_system_theme: true,
  ownership_type: 'system',
  base_theme_id: 'desert-quick-draw',
  asset_theme_id: 'desert-quick-draw',

  branding: {
    gameTitle: 'DESERT QUICK DRAW',
    subtitle: 'Tap bandit outlaws to score! Avoid peaceful merchants!',
    logoUrl: null,
    clientLogoUrl: null,
  },

  background_url: '/assets/images/desert_arcade_bg_1792994317277.jpg',
  basket_config: null,
  items_config: [],
  game_config: DEFAULT_DESERT_CONFIG as unknown as Record<string, any>,

  physics_config: {
    gameDurationSeconds: 30,
    baseFallSpeed: 500,
    fallSpeedMultiplier: 1.0,
    spawnIntervalMin: 500,
    spawnIntervalMax: 1100,
    difficultyStages: [],
  },

  visuals_config: {
    primaryColor: '#f59e0b',
    secondaryColor: '#d97706',
    accentColor: '#ef4444',
    textColor: '#ffffff',
    bgGradientFrom: '#451a03',
    bgGradientVia: '#78350f',
    bgGradientTo: '#1c1917',
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
    gameTitle: { visible: true, x: 32, y: 2.5, width: 36 },
    footerSponsor: { visible: true, x: 24, y: 94, width: 52 },
    clientLogo: { visible: true, x: 2.5, y: 9.5, width: 16 },
  },
};

export const oceanTreasureHuntTheme: GameTheme = {
  id: 'ocean-treasure-hunt',
  name: 'Ocean Treasure Hunt',
  slug: 'ocean-treasure-hunt',
  game_id: 'random-target',
  game_name: 'Random Target Arcade',
  game_slug: 'random-target',
  game_type: 'random-target',
  description: 'Dive deep into tropical coral reefs! Hook glowing sunken treasure chests while dodging hungry predator sharks.',
  status: 'active',
  is_default: false,
  is_system: true,
  is_system_theme: true,
  ownership_type: 'system',
  base_theme_id: 'ocean-treasure-hunt',
  asset_theme_id: 'ocean-treasure-hunt',

  branding: {
    gameTitle: 'OCEAN TREASURE HUNT',
    subtitle: 'Cast your line for sunken treasure! Watch out for sharks!',
    logoUrl: null,
    clientLogoUrl: null,
  },

  background_url: '/assets/images/ocean_arcade_bg_1792994317724.jpg',
  basket_config: null,
  items_config: [],
  game_config: DEFAULT_OCEAN_CONFIG as unknown as Record<string, any>,

  physics_config: {
    gameDurationSeconds: 30,
    baseFallSpeed: 500,
    fallSpeedMultiplier: 1.0,
    spawnIntervalMin: 500,
    spawnIntervalMax: 1100,
    difficultyStages: [],
  },

  visuals_config: {
    primaryColor: '#0ea5e9',
    secondaryColor: '#06b6d4',
    accentColor: '#f43f5e',
    textColor: '#ffffff',
    bgGradientFrom: '#082f49',
    bgGradientVia: '#0c4a6e',
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
    gameTitle: { visible: true, x: 32, y: 2.5, width: 36 },
    footerSponsor: { visible: true, x: 24, y: 94, width: 52 },
    clientLogo: { visible: true, x: 2.5, y: 9.5, width: 16 },
  },
};

export const DEFAULT_RANDOM_TARGET_THEME = desertQuickDrawTheme;
