/**
 * Automated Test Suite for Google ID Token Local JWT & JWKS Verification
 *
 * Verifies:
 * 1. Valid token: authenticates successfully and extracts identity claims
 * 2. Valid token: accepts alternative valid Google issuer "accounts.google.com"
 * 3. Invalid signature: rejects token signed with an untrusted private key
 * 4. Wrong audience: rejects token issued for a different client ID
 * 5. Wrong issuer: rejects token issued by an unauthorized issuer
 * 6. Expired token: rejects token whose expiration timestamp has passed
 * 7. Missing or invalid claims: rejects token without email or unverified email
 * 8. Algorithm restriction: strictly rejects "none" and non-RS256 algorithms
 * 9. TokenInfo endpoint: confirms tokeninfo is NEVER called during normal verification
 * 10. JWKS Caching: reuses cached keys without refetching JWKS endpoint on subsequent logins
 * 11. Unknown key ID: refreshes JWKS on unknown kid and succeeds if key was rotated in
 * 12. Unknown key ID: refreshes once and rejects if kid remains unavailable
 * 13. Cache-Control parser: extracts max-age accurately
 * 14. Development mock tokens: work in dev mode when ALLOW_MOCK_AUTH is set
 * 15. Development mock tokens: strictly rejected in production
 * 16. Attack prevention: rate limits outbound JWKS refreshes during rapid burst of unknown kid tokens
 */

import * as jose from 'jose';
import {
  verifyGoogleIdToken,
  clearGoogleJwksCache,
  getGoogleJwksCacheStats,
  parseCacheControlMaxAge,
} from './auth.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ ${testName}${detail ? ` -> ${detail}` : ''}`);
    failed++;
  }
}

