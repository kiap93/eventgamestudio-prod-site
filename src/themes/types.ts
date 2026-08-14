export interface ThemeBrandingConfig {
  gameTitle: string;
  subtitle?: string;
  logoUrl?: string | null;
  clientLogoUrl?: string | null;
}

export interface ThemeDropItem {
  id: string;
  name: string;
  imageUrl?: string | null;
  points: number;
  speedMultiplier: number;
  spawnWeight: number; // 1 - 100 relative weight
  enabled: boolean;
  isHazard: boolean;
  isBonus?: boolean;
  collisionRadiusRatio?: number;
  collisionCenterXRatio?: number;
  collisionCenterYRatio?: number;
}

export interface ThemeBasketConfig {
  name: string;
  imageUrl?: string | null;
  width: number;
  height: number;
  catchAreaRatio: number;
  speed: number;
  collisionWidthRatio?: number;
  collisionHeightRatio?: number;
  collisionOffsetYRatio?: number;
}

export interface ThemeDifficultyStage {
  timeThreshold: number; // seconds elapsed
  spawnInterval: number; // ms
  speedMin: number;
  speedMax: number;
  hazardRatio: number; // 0.0 to 1.0
  bonusRatio: number; // 0.0 to 1.0
  stageName: string;
}

export interface ThemePhysicsConfig {
  gameDurationSeconds: number;
  baseFallSpeed: number;
  fallSpeedMultiplier: number;
  spawnIntervalMin: number;
  spawnIntervalMax: number;
  difficultyStages: ThemeDifficultyStage[];
}

export interface ThemeVisualsConfig {
  particleGood?: string;
  particleBad?: string;
  particleBonus?: string;
  primary?: string;
  secondary?: string;
  accent?: string;
  hudColor?: string;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  textColor?: string;
  cardGoodBg?: string;
  cardGoodBorder?: string;
  cardBadBg?: string;
  cardBadBorder?: string;
  bgGradientFrom?: string;
  bgGradientVia?: string;
  bgGradientTo?: string;
}

export interface ThemeSoundsConfig {
  catchGood?: string | null;
  catchBad?: string | null;
  catchBonus?: string | null;
  gameStart?: string | null;
  gameOver?: string | null;
  bgm?: string | null;
  catchGoodUrl?: string | null;
  catchBadUrl?: string | null;
  catchBonusUrl?: string | null;
  gameStartUrl?: string | null;
  gameOverUrl?: string | null;
  bgmUrl?: string | null;
  soundVolume?: number;
  soundEnabled?: boolean;
  bgmEnabled?: boolean;
  bgmMelody?: 'arcade' | 'festive_chime' | 'cny_pentatonic' | 'spooky_synth';
  goodCatchPitch?: 'high_ping' | 'festive_bell' | 'gong' | 'plop';
  hazardTone?: 'low_buzz' | 'spooky_screech' | 'firecracker_pop';
}

export interface GameLayoutElement {
  visible: boolean;
  x: number; // percentage from left (0 to 100)
  y: number; // percentage from top (0 to 100)
  width?: number; // percentage of game width (0 to 100)
  height?: number; // percentage of game height (0 to 100)
}

export interface GameLayoutConfig {
  clientLogo: GameLayoutElement;
  scoreHud: GameLayoutElement;
  timer: GameLayoutElement;
  gameTitle: GameLayoutElement;
  footerSponsor: GameLayoutElement;
  [key: string]: GameLayoutElement | undefined;
}

/**
 * Single Source of Truth for a Game Theme
 */
export interface GameTheme {
  id: string;
  organization_id?: string;
  name: string;
  slug: string;
  base_theme_id?: string;
  description?: string | null;
  status: 'active' | 'archived' | 'draft';
  is_active: boolean;

  // Configuration groups
  branding: ThemeBrandingConfig;
  background_url: string;
  basket_config: ThemeBasketConfig;
  items_config: ThemeDropItem[];
  physics_config: ThemePhysicsConfig;
  visuals_config: ThemeVisualsConfig;
  sounds_config: ThemeSoundsConfig;
  layout?: GameLayoutConfig;

  // Convenience / Backward-compatibility properties
  gameTitle?: string;
  subtitle?: string;
  background?: string;
  catcher?: string;
  catcherName?: string;
  fallingObject?: string;
  fallingObjectName?: string;
  badFallingObject?: string;
  badFallingObjectName?: string;
  bonusFallingObject?: string;
  bonusFallingObjectName?: string;
  logo?: string;
  clientLogo?: string;
  colors?: ThemeVisualsConfig;
  sounds?: ThemeSoundsConfig;
  particles?: {
    good?: string;
    bad?: string;
    bonus?: string;
  };
}
