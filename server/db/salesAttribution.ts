import {
  getSupabaseServerClient,
  isSupabaseConfigured,
  isLocalFallbackAllowed,
  isProductionEnvironment,
  assertProductionSalesSafe,
} from '../supabase.js';
import {
  SalesReferralCodeRecord,
  CustomerAttributionRecord,
  CustomerAttributionWithDetails,
  CustomerAttributionAuditLogRecord,
  AttributionStatus,
} from './types.js';
import { getSalesPartnerProfileByUserId, getSalesPartnerProfileById } from './salesPartners.js';
import { getUserById, getUserByEmail } from './users.js';
import { getOrganizationById, getUserOrganizations } from './organizations.js';
import crypto from 'node:crypto';

// In-memory local fallback stores
export const localReferralCodesCache = new Map<string, SalesReferralCodeRecord>();
export const localAttributionsCache = new Map<string, CustomerAttributionRecord>();
export const localAttributionAuditLogsCache: CustomerAttributionAuditLogRecord[] = [];

export function clearLocalAttributionsCache(): void {
  localReferralCodesCache.clear();
  localAttributionsCache.clear();
  localAttributionAuditLogsCache.length = 0;
}

export const clearLocalReferralCodesCache = clearLocalAttributionsCache;

/**
 * Generate a cryptographically random, collision-resistant referral code.
 * Format: REF-XXXXXXXX (8 uppercase base32 characters, excluding ambiguous chars 0, O, 1, I)
 */
export function generateRandomReferralCode(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const randomBytes = crypto.randomBytes(8);
  let result = 'REF-';
  for (let i = 0; i < 8; i++) {
    result += chars[randomBytes[i] % chars.length];
  }
  return result;
}

/**
 * Helper to record an audit log entry for attribution decisions.
 */
async function recordAttributionAuditLog(
  attributionId: string,
  action: 'CREATED' | 'APPROVED' | 'REJECTED' | 'REASSIGNED' | 'FLAGGED_REVIEW' | 'ORG_LINKED',
  params: {
    previous_status?: string | null;
    new_status: string;
    previous_partner_id?: string | null;
    new_partner_id?: string | null;
    reason?: string | null;
    actor_user_id?: string | null;
    metadata?: Record<string, any>;
  },
  env?: Record<string, any>
): Promise<void> {
  const auditRecord: CustomerAttributionAuditLogRecord = {
    id: crypto.randomUUID(),
    attribution_id: attributionId,
    previous_status: params.previous_status || null,
    new_status: params.new_status,
    previous_partner_id: params.previous_partner_id || null,
    new_partner_id: params.new_partner_id || null,
    action,
    reason: params.reason || null,
    actor_user_id: params.actor_user_id || null,
    metadata: params.metadata || {},
    created_at: new Date().toISOString(),
  };

  localAttributionAuditLogsCache.push(auditRecord);

  if (isSupabaseConfigured(env)) {
    try {
      const supabase = getSupabaseServerClient(env);
      await supabase.from('customer_attribution_audit_logs').insert(auditRecord);
    } catch (err: any) {
      console.warn('[salesAttribution] Could not persist audit log to Supabase:', err.message);
    }
  }
}

/**
 * Retrieves or generates the authoritative referral code for an active Sales Partner.
 * Fails closed if the partner is not active or suspended.
 */
export async function getOrCreateSalesReferralCode(
  partnerUserId: string,
  env?: Record<string, any>
): Promise<SalesReferralCodeRecord> {
  const normUserId = (partnerUserId || '').trim();
  if (!normUserId) {
    throw new Error('Partner user ID is required');
  }

  // Verify partner status: Must be active
  const partnerProfile = await getSalesPartnerProfileByUserId(normUserId, env);
  if (!partnerProfile || partnerProfile.status !== 'active') {
    throw new Error('Active Sales Partner profile is required to generate or retrieve referral codes');
  }

  // 1. Check if partner already has an active code
  if (isSupabaseConfigured(env)) {
    const supabase = getSupabaseServerClient(env);
    const { data: existing, error } = await supabase
      .from('sales_referral_codes')
      .select('*')
      .eq('partner_user_id', normUserId)
      .eq('is_active', true)
      .maybeSingle();

    if (!error && existing) {
      const rec = existing as SalesReferralCodeRecord;
      localReferralCodesCache.set(rec.code, rec);
      return rec;
    }
  } else {
    for (const c of localReferralCodesCache.values()) {
      if (c.partner_user_id === normUserId && c.is_active && !c.revoked_at) {
        return c;
      }
    }
  }

  // 2. Generate a fresh, unique code
  let newCode = generateRandomReferralCode();
  let attempts = 0;
  while (attempts < 5) {
    const existingCode = await getReferralCodeByCode(newCode, env);
    if (!existingCode) break;
    newCode = generateRandomReferralCode();
    attempts++;
  }

  const now = new Date().toISOString();
  const newRecord: SalesReferralCodeRecord = {
    id: crypto.randomUUID(),
    sales_partner_id: partnerProfile.id,
    partner_user_id: normUserId,
    code: newCode,
    is_active: true,
    revoked_at: null,
    created_at: now,
    updated_at: now,
  };

  if (isSupabaseConfigured(env)) {
    const supabase = getSupabaseServerClient(env);
    const { data: inserted, error: insertErr } = await supabase
      .from('sales_referral_codes')
      .insert(newRecord)
      .select()
      .single();

    if (insertErr) {
      if (!isLocalFallbackAllowed(env)) {
        throw new Error(`Failed to create referral code in database: ${insertErr.message}`);
      }
    } else if (inserted) {
      localReferralCodesCache.set(newRecord.code, inserted as SalesReferralCodeRecord);
      return inserted as SalesReferralCodeRecord;
    }
  }

  localReferralCodesCache.set(newRecord.code, newRecord);
  return newRecord;
}

