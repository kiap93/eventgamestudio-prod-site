import {
  UserRecord,
  OrganizationRecord,
  OrgRole,
  EventRecord,
  GameRecord,
  WalletBalanceSummary,
  TopupOrderRecord,
  WalletTransactionRecord,
  EventLeaderboardEntry,
  EventScoreStats,
} from '../../server/db/types';

export * from '../../server/db/types';
export * from './developer';
export * from './showcase';

// Explicit re-exports to resolve TS2308 ambiguity between server/db/types and developer/showcase modules
export type {
  EventPricingRule,
  PlatformPricingSettings,
  PlatformContactSettings,
  ShowcaseStatus,
  ReviewStatus,
  PublicationStatus,
  RewardStatus,
  RewardReviewStatus,
  ShowcaseModerationLog,
  ShowcaseMediaType,
  ShowcaseRewardSubmissionStatus,
  ShowcaseRewardSubmissionRecord,
} from '../../server/db/types';

export type User = UserRecord;
export type Organization = OrganizationRecord & { role: OrgRole };

export interface GameSettings {
  soundEnabled: boolean;
  musicEnabled?: boolean;
  difficulty?: 'easy' | 'medium' | 'hard';
  soundVolume?: number;
  bgmVolume?: number;
}

export type DurianType = 'normal' | 'hazard' | 'bonus';

export interface GameState {
  score: number;
  timeRemaining: number;
  isPlaying: boolean;
  isGameOver: boolean;
  combo?: number;
  lives?: number;
}

export interface GameStats {
  goodItemsCaught?: number;
  badItemsAvoided?: number;
  bonusItemsCaught?: number;
  totalItems?: number;
  maxCombo?: number;
  accuracy?: number;
  timePlayedSeconds?: number;
}

export interface PublicEventDTO {
  id: string;
  name: string;
  public_token: string;
  slug?: string;
  start_date: string;
  end_date: string;
  game_id: string;
  theme_id?: string | null;
  status: string;
  payment_status: string;
  is_live: boolean;
  game_type?: string;
  branding?: any;
  theme?: any;
  custom_theme?: any;
  custom_name?: string | null;
}
