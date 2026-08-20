import { GameTheme } from './types';
import { DEFAULT_GAME_LAYOUT } from './layout';

export const christmasTheme: GameTheme = {
  id: 'christmas',
  base_theme_id: 'christmas',
  name: 'Christmas',
  slug: 'christmas-rush',
  description: 'Holiday festive arcade theme catching Christmas presents and avoiding lumps of coal.',
  status: 'active',

  branding: {
    gameTitle: 'CHRISTMAS GIFT RUSH',
    subtitle: 'Catch holiday presents, avoid lumps of coal!',
    logoUrl: null,
    clientLogoUrl: null,
  },

  background_url: 'theme_christmas_bg',

  basket_config: {
    name: "Santa's Sack",
    imageUrl: null,
    width: 140,
    height: 70,
    catchAreaRatio: 0.75,
    speed: 560,
    collisionWidthRatio: 0.75,
    collisionHeightRatio: 0.15,
    collisionOffsetYRatio: 0.32,
  },

  items_config: [
    {
      id: 'gift_box',
      name: 'Christmas Present',
      imageUrl: null,
      points: 10,
      speedMultiplier: 1.0,
      spawnWeight: 75,
      enabled: true,
      isHazard: false,
      isBonus: false,
    },
    {
      id: 'coal_lump',
      name: 'Lump of Coal',
      imageUrl: null,
      points: -10,
      speedMultiplier: 1.2,
      spawnWeight: 20,
      enabled: true,
      isHazard: true,
      isBonus: false,
    },
    {
      id: 'golden_star',
      name: 'Golden Star',
      imageUrl: null,
      points: 50,
      speedMultiplier: 1.35,
      spawnWeight: 5,
      enabled: true,
      isHazard: false,
      isBonus: true,
    },
  ],

  physics_config: {
    gameDurationSeconds: 20,
    baseFallSpeed: 500,
    fallSpeedMultiplier: 0.75,
    spawnIntervalMin: 500,
    spawnIntervalMax: 950,
    difficultyStages: [
      { timeThreshold: 0, spawnInterval: 950, speedMin: 350, speedMax: 500, hazardRatio: 0.2, bonusRatio: 0.05, stageName: 'Stage 1: Snow Flurry' },
      { timeThreshold: 7, spawnInterval: 700, speedMin: 420, speedMax: 620, hazardRatio: 0.3, bonusRatio: 0.08, stageName: 'Stage 2: Blizzard Rush' },
      { timeThreshold: 14, spawnInterval: 500, speedMin: 520, speedMax: 720, hazardRatio: 0.4, bonusRatio: 0.12, stageName: 'Stage 3: North Pole Storm!' },
    ],
  },

  visuals_config: {
    particleGood: 'particle_gold',
    particleBad: 'particle_spike',
    particleBonus: 'particle_gold',
    primaryColor: '#ef4444',
    secondaryColor: '#10b981',
    accentColor: '#fbbf24',
    textColor: '#ffffff',
    cardGoodBg: 'rgba(185, 28, 28, 0.7)',
    cardGoodBorder: 'rgba(239, 68, 68, 0.5)',
    cardBadBg: 'rgba(31, 41, 55, 0.7)',
    cardBadBorder: 'rgba(75, 85, 99, 0.5)',
    bgGradientFrom: '#0f172a',
    bgGradientTo: '#064e3b',
  },

  sounds_config: { soundVolume: 0.8, soundEnabled: true, bgmEnabled: true },
  layout: DEFAULT_GAME_LAYOUT,

  // Backward compatibility
  background: '/assets/christmas_bg.png',
  catcher: '/assets/santa_sack.png',
  fallingObject: '/assets/christmas_gift.png',
  badFallingObject: '/assets/coal.png',
  bonusFallingObject: '/assets/golden_star.png',
  gameTitle: 'CHRISTMAS CATCH',
  subtitle: 'Catch falling Christmas gifts, avoid lumps of coal!',
  fallingObjectName: 'GIFT BOX',
  badFallingObjectName: 'LUMP OF COAL',
  bonusFallingObjectName: 'GOLDEN STAR',
  catcherName: 'SANTA SACK',
  particles: {
    good: 'particle_snowflake',
    bad: 'particle_soot',
    bonus: 'particle_star',
  },
  colors: {
    primary: '#ef4444',
    secondary: '#22c55e',
    accent: '#fef08a',
    cardGoodBg: 'rgba(20, 83, 45, 0.6)',
    cardGoodBorder: 'rgba(34, 197, 94, 0.4)',
    cardBadBg: 'rgba(127, 29, 29, 0.6)',
    cardBadBorder: 'rgba(239, 68, 68, 0.4)',
  },
};