/**
 * Retrieves a referral code record by code.
 */
export async function getReferralCodeByCode(
  code: string,
  env?: Record<string, any>
): Promise<SalesReferralCodeRecord | null> {
  const normCode = (code || '').trim().toUpperCase();
  if (!normCode) return null;

  if (isSupabaseConfigured(env)) {
    const supabase = getSupabaseServerClient(env);
    const { data, error } = await supabase
      .from('sales_referral_codes')
      .select('*')
      .eq('code', normCode)
      .maybeSingle();

    if (!error && data) {
      const rec = data as SalesReferralCodeRecord;
      localReferralCodesCache.set(normCode, rec);
      return rec;
    }
  }

  for (const c of localReferralCodesCache.values()) {
    if (c.code.toUpperCase() === normCode) {
      return c;
    }
  }

  return null;
}

/**
 * Validates a referral code server-side.
 * Verifies code exists, is active, not revoked, and the associated Sales Partner is currently active.
 */
export async function validateReferralCode(
  code: string,
  env?: Record<string, any>
): Promise<{
  valid: boolean;
  codeRecord?: SalesReferralCodeRecord;
  partnerProfile?: any;
  reason?: string;
}> {
  const normCode = (code || '').trim().toUpperCase();
  if (!normCode) {
    return { valid: false, reason: 'CODE_EMPTY' };
  }

  const codeRecord = await getReferralCodeByCode(normCode, env);
  if (!codeRecord) {
    return { valid: false, reason: 'CODE_NOT_FOUND' };
  }

  if (!codeRecord.is_active || codeRecord.revoked_at !== null) {
    return { valid: false, reason: 'CODE_INACTIVE_OR_REVOKED' };
  }

  // Check referring Sales Partner profile
  const partnerProfile = await getSalesPartnerProfileById(codeRecord.sales_partner_id, env);
  if (!partnerProfile || partnerProfile.status !== 'active') {
    return { valid: false, reason: 'SALES_PARTNER_NOT_ACTIVE' };
  }

  return {
    valid: true,
    codeRecord,
    partnerProfile,
  };
}

/**
 * Records a customer referral attribution.
 * Applies deterministic ownership, self-referral, existing customer, and duplicate referral rules.
 */
