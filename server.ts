import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';

import {
  OrgRole,
  upsertGoogleUser,
  updateUserProfile,
  getUserOrganizations,
  createOrganization,
  updateOrganization,
  getOrganizationById,
  isValidCountryCode,
  getOrgMembers,
  getActiveOrgInvitations,
  createInvitation,
  getInvitationById,
  renewInvitation,
  deleteInvitation,
  updateInvitationEmailStatus,
  getInvitationByTokenHash,
  markInvitationAccepted,
  getMember,
  getMemberById,
  addMember,
  updateMemberRole,
  removeMember,
  getGamesByOrgId,
  getGameById,
  ensureDefaultGame,
  ensureDefaultGames,
  getAvailableGamesForStudio,
  updateGameCustomization,
  uploadGameAsset,
  getThemesByOrgId,
  getThemeById,
  checkOrganizationThemeReadiness,
  getOrCreateOnboardingTheme,
  isUUID,
  createTheme,
  updateTheme,
  deleteTheme,
  duplicateTheme,
  getAllPlatformGames,
  createPlatformGame,
  updatePlatformGame,
  deletePlatformGame,
  getAllOrganizationsForDeveloper,
  getOrganizationDetailForDeveloper,
  ensureSystemCatalogGames,
  getSystemThemesByGameId,
  getAllSystemThemes,
  createSystemTheme,
  updateSystemTheme,
  deleteSystemTheme,
  duplicateSystemTheme,
  setPrimaryDefaultSystemTheme,
  unsetPrimaryDefaultSystemTheme,
  cloneSystemThemeToOrg,
  cloneAllSystemThemesToOrg,
  ensureSystemDefaultThemesForGame,
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
  cancelEvent,
  canCancelEvent,
  determineEventRefund,
  reactivateEvent,
  runEventLifecycleMaintenance,
  isEventEligibleForShowcase,
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
  getShowcaseMedia,
  getShowcaseMediaById,
  createShowcaseMedia,
  updateShowcaseMedia,
  reorderShowcaseMedia,
  deleteShowcaseMedia,
  createSignedUploadUrlForShowcase,
  validateAndResolveShowcaseMediaPath,
  ASSET_BUCKET,
  SHOWCASE_BUCKET,
  ensureStorageBuckets,
  getWalletBalance,
  getPaidBalance,
  getWelcomeCredit,
  getShowcaseCredit,
  getTopupCredit,
  calculateTopupCredit,
  getTopupQuote,
  preparePendingTopupOrder,
  getPendingTopupOrder,
  createTopupOrder,
  getTopupOrderById,
  findTopupOrderByReference,
  listTopupOrdersByOrganization,
  TopupOrderRecord,
  processTopupOrderStatus,
  reconcileTopupOrder,
  recordWalletAuditEvent,
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
  getAllAdminEvents,
  updateEventPrice,
  submitEventScore,
  getEventHighScores,
  getEventScoreStats,
  deleteEventScore,
  clearEventHighScores,
  manualClearEventTestScores,
  getEventTestScoresCount,
  isEventBeforeStartDate,
  determineScoreEnvironment,
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
} from './server/db/index.js';
import { dispatchNotificationEvent } from './server/notifications/dispatcher.js';
import {
  handleApiError,
  AppError,
  resolveCorrelationId,
  isOperationalError,
} from './server/errors.js';

import {
  authenticateJWT,
  authenticateOptionalJWT,
  authenticateDeveloperAdmin,
  isUserDeveloperAdmin,
  signAppToken,
  verifyGoogleIdToken,
  verifyOrgMembershipAndPermission,
  hashToken,
  AuthenticatedRequest,
} from './server/auth.js';

import {
  PaymentMode,
  ALLOWED_IMAGE_MIME_TYPES,
  ALLOWED_VIDEO_MIME_TYPES,
  ALLOWED_AUDIO_MIME_TYPES,
  MAX_IMAGE_SIZE,
  MAX_VIDEO_SIZE,
  MAX_DIRECT_UPLOAD_SIZE,
} from './server/db/types.js';

import { validateUploadedFile, isSvgContent } from './server/fileValidation.js';

import { getSupabaseServerClient } from './server/supabase.js';

import {
  authRateLimiter,
  invitationRateLimiter,
  organizationRateLimiter,
  eventRateLimiter,
  eventCreationRateLimiter,
  walletRateLimiter,
  showcaseRateLimiter,
  uploadRateLimiter,
  highScoreRateLimiter,
  generalApiRateLimiter,
  publicEventRateLimiter,
  publicHighScoreReadRateLimiter,
  contactRateLimiter,
} from './server/rateLimiter.js';

import {
  createPaymentSession,
  verifyAndProcessPaymentWebhook,
  generateWebhookSignature,
  getPaymentWebhookSecret,
  syncTopupOrderExpiration,
  getStripeClient,
  SUPPORTED_PAYMENT_METHODS,
  isPaymentMethodSupported,
  getSupportedPaymentMethods,
} from './server/payment/index.js';

import {
  DEFAULT_ALLOWED_ORIGINS,
  parseAllowedOrigins,
  isOriginAllowed,
  getCorsHeaders,
} from './server/cors.js';

import {
  getGoogleMailConfig,
  getFrontendBaseUrl,
  generateOAuthStateToken,
  verifyOAuthStateToken,
  buildGoogleAuthUrl,
  exchangeGoogleAuthCode,
  encryptRefreshToken,
  getGoogleMailSettings,
  saveGoogleMailSettings,
  disconnectGoogleMail,
  sendEmailViaGmail,
  generateTestEmailTemplate,
  generateInvitationEmailTemplate,
  generateContactEnquiryEmailTemplate,
} from './server/email/index.js';


const app = express();
const PORT = 3000;

// Production security checks: fail-fast on insecure configuration
if (process.env.NODE_ENV === 'production') {
  if (!process.env.JWT_SECRET) {
    console.error('[FATAL] JWT_SECRET environment variable is required in production. Server startup aborted.');
    process.exit(1);
  }
  if (process.env.ALLOW_MOCK_AUTH === 'true') {
    console.error('[FATAL] ALLOW_MOCK_AUTH is strictly forbidden in production. Server startup aborted.');
    process.exit(1);
  }
}

// ==========================================
// CORS Whitelist Security Policy
// ==========================================
app.use((req, res, next) => {
  const origin = req.headers.origin as string | undefined;
  const reqHost = req.headers.host;
  const reqHeaders = req.headers['access-control-request-headers'] as string | undefined;

  const cors = getCorsHeaders(origin, reqHeaders, { reqHost });

  if (cors['Access-Control-Allow-Origin']) {
    res.setHeader('Access-Control-Allow-Origin', cors['Access-Control-Allow-Origin']);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', cors['Access-Control-Allow-Methods']);
  res.setHeader('Access-Control-Allow-Headers', cors['Access-Control-Allow-Headers']);
  res.setHeader('Access-Control-Max-Age', cors['Access-Control-Max-Age']);

  if (req.method === 'OPTIONS') {
    if (origin && !isOriginAllowed(origin, { reqHost })) {
      return res.status(403).send('CORS origin forbidden');
    }
    return res.sendStatus(204);
  }
  next();
});

app.use(
  express.json({
    limit: '15mb',
    verify: (req: any, _res, buf) => {
      req.rawBody = buf.toString('utf8');
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Correlation / Request ID assignment & header propagation
app.use((req: any, res, next) => {
  req.id = resolveCorrelationId(req);
  res.setHeader('x-correlation-id', req.id);
  next();
});

// Global API rate limiter on all mutating endpoints to prevent volumetric request flood
app.use('/api', (req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    // 1. High-score submissions have their own venue-scale rate limiter (highScoreRateLimiter: 300/min)
    //    and must not be choked by the general 120/min mutating API limiter on shared venue Wi-Fi.
    if (req.path.includes('/high-scores')) {
      return next();
    }
    // 2. Webhook endpoints are authenticated via cryptographic signatures (HMAC SHA256 / Stripe)
    //    and must not be throttled by user IP limits during batch event deliveries.
    if (req.path.includes('/webhooks')) {
      return next();
    }
    return generalApiRateLimiter(req, res, next);
  }
  next();
});

// Serve public static assets (logo.png, favicon.ico, images, fonts, styles) without authentication
const publicDir = path.join(process.cwd(), 'public');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
}

// Ensure local upload fallback directory exists
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
app.use('/uploads', express.static(uploadDir));

// Multer memory storage for direct streaming to Supabase Storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit for general theme assets
});

// Dedicated multer instance for small showcase direct fallback assets (max 10MB to protect memory).
// Large files (up to 200MB) must be uploaded via signed Supabase Storage upload.
const mediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_DIRECT_UPLOAD_SIZE }, // 10MB maximum for direct in-memory upload
});

// ----------------------------------------------------
// AUTH & CONFIG ENDPOINTS
// ----------------------------------------------------

/**
 * GET /api/config
 * Returns runtime environment configuration for client SDKs
 */
app.get('/api/config', (_req, res) => {
  const googleClientId = process.env.VITE_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '';
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';

  res.json({
    googleClientId,
    supabaseUrl,
    supabaseAnonKey,
  });
});

/**
 * POST /api/auth/google
 * Verify Google ID Token, find/create user in Supabase, load organizations, sign JWT
 */
