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
  updateGameCustomization,
  uploadGameAsset,
  getThemesByOrgId,
  getThemeById,
  createTheme,
  updateTheme,
  deleteTheme,
  activateTheme,
  duplicateTheme,
  ensureDefaultThemes,
} from './server/db/index.js';

import {
  authenticateJWT,
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

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar_url: user.avatar_url,
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
 * List all themes for active organization
 */
app.get('/api/themes', authenticateJWT, async (req: AuthenticatedRequest, res) => {
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
    let themes = await ensureDefaultThemes(organizationId, org?.name || 'Studio');

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
 * Create new theme for organization
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
      description,
      status,
      is_active,
      branding,
      background_url,
      basket_config,
      items_config,
      physics_config,
      visuals_config,
      sounds_config,
    } = req.body;

    if (!name || typeof name !== 'string') {
      res.status(422).json({ error: 'Theme name is required' });
      return;
    }

    const theme = await createTheme({
      organization_id: organizationId,
      name,
      slug,
      description,
      status,
      is_active,
      branding,
      background_url,
      basket_config,
      items_config,
      physics_config,
      visuals_config,
      sounds_config,
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
      is_active,
      branding,
      background_url,
      basket_config,
      items_config,
      physics_config,
      visuals_config,
      sounds_config,
    } = req.body;

    const updatedTheme = await updateTheme(themeId, {
      name,
      slug,
      description,
      status,
      is_active,
      branding,
      background_url,
      basket_config,
      items_config,
      physics_config,
      visuals_config,
      sounds_config,
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
 * POST /api/themes/:themeId/activate
 * Set theme as the active theme for the organization
 */
app.post('/api/themes/:themeId/activate', authenticateJWT, async (req: AuthenticatedRequest, res) => {
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
      res.status(403).json({ error: 'Permission denied: Cannot activate themes' });
      return;
    }

    const activeTheme = await activateTheme(theme.organization_id, themeId);
    res.json({ theme: activeTheme });
  } catch (err: any) {
    console.error('Activate theme error:', err);
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
 * Get primary game for active organization from Supabase
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

    let games = await getGamesByOrgId(organizationId);
    if (games.length === 0) {
      const org = await getOrganizationById(organizationId);
      const defaultGame = await ensureDefaultGame(organizationId, org?.name || 'Studio');
      games = [defaultGame];
    }

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
 * PUT /api/games/:gameId/customization
 * Update game customization (background, basket, items, settings) in Supabase
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

    // Determine permission needed
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
