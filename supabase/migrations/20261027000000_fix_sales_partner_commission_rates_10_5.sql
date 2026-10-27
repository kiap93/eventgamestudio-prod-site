-- Migration: 20261027000000_fix_sales_partner_commission_rates_10_5.sql
-- Description: Ensure authoritative Sales Partner commission rates are 10% (0.10) for first
--              qualifying events and 5% (0.05) for repeat qualifying events within 12 months.
--              Safely repairs any stale 15% / 10% platform settings defaults without modifying
--              deliberately customized partner rate overrides or historical finalized commissions.

-- ==============================================================================
-- 1. ENSURE AUTHORITATIVE PLATFORM COMMISSION SETTINGS (10% FIRST / 5% REPEAT)
-- ==============================================================================
DO $$
DECLARE
  v_existing JSONB;
  v_first_rate NUMERIC;
  v_repeat_rate NUMERIC;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'platform_settings'
  ) THEN
    SELECT value INTO v_existing
    FROM public.platform_settings
    WHERE key = 'sales_commission_settings';

    IF NOT FOUND OR v_existing IS NULL THEN
      INSERT INTO public.platform_settings (key, value, updated_at)
      VALUES (
        'sales_commission_settings',
        jsonb_build_object(
          'first_order_commission_rate', 0.10,
          'repeat_order_commission_rate', 0.05,
          'repeat_window_months', 12,
          'require_delivery_completion', true,
          'minimum_payout_amount', 100.00,
          'updated_at', to_jsonb(v_now)
        ),
        v_now
      )
      ON CONFLICT (key) DO NOTHING;
    ELSE
      BEGIN
        v_first_rate := (v_existing->>'first_order_commission_rate')::NUMERIC;
        v_repeat_rate := (v_existing->>'repeat_order_commission_rate')::NUMERIC;
      EXCEPTION WHEN OTHERS THEN
        v_first_rate := 0.10;
        v_repeat_rate := 0.05;
      END;

      -- Normalize whole-number percentages if accidentally stored (e.g. 10 -> 0.10, 5 -> 0.05)
      IF v_first_rate > 1 AND v_first_rate <= 100 THEN
        v_first_rate := v_first_rate / 100.0;
      END IF;
      IF v_repeat_rate > 1 AND v_repeat_rate <= 100 THEN
        v_repeat_rate := v_repeat_rate / 100.0;
      END IF;

      -- Repair stale 15% / 10% default rates to 10% / 5%
      IF (v_first_rate = 0.15 AND v_repeat_rate = 0.10) OR
         v_first_rate IS NULL OR v_repeat_rate IS NULL THEN
        v_first_rate := 0.10;
        v_repeat_rate := 0.05;
      END IF;

      UPDATE public.platform_settings
      SET
        value = v_existing || jsonb_build_object(
          'first_order_commission_rate', ROUND(v_first_rate, 4),
          'repeat_order_commission_rate', ROUND(v_repeat_rate, 4),
          'repeat_window_months', COALESCE((v_existing->>'repeat_window_months')::INTEGER, 12)
        ),
        updated_at = v_now
      WHERE key = 'sales_commission_settings';
    END IF;
  END IF;
END $$;

-- ==============================================================================
-- 2. CLEAN STALE UNCUSTOMIZED PARTNER DEFAULT RATES (IF ANY)
-- ==============================================================================
-- Only clear 0.15 / 0.10 on sales_partner_profiles if NO explicit admin RATE_UPDATED
-- audit log exists for that partner. Deliberately customized partner rates are preserved.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'sales_partner_profiles'
  ) THEN
    UPDATE public.sales_partner_profiles sp
    SET
      first_order_commission_rate = NULL,
      repeat_order_commission_rate = NULL,
      updated_at = timezone('utc'::text, now())
    WHERE sp.first_order_commission_rate = 0.1500
      AND sp.repeat_order_commission_rate = 0.1000
      AND NOT EXISTS (
        SELECT 1
        FROM public.sales_partner_audit_logs al
        WHERE (al.sales_partner_id = sp.id OR al.partner_user_id = sp.user_id)
          AND al.action = 'RATE_UPDATED'
      );
  END IF;
END $$;

