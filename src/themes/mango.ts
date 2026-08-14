import { GameTheme } from './types';
import { DEFAULT_GAME_LAYOUT } from './layout';

export const mangoTheme: GameTheme = {
  id: 'mango',
  base_theme_id: 'mango',
  name: 'Sweet Mango Catcher',
  slug: 'mango-harvest',
  description: 'Tropical orchard arcade game catching ripe golden mangoes and avoiding sour green ones.',
  status: 'active',
  is_active: false,

  branding: {
    gameTitle: 'MANGO ORCHARD HARVEST',
    subtitle: 'Catch sweet ripe yellow mangoes, avoid sour green ones!',
    logoUrl: null,
    clientLogoUrl: null,
  },

  background_url: 'theme_mango_bg',

  basket_config: {
    name: 'Fruit Crate',
    imageUrl: null,
    width: 140,
    height: 70,
    catchAreaRatio: 0.75,
    speed: 550,
    collisionWidthRatio: 0.75,
    collisionHeightRatio: 0.15,
    collisionOffsetYRatio: 0.32,
  },

  items_config: [
    {
      id: 'ripe_mango',
      name: 'Ripe Honey Mango',
      imageUrl: null,
      points: 10,
      speedMultiplier: 1.0,
      spawnWeight: 75,
      enabled: true,
      isHazard: false,
      isBonus: false,
    },
    {
      id: 'sour_mango',
      name: 'Sour Rotten Mango',
      imageUrl: null,
      points: -10,
      speedMultiplier: 1.15,
      spawnWeight: 20,
      enabled: true,
      isHazard: true,
      isBonus: false,
    },
    {
      id: 'golden_mango',
      name: 'Golden Alphonso Mango',
      imageUrl: null,
      points: 50,
      speedMultiplier: 1.3,
      spawnWeight: 5,
      enabled: true,
      isHazard: false,
      isBonus: true,
    },
  ],

  physics_config: {
    gameDurationSeconds: 20,
    baseFallSpeed: 500,
    fallSpeedMultiplier: 0.7,
    spawnIntervalMin: 550,
    spawnIntervalMax: 1000,
    difficultyStages: [
      { timeThreshold: 0, spawnInterval: 1000, speedMin: 350, speedMax: 500, hazardRatio: 0.2, bonusRatio: 0.05, stageName: 'Stage 1: Morning Grove' },
      { timeThreshold: 7, spawnInterval: 750, speedMin: 400, speedMax: 600, hazardRatio: 0.3, bonusRatio: 0.08, stageName: 'Stage 2: Sunny Breeze' },
      { timeThreshold: 14, spawnInterval: 550, speedMin: 500, speedMax: 700, hazardRatio: 0.4, bonusRatio: 0.12, stageName: 'Stage 3: Golden Harvest!' },
    ],
  },

  visuals_config: {
    particleGood: 'particle_leaf',
    particleBad: 'particle_spike',
    particleBonus: 'particle_gold',
    primaryColor: '#eab308',
    secondaryColor: '#f97316',
    accentColor: '#84cc16',
    textColor: '#ffffff',
    cardGoodBg: 'rgba(161, 98, 7, 0.7)',
    cardGoodBorder: 'rgba(234, 179, 8, 0.5)',
    cardBadBg: 'rgba(77, 124, 15, 0.7)',
    cardBadBorder: 'rgba(132, 204, 22, 0.5)',
    bgGradientFrom: '#0284c7',
    bgGradientTo: '#15803d',
  },

  sounds_config: { soundVolume: 0.8, soundEnabled: true, bgmEnabled: true },
  layout: DEFAULT_GAME_LAYOUT,

  // Backward compatibility
  background: '/assets/mango_bg.png',
  catcher: '/assets/fruit_crate.png',
  fallingObject: '/assets/ripe_mango.png',
  badFallingObject: '/assets/sour_mango.png',
  bonusFallingObject: '/assets/honey_mango.png',
  gameTitle: 'MANGO CATCHER',
  subtitle: 'Catch sweet ripe yellow mangoes, avoid sour green ones!',
  fallingObjectName: 'RIPE MANGO',
  badFallingObjectName: 'SOUR MANGO',
  bonusFallingObjectName: 'HONEY MANGO',
  catcherName: 'FRUIT CRATE',
  particles: {
    good: 'particle_mango_juice',
    bad: 'particle_leaf',
    bonus: 'particle_gold',
  },
  colors: {
    primary: '#eab308',
    secondary: '#84cc16',
    accent: '#f97316',
    cardGoodBg: 'rgba(113, 63, 18, 0.6)',
    cardGoodBorder: 'rgba(234, 179, 8, 0.5)',
    cardBadBg: 'rgba(20, 83, 45, 0.6)',
    cardBadBorder: 'rgba(132, 204, 22, 0.5)',
  },
};
