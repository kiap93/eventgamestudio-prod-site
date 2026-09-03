import {
  getUserById,
  getUserByEmail,
  upsertGoogleUser,
  getUserOrganizations,
  createOrganization,
  getOrganizationById,
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
  isUUID,
  createTheme,
  updateTheme,
  duplicateTheme,
  deleteTheme,
  uploadGameAsset,
  getEventsByOrgId,
  getEventById,
  getEventByPublicToken,
  canAccessLiveEvent,
  canAccessPreviewEvent,
  getNormalizedEventDates,
  createEvent,
  createEventWithAtomicPayment,
  updateEvent,
  deleteEvent,
  cancelEvent,
  canCancelEvent,
  determineEventRefund,
  reactivateEvent,
  runEventLifecycleMaintenance,
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
  calculateEventCalendarDays,
  calculateEventAuthoritativePrice,
  getAllAdminEvents,
  updateEventPrice,
  getShowcaseByEventId,
  getShowcaseById,
  createShowcase,
  updateShowcase,
  publishShowcase,
  unpublishShowcase,
  submitShowcaseForReview,
  approveShowcaseReview,
  rejectShowcaseReview,
  getAllShowcasesForAdmin,
  deleteShowcase,
  getShowcaseMedia,
  getShowcaseMediaById,
  createSignedUploadUrlForShowcase,
  createShowcaseMedia,
  reorderShowcaseMedia,
  deleteShowcaseMedia,
  getTopupQuote,
  createTopupOrder,
  getTopupOrderById,
  listTopupOrdersByOrganization,
  processTopupOrderStatus,
  reconcileTopupOrder,
  recordWalletAuditEvent,
  preparePendingTopupOrder,
  getEventHighScores,
  submitEventScore,
  getEventScoreStats,
  deleteEventScore,
  clearEventHighScores,
  getGoogleMailSettings,
  saveGoogleMailSettings,
  disconnectGoogleMail,
  updateGoogleMailStatus,
  updateInvitationEmailStatus,
  getInvitationById,
  renewInvitation,
  deleteInvitation,
} from './server/db/index.js';

import {
  buildGoogleAuthUrl,
  exchangeGoogleAuthCode,
  getGoogleMailConfig,
  getFrontendBaseUrl,
  sendEmailViaGmail,
  generateInvitationEmailTemplate,
  generateTestEmailTemplate,
  generateOAuthStateToken,
  verifyOAuthStateToken,
  encryptRefreshToken,
} from './server/email/index.js';

import {
  createPaymentSession,
  verifyAndProcessPaymentWebhook,
  generateWebhookSignature,
  getPaymentWebhookSecret,
} from './server/payment/index.js';

import {
  signAppToken,
  verifyAppToken,
  verifyGoogleIdToken,
  verifyOrgMembershipAndPermission,
  hashToken,
  isUserDeveloperAdmin,
  AppJWTPayload,
} from './server/auth.js';

import { getSupabaseServerClient } from './server/supabase.js';
import { checkWorkerRateLimit } from './server/rateLimiter.js';

export interface Env {
  NODE_ENV?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  JWT_SECRET?: string;
  ALLOWED_ORIGINS?: string;
  GOOGLE_CLIENT_ID?: string;
  VITE_GOOGLE_CLIENT_ID?: string;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  ASSETS?: {
    fetch: (request: Request | string) => Promise<Response>;
  };
  [key: string]: any;
}

const DEFAULT_ALLOWED_ORIGINS = [
  'https://eventgamestudio.com',
  'https://www.eventgamestudio.com',
  'https://app.eventgamestudio.com',
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

    // 3. Platform & domain matching (EventGameStudio subdomains, Workers, Pages, Cloud Run)
    if (
      hostname === 'eventgamestudio.com' ||
      hostname.endsWith('.eventgamestudio.com') ||
      hostname.endsWith('.workers.dev') ||
      hostname.endsWith('.pages.dev') ||
      hostname.endsWith('.run.app')
    ) {
      return true;
    }

    // 4. In development mode only, permit localhost
    if (!isProduction) {
      if (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname.endsWith('.localhost')
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
  'video/x-matroska',
  'video/ogg',
  'video/3gpp',
]);

const MAX_IMAGE_SIZE = 25 * 1024 * 1024; // 25MB
const MAX_VIDEO_SIZE = 200 * 1024 * 1024; // 200MB

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

function errorResponse(message: string, status = 400, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
  });
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
  const url = new URL(request.url);
  const authHeader = request.headers.get('Authorization');
  let token = '';

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (url.searchParams.get('token')) {
    token = url.searchParams.get('token')!.trim();
  } else if (url.searchParams.get('auth_token')) {
    token = url.searchParams.get('auth_token')!.trim();
  }

  if (!token) {
    return {
      authenticated: false,
      errorResponse: errorResponse('Unauthenticated: Missing or invalid Authorization header or token parameter', 401, cors),
    };
  }

  // 1. Try App JWT
  try {
    const payload = await verifyAppToken(token, undefined, env);
    const user = await getUserById(payload.sub, env);
    if (!user) {
      return {
        authenticated: false,
        errorResponse: errorResponse('Unauthenticated: User no longer exists', 401, cors),
      };
    }
    return { authenticated: true, user, jwtPayload: payload };
  } catch (appErr: any) {
    if (appErr?.message?.includes('JWT_SECRET is required')) {
      console.error('[Worker Auth Config Error]', appErr.message);
      return {
        authenticated: false,
        errorResponse: errorResponse(`Server Configuration Error: ${appErr.message}`, 500, cors),
      };
    }

    // 2. Try Supabase Auth Token
    try {
      const supabase = getSupabaseServerClient(env);
      const { data: authData, error: authErr } = await supabase.auth.getUser(token);
      if (!authErr && authData?.user) {
        let user = await getUserById(authData.user.id, env);
        if (!user && authData.user.email) {
          user = await getUserByEmail(authData.user.email, env);
        }
        if (user) {
          const orgHeader = request.headers.get('x-organization-id') || undefined;
          return {
            authenticated: true,
            user,
            jwtPayload: {
              sub: user.id,
              organizationId: orgHeader,
            },
          };
        }
      }
    } catch (_spErr) {
      // ignore
    }

    return {
      authenticated: false,
      errorResponse: errorResponse('Unauthenticated: Invalid or expired token', 401, cors),
    };
  }
}