-- ==============================================================================
-- 3. UPDATE ATOMIC COMMISSION EVALUATION RPC TO USE PLATFORM SETTINGS (10% / 5%)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.create_sales_commission_atomic(
  p_event_id UUID
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
  v_prior_first_comm RECORD;
  v_opportunity RECORD;
  v_cash NUMERIC;
  v_promo NUMERIC;
  v_price NUMERIC;
  v_order_type TEXT;
  v_rate NUMERIC;
  v_comm_amount NUMERIC;
  v_comm_id UUID;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
  v_order_time TIMESTAMPTZ;
  v_first_qualifying_date TIMESTAMPTZ;
  v_window_end TIMESTAMPTZ;
  v_opportunity_id UUID := NULL;
  v_settings JSONB := NULL;
  v_default_first_rate NUMERIC := 0.10;
  v_default_repeat_rate NUMERIC := 0.05;
  v_repeat_window_months INTEGER := 12;
BEGIN
  -- 1. Check idempotency: does a non-voided commission already exist for this event?
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

  -- Cash revenue basis calculation (strictly excluding promotional credits)
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

  -- 5. Resolve authoritative platform baseline rates (Default: 10% first event, 5% repeat event, 12 months)
  BEGIN
    SELECT value INTO v_settings
    FROM public.platform_settings
    WHERE key = 'sales_commission_settings';

    IF v_settings IS NOT NULL THEN
      v_default_first_rate := COALESCE((v_settings->>'first_order_commission_rate')::NUMERIC, 0.10);
      v_default_repeat_rate := COALESCE((v_settings->>'repeat_order_commission_rate')::NUMERIC, 0.05);
      v_repeat_window_months := COALESCE((v_settings->>'repeat_window_months')::INTEGER, 12);

      IF v_default_first_rate > 1 AND v_default_first_rate <= 100 THEN
        v_default_first_rate := v_default_first_rate / 100.0;
      END IF;
      IF v_default_repeat_rate > 1 AND v_default_repeat_rate <= 100 THEN
        v_default_repeat_rate := v_default_repeat_rate / 100.0;
      END IF;
      IF v_default_first_rate < 0 OR v_default_first_rate > 0.50 THEN
        v_default_first_rate := 0.10;
      END IF;
      IF v_default_repeat_rate < 0 OR v_default_repeat_rate > 0.50 THEN
        v_default_repeat_rate := 0.05;
      END IF;
      IF v_repeat_window_months < 1 OR v_repeat_window_months > 60 THEN
        v_repeat_window_months := 12;
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_default_first_rate := 0.10;
    v_default_repeat_rate := 0.05;
    v_repeat_window_months := 12;
  END;

  -- 6. Determine order placement time
  SELECT created_at INTO v_order_time
  FROM public.wallet_transactions
  WHERE event_id = p_event_id AND transaction_type = 'PAYMENT'
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_order_time IS NULL THEN
    v_order_time := COALESCE(v_event.created_at, v_now);
  END IF;

  -- 7. Check for prior non-voided commissions for this organization
  SELECT * INTO v_prior_first_comm
  FROM public.sales_commissions
  WHERE organization_id = v_event.organization_id AND status <> 'voided' AND event_id <> p_event_id
  ORDER BY eligibility_date ASC
  LIMIT 1;

  IF NOT FOUND THEN
    -- First qualifying order (10% default)
    v_order_type := 'first_order';
    v_rate := v_default_first_rate;
  ELSE
    -- Has prior commission. Check repeat window from the first qualifying order's eligibility date
    v_first_qualifying_date := v_prior_first_comm.eligibility_date;
    v_window_end := v_first_qualifying_date + make_interval(months => v_repeat_window_months);

    IF v_order_time <= v_window_end THEN
      v_order_type := 'repeat_order';
      v_rate := v_default_repeat_rate;
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
      v_rate := v_default_repeat_rate;
      v_opportunity_id := v_opportunity.id;

      -- Mark opportunity as consumed atomically
      UPDATE public.sales_opportunities
      SET status = 'consumed',
          updated_at = v_now,
          decision_notes = COALESCE(decision_notes, '') || ' [Consumed by event ' || p_event_id::text || ']'
      WHERE id = v_opportunity.id;
    END IF;
  END IF;

  -- 8. Apply exceptional partner commission rate overrides (Phase 7 precedence hierarchy)
  IF v_order_type = 'first_order' AND v_partner.first_order_commission_rate IS NOT NULL THEN
    v_rate := v_partner.first_order_commission_rate;
  ELSIF v_order_type <> 'first_order' AND v_partner.repeat_order_commission_rate IS NOT NULL THEN
    v_rate := v_partner.repeat_order_commission_rate;
  ELSIF v_partner.custom_commission_rate IS NOT NULL THEN
    v_rate := v_partner.custom_commission_rate;
  END IF;

  v_comm_amount := ROUND((v_cash * v_rate), 2);
  v_comm_id := gen_random_uuid();

  -- 9. Insert into sales_commissions
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
    v_order_time,
    v_event.start_date,
    v_event.end_date,
    CASE
      WHEN v_order_type = 'first_order' THEN 'First qualifying event order (' || ROUND(v_rate * 100, 2)::text || '% on cash collected)'
      WHEN v_order_type = 'repeat_order' THEN 'Repeat qualifying event order within ' || v_repeat_window_months::text || '-month window (' || ROUND(v_rate * 100, 2)::text || '% on cash collected)'
      ELSE 'Pre-approved post-12-month sales opportunity (' || ROUND(v_rate * 100, 2)::text || '% on cash collected)'
    END,
    v_now,
    v_now
  );

  -- 10. Insert immutable audit log entry
  INSERT INTO public.sales_commission_audit_logs (
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
    v_comm_id,
    'CREATED',
    NULL,
    'pending_review',
    NULL,
    v_comm_amount,
    NULL,
    'Automated commission calculation on verified event payment',
    jsonb_build_object(
      'order_type', v_order_type,
      'cash_collected_amount', v_cash,
      'promo_discount_amount', v_promo,
      'commission_rate', v_rate,
      'partner_first_order_override', v_partner.first_order_commission_rate,
      'partner_repeat_order_override', v_partner.repeat_order_commission_rate,
      'partner_custom_override', v_partner.custom_commission_rate,
      'opportunity_id', v_opportunity_id
    ),
    v_now
  );

  RETURN jsonb_build_object(
    'success', true,
    'eligible', true,
    'commission_id', v_comm_id,
    'order_type', v_order_type,
    'commission_rate', v_rate,
    'commission_amount', v_comm_amount
  );
END;
$$;
