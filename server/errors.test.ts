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
    assert.strictEqual(responseJson.error, 'Internal server error', 'Must mask internal SQL details');
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
    assert.strictEqual(workerBody.error, 'Internal server error');
    assert.strictEqual(workerBody.requestId, 'worker-corr-777');
    assert.strictEqual(workerRes.headers.get('x-correlation-id'), 'worker-corr-777');
    assert.strictEqual(workerRes.headers.get('Access-Control-Allow-Origin'), '*');
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

  console.log('\n====================================================');
  console.log('🎉 ALL API ERROR HANDLING & AUDIT TESTS PASSED!');
  console.log('====================================================\n');
}

runErrorHandlingTests().catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
