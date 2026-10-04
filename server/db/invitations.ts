import { getSupabaseServerClient, isSupabaseConfigured, isProductionEnvironment, isLocalFallbackAllowed } from '../supabase.js';
import { OrgInvitationRecord, OrgRole } from './types.js';
import crypto from 'node:crypto';
import { hashToken, signAppToken } from '../auth.js';
import { sendEmailViaResend } from '../email/resend.js';
import { generateInvitationVerificationEmailTemplate } from '../email/invitationVerificationTemplate.js';
import { getFrontendBaseUrl } from '../email/index.js';
import { validatePassword, hashPassword } from '../password.js';
import { getUserByEmail, createUser, verifyUserEmail, setUserPassword, updateUserProfile, isUniqueViolationError } from './users.js';
import { getMember, addMember, updateMemberRole } from './members.js';
import { getOrganizationById } from './organizations.js';
import { dispatchNotificationEvent } from '../notifications/dispatcher.js';

export const localInvitationsCache = new Map<string, OrgInvitationRecord>();

export interface InvitationWithOrgDetails extends OrgInvitationRecord {
  organization_name: string;
}

export async function createInvitation(
  params: {
    id?: string;
    organization_id: string;
    email: string;
    role: OrgRole;
    token_hash?: string;
    invited_by: string;
    expires_at?: string;
    email_status?: 'pending' | 'sent' | 'failed';
    email_sent_at?: string | null;
    email_error?: string | null;
  },
  env?: Record<string, any>
): Promise<OrgInvitationRecord> {
  const id = params.id || crypto.randomUUID();
  const now = new Date().toISOString();
  const tokenHash = params.token_hash || crypto.randomUUID();
  const expiresAt = params.expires_at || new Date(Date.now() + 7 * 86400000).toISOString();

  const record: OrgInvitationRecord = {
    id,
    organization_id: params.organization_id,
    email: params.email.trim().toLowerCase(),
    role: params.role,
    token_hash: tokenHash,
    invited_by: params.invited_by,
    expires_at: expiresAt,
    created_at: now,
    accepted_at: null,
    email_status: params.email_status || 'pending',
    email_sent_at: params.email_sent_at || null,
    email_error: params.email_error || null,
  };

  if (!isSupabaseConfigured(env)) {
    localInvitationsCache.set(id, record);
    return record;
  }

  const supabase = getSupabaseServerClient(env);

  const insertPayload: Record<string, any> = {
    id,
    organization_id: params.organization_id,
    email: params.email.trim().toLowerCase(),
    role: params.role,
    token_hash: tokenHash,
    invited_by: params.invited_by,
    expires_at: expiresAt,
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
        token_hash: tokenHash,
        invited_by: params.invited_by,
        expires_at: expiresAt,
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
  if (!isSupabaseConfigured(env)) {
    const found = Array.from(localInvitationsCache.values()).find((inv) => inv.token_hash === tokenHash);
    if (!found) return null;
    const org = await getOrganizationById(found.organization_id, env);
    return {
      ...found,
      organization_name: org?.name || 'Organization',
    };
  }

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
    email_status: data.email_status,
    email_sent_at: data.email_sent_at,
    email_error: data.email_error,
    verification_code_hash: data.verification_code_hash,
    verification_code_expires_at: data.verification_code_expires_at,
    verification_attempts: data.verification_attempts || 0,
    last_code_sent_at: data.last_code_sent_at,
    organization_name: data.organizations?.name || 'Organization',
  };
}

