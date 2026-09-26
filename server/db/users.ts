import { getSupabaseServerClient, isLocalFallbackAllowed } from '../supabase.js';
import { UserRecord } from './types.js';
import crypto from 'node:crypto';

export const localUsersCache = new Map<string, UserRecord>();

export async function getUserById(id: string, env?: Record<string, any>): Promise<UserRecord | null> {
  const supabase = getSupabaseServerClient(env);
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    if (error.message?.includes('Placeholder') || error.code === 'PGRST000' || isLocalFallbackAllowed(env)) {
      return localUsersCache.get(id) || null;
    }
    console.error('Error in getUserById:', error);
    throw new Error(`Failed to get user by id: ${error.message}`);
  }

  if (data) {
    localUsersCache.set(data.id, data as UserRecord);
  }
  return (data as UserRecord) || localUsersCache.get(id) || null;
}

export async function getUserByGoogleId(googleId: string, env?: Record<string, any>): Promise<UserRecord | null> {
  const normalized = (googleId || '').trim();
  if (!normalized) return null;
  const supabase = getSupabaseServerClient(env);
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('google_id', normalized)
    .maybeSingle();

  if (error) {
    if (error.message?.includes('Placeholder') || error.code === 'PGRST000' || isLocalFallbackAllowed(env)) {
      for (const u of localUsersCache.values()) {
        if (u.google_id === normalized) return u;
      }
      return null;
    }
    console.error('Error in getUserByGoogleId:', error);
    throw new Error(`Failed to get user by google_id: ${error.message}`);
  }

  if (data) {
    localUsersCache.set(data.id, data as UserRecord);
  }
  return data as UserRecord | null;
}

export async function getUserByEmail(email: string, env?: Record<string, any>): Promise<UserRecord | null> {
  const normalized = (email || '').trim().toLowerCase();
  if (!normalized) return null;
  const supabase = getSupabaseServerClient(env);
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .ilike('email', normalized)
    .maybeSingle();

  if (error) {
    if (error.message?.includes('Placeholder') || error.code === 'PGRST000' || isLocalFallbackAllowed(env)) {
      for (const u of localUsersCache.values()) {
        if (u.email.toLowerCase() === normalized) return u;
      }
      return null;
    }
    console.error('Error in getUserByEmail:', error);
    throw new Error(`Failed to get user by email: ${error.message}`);
  }

  if (data) {
    localUsersCache.set(data.id, data as UserRecord);
  }
  return data as UserRecord | null;
}

export function isUniqueViolationError(err: any): boolean {
  if (!err) return false;
  if (err.code === '23505') return true;
  const msg = (err.message || '').toLowerCase();
  const details = (err.details || '').toLowerCase();
  return (
    msg.includes('duplicate key') ||
    msg.includes('unique constraint') ||
    msg.includes('already exists') ||
    msg.includes('23505') ||
    details.includes('already exists') ||
    details.includes('duplicate')
  );
}

