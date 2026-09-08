export interface UserRecord {
  id: string;
  google_id: string | null;
  email: string;
  name: string;
  avatar_url: string | null;
  is_developer?: boolean;
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
  email_status?: 'pending' | 'sent' | 'failed';
  email_sent_at?: string | null;
  email_error?: string | null;
}

export interface GoogleMailSettingsRecord {
  id: string;
  provider: 'google_mail';
  email_address: string;
  refresh_token_encrypted: string;
  enabled: boolean;
  status: 'connected' | 'error' | 'disconnected';
  last_error: string | null;
  last_connected_at: string | null;
  created_at: string;
  updated_at: string;
  connected_by: string | null;
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
  cardBackUrl?: string | null;
  cardFrontBg?: string;
  cardFrontBgOpacity?: number;
  cardGoodBg?: string;
  cardGoodBgOpacity?: number;
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
  movesHud?: GameLayoutElement;
  [key: string]: GameLayoutElement | undefined;
}

export interface GameThemeRecord {
  id: string;
  organization_id?: string | null;
  game_id?: string | null;
  game_name?: string;
  game_slug?: string;
  game_type?: string | null;
  name: string;
  slug: string;
  description: string | null;
  status: 'active' | 'archived' | 'draft';
  is_system?: boolean;
  is_default?: boolean;
  ownership_type?: 'system' | 'organization';
  base_theme_id?: string | null;
  branding: ThemeBrandingConfig;
  background_url: string | null;
  basket_config: ThemeBasketConfig | null;
  /**
   * @deprecated For Memory Match, game_config.pairs is the sole authoritative source of truth.
   * items_config is retained only as a legacy mirror to preserve schema compatibility with older database readers.
   */
  items_config: ThemeDropItem[];
  physics_config: ThemePhysicsConfig;
  visuals_config: ThemeVisualsConfig;
  styling?: any;
  sounds_config: ThemeSoundsConfig;
  layout?: GameLayoutConfig;
  game_config?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface GameRecord {
  id: string;
  organization_id?: string | null;
  name: string;
  slug: string;
  game_type: string;
  description?: string | null;
  icon_name?: string | null;
  status: 'active' | 'inactive' | 'archived' | 'draft';
  is_system?: boolean;
  ownership_type?: 'system' | 'organization';
  background_url: string | null;
  basket_config: BasketConfig | string | null;
  items_config: ItemConfig[] | string | null;
  settings_config: SettingsConfig | string | null;
  theme_count?: number;
  system_theme_count?: number;
  events_count?: number;
  created_at: string;
  updated_at: string;
}

export type EventLifecycleStatus = 'DRAFT' | 'PAYMENT_PENDING' | 'PENDING_PAYMENT' | 'SCHEDULED' | 'LIVE' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED';
export type PaymentLifecycleStatus = 'UNPAID' | 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';
export type EventCancelReason = 'USER_CANCELLED' | 'PAYMENT_TIMEOUT' | 'ADMIN_CANCELLED';

export type EventStatus = 'draft' | 'scheduled' | 'live' | 'expired' | 'cancelled' | 'pending_payment' | 'active' | 'completed';

export interface EventRecord {
  id: string;
  organization_id: string;
  game_id?: string | null;
  game_theme_id: string;
  name: string;
  event_date?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  starts_at: string;
  expires_at: string;
  status: EventStatus;
  event_status?: EventLifecycleStatus;
  payment_status?: PaymentLifecycleStatus | 'PENDING_PAYMENT';
  cancel_reason?: EventCancelReason | null;
  payment_mode?: PaymentMode;
  paid_amount?: number;
  discount_amount?: number;
  event_price?: number;
  event_currency?: string;
  public_token: string;
  test_scores_cleared_at?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventPricingRule {
  id: string;
  min_days: number;
  max_days: number | null; // null = unlimited (e.g., 91+ days)
  price: number;
  currency: string;
  active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface PlatformPricingSettings {
  default_price: number;
  default_currency: string;
  pricing_rules?: EventPricingRule[];
  updated_at?: string;
  updated_by?: string | null;
}

export interface EventWithDetails extends EventRecord {
  calculated_status?: EventStatus;
  setup_starts_at?: string;
  cancellation_eligibility?: EventCancellationEligibility;
  game_theme?: GameThemeRecord | null;
  game?: {
    id: string;
    name: string;
    slug: string;
    game_type: string;
    status?: string;
    description?: string | null;
    icon_name?: string | null;
  } | null;
  organization_name?: string;
  organization_slug?: string;
  showcase?: EventShowcaseRecord | null;
  showcase_status?: ShowcaseStatus | 'NOT_CREATED';
}

export type ShowcaseStatus = 'DRAFT' | 'PUBLISHED' | 'UNPUBLISHED' | 'BLOCKED' | 'DELETED';
export type ReviewStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
export type PublicationStatus = 'UNPUBLISHED' | 'PUBLISHED';
export type RewardStatus = 'PENDING' | 'REWARDED' | 'NOT_ELIGIBLE';
export type RewardReviewStatus = 'NOT_ELIGIBLE' | 'AWAITING_APPROVAL' | 'REWARDED' | 'REJECTED';

export interface EventShowcaseRecord {
  id: string;
  event_id: string;
  organization_id: string;
  title: string;
  description: string | null;
  client_name: string | null;
  client_logo_url: string | null;
  cover_image_url: string | null;
  status: ShowcaseStatus;
  review_status?: ReviewStatus;
  publication_status?: PublicationStatus;
  reward_review_status?: RewardReviewStatus;
  reward_reviewed_by?: string | null;
  reward_reviewed_at?: string | null;
  reward_rejection_reason?: string | null;
  moderated_by?: string | null;
  moderated_at?: string | null;
  moderation_reason?: string | null;
  deleted_at?: string | null;
  submitted_at?: string | null;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  rejection_reason?: string | null;
  reward_transaction_id?: string | null;
  reward_granted_at?: string | null;
  reward_status?: RewardStatus | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShowcaseModerationLog {
  id: string;
  showcase_id: string;
  moderator_id: string;
  action: 'BLOCK' | 'UNBLOCK' | 'DELETE' | 'RESTORE';
  reason: string;
  metadata?: Record<string, any>;
  created_at: string;
}

export type ShowcaseMediaType = 'IMAGE' | 'VIDEO';

export interface EventShowcaseMediaRecord {
  id: string;
  showcase_id: string;
  organization_id: string;
  media_type: ShowcaseMediaType;
  media_url: string;
  storage_path?: string | null;
  thumbnail_url: string | null;
  file_name: string;
  file_size: number;
  mime_type: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// ----------------------------------------------------
// WALLET ENGINE & TRANSACTION LEDGER TYPES
// ----------------------------------------------------

export type WalletBalanceType =
  | 'PAID_BALANCE'
  | 'WELCOME_CREDIT'
  | 'SHOWCASE_CREDIT'
  | 'TOPUP_CREDIT';

export type WalletTransactionType =
  | 'TOPUP'
  | 'TOPUP_CREDIT'
  | 'WELCOME_CREDIT'
  | 'SHOWCASE_CREDIT'
  | 'EVENT_PAYMENT'
  | 'CREDIT_USAGE'
  | 'WITHDRAWAL'
  | 'REFUND'
  | 'CREDIT_EXPIRY'
  | 'CREDIT_REVERSAL'
  | 'ADMIN_ADJUSTMENT';

export type WalletTransactionStatus =
  | 'PENDING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'REVERSED';

export interface OrganizationWalletRecord {
  id: string;
  organization_id: string;
  paid_balance: number;
  welcome_credit: number;
  showcase_credit: number;
  topup_credit: number;
  outstanding_balance?: number;
  currency: string;
  welcome_credit_granted: boolean;
  showcase_credit_granted: boolean;
  created_at: string;
  updated_at: string;
}

export interface WalletTransactionRecord {
  id: string;
  organization_id: string;
  event_id: string | null;
  transaction_type: WalletTransactionType;
  balance_type: WalletBalanceType;
  amount: number;
  currency: string;
  status: WalletTransactionStatus;
  reference_id: string | null;
  description: string;
  metadata: Record<string, any>;
  created_by: string | null;
  created_at: string;
}

export interface WalletBalanceSummary {
  organization_id: string;
  currency: string;
  paid_balance: number;
  welcome_credit: number;
  showcase_credit: number;
  topup_credit: number;
  outstanding_balance: number;
  total_balance: number;
  total_credit: number;
  welcome_credit_granted: boolean;
  showcase_credit_granted: boolean;
  can_use_welcome_credit: boolean;
  can_use_showcase_credit: boolean;
  updated_at: string;
}

export type PaymentMode = 'FULL_PAID' | 'WELCOME_CREDIT' | 'SHOWCASE_CREDIT' | 'TOPUP_CREDIT' | 'COMBINED_CREDIT';

export type EventCreditOption = 'NONE' | 'FULL_PAID' | 'WELCOME_CREDIT' | 'SHOWCASE_CREDIT' | 'TOPUP_CREDIT' | 'COMBINED_CREDIT';

export interface EventPaymentCalculation {
  eventPrice: number;
  paymentMode: PaymentMode;
  paidAmount: number;
  welcomeCreditUsed: number;
  showcaseCreditUsed: number;
  topupCreditUsed: number;
  totalDiscount: number;
  remainingPaidBalance: number;
  remainingCreditBalance: number;
  isPayable: boolean;
  reasons: string[];
  availableBalances: {
    paid_balance: number;
    welcome_credit: number;
    showcase_credit: number;
    topup_credit: number;
  };
}

export interface EventPaymentQuote {
  event_id?: string;
  standard_price: number;
  currency: string;
  credit_choice: EventCreditOption;
  credit_applied: number;
  paid_balance_required: number;
  total_payable: number;
  available_balances: {
    paid_balance: number;
    welcome_credit: number;
    showcase_credit: number;
    topup_credit: number;
  };
  is_payable: boolean;
  reasons: string[];
}

export interface CreditEligibilityResult {
  eligible: boolean;
  credit_type: 'WELCOME_CREDIT' | 'SHOWCASE_CREDIT';
  credit_available: number;
  credit_amount: number;
  paid_balance_available: number;
  paid_balance_required: number;
  event_price: number;
  reason?: string;
}

export type CancellationErrorCode =
  | 'ELIGIBLE_FOR_CANCELLATION'
  | 'PAYMENT_COMMITTED'
  | 'SETUP_DAY_STARTED'
  | 'EVENT_ACTIVE'
  | 'EVENT_COMPLETED'
  | 'EVENT_EXPIRED'
  | 'ALREADY_CANCELLED'
  | 'STATUS_NOT_CANCELLABLE';

export interface EventCancellationEligibility {
  canCancel: boolean;
  canRefund: boolean;
  rawStatus: string;
  calculatedStatus: string;
  setupDayStarted: boolean;
  setupStartsAt: string;
  startsAt: string;
  expiresAt: string;
  paymentStatus: string;
  refundPaidAmount: number;
  creditReversalAmount: number;
  creditType: PaymentMode | null;
  reason: string;
  code: CancellationErrorCode;
}

export interface EventRefundDetermination {
  canRefund: boolean;
  refundPaidAmount: number;
  creditReversalAmount: number;
  creditType: PaymentMode | null;
  paymentStatus: string;
  reason: string;
}

export interface TopupTiersInfo {
  tier1_min: number;
  tier1_rate: number;
  tier2_min: number;
  tier2_rate: number;
  preset_amounts: number[];
}

export interface TopupQuoteResponse {
  amount: number;
  currency: string;
  promo_credit: number;
  bonus_percentage: number;
  total_wallet_value: number;
  you_pay: number;
  current_wallet: WalletBalanceSummary;
  wallet_value_after_topup: {
    paid_balance: number;
    topup_credit: number;
    welcome_credit: number;
    showcase_credit: number;
    total_balance: number;
  };
  tiers: TopupTiersInfo;
}

export type TopupOrderStatus = 'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED' | 'CANCELLED';

export interface TopupOrderRecord {
  id: string;
  organization_id: string;
  user_id: string;
  currency: string;
  top_up_amount: number;
  expected_credit_amount: number;
  bonus_percentage?: number;
  total_wallet_value?: number;
  included_outstanding_amount?: number;
  payable_amount?: number;
  total_due?: number;
  status: TopupOrderStatus;
  payment_reference: string | null;
  payment_method?: string | null;
  notes?: string | null;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
  paid_at?: string | null;
  expired_at?: string | null;
  cancelled_at?: string | null;
  failed_at?: string | null;
  created_by?: string | null;
}

export interface PendingTopupOrder {
  order_id: string;
  organization_id: string;
  amount: number;
  currency: string;
  promo_credit: number;
  total_wallet_value: number;
  status: TopupOrderStatus;
  created_at: string;
  expires_at: string;
  created_by?: string;
  notes?: string;
}

export type WalletAuditEventType =
  | 'TOP_UP_CREATED'
  | 'PAYMENT_CREATED'
  | 'PAYMENT_COMPLETED'
  | 'WALLET_CREDITED'
  | 'WEBHOOK_RECEIVED'
  | 'REFUND_PROCESSED'
  | 'ADMIN_ADJUSTMENT'
  | 'ADMIN_RECONCILIATION'
  | 'UNAUTHORIZED_TOPUP_SETTLEMENT_ATTEMPT';

export interface WalletAuditRecord {
  id: string;
  organization_id: string;
  event_type: WalletAuditEventType;
  order_id?: string | null;
  payment_reference?: string | null;
  amount?: number | null;
  currency?: string | null;
  actor_id?: string | null;
  metadata?: Record<string, any>;
  timestamp: string;
}

// ----------------------------------------------------
// EVENT HIGH SCORES TYPES
// ----------------------------------------------------

export type ScoreEnvironment = 'PREVIEW' | 'TEST' | 'LIVE' | 'test' | 'live';

export interface EventHighScoreRecord {
  id: string;
  event_id: string;
  player_name: string;
  score: number;
  session_id?: string | null;
  score_environment?: 'test' | 'live' | 'TEST' | 'LIVE';
  score_mode?: 'TEST' | 'LIVE';
  is_test?: boolean;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface SubmitEventScoreParams {
  event_id: string;
  player_name?: string | null;
  score: number;
  session_id?: string | null;
  sessionId?: string | null;
  metadata?: Record<string, any>;
}

export interface EventLeaderboardEntry extends EventHighScoreRecord {
  rank: number;
}

export interface EventScoreStats {
  totalEntries: number;
  uniquePlayers: number;
  highScore: number;
  averageScore: number;
  latestScoreAt?: string | null;
  completedCount?: number;
  completionRate?: number;
  averageMoves?: number | null;
  averageDuration?: number | null;
  gameTypeBreakdown?: Record<
    string,
    {
      totalPlays: number;
      completedPlays: number;
      averageScore: number;
      highScore: number;
      averageMoves?: number | null;
      averageDuration?: number | null;
    }
  >;
}

// ----------------------------------------------------
// SHOWCASE MEDIA UPLOAD CONSTANTS
// ----------------------------------------------------

export const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

export const ALLOWED_AUDIO_MIME_TYPES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/ogg',
]);

export const ALLOWED_VIDEO_MIME_TYPES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
]);

export const MAX_IMAGE_SIZE = 25 * 1024 * 1024; // 25MB
export const MAX_VIDEO_SIZE = 200 * 1024 * 1024; // 200MB
export const MAX_DIRECT_UPLOAD_SIZE = 10 * 1024 * 1024; // 10MB direct in-memory upload limit (Worker / Express) to protect RAM

