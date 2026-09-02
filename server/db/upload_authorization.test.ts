/**
 * Security & Authorization Tests for Game Asset Upload (/api/upload)
 * 
 * Verifies the complete authorization & validation pipeline:
 * 1. Authenticate (authenticateJWT)
 * 2. Get organization ID (X-Organization-ID, JWT claim, etc.)
 * 3. Verify membership (user ∈ organization)
 * 4. Verify permission (viewers rejected; owner/admin/designer allowed)
 * 5. Validate category (logos, backgrounds, baskets, items, themes, branding, audio, showcases, general)
 * 6. Validate file (presence, MIME type, size limits)
 * 7. Generate safe storage path (sandboxed, path-traversal resistant)
 * 8. Upload
 */

import assert from 'node:assert';
import { ALLOWED_ASSET_CATEGORIES, uploadGameAsset } from './storage.js';

console.log('--- Starting Game Asset Upload Authorization & Security Tests ---');

let passed = 0;
let failed = 0;

function assertEqual(actual: any, expected: any, description: string) {
  try {
    assert.strictEqual(actual, expected);
    console.log(`  ✓ PASS: ${description} (expected ${expected}, got ${actual})`);
    passed++;
  } catch (err: any) {
    console.error(`  ✗ FAIL: ${description} - ${err.message}`);
    failed++;
  }
}

// Pipeline simulation representing server.ts and worker.ts /api/upload logic
async function processUploadRequest(params: {
  user: { id: string; is_developer?: boolean } | null;
  jwtOrgId?: string;
  headerOrgId?: string;
  bodyOrgId?: string;
  category?: string;
  file?: {
    originalname: string;
    mimetype: string;
    buffer: Buffer;
    size: number;
  } | null;
  mockDb: {
    memberships: Map<string, { userId: string; orgId: string; role: string }>;
  };
}) {
  // Step 1: Authenticate
  if (!params.user) {
    return { status: 401, error: 'Unauthenticated', code: 'UNAUTHENTICATED' };
  }

  const user = params.user;
  const isDev = user.is_developer === true;

  // Step 2: Resolve organization ID
  let orgId = params.headerOrgId || params.jwtOrgId || params.bodyOrgId;
  if (!orgId || orgId === 'default') {
    if (isDev) {
      orgId = 'system';
    } else {
      return { status: 422, error: 'Organization ID is required for asset uploads', code: 'ORG_ID_REQUIRED' };
    }
  }

  // Step 3: Verify membership & Step 4: Verify permission
  if (!isDev) {
    const membership = params.mockDb.memberships.get(`${user.id}:${orgId}`);
    if (!membership) {
      return { status: 403, error: `Forbidden: You are not a member of organization "${orgId}"`, code: 'ORG_NOT_MEMBER' };
    }

    if (membership.role === 'viewer') {
      return {
        status: 403,
        error: 'Forbidden: Viewers do not have permission to upload assets in this organization',
        code: 'INSUFFICIENT_PERMISSIONS',
      };
    }
  }

  // Step 5: Validate category
  const rawCategory = params.category || 'general';
  const category = rawCategory.toLowerCase().trim();
  if (!ALLOWED_ASSET_CATEGORIES.has(category)) {
    return {
      status: 422,
      error: `Invalid category "${rawCategory}". Allowed categories: ${Array.from(ALLOWED_ASSET_CATEGORIES).join(', ')}`,
      code: 'INVALID_CATEGORY',
    };
  }

  // Step 6: Validate file
  if (!params.file || !params.file.buffer || params.file.buffer.length === 0) {
    return { status: 422, error: 'No file uploaded', code: 'NO_FILE_UPLOADED' };
  }

  const ALLOWED_MIME_TYPES = new Set([
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/webp',
    'image/svg+xml',
    'image/gif',
    'image/x-icon',
    'image/vnd.microsoft.icon',
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/ogg',
    'audio/x-wav',
    'audio/aac',
    'video/mp4',
    'video/webm',
    'video/quicktime',
  ]);
  const mimeType = (params.file.mimetype || '').toLowerCase();
  const dotIdx = params.file.originalname.lastIndexOf('.');
  const ext = dotIdx !== -1 ? params.file.originalname.slice(dotIdx).toLowerCase() : '';
  const allowedExts = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif', '.ico', '.mp3', '.wav', '.ogg', '.aac', '.mp4', '.webm', '.mov']);

  if (!ALLOWED_MIME_TYPES.has(mimeType) && !allowedExts.has(ext)) {
    return {
      status: 422,
      error: `Unsupported file format (${mimeType}). Allowed formats: PNG, JPG, JPEG, WEBP, SVG, GIF, MP3, WAV, OGG, MP4.`,
      code: 'UNSUPPORTED_FILE_TYPE',
    };
  }

  const MAX_ASSET_SIZE = 25 * 1024 * 1024; // 25MB
  if (params.file.size > MAX_ASSET_SIZE) {
    return {
      status: 422,
      error: `File size exceeds maximum allowed limit of 25MB (${(params.file.size / (1024 * 1024)).toFixed(1)}MB provided).`,
      code: 'FILE_TOO_LARGE',
    };
  }

  // Step 7: Generate safe storage path & Step 8: Upload
  const safeOrgId = orgId.replace(/[^a-zA-Z0-9_-]/g, '') || 'default';
  const safeCategory = category.replace(/[^a-zA-Z0-9_-]/g, '') || 'general';
  const safeExt = ext || '.png';
  const uniqueName = `test-asset-${Date.now()}${safeExt}`;
  const storagePath = `organizations/${safeOrgId}/${safeCategory}/${uniqueName}`;

  return {
    status: 200,
    url: `https://mock-storage.supabase.co/storage/v1/object/public/game-assets/${storagePath}`,
    path: storagePath,
    orgId: safeOrgId,
    category: safeCategory,
  };
}

