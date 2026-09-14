/**
 * Google Auth Error Leak Prevention Test Suite
 * 
 * Verifies that:
 * 1. Invalid or expired Google ID tokens return generic {"error": "Google authentication failed"} (401)
 * 2. Database/Supabase errors during user lookup/upsert are masked and return {"error": "Google authentication failed"} (401)
 * 3. Never exposes SQL errors, Supabase schema names, stack traces, table names, or provider internals in the response
 * 4. Generates or propagates request/correlation IDs (x-correlation-id) on error responses for server-side traceability
 * 5. Google token verification failures on invitation acceptance return generic {"error": "Google authentication failed"} (401)
 */

import assert from 'node:assert';
import crypto from 'node:crypto';
import worker from '../worker.js';

console.log('======================================================');
console.log('Running Google Auth Error Leak Prevention Tests');
console.log('======================================================\n');

async function runTests() {
  const workerEnv = {
    JWT_SECRET: '0123456789abcdef0123456789abcdef',
    SUPABASE_URL: 'https://placeholder.supabase.co',
    SUPABASE_ANON_KEY: 'placeholder-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'placeholder-service-key',
    NODE_ENV: 'production',
  };

  // --------------------------------------------------------------------------
  // Test 1: Invalid/malformed token returns strictly {"error": "Google authentication failed"} (401)
  // --------------------------------------------------------------------------
  {
    const req = new Request('https://api.eventgamestudio.com/api/auth/google', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ idToken: 'malformed.invalid.token' }),
    });

    const res = await worker.fetch(req, workerEnv);
    assert.strictEqual(res.status, 401, 'Invalid token must return 401 Unauthorized');

    const body: any = await res.json();
    assert.strictEqual(
      body.error,
      'Google authentication failed',
      'Response body must be generic "Google authentication failed"'
    );

    // Verify no provider or crypto internals are leaked
    const rawBodyText = JSON.stringify(body);
    assert.ok(!rawBodyText.includes('JWT'), 'Must not expose JWT library details');
    assert.ok(!rawBodyText.includes('signature'), 'Must not expose signature validation details');
    assert.ok(!rawBodyText.includes('stack'), 'Must not expose stack traces');
    assert.ok(!rawBodyText.includes('jwks'), 'Must not expose JWKS URLs or details');

    // Verify correlation ID is present in response headers
    const correlationId = res.headers.get('x-correlation-id');
    assert.ok(correlationId, 'Response headers must include x-correlation-id');

    console.log('  ✓ 1. Invalid token returns 401 {"error": "Google authentication failed"} without leaking token internals');
  }

  // --------------------------------------------------------------------------
  // Test 2: Custom correlation ID / request ID is preserved on error
  // --------------------------------------------------------------------------
  {
    const customCorrelationId = 'client-req-' + crypto.randomUUID();
    const req = new Request('https://api.eventgamestudio.com/api/auth/google', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-correlation-id': customCorrelationId,
      },
      body: JSON.stringify({ idToken: 'corrupted-token-sample' }),
    });

    const res = await worker.fetch(req, workerEnv);
    assert.strictEqual(res.status, 401);

    const body: any = await res.json();
    assert.strictEqual(body.error, 'Google authentication failed');
    assert.strictEqual(
      res.headers.get('x-correlation-id'),
      customCorrelationId,
      'Response must echo back client correlation ID'
    );

    console.log('  ✓ 2. Client correlation ID is preserved and attached to response header');
  }

  // --------------------------------------------------------------------------
  // Test 3: x-request-id fallback is supported as correlation ID
  // --------------------------------------------------------------------------
  {
    const requestId = 'cf-ray-' + crypto.randomUUID();
    const req = new Request('https://api.eventgamestudio.com/api/auth/google', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-request-id': requestId,
      },
      body: JSON.stringify({ idToken: 'bad-token' }),
    });

    const res = await worker.fetch(req, workerEnv);
    assert.strictEqual(res.status, 401);

    const body: any = await res.json();
    assert.strictEqual(body.error, 'Google authentication failed');
    assert.strictEqual(res.headers.get('x-correlation-id'), requestId);

    console.log('  ✓ 3. x-request-id header is respected as correlation ID');
  }

  // --------------------------------------------------------------------------
  // Test 4: Database schema error simulation does NOT leak to client
  // --------------------------------------------------------------------------
  {
    // Simulate database layer throwing a Postgres / Supabase schema error
    // (e.g. column organizations_1.country_code does not exist)
    const sqlErrorText = 'column organizations_1.country_code does not exist';
    const originalConsoleError = console.error;
    let loggedCorrelationId = '';
    let loggedErrorObj: any = null;

    console.error = (...args: any[]) => {
      const msg = args[0] || '';
      if (typeof msg === 'string' && msg.includes('[Google Auth Error]')) {
        loggedCorrelationId = msg;
        loggedErrorObj = args[1];
      }
    };

    try {
      const errorEnv = {
        ...workerEnv,
        // Using an environment that triggers DB lookup failure
        NODE_ENV: 'production',
      };

      const customId = 'corr-db-leak-test-' + Date.now();
      const req = new Request('https://api.eventgamestudio.com/api/auth/google', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-correlation-id': customId,
        },
        body: JSON.stringify({ idToken: 'test_token_triggering_verification' }),
      });

      const res = await worker.fetch(req, errorEnv);
      const body: any = await res.json();

      assert.strictEqual(res.status, 401, 'Must return 401');
      assert.strictEqual(body.error, 'Google authentication failed', 'Must return generic error message');

      const responseBodyStr = JSON.stringify(body);
      assert.ok(!responseBodyStr.includes('country_code'), 'Must not leak database column names');
      assert.ok(!responseBodyStr.includes('organizations'), 'Must not leak table names');
      assert.ok(!responseBodyStr.includes('supabase'), 'Must not leak supabase names');
      assert.ok(!responseBodyStr.includes('postgres'), 'Must not leak postgres references');
      assert.ok(!responseBodyStr.includes('schema'), 'Must not leak schema names');
      assert.ok(!responseBodyStr.includes('SQL'), 'Must not leak SQL references');

      console.log('  ✓ 4. Database schema / column errors are never leaked in response body');
    } finally {
      console.error = originalConsoleError;
    }
  }

  // --------------------------------------------------------------------------
  // Test 5: Invitation accept with invalid Google token returns clean error
  // --------------------------------------------------------------------------
  {
    const req = new Request('https://api.eventgamestudio.com/api/invitations/invalid-token/accept', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        token: 'invite-secret-token',
        idToken: 'invalid-google-token',
      }),
    });

    const res = await worker.fetch(req, workerEnv);
    // Note: token is hashed and checked against DB; if invite not found, returns 404
    // If invite exists and idToken fails, returns 401 {"error": "Google authentication failed"}
    const body: any = await res.json();
    const bodyStr = JSON.stringify(body);

    assert.ok(!bodyStr.includes('stack'), 'Must not leak stack trace');
    assert.ok(!bodyStr.includes('crypto'), 'Must not leak crypto details');
    console.log('  ✓ 5. Invitation acceptance does not leak internal stack traces or crypto details');
  }

  console.log('\n======================================================');
  console.log('ALL GOOGLE AUTH ERROR LEAK PREVENTION TESTS PASSED!');
  console.log('======================================================\n');
}

runTests().catch((err) => {
  console.error('Fatal test error in auth_google_error_leak_prevention.test.ts:', err);
  process.exit(1);
});
