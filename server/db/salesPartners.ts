import {
  getSupabaseServerClient,
  isLocalFallbackAllowed,
  isProductionEnvironment,
  assertProductionSalesSafe,
} from '../supabase.js';
import {
  SalesPartnerProfileRecord,
  SalesPartnerProfileWithUser,
  SalesPartnerStatus,
  SalesPartnerAuditLogRecord,
  SalesPartnerAdminNotesRecord,
  SalesCatalogGameItem,
  SalesCatalogGameDetail,
  SalesCatalogResponse,
  GameRecord,
} from './types.js';
import { getUserById } from './users.js';
import { getAllPlatformGames } from './games.js';
import { getPublicGamesPricing } from './gamePricing.js';
import { getSystemThemesByGameId } from './themes.js';
import crypto from 'node:crypto';

export const localSalesPartnersCache = new Map<string, SalesPartnerProfileRecord>();
export const localSalesPartnerAdminNotesCache = new Map<string, string>();
export const localSalesPartnerAuditLogsCache: SalesPartnerAuditLogRecord[] = [];
export const inFlightSalesApplications = new Set<string>();

export function clearLocalSalesPartnersCache(): void {
  localSalesPartnersCache.clear();
  localSalesPartnerAdminNotesCache.clear();
  localSalesPartnerAuditLogsCache.length = 0;
  inFlightSalesApplications.clear();
}

export function clearLocalSalesPartnerAuditLogsCache(): void {
  localSalesPartnerAuditLogsCache.length = 0;
}

/**
 * Record a sales partner governance audit log entry.
 */
export async function recordSalesPartnerAuditLog(
  params: {
    partnerUserId: string;
    salesPartnerId: string;
    previousStatus: SalesPartnerStatus | null;
    newStatus: SalesPartnerStatus;
    action: 'APPLIED' | 'ACTIVATED' | 'SUSPENDED' | 'REACTIVATED' | 'REJECTED' | 'UPDATED' | 'RATE_CHANGED';
    actorUserId?: string | null;
    reason?: string | null;
    metadata?: Record<string, any>;
  },
  env?: Record<string, any>
): Promise<SalesPartnerAuditLogRecord> {
  const auditRecord: SalesPartnerAuditLogRecord = {
    id: crypto.randomUUID(),
    partner_user_id: params.partnerUserId,
    sales_partner_id: params.salesPartnerId,
    previous_status: params.previousStatus || null,
    new_status: params.newStatus,
    action: params.action,
    actor_user_id: params.actorUserId || null,
    reason: params.reason || null,
    metadata: params.metadata || {},
    created_at: new Date().toISOString(),
  };

  assertProductionSalesSafe('recordSalesPartnerAuditLog', env);
  localSalesPartnerAuditLogsCache.push(auditRecord);

  if (isLocalFallbackAllowed(env)) {
    return auditRecord;
  }

  const supabase = getSupabaseServerClient(env);
  const { error } = await supabase.from('sales_partner_audit_logs').insert(auditRecord);
  if (error) {
    console.error('[salesPartner] Could not persist audit log to Supabase:', error.message);
    throw new Error(`Failed to record sales partner audit log: ${error.message}`);
  }

  return auditRecord;
}

/**
 * Retrieve status history and audit logs for a Sales Partner.
 */
export async function getSalesPartnerAuditLogs(
  userId: string,
  env?: Record<string, any>
): Promise<SalesPartnerAuditLogRecord[]> {
  const normUserId = (userId || '').trim();
  if (!normUserId) return [];

  if (isLocalFallbackAllowed(env)) {
    return localSalesPartnerAuditLogsCache
      .filter((l) => l.partner_user_id === normUserId)
      .slice()
      .reverse();
  }

  const supabase = getSupabaseServerClient(env);
  const { data, error } = await supabase
    .from('sales_partner_audit_logs')
    .select('*')
    .eq('partner_user_id', normUserId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[salesPartner] Could not retrieve audit logs from database:', error.message);
    throw new Error(`Failed to retrieve sales partner audit logs: ${error.message}`);
  }

  return (data || []) as SalesPartnerAuditLogRecord[];
}

/**
 * Retrieve a Sales Partner profile by user ID.
 * Server-authoritative lookup with local cache fallback for resilience.
 */
export async function getSalesPartnerProfileByUserId(
  userId: string,
  env?: Record<string, any>
): Promise<SalesPartnerProfileRecord | null> {
  const normalizedUserId = (userId || '').trim();
  if (!normalizedUserId) return null;

  if (env?.SIMULATE_SALES_PARTNER_DB_ERROR === 'true') {
    throw new Error('Database connection failed: simulated outage');
  }

  const supabase = getSupabaseServerClient(env);
  const { data, error } = await supabase
    .from('sales_partner_profiles')
    .select('*')
    .eq('user_id', normalizedUserId)
    .maybeSingle();

  if (error) {
    if (!isProductionEnvironment(env) && isLocalFallbackAllowed(env) && (error.message?.includes('Placeholder') || error.code === 'PGRST000')) {
      return localSalesPartnersCache.get(normalizedUserId) || null;
    }
    console.error('[SalesPartner] Error in getSalesPartnerProfileByUserId:', error);
    throw new Error(`Failed to get sales partner profile: ${error.message}`);
  }

  if (data) {
    const record = {
      ...(data as any),
      admin_notes: (data as any).admin_notes ?? null,
    } as SalesPartnerProfileRecord;
    localSalesPartnersCache.set(normalizedUserId, record);
    return record;
  }

  // Fallback cache if no remote data returned under fallback mode
  if (!isProductionEnvironment(env) && isLocalFallbackAllowed(env)) {
    return localSalesPartnersCache.get(normalizedUserId) || null;
  }

  return null;
}

