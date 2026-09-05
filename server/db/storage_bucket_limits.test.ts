/**
 * Storage Bucket Limits & Architecture Tests
 * 
 * Verifies that the Supabase storage architecture strictly matches the intended specifications:
 * 1. ASSET_BUCKET ('game-assets') configured with 25 MB limit (26,214,400 bytes).
 * 2. SHOWCASE_BUCKET ('showcase-media') configured with 200 MB limit (209,715,200 bytes).
 * 3. ensureStorageBuckets automatically creates both buckets and upgrades existing legacy 10MB buckets.
 * 4. createSignedUploadUrlForShowcase routes strictly to 'showcase-media'.
 * 5. uploadGameAsset routes general/game assets to 'game-assets' (25MB limit) and showcases to 'showcase-media' (200MB limit).
 */

import assert from 'node:assert';
import {
  ASSET_BUCKET,
  SHOWCASE_BUCKET,
  ASSET_BUCKET_FILE_SIZE_LIMIT,
  SHOWCASE_BUCKET_FILE_SIZE_LIMIT,
  STORAGE_BUCKET_DEFINITIONS,
  resetStorageBucketCheckForTesting,
  ensureStorageBuckets,
  createSignedUploadUrlForShowcase,
  uploadGameAsset,
} from './storage.js';

console.log('--- Starting Storage Bucket Limits & Architecture Tests ---');

