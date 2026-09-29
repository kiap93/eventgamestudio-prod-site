import { GameTheme, ThemeDropItem, ThemeDifficultyStage } from './themes/types';

export const APP_VERSION = '1.0.1';

export type GameState = 'START' | 'COUNTDOWN' | 'PLAYING' | 'PAUSED' | 'GAME_OVER';

export type DurianType = 'GREEN' | 'ORANGE' | 'GOLDEN' | 'GOOD' | 'BAD' | 'BONUS';

export interface DurianConfig {
  type: DurianType;
  scoreValue: number;
  textureKey: string;
  speedMin: number;
  speedMax: number;
}

export type DifficultyStage = ThemeDifficultyStage;

export interface GameStats {
  score: number;
  highScore: number;
  greenCaught: number; // good items caught
  orangeCaught: number; // hazard items caught
  goldenCaught: number; // bonus items caught
  duriansMissed: number; // legacy alias for missed items
  itemsMissed?: number; // generalized missed items count
  timeRemaining: number;
  // Dynamic breakdown map by item ID
  itemsCaughtById?: Record<string, number>;
}

export interface GameSettings {
  volume: number;
  soundEnabled: boolean;
  bgmEnabled: boolean;
  fallSpeedMultiplier: number;
  gameDurationSeconds: number;
  cameraControlEnabled?: boolean;
}

export * from './themes/types';

export type WalletBalanceType =
  | 'PAID_BALANCE'
  | 'WELCOME_CREDIT'
  | 'SHOWCASE_CREDIT'
  | 'TOPUP_CREDIT';

export type WalletTransactionType =
  | 'TOPUP'
  | 'WELCOME_CREDIT'
  | 'SHOWCASE_CREDIT'
  | 'TOPUP_CREDIT'
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
  reward_type: string;
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
  outstanding_balance?: number;
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

export interface EventQuoteOption {
  mode: PaymentMode;
  title: string;
  badge: string;
  isEligible: boolean;
  creditApplied: number;
  paidAmount: number;
  remainingPaidBalance: number;
  remainingCreditBalance: number;
  reasons: string[];
}

export const MAX_PENDING_EVENTS_PER_ORGANIZATION = 5;

export type EventLifecycleStatus = 'DRAFT' | 'PAYMENT_PENDING' | 'PENDING_PAYMENT' | 'SCHEDULED' | 'LIVE' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED';
export type PaymentLifecycleStatus = 'UNPAID' | 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';
export type EventCancelReason = 'USER_CANCELLED' | 'PAYMENT_TIMEOUT' | 'ADMIN_CANCELLED';

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
  status: 'draft' | 'scheduled' | 'live' | 'expired' | 'cancelled' | 'pending_payment' | 'active' | 'completed';
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
  created_at: string;
  updated_at: string;
}

export interface GameRecord {
  id: string;
  name: string;
  slug: string;
  game_type: string;
  description?: string | null;
  icon_name?: string | null;
  status: 'active' | 'draft' | 'archived' | string;
  theme_count?: number;
  event_count?: number;
  created_at: string;
  updated_at: string;
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
  calculated_status?: 'draft' | 'scheduled' | 'live' | 'expired' | 'cancelled' | 'pending_payment' | 'active';
  setup_starts_at?: string;
  cancellation_eligibility?: EventCancellationEligibility;
  deletion_eligibility?: EventDeletionEligibility;
  translations?: any;
  game_theme?: any;
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
  showcase?: any;
  showcase_status?: string;
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

export type SupportedPaymentMethod = 'card';

export interface PaymentMethodInfo {
  id: SupportedPaymentMethod;
  name: string;
  description: string;
  enabled: boolean;
}

export const SUPPORTED_PAYMENT_METHODS: readonly PaymentMethodInfo[] = [
  {
    id: 'card',
    name: 'Credit / Debit Card',
    description: 'Visa, Mastercard, American Express',
    enabled: true,
  },
] as const;

export interface PaymentCheckoutSession {
  sessionId: string;
  checkoutUrl: string;
  paymentReference: string;
  paymentMethod: string;
  orderId: string;
  amount: number;
  currency: string;
  expiresAt: string;
}

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

export * from './lib/notifications/types';

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

