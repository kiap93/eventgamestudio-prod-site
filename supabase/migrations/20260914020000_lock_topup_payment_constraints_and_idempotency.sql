-- Migration: 20260914020000_lock_topup_payment_constraints_and_idempotency.sql
-- Description: Production database constraints and security hardening for wallet top-up payment settlement:
--   1. Unique constraint on wallet_transactions (reference_id) for global idempotency
--   2. Unique constraint on wallet_topup_orders (payment_reference) for PAID orders
--   3. Unique constraint on wallet_topup_orders (stripe_session_id) for PAID orders
--   4. Unique constraint on wallet_topup_orders (stripe_payment_intent) for PAID orders
--   5. Dedup table for payment_webhook_events
--   6. Hardened process_topup_order_atomic with currency matching and trusted settlement validation.

-- 1. Unique constraint on wallet_transactions (reference_id)
CREATE UNIQUE INDEX IF NOT EXISTS ux_wallet_txns_reference_id_unique
  ON public.wallet_transactions (reference_id)
  WHERE reference_id IS NOT NULL AND status IN ('COMPLETED', 'PENDING');

-- 2. Unique constraint on wallet_topup_orders (payment_reference) for PAID orders
CREATE UNIQUE INDEX IF NOT EXISTS ux_wallet_topup_orders_paid_payment_ref
  ON public.wallet_topup_orders (payment_reference)
  WHERE payment_reference IS NOT NULL AND status = 'PAID';

-- 3. Unique index for Stripe Checkout Session ID on settled orders
CREATE UNIQUE INDEX IF NOT EXISTS ux_wallet_topup_orders_paid_stripe_session
  ON public.wallet_topup_orders ((metadata->>'stripe_session_id'))
  WHERE (metadata->>'stripe_session_id') IS NOT NULL AND status = 'PAID';

-- 4. Unique index for Stripe Payment Intent ID on settled orders
CREATE UNIQUE INDEX IF NOT EXISTS ux_wallet_topup_orders_paid_payment_intent
  ON public.wallet_topup_orders ((metadata->>'stripe_payment_intent'))
  WHERE (metadata->>'stripe_payment_intent') IS NOT NULL AND status = 'PAID';

-- 5. Payment Webhook Events Table for Deduplication & Auditing
CREATE TABLE IF NOT EXISTS public.payment_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL DEFAULT 'stripe',
  event_type TEXT NOT NULL,
  order_id UUID REFERENCES public.wallet_topup_orders(id) ON DELETE SET NULL,
  status TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_order_id ON public.payment_webhook_events (order_id);
CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_created_at ON public.payment_webhook_events (created_at DESC);