export default {
  async fetch(request: Request, env: Env, _ctx?: any): Promise<Response> {
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
      // Rate Limiting Enforcement on API Routes
      // ==========================================
      if (pathname.startsWith('/api') && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        // 1. Auth Rate Limiting (POST /api/auth/google, POST /api/auth/*)
        if (pathname.startsWith('/api/auth/')) {
          const authLimit = checkWorkerRateLimit(request, {
            windowMs: 60 * 1000,
            max: 10,
            keyPrefix: 'worker_auth',
            message: 'Too many authentication attempts. Please wait 1 minute before trying again.',
          });
          if (!authLimit.allowed) {
            return jsonResponse(authLimit.errorResponse, 429, { ...cors, ...authLimit.headers });
          }
        }

        // 2. Invitation Rate Limiting (POST /api/invitations/*, POST /api/organizations/:id/invitations)
        else if (pathname.startsWith('/api/invitations') || pathname.includes('/invitations')) {
          const inviteLimit = checkWorkerRateLimit(request, {
            windowMs: 60 * 1000,
            max: 15,
            keyPrefix: 'worker_invitations',
            message: 'Too many invitations sent in a short period. Please wait a moment before sending more.',
          });
          if (!inviteLimit.allowed) {
            return jsonResponse(inviteLimit.errorResponse, 429, { ...cors, ...inviteLimit.headers });
          }
        }

        // 3. Organization Creation Rate Limiting (POST /api/organizations)
        else if (pathname === '/api/organizations' && method === 'POST') {
          const orgLimit = checkWorkerRateLimit(request, {
            windowMs: 60 * 1000,
            max: 10,
            keyPrefix: 'worker_org_creation',
            message: 'Organization creation rate limit exceeded. Please wait a minute before creating another organization.',
          });
          if (!orgLimit.allowed) {
            return jsonResponse(orgLimit.errorResponse, 429, { ...cors, ...orgLimit.headers });
          }
        }

        // 4. Wallet & Financial Rate Limiting (POST /api/organizations/:id/wallet/*)
        else if (pathname.includes('/wallet/')) {
          const walletLimit = checkWorkerRateLimit(request, {
            windowMs: 60 * 1000,
            max: 15,
            keyPrefix: 'worker_wallet',
            message: 'Wallet transaction rate limit exceeded. Please wait a moment before processing another payment or top-up.',
          });
          if (!walletLimit.allowed) {
            return jsonResponse(walletLimit.errorResponse, 429, { ...cors, ...walletLimit.headers });
          }
        }

        // 5. Showcase Rate Limiting (POST/PATCH/DELETE /api/events/:id/showcase/*)
        else if (pathname.includes('/showcase')) {
          const showcaseLimit = checkWorkerRateLimit(request, {
            windowMs: 60 * 1000,
            max: 30,
            keyPrefix: 'worker_showcase',
            message: 'Showcase action rate limit reached. Please slow down and try again shortly.',
          });
          if (!showcaseLimit.allowed) {
            return jsonResponse(showcaseLimit.errorResponse, 429, { ...cors, ...showcaseLimit.headers });
          }
        }

        // 6. Upload Rate Limiting (POST /api/upload/*, direct-upload, upload-url)
        else if (pathname.startsWith('/api/upload') || pathname.includes('upload')) {
          const uploadLimit = checkWorkerRateLimit(request, {
            windowMs: 60 * 1000,
            max: 20,
            keyPrefix: 'worker_uploads',
            message: 'File upload rate limit reached. Please wait a moment before uploading more files.',
          });
          if (!uploadLimit.allowed) {
            return jsonResponse(uploadLimit.errorResponse, 429, { ...cors, ...uploadLimit.headers });
          }
        }

        // 7. High Scores Rate Limiting (POST /api/events/:id/high-scores, POST /api/public/events/:token/high-scores)
        else if (pathname.includes('/high-scores') && method === 'POST') {
          const scoreLimit = checkWorkerRateLimit(request, {
            windowMs: 60 * 1000,
            max: 30,
            keyPrefix: 'worker_high_scores',
            message: 'Too many score submissions. Please wait a moment before submitting another score.',
          });
          if (!scoreLimit.allowed) {
            return jsonResponse(scoreLimit.errorResponse, 429, { ...cors, ...scoreLimit.headers });
          }
        }

        // 7B. Event Creation Rate Limiting (POST /api/events) - Max 3 attempts per 10 minutes per organization
        else if (pathname === '/api/events' && method === 'POST') {
          const creationLimit = checkWorkerRateLimit(request, {
            windowMs: 10 * 60 * 1000,
            max: 3,
            keyPrefix: 'worker_event_creation',
            message: 'Event creation rate limit exceeded: Maximum 3 event creation attempts per 10 minutes per organization.',
          });
          if (!creationLimit.allowed) {
            return jsonResponse(creationLimit.errorResponse, 429, { ...cors, ...creationLimit.headers });
          }
        }

        // 8. Event Mutation Rate Limiting (POST /api/events/quote, /cancel, etc.)
        else if (pathname.startsWith('/api/events')) {
          const eventLimit = checkWorkerRateLimit(request, {
            windowMs: 60 * 1000,
            max: 20,
            keyPrefix: 'worker_events',
            message: 'Event creation and modification rate limit exceeded. Please slow down.',
          });
          if (!eventLimit.allowed) {
            return jsonResponse(eventLimit.errorResponse, 429, { ...cors, ...eventLimit.headers });
          }
        }

        // 9. General API fallback rate limiting for any other mutating route
        else {
          const generalLimit = checkWorkerRateLimit(request, {
            windowMs: 60 * 1000,
            max: 120,
            keyPrefix: 'worker_general_api',
            message: 'API request rate limit exceeded. Please try again in a few seconds.',
          });
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
        const body = (await request.json().catch(() => ({}))) as any;
        const { idToken } = body;
        if (!idToken) {
          return errorResponse('Missing idToken', 422, cors);
        }

        const googleUser = await verifyGoogleIdToken(idToken, env);
        const user = await upsertGoogleUser(googleUser, env);

        if (!user) {
          return errorResponse('Failed to create or load user record in Supabase', 500, cors);
        }

        const memberships = await getUserOrganizations(user.id, env);
        let activeOrgId: string | undefined = undefined;
        let activeRole: string | undefined = undefined;

        if (memberships.length > 0) {
          activeOrgId = memberships[0].id;
          activeRole = memberships[0].role;
        }

        const token = await signAppToken(user.id, activeOrgId, activeRole as any, undefined, env);

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
          cors
        );
      }

      if (pathname === '/api/auth/me' && method === 'GET') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const user = auth.user!;
        const payload = auth.jwtPayload!;

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
                }
              : null,
          },
          200,
          cors
        );
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

        const newToken = await signAppToken(user.id, organizationId, role, undefined, env);
        return jsonResponse(
          {
            token: newToken,
            activeOrganization: {
              id: org.id,
              name: org.name,
              slug: org.slug,
              role,
              logo_url: org.logo_url,
            },
          },
          200,
          cors
        );
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
        const { name, logo_url } = body;

        if (!name || typeof name !== 'string' || !name.trim()) {
          return errorResponse('Organization name is required', 422, cors);
        }

        const organization = await createOrganization(
          {
            name: name.trim(),
            owner_id: user.id,
            logo_url: logo_url || null,
          },
          env
        );

        await addMember(
          {
            organization_id: organization.id,
            user_id: user.id,
            role: 'owner',
          },
          env
        );

        const defaultGame = await ensureDefaultGame(organization.id, organization.name, env);
        const token = await signAppToken(user.id, organization.id, 'owner', undefined, env);

        return jsonResponse(
          {
            organization: {
              id: organization.id,
              name: organization.name,
              slug: organization.slug,
              role: 'owner',
              logo_url: organization.logo_url,
            },
            token,
            gameId: defaultGame.id,
          },
          200,
          cors
        );
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
          emailError = emailErr.message || 'Failed to deliver invitation email via Gmail API';
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
          emailError = emailErr.message || 'Failed to deliver invitation email via Gmail API';
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

        const googleUser = await verifyGoogleIdToken(idToken, env);

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
        const appToken = await signAppToken(user.id, invite.organization_id, invite.role, undefined, env);

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
          cors
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

        // 4. Validate File MIME & Size
        const ALLOWED_MIME_TYPES = new Set([
          'image/png',
          'image/jpeg',
          'image/jpg',
          'image/webp',
          'image/svg+xml',
          'image/gif',
          'image/x-icon',
          'image/vnd.microsoft.icon',
          'audio/mpeg',
          'audio/mp3',
          'audio/wav',
          'audio/ogg',
          'audio/x-wav',
          'audio/aac',
          'video/mp4',
          'video/webm',
          'video/quicktime',
        ]);
        const fileName = file.name || 'uploaded_asset.png';
        const dotIdx = fileName.lastIndexOf('.');
        const ext = dotIdx !== -1 ? fileName.slice(dotIdx).toLowerCase() : '.png';
        const allowedExts = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif', '.ico', '.mp3', '.wav', '.ogg', '.aac', '.mp4', '.webm', '.mov']);

        const mimeType = (file.type || 'application/octet-stream').toLowerCase();
        if (!ALLOWED_MIME_TYPES.has(mimeType) && !allowedExts.has(ext)) {
          return errorResponse(
            `Unsupported file format (${mimeType}). Allowed formats: PNG, JPG, JPEG, WEBP, SVG, GIF, MP3, WAV, OGG, MP4.`,
            422,
            cors
          );
        }

        const MAX_ASSET_SIZE = 25 * 1024 * 1024; // 25MB
        if (file.size > MAX_ASSET_SIZE) {
          return errorResponse(
            `File size exceeds maximum allowed limit of 25MB (${(file.size / (1024 * 1024)).toFixed(1)}MB provided).`,
            422,
            cors
          );
        }

        const safeOrgId = orgId.replace(/[^a-zA-Z0-9_-]/g, '') || 'default';
        const safeCategory = category.replace(/[^a-zA-Z0-9_-]/g, '') || 'general';

        try {
          const arrayBuffer = await file.arrayBuffer();
          const result = await uploadGameAsset(
            {
              organizationId: safeOrgId,
              category: safeCategory as any,
              fileBuffer: new Uint8Array(arrayBuffer),
              originalName: fileName,
              mimeType: mimeType || 'image/png',
            },
            env
          );

          return jsonResponse({ url: result.url, path: result.path }, 200, cors);
        } catch (storageErr: any) {
          console.error('Supabase storage upload error:', storageErr);
          return errorResponse(storageErr.message || 'File upload failed', 500, cors);
        }
      }

      // ==========================================
      // 6. Theme Studio Routes
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
        const {
          game_id,
          name,
          slug,
          description,
          status,
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
              name,
              slug,
              description,
              status,
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
          console.error('Error in worker createTheme:', err);
          return errorResponse(err.message || 'Failed to create theme', 500, cors);
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
        const {
          name,
          slug,
          description,
          status,
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

        try {
          const updatedTheme = await updateTheme(
            themeId,
            {
              name,
              slug,
              description,
              status,
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

          return jsonResponse({ theme: updatedTheme }, 200, cors);
        } catch (err: any) {
          console.error('Error in worker updateTheme:', err);
          return errorResponse(err.message || 'Failed to update theme', 500, cors);
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
        const { background_url, basket_config, items_config, settings_config, name } = body;

        const game = await getGameById(gameId, env);
        if (!game) {
          return errorResponse('Game not found', 404, cors);
        }

        const isSystemGame = Boolean(game.is_system) || !game.organization_id;
        if (isSystemGame) {
          // Platform/system games are customized via themes or developer admin
          if (!isUserDeveloperAdmin(user, env)) {
            return errorResponse('System baseline games cannot be directly modified. Create a custom theme instead.', 403, cors);
          }
        }

        const targetOrgId = game.organization_id || organizationId;
        if (!targetOrgId && !isUserDeveloperAdmin(user, env)) {
          return errorResponse('No active organization context found', 422, cors);
        }

        let requiredPerm = 'game.view';
        if (background_url !== undefined) requiredPerm = 'game.background.edit';
        else if (items_config !== undefined) requiredPerm = 'game.items.edit';
        else if (basket_config !== undefined) requiredPerm = 'game.basket.edit';
        else if (settings_config !== undefined) requiredPerm = 'game.settings.edit';

        if (targetOrgId) {
          const { isMember, role } = await verifyOrgMembershipAndPermission(user.id, targetOrgId, requiredPerm, env);
          if (!isMember) {
            return errorResponse('Access denied: Not an organization member', 403, cors);
          }

          if (role === 'viewer') {
            return errorResponse('Viewers cannot modify game customization', 403, cors);
          }
        }

        const updatedGame = await updateGameCustomization(
          gameId,
          {
            background_url,
            basket_config,
            items_config,
            settings_config,
            name,
          },
          env
        );

        return jsonResponse({ game: updatedGame }, 200, cors);
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

      // ==========================================
      // 8. Events & Public Deployment Routes
      // ==========================================
      const orgEventsRoute = parseRoute('/api/organizations/:organizationId/events', pathname) ||
                             parseRoute('/api/organizations/:orgId/events', pathname);
      if ((pathname === '/api/events' || orgEventsRoute) && method === 'GET') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const user = auth.user!;
        const organizationId = orgEventsRoute?.organizationId || orgEventsRoute?.orgId || auth.jwtPayload?.organizationId;

        if (!organizationId) {
          return errorResponse('No active organization selected', 422, cors);
        }

        const { isMember } = await verifyOrgMembershipAndPermission(user.id, organizationId, 'game.view', env);
        if (!isMember) {
          return errorResponse('Forbidden: You are not a member of this organization', 403, cors);
        }

        const events = await getEventsByOrgId(organizationId, env);
        return jsonResponse({ events }, 200, cors);
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

        const { isMember } = await verifyOrgMembershipAndPermission(user.id, event.organization_id, 'game.view', env);
        if (!isMember) {
          return errorResponse('Forbidden: Access denied to this event preview', 403, cors);
        }

        if (event.event_status === 'CANCELLED' || event.status === 'cancelled' || event.cancel_reason) {
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

        // Check preview accessibility window (Before event_start_date - 1 calendar day)
        const isPreviewAllowed = canAccessPreviewEvent(event);
        if (!isPreviewAllowed) {
          const { startDate, endDate, liveOpenDate } = getNormalizedEventDates(event);
          const isPaid = (event.payment_status || '').toUpperCase() === 'PAID';
          const isLiveAllowed = canAccessLiveEvent(event);

          return jsonResponse({
            error: 'Event preview is only available before the Live event window starts. The Live window is now active.',
            code: 'PREVIEW_WINDOW_ENDED',
            is_preview_available: false,
            live_window_started: true,
            is_paid: isPaid,
            can_access_live: isLiveAllowed,
            start_date: startDate,
            end_date: endDate,
            live_open_date: liveOpenDate,
            public_token: event.public_token,
            event,
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

        const { isMember } = await verifyOrgMembershipAndPermission(user.id, event.organization_id, 'game.view', env);
        if (!isMember) {
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

        const { isMember } = await verifyOrgMembershipAndPermission(user.id, organizationId, 'game.items.view', env);
        if (!isMember) {
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

        let price = typeof event_price === 'number' && event_price > 0 ? event_price : undefined;
        let currency = 'MYR';
        let durationDays = 1;
        let ruleLabel = '1 day';

        if (!price && event_id) {
          const existing = await getEventById(event_id, env);
          if (existing && existing.event_price) {
            price = existing.event_price;
            currency = existing.event_currency || 'MYR';
            durationDays = calculateEventCalendarDays(existing.start_date || existing.event_date, existing.end_date || existing.start_date || existing.event_date);
            ruleLabel = `${durationDays} day${durationDays > 1 ? 's' : ''}`;
          }
        }

        if (!price) {
          try {
            const pricing = await calculateEventAuthoritativePrice({
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
          } catch (e) {
            try {
              const settings = await getPlatformPricingSettings(env);
              price = settings.default_price;
              currency = settings.default_currency;
            } catch {
              price = STANDARD_EVENT_PRICE;
            }
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
        const selectedMode = (payment_mode as PaymentMode) || 'FULL_PAID';

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
          {
            mode: 'WELCOME_CREDIT',
            title: 'Welcome Credit',
            badge: 'Save RM800.00',
            isEligible: welcomeCalc.isPayable,
            creditApplied: welcomeCalc.welcomeCreditUsed,
            paidAmount: welcomeCalc.paidAmount,
            remainingPaidBalance: welcomeCalc.remainingPaidBalance,
            remainingCreditBalance: welcomeCalc.remainingCreditBalance,
            reasons: welcomeCalc.reasons,
          },
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

        const { isMember, role } = await verifyOrgMembershipAndPermission(user.id, organizationId, 'game.items.edit', env);
        if (!isMember || role === 'viewer') {
          return errorResponse('Permission denied: Viewers cannot create events', 403, cors);
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

        try {
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
          if (err.code === 'PENDING_EVENT_LIMIT_REACHED' || err.status === 422) {
            return jsonResponse({
              code: err.code || 'VALIDATION_ERROR',
              error: err.message || 'Maximum 2 pending payment events reached. Please pay for or delete an existing pending event.',
            }, 422, cors);
          }
          if (err.code === 'GAME_INACTIVE' || err.code === 'THEME_GAME_MISMATCH' || err.code === 'GAME_NOT_FOUND') {
            return jsonResponse({
              code: err.code,
              error: err.message,
            }, 422, cors);
          }
          return errorResponse(err.message || 'Failed to create event', err.status || 500, cors);
        }
      }

      const payEventDirectParams = parseRoute('/api/events/:eventId/pay', pathname);
      if (payEventDirectParams && method === 'POST') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const user = auth.user!;
        const { eventId } = payEventDirectParams;

        const event = await getEventById(eventId, env);
        if (!event) {
          return errorResponse('Event not found', 404, cors);
        }

        const { isMember, role } = await verifyOrgMembershipAndPermission(user.id, event.organization_id, 'game.items.edit', env);
        if (!isMember || role === 'viewer') {
          return errorResponse('Permission denied: Viewers cannot pay for events', 403, cors);
        }

        const body = (await request.json().catch(() => ({}))) as any;
        const {
          payment_mode = 'FULL_PAID',
          topup_credit_requested,
          use_welcome_credit,
          use_event_credit,
          welcome_credit_requested,
          event_price,
          reference_id,
        } = body;

        try {
          const result = await processEventPayment(
            {
              organizationId: event.organization_id,
              eventId: event.id,
              paymentMode: payment_mode,
              useWelcomeCredit: use_welcome_credit,
              useEventCredit: use_event_credit,
              welcomeCreditRequested: welcome_credit_requested,
              topupCreditRequested: topup_credit_requested,
              eventPrice: event_price || event.event_price,
              referenceId: reference_id,
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
          if (err.code === 'INSUFFICIENT_BALANCE' || (err.message && err.message.toLowerCase().includes('insufficient'))) {
            return jsonResponse({
              code: 'INSUFFICIENT_BALANCE',
              error: err.message || 'Insufficient balance',
              required: err.required,
              available: err.available,
              shortfall: err.shortfall,
            }, 402, cors);
          }
          return errorResponse(err.message || 'Failed to process payment', err.status || 500, cors);
        }
      }

      const updateEventParams = parseRoute('/api/events/:eventId', pathname);
      if (updateEventParams && method === 'PUT') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const user = auth.user!;
        const { eventId } = updateEventParams;

        const event = await getEventById(eventId, env);
        if (!event) {
          return errorResponse('Event not found', 404, cors);
        }

        const { isMember, role } = await verifyOrgMembershipAndPermission(user.id, event.organization_id, 'game.items.edit', env);
        if (!isMember || role === 'viewer') {
          return errorResponse('Permission denied: Viewers cannot edit events', 403, cors);
        }

        const body = (await request.json().catch(() => ({}))) as any;
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
        } = body;

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
          },
          env
        );

        const enriched = await getEventById(updated.id, env);
        return jsonResponse({ event: enriched }, 200, cors);
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

        const { isMember, role } = await verifyOrgMembershipAndPermission(user.id, event.organization_id, 'game.items.edit', env);
        if (!isMember || !['owner', 'admin'].includes(role || '')) {
          return errorResponse('Permission denied: Only owners and admins can delete events', 403, cors);
        }

        await deleteEvent(eventId, env);
        return jsonResponse({ success: true }, 200, cors);
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

        const { isMember } = await verifyOrgMembershipAndPermission(user.id, event.organization_id, 'game.items.view', env);
        if (!isMember) {
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

        const { isMember, role } = await verifyOrgMembershipAndPermission(user.id, event.organization_id, 'game.items.edit', env);
        if (!isMember || role === 'viewer') {
          return errorResponse('Permission denied: Viewers cannot cancel events', 403, cors);
        }

        const eligibility = canCancelEvent(event);
        if (!eligibility.canCancel) {
          return jsonResponse({
            error: eligibility.reason,
            code: eligibility.code,
            eligibility,
          }, 422, cors);
        }

        const body = (await request.json().catch(() => ({}))) as any;
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

        if (rawEvent.event_status === 'CANCELLED' || rawEvent.status === 'cancelled' || rawEvent.cancel_reason) {
          return jsonResponse({
            error: 'This event has been cancelled.',
            code: 'EVENT_CANCELLED',
            is_cancelled: true,
            cancel_reason: rawEvent.cancel_reason,
          }, 403, {
            ...cors,
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
          });
        }

        const { startDate, endDate, liveOpenDate } = getNormalizedEventDates(rawEvent);
        const isPaid = (rawEvent.payment_status || '').toUpperCase() === 'PAID';

        // 1. Payment status check (checked independently)
        if (!isPaid || rawEvent.status === 'pending_payment') {
          return jsonResponse({
            error: 'This event is currently awaiting payment and activation. Public game access is disabled until paid.',
            code: 'PAYMENT_REQUIRED',
            is_pending_payment: true,
            event_status: rawEvent.event_status,
            payment_status: rawEvent.payment_status,
            event_id: rawEvent.id,
            event_name: rawEvent.name,
            organization_id: rawEvent.organization_id,
            event_price: rawEvent.event_price,
            event_currency: rawEvent.event_currency,
            start_date: startDate,
            end_date: endDate,
            live_open_date: liveOpenDate,
            event: rawEvent,
          }, 403, {
            ...cors,
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
          });
        }

        // 2. Date window check
        const isLiveAllowed = canAccessLiveEvent(rawEvent);
        if (!isLiveAllowed) {
          const curDate = new Date();
          const formatter = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Singapore',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          });
          const todayStr = formatter.format(curDate);

          if (todayStr < liveOpenDate) {
            return jsonResponse({
              error: `This event is scheduled to open on ${liveOpenDate}. Live URL will become active on ${liveOpenDate}.`,
              code: 'EVENT_NOT_OPEN',
              is_scheduled: true,
              live_open_date: liveOpenDate,
              start_date: startDate,
              end_date: endDate,
              event_id: rawEvent.id,
              event_name: rawEvent.name,
              event: rawEvent,
            }, 403, {
              ...cors,
              'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
              'Pragma': 'no-cache',
              'Expires': '0',
            });
          }

          if (todayStr > endDate) {
            return jsonResponse({
              error: `This event concluded on ${endDate}.`,
              code: 'EVENT_EXPIRED',
              is_expired: true,
              start_date: startDate,
              end_date: endDate,
              event_id: rawEvent.id,
              event_name: rawEvent.name,
              event: rawEvent,
            }, 403, {
              ...cors,
              'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
              'Pragma': 'no-cache',
              'Expires': '0',
            });
          }
        }

        return jsonResponse({ event: rawEvent }, 200, {
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

        const result = await getEventHighScores(event.id, { limit, page }, env);
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

        const body = (await request.json().catch(() => ({}))) as any;
        const { player_name, score, metadata } = body;

        if (score === undefined || score === null || isNaN(Number(score))) {
          return errorResponse('Valid numerical score is required', 422, cors);
        }

        try {
          const result = await submitEventScore(
            {
              event_id: event.id,
              player_name,
              score: Number(score),
              metadata,
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
          return jsonResponse({
            error: err.message || 'Failed to submit score',
            code: err.code || 'SCORE_SUBMISSION_ERROR',
          }, err.status || 400, cors);
        }
      }

      // GET /api/events/:eventId/admin/high-scores (Organizer High Scores & Stats)
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

        const { isMember } = await verifyOrgMembershipAndPermission(user.id, event.organization_id, 'game.view', env);
        if (!isMember) {
          return errorResponse('Permission denied', 403, cors);
        }

        const limit = Number(url.searchParams.get('limit') || 100);
        const page = Number(url.searchParams.get('page') || 1);

        const leaderboard = await getEventHighScores(eventId, { limit, page }, env);
        const stats = await getEventScoreStats(eventId, env);

        return jsonResponse({
          event_id: eventId,
          event_name: event.name,
          ...leaderboard,
          stats,
        }, 200, cors);
      }

      // POST /api/events/:eventId/high-scores/clear (Leaderboard Reset)
      const clearScoresParams = parseRoute('/api/events/:eventId/high-scores/clear', pathname);
      if (clearScoresParams && method === 'POST') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const user = auth.user!;
        const { eventId } = clearScoresParams;

        const event = await getEventById(eventId, env);
        if (!event) {
          return errorResponse('Event not found', 404, cors);
        }

        const { isMember, role } = await verifyOrgMembershipAndPermission(user.id, event.organization_id, 'game.items.edit', env);
        if (!isMember || !['owner', 'admin'].includes(role || '')) {
          return errorResponse('Permission denied: Only organization owners and admins can reset event leaderboards', 403, cors);
        }

        await clearEventHighScores(eventId, env);
        return jsonResponse({
          success: true,
          message: 'Event leaderboard reset successfully',
        }, 200, cors);
      }

      // DELETE /api/events/:eventId/high-scores/:scoreId (Delete specific score)
      const deleteScoreParams = parseRoute('/api/events/:eventId/high-scores/:scoreId', pathname);
      if (deleteScoreParams && method === 'DELETE') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const user = auth.user!;
        const { eventId, scoreId } = deleteScoreParams;

        const event = await getEventById(eventId, env);
        if (!event) {
          return errorResponse('Event not found', 404, cors);
        }

        const { isMember, role } = await verifyOrgMembershipAndPermission(user.id, event.organization_id, 'game.items.edit', env);
        if (!isMember || role === 'viewer') {
          return errorResponse('Permission denied: Viewers cannot delete scores', 403, cors);
        }

        await deleteEventScore(eventId, scoreId, env);
        return jsonResponse({
          success: true,
          message: 'Score deleted successfully',
        }, 200, cors);
      }

      // GET /api/events/:eventId/high-scores
      const eventScoresParams = parseRoute('/api/events/:eventId/high-scores', pathname);
      if (eventScoresParams && method === 'GET') {
        const { eventId } = eventScoresParams;
        const event = await getEventById(eventId, env);
        if (!event) {
          return errorResponse('Event not found', 404, cors);
        }

        const limit = Number(url.searchParams.get('limit') || 20);
        const page = Number(url.searchParams.get('page') || 1);

        const result = await getEventHighScores(eventId, { limit, page }, env);
        return jsonResponse({
          event_id: eventId,
          event_name: event.name,
          ...result,
        }, 200, cors);
      }

      // POST /api/events/:eventId/high-scores
      if (eventScoresParams && method === 'POST') {
        const { eventId } = eventScoresParams;
        const event = await getEventById(eventId, env);
        if (!event) {
          return errorResponse('Event not found', 404, cors);
        }

        const body = (await request.json().catch(() => ({}))) as any;
        const { player_name, score, metadata } = body;

        if (score === undefined || score === null || isNaN(Number(score))) {
          return errorResponse('Valid numerical score is required', 422, cors);
        }

        try {
          const result = await submitEventScore(
            {
              event_id: eventId,
              player_name,
              score: Number(score),
              metadata,
            },
            env
          );

          return jsonResponse({
            success: true,
            event_id: eventId,
            ...result,
          }, 201, cors);
        } catch (err: any) {
          console.error('Submit event score error:', err);
          return jsonResponse({
            error: err.message || 'Failed to submit score',
            code: err.code || 'SCORE_SUBMISSION_ERROR',
          }, err.status || 400, cors);
        }
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

        // Check optional auth for org membership
        let isOrgMember = false;
        const authHeader = request.headers.get('Authorization');
        if (authHeader && authHeader.startsWith('Bearer ')) {
          try {
            const token = authHeader.substring(7);
            const payload = await verifyAppToken(token, undefined, env);
            if (payload && payload.sub) {
              const { isMember } = await verifyOrgMembershipAndPermission(payload.sub, event.organization_id, 'game.view', env);
              isOrgMember = isMember;
            }
          } catch {
            // Ignore optional auth error
          }
        }

        if (!showcase) {
          if (isOrgMember) {
            return jsonResponse({ showcase: null }, 200, cors);
          }
          return errorResponse('Showcase not found', 404, cors);
        }

        if (isOrgMember || showcase.status === 'PUBLISHED') {
          return jsonResponse({ showcase }, 200, cors);
        }

        return errorResponse('Showcase is not published', 404, cors);
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

        const { isMember, role } = await verifyOrgMembershipAndPermission(auth.user.id, event.organization_id, 'game.items.edit', env);
        if (!isMember || role === 'viewer') {
          return errorResponse('Permission denied: Viewers cannot create event showcases', 403, cors);
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

        // Normal users can only initialize showcase with DRAFT status
        const initialStatus = status === 'DRAFT' ? 'DRAFT' : 'DRAFT';

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
          return jsonResponse({ showcase }, 201, cors);
        } catch (err: any) {
          console.error('Create showcase error:', err);
          return errorResponse(err.message || 'Failed to create showcase', 500, cors);
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

        const { isMember, role } = await verifyOrgMembershipAndPermission(auth.user.id, event.organization_id, 'game.items.edit', env);
        if (!isMember || role === 'viewer') {
          return errorResponse('Permission denied: Viewers cannot edit event showcases', 403, cors);
        }

        const existing = await getShowcaseByEventId(eventId, env);
        if (!existing) {
          return errorResponse('Event Showcase not found', 404, cors);
        }

        // Enforce Review Editing Rules:
        // SUBMITTED: Normal user cannot silently change the submitted version
        if (existing.review_status === 'SUBMITTED') {
          return errorResponse('Showcase is currently SUBMITTED and undergoing review. Edits cannot be made while under review.', 403, cors);
        }

        // APPROVED: Do not allow changes that invalidate the approved review
        if (existing.review_status === 'APPROVED') {
          return errorResponse('Showcase is APPROVED. Approved showcases are locked from modifications.', 403, cors);
        }

        const body = (await request.json().catch(() => ({}))) as any;
        const { title, description, client_name, client_logo_url, cover_image_url, status } = body;

        if (title !== undefined && (typeof title !== 'string' || !title.trim())) {
          return errorResponse('Showcase title cannot be empty', 422, cors);
        }

        // Protect server-controlled status transitions:
        // Normal users cannot directly set APPROVED or REJECTED or arbitrary statuses
        let safeStatus: any = undefined;
        if (status !== undefined) {
          if (status === 'APPROVED' || status === 'REJECTED') {
            return errorResponse('Cannot set review status directly. Showcase approval is managed by developer review.', 403, cors);
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
          return jsonResponse({ showcase }, 200, cors);
        } catch (err: any) {
          console.error('Update showcase error:', err);
          return errorResponse(err.message || 'Failed to update showcase', 500, cors);
        }
      }

      // POST /api/events/:eventId/showcase/submit
      const submitShowcaseParams = parseRoute('/api/events/:eventId/showcase/submit', pathname);
      if (submitShowcaseParams && method === 'POST') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const { eventId } = submitShowcaseParams;
        const event = await getEventById(eventId, env);
        if (!event) {
          return errorResponse('Event not found', 404, cors);
        }

        const { isMember, role } = await verifyOrgMembershipAndPermission(auth.user.id, event.organization_id, 'game.items.edit', env);
        if (!isMember || role === 'viewer') {
          return errorResponse('Permission denied: Viewers cannot submit showcases for review', 403, cors);
        }

        const existing = await getShowcaseByEventId(eventId, env);
        if (!existing) {
          return errorResponse('Showcase does not exist. Please create your showcase before submitting.', 404, cors);
        }

        if (existing.review_status === 'APPROVED') {
          return errorResponse('Showcase has already been APPROVED and rewarded.', 400, cors);
        }

        try {
          const showcase = await submitShowcaseForReview(eventId, env);
          return jsonResponse({ showcase, message: 'Showcase submitted for review successfully' }, 200, cors);
        } catch (err: any) {
          console.error('Submit showcase error:', err);
          if (err.code === 'MEDIA_REQUIREMENT_NOT_MET' || err.code === 'VALIDATION_ERROR') {
            return jsonResponse({ error: err.message, code: err.code }, 422, cors);
          }
          return errorResponse(err.message || 'Failed to submit showcase', 500, cors);
        }
      }

      // POST /api/events/:eventId/showcase/publish
      const publishShowcaseParams = parseRoute('/api/events/:eventId/showcase/publish', pathname);
      if (publishShowcaseParams && method === 'POST') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const { eventId } = publishShowcaseParams;
        const event = await getEventById(eventId, env);
        if (!event) {
          return errorResponse('Event not found', 404, cors);
        }

        const { isMember, role } = await verifyOrgMembershipAndPermission(auth.user.id, event.organization_id, 'game.items.edit', env);
        if (!isMember || role === 'viewer') {
          return errorResponse('Permission denied: Viewers cannot publish event showcases', 403, cors);
        }

        const existing = await getShowcaseByEventId(eventId, env);
        if (!existing) {
          return errorResponse('Event Showcase not found', 404, cors);
        }

        try {
          const showcase = await publishShowcase(eventId, env);
          return jsonResponse({ showcase }, 200, cors);
        } catch (err: any) {
          console.error('Publish showcase error:', err);
          return errorResponse(err.message || 'Failed to publish showcase', 500, cors);
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

        const { isMember, role } = await verifyOrgMembershipAndPermission(auth.user.id, event.organization_id, 'game.items.edit', env);
        if (!isMember || role === 'viewer') {
          return errorResponse('Permission denied: Viewers cannot unpublish event showcases', 403, cors);
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
          return errorResponse(err.message || 'Failed to unpublish showcase', 500, cors);
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

        let isOrgMember = false;
        const authHeader = request.headers.get('Authorization');
        if (authHeader && authHeader.startsWith('Bearer ')) {
          try {
            const token = authHeader.substring(7);
            const payload = await verifyAppToken(token, undefined, env);
            if (payload && payload.sub) {
              const { isMember } = await verifyOrgMembershipAndPermission(payload.sub, event.organization_id, 'game.view', env);
              isOrgMember = isMember;
            }
          } catch {
            // Ignore optional auth error
          }
        }

        if (!isOrgMember && showcase.status !== 'PUBLISHED') {
          return errorResponse('Showcase is not publicly accessible', 403, cors);
        }

        try {
          const media = await getShowcaseMedia(showcase.id, event.organization_id, env);
          return jsonResponse({ media }, 200, cors);
        } catch (err: any) {
          console.error('Get showcase media error:', err);
          return errorResponse(err.message || 'Failed to load showcase media', 500, cors);
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

        const { isMember, role } = await verifyOrgMembershipAndPermission(auth.user.id, event.organization_id, 'game.items.edit', env);
        if (!isMember || role === 'viewer') {
          return errorResponse('Permission denied: Viewers cannot upload showcase media', 403, cors);
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

        const lowerMime = fileType.toLowerCase();
        if (normalizedMediaType === 'IMAGE') {
          if (!ALLOWED_IMAGE_MIME_TYPES.has(lowerMime)) {
            return errorResponse(`Unsupported image format (${fileType}). Supported formats: JPG, JPEG, PNG, WEBP.`, 422, cors);
          }
          if (fileSize > MAX_IMAGE_SIZE) {
            return errorResponse(`Image file size exceeds maximum limit of 25MB (${(fileSize / (1024 * 1024)).toFixed(1)}MB provided).`, 422, cors);
          }
        } else {
          if (!ALLOWED_VIDEO_MIME_TYPES.has(lowerMime) && !lowerMime.startsWith('video/')) {
            return errorResponse(`Unsupported video format (${fileType}). Supported formats: MP4, WEBM, MOV.`, 422, cors);
          }
          if (fileSize > MAX_VIDEO_SIZE) {
            return errorResponse(`Video file size exceeds maximum limit of 200MB (${(fileSize / (1024 * 1024)).toFixed(1)}MB provided).`, 422, cors);
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
            },
            env
          );

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
          return errorResponse(err.message || 'Failed to create upload URL', 500, cors);
        }
      }

      // POST /api/events/showcase-media/direct-upload & POST /api/events/:eventId/showcase/media/direct-upload
      const directUploadEventRoute = parseRoute('/api/events/:eventId/showcase/media/direct-upload', pathname);
      if ((pathname === '/api/events/showcase-media/direct-upload' || directUploadEventRoute) && method === 'POST') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        try {
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
          const { isMember, role } = await verifyOrgMembershipAndPermission(auth.user!.id, event.organization_id, 'game.items.edit', env);
          if (!isMember) {
            return errorResponse('Permission denied: You are not a member of this organization', 403, cors);
          }
          if (role === 'viewer') {
            return errorResponse('Permission denied: Viewers cannot upload showcase media', 403, cors);
          }

          // 3. Validate MIME Type and File Size
          const lowerMime = mimeType.toLowerCase();
          const isImage = ALLOWED_IMAGE_MIME_TYPES.has(lowerMime) || lowerMime.startsWith('image/');
          const isVideo = ALLOWED_VIDEO_MIME_TYPES.has(lowerMime) || lowerMime.startsWith('video/');

          if (!isImage && !isVideo) {
            return errorResponse(`Unsupported media format (${mimeType}). Supported formats: JPG, PNG, WEBP, MP4, WEBM, MOV.`, 422, cors);
          }

          if (isImage && fileSize > MAX_IMAGE_SIZE) {
            return errorResponse(`Image file size exceeds maximum limit of 25MB (${(fileSize / (1024 * 1024)).toFixed(1)}MB provided).`, 422, cors);
          }
          if (isVideo && fileSize > MAX_VIDEO_SIZE) {
            return errorResponse(`Video file size exceeds maximum limit of 200MB (${(fileSize / (1024 * 1024)).toFixed(1)}MB provided).`, 422, cors);
          }

          // 4. Storage Path Validation & Sandboxing (Never Trust Client-Provided Arbitrary Path)
          const expectedPrefix = `organizations/${event.organization_id}/showcases/${showcase.id}/`;
          const dotIndex = originalName.lastIndexOf('.');
          const ext = dotIndex !== -1 ? originalName.slice(dotIndex) : isImage ? '.png' : '.mp4';
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
          const { error: uploadErr } = await supabase.storage
            .from('game-assets')
            .upload(storagePath, fileBuffer, {
              contentType: lowerMime,
              upsert: true,
            });

          if (uploadErr) {
            console.warn('Supabase storage upload error:', uploadErr);
            return errorResponse(uploadErr.message || 'Storage upload failed', 500, cors);
          }

          const { data: publicData } = supabase.storage
            .from('game-assets')
            .getPublicUrl(storagePath);

          return jsonResponse(
            {
              url: publicData?.publicUrl || `/uploads/${storagePath.split('/').pop()}`,
              path: storagePath,
              fileName: originalName,
              mediaType: isImage ? 'IMAGE' : 'VIDEO',
              fileSize,
            },
            200,
            cors
          );
        } catch (err: any) {
          console.error('Direct media upload error:', err);
          return errorResponse(err.message || 'Direct upload failed', 500, cors);
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

        const { isMember, role } = await verifyOrgMembershipAndPermission(auth.user.id, event.organization_id, 'game.items.edit', env);
        if (!isMember || role === 'viewer') {
          return errorResponse('Permission denied: Viewers cannot add showcase media', 403, cors);
        }

        const showcase = await getShowcaseByEventId(eventId, env);
        if (!showcase) {
          return errorResponse('Showcase not found', 404, cors);
        }

        const body = (await request.json().catch(() => ({}))) as any;
        const {
          media_type,
          media_url,
          thumbnail_url,
          file_name,
          file_size,
          mime_type,
          sort_order,
        } = body;

        if (!media_type || (media_type !== 'IMAGE' && media_type !== 'VIDEO')) {
          return errorResponse('media_type must be IMAGE or VIDEO', 422, cors);
        }
        if (!media_url || typeof media_url !== 'string') {
          return errorResponse('media_url is required', 422, cors);
        }
        if (!file_name || typeof file_name !== 'string') {
          return errorResponse('file_name is required', 422, cors);
        }

        try {
          const media = await createShowcaseMedia(
            {
              showcase_id: showcase.id,
              organization_id: event.organization_id,
              media_type,
              media_url,
              thumbnail_url: thumbnail_url || null,
              file_name: file_name.trim(),
              file_size: Number(file_size) || 0,
              mime_type: (mime_type || '').toLowerCase(),
              sort_order: sort_order !== undefined ? Number(sort_order) : undefined,
            },
            env
          );
          return jsonResponse({ media }, 201, cors);
        } catch (err: any) {
          console.error('Create showcase media record error:', err);
          return errorResponse(err.message || 'Failed to create showcase media', 500, cors);
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

        const { isMember, role } = await verifyOrgMembershipAndPermission(auth.user.id, event.organization_id, 'game.items.edit', env);
        if (!isMember || role === 'viewer') {
          return errorResponse('Permission denied: Viewers cannot reorder showcase media', 403, cors);
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
          return errorResponse(err.message || 'Failed to reorder media', 500, cors);
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

        const { isMember, role } = await verifyOrgMembershipAndPermission(auth.user.id, event.organization_id, 'game.items.edit', env);
        if (!isMember || role === 'viewer') {
          return errorResponse('Permission denied: Viewers cannot delete showcase media', 403, cors);
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

        try {
          await deleteShowcaseMedia(mediaId, showcase.id, event.organization_id, env);
          return jsonResponse({ success: true }, 200, cors);
        } catch (err: any) {
          console.error('Delete showcase media error:', err);
          return errorResponse(err.message || 'Failed to delete showcase media', 500, cors);
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
          if (err.code === 'GAME_TYPE_ALREADY_REGISTERED' || err.code === 'GAME_SLUG_ALREADY_REGISTERED' || err.name === 'GameConflictError') {
            return jsonResponse({ success: false, error: err.code || 'GAME_CONFLICT', message: err.message }, 409, cors);
          }
          return errorResponse(err.message, 500, cors);
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
          return errorResponse(err.message || 'Failed to create system theme', 500, cors);
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
          if (err.code === 'GAME_TYPE_ALREADY_REGISTERED' || err.code === 'GAME_SLUG_ALREADY_REGISTERED' || err.name === 'GameConflictError') {
            return jsonResponse({ success: false, error: err.code || 'GAME_CONFLICT', message: err.message }, 409, cors);
          }
          return errorResponse(err.message, 500, cors);
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
          if (err.code === 'GAME_IN_USE' || err.code === '23503' || err.status === 409) {
            return jsonResponse(
              {
                success: false,
                code: 'GAME_IN_USE',
                error: err.message || 'Cannot delete game because it is used by existing events. Deactivate the game instead.',
              },
              409,
              cors
            );
          }
          return errorResponse(err.message || 'Failed to delete game', 500, cors);
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
          return errorResponse(err.message || 'Failed to duplicate theme', 500, cors);
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
          return errorResponse(err.message || 'Failed to set default theme', 500, cors);
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
          return errorResponse(err.message || 'Failed to unset default theme', 500, cors);
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
          return errorResponse(err.message || 'Failed to update theme', 500, cors);
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
          return errorResponse(err.message || 'Failed to delete theme', 500, cors);
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
          return errorResponse(err.message || 'Failed to list showcases', 500, cors);
        }
      }

      // POST /api/developer/showcases/:showcaseId/approve & /api/admin/showcases/:showcaseId/approve
      const devApproveShowcase = parseRoute('/api/developer/showcases/:showcaseId/approve', pathname) ||
                                parseRoute('/api/admin/showcases/:showcaseId/approve', pathname);
      if (devApproveShowcase && method === 'POST') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;
        if (!isUserDeveloperAdmin(auth.user, env)) {
          return errorResponse('Forbidden: Developer Admin access required', 403, cors);
        }

        const { showcaseId } = devApproveShowcase;
        try {
          const result = await approveShowcaseReview(showcaseId, auth.user.id, env);
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
          if (err.code === 'SHOWCASE_NOT_FOUND') {
            return errorResponse(err.message, 404, cors);
          }
          if (err.code === 'INVALID_STATUS_TRANSITION') {
            return errorResponse(err.message, 400, cors);
          }
          return errorResponse(err.message || 'Failed to approve showcase', 500, cors);
        }
      }

      // POST /api/developer/showcases/:showcaseId/reject & /api/admin/showcases/:showcaseId/reject
      const devRejectShowcase = parseRoute('/api/developer/showcases/:showcaseId/reject', pathname) ||
                               parseRoute('/api/admin/showcases/:showcaseId/reject', pathname);
      if (devRejectShowcase && method === 'POST') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;
        if (!isUserDeveloperAdmin(auth.user, env)) {
          return errorResponse('Forbidden: Developer Admin access required', 403, cors);
        }

        const { showcaseId } = devRejectShowcase;
        const body = (await request.json().catch(() => ({}))) as any;
        const { reason, rejection_reason } = body;
        const finalReason = rejection_reason || reason;

        if (!finalReason || typeof finalReason !== 'string' || !finalReason.trim()) {
          return errorResponse('Rejection reason is required', 422, cors);
        }

        try {
          const updatedShowcase = await rejectShowcaseReview(showcaseId, auth.user.id, finalReason.trim(), env);
          return jsonResponse({
            success: true,
            showcase: updatedShowcase,
            message: 'Showcase rejected with feedback for the organization',
          }, 200, cors);
        } catch (err: any) {
          console.error('Reject showcase error:', err);
          if (err.code === 'SHOWCASE_NOT_FOUND') {
            return errorResponse(err.message, 404, cors);
          }
          if (err.code === 'REJECTION_REASON_REQUIRED') {
            return errorResponse(err.message, 422, cors);
          }
          return errorResponse(err.message || 'Failed to reject showcase', 500, cors);
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
          console.error('Get platform pricing error:', err);
          return errorResponse(err.message || 'Failed to get platform pricing', 500, cors);
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
          console.error('Admin get pricing settings error:', err);
          return errorResponse(err.message || 'Failed to get pricing settings', 500, cors);
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
          return errorResponse(err.message || 'Failed to update pricing settings', 422, cors);
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
          return errorResponse(err.message || 'Failed to fetch admin events', 500, cors);
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
          if (err.code === 'EVENT_NOT_FOUND' || err.message?.includes('not found')) {
            return errorResponse(err.message, 404, cors);
          }
          return errorResponse(err.message || 'Failed to update event price', 500, cors);
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
          return errorResponse(err.message || 'Failed to reactivate event', err.status || 500, cors);
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
          return errorResponse(err.message || 'Failed to run event lifecycle maintenance', 500, cors);
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
          return errorResponse(err.message || 'Failed to fetch developer organizations', 500, cors);
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
          return errorResponse(err.message || 'Failed to fetch organization detail', 500, cors);
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
          return errorResponse(err.message || 'Failed to recalculate wallet balances', 500, cors);
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
          return errorResponse(err.message || 'Failed to initiate Google OAuth connect', 500, cors);
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
          return Response.redirect(
            `${redirectErrorBase}&reason=exchange_failed&detail=${encodeURIComponent(err.message || '')}`,
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
          return errorResponse(err.message || 'Failed to fetch Google Mail status', 500, cors);
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
          return errorResponse(err.message || 'Failed to disconnect Google Mail', 500, cors);
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
          return errorResponse(err.message || 'Failed to send test email via Gmail API', 500, cors);
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
          return jsonResponse({ wallet, standard_event_price: STANDARD_EVENT_PRICE }, 200, cors);
        } catch (err: any) {
          return errorResponse(err.message || 'Failed to get wallet', 500, cors);
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
          return errorResponse(err.message || 'Failed to get transactions', 500, cors);
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
          return errorResponse(err.message || 'Failed to get audit trail', 500, cors);
        }
      }

      // ----------------------------------------------------
      // PAYMENT PROVIDER WEBHOOK (PUBLIC CRYPTOGRAPHIC VERIFICATION)
      // ----------------------------------------------------
      if ((pathname === '/api/webhooks/payment' || pathname === '/api/wallet/webhooks/payment') && method === 'POST') {
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
          console.error('Worker payment webhook error:', err.message);
          const statusCode = err.status || (err.code === 'INVALID_SIGNATURE' ? 400 : 422);
          return jsonResponse(
            {
              error: err.message || 'Payment webhook verification failed',
              code: err.code || 'WEBHOOK_VERIFICATION_FAILED',
            },
            statusCode,
            cors
          );
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
          return errorResponse(err.message || 'Failed to get top-up quote', 500, cors);
        }
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
          return errorResponse(err.message || 'Failed to create top-up order', 500, cors);
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
          return errorResponse(err.message || 'Failed to create checkout session', 500, cors);
        }
      }

      // GET /api/wallet/topups/:id & GET /api/organizations/:orgId/wallet/topup-orders/:id
      const getTopupOrderMatch =
        (pathname.match(/^\/api\/wallet\/topups\/([^\/]+)$/) && method === 'GET') ||
        (pathname.match(/^\/api\/organizations\/([^\/]+)\/wallet\/topup-orders\/([^\/]+)$/) && method === 'GET');

      if (getTopupOrderMatch) {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const orderId = getTopupOrderMatch[2] || getTopupOrderMatch[1];
        try {
          const order = await getTopupOrderById(orderId, env);
          if (!order) {
            return errorResponse('Top-up order not found', 404, cors);
          }

          const { isMember } = await verifyOrgMembershipAndPermission(auth.user.id, order.organization_id, undefined, env);
          const isDev = isUserDeveloperAdmin(auth.user, env);
          if (!isMember && !isDev) {
            return errorResponse('Forbidden: Access denied to this top-up order', 403, cors);
          }

          return jsonResponse({ order }, 200, cors);
        } catch (err: any) {
          return errorResponse(err.message || 'Failed to get top-up order', 500, cors);
        }
      }

      // GET /api/wallet/topups & GET /api/organizations/:orgId/wallet/topup-orders
      const listTopupOrdersMatch =
        (pathname === '/api/wallet/topups' && method === 'GET') ||
        (pathname.match(/^\/api\/organizations\/([^\/]+)\/wallet\/topup-orders$/) && method === 'GET');

      if (listTopupOrdersMatch) {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const orgMatch = pathname.match(/^\/api\/organizations\/([^\/]+)\/wallet\/topup-orders$/);
        const orgId = orgMatch ? orgMatch[1] : url.searchParams.get('organization_id') || url.searchParams.get('orgId');

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
          return errorResponse(err.message || 'Failed to list top-up orders', 500, cors);
        }
      }

      // POST /api/wallet/topups/:id/process-status & POST /api/wallet/topups/:id/status & POST /api/organizations/:orgId/wallet/topup-orders/:id/process-status
      const processStatusMatch =
        (pathname.match(/^\/api\/wallet\/topups\/([^\/]+)\/(?:process-status|status)$/) && method === 'POST') ||
        (pathname.match(/^\/api\/organizations\/[^\/]+\/wallet\/topup-orders\/([^\/]+)\/process-status$/) && method === 'POST');

      if (processStatusMatch) {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const orderId = processStatusMatch[1];
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
          return errorResponse(err.message || 'Failed to process top-up status', 500, cors);
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
          const result = await reconcileTopupOrder(
            {
              orderId,
              paymentReference: ref.trim(),
              paymentMethod: body.payment_method || body.paymentMethod || 'MANUAL_RECONCILIATION',
              reconciledBy: auth.user.id,
              reason: reason.trim(),
              metadata: body.metadata,
            },
            env
          );

          return jsonResponse({ success: true, reconciled: true, ...result }, 200, cors);
        } catch (err: any) {
          return errorResponse(err.message || 'Failed to reconcile top-up order', 400, cors);
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
          return errorResponse(err.message || 'Test webhook failed', err.status || 500, cors);
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
          return errorResponse('Forbidden: Welcome credit is automatically granted upon organization creation. Manual invocation is restricted to system administrators.', 403, cors);
        }

        const body = (await request.json().catch(() => ({}))) as any;
        try {
          const result = await grantWelcomeCredit(
            {
              organizationId: orgId,
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
          return errorResponse(err.message || 'Failed to grant welcome credit', 500, cors);
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
          return errorResponse(err.message || 'Failed to check welcome credit eligibility', 500, cors);
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
          return errorResponse(err.message || 'Failed to consume welcome credit', 400, cors);
        }
      }

      // POST /api/organizations/:orgId/wallet/grant-showcase
      const orgShowcaseMatch = pathname.match(/^\/api\/organizations\/([^\/]+)\/wallet\/grant-showcase$/);
      if (orgShowcaseMatch && method === 'POST') {
        const orgId = orgShowcaseMatch[1];
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const { isMember, role } = await verifyOrgMembershipAndPermission(auth.user.id, orgId, undefined, env);
        const isDev = isUserDeveloperAdmin(auth.user, env);
        if ((!isMember || (role !== 'owner' && role !== 'admin')) && !isDev) {
          return errorResponse('Forbidden: Only organization owners and admins can claim showcase credit', 403, cors);
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
          return errorResponse(err.message || 'Failed to grant showcase credit', 500, cors);
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
          return errorResponse(err.message || 'Failed to check showcase credit eligibility', 500, cors);
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
          return errorResponse(err.message || 'Failed to consume showcase credit', 400, cors);
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
        const price = body.event_price ? Number(body.event_price) : STANDARD_EVENT_PRICE;
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
          return errorResponse(err.message || 'Failed to calculate event payment', 500, cors);
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
          return errorResponse(err.message || 'Failed to calculate quote', 500, cors);
        }
      }

      // POST /api/organizations/:orgId/wallet/pay-event
      const orgPayEventMatch = pathname.match(/^\/api\/organizations\/([^\/]+)\/wallet\/pay-event$/);
      if (orgPayEventMatch && method === 'POST') {
        const orgId = orgPayEventMatch[1];
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const { isMember, role } = await verifyOrgMembershipAndPermission(auth.user.id, orgId, undefined, env);
        const isDev = isUserDeveloperAdmin(auth.user, env);
        if ((!isMember || (role !== 'owner' && role !== 'admin' && role !== 'designer')) && !isDev) {
          return errorResponse('Forbidden: Insufficient permissions to pay for event', 403, cors);
        }

        const body = (await request.json().catch(() => ({}))) as any;
        if (!body.event_id) {
          return errorResponse('event_id is required', 400, cors);
        }

        try {
          const result = await processEventPayment(
            {
              organizationId: orgId,
              eventId: body.event_id,
              eventName: body.event_name,
              paymentMode: body.payment_mode || (body.credit_choice ? (body.credit_choice === 'NONE' ? 'FULL_PAID' : body.credit_choice) : undefined),
              creditChoice: body.credit_choice || 'NONE',
              eventPrice: body.event_price ? Number(body.event_price) : undefined,
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
          return errorResponse(err.message || 'Failed to process event payment', 400, cors);
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
          return errorResponse(err.message || 'Failed to recalculate wallet', 500, cors);
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
          return errorResponse(err.message || 'Failed to reverse transaction', 500, cors);
        }
      }

      return errorResponse('Not found', 404, cors);
    } catch (err: any) {
      console.error('Unhandled worker error:', err);
      return errorResponse(err.message || 'Internal Server Error', 500, cors);
    }
  },

  /**
   * Cloudflare Worker Scheduled Cron Trigger Handler
   * Periodically runs event lifecycle maintenance (e.g. every minute)
   */
  async scheduled(_controller: any, env: Env, _ctx: any): Promise<void> {
    try {
      const result = await runEventLifecycleMaintenance(env);
      console.log(`[Worker Cron Maintenance] Processed: ${result.cancelledCount} cancelled, ${result.completedCount} completed`);
    } catch (err) {
      console.error('[Worker Cron Maintenance] Error running event lifecycle maintenance:', err);
    }
  },
};
