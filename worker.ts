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
  createEventWithAtomicPayment,
  updateEvent,
  deleteEvent,
  cancelEvent,
  canCancelEvent,
  determineEventRefund,
  PaymentMode,
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

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin');
  const reqHeaders = request.headers.get('Access-Control-Request-Headers');

  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
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
        const { game_theme_id, payment_mode, topup_credit_requested, event_price } = body;
        const price = typeof event_price === 'number' && event_price > 0 ? event_price : STANDARD_EVENT_PRICE;

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
          { topupCreditRequested: topup_credit_requested },
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
          currency: 'MYR',
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
          game_theme_id,
          event_date,
          starts_at,
          expires_at,
          status,
          payment_mode = 'FULL_PAID',
          topup_credit_requested,
          event_price,
          reference_id,
        } = body;

        if (!name || typeof name !== 'string' || !name.trim()) {
          return errorResponse('Event name is required', 422, cors);
        }

        if (!game_theme_id) {
          return errorResponse('Game Theme selection is required', 422, cors);
        }

        if (!starts_at || !expires_at) {
          return errorResponse('Start time and Expiry time are required', 422, cors);
        }

        try {
          // Execute atomic creation + financial ledger payment
          const result = await createEventWithAtomicPayment(
            {
              organization_id: organizationId,
              game_theme_id,
              name,
              event_date,
              starts_at,
              expires_at,
              status,
              created_by: user.id,
              payment_mode,
              topup_credit_requested,
              event_price,
              reference_id,
            },
            env
          );

          return jsonResponse({
            success: true,
            event: result.event,
            payment: result.payment,
          }, 201, cors);
        } catch (err: any) {
          console.error('Create event error in worker:', err);
          if (err.message && err.message.toLowerCase().includes('insufficient')) {
            return jsonResponse({
              error: err.message,
              code: 'INSUFFICIENT_FUNDS',
            }, 402, cors);
          }
          return errorResponse(err.message || 'Failed to create event', err.status || 500, cors);
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

        const event = await getEventByPublicToken(publicToken, env);
        if (!event) {
          return errorResponse('Event not found or invalid URL', 404, cors);
        }

        return jsonResponse({ event }, 200, cors);
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

      // POST /api/events/showcase-media/direct-upload
      if (pathname === '/api/events/showcase-media/direct-upload' && method === 'POST') {
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        try {
          const formData = await request.formData().catch(() => null);
          const targetPath = url.searchParams.get('path') || (formData?.get('path') as string) || undefined;
          const queryFilename = url.searchParams.get('filename') || undefined;

          let fileBuffer: ArrayBuffer | null = null;
          let mimeType = 'application/octet-stream';
          let originalName = queryFilename || 'media-file';

          if (formData) {
            const file = formData.get('file');
            if (file && typeof file !== 'string') {
              fileBuffer = await file.arrayBuffer();
              mimeType = file.type || mimeType;
              originalName = file.name || originalName;
            }
          }

          if (!fileBuffer) {
            fileBuffer = await request.arrayBuffer();
            mimeType = request.headers.get('content-type') || mimeType;
          }

          if (!fileBuffer || fileBuffer.byteLength === 0) {
            return errorResponse('No media file provided', 422, cors);
          }

          const supabase = getSupabaseServerClient(env);
          const storagePath = targetPath || `showcases/general/${Date.now()}-${originalName}`;

          const { error: uploadErr } = await supabase.storage
            .from('game-assets')
            .upload(storagePath, fileBuffer, {
              contentType: mimeType,
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

        try {
          const result = await getWalletTransactions(orgId, { limit, offset, balanceType, transactionType }, env);
          return jsonResponse(result, 200, cors);
        } catch (err: any) {
          return errorResponse(err.message || 'Failed to get transactions', 500, cors);
        }
      }

      // POST /api/organizations/:orgId/wallet/topup
      const orgWalletTopupMatch = pathname.match(/^\/api\/organizations\/([^\/]+)\/wallet\/topup$/);
      if (orgWalletTopupMatch && method === 'POST') {
        const orgId = orgWalletTopupMatch[1];
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const { isMember, role } = await verifyOrgMembershipAndPermission(auth.user.id, orgId, undefined, env);
        const isDev = isUserDeveloperAdmin(auth.user, env);
        if ((!isMember || (role !== 'owner' && role !== 'admin')) && !isDev) {
          return errorResponse('Forbidden: Only organization owners and admins can top-up the wallet', 403, cors);
        }

        const body = (await request.json().catch(() => ({}))) as any;
        const amount = Number(body.amount);
        if (isNaN(amount) || amount <= 0) {
          return errorResponse('Amount must be a positive number', 400, cors);
        }

        try {
          const result = await createTopup(
            {
              organizationId: orgId,
              amount,
              currency: body.currency || 'MYR',
              referenceId: body.reference_id,
              description: body.description,
              metadata: body.metadata,
              createdBy: auth.user.id,
            },
            env
          );
          return jsonResponse(
            {
              success: true,
              topup_transaction: result.topupTransaction,
              promo_credit_transaction: result.promoCreditTransaction,
              wallet: result.wallet,
            },
            201,
            cors
          );
        } catch (err: any) {
          return errorResponse(err.message || 'Failed to top-up wallet', 500, cors);
        }
      }

      // POST /api/organizations/:orgId/wallet/grant-welcome
      const orgWelcomeMatch = pathname.match(/^\/api\/organizations\/([^\/]+)\/wallet\/grant-welcome$/);
      if (orgWelcomeMatch && method === 'POST') {
        const orgId = orgWelcomeMatch[1];
        const auth = await authenticateWorkerRequest(request, env, cors);
        if (!auth.authenticated) return auth.errorResponse!;

        const { isMember, role } = await verifyOrgMembershipAndPermission(auth.user.id, orgId, undefined, env);
        const isDev = isUserDeveloperAdmin(auth.user, env);
        if ((!isMember || (role !== 'owner' && role !== 'admin')) && !isDev) {
          return errorResponse('Forbidden: Only organization owners and admins can claim welcome credit', 403, cors);
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
};