export async function getActiveOrgInvitations(
  organizationId: string,
  env?: Record<string, any>
): Promise<OrgInvitationRecord[]> {
  if (!isSupabaseConfigured(env)) {
    const now = new Date().toISOString();
    return Array.from(localInvitationsCache.values()).filter(
      (inv) => inv.organization_id === organizationId && !inv.accepted_at && inv.expires_at > now
    );
  }

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
  if (!isSupabaseConfigured(env)) {
    return localInvitationsCache.get(id) || null;
  }

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
  if (!isSupabaseConfigured(env)) {
    const existing = localInvitationsCache.get(id);
    if (!existing) throw new Error('Invitation not found');
    existing.token_hash = params.token_hash;
    existing.expires_at = params.expires_at;
    if (params.email_status) existing.email_status = params.email_status;
    if (params.email_sent_at !== undefined) existing.email_sent_at = params.email_sent_at;
    if (params.email_error !== undefined) existing.email_error = params.email_error;
    return existing;
  }

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
  if (!isSupabaseConfigured(env)) {
    localInvitationsCache.delete(id);
    return true;
  }

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
  if (!isSupabaseConfigured(env)) {
    const existing = localInvitationsCache.get(id);
    if (!existing) throw new Error('Invitation not found');
    existing.accepted_at = new Date().toISOString();
    return existing;
  }

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
  if (!isSupabaseConfigured(env)) {
    const existing = localInvitationsCache.get(id);
    if (existing) {
      existing.email_status = emailStatus;
      if (emailStatus === 'sent') existing.email_sent_at = new Date().toISOString();
      if (emailError !== undefined) existing.email_error = emailError;
    }
    return;
  }

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

export async function setInvitationVerificationCode(
  id: string,
  params: {
    code_hash: string;
    expires_at: string;
    last_sent_at: string;
  },
  env?: Record<string, any>
): Promise<OrgInvitationRecord> {
  const existing = localInvitationsCache.get(id);
  if (existing) {
    existing.verification_code_hash = params.code_hash;
    existing.verification_code_expires_at = params.expires_at;
    existing.verification_attempts = 0;
    existing.last_code_sent_at = params.last_sent_at;
  }

  if (!isSupabaseConfigured(env)) {
    if (!existing) throw new Error('Invitation not found');
    return existing;
  }

  const supabase = getSupabaseServerClient(env);
  try {
    const { data, error } = await supabase
      .from('organization_invitations')
      .update({
        verification_code_hash: params.code_hash,
        verification_code_expires_at: params.expires_at,
        verification_attempts: 0,
        last_code_sent_at: params.last_sent_at,
      })
      .eq('id', id)
      .select()
      .single();

    if (!error && data) {
      return data as OrgInvitationRecord;
    }
  } catch (err) {
    console.warn('Notice updating verification code in Supabase:', err);
  }

  if (existing) return existing;
  throw new Error('Failed to record verification code');
}

export async function incrementInvitationVerificationAttempts(
  id: string,
  currentAttempts: number,
  env?: Record<string, any>
): Promise<number> {
  const newAttempts = currentAttempts + 1;
  const existing = localInvitationsCache.get(id);
  if (existing) {
    existing.verification_attempts = newAttempts;
  }

  if (!isSupabaseConfigured(env)) {
    return newAttempts;
  }

  const supabase = getSupabaseServerClient(env);
  try {
    await supabase
      .from('organization_invitations')
      .update({
        verification_attempts: newAttempts,
      })
      .eq('id', id);
  } catch (err) {
    console.warn('Notice updating verification attempts in Supabase:', err);
  }

  return newAttempts;
}

export async function clearInvitationVerificationCode(
  id: string,
  env?: Record<string, any>
): Promise<void> {
  const existing = localInvitationsCache.get(id);
  if (existing) {
    existing.verification_code_hash = null;
    existing.verification_code_expires_at = null;
    existing.verification_attempts = 0;
  }

  if (!isSupabaseConfigured(env)) {
    return;
  }

  const supabase = getSupabaseServerClient(env);
  try {
    await supabase
      .from('organization_invitations')
      .update({
        verification_code_hash: null,
        verification_code_expires_at: null,
        verification_attempts: 0,
      })
      .eq('id', id);
  } catch (err) {
    console.warn('Notice clearing verification code in Supabase:', err);
  }
}

/**
 * Sends a single-use 6-digit verification code to the invited user's email via Resend.
 * Enforces invitation token validation, expiration, and 60-second resend cooldown.
 * Secrets are never exposed in API return or logs.
 */
export async function sendInvitationVerificationCode(params: {
  token: string;
  env?: Record<string, any>;
  request?: any;
}): Promise<{ success: boolean; message: string; email: string }> {
  const { token, env, request } = params;

  if (!token || typeof token !== 'string' || !token.trim()) {
    const err: any = new Error('Token parameter is required');
    err.statusCode = 422;
    err.code = 'TOKEN_REQUIRED';
    throw err;
  }

  const tokenHash = hashToken(token.trim());
  const invite = await getInvitationByTokenHash(tokenHash, env);

  if (!invite) {
    const err: any = new Error('Invitation not found or invalid');
    err.statusCode = 404;
    err.code = 'INVITATION_NOT_FOUND';
    throw err;
  }

  if (invite.accepted_at) {
    const err: any = new Error('This invitation has already been accepted');
    err.statusCode = 409;
    err.code = 'INVITATION_ALREADY_ACCEPTED';
    throw err;
  }

  if (new Date(invite.expires_at) < new Date()) {
    const err: any = new Error('This invitation has expired');
    err.statusCode = 410;
    err.code = 'INVITATION_EXPIRED';
    throw err;
  }

  // Enforce 60-second cooldown between resends
  if (invite.last_code_sent_at) {
    const lastSent = new Date(invite.last_code_sent_at).getTime();
    const elapsed = Date.now() - lastSent;
    if (elapsed < 60 * 1000) {
      const remainingSec = Math.ceil((60 * 1000 - elapsed) / 1000);
      const err: any = new Error(`Please wait ${remainingSec}s before requesting a new code.`);
      err.statusCode = 429;
      err.code = 'RESEND_COOLDOWN';
      err.remainingSeconds = remainingSec;
      throw err;
    }
  }

  // Generate 6-digit cryptographically secure code
  const code = crypto.randomInt(100000, 1000000).toString();
  const codeHash = hashToken(code);
  const codeExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  await setInvitationVerificationCode(
    invite.id,
    {
      code_hash: codeHash,
      expires_at: codeExpiresAt,
      last_sent_at: now,
    },
    env
  );

  const baseUrl = getFrontendBaseUrl(env, request);
  const verificationUrl = `${baseUrl}/accept-invite?token=${encodeURIComponent(token.trim())}&code=${code}`;
  const template = generateInvitationVerificationEmailTemplate({
    organizationName: invite.organization_name,
    email: invite.email,
    role: invite.role,
    code,
    verificationUrl,
    expiryMinutes: 15,
  });

  const isProd = isProductionEnvironment(env) || !isLocalFallbackAllowed(env);
  const allowTestFallback =
    !isProd &&
    (env?.ALLOW_EMAIL_TEST_FALLBACK === 'true' ||
      (typeof process !== 'undefined' && process.env?.ALLOW_EMAIL_TEST_FALLBACK === 'true'));

  if (allowTestFallback) {
    console.log(`[Resend TEST FALLBACK] Invitation verification code for ${invite.email}: ${code}`);
    return {
      success: true,
      message: `Verification code sent to ${invite.email}. Please check your inbox and spam folder.`,
      email: invite.email,
    };
  }

  const resendResult = await sendEmailViaResend({
    to: invite.email,
    subject: template.subject,
    html: template.html,
    text: template.text,
    env,
  });

  if (!resendResult.success) {
    console.error('[Resend Error] Failed to send invitation verification code:', resendResult.error);
    const err: any = new Error(
      resendResult.error || 'Failed to send verification email. Please try again later.'
    );
    err.statusCode = 503;
    err.code = 'EMAIL_SEND_FAILED';
    throw err;
  }

  return {
    success: true,
    message: `Verification code sent to ${invite.email}. Please check your inbox and spam folder.`,
    email: invite.email,
  };
}

/**
 * Evaluates the authoritative server-side account status for an invited email address.
 * Distinguishes between:
 *  - new_user: Not registered yet. Requires password.
 *  - existing_password: Registered with password. No password required; existing password preserved.
 *  - existing_google: Registered with Google only. No password required; Google auth preserved.
 *  - already_member: User is already a member (or owner) of the inviting organization. Role preserved, no duplicate membership.
 * Never exposes password hashes, secrets, or sensitive account information.
 */
export async function getInvitationAccountStatus(
  tokenHash: string,
  env?: Record<string, any>
): Promise<{
  invitation: InvitationWithOrgDetails | null;
  accountStatus: 'new_user' | 'existing_password' | 'existing_google' | 'already_member';
  requiresPassword: boolean;
  alreadyMember: boolean;
  existingRole?: OrgRole;
} | null> {
  const invite = await getInvitationByTokenHash(tokenHash, env);
  if (!invite) return null;

  const normalizedEmail = invite.email.trim().toLowerCase();
  const user = await getUserByEmail(normalizedEmail, env);

  if (!user) {
    return {
      invitation: invite,
      accountStatus: 'new_user',
      requiresPassword: true,
      alreadyMember: false,
    };
  }

  // Check if user is already a member or owner of this organization
  const member = await getMember(invite.organization_id, user.id, env);
  const org = await getOrganizationById(invite.organization_id, env);
  const isOwner = (org && org.owner_id === user.id) || (member && member.role === 'owner');

  if (member || isOwner) {
    return {
      invitation: invite,
      accountStatus: 'already_member',
      requiresPassword: false,
      alreadyMember: true,
      existingRole: isOwner ? 'owner' : (member?.role as OrgRole),
    };
  }

  if (user.password_hash) {
    return {
      invitation: invite,
      accountStatus: 'existing_password',
      requiresPassword: false,
      alreadyMember: false,
    };
  }

  if (user.google_id) {
    return {
      invitation: invite,
      accountStatus: 'existing_google',
      requiresPassword: false,
      alreadyMember: false,
    };
  }

  return {
    invitation: invite,
    accountStatus: 'existing_password',
    requiresPassword: false,
    alreadyMember: false,
  };
}

/**
 * Validates the single-use 6-digit verification code without consuming it,
 * returning the authoritative account status and whether a password is required.
 */
export async function validateInvitationVerificationCode(params: {
  token: string;
  code: string;
  env?: Record<string, any>;
}): Promise<{
  valid: boolean;
  accountStatus: 'new_user' | 'existing_password' | 'existing_google' | 'already_member';
  requiresPassword: boolean;
  alreadyMember: boolean;
  email: string;
  organizationName: string;
  role: OrgRole;
  existingRole?: OrgRole;
  message?: string;
}> {
  const { token, code, env } = params;

  if (!token || typeof token !== 'string' || !token.trim()) {
    const err: any = new Error('Token is required');
    err.statusCode = 422;
    err.code = 'TOKEN_REQUIRED';
    throw err;
  }

  if (!code || typeof code !== 'string' || !code.trim()) {
    const err: any = new Error('Verification code is required');
    err.statusCode = 422;
    err.code = 'CODE_REQUIRED';
    throw err;
  }

  const cleanCode = code.trim();
  if (cleanCode.length !== 6 || !/^\d{6}$/.test(cleanCode)) {
    const err: any = new Error('Verification code must be a 6-digit number');
    err.statusCode = 422;
    err.code = 'INVALID_CODE_FORMAT';
    throw err;
  }

  const tokenHash = hashToken(token.trim());
  const invite = await getInvitationByTokenHash(tokenHash, env);

  if (!invite) {
    const err: any = new Error('Invitation not found or invalid');
    err.statusCode = 404;
    err.code = 'INVITATION_NOT_FOUND';
    throw err;
  }

  if (invite.accepted_at) {
    const err: any = new Error('This invitation has already been accepted');
    err.statusCode = 409;
    err.code = 'INVITATION_ALREADY_ACCEPTED';
    throw err;
  }

  if (new Date(invite.expires_at) < new Date()) {
    const err: any = new Error('This invitation has expired');
    err.statusCode = 410;
    err.code = 'INVITATION_EXPIRED';
    throw err;
  }

  if (!invite.verification_code_hash) {
    const err: any = new Error('No verification code has been requested. Please click "Send Verification Code" first.');
    err.statusCode = 400;
    err.code = 'CODE_NOT_REQUESTED';
    throw err;
  }

  if (invite.verification_code_expires_at && new Date(invite.verification_code_expires_at) < new Date()) {
    const err: any = new Error('Verification code has expired. Please request a new code.');
    err.statusCode = 400;
    err.code = 'CODE_EXPIRED';
    throw err;
  }

  const attempts = invite.verification_attempts || 0;
  if (attempts >= 5) {
    await clearInvitationVerificationCode(invite.id, env);
    const err: any = new Error('Too many incorrect attempts. This code has been invalidated. Please request a new code.');
    err.statusCode = 400;
    err.code = 'TOO_MANY_ATTEMPTS';
    throw err;
  }

  const inputCodeHash = hashToken(cleanCode);
  if (inputCodeHash !== invite.verification_code_hash) {
    const updatedAttempts = await incrementInvitationVerificationAttempts(invite.id, attempts, env);
    const remaining = Math.max(0, 5 - updatedAttempts);
    if (remaining <= 0) {
      await clearInvitationVerificationCode(invite.id, env);
      const err: any = new Error('Too many incorrect attempts. This code has been invalidated. Please request a new code.');
      err.statusCode = 400;
      err.code = 'TOO_MANY_ATTEMPTS';
      throw err;
    }
    const err: any = new Error(`Invalid verification code. ${remaining} attempt(s) remaining.`);
    err.statusCode = 400;
    err.code = 'INVALID_CODE';
    err.remainingAttempts = remaining;
    throw err;
  }

  const status = await getInvitationAccountStatus(tokenHash, env);
  return {
    valid: true,
    accountStatus: status?.accountStatus || 'new_user',
    requiresPassword: status ? status.requiresPassword : true,
    alreadyMember: status ? status.alreadyMember : false,
    existingRole: status?.existingRole,
    email: invite.email,
    organizationName: invite.organization_name,
    role: invite.role,
    message: status?.alreadyMember
      ? 'You are already a member of this organization.'
      : status?.requiresPassword
      ? 'Please create a password to complete your account setup.'
      : 'Email verified. Ready to join organization.',
  };
}

/**
 * Verifies the single-use 6-digit code and accepts the invitation.
 * - New user: requires password, securely hashes it, creates user and adds membership.
 * - Existing user with password: preserves existing password, adds membership securely.
 * - Existing Google-only user: preserves Google-only authentication, adds membership securely.
 * - Existing member of target organization: detects duplicate membership, preserves role, prevents duplicate rows.
 * Dispatches notifications and establishes a fully authenticated application session.
 */
export async function acceptInvitationWithEmailVerification(params: {
  token: string;
  code: string;
  password?: string;
  confirmPassword?: string;
  name?: string;
  env?: Record<string, any>;
  request?: any;
}): Promise<{
  token: string;
  user: any;
  organization: any;
  alreadyMember?: boolean;
  message?: string;
}> {
  const { token, code, password, confirmPassword, name, env, request } = params;

  if (!token || typeof token !== 'string' || !token.trim()) {
    const err: any = new Error('Token is required');
    err.statusCode = 422;
    err.code = 'TOKEN_REQUIRED';
    throw err;
  }

  if (!code || typeof code !== 'string' || !code.trim()) {
    const err: any = new Error('Verification code is required');
    err.statusCode = 422;
    err.code = 'CODE_REQUIRED';
    throw err;
  }

  const cleanCode = code.trim();
  if (cleanCode.length !== 6 || !/^\d{6}$/.test(cleanCode)) {
    const err: any = new Error('Verification code must be a 6-digit number');
    err.statusCode = 422;
    err.code = 'INVALID_CODE_FORMAT';
    throw err;
  }

  const tokenHash = hashToken(token.trim());
  const invite = await getInvitationByTokenHash(tokenHash, env);

  if (!invite) {
    const err: any = new Error('Invitation not found or invalid');
    err.statusCode = 404;
    err.code = 'INVITATION_NOT_FOUND';
    throw err;
  }

  if (invite.accepted_at) {
    const err: any = new Error('This invitation has already been accepted');
    err.statusCode = 409;
    err.code = 'INVITATION_ALREADY_ACCEPTED';
    throw err;
  }

  if (new Date(invite.expires_at) < new Date()) {
    const err: any = new Error('This invitation has expired');
    err.statusCode = 410;
    err.code = 'INVITATION_EXPIRED';
    throw err;
  }

  if (!invite.verification_code_hash) {
    const err: any = new Error('No verification code has been requested. Please click "Send Verification Code" first.');
    err.statusCode = 400;
    err.code = 'CODE_NOT_REQUESTED';
    throw err;
  }

  if (invite.verification_code_expires_at && new Date(invite.verification_code_expires_at) < new Date()) {
    const err: any = new Error('Verification code has expired. Please request a new code.');
    err.statusCode = 400;
    err.code = 'CODE_EXPIRED';
    throw err;
  }

  const attempts = invite.verification_attempts || 0;
  if (attempts >= 5) {
    await clearInvitationVerificationCode(invite.id, env);
    const err: any = new Error('Too many incorrect attempts. This code has been invalidated. Please request a new code.');
    err.statusCode = 400;
    err.code = 'TOO_MANY_ATTEMPTS';
    throw err;
  }

  const inputCodeHash = hashToken(cleanCode);
  if (inputCodeHash !== invite.verification_code_hash) {
    const updatedAttempts = await incrementInvitationVerificationAttempts(invite.id, attempts, env);
    const remaining = Math.max(0, 5 - updatedAttempts);
    if (remaining <= 0) {
      await clearInvitationVerificationCode(invite.id, env);
      const err: any = new Error('Too many incorrect attempts. This code has been invalidated. Please request a new code.');
      err.statusCode = 400;
      err.code = 'TOO_MANY_ATTEMPTS';
      throw err;
    }
    const err: any = new Error(`Invalid verification code. ${remaining} attempt(s) remaining.`);
    err.statusCode = 400;
    err.code = 'INVALID_CODE';
    err.remainingAttempts = remaining;
    throw err;
  }

  // Check user existence in database using normalized invited email
  const normalizedEmail = invite.email.trim().toLowerCase();
  let user = await getUserByEmail(normalizedEmail, env);

  if (!user) {
    // NEW USER: Require password!
    if (!password || typeof password !== 'string' || !password.trim()) {
      const err: any = new Error('Password is required to create your account');
      err.statusCode = 422;
      err.code = 'PASSWORD_REQUIRED';
      err.requiresPassword = true;
      err.accountStatus = 'new_user';
      throw err;
    }

    const passValidation = validatePassword(password);
    if (!passValidation.valid) {
      const err: any = new Error(passValidation.error || 'Password does not meet complexity requirements');
      err.statusCode = 422;
      err.code = 'INVALID_PASSWORD';
      throw err;
    }

    if (confirmPassword !== undefined && confirmPassword !== password) {
      const err: any = new Error('Passwords do not match');
      err.statusCode = 422;
      err.code = 'PASSWORDS_DO_NOT_MATCH';
      throw err;
    }

    const passwordHash = await hashPassword(password);

    try {
      user = await createUser(
        {
          email: normalizedEmail,
          name: (name && typeof name === 'string' && name.trim()) || normalizedEmail.split('@')[0] || 'User',
          password_hash: passwordHash,
          email_verified: true,
          verified_at: new Date().toISOString(),
        },
        env
      );
    } catch (createErr: any) {
      if (isUniqueViolationError(createErr)) {
        user = await getUserByEmail(normalizedEmail, env);
        if (!user) throw createErr;
        // If user already had a password, DO NOT overwrite it!
        if (!user.password_hash) {
          user = await setUserPassword(user.id, passwordHash, env);
        }
        if (!user.email_verified) {
          user = await verifyUserEmail(user.id, env);
        }
      } else {
        throw createErr;
      }
    }
  } else {
    // EXISTING USER:
    // DO NOT require a password!
    // DO NOT overwrite existing password under any circumstances!
    // Ensure email is marked verified:
    if (!user.email_verified) {
      user = await verifyUserEmail(user.id, env);
    }
    if (!user.name && name && typeof name === 'string' && name.trim()) {
      user = await updateUserProfile(user.id, { name: name.trim() }, env).catch(() => user!);
    }
  }

  // Clear verification code now that identity and user record are established
  await clearInvitationVerificationCode(invite.id, env);

  // Check organization membership & role
  const existingMember = await getMember(invite.organization_id, user.id, env);
  const org = await getOrganizationById(invite.organization_id, env);
  const isOrgOwner = (org && org.owner_id === user.id) || (existingMember && existingMember.role === 'owner');
  const isAlreadyMember = Boolean(existingMember || isOrgOwner);

  let effectiveRole: OrgRole = invite.role;

  if (isAlreadyMember) {
    // Detect duplicate membership:
    // Do NOT create duplicate membership.
    // Do NOT overwrite user's role!
    effectiveRole = isOrgOwner ? 'owner' : (existingMember ? existingMember.role : invite.role);
  } else {
    // Add member with invite.role from authoritative invitation record
    await addMember(
      {
        organization_id: invite.organization_id,
        user_id: user.id,
        role: invite.role,
      },
      env
    );
    effectiveRole = invite.role;

    // Dispatch notification
    await dispatchNotificationEvent(
      {
        eventType: 'MEMBER_JOINED',
        organizationId: invite.organization_id,
        memberUserId: user.id,
        memberName: user.name || user.email,
        orgName: org?.name || invite.organization_name || 'Organization',
        role: invite.role,
      },
      env
    ).catch((err) => console.error('[NOTIFICATION] Failed to dispatch MEMBER_JOINED:', err));
  }

  // Mark invitation accepted
  await markInvitationAccepted(invite.id, env);

  // Issue authoritative application JWT session token
  const appToken = await signAppToken(user.id, invite.organization_id, effectiveRole, undefined, env);

  return {
    token: appToken,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar_url: user.avatar_url,
      is_developer: user.is_developer === true,
    },
    organization: {
      id: org?.id || invite.organization_id,
      name: org?.name || invite.organization_name,
      slug: org?.slug || '',
      role: effectiveRole,
    },
    alreadyMember: isAlreadyMember,
    message: isAlreadyMember
      ? 'You are already a member of this organization.'
      : 'Invitation accepted successfully!',
  };
}
