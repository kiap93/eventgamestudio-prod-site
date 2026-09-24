/**
 * Event Game Studio — Cryptographically Authenticated Venue Authorization
 *
 * Replaces unauthenticated, client-controlled headers (X-Venue-Mode, X-Venue-Allowance,
 * X-Venue-Display) and query parameters (?venue=true, ?display=true, ?tournament=true)
 * with cryptographically signed venue tokens and verified organizer sessions.
 *
 * Security Boundaries:
 * 1. Client-controlled flags alone NEVER elevate rate limits.
 * 2. Elevation to venue allowance (180 requests/min vs 60 requests/min baseline)
 *    strictly requires either:
 *    - A cryptographically signed, unexpired venue token (HMAC-SHA256 / JWT_SECRET)
 *    - A verified organizer / team member authentication session.
 */

import * as jose from 'jose';
import crypto from 'node:crypto';
import { getJwtSecret } from './auth.js';

export interface VenueTokenPayload {
  type: 'venue_display' | 'venue_token';
  eventId?: string;
  publicToken?: string;
  organizationId?: string;
  issuedBy?: string;
  sub?: string;
  role?: string;
  email?: string;
  iat?: number;
  exp?: number;
}

export interface SignVenueTokenOptions {
  eventId?: string;
  publicToken?: string;
  organizationId?: string;
  issuedBy?: string;
  expiresIn?: string; // e.g. '24h', '7d', '30d'
}

/**
 * Mint a cryptographically signed venue token for an event display, kiosk,
 * TV monitor, or tournament projector screen.
 */
export async function signVenueToken(
  options: SignVenueTokenOptions,
  secretOverride?: string,
  env?: Record<string, any>
): Promise<string> {
  const secret = getJwtSecret(secretOverride, env);
  const payload: Record<string, any> = {
    type: 'venue_display',
    ...(options.eventId ? { eventId: options.eventId } : {}),
    ...(options.publicToken ? { publicToken: options.publicToken } : {}),
    ...(options.organizationId ? { organizationId: options.organizationId } : {}),
    ...(options.issuedBy ? { issuedBy: options.issuedBy } : {}),
  };

  return await new jose.SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(options.expiresIn || '7d')
    .sign(secret);
}

/**
 * Synchronous verification of HS256 JWT in Node.js / Bun runtime.
 * Fast-path for rate limiting checks without async overhead when node:crypto is available.
 */
export function verifyJwtSync(token: string, secretBytes: Uint8Array): VenueTokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, signatureB64] = parts;

    // Node.js crypto check
    if (typeof crypto !== 'undefined' && typeof (crypto as any).createHmac === 'function') {
      const hmac = (crypto as any).createHmac('sha256', secretBytes);
      hmac.update(`${headerB64}.${payloadB64}`);
      const calculatedSig = hmac.digest('base64url');
      if (calculatedSig !== signatureB64) {
        return null;
      }
      const payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf8');
      const payload = JSON.parse(payloadJson);
      const nowSec = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp < nowSec) {
        return null; // Expired
      }
      return payload as VenueTokenPayload;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Validates payload claims for venue token or authenticated organizer/session.
 */
export function isValidVenueOrSessionPayload(payload: any): boolean {
  if (!payload || typeof payload !== 'object') return false;

  // 1. Explicit signed venue display token
  if (
    payload.type === 'venue_display' ||
    payload.type === 'venue_token' ||
    payload.role === 'venue_display'
  ) {
    return true;
  }

  // 2. Authenticated organizer / team member App JWT session
  if (payload.sub && (payload.organizationId || payload.role || payload.email)) {
    return true;
  }

  return false;
}

/**
 * Verifies a venue token or authenticated session token.
 * Supports both synchronous fast-path (in Node/Bun) and async jose verification.
 */
