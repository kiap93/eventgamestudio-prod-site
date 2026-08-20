export type ShowcaseStatus = 'DRAFT' | 'PUBLISHED' | 'UNPUBLISHED';

export interface EventShowcase {
  id: string;
  event_id: string;
  organization_id: string;
  title: string;
  description: string | null;
  client_name: string | null;
  client_logo_url: string | null;
  cover_image_url: string | null;
  status: ShowcaseStatus;
  published_at: string | null;
  created_at: string;
  updated_at: string;
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

