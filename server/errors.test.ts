import assert from 'node:assert';
import {
  AppError,
  isOperationalError,
  sanitizeData,
  sanitizeHeaders,
  detectErrorService,
  resolveCorrelationId,
  handleApiError,
  handleWorkerApiError,
  shouldExposeApiErrors,
  getActualErrorMessage,
} from './errors.js';
import { logApiError, listApiErrorLogs, getApiErrorLogById } from './db/errorLogs.js';

async function runErrorHandlingTests() {
  console.log('====================================================');
  console.log('TEST SUITE: API ERROR HANDLING & AUDITING');
  console.log('====================================================\n');

  // --------------------------------------------------------------------------
  // 1. AppError and Operational Classification
  // --------------------------------------------------------------------------
  console.log('1. Testing AppError and operational error classification...');
  {
    const appErr = new AppError('Event is not active', 400, 'EVENT_NOT_ACTIVE', { eventId: '123' });
    assert.strictEqual(appErr.message, 'Event is not active');
    assert.strictEqual(appErr.statusCode, 400);
    assert.strictEqual(appErr.code, 'EVENT_NOT_ACTIVE');
    assert.deepStrictEqual(appErr.metadata, { eventId: '123' });
    assert.strictEqual(appErr.isOperational, true);
    assert.strictEqual(isOperationalError(appErr), true);

    const genericErr = new Error('Database connection failed unexpectedly');
    assert.strictEqual(isOperationalError(genericErr), false);

    const typeErr = new TypeError('Cannot read properties of undefined');
    assert.strictEqual(isOperationalError(typeErr), false);

    // Postgres / Supabase internal error leak prevention tests
    const uniqueConstraintErr = new Error('duplicate key value violates unique constraint "events_pkey"');
    assert.strictEqual(isOperationalError(uniqueConstraintErr), false, 'Must reject unique constraint violations');

    const rlsErr = new Error('new row violates row-level security policy for table "events"');
    assert.strictEqual(isOperationalError(rlsErr), false, 'Must reject RLS policy violations');

    const permDeniedErr = new Error('permission denied for table events');
    assert.strictEqual(isOperationalError(permDeniedErr), false, 'Must reject permission denied errors');

    const sqlstateUniqueErr = { code: '23505', message: 'Key (slug)=(test) already exists.', status: 400 };
    assert.strictEqual(isOperationalError(sqlstateUniqueErr), false, 'Must reject SQLSTATE 23505 even if status 400');

    const sqlstateRlsErr = { code: '42501', message: 'insufficient_privilege' };
    assert.strictEqual(isOperationalError(sqlstateRlsErr), false, 'Must reject SQLSTATE 42501');

    const pgrstErr = { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' };
    assert.strictEqual(isOperationalError(pgrstErr), false, 'Must reject PostgREST errors');

    const driverMetaErr = { message: 'Unexpected query failure', routine: 'exec_simple_query', table: 'events' };
    assert.strictEqual(isOperationalError(driverMetaErr), false, 'Must reject driver metadata errors');

    // Duck-typed operational error
    const duckErr = { statusCode: 404, message: 'User not found', isOperational: true };
    assert.strictEqual(isOperationalError(duckErr), true);
    console.log('   ✓ AppError & operational error classification passed');
  }

  // --------------------------------------------------------------------------
  // 2. Data Sanitization & Header Redaction
  // --------------------------------------------------------------------------
  console.log('2. Testing data sanitization and header redaction...');
  {
    const dirtyPayload = {
      email: 'organizer@example.com',
      password: 'SuperSecretPassword123!',
      nested: {
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotLeakThis',
        apiKey: 'sk_live_51abcdef123456789',
        publicNote: 'This is safe to log',
      },
      tags: ['event', 'corporate'],
      rawBearer: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig',
    };

    const clean = sanitizeData(dirtyPayload);
    assert.strictEqual(clean.email, 'organizer@example.com');
    assert.strictEqual(clean.password, '[REDACTED]');
    assert.strictEqual(clean.nested.token, '[REDACTED]');
    assert.strictEqual(clean.nested.apiKey, '[REDACTED]');
    assert.strictEqual(clean.nested.publicNote, 'This is safe to log');
    assert.deepStrictEqual(clean.tags, ['event', 'corporate']);
    assert.strictEqual(clean.rawBearer, 'Bearer [REDACTED]');

    // Test Headers sanitization
    const headersMap = new Map<string, string>([
      ['authorization', 'Bearer my-jwt-secret-token'],
      ['cookie', 'session=abc123secret'],
      ['content-type', 'application/json'],
      ['x-correlation-id', 'test-corr-id-123'],
    ]);

    const cleanHeaders = sanitizeHeaders(headersMap as any);
    assert.strictEqual(cleanHeaders['authorization'], '[REDACTED]');
    assert.strictEqual(cleanHeaders['cookie'], '[REDACTED]');
    assert.strictEqual(cleanHeaders['content-type'], 'application/json');
    assert.strictEqual(cleanHeaders['x-correlation-id'], 'test-corr-id-123');
    console.log('   ✓ Data sanitization & header redaction passed');
  }

  // --------------------------------------------------------------------------
  // 3. Service Detection
  // --------------------------------------------------------------------------
  console.log('3. Testing service detection...');
  {
    assert.strictEqual(detectErrorService(new Error('column users.email does not exist')), 'postgres');
    assert.strictEqual(detectErrorService(new Error('PGRST116: JSON object requested, multiple returned')), 'supabase');
    assert.strictEqual(detectErrorService(new Error('No such payment_intent: pi_123')), 'stripe');
    assert.strictEqual(detectErrorService(new Error('Bucket not found: asset-uploads')), 'storage');
    assert.strictEqual(detectErrorService(new Error('function process_topup_order_atomic does not exist')), 'rpc');
    assert.strictEqual(detectErrorService(new Error('invalid_token: JWT expired')), 'authentication');
    assert.strictEqual(detectErrorService(new Error('invalid string length for organization name')), 'validation');
    assert.strictEqual(detectErrorService(new Error('random unknown issue')), 'unknown');
    console.log('   ✓ Service detection passed');
  }

  // --------------------------------------------------------------------------
  // 4. Correlation ID Resolution
  // --------------------------------------------------------------------------
  console.log('4. Testing correlation ID resolution...');
  {
    // From x-correlation-id
    const reqWithCorr = {
      headers: { 'x-correlation-id': 'custom-client-req-999' },
    };
    assert.strictEqual(resolveCorrelationId(reqWithCorr as any), 'custom-client-req-999');

    // From x-request-id
    const reqWithReqId = {
      headers: { 'x-request-id': 'cf-ray-request-888' },
    };
    assert.strictEqual(resolveCorrelationId(reqWithReqId as any), 'cf-ray-request-888');

    // Auto-generated UUID if missing
    const reqEmpty = { headers: {} };
    const generated = resolveCorrelationId(reqEmpty as any);
    assert.ok(generated && generated.length > 10, 'Must generate a valid unique ID');
    console.log('   ✓ Correlation ID resolution passed');
  }

  // --------------------------------------------------------------------------
  // 5. Express handleApiError - Information Leak Prevention
  // --------------------------------------------------------------------------
  console.log('5. Testing Express handleApiError for secure masking...');
  {
    let responseStatus: number = 0;
    let responseJson: any = null;
    let responseHeaders: Record<string, string> = {};

    const mockRes: any = {
      status(code: number) {
        responseStatus = code;
        return this;
      },
      json(payload: any) {
        responseJson = payload;
        return this;
      },
      setHeader(name: string, val: string) {
        responseHeaders[name.toLowerCase()] = val;
      },
    };

    const mockReq: any = {
      id: 'req-audit-12345',
      headers: {},
      originalUrl: '/api/events/checkout',
      method: 'POST',
      body: { password: 'leakMe', amount: 1400 },
    };

    // Simulate unexpected internal Postgres crash
    const fatalPgError = new Error('syntax error at or near "SELECT" in query: SELECT * FROM secret_passwords');
    (fatalPgError as any).code = '42601';

    handleApiError(fatalPgError, mockReq, mockRes);

    assert.strictEqual(responseStatus, 500, 'Must return HTTP 500 for unexpected error');
    assert.ok(responseJson.error === 'Internal server error' || responseJson.error === 'Something went wrong. Please try again.', 'Must mask internal SQL details');
    assert.strictEqual(responseJson.requestId, 'req-audit-12345', 'Must include requestId');
    assert.strictEqual(responseHeaders['x-correlation-id'], 'req-audit-12345', 'Must propagate correlation header');
    assert.ok(!JSON.stringify(responseJson).includes('secret_passwords'), 'Response must NEVER contain internal query text');

    // Operational error test
    const operationalErr = new AppError('Insufficient wallet balance', 402, 'INSUFFICIENT_FUNDS');
    handleApiError(operationalErr, mockReq, mockRes);

    assert.strictEqual(responseStatus, 402, 'Must return HTTP 402 for operational error');
    assert.strictEqual(responseJson.error, 'Insufficient wallet balance');
    assert.strictEqual(responseJson.code, 'INSUFFICIENT_FUNDS');
    console.log('   ✓ Express handleApiError secure masking passed');
  }

  // --------------------------------------------------------------------------
  // 6. Worker handleWorkerApiError - Cloudflare Worker Masking
  // --------------------------------------------------------------------------
  console.log('6. Testing Worker handleWorkerApiError...');
  {
    const workerReq = new Request('https://eventgamestudio.com/api/wallets/topup', {
      method: 'POST',
      headers: {
        'x-correlation-id': 'worker-corr-777',
      },
    });

    const fatalWorkerErr = new Error('Supabase RPC failure: constraint uq_wallet_orders violated');
    const workerRes = await handleWorkerApiError(fatalWorkerErr, workerReq, { 'Access-Control-Allow-Origin': '*' });

    assert.strictEqual(workerRes.status, 500);
    const workerBody = await workerRes.json();
    assert.ok(workerBody.error === 'Internal server error' || workerBody.error === 'Something went wrong. Please try again.');
    assert.strictEqual(workerBody.requestId, 'worker-corr-777');
    assert.strictEqual(workerRes.headers.get('x-correlation-id'), 'worker-corr-777');
    assert.strictEqual(workerRes.headers.get('Access-Control-Allow-Origin'), '*');

    // Test specific Postgres errors mentioned by user in handleWorkerApiError
    const uniqueWorkerErr = new Error('duplicate key value violates unique constraint "events_pkey"');
    const uniqueRes = await handleWorkerApiError(uniqueWorkerErr, workerReq, { 'Access-Control-Allow-Origin': '*' });
    assert.strictEqual(uniqueRes.status, 500);
    const uniqueBody = await uniqueRes.json();
    assert.ok(uniqueBody.error === 'Internal server error' || uniqueBody.error === 'Something went wrong. Please try again.', 'Must not leak unique constraint details');
    assert.strictEqual(Object.values(uniqueBody).some(v => String(v).includes('events_pkey')), false);

    const rlsWorkerErr = new Error('new row violates row-level security policy for table "events"');
    const rlsRes = await handleWorkerApiError(rlsWorkerErr, workerReq, { 'Access-Control-Allow-Origin': '*' });
    assert.strictEqual(rlsRes.status, 500);
    const rlsBody = await rlsRes.json();
    assert.ok(rlsBody.error === 'Internal server error' || rlsBody.error === 'Something went wrong. Please try again.', 'Must not leak RLS policy details');

    const permWorkerErr = new Error('permission denied for table events');
    const permRes = await handleWorkerApiError(permWorkerErr, workerReq, { 'Access-Control-Allow-Origin': '*' });
    assert.strictEqual(permRes.status, 500);
    const permBody = await permRes.json();
    assert.ok(permBody.error === 'Internal server error' || permBody.error === 'Something went wrong. Please try again.', 'Must not leak table permission errors');

    // Test that safe operational errors still pass through cleanly
    const safeOperationalErr = new AppError('Event slug already taken', 400, 'SLUG_IN_USE');
    const safeRes = await handleWorkerApiError(safeOperationalErr, workerReq, { 'Access-Control-Allow-Origin': '*' });
    assert.strictEqual(safeRes.status, 400);
    const safeBody = await safeRes.json();
    assert.strictEqual(safeBody.error, 'Event slug already taken');
    assert.strictEqual(safeBody.code, 'SLUG_IN_USE');

    console.log('   ✓ Worker handleWorkerApiError passed');
  }

  // --------------------------------------------------------------------------
  // 7. Error Log Persistence and Querying
  // --------------------------------------------------------------------------
  console.log('7. Testing error log persistence and search filtering...');
  {
    const testReqId = `test-log-${Date.now()}`;
    const logged = await logApiError({
      request_id: testReqId,
      user_id: 'test-user-uuid',
      method: 'POST',
      endpoint: '/api/test/failure',
      status_code: 500,
      error_type: 'TestError',
      error_code: 'TEST_FAILURE',
      error_message: 'Simulated failure for audit verification',
      stack_trace: 'Error: Simulated failure\n    at runErrorHandlingTests (server/errors.test.ts:100:20)',
      service: 'postgres',
      metadata: { key: 'value' },
    });

    assert.ok(logged, 'Must successfully create error log entry');
    assert.strictEqual(logged.request_id, testReqId);

    // Query logs by requestId
    const queryResult = await listApiErrorLogs({
      requestId: testReqId,
    });
    assert.ok(queryResult.data.length >= 1, 'Must find the inserted error log');
    assert.strictEqual(queryResult.data[0].request_id, testReqId);
    assert.strictEqual(queryResult.data[0].service, 'postgres');

    // Retrieve by ID
    const retrieved = await getApiErrorLogById(logged.id);
    assert.ok(retrieved, 'Must retrieve log entry by ID');
    assert.strictEqual(retrieved?.id, logged.id);
    assert.strictEqual(retrieved?.request_id, testReqId);
    console.log('   ✓ Error log persistence & query audit passed');
  }

  // --------------------------------------------------------------------------
  // 8. EXPOSE_API_ERRORS Environment-Controlled Debug Mode
  // --------------------------------------------------------------------------
  console.log('8. Testing EXPOSE_API_ERRORS environment-controlled debug mode...');
  {
    // A. Environment flag evaluation
    assert.strictEqual(shouldExposeApiErrors(undefined), false, 'undefined must be false');
    assert.strictEqual(shouldExposeApiErrors({}), false, 'empty env must be false');
    assert.strictEqual(shouldExposeApiErrors({ EXPOSE_API_ERRORS: undefined }), false, 'undefined var must be false');
    assert.strictEqual(shouldExposeApiErrors({ EXPOSE_API_ERRORS: 'false' }), false, 'false must be false');
    assert.strictEqual(shouldExposeApiErrors({ EXPOSE_API_ERRORS: 'FALSE' }), false, 'FALSE must be false');
    assert.strictEqual(shouldExposeApiErrors({ EXPOSE_API_ERRORS: '0' }), false, '0 must be false');
    assert.strictEqual(shouldExposeApiErrors({ EXPOSE_API_ERRORS: 'yes' }), false, 'yes must be false');
    assert.strictEqual(shouldExposeApiErrors({ EXPOSE_API_ERRORS: 'true' }), true, 'true must be true');
    assert.strictEqual(shouldExposeApiErrors({ EXPOSE_API_ERRORS: 'TRUE' }), true, 'TRUE must be true');
    assert.strictEqual(shouldExposeApiErrors({ EXPOSE_API_ERRORS: ' True ' }), true, 'whitespace True must be true');

    // B. getActualErrorMessage message sanitization
    const errWithStack = new Error('Database error creating showcase: syntax error at or near "SELECT"');
    errWithStack.stack = 'Error: Database error creating showcase\n    at createShowcase (showcases.ts:500:20)\n    at Object.fetch (worker.ts:4000:10)';
    const cleanMsg = getActualErrorMessage(errWithStack);
    assert.ok(cleanMsg.includes('Database error creating showcase'), 'Must preserve error message');
    assert.ok(!cleanMsg.includes('at createShowcase'), 'Must strip stack trace');

    const errWithSecrets = new Error('Database connection failed: postgresql://postgres:SuperSecretPassword123@db.supabase.co:5432/postgres with Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.mySecretSignature and key sk_live_51AbcDef1234567890');
    const sanitizedMsg = getActualErrorMessage(errWithSecrets);
    assert.ok(!sanitizedMsg.includes('SuperSecretPassword123'), 'Must redact database password');
    assert.ok(!sanitizedMsg.includes('mySecretSignature'), 'Must redact JWT secret signature');
    assert.ok(!sanitizedMsg.includes('sk_live_51AbcDef1234567890'), 'Must redact Stripe live key');

    // C. Worker error response: Debug OFF vs Debug ON
    const workerReq = new Request('https://eventgamestudio.com/api/events/evt-123/showcase/publish', {
      method: 'POST',
      headers: { 'x-correlation-id': 'debug-test-corr-1' },
    });
    const sampleDbErr = new Error('Database error publishing showcase: function publish_event_showcase_atomic does not exist');

    // Debug OFF (default / false)
    const offRes = await handleWorkerApiError(
      sampleDbErr,
      workerReq,
      { 'Access-Control-Allow-Origin': '*' },
      { EXPOSE_API_ERRORS: 'false' }
    );
    assert.strictEqual(offRes.status, 500);
    const offBody = await offRes.json();
    assert.strictEqual(offBody.error, 'Something went wrong. Please try again.');
    assert.strictEqual(offBody.requestId, 'debug-test-corr-1');

    // Debug ON (true)
    const onRes = await handleWorkerApiError(
      sampleDbErr,
      workerReq,
      { 'Access-Control-Allow-Origin': '*' },
      { EXPOSE_API_ERRORS: 'true' }
    );
    assert.strictEqual(onRes.status, 500);
    const onBody = await onRes.json();
    assert.strictEqual(onBody.error, 'Database error publishing showcase: function publish_event_showcase_atomic does not exist');
    assert.strictEqual(onBody.requestId, 'debug-test-corr-1');

    // D. Express error response: Debug OFF vs Debug ON
    let expressStatus = 0;
    let expressBody: any = null;
    const mockRes: any = {
      status(code: number) {
        expressStatus = code;
        return this;
      },
      json(payload: any) {
        expressBody = payload;
        return this;
      },
      setHeader() {},
    };
    const mockExpressReq: any = {
      id: 'express-corr-999',
      headers: {},
      originalUrl: '/api/events/evt-456/showcase',
      method: 'POST',
    };

    // Express Debug OFF
    handleApiError(sampleDbErr, mockExpressReq, mockRes, { env: { EXPOSE_API_ERRORS: 'false' } });
    assert.strictEqual(expressStatus, 500);
    assert.strictEqual(expressBody.error, 'Something went wrong. Please try again.');
    assert.strictEqual(expressBody.requestId, 'express-corr-999');

    // Express Debug ON
    handleApiError(sampleDbErr, mockExpressReq, mockRes, { env: { EXPOSE_API_ERRORS: 'true' } });
    assert.strictEqual(expressStatus, 500);
    assert.strictEqual(expressBody.error, 'Database error publishing showcase: function publish_event_showcase_atomic does not exist');
    assert.strictEqual(expressBody.requestId, 'express-corr-999');

    // E. Status code preservation
    const notFoundErr = new AppError('Showcase not found', 404, 'SHOWCASE_NOT_FOUND');
    const nfRes = await handleWorkerApiError(notFoundErr, workerReq, { 'Access-Control-Allow-Origin': '*' }, { EXPOSE_API_ERRORS: 'true' });
    assert.strictEqual(nfRes.status, 404);
    const nfBody = await nfRes.json();
    assert.strictEqual(nfBody.error, 'Showcase not found');

    console.log('   ✓ EXPOSE_API_ERRORS debug mode tests passed');
  }

  console.log('\n====================================================');
  console.log('🎉 ALL API ERROR HANDLING & AUDIT TESTS PASSED!');
  console.log('====================================================\n');
}

runErrorHandlingTests().catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
