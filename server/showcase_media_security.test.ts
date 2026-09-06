/**
 * Showcase Media Security & Path Verification Tests
 * 
 * Verifies that the showcase media endpoint and database insertion:
 * 1. Strictly requires storage_path or upload_id and rejects arbitrary media URLs.
 * 2. Enforces bucket = 'showcase-media'.
 * 3. Enforces tenant isolation: organization_id in path must match event.organization_id.
 * 4. Enforces showcase isolation: showcase_id in path must match target showcase.id.
 * 5. Rejects directory traversal / nested folders in storage_path.
 * 6. Strictly rejects SVG uploads.
 * 7. Enforces file extension compatibility with media_type (IMAGE vs VIDEO).
 * 8. Authoritatively derives public URL from storage path rather than trusting client media_url.
 * 9. Rejects arbitrary external thumbnail URLs.
 * 10. Database records store storage_path alongside derived media_url.
 */

import assert from 'node:assert';
import crypto from 'node:crypto';
import {
  validateAndResolveShowcaseMediaPath,
  getShowcaseMediaPublicUrl,
  SHOWCASE_BUCKET,
} from './db/storage.js';
import {
  createShowcaseMedia,
  getShowcaseMedia,
  deleteShowcaseMedia,
} from './db/showcaseMedia.js';

console.log('--- Starting Showcase Media Security Tests ---');

