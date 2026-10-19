import {
  getSupabaseServerClient,
  isSupabaseConfigured,
  isLocalFallbackAllowed,
  assertProductionSafe,
  isProductionEnvironment,
} from '../supabase.js';
import {
  SalesCommissionRecord,
  SalesCommissionWithDetails,
  SalesCommissionStatus,
  SalesCommissionOrderType,
  SalesOpportunityRecord,
  SalesOpportunityWithDetails,
  SalesOpportunityStatus,
  SalesPayoutBatchRecord,
  SalesCommissionAuditLogRecord,
  PlatformSalesCommissionSettings,
  PartnerCommissionSummary,
} from './types.js';
import { getSalesPartnerProfileByUserId, getSalesPartnerProfileById } from './salesPartners.js';
import { getApprovedAttributionForOrg, getAttributionById } from './salesAttribution.js';
import { getEventById } from './events.js';
import { getOrganizationById } from './organizations.js';
import crypto from 'node:crypto';

// In-memory local fallback stores (Strictly isolated for local dev / tests; NEVER to silently mask production DB failures)
export const localCommissionsCache = new Map<string, SalesCommissionRecord>();
export const localOpportunitiesCache = new Map<string, SalesOpportunityRecord>();
export const localPayoutBatchesCache = new Map<string, SalesPayoutBatchRecord>();
export const localCommissionAuditLogsCache: SalesCommissionAuditLogRecord[] = [];

// Configurable platform commission settings
// SAFER DEFAULT: Commission becomes payable only after event completion and review requirements are satisfied
export const DEFAULT_COMMISSION_SETTINGS: PlatformSalesCommissionSettings = {
  first_order_commission_rate: 0.10, // 10%
  repeat_order_commission_rate: 0.05, // 5%
  repeat_window_months: 12, // 12 calendar months
  require_delivery_completion: true, // Safer policy: event must be completed before commission is payable
  minimum_payout_amount: 100.00, // RM100.00 minimum payout threshold
  updated_at: new Date().toISOString(),
};

let localCommissionSettingsCache: PlatformSalesCommissionSettings = { ...DEFAULT_COMMISSION_SETTINGS };

// Async mutex map to serialize evaluations per organization to prevent concurrency race conditions
const orgEvaluationLocks = new Map<string, Promise<void>>();

async function withOrgLock<T>(orgId: string, fn: () => Promise<T>): Promise<T> {
  while (orgEvaluationLocks.has(orgId)) {
    try {
      await orgEvaluationLocks.get(orgId);
    } catch {
      // ignore
    }
  }

  let resolveLock!: () => void;
  const lockPromise = new Promise<void>((res) => {
    resolveLock = res;
  });
  orgEvaluationLocks.set(orgId, lockPromise);

  try {
    return await fn();
  } finally {
    orgEvaluationLocks.delete(orgId);
    resolveLock();
  }
}

export function clearLocalCommissionsCache(): void {
  localCommissionsCache.clear();
  localOpportunitiesCache.clear();
  localPayoutBatchesCache.clear();
  localCommissionAuditLogsCache.length = 0;
  localCommissionSettingsCache = { ...DEFAULT_COMMISSION_SETTINGS };
  orgEvaluationLocks.clear();
}

export function clearLocalOpportunitiesCache(): void {
  localOpportunitiesCache.clear();
}

export function clearLocalPayoutBatchesCache(): void {
  localPayoutBatchesCache.clear();
}

export function clearLocalCommissionAuditLogsCache(): void {
  localCommissionAuditLogsCache.length = 0;
}

/**
 * Retrieve current platform sales commission settings.
 */
export async function getSalesCommissionSettings(
  env?: Record<string, any>
): Promise<PlatformSalesCommissionSettings> {
  if (isSupabaseConfigured(env)) {
    try {
      const supabase = getSupabaseServerClient(env);
      const { data, error } = await supabase
        .from('platform_settings')
        .select('value')
        .eq('key', 'sales_commission_settings')
        .maybeSingle();

      if (!error && data?.value) {
        return {
          ...DEFAULT_COMMISSION_SETTINGS,
          ...data.value,
        };
      }
    } catch (err: any) {
      if (isProductionEnvironment(env)) {
        console.error('[salesCommissions] Failed to load commission settings from Supabase in production:', err.message);
      }
    }
  }

  return { ...localCommissionSettingsCache };
}

/**
 * Update platform sales commission settings.
 */
export async function updateSalesCommissionSettings(
  settings: Partial<PlatformSalesCommissionSettings>,
  actorUserId?: string,
  env?: Record<string, any>
): Promise<PlatformSalesCommissionSettings> {
  assertProductionSafe('updateSalesCommissionSettings', env);

  const current = await getSalesCommissionSettings(env);
  const updated: PlatformSalesCommissionSettings = {
    ...current,
    ...settings,
    updated_at: new Date().toISOString(),
  };

  // Safe range clamps
  if (typeof updated.first_order_commission_rate === 'number') {
    updated.first_order_commission_rate = Math.max(0, Math.min(1, updated.first_order_commission_rate));
  }
  if (typeof updated.repeat_order_commission_rate === 'number') {
    updated.repeat_order_commission_rate = Math.max(0, Math.min(1, updated.repeat_order_commission_rate));
  }
  if (typeof updated.repeat_window_months === 'number') {
    updated.repeat_window_months = Math.max(1, Math.min(60, Math.round(updated.repeat_window_months)));
  }

  if (isSupabaseConfigured(env)) {
    const supabase = getSupabaseServerClient(env);
    const { error } = await supabase
      .from('platform_settings')
      .upsert({
        key: 'sales_commission_settings',
        value: updated,
        updated_at: updated.updated_at,
        updated_by: actorUserId || null,
      }, { onConflict: 'key' });

    if (error) {
      if (isProductionEnvironment(env)) {
        throw new Error(`Failed to persist commission settings in production: ${error.message}`);
      }
      console.warn('[salesCommissions] Could not persist commission settings to Supabase:', error.message);
    }
  } else if (!isLocalFallbackAllowed(env)) {
    throw new Error('Database is required to update platform commission settings');
  }

  localCommissionSettingsCache = updated;
  return updated;
}

/**
 * Helper to record audit log entry for commission lifecycle events.
 */
export async function recordCommissionAuditLog(
  commissionId: string,
  action: 'CREATED' | 'APPROVED' | 'VOIDED' | 'CLAWBACK' | 'BATCHED' | 'PAID' | 'ADJUSTED',
  params: {
    previous_status?: string | null;
    new_status: string;
    previous_amount?: number | null;
    new_amount?: number | null;
    actor_user_id?: string | null;
    reason?: string | null;
    metadata?: Record<string, any>;
  },
  env?: Record<string, any>
): Promise<SalesCommissionAuditLogRecord> {
  const auditRecord: SalesCommissionAuditLogRecord = {
    id: crypto.randomUUID(),
    commission_id: commissionId,
    action,
    previous_status: params.previous_status || null,
    new_status: params.new_status,
    previous_amount: params.previous_amount ?? null,
    new_amount: params.new_amount ?? null,
    actor_user_id: params.actor_user_id || null,
    reason: params.reason || null,
    metadata: params.metadata || {},
    created_at: new Date().toISOString(),
  };

  if (isSupabaseConfigured(env)) {
    try {
      const supabase = getSupabaseServerClient(env);
      const { error } = await supabase.from('sales_commission_audit_logs').insert(auditRecord);
      if (error && isProductionEnvironment(env)) {
        console.error('[salesCommissions] Failed to persist commission audit log in production:', error.message);
      }
    } catch (err: any) {
      if (isProductionEnvironment(env)) {
        console.error('[salesCommissions] Error inserting audit log:', err.message);
      }
    }
  }

  localCommissionAuditLogsCache.push(auditRecord);
  return auditRecord;
}

/**
 * Retrieve audit logs for a specific commission.
 */
