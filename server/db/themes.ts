import { getSupabaseServerClient, isSupabaseConfigured, isLocalFallbackAllowed } from '../supabase.js';
import {
  GameThemeRecord,
  ThemeBrandingConfig,
  ThemeBasketConfig,
  ThemeDropItem,
  ThemePhysicsConfig,
  ThemeVisualsConfig,
  ThemeSoundsConfig,
} from './types.js';
import { CATALOG_GAMES, getGameById } from './games.js';
import { dispatchNotificationEvent } from '../notifications/dispatcher.js';
import crypto from 'node:crypto';
import { recordDbOperation } from './dbMetrics.js';

export const localThemesCache = new Map<string, GameThemeRecord>();

// ============================================================================
// DEFAULT REFERENCE THEME TEMPLATES
// ============================================================================

export const NEUTRAL_GAME_THEME_DEFAULTS = {
  branding: {
    gameTitle: 'NEW ARCADE GAME',
    subtitle: 'Catch the falling items, avoid the hazards!',
    logoUrl: null,
    clientLogoUrl: null,
    primaryColor: '#f59e0b',
    secondaryColor: '#6366f1',
    fontFamily: 'Inter, sans-serif',
  },
  background_url: null,
  basket_config: {
    name: 'Catcher Basket',
    imageUrl: null,
    width: 140,
    height: 70,
    catchAreaRatio: 0.72,
    speed: 550,
    collisionWidthRatio: 0.72,
    collisionHeightRatio: 0.13,
    collisionOffsetYRatio: 0.34,
  },
  items_config: [
    {
      id: 'item_standard',
      name: 'Standard Item',
      imageUrl: null,
      points: 10,
      speedMultiplier: 1.0,
      spawnWeight: 75,
      enabled: true,
      isHazard: false,
      isBonus: false,
      collisionRadiusRatio: 0.3,
      collisionCenterXRatio: 0.5,
      collisionCenterYRatio: 0.54,
    },
    {
      id: 'item_hazard',
      name: 'Hazard Item',
      imageUrl: null,
      points: -10,
      speedMultiplier: 1.15,
      spawnWeight: 20,
      enabled: true,
      isHazard: true,
      isBonus: false,
      collisionRadiusRatio: 0.3,
      collisionCenterXRatio: 0.5,
      collisionCenterYRatio: 0.54,
    },
    {
      id: 'item_bonus',
      name: 'Bonus Item',
      imageUrl: null,
      points: 50,
      speedMultiplier: 1.3,
      spawnWeight: 5,
      enabled: true,
      isHazard: false,
      isBonus: true,
      collisionRadiusRatio: 0.3,
      collisionCenterXRatio: 0.5,
      collisionCenterYRatio: 0.54,
    },
  ],
  physics_config: {
    gameDurationSeconds: 20,
    baseFallSpeed: 500,
    fallSpeedMultiplier: 0.7,
    spawnIntervalMin: 550,
    spawnIntervalMax: 1000,
    difficultyStages: [
      {
        timeThreshold: 0,
        spawnInterval: 1000,
        speedMin: 350,
        speedMax: 500,
        hazardRatio: 0.2,
        bonusRatio: 0.05,
        stageName: 'Stage 1: Beginning',
      },
      {
        timeThreshold: 7,
        spawnInterval: 750,
        speedMin: 400,
        speedMax: 600,
        hazardRatio: 0.3,
        bonusRatio: 0.08,
        stageName: 'Stage 2: Accelerated',
      },
      {
        timeThreshold: 14,
        spawnInterval: 550,
        speedMin: 500,
        speedMax: 700,
        hazardRatio: 0.4,
        bonusRatio: 0.12,
        stageName: 'Stage 3: Finale Rush',
      },
    ],
  },
  visuals_config: {
    primaryColor: '#f59e0b',
    secondaryColor: '#6366f1',
    backgroundColor: '#0f172a',
    accentColor: '#10b981',
    fontFamily: 'Inter, sans-serif',
    hudStyle: 'arcade',
    particleEffect: 'confetti',
  },
  sounds_config: {
    bgmUrl: null,
    catchSoundUrl: null,
    hazardSoundUrl: null,
    bonusSoundUrl: null,
    gameOverSoundUrl: null,
    bgmVolume: 0.7,
    sfxVolume: 0.8,
  },
  layout: {
    clientLogo: { visible: true, x: 4, y: 4, width: 14 },
    scoreHud: { visible: true, x: 4, y: 15, width: 18 },
    timer: { visible: true, x: 78, y: 15, width: 18 },
    gameTitle: { visible: true, x: 36, y: 4, width: 28 },
    footerSponsor: { visible: true, x: 32, y: 92, width: 36 },
  },
};

export const DEFAULT_CARNIVAL_THEME: Omit<GameThemeRecord, 'id' | 'organization_id' | 'created_at' | 'updated_at'> = {
  name: 'Carnival',
  slug: 'carnival',
  description: 'Grand festive celebration theme: Catch golden carnival tickets and cosmic stars while dodging cursed hazard masks.',
  status: 'active',
  is_default: false,
  branding: {
    gameTitle: 'CARNIVAL FIESTA',
    subtitle: 'Catch golden tickets, avoid cursed masks!',
    logoUrl: null,
    clientLogoUrl: null,
  },
  background_url: '/assets/games/catch-brand/themes/carnival/background.png',
  basket_config: {
    name: 'Carnival Cart',
    imageUrl: '/assets/games/catch-brand/themes/carnival/basket.png',
    width: 140,
    height: 70,
    catchAreaRatio: 0.75,
    speed: 550,
    collisionWidthRatio: 0.7235,
    collisionHeightRatio: 0.13,
    collisionOffsetYRatio: 0.3394,
  },
  items_config: [
    {
      id: 'ticket',
      name: 'Golden Carnival Ticket',
      imageUrl: '/assets/games/catch-brand/themes/carnival/item_normal_01.png',
      points: 10,
      speedMultiplier: 1.0,
      spawnWeight: 75,
      enabled: true,
      isHazard: false,
      isBonus: false,
      collisionRadiusRatio: 0.3,
      collisionCenterXRatio: 0.5,
      collisionCenterYRatio: 0.54,
    },
    {
      id: 'mask',
      name: 'Carnival Cursed Mask',
      imageUrl: '/assets/games/catch-brand/themes/carnival/item_hazard_01.png',
      points: -10,
      speedMultiplier: 1.15,
      spawnWeight: 20,
      enabled: true,
      isHazard: true,
      isBonus: false,
      collisionRadiusRatio: 0.3,
      collisionCenterXRatio: 0.5,
      collisionCenterYRatio: 0.54,
    },
    {
      id: 'star',
      name: 'Cosmic Carnival Star',
      imageUrl: '/assets/games/catch-brand/themes/carnival/item_bonus_01.png',
      points: 50,
      speedMultiplier: 1.3,
      spawnWeight: 5,
      enabled: true,
      isHazard: false,
      isBonus: true,
      collisionRadiusRatio: 0.3,
      collisionCenterXRatio: 0.5,
      collisionCenterYRatio: 0.54,
    },
  ],
  physics_config: {
    gameDurationSeconds: 20,
    baseFallSpeed: 500,
    fallSpeedMultiplier: 0.7,
    spawnIntervalMin: 550,
    spawnIntervalMax: 1000,
    difficultyStages: [
      {
        timeThreshold: 0,
        spawnInterval: 1000,
        speedMin: 350,
        speedMax: 500,
        hazardRatio: 0.2,
        bonusRatio: 0.05,
        stageName: 'Stage 1: Carnival Gates',
      },
      {
        timeThreshold: 7,
        spawnInterval: 750,
        speedMin: 400,
        speedMax: 600,
        hazardRatio: 0.3,
        bonusRatio: 0.08,
        stageName: 'Stage 2: Midway Magic',
      },
      {
        timeThreshold: 14,
        spawnInterval: 550,
        speedMin: 500,
        speedMax: 700,
        hazardRatio: 0.4,
        bonusRatio: 0.12,
        stageName: 'Stage 3: Grand Gala Storm!',
      },
    ],
  },
  visuals_config: {
    particleGood: 'particle_gold',
    particleBad: 'particle_spike',
    particleBonus: 'particle_star',
    primaryColor: '#f59e0b',
    secondaryColor: '#ec4899',
    accentColor: '#fbbf24',
    textColor: '#ffffff',
    cardGoodBg: 'rgba(180, 83, 9, 0.7)',
    cardGoodBorder: 'rgba(245, 158, 11, 0.5)',
    cardBadBg: 'rgba(159, 18, 57, 0.7)',
    cardBadBorder: 'rgba(244, 63, 94, 0.5)',
    bgGradientFrom: '#1e1035',
    bgGradientVia: '#18122B',
    bgGradientTo: '#0f172a',
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
    clientLogo: { visible: true, x: 4, y: 4, width: 14 },
    scoreHud: { visible: true, x: 4, y: 15, width: 18 },
    timer: { visible: true, x: 78, y: 15, width: 18 },
    gameTitle: { visible: true, x: 36, y: 4, width: 28 },
    footerSponsor: { visible: true, x: 32, y: 92, width: 36 },
  },
};

export const DEFAULT_CATCH_BRAND_THEME: Omit<GameThemeRecord, 'id' | 'organization_id' | 'created_at' | 'updated_at'> = {
  name: 'Default',
  slug: 'default',
  description: 'Standard brand arcade theme: Catch good brand items and golden bonuses while dodging hazard obstacles.',
  status: 'active',
  is_default: true,
  branding: {
    gameTitle: 'CATCH THE BRAND',
    subtitle: 'Catch good brand items, avoid hazards!',
    logoUrl: null,
    clientLogoUrl: null,
  },
  background_url: '/assets/games/catch-brand/themes/default/background.png',
  basket_config: {
    name: 'Basket',
    imageUrl: '/assets/games/catch-brand/themes/default/basket.png',
    width: 140,
    height: 70,
    catchAreaRatio: 0.75,
    speed: 550,
    collisionWidthRatio: 0.7235,
    collisionHeightRatio: 0.13,
    collisionOffsetYRatio: 0.3394,
  },
  items_config: [
    {
      id: 'item_normal_01',
      name: 'Brand Good Item',
      imageUrl: '/assets/games/catch-brand/themes/default/item_normal_01.png',
      points: 10,
      speedMultiplier: 1.0,
      spawnWeight: 75,
      enabled: true,
      isHazard: false,
      isBonus: false,
      collisionRadiusRatio: 0.3,
      collisionCenterXRatio: 0.5,
      collisionCenterYRatio: 0.54,
    },
    {
      id: 'item_hazard_01',
      name: 'Hazard Obstacle',
      imageUrl: '/assets/games/catch-brand/themes/default/item_hazard_01.png',
      points: -10,
      speedMultiplier: 1.15,
      spawnWeight: 20,
      enabled: true,
      isHazard: true,
      isBonus: false,
      collisionRadiusRatio: 0.3,
      collisionCenterXRatio: 0.5,
      collisionCenterYRatio: 0.54,
    },
    {
      id: 'item_bonus_01',
      name: 'Golden Bonus Item',
      imageUrl: '/assets/games/catch-brand/themes/default/item_bonus_01.png',
      points: 50,
      speedMultiplier: 1.3,
      spawnWeight: 5,
      enabled: true,
      isHazard: false,
      isBonus: true,
      collisionRadiusRatio: 0.3,
      collisionCenterXRatio: 0.5,
      collisionCenterYRatio: 0.54,
    },
  ],
  physics_config: {
    gameDurationSeconds: 20,
    baseFallSpeed: 500,
    fallSpeedMultiplier: 0.7,
    spawnIntervalMin: 550,
    spawnIntervalMax: 1000,
    difficultyStages: [
      {
        timeThreshold: 0,
        spawnInterval: 1000,
        speedMin: 350,
        speedMax: 500,
        hazardRatio: 0.2,
        bonusRatio: 0.05,
        stageName: 'Stage 1: Warm Up',
      },
      {
        timeThreshold: 7,
        spawnInterval: 750,
        speedMin: 400,
        speedMax: 600,
        hazardRatio: 0.3,
        bonusRatio: 0.08,
        stageName: 'Stage 2: Acceleration',
      },
      {
        timeThreshold: 14,
        spawnInterval: 550,
        speedMin: 500,
        speedMax: 700,
        hazardRatio: 0.4,
        bonusRatio: 0.12,
        stageName: 'Stage 3: Turbo Rush!',
      },
    ],
  },
  visuals_config: {
    particleGood: 'particle_gold',
    particleBad: 'particle_spike',
    particleBonus: 'particle_star',
    primaryColor: '#f59e0b',
    secondaryColor: '#ec4899',
    accentColor: '#fbbf24',
    textColor: '#ffffff',
    cardGoodBg: 'rgba(180, 83, 9, 0.7)',
    cardGoodBorder: 'rgba(245, 158, 11, 0.5)',
    cardBadBg: 'rgba(159, 18, 57, 0.7)',
    cardBadBorder: 'rgba(244, 63, 94, 0.5)',
    bgGradientFrom: '#1e1035',
    bgGradientVia: '#18122B',
    bgGradientTo: '#0f172a',
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
    clientLogo: { visible: true, x: 4, y: 4, width: 14 },
    scoreHud: { visible: true, x: 4, y: 15, width: 18 },
    timer: { visible: true, x: 78, y: 15, width: 18 },
    gameTitle: { visible: true, x: 36, y: 4, width: 28 },
    footerSponsor: { visible: true, x: 32, y: 92, width: 36 },
  },
};

/**
 * Legacy alias for backward compatibility.
 * Mapped to DEFAULT_CATCH_BRAND_THEME to ensure no legacy path re-introduces Carnival.
 */
export const DEFAULT_DURIAN_THEME = DEFAULT_CATCH_BRAND_THEME;

export const DEFAULT_MEMORY_THEME: Omit<GameThemeRecord, 'id' | 'organization_id' | 'created_at' | 'updated_at'> = {
  name: 'Brand Memory Match',
  slug: 'memory-match',
  description: 'Classic memory concentration card match with 8 pairs, custom card-back styling, and combo multipliers.',
  status: 'active',
  is_default: true,
  branding: {
    gameTitle: 'MEMORY MATCH',
    subtitle: 'Flip cards, match 8 pairs, and beat the clock!',
    logoUrl: null,
    clientLogoUrl: null,
  },
  background_url: '/assets/games/memory-match/themes/default/background.png',
  basket_config: {} as any,
  items_config: [
    {
      id: 'pair_diamond',
      name: 'Diamond',
      imageUrl: null,
      points: 100,
      speedMultiplier: 1.0,
      spawnWeight: 1,
      enabled: true,
      isHazard: false,
      isBonus: false,
    },
    {
      id: 'pair_crown',
      name: 'Crown',
      imageUrl: null,
      points: 100,
      speedMultiplier: 1.0,
      spawnWeight: 1,
      enabled: true,
      isHazard: false,
      isBonus: false,
    },
    {
      id: 'pair_star',
      name: 'Star',
      imageUrl: null,
      points: 100,
      speedMultiplier: 1.0,
      spawnWeight: 1,
      enabled: true,
      isHazard: false,
      isBonus: false,
    },
    {
      id: 'pair_heart',
      name: 'Heart',
      imageUrl: null,
      points: 100,
      speedMultiplier: 1.0,
      spawnWeight: 1,
      enabled: true,
      isHazard: false,
      isBonus: false,
    },
    {
      id: 'pair_lightning',
      name: 'Lightning',
      imageUrl: null,
      points: 100,
      speedMultiplier: 1.0,
      spawnWeight: 1,
      enabled: true,
      isHazard: false,
      isBonus: false,
    },
    {
      id: 'pair_shield',
      name: 'Shield',
      imageUrl: null,
      points: 100,
      speedMultiplier: 1.0,
      spawnWeight: 1,
      enabled: true,
      isHazard: false,
      isBonus: false,
    },
    {
      id: 'pair_trophy',
      name: 'Trophy',
      imageUrl: null,
      points: 100,
      speedMultiplier: 1.0,
      spawnWeight: 1,
      enabled: true,
      isHazard: false,
      isBonus: false,
    },
    {
      id: 'pair_rocket',
      name: 'Rocket',
      imageUrl: null,
      points: 100,
      speedMultiplier: 1.0,
      spawnWeight: 1,
      enabled: true,
      isHazard: false,
      isBonus: false,
    },
  ],
  physics_config: {
    gameDurationSeconds: 45,
    baseFallSpeed: 0,
    fallSpeedMultiplier: 1.0,
    spawnIntervalMin: 0,
    spawnIntervalMax: 0,
    difficultyStages: [],
  },
  visuals_config: {
    cardBackUrl: null,
    particleGood: 'particle_gold',
    particleBad: 'particle_spike',
    particleBonus: 'particle_star',
    primaryColor: '#6366f1',
    secondaryColor: '#ec4899',
    accentColor: '#10b981',
    textColor: '#ffffff',
    cardGoodBg: 'rgba(99, 102, 241, 0.2)',
    cardGoodBorder: '#6366f1',
    cardBadBg: 'rgba(15, 23, 42, 0.95)',
    cardBadBorder: '#334155',
    bgGradientFrom: '#0f172a',
    bgGradientVia: '#1e1b4b',
    bgGradientTo: '#0f172a',
  },
  game_config: {
    cardBackUrl: null,
    pairs: [
      { id: 'pair_diamond', name: 'Diamond', imageUrl: null, points: 100 },
      { id: 'pair_crown', name: 'Crown', imageUrl: null, points: 100 },
      { id: 'pair_star', name: 'Star', imageUrl: null, points: 100 },
      { id: 'pair_heart', name: 'Heart', imageUrl: null, points: 100 },
      { id: 'pair_lightning', name: 'Lightning', imageUrl: null, points: 100 },
      { id: 'pair_shield', name: 'Shield', imageUrl: null, points: 100 },
      { id: 'pair_trophy', name: 'Trophy', imageUrl: null, points: 100 },
      { id: 'pair_rocket', name: 'Rocket', imageUrl: null, points: 100 },
    ],
    grid: {
      rows: 4,
      cols: 4,
    },
    gameplay: {
      gameDurationSeconds: 45,
      mismatchDelayMs: 850,
      matchPoints: 100,
      comboPoints: 30,
    },
  },
  sounds_config: {
    soundVolume: 0.8,
    soundEnabled: true,
    bgmEnabled: true,
  },
  layout: {
    clientLogo: { visible: true, x: 2.5, y: 8.5, width: 16 },
    scoreHud: { visible: true, x: 2.5, y: 2.5, width: 16 },
    movesHud: { visible: true, x: 21, y: 2.5, width: 16 },
    pairsHud: { visible: true, x: 39.5, y: 2.5, width: 16 },
    timer: { visible: true, x: 58, y: 2.5, width: 16 },
    gameTitle: { visible: true, x: 36, y: 8.5, width: 28 },
    footerSponsor: { visible: true, x: 24, y: 92.5, width: 52 },
    memoryCardBoard: { visible: true, x: 50, y: 53 },
  },
};

export const DEFAULT_MEMORY_CARNIVAL_THEME = DEFAULT_MEMORY_THEME;

export const DEFAULT_REACTION_THEME: Omit<GameThemeRecord, 'id' | 'organization_id' | 'created_at' | 'updated_at'> = {
  name: 'Formula Reflex Challenge',
  slug: 'reaction-tap',
  description: 'Test your reaction speed in this Formula 1 style reaction lights challenge. When the lights go out, react as fast as you can!',
  status: 'active',
  is_default: true,
  branding: {
    gameTitle: 'FORMULA REFLEX',
    subtitle: 'When the lights go out, react as fast as you can!',
    logoUrl: null,
    clientLogoUrl: null,
  },
  background_url: '/assets/games/reaction-tap/themes/default/background.png',
  basket_config: {} as any,
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
    bgmEnabled: true,
  },
  layout: {
    clientLogo: { visible: true, x: 4, y: 4, width: 14 },
    scoreHud: { visible: true, x: 4, y: 15, width: 18 },
    timer: { visible: true, x: 78, y: 15, width: 18 },
    gameTitle: { visible: true, x: 36, y: 4, width: 28 },
    footerSponsor: { visible: true, x: 32, y: 92, width: 36 },
  },
};

