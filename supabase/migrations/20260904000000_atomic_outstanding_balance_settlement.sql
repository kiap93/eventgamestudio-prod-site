-- Migration: 20260904000000_atomic_outstanding_balance_settlement.sql
-- Description: Upgrades process_topup_order_atomic to atomically deduct outstanding balance
--              included in wallet top-up orders upon settlement, preventing race conditions.
-- Architecture: Strategy B - Post-baseline migration.

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
  v_included_outstanding NUMERIC(12,2) := 0.00;
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
          'outstanding_balance', COALESCE(v_wallet.outstanding_balance, 0.00),
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
        outstanding_balance,
        currency
      ) VALUES (
        p_organization_id,
        0.00,
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

    -- Extract included outstanding balance from order record or metadata
    v_included_outstanding := GREATEST(
      0.00,
      COALESCE(
        NULLIF(v_order.included_outstanding_amount, 0),
        NULLIF((v_order.metadata->>'included_outstanding_amount'), '')::numeric,
        NULLIF((p_metadata->>'included_outstanding_amount'), '')::numeric,
        0.00
      )
    );

    -- ATOMIC UPDATE: Credit paid balance and top-up credit while simultaneously deducting outstanding balance
    UPDATE public.organization_wallets
    SET
      paid_balance = paid_balance + v_order.top_up_amount,
      topup_credit = topup_credit + v_promo_credit,
      outstanding_balance = GREATEST(0.00, COALESCE(outstanding_balance, 0.00) - v_included_outstanding),
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
        'outstanding_balance', COALESCE(v_wallet.outstanding_balance, 0.00),
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

  RAISE EXCEPTION 'Unsupported status transition: %', p_status;
END;
$$;

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
BEGIN
  -- Authoritative settlement is delegated directly to the canonical process_topup_order_atomic function
  RETURN public.process_topup_order_atomic(
    p_order_id := p_order_id,
    p_organization_id := p_organization_id,
    p_status := p_status,
    p_payment_reference := p_payment_reference,
    p_payment_method := p_payment_method,
    p_processed_by := p_processed_by,
    p_reason := p_reason,
    p_metadata := p_metadata
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.settle_wallet_topup_order_atomic(
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
BEGIN
  RETURN public.process_topup_order_atomic(
    p_order_id := p_order_id,
    p_organization_id := p_organization_id,
    p_status := p_status,
    p_payment_reference := p_payment_reference,
    p_payment_method := p_payment_method,
    p_processed_by := p_processed_by,
    p_reason := p_reason,
    p_metadata := p_metadata
  );
END;
$$;

-- Security grant & revoke privileges
REVOKE ALL ON FUNCTION public.settle_wallet_topup_order(UUID, UUID, TEXT, TEXT, TEXT, UUID, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.settle_wallet_topup_order(UUID, UUID, TEXT, TEXT, TEXT, UUID, TEXT, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.settle_wallet_topup_order(UUID, UUID, TEXT, TEXT, TEXT, UUID, TEXT, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.settle_wallet_topup_order(UUID, UUID, TEXT, TEXT, TEXT, UUID, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_wallet_topup_order(UUID, UUID, TEXT, TEXT, TEXT, UUID, TEXT, JSONB) TO postgres;

REVOKE ALL ON FUNCTION public.process_topup_order_atomic(UUID, UUID, TEXT, TEXT, TEXT, UUID, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_topup_order_atomic(UUID, UUID, TEXT, TEXT, TEXT, UUID, TEXT, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.process_topup_order_atomic(UUID, UUID, TEXT, TEXT, TEXT, UUID, TEXT, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.process_topup_order_atomic(UUID, UUID, TEXT, TEXT, TEXT, UUID, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.process_topup_order_atomic(UUID, UUID, TEXT, TEXT, TEXT, UUID, TEXT, JSONB) TO postgres;

NOTIFY pgrst, 'reload schema';
