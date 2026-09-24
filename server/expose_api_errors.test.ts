import assert from 'node:assert';
import { handleWorkerApiError, handleApiError, shouldExposeApiErrors, getActualErrorMessage } from './errors.js';
import { AppError } from './errors.js';

async function runExposeApiErrorsTestSuite() {
  console.log('====================================================');
  console.log('TEST SUITE: EXPOSE_API_ERRORS CONFIGURATION & SHOWCASE FLOWS');
  console.log('====================================================\n');

  // 1. Safe default test (missing environment variable)
  console.log('1. Testing default / safe mode when EXPOSE_API_ERRORS is undefined or false...');
  {
    const req = new Request('https://eventgamestudio.com/api/events/evt-1/showcase/publish', {
      method: 'POST',
      headers: { 'x-correlation-id': 'req-safe-001' },
    });
    const internalErr = new Error('Database error publishing showcase: network disconnect while executing RPC publish_event_showcase_atomic');

    // Missing env variable entirely
    const resUndefined = await handleWorkerApiError(internalErr, req, { 'Access-Control-Allow-Origin': '*' }, {});
    assert.strictEqual(resUndefined.status, 500, 'HTTP status must be 500');
    const bodyUndefined = await resUndefined.json();
    assert.strictEqual(bodyUndefined.error, 'Something went wrong. Please try again.', 'Must return generic safe message');
    assert.strictEqual(bodyUndefined.requestId, 'req-safe-001', 'Must preserve correlation/request ID');

    // EXPOSE_API_ERRORS = "false"
    const resFalse = await handleWorkerApiError(internalErr, req, { 'Access-Control-Allow-Origin': '*' }, { EXPOSE_API_ERRORS: 'false' });
    const bodyFalse = await resFalse.json();
    assert.strictEqual(bodyFalse.error, 'Something went wrong. Please try again.');

    // EXPOSE_API_ERRORS = "FALSE", "0", "no", "off"
    for (const val of ['FALSE', '0', 'no', 'off', 'null', 'undefined']) {
      const resDisabled = await handleWorkerApiError(internalErr, req, { 'Access-Control-Allow-Origin': '*' }, { EXPOSE_API_ERRORS: val });
      const bodyDisabled = await resDisabled.json();
      assert.strictEqual(bodyDisabled.error, 'Something went wrong. Please try again.', `Value "${val}" must keep debug mode disabled`);
    }

    console.log('   ✓ Safe default & disabled mode passed');
  }

  // 2. Showcase Publish flow: Debug OFF vs Debug ON
  console.log('\n2. Testing POST /api/events/:eventId/showcase/publish in both modes...');
  {
    const eventId = 'evt-showcase-999';
    const req = new Request(`https://eventgamestudio.com/api/events/${eventId}/showcase/publish`, {
      method: 'POST',
      headers: { 'x-correlation-id': 'publish-req-123' },
    });
    const publishRpcError = new Error('Database error publishing showcase: trigger prevent_event_showcase_unauthorized_client_mutations failed');

    // Debug OFF: EXPOSE_API_ERRORS=false
    const resOff = await handleWorkerApiError(
      publishRpcError,
      req,
      { 'Access-Control-Allow-Origin': '*' },
      { EXPOSE_API_ERRORS: 'false' }
    );
    assert.strictEqual(resOff.status, 500);
    const bodyOff = await resOff.json();
    assert.strictEqual(bodyOff.error, 'Something went wrong. Please try again.');
    assert.strictEqual(bodyOff.requestId, 'publish-req-123');

    // Debug ON: EXPOSE_API_ERRORS=true
    const resOn = await handleWorkerApiError(
      publishRpcError,
      req,
      { 'Access-Control-Allow-Origin': '*' },
      { EXPOSE_API_ERRORS: 'true' }
    );
    assert.strictEqual(resOn.status, 500);
    const bodyOn = await resOn.json();
    assert.strictEqual(
      bodyOn.error,
      'Database error publishing showcase: trigger prevent_event_showcase_unauthorized_client_mutations failed',
      'Debug mode ON must expose actual underlying database error'
    );
    assert.strictEqual(bodyOn.requestId, 'publish-req-123');

    console.log('   ✓ Showcase publish flow in Debug OFF and Debug ON passed');
  }

  // 3. Showcase Draft Save (POST) and Update (PATCH) flows
  console.log('\n3. Testing Save Draft (POST) and Update Draft (PATCH) showcase flows...');
  {
    const eventId = 'evt-draft-888';

    // POST /api/events/:eventId/showcase (Save Draft)
    const postReq = new Request(`https://eventgamestudio.com/api/events/${eventId}/showcase`, {
      method: 'POST',
      headers: { 'x-correlation-id': 'draft-post-req-456' },
    });
    const insertDbError = new Error('Database error creating showcase: duplicate key violates unique constraint');

    // Debug OFF
    const postOff = await handleWorkerApiError(insertDbError, postReq, { 'Access-Control-Allow-Origin': '*' }, { EXPOSE_API_ERRORS: 'false' });
    const postOffBody = await postOff.json();
    assert.strictEqual(postOffBody.error, 'Something went wrong. Please try again.');
    assert.strictEqual(postOffBody.requestId, 'draft-post-req-456');

    // Debug ON
    const postOn = await handleWorkerApiError(insertDbError, postReq, { 'Access-Control-Allow-Origin': '*' }, { EXPOSE_API_ERRORS: 'true' });
    const postOnBody = await postOn.json();
    assert.strictEqual(postOnBody.error, 'Database error creating showcase: duplicate key violates unique constraint');
    assert.strictEqual(postOnBody.requestId, 'draft-post-req-456');

    // PATCH /api/events/:eventId/showcase (Update Draft)
    const patchReq = new Request(`https://eventgamestudio.com/api/events/${eventId}/showcase`, {
      method: 'PATCH',
      headers: { 'x-correlation-id': 'draft-patch-req-789' },
    });
    const updateDbError = new Error('Database error updating showcase: relation "public.event_showcases" is locked by concurrent transaction');

    // Debug OFF
    const patchOff = await handleWorkerApiError(updateDbError, patchReq, { 'Access-Control-Allow-Origin': '*' }, { EXPOSE_API_ERRORS: 'false' });
    const patchOffBody = await patchOff.json();
    assert.strictEqual(patchOffBody.error, 'Something went wrong. Please try again.');
    assert.strictEqual(patchOffBody.requestId, 'draft-patch-req-789');

    // Debug ON
    const patchOn = await handleWorkerApiError(updateDbError, patchReq, { 'Access-Control-Allow-Origin': '*' }, { EXPOSE_API_ERRORS: 'true' });
    const patchOnBody = await patchOn.json();
    assert.strictEqual(patchOnBody.error, 'Database error updating showcase: relation "public.event_showcases" is locked by concurrent transaction');
    assert.strictEqual(patchOnBody.requestId, 'draft-patch-req-789');

    console.log('   ✓ Save draft (POST) and update draft (PATCH) passed');
  }

  // 4. Status code preservation across operational errors
  console.log('\n4. Testing preservation of HTTP status codes in both debug and safe modes...');
  {
    const statusesToTest = [
      { err: new AppError('Bad Request: Invalid title', 400, 'BAD_REQUEST'), expectedStatus: 400 },
      { err: new AppError('Invalid token', 401, 'UNAUTHORIZED'), expectedStatus: 401 },
      { err: new AppError('You do not have permission', 403, 'PERMISSION_DENIED'), expectedStatus: 403 },
      { err: new AppError('Event not found', 404, 'EVENT_NOT_FOUND'), expectedStatus: 404 },
      { err: new AppError('An Event Showcase already exists for this event', 409, 'SHOWCASE_ALREADY_EXISTS'), expectedStatus: 409 },
      { err: new AppError('Event is not eligible', 422, 'SHOWCASE_NOT_ELIGIBLE'), expectedStatus: 422 },
    ];

    for (const { err, expectedStatus } of statusesToTest) {
      const dummyReq = new Request('https://eventgamestudio.com/api/test', {
        headers: { 'x-correlation-id': `test-status-${expectedStatus}` },
      });

      // Operational errors must return their explicit message and status code regardless of EXPOSE_API_ERRORS
      const resSafe = await handleWorkerApiError(err, dummyReq, { 'Access-Control-Allow-Origin': '*' }, { EXPOSE_API_ERRORS: 'false' });
      assert.strictEqual(resSafe.status, expectedStatus, `Status code for ${err.message} in safe mode must be ${expectedStatus}`);
      const bodySafe = await resSafe.json();
      assert.strictEqual(bodySafe.error, err.message);

      const resDebug = await handleWorkerApiError(err, dummyReq, { 'Access-Control-Allow-Origin': '*' }, { EXPOSE_API_ERRORS: 'true' });
      assert.strictEqual(resDebug.status, expectedStatus, `Status code for ${err.message} in debug mode must be ${expectedStatus}`);
      const bodyDebug = await resDebug.json();
      assert.strictEqual(bodyDebug.error, err.message);
    }

    console.log('   ✓ Status codes (400, 401, 403, 404, 409, 422) preserved perfectly');
  }

  // 5. Sensitive data redaction in debug mode
  console.log('\n5. Testing sensitive information redaction even when debug mode is enabled...');
  {
    const leakedSecretErr = new Error(
      'Database query failed on postgresql://postgres:SuperSecretPw123@db.supabase.co:5432/postgres ' +
      'with Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.kjd832 ' +
      'and Stripe secret sk_live_51A2B3C4D5E6F7G8H9I0J1K2L3M4N5O6'
    );

    const req = new Request('https://eventgamestudio.com/api/sensitive-test', {
      headers: { 'x-correlation-id': 'leak-prevention-corr' },
    });

    const resDebug = await handleWorkerApiError(leakedSecretErr, req, { 'Access-Control-Allow-Origin': '*' }, { EXPOSE_API_ERRORS: 'true' });
    const bodyDebug = await resDebug.json();

    assert.ok(!bodyDebug.error.includes('SuperSecretPw123'), 'Must redact database password');
    assert.ok(!bodyDebug.error.includes('kjd832'), 'Must redact JWT token');
    assert.ok(!bodyDebug.error.includes('sk_live_51A2B3C4D5E6F7G8H9I0J1K2L3M4N5O6'), 'Must redact Stripe key');
    assert.ok(bodyDebug.error.includes('[REDACTED]'), 'Must replace secrets with redaction labels');

    console.log('   ✓ Sensitive credentials redaction verified');
  }

  console.log('\n====================================================');
  console.log('🎉 ALL EXPOSE_API_ERRORS TEST SCENARIOS PASSED!');
  console.log('====================================================\n');
}

runExposeApiErrorsTestSuite().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
