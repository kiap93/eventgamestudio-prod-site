-- ==============================================================================
-- MIGRATION: 011_atomic_event_payment_rpc.sql
-- EVENT GAME STUDIO - ATOMIC EVENT PAYMENT RPC / TRANSACTION ENGINE
-- ==============================================================================

-- 0. Ensure events table has required payment tracking columns
ALTER TABLE public.events 
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'UNPAID',
  ADD COLUMN IF NOT EXISTS payment_mode TEXT,
  ADD COLUMN IF NOT EXISTS event_price NUMERIC(10, 2) NOT NULL DEFAULT 1400.00,
  ADD COLUMN IF NOT EXISTS event_currency TEXT NOT NULL DEFAULT 'MYR',
  ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(10, 2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10, 2) DEFAULT 0.00;

CREATE OR REPLACE FUNCTION public.process_event_payment_atomic(
  p_organization_id UUID,
  p_event_id UUID,
  p_payment_mode TEXT,
  p_event_price NUMERIC DEFAULT 1400.00,
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
  v_wallet RECORD;
  v_event RECORD;
  v_event_price NUMERIC := COALESCE(p_event_price, 1400.00);
  v_credit_to_use NUMERIC := 0.00;
  v_paid_to_use NUMERIC := 0.00;
  v_credit_balance_type TEXT := NULL;
  v_credit_txn RECORD;
  v_paid_txn RECORD;
  v_credit_ref TEXT;
  v_paid_ref TEXT;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
  v_existing_payment RECORD;
  v_existing_credit RECORD;
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

  IF p_payment_mode NOT IN ('FULL_PAID', 'WELCOME_CREDIT', 'SHOWCASE_CREDIT', 'TOPUP_CREDIT') THEN
    RAISE EXCEPTION 'Invalid payment mode: %', p_payment_mode;
  END IF;

  IF v_event_price <= 0 THEN
    RAISE EXCEPTION 'Event price must be greater than 0';
  END IF;

  -- 2. Idempotency Protection: Check if event is already paid in transaction ledger
  SELECT * INTO v_existing_payment
  FROM public.wallet_transactions
  WHERE organization_id = p_organization_id
    AND event_id = p_event_id
    AND transaction_type = 'EVENT_PAYMENT'
    AND balance_type = 'PAID_BALANCE'
    AND status = 'COMPLETED'
  LIMIT 1;

  IF v_existing_payment.id IS NOT NULL THEN
    SELECT * INTO v_existing_credit
    FROM public.wallet_transactions
    WHERE organization_id = p_organization_id
      AND event_id = p_event_id
      AND transaction_type = 'CREDIT_USAGE'
      AND status = 'COMPLETED'
    LIMIT 1;

    SELECT * INTO v_wallet FROM public.organization_wallets WHERE organization_id = p_organization_id;

    RETURN jsonb_build_object(
      'success', true,
      'is_idempotent_replay', true,
      'event_id', p_event_id,
      'payment_mode', p_payment_mode,
      'event_price', v_event_price,
      'paid_amount', ABS(v_existing_payment.amount),
      'discount_amount', COALESCE(ABS(v_existing_credit.amount), 0.00),
      'credit_transaction', CASE WHEN v_existing_credit.id IS NOT NULL THEN to_jsonb(v_existing_credit) ELSE NULL END,
      'paid_transaction', to_jsonb(v_existing_payment),
      'wallet', jsonb_build_object(
        'paid_balance', COALESCE(v_wallet.paid_balance, 0.00),
        'welcome_credit', COALESCE(v_wallet.welcome_credit, 0.00),
        'showcase_credit', COALESCE(v_wallet.showcase_credit, 0.00),
        'topup_credit', COALESCE(v_wallet.topup_credit, 0.00)
      )
    );
  END IF;

  -- 3. Lock & Validate Organization Wallet (Row-level lock prevents race conditions & double-spend)
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

  -- 4. Lock & Validate Event Record (if exists in events table)
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
  END IF;

  -- 5. Calculate and validate business rules for payment mode
  IF p_payment_mode = 'FULL_PAID' THEN
    v_credit_to_use := 0.00;
    v_paid_to_use := v_event_price;

    IF v_wallet.paid_balance < v_paid_to_use THEN
      RAISE EXCEPTION 'Insufficient Paid Balance. Event price is RM%, but available Paid Balance is RM%.',
        ROUND(v_paid_to_use, 2)::text, ROUND(v_wallet.paid_balance, 2)::text;
    END IF;

  ELSIF p_payment_mode = 'WELCOME_CREDIT' THEN
    v_credit_balance_type := 'WELCOME_CREDIT';
    v_credit_to_use := LEAST(800.00, v_event_price);
    v_paid_to_use := v_event_price - v_credit_to_use;

    IF v_wallet.welcome_credit < v_credit_to_use THEN
      RAISE EXCEPTION 'Insufficient Welcome Credit. Required: RM%, Available: RM%.',
        ROUND(v_credit_to_use, 2)::text, ROUND(v_wallet.welcome_credit, 2)::text;
    END IF;

    IF v_wallet.paid_balance < v_paid_to_use THEN
      RAISE EXCEPTION 'Insufficient Paid Balance for Welcome Credit payment. Required: RM%, Available: RM%.',
        ROUND(v_paid_to_use, 2)::text, ROUND(v_wallet.paid_balance, 2)::text;
    END IF;

  ELSIF p_payment_mode = 'SHOWCASE_CREDIT' THEN
    v_credit_balance_type := 'SHOWCASE_CREDIT';
    v_credit_to_use := LEAST(300.00, v_event_price);
    v_paid_to_use := v_event_price - v_credit_to_use;

    IF v_wallet.showcase_credit < v_credit_to_use THEN
      RAISE EXCEPTION 'Insufficient Showcase Credit. Required: RM%, Available: RM%.',
        ROUND(v_credit_to_use, 2)::text, ROUND(v_wallet.showcase_credit, 2)::text;
    END IF;

    IF v_wallet.paid_balance < v_paid_to_use THEN
      RAISE EXCEPTION 'Insufficient Paid Balance for Showcase Credit payment. Required: RM%, Available: RM%.',
        ROUND(v_paid_to_use, 2)::text, ROUND(v_wallet.paid_balance, 2)::text;
    END IF;

  ELSIF p_payment_mode = 'TOPUP_CREDIT' THEN
    v_credit_balance_type := 'TOPUP_CREDIT';
    v_max_cap := ROUND(v_event_price * 0.20, 2);
    v_req := COALESCE(p_topup_credit_requested, v_max_cap);
    v_credit_to_use := LEAST(v_req, v_max_cap, v_wallet.topup_credit, v_event_price);
    v_paid_to_use := v_event_price - v_credit_to_use;

    IF v_wallet.topup_credit < v_credit_to_use THEN
      RAISE EXCEPTION 'Insufficient Top-up Credit. Required: RM%, Available: RM%.',
        ROUND(v_credit_to_use, 2)::text, ROUND(v_wallet.topup_credit, 2)::text;
    END IF;

    IF v_wallet.paid_balance < v_paid_to_use THEN
      RAISE EXCEPTION 'Insufficient Paid Balance for Top-up Credit payment. Required: RM%, Available: RM%.',
        ROUND(v_paid_to_use, 2)::text, ROUND(v_wallet.paid_balance, 2)::text;
    END IF;
  END IF;

  -- 6. Setup references
  IF p_reference_id IS NOT NULL AND p_reference_id <> '' THEN
    v_credit_ref := p_reference_id || '_credit';
    v_paid_ref := p_reference_id || '_paid';
  ELSE
    v_credit_ref := 'event_' || p_event_id::text || '_credit';
    v_paid_ref := 'event_' || p_event_id::text || '_paid';
  END IF;

  -- 7. Insert Credit Deduction in immutable ledger (if promotional credit used)
  IF v_credit_to_use > 0 AND v_credit_balance_type IS NOT NULL THEN
    INSERT INTO public.wallet_transactions (
      organization_id,
      event_id,
      transaction_type,
      balance_type,
      amount,
      currency,
      status,
      reference_id,
      description,
      metadata,
      created_by,
      created_at
    ) VALUES (
      p_organization_id,
      p_event_id,
      'CREDIT_USAGE',
      v_credit_balance_type,
      -v_credit_to_use,
      'MYR',
      'COMPLETED',
      v_credit_ref,
      COALESCE(p_description, 'Applied RM' || ROUND(v_credit_to_use, 2)::text || ' ' || replace(p_payment_mode, '_', ' ') || ' for Event'),
      jsonb_build_object(
        'event_id', p_event_id,
        'payment_mode', p_payment_mode,
        'credit_type', v_credit_balance_type,
        'credit_discount', v_credit_to_use,
        'event_price', v_event_price
      ) || COALESCE(p_metadata, '{}'::jsonb),
      p_created_by,
      v_now
    )
    RETURNING * INTO v_credit_txn;
  END IF;

  -- 8. Insert Paid Balance Deduction in immutable ledger (if paid amount > 0)
  IF v_paid_to_use > 0 THEN
    INSERT INTO public.wallet_transactions (
      organization_id,
      event_id,
      transaction_type,
      balance_type,
      amount,
      currency,
      status,
      reference_id,
      description,
      metadata,
      created_by,
      created_at
    ) VALUES (
      p_organization_id,
      p_event_id,
      'EVENT_PAYMENT',
      'PAID_BALANCE',
      -v_paid_to_use,
      'MYR',
      'COMPLETED',
      v_paid_ref,
      'Paid RM' || ROUND(v_paid_to_use, 2)::text || ' from Paid Balance for Event',
      jsonb_build_object(
        'event_id', p_event_id,
        'payment_mode', p_payment_mode,
        'paid_amount', v_paid_to_use,
        'credit_applied', v_credit_to_use,
        'total_event_cost', v_event_price
      ) || COALESCE(p_metadata, '{}'::jsonb),
      p_created_by,
      v_now
    )
    RETURNING * INTO v_paid_txn;
  END IF;

  -- 9. Update Organization Wallets Cached Balances
  UPDATE public.organization_wallets
  SET
    paid_balance = paid_balance - v_paid_to_use,
    welcome_credit = CASE WHEN v_credit_balance_type = 'WELCOME_CREDIT' THEN welcome_credit - v_credit_to_use ELSE welcome_credit END,
    showcase_credit = CASE WHEN v_credit_balance_type = 'SHOWCASE_CREDIT' THEN showcase_credit - v_credit_to_use ELSE showcase_credit END,
    topup_credit = CASE WHEN v_credit_balance_type = 'TOPUP_CREDIT' THEN topup_credit - v_credit_to_use ELSE topup_credit END,
    updated_at = v_now
  WHERE organization_id = p_organization_id
  RETURNING * INTO v_wallet;

  -- 10. Mark Event as PAID in events table (if event exists)
  IF v_event.id IS NOT NULL THEN
    UPDATE public.events
    SET
      payment_status = 'PAID',
      payment_mode = p_payment_mode,
      paid_amount = v_paid_to_use,
      discount_amount = v_credit_to_use,
      updated_at = v_now
    WHERE id = p_event_id;
  END IF;

  -- 11. Return atomic transaction payload
  RETURN jsonb_build_object(
    'success', true,
    'event_id', p_event_id,
    'payment_mode', p_payment_mode,
    'event_price', v_event_price,
    'paid_amount', v_paid_to_use,
    'discount_amount', v_credit_to_use,
    'credit_transaction', CASE WHEN v_credit_txn.id IS NOT NULL THEN to_jsonb(v_credit_txn) ELSE NULL END,
    'paid_transaction', CASE WHEN v_paid_txn.id IS NOT NULL THEN to_jsonb(v_paid_txn) ELSE NULL END,
    'wallet', jsonb_build_object(
      'paid_balance', v_wallet.paid_balance,
      'welcome_credit', v_wallet.welcome_credit,
      'showcase_credit', v_wallet.showcase_credit,
      'topup_credit', v_wallet.topup_credit
    )
  );
END;
$$;
