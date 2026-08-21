import { GameTheme, ThemeDropItem, ThemeDifficultyStage } from './themes/types';

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
  duriansMissed: number; // missed items
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
  total_balance: number;
  total_credit: number;
  welcome_credit_granted: boolean;
  showcase_credit_granted: boolean;
  can_use_welcome_credit: boolean;
  can_use_showcase_credit: boolean;
  updated_at: string;
}

export type PaymentMode = 'FULL_PAID' | 'WELCOME_CREDIT' | 'SHOWCASE_CREDIT' | 'TOPUP_CREDIT';

export type EventCreditOption = 'NONE' | 'FULL_PAID' | 'WELCOME_CREDIT' | 'SHOWCASE_CREDIT' | 'TOPUP_CREDIT';

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

export interface EventRecord {
  id: string;
  organization_id: string;
  game_theme_id: string;
  name: string;
  event_date?: string | null;
  starts_at: string;
  expires_at: string;
  status: 'draft' | 'scheduled' | 'live' | 'expired' | 'cancelled';
  payment_status?: 'PAID' | 'UNPAID' | 'REFUNDED';
  payment_mode?: PaymentMode;
  paid_amount?: number;
  discount_amount?: number;
  public_token: string;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export type CancellationErrorCode =
  | 'ELIGIBLE_FOR_CANCELLATION'
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

export interface EventWithDetails extends EventRecord {
  calculated_status?: 'draft' | 'scheduled' | 'live' | 'expired' | 'cancelled';
  setup_starts_at?: string;
  cancellation_eligibility?: EventCancellationEligibility;
  game_theme?: any;
  game?: {
    id: string;
    name: string;
    slug: string;
    game_type: string;
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