async function runGoogleJwtTests() {
  console.log('\n======================================================');
  console.log('Running Google ID Token Local JWT / JWKS Verification Tests');
  console.log('======================================================\n');

  const TEST_CLIENT_ID = 'test-client-12345.apps.googleusercontent.com';
  const OTHER_CLIENT_ID = 'different-app-67890.apps.googleusercontent.com';

  const originalFetch = globalThis.fetch;

  // Generate test RSA keypairs
  const keyPair1 = await jose.generateKeyPair('RS256');
  const keyPair2 = await jose.generateKeyPair('RS256');

  const jwk1 = await jose.exportJWK(keyPair1.publicKey);
  jwk1.kid = 'key-id-1';
  jwk1.alg = 'RS256';
  jwk1.use = 'sig';

  const jwk2 = await jose.exportJWK(keyPair2.publicKey);
  jwk2.kid = 'key-id-2';
  jwk2.alg = 'RS256';
  jwk2.use = 'sig';

  async function createTestToken(
    privateKey: any,
    headerOverrides: Partial<jose.JWTHeaderParameters> = {},
    payloadOverrides: Record<string, any> = {}
  ): Promise<string> {
    const header: jose.JWTHeaderParameters = {
      alg: 'RS256',
      kid: 'key-id-1',
      ...headerOverrides,
    };

    const payload = {
      sub: 'google-user-sub-1001',
      email: 'alex@example.com',
      email_verified: true,
      name: 'Alex Rivera',
      picture: 'https://example.com/avatar.png',
      iss: 'https://accounts.google.com',
      aud: TEST_CLIENT_ID,
      ...payloadOverrides,
    };

    const jwt = new jose.SignJWT(payload)
      .setProtectedHeader(header)
      .setIssuedAt()
      .setExpirationTime(payloadOverrides.exp ?? '1h');

    return jwt.sign(privateKey);
  }

  // 1. Valid token
  try {
    clearGoogleJwksCache();
    const token = await createTestToken(keyPair1.privateKey);
    const user = await verifyGoogleIdToken(
      token,
      { GOOGLE_CLIENT_ID: TEST_CLIENT_ID },
      { customJwks: { keys: [jwk1] } }
    );
    assert(
      user.sub === 'google-user-sub-1001' &&
      user.email === 'alex@example.com' &&
      user.name === 'Alex Rivera' &&
      user.picture === 'https://example.com/avatar.png' &&
      user.email_verified === true,
      '1. Valid token: authenticates successfully and extracts identity claims'
    );
  } catch (err: any) {
    assert(false, '1. Valid token: authenticates successfully and extracts identity claims', err.message);
  }

  // 2. Valid token with accounts.google.com issuer
  try {
    clearGoogleJwksCache();
    const token = await createTestToken(keyPair1.privateKey, {}, { iss: 'accounts.google.com' });
    const user = await verifyGoogleIdToken(
      token,
      { GOOGLE_CLIENT_ID: TEST_CLIENT_ID },
      { customJwks: { keys: [jwk1] } }
    );
    assert(
      user.email === 'alex@example.com',
      '2. Valid token: accepts alternative valid Google issuer "accounts.google.com"'
    );
  } catch (err: any) {
    assert(false, '2. Valid token: accepts alternative valid Google issuer "accounts.google.com"', err.message);
  }

  // 3. Invalid signature
  try {
    clearGoogleJwksCache();
    const token = await createTestToken(keyPair2.privateKey, { kid: 'key-id-1' });
    let rejected = false;
    try {
      await verifyGoogleIdToken(
        token,
        { GOOGLE_CLIENT_ID: TEST_CLIENT_ID },
        { customJwks: { keys: [jwk1] } }
      );
    } catch {
      rejected = true;
    }
    assert(rejected, '3. Invalid signature: rejects token signed with an untrusted private key');
  } catch (err: any) {
    assert(false, '3. Invalid signature: rejects token signed with an untrusted private key', err.message);
  }

  // 4. Wrong audience
  try {
    clearGoogleJwksCache();
    const token = await createTestToken(keyPair1.privateKey, {}, { aud: OTHER_CLIENT_ID });
    let rejected = false;
    try {
      await verifyGoogleIdToken(
        token,
        { GOOGLE_CLIENT_ID: TEST_CLIENT_ID },
        { customJwks: { keys: [jwk1] } }
      );
    } catch {
      rejected = true;
    }
    assert(rejected, '4. Wrong audience: rejects token issued for a different client ID');
  } catch (err: any) {
    assert(false, '4. Wrong audience: rejects token issued for a different client ID', err.message);
  }

  // 5. Wrong issuer
  try {
    clearGoogleJwksCache();
    const token = await createTestToken(keyPair1.privateKey, {}, { iss: 'https://attacker.example.com' });
    let rejected = false;
    try {
      await verifyGoogleIdToken(
        token,
        { GOOGLE_CLIENT_ID: TEST_CLIENT_ID },
        { customJwks: { keys: [jwk1] } }
      );
    } catch {
      rejected = true;
    }
    assert(rejected, '5. Wrong issuer: rejects token issued by an unauthorized issuer');
  } catch (err: any) {
    assert(false, '5. Wrong issuer: rejects token issued by an unauthorized issuer', err.message);
  }

  // 6. Expired token
  try {
    clearGoogleJwksCache();
    const pastTimestamp = Math.floor(Date.now() / 1000) - 300;
    const token = await new jose.SignJWT({
      sub: 'user-expired',
      email: 'expired@example.com',
      email_verified: true,
      iss: 'https://accounts.google.com',
      aud: TEST_CLIENT_ID,
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'key-id-1' })
      .setIssuedAt(pastTimestamp - 3600)
      .setExpirationTime(pastTimestamp)
      .sign(keyPair1.privateKey);

    let rejected = false;
    try {
      await verifyGoogleIdToken(
        token,
        { GOOGLE_CLIENT_ID: TEST_CLIENT_ID },
        { customJwks: { keys: [jwk1] } }
      );
    } catch {
      rejected = true;
    }
    assert(rejected, '6. Expired token: rejects token whose expiration timestamp has passed');
  } catch (err: any) {
    assert(false, '6. Expired token: rejects token whose expiration timestamp has passed', err.message);
  }

  // 7. Missing or invalid claims
  try {
    clearGoogleJwksCache();
    const tokenNoEmail = await createTestToken(keyPair1.privateKey, {}, { email: undefined });
    let rejected1 = false;
    try {
      await verifyGoogleIdToken(
        tokenNoEmail,
        { GOOGLE_CLIENT_ID: TEST_CLIENT_ID },
        { customJwks: { keys: [jwk1] } }
      );
    } catch {
      rejected1 = true;
    }

    const tokenUnverified = await createTestToken(keyPair1.privateKey, {}, { email_verified: false });
    let rejected2 = false;
    try {
      await verifyGoogleIdToken(
        tokenUnverified,
        { GOOGLE_CLIENT_ID: TEST_CLIENT_ID },
        { customJwks: { keys: [jwk1] } }
      );
    } catch {
      rejected2 = true;
    }

    assert(
      rejected1 && rejected2,
      '7. Missing or invalid claims: rejects token without email or unverified email'
    );
  } catch (err: any) {
    assert(false, '7. Missing or invalid claims: rejects token without email or unverified email', err.message);
  }

  // 8. Algorithm restriction: strictly rejects "none" and non-RS256 algorithms
  try {
    clearGoogleJwksCache();
    const unsignedToken =
      'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiIxMjM0NSIsImVtYWlsIjoidEBleC5jb20iLCJpc3MiOiJodHRwczovL2FjY291bnRzLmdvb2dsZS5jb20ifQ.';
    let rejected = false;
    try {
      await verifyGoogleIdToken(
        unsignedToken,
        { GOOGLE_CLIENT_ID: TEST_CLIENT_ID },
        { customJwks: { keys: [jwk1] } }
      );
    } catch {
      rejected = true;
    }
    assert(rejected, '8. Algorithm restriction: strictly rejects "none" and non-RS256 algorithms');
  } catch (err: any) {
    assert(false, '8. Algorithm restriction: strictly rejects "none" and non-RS256 algorithms', err.message);
  }

  // 9. TokenInfo endpoint: confirms tokeninfo is NEVER called during normal verification
  try {
    clearGoogleJwksCache();
    const requestedUrls: string[] = [];
    globalThis.fetch = (async (input: any) => {
      const url = typeof input === 'string' ? input : input.url;
      requestedUrls.push(url);
      if (url.includes('tokeninfo')) {
        throw new Error('FAIL: tokeninfo was called!');
      }
      if (url.includes('/certs')) {
        return new Response(JSON.stringify({ keys: [jwk1] }), {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'cache-control': 'public, max-age=18000',
          },
        });
      }
      return new Response('Not found', { status: 404 });
    }) as any;

    const token = await createTestToken(keyPair1.privateKey);
    const user = await verifyGoogleIdToken(
      token,
      { GOOGLE_CLIENT_ID: TEST_CLIENT_ID },
      { jwksUrl: 'https://www.googleapis.com/oauth2/v3/certs' }
    );

    const tokenInfoCalled = requestedUrls.some((u) => u.includes('tokeninfo'));
    assert(
      user.email === 'alex@example.com' && !tokenInfoCalled,
      '9. TokenInfo endpoint: confirms tokeninfo is NEVER called during normal verification'
    );
  } catch (err: any) {
    assert(false, '9. TokenInfo endpoint: confirms tokeninfo is NEVER called during normal verification', err.message);
  } finally {
    globalThis.fetch = originalFetch;
  }

  // 10. JWKS Caching: reuses cached keys without refetching JWKS endpoint on subsequent logins
  try {
    clearGoogleJwksCache();
    let jwksFetchCount = 0;
    globalThis.fetch = (async (input: any) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.includes('/certs')) {
        jwksFetchCount++;
        return new Response(JSON.stringify({ keys: [jwk1] }), {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'cache-control': 'public, max-age=18000',
          },
        });
      }
      return new Response('Not found', { status: 404 });
    }) as any;

    const token1 = await createTestToken(keyPair1.privateKey, {}, { sub: 'user-1' });
    const token2 = await createTestToken(keyPair1.privateKey, {}, { sub: 'user-2' });

    const user1 = await verifyGoogleIdToken(
      token1,
      { GOOGLE_CLIENT_ID: TEST_CLIENT_ID },
      { jwksUrl: 'https://www.googleapis.com/oauth2/v3/certs' }
    );
    const user2 = await verifyGoogleIdToken(
      token2,
      { GOOGLE_CLIENT_ID: TEST_CLIENT_ID },
      { jwksUrl: 'https://www.googleapis.com/oauth2/v3/certs' }
    );

    const stats = getGoogleJwksCacheStats();
    assert(
      user1.sub === 'user-1' &&
      user2.sub === 'user-2' &&
      jwksFetchCount === 1 &&
      stats.hasCache &&
      stats.keyCount === 1,
      '10. JWKS Caching: reuses cached keys without refetching JWKS endpoint on subsequent logins'
    );
  } catch (err: any) {
    assert(false, '10. JWKS Caching: reuses cached keys without refetching JWKS endpoint on subsequent logins', err.message);
  } finally {
    globalThis.fetch = originalFetch;
  }

  // 11. Unknown key ID: refreshes JWKS on unknown kid and succeeds if key was rotated in
  try {
    clearGoogleJwksCache();
    let fetchCount = 0;
    globalThis.fetch = (async () => {
      fetchCount++;
      const keys = fetchCount === 1 ? [jwk1] : [jwk1, jwk2];
      return new Response(JSON.stringify({ keys }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'cache-control': 'public, max-age=18000',
        },
      });
    }) as any;

    const token1 = await createTestToken(keyPair1.privateKey);
    await verifyGoogleIdToken(
      token1,
      { GOOGLE_CLIENT_ID: TEST_CLIENT_ID },
      { jwksUrl: 'https://www.googleapis.com/oauth2/v3/certs' }
    );

    const token2 = await createTestToken(keyPair2.privateKey, { kid: 'key-id-2' });
    const user2 = await verifyGoogleIdToken(
      token2,
      { GOOGLE_CLIENT_ID: TEST_CLIENT_ID },
      { jwksUrl: 'https://www.googleapis.com/oauth2/v3/certs' }
    );

    assert(
      user2.email === 'alex@example.com' && fetchCount === 2,
      '11. Unknown key ID: refreshes JWKS on unknown kid and succeeds if key was rotated in'
    );
  } catch (err: any) {
    assert(false, '11. Unknown key ID: refreshes JWKS on unknown kid and succeeds if key was rotated in', err.message);
  } finally {
    globalThis.fetch = originalFetch;
  }

  // 12. Unknown key ID: refreshes once and rejects if kid remains unavailable
  try {
    clearGoogleJwksCache();
    let fetchCount = 0;
    globalThis.fetch = (async () => {
      fetchCount++;
      return new Response(JSON.stringify({ keys: [jwk1] }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'cache-control': 'public, max-age=18000',
        },
      });
    }) as any;

    const tokenUnknownKid = await createTestToken(keyPair1.privateKey, { kid: 'non-existent-kid' });
    let rejected = false;
    try {
      await verifyGoogleIdToken(
        tokenUnknownKid,
        { GOOGLE_CLIENT_ID: TEST_CLIENT_ID },
        { jwksUrl: 'https://www.googleapis.com/oauth2/v3/certs' }
      );
    } catch {
      rejected = true;
    }

    assert(
      rejected && fetchCount === 2,
      '12. Unknown key ID: refreshes once and rejects if kid remains unavailable'
    );
  } catch (err: any) {
    assert(false, '12. Unknown key ID: refreshes once and rejects if kid remains unavailable', err.message);
  } finally {
    globalThis.fetch = originalFetch;
  }

  // 13. Cache-Control parser
  try {
    const r1 = parseCacheControlMaxAge('public, max-age=18088, must-revalidate') === 18088;
    const r2 = parseCacheControlMaxAge('max-age=3600') === 3600;
    const r3 = parseCacheControlMaxAge('no-cache, no-store') === null;
    const r4 = parseCacheControlMaxAge(null) === null;
    assert(r1 && r2 && r3 && r4, '13. Cache-Control parser: extracts max-age accurately');
  } catch (err: any) {
    assert(false, '13. Cache-Control parser: extracts max-age accurately', err.message);
  }

  // 14. Development mock tokens in dev mode
  try {
    const mockUser = await verifyGoogleIdToken('mock_google_id_token_developer', {
      NODE_ENV: 'development',
      ALLOW_MOCK_AUTH: 'true',
    });
    assert(
      mockUser.email === 'developer@example.com' &&
      mockUser.name === 'Developer User' &&
      mockUser.email_verified === true,
      '14. Development mock tokens: work in dev mode when ALLOW_MOCK_AUTH is set'
    );
  } catch (err: any) {
    assert(false, '14. Development mock tokens: work in dev mode when ALLOW_MOCK_AUTH is set', err.message);
  }

  // 15. Development mock tokens rejected in production
  try {
    let rejected = false;
    try {
      await verifyGoogleIdToken('mock_google_id_token_developer', {
        NODE_ENV: 'production',
        ALLOW_MOCK_AUTH: 'true',
      });
    } catch {
      rejected = true;
    }
    assert(rejected, '15. Development mock tokens: strictly rejected in production');
  } catch (err: any) {
    assert(false, '15. Development mock tokens: strictly rejected in production', err.message);
  }

  // 16. Attack prevention: rate limits outbound JWKS refreshes during rapid burst of unknown kid tokens
  try {
    clearGoogleJwksCache();
    let networkFetchCount = 0;
    globalThis.fetch = (async () => {
      networkFetchCount++;
      return new Response(JSON.stringify({ keys: [jwk1] }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'cache-control': 'public, max-age=18000',
        },
      });
    }) as any;

    // Populate initial cache
    const validToken = await createTestToken(keyPair1.privateKey);
    await verifyGoogleIdToken(validToken, { GOOGLE_CLIENT_ID: TEST_CLIENT_ID });
    assert(networkFetchCount === 1, '16. Initial cache populates with 1 fetch');

    // Attacker fires 5 rapid requests with 5 different random unknown kids
    for (let i = 0; i < 5; i++) {
      const attackerToken = await createTestToken(keyPair1.privateKey, { kid: `attacker-kid-${i}` });
      let attackerRejected = false;
      try {
        await verifyGoogleIdToken(attackerToken, { GOOGLE_CLIENT_ID: TEST_CLIENT_ID });
      } catch {
        attackerRejected = true;
      }
      assert(attackerRejected, `16. Attacker token ${i} rejected`);
    }

    // Only 1 additional refresh attempt should have been made to Google; the other 4 were blocked by cooldown!
    assert(
      networkFetchCount === 2,
      '16. Attack prevention: rate limits outbound JWKS refreshes during rapid burst of unknown kid tokens',
      `Expected networkFetchCount === 2, got ${networkFetchCount}`
    );
  } catch (err: any) {
    assert(false, '16. Attack prevention: rate limits outbound JWKS refreshes during rapid burst of unknown kid tokens', err.message);
  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log('\n======================================================');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runGoogleJwtTests().catch((err) => {
  console.error('Fatal test suite error:', err);
  process.exit(1);
});
