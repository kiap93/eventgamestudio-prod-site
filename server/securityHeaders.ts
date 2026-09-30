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
  customScriptSrc?: string[];
  customConnectSrc?: string[];
}

/**
 * Builds the canonical Content-Security-Policy directive string.
 * Hardened for production:
 * - Omits 'unsafe-inline' and 'unsafe-eval' in script-src in production
 * - Eliminates broad wildcards ('http:', 'https:', '*.run.app', '*.pages.dev')
 * - Enforces specific origin whitelisting for scripts, styles, images, and API connections
 */
export function buildContentSecurityPolicy(options: SecurityHeadersOptions = {}): string {
  const isProd =
    options.isProduction !== undefined
      ? options.isProduction
      : typeof process !== 'undefined' && process.env.NODE_ENV === 'production';

  // Frame-ancestors: restrict clickjacking protection to self, Google AI Studio, and official domains.
  // Wildcards such as *.run.app and *.pages.dev are strictly excluded in production.
  const allowedFrameAncestors = [
    "'self'",
    'https://ai.studio',
    'https://*.google.com',
    'https://eventgamestudio.com',
    'https://*.eventgamestudio.com',
    ...(options.customFrameAncestors || []),
  ];

  // In non-production development environments ONLY, allow preview staging domains if not explicitly overridden
  if (!isProd && !options.customFrameAncestors) {
    allowedFrameAncestors.push('https://*.run.app', 'https://*.pages.dev');
  }

  // Extract hostname from configured Supabase URL if present
  const configuredSupabaseOrigin: string[] = [];
  try {
    const sbUrl = typeof process !== 'undefined' && (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
    if (sbUrl) {
      const parsed = new URL(sbUrl);
      if (parsed.protocol === 'https:' && !parsed.hostname.endsWith('.supabase.co')) {
        configuredSupabaseOrigin.push(parsed.origin);
      }
    }
  } catch {
    // Ignore invalid URL
  }

  // Script sources:
  // In production, strictly omit 'unsafe-inline' and 'unsafe-eval'.
  // Only allow self and verified 3P CDNs (Google Identity Services for login, Stripe for checkout).
  const scriptSrc = [
    "'self'",
    'https://accounts.google.com',
    'https://apis.google.com',
    'https://js.stripe.com',
    ...(options.customScriptSrc || []),
  ];

  if (!isProd) {
    // Vite HMR development server requires inline module execution
    scriptSrc.push("'unsafe-inline'", "'unsafe-eval'");
  }

  // Image sources:
  // Exclude unencrypted 'http:' and wildcard 'https:'.
  // Whitelist self, data/blob for local canvas/previews, Supabase Storage for assets, Google for avatars, Unsplash for presets.
  const imgSrc = [
    "'self'",
    'data:',
    'blob:',
    'https://*.supabase.co',
    'https://*.googleusercontent.com',
    'https://images.unsplash.com',
    'https://eventgamestudio.com',
    'https://*.eventgamestudio.com',
    ...configuredSupabaseOrigin,
  ];

  // Media sources:
  // Whitelist self, data/blob, and Supabase Storage for audio SFX / video showcases.
  const mediaSrc = [
    "'self'",
    'data:',
    'blob:',
    'https://*.supabase.co',
    'https://eventgamestudio.com',
    'https://*.eventgamestudio.com',
    ...configuredSupabaseOrigin,
  ];

  // Connect sources:
  // Strictly eliminate wildcard 'https:' and 'wss:'.
  const connectSrc = [
    "'self'",
    'https://*.supabase.co',
    'wss://*.supabase.co',
    'https://accounts.google.com',
    'https://apis.google.com',
    'https://identitytoolkit.googleapis.com',
    'https://api.stripe.com',
    'https://eventgamestudio.com',
    'https://*.eventgamestudio.com',
    'wss://eventgamestudio.com',
    'wss://*.eventgamestudio.com',
    ...configuredSupabaseOrigin,
    ...(options.customConnectSrc || []),
  ];

  if (!isProd) {
    // Vite HMR development websockets
    connectSrc.push('ws:', 'wss:');
  }

  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': scriptSrc,
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
    'img-src': imgSrc,
    'media-src': mediaSrc,
    'connect-src': connectSrc,
    'frame-src': [
      "'self'",
      'https://accounts.google.com',
      'https://js.stripe.com',
      'https://hooks.stripe.com',
    ],
    'frame-ancestors': [allowedFrameAncestors.join(' ')],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'", 'https://accounts.google.com'],
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

  const isNullBodyStatus = [101, 204, 205, 304].includes(response.status);
  return new globalThis.Response(isNullBodyStatus ? null : response.body, {
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

/**
 * Resolves standard CookieOptions based on an incoming Express Request.
 */
export function getCookieOptionsFromRequest(req: Request): CookieOptions {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const isProd = process.env.NODE_ENV === 'production';
  return {
    isProduction: isProd,
    secure: isHttps || isProd,
    sameSite: 'Lax',
    path: '/',
  };
}

/**
 * Sets the HttpOnly session auth cookie on an Express Response object.
 */
export function setAuthCookieOnResponse(
  res: Response,
  token: string,
  options: CookieOptions = {}
): void {
  const cookieStr = buildAuthCookie(token, options);
  res.setHeader('Set-Cookie', cookieStr);
}

/**
 * Clears the HttpOnly session auth cookie on an Express Response object.
 */
export function clearAuthCookieOnResponse(
  res: Response,
  options: CookieOptions = {}
): void {
  const cookieStr = buildClearAuthCookie(options);
  res.setHeader('Set-Cookie', cookieStr);
}

/**
 * Resolves standard CookieOptions for Cloudflare Worker environment.
 */
export function getWorkerCookieOptions(
  request: globalThis.Request,
  env?: { NODE_ENV?: string }
): CookieOptions {
  const isProd = env?.NODE_ENV === 'production';
  const isHttps = request.url.startsWith('https://') || isProd;
  return {
    isProduction: isProd,
    secure: isHttps,
    sameSite: 'Lax',
    path: '/',
  };
}

