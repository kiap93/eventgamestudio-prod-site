import {
  OrgRole,
  getUserById,
  getUserByEmail,
  createUser,
  deleteUser,
  getUserByVerificationToken,
  getUserByPasswordResetToken,
  verifyUserEmail,
  setUserPassword,
  updateUserVerificationToken,
  updateUserPasswordResetToken,
  upsertGoogleUser,
  updateUserProfile,
  getUserOrganizations,
  createOrganization,
  updateOrganization,
  getOrganizationById,
  isValidCountryCode,
  getOrgMembers,
  getMember,
  getMemberById,
  addMember,
  updateMemberRole,
  removeMember,
  createInvitation,
  getInvitationByTokenHash,
  getActiveOrgInvitations,
  markInvitationAccepted,
  getGamesByOrgId,
  getGameById,
  ensureDefaultGame,
  ensureDefaultGames,
  getAvailableGamesForStudio,
  updateGameCustomization,
  getThemesByOrgId,
  getThemeById,
  checkOrganizationThemeReadiness,
  getOrCreateOnboardingTheme,
  isUUID,
  createTheme,
  updateTheme,
  renameTheme,
  checkThemeNameAvailable,
  duplicateTheme,
  deleteTheme,
  uploadGameAsset,
  getEventsByOrgId,
  getEventById,
  getEventByPublicToken,
  toPublicEventDTO,
  canAccessLiveEvent,
  canAccessPreviewEvent,
  canAccessClientLiveGame,
  getClientLiveGameAccessDetails,
  isEventExplicitlyCancelled,
  getNormalizedEventDates,
  createEvent,
  createEventWithAtomicPayment,
  updateEvent,
  deleteEvent,
  canDeleteEvent,
  cancelEvent,
  canCancelEvent,
  determineEventRefund,
  reactivateEvent,
  runEventLifecycleMaintenance,
  isEventEligibleForShowcase,
  PaymentMode,
  ensureSystemCatalogGames,
  getAllPlatformGames,
  createPlatformGame,
  updatePlatformGame,
  deletePlatformGame,
  getAllOrganizationsForDeveloper,
  getOrganizationDetailForDeveloper,
  getAllSystemThemes,
  getSystemThemesByGameId,
  ensureSystemDefaultThemesForGame,
  createSystemTheme,
  updateSystemTheme,
  deleteSystemTheme,
  duplicateSystemTheme,
  setPrimaryDefaultSystemTheme,
  unsetPrimaryDefaultSystemTheme,
  cloneSystemThemeToOrg,
  cloneAllSystemThemesToOrg,
  getWalletBalance,
  getPaidBalance,
  getWelcomeCredit,
  getShowcaseCredit,
  getTopupCredit,
  calculateTopupCredit,
  createTopup,
  grantWelcomeCredit,
  canUseWelcomeCredit,
  consumeWelcomeCredit,
  grantShowcaseCredit,
  canUseShowcaseCredit,
  consumeShowcaseCredit,
  calculateEventPayment,
  calculateEventPaymentQuote,
  processEventPayment,
  getWalletTransactions,
  getWalletAuditTrail,
  reverseTransaction,
  recalculateWalletBalances,
  STANDARD_EVENT_PRICE,
  getPlatformPricingSettings,
  updatePlatformPricingSettings,
  getPlatformContactSettings,
  updatePlatformContactSettings,
  DEFAULT_CONTACT_SETTINGS,
  calculateEventCalendarDays,
  calculateEventAuthoritativePrice,
  getGamePricing,
  getActiveGamePricing,
  resolveGamePrice,
  createGamePricingTier,
  updateGamePricingTier,
  deleteGamePricingTier,
  bulkUpsertGamePricing,
  ensureDefaultGamePricing,
  getPublicGamesPricing,
  getAllAdminEvents,
  updateEventPrice,
  getShowcaseByEventId,
  getShowcaseById,
  createShowcase,
  updateShowcase,
  publishShowcase,
  unpublishShowcase,
  deleteShowcase,
  blockShowcase,
  unblockShowcase,
  adminDeleteShowcase,
  evaluateShowcaseRewardEligibility,
  approveShowcaseReward,
  rejectShowcaseReward,
  approveEventReview,
  rejectEventReview,
  getOwnerShowcaseRewardStatus,
  submitShowcaseForReview,
  approveShowcaseReview,
  rejectShowcaseReview,
  getAllShowcasesForAdmin,
  getShowcaseRewardsForAdmin,
  getShowcaseMedia,
  getShowcaseMediaById,
  createSignedUploadUrlForShowcase,
  validateAndResolveShowcaseMediaPath,
  ASSET_BUCKET,
  SHOWCASE_BUCKET,
  ensureStorageBuckets,
  createShowcaseMedia,
  reorderShowcaseMedia,
  deleteShowcaseMedia,
  getTopupQuote,
  createTopupOrder,
  getTopupOrderById,
  findTopupOrderByReference,
  listTopupOrdersByOrganization,
  TopupOrderRecord,
  processTopupOrderStatus,
  reconcileTopupOrder,
  recordWalletAuditEvent,
  preparePendingTopupOrder,
  getEventHighScores,
  submitEventScore,
  getEventScoreStats,
  deleteEventScore,
  clearEventHighScores,
  manualClearEventTestScores,
  getEventTestScoresCount,
  isEventBeforeStartDate,
  determineScoreEnvironment,
  getGoogleMailSettings,
  saveGoogleMailSettings,
  disconnectGoogleMail,
  updateGoogleMailStatus,
  updateInvitationEmailStatus,
  getInvitationById,
  renewInvitation,
  deleteInvitation,
  listNotifications,
  getUnreadNotificationCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  listApiErrorLogs,
  getApiErrorLogById,
  evaluatePromotionEligibility,
  hasUserClaimedReward,
  isUserOrganizationOwner,
  createContactEnquiry,
  updateContactEnquiryEmailStatus,
  getContactNotificationRecipientEmail,
  listContactEnquiries,
  createShowcaseRewardSubmission,
  getShowcaseRewardSubmissionForEvent,
  getActiveUserShowcaseRewardSubmission,
  getShowcaseRewardSubmissionById,
  getPendingRewardSubmissions,
  approveShowcaseRewardSubmission,
  rejectShowcaseRewardSubmission,
  getShowcaseRewardEligibility,
  checkShowcaseRewardEligibility,
} from './server/db/index.js';
import { dispatchNotificationEvent } from './server/notifications/dispatcher.js';
import { handleWorkerApiError, AppError, PricingConfigurationError, resolveCorrelationId, isOperationalError } from './server/errors.js';
import { translationService } from './server/translation/service.js';
import { SUPPORTED_LANGUAGES, normalizeLanguageCode } from './src/lib/i18n/languages.js';
import {
  getEventTranslations,
  getEventTranslation,
  upsertEventTranslation,
  deleteEventTranslation,
  getShowcaseTranslations,
  upsertShowcaseTranslation,
  deleteShowcaseTranslation,
  getTranslationJob,
} from './server/db/translations.js';

import {
  buildGoogleAuthUrl,
  exchangeGoogleAuthCode,
  getGoogleMailConfig,
  getFrontendBaseUrl,
  sendEmailViaGmail,
  generateInvitationEmailTemplate,
  generateTestEmailTemplate,
  generateContactEnquiryEmailTemplate,
  generateOAuthStateToken,
  verifyOAuthStateToken,
  encryptRefreshToken,
} from './server/email/index.js';

import {
  createPaymentSession,
  verifyAndProcessPaymentWebhook,
  generateWebhookSignature,
  getPaymentWebhookSecret,
  syncTopupOrderExpiration,
  finalizeWalletTopUp,
  getStripeClient,
  SUPPORTED_PAYMENT_METHODS,
  isPaymentMethodSupported,
  getSupportedPaymentMethods,
} from './server/payment/index.js';

import {
  signAppToken,
  verifyGoogleIdToken,
  verifyOrgMembershipAndPermission,
  hashToken,
  isUserDeveloperAdmin,
  resolveAuthToken,
  AppJWTPayload,
} from './server/auth.js';

import { getSupabaseServerClient } from './server/supabase.js';
import { checkWorkerRateLimit, checkWorkerRateLimitWithCloudflare, isVenueRequest, WORKER_CONTACT_RATE_LIMIT, WORKER_RESEND_RATE_LIMIT, signVenueToken } from './server/rateLimiter.js';
import { validateUploadedFile } from './server/fileValidation.js';

import {
  validatePassword,
  validateEmail,
  hashPassword,
  verifyPassword,
  maskEmail,
} from './server/password.js';
import {
  generateVerificationToken,
  generatePasswordResetToken,
  sendVerificationEmail,
  sendPasswordResetEmail,
  isEmailServiceConfigured,
} from './server/emailVerification.js';
import {
  applySecurityHeadersToResponse,
  buildAuthCookie,
  buildClearAuthCookie,
  parseCookie,
  AUTH_COOKIE_NAME,
  getWorkerCookieOptions,
} from './server/securityHeaders.js';

export interface Env {
  NODE_ENV?: string;
  EXPOSE_API_ERRORS?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  JWT_SECRET?: string;
  ALLOWED_ORIGINS?: string;
  GOOGLE_CLIENT_ID?: string;
  VITE_GOOGLE_CLIENT_ID?: string;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  RATE_LIMITER?: { limit: (opts: { key: string }) => Promise<{ success: boolean }> };
  AUTH_RATE_LIMITER?: { limit: (opts: { key: string }) => Promise<{ success: boolean }> };
  WALLET_RATE_LIMITER?: { limit: (opts: { key: string }) => Promise<{ success: boolean }> };
  ORG_RATE_LIMITER?: { limit: (opts: { key: string }) => Promise<{ success: boolean }> };
  PUBLIC_RATE_LIMITER?: { limit: (opts: { key: string }) => Promise<{ success: boolean }> };
  SCORE_RATE_LIMITER?: { limit: (opts: { key: string }) => Promise<{ success: boolean }> };
  API_RATE_LIMITER?: { limit: (opts: { key: string }) => Promise<{ success: boolean }> };
  ASSETS?: {
    fetch: (request: Request | string) => Promise<Response>;
  };
  [key: string]: any;
}

const DEFAULT_ALLOWED_ORIGINS = [
  'https://eventgamestudio.com',
  'https://www.eventgamestudio.com',
  'https://app.eventgamestudio.com',
  'https://eventgamestudio.pages.dev',
];

export function isAllowedOrigin(origin: string | null | undefined, requestUrl: string, env?: Env): boolean {
  if (!origin || origin === 'null' || origin === 'undefined') {
    return false;
  }

  const isProduction =
    env?.NODE_ENV === 'production' ||
    (typeof process !== 'undefined' && process.env.NODE_ENV === 'production');

  const customOriginsStr =
    env?.ALLOWED_ORIGINS ||
    (typeof process !== 'undefined' ? process.env.ALLOWED_ORIGINS : '');

  const customOrigins = customOriginsStr
    ? customOriginsStr
        .split(',')
        .map((s: string) => s.trim())
        .filter(Boolean)
    : [];

  const allowedList = new Set<string>();
  for (const def of DEFAULT_ALLOWED_ORIGINS) {
    try {
      allowedList.add(new URL(def).origin);
    } catch {
      allowedList.add(def.trim().replace(/\/+$/, ''));
    }
  }
  for (const custom of customOrigins) {
    try {
      allowedList.add(new URL(custom).origin);
    } catch {
      allowedList.add(custom.trim().replace(/\/+$/, ''));
    }
  }

  try {
    const originUrl = new URL(origin);
    const normalizedOrigin = originUrl.origin;

    // 1. Same-origin is always allowed
    if (requestUrl) {
      try {
        const reqUrl = new URL(requestUrl);
        if (originUrl.origin === reqUrl.origin) {
          return true;
        }
      } catch {
        // ignore malformed requestUrl
      }
    }

    // 2. Exact match in whitelist
    if (allowedList.has(normalizedOrigin)) {
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

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

const ALLOWED_VIDEO_MIME_TYPES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
]);

const MAX_IMAGE_SIZE = 25 * 1024 * 1024; // 25MB
const MAX_VIDEO_SIZE = 200 * 1024 * 1024; // 200MB
const MAX_DIRECT_UPLOAD_SIZE = 10 * 1024 * 1024; // 10MB direct in-memory upload limit to protect Worker RAM

function corsHeaders(request: Request, env?: Env): Record<string, string> {
  const origin = request.headers.get('Origin');
  const reqHeaders = request.headers.get('Access-Control-Request-Headers');

  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': reqHeaders || 'Content-Type, Authorization, X-Organization-ID, Accept',
    'Access-Control-Max-Age': '86400',
  };

  if (origin && isAllowedOrigin(origin, request.url, env)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
    headers['Vary'] = 'Origin';
  }

  return headers;
}

function jsonResponse(data: any, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
  });
}