export async function getCommissionAuditLogs(
  commissionId: string,
  env?: Record<string, any>
): Promise<SalesCommissionAuditLogRecord[]> {
  const normId = (commissionId || '').trim();
  if (!normId) return [];

  if (isSupabaseConfigured(env)) {
    try {
      const supabase = getSupabaseServerClient(env);
      const { data, error } = await supabase
        .from('sales_commission_audit_logs')
        .select('*')
        .eq('commission_id', normId)
        .order('created_at', { ascending: true });

      if (!error && data) {
        return data as SalesCommissionAuditLogRecord[];
      }
    } catch {
      // fallback
    }
  }

  return localCommissionAuditLogsCache
    .filter((a) => a.commission_id === normId)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

/**
 * Evaluates an event order and records commission in the immutable ledger.
 *
 * Rules:
 * 1. Event must have payment_status === 'PAID'.
 * 2. Event must belong to an organization with an approved, non-self-referral attribution.
 * 3. Partner must have active status.
 * 4. Commission is calculated SOLELY on actual cash collected (paid_amount), excluding promo credits.
 * 5. If paid_amount <= 0 (e.g. 100% promotional credits), NO commission is awarded.
 * 6. First qualifying order: 10% commission. Starts the 12-month window.
 * 7. Repeat orders within 12 months: 5% commission.
 * 8. Repeat orders after 12 months: Require pre-approved sales opportunity BEFORE order placement.
 * 9. Idempotency: Never award commission more than once per event_id.
 * 10. Concurrency: Two concurrent orders cannot both receive the first-order rate.
 * 11. Production Safety: No silent in-memory fallback if production database fails.
 */
export async function evaluateAndRecordEventCommission(
  eventId: string,
  env?: Record<string, any>
): Promise<{
  eligible: boolean;
  commission: SalesCommissionRecord | null;
  reason?: string;
}> {
  const normEventId = (eventId || '').trim();
  if (!normEventId) {
    return { eligible: false, commission: null, reason: 'Event ID is required' };
  }

  // 1. Fetch Event
  const event = await getEventById(normEventId, env);
  if (!event) {
    return { eligible: false, commission: null, reason: 'Event not found' };
  }

  const orgId = event.organization_id;
  if (!orgId) {
    return { eligible: false, commission: null, reason: 'Event is not linked to an organization' };
  }

  // Use org lock to serialize evaluation and prevent concurrent first-order race conditions
  return await withOrgLock(orgId, async () => {
    // 2. Check if commission already recorded for this event (Idempotency)
    const existingCommission = await getCommissionByEventId(normEventId, env);
    if (existingCommission) {
      return {
        eligible: true,
        commission: existingCommission,
        reason: 'Commission already recorded for this event (idempotent)',
      };
    }

    // 3. Financial Eligibility Checks
    // Unpaid events never earn commission
    if (event.payment_status !== 'PAID') {
      return {
        eligible: false,
        commission: null,
        reason: `Event payment status is '${event.payment_status}', not 'PAID'`,
      };
    }

    // Cancelled or refunded events never earn commission
    if (
      (event.status || '').toLowerCase() === 'cancelled' ||
      (event.event_status || '').toUpperCase() === 'CANCELLED' ||
      (event.payment_status as string) === 'REFUNDED'
    ) {
      return {
        eligible: false,
        commission: null,
        reason: 'Event is cancelled or refunded',
      };
    }

    // Check actual cash collected
    const cashCollected = Number(event.paid_amount || 0);
    const promoDiscount = Number(event.discount_amount || 0);
    const eventPrice = Number(event.event_price || cashCollected + promoDiscount);

    if (cashCollected <= 0) {
      return {
        eligible: false,
        commission: null,
        reason: 'No cash collected (order was funded solely by promotional credits or free)',
      };
    }

    // 4. Verify Customer Attribution for Organization
    const attribution = await getApprovedAttributionForOrg(orgId, env);
    if (!attribution) {
      return {
        eligible: false,
        commission: null,
        reason: 'Organization does not have an approved Sales Partner attribution',
      };
    }

    if (attribution.is_self_referral) {
      return {
        eligible: false,
        commission: null,
        reason: 'Attribution is marked as self-referral (partner cannot earn commission on self)',
      };
    }

    // 5. Verify Sales Partner Profile Status
    const partnerProfile = await getSalesPartnerProfileById(attribution.sales_partner_id, env);
    if (!partnerProfile || partnerProfile.status !== 'active') {
      return {
        eligible: false,
        commission: null,
        reason: `Sales Partner profile status is '${partnerProfile?.status || 'not_found'}', must be 'active'`,
      };
    }

    // 6. Determine Authoritative Order Placement & Payment Timestamp
    // Do not assume events.created_at is order placement date; inspect actual wallet transaction if present
    const now = new Date();
    let orderPlacementDate = event.created_at ? new Date(event.created_at) : now;
    let paymentDate = now;

    try {
      const { getLedgerTransactions } = await import('./wallet.js');
      const txns = await getLedgerTransactions(orgId, env);
      const paymentTxn = txns
        .filter((t) => t.event_id === normEventId && (
          t.transaction_type === 'EVENT_PAYMENT' ||
          (t.transaction_type as string) === 'PAYMENT' ||
          t.balance_type === 'PAID_BALANCE' ||
          (t.balance_type as string) === 'PAID'
        ))
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())[0];
      if (paymentTxn?.created_at) {
        orderPlacementDate = new Date(paymentTxn.created_at);
        paymentDate = new Date(paymentTxn.created_at);
      }
    } catch {
      // fallback
    }

    // 7. Determine Order Type and Commission Rate
    const settings = await getSalesCommissionSettings(env);
    const orgCommissions = await getCommissionsForOrganization(orgId, env);
    const validPriorCommissions = orgCommissions.filter(
      (c) => c.status !== 'voided' && c.event_id !== normEventId
    );

    let orderType: SalesCommissionOrderType = 'first_order';
    let commissionRate = settings.first_order_commission_rate; // 0.10
    let matchedOpportunityId: string | null = null;
    const eligibilityDateIso = now.toISOString();

    if (validPriorCommissions.length === 0) {
      // First qualifying event order
      orderType = 'first_order';
      commissionRate = settings.first_order_commission_rate;
    } else {
      // Has prior qualifying commissions. Find the first qualifying order's eligibility date.
      validPriorCommissions.sort(
        (a, b) => new Date(a.eligibility_date).getTime() - new Date(b.eligibility_date).getTime()
      );
      const firstQualifying = validPriorCommissions[0];
      const firstEligibilityDate = new Date(firstQualifying.eligibility_date);

      // Calculate window end date: firstEligibilityDate + repeat_window_months
      const windowEnd = new Date(firstEligibilityDate);
      windowEnd.setMonth(windowEnd.getMonth() + settings.repeat_window_months);

      if (orderPlacementDate.getTime() <= windowEnd.getTime()) {
        // Within the 12-month window
        orderType = 'repeat_order';
        commissionRate = settings.repeat_order_commission_rate; // 0.05
      } else {
        // 12-month window has expired!
        // Rule: Opportunity must be reviewed and approved by an authorized Admin BEFORE order was placed.
        const validOpportunity = await findApprovedOpportunityForOrder(
          attribution.sales_partner_id,
          orgId,
          orderPlacementDate,
          env
        );

        if (!validOpportunity) {
          return {
            eligible: false,
            commission: null,
            reason: 'Repeat order window has expired (>12 months from first qualifying order) and no admin pre-approved sales opportunity exists prior to order placement',
          };
        }

        orderType = 'approved_opportunity';
        commissionRate = settings.repeat_order_commission_rate; // 0.05
        matchedOpportunityId = validOpportunity.id;
      }
    }

    // 7.5 Check if Sales Partner has exceptional custom commission rate override
    if (partnerProfile) {
      if (orderType === 'first_order' && typeof partnerProfile.first_order_commission_rate === 'number') {
        commissionRate = partnerProfile.first_order_commission_rate;
      } else if (orderType !== 'first_order' && typeof partnerProfile.repeat_order_commission_rate === 'number') {
        commissionRate = partnerProfile.repeat_order_commission_rate;
      } else if (typeof partnerProfile.custom_commission_rate === 'number') {
        commissionRate = partnerProfile.custom_commission_rate;
      }
    }

    // 8. Calculate Commission Amount strictly on Cash Collected
    const commissionAmount = Number((cashCollected * commissionRate).toFixed(2));

    // 9. Create Commission Record with Original Calculation Preservation
    const newCommission: SalesCommissionRecord = {
      id: crypto.randomUUID(),
      sales_partner_id: attribution.sales_partner_id,
      partner_user_id: attribution.partner_user_id,
      customer_attribution_id: attribution.id,
      organization_id: orgId,
      event_id: normEventId,
      opportunity_id: matchedOpportunityId,
      order_type: orderType,
      event_price: eventPrice,
      promo_discount_amount: promoDiscount,
      cash_collected_amount: cashCollected,
      commission_rate: commissionRate,
      commission_amount: commissionAmount,
      original_commission_rate: commissionRate,
      original_commission_amount: commissionAmount,
      calculation_version: 1,
      adjustment_amount: 0.00,
      adjustment_reason: null,
      currency: event.event_currency || 'MYR',
      status: 'pending_review',
      eligibility_date: eligibilityDateIso,
      order_placement_date: orderPlacementDate.toISOString(),
      payment_date: paymentDate.toISOString(),
      event_start_date: event.start_date || event.event_date || null,
      event_end_date: event.end_date || event.start_date || null,
      event_completion_date: null,
      is_delivery_completed: (event.event_status || '').toUpperCase() === 'COMPLETED',
      notes: `${orderType === 'first_order' ? 'First' : (orderType === 'repeat_order' ? 'Repeat' : 'Pre-approved opportunity')} qualifying event commission (${(commissionRate * 100).toFixed(0)}% on RM${cashCollected.toFixed(2)} cash)`,
      approved_by_user_id: null,
      approved_at: null,
      payout_batch_id: null,
      paid_at: null,
      created_at: eligibilityDateIso,
      updated_at: eligibilityDateIso,
    };

    // 10. Persist to Supabase or Local Fallback
    if (isSupabaseConfigured(env)) {
      try {
        const supabase = getSupabaseServerClient(env);
        const { data, error } = await supabase
          .from('sales_commissions')
          .insert(newCommission)
          .select()
          .single();

        if (error) {
          if (error.code === '23505' || error.message?.includes('unique') || error.message?.includes('duplicate key')) {
            // Check if this was a concurrent attempt claiming first_order
            if (orderType === 'first_order' && error.message?.includes('idx_unique_first_order_commission_per_org')) {
              // Retry as repeat_order!
              newCommission.order_type = 'repeat_order';
              newCommission.commission_rate = settings.repeat_order_commission_rate;
              newCommission.commission_amount = Number((cashCollected * settings.repeat_order_commission_rate).toFixed(2));
              newCommission.original_commission_rate = newCommission.commission_rate;
              newCommission.original_commission_amount = newCommission.commission_amount;
              newCommission.notes = `Repeat qualifying event commission (${(newCommission.commission_rate * 100).toFixed(0)}% on RM${cashCollected.toFixed(2)} cash)`;

              const retryInsert = await supabase
                .from('sales_commissions')
                .insert(newCommission)
                .select()
                .single();

              if (!retryInsert.error && retryInsert.data) {
                Object.assign(newCommission, retryInsert.data);
              } else {
                throw new Error(retryInsert.error?.message || 'Failed to retry as repeat order');
              }
            } else {
              // Duplicate event_id: return existing
              const existing = await getCommissionByEventId(normEventId, env);
              return {
                eligible: true,
                commission: existing,
                reason: 'Commission was concurrently recorded',
              };
            }
          } else {
            if (isProductionEnvironment(env)) {
              throw new Error(`Failed to record sales commission in production: ${error.message}`);
            }
            console.error('[salesCommissions] Failed to persist commission:', error.message);
          }
        } else if (data) {
          Object.assign(newCommission, data);
        }
      } catch (err: any) {
        if (isProductionEnvironment(env)) {
          throw err;
        }
        console.warn('[salesCommissions] Error inserting commission:', err.message);
      }
    } else {
      // Local dev/test fallback
      assertProductionSafe('evaluateAndRecordEventCommission', env);
      if (!isLocalFallbackAllowed(env)) {
        throw new Error('Database is required to record commission in this environment');
      }
    }

    // If an opportunity was used, mark it consumed AFTER successful commission creation
    if (matchedOpportunityId) {
      await markOpportunityConsumed(matchedOpportunityId, normEventId, env);
    }

    localCommissionsCache.set(newCommission.id, newCommission);

    // Record audit log
    await recordCommissionAuditLog(
      newCommission.id,
      'CREATED',
      {
        new_status: 'pending_review',
        new_amount: commissionAmount,
        reason: newCommission.notes || undefined,
        metadata: {
          order_type: newCommission.order_type,
          commission_rate: newCommission.commission_rate,
          original_commission_rate: newCommission.original_commission_rate,
          cash_collected_amount: cashCollected,
          promo_discount_amount: promoDiscount,
          order_placement_date: orderPlacementDate.toISOString(),
        },
      },
      env
    );

    return {
      eligible: true,
      commission: newCommission,
    };
  });
}

