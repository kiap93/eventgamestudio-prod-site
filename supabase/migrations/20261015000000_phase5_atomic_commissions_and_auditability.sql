-- Migration: 20261015000000_phase5_atomic_commissions_and_auditability.sql
-- Description: Phase 5 — Enhances sales_commissions with original calculation preservation,
--              partial unique index for single first_order rate, verified order dates,
--              delivery completion tracking, and atomic creation function.

-- 1. Ensure columns exist on public.sales_commissions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sales_commissions' AND column_name = 'original_commission_amount'
  ) THEN
    ALTER TABLE public.sales_commissions ADD COLUMN original_commission_amount NUMERIC NOT NULL DEFAULT 0.00;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sales_commissions' AND column_name = 'original_commission_rate'
  ) THEN
    ALTER TABLE public.sales_commissions ADD COLUMN original_commission_rate NUMERIC NOT NULL DEFAULT 0.00;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sales_commissions' AND column_name = 'calculation_version'
  ) THEN
    ALTER TABLE public.sales_commissions ADD COLUMN calculation_version INTEGER NOT NULL DEFAULT 1;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sales_commissions' AND column_name = 'adjustment_amount'
  ) THEN
    ALTER TABLE public.sales_commissions ADD COLUMN adjustment_amount NUMERIC NOT NULL DEFAULT 0.00;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sales_commissions' AND column_name = 'adjustment_reason'
  ) THEN
    ALTER TABLE public.sales_commissions ADD COLUMN adjustment_reason TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sales_commissions' AND column_name = 'order_placement_date'
  ) THEN
    ALTER TABLE public.sales_commissions ADD COLUMN order_placement_date TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sales_commissions' AND column_name = 'payment_date'
  ) THEN
    ALTER TABLE public.sales_commissions ADD COLUMN payment_date TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sales_commissions' AND column_name = 'refund_reference'
  ) THEN
    ALTER TABLE public.sales_commissions ADD COLUMN refund_reference TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sales_commissions' AND column_name = 'event_completion_date'
  ) THEN
    ALTER TABLE public.sales_commissions ADD COLUMN event_completion_date TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sales_commissions' AND column_name = 'is_delivery_completed'
  ) THEN
    ALTER TABLE public.sales_commissions ADD COLUMN is_delivery_completed BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

-- 2. Partial unique index to enforce that an organization can have AT MOST ONE active 'first_order' commission
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_first_order_commission_per_org
  ON public.sales_commissions (organization_id)
  WHERE order_type = 'first_order' AND status != 'voided';

-- 3. Indexes for fast lookup on order placement and event completion
CREATE INDEX IF NOT EXISTS idx_sales_commissions_order_placement ON public.sales_commissions (order_placement_date);
CREATE INDEX IF NOT EXISTS idx_sales_commissions_event_completion ON public.sales_commissions (event_completion_date);

-- 4. Atomic PostgreSQL function for commission evaluation and creation
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
  v_existing_comm RECORD;
  v_prior_first_comm RECORD;
  v_first_qualifying_date TIMESTAMPTZ;
  v_window_end TIMESTAMPTZ;
  v_order_type TEXT;
  v_rate NUMERIC;
  v_cash NUMERIC;
  v_promo NUMERIC;
  v_price NUMERIC;
  v_comm_amount NUMERIC;
  v_comm_id UUID;
  v_opportunity RECORD;
  v_opportunity_id UUID := NULL;
  v_order_time TIMESTAMPTZ;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
BEGIN
  -- 1. Check if commission already recorded for this event (Idempotency)
  SELECT * INTO v_existing_comm
  FROM public.sales_commissions
  WHERE event_id = p_event_id;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'eligible', true,
      'commission_id', v_existing_comm.id,
      'status', v_existing_comm.status,
      'message', 'Commission already recorded for this event (idempotent)'
    );
  END IF;

  -- 2. Fetch and lock event
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

  -- Verify event payment status
  IF v_event.payment_status <> 'PAID' THEN
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
  -- Look for earliest payment transaction in wallet_transactions for this event
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

  v_comm_amount := ROUND((v_cash * v_rate), 2);
  v_comm_id := gen_random_uuid();

  -- 7. Insert into sales_commissions
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

  -- 8. Insert audit log
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