/**
 * Retrieve a Sales Partner profile by profile ID.
 */
export async function getSalesPartnerProfileById(
  profileId: string,
  env?: Record<string, any>
): Promise<SalesPartnerProfileRecord | null> {
  const normalizedId = (profileId || '').trim();
  if (!normalizedId) return null;

  const supabase = getSupabaseServerClient(env);
  const { data, error } = await supabase
    .from('sales_partner_profiles')
    .select('*')
    .eq('id', normalizedId)
    .maybeSingle();

  if (error) {
    if (!isProductionEnvironment(env) && isLocalFallbackAllowed(env) && (error.message?.includes('Placeholder') || error.code === 'PGRST000')) {
      for (const p of localSalesPartnersCache.values()) {
        if (p.id === normalizedId) return p;
      }
      return null;
    }
    console.error('[SalesPartner] Error in getSalesPartnerProfileById:', error);
    throw new Error(`Failed to get sales partner profile: ${error.message}`);
  }

  if (data) {
    const record = {
      ...(data as any),
      admin_notes: (data as any).admin_notes ?? null,
    } as SalesPartnerProfileRecord;
    localSalesPartnersCache.set(record.user_id, record);
    return record;
  }

  if (!isProductionEnvironment(env) && isLocalFallbackAllowed(env)) {
    for (const p of localSalesPartnersCache.values()) {
      if (p.id === normalizedId) return p;
    }
  }

  return null;
}

/**
 * List all Sales Partner profiles, optionally filtered by status and search query.
 * Attaches user email, name, avatar, referral codes and metrics for administrative dashboard.
 */
export async function listSalesPartnerProfiles(
  options?: { status?: SalesPartnerStatus | 'all'; search?: string },
  env?: Record<string, any>
): Promise<SalesPartnerProfileWithUser[]> {
  const supabase = getSupabaseServerClient(env);
  let query = supabase
    .from('sales_partner_profiles')
    .select('*, users(id, email, name, avatar_url)')
    .order('created_at', { ascending: false });

  if (options?.status && options.status !== 'all') {
    query = query.eq('status', options.status);
  }

  let list: SalesPartnerProfileWithUser[] = [];
  const { data, error } = await query;

  if (error) {
    if (error.message?.includes('Placeholder') || error.code === 'PGRST000' || isLocalFallbackAllowed(env)) {
      const results: SalesPartnerProfileWithUser[] = [];
      for (const p of localSalesPartnersCache.values()) {
        if (!options?.status || options.status === 'all' || p.status === options.status) {
          const user = await getUserById(p.user_id, env);
          results.push({
            ...p,
            admin_notes: localSalesPartnerAdminNotesCache.get(p.user_id) ?? p.admin_notes ?? null,
            user: {
              id: p.user_id,
              email: user?.email || 'unknown@example.com',
              name: user?.name || 'Unknown User',
              avatar_url: user?.avatar_url || null,
            },
          });
        }
      }
      list = results;
    } else {
      console.error('[SalesPartner] Error in listSalesPartnerProfiles:', error);
      throw new Error(`Failed to list sales partner profiles: ${error.message}`);
    }
  } else if (data) {
    const userIds = (data as any[]).map((r) => r.user_id);
    const adminNotesMap = new Map<string, string>();
    if (userIds.length > 0) {
      try {
        const { data: notesData } = await supabase
          .from('sales_partner_admin_notes')
          .select('partner_user_id, admin_notes')
          .in('partner_user_id', userIds);
        if (notesData) {
          for (const item of notesData as any[]) {
            if (item.partner_user_id && item.admin_notes) {
              adminNotesMap.set(item.partner_user_id, item.admin_notes);
            }
          }
        }
      } catch (err) {
        console.warn('[SalesPartner] Could not fetch admin notes for profiles list:', err);
      }
    }

    list = (data as any[]).map((row) => ({
      id: row.id,
      user_id: row.user_id,
      status: row.status,
      applied_at: row.applied_at,
      activated_at: row.activated_at,
      suspended_at: row.suspended_at,
      agency_name: row.agency_name ?? null,
      application_notes: row.application_notes ?? null,
      admin_notes: adminNotesMap.get(row.user_id) ?? row.admin_notes ?? null,
      custom_commission_rate: row.custom_commission_rate ?? null,
      first_order_commission_rate: row.first_order_commission_rate ?? null,
      repeat_order_commission_rate: row.repeat_order_commission_rate ?? null,
      created_at: row.created_at,
      updated_at: row.updated_at,
      user: {
        id: row.users?.id || row.user_id,
        email: row.users?.email || '',
        name: row.users?.name || '',
        avatar_url: row.users?.avatar_url || null,
      },
    }));
  }

  // Search filtering if specified
  if (options?.search && options.search.trim()) {
    const q = options.search.trim().toLowerCase();
    list = list.filter((p) => {
      const name = p.user?.name?.toLowerCase() || '';
      const email = p.user?.email?.toLowerCase() || '';
      const uid = p.user_id?.toLowerCase() || '';
      const agency = p.agency_name?.toLowerCase() || '';
      const appNotes = p.application_notes?.toLowerCase() || '';
      const adminNotes = p.admin_notes?.toLowerCase() || '';
      return (
        name.includes(q) ||
        email.includes(q) ||
        uid.includes(q) ||
        agency.includes(q) ||
        appNotes.includes(q) ||
        adminNotes.includes(q)
      );
    });
  }

  return list;
}

