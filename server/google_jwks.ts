import * as jose from 'jose';

export const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

export interface GoogleIdTokenClaims {
  sub: string;
  email: string;
  name: string;
  picture?: string;
  email_verified: boolean;
}

export interface VerifyGoogleTokenOptions {
  jwksUrl?: string;
  customJwks?: { keys: jose.JWK[] };
  expectedClientId?: string;
  clockToleranceSeconds?: number;
  minRefreshIntervalMs?: number;
}

interface CacheEntry {
  keys: jose.JWK[];
  keySet: ReturnType<typeof jose.createLocalJWKSet>;
  expiresAt: number;
  cachedAt: number;
}

let inMemoryJwksCache: CacheEntry | null = null;
let lastForcedRefreshTimestamp = 0;
let inflightFetchPromise: Promise<CacheEntry> | null = null;

// Default cooldown period (1 second) between forced refresh requests to Google's JWKS endpoint.
// Protects against outbound request flooding / denial of service during invalid-token attacks.
export const DEFAULT_MIN_REFRESH_INTERVAL_MS = 1000;

/**
 * Parses max-age from Cache-Control header, e.g. "public, max-age=18088, must-revalidate"
 */
export function parseCacheControlMaxAge(header: string | null): number | null {
  if (!header) return null;
  const match = header.match(/max-age\s*=\s*(\d+)/i);
  if (match && match[1]) {
    const seconds = parseInt(match[1], 10);
    if (!isNaN(seconds) && seconds > 0) {
      return seconds;
    }
  }
  return null;
}

/**
 * Resets the in-memory JWKS cache (used for test isolation).
 */
export function clearGoogleJwksCache(): void {
  inMemoryJwksCache = null;
  lastForcedRefreshTimestamp = 0;
  inflightFetchPromise = null;
}

/**
 * Returns cache diagnostics (used for testing and telemetry).
 */
export function getGoogleJwksCacheStats(): {
  hasCache: boolean;
  keyCount: number;
  expiresAt: number;
  cachedAt: number;
  lastRefreshTime: number;
} {
  return {
    hasCache: inMemoryJwksCache !== null,
    keyCount: inMemoryJwksCache?.keys.length || 0,
    expiresAt: inMemoryJwksCache?.expiresAt || 0,
    cachedAt: inMemoryJwksCache?.cachedAt || 0,
    lastRefreshTime: lastForcedRefreshTimestamp,
  };
}

/**
 * Retrieves the Google JWKS keys and local key resolver, using in-memory caching
 * with automatic expiration based on Google's Cache-Control header.
 */
