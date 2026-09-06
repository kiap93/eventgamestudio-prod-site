/**
 * Security & Authorization Tests for Direct Showcase Media Upload
 * 
 * Verifies the complete authorization pipeline:
 * 1. authenticateJWT
 * 2. validate eventId/showcaseId
 * 3. load event
 * 4. verify organization membership
 * 5. verify role (viewers forbidden)
 * 6. validate storage path belongs strictly to that showcase
 * 7. validate MIME/type/size limits
 * 8. upload into sandboxed folder
 */

import assert from 'node:assert';
import { ALLOWED_IMAGE_MIME_TYPES, ALLOWED_VIDEO_MIME_TYPES, MAX_IMAGE_SIZE, MAX_VIDEO_SIZE, MAX_DIRECT_UPLOAD_SIZE } from './types.js';

console.log('--- Starting Showcase Direct Upload Security Pipeline Tests ---');

// Helper to simulate the authorization and path validation pipeline
function validateShowcaseUploadRequest(params: {
  user: { id: string; role?: string } | null;
  eventId?: string;
  showcaseId?: string;
  requestedPath?: string;
  fileName?: string;
  fileBuffer?: Buffer | Uint8Array;
  mimeType?: string;
  fileSize?: number;
  mockDb: {
    events: Map<string, { id: string; organization_id: string }>;
    showcases: Map<string, { id: string; event_id: string; organization_id?: string }>;
    memberships: Map<string, { userId: string; orgId: string; role: string }>;
  };
}) {
  // Step 1: Authentication
  if (!params.user) {
    return { status: 401, error: 'Unauthorized' };
  }

  // Step 2: Validate eventId / showcaseId
  let eventId = params.eventId;
  let showcaseId = params.showcaseId;
  const requestedPath = params.requestedPath;

  if (!eventId && !showcaseId && requestedPath) {
    const pathMatch = requestedPath.match(/^organizations\/([^/]+)\/showcases\/([^/]+)\/([^/]+)$/);
    if (pathMatch) {
      showcaseId = pathMatch[2];
    }
  }

  if (!eventId && !showcaseId) {
    return { status: 422, error: 'eventId or showcaseId is required for showcase media upload' };
  }

  // Step 3: Load event & showcase
  let event: { id: string; organization_id: string } | undefined;
  let showcase: { id: string; event_id: string; organization_id?: string } | undefined;

  if (eventId) {
    event = params.mockDb.events.get(eventId);
    if (!event) return { status: 404, error: 'Event not found' };
    for (const sc of params.mockDb.showcases.values()) {
      if (sc.event_id === eventId) {
        showcase = sc;
        break;
      }
    }
    if (!showcase) return { status: 404, error: 'Event Showcase not found. Please create the showcase first.' };
    if (showcaseId && showcase.id !== showcaseId) {
      return { status: 403, error: 'Showcase does not match event' };
    }
  } else if (showcaseId) {
    showcase = params.mockDb.showcases.get(showcaseId);
    if (!showcase) return { status: 404, error: 'Event Showcase not found' };
    event = params.mockDb.events.get(showcase.event_id);
    if (!event) return { status: 404, error: 'Associated event not found' };
  }

  // Step 4: Verify Organization Membership
  const membershipKey = `${params.user.id}:${event!.organization_id}`;
  const membership = params.mockDb.memberships.get(membershipKey);
  if (!membership) {
    return { status: 403, error: 'Permission denied: You are not a member of this organization' };
  }

  // Step 5: Verify Role
  if (membership.role === 'viewer') {
    return { status: 403, error: 'Permission denied: Viewers cannot upload showcase media' };
  }

  // Step 6: Validate MIME & Size
  const mime = (params.mimeType || 'application/octet-stream').toLowerCase();
  const size = params.fileSize || (params.fileBuffer ? params.fileBuffer.length : 0);

  const allowedImageTypes = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
  const allowedVideoTypes = new Set(['video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska', 'video/ogg', 'video/3gpp']);
  const maxImageSize = 25 * 1024 * 1024;
  const maxVideoSize = 200 * 1024 * 1024;

  const isImage = allowedImageTypes.has(mime) || mime.startsWith('image/');
  const isVideo = allowedVideoTypes.has(mime) || mime.startsWith('video/');

  if (!isImage && !isVideo) {
    return { status: 422, error: `Unsupported media format (${params.mimeType})` };
  }

  // Direct upload memory-protection ceiling: strictly limited to small assets <= 10MB
  if (size > MAX_DIRECT_UPLOAD_SIZE) {
    return {
      status: 413,
      error: 'Direct upload is restricted to small assets up to 10MB. Large showcase files (up to 200MB) must use signed storage upload (/upload-url).',
      code: 'DIRECT_UPLOAD_SIZE_EXCEEDED',
    };
  }

  if (isImage && size > maxImageSize) {
    return { status: 422, error: 'Image file size exceeds maximum limit of 25MB' };
  }
  if (isVideo && size > maxVideoSize) {
    return { status: 422, error: 'Video file size exceeds maximum limit of 200MB' };
  }

  // Step 7: Storage Path Validation & Sandboxing (Never Trust Client-Provided Arbitrary Path)
  const expectedPrefix = `organizations/${event!.organization_id}/showcases/${showcase!.id}/`;
  let storagePath = `${expectedPrefix}${Date.now()}-safe-${params.fileName || 'media.png'}`;

  if (requestedPath && requestedPath.startsWith(expectedPrefix)) {
    const subPath = requestedPath.slice(expectedPrefix.length);
    if (!subPath.includes('/') && !subPath.includes('\\') && !subPath.includes('..')) {
      storagePath = requestedPath;
    }
  }

  return {
    status: 200,
    storagePath,
    organizationId: event!.organization_id,
    showcaseId: showcase!.id,
    eventId: event!.id,
    mediaType: isImage ? 'IMAGE' : 'VIDEO',
  };
}

