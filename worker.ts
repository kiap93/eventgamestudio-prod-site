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
  updateGameCustomization,
  ensureDefaultThemes,
  getThemeById,
  createTheme,
  updateTheme,
  duplicateTheme,
  activateTheme,
  deleteTheme,
  uploadGameAsset,
} from './server/db/index.js';

import {
  signAppToken,
  verifyAppToken,
  verifyGoogleIdToken,
  verifyOrgMembershipAndPermission,
  hashToken,
  AppJWTPayload,
} from './server/auth.js';

import { getSupabaseServerClient } from './server/supabase.js';

export interface Env {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  JWT_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  VITE_GOOGLE_CLIENT_ID?: string;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  [key: string]: any;
}

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Organization-ID',
    'Access-Control-Allow-Credentials': 'true',
  };
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
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      authenticated: false,
      errorResponse: errorResponse('Unauthenticated: Missing or invalid Authorization header', 401, cors),
    };
  }

  const token = authHeader.substring(7);

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
  } catch (_appErr) {
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
    const cors = corsHeaders(request);

    // Handle CORS preflight OPTIONS requests
    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: cors,
      });
    }

    try {
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
          },
          env
        );

        const inviteUrl = `/accept-invite?token=${rawToken}`;

        return jsonResponse(
          {
            invitation: {
              id: invitation.id,
              email: invitation.email,
              role: invitation.role,
              expires_at: invitation.expires_at,
              organizationName: org.name,
            },
            inviteToken: rawToken,
            inviteUrl,
          },
          200,
          cors
        );
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

        const formData = await request.formData().catch(() => null);
        if (!formData) {
          return errorResponse('Invalid form data', 422, cors);
        }

        const file = formData.get('file');
        if (!file || typeof file === 'string') {
          return errorResponse('No file uploaded', 422, cors);
        }

        const orgId = auth.jwtPayload?.organizationId || 'default';
        const category = (formData.get('category') as string) || 'general';

        try {
          const arrayBuffer = await file.arrayBuffer();
          const result = await uploadGameAsset(
            {
              organizationId: orgId,
              category: category as any,
              fileBuffer: new Uint8Array(arrayBuffer),
              originalName: file.name || 'uploaded_asset.png',
              mimeType: file.type || 'image/png',
            },
            env
          );

          return jsonResponse({ url: result.url }, 200, cors);
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

        const org = await getOrganizationById(organizationId, env);
        const themes = await ensureDefaultThemes(organizationId, org?.name || 'Studio', env);

        return jsonResponse({ themes }, 200, cors);
      }

      const getThemeParams = parseRoute('/api/themes/:themeId', pathname);
      if (getThemeParams && method === 'GET') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const user = auth.user!;
        const { themeId } = getThemeParams;

        const theme = await getThemeById(themeId, env);
        if (!theme) {
          return errorResponse('Theme not found', 404, cors);
        }

        const { isMember } = await verifyOrgMembershipAndPermission(user.id, theme.organization_id, 'game.view', env);
        if (!isMember) {
          return errorResponse('Access denied to this theme', 403, cors);
        }

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
        } = body;

        if (!name || typeof name !== 'string') {
          return errorResponse('Theme name is required', 422, cors);
        }

        const theme = await createTheme(
          {
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
          },
          env
        );

        return jsonResponse({ theme }, 201, cors);
      }

      const updateThemeParams = parseRoute('/api/themes/:themeId', pathname);
      if (updateThemeParams && method === 'PUT') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const user = auth.user!;
        const { themeId } = updateThemeParams;

        const theme = await getThemeById(themeId, env);
        if (!theme) {
          return errorResponse('Theme not found', 404, cors);
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
          is_active,
          branding,
          background_url,
          basket_config,
          items_config,
          physics_config,
          visuals_config,
          sounds_config,
        } = body;

        const updatedTheme = await updateTheme(
          themeId,
          {
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
          },
          env
        );

        return jsonResponse({ theme: updatedTheme }, 200, cors);
      }

      const duplicateThemeParams = parseRoute('/api/themes/:themeId/duplicate', pathname);
      if (duplicateThemeParams && method === 'POST') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const user = auth.user!;
        const { themeId } = duplicateThemeParams;
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

      const activateThemeParams = parseRoute('/api/themes/:themeId/activate', pathname);
      if (activateThemeParams && method === 'POST') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const user = auth.user!;
        const { themeId } = activateThemeParams;

        const theme = await getThemeById(themeId, env);
        if (!theme) {
          return errorResponse('Theme not found', 404, cors);
        }

        const { isMember, role } = await verifyOrgMembershipAndPermission(user.id, theme.organization_id, 'game.items.edit', env);
        if (!isMember || role === 'viewer') {
          return errorResponse('Permission denied: Cannot activate themes', 403, cors);
        }

        const activeTheme = await activateTheme(theme.organization_id, themeId, env);
        return jsonResponse({ theme: activeTheme }, 200, cors);
      }

      const deleteThemeParams = parseRoute('/api/themes/:themeId', pathname);
      if (deleteThemeParams && method === 'DELETE') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const user = auth.user!;
        const { themeId } = deleteThemeParams;

        const theme = await getThemeById(themeId, env);
        if (!theme) {
          return errorResponse('Theme not found', 404, cors);
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

        let games = await getGamesByOrgId(organizationId, env);
        if (games.length === 0) {
          const org = await getOrganizationById(organizationId, env);
          const defaultGame = await ensureDefaultGame(organizationId, org?.name || 'Studio', env);
          games = [defaultGame];
        }

        return jsonResponse({ games }, 200, cors);
      }

      const getGameParams = parseRoute('/api/games/:gameId', pathname);
      if (getGameParams && method === 'GET') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const user = auth.user!;
        const { gameId } = getGameParams;

        const game = await getGameById(gameId, env);
        if (!game) {
          return errorResponse('Game not found', 404, cors);
        }

        const { isMember } = await verifyOrgMembershipAndPermission(user.id, game.organization_id, 'game.view', env);
        if (!isMember) {
          return errorResponse('Access denied to this game', 403, cors);
        }

        return jsonResponse({ game }, 200, cors);
      }

      const updateGameParams = parseRoute('/api/games/:gameId/customization', pathname);
      if (updateGameParams && method === 'PUT') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const user = auth.user!;
        const { gameId } = updateGameParams;
        const body = (await request.json().catch(() => ({}))) as any;
        const { background_url, basket_config, items_config, settings_config, name } = body;

        const game = await getGameById(gameId, env);
        if (!game) {
          return errorResponse('Game not found', 404, cors);
        }

        let requiredPerm = 'game.view';
        if (background_url !== undefined) requiredPerm = 'game.background.edit';
        else if (items_config !== undefined) requiredPerm = 'game.items.edit';
        else if (basket_config !== undefined) requiredPerm = 'game.basket.edit';
        else if (settings_config !== undefined) requiredPerm = 'game.settings.edit';

        const { isMember, role } = await verifyOrgMembershipAndPermission(user.id, game.organization_id, requiredPerm, env);
        if (!isMember) {
          return errorResponse('Access denied: Not an organization member', 403, cors);
        }

        if (role === 'viewer') {
          return errorResponse('Viewers cannot modify game customization', 403, cors);
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

      return errorResponse('Not found', 404, cors);
    } catch (err: any) {
      console.error('Unhandled worker error:', err);
      return errorResponse(err.message || 'Internal Server Error', 500, cors);
    }
  },
};