function errorResponse(
  message: string,
  status = 400,
  extraHeaders: Record<string, string> = {},
  requestId?: string
): Response {
  const reqId =
    requestId ||
    extraHeaders['x-correlation-id'] ||
    extraHeaders['x-request-id'] ||
    `worker-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

  let safeMessage = message;
  let finalStatus = status;

  // Use the centralized operational error verifier to reject all database and infrastructure leaks
  const isOperational = isOperationalError({ message, status: finalStatus, statusCode: finalStatus });
  const isInternal = finalStatus >= 500 || !isOperational;

  if (isInternal) {
    if (finalStatus < 500) {
      finalStatus = 500;
    }
    console.error(`[Internal Error Sanitized][${reqId}]:`, message);
    safeMessage = 'An unexpected internal server error occurred. Please contact support with your Request ID.';
  }

  return new Response(
    JSON.stringify({
      error: safeMessage,
      requestId: reqId,
      ...(finalStatus >= 500 ? { code: 'INTERNAL_ERROR' } : {}),
    }),
    {
      status: finalStatus,
      headers: {
        'Content-Type': 'application/json',
        'x-correlation-id': reqId,
        ...extraHeaders,
      },
    }
  );
}

function parseRoute(pattern: string, pathname: string): Record<string, string> | null {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = pathname.split('/').filter(Boolean);

  if (patternParts.length !== pathParts.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(':')) {
      params[patternParts[i].slice(1)] = decodeURIComponent(pathParts[i]);
    } else if (patternParts[i] !== pathParts[i]) {
      return null;
    }
  }
  return params;
}

async function authenticateWorkerRequest(
  request: Request,
  env: Env,
  cors: Record<string, string>
): Promise<{
  authenticated: boolean;
  user?: any;
  jwtPayload?: AppJWTPayload;
  errorResponse?: Response;
}> {
  const authHeader = request.headers.get('Authorization');
  let token = '';

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  }

  // Fallback to HttpOnly session cookie
  if (!token) {
    const rawCookie = request.headers.get('Cookie');
    if (rawCookie) {
      token = parseCookie(rawCookie, AUTH_COOKIE_NAME) || '';
    }
  }

  if (!token) {
    return {
      authenticated: false,
      errorResponse: errorResponse('Unauthenticated: Missing or invalid Authorization header or session cookie', 401, cors),
    };
  }

  const orgHeader = request.headers.get('x-organization-id') || undefined;
  const result = await resolveAuthToken(token, env, orgHeader);

  if (result.authenticated && result.user) {
    return { authenticated: true, user: result.user, jwtPayload: result.jwtPayload };
  }

  if (result.error === 'CONFIG_ERROR') {
    console.error('[Worker Auth Config Error]', result.errorMessage);
    return {
      authenticated: false,
      errorResponse: errorResponse(`Server Configuration Error: ${result.errorMessage}`, 500, cors),
    };
  }

  if (result.error === 'USER_NOT_FOUND') {
    return {
      authenticated: false,
      errorResponse: errorResponse('Unauthenticated: User no longer exists', 401, cors),
    };
  }

  return {
    authenticated: false,
    errorResponse: errorResponse('Unauthenticated: Invalid or expired token', 401, cors),
  };
}

/**
 * Optional authentication helper for Cloudflare Worker public endpoints.
 * Understands both App JWT and Supabase JWT tokens.
 * - If a valid Bearer token is provided, returns { authenticated: true, user, jwtPayload }.
 * - If no Authorization header or an invalid token is provided, returns { authenticated: false }.
 */
async function authenticateOptionalJWT(
  request: Request,
  env: Env
): Promise<{
  authenticated: boolean;
  user?: any;
  jwtPayload?: AppJWTPayload;
}> {
  const authHeader = request.headers.get('Authorization');
  let token = '';

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  }

  // Fallback to HttpOnly session cookie
  if (!token) {
    const rawCookie = request.headers.get('Cookie');
    if (rawCookie) {
      token = parseCookie(rawCookie, AUTH_COOKIE_NAME) || '';
    }
  }

  if (!token) {
    return { authenticated: false };
  }

  try {
    const orgHeader = request.headers.get('x-organization-id') || undefined;
    const result = await resolveAuthToken(token, env, orgHeader);
    if (result.authenticated && result.user) {
      return {
        authenticated: true,
        user: result.user,
        jwtPayload: result.jwtPayload,
      };
    }
  } catch {
    // Ignore optional auth errors and proceed as unauthenticated
  }

  return { authenticated: false };
}

export default {
  async fetch(request: Request, env: Env, ctx?: any): Promise<Response> {
    const response = await this.handleFetch(request, env, ctx);
    return applySecurityHeadersToResponse(response, {
      isProduction: env.NODE_ENV === 'production',
      isHttps: request.url.startsWith('https://') || env.NODE_ENV === 'production',
    });
  },

  async handleFetch(request: Request, env: Env, _ctx?: any): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method.toUpperCase();
    const cors = corsHeaders(request, env);

    // Handle CORS preflight OPTIONS requests
    if (method === 'OPTIONS') {
      const reqOrigin = request.headers.get('Origin');
      if (reqOrigin && !isAllowedOrigin(reqOrigin, request.url, env)) {
        return new Response('CORS origin forbidden', {
          status: 403,
          headers: { 'Content-Type': 'text/plain' },
        });
      }
      return new Response(null, {
        status: 204,
        headers: cors,
      });
    }

    // Production security guard
    if (env.NODE_ENV === 'production' && env.ALLOW_MOCK_AUTH === 'true') {
      return errorResponse('Production security violation: ALLOW_MOCK_AUTH is strictly forbidden in production', 500, cors);
    }

    try {
      // Redirect non-API accept-invite route to frontend app if hit on API worker
      if (pathname === '/accept-invite' && method === 'GET') {
        const frontendBaseUrl = getFrontendBaseUrl(env, request);
        const redirectTarget = `${frontendBaseUrl}/accept-invite${url.search}`;
        return Response.redirect(redirectTarget, 302);
      }

      // Serve canonical robots.txt if requested on edge worker
      if (pathname === '/robots.txt' && method === 'GET') {
        const robotsContent = `User-agent: *
Allow: /

Disallow: /login
Disallow: /create-organization
Disallow: /theme-setup
Disallow: /developer
Disallow: /admin
Disallow: /studio
Disallow: /events
Disallow: /game-themes
Disallow: /team
Disallow: /wallet
Disallow: /accept-invite
Disallow: /play/
Disallow: /e/
Disallow: /preview/
Disallow: /api/

Sitemap: https://eventgamestudio.com/sitemap.xml
`;
        return new Response(robotsContent, {
          status: 200,
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'public, max-age=86400',
            ...cors,
          },
        });
      }

      // Serve canonical sitemap.xml if requested on edge worker
      if (pathname === '/sitemap.xml' && method === 'GET') {
        const sitemapContent = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://eventgamestudio.com/</loc>
    <lastmod>2026-09-28</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://eventgamestudio.com/interactive-event-games</loc>
    <lastmod>2026-09-28</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://eventgamestudio.com/corporate-event-games</loc>
    <lastmod>2026-09-28</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://eventgamestudio.com/brand-activation-games</loc>
    <lastmod>2026-09-28</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://eventgamestudio.com/event-mini-games</loc>
    <lastmod>2026-09-28</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://eventgamestudio.com/roadshow-games</loc>
    <lastmod>2026-09-28</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://eventgamestudio.com/exhibition-games</loc>
    <lastmod>2026-09-28</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://eventgamestudio.com/branded-event-games</loc>
    <lastmod>2026-09-28</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://eventgamestudio.com/digital-event-games</loc>
    <lastmod>2026-09-28</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://eventgamestudio.com/game-showcase</loc>
    <lastmod>2026-09-28</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://eventgamestudio.com/game-showcase/catch-the-brand</loc>
    <lastmod>2026-09-28</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://eventgamestudio.com/game-showcase/memory-match</loc>
    <lastmod>2026-09-28</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://eventgamestudio.com/game-showcase/reaction-challenge</loc>
    <lastmod>2026-09-28</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://eventgamestudio.com/showcase</loc>
    <lastmod>2026-09-28</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://eventgamestudio.com/contact</loc>
    <lastmod>2026-09-28</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
</urlset>`;
        return new Response(sitemapContent, {
          status: 200,
          headers: {
            'Content-Type': 'application/xml; charset=utf-8',
            'Cache-Control': 'public, max-age=86400',
            ...cors,
          },
        });
      }

      // If the request is not an API route and env.ASSETS is available, delegate to Cloudflare Assets with SPA fallback
      if (!pathname.startsWith('/api') && env.ASSETS && typeof env.ASSETS.fetch === 'function') {
        let assetResponse = await env.ASSETS.fetch(request);
        if (assetResponse.status !== 404) {
          return assetResponse;
        }

        // If the request was prefixed with /public (e.g. /public/assets/background.png), try stripping /public
        if (pathname.startsWith('/public/')) {
          const unaliasedUrl = new URL(request.url);
          unaliasedUrl.pathname = pathname.replace(/^\/public/, '');
          assetResponse = await env.ASSETS.fetch(new Request(unaliasedUrl.toString(), request));
          if (assetResponse.status !== 404) {
            return assetResponse;
          }
        }

        // Do not return SPA index.html for static assets (images, stylesheets, fonts, audio)
        const isStaticFile = /\.(png|jpe?g|gif|svg|ico|webp|avif|css|js|map|json|woff2?|ttf|otf|mp3|wav|ogg)$/i.test(pathname);
        if (isStaticFile) {
          return new Response('Asset not found', { status: 404, headers: cors });
        }

        // Fallback for client-side SPA routing (e.g. /developer, /events, /studio, /e/:token)
        const spaUrl = new URL(request.url);
        spaUrl.pathname = '/index.html';
        return await env.ASSETS.fetch(new Request(spaUrl.toString(), request));
      }

      // ==========================================
      // Rate Limiting Enforcement on API Routes (Cloudflare Distributed Edge + Sliding Window)
      // ==========================================
      // A. Public Event & Leaderboard Read Rate Limiting (GET /api/public/events/*)
      if (pathname.startsWith('/api/public/events/') && method === 'GET') {
        const isScoresRead = pathname.endsWith('/high-scores');
        const readLimit = await checkWorkerRateLimitWithCloudflare(request, {
          windowMs: 60 * 1000,
          max: 60,
          venueAllowanceMax: 180,
          isVenueRequest,
          keyPrefix: isScoresRead ? 'worker_public_scores_get' : 'worker_public_event_get',
          cloudflareBinding: isScoresRead ? 'SCORE_RATE_LIMITER' : 'PUBLIC_RATE_LIMITER',
          message: isScoresRead
            ? 'Leaderboard lookup rate limit reached. Please wait a moment before refreshing scores.'
            : 'Public event lookup rate limit reached. Please wait a moment before trying again.',
        }, env);
        if (!readLimit.allowed) {
          return jsonResponse(readLimit.errorResponse, 429, { ...cors, ...readLimit.headers });
        }
      }

      // B. Mutating API Routes Rate Limiting (POST, PUT, PATCH, DELETE)
      if (pathname.startsWith('/api') && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        // 0. Payment Webhook Exception (POST /api/webhooks/*, POST /api/wallet/webhooks/*)
        // Authenticated via cryptographic HMAC signatures. Exempt from client IP limits to prevent webhook drops.
        if (pathname.includes('/webhooks')) {
          // Bypasses IP-based rate limiting to proceed to cryptographic signature verification
        }

        // 1. Auth Rate Limiting (POST /api/auth/google, POST /api/auth/*)
        else if (pathname.startsWith('/api/auth/')) {
          const authLimit = await checkWorkerRateLimitWithCloudflare(request, {
            windowMs: 60 * 1000,
            max: 10,
            keyPrefix: 'worker_auth',
            cloudflareBinding: 'AUTH_RATE_LIMITER',
            message: 'Too many authentication attempts. Please wait 1 minute before trying again.',
          }, env);
          if (!authLimit.allowed) {
            return jsonResponse(authLimit.errorResponse, 429, { ...cors, ...authLimit.headers });
          }
        }

        // 2. Invitation Rate Limiting (POST /api/invitations/*, POST /api/organizations/:id/invitations)
        else if (pathname.startsWith('/api/invitations') || pathname.includes('/invitations')) {
          const inviteLimit = await checkWorkerRateLimitWithCloudflare(request, {
            windowMs: 60 * 1000,
            max: 15,
            keyPrefix: 'worker_invitations',
            message: 'Too many invitations sent in a short period. Please wait a moment before sending more.',
          }, env);
          if (!inviteLimit.allowed) {
            return jsonResponse(inviteLimit.errorResponse, 429, { ...cors, ...inviteLimit.headers });
          }
        }

        // 3. Organization Creation Rate Limiting (POST /api/organizations)
        else if (pathname === '/api/organizations' && method === 'POST') {
          const orgLimit = await checkWorkerRateLimitWithCloudflare(request, {
            windowMs: 60 * 1000,
            max: 10,
            keyPrefix: 'worker_org_creation',
            cloudflareBinding: 'ORG_RATE_LIMITER',
            message: 'Organization creation rate limit exceeded. Please wait a minute before creating another organization.',
          }, env);
          if (!orgLimit.allowed) {
            return jsonResponse(orgLimit.errorResponse, 429, { ...cors, ...orgLimit.headers });
          }
        }

        // 4. Wallet & Financial Rate Limiting (POST /api/organizations/:id/wallet/*)
        else if (pathname.includes('/wallet/')) {
          const walletLimit = await checkWorkerRateLimitWithCloudflare(request, {
            windowMs: 60 * 1000,
            max: 15,
            keyPrefix: 'worker_wallet',
            cloudflareBinding: 'WALLET_RATE_LIMITER',
            message: 'Wallet transaction rate limit exceeded. Please wait a moment before processing another payment or top-up.',
          }, env);
          if (!walletLimit.allowed) {
            return jsonResponse(walletLimit.errorResponse, 429, { ...cors, ...walletLimit.headers });
          }
        }

        // 5. Showcase Rate Limiting (POST/PATCH/DELETE /api/events/:id/showcase/*)
        else if (pathname.includes('/showcase')) {
          const showcaseLimit = await checkWorkerRateLimitWithCloudflare(request, {
            windowMs: 60 * 1000,
            max: 30,
            keyPrefix: 'worker_showcase',
            message: 'Showcase action rate limit reached. Please slow down and try again shortly.',
          }, env);
          if (!showcaseLimit.allowed) {
            return jsonResponse(showcaseLimit.errorResponse, 429, { ...cors, ...showcaseLimit.headers });
          }
        }

        // 6. Upload Rate Limiting (POST /api/upload/*, direct-upload, upload-url)
        else if (pathname.startsWith('/api/upload') || pathname.includes('upload')) {
          const uploadLimit = await checkWorkerRateLimitWithCloudflare(request, {
            windowMs: 60 * 1000,
            max: 20,
            keyPrefix: 'worker_uploads',
            message: 'File upload rate limit reached. Please wait a moment before uploading more files.',
          }, env);
          if (!uploadLimit.allowed) {
            return jsonResponse(uploadLimit.errorResponse, 429, { ...cors, ...uploadLimit.headers });
          }
        }

        // 7. High Scores Rate Limiting (POST /api/events/:id/high-scores, POST /api/public/events/:token/high-scores)
        else if (pathname.includes('/high-scores') && method === 'POST') {
          const scoreLimit = await checkWorkerRateLimitWithCloudflare(request, {
            windowMs: 60 * 1000,
            max: 300, // Sized generously (300/min per IP, ~5/sec) so shared venue Wi-Fi does not choke tournament gameplay
            keyPrefix: 'worker_high_scores',
            cloudflareBinding: 'SCORE_RATE_LIMITER',
            message: 'Too many score submissions. Please wait a moment before submitting another score.',
          }, env);
          if (!scoreLimit.allowed) {
            return jsonResponse(scoreLimit.errorResponse, 429, { ...cors, ...scoreLimit.headers });
          }
        }

        // 7B. Event Creation Rate Limiting (POST /api/events) - Max 3 attempts per 10 minutes per organization
        else if (pathname === '/api/events' && method === 'POST') {
          const creationLimit = await checkWorkerRateLimitWithCloudflare(request, {
            windowMs: 10 * 60 * 1000,
            max: 3,
            keyPrefix: 'worker_event_creation',
            message: 'Event creation rate limit exceeded: Maximum 3 event creation attempts per 10 minutes per organization.',
          }, env);
          if (!creationLimit.allowed) {
            return jsonResponse(creationLimit.errorResponse, 429, { ...cors, ...creationLimit.headers });
          }
        }

        // 8. Event Mutation Rate Limiting (POST /api/events/quote, /cancel, etc.)
        else if (pathname.startsWith('/api/events')) {
          const eventLimit = await checkWorkerRateLimitWithCloudflare(request, {
            windowMs: 60 * 1000,
            max: 20,
            keyPrefix: 'worker_events',
            message: 'Event creation and modification rate limit exceeded. Please slow down.',
          }, env);
          if (!eventLimit.allowed) {
            return jsonResponse(eventLimit.errorResponse, 429, { ...cors, ...eventLimit.headers });
          }
        }

        // 9. General API fallback rate limiting for any other mutating route
        else {
          const generalLimit = await checkWorkerRateLimitWithCloudflare(request, {
            windowMs: 60 * 1000,
            max: 120,
            keyPrefix: 'worker_general_api',
            cloudflareBinding: 'RATE_LIMITER',
            message: 'API request rate limit exceeded. Please try again in a few seconds.',
          }, env);
          if (!generalLimit.allowed) {
            return jsonResponse(generalLimit.errorResponse, 429, { ...cors, ...generalLimit.headers });
          }
        }
      }

      // ==========================================
      // 1. Config Route
      // ==========================================
      if (pathname === '/api/config' && method === 'GET') {
        const googleClientId =
          env.VITE_GOOGLE_CLIENT_ID ||
          env.GOOGLE_CLIENT_ID ||
          (typeof process !== 'undefined' ? (process.env.VITE_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID) : '') ||
          '';

        const supabaseUrl =
          env.VITE_SUPABASE_URL ||
          env.SUPABASE_URL ||
          (typeof process !== 'undefined' ? (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL) : '') ||
          '';

        const supabaseAnonKey =
          env.VITE_SUPABASE_ANON_KEY ||
          (typeof process !== 'undefined' ? process.env.VITE_SUPABASE_ANON_KEY : '') ||
          '';

        return jsonResponse(
          {
            googleClientId,
            supabaseUrl,
            supabaseAnonKey,
          },
          200,
          cors
        );
      }

      // ==========================================
      // 2. Auth Routes
      // ==========================================
      if (pathname === '/api/auth/google' && method === 'POST') {
        const correlationId =
          request.headers.get('x-correlation-id') ||
          request.headers.get('x-request-id') ||
          crypto.randomUUID();

        const body = (await request.json().catch(() => ({}))) as any;
        const { idToken } = body;
        if (!idToken) {
          return errorResponse('Missing idToken', 422, { ...cors, 'x-correlation-id': correlationId });
        }

        let stage = 'GOOGLE_TOKEN_VERIFY';
        try {
          stage = 'GOOGLE_TOKEN_VERIFY';
          const googleUser = await verifyGoogleIdToken(idToken, env);

          stage = 'GOOGLE_USER_UPSERT';
          const user = await upsertGoogleUser(googleUser, env, { correlationId });

          if (!user) {
            console.error(`[Google Auth Error][${correlationId}] GOOGLE_USER_NOT_FOUND: Failed to create or load user record`);
            return errorResponse('Google authentication failed', 401, { ...cors, 'x-correlation-id': correlationId });
          }

          stage = 'GOOGLE_LOAD_MEMBERSHIPS';
          let memberships: any[] = [];
          try {
            memberships = await getUserOrganizations(user.id, env);
          } catch (memErr: any) {
            console.warn(`[Google Auth][${correlationId}] GOOGLE_MEMBERSHIPS_LOAD_WARNING:`, memErr?.message);
            memberships = [];
          }

          let activeOrgId: string | undefined = undefined;
          let activeRole: string | undefined = undefined;

          if (memberships.length > 0) {
            activeOrgId = memberships[0].id;
            activeRole = memberships[0].role;
          }

          stage = 'GOOGLE_SIGN_TOKEN';
          const token = await signAppToken(user.id, activeOrgId, activeRole as any, undefined, env);
          const authCookie = buildAuthCookie(token, getWorkerCookieOptions(request, env));

          return jsonResponse(
            {
              token,
              user: {
                id: user.id,
                email: user.email,
                name: user.name,
                avatar_url: user.avatar_url,
                is_developer: user.is_developer === true,
              },
              organizations: memberships,
              activeOrganizationId: activeOrgId || null,
            },
            200,
            { ...cors, 'x-correlation-id': correlationId, 'Set-Cookie': authCookie }
          );
        } catch (err: any) {
          const stageTag =
            stage === 'GOOGLE_TOKEN_VERIFY'
              ? 'GOOGLE_TOKEN_VERIFICATION_FAILED'
              : stage === 'GOOGLE_USER_UPSERT'
              ? 'GOOGLE_USER_CREATE_FAILED'
              : stage === 'GOOGLE_SIGN_TOKEN'
              ? 'GOOGLE_TOKEN_SIGNING_FAILED'
              : 'GOOGLE_AUTH_FAILED';

          console.error(`[Google Auth Error][${correlationId}] ${stageTag}: Details:`, {
            stage,
            message: err?.message,
            stack: err?.stack,
            code: err?.code,
            details: err?.details,
            hint: err?.hint,
          });
          return errorResponse('Google authentication failed', 401, { ...cors, 'x-correlation-id': correlationId });
        }
      }

            // ==========================================
      // Email / Password Registration & Verification Routes
      // ==========================================
      if (pathname === '/api/auth/register' && method === 'POST') {
        const correlationId =
          request.headers.get('x-correlation-id') ||
          request.headers.get('x-request-id') ||
          crypto.randomUUID();

        try {
          const body = (await request.json().catch(() => ({}))) as any;
          const { email, password, confirmPassword } = body;

          const emailValidation = validateEmail(email);
          if (!emailValidation.valid) {
            return jsonResponse({ error: emailValidation.error || 'Please enter a valid email address' }, 422, cors);
          }

          const passwordValidation = validatePassword(password);
          if (!passwordValidation.valid) {
            return jsonResponse({ error: passwordValidation.error || 'Password does not meet requirements' }, 422, cors);
          }

          if (!confirmPassword || password !== confirmPassword) {
            return jsonResponse({ error: 'Passwords do not match' }, 422, cors);
          }

          // Step 1: Detect missing email configuration before creating unverified user
          const isConfigured = await isEmailServiceConfigured(env);
          if (!isConfigured) {
            console.warn(`[AUTH][${correlationId}] Registration rejected: email sending service is not configured`);
            return jsonResponse(
              { error: 'Email verification is currently unavailable. Please contact the administrator.' },
              503,
              { ...cors, 'x-correlation-id': correlationId }
            );
          }

          const normalizedEmail = emailValidation.normalized;

          const existingUser = await getUserByEmail(normalizedEmail, env);
          if (existingUser) {
            if (existingUser.password_hash) {
              return jsonResponse({ error: 'An account with this email address already exists. Please log in or reset your password.' }, 409, cors);
            }
            if (existingUser.google_id) {
              return jsonResponse({ error: 'An account with this email was created using Google Sign-In. Please sign in with Google or reset your password.' }, 409, cors);
            }
          }

          const passwordHash = await hashPassword(password);
          const { rawToken, tokenHash, expiresAt } = generateVerificationToken(24);

          const user = await createUser(
            {
              email: normalizedEmail,
              name: normalizedEmail.split('@')[0] || 'User',
              password_hash: passwordHash,
              email_verified: false,
              verification_token_hash: tokenHash,
              verification_token_expires_at: expiresAt,
            },
            env
          );

          // Step 2: Await verification email delivery
          const emailResult = await sendVerificationEmail({
            email: normalizedEmail,
            rawToken,
            env,
            request,
            correlationId,
          });

          if (!emailResult.success) {
            // Safe transactional rollback of newly created unverified user
            try {
              await deleteUser(user.id, env);
              console.log(`[AUTH][${correlationId}] Rolled back newly created user ${user.id} due to email dispatch failure.`);
            } catch (rollbackErr: any) {
              console.error(`[AUTH][${correlationId}] Rollback failed for user ${user.id}:`, rollbackErr?.message);
            }

            if (emailResult.status === 'EMAIL_NOT_CONFIGURED') {
              return jsonResponse(
                { error: 'Email verification is currently unavailable. Please contact the administrator.' },
                503,
                { ...cors, 'x-correlation-id': correlationId }
              );
            }

            return jsonResponse(
              { error: "We couldn't send the verification email right now. Please try again later." },
              503,
              { ...cors, 'x-correlation-id': correlationId }
            );
          }

          return jsonResponse(
            {
              success: true,
              message: 'Account created. Please check your email and click the verification link to continue.',
              email: normalizedEmail,
            },
            201,
            { ...cors, 'x-correlation-id': correlationId }
          );
        } catch (err: any) {
          return handleWorkerApiError(err, request, cors, env, { endpoint: pathname, method });
        }
      }

      if (pathname === '/api/auth/login' && method === 'POST') {
        const correlationId =
          request.headers.get('x-correlation-id') ||
          request.headers.get('x-request-id') ||
          crypto.randomUUID();

        try {
          const body = (await request.json().catch(() => ({}))) as any;
          const { email, password } = body;

          const emailValidation = validateEmail(email);
          if (!emailValidation.valid) {
            return jsonResponse({ error: 'Valid email address is required' }, 422, cors);
          }
          if (!password || typeof password !== 'string') {
            return jsonResponse({ error: 'Password is required' }, 422, cors);
          }

          const normalizedEmail = emailValidation.normalized;
          const user = await getUserByEmail(normalizedEmail, env);

          if (!user) {
            return jsonResponse({ error: 'Invalid email or password' }, 401, cors);
          }

          if (!user.password_hash) {
            if (user.google_id) {
              return jsonResponse({ error: 'This account was created using Google Sign-In. Please sign in with Google.' }, 401, cors);
            }
            return jsonResponse({ error: 'Invalid email or password' }, 401, cors);
          }

          const isMatch = await verifyPassword(password, user.password_hash);
          if (!isMatch) {
            return jsonResponse({ error: 'Invalid email or password' }, 401, cors);
          }

          if (!user.email_verified && !user.google_id) {
            return jsonResponse(
              {
                error: 'Please verify your email before continuing.',
                code: 'EMAIL_NOT_VERIFIED',
                email: user.email,
              },
              403,
              cors
            );
          }

          let memberships: any[] = [];
          try {
            memberships = await getUserOrganizations(user.id, env);
          } catch {
            memberships = [];
          }

          let activeOrgId: string | undefined = undefined;
          let activeRole: string | undefined = undefined;

          if (memberships.length > 0) {
            activeOrgId = memberships[0].id;
            activeRole = memberships[0].role;
          }

          const token = await signAppToken(user.id, activeOrgId, activeRole as any, undefined, env);
          const authCookie = buildAuthCookie(token, getWorkerCookieOptions(request, env));

          return jsonResponse(
            {
              token,
              user: {
                id: user.id,
                email: user.email,
                name: user.name,
                avatar_url: user.avatar_url,
                is_developer: user.is_developer === true,
              },
              organizations: memberships,
              activeOrganizationId: activeOrgId || null,
            },
            200,
            { ...cors, 'x-correlation-id': correlationId, 'Set-Cookie': authCookie }
          );
        } catch (err: any) {
          return handleWorkerApiError(err, request, cors, env, { endpoint: pathname, method });
        }
      }

      if (pathname === '/api/auth/verify-email' && method === 'POST') {
        const correlationId =
          request.headers.get('x-correlation-id') ||
          request.headers.get('x-request-id') ||
          crypto.randomUUID();

        try {
          const body = (await request.json().catch(() => ({}))) as any;
          const { token } = body;

          if (!token || typeof token !== 'string' || !token.trim()) {
            return jsonResponse({ error: 'Verification token is required' }, 422, cors);
          }

          const tokenHash = hashToken(token.trim());
          const user = await getUserByVerificationToken(tokenHash, env);

          if (!user) {
            return jsonResponse(
              {
                error: 'This verification link is invalid or has already been used.',
                code: 'INVALID_TOKEN',
              },
              400,
              cors
            );
          }

          if (user.verification_token_expires_at && new Date(user.verification_token_expires_at) < new Date()) {
            return jsonResponse(
              {
                error: 'This verification link has expired. Please request a new verification email.',
                code: 'EXPIRED_TOKEN',
                email: user.email,
              },
              400,
              cors
            );
          }

          const verifiedUser = await verifyUserEmail(user.id, env);

          let memberships: any[] = [];
          try {
            memberships = await getUserOrganizations(verifiedUser.id, env);
          } catch {
            memberships = [];
          }

          let activeOrgId: string | undefined = undefined;
          let activeRole: string | undefined = undefined;
          if (memberships.length > 0) {
            activeOrgId = memberships[0].id;
            activeRole = memberships[0].role;
          }

          const sessionToken = await signAppToken(verifiedUser.id, activeOrgId, activeRole as any, undefined, env);
          const authCookie = buildAuthCookie(sessionToken, getWorkerCookieOptions(request, env));

          return jsonResponse(
            {
              success: true,
              message: 'Email verified successfully! You can now access your account.',
              token: sessionToken,
              user: {
                id: verifiedUser.id,
                email: verifiedUser.email,
                name: verifiedUser.name,
                avatar_url: verifiedUser.avatar_url,
                is_developer: verifiedUser.is_developer === true,
              },
              organizations: memberships,
              activeOrganizationId: activeOrgId || null,
            },
            200,
            { ...cors, 'x-correlation-id': correlationId, 'Set-Cookie': authCookie }
          );
        } catch (err: any) {
          return handleWorkerApiError(err, request, cors, env, { endpoint: pathname, method });
        }
      }

      if (pathname === '/api/auth/resend-verification' && method === 'POST') {
        const rateLimitResult = await checkWorkerRateLimitWithCloudflare(request, WORKER_RESEND_RATE_LIMIT, env);
        if (!rateLimitResult.allowed) {
          return new Response(JSON.stringify(rateLimitResult.errorResponse), {
            status: 429,
            headers: { 'Content-Type': 'application/json', ...cors, ...rateLimitResult.headers },
          });
        }

        const correlationId =
          request.headers.get('x-correlation-id') ||
          request.headers.get('x-request-id') ||
          crypto.randomUUID();

        try {
          const body = (await request.json().catch(() => ({}))) as any;
          const { email } = body;

          const emailValidation = validateEmail(email);
          if (!emailValidation.valid) {
            return jsonResponse({ error: 'Valid email address is required' }, 422, cors);
          }

          // Fail-fast if email sending service is not configured (preserves anti-enumeration by failing uniformly)
          const isConfigured = await isEmailServiceConfigured(env);
          if (!isConfigured) {
            console.warn(`[AUTH][${correlationId}] Resend verification rejected: email sending service is not configured`);
            return jsonResponse(
              { error: 'Email verification is currently unavailable. Please contact the administrator.' },
              503,
              { ...cors, 'x-correlation-id': correlationId }
            );
          }

          const normalizedEmail = emailValidation.normalized;
          const user = await getUserByEmail(normalizedEmail, env);

          // Prevent account enumeration: always return 200 with generic message for non-existent or Google-only accounts
          if (!user || (user.google_id && !user.password_hash)) {
            return jsonResponse(
              {
                success: true,
                message: 'If an account requires email verification, a verification email has been sent.',
              },
              200,
              cors
            );
          }

          // If already verified, do not send another email; gracefully direct user toward login
          if (user.email_verified) {
            return jsonResponse(
              {
                success: true,
                already_verified: true,
                message: 'This email is already verified. Please sign in to your account.',
              },
              200,
              cors
            );
          }

          const { rawToken, tokenHash, expiresAt } = generateVerificationToken(24);
          await updateUserVerificationToken(user.id, tokenHash, expiresAt, env);

          const emailResult = await sendVerificationEmail({
            email: normalizedEmail,
            rawToken,
            env,
            request,
            correlationId,
          });

          if (!emailResult.success) {
            console.error(`[AUTH][${correlationId}] Failed to resend verification email:`, emailResult.rawError || emailResult.error);
            if (emailResult.status === 'EMAIL_NOT_CONFIGURED') {
              return jsonResponse(
                { error: 'Email verification is currently unavailable. Please contact the administrator.' },
                503,
                { ...cors, 'x-correlation-id': correlationId }
              );
            }
            return jsonResponse(
              { error: "We couldn't send the verification email. Please try again." },
              503,
              { ...cors, 'x-correlation-id': correlationId }
            );
          }

          return jsonResponse(
            {
              success: true,
              message: 'If an account requires email verification, a verification email has been sent.',
            },
            200,
            cors
          );
        } catch (err: any) {
          return handleWorkerApiError(err, request, cors, env, { endpoint: pathname, method });
        }
      }

      if (pathname === '/api/auth/forgot-password' && method === 'POST') {
        const correlationId =
          request.headers.get('x-correlation-id') ||
          request.headers.get('x-request-id') ||
          crypto.randomUUID();

        try {
          const body = (await request.json().catch(() => ({}))) as any;
          const { email } = body;

          const emailValidation = validateEmail(email);
          if (!emailValidation.valid) {
            return jsonResponse({ error: 'Valid email address is required' }, 422, cors);
          }

          // Fail-fast if email sending service is not configured (preserves anti-enumeration by failing uniformly)
          const isConfigured = await isEmailServiceConfigured(env);
          if (!isConfigured) {
            console.warn(`[AUTH][${correlationId}] Forgot password rejected: email sending service is not configured`);
            return jsonResponse(
              { error: 'Email service is currently unavailable. Please contact the administrator.' },
              503,
              { ...cors, 'x-correlation-id': correlationId }
            );
          }

          const normalizedEmail = emailValidation.normalized;
          const user = await getUserByEmail(normalizedEmail, env);

          if (user && user.password_hash) {
            const { rawToken, tokenHash, expiresAt } = generatePasswordResetToken(1);
            await updateUserPasswordResetToken(user.id, tokenHash, expiresAt, env);

            const emailResult = await sendPasswordResetEmail({
              email: normalizedEmail,
              rawToken,
              env,
              request,
              correlationId,
            });

            if (!emailResult.success) {
              console.error(`[AUTH][${correlationId}] Failed to send password reset email:`, emailResult.rawError || emailResult.error);
              return jsonResponse(
                { error: "We couldn't send the password reset email right now. Please try again later." },
                503,
                { ...cors, 'x-correlation-id': correlationId }
              );
            }
          }

          return jsonResponse(
            {
              success: true,
              message: 'If an account with that email exists, a password reset link has been sent.',
            },
            200,
            cors
          );
        } catch (err: any) {
          return handleWorkerApiError(err, request, cors, env, { endpoint: pathname, method });
        }
      }

      if (pathname === '/api/auth/reset-password' && method === 'POST') {
        try {
          const body = (await request.json().catch(() => ({}))) as any;
          const { token, password, confirmPassword } = body;

          if (!token || typeof token !== 'string' || !token.trim()) {
            return jsonResponse({ error: 'Reset token is required' }, 422, cors);
          }

          const passwordValidation = validatePassword(password);
          if (!passwordValidation.valid) {
            return jsonResponse({ error: passwordValidation.error || 'Password does not meet requirements' }, 422, cors);
          }

          if (!confirmPassword || password !== confirmPassword) {
            return jsonResponse({ error: 'Passwords do not match' }, 422, cors);
          }

          const tokenHash = hashToken(token.trim());
          const user = await getUserByPasswordResetToken(tokenHash, env);

          if (!user) {
            return jsonResponse(
              {
                error: 'This password reset link is invalid or has already been used.',
                code: 'INVALID_RESET_TOKEN',
              },
              400,
              cors
            );
          }

          if (user.password_reset_expires_at && new Date(user.password_reset_expires_at) < new Date()) {
            return jsonResponse(
              {
                error: 'This password reset link has expired. Please request a new password reset.',
                code: 'EXPIRED_RESET_TOKEN',
              },
              400,
              cors
            );
          }

          const newPasswordHash = await hashPassword(password);
          await setUserPassword(user.id, newPasswordHash, env);

          return jsonResponse(
            {
              success: true,
              message: 'Password has been reset successfully. Please log in with your new password.',
            },
            200,
            cors
          );
        } catch (err: any) {
          return handleWorkerApiError(err, request, cors, env, { endpoint: pathname, method });
        }
      }



      if (pathname === '/api/auth/me' && method === 'GET') {
        const correlationId =
          request.headers.get('x-correlation-id') ||
          request.headers.get('x-request-id') ||
          crypto.randomUUID();

        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const user = auth.user!;
        const payload = auth.jwtPayload!;

        try {
          const memberships = await getUserOrganizations(user.id, env);
          let activeOrgId = payload.organizationId;
          let activeMember = memberships.find((m) => m.id === activeOrgId);

          if (!activeMember && memberships.length > 0) {
            activeOrgId = memberships[0].id;
            activeMember = memberships[0];
          }

          return jsonResponse(
            {
              user: {
                id: user.id,
                email: user.email,
                name: user.name,
                avatar_url: user.avatar_url,
                is_developer: user.is_developer === true,
              },
              organizations: memberships,
              activeOrganization: activeMember
                ? {
                    id: activeMember.id,
                    name: activeMember.name,
                    slug: activeMember.slug,
                    role: activeMember.role,
                    logo_url: activeMember.logo_url,
                    country_code: activeMember.country_code || null,
                  }
                : null,
            },
            200,
            { ...cors, 'x-correlation-id': correlationId }
          );
        } catch (err: any) {
          console.error(`[Auth /me error][${correlationId}]`, err);
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      if (pathname === '/api/auth/switch-org' && method === 'POST') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const user = auth.user!;
        const body = (await request.json().catch(() => ({}))) as any;
        const { organizationId } = body;

        if (!organizationId) {
          return errorResponse('organizationId is required', 422, cors);
        }

        const { isMember, role } = await verifyOrgMembershipAndPermission(user.id, organizationId, undefined, env);
        if (!isMember) {
          return errorResponse('You are not a member of this organization', 403, cors);
        }

        const org = await getOrganizationById(organizationId, env);
        if (!org) {
          return errorResponse('Organization not found', 404, cors);
        }

        const memberships = await getUserOrganizations(user.id, env);
        const newToken = await signAppToken(user.id, organizationId, role, undefined, env);
        const authCookie = buildAuthCookie(newToken, getWorkerCookieOptions(request, env));
        return jsonResponse(
          {
            token: newToken,
            activeOrganization: {
              id: org.id,
              name: org.name,
              slug: org.slug,
              role,
              logo_url: org.logo_url,
              country_code: org.country_code || null,
            },
            organizations: memberships,
          },
          200,
          { ...cors, 'Set-Cookie': authCookie }
        );
      }

      if (pathname === '/api/auth/logout' && method === 'POST') {
        const clearCookie = buildClearAuthCookie(getWorkerCookieOptions(request, env));
        return jsonResponse(
          { success: true, message: 'Logged out successfully' },
          200,
          { ...cors, 'Set-Cookie': clearCookie }
        );
      }

      // ==========================================
      // Profile Routes (Privilege Escalation Protected)
      // ==========================================
      if ((pathname === '/api/auth/profile' || pathname === '/api/user/profile') && (method === 'PATCH' || method === 'PUT')) {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const user = auth.user!;
        const body = (await request.json().catch(() => ({}))) as any;

        // Strictly block any privilege escalation attempts
        const forbiddenFields = ['is_developer', 'is_admin', 'role', 'email', 'id', 'created_at', 'updated_at', 'google_id'];
        for (const field of forbiddenFields) {
          if (field in body) {
            return errorResponse(`Modifying protected field '${field}' is strictly prohibited`, 400, cors);
          }
        }

        const { name, avatar_url } = body;
        if (name === undefined && avatar_url === undefined) {
          return errorResponse('At least one field (name or avatar_url) must be provided', 400, cors);
        }

        try {
          const updatedUser = await updateUserProfile(user.id, { name, avatar_url }, env);
          return jsonResponse(
            {
              success: true,
              user: {
                id: updatedUser.id,
                email: updatedUser.email,
                name: updatedUser.name,
                avatar_url: updatedUser.avatar_url,
                is_developer: updatedUser.is_developer === true,
              },
            },
            200,
            cors
          );
        } catch (err: any) {
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // ==========================================
      // 3. Organization Routes
      // ==========================================
      if (pathname === '/api/organizations' && method === 'GET') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const user = auth.user!;
        const organizations = await getUserOrganizations(user.id, env);
        return jsonResponse({ organizations }, 200, cors);
      }

      if (pathname === '/api/organizations' && method === 'POST') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const user = auth.user!;
        const body = (await request.json().catch(() => ({}))) as any;
        const { name, logo_url, country_code } = body;

        if (!name || typeof name !== 'string' || !name.trim()) {
          return errorResponse('Organization name is required', 422, cors);
        }

        if (!country_code || typeof country_code !== 'string' || !country_code.trim()) {
          return errorResponse("Please select your organization's country.", 422, cors);
        }

        if (!isValidCountryCode(country_code)) {
          return errorResponse('Invalid country code. Please select a valid country.', 422, cors);
        }

        try {
          const organization = await createOrganization(
            {
              name: name.trim(),
              owner_id: user.id,
              logo_url: logo_url || null,
              country_code: country_code ? country_code.trim().toUpperCase() : null,
            },
            env
          );

          let gameId = 'catch-brand';
          try {
            const defaultGame = await ensureDefaultGame(organization.id, organization.name, env);
            if (defaultGame?.id) {
              gameId = defaultGame.id;
            }
          } catch (gameErr) {
            console.warn('[worker][POST /api/organizations] Non-blocking warning ensuring default game:', gameErr);
          }

          const token = await signAppToken(user.id, organization.id, 'owner', undefined, env);
          const authCookie = buildAuthCookie(token, getWorkerCookieOptions(request, env));

          return jsonResponse(
            {
              organization: {
                id: organization.id,
                name: organization.name,
                slug: organization.slug,
                role: 'owner',
                logo_url: organization.logo_url,
                country_code: organization.country_code || null,
              },
              token,
              gameId,
              welcome_credit_granted: Boolean(organization.welcome_credit_granted),
              welcome_credit_amount: organization.welcome_credit_amount || 0,
            },
            200,
            { ...cors, 'Set-Cookie': authCookie }
          );
        } catch (err: any) {
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      const orgGetParams = parseRoute('/api/organizations/:organizationId', pathname);
      if (orgGetParams && method === 'GET') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const user = auth.user!;
        const { organizationId } = orgGetParams;

        const { isMember, role: myRole } = await verifyOrgMembershipAndPermission(
          user.id,
          organizationId,
          'organization.view',
          env
        );

        if (!isMember) {
          return errorResponse('Access denied: You are not a member of this organization', 403, cors);
        }

        const org = await getOrganizationById(organizationId, env);
        if (!org) {
          return errorResponse('Organization not found', 404, cors);
        }

        return jsonResponse(
          {
            organization: {
              id: org.id,
              name: org.name,
              slug: org.slug,
              role: myRole || 'viewer',
              logo_url: org.logo_url,
              country_code: org.country_code || null,
              created_at: org.created_at,
              updated_at: org.updated_at,
            },
          },
          200,
          cors
        );
      }

      const orgPatchParams = parseRoute('/api/organizations/:organizationId', pathname);
      if (orgPatchParams && (method === 'PATCH' || method === 'PUT')) {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const user = auth.user!;
        const { organizationId } = orgPatchParams;

        const { isMember, role: myRole } = await verifyOrgMembershipAndPermission(
          user.id,
          organizationId,
          'organization.update',
          env
        );

        if (!isMember || !['owner', 'admin'].includes(myRole || '')) {
          return errorResponse('Permission denied to update organization', 403, cors);
        }

        const body = (await request.json().catch(() => ({}))) as any;

        // Reject attempts to tamper with protected fields
        if (body.id !== undefined && body.id !== organizationId) {
          return errorResponse('Direct mutation of organization id is strictly prohibited', 403, cors);
        }
        if (body.owner_id !== undefined) {
          return errorResponse('Direct mutation of organization owner_id is strictly prohibited', 403, cors);
        }
        if (body.slug !== undefined) {
          return errorResponse('Direct mutation of organization slug is strictly prohibited', 403, cors);
        }

        const updates: { name?: string; logo_url?: string | null; country_code?: string | null } = {};
        if (body.name !== undefined) {
          if (typeof body.name !== 'string' || !body.name.trim()) {
            return errorResponse('Organization name must be a non-empty string', 422, cors);
          }
          updates.name = body.name.trim();
        }
        if (body.logo_url !== undefined) {
          updates.logo_url = body.logo_url || null;
        }
        if (body.country_code !== undefined) {
          if (body.country_code === null || body.country_code === '') {
            updates.country_code = null;
          } else {
            if (typeof body.country_code !== 'string' || !isValidCountryCode(body.country_code)) {
              return errorResponse('Invalid country code. Please select a valid country.', 422, cors);
            }
            updates.country_code = body.country_code.trim().toUpperCase();
          }
        }

        const updated = await updateOrganization(organizationId, updates, env);
        return jsonResponse({ organization: updated }, 200, cors);
      }

      const orgMembersParams = parseRoute('/api/organizations/:organizationId/members', pathname);
      if (orgMembersParams && method === 'GET') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const user = auth.user!;
        const { organizationId } = orgMembersParams;

        const { isMember, member } = await verifyOrgMembershipAndPermission(
          user.id,
          organizationId,
          'organization.members.view',
          env
        );

        if (!isMember || !member) {
          return errorResponse('Access denied: You are not a member of this organization', 403, cors);
        }

        const members = await getOrgMembers(organizationId, env);
        const invitations = await getActiveOrgInvitations(organizationId, env);

        return jsonResponse({ members, invitations, userRole: member.role }, 200, cors);
      }

      const orgInvitesParams = parseRoute('/api/organizations/:organizationId/invitations', pathname);
      if (orgInvitesParams && method === 'POST') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const user = auth.user!;
        const { organizationId } = orgInvitesParams;
        const body = (await request.json().catch(() => ({}))) as any;
        const { email, role } = body;

        if (!email || !role || !['admin', 'designer', 'viewer'].includes(role)) {
          return errorResponse('Valid email and role (admin, designer, viewer) are required', 422, cors);
        }

        const { isMember, role: myRole } = await verifyOrgMembershipAndPermission(
          user.id,
          organizationId,
          'organization.members.invite',
          env
        );

        if (!isMember || !['owner', 'admin'].includes(myRole || '')) {
          return errorResponse('Only owners and admins can invite staff members', 403, cors);
        }

        const org = await getOrganizationById(organizationId, env);
        if (!org) {
          return errorResponse('Organization not found', 404, cors);
        }

        const existingMembers = await getOrgMembers(organizationId, env);
        const alreadyMember = existingMembers.some((m) => m.email.toLowerCase() === email.trim().toLowerCase());
        if (alreadyMember) {
          return errorResponse('User with this email is already a member of the organization', 409, cors);
        }

        const rawTokenArray = new Uint8Array(32);
        crypto.getRandomValues(rawTokenArray);
        const rawToken = Array.from(rawTokenArray)
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
        const tokenHash = hashToken(rawToken);
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

        const invitation = await createInvitation(
          {
            organization_id: organizationId,
            email: email.trim().toLowerCase(),
            role,
            token_hash: tokenHash,
            invited_by: user.id,
            expires_at: expiresAt,
            email_status: 'pending',
          },
          env
        );

        const frontendBaseUrl = getFrontendBaseUrl(env, request);
        const absoluteInviteUrl = `${frontendBaseUrl}/accept-invite?token=${rawToken}`;
        const relativeInviteUrl = `/accept-invite?token=${rawToken}`;

        await dispatchNotificationEvent(
          {
            eventType: 'ORG_INVITATION',
            organizationId,
            recipientUserId: null,
            inviteeEmail: email.trim().toLowerCase(),
            orgName: org.name,
            role,
            invitationId: invitation.id,
            inviteUrl: absoluteInviteUrl,
            actionUrl: relativeInviteUrl,
          },
          env
        ).catch((err) => console.error('[NOTIFICATION] Failed to dispatch ORG_INVITATION in worker:', err));

        let emailStatus: 'sent' | 'failed' | 'not_configured' = 'not_configured';
        let emailError: string | null = null;

        // Check if platform Gmail sender is connected
        try {
          const mailSettings = await getGoogleMailSettings(env);
          if (mailSettings && mailSettings.enabled && mailSettings.refresh_token_encrypted && mailSettings.status !== 'disconnected') {
            const template = generateInvitationEmailTemplate({
              organizationName: org.name,
              inviteUrl: absoluteInviteUrl,
              role,
              inviterName: user.name || user.email,
            });

            await sendEmailViaGmail(
              {
                to: invitation.email,
                subject: template.subject,
                html: template.html,
                text: template.text,
                fromName: 'EventGameStudio',
              },
              env
            );

            emailStatus = 'sent';
            await updateInvitationEmailStatus(invitation.id, 'sent', null, env);
            console.log(`[Invitations] Invitation email successfully sent to ${invitation.email} via Gmail API.`);
          } else {
            console.log(`[Invitations] Gmail sending is not connected. Invitation record created without sending email.`);
            emailStatus = 'not_configured';
          }
        } catch (emailErr: any) {
          console.error(`[Invitations] Failed to send invitation email to ${invitation.email} via Gmail API:`, emailErr);
          emailStatus = 'failed';
          emailError = isOperationalError(emailErr) ? (emailErr.message || 'Failed to deliver invitation email') : 'Failed to deliver invitation email via Gmail API';
          await updateInvitationEmailStatus(invitation.id, 'failed', emailError, env);
        }

        return jsonResponse(
          {
            invitation: {
              id: invitation.id,
              email: invitation.email,
              role: invitation.role,
              expires_at: invitation.expires_at,
              organizationName: org.name,
              email_status: emailStatus === 'not_configured' ? 'pending' : emailStatus,
              email_error: emailError,
            },
            inviteToken: rawToken,
            inviteUrl: relativeInviteUrl,
            absoluteInviteUrl,
            emailStatus,
            emailError,
            message:
              emailStatus === 'sent'
                ? `Invitation email successfully sent to ${invitation.email} via Gmail API.`
                : emailStatus === 'not_configured'
                ? `Invitation created. Share the link manually, or connect Gmail in Developer Admin to enable automated sending.`
                : `Invitation created, but failed to deliver email: ${emailError}. You can share the link manually.`,
          },
          200,
          cors
        );
      }

      const resendInviteParams = parseRoute('/api/organizations/:organizationId/invitations/:invitationId/resend', pathname);
      if (resendInviteParams && method === 'POST') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const user = auth.user!;
        const { organizationId, invitationId } = resendInviteParams;

        const { isMember, role: myRole } = await verifyOrgMembershipAndPermission(
          user.id,
          organizationId,
          'organization.members.invite',
          env
        );

        if (!isMember || !['owner', 'admin'].includes(myRole || '')) {
          return errorResponse('Only owners and admins can manage invitations', 403, cors);
        }

        const org = await getOrganizationById(organizationId, env);
        if (!org) {
          return errorResponse('Organization not found', 404, cors);
        }

        const invitation = await getInvitationById(invitationId, env);
        if (!invitation || invitation.organization_id !== organizationId) {
          return errorResponse('Invitation not found', 404, cors);
        }

        if (invitation.accepted_at) {
          return errorResponse('This invitation has already been accepted', 400, cors);
        }

        const rawTokenArray = new Uint8Array(32);
        crypto.getRandomValues(rawTokenArray);
        const rawToken = Array.from(rawTokenArray)
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
        const tokenHash = hashToken(rawToken);
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

        const frontendBaseUrl = getFrontendBaseUrl(env, request);
        const absoluteInviteUrl = `${frontendBaseUrl}/accept-invite?token=${rawToken}`;
        const relativeInviteUrl = `/accept-invite?token=${rawToken}`;

        let emailStatus: 'sent' | 'failed' | 'not_configured' = 'not_configured';
        let emailError: string | null = null;

        try {
          const mailSettings = await getGoogleMailSettings(env);
          if (mailSettings && mailSettings.enabled && mailSettings.refresh_token_encrypted && mailSettings.status !== 'disconnected') {
            const template = generateInvitationEmailTemplate({
              organizationName: org.name,
              inviteUrl: absoluteInviteUrl,
              role: invitation.role,
              inviterName: user.name || user.email,
            });

            await sendEmailViaGmail(
              {
                to: invitation.email,
                subject: template.subject,
                html: template.html,
                text: template.text,
                fromName: 'EventGameStudio',
              },
              env
            );

            emailStatus = 'sent';
          } else {
            emailStatus = 'not_configured';
          }
        } catch (emailErr: any) {
          console.error(`[Invitations] Failed to resend invitation email to ${invitation.email}:`, emailErr);
          emailStatus = 'failed';
          emailError = isOperationalError(emailErr) ? (emailErr.message || 'Failed to deliver invitation email') : 'Failed to deliver invitation email via Gmail API';
        }

        const updatedInvitation = await renewInvitation(
          invitation.id,
          {
            token_hash: tokenHash,
            expires_at: expiresAt,
            email_status: emailStatus === 'not_configured' ? 'pending' : emailStatus,
            email_sent_at: emailStatus === 'sent' ? now.toISOString() : null,
            email_error: emailError,
          },
          env
        );

        return jsonResponse(
          {
            success: true,
            invitation: {
              id: updatedInvitation.id,
              email: updatedInvitation.email,
              role: updatedInvitation.role,
              expires_at: updatedInvitation.expires_at,
              email_status: updatedInvitation.email_status || emailStatus,
              email_error: emailError,
            },
            inviteToken: rawToken,
            inviteUrl: relativeInviteUrl,
            absoluteInviteUrl,
            emailStatus,
            emailError,
            message:
              emailStatus === 'sent'
                ? `Invitation email successfully resent to ${invitation.email} via Gmail API.`
                : emailStatus === 'not_configured'
                ? `Invitation renewed. Share the link manually, or connect Gmail in Developer Admin to enable automated sending.`
                : `Invitation renewed, but failed to deliver email: ${emailError}. You can share the link manually.`,
          },
          200,
          cors
        );
      }

      const deleteInviteParams = parseRoute('/api/organizations/:organizationId/invitations/:invitationId', pathname);
      if (deleteInviteParams && method === 'DELETE') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const user = auth.user!;
        const { organizationId, invitationId } = deleteInviteParams;

        const { isMember, role: myRole } = await verifyOrgMembershipAndPermission(
          user.id,
          organizationId,
          'organization.members.remove',
          env
        );

        if (!isMember || !['owner', 'admin'].includes(myRole || '')) {
          return errorResponse('Permission denied to revoke invitations', 403, cors);
        }

        const invitation = await getInvitationById(invitationId, env);
        if (!invitation || invitation.organization_id !== organizationId) {
          return errorResponse('Invitation not found', 404, cors);
        }

        await deleteInvitation(invitationId, env);
        return jsonResponse({ success: true, message: 'Invitation revoked successfully' }, 200, cors);
      }

      const removeMemberParams = parseRoute('/api/organizations/:organizationId/members/:memberId', pathname);
      if (removeMemberParams && method === 'DELETE') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const user = auth.user!;
        const { organizationId, memberId } = removeMemberParams;

        const { isMember, role: myRole } = await verifyOrgMembershipAndPermission(
          user.id,
          organizationId,
          'organization.members.remove',
          env
        );

        if (!isMember || !['owner', 'admin'].includes(myRole || '')) {
          return errorResponse('Permission denied to remove members', 403, cors);
        }

        const target = await getMemberById(memberId, env);
        if (!target || target.organization_id !== organizationId) {
          return errorResponse('Member not found in this organization', 404, cors);
        }

        if (target.role === 'owner') {
          return errorResponse('Cannot remove organization owner', 403, cors);
        }

        if (myRole === 'admin' && target.role === 'admin') {
          return errorResponse('Admins cannot remove other admins', 403, cors);
        }

        await removeMember(memberId, env);
        return jsonResponse({ success: true }, 200, cors);
      }

      const updateMemberRoleParams = parseRoute('/api/organizations/:organizationId/members/:memberId', pathname);
      if (updateMemberRoleParams && (method === 'PATCH' || method === 'PUT')) {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const user = auth.user!;
        const { organizationId, memberId } = updateMemberRoleParams;

        const { isMember, role: myRole } = await verifyOrgMembershipAndPermission(
          user.id,
          organizationId,
          'organization.members.manage',
          env
        );

        if (!isMember || !['owner', 'admin'].includes(myRole || '')) {
          return errorResponse('Permission denied to update member roles', 403, cors);
        }

        const target = await getMemberById(memberId, env);
        if (!target || target.organization_id !== organizationId) {
          return errorResponse('Member not found in this organization', 404, cors);
        }

        if (target.role === 'owner') {
          return errorResponse('Cannot alter the role of the organization owner', 403, cors);
        }

        if (myRole === 'admin' && target.role === 'admin') {
          return errorResponse('Admins cannot alter the role of other admins', 403, cors);
        }

        const body = (await request.json().catch(() => ({}))) as any;
        const newRole = body.role;

        const allowedRoles: OrgRole[] = ['admin', 'designer', 'viewer'];
        if (!newRole || !allowedRoles.includes(newRole)) {
          return errorResponse(`Invalid member role. Allowed roles: ${allowedRoles.join(', ')}`, 422, cors);
        }

        if (newRole === 'owner') {
          return errorResponse('Direct promotion to owner is strictly prohibited', 403, cors);
        }

        // Admins cannot promote another user to admin (only owner can)
        if (myRole === 'admin' && newRole === 'admin') {
          return errorResponse('Only organization owners can grant admin role', 403, cors);
        }

        const updated = await updateMemberRole(organizationId, target.user_id, newRole, env);
        return jsonResponse({ member: updated, message: 'Member role updated successfully' }, 200, cors);
      }

      // ==========================================
      // 4. Invitation Routes
      // ==========================================
      if (pathname === '/api/invitations/verify' && method === 'GET') {
        const token = url.searchParams.get('token');

        if (!token) {
          return errorResponse('Token parameter is required', 422, cors);
        }

        const tokenHash = hashToken(token);
        const invite = await getInvitationByTokenHash(tokenHash, env);

        if (!invite) {
          return errorResponse('Invitation not found or invalid', 404, cors);
        }

        if (invite.accepted_at) {
          return errorResponse('This invitation has already been accepted', 409, cors);
        }

        if (new Date(invite.expires_at) < new Date()) {
          return errorResponse('This invitation has expired', 410, cors);
        }

        return jsonResponse(
          {
            invitationId: invite.id,
            email: invite.email,
            role: invite.role,
            organizationName: invite.organization_name,
            organizationId: invite.organization_id,
          },
          200,
          cors
        );
      }

      if (pathname === '/api/invitations/accept' && method === 'POST') {
        const body = (await request.json().catch(() => ({}))) as any;
        const { token, idToken } = body;

        if (!token || !idToken) {
          return errorResponse('token and idToken are required', 422, cors);
        }

        const tokenHash = hashToken(token);
        const invite = await getInvitationByTokenHash(tokenHash, env);

        if (!invite) {
          return errorResponse('Invitation not found', 404, cors);
        }

        if (invite.accepted_at) {
          return errorResponse('Invitation already accepted', 409, cors);
        }

        if (new Date(invite.expires_at) < new Date()) {
          return errorResponse('Invitation expired', 410, cors);
        }

        let googleUser;
        try {
          googleUser = await verifyGoogleIdToken(idToken, env);
        } catch (err: any) {
          const correlationId =
            request.headers.get('x-correlation-id') ||
            request.headers.get('x-request-id') ||
            crypto.randomUUID();
          console.error(`[Google Auth Error][${correlationId}] Google ID token verification failed for invite:`, err);
          return errorResponse('Google authentication failed', 401, { ...cors, 'x-correlation-id': correlationId });
        }

        if (googleUser.email.toLowerCase() !== invite.email.toLowerCase()) {
          return errorResponse(
            `Google account email (${googleUser.email}) does not match invitation email (${invite.email})`,
            403,
            cors
          );
        }

        const user = await upsertGoogleUser(googleUser, env);

        const existingMember = await getMember(invite.organization_id, user.id, env);
        if (!existingMember) {
          await addMember(
            {
              organization_id: invite.organization_id,
              user_id: user.id,
              role: invite.role,
            },
            env
          );
        } else {
          await updateMemberRole(invite.organization_id, user.id, invite.role, env);
        }

        await markInvitationAccepted(invite.id, env);

        const org = await getOrganizationById(invite.organization_id, env);

        await dispatchNotificationEvent(
          {
            eventType: 'MEMBER_JOINED',
            organizationId: invite.organization_id,
            memberUserId: user.id,
            memberName: user.name || user.email,
            orgName: org?.name || invite.organization_name || 'Organization',
            role: invite.role,
          },
          env
        ).catch((err) => console.error('[NOTIFICATION] Failed to dispatch MEMBER_JOINED in worker:', err));

        const appToken = await signAppToken(user.id, invite.organization_id, invite.role, undefined, env);
        const authCookie = buildAuthCookie(appToken, getWorkerCookieOptions(request, env));

        return jsonResponse(
          {
            token: appToken,
            user: {
              id: user.id,
              email: user.email,
              name: user.name,
              avatar_url: user.avatar_url,
              is_developer: user.is_developer === true,
            },
            organization: {
              id: org?.id || invite.organization_id,
              name: org?.name || invite.organization_name,
              slug: org?.slug || '',
              role: invite.role,
            },
          },
          200,
          { ...cors, 'Set-Cookie': authCookie }
        );
      }

      // ==========================================
      // 5. Upload Route
      // ==========================================
      if (pathname === '/api/upload' && method === 'POST') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const user = auth.user!;
        const isDev = isUserDeveloperAdmin(user, env);

        const formData = await request.formData().catch(() => null);
        if (!formData) {
          return errorResponse('Invalid form data', 422, cors);
        }

        const file = formData.get('file');
        if (!file || typeof file === 'string') {
          return errorResponse('No file uploaded', 422, cors);
        }

        // 1. Resolve organization ID
        let orgId =
          request.headers.get('x-organization-id') ||
          auth.jwtPayload?.organizationId ||
          (formData.get('organizationId') as string) ||
          url.searchParams.get('orgId');

        if (!orgId || orgId === 'default') {
          if (isDev) {
            orgId = 'system';
          } else {
            return errorResponse('Organization ID is required for asset uploads', 422, cors);
          }
        }

        // 2. Verify Membership & Role
        if (!isDev) {
          const { isMember, role } = await verifyOrgMembershipAndPermission(user.id, orgId, undefined, env);
          if (!isMember) {
            return errorResponse(`Forbidden: You are not a member of organization "${orgId}"`, 403, cors);
          }
          if (role === 'viewer') {
            return errorResponse('Forbidden: Viewers do not have permission to upload assets in this organization', 403, cors);
          }
        }

        // 3. Validate Category
        const ALLOWED_ASSET_CATEGORIES = new Set([
          'logos',
          'backgrounds',
          'baskets',
          'items',
          'themes',
          'general',
          'branding',
          'audio',
          'showcases',
        ]);
        const rawCategory = (formData.get('category') as string) || 'general';
        const category = rawCategory.toLowerCase().trim();
        if (!ALLOWED_ASSET_CATEGORIES.has(category)) {
          return errorResponse(
            `Invalid category "${rawCategory}". Allowed categories: ${Array.from(ALLOWED_ASSET_CATEGORIES).join(', ')}`,
            422,
            cors
          );
        }

        // 4. Validate File (Magic bytes inspection, strict MIME & extension consistency, SVG rejection)
        const fileName = file.name || 'uploaded_asset.png';
        const rawMime = file.type || 'application/octet-stream';
        const MAX_ASSET_SIZE = 25 * 1024 * 1024; // 25MB

        if (file.size > MAX_ASSET_SIZE) {
          return jsonResponse(
            {
              error: `File size exceeds maximum allowed limit of 25MB (${(file.size / (1024 * 1024)).toFixed(1)}MB provided).`,
              code: 'FILE_TOO_LARGE',
            },
            422,
            cors
          );
        }

        const arrayBuffer = await file.arrayBuffer();
        const fileBuffer = new Uint8Array(arrayBuffer);

        let allowedMediaTypes: ('image' | 'audio' | 'video')[] | undefined;
        if (category === 'audio') {
          allowedMediaTypes = ['audio'];
        } else if (category === 'showcases') {
          allowedMediaTypes = ['image', 'video'];
        } else if (category === 'general') {
          allowedMediaTypes = ['image', 'audio', 'video'];
        } else {
          allowedMediaTypes = ['image'];
        }

        const validation = validateUploadedFile(fileBuffer, {
          originalName: fileName,
          declaredMime: rawMime,
          maxSizeBytes: MAX_ASSET_SIZE,
          allowedMediaTypes,
        });

        if (!validation.valid) {
          return jsonResponse(
            {
              error: validation.error,
              code: validation.code,
            },
            422,
            cors
          );
        }

        const safeOrgId = orgId.replace(/[^a-zA-Z0-9_-]/g, '') || 'default';
        const safeCategory = category.replace(/[^a-zA-Z0-9_-]/g, '') || 'general';

        try {
          const result = await uploadGameAsset(
            {
              organizationId: safeOrgId,
              category: safeCategory as any,
              fileBuffer,
              originalName: fileName,
              mimeType: validation.mimeType,
            },
            env
          );

          return jsonResponse({ url: result.url, path: result.path }, 200, cors);
        } catch (storageErr: any) {
          console.error('Supabase storage upload error:', storageErr);
          return handleWorkerApiError(storageErr, request, cors, env);
        }
      }

      // ==========================================
      // 6. Themes & Game Studio Routes
      // ==========================================
      if (pathname === '/api/themes' && method === 'GET') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const user = auth.user!;
        const organizationId = auth.jwtPayload?.organizationId;

        if (!organizationId) {
          return errorResponse('No active organization selected', 422, cors);
        }

        const { isMember } = await verifyOrgMembershipAndPermission(user.id, organizationId, 'game.view', env);
        if (!isMember) {
          return errorResponse('Forbidden: You are not a member of this organization', 403, cors);
        }

        const gameId = url.searchParams.get('gameId') || undefined;
        const themes = await getThemesByOrgId(organizationId, gameId, env);

        return jsonResponse({ themes }, 200, cors);
      }

      if (pathname === '/api/theme-readiness' && method === 'GET') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const user = auth.user!;
        const organizationId =
          request.headers.get('x-organization-id') ||
          auth.jwtPayload?.organizationId ||
          url.searchParams.get('orgId') ||
          url.searchParams.get('organization_id') ||
          user?.organization_id;

        if (!organizationId) {
          return errorResponse('No active organization selected', 422, cors);
        }

        const { isMember } = await verifyOrgMembershipAndPermission(user.id, organizationId, 'game.view', env);
        if (!isMember) {
          return errorResponse('Forbidden: You are not a member of this organization', 403, cors);
        }

        const readiness = await checkOrganizationThemeReadiness(organizationId, env);
        return jsonResponse(readiness, 200, cors);
      }

      if (pathname === '/api/themes/onboarding-theme' && method === 'POST') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const user = auth.user!;
        const organizationId =
          request.headers.get('x-organization-id') ||
          auth.jwtPayload?.organizationId ||
          url.searchParams.get('orgId') ||
          url.searchParams.get('organization_id') ||
          user?.organization_id;

        if (!organizationId) {
          return errorResponse('No active organization selected', 422, cors);
        }

        const { isMember, role } = await verifyOrgMembershipAndPermission(user.id, organizationId, 'game.items.edit', env);
        if (!isMember || role === 'viewer') {
          return errorResponse('Forbidden: Insufficient permissions to set up themes', 403, cors);
        }

        const result = await getOrCreateOnboardingTheme(organizationId, env);
        return jsonResponse(result, 200, cors);
      }

      if (pathname === '/api/themes/system' && method === 'GET') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const gameId = url.searchParams.get('gameId') || undefined;
        const status = url.searchParams.get('status') || 'active';
        console.log(`[Worker Theme API] GET /api/themes/system requested (gameId: ${gameId || 'all'}, status: ${status})`);

        let themes: any[] = [];
        if (gameId) {
          themes = await getSystemThemesByGameId(gameId, { status: status as any }, env);
        } else {
          themes = await getAllSystemThemes(env);
        }

        const primaryDefaultTheme = themes.find((t) => t.is_default) || themes[0] || null;
        console.log(
          `[Worker Theme API] GET /api/themes/system resolved ${themes.length} system themes (primary/default: ${
            primaryDefaultTheme ? `"${primaryDefaultTheme.name}" (${primaryDefaultTheme.id})` : 'none'
          })`
        );

        return jsonResponse({ themes, theme: primaryDefaultTheme }, 200, cors);
      }

      const cloneSystemThemeParams = parseRoute('/api/themes/clone-system/:systemThemeId', pathname);
      if (cloneSystemThemeParams && method === 'POST') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const user = auth.user!;
        const organizationId = auth.jwtPayload?.organizationId;
        const { systemThemeId } = cloneSystemThemeParams;

        if (!systemThemeId || !isUUID(systemThemeId)) {
          return errorResponse(`Invalid system theme ID format: ${systemThemeId}`, 400, cors);
        }

        const body = (await request.json().catch(() => ({}))) as any;
        const { name, game_id } = body;

        if (!organizationId) {
          return errorResponse('No active organization selected', 422, cors);
        }

        const { isMember, role } = await verifyOrgMembershipAndPermission(user.id, organizationId, 'game.items.edit', env);
        if (!isMember || role === 'viewer') {
          return errorResponse('Permission denied: Cannot create themes', 403, cors);
        }

        const cloned = await cloneSystemThemeToOrg(systemThemeId, organizationId, game_id, name, env);
        return jsonResponse({ theme: cloned }, 201, cors);
      }

      if (pathname === '/api/themes/clone-all-system' && method === 'POST') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const user = auth.user!;
        const organizationId = auth.jwtPayload?.organizationId;
        const body = (await request.json().catch(() => ({}))) as any;
        const { game_id } = body;

        if (!organizationId) {
          return errorResponse('No active organization selected', 422, cors);
        }

        if (!game_id) {
          return errorResponse('Game ID is required', 422, cors);
        }

        const { isMember, role } = await verifyOrgMembershipAndPermission(user.id, organizationId, 'game.items.edit', env);
        if (!isMember || role === 'viewer') {
          return errorResponse('Permission denied: Cannot create themes', 403, cors);
        }

        const cloned = await cloneAllSystemThemesToOrg(organizationId, game_id, env);
        return jsonResponse({ themes: cloned }, 201, cors);
      }

      const getThemeParams = parseRoute('/api/themes/:themeId', pathname);
      if (getThemeParams && method === 'GET') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const user = auth.user!;
        const { themeId } = getThemeParams;
        const gameId = url.searchParams.get('gameId') || undefined;

        // Handle special 'system' identifier
        if (themeId === 'system') {
          console.log(`[Worker Theme API] Resolving special identifier "system" (gameId: ${gameId || 'all'})`);
          let systemThemes: any[] = [];
          if (gameId) {
            systemThemes = await getSystemThemesByGameId(gameId, { status: 'active' }, env);
          } else {
            systemThemes = await getAllSystemThemes(env);
          }

          const primaryTheme = systemThemes.find((t) => t.is_default) || systemThemes[0] || null;
          if (!primaryTheme) {
            console.log(`[Worker Theme API] No system theme found for gameId: ${gameId || 'all'}`);
            return errorResponse('No system theme found for this game', 404, cors);
          }

          console.log(
            `[Worker Theme API] Resolved system theme: "${primaryTheme.name}" (${primaryTheme.id}, is_default: ${Boolean(
              primaryTheme.is_default
            )})`
          );
          return jsonResponse({ theme: primaryTheme, themes: systemThemes }, 200, cors);
        }

        // Validate UUID format for normal theme lookup
        if (!isUUID(themeId)) {
          console.log(`[Worker Theme API] Invalid UUID format requested: "${themeId}". Returning 404.`);
          return errorResponse(`Invalid theme ID format: ${themeId}`, 404, cors);
        }

        console.log(`[Worker Theme API] Resolving game theme by UUID: ${themeId}`);
        const theme = await getThemeById(themeId, env);
        if (!theme) {
          console.log(`[Worker Theme API] Theme with UUID ${themeId} not found`);
          return errorResponse('Theme not found', 404, cors);
        }

        // Verify access permission if it belongs to an organization
        const isSystemTheme = Boolean(theme.is_system) || !theme.organization_id;
        if (!isSystemTheme && theme.organization_id) {
          const { isMember } = await verifyOrgMembershipAndPermission(user.id, theme.organization_id, 'game.view', env);
          if (!isMember) {
            return errorResponse('Access denied to this theme', 403, cors);
          }
        }

        console.log(`[Worker Theme API] Successfully resolved theme "${theme.name}" (id: ${theme.id}, is_system: ${isSystemTheme})`);
        return jsonResponse({ theme }, 200, cors);
      }

      if (pathname === '/api/themes' && method === 'POST') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const user = auth.user!;
        const organizationId = auth.jwtPayload?.organizationId;

        if (!organizationId) {
          return errorResponse('No active organization selected', 422, cors);
        }

        const { isMember, role } = await verifyOrgMembershipAndPermission(user.id, organizationId, 'game.items.edit', env);
        if (!isMember || role === 'viewer') {
          return errorResponse('Permission denied: Cannot create themes', 403, cors);
        }

        const body = (await request.json().catch(() => ({}))) as any;
        if (body.is_system && !isUserDeveloperAdmin(user, env)) {
          return errorResponse('Only developer admins can create system themes', 403, cors);
        }

        const {
          game_id,
          game_slug,
          game_type,
          name,
          slug,
          description,
          status,
          styling,
          branding,
          background_url,
          basket_config,
          items_config,
          physics_config,
          visuals_config,
          sounds_config,
          layout,
          game_config,
        } = body;

        if (!name || typeof name !== 'string') {
          return errorResponse('Theme name is required', 422, cors);
        }

        try {
          const theme = await createTheme(
            {
              organization_id: organizationId,
              game_id,
              game_slug,
              game_type,
              name,
              slug,
              description,
              status,
              styling: styling || visuals_config,
              branding,
              background_url,
              basket_config,
              items_config,
              physics_config,
              visuals_config,
              sounds_config,
              layout,
              game_config,
            },
            env
          );

          return jsonResponse({ ...theme, theme }, 201, cors);
        } catch (err: any) {
          console.error('Error in worker createTheme:', err);
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      const updateThemeParams = parseRoute('/api/themes/:themeId', pathname);
      if (updateThemeParams && method === 'PUT') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const user = auth.user!;
        const { themeId } = updateThemeParams;

        if (!isUUID(themeId)) {
          return errorResponse(`Invalid theme ID format: ${themeId}`, 400, cors);
        }

        const theme = await getThemeById(themeId, env);
        if (!theme) {
          return errorResponse('Theme not found', 404, cors);
        }

        if (theme.is_system || !theme.organization_id) {
          return errorResponse('System themes are read-only templates and cannot be edited directly. Clone this theme into your organization to make edits.', 403, cors);
        }

        const { isMember, role } = await verifyOrgMembershipAndPermission(user.id, theme.organization_id, 'game.items.edit', env);
        if (!isMember || role === 'viewer') {
          return errorResponse('Permission denied: Cannot update themes', 403, cors);
        }

        const body = (await request.json().catch(() => ({}))) as any;

        if (body.game_id !== undefined && body.game_id !== theme.game_id) {
          return errorResponse('Theme game association is immutable and cannot be modified', 400, cors);
        }
        if (body.is_system !== undefined && body.is_system !== theme.is_system) {
          return errorResponse('Theme is_system status cannot be modified', 400, cors);
        }
        if (body.organization_id !== undefined && body.organization_id !== theme.organization_id) {
          return errorResponse('Theme organization_id cannot be modified', 400, cors);
        }
        if (body.ownership_type !== undefined && body.ownership_type !== (theme.ownership_type || 'organization')) {
          return errorResponse('Theme ownership_type cannot be modified', 400, cors);
        }

        const {
          name,
          slug,
          description,
          status,
          styling,
          branding,
          background_url,
          basket_config,
          items_config,
          physics_config,
          visuals_config,
          sounds_config,
          layout,
          game_config,
        } = body;

        let trimmedName: string | undefined = undefined;
        if (name !== undefined) {
          if (typeof name !== 'string') {
            return jsonResponse({ error: 'Theme name must be a string' }, 400, cors);
          }
          trimmedName = name.trim();
          if (trimmedName.length === 0) {
            return jsonResponse({ error: 'Theme name is required' }, 400, cors);
          }
          if (trimmedName.length > 60) {
            return jsonResponse({ error: 'Theme name must not exceed 60 characters' }, 400, cors);
          }
          if (theme.organization_id && trimmedName.toLowerCase() !== (theme.name || '').trim().toLowerCase()) {
            const isAvailable = await checkThemeNameAvailable(theme.organization_id, trimmedName, themeId, env);
            if (!isAvailable) {
              return jsonResponse({ error: 'A theme with this name already exists in your organization' }, 400, cors);
            }
          }
        }

        const updatesToApply: Record<string, any> = {};
        if (trimmedName !== undefined) {
          updatesToApply.name = trimmedName;
          if (slug !== undefined) {
            updatesToApply.slug = slug;
          } else {
            updatesToApply.slug = trimmedName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
          }
        } else if (slug !== undefined) {
          updatesToApply.slug = slug;
        }

        if (description !== undefined) updatesToApply.description = description;
        if (status !== undefined) {
          updatesToApply.status = status && status !== 'draft' ? status : 'active';
        }
        if (styling !== undefined) {
          updatesToApply.styling = styling;
        } else if (visuals_config !== undefined) {
          updatesToApply.styling = visuals_config;
        }
        if (visuals_config !== undefined) updatesToApply.visuals_config = visuals_config;
        if (branding !== undefined) updatesToApply.branding = branding;
        if (background_url !== undefined) updatesToApply.background_url = background_url;
        if (basket_config !== undefined) updatesToApply.basket_config = basket_config;
        if (items_config !== undefined) updatesToApply.items_config = items_config;
        if (physics_config !== undefined) updatesToApply.physics_config = physics_config;
        if (sounds_config !== undefined) updatesToApply.sounds_config = sounds_config;
        if (layout !== undefined) updatesToApply.layout = layout;

        if (game_config !== undefined) {
          updatesToApply.game_config = {
            ...(theme.game_config || {}),
            ...game_config,
            is_onboarding_draft: false,
            theme_setup_completed: true,
            theme_setup_completed_at: new Date().toISOString(),
          };
        }

        try {
          const updatedTheme = await updateTheme(themeId, updatesToApply, env);

          return jsonResponse({ ...updatedTheme, theme: updatedTheme }, 200, cors);
        } catch (err: any) {
          console.error('Error in worker updateTheme:', err);
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      const renameThemeParams = parseRoute('/api/themes/:themeId/rename', pathname);
      if (renameThemeParams && method === 'POST') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const user = auth.user!;
        const { themeId } = renameThemeParams;

        if (!isUUID(themeId)) {
          return jsonResponse({ error: `Invalid theme ID format: ${themeId}` }, 400, cors);
        }

        const theme = await getThemeById(themeId, env);
        if (!theme) {
          return jsonResponse({ error: 'Theme not found' }, 404, cors);
        }

        if (theme.is_system || !theme.organization_id) {
          return jsonResponse(
            { error: 'System themes are read-only templates and cannot be edited directly.' },
            403,
            cors
          );
        }

        const { isMember, role } = await verifyOrgMembershipAndPermission(
          user.id,
          theme.organization_id,
          'game.items.edit',
          env
        );
        if (!isMember || role === 'viewer') {
          return jsonResponse({ error: 'Permission denied: Cannot rename themes' }, 403, cors);
        }

        const body = (await request.json().catch(() => ({}))) as any;
        const { name } = body;
        if (name === undefined || typeof name !== 'string') {
          return jsonResponse({ error: 'Theme name is required and must be a string' }, 400, cors);
        }

        try {
          const updatedTheme = await renameTheme(themeId, name, env);
          return jsonResponse({ ...updatedTheme, theme: updatedTheme }, 200, cors);
        } catch (err: any) {
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      const duplicateThemeParams = parseRoute('/api/themes/:themeId/duplicate', pathname);
      if (duplicateThemeParams && method === 'POST') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const user = auth.user!;
        const { themeId } = duplicateThemeParams;

        if (!isUUID(themeId)) {
          return errorResponse(`Invalid theme ID format: ${themeId}`, 400, cors);
        }

        const body = (await request.json().catch(() => ({}))) as any;
        const { name } = body;

        const theme = await getThemeById(themeId, env);
        if (!theme) {
          return errorResponse('Theme not found', 404, cors);
        }

        const { isMember, role } = await verifyOrgMembershipAndPermission(user.id, theme.organization_id, 'game.items.edit', env);
        if (!isMember || role === 'viewer') {
          return errorResponse('Permission denied: Cannot duplicate themes', 403, cors);
        }

        const duplicated = await duplicateTheme(themeId, name, env);
        return jsonResponse({ theme: duplicated }, 201, cors);
      }

      const deleteThemeParams = parseRoute('/api/themes/:themeId', pathname);
      if (deleteThemeParams && method === 'DELETE') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const user = auth.user!;
        const { themeId } = deleteThemeParams;

        if (!isUUID(themeId)) {
          return errorResponse(`Invalid theme ID format: ${themeId}`, 400, cors);
        }

        const theme = await getThemeById(themeId, env);
        if (!theme) {
          return errorResponse('Theme not found', 404, cors);
        }

        if (theme.is_system || !theme.organization_id) {
          return errorResponse('System themes are read-only templates and cannot be deleted.', 403, cors);
        }

        const { isMember, role } = await verifyOrgMembershipAndPermission(user.id, theme.organization_id, 'game.items.edit', env);
        if (!isMember || !['owner', 'admin'].includes(role || '')) {
          return errorResponse('Permission denied: Only owners and admins can delete themes', 403, cors);
        }

        await deleteTheme(themeId, env);
        return jsonResponse({ success: true }, 200, cors);
      }

      // ==========================================
      // 7. Game Config Routes
      // ==========================================
      if (pathname === '/api/games' && method === 'GET') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const user = auth.user!;
        const organizationId = auth.jwtPayload?.organizationId;

        if (!organizationId) {
          return errorResponse('No active organization selected', 422, cors);
        }

        const { isMember } = await verifyOrgMembershipAndPermission(user.id, organizationId, 'game.view', env);
        if (!isMember) {
          return errorResponse('Forbidden: You are not a member of this organization', 403, cors);
        }

        const games = await getAvailableGamesForStudio(organizationId, env);

        return jsonResponse({ games }, 200, cors);
      }

      const getGameParams = parseRoute('/api/games/:gameId', pathname);
      if (getGameParams && method === 'GET') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const user = auth.user!;
        const { gameId } = getGameParams;
        const organizationId = auth.jwtPayload?.organizationId;

        const game = await getGameById(gameId, env);
        if (!game) {
          return errorResponse('Game not found', 404, cors);
        }

        const isSystemGame = Boolean(game.is_system) || !game.organization_id;
        if (!isSystemGame && game.organization_id) {
          const { isMember } = await verifyOrgMembershipAndPermission(user.id, game.organization_id, 'game.view', env);
          if (!isMember) {
            return errorResponse('Access denied to this game', 403, cors);
          }
        } else if (organizationId) {
          const { isMember } = await verifyOrgMembershipAndPermission(user.id, organizationId, 'game.view', env);
          if (!isMember) {
            return errorResponse('Access denied: You are not a member of the active organization', 403, cors);
          }
        }

        return jsonResponse({ game }, 200, cors);
      }

      const updateGameParams = parseRoute('/api/games/:gameId/customization', pathname);
      if (updateGameParams && method === 'PUT') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const user = auth.user!;
        const { gameId } = updateGameParams;
        const organizationId = auth.jwtPayload?.organizationId;
        const body = (await request.json().catch(() => ({}))) as any;

        if (
          body.organization_id !== undefined ||
          body.game_type !== undefined ||
          body.slug !== undefined ||
          body.is_system !== undefined
        ) {
          return errorResponse('Cannot alter structural columns (organization_id, game_type, slug, is_system) on games', 400, cors);
        }

        const { background_url, basket_config, items_config, settings_config, name } = body;
        const resolvedSettingsConfig = settings_config !== undefined ? settings_config : body.settings;

        const game = await getGameById(gameId, env);
        if (!game) {
          return errorResponse('Game not found', 404, cors);
        }

        const targetOrgId = game.organization_id || organizationId;
        if (!targetOrgId && !isUserDeveloperAdmin(user, env)) {
          return errorResponse('No active organization context found', 422, cors);
        }

        if (game.organization_id && game.organization_id !== organizationId && !isUserDeveloperAdmin(user, env)) {
          return errorResponse('Access denied: Game belongs to another organization', 403, cors);
        }

        let requiredPerm = 'game.view';
        if (background_url !== undefined) requiredPerm = 'game.background.edit';
        else if (items_config !== undefined) requiredPerm = 'game.items.edit';
        else if (basket_config !== undefined) requiredPerm = 'game.basket.edit';
        else if (resolvedSettingsConfig !== undefined) requiredPerm = 'game.settings.edit';

        if (targetOrgId) {
          const { isMember, role, hasPermission } = await verifyOrgMembershipAndPermission(user.id, targetOrgId, requiredPerm, env);
          if (!isMember) {
            return errorResponse('Access denied: Not an organization member', 403, cors);
          }

          if (!hasPermission || role === 'viewer') {
            return errorResponse('Permission denied: Insufficient permissions to modify game customization', 403, cors);
          }
        }

        const updatedGame = await updateGameCustomization(
          gameId,
          {
            background_url,
            basket_config,
            items_config,
            settings_config: resolvedSettingsConfig,
            name,
          },
          env
        );

        return jsonResponse({ ...updatedGame, game: updatedGame }, 200, cors);
      }

      const getGameThemesParams = parseRoute('/api/games/:gameId/themes', pathname);
      if (getGameThemesParams && method === 'GET') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const user = auth.user!;
        const { gameId } = getGameThemesParams;
        const organizationId = auth.jwtPayload?.organizationId;

        const game = await getGameById(gameId, env);
        if (!game) {
          return errorResponse('Game not found', 404, cors);
        }

        const isSystemGame = Boolean(game.is_system) || !game.organization_id;
        if (!isSystemGame && game.organization_id) {
          const { isMember } = await verifyOrgMembershipAndPermission(user.id, game.organization_id, 'game.view', env);
          if (!isMember) {
            return errorResponse('Access denied to this game', 403, cors);
          }
        } else if (organizationId) {
          const { isMember } = await verifyOrgMembershipAndPermission(user.id, organizationId, 'game.view', env);
          if (!isMember) {
            return errorResponse('Access denied: You are not a member of the active organization', 403, cors);
          }
        }

        const targetOrgId = organizationId || game.organization_id;
        let themes: any[] = [];
        if (targetOrgId) {
          themes = await getThemesByOrgId(targetOrgId, gameId, env);
        }
        return jsonResponse({ themes }, 200, cors);
      }

      // GET /api/games/:gameId/pricing
      const gamePricingMatch = parseRoute('/api/games/:gameId/pricing', pathname);
      if (gamePricingMatch && method === 'GET') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;
        const { gameId } = gamePricingMatch;
        try {
          const tiers = await getActiveGamePricing(gameId, env);
          return jsonResponse({ success: true, tiers, game_id: gameId }, 200, cors);
        } catch (err: any) {
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // GET /api/public/games/pricing (Public landing page endpoint)
      if (pathname === '/api/public/games/pricing' && method === 'GET') {
        try {
          const data = await getPublicGamesPricing(env);
          return jsonResponse(data, 200, cors);
        } catch (err: any) {
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // ==========================================
      // 8. Events & Public Deployment Routes
      // ==========================================
      const orgEventsRoute = parseRoute('/api/organizations/:organizationId/events', pathname) ||
                             parseRoute('/api/organizations/:orgId/events', pathname);
      if ((pathname === '/api/events' || orgEventsRoute) && method === 'GET') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const user = auth.user!;
        const rawOrgId = orgEventsRoute?.organizationId || orgEventsRoute?.orgId || auth.jwtPayload?.organizationId;
        const organizationId =
          rawOrgId && rawOrgId !== 'undefined' && rawOrgId !== 'null' && rawOrgId.trim() !== ''
            ? rawOrgId.trim()
            : undefined;

        if (!organizationId || !isUUID(organizationId)) {
          return jsonResponse({ events: [] }, 200, cors);
        }

        const { isMember, hasPermission } = await verifyOrgMembershipAndPermission(user.id, organizationId, 'event.view', env);
        if (!isMember || !hasPermission) {
          return errorResponse('Forbidden: You do not have permission to view events', 403, cors);
        }

        try {
          const events = await getEventsByOrgId(organizationId, env);
          return jsonResponse({ events }, 200, cors);
        } catch (err: any) {
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      const getEventPreviewParams = parseRoute('/api/events/:eventId/preview', pathname);
      if (getEventPreviewParams && method === 'GET') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const user = auth.user!;
        const { eventId } = getEventPreviewParams;

        const event = await getEventById(eventId, env);
        if (!event) {
          return errorResponse('Event not found', 404, cors);
        }

        const { isMember, hasPermission } = await verifyOrgMembershipAndPermission(user.id, event.organization_id, 'event.view', env);
        if (!isMember || !hasPermission) {
          return errorResponse('Forbidden: Access denied to this event preview', 403, cors);
        }

        if (isEventExplicitlyCancelled(event)) {
          return jsonResponse({
            error: 'This event has been cancelled.',
            code: 'EVENT_CANCELLED',
            is_cancelled: true,
            cancel_reason: event.cancel_reason,
          }, 403, {
            ...cors,
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
          });
        }

        // Check preview accessibility (Available for Scheduled, Pending Payment, Live, and Concluded events)
        const isPreviewAllowed = canAccessPreviewEvent(event);
        if (!isPreviewAllowed) {
          return jsonResponse({
            error: 'Event preview is not available.',
            code: 'PREVIEW_UNAVAILABLE',
            is_preview_available: false,
          }, 403, {
            ...cors,
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
          });
        }

        return jsonResponse({
          event: {
            ...event,
            is_preview: true,
          },
        }, 200, {
          ...cors,
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        });
      }

      // ==========================================
      // LOCALIZATION & TRANSLATION SYSTEM ENDPOINTS
      // ==========================================

      if (pathname === '/api/localization/languages' && method === 'GET') {
        return jsonResponse({ languages: SUPPORTED_LANGUAGES }, 200, cors);
      }

      const getEventTranslationsParams = parseRoute('/api/events/:eventId/translations', pathname);
      if (getEventTranslationsParams && method === 'GET') {
        try {
          const { eventId } = getEventTranslationsParams;
          const event = await getEventById(eventId, env);
          if (!event) {
            return errorResponse('Event not found', 404, cors);
          }
          const translations = await getEventTranslations(eventId);
          return jsonResponse({ translations }, 200, cors);
        } catch (err: any) {
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      const putEventTranslationParams = parseRoute('/api/events/:eventId/translations/:language', pathname);
      if (putEventTranslationParams && method === 'PUT') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const user = auth.user!;
        const { eventId, language } = putEventTranslationParams;

        try {
          const body: any = await request.json();
          const { title, description, game_instructions } = body || {};

          if (!title || typeof title !== 'string' || title.trim().length === 0) {
            return errorResponse('Translation title is required.', 400, cors);
          }

          const event = await getEventById(eventId, env);
          if (!event) {
            return errorResponse('Event not found', 404, cors);
          }

          const { isMember, hasPermission } = await verifyOrgMembershipAndPermission(user.id, event.organization_id, 'event.edit', env);
          if (!isMember || !hasPermission) {
            return errorResponse('Forbidden: You do not have permission to edit this event', 403, cors);
          }

          const normalizedLang = normalizeLanguageCode(language);
          const translation = await upsertEventTranslation(eventId, normalizedLang, {
            title,
            description,
            game_instructions,
          });

          return jsonResponse({ translation }, 200, cors);
        } catch (err: any) {
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      const deleteEventTranslationParams = parseRoute('/api/events/:eventId/translations/:language', pathname);
      if (deleteEventTranslationParams && method === 'DELETE') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const user = auth.user!;
        const { eventId, language } = deleteEventTranslationParams;

        try {
          const event = await getEventById(eventId, env);
          if (!event) {
            return errorResponse('Event not found', 404, cors);
          }

          const { isMember, hasPermission } = await verifyOrgMembershipAndPermission(user.id, event.organization_id, 'event.edit', env);
          if (!isMember || !hasPermission) {
            return errorResponse('Forbidden: You do not have permission to edit this event', 403, cors);
          }

          const normalizedLang = normalizeLanguageCode(language);
          await deleteEventTranslation(eventId, normalizedLang);
          return jsonResponse({ success: true }, 200, cors);
        } catch (err: any) {
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      const getShowcaseTranslationsParams = parseRoute('/api/events/:eventId/showcase/translations', pathname);
      if (getShowcaseTranslationsParams && method === 'GET') {
        try {
          const { eventId } = getShowcaseTranslationsParams;
          const showcase = await getShowcaseByEventId(eventId, env);
          if (!showcase) {
            return errorResponse('Showcase not found for this event', 404, cors);
          }
          const translations = await getShowcaseTranslations(showcase.id);
          return jsonResponse({ translations }, 200, cors);
        } catch (err: any) {
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      const putShowcaseTranslationParams = parseRoute('/api/events/:eventId/showcase/translations/:language', pathname);
      if (putShowcaseTranslationParams && method === 'PUT') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const user = auth.user!;
        const { eventId, language } = putShowcaseTranslationParams;

        try {
          const body: any = await request.json();
          const { title, description, cta_text } = body || {};

          if (!title || typeof title !== 'string' || title.trim().length === 0) {
            return errorResponse('Showcase translation title is required.', 400, cors);
          }

          const event = await getEventById(eventId, env);
          if (!event) {
            return errorResponse('Event not found', 404, cors);
          }

          const { isMember, hasPermission } = await verifyOrgMembershipAndPermission(user.id, event.organization_id, 'event.edit', env);
          if (!isMember || !hasPermission) {
            return errorResponse('Forbidden: Access denied to this showcase', 403, cors);
          }

          const showcase = await getShowcaseByEventId(eventId, env);
          if (!showcase) {
            return errorResponse('Showcase not found for this event', 404, cors);
          }

          const normalizedLang = normalizeLanguageCode(language);
          const translation = await upsertShowcaseTranslation(showcase.id, normalizedLang, {
            title,
            description,
            cta_text,
          });

          return jsonResponse({ translation }, 200, cors);
        } catch (err: any) {
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      const deleteShowcaseTranslationParams = parseRoute('/api/events/:eventId/showcase/translations/:language', pathname);
      if (deleteShowcaseTranslationParams && method === 'DELETE') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const user = auth.user!;
        const { eventId, language } = deleteShowcaseTranslationParams;

        try {
          const event = await getEventById(eventId, env);
          if (!event) {
            return errorResponse('Event not found', 404, cors);
          }

          const { isMember, hasPermission } = await verifyOrgMembershipAndPermission(user.id, event.organization_id, 'event.edit', env);
          if (!isMember || !hasPermission) {
            return errorResponse('Forbidden: Access denied to this showcase', 403, cors);
          }

          const showcase = await getShowcaseByEventId(eventId, env);
          if (!showcase) {
            return errorResponse('Showcase not found for this event', 404, cors);
          }

          const normalizedLang = normalizeLanguageCode(language);
          await deleteShowcaseTranslation(showcase.id, normalizedLang);

          return jsonResponse({ success: true }, 200, cors);
        } catch (err: any) {
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      if (pathname === '/api/translations/translate' && method === 'POST') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        try {
          const body: any = await request.json();
          const {
            sourceLanguage = 'en',
            targetLanguage,
            text,
            fields,
            glossary,
            context,
            entityType,
            tone,
          } = body || {};

          if (!targetLanguage) {
            return errorResponse('targetLanguage is required', 400, cors);
          }

          if (!text && (!fields || Object.keys(fields).length === 0)) {
            return errorResponse('Either text or fields must be provided', 400, cors);
          }

          const result = await translationService.translate({
            sourceLanguage: normalizeLanguageCode(sourceLanguage),
            targetLanguage: normalizeLanguageCode(targetLanguage),
            text,
            fields,
            glossary,
            context,
            entityType,
            tone,
          });

          return jsonResponse({ success: true, ...result }, 200, cors);
        } catch (err: any) {
          console.error('[Worker /api/translations/translate error]', err);
          return jsonResponse({
            error: err?.message || 'Translation failed. Please try again.',
            code: 'TRANSLATION_FAILED',
          }, 500, cors);
        }
      }

      // Mint Signed Venue Token for displays/kiosks
      const postVenueTokenParams = parseRoute('/api/events/:eventId/venue-token', pathname);
      if (postVenueTokenParams && method === 'POST') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const user = auth.user!;
        const { eventId } = postVenueTokenParams;

        const event = await getEventById(eventId, env);
        if (!event) {
          return errorResponse('Event not found', 404, cors);
        }

        const { isMember, hasPermission } = await verifyOrgMembershipAndPermission(user.id, event.organization_id, 'event.view', env);
        if (!isMember || !hasPermission) {
          return errorResponse('Forbidden: Access denied to this event', 403, cors);
        }

        let body: any = {};
        try {
          body = await request.json();
        } catch {
          body = {};
        }

        const expiresIn = typeof body?.expiresIn === 'string' ? body.expiresIn : '7d';
        const venueToken = await signVenueToken({
          eventId: event.id,
          publicToken: event.public_token,
          organizationId: event.organization_id,
          issuedBy: user.id,
          expiresIn,
        }, undefined, env);

        const now = new Date();
        const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

        return jsonResponse({
          success: true,
          eventId: event.id,
          publicToken: event.public_token,
          venueToken,
          expiresAt,
          allowanceLimit: 180,
        }, 200, cors);
      }

      const getEventParams = parseRoute('/api/events/:eventId', pathname);
      if (getEventParams && method === 'GET') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const user = auth.user!;
        const { eventId } = getEventParams;

        const event = await getEventById(eventId, env);
        if (!event) {
          return errorResponse('Event not found', 404, cors);
        }

        const { isMember, hasPermission } = await verifyOrgMembershipAndPermission(user.id, event.organization_id, 'event.view', env);
        if (!isMember || !hasPermission) {
          return errorResponse('Forbidden: Access denied to this event', 403, cors);
        }

        return jsonResponse({ event }, 200, cors);
      }

      // Quote Event Payment
      if (pathname === '/api/events/quote' && method === 'POST') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const user = auth.user!;
        const organizationId = auth.jwtPayload?.organizationId;

        if (!organizationId) {
          return errorResponse('No active organization selected', 422, cors);
        }

        const { isMember, hasPermission } = await verifyOrgMembershipAndPermission(user.id, organizationId, 'event.view', env);
        if (!isMember || !hasPermission) {
          return errorResponse('Permission denied: Not a member of this organization', 403, cors);
        }

        const body = (await request.json().catch(() => ({}))) as any;
        const {
          event_id,
          game_theme_id,
          payment_mode,
          topup_credit_requested,
          event_price,
          use_welcome_credit,
          use_event_credit,
          welcome_credit_requested,
          start_date,
          end_date,
          startDate,
          endDate,
          event_date,
          starts_at,
          expires_at,
        } = body;

        let price: number | undefined = undefined;
        let currency = 'MYR';
        let durationDays = 1;
        let ruleLabel = '1 day';
        let targetGameId = body.game_id || body.gameId;

        if (event_id) {
          // Existing event: event.event_price and event.event_currency MUST be authoritative
          const existing = await getEventById(event_id, env);
          if (!existing) {
            return errorResponse('Event not found', 404, cors);
          }
          const existingPrice = existing.event_price !== undefined && existing.event_price !== null ? Number(existing.event_price) : NaN;
          const existingCurrency = typeof existing.event_currency === 'string' ? existing.event_currency.trim().toUpperCase() : '';

          if (isNaN(existingPrice) || existingPrice <= 0 || !existingCurrency) {
            const err: any = new Error('Pricing configuration error: Event is missing a valid authoritative price or currency.');
            err.status = 503;
            err.statusCode = 503;
            err.code = 'PRICING_CONFIGURATION_ERROR';
            return handleWorkerApiError(err, request, cors, env);
          }

          price = existingPrice;
          currency = existingCurrency;
          durationDays = calculateEventCalendarDays(existing.start_date || existing.event_date, existing.end_date || existing.start_date || existing.event_date);
          ruleLabel = `${durationDays} day${durationDays > 1 ? 's' : ''}`;
          if (existing.game_id && !targetGameId) {
            targetGameId = existing.game_id;
          }
        } else {
          // New event quote (event does not exist yet): calculate dynamically from game pricing tiers
          if (!targetGameId && game_theme_id) {
            try {
              const theme = await getThemeById(game_theme_id, env);
              if (theme?.game_id) {
                targetGameId = theme.game_id;
              }
            } catch (_) {}
          }

          try {
            const pricing = await calculateEventAuthoritativePrice({
              game_id: targetGameId,
              start_date: start_date || startDate,
              end_date: end_date || endDate,
              event_date,
              starts_at,
              expires_at,
            }, env);
            price = pricing.price;
            currency = pricing.currency;
            durationDays = pricing.durationDays;
            ruleLabel = pricing.ruleLabel;
          } catch (e: any) {
            console.error('Authoritative pricing calculation failed in quote (worker):', e);
            return handleWorkerApiError(e, request, cors, env);
          }
        }

        let themeInfo: any = null;
        if (game_theme_id) {
          const theme = await getThemeById(game_theme_id, env);
          if (theme) {
            themeInfo = {
              id: theme.id,
              name: theme.name,
              game_id: theme.game_id,
            };
          }
        }

        const walletSummary = await getWalletBalance(organizationId, env);
        let selectedMode = (payment_mode as PaymentMode) || 'FULL_PAID';
        if (use_welcome_credit !== undefined || use_event_credit !== undefined) {
          if (use_welcome_credit && use_event_credit) selectedMode = 'COMBINED_CREDIT';
          else if (use_welcome_credit) selectedMode = 'WELCOME_CREDIT';
          else if (use_event_credit) selectedMode = 'TOPUP_CREDIT';
          else selectedMode = 'FULL_PAID';
        }

        // Calculate quote for selected payment mode
        const selectedCalculation = await calculateEventPayment(
          price,
          selectedMode,
          organizationId,
          {
            topupCreditRequested: topup_credit_requested,
            useWelcomeCredit: use_welcome_credit,
            useEventCredit: use_event_credit,
            welcomeCreditRequested: welcome_credit_requested,
          },
          env
        );

        // Calculate options for all payment modes
        const fullPaidCalc = await calculateEventPayment(price, 'FULL_PAID', organizationId, {}, env);
        const welcomeCalc = await calculateEventPayment(price, 'WELCOME_CREDIT', organizationId, {}, env);
        const showcaseCalc = await calculateEventPayment(price, 'SHOWCASE_CREDIT', organizationId, {}, env);
        const topupCalc = await calculateEventPayment(price, 'TOPUP_CREDIT', organizationId, { topupCreditRequested: topup_credit_requested }, env);

        const options = [
          {
            mode: 'FULL_PAID',
            title: 'Paid Balance',
            badge: '100% Paid Balance',
            isEligible: fullPaidCalc.isPayable,
            creditApplied: 0,
            paidAmount: fullPaidCalc.paidAmount,
            remainingPaidBalance: fullPaidCalc.remainingPaidBalance,
            remainingCreditBalance: 0,
            reasons: fullPaidCalc.reasons,
          },
          ...(walletSummary.welcome_credit > 0 ? [
            {
              mode: 'WELCOME_CREDIT' as const,
              title: 'Welcome Credit',
              badge: 'Save RM800.00',
              isEligible: welcomeCalc.isPayable,
              creditApplied: welcomeCalc.welcomeCreditUsed,
              paidAmount: welcomeCalc.paidAmount,
              remainingPaidBalance: welcomeCalc.remainingPaidBalance,
              remainingCreditBalance: welcomeCalc.remainingCreditBalance,
              reasons: welcomeCalc.reasons,
            }
          ] : []),
          {
            mode: 'SHOWCASE_CREDIT',
            title: 'Showcase Credit',
            badge: 'Save RM300.00',
            isEligible: showcaseCalc.isPayable,
            creditApplied: showcaseCalc.showcaseCreditUsed,
            paidAmount: showcaseCalc.paidAmount,
            remainingPaidBalance: showcaseCalc.remainingPaidBalance,
            remainingCreditBalance: showcaseCalc.remainingCreditBalance,
            reasons: showcaseCalc.reasons,
          },
          {
            mode: 'TOPUP_CREDIT',
            title: 'Top-up Bonus Credit',
            badge: 'Save up to 20% (RM280.00)',
            isEligible: topupCalc.isPayable,
            creditApplied: topupCalc.topupCreditUsed,
            paidAmount: topupCalc.paidAmount,
            remainingPaidBalance: topupCalc.remainingPaidBalance,
            remainingCreditBalance: topupCalc.remainingCreditBalance,
            reasons: topupCalc.reasons,
          },
        ];

        return jsonResponse({
          standard_price: price,
          event_price: price,
          currency: currency || 'MYR',
          duration_days: durationDays,
          durationDays,
          pricing_rule_label: ruleLabel,
          pricingRuleLabel: ruleLabel,
          theme: themeInfo,
          selected_mode: selectedMode,
          calculation: selectedCalculation,
          wallet: walletSummary,
          options,
          is_payable: selectedCalculation.isPayable,
          reasons: selectedCalculation.reasons,
        }, 200, cors);
      }

      if (pathname === '/api/events' && method === 'POST') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const user = auth.user!;
        const organizationId = auth.jwtPayload?.organizationId;

        if (!organizationId) {
          return errorResponse('No active organization selected', 422, cors);
        }

        const { isMember, hasPermission } = await verifyOrgMembershipAndPermission(user.id, organizationId, 'event.create', env);
        if (!isMember || !hasPermission) {
          return errorResponse('Permission denied: Only owners and admins can create events', 403, cors);
        }

        const body = (await request.json().catch(() => ({}))) as any;
        const {
          name,
          game_id,
          game_theme_id,
          event_date,
          start_date,
          end_date,
          startDate,
          endDate,
          starts_at,
          expires_at,
          event_price,
          event_timezone,
        } = body;

        if (!name || typeof name !== 'string' || !name.trim()) {
          return errorResponse('Event name is required', 422, cors);
        }

        if (!game_theme_id) {
          return errorResponse('Game Theme selection is required', 422, cors);
        }

        const resolvedStart = start_date || startDate || event_date || (starts_at ? starts_at.slice(0, 10) : null);
        const resolvedEnd = end_date || endDate || (expires_at ? expires_at.slice(0, 10) : resolvedStart);

        if (!resolvedStart || !resolvedEnd) {
          return errorResponse('Start date and End date are required', 422, cors);
        }

        // Security check: Reject any client attempt to set initial event status to PAID or LIVE, or inject sensitive fields
        if (
          (body.payment_status && String(body.payment_status).toUpperCase() !== 'UNPAID') ||
          (body.event_status && String(body.event_status).toUpperCase() !== 'DRAFT') ||
          (body.status && !['draft', 'pending_payment'].includes(String(body.status).toLowerCase())) ||
          body.paid_amount !== undefined ||
          body.discount_amount !== undefined ||
          body.payment_mode !== undefined ||
          body.cancel_reason !== undefined
        ) {
          return errorResponse('Direct initialization of event payment, paid amounts, or live lifecycle status is strictly prohibited.', 400, cors);
        }

        try {
          if (resolvedEnd < resolvedStart) {
            return jsonResponse({
              code: 'INVALID_DATE_RANGE',
              error: 'The event end date cannot be earlier than the start date. Please select a valid date range.',
            }, 422, cors);
          }

          // Create event with DRAFT event_status and UNPAID payment_status (no wallet balance deducted)
          const created = await createEvent(
            {
              organization_id: organizationId,
              game_id,
              game_theme_id,
              name,
              event_date: resolvedStart,
              start_date: resolvedStart,
              end_date: resolvedEnd,
              startDate: resolvedStart,
              endDate: resolvedEnd,
              starts_at,
              expires_at,
              status: 'draft',
              event_status: 'DRAFT',
              payment_status: 'UNPAID',
              created_by: user.id,
              event_price,
              event_timezone,
            },
            env
          );

          const enriched = await getEventById(created.id, env);

          return jsonResponse({
            success: true,
            event: enriched || created,
          }, 201, cors);
        } catch (err: any) {
          console.error('Create event error in worker:', err);
          if (
            err.code === 'PENDING_EVENT_LIMIT_REACHED' ||
            String(err.message || '').includes('PENDING_EVENT_LIMIT_REACHED') ||
            String(err.message || '').includes('Maximum 2 pending payment events reached')
          ) {
            return jsonResponse({
              error: 'Maximum 2 pending payment events reached. Please pay for or delete an existing pending event.',
              code: 'PENDING_EVENT_LIMIT_REACHED',
            }, 422, cors);
          }
          if (
            err.code === 'GAME_INACTIVE' ||
            err.code === 'THEME_GAME_MISMATCH' ||
            err.code === 'GAME_NOT_FOUND' ||
            err.code === 'THEME_NOT_FOUND' ||
            err.code === 'THEME_FORBIDDEN' ||
            err.code === 'SYSTEM_THEME_NOT_ALLOWED' ||
            err.code === 'THEME_INACTIVE' ||
            err.code === 'GAME_NOT_SPECIFIED' ||
            err.code === 'THEME_SETUP_REQUIRED' ||
            err.code === 'ORGANIZATION_NOT_FOUND' ||
            err.code === 'MAX_DURATION_EXCEEDED' ||
            err.code === 'INVALID_DATE_RANGE' ||
            err.code === 'EVENT_DATE_PASSED' ||
            err.code === 'NO_ACTIVE_GAME_PRICING' ||
            err.code === 'INVALID_GAME_PRICING' ||
            err.code === 'UNSUPPORTED_DURATION' ||
            err.code === 'VALIDATION_ERROR'
          ) {
            const status =
              err.status ||
              (err.code === 'THEME_NOT_FOUND' || err.code === 'GAME_NOT_FOUND' || err.code === 'ORGANIZATION_NOT_FOUND' ? 404 :
               err.code === 'THEME_FORBIDDEN' ? 403 :
               err.code === 'NO_ACTIVE_GAME_PRICING' || err.code === 'INVALID_GAME_PRICING' ? 503 : 422);
            return jsonResponse({
              error: err.message || 'Validation error',
              code: err.code,
              ...(err.theme_setup_required ? { theme_setup_required: true } : {}),
            }, status, cors);
          }
          return handleWorkerApiError(err, request, cors, env, {
            endpoint: '/api/events',
            method: 'POST',
            userId: user?.id,
            parsedBody: body,
            metadata: {
              stage: err?.stage || 'event_creation',
              rpcName: err?.rpcName || 'create_event_atomic',
              operation: 'create_event',
              fallbackAttempted: Boolean(err?.fallbackAttempted),
              eventCreated: Boolean(err?.eventCreated),
              postgresCode: err?.postgresCode || err?.code || null,
              details: err?.details || null,
            },
          });
        }
      }

      const payEventDirectParams = parseRoute('/api/events/:eventId/pay', pathname) || parseRoute('/events/:eventId/pay', pathname);
      if (payEventDirectParams && method === 'POST') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const user = auth.user!;
        const { eventId } = payEventDirectParams;

        const event = await getEventById(eventId, env);
        if (!event) {
          return errorResponse('Event not found', 404, cors);
        }

        const { isMember, hasPermission } = await verifyOrgMembershipAndPermission(user.id, event.organization_id, 'event.pay', env);
        if (!isMember || !hasPermission) {
          return errorResponse('Permission denied: Only owners and admins can pay for events', 403, cors);
        }

        const body = (await request.json().catch(() => ({}))) as any;
        const {
          payment_mode = 'FULL_PAID',
          topup_credit_requested,
          use_welcome_credit,
          use_event_credit,
          welcome_credit_requested,
          reference_id,
        } = body;

        // Load authoritative event price and currency from the event record - fail closed if missing or invalid
        const numericPrice = event.event_price !== undefined && event.event_price !== null ? Number(event.event_price) : NaN;
        const currency = typeof event.event_currency === 'string' ? event.event_currency.trim().toUpperCase() : '';

        if (isNaN(numericPrice) || numericPrice <= 0 || !currency) {
          return handleWorkerApiError(
            new PricingConfigurationError('Pricing configuration error: Event is missing a valid authoritative price or currency. Payment cannot proceed.'),
            request,
            cors,
            env
          );
        }
        const authoritativeEventPrice = numericPrice;

        try {
          const result = await processEventPayment(
            {
              organizationId: event.organization_id,
              eventId: event.id,
              eventName: event.name,
              paymentMode: payment_mode,
              useWelcomeCredit: use_welcome_credit,
              useEventCredit: use_event_credit,
              welcomeCreditRequested: welcome_credit_requested,
              topupCreditRequested: topup_credit_requested,
              eventPrice: authoritativeEventPrice,
              referenceId: reference_id,
              createdBy: user.id,
            },
            env
          );

          const updatedEvent = await getEventById(event.id, env);
          return jsonResponse({
            success: true,
            event: updatedEvent,
            payment: result,
          }, 200, cors);
        } catch (err: any) {
          console.error('Pay event error in worker:', err);
          const isInsufficient =
            err.code === 'INSUFFICIENT_BALANCE' ||
            (err.message && err.message.toLowerCase().includes('insufficient'));
          if (isInsufficient) {
            return jsonResponse({
              code: 'INSUFFICIENT_BALANCE',
              error: err.message || 'Insufficient balance',
              required: err.required,
              available: err.available,
              shortfall: err.shortfall,
            }, 402, cors);
          }
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      const updateEventParams = parseRoute('/api/events/:eventId', pathname);
      if (updateEventParams && (method === 'PUT' || method === 'PATCH')) {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const user = auth.user!;
        const { eventId } = updateEventParams;

        const event = await getEventById(eventId, env);
        if (!event) {
          return errorResponse('Event not found', 404, cors);
        }

        const { isMember, hasPermission } = await verifyOrgMembershipAndPermission(user.id, event.organization_id, 'event.edit', env);
        if (!isMember || !hasPermission) {
          return errorResponse('Permission denied: Only owners and admins can edit event configuration', 403, cors);
        }

        // Security Rule: Paid event = admin/user cannot manually edit event setup.
        const isPaid = (event.payment_status || '').toUpperCase() === 'PAID';
        if (isPaid) {
          return jsonResponse(
            {
              error: 'Event setup cannot be modified after payment has been completed.',
              code: 'EVENT_LOCKED_AFTER_PAYMENT',
            },
            403,
            cors
          );
        }

        const body = (await request.json().catch(() => ({}))) as any;

        // Security check: Block attempts to mutate sensitive / lifecycle / payment columns via standard event edit
        const forbiddenFields = [
          'payment_status',
          'event_status',
          'paid_amount',
          'discount_amount',
          'event_price',
          'payment_mode',
          'cancel_reason',
          'organization_id',
          'public_token',
          'created_by',
          'test_scores_cleared_at',
          'id',
        ];
        for (const field of forbiddenFields) {
          if (body[field] !== undefined) {
            return errorResponse(
              `Modifying protected field '${field}' is strictly prohibited. Event payment, pricing, and lifecycle statuses can only be modified through authoritative payment and lifecycle workflows.`,
              400,
              cors
            );
          }
        }

        if (body.status !== undefined && body.status !== 'draft' && body.status !== 'scheduled') {
          return errorResponse(
            `Modifying protected field 'status' to '${body.status}' is strictly prohibited. Event payment, pricing, and lifecycle statuses can only be modified through authoritative payment and lifecycle workflows.`,
            400,
            cors
          );
        }

        const {
          name,
          game_theme_id,
          event_date,
          start_date,
          end_date,
          startDate,
          endDate,
          starts_at,
          expires_at,
          status,
          event_timezone,
        } = body;

        try {
          const updated = await updateEvent(
            eventId,
            {
              name,
              game_theme_id,
              event_date,
              start_date,
              end_date,
              startDate,
              endDate,
              starts_at,
              expires_at,
              status,
              event_timezone,
            },
            env
          );

          const enriched = await getEventById(updated.id, env);
          return jsonResponse({ event: enriched }, 200, cors);
        } catch (updateErr: any) {
          console.error('Update event error in worker:', updateErr);
          return handleWorkerApiError(updateErr, request, cors, env);
        }
      }

      const deleteEventParams = parseRoute('/api/events/:eventId', pathname);
      if (deleteEventParams && method === 'DELETE') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const user = auth.user!;
        const { eventId } = deleteEventParams;

        const event = await getEventById(eventId, env);
        if (!event) {
          return errorResponse('Event not found', 404, cors);
        }

        const { isMember, hasPermission } = await verifyOrgMembershipAndPermission(user.id, event.organization_id, 'event.manage', env);
        if (!isMember || !hasPermission) {
          return errorResponse('Permission denied: Only owners and admins can delete events', 403, cors);
        }

        const eligibility = canDeleteEvent(event);
        if (!eligibility.canDelete) {
          return jsonResponse({
            error: eligibility.reason,
            message: eligibility.reason,
            reason: eligibility.reason,
            code: eligibility.code,
            eligibility,
          }, 422, cors);
        }

        await deleteEvent(eventId, undefined, env);
        return jsonResponse({ success: true, message: 'Event deleted successfully' }, 200, cors);
      }

      const deleteEligibilityParams = parseRoute('/api/events/:eventId/deletion-eligibility', pathname);
      if (deleteEligibilityParams && method === 'GET') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const user = auth.user!;
        const { eventId } = deleteEligibilityParams;

        const event = await getEventById(eventId, env);
        if (!event) {
          return errorResponse('Event not found', 404, cors);
        }

        const { isMember, hasPermission } = await verifyOrgMembershipAndPermission(user.id, event.organization_id, 'event.view', env);
        if (!isMember || !hasPermission) {
          return errorResponse('Permission denied', 403, cors);
        }

        const eligibility = canDeleteEvent(event);
        return jsonResponse({ eligibility }, 200, cors);
      }

      const cancelEligibilityParams = parseRoute('/api/events/:eventId/cancellation-eligibility', pathname);
      if (cancelEligibilityParams && method === 'GET') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const user = auth.user!;
        const { eventId } = cancelEligibilityParams;

        const event = await getEventById(eventId, env);
        if (!event) {
          return errorResponse('Event not found', 404, cors);
        }

        const { isMember, hasPermission } = await verifyOrgMembershipAndPermission(user.id, event.organization_id, 'event.view', env);
        if (!isMember || !hasPermission) {
          return errorResponse('Permission denied', 403, cors);
        }

        const eligibility = canCancelEvent(event);
        const refund = determineEventRefund(event);
        return jsonResponse({ eligibility, refund }, 200, cors);
      }

      const cancelEventParams = parseRoute('/api/events/:eventId/cancel', pathname);
      if (cancelEventParams && method === 'POST') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const user = auth.user!;
        const { eventId } = cancelEventParams;

        const event = await getEventById(eventId, env);
        if (!event) {
          return errorResponse('Event not found', 404, cors);
        }

        const { isMember, hasPermission } = await verifyOrgMembershipAndPermission(user.id, event.organization_id, 'event.cancel', env);
        if (!isMember || !hasPermission) {
          return errorResponse('Permission denied: Only owners and admins can cancel events', 403, cors);
        }

        const eligibility = canCancelEvent(event);
        if (!eligibility.canCancel) {
          return jsonResponse({
            error: eligibility.reason,
            message: eligibility.reason,
            reason: eligibility.reason,
            code: eligibility.code,
            eligibility,
          }, 422, cors);
        }

        const body = (await request.json().catch(() => ({}))) as any;
        try {
          const cancelled = await cancelEvent(
            eventId,
            {
              cancelledBy: user.id,
              cancelReason: body?.cancel_reason || body?.cancelReason || 'USER_CANCELLED',
              reason: body?.reason || 'User cancelled event before Setup Day',
            },
            env
          );

          const enriched = await getEventById(cancelled.id, env);
          return jsonResponse({
            success: true,
            event: enriched,
            eligibility: cancelled.eligibility,
            refundResult: cancelled.refundResult,
          }, 200, cors);
        } catch (err: any) {
          if (
            err.status === 422 ||
            err.code === 'ALREADY_CANCELLED' ||
            err.code === 'SETUP_DAY_STARTED' ||
            err.code === 'EVENT_COMPLETED' ||
            err.code === 'EVENT_ACTIVE' ||
            err.code === 'EVENT_NOT_PAID' ||
            err.code === 'REFUND_NOT_ALLOWED'
          ) {
            return jsonResponse({
              error: err.message?.replace(/^Cancellation rejected:\s*/, '') || err.message,
              message: err.message?.replace(/^Cancellation rejected:\s*/, '') || err.message,
              reason: err.message?.replace(/^Cancellation rejected:\s*/, '') || err.message,
              code: err.code,
              eligibility: err.eligibility,
            }, 422, cors);
          }
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      const publicEventParams = parseRoute('/api/public/events/:publicToken', pathname);
      if (publicEventParams && method === 'GET') {
        const { publicToken } = publicEventParams;
        if (!publicToken) {
          return errorResponse('Public token required', 422, cors);
        }

        const rawEvent = await getEventByPublicToken(publicToken, env, { allowUnpaid: true });
        if (!rawEvent) {
          return errorResponse('Event not found or invalid URL', 404, cors);
        }

        const accessDetails = getClientLiveGameAccessDetails(rawEvent);
        const { startDate, endDate, liveOpenDate } = getNormalizedEventDates(rawEvent);

        if (!accessDetails.canAccess) {
          if (accessDetails.code === 'EVENT_CANCELLED') {
            return jsonResponse({
              error: accessDetails.error || 'This event has been cancelled.',
              code: 'EVENT_CANCELLED',
              is_cancelled: true,
            }, 403, {
              ...cors,
              'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
              'Pragma': 'no-cache',
              'Expires': '0',
            });
          }

          if (accessDetails.code === 'EVENT_COMPLETED' || accessDetails.code === 'EVENT_EXPIRED') {
            return jsonResponse({
              error: accessDetails.error || `This event concluded on ${endDate}.`,
              code: accessDetails.code,
              is_expired: true,
              is_completed: accessDetails.code === 'EVENT_COMPLETED',
              start_date: startDate,
              end_date: endDate,
              event_id: rawEvent.id,
              event_name: rawEvent.name,
              event_timezone: accessDetails.event_timezone || rawEvent.event_timezone,
            }, 403, {
              ...cors,
              'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
              'Pragma': 'no-cache',
              'Expires': '0',
            });
          }

          if (accessDetails.code === 'PAYMENT_REQUIRED') {
            return jsonResponse({
              error: accessDetails.error || 'This event is currently awaiting payment and activation. Public game access is disabled until paid.',
              code: 'PAYMENT_REQUIRED',
              is_pending_payment: true,
              event_id: rawEvent.id,
              event_name: rawEvent.name,
              start_date: startDate,
              end_date: endDate,
              live_open_date: liveOpenDate,
              event_timezone: accessDetails.event_timezone || rawEvent.event_timezone,
            }, 403, {
              ...cors,
              'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
              'Pragma': 'no-cache',
              'Expires': '0',
            });
          }

          if (accessDetails.code === 'EVENT_NOT_OPEN') {
            return jsonResponse({
              error: accessDetails.error || `This event is scheduled to open on ${liveOpenDate}. Live URL will become active on ${liveOpenDate}.`,
              code: 'EVENT_NOT_OPEN',
              is_scheduled: true,
              live_open_date: liveOpenDate,
              start_date: startDate,
              end_date: endDate,
              event_id: rawEvent.id,
              event_name: rawEvent.name,
              event_timezone: accessDetails.event_timezone || rawEvent.event_timezone,
            }, 403, {
              ...cors,
              'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
              'Pragma': 'no-cache',
              'Expires': '0',
            });
          }

          // Safe catch-all 403 for any other disallowed state
          return jsonResponse({
            error: accessDetails.error || accessDetails.reason || 'This event is not available for live play.',
            code: accessDetails.code || 'EVENT_NOT_LIVE',
            is_expired: Boolean(accessDetails.is_expired),
            is_completed: Boolean(accessDetails.is_completed),
            start_date: startDate,
            end_date: endDate,
            event_id: rawEvent.id,
            event_name: rawEvent.name,
            event_timezone: accessDetails.event_timezone || rawEvent.event_timezone,
          }, 403, {
            ...cors,
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
          });
        }

        const translations = await getEventTranslations(rawEvent.id);
        rawEvent.translations = translations;
        const publicEvent = toPublicEventDTO(rawEvent);
        return jsonResponse({ event: publicEvent }, 200, {
          ...cors,
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        });
      }

      // ==========================================
      // 8.5 Event High Score Board Endpoints
      // ==========================================

      // GET /api/public/events/:publicToken/high-scores
      const publicScoresParams = parseRoute('/api/public/events/:publicToken/high-scores', pathname);
      if (publicScoresParams && method === 'GET') {
        const { publicToken } = publicScoresParams;
        if (!publicToken) {
          return errorResponse('Public token required', 422, cors);
        }

        const event = await getEventByPublicToken(publicToken, env, { allowUnpaid: true });
        if (!event) {
          return errorResponse('Event not found', 404, cors);
        }

        const limit = Number(url.searchParams.get('limit') || 20);
        const page = Number(url.searchParams.get('page') || 1);

        // Security check: Public high scores are only available if the event is in the public live window
        // (PAID, within live window Setup Day through End Date, and not cancelled).
        // Pre-event test scores are strictly quarantined and never returned to public players.
        const isLiveAllowed = canAccessLiveEvent(event);

        if (!isLiveAllowed) {
          return jsonResponse({
            event_id: event.id,
            event_name: event.name,
            scores: [],
            totalCount: 0,
            page,
            limit,
            score_environment: 'live',
            is_test_mode: false,
          }, 200, cors);
        }

        const result = await getEventHighScores(event.id, { limit, page, scoreEnvironment: 'live' }, env);
        return jsonResponse({
          event_id: event.id,
          event_name: event.name,
          ...result,
        }, 200, cors);
      }

      // POST /api/public/events/:publicToken/high-scores
      if (publicScoresParams && method === 'POST') {
        const { publicToken } = publicScoresParams;
        if (!publicToken) {
          return errorResponse('Public token required', 422, cors);
        }

        const event = await getEventByPublicToken(publicToken, env, { allowUnpaid: true });
        if (!event) {
          return errorResponse('Event not found', 404, cors);
        }

        // Security check: Public score submissions strictly require canAccessLiveEvent(event) === true
        // (PAID, within live window Setup Day through End Date, and not cancelled).
        // Pre-event/test scores must only go through authenticated organizer endpoints.
        if (!canAccessLiveEvent(event)) {
          const accessDetails = getClientLiveGameAccessDetails(event);
          return jsonResponse({
            error: accessDetails.reason || 'Score submissions are only permitted for active, paid live events.',
            code: accessDetails.code || 'EVENT_NOT_LIVE',
          }, 403, cors);
        }

        const body = (await request.json().catch(() => ({}))) as any;
        const { player_name, score, metadata, session_id, sessionId } = body;

        if (score === undefined || score === null || isNaN(Number(score))) {
          return errorResponse('Valid numerical score is required', 422, cors);
        }

        const incomingSessionId =
          session_id !== undefined ? session_id :
          sessionId !== undefined ? sessionId :
          (metadata && typeof metadata === 'object' && metadata.sessionId !== undefined ? metadata.sessionId :
          (metadata && typeof metadata === 'object' && metadata.session_id !== undefined ? metadata.session_id : undefined));

        // Public submissions are strictly LIVE scores. Disallow untrusted test mode flags from public payload.
        const cleanMetadata = typeof metadata === 'object' && metadata ? { ...metadata } : {};
        delete cleanMetadata.isEventTest;
        delete cleanMetadata.is_test;
        cleanMetadata.isPublicSubmission = true;
        cleanMetadata.score_environment = 'LIVE';

        try {
          const result = await submitEventScore(
            {
              event_id: event.id,
              player_name,
              score: Number(score),
              session_id: incomingSessionId,
              metadata: cleanMetadata,
            },
            env
          );

          return jsonResponse({
            success: true,
            event_id: event.id,
            event_name: event.name,
            ...result,
          }, 201, cors);
        } catch (err: any) {
          console.error('Submit public score error:', err);
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // GET & POST /api/events/:eventId/admin/high-scores (Organizer High Scores & Stats)
      const adminScoresParams = parseRoute('/api/events/:eventId/admin/high-scores', pathname);
      if (adminScoresParams && method === 'GET') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const user = auth.user!;
        const { eventId } = adminScoresParams;

        const event = await getEventById(eventId, env);
        if (!event) {
          return errorResponse('Event not found', 404, cors);
        }

        const { isMember, hasPermission } = await verifyOrgMembershipAndPermission(user.id, event.organization_id, 'event.view', env);
        if (!isMember || !hasPermission) {
          return errorResponse('Permission denied: Insufficient permissions to view event scores', 403, cors);
        }

        const limit = Number(url.searchParams.get('limit') || 100);
        const page = Number(url.searchParams.get('page') || 1);

        const leaderboard = await getEventHighScores(eventId, { limit, page, scoreEnvironment: 'all', includeTestScores: true }, env);
        const stats = await getEventScoreStats(eventId, env);
        const testScoresCount = await getEventTestScoresCount(eventId, env);
        const isBeforeStart = isEventBeforeStartDate(event);

        return jsonResponse({
          event_id: eventId,
          event_name: event.name,
          ...leaderboard,
          stats,
          test_scores_count: testScoresCount,
          is_before_start_date: isBeforeStart,
        }, 200, cors);
      }

      if (adminScoresParams && method === 'POST') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const user = auth.user!;
        const { eventId } = adminScoresParams;

        const event = await getEventById(eventId, env);
        if (!event) {
          return errorResponse('Event not found', 404, cors);
        }

        const { isMember, hasPermission } = await verifyOrgMembershipAndPermission(user.id, event.organization_id, 'event.view', env);
        if (!isMember || !hasPermission) {
          return errorResponse('Permission denied: Insufficient permissions to submit event scores', 403, cors);
        }

        const body = (await request.json().catch(() => ({}))) as any;
        const { player_name, score, metadata = {}, session_id, sessionId } = body;

        if (score === undefined || score === null || isNaN(Number(score))) {
          return errorResponse('Valid numerical score is required', 422, cors);
        }

        const incomingSessionId =
          session_id !== undefined ? session_id :
          sessionId !== undefined ? sessionId :
          (metadata && typeof metadata === 'object' && metadata.sessionId !== undefined ? metadata.sessionId :
          (metadata && typeof metadata === 'object' && metadata.session_id !== undefined ? metadata.session_id : undefined));

        // Security boundary: Internal organizer submissions via admin endpoint are strictly quarantined as test scores.
        const safeMetadata = typeof metadata === 'object' && metadata ? { ...metadata } : {};
        safeMetadata.isEventTest = true;
        safeMetadata.is_test = true;
        safeMetadata.score_environment = 'test';

        try {
          const result = await submitEventScore(
            {
              event_id: eventId,
              player_name,
              score: Number(score),
              session_id: incomingSessionId,
              metadata: safeMetadata,
            },
            env
          );

          return jsonResponse({
            success: true,
            event_id: eventId,
            ...result,
          }, 201, cors);
        } catch (err: any) {
          console.error('Submit organizer score error:', err);
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // POST /api/events/:eventId/test-scores/clear (Manual Clear Test Scores)
      const clearTestScoresParams =
        parseRoute('/api/events/:eventId/test-scores/clear', pathname) ||
        parseRoute('/api/events/:eventId/admin/test-scores/clear', pathname);
      if (clearTestScoresParams && method === 'POST') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const user = auth.user!;
        const { eventId } = clearTestScoresParams;

        const event = await getEventById(eventId, env);
        if (!event) {
          return errorResponse('Event not found', 404, cors);
        }

        const { isMember, hasPermission } = await verifyOrgMembershipAndPermission(user.id, event.organization_id, 'event.manage', env);
        if (!isMember || !hasPermission) {
          return errorResponse('Permission denied: Only organization owners and admins can clear test scores', 403, cors);
        }

        // Safety rule: Event must NOT have reached its start date
        if (!isEventBeforeStartDate(event)) {
          return jsonResponse({
            error: 'Cannot manually clear test scores: Event has already reached its start date or is live.',
            code: 'EVENT_ALREADY_STARTED',
          }, 400, cors);
        }

        const result = await manualClearEventTestScores(eventId, env);
        return jsonResponse({
          success: true,
          message: 'Test scores cleared.',
          clearedCount: result.clearedCount,
          deleted_count: result.deleted_count,
        }, 200, cors);
      }

      // POST /api/events/:eventId/high-scores/clear or /admin/high-scores/clear (Leaderboard Reset)
      const clearScoresParams =
        parseRoute('/api/events/:eventId/admin/high-scores/clear', pathname) ||
        parseRoute('/api/events/:eventId/high-scores/clear', pathname);
      if (clearScoresParams && method === 'POST') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const user = auth.user!;
        const { eventId } = clearScoresParams;

        const event = await getEventById(eventId, env);
        if (!event) {
          return errorResponse('Event not found', 404, cors);
        }

        const { isMember, hasPermission } = await verifyOrgMembershipAndPermission(user.id, event.organization_id, 'event.manage', env);
        if (!isMember || !hasPermission) {
          return errorResponse('Permission denied: Only organization owners and admins can reset event leaderboards', 403, cors);
        }

        await clearEventHighScores(eventId, env);
        return jsonResponse({
          success: true,
          message: 'Event leaderboard reset successfully',
        }, 200, cors);
      }

      // DELETE /api/events/:eventId/high-scores/:scoreId or /admin/high-scores/:scoreId (Delete specific score)
      const deleteScoreParams =
        parseRoute('/api/events/:eventId/admin/high-scores/:scoreId', pathname) ||
        parseRoute('/api/events/:eventId/high-scores/:scoreId', pathname);
      if (deleteScoreParams && method === 'DELETE') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const user = auth.user!;
        const { eventId, scoreId } = deleteScoreParams;

        const event = await getEventById(eventId, env);
        if (!event) {
          return errorResponse('Event not found', 404, cors);
        }

        const { isMember, hasPermission } = await verifyOrgMembershipAndPermission(user.id, event.organization_id, 'event.manage', env);
        if (!isMember || !hasPermission) {
          return errorResponse('Permission denied: Only owners and admins can delete scores', 403, cors);
        }

        await deleteEventScore(eventId, scoreId, env);
        return jsonResponse({
          success: true,
          message: 'Score deleted successfully',
        }, 200, cors);
      }

      // Ambiguous middle endpoint REMOVED: /api/events/:eventId/high-scores
      // Public scores are strictly via /api/public/events/:publicToken/high-scores (live scores only).
      // Organizer scores are strictly via /api/events/:eventId/admin/high-scores (TEST + LIVE scores with authentication).
      const deprecatedScoresParams = parseRoute('/api/events/:eventId/high-scores', pathname);
      if (deprecatedScoresParams) {
        return jsonResponse({
          error: 'Endpoint removed. Public players must use /api/public/events/:publicToken/high-scores (live scores only). Organizers must use /api/events/:eventId/admin/high-scores (TEST + LIVE scores with authentication).',
          code: 'ENDPOINT_REMOVED',
        }, 404, cors);
      }

      // ==========================================
      // 9. Event Showcase and Showcase Media Routes
      // ==========================================

      const showcaseRouteParams = parseRoute('/api/events/:eventId/showcase', pathname);

      // GET /api/events/:eventId/showcase
      if (showcaseRouteParams && method === 'GET') {
        const { eventId } = showcaseRouteParams;
        const event = await getEventById(eventId, env);
        if (!event) {
          return errorResponse('Event not found', 404, cors);
        }

        const showcase = await getShowcaseByEventId(eventId, env);

        // Check optional auth for org membership (supports both App JWT and Supabase JWT)
        let isOrgMember = false;
        const auth = await authenticateOptionalJWT(request, env);
        if (auth.authenticated && auth.user) {
          const { isMember, hasPermission } = await verifyOrgMembershipAndPermission(auth.user.id, event.organization_id, 'event.view', env);
          isOrgMember = isMember && hasPermission;
        }

        if (!showcase) {
          if (isOrgMember) {
            const lifetimeRewardStatus = auth.user?.id ? await getOwnerShowcaseRewardStatus(auth.user.id, env) : null;
            const rewardSubmission = await getShowcaseRewardSubmissionForEvent(eventId, env);
            const userSubmission = auth.user?.id ? await getActiveUserShowcaseRewardSubmission(auth.user.id, env) : null;
            const rewardEligibility = auth.user?.id ? await checkShowcaseRewardEligibility({ eventId, userId: auth.user.id }, env) : null;
            return jsonResponse({
              showcase: null,
              lifetimeRewardStatus,
              reward_submission: rewardSubmission,
              user_submission: userSubmission,
              reward_eligibility: rewardEligibility,
            }, 200, cors);
          }
          return errorResponse('Showcase not found', 404, cors);
        }

        if (isOrgMember) {
          const lifetimeRewardStatus = auth.user?.id ? await getOwnerShowcaseRewardStatus(auth.user.id, env) : null;
          const rewardSubmission = await getShowcaseRewardSubmissionForEvent(eventId, env);
          const userSubmission = auth.user?.id ? await getActiveUserShowcaseRewardSubmission(auth.user.id, env) : null;
          const rewardEligibility = auth.user?.id ? await checkShowcaseRewardEligibility({ eventId, userId: auth.user.id }, env) : null;
          return jsonResponse({
            showcase,
            lifetimeRewardStatus,
            reward_submission: rewardSubmission,
            user_submission: userSubmission,
            reward_eligibility: rewardEligibility,
          }, 200, cors);
        }

        if (showcase.status === 'PUBLISHED') {
          return jsonResponse({ showcase }, 200, cors);
        }

        return errorResponse('Showcase is not published', 404, cors);
      }

      // POST /api/events/:eventId/showcase/reward-submission
      const showcaseRewardSubRoute = parseRoute('/api/events/:eventId/showcase/reward-submission', pathname);
      if (showcaseRewardSubRoute && method === 'POST') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        try {
          const { eventId } = showcaseRewardSubRoute;
          const submission = await createShowcaseRewardSubmission({
            eventId,
            userId: auth.user.id,
            env,
          });

          return jsonResponse({
            success: true,
            submission,
            message: 'Showcase submitted for RM300 reward review',
          }, 201, cors);
        } catch (err: any) {
          console.error('Showcase reward submission error:', err);
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // GET /api/events/:eventId/showcase/reward-submission
      if (showcaseRewardSubRoute && method === 'GET') {
        try {
          const { eventId } = showcaseRewardSubRoute;
          const auth = await authenticateOptionalJWT(request, env);
          const submission = await getShowcaseRewardSubmissionForEvent(eventId, env);
          const userId = auth.user?.id;
          const userSubmission = userId ? await getActiveUserShowcaseRewardSubmission(userId, env) : null;
          const eligibility = userId
            ? await checkShowcaseRewardEligibility({ eventId, userId }, env)
            : null;

          return jsonResponse({
            submission,
            user_submission: userSubmission,
            eligibility,
          }, 200, cors);
        } catch (err: any) {
          console.error('Get showcase reward submission error:', err);
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // GET /api/showcases/:id
      const publicShowcaseParams = parseRoute('/api/showcases/:id', pathname);
      if (publicShowcaseParams && method === 'GET') {
        const { id } = publicShowcaseParams;
        let showcase = await getShowcaseById(id, env);
        if (!showcase) {
          showcase = await getShowcaseByEventId(id, env);
        }
        if (!showcase) {
          return errorResponse('Showcase not found', 404, cors);
        }

        const event = await getEventById(showcase.event_id, env);
        if (!event) {
          return errorResponse('Associated event not found', 404, cors);
        }

        let isOrgMember = false;
        const auth = await authenticateOptionalJWT(request, env);
        if (auth.authenticated && auth.user) {
          if (auth.user.is_developer) {
            isOrgMember = true;
          } else {
            const { isMember, hasPermission } = await verifyOrgMembershipAndPermission(auth.user.id, event.organization_id, 'event.view', env);
            isOrgMember = isMember && hasPermission;
          }
        }

        if (!isOrgMember && showcase.status !== 'PUBLISHED') {
          return errorResponse('Showcase is not publicly accessible', 404, cors);
        }

        try {
          const media = await getShowcaseMedia(showcase.id, event.organization_id, env);
          const publicEvent = {
            id: event.id,
            name: event.name,
            game_type: event.game?.game_type || event.game_id || null,
            start_date: event.start_date,
            end_date: event.end_date,
            event_timezone: (event as any).event_timezone || 'Asia/Singapore',
          };
          return jsonResponse({
            showcase,
            event: publicEvent,
            media,
            isPreview: isOrgMember && showcase.status !== 'PUBLISHED',
          }, 200, cors);
        } catch (err: any) {
          console.error('Get public showcase error:', err);
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // GET /api/showcases/:id/media
      const publicShowcaseMediaParams = parseRoute('/api/showcases/:id/media', pathname);
      if (publicShowcaseMediaParams && method === 'GET') {
        const { id } = publicShowcaseMediaParams;
        let showcase = await getShowcaseById(id, env);
        if (!showcase) {
          showcase = await getShowcaseByEventId(id, env);
        }
        if (!showcase) {
          return errorResponse('Showcase not found', 404, cors);
        }

        const event = await getEventById(showcase.event_id, env);
        if (!event) {
          return errorResponse('Associated event not found', 404, cors);
        }

        let isOrgMember = false;
        const auth = await authenticateOptionalJWT(request, env);
        if (auth.authenticated && auth.user) {
          if (auth.user.is_developer) {
            isOrgMember = true;
          } else {
            const { isMember, hasPermission } = await verifyOrgMembershipAndPermission(auth.user.id, event.organization_id, 'event.view', env);
            isOrgMember = isMember && hasPermission;
          }
        }

        if (!isOrgMember && showcase.status !== 'PUBLISHED') {
          return errorResponse('Showcase media is not publicly accessible', 403, cors);
        }

        try {
          const media = await getShowcaseMedia(showcase.id, event.organization_id, env);
          return jsonResponse({ media }, 200, cors);
        } catch (err: any) {
          console.error('Get showcase media error:', err);
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // POST /api/events/:eventId/showcase
      if (showcaseRouteParams && method === 'POST') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const { eventId } = showcaseRouteParams;
        const event = await getEventById(eventId, env);
        if (!event) {
          return errorResponse('Event not found', 404, cors);
        }

        const { isMember, hasPermission } = await verifyOrgMembershipAndPermission(auth.user.id, event.organization_id, 'event.edit', env);
        if (!isMember || !hasPermission) {
          return errorResponse('Permission denied: Only owners and admins can create event showcases', 403, cors);
        }

        const showcaseEligibility = isEventEligibleForShowcase(event);
        if (!showcaseEligibility.eligible) {
          return errorResponse(showcaseEligibility.reason, 422, cors);
        }

        const existing = await getShowcaseByEventId(eventId, env);
        if (existing) {
          return jsonResponse({ error: 'An Event Showcase already exists for this event', showcase: existing }, 409, cors);
        }

        const body = (await request.json().catch(() => ({}))) as any;
        const { title, description, client_name, client_logo_url, cover_image_url, status } = body;

        if (title !== undefined && (typeof title !== 'string' || !title.trim())) {
          return errorResponse('Valid showcase title is required', 422, cors);
        }

        // In "Publish First, Moderate Later" model, default to PUBLISHED unless explicitly DRAFT or UNPUBLISHED
        const initialStatus = status === 'DRAFT' || status === 'UNPUBLISHED' ? status : 'PUBLISHED';

        try {
          const showcase = await createShowcase(
            {
              event_id: eventId,
              organization_id: event.organization_id,
              title: title ? title.trim() : event.name,
              description,
              client_name,
              client_logo_url,
              cover_image_url,
              status: initialStatus,
            },
            env
          );
          // Evaluate reward eligibility asynchronously
          evaluateShowcaseRewardEligibility(eventId, env).catch((err) => console.warn('Reward evaluation notice on creation:', err));
          return jsonResponse({ showcase }, 201, cors);
        } catch (err: any) {
          console.error('Create showcase error:', err);
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // PATCH /api/events/:eventId/showcase
      if (showcaseRouteParams && method === 'PATCH') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const { eventId } = showcaseRouteParams;
        const event = await getEventById(eventId, env);
        if (!event) {
          return errorResponse('Event not found', 404, cors);
        }

        const { isMember, hasPermission } = await verifyOrgMembershipAndPermission(auth.user.id, event.organization_id, 'event.edit', env);
        if (!isMember || !hasPermission) {
          return errorResponse('Permission denied: Only owners and admins can edit event showcases', 403, cors);
        }

        const showcaseEligibility = isEventEligibleForShowcase(event);
        if (!showcaseEligibility.eligible) {
          return errorResponse(showcaseEligibility.reason, 422, cors);
        }

        const existing = await getShowcaseByEventId(eventId, env);
        if (!existing) {
          return errorResponse('Event Showcase not found', 404, cors);
        }

        // Enforce Moderation Security: BLOCKED showcases cannot be edited by normal users
        if (existing.status === 'BLOCKED') {
          return errorResponse('This showcase has been blocked by administrators and cannot be edited. Please contact support.', 403, cors);
        }

        if (existing.status === 'DELETED' || existing.deleted_at) {
          return errorResponse('Event Showcase has been deleted', 404, cors);
        }

        const body = (await request.json().catch(() => ({}))) as any;
        const { title, description, client_name, client_logo_url, cover_image_url, status } = body;

        if (title !== undefined && (typeof title !== 'string' || !title.trim())) {
          return errorResponse('Showcase title cannot be empty', 422, cors);
        }

        // Normal users can only set visibility to PUBLISHED, UNPUBLISHED, or DRAFT
        let safeStatus: any = undefined;
        if (status !== undefined) {
          if (status === 'BLOCKED' || status === 'DELETED') {
            return errorResponse('Cannot set administrative moderation status directly.', 403, cors);
          }
          if (status === 'DRAFT' || status === 'UNPUBLISHED' || status === 'PUBLISHED') {
            safeStatus = status;
          }
        }

        try {
          const showcase = await updateShowcase(
            eventId,
            {
              title,
              description,
              client_name,
              client_logo_url,
              cover_image_url,
              status: safeStatus,
            },
            env
          );
          // Re-evaluate reward eligibility after update
          evaluateShowcaseRewardEligibility(eventId, env).catch((err) => console.warn('Reward evaluation notice on update:', err));
          return jsonResponse({ showcase }, 200, cors);
        } catch (err: any) {
          console.error('Update showcase error:', err);
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // POST /api/events/:eventId/showcase/publish
      const publishShowcaseParams = parseRoute('/api/events/:eventId/showcase/publish', pathname);
      if (publishShowcaseParams && method === 'POST') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const { eventId } = publishShowcaseParams;
        console.log(`[Worker Showcase Publish] eventId received: ${eventId}`);

        const event = await getEventById(eventId, env);
        console.log(`[Worker Showcase Publish] event existence: ${!!event}${event ? ` (id=${event.id}, name="${event.name}")` : ''}`);
        if (!event) {
          return errorResponse('Event not found', 404, cors);
        }

        const { isMember, hasPermission } = await verifyOrgMembershipAndPermission(auth.user.id, event.organization_id, 'event.edit', env);
        if (!isMember || !hasPermission) {
          return errorResponse('Permission denied: Only owners and admins can publish event showcases', 403, cors);
        }

        const showcaseEligibility = isEventEligibleForShowcase(event);
        if (!showcaseEligibility.eligible) {
          return errorResponse(showcaseEligibility.reason, 422, cors);
        }

        const existing = await getShowcaseByEventId(eventId, env);
        console.log(`[Worker Showcase Publish] showcase lookup result: ${existing ? `Found existing showcase (id=${existing.id}, status=${existing.status})` : 'None found (will create and publish new showcase)'}`);

        if (existing && existing.status === 'BLOCKED') {
          return errorResponse('Cannot publish a blocked showcase. Please contact support.', 403, cors);
        }

        let updates: any = undefined;
        try {
          const body = await request.json().catch(() => null);
          if (body && typeof body === 'object') {
            updates = {
              title: typeof body.title === 'string' ? body.title : undefined,
              description: typeof body.description === 'string' || body.description === null ? body.description : undefined,
              client_name: typeof body.client_name === 'string' || body.client_name === null ? body.client_name : undefined,
              client_logo_url: typeof body.client_logo_url === 'string' || body.client_logo_url === null ? body.client_logo_url : undefined,
              cover_image_url: typeof body.cover_image_url === 'string' || body.cover_image_url === null ? body.cover_image_url : undefined,
            };
          }
        } catch {
          // ignore empty body
        }

        try {
          const showcase = await publishShowcase(eventId, updates, env);
          console.log(`[Worker Showcase Publish] showcase ID: ${showcase.id}`);
          console.log(`[Worker Showcase Publish] publish/update result: status=${showcase.status}, publication_status=${showcase.publication_status}, event_id=${showcase.event_id}`);
          evaluateShowcaseRewardEligibility(eventId, env).catch((err) => console.warn('Reward evaluation notice on publish:', err));
          return jsonResponse({ showcase }, 200, cors);
        } catch (err: any) {
          const requestId = resolveCorrelationId(request);
          console.error(`[Worker Showcase Publish Error][${requestId}]:`, {
            requestId,
            eventId,
            userId: auth?.user?.id,
            organizationId: event?.organization_id,
            existingShowcaseId: existing?.id || null,
            existingShowcaseStatus: existing?.status || null,
            publishPath: 'publish_event_showcase',
            errorCode: err?.code || err?.statusCode || 'UNKNOWN_ERROR',
            errorMessage: err?.message || 'Unknown publish error',
            operation: 'publish_event_showcase',
          });
          return handleWorkerApiError(err, request, cors, env, {
            userId: auth?.user?.id,
            metadata: {
              eventId,
              organizationId: event?.organization_id,
              existingShowcaseId: existing?.id || null,
              existingShowcaseStatus: existing?.status || null,
              publishPath: 'publish_event_showcase',
              operation: 'publish_event_showcase',
              postgresCode: err?.code || null,
              details: err?.details || err?.message || null,
            },
          });
        }
      }

      // POST /api/events/:eventId/showcase/unpublish
      const unpublishShowcaseParams = parseRoute('/api/events/:eventId/showcase/unpublish', pathname);
      if (unpublishShowcaseParams && method === 'POST') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const { eventId } = unpublishShowcaseParams;
        const event = await getEventById(eventId, env);
        if (!event) {
          return errorResponse('Event not found', 404, cors);
        }

        const { isMember, hasPermission } = await verifyOrgMembershipAndPermission(auth.user.id, event.organization_id, 'event.edit', env);
        if (!isMember || !hasPermission) {
          return errorResponse('Permission denied: Only owners and admins can unpublish event showcases', 403, cors);
        }

        const existing = await getShowcaseByEventId(eventId, env);
        if (!existing) {
          return errorResponse('Event Showcase not found', 404, cors);
        }

        try {
          const showcase = await unpublishShowcase(eventId, env);
          return jsonResponse({ showcase }, 200, cors);
        } catch (err: any) {
          console.error('Unpublish showcase error:', err);
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // DELETE /api/events/:eventId/showcase
      const deleteShowcaseParams = parseRoute('/api/events/:eventId/showcase', pathname);
      if (deleteShowcaseParams && method === 'DELETE') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const { eventId } = deleteShowcaseParams;
        const event = await getEventById(eventId, env);
        if (!event) {
          return errorResponse('Event not found', 404, cors);
        }

        const { isMember, hasPermission } = await verifyOrgMembershipAndPermission(auth.user.id, event.organization_id, 'event.edit', env);
        if (!isMember || !hasPermission) {
          return errorResponse('Permission denied: Only owners and admins can delete event showcases', 403, cors);
        }

        try {
          await deleteShowcase(eventId, env);
          return jsonResponse({ success: true, message: 'Showcase deleted successfully' }, 200, cors);
        } catch (err: any) {
          console.error('Delete showcase error:', err);
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      const showcaseMediaParams = parseRoute('/api/events/:eventId/showcase/media', pathname);

      // GET /api/events/:eventId/showcase/media
      if (showcaseMediaParams && method === 'GET') {
        const { eventId } = showcaseMediaParams;
        const event = await getEventById(eventId, env);
        if (!event) {
          return errorResponse('Event not found', 404, cors);
        }

        const showcase = await getShowcaseByEventId(eventId, env);
        if (!showcase) {
          return errorResponse('Showcase not found for this event', 404, cors);
        }

        // Check optional auth for org membership (supports both App JWT and Supabase JWT)
        let isOrgMember = false;
        const auth = await authenticateOptionalJWT(request, env);
        if (auth.authenticated && auth.user) {
          const { isMember, hasPermission } = await verifyOrgMembershipAndPermission(auth.user.id, event.organization_id, 'event.view', env);
          isOrgMember = isMember && hasPermission;
        }

        if (!isOrgMember && showcase.status !== 'PUBLISHED') {
          return errorResponse('Showcase is not publicly accessible', 403, cors);
        }

        try {
          const media = await getShowcaseMedia(showcase.id, event.organization_id, env);
          return jsonResponse({ media }, 200, cors);
        } catch (err: any) {
          console.error('Get showcase media error:', err);
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // POST /api/events/:eventId/showcase/media/upload-url
      const uploadUrlParams = parseRoute('/api/events/:eventId/showcase/media/upload-url', pathname);
      if (uploadUrlParams && method === 'POST') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const { eventId } = uploadUrlParams;
        const event = await getEventById(eventId, env);
        if (!event) {
          return errorResponse('Event not found', 404, cors);
        }

        const { isMember, hasPermission } = await verifyOrgMembershipAndPermission(auth.user.id, event.organization_id, 'event.edit', env);
        if (!isMember || !hasPermission) {
          return errorResponse('Permission denied: Only owners and admins can upload showcase media', 403, cors);
        }

        const showcaseEligibility = isEventEligibleForShowcase(event);
        if (!showcaseEligibility.eligible) {
          return errorResponse(showcaseEligibility.reason, 422, cors);
        }

        const showcase = await getShowcaseByEventId(eventId, env);
        if (!showcase) {
          return errorResponse('Event Showcase not found. Please create the showcase first.', 404, cors);
        }

        const body = (await request.json().catch(() => ({}))) as any;
        const { fileName, fileType, fileSize, mediaType } = body;

        if (!fileName || typeof fileName !== 'string') {
          return errorResponse('fileName is required', 422, cors);
        }
        if (!fileType || typeof fileType !== 'string') {
          return errorResponse('fileType is required', 422, cors);
        }
        if (!fileSize || typeof fileSize !== 'number' || fileSize <= 0) {
          return errorResponse('Valid fileSize in bytes is required', 422, cors);
        }

        const normalizedMediaType = (mediaType || '').toUpperCase();
        if (normalizedMediaType !== 'IMAGE' && normalizedMediaType !== 'VIDEO') {
          return errorResponse('mediaType must be IMAGE or VIDEO', 422, cors);
        }

        const lowerMime = fileType.toLowerCase().trim();
        const rawFileName = fileName.trim();
        const dotIdx = rawFileName.lastIndexOf('.');
        const ext = dotIdx !== -1 ? rawFileName.slice(dotIdx).toLowerCase() : '';

        // Explicitly reject SVG for security reasons
        if (ext === '.svg' || lowerMime.includes('svg')) {
          return jsonResponse(
            {
              error: 'SVG uploads are not permitted for security reasons. Please upload raster images (PNG, JPEG, WEBP).',
              code: 'SVG_NOT_ALLOWED',
            },
            422,
            cors
          );
        }

        // Validate type and size strictly against allowed lists
        if (normalizedMediaType === 'IMAGE') {
          if (!ALLOWED_IMAGE_MIME_TYPES.has(lowerMime)) {
            return jsonResponse(
              {
                error: `Unsupported image format (${fileType}). Supported formats: PNG, JPEG, WEBP.`,
                code: 'UNSUPPORTED_FILE_TYPE',
              },
              422,
              cors
            );
          }
          if (fileSize > MAX_IMAGE_SIZE) {
            return jsonResponse(
              {
                error: `Image file size exceeds maximum limit of 25MB (${(fileSize / (1024 * 1024)).toFixed(1)}MB provided).`,
                code: 'FILE_TOO_LARGE',
              },
              422,
              cors
            );
          }
        } else {
          if (!ALLOWED_VIDEO_MIME_TYPES.has(lowerMime)) {
            return jsonResponse(
              {
                error: `Unsupported video format (${fileType}). Supported formats: MP4, WEBM, MOV.`,
                code: 'UNSUPPORTED_FILE_TYPE',
              },
              422,
              cors
            );
          }
          if (fileSize > MAX_VIDEO_SIZE) {
            return jsonResponse(
              {
                error: `Video file size exceeds maximum limit of 200MB (${(fileSize / (1024 * 1024)).toFixed(1)}MB provided).`,
                code: 'FILE_TOO_LARGE',
              },
              422,
              cors
            );
          }
        }

        try {
          const uploadInfo = await createSignedUploadUrlForShowcase(
            {
              organizationId: event.organization_id,
              showcaseId: showcase.id,
              eventId: event.id,
              fileName,
              mimeType: lowerMime,
              mediaType: normalizedMediaType as 'IMAGE' | 'VIDEO',
              fileSize,
            },
            env
          );

          if (!uploadInfo.signedUrl && fileSize > MAX_DIRECT_UPLOAD_SIZE) {
            return jsonResponse(
              {
                error: `Direct upload is restricted to 10MB to prevent Worker memory pressure. Large showcase files (up to 200MB) require signed Supabase storage upload, but a signed URL could not be generated. Please check storage bucket configuration.`,
                code: 'SIGNED_UPLOAD_UNAVAILABLE',
              },
              503,
              cors
            );
          }

          return jsonResponse(
            {
              uploadInfo: {
                ...uploadInfo,
                mediaType: normalizedMediaType,
                fileName,
                fileSize,
                mimeType: lowerMime,
              },
            },
            200,
            cors
          );
        } catch (err: any) {
          console.error('Create showcase upload URL error:', err);
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // POST /api/events/showcase-media/direct-upload & POST /api/events/:eventId/showcase/media/direct-upload
      const directUploadEventRoute = parseRoute('/api/events/:eventId/showcase/media/direct-upload', pathname);
      if ((pathname === '/api/events/showcase-media/direct-upload' || directUploadEventRoute) && method === 'POST') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        try {
          const rawContentLength = request.headers.get('content-length');
          if (rawContentLength) {
            const contentLength = parseInt(rawContentLength, 10);
            if (!isNaN(contentLength) && contentLength > MAX_DIRECT_UPLOAD_SIZE) {
              return jsonResponse(
                {
                  error: `Direct upload is restricted to small assets up to 10MB (${(contentLength / (1024 * 1024)).toFixed(1)}MB provided). Large showcase files (up to 200MB) must be uploaded via signed storage upload (/upload-url).`,
                  code: 'DIRECT_UPLOAD_SIZE_EXCEEDED',
                  maxDirectSizeBytes: MAX_DIRECT_UPLOAD_SIZE,
                },
                413,
                cors
              );
            }
          }

          const formData = await request.formData().catch(() => null);
          let requestedPath = url.searchParams.get('path') || (formData?.get('path') as string) || undefined;
          const queryFilename = url.searchParams.get('filename') || (formData?.get('filename') as string) || undefined;
          let eventId = directUploadEventRoute?.eventId || url.searchParams.get('eventId') || (formData?.get('eventId') as string) || undefined;
          let showcaseId = url.searchParams.get('showcaseId') || (formData?.get('showcaseId') as string) || undefined;

          let fileBuffer: ArrayBuffer | null = null;
          let mimeType = 'application/octet-stream';
          let originalName = queryFilename || 'media-file';
          let fileSize = 0;

          if (formData) {
            const file = formData.get('file');
            if (file && typeof file !== 'string') {
              fileBuffer = await file.arrayBuffer();
              mimeType = file.type || mimeType;
              originalName = file.name || originalName;
              fileSize = fileBuffer.byteLength;
            }
          }

          if (!fileBuffer) {
            fileBuffer = await request.arrayBuffer();
            mimeType = request.headers.get('content-type') || mimeType;
            fileSize = fileBuffer.byteLength;
          }

          if (!fileBuffer || fileSize === 0) {
            return errorResponse('No media file provided', 422, cors);
          }

          // 1. Identify & Validate Event and Showcase IDs
          if (!eventId && !showcaseId && requestedPath) {
            const pathMatch = requestedPath.match(/^organizations\/([^/]+)\/showcases\/([^/]+)\/([^/]+)$/);
            if (pathMatch) {
              showcaseId = pathMatch[2];
            }
          }

          if (!eventId && !showcaseId) {
            return errorResponse('eventId or showcaseId is required for showcase media upload', 422, cors);
          }

          let event: any = null;
          let showcase: any = null;

          if (eventId) {
            event = await getEventById(eventId, env);
            if (!event) {
              return errorResponse('Event not found', 404, cors);
            }
            showcase = await getShowcaseByEventId(eventId, env);
            if (!showcase) {
              return errorResponse('Event Showcase not found. Please create the showcase first.', 404, cors);
            }
            if (showcaseId && showcase.id !== showcaseId) {
              return errorResponse('Showcase does not match event', 403, cors);
            }
          } else if (showcaseId) {
            showcase = await getShowcaseById(showcaseId, env);
            if (!showcase) {
              return errorResponse('Event Showcase not found', 404, cors);
            }
            event = await getEventById(showcase.event_id, env);
            if (!event) {
              return errorResponse('Associated event not found', 404, cors);
            }
          }

          // 2. Verify Organization Membership & Permissions
          const { isMember, hasPermission } = await verifyOrgMembershipAndPermission(auth.user!.id, event.organization_id, 'event.edit', env);
          if (!isMember) {
            return errorResponse('Permission denied: You are not a member of this organization', 403, cors);
          }
          if (!hasPermission) {
            return errorResponse('Permission denied: Only owners and admins can upload showcase media', 403, cors);
          }

          // 3. Validate MIME Type, File Size, Magic Bytes, and Reject SVG
          const validation = validateUploadedFile(fileBuffer, {
            originalName: queryFilename || originalName,
            declaredMime: mimeType,
            maxSizeBytes: MAX_DIRECT_UPLOAD_SIZE,
            allowedMediaTypes: ['image', 'video'],
          });

          if (!validation.valid) {
            return jsonResponse({ error: validation.error, code: validation.code }, 422, cors);
          }

          const isImage = validation.mediaType === 'image';
          const isVideo = validation.mediaType === 'video';

          if (!isImage && !isVideo) {
            return jsonResponse(
              {
                error: `Unsupported media format (${mimeType}). Supported formats: PNG, JPEG, WEBP, MP4, WEBM, MOV.`,
                code: 'UNSUPPORTED_FILE_TYPE',
              },
              422,
              cors
            );
          }

          if (fileSize > MAX_DIRECT_UPLOAD_SIZE) {
            return jsonResponse(
              {
                error: `Direct upload is restricted to small assets up to 10MB (${(fileSize / (1024 * 1024)).toFixed(1)}MB provided). Large showcase files (up to 200MB) must be uploaded via signed storage upload (/upload-url).`,
                code: 'DIRECT_UPLOAD_SIZE_EXCEEDED',
                maxDirectSizeBytes: MAX_DIRECT_UPLOAD_SIZE,
              },
              413,
              cors
            );
          }

          // 4. Storage Path Validation & Sandboxing (Never Trust Client-Provided Arbitrary Path)
          const expectedPrefix = `organizations/${event.organization_id}/showcases/${showcase.id}/`;
          const ext = validation.extension || (isImage ? '.png' : '.mp4');
          const randomHex = Array.from(crypto.getRandomValues(new Uint8Array(8)))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');
          const safeUniqueName = `${Date.now()}-${randomHex}${ext}`;

          let storagePath = `${expectedPrefix}${safeUniqueName}`;
          if (requestedPath && requestedPath.startsWith(expectedPrefix)) {
            const subPath = requestedPath.slice(expectedPrefix.length);
            if (!subPath.includes('/') && !subPath.includes('\\') && !subPath.includes('..')) {
              storagePath = requestedPath;
            }
          }

          const supabase = getSupabaseServerClient(env);
          await ensureStorageBuckets(env);
          const { error: uploadErr } = await supabase.storage
            .from(SHOWCASE_BUCKET)
            .upload(storagePath, fileBuffer, {
              contentType: validation.mimeType,
              upsert: true,
            });

          if (uploadErr) {
            console.warn(`Supabase ${SHOWCASE_BUCKET} storage upload error:`, uploadErr);
            return handleWorkerApiError(uploadErr, request, cors, env, {
              endpoint: pathname,
              method,
              metadata: { originalName, fileSize, isImage, storagePath },
            });
          }

          const { data: publicData } = supabase.storage
            .from(SHOWCASE_BUCKET)
            .getPublicUrl(storagePath);

          return jsonResponse(
            {
              url: publicData?.publicUrl || `/uploads/${storagePath.split('/').pop()}`,
              path: storagePath,
              fileName: originalName,
              mediaType: isImage ? 'IMAGE' : 'VIDEO',
              fileSize,
              bucket: SHOWCASE_BUCKET,
            },
            200,
            cors
          );
        } catch (err: any) {
          console.error('Direct media upload error:', err);
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // POST /api/events/:eventId/showcase/media
      if (showcaseMediaParams && method === 'POST') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const { eventId } = showcaseMediaParams;
        const event = await getEventById(eventId, env);
        if (!event) {
          return errorResponse('Event not found', 404, cors);
        }

        const { isMember, hasPermission } = await verifyOrgMembershipAndPermission(auth.user.id, event.organization_id, 'event.edit', env);
        if (!isMember || !hasPermission) {
          return errorResponse('Permission denied: Only owners and admins can add showcase media', 403, cors);
        }

        const showcaseEligibility = isEventEligibleForShowcase(event);
        if (!showcaseEligibility.eligible) {
          return errorResponse(showcaseEligibility.reason, 422, cors);
        }

        const showcase = await getShowcaseByEventId(eventId, env);
        if (!showcase) {
          return errorResponse('Showcase not found', 404, cors);
        }

        const body = (await request.json().catch(() => ({}))) as any;
        const {
          media_type,
          media_url,
          storage_path,
          storagePath,
          upload_id,
          bucket,
          bucket_name,
          thumbnail_url,
          file_name,
          file_size,
          mime_type,
          sort_order,
        } = body;

        if (!media_type || (media_type !== 'IMAGE' && media_type !== 'VIDEO')) {
          return errorResponse('media_type must be IMAGE or VIDEO', 422, cors);
        }

        const providedPath = storage_path || storagePath || upload_id;
        const pathValidation = validateAndResolveShowcaseMediaPath({
          storagePath: providedPath,
          bucket: bucket || bucket_name,
          organizationId: event.organization_id,
          showcaseId: showcase.id,
          mediaType: media_type as 'IMAGE' | 'VIDEO',
          clientMediaUrl: media_url,
          clientThumbnailUrl: thumbnail_url,
          env,
        });

        if (!pathValidation.valid) {
          return jsonResponse(
            {
              error: pathValidation.error,
              code: pathValidation.code,
            },
            pathValidation.statusCode || 422,
            cors
          );
        }

        try {
          const media = await createShowcaseMedia(
            {
              showcase_id: showcase.id,
              organization_id: event.organization_id,
              media_type,
              media_url: pathValidation.authoritativeMediaUrl,
              storage_path: pathValidation.authoritativeStoragePath,
              thumbnail_url: pathValidation.sanitizedThumbnailUrl,
              file_name: (file_name && typeof file_name === 'string' ? file_name.trim() : pathValidation.fileName),
              file_size: Number(file_size) || 0,
              mime_type: (mime_type || (media_type === 'VIDEO' ? 'video/mp4' : 'image/png')).toLowerCase(),
              sort_order: sort_order !== undefined ? Number(sort_order) : undefined,
            },
            env
          );
          return jsonResponse({ media }, 201, cors);
        } catch (err: any) {
          console.error('Create showcase media record error:', err);
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // PATCH /api/events/:eventId/showcase/media/reorder
      const reorderMediaParams = parseRoute('/api/events/:eventId/showcase/media/reorder', pathname);
      if (reorderMediaParams && method === 'PATCH') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const { eventId } = reorderMediaParams;
        const event = await getEventById(eventId, env);
        if (!event) {
          return errorResponse('Event not found', 404, cors);
        }

        const { isMember, hasPermission } = await verifyOrgMembershipAndPermission(auth.user.id, event.organization_id, 'event.edit', env);
        if (!isMember || !hasPermission) {
          return errorResponse('Permission denied: Only owners and admins can reorder showcase media', 403, cors);
        }

        const showcaseEligibility = isEventEligibleForShowcase(event);
        if (!showcaseEligibility.eligible) {
          return errorResponse(showcaseEligibility.reason, 422, cors);
        }

        const showcase = await getShowcaseByEventId(eventId, env);
        if (!showcase) {
          return errorResponse('Showcase not found', 404, cors);
        }

        const body = (await request.json().catch(() => ({}))) as any;
        const { media_ids } = body;
        if (!Array.isArray(media_ids)) {
          return errorResponse('media_ids array is required', 422, cors);
        }

        try {
          const updatedMedia = await reorderShowcaseMedia(showcase.id, media_ids, event.organization_id, env);
          return jsonResponse({ success: true, media: updatedMedia }, 200, cors);
        } catch (err: any) {
          console.error('Reorder showcase media error:', err);
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // DELETE /api/events/:eventId/showcase/media/:mediaId
      const deleteMediaParams = parseRoute('/api/events/:eventId/showcase/media/:mediaId', pathname);
      if (deleteMediaParams && method === 'DELETE') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const { eventId, mediaId } = deleteMediaParams;
        const event = await getEventById(eventId, env);
        if (!event) {
          return errorResponse('Event not found', 404, cors);
        }

        const { isMember, hasPermission } = await verifyOrgMembershipAndPermission(auth.user.id, event.organization_id, 'event.edit', env);
        if (!isMember || !hasPermission) {
          return errorResponse('Permission denied: Only owners and admins can delete showcase media', 403, cors);
        }

        const showcase = await getShowcaseByEventId(eventId, env);
        if (!showcase) {
          return errorResponse('Showcase not found', 404, cors);
        }

        const media = await getShowcaseMediaById(mediaId, env);
        if (!media) {
          return errorResponse('Showcase media item not found', 404, cors);
        }

        if (media.showcase_id !== showcase.id || media.organization_id !== event.organization_id) {
          return errorResponse('Media does not belong to this event showcase', 403, cors);
        }

        // Clean up file in Supabase storage if storage_path is recorded
        if (media.storage_path) {
          try {
            const { getSupabaseServerClient } = await import('./server/supabase.js');
            const supabase = getSupabaseServerClient(env);
            await supabase.storage.from(SHOWCASE_BUCKET).remove([media.storage_path]);
          } catch (sErr: any) {
            console.warn('Notice: Could not delete storage file:', sErr.message);
          }
        }

        try {
          await deleteShowcaseMedia(mediaId, showcase.id, event.organization_id, env);
          return jsonResponse({ success: true }, 200, cors);
        } catch (err: any) {
          console.error('Delete showcase media error:', err);
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // ==========================================
      // 10. Developer Admin Routes
      // ==========================================

      // GET /api/developer/stats
      if (pathname === '/api/developer/stats' && method === 'GET') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;
        const allowed = isUserDeveloperAdmin(auth.user, env);
        console.log('[DeveloperAuth]', {
          userId: auth.user?.id,
          email: auth.user?.email,
          isDeveloper: auth.user?.is_developer,
          allowed,
        });
        if (!allowed) {
          return errorResponse('Forbidden: Developer Admin access required', 403, cors);
        }

        const games = await getAllPlatformGames(env);
        const themes = await getAllSystemThemes(env);
        return jsonResponse(
          {
            stats: {
              totalGames: games.length,
              activeGames: games.filter((g) => g.status === 'active').length,
              totalDefaultThemes: themes.length,
              activeThemes: themes.filter((t) => t.status === 'active').length,
            },
          },
          200,
          cors
        );
      }

      // GET /api/developer/games
      if (pathname === '/api/developer/games' && method === 'GET') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;
        const allowed = isUserDeveloperAdmin(auth.user, env);
        console.log('[DeveloperAuth]', {
          userId: auth.user?.id,
          email: auth.user?.email,
          isDeveloper: auth.user?.is_developer,
          allowed,
        });
        if (!allowed) {
          return errorResponse('Forbidden: Developer Admin access required', 403, cors);
        }

        const games = await getAllPlatformGames(env);
        return jsonResponse({ games }, 200, cors);
      }

      // POST /api/developer/games
      if (pathname === '/api/developer/games' && method === 'POST') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;
        if (!isUserDeveloperAdmin(auth.user, env)) {
          return errorResponse('Forbidden: Developer Admin access required', 403, cors);
        }

        const body = (await request.json().catch(() => ({}))) as any;
        const {
          name,
          slug,
          game_type,
          description,
          icon_name,
          status,
          background_url,
          basket_config,
          items_config,
          settings_config,
        } = body;

        if (!name || typeof name !== 'string' || !name.trim()) {
          return errorResponse('Game name is required', 422, cors);
        }
        if (!game_type || typeof game_type !== 'string' || !game_type.trim()) {
          return errorResponse('Game Type is required (e.g. catch-brand)', 422, cors);
        }

        try {
          const game = await createPlatformGame(
            {
              name,
              slug,
              game_type,
              description,
              icon_name,
              status,
              background_url,
              basket_config,
              items_config,
              settings_config,
            },
            env
          );

          return jsonResponse({ game }, 201, cors);
        } catch (err: any) {
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // Game Themes routes: /api/developer/games/:gameId/themes
      const devGameThemesParams = parseRoute('/api/developer/games/:gameId/themes', pathname);
      if (devGameThemesParams && method === 'GET') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;
        if (!isUserDeveloperAdmin(auth.user, env)) {
          return errorResponse('Forbidden: Developer Admin access required', 403, cors);
        }

        const { gameId } = devGameThemesParams;
        const themes = await getSystemThemesByGameId(gameId, { status: 'all' }, env);
        return jsonResponse({ themes }, 200, cors);
      }

      if (devGameThemesParams && method === 'POST') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;
        if (!isUserDeveloperAdmin(auth.user, env)) {
          return errorResponse('Forbidden: Developer Admin access required', 403, cors);
        }

        const { gameId } = devGameThemesParams;
        const body = (await request.json().catch(() => ({}))) as any;
        const {
          name,
          slug,
          description,
          status,
          is_default,
          branding,
          background_url,
          basket_config,
          items_config,
          physics_config,
          visuals_config,
          sounds_config,
          layout,
          game_config,
        } = body;

        if (!name || typeof name !== 'string' || !name.trim()) {
          return errorResponse('Theme name is required', 422, cors);
        }

        try {
          const targetGame = await getGameById(gameId, env);
          if (targetGame && !targetGame.is_system && targetGame.organization_id) {
            return errorResponse(
              'Cannot create a system theme for an organization game. Use the corresponding system game.',
              400,
              cors
            );
          }

          const theme = await createSystemTheme(
            {
              game_id: gameId,
              name,
              slug,
              description,
              status,
              is_default,
              branding,
              background_url,
              basket_config,
              items_config,
              physics_config,
              visuals_config,
              sounds_config,
              layout,
              game_config,
            },
            env
          );

          return jsonResponse({ theme }, 201, cors);
        } catch (err: any) {
          console.error('Developer create theme error:', err);
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // Single Game Routes: /api/developer/games/:gameId
      const devGameDetailParams = parseRoute('/api/developer/games/:gameId', pathname);
      if (devGameDetailParams && method === 'GET') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;
        if (!isUserDeveloperAdmin(auth.user, env)) {
          return errorResponse('Forbidden: Developer Admin access required', 403, cors);
        }

        const { gameId } = devGameDetailParams;
        const game = await getGameById(gameId, env);
        if (!game) {
          return errorResponse('Game not found', 404, cors);
        }

        const themes = await getSystemThemesByGameId(gameId, { status: 'all' }, env);
        return jsonResponse({ game, themes }, 200, cors);
      }

      if (devGameDetailParams && (method === 'PUT' || method === 'PATCH')) {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;
        if (!isUserDeveloperAdmin(auth.user, env)) {
          return errorResponse('Forbidden: Developer Admin access required', 403, cors);
        }

        const { gameId } = devGameDetailParams;
        const body = (await request.json().catch(() => ({}))) as any;
        try {
          const game = await updatePlatformGame(gameId, body, env);
          return jsonResponse({ game }, 200, cors);
        } catch (err: any) {
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      if (devGameDetailParams && method === 'DELETE') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;
        if (!isUserDeveloperAdmin(auth.user, env)) {
          return errorResponse('Forbidden: Developer Admin access required', 403, cors);
        }

        const { gameId } = devGameDetailParams;
        try {
          await deletePlatformGame(gameId, env);
          return jsonResponse({ success: true, message: 'Game deleted successfully' }, 200, cors);
        } catch (err: any) {
          console.error('Developer delete game error:', err);
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // ==========================================
      // Developer Game Pricing Routes
      // ==========================================
      const devGamePricingMatch = parseRoute('/api/developer/games/:gameId/pricing', pathname);
      if (devGamePricingMatch && method === 'GET') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;
        if (!isUserDeveloperAdmin(auth.user, env)) {
          return errorResponse('Forbidden: Developer Admin access required', 403, cors);
        }
        const { gameId } = devGamePricingMatch;
        try {
          const tiers = await getGamePricing(gameId, env);
          return jsonResponse({ success: true, tiers, game_id: gameId }, 200, cors);
        } catch (err: any) {
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      if (devGamePricingMatch && method === 'PUT') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;
        if (!isUserDeveloperAdmin(auth.user, env)) {
          return errorResponse('Forbidden: Developer Admin access required', 403, cors);
        }
        const { gameId } = devGamePricingMatch;
        const body = (await request.json().catch(() => ({}))) as any;
        if (!Array.isArray(body.tiers)) {
          return errorResponse('Tiers must be an array of pricing tier configurations', 400, cors);
        }
        try {
          const updated = await bulkUpsertGamePricing(gameId, body.tiers, env);
          return jsonResponse({ success: true, tiers: updated, message: 'Game pricing tiers updated successfully' }, 200, cors);
        } catch (err: any) {
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      const devGamePricingSeedMatch = parseRoute('/api/developer/games/:gameId/pricing/seed-defaults', pathname);
      if (devGamePricingSeedMatch && method === 'POST') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;
        if (!isUserDeveloperAdmin(auth.user, env)) {
          return errorResponse('Forbidden: Developer Admin access required', 403, cors);
        }
        const { gameId } = devGamePricingSeedMatch;
        try {
          const game = await getGameById(gameId, env);
          const tiers = await ensureDefaultGamePricing(gameId, game?.slug || game?.game_type, env);
          return jsonResponse({ success: true, tiers, message: 'Default pricing tiers seeded successfully' }, 200, cors);
        } catch (err: any) {
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      const devGamePricingTierMatch = parseRoute('/api/developer/games/:gameId/pricing/tier', pathname);
      if (devGamePricingTierMatch && method === 'POST') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;
        if (!isUserDeveloperAdmin(auth.user, env)) {
          return errorResponse('Forbidden: Developer Admin access required', 403, cors);
        }
        const { gameId } = devGamePricingTierMatch;
        const body = (await request.json().catch(() => ({}))) as any;
        if (typeof body.min_days !== 'number' || typeof body.price !== 'number') {
          return errorResponse('min_days and price are required numbers', 400, cors);
        }
        try {
          const tier = await createGamePricingTier(gameId, {
            min_days: body.min_days,
            max_days: body.max_days !== undefined ? body.max_days : null,
            price: body.price,
            currency: body.currency,
            is_active: body.is_active,
            is_base: body.is_base,
          }, env);
          return jsonResponse({ success: true, tier }, 201, cors);
        } catch (err: any) {
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      const devGamePricingTierIdMatch = parseRoute('/api/developer/games/:gameId/pricing/tier/:tierId', pathname);
      if (devGamePricingTierIdMatch && method === 'PUT') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;
        if (!isUserDeveloperAdmin(auth.user, env)) {
          return errorResponse('Forbidden: Developer Admin access required', 403, cors);
        }
        const { tierId } = devGamePricingTierIdMatch;
        const body = (await request.json().catch(() => ({}))) as any;
        try {
          const tier = await updateGamePricingTier(tierId, {
            min_days: body.min_days,
            max_days: body.max_days,
            price: body.price,
            currency: body.currency,
            is_active: body.is_active,
            is_base: body.is_base,
          }, env);
          return jsonResponse({ success: true, tier }, 200, cors);
        } catch (err: any) {
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      if (devGamePricingTierIdMatch && method === 'DELETE') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;
        if (!isUserDeveloperAdmin(auth.user, env)) {
          return errorResponse('Forbidden: Developer Admin access required', 403, cors);
        }
        const { tierId } = devGamePricingTierIdMatch;
        try {
          await deleteGamePricingTier(tierId, env);
          return jsonResponse({ success: true, message: 'Pricing tier deleted successfully' }, 200, cors);
        } catch (err: any) {
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // Duplicate Theme: /api/developer/themes/:themeId/duplicate
      const devDuplicateThemeParams = parseRoute('/api/developer/themes/:themeId/duplicate', pathname);
      if (devDuplicateThemeParams && method === 'POST') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;
        if (!isUserDeveloperAdmin(auth.user, env)) {
          return errorResponse('Forbidden: Developer Admin access required', 403, cors);
        }

        const { themeId } = devDuplicateThemeParams;
        if (!isUUID(themeId)) {
          return errorResponse(`Invalid theme ID format: ${themeId}`, 400, cors);
        }

        const body = (await request.json().catch(() => ({}))) as any;
        try {
          const duplicated = await duplicateSystemTheme(themeId, body.name, env);
          return jsonResponse({ theme: duplicated }, 201, cors);
        } catch (err: any) {
          console.error('Developer duplicate theme error:', err);
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // Set Default Theme: /api/developer/themes/:themeId/set-default
      const devSetDefaultThemeParams = parseRoute('/api/developer/themes/:themeId/set-default', pathname);
      if (devSetDefaultThemeParams && method === 'POST') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;
        if (!isUserDeveloperAdmin(auth.user, env)) {
          return errorResponse('Forbidden: Developer Admin access required', 403, cors);
        }

        const { themeId } = devSetDefaultThemeParams;
        if (!isUUID(themeId)) {
          return errorResponse(`Invalid theme ID format: ${themeId}`, 400, cors);
        }

        try {
          const updatedTheme = await setPrimaryDefaultSystemTheme(themeId, env);
          return jsonResponse({ success: true, theme: updatedTheme }, 200, cors);
        } catch (err: any) {
          console.error('Developer set default theme error:', err);
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // Unset Default Theme: /api/developer/themes/:themeId/unset-default
      const devUnsetDefaultThemeParams = parseRoute('/api/developer/themes/:themeId/unset-default', pathname);
      if (devUnsetDefaultThemeParams && method === 'POST') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;
        if (!isUserDeveloperAdmin(auth.user, env)) {
          return errorResponse('Forbidden: Developer Admin access required', 403, cors);
        }

        const { themeId } = devUnsetDefaultThemeParams;
        if (!isUUID(themeId)) {
          return errorResponse(`Invalid theme ID format: ${themeId}`, 400, cors);
        }

        try {
          const updatedTheme = await unsetPrimaryDefaultSystemTheme(themeId, env);
          return jsonResponse({ success: true, theme: updatedTheme }, 200, cors);
        } catch (err: any) {
          console.error('Developer unset default theme error:', err);
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // Single Theme Routes: /api/developer/themes/:themeId
      const devThemeDetailParams = parseRoute('/api/developer/themes/:themeId', pathname);
      if (devThemeDetailParams && method === 'GET') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;
        if (!isUserDeveloperAdmin(auth.user, env)) {
          return errorResponse('Forbidden: Developer Admin access required', 403, cors);
        }

        const { themeId } = devThemeDetailParams;
        if (!isUUID(themeId)) {
          return errorResponse(`Invalid theme ID format: ${themeId}`, 400, cors);
        }

        const theme = await getThemeById(themeId, env);
        if (!theme) {
          return errorResponse('System theme not found', 404, cors);
        }
        return jsonResponse({ theme }, 200, cors);
      }

      if (devThemeDetailParams && method === 'PUT') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;
        if (!isUserDeveloperAdmin(auth.user, env)) {
          return errorResponse('Forbidden: Developer Admin access required', 403, cors);
        }

        const { themeId } = devThemeDetailParams;
        if (!isUUID(themeId)) {
          return errorResponse(`Invalid theme ID format: ${themeId}`, 400, cors);
        }

        const body = (await request.json().catch(() => ({}))) as any;
        try {
          const theme = await updateSystemTheme(themeId, body, env);
          return jsonResponse({ theme }, 200, cors);
        } catch (err: any) {
          console.error('Developer update theme error:', err);
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      if (devThemeDetailParams && method === 'DELETE') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;
        if (!isUserDeveloperAdmin(auth.user, env)) {
          return errorResponse('Forbidden: Developer Admin access required', 403, cors);
        }

        const { themeId } = devThemeDetailParams;
        if (!isUUID(themeId)) {
          return errorResponse(`Invalid theme ID format: ${themeId}`, 400, cors);
        }

        try {
          await deleteSystemTheme(themeId, env);
          return jsonResponse({ success: true }, 200, cors);
        } catch (err: any) {
          console.error('Developer delete theme error:', err);
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // ----------------------------------------------------
      // DEVELOPER & ADMIN SHOWCASE REVIEW ENDPOINTS
      // ----------------------------------------------------

      // GET /api/developer/showcases & /api/admin/showcases
      if ((pathname === '/api/developer/showcases' || pathname === '/api/admin/showcases') && method === 'GET') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;
        if (!isUserDeveloperAdmin(auth.user, env)) {
          return errorResponse('Forbidden: Developer Admin access required', 403, cors);
        }

        try {
          const showcases = await getAllShowcasesForAdmin(env);
          return jsonResponse({ showcases }, 200, cors);
        } catch (err: any) {
          console.error('Admin get showcases error:', err);
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // GET /api/developer/showcase-reward-submissions & /api/admin/showcase-reward-submissions
      if ((pathname === '/api/developer/showcase-reward-submissions' || pathname === '/api/admin/showcase-reward-submissions') && method === 'GET') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;
        if (!isUserDeveloperAdmin(auth.user, env)) {
          return errorResponse('Forbidden: Developer Admin access required', 403, cors);
        }

        try {
          const statusParam = url.searchParams.get('status') || 'PENDING';
          const submissions = await getPendingRewardSubmissions(env, statusParam);
          return jsonResponse({ submissions, showcases: submissions, count: submissions.length }, 200, cors);
        } catch (err: any) {
          console.error('Admin get showcase reward submissions error:', err);
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // POST /api/developer/showcase-reward-submissions/:id/approve & :submissionId/approve
      const devApproveSub = parseRoute('/api/developer/showcase-reward-submissions/:id/approve', pathname) ||
                            parseRoute('/api/developer/showcase-reward-submissions/:submissionId/approve', pathname) ||
                            parseRoute('/api/admin/showcase-reward-submissions/:id/approve', pathname) ||
                            parseRoute('/api/admin/showcase-reward-submissions/:submissionId/approve', pathname);
      if (devApproveSub && method === 'POST') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;
        if (!isUserDeveloperAdmin(auth.user, env)) {
          return errorResponse('Forbidden: Developer Admin access required', 403, cors);
        }

        const submissionId = devApproveSub.id || devApproveSub.submissionId;
        try {
          const result = await approveShowcaseRewardSubmission({
            submissionId,
            reviewerId: auth.user.id,
            env,
          });
          return jsonResponse({
            success: true,
            submission: result.submission,
            showcase: result.showcase,
            reward: result.reward,
            alreadyRewarded: result.alreadyRewarded,
            message: result.alreadyRewarded
              ? 'Reward was already previously granted for this submission'
              : 'Showcase reward approved successfully and RM300 credit granted',
          }, 200, cors);
        } catch (err: any) {
          console.error('Approve showcase reward submission error:', err);
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // POST /api/developer/showcase-reward-submissions/:id/reject & :submissionId/reject
      const devRejectSub = parseRoute('/api/developer/showcase-reward-submissions/:id/reject', pathname) ||
                           parseRoute('/api/developer/showcase-reward-submissions/:submissionId/reject', pathname) ||
                           parseRoute('/api/admin/showcase-reward-submissions/:id/reject', pathname) ||
                           parseRoute('/api/admin/showcase-reward-submissions/:submissionId/reject', pathname);
      if (devRejectSub && method === 'POST') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;
        if (!isUserDeveloperAdmin(auth.user, env)) {
          return errorResponse('Forbidden: Developer Admin access required', 403, cors);
        }

        const submissionId = devRejectSub.id || devRejectSub.submissionId;
        const body = (await request.json().catch(() => ({}))) as any;
        const { reason, rejection_reason } = body;
        const finalReason = rejection_reason || reason;

        if (!finalReason || typeof finalReason !== 'string' || !finalReason.trim()) {
          return errorResponse('Rejection reason is required', 422, cors);
        }

        try {
          const result = await rejectShowcaseRewardSubmission({
            submissionId,
            reviewerId: auth.user.id,
            rejectionReason: finalReason.trim(),
            env,
          });
          return jsonResponse({
            success: true,
            submission: result.submission,
            showcase: result.showcase,
            message: 'Showcase reward submission rejected with feedback',
          }, 200, cors);
        } catch (err: any) {
          console.error('Reject showcase reward submission error:', err);
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // GET /api/developer/showcase-rewards & /api/admin/showcase-rewards (Pending RM300 Reward Approval Queue)
      if ((pathname === '/api/developer/showcase-rewards' || pathname === '/api/admin/showcase-rewards') && method === 'GET') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;
        if (!isUserDeveloperAdmin(auth.user, env)) {
          return errorResponse('Forbidden: Developer Admin access required', 403, cors);
        }

        try {
          const statusParam = url.searchParams.get('status') || 'AWAITING_APPROVAL';
          const submissions = await getPendingRewardSubmissions(env, 'PENDING');
          if (submissions.length > 0) {
            return jsonResponse({ showcases: submissions, submissions, count: submissions.length }, 200, cors);
          }
          const showcases = await getShowcaseRewardsForAdmin(env, statusParam);
          return jsonResponse({ showcases, count: showcases.length }, 200, cors);
        } catch (err: any) {
          console.error('Admin get showcase rewards error:', err);
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // POST /api/developer/showcases/:id/approve & :showcaseId/approve & /reward/approve
      const devApproveShowcase = parseRoute('/api/developer/showcases/:id/approve', pathname) ||
                                parseRoute('/api/developer/showcases/:showcaseId/approve', pathname) ||
                                parseRoute('/api/admin/showcases/:id/approve', pathname) ||
                                parseRoute('/api/admin/showcases/:showcaseId/approve', pathname) ||
                                parseRoute('/api/developer/showcases/:id/reward/approve', pathname) ||
                                parseRoute('/api/developer/showcases/:showcaseId/reward/approve', pathname) ||
                                parseRoute('/api/admin/showcases/:id/reward/approve', pathname) ||
                                parseRoute('/api/admin/showcases/:showcaseId/reward/approve', pathname);
      if (devApproveShowcase && method === 'POST') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;
        if (!isUserDeveloperAdmin(auth.user, env)) {
          return errorResponse('Forbidden: Developer Admin access required', 403, cors);
        }

        const targetId = devApproveShowcase.id || devApproveShowcase.showcaseId;
        try {
          const submission = await getShowcaseRewardSubmissionById(targetId, env);
          if (submission) {
            const subResult = await approveShowcaseRewardSubmission({
              submissionId: submission.id,
              reviewerId: auth.user.id,
              env,
            });
            return jsonResponse({
              success: true,
              submission: subResult.submission,
              showcase: subResult.showcase,
              reward: subResult.reward,
              alreadyRewarded: subResult.alreadyRewarded,
              message: subResult.alreadyRewarded
                ? 'Reward was already previously granted for this submission'
                : 'Showcase reward approved successfully and RM300 credit granted',
            }, 200, cors);
          }

          const result = await approveShowcaseReview(targetId, auth.user.id, env);
          const showcaseSub = await getShowcaseRewardSubmissionForEvent(result.showcase.event_id, env);
          if (showcaseSub && showcaseSub.status === 'PENDING') {
            await approveShowcaseRewardSubmission({
              submissionId: showcaseSub.id,
              reviewerId: auth.user.id,
              env,
            }).catch(() => {});
          }

          return jsonResponse({
            success: true,
            showcase: result.showcase,
            reward: result.reward,
            alreadyRewarded: result.alreadyRewarded,
            message: result.alreadyRewarded
              ? 'Showcase is approved (reward was already previously granted)'
              : 'Showcase approved successfully and RM300 credit granted to organization',
          }, 200, cors);
        } catch (err: any) {
          console.error('Approve showcase error:', err);
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // POST /api/developer/showcases/:id/reject & :showcaseId/reject & /reward/reject
      const devRejectShowcase = parseRoute('/api/developer/showcases/:id/reject', pathname) ||
                               parseRoute('/api/developer/showcases/:showcaseId/reject', pathname) ||
                               parseRoute('/api/admin/showcases/:id/reject', pathname) ||
                               parseRoute('/api/admin/showcases/:showcaseId/reject', pathname) ||
                               parseRoute('/api/developer/showcases/:id/reward/reject', pathname) ||
                               parseRoute('/api/developer/showcases/:showcaseId/reward/reject', pathname) ||
                               parseRoute('/api/admin/showcases/:id/reward/reject', pathname) ||
                               parseRoute('/api/admin/showcases/:showcaseId/reward/reject', pathname);
      if (devRejectShowcase && method === 'POST') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;
        if (!isUserDeveloperAdmin(auth.user, env)) {
          return errorResponse('Forbidden: Developer Admin access required', 403, cors);
        }

        const targetId = devRejectShowcase.id || devRejectShowcase.showcaseId;
        const body = (await request.json().catch(() => ({}))) as any;
        const { reason, rejection_reason } = body;
        const finalReason = rejection_reason || reason;

        if (!finalReason || typeof finalReason !== 'string' || !finalReason.trim()) {
          return errorResponse('Rejection reason is required', 422, cors);
        }

        try {
          const submission = await getShowcaseRewardSubmissionById(targetId, env);
          if (submission) {
            const subResult = await rejectShowcaseRewardSubmission({
              submissionId: submission.id,
              reviewerId: auth.user.id,
              rejectionReason: finalReason.trim(),
              env,
            });
            return jsonResponse({
              success: true,
              submission: subResult.submission,
              showcase: subResult.showcase,
              message: 'Showcase reward submission rejected with feedback',
            }, 200, cors);
          }

          const updatedShowcase = await rejectShowcaseReview(targetId, auth.user.id, finalReason.trim(), env);
          const showcaseSub = await getShowcaseRewardSubmissionForEvent(updatedShowcase.event_id, env);
          if (showcaseSub && showcaseSub.status === 'PENDING') {
            await rejectShowcaseRewardSubmission({
              submissionId: showcaseSub.id,
              reviewerId: auth.user.id,
              rejectionReason: finalReason.trim(),
              env,
            }).catch(() => {});
          }

          return jsonResponse({
            success: true,
            showcase: updatedShowcase,
            message: 'Showcase rejected with feedback for the organization',
          }, 200, cors);
        } catch (err: any) {
          console.error('Reject showcase error:', err);
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // POST /api/developer/showcases/:id/review/approve & :showcaseId/review/approve
      const devApproveReview = parseRoute('/api/developer/showcases/:id/review/approve', pathname) ||
                               parseRoute('/api/developer/showcases/:showcaseId/review/approve', pathname) ||
                               parseRoute('/api/admin/showcases/:id/review/approve', pathname) ||
                               parseRoute('/api/admin/showcases/:showcaseId/review/approve', pathname);
      if (devApproveReview && method === 'POST') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;
        if (!isUserDeveloperAdmin(auth.user, env)) {
          return errorResponse('Forbidden: Developer Admin access required', 403, cors);
        }
        const showcaseId = devApproveReview.id || devApproveReview.showcaseId;
        try {
          const updatedShowcase = await approveEventReview(showcaseId, auth.user.id, env);
          return jsonResponse({
            success: true,
            showcase: updatedShowcase,
            message: 'Event review approved successfully',
          }, 200, cors);
        } catch (err: any) {
          console.error('Approve event review error:', err);
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // POST /api/developer/showcases/:id/review/reject & :showcaseId/review/reject
      const devRejectReview = parseRoute('/api/developer/showcases/:id/review/reject', pathname) ||
                              parseRoute('/api/developer/showcases/:showcaseId/review/reject', pathname) ||
                              parseRoute('/api/admin/showcases/:id/review/reject', pathname) ||
                              parseRoute('/api/admin/showcases/:showcaseId/review/reject', pathname);
      if (devRejectReview && method === 'POST') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;
        if (!isUserDeveloperAdmin(auth.user, env)) {
          return errorResponse('Forbidden: Developer Admin access required', 403, cors);
        }
        const showcaseId = devRejectReview.id || devRejectReview.showcaseId;
        const body = (await request.json().catch(() => ({}))) as any;
        const { reason, rejection_reason } = body;
        const finalReason = rejection_reason || reason;
        if (!finalReason || typeof finalReason !== 'string' || !finalReason.trim()) {
          return errorResponse('Rejection reason is required', 422, cors);
        }
        try {
          const updatedShowcase = await rejectEventReview(showcaseId, auth.user.id, finalReason.trim(), env);
          return jsonResponse({
            success: true,
            showcase: updatedShowcase,
            message: 'Event review rejected with feedback',
          }, 200, cors);
        } catch (err: any) {
          console.error('Reject event review error:', err);
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // GET /api/user/showcase-reward-status & /api/showcases/user-reward-status
      if ((pathname === '/api/user/showcase-reward-status' || pathname === '/api/showcases/user-reward-status') && method === 'GET') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const user = auth.user!;
        try {
          const status = await getOwnerShowcaseRewardStatus(user.id, env);
          return jsonResponse(status, 200, cors);
        } catch (err: any) {
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // GET /api/developer/showcases/owner-status/:ownerUserId
      const devOwnerStatus = parseRoute('/api/developer/showcases/owner-status/:ownerUserId', pathname);
      if (devOwnerStatus && method === 'GET') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;
        if (!isUserDeveloperAdmin(auth.user, env)) {
          return errorResponse('Forbidden: Developer Admin access required', 403, cors);
        }
        try {
          const status = await getOwnerShowcaseRewardStatus(devOwnerStatus.ownerUserId, env);
          return jsonResponse(status, 200, cors);
        } catch (err: any) {
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // POST /api/developer/showcases/:id/block & :showcaseId/block & /admin/showcases/:id/block
      const devBlockShowcase = parseRoute('/api/developer/showcases/:id/block', pathname) ||
                               parseRoute('/api/developer/showcases/:showcaseId/block', pathname) ||
                               parseRoute('/api/admin/showcases/:id/block', pathname) ||
                               parseRoute('/api/admin/showcases/:showcaseId/block', pathname);
      if (devBlockShowcase && method === 'POST') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;
        if (!isUserDeveloperAdmin(auth.user, env)) {
          return errorResponse('Forbidden: Developer Admin access required', 403, cors);
        }

        const showcaseId = devBlockShowcase.id || devBlockShowcase.showcaseId;
        const body = (await request.json().catch(() => ({}))) as any;
        const { reason } = body;

        if (!reason || typeof reason !== 'string' || !reason.trim()) {
          return errorResponse('Moderation reason is required when blocking a showcase', 422, cors);
        }

        try {
          const updated = await blockShowcase(showcaseId, auth.user.id, reason.trim(), env);
          return jsonResponse({
            success: true,
            showcase: updated,
            message: 'Showcase has been blocked and removed from public access.',
          }, 200, cors);
        } catch (err: any) {
          console.error('Block showcase error:', err);
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // POST /api/developer/showcases/:id/unblock & :showcaseId/unblock & /admin/showcases/:id/unblock
      const devUnblockShowcase = parseRoute('/api/developer/showcases/:id/unblock', pathname) ||
                                 parseRoute('/api/developer/showcases/:showcaseId/unblock', pathname) ||
                                 parseRoute('/api/admin/showcases/:id/unblock', pathname) ||
                                 parseRoute('/api/admin/showcases/:showcaseId/unblock', pathname);
      if (devUnblockShowcase && method === 'POST') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;
        if (!isUserDeveloperAdmin(auth.user, env)) {
          return errorResponse('Forbidden: Developer Admin access required', 403, cors);
        }

        const showcaseId = devUnblockShowcase.id || devUnblockShowcase.showcaseId;
        const body = (await request.json().catch(() => ({}))) as any;
        const { reason } = body;

        try {
          const updated = await unblockShowcase(showcaseId, auth.user.id, reason, env);
          return jsonResponse({
            success: true,
            showcase: updated,
            message: 'Showcase has been unblocked and restored to public view.',
          }, 200, cors);
        } catch (err: any) {
          console.error('Unblock showcase error:', err);
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // DELETE /api/developer/showcases/:id & :showcaseId & /admin/showcases/:id
      const devDeleteShowcase = parseRoute('/api/developer/showcases/:id', pathname) ||
                                parseRoute('/api/developer/showcases/:showcaseId', pathname) ||
                                parseRoute('/api/admin/showcases/:id', pathname) ||
                                parseRoute('/api/admin/showcases/:showcaseId', pathname);
      if (devDeleteShowcase && method === 'DELETE') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;
        if (!isUserDeveloperAdmin(auth.user, env)) {
          return errorResponse('Forbidden: Developer Admin access required', 403, cors);
        }

        const showcaseId = devDeleteShowcase.id || devDeleteShowcase.showcaseId;
        const body = (await request.json().catch(() => ({}))) as any;
        const { reason } = body;

        if (!reason || typeof reason !== 'string' || !reason.trim()) {
          return errorResponse('Deletion reason is required for administrative showcase deletion', 422, cors);
        }

        try {
          const updated = await adminDeleteShowcase(showcaseId, auth.user.id, reason.trim(), env);
          return jsonResponse({
            success: true,
            showcase: updated,
            message: 'Showcase deleted administratively.',
          }, 200, cors);
        } catch (err: any) {
          console.error('Admin delete showcase error:', err);
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // ----------------------------------------------------
      // PLATFORM & EVENT PRICING (DEVELOPER ADMIN)
      // ----------------------------------------------------

      // GET /api/platform/pricing
      if (pathname === '/api/platform/pricing' && method === 'GET') {
        try {
          const settings = await getPlatformPricingSettings(env);
          return jsonResponse(settings, 200, cors);
        } catch (err: any) {
          console.error('Get platform pricing error in worker:', err);
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // GET /api/developer/pricing/settings & /api/admin/pricing/settings
      if ((pathname === '/api/developer/pricing/settings' || pathname === '/api/admin/pricing/settings') && method === 'GET') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;
        if (!isUserDeveloperAdmin(auth.user, env)) {
          return errorResponse('Forbidden: Developer Admin access required', 403, cors);
        }

        try {
          const settings = await getPlatformPricingSettings(env);
          return jsonResponse({ success: true, settings }, 200, cors);
        } catch (err: any) {
          console.error('Admin get pricing settings error in worker:', err);
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // PUT/POST /api/developer/pricing/settings & /api/admin/pricing/settings
      if ((pathname === '/api/developer/pricing/settings' || pathname === '/api/admin/pricing/settings') && (method === 'PUT' || method === 'POST')) {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;
        if (!isUserDeveloperAdmin(auth.user, env)) {
          return errorResponse('Forbidden: Developer Admin access required', 403, cors);
        }

        const body = (await request.json().catch(() => ({}))) as any;
        const { default_price, default_currency, pricing_rules } = body;
        
        let priceNum: number | undefined;
        if (default_price !== undefined) {
          priceNum = Number(default_price);
          if (isNaN(priceNum) || priceNum <= 0) {
            return errorResponse('default_price must be a positive number greater than 0', 422, cors);
          }
        }

        try {
          const updatedSettings = await updatePlatformPricingSettings(
            {
              default_price: priceNum,
              default_currency: default_currency ? String(default_currency).trim().toUpperCase() : undefined,
              pricing_rules: Array.isArray(pricing_rules) ? pricing_rules : undefined,
            },
            auth.user?.id,
            env
          );

          return jsonResponse({
            success: true,
            settings: updatedSettings,
            message: `Platform pricing settings updated successfully`,
          }, 200, cors);
        } catch (err: any) {
          console.error('Admin update pricing settings error:', err);
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // ----------------------------------------------------
      // PLATFORM CONTACT SETTINGS (WHATSAPP, ENQUIRY EMAIL)
      // ----------------------------------------------------

      // GET /api/platform/contact-settings (public)
      if (pathname === '/api/platform/contact-settings' && method === 'GET') {
        try {
          const settings = await getPlatformContactSettings(env);
          return jsonResponse({ success: true, settings }, 200, cors);
        } catch (err: any) {
          console.error('Get platform contact settings error in worker:', err);
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // GET /api/developer/contact-settings & /api/admin/contact-settings
      if ((pathname === '/api/developer/contact-settings' || pathname === '/api/admin/contact-settings') && method === 'GET') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;
        if (!isUserDeveloperAdmin(auth.user, env)) {
          return errorResponse('Forbidden: Developer Admin access required', 403, cors);
        }

        try {
          const settings = await getPlatformContactSettings(env);
          return jsonResponse({ success: true, settings }, 200, cors);
        } catch (err: any) {
          console.error('Admin get contact settings error in worker:', err);
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // PUT/POST /api/developer/contact-settings & /api/admin/contact-settings
      if ((pathname === '/api/developer/contact-settings' || pathname === '/api/admin/contact-settings') && (method === 'PUT' || method === 'POST')) {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;
        if (!isUserDeveloperAdmin(auth.user, env)) {
          return errorResponse('Forbidden: Developer Admin access required', 403, cors);
        }

        const body = (await request.json().catch(() => ({}))) as any;
        const {
          whatsapp_number,
          whatsapp_display,
          whatsapp_prefill_message,
          enquiry_email,
          support_hours,
          office_location,
        } = body;

        try {
          const updatedSettings = await updatePlatformContactSettings(
            {
              whatsapp_number,
              whatsapp_display,
              whatsapp_prefill_message,
              enquiry_email,
              support_hours,
              office_location,
            },
            auth.user?.id,
            env
          );

          return jsonResponse({
            success: true,
            settings: updatedSettings,
            message: 'Platform contact settings updated successfully',
          }, 200, cors);
        } catch (err: any) {
          console.error('Admin update contact settings error:', err);
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // POST /api/contact (public contact enquiry with persistence first and Gmail delivery)
      if (pathname === '/api/contact' && method === 'POST') {
        // Rate limit check
        const rateLimitResult = await checkWorkerRateLimitWithCloudflare(request, WORKER_CONTACT_RATE_LIMIT, env);
        if (!rateLimitResult.allowed) {
          return new Response(JSON.stringify(rateLimitResult.errorResponse), {
            status: 429,
            headers: { 'Content-Type': 'application/json', ...cors, ...rateLimitResult.headers },
          });
        }

        try {
          const body = (await request.json().catch(() => ({}))) as any;

          // Anti-bot honeypot check
          if (body.website || body.bot_field || body.hp_check) {
            console.warn('[Worker Contact Form] Honeypot triggered');
            return jsonResponse({
              success: true,
              ticketId: 'EGS-BOTPREVENTED',
              emailDelivered: false,
              message: 'Thank you! Your enquiry has been received.',
            }, 200, cors);
          }

          // Input validation & sanitization
          const rawFullName = typeof body.fullName === 'string' ? body.fullName.trim() : '';
          const rawEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
          const rawPhone = typeof body.phone === 'string' ? body.phone.trim() : '';
          const rawCompany = typeof body.company === 'string' ? body.company.trim() : '';
          const rawCategory = typeof body.category === 'string' ? body.category.trim() : 'General enquiry';
          const rawEventDate = typeof body.eventDate === 'string' ? body.eventDate.trim() : '';
          const rawExpectedAttendees = typeof body.expectedAttendees === 'string' ? body.expectedAttendees.trim() : '';
          const rawMessage = typeof body.message === 'string' ? body.message.trim() : '';
          const idempotencyKey = typeof body.idempotencyKey === 'string' ? body.idempotencyKey.trim() : undefined;

          if (!rawFullName || rawFullName.length < 2 || rawFullName.length > 100) {
            return errorResponse('Please enter a valid full name (2 to 100 characters).', 400, cors);
          }

          const emailRegex = /^[^\s@\r\n]+@[^\s@\r\n]+\.[^\s@\r\n]+$/;
          if (!rawEmail || !emailRegex.test(rawEmail) || rawEmail.length > 254 || rawEmail.includes('\r') || rawEmail.includes('\n')) {
            return errorResponse('Please enter a valid email address.', 400, cors);
          }

          if (!rawMessage || rawMessage.length < 10 || rawMessage.length > 3000) {
            return errorResponse('Please enter a message between 10 and 3,000 characters.', 400, cors);
          }

          // Step 1: Database persistence FIRST
          let enquiry;
          try {
            const clientIp = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || null;
            const userAgent = request.headers.get('user-agent') || null;

            enquiry = await createContactEnquiry({
              full_name: rawFullName,
              email: rawEmail,
              phone: rawPhone || null,
              company: rawCompany || null,
              category: rawCategory,
              event_date: rawEventDate || null,
              expected_attendees: rawExpectedAttendees || null,
              message: rawMessage,
              idempotency_key: idempotencyKey,
              ip_address: clientIp,
              user_agent: userAgent,
            }, env);
          } catch (persistErr: any) {
            console.error('[Worker Contact Enquiry] Database persistence error:', persistErr);
            return errorResponse('Unable to save your enquiry at this time. Please try again or reach out directly on WhatsApp.', 500, cors);
          }

          // If this idempotency key was already delivered, return immediately
          if (enquiry.email_status === 'sent') {
            return jsonResponse({
              success: true,
              enquiryId: enquiry.id,
              ticketId: enquiry.ticket_id,
              emailDelivered: true,
              message: 'Thank you! Your enquiry has been received. Our team will contact you shortly.',
            }, 200, cors);
          }

          // Step 2: Attempt Gmail delivery to the authoritative recipient (eventgamestudio@gmail.com)
          const recipientEmail = getContactNotificationRecipientEmail(env);
          let emailDelivered = false;

          try {
            const gmailSettings = await getGoogleMailSettings(env);

            if (!gmailSettings || !gmailSettings.email_address || gmailSettings.status !== 'connected' || !gmailSettings.enabled) {
              console.warn(`[Worker Contact Enquiry ${enquiry.ticket_id}] Gmail integration not connected or active. Skipping email send.`);
              await updateContactEnquiryEmailStatus(enquiry.id, 'not_configured', {
                emailError: 'Gmail integration not connected or inactive',
              }, env);
            } else {
              const template = generateContactEnquiryEmailTemplate({
                ticketId: enquiry.ticket_id,
                fullName: enquiry.full_name,
                email: enquiry.email,
                phone: enquiry.phone,
                company: enquiry.company,
                category: enquiry.category,
                eventDate: enquiry.event_date,
                expectedAttendees: enquiry.expected_attendees,
                message: enquiry.message,
                timestamp: new Date(enquiry.created_at).toLocaleString('en-SG', { timeZone: 'Asia/Singapore' }) + ' (UTC+8)',
              });

              console.log(`[Worker Contact Enquiry ${enquiry.ticket_id}] Sending notification to ${recipientEmail} with reply-to ${enquiry.email}...`);

              const sendResult = await sendEmailViaGmail({
                to: recipientEmail,
                replyTo: enquiry.email,
                fromName: 'Event Game Studio',
                subject: template.subject,
                html: template.html,
                text: template.text,
              }, env);

              await updateContactEnquiryEmailStatus(enquiry.id, 'sent', {
                emailMessageId: sendResult.messageId,
                emailSentAt: new Date().toISOString(),
              }, env);
              emailDelivered = true;
              console.log(`[Worker Contact Enquiry ${enquiry.ticket_id}] Email delivered successfully. Message ID: ${sendResult.messageId}`);
            }
          } catch (emailErr: any) {
            console.error(`[Worker Contact Enquiry ${enquiry.ticket_id}] Failed to send email via Gmail API:`, emailErr);
            await updateContactEnquiryEmailStatus(enquiry.id, 'failed', {
              emailError: emailErr.message || 'Unknown Gmail API error',
            }, env);
            emailDelivered = false;
          }

          // Step 3: Return success with server-confirmed ticket ID
          return jsonResponse({
            success: true,
            enquiryId: enquiry.id,
            ticketId: enquiry.ticket_id,
            emailDelivered,
            message: 'Thank you! Your enquiry has been received. Our team will contact you shortly.',
          }, 200, cors);
        } catch (err: any) {
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // GET /api/developer/contact-enquiries & /api/admin/contact-enquiries
      if ((pathname === '/api/developer/contact-enquiries' || pathname === '/api/admin/contact-enquiries') && method === 'GET') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;
        if (!isUserDeveloperAdmin(auth.user, env)) {
          return errorResponse('Forbidden: Developer Admin access required', 403, cors);
        }

        try {
          const url = new URL(request.url);
          const page = parseInt(url.searchParams.get('page') || '1', 10) || 1;
          const pageSize = parseInt(url.searchParams.get('pageSize') || '20', 10) || 20;
          const search = url.searchParams.get('search') || undefined;
          const status = (url.searchParams.get('status') || undefined) as any;
          const emailStatus = (url.searchParams.get('emailStatus') || undefined) as any;

          const result = await listContactEnquiries({ page, pageSize, search, status, emailStatus }, env);
          return jsonResponse(result, 200, cors);
        } catch (err: any) {
          console.error('Admin get contact enquiries error:', err);
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // GET /api/developer/events & /api/admin/events
      if ((pathname === '/api/developer/events' || pathname === '/api/admin/events') && method === 'GET') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;
        if (!isUserDeveloperAdmin(auth.user, env)) {
          return errorResponse('Forbidden: Developer Admin access required', 403, cors);
        }

        try {
          const events = await getAllAdminEvents(env);
          return jsonResponse({ success: true, events }, 200, cors);
        } catch (err: any) {
          console.error('Admin get all events error:', err);
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // PUT/PATCH /api/developer/events/:eventId/pricing & /api/admin/events/:eventId/pricing
      const devEventPricingMatch = parseRoute('/api/developer/events/:eventId/pricing', pathname) ||
                                  parseRoute('/api/admin/events/:eventId/pricing', pathname);
      if (devEventPricingMatch && (method === 'PUT' || method === 'PATCH')) {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;
        if (!isUserDeveloperAdmin(auth.user, env)) {
          return errorResponse('Forbidden: Developer Admin access required', 403, cors);
        }

        const { eventId } = devEventPricingMatch;
        const body = (await request.json().catch(() => ({}))) as any;
        const { event_price, event_currency } = body;

        const priceNum = Number(event_price);
        if (isNaN(priceNum) || priceNum <= 0) {
          return errorResponse('event_price must be a positive number greater than 0', 422, cors);
        }

        try {
          const updatedEvent = await updateEventPrice(
            eventId,
            {
              event_price: priceNum,
              event_currency: event_currency ? String(event_currency).trim().toUpperCase() : 'MYR',
            },
            auth.user?.id,
            env
          );

          return jsonResponse({
            success: true,
            event: updatedEvent,
            message: `Event price updated to ${updatedEvent.event_currency || 'MYR'} ${(updatedEvent.event_price || priceNum).toFixed(2)}`,
          }, 200, cors);
        } catch (err: any) {
          console.error('Admin update event price error:', err);
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // POST /api/developer/events/:eventId/reactivate & /api/admin/events/:eventId/reactivate
      const devEventReactivateMatch = parseRoute('/api/developer/events/:eventId/reactivate', pathname) ||
                                      parseRoute('/api/admin/events/:eventId/reactivate', pathname);
      if (devEventReactivateMatch && method === 'POST') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;
        if (!isUserDeveloperAdmin(auth.user, env)) {
          return errorResponse('Forbidden: Developer Admin access required', 403, cors);
        }

        const { eventId } = devEventReactivateMatch;
        const body = (await request.json().catch(() => ({}))) as any;
        const { reason } = body;

        try {
          const event = await reactivateEvent(
            eventId,
            {
              adminUserId: auth.user?.id,
              reason: reason || 'Developer admin manual reactivation',
            },
            env
          );

          return jsonResponse({
            success: true,
            event,
            message: `Event "${event.name}" successfully reactivated to ${event.event_status} status.`,
          }, 200, cors);
        } catch (err: any) {
          console.error('Admin reactivate event error:', err);
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // POST /api/developer/events/maintenance & /api/admin/events/maintenance
      if ((pathname === '/api/developer/events/maintenance' || pathname === '/api/admin/events/maintenance') && method === 'POST') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;
        if (!isUserDeveloperAdmin(auth.user, env)) {
          return errorResponse('Forbidden: Developer Admin access required', 403, cors);
        }

        try {
          const result = await runEventLifecycleMaintenance(env);
          return jsonResponse({
            success: true,
            result,
            message: `Maintenance complete: ${result.cancelledCount} unpaid expired events cancelled, ${result.completedCount} expired paid events marked completed.`,
          }, 200, cors);
        } catch (err: any) {
          console.error('Run event maintenance error in worker:', err);
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // ----------------------------------------------------
      // DEVELOPER ADMIN ORGANIZATIONS ENDPOINTS
      // ----------------------------------------------------

      // GET /api/developer/organizations
      if (pathname === '/api/developer/organizations' && method === 'GET') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;
        if (!isUserDeveloperAdmin(auth.user, env)) {
          return errorResponse('Forbidden: Developer Admin access required', 403, cors);
        }

        try {
          const organizations = await getAllOrganizationsForDeveloper(env);
          return jsonResponse({ success: true, organizations }, 200, cors);
        } catch (err: any) {
          console.error('Developer get organizations error:', err);
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // GET /api/developer/organizations/:orgId
      const devOrgDetailMatch = pathname.match(/^\/api\/developer\/organizations\/([^\/]+)$/);
      if (devOrgDetailMatch && method === 'GET') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;
        if (!isUserDeveloperAdmin(auth.user, env)) {
          return errorResponse('Forbidden: Developer Admin access required', 403, cors);
        }

        const orgId = devOrgDetailMatch[1];
        try {
          const detail = await getOrganizationDetailForDeveloper(orgId, env);
          if (!detail) {
            return errorResponse('Organization not found', 404, cors);
          }
          return jsonResponse({ success: true, ...detail }, 200, cors);
        } catch (err: any) {
          console.error('Developer get organization detail error:', err);
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // POST /api/developer/organizations/:orgId/wallet/recalculate
      const devOrgRecalcMatch = pathname.match(/^\/api\/developer\/organizations\/([^\/]+)\/wallet\/recalculate$/);
      if (devOrgRecalcMatch && method === 'POST') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;
        if (!isUserDeveloperAdmin(auth.user, env)) {
          return errorResponse('Forbidden: Developer Admin access required', 403, cors);
        }

        const orgId = devOrgRecalcMatch[1];
        try {
          const summary = await recalculateWalletBalances(orgId, env);
          return jsonResponse({
            success: true,
            message: 'Wallet balances successfully recalculated and synchronized with ledger.',
            wallet: summary,
          }, 200, cors);
        } catch (err: any) {
          console.error('Developer recalculate wallet error:', err);
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // ====================================================
      // DEVELOPER GMAIL API EMAIL INTEGRATION ENDPOINTS
      // ====================================================

      // GET /api/email/google/connect
      if (pathname === '/api/email/google/connect' && method === 'GET') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;
        if (!isUserDeveloperAdmin(auth.user, env)) {
          return errorResponse('Forbidden: Developer Admin access required', 403, cors);
        }

        try {
          const config = getGoogleMailConfig(env);
          if (!config.clientId) {
            return errorResponse(
              'Server configuration error: GOOGLE_MAIL_CLIENT_ID is not configured in environment variables.',
              500,
              cors
            );
          }

          // Callback URI on the API worker (e.g. https://eventgamestudio-api.kiap93-kmj.workers.dev/api/email/google/callback)
          const callbackRedirectUri = config.redirectUri || `${url.origin}/api/email/google/callback`;
          const stateToken = generateOAuthStateToken(auth.user.id, env, callbackRedirectUri);
          const authUrl = buildGoogleAuthUrl(stateToken, callbackRedirectUri, env);

          const accept = request.headers.get('Accept') || '';
          const isExplicitBrowserRedirect =
            url.searchParams.get('redirect') === 'true' ||
            (!accept.includes('application/json') && accept.includes('text/html'));

          if (isExplicitBrowserRedirect) {
            return new Response(null, {
              status: 302,
              headers: {
                Location: authUrl,
                ...cors,
              },
            });
          }

          return jsonResponse(
            {
              success: true,
              authUrl,
              redirectUri: callbackRedirectUri,
            },
            200,
            cors
          );
        } catch (err: any) {
          console.error('Error generating Google connect URL:', err);
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // GET /api/email/google/callback
      if (pathname === '/api/email/google/callback' && method === 'GET') {
        const frontendBaseUrl = getFrontendBaseUrl(env);
        const redirectSuccess = `${frontendBaseUrl}/developer/email?status=connected`;
        const redirectErrorBase = `${frontendBaseUrl}/developer/email?status=error`;

        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        const oauthError = url.searchParams.get('error');
        const oauthErrorDescription = url.searchParams.get('error_description');

        if (oauthError) {
          console.warn('[Gmail OAuth] Callback received error from Google:', oauthError, oauthErrorDescription);
          const reason = oauthError === 'access_denied' ? 'oauth_denied' : 'oauth_error';
          const detail = oauthErrorDescription || oauthError;
          return Response.redirect(
            `${redirectErrorBase}&reason=${encodeURIComponent(reason)}&detail=${encodeURIComponent(detail)}`,
            302
          );
        }

        if (!code || !state) {
          return Response.redirect(
            `${redirectErrorBase}&reason=missing_code`,
            302
          );
        }

        // Verify state token
        const stateResult = verifyOAuthStateToken(state, env);
        if (!stateResult.valid) {
          console.error('[Gmail OAuth] State validation failed:', stateResult.error);
          return Response.redirect(
            `${redirectErrorBase}&reason=invalid_state&detail=${encodeURIComponent(stateResult.error || '')}`,
            302
          );
        }

        try {
          const config = getGoogleMailConfig(env);
          const callbackRedirectUri = stateResult.redirectUri || config.redirectUri || `${url.origin}/api/email/google/callback`;
          const tokenResult = await exchangeGoogleAuthCode(code, callbackRedirectUri, env);

          if (!tokenResult.refreshToken) {
            console.error('[Gmail OAuth] Token exchange completed without a refresh token');
            return Response.redirect(
              `${redirectErrorBase}&reason=missing_refresh_token`,
              302
            );
          }

          // Encrypt refresh token before storing
          const encryptedRefreshToken = await encryptRefreshToken(tokenResult.refreshToken, undefined, env);

          // Save settings to platform store
          await saveGoogleMailSettings(
            {
              email_address: tokenResult.email,
              refresh_token_encrypted: encryptedRefreshToken,
              connected_by: stateResult.userId || null,
              enabled: true,
              status: 'connected',
              last_error: null,
            },
            env
          );

          console.log(`[Gmail OAuth] Successfully connected platform sending account: ${tokenResult.email}`);

          // Redirect browser to the frontend Developer Email page (no tokens or email in URL)
          return Response.redirect(redirectSuccess, 302);
        } catch (err: any) {
          console.error('[Gmail OAuth] Failed to complete token exchange or save settings:', err);
          const safeDetail = isOperationalError(err) ? encodeURIComponent(err.message || '') : 'internal_error';
          return Response.redirect(
            `${redirectErrorBase}&reason=exchange_failed&detail=${safeDetail}`,
            302
          );
        }
      }

      // GET /api/email/google/status
      if (pathname === '/api/email/google/status' && method === 'GET') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;
        if (!isUserDeveloperAdmin(auth.user, env)) {
          return errorResponse('Forbidden: Developer Admin access required', 403, cors);
        }

        try {
          const settings = await getGoogleMailSettings(env);
          const config = getGoogleMailConfig(env);

          const isConnected = Boolean(
            settings &&
            settings.enabled &&
            settings.refresh_token_encrypted &&
            settings.status !== 'disconnected'
          );

          return jsonResponse(
            {
              success: true,
              connected: isConnected,
              email: isConnected ? (settings?.email_address || null) : null,
              enabled: isConnected ? (settings?.enabled !== false) : false,
              status: isConnected ? (settings?.status || 'connected') : 'disconnected',
              configured: Boolean(config.clientId && config.clientSecret),
              lastConnectedAt: isConnected ? (settings?.last_connected_at || null) : null,
              lastError: settings?.last_error || null,
              redirectUri: config.redirectUri || `${url.origin}/api/email/google/callback`,
              hasClientId: Boolean(config.clientId),
              hasClientSecret: Boolean(config.clientSecret),
            },
            200,
            cors
          );
        } catch (err: any) {
          console.error('Error fetching Google Mail status:', err);
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // POST /api/email/google/disconnect
      if (pathname === '/api/email/google/disconnect' && method === 'POST') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;
        if (!isUserDeveloperAdmin(auth.user, env)) {
          return errorResponse('Forbidden: Developer Admin access required', 403, cors);
        }

        try {
          await disconnectGoogleMail(env);
          console.log('[Gmail API] Platform sending account disconnected by developer admin:', auth.user.email);
          return jsonResponse(
            {
              success: true,
              message: 'Gmail sending integration successfully disconnected.',
            },
            200,
            cors
          );
        } catch (err: any) {
          console.error('Error disconnecting Google Mail:', err);
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // POST /api/email/google/test or /api/email/test
      if ((pathname === '/api/email/google/test' || pathname === '/api/email/test') && method === 'POST') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;
        if (!isUserDeveloperAdmin(auth.user, env)) {
          return errorResponse('Forbidden: Developer Admin access required', 403, cors);
        }

        const body = (await request.json().catch(() => ({}))) as any;
        const recipientEmail = (body?.to || body?.recipientEmail || '').trim().toLowerCase();

        if (!recipientEmail || !recipientEmail.includes('@') || recipientEmail.length < 5) {
          return errorResponse('Valid recipient email address is required (e.g., {"to": "developer@domain.com"})', 422, cors);
        }

        try {
          const settings = await getGoogleMailSettings(env);
          if (!settings || !settings.enabled || !settings.refresh_token_encrypted || settings.status === 'disconnected') {
            return errorResponse(
              'Gmail sending account is not connected. Please connect a Gmail account before sending test emails.',
              400,
              cors
            );
          }

          const template = generateTestEmailTemplate(settings.email_address);

          const result = await sendEmailViaGmail(
            {
              to: recipientEmail,
              subject: template.subject,
              html: template.html,
              text: template.text,
              fromName: 'EventGameStudio Test',
            },
            env
          );

          return jsonResponse(
            {
              success: true,
              message: `Test email successfully sent to ${recipientEmail} via Gmail API.`,
              messageId: result.messageId,
              threadId: result.threadId,
              senderEmail: result.senderEmail,
              recipient: recipientEmail,
              timestamp: new Date().toISOString(),
            },
            200,
            cors
          );
        } catch (err: any) {
          console.error('Test email delivery error:', err);
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // ----------------------------------------------------
      // WALLET ENGINE & TRANSACTION LEDGER ENDPOINTS
      // ----------------------------------------------------

      // GET /api/organizations/:orgId/wallet
      const orgWalletMatch = pathname.match(/^\/api\/organizations\/([^\/]+)\/wallet$/);
      if (orgWalletMatch && method === 'GET') {
        const orgId = orgWalletMatch[1];
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const { isMember } = await verifyOrgMembershipAndPermission(auth.user.id, orgId, undefined, env);
        const isDev = isUserDeveloperAdmin(auth.user, env);
        if (!isMember && !isDev) {
          return errorResponse('Forbidden: Access denied to organization wallet', 403, cors);
        }

        try {
          const wallet = await getWalletBalance(orgId, env);
          let standardEventPrice: number | undefined;
          try {
            const settings = await getPlatformPricingSettings(env);
            standardEventPrice = settings.default_price;
          } catch {
            // ignore
          }
          return jsonResponse({ wallet, standard_event_price: standardEventPrice }, 200, cors);
        } catch (err: any) {
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // GET /api/organizations/:orgId/wallet/transactions
      const orgWalletTxnsMatch = pathname.match(/^\/api\/organizations\/([^\/]+)\/wallet\/transactions$/);
      if (orgWalletTxnsMatch && method === 'GET') {
        const orgId = orgWalletTxnsMatch[1];
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const { isMember } = await verifyOrgMembershipAndPermission(auth.user.id, orgId, undefined, env);
        const isDev = isUserDeveloperAdmin(auth.user, env);
        if (!isMember && !isDev) {
          return errorResponse('Forbidden: Access denied to wallet transactions', 403, cors);
        }

        const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50') || 50));
        const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0') || 0);
        const balanceType = url.searchParams.get('balance_type') as any;
        const transactionType = url.searchParams.get('transaction_type') as any;
        const filterGroup = (url.searchParams.get('filter') || url.searchParams.get('filter_group') || url.searchParams.get('type')) as string;
        const startDate = url.searchParams.get('start_date') as string;
        const endDate = url.searchParams.get('end_date') as string;
        const search = url.searchParams.get('search') as string;

        try {
          const result = await getWalletTransactions(
            orgId,
            {
              limit,
              offset,
              balanceType,
              transactionType,
              filterGroup,
              startDate,
              endDate,
              search,
            },
            env
          );
          return jsonResponse(result, 200, cors);
        } catch (err: any) {
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // GET /api/organizations/:orgId/wallet/audit-trail
      const orgWalletAuditMatch = pathname.match(/^\/api\/organizations\/([^\/]+)\/wallet\/audit-trail$/);
      if (orgWalletAuditMatch && method === 'GET') {
        const orgId = orgWalletAuditMatch[1];
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const { isMember, role } = await verifyOrgMembershipAndPermission(auth.user.id, orgId, undefined, env);
        const isDev = isUserDeveloperAdmin(auth.user, env);
        if ((!isMember || (role !== 'owner' && role !== 'admin')) && !isDev) {
          return errorResponse('Forbidden: Only organization owners and admins can view the wallet audit trail', 403, cors);
        }

        const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50') || 50));
        const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0') || 0);
        const eventType = url.searchParams.get('event_type') as any;

        try {
          const result = await getWalletAuditTrail(orgId, { limit, offset, eventType }, env);
          return jsonResponse(result, 200, cors);
        } catch (err: any) {
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // ----------------------------------------------------
      // PAYMENT PROVIDER WEBHOOK (PUBLIC CRYPTOGRAPHIC VERIFICATION)
      // ----------------------------------------------------
      if (
        (pathname === '/api/webhooks/payment' ||
          pathname === '/api/webhooks/stripe' ||
          pathname === '/api/wallet/webhooks/payment' ||
          pathname === '/api/wallet/webhooks/stripe') &&
        method === 'POST'
      ) {
        const rawBody = await request.text();
        const signature =
          request.headers.get('stripe-signature') ||
          request.headers.get('x-signature') ||
          request.headers.get('x-provider-signature') ||
          request.headers.get('x-hub-signature-256');

        try {
          const headersObj: Record<string, string> = {};
          request.headers.forEach((val, key) => {
            headersObj[key.toLowerCase()] = val;
          });

          const result = await verifyAndProcessPaymentWebhook({
            rawBody,
            signature,
            headers: headersObj,
            env,
          });

          return jsonResponse(
            {
              received: true,
              success: result.success,
              isDuplicate: result.isDuplicate,
              status: result.status,
              orderId: result.orderId,
              message: result.message,
            },
            200,
            cors
          );
        } catch (err: any) {
          console.error('Worker payment webhook error:', err);
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // GET /api/organizations/:orgId/wallet/topup/quote
      const orgQuoteTopupMatch = pathname.match(/^\/api\/organizations\/([^\/]+)\/wallet\/topup\/quote$/);
      if (orgQuoteTopupMatch && method === 'GET') {
        const orgId = orgQuoteTopupMatch[1];
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const { isMember } = await verifyOrgMembershipAndPermission(auth.user.id, orgId, undefined, env);
        const isDev = isUserDeveloperAdmin(auth.user, env);
        if (!isMember && !isDev) {
          return errorResponse('Forbidden: Access denied to organization wallet', 403, cors);
        }

        const amount = Number(url.searchParams.get('amount')) || 0;
        const currency = url.searchParams.get('currency') || 'MYR';

        try {
          const quote = await getTopupQuote({ organizationId: orgId, amount, currency }, env);
          return jsonResponse(quote, 200, cors);
        } catch (err: any) {
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // GET /api/payment/methods & GET /api/wallet/payment-methods & GET /api/organizations/:orgId/wallet/payment-methods
      if (
        (pathname === '/api/payment/methods' ||
          pathname === '/api/wallet/payment-methods' ||
          pathname.match(/^\/api\/organizations\/[^\/]+\/wallet\/payment-methods$/)) &&
        method === 'GET'
      ) {
        return jsonResponse(
          {
            payment_methods: getSupportedPaymentMethods(),
            supported_methods: SUPPORTED_PAYMENT_METHODS.map((m) => m.id),
          },
          200,
          cors
        );
      }

      // POST /api/wallet/topups & POST /api/organizations/:orgId/wallet/topup-orders
      const isCreateTopupOrderRoute =
        (pathname === '/api/wallet/topups' && method === 'POST') ||
        (pathname.match(/^\/api\/organizations\/([^\/]+)\/wallet\/topup-orders$/) && method === 'POST');

      if (isCreateTopupOrderRoute) {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const body = (await request.json().catch(() => ({}))) as any;
        const orgMatch = pathname.match(/^\/api\/organizations\/([^\/]+)\/wallet\/topup-orders$/);
        const orgId = orgMatch ? orgMatch[1] : body.organization_id || body.organizationId;

        if (!orgId || !isUUID(orgId)) {
          return errorResponse('Valid organization ID (UUID) is required', 400, cors);
        }

        const { isMember, role } = await verifyOrgMembershipAndPermission(auth.user.id, orgId, undefined, env);
        const isDev = isUserDeveloperAdmin(auth.user, env);
        if ((!isMember || (role !== 'owner' && role !== 'admin')) && !isDev) {
          return errorResponse('Forbidden: Only organization owners and admins can create top-up orders', 403, cors);
        }

        const amount = Number(body.amount);
        if (isNaN(amount) || amount <= 0) {
          return errorResponse('Top-up amount must be a positive number greater than 0', 400, cors);
        }

        const requestedPaymentMethod = body.payment_method || body.paymentMethod;
        if (requestedPaymentMethod && !isPaymentMethodSupported(requestedPaymentMethod)) {
          return errorResponse(
            `Payment method '${requestedPaymentMethod}' is not supported. Currently supported payment methods: ${SUPPORTED_PAYMENT_METHODS.map((m) => m.id).join(', ')}.`,
            400,
            cors
          );
        }

        try {
          const order = await createTopupOrder(
            {
              organizationId: orgId,
              userId: auth.user.id,
              amount,
              currency: body.currency || 'MYR',
              paymentReference: body.payment_reference || body.paymentReference,
              paymentMethod: body.payment_method || body.paymentMethod,
              notes: body.notes,
              metadata: body.metadata,
            },
            env
          );
          return jsonResponse(
            {
              order,
              message: 'Top-up order created successfully in PENDING status. No wallet balance credited.',
            },
            201,
            cors
          );
        } catch (err: any) {
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // POST /api/wallet/topups/:id/checkout & POST /api/organizations/:orgId/wallet/topup-orders/:id/checkout
      const isCheckoutRoute =
        (pathname.match(/^\/api\/wallet\/topups\/([^\/]+)\/checkout$/) && method === 'POST') ||
        (pathname.match(/^\/api\/organizations\/([^\/]+)\/wallet\/topup-orders\/([^\/]+)\/checkout$/) && method === 'POST');

      if (isCheckoutRoute) {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const orderIdMatch =
          pathname.match(/^\/api\/wallet\/topups\/([^\/]+)\/checkout$/) ||
          pathname.match(/^\/api\/organizations\/[^\/]+\/wallet\/topup-orders\/([^\/]+)\/checkout$/);
        const orderId = orderIdMatch ? orderIdMatch[1] : null;

        if (!orderId) {
          return errorResponse('Order ID is required', 400, cors);
        }

        try {
          const order = await getTopupOrderById(orderId, env);
          if (!order) {
            return errorResponse('Top-up order not found', 404, cors);
          }

          const { isMember, role } = await verifyOrgMembershipAndPermission(auth.user.id, order.organization_id, undefined, env);
          const isDev = isUserDeveloperAdmin(auth.user, env);
          if ((!isMember || (role !== 'owner' && role !== 'admin')) && !isDev) {
            return errorResponse('Forbidden: Only organization owners and admins can checkout top-up orders', 403, cors);
          }

          if (order.status !== 'PENDING') {
            return errorResponse(`Cannot create payment session for order with status ${order.status}. Only PENDING orders can be checked out.`, 400, cors);
          }

          const origin = request.headers.get('origin') || `https://${url.host}`;
          const session = await createPaymentSession({
            order,
            originUrl: origin,
            customerEmail: auth.user.email,
            env,
          });

          return jsonResponse(
            {
              success: true,
              session,
              checkoutUrl: session.checkoutUrl,
              sessionId: session.sessionId,
            },
            200,
            cors
          );
        } catch (err: any) {
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // GET /api/wallet/topups/:id & GET /api/organizations/:orgId/wallet/topup-orders/:id
      const orgGetTopupOrderMatch = pathname.match(/^\/api\/organizations\/([^\/]+)\/wallet\/topup-orders\/([^\/]+)$/);
      const legacyGetTopupOrderMatch = pathname.match(/^\/api\/wallet\/topups\/([^\/]+)$/);

      if ((orgGetTopupOrderMatch || legacyGetTopupOrderMatch) && method === 'GET') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const routeOrgId = orgGetTopupOrderMatch ? orgGetTopupOrderMatch[1] : null;
        const rawOrderId = orgGetTopupOrderMatch ? orgGetTopupOrderMatch[2] : legacyGetTopupOrderMatch![1];
        const url = new URL(request.url);
        const sessionIdQuery = url.searchParams.get('session_id') || url.searchParams.get('sessionId') || undefined;
        const statusQuery = url.searchParams.get('status') || undefined;

        try {
          let order: TopupOrderRecord | null = null;
          if (rawOrderId && rawOrderId !== 'undefined' && rawOrderId !== 'null' && rawOrderId !== 'lookup' && rawOrderId !== 'by-session') {
            order = await getTopupOrderById(rawOrderId, env);
          }

          // Step 3 Fallback lookup by session_id when order_id is missing or not found
          if (!order && sessionIdQuery) {
            // 1. Direct database reference lookup
            order = await findTopupOrderByReference(sessionIdQuery, env);

            // 2. Stripe Checkout Session server-side retrieval and metadata order_id extraction
            if (!order && sessionIdQuery.startsWith('cs_') && !sessionIdQuery.startsWith('cs_egs_')) {
              const stripe = getStripeClient(env);
              if (stripe) {
                try {
                  const stripeSession = await stripe.checkout.sessions.retrieve(sessionIdQuery);
                  const trustedOrderId =
                    stripeSession.metadata?.order_id ||
                    stripeSession.metadata?.orderId;
                  if (trustedOrderId) {
                    order = await getTopupOrderById(trustedOrderId, env);
                  }
                } catch (stripeErr: any) {
                  console.warn(`[Worker Get Topup Order] Failed to retrieve Stripe session ${sessionIdQuery}:`, stripeErr.message);
                }
              }
            }
          }

          if (!order) {
            return errorResponse('Top-up order not found', 404, cors);
          }

          // STRICT ORGANIZATION ISOLATION: User must belong to the order's organization
          if (routeOrgId && routeOrgId !== order.organization_id) {
            return errorResponse('Forbidden: Organization mismatch on top-up order', 403, cors);
          }

          const { isMember } = await verifyOrgMembershipAndPermission(auth.user.id, order.organization_id, undefined, env);
          const isDev = isUserDeveloperAdmin(auth.user, env);
          if (!isMember && !isDev) {
            return errorResponse('Forbidden: Access denied to this top-up order', 403, cors);
          }

          // If order is PENDING, synchronize expiration / timeout status (including Stripe Checkout expiration & reconciliation)
          if (order.status === 'PENDING') {
            order = await syncTopupOrderExpiration(order, { sessionId: sessionIdQuery, status: statusQuery }, env);
          }

          // If order is PAID, run finalizeWalletTopUp to ensure missing notification repair & idempotent reconciliation
          if (order.status === 'PAID') {
            try {
              const finalizeResult = await finalizeWalletTopUp(order, {
                sessionId: sessionIdQuery,
                origin: 'worker_handleGetTopupOrder',
              }, env);
              order = finalizeResult.order;
            } catch (reconErr) {
              console.warn(`[Worker Get Topup Order] Notification/reconciliation check warning for order ${order.id}:`, reconErr);
            }
          }

          return jsonResponse({ order }, 200, cors);
        } catch (err: any) {
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // GET /api/wallet/topups & GET /api/organizations/:orgId/wallet/topup-orders
      const orgListTopupOrdersMatch = pathname.match(/^\/api\/organizations\/([^\/]+)\/wallet\/topup-orders$/);
      const legacyListTopupOrdersMatch = pathname === '/api/wallet/topups';

      if ((orgListTopupOrdersMatch || legacyListTopupOrdersMatch) && method === 'GET') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const orgId = orgListTopupOrdersMatch
          ? orgListTopupOrdersMatch[1]
          : url.searchParams.get('organization_id') || url.searchParams.get('orgId');

        if (!orgId || !isUUID(orgId)) {
          return errorResponse('Valid organization ID (UUID) is required', 400, cors);
        }

        const { isMember } = await verifyOrgMembershipAndPermission(auth.user.id, orgId, undefined, env);
        const isDev = isUserDeveloperAdmin(auth.user, env);
        if (!isMember && !isDev) {
          return errorResponse('Forbidden: Access denied to organization top-up orders', 403, cors);
        }

        try {
          const orders = await listTopupOrdersByOrganization(orgId, env);
          return jsonResponse({ orders }, 200, cors);
        } catch (err: any) {
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // POST /api/wallet/topups/:id/process-status & POST /api/wallet/topups/:id/status & POST /api/organizations/:orgId/wallet/topup-orders/:id/process-status
      const orgProcessStatusMatch = pathname.match(/^\/api\/organizations\/[^\/]+\/wallet\/topup-orders\/([^\/]+)\/process-status$/);
      const legacyProcessStatusMatch = pathname.match(/^\/api\/wallet\/topups\/([^\/]+)\/(?:process-status|status)$/);

      if ((orgProcessStatusMatch || legacyProcessStatusMatch) && method === 'POST') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const orderId = orgProcessStatusMatch ? orgProcessStatusMatch[1] : legacyProcessStatusMatch![1];
        try {
          const order = await getTopupOrderById(orderId, env);
          if (!order) {
            return errorResponse('Top-up order not found', 404, cors);
          }

          const { isMember, role } = await verifyOrgMembershipAndPermission(auth.user.id, order.organization_id, undefined, env);
          const isDev = isUserDeveloperAdmin(auth.user, env);
          if ((!isMember || (role !== 'owner' && role !== 'admin')) && !isDev) {
            return errorResponse('Forbidden: Only organization owners and admins can update top-up order status', 403, cors);
          }

          const body = (await request.json().catch(() => ({}))) as any;

          // CRITICAL SECURITY RULE: Block manual PAID status transitions for public/org routes
          if (body.status === 'PAID') {
            await recordWalletAuditEvent(
              {
                organizationId: order.organization_id,
                eventType: 'UNAUTHORIZED_TOPUP_SETTLEMENT_ATTEMPT',
                orderId: order.id,
                actorId: auth.user.id,
                metadata: {
                  attempted_status: body.status,
                  endpoint: pathname,
                  result: 'FORBIDDEN',
                },
              },
              env
            );

            return jsonResponse(
              {
                error: 'Manual status transition to PAID is forbidden. Top-up orders can only be marked as PAID via verified payment provider webhooks or developer reconciliation.',
                code: 'TOPUP_SETTLEMENT_FORBIDDEN',
              },
              403,
              cors
            );
          }

          // Normal users may only cancel their own pending top-up orders
          if (body.status !== 'CANCELLED') {
            return errorResponse(`Invalid status transition: Only 'CANCELLED' is permitted for client-initiated order updates. Provided: ${body.status}`, 400, cors);
          }

          const result = await processTopupOrderStatus(
            {
              orderId,
              newStatus: 'CANCELLED',
              processedBy: auth.user.id,
              reason: body.reason || 'Cancelled by organization user',
              metadata: body.metadata,
            },
            env
          );

          return jsonResponse(result, 200, cors);
        } catch (err: any) {
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // POST /api/developer/wallet/topups/:id/reconcile
      const devReconcileMatch = pathname.match(/^\/api\/developer\/wallet\/topups\/([^\/]+)\/reconcile$/);
      if (devReconcileMatch && method === 'POST') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const isDev = isUserDeveloperAdmin(auth.user, env);
        if (!isDev) {
          return errorResponse('Forbidden: Developer admin access required for manual payment reconciliation', 403, cors);
        }

        const orderId = devReconcileMatch[1];
        const body = (await request.json().catch(() => ({}))) as any;
        const ref = body.payment_reference || body.paymentReference;
        const reason = body.reason;

        if (!ref || typeof ref !== 'string' || ref.trim().length === 0) {
          return errorResponse('External payment reference is required for manual reconciliation', 400, cors);
        }
        if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
          return errorResponse('Explicit reconciliation reason (minimum 5 characters) is required', 400, cors);
        }

        try {
          const result = await finalizeWalletTopUp(
            orderId,
            {
              paymentReference: ref.trim(),
              paymentMethod: body.payment_method || body.paymentMethod || 'MANUAL_RECONCILIATION',
              reconciledBy: auth.user.id,
              reconciliationReason: reason.trim(),
              isManualReconciliation: true,
              reason: `Manual Admin Reconciliation: ${reason.trim()}`,
              metadata: body.metadata,
            },
            env
          );

          return jsonResponse({ success: true, reconciled: true, ...result }, 200, cors);
        } catch (err: any) {
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // POST /api/developer/wallet/test-webhook
      // CRITICAL SECURITY: Strictly developer-admin only and disabled in production environments.
      if (pathname === '/api/developer/wallet/test-webhook' && method === 'POST') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        if (!isUserDeveloperAdmin(auth.user, env)) {
          return errorResponse('Forbidden: Developer Admin access required. You do not have permission to access test webhook simulations.', 403, cors);
        }

        const isProduction = env.NODE_ENV === 'production' || env.ENVIRONMENT === 'production';
        if (isProduction) {
          return errorResponse('Forbidden: Test webhook simulation is disabled in production environments.', 403, cors);
        }

        const body = (await request.json().catch(() => ({}))) as any;
        const { orderId, eventType = 'payment.succeeded', failureReason } = body;
        if (!orderId) {
          return errorResponse('orderId is required', 400, cors);
        }

        try {
          const order = await getTopupOrderById(orderId, env);
          if (!order) {
            return errorResponse('Top-up order not found', 404, cors);
          }

          const secret = getPaymentWebhookSecret(env);
          const webhookPayload = JSON.stringify({
            id: `evt_sim_${Date.now()}`,
            type: eventType,
            created: Math.floor(Date.now() / 1000),
            data: {
              object: {
                id: `pay_${Date.now()}`,
                amount: order.top_up_amount,
                currency: order.currency,
                metadata: {
                  order_id: order.id,
                  organization_id: order.organization_id,
                },
                status: eventType === 'payment.succeeded' ? 'succeeded' : 'failed',
                failure_reason: failureReason,
              },
            },
          });

          const { signatureHeader } = generateWebhookSignature(webhookPayload, secret);
          const result = await verifyAndProcessPaymentWebhook({
            rawBody: webhookPayload,
            signature: signatureHeader,
            secretOverride: secret,
            env,
          });

          return jsonResponse({ success: true, simulation: true, result }, 200, cors);
        } catch (err: any) {
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // POST /api/organizations/:orgId/wallet/topup
      // DIRECT MUTATION DISABLED FOR PRODUCTION SECURITY
      const orgWalletTopupMatch = pathname.match(/^\/api\/organizations\/([^\/]+)\/wallet\/topup$/);
      if (orgWalletTopupMatch && method === 'POST') {
        return jsonResponse(
          {
            error: 'Direct wallet top-up is disabled. All wallet top-ups must be created as Top-up Orders and settled through verified payment processing.',
            code: 'TOPUP_SETTLEMENT_FORBIDDEN',
          },
          403,
          cors
        );
      }

      // POST /api/organizations/:orgId/wallet/grant-welcome
      const orgWelcomeMatch = pathname.match(/^\/api\/organizations\/([^\/]+)\/wallet\/grant-welcome$/);
      if (orgWelcomeMatch && method === 'POST') {
        const orgId = orgWelcomeMatch[1];
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const isDev = isUserDeveloperAdmin(auth.user, env);
        if (!isDev) {
          return errorResponse('Forbidden: Automatic welcome credit upon organization creation is discontinued. Promotional grants are restricted to developer administrators.', 403, cors);
        }

        const org = await getOrganizationById(orgId, env);
        if (!org) {
          return errorResponse('Organization not found', 404, cors);
        }

        const body = (await request.json().catch(() => ({}))) as any;
        try {
          const result = await grantWelcomeCredit(
            {
              organizationId: orgId,
              userId: org.owner_id,
              createdBy: auth.user.id,
              referenceId: body.reference_id,
              metadata: body.metadata,
            },
            env
          );
          return jsonResponse(
            {
              success: !result.alreadyGranted && !result.notEligible,
              transaction: result.transaction,
              wallet: result.wallet,
              already_granted: result.alreadyGranted,
              not_eligible: Boolean(result.notEligible),
              message: result.message,
            },
            200,
            cors
          );
        } catch (err: any) {
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // GET /api/organizations/:orgId/rewards/eligibility
      const orgRewardsEligibilityMatch = pathname.match(/^\/api\/organizations\/([^\/]+)\/rewards\/eligibility$/);
      if (orgRewardsEligibilityMatch && method === 'GET') {
        const orgId = orgRewardsEligibilityMatch[1];
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const userId = auth.user.id;
        const { isMember } = await verifyOrgMembershipAndPermission(userId, orgId, undefined, env);
        const isDev = isUserDeveloperAdmin(auth.user, env);
        if (!isMember && !isDev) {
          return errorResponse('Forbidden: Must be a member of the organization.', 403, cors);
        }

        try {
          const welcomeEligibility = await evaluatePromotionEligibility({
            userId,
            organizationId: orgId,
            rewardType: 'WELCOME_CREDIT',
            env,
          });

          const showcaseEligibility = await evaluatePromotionEligibility({
            userId,
            organizationId: orgId,
            rewardType: 'SHOWCASE_REWARD',
            env,
          });

          return jsonResponse(
            {
              is_owner: welcomeEligibility.isOwner,
              welcome_credit: welcomeEligibility,
              showcase_reward: showcaseEligibility,
            },
            200,
            cors
          );
        } catch (err: any) {
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // GET /api/organizations/:orgId/wallet/can-use-welcome
      const orgCanUseWelcomeMatch = pathname.match(/^\/api\/organizations\/([^\/]+)\/wallet\/can-use-welcome$/);
      if (orgCanUseWelcomeMatch && method === 'GET') {
        const orgId = orgCanUseWelcomeMatch[1];
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const { isMember } = await verifyOrgMembershipAndPermission(auth.user.id, orgId, undefined, env);
        const isDev = isUserDeveloperAdmin(auth.user, env);
        if (!isMember && !isDev) {
          return errorResponse('Forbidden: Access denied', 403, cors);
        }

        try {
          const eventId = url.searchParams.get('eventId') || undefined;
          const eligibility = await canUseWelcomeCredit(orgId, eventId, env);
          return jsonResponse(eligibility, 200, cors);
        } catch (err: any) {
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // POST /api/organizations/:orgId/wallet/consume-welcome
      const orgConsumeWelcomeMatch = pathname.match(/^\/api\/organizations\/([^\/]+)\/wallet\/consume-welcome$/);
      if (orgConsumeWelcomeMatch && method === 'POST') {
        const orgId = orgConsumeWelcomeMatch[1];
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const { isMember, role } = await verifyOrgMembershipAndPermission(auth.user.id, orgId, undefined, env);
        const isDev = isUserDeveloperAdmin(auth.user, env);
        if ((!isMember || (role !== 'owner' && role !== 'admin')) && !isDev) {
          return errorResponse('Forbidden: Only organization owners and admins can consume welcome credit', 403, cors);
        }

        const body = (await request.json().catch(() => ({}))) as any;
        if (!body.event_id) {
          return errorResponse('Event ID is required', 400, cors);
        }

        try {
          const result = await consumeWelcomeCredit(
            {
              organizationId: orgId,
              eventId: body.event_id,
              referenceId: body.reference_id,
              createdBy: auth.user.id,
              description: body.description,
              metadata: body.metadata,
            },
            env
          );
          return jsonResponse(result, 200, cors);
        } catch (err: any) {
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // POST /api/organizations/:orgId/wallet/grant-showcase
      // DEVELOPER ADMIN ONLY: Organizers cannot directly claim showcase credit.
      // Normal showcase rewards must follow: Showcase -> Eligibility Engine -> AWAITING_APPROVAL -> Developer Admin Approval -> RM300 Wallet Credit.
      const orgShowcaseMatch = pathname.match(/^\/api\/organizations\/([^\/]+)\/wallet\/grant-showcase$/);
      if (orgShowcaseMatch && method === 'POST') {
        const orgId = orgShowcaseMatch[1];
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const isDev = isUserDeveloperAdmin(auth.user, env);
        if (!isDev) {
          return errorResponse(
            'Forbidden: Developer Admin access required. Organizers cannot directly claim showcase credits. Rewards must be earned via eligible showcase submission and developer admin review approval.',
            403,
            cors
          );
        }

        const body = (await request.json().catch(() => ({}))) as any;
        try {
          const result = await grantShowcaseCredit(
            {
              organizationId: orgId,
              eventId: body.event_id,
              createdBy: auth.user.id,
              referenceId: body.reference_id,
              metadata: body.metadata,
            },
            env
          );
          return jsonResponse(
            {
              success: true,
              transaction: result.transaction,
              wallet: result.wallet,
              already_granted: result.alreadyGranted,
            },
            200,
            cors
          );
        } catch (err: any) {
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // GET /api/organizations/:orgId/wallet/can-use-showcase
      const orgCanUseShowcaseMatch = pathname.match(/^\/api\/organizations\/([^\/]+)\/wallet\/can-use-showcase$/);
      if (orgCanUseShowcaseMatch && method === 'GET') {
        const orgId = orgCanUseShowcaseMatch[1];
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const { isMember } = await verifyOrgMembershipAndPermission(auth.user.id, orgId, undefined, env);
        const isDev = isUserDeveloperAdmin(auth.user, env);
        if (!isMember && !isDev) {
          return errorResponse('Forbidden: Access denied', 403, cors);
        }

        try {
          const eventId = url.searchParams.get('eventId') || undefined;
          const eligibility = await canUseShowcaseCredit(orgId, eventId, env);
          return jsonResponse(eligibility, 200, cors);
        } catch (err: any) {
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // POST /api/organizations/:orgId/wallet/consume-showcase
      const orgConsumeShowcaseMatch = pathname.match(/^\/api\/organizations\/([^\/]+)\/wallet\/consume-showcase$/);
      if (orgConsumeShowcaseMatch && method === 'POST') {
        const orgId = orgConsumeShowcaseMatch[1];
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const { isMember, role } = await verifyOrgMembershipAndPermission(auth.user.id, orgId, undefined, env);
        const isDev = isUserDeveloperAdmin(auth.user, env);
        if ((!isMember || (role !== 'owner' && role !== 'admin')) && !isDev) {
          return errorResponse('Forbidden: Only organization owners and admins can consume showcase credit', 403, cors);
        }

        const body = (await request.json().catch(() => ({}))) as any;
        if (!body.event_id) {
          return errorResponse('Event ID is required', 400, cors);
        }

        try {
          const result = await consumeShowcaseCredit(
            {
              organizationId: orgId,
              eventId: body.event_id,
              referenceId: body.reference_id,
              createdBy: auth.user.id,
              description: body.description,
              metadata: body.metadata,
            },
            env
          );
          return jsonResponse(result, 200, cors);
        } catch (err: any) {
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // POST /api/organizations/:orgId/wallet/calculate-event-payment
      const orgCalcPaymentMatch = pathname.match(/^\/api\/organizations\/([^\/]+)\/wallet\/calculate-event-payment$/);
      if (orgCalcPaymentMatch && method === 'POST') {
        const orgId = orgCalcPaymentMatch[1];
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const { isMember } = await verifyOrgMembershipAndPermission(auth.user.id, orgId, undefined, env);
        const isDev = isUserDeveloperAdmin(auth.user, env);
        if (!isMember && !isDev) {
          return errorResponse('Forbidden: Access denied', 403, cors);
        }

        const body = (await request.json().catch(() => ({}))) as any;
        let price: number | undefined = undefined;

        if (body.event_id) {
          const existing = await getEventById(body.event_id, env);
          if (!existing) {
            return errorResponse('Event not found', 404, cors);
          }
          if (existing.organization_id !== orgId) {
            return errorResponse('Forbidden: Event does not belong to this organization', 403, cors);
          }
          const existingPrice = existing.event_price !== undefined && existing.event_price !== null ? Number(existing.event_price) : NaN;
          const existingCurrency = typeof existing.event_currency === 'string' ? existing.event_currency.trim().toUpperCase() : '';
          if (isNaN(existingPrice) || existingPrice <= 0 || !existingCurrency) {
            return handleWorkerApiError(
              new PricingConfigurationError('Pricing configuration error: Event is missing a valid authoritative price or currency. Payment calculation cannot proceed.'),
              request,
              cors,
              env
            );
          }
          price = existingPrice;
        } else {
          const numericPrice = body.event_price !== undefined && body.event_price !== null ? Number(body.event_price) : NaN;
          if (isNaN(numericPrice) || numericPrice <= 0) {
            return handleWorkerApiError(
              new PricingConfigurationError('Pricing configuration error: Valid event price is required. Authoritative price must be configured.'),
              request,
              cors,
              env
            );
          }
          price = numericPrice;
        }
        const mode = (body.payment_mode || 'FULL_PAID') as any;

        try {
          const calculation = await calculateEventPayment(
            price,
            mode,
            orgId,
            {
              topupCreditRequested: body.topup_credit_requested !== undefined ? Number(body.topup_credit_requested) : undefined,
            },
            env
          );
          return jsonResponse({
            calculation,
            eventPrice: calculation.eventPrice,
            paymentMode: calculation.paymentMode,
            paidAmount: calculation.paidAmount,
            welcomeCreditUsed: calculation.welcomeCreditUsed,
            showcaseCreditUsed: calculation.showcaseCreditUsed,
            topupCreditUsed: calculation.topupCreditUsed,
            totalDiscount: calculation.totalDiscount,
            remainingPaidBalance: calculation.remainingPaidBalance,
            remainingCreditBalance: calculation.remainingCreditBalance,
            isPayable: calculation.isPayable,
            reasons: calculation.reasons,
          }, 200, cors);
        } catch (err: any) {
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // POST /api/organizations/:orgId/wallet/quote-payment
      const orgQuoteMatch = pathname.match(/^\/api\/organizations\/([^\/]+)\/wallet\/quote-payment$/);
      if (orgQuoteMatch && method === 'POST') {
        const orgId = orgQuoteMatch[1];
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const { isMember } = await verifyOrgMembershipAndPermission(auth.user.id, orgId, undefined, env);
        const isDev = isUserDeveloperAdmin(auth.user, env);
        if (!isMember && !isDev) {
          return errorResponse('Forbidden: Access denied', 403, cors);
        }

        const body = (await request.json().catch(() => ({}))) as any;
        try {
          const quote = await calculateEventPaymentQuote(
            {
              organizationId: orgId,
              eventId: body.event_id,
              creditChoice: body.credit_choice || 'NONE',
              topupCreditAmountToUse: body.topup_credit_amount ? Number(body.topup_credit_amount) : undefined,
            },
            env
          );
          return jsonResponse({ quote }, 200, cors);
        } catch (err: any) {
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // POST /api/organizations/:orgId/wallet/pay-event
      const orgPayEventMatch = pathname.match(/^\/api\/organizations\/([^\/]+)\/wallet\/pay-event$/);
      if (orgPayEventMatch && method === 'POST') {
        const orgId = orgPayEventMatch[1];
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const { isMember, hasPermission } = await verifyOrgMembershipAndPermission(auth.user.id, orgId, 'event.pay', env);
        const isDev = isUserDeveloperAdmin(auth.user, env);
        if ((!isMember || !hasPermission) && !isDev) {
          return errorResponse('Forbidden: Insufficient permissions to pay for event. Only owners and admins can pay for events.', 403, cors);
        }

        const body = (await request.json().catch(() => ({}))) as any;
        if (!body.event_id) {
          return errorResponse('event_id is required', 400, cors);
        }

        const event = await getEventById(body.event_id, env);
        if (!event) {
          return errorResponse('Event not found', 404, cors);
        }
        if (event.organization_id !== orgId) {
          return errorResponse('Forbidden: Event does not belong to this organization', 403, cors);
        }

        // Load authoritative event price and currency from the event record - fail closed if missing or invalid
        const numericPrice = event.event_price !== undefined && event.event_price !== null ? Number(event.event_price) : NaN;
        const currency = typeof event.event_currency === 'string' ? event.event_currency.trim().toUpperCase() : '';

        if (isNaN(numericPrice) || numericPrice <= 0 || !currency) {
          return handleWorkerApiError(
            new PricingConfigurationError('Pricing configuration error: Event is missing a valid authoritative price or currency. Payment cannot proceed.'),
            request,
            cors,
            env
          );
        }
        const authoritativeEventPrice = numericPrice;

        try {
          const result = await processEventPayment(
            {
              organizationId: orgId,
              eventId: event.id,
              eventName: event.name || body.event_name,
              paymentMode: body.payment_mode || (body.credit_choice ? (body.credit_choice === 'NONE' ? 'FULL_PAID' : body.credit_choice) : undefined),
              creditChoice: body.credit_choice || 'NONE',
              eventPrice: authoritativeEventPrice,
              topupCreditRequested: body.topup_credit_requested !== undefined ? Number(body.topup_credit_requested) : (body.topup_credit_amount ? Number(body.topup_credit_amount) : undefined),
              referenceId: body.reference_id,
              createdBy: auth.user.id,
            },
            env
          );
          return jsonResponse(
            {
              success: true,
              calculation: result.paymentCalculation,
              transactions: result.transactions,
              wallet: result.wallet,
              quote: result.quote,
            },
            200,
            cors
          );
        } catch (err: any) {
          const isInsufficient =
            err.code === 'INSUFFICIENT_BALANCE' ||
            (err.message && err.message.toLowerCase().includes('insufficient'));
          if (isInsufficient) {
            return jsonResponse({
              code: 'INSUFFICIENT_BALANCE',
              error: err.message || 'Insufficient balance',
              required: err.required,
              available: err.available,
              shortfall: err.shortfall,
            }, 402, cors);
          }
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // POST /api/developer/organizations/:orgId/wallet/recalculate
      const devRecalculateMatch = pathname.match(/^\/api\/developer\/organizations\/([^\/]+)\/wallet\/recalculate$/);
      if (devRecalculateMatch && method === 'POST') {
        const orgId = devRecalculateMatch[1];
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;
        if (!isUserDeveloperAdmin(auth.user, env)) {
          return errorResponse('Forbidden: Developer Admin access required', 403, cors);
        }

        try {
          const wallet = await recalculateWalletBalances(orgId, env);
          return jsonResponse({ success: true, wallet }, 200, cors);
        } catch (err: any) {
          console.error('Recalculate wallet error:', err);
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // POST /api/developer/wallet/reverse
      if (pathname === '/api/developer/wallet/reverse' && method === 'POST') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;
        if (!isUserDeveloperAdmin(auth.user, env)) {
          return errorResponse('Forbidden: Developer Admin access required', 403, cors);
        }

        const body = (await request.json().catch(() => ({}))) as any;
        const { transaction_id, reason } = body;
        if (!transaction_id || !reason) {
          return errorResponse('transaction_id and reason are required', 400, cors);
        }

        try {
          const result = await reverseTransaction(
            {
              transactionId: transaction_id,
              reason,
              createdBy: auth.user.id,
            },
            env
          );
          return jsonResponse(
            {
              success: true,
              reversal_transaction: result.reversalTransaction,
              wallet: result.wallet,
            },
            200,
            cors
          );
        } catch (err: any) {
          console.error('Reverse transaction error:', err);
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // ----------------------------------------------------
      // NOTIFICATIONS ENDPOINTS
      // ----------------------------------------------------

      // GET /api/notifications
      if (pathname === '/api/notifications' && method === 'GET') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const rawOrgId = url.searchParams.get('organizationId') || url.searchParams.get('organization_id') || undefined;
        const organizationId = rawOrgId && rawOrgId !== 'undefined' && rawOrgId !== 'null' && rawOrgId.trim() !== ''
          ? rawOrgId.trim()
          : undefined;
        const unreadOnly = url.searchParams.get('unreadOnly') === 'true';
        const category = (url.searchParams.get('category') as any) || undefined;
        const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '20', 10) || 20, 1), 100);
        const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10) || 0, 0);

        try {
          const result = await listNotifications(
            {
              userId: auth.user.id,
              organizationId,
              unreadOnly,
              category,
              limit,
              offset,
            },
            env
          );
          return jsonResponse(result, 200, cors);
        } catch (err: any) {
          console.error('List notifications error:', err);
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // GET /api/notifications/unread-count
      if (pathname === '/api/notifications/unread-count' && method === 'GET') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const rawOrgId = url.searchParams.get('organizationId') || url.searchParams.get('organization_id') || undefined;
        const organizationId = rawOrgId && rawOrgId !== 'undefined' && rawOrgId !== 'null' && rawOrgId.trim() !== ''
          ? rawOrgId.trim()
          : undefined;

        try {
          const count = await getUnreadNotificationCount(auth.user.id, organizationId, env);
          return jsonResponse({ unread_count: count }, 200, cors);
        } catch (err: any) {
          console.error('Get unread notification count error:', err);
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // PATCH / POST /api/notifications/:id/read
      const readMatch = pathname.match(/^\/api\/notifications\/([^\/]+)\/read$/);
      if (readMatch && (method === 'PATCH' || method === 'POST')) {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const notificationId = readMatch[1];
        try {
          const notification = await markNotificationAsRead(notificationId, auth.user.id, env);
          if (!notification) {
            return errorResponse('Notification not found', 404, cors);
          }
          return jsonResponse({ notification }, 200, cors);
        } catch (err: any) {
          console.error('Mark notification read error:', err);
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // POST /api/notifications/mark-all-read
      if (pathname === '/api/notifications/mark-all-read' && method === 'POST') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const body = (await request.json().catch(() => ({}))) as any;
        const organizationId = typeof body?.organizationId === 'string'
          ? body.organizationId
          : (typeof body?.organization_id === 'string' ? body.organization_id : undefined);

        try {
          const resObj = await markAllNotificationsAsRead(auth.user.id, organizationId, env);
          return jsonResponse({ success: true, count: resObj.marked_count, marked_count: resObj.marked_count }, 200, cors);
        } catch (err: any) {
          console.error('Mark all notifications read error:', err);
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // DELETE /api/notifications/:id
      const deleteMatch = pathname.match(/^\/api\/notifications\/([^\/]+)$/);
      if (deleteMatch && method === 'DELETE') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const notificationId = deleteMatch[1];
        try {
          await deleteNotification(notificationId, auth.user.id, env);
          return jsonResponse({ success: true }, 200, cors);
        } catch (err: any) {
          console.error('Delete notification error:', err);
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // POST /api/developer/notifications/dispatch-test
      if (pathname === '/api/developer/notifications/dispatch-test' && method === 'POST') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        if (!isUserDeveloperAdmin(auth.user, env)) {
          return errorResponse('Forbidden: Developer Admin access required', 403, cors);
        }

        const event = (await request.json().catch(() => ({}))) as any;
        if (!event || !event.eventType) {
          return errorResponse('Valid BusinessNotificationEvent with eventType is required', 400, cors);
        }

        if (!event.recipientUserId && !event.organizationId && auth.user?.id) {
          event.recipientUserId = auth.user.id;
        }

        try {
          const createdNotifications = await dispatchNotificationEvent(event, env);
          return jsonResponse({
            success: true,
            created_count: createdNotifications.length,
            notifications: createdNotifications,
          }, 200, cors);
        } catch (err: any) {
          console.error('Developer dispatch-test error in worker:', err);
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // GET /api/developer/error-logs or /api/admin/error-logs
      if (
        (pathname === '/api/developer/error-logs' || pathname === '/api/admin/error-logs') &&
        method === 'GET'
      ) {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        if (!isUserDeveloperAdmin(auth.user, env)) {
          return errorResponse('Forbidden: Developer Admin access required', 403, cors);
        }

        try {
          const result = await listApiErrorLogs({
            page: url.searchParams.get('page') ? Number(url.searchParams.get('page')) : 1,
            pageSize: url.searchParams.get('pageSize') ? Number(url.searchParams.get('pageSize')) : 25,
            requestId: url.searchParams.get('requestId') || undefined,
            startDate: url.searchParams.get('startDate') || undefined,
            endDate: url.searchParams.get('endDate') || undefined,
            endpoint: url.searchParams.get('endpoint') || undefined,
            statusCode: url.searchParams.get('statusCode') ? Number(url.searchParams.get('statusCode')) : undefined,
            service: url.searchParams.get('service') || undefined,
            errorType: url.searchParams.get('errorType') || undefined,
            userId: url.searchParams.get('userId') || undefined,
            search: url.searchParams.get('search') || undefined,
          }, env);

          return jsonResponse({
            success: true,
            data: result.data,
            pagination: result.pagination,
          }, 200, cors);
        } catch (err: any) {
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      // GET /api/developer/error-logs/:id or /api/admin/error-logs/:id
      const errorLogDetailMatch = pathname.match(/^\/api\/(?:developer|admin)\/error-logs\/([^\/]+)$/);
      if (errorLogDetailMatch && method === 'GET') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        if (!isUserDeveloperAdmin(auth.user, env)) {
          return errorResponse('Forbidden: Developer Admin access required', 403, cors);
        }

        const logId = errorLogDetailMatch[1];
        try {
          const log = await getApiErrorLogById(logId, env);
          if (!log) {
            return errorResponse('Error log not found', 404, cors);
          }
          return jsonResponse({
            success: true,
            data: log,
          }, 200, cors);
        } catch (err: any) {
          return handleWorkerApiError(err, request, cors, env);
        }
      }

      return errorResponse('Not found', 404, cors);
    } catch (err: any) {
      return handleWorkerApiError(err, request, cors, env);
    }
  },

  /**
   * Cloudflare Worker Scheduled Cron Trigger Handler
   * Periodically runs event lifecycle maintenance (configured via [triggers] crons in wrangler.toml)
   */
  async scheduled(_controller: any, env: Env, ctx: any): Promise<void> {
    try {
      const maintenancePromise = runEventLifecycleMaintenance(env);
      if (ctx && typeof ctx.waitUntil === 'function') {
        ctx.waitUntil(maintenancePromise);
      }
      const result = await maintenancePromise;
      console.log(
        `[Worker Cron Maintenance] Processed: ` +
        `${result.completedCount} completed, ` +
        `${result.expiredCount} expired, ` +
        `${result.testScoresClearedCount} test scores cleared`
      );
    } catch (err) {
      console.error('[Worker Cron Maintenance] Fatal error running event lifecycle maintenance:', err);
      throw err;
    }
  },
};