/**
 * Handle commission void / clawback when an event payment is refunded or cancelled.
 */
export async function handleEventRefundCommissionClawback(
  eventId: string,
  reason: string,
  actorUserId?: string,
  env?: Record<string, any>
): Promise<SalesCommissionRecord | null> {
  const normEventId = (eventId || '').trim();
  if (!normEventId) return null;

  const commission = await getCommissionByEventId(normEventId, env);
  if (!commission) return null;

  // If already voided or clawback, nothing to do
  if (commission.status === 'voided' || commission.status === 'clawback') {
    return commission;
  }

  assertProductionSafe('handleEventRefundCommissionClawback', env);

  const previousStatus = commission.status;
  // If commission was already paid, it requires clawback. If pending or approved, it is voided.
  const newStatus: SalesCommissionStatus = previousStatus === 'paid' ? 'clawback' : 'voided';
  const now = new Date().toISOString();

  const updated: SalesCommissionRecord = {
    ...commission,
    status: newStatus,
    refund_reference: reason.trim(),
    notes: `${commission.notes || ''} [${newStatus === 'clawback' ? 'CLAWBACK' : 'VOIDED'}: ${reason}]`.trim(),
    updated_at: now,
  };

  if (isSupabaseConfigured(env)) {
    try {
      const supabase = getSupabaseServerClient(env);
      const { error } = await supabase
        .from('sales_commissions')
        .update({
          status: newStatus,
          refund_reference: updated.refund_reference,
          notes: updated.notes,
          updated_at: now,
        })
        .eq('id', updated.id);

      if (error && isProductionEnvironment(env)) {
        throw new Error(`Failed to update commission on refund in production: ${error.message}`);
      }
    } catch (err: any) {
      if (isProductionEnvironment(env)) {
        throw err;
      }
      console.warn('[salesCommissions] Could not update commission status on refund:', err.message);
    }
  }

  localCommissionsCache.set(updated.id, updated);

  await recordCommissionAuditLog(
    updated.id,
    newStatus === 'clawback' ? 'CLAWBACK' : 'VOIDED',
    {
      previous_status: previousStatus,
      new_status: newStatus,
      previous_amount: commission.commission_amount,
      new_amount: 0,
      actor_user_id: actorUserId || null,
      reason,
      metadata: {
        original_commission_amount: commission.original_commission_amount,
        original_commission_rate: commission.original_commission_rate,
      },
    },
    env
  );

  return updated;
}

/**
 * Lookup commission by event_id.
 */
export async function getCommissionByEventId(
  eventId: string,
  env?: Record<string, any>
): Promise<SalesCommissionRecord | null> {
  const normId = (eventId || '').trim();
  if (!normId) return null;

  if (isSupabaseConfigured(env)) {
    try {
      const supabase = getSupabaseServerClient(env);
      const { data, error } = await supabase
        .from('sales_commissions')
        .select('*')
        .eq('event_id', normId)
        .maybeSingle();

      if (!error && data) {
        return data as SalesCommissionRecord;
      }
    } catch {
      // fallback
    }
  }

  for (const c of localCommissionsCache.values()) {
    if (c.event_id === normId) return c;
  }

  return null;
}

/**
 * Lookup commission by ID with enriched details.
 */
export async function getCommissionById(
  commissionId: string,
  env?: Record<string, any>
): Promise<SalesCommissionWithDetails | null> {
  const normId = (commissionId || '').trim();
  if (!normId) return null;

  let base: SalesCommissionRecord | null = null;

  if (isSupabaseConfigured(env)) {
    try {
      const supabase = getSupabaseServerClient(env);
      const { data, error } = await supabase
        .from('sales_commissions')
        .select('*')
        .eq('id', normId)
        .maybeSingle();

      if (!error && data) {
        base = data as SalesCommissionRecord;
      }
    } catch {
      // fallback
    }
  }

  if (!base) {
    base = localCommissionsCache.get(normId) || null;
  }

  if (!base) return null;

  // Enrich with partner, organization, event, opportunity
  const [partner, org, ev, opp] = await Promise.all([
    getSalesPartnerProfileById(base.sales_partner_id, env),
    getOrganizationById(base.organization_id, env),
    getEventById(base.event_id, env),
    base.opportunity_id ? getSalesOpportunityById(base.opportunity_id, env) : Promise.resolve(null),
  ]);

  return {
    ...base,
    partner: partner ? {
      id: partner.id,
      user_id: partner.user_id,
      name: (partner as any).user?.name || 'Partner',
      email: (partner as any).user?.email || '',
      status: partner.status,
    } : undefined,
    organization: org ? {
      id: org.id,
      name: org.name,
      slug: (org as any).slug || org.name,
      owner_id: org.owner_id,
    } : null,
    event: ev ? {
      id: ev.id,
      name: ev.name,
      status: ev.status,
      event_status: ev.event_status,
      start_date: ev.start_date || null,
      end_date: ev.end_date || null,
    } : null,
    opportunity: opp ? {
      id: opp.id,
      title: opp.title,
      status: opp.status,
    } : null,
  };
}

