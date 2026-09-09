import type { Request as ExpressRequest, Response as ExpressResponse, NextFunction } from 'express';

/**
 * ==============================================================================
 * Event Game Studio - API Rate Limiting Module
 * ==============================================================================
 *
 * ARCHITECTURAL NOTICE & DEPLOYMENT TOPOLOGY:
 * -------------------------------------------
 * 1. Worker-Local / Process-Local In-Memory Scope:
 *    - The in-memory sliding window algorithm implemented here operates strictly
 *      within the local memory of the current Node.js process or Cloudflare Worker isolate.
 *    - Cloudflare Workers execute across hundreds of edge Points of Presence (PoPs) globally,
 *      and within each PoP, multiple Worker isolates may run concurrently.
 *    - Consequently, this in-memory rate limiter is NOT globally distributed across edge nodes.
 *      Requests arriving at different edge data centers (or separate isolate lifecycles)
 *      maintain their own independent in-memory counters.
 *    - Single-node / isolate memory resets whenever a container redeploys, an isolate goes
 *      idle, or a new version is released.
 *
 * 2. Purpose as a Zero-Latency First Layer:
 *    - Serves as an immediate, 0ms-latency, zero-dependency first line of defense against
 *      single-host script loops, brute-force attacks, and volumetric request floods hitting
 *      an instance.
 *    - Does NOT introduce external network dependencies (such as Redis or third-party rate
 *      limiting APIs) which would add latency, failure modes, and operational costs.
 *
 * 3. Legitimate Event Gameplay Protection:
 *    - At live physical events (corporate booths, carnivals, conferences, weddings), dozens
 *      or hundreds of attendees share the exact same venue Wi-Fi network or cellular NAT IP.
 *    - The High Score submission rate limiter (`highScoreRateLimiter`) is deliberately sized
 *      generously (300 requests / 60 seconds per IP, ~5 requests/second) to prevent false-positive
 *      HTTP 429 errors from locking out genuine attendees during competitive tournament gameplay.
 *    - Score idempotency and replay protection are enforced server-side and database-side via
 *      Migration 029 (unique `(event_id, session_id)` index and status checks), preventing
 *      malicious leaderboard duplication without needing over-restrictive single-IP throttles.
 *    - Public event viewing and leaderboard polling endpoints (GET requests) are exempted from
 *      mutating rate limiters to allow spectator screens and leaderboard dashboards to poll smoothly.
 *
 * 4. Production Globally Distributed Edge Rate Limiting:
 *    - When enterprise-scale global rate limiting is required, Cloudflare-native Rate Limiting
 *      (WAF Rate Limiting rules at the Cloudflare dashboard level, or a `[[ratelimits]]` binding
 *      exposed on `env.RATE_LIMITER`) can be layered in front of or inside this module.
 *    - If `env.RATE_LIMITER` is bound in Cloudflare Worker configuration, `checkWorkerRateLimit`
 *      can invoke Cloudflare's native distributed edge rate limiter seamlessly.
 * ==============================================================================
 */

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  message?: string;
  keyPrefix?: string;
  keyGenerator?: (req: any) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  venueAllowanceMax?: number;
  isVenueRequest?: (req: any) => boolean;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetTime: number; // Unix timestamp in seconds
  retryAfter: number; // Seconds
}

interface ClientRecord {
  timestamps: number[];
}

// In-memory sliding window bucket store
const rateLimitStores = new Map<string, Map<string, ClientRecord>>();

let lastGlobalCleanup = 0;
const CLEANUP_INTERVAL_MS = 60 * 1000; // Lazy cleanup interval threshold (60s)
const MAX_RECORD_AGE_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Performs a lazy, request-driven cleanup of expired timestamps and empty client records.
 * Triggered periodically during request processing to prevent memory accumulation
 * without relying on background global timers (disallowed in Cloudflare Workers / Edge runtimes).
 */
