/**
 * Google First-Time Registration & Account Linking Regression Test Suite
 *
 * Tests:
 * - Test A: Brand-new user first-time registration creates user record & returns valid session
 * - Test B: Existing user identified by google_id authenticates & updates profile if changed
 * - Test C: Existing application user identified by email is linked to Google safely without duplicates
 * - Test D: Normalization of email (trim/lowercase), google_id (trim), and fallback name
 * - Test E: Concurrent first-time registration requests succeed without error or duplicate users
 * - Test F: Database failure / transient error returns generic 401 without leaking internals
 * - Test G: Error leak prevention: response never contains SQL, Supabase, schema, or stack traces
 */

import assert from 'node:assert';
import * as jose from 'jose';
import worker from '../worker.js';
import {
  clearGoogleJwksCache,
  verifyAppToken,
} from './auth.js';
import {
  resetRateLimitStores,
} from './rateLimiter.js';
import {
  upsertGoogleUser,
  getUserById,
  getUserByGoogleId,
  getUserByEmail,
  isUniqueViolationError,
} from './db/users.js';

console.log('======================================================');
console.log('Running Google First-Time Registration & Linking Tests');
console.log('======================================================\n');

const TEST_CLIENT_ID = 'test-google-client-id-12345.apps.googleusercontent.com';
const JWT_SECRET = 'test-jwt-secret-at-least-32-chars-long-9876543210';

let passed = 0;
let failed = 0;