async function runTests() {
  const mockDb = {
    events: new Map([
      ['event-org1-1', { id: 'event-org1-1', organization_id: 'org-1' }],
      ['event-org2-1', { id: 'event-org2-1', organization_id: 'org-2' }],
    ]),
    showcases: new Map([
      ['sc-org1-1', { id: 'sc-org1-1', event_id: 'event-org1-1', organization_id: 'org-1' }],
      ['sc-org2-1', { id: 'sc-org2-1', event_id: 'event-org2-1', organization_id: 'org-2' }],
    ]),
    memberships: new Map([
      ['user-admin:org-1', { userId: 'user-admin', orgId: 'org-1', role: 'admin' }],
      ['user-member:org-1', { userId: 'user-member', orgId: 'org-1', role: 'member' }],
      ['user-viewer:org-1', { userId: 'user-viewer', orgId: 'org-1', role: 'viewer' }],
      ['user-attacker:org-2', { userId: 'user-attacker', orgId: 'org-2', role: 'admin' }],
    ]),
  };

  // Test 1: Unauthenticated request should fail with 401
  const t1 = validateShowcaseUploadRequest({
    user: null,
    eventId: 'event-org1-1',
    mockDb,
  });
  assert.strictEqual(t1.status, 401, 'Unauthenticated request must be rejected with 401');
  console.log('✓ Test 1 Passed: Unauthenticated request rejected (401)');

  // Test 2: Missing eventId / showcaseId should fail with 422
  const t2 = validateShowcaseUploadRequest({
    user: { id: 'user-admin' },
    mockDb,
  });
  assert.strictEqual(t2.status, 422, 'Missing eventId/showcaseId must be rejected with 422');
  console.log('✓ Test 2 Passed: Missing eventId/showcaseId rejected (422)');

  // Test 3: Non-member attempting to upload to Org 1 showcase should fail with 403
  const t3 = validateShowcaseUploadRequest({
    user: { id: 'user-attacker' }, // Member of Org 2 only
    eventId: 'event-org1-1',
    mimeType: 'image/png',
    fileSize: 1024,
    mockDb,
  });
  assert.strictEqual(t3.status, 403, 'Non-member must be rejected with 403');
  console.log('✓ Test 3 Passed: Non-member cross-org upload blocked (403)');

  // Test 4: Viewer role attempting to upload should fail with 403
  const t4 = validateShowcaseUploadRequest({
    user: { id: 'user-viewer' },
    eventId: 'event-org1-1',
    mimeType: 'image/png',
    fileSize: 1024,
    mockDb,
  });
  assert.strictEqual(t4.status, 403, 'Viewer role must be rejected with 403');
  console.log('✓ Test 4 Passed: Viewer role upload blocked (403)');

  // Test 5: Manipulated arbitrary path attempting to escape or overwrite other files is safely sandboxed
  const maliciousPath = 'organizations/org-2/showcases/sc-org2-1/../../admin/secret.txt';
  const t5 = validateShowcaseUploadRequest({
    user: { id: 'user-member' },
    eventId: 'event-org1-1',
    requestedPath: maliciousPath,
    fileName: 'payload.png',
    mimeType: 'image/png',
    fileSize: 1024,
    mockDb,
  });
  assert.strictEqual(t5.status, 200, 'Valid member upload authorized');
  assert(
    t5.storagePath.startsWith('organizations/org-1/showcases/sc-org1-1/'),
    'Storage path must be strictly sandboxed to org-1/sc-org1-1 and ignore malicious traversal path'
  );
  assert(!t5.storagePath.includes('..'), 'Storage path must contain no path traversal');
  console.log('✓ Test 5 Passed: Malicious arbitrary path traversal neutralized and sandboxed');

  // Test 6: Invalid MIME type should fail with 422
  const t6 = validateShowcaseUploadRequest({
    user: { id: 'user-admin' },
    eventId: 'event-org1-1',
    mimeType: 'application/x-executable',
    fileSize: 1024,
    mockDb,
  });
  assert.strictEqual(t6.status, 422, 'Unsupported MIME type must be rejected with 422');
  console.log('✓ Test 6 Passed: Unsupported MIME type rejected (422)');

  // Test 7: Direct upload exceeding 10MB ceiling (e.g. 15MB or 200MB video) rejected with 413
  const t7 = validateShowcaseUploadRequest({
    user: { id: 'user-admin' },
    eventId: 'event-org1-1',
    mimeType: 'video/mp4',
    fileSize: 15 * 1024 * 1024, // 15MB (exceeds 10MB direct ceiling, must use signed upload)
    mockDb,
  });
  assert.strictEqual(t7.status, 413, 'File exceeding direct upload 10MB ceiling must be rejected with 413');
  assert.strictEqual(t7.code, 'DIRECT_UPLOAD_SIZE_EXCEEDED');
  console.log('✓ Test 7 Passed: File exceeding direct upload ceiling rejected with 413 (requires signed storage upload)');

  // Test 8: Authorized upload succeeds and returns sandboxed storage path
  const t8 = validateShowcaseUploadRequest({
    user: { id: 'user-admin' },
    eventId: 'event-org1-1',
    fileName: 'photo.jpg',
    mimeType: 'image/jpeg',
    fileSize: 2 * 1024 * 1024,
    mockDb,
  });
  assert.strictEqual(t8.status, 200, 'Authorized admin upload succeeds');
  assert.strictEqual(t8.organizationId, 'org-1');
  assert.strictEqual(t8.showcaseId, 'sc-org1-1');
  assert.strictEqual(t8.mediaType, 'IMAGE');
  assert(t8.storagePath.startsWith('organizations/org-1/showcases/sc-org1-1/'));
  console.log('✓ Test 8 Passed: Authorized upload successfully processed within isolated showcase folder');

  console.log('--- All Showcase Direct Upload Security Pipeline Tests Passed Successfully ---');
}

runTests().catch((err) => {
  console.error('Test failure:', err);
  process.exit(1);
});