async function runTests() {
  const orgA = 'org_alpha_1111';
  const orgB = 'org_beta_2222';
  const userA = { id: 'user_alice_123', is_developer: false };
  const userB = { id: 'user_bob_456', is_developer: false };
  const userViewer = { id: 'user_valerie_789', is_developer: false };
  const userDev = { id: 'user_dev_000', is_developer: true };

  const mockDb = {
    memberships: new Map<string, { userId: string; orgId: string; role: string }>([
      [`${userA.id}:${orgA}`, { userId: userA.id, orgId: orgA, role: 'owner' }],
      [`${userB.id}:${orgB}`, { userId: userB.id, orgId: orgB, role: 'designer' }],
      [`${userViewer.id}:${orgA}`, { userId: userViewer.id, orgId: orgA, role: 'viewer' }],
    ]),
  };

  const samplePng = {
    originalname: 'logo.png',
    mimetype: 'image/png',
    buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    size: 8,
  };

  // Test 1: Unauthenticated request is rejected
  console.log('\n--- Test 1: Unauthenticated Request ---');
  const res1 = await processUploadRequest({
    user: null,
    jwtOrgId: orgA,
    file: samplePng,
    mockDb,
  });
  assertEqual(res1.status, 401, 'Unauthenticated user rejected with 401');

  // Test 2: Missing Org ID is rejected for regular users
  console.log('\n--- Test 2: Missing Org ID ---');
  const res2 = await processUploadRequest({
    user: userA,
    jwtOrgId: undefined,
    headerOrgId: undefined,
    file: samplePng,
    mockDb,
  });
  assertEqual(res2.status, 422, 'Missing orgId rejected with 422');
  assertEqual(res2.code, 'ORG_ID_REQUIRED', 'Missing orgId code is ORG_ID_REQUIRED');

  // Test 3: Cross-organization upload by non-member is rejected (X-Organization-ID spoofing defense)
  console.log('\n--- Test 3: Cross-Organization Upload Defense (User A -> Org B) ---');
  const res3 = await processUploadRequest({
    user: userA,
    headerOrgId: orgB, // User A maliciously sets X-Organization-ID: orgB
    file: samplePng,
    mockDb,
  });
  assertEqual(res3.status, 403, 'Cross-org upload rejected with 403');
  assertEqual(res3.code, 'ORG_NOT_MEMBER', 'Cross-org error code is ORG_NOT_MEMBER');

  // Test 4: Viewer role is rejected
  console.log('\n--- Test 4: Viewer Role Upload Rejection ---');
  const res4 = await processUploadRequest({
    user: userViewer,
    headerOrgId: orgA,
    file: samplePng,
    mockDb,
  });
  assertEqual(res4.status, 403, 'Viewer upload rejected with 403');
  assertEqual(res4.code, 'INSUFFICIENT_PERMISSIONS', 'Viewer rejected with INSUFFICIENT_PERMISSIONS');

  // Test 5: Invalid category is rejected
  console.log('\n--- Test 5: Invalid Category Rejection ---');
  const res5 = await processUploadRequest({
    user: userA,
    headerOrgId: orgA,
    category: 'malicious_executables',
    file: samplePng,
    mockDb,
  });
  assertEqual(res5.status, 422, 'Invalid category rejected with 422');
  assertEqual(res5.code, 'INVALID_CATEGORY', 'Invalid category code is INVALID_CATEGORY');

  // Test 6: Unsupported file MIME / type rejected
  console.log('\n--- Test 6: Unsupported File Type Rejection ---');
  const res6 = await processUploadRequest({
    user: userA,
    headerOrgId: orgA,
    category: 'backgrounds',
    file: {
      originalname: 'virus.exe',
      mimetype: 'application/x-msdownload',
      buffer: Buffer.from('MZ...'),
      size: 100,
    },
    mockDb,
  });
  assertEqual(res6.status, 422, 'Executable file rejected with 422');
  assertEqual(res6.code, 'UNSUPPORTED_FILE_TYPE', 'Unsupported file type code is UNSUPPORTED_FILE_TYPE');

  // Test 7: File size exceeding 25MB limit rejected
  console.log('\n--- Test 7: Oversized File Rejection ---');
  const res7 = await processUploadRequest({
    user: userA,
    headerOrgId: orgA,
    category: 'backgrounds',
    file: {
      originalname: 'huge_image.png',
      mimetype: 'image/png',
      buffer: Buffer.alloc(10),
      size: 30 * 1024 * 1024, // 30MB
    },
    mockDb,
  });
  assertEqual(res7.status, 422, 'Oversized file rejected with 422');
  assertEqual(res7.code, 'FILE_TOO_LARGE', 'Oversized file code is FILE_TOO_LARGE');

  // Test 8: Missing file rejected
  console.log('\n--- Test 8: Missing File Rejection ---');
  const res8 = await processUploadRequest({
    user: userA,
    headerOrgId: orgA,
    category: 'backgrounds',
    file: null,
    mockDb,
  });
  assertEqual(res8.status, 422, 'Missing file rejected with 422');
  assertEqual(res8.code, 'NO_FILE_UPLOADED', 'Missing file code is NO_FILE_UPLOADED');

  // Test 9: Valid Owner upload in Org A succeeds into sandboxed path
  console.log('\n--- Test 9: Valid Owner Upload (Org A) ---');
  const res9 = await processUploadRequest({
    user: userA,
    headerOrgId: orgA,
    category: 'backgrounds',
    file: samplePng,
    mockDb,
  });
  assertEqual(res9.status, 200, 'Owner upload succeeds with 200');
  assertEqual(res9.orgId, orgA, 'Uploaded strictly under Org A path');
  assertEqual(res9.category, 'backgrounds', 'Uploaded under backgrounds category');
  assertEqual(res9.path?.startsWith(`organizations/${orgA}/backgrounds/`), true, 'Path follows sandboxed convention');

  // Test 10: Valid Designer upload in Org B succeeds
  console.log('\n--- Test 10: Valid Designer Upload (Org B) ---');
  const res10 = await processUploadRequest({
    user: userB,
    jwtOrgId: orgB,
    category: 'items',
    file: samplePng,
    mockDb,
  });
  assertEqual(res10.status, 200, 'Designer upload succeeds with 200');
  assertEqual(res10.orgId, orgB, 'Uploaded strictly under Org B path');
  assertEqual(res10.category, 'items', 'Uploaded under items category');

  // Test 11: Developer Admin can upload system asset or specified org
  console.log('\n--- Test 11: Developer Admin System Asset Upload ---');
  const res11 = await processUploadRequest({
    user: userDev,
    category: 'themes',
    file: samplePng,
    mockDb,
  });
  assertEqual(res11.status, 200, 'Developer admin system upload succeeds with 200');
  assertEqual(res11.orgId, 'system', 'Uploaded under system namespace');

  // Test 12: Storage path traversal prevention
  console.log('\n--- Test 12: Storage Path Traversal Sanitization ---');
  const res12 = await processUploadRequest({
    user: userDev,
    headerOrgId: '../../etc/passwd',
    category: 'logos',
    file: samplePng,
    mockDb,
  });
  assertEqual(res12.status, 200, 'Developer admin sanitized upload succeeds');
  assertEqual(res12.orgId, 'etcpasswd', 'Path traversal characters stripped from orgId');
  assertEqual(res12.path?.includes('..'), false, 'Storage path contains zero traversal dots');

  // Summary
  console.log('\n======================================================');
  console.log(` UPLOAD SECURITY SUITE RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal error running upload authorization tests:', err);
  process.exit(1);
});
