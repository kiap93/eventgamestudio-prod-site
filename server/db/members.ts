import { getSupabaseServerClient } from '../supabase.js';
import { OrgMemberRecord, OrgRole } from './types.js';
import crypto from 'node:crypto';

export interface OrgMemberWithUserDetails {
  id: string;
  organization_id: string;
  user_id: string;
  role: OrgRole;
  created_at: string;
  email: string;
  name: string;
  avatar_url: string | null;
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
    console.error('Error in getMember:', error);
    throw new Error(`Failed to get organization member: ${error.message}`);
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
    console.error('Error in getMemberById:', error);
    throw new Error(`Failed to get member by id: ${error.message}`);
  }

  return data as OrgMemberRecord | null;
}

export async function getOrgMembers(organizationId: string, env?: Record<string, any>): Promise<OrgMemberWithUserDetails[]> {
  const supabase = getSupabaseServerClient(env);
  const { data, error } = await supabase
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
    console.error('Error in getOrgMembers:', error);
    throw new Error(`Failed to list organization members: ${error.message}`);
  }

  if (!data) return [];

  return data.map((item: any) => {
    const user = item.users;
    return {
      id: item.id,
      organization_id: item.organization_id,
      user_id: item.user_id,
      role: item.role as OrgRole,
      created_at: item.created_at,
      email: user ? user.email : '',
      name: user ? user.name : '',
      avatar_url: user ? user.avatar_url : null,
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
  const supabase = getSupabaseServerClient(env);
  const id = params.id || crypto.randomUUID();
  const now = new Date().toISOString();

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
    console.error('Error in addMember:', error);
    throw new Error(`Failed to add organization member: ${error.message}`);
  }

  return data as OrgMemberRecord;
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
    console.error('Error in updateMemberRole:', error);
    throw new Error(`Failed to update member role: ${error.message}`);
  }

  return data as OrgMemberRecord;
}

export async function removeMember(memberId: string, env?: Record<string, any>): Promise<void> {
  const supabase = getSupabaseServerClient(env);
  const { error } = await supabase
    .from('organization_members')
    .delete()
    .eq('id', memberId);

  if (error) {
    console.error('Error in removeMember:', error);
    throw new Error(`Failed to remove organization member: ${error.message}`);
  }
}