export async function getGoogleJWKS(
  env?: Record<string, any>,
  options?: VerifyGoogleTokenOptions,
  forceRefresh: boolean = false
): Promise<CacheEntry> {
  // If custom JWKS is explicitly injected (e.g. in tests)
  if (options?.customJwks) {
    return {
      keys: options.customJwks.keys,
      keySet: jose.createLocalJWKSet(options.customJwks),
      expiresAt: Number.MAX_SAFE_INTEGER,
      cachedAt: Date.now(),
    };
  }

  const now = Date.now();
  const jwksUrl =
    options?.jwksUrl ||
    env?.GOOGLE_JWKS_URL ||
    (typeof process !== 'undefined' ? process.env.GOOGLE_JWKS_URL : undefined) ||
    GOOGLE_JWKS_URL;

  // 1. Check local cache validity
  if (!forceRefresh && inMemoryJwksCache && now < inMemoryJwksCache.expiresAt) {
    return inMemoryJwksCache;
  }

  // 2. Rate-limiting guard on forced refreshes (e.g. unknown kid attacks)
  const minInterval = options?.minRefreshIntervalMs ?? DEFAULT_MIN_REFRESH_INTERVAL_MS;
  if (forceRefresh && inMemoryJwksCache && now - lastForcedRefreshTimestamp < minInterval) {
    return inMemoryJwksCache;
  }

  // 3. Deduplicate in-flight network requests
  if (inflightFetchPromise) {
    return inflightFetchPromise;
  }

  inflightFetchPromise = (async () => {
    try {
      if (forceRefresh) {
        lastForcedRefreshTimestamp = Date.now();
      }

      const response = await fetch(jwksUrl, {
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch Google JWKS from ${jwksUrl}: HTTP ${response.status}`);
      }

      const cacheControl = response.headers.get('cache-control');
      const maxAge = parseCacheControlMaxAge(cacheControl);
      // Google typical max-age is 18000-22000 seconds (5-6 hours).
      // Fallback to 1 hour (3600s), clamp between 60s and 86400s.
      const ttlSeconds = Math.max(60, Math.min(86400, maxAge ?? 3600));

      const data = (await response.json()) as { keys?: jose.JWK[] };
      if (!data || !Array.isArray(data.keys) || data.keys.length === 0) {
        throw new Error('Google JWKS endpoint returned empty or invalid keys array');
      }

      const entry: CacheEntry = {
        keys: data.keys,
        keySet: jose.createLocalJWKSet({ keys: data.keys }),
        expiresAt: Date.now() + ttlSeconds * 1000,
        cachedAt: Date.now(),
      };

      inMemoryJwksCache = entry;
      return entry;
    } catch (err) {
      // If network fetch fails but we have stale cache, use it as fallback
      if (inMemoryJwksCache) {
        console.warn('[AUTH] Google JWKS network fetch failed, using cached keys as fallback:', err);
        return inMemoryJwksCache;
      }
      throw err;
    } finally {
      inflightFetchPromise = null;
    }
  })();

  return inflightFetchPromise;
}

/**
 * Verifies a Google ID token locally using Google's published JWKS.
 *
 * Checks performed:
 * 1. JWT structure
 * 2. Algorithm restriction (RS256 only; rejects 'none' or symmetric algs)
 * 3. Key lookup by header kid, with single on-demand refresh for unknown keys
 * 4. Cryptographic signature verification using Google's public key
 * 5. Issuer claim ('https://accounts.google.com' or 'accounts.google.com')
 * 6. Audience claim (matches configured Google OAuth Client ID)
 * 7. Expiration (exp) and issued-at (iat) timestamps
 * 8. Required identity claims (sub, email, email_verified)
 */
export async function verifyGoogleJwt(
  idToken: string,
  env?: Record<string, any>,
  options?: VerifyGoogleTokenOptions
): Promise<GoogleIdTokenClaims> {
  if (!idToken || typeof idToken !== 'string') {
    throw new Error('Invalid Google ID token: Token must be a non-empty string');
  }

  // 1. Structure validation
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid Google ID token: Malformed JWT structure');
  }

  // 2. Decode protected header
  let header: jose.ProtectedHeaderParameters;
  try {
    header = jose.decodeProtectedHeader(idToken);
  } catch (err: any) {
    throw new Error('Invalid Google ID token header: ' + (err?.message || 'Failed to decode header'));
  }

  // 3. Strict algorithm restriction: ONLY RS256 is accepted
  if (header.alg !== 'RS256') {
    throw new Error(`Invalid Google ID token algorithm: "${header.alg}". Only "RS256" is allowed.`);
  }

  if (!header.kid || typeof header.kid !== 'string') {
    throw new Error('Invalid Google ID token: Missing or invalid key identifier ("kid")');
  }

  const targetKid = header.kid;

  // 4. Retrieve cached JWKS
  let { keys, keySet } = await getGoogleJWKS(env, options, false);
  let keyExists = keys.some((k) => k.kid === targetKid);

  // If kid is not found in cache, refresh the JWKS once and retry
  if (!keyExists) {
    const refreshed = await getGoogleJWKS(env, options, true);
    keys = refreshed.keys;
    keySet = refreshed.keySet;
    keyExists = keys.some((k) => k.kid === targetKid);

    if (!keyExists) {
      throw new Error(`Unknown Google signing key identifier: "${targetKid}"`);
    }
  }

  // 5. Determine expected audience (Google OAuth Client ID)
  const procEnv = typeof process !== 'undefined' ? process.env : {};
  const isProduction =
    env?.NODE_ENV === 'production' ||
    procEnv.NODE_ENV === 'production';

  const expectedClientId =
    options?.expectedClientId ||
    env?.VITE_GOOGLE_CLIENT_ID ||
    env?.GOOGLE_CLIENT_ID ||
    procEnv.VITE_GOOGLE_CLIENT_ID ||
    procEnv.GOOGLE_CLIENT_ID;

  if (isProduction && !expectedClientId) {
    throw new Error('Server configuration error: GOOGLE_CLIENT_ID or VITE_GOOGLE_CLIENT_ID is required in production');
  }

  // 6. Cryptographic signature and claim verification
  const verifyOptions: jose.JWTVerifyOptions = {
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    algorithms: ['RS256'],
    clockTolerance: options?.clockToleranceSeconds ?? 5,
  };

  if (expectedClientId) {
    verifyOptions.audience = expectedClientId;
  }

  const { payload } = await jose.jwtVerify(idToken, keySet, verifyOptions);

  // 7. Validate identity claims
  if (!payload.sub || typeof payload.sub !== 'string') {
    throw new Error('Google ID token is missing required "sub" claim');
  }

  if (!payload.email || typeof payload.email !== 'string') {
    throw new Error('Google ID token is missing required "email" claim');
  }

  const isEmailVerified = payload.email_verified === true || payload.email_verified === 'true';
  if (!isEmailVerified) {
    throw new Error('Google account email is not verified');
  }

  return {
    sub: payload.sub,
    email: payload.email,
    name: (payload.name as string) || (payload.email as string).split('@')[0],
    picture: typeof payload.picture === 'string' ? payload.picture : undefined,
    email_verified: true,
  };
}
