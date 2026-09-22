-- Migration: 20260926000000_decouple_payment_activation_from_lifecycle.sql
-- Description: Decouple event payment activation from event lifecycle state.
-- When process_event_payment_atomic completes:
--   - payment_status is set to PAID
--   - If today is before event start_date: event_status is set to SCHEDULED, status is set to scheduled
--   - If today is on/within event dates: event_status is set to LIVE, status is set to live
--   - If today is after event end_date: event_status is set to COMPLETED, status is set to completed
-- Actual transition to LIVE is authoritatively handled by runEventLifecycleMaintenance on the event start date.

-- 1. Ensure events table allows 'SCHEDULED' in event_status check constraint
DO $$
DECLARE
  v_constraint_name text;
BEGIN
  FOR v_constraint_name IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'events'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%event_status%'
  LOOP
    EXECUTE 'ALTER TABLE public.events DROP CONSTRAINT IF EXISTS ' || quote_ident(v_constraint_name);
  END LOOP;
END $$;

ALTER TABLE public.events
  ADD CONSTRAINT events_event_status_check
  CHECK (event_status IN ('DRAFT', 'PAYMENT_PENDING', 'SCHEDULED', 'LIVE', 'COMPLETED', 'EXPIRED', 'CANCELLED'));

-- 2. Update process_event_payment_atomic RPC
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

  -- 4. Lock & Validate Organization Wallet
  SELECT * INTO v_wallet
  FROM public.organization_wallets
  WHERE organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.organization_wallets (
      organization_id,
      paid_balance,
      welcome_credit,
      showcase_credit,
      topup_credit
    ) VALUES (
      p_organization_id,
      0.00,
      0.00,
      0.00,
      0.00
    )
    RETURNING * INTO v_wallet;
  END IF;

  -- 5. Calculate Deductions by Payment Mode
  IF p_payment_mode = 'FULL_PAID' THEN
    v_paid_to_use := v_event_price;
    v_credit_to_use := 0.00;

  ELSIF p_payment_mode = 'WELCOME_CREDIT' THEN
    v_credit_balance_type := 'WELCOME_CREDIT';
    IF COALESCE(v_wallet.welcome_credit, 0.00) >= v_event_price THEN
      v_welcome_to_use := v_event_price;
      v_paid_to_use := 0.00;
    ELSE
      v_welcome_to_use := COALESCE(v_wallet.welcome_credit, 0.00);
      v_paid_to_use := v_event_price - v_welcome_to_use;
    END IF;
    v_credit_to_use := v_welcome_to_use;

  ELSIF p_payment_mode = 'SHOWCASE_CREDIT' THEN
    v_credit_balance_type := 'SHOWCASE_CREDIT';
    IF COALESCE(v_wallet.showcase_credit, 0.00) >= v_event_price THEN
      v_showcase_to_use := v_event_price;
      v_paid_to_use := 0.00;
    ELSE
      v_showcase_to_use := COALESCE(v_wallet.showcase_credit, 0.00);
      v_paid_to_use := v_event_price - v_showcase_to_use;
    END IF;
    v_credit_to_use := v_showcase_to_use;

  ELSIF p_payment_mode = 'TOPUP_CREDIT' THEN
    v_credit_balance_type := 'TOPUP_CREDIT';
    -- 20% cap rule: Max 20% of Event Price can be discounted by top-up credit
    v_max_cap := ROUND(v_event_price * 0.20, 2);
    v_req := COALESCE(p_topup_credit_requested, 0.00);
    IF v_req <= 0.00 THEN
      v_topup_to_use := LEAST(COALESCE(v_wallet.topup_credit, 0.00), v_max_cap);
    ELSE
      v_topup_to_use := LEAST(v_req, COALESCE(v_wallet.topup_credit, 0.00), v_max_cap);
    END IF;
    v_paid_to_use := v_event_price - v_topup_to_use;
    v_credit_to_use := v_topup_to_use;

  ELSIF p_payment_mode = 'COMBINED_CREDIT' THEN
    -- Welcome credit applied first up to full price
    IF COALESCE(v_wallet.welcome_credit, 0.00) >= v_event_price THEN
      v_welcome_to_use := v_event_price;
      v_paid_to_use := 0.00;
      v_topup_to_use := 0.00;
    ELSE
      v_welcome_to_use := COALESCE(v_wallet.welcome_credit, 0.00);
      v_paid_to_use := v_event_price - v_welcome_to_use;

      -- If remaining unpaid amount exists, apply topup credit up to 20% of event price
      IF v_paid_to_use > 0.00 THEN
        v_max_cap := ROUND(v_event_price * 0.20, 2);
        v_req := COALESCE(p_topup_credit_requested, 0.00);
        IF v_req <= 0.00 THEN
          v_topup_to_use := LEAST(COALESCE(v_wallet.topup_credit, 0.00), v_max_cap, v_paid_to_use);
        ELSE
          v_topup_to_use := LEAST(v_req, COALESCE(v_wallet.topup_credit, 0.00), v_max_cap, v_paid_to_use);
        END IF;
        v_paid_to_use := v_paid_to_use - v_topup_to_use;
      ELSE
        v_topup_to_use := 0.00;
      END IF;
    END IF;
    v_credit_to_use := v_welcome_to_use + v_topup_to_use;
  END IF;

  -- 6. Verify Wallet Balances (Atomic check)
  IF v_welcome_to_use > 0.00 AND COALESCE(v_wallet.welcome_credit, 0.00) < v_welcome_to_use THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE: Insufficient welcome credit (available: %, required: %)',
      v_wallet.welcome_credit, v_welcome_to_use;
  END IF;

  IF v_showcase_to_use > 0.00 AND COALESCE(v_wallet.showcase_credit, 0.00) < v_showcase_to_use THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE: Insufficient showcase credit (available: %, required: %)',
      v_wallet.showcase_credit, v_showcase_to_use;
  END IF;

  IF v_topup_to_use > 0.00 AND COALESCE(v_wallet.topup_credit, 0.00) < v_topup_to_use THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE: Insufficient top-up credit (available: %, required: %)',
      v_wallet.topup_credit, v_topup_to_use;
  END IF;

  IF v_paid_to_use > 0.00 AND COALESCE(v_wallet.paid_balance, 0.00) < v_paid_to_use THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE: Insufficient paid balance (available: %, required: %)',
      v_wallet.paid_balance, v_paid_to_use;
  END IF;

  -- 7. Deduct from Organization Wallet
  UPDATE public.organization_wallets
  SET
    welcome_credit = welcome_credit - v_welcome_to_use,
    showcase_credit = showcase_credit - v_showcase_to_use,
    topup_credit = topup_credit - v_topup_to_use,
    paid_balance = paid_balance - v_paid_to_use,
    updated_at = v_now
  WHERE organization_id = p_organization_id
  RETURNING * INTO v_wallet;

  -- 8. Generate Traceable References
  v_credit_ref := 'TXN-CRED-' || UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', '') FROM 1 FOR 12));
  v_topup_ref := 'TXN-TOPC-' || UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', '') FROM 1 FOR 12));
  v_paid_ref := 'TXN-PAID-' || UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', '') FROM 1 FOR 12));

  -- 9. Insert Immutable Transaction Records
  -- 9a. Welcome Credit or Showcase Credit Transaction
  IF v_welcome_to_use > 0.00 THEN
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
  ELSIF v_showcase_to_use > 0.00 THEN
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

  -- 9b. Topup Credit Transaction (if applicable)
  IF v_topup_to_use > 0.00 THEN
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

  -- 9c. Paid Balance Transaction (if applicable)
  IF v_paid_to_use > 0.00 THEN
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
      v_ev_tz text := COALESCE(v_event.event_timezone, 'Asia/Singapore');
      v_cur_date date := (v_now AT TIME ZONE v_ev_tz)::date;
      v_start_date date := COALESCE(v_event.start_date, (v_event.starts_at AT TIME ZONE v_ev_tz)::date, v_event.event_date);
      v_end_date date := COALESCE(v_event.end_date, (v_event.expires_at AT TIME ZONE v_ev_tz)::date, v_start_date);
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

-- Secure grants
REVOKE ALL ON FUNCTION public.process_event_payment_atomic(UUID, UUID, TEXT, NUMERIC, NUMERIC, TEXT, UUID, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_event_payment_atomic(UUID, UUID, TEXT, NUMERIC, NUMERIC, TEXT, UUID, TEXT, JSONB) TO service_role;
