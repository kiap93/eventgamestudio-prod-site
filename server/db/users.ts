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
  const supabase = getSupabaseServerClient(env);
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('google_id', googleId)
    .maybeSingle();

  if (error) {
    if (error.message?.includes('Placeholder') || error.code === 'PGRST000' || isLocalFallbackAllowed(env)) {
      for (const u of localUsersCache.values()) {
        if (u.google_id === googleId) return u;
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
  const normalized = email.trim().toLowerCase();
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

export async function createUser(
  userData: {
    id?: string;
    google_id?: string | null;
    email: string;
    name: string;
    avatar_url?: string | null;
    is_developer?: boolean;
  },
  env?: Record<string, any>
): Promise<UserRecord> {
  const supabase = getSupabaseServerClient(env);
  const id = userData.id || crypto.randomUUID();
  const now = new Date().toISOString();
  const isDeveloper = userData.is_developer === true;

  const { data, error } = await supabase
    .from('users')
    .insert({
      id,
      google_id: userData.google_id || null,
      email: userData.email.trim().toLowerCase(),
      name: userData.name,
      avatar_url: userData.avatar_url || null,
      is_developer: isDeveloper,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (error) {
    if (error.message?.includes('Placeholder') || error.code === 'PGRST000' || isLocalFallbackAllowed(env)) {
      const user: UserRecord = {
        id,
        google_id: userData.google_id || null,
        email: userData.email.trim().toLowerCase(),
        name: userData.name,
        avatar_url: userData.avatar_url || null,
        is_developer: isDeveloper,
        created_at: now,
        updated_at: now,
      };
      localUsersCache.set(id, user);
      return user;
    }
    console.error('Error in createUser:', error);
    throw new Error(`Failed to create user: ${error.message}`);
  }

  const user = data as UserRecord;
  user.is_developer = user.is_developer === true;
  localUsersCache.set(user.id, user);
  return user;
}

export async function updateUser(
  id: string,
  updates: Partial<Pick<UserRecord, 'name' | 'avatar_url' | 'google_id'>>,
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
    safePayload.avatar_url = updates.avatar_url;
  }
  if (updates.google_id !== undefined) {
    safePayload.google_id = updates.google_id;
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
    throw new Error(`Failed to update user: ${error.message}`);
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
  env?: Record<string, any>
): Promise<UserRecord> {
  // First, check by google_id
  let user = await getUserByGoogleId(googleUser.sub, env);
  if (user) {
    // Optionally update name/avatar if changed
    if (googleUser.name !== user.name || (googleUser.picture && googleUser.picture !== user.avatar_url)) {
      user = await updateUser(
        user.id,
        {
          name: googleUser.name,
          avatar_url: googleUser.picture || user.avatar_url,
        },
        env
      );
    }
    return user;
  }

  // Second, check by email
  user = await getUserByEmail(googleUser.email, env);
  if (user) {
    // Link google_id
    user = await updateUser(
      user.id,
      {
        google_id: googleUser.sub,
        name: googleUser.name,
        avatar_url: googleUser.picture || user.avatar_url,
      },
      env
    );
    return user;
  }

  // Create new user with standard UUID
  return await createUser(
    {
      id: crypto.randomUUID(),
      google_id: googleUser.sub,
      email: googleUser.email,
      name: googleUser.name,
      avatar_url: googleUser.picture || null,
    },
    env
  );
}
