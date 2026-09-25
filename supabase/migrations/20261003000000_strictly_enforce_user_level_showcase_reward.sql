-- ============================================================================
-- Migration: 20261003000000_strictly_enforce_user_level_showcase_reward.sql
-- Description: Strictly enforce ONE-TIME PER USER/ACCOUNT OWNER lifetime
--              RM300 Showcase Reward invariant at the database level.
--
-- Business Rules:
-- 1. Showcase Reward is strictly ONE-TIME PER USER/ACCOUNT OWNER lifetime.
-- 2. It is NOT per-event or per-organization.
-- 3. Database uniqueness constraints:
--    - ux_user_rewards_user_showcase_lifetime: strictly 1 row per user for ANY showcase reward type.
--    - ux_showcase_reward_submissions_user_approved: strictly 1 APPROVED submission per user.
--    - ux_showcase_reward_submissions_user_pending: strictly 1 PENDING submission per user.
-- 4. Update approve_first_event_showcase_reward_atomic RPC to check user_rewards,
--    showcase_reward_submissions, and wallet_transactions across all events.
-- ============================================================================

-- 1. Ensure partial unique index across all showcase reward types in user_rewards
CREATE UNIQUE INDEX IF NOT EXISTS ux_user_rewards_user_showcase_lifetime
  ON public.user_rewards (user_id)
  WHERE reward_type IN ('SHOWCASE_CREDIT', 'SHOWCASE_REWARD', 'SHOWCASE_REWARD_RM300');

-- 2. Ensure partial unique index on showcase_reward_submissions for approved submissions
CREATE UNIQUE INDEX IF NOT EXISTS ux_showcase_reward_submissions_user_approved
  ON public.showcase_reward_submissions (user_id)
  WHERE status = 'APPROVED';

-- 3. Ensure partial unique index on showcase_reward_submissions for pending submissions
CREATE UNIQUE INDEX IF NOT EXISTS ux_showcase_reward_submissions_user_pending
  ON public.showcase_reward_submissions (user_id)
  WHERE status = 'PENDING';