export async function createUser(
  userData: {
    id?: string;
    google_id?: string | null;
    email: string;
    name: string;
    avatar_url?: string | null;
    is_developer?: boolean;
    password_hash?: string | null;
    email_verified?: boolean;
    verified_at?: string | null;
    verification_token_hash?: string | null;
    verification_token_expires_at?: string | null;
  },
  env?: Record<string, any>
): Promise<UserRecord> {
  const supabase = getSupabaseServerClient(env);
  const id = userData.id || crypto.randomUUID();
  const now = new Date().toISOString();
  const isDeveloper = userData.is_developer === true;
  const normalizedEmail = (userData.email || '').trim().toLowerCase();
  const normalizedName = (userData.name || '').trim() || normalizedEmail.split('@')[0] || 'User';
  const normalizedGoogleId = userData.google_id ? userData.google_id.trim() : null;
  const avatarUrl = userData.avatar_url ? userData.avatar_url.trim() : null;
  const passwordHash = userData.password_hash || null;
  // If user has google_id, they are automatically email_verified; otherwise respect userData.email_verified
  const emailVerified = Boolean(normalizedGoogleId || userData.email_verified === true);
  const verifiedAt = emailVerified ? (userData.verified_at || now) : null;
  const verificationTokenHash = userData.verification_token_hash || null;
  const verificationTokenExpiresAt = userData.verification_token_expires_at || null;

  const insertPayload = {
    id,
    google_id: normalizedGoogleId,
    email: normalizedEmail,
    name: normalizedName,
    avatar_url: avatarUrl,
    is_developer: isDeveloper,
    password_hash: passwordHash,
    email_verified: emailVerified,
    verified_at: verifiedAt,
    verification_token_hash: verificationTokenHash,
    verification_token_expires_at: verificationTokenExpiresAt,
    created_at: now,
    updated_at: now,
  };

  const { data, error } = await supabase
    .from('users')
    .insert(insertPayload)
    .select()
    .single();

  if (error) {
    if (error.message?.includes('Placeholder') || error.code === 'PGRST000' || isLocalFallbackAllowed(env)) {
      // Check local cache for unique constraint violations (simulate PostgreSQL 23505)
      for (const existing of localUsersCache.values()) {
        if (normalizedGoogleId && existing.google_id === normalizedGoogleId) {
          const err: any = new Error(`duplicate key value violates unique constraint "users_google_id_key"`);
          err.code = '23505';
          throw err;
        }
        if (existing.email.toLowerCase() === normalizedEmail) {
          const err: any = new Error(`duplicate key value violates unique constraint "users_email_key"`);
          err.code = '23505';
          throw err;
        }
      }
      const user: UserRecord = {
        ...insertPayload,
      };
      localUsersCache.set(id, user);
      return user;
    }
    console.error('Error in createUser:', error);
    const err: any = new Error(`Failed to create user: ${error.message}`);
    err.code = error.code;
    err.details = error.details;
    err.hint = error.hint;
    throw err;
  }

  const user = data as UserRecord;
  user.is_developer = user.is_developer === true;
  localUsersCache.set(user.id, user);
  return user;
}

export async function updateUser(
  id: string,
  updates: Partial<Pick<UserRecord, 'name' | 'avatar_url' | 'google_id' | 'password_hash' | 'email_verified' | 'verified_at' | 'verification_token_hash' | 'verification_token_expires_at' | 'password_reset_token_hash' | 'password_reset_expires_at'>>,
  env?: Record<string, any>
): Promise<UserRecord> {
  const supabase = getSupabaseServerClient(env);
  const now = new Date().toISOString();

  // Defense-in-depth: whitelist safe fields only, strictly dropping is_developer or any unauthorized attributes
  const safePayload: Record<string, any> = {
    updated_at: now,
  };
  if (typeof updates.name === 'string') {
    safePayload.name = updates.name.trim();
  }
  if (updates.avatar_url !== undefined) {
    safePayload.avatar_url = updates.avatar_url ? updates.avatar_url.trim() : null;
  }
  if (updates.google_id !== undefined) {
    safePayload.google_id = updates.google_id ? updates.google_id.trim() : null;
  }
  if (updates.password_hash !== undefined) {
    safePayload.password_hash = updates.password_hash;
  }
  if (updates.email_verified !== undefined) {
    safePayload.email_verified = Boolean(updates.email_verified);
  }
  if (updates.verified_at !== undefined) {
    safePayload.verified_at = updates.verified_at;
  }
  if (updates.verification_token_hash !== undefined) {
    safePayload.verification_token_hash = updates.verification_token_hash;
  }
  if (updates.verification_token_expires_at !== undefined) {
    safePayload.verification_token_expires_at = updates.verification_token_expires_at;
  }
  if (updates.password_reset_token_hash !== undefined) {
    safePayload.password_reset_token_hash = updates.password_reset_token_hash;
  }
  if (updates.password_reset_expires_at !== undefined) {
    safePayload.password_reset_expires_at = updates.password_reset_expires_at;
  }

  const { data, error } = await supabase
    .from('users')
    .update(safePayload)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.message?.includes('Placeholder') || error.code === 'PGRST000' || isLocalFallbackAllowed(env)) {
      const existing = localUsersCache.get(id);
      if (existing) {
        if (safePayload.google_id) {
          for (const u of localUsersCache.values()) {
            if (u.id !== id && u.google_id === safePayload.google_id) {
              const err: any = new Error(`duplicate key value violates unique constraint "users_google_id_key"`);
              err.code = '23505';
              throw err;
            }
          }
        }
        const updated: UserRecord = {
          ...existing,
          ...safePayload,
          updated_at: now,
        };
        localUsersCache.set(id, updated);
        return updated;
      }
    }
    console.error('Error in updateUser:', error);
    const err: any = new Error(`Failed to update user: ${error.message}`);
    err.code = error.code;
    err.details = error.details;
    err.hint = error.hint;
    throw err;
  }

  const user = data as UserRecord;
  localUsersCache.set(user.id, user);
  return user;
}

