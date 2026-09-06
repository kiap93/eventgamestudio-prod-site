-- Migration: 20260906020000_atomic_showcase_credit_reward.sql
-- Description: Implement atomic PostgreSQL RPC and unique constraints to guarantee that
-- an organization can receive at most ONE RM300 showcase reward, preventing race conditions
-- from concurrent admin approval requests.

-- 1. Database-Level Unique Constraint (Option A)
-- Guarantee that at the table engine level, only ONE completed SHOWCASE_CREDIT transaction can ever exist per organization.
CREATE UNIQUE INDEX IF NOT EXISTS ux_wallet_txns_org_showcase_credit_unique
  ON public.wallet_transactions (organization_id)
  WHERE transaction_type = 'SHOWCASE_CREDIT' AND status = 'COMPLETED';

CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_tx_org_showcase_credit_unique
  ON public.wallet_transactions (organization_id)
  WHERE transaction_type = 'SHOWCASE_CREDIT' AND status = 'COMPLETED';

-- 2. Atomic PostgreSQL RPC (Option B)
-- Locks the organization wallet row with FOR UPDATE to serialize concurrent requests,
-- checks inside the critical section if a completed SHOWCASE_CREDIT transaction exists,
-- inserts the immutable ledger transaction, and updates the wallet showcase_credit balance
-- in a single atomic database transaction.
CREATE OR REPLACE FUNCTION public.grant_showcase_credit_atomic(
  p_organization_id UUID,
  p_event_id UUID DEFAULT NULL,
  p_created_by UUID DEFAULT NULL,
  p_reference_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_wallet public.organization_wallets%ROWTYPE;
  v_existing_credit public.wallet_transactions%ROWTYPE;
  v_new_txn public.wallet_transactions%ROWTYPE;
  v_reference_id TEXT;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
  v_credit_amount NUMERIC := 300.00;
  v_paid NUMERIC;
  v_welcome NUMERIC;
  v_showcase NUMERIC;
  v_topup NUMERIC;
  v_outstanding NUMERIC;
BEGIN
  -- 1. Input Validation
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'Organization ID is required';
  END IF;

  -- 2. Ensure organization wallet exists
  INSERT INTO public.organization_wallets (
    organization_id,
    paid_balance,
    welcome_credit,
    showcase_credit,
    topup_credit,
    outstanding_balance,
    created_at,
    updated_at
  ) VALUES (
    p_organization_id,
    0.00,
    0.00,
    0.00,
    0.00,
    0.00,
    v_now,
    v_now
  )
  ON CONFLICT (organization_id) DO NOTHING;

  -- 3. Lock organization wallet row with FOR UPDATE
  -- This serializes concurrent requests for the same organization
  SELECT * INTO v_wallet
  FROM public.organization_wallets
  WHERE organization_id = p_organization_id
  FOR UPDATE;

  -- 4. Inside the serialized critical section, check if a completed SHOWCASE_CREDIT already exists
  SELECT * INTO v_existing_credit
  FROM public.wallet_transactions
  WHERE organization_id = p_organization_id
    AND transaction_type = 'SHOWCASE_CREDIT'
    AND status = 'COMPLETED'
  LIMIT 1;

  IF FOUND THEN
    v_paid := COALESCE(v_wallet.paid_balance, 0.00);
    v_welcome := COALESCE(v_wallet.welcome_credit, 0.00);
    v_showcase := COALESCE(v_wallet.showcase_credit, 0.00);
    v_topup := COALESCE(v_wallet.topup_credit, 0.00);
    v_outstanding := COALESCE(v_wallet.outstanding_balance, 0.00);

    RETURN jsonb_build_object(
      'success', true,
      'already_granted', true,
      'transaction', to_jsonb(v_existing_credit),
      'wallet', jsonb_build_object(
        'organization_id', p_organization_id,
        'paid_balance', v_paid,
        'welcome_credit', v_welcome,
        'showcase_credit', v_showcase,
        'topup_credit', v_topup,
        'outstanding_balance', v_outstanding,
        'total_balance', v_paid + v_welcome + v_showcase + v_topup
      ),
      'message', 'Showcase Credit has already been granted to this organization (one-time reward).'
    );
  END IF;

  -- 5. Insert new ledger transaction
  v_reference_id := COALESCE(p_reference_id, 'showcase_' || p_organization_id::text);

  INSERT INTO public.wallet_transactions (
    id,
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
    gen_random_uuid(),
    p_organization_id,
    p_event_id,
    'SHOWCASE_CREDIT',
    'SHOWCASE_CREDIT',
    v_credit_amount,
    'MYR',
    'COMPLETED',
    v_reference_id,
    'One-time Event Showcase completion reward credit of RM' || to_char(v_credit_amount, 'FM999,990.00'),
    p_metadata || jsonb_build_object(
      'program', 'EVENT_SHOWCASE_APPROVED_REWARD',
      'event_id', p_event_id
    ),
    p_created_by,
    v_now
  )
  RETURNING * INTO v_new_txn;

  -- 6. Update locked organization wallet balance
  UPDATE public.organization_wallets
  SET showcase_credit = COALESCE(showcase_credit, 0.00) + v_credit_amount,
      updated_at = v_now
  WHERE organization_id = p_organization_id
  RETURNING * INTO v_wallet;

  v_paid := COALESCE(v_wallet.paid_balance, 0.00);
  v_welcome := COALESCE(v_wallet.welcome_credit, 0.00);
  v_showcase := COALESCE(v_wallet.showcase_credit, 0.00);
  v_topup := COALESCE(v_wallet.topup_credit, 0.00);
  v_outstanding := COALESCE(v_wallet.outstanding_balance, 0.00);

  RETURN jsonb_build_object(
    'success', true,
    'already_granted', false,
    'transaction', to_jsonb(v_new_txn),
    'wallet', jsonb_build_object(
      'organization_id', p_organization_id,
      'paid_balance', v_paid,
      'welcome_credit', v_welcome,
      'showcase_credit', v_showcase,
      'topup_credit', v_topup,
      'outstanding_balance', v_outstanding,
      'total_balance', v_paid + v_welcome + v_showcase + v_topup
    ),
    'message', 'Successfully granted RM' || to_char(v_credit_amount, 'FM999,990.00') || ' Showcase Reward Credit!'
  );
END;
$$;

-- 3. Security Permissions: Grant execute exclusively to service_role (Backend-Write-Only)
GRANT EXECUTE ON FUNCTION public.grant_showcase_credit_atomic(UUID, UUID, UUID, TEXT, JSONB) TO service_role;
REVOKE EXECUTE ON FUNCTION public.grant_showcase_credit_atomic(UUID, UUID, UUID, TEXT, JSONB) FROM authenticated, anon, public;
