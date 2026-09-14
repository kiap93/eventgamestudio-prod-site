import { getSupabaseServerClient, isLocalFallbackAllowed, isSupabaseConfigured } from '../supabase.js';
import { OrgMemberRecord, OrgRole } from './types.js';
import { dispatchNotificationEvent } from '../notifications/dispatcher.js';
import crypto from 'node:crypto';

export const localMembersCache = new Map<string, OrgMemberRecord>();

export interface OrgMemberWithUserDetails {
  id: string;
  organization_id: string;
  user_id: string;
  role: OrgRole;
  created_at: string;
  email: string;
  name: string;
  avatar_url: string | null;
  user_name?: string;
  user_email?: string;
  user_avatar?: string | null;
}

export async function getMember(organizationId: string, userId: string, env?: Record<string, any>): Promise<OrgMemberRecord | null> {
  const supabase = getSupabaseServerClient(env);
  const { data, error } = await supabase
    .from('organization_members')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    if (error.message?.includes('Placeholder') || error.code === 'PGRST000' || isLocalFallbackAllowed(env)) {
      for (const m of localMembersCache.values()) {
        if (m.organization_id === organizationId && m.user_id === userId) {
          return m;
        }
      }
      return null;
    }
    console.error('Error in getMember:', error);
    throw new Error(`Failed to get organization member: ${error.message}`);
  }

  if (data) {
    localMembersCache.set(data.id, data as OrgMemberRecord);
  } else {
    // Check fallback cache if no remote data returned under fallback mode
    if (isLocalFallbackAllowed(env)) {
      for (const m of localMembersCache.values()) {
        if (m.organization_id === organizationId && m.user_id === userId) {
          return m;
        }
      }
    }
  }

  return data as OrgMemberRecord | null;
}

export async function getMemberById(memberId: string, env?: Record<string, any>): Promise<OrgMemberRecord | null> {
  const supabase = getSupabaseServerClient(env);
  const { data, error } = await supabase
    .from('organization_members')
    .select('*')
    .eq('id', memberId)
    .maybeSingle();

  if (error) {
    if (error.message?.includes('Placeholder') || error.code === 'PGRST000' || isLocalFallbackAllowed(env)) {
      return localMembersCache.get(memberId) || null;
    }
    console.error('Error in getMemberById:', error);
    throw new Error(`Failed to get member by id: ${error.message}`);
  }

  if (data) {
    localMembersCache.set(data.id, data as OrgMemberRecord);
  }
  return (data as OrgMemberRecord) || localMembersCache.get(memberId) || null;
}

export async function getOrgMembers(organizationId: string, env?: Record<string, any>): Promise<OrgMemberWithUserDetails[]> {
  const supabase = getSupabaseServerClient(env);
  
  // 1. Fetch member records from organization_members
  const { data: memberRows, error } = await supabase
    .from('organization_members')
    .select(`
      id,
      organization_id,
      user_id,
      role,
      created_at,
      users (
        id,
        email,
        name,
        avatar_url
      )
    `)
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: true });

  if (error) {
    if (error.message?.includes('Placeholder') || error.code === 'PGRST000' || isLocalFallbackAllowed(env)) {
      const results: OrgMemberWithUserDetails[] = [];
      for (const m of localMembersCache.values()) {
        if (m.organization_id === organizationId) {
          results.push({
            id: m.id,
            organization_id: m.organization_id,
            user_id: m.user_id,
            role: m.role as OrgRole,
            created_at: m.created_at,
            email: '',
            name: 'Team Member',
            avatar_url: null,
            user_name: 'Team Member',
            user_email: '',
            user_avatar: null,
          });
        }
      }
      return results;
    }
    console.error('Error in getOrgMembers:', error);
    throw new Error(`Failed to list organization members: ${error.message}`);
  }

  if (!memberRows || memberRows.length === 0) return [];

  // 2. Identify any user IDs whose profile wasn't resolved by the nested join
  const missingUserIds = new Set<string>();
  const usersMap = new Map<string, { id: string; email: string; name: string; avatar_url: string | null }>();

  for (const item of memberRows as any[]) {
    const joined = Array.isArray(item.users) ? item.users[0] : item.users;
    if (joined && joined.email) {
      usersMap.set(item.user_id, {
        id: joined.id || item.user_id,
        email: joined.email || '',
        name: joined.name || (joined.email ? joined.email.split('@')[0] : 'Team Member'),
        avatar_url: joined.avatar_url || null,
      });
    } else if (item.user_id) {
      missingUserIds.add(item.user_id);
    }
  }

  // 3. If any users were not joined by PostgREST, query public.users directly
  if (missingUserIds.size > 0) {
    try {
      const { data: directUsers, error: uErr } = await supabase
        .from('users')
        .select('id, email, name, avatar_url')
        .in('id', Array.from(missingUserIds));

      if (!uErr && directUsers) {
        for (const u of directUsers as any[]) {
          usersMap.set(u.id, {
            id: u.id,
            email: u.email || '',
            name: u.name || (u.email ? u.email.split('@')[0] : 'Team Member'),
            avatar_url: u.avatar_url || null,
          });
        }
      }
    } catch (fetchErr) {
      console.warn('Could not batch fetch missing users in getOrgMembers:', fetchErr);
    }
  }

  // 4. Return enriched member list with backwards-compatible aliases
  return (memberRows as any[]).map((item: any) => {
    const user = usersMap.get(item.user_id) || (Array.isArray(item.users) ? item.users[0] : item.users) || null;
    const email = user?.email || '';
    const rawName = user?.name || '';
    const name = rawName.trim() || (email ? email.split('@')[0] : 'Team Member');
    const avatarUrl = user?.avatar_url || null;

    return {
      id: item.id,
      organization_id: item.organization_id,
      user_id: item.user_id,
      role: item.role as OrgRole,
      created_at: item.created_at,
      email,
      name,
      avatar_url: avatarUrl,
      // Field aliases for DeveloperAdmin & Organization views
      user_name: name,
      user_email: email,
      user_avatar: avatarUrl,
    };
  });
}

