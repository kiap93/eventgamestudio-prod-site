import { DifficultyStage } from '../types';

export const GAME_WIDTH = 1024;
export const GAME_HEIGHT = 576;

/**
 * Game Countdown Duration (in seconds) default value.
 */
export const GAME_DURATION_SECONDS = 20;

export const HIGH_SCORE_STORAGE_KEY = 'durian_catcher_high_score_v1';

export const SCORE_VALUES = {
  GREEN: 10,
  ORANGE: -10,
  GOLDEN: 50,
};

// ============================================================================
// COLLISION BODY CONSTANTS & RATIOS (Pixel-Accurate Opening & Fruit Core Matching)
// ============================================================================

/**
 * Basket Collision Ratios:
 * The basket PNG image (651x383) contains transparent padding around the artwork.
 * The top rim opening is where falling items enter the basket.
 * These ratios derive the exact top rim opening catch rectangle relative to texture size.
 */
// Opening width ratio (~72.35% of total PNG frame width, fitting 70%~80% specification)
export const BASKET_COLLISION_WIDTH_RATIO = 0.7235;

// Opening height ratio (~13% of texture height, resulting in ~10-15px height in display scale)
export const BASKET_COLLISION_HEIGHT_RATIO = 0.13;

// Vertical offset ratio from top of PNG frame to top rim opening (accounts for ~128px top transparent padding)
export const BASKET_COLLISION_OFFSET_Y_RATIO = 0.3394;

/**
 * Durian Collision Ratios:
 * Fits a centered circular collision body tightly around the inner fruit core,
 * ignoring outer spiky tips and top stem.
 */
// Radius ratio relative to texture width (30% gives inner fruit body core radius)
export const DURIAN_SIZE = 66; // Display size enlarged 10% from 60px
export const DURIAN_COLLISION_RADIUS_RATIO = 0.30;

// Center position ratios of the inner fruit body inside the texture frame
export const DURIAN_CENTER_X_RATIO = 0.50;
export const DURIAN_CENTER_Y_RATIO = 0.54;

/**
 * Configurable falling speed constants for durians.
 * DURIAN_FALL_SPEED defines the primary base fall speed (pixels/sec).
 * DURIAN_FALL_SPEED_MULTIPLIER significantly speeds up falling velocity.
 */
export const DURIAN_FALL_SPEED = 500;
export const DURIAN_FALL_SPEED_MULTIPLIER = 0.7;

// Progressive difficulty stages automatically scaling with GAME_DURATION_SECONDS:
export const DIFFICULTY_STAGES: DifficultyStage[] = [
  {
    timeThreshold: 0,
    spawnInterval: 1000,
    speedMin: 350,
    speedMax: 500,
    hazardRatio: 0.2,
    bonusRatio: 0.05,
    stageName: 'Stage 1: Calm Forest',
  },
  {
    timeThreshold: Math.floor(GAME_DURATION_SECONDS / 3),
    spawnInterval: 750,
    speedMin: 400,
    speedMax: 600,
    hazardRatio: 0.3,
    bonusRatio: 0.08,
    stageName: 'Stage 2: Breezy Grove',
  },
  {
    timeThreshold: Math.floor((GAME_DURATION_SECONDS * 2) / 3),
    spawnInterval: 550,
    speedMin: 500,
    speedMax: 700,
    hazardRatio: 0.4,
    bonusRatio: 0.12,
    stageName: 'Stage 3: Durian Storm!',
  },
];