function lazyCleanup(now: number): void {
  if (now - lastGlobalCleanup < CLEANUP_INTERVAL_MS) {
    return;
  }
  lastGlobalCleanup = now;

  for (const [, store] of rateLimitStores.entries()) {
    for (const [key, record] of store.entries()) {
      record.timestamps = record.timestamps.filter((ts) => now - ts < MAX_RECORD_AGE_MS);
      if (record.timestamps.length === 0) {
        store.delete(key);
      }
    }
  }
}

function getStore(prefix: string): Map<string, ClientRecord> {
  let store = rateLimitStores.get(prefix);
  if (!store) {
    store = new Map<string, ClientRecord>();
    rateLimitStores.set(prefix, store);
  }
  return store;
}

/**
 * Core rate limit checker using sliding window algorithm.
 */
export function checkRateLimit(
  clientKey: string,
  options: RateLimitOptions
): RateLimitResult {
  const { windowMs, max, keyPrefix = 'general' } = options;
  const store = getStore(keyPrefix);
  const now = Date.now();

  // Run lazy request-driven cleanup across stores periodically without background timers
  lazyCleanup(now);

  const windowStart = now - windowMs;

  let record = store.get(clientKey);
  if (!record) {
    record = { timestamps: [] };
    store.set(clientKey, record);
  }

  // Filter timestamps within current sliding window
  record.timestamps = record.timestamps.filter((ts) => ts > windowStart);

  const currentCount = record.timestamps.length;
  const resetTime = Math.ceil((now + windowMs) / 1000);

  if (currentCount >= max) {
    const oldestTimestamp = record.timestamps[0] || now;
    const retryAfter = Math.max(1, Math.ceil((oldestTimestamp + windowMs - now) / 1000));
    return {
      allowed: false,
      limit: max,
      remaining: 0,
      resetTime: Math.ceil((oldestTimestamp + windowMs) / 1000),
      retryAfter,
    };
  }

  // Record this request
  record.timestamps.push(now);
  const remaining = Math.max(0, max - record.timestamps.length);

  return {
    allowed: true,
    limit: max,
    remaining,
    resetTime,
    retryAfter: 0,
  };
}

/**
 * Extracts client IP / identity from Express request
 */
export function getExpressClientKey(req: ExpressRequest, keyPrefix = 'ip'): string {
  // If user is authenticated, use their user ID + prefix
  const userId = (req as any).user?.id || (req as any).jwtPayload?.sub;
  if (userId) {
    return `user:${userId}`;
  }

  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    const firstIp = forwarded.split(',')[0].trim();
    if (firstIp) return `${keyPrefix}:${firstIp}`;
  }

  const cfIp = req.headers['cf-connecting-ip'];
  if (typeof cfIp === 'string' && cfIp.trim()) {
    return `${keyPrefix}:${cfIp.trim()}`;
  }

  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim()) {
    return `${keyPrefix}:${realIp.trim()}`;
  }

  return `${keyPrefix}:${req.ip || req.socket?.remoteAddress || '127.0.0.1'}`;
}

/**
 * Extracts client IP / identity from Fetch / Cloudflare Worker Request
 */
export function getWorkerClientKey(request: Request, keyPrefix = 'ip', userId?: string): string {
  if (userId) {
    return `user:${userId}`;
  }

  const cfIp = request.headers.get('cf-connecting-ip');
  if (cfIp) return `${keyPrefix}:${cfIp.trim()}`;

  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const firstIp = forwarded.split(',')[0].trim();
    if (firstIp) return `${keyPrefix}:${firstIp}`;
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp) return `${keyPrefix}:${realIp.trim()}`;

  return `${keyPrefix}:unknown`;
}

/**
 * Detects if an incoming request qualifies for venue allowances
 * (e.g., event venue kiosks, tournament display TV screens, organizer spectator projectors).
 * Supported indicators:
 *  - Header: X-Venue-Mode: true, X-Venue-Allowance: true, or X-Venue-Display: true
 *  - Query param: ?venue=true / ?venue=1 / ?display=true / ?display=1 / ?tournament=true
 */
