/**
 * Production Security Headers and Secure Cookie Authentication Helpers
 * 
 * Provides:
 * 1. Comprehensive Content-Security-Policy (CSP) tailored for React/Vite, Google OAuth, Stripe, Supabase & Web Audio
 * 2. Clickjacking protection via frame-ancestors (permitting self, AI Studio preview, and official domains)
 * 3. X-Content-Type-Options: nosniff
 * 4. Referrer-Policy: strict-origin-when-cross-origin
 * 5. Permissions-Policy: restricting camera, microphone, geolocation, usb
 * 6. Strict-Transport-Security (HSTS)
 * 7. Cross-Origin-Opener-Policy: same-origin-allow-popups for Google OAuth compatibility
 * 8. Secure HttpOnly cookie helpers for moving authentication away from purely localStorage JWTs
 */

import type { Request, Response, NextFunction } from 'express';

export const AUTH_COOKIE_NAME = 'app_token';
export const AUTH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days (matches JWT lifespan)

export interface SecurityHeadersOptions {
  isProduction?: boolean;
  isHttps?: boolean;
  customFrameAncestors?: string[];
}

/**
 * Builds the canonical Content-Security-Policy directive string.
 */
export function buildContentSecurityPolicy(options: SecurityHeadersOptions = {}): string {
  const allowedFrameAncestors = [
    "'self'",
    'https://ai.studio',
    'https://*.google.com',
    'https://*.run.app',
    'https://eventgamestudio.com',
    'https://*.eventgamestudio.com',
    'https://*.pages.dev',
    ...(options.customFrameAncestors || []),
  ].join(' ');

  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': [
      "'self'",
      "'unsafe-inline'",
      "'unsafe-eval'",
      'https://accounts.google.com',
      'https://apis.google.com',
      'https://js.stripe.com',
    ],
    'style-src': [
      "'self'",
      "'unsafe-inline'",
      'https://fonts.googleapis.com',
    ],
    'font-src': [
      "'self'",
      'data:',
      'https://fonts.gstatic.com',
    ],
    'img-src': [
      "'self'",
      'data:',
      'blob:',
      'https:',
      'http:',
    ],
    'media-src': [
      "'self'",
      'data:',
      'blob:',
      'https:',
    ],
    'connect-src': [
      "'self'",
      'https:',
      'wss:',
    ],
    'frame-src': [
      "'self'",
      'https://accounts.google.com',
      'https://js.stripe.com',
      'https://hooks.stripe.com',
    ],
    'frame-ancestors': [allowedFrameAncestors],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
  };

  return Object.entries(directives)
    .map(([key, vals]) => `${key} ${vals.join(' ')};`)
    .join(' ');
}

/**
 * Returns a map of all required production security headers.
 */
export function getSecurityHeaders(options: SecurityHeadersOptions = {}): Record<string, string> {
  const isProd =
    options.isProduction !== undefined
      ? options.isProduction
      : typeof process !== 'undefined' && process.env.NODE_ENV === 'production';

  const isHttps =
    options.isHttps !== undefined
      ? options.isHttps
      : isProd;

  const headers: Record<string, string> = {
    'Content-Security-Policy': buildContentSecurityPolicy(options),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(self), usb=(), screen-wake-lock=(self)',
    'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    'X-XSS-Protection': '0',
  };

  // Enable HSTS in production or when serving over HTTPS
  if (isHttps || isProd) {
    headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains; preload';
  }

  return headers;
}

/**
 * Express middleware that applies all production security headers to every response.
 */
export function securityHeadersMiddleware(options: SecurityHeadersOptions = {}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const isHttps =
      options.isHttps ??
      (req.secure ||
        req.headers['x-forwarded-proto'] === 'https' ||
        process.env.NODE_ENV === 'production');

    const headers = getSecurityHeaders({
      ...options,
      isHttps,
    });

    for (const [headerName, headerVal] of Object.entries(headers)) {
      // Don't overwrite if already set by specific handler
      if (!res.getHeader(headerName)) {
        res.setHeader(headerName, headerVal);
      }
    }

    next();
  };
}

/**
 * Helper to apply security headers to a Fetch/Cloudflare Worker Response.
 */
export function applySecurityHeadersToResponse(
  response: globalThis.Response,
  options: SecurityHeadersOptions = {}
): globalThis.Response {
  const securityHeaders = getSecurityHeaders(options);
  const newHeaders = new Headers(response.headers);

  for (const [key, val] of Object.entries(securityHeaders)) {
    if (!newHeaders.has(key)) {
      newHeaders.set(key, val);
    }
  }

  return new globalThis.Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

// ----------------------------------------------------------------------------
// Cookie-Based Authentication Helpers (HttpOnly + SameSite + Secure)
// ----------------------------------------------------------------------------

export interface CookieOptions {
  isProduction?: boolean;
  maxAgeSeconds?: number;
  sameSite?: 'Lax' | 'Strict' | 'None';
  path?: string;
  secure?: boolean;
}

/**
 * Builds a Set-Cookie header string for setting the HttpOnly auth token.
 */
export function buildAuthCookie(token: string, options: CookieOptions = {}): string {
  const isProd =
    options.isProduction !== undefined
      ? options.isProduction
      : typeof process !== 'undefined' && process.env.NODE_ENV === 'production';

  const maxAge = options.maxAgeSeconds ?? AUTH_COOKIE_MAX_AGE;
  const path = options.path ?? '/';
  const sameSite = options.sameSite ?? 'Lax';
  const isSecure = options.secure ?? isProd;

  const parts = [
    `${AUTH_COOKIE_NAME}=${token}`,
    `Path=${path}`,
    `Max-Age=${maxAge}`,
    'HttpOnly',
    `SameSite=${sameSite}`,
  ];

  if (isSecure) {
    parts.push('Secure');
  }

  return parts.join('; ');
}

/**
 * Builds a Set-Cookie header string for immediately clearing the auth token.
 */
export function buildClearAuthCookie(options: CookieOptions = {}): string {
  const isProd =
    options.isProduction !== undefined
      ? options.isProduction
      : typeof process !== 'undefined' && process.env.NODE_ENV === 'production';

  const path = options.path ?? '/';
  const sameSite = options.sameSite ?? 'Lax';
  const isSecure = options.secure ?? isProd;

  const parts = [
    `${AUTH_COOKIE_NAME}=`,
    `Path=${path}`,
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    'HttpOnly',
    `SameSite=${sameSite}`,
  ];

  if (isSecure) {
    parts.push('Secure');
  }

  return parts.join('; ');
}

/**
 * Parses a specific cookie value from a raw Cookie header string.
 */
export function parseCookie(
  cookieHeader: string | undefined | null,
  name: string = AUTH_COOKIE_NAME
): string | null {
  if (!cookieHeader) return null;

  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    const key = pair.slice(0, idx).trim();
    if (key === name) {
      const val = pair.slice(idx + 1).trim();
      return decodeURIComponent(val);
    }
  }

  return null;
}
