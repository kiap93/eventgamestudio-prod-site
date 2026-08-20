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
  createEvent,
  updateEvent,
  deleteEvent,
  cancelEvent,
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
  reverseTransaction,
  recalculateWalletBalances,
  STANDARD_EVENT_PRICE,
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

import { getSupabaseServerClient } from './server/supabase.js';


const app = express();
const PORT = 3000;

app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

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
app.post('/api/auth/google', async (req, res) => {
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

    const isDev = isUserDeveloperAdmin(user);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar_url: user.avatar_url,
        is_developer: isDev,
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

    const isDev = isUserDeveloperAdmin(user);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar_url: user.avatar_url,
        is_developer: isDev,
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
app.post('/api/auth/switch-org', authenticateJWT, async (req: AuthenticatedRequest, res) => {
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
app.post('/api/organizations', authenticateJWT, async (req: AuthenticatedRequest, res) => {
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
app.post('/api/organizations/:organizationId/invitations', authenticateJWT, async (req: AuthenticatedRequest, res) => {
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

    const inviteUrl = `/accept-invite?token=${rawToken}`;

    res.json({
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        expires_at: invitation.expires_at,
        organizationName: org.name,
      },
      inviteToken: rawToken,
      inviteUrl,
    });
  } catch (err: any) {
    console.error('Create invitation error:', err);
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
app.post('/api/invitations/accept', async (req, res) => {
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
 * Upload game asset (backgrounds, baskets, items, logos) to Supabase Storage
 */
app.post('/api/upload', authenticateJWT, upload.single('file'), async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.file) {
      res.status(422).json({ error: 'No file uploaded' });
      return;
    }

    const orgId = req.jwtPayload?.organizationId || 'default';
    const category = (req.body.category as any) || 'general';

    try {
      // Attempt Supabase Storage upload
      const result = await uploadGameAsset({
        organizationId: orgId,
        category,
        fileBuffer: req.file.buffer,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
      });

      res.json({ url: result.url });
    } catch (storageErr: any) {
      console.warn('Supabase storage upload fallback:', storageErr.message);

      // Fallback to local disk storage if Supabase credentials are not yet configured in dev
      const ext = path.extname(req.file.originalname) || '.png';
      const filename = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
      const localFilePath = path.join(uploadDir, filename);
      fs.writeFileSync(localFilePath, req.file.buffer);

      const fileUrl = `/uploads/${filename}`;
      res.json({ url: fileUrl });
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
 * Get games catalog for active organization from Supabase
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

    const org = await getOrganizationById(organizationId);
    const games = await ensureDefaultGames(organizationId, org?.name || 'Studio');

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
 * GET /api/events
 * List all events for the active organization
 */
app.get('/api/events', authenticateJWT, async (req: AuthenticatedRequest, res) => {
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
 * POST /api/events
 * Create a new event deployment linking a Game Theme
 */
app.post('/api/events', authenticateJWT, async (req: AuthenticatedRequest, res) => {
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

    const { name, game_theme_id, event_date, starts_at, expires_at, status } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      res.status(422).json({ error: 'Event name is required' });
      return;
    }

    if (!game_theme_id) {
      res.status(422).json({ error: 'Game Theme selection is required' });
      return;
    }

    if (!starts_at || !expires_at) {
      res.status(422).json({ error: 'Start time and Expiry time are required' });
      return;
    }

    const event = await createEvent({
      organization_id: organizationId,
      game_theme_id,
      name,
      event_date,
      starts_at,
      expires_at,
      status,
      created_by: user.id,
    });

    const enrichedEvent = await getEventById(event.id);
    res.status(201).json({ event: enrichedEvent });
  } catch (err: any) {
    console.error('Create event error:', err);
    res.status(500).json({ error: err.message });
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

    const { name, game_theme_id, event_date, starts_at, expires_at, status } = req.body;

    const updated = await updateEvent(eventId, {
      name,
      game_theme_id,
      event_date,
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
 * POST /api/events/:eventId/cancel
 * Cancel an active or scheduled event
 */
app.post('/api/events/:eventId/cancel', authenticateJWT, async (req: AuthenticatedRequest, res) => {
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

    const cancelled = await cancelEvent(eventId);
    const enriched = await getEventById(cancelled.id);
    res.json({ event: enriched });
  } catch (err: any) {
    console.error('Cancel event error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/public/events/:publicToken
 * Public unauthenticated endpoint for event players
 */
app.get('/api/public/events/:publicToken', async (req, res) => {
  try {
    const { publicToken } = req.params;
    if (!publicToken) {
      res.status(422).json({ error: 'Public token required' });
      return;
    }

    const event = await getEventByPublicToken(publicToken);
    if (!event) {
      res.status(404).json({ error: 'Event not found or invalid URL' });
      return;
    }

    res.json({ event });
  } catch (err: any) {
    console.error('Public event resolution error:', err);
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
app.post('/api/events/:eventId/showcase', authenticateJWT, async (req: AuthenticatedRequest, res) => {
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
app.patch('/api/events/:eventId/showcase', authenticateJWT, async (req: AuthenticatedRequest, res) => {
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
app.post('/api/events/:eventId/showcase/submit', authenticateJWT, async (req: AuthenticatedRequest, res) => {
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
app.post('/api/events/:eventId/showcase/publish', authenticateJWT, async (req: AuthenticatedRequest, res) => {
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
app.post('/api/events/:eventId/showcase/unpublish', authenticateJWT, async (req: AuthenticatedRequest, res) => {
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
app.post('/api/events/:eventId/showcase/media/upload-url', authenticateJWT, async (req: AuthenticatedRequest, res) => {
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
 * Direct binary streaming upload for media files (bypasses Supabase signed constraints if needed)
 */
app.post('/api/events/showcase-media/direct-upload', authenticateJWT, mediaUpload.single('file'), async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.file) {
      res.status(422).json({ error: 'No media file provided' });
      return;
    }

    const targetPath = (req.query.path as string) || (req.body.path as string);
    const originalName = req.file.originalname || (req.query.filename as string) || 'media-file';

    try {
      const supabase = getSupabaseServerClient();
      const storagePath = targetPath || `showcases/general/${Date.now()}-${originalName}`;

      const { error: uploadErr } = await supabase.storage
        .from('game-assets')
        .upload(storagePath, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: true,
        });

      if (!uploadErr) {
        const { data: publicData } = supabase.storage
          .from('game-assets')
          .getPublicUrl(storagePath);

        res.json({
          url: publicData?.publicUrl || `/uploads/${path.basename(storagePath)}`,
          path: storagePath,
        });
        return;
      }
    } catch (sErr) {
      console.warn('Direct upload to Supabase storage fallback:', sErr);
    }

    // Fallback to local /uploads/ directory
    const ext = path.extname(originalName) || '.dat';
    const filename = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
    const localFilePath = path.join(uploadDir, filename);
    fs.writeFileSync(localFilePath, req.file.buffer);

    const publicUrl = `/uploads/${filename}`;
    res.json({ url: publicUrl, path: publicUrl });
  } catch (err: any) {
    console.error('Direct media upload error:', err);
    res.status(500).json({ error: err.message || 'Direct upload failed' });
  }
});

/**
 * POST /api/events/:eventId/showcase/media
 * Add a new media item record to showcase after successful upload
 */
app.post('/api/events/:eventId/showcase/media', authenticateJWT, async (req: AuthenticatedRequest, res) => {
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
app.patch('/api/events/:eventId/showcase/media/reorder', authenticateJWT, async (req: AuthenticatedRequest, res) => {
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
app.delete('/api/events/:eventId/showcase/media/:mediaId', authenticateJWT, async (req: AuthenticatedRequest, res) => {
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
 * Update platform game metadata and defaults
 */
app.put('/api/developer/games/:gameId', authenticateDeveloperAdmin, async (req: AuthenticatedRequest, res) => {
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
});

/**
 * DELETE /api/developer/games/:gameId
 * Delete a platform game
 */
app.delete('/api/developer/games/:gameId', authenticateDeveloperAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { gameId } = req.params;
    await deletePlatformGame(gameId);
    res.json({ success: true });
  } catch (err: any) {
    console.error('Developer delete game error:', err);
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

    const result = await getWalletTransactions(orgId, {
      limit,
      offset,
      balanceType,
      transactionType,
    });

    res.json(result);
  } catch (err: any) {
    console.error('Get wallet transactions error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/organizations/:orgId/wallet/topup
 * Process deposit / top-up and automatically calculate promotional credit
 */
app.post('/api/organizations/:orgId/wallet/topup', authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const { orgId } = req.params;
    if (!isUUID(orgId)) {
      res.status(400).json({ error: `Invalid organization ID format: ${orgId}` });
      return;
    }

    const { isMember, role } = await verifyOrgMembershipAndPermission(req.user!.id, orgId);
    const isDev = isUserDeveloperAdmin(req.user);
    if ((!isMember || (role !== 'owner' && role !== 'admin')) && !isDev) {
      res.status(403).json({ error: 'Only organization owners and admins can top-up the wallet' });
      return;
    }

    const { amount, currency, reference_id, description, metadata } = req.body;
    const numericAmount = Number(amount);

    if (isNaN(numericAmount) || numericAmount <= 0) {
      res.status(400).json({ error: 'Amount must be a positive number' });
      return;
    }

    const result = await createTopup({
      organizationId: orgId,
      amount: numericAmount,
      currency: currency || 'MYR',
      referenceId: reference_id,
      description,
      metadata,
      createdBy: req.user!.id,
    });

    res.status(201).json({
      success: true,
      topup_transaction: result.topupTransaction,
      promo_credit_transaction: result.promoCreditTransaction,
      wallet: result.wallet,
    });
  } catch (err: any) {
    console.error('Wallet top-up error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/organizations/:orgId/wallet/grant-welcome
 * Grant one-time Welcome Credit (RM800.00)
 */
app.post('/api/organizations/:orgId/wallet/grant-welcome', authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const { orgId } = req.params;
    if (!isUUID(orgId)) {
      res.status(400).json({ error: `Invalid organization ID format: ${orgId}` });
      return;
    }

    const { isMember, role } = await verifyOrgMembershipAndPermission(req.user!.id, orgId);
    const isDev = isUserDeveloperAdmin(req.user);
    if ((!isMember || (role !== 'owner' && role !== 'admin')) && !isDev) {
      res.status(403).json({ error: 'Only organization owners and admins can claim welcome credit' });
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
app.post('/api/organizations/:orgId/wallet/consume-welcome', authenticateJWT, async (req: AuthenticatedRequest, res) => {
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
app.post('/api/organizations/:orgId/wallet/grant-showcase', authenticateJWT, async (req: AuthenticatedRequest, res) => {
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
app.post('/api/organizations/:orgId/wallet/consume-showcase', authenticateJWT, async (req: AuthenticatedRequest, res) => {
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
app.post('/api/organizations/:orgId/wallet/calculate-event-payment', authenticateJWT, async (req: AuthenticatedRequest, res) => {
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
app.post('/api/organizations/:orgId/wallet/quote-payment', authenticateJWT, async (req: AuthenticatedRequest, res) => {
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
app.post('/api/organizations/:orgId/wallet/pay-event', authenticateJWT, async (req: AuthenticatedRequest, res) => {
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

// ----------------------------------------------------
// VITE AND SERVING FRONTEND
// ----------------------------------------------------

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
