-- Migration: 20261016000000_phase7_sales_partner_admin_and_audit_logs.sql
-- Description: Phase 7 — Sales Partner administration, custom commission rate overrides,
--              status lifecycle management, and audit log tracking.

-- 1. Add optional commission rate overrides to sales_partner_profiles with check constraints
ALTER TABLE public.sales_partner_profiles
  ADD COLUMN IF NOT EXISTS custom_commission_rate NUMERIC(5,4) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS first_order_commission_rate NUMERIC(5,4) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS repeat_order_commission_rate NUMERIC(5,4) DEFAULT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_custom_commission_rate_range'
  ) THEN
    ALTER TABLE public.sales_partner_profiles
      ADD CONSTRAINT check_custom_commission_rate_range
      CHECK (custom_commission_rate IS NULL OR (custom_commission_rate >= 0.0000 AND custom_commission_rate <= 0.5000));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_first_order_commission_rate_range'
  ) THEN
    ALTER TABLE public.sales_partner_profiles
      ADD CONSTRAINT check_first_order_commission_rate_range
      CHECK (first_order_commission_rate IS NULL OR (first_order_commission_rate >= 0.0000 AND first_order_commission_rate <= 0.5000));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_repeat_order_commission_rate_range'
  ) THEN
    ALTER TABLE public.sales_partner_profiles
      ADD CONSTRAINT check_repeat_order_commission_rate_range
      CHECK (repeat_order_commission_rate IS NULL OR (repeat_order_commission_rate >= 0.0000 AND repeat_order_commission_rate <= 0.5000));
  END IF;
END $$;

-- 2. Create sales_partner_audit_logs table with RESTRICT foreign keys to prevent unintended loss of governance history
CREATE TABLE IF NOT EXISTS public.sales_partner_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_user_id UUID NOT NULL REFERENCES public.users (id) ON DELETE RESTRICT,
  sales_partner_id UUID NOT NULL,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_user_id UUID REFERENCES public.users (id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Safeguard: If partner_user_id foreign key constraint previously had ON DELETE CASCADE, replace with RESTRICT
DO $$
DECLARE
  v_conname TEXT;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sales_partner_audit_logs'
  ) THEN
    SELECT c.conname INTO v_conname
    FROM pg_constraint c
    WHERE c.conrelid = 'public.sales_partner_audit_logs'::regclass
      AND c.contype = 'f'
      AND EXISTS (
        SELECT 1 FROM unnest(c.conkey) k
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k
        WHERE a.attname = 'partner_user_id'
      )
      AND c.confdeltype = 'c'; -- 'c' = CASCADE

    IF v_conname IS NOT NULL THEN
      EXECUTE 'ALTER TABLE public.sales_partner_audit_logs DROP CONSTRAINT ' || quote_ident(v_conname);
      EXECUTE 'ALTER TABLE public.sales_partner_audit_logs ADD CONSTRAINT ' || quote_ident(v_conname) || ' FOREIGN KEY (partner_user_id) REFERENCES public.users(id) ON DELETE RESTRICT';
    END IF;
  END IF;
END $$;

-- 3. Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_sales_partner_audit_user ON public.sales_partner_audit_logs (partner_user_id);
CREATE INDEX IF NOT EXISTS idx_sales_partner_audit_partner ON public.sales_partner_audit_logs (sales_partner_id);
CREATE INDEX IF NOT EXISTS idx_sales_partner_audit_created ON public.sales_partner_audit_logs (created_at DESC);

-- 4. Enable Row Level Security
ALTER TABLE public.sales_partner_audit_logs ENABLE ROW LEVEL SECURITY;

-- 5. Policies: Only developer admins can select audit logs. No ordinary partner access to private audit metadata.
DROP POLICY IF EXISTS "Developer admins view all partner audit logs" ON public.sales_partner_audit_logs;
CREATE POLICY "Developer admins view all partner audit logs"
  ON public.sales_partner_audit_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.is_developer = true
    )
  );

REVOKE INSERT, UPDATE, DELETE ON public.sales_partner_audit_logs FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.sales_partner_audit_logs FROM anon;
GRANT SELECT ON public.sales_partner_audit_logs TO authenticated;
GRANT ALL ON public.sales_partner_audit_logs TO service_role;

