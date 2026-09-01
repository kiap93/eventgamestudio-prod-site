-- ==============================================================================
-- MIGRATION: 023_fix_settle_wallet_topup_order_unassigned.sql
-- EVENT GAME STUDIO - FIX UNASSIGNED PL/PGSQL RECORD VARIABLES IN TOP-UP & PAYMENT RPCS
-- ==============================================================================

-- 1. FIX settle_wallet_topup_order RPC
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.settle_wallet_topup_order(
  p_order_id UUID,
  p_organization_id UUID,
  p_status TEXT,
  p_payment_reference TEXT DEFAULT NULL,
  p_payment_method TEXT DEFAULT NULL,
  p_processed_by UUID DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order public.wallet_topup_orders%ROWTYPE;
  v_wallet public.organization_wallets%ROWTYPE;
  v_topup_txn public.wallet_transactions%ROWTYPE;
  v_promo_txn public.wallet_transactions%ROWTYPE;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
  v_promo_credit NUMERIC := 0.00;
  v_tier_rate TEXT := '0%';
  v_existing_topup public.wallet_transactions%ROWTYPE;
  v_existing_promo public.wallet_transactions%ROWTYPE;
  v_existing_topup_found BOOLEAN := false;
  v_existing_promo_found BOOLEAN := false;
  v_topup_txn_created BOOLEAN := false;
  v_promo_txn_created BOOLEAN := false;
BEGIN
  -- 1. Input validations
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'Order ID is required';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'Organization ID is required';
  END IF;

  IF p_status NOT IN ('PAID', 'FAILED', 'EXPIRED', 'CANCELLED', 'PENDING') THEN
    RAISE EXCEPTION 'Invalid status: %. Must be PAID, FAILED, EXPIRED, or CANCELLED', p_status;
  END IF;

  -- 2. Lock & Validate Top-up Order Record
  SELECT * INTO v_order
  FROM public.wallet_topup_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Top-up order not found: %', p_order_id;
  END IF;

  IF v_order.organization_id <> p_organization_id THEN
    RAISE EXCEPTION 'Security Error: Top-up order does not belong to your organization';
  END IF;

  -- 3. Idempotency Check: Already PAID order
  IF v_order.status = 'PAID' THEN
    IF p_status = 'PAID' THEN
      SELECT * INTO v_existing_topup
      FROM public.wallet_transactions
      WHERE organization_id = p_organization_id
        AND reference_id = 'topup_order_' || p_order_id::text
        AND transaction_type = 'TOPUP'
        AND status = 'COMPLETED'
      LIMIT 1;
      v_existing_topup_found := FOUND;

      SELECT * INTO v_existing_promo
      FROM public.wallet_transactions
      WHERE organization_id = p_organization_id
        AND reference_id = 'topup_order_' || p_order_id::text || '_promo'
        AND transaction_type = 'TOPUP_CREDIT'
        AND status = 'COMPLETED'
      LIMIT 1;
      v_existing_promo_found := FOUND;

      SELECT * INTO v_wallet FROM public.organization_wallets WHERE organization_id = p_organization_id;

      RETURN jsonb_build_object(
        'success', true,
        'is_idempotent_replay', true,
        'order', to_jsonb(v_order),
        'topup_transaction', CASE WHEN v_existing_topup_found THEN to_jsonb(v_existing_topup) ELSE NULL END,
        'promo_credit_transaction', CASE WHEN v_existing_promo_found THEN to_jsonb(v_existing_promo) ELSE NULL END,
        'wallet', jsonb_build_object(
          'paid_balance', COALESCE(v_wallet.paid_balance, 0.00),
          'welcome_credit', COALESCE(v_wallet.welcome_credit, 0.00),
          'showcase_credit', COALESCE(v_wallet.showcase_credit, 0.00),
          'topup_credit', COALESCE(v_wallet.topup_credit, 0.00),
          'currency', COALESCE(v_wallet.currency, 'MYR')
        ),
        'message', 'Top-up order is already marked as PAID and credited (idempotent no-op).'
      );
    ELSE
      RAISE EXCEPTION 'Cannot change status of an already PAID top-up order (%) to %', p_order_id, p_status;
    END IF;
  END IF;

  -- 4. Guard against re-settling already terminal states
  IF v_order.status IN ('FAILED', 'EXPIRED', 'CANCELLED') THEN
    IF v_order.status = p_status THEN
      RETURN jsonb_build_object(
        'success', true,
        'is_idempotent_replay', true,
        'order', to_jsonb(v_order),
        'message', 'Top-up order is already in status ' || p_status || '.'
      );
    ELSE
      RAISE EXCEPTION 'Cannot settle top-up order with terminal status %', v_order.status;
    END IF;
  END IF;

  -- 5. Process Transition to PAID (Atomic Balance Updates + Double Ledger Recording)
  IF p_status = 'PAID' THEN
    -- Lock or create wallet
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
        topup_credit,
        currency
      ) VALUES (
        p_organization_id,
        0.00,
        0.00,
        0.00,
        0.00,
        'MYR'
      )
      RETURNING * INTO v_wallet;
    END IF;

    -- Calculate Promotional Credit Tier
    IF v_order.top_up_amount >= 10000.00 THEN
      v_promo_credit := ROUND(v_order.top_up_amount * 0.07, 2);
      v_tier_rate := '7%';
    ELSIF v_order.top_up_amount >= 6000.00 THEN
      v_promo_credit := ROUND(v_order.top_up_amount * 0.05, 2);
      v_tier_rate := '5%';
    ELSE
      v_promo_credit := 0.00;
      v_tier_rate := '0%';
    END IF;

    -- Update Top-up Order to PAID
    UPDATE public.wallet_topup_orders
    SET
      status = 'PAID',
      paid_at = v_now,
      payment_reference = COALESCE(p_payment_reference, v_order.payment_reference),
      payment_method = COALESCE(p_payment_method, v_order.payment_method),
      promotional_credit_amount = v_promo_credit,
      settled_at = v_now,
      updated_at = v_now,
      metadata = v_order.metadata || jsonb_build_object(
        'settled_by', p_processed_by,
        'settlement_reason', p_reason,
        'promotional_rate', v_tier_rate
      ) || COALESCE(p_metadata, '{}'::jsonb)
    WHERE id = p_order_id
    RETURNING * INTO v_order;

    -- Insert Top-up Cash Deposit transaction into Ledger
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
      NULL,
      'TOPUP',
      'PAID_BALANCE',
      v_order.top_up_amount,
      v_order.currency,
      'COMPLETED',
      'topup_order_' || p_order_id::text,
      'Top-up Order ' || UPPER(SUBSTRING(p_order_id::text, 1, 8)),
      jsonb_build_object(
        'topup_order_id', p_order_id,
        'payment_reference', v_order.payment_reference,
        'payment_method', v_order.payment_method,
        'reason', p_reason
      ) || COALESCE(p_metadata, '{}'::jsonb),
      COALESCE(p_processed_by, v_order.user_id),
      v_now
    )
    RETURNING * INTO v_topup_txn;
    v_topup_txn_created := true;

    -- If Promotional Tier qualifies, insert Promotional Credit transaction into Ledger
    IF v_promo_credit > 0 THEN
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
        NULL,
        'TOPUP_CREDIT',
        'TOPUP_CREDIT',
        v_promo_credit,
        v_order.currency,
        'COMPLETED',
        'topup_order_' || p_order_id::text || '_promo',
        'Promotional ' || v_tier_rate || ' Top-up Credit on RM' || ROUND(v_order.top_up_amount, 2)::text || ' deposit',
        jsonb_build_object(
          'parent_topup_id', v_topup_txn.id,
          'topup_order_id', p_order_id,
          'qualifying_amount', v_order.top_up_amount,
          'reward_rate', v_tier_rate
        ) || COALESCE(p_metadata, '{}'::jsonb),
        COALESCE(p_processed_by, v_order.user_id),
        v_now
      )
      RETURNING * INTO v_promo_txn;
      v_promo_txn_created := true;
    END IF;

    UPDATE public.organization_wallets
    SET
      paid_balance = paid_balance + v_order.top_up_amount,
      topup_credit = topup_credit + v_promo_credit,
      updated_at = v_now
    WHERE organization_id = p_organization_id
    RETURNING * INTO v_wallet;

    RETURN jsonb_build_object(
      'success', true,
      'is_idempotent_replay', false,
      'order', to_jsonb(v_order),
      'topup_transaction', CASE WHEN v_topup_txn_created THEN to_jsonb(v_topup_txn) ELSE NULL END,
      'promo_credit_transaction', CASE WHEN v_promo_txn_created THEN to_jsonb(v_promo_txn) ELSE NULL END,
      'wallet', jsonb_build_object(
        'paid_balance', v_wallet.paid_balance,
        'welcome_credit', v_wallet.welcome_credit,
        'showcase_credit', v_wallet.showcase_credit,
        'topup_credit', v_wallet.topup_credit,
        'currency', v_wallet.currency
      ),
      'message', 'Top-up order successfully marked as PAID. Wallet credited with RM' || ROUND(v_order.top_up_amount, 2)::text || ' cash balance and RM' || ROUND(v_promo_credit, 2)::text || ' promotional credits.'
    );
  END IF;

  -- 6. Process Non-PAID Transitions (FAILED, EXPIRED, CANCELLED)
  IF p_status = 'FAILED' THEN
    UPDATE public.wallet_topup_orders
    SET
      status = 'FAILED',
      failed_at = v_now,
      updated_at = v_now,
      notes = COALESCE(p_reason, notes),
      metadata = metadata || COALESCE(p_metadata, '{}'::jsonb)
    WHERE id = p_order_id
    RETURNING * INTO v_order;

    RETURN jsonb_build_object(
      'success', true,
      'is_idempotent_replay', false,
      'order', to_jsonb(v_order),
      'message', 'Top-up order marked as FAILED. No funds or credits were added to the wallet.'
    );
  ELSIF p_status = 'EXPIRED' THEN
    UPDATE public.wallet_topup_orders
    SET
      status = 'EXPIRED',
      expired_at = v_now,
      updated_at = v_now,
      notes = COALESCE(p_reason, notes),
      metadata = metadata || COALESCE(p_metadata, '{}'::jsonb)
    WHERE id = p_order_id
    RETURNING * INTO v_order;

    RETURN jsonb_build_object(
      'success', true,
      'is_idempotent_replay', false,
      'order', to_jsonb(v_order),
      'message', 'Top-up order marked as EXPIRED. No funds or credits were added to the wallet.'
    );
  ELSIF p_status = 'CANCELLED' THEN
    UPDATE public.wallet_topup_orders
    SET
      status = 'CANCELLED',
      cancelled_at = v_now,
      updated_at = v_now,
      notes = COALESCE(p_reason, notes),
      metadata = metadata || COALESCE(p_metadata, '{}'::jsonb)
    WHERE id = p_order_id
    RETURNING * INTO v_order;

    RETURN jsonb_build_object(
      'success', true,
      'is_idempotent_replay', false,
      'order', to_jsonb(v_order),
      'message', 'Top-up order marked as CANCELLED. No funds or credits were added to the wallet.'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', false,
    'error', 'Unhandled order status transition: ' || p_status
  );