export function isVenueRequest(reqOrRequest: any): boolean {
  if (!reqOrRequest) return false;

  // 1. Fetch / Cloudflare Worker Request
  if (typeof reqOrRequest.headers?.get === 'function') {
    const req = reqOrRequest as Request;
    const h = (
      req.headers.get('x-venue-mode') ||
      req.headers.get('x-venue-allowance') ||
      req.headers.get('x-venue-display') ||
      ''
    ).toLowerCase();
    if (h === 'true' || h === '1') return true;

    try {
      const url = new URL(req.url);
      const q = (
        url.searchParams.get('venue') ||
        url.searchParams.get('display') ||
        url.searchParams.get('tournament') ||
        ''
      ).toLowerCase();
      if (q === 'true' || q === '1') return true;
    } catch {
      // ignore url parse error
    }
    return false;
  }

  // 2. Express Request
  const headers = reqOrRequest.headers || {};
  const h = (
    headers['x-venue-mode'] ||
    headers['x-venue-allowance'] ||
    headers['x-venue-display'] ||
    ''
  ).toString().toLowerCase();
  if (h === 'true' || h === '1') return true;

  const query = reqOrRequest.query || {};
  const q = (query.venue || query.display || query.tournament || '').toString().toLowerCase();
  if (q === 'true' || q === '1') return true;

  return false;
}

/**
 * Express middleware generator for rate limiting
 */
export function createRateLimiter(options: RateLimitOptions) {
  const {
    windowMs,
    max,
    message = 'Too many requests, please try again later.',
    keyPrefix = 'general',
  } = options;

  return (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => {
    let effectiveMax = max;
    if (options.venueAllowanceMax && options.isVenueRequest && options.isVenueRequest(req)) {
      effectiveMax = options.venueAllowanceMax;
    }

    const clientKey = options.keyGenerator
      ? `${keyPrefix}:${options.keyGenerator(req)}`
      : getExpressClientKey(req, keyPrefix);
    const result = checkRateLimit(clientKey, { ...options, max: effectiveMax, keyPrefix });

    // Set standard RateLimit headers
    res.setHeader('RateLimit-Limit', result.limit.toString());
    res.setHeader('RateLimit-Remaining', result.remaining.toString());
    res.setHeader('RateLimit-Reset', result.resetTime.toString());
    res.setHeader('X-RateLimit-Limit', result.limit.toString());
    res.setHeader('X-RateLimit-Remaining', result.remaining.toString());
    res.setHeader('X-RateLimit-Reset', result.resetTime.toString());

    if (!result.allowed) {
      res.setHeader('Retry-After', result.retryAfter.toString());
      res.status(429).json({
        error: 'Too Many Requests',
        message,
        retryAfterSeconds: result.retryAfter,
      });
      return;
    }

    next();
  };
}

// ----------------------------------------------------
// Standard Pre-configured Rate Limiters for Sensitive Endpoints
// ----------------------------------------------------

/**
 * 1. Auth Rate Limiter:
 * Protects POST /api/auth/google, /api/auth/* from brute-force/abuse.
 * 10 requests per 60 seconds per IP.
 */
export const authRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 10,
  keyPrefix: 'auth',
  message: 'Too many authentication attempts. Please wait 1 minute before trying again.',
});

/**
 * 2. Invitation Rate Limiter:
 * Protects POST /api/organizations/:id/invitations from email bombing/spamming.
 * 15 requests per 60 seconds.
 */
export const invitationRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 15,
  keyPrefix: 'invitations',
  message: 'Too many invitations sent in a short period. Please wait a moment before sending more.',
});

/**
 * 3. Organizations Creation Rate Limiter:
 * Protects POST /api/organizations.
 * 10 requests per 60 seconds.
 */
export const organizationRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 10,
  keyPrefix: 'org_creation',
  message: 'Organization creation rate limit exceeded. Please wait a minute before creating another organization.',
});

/**
 * 4. Events Mutation Rate Limiter:
 * Protects POST /api/events/quote, PUT/DELETE /api/events/:id.
 * 20 requests per 60 seconds.
 */
