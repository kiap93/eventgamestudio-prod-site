export interface UserRecord {
  id: string;
  google_id: string | null;
  email: string;
  name: string;
  avatar_url: string | null;
  is_developer?: boolean;
  password_hash?: string | null;
  email_verified?: boolean;
  verified_at?: string | null;
  verification_token_hash?: string | null;
  verification_token_expires_at?: string | null;
  password_reset_token_hash?: string | null;
  password_reset_expires_at?: string | null;
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
  country_code: string | null;
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
  verification_code_hash?: string | null;
  verification_code_expires_at?: string | null;
  verification_attempts?: number;
  last_code_sent_at?: string | null;
  phone?: string | null;
  channel?: 'email' | 'whatsapp' | 'both';
  invitation_status?: 'pending' | 'accepted' | 'expired' | 'revoked';
  whatsapp_status?: 'never_sent' | 'initiated' | 'delivered' | 'read' | 'failed';
  whatsapp_initiated_at?: string | null;
  accepted_user_id?: string | null;
  customer_company_id?: string | null;
  customer_recipient_id?: string | null;
  notes?: string | null;
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
  asset_theme_id?: string | null;
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
  event_timezone?: string | null;
  setup_starts_at?: string | null;
  pricing_id?: string | null;
  pricing_country?: string | null;
  duration_days?: number | null;
  created_at: string;
  updated_at: string;
}

export interface GamePricingRecord {
  id: string;
  game_id: string;
  country_code: string; // ISO 3166-1 alpha-2 (e.g. 'MY', 'US')
  min_days: number;
  max_days: number | null; // null = unlimited (e.g., 91+ days)
  price: number;
  currency: string;
  is_active: boolean;
  is_base: boolean;
  created_at: string;
  updated_at: string;
}

export type GamePricingTier = GamePricingRecord;

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
  default_pricing_country?: string;
  pricing_rules?: EventPricingRule[];
  updated_at?: string;
  updated_by?: string | null;
}

export interface PlatformContactSettings {
  whatsapp_number: string;
  whatsapp_display: string;
  whatsapp_prefill_message: string;
  enquiry_email: string;
  support_hours: string;
  office_location: string;
  updated_at?: string;
  updated_by?: string | null;
}

export interface PlatformInvoiceSettings {
  company_name: string;
  registration_number: string;
  tax_number: string;
  tax_id?: string;
  email: string;
  phone: string;
  address: string;
  website: string;
  default_tax_rate: number;
  payment_terms_days: number;
  notes_template?: string;
  updated_at?: string;
  updated_by?: string | null;
}


export interface PublicEventDTO {
  id: string;
  name: string;
  public_token?: string;
  game: {
    id: string;
    name: string;
    slug?: string;
    game_type: string;
  } | null;
  theme: any | null;
  game_theme?: any | null;
  branding: {
    organization_name?: string;
    logo_url?: string | null;
    client_logo_url?: string | null;
    game_title?: string;
    subtitle?: string | null;
    primary_color?: string;
    accent_color?: string;
    hud_color?: string;
    [key: string]: any;
  } | null;
  start_date: string;
  end_date: string;
  live_open_date: string;
  event_timezone?: string | null;
  description?: string | null;
  translations?: Array<Record<string, any>> | Record<string, any> | null;
}