-- 4. Update the atomic approval function to check all lifetime conditions
CREATE OR REPLACE FUNCTION public.approve_first_event_showcase_reward_atomic(
  p_showcase_id UUID,
  p_reviewer_id UUID DEFAULT NULL,
  p_reference_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_showcase RECORD;
  v_event RECORD;
  v_wallet RECORD;
  v_owner_id UUID;
  v_user_reward RECORD;
  v_existing_credit RECORD;
  v_credit_amount NUMERIC(12, 2) := 300.00;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
  v_reference_id TEXT;
  v_txn_id UUID;
BEGIN
  -- 1. Lock and fetch target showcase
  SELECT * INTO v_showcase
  FROM public.event_showcases
  WHERE id = p_showcase_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Showcase not found with id: %', p_showcase_id;
  END IF;

  -- 2. Fetch associated event
  SELECT * INTO v_event
  FROM public.events
  WHERE id = v_showcase.event_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Associated event not found for showcase: %', p_showcase_id;
  END IF;

  -- 3. Resolve authoritative Account Owner user_id
  SELECT owner_id INTO v_owner_id
  FROM public.organizations
  WHERE id = v_showcase.organization_id;

  IF v_owner_id IS NULL THEN
    v_owner_id := v_showcase.owner_user_id;
  END IF;

  IF v_owner_id IS NULL THEN
    v_owner_id := v_event.created_by;
  END IF;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Cannot resolve account owner user id for showcase: %', p_showcase_id;
  END IF;

  -- 4. Idempotency Check: if this exact showcase was already rewarded
  IF v_showcase.reward_review_status = 'REWARDED' OR v_showcase.reward_status = 'REWARDED' THEN
    SELECT * INTO v_wallet
    FROM public.organization_wallets
    WHERE organization_id = v_showcase.organization_id;

    RETURN jsonb_build_object(
      'success', true,
      'already_rewarded', true,
      'showcase', row_to_json(v_showcase),
      'wallet', jsonb_build_object(
        'organization_id', v_showcase.organization_id,
        'paid_balance', COALESCE(v_wallet.paid_balance, 0.00),
        'welcome_credit', COALESCE(v_wallet.welcome_credit, 0.00),
        'showcase_credit', COALESCE(v_wallet.showcase_credit, 0.00),
        'topup_credit', COALESCE(v_wallet.topup_credit, 0.00),
        'outstanding_balance', COALESCE(v_wallet.outstanding_balance, 0.00),
        'total_balance', COALESCE(v_wallet.paid_balance, 0.00) + COALESCE(v_wallet.welcome_credit, 0.00) + COALESCE(v_wallet.showcase_credit, 0.00) + COALESCE(v_wallet.topup_credit, 0.00)
      ),
      'message', 'Showcase has already been approved and rewarded.'
    );
  END IF;

  -- 5. Primary Authoritative Lifetime Invariant Check against user_rewards:
  -- Verify if owner_user_id has ALREADY received a lifetime showcase reward in ANY organization or event
  SELECT * INTO v_user_reward
  FROM public.user_rewards
  WHERE user_id = v_owner_id AND reward_type IN ('SHOWCASE_REWARD', 'SHOWCASE_CREDIT', 'SHOWCASE_REWARD_RM300');

  IF FOUND THEN
    RAISE EXCEPTION 'First-event reward invariant violation: Owner has already received a lifetime showcase reward credit.';
  END IF;

  -- Check showcase_reward_submissions for any existing approved submission
  IF EXISTS (
    SELECT 1 FROM public.showcase_reward_submissions
    WHERE user_id = v_owner_id AND status = 'APPROVED'
  ) THEN
    RAISE EXCEPTION 'First-event reward invariant violation: Owner has already received a lifetime showcase reward credit.';
  END IF;

  -- Defense-in-depth: check completed financial transactions
  SELECT * INTO v_existing_credit
  FROM public.wallet_transactions
  WHERE (owner_user_id = v_owner_id OR created_by = v_owner_id)
    AND transaction_type = 'SHOWCASE_CREDIT'
    AND status = 'COMPLETED'
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'First-event reward invariant violation: Owner has already received a lifetime showcase reward credit.';
  END IF;

  -- 6. Lock Organization Wallet Row with FOR UPDATE
  INSERT INTO public.organization_wallets (
    organization_id,
    paid_balance,
    welcome_credit,
    showcase_credit,
    showcase_credit_granted,
    topup_credit,
    outstanding_balance,
    created_at,
    updated_at
  ) VALUES (
    v_showcase.organization_id,
    0.00,
    0.00,
    0.00,
    false,
    0.00,
    0.00,
    v_now,
    v_now
  )
  ON CONFLICT (organization_id) DO NOTHING;

  SELECT * INTO v_wallet
  FROM public.organization_wallets
  WHERE organization_id = v_showcase.organization_id
  FOR UPDATE;

  -- 7. Verify Showcase Criteria
  IF LENGTH(COALESCE(v_showcase.description, '')) < 50 THEN
    RAISE EXCEPTION 'Showcase description must be at least 50 characters';
  END IF;

  IF v_event.payment_status <> 'PAID' THEN
    RAISE EXCEPTION 'Associated event must have payment_status = PAID';
  END IF;

  -- 8. Atomically reserve in authoritative public.user_rewards
  INSERT INTO public.user_rewards (
    id,
    user_id,
    reward_type,
    organization_id,
    amount,
    created_at
  ) VALUES (
    gen_random_uuid(),
    v_owner_id,
    'SHOWCASE_CREDIT',
    v_showcase.organization_id,
    v_credit_amount,
    v_now
  )
  ON CONFLICT (user_id, reward_type) DO NOTHING
  RETURNING * INTO v_user_reward;

  IF v_user_reward.id IS NULL THEN
    RAISE EXCEPTION 'First-event reward invariant violation: Owner has already received a lifetime showcase reward credit.';
  END IF;

  -- 9. Insert Immutable Wallet Ledger Transaction
  v_reference_id := COALESCE(p_reference_id, 'showcase_' || v_showcase.id::text);
  v_txn_id := gen_random_uuid();

  INSERT INTO public.wallet_transactions (
    id,
    organization_id,
    owner_user_id,
    event_id,
    transaction_type,
    balance_type,
    amount,
    status,
    description,
    reference_id,
    created_by,
    metadata,
    created_at,
    updated_at
  ) VALUES (
    v_txn_id,
    v_showcase.organization_id,
    v_owner_id,
    v_showcase.event_id,
    'SHOWCASE_CREDIT',
    'SHOWCASE_CREDIT',
    v_credit_amount,
    'COMPLETED',
    'Showcase Reward Credit (RM300) - Approved for event ' || v_event.name,
    v_reference_id,
    p_reviewer_id,
    jsonb_build_object(
      'showcase_id', v_showcase.id,
      'event_id', v_showcase.event_id,
      'owner_user_id', v_owner_id,
      'reviewer_id', p_reviewer_id,
      'granted_at', v_now
    ) || p_metadata,
    v_now,
    v_now
  );

  -- 10. Update Organization Wallet Balance
  UPDATE public.organization_wallets
  SET
    showcase_credit = COALESCE(showcase_credit, 0.00) + v_credit_amount,
    showcase_credit_granted = true,
    updated_at = v_now
  WHERE organization_id = v_showcase.organization_id
  RETURNING * INTO v_wallet;

  -- 11. Update Event Showcase Reward Fields
  UPDATE public.event_showcases
  SET
    reward_status = 'REWARDED',
    reward_review_status = 'REWARDED',
    reward_amount = v_credit_amount,
    reward_granted_at = v_now,
    reward_transaction_id = v_txn_id,
    reward_rejection_reason = NULL,
    owner_user_id = v_owner_id,
    reviewed_at = v_now,
    reviewed_by = p_reviewer_id,
    updated_at = v_now
  WHERE id = v_showcase.id
  RETURNING * INTO v_showcase;

  -- 12. Also sync showcase_reward_submissions status to APPROVED if a record exists
  UPDATE public.showcase_reward_submissions
  SET
    status = 'APPROVED',
    reviewed_at = v_now,
    reviewed_by = p_reviewer_id,
    reward_transaction_id = v_txn_id,
    updated_at = v_now
  WHERE showcase_id = v_showcase.id;

  RETURN jsonb_build_object(
    'success', true,
    'already_rewarded', false,
    'showcase', row_to_json(v_showcase),
    'transaction', jsonb_build_object(
      'id', v_txn_id,
      'amount', v_credit_amount,
      'transaction_type', 'SHOWCASE_CREDIT',
      'reference_id', v_reference_id
    ),
    'wallet', jsonb_build_object(
      'organization_id', v_wallet.organization_id,
      'paid_balance', v_wallet.paid_balance,
      'welcome_credit', v_wallet.welcome_credit,
      'showcase_credit', v_wallet.showcase_credit,
      'topup_credit', v_wallet.topup_credit,
      'outstanding_balance', v_wallet.outstanding_balance,
      'total_balance', v_wallet.paid_balance + v_wallet.welcome_credit + v_wallet.showcase_credit + v_wallet.topup_credit
    )
  );
END;
$$;
