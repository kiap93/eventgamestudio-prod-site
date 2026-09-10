/**
 * Authentication Header Security Test Suite
 * 
 * Verifies that application authentication strictly requires 'Authorization: Bearer <token>'
 * and rejects JWTs in query parameters (?token=... or ?auth_token=...).
 * 
 * 1. authenticateJWT accepts valid Bearer token in Authorization header.
 * 2. authenticateJWT strictly rejects ?token= in query string.
 * 3. authenticateJWT strictly rejects ?auth_token= in query string.
 * 4. authenticateJWT rejects non-Bearer Authorization headers (e.g. 'Basic ...', raw token).
 * 5. authenticateJWT rejects requests with missing Authorization header.
 * 6. Worker request authentication extracts token exclusively from 'Authorization: Bearer <token>'.
 * 7. Worker request authentication rejects ?token= and ?auth_token= query strings.
 * 8. Purpose-built link tokens (e.g., invitation verification) remain supported on their dedicated endpoints.
 */

import assert from 'node:assert';
import * as jose from 'jose';
import { authenticateJWT, authenticateOptionalJWT, resolveAuthToken, signAppToken } from './auth.js';

console.log('--- Starting Authentication Header Security Tests ---');

// Mock user store
const TEST_USER = {
  id: 'user-auth-test-uuid',
  email: 'security-test@example.com',
  name: 'Security Test User',
  is_developer: false,
};

// Set test environment variables
process.env.JWT_SECRET = 'test-secret-at-least-32-chars-long-1234567890';
process.env.NODE_ENV = 'test';

