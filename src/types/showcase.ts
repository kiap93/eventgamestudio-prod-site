export type ShowcaseStatus = 'DRAFT' | 'PUBLISHED' | 'UNPUBLISHED' | 'BLOCKED' | 'DELETED';
export type ReviewStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
export type PublicationStatus = 'UNPUBLISHED' | 'PUBLISHED';
export type RewardStatus = 'PENDING' | 'REWARDED' | 'NOT_ELIGIBLE';
export type RewardReviewStatus = 'NOT_ELIGIBLE' | 'AWAITING_APPROVAL' | 'REWARDED' | 'REJECTED';

export interface EventShowcase {
  id: string;
  event_id: string;
  organization_id: string;
  owner_user_id?: string | null;
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

export interface AdminShowcaseListItem extends EventShowcase {
  event_name?: string;
  organization_name?: string;
  organization_slug?: string;
  media_count?: number;
  image_count?: number;
  video_count?: number;
  owner_name?: string | null;
  owner_email?: string | null;
  event_status?: string | null;
  event_payment_status?: string | null;
  event_paid?: boolean;
  event_completed?: boolean;
  reward_eligibility?: any;
}

export interface ShowcaseFormData {
  title: string;
  description?: string;
  client_name?: string;
  client_logo_url?: string;
  cover_image_url?: string;
  status?: ShowcaseStatus;
}

export type ShowcaseMediaType = 'IMAGE' | 'VIDEO';

export interface EventShowcaseMedia {
  id: string;
  showcase_id: string;
  organization_id: string;
  media_type: ShowcaseMediaType;
  media_url: string;
  thumbnail_url: string | null;
  file_name: string;
  file_size: number;
  mime_type: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface UploadQueueItem {
  id: string;
  file: File;
  mediaType: ShowcaseMediaType;
  progress: number;
  status: 'pending' | 'uploading' | 'saving' | 'completed' | 'error';
  errorMessage?: string;
  previewUrl?: string;
  thumbnailUrl?: string;
  resultMedia?: EventShowcaseMedia;
}

export type ShowcaseRewardSubmissionStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface ShowcaseRewardSubmission {
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

export type ShowcaseRewardSubmissionRecord = ShowcaseRewardSubmission;

export interface ShowcaseRewardSubmissionAdminItem extends ShowcaseRewardSubmission {
  showcase_title?: string;
  event_name?: string;
  submitter_name?: string;
  submitter_email?: string;
  organization_id?: string;
  organization_name?: string;
  cover_image_url?: string | null;
  media_count?: {
    images: number;
    videos: number;
    total: number;
  };
}

