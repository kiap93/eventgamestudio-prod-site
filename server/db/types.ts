export interface UserRecord {
  id: string;
  google_id: string | null;
  email: string;
  name: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export type OrgRole = 'owner' | 'admin' | 'designer' | 'viewer';

export interface OrganizationRecord {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  logo_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrgMemberRecord {
  id: string;
  organization_id: string;
  user_id: string;
  role: OrgRole;
  created_at: string;
}

export interface OrgMemberWithUser extends OrgMemberRecord {
  user: {
    id: string;
    email: string;
    name: string;
    avatar_url: string | null;
  };
}

export interface OrgInvitationRecord {
  id: string;
  organization_id: string;
  email: string;
  role: OrgRole;
  token_hash: string;
  invited_by: string;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
}

export interface BasketConfig {
  name: string;
  imageUrl: string | null;
  width: number;
  height: number;
  catchAreaRatio: number;
  speed?: number;
  [key: string]: any;
}

export interface ItemConfig {
  id: string;
  name: string;
  points: number;
  speedMultiplier: number;
  spawnWeight?: number;
  enabled: boolean;
  isHazard: boolean;
  isBonus?: boolean;
  imageUrl?: string | null;
  collisionRadiusRatio?: number;
  collisionCenterXRatio?: number;
  collisionCenterYRatio?: number;
  [key: string]: any;
}

export interface SettingsConfig {
  durationSeconds: number;
  baseFallSpeed: number;
  spawnRateMultiplier: number;
  soundVolume: number;
  soundEnabled?: boolean;
  bgmEnabled?: boolean;
  cameraControlEnabled?: boolean;
  [key: string]: any;
}

// ----------------------------------------------------
// THEME ARCHITECTURE TYPES (SINGLE SOURCE OF TRUTH)
// ----------------------------------------------------

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
  spawnWeight: number; // relative weight e.g. 1-100
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
  timeThreshold: number; // in seconds elapsed
  spawnInterval: number; // in ms
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
  catchGoodUrl?: string | null;
  catchBadUrl?: string | null;
  catchBonusUrl?: string | null;
  gameStartUrl?: string | null;
  gameOverUrl?: string | null;
  bgmUrl?: string | null;
  soundVolume?: number;
  soundEnabled?: boolean;
  bgmEnabled?: boolean;
}

export interface GameLayoutElement {
  visible: boolean;
  x: number; // percentage relative to game viewport width (0-100)
  y: number; // percentage relative to game viewport height (0-100)
  width?: number; // percentage relative to game viewport width (0-100)
  height?: number; // percentage relative to game viewport height (0-100)
}

export interface GameLayoutConfig {
  clientLogo: GameLayoutElement;
  scoreHud: GameLayoutElement;
  timer: GameLayoutElement;
  gameTitle: GameLayoutElement;
  footerSponsor: GameLayoutElement;
  [key: string]: GameLayoutElement | undefined;
}

export interface GameThemeRecord {
  id: string;
  organization_id: string;
  game_id?: string | null;
  game_name?: string;
  game_slug?: string;
  name: string;
  slug: string;
  description: string | null;
  status: 'active' | 'archived' | 'draft';
  is_active: boolean;
  branding: ThemeBrandingConfig;
  background_url: string | null;
  basket_config: ThemeBasketConfig;
  items_config: ThemeDropItem[];
  physics_config: ThemePhysicsConfig;
  visuals_config: ThemeVisualsConfig;
  sounds_config: ThemeSoundsConfig;
  layout?: GameLayoutConfig;
  created_at: string;
  updated_at: string;
}

export interface GameRecord {
  id: string;
  organization_id: string;
  active_theme_id?: string | null;
  name: string;
  slug: string;
  game_type: string;
  description?: string | null;
  icon_name?: string | null;
  status: 'active' | 'archived' | 'draft';
  background_url: string | null;
  basket_config: BasketConfig | string | null;
  items_config: ItemConfig[] | string | null;
  settings_config: SettingsConfig | string | null;
  theme_count?: number;
  created_at: string;
  updated_at: string;
}

export type EventStatus = 'draft' | 'scheduled' | 'live' | 'expired' | 'cancelled';

export interface EventRecord {
  id: string;
  organization_id: string;
  game_theme_id: string;
  name: string;
  event_date?: string | null;
  starts_at: string;
  expires_at: string;
  status: EventStatus;
  public_token: string;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventWithDetails extends EventRecord {
  calculated_status?: EventStatus;
  game_theme?: GameThemeRecord | null;
  game?: {
    id: string;
    name: string;
    slug: string;
    game_type: string;
  } | null;
  organization_name?: string;
  organization_slug?: string;
}
