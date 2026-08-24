import type { Request, Response, NextFunction } from 'express';
import * as jose from 'jose';
import crypto from 'node:crypto';
import { getUserById, getUserByEmail, getMember } from './db/index.js';
import { UserRecord, OrgMemberRecord, OrgRole } from './db/types.js';
import { getSupabaseServerClient } from './supabase.js';

// Ephemeral in-memory dev secret if running in non-production mode without configured secret,
// but NEVER a hardcoded static fallback string.
let ephemeralDevSecret: string | null = null;

export function getJwtSecret(customSecret?: string, env?: Record<string, any>): Uint8Array {
  const secretStr =
    customSecret ||
    env?.JWT_SECRET ||
    (typeof process !== 'undefined' ? process.env.JWT_SECRET : undefined);

  if (!secretStr) {
    const isProduction =
      env?.NODE_ENV === 'production' ||
      (typeof process !== 'undefined' && process.env.NODE_ENV === 'production');

    if (isProduction) {
      throw new Error('JWT_SECRET is required in production');
    }

    // In local non-production/dev environments without a configured JWT_SECRET,
    // generate an ephemeral 256-bit secret rather than using a static fallback string.
    if (!ephemeralDevSecret) {
      ephemeralDevSecret = crypto.randomBytes(32).toString('hex');
      console.warn(
        '[AUTH] WARNING: JWT_SECRET environment variable is not set. Generated an ephemeral in-memory 256-bit secret for this session.'
      );
    }
    return new TextEncoder().encode(ephemeralDevSecret);
  }

  return new TextEncoder().encode(secretStr);
}

export interface AppJWTPayload {
  sub: string; // internal-user-uuid
  organizationId?: string;
  role?: OrgRole;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedRequest extends Request {
  user?: UserRecord;
  orgMember?: OrgMemberRecord;
  jwtPayload?: AppJWTPayload;
}

export async function signAppToken(
  userId: string,
  organizationId?: string,
  role?: OrgRole,
  secretOverride?: string,
  env?: Record<string, any>
): Promise<string> {
  const payload: Record<string, any> = {
    sub: userId,
    ...(organizationId ? { organizationId } : {}),
    ...(role ? { role } : {}),
  };

  const secret = getJwtSecret(secretOverride, env);

  return await new jose.SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret);
}

export async function verifyAppToken(
  token: string,
  secretOverride?: string,
  env?: Record<string, any>
): Promise<AppJWTPayload> {
  const secret = getJwtSecret(secretOverride, env);
  const { payload } = await jose.jwtVerify(token, secret);
  return payload as unknown as AppJWTPayload;
}

export async function verifyGoogleIdToken(
  idToken: string,
  env?: Record<string, any>
): Promise<{
  sub: string;
  email: string;
  name: string;
  picture?: string;
  email_verified?: boolean;
}> {
  const procEnv = typeof process !== 'undefined' ? process.env : {};
  const isProduction =
    env?.NODE_ENV === 'production' ||
    procEnv.NODE_ENV === 'production';

  const allowMock =
    !isProduction &&
    (env?.ALLOW_MOCK_AUTH === 'true' ||
      (procEnv.NODE_ENV === 'development' && procEnv.ALLOW_MOCK_AUTH === 'true'));

  // Handle mock tokens only in development mode when explicitly enabled
  if (idToken.startsWith('mock_google_id_token_') || idToken.startsWith('dev_token_')) {
    if (isProduction || !allowMock) {
      throw new Error('Mock authentication tokens are strictly disallowed in production');
    }
    const parts = idToken.split('_');
    const emailName = parts[parts.length - 1] || 'user';
    const email = `${emailName.toLowerCase()}@example.com`;
    return {
      sub: `google_sub_${emailName}`,
      email,
      name: emailName.charAt(0).toUpperCase() + emailName.slice(1) + ' User',
      picture: `https://api.dicebear.com/7.x/bottts/svg?seed=${emailName}`,
      email_verified: true,
    };
  }

  // Strictly verify Google ID Token using Google OAuth2 TokenInfo API
  try {
    const resp = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw new Error(`Google TokenInfo verification failed (${resp.status}): ${errText || 'Invalid signature or expired token'}`);
    }

    const data = (await resp.json()) as any;

    if (!data.sub || !data.email) {
      throw new Error('Invalid Google ID token payload: missing sub or email');
    }

    // Verify Issuer
    const validIssuers = ['accounts.google.com', 'https://accounts.google.com'];
    if (!data.iss || !validIssuers.includes(data.iss)) {
      throw new Error(`Invalid Google ID token issuer: ${data.iss}`);
    }

    // Verify Expiration
    const nowInSeconds = Math.floor(Date.now() / 1000);
    if (data.exp && parseInt(data.exp, 10) < nowInSeconds) {
      throw new Error('Google ID token has expired');
    }

    // Verify Audience if client ID is configured in server env
    const expectedClientId =
      env?.VITE_GOOGLE_CLIENT_ID ||
      env?.GOOGLE_CLIENT_ID ||
      procEnv.VITE_GOOGLE_CLIENT_ID ||
      procEnv.GOOGLE_CLIENT_ID;

    if (expectedClientId && data.aud !== expectedClientId) {
      throw new Error(`Google ID token audience mismatch. Expected: ${expectedClientId}, got: ${data.aud}`);
    }

    // Verify email_verified
    const isEmailVerified = data.email_verified === 'true' || data.email_verified === true;
    if (!isEmailVerified) {
      throw new Error('Google account email is not verified');
    }

    return {
      sub: data.sub,
      email: data.email,
      name: data.name || data.email.split('@')[0],
      picture: data.picture,
      email_verified: true,
    };
  } catch (err: any) {
    console.error('verifyGoogleIdToken error:', err.message);
    throw new Error('Failed to verify Google ID Token: ' + (err.message || err));
  }
}

