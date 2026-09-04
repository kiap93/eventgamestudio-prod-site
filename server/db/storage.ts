import { getSupabaseServerClient } from '../supabase.js';
import { validateUploadedFile } from '../fileValidation.js';
import { ALLOWED_IMAGE_MIME_TYPES, ALLOWED_VIDEO_MIME_TYPES } from './types.js';
import crypto from 'node:crypto';

export const ASSET_BUCKET = 'game-assets';

let bucketCheckPromise: Promise<void> | null = null;

/**
 * Ensure that the game-assets bucket exists in Supabase Storage.
 */
export async function ensureStorageBucket(env?: Record<string, any>): Promise<void> {
  if (bucketCheckPromise) return bucketCheckPromise;

  bucketCheckPromise = (async () => {
    try {
      const supabase = getSupabaseServerClient(env);
      const { data: buckets, error } = await supabase.storage.listBuckets();
      if (error) {
        console.warn('Notice: Could not list storage buckets:', error.message);
        return;
      }

      const exists = buckets?.some((b) => b.name === ASSET_BUCKET || b.id === ASSET_BUCKET);
      if (!exists) {
        const { error: createError } = await supabase.storage.createBucket(ASSET_BUCKET, {
          public: true,
          fileSizeLimit: 10485760, // 10MB
        });
        if (createError) {
          console.warn('Notice: Could not auto-create bucket game-assets:', createError.message);
        } else {
          console.log('Successfully created Supabase Storage bucket: game-assets');
        }
      }
    } catch (err: any) {
      console.warn('Storage bucket check warning:', err.message);
    }
  })();

  return bucketCheckPromise;
}

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
  // Authoritative validation of magic bytes, mime type, extension, and strict SVG rejection
  const validation = validateUploadedFile(params.fileBuffer, {
    originalName: params.originalName,
    declaredMime: params.mimeType,
    maxSizeBytes: 25 * 1024 * 1024,
  });
  if (!validation.valid) {
    throw new Error(`File validation failed: ${validation.error}`);
  }

  const supabase = getSupabaseServerClient(env);
  await ensureStorageBucket(env);

  const rawOrgId = params.organizationId || 'default';
  const orgId = rawOrgId.replace(/[^a-zA-Z0-9_-]/g, '') || 'default';
  const rawCategory = (params.category || 'general').toLowerCase();
  const category = rawCategory.replace(/[^a-zA-Z0-9_-]/g, '') || 'general';
  
  const ext = validation.extension.replace(/[^a-zA-Z0-9.]/g, '') || '.png';

  const randomHex = Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const uniqueName = `${Date.now()}-${randomHex}${ext}`;
  const storagePath = `organizations/${orgId}/${category}/${uniqueName}`;

  const { error: uploadError } = await supabase.storage
    .from(ASSET_BUCKET)
    .upload(storagePath, params.fileBuffer, {
      contentType: validation.mimeType || 'image/png',
      upsert: true,
    });

  if (uploadError) {
    console.error('Supabase Storage upload error:', uploadError);
    throw new Error(`Failed to upload asset to Supabase Storage: ${uploadError.message}`);
  }

  const { data: publicData } = supabase.storage
    .from(ASSET_BUCKET)
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
  await ensureStorageBucket(env);

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
      .from(ASSET_BUCKET)
      .createSignedUploadUrl(storagePath);

    if (!signedError && signedData) {
      signedUrl = signedData.signedUrl;
      token = signedData.token;
    }
  } catch (err: any) {
    console.warn('Could not generate Supabase signed upload URL:', err.message);
  }

  const { data: publicData } = supabase.storage
    .from(ASSET_BUCKET)
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
  };
}