END;
$$;


-- 2. FIX process_topup_order_atomic RPC
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.process_topup_order_atomic(
  p_order_id UUID,
  p_organization_id UUID,
  p_status TEXT,
  p_payment_reference TEXT DEFAULT NULL,
  p_payment_method TEXT DEFAULT NULL,
  p_processed_by UUID DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order public.wallet_topup_orders%ROWTYPE;
  v_wallet public.organization_wallets%ROWTYPE;
  v_topup_txn public.wallet_transactions%ROWTYPE;
  v_promo_txn public.wallet_transactions%ROWTYPE;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
  v_promo_credit NUMERIC := 0.00;
  v_tier_rate TEXT := '0%';
  v_existing_topup public.wallet_transactions%ROWTYPE;
  v_existing_promo public.wallet_transactions%ROWTYPE;
  v_existing_topup_found BOOLEAN := false;
  v_existing_promo_found BOOLEAN := false;
  v_topup_txn_created BOOLEAN := false;
  v_promo_txn_created BOOLEAN := false;
BEGIN
  -- 1. Input validations
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'Order ID is required';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'Organization ID is required';
  END IF;

  IF p_status NOT IN ('PAID', 'FAILED', 'EXPIRED', 'CANCELLED', 'PENDING') THEN
    RAISE EXCEPTION 'Invalid status: %. Must be PAID, FAILED, EXPIRED, or CANCELLED', p_status;
  END IF;

  -- 2. Lock & Validate Top-up Order Record
  SELECT * INTO v_order
  FROM public.wallet_topup_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Top-up order not found: %', p_order_id;
  END IF;

  IF v_order.organization_id <> p_organization_id THEN
    RAISE EXCEPTION 'Security Error: Top-up order does not belong to your organization';
  END IF;

  -- 3. Idempotency Check: Already PAID order
  IF v_order.status = 'PAID' THEN
    IF p_status = 'PAID' THEN
      SELECT * INTO v_existing_topup
      FROM public.wallet_transactions
      WHERE organization_id = p_organization_id
        AND reference_id = 'topup_order_' || p_order_id::text
        AND transaction_type = 'TOPUP'
        AND status = 'COMPLETED'
      LIMIT 1;
      v_existing_topup_found := FOUND;

      SELECT * INTO v_existing_promo
      FROM public.wallet_transactions
      WHERE organization_id = p_organization_id
        AND reference_id = 'topup_order_' || p_order_id::text || '_promo'
        AND transaction_type = 'TOPUP_CREDIT'
        AND status = 'COMPLETED'
      LIMIT 1;
      v_existing_promo_found := FOUND;

      SELECT * INTO v_wallet FROM public.organization_wallets WHERE organization_id = p_organization_id;

      RETURN jsonb_build_object(
        'success', true,
        'is_idempotent_replay', true,
        'order', to_jsonb(v_order),
        'topup_transaction', CASE WHEN v_existing_topup_found THEN to_jsonb(v_existing_topup) ELSE NULL END,
        'promo_credit_transaction', CASE WHEN v_existing_promo_found THEN to_jsonb(v_existing_promo) ELSE NULL END,
        'wallet', jsonb_build_object(
          'paid_balance', COALESCE(v_wallet.paid_balance, 0.00),
          'welcome_credit', COALESCE(v_wallet.welcome_credit, 0.00),
          'showcase_credit', COALESCE(v_wallet.showcase_credit, 0.00),
          'topup_credit', COALESCE(v_wallet.topup_credit, 0.00),
          'currency', COALESCE(v_wallet.currency, 'MYR')
        ),
        'message', 'Top-up order is already marked as PAID and credited (idempotent no-op).'
      );
    ELSE
      RAISE EXCEPTION 'Cannot change status of an already PAID top-up order (%) to %', p_order_id, p_status;
    END IF;
  END IF;

  -- 4. Terminal State Transition Protection
  IF v_order.status IN ('FAILED', 'EXPIRED', 'CANCELLED') THEN
    IF v_order.status = p_status THEN
      RETURN jsonb_build_object(
        'success', true,
        'is_idempotent_replay', true,
        'order', to_jsonb(v_order),
        'message', 'Top-up order is already in status ' || p_status || '.'
      );
    ELSE
      RAISE EXCEPTION 'Cannot change status of a % top-up order (%) to %', v_order.status, p_order_id, p_status;
    END IF;
  END IF;

  -- 5. Process Transition to PAID
  IF p_status = 'PAID' THEN
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
        topup_credit,
        currency
      ) VALUES (
        p_organization_id,
        0.00,
        0.00,
        0.00,
        0.00,
        'MYR'
      )
      RETURNING * INTO v_wallet;
    END IF;

    IF v_order.top_up_amount >= 10000.00 THEN
      v_promo_credit := ROUND(v_order.top_up_amount * 0.07, 2);
      v_tier_rate := '7%';
    ELSIF v_order.top_up_amount >= 6000.00 THEN
      v_promo_credit := ROUND(v_order.top_up_amount * 0.05, 2);
      v_tier_rate := '5%';
    ELSE
      v_promo_credit := 0.00;
      v_tier_rate := '0%';
    END IF;

    UPDATE public.wallet_topup_orders
    SET
      status = 'PAID',
      paid_at = v_now,
      updated_at = v_now,
      payment_reference = COALESCE(p_payment_reference, v_order.payment_reference),
      payment_method = COALESCE(p_payment_method, v_order.payment_method),
      notes = COALESCE(p_reason, v_order.notes),
      metadata = v_order.metadata || COALESCE(p_metadata, '{}'::jsonb)
    WHERE id = p_order_id
    RETURNING * INTO v_order;

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
      NULL,
      'TOPUP',
      'PAID_BALANCE',
      v_order.top_up_amount,
      v_order.currency,
      'COMPLETED',
      'topup_order_' || p_order_id::text,
      'Top-up Order ' || UPPER(SUBSTRING(p_order_id::text, 1, 8)),
      jsonb_build_object(
        'topup_order_id', p_order_id,
        'payment_reference', v_order.payment_reference,
        'payment_method', v_order.payment_method,
        'reason', p_reason
      ) || COALESCE(p_metadata, '{}'::jsonb),
      COALESCE(p_processed_by, v_order.user_id),
      v_now
    )
    RETURNING * INTO v_topup_txn;
    v_topup_txn_created := true;

    IF v_promo_credit > 0 THEN
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
        NULL,
        'TOPUP_CREDIT',
        'TOPUP_CREDIT',
        v_promo_credit,
        v_order.currency,
        'COMPLETED',
        'topup_order_' || p_order_id::text || '_promo',
        'Promotional ' || v_tier_rate || ' Top-up Credit on RM' || ROUND(v_order.top_up_amount, 2)::text || ' deposit',
        jsonb_build_object(
          'parent_topup_id', v_topup_txn.id,
          'topup_order_id', p_order_id,
          'qualifying_amount', v_order.top_up_amount,
          'reward_rate', v_tier_rate
        ) || COALESCE(p_metadata, '{}'::jsonb),
        COALESCE(p_processed_by, v_order.user_id),
        v_now
      )
      RETURNING * INTO v_promo_txn;
      v_promo_txn_created := true;
    END IF;

    UPDATE public.organization_wallets
    SET
      paid_balance = paid_balance + v_order.top_up_amount,
      topup_credit = topup_credit + v_promo_credit,
      updated_at = v_now
    WHERE organization_id = p_organization_id
    RETURNING * INTO v_wallet;

    RETURN jsonb_build_object(
      'success', true,
      'is_idempotent_replay', false,
      'order', to_jsonb(v_order),
      'topup_transaction', CASE WHEN v_topup_txn_created THEN to_jsonb(v_topup_txn) ELSE NULL END,
      'promo_credit_transaction', CASE WHEN v_promo_txn_created THEN to_jsonb(v_promo_txn) ELSE NULL END,
      'wallet', jsonb_build_object(
        'paid_balance', v_wallet.paid_balance,
        'welcome_credit', v_wallet.welcome_credit,
        'showcase_credit', v_wallet.showcase_credit,
        'topup_credit', v_wallet.topup_credit,
        'currency', v_wallet.currency
      ),
      'message', 'Top-up order successfully marked as PAID. Wallet credited with RM' || ROUND(v_order.top_up_amount, 2)::text || ' cash balance and RM' || ROUND(v_promo_credit, 2)::text || ' promotional credits.'
    );
  END IF;

  -- 6. Process Non-PAID Transitions (FAILED, EXPIRED, CANCELLED)
  IF p_status = 'FAILED' THEN
    UPDATE public.wallet_topup_orders
    SET
      status = 'FAILED',
      failed_at = v_now,
      updated_at = v_now,
      notes = COALESCE(p_reason, notes),
      metadata = metadata || COALESCE(p_metadata, '{}'::jsonb)
    WHERE id = p_order_id
    RETURNING * INTO v_order;

    RETURN jsonb_build_object(
      'success', true,
      'is_idempotent_replay', false,
      'order', to_jsonb(v_order),
      'message', 'Top-up order marked as FAILED. No funds or credits were added to the wallet.'
    );
  ELSIF p_status = 'EXPIRED' THEN
    UPDATE public.wallet_topup_orders
    SET
      status = 'EXPIRED',
      expired_at = v_now,
      updated_at = v_now,
      notes = COALESCE(p_reason, notes),
      metadata = metadata || COALESCE(p_metadata, '{}'::jsonb)
    WHERE id = p_order_id
    RETURNING * INTO v_order;

    RETURN jsonb_build_object(
      'success', true,
      'is_idempotent_replay', false,
      'order', to_jsonb(v_order),
      'message', 'Top-up order marked as EXPIRED. No funds or credits were added to the wallet.'
    );
  ELSIF p_status = 'CANCELLED' THEN
    UPDATE public.wallet_topup_orders
    SET
      status = 'CANCELLED',
      cancelled_at = v_now,
      updated_at = v_now,
      notes = COALESCE(p_reason, notes),
      metadata = metadata || COALESCE(p_metadata, '{}'::jsonb)
    WHERE id = p_order_id
    RETURNING * INTO v_order;

    RETURN jsonb_build_object(
      'success', true,
      'is_idempotent_replay', false,
      'order', to_jsonb(v_order),
      'message', 'Top-up order marked as CANCELLED. No funds or credits were added to the wallet.'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', false,
    'error', 'Unhandled order status transition: ' || p_status
  );
