import { getSupabaseServerClient } from '../supabase.js';
import { validateUploadedFile } from '../fileValidation.js';
import { ALLOWED_IMAGE_MIME_TYPES, ALLOWED_VIDEO_MIME_TYPES, MAX_DIRECT_UPLOAD_SIZE } from './types.js';
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
    fileSize?: number;
  },
  env?: Record<string, any>
): Promise<{
  signedUrl: string | null;
  token?: string | null;
  path: string;
  publicUrl: string;
  directUploadUrl: string | null;
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
  // Reserve Worker / Express direct upload strictly for small assets (<= 10MB) as a fallback
  const isEligibleForDirectUpload = !params.fileSize || params.fileSize <= MAX_DIRECT_UPLOAD_SIZE;
  const directUploadUrl: string | null = isEligibleForDirectUpload
    ? (params.eventId
        ? `/api/events/${encodeURIComponent(params.eventId)}/showcase/media/direct-upload?showcaseId=${encodeURIComponent(params.showcaseId)}&filename=${encodeURIComponent(uniqueName)}&path=${encodeURIComponent(storagePath)}`
        : `/api/events/showcase-media/direct-upload?${eventIdQuery}showcaseId=${encodeURIComponent(params.showcaseId)}&filename=${encodeURIComponent(uniqueName)}&path=${encodeURIComponent(storagePath)}`)
    : null;

  return {
    signedUrl,
    token,
    path: storagePath,
    publicUrl,
    directUploadUrl,
    bucket: SHOWCASE_BUCKET,
  };
}

/**
 * Derives the authoritative public CDN URL for a showcase media storage path.
 */
export function getShowcaseMediaPublicUrl(storagePath: string, env?: Record<string, any>): string {
  const supabase = getSupabaseServerClient(env);
  const { data } = supabase.storage.from(SHOWCASE_BUCKET).getPublicUrl(storagePath);
  const filename = storagePath.split('/').pop() || 'media';
  return data?.publicUrl || `/uploads/${filename}`;
}

export interface ValidateShowcaseMediaPathParams {
  storagePath?: string | null;
  bucket?: string | null;
  organizationId: string;
  showcaseId: string;
  mediaType: 'IMAGE' | 'VIDEO';
  clientMediaUrl?: string | null;
  clientThumbnailUrl?: string | null;
  env?: Record<string, any>;
}

export interface ValidatedShowcaseMediaResult {
  valid: boolean;
  error?: string;
  code?: string;
  statusCode?: number;
  authoritativeStoragePath: string;
  authoritativeMediaUrl: string;
  sanitizedThumbnailUrl: string | null;
  fileName: string;
  bucket: string;
}

/**
 * Authoritatively validates and resolves a showcase media storage path and public URL.
 * Strictly prevents clients from injecting arbitrary external URLs or cross-tenant paths.
 */