export async function recordCustomerReferral(
  params: {
    referralCode: string;
    prospectEmail?: string | null;
    referredUserId?: string | null;
    organizationId?: string | null;
    referralMethod?: 'link' | 'code' | 'admin_lead' | 'direct';
  },
  env?: Record<string, any>
): Promise<{
  success: boolean;
  attribution?: CustomerAttributionRecord;
  error?: string;
  code?: string;
}> {
  const { referralCode, prospectEmail, referredUserId, organizationId, referralMethod = 'link' } = params;

  assertProductionSalesSafe('recordCustomerReferral', env);

  // 1. Validate referral code
  const validation = await validateReferralCode(referralCode, env);
  if (!validation.valid || !validation.codeRecord || !validation.partnerProfile) {
    return {
      success: false,
      error: 'Invalid or inactive referral code',
      code: validation.reason || 'INVALID_REFERRAL_CODE',
    };
  }

  const codeRec = validation.codeRecord;
  const partnerUserId = codeRec.partner_user_id;
  const now = new Date().toISOString();

  // Resolve prospect email if not provided but user ID is available
  let cleanEmail = (prospectEmail || '').trim().toLowerCase() || null;
  if (!cleanEmail && referredUserId) {
    const user = await getUserById(referredUserId, env);
    if (user?.email) {
      cleanEmail = user.email.trim().toLowerCase();
    }
  }

  // 2. Self-Referral Check:
  // If the referred user is the partner themselves, flag for admin review / reject commission claim.
  let isSelfReferral = false;
  if (referredUserId && referredUserId === partnerUserId) {
    isSelfReferral = true;
  }
  if (!isSelfReferral && cleanEmail) {
    const partnerUser = await getUserById(partnerUserId, env);
    if (partnerUser?.email && partnerUser.email.trim().toLowerCase() === cleanEmail) {
      isSelfReferral = true;
    }
  }

  // 3. Find prior attributions for this customer across any partners
  const priorAttributions = (referredUserId || cleanEmail)
    ? await findPriorAttributionsForCustomer(referredUserId || undefined, cleanEmail || undefined, env)
    : [];

  // 3a. Idempotency & Duplicate Prevention:
  // If this same sales partner already captured a referral for this customer, reuse and return it!
  const existingSamePartner = priorAttributions.find(
    (a) => a.sales_partner_id === codeRec.sales_partner_id || a.partner_user_id === partnerUserId
  );
  if (existingSamePartner) {
    let needsUpdate = false;
    if (!existingSamePartner.referred_user_id && referredUserId) {
      existingSamePartner.referred_user_id = referredUserId;
      needsUpdate = true;
    }
    if (!existingSamePartner.organization_id && organizationId) {
      existingSamePartner.organization_id = organizationId;
      needsUpdate = true;
    }
    if (needsUpdate) {
      existingSamePartner.updated_at = now;
      if (isSupabaseConfigured(env)) {
        const supabase = getSupabaseServerClient(env);
        await supabase
          .from('customer_attributions')
          .update({
            referred_user_id: existingSamePartner.referred_user_id,
            organization_id: existingSamePartner.organization_id,
            updated_at: existingSamePartner.updated_at,
          })
          .eq('id', existingSamePartner.id);
      }
      localAttributionsCache.set(existingSamePartner.id, existingSamePartner);
    }
    return {
      success: true,
      attribution: existingSamePartner,
    };
  }

  // 3b. Existing Customer & Organization Checks:
  // A customer is an existing customer if:
  // - The user was created before this referral (more than 10 mins ago) or already belongs to organizations
  // - An account with this prospect email was already registered previously
  // - The organization was created before this referral
  let isExistingCustomer = false;
  let isCompetingClaim = false;
  let competingAttributionId: string | null = null;
  let reviewReason: string | null = null;

  if (referredUserId) {
    const existingUser = await getUserById(referredUserId, env);
    if (existingUser) {
      const userOrgs = await getUserOrganizations(referredUserId, env);
      const userAgeMs = Date.now() - new Date(existingUser.created_at).getTime();
      if (userOrgs.length > 0 || userAgeMs > 10 * 60 * 1000) {
        isExistingCustomer = true;
        reviewReason = 'Existing customer detected: User account or organization existed prior to referral';
      }
    }
  }

  if (!isExistingCustomer && cleanEmail) {
    const existingUserByEmail = await getUserByEmail(cleanEmail, env);
    if (existingUserByEmail) {
      const emailUserAgeMs = Date.now() - new Date(existingUserByEmail.created_at).getTime();
      if (emailUserAgeMs > 10 * 60 * 1000) {
        isExistingCustomer = true;
        reviewReason = 'Existing customer detected: Email was registered prior to referral';
      }
    }
  }

  if (organizationId) {
    const org = await getOrganizationById(organizationId, env);
    if (org) {
      // Check if partner is the owner of the organization
      if (org.owner_id === partnerUserId) {
        isSelfReferral = true;
      }

      const orgAgeMs = Date.now() - new Date(org.created_at).getTime();
      if (orgAgeMs > 10 * 60 * 1000) {
        isExistingCustomer = true;
        reviewReason = 'Existing customer detected: Organization was established prior to referral';
      }

      // Check if this organization already has an approved attribution
      const existingApproved = await getApprovedAttributionForOrg(organizationId, env);
      if (existingApproved) {
        if (existingApproved.partner_user_id !== partnerUserId) {
          isCompetingClaim = true;
          competingAttributionId = existingApproved.id;
          reviewReason = `Organization already attributed to partner ${existingApproved.partner_user_id}`;
        }
      }
    }
  }

  // Check if this user or prospect email was previously referred by a DIFFERENT partner
  if (!isCompetingClaim) {
    const conflicting = priorAttributions.find(
      (a) => a.sales_partner_id !== codeRec.sales_partner_id && a.partner_user_id !== partnerUserId
    );
    if (conflicting) {
      isCompetingClaim = true;
      competingAttributionId = conflicting.id;
      reviewReason = `Customer was previously referred by partner ${conflicting.partner_user_id}`;
    }
  }

  // 4. Determine initial status:
  let status: AttributionStatus = 'pending';

  if (isSelfReferral) {
    status = 'needs_review';
    reviewReason = 'Self-referral detected: Partner is the referred customer or organization owner';
  } else if (isCompetingClaim) {
    status = 'needs_review';
  } else if (isExistingCustomer) {
    // Existing customers must NEVER be automatically approved without Admin review
    status = 'needs_review';
    reviewReason = reviewReason || 'Existing customer: Requires administrator review before attribution';
  } else if (organizationId) {
    // If organization is established, brand-new, and no conflicts, attribution can be approved
    status = 'approved';
  } else {
    // Registered prospect waiting for organization creation
    status = 'pending';
  }

  const attributionRecord: CustomerAttributionRecord = {
    id: crypto.randomUUID(),
    sales_partner_id: codeRec.sales_partner_id,
    partner_user_id: partnerUserId,
    referral_code: codeRec.code,
    referral_method: referralMethod,
    prospect_email: cleanEmail,
    referred_user_id: referredUserId || null,
    organization_id: organizationId || null,
    status,
    is_self_referral: isSelfReferral,
    is_existing_customer: isExistingCustomer,
    is_competing_claim: isCompetingClaim,
    competing_attribution_id: competingAttributionId,
    review_reason: reviewReason,
    decision_reason: status === 'approved' ? 'Automatic attribution on verified new organization' : null,
    decided_by_user_id: null,
    decided_at: status === 'approved' ? now : null,
    established_at: status === 'approved' ? now : null,
    created_at: now,
    updated_at: now,
  };

  // 5. Persist attribution
  if (isSupabaseConfigured(env)) {
    const supabase = getSupabaseServerClient(env);
    const { data: inserted, error: insertErr } = await supabase
      .from('customer_attributions')
      .insert(attributionRecord)
      .select()
      .single();

    if (insertErr) {
      if (!isLocalFallbackAllowed(env)) {
        throw new Error(`Failed to save customer attribution: ${insertErr.message}`);
      }
    } else if (inserted) {
      localAttributionsCache.set(attributionRecord.id, inserted as CustomerAttributionRecord);
    }
  }

  localAttributionsCache.set(attributionRecord.id, attributionRecord);

  // 6. Record audit log
  await recordAttributionAuditLog(
    attributionRecord.id,
    'CREATED',
    {
      previous_status: null,
      new_status: status,
      new_partner_id: partnerUserId,
      reason: reviewReason || 'Referral captured',
      metadata: {
        referral_code: codeRec.code,
        method: referralMethod,
        is_self_referral: isSelfReferral,
        is_competing: isCompetingClaim,
      },
    },
    env
  );

  return {
    success: true,
    attribution: attributionRecord,
  };
}