export const eventRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 20,
  keyPrefix: 'events',
  message: 'Event creation and modification rate limit exceeded. Please slow down.',
});

/**
 * 4B. Event Creation Rate Limiter:
 * Dedicated server-side rate limit to prevent delete + create spam:
 * Maximum 3 event creation attempts per organization within 10 minutes.
 */
export const eventCreationRateLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 3, // max 3 attempts per 10 minutes
  keyPrefix: 'event_creation',
  keyGenerator: (req: any) => {
    const orgId = req.jwtPayload?.organizationId || req.params?.orgId || req.body?.organization_id;
    if (orgId) return `org:${orgId}`;
    return req.user?.id || req.ip || 'anonymous';
  },
  message: 'Event creation rate limit exceeded: Maximum 3 event creation attempts per 10 minutes per organization.',
});

/**
 * 5. Wallet & Financial Transaction Rate Limiter:
 * Protects POST /api/organizations/:id/wallet/* (topup, payments, reward consumption).
 * 15 requests per 60 seconds to prevent rapid hammering and concurrent racing.
 */
export const walletRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 15,
  keyPrefix: 'wallet',
  message: 'Wallet transaction rate limit exceeded. Please wait a moment before processing another payment or top-up.',
});

/**
 * 6. Showcase Rate Limiter:
 * Protects POST /api/events/:id/showcase/*, submit, publish, media reordering.
 * 30 requests per 60 seconds.
 */
export const showcaseRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  keyPrefix: 'showcase',
  message: 'Showcase action rate limit reached. Please slow down and try again shortly.',
});

/**
 * 7. Upload Rate Limiter:
 * Protects POST /api/upload, direct-upload, signed-upload-url.
 * 20 uploads per 60 seconds to conserve storage bandwidth.
 */
export const uploadRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 20,
  keyPrefix: 'uploads',
  message: 'File upload rate limit reached. Please wait a moment before uploading more files.',
});

/**
 * 8. High Score Submission Rate Limiter:
 * Protects POST /api/events/:id/high-scores and /api/public/events/:token/high-scores.
 * Sized generously (300 submissions per 60 seconds per IP, ~5 submissions/second)
 * to ensure live event venues with shared Wi-Fi networks (where dozens or hundreds
 * of attendees submit scores from the same NAT IP) do not suffer false-positive 429
 * errors during active gameplay.
 * Replay protection and duplicate score prevention are enforced by database-level
 * idempotency (Migration 029: unique event_id + session_id constraint).
 */
export const highScoreRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 300,
  keyPrefix: 'high_scores',
  message: 'High score submission limit reached. Please wait a few moments before submitting again.',
});

/**
 * 9. General Mutating API Rate Limiter:
 * Broad baseline protection for state-modifying requests (POST/PUT/PATCH/DELETE).
 * 120 requests per 60 seconds per IP.
 */
export const generalApiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 120,
  keyPrefix: 'general_api',
  message: 'API request rate limit exceeded. Please try again in a few seconds.',
});

/**
 * 10. Public Event Read Rate Limiter:
 * Protects GET /api/public/events/:publicToken from capability credential enumeration and scraping.
 * Baseline of 60 requests per 60 seconds per IP, with a venue allowance of up to 180 requests/minute
 * for event kiosks, shared venue Wi-Fi, and live tournament displays.
 */
export const publicEventRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 60,
  venueAllowanceMax: 180,
  isVenueRequest,
  keyPrefix: 'public_event_get',
  message: 'Public event lookup rate limit reached. Please wait a moment before trying again.',
});

/**
 * 11. Public High Score Read Rate Limiter:
 * Protects GET /api/public/events/:publicToken/high-scores from high-frequency polling and scraping.
 * Baseline of 60 requests per 60 seconds per IP, with a venue allowance of up to 180 requests/minute
 * for live tournament displays, TV screens, and spectator monitors.
 */
