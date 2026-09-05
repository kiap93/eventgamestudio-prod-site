import { getSupabaseServerClient } from '../supabase.js';
import { validateUploadedFile } from '../fileValidation.js';
import { ALLOWED_IMAGE_MIME_TYPES, ALLOWED_VIDEO_MIME_TYPES } from './types.js';
import crypto from 'node:crypto';

export const ASSET_BUCKET = 'game-assets';
export const SHOWCASE_BUCKET = 'showcase-media';

export const ASSET_BUCKET_FILE_SIZE_LIMIT = 25 * 1024 * 1024; // 25MB
export const SHOWCASE_BUCKET_FILE_SIZE_LIMIT = 200 * 1024 * 1024; // 200MB

let bucketCheckPromise: Promise<void> | null = null;

export function resetStorageBucketCheckForTesting(): void {
  bucketCheckPromise = null;
}

export interface StorageBucketConfig {
  id: string;
  name: string;
  fileSizeLimit: number;
  allowedMimeTypes?: string[];
}

export const STORAGE_BUCKET_DEFINITIONS: StorageBucketConfig[] = [
  {
    id: ASSET_BUCKET,
    name: ASSET_BUCKET,
    fileSizeLimit: ASSET_BUCKET_FILE_SIZE_LIMIT, // 25MB
    allowedMimeTypes: [
      'image/png',
      'image/jpeg',
      'image/webp',
      'audio/mpeg',
      'audio/mp3',
      'audio/wav',
      'audio/ogg',
      'audio/aac',
    ],
  },
  {
    id: SHOWCASE_BUCKET,
    name: SHOWCASE_BUCKET,
    fileSizeLimit: SHOWCASE_BUCKET_FILE_SIZE_LIMIT, // 200MB
    allowedMimeTypes: [
      'image/png',
      'image/jpeg',
      'image/webp',
      'video/mp4',
      'video/webm',
      'video/quicktime',
    ],
  },
];

/**
 * Ensure that both storage buckets exist in Supabase Storage with correct file size limits:
 * - game-assets: 25MB (general assets: images, audio)
 * - showcase-media: 200MB (showcase media: images 25MB, videos up to 200MB)
 * Also actively upgrades existing buckets if their fileSizeLimit was previously configured lower.
 */
export async function ensureStorageBuckets(env?: Record<string, any>): Promise<void> {
  if (bucketCheckPromise) return bucketCheckPromise;

  bucketCheckPromise = (async () => {
    try {
      const supabase = getSupabaseServerClient(env);
      const { data: buckets, error } = await supabase.storage.listBuckets();
      if (error) {
        console.warn('Notice: Could not list storage buckets:', error.message);
        return;
      }

      for (const config of STORAGE_BUCKET_DEFINITIONS) {
        const existing = buckets?.find((b) => b.name === config.id || b.id === config.id);
        if (!existing) {
          const { error: createError } = await supabase.storage.createBucket(config.id, {
            public: true,
            fileSizeLimit: config.fileSizeLimit,
            allowedMimeTypes: config.allowedMimeTypes,
          });
          if (createError) {
            console.warn(`Notice: Could not auto-create bucket ${config.id}:`, createError.message);
          } else {
            console.log(`Successfully created Supabase Storage bucket: ${config.id} (${config.fileSizeLimit / (1024 * 1024)}MB limit)`);
          }
        } else {
          // If the bucket exists, update its fileSizeLimit to match the required architecture
          // (upgrading from the previous 10MB default conflict to 25MB for game-assets and 200MB for showcase-media).
          try {
            const { error: updateError } = await supabase.storage.updateBucket(config.id, {
              public: true,
              fileSizeLimit: config.fileSizeLimit,
              allowedMimeTypes: config.allowedMimeTypes,
            });
            if (updateError) {
              console.warn(`Notice: Could not update bucket ${config.id} settings:`, updateError.message);
            }
          } catch (updateErr: any) {
            console.warn(`Notice: Could not update bucket ${config.id}:`, updateErr?.message);
          }
        }
      }
    } catch (err: any) {
      console.warn('Storage bucket check warning:', err.message);
    }
  })();

  return bucketCheckPromise;
}

export const ensureStorageBucket = ensureStorageBuckets;

export const ALLOWED_ASSET_CATEGORIES = new Set([
  'logos',
  'backgrounds',
  'baskets',
  'items',
  'themes',
  'general',
  'branding',
  'audio',
  'showcases',
]);