/**
 * Retrieve private administrator notes for a Sales Partner.
 * Restricted to Developer Admin callers.
 */
export async function getSalesPartnerAdminNotes(
  userId: string,
  env?: Record<string, any>
): Promise<string | null> {
  const normUserId = (userId || '').trim();
  if (!normUserId) return null;

  if (isLocalFallbackAllowed(env)) {
    return localSalesPartnerAdminNotesCache.get(normUserId) || null;
  }

  const supabase = getSupabaseServerClient(env);
  const { data, error } = await supabase
    .from('sales_partner_admin_notes')
    .select('admin_notes')
    .eq('partner_user_id', normUserId)
    .maybeSingle();

  if (error) {
    if (!isProductionEnvironment(env) && isLocalFallbackAllowed(env) && (error.message?.includes('Placeholder') || error.code === 'PGRST000')) {
      return localSalesPartnerAdminNotesCache.get(normUserId) || null;
    }
    console.error('[SalesPartner] Error in getSalesPartnerAdminNotes:', error);
    throw new Error(`Failed to get sales partner admin notes: ${error.message}`);
  }

  return (data as any)?.admin_notes || null;
}

/**
 * Create a new Sales Partner application for a user.
 * Initializes status as 'pending' with server timestamp and logs an initial audit entry.
 * Atomically executes both profile creation and audit log insert.
 */
export async function createSalesPartnerApplication(
  userId: string,
  applicationDetails?:
    | {
        agencyName?: string;
        agency_name?: string;
        applicationNotes?: string;
        application_notes?: string;
        notes?: string;
        adminNotes?: string;
      }
    | string,
  env?: Record<string, any>
): Promise<SalesPartnerProfileRecord> {
  const normalizedUserId = (userId || '').trim();
  if (!normalizedUserId) {
    throw new Error('User ID is required to apply for Sales Partner');
  }

  // Parse structured application fields
  let resolvedAgencyName: string | null = null;
  let resolvedApplicationNotes: string | null = null;

  if (typeof applicationDetails === 'string') {
    const text = applicationDetails.trim();
    if (text.includes('Agency / Organization:')) {
      const matchAgency = text.match(/Agency \/ Organization:\s*([^|]+)/i);
      if (matchAgency && matchAgency[1]) {
        resolvedAgencyName = matchAgency[1].trim();
      }
      const matchNotes = text.match(/Applicant Notes:\s*(.*)/i);
      if (matchNotes && matchNotes[1]) {
        resolvedApplicationNotes = matchNotes[1].trim();
      } else {
        resolvedApplicationNotes = text;
      }
    } else {
      resolvedApplicationNotes = text || null;
    }
  } else if (applicationDetails && typeof applicationDetails === 'object') {
    resolvedAgencyName =
      (applicationDetails.agencyName || applicationDetails.agency_name)?.trim() || null;
    resolvedApplicationNotes =
      (
        applicationDetails.applicationNotes ||
        applicationDetails.application_notes ||
        applicationDetails.notes ||
        applicationDetails.adminNotes
      )?.trim() || null;
  }

  // Server-side length limits validation
  if (resolvedAgencyName && resolvedAgencyName.length > 150) {
    throw new Error('Agency name cannot exceed 150 characters');
  }
  if (resolvedApplicationNotes && resolvedApplicationNotes.length > 1000) {
    throw new Error('Application details cannot exceed 1,000 characters');
  }

  assertProductionSalesSafe('createSalesPartnerApplication', env);

  // 1. Authoritative database path: atomic PostgreSQL RPC executes profile creation + APPLIED audit log in a single transaction
  if (!isLocalFallbackAllowed(env)) {
    const supabase = getSupabaseServerClient(env);
    const { data: rpcData, error: rpcError } = await supabase.rpc('create_sales_partner_application_atomic', {
      p_user_id: normalizedUserId,
      p_agency_name: resolvedAgencyName || null,
      p_application_notes: resolvedApplicationNotes || null,
      p_actor_user_id: normalizedUserId,
    });

    if (rpcError) {
      if (
        rpcError.code === '23505' ||
        rpcError.message?.includes('already exists') ||
        rpcError.message?.includes('unique_sales_partner_user') ||
        rpcError.message?.includes('duplicate key')
      ) {
        throw new Error('A Sales Partner application or profile already exists for this account');
      }
      console.error('[SalesPartner] Database error in create_sales_partner_application_atomic:', rpcError);
      throw new Error(`Failed to create sales partner application: ${rpcError.message}`);
    }

    if (rpcData?.already_exists) {
      throw new Error('A Sales Partner application or profile already exists for this account');
    }

    const result = ((rpcData?.profile || rpcData) as any) as SalesPartnerProfileRecord;
    localSalesPartnersCache.set(normalizedUserId, result);
    return result;
  }

  // 2. Local test / mock sandbox execution: atomic in-memory operation
  if (inFlightSalesApplications.has(normalizedUserId)) {
    throw new Error('A Sales Partner application or profile already exists for this account');
  }
  inFlightSalesApplications.add(normalizedUserId);

  try {
    const existing = await getSalesPartnerProfileByUserId(normalizedUserId, env);
    if (existing) {
      throw new Error('A Sales Partner application or profile already exists for this account');
    }

    const now = new Date().toISOString();
    const newProfile: SalesPartnerProfileRecord = {
      id: crypto.randomUUID(),
      user_id: normalizedUserId,
      status: 'pending',
      applied_at: now,
      activated_at: null,
      suspended_at: null,
      agency_name: resolvedAgencyName || null,
      application_notes: resolvedApplicationNotes || null,
      created_at: now,
      updated_at: now,
    };

    localSalesPartnersCache.set(normalizedUserId, newProfile);

    const auditReason = resolvedAgencyName
      ? `Sales Partner application submitted (${resolvedAgencyName})`
      : 'Sales Partner application submitted';

    try {
      await recordSalesPartnerAuditLog(
        {
          partnerUserId: normalizedUserId,
          salesPartnerId: newProfile.id,
          previousStatus: null,
          newStatus: 'pending',
          action: 'APPLIED',
          actorUserId: normalizedUserId,
          reason: auditReason,
          metadata: {
            agency_name: resolvedAgencyName,
            application_notes: resolvedApplicationNotes,
          },
        },
        env
      );
    } catch (auditErr) {
      // Atomic rollback in local store
      localSalesPartnersCache.delete(normalizedUserId);
      throw auditErr;
    }

    return newProfile;
  } finally {
    inFlightSalesApplications.delete(normalizedUserId);
  }
}