-- 6. Atomic RPC function for updating sales partner status and writing audit log atomically
CREATE OR REPLACE FUNCTION public.update_sales_partner_status_atomic(
  p_user_id UUID,
  p_status TEXT,
  p_admin_notes TEXT DEFAULT NULL,
  p_actor_user_id UUID DEFAULT NULL,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_profile RECORD;
  v_prev_status TEXT;
  v_action TEXT;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
BEGIN
  IF p_status NOT IN ('pending', 'active', 'suspended', 'rejected') THEN
    RAISE EXCEPTION 'Invalid status: %', p_status;
  END IF;

  SELECT * INTO v_profile
  FROM public.sales_partner_profiles
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sales partner profile not found for user %', p_user_id;
  END IF;

  v_prev_status := v_profile.status;

  IF (p_status IN ('suspended', 'rejected') OR (v_prev_status IN ('suspended', 'rejected') AND p_status = 'active')) AND (p_reason IS NULL OR trim(p_reason) = '') THEN
    RAISE EXCEPTION 'A non-empty reason is required for consequential status changes';
  END IF;

  IF v_prev_status = 'pending' AND p_status = 'active' THEN
    v_action := 'ACTIVATED';
  ELSIF (v_prev_status = 'suspended' OR v_prev_status = 'rejected') AND p_status = 'active' THEN
    v_action := 'REACTIVATED';
  ELSIF p_status = 'suspended' THEN
    v_action := 'SUSPENDED';
  ELSIF p_status = 'rejected' THEN
    v_action := 'REJECTED';
  ELSE
    v_action := 'UPDATED';
  END IF;

  UPDATE public.sales_partner_profiles
  SET
    status = p_status,
    admin_notes = COALESCE(p_admin_notes, admin_notes),
    activated_at = CASE WHEN p_status = 'active' AND activated_at IS NULL THEN v_now ELSE activated_at END,
    suspended_at = CASE WHEN p_status = 'suspended' THEN v_now WHEN p_status = 'active' THEN NULL ELSE suspended_at END,
    updated_at = v_now
  WHERE user_id = p_user_id;

  INSERT INTO public.sales_partner_audit_logs (
    partner_user_id,
    sales_partner_id,
    previous_status,
    new_status,
    action,
    actor_user_id,
    reason,
    metadata,
    created_at
  ) VALUES (
    p_user_id,
    v_profile.id,
    v_prev_status,
    p_status,
    v_action,
    p_actor_user_id,
    COALESCE(p_reason, p_admin_notes, 'Status updated'),
    jsonb_build_object('admin_notes', p_admin_notes),
    v_now
  );

  SELECT * INTO v_profile FROM public.sales_partner_profiles WHERE user_id = p_user_id;
  RETURN to_jsonb(v_profile);
END;
$$;

-- 7. Atomic RPC function for updating sales partner rates and writing audit log atomically
CREATE OR REPLACE FUNCTION public.update_sales_partner_rates_atomic(
  p_user_id UUID,
  p_custom_rate NUMERIC,
  p_first_order_rate NUMERIC,
  p_repeat_order_rate NUMERIC,
  p_actor_user_id UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_profile RECORD;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
BEGIN
  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RAISE EXCEPTION 'A non-empty reason is required to update commission rates';
  END IF;

  IF p_custom_rate IS NOT NULL AND (p_custom_rate < 0.0000 OR p_custom_rate > 0.5000) THEN
    RAISE EXCEPTION 'Custom commission rate must be between 0.00 and 0.50';
  END IF;
  IF p_first_order_rate IS NOT NULL AND (p_first_order_rate < 0.0000 OR p_first_order_rate > 0.5000) THEN
    RAISE EXCEPTION 'First order commission rate must be between 0.00 and 0.50';
  END IF;
  IF p_repeat_order_rate IS NOT NULL AND (p_repeat_order_rate < 0.0000 OR p_repeat_order_rate > 0.5000) THEN
    RAISE EXCEPTION 'Repeat order commission rate must be between 0.00 and 0.50';
  END IF;

  SELECT * INTO v_profile
  FROM public.sales_partner_profiles
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sales partner profile not found for user %', p_user_id;
  END IF;

  UPDATE public.sales_partner_profiles
  SET
    custom_commission_rate = p_custom_rate,
    first_order_commission_rate = p_first_order_rate,
    repeat_order_commission_rate = p_repeat_order_rate,
    updated_at = v_now
  WHERE user_id = p_user_id;

  INSERT INTO public.sales_partner_audit_logs (
    partner_user_id,
    sales_partner_id,
    previous_status,
    new_status,
    action,
    actor_user_id,
    reason,
    metadata,
    created_at
  ) VALUES (
    p_user_id,
    v_profile.id,
    v_profile.status,
    v_profile.status,
    'RATE_CHANGED',
    p_actor_user_id,
    p_reason,
    jsonb_build_object(
      'previous_custom_rate', v_profile.custom_commission_rate,
      'previous_first_order_rate', v_profile.first_order_commission_rate,
      'previous_repeat_order_rate', v_profile.repeat_order_commission_rate,
      'new_custom_rate', p_custom_rate,
      'new_first_order_rate', p_first_order_rate,
      'new_repeat_order_rate', p_repeat_order_rate
    ),
    v_now
  );

  SELECT * INTO v_profile FROM public.sales_partner_profiles WHERE user_id = p_user_id;
  RETURN to_jsonb(v_profile);
END;
$$;

REVOKE ALL ON FUNCTION public.update_sales_partner_status_atomic(UUID, TEXT, TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_sales_partner_status_atomic(UUID, TEXT, TEXT, UUID, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.update_sales_partner_rates_atomic(UUID, NUMERIC, NUMERIC, NUMERIC, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_sales_partner_rates_atomic(UUID, NUMERIC, NUMERIC, NUMERIC, UUID, TEXT) TO service_role;

-- 8. Enhance create_sales_commission_atomic to apply exceptional partner commission rates
CREATE OR REPLACE FUNCTION public.create_sales_commission_atomic(
  p_event_id UUID,
  p_actor_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_event RECORD;
  v_attribution RECORD;
  v_partner RECORD;
  v_opportunity RECORD;
  v_prior_first_comm RECORD;
  v_order_type TEXT;
  v_rate NUMERIC;
  v_cash NUMERIC;
  v_promo NUMERIC;
  v_price NUMERIC;
  v_comm_amount NUMERIC;
  v_comm_id UUID;
  v_opportunity_id UUID := NULL;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
  v_order_time TIMESTAMPTZ;
  v_first_qualifying_date TIMESTAMPTZ;
  v_window_end TIMESTAMPTZ;
BEGIN
  -- 1. Check if commission already exists for this event
  IF EXISTS (
    SELECT 1 FROM public.sales_commissions
    WHERE event_id = p_event_id AND status <> 'voided'
  ) THEN
    RETURN jsonb_build_object(
      'success', true,
      'eligible', false,
      'error', 'Commission already evaluated and exists for this event'
    );
  END IF;

  -- 2. Lock event record and verify payment
  SELECT * INTO v_event
  FROM public.events
  WHERE id = p_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'eligible', false,
      'error', 'Event not found'
    );
  END IF;

  IF UPPER(COALESCE(v_event.payment_status, '')) <> 'PAID' THEN
    RETURN jsonb_build_object(
      'success', false,
      'eligible', false,
      'error', 'Event payment status is not PAID'
    );
  END IF;

  IF LOWER(COALESCE(v_event.status, '')) = 'cancelled' OR
     UPPER(COALESCE(v_event.event_status, '')) = 'CANCELLED' THEN
    RETURN jsonb_build_object(
      'success', false,
      'eligible', false,
      'error', 'Event is cancelled'
    );
  END IF;

  -- Cash revenue basis calculation
  v_cash := COALESCE(v_event.paid_amount, 0);
  v_promo := COALESCE(v_event.discount_amount, 0);
  v_price := COALESCE(v_event.event_price, v_cash + v_promo);

  IF v_cash <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'eligible', false,
      'error', 'No commissionable cash revenue (order was funded solely by promotional credits or free)'
    );
  END IF;

  -- 3. Verify Customer Attribution
  SELECT * INTO v_attribution
  FROM public.customer_attributions
  WHERE organization_id = v_event.organization_id AND status = 'approved'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'eligible', false,
      'error', 'Organization does not have an approved Sales Partner attribution'
    );
  END IF;

  IF v_attribution.is_self_referral IS TRUE THEN
    RETURN jsonb_build_object(
      'success', false,
      'eligible', false,
      'error', 'Attribution is marked as self-referral'
    );
  END IF;

  -- 4. Verify Sales Partner profile status
  SELECT * INTO v_partner
  FROM public.sales_partner_profiles
  WHERE id = v_attribution.sales_partner_id;

  IF NOT FOUND OR v_partner.status <> 'active' THEN
    RETURN jsonb_build_object(
      'success', false,
      'eligible', false,
      'error', 'Sales Partner profile is not active'
    );
  END IF;

  -- 5. Determine order placement time
  SELECT created_at INTO v_order_time
  FROM public.wallet_transactions
  WHERE event_id = p_event_id AND transaction_type = 'PAYMENT'
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_order_time IS NULL THEN
    v_order_time := COALESCE(v_event.created_at, v_now);
  END IF;

  -- 6. Check for prior non-voided commissions for this organization
  SELECT * INTO v_prior_first_comm
  FROM public.sales_commissions
  WHERE organization_id = v_event.organization_id AND status <> 'voided' AND event_id <> p_event_id
  ORDER BY eligibility_date ASC
  LIMIT 1;

  IF NOT FOUND THEN
    -- First qualifying order
    v_order_type := 'first_order';
    v_rate := 0.10;
  ELSE
    -- Has prior commission. Check 12-month window from the first qualifying order's eligibility date
    v_first_qualifying_date := v_prior_first_comm.eligibility_date;
    v_window_end := v_first_qualifying_date + INTERVAL '12 months';

    IF v_order_time <= v_window_end THEN
      v_order_type := 'repeat_order';
      v_rate := 0.05;
    ELSE
      -- Window expired: require pre-approved sales opportunity
      SELECT * INTO v_opportunity
      FROM public.sales_opportunities
      WHERE sales_partner_id = v_attribution.sales_partner_id
        AND organization_id = v_event.organization_id
        AND status = 'approved'
        AND decided_at IS NOT NULL
        AND decided_at < v_order_time
        AND (valid_until IS NULL OR valid_until >= v_order_time)
      ORDER BY decided_at ASC
      FOR UPDATE
      LIMIT 1;

      IF NOT FOUND THEN
        RETURN jsonb_build_object(
          'success', false,
          'eligible', false,
          'error', 'Repeat order window has expired (>12 months) and no admin pre-approved sales opportunity exists prior to order placement'
        );
      END IF;

      v_order_type := 'approved_opportunity';
      v_rate := 0.05;
      v_opportunity_id := v_opportunity.id;

      -- Mark opportunity as consumed atomically
      UPDATE public.sales_opportunities
      SET status = 'consumed',
          updated_at = v_now,
          decision_notes = COALESCE(decision_notes, '') || ' [Consumed by event ' || p_event_id::text || ']'
      WHERE id = v_opportunity.id;
    END IF;
  END IF;

  -- 7. Apply exceptional partner commission rate overrides (Phase 7 precedence hierarchy)
  IF v_order_type = 'first_order' AND v_partner.first_order_commission_rate IS NOT NULL THEN
    v_rate := v_partner.first_order_commission_rate;
  ELSIF v_order_type <> 'first_order' AND v_partner.repeat_order_commission_rate IS NOT NULL THEN
    v_rate := v_partner.repeat_order_commission_rate;
  ELSIF v_partner.custom_commission_rate IS NOT NULL THEN
    v_rate := v_partner.custom_commission_rate;
  END IF;

  v_comm_amount := ROUND((v_cash * v_rate), 2);
  v_comm_id := gen_random_uuid();

  -- 8. Insert into sales_commissions
  INSERT INTO public.sales_commissions (
    id,
    sales_partner_id,
    partner_user_id,
    customer_attribution_id,
    organization_id,
    event_id,
    opportunity_id,
    order_type,
    event_price,
    promo_discount_amount,
    cash_collected_amount,
    commission_rate,
    commission_amount,
    original_commission_rate,
    original_commission_amount,
    calculation_version,
    currency,
    status,
    eligibility_date,
    order_placement_date,
    payment_date,
    event_start_date,
    event_end_date,
    notes,
    created_at,
    updated_at
  ) VALUES (
    v_comm_id,
    v_attribution.sales_partner_id,
    v_attribution.partner_user_id,
    v_attribution.id,
    v_event.organization_id,
    p_event_id,
    v_opportunity_id,
    v_order_type,
    v_price,
    v_promo,
    v_cash,
    v_rate,
    v_comm_amount,
    v_rate,
    v_comm_amount,
    1,
    COALESCE(v_event.event_currency, 'MYR'),
    'pending_review',
    v_now,
    v_order_time,
    v_now,
    v_event.start_date,
    v_event.end_date,
    v_order_type || ' qualifying event commission (' || (v_rate * 100)::text || '% on RM' || v_cash::text || ' cash)',
    v_now,
    v_now
  );

  -- 9. Insert audit log
  INSERT INTO public.sales_commission_audit_logs (
    id,
    commission_id,
    action,
    previous_status,
    new_status,
    previous_amount,
    new_amount,
    actor_user_id,
    reason,
    metadata,
    created_at
  ) VALUES (
    gen_random_uuid(),
    v_comm_id,
    'CREATED',
    NULL,
    'pending_review',
    NULL,
    v_comm_amount,
    p_actor_user_id,
    'Initial commission calculation',
    jsonb_build_object(
      'order_type', v_order_type,
      'commission_rate', v_rate,
      'cash_collected_amount', v_cash,
      'promo_discount_amount', v_promo,
      'event_price', v_price,
      'order_placement_date', v_order_time
    ),
    v_now
  );

  RETURN jsonb_build_object(
    'success', true,
    'eligible', true,
    'commission_id', v_comm_id,
    'order_type', v_order_type,
    'commission_rate', v_rate,
    'commission_amount', v_comm_amount,
    'cash_collected', v_cash,
    'status', 'pending_review'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_sales_commission_atomic(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_sales_commission_atomic(UUID, UUID) TO service_role;