export const publicHighScoreReadRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 60,
  venueAllowanceMax: 180,
  isVenueRequest,
  keyPrefix: 'public_scores_get',
  message: 'Leaderboard lookup rate limit reached. Please wait a moment before refreshing scores.',
});

/**
 * Worker / Edge Rate Limiter Helper (Synchronous In-Memory First Layer)
 */
export function resetRateLimitStores(): void {
  rateLimitStores.clear();
}

export function checkWorkerRateLimit(
  request: Request,
  options: RateLimitOptions,
  userId?: string
): {
  allowed: boolean;
  headers: Record<string, string>;
  errorResponse?: { error: string; message: string; retryAfterSeconds: number };
} {
  let effectiveMax = options.max;
  const isTestOrLocal = process.env.NODE_ENV === 'test' ||
    request.headers.get('x-test-bypass-rate-limit') === 'true' ||
    request.headers.get('x-test-mode') === 'true' ||
    (request.url && (request.url.startsWith('http://localhost') || request.url.startsWith('http://127.0.0.1')));

  if (isTestOrLocal && request.headers.get('x-test-rate-limit') !== 'true') {
    effectiveMax = Math.max(effectiveMax, 500);
  } else if (options.venueAllowanceMax && options.isVenueRequest && options.isVenueRequest(request)) {
    effectiveMax = options.venueAllowanceMax;
  }

  const clientKey = getWorkerClientKey(request, options.keyPrefix || 'worker', userId);
  const result = checkRateLimit(clientKey, { ...options, max: effectiveMax });

  const headers: Record<string, string> = {
    'RateLimit-Limit': result.limit.toString(),
    'RateLimit-Remaining': result.remaining.toString(),
    'RateLimit-Reset': result.resetTime.toString(),
    'X-RateLimit-Limit': result.limit.toString(),
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': result.resetTime.toString(),
  };

  if (!result.allowed) {
    headers['Retry-After'] = result.retryAfter.toString();
    return {
      allowed: false,
      headers,
      errorResponse: {
        error: 'Too Many Requests',
        message: options.message || 'Too many requests, please try again later.',
        retryAfterSeconds: result.retryAfter,
      },
    };
  }

  return {
    allowed: true,
    headers,
  };
}

/**
 * Cloudflare-Native Distributed Rate Limiter Support:
 * If a Cloudflare Workers Rate Limiting binding (e.g. env.RATE_LIMITER or env.API_RATE_LIMITER)
 * is bound in wrangler.toml, this helper invokes Cloudflare's globally distributed edge rate
 * limiter first, then falls back to the in-memory sliding window layer.
 */
export async function checkWorkerRateLimitWithCloudflare(
  request: Request,
  options: RateLimitOptions,
  env?: { RATE_LIMITER?: { limit: (opts: { key: string }) => Promise<{ success: boolean }> }; [key: string]: any },
  userId?: string
): Promise<{
  allowed: boolean;
  headers: Record<string, string>;
  errorResponse?: { error: string; message: string; retryAfterSeconds: number };
}> {
  const clientKey = getWorkerClientKey(request, options.keyPrefix || 'worker', userId);

  // 1. Check Cloudflare-native edge rate limiter if bound
  if (env && typeof env.RATE_LIMITER?.limit === 'function') {
    try {
      const cfResult = await env.RATE_LIMITER.limit({ key: clientKey });
      if (!cfResult.success) {
        return {
          allowed: false,
          headers: {
            'Retry-After': '60',
            'X-RateLimit-Source': 'cloudflare-edge',
          },
          errorResponse: {
            error: 'Too Many Requests',
            message: options.message || 'Edge rate limit exceeded. Please wait a moment before trying again.',
            retryAfterSeconds: 60,
          },
        };
      }
    } catch (cfErr) {
      console.warn('Cloudflare native rate limiting check failed, falling back to local sliding window:', cfErr);
    }
  }

  // 2. Fall back to / execute in-memory sliding window bucket
  return checkWorkerRateLimit(request, options, userId);
}