/**
 * Update Sales Partner status (active, suspended, rejected, pending).
 * Strictly requires Developer Admin authority.
 * Automatically tracks activated_at and suspended_at lifecycle timestamps and records audit logs atomically.
 */
export async function updateSalesPartnerStatus(
  userId: string,
  status: SalesPartnerStatus,
  adminNotes?: string,
  actorUserId?: string,
  reason?: string,
  env?: Record<string, any>
): Promise<SalesPartnerProfileRecord> {
  const normalizedUserId = (userId || '').trim();
  if (!normalizedUserId) {
    throw new Error('User ID is required to update Sales Partner status');
  }

  const validStatuses: SalesPartnerStatus[] = ['pending', 'active', 'suspended', 'rejected'];
  if (!validStatuses.includes(status)) {
    throw new Error(`Invalid status: ${status}. Must be one of: ${validStatuses.join(', ')}`);
  }

  let effectiveActorUserId = actorUserId;
  let effectiveEnv = env;
  if (typeof actorUserId === 'object' && actorUserId !== null && !env) {
    effectiveEnv = actorUserId as Record<string, any>;
    effectiveActorUserId = undefined;
  }

  assertProductionSalesSafe('updateSalesPartnerStatus', effectiveEnv);

  const existing = await getSalesPartnerProfileByUserId(normalizedUserId, effectiveEnv);
  if (!existing) {
    throw new Error('Sales Partner profile not found');
  }

  const prevStatus = existing.status;
  const isConsequentialChange =
    status === 'suspended' ||
    status === 'rejected' ||
    ((prevStatus === 'suspended' || prevStatus === 'rejected') && status === 'active');

  const trimmedReason = reason !== undefined
    ? (typeof reason === 'string' ? reason.trim() : '')
    : (typeof adminNotes === 'string' ? adminNotes.trim() : '');

  if (isConsequentialChange && !trimmedReason) {
    throw new Error('A non-empty reason is required for consequential status changes');
  }

  const now = new Date().toISOString();
  let auditAction: 'ACTIVATED' | 'SUSPENDED' | 'REACTIVATED' | 'REJECTED' | 'UPDATED' = 'UPDATED';
  if (prevStatus === 'pending' && status === 'active') {
    auditAction = 'ACTIVATED';
  } else if ((prevStatus === 'suspended' || prevStatus === 'rejected') && status === 'active') {
    auditAction = 'REACTIVATED';
  } else if (status === 'suspended') {
    auditAction = 'SUSPENDED';
  } else if (status === 'rejected') {
    auditAction = 'REJECTED';
  }

  // 1. Authoritative database path: atomic PostgreSQL RPC is the ONLY path when connected to Supabase
  if (!isLocalFallbackAllowed(effectiveEnv)) {
    const supabase = getSupabaseServerClient(effectiveEnv);
    const { data: rpcData, error: rpcError } = await supabase.rpc('update_sales_partner_status_atomic', {
      p_user_id: normalizedUserId,
      p_status: status,
      p_admin_notes: adminNotes ?? null,
      p_actor_user_id: effectiveActorUserId ?? null,
      p_reason: trimmedReason || adminNotes || `Status updated from ${prevStatus} to ${status}`,
    });

    if (rpcError) {
      console.error('[SalesPartner] Database error in update_sales_partner_status_atomic:', rpcError.message);
      throw new Error(`Failed to update sales partner status: ${rpcError.message}`);
    }

    if (!rpcData) {
      throw new Error('Failed to update sales partner status: no record returned from atomic procedure');
    }

    const result = rpcData as SalesPartnerProfileRecord;
    if (adminNotes !== undefined) {
      localSalesPartnerAdminNotesCache.set(normalizedUserId, adminNotes);
      result.admin_notes = adminNotes;
    }
    localSalesPartnersCache.set(normalizedUserId, result);
    return result;
  }

  // 2. Local test / mock sandbox execution
  const updatePayload: Partial<SalesPartnerProfileRecord> = {
    status,
    updated_at: now,
  };

  if (adminNotes !== undefined) {
    localSalesPartnerAdminNotesCache.set(normalizedUserId, adminNotes);
    updatePayload.admin_notes = adminNotes;
  } else if (localSalesPartnerAdminNotesCache.has(normalizedUserId)) {
    updatePayload.admin_notes = localSalesPartnerAdminNotesCache.get(normalizedUserId) || null;
  }

  if (status === 'active') {
    if (!existing.activated_at) {
      updatePayload.activated_at = now;
    }
    updatePayload.suspended_at = null;
  } else if (status === 'suspended') {
    updatePayload.suspended_at = now;
  }

  const result: SalesPartnerProfileRecord = {
    ...existing,
    ...updatePayload,
  };
  localSalesPartnersCache.set(normalizedUserId, result);

  await recordSalesPartnerAuditLog(
    {
      partnerUserId: normalizedUserId,
      salesPartnerId: existing.id,
      previousStatus: prevStatus,
      newStatus: status,
      action: auditAction,
      actorUserId: effectiveActorUserId || null,
      reason: trimmedReason || adminNotes || `Status updated from ${prevStatus} to ${status}`,
      metadata: { admin_notes: adminNotes },
    },
    effectiveEnv
  );

  return result;
}