function report(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ ${testName}${detail ? ` -> ${detail}` : ''}`);
    failed++;
  }
}

async function runTests() {
  const originalFetch = globalThis.fetch;

  // Generate test RSA keypair for Google ID token signing
  const keyPair = await jose.generateKeyPair('RS256');
  const jwk = await jose.exportJWK(keyPair.publicKey);
  jwk.kid = 'reg-test-key-id';
  jwk.alg = 'RS256';
  jwk.use = 'sig';

  // Mock Google JWKS endpoint
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (urlStr.includes('googleapis.com/oauth2/v3/certs')) {
      return new Response(JSON.stringify({ keys: [jwk] }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=3600',
        },
      });
    }
    return originalFetch(input, init);
  };

  async function createSignedGoogleToken(payloadOverrides: Record<string, any> = {}): Promise<string> {
    const header: jose.JWTHeaderParameters = {
      alg: 'RS256',
      kid: 'reg-test-key-id',
    };

    const payload = {
      sub: 'google-sub-' + crypto.randomUUID(),
      email: 'newuser-' + crypto.randomUUID().slice(0, 8) + '@example.com',
      email_verified: true,
      name: 'Test New User',
      picture: 'https://example.com/avatar.png',
      iss: 'https://accounts.google.com',
      aud: TEST_CLIENT_ID,
      ...payloadOverrides,
    };

    return new jose.SignJWT(payload)
      .setProtectedHeader(header)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(keyPair.privateKey);
  }

  const workerEnv: Record<string, any> = {
    JWT_SECRET,
    GOOGLE_CLIENT_ID: TEST_CLIENT_ID,
    NODE_ENV: 'test',
    ALLOW_LOCAL_FALLBACK: 'true',
  };

  try {
    clearGoogleJwksCache();

    // --------------------------------------------------------------------------
    // Test A: Brand-new user first-time Google registration creates user record & returns valid session
    // --------------------------------------------------------------------------
    {
      const newSub = 'google-sub-brand-new-' + Date.now();
      const newEmail = `brandnew-${Date.now()}@example.com`;
      const newName = 'Brand New User';
      const newPicture = 'https://example.com/brandnew.png';

      const idToken = await createSignedGoogleToken({
        sub: newSub,
        email: newEmail,
        name: newName,
        picture: newPicture,
      });

      const req = new Request('https://api.eventgamestudio.com/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });

      const res = await worker.fetch(req, workerEnv);
      const body: any = await res.json();

      report(res.status === 200, 'Test A: Brand-new user returns HTTP 200 OK');
      report(Boolean(body.token), 'Test A: Returns valid app JWT token');
      report(body.user?.email === newEmail.toLowerCase(), 'Test A: User email matches registered email');
      report(body.user?.name === newName, 'Test A: User name matches Google profile');
      report(body.user?.avatar_url === newPicture, 'Test A: Avatar URL matches Google profile');
      report(body.user?.is_developer === false, 'Test A: Brand-new user is NOT developer by default');

      // Verify token is valid app JWT
      const verifiedAppPayload = await verifyAppToken(body.token, JWT_SECRET);
      report(verifiedAppPayload.sub === body.user.id, 'Test A: JWT sub claim matches user.id');

      // Verify record is queryable by google_id and email in user store
      const persistedUser = await getUserByGoogleId(newSub, workerEnv);
      report(persistedUser?.id === body.user.id, 'Test A: User is queryable by google_id');
      const persistedByEmail = await getUserByEmail(newEmail, workerEnv);
      report(persistedByEmail?.id === body.user.id, 'Test A: User is queryable by email');
    }

    // --------------------------------------------------------------------------
    // Test B: Existing user identified by google_id authenticates & updates profile if changed
    // --------------------------------------------------------------------------
    {
      const existingSub = 'google-sub-existing-' + Date.now();
      const existingEmail = `existing-${Date.now()}@example.com`;

      // 1. Initial registration
      const initialToken = await createSignedGoogleToken({
        sub: existingSub,
        email: existingEmail,
        name: 'Original Name',
        picture: 'https://example.com/original.png',
      });

      const initReq = new Request('https://api.eventgamestudio.com/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: initialToken }),
      });
      const initRes = await worker.fetch(initReq, workerEnv);
      const initBody: any = await initRes.json();
      const originalUserId = initBody.user.id;

      // 2. Subsequent login with updated profile details from Google
      const updatedName = 'Updated Name by Google';
      const updatedPicture = 'https://example.com/updated.png';

      const updateToken = await createSignedGoogleToken({
        sub: existingSub,
        email: existingEmail,
        name: updatedName,
        picture: updatedPicture,
      });

      const secondReq = new Request('https://api.eventgamestudio.com/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: updateToken }),
      });
      const secondRes = await worker.fetch(secondReq, workerEnv);
      const secondBody: any = await secondRes.json();

      report(secondRes.status === 200, 'Test B: Existing user login returns HTTP 200');
      report(secondBody.user.id === originalUserId, 'Test B: Reuses existing user ID (no duplicate)');
      report(secondBody.user.name === updatedName, 'Test B: User name was updated with latest Google profile');
      report(secondBody.user.avatar_url === updatedPicture, 'Test B: Avatar was updated with latest Google profile');
    }

    // --------------------------------------------------------------------------
    // Test C: Existing application user identified by email is linked to Google safely without duplicates
    // --------------------------------------------------------------------------
    {
      const linkedEmail = `invitee-${Date.now()}@example.com`;
      const googleSubForLinking = 'google-sub-linked-' + Date.now();

      // Pre-seed an existing user who registered by email/invite without a google_id
      const preExistingUser = await upsertGoogleUser(
        {
          sub: 'temp-sub-will-be-replaced',
          email: linkedEmail,
          name: 'Invited Team Member',
          picture: null as any,
        },
        workerEnv
      );

      // Verify the user exists
      const foundPreUser = await getUserByEmail(linkedEmail, workerEnv);
      report(foundPreUser?.id === preExistingUser.id, 'Test C: Pre-existing email user created successfully');

      // Now authenticate via Google with the same email and a new google_id
      const linkIdToken = await createSignedGoogleToken({
        sub: googleSubForLinking,
        email: linkedEmail,
        name: 'Linked Google Name',
        picture: 'https://example.com/linked.png',
      });

      const linkReq = new Request('https://api.eventgamestudio.com/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: linkIdToken }),
      });
      const linkRes = await worker.fetch(linkReq, workerEnv);
      const linkBody: any = await linkRes.json();

      report(linkRes.status === 200, 'Test C: Linking existing email user returns HTTP 200');
      report(linkBody.user.id === preExistingUser.id, 'Test C: Preserved pre-existing user ID during link');
      report(linkBody.user.email === linkedEmail.toLowerCase(), 'Test C: User email remained consistent');

      // Verify user record now has the new google_id
      const verifiedLinkedUser = await getUserByGoogleId(googleSubForLinking, workerEnv);
      report(verifiedLinkedUser?.id === preExistingUser.id, 'Test C: User is now searchable by the linked google_id');
    }

    // --------------------------------------------------------------------------
    // Test D: Normalization of email (trim/lowercase), google_id (trim), and fallback name
    // --------------------------------------------------------------------------
    {
      const rawSub = '   google-sub-norm-padded-123   ';
      const rawEmail = '   CaseInsensitive.User+' + Date.now() + '@Example.COM   ';
      const expectedNormalizedEmail = rawEmail.trim().toLowerCase();

      // Token with missing name (empty string)
      const normToken = await createSignedGoogleToken({
        sub: rawSub,
        email: rawEmail,
        name: '   ',
        picture: '  https://example.com/norm.png  ',
      });

      const normReq = new Request('https://api.eventgamestudio.com/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: normToken }),
      });
      const normRes = await worker.fetch(normReq, workerEnv);
      const normBody: any = await normRes.json();

      report(normRes.status === 200, 'Test D: Normalization request succeeded');
      report(normBody.user.email === expectedNormalizedEmail, 'Test D: Email normalized to lowercase and trimmed');
      report(
        normBody.user.name && normBody.user.name.length > 0,
        'Test D: Missing name fell back to safe non-empty name'
      );

      // Verify query by clean sub and lowercased email
      const bySub = await getUserByGoogleId('google-sub-norm-padded-123', workerEnv);
      report(Boolean(bySub), 'Test D: User queryable by trimmed google_id');
      const byEmail = await getUserByEmail(expectedNormalizedEmail, workerEnv);
      report(Boolean(byEmail), 'Test D: User queryable by trimmed lowercased email');
    }

    // --------------------------------------------------------------------------
    // Test E: Concurrent first-time registration requests succeed without error or duplicate users
    // --------------------------------------------------------------------------
    {
      const concurrentSub = 'google-sub-concurrent-' + Date.now();
      const concurrentEmail = `concurrent-${Date.now()}@example.com`;

      const concurrentToken = await createSignedGoogleToken({
        sub: concurrentSub,
        email: concurrentEmail,
        name: 'Concurrent Registrant',
        picture: 'https://example.com/concurrent.png',
      });

      // Fire 5 concurrent requests simultaneously for the brand new user
      const promises = Array.from({ length: 5 }, (_, i) => {
        const req = new Request('https://api.eventgamestudio.com/api/auth/google', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-correlation-id': `concurrent-test-${i}-${Date.now()}`,
          },
          body: JSON.stringify({ idToken: concurrentToken }),
        });
        return worker.fetch(req, workerEnv);
      });

      const responses = await Promise.all(promises);
      const results = await Promise.all(responses.map((r) => r.json() as Promise<any>));

      const allOk = responses.every((r) => r.status === 200);
      report(allOk, 'Test E: All 5 concurrent registration requests returned HTTP 200');

      const userIds = new Set(results.map((r) => r.user.id));
      report(userIds.size === 1, 'Test E: All 5 concurrent requests resolved to the EXACT same user ID');

      const tokens = results.map((r) => r.token);
      report(tokens.every(Boolean), 'Test E: Every concurrent response received a valid app token');
    }

    // --------------------------------------------------------------------------
    // Test F: Database failure / transient error handling returns generic 401 without leaking internals
    // --------------------------------------------------------------------------
    {
      resetRateLimitStores();
      // Simulate database error environment in production
      const errorEnv: Record<string, any> = {
        JWT_SECRET,
        GOOGLE_CLIENT_ID: TEST_CLIENT_ID,
        NODE_ENV: 'production',
        SUPABASE_URL: 'https://test-error.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'test-error-key',
      };

      const failToken = await createSignedGoogleToken({
        sub: 'google-sub-db-fail-' + Date.now(),
        email: `dbfail-${Date.now()}@example.com`,
      });

      const correlationId = 'test-db-fail-' + crypto.randomUUID();
      const req = new Request('https://api.eventgamestudio.com/api/auth/google', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-correlation-id': correlationId,
          'x-test-bypass-rate-limit': 'true',
        },
        body: JSON.stringify({ idToken: failToken }),
      });

      const res = await worker.fetch(req, errorEnv);
      report(res.status === 401, 'Test F: Database error returns HTTP 401 Unauthorized');
      report(res.headers.get('x-correlation-id') === correlationId, 'Test F: Correlation ID preserved in header');

      const body: any = await res.json();
      report(
        body.error === 'Google authentication failed',
        'Test F: Generic error message returned to client'
      );
    }

    // --------------------------------------------------------------------------
    // Test G: Error leak prevention: confirm client never sees SQL, Postgres, schema, stack trace
    // --------------------------------------------------------------------------
    {
      const invalidToken = 'invalid.bearer.token';
      const correlationId = 'test-leak-check-' + crypto.randomUUID();

      const req = new Request('https://api.eventgamestudio.com/api/auth/google', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-correlation-id': correlationId,
        },
        body: JSON.stringify({ idToken: invalidToken }),
      });

      const res = await worker.fetch(req, workerEnv);
      const text = await res.text();

      report(
        !text.includes('SELECT') &&
          !text.includes('INSERT') &&
          !text.includes('UPDATE') &&
          !text.includes('users') &&
          !text.includes('public.') &&
          !text.includes('Postgres') &&
          !text.includes('Supabase') &&
          !text.includes('stack') &&
          !text.includes('jsonwebtoken') &&
          !text.includes('jose'),
        'Test G: Error response strictly sanitized with zero SQL/schema/crypto leaks'
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log('\n======================================================');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('======================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