export async function authenticateJWT(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthenticated: Missing or invalid Authorization header' });
    return;
  }

  const token = authHeader.substring(7);

  // Try App JWT first
  try {
    const payload = await verifyAppToken(token);
    const user = await getUserById(payload.sub);
    if (!user) {
      res.status(401).json({ error: 'Unauthenticated: User no longer exists' });
      return;
    }

    req.user = user;
    req.jwtPayload = payload;
    next();
    return;
  } catch (_appJwtErr) {
    // If App JWT verification fails, check if it's a Supabase Auth token
    try {
      const supabase = getSupabaseServerClient();
      const { data: authData, error: authError } = await supabase.auth.getUser(token);

      if (!authError && authData.user) {
        // Match or find user in our public.users table
        let user = await getUserById(authData.user.id);
        if (!user && authData.user.email) {
          user = await getUserByEmail(authData.user.email);
        }

        if (user) {
          req.user = user;
          req.jwtPayload = {
            sub: user.id,
            organizationId: req.headers['x-organization-id'] as string | undefined,
          };
          next();
          return;
        }
      }
    } catch (_supabaseErr) {
      // ignore
    }

    res.status(401).json({ error: 'Unauthenticated: Invalid or expired token' });
    return;
  }
}

export const PERMISSIONS: Record<OrgRole, string[]> = {
  owner: [
    'game.view',
    'game.background.edit',
    'game.items.edit',
    'game.basket.edit',
    'game.settings.edit',
    'organization.members.view',
    'organization.members.invite',
    'organization.members.remove',
    'organization.settings.edit',
    'organization.delete',
    'wallet.view',
    'wallet.topup',
    'wallet.transactions.view',
  ],
  admin: [
    'game.view',
    'game.background.edit',
    'game.items.edit',
    'game.basket.edit',
    'game.settings.edit',
    'organization.members.view',
    'organization.members.invite',
    'organization.members.remove',
    'organization.settings.edit',
    'wallet.view',
    'wallet.topup',
    'wallet.transactions.view',
  ],
  designer: [
    'game.view',
    'game.background.edit',
    'game.items.edit',
    'game.basket.edit',
    'game.settings.edit',
    'wallet.view',
    'wallet.transactions.view',
  ],
  viewer: [
    'game.view',
    'wallet.view',
    'wallet.transactions.view',
  ],
};

export async function verifyOrgMembershipAndPermission(
  userId: string,
  organizationId: string,
  requiredPermission?: string,
  env?: Record<string, any>
): Promise<{ isMember: boolean; role?: OrgRole; member?: OrgMemberRecord }> {
  try {
    const member = await getMember(organizationId, userId, env);

    if (!member) {
      return { isMember: false };
    }

    if (requiredPermission) {
      const allowed = PERMISSIONS[member.role] || [];
      if (!allowed.includes(requiredPermission)) {
        return { isMember: true, role: member.role, member }; // member exists, lacks permission
      }
    }

    return { isMember: true, role: member.role, member };
  } catch (err) {
    console.error('Error in verifyOrgMembershipAndPermission:', err);
    return { isMember: false };
  }
}

export function isUserDeveloperAdmin(user?: UserRecord | null, env?: Record<string, any>): boolean {
  if (!user) return false;
  if (user.is_developer === true) return true;

  const devEmailsStr =
    env?.DEVELOPER_EMAILS ||
    (typeof process !== 'undefined' ? process.env.DEVELOPER_EMAILS : '') ||
    '';
  if (devEmailsStr) {
    const emails = devEmailsStr.split(',').map((e: string) => e.trim().toLowerCase());
    if (emails.includes(user.email.toLowerCase())) {
      return true;
    }
  }

  const isProduction =
    env?.NODE_ENV === 'production' ||
    (typeof process !== 'undefined' && process.env.NODE_ENV === 'production');

  // In production, heuristic email patterns (@example.com) are strictly forbidden
  if (isProduction) {
    return false;
  }

  const allowMock =
    env?.ALLOW_MOCK_AUTH === 'true' ||
    (typeof process !== 'undefined' &&
      process.env.NODE_ENV === 'development' &&
      process.env.ALLOW_MOCK_AUTH === 'true');

  // Only in local development mock mode, allow test dev accounts
  if (allowMock && (user.email.endsWith('@example.com') || user.email === 'developer@example.com')) {
    return true;
  }

  return false;
}

export async function authenticateDeveloperAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  // First run standard JWT authentication
  await authenticateJWT(req, res, () => {
    const user = req.user;
    const allowed = isUserDeveloperAdmin(user);
    console.log('[DeveloperAuth]', {
      userId: user?.id,
      email: user?.email,
      isDeveloper: user?.is_developer,
      allowed,
    });
    if (!user || !allowed) {
      res.status(403).json({
        error: 'Forbidden: Developer Admin access required. You do not have permission to access platform developer tools.',
      });
      return;
    }
    next();
  });
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