export async function uploadGameAsset(
  params: {
    organizationId?: string;
    category?: 'logos' | 'backgrounds' | 'baskets' | 'items' | 'themes' | 'general' | 'branding' | 'audio' | 'showcases' | string;
    fileBuffer: Uint8Array | ArrayBuffer | Buffer;
    originalName: string;
    mimeType: string;
  },
  env?: Record<string, any>
): Promise<{ url: string; path: string }> {
  const rawCategory = (params.category || 'general').toLowerCase();
  const category = rawCategory.replace(/[^a-zA-Z0-9_-]/g, '') || 'general';

  let allowedMediaTypes: ('image' | 'audio' | 'video')[] | undefined;
  if (category === 'audio') {
    allowedMediaTypes = ['audio'];
  } else if (category === 'showcases') {
    allowedMediaTypes = ['image', 'video'];
  } else if (category === 'general') {
    allowedMediaTypes = ['image', 'audio', 'video'];
  } else {
    // logos, backgrounds, baskets, items, themes, branding
    allowedMediaTypes = ['image'];
  }

  const isShowcase = category === 'showcases';
  const targetBucket = isShowcase ? SHOWCASE_BUCKET : ASSET_BUCKET;
  const maxSizeBytes = isShowcase ? SHOWCASE_BUCKET_FILE_SIZE_LIMIT : ASSET_BUCKET_FILE_SIZE_LIMIT;

  // Authoritative validation of magic bytes, mime type, extension, and strict SVG rejection
  const validation = validateUploadedFile(params.fileBuffer, {
    originalName: params.originalName,
    declaredMime: params.mimeType,
    maxSizeBytes,
    allowedMediaTypes,
  });
  if (!validation.valid) {
    throw new Error(`File validation failed: ${validation.error}`);
  }

  const supabase = getSupabaseServerClient(env);
  await ensureStorageBuckets(env);

  const rawOrgId = params.organizationId || 'default';
  const orgId = rawOrgId.replace(/[^a-zA-Z0-9_-]/g, '') || 'default';
  
  const ext = validation.extension.replace(/[^a-zA-Z0-9.]/g, '') || '.png';

  const randomHex = Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const uniqueName = `${Date.now()}-${randomHex}${ext}`;
  const storagePath = `organizations/${orgId}/${category}/${uniqueName}`;

  const { error: uploadError } = await supabase.storage
    .from(targetBucket)
    .upload(storagePath, params.fileBuffer, {
      contentType: validation.mimeType || 'image/png',
      upsert: true,
    });

  if (uploadError) {
    console.error(`Supabase Storage (${targetBucket}) upload error:`, uploadError);
    throw new Error(`Failed to upload asset to Supabase Storage: ${uploadError.message}`);
  }

  const { data: publicData } = supabase.storage
    .from(targetBucket)
    .getPublicUrl(storagePath);

  if (!publicData || !publicData.publicUrl) {
    throw new Error('Failed to retrieve public URL from Supabase Storage');
  }

  return {
    url: publicData.publicUrl,
    path: storagePath,
  };
}

/**
 * Generate a signed upload URL from Supabase Storage (or fallback metadata)
 * for direct, non-JSON binary uploads of photos and large video files.
 */
export async function createSignedUploadUrlForShowcase(
  params: {
    organizationId: string;
    showcaseId: string;
    eventId?: string;
    fileName: string;
    mimeType: string;
    mediaType: 'IMAGE' | 'VIDEO';
  },
  env?: Record<string, any>
): Promise<{
  signedUrl: string | null;
  token?: string | null;
  path: string;
  publicUrl: string;
  directUploadUrl: string;
  bucket: string;
}> {
  const rawMime = (params.mimeType || '').toLowerCase().trim();
  const rawFileName = (params.fileName || '').trim();
  const dotIndex = rawFileName.lastIndexOf('.');
  const ext = dotIndex !== -1 ? rawFileName.slice(dotIndex).toLowerCase() : '';

  if (ext === '.svg' || rawMime.includes('svg')) {
    throw new Error('SVG uploads are not permitted for security reasons. Please upload raster images (PNG, JPEG, WEBP).');
  }

  if (params.mediaType === 'IMAGE') {
    if (!ALLOWED_IMAGE_MIME_TYPES.has(rawMime)) {
      throw new Error(`Unsupported image format (${params.mimeType}). Supported formats: PNG, JPEG, WEBP.`);
    }
  } else if (params.mediaType === 'VIDEO') {
    if (!ALLOWED_VIDEO_MIME_TYPES.has(rawMime)) {
      throw new Error(`Unsupported video format (${params.mimeType}). Supported formats: MP4, WEBM, MOV.`);
    }
  }

  const supabase = getSupabaseServerClient(env);
  await ensureStorageBuckets(env);

  const safeExt = ext || (params.mediaType === 'VIDEO' ? '.mp4' : '.png');

  const randomHex = Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const uniqueName = `${Date.now()}-${randomHex}${ext}`;
  const storagePath = `organizations/${params.organizationId}/showcases/${params.showcaseId}/${uniqueName}`;

  let signedUrl: string | null = null;
  let token: string | null = null;

  try {
    const { data: signedData, error: signedError } = await supabase.storage
      .from(SHOWCASE_BUCKET)
      .createSignedUploadUrl(storagePath);

    if (!signedError && signedData) {
      signedUrl = signedData.signedUrl;
      token = signedData.token;
    }
  } catch (err: any) {
    console.warn(`Could not generate Supabase signed upload URL for ${SHOWCASE_BUCKET}:`, err.message);
  }

  const { data: publicData } = supabase.storage
    .from(SHOWCASE_BUCKET)
    .getPublicUrl(storagePath);

  const publicUrl = publicData?.publicUrl || `/uploads/${uniqueName}`;
  const eventIdQuery = params.eventId ? `eventId=${encodeURIComponent(params.eventId)}&` : '';
  const directUploadUrl = params.eventId
    ? `/api/events/${encodeURIComponent(params.eventId)}/showcase/media/direct-upload?showcaseId=${encodeURIComponent(params.showcaseId)}&filename=${encodeURIComponent(uniqueName)}&path=${encodeURIComponent(storagePath)}`
    : `/api/events/showcase-media/direct-upload?${eventIdQuery}showcaseId=${encodeURIComponent(params.showcaseId)}&filename=${encodeURIComponent(uniqueName)}&path=${encodeURIComponent(storagePath)}`;

  return {
    signedUrl,
    token,
    path: storagePath,
    publicUrl,
    directUploadUrl,
    bucket: SHOWCASE_BUCKET,
  };
}