/**
 * Configure exceptional / partner-specific commission rates.
 */
export async function updateSalesPartnerRate(
  userId: string,
  rates: {
    custom_commission_rate?: number | null;
    first_order_commission_rate?: number | null;
    repeat_order_commission_rate?: number | null;
  },
  actorUserId?: string,
  reason?: string,
  env?: Record<string, any>
): Promise<SalesPartnerProfileRecord> {
  const normalizedUserId = (userId || '').trim();
  if (!normalizedUserId) {
    throw new Error('User ID is required to update Sales Partner rates');
  }

  const trimmedReason = typeof reason === 'string' ? reason.trim() : '';
  if (!trimmedReason) {
    throw new Error('A non-empty reason is required to update commission rates');
  }

  // Validate rates independently: null or finite number 0.00 to 0.50 (max 50%)
  const validateRate = (val: any, name: string) => {
    if (val === undefined || val === null) return;
    if (typeof val !== 'number' || !Number.isFinite(val) || val < 0 || val > 0.50) {
      throw new Error(`${name} must be null or a finite number between 0.00 and 0.50 (maximum 50%)`);
    }
  };

  validateRate(rates.custom_commission_rate, 'Custom commission rate');
  validateRate(rates.first_order_commission_rate, 'First order commission rate');
  validateRate(rates.repeat_order_commission_rate, 'Repeat order commission rate');

  if (
    rates.custom_commission_rate === undefined &&
    rates.first_order_commission_rate === undefined &&
    rates.repeat_order_commission_rate === undefined
  ) {
    throw new Error('At least one commission rate field must be provided');
  }

  assertProductionSalesSafe('updateSalesPartnerRate', env);

  const existing = await getSalesPartnerProfileByUserId(normalizedUserId, env);
  if (!existing) {
    throw new Error('Sales Partner profile not found');
  }

  const now = new Date().toISOString();

  // 1. Authoritative database path: atomic PostgreSQL RPC is the ONLY path when connected to Supabase
  if (!isLocalFallbackAllowed(env)) {
    const supabase = getSupabaseServerClient(env);
    const { data: rpcData, error: rpcError } = await supabase.rpc('update_sales_partner_rates_atomic', {
      p_user_id: normalizedUserId,
      p_custom_rate: rates.custom_commission_rate ?? null,
      p_first_order_rate: rates.first_order_commission_rate ?? null,
      p_repeat_order_rate: rates.repeat_order_commission_rate ?? null,
      p_actor_user_id: actorUserId ?? null,
      p_reason: trimmedReason,
    });

    if (rpcError) {
      console.error('[SalesPartner] Database error in update_sales_partner_rates_atomic:', rpcError.message);
      throw new Error(`Failed to update sales partner rates: ${rpcError.message}`);
    }

    if (!rpcData) {
      throw new Error('Failed to update sales partner rates: no record returned from atomic procedure');
    }

    const result = rpcData as SalesPartnerProfileRecord;
    localSalesPartnersCache.set(normalizedUserId, result);
    return result;
  }

  // 2. Local test / mock sandbox execution
  const updatePayload: Partial<SalesPartnerProfileRecord> = {
    updated_at: now,
  };
  if (rates.custom_commission_rate !== undefined) {
    updatePayload.custom_commission_rate = rates.custom_commission_rate;
  }
  if (rates.first_order_commission_rate !== undefined) {
    updatePayload.first_order_commission_rate = rates.first_order_commission_rate;
  }
  if (rates.repeat_order_commission_rate !== undefined) {
    updatePayload.repeat_order_commission_rate = rates.repeat_order_commission_rate;
  }

  const result: SalesPartnerProfileRecord = {
    ...existing,
    ...updatePayload,
  };
  localSalesPartnersCache.set(normalizedUserId, result);

  await recordSalesPartnerAuditLog(
    {
      partnerUserId: normalizedUserId,
      salesPartnerId: existing.id,
      previousStatus: existing.status,
      newStatus: existing.status,
      action: 'RATE_CHANGED',
      actorUserId: actorUserId || null,
      reason: trimmedReason,
      metadata: {
        previous_rates: {
          custom_commission_rate: existing.custom_commission_rate ?? null,
          first_order_commission_rate: existing.first_order_commission_rate ?? null,
          repeat_order_commission_rate: existing.repeat_order_commission_rate ?? null,
        },
        new_rates: rates,
      },
    },
    env
  );

  return result;
}

