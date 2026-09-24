-- Migration: 20260930000000_fix_coalesce_date_type_mismatch_in_payment_and_pricing.sql
-- Description: Fix "COALESCE types text and date cannot be matched" error in process_event_payment_atomic and calculate_event_authoritative_price.
-- Events table columns start_date, end_date, and event_date are stored as TEXT in PostgreSQL.
-- When passed to COALESCE alongside (starts_at AT TIME ZONE tz)::date (type date), PostgreSQL rejects
-- the query due to incompatible types.
-- This migration standardizes explicit date extraction using regex and substring before passing to COALESCE.

-- ============================================================================
-- 1. FIX process_event_payment_atomic RPC
-- ============================================================================

CREATE OR REPLACE FUNCTION public.process_event_payment_atomic(
  p_organization_id UUID,
  p_event_id UUID,
  p_payment_mode TEXT,
  p_event_price NUMERIC DEFAULT NULL,
  p_topup_credit_requested NUMERIC DEFAULT 0.00,
  p_reference_id TEXT DEFAULT NULL,
  p_created_by UUID DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_wallet public.organization_wallets%ROWTYPE;
  v_event public.events%ROWTYPE;
  v_event_price NUMERIC;
  v_credit_to_use NUMERIC := 0.00;
  v_welcome_to_use NUMERIC := 0.00;
  v_showcase_to_use NUMERIC := 0.00;
  v_topup_to_use NUMERIC := 0.00;
  v_paid_to_use NUMERIC := 0.00;
  v_credit_balance_type TEXT := NULL;
  v_credit_txn public.wallet_transactions%ROWTYPE;
  v_topup_credit_txn public.wallet_transactions%ROWTYPE;
  v_paid_txn public.wallet_transactions%ROWTYPE;
  v_credit_ref TEXT;
  v_topup_ref TEXT;
  v_paid_ref TEXT;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
  v_existing_payment public.wallet_transactions%ROWTYPE;
  v_existing_credit public.wallet_transactions%ROWTYPE;
  v_existing_payment_found BOOLEAN := false;
  v_existing_credit_found BOOLEAN := false;
  v_credit_txn_created BOOLEAN := false;
  v_topup_credit_txn_created BOOLEAN := false;
  v_paid_txn_created BOOLEAN := false;
  v_max_cap NUMERIC;
  v_req NUMERIC;
BEGIN
  -- 1. Input validations
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'Organization ID is required';
  END IF;

  IF p_event_id IS NULL THEN
    RAISE EXCEPTION 'Event ID is required';
  END IF;

  IF p_payment_mode NOT IN ('FULL_PAID', 'WELCOME_CREDIT', 'SHOWCASE_CREDIT', 'TOPUP_CREDIT', 'COMBINED_CREDIT') THEN
    RAISE EXCEPTION 'Invalid payment mode: %', p_payment_mode;
  END IF;

  -- 2. Lock & Validate Event Record (if exists in events table)
  SELECT * INTO v_event
  FROM public.events
  WHERE id = p_event_id
  FOR UPDATE;

  IF v_event.id IS NOT NULL THEN
    IF v_event.organization_id <> p_organization_id THEN
      RAISE EXCEPTION 'Security Error: Event does not belong to your organization';
    END IF;
    IF v_event.payment_status = 'PAID' THEN
      RAISE EXCEPTION 'Event is already marked as PAID';
    END IF;
    -- Server-Authoritative: Event's own stored price and currency must be valid. Fail closed if missing or invalid.
    IF v_event.event_price IS NULL OR v_event.event_price <= 0 THEN
      RAISE EXCEPTION 'PRICING_CONFIGURATION_ERROR: Event is missing a valid authoritative price.';
    END IF;
    IF v_event.event_currency IS NULL OR trim(v_event.event_currency) = '' THEN
      RAISE EXCEPTION 'PRICING_CONFIGURATION_ERROR: Event is missing a valid authoritative currency.';
    END IF;
    v_event_price := v_event.event_price;
  ELSE
    IF p_event_price IS NULL OR p_event_price <= 0 THEN
      RAISE EXCEPTION 'PRICING_CONFIGURATION_ERROR: Valid event price is required.';
    END IF;
    v_event_price := p_event_price;
  END IF;

  IF v_event_price <= 0 THEN
    RAISE EXCEPTION 'Event price must be greater than 0';
  END IF;

  -- 3. Idempotency Protection: Check if event is already paid in transaction ledger
  SELECT * INTO v_existing_payment
  FROM public.wallet_transactions
  WHERE organization_id = p_organization_id
    AND event_id = p_event_id
    AND transaction_type = 'EVENT_PAYMENT'
    AND balance_type = 'PAID_BALANCE'
    AND status = 'COMPLETED'
  LIMIT 1;
  v_existing_payment_found := FOUND;

  SELECT * INTO v_existing_credit
  FROM public.wallet_transactions
  WHERE organization_id = p_organization_id
    AND event_id = p_event_id
    AND transaction_type = 'CREDIT_USAGE'
    AND status = 'COMPLETED'
  LIMIT 1;
  v_existing_credit_found := FOUND;

  IF v_existing_payment_found OR v_existing_credit_found THEN
    SELECT * INTO v_wallet FROM public.organization_wallets WHERE organization_id = p_organization_id;

    RETURN jsonb_build_object(
      'success', true,
      'is_idempotent_replay', true,
      'event_id', p_event_id,
      'payment_mode', p_payment_mode,
      'event_price', v_event_price,
      'paid_amount', CASE WHEN v_existing_payment_found THEN COALESCE(ABS(v_existing_payment.amount), 0.00) ELSE 0.00 END,
      'discount_amount', CASE WHEN v_existing_credit_found THEN COALESCE(ABS(v_existing_credit.amount), 0.00) ELSE 0.00 END,
      'credit_transaction', CASE WHEN v_existing_credit_found THEN to_jsonb(v_existing_credit) ELSE NULL END,
      'paid_transaction', CASE WHEN v_existing_payment_found THEN to_jsonb(v_existing_payment) ELSE NULL END,
      'wallet', jsonb_build_object(
        'paid_balance', COALESCE(v_wallet.paid_balance, 0.00),
        'welcome_credit', COALESCE(v_wallet.welcome_credit, 0.00),
        'showcase_credit', COALESCE(v_wallet.showcase_credit, 0.00),
        'topup_credit', COALESCE(v_wallet.topup_credit, 0.00)
      )
    );
  END IF;

  -- 4. Lock & Validate Wallet
  SELECT * INTO v_wallet
  FROM public.organization_wallets
  WHERE organization_id = p_organization_id
  FOR UPDATE;

  IF v_wallet.organization_id IS NULL THEN
    -- Auto-initialize wallet row if not exists
    INSERT INTO public.organization_wallets (
      organization_id,
      paid_balance,
      welcome_credit,
      showcase_credit,
      topup_credit,
      updated_at
    ) VALUES (
      p_organization_id,
      0.00,
      0.00,
      0.00,
      0.00,
      v_now
    )
    RETURNING * INTO v_wallet;
  END IF;

  -- 5. Calculate Deductions by Mode
  IF p_payment_mode = 'FULL_PAID' THEN
    v_paid_to_use := v_event_price;

  ELSIF p_payment_mode = 'WELCOME_CREDIT' THEN
    v_credit_balance_type := 'WELCOME_CREDIT';
    IF COALESCE(v_wallet.welcome_credit, 0.00) >= v_event_price THEN
      v_welcome_to_use := v_event_price;
      v_credit_to_use := v_event_price;
    ELSE
      v_welcome_to_use := COALESCE(v_wallet.welcome_credit, 0.00);
      v_credit_to_use := v_welcome_to_use;
      v_paid_to_use := v_event_price - v_credit_to_use;
    END IF;

  ELSIF p_payment_mode = 'SHOWCASE_CREDIT' THEN
    v_credit_balance_type := 'SHOWCASE_CREDIT';
    IF COALESCE(v_wallet.showcase_credit, 0.00) >= v_event_price THEN
      v_showcase_to_use := v_event_price;
      v_credit_to_use := v_event_price;
    ELSE
      v_showcase_to_use := COALESCE(v_wallet.showcase_credit, 0.00);
      v_credit_to_use := v_showcase_to_use;
      v_paid_to_use := v_event_price - v_credit_to_use;
    END IF;

  ELSIF p_payment_mode = 'TOPUP_CREDIT' THEN
    v_credit_balance_type := 'TOPUP_CREDIT';
    v_max_cap := ROUND(v_event_price * 0.20, 2);
    v_req := COALESCE(p_topup_credit_requested, 0.00);
    IF v_req <= 0.00 THEN
      v_topup_to_use := LEAST(COALESCE(v_wallet.topup_credit, 0.00), v_max_cap);
    ELSE
      v_topup_to_use := LEAST(v_req, COALESCE(v_wallet.topup_credit, 0.00), v_max_cap);
    END IF;
    v_credit_to_use := v_topup_to_use;
    v_paid_to_use := v_event_price - v_credit_to_use;

  ELSIF p_payment_mode = 'COMBINED_CREDIT' THEN
    v_credit_balance_type := 'WELCOME_CREDIT';
    IF COALESCE(v_wallet.welcome_credit, 0.00) >= v_event_price THEN
      v_welcome_to_use := v_event_price;
      v_credit_to_use := v_event_price;
      v_paid_to_use := 0.00;
    ELSE
      v_welcome_to_use := COALESCE(v_wallet.welcome_credit, 0.00);
      v_credit_to_use := v_welcome_to_use;
      v_paid_to_use := v_event_price - v_welcome_to_use;

      IF v_paid_to_use > 0.00 AND COALESCE(v_wallet.topup_credit, 0.00) > 0.00 THEN
        v_max_cap := ROUND(v_event_price * 0.20, 2);
        v_req := COALESCE(p_topup_credit_requested, 0.00);
        IF v_req <= 0.00 THEN
          v_topup_to_use := LEAST(COALESCE(v_wallet.topup_credit, 0.00), v_max_cap, v_paid_to_use);
        ELSE
          v_topup_to_use := LEAST(v_req, COALESCE(v_wallet.topup_credit, 0.00), v_max_cap, v_paid_to_use);
        END IF;
        v_credit_to_use := v_credit_to_use + v_topup_to_use;
        v_paid_to_use := v_paid_to_use - v_topup_to_use;
      END IF;
    END IF;
  END IF;

  -- 6. Verify Sufficient Balances (Fail fast before ledger mutation)
  IF v_welcome_to_use > 0.00 AND COALESCE(v_wallet.welcome_credit, 0.00) < v_welcome_to_use THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE: Insufficient welcome credit. Available: %, Required: %',
      COALESCE(v_wallet.welcome_credit, 0.00), v_welcome_to_use;
  END IF;

  IF v_showcase_to_use > 0.00 AND COALESCE(v_wallet.showcase_credit, 0.00) < v_showcase_to_use THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE: Insufficient showcase credit. Available: %, Required: %',
      COALESCE(v_wallet.showcase_credit, 0.00), v_showcase_to_use;
  END IF;

  IF v_topup_to_use > 0.00 AND COALESCE(v_wallet.topup_credit, 0.00) < v_topup_to_use THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE: Insufficient topup credit. Available: %, Required: %',
      COALESCE(v_wallet.topup_credit, 0.00), v_topup_to_use;
  END IF;

  IF v_paid_to_use > 0.00 AND COALESCE(v_wallet.paid_balance, 0.00) < v_paid_to_use THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE: Insufficient cash balance. Available: %, Required: %',
      COALESCE(v_wallet.paid_balance, 0.00), v_paid_to_use;
  END IF;

  -- 7. Deduct from Organization Wallet Table
  UPDATE public.organization_wallets
  SET
    paid_balance = paid_balance - v_paid_to_use,
    welcome_credit = welcome_credit - v_welcome_to_use,
    showcase_credit = showcase_credit - v_showcase_to_use,
    topup_credit = topup_credit - v_topup_to_use,
    updated_at = v_now
  WHERE organization_id = p_organization_id
  RETURNING * INTO v_wallet;

  -- 8. Write Immutable Audit Ledger Transactions
  -- A. Welcome Credit Deduction Txn
  IF v_welcome_to_use > 0.00 THEN
    v_credit_ref := 'event_pay_welcome_' || replace(gen_random_uuid()::text, '-', '');
    INSERT INTO public.wallet_transactions (
      organization_id,
      event_id,
      amount,
      transaction_type,
      balance_type,
      status,
      description,
      reference_id,
      created_by,
      created_at,
      metadata
    ) VALUES (
      p_organization_id,
      p_event_id,
      -v_welcome_to_use,
      'CREDIT_USAGE',
      'WELCOME_CREDIT',
      'COMPLETED',
      COALESCE(p_description, 'Welcome credit applied to event activation'),
      v_credit_ref,
      p_created_by,
      v_now,
      jsonb_build_object(
        'payment_mode', p_payment_mode,
        'event_price', v_event_price,
        'original_reference', p_reference_id
      ) || p_metadata
    )
    RETURNING * INTO v_credit_txn;
    v_credit_txn_created := true;
  END IF;

  -- B. Showcase Credit Deduction Txn
  IF v_showcase_to_use > 0.00 THEN
    v_credit_ref := 'event_pay_showcase_' || replace(gen_random_uuid()::text, '-', '');
    INSERT INTO public.wallet_transactions (
      organization_id,
      event_id,
      amount,
      transaction_type,
      balance_type,
      status,
      description,
      reference_id,
      created_by,
      created_at,
      metadata
    ) VALUES (
      p_organization_id,
      p_event_id,
      -v_showcase_to_use,
      'CREDIT_USAGE',
      'SHOWCASE_CREDIT',
      'COMPLETED',
      COALESCE(p_description, 'Showcase credit applied to event activation'),
      v_credit_ref,
      p_created_by,
      v_now,
      jsonb_build_object(
        'payment_mode', p_payment_mode,
        'event_price', v_event_price,
        'original_reference', p_reference_id
      ) || p_metadata
    )
    RETURNING * INTO v_credit_txn;
    v_credit_txn_created := true;
  END IF;

  -- C. Topup Credit Deduction Txn
  IF v_topup_to_use > 0.00 THEN
    v_topup_ref := 'event_pay_topup_' || replace(gen_random_uuid()::text, '-', '');
    INSERT INTO public.wallet_transactions (
      organization_id,
      event_id,
      amount,
      transaction_type,
      balance_type,
      status,
      description,
      reference_id,
      created_by,
      created_at,
      metadata
    ) VALUES (
      p_organization_id,
      p_event_id,
      -v_topup_to_use,
      'CREDIT_USAGE',
      'TOPUP_CREDIT',
      'COMPLETED',
      COALESCE(p_description, 'Top-up promotional credit applied to event activation'),
      v_topup_ref,
      p_created_by,
      v_now,
      jsonb_build_object(
        'payment_mode', p_payment_mode,
        'event_price', v_event_price,
        'original_reference', p_reference_id
      ) || p_metadata
    )
    RETURNING * INTO v_topup_credit_txn;
    v_topup_credit_txn_created := true;
  END IF;

  -- D. Paid Balance Deduction Txn
  IF v_paid_to_use > 0.00 THEN
    v_paid_ref := 'event_pay_cash_' || replace(gen_random_uuid()::text, '-', '');
    INSERT INTO public.wallet_transactions (
      organization_id,
      event_id,
      amount,
      transaction_type,
      balance_type,
      status,
      description,
      reference_id,
      created_by,
      created_at,
      metadata
    ) VALUES (
      p_organization_id,
      p_event_id,
      -v_paid_to_use,
      'EVENT_PAYMENT',
      'PAID_BALANCE',
      'COMPLETED',
      COALESCE(p_description, 'Event activation payment deducted from cash balance'),
      v_paid_ref,
      p_created_by,
      v_now,
      jsonb_build_object(
        'payment_mode', p_payment_mode,
        'event_price', v_event_price,
        'original_reference', p_reference_id
      ) || p_metadata
    )
    RETURNING * INTO v_paid_txn;
    v_paid_txn_created := true;
  END IF;

  -- 10. Update Event Status & Link Payment References (Decoupled lifecycle state)
  IF v_event.id IS NOT NULL THEN
    DECLARE
      v_ev_tz text := COALESCE(NULLIF(TRIM(v_event.event_timezone), ''), 'Asia/Singapore');
      v_cur_date date := (v_now AT TIME ZONE v_ev_tz)::date;
      v_start_date date := COALESCE(
        CASE WHEN v_event.start_date ~ '^\d{4}-\d{2}-\d{2}' THEN (SUBSTRING(v_event.start_date FROM 1 FOR 10))::date ELSE NULL END,
        CASE WHEN v_event.event_date ~ '^\d{4}-\d{2}-\d{2}' THEN (SUBSTRING(v_event.event_date FROM 1 FOR 10))::date ELSE NULL END,
        (v_event.starts_at AT TIME ZONE v_ev_tz)::date
      );
      v_end_date date := COALESCE(
        CASE WHEN v_event.end_date ~ '^\d{4}-\d{2}-\d{2}' THEN (SUBSTRING(v_event.end_date FROM 1 FOR 10))::date ELSE NULL END,
        (v_event.expires_at AT TIME ZONE v_ev_tz)::date,
        v_start_date
      );
      v_target_event_status text;
      v_target_status text;
    BEGIN
      IF v_start_date IS NOT NULL AND v_cur_date < v_start_date THEN
        v_target_event_status := 'SCHEDULED';
        v_target_status := 'scheduled';
      ELSIF v_end_date IS NOT NULL AND v_cur_date > v_end_date THEN
        v_target_event_status := 'COMPLETED';
        v_target_status := 'completed';
      ELSE
        v_target_event_status := 'LIVE';
        v_target_status := 'live';
      END IF;

      UPDATE public.events
      SET
        status = v_target_status,
        event_status = v_target_event_status,
        payment_status = 'PAID',
        payment_mode = p_payment_mode,
        paid_amount = v_paid_to_use,
        discount_amount = v_credit_to_use,
        event_price = v_event_price,
        event_currency = 'MYR',
        cancel_reason = NULL,
        updated_at = v_now
      WHERE id = p_event_id;
    END;
  END IF;

  -- 11. Return Detailed Result Payload
  RETURN jsonb_build_object(
    'success', true,
    'event_id', p_event_id,
    'payment_mode', p_payment_mode,
    'event_price', v_event_price,
    'paid_amount', v_paid_to_use,
    'discount_amount', v_credit_to_use,
    'welcome_credit_used', v_welcome_to_use,
    'showcase_credit_used', v_showcase_to_use,
    'topup_credit_used', v_topup_to_use,
    'credit_transaction', CASE WHEN v_credit_txn_created THEN to_jsonb(v_credit_txn) ELSE NULL END,
    'topup_credit_transaction', CASE WHEN v_topup_credit_txn_created THEN to_jsonb(v_topup_credit_txn) ELSE NULL END,
    'paid_transaction', CASE WHEN v_paid_txn_created THEN to_jsonb(v_paid_txn) ELSE NULL END,
    'wallet', jsonb_build_object(
      'paid_balance', v_wallet.paid_balance,
      'welcome_credit', v_wallet.welcome_credit,
      'showcase_credit', v_wallet.showcase_credit,
      'topup_credit', v_wallet.topup_credit
    )
  );
END;
$$;

-- Secure grants for process_event_payment_atomic
REVOKE ALL ON FUNCTION public.process_event_payment_atomic(UUID, UUID, TEXT, NUMERIC, NUMERIC, TEXT, UUID, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_event_payment_atomic(UUID, UUID, TEXT, NUMERIC, NUMERIC, TEXT, UUID, TEXT, JSONB) TO service_role;


-- ============================================================================
-- 2. FIX calculate_event_authoritative_price RPC
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_event_authoritative_price(
  p_event_id UUID DEFAULT NULL,
  p_game_id UUID DEFAULT NULL,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL,
  p_pricing_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event RECORD;
  v_target_game_id UUID;
  v_start_date DATE;
  v_end_date DATE;
  v_pricing_id UUID;
  v_duration_days INT;
  v_pricing_record RECORD;
  v_matching_count INT;
  v_resolved_price NUMERIC(10, 2);
  v_resolved_currency TEXT := 'MYR';
  v_is_custom_price BOOLEAN := false;
BEGIN
  -- Load event if p_event_id provided
  IF p_event_id IS NOT NULL THEN
    SELECT id, game_id, start_date, end_date, starts_at, expires_at,
           pricing_id, is_custom_price, event_price, event_currency, duration_days
    INTO v_event
    FROM public.events
    WHERE id = p_event_id;

    IF v_event.id IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'EVENT_NOT_FOUND',
        'error', 'Event not found.'
      );
    END IF;

    v_target_game_id := COALESCE(p_game_id, v_event.game_id);
    v_start_date := COALESCE(
      p_start_date,
      CASE WHEN v_event.start_date ~ '^\d{4}-\d{2}-\d{2}' THEN (SUBSTRING(v_event.start_date FROM 1 FOR 10))::date ELSE NULL END,
      CASE WHEN v_event.event_date ~ '^\d{4}-\d{2}-\d{2}' THEN (SUBSTRING(v_event.event_date FROM 1 FOR 10))::date ELSE NULL END,
      CASE WHEN v_event.starts_at IS NOT NULL THEN (v_event.starts_at AT TIME ZONE 'Asia/Singapore')::date ELSE NULL END
    );
    v_end_date := COALESCE(
      p_end_date,
      CASE WHEN v_event.end_date ~ '^\d{4}-\d{2}-\d{2}' THEN (SUBSTRING(v_event.end_date FROM 1 FOR 10))::date ELSE NULL END,
      CASE WHEN v_event.expires_at IS NOT NULL THEN (v_event.expires_at AT TIME ZONE 'Asia/Singapore')::date ELSE NULL END,
      v_start_date
    );
    v_pricing_id := COALESCE(p_pricing_id, v_event.pricing_id);
    v_is_custom_price := COALESCE(v_event.is_custom_price, false);

    IF v_is_custom_price = true AND v_event.event_price IS NOT NULL AND v_event.event_price > 0 THEN
      RETURN jsonb_build_object(
        'success', true,
        'price', v_event.event_price,
        'currency', COALESCE(v_event.event_currency, 'MYR'),
        'duration_days', COALESCE(v_event.duration_days, 1),
        'is_custom_price', true,
        'pricing_id', v_event.pricing_id
      );
    END IF;
  ELSE
    v_target_game_id := p_game_id;
    v_start_date := p_start_date;
    v_end_date := p_end_date;
    v_pricing_id := p_pricing_id;
  END IF;

  IF v_start_date IS NULL OR v_end_date IS NULL THEN
    v_duration_days := 1;
  ELSE
    v_duration_days := GREATEST(1, (v_end_date - v_start_date) + 1);
  END IF;

  IF v_target_game_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'GAME_REQUIRED',
      'error', 'A game must be selected to calculate authoritative event pricing.'
    );
  END IF;

  IF v_pricing_id IS NOT NULL THEN
    SELECT id, game_id, price, currency, is_active, min_days, max_days
    INTO v_pricing_record
    FROM public.game_pricing
    WHERE id = v_pricing_id;

    IF v_pricing_record.id IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'PRICING_TIER_NOT_FOUND',
        'error', 'Specified pricing tier does not exist.'
      );
    END IF;

    IF v_pricing_record.game_id != v_target_game_id THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'PRICING_GAME_MISMATCH',
        'error', 'Specified pricing tier does not belong to the selected game.'
      );
    END IF;

    IF v_pricing_record.is_active != true THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'PRICING_TIER_INACTIVE',
        'error', 'Specified pricing tier is inactive and cannot be used.'
      );
    END IF;

    IF v_duration_days < v_pricing_record.min_days OR (v_pricing_record.max_days IS NOT NULL AND v_duration_days > v_pricing_record.max_days) THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'PRICING_DURATION_MISMATCH',
        'error', 'The specified pricing tier does not cover this duration (' || v_duration_days || ' days).'
      );
    END IF;

    v_resolved_price := v_pricing_record.price;
    v_resolved_currency := v_pricing_record.currency;
  ELSE
    -- Check for ambiguous / multiple matching tiers (fails closed)
    SELECT count(*)
    INTO v_matching_count
    FROM public.game_pricing
    WHERE game_id = v_target_game_id
      AND is_active = true
      AND min_days <= v_duration_days
      AND (max_days IS NULL OR max_days >= v_duration_days);

    IF v_matching_count > 1 THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'AMBIGUOUS_PRICING_TIER',
        'error', 'Multiple active pricing tiers match duration of ' || v_duration_days || ' days for this game. Overlapping active tiers must be resolved in Developer Settings.',
        'message', 'Multiple active pricing tiers match duration of ' || v_duration_days || ' days for this game. Overlapping active tiers must be resolved in Developer Settings.'
      );
    END IF;

    SELECT id, game_id, price, currency, is_active, min_days, max_days
    INTO v_pricing_record
    FROM public.game_pricing
    WHERE game_id = v_target_game_id
      AND is_active = true
      AND min_days <= v_duration_days
      AND (max_days IS NULL OR max_days >= v_duration_days);

    IF v_pricing_record.id IS NOT NULL THEN
      v_pricing_id := v_pricing_record.id;
      v_resolved_price := v_pricing_record.price;
      v_resolved_currency := v_pricing_record.currency;
    ELSIF v_resolved_price IS NULL OR v_resolved_price <= 0 THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'NO_PRICING_TIER',
        'error', 'No pricing tier is configured for a ' || v_duration_days || '-day event for this game. Pricing cannot be resolved.',
        'message', 'No pricing tier is configured for a ' || v_duration_days || '-day event for this game. Pricing cannot be resolved.'
      );
    END IF;
  END IF;

  IF v_resolved_price IS NULL OR v_resolved_price <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'PRICING_CONFIGURATION_ERROR',
      'error', 'Event price must be positive and valid. Could not resolve pricing.',
      'message', 'Event price must be positive and valid. Could not resolve pricing.'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'price', v_resolved_price,
    'currency', v_resolved_currency,
    'duration_days', v_duration_days,
    'pricing_id', v_pricing_id,
    'is_custom_price', false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.calculate_event_authoritative_price(UUID, UUID, DATE, DATE, UUID) TO authenticated, service_role;
