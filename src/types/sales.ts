export interface SalesGameStepInstruction {
  step: string;
  title: string;
  desc: string;
}

export interface SalesGameEventType {
  name: string;
  why: string;
}

export interface SalesGameCustomizationOption {
  title: string;
  description: string;
}

export interface SalesGamePricingTierSummary {
  id: string;
  min_days: number;
  max_days: number | null;
  duration_label: string;
  price: number;
  currency: string;
  country_code: string;
  is_base: boolean;
}

export interface SalesGamePricingSummary {
  requires_custom_quote: boolean;
  display_price: string;
  base_price: number | null;
  currency: string | null;
  pricing_country: string;
  is_fallback: boolean;
  tiers: SalesGamePricingTierSummary[];
}

export interface SalesGameCatalogItem {
  id: string;
  name: string;
  slug: string;
  game_type: string;
  category: string;
  description: string;
  highlight: string;
  icon_name: string;
  cover_image_url: string;
  background_url: string;
  default_duration_seconds: number;
  supported_input_types: string[];
  orientations: string[];
  has_playable_preview: boolean;
  gameplay_instructions: SalesGameStepInstruction[];
  suitable_event_types: SalesGameEventType[];
  customization_capabilities: SalesGameCustomizationOption[];
  pricing: SalesGamePricingSummary;
}

export interface SalesReferralInfo {
  referralCode: string;
  referralUrl: string;
}

export type AttributionStatus = 'pending' | 'approved' | 'rejected' | 'reassigned' | 'needs_review';

export interface CustomerAttribution {
  id: string;
  sales_partner_id: string;
  partner_user_id: string;
  referral_code: string;
  referral_method: 'link' | 'code' | 'admin_lead' | 'direct';
  prospect_email: string | null;
  referred_user_id: string | null;
  organization_id: string | null;
  status: AttributionStatus;
  is_self_referral: boolean;
  is_existing_customer: boolean;
  is_competing_claim: boolean;
  competing_attribution_id: string | null;
  review_reason: string | null;
  decision_reason: string | null;
  decided_by_user_id: string | null;
  decided_at: string | null;
  established_at: string | null;
  created_at: string;
  updated_at: string;
  partner?: {
    id: string;
    user_id: string;
    name: string;
    email: string;
    status: string;
  };
  referred_user?: {
    id: string;
    name: string;
    email: string;
  } | null;
  organization?: {
    id: string;
    name: string;
    slug: string;
    owner_id: string;
  } | null;
  competing_attribution?: any | null;
}

export interface CustomerAttributionAuditLog {
  id: string;
  attribution_id: string;
  previous_status: string | null;
  new_status: string;
  previous_partner_id: string | null;
  new_partner_id: string | null;
  action: 'CREATED' | 'APPROVED' | 'REJECTED' | 'REASSIGNED' | 'FLAGGED_REVIEW' | 'ORG_LINKED';
  reason: string | null;
  actor_user_id: string | null;
  metadata?: Record<string, any> | null;
  created_at: string;
}

// ============================================================================
// PHASE 5: COMMISSION LEDGER, ELIGIBILITY, OPPORTUNITIES & PAYOUT PREPARATION
// ============================================================================

export type SalesCommissionStatus = 'pending_review' | 'approved' | 'paid' | 'voided' | 'clawback';
export type SalesCommissionOrderType = 'first_order' | 'repeat_order' | 'approved_opportunity';

export interface SalesCommission {
  id: string;
  sales_partner_id: string;
  partner_user_id: string;
  customer_attribution_id: string;
  organization_id: string;
  event_id: string;
  opportunity_id: string | null;
  order_type: SalesCommissionOrderType;
  event_price: number;
  promo_discount_amount: number;
  cash_collected_amount: number;
  commission_rate: number;
  commission_amount: number;
  original_commission_rate?: number;
  original_commission_amount?: number;
  calculation_version?: number;
  adjustment_amount?: number;
  adjustment_reason?: string | null;
  currency: string;
  status: SalesCommissionStatus;
  eligibility_date: string;
  order_placement_date?: string | null;
  payment_date?: string | null;
  refund_reference?: string | null;
  event_start_date: string | null;
  event_end_date: string | null;
  event_completion_date?: string | null;
  is_delivery_completed?: boolean;
  notes: string | null;
  approved_by_user_id: string | null;
  approved_at: string | null;
  payout_batch_id: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
  partner?: {
    id: string;
    user_id: string;
    name: string;
    email: string;
    status: string;
  };
  organization?: {
    id: string;
    name: string;
    slug: string;
    owner_id: string;
  } | null;
  event?: {
    id: string;
    name: string;
    status: string;
    event_status: string;
    start_date: string | null;
    end_date: string | null;
  } | null;
  opportunity?: {
    id: string;
    title: string;
    status: string;
  } | null;
}

export type SalesOpportunityStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'consumed';

export interface SalesOpportunity {
  id: string;
  sales_partner_id: string;
  partner_user_id: string;
  organization_id: string;
  customer_attribution_id: string | null;
  title: string;
  description: string | null;
  expected_event_date: string | null;
  status: SalesOpportunityStatus;
  valid_until: string | null;
  decided_by_user_id: string | null;
  decided_at: string | null;
  decision_notes: string | null;
  created_at: string;
  updated_at: string;
  partner?: {
    id: string;
    user_id: string;
    name: string;
    email: string;
  };
  organization?: {
    id: string;
    name: string;
    slug: string;
  } | null;
}