// ====================================================
// SALES PARTNER GAME CATALOGUE (PHASE 3)
// ====================================================

/**
 * Approved game engines verified for customer sales demonstration.
 * Non-functioning sandboxes, internal debug tools, and unreleased engines are excluded.
 */
export const SALES_APPROVED_GAME_TYPES = ['catch-brand', 'memory-match', 'reaction-tap', 'match-3'] as const;

/**
 * Canonical metadata specifications for sales demonstration.
 * Reuses existing production game specs without inventing capabilities.
 */
export const SALES_GAME_METADATA: Record<string, {
  category: string;
  default_duration: string;
  orientations: string[];
  input_types: string[];
  cover_image: string;
  customization_options: Array<{ title: string; description: string }>;
  suitable_event_types: Array<{ name: string; why: string }>;
  how_it_works: Array<{ step: string; title: string; desc: string }>;
}> = {
  'catch-brand': {
    category: 'Arcade Catcher',
    default_duration: '20 seconds (Customizable 10s-120s)',
    orientations: ['Portrait 9:16 (Smartphones & Kiosks)', 'Landscape 16:9 (Tablets & Desktops)'],
    input_types: ['Touch / Drag', 'Keyboard Arrow Keys', 'Mouse Movement'],
    cover_image: '/assets/games/catch-brand/themes/default/background.png',
    customization_options: [
      { title: 'Catcher Avatar & Basket', description: 'Upload custom brand mascot, shopping basket, vehicle, or catcher icon.' },
      { title: 'Collectible Falling Items', description: 'Replace generic objects with up to 3 distinct branded products or logos.' },
      { title: 'Hazard & Obstacle Graphics', description: 'Design custom negative items (e.g. competitor icons or obstacle blocks).' },
      { title: 'Golden Bonus Multipliers', description: 'Highlight flagship product or campaign voucher as the high-value bonus.' },
      { title: 'Background Illustration', description: 'Custom backdrop artwork matching corporate brand guidelines.' },
      { title: 'Audio & Sound Effects', description: 'Upload custom audio chimes for successful catches, hazards, and buzzer countdowns.' },
    ],
    suitable_event_types: [
      { name: 'Shopping Mall Roadshows', why: 'Instant pickup-and-play format attracts shoppers of all age brackets.' },
      { name: 'Exhibition & Trade Booths', why: 'Short 20-second rounds prevent booth queue bottlenecks while driving competitive visitor engagement.' },
      { name: 'Corporate Annual Dinners', why: 'Table-by-table competitions build tremendous cheering and excitement.' },
      { name: 'Product Launches', why: 'Places newly launched packaging directly into the hands and minds of prospective buyers.' },
    ],
    how_it_works: [
      { step: '01', title: 'Start Countdown', desc: 'Player taps Play on mobile screen or kiosk station. A 3-second ready countdown begins.' },
      { step: '02', title: 'Catch Positive Items (+10)', desc: 'Branded products fall at accelerating speeds. Catching positive items scores 10 points.' },
      { step: '03', title: 'Dodge Hazards (-10)', desc: 'Hazardous objects trigger a 10-point penalty and screen shake, requiring sharp reflex evasion.' },
      { step: '04', title: 'Grab Golden Multipliers (+50)', desc: 'Rare golden bonus tokens provide huge scoring surges to propel players up the leaderboard.' },
    ],
  },
  'memory-match': {
    category: 'Memory & Puzzle',
    default_duration: '45 seconds (Customizable 20s-120s)',
    orientations: ['Portrait 9:16', 'Landscape 16:9'],
    input_types: ['Touch / Tap', 'Mouse Click'],
    cover_image: '/assets/games/memory-match/themes/default/background.png',
    customization_options: [
      { title: 'Branded Card Back Cover', description: 'Full custom artwork displayed on all face-down cards across the board.' },
      { title: '8 Custom Card Pairs', description: 'Showcase up to 8 distinct products, corporate values, or campaign logos.' },
      { title: 'Grid Layout & Timing', description: 'Configurable board size (2x4, 4x4) and card flip delay settings.' },
      { title: 'Background Artwork', description: 'Custom background illustration matching stage and booth design.' },
      { title: 'Card Flip & Match Audio', description: 'Custom audio effects for card flips, successful pair matches, and mismatch chimes.' },
    ],
    suitable_event_types: [
      { name: 'Product Showcases & Retail Activations', why: 'Exposes attendees to up to 8 distinct product faces with high cognitive recall.' },
      { name: 'Corporate Town Halls & Summits', why: 'Features company trivia and corporate core values on card pairs.' },
      { name: 'Brand Pop-Up Stores', why: 'Deep visual impression through repetitive matching gameplay.' },
      { name: 'Conferences & Seminars', why: 'Provides an engaging mental break during exhibition breaks.' },
    ],
    how_it_works: [
      { step: '01', title: 'Grid Presentation', desc: '16 face-down cards appear on screen with your custom branded card back artwork.' },
      { step: '02', title: 'Flip & Match (+100)', desc: 'Player taps two cards. Matching pairs stay face up and award 100 base match points.' },
      { step: '03', title: 'Fast Streak Combos', desc: 'Consecutive successful matches trigger combo multipliers for rapid point surges.' },
      { step: '04', title: 'Beat the Countdown', desc: 'Clear the board before time runs out to record final score on the event leaderboard.' },
    ],
  },
  'reaction-tap': {
    category: 'Precision Reflex',
    default_duration: '15 seconds',
    orientations: ['Portrait 9:16', 'Landscape 16:9'],
    input_types: ['Touch / Tap', 'Mouse Click', 'Keyboard Spacebar'],
    cover_image: '/assets/games/reaction-tap/themes/default/background.png',
    customization_options: [
      { title: 'Starting Gantry Header', description: 'Display corporate sponsor logo across the starting light rig header.' },
      { title: 'Custom Tap Button Icon', description: 'Upload brand crest, steering wheel, or buzzer icon for the interactive tap zone.' },
      { title: 'Round Configuration', description: 'Set competition round count (3 or 5 rounds) and false-start penalty rules.' },
      { title: 'Background Artwork', description: 'Race track, pit lane, or cyber grid backdrop matching activation atmosphere.' },
      { title: 'Engine & Gantry Audio', description: 'High-octane sound effects for revving engines, sequence beeps, and reaction stamps.' },
    ],
    suitable_event_types: [
      { name: 'Automotive & Motorsport Events', why: 'F1 starting gantry reflex sequence delivers perfect thematic alignment.' },
      { name: 'Sports & Esports Tournaments', why: 'High-adrenaline millisecond speed test creates intense crowd excitement.' },
      { name: 'Tech Exhibitions & Career Fairs', why: 'Lightning-fast 10-second throughput prevents line hold-ups.' },
      { name: 'Mall Roadshows & Brand Activations', why: 'Fierce peer competition with spectators cheering for fastest reaction times.' },
    ],
    how_it_works: [
      { step: '01', title: 'Light Sequence', desc: '5 red starting lights illuminate in sequence with authentic engine rumble.' },
      { step: '02', title: 'Random Hold', desc: 'A random suspense delay (1.0s to 3.5s) builds intense anticipation.' },
      { step: '03', title: 'Lights Out Reaction', desc: 'The moment all red lights extinguish, tap the trigger button as fast as possible.' },
      { step: '04', title: 'Millisecond Precision', desc: 'Reaction time is measured down to the millisecond across competition rounds.' },
    ],
  },
  'match-3': {
    category: 'Match-3 Puzzle Challenge',
    default_duration: '60 seconds',
    orientations: ['Portrait 9:16', 'Landscape 16:9'],
    input_types: ['Touch / Drag', 'Mouse Click & Drag'],
    cover_image: '/assets/games/match-3/themes/default/background.png',
    customization_options: [
      { title: 'Branded Tile Graphics', description: 'Upload 5 to 7 unique custom product icons, campaign mascots, or brand emblems.' },
      { title: 'Special Power-Up Tiles', description: 'Custom graphics for 4-in-a-row Rockets and 5-in-a-row Color Bombs.' },
      { title: 'Board Dimensions & Rules', description: 'Configurable grid size (7x7, 8x8) and cascade multiplier parameters.' },
      { title: 'Background Artwork', description: 'Immersive themed backdrop matching promotional campaign art.' },
      { title: 'Combo & Cascade Audio', description: 'Crisp audio effects for tile swaps, special tile explosions, and combo cheers.' },
    ],
    suitable_event_types: [
      { name: 'Retail & FMCG Brand Activations', why: 'Match products and trigger explosive combos with actual product packaging.' },
      { name: 'Mall Roadshows & Family Days', why: 'Universal casual puzzle appeal engages participants across all demographic groups.' },
      { name: 'Conferences & Exhibitions', why: 'Drives deep booth dwell time and repeat play attempts to achieve high scores.' },
      { name: 'Loyalty Campaign Kickoffs', why: 'Gamify promotional product lines with branded cascading rewards.' },
    ],
    how_it_works: [
      { step: '01', title: 'Board Layout', desc: 'Grid of colorful custom branded tiles fills the playing board.' },
      { step: '02', title: 'Swap Adjacent Tiles', desc: 'Swap two neighboring tiles horizontally or vertically to create 3-in-a-row matches.' },
      { step: '03', title: 'Special Power-Up Tiles', desc: 'Match 4 in a line to create a Rocket; match 5 to create a Color Bomb.' },
      { step: '04', title: 'Cascading Combos', desc: 'Cleared tiles drop new items from above, chaining multipliers for huge scores.' },
    ],
  },
};

