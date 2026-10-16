-- Migration: 20261014000000_create_sales_commissions_and_payouts.sql
-- Description: Phase 5 — Sales commissions ledger, eligibility, sales opportunities,
--              payout batches, and governance audit trails.

-- 1. Create sales_opportunities table (pre-approved post-12-month sales credit requests)
CREATE TABLE IF NOT EXISTS public.sales_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_partner_id UUID NOT NULL REFERENCES public.sales_partner_profiles (id) ON DELETE RESTRICT,
  partner_user_id UUID NOT NULL REFERENCES public.users (id) ON DELETE RESTRICT,
  organization_id UUID NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  customer_attribution_id UUID REFERENCES public.customer_attributions (id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  expected_event_date TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'consumed')),
  valid_until TIMESTAMPTZ,
  decided_by_user_id UUID REFERENCES public.users (id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  decision_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_sales_opportunities_partner ON public.sales_opportunities (sales_partner_id);
CREATE INDEX IF NOT EXISTS idx_sales_opportunities_org ON public.sales_opportunities (organization_id);
CREATE INDEX IF NOT EXISTS idx_sales_opportunities_status ON public.sales_opportunities (status);

-- 2. Create sales_payout_batches table
CREATE TABLE IF NOT EXISTS public.sales_payout_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_reference TEXT NOT NULL UNIQUE,
  created_by_user_id UUID NOT NULL REFERENCES public.users (id) ON DELETE RESTRICT,
  total_amount NUMERIC NOT NULL DEFAULT 0.00,
  currency TEXT NOT NULL DEFAULT 'MYR',
  total_commissions INTEGER NOT NULL DEFAULT 0,
  total_partners INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'approved', 'paid', 'cancelled')),
  payment_reference TEXT,
  payment_notes TEXT,
  paid_at TIMESTAMPTZ,
  paid_by_user_id UUID REFERENCES public.users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_sales_payout_batches_status ON public.sales_payout_batches (status);
CREATE INDEX IF NOT EXISTS idx_sales_payout_batches_ref ON public.sales_payout_batches (batch_reference);

-- 3. Create sales_commissions table (authoritative immutable commission ledger)
CREATE TABLE IF NOT EXISTS public.sales_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_partner_id UUID NOT NULL REFERENCES public.sales_partner_profiles (id) ON DELETE RESTRICT,
  partner_user_id UUID NOT NULL REFERENCES public.users (id) ON DELETE RESTRICT,
  customer_attribution_id UUID NOT NULL REFERENCES public.customer_attributions (id) ON DELETE RESTRICT,
  organization_id UUID NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  event_id UUID NOT NULL UNIQUE REFERENCES public.events (id) ON DELETE CASCADE,
  opportunity_id UUID REFERENCES public.sales_opportunities (id) ON DELETE SET NULL,
  order_type TEXT NOT NULL CHECK (order_type IN ('first_order', 'repeat_order', 'approved_opportunity')),
  event_price NUMERIC NOT NULL DEFAULT 0.00,
  promo_discount_amount NUMERIC NOT NULL DEFAULT 0.00,
  cash_collected_amount NUMERIC NOT NULL DEFAULT 0.00,
  commission_rate NUMERIC NOT NULL,
  commission_amount NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'MYR',
  status TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'approved', 'paid', 'voided', 'clawback')),
  eligibility_date TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  event_start_date TEXT,
  event_end_date TEXT,
  notes TEXT,
  approved_by_user_id UUID REFERENCES public.users (id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  payout_batch_id UUID REFERENCES public.sales_payout_batches (id) ON DELETE SET NULL,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_sales_commissions_partner ON public.sales_commissions (sales_partner_id);
CREATE INDEX IF NOT EXISTS idx_sales_commissions_org ON public.sales_commissions (organization_id);
CREATE INDEX IF NOT EXISTS idx_sales_commissions_status ON public.sales_commissions (status);
CREATE INDEX IF NOT EXISTS idx_sales_commissions_batch ON public.sales_commissions (payout_batch_id);
CREATE INDEX IF NOT EXISTS idx_sales_commissions_eligibility ON public.sales_commissions (eligibility_date);

-- 4. Create sales_commission_audit_logs table
CREATE TABLE IF NOT EXISTS public.sales_commission_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commission_id UUID NOT NULL REFERENCES public.sales_commissions (id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('CREATED', 'APPROVED', 'VOIDED', 'CLAWBACK', 'BATCHED', 'PAID', 'ADJUSTED')),
  previous_status TEXT,
  new_status TEXT NOT NULL,
  previous_amount NUMERIC,
  new_amount NUMERIC,
  actor_user_id UUID REFERENCES public.users (id) ON DELETE SET NULL,
  reason TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_commission_audit_commission ON public.sales_commission_audit_logs (commission_id);
CREATE INDEX IF NOT EXISTS idx_commission_audit_created ON public.sales_commission_audit_logs (created_at);

-- 5. Row Level Security
ALTER TABLE public.sales_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_payout_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_commission_audit_logs ENABLE ROW LEVEL SECURITY;

-- Partners view own opportunities
DROP POLICY IF EXISTS "Partners view own opportunities" ON public.sales_opportunities;
CREATE POLICY "Partners view own opportunities"
  ON public.sales_opportunities
  FOR SELECT
  USING (auth.uid() = partner_user_id);

-- Partners view own commissions
DROP POLICY IF EXISTS "Partners view own commissions" ON public.sales_commissions;
CREATE POLICY "Partners view own commissions"
  ON public.sales_commissions
  FOR SELECT
  USING (auth.uid() = partner_user_id);

-- Developers view all
DROP POLICY IF EXISTS "Developers view all opportunities" ON public.sales_opportunities;
CREATE POLICY "Developers view all opportunities"
  ON public.sales_opportunities
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.is_developer = true
    )
  );

DROP POLICY IF EXISTS "Developers view all commissions" ON public.sales_commissions;
CREATE POLICY "Developers view all commissions"
  ON public.sales_commissions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.is_developer = true
    )
  );

DROP POLICY IF EXISTS "Developers view all payout batches" ON public.sales_payout_batches;
CREATE POLICY "Developers view all payout batches"
  ON public.sales_payout_batches
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.is_developer = true
    )
  );

DROP POLICY IF EXISTS "Developers view all commission audit logs" ON public.sales_commission_audit_logs;
CREATE POLICY "Developers view all commission audit logs"
  ON public.sales_commission_audit_logs
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.is_developer = true
    )
  );