export type SalesPayoutBatchStatus = 'draft' | 'pending_approval' | 'approved' | 'paid' | 'cancelled';

export interface SalesPayoutBatch {
  id: string;
  batch_reference: string;
  created_by_user_id: string;
  total_amount: number;
  currency: string;
  total_commissions: number;
  total_partners: number;
  status: SalesPayoutBatchStatus;
  payment_reference: string | null;
  payment_notes: string | null;
  paid_at: string | null;
  paid_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlatformSalesCommissionSettings {
  first_order_commission_rate: number;
  repeat_order_commission_rate: number;
  repeat_window_months: number;
  require_delivery_completion: boolean;
  minimum_payout_amount: number;
  updated_at: string;
}

export interface PartnerCommissionSummary {
  total_earned: number;
  pending_review: number;
  ready_for_payout: number;
  total_paid: number;
  currency: string;
  total_events: number;
}

export type SalesCommissionWithDetails = SalesCommission;
export type SalesOpportunityWithDetails = SalesOpportunity;

export interface SalesCommissionAuditLogRecord {
  id: string;
  commission_id: string;
  action: 'CREATED' | 'APPROVED' | 'VOIDED' | 'CLAWBACK' | 'BATCHED' | 'PAID' | 'ADJUSTED';
  previous_status: string | null;
  new_status: string;
  previous_amount: number | null;
  new_amount: number | null;
  actor_user_id: string | null;
  reason: string | null;
  metadata?: Record<string, any> | null;
  created_at: string;
}

// ============================================================================
// PHASE 6: SALES PARTNER DASHBOARD & CUSTOMER WORKSPACE TYPES
// ============================================================================

export interface SalesPartnerCustomer {
  id: string; // attribution_id or org id
  organization_id: string | null;
  organization_name: string;
  organization_slug?: string | null;
  attribution_id: string;
  attribution_status: AttributionStatus;
  referral_code: string;
  referral_method: 'link' | 'code' | 'admin_lead' | 'direct';
  contact_email: string | null;
  contact_name: string | null;
  established_at: string | null;
  created_at: string;
  total_events: number;
  total_paid_events: number;
  total_commissions_earned: number;
  total_commissions_pending: number;
  currency: string;
  window_status: 'active' | 'expired' | 'no_orders';
  window_end_date: string | null;
  days_remaining: number | null;
  active_opportunity_exists: boolean;
  latest_activity_at: string | null;
}

export interface SalesPartnerCustomerDetail extends SalesPartnerCustomer {
  attribution: CustomerAttribution;
  events: Array<{
    id: string;
    name: string;
    status: string;
    payment_status: string;
    event_price: number;
    start_date: string | null;
    end_date: string | null;
    created_at: string;
  }>;
  commissions: SalesCommission[];
  opportunities: SalesOpportunity[];
}

export interface SalesDashboardNextAction {
  id: string;
  type: 'pending_review' | 'expiring_window' | 'pending_opportunity' | 'unclaimed_activation' | 'ready_payout';
  title: string;
  description: string;
  action_label: string;
  action_url: string;
  badge_variant?: 'warning' | 'info' | 'success';
}

export interface SalesDashboardSummary {
  total_attributed_customers: number;
  pending_attributions: number;
  approved_attributions: number;
  total_commissions_earned: number;
  commissions_pending_review: number;
  commissions_pending_review_count: number;
  approved_awaiting_payout: number;
  approved_awaiting_payout_count: number;
  total_commissions_paid: number;
  total_commissions_paid_count: number;
  currency: string;
  next_actions: SalesDashboardNextAction[];
  recent_customers: SalesPartnerCustomer[];
  recent_commissions: SalesCommission[];
}

// ============================================================================
// PHASE 7: SALES PARTNER ADMIN MANAGEMENT & AUDIT LOGS
// ============================================================================

export type SalesPartnerStatus = 'pending' | 'active' | 'suspended' | 'rejected';

export interface SalesPartnerProfile {
  id: string;
  user_id: string;
  status: SalesPartnerStatus;
  applied_at: string;
  activated_at: string | null;
  suspended_at: string | null;
  agency_name?: string | null;
  application_notes?: string | null;
  admin_notes?: string | null;
  custom_commission_rate?: number | null;
  first_order_commission_rate?: number | null;
  repeat_order_commission_rate?: number | null;
  created_at: string;
  updated_at: string;
  user?: {
    id: string;
    email: string;
    name: string;
    avatar_url: string | null;
  };
  referral_code?: string;
  referral_url?: string;
  total_attributions?: number;
  approved_attributions?: number;
  total_commissions_earned?: number;
}

export interface SalesPartnerAuditLog {
  id: string;
  partner_user_id: string;
  sales_partner_id: string;
  previous_status: SalesPartnerStatus | null;
  new_status: SalesPartnerStatus;
  action: 'APPLIED' | 'ACTIVATED' | 'SUSPENDED' | 'REACTIVATED' | 'REJECTED' | 'UPDATED' | 'RATE_CHANGED';
  actor_user_id: string | null;
  reason: string | null;
  metadata?: Record<string, any> | null;
  created_at: string;
}

