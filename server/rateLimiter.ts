import type { Request as ExpressRequest, Response as ExpressResponse, NextFunction } from 'express';

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  message?: string;
  keyPrefix?: string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
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
    const clientKey = getExpressClientKey(req, keyPrefix);
    const result = checkRateLimit(clientKey, { windowMs, max, keyPrefix });

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
 * Protects POST /api/events, POST /api/events/quote, PUT/DELETE /api/events/:id.
 * 20 requests per 60 seconds.
 */
export const eventRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 20,
  keyPrefix: 'events',
  message: 'Event creation and modification rate limit exceeded. Please slow down.',
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
 * 30 submissions per 60 seconds per IP.
 */
export const highScoreRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
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
 * Worker / Edge Rate Limiter Helper
 */
export function checkWorkerRateLimit(
  request: Request,
  options: RateLimitOptions,
  userId?: string
): {
  allowed: boolean;
  headers: Record<string, string>;
  errorResponse?: { error: string; message: string; retryAfterSeconds: number };
} {
  const clientKey = getWorkerClientKey(request, options.keyPrefix || 'worker', userId);
  const result = checkRateLimit(clientKey, options);

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