export const DEFAULT_MATCH3_THEME: Omit<GameThemeRecord, 'id' | 'organization_id' | 'created_at' | 'updated_at'> = {
  name: 'Match-3 Classic',
  slug: 'match-3',
  description: 'Swap matching tiles to create combinations, trigger special tiles, build combos, and achieve the highest score before time runs out.',
  status: 'active',
  is_default: true,
  branding: {
    gameTitle: 'MATCH-3 CASCADE',
    subtitle: 'Swap tiles, trigger special combos, and build massive streaks!',
    logoUrl: null,
    clientLogoUrl: null,
  },
  background_url: '/assets/games/match-3/themes/default/background.png',
  basket_config: null as any,
  items_config: [],
  physics_config: {
    gameDurationSeconds: 60,
    baseFallSpeed: 0,
    fallSpeedMultiplier: 1.0,
    spawnIntervalMin: 0,
    spawnIntervalMax: 0,
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
  game_config: {
    gameDurationSeconds: 60,
    rows: 8,
    cols: 8,
    tileTypesCount: 6,
    minimumMatch: 3,
    comboEnabled: true,
    specialTilesEnabled: true,
    cascadeEnabled: true,
    shuffleWhenNoMoves: true,
    objective: {
      type: 'score',
      targetScore: 10000,
      collectedCount: 0,
    },
    scoring: {
      match3Points: 100,
      match4Points: 180,
      match5Points: 300,
      rocketPoints: 250,
      bombPoints: 250,
      colorBombPoints: 500,
      comboMultipliers: { 1: 1.0, 2: 1.5, 3: 2.0, 4: 2.5, 5: 3.0 },
    },
    soundVolume: 0.8,
    soundEnabled: true,
    bgmEnabled: true,
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
    clientLogo: { visible: true, x: 4, y: 4, width: 14 },
    scoreHud: { visible: true, x: 4, y: 15, width: 18 },
    timer: { visible: true, x: 78, y: 15, width: 18 },
    gameTitle: { visible: true, x: 36, y: 4, width: 28 },
    footerSponsor: { visible: true, x: 32, y: 92, width: 36 },
  },
};

export const DEFAULT_MATCH3_CUTE_ANIMALS_THEME: Omit<GameThemeRecord, 'id' | 'organization_id' | 'created_at' | 'updated_at'> = {
  name: 'Match-3 Cute Animals',
  slug: 'match-3-cute-animals',
  description: 'Charming forest and arctic critters including bear, fox, bunny, penguin, panda, and chick.',
  status: 'active',
  is_default: false,
  branding: {
    gameTitle: 'CUTE ANIMALS',
    subtitle: 'Charming forest and arctic critters including bear, fox, bunny, penguin, panda, and chick.',
    logoUrl: null,
    clientLogoUrl: null,
  },
  background_url: '/assets/games/match-3/themes/cute-animals/background.png',
  basket_config: null as any,
  items_config: [],
  physics_config: { ...DEFAULT_MATCH3_THEME.physics_config },
  visuals_config: {
    primaryColor: '#10b981',
    secondaryColor: '#f59e0b',
    accentColor: '#fb7185',
    textColor: '#ffffff',
    bgGradientFrom: '#064e3b',
    bgGradientVia: '#065f46',
    bgGradientTo: '#022c22',
  },
  game_config: {
    ...DEFAULT_MATCH3_THEME.game_config,
    tileDefinitions: [
      { id: 'tile-01', name: 'Caramel Bear', color: '#8D5B36', bgColor: 'linear-gradient(135deg, #A76D42, #8D5B36)', borderColor: '#FCE5CD', glowColor: 'rgba(141, 91, 54, 0.5)', symbol: 'Circle', imageUrl: '/assets/games/match-3/themes/cute-animals/bear.png' },
      { id: 'tile-02', name: 'Sunny Fox', color: '#FF7832', bgColor: 'linear-gradient(135deg, #FF9457, #E05615)', borderColor: '#FCEADE', glowColor: 'rgba(255, 120, 50, 0.5)', symbol: 'Diamond', imageUrl: '/assets/games/match-3/themes/cute-animals/fox.png' },
      { id: 'tile-03', name: 'Sweet Bunny', color: '#FF85A1', bgColor: 'linear-gradient(135deg, #FFB7B2, #FF85A1)', borderColor: '#FFE5EC', glowColor: 'rgba(255, 133, 161, 0.5)', symbol: 'Heart', imageUrl: '/assets/games/match-3/themes/cute-animals/rabbit.png' },
      { id: 'tile-04', name: 'Chubby Penguin', color: '#1E293B', bgColor: 'linear-gradient(135deg, #334155, #0F172A)', borderColor: '#38BDF8', glowColor: 'rgba(56, 189, 248, 0.5)', symbol: 'Shield', imageUrl: '/assets/games/match-3/themes/cute-animals/penguin.png' },
      { id: 'tile-05', name: 'Happy Panda', color: '#18181B', bgColor: 'linear-gradient(135deg, #27272A, #09090B)', borderColor: '#E4E4E7', glowColor: 'rgba(244, 114, 182, 0.5)', symbol: 'Hexagon', imageUrl: '/assets/games/match-3/themes/cute-animals/panda.png' },
      { id: 'tile-06', name: 'Sunny Chick', color: '#FACC15', bgColor: 'linear-gradient(135deg, #FDE047, #EAB308)', borderColor: '#FEF08A', glowColor: 'rgba(250, 204, 21, 0.5)', symbol: 'Sun', imageUrl: '/assets/games/match-3/themes/cute-animals/chick.png' },
    ],
  },
  sounds_config: { ...DEFAULT_MATCH3_THEME.sounds_config },
  layout: { ...DEFAULT_MATCH3_THEME.layout },
};

export const DEFAULT_MATCH3_SUPER_HEROES_THEME: Omit<GameThemeRecord, 'id' | 'organization_id' | 'created_at' | 'updated_at'> = {
  name: 'Match-3 Super Heroes',
  slug: 'match-3-super-heroes',
  description: 'Dynamic masked heroes with vibrant power suits and glowing superhero emblems.',
  status: 'active',
  is_default: false,
  branding: {
    gameTitle: 'SUPER HEROES',
    subtitle: 'Dynamic masked heroes with vibrant power suits and glowing superhero emblems.',
    logoUrl: null,
    clientLogoUrl: null,
  },
  background_url: '/assets/games/match-3/themes/super-heroes/background.png',
  basket_config: null as any,
  items_config: [],
  physics_config: { ...DEFAULT_MATCH3_THEME.physics_config },
  visuals_config: {
    primaryColor: '#dc2626',
    secondaryColor: '#2563eb',
    accentColor: '#eab308',
    textColor: '#ffffff',
    bgGradientFrom: '#450a0a',
    bgGradientVia: '#1e1b4b',
    bgGradientTo: '#0f172a',
  },
  game_config: {
    ...DEFAULT_MATCH3_THEME.game_config,
    tileDefinitions: [
      { id: 'tile-01', name: 'Crimson Knight', color: '#DC2626', bgColor: 'linear-gradient(135deg, #EF4444, #B91C1C)', borderColor: '#FECACA', glowColor: 'rgba(220, 38, 38, 0.5)', symbol: 'Shield', imageUrl: '/assets/games/match-3/themes/super-heroes/crimson-knight.png' },
      { id: 'tile-02', name: 'Aero Blue', color: '#2563EB', bgColor: 'linear-gradient(135deg, #3B82F6, #1D4ED8)', borderColor: '#BFDBFE', glowColor: 'rgba(37, 99, 235, 0.5)', symbol: 'Zap', imageUrl: '/assets/games/match-3/themes/super-heroes/aero-blue.png' },
      { id: 'tile-03', name: 'Shadow Ninja', color: '#7C3AED', bgColor: 'linear-gradient(135deg, #8B5CF6, #6D28D9)', borderColor: '#DDD6FE', glowColor: 'rgba(124, 58, 237, 0.5)', symbol: 'Diamond', imageUrl: '/assets/games/match-3/themes/super-heroes/shadow-ninja.png' },
      { id: 'tile-04', name: 'Solar Shield', color: '#EAB308', bgColor: 'linear-gradient(135deg, #FACC15, #CA8A04)', borderColor: '#FEF08A', glowColor: 'rgba(234, 179, 8, 0.5)', symbol: 'Sun', imageUrl: '/assets/games/match-3/themes/super-heroes/solar-shield.png' },
      { id: 'tile-05', name: 'Emerald Titan', color: '#059669', bgColor: 'linear-gradient(135deg, #10B981, #047857)', borderColor: '#A7F3D0', glowColor: 'rgba(5, 150, 105, 0.5)', symbol: 'Hexagon', imageUrl: '/assets/games/match-3/themes/super-heroes/emerald-titan.png' },
      { id: 'tile-06', name: 'Cyber Pink', color: '#DB2777', bgColor: 'linear-gradient(135deg, #EC4899, #BE185D)', borderColor: '#FBCFE8', glowColor: 'rgba(219, 39, 119, 0.5)', symbol: 'Sparkles', imageUrl: '/assets/games/match-3/themes/super-heroes/cyber-pink.png' },
    ],
  },
  sounds_config: { ...DEFAULT_MATCH3_THEME.sounds_config },
  layout: { ...DEFAULT_MATCH3_THEME.layout },
};

export const DEFAULT_MATCH3_FANTASY_CREATURES_THEME: Omit<GameThemeRecord, 'id' | 'organization_id' | 'created_at' | 'updated_at'> = {
  name: 'Match-3 Fantasy Creatures',
  slug: 'match-3-fantasy-creatures',
  description: 'Enchanted creatures including baby dragon, pastel unicorn, bouncy slime, sparkle fairy, and mystic cat.',
  status: 'active',
  is_default: false,
  branding: {
    gameTitle: 'FANTASY CREATURES',
    subtitle: 'Enchanted creatures including baby dragon, pastel unicorn, bouncy slime, sparkle fairy, and mystic cat.',
    logoUrl: null,
    clientLogoUrl: null,
  },
  background_url: '/assets/games/match-3/themes/fantasy-creatures/background.png',
  basket_config: null as any,
  items_config: [],
  physics_config: { ...DEFAULT_MATCH3_THEME.physics_config },
  visuals_config: {
    primaryColor: '#8b5cf6',
    secondaryColor: '#10b981',
    accentColor: '#f59e0b',
    textColor: '#ffffff',
    bgGradientFrom: '#3b0764',
    bgGradientVia: '#581c87',
    bgGradientTo: '#1e1b4b',
  },
  game_config: {
    ...DEFAULT_MATCH3_THEME.game_config,
    tileDefinitions: [
      { id: 'tile-01', name: 'Baby Dragon', color: '#10B981', bgColor: 'linear-gradient(135deg, #34D399, #059669)', borderColor: '#A7F3D0', glowColor: 'rgba(16, 185, 129, 0.5)', symbol: 'Shield', imageUrl: '/assets/games/match-3/themes/fantasy-creatures/dragon.png' },
      { id: 'tile-02', name: 'Pastel Unicorn', color: '#F472B6', bgColor: 'linear-gradient(135deg, #FBCFE8, #F472B6)', borderColor: '#FDF2F8', glowColor: 'rgba(244, 114, 182, 0.5)', symbol: 'Heart', imageUrl: '/assets/games/match-3/themes/fantasy-creatures/unicorn.png' },
      { id: 'tile-03', name: 'Bouncy Slime', color: '#06B6D4', bgColor: 'linear-gradient(135deg, #22D3EE, #0891B2)', borderColor: '#CFFAFE', glowColor: 'rgba(6, 182, 212, 0.5)', symbol: 'Circle', imageUrl: '/assets/games/match-3/themes/fantasy-creatures/slime-monster.png' },
      { id: 'tile-04', name: 'Sparkle Fairy', color: '#F59E0B', bgColor: 'linear-gradient(135deg, #FBBF24, #D97706)', borderColor: '#FEF3C7', glowColor: 'rgba(245, 158, 11, 0.5)', symbol: 'Sparkles', imageUrl: '/assets/games/match-3/themes/fantasy-creatures/fairy.png' },
      { id: 'tile-05', name: 'Mystic Cat', color: '#6D28D9', bgColor: 'linear-gradient(135deg, #7C3AED, #5B21B6)', borderColor: '#EDE9FE', glowColor: 'rgba(109, 40, 217, 0.5)', symbol: 'Hexagon', imageUrl: '/assets/games/match-3/themes/fantasy-creatures/magical-cat.png' },
      { id: 'tile-06', name: 'Mystic Owl', color: '#B45309', bgColor: 'linear-gradient(135deg, #D97706, #92400E)', borderColor: '#FDE68A', glowColor: 'rgba(180, 83, 9, 0.5)', symbol: 'Sun', imageUrl: '/assets/games/match-3/themes/fantasy-creatures/owl.png' },
    ],
  },
  sounds_config: { ...DEFAULT_MATCH3_THEME.sounds_config },
  layout: { ...DEFAULT_MATCH3_THEME.layout },
};

export const DEFAULT_MATCH3_SPACE_EXPLORERS_THEME: Omit<GameThemeRecord, 'id' | 'organization_id' | 'created_at' | 'updated_at'> = {
  name: 'Match-3 Space Explorers',
  slug: 'match-3-space-explorers',
  description: 'Intergalactic adventures with Astro Kid, Zippy Alien, Rusty Rocket, Pluto Pal, and Nova Star.',
  status: 'active',
  is_default: false,
  branding: {
    gameTitle: 'SPACE EXPLORERS',
    subtitle: 'Intergalactic adventures with Astro Kid, Zippy Alien, Rusty Rocket, Pluto Pal, and Nova Star.',
    logoUrl: null,
    clientLogoUrl: null,
  },
  background_url: '/assets/games/match-3/themes/space-explorers/background.png',
  basket_config: null as any,
  items_config: [],
  physics_config: { ...DEFAULT_MATCH3_THEME.physics_config },
  visuals_config: {
    primaryColor: '#0284c7',
    secondaryColor: '#84cc16',
    accentColor: '#f59e0b',
    textColor: '#ffffff',
    bgGradientFrom: '#020617',
    bgGradientVia: '#0f172a',
    bgGradientTo: '#1e1b4b',
  },
  game_config: {
    ...DEFAULT_MATCH3_THEME.game_config,
    tileDefinitions: [
      { id: 'tile-01', name: 'Astro Kid', color: '#0284C7', bgColor: 'linear-gradient(135deg, #38BDF8, #0369A1)', borderColor: '#E0F2FE', glowColor: 'rgba(2, 132, 199, 0.5)', symbol: 'Circle', imageUrl: '/assets/games/match-3/themes/space-explorers/astronaut.png' },
      { id: 'tile-02', name: 'Zippy Alien', color: '#84CC16', bgColor: 'linear-gradient(135deg, #A3E635, #65A30D)', borderColor: '#ECFCCB', glowColor: 'rgba(132, 204, 22, 0.5)', symbol: 'Hexagon', imageUrl: '/assets/games/match-3/themes/space-explorers/alien.png' },
      { id: 'tile-03', name: 'Rusty Rocket', color: '#EF4444', bgColor: 'linear-gradient(135deg, #F87171, #DC2626)', borderColor: '#FEE2E2', glowColor: 'rgba(239, 68, 68, 0.5)', symbol: 'Zap', imageUrl: '/assets/games/match-3/themes/space-explorers/rocket-mascot.png' },
      { id: 'tile-04', name: 'Pluto Pal', color: '#7C3AED', bgColor: 'linear-gradient(135deg, #A78BFA, #6D28D9)', borderColor: '#DDD6FE', glowColor: 'rgba(124, 58, 237, 0.5)', symbol: 'Shield', imageUrl: '/assets/games/match-3/themes/space-explorers/planet-creature.png' },
      { id: 'tile-05', name: 'Nova Star', color: '#F59E0B', bgColor: 'linear-gradient(135deg, #FBBF24, #D97706)', borderColor: '#FEF3C7', glowColor: 'rgba(245, 158, 11, 0.5)', symbol: 'Star', imageUrl: '/assets/games/match-3/themes/space-explorers/star-character.png' },
      { id: 'tile-06', name: 'Cosmo Drone', color: '#0D9488', bgColor: 'linear-gradient(135deg, #2DD4BF, #0F766E)', borderColor: '#CCFBF1', glowColor: 'rgba(13, 148, 136, 0.5)', symbol: 'Diamond', imageUrl: '/assets/games/match-3/themes/space-explorers/cosmic-bot.png' },
    ],
  },
  sounds_config: { ...DEFAULT_MATCH3_THEME.sounds_config },
  layout: { ...DEFAULT_MATCH3_THEME.layout },
};

export const DEFAULT_MATCH3_FOOD_CHARACTERS_THEME: Omit<GameThemeRecord, 'id' | 'organization_id' | 'created_at' | 'updated_at'> = {
  name: 'Match-3 Food Characters',
  slug: 'match-3-food-characters',
  description: 'Delicious snack mascots: Benny Burger, Crispy Fries, Pip Pizza, Boba Bliss, Dottie Donut, and Sami Sushi.',
  status: 'active',
  is_default: false,
  branding: {
    gameTitle: 'FOOD CHARACTERS',
    subtitle: 'Delicious snack mascots: Benny Burger, Crispy Fries, Pip Pizza, Boba Bliss, Dottie Donut, and Sami Sushi.',
    logoUrl: null,
    clientLogoUrl: null,
  },
  background_url: '/assets/games/match-3/themes/food-characters/background.png',
  basket_config: null as any,
  items_config: [],
  physics_config: { ...DEFAULT_MATCH3_THEME.physics_config },
  visuals_config: {
    primaryColor: '#f59e0b',
    secondaryColor: '#ef4444',
    accentColor: '#ec4899',
    textColor: '#ffffff',
    bgGradientFrom: '#78350f',
    bgGradientVia: '#9a3412',
    bgGradientTo: '#451a03',
  },
  game_config: {
    ...DEFAULT_MATCH3_THEME.game_config,
    tileDefinitions: [
      { id: 'tile-01', name: 'Benny Burger', color: '#D97706', bgColor: 'linear-gradient(135deg, #F59E0B, #B45309)', borderColor: '#FEF3C7', glowColor: 'rgba(217, 119, 6, 0.5)', symbol: 'Circle', imageUrl: '/assets/games/match-3/themes/food-characters/burger.png' },
      { id: 'tile-02', name: 'Crispy Fries', color: '#DC2626', bgColor: 'linear-gradient(135deg, #EF4444, #B91C1C)', borderColor: '#FEE2E2', glowColor: 'rgba(220, 38, 38, 0.5)', symbol: 'Shield', imageUrl: '/assets/games/match-3/themes/food-characters/fries.png' },
      { id: 'tile-03', name: 'Pip Pizza', color: '#EA580C', bgColor: 'linear-gradient(135deg, #F97316, #C2410C)', borderColor: '#FFEDD5', glowColor: 'rgba(234, 88, 12, 0.5)', symbol: 'Diamond', imageUrl: '/assets/games/match-3/themes/food-characters/pizza.png' },
      { id: 'tile-04', name: 'Boba Bliss', color: '#8B5CF6', bgColor: 'linear-gradient(135deg, #A78BFA, #7C3AED)', borderColor: '#EDE9FE', glowColor: 'rgba(139, 92, 246, 0.5)', symbol: 'Droplet', imageUrl: '/assets/games/match-3/themes/food-characters/bubble-tea.png' },
      { id: 'tile-05', name: 'Dottie Donut', color: '#EC4899', bgColor: 'linear-gradient(135deg, #F472B6, #DB2777)', borderColor: '#FCE7F3', glowColor: 'rgba(236, 72, 153, 0.5)', symbol: 'Heart', imageUrl: '/assets/games/match-3/themes/food-characters/donut.png' },
      { id: 'tile-06', name: 'Sami Sushi', color: '#16A34A', bgColor: 'linear-gradient(135deg, #22C55E, #15803D)', borderColor: '#DCFCE7', glowColor: 'rgba(22, 163, 74, 0.5)', symbol: 'Hexagon', imageUrl: '/assets/games/match-3/themes/food-characters/sushi.png' },
    ],
  },
  sounds_config: { ...DEFAULT_MATCH3_THEME.sounds_config },
  layout: { ...DEFAULT_MATCH3_THEME.layout },
};

export const DEFAULT_MATCH3_OCEAN_FRIENDS_THEME: Omit<GameThemeRecord, 'id' | 'organization_id' | 'created_at' | 'updated_at'> = {
  name: 'Match-3 Ocean Friends',
  slug: 'match-3-ocean-friends',
  description: 'Aquatic marine companions: Splash Dolphin, Bubbles Whale, Inky Octopus, Shelly Turtle, Nemo, and Stell Starfish.',
  status: 'active',
  is_default: false,
  branding: {
    gameTitle: 'OCEAN FRIENDS',
    subtitle: 'Aquatic marine companions: Splash Dolphin, Bubbles Whale, Inky Octopus, Shelly Turtle, Nemo, and Stell Starfish.',
    logoUrl: null,
    clientLogoUrl: null,
  },
  background_url: '/assets/games/match-3/themes/ocean-friends/background.png',
  basket_config: null as any,
  items_config: [],
  physics_config: { ...DEFAULT_MATCH3_THEME.physics_config },
  visuals_config: {
    primaryColor: '#0284c7',
    secondaryColor: '#06b6d4',
    accentColor: '#f43f5e',
    textColor: '#ffffff',
    bgGradientFrom: '#083344',
    bgGradientVia: '#0e7490',
    bgGradientTo: '#042f2e',
  },
  game_config: {
    ...DEFAULT_MATCH3_THEME.game_config,
    tileDefinitions: [
      { id: 'tile-01', name: 'Splash Dolphin', color: '#0284C7', bgColor: 'linear-gradient(135deg, #38BDF8, #0369A1)', borderColor: '#E0F2FE', glowColor: 'rgba(2, 132, 199, 0.5)', symbol: 'Droplet', imageUrl: '/assets/games/match-3/themes/ocean-friends/dolphin.png' },
      { id: 'tile-02', name: 'Bubbles Whale', color: '#1D4ED8', bgColor: 'linear-gradient(135deg, #3B82F6, #1E40AF)', borderColor: '#DBEAFE', glowColor: 'rgba(29, 78, 216, 0.5)', symbol: 'Shield', imageUrl: '/assets/games/match-3/themes/ocean-friends/whale.png' },
      { id: 'tile-03', name: 'Inky Octopus', color: '#C026D3', bgColor: 'linear-gradient(135deg, #E879F9, #A21CAF)', borderColor: '#FAE8FF', glowColor: 'rgba(192, 38, 211, 0.5)', symbol: 'Circle', imageUrl: '/assets/games/match-3/themes/ocean-friends/octopus.png' },
      { id: 'tile-04', name: 'Shelly Turtle', color: '#059669', bgColor: 'linear-gradient(135deg, #10B981, #047857)', borderColor: '#D1FAE5', glowColor: 'rgba(5, 150, 105, 0.5)', symbol: 'Hexagon', imageUrl: '/assets/games/match-3/themes/ocean-friends/turtle.png' },
      { id: 'tile-05', name: 'Nemo Clownfish', color: '#EA580C', bgColor: 'linear-gradient(135deg, #F97316, #C2410C)', borderColor: '#FFEDD5', glowColor: 'rgba(234, 88, 12, 0.5)', symbol: 'Diamond', imageUrl: '/assets/games/match-3/themes/ocean-friends/clownfish.png' },
      { id: 'tile-06', name: 'Stell Starfish', color: '#E11D48', bgColor: 'linear-gradient(135deg, #FB7185, #BE123C)', borderColor: '#FFE4E6', glowColor: 'rgba(225, 29, 72, 0.5)', symbol: 'Star', imageUrl: '/assets/games/match-3/themes/ocean-friends/starfish.png' },
    ],
  },
  sounds_config: { ...DEFAULT_MATCH3_THEME.sounds_config },
  layout: { ...DEFAULT_MATCH3_THEME.layout },
};

export const DEFAULT_MATCH3_ROBOT_FRIENDS_THEME: Omit<GameThemeRecord, 'id' | 'organization_id' | 'created_at' | 'updated_at'> = {
  name: 'Match-3 Robot Friends',
  slug: 'match-3-robot-friends',
  description: 'Whimsical automata: Tin Toy Retro, Sparky Bulb, Rusty Cyclops, Bleep Egg, Cog Cruncher, and CRT Gizmo.',
  status: 'active',
  is_default: false,
  branding: {
    gameTitle: 'ROBOT FRIENDS',
    subtitle: 'Whimsical automata: Tin Toy Retro, Sparky Bulb, Rusty Cyclops, Bleep Egg, Cog Cruncher, and CRT Gizmo.',
    logoUrl: null,
    clientLogoUrl: null,
  },
  background_url: '/assets/games/match-3/themes/robot-friends/background.png',
  basket_config: null as any,
  items_config: [],
  physics_config: { ...DEFAULT_MATCH3_THEME.physics_config },
  visuals_config: {
    primaryColor: '#0ea5e9',
    secondaryColor: '#eab308',
    accentColor: '#a855f7',
    textColor: '#ffffff',
    bgGradientFrom: '#0f172a',
    bgGradientVia: '#1e293b',
    bgGradientTo: '#020617',
  },
  game_config: {
    ...DEFAULT_MATCH3_THEME.game_config,
    tileDefinitions: [
      { id: 'tile-01', name: 'Tin Toy Retro', color: '#475569', bgColor: 'linear-gradient(135deg, #64748B, #334155)', borderColor: '#E2E8F0', glowColor: 'rgba(71, 85, 105, 0.5)', symbol: 'Hexagon', imageUrl: '/assets/games/match-3/themes/robot-friends/retro-bot.png' },
      { id: 'tile-02', name: 'Sparky Bulb', color: '#CA8A04', bgColor: 'linear-gradient(135deg, #EAB308, #A16207)', borderColor: '#FEF9C3', glowColor: 'rgba(202, 138, 4, 0.5)', symbol: 'Zap', imageUrl: '/assets/games/match-3/themes/robot-friends/sparky.png' },
      { id: 'tile-03', name: 'Rusty Cyclops', color: '#C2410C', bgColor: 'linear-gradient(135deg, #EA580C, #9A3412)', borderColor: '#FFEDD5', glowColor: 'rgba(194, 65, 12, 0.5)', symbol: 'Circle', imageUrl: '/assets/games/match-3/themes/robot-friends/rusty.png' },
      { id: 'tile-04', name: 'Bleep Egg', color: '#0284C7', bgColor: 'linear-gradient(135deg, #38BDF8, #0369A1)', borderColor: '#E0F2FE', glowColor: 'rgba(2, 132, 199, 0.5)', symbol: 'Shield', imageUrl: '/assets/games/match-3/themes/robot-friends/bleep.png' },
      { id: 'tile-05', name: 'Cog Cruncher', color: '#7E22CE', bgColor: 'linear-gradient(135deg, #9333EA, #6B21A8)', borderColor: '#F3E8FF', glowColor: 'rgba(126, 34, 206, 0.5)', symbol: 'Diamond', imageUrl: '/assets/games/match-3/themes/robot-friends/cruncher.png' },
      { id: 'tile-06', name: 'CRT Gizmo', color: '#0F766E', bgColor: 'linear-gradient(135deg, #14B8A6, #0D9488)', borderColor: '#CCFBF1', glowColor: 'rgba(15, 118, 110, 0.5)', symbol: 'Sun', imageUrl: '/assets/games/match-3/themes/robot-friends/gizmo.png' },
    ],
  },
  sounds_config: { ...DEFAULT_MATCH3_THEME.sounds_config },
  layout: { ...DEFAULT_MATCH3_THEME.layout },
};

export const DEFAULT_MATCH3_PRINCESS_FAIRYTALE_THEME: Omit<GameThemeRecord, 'id' | 'organization_id' | 'created_at' | 'updated_at'> = {
  name: 'Match-3 Princess Fairytale',
  slug: 'match-3-princess-fairytale',
  description: 'Royal storybook kingdom with Princess Rosella, Imperial Crown, Magic Castle, Royal Unicorn, and Frog Prince.',
  status: 'active',
  is_default: false,
  branding: {
    gameTitle: 'PRINCESS FAIRYTALE',
    subtitle: 'Royal storybook kingdom with Princess Rosella, Imperial Crown, Magic Castle, Royal Unicorn, and Frog Prince.',
    logoUrl: null,
    clientLogoUrl: null,
  },
  background_url: '/assets/games/match-3/themes/princess-fairytale/background.png',
  basket_config: null as any,
  items_config: [],
  physics_config: { ...DEFAULT_MATCH3_THEME.physics_config },
  visuals_config: {
    primaryColor: '#ec4899',
    secondaryColor: '#f59e0b',
    accentColor: '#a855f7',
    textColor: '#ffffff',
    bgGradientFrom: '#4a044e',
    bgGradientVia: '#701a75',
    bgGradientTo: '#1f1325',
  },
  game_config: {
    ...DEFAULT_MATCH3_THEME.game_config,
    tileDefinitions: [
      { id: 'tile-01', name: 'Princess Rosella', color: '#E11D48', bgColor: 'linear-gradient(135deg, #FB7185, #BE123C)', borderColor: '#FFE4E6', glowColor: 'rgba(225, 29, 72, 0.5)', symbol: 'Heart', imageUrl: '/assets/games/match-3/themes/princess-fairytale/princess.png' },
      { id: 'tile-02', name: 'Imperial Crown', color: '#D97706', bgColor: 'linear-gradient(135deg, #F59E0B, #B45309)', borderColor: '#FEF3C7', glowColor: 'rgba(217, 119, 6, 0.5)', symbol: 'Crown', imageUrl: '/assets/games/match-3/themes/princess-fairytale/royal-crown.png' },
      { id: 'tile-03', name: 'Fairytale Castle', color: '#7E22CE', bgColor: 'linear-gradient(135deg, #A855F7, #6B21A8)', borderColor: '#F3E8FF', glowColor: 'rgba(126, 34, 206, 0.5)', symbol: 'Shield', imageUrl: '/assets/games/match-3/themes/princess-fairytale/magic-castle.png' },
      { id: 'tile-04', name: 'Royal Unicorn', color: '#DB2777', bgColor: 'linear-gradient(135deg, #F472B6, #BE185D)', borderColor: '#FCE7F3', glowColor: 'rgba(219, 39, 119, 0.5)', symbol: 'Sparkles', imageUrl: '/assets/games/match-3/themes/princess-fairytale/royal-unicorn.png' },
      { id: 'tile-05', name: 'Frog Prince', color: '#15803D', bgColor: 'linear-gradient(135deg, #22C55E, #166534)', borderColor: '#DCFCE7', glowColor: 'rgba(21, 128, 61, 0.5)', symbol: 'Circle', imageUrl: '/assets/games/match-3/themes/princess-fairytale/frog-prince.png' },
      { id: 'tile-06', name: 'Magic Mirror', color: '#0284C7', bgColor: 'linear-gradient(135deg, #38BDF8, #0369A1)', borderColor: '#E0F2FE', glowColor: 'rgba(2, 132, 199, 0.5)', symbol: 'Diamond', imageUrl: '/assets/games/match-3/themes/princess-fairytale/magic-mirror.png' },
    ],
  },
  sounds_config: { ...DEFAULT_MATCH3_THEME.sounds_config },
  layout: { ...DEFAULT_MATCH3_THEME.layout },
};

export function getDefaultThemeForGameType(gameType?: string | null): Omit<GameThemeRecord, 'id' | 'organization_id' | 'created_at' | 'updated_at'> {
  const clean = (gameType || '').toLowerCase().trim();
  if (
    clean === 'match-3' ||
    clean === 'match3' ||
    clean.includes('match-3')
  ) {
    return DEFAULT_MATCH3_THEME;
  }
  if (
    clean === 'reaction-tap' ||
    clean === 'reaction-time' ||
    clean === 'reaction-tap-f1-reflex' ||
    clean.includes('reaction') ||
    clean.includes('reflex') ||
    clean.includes('formula')
  ) {
    return DEFAULT_REACTION_THEME;
  }
  if (clean === 'memory-match' || clean.includes('memory')) {
    return DEFAULT_MEMORY_THEME;
  }
  return DEFAULT_CATCH_BRAND_THEME;
}

export const PRESET_THEMES: Array<Omit<GameThemeRecord, 'id' | 'organization_id' | 'created_at' | 'updated_at'>> = [
  DEFAULT_CATCH_BRAND_THEME,
  DEFAULT_CARNIVAL_THEME,
  DEFAULT_MEMORY_CARNIVAL_THEME,
  DEFAULT_REACTION_THEME,
  DEFAULT_MATCH3_THEME,
  DEFAULT_MATCH3_CUTE_ANIMALS_THEME,
  DEFAULT_MATCH3_SUPER_HEROES_THEME,
  DEFAULT_MATCH3_FANTASY_CREATURES_THEME,
  DEFAULT_MATCH3_SPACE_EXPLORERS_THEME,
  DEFAULT_MATCH3_FOOD_CHARACTERS_THEME,
  DEFAULT_MATCH3_OCEAN_FRIENDS_THEME,
  DEFAULT_MATCH3_ROBOT_FRIENDS_THEME,
  DEFAULT_MATCH3_PRINCESS_FAIRYTALE_THEME,
  {
    name: 'Christmas Gift Rush',
    slug: 'christmas-rush',
    description: 'Catch holiday presents in Santa sack, beware of lumps of coal!',
    status: 'active',
    branding: {
      gameTitle: 'CHRISTMAS GIFT RUSH',
      subtitle: 'Catch holiday presents, avoid lumps of coal!',
      logoUrl: null,
      clientLogoUrl: null,
    },
    background_url: '/assets/games/catch-brand/themes/christmas/background.png',
    basket_config: {
      name: "Santa's Sack",
      imageUrl: '/assets/games/catch-brand/themes/christmas/basket.png',
      width: 140,
      height: 70,
      catchAreaRatio: 0.75,
      speed: 560,
    },
    items_config: [
      {
        id: 'gift_box',
        name: 'Christmas Present',
        imageUrl: '/assets/games/catch-brand/themes/christmas/item_normal_01.png',
        points: 10,
        speedMultiplier: 1.0,
        spawnWeight: 75,
        enabled: true,
        isHazard: false,
        isBonus: false,
      },
      {
        id: 'coal_lump',
        name: 'Naughty Snowball',
        imageUrl: '/assets/games/catch-brand/themes/christmas/item_hazard_01.png',
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
        imageUrl: '/assets/games/catch-brand/themes/christmas/item_bonus_01.png',
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
  },
  {
    name: 'Lunar New Year Fortune',
    slug: 'cny-fortune',
    description: 'Catch lucky red packets and gold ingots, dodge fiery firecrackers!',
    status: 'active',
    branding: {
      gameTitle: 'LUNAR NEW YEAR FORTUNE',
      subtitle: 'Catch lucky red packets, avoid exploding firecrackers!',
      logoUrl: null,
      clientLogoUrl: null,
    },
    background_url: '/assets/games/catch-brand/themes/cny/background.png',
    basket_config: {
      name: 'Fortune Basket',
      imageUrl: '/assets/games/catch-brand/themes/cny/basket.png',
      width: 140,
      height: 70,
      catchAreaRatio: 0.75,
      speed: 550,
    },
    items_config: [
      {
        id: 'red_packet',
        name: 'Red Packet (Angpow)',
        imageUrl: '/assets/games/catch-brand/themes/cny/item_normal_01.png',
        points: 10,
        speedMultiplier: 1.0,
        spawnWeight: 75,
        enabled: true,
        isHazard: false,
        isBonus: false,
      },
      {
        id: 'firecracker',
        name: 'Exploding Firecracker',
        imageUrl: '/assets/games/catch-brand/themes/cny/item_hazard_01.png',
        points: -10,
        speedMultiplier: 1.25,
        spawnWeight: 20,
        enabled: true,
        isHazard: true,
        isBonus: false,
      },
      {
        id: 'gold_ingot',
        name: 'Gold Ingot (Yuanbao)',
        imageUrl: '/assets/games/catch-brand/themes/cny/item_bonus_01.png',
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
      baseFallSpeed: 520,
      fallSpeedMultiplier: 0.7,
      spawnIntervalMin: 550,
      spawnIntervalMax: 1000,
      difficultyStages: [
        { timeThreshold: 0, spawnInterval: 1000, speedMin: 350, speedMax: 500, hazardRatio: 0.2, bonusRatio: 0.05, stageName: 'Stage 1: Spring Blessing' },
        { timeThreshold: 7, spawnInterval: 750, speedMin: 420, speedMax: 600, hazardRatio: 0.3, bonusRatio: 0.08, stageName: 'Stage 2: Dragon Dance' },
        { timeThreshold: 14, spawnInterval: 550, speedMin: 520, speedMax: 720, hazardRatio: 0.4, bonusRatio: 0.12, stageName: 'Stage 3: Fortune Cascade!' },
      ],
    },
    visuals_config: {
      particleGood: 'particle_gold',
      particleBad: 'particle_spike',
      particleBonus: 'particle_gold',
      primaryColor: '#dc2626',
      secondaryColor: '#eab308',
      accentColor: '#fde047',
      textColor: '#ffffff',
      cardGoodBg: 'rgba(153, 27, 27, 0.7)',
      cardGoodBorder: 'rgba(220, 38, 38, 0.5)',
      cardBadBg: 'rgba(69, 10, 10, 0.7)',
      cardBadBorder: 'rgba(185, 28, 28, 0.5)',
      bgGradientFrom: '#450a0a',
      bgGradientTo: '#991b1b',
    },
    sounds_config: { soundVolume: 0.8, soundEnabled: true, bgmEnabled: true },
  },
  {
    name: 'Spooky Halloween',
    slug: 'halloween-spooky',
    description: 'Catch delicious Halloween candy in a pumpkin bucket, avoid scary spiders!',
    status: 'active',
    branding: {
      gameTitle: 'SPOOKY HALLOWEEN CATCH',
      subtitle: 'Catch tasty candies, avoid venomous spiders!',
      logoUrl: null,
      clientLogoUrl: null,
    },
    background_url: '/assets/games/catch-brand/themes/halloween/background.png',
    basket_config: {
      name: 'Jack-o-Lantern Bucket',
      imageUrl: '/assets/games/catch-brand/themes/halloween/basket.png',
      width: 140,
      height: 70,
      catchAreaRatio: 0.75,
      speed: 550,
    },
    items_config: [
      {
        id: 'spooky_candy',
        name: 'Sweet Candy',
        imageUrl: '/assets/games/catch-brand/themes/halloween/item_normal_01.png',
        points: 10,
        speedMultiplier: 1.0,
        spawnWeight: 75,
        enabled: true,
        isHazard: false,
        isBonus: false,
      },
      {
        id: 'creepy_spider',
        name: 'Creepy Spider',
        imageUrl: '/assets/games/catch-brand/themes/halloween/item_hazard_01.png',
        points: -10,
        speedMultiplier: 1.2,
        spawnWeight: 20,
        enabled: true,
        isHazard: true,
        isBonus: false,
      },
      {
        id: 'gold_skull',
        name: 'Golden Skull',
        imageUrl: '/assets/games/catch-brand/themes/halloween/item_bonus_01.png',
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
        { timeThreshold: 0, spawnInterval: 1000, speedMin: 350, speedMax: 500, hazardRatio: 0.2, bonusRatio: 0.05, stageName: 'Stage 1: Twilight Woods' },
        { timeThreshold: 7, spawnInterval: 750, speedMin: 400, speedMax: 600, hazardRatio: 0.3, bonusRatio: 0.08, stageName: 'Stage 2: Witching Hour' },
        { timeThreshold: 14, spawnInterval: 550, speedMin: 500, speedMax: 700, hazardRatio: 0.4, bonusRatio: 0.12, stageName: 'Stage 3: Full Moon Fright!' },
      ],
    },
    visuals_config: {
      particleGood: 'particle_gold',
      particleBad: 'particle_spike',
      particleBonus: 'particle_gold',
      primaryColor: '#ea580c',
      secondaryColor: '#a855f7',
      accentColor: '#facc15',
      textColor: '#ffffff',
      cardGoodBg: 'rgba(124, 45, 18, 0.7)',
      cardGoodBorder: 'rgba(234, 88, 12, 0.5)',
      cardBadBg: 'rgba(76, 29, 149, 0.7)',
      cardBadBorder: 'rgba(168, 85, 247, 0.5)',
      bgGradientFrom: '#111827',
      bgGradientTo: '#4c1d95',
    },
    sounds_config: { soundVolume: 0.8, soundEnabled: true, bgmEnabled: true },
  },
  {
    name: 'Mango Orchard Harvest',
    slug: 'mango-festival',
    description: 'Catch sweet honey mangoes in a wooden crate, dodge sour rotten ones!',
    status: 'active',
    branding: {
      gameTitle: 'MANGO ORCHARD HARVEST',
      subtitle: 'Catch sweet ripe mangoes, avoid sour green ones!',
      logoUrl: null,
      clientLogoUrl: null,
    },
    background_url: '/assets/games/catch-brand/themes/mango/background.png',
    basket_config: {
      name: 'Fruit Crate',
      imageUrl: '/assets/games/catch-brand/themes/mango/basket.png',
      width: 140,
      height: 70,
      catchAreaRatio: 0.75,
      speed: 550,
    },
    items_config: [
      {
        id: 'ripe_mango',
        name: 'Ripe Honey Mango',
        imageUrl: '/assets/games/catch-brand/themes/mango/item_normal_01.png',
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
        imageUrl: '/assets/games/catch-brand/themes/mango/item_hazard_01.png',
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
        imageUrl: '/assets/games/catch-brand/themes/mango/item_bonus_01.png',
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
  },
];

// ============================================================================
// THEME ENRICHMENT & METADATA RESOLUTION
// ============================================================================

export function isUUID(str: string | null | undefined): boolean {
  if (!str || typeof str !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str.trim());
}

/**
 * Authoritatively resolves the server game type ('match-3' | 'memory-match' | 'reaction-tap' | 'speed-quiz' | 'catch-brand')
 * from raw game_type, slug, or name metadata.
 */
export function resolveServerGameType(
  rawGameType?: string | null | any,
  rawSlug?: string | null,
  rawName?: string | null,
  themeOrConfig?: any
): string {
  // If first parameter is an object (e.g. resolveServerGameType(theme)):
  if (rawGameType && typeof rawGameType === 'object') {
    themeOrConfig = rawGameType;
    rawGameType = (themeOrConfig as any).game_type;
    rawSlug = (themeOrConfig as any).game_slug || (themeOrConfig as any).slug || (themeOrConfig as any).base_theme_id;
    rawName = (themeOrConfig as any).name;
  }

  // 1. Check themeOrConfig / game_config properties FIRST
  const tc = themeOrConfig || (typeof rawGameType === 'object' ? rawGameType : null);
  const gc = tc?.game_config || tc;
  if (gc && typeof gc === 'object') {
    if (
      Array.isArray(gc.tileDefinitions) ||
      gc.match3Config !== undefined ||
      gc.minimumMatch !== undefined ||
      gc.cascadeEnabled !== undefined ||
      gc.specialTilesEnabled !== undefined ||
      gc.tileTypesCount !== undefined ||
      gc.scoring?.match3Points !== undefined ||
      gc.scoring?.rocketPoints !== undefined ||
      gc.screens?.start?.gameType === 'match-3' ||
      gc.screens?.result?.gameType === 'match-3'
    ) {
      return 'match-3';
    }
    if (
      gc.cardPairs ||
      gc.memoryConfig ||
      gc.screens?.start?.gameType === 'memory-match' ||
      gc.screens?.result?.gameType === 'memory-match'
    ) {
      return 'memory-match';
    }
    if (
      gc.reactionConfig ||
      gc.lightsCount !== undefined ||
      gc.screens?.start?.gameType === 'reaction-tap' ||
      gc.screens?.start?.gameType === 'reaction-time' ||
      gc.screens?.result?.gameType === 'reaction-tap' ||
      gc.screens?.result?.gameType === 'reaction-time'
    ) {
      return 'reaction-tap';
    }
  }

  // 2. Check base_theme_id, id, game_id on theme object if available
  if (tc && typeof tc === 'object') {
    const baseId = String(tc.base_theme_id || '').toLowerCase().trim();
    if (baseId === 'match-3' || baseId === 'match3' || baseId.includes('match-3')) return 'match-3';
    if (baseId === 'memory-match' || baseId === 'memory-carnival') return 'memory-match';
    if (baseId === 'reaction-tap' || baseId === 'reaction-time') return 'reaction-tap';

    const tId = String(tc.id || '').toLowerCase().trim();
    if (tId === 'match-3' || tId === 'match3' || tId.includes('match-3')) return 'match-3';
    if (tId === 'memory-match' || tId === 'memory-carnival') return 'memory-match';
    if (tId === 'reaction-tap' || tId === 'reaction-time') return 'reaction-tap';

    const gId = String(tc.game_id || '').toLowerCase().trim();
    if (gId === 'match-3' || gId === 'match3' || gId.includes('match-3')) return 'match-3';
    if (gId === 'memory-match' || gId === 'memory-carnival') return 'memory-match';
    if (gId === 'reaction-tap' || gId === 'reaction-time') return 'reaction-tap';
  }

  const cleanType = String(rawGameType || '').trim().toLowerCase();
  const cleanSlug = String(rawSlug || '').trim().toLowerCase();
  const cleanName = String(rawName || '').trim().toLowerCase();

  if (
    cleanType === 'match-3' ||
    cleanType === 'match3' ||
    cleanType.includes('match-3') ||
    cleanType.includes('match3') ||
    cleanSlug === 'match-3' ||
    cleanSlug === 'match3' ||
    cleanSlug.includes('match-3') ||
    cleanSlug.includes('match3') ||
    cleanSlug.includes('cascade') ||
    cleanName.includes('match-3') ||
    cleanName.includes('match 3') ||
    cleanName.includes('match3') ||
    cleanName.includes('cascade')
  ) {
    return 'match-3';
  }

  if (
    cleanType === 'reaction-tap' ||
    cleanType === 'reaction-time' ||
    cleanType.includes('reaction') ||
    cleanType.includes('reflex') ||
    cleanSlug === 'reaction-tap' ||
    cleanSlug === 'reaction-time' ||
    cleanSlug.includes('reaction') ||
    cleanSlug.includes('reflex') ||
    cleanName.includes('reaction') ||
    cleanName.includes('reflex') ||
    cleanName.includes('formula')
  ) {
    return 'reaction-tap';
  }

  if (
    cleanType === 'memory-match' ||
    cleanType === 'memory-carnival' ||
    cleanType.includes('memory') ||
    cleanSlug === 'memory-match' ||
    cleanSlug === 'memory-carnival' ||
    cleanSlug.includes('memory') ||
    cleanName.includes('memory')
  ) {
    return 'memory-match';
  }

  if (
    cleanType === 'speed-quiz' ||
    cleanSlug === 'speed-quiz' ||
    cleanName.includes('quiz') ||
    cleanName.includes('trivia')
  ) {
    return 'speed-quiz';
  }

  return 'catch-brand';
}

/**
 * Resolves and enriches theme records with accurate game metadata (game_id, game_name, game_slug).
 *
 * Enrichment resolution order:
 * 1. Embedded PostgREST `games` object/array if present and has name/slug.
 * 2. Database batch lookup on the `games` table for themes with valid `game_id` UUIDs.
 * 3. Catalog lookup for known system games / slugs.
 * 4. Fallback defaults only if `game_id` is genuinely missing / null.
 */
export async function enrichThemesWithGameData(
  themes: any[],
  env?: Record<string, any>,
  fallbackDefaults?: {
    fallbackGameId?: string | null;
    fallbackGameName?: string;
    fallbackGameSlug?: string;
    fallbackGameType?: string;
  }
): Promise<GameThemeRecord[]> {
  if (!themes || themes.length === 0) return [];

  const supabase = getSupabaseServerClient(env);
  const configured = isSupabaseConfigured(env);

  // Map to store resolved game information by game ID (or slug)
  const gameMap = new Map<string, { id: string; name: string; slug: string; game_type?: string }>();
  const gameIdsToFetch = new Set<string>();

  for (const item of themes) {
    let embeddedGame: any = null;
    if (item.games) {
      if (Array.isArray(item.games)) {
        if (item.games.length > 0) {
          const match = item.games.find((g: any) => g && (g.id === item.game_id || g.name || g.slug));
          if (match && (match.name || match.slug)) {
            embeddedGame = match;
          }
        }
      } else if (typeof item.games === 'object' && (item.games.name || item.games.slug || item.games.id)) {
        embeddedGame = item.games;
      }
    }

    if (embeddedGame && embeddedGame.id && (embeddedGame.name || embeddedGame.slug)) {
      gameMap.set(embeddedGame.id, {
        id: embeddedGame.id,
        name: embeddedGame.name,
        slug: embeddedGame.slug,
        game_type: embeddedGame.game_type,
      });
    }

    const gid = item.game_id || (embeddedGame && embeddedGame.id);
    if (gid && typeof gid === 'string' && gid.trim().length > 0) {
      if (!gameMap.has(gid)) {
        gameIdsToFetch.add(gid.trim());
      }
    }
  }

  // Fetch missing games from database / catalog
  if (gameIdsToFetch.size > 0) {
    const idsArray = Array.from(gameIdsToFetch);
    const uuidIds = idsArray.filter((id) => isUUID(id));
    const nonUuidIds = idsArray.filter((id) => !isUUID(id));

    if (configured && uuidIds.length > 0) {
      try {
        const { data: dbGames, error: fetchErr } = await supabase
          .from('games')
          .select('id, name, slug, game_type')
          .in('id', uuidIds);

        if (!fetchErr && dbGames) {
          for (const g of dbGames) {
            if (g && g.id) {
              gameMap.set(g.id, {
                id: g.id,
                name: g.name,
                slug: g.slug,
                game_type: g.game_type,
              });
            }
          }
        }
      } catch (err) {
        console.warn('[Theme Enrichment] Error fetching games by id in batch:', err);
      }
    }

    // Check CATALOG_GAMES or query by slug for any remaining IDs
    for (const gid of idsArray) {
      if (!gameMap.has(gid)) {
        const catMatch = CATALOG_GAMES.find((cg) => cg.slug === gid || cg.game_type === gid);
        if (catMatch) {
          gameMap.set(gid, {
            id: gid,
            name: catMatch.name,
            slug: catMatch.slug,
            game_type: catMatch.game_type,
          });
        } else if (configured && !isUUID(gid)) {
          try {
            const { data: matchedBySlug } = await supabase
              .from('games')
              .select('id, name, slug, game_type')
              .or(`slug.eq.${gid},game_type.eq.${gid}`)
              .limit(1);
            if (matchedBySlug && matchedBySlug.length > 0) {
              const g = matchedBySlug[0];
              gameMap.set(gid, {
                id: g.id,
                name: g.name,
                slug: g.slug,
                game_type: g.game_type,
              });
            }
          } catch (err) {
            // ignore
          }
        }
      }
    }
  }

  return themes.map((item) => {
    let embeddedGame: any = null;
    if (item.games) {
      if (Array.isArray(item.games)) {
        const match = item.games.find((g: any) => g && (g.id === item.game_id || g.name || g.slug));
        if (match) embeddedGame = match;
      } else if (typeof item.games === 'object') {
        embeddedGame = item.games;
      }
    }

    const resolvedGameId =
      item.game_id ||
      embeddedGame?.id ||
      fallbackDefaults?.fallbackGameId ||
      null;

    let resolvedGameName: string | undefined;
    let resolvedGameSlug: string | undefined;
    let resolvedGameType: string | undefined;

    if (resolvedGameId && gameMap.has(resolvedGameId)) {
      const g = gameMap.get(resolvedGameId)!;
      resolvedGameName = g.name;
      resolvedGameSlug = g.slug;
      resolvedGameType = resolveServerGameType(g.game_type, g.slug, g.name);
    } else if (embeddedGame && (embeddedGame.name || embeddedGame.slug)) {
      resolvedGameName = embeddedGame.name;
      resolvedGameSlug = embeddedGame.slug;
      resolvedGameType = resolveServerGameType(embeddedGame.game_type, embeddedGame.slug, embeddedGame.name);
    } else if (fallbackDefaults?.fallbackGameName || fallbackDefaults?.fallbackGameSlug || fallbackDefaults?.fallbackGameType) {
      resolvedGameName = fallbackDefaults.fallbackGameName;
      resolvedGameSlug = fallbackDefaults.fallbackGameSlug;
      resolvedGameType = resolveServerGameType(fallbackDefaults.fallbackGameType, fallbackDefaults.fallbackGameSlug, fallbackDefaults.fallbackGameName);
    } else if (item.game_name && item.game_name !== 'Catch The Brand' && item.game_name !== 'Unknown Game') {
      resolvedGameName = item.game_name;
      resolvedGameSlug = item.game_slug;
      resolvedGameType = resolveServerGameType(item.game_type, item.game_slug, item.game_name);
    } else {
      // Resolve game info authoritatively from theme metadata rather than hardcoding Catch The Brand
      const serverType = resolveServerGameType(item.game_type, item.slug, item.name, item);
      resolvedGameType = serverType;
      if (serverType === 'match-3') {
        resolvedGameName = 'Match-3';
        resolvedGameSlug = 'match-3';
      } else if (serverType === 'memory-match') {
        resolvedGameName = 'Brand Memory Match';
        resolvedGameSlug = 'memory-match';
      } else if (serverType === 'reaction-tap') {
        resolvedGameName = 'Formula Reaction Lights';
        resolvedGameSlug = 'reaction-tap';
      } else if (serverType === 'speed-quiz') {
        resolvedGameName = 'Event Trivia Speed Quiz';
        resolvedGameSlug = 'speed-quiz';
      } else {
        resolvedGameName = item.game_name || 'Catch The Brand';
        resolvedGameSlug = item.game_slug || (item.game_id ? `game-${item.game_id.slice(0, 8)}` : 'catch-brand');
      }
    }

    const { games: _omittedGames, ...rest } = item;

    const baseRecord: GameThemeRecord = {
      ...rest,
      game_id: resolvedGameId,
      game_name: resolvedGameName,
      game_slug: resolvedGameSlug,
      game_type: resolvedGameType,
    } as GameThemeRecord;

    return normalizeServerThemeAssets(baseRecord);
  });
}

/**
 * Normalizes system theme record assets server-side so API responses always deliver
 * canonical assets regardless of whether legacy database rows contain outdated paths.
 */
export function normalizeServerThemeAssets(theme: any): any {
  if (!theme) return theme;
  const isSys = Boolean(
    theme.is_system ||
    theme.is_system_theme ||
    theme.ownership_type === 'system' ||
    !theme.organization_id
  );

  const slug = String(theme.slug || '').toLowerCase().trim();
  const name = String(theme.name || '').toLowerCase().trim();

  // Christmas system theme
  if (slug === 'christmas-rush' || slug === 'christmas' || (isSys && name.includes('christmas'))) {
    const updated = { ...theme };
    updated.background_url = '/assets/games/catch-brand/themes/christmas/background.png';
    if (updated.basket_config) {
      updated.basket_config = {
        ...updated.basket_config,
        imageUrl: '/assets/games/catch-brand/themes/christmas/basket.png',
      };
    }
    if (Array.isArray(updated.items_config)) {
      updated.items_config = updated.items_config.map((item: any, idx: number) => {
        let imageUrl = item.imageUrl;
        if (item.isHazard || idx === 1 || item.id === 'coal_lump') {
          imageUrl = '/assets/games/catch-brand/themes/christmas/item_hazard_01.png';
        } else if (item.isBonus || idx === 2 || item.id === 'golden_star') {
          imageUrl = '/assets/games/catch-brand/themes/christmas/item_bonus_01.png';
        } else {
          imageUrl = '/assets/games/catch-brand/themes/christmas/item_normal_01.png';
        }
        return { ...item, imageUrl };
      });
    }
    return updated;
  }

  // CNY system theme
  if (slug === 'cny-fortune' || slug === 'cny' || slug === 'chinese-new-year' || (isSys && (name.includes('lunar') || name.includes('chinese new year')))) {
    const updated = { ...theme };
    updated.background_url = '/assets/games/catch-brand/themes/cny/background.png';
    if (updated.basket_config) {
      updated.basket_config = {
        ...updated.basket_config,
        imageUrl: '/assets/games/catch-brand/themes/cny/basket.png',
      };
    }
    if (Array.isArray(updated.items_config)) {
      updated.items_config = updated.items_config.map((item: any, idx: number) => {
        let imageUrl = item.imageUrl;
        if (item.isHazard || idx === 1 || item.id === 'firecracker') {
          imageUrl = '/assets/games/catch-brand/themes/cny/item_hazard_01.png';
        } else if (item.isBonus || idx === 2 || item.id === 'gold_ingot') {
          imageUrl = '/assets/games/catch-brand/themes/cny/item_bonus_01.png';
        } else {
          imageUrl = '/assets/games/catch-brand/themes/cny/item_normal_01.png';
        }
        return { ...item, imageUrl };
      });
    }
    return updated;
  }

  // Carnival system theme
  if (slug === 'carnival' && isSys) {
    const updated = { ...theme };
    updated.background_url = '/assets/games/catch-brand/themes/carnival/background.png';
    if (updated.basket_config) {
      updated.basket_config = {
        ...updated.basket_config,
        imageUrl: '/assets/games/catch-brand/themes/carnival/basket.png',
      };
    }
    if (Array.isArray(updated.items_config)) {
      updated.items_config = updated.items_config.map((item: any, idx: number) => {
        let imageUrl = item.imageUrl;
        if (item.isHazard || idx === 1 || item.id === 'mask') {
          imageUrl = '/assets/games/catch-brand/themes/carnival/item_hazard_01.png';
        } else if (item.isBonus || idx === 2 || item.id === 'star') {
          imageUrl = '/assets/games/catch-brand/themes/carnival/item_bonus_01.png';
        } else {
          imageUrl = '/assets/games/catch-brand/themes/carnival/item_normal_01.png';
        }
        return { ...item, imageUrl };
      });
    }
    return updated;
  }

  // Default Catch Brand system theme
  if (slug === 'default' && isSys) {
    const updated = { ...theme };
    updated.background_url = '/assets/games/catch-brand/themes/default/background.png';
    if (updated.basket_config) {
      updated.basket_config = {
        ...updated.basket_config,
        imageUrl: '/assets/games/catch-brand/themes/default/basket.png',
      };
    }
    if (Array.isArray(updated.items_config)) {
      updated.items_config = updated.items_config.map((item: any, idx: number) => {
        let imageUrl = item.imageUrl;
        if (item.isHazard || idx === 1 || item.id === 'item_hazard_01') {
          imageUrl = '/assets/games/catch-brand/themes/default/item_hazard_01.png';
        } else if (item.isBonus || idx === 2 || item.id === 'item_bonus_01') {
          imageUrl = '/assets/games/catch-brand/themes/default/item_bonus_01.png';
        } else {
          imageUrl = '/assets/games/catch-brand/themes/default/item_normal_01.png';
        }
        return { ...item, imageUrl };
      });
    }
    return updated;
  }

  // Halloween system theme
  if (slug === 'halloween-spooky' || slug === 'spooky-halloween' || slug === 'halloween' || (isSys && name.includes('halloween'))) {
    const updated = { ...theme };
    updated.background_url = '/assets/games/catch-brand/themes/halloween/background.png';
    if (updated.basket_config) {
      updated.basket_config = {
        ...updated.basket_config,
        imageUrl: '/assets/games/catch-brand/themes/halloween/basket.png',
      };
    }
    if (Array.isArray(updated.items_config)) {
      updated.items_config = updated.items_config.map((item: any, idx: number) => {
        let imageUrl = item.imageUrl;
        if (item.isHazard || idx === 1 || item.id === 'creepy_spider') {
          imageUrl = '/assets/games/catch-brand/themes/halloween/item_hazard_01.png';
        } else if (item.isBonus || idx === 2 || item.id === 'gold_skull') {
          imageUrl = '/assets/games/catch-brand/themes/halloween/item_bonus_01.png';
        } else {
          imageUrl = '/assets/games/catch-brand/themes/halloween/item_normal_01.png';
        }
        return { ...item, imageUrl };
      });
    }
    return updated;
  }

  // Mango system theme
  if (slug === 'mango-festival' || slug === 'mango-harvest' || slug === 'mango' || (isSys && name.includes('mango'))) {
    const updated = { ...theme };
    updated.background_url = '/assets/games/catch-brand/themes/mango/background.png';
    if (updated.basket_config) {
      updated.basket_config = {
        ...updated.basket_config,
        imageUrl: '/assets/games/catch-brand/themes/mango/basket.png',
      };
    }
    if (Array.isArray(updated.items_config)) {
      updated.items_config = updated.items_config.map((item: any, idx: number) => {
        let imageUrl = item.imageUrl;
        if (item.isHazard || idx === 1 || item.id === 'sour_mango') {
          imageUrl = '/assets/games/catch-brand/themes/mango/item_hazard_01.png';
        } else if (item.isBonus || idx === 2 || item.id === 'golden_mango') {
          imageUrl = '/assets/games/catch-brand/themes/mango/item_bonus_01.png';
        } else {
          imageUrl = '/assets/games/catch-brand/themes/mango/item_normal_01.png';
        }
        return { ...item, imageUrl };
      });
    }
    return updated;
  }

  // Match-3 Cartoon Character themes
  const m3Presets = [
    { id: 'cute-animals', name: 'Cute Animals', theme: DEFAULT_MATCH3_CUTE_ANIMALS_THEME },
    { id: 'super-heroes', name: 'Super Heroes', theme: DEFAULT_MATCH3_SUPER_HEROES_THEME },
    { id: 'fantasy-creatures', name: 'Fantasy Creatures', theme: DEFAULT_MATCH3_FANTASY_CREATURES_THEME },
    { id: 'space-explorers', name: 'Space Explorers', theme: DEFAULT_MATCH3_SPACE_EXPLORERS_THEME },
    { id: 'food-characters', name: 'Food Characters', theme: DEFAULT_MATCH3_FOOD_CHARACTERS_THEME },
    { id: 'ocean-friends', name: 'Ocean Friends', theme: DEFAULT_MATCH3_OCEAN_FRIENDS_THEME },
    { id: 'robot-friends', name: 'Robot Friends', theme: DEFAULT_MATCH3_ROBOT_FRIENDS_THEME },
    { id: 'princess-fairytale', name: 'Princess Fairytale', theme: DEFAULT_MATCH3_PRINCESS_FAIRYTALE_THEME },
  ];

  const matchedCartoon = m3Presets.find(
    (p) =>
      slug === p.id ||
      slug === `match-3-${p.id}` ||
      (isSys && name.toLowerCase().includes(p.name.toLowerCase()))
  );

  if (matchedCartoon) {
    const updated = { ...theme };
    updated.background_url = `/assets/games/match-3/themes/${matchedCartoon.id}/background.png`;
    updated.basket_config = null;
    updated.items_config = [];
    if (!updated.game_config || !Array.isArray((updated.game_config as any).tileDefinitions) || (updated.game_config as any).tileDefinitions.length === 0) {
      updated.game_config = {
        ...DEFAULT_MATCH3_THEME.game_config,
        tileDefinitions: (matchedCartoon.theme.game_config as any).tileDefinitions,
      };
    }
    updated.game_type = 'match-3';
    updated.game_slug = 'match-3';
    return updated;
  }

  // Match-3 Classic system theme
  if (slug === 'match-3' || slug === 'match-3-classic' || (isSys && (name === 'Match-3 Classic' || name === 'Match-3' || name.toLowerCase().includes('classic')))) {
    const updated = { ...theme };
    updated.background_url = '/assets/games/match-3/themes/default/background.png';
    updated.basket_config = null;
    updated.items_config = [];
    if (!updated.game_config || Object.keys(updated.game_config).length === 0) {
      updated.game_config = { ...DEFAULT_MATCH3_THEME.game_config };
    }
    updated.game_type = 'match-3';
    updated.game_slug = 'match-3';
  }

  // Universal legacy Carnival asset migration across any theme
  const hasLegacyCarnival =
    (typeof theme.background_url === 'string' &&
      (theme.background_url.includes('/assets/themes/carnival/') ||
        theme.background_url.includes('/assets/games/catch-brand/themes/carnival/'))) ||
    (typeof theme.basket_config?.imageUrl === 'string' &&
      (theme.basket_config.imageUrl.includes('/assets/themes/carnival/') ||
        theme.basket_config.imageUrl.includes('/assets/games/catch-brand/themes/carnival/'))) ||
    (Array.isArray(theme.items_config) &&
      theme.items_config.some(
        (i: any) =>
          typeof i?.imageUrl === 'string' &&
          (i.imageUrl.includes('/assets/themes/carnival/') ||
            i.imageUrl.includes('/assets/games/catch-brand/themes/carnival/'))
      ));

  if (hasLegacyCarnival) {
    const migrated = { ...theme };
    const migrateUrl = (url: string | null | undefined) => {
      if (!url || typeof url !== 'string') return url;
      return url
        .replace(/\/assets\/themes\/carnival\//g, '/assets/games/catch-brand/themes/carnival/')
        .replace(/\/assets\/game\/catch-brand\/themes\/carnival\//g, '/assets/games/catch-brand/themes/carnival/')
        .replace(/\/assets\/games\/catch-the-brand\/themes\/carnival\//g, '/assets/games/catch-brand/themes/carnival/')
        .replace(/\/assets\/game\/catch-the-brand\/themes\/carnival\//g, '/assets/games/catch-brand/themes/carnival/');
    };

    migrated.background_url = migrateUrl(migrated.background_url);
    if (migrated.basket_config?.imageUrl) {
      migrated.basket_config = {
        ...migrated.basket_config,
        imageUrl: migrateUrl(migrated.basket_config.imageUrl),
      };
    }
    if (Array.isArray(migrated.items_config)) {
      migrated.items_config = migrated.items_config.map((item: any) => ({
        ...item,
        imageUrl: migrateUrl(item.imageUrl),
      }));
    }
    return migrated;
  }

  return theme;
}

export async function enrichThemeWithGameData(
  theme: any,
  env?: Record<string, any>,
  fallbackDefaults?: {
    fallbackGameId?: string | null;
    fallbackGameName?: string;
    fallbackGameSlug?: string;
    fallbackGameType?: string;
  }
): Promise<GameThemeRecord> {
  const [enriched] = await enrichThemesWithGameData([theme], env, fallbackDefaults);
  return enriched;
}

// ============================================================================
// THEME DATABASE OPERATIONS
// ============================================================================

export async function getThemesByOrgId(
  organizationId: string,
  gameId?: string,
  env?: Record<string, any>
): Promise<GameThemeRecord[]> {
  const supabase = getSupabaseServerClient(env);
  let query = supabase
    .from('game_themes')
    .select('*, games(id, name, slug, game_type)')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: true });

  if (gameId) {
    query = query.eq('game_id', gameId);
  }

  const { data, error } = await query;

  if (error) {
    if (isLocalFallbackAllowed(env)) {
      const local = Array.from(localThemesCache.values()).filter(
        (t) => t.organization_id === organizationId && (!gameId || t.game_id === gameId)
      );
      if (local.length > 0) return local;
    }
    console.error('Error in getThemesByOrgId:', error);
    throw new Error(`Failed to list themes: ${error.message}`);
  }

  const list = (data || []) as any[];
  if (list.length === 0 && isLocalFallbackAllowed(env)) {
    const local = Array.from(localThemesCache.values()).filter(
      (t) => t.organization_id === organizationId && (!gameId || t.game_id === gameId)
    );
    if (local.length > 0) return local;
  }
  return await enrichThemesWithGameData(list, env);
}

export async function getThemeById(
  themeId: string,
  env?: Record<string, any>,
  options?: { gameId?: string }
): Promise<GameThemeRecord | null> {
  if (!themeId || typeof themeId !== 'string') {
    return null;
  }

  // Handle special 'system' identifier
  if (themeId === 'system') {
    console.log(`[Theme Lookup] Resolving special identifier "system" (gameId: ${options?.gameId || 'all'})`);
    if (options?.gameId) {
      const systemThemes = await getSystemThemesByGameId(options.gameId, { status: 'active' }, env);
      const primaryDefaultTheme = systemThemes.find((t) => t.is_default) || systemThemes[0] || null;
      if (primaryDefaultTheme) {
        console.log(
          `[Theme Lookup] Resolved primary/default system theme: "${primaryDefaultTheme.name}" (${primaryDefaultTheme.id}, is_default=${Boolean(primaryDefaultTheme.is_default)})`
        );
        return primaryDefaultTheme;
      }
    }
    const allSystemThemes = await getAllSystemThemes(env);
    const primaryDefaultTheme = allSystemThemes.find((t) => t.is_default) || allSystemThemes[0] || null;
    if (primaryDefaultTheme) {
      console.log(
        `[Theme Lookup] Resolved primary/default system theme: "${primaryDefaultTheme.name}" (${primaryDefaultTheme.id}, is_default=${Boolean(primaryDefaultTheme.is_default)})`
      );
      return primaryDefaultTheme;
    }
    console.log(`[Theme Lookup] No system theme found.`);
    return null;
  }

  if (localThemesCache.has(themeId)) {
    return localThemesCache.get(themeId)!;
  }

  // Validate that themeId is a valid UUID before querying PostgreSQL
  if (!isUUID(themeId)) {
    // Check preset / system themes by id or slug
    const cleanId = themeId.trim().toLowerCase();
    const gameTypeKey = cleanId.replace(/^system-theme-/, '');

    const preset = PRESET_THEMES.find(
      (p) =>
        p.slug === cleanId ||
        p.slug === gameTypeKey ||
        p.game_type === cleanId ||
        p.game_type === gameTypeKey ||
        p.game_slug === cleanId ||
        p.game_slug === gameTypeKey ||
        (p as any).id === cleanId ||
        (p as any).id === gameTypeKey
    );
    if (preset) {
      const now = new Date().toISOString();
      const resolvedGameId =
        (options?.gameId && isUUID(options.gameId) ? options.gameId : null) ||
        preset.game_id ||
        (gameTypeKey === 'match-3' ? 'game-match-3' : null);
      const normType =
        (gameTypeKey.includes('match') ? 'match-3' : null) ||
        (gameTypeKey.includes('memory') ? 'memory-match' : null) ||
        (gameTypeKey.includes('reaction') ? 'reaction-tap' : null) ||
        (preset.game_type as string) ||
        'catch-brand';
      return {
        ...preset,
        id: (preset as any).id || cleanId,
        organization_id: null as any,
        game_id: resolvedGameId,
        created_at: now,
        updated_at: now,
        is_system: true,
        ownership_type: 'system',
        game_type: normType,
        game_slug: normType,
        game_name:
          normType === 'match-3'
            ? 'Match-3'
            : normType === 'memory-match'
            ? 'Brand Memory Match'
            : normType === 'reaction-tap'
            ? 'Formula Reaction Lights'
            : (preset as any).game_name || preset.name,
      } as GameThemeRecord;
    }
    const defaultTemplate = getDefaultThemeForGameType(gameTypeKey);
    if (defaultTemplate) {
      const now = new Date().toISOString();
      const normType =
        (gameTypeKey.includes('match') ? 'match-3' : null) ||
        (gameTypeKey.includes('memory') ? 'memory-match' : null) ||
        (gameTypeKey.includes('reaction') ? 'reaction-tap' : null) ||
        'catch-brand';
      const resolvedGameId =
        (options?.gameId && isUUID(options.gameId) ? options.gameId : null) ||
        defaultTemplate.game_id ||
        `game-${normType}`;
      return {
        ...defaultTemplate,
        id: cleanId,
        organization_id: null as any,
        game_id: resolvedGameId,
        created_at: now,
        updated_at: now,
        is_system: true,
        ownership_type: 'system',
        game_type: normType,
        game_slug: normType,
        game_name:
          normType === 'match-3'
            ? 'Match-3'
            : normType === 'memory-match'
            ? 'Brand Memory Match'
            : normType === 'reaction-tap'
            ? 'Formula Reaction Lights'
            : 'Catch the Brand',
      } as unknown as GameThemeRecord;
    }
    console.warn(`[Theme Lookup] getThemeById received non-UUID string: "${themeId}". Skipping UUID query to prevent PostgreSQL syntax error.`);
    return null;
  }

  console.log(`[Theme Lookup] Querying game theme by UUID: ${themeId}`);
  recordDbOperation('theme_read', env);
  const supabase = getSupabaseServerClient(env);
  const { data, error } = await supabase
    .from('game_themes')
    .select('*, games(id, name, slug, game_type)')
    .eq('id', themeId)
    .maybeSingle();

  if (error) {
    if (isLocalFallbackAllowed(env)) {
      if (localThemesCache.has(themeId)) return localThemesCache.get(themeId)!;
      const allSystemThemes = await getAllSystemThemes(env);
      const matchedSystem = allSystemThemes.find((t) => t.id === themeId);
      if (matchedSystem) return matchedSystem;
      return null;
    }
    console.error('Error in getThemeById:', error);
    throw new Error(`Failed to get theme: ${error.message}`);
  }

  if (!data) {
    if (isLocalFallbackAllowed(env) && localThemesCache.has(themeId)) {
      return localThemesCache.get(themeId)!;
    }
    console.log(`[Theme Lookup] No theme found with UUID: ${themeId}`);
    return null;
  }

  return await enrichThemeWithGameData(data, env);
}

export async function getActiveThemeForOrg(
  organizationId: string,
  gameId?: string,
  env?: Record<string, any>
): Promise<GameThemeRecord | null> {
  const supabase = getSupabaseServerClient(env);
  let query = supabase
    .from('game_themes')
    .select('*, games(id, name, slug, game_type)')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: true });

  if (gameId) {
    query = query.eq('game_id', gameId);
  }

  const { data, error } = await query.limit(1).maybeSingle();

  if (error) {
    console.error('Error in getActiveThemeForOrg:', error);
    throw new Error(`Failed to get active theme: ${error.message}`);
  }

  if (!data) return null;
  return await enrichThemeWithGameData(data, env);
}

/**
 * Safely inserts into the 'game_themes' table by catching PostgREST schema cache errors
 * and retrying with missing optional columns omitted.
 */
async function safeInsertTheme(
  supabase: any,
  initialPayload: Record<string, any>
): Promise<{ data: any; error: any }> {
  let payload = { ...initialPayload };

  // 'styling' is not a database column in game_themes (stored under visuals_config)
  delete payload.styling;

  // Defensively enforce JSONB non-nullable constraints matching database schema
  if (payload.basket_config === null || payload.basket_config === undefined) {
    payload.basket_config = {};
  }
  if (payload.items_config === null || payload.items_config === undefined) {
    payload.items_config = [];
  }
  if (payload.branding === null || payload.branding === undefined) {
    payload.branding = {};
  }
  if (payload.physics_config === null || payload.physics_config === undefined) {
    payload.physics_config = {};
  }
  if (payload.visuals_config === null || payload.visuals_config === undefined) {
    payload.visuals_config = {};
  }
  if (payload.sounds_config === null || payload.sounds_config === undefined) {
    payload.sounds_config = {};
  }
  if (payload.layout === null || payload.layout === undefined) {
    payload.layout = {};
  }
  if (payload.game_config === null || payload.game_config === undefined) {
    payload.game_config = {};
  }
  if (payload.game_id && !isUUID(payload.game_id)) {
    payload.game_id = null;
  }

  for (let attempt = 0; attempt < 8; attempt++) {
    const { data, error } = await supabase
      .from('game_themes')
      .insert(payload)
      .select('*, games(id, name, slug, game_type)')
      .single();

    if (!error) {
      const merged = { ...initialPayload, ...data };
      if (!merged.game_id && initialPayload.game_id) {
        merged.game_id = initialPayload.game_id;
      }
      return { data: merged, error: null };
    }

    // 1. Missing column in game_themes table (PostgREST schema cache or Postgres error)
    const missingColMatch = error.message?.match(/(?:Could not find the '([^']+)' column of 'game_themes'|column ["']?([^"'\s]+)["']? of relation "game_themes" does not exist|column ["']?([^"'\s]+)["']? does not exist)/i);
    const missingCol = missingColMatch ? (missingColMatch[1] || missingColMatch[2] || missingColMatch[3]) : null;
    if (missingCol && payload[missingCol] !== undefined) {
      console.warn(`[Supabase Schema Fallback] Column '${missingCol}' not found in 'game_themes' table. Retrying insert without this column...`);
      delete payload[missingCol];
      continue;
    }

    // 2. Not-null constraint violation on a column (e.g. basket_config, branding, items_config)
    const notNullMatch = error.message?.match(/null value in column "([^"]+)" of relation "game_themes" violates not-null constraint/i);
    if (notNullMatch && notNullMatch[1]) {
      const col = notNullMatch[1];
      console.warn(`[Supabase Schema Fallback] Column '${col}' cannot be null in 'game_themes'. Setting fallback...`);
      payload[col] = col === 'items_config' ? [] : {};
      continue;
    }

    // 3. Foreign key violation on game_id
    if (error.code === '23503' && payload.game_id) {
      console.warn(`[Supabase Schema Fallback] Foreign key constraint violated on game_id '${payload.game_id}'. Retrying with game_id = null...`);
      payload.game_id = null;
      continue;
    }

    // 4. PostgREST relationship embed failure on .select('*, games(...)')
    if (error.message?.includes('relationship') || (error.message?.includes('schema cache') && error.message?.includes('games'))) {
      console.warn(`[Supabase Schema Fallback] Relationship 'games' not found in schema cache. Retrying insert with simple select('*')...`);
      const { data: simpleData, error: simpleError } = await supabase
        .from('game_themes')
        .insert(payload)
        .select('*')
        .single();
      if (!simpleError) {
        return { data: { ...initialPayload, ...simpleData }, error: null };
      }
    }

    return { data: null, error };
  }
  return { data: null, error: new Error('Failed to insert theme after multiple fallback attempts') };
}

/**
 * Safely updates the 'game_themes' table by catching PostgREST schema cache errors
 * and retrying with missing optional columns omitted.
 */
async function safeUpdateTheme(
  supabase: any,
  themeId: string,
  initialPayload: Record<string, any>
): Promise<{ data: any; error: any }> {
  if (!isUUID(themeId)) {
    return { data: null, error: new Error(`Invalid UUID format for theme update: ${themeId}`) };
  }
  let payload = { ...initialPayload };

  delete payload.styling;

  if (payload.basket_config === null) payload.basket_config = {};
  if (payload.items_config === null) payload.items_config = [];
  if (payload.branding === null) payload.branding = {};
  if (payload.physics_config === null) payload.physics_config = {};
  if (payload.visuals_config === null) payload.visuals_config = {};
  if (payload.sounds_config === null) payload.sounds_config = {};
  if (payload.layout === null) payload.layout = {};
  if (payload.game_config === null) payload.game_config = {};
  if (payload.game_id && !isUUID(payload.game_id)) payload.game_id = null;

  for (let attempt = 0; attempt < 8; attempt++) {
    const { data, error } = await supabase
      .from('game_themes')
      .update(payload)
      .eq('id', themeId)
      .select('*, games(id, name, slug, game_type)')
      .single();

    if (!error) {
      return { data: { ...initialPayload, ...data }, error: null };
    }

    const missingColMatch = error.message?.match(/(?:Could not find the '([^']+)' column of 'game_themes'|column ["']?([^"'\s]+)["']? of relation "game_themes" does not exist|column ["']?([^"'\s]+)["']? does not exist)/i);
    const missingCol = missingColMatch ? (missingColMatch[1] || missingColMatch[2] || missingColMatch[3]) : null;
    if (missingCol && payload[missingCol] !== undefined) {
      console.warn(`[Supabase Schema Fallback] Column '${missingCol}' not found in 'game_themes' table. Retrying update without this column...`);
      delete payload[missingCol];
      continue;
    }

    const notNullMatch = error.message?.match(/null value in column "([^"]+)" of relation "game_themes" violates not-null constraint/i);
    if (notNullMatch && notNullMatch[1]) {
      const col = notNullMatch[1];
      console.warn(`[Supabase Schema Fallback] Column '${col}' cannot be null in 'game_themes'. Setting fallback...`);
      payload[col] = col === 'items_config' ? [] : {};
      continue;
    }

    if (error.code === '23503' && payload.game_id) {
      console.warn(`[Supabase Schema Fallback] Foreign key constraint violated on game_id '${payload.game_id}'. Retrying update with game_id = null...`);
      payload.game_id = null;
      continue;
    }

    if (error.message?.includes('relationship') || (error.message?.includes('schema cache') && error.message?.includes('games'))) {
      console.warn(`[Supabase Schema Fallback] Relationship 'games' not found in schema cache. Retrying update with simple select('*')...`);
      const { data: simpleData, error: simpleError } = await supabase
        .from('game_themes')
        .update(payload)
        .eq('id', themeId)
        .select('*')
        .single();
      if (!simpleError) {
        return { data: { ...initialPayload, ...simpleData }, error: null };
      }
    }

    return { data: null, error };
  }
  return { data: null, error: new Error('Failed to update theme after multiple fallback attempts') };
}

export async function createTheme(
  params: {
    organization_id: string;
    game_id?: string | null;
    game_type?: string;
    game_slug?: string;
    name: string;
    slug?: string;
    description?: string | null;
    status?: 'active' | 'archived' | 'draft';
    is_system?: boolean;
    branding?: ThemeBrandingConfig;
    background_url?: string | null;
    basket_config?: ThemeBasketConfig;
    items_config?: ThemeDropItem[];
    physics_config?: ThemePhysicsConfig;
    visuals_config?: ThemeVisualsConfig;
    styling?: any;
    sounds_config?: ThemeSoundsConfig;
    layout?: any;
    game_config?: any;
  },
  env?: Record<string, any>
): Promise<GameThemeRecord> {
  const supabase = getSupabaseServerClient(env);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const slug = params.slug || params.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  let resolvedGameId = params.game_id;
  let resolvedGameType = params.game_type || 'catch-brand';
  let resolvedGameName = 'Catch The Brand';
  let resolvedGameSlug = params.game_slug || 'catch-brand';

  if (resolvedGameId) {
    try {
      if (isUUID(resolvedGameId)) {
        const localGame = await getGameById(resolvedGameId, env);
        if (localGame) {
          resolvedGameType = resolveServerGameType(params.game_type || localGame.game_type, params.game_slug || localGame.slug, localGame.name);
          resolvedGameName = localGame.name;
          resolvedGameSlug = params.game_slug || localGame.slug;
        } else {
          const { data: g } = await supabase
            .from('games')
            .select('id, name, slug, game_type')
            .eq('id', resolvedGameId)
            .maybeSingle();
          if (g) {
            resolvedGameType = resolveServerGameType(params.game_type || g.game_type, params.game_slug || g.slug, g.name);
            resolvedGameName = g.name;
            resolvedGameSlug = params.game_slug || g.slug;
          } else if (resolvedGameId === 'c782cc78-d2f6-4e70-ac90-bbf9824c62f9') {
            resolvedGameType = 'memory-match';
            resolvedGameName = 'Brand Memory Match';
            resolvedGameSlug = 'memory-match';
          } else {
            const targetSlug = params.game_slug || (params.game_type === 'memory-match' ? 'memory-match' : null);
            if (targetSlug) {
              const { data: gBySlug } = await supabase
                .from('games')
                .select('id, name, slug, game_type')
                .eq('slug', targetSlug)
                .maybeSingle();
              if (gBySlug) {
                resolvedGameId = gBySlug.id;
                resolvedGameType = resolveServerGameType(params.game_type || gBySlug.game_type, params.game_slug || gBySlug.slug, gBySlug.name);
                resolvedGameName = gBySlug.name;
                resolvedGameSlug = params.game_slug || gBySlug.slug;
              }
            }
          }
        }
      } else {
        const { data: gBySlug } = await supabase
          .from('games')
          .select('id, name, slug, game_type')
          .or(`slug.eq.${resolvedGameId},game_type.eq.${resolvedGameId}`)
          .maybeSingle();
        if (gBySlug) {
          resolvedGameId = gBySlug.id;
          resolvedGameType = resolveServerGameType(params.game_type || gBySlug.game_type, params.game_slug || gBySlug.slug, gBySlug.name);
          resolvedGameName = gBySlug.name;
          resolvedGameSlug = params.game_slug || gBySlug.slug;
        }
      }
    } catch {
      // ignore
    }
  } else {
    try {
      const { data: games } = await supabase
        .from('games')
        .select('id, name, slug, game_type')
        .eq('organization_id', params.organization_id)
        .limit(1);
      if (games && games.length > 0) {
        resolvedGameId = games[0].id;
        resolvedGameType = resolveServerGameType(games[0].game_type, games[0].slug, games[0].name);
        resolvedGameName = games[0].name;
        resolvedGameSlug = games[0].slug;
      }
    } catch {
      // ignore
    }
  }

  if (
    !params.game_type &&
    resolvedGameType !== 'match-3' &&
    ((params.name && (params.name.toLowerCase().includes('match-3') || params.name.toLowerCase().includes('match 3') || params.name.toLowerCase().includes('match3') || params.name.toLowerCase().includes('cascade'))) ||
      params.game_slug?.includes('match-3') ||
      params.game_slug?.includes('match3') ||
      params.game_config?.tileDefinitions ||
      params.game_config?.match3Config)
  ) {
    resolvedGameType = 'match-3';
    resolvedGameName = 'Match-3';
    resolvedGameSlug = 'match-3';
  } else if (
    !params.game_type &&
    resolvedGameType !== 'reaction-tap' &&
    ((params.name && (params.name.toLowerCase().includes('reaction') || params.name.toLowerCase().includes('reflex') || params.name.toLowerCase().includes('formula'))) ||
      params.game_slug?.includes('reaction'))
  ) {
    resolvedGameType = 'reaction-tap';
    resolvedGameName = 'Formula Reflex Challenge';
    resolvedGameSlug = 'reaction-tap';
  } else if (
    !params.game_type &&
    resolvedGameType !== 'memory-match' &&
    ((params.name && params.name.toLowerCase().includes('memory')) ||
      params.game_config?.board ||
      params.game_config?.totalPairs ||
      params.game_config?.total_pairs)
  ) {
    resolvedGameType = 'memory-match';
    resolvedGameName = 'Brand Memory Match';
    resolvedGameSlug = 'memory-match';
  }

  const isMatch3 = resolvedGameType === 'match-3' || params.game_type === 'match-3' || params.game_slug === 'match-3' || resolvedGameSlug === 'match-3';
  const isReaction = !isMatch3 && (resolvedGameType === 'reaction-tap' || params.game_type === 'reaction-tap' || params.game_slug === 'reaction-tap' || resolvedGameSlug === 'reaction-tap');
  const isMemory = !isMatch3 && !isReaction && (resolvedGameType === 'memory-match' || params.game_type === 'memory-match' || params.game_slug === 'memory-match' || resolvedGameSlug === 'memory-match');
  const defaultTemplate = getDefaultThemeForGameType(resolvedGameType);

  const defaultBranding: ThemeBrandingConfig = {
    gameTitle: params.name.toUpperCase(),
    subtitle: params.description || (isReaction ? 'When the lights go out, react as fast as you can!' : isMemory ? 'Flip cards, match 8 pairs, and beat the clock!' : 'Catch custom items, avoid hazards!'),
    logoUrl: null,
    clientLogoUrl: null,
  };

  const newTheme: GameThemeRecord = {
    id,
    organization_id: params.organization_id,
    game_id: resolvedGameId || null,
    is_system: false,
    ownership_type: 'organization',
    is_default: false,
    name: params.name,
    slug,
    description: params.description ?? null,
    status: params.status || 'active',
    branding: params.branding ?? (defaultTemplate.branding || defaultBranding),
    background_url: params.background_url ?? defaultTemplate.background_url,
    basket_config: (isMemory || isReaction || isMatch3) ? (params.basket_config ?? {}) : (params.basket_config ?? defaultTemplate.basket_config),
    items_config: params.items_config ?? defaultTemplate.items_config,
    physics_config: params.physics_config ?? defaultTemplate.physics_config,
    visuals_config: params.visuals_config ?? defaultTemplate.visuals_config,
    styling: (params as any).styling ?? params.visuals_config ?? defaultTemplate.visuals_config,
    sounds_config: params.sounds_config ?? defaultTemplate.sounds_config,
    layout: params.layout ?? defaultTemplate.layout,
    game_config: params.game_config ?? (defaultTemplate as any).game_config ?? {},
    created_at: now,
    updated_at: now,
    game_name: resolvedGameName,
    game_slug: resolvedGameSlug,
    game_type: resolvedGameType,
  } as GameThemeRecord;

  if (!isSupabaseConfigured(env)) {
    localThemesCache.set(id, newTheme);
    return newTheme;
  }

  const { data, error } = await safeInsertTheme(supabase, {
    id,
    organization_id: params.organization_id,
    game_id: resolvedGameId || null,
    is_system: false,
    ownership_type: 'organization',
    is_default: false,
    name: params.name,
    slug,
    description: params.description ?? null,
    status: params.status || 'active',
    branding: params.branding ?? (defaultTemplate.branding || defaultBranding),
    background_url: params.background_url ?? defaultTemplate.background_url,
    basket_config: (params.basket_config || (isMemory ? {} : defaultTemplate.basket_config)) ?? {},
    items_config: params.items_config ?? defaultTemplate.items_config ?? [],
    physics_config: params.physics_config ?? defaultTemplate.physics_config ?? {},
    visuals_config: params.visuals_config ?? defaultTemplate.visuals_config ?? {},
    sounds_config: params.sounds_config ?? defaultTemplate.sounds_config ?? {},
    layout: params.layout ?? defaultTemplate.layout ?? {},
    game_config: params.game_config ?? {},
    created_at: now,
    updated_at: now,
  });

  if (error) {
    if (error.message?.includes('Placeholder') || error.code === 'PGRST000' || isLocalFallbackAllowed(env)) {
      localThemesCache.set(id, newTheme);
      return newTheme;
    }
    console.error('Error in createTheme:', error);
    throw new Error(`Failed to create theme: ${error.message}`);
  }

  const item = data as any;
  if ((params as any).styling) {
    item.styling = (params as any).styling;
  }
  const enriched = await enrichThemeWithGameData(item, env, {
    fallbackGameId: resolvedGameId,
    fallbackGameName: resolvedGameName,
    fallbackGameSlug: resolvedGameSlug,
    fallbackGameType: resolvedGameType,
  });
  if (params.organization_id) {
    await dispatchNotificationEvent(
      {
        eventType: 'THEME_READY',
        organizationId: params.organization_id,
        themeId: enriched.id,
        themeName: enriched.name,
        previewUrl: `/preview/${enriched.game_slug || 'catch-brand'}?themeId=${enriched.id}`,
      },
      env
    ).catch((err) => console.error('[NOTIFICATION] Failed to dispatch THEME_READY:', err));
  }

  localThemesCache.set(id, enriched);
  return enriched;
}

export async function updateTheme(
  themeId: string,
  updates: Partial<Omit<GameThemeRecord, 'id' | 'organization_id' | 'created_at'>>,
  env?: Record<string, any>
): Promise<GameThemeRecord> {
  const existing = await getThemeById(themeId, env);
  if (existing && (existing.is_system || !existing.organization_id)) {
    throw new Error('System themes are read-only templates and cannot be edited directly. Clone this theme into your organization instead.');
  }

  const supabase = getSupabaseServerClient(env);
  const now = new Date().toISOString();

  // Strip undefined values so they do not overwrite existing fields
  const cleanUpdates: Record<string, any> = {};
  for (const [key, val] of Object.entries(updates)) {
    if (val !== undefined) {
      cleanUpdates[key] = val;
    }
  }

  const payload: any = {
    ...cleanUpdates,
    updated_at: now,
  };

  const { data, error } = await safeUpdateTheme(supabase, themeId, payload);

  if (error) {
    if (error.message?.includes('Placeholder') || error.code === 'PGRST000' || isLocalFallbackAllowed(env)) {
      const existingTheme = (await getThemeById(themeId, env)) || ({} as GameThemeRecord);
      const updatedTheme = {
        ...existingTheme,
        ...cleanUpdates,
        id: themeId,
      } as GameThemeRecord;
      localThemesCache.set(themeId, updatedTheme);
      return updatedTheme;
    }
    console.error('Error in updateTheme:', error);
    throw new Error(`Failed to update theme: ${error.message}`);
  }

  const item = data as any;
  if ((updates as any).styling) {
    item.styling = (updates as any).styling;
  }
  const enriched = await enrichThemeWithGameData(item, env, {
    fallbackGameId: existing?.game_id,
    fallbackGameName: existing?.game_name,
    fallbackGameSlug: existing?.game_slug,
  });
  if (enriched.organization_id) {
    await dispatchNotificationEvent(
      {
        eventType: 'THEME_READY',
        organizationId: enriched.organization_id,
        themeId: enriched.id,
        themeName: enriched.name,
        previewUrl: `/preview/${enriched.game_slug || 'catch-brand'}?themeId=${enriched.id}`,
      },
      env
    ).catch((err) => console.error('[NOTIFICATION] Failed to dispatch THEME_READY:', err));
  }

  localThemesCache.set(themeId, enriched);
  return enriched;
}

/**
 * Checks whether a theme name is available (unique case-insensitive) in the organization.
 */
export async function checkThemeNameAvailable(
  organizationId: string,
  themeName: string,
  excludeThemeId?: string,
  env?: Record<string, any>
): Promise<boolean> {
  const trimmed = (themeName || '').trim().toLowerCase();
  if (!trimmed) return false;
  const supabase = getSupabaseServerClient(env);
  if (isSupabaseConfigured(env)) {
    let query = supabase
      .from('game_themes')
      .select('id, name')
      .eq('organization_id', organizationId)
      .ilike('name', themeName.trim());
    if (excludeThemeId) {
      query = query.neq('id', excludeThemeId);
    }
    const { data } = await query.limit(1);
    return !data || data.length === 0;
  } else {
    for (const [, t] of localThemesCache) {
      if (
        t.organization_id === organizationId &&
        (!excludeThemeId || t.id !== excludeThemeId) &&
        t.name.trim().toLowerCase() === trimmed
      ) {
        return false;
      }
    }
    return true;
  }
}

/**
 * Renames an existing organization theme.
 * Preserves the theme ID, organization ownership, and all visual/audio/item settings.
 */
export async function renameTheme(
  themeId: string,
  newName: string,
  env?: Record<string, any>
): Promise<GameThemeRecord> {
  if (!isUUID(themeId)) {
    throw new Error(`Invalid theme ID format: ${themeId}`);
  }
  const trimmed = typeof newName === 'string' ? newName.trim() : '';
  if (!trimmed) {
    throw new Error('Theme name is required');
  }
  if (trimmed.length > 60) {
    throw new Error('Theme name must not exceed 60 characters');
  }

  const existing = await getThemeById(themeId, env);
  if (!existing) {
    throw new Error('Theme not found');
  }
  if (existing.is_system || !existing.organization_id) {
    throw new Error('System themes are read-only templates and cannot be edited directly.');
  }

  // Check duplicate name within the same organization (case-insensitive)
  if (existing.organization_id && trimmed.toLowerCase() !== existing.name.trim().toLowerCase()) {
    const isAvailable = await checkThemeNameAvailable(existing.organization_id, trimmed, themeId, env);
    if (!isAvailable) {
      throw new Error('A theme with this name already exists in your organization');
    }
  }

  const newSlug = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return await updateTheme(themeId, { name: trimmed, slug: newSlug }, env);
}

export async function duplicateTheme(
  themeId: string,
  newName?: string,
  env?: Record<string, any>
): Promise<GameThemeRecord> {
  const existing = await getThemeById(themeId, env);
  if (!existing) {
    throw new Error('Theme not found to duplicate');
  }

  const name = newName || `${existing.name} (Copy)`;
  const slug = `${existing.slug}-copy-${Date.now().toString().slice(-4)}`;

  return await createTheme(
    {
      organization_id: existing.organization_id!,
      game_id: existing.game_id,
      name,
      slug,
      description: existing.description,
      status: 'draft',
      branding: existing.branding,
      background_url: existing.background_url,
      basket_config: existing.basket_config,
      items_config: existing.items_config,
      physics_config: existing.physics_config,
      visuals_config: existing.visuals_config,
      sounds_config: existing.sounds_config,
      layout: existing.layout,
      game_config: existing.game_config ?? {},
    },
    env
  );
}

export async function deleteTheme(themeId: string, env?: Record<string, any>): Promise<void> {
  if (!isUUID(themeId)) {
    throw new Error(`Invalid theme ID format: ${themeId}`);
  }

  const existing = await getThemeById(themeId, env);
  if (existing && (existing.is_system || !existing.organization_id)) {
    throw new Error('System themes are read-only templates and cannot be deleted.');
  }

  localThemesCache.delete(themeId);

  const supabase = getSupabaseServerClient(env);
  const { error } = await supabase
    .from('game_themes')
    .delete()
    .eq('id', themeId);

  if (error) {
    if (error.message?.includes('Placeholder') || error.code === 'PGRST000' || isLocalFallbackAllowed(env)) {
      return;
    }
    console.error('Error in deleteTheme:', error);
    throw new Error(`Failed to delete theme: ${error.message}`);
  }
}

// ============================================================================
// DEVELOPER ADMIN SYSTEM DEFAULT THEMES MANAGEMENT
// ============================================================================

export async function getSystemThemesByGameId(
  gameId: string,
  optionsOrEnv?: { status?: 'active' | 'all' } | Record<string, any>,
  maybeEnv?: Record<string, any>
): Promise<GameThemeRecord[]> {
  let options: { status?: 'active' | 'all' } = { status: 'active' };
  let env: Record<string, any> | undefined = maybeEnv;

  if (optionsOrEnv) {
    if ('status' in optionsOrEnv && typeof (optionsOrEnv as any).status === 'string') {
      options = optionsOrEnv as { status?: 'active' | 'all' };
    } else {
      env = optionsOrEnv as Record<string, any>;
    }
  }

  const supabase = getSupabaseServerClient(env);
  const { getGameById } = await import('./games.js');

  // Step A: Load the supplied game
  const game = await getGameById(gameId, env);

  let targetSystemGameId = gameId;
  let resolvedSystemGameName = game?.name || 'Platform Game';
  let resolvedSystemGameSlug = game?.slug || 'platform-game';
  let resolvedSystemGameType = game?.game_type || 'catch-brand';
  let candidateGames: any[] = [];

  // Step B & Step C: Resolve canonical system game
  if (game) {
    const isSuppliedGameSystem = Boolean(game.is_system) || !game.organization_id;
    if (isSuppliedGameSystem) {
      targetSystemGameId = game.id;
      resolvedSystemGameName = game.name;
      resolvedSystemGameSlug = game.slug;
      resolvedSystemGameType = game.game_type || 'catch-brand';
      candidateGames = [game];
    } else {
      // Supplied game is an organization game: find canonical system game by game_type
      const gameType = game.game_type || 'catch-brand';
      resolvedSystemGameType = gameType;

      // Query all matching system games for this game_type
      const { data: matchedGames } = await supabase
        .from('games')
        .select('id, name, slug, game_type, is_system, ownership_type, status, created_at, organization_id')
        .or('is_system.eq.true,organization_id.is.null')
        .eq('game_type', gameType);

      candidateGames = matchedGames || [];

      // Fallback: if no candidates found by game_type, try by slug
      if (candidateGames.length === 0 && game.slug) {
        const { data: matchedBySlug } = await supabase
          .from('games')
          .select('id, name, slug, game_type, is_system, ownership_type, status, created_at, organization_id')
          .or('is_system.eq.true,organization_id.is.null')
          .eq('slug', game.slug);
        candidateGames = matchedBySlug || [];
      }

      if (candidateGames.length > 0) {
        // Priority selection:
        // 1. is_system = true
        // 2. ownership_type = 'system'
        // 3. exact game_type
        // 4. active status
        // 5. if multiple remain, greatest number of system themes
        // 6. oldest system game (earliest created_at)
        const scoredCandidates = await Promise.all(
          candidateGames.map(async (cand) => {
            let score = 0;
            if (cand.is_system === true) score += 1000;
            if (cand.ownership_type === 'system') score += 500;
            if (cand.game_type === gameType) score += 250;
            if (cand.status === 'active') score += 100;

            // Count system themes attached to this candidate game
            const { count } = await supabase
              .from('game_themes')
              .select('id', { count: 'exact', head: true })
              .eq('game_id', cand.id)
              .or('is_system.eq.true,organization_id.is.null');

            const themeCount = count || 0;
            score += Math.min(themeCount * 10, 90);

            const createdAtTime = cand.created_at ? new Date(cand.created_at).getTime() : 0;

            return {
              candidate: cand,
              score,
              themeCount,
              createdAtTime,
            };
          })
        );

        scoredCandidates.sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          if (b.themeCount !== a.themeCount) return b.themeCount - a.themeCount;
          return a.createdAtTime - b.createdAtTime; // oldest first
        });

        const canonical = scoredCandidates[0].candidate;
        targetSystemGameId = canonical.id;
        resolvedSystemGameName = canonical.name;
        resolvedSystemGameSlug = canonical.slug;
        resolvedSystemGameType = canonical.game_type || gameType;
      }
    }
  } else {
    // If not found directly by ID, check if gameId is a slug or game_type
    const { data: systemGamesBySlugOrType } = await supabase
      .from('games')
      .select('id, name, slug, game_type, is_system, ownership_type, status, created_at, organization_id')
      .or('is_system.eq.true,organization_id.is.null')
      .or(`game_type.eq.${gameId},slug.eq.${gameId}`);

    candidateGames = systemGamesBySlugOrType || [];
    if (candidateGames.length > 0) {
      const canonical = candidateGames[0];
      targetSystemGameId = canonical.id;
      resolvedSystemGameName = canonical.name;
      resolvedSystemGameSlug = canonical.slug;
      resolvedSystemGameType = canonical.game_type || gameId;
    }
  }

  // Step 3: Query system themes for the resolved canonical system game
  let query = supabase
    .from('game_themes')
    .select('*, games(id, name, slug, game_type)')
    .or('is_system.eq.true,organization_id.is.null');

  if (isUUID(targetSystemGameId)) {
    query = query.or(`game_id.eq.${targetSystemGameId},and(game_id.is.null,slug.eq.${resolvedSystemGameSlug})`);
  } else {
    query = query.or(`slug.eq.${resolvedSystemGameSlug},slug.eq.${targetSystemGameId}`);
  }

  if (options.status !== 'all') {
    query = query.eq('status', 'active');
  }

  query = query.order('created_at', { ascending: true });

  const { data, error } = await query;

  if (error) {
    if (error.message?.includes('Placeholder') || error.code === 'PGRST000' || isLocalFallbackAllowed(env)) {
      const targetGame = candidateGames.find((c) => c.id === targetSystemGameId) || candidateGames[0] || game;
      const gameType = targetGame?.game_type || resolvedSystemGameType || 'catch-brand';
      const defaultTheme = getDefaultThemeForGameType(gameType);
      return [
        {
          id: `system-theme-${gameType}`,
          organization_id: null as any,
          game_id: isUUID(targetSystemGameId) ? targetSystemGameId : null,
          name: defaultTheme.name,
          slug: defaultTheme.slug,
          description: defaultTheme.description,
          status: 'active',
          is_system: true,
          is_default: true,
          branding: defaultTheme.branding,
          background_url: defaultTheme.background_url,
          basket_config: defaultTheme.basket_config,
          items_config: defaultTheme.items_config,
          physics_config: defaultTheme.physics_config,
          visuals_config: defaultTheme.visuals_config,
          sounds_config: defaultTheme.sounds_config,
          game_config: (defaultTheme as any).game_config,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          game: targetGame as any,
          game_type: gameType,
          game_slug: targetGame?.slug || gameType,
          game_name: targetGame?.name || defaultTheme.name,
        } as unknown as GameThemeRecord,
      ];
    }
    console.error('Error in getSystemThemesByGameId:', error);
    throw new Error(`Failed to list system themes: ${error.message}`);
  }

  let list = (data || []) as any[];

  // Step 4: Diagnostic Fallback using game_type if 0 themes found
  if (list.length === 0 && candidateGames.length > 1) {
    const alternateGameIds = candidateGames
      .map((c) => c.id)
      .filter((id) => id !== targetSystemGameId);

    if (alternateGameIds.length > 0) {
      let fallbackQuery = supabase
        .from('game_themes')
        .select('*, games(id, name, slug, game_type)')
        .in('game_id', alternateGameIds)
        .or('is_system.eq.true,organization_id.is.null');

      if (options.status !== 'all') {
        fallbackQuery = fallbackQuery.eq('status', 'active');
      }

      fallbackQuery = fallbackQuery.order('created_at', { ascending: true });

      const { data: fallbackData } = await fallbackQuery;
      if (fallbackData && fallbackData.length > 0) {
        console.warn(
          `[System Themes] Found ${fallbackData.length} themes under legacy system game(s): ${alternateGameIds.join(', ')}`
        );
        list = fallbackData;
      }
    }
  }

  // Step 5: Diagnostic Logging
  console.log('[System Themes]');
  console.log(`  requested gameId = ${gameId}`);
  console.log(`  organization game id = ${game ? (!game.is_system && game.organization_id ? game.id : 'N/A') : 'N/A'}`);
  console.log(`  organization game_type = ${game?.game_type || 'N/A'}`);
  console.log(`  resolved system game id = ${targetSystemGameId}`);
  console.log(`  resolved system game name = ${resolvedSystemGameName}`);
  console.log(`  resolved system game_type = ${resolvedSystemGameType}`);
  console.log(`  system theme count = ${list.length}`);

  if (list.length === 0) {
    console.log('[System Themes] No system themes found in DB, using canonical default theme');
    const targetGame = candidateGames.find((c) => c.id === targetSystemGameId) || candidateGames[0] || game;
    const gameType = targetGame?.game_type || resolvedSystemGameType || 'catch-brand';
    const defaultTheme = getDefaultThemeForGameType(gameType);
    list = [
      {
        id: `system-theme-${gameType}`,
        organization_id: null as any,
        game_id: isUUID(targetSystemGameId) ? targetSystemGameId : null,
        name: defaultTheme.name,
        slug: defaultTheme.slug,
        description: defaultTheme.description,
        status: 'active',
        is_system: true,
        is_default: true,
        branding: defaultTheme.branding,
        background_url: defaultTheme.background_url,
        basket_config: defaultTheme.basket_config,
        items_config: defaultTheme.items_config,
        physics_config: defaultTheme.physics_config,
        visuals_config: defaultTheme.visuals_config,
        sounds_config: defaultTheme.sounds_config,
        game_config: (defaultTheme as any).game_config,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        game: targetGame as any,
        game_type: gameType,
        game_slug: targetGame?.slug || gameType,
        game_name: targetGame?.name || defaultTheme.name,
      },
    ];
  }

  const enriched = await enrichThemesWithGameData(list, env, {
    fallbackGameId: targetSystemGameId,
    fallbackGameName: resolvedSystemGameName,
    fallbackGameSlug: resolvedSystemGameSlug,
    fallbackGameType: resolvedSystemGameType,
  });

  return enriched.map((item) => ({
    ...item,
    is_system: true,
    ownership_type: 'system',
  })) as GameThemeRecord[];
}

export async function getAllSystemThemes(env?: Record<string, any>): Promise<GameThemeRecord[]> {
  const supabase = getSupabaseServerClient(env);

  const { data, error } = await supabase
    .from('game_themes')
    .select('*, games(id, name, slug, game_type)')
    .or('is_system.eq.true,organization_id.is.null')
    .order('created_at', { ascending: true });

  if (error) {
    if (error.message?.includes('Placeholder') || error.code === 'PGRST000') {
      const now = new Date().toISOString();
      return [
        {
          id: 'default',
          organization_id: null as any,
          game_id: null,
          name: 'Default',
          slug: 'default',
          description: DEFAULT_CATCH_BRAND_THEME.description,
          status: 'active',
          is_system: true,
          is_default: true,
          branding: DEFAULT_CATCH_BRAND_THEME.branding,
          background_url: DEFAULT_CATCH_BRAND_THEME.background_url,
          basket_config: DEFAULT_CATCH_BRAND_THEME.basket_config,
          items_config: DEFAULT_CATCH_BRAND_THEME.items_config,
          physics_config: DEFAULT_CATCH_BRAND_THEME.physics_config,
          visuals_config: DEFAULT_CATCH_BRAND_THEME.visuals_config,
          sounds_config: DEFAULT_CATCH_BRAND_THEME.sounds_config,
          created_at: now,
          updated_at: now,
          game_name: 'Catch The Brand',
          game_slug: 'catch-brand',
          ownership_type: 'system',
        } as GameThemeRecord,
        {
          id: 'carnival',
          organization_id: null as any,
          game_id: null,
          name: 'Carnival',
          slug: 'carnival',
          description: 'Grand festive celebration theme: Catch golden carnival tickets and cosmic stars while dodging cursed hazard masks.',
          status: 'active',
          is_system: true,
          is_default: false,
          branding: DEFAULT_CARNIVAL_THEME.branding,
          background_url: DEFAULT_CARNIVAL_THEME.background_url,
          basket_config: DEFAULT_CARNIVAL_THEME.basket_config,
          items_config: DEFAULT_CARNIVAL_THEME.items_config,
          physics_config: DEFAULT_CARNIVAL_THEME.physics_config,
          visuals_config: DEFAULT_CARNIVAL_THEME.visuals_config,
          sounds_config: DEFAULT_CARNIVAL_THEME.sounds_config,
          created_at: now,
          updated_at: now,
          game_name: 'Catch The Brand',
          game_slug: 'catch-brand',
          ownership_type: 'system',
        } as GameThemeRecord,
        {
          id: 'theme-memory-match',
          organization_id: null as any,
          game_id: null,
          name: 'Brand Memory Match',
          slug: 'memory-match',
          description: DEFAULT_MEMORY_THEME.description,
          status: 'active',
          is_system: true,
          is_default: true,
          branding: DEFAULT_MEMORY_THEME.branding,
          background_url: DEFAULT_MEMORY_THEME.background_url,
          basket_config: DEFAULT_MEMORY_THEME.basket_config,
          items_config: DEFAULT_MEMORY_THEME.items_config,
          physics_config: DEFAULT_MEMORY_THEME.physics_config,
          visuals_config: DEFAULT_MEMORY_THEME.visuals_config,
          sounds_config: DEFAULT_MEMORY_THEME.sounds_config,
          game_config: (DEFAULT_MEMORY_THEME as any).game_config,
          created_at: now,
          updated_at: now,
          game_name: 'Brand Memory Match',
          game_slug: 'memory-match',
          ownership_type: 'system',
        } as GameThemeRecord,
      ];
    }
    console.error('Error in getAllSystemThemes:', error);
    throw new Error(`Failed to list all system themes: ${error.message}`);
  }

  const list = (data || []) as any[];
  const enriched = await enrichThemesWithGameData(list, env);
  return enriched.map((item) => ({
    ...item,
    is_system: true,
    ownership_type: 'system',
  })) as GameThemeRecord[];
}

export async function createSystemTheme(
  params: {
    game_id: string;
    name: string;
    slug?: string;
    description?: string | null;
    status?: 'active' | 'archived' | 'draft';
    is_default?: boolean;
    branding?: ThemeBrandingConfig;
    background_url?: string | null;
    basket_config?: ThemeBasketConfig;
    items_config?: ThemeDropItem[];
    physics_config?: ThemePhysicsConfig;
    visuals_config?: ThemeVisualsConfig;
    sounds_config?: ThemeSoundsConfig;
    layout?: any;
    game_config?: any;
  },
  env?: Record<string, any>
): Promise<GameThemeRecord> {
  const supabase = getSupabaseServerClient(env);
  const { getGameById } = await import('./games.js');

  let resolvedGameType = 'catch-brand';
  let targetGameName = 'Platform Game';
  let targetGameSlug = 'platform-game';

  // Verify the target game is a system game
  if (params.game_id) {
    const targetGame = await getGameById(params.game_id, env);
    if (targetGame && !targetGame.is_system && targetGame.organization_id) {
      throw new Error(
        'Cannot create a system theme for an organization game. Use the corresponding system game.'
      );
    }
    if (targetGame) {
      resolvedGameType = resolveServerGameType(targetGame.game_type, targetGame.slug, targetGame.name);
      targetGameName = targetGame.name;
      targetGameSlug = targetGame.slug;
    }
  }

  const defaultTemplate = getDefaultThemeForGameType(resolvedGameType);
  const isMemory = resolvedGameType === 'memory-match';
  const isMatch3 = resolvedGameType === 'match-3';
  const isReaction = resolvedGameType === 'reaction-tap' || resolvedGameType === 'reaction-time';

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const slug = params.slug || params.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  const defaultBranding: ThemeBrandingConfig = {
    gameTitle: params.name.toUpperCase(),
    subtitle: params.description || (isMemory ? 'Flip cards, match 8 pairs, and beat the clock!' : isMatch3 ? 'Swap tiles, create combos, and clear the board!' : isReaction ? 'React when the lights go out!' : 'Catch the falling items, avoid the hazards!'),
    logoUrl: null,
    clientLogoUrl: null,
  };

  const newTheme: GameThemeRecord = {
    id,
    organization_id: null,
    base_theme_id: null,
    game_id: params.game_id,
    is_system: true,
    ownership_type: 'system',
    is_default: params.is_default ?? false,
    name: params.name,
    slug,
    description: params.description ?? null,
    status: params.status || 'active',
    branding: params.branding ?? defaultBranding,
    background_url: params.background_url ?? defaultTemplate.background_url,
    basket_config: (isMemory || isReaction || isMatch3) ? (params.basket_config ?? null) : (params.basket_config ?? defaultTemplate.basket_config),
    items_config: params.items_config ?? defaultTemplate.items_config,
    physics_config: params.physics_config ?? defaultTemplate.physics_config,
    visuals_config: params.visuals_config ?? defaultTemplate.visuals_config,
    sounds_config: params.sounds_config ?? defaultTemplate.sounds_config,
    layout: params.layout ?? defaultTemplate.layout,
    game_config: params.game_config ?? (defaultTemplate as any).game_config ?? {},
    created_at: now,
    updated_at: now,
    game_name: targetGameName,
    game_slug: targetGameSlug,
    game_type: resolvedGameType,
  } as GameThemeRecord;

  if (!isSupabaseConfigured(env)) {
    localThemesCache.set(id, newTheme);
    return newTheme;
  }

  const { data, error } = await safeInsertTheme(supabase, {
    id,
    organization_id: null,
    base_theme_id: null,
    game_id: params.game_id,
    is_system: true,
    ownership_type: 'system',
    is_default: params.is_default ?? false,
    name: params.name,
    slug,
    description: params.description ?? null,
    status: params.status || 'active',
    branding: params.branding ?? defaultBranding,
    background_url: params.background_url ?? defaultTemplate.background_url,
    basket_config: (isMemory || isReaction || isMatch3) ? (params.basket_config ?? null) : (params.basket_config ?? defaultTemplate.basket_config),
    items_config: params.items_config ?? defaultTemplate.items_config,
    physics_config: params.physics_config ?? defaultTemplate.physics_config,
    visuals_config: params.visuals_config ?? defaultTemplate.visuals_config,
    sounds_config: params.sounds_config ?? defaultTemplate.sounds_config,
    layout: params.layout ?? defaultTemplate.layout,
    game_config: params.game_config ?? (defaultTemplate as any).game_config ?? {},
    created_at: now,
    updated_at: now,
  });

  if (error) {
    if (error.message?.includes('Placeholder') || error.code === 'PGRST000') {
      localThemesCache.set(id, newTheme);
      return newTheme;
    }
    console.error('Error in createSystemTheme:', error);
    throw new Error(`Failed to create system theme: ${error.message}`);
  }

  if (params.is_default && params.game_id) {
    // Unset any other defaults for this game
    await supabase
      .from('game_themes')
      .update({ is_default: false, updated_at: now })
      .eq('game_id', params.game_id)
      .or('is_system.eq.true,organization_id.is.null')
      .neq('id', id);
  }

  const item = data as any;
  return await enrichThemeWithGameData(item, env, {
    fallbackGameId: params.game_id,
  });
}

export async function setPrimaryDefaultSystemTheme(
  themeId: string,
  env?: Record<string, any>
): Promise<GameThemeRecord> {
  const supabase = getSupabaseServerClient(env);
  const now = new Date().toISOString();

  // 1. Load the selected theme
  const existing = await getThemeById(themeId, env);
  if (!existing) {
    throw new Error('Theme not found');
  }

  // 2. Verify it exists and has a game_id
  if (!existing.game_id) {
    throw new Error('Theme has no associated game_id');
  }

  // 3. Verify it is a system theme
  if (!existing.is_system && existing.organization_id) {
    throw new Error('Theme is not a system theme');
  }

  const gameId = existing.game_id;

  // 4. Set is_default = false for every other system theme belonging to the same game_id
  const { error: unsetError } = await supabase
    .from('game_themes')
    .update({ is_default: false, updated_at: now })
    .eq('game_id', gameId)
    .or('is_system.eq.true,organization_id.is.null')
    .neq('id', themeId);

  if (unsetError) {
    console.error('Error unsetting previous default themes:', unsetError);
  }

  // 5. Set is_default = true for the selected theme
  const { data: updatedData, error: updateError } = await safeUpdateTheme(supabase, themeId, {
    is_default: true,
    is_system: true,
    ownership_type: 'system',
    updated_at: now,
  });

  if (updateError) {
    console.error('Error in setPrimaryDefaultSystemTheme:', updateError);
    throw new Error(`Failed to set primary default theme: ${updateError.message}`);
  }

  // 6. Return the updated selected theme
  const item = updatedData as any;
  return await enrichThemeWithGameData(item, env, {
    fallbackGameId: gameId,
    fallbackGameName: existing.game_name,
    fallbackGameSlug: existing.game_slug,
  });
}

export async function unsetPrimaryDefaultSystemTheme(
  themeId: string,
  env?: Record<string, any>
): Promise<GameThemeRecord> {
  const supabase = getSupabaseServerClient(env);
  const now = new Date().toISOString();

  // 1. Load the selected theme
  const existing = await getThemeById(themeId, env);
  if (!existing) {
    throw new Error('Theme not found');
  }

  // 2. Verify it is a system theme
  if (!existing.is_system && existing.organization_id) {
    throw new Error('Theme is not a system theme');
  }

  // 3. Set is_default = false for the selected theme
  const { data: updatedData, error: updateError } = await safeUpdateTheme(supabase, themeId, {
    is_default: false,
    is_system: true,
    ownership_type: 'system',
    updated_at: now,
  });

  if (updateError) {
    console.error('Error in unsetPrimaryDefaultSystemTheme:', updateError);
    throw new Error(`Failed to unset primary default theme: ${updateError.message}`);
  }

  // 4. Return the updated selected theme
  const item = updatedData as any;
  return await enrichThemeWithGameData(item, env, {
    fallbackGameId: existing.game_id,
    fallbackGameName: existing.game_name,
    fallbackGameSlug: existing.game_slug,
  });
}

export async function updateSystemTheme(
  themeId: string,
  updates: Partial<Omit<GameThemeRecord, 'id' | 'organization_id' | 'created_at'>>,
  env?: Record<string, any>
): Promise<GameThemeRecord> {
  const existing = await getThemeById(themeId, env);
  const supabase = getSupabaseServerClient(env);
  const now = new Date().toISOString();

  const payload: any = {
    ...updates,
    is_system: true,
    ownership_type: 'system',
    updated_at: now,
  };

  const { data, error } = await safeUpdateTheme(supabase, themeId, payload);

  if (error) {
    console.error('Error in updateSystemTheme:', error);
    throw new Error(`Failed to update system theme: ${error.message}`);
  }

  const item = data as any;
  return await enrichThemeWithGameData(item, env, {
    fallbackGameId: existing?.game_id,
    fallbackGameName: existing?.game_name,
    fallbackGameSlug: existing?.game_slug,
  });
}

export async function deleteSystemTheme(themeId: string, env?: Record<string, any>): Promise<void> {
  if (!isUUID(themeId)) {
    throw new Error(`Invalid theme ID format: ${themeId}`);
  }
  const supabase = getSupabaseServerClient(env);

  // Check if any events reference this theme
  const { data: events } = await supabase
    .from('events')
    .select('id')
    .eq('game_theme_id', themeId)
    .limit(1);

  if (events && events.length > 0) {
    throw new Error('Cannot delete system theme: Active or past events are currently assigned to this theme.');
  }

  const { error } = await supabase.from('game_themes').delete().eq('id', themeId);
  if (error) {
    console.error('Error in deleteSystemTheme:', error);
    throw new Error(`Failed to delete system theme: ${error.message}`);
  }
}

export async function duplicateSystemTheme(
  themeId: string,
  newName?: string,
  env?: Record<string, any>
): Promise<GameThemeRecord> {
  const existing = await getThemeById(themeId, env);
  if (!existing) {
    throw new Error('System theme not found to duplicate');
  }

  const name = newName || `${existing.name} (Copy)`;
  const slug = `${existing.slug}-copy-${Date.now().toString().slice(-4)}`;

  return await createSystemTheme(
    {
      game_id: existing.game_id || '',
      name,
      slug,
      description: existing.description,
      status: 'draft',
      branding: existing.branding,
      background_url: existing.background_url,
      basket_config: existing.basket_config,
      items_config: existing.items_config,
      physics_config: existing.physics_config,
      visuals_config: existing.visuals_config,
      sounds_config: existing.sounds_config,
      layout: existing.layout,
      game_config: existing.game_config ?? {},
    },
    env
  );
}

function generateCloneThemeName(baseName: string, existingNames: string[]): string {
  if (!existingNames.includes(baseName)) {
    return baseName;
  }
  let copyNum = 2;
  while (existingNames.includes(`${baseName} (Copy ${copyNum})`)) {
    copyNum++;
  }
  return `${baseName} (Copy ${copyNum})`;
}

export async function cloneSystemThemeToOrg(
  systemThemeId: string,
  targetOrgId: string,
  targetGameId?: string,
  customName?: string,
  env?: Record<string, any>
): Promise<GameThemeRecord> {
  const systemTheme = await getThemeById(systemThemeId, env);
  if (!systemTheme) {
    throw new Error('System default theme not found to customize');
  }

  const supabase = getSupabaseServerClient(env);
  const resolvedSystemGameType = resolveServerGameType(systemTheme.game_type, systemTheme.game_slug || systemTheme.slug, systemTheme.name);

  let resolvedGameId = targetGameId;
  if (!resolvedGameId) {
    // Find organization's corresponding game by game_type / slug
    const { data: orgGames } = await supabase
      .from('games')
      .select('id, game_type, slug')
      .eq('organization_id', targetOrgId);
    if (orgGames && orgGames.length > 0) {
      const match = orgGames.find((g: any) =>
        resolveServerGameType(g.game_type, g.slug) === resolvedSystemGameType
      );
      resolvedGameId = match ? match.id : orgGames[0].id;
    }
  }

  let finalName = customName;
  if (!finalName) {
    const { data: existingThemes } = await supabase
      .from('game_themes')
      .select('name')
      .eq('organization_id', targetOrgId);

    const existingNames = (existingThemes || []).map((t: any) => t.name);
    finalName = generateCloneThemeName(systemTheme.name, existingNames);
  }

  const slug = `${systemTheme.slug}-${Date.now().toString().slice(-4)}-${Math.random().toString(36).substring(2, 6)}`;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const resolvedThemeGameType = resolvedSystemGameType;
  const fallbackDefaultTheme = getDefaultThemeForGameType(resolvedThemeGameType);

  const { data, error } = await safeInsertTheme(supabase, {
    id,
    organization_id: targetOrgId,
    game_id: resolvedGameId || systemTheme.game_id || null,
    base_theme_id: systemThemeId,
    is_system: false,
    ownership_type: 'organization',
    name: finalName,
    slug,
    description: systemTheme.description,
    status: 'active',
    branding: systemTheme.branding,
    background_url: (resolvedThemeGameType === 'memory-match') ? (systemTheme.background_url || null) : systemTheme.background_url,
    basket_config: (resolvedThemeGameType === 'memory-match' || resolvedThemeGameType === 'match-3' || resolvedThemeGameType === 'reaction-tap') ? null : systemTheme.basket_config,
    items_config: systemTheme.items_config?.length ? systemTheme.items_config : fallbackDefaultTheme.items_config,
    physics_config: (resolvedThemeGameType === 'memory-match') ? DEFAULT_MEMORY_THEME.physics_config : (systemTheme.physics_config || fallbackDefaultTheme.physics_config),
    visuals_config: systemTheme.visuals_config || fallbackDefaultTheme.visuals_config,
    sounds_config: systemTheme.sounds_config,
    layout: systemTheme.layout,
    game_config: systemTheme.game_config ?? (resolvedThemeGameType === 'memory-match' ? DEFAULT_MEMORY_THEME.game_config : {}),
    created_at: now,
    updated_at: now,
  });

  if (error) {
    console.error('Error in cloneSystemThemeToOrg:', error);
    throw new Error(`Failed to clone theme to organization: ${error.message}`);
  }

  const item = data as any;
  return await enrichThemeWithGameData(item, env, {
    fallbackGameId: resolvedGameId || systemTheme.game_id,
    fallbackGameName: systemTheme.game_name,
    fallbackGameSlug: systemTheme.game_slug,
  });
}

export async function cloneAllSystemThemesToOrg(
  targetOrgId: string,
  targetGameId: string,
  env?: Record<string, any>
): Promise<GameThemeRecord[]> {
  const supabase = getSupabaseServerClient(env);

  // 1. Retrieve active system themes for the given game only
  const systemThemes = await getSystemThemesByGameId(targetGameId, { status: 'active' }, env);
  if (!systemThemes || systemThemes.length === 0) {
    return [];
  }

  // 2. Retrieve existing theme names in org to calculate non-colliding copy numbers
  const { data: existingThemes } = await supabase
    .from('game_themes')
    .select('name')
    .eq('organization_id', targetOrgId);

  const existingNames: string[] = (existingThemes || []).map((t: any) => t.name);
  const clonedItems: any[] = [];

  for (const sysTheme of systemThemes) {
    const finalName = generateCloneThemeName(sysTheme.name, existingNames);
    existingNames.push(finalName);

    const slug = `${sysTheme.slug}-${Date.now().toString().slice(-4)}-${Math.random().toString(36).substring(2, 6)}`;
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const resolvedThemeGameType = resolveServerGameType(sysTheme.game_type, sysTheme.game_slug || sysTheme.slug, sysTheme.name);
    const fallbackDefaultTheme = getDefaultThemeForGameType(resolvedThemeGameType);
    const isNonBasket = resolvedThemeGameType === 'memory-match' || resolvedThemeGameType === 'match-3' || resolvedThemeGameType === 'reaction-tap';

    const { data, error } = await safeInsertTheme(supabase, {
      id,
      organization_id: targetOrgId,
      game_id: targetGameId,
      base_theme_id: sysTheme.id,
      is_system: false,
      ownership_type: 'organization',
      name: finalName,
      slug,
      description: sysTheme.description,
      status: 'active',
      branding: sysTheme.branding,
      background_url: (resolvedThemeGameType === 'memory-match') ? (sysTheme.background_url || null) : sysTheme.background_url,
      basket_config: isNonBasket ? null : sysTheme.basket_config,
      items_config: sysTheme.items_config?.length ? sysTheme.items_config : fallbackDefaultTheme.items_config,
      physics_config: (resolvedThemeGameType === 'memory-match') ? DEFAULT_MEMORY_THEME.physics_config : (sysTheme.physics_config || fallbackDefaultTheme.physics_config),
      visuals_config: sysTheme.visuals_config || fallbackDefaultTheme.visuals_config,
      sounds_config: sysTheme.sounds_config,
      layout: sysTheme.layout,
      game_config: sysTheme.game_config ?? (resolvedThemeGameType === 'memory-match' ? DEFAULT_MEMORY_THEME.game_config : {}),
      created_at: now,
      updated_at: now,
    });

    if (error) {
      console.error(`Error cloning system theme ${sysTheme.id}:`, error);
      throw new Error(`Failed to clone theme "${sysTheme.name}": ${error.message}`);
    }

    if (data) {
      clonedItems.push({
        ...data,
        game_name: sysTheme.game_name,
        game_slug: sysTheme.game_slug,
      });
    }
  }

  return await enrichThemesWithGameData(clonedItems, env, {
    fallbackGameId: targetGameId,
  });
}

export async function ensureSystemDefaultThemesForGame(
  gameId: string,
  gameType: string = 'catch-brand',
  env?: Record<string, any>
): Promise<GameThemeRecord[]> {
  const supabase = getSupabaseServerClient(env);
  const created: GameThemeRecord[] = [];

  // Filter presets based on gameType
  const relevantPresets = PRESET_THEMES.filter((p) => {
    if (gameType === 'match-3') {
      return p.slug === 'match-3' || p.slug.includes('match-3') || p.slug.includes('match3');
    }
    if (gameType === 'reaction-tap' || gameType === 'reaction-time') {
      return p.slug.includes('reaction');
    }
    if (gameType === 'memory-match') {
      return p.slug.includes('memory');
    }
    return !p.slug.includes('memory') && !p.slug.includes('reaction') && !p.slug.includes('match-3');
  });

  const presetsToSeed = relevantPresets.length > 0
    ? relevantPresets
    : [getDefaultThemeForGameType(gameType)];

  const defaultThemeForGame = getDefaultThemeForGameType(gameType);

  for (let i = 0; i < presetsToSeed.length; i++) {
    const preset = presetsToSeed[i];
    const isFirst = i === 0;

    try {
      // Check if system theme with this slug already exists to prevent duplicates and repair legacy URLs
      const { data: existingThemes } = await supabase
        .from('game_themes')
        .select('*')
        .or('is_system.eq.true,organization_id.is.null')
        .eq('slug', preset.slug);

      if (existingThemes && existingThemes.length > 0) {
        const existing = existingThemes[0];
        const needsRepair =
          existing.game_id !== gameId ||
          existing.background_url !== preset.background_url ||
          existing.basket_config?.imageUrl !== preset.basket_config?.imageUrl;

        if (needsRepair) {
          const { data: updatedTheme } = await supabase
            .from('game_themes')
            .update({
              game_id: gameId,
              background_url: preset.background_url,
              basket_config: preset.basket_config,
              items_config: preset.items_config,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id)
            .select()
            .single();

          if (updatedTheme) {
            created.push({
              ...updatedTheme,
              is_system: true,
              ownership_type: 'system',
              game_id: gameId,
            } as GameThemeRecord);
            continue;
          }
        }

        created.push({
          ...existing,
          is_system: true,
          ownership_type: 'system',
          game_id: gameId,
        } as GameThemeRecord);
        continue;
      }

      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const isMemory = gameType === 'memory-match';
      const isMatch3 = gameType === 'match-3';
      const isReaction = gameType === 'reaction-tap' || gameType === 'reaction-time';
      const { data } = await safeInsertTheme(supabase, {
        id,
        organization_id: null,
        game_id: gameId,
        is_system: true,
        ownership_type: 'system',
        is_default: isFirst,
        name: preset.name,
        slug: preset.slug,
        description: preset.description,
        status: 'active',
        branding: preset.branding,
        background_url: preset.background_url,
        basket_config: (isMemory || isMatch3 || isReaction) ? null : (preset.basket_config ?? defaultThemeForGame.basket_config),
        items_config: (isMatch3 || isReaction) ? [] : (preset.items_config ?? defaultThemeForGame.items_config),
        physics_config: preset.physics_config ?? defaultThemeForGame.physics_config,
        visuals_config: preset.visuals_config ?? defaultThemeForGame.visuals_config,
        sounds_config: preset.sounds_config ?? defaultThemeForGame.sounds_config,
        layout: (preset as any).layout ?? defaultThemeForGame.layout,
        game_config: (preset as any).game_config ?? (isMatch3 ? DEFAULT_MATCH3_THEME.game_config : isMemory ? DEFAULT_MEMORY_THEME.game_config : {}),
        created_at: now,
        updated_at: now,
      });

      if (data) {
        created.push({
          ...data,
          is_system: true,
          ownership_type: 'system',
          game_id: gameId,
        } as GameThemeRecord);
      }
    } catch (err: any) {
      console.warn('Could not seed system theme:', preset.name, err.message);
    }
  }

  return created;
}

/**
 * Ensures that the organization has games and default themes available.
 */
export async function ensureDefaultThemes(
  organizationId: string,
  orgName: string,
  env?: Record<string, any>
): Promise<GameThemeRecord[]> {
  const supabase = getSupabaseServerClient(env);

  // 1. Ensure games exist in this organization
  const { ensureDefaultGames } = await import('./games.js');
  const games = await ensureDefaultGames(organizationId, orgName, env);
  const mainGame = games[0];
  const memoryGame = games.find((g) => g.game_type === 'memory-match') || games[1];
  const reflexGame = games.find((g) => g.game_type === 'reaction-tap') || games[2];

  const existing = await getThemesByOrgId(organizationId, undefined, env);
  if (existing.length > 0) {
    // Backfill game_id if any existing theme lacks it
    for (const t of existing) {
      if (!t.game_id && mainGame) {
        await supabase
          .from('game_themes')
          .update({ game_id: mainGame.id })
          .eq('id', t.id);
        t.game_id = mainGame.id;
      }
    }
    return await getThemesByOrgId(organizationId, undefined, env);
  }

  const created: GameThemeRecord[] = [];

  for (let i = 0; i < PRESET_THEMES.length; i++) {
    const preset = PRESET_THEMES[i];
    const isFirst = i === 0;
    let targetGameId = mainGame?.id;
    if (preset.slug.includes('memory') && memoryGame) {
      targetGameId = memoryGame.id;
    } else if (preset.slug.includes('reflex') && reflexGame) {
      targetGameId = reflexGame.id;
    }

    const isMemory = preset.slug.includes('memory');
    const defaultLayoutTheme = getDefaultThemeForGameType(isMemory ? 'memory-match' : 'catch-brand');
    const theme = await createTheme(
      {
        organization_id: organizationId,
        game_id: targetGameId,
        name: isFirst ? (isMemory ? `${orgName} Memory Match` : `${orgName} Theme`) : preset.name,
        slug: preset.slug,
        description: preset.description,
        status: preset.status,
        branding: preset.branding,
        background_url: isMemory ? null : preset.background_url,
        basket_config: isMemory ? null : preset.basket_config,
        items_config: preset.items_config,
        physics_config: isMemory ? DEFAULT_MEMORY_THEME.physics_config : preset.physics_config,
        visuals_config: isMemory ? DEFAULT_MEMORY_THEME.visuals_config : preset.visuals_config,
        sounds_config: preset.sounds_config,
        layout: isMemory ? DEFAULT_MEMORY_THEME.layout : ((preset as any).layout ?? defaultLayoutTheme.layout),
      },
      env
    );
    created.push(theme);
  }

  return created;
}

export interface OrganizationThemeReadiness {
  hasValidTheme: boolean;
  themeCount: number;
  themeSetupRequired: boolean;
  suggestedThemeId: string | null;
  themes: GameThemeRecord[];
}

/**
 * Checks whether an organization has at least one valid, active, saved theme.
 * System themes and uncompleted onboarding drafts do NOT satisfy this check.
 */
export async function checkOrganizationThemeReadiness(
  organizationId: string,
  env?: Record<string, any>
): Promise<OrganizationThemeReadiness> {
  if (!organizationId) {
    return {
      hasValidTheme: false,
      themeCount: 0,
      themeSetupRequired: true,
      suggestedThemeId: null,
      themes: [],
    };
  }

  let allOrgThemes: GameThemeRecord[] = [];
  try {
    allOrgThemes = await getThemesByOrgId(organizationId, undefined, env);
  } catch (err) {
    console.warn('Could not query organization themes for readiness check, falling back:', err);
    return {
      hasValidTheme: true,
      themeCount: 1,
      themeSetupRequired: false,
      suggestedThemeId: null,
      themes: [],
    };
  }

  // A theme is valid for event creation if:
  // 1. It belongs to this organization
  // 2. It is not a system theme (is_system !== true && ownership_type !== 'system')
  // 3. Its status is 'active' (not 'draft' or 'archived')
  // 4. It is not an uncompleted onboarding draft (game_config?.is_onboarding_draft !== true)
  const validThemes = allOrgThemes.filter((t) => {
    if (!t || !t.id) return false;
    if (t.organization_id !== organizationId) return false;
    if (t.is_system === true || t.ownership_type === 'system') return false;
    if (t.status !== 'active') return false;
    if (t.game_config?.is_onboarding_draft === true) return false;
    return true;
  });

  return {
    hasValidTheme: validThemes.length > 0,
    themeCount: validThemes.length,
    themeSetupRequired: validThemes.length === 0,
    suggestedThemeId: validThemes[0]?.id || null,
    themes: validThemes,
  };
}

/**
 * Resolves or initializes the onboarding theme for a newly registered or theme-less organization.
 * Reuses existing themes if available without creating duplicate themes.
 */
export async function getOrCreateOnboardingTheme(
  organizationId: string,
  env?: Record<string, any>
): Promise<{
  theme: GameThemeRecord;
  isNew: boolean;
  isReady: boolean;
}> {
  if (!organizationId) {
    throw new Error('Organization ID is required');
  }

  // 1. Check existing themes for this organization
  const existingThemes = await getThemesByOrgId(organizationId, undefined, env);

  // If there's already an active customized theme, return it immediately
  const activeTheme = existingThemes.find((t) => {
    return (
      t.organization_id === organizationId &&
      t.is_system !== true &&
      t.ownership_type !== 'system' &&
      t.status === 'active' &&
      t.game_config?.is_onboarding_draft !== true
    );
  });

  if (activeTheme) {
    return {
      theme: activeTheme,
      isNew: false,
      isReady: true,
    };
  }

  // If there's an existing onboarding draft theme, return it without creating a duplicate
  const draftTheme = existingThemes.find((t) => {
    return (
      t.organization_id === organizationId &&
      t.is_system !== true &&
      t.ownership_type !== 'system' &&
      t.game_config?.is_onboarding_draft === true
    );
  });

  if (draftTheme) {
    return {
      theme: draftTheme,
      isNew: false,
      isReady: false,
    };
  }

  // 2. Otherwise, find a system template theme to clone
  let systemThemes = await getAllSystemThemes(env);
  if (!systemThemes || systemThemes.length === 0) {
    // Ensure default system themes exist
    await ensureDefaultThemes(organizationId, 'Organization', env);
    systemThemes = await getAllSystemThemes(env);
  }

  // Prefer Catch The Brand default system theme as onboarding starter
  const baseSystemTheme =
    systemThemes.find(
      (t) =>
        (t.game_slug === 'catch-brand' || t.game_type === 'catch-brand' || t.game_slug === 'catch-the-brand') &&
        (t.slug === 'default' || t.is_default) &&
        (t.is_system === true || t.ownership_type === 'system')
    ) ||
    systemThemes.find(
      (t) =>
        (t.game_slug === 'catch-brand' || t.game_type === 'catch-brand' || t.game_slug === 'catch-the-brand') &&
        (t.is_system === true || t.ownership_type === 'system')
    ) ||
    systemThemes[0];

  if (!baseSystemTheme) {
    throw new Error('No template theme available to initialize onboarding theme');
  }

  // Fetch organization name to personalize theme
  const supabase = getSupabaseServerClient(env);
  const { data: orgData } = await supabase
    .from('organizations')
    .select('name')
    .eq('id', organizationId)
    .maybeSingle();

  const orgName = orgData?.name || 'Brand';
  const customName = `${orgName} Theme`;

  // Clone template theme to organization
  const cloned = await cloneSystemThemeToOrg(
    baseSystemTheme.id,
    organizationId,
    undefined,
    customName,
    env
  );

  // Mark cloned theme as onboarding draft (status: draft, is_onboarding_draft: true)
  // until user customizes and saves it
  const updatedDraft = await updateTheme(
    cloned.id,
    {
      status: 'draft',
      game_config: {
        ...(cloned.game_config || {}),
        is_onboarding_draft: true,
      },
    },
    env
  );

  return {
    theme: updatedDraft,
    isNew: true,
    isReady: false,
  };
}
