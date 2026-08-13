import { getSupabaseServerClient } from '../supabase.js';
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

export async function uploadGameAsset(
  params: {
    organizationId?: string;
    category?: 'logos' | 'backgrounds' | 'baskets' | 'items' | 'themes' | 'general';
    fileBuffer: Uint8Array | ArrayBuffer | Buffer;
    originalName: string;
    mimeType: string;
  },
  env?: Record<string, any>
): Promise<{ url: string; path: string }> {
  const supabase = getSupabaseServerClient(env);
  await ensureStorageBucket(env);

  const orgId = params.organizationId || 'default';
  const category = params.category || 'general';
  
  const dotIndex = params.originalName.lastIndexOf('.');
  const ext = dotIndex !== -1 ? params.originalName.slice(dotIndex) : '.png';

  const randomHex = Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const uniqueName = `${Date.now()}-${randomHex}${ext}`;
  const storagePath = `organizations/${orgId}/${category}/${uniqueName}`;

  const { error: uploadError } = await supabase.storage
    .from(ASSET_BUCKET)
    .upload(storagePath, params.fileBuffer, {
      contentType: params.mimeType || 'image/png',
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