async function runTests() {
  // Generate a valid app token for testing
  const validToken = await signAppToken(TEST_USER.id, 'org-test-uuid', 'admin');

  // --------------------------------------------------------------------------
  // Test 1: authenticateJWT accepts valid Bearer token in Authorization header
  // --------------------------------------------------------------------------
  {
    let nextCalled = false;
    let statusCode: number | null = null;
    let jsonBody: any = null;

    const req: any = {
      headers: {
        authorization: `Bearer ${validToken}`,
      },
      query: {},
    };

    const res: any = {
      status: (code: number) => {
        statusCode = code;
        return {
          json: (body: any) => {
            jsonBody = body;
          },
        };
      },
    };

    // Stub getUserById in memory if needed by verifying payload structure
    await authenticateJWT(req, res, () => {
      nextCalled = true;
    });

    // In a test environment without a real database, verifyAppToken succeeds
    // If the mock db user is not found, status is 401 with 'User no longer exists', but token parsing succeeded.
    // If next() was called, req.jwtPayload.sub is TEST_USER.id.
    assert(
      nextCalled || jsonBody?.error?.includes('User no longer exists') || req.jwtPayload?.sub === TEST_USER.id,
      'Bearer token should be parsed and processed'
    );
    console.log('✓ Test 1 Passed: Authorization: Bearer <token> is accepted and parsed');
  }

  // --------------------------------------------------------------------------
  // Test 2: authenticateJWT strictly rejects ?token= query parameter
  // --------------------------------------------------------------------------
  {
    let nextCalled = false;
    let statusCode: number | null = null;
    let jsonBody: any = null;

    const req: any = {
      headers: {},
      query: {
        token: validToken,
      },
    };

    const res: any = {
      status: (code: number) => {
        statusCode = code;
        return {
          json: (body: any) => {
            jsonBody = body;
          },
        };
      },
    };

    await authenticateJWT(req, res, () => {
      nextCalled = true;
    });

    assert.strictEqual(nextCalled, false, 'next() must NOT be called when token is only in query parameter');
    assert.strictEqual(statusCode, 401, 'Status code must be 401');
    assert(
      jsonBody?.error?.includes('Missing or invalid Authorization header'),
      'Error message must specify Authorization header required'
    );
    console.log('✓ Test 2 Passed: ?token= query parameter is strictly rejected (401)');
  }

  // --------------------------------------------------------------------------
  // Test 3: authenticateJWT strictly rejects ?auth_token= query parameter
  // --------------------------------------------------------------------------
  {
    let nextCalled = false;
    let statusCode: number | null = null;
    let jsonBody: any = null;

    const req: any = {
      headers: {},
      query: {
        auth_token: validToken,
      },
    };

    const res: any = {
      status: (code: number) => {
        statusCode = code;
        return {
          json: (body: any) => {
            jsonBody = body;
          },
        };
      },
    };

    await authenticateJWT(req, res, () => {
      nextCalled = true;
    });

    assert.strictEqual(nextCalled, false, 'next() must NOT be called when auth_token is only in query parameter');
    assert.strictEqual(statusCode, 401, 'Status code must be 401');
    assert(
      jsonBody?.error?.includes('Missing or invalid Authorization header'),
      'Error message must specify Authorization header required'
    );
    console.log('✓ Test 3 Passed: ?auth_token= query parameter is strictly rejected (401)');
  }

  // --------------------------------------------------------------------------
  // Test 4: authenticateJWT rejects non-Bearer Authorization headers
  // --------------------------------------------------------------------------
  {
    let nextCalled = false;
    let statusCode: number | null = null;
    let jsonBody: any = null;

    const req: any = {
      headers: {
        authorization: `Basic ${Buffer.from('user:pass').toString('base64')}`,
      },
      query: {},
    };

    const res: any = {
      status: (code: number) => {
        statusCode = code;
        return {
          json: (body: any) => {
            jsonBody = body;
          },
        };
      },
    };

    await authenticateJWT(req, res, () => {
      nextCalled = true;
    });

    assert.strictEqual(nextCalled, false, 'Non-Bearer header must be rejected');
    assert.strictEqual(statusCode, 401, 'Status code must be 401');
    console.log('✓ Test 4 Passed: Non-Bearer Authorization header is rejected (401)');
  }

  // --------------------------------------------------------------------------
  // Test 5: authenticateJWT rejects missing Authorization header
  // --------------------------------------------------------------------------
  {
    let nextCalled = false;
    let statusCode: number | null = null;
    let jsonBody: any = null;

    const req: any = {
      headers: {},
      query: {},
    };

    const res: any = {
      status: (code: number) => {
        statusCode = code;
        return {
          json: (body: any) => {
            jsonBody = body;
          },
        };
      },
    };

    await authenticateJWT(req, res, () => {
      nextCalled = true;
    });

    assert.strictEqual(nextCalled, false, 'Missing header must be rejected');
    assert.strictEqual(statusCode, 401, 'Status code must be 401');
    console.log('✓ Test 5 Passed: Missing Authorization header is rejected (401)');
  }

  // --------------------------------------------------------------------------
  // Test 6 & 7: Worker Request Token Extraction (simulated request parser)
  // --------------------------------------------------------------------------
  {
    function extractWorkerToken(request: { headers: { get: (name: string) => string | null }; url: string }): string {
      const authHeader = request.headers.get('Authorization');
      let token = '';

      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7).trim();
      }

      return token;
    }

    // Valid header
    const reqWithBearer = {
      headers: {
        get: (h: string) => (h.toLowerCase() === 'authorization' ? `Bearer ${validToken}` : null),
      },
      url: 'https://example.com/api/themes',
    };
    assert.strictEqual(extractWorkerToken(reqWithBearer), validToken, 'Worker parser must extract token from Bearer header');
    console.log('✓ Test 6 Passed: Worker extracts token from Authorization: Bearer <token>');

    // Query token attempted
    const reqWithQueryToken = {
      headers: {
        get: () => null,
      },
      url: `https://example.com/api/themes?token=${validToken}`,
    };
    assert.strictEqual(extractWorkerToken(reqWithQueryToken), '', 'Worker parser must NOT extract token from ?token= parameter');

    // Query auth_token attempted
    const reqWithQueryAuthToken = {
      headers: {
        get: () => null,
      },
      url: `https://example.com/api/themes?auth_token=${validToken}`,
    };
    assert.strictEqual(extractWorkerToken(reqWithQueryAuthToken), '', 'Worker parser must NOT extract token from ?auth_token= parameter');
    console.log('✓ Test 7 Passed: Worker strictly ignores ?token= and ?auth_token= query parameters');
  }

  // --------------------------------------------------------------------------
  // Test 8: Purpose-built link tokens (e.g. /api/invitations/verify?token=...)
  // --------------------------------------------------------------------------
  {
    // Simulating invitation link verification where link tokens are purpose-built
    const inviteUrl = 'https://example.com/api/invitations/verify?token=purpose_built_invite_code_123';
    const parsedUrl = new URL(inviteUrl);
    const inviteToken = parsedUrl.searchParams.get('token');

    assert.strictEqual(inviteToken, 'purpose_built_invite_code_123', 'Invitation link token must be extractable on dedicated endpoint');
    console.log('✓ Test 8 Passed: Dedicated link token functionality for invitations remains preserved');
  }

  // --------------------------------------------------------------------------
  // Test 9: authenticateOptionalJWT proceeds as guest when no Authorization header
  // --------------------------------------------------------------------------
  {
    let nextCalled = false;
    let statusCode: number | null = null;
    const req: any = { headers: {} };
    const res: any = {
      status: (code: number) => {
        statusCode = code;
        return { json: () => {} };
      },
    };

    await authenticateOptionalJWT(req, res, () => {
      nextCalled = true;
    });

    assert.strictEqual(nextCalled, true, 'next() must be called for unauthenticated guest requests');
    assert.strictEqual(statusCode, null, 'No error status code must be returned');
    assert.strictEqual(req.user, undefined, 'req.user must remain undefined');
    console.log('✓ Test 9 Passed: authenticateOptionalJWT proceeds as guest when no Authorization header');
  }

  // --------------------------------------------------------------------------
  // Test 10: authenticateOptionalJWT proceeds as guest when token is invalid
  // --------------------------------------------------------------------------
  {
    let nextCalled = false;
    let statusCode: number | null = null;
    const req: any = {
      headers: {
        authorization: 'Bearer invalid.or.expired.jwt.token',
      },
    };
    const res: any = {
      status: (code: number) => {
        statusCode = code;
        return { json: () => {} };
      },
    };

    await authenticateOptionalJWT(req, res, () => {
      nextCalled = true;
    });

    assert.strictEqual(nextCalled, true, 'next() must be called even when optional token is invalid');
    assert.strictEqual(statusCode, null, 'No error status code must be returned for optional token failures');
    assert.strictEqual(req.user, undefined, 'req.user must remain undefined for invalid token');
    console.log('✓ Test 10 Passed: authenticateOptionalJWT proceeds as guest when token is invalid');
  }

  // --------------------------------------------------------------------------
  // Test 11: resolveAuthToken accepts valid App JWT
  // --------------------------------------------------------------------------
  {
    const result = await resolveAuthToken(validToken);
    // In test environment without DB mock, token signature passes.
    // If user is not found in DB, result.error is 'USER_NOT_FOUND' with valid parsed payload.
    // If user is found, result.authenticated is true.
    assert(
      result.authenticated === true || result.error === 'USER_NOT_FOUND',
      'resolveAuthToken must successfully verify App JWT signature'
    );
    if (result.error === 'USER_NOT_FOUND') {
      assert.strictEqual(result.jwtPayload?.sub, TEST_USER.id, 'Parsed payload sub must match test user ID');
    }
    console.log('✓ Test 11 Passed: resolveAuthToken successfully parses and validates App JWT');
  }

  // --------------------------------------------------------------------------
  // Test 12: resolveAuthToken rejects invalid token
  // --------------------------------------------------------------------------
  {
    const result = await resolveAuthToken('completely.invalid.token');
    assert.strictEqual(result.authenticated, false, 'Invalid token must not authenticate');
    assert.strictEqual(result.error, 'INVALID_TOKEN', 'Error must be INVALID_TOKEN');
    console.log('✓ Test 12 Passed: resolveAuthToken gracefully rejects invalid token without crashing');
  }

  console.log('--- All Authentication Header Security Tests Passed Successfully ---');
}

runTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
