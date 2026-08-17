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
  createEvent,
  updateEvent,
  deleteEvent,
  cancelEvent,
  getAllPlatformGames,
  createPlatformGame,
  updatePlatformGame,
  deletePlatformGame,
  getAllSystemThemes,
  getSystemThemesByGameId,
  createSystemTheme,
  updateSystemTheme,
  deleteSystemTheme,
  duplicateSystemTheme,
  setPrimaryDefaultSystemTheme,
  unsetPrimaryDefaultSystemTheme,
  cloneSystemThemeToOrg,
  cloneAllSystemThemesToOrg,
} from './server/db/index.js';

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

export interface Env {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  JWT_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  VITE_GOOGLE_CLIENT_ID?: string;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  ASSETS?: {
    fetch: (request: Request | string) => Promise<Response>;
  };
  [key: string]: any;
}

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin');
  const reqHeaders = request.headers.get('Access-Control-Request-Headers');

  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': reqHeaders || 'Content-Type, Authorization, X-Organization-ID, Accept',
    'Access-Control-Max-Age': '86400',
  };

  if (origin && origin !== 'null') {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
    headers['Vary'] = 'Origin';
  } else {
    headers['Access-Control-Allow-Origin'] = '*';
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
      // If the request is not an API route and env.ASSETS is available, delegate to Cloudflare Assets with SPA fallback
      if (!pathname.startsWith('/api') && env.ASSETS && typeof env.ASSETS.fetch === 'function') {
        const assetResponse = await env.ASSETS.fetch(request);
        if (assetResponse.status !== 404) {
          return assetResponse;
        }
        // Fallback for client-side SPA routing (e.g. /developer, /events, /studio, /e/:token)
        const spaUrl = new URL(request.url);
        spaUrl.pathname = '/index.html';
        return await env.ASSETS.fetch(new Request(spaUrl.toString(), request));
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
        } = body;

        if (!name || typeof name !== 'string') {
          return errorResponse('Theme name is required', 422, cors);
        }

        try {
          const theme = await createTheme(
            {
              organization_id: organizationId,
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

      const getGameThemesParams = parseRoute('/api/games/:gameId/themes', pathname);
      if (getGameThemesParams && method === 'GET') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const user = auth.user!;
        const { gameId } = getGameThemesParams;

        const game = await getGameById(gameId, env);
        if (!game) {
          return errorResponse('Game not found', 404, cors);
        }

        const { isMember } = await verifyOrgMembershipAndPermission(user.id, game.organization_id, 'game.view', env);
        if (!isMember) {
          return errorResponse('Access denied to this game', 403, cors);
        }

        const themes = await getThemesByOrgId(game.organization_id, gameId, env);
        return jsonResponse({ themes }, 200, cors);
      }

      // ==========================================
      // 8. Events & Public Deployment Routes
      // ==========================================
      if (pathname === '/api/events' && method === 'GET') {
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

        const events = await getEventsByOrgId(organizationId, env);
        return jsonResponse({ events }, 200, cors);
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
        const { name, game_theme_id, event_date, starts_at, expires_at, status } = body;

        if (!name || typeof name !== 'string' || !name.trim()) {
          return errorResponse('Event name is required', 422, cors);
        }

        if (!game_theme_id) {
          return errorResponse('Game Theme selection is required', 422, cors);
        }

        if (!starts_at || !expires_at) {
          return errorResponse('Start time and Expiry time are required', 422, cors);
        }

        const event = await createEvent(
          {
            organization_id: organizationId,
            game_theme_id,
            name,
            event_date,
            starts_at,
            expires_at,
            status,
            created_by: user.id,
          },
          env
        );

        const enrichedEvent = await getEventById(event.id, env);
        return jsonResponse({ event: enrichedEvent }, 201, cors);
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
        const { name, game_theme_id, event_date, starts_at, expires_at, status } = body;

        const updated = await updateEvent(
          eventId,
          {
            name,
            game_theme_id,
            event_date,
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

        const cancelled = await cancelEvent(eventId, env);
        const enriched = await getEventById(cancelled.id, env);
        return jsonResponse({ event: enriched }, 200, cors);
      }

      const publicEventParams = parseRoute('/api/public/events/:publicToken', pathname);
      if (publicEventParams && method === 'GET') {
        const { publicToken } = publicEventParams;
        if (!publicToken) {
          return errorResponse('Public token required', 422, cors);
        }

        const event = await getEventByPublicToken(publicToken, env);
        if (!event) {
          return errorResponse('Event not found or invalid URL', 404, cors);
        }

        return jsonResponse({ event }, 200, cors);
      }

      // ==========================================
      // 10. Developer Admin Routes
      // ==========================================

      // GET /api/developer/stats
      if (pathname === '/api/developer/stats' && method === 'GET') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;
        if (!isUserDeveloperAdmin(auth.user, env)) {
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
        if (!isUserDeveloperAdmin(auth.user, env)) {
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

      if (devGameDetailParams && method === 'PUT') {
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
          return jsonResponse({ success: true }, 200, cors);
        } catch (err: any) {
          console.error('Developer delete game error:', err);
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

      return errorResponse('Not found', 404, cors);
    } catch (err: any) {
      console.error('Unhandled worker error:', err);
      return errorResponse(err.message || 'Internal Server Error', 500, cors);
    }
  },
};