/**
 * Verifies whether a game record is approved for sales demonstration.
 * Strictly excludes:
 * - Unpublished/draft/archived games
 * - Tenant organization custom cloned games
 * - Unreleased game engines without runtime components
 * - Developer-only test tools or sandboxes
 */
export function isGamePermittedForSalesDemo(game: GameRecord | any): boolean {
  if (!game) return false;

  // 1. Must be active/published
  if (game.status !== 'active') return false;

  // 2. Must be a platform/system game
  if (game.is_system === false && game.organization_id) return false;

  // 3. Must be an approved game engine type
  const gameType = (game.game_type || game.slug || '').trim().toLowerCase();
  const isApprovedType = (SALES_APPROVED_GAME_TYPES as readonly string[]).includes(gameType);
  if (!isApprovedType) return false;

  // 4. Must not be a developer-only sandbox or test tool
  if (game.is_developer_only === true) return false;

  const slug = (game.slug || '').toLowerCase();
  const name = (game.name || '').toLowerCase();
  if (
    slug.startsWith('test-') ||
    slug.startsWith('sandbox-') ||
    slug.startsWith('dev-') ||
    name.includes('sandbox') ||
    name.includes('internal test') ||
    name.includes('debug')
  ) {
    return false;
  }

  return true;
}

/**
 * Retrieves the authoritative Sales Partner Game Catalogue.
 * Includes dynamic country pricing and honest Contact Us fallback.
 */
