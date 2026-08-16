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
  cloneSystemThemeToOrg,
  ensureSystemDefaultThemesForGame,
  getEventsByOrgId,
  getEventById,
  getEventByPublicToken,
  createEvent,
  updateEvent,
  deleteEvent,
  cancelEvent,
} from './server/db/index.js';

import {
  authenticateJWT,
  authenticateDeveloperAdmin,
  isUserDeveloperAdmin,
  signAppToken,
  verifyGoogleIdToken,
  verifyOrgMembershipAndPermission,
  hashToken,
  AuthenticatedRequest,
} from './server/auth.js';

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
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
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
 * GET /api/themes/:themeId
 * Get single theme details
 */
app.get('/api/themes/:themeId', authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { themeId } = req.params;

    const theme = await getThemeById(themeId);
    if (!theme) {
      res.status(404).json({ error: 'Theme not found' });
      return;
    }

    const { isMember } = await verifyOrgMembershipAndPermission(user.id, theme.organization_id, 'game.view');
    if (!isMember) {
      res.status(403).json({ error: 'Access denied to this theme' });
      return;
    }

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
 * GET /api/themes/system
 * List system default theme templates available for any organization to clone
 */
app.get('/api/themes/system', authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const gameId = req.query.gameId as string | undefined;
    let themes: any[] = [];
    if (gameId) {
      themes = await getSystemThemesByGameId(gameId);
    } else {
      themes = await getAllSystemThemes();
    }
    res.json({ themes });
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
 * DELETE /api/themes/:themeId
 * Delete a theme
 */
app.delete('/api/themes/:themeId', authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { themeId } = req.params;

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

    const themes = await getSystemThemesByGameId(gameId);
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
    const themes = await getSystemThemesByGameId(gameId);
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
    const theme = await getThemeById(themeId);
    if (!theme || !theme.game_id) {
      res.status(404).json({ error: 'Theme not found or missing game link' });
      return;
    }

    // Mark this theme as default (updateSystemTheme unsets previous defaults for this game)
    const updatedTheme = await updateSystemTheme(themeId, { is_default: true });

    res.json({ success: true, theme: updatedTheme });
  } catch (err: any) {
    console.error('Developer set default theme error:', err);
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