/**
 * Safely updates user profile fields (name, avatar_url).
 * Strictly validates input and prevents mutation of any privileged or identity columns.
 */
export async function updateUserProfile(
  id: string,
  profile: {
    name?: string;
    avatar_url?: string | null;
  },
  env?: Record<string, any>
): Promise<UserRecord> {
  const safeUpdates: Partial<Pick<UserRecord, 'name' | 'avatar_url'>> = {};

  if (profile.name !== undefined) {
    if (typeof profile.name !== 'string') {
      throw new Error('Name must be a string');
    }
    const trimmed = profile.name.trim();
    if (!trimmed || trimmed.length > 100) {
      throw new Error('Name must be between 1 and 100 characters');
    }
    safeUpdates.name = trimmed;
  }

  if (profile.avatar_url !== undefined) {
    if (profile.avatar_url === null || profile.avatar_url === '') {
      safeUpdates.avatar_url = null;
    } else if (typeof profile.avatar_url === 'string') {
      const trimmedUrl = profile.avatar_url.trim();
      if (trimmedUrl.length > 1000) {
        throw new Error('Avatar URL cannot exceed 1000 characters');
      }
      safeUpdates.avatar_url = trimmedUrl;
    } else {
      throw new Error('Avatar URL must be a string or null');
    }
  }

  return updateUser(id, safeUpdates, env);
}

export async function upsertGoogleUser(
  googleUser: {
    sub: string;
    email: string;
    name: string;
    picture?: string;
  },
  env?: Record<string, any>,
  options?: { correlationId?: string }
): Promise<UserRecord> {
  const correlationId = options?.correlationId || 'internal';
  const normalizedSub = (googleUser.sub || '').trim();
  const normalizedEmail = (googleUser.email || '').trim().toLowerCase();
  const normalizedName = (googleUser.name || '').trim() || normalizedEmail.split('@')[0] || 'User';
  const normalizedPicture = (googleUser.picture || '').trim() || null;

  if (!normalizedSub) {
    throw new Error('Google user profile is missing required "sub" identifier');
  }
  if (!normalizedEmail) {
    throw new Error('Google user profile is missing required "email" identifier');
  }

  // 1. First, check by google_id
  let user = await getUserByGoogleId(normalizedSub, env);
  if (user) {
    const needsNameUpdate = normalizedName && normalizedName !== user.name;
    const needsAvatarUpdate = normalizedPicture && normalizedPicture !== user.avatar_url;
    if (needsNameUpdate || needsAvatarUpdate) {
      try {
        user = await updateUser(
          user.id,
          {
            name: normalizedName || user.name,
            avatar_url: normalizedPicture || user.avatar_url,
          },
          env
        );
      } catch (updateErr: any) {
        console.warn(`[Google Auth][${correlationId}] Non-fatal: Profile update failed on login:`, updateErr?.message);
      }
    }
    return user;
  }

  // 2. Second, check by email (link google_id to existing email user)
  user = await getUserByEmail(normalizedEmail, env);
  if (user) {
    try {
      user = await updateUser(
        user.id,
        {
          google_id: normalizedSub,
          name: user.name || normalizedName,
          avatar_url: user.avatar_url || normalizedPicture,
          email_verified: true,
          verified_at: user.verified_at || new Date().toISOString(),
        },
        env
      );
      return user;
    } catch (linkErr: any) {
      if (isUniqueViolationError(linkErr)) {
        const existing = await getUserByGoogleId(normalizedSub, env);
        if (existing) return existing;
      }
      console.error(`[Google Auth Error][${correlationId}] GOOGLE_USER_LINK_FAILED:`, linkErr?.message);
      throw linkErr;
    }
  }

  // 3. User does not exist by google_id or email: Create new user with standard UUID
  try {
    const newUser = await createUser(
      {
        id: crypto.randomUUID(),
        google_id: normalizedSub,
        email: normalizedEmail,
        name: normalizedName,
        avatar_url: normalizedPicture,
        is_developer: false,
        email_verified: true,
        verified_at: new Date().toISOString(),
      },
      env
    );
    return newUser;
  } catch (createErr: any) {
    // Detect and recover from concurrent registration races or unique constraint collisions
    if (isUniqueViolationError(createErr)) {
      console.warn(`[Google Auth][${correlationId}] Unique collision during user creation, recovering via lookup`);

      // Recovery attempt 1: lookup by google_id
      const existingByGoogle = await getUserByGoogleId(normalizedSub, env);
      if (existingByGoogle) {
        return existingByGoogle;
      }

      // Recovery attempt 2: lookup by email and link
      const existingByEmail = await getUserByEmail(normalizedEmail, env);
      if (existingByEmail) {
        try {
          const linked = await updateUser(
            existingByEmail.id,
            {
              google_id: normalizedSub,
              name: existingByEmail.name || normalizedName,
              avatar_url: existingByEmail.avatar_url || normalizedPicture,
              email_verified: true,
              verified_at: existingByEmail.verified_at || new Date().toISOString(),
            },
            env
          );
          return linked;
        } catch (linkErr: any) {
          if (isUniqueViolationError(linkErr)) {
            const finalByGoogle = await getUserByGoogleId(normalizedSub, env);
            if (finalByGoogle) return finalByGoogle;
          }
        }
      }

      // Brief backoff before final retry lookup
      await new Promise((resolve) => setTimeout(resolve, 50));
      const retryUser = (await getUserByGoogleId(normalizedSub, env)) || (await getUserByEmail(normalizedEmail, env));
      if (retryUser) {
        return retryUser;
      }
    }

    console.error(`[Google Auth Error][${correlationId}] GOOGLE_USER_CREATE_FAILED:`, {
      message: createErr?.message,
      code: createErr?.code,
      details: createErr?.details,
    });
    throw createErr;
  }
}