/**
 * Finds prior attribution records matching a referred user ID or email.
 */
async function findPriorAttributionsForCustomer(
  userId?: string,
  email?: string,
  env?: Record<string, any>
): Promise<CustomerAttributionRecord[]> {
  const results: CustomerAttributionRecord[] = [];

  if (isSupabaseConfigured(env)) {
    const supabase = getSupabaseServerClient(env);
    let query = supabase.from('customer_attributions').select('*');

    if (userId && email) {
      query = query.or(`referred_user_id.eq.${userId},prospect_email.eq.${email}`);
    } else if (userId) {
      query = query.eq('referred_user_id', userId);
    } else if (email) {
      query = query.eq('prospect_email', email);
    } else {
      return [];
    }

    const { data, error } = await query;
    if (!error && Array.isArray(data)) {
      return data as CustomerAttributionRecord[];
    }
  }

  for (const a of localAttributionsCache.values()) {
    if (userId && a.referred_user_id === userId) {
      results.push(a);
    } else if (email && a.prospect_email === email) {
      results.push(a);
    }
  }

  return results;
}

/**
 * Retrieves the single approved attribution for an organization, if one exists.
 */
export async function getApprovedAttributionForOrg(
  orgId: string,
  env?: Record<string, any>
): Promise<CustomerAttributionRecord | null> {
  const normOrgId = (orgId || '').trim();
  if (!normOrgId) return null;

  if (isSupabaseConfigured(env)) {
    const supabase = getSupabaseServerClient(env);
    const { data, error } = await supabase
      .from('customer_attributions')
      .select('*')
      .eq('organization_id', normOrgId)
      .eq('status', 'approved')
      .maybeSingle();

    if (!error && data) {
      return data as CustomerAttributionRecord;
    }
  }

  for (const a of localAttributionsCache.values()) {
    if (a.organization_id === normOrgId && a.status === 'approved') {
      return a;
    }
  }

  return null;
}

/**
 * Links an newly established organization to an existing pending attribution for this user.
 * Called server-side when a customer completes organization creation.
 */
