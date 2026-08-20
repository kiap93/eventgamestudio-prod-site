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