app.post('/api/auth/google', authRateLimiter, async (req, res) => {
  const correlationId =
    (req.headers['x-correlation-id'] as string) ||
    (req.headers['x-request-id'] as string) ||
    crypto.randomUUID();
  res.setHeader('x-correlation-id', correlationId);

  let stage = 'GOOGLE_TOKEN_VERIFY';
  try {
    const { idToken } = req.body;
    if (!idToken) {
      res.status(422).json({ error: 'Missing idToken' });
      return;
    }

    stage = 'GOOGLE_TOKEN_VERIFY';
    const googleUser = await verifyGoogleIdToken(idToken);

    stage = 'GOOGLE_USER_UPSERT';
    const user = await upsertGoogleUser(googleUser, undefined, { correlationId });

    if (!user) {
      console.error(`[Google Auth Error][${correlationId}] GOOGLE_USER_NOT_FOUND: Failed to create or load user record`);
      res.status(401).json({ error: 'Google authentication failed' });
      return;
    }

    stage = 'GOOGLE_LOAD_MEMBERSHIPS';
    let memberships: any[] = [];
    try {
      memberships = await getUserOrganizations(user.id);
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
    const token = await signAppToken(user.id, activeOrgId, activeRole as any);

    res.json({
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
    });
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
    res.status(401).json({ error: 'Google authentication failed' });
  }
});

/**
 * GET /api/auth/me
 * Get current user & active organization details from Supabase
 */
app.get('/api/auth/me', authenticateJWT, async (req: AuthenticatedRequest, res) => {
  const correlationId =
    (req.headers['x-correlation-id'] as string) ||
    (req.headers['x-request-id'] as string) ||
    crypto.randomUUID();
  res.setHeader('x-correlation-id', correlationId);

  try {
    const user = req.user!;
    const payload = req.jwtPayload!;

    const memberships = await getUserOrganizations(user.id);

    let activeOrgId = payload.organizationId;
    let activeMember = memberships.find((m) => m.id === activeOrgId);

    if (!activeMember && memberships.length > 0) {
      activeOrgId = memberships[0].id;
      activeMember = memberships[0];
    }

    res.json({
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
    });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * POST /api/auth/switch-org
 * Switch active organization and reissue JWT
 */
app.post('/api/auth/switch-org', authRateLimiter, authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { organizationId } = req.body;

    if (!organizationId) {
      res.status(422).json({ error: 'organizationId is required' });
      return;
    }

    const { isMember, role } = await verifyOrgMembershipAndPermission(user.id, organizationId);
    if (!isMember) {
      res.status(403).json({ error: 'You are not a member of this organization' });
      return;
    }

    const org = await getOrganizationById(organizationId);
    if (!org) {
      res.status(404).json({ error: 'Organization not found' });
      return;
    }

    const memberships = await getUserOrganizations(user.id);
    const newToken = await signAppToken(user.id, organizationId, role);
    res.json({
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
    });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * PATCH /api/auth/profile
 * PUT /api/auth/profile
 * Safely updates user profile fields (name, avatar_url).
 *
 * CRITICAL SECURITY / PRIVILEGE ESCALATION PREVENTION:
 * Users cannot directly execute UPDATE on public.users via Supabase client.
 * All profile changes MUST flow through this endpoint using service role.
 * Attempts to modify 'is_developer' or other privileged fields are strictly rejected.
 */
const handleUpdateProfile = async (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const user = req.user!;
    const body = req.body || {};

    // 1. Strictly block any privilege escalation attempts
    const forbiddenFields = ['is_developer', 'is_admin', 'role', 'email', 'id', 'created_at', 'updated_at', 'google_id'];
    for (const field of forbiddenFields) {
      if (field in body) {
        res.status(400).json({
          error: `Modifying protected field '${field}' is strictly prohibited`,
        });
        return;
      }
    }

    const { name, avatar_url } = body;
    if (name === undefined && avatar_url === undefined) {
      res.status(400).json({ error: 'At least one field (name or avatar_url) must be provided' });
      return;
    }

    const updatedUser = await updateUserProfile(user.id, { name, avatar_url });

    res.json({
      success: true,
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        avatar_url: updatedUser.avatar_url,
        is_developer: updatedUser.is_developer === true,
      },
    });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
};

app.patch('/api/auth/profile', authRateLimiter, authenticateJWT, handleUpdateProfile);
app.put('/api/auth/profile', authRateLimiter, authenticateJWT, handleUpdateProfile);
app.patch('/api/user/profile', authRateLimiter, authenticateJWT, handleUpdateProfile);
app.put('/api/user/profile', authRateLimiter, authenticateJWT, handleUpdateProfile);

// ----------------------------------------------------
// ORGANIZATIONS API ENDPOINTS
// ----------------------------------------------------

/**
 * GET /api/organizations
 * List organizations for the authenticated user
 */
app.get('/api/organizations', authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const organizations = await getUserOrganizations(user.id);
    res.json({ organizations });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * POST /api/organizations
 * Create a new organization and default game in Supabase
 */
app.post('/api/organizations', organizationRateLimiter, authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { name, logo_url, country_code } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      res.status(422).json({ error: 'Organization name is required' });
      return;
    }

    if (!country_code || typeof country_code !== 'string' || !country_code.trim()) {
      res.status(422).json({ error: "Please select your organization's country." });
      return;
    }

    if (!isValidCountryCode(country_code)) {
      res.status(422).json({ error: 'Invalid country code. Please select a valid country.' });
      return;
    }

    // 1. Create Organization (creates organization, owner membership, and initializes wallet atomically)
    const organization = await createOrganization({
      name: name.trim(),
      owner_id: user.id,
      logo_url: logo_url || null,
      country_code: country_code ? country_code.trim().toUpperCase() : null,
    });

    // 2. Safely resolve or create default game (non-blocking)
    let gameId = 'catch-brand';
    try {
      const defaultGame = await ensureDefaultGame(organization.id, organization.name);
      if (defaultGame?.id) {
        gameId = defaultGame.id;
      }
    } catch (gameErr) {
      console.warn('[POST /api/organizations] Non-blocking warning ensuring default game:', gameErr);
    }

    const token = await signAppToken(user.id, organization.id, 'owner');

    res.json({
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
    });
  } catch (err: any) {
    console.error('[POST /api/organizations] Organization creation failed:', {
      message: err?.message,
      code: err?.code,
      stack: err?.stack,
      body: req.body,
      userId: req.user?.id,
    });
    handleApiError(err, req, res);
  }
});

/**
 * GET /api/organizations/:organizationId
 * Retrieve organization metadata for members
 */
app.get('/api/organizations/:organizationId', authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { organizationId } = req.params;

    const { isMember, role: myRole } = await verifyOrgMembershipAndPermission(
      user.id,
      organizationId,
      'organization.view'
    );

    if (!isMember) {
      res.status(403).json({ error: 'Access denied: You are not a member of this organization' });
      return;
    }

    const org = await getOrganizationById(organizationId);
    if (!org) {
      res.status(404).json({ error: 'Organization not found' });
      return;
    }

    res.json({
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
    });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * PATCH /api/organizations/:organizationId
 * Update organization metadata (name, logo_url, country_code)
 */
app.patch('/api/organizations/:organizationId', authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { organizationId } = req.params;

    const { isMember, role: myRole } = await verifyOrgMembershipAndPermission(
      user.id,
      organizationId,
      'organization.update'
    );

    if (!isMember || !['owner', 'admin'].includes(myRole || '')) {
      res.status(403).json({ error: 'Permission denied to update organization' });
      return;
    }

    const body = req.body || {};

    // Reject attempts to tamper with protected fields
    if (body.id !== undefined && body.id !== organizationId) {
      res.status(403).json({ error: 'Direct mutation of organization id is strictly prohibited' });
      return;
    }
    if (body.owner_id !== undefined) {
      res.status(403).json({ error: 'Direct mutation of organization owner_id is strictly prohibited' });
      return;
    }
    if (body.slug !== undefined) {
      res.status(403).json({ error: 'Direct mutation of organization slug is strictly prohibited' });
      return;
    }

    const updates: { name?: string; logo_url?: string | null; country_code?: string | null } = {};
    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || !body.name.trim()) {
        res.status(422).json({ error: 'Organization name must be a non-empty string' });
        return;
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
          res.status(422).json({ error: 'Invalid country code. Please select a valid country.' });
          return;
        }
        updates.country_code = body.country_code.trim().toUpperCase();
      }
    }

    const updated = await updateOrganization(organizationId, updates);
    res.json({ organization: updated });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * GET /api/organizations/:organizationId/members
 * List members and pending invitations of an organization
 */
app.get('/api/organizations/:organizationId/members', authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { organizationId } = req.params;

    const { isMember, member } = await verifyOrgMembershipAndPermission(
      user.id,
      organizationId,
      'organization.members.view'
    );

    if (!isMember || !member) {
      res.status(403).json({ error: 'Access denied: You are not a member of this organization' });
      return;
    }

    const members = await getOrgMembers(organizationId);
    const invitations = await getActiveOrgInvitations(organizationId);

    res.json({ members, invitations, userRole: member.role });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * POST /api/organizations/:organizationId/invitations
 * Create staff invitation
 */
app.post('/api/organizations/:organizationId/invitations', invitationRateLimiter, authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { organizationId } = req.params;
    const { email, role } = req.body;

    if (!email || !role || !['admin', 'designer', 'viewer'].includes(role)) {
      res.status(422).json({ error: 'Valid email and role (admin, designer, viewer) are required' });
      return;
    }

    const { isMember, role: myRole } = await verifyOrgMembershipAndPermission(
      user.id,
      organizationId,
      'organization.members.invite'
    );

    if (!isMember || !['owner', 'admin'].includes(myRole || '')) {
      res.status(403).json({ error: 'Only owners and admins can invite staff members' });
      return;
    }

    const org = await getOrganizationById(organizationId);
    if (!org) {
      res.status(404).json({ error: 'Organization not found' });
      return;
    }

    // Check if target user is already a member
    const existingMembers = await getOrgMembers(organizationId);
    const alreadyMember = existingMembers.some((m) => m.email.toLowerCase() === email.trim().toLowerCase());
    if (alreadyMember) {
      res.status(409).json({ error: 'User with this email is already a member of the organization' });
      return;
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const invitation = await createInvitation({
      organization_id: organizationId,
      email: email.trim().toLowerCase(),
      role,
      token_hash: tokenHash,
      invited_by: user.id,
      expires_at: expiresAt,
    });

    const frontendBaseUrl = getFrontendBaseUrl(process.env, req);
    const absoluteInviteUrl = `${frontendBaseUrl}/accept-invite?token=${rawToken}`;
    const relativeInviteUrl = `/accept-invite?token=${rawToken}`;

    await dispatchNotificationEvent({
      eventType: 'ORG_INVITATION',
      organizationId,
      recipientUserId: null,
      inviteeEmail: email.trim().toLowerCase(),
      orgName: org.name,
      role,
      invitationId: invitation.id,
      inviteUrl: absoluteInviteUrl,
      actionUrl: relativeInviteUrl,
    }).catch((err) => console.error('[NOTIFICATION] Failed to dispatch ORG_INVITATION in server:', err));

    let emailStatus: 'sent' | 'failed' | 'not_configured' = 'not_configured';
    let emailError: string | null = null;

    // Check if platform Gmail sender is connected
    try {
      const mailSettings = await getGoogleMailSettings();
      if (mailSettings && mailSettings.enabled && mailSettings.refresh_token_encrypted && mailSettings.status !== 'disconnected') {
        const template = generateInvitationEmailTemplate({
          organizationName: org.name,
          inviteUrl: absoluteInviteUrl,
          role,
          inviterName: user.name || user.email,
        });

        await sendEmailViaGmail({
          to: invitation.email,
          subject: template.subject,
          html: template.html,
          text: template.text,
          fromName: 'EventGameStudio',
        });

        emailStatus = 'sent';
        await updateInvitationEmailStatus(invitation.id, 'sent', null);
        console.log(`[Invitations] Invitation email successfully sent to ${invitation.email} via Gmail API.`);
      } else {
        console.log(`[Invitations] Gmail sending is not connected. Invitation record created without sending email.`);
        emailStatus = 'not_configured';
      }
    } catch (emailErr: any) {
      console.error(`[Invitations] Failed to send invitation email to ${invitation.email} via Gmail API:`, emailErr);
      emailStatus = 'failed';
      emailError = isOperationalError(emailErr) ? (emailErr.message || 'Failed to deliver invitation email') : 'Failed to deliver invitation email via Gmail API';
      await updateInvitationEmailStatus(invitation.id, 'failed', emailError);
    }

    res.json({
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
    });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * POST /api/organizations/:organizationId/invitations/:invitationId/resend
 * Re-trigger invitation email with a fresh/renewed token
 */
app.post('/api/organizations/:organizationId/invitations/:invitationId/resend', authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { organizationId, invitationId } = req.params;

    const { isMember, role: myRole } = await verifyOrgMembershipAndPermission(
      user.id,
      organizationId,
      'organization.members.invite'
    );

    if (!isMember || !['owner', 'admin'].includes(myRole || '')) {
      res.status(403).json({ error: 'Only owners and admins can manage invitations' });
      return;
    }

    const org = await getOrganizationById(organizationId);
    if (!org) {
      res.status(404).json({ error: 'Organization not found' });
      return;
    }

    const invitation = await getInvitationById(invitationId);
    if (!invitation || invitation.organization_id !== organizationId) {
      res.status(404).json({ error: 'Invitation not found' });
      return;
    }

    if (invitation.accepted_at) {
      res.status(400).json({ error: 'This invitation has already been accepted' });
      return;
    }

    // Generate fresh token and extend expiration by 7 days
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const frontendBaseUrl = getFrontendBaseUrl(process.env, req);
    const absoluteInviteUrl = `${frontendBaseUrl}/accept-invite?token=${rawToken}`;
    const relativeInviteUrl = `/accept-invite?token=${rawToken}`;

    let emailStatus: 'sent' | 'failed' | 'not_configured' = 'not_configured';
    let emailError: string | null = null;

    // Check if platform Gmail sender is connected
    try {
      const mailSettings = await getGoogleMailSettings();
      if (mailSettings && mailSettings.enabled && mailSettings.refresh_token_encrypted && mailSettings.status !== 'disconnected') {
        const template = generateInvitationEmailTemplate({
          organizationName: org.name,
          inviteUrl: absoluteInviteUrl,
          role: invitation.role,
          inviterName: user.name || user.email,
        });

        await sendEmailViaGmail({
          to: invitation.email,
          subject: template.subject,
          html: template.html,
          text: template.text,
          fromName: 'EventGameStudio',
        });

        emailStatus = 'sent';
      } else {
        emailStatus = 'not_configured';
      }
    } catch (emailErr: any) {
      console.error(`[Invitations] Failed to resend invitation email to ${invitation.email}:`, emailErr);
      emailStatus = 'failed';
      emailError = isOperationalError(emailErr) ? (emailErr.message || 'Failed to deliver invitation email') : 'Failed to deliver invitation email via Gmail API';
    }

    const updatedInvitation = await renewInvitation(invitation.id, {
      token_hash: tokenHash,
      expires_at: expiresAt,
      email_status: emailStatus === 'not_configured' ? 'pending' : emailStatus,
      email_sent_at: emailStatus === 'sent' ? now.toISOString() : null,
      email_error: emailError,
    });

    res.json({
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
    });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * DELETE /api/organizations/:organizationId/invitations/:invitationId
 * Revoke a pending invitation
 */
app.delete('/api/organizations/:organizationId/invitations/:invitationId', authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { organizationId, invitationId } = req.params;

    const { isMember, role: myRole } = await verifyOrgMembershipAndPermission(
      user.id,
      organizationId,
      'organization.members.remove'
    );

    if (!isMember || !['owner', 'admin'].includes(myRole || '')) {
      res.status(403).json({ error: 'Permission denied to revoke invitations' });
      return;
    }

    const invitation = await getInvitationById(invitationId);
    if (!invitation || invitation.organization_id !== organizationId) {
      res.status(404).json({ error: 'Invitation not found' });
      return;
    }

    await deleteInvitation(invitationId);
    res.json({ success: true, message: 'Invitation revoked successfully' });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * DELETE /api/organizations/:organizationId/members/:memberId
 * Remove staff member
 */
app.delete('/api/organizations/:organizationId/members/:memberId', authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { organizationId, memberId } = req.params;

    const { isMember, role: myRole } = await verifyOrgMembershipAndPermission(
      user.id,
      organizationId,
      'organization.members.remove'
    );

    if (!isMember || !['owner', 'admin'].includes(myRole || '')) {
      res.status(403).json({ error: 'Permission denied to remove members' });
      return;
    }

    const target = await getMemberById(memberId);
    if (!target || target.organization_id !== organizationId) {
      res.status(404).json({ error: 'Member not found in this organization' });
      return;
    }

    if (target.role === 'owner') {
      res.status(403).json({ error: 'Cannot remove organization owner' });
      return;
    }

    if (myRole === 'admin' && target.role === 'admin') {
      res.status(403).json({ error: 'Admins cannot remove other admins' });
      return;
    }

    await removeMember(memberId);
    res.json({ success: true });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * PATCH /api/organizations/:organizationId/members/:memberId
 * Update organization member role
 */
app.patch('/api/organizations/:organizationId/members/:memberId', authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { organizationId, memberId } = req.params;

    const { isMember, role: myRole } = await verifyOrgMembershipAndPermission(
      user.id,
      organizationId,
      'organization.members.manage'
    );

    if (!isMember || !['owner', 'admin'].includes(myRole || '')) {
      res.status(403).json({ error: 'Permission denied to update member roles' });
      return;
    }

    const target = await getMemberById(memberId);
    if (!target || target.organization_id !== organizationId) {
      res.status(404).json({ error: 'Member not found in this organization' });
      return;
    }

    if (target.role === 'owner') {
      res.status(403).json({ error: 'Cannot alter the role of the organization owner' });
      return;
    }

    if (myRole === 'admin' && target.role === 'admin') {
      res.status(403).json({ error: 'Admins cannot alter the role of other admins' });
      return;
    }

    const body = req.body || {};
    const newRole = body.role;

    const allowedRoles: OrgRole[] = ['admin', 'designer', 'viewer'];
    if (!newRole || !allowedRoles.includes(newRole)) {
      res.status(422).json({ error: `Invalid member role. Allowed roles: ${allowedRoles.join(', ')}` });
      return;
    }

    if (newRole === 'owner') {
      res.status(403).json({ error: 'Direct promotion to owner is strictly prohibited' });
      return;
    }

    // Admins cannot promote another user to admin (only owner can)
    if (myRole === 'admin' && newRole === 'admin') {
      res.status(403).json({ error: 'Only organization owners can grant admin role' });
      return;
    }

    const updated = await updateMemberRole(organizationId, target.user_id, newRole);
    res.json({ member: updated, message: 'Member role updated successfully' });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

// ----------------------------------------------------
// INVITATIONS VERIFICATION & ACCEPTANCE
// ----------------------------------------------------

/**
 * GET /api/invitations/verify
 * Public endpoint to inspect invitation details
 */
app.get('/api/invitations/verify', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token || typeof token !== 'string') {
      res.status(422).json({ error: 'Token parameter is required' });
      return;
    }

    const tokenHash = hashToken(token);
    const invite = await getInvitationByTokenHash(tokenHash);

    if (!invite) {
      res.status(404).json({ error: 'Invitation not found or invalid' });
      return;
    }

    if (invite.accepted_at) {
      res.status(409).json({ error: 'This invitation has already been accepted' });
      return;
    }

    if (new Date(invite.expires_at) < new Date()) {
      res.status(410).json({ error: 'This invitation has expired' });
      return;
    }

    res.json({
      invitationId: invite.id,
      email: invite.email,
      role: invite.role,
      organizationName: invite.organization_name,
      organizationId: invite.organization_id,
    });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * POST /api/invitations/accept
 * Accept invitation with Google ID Token
 */
app.post('/api/invitations/accept', invitationRateLimiter, async (req, res) => {
  try {
    const { token, idToken } = req.body;
    if (!token || !idToken) {
      res.status(422).json({ error: 'token and idToken are required' });
      return;
    }

    const tokenHash = hashToken(token);
    const invite = await getInvitationByTokenHash(tokenHash);

    if (!invite) {
      res.status(404).json({ error: 'Invitation not found' });
      return;
    }

    if (invite.accepted_at) {
      res.status(409).json({ error: 'Invitation already accepted' });
      return;
    }

    if (new Date(invite.expires_at) < new Date()) {
      res.status(410).json({ error: 'Invitation expired' });
      return;
    }

    let googleUser;
    try {
      googleUser = await verifyGoogleIdToken(idToken);
    } catch (tokenErr: any) {
      const correlationId =
        (req.headers['x-correlation-id'] as string) ||
        (req.headers['x-request-id'] as string) ||
        crypto.randomUUID();
      console.error(`[Google Auth Error][${correlationId}] Invitation token verification failed:`, tokenErr);
      res.setHeader('x-correlation-id', correlationId);
      res.status(401).json({ error: 'Google authentication failed' });
      return;
    }

    // Verify Google email matches invitation email
    if (googleUser.email.toLowerCase() !== invite.email.toLowerCase()) {
      res.status(403).json({
        error: `Google account email (${googleUser.email}) does not match invitation email (${invite.email})`,
      });
      return;
    }

    // Upsert user into Supabase
    const user = await upsertGoogleUser(googleUser);

    // Add or update organization membership in Supabase
    const existingMember = await getMember(invite.organization_id, user.id);
    if (!existingMember) {
      await addMember({
        organization_id: invite.organization_id,
        user_id: user.id,
        role: invite.role,
      });
    } else {
      await updateMemberRole(invite.organization_id, user.id, invite.role);
    }

    // Mark invitation as accepted
    await markInvitationAccepted(invite.id);

    const org = await getOrganizationById(invite.organization_id);

    await dispatchNotificationEvent({
      eventType: 'MEMBER_JOINED',
      organizationId: invite.organization_id,
      memberUserId: user.id,
      memberName: user.name || user.email,
      orgName: org?.name || invite.organization_name || 'Organization',
      role: invite.role,
    }).catch((err) => console.error('[NOTIFICATION] Failed to dispatch MEMBER_JOINED in server:', err));

    const appToken = signAppToken(user.id, invite.organization_id, invite.role);

    res.json({
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
    });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

// ----------------------------------------------------
// FILE UPLOADS (SUPABASE STORAGE)
// ----------------------------------------------------

/**
 * POST /api/upload
 * Secure Game Asset Upload (backgrounds, baskets, items, logos, themes, branding, audio)
 * 
 * REQUIRED AUTHORIZATION & VALIDATION FLOW:
 * 1. Authenticate (authenticateJWT)
 * 2. Get organization ID (x-organization-id, jwtPayload, body, query)
 * 3. Verify membership (user ∈ organization)
 * 4. Verify permission (viewers rejected)
 * 5. Validate category (logos, backgrounds, baskets, items, themes, branding, audio, showcases, general)
 * 6. Validate file (presence, MIME type, size limit)
 * 7. Generate safe storage path
 * 8. Upload to Supabase Storage
 */
app.post('/api/upload', uploadRateLimiter, authenticateJWT, upload.single('file'), async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const isDev = isUserDeveloperAdmin(user);

    // 1. Get organization ID
    let orgId =
      (req.headers['x-organization-id'] as string) ||
      req.jwtPayload?.organizationId ||
      (req.body?.organizationId as string) ||
      (req.query?.orgId as string);

    if (!orgId || orgId === 'default') {
      if (isDev) {
        orgId = 'system';
      } else {
        res.status(422).json({
          error: 'Organization ID is required for asset uploads',
          code: 'ORG_ID_REQUIRED',
        });
        return;
      }
    }

    // 2. Verify Membership & 3. Verify Permission
    if (!isDev) {
      const { isMember, role } = await verifyOrgMembershipAndPermission(user.id, orgId);
      if (!isMember) {
        res.status(403).json({
          error: `Forbidden: You are not a member of organization "${orgId}"`,
          code: 'ORG_NOT_MEMBER',
        });
        return;
      }

      if (role === 'viewer') {
        res.status(403).json({
          error: 'Forbidden: Viewers do not have permission to upload assets in this organization',
          code: 'INSUFFICIENT_PERMISSIONS',
        });
        return;
      }
    }

    // 4. Validate Category
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
    const rawCategory = (req.body?.category as string) || 'general';
    const category = rawCategory.toLowerCase().trim();
    if (!ALLOWED_ASSET_CATEGORIES.has(category)) {
      res.status(422).json({
        error: `Invalid category "${rawCategory}". Allowed categories: ${Array.from(ALLOWED_ASSET_CATEGORIES).join(', ')}`,
        code: 'INVALID_CATEGORY',
      });
      return;
    }

    // 5. Validate File (Magic bytes inspection, strict MIME & extension consistency, SVG rejection)
    if (!req.file || !req.file.buffer || req.file.buffer.length === 0) {
      res.status(422).json({ error: 'No file uploaded', code: 'NO_FILE_UPLOADED' });
      return;
    }

    const MAX_ASSET_SIZE = 25 * 1024 * 1024; // 25MB
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

    const validation = validateUploadedFile(req.file.buffer, {
      originalName: req.file.originalname,
      declaredMime: req.file.mimetype,
      maxSizeBytes: MAX_ASSET_SIZE,
      allowedMediaTypes,
    });

    if (!validation.valid) {
      res.status(422).json({
        error: validation.error,
        code: validation.code,
      });
      return;
    }

    // 6. Generate storage path and 7. Upload
    const safeOrgId = orgId.replace(/[^a-zA-Z0-9_-]/g, '') || 'default';
    const safeCategory = category.replace(/[^a-zA-Z0-9_-]/g, '') || 'general';
    const safeExt = validation.extension || '.png';

    try {
      // Attempt Supabase Storage upload
      const result = await uploadGameAsset({
        organizationId: safeOrgId,
        category: safeCategory as any,
        fileBuffer: req.file.buffer,
        originalName: req.file.originalname,
        mimeType: validation.mimeType,
      });

      res.json({ url: result.url, path: result.path });
    } catch (storageErr: any) {
      console.warn('Supabase storage upload fallback:', storageErr.message);

      // Fallback to local disk storage if Supabase credentials are not yet configured in dev
      const filename = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${safeExt}`;
      const localFilePath = path.join(uploadDir, filename);
      fs.writeFileSync(localFilePath, req.file.buffer);

      const fileUrl = `/uploads/${filename}`;
      res.json({ url: fileUrl, path: `organizations/${safeOrgId}/${safeCategory}/${filename}` });
    }
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

// ----------------------------------------------------
// THEMES API ENDPOINTS (SINGLE SOURCE OF TRUTH)
// ----------------------------------------------------

/**
 * GET /api/themes
 * List all themes for active organization (optionally filtered by ?gameId=...)
 */
app.get('/api/themes', authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const organizationId = req.jwtPayload?.organizationId;
    const gameId = req.query.gameId as string | undefined;

    if (!organizationId) {
      res.status(422).json({ error: 'No active organization selected' });
      return;
    }

    const { isMember } = await verifyOrgMembershipAndPermission(user.id, organizationId, 'game.view');
    if (!isMember) {
      res.status(403).json({ error: 'Forbidden: You are not a member of this organization' });
      return;
    }

    const themes = await getThemesByOrgId(organizationId, gameId);

    res.json({ themes });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * GET /api/theme-readiness
 * Evaluates whether the active organization has at least one valid, saved theme.
 * Used for route guards, UI banners, and event creation validation.
 */
app.get('/api/theme-readiness', authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const organizationId = req.jwtPayload?.organizationId;

    if (!organizationId) {
      res.status(422).json({ error: 'No active organization selected' });
      return;
    }

    const { isMember } = await verifyOrgMembershipAndPermission(user.id, organizationId, 'game.view');
    if (!isMember) {
      res.status(403).json({ error: 'Forbidden: You are not a member of this organization' });
      return;
    }

    const readiness = await checkOrganizationThemeReadiness(organizationId);
    res.json(readiness);
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * POST /api/themes/onboarding-theme
 * Resolves or initializes the onboarding theme for first-time mandatory theme setup.
 */
app.post('/api/themes/onboarding-theme', authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const organizationId = req.jwtPayload?.organizationId;

    if (!organizationId) {
      res.status(422).json({ error: 'No active organization selected' });
      return;
    }

    const { isMember, role } = await verifyOrgMembershipAndPermission(user.id, organizationId, 'game.items.edit');
    if (!isMember || role === 'viewer') {
      res.status(403).json({ error: 'Forbidden: Insufficient permissions to set up themes' });
      return;
    }

    const result = await getOrCreateOnboardingTheme(organizationId);
    res.json(result);
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * GET /api/themes/system
 * List system default theme templates available for any organization to clone
 * or resolve primary default system theme for a game.
 */
app.get('/api/themes/system', authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const gameId = req.query.gameId as string | undefined;
    const status = (req.query.status as string) || 'active';
    console.log(`[Theme API] GET /api/themes/system requested (gameId: ${gameId || 'all'}, status: ${status})`);

    let themes: any[] = [];
    if (gameId) {
      themes = await getSystemThemesByGameId(gameId, { status: status as any });
    } else {
      themes = await getAllSystemThemes();
    }

    const primaryDefaultTheme = themes.find((t) => t.is_default) || themes[0] || null;
    console.log(
      `[Theme API] GET /api/themes/system resolved ${themes.length} system themes (primary/default: ${
        primaryDefaultTheme ? `"${primaryDefaultTheme.name}" (${primaryDefaultTheme.id})` : 'none'
      })`
    );

    res.json({ themes, theme: primaryDefaultTheme });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * POST /api/themes/clone-system/:systemThemeId
 * Clone a developer system default theme into current organization
 */
app.post('/api/themes/clone-system/:systemThemeId', authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const organizationId = req.jwtPayload?.organizationId;
    const { systemThemeId } = req.params;
    const { name, game_id } = req.body;

    if (!systemThemeId || !isUUID(systemThemeId)) {
      res.status(400).json({ error: `Invalid system theme ID format: ${systemThemeId}` });
      return;
    }

    if (!organizationId) {
      res.status(422).json({ error: 'No active organization selected' });
      return;
    }

    const { isMember, role } = await verifyOrgMembershipAndPermission(user.id, organizationId, 'game.items.edit');
    if (!isMember || role === 'viewer') {
      res.status(403).json({ error: 'Permission denied: Cannot create themes' });
      return;
    }

    const cloned = await cloneSystemThemeToOrg(systemThemeId, organizationId, game_id, name);
    res.status(201).json({ theme: cloned });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * POST /api/themes/clone-all-system
 * Clone ALL active developer system default themes for the given game into current organization
 */
app.post('/api/themes/clone-all-system', authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const organizationId = req.jwtPayload?.organizationId;
    const { game_id } = req.body;

    if (!organizationId) {
      res.status(422).json({ error: 'No active organization selected' });
      return;
    }

    if (!game_id) {
      res.status(422).json({ error: 'Game ID is required' });
      return;
    }

    const { isMember, role } = await verifyOrgMembershipAndPermission(user.id, organizationId, 'game.items.edit');
    if (!isMember || role === 'viewer') {
      res.status(403).json({ error: 'Permission denied: Cannot create themes' });
      return;
    }

    const cloned = await cloneAllSystemThemesToOrg(organizationId, game_id);
    res.status(201).json({ themes: cloned });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * GET /api/themes/:themeId
 * Get single theme details (supports both UUID and special 'system' identifier)
 */
app.get('/api/themes/:themeId', authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { themeId } = req.params;
    const gameId = req.query.gameId as string | undefined;

    // Handle special 'system' identifier
    if (themeId === 'system') {
      console.log(`[Theme API] Resolving theme with special identifier "system" (gameId: ${gameId || 'all'})`);
      let systemThemes: any[] = [];
      if (gameId) {
        systemThemes = await getSystemThemesByGameId(gameId, { status: 'active' });
      } else {
        systemThemes = await getAllSystemThemes();
      }

      const primaryTheme = systemThemes.find((t) => t.is_default) || systemThemes[0] || null;
      if (!primaryTheme) {
        console.log(`[Theme API] No system theme found for gameId: ${gameId || 'all'}`);
        res.status(404).json({ error: 'No system theme found for this game', themes: [] });
        return;
      }

      console.log(
        `[Theme API] Resolved system theme: "${primaryTheme.name}" (${primaryTheme.id}, is_default: ${Boolean(
          primaryTheme.is_default
        )})`
      );
      res.json({ theme: primaryTheme, themes: systemThemes });
      return;
    }

    // Validate UUID format for normal theme lookup
    if (!isUUID(themeId)) {
      console.log(`[Theme API] Invalid UUID format requested: "${themeId}". Returning 404.`);
      res.status(404).json({ error: `Invalid theme ID format: ${themeId}` });
      return;
    }

    console.log(`[Theme API] Resolving game theme by UUID: ${themeId}`);
    const theme = await getThemeById(themeId);
    if (!theme) {
      console.log(`[Theme API] Theme with UUID ${themeId} not found`);
      res.status(404).json({ error: 'Theme not found' });
      return;
    }

    // Verify access permission if it belongs to an organization
    const isSystemTheme = Boolean(theme.is_system) || !theme.organization_id;
    if (!isSystemTheme && theme.organization_id) {
      const { isMember } = await verifyOrgMembershipAndPermission(user.id, theme.organization_id, 'game.view');
      if (!isMember) {
        res.status(403).json({ error: 'Access denied to this theme' });
        return;
      }
    }

    console.log(`[Theme API] Successfully resolved theme "${theme.name}" (id: ${theme.id}, is_system: ${isSystemTheme})`);
    res.json({ theme });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * POST /api/themes
 * Create new theme for organization and specific game
 */
app.post('/api/themes', authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const organizationId = req.jwtPayload?.organizationId;

    if (!organizationId) {
      res.status(422).json({ error: 'No active organization selected' });
      return;
    }

    const { isMember, role } = await verifyOrgMembershipAndPermission(user.id, organizationId, 'game.items.edit');
    if (!isMember || role === 'viewer') {
      res.status(403).json({ error: 'Permission denied: Cannot create themes' });
      return;
    }

    if (req.body.is_system && !isUserDeveloperAdmin(user)) {
      res.status(403).json({ error: 'Only developer admins can create system themes' });
      return;
    }

    const {
      name,
      slug,
      game_id,
      game_slug,
      game_type,
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
    } = req.body;

    if (!name || typeof name !== 'string') {
      res.status(422).json({ error: 'Theme name is required' });
      return;
    }

    const theme = await createTheme({
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
    });

    res.status(201).json({ ...theme, theme });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * PUT /api/themes/:themeId
 * Save entire theme configuration in one atomic update
 */
app.put('/api/themes/:themeId', authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { themeId } = req.params;

    if (!isUUID(themeId)) {
      res.status(400).json({ error: `Invalid theme ID format: ${themeId}` });
      return;
    }

    const theme = await getThemeById(themeId);
    if (!theme) {
      res.status(404).json({ error: 'Theme not found' });
      return;
    }

    if (theme.is_system || !theme.organization_id) {
      res.status(403).json({ error: 'System themes are read-only templates and cannot be edited directly. Clone this theme into your organization to make edits.' });
      return;
    }

    const { isMember, role } = await verifyOrgMembershipAndPermission(user.id, theme.organization_id, 'game.items.edit');
    if (!isMember || role === 'viewer') {
      res.status(403).json({ error: 'Permission denied: Cannot update themes' });
      return;
    }

    if (req.body.game_id !== undefined && req.body.game_id !== theme.game_id) {
      res.status(400).json({ error: 'Theme game association is immutable and cannot be modified' });
      return;
    }
    if (req.body.is_system !== undefined && req.body.is_system !== theme.is_system) {
      res.status(400).json({ error: 'Theme is_system status cannot be modified' });
      return;
    }
    if (req.body.organization_id !== undefined && req.body.organization_id !== theme.organization_id) {
      res.status(400).json({ error: 'Theme organization_id cannot be modified' });
      return;
    }
    if (req.body.ownership_type !== undefined && req.body.ownership_type !== (theme.ownership_type || 'organization')) {
      res.status(400).json({ error: 'Theme ownership_type cannot be modified' });
      return;
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
    } = req.body;

    const mergedGameConfig = {
      ...(theme.game_config || {}),
      ...(game_config || {}),
      is_onboarding_draft: false,
      theme_setup_completed: true,
      theme_setup_completed_at: new Date().toISOString(),
    };

    const resolvedStatus = status && status !== 'draft' ? status : 'active';

    const updatedTheme = await updateTheme(themeId, {
      name,
      slug,
      description,
      status: resolvedStatus,
      styling: styling !== undefined ? styling : visuals_config,
      branding,
      background_url,
      basket_config,
      items_config,
      physics_config,
      visuals_config,
      sounds_config,
      layout,
      game_config: mergedGameConfig,
    });

    res.json({ ...updatedTheme, theme: updatedTheme });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * POST /api/themes/:themeId/duplicate
 * Duplicate existing theme
 */
app.post('/api/themes/:themeId/duplicate', authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { themeId } = req.params;
    const { name } = req.body;

    if (!isUUID(themeId)) {
      res.status(400).json({ error: `Invalid theme ID format: ${themeId}` });
      return;
    }

    const theme = await getThemeById(themeId);
    if (!theme) {
      res.status(404).json({ error: 'Theme not found' });
      return;
    }

    const { isMember, role } = await verifyOrgMembershipAndPermission(user.id, theme.organization_id, 'game.items.edit');
    if (!isMember || role === 'viewer') {
      res.status(403).json({ error: 'Permission denied: Cannot duplicate themes' });
      return;
    }

    const duplicated = await duplicateTheme(themeId, name);
    res.status(201).json({ theme: duplicated });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * DELETE /api/themes/:themeId
 * Delete a theme
 */
app.delete('/api/themes/:themeId', authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { themeId } = req.params;

    if (!isUUID(themeId)) {
      res.status(400).json({ error: `Invalid theme ID format: ${themeId}` });
      return;
    }

    const theme = await getThemeById(themeId);
    if (!theme) {
      res.status(404).json({ error: 'Theme not found' });
      return;
    }

    if (theme.is_system || !theme.organization_id) {
      res.status(403).json({ error: 'System themes are read-only templates and cannot be deleted.' });
      return;
    }

    const { isMember, role } = await verifyOrgMembershipAndPermission(user.id, theme.organization_id, 'game.items.edit');
    if (!isMember || !['owner', 'admin'].includes(role || '')) {
      res.status(403).json({ error: 'Permission denied: Only owners and admins can delete themes' });
      return;
    }

    await deleteTheme(themeId);
    res.json({ success: true });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

// ----------------------------------------------------
// GAMES & CUSTOMIZATION API ENDPOINTS
// ----------------------------------------------------

/**
 * GET /api/games
 * Get games catalog for active organization from Supabase (Developer/Admin registered games)
 */
app.get('/api/games', authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const organizationId = req.jwtPayload?.organizationId;

    if (!organizationId) {
      res.status(422).json({ error: 'No active organization selected' });
      return;
    }

    const { isMember } = await verifyOrgMembershipAndPermission(user.id, organizationId, 'game.view');
    if (!isMember) {
      res.status(403).json({ error: 'Forbidden: You are not a member of this organization' });
      return;
    }

    const games = await getAvailableGamesForStudio(organizationId);

    res.json({ games });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * GET /api/games/:gameId
 * Get game details from Supabase
 */
app.get('/api/games/:gameId', authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { gameId } = req.params;

    const game = await getGameById(gameId);
    if (!game) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }

    const { isMember } = await verifyOrgMembershipAndPermission(user.id, game.organization_id, 'game.view');
    if (!isMember) {
      res.status(403).json({ error: 'Access denied to this game' });
      return;
    }

    res.json({ game });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * GET /api/games/:gameId/themes
 * Get all themes scoped to a specific game
 */
app.get('/api/games/:gameId/themes', authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { gameId } = req.params;

    const game = await getGameById(gameId);
    if (!game) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }

    const { isMember } = await verifyOrgMembershipAndPermission(user.id, game.organization_id, 'game.view');
    if (!isMember) {
      res.status(403).json({ error: 'Access denied to this game' });
      return;
    }

    const themes = await getThemesByOrgId(game.organization_id, gameId);
    res.json({ themes });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * PUT /api/games/:gameId/customization
 * Update game customization in Supabase
 */
app.put('/api/games/:gameId/customization', authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { gameId } = req.params;
    const organizationId = req.jwtPayload?.organizationId;
    const body = req.body || {};

    if (
      body.organization_id !== undefined ||
      body.game_type !== undefined ||
      body.slug !== undefined ||
      body.is_system !== undefined
    ) {
      res.status(400).json({ error: 'Cannot alter structural columns (organization_id, game_type, slug, is_system) on games' });
      return;
    }

    const { background_url, basket_config, items_config, settings_config, name } = body;
    const resolvedSettingsConfig = settings_config !== undefined ? settings_config : body.settings;

    const game = await getGameById(gameId);
    if (!game) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }

    const targetOrgId = game.organization_id || organizationId;
    if (!targetOrgId && !isUserDeveloperAdmin(user)) {
      res.status(422).json({ error: 'No active organization context found' });
      return;
    }

    if (game.organization_id && game.organization_id !== organizationId && !isUserDeveloperAdmin(user)) {
      res.status(403).json({ error: 'Access denied: Game belongs to another organization' });
      return;
    }

    let requiredPerm = 'game.view';
    if (background_url !== undefined) requiredPerm = 'game.background.edit';
    else if (items_config !== undefined) requiredPerm = 'game.items.edit';
    else if (basket_config !== undefined) requiredPerm = 'game.basket.edit';
    else if (resolvedSettingsConfig !== undefined) requiredPerm = 'game.settings.edit';

    if (targetOrgId) {
      const { isMember, role, hasPermission } = await verifyOrgMembershipAndPermission(user.id, targetOrgId, requiredPerm);
      if (!isMember) {
        res.status(403).json({ error: 'Access denied: Not an organization member' });
        return;
      }

      if (!hasPermission || role === 'viewer') {
        res.status(403).json({ error: 'Permission denied: Insufficient permissions to modify game customization' });
        return;
      }
    }

    const updatedGame = await updateGameCustomization(gameId, {
      background_url,
      basket_config,
      items_config,
      settings_config: resolvedSettingsConfig,
      name,
    });

    res.json({ ...updatedGame, game: updatedGame });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

// ----------------------------------------------------
// EVENTS & PUBLIC DEPLOYMENT ENDPOINTS
// ----------------------------------------------------

/**
 * GET /api/events & GET /api/organizations/:organizationId/events
 * List all events for the active organization
 */
app.get(['/api/events', '/api/organizations/:organizationId/events', '/api/organizations/:orgId/events'], authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const rawOrgId = req.params.organizationId || req.params.orgId || req.jwtPayload?.organizationId;
    const organizationId =
      rawOrgId && rawOrgId !== 'undefined' && rawOrgId !== 'null' && rawOrgId.trim() !== ''
        ? rawOrgId.trim()
        : undefined;

    if (!organizationId || !isUUID(organizationId)) {
      res.json({ events: [] });
      return;
    }

    const { isMember, hasPermission } = await verifyOrgMembershipAndPermission(user.id, organizationId, 'event.view');
    if (!isMember || !hasPermission) {
      res.status(403).json({ error: 'Forbidden: You do not have permission to view events' });
      return;
    }

    const events = await getEventsByOrgId(organizationId);
    res.json({ events });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * GET /api/events/:eventId
 * Get details for a specific event
 */
app.get('/api/events/:eventId', authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { eventId } = req.params;

    const event = await getEventById(eventId);
    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    const { isMember, hasPermission } = await verifyOrgMembershipAndPermission(user.id, event.organization_id, 'event.view');
    if (!isMember || !hasPermission) {
      res.status(403).json({ error: 'Forbidden: Access denied to this event' });
      return;
    }

    res.json({ event });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * POST /api/events/quote
 * Calculate real-time pricing, credit eligibility and wallet deductions for creating an event
 */
app.post('/api/events/quote', eventRateLimiter, authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const organizationId = req.jwtPayload?.organizationId;

    if (!organizationId) {
      res.status(422).json({ error: 'No active organization selected' });
      return;
    }

    const { isMember, hasPermission } = await verifyOrgMembershipAndPermission(user.id, organizationId, 'event.view');
    if (!isMember || !hasPermission) {
      res.status(403).json({ error: 'Permission denied: Not a member of this organization' });
      return;
    }

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
    } = req.body;

    let price = typeof event_price === 'number' && event_price > 0 ? event_price : undefined;
    let currency = 'MYR';
    let durationDays = 1;
    let ruleLabel = '1 day';

    if (!price && event_id) {
      const existing = await getEventById(event_id);
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
        });
        price = pricing.price;
        currency = pricing.currency;
        durationDays = pricing.durationDays;
        ruleLabel = pricing.ruleLabel;
      } catch (e: any) {
        handleApiError(e, req, res);
        return;
      }
    }

    let themeInfo: any = null;
    if (game_theme_id) {
      const theme = await getThemeById(game_theme_id);
      if (theme) {
        themeInfo = {
          id: theme.id,
          name: theme.name,
          game_id: theme.game_id,
        };
      }
    }

    const walletSummary = await getWalletBalance(organizationId);
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
      }
    );

    // Calculate options for all payment modes
    const fullPaidCalc = await calculateEventPayment(price, 'FULL_PAID', organizationId);
    const welcomeCalc = await calculateEventPayment(price, 'WELCOME_CREDIT', organizationId);
    const showcaseCalc = await calculateEventPayment(price, 'SHOWCASE_CREDIT', organizationId);
    const topupCalc = await calculateEventPayment(price, 'TOPUP_CREDIT', organizationId, { topupCreditRequested: topup_credit_requested });

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

    res.json({
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
    });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * POST /api/events
 * Create a new event in PENDING_PAYMENT status without requiring immediate payment.
 * Enforces:
 * 1. Server-side rate limit (max 3 creation attempts per 10 minutes per organization)
 * 2. Hard limit of max 2 PENDING_PAYMENT events per organization.
 */
app.post('/api/events', eventCreationRateLimiter, authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const organizationId = req.jwtPayload?.organizationId;

    if (!organizationId) {
      res.status(422).json({ error: 'No active organization selected' });
      return;
    }

    const { isMember, hasPermission } = await verifyOrgMembershipAndPermission(user.id, organizationId, 'event.create');
    if (!isMember || !hasPermission) {
      res.status(403).json({ error: 'Permission denied: Only owners and admins can create events' });
      return;
    }

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
    } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      res.status(422).json({ error: 'Event name is required' });
      return;
    }

    if (!game_theme_id) {
      res.status(422).json({ error: 'Game Theme selection is required' });
      return;
    }

    const resolvedStart = start_date || startDate || event_date || (starts_at ? starts_at.slice(0, 10) : null);
    const resolvedEnd = end_date || endDate || (expires_at ? expires_at.slice(0, 10) : resolvedStart);

    if (!resolvedStart || !resolvedEnd) {
      res.status(422).json({ error: 'Start date and End date are required' });
      return;
    }

    // Security check: Reject any client attempt to set initial event status to PAID or LIVE, or inject sensitive fields
    if (
      (req.body.payment_status && String(req.body.payment_status).toUpperCase() !== 'UNPAID') ||
      (req.body.event_status && String(req.body.event_status).toUpperCase() !== 'DRAFT') ||
      (req.body.status && !['draft', 'pending_payment'].includes(String(req.body.status).toLowerCase())) ||
      req.body.paid_amount !== undefined ||
      req.body.discount_amount !== undefined ||
      req.body.payment_mode !== undefined ||
      req.body.cancel_reason !== undefined
    ) {
      res.status(400).json({
        error: 'Direct initialization of event payment, paid amounts, or live lifecycle status is strictly prohibited.',
      });
      return;
    }

    // Create event with DRAFT event_status and UNPAID payment_status (no wallet balance deducted)
    const created = await createEvent({
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
    });

    const enriched = await getEventById(created.id);

    res.status(201).json({
      success: true,
      event: enriched || created,
    });
  } catch (err: any) {
    console.error('Create event error:', err);
    if (
      err.code === 'PENDING_EVENT_LIMIT_REACHED' ||
      String(err.message || '').includes('PENDING_EVENT_LIMIT_REACHED') ||
      String(err.message || '').includes('Maximum 2 pending payment events reached')
    ) {
      res.status(422).json({
        code: 'PENDING_EVENT_LIMIT_REACHED',
        error: 'Maximum 2 pending payment events reached. Please pay for or delete an existing pending event.',
      });
      return;
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
      err.code === 'VALIDATION_ERROR'
    ) {
      const status =
        err.status ||
        (err.code === 'THEME_NOT_FOUND' || err.code === 'GAME_NOT_FOUND' || err.code === 'ORGANIZATION_NOT_FOUND' ? 404 :
         err.code === 'THEME_FORBIDDEN' ? 403 : 422);
      res.status(status).json({
        code: err.code,
        error: err.message || 'Validation error',
        ...(err.theme_setup_required ? { theme_setup_required: true } : {}),
      });
      return;
    }
    handleApiError(err, req, res, {
      endpoint: '/api/events',
      method: 'POST',
      userId: req.user?.id,
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
});

/**
 * POST /api/events/:eventId/pay
 * Pay and activate a PENDING_PAYMENT event.
 */
app.post('/api/events/:eventId/pay', walletRateLimiter, authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { eventId } = req.params;
    const event = await getEventById(eventId);
    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    const { isMember, hasPermission } = await verifyOrgMembershipAndPermission(user.id, event.organization_id, 'event.pay');
    if (!isMember || !hasPermission) {
      res.status(403).json({ error: 'Permission denied: Only owners and admins can pay for events' });
      return;
    }

    const {
      payment_mode = 'FULL_PAID',
      topup_credit_requested,
      use_welcome_credit,
      use_event_credit,
      welcome_credit_requested,
      event_price,
      reference_id,
    } = req.body;

    const result = await processEventPayment({
      organizationId: event.organization_id,
      eventId: event.id,
      paymentMode: payment_mode,
      useWelcomeCredit: use_welcome_credit,
      useEventCredit: use_event_credit,
      welcomeCreditRequested: welcome_credit_requested,
      topupCreditRequested: topup_credit_requested,
      eventPrice: event_price || event.event_price,
      referenceId: reference_id,
    });

    const updatedEvent = await getEventById(event.id);

    res.status(200).json({
      success: true,
      event: updatedEvent,
      payment: result,
    });
  } catch (err: any) {
    console.error('Pay event error:', err);
    if (err.code === 'INSUFFICIENT_BALANCE' || (isOperationalError(err) && err.message && err.message.toLowerCase().includes('insufficient'))) {
      res.status(402).json({
        code: 'INSUFFICIENT_BALANCE',
        error: isOperationalError(err) ? (err.message || 'Insufficient balance') : 'Insufficient balance',
        required: err.required,
        available: err.available,
        shortfall: err.shortfall,
      });
      return;
    }
    handleApiError(err, req, res);
  }
});

/**
 * PUT & PATCH /api/events/:eventId
 * Update event parameters (supports live theme correction)
 */
app.all('/api/events/:eventId', authenticateJWT, async (req: AuthenticatedRequest, res) => {
  if (req.method !== 'PUT' && req.method !== 'PATCH') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const user = req.user!;
    const { eventId } = req.params;

    const event = await getEventById(eventId);
    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    const { isMember, hasPermission } = await verifyOrgMembershipAndPermission(user.id, event.organization_id, 'event.edit');
    if (!isMember || !hasPermission) {
      res.status(403).json({ error: 'Permission denied: Only owners and admins can edit event configuration' });
      return;
    }

    // Security Rule: Paid event = admin/user cannot manually edit event setup.
    const isPaid = (event.payment_status || '').toUpperCase() === 'PAID';
    if (isPaid) {
      res.status(403).json({
        error: 'Event setup cannot be modified after payment has been completed.',
        code: 'EVENT_LOCKED_AFTER_PAYMENT',
      });
      return;
    }

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
      if (req.body[field] !== undefined) {
        res.status(400).json({
          error: `Modifying protected field '${field}' is strictly prohibited. Event payment, pricing, and lifecycle statuses can only be modified through authoritative payment and lifecycle workflows.`,
        });
        return;
      }
    }

    if (req.body.status !== undefined && req.body.status !== 'draft' && req.body.status !== 'scheduled') {
      res.status(400).json({
        error: `Modifying protected field 'status' to '${req.body.status}' is strictly prohibited. Event payment, pricing, and lifecycle statuses can only be modified through authoritative payment and lifecycle workflows.`,
      });
      return;
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
    } = req.body;

    const updated = await updateEvent(eventId, {
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
    });

    const enriched = await getEventById(updated.id);
    res.json({ event: enriched });
  } catch (err: any) {
    console.error('Update event error:', err);
    handleApiError(err, req, res);
  }
});

/**
 * DELETE /api/events/:eventId
 * Delete an event
 */
app.delete('/api/events/:eventId', authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { eventId } = req.params;

    const event = await getEventById(eventId);
    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    const { isMember, hasPermission } = await verifyOrgMembershipAndPermission(user.id, event.organization_id, 'event.manage');
    if (!isMember || !hasPermission) {
      res.status(403).json({ error: 'Permission denied: Only owners and admins can delete events' });
      return;
    }

    await deleteEvent(eventId);
    res.json({ success: true });
  } catch (err: any) {
    console.error('Delete event error:', err);
    handleApiError(err, req, res);
  }
});

/**
 * GET /api/events/:eventId/cancellation-eligibility
 * Check if event can be cancelled and calculate any eligible refund
 */
app.get('/api/events/:eventId/cancellation-eligibility', authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { eventId } = req.params;

    const event = await getEventById(eventId);
    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    const { isMember, hasPermission } = await verifyOrgMembershipAndPermission(user.id, event.organization_id, 'event.view');
    if (!isMember || !hasPermission) {
      res.status(403).json({ error: 'Permission denied' });
      return;
    }

    const eligibility = canCancelEvent(event);
    const refund = determineEventRefund(event);
    res.json({ eligibility, refund });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * POST /api/events/:eventId/cancel
 * Cancel an active or scheduled event enforcing Setup Day cancellation rules & ledger refunds
 */
app.post('/api/events/:eventId/cancel', eventRateLimiter, authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { eventId } = req.params;

    const event = await getEventById(eventId);
    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    const { isMember, hasPermission } = await verifyOrgMembershipAndPermission(user.id, event.organization_id, 'event.cancel');
    if (!isMember || !hasPermission) {
      res.status(403).json({ error: 'Permission denied: Only owners and admins can cancel events' });
      return;
    }

    const eligibility = canCancelEvent(event);
    if (!eligibility.canCancel) {
      res.status(422).json({
        error: eligibility.reason,
        code: eligibility.code,
        eligibility,
      });
      return;
    }

    const cancelled = await cancelEvent(eventId, {
      cancelledBy: user.id,
      cancelReason: req.body?.cancel_reason || req.body?.cancelReason || 'USER_CANCELLED',
      reason: req.body?.reason || 'User cancelled event before Setup Day',
    });

    const enriched = await getEventById(cancelled.id);
    res.json({
      success: true,
      event: enriched,
      eligibility: cancelled.eligibility,
      refundResult: cancelled.refundResult,
    });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * GET /api/events/:eventId/preview
 * Authenticated preview endpoint for organization members & designers to test play and configure.
 * STRICTLY ENFORCES: Preview is ONLY available BEFORE the Live URL window starts (current_date < event_start_date - 1 calendar day).
 */
app.get('/api/events/:eventId/preview', authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const user = req.user!;
    const { eventId } = req.params;

    const event = await getEventById(eventId);
    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    const { isMember, hasPermission } = await verifyOrgMembershipAndPermission(user.id, event.organization_id, 'event.view');
    if (!isMember || !hasPermission) {
      res.status(403).json({ error: 'Forbidden: Access denied to this event preview' });
      return;
    }

    if (isEventExplicitlyCancelled(event)) {
      res.status(403).json({
        error: 'This event has been cancelled.',
        code: 'EVENT_CANCELLED',
        is_cancelled: true,
        cancel_reason: event.cancel_reason,
      });
      return;
    }

    // Check preview accessibility (Available for Scheduled, Pending Payment, Live, and Concluded events)
    const isPreviewAllowed = canAccessPreviewEvent(event);
    if (!isPreviewAllowed) {
      res.status(403).json({
        error: 'Event preview is not available.',
        code: 'PREVIEW_UNAVAILABLE',
        is_preview_available: false,
      });
      return;
    }

    res.json({
      event: {
        ...event,
        is_preview: true,
      },
    });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * GET /api/public/events/:publicToken
 * Public unauthenticated endpoint for event players.
 * STRICTLY ENFORCES DATE-ONLY BUSINESS RULE:
 * LIVE URL AVAILABLE =
 *   payment_status === "PAID"
 *   AND current_date >= event_start_date - 1 calendar day
 *   AND current_date <= event_end_date
 *   AND not cancelled
 */
app.get('/api/public/events/:publicToken', publicEventRateLimiter, async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const { publicToken } = req.params;
    if (!publicToken) {
      res.status(422).json({ error: 'Public token required' });
      return;
    }

    const rawEvent = await getEventByPublicToken(publicToken, undefined, { allowUnpaid: true });
    if (!rawEvent) {
      res.status(404).json({ error: 'Event not found or invalid URL' });
      return;
    }

    const accessDetails = getClientLiveGameAccessDetails(rawEvent);
    const { startDate, endDate, liveOpenDate } = getNormalizedEventDates(rawEvent);

    if (!accessDetails.canAccess) {
      if (accessDetails.code === 'EVENT_CANCELLED') {
        res.status(403).json({
          error: accessDetails.error || 'This event has been cancelled.',
          code: 'EVENT_CANCELLED',
          is_cancelled: true,
        });
        return;
      }

      if (accessDetails.code === 'EVENT_EXPIRED') {
        res.status(403).json({
          error: accessDetails.error || `This event concluded on ${endDate}.`,
          code: 'EVENT_EXPIRED',
          is_expired: true,
          start_date: startDate,
          end_date: endDate,
          event_id: rawEvent.id,
          event_name: rawEvent.name,
          event_timezone: accessDetails.event_timezone || rawEvent.event_timezone,
        });
        return;
      }

      if (accessDetails.code === 'PAYMENT_REQUIRED') {
        res.status(403).json({
          error: accessDetails.error || 'This event is currently awaiting payment and activation. Public game access is disabled until paid.',
          code: 'PAYMENT_REQUIRED',
          is_pending_payment: true,
          event_id: rawEvent.id,
          event_name: rawEvent.name,
          start_date: startDate,
          end_date: endDate,
          live_open_date: liveOpenDate,
          event_timezone: accessDetails.event_timezone || rawEvent.event_timezone,
        });
        return;
      }

      if (accessDetails.code === 'EVENT_NOT_OPEN') {
        res.status(403).json({
          error: accessDetails.error || `This event is scheduled to open on ${liveOpenDate}. Live URL will become active on ${liveOpenDate}.`,
          code: 'EVENT_NOT_OPEN',
          is_scheduled: true,
          live_open_date: liveOpenDate,
          start_date: startDate,
          end_date: endDate,
          event_id: rawEvent.id,
          event_name: rawEvent.name,
          event_timezone: accessDetails.event_timezone || rawEvent.event_timezone,
        });
        return;
      }
    }

    const publicEvent = toPublicEventDTO(rawEvent);
    res.json({ event: publicEvent });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

// ----------------------------------------------------
// EVENT HIGH SCORE BOARD ENDPOINTS
// ----------------------------------------------------

/**
 * Ambiguous middle endpoint REMOVED: /api/events/:eventId/high-scores
 * Public players must use /api/public/events/:publicToken/high-scores (live scores only).
 * Organizers must use /api/events/:eventId/admin/high-scores (TEST + LIVE scores with authentication).
 */
app.all('/api/events/:eventId/high-scores', (req, res) => {
  res.status(404).json({
    error: 'Endpoint removed. Public players must use /api/public/events/:publicToken/high-scores (live scores only). Organizers must use /api/events/:eventId/admin/high-scores (TEST + LIVE scores with authentication).',
    code: 'ENDPOINT_REMOVED',
  });
});

/**
 * GET /api/public/events/:publicToken/high-scores
 * Public endpoint to get high scores by public event token (PAID events only)
 */
app.get('/api/public/events/:publicToken/high-scores', publicHighScoreReadRateLimiter, async (req, res) => {
  try {
    const { publicToken } = req.params;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;

    const event = await getEventByPublicToken(publicToken, undefined, { allowUnpaid: true });
    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    // Security check: Public high scores are only available if the event is in the public live window
    // (PAID, within live window Setup Day through End Date, and not cancelled).
    // Pre-event test scores are strictly quarantined and never returned to public players.
    const isLiveAllowed = canAccessLiveEvent(event);

    if (!isLiveAllowed) {
      res.json({
        event_id: event.id,
        event_name: event.name,
        scores: [],
        totalCount: 0,
        page,
        limit,
        score_environment: 'live',
        is_test_mode: false,
      });
      return;
    }

    const result = await getEventHighScores(event.id, { limit, page, scoreEnvironment: 'live' });
    res.json({
      event_id: event.id,
      event_name: event.name,
      ...result,
    });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * POST /api/public/events/:publicToken/high-scores
 * Public endpoint to submit score by public event token (PAID live events only).
 * Public player -> LIVE event only -> LIVE score only.
 * Organizer test scores must only go through authenticated /api/events/:eventId/admin/high-scores.
 */
app.post('/api/public/events/:publicToken/high-scores', highScoreRateLimiter, async (req, res) => {
  try {
    const { publicToken } = req.params;
    const { player_name, score, metadata, session_id, sessionId } = req.body;

    if (score === undefined || score === null || isNaN(Number(score))) {
      res.status(422).json({ error: 'Valid numerical score is required' });
      return;
    }

    const event = await getEventByPublicToken(publicToken, undefined, { allowUnpaid: true });
    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    // Security check: Public score submissions strictly require canAccessLiveEvent(event) === true
    // (PAID, within live window Setup Day through End Date, and not cancelled).
    // Pre-event/test scores must only go through authenticated organizer endpoints.
    if (!canAccessLiveEvent(event)) {
      const accessDetails = getClientLiveGameAccessDetails(event);
      res.status(403).json({
        error: accessDetails.reason || 'Score submissions are only permitted for active, paid live events.',
        code: accessDetails.code || 'EVENT_NOT_LIVE',
      });
      return;
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

    const result = await submitEventScore({
      event_id: event.id,
      player_name,
      score: Number(score),
      session_id: incomingSessionId,
      metadata: cleanMetadata,
    });

    res.status(201).json({
      success: true,
      event_id: event.id,
      ...result,
    });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * GET /api/events/:eventId/admin/high-scores
 * Admin endpoint: view all scores and summary stats for an event
 */
app.get('/api/events/:eventId/admin/high-scores', authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { eventId } = req.params;

    const event = await getEventById(eventId);
    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    const { isMember, hasPermission } = await verifyOrgMembershipAndPermission(user.id, event.organization_id, 'event.view');
    if (!isMember || !hasPermission) {
      res.status(403).json({ error: 'Permission denied: Cannot view event score details' });
      return;
    }

    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;

    const [leaderboard, stats, testScoresCount] = await Promise.all([
      getEventHighScores(eventId, { limit, page, scoreEnvironment: 'all', includeTestScores: true }),
      getEventScoreStats(eventId),
      getEventTestScoresCount(eventId),
    ]);

    const isBeforeStart = isEventBeforeStartDate(event);

    res.json({
      event_id: eventId,
      event_name: event.name,
      ...leaderboard,
      stats,
      test_scores_count: testScoresCount,
      is_before_start_date: isBeforeStart,
    });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * POST /api/events/:eventId/admin/high-scores
 * Organizer test score submission during preview / playtesting
 * Strictly quarantined as test score in the database.
 */
app.post('/api/events/:eventId/admin/high-scores', authenticateJWT, highScoreRateLimiter, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { eventId } = req.params;
    const { player_name, score, metadata = {}, session_id, sessionId } = req.body;

    if (score === undefined || score === null || isNaN(Number(score))) {
      res.status(422).json({ error: 'Valid numerical score is required' });
      return;
    }

    const event = await getEventById(eventId);
    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    const { isMember, hasPermission } = await verifyOrgMembershipAndPermission(user.id, event.organization_id, 'event.view');
    if (!isMember || !hasPermission) {
      res.status(403).json({ error: 'Permission denied: Insufficient permissions to submit event scores' });
      return;
    }

    const incomingSessionId =
      session_id !== undefined ? session_id :
      sessionId !== undefined ? sessionId :
      (metadata && typeof metadata === 'object' && metadata.sessionId !== undefined ? metadata.sessionId :
      (metadata && typeof metadata === 'object' && metadata.session_id !== undefined ? metadata.session_id : undefined));

    const safeMetadata = typeof metadata === 'object' && metadata ? { ...metadata } : {};
    safeMetadata.isEventTest = true;
    safeMetadata.is_test = true;
    safeMetadata.score_environment = 'test';

    const result = await submitEventScore({
      event_id: eventId,
      player_name,
      score: Number(score),
      session_id: incomingSessionId,
      metadata: safeMetadata,
    });

    res.status(201).json({
      success: true,
      event_id: eventId,
      ...result,
    });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * DELETE /api/events/:eventId/admin/high-scores/:scoreId or /api/events/:eventId/high-scores/:scoreId
 * Admin endpoint: delete a single score entry
 */
app.delete(['/api/events/:eventId/admin/high-scores/:scoreId', '/api/events/:eventId/high-scores/:scoreId'], authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { eventId, scoreId } = req.params;

    const event = await getEventById(eventId);
    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    const { isMember, hasPermission } = await verifyOrgMembershipAndPermission(user.id, event.organization_id, 'event.manage');
    if (!isMember || !hasPermission) {
      res.status(403).json({ error: 'Permission denied: Only owners and admins can delete scores' });
      return;
    }

    await deleteEventScore(eventId, scoreId);
    res.json({ success: true, message: 'Score deleted successfully' });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * POST /api/events/:eventId/test-scores/clear
 * Admin endpoint: Manually clear TEST scores for an event BEFORE its start date.
 * Rejects if event has already reached its start date.
 * Leaves LIVE scores untouched.
 */
app.post(
  ['/api/events/:eventId/test-scores/clear', '/api/events/:eventId/admin/test-scores/clear'],
  authenticateJWT,
  async (req: AuthenticatedRequest, res) => {
    try {
      const user = req.user!;
      const { eventId } = req.params;

      const event = await getEventById(eventId);
      if (!event) {
        res.status(404).json({ error: 'Event not found' });
        return;
      }

      const { isMember, hasPermission } = await verifyOrgMembershipAndPermission(user.id, event.organization_id, 'event.manage');
      if (!isMember || !hasPermission) {
        res.status(403).json({ error: 'Permission denied: Only event owners and admins can clear test scores' });
        return;
      }

      // Safety rule: Event must NOT have reached its start date
      if (!isEventBeforeStartDate(event)) {
        res.status(400).json({
          error: 'Cannot manually clear test scores: Event has already reached its start date or is live.',
          code: 'EVENT_ALREADY_STARTED',
        });
        return;
      }

      const result = await manualClearEventTestScores(eventId);
      res.json({
        success: true,
        message: 'Test scores cleared.',
        clearedCount: result.clearedCount,
        deleted_count: result.deleted_count,
      });
    } catch (err: any) {
      handleApiError(err, req, res);
  }
  }
);

/**
 * POST /api/events/:eventId/admin/high-scores/clear or /api/events/:eventId/high-scores/clear
 * Admin endpoint: clear/reset all scores for an event
 */
app.post(['/api/events/:eventId/admin/high-scores/clear', '/api/events/:eventId/high-scores/clear'], authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { eventId } = req.params;

    const event = await getEventById(eventId);
    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    const { isMember, hasPermission } = await verifyOrgMembershipAndPermission(user.id, event.organization_id, 'event.manage');
    if (!isMember || !hasPermission) {
      res.status(403).json({ error: 'Permission denied: Only organization owners and admins can reset leaderboards' });
      return;
    }

    await clearEventHighScores(eventId);
    res.json({ success: true, message: 'Event leaderboard reset successfully' });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

// ----------------------------------------------------
// EVENT SHOWCASE API ENDPOINTS
// ----------------------------------------------------

/**
 * GET /api/events/:eventId/showcase
 * Get the showcase for an event (public for PUBLISHED, org members can preview drafts)
 */
app.get('/api/events/:eventId/showcase', authenticateOptionalJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const { eventId } = req.params;
    const event = await getEventById(eventId);
    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    const showcase = await getShowcaseByEventId(eventId);

    // Check optional auth (supports both App JWT and Supabase JWT)
    let isOrgMember = false;
    if (req.user) {
      const { isMember, hasPermission } = await verifyOrgMembershipAndPermission(req.user.id, event.organization_id, 'event.view');
      isOrgMember = isMember && hasPermission;
    }

    if (!showcase) {
      if (isOrgMember) {
        const lifetimeRewardStatus = req.user?.id ? await getOwnerShowcaseRewardStatus(req.user.id) : null;
        res.json({ showcase: null, lifetimeRewardStatus });
        return;
      }
      res.status(404).json({ error: 'Showcase not found' });
      return;
    }

    // If org member, return showcase regardless of status
    if (isOrgMember) {
      const lifetimeRewardStatus = req.user?.id ? await getOwnerShowcaseRewardStatus(req.user.id) : null;
      res.json({ showcase, lifetimeRewardStatus });
      return;
    }

    // If public/guest, only return if PUBLISHED
    if (showcase.status === 'PUBLISHED') {
      res.json({ showcase });
      return;
    }

    res.status(404).json({ error: 'Showcase is not published' });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * GET /api/user/showcase-reward-status
 * Check current authenticated user's lifetime showcase reward status
 * Strictly uses authenticated user ID from JWT (never trusts browser-supplied IDs)
 */
app.get('/api/user/showcase-reward-status', authenticateJWT, async (req: AuthenticatedRequest, res: any) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized: Authenticated user required' });
      return;
    }
    const status = await getOwnerShowcaseRewardStatus(userId);
    res.json(status);
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * GET /api/showcases/user-reward-status
 * Alias for /api/user/showcase-reward-status
 */
app.get('/api/showcases/user-reward-status', authenticateJWT, async (req: AuthenticatedRequest, res: any) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized: Authenticated user required' });
      return;
    }
    const status = await getOwnerShowcaseRewardStatus(userId);
    res.json(status);
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * GET /api/showcases/:id
 * Public read-only endpoint for a showcase (resolved by showcase id or event id)
 * Supports both App JWT and Supabase JWT (optional auth for org members)
 */
app.get('/api/showcases/:id', generalApiRateLimiter, authenticateOptionalJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    let showcase = await getShowcaseById(id);
    if (!showcase) {
      showcase = await getShowcaseByEventId(id);
    }
    if (!showcase) {
      res.status(404).json({ error: 'Showcase not found' });
      return;
    }

    const event = await getEventById(showcase.event_id);
    if (!event) {
      res.status(404).json({ error: 'Associated event not found' });
      return;
    }

    let isOrgMember = false;
    if (req.user) {
      if (req.user.is_developer) {
        isOrgMember = true;
      } else {
        const { isMember, hasPermission } = await verifyOrgMembershipAndPermission(req.user.id, event.organization_id, 'event.view');
        isOrgMember = isMember && hasPermission;
      }
    }

    // Status enforcement:
    // PUBLISHED -> Public visitor can view
    // BLOCKED, DELETED, UNPUBLISHED, DRAFT -> Only authorized org members or developers can preview
    if (!isOrgMember && showcase.status !== 'PUBLISHED') {
      res.status(404).json({ error: 'Showcase is not publicly accessible', status: showcase.status });
      return;
    }

    const media = await getShowcaseMedia(showcase.id, event.organization_id);

    const publicEvent = {
      id: event.id,
      name: event.name,
      game_type: event.game?.game_type || event.game_id || null,
      start_date: event.start_date,
      end_date: event.end_date,
      event_timezone: (event as any).event_timezone || 'Asia/Singapore',
    };

    res.json({
      showcase,
      event: publicEvent,
      media,
      isPreview: isOrgMember && showcase.status !== 'PUBLISHED',
    });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * GET /api/showcases/:id/media
 * Public read-only endpoint for showcase media
 */
app.get('/api/showcases/:id/media', generalApiRateLimiter, authenticateOptionalJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    let showcase = await getShowcaseById(id);
    if (!showcase) {
      showcase = await getShowcaseByEventId(id);
    }
    if (!showcase) {
      res.status(404).json({ error: 'Showcase not found' });
      return;
    }

    const event = await getEventById(showcase.event_id);
    if (!event) {
      res.status(404).json({ error: 'Associated event not found' });
      return;
    }

    let isOrgMember = false;
    if (req.user) {
      if (req.user.is_developer) {
        isOrgMember = true;
      } else {
        const { isMember, hasPermission } = await verifyOrgMembershipAndPermission(req.user.id, event.organization_id, 'event.view');
        isOrgMember = isMember && hasPermission;
      }
    }

    if (!isOrgMember && showcase.status !== 'PUBLISHED') {
      res.status(403).json({ error: 'Showcase media is not publicly accessible' });
      return;
    }

    const media = await getShowcaseMedia(showcase.id, event.organization_id);
    res.json({ media });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * POST /api/events/:eventId/showcase
 * Create showcase for an event (1:1 constraint)
 */
app.post('/api/events/:eventId/showcase', showcaseRateLimiter, authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { eventId } = req.params;

    const event = await getEventById(eventId);
    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    const { isMember, hasPermission } = await verifyOrgMembershipAndPermission(user.id, event.organization_id, 'event.edit');
    if (!isMember || !hasPermission) {
      res.status(403).json({ error: 'Permission denied: Only owners and admins can create event showcases' });
      return;
    }

    const showcaseEligibility = isEventEligibleForShowcase(event);
    if (!showcaseEligibility.eligible) {
      res.status(422).json({ error: showcaseEligibility.reason, code: showcaseEligibility.code });
      return;
    }

    const existing = await getShowcaseByEventId(eventId);
    if (existing) {
      res.status(409).json({ error: 'An Event Showcase already exists for this event', showcase: existing });
      return;
    }

    const { title, description, client_name, client_logo_url, cover_image_url, status } = req.body;

    if (title !== undefined && (typeof title !== 'string' || !title.trim())) {
      res.status(422).json({ error: 'Valid showcase title is required' });
      return;
    }

    // In "Publish First, Moderate Later" model, default to PUBLISHED unless explicitly DRAFT or UNPUBLISHED
    const initialStatus = status === 'DRAFT' || status === 'UNPUBLISHED' ? status : 'PUBLISHED';

    const showcase = await createShowcase({
      event_id: eventId,
      organization_id: event.organization_id,
      title: title ? title.trim() : event.name,
      description,
      client_name,
      client_logo_url,
      cover_image_url,
      status: initialStatus,
    });

    // Evaluate reward eligibility asynchronously
    evaluateShowcaseRewardEligibility(eventId).catch((err) => console.warn('Reward evaluation notice on creation:', err));

    res.status(201).json({ showcase });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * PATCH /api/events/:eventId/showcase
 * Update showcase details - normal organizers can edit freely without approval lock
 */
app.patch('/api/events/:eventId/showcase', showcaseRateLimiter, authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { eventId } = req.params;

    const event = await getEventById(eventId);
    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    const { isMember, hasPermission } = await verifyOrgMembershipAndPermission(user.id, event.organization_id, 'event.edit');
    if (!isMember || !hasPermission) {
      res.status(403).json({ error: 'Permission denied: Only owners and admins can edit event showcases' });
      return;
    }

    const showcaseEligibility = isEventEligibleForShowcase(event);
    if (!showcaseEligibility.eligible) {
      res.status(422).json({ error: showcaseEligibility.reason, code: showcaseEligibility.code });
      return;
    }

    const existing = await getShowcaseByEventId(eventId);
    if (!existing) {
      res.status(404).json({ error: 'Event Showcase not found' });
      return;
    }

    // Enforce Moderation Security: BLOCKED showcases cannot be edited by normal users
    if (existing.status === 'BLOCKED') {
      res.status(403).json({
        error: 'This showcase has been blocked by administrators and cannot be edited. Please contact support.',
        code: 'SHOWCASE_BLOCKED',
      });
      return;
    }

    if (existing.status === 'DELETED' || existing.deleted_at) {
      res.status(404).json({ error: 'Event Showcase has been deleted' });
      return;
    }

    const { title, description, client_name, client_logo_url, cover_image_url, status } = req.body;

    if (title !== undefined && (typeof title !== 'string' || !title.trim())) {
      res.status(422).json({ error: 'Showcase title cannot be empty' });
      return;
    }

    // Normal users can only set visibility to PUBLISHED, UNPUBLISHED, or DRAFT
    let safeStatus: any = undefined;
    if (status !== undefined) {
      if (status === 'BLOCKED' || status === 'DELETED') {
        res.status(403).json({ error: 'Cannot set administrative moderation status directly.' });
        return;
      }
      if (status === 'DRAFT' || status === 'UNPUBLISHED' || status === 'PUBLISHED') {
        safeStatus = status;
      }
    }

    const showcase = await updateShowcase(eventId, {
      title,
      description,
      client_name,
      client_logo_url,
      cover_image_url,
      status: safeStatus,
    });

    // Re-evaluate reward eligibility after update
    evaluateShowcaseRewardEligibility(eventId).catch((err) => console.warn('Reward evaluation notice on update:', err));

    res.json({ showcase });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * POST /api/events/:eventId/showcase/publish
 * Publish showcase immediately (safely creates showcase if none exists yet)
 */
app.post('/api/events/:eventId/showcase/publish', showcaseRateLimiter, authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { eventId } = req.params;

    console.log(`[Showcase Publish API] eventId received: ${eventId}`);

    const event = await getEventById(eventId);
    console.log(`[Showcase Publish API] event existence: ${!!event}${event ? ` (id=${event.id}, name="${event.name}")` : ''}`);
    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    const { isMember, hasPermission } = await verifyOrgMembershipAndPermission(user.id, event.organization_id, 'event.edit');
    if (!isMember || !hasPermission) {
      res.status(403).json({ error: 'Permission denied: Only owners and admins can publish event showcases' });
      return;
    }

    const showcaseEligibility = isEventEligibleForShowcase(event);
    if (!showcaseEligibility.eligible) {
      res.status(422).json({ error: showcaseEligibility.reason, code: showcaseEligibility.code });
      return;
    }

    const existing = await getShowcaseByEventId(eventId);
    console.log(`[Showcase Publish API] showcase lookup result: ${existing ? `Found existing showcase (id=${existing.id}, status=${existing.status})` : 'None found (will create and publish new showcase)'}`);

    if (existing && existing.status === 'BLOCKED') {
      res.status(403).json({ error: 'Cannot publish a blocked showcase. Please contact support.', code: 'SHOWCASE_BLOCKED' });
      return;
    }

    const updates = req.body && typeof req.body === 'object' ? {
      title: typeof req.body.title === 'string' ? req.body.title : undefined,
      description: typeof req.body.description === 'string' || req.body.description === null ? req.body.description : undefined,
      client_name: typeof req.body.client_name === 'string' || req.body.client_name === null ? req.body.client_name : undefined,
      client_logo_url: typeof req.body.client_logo_url === 'string' || req.body.client_logo_url === null ? req.body.client_logo_url : undefined,
      cover_image_url: typeof req.body.cover_image_url === 'string' || req.body.cover_image_url === null ? req.body.cover_image_url : undefined,
    } : undefined;

    const showcase = await publishShowcase(eventId, updates);
    console.log(`[Showcase Publish API] showcase ID: ${showcase.id}`);
    console.log(`[Showcase Publish API] publish/update result: status=${showcase.status}, publication_status=${showcase.publication_status}, event_id=${showcase.event_id}`);

    evaluateShowcaseRewardEligibility(eventId).catch((err) => console.warn('Reward evaluation notice on publish:', err));
    res.json({ showcase });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * POST /api/events/:eventId/showcase/unpublish
 * Unpublish showcase (does not delete)
 */
app.post('/api/events/:eventId/showcase/unpublish', showcaseRateLimiter, authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { eventId } = req.params;

    const event = await getEventById(eventId);
    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    const { isMember, hasPermission } = await verifyOrgMembershipAndPermission(user.id, event.organization_id, 'event.edit');
    if (!isMember || !hasPermission) {
      res.status(403).json({ error: 'Permission denied: Only owners and admins can unpublish event showcases' });
      return;
    }

    const existing = await getShowcaseByEventId(eventId);
    if (!existing) {
      res.status(404).json({ error: 'Event Showcase not found' });
      return;
    }

    const showcase = await unpublishShowcase(eventId);
    res.json({ showcase });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * DELETE /api/events/:eventId/showcase
 * Delete event showcase
 */
app.delete('/api/events/:eventId/showcase', showcaseRateLimiter, authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { eventId } = req.params;

    const event = await getEventById(eventId);
    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    const { isMember, hasPermission } = await verifyOrgMembershipAndPermission(user.id, event.organization_id, 'event.edit');
    if (!isMember || !hasPermission) {
      res.status(403).json({ error: 'Permission denied: Only owners and admins can delete event showcases' });
      return;
    }

    await deleteShowcase(eventId);
    res.json({ success: true, message: 'Showcase deleted successfully' });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

// ----------------------------------------------------
// EVENT SHOWCASE MEDIA API ENDPOINTS
// ----------------------------------------------------

/**
 * GET /api/events/:eventId/showcase/media
 * Get all media items for an event's showcase (ordered by sort_order)
 */
app.get('/api/events/:eventId/showcase/media', authenticateOptionalJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const { eventId } = req.params;
    const event = await getEventById(eventId);
    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    const showcase = await getShowcaseByEventId(eventId);
    if (!showcase) {
      res.status(404).json({ error: 'Showcase not found for this event' });
      return;
    }

    // Check optional auth (supports both App JWT and Supabase JWT)
    let isOrgMember = false;
    if (req.user) {
      const { isMember, hasPermission } = await verifyOrgMembershipAndPermission(req.user.id, event.organization_id, 'event.view');
      isOrgMember = isMember && hasPermission;
    }

    // If not org member, only allow if showcase is PUBLISHED
    if (!isOrgMember && showcase.status !== 'PUBLISHED') {
      res.status(403).json({ error: 'Showcase is not publicly accessible' });
      return;
    }

    const media = await getShowcaseMedia(showcase.id, event.organization_id);
    res.json({ media });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * POST /api/events/:eventId/showcase/media/upload-url
 * Generate signed upload URL or direct stream endpoint for photo/video uploads
 */
app.post('/api/events/:eventId/showcase/media/upload-url', uploadRateLimiter, authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { eventId } = req.params;

    const event = await getEventById(eventId);
    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    const { isMember, hasPermission } = await verifyOrgMembershipAndPermission(user.id, event.organization_id, 'event.edit');
    if (!isMember || !hasPermission) {
      res.status(403).json({ error: 'Permission denied: Only owners and admins can upload showcase media' });
      return;
    }

    const showcaseEligibility = isEventEligibleForShowcase(event);
    if (!showcaseEligibility.eligible) {
      res.status(422).json({ error: showcaseEligibility.reason, code: showcaseEligibility.code });
      return;
    }

    const showcase = await getShowcaseByEventId(eventId);
    if (!showcase) {
      res.status(404).json({ error: 'Event Showcase not found. Please create the showcase first.' });
      return;
    }

    const { fileName, fileType, fileSize, mediaType } = req.body;

    if (!fileName || typeof fileName !== 'string') {
      res.status(422).json({ error: 'fileName is required' });
      return;
    }

    if (!fileType || typeof fileType !== 'string') {
      res.status(422).json({ error: 'fileType is required' });
      return;
    }

    if (!fileSize || typeof fileSize !== 'number' || fileSize <= 0) {
      res.status(422).json({ error: 'Valid fileSize in bytes is required' });
      return;
    }

    const normalizedMediaType = (mediaType || '').toUpperCase();
    if (normalizedMediaType !== 'IMAGE' && normalizedMediaType !== 'VIDEO') {
      res.status(422).json({ error: 'mediaType must be IMAGE or VIDEO' });
      return;
    }

    const lowerMime = fileType.toLowerCase().trim();
    const rawFileName = fileName.trim();
    const dotIdx = rawFileName.lastIndexOf('.');
    const ext = dotIdx !== -1 ? rawFileName.slice(dotIdx).toLowerCase() : '';

    // Explicitly reject SVG for security reasons
    if (ext === '.svg' || lowerMime.includes('svg')) {
      res.status(422).json({
        error: 'SVG uploads are not permitted for security reasons. Please upload raster images (PNG, JPEG, WEBP).',
        code: 'SVG_NOT_ALLOWED',
      });
      return;
    }

    // Validate type and size strictly against allowed lists
    if (normalizedMediaType === 'IMAGE') {
      if (!ALLOWED_IMAGE_MIME_TYPES.has(lowerMime)) {
        res.status(422).json({
          error: `Unsupported image format (${fileType}). Supported formats: PNG, JPEG, WEBP.`,
          code: 'UNSUPPORTED_FILE_TYPE',
        });
        return;
      }
      if (fileSize > MAX_IMAGE_SIZE) {
        res.status(422).json({
          error: `Image file size exceeds maximum limit of 25MB (${(fileSize / (1024 * 1024)).toFixed(1)}MB provided).`,
          code: 'FILE_TOO_LARGE',
        });
        return;
      }
    } else {
      if (!ALLOWED_VIDEO_MIME_TYPES.has(lowerMime)) {
        res.status(422).json({
          error: `Unsupported video format (${fileType}). Supported formats: MP4, WEBM, MOV.`,
          code: 'UNSUPPORTED_FILE_TYPE',
        });
        return;
      }
      if (fileSize > MAX_VIDEO_SIZE) {
        res.status(422).json({
          error: `Video file size exceeds maximum limit of 200MB (${(fileSize / (1024 * 1024)).toFixed(1)}MB provided).`,
          code: 'FILE_TOO_LARGE',
        });
        return;
      }
    }

    const uploadInfo = await createSignedUploadUrlForShowcase({
      organizationId: event.organization_id,
      showcaseId: showcase.id,
      eventId: event.id,
      fileName,
      mimeType: lowerMime,
      mediaType: normalizedMediaType as 'IMAGE' | 'VIDEO',
      fileSize,
    });

    if (!uploadInfo.signedUrl && fileSize > MAX_DIRECT_UPLOAD_SIZE) {
      res.status(503).json({
        error: 'Direct upload is restricted to 10MB to prevent memory pressure. Files up to 200MB require signed Supabase storage upload, but a signed URL could not be generated. Please check storage bucket configuration.',
        code: 'SIGNED_UPLOAD_UNAVAILABLE',
      });
      return;
    }

    res.json({
      uploadInfo: {
        ...uploadInfo,
        mediaType: normalizedMediaType,
        fileName,
        fileSize,
        mimeType: lowerMime,
      },
    });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * POST /api/events/showcase-media/direct-upload
 * POST /api/events/:eventId/showcase/media/direct-upload
 * Direct binary streaming upload for showcase media files with strict multi-layer authorization and sandboxing
 */
app.post(
  ['/api/events/showcase-media/direct-upload', '/api/events/:eventId/showcase/media/direct-upload'],
  uploadRateLimiter,
  authenticateJWT,
  (req, res, next) => {
    mediaUpload.single('file')(req, res, (err: any) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          res.status(413).json({
            error: `Direct upload is restricted to small assets up to 10MB. Large showcase files (up to 200MB) must be uploaded via signed storage upload (/upload-url).`,
            code: 'DIRECT_UPLOAD_SIZE_EXCEEDED',
            maxDirectSizeBytes: MAX_DIRECT_UPLOAD_SIZE,
          });
          return;
        }
        handleApiError(err, req, res);
        return;
      }
      next();
    });
  },
  async (req: AuthenticatedRequest, res) => {
    try {
      const user = req.user!;
      if (!user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      if (!req.file || !req.file.buffer || req.file.buffer.length === 0) {
        res.status(422).json({ error: 'No media file provided' });
        return;
      }

      // 1. Identify & Validate Event and Showcase IDs
      let eventId = req.params.eventId || (req.query.eventId as string) || (req.body.eventId as string);
      let showcaseId = (req.query.showcaseId as string) || (req.body.showcaseId as string);
      const requestedPath = (req.query.path as string) || (req.body.path as string);
      const queryFilename = (req.query.filename as string) || (req.body.filename as string);

      if (!eventId && !showcaseId && requestedPath) {
        const pathMatch = requestedPath.match(/^organizations\/([^/]+)\/showcases\/([^/]+)\/([^/]+)$/);
        if (pathMatch) {
          showcaseId = pathMatch[2];
        }
      }

      if (!eventId && !showcaseId) {
        res.status(422).json({ error: 'eventId or showcaseId is required for showcase media upload' });
        return;
      }

      let event: any = null;
      let showcase: any = null;

      if (eventId) {
        event = await getEventById(eventId);
        if (!event) {
          res.status(404).json({ error: 'Event not found' });
          return;
        }
        showcase = await getShowcaseByEventId(eventId);
        if (!showcase) {
          res.status(404).json({ error: 'Event Showcase not found. Please create the showcase first.' });
          return;
        }
        if (showcaseId && showcase.id !== showcaseId) {
          res.status(403).json({ error: 'Showcase does not match event' });
          return;
        }
      } else if (showcaseId) {
        showcase = await getShowcaseById(showcaseId);
        if (!showcase) {
          res.status(404).json({ error: 'Event Showcase not found' });
          return;
        }
        event = await getEventById(showcase.event_id);
        if (!event) {
          res.status(404).json({ error: 'Associated event not found' });
          return;
        }
      }

      // 2. Verify Organization Membership & Permissions
      const { isMember, hasPermission } = await verifyOrgMembershipAndPermission(user.id, event.organization_id, 'event.edit');
      if (!isMember) {
        res.status(403).json({ error: 'Permission denied: You are not a member of this organization' });
        return;
      }
      if (!hasPermission) {
        res.status(403).json({ error: 'Permission denied: Only owners and admins can upload showcase media' });
        return;
      }

      const showcaseEligibility = isEventEligibleForShowcase(event);
      if (!showcaseEligibility.eligible) {
        res.status(422).json({ error: showcaseEligibility.reason, code: showcaseEligibility.code });
        return;
      }

      // 3. Validate MIME Type, File Size, Magic Bytes, and Reject SVG
      const validation = validateUploadedFile(req.file.buffer, {
        originalName: queryFilename || req.file.originalname,
        declaredMime: req.file.mimetype,
        maxSizeBytes: MAX_DIRECT_UPLOAD_SIZE,
      });

      if (!validation.valid) {
        res.status(422).json({ error: validation.error, code: validation.code });
        return;
      }

      const isImage = validation.mediaType === 'image';
      const isVideo = validation.mediaType === 'video';

      if (!isImage && !isVideo) {
        res.status(422).json({
          error: `Unsupported media format (${req.file.mimetype}). Supported formats: PNG, JPEG, WEBP, MP4, WEBM, MOV.`,
          code: 'UNSUPPORTED_FILE_TYPE',
        });
        return;
      }

      const fileSize = req.file.buffer.length;
      if (fileSize > MAX_DIRECT_UPLOAD_SIZE) {
        res.status(413).json({
          error: `Direct upload is restricted to small assets up to 10MB (${(fileSize / (1024 * 1024)).toFixed(1)}MB provided). Large showcase files (up to 200MB) must be uploaded via signed storage upload (/upload-url).`,
          code: 'DIRECT_UPLOAD_SIZE_EXCEEDED',
          maxDirectSizeBytes: MAX_DIRECT_UPLOAD_SIZE,
        });
        return;
      }

      // 4. Storage Path Validation & Sandboxing (Never Trust Client-Provided Arbitrary Path)
      const expectedPrefix = `organizations/${event.organization_id}/showcases/${showcase.id}/`;
      const originalName = queryFilename || req.file.originalname || (isImage ? 'image.png' : 'video.mp4');
      const ext = validation.extension || (isImage ? '.png' : '.mp4');
      const randomHex = crypto.randomBytes(8).toString('hex');
      const safeUniqueName = `${Date.now()}-${randomHex}${ext}`;

      let storagePath = `${expectedPrefix}${safeUniqueName}`;
      if (requestedPath && requestedPath.startsWith(expectedPrefix)) {
        const subPath = requestedPath.slice(expectedPrefix.length);
        if (!subPath.includes('/') && !subPath.includes('\\') && !subPath.includes('..')) {
          storagePath = requestedPath;
        }
      }

      try {
        const supabase = getSupabaseServerClient();
        await ensureStorageBuckets();
        const { error: uploadErr } = await supabase.storage
          .from(SHOWCASE_BUCKET)
          .upload(storagePath, req.file.buffer, {
            contentType: validation.mimeType,
            upsert: true,
          });

        if (!uploadErr) {
          const { data: publicData } = supabase.storage
            .from(SHOWCASE_BUCKET)
            .getPublicUrl(storagePath);

          res.json({
            url: publicData?.publicUrl || `/uploads/${path.basename(storagePath)}`,
            path: storagePath,
            fileName: originalName,
            mediaType: isImage ? 'IMAGE' : 'VIDEO',
            fileSize,
            bucket: SHOWCASE_BUCKET,
          });
          return;
        } else {
          console.warn(`Supabase ${SHOWCASE_BUCKET} storage upload error:`, uploadErr.message);
        }
      } catch (sErr) {
        console.warn('Direct upload to Supabase storage fallback:', sErr);
      }

      // Fallback to local /uploads/ directory
      const localFilePath = path.join(uploadDir, safeUniqueName);
      fs.writeFileSync(localFilePath, req.file.buffer);

      const publicUrl = `/uploads/${safeUniqueName}`;
      res.json({
        url: publicUrl,
        path: storagePath,
        fileName: originalName,
        mediaType: isImage ? 'IMAGE' : 'VIDEO',
        fileSize,
      });
    } catch (err: any) {
      handleApiError(err, req, res);
  }
  }
);

/**
 * POST /api/events/:eventId/showcase/media
 * Add a new media item record to showcase after successful upload
 */
app.post('/api/events/:eventId/showcase/media', showcaseRateLimiter, authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { eventId } = req.params;

    const event = await getEventById(eventId);
    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    const { isMember, hasPermission } = await verifyOrgMembershipAndPermission(user.id, event.organization_id, 'event.edit');
    if (!isMember || !hasPermission) {
      res.status(403).json({ error: 'Permission denied: Only owners and admins can add showcase media' });
      return;
    }

    const showcaseEligibility = isEventEligibleForShowcase(event);
    if (!showcaseEligibility.eligible) {
      res.status(422).json({ error: showcaseEligibility.reason, code: showcaseEligibility.code });
      return;
    }

    const showcase = await getShowcaseByEventId(eventId);
    if (!showcase) {
      res.status(404).json({ error: 'Showcase not found' });
      return;
    }

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
    } = req.body;

    if (!media_type || (media_type !== 'IMAGE' && media_type !== 'VIDEO')) {
      res.status(422).json({ error: 'media_type must be IMAGE or VIDEO' });
      return;
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
    });

    if (!pathValidation.valid) {
      res.status(pathValidation.statusCode || 422).json({
        error: pathValidation.error,
        code: pathValidation.code,
      });
      return;
    }

    const media = await createShowcaseMedia({
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
    });

    res.status(201).json({ media });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * PATCH /api/events/:eventId/showcase/media/reorder
 * Reorder showcase media items
 */
app.patch('/api/events/:eventId/showcase/media/reorder', showcaseRateLimiter, authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { eventId } = req.params;

    const event = await getEventById(eventId);
    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    const { isMember, hasPermission } = await verifyOrgMembershipAndPermission(user.id, event.organization_id, 'event.edit');
    if (!isMember || !hasPermission) {
      res.status(403).json({ error: 'Permission denied: Only owners and admins can reorder showcase media' });
      return;
    }

    const showcaseEligibility = isEventEligibleForShowcase(event);
    if (!showcaseEligibility.eligible) {
      res.status(422).json({ error: showcaseEligibility.reason, code: showcaseEligibility.code });
      return;
    }

    const showcase = await getShowcaseByEventId(eventId);
    if (!showcase) {
      res.status(404).json({ error: 'Showcase not found' });
      return;
    }

    const { media_ids } = req.body;
    if (!Array.isArray(media_ids)) {
      res.status(422).json({ error: 'media_ids array is required' });
      return;
    }

    const updatedMedia = await reorderShowcaseMedia(showcase.id, media_ids, event.organization_id);
    res.json({ success: true, media: updatedMedia });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * DELETE /api/events/:eventId/showcase/media/:mediaId
 * Delete a media item from showcase
 */
app.delete('/api/events/:eventId/showcase/media/:mediaId', showcaseRateLimiter, authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { eventId, mediaId } = req.params;

    const event = await getEventById(eventId);
    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    const { isMember, hasPermission } = await verifyOrgMembershipAndPermission(user.id, event.organization_id, 'event.edit');
    if (!isMember || !hasPermission) {
      res.status(403).json({ error: 'Permission denied: Only owners and admins can delete showcase media' });
      return;
    }

    const showcase = await getShowcaseByEventId(eventId);
    if (!showcase) {
      res.status(404).json({ error: 'Showcase not found' });
      return;
    }

    const media = await getShowcaseMediaById(mediaId);
    if (!media) {
      res.status(404).json({ error: 'Showcase media item not found' });
      return;
    }

    // Verify ownership hierarchy: organization -> event -> showcase -> media
    if (media.showcase_id !== showcase.id || media.organization_id !== event.organization_id) {
      res.status(403).json({ error: 'Media does not belong to this event showcase' });
      return;
    }

    // Clean up file in Supabase storage if storage_path is recorded
    if (media.storage_path) {
      try {
        const { getSupabaseServerClient } = await import('./server/supabase.js');
        const supabase = getSupabaseServerClient();
        await supabase.storage.from(SHOWCASE_BUCKET).remove([media.storage_path]);
      } catch (sErr: any) {
        console.warn('Notice: Could not delete storage file:', sErr.message);
      }
    }

    await deleteShowcaseMedia(mediaId, showcase.id, event.organization_id);
    res.json({ success: true });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

// ----------------------------------------------------
// DEVELOPER ADMIN API ENDPOINTS
// ----------------------------------------------------

/**
 * GET /api/developer/stats
 * Overview dashboard metrics for developer platform admin
 */
app.get('/api/developer/stats', authenticateDeveloperAdmin, async (req, res) => {
  try {
    const games = await getAllPlatformGames();
    const themes = await getAllSystemThemes();
    res.json({
      stats: {
        totalGames: games.length,
        activeGames: games.filter((g) => g.status === 'active').length,
        totalDefaultThemes: themes.length,
        activeThemes: themes.filter((t) => t.status === 'active').length,
      },
    });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * GET /api/developer/games
 * List all platform games with their system theme counts
 */
app.get('/api/developer/games', authenticateDeveloperAdmin, async (req, res) => {
  try {
    const games = await getAllPlatformGames();
    res.json({ games });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * POST /api/developer/games
 * Create a new platform game
 */
app.post('/api/developer/games', authenticateDeveloperAdmin, async (req: AuthenticatedRequest, res) => {
  try {
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
    } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      res.status(422).json({ error: 'Game name is required' });
      return;
    }

    if (!game_type || typeof game_type !== 'string' || !game_type.trim()) {
      res.status(422).json({ error: 'Game Type is required (e.g. catch-brand)' });
      return;
    }

    const game = await createPlatformGame({
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
    });

    res.status(201).json({ game });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * GET /api/developer/games/:gameId
 * Get single platform game details
 */
app.get('/api/developer/games/:gameId', authenticateDeveloperAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { gameId } = req.params;
    const game = await getGameById(gameId);
    if (!game) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }

    const themes = await getSystemThemesByGameId(gameId, { status: 'all' });
    res.json({ game, themes });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * PUT /api/developer/games/:gameId
 * PATCH /api/developer/games/:gameId
 * Update platform game metadata, status, and defaults
 */
const handleUpdatePlatformGame = async (req: AuthenticatedRequest, res: any) => {
  try {
    const { gameId } = req.params;
    const updates = req.body;

    const game = await updatePlatformGame(gameId, updates);
    res.json({ game });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
};

app.put('/api/developer/games/:gameId', authenticateDeveloperAdmin, handleUpdatePlatformGame);
app.patch('/api/developer/games/:gameId', authenticateDeveloperAdmin, handleUpdatePlatformGame);

/**
 * DELETE /api/developer/games/:gameId
 * Delete a platform game (restricted if game is linked to any events)
 */
app.delete('/api/developer/games/:gameId', authenticateDeveloperAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { gameId } = req.params;
    await deletePlatformGame(gameId);
    res.json({ success: true, message: 'Game deleted successfully' });
  } catch (err: any) {
    if (err.code === 'GAME_IN_USE' || err.code === '23503' || err.status === 409) {
      handleApiError(new AppError('Cannot delete game because it is used by existing events. Deactivate the game instead.', 409, 'GAME_IN_USE'), req, res);
      return;
    }
    handleApiError(err, req, res);
  }
});

/**
 * GET /api/developer/games/:gameId/themes
 * Get all system default themes for a specific game
 */
app.get('/api/developer/games/:gameId/themes', authenticateDeveloperAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { gameId } = req.params;
    const themes = await getSystemThemesByGameId(gameId, { status: 'all' });
    res.json({ themes });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * POST /api/developer/games/:gameId/themes
 * Create a new system default theme for a game
 */
app.post('/api/developer/games/:gameId/themes', authenticateDeveloperAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { gameId } = req.params;
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
    } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      res.status(422).json({ error: 'Theme name is required' });
      return;
    }

    const targetGame = await getGameById(gameId);
    if (targetGame && !targetGame.is_system && targetGame.organization_id) {
      res.status(400).json({
        error: 'Cannot create a system theme for an organization game. Use the corresponding system game.',
      });
      return;
    }

    const theme = await createSystemTheme({
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
    });

    res.status(201).json({ theme });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * GET /api/developer/themes/:themeId
 * Get single system default theme
 */
app.get('/api/developer/themes/:themeId', authenticateDeveloperAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { themeId } = req.params;
    if (!isUUID(themeId)) {
      res.status(400).json({ error: `Invalid theme ID format: ${themeId}` });
      return;
    }
    const theme = await getThemeById(themeId);
    if (!theme) {
      res.status(404).json({ error: 'System theme not found' });
      return;
    }
    res.json({ theme });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * PUT /api/developer/themes/:themeId
 * Update a system default theme
 */
app.put('/api/developer/themes/:themeId', authenticateDeveloperAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { themeId } = req.params;
    if (!isUUID(themeId)) {
      res.status(400).json({ error: `Invalid theme ID format: ${themeId}` });
      return;
    }
    const updates = req.body;

    const theme = await updateSystemTheme(themeId, updates);
    res.json({ theme });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * DELETE /api/developer/themes/:themeId
 * Delete a system default theme
 */
app.delete('/api/developer/themes/:themeId', authenticateDeveloperAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { themeId } = req.params;
    if (!isUUID(themeId)) {
      res.status(400).json({ error: `Invalid theme ID format: ${themeId}` });
      return;
    }
    await deleteSystemTheme(themeId);
    res.json({ success: true });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * POST /api/developer/themes/:themeId/duplicate
 * Duplicate a system default theme (for the same game)
 */
app.post('/api/developer/themes/:themeId/duplicate', authenticateDeveloperAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { themeId } = req.params;
    if (!isUUID(themeId)) {
      res.status(400).json({ error: `Invalid theme ID format: ${themeId}` });
      return;
    }
    const { name } = req.body;

    const duplicated = await duplicateSystemTheme(themeId, name);
    res.status(201).json({ theme: duplicated });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * POST /api/developer/themes/:themeId/set-default
 * Mark a system theme as the primary default for its game
 */
app.post('/api/developer/themes/:themeId/set-default', authenticateDeveloperAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { themeId } = req.params;
    if (!isUUID(themeId)) {
      res.status(400).json({ error: `Invalid theme ID format: ${themeId}` });
      return;
    }
    const updatedTheme = await setPrimaryDefaultSystemTheme(themeId);
    res.json({ success: true, theme: updatedTheme });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * POST /api/developer/themes/:themeId/unset-default
 * Remove primary default status from a system theme
 */
app.post('/api/developer/themes/:themeId/unset-default', authenticateDeveloperAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { themeId } = req.params;
    if (!isUUID(themeId)) {
      res.status(400).json({ error: `Invalid theme ID format: ${themeId}` });
      return;
    }
    const updatedTheme = await unsetPrimaryDefaultSystemTheme(themeId);
    res.json({ success: true, theme: updatedTheme });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

// ----------------------------------------------------
// DEVELOPER & ADMIN SHOWCASE REVIEW ENDPOINTS
// ----------------------------------------------------

/**
 * GET /api/developer/showcases (or /api/admin/showcases)
 * List all showcases with event, organization, media stats, and review status
 */
const handleGetAdminShowcases = async (req: AuthenticatedRequest, res: any) => {
  try {
    const showcases = await getAllShowcasesForAdmin();
    res.json({ showcases });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
};

app.get('/api/developer/showcases', authenticateDeveloperAdmin, handleGetAdminShowcases);
app.get('/api/admin/showcases', authenticateDeveloperAdmin, handleGetAdminShowcases);

/**
 * POST /api/developer/showcases/:showcaseId/approve (or /api/admin/showcases/:showcaseId/approve)
 * Approve showcase review, publish it, and idempotently grant RM300 showcase credit
 */
const handleApproveShowcase = async (req: AuthenticatedRequest, res: any) => {
  try {
    const showcaseId = req.params.id || req.params.showcaseId;
    const reviewerId = req.user?.id || 'admin';

    const result = await approveShowcaseReview(showcaseId, reviewerId);
    res.json({
      success: true,
      showcase: result.showcase,
      reward: result.reward,
      alreadyRewarded: result.alreadyRewarded,
      message: result.alreadyRewarded
        ? 'Showcase is approved (reward was already previously granted)'
        : 'Showcase approved successfully and RM300 credit granted to organization',
    });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
};

app.post('/api/developer/showcases/:id/approve', authenticateDeveloperAdmin, handleApproveShowcase);
app.post('/api/developer/showcases/:showcaseId/approve', authenticateDeveloperAdmin, handleApproveShowcase);
app.post('/api/admin/showcases/:id/approve', authenticateDeveloperAdmin, handleApproveShowcase);
app.post('/api/admin/showcases/:showcaseId/approve', authenticateDeveloperAdmin, handleApproveShowcase);

/**
 * POST /api/developer/showcases/:id/reject (or /api/admin/showcases/:id/reject)
 * Reject showcase review with required explanation reason
 */
const handleRejectShowcase = async (req: AuthenticatedRequest, res: any) => {
  try {
    const showcaseId = req.params.id || req.params.showcaseId;
    const reviewerId = req.user?.id || 'admin';
    const { reason, rejection_reason } = req.body;
    const finalReason = rejection_reason || reason;

    if (!finalReason || typeof finalReason !== 'string' || !finalReason.trim()) {
      res.status(422).json({ error: 'Rejection reason is required' });
      return;
    }

    const updatedShowcase = await rejectShowcaseReview(showcaseId, reviewerId, finalReason.trim());
    res.json({
      success: true,
      showcase: updatedShowcase,
      message: 'Showcase rejected with feedback for the organization',
    });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
};

app.post('/api/developer/showcases/:id/reject', authenticateDeveloperAdmin, handleRejectShowcase);
app.post('/api/developer/showcases/:showcaseId/reject', authenticateDeveloperAdmin, handleRejectShowcase);
app.post('/api/admin/showcases/:id/reject', authenticateDeveloperAdmin, handleRejectShowcase);
app.post('/api/admin/showcases/:showcaseId/reject', authenticateDeveloperAdmin, handleRejectShowcase);

// Explicit separated reward routes
app.post('/api/developer/showcases/:id/reward/approve', authenticateDeveloperAdmin, handleApproveShowcase);
app.post('/api/developer/showcases/:showcaseId/reward/approve', authenticateDeveloperAdmin, handleApproveShowcase);
app.post('/api/admin/showcases/:id/reward/approve', authenticateDeveloperAdmin, handleApproveShowcase);
app.post('/api/admin/showcases/:showcaseId/reward/approve', authenticateDeveloperAdmin, handleApproveShowcase);
app.post('/api/developer/showcases/:id/reward/reject', authenticateDeveloperAdmin, handleRejectShowcase);
app.post('/api/developer/showcases/:showcaseId/reward/reject', authenticateDeveloperAdmin, handleRejectShowcase);
app.post('/api/admin/showcases/:id/reward/reject', authenticateDeveloperAdmin, handleRejectShowcase);
app.post('/api/admin/showcases/:showcaseId/reward/reject', authenticateDeveloperAdmin, handleRejectShowcase);

/**
 * POST /api/developer/showcases/:id/review/approve
 * Separate workflow: Approve Admin Event Review (editorial / quality review)
 * Does NOT grant monetary rewards!
 */
const handleApproveEventReview = async (req: AuthenticatedRequest, res: any) => {
  try {
    const showcaseId = req.params.id || req.params.showcaseId;
    const reviewerId = req.user?.id || 'admin';
    const updated = await approveEventReview(showcaseId, reviewerId);
    res.json({
      success: true,
      showcase: updated,
      message: 'Event review approved successfully',
    });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
};

/**
 * POST /api/developer/showcases/:id/review/reject
 * Separate workflow: Reject Admin Event Review (editorial / quality feedback)
 * Does NOT unpublish showcase or affect financial reward!
 */
const handleRejectEventReview = async (req: AuthenticatedRequest, res: any) => {
  try {
    const showcaseId = req.params.id || req.params.showcaseId;
    const reviewerId = req.user?.id || 'admin';
    const { reason, rejection_reason } = req.body;
    const finalReason = rejection_reason || reason;
    if (!finalReason || typeof finalReason !== 'string' || !finalReason.trim()) {
      res.status(422).json({ error: 'Rejection reason is required' });
      return;
    }
    const updated = await rejectEventReview(showcaseId, reviewerId, finalReason.trim());
    res.json({
      success: true,
      showcase: updated,
      message: 'Event review rejected with feedback',
    });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
};

app.post('/api/developer/showcases/:id/review/approve', authenticateDeveloperAdmin, handleApproveEventReview);
app.post('/api/developer/showcases/:showcaseId/review/approve', authenticateDeveloperAdmin, handleApproveEventReview);
app.post('/api/admin/showcases/:id/review/approve', authenticateDeveloperAdmin, handleApproveEventReview);
app.post('/api/admin/showcases/:showcaseId/review/approve', authenticateDeveloperAdmin, handleApproveEventReview);

app.post('/api/developer/showcases/:id/review/reject', authenticateDeveloperAdmin, handleRejectEventReview);
app.post('/api/developer/showcases/:showcaseId/review/reject', authenticateDeveloperAdmin, handleRejectEventReview);
app.post('/api/admin/showcases/:id/review/reject', authenticateDeveloperAdmin, handleRejectEventReview);
app.post('/api/admin/showcases/:showcaseId/review/reject', authenticateDeveloperAdmin, handleRejectEventReview);

/**
 * GET /api/developer/showcases/owner-status/:ownerUserId
 * Check owner showcase reward status
 */
app.get('/api/developer/showcases/owner-status/:ownerUserId', authenticateDeveloperAdmin, async (req: AuthenticatedRequest, res: any) => {
  try {
    const { ownerUserId } = req.params;
    const status = await getOwnerShowcaseRewardStatus(ownerUserId);
    res.json(status);
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * POST /api/developer/showcases/:id/block (or /api/admin/showcases/:id/block)
 * Block showcase for inappropriate content with required moderation reason
 */
const handleBlockShowcase = async (req: AuthenticatedRequest, res: any) => {
  try {
    const showcaseId = req.params.id || req.params.showcaseId;
    const moderatorId = req.user?.id || 'admin';
    const { reason } = req.body;

    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      res.status(422).json({ error: 'Moderation reason is required when blocking a showcase' });
      return;
    }

    const updated = await blockShowcase(showcaseId, moderatorId, reason.trim());
    res.json({
      success: true,
      showcase: updated,
      message: 'Showcase has been blocked and removed from public access.',
    });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
};

app.post('/api/developer/showcases/:id/block', authenticateDeveloperAdmin, handleBlockShowcase);
app.post('/api/developer/showcases/:showcaseId/block', authenticateDeveloperAdmin, handleBlockShowcase);
app.post('/api/admin/showcases/:id/block', authenticateDeveloperAdmin, handleBlockShowcase);
app.post('/api/admin/showcases/:showcaseId/block', authenticateDeveloperAdmin, handleBlockShowcase);

/**
 * POST /api/developer/showcases/:id/unblock (or /api/admin/showcases/:id/unblock)
 * Unblock a previously blocked showcase
 */
const handleUnblockShowcase = async (req: AuthenticatedRequest, res: any) => {
  try {
    const showcaseId = req.params.id || req.params.showcaseId;
    const moderatorId = req.user?.id || 'admin';
    const { reason } = req.body;

    const updated = await unblockShowcase(showcaseId, moderatorId, reason);
    res.json({
      success: true,
      showcase: updated,
      message: 'Showcase has been unblocked and restored to public view.',
    });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
};

app.post('/api/developer/showcases/:id/unblock', authenticateDeveloperAdmin, handleUnblockShowcase);
app.post('/api/developer/showcases/:showcaseId/unblock', authenticateDeveloperAdmin, handleUnblockShowcase);
app.post('/api/admin/showcases/:id/unblock', authenticateDeveloperAdmin, handleUnblockShowcase);
app.post('/api/admin/showcases/:showcaseId/unblock', authenticateDeveloperAdmin, handleUnblockShowcase);

/**
 * DELETE /api/developer/showcases/:id (or /api/admin/showcases/:id)
 * Admin soft delete showcase with moderation reason
 */
const handleAdminDeleteShowcase = async (req: AuthenticatedRequest, res: any) => {
  try {
    const showcaseId = req.params.id || req.params.showcaseId;
    const moderatorId = req.user?.id || 'admin';
    const { reason } = req.body;

    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      res.status(422).json({ error: 'Deletion reason is required for administrative showcase deletion' });
      return;
    }

    const updated = await adminDeleteShowcase(showcaseId, moderatorId, reason.trim());
    res.json({
      success: true,
      showcase: updated,
      message: 'Showcase deleted administratively.',
    });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
};

app.delete('/api/developer/showcases/:id', authenticateDeveloperAdmin, handleAdminDeleteShowcase);
app.delete('/api/developer/showcases/:showcaseId', authenticateDeveloperAdmin, handleAdminDeleteShowcase);
app.delete('/api/admin/showcases/:id', authenticateDeveloperAdmin, handleAdminDeleteShowcase);
app.delete('/api/admin/showcases/:showcaseId', authenticateDeveloperAdmin, handleAdminDeleteShowcase);

// ----------------------------------------------------
// PLATFORM & EVENT PRICING (DEVELOPER ADMIN)
// ----------------------------------------------------

/**
 * GET /api/platform/pricing
 * Retrieve current platform default event pricing configuration (RM1,400 default)
 */
app.get('/api/platform/pricing', async (req, res) => {
  try {
    const settings = await getPlatformPricingSettings();
    res.json(settings);
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * GET /api/developer/pricing/settings (and /api/admin/pricing/settings)
 * Developer Admin: get platform pricing configuration
 */
const handleGetAdminPricingSettings = async (req: AuthenticatedRequest, res: any) => {
  try {
    const settings = await getPlatformPricingSettings();
    res.json({ success: true, settings });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
};

app.get('/api/developer/pricing/settings', authenticateDeveloperAdmin, handleGetAdminPricingSettings);
app.get('/api/admin/pricing/settings', authenticateDeveloperAdmin, handleGetAdminPricingSettings);

/**
 * PUT /api/developer/pricing/settings (and /api/admin/pricing/settings)
 * Developer Admin: update platform default event price and currency
 */
const handleUpdateAdminPricingSettings = async (req: AuthenticatedRequest, res: any) => {
  try {
    const { default_price, default_currency, pricing_rules } = req.body;
    
    let priceNum: number | undefined;
    if (default_price !== undefined) {
      priceNum = Number(default_price);
      if (isNaN(priceNum) || priceNum <= 0) {
        res.status(422).json({ error: 'default_price must be a positive number greater than 0' });
        return;
      }
    }

    const updatedSettings = await updatePlatformPricingSettings(
      {
        default_price: priceNum,
        default_currency: default_currency ? String(default_currency).trim().toUpperCase() : undefined,
        pricing_rules: Array.isArray(pricing_rules) ? pricing_rules : undefined,
      },
      req.user?.id
    );

    res.json({
      success: true,
      settings: updatedSettings,
      message: `Platform pricing settings updated successfully`,
    });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
};

app.put('/api/developer/pricing/settings', authenticateDeveloperAdmin, handleUpdateAdminPricingSettings);
app.put('/api/admin/pricing/settings', authenticateDeveloperAdmin, handleUpdateAdminPricingSettings);
app.post('/api/developer/pricing/settings', authenticateDeveloperAdmin, handleUpdateAdminPricingSettings);

// ----------------------------------------------------
// PLATFORM CONTACT SETTINGS (WHATSAPP, ENQUIRY EMAIL)
// ----------------------------------------------------

/**
 * GET /api/platform/contact-settings
 * Public endpoint: Retrieve current platform WhatsApp, enquiry email, support hours, and office location
 */
app.get('/api/platform/contact-settings', async (req, res) => {
  try {
    const settings = await getPlatformContactSettings();
    res.json({ success: true, settings });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * GET /api/developer/contact-settings (and /api/admin/contact-settings)
 * Developer Admin: retrieve platform contact settings
 */
const handleGetAdminContactSettings = async (req: AuthenticatedRequest, res: any) => {
  try {
    const settings = await getPlatformContactSettings();
    res.json({ success: true, settings });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
};

app.get('/api/developer/contact-settings', authenticateDeveloperAdmin, handleGetAdminContactSettings);
app.get('/api/admin/contact-settings', authenticateDeveloperAdmin, handleGetAdminContactSettings);

/**
 * PUT /api/developer/contact-settings (and /api/admin/contact-settings)
 * Developer Admin: update platform WhatsApp number, display, prefill message, enquiry email, support hours, office location
 */
const handleUpdateAdminContactSettings = async (req: AuthenticatedRequest, res: any) => {
  try {
    const {
      whatsapp_number,
      whatsapp_display,
      whatsapp_prefill_message,
      enquiry_email,
      support_hours,
      office_location,
    } = req.body;

    const updatedSettings = await updatePlatformContactSettings(
      {
        whatsapp_number,
        whatsapp_display,
        whatsapp_prefill_message,
        enquiry_email,
        support_hours,
        office_location,
      },
      req.user?.id
    );

    res.json({
      success: true,
      settings: updatedSettings,
      message: 'Platform contact settings updated successfully',
    });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
};

app.put('/api/developer/contact-settings', authenticateDeveloperAdmin, handleUpdateAdminContactSettings);
app.put('/api/admin/contact-settings', authenticateDeveloperAdmin, handleUpdateAdminContactSettings);
app.post('/api/developer/contact-settings', authenticateDeveloperAdmin, handleUpdateAdminContactSettings);

/**
 * POST /api/contact
 * Public endpoint: Submit an event enquiry or agency contact message.
 * Enforces server-side persistence first, followed by transactional Gmail delivery to eventgamestudio@gmail.com.
 */
app.post('/api/contact', contactRateLimiter, async (req, res) => {
  try {
    const body = req.body || {};

    // 0. Anti-bot honeypot check: If hidden honeypot fields are filled, reject silently
    if (body.website || body.bot_field || body.hp_check) {
      console.warn('[Contact Form] Bot honeypot triggered from IP:', req.ip);
      res.json({
        success: true,
        ticketId: 'EGS-BOTPREVENTED',
        emailDelivered: false,
        message: 'Thank you! Your enquiry has been received.',
      });
      return;
    }

    // 1. Input sanitization & validation
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
      res.status(400).json({ error: 'Please enter a valid full name (2 to 100 characters).' });
      return;
    }

    const emailRegex = /^[^\s@\r\n]+@[^\s@\r\n]+\.[^\s@\r\n]+$/;
    if (!rawEmail || !emailRegex.test(rawEmail) || rawEmail.length > 254 || rawEmail.includes('\r') || rawEmail.includes('\n')) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }

    if (!rawMessage || rawMessage.length < 10 || rawMessage.length > 3000) {
      res.status(400).json({ error: 'Please enter a message between 10 and 3,000 characters.' });
      return;
    }

    // 2. Step 1: Database persistence FIRST
    let enquiry;
    try {
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
        ip_address: req.ip || (req.headers['x-forwarded-for'] as string) || null,
        user_agent: (req.headers['user-agent'] as string) || null,
      });
    } catch (persistErr: any) {
      console.error('[Contact Enquiry] Database persistence error:', persistErr);
      res.status(500).json({
        error: 'Unable to save your enquiry at this time. Please try again or reach out directly on WhatsApp.',
      });
      return;
    }

    // If an existing enquiry with this idempotency key was already delivered, return immediately
    if (enquiry.email_status === 'sent') {
      res.json({
        success: true,
        enquiryId: enquiry.id,
        ticketId: enquiry.ticket_id,
        emailDelivered: true,
        message: 'Thank you! Your enquiry has been received. Our team will contact you shortly.',
      });
      return;
    }

    // 3. Step 2: Attempt Gmail delivery to the authoritative recipient (eventgamestudio@gmail.com)
    const recipientEmail = getContactNotificationRecipientEmail();
    let emailDelivered = false;

    try {
      const gmailSettings = await getGoogleMailSettings();

      if (!gmailSettings || !gmailSettings.email_address || gmailSettings.status !== 'connected' || !gmailSettings.enabled) {
        console.warn(`[Contact Enquiry ${enquiry.ticket_id}] Gmail integration not connected or active (status: ${gmailSettings?.status || 'none'}). Skipping email send.`);
        await updateContactEnquiryEmailStatus(enquiry.id, 'not_configured', {
          emailError: 'Gmail integration not connected or inactive',
        });
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

        console.log(`[Contact Enquiry ${enquiry.ticket_id}] Sending notification to ${recipientEmail} with reply-to ${enquiry.email}...`);

        const sendResult = await sendEmailViaGmail({
          to: recipientEmail,
          replyTo: enquiry.email,
          fromName: 'Event Game Studio',
          subject: template.subject,
          html: template.html,
          text: template.text,
        });

        await updateContactEnquiryEmailStatus(enquiry.id, 'sent', {
          emailMessageId: sendResult.messageId,
          emailSentAt: new Date().toISOString(),
        });
        emailDelivered = true;
        console.log(`[Contact Enquiry ${enquiry.ticket_id}] Email delivered successfully. Message ID: ${sendResult.messageId}`);
      }
    } catch (emailErr: any) {
      console.error(`[Contact Enquiry ${enquiry.ticket_id}] Failed to send email via Gmail API:`, emailErr);
      await updateContactEnquiryEmailStatus(enquiry.id, 'failed', {
        emailError: emailErr.message || 'Unknown Gmail API error',
      });
      emailDelivered = false;
    }

    // 4. Return success with server-confirmed ticket ID
    res.json({
      success: true,
      enquiryId: enquiry.id,
      ticketId: enquiry.ticket_id,
      emailDelivered,
      message: 'Thank you! Your enquiry has been received. Our team will contact you shortly.',
    });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * GET /api/developer/contact-enquiries
 * Developer Admin: List all persisted contact enquiries with pagination and status
 */
app.get(['/api/developer/contact-enquiries', '/api/admin/contact-enquiries'], authenticateDeveloperAdmin, async (req: AuthenticatedRequest, res: any) => {
  try {
    const page = parseInt(req.query.page as string, 10) || 1;
    const pageSize = parseInt(req.query.pageSize as string, 10) || 20;
    const search = req.query.search as string;
    const status = req.query.status as any;
    const emailStatus = req.query.emailStatus as any;

    const result = await listContactEnquiries({ page, pageSize, search, status, emailStatus });
    res.json(result);
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * GET /api/developer/events (and /api/admin/events)
 * Developer Admin: list all events across the platform with pricing and payment details
 */
const handleGetAllAdminEvents = async (req: AuthenticatedRequest, res: any) => {
  try {
    const events = await getAllAdminEvents();
    res.json({ success: true, events });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
};

app.get('/api/developer/events', authenticateDeveloperAdmin, handleGetAllAdminEvents);
app.get('/api/admin/events', authenticateDeveloperAdmin, handleGetAllAdminEvents);

/**
 * PUT /api/developer/events/:eventId/pricing (and /api/admin/events/:eventId/pricing)
 * Developer Admin: update specific event's custom price and currency
 */
const handleUpdateEventPricing = async (req: AuthenticatedRequest, res: any) => {
  try {
    const { eventId } = req.params;
    const { event_price, event_currency } = req.body;

    const priceNum = Number(event_price);
    if (isNaN(priceNum) || priceNum <= 0) {
      res.status(422).json({ error: 'event_price must be a positive number greater than 0' });
      return;
    }

    const updatedEvent = await updateEventPrice(
      eventId,
      {
        event_price: priceNum,
        event_currency: event_currency ? String(event_currency).trim().toUpperCase() : 'MYR',
      },
      req.user?.id
    );

    res.json({
      success: true,
      event: updatedEvent,
      message: `Event price updated to ${updatedEvent.event_currency || 'MYR'} ${(updatedEvent.event_price || priceNum).toFixed(2)}`,
    });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
};

app.put('/api/developer/events/:eventId/pricing', authenticateDeveloperAdmin, handleUpdateEventPricing);
app.patch('/api/developer/events/:eventId/pricing', authenticateDeveloperAdmin, handleUpdateEventPricing);
app.put('/api/admin/events/:eventId/pricing', authenticateDeveloperAdmin, handleUpdateEventPricing);
app.patch('/api/admin/events/:eventId/pricing', authenticateDeveloperAdmin, handleUpdateEventPricing);

/**
 * POST /api/developer/events/:eventId/reactivate (and /api/admin/events/:eventId/reactivate)
 * Developer Admin: Manual status override / reactivate event
 */
const handleReactivateAdminEvent = async (req: AuthenticatedRequest, res: any) => {
  try {
    const { eventId } = req.params;
    const { reason } = req.body;

    const event = await reactivateEvent(eventId, {
      adminUserId: req.user?.id,
      reason: reason || 'Developer admin manual reactivation',
    });

    res.json({
      success: true,
      event,
      message: `Event "${event.name}" successfully reactivated to ${event.event_status} status.`,
    });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
};

app.post('/api/developer/events/:eventId/reactivate', authenticateDeveloperAdmin, handleReactivateAdminEvent);
app.post('/api/admin/events/:eventId/reactivate', authenticateDeveloperAdmin, handleReactivateAdminEvent);

/**
 * POST /api/developer/events/maintenance (and /api/admin/events/maintenance)
 * Developer Admin: Manually trigger event lifecycle maintenance worker
 */
const handleRunEventMaintenance = async (req: AuthenticatedRequest, res: any) => {
  try {
    const result = await runEventLifecycleMaintenance();
    res.json({
      success: true,
      result,
      message: `Maintenance complete: ${result.expiredCount} unpaid expired events marked expired, ${result.completedCount} expired paid events marked completed.`,
    });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
};

app.post('/api/developer/events/maintenance', authenticateDeveloperAdmin, handleRunEventMaintenance);
app.post('/api/admin/events/maintenance', authenticateDeveloperAdmin, handleRunEventMaintenance);

// ----------------------------------------------------
// DEVELOPER ADMIN ORGANIZATIONS ENDPOINTS
// ----------------------------------------------------

/**
 * GET /api/developer/organizations
 * Retrieve all organizations with aggregated info (member count, event count, wallet balances)
 */
app.get('/api/developer/organizations', authenticateDeveloperAdmin, async (req: AuthenticatedRequest, res: any) => {
  try {
    const organizations = await getAllOrganizationsForDeveloper();
    res.json({ success: true, organizations });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * GET /api/developer/organizations/:orgId
 * Retrieve organization detail for developer admin (organization, owner, members, wallet, events, recent_transactions)
 */
app.get('/api/developer/organizations/:orgId', authenticateDeveloperAdmin, async (req: AuthenticatedRequest, res: any) => {
  try {
    const { orgId } = req.params;
    const detail = await getOrganizationDetailForDeveloper(orgId);
    if (!detail) {
      res.status(404).json({ error: 'Organization not found' });
      return;
    }
    res.json({
      success: true,
      ...detail,
    });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * POST /api/developer/organizations/:orgId/wallet/recalculate
 * Re-synchronize and verify organization wallet balances with immutable ledger
 */
app.post('/api/developer/organizations/:orgId/wallet/recalculate', authenticateDeveloperAdmin, async (req: AuthenticatedRequest, res: any) => {
  try {
    const { orgId } = req.params;
    const summary = await recalculateWalletBalances(orgId);
    res.json({
      success: true,
      message: 'Wallet balances successfully recalculated and synchronized with ledger.',
      wallet: summary,
    });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

// ----------------------------------------------------
// WALLET ENGINE & TRANSACTION LEDGER ENDPOINTS
// ----------------------------------------------------

/**
 * GET /api/organizations/:orgId/wallet
 * Retrieve full wallet balance breakdown (paid balance, welcome credit, showcase credit, top-up credit)
 */
app.get('/api/organizations/:orgId/wallet', authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const { orgId } = req.params;
    if (!isUUID(orgId)) {
      res.status(400).json({ error: `Invalid organization ID format: ${orgId}` });
      return;
    }

    const { isMember } = await verifyOrgMembershipAndPermission(req.user!.id, orgId);
    const isDev = isUserDeveloperAdmin(req.user);
    if (!isMember && !isDev) {
      res.status(403).json({ error: 'Access denied to organization wallet' });
      return;
    }

    const wallet = await getWalletBalance(orgId);
    let standardEventPrice: number | undefined;
    try {
      const settings = await getPlatformPricingSettings();
      standardEventPrice = settings.default_price;
    } catch {
      // ignore
    }
    res.json({
      wallet,
      standard_event_price: standardEventPrice,
    });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * GET /api/organizations/:orgId/wallet/transactions
 * Retrieve immutable transaction ledger history
 */
app.get('/api/organizations/:orgId/wallet/transactions', authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const { orgId } = req.params;
    if (!isUUID(orgId)) {
      res.status(400).json({ error: `Invalid organization ID format: ${orgId}` });
      return;
    }

    const { isMember } = await verifyOrgMembershipAndPermission(req.user!.id, orgId);
    const isDev = isUserDeveloperAdmin(req.user);
    if (!isMember && !isDev) {
      res.status(403).json({ error: 'Access denied to wallet transactions' });
      return;
    }

    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const offset = Math.max(0, parseInt(req.query.offset as string) || 0);
    const balanceType = req.query.balance_type as any;
    const transactionType = req.query.transaction_type as any;
    const filterGroup = (req.query.filter || req.query.filter_group || req.query.type) as string;
    const startDate = req.query.start_date as string;
    const endDate = req.query.end_date as string;
    const search = req.query.search as string;

    const result = await getWalletTransactions(orgId, {
      limit,
      offset,
      balanceType,
      transactionType,
      filterGroup,
      startDate,
      endDate,
      search,
    });

    res.json(result);
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * GET /api/organizations/:orgId/wallet/audit-trail
 * Retrieve complete immutable audit event log for the organization
 */
app.get('/api/organizations/:orgId/wallet/audit-trail', authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const { orgId } = req.params;
    if (!isUUID(orgId)) {
      res.status(400).json({ error: `Invalid organization ID format: ${orgId}` });
      return;
    }

    const { isMember, role } = await verifyOrgMembershipAndPermission(req.user!.id, orgId);
    const isDev = isUserDeveloperAdmin(req.user);
    if ((!isMember || (role !== 'owner' && role !== 'admin')) && !isDev) {
      res.status(403).json({ error: 'Access denied: Only organization owners and admins can view the wallet audit trail' });
      return;
    }

    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const offset = Math.max(0, parseInt(req.query.offset as string) || 0);
    const eventType = req.query.event_type as any;

    const result = await getWalletAuditTrail(orgId, { limit, offset, eventType });
    res.json(result);
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * POST /api/organizations/:orgId/wallet/topup
 * DIRECT MUTATION DISABLED FOR PRODUCTION SECURITY:
 * Direct wallet crediting is prohibited. All wallet top-ups must be initiated as Top-up Orders
 * and settled through verified payment provider webhooks or privileged developer reconciliation.
 */
app.post('/api/organizations/:orgId/wallet/topup', walletRateLimiter, authenticateJWT, async (req: AuthenticatedRequest, res) => {
  res.status(403).json({
    error: 'Direct wallet top-up is disabled. All wallet top-ups must be created as Top-up Orders and settled through verified payment processing.',
    code: 'TOPUP_SETTLEMENT_FORBIDDEN',
  });
});

/**
 * GET /api/organizations/:orgId/wallet/topup/quote
 * Dynamically calculate promotional top-up bonus and order preview using Wallet Engine rules
 */
app.get('/api/organizations/:orgId/wallet/topup/quote', authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const { orgId } = req.params;
    if (!isUUID(orgId)) {
      res.status(400).json({ error: `Invalid organization ID format: ${orgId}` });
      return;
    }

    const { isMember } = await verifyOrgMembershipAndPermission(req.user!.id, orgId);
    const isDev = isUserDeveloperAdmin(req.user);
    if (!isMember && !isDev) {
      res.status(403).json({ error: 'Access denied to organization wallet' });
      return;
    }

    const amount = Number(req.query.amount) || 0;
    const currency = (req.query.currency as string) || 'MYR';

    const quote = await getTopupQuote({
      organizationId: orgId,
      amount,
      currency,
    });

    res.json(quote);
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * POST /api/wallet/topups
 * POST /api/organizations/:orgId/wallet/topup-orders
 * Create a new Top Up Order in PENDING status.
 *
 * PHASE 3 FINANCIAL RULE:
 * Creating a Top Up Order ALWAYS sets status to PENDING and NEVER credits the wallet.
 */
const handleCreateTopupOrder = async (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const orgId = req.params.orgId || req.body.organization_id || req.body.organizationId;
    if (!orgId || !isUUID(orgId)) {
      res.status(400).json({ error: `Valid organization ID (UUID) is required` });
      return;
    }

    // STRICT ORGANIZATION ISOLATION: Verify requester is owner/admin of target organization
    const { isMember, role } = await verifyOrgMembershipAndPermission(req.user!.id, orgId);
    const isDev = isUserDeveloperAdmin(req.user);
    if ((!isMember || (role !== 'owner' && role !== 'admin')) && !isDev) {
      res.status(403).json({ error: 'Only organization owners and admins can create top-up orders' });
      return;
    }

    const { amount, currency, notes, payment_reference, paymentReference, payment_method, paymentMethod, metadata } = req.body;
    const numericAmount = Number(amount);

    if (isNaN(numericAmount) || numericAmount <= 0) {
      res.status(400).json({ error: 'Top-up amount must be a positive number greater than 0' });
      return;
    }

    const requestedPaymentMethod = payment_method || paymentMethod;
    if (requestedPaymentMethod && !isPaymentMethodSupported(requestedPaymentMethod)) {
      res.status(400).json({
        error: `Payment method '${requestedPaymentMethod}' is not supported. Currently supported payment methods: ${SUPPORTED_PAYMENT_METHODS.map((m) => m.id).join(', ')}.`,
        code: 'UNSUPPORTED_PAYMENT_METHOD',
        supported_methods: SUPPORTED_PAYMENT_METHODS.map((m) => m.id),
      });
      return;
    }

    const order = await createTopupOrder({
      organizationId: orgId,
      userId: req.user!.id,
      amount: numericAmount,
      currency: currency || 'MYR',
      paymentReference: payment_reference || paymentReference,
      paymentMethod: payment_method || paymentMethod,
      notes,
      metadata,
    });

    res.status(201).json({
      order,
      message: 'Top-up order created successfully in PENDING status. No wallet balance credited.',
    });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
};

app.post('/api/wallet/topups', walletRateLimiter, authenticateJWT, handleCreateTopupOrder);
app.post('/api/organizations/:orgId/wallet/topup-orders', walletRateLimiter, authenticateJWT, handleCreateTopupOrder);

/**
 * GET /api/wallet/topups/:id
 * GET /api/organizations/:orgId/wallet/topup-orders/:id
 * Retrieve a Top Up Order by ID with organization access validation.
 */
const handleGetTopupOrder = async (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const routeOrgId = req.params.orgId;
    const rawOrderId = req.params.id || req.params.orderId;
    const sessionIdQuery = (req.query.session_id as string) || (req.query.sessionId as string);
    const statusQuery = req.query.status as string;

    let order: TopupOrderRecord | null = null;
    if (rawOrderId && rawOrderId !== 'undefined' && rawOrderId !== 'null' && rawOrderId !== 'lookup' && rawOrderId !== 'by-session') {
      order = await getTopupOrderById(rawOrderId);
    }

    // Step 3 Fallback lookup by session_id when order_id is missing or not found
    if (!order && sessionIdQuery) {
      // 1. Direct database reference lookup
      order = await findTopupOrderByReference(sessionIdQuery);

      // 2. Stripe Checkout Session server-side retrieval and metadata order_id extraction
      if (!order && sessionIdQuery.startsWith('cs_') && !sessionIdQuery.startsWith('cs_egs_')) {
        const stripe = getStripeClient();
        if (stripe) {
          try {
            const stripeSession = await stripe.checkout.sessions.retrieve(sessionIdQuery);
            const trustedOrderId =
              stripeSession.metadata?.order_id ||
              stripeSession.metadata?.orderId;
            if (trustedOrderId) {
              order = await getTopupOrderById(trustedOrderId);
            }
          } catch (stripeErr: any) {
            console.warn(`[Get Topup Order] Failed to retrieve Stripe session ${sessionIdQuery}:`, stripeErr.message);
          }
        }
      }
    }

    if (!order) {
      res.status(404).json({ error: 'Top-up order not found' });
      return;
    }

    // STRICT ORGANIZATION ISOLATION: User must belong to the order's organization
    if (routeOrgId && routeOrgId !== order.organization_id) {
      res.status(403).json({ error: 'Organization mismatch on top-up order' });
      return;
    }

    const { isMember } = await verifyOrgMembershipAndPermission(req.user!.id, order.organization_id);
    const isDev = isUserDeveloperAdmin(req.user);
    if (!isMember && !isDev) {
      res.status(403).json({ error: 'Access denied to this top-up order' });
      return;
    }

    // If order is PENDING, synchronize expiration / timeout status (including Stripe Checkout expiration & reconciliation)
    if (order.status === 'PENDING') {
      order = await syncTopupOrderExpiration(order, { sessionId: sessionIdQuery, status: statusQuery });
    }

    res.json({ order });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
};

app.get('/api/wallet/topups/:id', authenticateJWT, handleGetTopupOrder);
app.get('/api/organizations/:orgId/wallet/topup-orders/:id', authenticateJWT, handleGetTopupOrder);

/**
 * GET /api/wallet/topups
 * GET /api/organizations/:orgId/wallet/topup-orders
 * List all top-up orders for an organization.
 */
const handleListTopupOrders = async (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const orgId = req.params.orgId || (req.query.organization_id as string) || (req.query.orgId as string);
    if (!orgId || !isUUID(orgId)) {
      res.status(400).json({ error: 'Valid organization ID (UUID) is required' });
      return;
    }

    const { isMember } = await verifyOrgMembershipAndPermission(req.user!.id, orgId);
    const isDev = isUserDeveloperAdmin(req.user);
    if (!isMember && !isDev) {
      res.status(403).json({ error: 'Access denied to organization top-up orders' });
      return;
    }

    const orders = await listTopupOrdersByOrganization(orgId);
    res.json({ orders });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
};

app.get('/api/wallet/topups', authenticateJWT, handleListTopupOrders);
app.get('/api/organizations/:orgId/wallet/topup-orders', authenticateJWT, handleListTopupOrders);

/**
 * POST /api/wallet/topups/:id/process-status
 * POST /api/organizations/:orgId/wallet/topup-orders/:id/process-status
 * POST /api/wallet/topups/:id/status
 *
 * Process a top-up order status transition.
 *
 * LIFECYCLE & SECURITY RULES:
 * 1. Normal organization users (owner, admin, member) CANNOT manually transition an order to PAID.
 * 2. Status 'PAID' can ONLY be set by verified payment provider webhooks or privileged developer manual reconciliation.
 * 3. Normal organization owners/admins can only cancel ('CANCELLED') their own pending top-up orders.
 */
const handleProcessTopupStatus = async (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const orderId = req.params.id || req.params.orderId;
    if (!orderId) {
      res.status(400).json({ error: 'Order ID is required' });
      return;
    }

    const order = await getTopupOrderById(orderId);
    if (!order) {
      res.status(404).json({ error: 'Top-up order not found' });
      return;
    }

    // STRICT ORGANIZATION ISOLATION: Requester must be owner/admin of the order's organization or developer admin
    const { isMember, role } = await verifyOrgMembershipAndPermission(req.user!.id, order.organization_id);
    const isDev = isUserDeveloperAdmin(req.user);
    if ((!isMember || (role !== 'owner' && role !== 'admin')) && !isDev) {
      res.status(403).json({ error: 'Only organization owners and admins can update top-up order status' });
      return;
    }

    const { status, reason, metadata } = req.body;

    // CRITICAL SECURITY RULE: Block manual PAID status changes by public/org endpoints
    if (status === 'PAID') {
      await recordWalletAuditEvent({
        organizationId: order.organization_id,
        eventType: 'UNAUTHORIZED_TOPUP_SETTLEMENT_ATTEMPT',
        orderId: order.id,
        actorId: req.user!.id,
        metadata: {
          attempted_status: status,
          endpoint: req.originalUrl || req.path,
          result: 'FORBIDDEN',
        },
      });

      res.status(403).json({
        error: 'Manual status transition to PAID is forbidden. Top-up orders can only be marked as PAID via verified payment provider webhooks or developer reconciliation.',
        code: 'TOPUP_SETTLEMENT_FORBIDDEN',
      });
      return;
    }

    // Organization users may only cancel their own pending top-up orders
    if (status !== 'CANCELLED') {
      res.status(400).json({
        error: `Invalid status transition: Only 'CANCELLED' is permitted for client-initiated order updates. Provided: ${status}`,
        code: 'INVALID_STATUS_TRANSITION',
      });
      return;
    }

    const result = await processTopupOrderStatus({
      orderId,
      newStatus: 'CANCELLED',
      processedBy: req.user!.id,
      reason: reason || 'Cancelled by organization user',
      metadata,
    });

    res.json(result);
  } catch (err: any) {
    handleApiError(err, req, res);
  }
};

app.post('/api/wallet/topups/:id/process-status', walletRateLimiter, authenticateJWT, handleProcessTopupStatus);
app.post('/api/wallet/topups/:id/status', walletRateLimiter, authenticateJWT, handleProcessTopupStatus);
app.post('/api/organizations/:orgId/wallet/topup-orders/:id/process-status', walletRateLimiter, authenticateJWT, handleProcessTopupStatus);

/**
 * POST /api/wallet/topups/:id/checkout
 * POST /api/organizations/:orgId/wallet/topup-orders/:id/checkout
 *
 * PHASE 4 PAYMENT PROVIDER INTEGRATION:
 * Create a secure payment session / checkout session for a PENDING Top Up Order.
 */
const handleCreateCheckoutSession = async (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const orderId = req.params.id || req.params.orderId;
    if (!orderId) {
      res.status(400).json({ error: 'Order ID is required' });
      return;
    }

    const order = await getTopupOrderById(orderId);
    if (!order) {
      res.status(404).json({ error: 'Top-up order not found' });
      return;
    }

    // STRICT ORGANIZATION ISOLATION: Requester must be owner/admin of the order's organization
    const { isMember, role } = await verifyOrgMembershipAndPermission(req.user!.id, order.organization_id);
    const isDev = isUserDeveloperAdmin(req.user);
    if ((!isMember || (role !== 'owner' && role !== 'admin')) && !isDev) {
      res.status(403).json({ error: 'Only organization owners and admins can checkout top-up orders' });
      return;
    }

    if (order.status !== 'PENDING') {
      res.status(400).json({
        error: `Cannot create payment session for order with status ${order.status}. Only PENDING orders can be checked out.`,
      });
      return;
    }

    const origin = (req.headers.origin as string) || `http://${req.headers.host}`;
    const session = await createPaymentSession({
      order,
      originUrl: origin,
      customerEmail: req.user?.email,
    });

    res.json({
      success: true,
      session,
      checkoutUrl: session.checkoutUrl,
      sessionId: session.sessionId,
    });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
};

app.post('/api/wallet/topups/:id/checkout', walletRateLimiter, authenticateJWT, handleCreateCheckoutSession);
app.post('/api/organizations/:orgId/wallet/topup-orders/:id/checkout', walletRateLimiter, authenticateJWT, handleCreateCheckoutSession);

/**
 * GET /api/payment/methods
 * GET /api/wallet/payment-methods
 * GET /api/organizations/:orgId/wallet/payment-methods
 * Authoritative list of supported payment methods.
 */
const handleGetPaymentMethods = (_req: express.Request, res: express.Response) => {
  res.json({
    payment_methods: getSupportedPaymentMethods(),
    supported_methods: SUPPORTED_PAYMENT_METHODS.map((m) => m.id),
  });
};

app.get('/api/payment/methods', handleGetPaymentMethods);
app.get('/api/wallet/payment-methods', handleGetPaymentMethods);
app.get('/api/organizations/:orgId/wallet/payment-methods', handleGetPaymentMethods);

/**
 * POST /api/webhooks/payment
 * POST /api/wallet/webhooks/payment
 *
 * SECURE PAYMENT PROVIDER WEBHOOK ENDPOINT
 *
 * CRITICAL LIFECYCLE & SECURITY RULES:
 * 1. Verify the provider signature (HMAC-SHA256).
 * 2. Find the corresponding Top Up Order in DB.
 * 3. Verify amount, currency, and organization match server record.
 * 4. Check current order status.
 * 5. Process PAID only once (Atomic & Idempotent).
 * 6. Create wallet ledger entries (Separate Paid Balance + Top-up Credit).
 * 7. Mark the order as PAID.
 * 8. Return HTTP 200 { received: true }.
 */
const handlePaymentWebhook = async (req: express.Request, res: express.Response) => {
  try {
    const rawBody = (req as any).rawBody || JSON.stringify(req.body);
    const signature =
      (req.headers['stripe-signature'] as string) ||
      (req.headers['x-signature'] as string) ||
      (req.headers['x-provider-signature'] as string) ||
      (req.headers['x-hub-signature-256'] as string);

    const result = await verifyAndProcessPaymentWebhook({
      rawBody,
      signature,
      headers: req.headers as any,
    });

    res.status(200).json({
      received: true,
      success: result.success,
      isDuplicate: result.isDuplicate,
      status: result.status,
      orderId: result.orderId,
      message: result.message,
    });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
};

app.post('/api/webhooks/payment', handlePaymentWebhook);
app.post('/api/webhooks/stripe', handlePaymentWebhook);
app.post('/api/wallet/webhooks/payment', handlePaymentWebhook);
app.post('/api/wallet/webhooks/stripe', handlePaymentWebhook);

/**
 * POST /api/developer/wallet/test-webhook
 * Simulate payment provider webhook dispatch for developer/admin testing sandbox.
 * CRITICAL SECURITY: Strictly developer-admin only and disabled in production environments.
 */
app.post('/api/developer/wallet/test-webhook', authenticateDeveloperAdmin, async (req: AuthenticatedRequest, res: express.Response) => {
  try {
    // Completely disabled in production environments
    if (process.env.NODE_ENV === 'production') {
      res.status(403).json({
        error: 'Forbidden: Test webhook simulation is disabled in production environments.',
        code: 'TEST_WEBHOOK_DISABLED_IN_PRODUCTION',
      });
      return;
    }

    const { orderId, eventType = 'payment.succeeded', failureReason } = req.body;
    if (!orderId) {
      res.status(400).json({ error: 'orderId is required' });
      return;
    }

    const order = await getTopupOrderById(orderId);
    if (!order) {
      res.status(404).json({ error: 'Top-up order not found' });
      return;
    }

    const secret = getPaymentWebhookSecret();
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
    });

    res.json({
      success: true,
      simulation: true,
      result,
    });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * POST /api/developer/wallet/topups/:id/reconcile
 * Developer Admin Manual Payment Reconciliation.
 * Strictly requires reason, external payment reference, and developer admin privileges.
 */
app.post('/api/developer/wallet/topups/:id/reconcile', authenticateJWT, authenticateDeveloperAdmin, async (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const orderId = req.params.id;
    if (!orderId) {
      res.status(400).json({ error: 'Order ID is required' });
      return;
    }

    const { reason, payment_reference, paymentReference, payment_method, paymentMethod, metadata } = req.body;

    const ref = payment_reference || paymentReference;
    if (!ref || typeof ref !== 'string' || ref.trim().length === 0) {
      res.status(400).json({
        error: 'External payment reference is required for manual reconciliation',
        code: 'PAYMENT_REFERENCE_REQUIRED',
      });
      return;
    }

    if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
      res.status(400).json({
        error: 'Explicit reconciliation reason (minimum 5 characters) is required',
        code: 'RECONCILIATION_REASON_REQUIRED',
      });
      return;
    }

    const result = await reconcileTopupOrder({
      orderId,
      paymentReference: ref.trim(),
      paymentMethod: payment_method || paymentMethod || 'MANUAL_RECONCILIATION',
      reconciledBy: req.user!.id,
      reason: reason.trim(),
      metadata,
    });

    res.json({
      success: true,
      reconciled: true,
      ...result,
    });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * POST /api/organizations/:orgId/wallet/topup/prepare-order
 * Legacy & Phase 2 preview endpoint (creates persistent PENDING order).
 */
app.post('/api/organizations/:orgId/wallet/topup/prepare-order', walletRateLimiter, authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const { orgId } = req.params;
    if (!isUUID(orgId)) {
      res.status(400).json({ error: `Invalid organization ID format: ${orgId}` });
      return;
    }

    const { isMember, role } = await verifyOrgMembershipAndPermission(req.user!.id, orgId);
    const isDev = isUserDeveloperAdmin(req.user);
    if ((!isMember || (role !== 'owner' && role !== 'admin')) && !isDev) {
      res.status(403).json({ error: 'Only organization owners and admins can prepare top-up orders' });
      return;
    }

    const { amount, currency, notes } = req.body;
    const numericAmount = Number(amount);

    if (isNaN(numericAmount) || numericAmount <= 0) {
      res.status(400).json({ error: 'Top-up amount must be a positive number greater than 0' });
      return;
    }

    const result = await preparePendingTopupOrder({
      organizationId: orgId,
      amount: numericAmount,
      currency: currency || 'MYR',
      createdBy: req.user!.id,
      notes,
    });

    res.status(201).json(result);
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * GET /api/organizations/:orgId/wallet/topup/orders/:orderId
 * Retrieve order details
 */
app.get('/api/organizations/:orgId/wallet/topup/orders/:orderId', authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const { orgId, orderId } = req.params;
    if (!isUUID(orgId)) {
      res.status(400).json({ error: `Invalid organization ID format: ${orgId}` });
      return;
    }

    const { isMember } = await verifyOrgMembershipAndPermission(req.user!.id, orgId);
    const isDev = isUserDeveloperAdmin(req.user);
    if (!isMember && !isDev) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const order = await getTopupOrderById(orderId);
    if (!order || order.organization_id !== orgId) {
      res.status(404).json({ error: 'Top-up order not found' });
      return;
    }

    res.json({ order });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * POST /api/organizations/:orgId/wallet/grant-welcome
 * Developer Admin endpoint to grant promotional Welcome Credit (RM800.00).
 * Automatic Welcome Credit on organization creation is discontinued; this endpoint
 * is restricted to verified developer admins for promotional campaigns or manual grants.
 */
app.post('/api/organizations/:orgId/wallet/grant-welcome', walletRateLimiter, authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const { orgId } = req.params;
    if (!isUUID(orgId)) {
      res.status(400).json({ error: `Invalid organization ID format: ${orgId}` });
      return;
    }

    const isDev = isUserDeveloperAdmin(req.user);
    if (!isDev) {
      res.status(403).json({ error: 'Automatic welcome credit upon organization creation is discontinued. Promotional grants are restricted to system administrators.' });
      return;
    }

    const org = await getOrganizationById(orgId);
    if (!org) {
      res.status(404).json({ error: 'Organization not found' });
      return;
    }

    const result = await grantWelcomeCredit({
      organizationId: orgId,
      userId: org.owner_id,
      createdBy: req.user!.id,
      referenceId: req.body?.reference_id,
      metadata: req.body?.metadata,
    });

    res.json({
      success: !result.alreadyGranted && !result.notEligible,
      transaction: result.transaction,
      wallet: result.wallet,
      already_granted: result.alreadyGranted,
      not_eligible: Boolean(result.notEligible),
      message: result.message,
    });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * GET /api/organizations/:orgId/rewards/eligibility
 * Check promotion eligibility (Welcome Credit & Showcase Reward) for the authenticated user.
 * Strictly enforces owner-only eligibility with one-time account lifetime limits.
 */
app.get('/api/organizations/:orgId/rewards/eligibility', authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const { orgId } = req.params;
    if (!isUUID(orgId)) {
      res.status(400).json({ error: `Invalid organization ID format: ${orgId}` });
      return;
    }

    const userId = req.user!.id;
    const { isMember } = await verifyOrgMembershipAndPermission(userId, orgId);
    const isDev = isUserDeveloperAdmin(req.user);
    if (!isMember && !isDev) {
      res.status(403).json({ error: 'Access denied: Must be a member of the organization.' });
      return;
    }

    const welcomeEligibility = await evaluatePromotionEligibility({
      userId,
      organizationId: orgId,
      rewardType: 'WELCOME_CREDIT',
    });

    const showcaseEligibility = await evaluatePromotionEligibility({
      userId,
      organizationId: orgId,
      rewardType: 'SHOWCASE_REWARD',
    });

    res.json({
      is_owner: welcomeEligibility.isOwner,
      welcome_credit: welcomeEligibility,
      showcase_reward: showcaseEligibility,
    });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * GET /api/organizations/:orgId/wallet/can-use-welcome
 * Check if the organization has sufficient Welcome Credit + Paid Balance for an event
 */
app.get('/api/organizations/:orgId/wallet/can-use-welcome', authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const { orgId } = req.params;
    if (!isUUID(orgId)) {
      res.status(400).json({ error: `Invalid organization ID format: ${orgId}` });
      return;
    }

    const { isMember } = await verifyOrgMembershipAndPermission(req.user!.id, orgId);
    const isDev = isUserDeveloperAdmin(req.user);
    if (!isMember && !isDev) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const eventId = req.query.eventId as string | undefined;
    const eligibility = await canUseWelcomeCredit(orgId, eventId);
    res.json(eligibility);
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * POST /api/organizations/:orgId/wallet/consume-welcome
 * Consume Welcome Credit (RM800) and Paid Balance (RM600) for an Event
 */
app.post('/api/organizations/:orgId/wallet/consume-welcome', walletRateLimiter, authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const { orgId } = req.params;
    if (!isUUID(orgId)) {
      res.status(400).json({ error: `Invalid organization ID format: ${orgId}` });
      return;
    }

    const { isMember, role } = await verifyOrgMembershipAndPermission(req.user!.id, orgId);
    const isDev = isUserDeveloperAdmin(req.user);
    if ((!isMember || (role !== 'owner' && role !== 'admin')) && !isDev) {
      res.status(403).json({ error: 'Only organization owners and admins can consume welcome credit' });
      return;
    }

    const { event_id, reference_id, description, metadata } = req.body;
    if (!event_id) {
      res.status(400).json({ error: 'Event ID is required' });
      return;
    }

    const result = await consumeWelcomeCredit({
      organizationId: orgId,
      eventId: event_id,
      referenceId: reference_id,
      createdBy: req.user!.id,
      description,
      metadata,
    });

    res.json(result);
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * POST /api/organizations/:orgId/wallet/grant-showcase
 * DEVELOPER ADMIN ONLY: Grant one-time Showcase Credit (RM300.00).
 * Organizers CANNOT directly claim showcase credit.
 * Normal showcase rewards must follow the strict workflow:
 * Showcase -> Eligibility Engine -> AWAITING_APPROVAL -> Developer Admin Approval -> RM300 Wallet Credit.
 */
app.post('/api/organizations/:orgId/wallet/grant-showcase', walletRateLimiter, authenticateDeveloperAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { orgId } = req.params;
    if (!isUUID(orgId)) {
      res.status(400).json({ error: `Invalid organization ID format: ${orgId}` });
      return;
    }

    // Strictly enforce Developer Admin access - organizers cannot claim directly
    if (!isUserDeveloperAdmin(req.user)) {
      res.status(403).json({
        error: 'Forbidden: Developer Admin access required. Organizers cannot directly claim showcase credits. Rewards must be earned via eligible showcase submission and developer admin review approval.',
      });
      return;
    }

    const { event_id, reference_id, metadata } = req.body;

    const result = await grantShowcaseCredit({
      organizationId: orgId,
      eventId: event_id,
      createdBy: req.user!.id,
      referenceId: reference_id,
      metadata,
    });

    res.json({
      success: true,
      transaction: result.transaction,
      wallet: result.wallet,
      already_granted: result.alreadyGranted,
    });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * GET /api/organizations/:orgId/wallet/can-use-showcase
 * Check if the organization has sufficient Showcase Credit + Paid Balance for an event
 */
app.get('/api/organizations/:orgId/wallet/can-use-showcase', authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const { orgId } = req.params;
    if (!isUUID(orgId)) {
      res.status(400).json({ error: `Invalid organization ID format: ${orgId}` });
      return;
    }

    const { isMember } = await verifyOrgMembershipAndPermission(req.user!.id, orgId);
    const isDev = isUserDeveloperAdmin(req.user);
    if (!isMember && !isDev) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const eventId = req.query.eventId as string | undefined;
    const eligibility = await canUseShowcaseCredit(orgId, eventId);
    res.json(eligibility);
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * POST /api/organizations/:orgId/wallet/consume-showcase
 * Consume Showcase Credit (RM300) and Paid Balance (RM1,100) for an Event
 */
app.post('/api/organizations/:orgId/wallet/consume-showcase', walletRateLimiter, authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const { orgId } = req.params;
    if (!isUUID(orgId)) {
      res.status(400).json({ error: `Invalid organization ID format: ${orgId}` });
      return;
    }

    const { isMember, role } = await verifyOrgMembershipAndPermission(req.user!.id, orgId);
    const isDev = isUserDeveloperAdmin(req.user);
    if ((!isMember || (role !== 'owner' && role !== 'admin')) && !isDev) {
      res.status(403).json({ error: 'Only organization owners and admins can consume showcase credit' });
      return;
    }

    const { event_id, reference_id, description, metadata } = req.body;
    if (!event_id) {
      res.status(400).json({ error: 'Event ID is required' });
      return;
    }

    const result = await consumeShowcaseCredit({
      organizationId: orgId,
      eventId: event_id,
      referenceId: reference_id,
      createdBy: req.user!.id,
      description,
      metadata,
    });

    res.json(result);
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * POST /api/organizations/:orgId/wallet/calculate-event-payment
 * Server-side calculation and strict business rule validation for event payment
 */
app.post('/api/organizations/:orgId/wallet/calculate-event-payment', walletRateLimiter, authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const { orgId } = req.params;
    if (!isUUID(orgId)) {
      res.status(400).json({ error: `Invalid organization ID format: ${orgId}` });
      return;
    }

    const { isMember } = await verifyOrgMembershipAndPermission(req.user!.id, orgId);
    const isDev = isUserDeveloperAdmin(req.user);
    if (!isMember && !isDev) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const { event_price, payment_mode, topup_credit_requested } = req.body;
    let price = event_price !== undefined && event_price !== null ? Number(event_price) : undefined;
    if (!price || isNaN(price) || price <= 0) {
      try {
        const settings = await getPlatformPricingSettings();
        price = settings.default_price;
      } catch (err: any) {
        handleApiError(err, req, res);
        return;
      }
    }
    const mode = (payment_mode || 'FULL_PAID') as any;

    const calculation = await calculateEventPayment(
      price,
      mode,
      orgId,
      {
        topupCreditRequested: topup_credit_requested !== undefined ? Number(topup_credit_requested) : undefined,
      }
    );

    res.json({
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
    });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * POST /api/organizations/:orgId/wallet/quote-payment
 * Calculate payment quote and validate credit rules server-side (legacy & backward-compatible)
 */
app.post('/api/organizations/:orgId/wallet/quote-payment', walletRateLimiter, authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const { orgId } = req.params;
    if (!isUUID(orgId)) {
      res.status(400).json({ error: `Invalid organization ID format: ${orgId}` });
      return;
    }

    const { isMember } = await verifyOrgMembershipAndPermission(req.user!.id, orgId);
    const isDev = isUserDeveloperAdmin(req.user);
    if (!isMember && !isDev) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const { event_id, credit_choice, topup_credit_amount } = req.body;

    const quote = await calculateEventPaymentQuote({
      organizationId: orgId,
      eventId: event_id,
      creditChoice: credit_choice || 'NONE',
      topupCreditAmountToUse: topup_credit_amount ? Number(topup_credit_amount) : undefined,
    });

    res.json({ quote });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * POST /api/organizations/:orgId/wallet/pay-event
 * Atomically pay for an Event using credit + paid balance
 */
app.post('/api/organizations/:orgId/wallet/pay-event', walletRateLimiter, authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const { orgId } = req.params;
    if (!isUUID(orgId)) {
      res.status(400).json({ error: `Invalid organization ID format: ${orgId}` });
      return;
    }

    const { isMember, hasPermission } = await verifyOrgMembershipAndPermission(req.user!.id, orgId, 'event.pay');
    const isDev = isUserDeveloperAdmin(req.user);
    if ((!isMember || !hasPermission) && !isDev) {
      res.status(403).json({ error: 'Insufficient permissions to pay for event. Only owners and admins can pay for events.' });
      return;
    }

    const {
      event_id,
      event_name,
      payment_mode,
      credit_choice,
      event_price,
      topup_credit_amount,
      topup_credit_requested,
      reference_id,
    } = req.body;

    if (!event_id) {
      res.status(400).json({ error: 'event_id is required' });
      return;
    }

    const result = await processEventPayment({
      organizationId: orgId,
      eventId: event_id,
      eventName: event_name,
      paymentMode: payment_mode || (credit_choice ? (credit_choice === 'NONE' ? 'FULL_PAID' : credit_choice) : undefined),
      creditChoice: credit_choice || 'NONE',
      eventPrice: event_price ? Number(event_price) : undefined,
      topupCreditRequested: topup_credit_requested !== undefined ? Number(topup_credit_requested) : (topup_credit_amount ? Number(topup_credit_amount) : undefined),
      referenceId: reference_id,
      createdBy: req.user!.id,
    });

    res.json({
      success: true,
      calculation: result.paymentCalculation,
      transactions: result.transactions,
      wallet: result.wallet,
      quote: result.quote,
    });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * POST /api/developer/organizations/:orgId/wallet/recalculate
 * Recompute wallet ledger cache (developer admin tool)
 */
app.post('/api/developer/organizations/:orgId/wallet/recalculate', authenticateDeveloperAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { orgId } = req.params;
    const wallet = await recalculateWalletBalances(orgId);
    res.json({ success: true, wallet });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * POST /api/developer/wallet/reverse
 * Perform financial ledger transaction reversal (developer admin tool)
 */
app.post('/api/developer/wallet/reverse', authenticateDeveloperAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { transaction_id, reason } = req.body;
    if (!transaction_id || !reason) {
      res.status(400).json({ error: 'transaction_id and reason are required' });
      return;
    }

    const result = await reverseTransaction({
      transactionId: transaction_id,
      reason,
      createdBy: req.user?.id,
    });

    res.json({
      success: true,
      reversal_transaction: result.reversalTransaction,
      wallet: result.wallet,
    });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

// ====================================================
// DEVELOPER GMAIL API EMAIL INTEGRATION ENDPOINTS
// ====================================================

/**
 * GET /api/email/google/connect
 * Initiates the Google OAuth2 web-server flow for Gmail sending permissions.
 */
app.get('/api/email/google/connect', authenticateDeveloperAdmin, async (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const config = getGoogleMailConfig();
    if (!config.clientId) {
      res.status(500).json({
        error: 'Server configuration error: GOOGLE_MAIL_CLIENT_ID is not configured in environment variables.',
      });
      return;
    }

    const callbackRedirectUri = config.redirectUri || `${req.protocol}://${req.get('host')}/api/email/google/callback`;
    const stateToken = generateOAuthStateToken(req.user!.id, undefined, callbackRedirectUri);
    const authUrl = buildGoogleAuthUrl(stateToken, callbackRedirectUri);

    const accept = req.headers.accept || '';
    const isExplicitBrowserRedirect =
      req.query.redirect === 'true' ||
      (!accept.includes('application/json') && accept.includes('text/html'));

    if (isExplicitBrowserRedirect) {
      res.redirect(302, authUrl);
      return;
    }

    res.json({
      success: true,
      authUrl,
      redirectUri: callbackRedirectUri,
    });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * GET /api/email/google/callback
 * Handles Google OAuth callback on the API server.
 */
app.get('/api/email/google/callback', async (req: express.Request, res: express.Response) => {
  const frontendBaseUrl = getFrontendBaseUrl();
  const redirectSuccess = `${frontendBaseUrl}/developer/email?status=connected`;
  const redirectErrorBase = `${frontendBaseUrl}/developer/email?status=error`;

  const code = req.query.code as string;
  const state = req.query.state as string;
  const oauthError = req.query.error as string;
  const oauthErrorDescription = req.query.error_description as string;

  if (oauthError) {
    console.warn('[Gmail OAuth] Callback received error from Google:', oauthError, oauthErrorDescription);
    const reason = oauthError === 'access_denied' ? 'oauth_denied' : 'oauth_error';
    const detail = oauthErrorDescription || oauthError;
    res.redirect(302, `${redirectErrorBase}&reason=${encodeURIComponent(reason)}&detail=${encodeURIComponent(detail)}`);
    return;
  }

  if (!code || !state) {
    res.redirect(302, `${redirectErrorBase}&reason=missing_code`);
    return;
  }

  const stateResult = verifyOAuthStateToken(state);
  if (!stateResult.valid) {
    console.error('[Gmail OAuth] State validation failed:', stateResult.error);
    res.redirect(302, `${redirectErrorBase}&reason=invalid_state&detail=${encodeURIComponent(stateResult.error || '')}`);
    return;
  }

  try {
    const config = getGoogleMailConfig();
    const callbackRedirectUri = stateResult.redirectUri || config.redirectUri || `${req.protocol}://${req.get('host')}/api/email/google/callback`;
    const tokenResult = await exchangeGoogleAuthCode(code, callbackRedirectUri);

    if (!tokenResult.refreshToken) {
      console.error('[Gmail OAuth] Token exchange completed without a refresh token');
      res.redirect(302, `${redirectErrorBase}&reason=missing_refresh_token`);
      return;
    }

    const encryptedRefreshToken = await encryptRefreshToken(tokenResult.refreshToken);

    await saveGoogleMailSettings({
      email_address: tokenResult.email,
      refresh_token_encrypted: encryptedRefreshToken,
      connected_by: stateResult.userId || null,
      enabled: true,
      status: 'connected',
      last_error: null,
    });

    console.log(`[Gmail OAuth] Successfully connected platform sending account: ${tokenResult.email}`);

    res.redirect(302, redirectSuccess);
  } catch (err: any) {
    console.error('[Gmail OAuth] Failed to complete token exchange or save settings:', err);
    const safeDetail = isOperationalError(err) ? (err.message || '') : 'Token exchange failed';
    res.redirect(302, `${redirectErrorBase}&reason=exchange_failed&detail=${encodeURIComponent(safeDetail)}`);
  }
});

/**
 * GET /api/email/google/status
 * Returns safe connection status for the Developer Email UI.
 */
app.get('/api/email/google/status', authenticateDeveloperAdmin, async (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const settings = await getGoogleMailSettings();
    const config = getGoogleMailConfig();

    const isConnected = Boolean(
      settings &&
      settings.enabled &&
      settings.refresh_token_encrypted &&
      settings.status !== 'disconnected'
    );

    res.json({
      success: true,
      connected: isConnected,
      email: isConnected ? (settings?.email_address || null) : null,
      enabled: isConnected ? (settings?.enabled !== false) : false,
      status: isConnected ? (settings?.status || 'connected') : 'disconnected',
      configured: Boolean(config.clientId && config.clientSecret),
      lastConnectedAt: isConnected ? (settings?.last_connected_at || null) : null,
      lastError: settings?.last_error || null,
      redirectUri: config.redirectUri || `${req.protocol}://${req.get('host')}/api/email/google/callback`,
      hasClientId: Boolean(config.clientId),
      hasClientSecret: Boolean(config.clientSecret),
    });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * POST /api/email/google/disconnect
 * Disconnects the platform Gmail sending account.
 */
app.post('/api/email/google/disconnect', authenticateDeveloperAdmin, async (req: AuthenticatedRequest, res: express.Response) => {
  try {
    await disconnectGoogleMail();
    console.log('[Gmail API] Platform sending account disconnected by developer admin:', req.user?.email);
    res.json({
      success: true,
      message: 'Gmail sending integration successfully disconnected.',
    });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * POST /api/email/test
 * Sends a test email to verify Gmail API credentials and delivery.
 */
app.post('/api/email/test', authenticateDeveloperAdmin, async (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const { recipientEmail } = req.body;
    const targetEmail = (recipientEmail || req.user?.email || '').trim().toLowerCase();

    if (!targetEmail || !targetEmail.includes('@')) {
      res.status(400).json({ error: 'Valid recipient email address is required.' });
      return;
    }

    const settings = await getGoogleMailSettings();
    if (!settings || !settings.enabled || !settings.refresh_token_encrypted || settings.status === 'disconnected') {
      res.status(400).json({
        error: 'Gmail sending account is not connected. Please connect a Gmail account before sending test emails.',
      });
      return;
    }

    const { html, text, subject } = generateTestEmailTemplate(settings.email_address);

    const result = await sendEmailViaGmail({
      to: targetEmail,
      subject,
      html,
      text,
      fromName: 'EventGameStudio Platform',
    });

    res.json({
      success: true,
      message: `Test email successfully sent to ${targetEmail} via connected Gmail account (${result.senderEmail})`,
      messageId: result.messageId,
      threadId: result.threadId,
      senderEmail: result.senderEmail,
      recipientEmail: targetEmail,
    });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

// ----------------------------------------------------
// NOTIFICATIONS ENDPOINTS
// ----------------------------------------------------

/**
 * GET /api/notifications
 * Lists notifications for authenticated user with optional organization, unread, category filters, and pagination.
 */
app.get('/api/notifications', authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user;
    if (!user?.id) {
      res.status(401).json({ error: 'Unauthorized: Authentication required' });
      return;
    }
    const rawOrgId = typeof req.query.organizationId === 'string'
      ? req.query.organizationId
      : (typeof req.query.organization_id === 'string' ? req.query.organization_id : undefined);
    const organizationId = rawOrgId && rawOrgId !== 'undefined' && rawOrgId !== 'null' && rawOrgId.trim() !== ''
      ? rawOrgId.trim()
      : undefined;
    const unreadOnly = req.query.unreadOnly === 'true' || req.query.unread_only === 'true';
    const category = typeof req.query.category === 'string' ? (req.query.category as any) : undefined;
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || '20'), 10) || 20, 1), 100);
    const offset = Math.max(parseInt(String(req.query.offset || '0'), 10) || 0, 0);

    const result = await listNotifications({
      userId: user.id,
      organizationId,
      unreadOnly,
      category,
      limit,
      offset,
    });

    res.json(result);
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * GET /api/notifications/unread-count
 * Returns unread notification count for the authenticated user.
 */
app.get('/api/notifications/unread-count', authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user;
    if (!user?.id) {
      res.status(401).json({ error: 'Unauthorized: Authentication required' });
      return;
    }
    const rawOrgId = typeof req.query.organizationId === 'string'
      ? req.query.organizationId
      : (typeof req.query.organization_id === 'string' ? req.query.organization_id : undefined);
    const organizationId = rawOrgId && rawOrgId !== 'undefined' && rawOrgId !== 'null' && rawOrgId.trim() !== ''
      ? rawOrgId.trim()
      : undefined;

    const count = await getUnreadNotificationCount(user.id, organizationId);
    res.json({ unread_count: count });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * PATCH / POST /api/notifications/:id/read
 * Mark a single notification as read.
 */
const handleMarkNotificationRead = async (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const user = req.user!;
    const { id } = req.params;

    const notification = await markNotificationAsRead(id, user.id);
    if (!notification) {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }

    res.json({ notification });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
};
app.patch('/api/notifications/:id/read', authenticateJWT, handleMarkNotificationRead);
app.post('/api/notifications/:id/read', authenticateJWT, handleMarkNotificationRead);

/**
 * POST /api/notifications/mark-all-read
 * Mark all notifications as read for the user.
 */
app.post('/api/notifications/mark-all-read', authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const organizationId = typeof req.body?.organizationId === 'string'
      ? req.body.organizationId
      : (typeof req.body?.organization_id === 'string' ? req.body.organization_id : undefined);

    const resObj = await markAllNotificationsAsRead(user.id, organizationId);
    res.json({ success: true, count: resObj.marked_count, marked_count: resObj.marked_count });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * DELETE /api/notifications/:id
 * Delete a notification for the authenticated user.
 */
app.delete('/api/notifications/:id', authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { id } = req.params;

    await deleteNotification(id, user.id);
    res.json({ success: true });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
});

/**
 * POST /api/developer/notifications/dispatch-test
 * Developer test endpoint to trigger business events and verify dispatching.
 */
app.post('/api/developer/notifications/dispatch-test', authenticateDeveloperAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const event = req.body as any;
    if (!event || !event.eventType) {
      res.status(400).json({ error: 'Valid BusinessNotificationEvent with eventType is required' });
      return;
    }

    if (!event.recipientUserId && !event.organizationId && req.user?.id) {
      event.recipientUserId = req.user.id;
    }

    const createdNotifications = await dispatchNotificationEvent(event);
    res.json({
      success: true,
      created_count: createdNotifications.length,
      notifications: createdNotifications,
    });
  } catch (err: any) {
    console.error('Error in developer dispatch-test:', err);
    handleApiError(err, req, res);
  }
});

// ----------------------------------------------------
// DEVELOPER & ADMIN ERROR LOGS AUDITING ENDPOINTS
// ----------------------------------------------------

/**
 * Handler for listing sanitized API error logs for Developer/Admin inspection.
 */
async function handleGetApiErrorLogs(req: AuthenticatedRequest, res: express.Response) {
  try {
    const {
      page,
      pageSize,
      requestId,
      startDate,
      endDate,
      endpoint,
      statusCode,
      service,
      errorType,
      userId,
      search,
    } = req.query as Record<string, string>;

    const result = await listApiErrorLogs({
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 25,
      requestId,
      startDate,
      endDate,
      endpoint,
      statusCode: statusCode ? Number(statusCode) : undefined,
      service,
      errorType,
      userId,
      search,
    });

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
}

/**
 * Handler for retrieving a single API error log by ID.
 */
async function handleGetApiErrorLogDetail(req: AuthenticatedRequest, res: express.Response) {
  try {
    const { id } = req.params;
    const log = await getApiErrorLogById(id);
    if (!log) {
      res.status(404).json({ error: 'Error log entry not found' });
      return;
    }
    res.json({
      success: true,
      data: log,
    });
  } catch (err: any) {
    handleApiError(err, req, res);
  }
}

app.get('/api/developer/error-logs', authenticateDeveloperAdmin, handleGetApiErrorLogs);
app.get('/api/admin/error-logs', authenticateDeveloperAdmin, handleGetApiErrorLogs);
app.get('/api/developer/error-logs/:id', authenticateDeveloperAdmin, handleGetApiErrorLogDetail);
app.get('/api/admin/error-logs/:id', authenticateDeveloperAdmin, handleGetApiErrorLogDetail);

// ----------------------------------------------------
// GLOBAL CENTRALIZED API ERROR & 404 MIDDLEWARE
// ----------------------------------------------------

app.use('/api', (err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  handleApiError(err, req, res);
});

// Explicit 404 for any unmatched /api routes so they never fall through to HTML or Vite SPA
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: `API endpoint not found: ${req.method} ${req.path}` });
});

// ----------------------------------------------------
// VITE AND SERVING FRONTEND
// ----------------------------------------------------

async function startServer() {
  const publicDir = path.join(process.cwd(), 'public');
  const distPath = path.join(process.cwd(), 'dist');

  // Serve static assets from public/ directory explicitly under /public as well as /assets
  app.use('/public', express.static(publicDir));
  app.use('/assets', express.static(path.join(publicDir, 'assets')));

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.use('/public', express.static(distPath));
    app.get('*', (req, res) => {
      // Do not return SPA index.html for missing static files (images, fonts, scripts)
      if (/\.(png|jpe?g|gif|svg|ico|webp|avif|css|js|map|json|woff2?|ttf|otf|mp3|wav|ogg)$/i.test(req.path)) {
        res.status(404).send('Asset not found');
        return;
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);

    // Start background event lifecycle maintenance job (runs every 60 seconds)
    setInterval(async () => {
      try {
        await runEventLifecycleMaintenance();
      } catch (err) {
        console.error('[Event Lifecycle Maintenance] Periodic job error:', err);
      }
    }, 60 * 1000);
  });
}

startServer();
