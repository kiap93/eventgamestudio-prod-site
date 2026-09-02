import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';

import {
  upsertGoogleUser,
  getUserOrganizations,
  createOrganization,
  getOrganizationById,
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
  getShowcaseMedia,
  getShowcaseMediaById,
  createShowcaseMedia,
  updateShowcaseMedia,
  reorderShowcaseMedia,
  deleteShowcaseMedia,
  createSignedUploadUrlForShowcase,
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
  listTopupOrdersByOrganization,
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
  calculateEventCalendarDays,
  calculateEventAuthoritativePrice,
  getAllAdminEvents,
  updateEventPrice,
  submitEventScore,
  getEventHighScores,
  getEventScoreStats,
  deleteEventScore,
  clearEventHighScores,
} from './server/db/index.js';

import {
  authenticateJWT,
  authenticateDeveloperAdmin,
  isUserDeveloperAdmin,
  signAppToken,
  verifyAppToken,
  verifyGoogleIdToken,
  verifyOrgMembershipAndPermission,
  hashToken,
  AuthenticatedRequest,
} from './server/auth.js';

import { PaymentMode } from './server/db/types.js';

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
} from './server/rateLimiter.js';

import {
  createPaymentSession,
  verifyAndProcessPaymentWebhook,
  generateWebhookSignature,
  getPaymentWebhookSecret,
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

// Global API rate limiter on all mutating endpoints to prevent volumetric request flood
app.use('/api', (req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
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

// Dedicated multer instance for showcase photos and large video files (up to 200MB)
const mediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
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
  try {
    const { idToken } = req.body;
    if (!idToken) {
      res.status(422).json({ error: 'Missing idToken' });
      return;
    }

    const googleUser = await verifyGoogleIdToken(idToken);

    // Upsert user into Supabase users table
    const user = await upsertGoogleUser(googleUser);

    if (!user) {
      res.status(500).json({ error: 'Failed to create or load user record in Supabase' });
      return;
    }

    // Load organization memberships from Supabase
    const memberships = await getUserOrganizations(user.id);

    let activeOrgId: string | undefined = undefined;
    let activeRole: string | undefined = undefined;

    if (memberships.length > 0) {
      activeOrgId = memberships[0].id;
      activeRole = memberships[0].role;
    }

    const token = signAppToken(user.id, activeOrgId, activeRole as any);

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
    console.error('Google Auth error:', err);
    res.status(401).json({ error: err.message || 'Authentication failed' });
  }
});

/**
 * GET /api/auth/me
 * Get current user & active organization details from Supabase
 */
app.get('/api/auth/me', authenticateJWT, async (req: AuthenticatedRequest, res) => {
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
          }
        : null,
    });
  } catch (err: any) {
    console.error('Auth /me error:', err);
    res.status(500).json({ error: err.message });
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

    const newToken = signAppToken(user.id, organizationId, role);
    res.json({
      token: newToken,
      activeOrganization: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        role,
        logo_url: org.logo_url,
      },
    });
  } catch (err: any) {
    console.error('Switch org error:', err);
    res.status(500).json({ error: err.message });
  }
});

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
    console.error('List organizations error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/organizations
 * Create a new organization and default game in Supabase
 */
app.post('/api/organizations', organizationRateLimiter, authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { name, logo_url } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      res.status(422).json({ error: 'Organization name is required' });
      return;
    }

    // 1. Create Organization
    const organization = await createOrganization({
      name: name.trim(),
      owner_id: user.id,
      logo_url: logo_url || null,
    });

    // 2. Add owner membership
    await addMember({
      organization_id: organization.id,
      user_id: user.id,
      role: 'owner',
    });

    // 3. Create default game for this organization
    const defaultGame = await ensureDefaultGame(organization.id, organization.name);

    const token = signAppToken(user.id, organization.id, 'owner');

    res.json({
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        role: 'owner',
        logo_url: organization.logo_url,
      },
      token,
      gameId: defaultGame.id,
    });
  } catch (err: any) {
    console.error('Create organization error:', err);
    res.status(500).json({ error: err.message });
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
    console.error('List members error:', err);
    res.status(500).json({ error: err.message });
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
      emailError = emailErr.message || 'Failed to deliver invitation email via Gmail API';
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
    console.error('Create invitation error:', err);
    res.status(500).json({ error: err.message });
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
      emailError = emailErr.message || 'Failed to deliver invitation email via Gmail API';
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
    console.error('Resend invitation error:', err);
    res.status(500).json({ error: err.message });
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
    console.error('Delete invitation error:', err);
    res.status(500).json({ error: err.message });
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
    console.error('Remove member error:', err);
    res.status(500).json({ error: err.message });
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
    console.error('Verify invitation error:', err);
    res.status(500).json({ error: err.message });
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

    const googleUser = await verifyGoogleIdToken(idToken);

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
    console.error('Accept invitation error:', err);
    res.status(500).json({ error: err.message });
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

    // 5. Validate File
    if (!req.file || !req.file.buffer || req.file.buffer.length === 0) {
      res.status(422).json({ error: 'No file uploaded', code: 'NO_FILE_UPLOADED' });
      return;
    }

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
    const ext = path.extname(req.file.originalname || '').toLowerCase();
    const allowedExts = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif', '.ico', '.mp3', '.wav', '.ogg', '.aac', '.mp4', '.webm', '.mov']);
    const mimeType = (req.file.mimetype || 'application/octet-stream').toLowerCase();

    if (!ALLOWED_MIME_TYPES.has(mimeType) && !allowedExts.has(ext)) {
      res.status(422).json({
        error: `Unsupported file format (${mimeType}). Allowed formats: PNG, JPG, JPEG, WEBP, SVG, GIF, MP3, WAV, OGG, MP4.`,
        code: 'UNSUPPORTED_FILE_TYPE',
      });
      return;
    }

    const MAX_ASSET_SIZE = 25 * 1024 * 1024; // 25MB
    if (req.file.size > MAX_ASSET_SIZE || req.file.buffer.length > MAX_ASSET_SIZE) {
      res.status(422).json({
        error: `File size exceeds maximum allowed limit of 25MB (${((req.file.size || req.file.buffer.length) / (1024 * 1024)).toFixed(1)}MB provided).`,
        code: 'FILE_TOO_LARGE',
      });
      return;
    }

    // 6. Generate storage path and 7. Upload
    const safeOrgId = orgId.replace(/[^a-zA-Z0-9_-]/g, '') || 'default';
    const safeCategory = category.replace(/[^a-zA-Z0-9_-]/g, '') || 'general';

    try {
      // Attempt Supabase Storage upload
      const result = await uploadGameAsset({
        organizationId: safeOrgId,
        category: safeCategory as any,
        fileBuffer: req.file.buffer,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype || mimeType,
      });

      res.json({ url: result.url, path: result.path });
    } catch (storageErr: any) {
      console.warn('Supabase storage upload fallback:', storageErr.message);

      // Fallback to local disk storage if Supabase credentials are not yet configured in dev
      const safeExt = ext || '.png';
      const filename = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${safeExt}`;
      const localFilePath = path.join(uploadDir, filename);
      fs.writeFileSync(localFilePath, req.file.buffer);

      const fileUrl = `/uploads/${filename}`;
      res.json({ url: fileUrl, path: `organizations/${safeOrgId}/${safeCategory}/${filename}` });
    }
  } catch (err: any) {
    console.error('Upload error:', err);
    res.status(500).json({ error: err.message || 'File upload failed' });
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
    console.error('Get themes error:', err);
    res.status(500).json({ error: err.message });
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
    console.error('Get system themes error:', err);
    res.status(500).json({ error: err.message });
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
    console.error('Clone system theme error:', err);
    res.status(500).json({ error: err.message });
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
    console.error('Clone all system themes error:', err);
    res.status(500).json({ error: err.message });
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
    console.error('Get theme details error:', err);
    res.status(500).json({ error: err.message });
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

    const {
      name,
      slug,
      game_id,
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
    } = req.body;

    if (!name || typeof name !== 'string') {
      res.status(422).json({ error: 'Theme name is required' });
      return;
    }

    const theme = await createTheme({
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
    });

    res.status(201).json({ theme });
  } catch (err: any) {
    console.error('Create theme error:', err);
    res.status(500).json({ error: err.message });
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
    } = req.body;

    const updatedTheme = await updateTheme(themeId, {
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
    });

    res.json({ theme: updatedTheme });
  } catch (err: any) {
    console.error('Update theme error:', err);
    res.status(500).json({ error: err.message });
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
    console.error('Duplicate theme error:', err);
    res.status(500).json({ error: err.message });
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
    console.error('Delete theme error:', err);
    res.status(500).json({ error: err.message });
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
    console.error('Get games error:', err);
    res.status(500).json({ error: err.message });
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
    console.error('Get game details error:', err);
    res.status(500).json({ error: err.message });
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
    console.error('Get game themes error:', err);
    res.status(500).json({ error: err.message });
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
    const { background_url, basket_config, items_config, settings_config, name } = req.body;

    const game = await getGameById(gameId);
    if (!game) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }

    let requiredPerm = 'game.view';
    if (background_url !== undefined) requiredPerm = 'game.background.edit';
    else if (items_config !== undefined) requiredPerm = 'game.items.edit';
    else if (basket_config !== undefined) requiredPerm = 'game.basket.edit';
    else if (settings_config !== undefined) requiredPerm = 'game.settings.edit';

    const { isMember, role } = await verifyOrgMembershipAndPermission(user.id, game.organization_id, requiredPerm);
    if (!isMember) {
      res.status(403).json({ error: 'Access denied: Not an organization member' });
      return;
    }

    if (role === 'viewer') {
      res.status(403).json({ error: 'Viewers cannot modify game customization' });
      return;
    }

    const updatedGame = await updateGameCustomization(gameId, {
      background_url,
      basket_config,
      items_config,
      settings_config,
      name,
    });

    res.json({ game: updatedGame });
  } catch (err: any) {
    console.error('Update game customization error:', err);
    res.status(500).json({ error: err.message });
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
    const organizationId = req.params.organizationId || req.params.orgId || req.jwtPayload?.organizationId;

    if (!organizationId) {
      res.status(422).json({ error: 'No active organization selected' });
      return;
    }

    const { isMember } = await verifyOrgMembershipAndPermission(user.id, organizationId, 'game.view');
    if (!isMember) {
      res.status(403).json({ error: 'Forbidden: You are not a member of this organization' });
      return;
    }

    const events = await getEventsByOrgId(organizationId);
    res.json({ events });
  } catch (err: any) {
    console.error('Get events error:', err);
    res.status(500).json({ error: err.message });
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

    const { isMember } = await verifyOrgMembershipAndPermission(user.id, event.organization_id, 'game.view');
    if (!isMember) {
      res.status(403).json({ error: 'Forbidden: Access denied to this event' });
      return;
    }

    res.json({ event });
  } catch (err: any) {
    console.error('Get event details error:', err);
    res.status(500).json({ error: err.message });
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

    const { isMember } = await verifyOrgMembershipAndPermission(user.id, organizationId, 'game.items.view');
    if (!isMember) {
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
      } catch (e) {
        try {
          const settings = await getPlatformPricingSettings();
          price = settings.default_price;
          currency = settings.default_currency;
        } catch {
          price = STANDARD_EVENT_PRICE;
        }
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
    console.error('Event quote error:', err);
    res.status(500).json({ error: err.message });
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

    const { isMember, role } = await verifyOrgMembershipAndPermission(user.id, organizationId, 'game.items.edit');
    if (!isMember || role === 'viewer') {
      res.status(403).json({ error: 'Permission denied: Viewers cannot create events' });
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
    });

    const enriched = await getEventById(created.id);

    res.status(201).json({
      success: true,
      event: enriched || created,
    });
  } catch (err: any) {
    console.error('Create event error:', err);
    if (err.code === 'PENDING_EVENT_LIMIT_REACHED' || err.status === 422) {
      res.status(422).json({
        code: err.code || 'VALIDATION_ERROR',
        error: err.message || 'Maximum 2 pending payment events reached. Please pay for or delete an existing pending event.',
      });
      return;
    }
    if (err.code === 'GAME_INACTIVE' || err.code === 'THEME_GAME_MISMATCH' || err.code === 'GAME_NOT_FOUND') {
      res.status(422).json({
        code: err.code,
        error: err.message,
      });
      return;
    }
    res.status(err.status || 500).json({ error: err.message || 'Failed to create event' });
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

    const { isMember, role } = await verifyOrgMembershipAndPermission(user.id, event.organization_id, 'game.items.edit');
    if (!isMember || role === 'viewer') {
      res.status(403).json({ error: 'Permission denied: Viewers cannot pay for events' });
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
    if (err.code === 'INSUFFICIENT_BALANCE' || (err.message && err.message.toLowerCase().includes('insufficient'))) {
      res.status(402).json({
        code: 'INSUFFICIENT_BALANCE',
        error: err.message || 'Insufficient balance',
        required: err.required,
        available: err.available,
        shortfall: err.shortfall,
      });
      return;
    }
    res.status(err.status || 500).json({ error: err.message || 'Failed to process payment' });
  }
});

/**
 * PUT /api/events/:eventId
 * Update event parameters (supports live theme correction)
 */
app.put('/api/events/:eventId', authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { eventId } = req.params;

    const event = await getEventById(eventId);
    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    const { isMember, role } = await verifyOrgMembershipAndPermission(user.id, event.organization_id, 'game.items.edit');
    if (!isMember || role === 'viewer') {
      res.status(403).json({ error: 'Permission denied: Viewers cannot edit events' });
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
    });

    const enriched = await getEventById(updated.id);
    res.json({ event: enriched });
  } catch (err: any) {
    console.error('Update event error:', err);
    res.status(500).json({ error: err.message });
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

    const { isMember, role } = await verifyOrgMembershipAndPermission(user.id, event.organization_id, 'game.items.edit');
    if (!isMember || !['owner', 'admin'].includes(role || '')) {
      res.status(403).json({ error: 'Permission denied: Only owners and admins can delete events' });
      return;
    }

    await deleteEvent(eventId);
    res.json({ success: true });
  } catch (err: any) {
    console.error('Delete event error:', err);
    res.status(500).json({ error: err.message });
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

    const { isMember } = await verifyOrgMembershipAndPermission(user.id, event.organization_id, 'game.items.view');
    if (!isMember) {
      res.status(403).json({ error: 'Permission denied' });
      return;
    }

    const eligibility = canCancelEvent(event);
    const refund = determineEventRefund(event);
    res.json({ eligibility, refund });
  } catch (err: any) {
    console.error('Cancellation eligibility error:', err);
    res.status(500).json({ error: err.message });
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

    const { isMember, role } = await verifyOrgMembershipAndPermission(user.id, event.organization_id, 'game.items.edit');
    if (!isMember || role === 'viewer') {
      res.status(403).json({ error: 'Permission denied: Viewers cannot cancel events' });
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
    console.error('Cancel event error:', err);
    res.status(err.status || 422).json({
      error: err.message,
      code: err.code || 'CANCELLATION_FAILED',
      eligibility: err.eligibility,
    });
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

    const { isMember } = await verifyOrgMembershipAndPermission(user.id, event.organization_id, 'game.view');
    if (!isMember) {
      res.status(403).json({ error: 'Forbidden: Access denied to this event preview' });
      return;
    }

    if (event.event_status === 'CANCELLED' || event.status === 'cancelled' || event.cancel_reason) {
      res.status(403).json({
        error: 'This event has been cancelled.',
        code: 'EVENT_CANCELLED',
        is_cancelled: true,
        cancel_reason: event.cancel_reason,
      });
      return;
    }

    // Check preview accessibility window (Before event_start_date - 1 calendar day)
    const isPreviewAllowed = canAccessPreviewEvent(event);
    if (!isPreviewAllowed) {
      const { startDate, endDate, liveOpenDate } = getNormalizedEventDates(event);
      const isPaid = (event.payment_status || '').toUpperCase() === 'PAID';
      const isLiveAllowed = canAccessLiveEvent(event);

      res.status(403).json({
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
    console.error('Get event preview error:', err);
    res.status(500).json({ error: err.message });
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
app.get('/api/public/events/:publicToken', async (req, res) => {
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

    if (rawEvent.event_status === 'CANCELLED' || rawEvent.status === 'cancelled' || rawEvent.cancel_reason) {
      res.status(403).json({
        error: 'This event has been cancelled.',
        code: 'EVENT_CANCELLED',
        is_cancelled: true,
        cancel_reason: rawEvent.cancel_reason,
      });
      return;
    }

    const { startDate, endDate, liveOpenDate } = getNormalizedEventDates(rawEvent);
    const isPaid = (rawEvent.payment_status || '').toUpperCase() === 'PAID';

    // 1. Payment status check (checked independently)
    if (!isPaid || rawEvent.status === 'pending_payment') {
      res.status(403).json({
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
      });
      return;
    }

    // 2. Date window check
    const isLiveAllowed = canAccessLiveEvent(rawEvent);
    if (!isLiveAllowed) {
      // Determine if before opening date or after closing date
      const curDate = new Date();
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Singapore',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      const todayStr = formatter.format(curDate);

      if (todayStr < liveOpenDate) {
        res.status(403).json({
          error: `This event is scheduled to open on ${liveOpenDate}. Live URL will become active on ${liveOpenDate}.`,
          code: 'EVENT_NOT_OPEN',
          is_scheduled: true,
          live_open_date: liveOpenDate,
          start_date: startDate,
          end_date: endDate,
          event_id: rawEvent.id,
          event_name: rawEvent.name,
          event: rawEvent,
        });
        return;
      }

      if (todayStr > endDate) {
        res.status(403).json({
          error: `This event concluded on ${endDate}.`,
          code: 'EVENT_EXPIRED',
          is_expired: true,
          start_date: startDate,
          end_date: endDate,
          event_id: rawEvent.id,
          event_name: rawEvent.name,
          event: rawEvent,
        });
        return;
      }
    }

    res.json({ event: rawEvent });
  } catch (err: any) {
    console.error('Public event resolution error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// EVENT HIGH SCORE BOARD ENDPOINTS
// ----------------------------------------------------

/**
 * GET /api/events/:eventId/high-scores
 * Get high scores / leaderboard for a specific event
 */
app.get('/api/events/:eventId/high-scores', async (req, res) => {
  try {
    const { eventId } = req.params;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;

    const event = await getEventById(eventId);
    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    const result = await getEventHighScores(eventId, { limit, page });
    res.json({
      event_id: eventId,
      ...result,
    });
  } catch (err: any) {
    console.error('Get event high scores error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/events/:eventId/high-scores
 * Submit a score to an event's high score board
 */
app.post('/api/events/:eventId/high-scores', highScoreRateLimiter, async (req, res) => {
  try {
    const { eventId } = req.params;
    const { player_name, score, metadata } = req.body;

    if (score === undefined || score === null) {
      res.status(422).json({ error: 'Score is required' });
      return;
    }

    const result = await submitEventScore({
      event_id: eventId,
      player_name,
      score: Number(score),
      metadata: typeof metadata === 'object' ? metadata : {},
    });

    res.status(201).json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    console.error('Submit event high score error:', err);
    res.status(err.status || 422).json({ error: err.message });
  }
});

/**
 * GET /api/public/events/:publicToken/high-scores
 * Public endpoint to get high scores by public event token (PAID events only)
 */
app.get('/api/public/events/:publicToken/high-scores', async (req, res) => {
  try {
    const { publicToken } = req.params;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;

    const event = await getEventByPublicToken(publicToken, undefined, { allowUnpaid: false });
    if (!event) {
      res.status(404).json({ error: 'Event not found or payment pending' });
      return;
    }

    const result = await getEventHighScores(event.id, { limit, page });
    res.json({
      event_id: event.id,
      event_name: event.name,
      ...result,
    });
  } catch (err: any) {
    console.error('Get public event high scores error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/public/events/:publicToken/high-scores
 * Public endpoint to submit score by public event token (PAID events only)
 */
app.post('/api/public/events/:publicToken/high-scores', highScoreRateLimiter, async (req, res) => {
  try {
    const { publicToken } = req.params;
    const { player_name, score, metadata } = req.body;

    if (score === undefined || score === null) {
      res.status(422).json({ error: 'Score is required' });
      return;
    }

    const event = await getEventByPublicToken(publicToken, undefined, { allowUnpaid: false });
    if (!event) {
      res.status(404).json({ error: 'Event not found or payment pending' });
      return;
    }

    const result = await submitEventScore({
      event_id: event.id,
      player_name,
      score: Number(score),
      metadata: typeof metadata === 'object' ? metadata : {},
    });

    res.status(201).json({
      success: true,
      event_id: event.id,
      ...result,
    });
  } catch (err: any) {
    console.error('Submit public event high score error:', err);
    res.status(err.status || 422).json({ error: err.message });
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

    const { isMember } = await verifyOrgMembershipAndPermission(user.id, event.organization_id, 'game.view');
    if (!isMember) {
      res.status(403).json({ error: 'Permission denied: Cannot view event score details' });
      return;
    }

    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;

    const [leaderboard, stats] = await Promise.all([
      getEventHighScores(eventId, { limit, page }),
      getEventScoreStats(eventId),
    ]);

    res.json({
      event_id: eventId,
      event_name: event.name,
      ...leaderboard,
      stats,
    });
  } catch (err: any) {
    console.error('Admin get high scores error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/events/:eventId/high-scores/:scoreId
 * Admin endpoint: delete a single score entry
 */
app.delete('/api/events/:eventId/high-scores/:scoreId', authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { eventId, scoreId } = req.params;

    const event = await getEventById(eventId);
    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    const { isMember, role } = await verifyOrgMembershipAndPermission(user.id, event.organization_id, 'game.items.edit');
    if (!isMember || role === 'viewer') {
      res.status(403).json({ error: 'Permission denied: Only event editors and admins can delete scores' });
      return;
    }

    await deleteEventScore(eventId, scoreId);
    res.json({ success: true, message: 'Score deleted successfully' });
  } catch (err: any) {
    console.error('Delete score error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/events/:eventId/high-scores/clear
 * Admin endpoint: clear/reset all scores for an event
 */
app.post('/api/events/:eventId/high-scores/clear', authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { eventId } = req.params;

    const event = await getEventById(eventId);
    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    const { isMember, role } = await verifyOrgMembershipAndPermission(user.id, event.organization_id, 'game.items.edit');
    if (!isMember || !['owner', 'admin'].includes(role || '')) {
      res.status(403).json({ error: 'Permission denied: Only organization owners and admins can reset leaderboards' });
      return;
    }

    await clearEventHighScores(eventId);
    res.json({ success: true, message: 'Event leaderboard reset successfully' });
  } catch (err: any) {
    console.error('Clear high scores error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// EVENT SHOWCASE API ENDPOINTS
// ----------------------------------------------------

/**
 * GET /api/events/:eventId/showcase
 * Get the showcase for an event
 */
app.get('/api/events/:eventId/showcase', async (req: AuthenticatedRequest, res) => {
  try {
    const { eventId } = req.params;
    const event = await getEventById(eventId);
    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    const showcase = await getShowcaseByEventId(eventId);

    // Check optional auth
    const authHeader = req.headers.authorization;
    let isOrgMember = false;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.split(' ')[1];
        const payload = await verifyAppToken(token);
        const { isMember } = await verifyOrgMembershipAndPermission(payload.sub, event.organization_id, 'game.view');
        isOrgMember = isMember;
      } catch {
        // Ignored, proceed as unauthenticated
      }
    }

    if (!showcase) {
      if (isOrgMember) {
        res.json({ showcase: null });
        return;
      }
      res.status(404).json({ error: 'Showcase not found' });
      return;
    }

    // If org member, return showcase regardless of status
    if (isOrgMember) {
      res.json({ showcase });
      return;
    }

    // If public/guest, only return if PUBLISHED
    if (showcase.status === 'PUBLISHED') {
      res.json({ showcase });
      return;
    }

    res.status(404).json({ error: 'Showcase is not published' });
  } catch (err: any) {
    console.error('Get showcase error:', err);
    res.status(500).json({ error: err.message });
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

    const { isMember, role } = await verifyOrgMembershipAndPermission(user.id, event.organization_id, 'game.items.edit');
    if (!isMember || role === 'viewer') {
      res.status(403).json({ error: 'Permission denied: Viewers cannot create event showcases' });
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

    // Normal users can only initialize showcase with DRAFT status
    const initialStatus = status === 'DRAFT' ? 'DRAFT' : 'DRAFT';

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

    res.status(201).json({ showcase });
  } catch (err: any) {
    console.error('Create showcase error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/events/:eventId/showcase
 * Update showcase details
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

    const { isMember, role } = await verifyOrgMembershipAndPermission(user.id, event.organization_id, 'game.items.edit');
    if (!isMember || role === 'viewer') {
      res.status(403).json({ error: 'Permission denied: Viewers cannot edit event showcases' });
      return;
    }

    const existing = await getShowcaseByEventId(eventId);
    if (!existing) {
      res.status(404).json({ error: 'Event Showcase not found' });
      return;
    }

    // Enforce Review Editing Rules:
    // SUBMITTED: Normal user cannot silently change the submitted version
    if (existing.review_status === 'SUBMITTED') {
      res.status(403).json({ error: 'Showcase is currently SUBMITTED and undergoing review. Edits cannot be made while under review.' });
      return;
    }

    // APPROVED: Do not allow changes that invalidate the approved review
    if (existing.review_status === 'APPROVED') {
      res.status(403).json({ error: 'Showcase is APPROVED. Approved showcases are locked from modifications.' });
      return;
    }

    const { title, description, client_name, client_logo_url, cover_image_url, status } = req.body;

    if (title !== undefined && (typeof title !== 'string' || !title.trim())) {
      res.status(422).json({ error: 'Showcase title cannot be empty' });
      return;
    }

    // Protect server-controlled status transitions:
    // Normal users cannot directly set APPROVED or REJECTED or arbitrary statuses
    let safeStatus: any = undefined;
    if (status !== undefined) {
      if (status === 'APPROVED' || status === 'REJECTED') {
        res.status(403).json({ error: 'Cannot set review status directly. Showcase approval is managed by developer review.' });
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

    res.json({ showcase });
  } catch (err: any) {
    console.error('Update showcase error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/events/:eventId/showcase/submit
 * Submit showcase for developer review
 */
app.post('/api/events/:eventId/showcase/submit', showcaseRateLimiter, authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { eventId } = req.params;

    const event = await getEventById(eventId);
    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    const { isMember, role } = await verifyOrgMembershipAndPermission(user.id, event.organization_id, 'game.items.edit');
    if (!isMember || role === 'viewer') {
      res.status(403).json({ error: 'Permission denied: Viewers cannot submit showcases for review' });
      return;
    }

    const existing = await getShowcaseByEventId(eventId);
    if (!existing) {
      res.status(404).json({ error: 'Showcase does not exist. Please create your showcase before submitting.' });
      return;
    }

    if (existing.review_status === 'APPROVED') {
      res.status(400).json({ error: 'Showcase has already been APPROVED and rewarded.' });
      return;
    }

    const showcase = await submitShowcaseForReview(eventId);
    res.json({ showcase, message: 'Showcase submitted for review successfully' });
  } catch (err: any) {
    console.error('Submit showcase error:', err);
    if (err.code === 'MEDIA_REQUIREMENT_NOT_MET' || err.code === 'VALIDATION_ERROR') {
      res.status(422).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/events/:eventId/showcase/publish
 * Publish showcase
 */
app.post('/api/events/:eventId/showcase/publish', showcaseRateLimiter, authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { eventId } = req.params;

    const event = await getEventById(eventId);
    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    const { isMember, role } = await verifyOrgMembershipAndPermission(user.id, event.organization_id, 'game.items.edit');
    if (!isMember || role === 'viewer') {
      res.status(403).json({ error: 'Permission denied: Viewers cannot publish event showcases' });
      return;
    }

    const existing = await getShowcaseByEventId(eventId);
    if (!existing) {
      res.status(404).json({ error: 'Event Showcase not found' });
      return;
    }

    const showcase = await publishShowcase(eventId);
    res.json({ showcase });
  } catch (err: any) {
    console.error('Publish showcase error:', err);
    res.status(500).json({ error: err.message });
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

    const { isMember, role } = await verifyOrgMembershipAndPermission(user.id, event.organization_id, 'game.items.edit');
    if (!isMember || role === 'viewer') {
      res.status(403).json({ error: 'Permission denied: Viewers cannot unpublish event showcases' });
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
    console.error('Unpublish showcase error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// EVENT SHOWCASE MEDIA API ENDPOINTS
// ----------------------------------------------------

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

/**
 * GET /api/events/:eventId/showcase/media
 * Get all media items for an event's showcase (ordered by sort_order)
 */
app.get('/api/events/:eventId/showcase/media', async (req: AuthenticatedRequest, res) => {
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

    // Check auth
    const authHeader = req.headers.authorization;
    let isOrgMember = false;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.split(' ')[1];
        const payload = await verifyAppToken(token);
        const { isMember } = await verifyOrgMembershipAndPermission(payload.sub, event.organization_id, 'game.view');
        isOrgMember = isMember;
      } catch {
        // Ignored
      }
    }

    // If not org member, only allow if showcase is PUBLISHED
    if (!isOrgMember && showcase.status !== 'PUBLISHED') {
      res.status(403).json({ error: 'Showcase is not publicly accessible' });
      return;
    }

    const media = await getShowcaseMedia(showcase.id, event.organization_id);
    res.json({ media });
  } catch (err: any) {
    console.error('Get showcase media error:', err);
    res.status(500).json({ error: err.message });
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

    const { isMember, role } = await verifyOrgMembershipAndPermission(user.id, event.organization_id, 'game.items.edit');
    if (!isMember || role === 'viewer') {
      res.status(403).json({ error: 'Permission denied: Viewers cannot upload showcase media' });
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

    const lowerMime = fileType.toLowerCase();

    // Validate type and size
    if (normalizedMediaType === 'IMAGE') {
      if (!ALLOWED_IMAGE_MIME_TYPES.has(lowerMime)) {
        res.status(422).json({
          error: `Unsupported image format (${fileType}). Supported formats: JPG, JPEG, PNG, WEBP.`,
        });
        return;
      }
      if (fileSize > MAX_IMAGE_SIZE) {
        res.status(422).json({
          error: `Image file size exceeds maximum limit of 25MB (${(fileSize / (1024 * 1024)).toFixed(1)}MB provided).`,
        });
        return;
      }
    } else {
      if (!ALLOWED_VIDEO_MIME_TYPES.has(lowerMime) && !lowerMime.startsWith('video/')) {
        res.status(422).json({
          error: `Unsupported video format (${fileType}). Supported formats: MP4, WEBM, MOV.`,
        });
        return;
      }
      if (fileSize > MAX_VIDEO_SIZE) {
        res.status(422).json({
          error: `Video file size exceeds maximum limit of 200MB (${(fileSize / (1024 * 1024)).toFixed(1)}MB provided).`,
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
    });

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
    console.error('Create showcase upload URL error:', err);
    res.status(500).json({ error: err.message });
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
  mediaUpload.single('file'),
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
      const { isMember, role } = await verifyOrgMembershipAndPermission(user.id, event.organization_id, 'game.items.edit');
      if (!isMember) {
        res.status(403).json({ error: 'Permission denied: You are not a member of this organization' });
        return;
      }
      if (role === 'viewer') {
        res.status(403).json({ error: 'Permission denied: Viewers cannot upload showcase media' });
        return;
      }

      // 3. Validate MIME Type and File Size
      const mimeType = (req.file.mimetype || 'application/octet-stream').toLowerCase();
      const fileSize = req.file.size || req.file.buffer.length;
      const isImage = ALLOWED_IMAGE_MIME_TYPES.has(mimeType) || mimeType.startsWith('image/');
      const isVideo = ALLOWED_VIDEO_MIME_TYPES.has(mimeType) || mimeType.startsWith('video/');

      if (!isImage && !isVideo) {
        res.status(422).json({
          error: `Unsupported media format (${req.file.mimetype}). Supported formats: JPG, PNG, WEBP, MP4, WEBM, MOV.`,
        });
        return;
      }

      if (isImage && fileSize > MAX_IMAGE_SIZE) {
        res.status(422).json({
          error: `Image file size exceeds maximum limit of 25MB (${(fileSize / (1024 * 1024)).toFixed(1)}MB provided).`,
        });
        return;
      }
      if (isVideo && fileSize > MAX_VIDEO_SIZE) {
        res.status(422).json({
          error: `Video file size exceeds maximum limit of 200MB (${(fileSize / (1024 * 1024)).toFixed(1)}MB provided).`,
        });
        return;
      }

      // 4. Storage Path Validation & Sandboxing (Never Trust Client-Provided Arbitrary Path)
      const expectedPrefix = `organizations/${event.organization_id}/showcases/${showcase.id}/`;
      const originalName = queryFilename || req.file.originalname || (isImage ? 'image.png' : 'video.mp4');
      const ext = path.extname(originalName) || (isImage ? '.png' : '.mp4');
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
        const { error: uploadErr } = await supabase.storage
          .from('game-assets')
          .upload(storagePath, req.file.buffer, {
            contentType: mimeType,
            upsert: true,
          });

        if (!uploadErr) {
          const { data: publicData } = supabase.storage
            .from('game-assets')
            .getPublicUrl(storagePath);

          res.json({
            url: publicData?.publicUrl || `/uploads/${path.basename(storagePath)}`,
            path: storagePath,
            fileName: originalName,
            mediaType: isImage ? 'IMAGE' : 'VIDEO',
            fileSize,
          });
          return;
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
      console.error('Direct media upload error:', err);
      res.status(500).json({ error: err.message || 'Direct upload failed' });
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

    const { isMember, role } = await verifyOrgMembershipAndPermission(user.id, event.organization_id, 'game.items.edit');
    if (!isMember || role === 'viewer') {
      res.status(403).json({ error: 'Permission denied: Viewers cannot add showcase media' });
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

    if (!media_url || typeof media_url !== 'string') {
      res.status(422).json({ error: 'media_url is required' });
      return;
    }

    if (!file_name || typeof file_name !== 'string') {
      res.status(422).json({ error: 'file_name is required' });
      return;
    }

    const media = await createShowcaseMedia({
      showcase_id: showcase.id,
      organization_id: event.organization_id,
      media_type,
      media_url,
      thumbnail_url: thumbnail_url || null,
      file_name: file_name.trim(),
      file_size: Number(file_size) || 0,
      mime_type: (mime_type || '').toLowerCase(),
      sort_order: sort_order !== undefined ? Number(sort_order) : undefined,
    });

    res.status(201).json({ media });
  } catch (err: any) {
    console.error('Create showcase media record error:', err);
    res.status(500).json({ error: err.message });
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

    const { isMember, role } = await verifyOrgMembershipAndPermission(user.id, event.organization_id, 'game.items.edit');
    if (!isMember || role === 'viewer') {
      res.status(403).json({ error: 'Permission denied: Viewers cannot reorder showcase media' });
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
    console.error('Reorder showcase media error:', err);
    res.status(500).json({ error: err.message });
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

    const { isMember, role } = await verifyOrgMembershipAndPermission(user.id, event.organization_id, 'game.items.edit');
    if (!isMember || role === 'viewer') {
      res.status(403).json({ error: 'Permission denied: Viewers cannot delete showcase media' });
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

    await deleteShowcaseMedia(mediaId, showcase.id, event.organization_id);
    res.json({ success: true });
  } catch (err: any) {
    console.error('Delete showcase media error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// DEVELOPER ADMIN API ENDPOINTS
// ----------------------------------------------------

/**
 * GET /api/developer/stats
 * Overview dashboard metrics for developer platform admin
 */
app.get('/api/developer/stats', authenticateDeveloperAdmin, async (_req, res) => {
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
    console.error('Developer stats error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/developer/games
 * List all platform games with their system theme counts
 */
app.get('/api/developer/games', authenticateDeveloperAdmin, async (_req, res) => {
  try {
    const games = await getAllPlatformGames();
    res.json({ games });
  } catch (err: any) {
    console.error('Developer get games error:', err);
    res.status(500).json({ error: err.message });
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
    console.error('Developer create game error:', err);
    if (err.code === 'GAME_TYPE_ALREADY_REGISTERED' || err.code === 'GAME_SLUG_ALREADY_REGISTERED' || err.name === 'GameConflictError') {
      res.status(409).json({ success: false, error: err.code || 'GAME_CONFLICT', message: err.message });
      return;
    }
    res.status(500).json({ error: err.message });
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
    console.error('Developer get game error:', err);
    res.status(500).json({ error: err.message });
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
    console.error('Developer update game error:', err);
    if (err.code === 'GAME_TYPE_ALREADY_REGISTERED' || err.code === 'GAME_SLUG_ALREADY_REGISTERED' || err.name === 'GameConflictError') {
      res.status(409).json({ success: false, error: err.code || 'GAME_CONFLICT', message: err.message });
      return;
    }
    res.status(500).json({ error: err.message });
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
    console.error('Developer delete game error:', err);
    if (err.code === 'GAME_IN_USE' || err.code === '23503' || err.status === 409) {
      res.status(409).json({
        success: false,
        code: 'GAME_IN_USE',
        error: err.message || 'Cannot delete game because it is used by existing events. Deactivate the game instead.',
      });
      return;
    }
    res.status(500).json({ error: err.message });
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
    console.error('Developer get game themes error:', err);
    res.status(500).json({ error: err.message });
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
    console.error('Developer create theme error:', err);
    res.status(500).json({ error: err.message });
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
    console.error('Developer get theme error:', err);
    res.status(500).json({ error: err.message });
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
    console.error('Developer update theme error:', err);
    res.status(500).json({ error: err.message });
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
    console.error('Developer delete theme error:', err);
    res.status(500).json({ error: err.message });
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
    console.error('Developer duplicate theme error:', err);
    res.status(500).json({ error: err.message });
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
    console.error('Developer set default theme error:', err);
    res.status(500).json({ error: err.message });
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
    console.error('Developer unset default theme error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// DEVELOPER & ADMIN SHOWCASE REVIEW ENDPOINTS
// ----------------------------------------------------

/**
 * GET /api/developer/showcases (or /api/admin/showcases)
 * List all showcases with event, organization, media stats, and review status
 */
const handleGetAdminShowcases = async (_req: AuthenticatedRequest, res: any) => {
  try {
    const showcases = await getAllShowcasesForAdmin();
    res.json({ showcases });
  } catch (err: any) {
    console.error('Admin get showcases error:', err);
    res.status(500).json({ error: err.message });
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
    const { showcaseId } = req.params;
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
    console.error('Approve showcase error:', err);
    if (err.code === 'SHOWCASE_NOT_FOUND') {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err.code === 'INVALID_STATUS_TRANSITION') {
      res.status(400).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: err.message });
  }
};

app.post('/api/developer/showcases/:showcaseId/approve', authenticateDeveloperAdmin, handleApproveShowcase);
app.post('/api/admin/showcases/:showcaseId/approve', authenticateDeveloperAdmin, handleApproveShowcase);

/**
 * POST /api/developer/showcases/:showcaseId/reject (or /api/admin/showcases/:showcaseId/reject)
 * Reject showcase review with required explanation reason
 */
const handleRejectShowcase = async (req: AuthenticatedRequest, res: any) => {
  try {
    const { showcaseId } = req.params;
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
    console.error('Reject showcase error:', err);
    if (err.code === 'SHOWCASE_NOT_FOUND') {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err.code === 'REJECTION_REASON_REQUIRED') {
      res.status(422).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: err.message });
  }
};

app.post('/api/developer/showcases/:showcaseId/reject', authenticateDeveloperAdmin, handleRejectShowcase);
app.post('/api/admin/showcases/:showcaseId/reject', authenticateDeveloperAdmin, handleRejectShowcase);

// ----------------------------------------------------
// PLATFORM & EVENT PRICING (DEVELOPER ADMIN)
// ----------------------------------------------------

/**
 * GET /api/platform/pricing
 * Retrieve current platform default event pricing configuration (RM1,400 default)
 */
app.get('/api/platform/pricing', async (_req, res) => {
  try {
    const settings = await getPlatformPricingSettings();
    res.json(settings);
  } catch (err: any) {
    console.error('Get platform pricing error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/developer/pricing/settings (and /api/admin/pricing/settings)
 * Developer Admin: get platform pricing configuration
 */
const handleGetAdminPricingSettings = async (_req: AuthenticatedRequest, res: any) => {
  try {
    const settings = await getPlatformPricingSettings();
    res.json({ success: true, settings });
  } catch (err: any) {
    console.error('Admin get pricing settings error:', err);
    res.status(500).json({ error: err.message });
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
    console.error('Admin update pricing settings error:', err);
    res.status(422).json({ error: err.message || 'Failed to update pricing settings' });
  }
};

app.put('/api/developer/pricing/settings', authenticateDeveloperAdmin, handleUpdateAdminPricingSettings);
app.put('/api/admin/pricing/settings', authenticateDeveloperAdmin, handleUpdateAdminPricingSettings);
app.post('/api/developer/pricing/settings', authenticateDeveloperAdmin, handleUpdateAdminPricingSettings);

/**
 * GET /api/developer/events (and /api/admin/events)
 * Developer Admin: list all events across the platform with pricing and payment details
 */
const handleGetAllAdminEvents = async (_req: AuthenticatedRequest, res: any) => {
  try {
    const events = await getAllAdminEvents();
    res.json({ success: true, events });
  } catch (err: any) {
    console.error('Admin get all events error:', err);
    res.status(500).json({ error: err.message });
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
    console.error('Admin update event price error:', err);
    if (err.code === 'EVENT_NOT_FOUND' || err.message?.includes('not found')) {
      res.status(404).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: err.message });
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
    console.error('Admin reactivate event error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to reactivate event' });
  }
};

app.post('/api/developer/events/:eventId/reactivate', authenticateDeveloperAdmin, handleReactivateAdminEvent);
app.post('/api/admin/events/:eventId/reactivate', authenticateDeveloperAdmin, handleReactivateAdminEvent);

/**
 * POST /api/developer/events/maintenance (and /api/admin/events/maintenance)
 * Developer Admin: Manually trigger event lifecycle maintenance worker
 */
const handleRunEventMaintenance = async (_req: AuthenticatedRequest, res: any) => {
  try {
    const result = await runEventLifecycleMaintenance();
    res.json({
      success: true,
      result,
      message: `Maintenance complete: ${result.cancelledCount} unpaid expired events cancelled, ${result.completedCount} expired paid events marked completed.`,
    });
  } catch (err: any) {
    console.error('Run event maintenance error:', err);
    res.status(500).json({ error: err.message || 'Failed to run event lifecycle maintenance' });
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
app.get('/api/developer/organizations', authenticateDeveloperAdmin, async (_req: AuthenticatedRequest, res: any) => {
  try {
    const organizations = await getAllOrganizationsForDeveloper();
    res.json({ success: true, organizations });
  } catch (err: any) {
    console.error('Developer get organizations error:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch developer organizations' });
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
    console.error('Developer get organization detail error:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch organization details' });
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
    console.error('Developer recalculate wallet error:', err);
    res.status(500).json({ error: err.message || 'Failed to recalculate wallet balances' });
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
    res.json({
      wallet,
      standard_event_price: STANDARD_EVENT_PRICE,
    });
  } catch (err: any) {
    console.error('Get wallet error:', err);
    res.status(500).json({ error: err.message });
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
    console.error('Get wallet transactions error:', err);
    res.status(500).json({ error: err.message });
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
    console.error('Get wallet audit trail error:', err);
    res.status(500).json({ error: err.message });
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
    console.error('Get top-up quote error:', err);
    res.status(500).json({ error: err.message });
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
    console.error('Create top-up order error:', err);
    res.status(500).json({ error: err.message });
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

    // STRICT ORGANIZATION ISOLATION: User must belong to the order's organization
    const { isMember } = await verifyOrgMembershipAndPermission(req.user!.id, order.organization_id);
    const isDev = isUserDeveloperAdmin(req.user);
    if (!isMember && !isDev) {
      res.status(403).json({ error: 'Access denied to this top-up order' });
      return;
    }

    res.json({ order });
  } catch (err: any) {
    console.error('Get top-up order error:', err);
    res.status(500).json({ error: err.message });
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
    console.error('List top-up orders error:', err);
    res.status(500).json({ error: err.message });
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
    console.error('Process top-up order status error:', err);
    res.status(err.status || 500).json({ error: err.message });
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
    console.error('Create payment checkout session error:', err);
    res.status(500).json({ error: err.message });
  }
};

app.post('/api/wallet/topups/:id/checkout', walletRateLimiter, authenticateJWT, handleCreateCheckoutSession);
app.post('/api/organizations/:orgId/wallet/topup-orders/:id/checkout', walletRateLimiter, authenticateJWT, handleCreateCheckoutSession);

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
    console.error('Payment webhook processing error:', err.message);
    const statusCode = err.status || (err.code === 'INVALID_SIGNATURE' ? 400 : 422);
    res.status(statusCode).json({
      error: err.message || 'Payment webhook verification failed',
      code: err.code || 'WEBHOOK_VERIFICATION_FAILED',
    });
  }
};

app.post('/api/webhooks/payment', handlePaymentWebhook);
app.post('/api/wallet/webhooks/payment', handlePaymentWebhook);

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
    console.error('Test webhook error:', err);
    res.status(err.status || 500).json({ error: err.message });
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
    console.error('Developer top-up reconciliation error:', err);
    res.status(err.status || 400).json({ error: err.message });
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
    console.error('Prepare top-up order error:', err);
    res.status(500).json({ error: err.message });
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
    console.error('Get top-up order error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/organizations/:orgId/wallet/grant-welcome
 * Internal / Admin fallback endpoint to grant one-time Welcome Credit (RM800.00).
 * Welcome Credit is granted automatically upon organization creation; this endpoint
 * is restricted to verified developer admins for administrative maintenance / backfill.
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
      res.status(403).json({ error: 'Welcome credit is automatically granted upon organization creation. Manual invocation is restricted to system administrators.' });
      return;
    }

    const result = await grantWelcomeCredit({
      organizationId: orgId,
      createdBy: req.user!.id,
      referenceId: req.body?.reference_id,
      metadata: req.body?.metadata,
    });

    res.json({
      success: true,
      transaction: result.transaction,
      wallet: result.wallet,
      already_granted: result.alreadyGranted,
    });
  } catch (err: any) {
    console.error('Grant welcome credit error:', err);
    res.status(500).json({ error: err.message });
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
    console.error('Can use welcome credit error:', err);
    res.status(500).json({ error: err.message });
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
    console.error('Consume welcome credit error:', err);
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/organizations/:orgId/wallet/grant-showcase
 * Grant one-time Showcase Credit (RM300.00)
 */
app.post('/api/organizations/:orgId/wallet/grant-showcase', walletRateLimiter, authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const { orgId } = req.params;
    if (!isUUID(orgId)) {
      res.status(400).json({ error: `Invalid organization ID format: ${orgId}` });
      return;
    }

    const { isMember, role } = await verifyOrgMembershipAndPermission(req.user!.id, orgId);
    const isDev = isUserDeveloperAdmin(req.user);
    if ((!isMember || (role !== 'owner' && role !== 'admin')) && !isDev) {
      res.status(403).json({ error: 'Only organization owners and admins can claim showcase credit' });
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
    console.error('Grant showcase credit error:', err);
    res.status(500).json({ error: err.message });
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
    console.error('Can use showcase credit error:', err);
    res.status(500).json({ error: err.message });
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
    console.error('Consume showcase credit error:', err);
    res.status(400).json({ error: err.message });
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
    const price = event_price ? Number(event_price) : STANDARD_EVENT_PRICE;
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
    console.error('Calculate event payment error:', err);
    res.status(500).json({ error: err.message });
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
    console.error('Quote payment error:', err);
    res.status(500).json({ error: err.message });
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

    const { isMember, role } = await verifyOrgMembershipAndPermission(req.user!.id, orgId);
    const isDev = isUserDeveloperAdmin(req.user);
    if ((!isMember || (role !== 'owner' && role !== 'admin' && role !== 'designer')) && !isDev) {
      res.status(403).json({ error: 'Insufficient permissions to pay for event' });
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
    console.error('Process event payment error:', err);
    res.status(400).json({ error: err.message });
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
    console.error('Recalculate wallet error:', err);
    res.status(500).json({ error: err.message });
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
    console.error('Reverse transaction error:', err);
    res.status(500).json({ error: err.message });
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
    console.error('Error generating Google connect URL:', err);
    res.status(500).json({ error: err.message || 'Failed to initiate Google OAuth connect' });
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
    res.redirect(302, `${redirectErrorBase}&reason=exchange_failed&detail=${encodeURIComponent(err.message || '')}`);
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
    console.error('Error fetching Google Mail status:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch Google Mail status' });
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
    console.error('Error disconnecting Google Mail:', err);
    res.status(500).json({ error: err.message || 'Failed to disconnect Google Mail' });
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
    console.error('Test email sending error:', err);
    res.status(500).json({
      error: err.message || 'Failed to dispatch test email via Gmail API',
    });
  }
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
