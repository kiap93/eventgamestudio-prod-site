import { getSupabaseServerClient } from '../supabase.js';
import { OrgInvitationRecord, OrgRole } from './types.js';
import crypto from 'node:crypto';

export interface InvitationWithOrgDetails extends OrgInvitationRecord {
  organization_name: string;
}

export async function createInvitation(
  params: {
    id?: string;
    organization_id: string;
    email: string;
    role: OrgRole;
    token_hash: string;
    invited_by: string;
    expires_at: string;
    email_status?: 'pending' | 'sent' | 'failed';
    email_sent_at?: string | null;
    email_error?: string | null;
  },
  env?: Record<string, any>
): Promise<OrgInvitationRecord> {
  const supabase = getSupabaseServerClient(env);
  const id = params.id || crypto.randomUUID();
  const now = new Date().toISOString();

  const insertPayload: Record<string, any> = {
    id,
    organization_id: params.organization_id,
    email: params.email.trim().toLowerCase(),
    role: params.role,
    token_hash: params.token_hash,
    invited_by: params.invited_by,
    expires_at: params.expires_at,
    created_at: now,
    email_status: params.email_status || 'pending',
    email_sent_at: params.email_sent_at || null,
    email_error: params.email_error || null,
  };

  const { data, error } = await supabase
    .from('organization_invitations')
    .insert(insertPayload)
    .select()
    .single();

  if (error) {
    // If the error is due to missing email_status columns in existing Supabase schema, retry with basic fields
    if (error.message && (error.message.includes('column') || error.message.includes('email_status'))) {
      const basicPayload = {
        id,
        organization_id: params.organization_id,
        email: params.email.trim().toLowerCase(),
        role: params.role,
        token_hash: params.token_hash,
        invited_by: params.invited_by,
        expires_at: params.expires_at,
        created_at: now,
      };
      const retryResult = await supabase
        .from('organization_invitations')
        .insert(basicPayload)
        .select()
        .single();

      if (retryResult.error) {
        console.error('Error in createInvitation retry:', retryResult.error);
        throw new Error(`Failed to create invitation: ${retryResult.error.message}`);
      }
      return {
        ...retryResult.data,
        email_status: params.email_status || 'pending',
      } as OrgInvitationRecord;
    }

    console.error('Error in createInvitation:', error);
    throw new Error(`Failed to create invitation: ${error.message}`);
  }

  return data as OrgInvitationRecord;
}

export async function getInvitationByTokenHash(
  tokenHash: string,
  env?: Record<string, any>
): Promise<InvitationWithOrgDetails | null> {
  const supabase = getSupabaseServerClient(env);
  const { data, error } = await supabase
    .from('organization_invitations')
    .select(`
      *,
      organizations (
        name
      )
    `)
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (error) {
    console.error('Error in getInvitationByTokenHash:', error);
    throw new Error(`Failed to get invitation by token: ${error.message}`);
  }

  if (!data) return null;

  return {
    id: data.id,
    organization_id: data.organization_id,
    email: data.email,
    role: data.role as OrgRole,
    token_hash: data.token_hash,
    invited_by: data.invited_by,
    expires_at: data.expires_at,
    accepted_at: data.accepted_at,
    created_at: data.created_at,
    organization_name: data.organizations?.name || 'Organization',
  };
}

export async function getActiveOrgInvitations(
  organizationId: string,
  env?: Record<string, any>
): Promise<OrgInvitationRecord[]> {
  const supabase = getSupabaseServerClient(env);
  const now = new Date().toISOString();

  try {
    const { data, error } = await supabase
      .from('organization_invitations')
      .select('id, email, role, expires_at, created_at, organization_id, token_hash, invited_by, accepted_at, email_status, email_sent_at, email_error')
      .eq('organization_id', organizationId)
      .is('accepted_at', null)
      .gt('expires_at', now)
      .order('created_at', { ascending: false });

    if (!error && data) {
      return data as OrgInvitationRecord[];
    }
  } catch {
    // fallback if extra columns are not in schema
  }

  const { data, error } = await supabase
    .from('organization_invitations')
    .select('id, email, role, expires_at, created_at, organization_id, token_hash, invited_by, accepted_at')
    .eq('organization_id', organizationId)
    .is('accepted_at', null)
    .gt('expires_at', now)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error in getActiveOrgInvitations:', error);
    throw new Error(`Failed to get active organization invitations: ${error.message}`);
  }

  return (data || []) as OrgInvitationRecord[];
}

export async function getInvitationById(
  id: string,
  env?: Record<string, any>
): Promise<OrgInvitationRecord | null> {
  const supabase = getSupabaseServerClient(env);
  const { data, error } = await supabase
    .from('organization_invitations')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('Error in getInvitationById:', error);
    throw new Error(`Failed to get invitation: ${error.message}`);
  }

  return data as OrgInvitationRecord | null;
}

export async function renewInvitation(
  id: string,
  params: {
    token_hash: string;
    expires_at: string;
    email_status?: 'pending' | 'sent' | 'failed';
    email_sent_at?: string | null;
    email_error?: string | null;
  },
  env?: Record<string, any>
): Promise<OrgInvitationRecord> {
  const supabase = getSupabaseServerClient(env);

  try {
    const { data, error } = await supabase
      .from('organization_invitations')
      .update({
        token_hash: params.token_hash,
        expires_at: params.expires_at,
        email_status: params.email_status || 'pending',
        email_sent_at: params.email_sent_at || null,
        email_error: params.email_error || null,
      })
      .eq('id', id)
      .select()
      .single();

    if (!error && data) {
      return data as OrgInvitationRecord;
    }
  } catch {
    // fallback
  }

  const { data, error } = await supabase
    .from('organization_invitations')
    .update({
      token_hash: params.token_hash,
      expires_at: params.expires_at,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error in renewInvitation:', error);
    throw new Error(`Failed to renew invitation: ${error.message}`);
  }

  return data as OrgInvitationRecord;
}

export async function deleteInvitation(
  id: string,
  env?: Record<string, any>
): Promise<boolean> {
  const supabase = getSupabaseServerClient(env);
  const { error } = await supabase
    .from('organization_invitations')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error in deleteInvitation:', error);
    throw new Error(`Failed to delete invitation: ${error.message}`);
  }

  return true;
}

export async function markInvitationAccepted(
  id: string,
  env?: Record<string, any>
): Promise<OrgInvitationRecord> {
  const supabase = getSupabaseServerClient(env);
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('organization_invitations')
    .update({
      accepted_at: now,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error in markInvitationAccepted:', error);
    throw new Error(`Failed to mark invitation as accepted: ${error.message}`);
  }

  return data as OrgInvitationRecord;
}

export async function updateInvitationEmailStatus(
  id: string,
  emailStatus: 'pending' | 'sent' | 'failed',
  emailError?: string | null,
  env?: Record<string, any>
): Promise<void> {
  const supabase = getSupabaseServerClient(env);
  const now = new Date().toISOString();

  try {
    await supabase
      .from('organization_invitations')
      .update({
        email_status: emailStatus,
        email_sent_at: emailStatus === 'sent' ? now : undefined,
        email_error: emailError || null,
      })
      .eq('id', id);
  } catch (err) {
    console.warn('Notice updating invitation email status in Supabase:', err);
  }
}
