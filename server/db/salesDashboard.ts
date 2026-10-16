import {
  CustomerAttributionWithDetails,
  AttributionStatus,
  SalesCommissionWithDetails,
  SalesPartnerCustomerRecord,
  SalesPartnerCustomerDetailRecord,
  SalesDashboardSummaryRecord,
  SalesDashboardNextActionRecord,
} from './types.js';
import { getSalesPartnerProfileByUserId } from './salesPartners.js';
import { listCustomerAttributions, getAttributionById } from './salesAttribution.js';
import {
  getPartnerCommissions,
  getPartnerCommissionSummary,
  getSalesCommissionSettings,
  listSalesOpportunities,
  getPartnerCustomerAttributionSummary,
} from './salesCommissions.js';
import { getEventsByOrgId } from './events.js';
import { getOrganizationById } from './organizations.js';

export interface ListSalesPartnerCustomersOptions {
  search?: string;
  status?: AttributionStatus;
  page?: number;
  limit?: number;
  sort_by?: 'latest_activity' | 'name' | 'commissions' | 'established';
  sort_order?: 'asc' | 'desc';
}

export interface ListSalesPartnerCustomersResult {
  customers: SalesPartnerCustomerRecord[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

/**
 * Lists customers attributed to the authenticated Sales Partner.
 * Guarantees zero cross-tenant leakage: only returns records belonging to the partner.
 */
export async function listSalesPartnerCustomers(
  partnerUserId: string,
  options: ListSalesPartnerCustomersOptions = {},
  env?: Record<string, any>
): Promise<ListSalesPartnerCustomersResult> {
  const partnerProfile = await getSalesPartnerProfileByUserId(partnerUserId, env);
  if (!partnerProfile) {
    return { customers: [], total: 0, page: 1, limit: options.limit || 20, total_pages: 0 };
  }

  // Fetch all attributions for this partner
  const attributions = await listCustomerAttributions({ partnerUserId }, env);
  const settings = await getSalesCommissionSettings(env);
  const partnerCommissions = await getPartnerCommissions(partnerUserId, env);

  // Group commissions by organization_id
  const commissionsByOrg = new Map<string, SalesCommissionWithDetails[]>();
  for (const c of partnerCommissions) {
    if (c.status === 'voided') continue;
    const list = commissionsByOrg.get(c.organization_id) || [];
    list.push(c);
    commissionsByOrg.set(c.organization_id, list);
  }

  // Pre-fetch opportunities for this partner
  const opportunities = await listSalesOpportunities({ partner_user_id: partnerUserId }, env);
  const approvedOppOrgs = new Set<string>();
  for (const opp of opportunities) {
    if (opp.status === 'approved' && opp.organization_id) {
      approvedOppOrgs.add(opp.organization_id);
    }
  }

  const now = new Date();
  const customerList: SalesPartnerCustomerRecord[] = [];

  for (const attr of attributions) {
    // If filter by status is requested and doesn't match
    if (options.status && options.status !== ('all' as any) && attr.status !== options.status) {
      continue;
    }

    const orgId = attr.organization_id || null;
    let totalEvents = 0;
    let totalPaidEvents = 0;
    let totalCommissionsEarned = 0;
    let totalCommissionsPending = 0;
    let windowStatus: 'active' | 'expired' | 'no_orders' = 'no_orders';
    let windowEndDate: string | null = null;
    let daysRemaining: number | null = null;
    let customerCurrency = 'MYR';
    let latestActivityTime = new Date(attr.updated_at || attr.created_at).getTime();

    if (orgId) {
      // Query events for this organization
      try {
        const events = await getEventsByOrgId(orgId, env);
        totalEvents = events.length;
        totalPaidEvents = events.filter(
          (e) => e.payment_status === 'PAID' || e.status === 'completed' || (e.status as string) === 'COMPLETED'
        ).length;

        for (const ev of events) {
          const evTime = new Date(ev.updated_at || ev.created_at).getTime();
          if (evTime > latestActivityTime) {
            latestActivityTime = evTime;
          }
        }
      } catch {
        // Fallback gracefully if event query fails
      }

      // Calculate commissions and 12-month repeat window
      const orgComms = commissionsByOrg.get(orgId) || [];
      if (orgComms.length > 0) {
        orgComms.sort(
          (a, b) => new Date(a.eligibility_date).getTime() - new Date(b.eligibility_date).getTime()
        );
        const firstComm = orgComms[0];
        const firstDate = new Date(firstComm.eligibility_date);

        const winEnd = new Date(firstDate);
        winEnd.setMonth(winEnd.getMonth() + settings.repeat_window_months);
        windowEndDate = winEnd.toISOString();

        const isExpired = now.getTime() > winEnd.getTime();
        const diffMs = winEnd.getTime() - now.getTime();
        daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
        windowStatus = isExpired ? 'expired' : 'active';

        const orgCurrency = orgComms.find((c) => c.currency)?.currency || 'MYR';
        customerCurrency = orgCurrency;

        for (const comm of orgComms) {
          // Do not add together amounts in different currencies
          if (comm.currency && comm.currency !== orgCurrency) {
            continue;
          }
          if (comm.status === 'approved' || comm.status === 'paid') {
            totalCommissionsEarned += comm.commission_amount;
          } else if (comm.status === 'pending_review') {
            totalCommissionsPending += comm.commission_amount;
          }
          const commTime = new Date(comm.updated_at || comm.created_at).getTime();
          if (commTime > latestActivityTime) {
            latestActivityTime = commTime;
          }
        }
      }
    }

    const orgName =
      attr.organization?.name ||
      attr.referred_user?.name ||
      attr.prospect_email ||
      (attr.status === 'pending' ? 'Pending Customer Lead' : 'Customer');

    customerList.push({
      id: attr.id,
      organization_id: orgId,
      organization_name: orgName,
      organization_slug: attr.organization?.slug || null,
      attribution_id: attr.id,
      attribution_status: attr.status,
      referral_code: attr.referral_code,
      referral_method: attr.referral_method,
      contact_email: attr.prospect_email || attr.referred_user?.email || null,
      contact_name: attr.referred_user?.name || null,
      established_at: attr.established_at || attr.created_at,
      created_at: attr.created_at,
      total_events: totalEvents,
      total_paid_events: totalPaidEvents,
      total_commissions_earned: Number(totalCommissionsEarned.toFixed(2)),
      total_commissions_pending: Number(totalCommissionsPending.toFixed(2)),
      currency: customerCurrency,
      window_status: windowStatus,
      window_end_date: windowEndDate,
      days_remaining: daysRemaining,
      active_opportunity_exists: orgId ? approvedOppOrgs.has(orgId) : false,
      latest_activity_at: new Date(latestActivityTime).toISOString(),
    });
  }

  // Search filter
  let filtered = customerList;
  if (options.search && options.search.trim()) {
    const q = options.search.trim().toLowerCase();
    filtered = filtered.filter(
      (c) =>
        c.organization_name.toLowerCase().includes(q) ||
        (c.organization_slug && c.organization_slug.toLowerCase().includes(q)) ||
        (c.contact_email && c.contact_email.toLowerCase().includes(q)) ||
        (c.contact_name && c.contact_name.toLowerCase().includes(q)) ||
        c.referral_code.toLowerCase().includes(q) ||
        c.attribution_id.toLowerCase().includes(q)
    );
  }

  // Sorting
  const sortBy = options.sort_by || 'latest_activity';
  const sortOrder = options.sort_order || 'desc';

  filtered.sort((a, b) => {
    let comp = 0;
    if (sortBy === 'name') {
      comp = a.organization_name.localeCompare(b.organization_name);
    } else if (sortBy === 'commissions') {
      comp = a.total_commissions_earned - b.total_commissions_earned;
    } else if (sortBy === 'established') {
      comp =
        new Date(a.established_at || a.created_at).getTime() -
        new Date(b.established_at || b.created_at).getTime();
    } else {
      // default: latest_activity
      comp =
        new Date(a.latest_activity_at || a.created_at).getTime() -
        new Date(b.latest_activity_at || b.created_at).getTime();
    }
    return sortOrder === 'desc' ? -comp : comp;
  });

  const total = filtered.length;
  const page = Math.max(1, options.page || 1);
  const limit = Math.max(1, Math.min(100, options.limit || 20));
  const totalPages = Math.ceil(total / limit);
  const startIndex = (page - 1) * limit;
  const paginated = filtered.slice(startIndex, startIndex + limit);

  return {
    customers: paginated,
    total,
    page,
    limit,
    total_pages: totalPages,
  };
}

/**
 * Retrieves detailed customer information for a single customer or organization.
 * Strictly verifies ownership to prevent Insecure Direct Object Reference (IDOR).
 */
export async function getSalesPartnerCustomerDetail(
  partnerUserId: string,
  customerIdOrOrgId: string,
  env?: Record<string, any>
): Promise<SalesPartnerCustomerDetailRecord | null> {
  const normId = (customerIdOrOrgId || '').trim();
  if (!normId) return null;

  // Find all attributions for this partner
  const attributions = await listCustomerAttributions({ partnerUserId }, env);
  const targetAttr = attributions.find(
    (a) => a.id === normId || a.organization_id === normId
  );

  // If no attribution matches or it belongs to another partner -> Reject
  if (!targetAttr) {
    return null;
  }

  const orgId = targetAttr.organization_id;
  let eventsList: Array<{
    id: string;
    name: string;
    status: string;
    payment_status: string;
    event_price: number;
    start_date: string | null;
    end_date: string | null;
    created_at: string;
  }> = [];

  let commissionsList: SalesCommissionWithDetails[] = [];
  let opportunitiesList: any[] = [];

  if (orgId) {
    try {
      const rawEvents = await getEventsByOrgId(orgId, env);
      eventsList = rawEvents.map((e) => ({
        id: e.id,
        name: e.name,
        status: e.status,
        payment_status: e.payment_status || 'UNPAID',
        event_price: e.event_price || 0,
        start_date: e.start_date || null,
        end_date: e.end_date || null,
        created_at: e.created_at,
      }));
    } catch {
      // Graceful fallback
    }

    const partnerCommissions = await getPartnerCommissions(partnerUserId, env);
    commissionsList = partnerCommissions.filter((c) => c.organization_id === orgId);

    opportunitiesList = await listSalesOpportunities(
      { partner_user_id: partnerUserId, organization_id: orgId },
      env
    );
  }

  // Use the list function helper to get summary metrics
  const listResult = await listSalesPartnerCustomers(
    partnerUserId,
    { limit: 1000 },
    env
  );
  const summaryCustomer = listResult.customers.find((c) => c.id === targetAttr.id);

  if (!summaryCustomer) {
    return null;
  }

  const sanitizedAttribution = {
    ...targetAttr,
    competing_attribution_id: targetAttr.is_competing_claim ? '[Redacted]' : null,
    competing_attribution: null,
  };

  return {
    ...summaryCustomer,
    attribution: sanitizedAttribution,
    events: eventsList,
    commissions: commissionsList,
    opportunities: opportunitiesList,
  };
}

/**
 * Returns authoritative aggregate metrics and next actions for the Sales Partner Dashboard.
 */
export async function getSalesDashboardSummary(
  partnerUserId: string,
  env?: Record<string, any>
): Promise<SalesDashboardSummaryRecord> {
  const partnerProfile = await getSalesPartnerProfileByUserId(partnerUserId, env);
  if (!partnerProfile) {
    return {
      total_attributed_customers: 0,
      pending_attributions: 0,
      approved_attributions: 0,
      total_commissions_earned: 0,
      commissions_pending_review: 0,
      commissions_pending_review_count: 0,
      approved_awaiting_payout: 0,
      approved_awaiting_payout_count: 0,
      total_commissions_paid: 0,
      total_commissions_paid_count: 0,
      currency: 'MYR',
      next_actions: [],
      recent_customers: [],
      recent_commissions: [],
    };
  }

  const [attributions, commissions, commSummary, attributionWindows, opportunities] =
    await Promise.all([
      listCustomerAttributions({ partnerUserId }, env),
      getPartnerCommissions(partnerUserId, env),
      getPartnerCommissionSummary(partnerUserId, env),
      getPartnerCustomerAttributionSummary(partnerUserId, env),
      listSalesOpportunities({ partner_user_id: partnerUserId }, env),
    ]);

  const approvedAttributions = attributions.filter((a) => a.status === 'approved');
  const pendingAttributions = attributions.filter(
    (a) => a.status === 'pending' || a.status === 'needs_review'
  );

  // Group approved unique organizations
  const uniqueOrgIds = new Set(
    approvedAttributions
      .map((a) => a.organization_id)
      .filter((id): id is string => Boolean(id))
  );

  // Multi-currency safety: isolate commissions by primary currency to prevent mixing
  const primaryCurrency = commissions.find((c) => c.currency)?.currency || commSummary.currency || 'MYR';

  const pendingComms = commissions.filter(
    (c) => c.status === 'pending_review' && (!c.currency || c.currency === primaryCurrency)
  );
  const readyPayoutComms = commissions.filter(
    (c) => c.status === 'approved' && !c.paid_at && (!c.currency || c.currency === primaryCurrency)
  );
  const paidComms = commissions.filter(
    (c) => c.status === 'paid' && (!c.currency || c.currency === primaryCurrency)
  );

  const pendingReviewAmount = pendingComms.reduce((s, c) => s + c.commission_amount, 0);
  const readyPayoutAmount = readyPayoutComms.reduce((s, c) => s + c.commission_amount, 0);
  const totalPaidAmount = paidComms.reduce((s, c) => s + c.commission_amount, 0);

  // Compute Next Actions
  const nextActions: SalesDashboardNextActionRecord[] = [];

  // 1. Pending Attributions Review
  if (pendingAttributions.length > 0) {
    nextActions.push({
      id: 'pending_attributions',
      type: 'pending_review',
      title: `${pendingAttributions.length} Referral Lead${
        pendingAttributions.length > 1 ? 's' : ''
      } Pending Review`,
      description:
        'New customer claims or invitations are currently awaiting review or organizational linking.',
      action_label: 'Review Referrals',
      action_url: '/sales/referrals?status=pending',
      badge_variant: 'warning',
    });
  }

  // 2. Commissions Ready for Payout
  if (readyPayoutComms.length > 0) {
    const currencyPrefix = primaryCurrency === 'MYR' ? 'RM' : primaryCurrency;
    nextActions.push({
      id: 'ready_payout',
      type: 'ready_payout',
      title: `${currencyPrefix} ${readyPayoutAmount.toFixed(2)} Approved & Awaiting Payout`,
      description: `${readyPayoutComms.length} commission record(s) have cleared delivery verification and are ready for payout batching.`,
      action_label: 'View Commission Ledger',
      action_url: '/sales/commissions?status=approved',
      badge_variant: 'success',
    });
  }

  // 3. 12-Month Repeat Window Expiring Soon
  for (const win of attributionWindows) {
    if (!win.is_window_expired && win.days_remaining <= 30 && !win.active_opportunity_exists) {
      nextActions.push({
        id: `exp_window_${win.organization_id}`,
        type: 'expiring_window',
        title: `${win.organization_name} Repeat Window Expiring (${win.days_remaining}d remaining)`,
        description:
          'The 12-month repeat order window (5% commission) is nearing expiration. Submit an Opportunity Request if client plans upcoming events.',
        action_label: 'Submit Opportunity',
        action_url: '/sales/commissions',
        badge_variant: 'warning',
      });
      break; // highlight the most pressing one
    }
  }

  // 4. Pending Opportunity Requests
  const pendingOpps = opportunities.filter((o) => o.status === 'pending');
  if (pendingOpps.length > 0) {
    nextActions.push({
      id: 'pending_opportunities',
      type: 'pending_opportunity',
      title: `${pendingOpps.length} Opportunity Request${
        pendingOpps.length > 1 ? 's' : ''
      } Under Review`,
      description:
        'Opportunity requests submitted for repeat orders outside the 12-month window are awaiting admin approval.',
      action_label: 'View Opportunities',
      action_url: '/sales/commissions',
      badge_variant: 'info',
    });
  }

  // 5. If brand new partner with zero attributions
  if (attributions.length === 0) {
    nextActions.push({
      id: 'start_referring',
      type: 'unclaimed_activation',
      title: 'Get Started with Your Partner Referral Link',
      description:
        'Share your unique referral code or link with corporate clients and event agencies to earn 10% on qualifying first orders.',
      action_label: 'Get Referral Link',
      action_url: '/sales/referrals',
      badge_variant: 'info',
    });
  }

  // Fetch recent customers
  const customersResult = await listSalesPartnerCustomers(
    partnerUserId,
    { limit: 5, sort_by: 'latest_activity', sort_order: 'desc' },
    env
  );

  // Recent commissions
  const sortedComms = [...commissions].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  const recentCommissions = sortedComms.slice(0, 5);

  return {
    total_attributed_customers: uniqueOrgIds.size || approvedAttributions.length,
    pending_attributions: pendingAttributions.length,
    approved_attributions: approvedAttributions.length,
    total_commissions_earned: commSummary.total_earned,
    commissions_pending_review: Number(pendingReviewAmount.toFixed(2)),
    commissions_pending_review_count: pendingComms.length,
    approved_awaiting_payout: Number(readyPayoutAmount.toFixed(2)),
    approved_awaiting_payout_count: readyPayoutComms.length,
    total_commissions_paid: Number(totalPaidAmount.toFixed(2)),
    total_commissions_paid_count: paidComms.length,
    currency: primaryCurrency,
    next_actions: nextActions,
    recent_customers: customersResult.customers,
    recent_commissions: recentCommissions,
  };
}