export async function linkOrganizationToPendingAttribution(
  userId: string,
  organizationId: string,
  env?: Record<string, any>
): Promise<CustomerAttributionRecord | null> {
  const normUserId = (userId || '').trim();
  const normOrgId = (organizationId || '').trim();
  if (!normUserId || !normOrgId) return null;

  // 1. Find pending attribution for this user (by user ID first, then fallback to prospect email)
  let pendingAttribution: CustomerAttributionRecord | null = null;

  if (isSupabaseConfigured(env)) {
    const supabase = getSupabaseServerClient(env);
    const { data, error } = await supabase
      .from('customer_attributions')
      .select('*')
      .eq('referred_user_id', normUserId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .maybeSingle();

    if (!error && data) {
      pendingAttribution = data as CustomerAttributionRecord;
    }
  }

  if (!pendingAttribution) {
    for (const a of localAttributionsCache.values()) {
      if (a.referred_user_id === normUserId && a.status === 'pending') {
        pendingAttribution = a;
        break;
      }
    }
  }

  // Fallback: If not found by user ID, check if lead was captured by email before registration
  if (!pendingAttribution) {
    const user = await getUserById(normUserId, env);
    if (user?.email) {
      const userEmail = user.email.trim().toLowerCase();
      if (isSupabaseConfigured(env)) {
        const supabase = getSupabaseServerClient(env);
        const { data, error } = await supabase
          .from('customer_attributions')
          .select('*')
          .eq('prospect_email', userEmail)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .maybeSingle();

        if (!error && data) {
          pendingAttribution = data as CustomerAttributionRecord;
        }
      }

      if (!pendingAttribution) {
        for (const a of localAttributionsCache.values()) {
          if (a.prospect_email?.toLowerCase() === userEmail && a.status === 'pending') {
            pendingAttribution = a;
            break;
          }
        }
      }
    }
  }

  if (!pendingAttribution) return null;

  // 2. Check if organization already has an approved attribution
  const existingApproved = await getApprovedAttributionForOrg(normOrgId, env);
  if (existingApproved && existingApproved.id !== pendingAttribution.id) {
    // Competing claim detected: Do NOT overwrite!
    const updated: CustomerAttributionRecord = {
      ...pendingAttribution,
      referred_user_id: normUserId,
      organization_id: normOrgId,
      status: 'needs_review',
      is_competing_claim: true,
      competing_attribution_id: existingApproved.id,
      review_reason: `Organization already attributed to partner ${existingApproved.partner_user_id}`,
      updated_at: new Date().toISOString(),
    };
    if (isSupabaseConfigured(env)) {
      const supabase = getSupabaseServerClient(env);
      await supabase.from('customer_attributions').update(updated).eq('id', updated.id);
    }
    localAttributionsCache.set(updated.id, updated);
    await recordAttributionAuditLog(
      updated.id,
      'FLAGGED_REVIEW',
      {
        previous_status: pendingAttribution.status,
        new_status: 'needs_review',
        reason: updated.review_reason,
      },
      env
    );
    return updated;
  }

  // 3. Existing customer and self-referral checks
  let isExistingCustomer = pendingAttribution.is_existing_customer;
  let finalStatus: AttributionStatus = isExistingCustomer ? 'needs_review' : 'approved';
  let reviewReason = pendingAttribution.review_reason;

  // Check if user already owned other organizations before this one
  const userOrgs = await getUserOrganizations(normUserId, env);
  const otherOrgs = userOrgs.filter((o) => o.id !== normOrgId);
  if (otherOrgs.length > 0) {
    isExistingCustomer = true;
    finalStatus = 'needs_review';
    reviewReason = 'Existing customer detected: User previously created or belonged to other organizations';
  }

  const org = await getOrganizationById(normOrgId, env);
  const isSelf = pendingAttribution.partner_user_id === normUserId || (org && org.owner_id === pendingAttribution.partner_user_id);
  if (isSelf) {
    finalStatus = 'needs_review';
    reviewReason = 'Self-referral detected: Partner is owner or creator of the organization';
  }

  const now = new Date().toISOString();
  const updatedRecord: CustomerAttributionRecord = {
    ...pendingAttribution,
    referred_user_id: normUserId,
    organization_id: normOrgId,
    status: finalStatus,
    is_self_referral: Boolean(isSelf),
    is_existing_customer: isExistingCustomer,
    review_reason: reviewReason,
    established_at: finalStatus === 'approved' ? now : null,
    updated_at: now,
  };

  if (isSupabaseConfigured(env)) {
    const supabase = getSupabaseServerClient(env);
    await supabase
      .from('customer_attributions')
      .update(updatedRecord)
      .eq('id', updatedRecord.id);
  }

  localAttributionsCache.set(updatedRecord.id, updatedRecord);

  await recordAttributionAuditLog(
    updatedRecord.id,
    'ORG_LINKED',
    {
      previous_status: pendingAttribution.status,
      new_status: finalStatus,
      reason: `Organization ${normOrgId} linked to attribution`,
      metadata: { organization_id: normOrgId },
    },
    env
  );

  return updatedRecord;
}

/**
 * Retrieves a single attribution record with enriched partner and customer details.
 */
export async function getAttributionById(
  attributionId: string,
  env?: Record<string, any>
): Promise<CustomerAttributionWithDetails | null> {
  const normId = (attributionId || '').trim();
  if (!normId) return null;

  let base: CustomerAttributionRecord | null = null;

  if (isSupabaseConfigured(env)) {
    const supabase = getSupabaseServerClient(env);
    const { data, error } = await supabase
      .from('customer_attributions')
      .select('*')
      .eq('id', normId)
      .maybeSingle();

    if (!error && data) {
      base = data as CustomerAttributionRecord;
    }
  }

  if (!base) {
    base = localAttributionsCache.get(normId) || null;
  }

  if (!base) return null;

  // Enrich partner
  const partnerUser = await getUserById(base.partner_user_id, env);
  const partnerProfile = await getSalesPartnerProfileById(base.sales_partner_id, env);

  // Enrich referred user
  let referredUser = null;
  if (base.referred_user_id) {
    const u = await getUserById(base.referred_user_id, env);
    if (u) {
      referredUser = { id: u.id, name: u.name, email: u.email };
    }
  }

  // Enrich organization
  let org = null;
  if (base.organization_id) {
    const o = await getOrganizationById(base.organization_id, env);
    if (o) {
      org = { id: o.id, name: o.name, slug: o.slug, owner_id: o.owner_id };
    }
  }

  // Enrich competing attribution if applicable
  let competingAttribution: any = null;
  if (base.competing_attribution_id) {
    let compBase: CustomerAttributionRecord | null = null;
    if (isSupabaseConfigured(env)) {
      const supabase = getSupabaseServerClient(env);
      const { data } = await supabase
        .from('customer_attributions')
        .select('*')
        .eq('id', base.competing_attribution_id)
        .maybeSingle();
      if (data) compBase = data as CustomerAttributionRecord;
    }
    if (!compBase) {
      compBase = localAttributionsCache.get(base.competing_attribution_id) || null;
    }
    if (compBase) {
      const compPartnerUser = await getUserById(compBase.partner_user_id, env);
      competingAttribution = {
        ...compBase,
        partner: {
          id: compBase.sales_partner_id,
          user_id: compBase.partner_user_id,
          name: compPartnerUser?.name || 'Competing Partner',
          email: compPartnerUser?.email || '',
        },
      };
    }
  }

  return {
    ...base,
    partner: {
      id: base.sales_partner_id,
      user_id: base.partner_user_id,
      name: partnerUser?.name || 'Unknown Partner',
      email: partnerUser?.email || '',
      status: partnerProfile?.status || 'pending',
    },
    referred_user: referredUser,
    organization: org,
    competing_attribution: competingAttribution,
  };
}

/**
 * Lists customer attributions with optional filtering by status, partner, or search term.
 */
export async function listCustomerAttributions(
  filters?: {
    status?: AttributionStatus;
    partnerId?: string;
    partnerUserId?: string;
    organizationId?: string;
    search?: string;
  },
  env?: Record<string, any>
): Promise<CustomerAttributionWithDetails[]> {
  let records: CustomerAttributionRecord[] = [];

  if (isSupabaseConfigured(env)) {
    const supabase = getSupabaseServerClient(env);
    let query = supabase.from('customer_attributions').select('*').order('created_at', { ascending: false });

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.partnerId) {
      query = query.eq('sales_partner_id', filters.partnerId);
    }
    if (filters?.partnerUserId) {
      query = query.eq('partner_user_id', filters.partnerUserId);
    }
    if (filters?.organizationId) {
      query = query.eq('organization_id', filters.organizationId);
    }

    const { data, error } = await query;
    if (!error && Array.isArray(data)) {
      records = data as CustomerAttributionRecord[];
    }
  }

  if (records.length === 0) {
    records = Array.from(localAttributionsCache.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    if (filters?.status) {
      records = records.filter((r) => r.status === filters.status);
    }
    if (filters?.partnerId) {
      records = records.filter((r) => r.sales_partner_id === filters.partnerId);
    }
    if (filters?.partnerUserId) {
      records = records.filter((r) => r.partner_user_id === filters.partnerUserId);
    }
    if (filters?.organizationId) {
      records = records.filter((r) => r.organization_id === filters.organizationId);
    }
  }

  // Enrich each record
  const enriched: CustomerAttributionWithDetails[] = [];
  for (const r of records) {
    const partnerUser = await getUserById(r.partner_user_id, env);
    const partnerProfile = await getSalesPartnerProfileById(r.sales_partner_id, env);

    let referredUser = null;
    if (r.referred_user_id) {
      const u = await getUserById(r.referred_user_id, env);
      if (u) referredUser = { id: u.id, name: u.name, email: u.email };
    }

    let org = null;
    if (r.organization_id) {
      const o = await getOrganizationById(r.organization_id, env);
      if (o) org = { id: o.id, name: o.name, slug: o.slug, owner_id: o.owner_id };
    }

    enriched.push({
      ...r,
      partner: {
        id: r.sales_partner_id,
        user_id: r.partner_user_id,
        name: partnerUser?.name || 'Unknown Partner',
        email: partnerUser?.email || '',
        status: partnerProfile?.status || 'pending',
      },
      referred_user: referredUser,
      organization: org,
    });
  }

  // Apply search query filter across code, email, id, customer name/email, org name/slug, and partner name/email
  if (filters?.search && filters.search.trim()) {
    const q = filters.search.trim().toLowerCase();
    return enriched.filter(
      (item) =>
        item.referral_code.toLowerCase().includes(q) ||
        (item.prospect_email && item.prospect_email.toLowerCase().includes(q)) ||
        item.id.toLowerCase().includes(q) ||
        (item.referred_user?.name && item.referred_user.name.toLowerCase().includes(q)) ||
        (item.referred_user?.email && item.referred_user.email.toLowerCase().includes(q)) ||
        (item.organization?.name && item.organization.name.toLowerCase().includes(q)) ||
        (item.organization?.slug && item.organization.slug.toLowerCase().includes(q)) ||
        (item.partner?.name && item.partner.name.toLowerCase().includes(q)) ||
        (item.partner?.email && item.partner.email.toLowerCase().includes(q))
    );
  }

  return enriched;
}

/**
 * Retrieves audit history log records for a specific attribution.
 */
export async function getAttributionAuditLogs(
  attributionId: string,
  env?: Record<string, any>
): Promise<CustomerAttributionAuditLogRecord[]> {
  const normId = (attributionId || '').trim();
  if (!normId) return [];

  if (isSupabaseConfigured(env)) {
    const supabase = getSupabaseServerClient(env);
    const { data, error } = await supabase
      .from('customer_attribution_audit_logs')
      .select('*')
      .eq('attribution_id', normId)
      .order('created_at', { ascending: false });

    if (!error && Array.isArray(data)) {
      return data as CustomerAttributionAuditLogRecord[];
    }
  }

  return localAttributionAuditLogsCache
    .filter((l) => l.attribution_id === normId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

/**
 * Admin action: Approves a pending or flagged attribution.
 * Enforces single-approved attribution per organization rule.
 */
export async function approveCustomerAttribution(
  attributionId: string,
  adminUserId: string,
  reason?: string,
  options?: {
    allowSelfReferralOverride?: boolean;
    allowExistingCustomerOverride?: boolean;
  },
  env?: Record<string, any>
): Promise<CustomerAttributionRecord> {
  assertProductionSalesSafe('approveCustomerAttribution', env);

  const attribution = await getAttributionById(attributionId, env);
  if (!attribution) {
    throw new Error('Attribution record not found');
  }

  // 1. Safeguard against unconfirmed self-referral approvals
  if (attribution.is_self_referral && !options?.allowSelfReferralOverride) {
    throw new Error(
      'Cannot approve self-referral claim without explicit administrator override confirmation and recorded justification'
    );
  }

  // 2. Safeguard against unconfirmed existing customer approvals
  if (attribution.is_existing_customer && !options?.allowExistingCustomerOverride) {
    throw new Error(
      'Cannot approve attribution for existing customer organization without explicit administrator override confirmation and recorded justification'
    );
  }

  // 3. If organization exists, verify that no OTHER approved attribution exists
  if (attribution.organization_id) {
    const existingApproved = await getApprovedAttributionForOrg(attribution.organization_id, env);
    if (existingApproved && existingApproved.id !== attribution.id) {
      throw new Error(
        `Cannot approve: Organization is already attributed to partner ${existingApproved.partner_user_id}. Reassign existing attribution first.`
      );
    }
  }

  const now = new Date().toISOString();
  const updated: CustomerAttributionRecord = {
    ...attribution,
    status: 'approved',
    decision_reason: reason || 'Approved by administrator',
    decided_by_user_id: adminUserId,
    decided_at: now,
    established_at: attribution.established_at || now,
    updated_at: now,
  };

  if (isSupabaseConfigured(env)) {
    const supabase = getSupabaseServerClient(env);
    await supabase.from('customer_attributions').update(updated).eq('id', updated.id);
  }

  localAttributionsCache.set(updated.id, updated);

  await recordAttributionAuditLog(
    updated.id,
    'APPROVED',
    {
      previous_status: attribution.status,
      new_status: 'approved',
      reason: reason || 'Approved by administrator',
      actor_user_id: adminUserId,
      metadata: {
        overrode_self_referral: Boolean(attribution.is_self_referral && options?.allowSelfReferralOverride),
        overrode_existing_customer: Boolean(attribution.is_existing_customer && options?.allowExistingCustomerOverride),
      },
    },
    env
  );

  return updated;
}

/**
 * Admin action: Rejects an attribution with recorded justification.
 */
export async function rejectCustomerAttribution(
  attributionId: string,
  adminUserId: string,
  reason: string,
  env?: Record<string, any>
): Promise<CustomerAttributionRecord> {
  assertProductionSalesSafe('rejectCustomerAttribution', env);

  if (!reason || !reason.trim()) {
    throw new Error('A recorded rejection reason is required');
  }

  const attribution = await getAttributionById(attributionId, env);
  if (!attribution) {
    throw new Error('Attribution record not found');
  }

  const now = new Date().toISOString();
  const updated: CustomerAttributionRecord = {
    ...attribution,
    status: 'rejected',
    decision_reason: reason.trim(),
    decided_by_user_id: adminUserId,
    decided_at: now,
    updated_at: now,
  };

  if (isSupabaseConfigured(env)) {
    const supabase = getSupabaseServerClient(env);
    const { error: updateErr } = await supabase.from('customer_attributions').update(updated).eq('id', updated.id);
    if (updateErr && !isLocalFallbackAllowed(env)) {
      throw new Error(`Failed to update customer attribution: ${updateErr.message}`);
    }
  }

  localAttributionsCache.set(updated.id, updated);

  await recordAttributionAuditLog(
    updated.id,
    'REJECTED',
    {
      previous_status: attribution.status,
      new_status: 'rejected',
      reason: reason.trim(),
      actor_user_id: adminUserId,
    },
    env
  );

  return updated;
}

/**
 * Admin action: Reassigns customer ownership to another active Sales Partner.
 */
export async function reassignCustomerAttribution(
  attributionId: string,
  newPartnerUserId: string,
  adminUserId: string,
  reason: string,
  env?: Record<string, any>
): Promise<CustomerAttributionRecord> {
  assertProductionSalesSafe('reassignCustomerAttribution', env);

  if (!reason || !reason.trim()) {
    throw new Error('A recorded reassignment reason is required');
  }
  const normNewPartnerUserId = (newPartnerUserId || '').trim();
  if (!normNewPartnerUserId) {
    throw new Error('Target partner user ID is required');
  }

  const attribution = await getAttributionById(attributionId, env);
  if (!attribution) {
    throw new Error('Attribution record not found');
  }

  // Verify target partner is active
  const targetPartnerProfile = await getSalesPartnerProfileByUserId(normNewPartnerUserId, env);
  if (!targetPartnerProfile || targetPartnerProfile.status !== 'active') {
    throw new Error('Target partner is not an active Sales Partner');
  }

  // Prevent self-referral on reassign
  if (attribution.referred_user_id === normNewPartnerUserId) {
    throw new Error('Cannot reassign to the referred customer themselves (self-referral prohibited)');
  }

  const prevPartnerId = attribution.partner_user_id;
  const now = new Date().toISOString();

  const updated: CustomerAttributionRecord = {
    ...attribution,
    sales_partner_id: targetPartnerProfile.id,
    partner_user_id: normNewPartnerUserId,
    status: 'approved',
    decision_reason: reason.trim(),
    decided_by_user_id: adminUserId,
    decided_at: now,
    established_at: now,
    updated_at: now,
  };

  if (isSupabaseConfigured(env)) {
    const supabase = getSupabaseServerClient(env);
    const { error: updateErr } = await supabase.from('customer_attributions').update(updated).eq('id', updated.id);
    if (updateErr && !isLocalFallbackAllowed(env)) {
      throw new Error(`Failed to reassign customer attribution: ${updateErr.message}`);
    }
  }

  localAttributionsCache.set(updated.id, updated);

  await recordAttributionAuditLog(
    updated.id,
    'REASSIGNED',
    {
      previous_status: attribution.status,
      new_status: 'approved',
      previous_partner_id: prevPartnerId,
      new_partner_id: normNewPartnerUserId,
      reason: reason.trim(),
      actor_user_id: adminUserId,
    },
    env
  );

  return updated;
}

/**
 * Revokes a referral code. Inactive or revoked codes fail closed during validation.
 */
export async function revokeSalesReferralCode(
  code: string,
  adminUserId?: string,
  reason?: string,
  env?: Record<string, any>
): Promise<SalesReferralCodeRecord> {
  assertProductionSalesSafe('revokeSalesReferralCode', env);

  const normCode = (code || '').trim().toUpperCase();
  const existing = await getReferralCodeByCode(normCode, env);
  if (!existing) {
    throw new Error('Referral code not found');
  }

  const now = new Date().toISOString();
  const updated: SalesReferralCodeRecord = {
    ...existing,
    is_active: false,
    revoked_at: now,
    updated_at: now,
  };

  if (isSupabaseConfigured(env)) {
    const supabase = getSupabaseServerClient(env);
    await supabase.from('sales_referral_codes').update(updated).eq('id', updated.id);
  }

  localReferralCodesCache.set(normCode, updated);
  return updated;
}