END;
$$;


-- 3. FIX process_event_payment_atomic RPC
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.process_event_payment_atomic(
  p_organization_id UUID,
  p_event_id UUID,
  p_payment_mode TEXT,
  p_event_price NUMERIC,
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
    -- Server-Authoritative: Event's own stored price takes precedence
    v_event_price := COALESCE(v_event.event_price, p_event_price, 1400.00);
  ELSE
    v_event_price := COALESCE(p_event_price, 1400.00);
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

  -- 5. Calculate and validate business rules for payment mode based on authoritative v_event_price
  IF p_payment_mode = 'FULL_PAID' THEN
    v_credit_to_use := 0.00;
    v_paid_to_use := v_event_price;

    IF v_wallet.paid_balance < v_paid_to_use THEN
      RAISE EXCEPTION 'Insufficient Paid Balance. Event price is RM%, but available Paid Balance is RM%.',
        ROUND(v_paid_to_use, 2)::text, ROUND(v_wallet.paid_balance, 2)::text;
    END IF;

  ELSIF p_payment_mode = 'WELCOME_CREDIT' THEN
    v_credit_balance_type := 'WELCOME_CREDIT';
    v_welcome_to_use := LEAST(800.00, v_wallet.welcome_credit, v_event_price);
    v_credit_to_use := v_welcome_to_use;
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
    v_showcase_to_use := LEAST(300.00, v_wallet.showcase_credit, v_event_price);
    v_credit_to_use := v_showcase_to_use;
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

    IF p_topup_credit_requested > 0 THEN
      IF p_topup_credit_requested > v_max_cap THEN
        RAISE EXCEPTION 'Top-up Credit cannot exceed 20%% of event price (Max RM%).', ROUND(v_max_cap, 2)::text;
      END IF;
      v_req := p_topup_credit_requested;
    ELSE
      v_req := v_max_cap;
    END IF;

    v_topup_to_use := LEAST(v_wallet.topup_credit, v_max_cap, v_req, v_event_price);
    v_credit_to_use := v_topup_to_use;
    v_paid_to_use := v_event_price - v_credit_to_use;

    IF v_credit_to_use <= 0 AND v_wallet.topup_credit <= 0 THEN
      RAISE EXCEPTION 'No Top-up Credit available in wallet.';
    END IF;

    IF v_wallet.paid_balance < v_paid_to_use THEN
      RAISE EXCEPTION 'Insufficient Paid Balance for Top-up Credit payment. Required: RM%, Available: RM%.',
        ROUND(v_paid_to_use, 2)::text, ROUND(v_wallet.paid_balance, 2)::text;
    END IF;

  ELSIF p_payment_mode = 'COMBINED_CREDIT' THEN
    -- Welcome credit component
    v_welcome_to_use := LEAST(800.00, v_wallet.welcome_credit, v_event_price);
    
    -- Topup credit component (20% cap)
    v_max_cap := ROUND(v_event_price * 0.20, 2);
    IF p_topup_credit_requested > 0 THEN
      v_req := LEAST(p_topup_credit_requested, v_max_cap);
    ELSE
      v_req := v_max_cap;
    END IF;
    
    v_topup_to_use := LEAST(v_wallet.topup_credit, v_max_cap, v_req, v_event_price - v_welcome_to_use);
    v_credit_to_use := v_welcome_to_use + v_topup_to_use;
    v_paid_to_use := v_event_price - v_credit_to_use;

    IF v_wallet.paid_balance < v_paid_to_use THEN
      RAISE EXCEPTION 'Insufficient Paid Balance for Combined Credit payment. Required: RM%, Available: RM%.',
        ROUND(v_paid_to_use, 2)::text, ROUND(v_wallet.paid_balance, 2)::text;
    END IF;
  END IF;

  -- 6. Insert promotional credit transaction(s) into ledger if used
  IF p_payment_mode = 'COMBINED_CREDIT' THEN
    IF v_welcome_to_use > 0 THEN
      v_credit_ref := COALESCE(p_reference_id || '_welcome_credit', 'event_' || p_event_id::text || '_welcome_credit');
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
        'WELCOME_CREDIT',
        -v_welcome_to_use,
        'MYR',
        'COMPLETED',
        v_credit_ref,
        COALESCE(p_description, 'Applied RM' || ROUND(v_welcome_to_use, 2)::text || ' Welcome Credit discount'),
        p_metadata || jsonb_build_object(
          'event_id', p_event_id,
          'payment_mode', p_payment_mode,
          'credit_type', 'WELCOME_CREDIT',
          'credit_discount', v_welcome_to_use,
          'event_price', v_event_price
        ),
        p_created_by,
        v_now
      )
      RETURNING * INTO v_credit_txn;
      v_credit_txn_created := true;

      UPDATE public.organization_wallets
      SET welcome_credit = welcome_credit - v_welcome_to_use,
          updated_at = v_now
      WHERE organization_id = p_organization_id;
    END IF;

    IF v_topup_to_use > 0 THEN
      v_topup_ref := COALESCE(p_reference_id || '_topup_credit', 'event_' || p_event_id::text || '_topup_credit');
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
        'TOPUP_CREDIT',
        -v_topup_to_use,
        'MYR',
        'COMPLETED',
        v_topup_ref,
        COALESCE(p_description, 'Applied RM' || ROUND(v_topup_to_use, 2)::text || ' Event Credit discount'),
        p_metadata || jsonb_build_object(
          'event_id', p_event_id,
          'payment_mode', p_payment_mode,
          'credit_type', 'TOPUP_CREDIT',
          'credit_discount', v_topup_to_use,
          'event_price', v_event_price
        ),
        p_created_by,
        v_now
      )
      RETURNING * INTO v_topup_credit_txn;
      v_topup_credit_txn_created := true;

      UPDATE public.organization_wallets
      SET topup_credit = topup_credit - v_topup_to_use,
          updated_at = v_now
      WHERE organization_id = p_organization_id;
    END IF;
  ELSE
    IF v_credit_to_use > 0 THEN
      v_credit_ref := COALESCE(p_reference_id || '_credit', 'event_' || p_event_id::text || '_credit');
      
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
        COALESCE(p_description, 'Applied RM' || ROUND(v_credit_to_use, 2)::text || ' ' || replace(p_payment_mode, '_', ' ') || ' discount'),
        p_metadata || jsonb_build_object(
          'event_id', p_event_id,
          'payment_mode', p_payment_mode,
          'credit_discount', v_credit_to_use,
          'event_price', v_event_price
        ),
        p_created_by,
        v_now
      )
      RETURNING * INTO v_credit_txn;
      v_credit_txn_created := true;

      -- Deduct credit balance from wallet
      IF v_credit_balance_type = 'WELCOME_CREDIT' THEN
        UPDATE public.organization_wallets
        SET welcome_credit = welcome_credit - v_credit_to_use,
            updated_at = v_now
        WHERE organization_id = p_organization_id;
      ELSIF v_credit_balance_type = 'SHOWCASE_CREDIT' THEN
        UPDATE public.organization_wallets
        SET showcase_credit = showcase_credit - v_credit_to_use,
            updated_at = v_now
        WHERE organization_id = p_organization_id;
      ELSIF v_credit_balance_type = 'TOPUP_CREDIT' THEN
        UPDATE public.organization_wallets
        SET topup_credit = topup_credit - v_credit_to_use,
            updated_at = v_now
        WHERE organization_id = p_organization_id;
      END IF;
    END IF;
  END IF;

  -- 7. Insert paid balance payment transaction into ledger
  IF v_paid_to_use > 0 THEN
    v_paid_ref := COALESCE(p_reference_id || '_paid', 'event_' || p_event_id::text || '_paid');

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
      COALESCE(p_description, 'Paid RM' || ROUND(v_paid_to_use, 2)::text || ' from Paid Balance for Event'),
      p_metadata || jsonb_build_object(
        'event_id', p_event_id,
        'payment_mode', p_payment_mode,
        'paid_amount', v_paid_to_use,
        'event_price', v_event_price
      ),
      p_created_by,
      v_now
    )
    RETURNING * INTO v_paid_txn;
    v_paid_txn_created := true;

    -- Deduct paid balance from wallet
    UPDATE public.organization_wallets
    SET paid_balance = paid_balance - v_paid_to_use,
        updated_at = v_now
    WHERE organization_id = p_organization_id;
  END IF;

  -- 8. Refresh wallet record
  SELECT * INTO v_wallet FROM public.organization_wallets WHERE organization_id = p_organization_id;

  -- 9. Mark Event as PAID in events table (and promote pending_payment to scheduled)
  IF v_event.id IS NOT NULL THEN
    UPDATE public.events
    SET payment_status = 'PAID',
        payment_mode = p_payment_mode,
        paid_amount = v_paid_to_use,
        discount_amount = v_credit_to_use,
        event_price = v_event_price,
        event_currency = 'MYR',
        status = CASE WHEN status = 'pending_payment' THEN 'scheduled' ELSE status END,
        event_status = 'LIVE',
        updated_at = v_now
    WHERE id = p_event_id;
  END IF;

  -- 10. Return JSON result payload
  RETURN jsonb_build_object(
    'success', true,
    'event_id', p_event_id,
    'payment_mode', p_payment_mode,
    'event_price', v_event_price,
    'paid_amount', v_paid_to_use,
    'discount_amount', v_credit_to_use,
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
