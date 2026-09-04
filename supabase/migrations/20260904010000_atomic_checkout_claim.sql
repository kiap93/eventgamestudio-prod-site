-- Migration: 20260904010000_atomic_checkout_claim.sql
-- Description: Introduces claim_checkout_session_creation and release_checkout_session_claim
--              for database-authoritative distributed concurrency locking across worker instances.
-- Architecture: Strategy B - Post-baseline migration.

-- ------------------------------------------------------------------------------
-- ATOMIC DISTRIBUTED CHECKOUT CLAIM & CONCURRENCY LOCK
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_checkout_session_creation(
  p_order_id UUID,
  p_claim_id TEXT,
  p_timeout_seconds INT DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.wallet_topup_orders%ROWTYPE;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
  v_in_progress BOOLEAN := false;
  v_claimed_at TIMESTAMPTZ;
  v_claimed_by TEXT;
  v_current_attempt INT := 0;
  v_new_attempt INT := 1;
  v_timeout_seconds INT := GREATEST(5, LEAST(120, COALESCE(p_timeout_seconds, 30)));
  v_session_id TEXT;
  v_checkout_url TEXT;
  v_expires_at TIMESTAMPTZ;
  v_is_cancelled BOOLEAN := false;
BEGIN
  -- 1. Lock the top-up order exclusively
  SELECT * INTO v_order
  FROM public.wallet_topup_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'claimed', false,
      'error', 'order_not_found',
      'message', 'Top-up order not found'
    );
  END IF;

  -- 2. Verify status is PENDING
  IF v_order.status != 'PENDING' THEN
    RETURN jsonb_build_object(
      'success', false,
      'claimed', false,
      'error', 'order_not_pending',
      'status', v_order.status,
      'message', 'Cannot checkout order in status ' || v_order.status
    );
  END IF;

  -- 3. Check if there is already an active, valid session on this order
  v_session_id := COALESCE(v_order.metadata->>'stripe_session_id', v_order.metadata->>'sessionId');
  v_checkout_url := v_order.metadata->>'checkout_url';
  v_expires_at := NULLIF(v_order.metadata->>'checkout_expires_at', '')::TIMESTAMPTZ;
  IF v_expires_at IS NULL THEN
    v_expires_at := v_order.expired_at;
  END IF;

  v_is_cancelled := COALESCE((v_order.metadata->>'checkout_cancelled')::boolean, false)
                 OR COALESCE((v_order.metadata->>'session_status' = 'cancelled'), false)
                 OR (v_order.metadata->>'cancelled_at' IS NOT NULL);

  IF v_session_id IS NOT NULL AND v_session_id != '' AND NOT v_is_cancelled THEN
    IF v_expires_at IS NULL OR v_expires_at > v_now THEN
      RETURN jsonb_build_object(
        'success', true,
        'claimed', false,
        'already_has_session', true,
        'session_id', v_session_id,
        'checkout_url', v_checkout_url,
        'expires_at', v_expires_at,
        'order', to_jsonb(v_order),
        'message', 'Active checkout session already exists on order'
      );
    END IF;
  END IF;

  -- 4. Check if another worker currently holds an active, unexpired claim
  v_in_progress := COALESCE((v_order.metadata->>'checkout_in_progress')::boolean, false);
  v_claimed_at := NULLIF(v_order.metadata->>'checkout_claimed_at', '')::TIMESTAMPTZ;
  v_claimed_by := v_order.metadata->>'checkout_claim_id';
  v_current_attempt := COALESCE((v_order.metadata->>'checkout_attempt')::int, 0);

  IF v_in_progress AND v_claimed_at IS NOT NULL AND (v_now - v_claimed_at) < (v_timeout_seconds || ' seconds')::interval THEN
    IF v_claimed_by = p_claim_id THEN
      RETURN jsonb_build_object(
        'success', true,
        'claimed', true,
        'attempt', v_current_attempt,
        'claim_id', p_claim_id,
        'order', to_jsonb(v_order),
        'message', 'Existing claim re-acquired by same caller'
      );
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'claimed', false,
      'in_progress', true,
      'wait_required', true,
      'attempt', v_current_attempt,
      'claimed_at', v_claimed_at,
      'order', to_jsonb(v_order),
      'message', 'Checkout session creation in progress by another worker'
    );
  END IF;

  -- 5. No active claim or previous claim timed out. THIS REQUEST WINS THE CLAIM!
  v_new_attempt := v_current_attempt + 1;

  UPDATE public.wallet_topup_orders
  SET
    metadata = v_order.metadata || jsonb_build_object(
      'checkout_in_progress', true,
      'checkout_claim_id', p_claim_id,
      'checkout_claimed_at', v_now,
      'checkout_attempt', v_new_attempt
    ),
    updated_at = v_now
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  RETURN jsonb_build_object(
    'success', true,
    'claimed', true,
    'in_progress', true,
    'wait_required', false,
    'attempt', v_new_attempt,
    'claim_id', p_claim_id,
    'order', to_jsonb(v_order),
    'message', 'Checkout creation claim acquired'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.release_checkout_session_claim(
  p_order_id UUID,
  p_claim_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.wallet_topup_orders%ROWTYPE;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
  v_claimed_by TEXT;
BEGIN
  SELECT * INTO v_order
  FROM public.wallet_topup_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'order_not_found');
  END IF;

  v_claimed_by := v_order.metadata->>'checkout_claim_id';

  IF p_claim_id IS NULL OR v_claimed_by = p_claim_id THEN
    UPDATE public.wallet_topup_orders
    SET
      metadata = v_order.metadata || jsonb_build_object(
        'checkout_in_progress', false,
        'checkout_claim_id', null
      ),
      updated_at = v_now
    WHERE id = p_order_id
    RETURNING * INTO v_order;

    RETURN jsonb_build_object('success', true, 'released', true, 'order', to_jsonb(v_order));
  END IF;

  RETURN jsonb_build_object('success', true, 'released', false, 'message', 'Claim held by different worker');
END;
$$;

REVOKE ALL ON FUNCTION public.claim_checkout_session_creation(UUID, TEXT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_checkout_session_creation(UUID, TEXT, INT) FROM anon;
REVOKE ALL ON FUNCTION public.claim_checkout_session_creation(UUID, TEXT, INT) FROM authenticated;

REVOKE ALL ON FUNCTION public.release_checkout_session_claim(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_checkout_session_claim(UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.release_checkout_session_claim(UUID, TEXT) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.claim_checkout_session_creation(UUID, TEXT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_checkout_session_creation(UUID, TEXT, INT) TO postgres;

GRANT EXECUTE ON FUNCTION public.release_checkout_session_claim(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_checkout_session_claim(UUID, TEXT) TO postgres;

NOTIFY pgrst, 'reload schema';