export async function getSalesPartnerGameCatalog(
  requestedCountry?: string,
  env?: Record<string, any>
): Promise<SalesCatalogResponse> {
  const [platformGames, pricingData] = await Promise.all([
    getAllPlatformGames(env),
    getPublicGamesPricing(requestedCountry, env),
  ]);

  // 1. Filter only published, approved, non-sandbox games
  const eligibleGames = platformGames.filter((g) => isGamePermittedForSalesDemo(g));

  // 2. Sort by canonical catalogue sequence
  const canonicalOrder = ['catch-brand', 'memory-match', 'reaction-tap', 'match-3'];
  eligibleGames.sort((a, b) => {
    const aType = a.game_type || a.slug;
    const bType = b.game_type || b.slug;
    const aIdx = canonicalOrder.indexOf(aType);
    const bIdx = canonicalOrder.indexOf(bType);
    if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
    if (aIdx !== -1) return -1;
    if (bIdx !== -1) return 1;
    return a.name.localeCompare(b.name);
  });

  // 3. Transform to SalesCatalogGameItem with real metadata and authoritative pricing
  const items: SalesCatalogGameItem[] = eligibleGames.map((game) => {
    const gameType = game.game_type || game.slug;
    const meta = SALES_GAME_METADATA[gameType] || {
      category: 'Interactive Mini-Game',
      default_duration: '30 seconds',
      orientations: ['Portrait 9:16', 'Landscape 16:9'],
      input_types: ['Touch', 'Mouse'],
      cover_image: game.background_url || '/assets/games/catch-brand/themes/default/background.png',
      customization_options: [],
      suitable_event_types: [],
      how_it_works: [],
    };

    // Match pricing for this game
    const gamePricing = (pricingData.games || []).find(
      (p) => p.id === game.id || p.game_type === gameType || p.slug === game.slug
    );

    const tiers = (gamePricing?.tiers || []).sort((a, b) => a.min_days - b.min_days);
    const baseTier = tiers.find((t) => t.is_base) || (tiers.length > 0 ? tiers[0] : null);

    const hasPricing = Boolean(baseTier && baseTier.price > 0);
    const requiresQuote = !hasPricing;

    return {
      id: game.id,
      slug: game.slug,
      game_type: gameType,
      name: game.name,
      description: game.description || meta.category,
      category: meta.category,
      icon_name: game.icon_name || 'Gamepad2',
      cover_image: game.background_url || meta.cover_image,
      status: 'active',
      supports_preview: true,
      default_duration: meta.default_duration,
      orientations: meta.orientations,
      input_types: meta.input_types,
      customization_options: meta.customization_options,
      suitable_event_types: meta.suitable_event_types,
      how_it_works: meta.how_it_works,
      pricing: {
        has_pricing: hasPricing,
        requires_quote: requiresQuote,
        base_price: hasPricing ? Number(baseTier!.price) : null,
        currency: hasPricing ? (baseTier!.currency || pricingData.currency) : null,
        country_code: pricingData.pricingCountry,
        is_fallback: pricingData.isFallback,
        tiers: tiers.map((t) => ({
          id: t.id,
          min_days: t.min_days,
          max_days: t.max_days ?? null,
          price: Number(t.price),
          currency: t.currency || pricingData.currency,
          is_base: Boolean(t.is_base),
        })),
      },
    };
  });

  return {
    success: true,
    requested_country: pricingData.requestedCountry,
    pricing_country: pricingData.pricingCountry,
    currency: pricingData.currency,
    games: items,
  };
}

/**
 * Retrieves detailed sales information for a single game.
 * Returns null if the game is not found, unpublished, or not permitted for sales demo.
 */
export async function getSalesPartnerGameDetail(
  gameIdOrTypeOrSlug: string,
  requestedCountry?: string,
  env?: Record<string, any>
): Promise<SalesCatalogGameDetail | null> {
  const normalized = (gameIdOrTypeOrSlug || '').trim().toLowerCase();
  if (!normalized) return null;

  const catalog = await getSalesPartnerGameCatalog(requestedCountry, env);
  const found = catalog.games.find(
    (g) =>
      g.id.toLowerCase() === normalized ||
      g.slug.toLowerCase() === normalized ||
      g.game_type.toLowerCase() === normalized
  );

  if (!found) return null;

  // Retrieve active system themes for demonstration
  let systemThemes: any[] = [];
  try {
    const rawThemes = await getSystemThemesByGameId(found.id, { status: 'active' }, env);
    systemThemes = (rawThemes || []).map((t: any) => ({
      id: t.id,
      name: t.name,
      thumbnail_url: t.thumbnail_url || null,
      background_url: t.background_url || null,
      is_default: Boolean(t.is_default || t.is_system),
    }));
  } catch (_e) {
    systemThemes = [];
  }

  return {
    ...found,
    system_themes: systemThemes,
  };
}