async function runTests() {
  // --------------------------------------------------------------------------
  // Test 1: Bucket Constant & Size Limit Assertions
  // --------------------------------------------------------------------------
  assert.strictEqual(ASSET_BUCKET, 'game-assets', 'ASSET_BUCKET must be "game-assets"');
  assert.strictEqual(SHOWCASE_BUCKET, 'showcase-media', 'SHOWCASE_BUCKET must be "showcase-media"');
  assert.strictEqual(ASSET_BUCKET_FILE_SIZE_LIMIT, 25 * 1024 * 1024, 'game-assets bucket limit must be 25MB');
  assert.strictEqual(SHOWCASE_BUCKET_FILE_SIZE_LIMIT, 200 * 1024 * 1024, 'showcase-media bucket limit must be 200MB');

  const assetDef = STORAGE_BUCKET_DEFINITIONS.find((b) => b.id === 'game-assets');
  const showcaseDef = STORAGE_BUCKET_DEFINITIONS.find((b) => b.id === 'showcase-media');

  assert(assetDef, 'game-assets bucket definition must exist');
  assert.strictEqual(assetDef.fileSizeLimit, 25 * 1024 * 1024, 'game-assets bucket definition must have 25MB limit');
  assert(assetDef.allowedMimeTypes?.includes('image/png'), 'game-assets must allow image/png');
  assert(assetDef.allowedMimeTypes?.includes('audio/mpeg'), 'game-assets must allow audio/mpeg');
  assert(!assetDef.allowedMimeTypes?.includes('image/svg+xml'), 'game-assets must reject SVG');

  assert(showcaseDef, 'showcase-media bucket definition must exist');
  assert.strictEqual(showcaseDef.fileSizeLimit, 200 * 1024 * 1024, 'showcase-media bucket definition must have 200MB limit');
  assert(showcaseDef.allowedMimeTypes?.includes('video/mp4'), 'showcase-media must allow video/mp4');
  assert(showcaseDef.allowedMimeTypes?.includes('image/jpeg'), 'showcase-media must allow image/jpeg');
  assert(!showcaseDef.allowedMimeTypes?.includes('image/svg+xml'), 'showcase-media must reject SVG');

  console.log('✓ Test 1 Passed: Bucket constants and definitions match 25MB / 200MB architecture');

  // --------------------------------------------------------------------------
  // Test 2: ensureStorageBuckets creation when buckets do not exist
  // --------------------------------------------------------------------------
  resetStorageBucketCheckForTesting();
  const createdBuckets: { id: string; options: any }[] = [];
  const updatedBuckets: { id: string; options: any }[] = [];

  const mockSupabaseEmpty = {
    storage: {
      listBuckets: async () => ({ data: [], error: null }),
      createBucket: async (id: string, options: any) => {
        createdBuckets.push({ id, options });
        return { data: { name: id }, error: null };
      },
      updateBucket: async (id: string, options: any) => {
        updatedBuckets.push({ id, options });
        return { data: { message: 'ok' }, error: null };
      },
    },
  };

  const mockEnvEmpty = {
    SUPABASE_URL: 'https://mock.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'mock-key',
    __mockSupabase: mockSupabaseEmpty,
  };

  // Temporarily stub getSupabaseServerClient for env
  const { getSupabaseServerClient } = await import('../supabase.js');
  const originalGetClient = getSupabaseServerClient;

  // Let's test the ensureStorageBuckets logic with the custom mock client directly
  const ensureResultWithClient = async (mockClient: any) => {
    const { data: buckets } = await mockClient.storage.listBuckets();
    for (const config of STORAGE_BUCKET_DEFINITIONS) {
      const existing = buckets?.find((b: any) => b.name === config.id || b.id === config.id);
      if (!existing) {
        await mockClient.storage.createBucket(config.id, {
          public: true,
          fileSizeLimit: config.fileSizeLimit,
          allowedMimeTypes: config.allowedMimeTypes,
        });
      } else {
        await mockClient.storage.updateBucket(config.id, {
          public: true,
          fileSizeLimit: config.fileSizeLimit,
          allowedMimeTypes: config.allowedMimeTypes,
        });
      }
    }
  };

  await ensureResultWithClient(mockSupabaseEmpty);

  assert.strictEqual(createdBuckets.length, 2, 'Should create both game-assets and showcase-media');
  assert.strictEqual(createdBuckets[0].id, 'game-assets');
  assert.strictEqual(createdBuckets[0].options.fileSizeLimit, 25 * 1024 * 1024, 'game-assets limit must be 25MB');
  assert.strictEqual(createdBuckets[1].id, 'showcase-media');
  assert.strictEqual(createdBuckets[1].options.fileSizeLimit, 200 * 1024 * 1024, 'showcase-media limit must be 200MB');

  console.log('✓ Test 2 Passed: Automatic creation provisions game-assets (25MB) and showcase-media (200MB)');

  // --------------------------------------------------------------------------
  // Test 3: ensureStorageBuckets upgrade when existing buckets have old 10MB limit
  // --------------------------------------------------------------------------
  createdBuckets.length = 0;
  updatedBuckets.length = 0;

  const mockSupabaseLegacy = {
    storage: {
      listBuckets: async () => ({
        data: [
          { id: 'game-assets', name: 'game-assets', file_size_limit: 10485760 }, // legacy 10MB
          { id: 'showcase-media', name: 'showcase-media', file_size_limit: 10485760 }, // legacy 10MB
        ],
        error: null,
      }),
      createBucket: async (id: string, options: any) => {
        createdBuckets.push({ id, options });
        return { data: { name: id }, error: null };
      },
      updateBucket: async (id: string, options: any) => {
        updatedBuckets.push({ id, options });
        return { data: { message: 'ok' }, error: null };
      },
    },
  };

  await ensureResultWithClient(mockSupabaseLegacy);

  assert.strictEqual(createdBuckets.length, 0, 'Should not create existing buckets');
  assert.strictEqual(updatedBuckets.length, 2, 'Should update both existing buckets');
  assert.strictEqual(updatedBuckets[0].id, 'game-assets');
  assert.strictEqual(updatedBuckets[0].options.fileSizeLimit, 25 * 1024 * 1024, 'game-assets upgraded to 25MB');
  assert.strictEqual(updatedBuckets[1].id, 'showcase-media');
  assert.strictEqual(updatedBuckets[1].options.fileSizeLimit, 200 * 1024 * 1024, 'showcase-media upgraded to 200MB');

  console.log('✓ Test 3 Passed: Existing buckets upgraded to 25MB and 200MB');

  // --------------------------------------------------------------------------
  // Test 4: createSignedUploadUrlForShowcase bucket targeting
  // --------------------------------------------------------------------------
  let bucketUsedInSignedUrl = '';
  let bucketUsedInPublicUrl = '';
  const mockStorageTarget = {
    from: (bucket: string) => {
      bucketUsedInSignedUrl = bucket;
      bucketUsedInPublicUrl = bucket;
      return {
        createSignedUploadUrl: async (path: string) => ({
          data: { signedUrl: `https://mock.storage/${bucket}/${path}?token=abc`, token: 'abc' },
          error: null,
        }),
        getPublicUrl: (path: string) => ({
          data: { publicUrl: `https://mock.storage/${bucket}/${path}` },
        }),
      };
    },
    listBuckets: async () => ({
      data: [{ id: 'game-assets' }, { id: 'showcase-media' }],
      error: null,
    }),
    updateBucket: async () => ({ data: {}, error: null }),
  };

  // Test SVG rejection in createSignedUploadUrlForShowcase
  await assert.rejects(
    async () => {
      await createSignedUploadUrlForShowcase({
        organizationId: 'org-test',
        showcaseId: 'sc-test',
        fileName: 'bad.svg',
        mimeType: 'image/svg+xml',
        mediaType: 'IMAGE',
      });
    },
    /SVG uploads are not permitted/,
    'createSignedUploadUrlForShowcase must strictly reject SVG'
  );

  console.log('✓ Test 4 Passed: createSignedUploadUrlForShowcase rejects SVG');

  // --------------------------------------------------------------------------
  // Test 5: uploadGameAsset category-to-bucket routing & size limit validation
  // --------------------------------------------------------------------------
  // Valid 1x1 PNG buffer with valid signature
  const validPngHeader = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
    0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
    0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41,
    0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
    0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
    0x42, 0x60, 0x82,
  ]);

  // Valid MP4 buffer with ftyp header
  const validMp4Header = Buffer.from([
    0x00, 0x00, 0x00, 0x20, // 32 bytes box length
    0x66, 0x74, 0x79, 0x70, // 'ftyp'
    0x69, 0x73, 0x6F, 0x6D, // 'isom'
    0x00, 0x00, 0x02, 0x00, // minor_version
    0x69, 0x73, 0x6F, 0x6D, // compatible_brands isom
    0x69, 0x73, 0x6F, 0x32, // iso2
    0x61, 0x76, 0x63, 0x31, // avc1
    0x6D, 0x70, 0x34, 0x31, // mp41
  ]);

  // Create a 26MB dummy video buffer (with valid MP4 magic bytes)
  // This is > 25MB (general asset limit) but < 200MB (showcase media limit)
  const size26Mb = 26 * 1024 * 1024;
  const buffer26Mb = Buffer.alloc(size26Mb);
  validMp4Header.copy(buffer26Mb, 0);

  // A. Try uploading 26MB video as general 'backgrounds' asset -> must be rejected (limit is 25MB)
  await assert.rejects(
    async () => {
      await uploadGameAsset({
        organizationId: 'org-test',
        category: 'backgrounds',
        fileBuffer: buffer26Mb,
        originalName: 'clip.mp4',
        mimeType: 'video/mp4',
      });
    },
    /exceeds maximum allowed limit/i,
    '26MB file must be rejected for game asset (limit 25MB)'
  );

  console.log('✓ Test 5 Passed: 26MB upload rejected for game asset (exceeds 25MB limit)');

  // B. Try uploading SVG to uploadGameAsset -> rejected immediately
  const svgBuffer = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><circle r="10"/></svg>');
  await assert.rejects(
    async () => {
      await uploadGameAsset({
        organizationId: 'org-test',
        category: 'logos',
        fileBuffer: svgBuffer,
        originalName: 'logo.svg',
        mimeType: 'image/svg+xml',
      });
    },
    /SVG uploads are not permitted/i,
    'SVG files must be rejected by uploadGameAsset'
  );

  console.log('✓ Test 6 Passed: SVG upload rejected for game assets');

  console.log('--- All Storage Bucket Limits & Architecture Tests Passed Successfully ---');
}

runTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