async function runTests() {
  const orgId = crypto.randomUUID();
  const otherOrgId = crypto.randomUUID();
  const showcaseId = crypto.randomUUID();
  const otherShowcaseId = crypto.randomUUID();

  // --------------------------------------------------------------------------
  // Test 1: Reject missing storage_path / arbitrary media_url submission
  // --------------------------------------------------------------------------
  console.log('Test 1: Reject missing storage_path');
  const missingPathResult = validateAndResolveShowcaseMediaPath({
    storagePath: null,
    organizationId: orgId,
    showcaseId,
    mediaType: 'IMAGE',
    clientMediaUrl: 'https://evil.com/attacker_payload.png',
  });
  assert.strictEqual(missingPathResult.valid, false);
  assert.strictEqual(missingPathResult.code, 'STORAGE_PATH_REQUIRED');
  assert.strictEqual(missingPathResult.statusCode, 422);
  console.log('✓ Test 1 Passed: Missing storage_path is rejected');

  // --------------------------------------------------------------------------
  // Test 2: Reject invalid bucket
  // --------------------------------------------------------------------------
  console.log('Test 2: Reject invalid bucket');
  const invalidBucketResult = validateAndResolveShowcaseMediaPath({
    storagePath: `organizations/${orgId}/showcases/${showcaseId}/valid_photo.jpg`,
    bucket: 'game-assets',
    organizationId: orgId,
    showcaseId,
    mediaType: 'IMAGE',
  });
  assert.strictEqual(invalidBucketResult.valid, false);
  assert.strictEqual(invalidBucketResult.code, 'INVALID_STORAGE_BUCKET');
  assert.strictEqual(invalidBucketResult.statusCode, 422);
  console.log('✓ Test 2 Passed: Non showcase-media bucket is rejected');

  // --------------------------------------------------------------------------
  // Test 3: Reject cross-tenant organization ID in storage path
  // --------------------------------------------------------------------------
  console.log('Test 3: Reject cross-tenant organization ID mismatch');
  const crossOrgResult = validateAndResolveShowcaseMediaPath({
    storagePath: `organizations/${otherOrgId}/showcases/${showcaseId}/photo.jpg`,
    organizationId: orgId,
    showcaseId,
    mediaType: 'IMAGE',
  });
  assert.strictEqual(crossOrgResult.valid, false);
  assert.strictEqual(crossOrgResult.code, 'STORAGE_PATH_ORGANIZATION_MISMATCH');
  assert.strictEqual(crossOrgResult.statusCode, 403);
  console.log('✓ Test 3 Passed: Cross-tenant organization storage path is rejected (403)');

  // --------------------------------------------------------------------------
  // Test 4: Reject cross-showcase ID in storage path
  // --------------------------------------------------------------------------
  console.log('Test 4: Reject cross-showcase ID mismatch');
  const crossShowcaseResult = validateAndResolveShowcaseMediaPath({
    storagePath: `organizations/${orgId}/showcases/${otherShowcaseId}/photo.jpg`,
    organizationId: orgId,
    showcaseId,
    mediaType: 'IMAGE',
  });
  assert.strictEqual(crossShowcaseResult.valid, false);
  assert.strictEqual(crossShowcaseResult.code, 'STORAGE_PATH_SHOWCASE_MISMATCH');
  assert.strictEqual(crossShowcaseResult.statusCode, 403);
  console.log('✓ Test 4 Passed: Cross-showcase storage path is rejected (403)');

  // --------------------------------------------------------------------------
  // Test 5: Reject directory traversal or subdirectories in filename
  // --------------------------------------------------------------------------
  console.log('Test 5: Reject directory traversal and nested paths');
  const traversalResult1 = validateAndResolveShowcaseMediaPath({
    storagePath: `organizations/${orgId}/showcases/${showcaseId}/../../secret.jpg`,
    organizationId: orgId,
    showcaseId,
    mediaType: 'IMAGE',
  });
  assert.strictEqual(traversalResult1.valid, false);
  assert.strictEqual(traversalResult1.code, 'INVALID_STORAGE_FILENAME');

  const traversalResult2 = validateAndResolveShowcaseMediaPath({
    storagePath: `organizations/${orgId}/showcases/${showcaseId}/nested/folder/photo.jpg`,
    organizationId: orgId,
    showcaseId,
    mediaType: 'IMAGE',
  });
  assert.strictEqual(traversalResult2.valid, false);
  assert.strictEqual(traversalResult2.code, 'INVALID_STORAGE_FILENAME');
  console.log('✓ Test 5 Passed: Directory traversal and subdirectories are rejected');

  // --------------------------------------------------------------------------
  // Test 6: Reject SVG files
  // --------------------------------------------------------------------------
  console.log('Test 6: Reject SVG showcase media files');
  const svgResult = validateAndResolveShowcaseMediaPath({
    storagePath: `organizations/${orgId}/showcases/${showcaseId}/malicious.svg`,
    organizationId: orgId,
    showcaseId,
    mediaType: 'IMAGE',
  });
  assert.strictEqual(svgResult.valid, false);
  assert.strictEqual(svgResult.code, 'SVG_NOT_ALLOWED');
  assert.strictEqual(svgResult.statusCode, 422);
  console.log('✓ Test 6 Passed: SVG showcase media is strictly rejected');

  // --------------------------------------------------------------------------
  // Test 7: Validate extension against media type
  // --------------------------------------------------------------------------
  console.log('Test 7: Validate extensions against media type');
  const wrongTypeResult1 = validateAndResolveShowcaseMediaPath({
    storagePath: `organizations/${orgId}/showcases/${showcaseId}/clip.mp4`,
    organizationId: orgId,
    showcaseId,
    mediaType: 'IMAGE', // Expecting image, got video
  });
  assert.strictEqual(wrongTypeResult1.valid, false);
  assert.strictEqual(wrongTypeResult1.code, 'UNSUPPORTED_FILE_TYPE');

  const wrongTypeResult2 = validateAndResolveShowcaseMediaPath({
    storagePath: `organizations/${orgId}/showcases/${showcaseId}/image.png`,
    organizationId: orgId,
    showcaseId,
    mediaType: 'VIDEO', // Expecting video, got image
  });
  assert.strictEqual(wrongTypeResult2.valid, false);
  assert.strictEqual(wrongTypeResult2.code, 'UNSUPPORTED_FILE_TYPE');
  console.log('✓ Test 7 Passed: Mismatched media types are rejected');

  // --------------------------------------------------------------------------
  // Test 8: Reject arbitrary external media_url that doesn't match storage path
  // --------------------------------------------------------------------------
  console.log('Test 8: Reject arbitrary external media_url');
  const arbitraryUrlResult = validateAndResolveShowcaseMediaPath({
    storagePath: `organizations/${orgId}/showcases/${showcaseId}/banner.png`,
    organizationId: orgId,
    showcaseId,
    mediaType: 'IMAGE',
    clientMediaUrl: 'https://attacker.site/spoofed_media.png',
  });
  assert.strictEqual(arbitraryUrlResult.valid, false);
  assert.strictEqual(arbitraryUrlResult.code, 'ARBITRARY_MEDIA_URL_REJECTED');
  assert.strictEqual(arbitraryUrlResult.statusCode, 422);
  console.log('✓ Test 8 Passed: Arbitrary external media_url is rejected');

  // --------------------------------------------------------------------------
  // Test 9: Reject arbitrary external thumbnail_url
  // --------------------------------------------------------------------------
  console.log('Test 9: Reject arbitrary external thumbnail_url');
  const arbitraryThumbResult = validateAndResolveShowcaseMediaPath({
    storagePath: `organizations/${orgId}/showcases/${showcaseId}/clip.mp4`,
    organizationId: orgId,
    showcaseId,
    mediaType: 'VIDEO',
    clientThumbnailUrl: 'https://attacker.site/spoofed_thumb.jpg',
  });
  assert.strictEqual(arbitraryThumbResult.valid, false);
  assert.strictEqual(arbitraryThumbResult.code, 'ARBITRARY_THUMBNAIL_URL_REJECTED');
  assert.strictEqual(arbitraryThumbResult.statusCode, 422);
  console.log('✓ Test 9 Passed: Arbitrary external thumbnail_url is rejected');

  // --------------------------------------------------------------------------
  // Test 10: Valid storage path successfully validated and authoritative URL generated
  // --------------------------------------------------------------------------
  console.log('Test 10: Valid storage path authorization and URL derivation');
  const validResult = validateAndResolveShowcaseMediaPath({
    storagePath: `organizations/${orgId}/showcases/${showcaseId}/booth_event_photo_1.webp`,
    bucket: 'showcase-media',
    organizationId: orgId,
    showcaseId,
    mediaType: 'IMAGE',
  });
  assert.strictEqual(validResult.valid, true);
  assert.strictEqual(validResult.authoritativeStoragePath, `organizations/${orgId}/showcases/${showcaseId}/booth_event_photo_1.webp`);
  assert.strictEqual(validResult.fileName, 'booth_event_photo_1.webp');
  assert.strictEqual(validResult.bucket, SHOWCASE_BUCKET);
  assert.ok(validResult.authoritativeMediaUrl.length > 0);
  console.log('✓ Test 10 Passed: Valid storage path derives authoritative media URL');

  // --------------------------------------------------------------------------
  // Test 11: Database insertion retains storage_path
  // --------------------------------------------------------------------------
  console.log('Test 11: Create showcase media record with storage_path in database');
  const createdRecord = await createShowcaseMedia({
    showcase_id: showcaseId,
    organization_id: orgId,
    media_type: 'IMAGE',
    media_url: validResult.authoritativeMediaUrl,
    storage_path: validResult.authoritativeStoragePath,
    file_name: validResult.fileName,
    file_size: 102400,
    mime_type: 'image/webp',
  });

  assert.ok(createdRecord.id);
  assert.strictEqual(createdRecord.storage_path, validResult.authoritativeStoragePath);
  assert.strictEqual(createdRecord.showcase_id, showcaseId);
  assert.strictEqual(createdRecord.organization_id, orgId);

  const fetched = await getShowcaseMedia(showcaseId, orgId);
  const found = fetched.find((m) => m.id === createdRecord.id);
  assert.ok(found);
  assert.strictEqual(found.storage_path, validResult.authoritativeStoragePath);
  console.log('✓ Test 11 Passed: storage_path is saved and retrieved in database record');

  // Clean up
  await deleteShowcaseMedia(createdRecord.id, showcaseId, orgId);
  console.log('✓ Cleaned up test showcase media record');

  console.log('\n====================================================');
  console.log('🎉 ALL SHOWCASE MEDIA SECURITY TESTS PASSED!');
  console.log('====================================================\n');
}

runTests().catch((err) => {
  console.error('❌ Showcase Media Security Test Failed:', err);
  process.exit(1);
});