export function validateAndResolveShowcaseMediaPath(
  params: ValidateShowcaseMediaPathParams
): ValidatedShowcaseMediaResult {
  const rawPath = (params.storagePath || '').trim();

  // 1. Storage path is strictly required (no arbitrary client media_url allowed)
  if (!rawPath) {
    return {
      valid: false,
      error: 'storage_path (or upload_id) is required to register showcase media. Direct arbitrary media URLs are strictly prohibited.',
      code: 'STORAGE_PATH_REQUIRED',
      statusCode: 422,
      authoritativeStoragePath: '',
      authoritativeMediaUrl: '',
      sanitizedThumbnailUrl: null,
      fileName: '',
      bucket: SHOWCASE_BUCKET,
    };
  }

  // 2. Validate storage bucket
  const requestedBucket = (params.bucket || '').trim();
  if (requestedBucket && requestedBucket !== SHOWCASE_BUCKET) {
    return {
      valid: false,
      error: `Invalid storage bucket '${requestedBucket}'. Showcase media must reside in the dedicated '${SHOWCASE_BUCKET}' bucket.`,
      code: 'INVALID_STORAGE_BUCKET',
      statusCode: 422,
      authoritativeStoragePath: '',
      authoritativeMediaUrl: '',
      sanitizedThumbnailUrl: null,
      fileName: '',
      bucket: SHOWCASE_BUCKET,
    };
  }

  // 3. Normalize path: strip leading slashes or bucket name if passed
  let cleanPath = rawPath.replace(/^\/+/, '');
  if (cleanPath.startsWith(`${SHOWCASE_BUCKET}/`)) {
    cleanPath = cleanPath.slice(`${SHOWCASE_BUCKET}/`.length);
  }

  // 4. Verify path format and hierarchy: organizations/<organization_id>/showcases/<showcase_id>/<filename>
  const parts = cleanPath.split('/');
  if (parts.length < 5 || parts[0] !== 'organizations' || parts[2] !== 'showcases') {
    return {
      valid: false,
      error: `Invalid storage path hierarchy. Path must strictly match: organizations/<organization_id>/showcases/<showcase_id>/<filename>`,
      code: 'INVALID_STORAGE_PATH_HIERARCHY',
      statusCode: 422,
      authoritativeStoragePath: '',
      authoritativeMediaUrl: '',
      sanitizedThumbnailUrl: null,
      fileName: '',
      bucket: SHOWCASE_BUCKET,
    };
  }

  const pathOrgId = parts[1];
  const pathShowcaseId = parts[3];
  const filename = parts.slice(4).join('/');

  // 5. Tenant isolation check: path org must match event org
  if (pathOrgId !== params.organizationId) {
    return {
      valid: false,
      error: 'Unauthorized storage path: organization ID does not match the event organization.',
      code: 'STORAGE_PATH_ORGANIZATION_MISMATCH',
      statusCode: 403,
      authoritativeStoragePath: '',
      authoritativeMediaUrl: '',
      sanitizedThumbnailUrl: null,
      fileName: '',
      bucket: SHOWCASE_BUCKET,
    };
  }

  // 6. Showcase isolation check: path showcase must match target showcase
  if (pathShowcaseId !== params.showcaseId) {
    return {
      valid: false,
      error: 'Unauthorized storage path: showcase ID does not match the target showcase.',
      code: 'STORAGE_PATH_SHOWCASE_MISMATCH',
      statusCode: 403,
      authoritativeStoragePath: '',
      authoritativeMediaUrl: '',
      sanitizedThumbnailUrl: null,
      fileName: '',
      bucket: SHOWCASE_BUCKET,
    };
  }

  // 7. Prevent directory traversal and nested directories in filename
  if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return {
      valid: false,
      error: 'Invalid storage path: directory traversal or nested folders in media filename are strictly prohibited.',
      code: 'INVALID_STORAGE_FILENAME',
      statusCode: 422,
      authoritativeStoragePath: '',
      authoritativeMediaUrl: '',
      sanitizedThumbnailUrl: null,
      fileName: '',
      bucket: SHOWCASE_BUCKET,
    };
  }

  // 8. Reject SVG files
  const dotIdx = filename.lastIndexOf('.');
  const ext = dotIdx !== -1 ? filename.slice(dotIdx).toLowerCase() : '';
  if (ext === '.svg') {
    return {
      valid: false,
      error: 'SVG media uploads are not permitted for security reasons.',
      code: 'SVG_NOT_ALLOWED',
      statusCode: 422,
      authoritativeStoragePath: '',
      authoritativeMediaUrl: '',
      sanitizedThumbnailUrl: null,
      fileName: '',
      bucket: SHOWCASE_BUCKET,
    };
  }

  // 9. Validate extension against media type
  const isImage = params.mediaType === 'IMAGE';
  if (isImage) {
    const allowedImageExts = ['.png', '.jpg', '.jpeg', '.webp'];
    if (!allowedImageExts.includes(ext)) {
      return {
        valid: false,
        error: `Unsupported image format (${ext || 'no extension'}). Supported formats: PNG, JPEG, WEBP.`,
        code: 'UNSUPPORTED_FILE_TYPE',
        statusCode: 422,
        authoritativeStoragePath: '',
        authoritativeMediaUrl: '',
        sanitizedThumbnailUrl: null,
        fileName: '',
        bucket: SHOWCASE_BUCKET,
      };
    }
  } else {
    const allowedVideoExts = ['.mp4', '.webm', '.mov'];
    if (!allowedVideoExts.includes(ext)) {
      return {
        valid: false,
        error: `Unsupported video format (${ext || 'no extension'}). Supported formats: MP4, WEBM, MOV.`,
        code: 'UNSUPPORTED_FILE_TYPE',
        statusCode: 422,
        authoritativeStoragePath: '',
        authoritativeMediaUrl: '',
        sanitizedThumbnailUrl: null,
        fileName: '',
        bucket: SHOWCASE_BUCKET,
      };
    }
  }

  // 10. Authoritative public URL derivation & check clientMediaUrl
  const authoritativeStoragePath = `organizations/${params.organizationId}/showcases/${params.showcaseId}/${filename}`;
  const authoritativeMediaUrl = getShowcaseMediaPublicUrl(authoritativeStoragePath, params.env);

  if (params.clientMediaUrl && typeof params.clientMediaUrl === 'string') {
    const clientUrl = params.clientMediaUrl.trim();
    if (clientUrl.startsWith('http://') || clientUrl.startsWith('https://')) {
      const expectedSnippet = `/showcase-media/organizations/${params.organizationId}/showcases/${params.showcaseId}/${filename}`;
      if (!clientUrl.includes(expectedSnippet)) {
        return {
          valid: false,
          error: 'Arbitrary media_url is strictly rejected. Showcase media must originate from verified storage uploads in the dedicated showcase-media path.',
          code: 'ARBITRARY_MEDIA_URL_REJECTED',
          statusCode: 422,
          authoritativeStoragePath: '',
          authoritativeMediaUrl: '',
          sanitizedThumbnailUrl: null,
          fileName: '',
          bucket: SHOWCASE_BUCKET,
        };
      }
    } else if (!clientUrl.startsWith('/uploads/') && !clientUrl.startsWith('/storage/')) {
      return {
        valid: false,
        error: 'Arbitrary media_url is strictly rejected. Invalid URL scheme.',
        code: 'ARBITRARY_MEDIA_URL_REJECTED',
        statusCode: 422,
        authoritativeStoragePath: '',
        authoritativeMediaUrl: '',
        sanitizedThumbnailUrl: null,
        fileName: '',
        bucket: SHOWCASE_BUCKET,
      };
    }
  }

  // 11. Validate thumbnail_url if provided
  let sanitizedThumbnailUrl: string | null = null;
  if (params.clientThumbnailUrl && typeof params.clientThumbnailUrl === 'string') {
    const thumb = params.clientThumbnailUrl.trim();
    if (thumb.startsWith('data:image/')) {
      sanitizedThumbnailUrl = thumb;
    } else if (thumb.startsWith('/uploads/')) {
      sanitizedThumbnailUrl = thumb;
    } else if (thumb.startsWith('http://') || thumb.startsWith('https://')) {
      const expectedFolder = `/showcase-media/organizations/${params.organizationId}/showcases/${params.showcaseId}/`;
      if (!thumb.includes(expectedFolder)) {
        return {
          valid: false,
          error: 'Arbitrary thumbnail_url is strictly rejected. Thumbnails must belong to the tenant showcase folder.',
          code: 'ARBITRARY_THUMBNAIL_URL_REJECTED',
          statusCode: 422,
          authoritativeStoragePath: '',
          authoritativeMediaUrl: '',
          sanitizedThumbnailUrl: null,
          fileName: '',
          bucket: SHOWCASE_BUCKET,
        };
      }
      sanitizedThumbnailUrl = thumb;
    } else {
      return {
        valid: false,
        error: 'Invalid thumbnail_url format.',
        code: 'INVALID_THUMBNAIL_URL',
        statusCode: 422,
        authoritativeStoragePath: '',
        authoritativeMediaUrl: '',
        sanitizedThumbnailUrl: null,
        fileName: '',
        bucket: SHOWCASE_BUCKET,
      };
    }
  }

  return {
    valid: true,
    authoritativeStoragePath,
    authoritativeMediaUrl,
    sanitizedThumbnailUrl,
    fileName: filename,
    bucket: SHOWCASE_BUCKET,
  };
}