/**
 * Get all commissions for an organization.
 */
export async function getCommissionsForOrganization(
  orgId: string,
  env?: Record<string, any>
): Promise<SalesCommissionRecord[]> {
  const normOrgId = (orgId || '').trim();
  if (!normOrgId) return [];

  if (isSupabaseConfigured(env)) {
    try {
      const supabase = getSupabaseServerClient(env);
      const { data, error } = await supabase
        .from('sales_commissions')
        .select('*')
        .eq('organization_id', normOrgId)
        .order('created_at', { ascending: true });

      if (!error && data) {
        return data as SalesCommissionRecord[];
      }
    } catch {
      // fallback
    }
  }

  return Array.from(localCommissionsCache.values()).filter(
    (c) => c.organization_id === normOrgId
  ).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

/**
 * Admin list and filter commissions.
 */
export async function listAdminCommissions(
  filters?: {
    status?: SalesCommissionStatus | 'all';
    order_type?: SalesCommissionOrderType | 'all';
    sales_partner_id?: string;
    organization_id?: string;
    search?: string;
    payout_batch_id?: string;
    page?: number;
    limit?: number;
  },
  env?: Record<string, any>
): Promise<{
  commissions: SalesCommissionWithDetails[];
  total: number;
  total_amount: number;
}> {
  const page = Math.max(1, filters?.page || 1);
  const limit = Math.min(100, Math.max(1, filters?.limit || 20));
  const offset = (page - 1) * limit;

  let allCommissions: SalesCommissionRecord[] = [];

  if (isSupabaseConfigured(env)) {
    try {
      const supabase = getSupabaseServerClient(env);
      let query = supabase.from('sales_commissions').select('*', { count: 'exact' });

      if (filters?.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }
      if (filters?.order_type && filters.order_type !== 'all') {
        query = query.eq('order_type', filters.order_type);
      }
      if (filters?.sales_partner_id) {
        query = query.eq('sales_partner_id', filters.sales_partner_id);
      }
      if (filters?.organization_id) {
        query = query.eq('organization_id', filters.organization_id);
      }
      if (filters?.payout_batch_id) {
        query = query.eq('payout_batch_id', filters.payout_batch_id);
      }

      query = query.order('created_at', { ascending: false });

      const { data, count, error } = await query;
      if (!error && data) {
        allCommissions = data as SalesCommissionRecord[];
      }
    } catch {
      // fallback
    }
  }

  if (allCommissions.length === 0 && localCommissionsCache.size > 0) {
    allCommissions = Array.from(localCommissionsCache.values()).filter((c) => {
      if (filters?.status && filters.status !== 'all' && c.status !== filters.status) return false;
      if (filters?.order_type && filters.order_type !== 'all' && c.order_type !== filters.order_type) return false;
      if (filters?.sales_partner_id && c.sales_partner_id !== filters.sales_partner_id) return false;
      if (filters?.organization_id && c.organization_id !== filters.organization_id) return false;
      if (filters?.payout_batch_id && c.payout_batch_id !== filters.payout_batch_id) return false;
      return true;
    }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  // Filter by search query if specified
  if (filters?.search && filters.search.trim()) {
    const q = filters.search.trim().toLowerCase();
    allCommissions = allCommissions.filter((c) => {
      return (
        c.id.toLowerCase().includes(q) ||
        (c.notes && c.notes.toLowerCase().includes(q)) ||
        c.event_id.toLowerCase().includes(q) ||
        c.organization_id.toLowerCase().includes(q)
      );
    });
  }

  const totalAmount = allCommissions.reduce((sum, c) => sum + Number(c.commission_amount || 0), 0);
  const paged = allCommissions.slice(offset, offset + limit);

  // Enrich with partner, organization, event info
  const enriched: SalesCommissionWithDetails[] = await Promise.all(
    paged.map(async (c) => {
      const [partner, org, ev] = await Promise.all([
        getSalesPartnerProfileById(c.sales_partner_id, env),
        getOrganizationById(c.organization_id, env),
        getEventById(c.event_id, env),
      ]);
      return {
        ...c,
        partner: partner ? {
          id: partner.id,
          user_id: partner.user_id,
          name: (partner as any).user?.name || 'Partner',
          email: (partner as any).user?.email || '',
          status: partner.status,
        } : undefined,
        organization: org ? {
          id: org.id,
          name: org.name,
          slug: (org as any).slug || org.name,
          owner_id: org.owner_id,
        } : null,
        event: ev ? {
          id: ev.id,
          name: ev.name,
          status: ev.status,
          event_status: ev.event_status,
          start_date: ev.start_date || null,
          end_date: ev.end_date || null,
        } : null,
      };
    })
  );

  return {
    commissions: enriched,
    total: allCommissions.length,
    total_amount: Number(totalAmount.toFixed(2)),
  };
}

/**
 * Admin: Approve a commission.
 *
 * SAFER POLICY ENFORCEMENT:
 * Commission becomes payable only after event completion and review requirements are satisfied.
 */
export async function approveCommission(
  commissionId: string,
  adminUserId: string,
  notes?: string,
  env?: Record<string, any>
): Promise<SalesCommissionRecord> {
  assertProductionSafe('approveCommission', env);

  const normId = (commissionId || '').trim();
  const current = await getCommissionById(normId, env);
  if (!current) {
    throw new Error('Commission record not found');
  }

  if (current.status !== 'pending_review') {
    throw new Error(`Cannot approve commission in '${current.status}' status`);
  }

  // Verify associated event delivery completion
  const event = await getEventById(current.event_id, env);
  if (!event) {
    throw new Error('Event associated with this commission was not found');
  }

  const isCancelled =
    (event.status || '').toLowerCase() === 'cancelled' ||
    (event.event_status || '').toUpperCase() === 'CANCELLED' ||
    event.payment_status === 'REFUNDED';

  if (isCancelled) {
    throw new Error('Cannot approve commission: Associated event is cancelled or refunded');
  }

  const settings = await getSalesCommissionSettings(env);
  const isCompleted =
    (event.status || '').toLowerCase() === 'completed' ||
    (event.event_status || '').toUpperCase() === 'COMPLETED';

  if (settings.require_delivery_completion && !isCompleted) {
    throw new Error(
      `Cannot approve commission: Event delivery has not completed yet (current event status is '${event.event_status || event.status || 'in progress'}'). Commissions only become payable after event completion.`
    );
  }

  const now = new Date().toISOString();
  const updated: SalesCommissionRecord = {
    ...current,
    status: 'approved',
    is_delivery_completed: true,
    event_completion_date: now,
    approved_by_user_id: adminUserId,
    approved_at: now,
    notes: notes ? `${current.notes || ''} [Approved: ${notes}]`.trim() : current.notes,
    updated_at: now,
  };

  if (isSupabaseConfigured(env)) {
    const supabase = getSupabaseServerClient(env);
    const { error } = await supabase
      .from('sales_commissions')
      .update({
        status: 'approved',
        is_delivery_completed: true,
        event_completion_date: now,
        approved_by_user_id: adminUserId,
        approved_at: now,
        notes: updated.notes,
        updated_at: now,
      })
      .eq('id', updated.id);

    if (error) {
      if (isProductionEnvironment(env)) {
        throw new Error(`Failed to approve commission in production: ${error.message}`);
      }
      console.error('[salesCommissions] Failed to approve commission:', error.message);
    }
  }

  localCommissionsCache.set(updated.id, updated);

  await recordCommissionAuditLog(
    updated.id,
    'APPROVED',
    {
      previous_status: 'pending_review',
      new_status: 'approved',
      previous_amount: current.commission_amount,
      new_amount: updated.commission_amount,
      actor_user_id: adminUserId,
      reason: notes || 'Admin approval following event completion verification',
      metadata: {
        original_commission_amount: current.original_commission_amount,
        original_commission_rate: current.original_commission_rate,
      },
    },
    env
  );

  return updated;
}

/**
 * Admin: Void a commission.
 */
export async function voidCommission(
  commissionId: string,
  adminUserId: string,
  reason: string,
  env?: Record<string, any>
): Promise<SalesCommissionRecord> {
  assertProductionSafe('voidCommission', env);

  const normId = (commissionId || '').trim();
  const current = await getCommissionById(normId, env);
  if (!current) {
    throw new Error('Commission record not found');
  }

  if (current.status === 'paid') {
    throw new Error('Cannot void a commission that has already been paid out. Use clawback instead.');
  }

  const now = new Date().toISOString();
  const updated: SalesCommissionRecord = {
    ...current,
    status: 'voided',
    notes: `${current.notes || ''} [Voided: ${reason}]`.trim(),
    updated_at: now,
  };

  if (isSupabaseConfigured(env)) {
    const supabase = getSupabaseServerClient(env);
    const { error } = await supabase
      .from('sales_commissions')
      .update({
        status: 'voided',
        notes: updated.notes,
        updated_at: now,
      })
      .eq('id', updated.id);

    if (error) {
      if (isProductionEnvironment(env)) {
        throw new Error(`Failed to void commission in production: ${error.message}`);
      }
      console.error('[salesCommissions] Failed to void commission:', error.message);
    }
  }

  localCommissionsCache.set(updated.id, updated);

  await recordCommissionAuditLog(
    updated.id,
    'VOIDED',
    {
      previous_status: current.status,
      new_status: 'voided',
      previous_amount: current.commission_amount,
      new_amount: 0,
      actor_user_id: adminUserId,
      reason,
      metadata: {
        original_commission_amount: current.original_commission_amount,
        original_commission_rate: current.original_commission_rate,
      },
    },
    env
  );

  return updated;
}

/**
 * Admin: Adjust commission amount.
 *
 * AUDITABILITY REQUIREMENT:
 * Preserves the original commission calculation intact (original_commission_amount, original_commission_rate).
 * Records adjustment amount, adjustment reason, and an append-only audit log entry.
 */
export async function adjustCommission(
  commissionId: string,
  newAmount: number,
  adminUserId: string,
  reason: string,
  env?: Record<string, any>
): Promise<SalesCommissionRecord> {
  assertProductionSafe('adjustCommission', env);

  const normId = (commissionId || '').trim();
  const current = await getCommissionById(normId, env);
  if (!current) {
    throw new Error('Commission record not found');
  }

  if (current.status === 'paid') {
    throw new Error('Cannot adjust a commission that has already been paid');
  }

  if (typeof newAmount !== 'number' || isNaN(newAmount) || newAmount < 0) {
    throw new Error('Valid non-negative commission amount is required');
  }

  const now = new Date().toISOString();
  const originalAmount = current.original_commission_amount ?? current.commission_amount;
  const adjAmount = Number((newAmount - originalAmount).toFixed(2));

  const updated: SalesCommissionRecord = {
    ...current,
    commission_amount: Number(newAmount.toFixed(2)),
    adjustment_amount: adjAmount,
    adjustment_reason: reason.trim(),
    notes: `${current.notes || ''} [Adjusted from RM${current.commission_amount.toFixed(2)} to RM${newAmount.toFixed(2)}: ${reason}]`.trim(),
    updated_at: now,
  };

  if (isSupabaseConfigured(env)) {
    const supabase = getSupabaseServerClient(env);
    const { error } = await supabase
      .from('sales_commissions')
      .update({
        commission_amount: updated.commission_amount,
        adjustment_amount: updated.adjustment_amount,
        adjustment_reason: updated.adjustment_reason,
        notes: updated.notes,
        updated_at: now,
      })
      .eq('id', updated.id);

    if (error) {
      if (isProductionEnvironment(env)) {
        throw new Error(`Failed to adjust commission in production: ${error.message}`);
      }
      console.error('[salesCommissions] Failed to adjust commission:', error.message);
    }
  }

  localCommissionsCache.set(updated.id, updated);

  await recordCommissionAuditLog(
    updated.id,
    'ADJUSTED',
    {
      previous_status: current.status,
      new_status: current.status,
      previous_amount: current.commission_amount,
      new_amount: updated.commission_amount,
      actor_user_id: adminUserId,
      reason,
      metadata: {
        original_commission_amount: originalAmount,
        original_commission_rate: current.original_commission_rate,
        adjustment_amount: adjAmount,
      },
    },
    env
  );

  return updated;
}

// ============================================================================
// POST-12-MONTH SALES OPPORTUNITY MANAGEMENT
// ============================================================================

/**
 * Helper to find an approved, valid sales opportunity for an organization.
 * MUST be approved BEFORE the order was placed!
 */
export async function findApprovedOpportunityForOrder(
  salesPartnerId: string,
  organizationId: string,
  orderPlacementDate: Date,
  env?: Record<string, any>
): Promise<SalesOpportunityRecord | null> {
  const normPartnerId = (salesPartnerId || '').trim();
  const normOrgId = (organizationId || '').trim();
  const orderTime = orderPlacementDate.getTime();

  let opportunities: SalesOpportunityRecord[] = [];

  if (isSupabaseConfigured(env)) {
    try {
      const supabase = getSupabaseServerClient(env);
      const { data, error } = await supabase
        .from('sales_opportunities')
        .select('*')
        .eq('sales_partner_id', normPartnerId)
        .eq('organization_id', normOrgId)
        .eq('status', 'approved');

      if (!error && data) {
        opportunities = data as SalesOpportunityRecord[];
      }
    } catch {
      // fallback
    }
  }

  if (opportunities.length === 0) {
    opportunities = Array.from(localOpportunitiesCache.values()).filter(
      (o) =>
        o.sales_partner_id === normPartnerId &&
        o.organization_id === normOrgId &&
        o.status === 'approved'
    );
  }

  // Filter:
  // 1. Must have been approved BEFORE order placement date: decided_at < orderPlacementDate
  // 2. Must not be expired: valid_until === null OR valid_until >= orderPlacementDate
  for (const opp of opportunities) {
    if (!opp.decided_at) continue;
    const approvalTime = new Date(opp.decided_at).getTime();

    // Strict non-retrospective rule!
    if (approvalTime >= orderTime) {
      continue;
    }

    if (opp.valid_until) {
      const validUntilTime = new Date(opp.valid_until).getTime();
      if (orderTime > validUntilTime) {
        continue;
      }
    }

    return opp;
  }

  return null;
}

/**
 * Mark a sales opportunity as consumed by an event order.
 */
async function markOpportunityConsumed(
  opportunityId: string,
  eventId: string,
  env?: Record<string, any>
): Promise<void> {
  const now = new Date().toISOString();
  const opp = localOpportunitiesCache.get(opportunityId);
  if (opp) {
    opp.status = 'consumed';
    opp.decision_notes = `${opp.decision_notes || ''} [Consumed by event ${eventId}]`.trim();
    opp.updated_at = now;
  }

  if (isSupabaseConfigured(env)) {
    try {
      const supabase = getSupabaseServerClient(env);
      await supabase
        .from('sales_opportunities')
        .update({
          status: 'consumed',
          updated_at: now,
        })
        .eq('id', opportunityId);
    } catch {
      // ignore
    }
  }
}

/**
 * Lookup opportunity by ID.
 */
export async function getSalesOpportunityById(
  opportunityId: string,
  env?: Record<string, any>
): Promise<SalesOpportunityRecord | null> {
  const normId = (opportunityId || '').trim();
  if (!normId) return null;

  if (isSupabaseConfigured(env)) {
    try {
      const supabase = getSupabaseServerClient(env);
      const { data, error } = await supabase
        .from('sales_opportunities')
        .select('*')
        .eq('id', normId)
        .maybeSingle();

      if (!error && data) {
        return data as SalesOpportunityRecord;
      }
    } catch {
      // fallback
    }
  }

  return localOpportunitiesCache.get(normId) || null;
}

/**
 * Sales Partner submits a new sales opportunity request for an attributed organization.
 */
export async function createSalesOpportunityRequest(
  params: {
    partnerUserId: string;
    organizationId: string;
    title: string;
    description?: string;
    expectedEventDate?: string;
  },
  env?: Record<string, any>
): Promise<SalesOpportunityRecord> {
  assertProductionSafe('createSalesOpportunityRequest', env);

  const { partnerUserId, organizationId, title, description, expectedEventDate } = params;

  if (!title || !title.trim()) {
    throw new Error('Opportunity title is required');
  }

  const partnerProfile = await getSalesPartnerProfileByUserId(partnerUserId, env);
  if (!partnerProfile || partnerProfile.status !== 'active') {
    throw new Error('Active Sales Partner profile is required to request sales opportunities');
  }

  const attribution = await getApprovedAttributionForOrg(organizationId, env);
  if (!attribution || attribution.sales_partner_id !== partnerProfile.id) {
    throw new Error('You are not the approved Sales Partner for this organization');
  }

  const now = new Date().toISOString();
  const record: SalesOpportunityRecord = {
    id: crypto.randomUUID(),
    sales_partner_id: partnerProfile.id,
    partner_user_id: partnerUserId,
    organization_id: organizationId,
    customer_attribution_id: attribution.id,
    title: title.trim(),
    description: description?.trim() || null,
    expected_event_date: expectedEventDate || null,
    status: 'pending',
    valid_until: null,
    decided_by_user_id: null,
    decided_at: null,
    decision_notes: null,
    created_at: now,
    updated_at: now,
  };

  if (isSupabaseConfigured(env)) {
    const supabase = getSupabaseServerClient(env);
    const { data, error } = await supabase
      .from('sales_opportunities')
      .insert(record)
      .select()
      .single();

    if (error) {
      if (isProductionEnvironment(env)) {
        throw new Error(`Failed to create opportunity request in production: ${error.message}`);
      }
      console.error('[salesOpportunities] Failed to create opportunity:', error.message);
    } else if (data) {
      Object.assign(record, data);
    }
  }

  localOpportunitiesCache.set(record.id, record);
  return record;
}

/**
 * Admin: Approve a sales opportunity request BEFORE order placement.
 */
export async function approveSalesOpportunity(
  opportunityId: string,
  adminUserId: string,
  params: {
    validUntil?: string; // Expiry date for the opportunity window
    decisionNotes?: string;
  },
  env?: Record<string, any>
): Promise<SalesOpportunityRecord> {
  assertProductionSafe('approveSalesOpportunity', env);

  const normId = (opportunityId || '').trim();
  const opp = await getSalesOpportunityById(normId, env);
  if (!opp) {
    throw new Error('Sales opportunity not found');
  }

  if (opp.status !== 'pending') {
    throw new Error(`Cannot approve opportunity in '${opp.status}' status`);
  }

  const now = new Date();
  let validUntilIso = params.validUntil;
  if (!validUntilIso) {
    const defaultExpiry = new Date(now);
    defaultExpiry.setDate(defaultExpiry.getDate() + 90);
    validUntilIso = defaultExpiry.toISOString();
  }

  const updated: SalesOpportunityRecord = {
    ...opp,
    status: 'approved',
    valid_until: validUntilIso,
    decided_by_user_id: adminUserId,
    decided_at: now.toISOString(),
    decision_notes: params.decisionNotes?.trim() || 'Approved by Admin',
    updated_at: now.toISOString(),
  };

  if (isSupabaseConfigured(env)) {
    const supabase = getSupabaseServerClient(env);
    const { error } = await supabase
      .from('sales_opportunities')
      .update({
        status: 'approved',
        valid_until: validUntilIso,
        decided_by_user_id: adminUserId,
        decided_at: updated.decided_at,
        decision_notes: updated.decision_notes,
        updated_at: updated.updated_at,
      })
      .eq('id', updated.id);

    if (error) {
      if (isProductionEnvironment(env)) {
        throw new Error(`Failed to approve opportunity in production: ${error.message}`);
      }
      console.error('[salesOpportunities] Failed to approve opportunity:', error.message);
    }
  }

  localOpportunitiesCache.set(updated.id, updated);
  return updated;
}

/**
 * Admin: Reject a sales opportunity request.
 */
export async function rejectSalesOpportunity(
  opportunityId: string,
  adminUserId: string,
  reason: string,
  env?: Record<string, any>
): Promise<SalesOpportunityRecord> {
  assertProductionSafe('rejectSalesOpportunity', env);

  const normId = (opportunityId || '').trim();
  const opp = await getSalesOpportunityById(normId, env);
  if (!opp) {
    throw new Error('Sales opportunity not found');
  }

  const now = new Date().toISOString();
  const updated: SalesOpportunityRecord = {
    ...opp,
    status: 'rejected',
    decided_by_user_id: adminUserId,
    decided_at: now,
    decision_notes: reason.trim(),
    updated_at: now,
  };

  if (isSupabaseConfigured(env)) {
    const supabase = getSupabaseServerClient(env);
    const { error } = await supabase
      .from('sales_opportunities')
      .update({
        status: 'rejected',
        decided_by_user_id: adminUserId,
        decided_at: now,
        decision_notes: updated.decision_notes,
        updated_at: now,
      })
      .eq('id', updated.id);

    if (error) {
      if (isProductionEnvironment(env)) {
        throw new Error(`Failed to reject opportunity in production: ${error.message}`);
      }
      console.error('[salesOpportunities] Failed to reject opportunity:', error.message);
    }
  }

  localOpportunitiesCache.set(updated.id, updated);
  return updated;
}

/**
 * List sales opportunities with filtering.
 */
export async function listSalesOpportunities(
  filters?: {
    sales_partner_id?: string;
    partner_user_id?: string;
    organization_id?: string;
    status?: SalesOpportunityStatus | 'all';
  },
  env?: Record<string, any>
): Promise<SalesOpportunityWithDetails[]> {
  let list: SalesOpportunityRecord[] = [];

  if (isSupabaseConfigured(env)) {
    try {
      const supabase = getSupabaseServerClient(env);
      let query = supabase.from('sales_opportunities').select('*');

      if (filters?.sales_partner_id) {
        query = query.eq('sales_partner_id', filters.sales_partner_id);
      }
      if (filters?.partner_user_id) {
        query = query.eq('partner_user_id', filters.partner_user_id);
      }
      if (filters?.organization_id) {
        query = query.eq('organization_id', filters.organization_id);
      }
      if (filters?.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }

      query = query.order('created_at', { ascending: false });
      const { data, error } = await query;
      if (!error && data) {
        list = data as SalesOpportunityRecord[];
      }
    } catch {
      // fallback
    }
  }

  if (list.length === 0) {
    list = Array.from(localOpportunitiesCache.values()).filter((o) => {
      if (filters?.sales_partner_id && o.sales_partner_id !== filters.sales_partner_id) return false;
      if (filters?.partner_user_id && o.partner_user_id !== filters.partner_user_id) return false;
      if (filters?.organization_id && o.organization_id !== filters.organization_id) return false;
      if (filters?.status && filters.status !== 'all' && o.status !== filters.status) return false;
      return true;
    }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  // Enrich with partner and org details
  return await Promise.all(
    list.map(async (o) => {
      const [partner, org] = await Promise.all([
        getSalesPartnerProfileById(o.sales_partner_id, env),
        getOrganizationById(o.organization_id, env),
      ]);
      return {
        ...o,
        partner: partner ? {
          id: partner.id,
          user_id: partner.user_id,
          name: (partner as any).user?.name || 'Partner',
          email: (partner as any).user?.email || '',
        } : undefined,
        organization: org ? {
          id: org.id,
          name: org.name,
          slug: (org as any).slug || org.name,
        } : null,
      };
    })
  );
}

// ============================================================================
// PAYOUT PREPARATION & BATCHING
// ============================================================================

/**
 * Get approved commissions ready for payout, grouped by Sales Partner.
 * Only includes commissions that are status 'approved' and have not been batched.
 */
export async function getCommissionsReadyForPayout(
  env?: Record<string, any>
): Promise<{
  partners: Array<{
    partner: {
      id: string;
      user_id: string;
      name: string;
      email: string;
      status: string;
    };
    total_amount: number;
    commission_count: number;
    commissions: SalesCommissionRecord[];
  }>;
  total_ready_amount: number;
  total_approved_commissions: number;
}> {
  let approvedCommissions: SalesCommissionRecord[] = [];

  if (isSupabaseConfigured(env)) {
    try {
      const supabase = getSupabaseServerClient(env);
      const { data, error } = await supabase
        .from('sales_commissions')
        .select('*')
        .eq('status', 'approved')
        .is('payout_batch_id', null);

      if (!error && data) {
        approvedCommissions = data as SalesCommissionRecord[];
      }
    } catch {
      // fallback
    }
  }

  if (approvedCommissions.length === 0) {
    approvedCommissions = Array.from(localCommissionsCache.values()).filter(
      (c) => c.status === 'approved' && !c.payout_batch_id
    );
  }

  const byPartner = new Map<string, SalesCommissionRecord[]>();
  for (const c of approvedCommissions) {
    const list = byPartner.get(c.sales_partner_id) || [];
    list.push(c);
    byPartner.set(c.sales_partner_id, list);
  }

  const partnersSummary = await Promise.all(
    Array.from(byPartner.entries()).map(async ([partnerId, comms]) => {
      const partner = await getSalesPartnerProfileById(partnerId, env);
      const totalAmount = comms.reduce((sum, c) => sum + Number(c.commission_amount || 0), 0);
      return {
        partner: {
          id: partnerId,
          user_id: partner?.user_id || comms[0].partner_user_id,
          name: (partner as any)?.user?.name || 'Partner',
          email: (partner as any)?.user?.email || '',
          status: partner?.status || 'active',
        },
        total_amount: Number(totalAmount.toFixed(2)),
        commission_count: comms.length,
        commissions: comms,
      };
    })
  );

  const totalReadyAmount = partnersSummary.reduce((sum, p) => sum + p.total_amount, 0);

  return {
    partners: partnersSummary,
    total_ready_amount: Number(totalReadyAmount.toFixed(2)),
    total_approved_commissions: approvedCommissions.length,
  };
}

/**
 * Create a new Payout Batch from selected approved commissions.
 */
export async function createPayoutBatch(
  commissionIdsOrFilter: string[] | { partner_user_id?: string; currency?: string; commissionIds?: string[]; notes?: string },
  adminUserId: string,
  notes?: string,
  env?: Record<string, any>
): Promise<SalesPayoutBatchRecord> {
  assertProductionSafe('createPayoutBatch', env);

  let commissionIds: string[] = [];
  let explicitNotes = notes;

  if (Array.isArray(commissionIdsOrFilter)) {
    commissionIds = commissionIdsOrFilter;
  } else if (commissionIdsOrFilter && typeof commissionIdsOrFilter === 'object') {
    if (Array.isArray(commissionIdsOrFilter.commissionIds) && commissionIdsOrFilter.commissionIds.length > 0) {
      commissionIds = commissionIdsOrFilter.commissionIds;
    } else if (commissionIdsOrFilter.partner_user_id) {
      const partnerId = commissionIdsOrFilter.partner_user_id;
      const targetCurrency = commissionIdsOrFilter.currency ? commissionIdsOrFilter.currency.toUpperCase() : undefined;
      const partnerCommissions = await getPartnerCommissions(partnerId, env);
      commissionIds = partnerCommissions
        .filter((c) => {
          const isEligible = c.status === 'approved' || (c.status as string) === 'ready';
          const notInBatch = !c.payout_batch_id;
          const currencyMatch = !targetCurrency || (c.currency || 'MYR').toUpperCase() === targetCurrency;
          return isEligible && notInBatch && currencyMatch;
        })
        .map((c) => c.id);
    }
    if (commissionIdsOrFilter.notes) {
      explicitNotes = commissionIdsOrFilter.notes;
    }
  }

  if (!Array.isArray(commissionIds) || commissionIds.length === 0) {
    throw new Error('At least one commission ID is required to create a payout batch');
  }

  const targetCommissions: SalesCommissionRecord[] = [];
  let batchCurrency: string | null = null;
  for (const cid of commissionIds) {
    const c = await getCommissionById(cid, env);
    if (!c) {
      throw new Error(`Commission ${cid} not found`);
    }
    const currentStatus = c.status as string;
    if (currentStatus !== 'approved' && currentStatus !== 'ready') {
      throw new Error(`Commission ${cid} has status '${c.status}', must be 'approved' or 'ready' to batch`);
    }
    if (c.payout_batch_id) {
      throw new Error(`Commission ${cid} is already assigned to a payout batch`);
    }

    const commCurrency = (c.currency || 'MYR').toUpperCase();
    if (batchCurrency === null) {
      batchCurrency = commCurrency;
    } else if (batchCurrency !== commCurrency) {
      throw new Error(`Cannot mix currencies in a single payout batch: found ${batchCurrency} and ${commCurrency}`);
    }

    targetCommissions.push(c);
  }

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const randSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  const batchRef = `PAY-${dateStr}-${randSuffix}`;

  const totalAmount = targetCommissions.reduce((sum, c) => sum + Number(c.commission_amount || 0), 0);
  const uniquePartners = new Set(targetCommissions.map((c) => c.sales_partner_id));

  const batchRecord: SalesPayoutBatchRecord = {
    id: crypto.randomUUID(),
    batch_reference: batchRef,
    created_by_user_id: adminUserId,
    total_amount: Number(totalAmount.toFixed(2)),
    currency: batchCurrency || 'MYR',
    total_commissions: targetCommissions.length,
    commission_count: targetCommissions.length,
    total_partners: uniquePartners.size,
    status: 'draft',
    payment_reference: null,
    payment_notes: explicitNotes || null,
    paid_at: null,
    paid_by_user_id: null,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  };

  if (isSupabaseConfigured(env)) {
    const supabase = getSupabaseServerClient(env);
    const { error: batchErr } = await supabase.from('sales_payout_batches').insert(batchRecord);
    if (batchErr) {
      if (isProductionEnvironment(env)) {
        throw new Error(`Failed to create payout batch in production: ${batchErr.message}`);
      }
      console.error('[salesPayouts] Failed to insert payout batch:', batchErr.message);
    }
  }

  localPayoutBatchesCache.set(batchRecord.id, batchRecord);

  // Link commissions to this batch
  for (const c of targetCommissions) {
    c.payout_batch_id = batchRecord.id;
    c.updated_at = now.toISOString();
    localCommissionsCache.set(c.id, c);

    if (isSupabaseConfigured(env)) {
      try {
        const supabase = getSupabaseServerClient(env);
        await supabase
          .from('sales_commissions')
          .update({
            payout_batch_id: batchRecord.id,
            updated_at: now.toISOString(),
          })
          .eq('id', c.id);
      } catch {
        // ignore
      }
    }

    await recordCommissionAuditLog(
      c.id,
      'BATCHED',
      {
        previous_status: 'approved',
        new_status: 'approved',
        actor_user_id: adminUserId,
        reason: `Added to payout batch ${batchRef}`,
        metadata: { payout_batch_id: batchRecord.id, batch_reference: batchRef },
      },
      env
    );
  }

  return batchRecord;
}

/**
 * Mark a payout batch as paid/settled, transitioning all associated commissions to 'paid'.
 */
export async function markPayoutBatchPaid(
  batchId: string,
  paymentReferenceOrPayload: string | { payment_reference: string; payment_method?: string; notes?: string },
  adminUserId: string,
  notes?: string,
  env?: Record<string, any>
): Promise<SalesPayoutBatchRecord> {
  assertProductionSafe('markPayoutBatchPaid', env);

  const normBatchId = (batchId || '').trim();
  const batch = await getPayoutBatchById(normBatchId, env);
  if (!batch) {
    throw new Error('Payout batch not found');
  }

  if (batch.status === 'paid') {
    throw new Error('Batch is already marked as paid');
  }

  let paymentReference = '';
  let paymentNotes = notes;
  if (typeof paymentReferenceOrPayload === 'string') {
    paymentReference = paymentReferenceOrPayload;
  } else if (paymentReferenceOrPayload && typeof paymentReferenceOrPayload === 'object') {
    paymentReference = paymentReferenceOrPayload.payment_reference || '';
    if (paymentReferenceOrPayload.notes) {
      paymentNotes = paymentReferenceOrPayload.notes;
    }
  }

  if (!paymentReference || !paymentReference.trim()) {
    throw new Error('Payment reference is required when marking a payout batch as paid');
  }

  const now = new Date().toISOString();
  const finalNotes = typeof paymentNotes === 'string' ? paymentNotes.trim() : (batch.payment_notes || null);
  const updatedBatch: SalesPayoutBatchRecord = {
    ...batch,
    status: 'paid',
    payment_reference: paymentReference.trim(),
    payment_notes: finalNotes,
    paid_at: now,
    paid_by_user_id: adminUserId,
    updated_at: now,
  };

  if (isSupabaseConfigured(env)) {
    const supabase = getSupabaseServerClient(env);
    const { error } = await supabase
      .from('sales_payout_batches')
      .update({
        status: 'paid',
        payment_reference: updatedBatch.payment_reference,
        payment_notes: updatedBatch.payment_notes,
        paid_at: now,
        paid_by_user_id: adminUserId,
        updated_at: now,
      })
      .eq('id', updatedBatch.id);

    if (error) {
      if (isProductionEnvironment(env)) {
        throw new Error(`Failed to update payout batch in production: ${error.message}`);
      }
      console.error('[salesPayouts] Failed to update payout batch:', error.message);
    }
  }

  localPayoutBatchesCache.set(updatedBatch.id, updatedBatch);

  // Update all associated commissions to 'paid'
  let associatedCommissions: SalesCommissionRecord[] = [];
  if (isSupabaseConfigured(env)) {
    try {
      const supabase = getSupabaseServerClient(env);
      const { data } = await supabase
        .from('sales_commissions')
        .select('*')
        .eq('payout_batch_id', updatedBatch.id);
      if (data) associatedCommissions = data as SalesCommissionRecord[];
    } catch {
      // fallback
    }
  }

  if (associatedCommissions.length === 0) {
    associatedCommissions = Array.from(localCommissionsCache.values()).filter(
      (c) => c.payout_batch_id === updatedBatch.id
    );
  }

  for (const c of associatedCommissions) {
    c.status = 'paid';
    c.paid_at = now;
    c.updated_at = now;
    localCommissionsCache.set(c.id, c);

    if (isSupabaseConfigured(env)) {
      try {
        const supabase = getSupabaseServerClient(env);
        await supabase
          .from('sales_commissions')
          .update({
            status: 'paid',
            paid_at: now,
            updated_at: now,
          })
          .eq('id', c.id);
      } catch {
        // ignore
      }
    }

    await recordCommissionAuditLog(
      c.id,
      'PAID',
      {
        previous_status: 'approved',
        new_status: 'paid',
        actor_user_id: adminUserId,
        reason: `Payout batch ${updatedBatch.batch_reference} settled. Ref: ${paymentReference}`,
        metadata: {
          payout_batch_id: updatedBatch.id,
          payment_reference: paymentReference,
        },
      },
      env
    );
  }

  return updatedBatch;
}

/**
 * Lookup payout batch by ID.
 */
export async function getPayoutBatchById(
  batchId: string,
  env?: Record<string, any>
): Promise<SalesPayoutBatchRecord | null> {
  const normId = (batchId || '').trim();
  if (!normId) return null;

  if (isSupabaseConfigured(env)) {
    try {
      const supabase = getSupabaseServerClient(env);
      const { data, error } = await supabase
        .from('sales_payout_batches')
        .select('*')
        .eq('id', normId)
        .maybeSingle();

      if (!error && data) {
        return data as SalesPayoutBatchRecord;
      }
    } catch {
      // fallback
    }
  }

  return localPayoutBatchesCache.get(normId) || null;
}

/**
 * List payout batches.
 */
export async function listPayoutBatches(
  env?: Record<string, any>
): Promise<SalesPayoutBatchRecord[]> {
  if (isSupabaseConfigured(env)) {
    try {
      const supabase = getSupabaseServerClient(env);
      const { data, error } = await supabase
        .from('sales_payout_batches')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data) {
        return data as SalesPayoutBatchRecord[];
      }
    } catch {
      // fallback
    }
  }

  return Array.from(localPayoutBatchesCache.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

// ============================================================================
// PARTNER-FACING QUERIES
// ============================================================================

/**
 * Get commissions for a specific Sales Partner.
 */
export async function getPartnerCommissions(
  partnerUserId: string,
  env?: Record<string, any>
): Promise<SalesCommissionWithDetails[]> {
  const partnerProfile = await getSalesPartnerProfileByUserId(partnerUserId, env);
  if (!partnerProfile) return [];

  let list: SalesCommissionRecord[] = [];

  if (isSupabaseConfigured(env)) {
    try {
      const supabase = getSupabaseServerClient(env);
      const { data, error } = await supabase
        .from('sales_commissions')
        .select('*')
        .eq('sales_partner_id', partnerProfile.id)
        .order('created_at', { ascending: false });

      if (!error && data) {
        list = data as SalesCommissionRecord[];
      }
    } catch {
      // fallback
    }
  }

  if (list.length === 0) {
    list = Array.from(localCommissionsCache.values()).filter(
      (c) => c.sales_partner_id === partnerProfile.id
    ).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  // Enrich with organization and event details
  return await Promise.all(
    list.map(async (c) => {
      const [org, ev] = await Promise.all([
        getOrganizationById(c.organization_id, env),
        getEventById(c.event_id, env),
      ]);
      return {
        ...c,
        organization: org ? {
          id: org.id,
          name: org.name,
          slug: (org as any).slug || org.name,
          owner_id: org.owner_id,
        } : null,
        event: ev ? {
          id: ev.id,
          name: ev.name,
          status: ev.status,
          event_status: ev.event_status,
          start_date: ev.start_date || null,
          end_date: ev.end_date || null,
        } : null,
      };
    })
  );
}

/**
 * Summary metrics for a Sales Partner.
 */
export async function getPartnerCommissionSummary(
  partnerUserId: string,
  env?: Record<string, any>
): Promise<PartnerCommissionSummary> {
  const commissions = await getPartnerCommissions(partnerUserId, env);

  const primaryCurrency = commissions.find((c) => c.currency)?.currency || 'MYR';
  let totalEarned = 0;
  let pendingReview = 0;
  let readyForPayout = 0;
  let totalPaid = 0;

  for (const c of commissions) {
    if (c.currency && c.currency !== primaryCurrency) {
      // Do not add together amounts in different currencies
      continue;
    }
    const amt = Number(c.commission_amount || 0);
    if (c.status === 'paid') {
      totalPaid += amt;
      totalEarned += amt;
    } else if (c.status === 'approved') {
      readyForPayout += amt;
      totalEarned += amt;
    } else if (c.status === 'pending_review') {
      pendingReview += amt;
    }
  }

  return {
    total_earned: Number(totalEarned.toFixed(2)),
    pending_review: Number(pendingReview.toFixed(2)),
    ready_for_payout: Number(readyForPayout.toFixed(2)),
    total_paid: Number(totalPaid.toFixed(2)),
    currency: primaryCurrency,
    total_events: commissions.filter((c) => c.status !== 'voided' && (!c.currency || c.currency === primaryCurrency)).length,
  };
}

/**
 * Get 12-month window progress and attribution status for a partner's attributed customers.
 */
export async function getPartnerCustomerAttributionSummary(
  partnerUserId: string,
  env?: Record<string, any>
): Promise<Array<{
  organization_id: string;
  organization_name: string;
  customer_attribution_id: string;
  has_qualifying_order: boolean;
  first_qualifying_date: string | null;
  window_end_date: string | null;
  is_window_expired: boolean;
  days_remaining: number;
  total_commissions_earned: number;
  active_opportunity_exists: boolean;
}>> {
  const partnerProfile = await getSalesPartnerProfileByUserId(partnerUserId, env);
  if (!partnerProfile) return [];

  const settings = await getSalesCommissionSettings(env);
  const allCommissions = await getPartnerCommissions(partnerUserId, env);
  const byOrg = new Map<string, SalesCommissionWithDetails[]>();

  for (const c of allCommissions) {
    if (c.status === 'voided') continue;
    const list = byOrg.get(c.organization_id) || [];
    list.push(c);
    byOrg.set(c.organization_id, list);
  }

  const now = new Date();
  const results: any[] = [];

  for (const [orgId, comms] of byOrg.entries()) {
    comms.sort((a, b) => new Date(a.eligibility_date).getTime() - new Date(b.eligibility_date).getTime());
    const firstComm = comms[0];
    const firstDate = new Date(firstComm.eligibility_date);

    const windowEnd = new Date(firstDate);
    windowEnd.setMonth(windowEnd.getMonth() + settings.repeat_window_months);

    const isExpired = now.getTime() > windowEnd.getTime();
    const diffMs = windowEnd.getTime() - now.getTime();
    const daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

    const totalEarned = comms.reduce((sum, c) => sum + (c.status !== 'voided' ? c.commission_amount : 0), 0);

    const opps = await listSalesOpportunities({
      sales_partner_id: partnerProfile.id,
      organization_id: orgId,
      status: 'approved',
    }, env);

    results.push({
      organization_id: orgId,
      organization_name: firstComm.organization?.name || 'Organization',
      customer_attribution_id: firstComm.customer_attribution_id,
      has_qualifying_order: true,
      first_qualifying_date: firstComm.eligibility_date,
      window_end_date: windowEnd.toISOString(),
      is_window_expired: isExpired,
      days_remaining: daysRemaining,
      total_commissions_earned: Number(totalEarned.toFixed(2)),
      active_opportunity_exists: opps.length > 0,
    });
  }

  return results;
}