export async function getUserByVerificationToken(
  tokenHash: string,
  env?: Record<string, any>
): Promise<UserRecord | null> {
  const normalized = (tokenHash || '').trim();
  if (!normalized) return null;
  const supabase = getSupabaseServerClient(env);
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('verification_token_hash', normalized)
    .maybeSingle();

  if (error) {
    if (error.message?.includes('Placeholder') || error.code === 'PGRST000' || isLocalFallbackAllowed(env)) {
      for (const u of localUsersCache.values()) {
        if (u.verification_token_hash === normalized) return u;
      }
      return null;
    }
    console.error('Error in getUserByVerificationToken:', error);
    throw new Error(`Failed to get user by verification token: ${error.message}`);
  }

  if (data) {
    localUsersCache.set(data.id, data as UserRecord);
  }
  return data as UserRecord | null;
}

export async function getUserByPasswordResetToken(
  tokenHash: string,
  env?: Record<string, any>
): Promise<UserRecord | null> {
  const normalized = (tokenHash || '').trim();
  if (!normalized) return null;
  const supabase = getSupabaseServerClient(env);
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('password_reset_token_hash', normalized)
    .maybeSingle();

  if (error) {
    if (error.message?.includes('Placeholder') || error.code === 'PGRST000' || isLocalFallbackAllowed(env)) {
      for (const u of localUsersCache.values()) {
        if (u.password_reset_token_hash === normalized) return u;
      }
      return null;
    }
    console.error('Error in getUserByPasswordResetToken:', error);
    throw new Error(`Failed to get user by password reset token: ${error.message}`);
  }

  if (data) {
    localUsersCache.set(data.id, data as UserRecord);
  }
  return data as UserRecord | null;
}

export async function verifyUserEmail(
  userId: string,
  env?: Record<string, any>
): Promise<UserRecord> {
  const now = new Date().toISOString();
  return updateUser(
    userId,
    {
      email_verified: true,
      verified_at: now,
      verification_token_hash: null,
      verification_token_expires_at: null,
    },
    env
  );
}

export async function setUserPassword(
  userId: string,
  passwordHash: string,
  env?: Record<string, any>
): Promise<UserRecord> {
  return updateUser(
    userId,
    {
      password_hash: passwordHash,
      password_reset_token_hash: null,
      password_reset_expires_at: null,
    },
    env
  );
}

export async function updateUserVerificationToken(
  userId: string,
  tokenHash: string,
  expiresAt: string,
  env?: Record<string, any>
): Promise<void> {
  await updateUser(
    userId,
    {
      verification_token_hash: tokenHash,
      verification_token_expires_at: expiresAt,
    },
    env
  );
}

export async function updateUserPasswordResetToken(
  userId: string,
  tokenHash: string,
  expiresAt: string,
  env?: Record<string, any>
): Promise<void> {
  await updateUser(
    userId,
    {
      password_reset_token_hash: tokenHash,
      password_reset_expires_at: expiresAt,
    },
    env
  );
}