export async function addMember(
  params: {
    id?: string;
    organization_id: string;
    user_id: string;
    role: OrgRole;
  },
  env?: Record<string, any>
): Promise<OrgMemberRecord> {
  const id = params.id || crypto.randomUUID();
  const now = new Date().toISOString();

  const memRecord: OrgMemberRecord = {
    id,
    organization_id: params.organization_id,
    user_id: params.user_id,
    role: params.role,
    created_at: now,
  };

  if (!isSupabaseConfigured(env)) {
    const existing = Array.from(localMembersCache.values()).find(
      (m) => m.organization_id === params.organization_id && m.user_id === params.user_id
    );
    if (existing) {
      existing.role = params.role;
      return existing;
    }
    localMembersCache.set(id, memRecord);
    return memRecord;
  }

  const supabase = getSupabaseServerClient(env);
  const { data, error } = await supabase
    .from('organization_members')
    .insert({
      id,
      organization_id: params.organization_id,
      user_id: params.user_id,
      role: params.role,
      created_at: now,
    })
    .select()
    .single();

  if (error) {
    // If unique constraint violation (unique_org_user or 23505), fetch and return the existing member
    if (error.code === '23505' || error.message?.includes('duplicate key') || error.message?.includes('unique_org_user')) {
      const { data: existing, error: fetchErr } = await supabase
        .from('organization_members')
        .select('*')
        .eq('organization_id', params.organization_id)
        .eq('user_id', params.user_id)
        .maybeSingle();

      if (!fetchErr && existing) {
        const record = existing as OrgMemberRecord;
        localMembersCache.set(record.id, record);
        return record;
      }
    }

    if (error.message?.includes('Placeholder') || error.code === 'PGRST000' || isLocalFallbackAllowed(env)) {
      const existing = Array.from(localMembersCache.values()).find(
        (m) => m.organization_id === params.organization_id && m.user_id === params.user_id
      );
      if (existing) {
        existing.role = params.role;
        return existing;
      }
      localMembersCache.set(id, memRecord);
      return memRecord;
    }
    console.error('Error in addMember:', error);
    throw new Error(`Failed to add organization member: ${error.message}`);
  }

  const record = (data as OrgMemberRecord) || memRecord;
  localMembersCache.set(record.id, record);
  return record;
}

export async function updateMemberRole(
  organizationId: string,
  userId: string,
  role: OrgRole,
  env?: Record<string, any>
): Promise<OrgMemberRecord> {
  const supabase = getSupabaseServerClient(env);
  const { data, error } = await supabase
    .from('organization_members')
    .update({ role })
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    if (error.message?.includes('Placeholder') || error.code === 'PGRST000' || isLocalFallbackAllowed(env)) {
      for (const m of localMembersCache.values()) {
        if (m.organization_id === organizationId && m.user_id === userId) {
          m.role = role;
          return m;
        }
      }
    }
    console.error('Error in updateMemberRole:', error);
    throw new Error(`Failed to update member role: ${error.message}`);
  }

  const record = data as OrgMemberRecord;
  if (record) {
    localMembersCache.set(record.id, record);
  }

  dispatchNotificationEvent(
    {
      eventType: 'SECURITY_SETTINGS_CHANGED',
      organizationId,
      action: 'ROLE_CHANGED',
      details: `Member role updated to ${role}`,
    },
    env
  ).catch((err) => console.error('[NOTIFICATION] Failed to dispatch SECURITY_SETTINGS_CHANGED:', err));

  return record;
}

export async function removeMember(memberId: string, env?: Record<string, any>): Promise<void> {
  const cached = localMembersCache.get(memberId);
  localMembersCache.delete(memberId);
  const supabase = getSupabaseServerClient(env);
  const { error } = await supabase
    .from('organization_members')
    .delete()
    .eq('id', memberId);

  if (error) {
    if (error.message?.includes('Placeholder') || error.code === 'PGRST000' || isLocalFallbackAllowed(env)) {
      return;
    }
    console.error('Error in removeMember:', error);
    throw new Error(`Failed to remove organization member: ${error.message}`);
  }

  if (cached?.organization_id) {
    dispatchNotificationEvent(
      {
        eventType: 'SECURITY_SETTINGS_CHANGED',
        organizationId: cached.organization_id,
        action: 'MEMBER_REMOVED',
        details: 'A member was removed from the organization',
      },
      env
    ).catch((err) => console.error('[NOTIFICATION] Failed to dispatch SECURITY_SETTINGS_CHANGED:', err));
  }
}
