import type { Request, Response, NextFunction } from 'express';
import * as jose from 'jose';
import crypto from 'node:crypto';
import { getUserById, getUserByEmail, getMember } from './db/index.js';
import { UserRecord, OrgMemberRecord, OrgRole } from './db/types.js';
import { getSupabaseServerClient } from './supabase.js';
import { verifyGoogleJwt, VerifyGoogleTokenOptions } from './google_jwks.js';

// Ephemeral in-memory dev secret ONLY for local Node.js development servers,
// NEVER allowed in production or Cloudflare Worker / serverless runtime environments.
let ephemeralDevSecret: string | null = null;

export function getJwtSecret(customSecret?: string, env?: Record<string, any>): Uint8Array {
  const secretStr =
    customSecret ||
    env?.JWT_SECRET ||
    (typeof process !== 'undefined' ? process.env.JWT_SECRET : undefined);

  if (!secretStr) {
    const isWorkerRuntime =
      typeof (globalThis as any).WebSocketPair !== 'undefined' ||
      (typeof navigator !== 'undefined' && (navigator as any)?.userAgent === 'Cloudflare-Workers') ||
      (typeof (globalThis as any).caches !== 'undefined' && typeof (globalThis as any).caches?.default !== 'undefined') ||
      typeof process === 'undefined';

    const procEnv = typeof process !== 'undefined' ? process.env : {};
    const isExplicitNodeDev =
      !isWorkerRuntime &&
      (env?.NODE_ENV === 'development' || procEnv.NODE_ENV === 'development') &&
      procEnv.NODE_ENV !== 'production' &&
      env?.NODE_ENV !== 'production';

    // In production OR in any Cloudflare Worker / Edge runtime, ephemeral secrets are forbidden
    // because distributed edge isolates do not share memory and restart frequently.
    if (!isExplicitNodeDev) {
      throw new Error(
        'JWT_SECRET is required in production and Cloudflare Worker environments. Ephemeral in-memory secrets are strictly disallowed.'
      );
    }

    // In local Node.js development mode without a configured JWT_SECRET:
    if (!ephemeralDevSecret) {
      if (typeof crypto !== 'undefined' && typeof crypto.randomBytes === 'function') {
        ephemeralDevSecret = crypto.randomBytes(32).toString('hex');
      } else {
        ephemeralDevSecret = Array.from(
          (globalThis as any).crypto.getRandomValues(new Uint8Array(32)),
          (b: unknown) => (b as number).toString(16).padStart(2, '0')
        ).join('');
      }
      console.warn(
        '[AUTH] WARNING: JWT_SECRET environment variable is not set. Generated an ephemeral in-memory 256-bit secret for this local Node.js development session.'
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
  env?: Record<string, any>,
  options?: VerifyGoogleTokenOptions
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

  // Strictly verify Google ID token locally using Google's published JWKS signing keys
  try {
    const verified = await verifyGoogleJwt(idToken, env, options);
    return verified;
  } catch (err: any) {
    // Detailed error logged server-side only; generic message returned to caller
    console.error('[AUTH] Google ID token verification failed:', err?.message || err);
    throw new Error('Invalid or expired Google ID token');
  }
}

export async function authenticateJWT(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  let token = '';

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  }

  if (!token) {
    res.status(401).json({ error: 'Unauthenticated: Missing or invalid Authorization header (Bearer token required)' });
    return;
  }

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
  } catch (appJwtErr: any) {
    if (appJwtErr?.message?.includes('JWT_SECRET is required')) {
      console.error('[AUTH CONFIG ERROR]', appJwtErr.message);
      res.status(500).json({ error: `Server Configuration Error: ${appJwtErr.message}` });
      return;
    }
    // If App JWT verification fails with normal invalid signature/expired token, check if it's a Supabase Auth token
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

export type EventPermission =
  | 'event.view'
  | 'event.create'
  | 'event.edit'
  | 'event.cancel'
  | 'event.pay'
  | 'event.manage';

export type GamePermission =
  | 'game.view'
  | 'game.items.view'
  | 'game.background.edit'
  | 'game.items.edit'
  | 'game.basket.edit'
  | 'game.settings.edit';

export type OrgPermission =
  | 'organization.members.view'
  | 'organization.members.invite'
  | 'organization.members.remove'
  | 'organization.settings.edit'
  | 'organization.delete';

export type WalletPermission =
  | 'wallet.view'
  | 'wallet.topup'
  | 'wallet.transactions.view';

export type AppPermission = EventPermission | GamePermission | OrgPermission | WalletPermission | string;

export const PERMISSIONS: Record<OrgRole, string[]> = {
  owner: [
    // Event management
    'event.view',
    'event.create',
    'event.edit',
    'event.cancel',
    'event.pay',
    'event.manage',
    // Game/Theme editing
    'game.view',
    'game.items.view',
    'game.background.edit',
    'game.items.edit',
    'game.basket.edit',
    'game.settings.edit',
    // Organization administration
    'organization.members.view',
    'organization.members.invite',
    'organization.members.remove',
    'organization.settings.edit',
    'organization.delete',
    // Wallet management
    'wallet.view',
    'wallet.topup',
    'wallet.transactions.view',
  ],
  admin: [
    // Event management
    'event.view',
    'event.create',
    'event.edit',
    'event.cancel',
    'event.pay',
    'event.manage',
    // Game/Theme editing
    'game.view',
    'game.items.view',
    'game.background.edit',
    'game.items.edit',
    'game.basket.edit',
    'game.settings.edit',
    // Organization administration
    'organization.members.view',
    'organization.members.invite',
    'organization.members.remove',
    'organization.settings.edit',
    // Wallet management
    'wallet.view',
    'wallet.topup',
    'wallet.transactions.view',
  ],
  designer: [
    // Event viewing only (designers can view and preview events, but cannot create, edit, pay, cancel, or manage events)
    'event.view',
    // Game/Theme editing (primary designer capability)
    'game.view',
    'game.items.view',
    'game.background.edit',
    'game.items.edit',
    'game.basket.edit',
    'game.settings.edit',
    // Wallet viewing
    'wallet.view',
    'wallet.transactions.view',
  ],
  viewer: [
    // View-only permissions
    'event.view',
    'game.view',
    'game.items.view',
    'wallet.view',
    'wallet.transactions.view',
  ],
};

export function hasRolePermission(role: OrgRole | string, permission: string): boolean {
  const allowed = PERMISSIONS[role as OrgRole] || [];
  return allowed.includes(permission);
}

export async function verifyOrgMembershipAndPermission(
  userId: string,
  organizationId: string,
  requiredPermission?: string,
  env?: Record<string, any>
): Promise<{ isMember: boolean; role?: OrgRole; member?: OrgMemberRecord; hasPermission: boolean }> {
  try {
    const member = await getMember(organizationId, userId, env);

    if (!member) {
      return { isMember: false, hasPermission: false };
    }

    if (requiredPermission) {
      const allowed = PERMISSIONS[member.role] || [];
      const hasPerm = allowed.includes(requiredPermission);
      return {
        isMember: true,
        role: member.role,
        member,
        hasPermission: hasPerm,
      };
    }

    return { isMember: true, role: member.role, member, hasPermission: true };
  } catch (err) {
    console.error('Error in verifyOrgMembershipAndPermission:', err);
    return { isMember: false, hasPermission: false };
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

export {
  verifyGoogleJwt,
  clearGoogleJwksCache,
  getGoogleJwksCacheStats,
  parseCacheControlMaxAge,
} from './google_jwks.js';
export type { VerifyGoogleTokenOptions } from './google_jwks.js';