export interface EventWithDetails extends EventRecord {
  calculated_status?: EventStatus;
  setup_starts_at?: string;
  cancellation_eligibility?: EventCancellationEligibility;
  deletion_eligibility?: EventDeletionEligibility;
  translations?: any;
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
  game_id?: string | null;
  owner_user_id?: string | null;
  created_by?: string | null;
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

export interface OwnerShowcaseRewardRecord {
  id?: string;
  owner_user_id: string;
  organization_id: string;
  event_id: string;
  showcase_id: string;
  transaction_id: string | null;
  amount: number;
  rewarded_at: string;
  created_at: string;
}

export type ShowcaseRewardSubmissionStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface ShowcaseRewardSubmissionRecord {
  id: string;
  showcase_id: string;
  event_id: string;
  user_id: string;
  status: ShowcaseRewardSubmissionStatus;
  reward_amount: number;
  submitted_at: string;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  rejection_reason?: string | null;
  reward_transaction_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShowcaseModerationLog {
  id: string;
  showcase_id: string;
  moderator_id: string;
  action: 'BLOCK' | 'UNBLOCK' | 'DELETE' | 'RESTORE' | 'APPROVE_REWARD' | 'REJECT_REWARD';
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
  owner_user_id?: string | null;
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

export interface UserRewardRecord {
  id: string;
  user_id: string;
  reward_type: string; // 'WELCOME_CREDIT'
  organization_id: string | null;
  transaction_id: string | null;
  amount: number;
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
  currency?: string;
  pricingCountry?: string | null;
  isFallback?: boolean;
  durationDays?: number;
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
  event_price?: number;
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
  | 'EVENT_NOT_PAID'
  | 'STATUS_NOT_CANCELLABLE';

export type DeletionErrorCode =
  | 'ELIGIBLE_FOR_DELETION'
  | 'EVENT_PAID'
  | 'SETUP_DAY_STARTED'
  | 'EVENT_LIVE'
  | 'EVENT_ENDED'
  | 'ALREADY_CANCELLED'
  | 'EVENT_DELETE_NOT_ALLOWED';

export type EventDetailedLifecycle =
  | 'BEFORE_SETUP_DAY'
  | 'SETUP_DAY'
  | 'LIVE'
  | 'COMPLETED'
  | 'EXPIRED'
  | 'CANCELLED';

export interface EventDeletionEligibility {
  canDelete: boolean;
  code: DeletionErrorCode;
  reason: string;
  lifecycle: EventDetailedLifecycle;
  paymentStatus: string;
  isPaid: boolean;
}

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

// ----------------------------------------------------
// CENTRAL NOTIFICATION SYSTEM TYPES
// ----------------------------------------------------
export * from '../notifications/types.js';

// ----------------------------------------------------
// CONTACT ENQUIRY SYSTEM TYPES
// ----------------------------------------------------

export type ContactEnquiryStatus = 'new' | 'in_review' | 'contacted' | 'resolved' | 'archived';
export type ContactEmailStatus = 'pending' | 'sent' | 'failed' | 'not_configured';

export interface ContactEnquiryRecord {
  id: string;
  ticket_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  company: string | null;
  category: string;
  event_date: string | null;
  expected_attendees: string | null;
  message: string;
  status: ContactEnquiryStatus;
  email_status: ContactEmailStatus;
  email_sent_at: string | null;
  email_error: string | null;
  email_message_id: string | null;
  recipient_email: string;
  idempotency_key: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateContactEnquiryParams {
  id?: string;
  ticket_id?: string;
  full_name: string;
  email: string;
  phone?: string | null;
  company?: string | null;
  category?: string;
  event_date?: string | null;
  expected_attendees?: string | null;
  message: string;
  status?: ContactEnquiryStatus;
  email_status?: ContactEmailStatus;
  email_sent_at?: string | null;
  email_error?: string | null;
  email_message_id?: string | null;
  recipient_email?: string;
  idempotency_key?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
}

export type SalesPartnerStatus = 'pending' | 'active' | 'suspended' | 'rejected';

export interface SalesPartnerProfileRecord {
  id: string;
  user_id: string;
  status: SalesPartnerStatus;
  applied_at: string;
  activated_at: string | null;
  suspended_at: string | null;
  agency_name?: string | null;
  application_notes?: string | null;
  admin_notes?: string | null;
  custom_commission_rate?: number | null;
  first_order_commission_rate?: number | null;
  repeat_order_commission_rate?: number | null;
  created_at: string;
  updated_at: string;
}

export interface SalesPartnerAdminNotesRecord {
  id: string;
  partner_user_id: string;
  admin_notes: string;
  updated_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface SalesPartnerProfileWithUser extends SalesPartnerProfileRecord {
  user: {
    id: string;
    email: string;
    name: string;
    avatar_url: string | null;
  };
  referral_code?: string;
  referral_url?: string;
  total_attributions?: number;
  approved_attributions?: number;
  total_commissions_earned?: number;
}

export interface SalesPartnerAuditLogRecord {
  id: string;
  partner_user_id: string;
  sales_partner_id: string;
  previous_status: SalesPartnerStatus | null;
  new_status: SalesPartnerStatus;
  action: 'APPLIED' | 'ACTIVATED' | 'SUSPENDED' | 'REACTIVATED' | 'REJECTED' | 'UPDATED' | 'RATE_CHANGED';
  actor_user_id: string | null;
  reason: string | null;
  metadata?: Record<string, any> | null;
  created_at: string;
}

export interface SalesCatalogGamePricing {
  has_pricing: boolean;
  requires_quote: boolean;
  base_price: number | null;
  currency: string | null;
  country_code: string;
  is_fallback?: boolean;
  tiers: Array<{
    id?: string;
    min_days: number;
    max_days: number | null;
    price: number;
    currency: string;
    is_base: boolean;
  }>;
}

export interface SalesCatalogGameItem {
  id: string;
  slug: string;
  game_type: string;
  name: string;
  description: string;
  category: string;
  icon_name: string;
  cover_image: string;
  status: 'active';
  supports_preview: boolean;
  default_duration: string;
  orientations: string[];
  input_types: string[];
  customization_options: Array<{ title: string; description: string }>;
  suitable_event_types: Array<{ name: string; why: string }>;
  how_it_works: Array<{ step: string; title: string; desc: string }>;
  pricing: SalesCatalogGamePricing;
  default_theme_id?: string;
}

export interface SalesCatalogGameDetail extends SalesCatalogGameItem {
  system_themes: Array<{
    id: string;
    name: string;
    thumbnail_url?: string | null;
    background_url?: string | null;
    is_default?: boolean;
  }>;
}

export interface SalesCatalogResponse {
  success: true;
  requested_country: string;
  pricing_country: string;
  currency: string;
  games: SalesCatalogGameItem[];
}

// ============================================================================
// PHASE 4: SALES REFERRALS, ATTRIBUTION, & AUDIT HISTORY
// ============================================================================

export interface SalesReferralCodeRecord {
  id: string;
  sales_partner_id: string;
  partner_user_id: string;
  code: string;
  is_active: boolean;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
}

export type AttributionStatus = 'pending' | 'approved' | 'rejected' | 'reassigned' | 'needs_review';

export interface CustomerAttributionRecord {
  id: string;
  sales_partner_id: string;
  partner_user_id: string;
  referral_code: string;
  referral_method: 'link' | 'code' | 'admin_lead' | 'direct';
  prospect_email: string | null;
  referred_user_id: string | null;
  organization_id: string | null;
  status: AttributionStatus;
  is_self_referral: boolean;
  is_existing_customer: boolean;
  is_competing_claim: boolean;
  competing_attribution_id: string | null;
  review_reason: string | null;
  decision_reason: string | null;
  decided_by_user_id: string | null;
  decided_at: string | null;
  established_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomerAttributionWithDetails extends CustomerAttributionRecord {
  partner: {
    id: string;
    user_id: string;
    name: string;
    email: string;
    status: SalesPartnerStatus;
  };
  referred_user?: {
    id: string;
    name: string;
    email: string;
  } | null;
  organization?: {
    id: string;
    name: string;
    slug: string;
    owner_id: string;
  } | null;
  competing_attribution?: any | null;
}

export interface CustomerAttributionAuditLogRecord {
  id: string;
  attribution_id: string;
  previous_status: string | null;
  new_status: string;
  previous_partner_id: string | null;
  new_partner_id: string | null;
  action: 'CREATED' | 'APPROVED' | 'REJECTED' | 'REASSIGNED' | 'FLAGGED_REVIEW' | 'ORG_LINKED';
  reason: string | null;
  actor_user_id: string | null;
  metadata?: Record<string, any> | null;
  created_at: string;
}

// ============================================================================
// PHASE 5: COMMISSION LEDGER, ELIGIBILITY, OPPORTUNITIES & PAYOUT PREPARATION
// ============================================================================

export type SalesCommissionStatus = 'pending_review' | 'approved' | 'paid' | 'voided' | 'clawback';
export type SalesCommissionOrderType = 'first_order' | 'repeat_order' | 'approved_opportunity';

export interface SalesCommissionRecord {
  id: string;
  sales_partner_id: string;
  partner_user_id: string;
  customer_attribution_id: string;
  organization_id: string;
  event_id: string;
  opportunity_id: string | null;
  order_type: SalesCommissionOrderType;
  event_price: number;
  promo_discount_amount: number;
  cash_collected_amount: number;
  commission_rate: number;
  commission_amount: number;
  original_commission_rate?: number;
  original_commission_amount?: number;
  calculation_version?: number;
  adjustment_amount?: number;
  adjustment_reason?: string | null;
  currency: string;
  status: SalesCommissionStatus;
  eligibility_date: string;
  order_placement_date?: string | null;
  payment_date?: string | null;
  refund_reference?: string | null;
  event_start_date: string | null;
  event_end_date: string | null;
  event_completion_date?: string | null;
  is_delivery_completed?: boolean;
  notes: string | null;
  approved_by_user_id: string | null;
  approved_at: string | null;
  payout_batch_id: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SalesCommissionWithDetails extends SalesCommissionRecord {
  partner?: {
    id: string;
    user_id: string;
    name: string;
    email: string;
    status: SalesPartnerStatus;
  };
  organization?: {
    id: string;
    name: string;
    slug: string;
    owner_id: string;
  } | null;
  event?: {
    id: string;
    name: string;
    status: string;
    event_status: string;
    start_date: string | null;
    end_date: string | null;
  } | null;
  opportunity?: {
    id: string;
    title: string;
    status: string;
  } | null;
}

export type SalesOpportunityStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'consumed';

export interface SalesOpportunityRecord {
  id: string;
  sales_partner_id: string;
  partner_user_id: string;
  organization_id: string;
  customer_attribution_id: string | null;
  title: string;
  description: string | null;
  expected_event_date: string | null;
  status: SalesOpportunityStatus;
  valid_until: string | null;
  decided_by_user_id: string | null;
  decided_at: string | null;
  decision_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface SalesOpportunityWithDetails extends SalesOpportunityRecord {
  partner?: {
    id: string;
    user_id: string;
    name: string;
    email: string;
  };
  organization?: {
    id: string;
    name: string;
    slug: string;
  } | null;
}

export type SalesPayoutBatchStatus = 'draft' | 'pending_approval' | 'approved' | 'paid' | 'cancelled';

export interface SalesPayoutBatchRecord {
  id: string;
  batch_reference: string;
  created_by_user_id: string;
  total_amount: number;
  currency: string;
  total_commissions: number;
  commission_count?: number;
  total_partners: number;
  status: SalesPayoutBatchStatus;
  payment_reference: string | null;
  payment_notes: string | null;
  paid_at: string | null;
  paid_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SalesCommissionAuditLogRecord {
  id: string;
  commission_id: string;
  action: 'CREATED' | 'APPROVED' | 'VOIDED' | 'CLAWBACK' | 'BATCHED' | 'PAID' | 'ADJUSTED';
  previous_status: string | null;
  new_status: string;
  previous_amount: number | null;
  new_amount: number | null;
  actor_user_id: string | null;
  reason: string | null;
  metadata?: Record<string, any> | null;
  created_at: string;
}

export interface PlatformSalesCommissionSettings {
  first_order_commission_rate: number;
  repeat_order_commission_rate: number;
  repeat_window_months: number;
  require_delivery_completion: boolean;
  minimum_payout_amount: number;
  updated_at: string;
}

export interface PartnerCommissionSummary {
  total_earned: number;
  pending_review: number;
  ready_for_payout: number;
  total_paid: number;
  currency: string;
  total_events: number;
}

export interface SalesPartnerCustomerRecord {
  id: string;
  organization_id: string | null;
  organization_name: string;
  organization_slug?: string | null;
  attribution_id: string;
  attribution_status: AttributionStatus;
  referral_code: string;
  referral_method: 'link' | 'code' | 'admin_lead' | 'direct';
  contact_email: string | null;
  contact_name: string | null;
  established_at: string | null;
  created_at: string;
  total_events: number;
  total_paid_events: number;
  total_commissions_earned: number;
  total_commissions_pending: number;
  currency: string;
  window_status: 'active' | 'expired' | 'no_orders';
  window_end_date: string | null;
  days_remaining: number | null;
  active_opportunity_exists: boolean;
  latest_activity_at: string | null;
}

export interface SalesPartnerCustomerDetailRecord extends SalesPartnerCustomerRecord {
  attribution: CustomerAttributionWithDetails;
  events: Array<{
    id: string;
    name: string;
    status: string;
    payment_status: string;
    event_price: number;
    start_date: string | null;
    end_date: string | null;
    created_at: string;
  }>;
  commissions: SalesCommissionWithDetails[];
  opportunities: SalesOpportunityWithDetails[];
}

export interface SalesDashboardNextActionRecord {
  id: string;
  type: 'pending_review' | 'expiring_window' | 'pending_opportunity' | 'unclaimed_activation' | 'ready_payout';
  title: string;
  description: string;
  action_label: string;
  action_url: string;
  badge_variant?: 'warning' | 'info' | 'success';
}

export interface SalesDashboardSummaryRecord {
  total_attributed_customers: number;
  pending_attributions: number;
  approved_attributions: number;
  total_commissions_earned: number;
  commissions_pending_review: number;
  commissions_pending_review_count: number;
  approved_awaiting_payout: number;
  approved_awaiting_payout_count: number;
  total_commissions_paid: number;
  total_commissions_paid_count: number;
  currency: string;
  next_actions: SalesDashboardNextActionRecord[];
  recent_customers: SalesPartnerCustomerRecord[];
  recent_commissions: SalesCommissionWithDetails[];
}


