/**
 * CORS Whitelist Security Module for EventGameStudio
 * 
 * Secure multi-origin CORS engine for Express and Cloudflare Workers:
 * 1. Parses ALLOWED_ORIGINS (comma-separated list) into an exact whitelist.
 * 2. Compares incoming request Origin against configured origins & same-origin.
 * 3. In development/staging only, permits localhost/127.0.0.1 and preview sandboxes.
 * 4. In production, strictly enforces the explicit whitelist (no localhost unless configured).
 * 5. Dynamically returns the exact matching Origin with `Vary: Origin`.
 * 6. Never returns wildcard `*` with credentials or multiple origins in one header.
 */

export const DEFAULT_ALLOWED_ORIGINS = [
  'https://eventgamestudio.com',
  'https://www.eventgamestudio.com',
  'https://app.eventgamestudio.com',
  'https://eventgamestudio.pages.dev',
];

export interface CorsOptions {
  allowedOrigins?: string | string[];
  isProduction?: boolean;
  requestUrl?: string;
  reqHost?: string;
}

/**
 * Parses comma-separated or array origin strings and normalizes them into a Set of origin strings (e.g., "https://domain.com")
 */
export function parseAllowedOrigins(input?: string | string[]): Set<string> {
  const result = new Set<string>();

  // Add default origins
  for (const origin of DEFAULT_ALLOWED_ORIGINS) {
    try {
      result.add(new URL(origin).origin);
    } catch {
      result.add(origin.trim().replace(/\/+$/, ''));
    }
  }

  if (!input) return result;

  const rawList = Array.isArray(input) ? input : input.split(',');
  for (const item of rawList) {
    const trimmed = item.trim();
    if (!trimmed) continue;
    try {
      result.add(new URL(trimmed).origin);
    } catch {
      result.add(trimmed.replace(/\/+$/, ''));
    }
  }

  return result;
}

/**
 * Validates whether an incoming Origin header is permitted under the CORS policy
 */
export function isOriginAllowed(
  origin: string | null | undefined,
  options?: CorsOptions
): boolean {
  if (!origin || origin === 'null' || origin === 'undefined') {
    return false;
  }

  const isProduction =
    options?.isProduction !== undefined
      ? options.isProduction
      : (typeof process !== 'undefined' && process.env.NODE_ENV === 'production');

  const rawAllowedOrigins =
    options?.allowedOrigins !== undefined
      ? options.allowedOrigins
      : (typeof process !== 'undefined' ? process.env.ALLOWED_ORIGINS : undefined);

  const allowedSet = parseAllowedOrigins(rawAllowedOrigins);

  try {
    const originUrl = new URL(origin);
    const normalizedOrigin = originUrl.origin;

    // 1. Same-origin check against requestUrl or reqHost
    if (options?.requestUrl) {
      try {
        const reqUrl = new URL(options.requestUrl);
        if (originUrl.origin === reqUrl.origin) {
          return true;
        }
      } catch {
        // ignore malformed requestUrl
      }
    }

    if (options?.reqHost) {
      // reqHost may be "hostname" or "hostname:port"
      if (originUrl.host === options.reqHost) {
        return true;
      }
    }

    // 2. Exact match in whitelist
    if (allowedSet.has(normalizedOrigin)) {
      return true;
    }

    const hostname = originUrl.hostname.toLowerCase();

    // 3. EventGameStudio apex and tenant subdomains (Production & all environments)
    // Legitimate tenant organizations operate on vanity/branded subdomains: *.eventgamestudio.com
    if (
      hostname === 'eventgamestudio.com' ||
      hostname.endsWith('.eventgamestudio.com')
    ) {
      return true;
    }

    // 4. Development / staging environment exemptions (NOT permitted in production)
    // In dev/staging: permit localhost, 127.0.0.1, and cloud preview environments (*.run.app, *.pages.dev, *.workers.dev).
    // In production: broad wildcard platforms (*.workers.dev, *.pages.dev, *.run.app) are STRICTLY forbidden
    // to prevent unauthorized third-party Workers, Pages, or Cloud Run containers from making credentialed requests.
    // If a specific deployment origin is required in production, it must be explicitly configured via ALLOWED_ORIGINS.
    if (!isProduction) {
      if (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname.endsWith('.localhost') ||
        hostname.endsWith('.workers.dev') ||
        hostname.endsWith('.pages.dev') ||
        hostname.endsWith('.run.app') ||
        hostname.endsWith('.aistudio.google.com') ||
        hostname.endsWith('.googleusercontent.com') ||
        hostname.endsWith('.usercontent.goog') ||
        hostname.endsWith('.cloudworkstations.dev')
      ) {
        return true;
      }
    }
  } catch {
    return false;
  }

  return false;
}

export interface CorsHeadersResult {
  'Access-Control-Allow-Origin'?: string;
  'Access-Control-Allow-Credentials'?: string;
  'Access-Control-Allow-Methods': string;
  'Access-Control-Allow-Headers': string;
  'Access-Control-Max-Age': string;
  'Vary'?: string;
}

/**
 * Computes standard CORS headers based on the request and whitelist configuration
 */
export function getCorsHeaders(
  origin: string | null | undefined,
  requestHeaders?: string | null,
  options?: CorsOptions
): CorsHeadersResult {
  const headers: CorsHeadersResult = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': requestHeaders || 'Content-Type, Authorization, X-Organization-ID, Accept',
    'Access-Control-Max-Age': '86400',
  };

  if (origin && isOriginAllowed(origin, options)) {
    try {
      const originUrl = new URL(origin);
      headers['Access-Control-Allow-Origin'] = originUrl.origin;
      headers['Access-Control-Allow-Credentials'] = 'true';
      headers['Vary'] = 'Origin';
    } catch {
      // If origin is somehow not standard URL but passed check
      headers['Access-Control-Allow-Origin'] = origin;
      headers['Access-Control-Allow-Credentials'] = 'true';
      headers['Vary'] = 'Origin';
    }
  }

  return headers;
}