ALTER TABLE public.payment_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages payment webhook events" ON public.payment_webhook_events;
CREATE POLICY "Service role manages payment webhook events"
  ON public.payment_webhook_events FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 6. Hardened process_topup_order_atomic Function
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
  v_resolved_payment_ref TEXT;
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
    -- A. Security Gate: Verify trusted settlement flag
    IF (COALESCE(p_metadata->>'is_trusted_settlement', 'false') <> 'true') AND (CURRENT_USER NOT IN ('postgres', 'service_role')) THEN
      RAISE EXCEPTION 'Security Error: Top-up order status transition to PAID requires trusted settlement verification';
    END IF;

    -- B. Payment Reference Validation
    v_resolved_payment_ref := COALESCE(p_payment_reference, v_order.payment_reference);
    IF v_resolved_payment_ref IS NULL OR LENGTH(TRIM(v_resolved_payment_ref)) = 0 THEN
      RAISE EXCEPTION 'Security Error: Transition to PAID requires a valid non-empty payment reference';
    END IF;

    -- C. Lock Organization Wallet & Verify Currency
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
        COALESCE(v_order.currency, 'MYR')
      )
      RETURNING * INTO v_wallet;
    END IF;

    -- Currency Match Enforcement: Order currency MUST match Wallet currency
    IF v_wallet.currency IS NOT NULL AND v_order.currency IS NOT NULL AND UPPER(v_order.currency) <> UPPER(v_wallet.currency) THEN
      RAISE EXCEPTION 'Currency mismatch: Top-up order currency (%) does not match organization wallet currency (%)', v_order.currency, v_wallet.currency;
    END IF;

    -- D. Calculate Qualifying Promotional Credit
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

    -- E. Update Order Record
    UPDATE public.wallet_topup_orders
    SET
      status = 'PAID',
      paid_at = v_now,
      updated_at = v_now,
      payment_reference = v_resolved_payment_ref,
      payment_method = COALESCE(p_payment_method, v_order.payment_method),
      notes = COALESCE(p_reason, v_order.notes),
      metadata = v_order.metadata || COALESCE(p_metadata, '{}'::jsonb)
    WHERE id = p_order_id
    RETURNING * INTO v_order;

    -- F. Insert Paid Balance Transaction (Protected by ux_wallet_txns_org_reference & ux_wallet_txns_reference_id_unique)
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
      p_processed_by,
      v_now
    )
    RETURNING * INTO v_topup_txn;
    v_topup_txn_created := true;

    -- G. Insert Promotional Credit Transaction if qualified
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
        'Top-up Reward Credit (' || v_tier_rate || ' Tier Bonus for Order ' || UPPER(SUBSTRING(p_order_id::text, 1, 8)) || ')',
        jsonb_build_object(
          'topup_order_id', p_order_id,
          'qualifying_topup_amount', v_order.top_up_amount,
          'tier_rate', v_tier_rate
        ) || COALESCE(p_metadata, '{}'::jsonb),
        p_processed_by,
        v_now
      )
      RETURNING * INTO v_promo_txn;
      v_promo_txn_created := true;
    END IF;

    -- H. Resolve Included Outstanding Balance
    v_included_outstanding := GREATEST(
      0.00,
      COALESCE((v_order.metadata->>'included_outstanding_amount')::numeric, 0.00),
      COALESCE((p_metadata->>'included_outstanding_amount')::numeric, 0.00)
    );

    IF v_included_outstanding > 0 AND v_wallet.outstanding_balance > 0 THEN
      v_included_outstanding := LEAST(v_included_outstanding, v_wallet.outstanding_balance);
    ELSE
      v_included_outstanding := 0.00;
    END IF;

    -- I. Update Organization Wallet Balances Atomically
    UPDATE public.organization_wallets
    SET
      paid_balance = paid_balance + v_order.top_up_amount,
      topup_credit = topup_credit + v_promo_credit,
      outstanding_balance = GREATEST(0.00, outstanding_balance - v_included_outstanding),
      updated_at = v_now
    WHERE organization_id = p_organization_id
    RETURNING * INTO v_wallet;

  -- 6. Process Non-PAID Status Transitions (FAILED, EXPIRED, CANCELLED)
  ELSE
    UPDATE public.wallet_topup_orders
    SET
      status = p_status,
      failed_at = CASE WHEN p_status = 'FAILED' THEN v_now ELSE failed_at END,
      expired_at = CASE WHEN p_status = 'EXPIRED' THEN v_now ELSE expired_at END,
      cancelled_at = CASE WHEN p_status = 'CANCELLED' THEN v_now ELSE cancelled_at END,
      notes = COALESCE(p_reason, notes),
      metadata = metadata || COALESCE(p_metadata, '{}'::jsonb),
      updated_at = v_now
    WHERE id = p_order_id
    RETURNING * INTO v_order;

    SELECT * INTO v_wallet FROM public.organization_wallets WHERE organization_id = p_organization_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'is_idempotent_replay', false,
    'order', to_jsonb(v_order),
    'topup_transaction', CASE WHEN v_topup_txn_created THEN to_jsonb(v_topup_txn) ELSE NULL END,
    'promo_credit_transaction', CASE WHEN v_promo_txn_created THEN to_jsonb(v_promo_txn) ELSE NULL END,
    'wallet', jsonb_build_object(
      'paid_balance', COALESCE(v_wallet.paid_balance, 0.00),
      'welcome_credit', COALESCE(v_wallet.welcome_credit, 0.00),
      'showcase_credit', COALESCE(v_wallet.showcase_credit, 0.00),
      'topup_credit', COALESCE(v_wallet.topup_credit, 0.00),
      'outstanding_balance', COALESCE(v_wallet.outstanding_balance, 0.00),
      'currency', COALESCE(v_wallet.currency, 'MYR')
    ),
    'message', 'Top-up order ' || p_order_id || ' status successfully updated to ' || p_status || '.'
  );
END;
$$;