export async function verifyVenueToken(
  token: string,
  secretOverride?: string,
  env?: Record<string, any>
): Promise<VenueTokenPayload | null> {
  if (!token || typeof token !== 'string') return null;
  const cleanToken = token.trim().replace(/^Bearer\s+/i, '');
  if (!cleanToken) return null;

  try {
    const secret = getJwtSecret(secretOverride, env);

    // Try synchronous fast-path first if supported
    const syncPayload = verifyJwtSync(cleanToken, secret);
    if (syncPayload) {
      if (isValidVenueOrSessionPayload(syncPayload)) {
        return syncPayload;
      }
      return null;
    }

    // Async jose verification (works across Edge / Cloudflare Workers and standard runtimes)
    const { payload } = await jose.jwtVerify(cleanToken, secret);
    if (isValidVenueOrSessionPayload(payload)) {
      return payload as unknown as VenueTokenPayload;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Extracts candidate token from request (Express req or Cloudflare Worker / Fetch Request).
 */
export function extractCandidateToken(reqOrRequest: any): string | null {
  if (!reqOrRequest) return null;

  // 1. Fetch / Cloudflare Worker Request
  if (typeof reqOrRequest.headers?.get === 'function') {
    const req = reqOrRequest as Request;
    const venueHeader =
      req.headers.get('x-venue-token') ||
      req.headers.get('x-venue-auth') ||
      req.headers.get('x-venue-authorization');
    if (venueHeader) return venueHeader.trim();

    const authHeader = req.headers.get('authorization');
    if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
      return authHeader.slice(7).trim();
    }

    try {
      const url = new URL(req.url);
      const qToken = url.searchParams.get('venue_token') || url.searchParams.get('venueToken');
      if (qToken) return qToken.trim();
    } catch {
      // ignore URL parse errors
    }
    return null;
  }

  // 2. Express Request
  const headers = reqOrRequest.headers || {};
  const venueHeader =
    headers['x-venue-token'] ||
    headers['x-venue-auth'] ||
    headers['x-venue-authorization'];
  if (venueHeader) return String(venueHeader).trim();

  const authHeader = headers['authorization'];
  if (authHeader && String(authHeader).toLowerCase().startsWith('bearer ')) {
    return String(authHeader).slice(7).trim();
  }

  const query = reqOrRequest.query || {};
  if (query.venue_token) return String(query.venue_token).trim();
  if (query.venueToken) return String(query.venueToken).trim();

  return null;
}

/**
 * Detects if an incoming request qualifies for venue allowances.
 *
 * CRITICAL SECURITY PRINCIPLE:
 * Client-controlled flags (X-Venue-Mode: true, ?venue=true, ?display=true, etc.)
 * are completely UNTRUSTED and will NEVER grant venue allowance on their own.
 * Only cryptographically signed venue tokens or authenticated organizer sessions qualify.
 */
export function isVenueRequest(reqOrRequest: any, env?: Record<string, any>): boolean {
  if (!reqOrRequest) return false;

  // 1. Check if Express request already has an authenticated user/session
  if (reqOrRequest.user?.id || reqOrRequest.jwtPayload?.sub) {
    return true;
  }

  // 2. Extract candidate cryptographic token
  const token = extractCandidateToken(reqOrRequest);
  if (!token) {
    // Client passed unauthenticated flags or no token -> REJECT venue mode
    return false;
  }

  // 3. Attempt synchronous token verification (Node.js / Bun runtime fast-path)
  try {
    const secret = getJwtSecret(undefined, env);
    const syncPayload = verifyJwtSync(token, secret);
    if (syncPayload && isValidVenueOrSessionPayload(syncPayload)) {
      return true;
    }
  } catch {
    // Ignore and return false
  }

  return false;
}

/**
 * Asynchronous version of isVenueRequest, supporting Cloudflare Worker Edge isolates
 * where synchronous Web Crypto may not be available.
 */
export async function isVenueRequestAsync(
  reqOrRequest: any,
  env?: Record<string, any>
): Promise<boolean> {
  if (!reqOrRequest) return false;

  if (reqOrRequest.user?.id || reqOrRequest.jwtPayload?.sub) {
    return true;
  }

  const token = extractCandidateToken(reqOrRequest);
  if (!token) return false;

  const verified = await verifyVenueToken(token, undefined, env);
  return verified !== null;
}
