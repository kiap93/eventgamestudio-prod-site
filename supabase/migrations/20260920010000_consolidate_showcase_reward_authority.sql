-- ============================================================================
-- Migration: 20260920010000_consolidate_showcase_reward_authority.sql
-- Description: Consolidate Showcase Reward Authority to user_rewards
--
-- Core Invariant:
--   ONE SHOWCASE_CREDIT REWARD PER USER PER LIFETIME
--
-- Hierarchy:
--   1. user_rewards: Authoritative lifetime entitlement / uniqueness
--   2. approve_first_event_showcase_reward_atomic: Sole authoritative grant RPC
--   3. wallet_transactions: Authoritative financial ledger
--   4. owner_showcase_rewards: Derived / audit / owner-showcase relationship
--   5. event_showcases.reward_status / reward_review_status: UI / workflow state
--   6. organization_wallets.showcase_credit_granted: Legacy / derived display state
-- ============================================================================

-- 1. Descriptive Table and Column Comments
COMMENT ON TABLE public.user_rewards IS
  'Authoritative user-level reward entitlement and lifetime uniqueness. Showcase reward eligibility must be enforced here and through the atomic reward RPC.';

COMMENT ON TABLE public.owner_showcase_rewards IS
  'Derived/audit relationship between an owner and Showcase reward. Not an independent lifetime eligibility authority.';

COMMENT ON COLUMN public.event_showcases.reward_status IS
  'Showcase-specific reward workflow/display state. Does not determine lifetime user eligibility.';

COMMENT ON COLUMN public.event_showcases.reward_review_status IS
  'Showcase-specific reward review state. Approval alone never grants wallet credit; atomic reward RPC is required.';

COMMENT ON COLUMN public.organization_wallets.showcase_credit_granted IS
  'Legacy/derived organization-level display or compatibility state. Never use as the authoritative user-level Showcase Reward eligibility check.';

-- 2. Database-Level Lifetime Uniqueness Mechanism on user_rewards
CREATE UNIQUE INDEX IF NOT EXISTS ux_user_rewards_showcase_lifetime_unique
  ON public.user_rewards (user_id)
  WHERE reward_type IN ('SHOWCASE_CREDIT', 'SHOWCASE_REWARD');

-- 3. Controlled Reconciliation: Ensure user_rewards reflects historical grants
-- Backfill from completed wallet_transactions if any exist without a corresponding user_rewards row
INSERT INTO public.user_rewards (
  id,
  user_id,
  reward_type,
  organization_id,
  transaction_id,
  amount,
  created_at
)
SELECT DISTINCT ON (wt.owner_user_id)
  gen_random_uuid(),
  wt.owner_user_id,
  'SHOWCASE_CREDIT',
  wt.organization_id,
  wt.id,
  COALESCE(wt.amount, 300.00),
  wt.created_at
FROM public.wallet_transactions wt
WHERE wt.transaction_type = 'SHOWCASE_CREDIT'
  AND wt.status = 'COMPLETED'
  AND wt.owner_user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.user_rewards ur
    WHERE ur.user_id = wt.owner_user_id
      AND ur.reward_type IN ('SHOWCASE_CREDIT', 'SHOWCASE_REWARD')
  )
ORDER BY wt.owner_user_id, wt.created_at ASC
ON CONFLICT DO NOTHING;

-- Also backfill from owner_showcase_rewards if any exist without user_rewards
INSERT INTO public.user_rewards (
  id,
  user_id,
  reward_type,
  organization_id,
  transaction_id,
  amount,
  created_at
)
SELECT DISTINCT ON (osr.owner_user_id)
  gen_random_uuid(),
  osr.owner_user_id,
  'SHOWCASE_CREDIT',
  osr.organization_id,
  osr.transaction_id,
  COALESCE(osr.amount, 300.00),
  osr.created_at
FROM public.owner_showcase_rewards osr
WHERE osr.owner_user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.user_rewards ur
    WHERE ur.user_id = osr.owner_user_id
      AND ur.reward_type IN ('SHOWCASE_CREDIT', 'SHOWCASE_REWARD')
  )
ORDER BY osr.owner_user_id, osr.created_at ASC
ON CONFLICT DO NOTHING;

-- 4. Reconcile any duplicate SHOWCASE_CREDIT transactions safely to REVERSED (never grant second reward)
DO $$
DECLARE
  v_dup RECORD;
  v_canonical_id UUID;
BEGIN
  FOR v_dup IN (
    SELECT owner_user_id, COUNT(*) as cnt
    FROM public.wallet_transactions
    WHERE transaction_type = 'SHOWCASE_CREDIT'
      AND status = 'COMPLETED'
      AND owner_user_id IS NOT NULL
    GROUP BY owner_user_id
    HAVING COUNT(*) > 1
  ) LOOP
    -- Keep earliest transaction as canonical
    SELECT id INTO v_canonical_id
    FROM public.wallet_transactions
    WHERE owner_user_id = v_dup.owner_user_id
      AND transaction_type = 'SHOWCASE_CREDIT'
      AND status = 'COMPLETED'
    ORDER BY created_at ASC
    LIMIT 1;

    -- Update subsequent duplicates to REVERSED
    UPDATE public.wallet_transactions
    SET
      status = 'REVERSED',
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'reconciled_at', timezone('utc'::text, now()),
        'reconciliation_reason', 'DUPLICATE_SHOWCASE_CREDIT_REVOKED',
        'canonical_transaction_id', v_canonical_id
      ),
      updated_at = timezone('utc'::text, now())
    WHERE owner_user_id = v_dup.owner_user_id
      AND transaction_type = 'SHOWCASE_CREDIT'
      AND status = 'COMPLETED'
      AND id <> v_canonical_id;
  END LOOP;
END $$;

-- 5. Authoritative Atomic RPC: approve_first_event_showcase_reward_atomic
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
  v_showcase public.event_showcases%ROWTYPE;
  v_org public.organizations%ROWTYPE;
  v_event public.events%ROWTYPE;
  v_wallet public.organization_wallets%ROWTYPE;
  v_existing_credit public.wallet_transactions%ROWTYPE;
  v_new_txn public.wallet_transactions%ROWTYPE;
  v_user_reward public.user_rewards%ROWTYPE;
  v_owner_id UUID;
  v_credit_amount NUMERIC(12, 2) := 300.00;
  v_reference_id TEXT;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
BEGIN
  -- 1. Fetch and Lock Showcase Record
  SELECT * INTO v_showcase
  FROM public.event_showcases
  WHERE id = p_showcase_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Showcase not found: %', p_showcase_id;
  END IF;

  -- 2. Verify Showcase is not blocked or deleted
  IF v_showcase.status = 'BLOCKED' OR v_showcase.status = 'DELETED' THEN
    RAISE EXCEPTION 'Showcase is % and cannot receive rewards', v_showcase.status;
  END IF;

  -- 3. Resolve Organization and AUTHORITATIVE Organization Owner Server-Side
  SELECT * INTO v_org
  FROM public.organizations
  WHERE id = v_showcase.organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization not found for showcase %', p_showcase_id;
  END IF;

  v_owner_id := v_org.owner_id;
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Organization owner could not be resolved for showcase %', p_showcase_id;
  END IF;

  -- Serialize multi-showcase/multi-org reward grants per user via explicit user row lock
  PERFORM 1 FROM public.users WHERE id = v_owner_id FOR UPDATE;

  -- 4. Idempotency Check: If already rewarded for this showcase, return cleanly
  IF (v_showcase.reward_review_status = 'REWARDED' OR v_showcase.reward_status = 'REWARDED') THEN
    SELECT * INTO v_existing_credit
    FROM public.wallet_transactions
    WHERE id = v_showcase.reward_transaction_id
       OR (owner_user_id = v_owner_id AND transaction_type = 'SHOWCASE_CREDIT' AND status = 'COMPLETED')
    ORDER BY created_at DESC
    LIMIT 1;

    SELECT * INTO v_wallet
    FROM public.organization_wallets
    WHERE organization_id = v_showcase.organization_id;

    RETURN jsonb_build_object(
      'success', true,
      'already_rewarded', true,
      'showcase', to_jsonb(v_showcase),
      'transaction', to_jsonb(v_existing_credit),
      'wallet', jsonb_build_object(
        'organization_id', v_showcase.organization_id,
        'paid_balance', COALESCE(v_wallet.paid_balance, 0.00),
        'welcome_credit', COALESCE(v_wallet.welcome_credit, 0.00),
        'showcase_credit', COALESCE(v_wallet.showcase_credit, 0.00),
        'showcase_credit_granted', COALESCE(v_wallet.showcase_credit_granted, true),
        'topup_credit', COALESCE(v_wallet.topup_credit, 0.00),
        'outstanding_balance', COALESCE(v_wallet.outstanding_balance, 0.00),
        'total_balance', COALESCE(v_wallet.paid_balance, 0.00) + COALESCE(v_wallet.welcome_credit, 0.00) + COALESCE(v_wallet.showcase_credit, 0.00) + COALESCE(v_wallet.topup_credit, 0.00)
      ),
      'message', 'Showcase has already been approved and rewarded.'
    );
  END IF;

  -- 5. Primary Authoritative Lifetime Invariant Check against user_rewards:
  -- Verify if owner_user_id has ALREADY received a lifetime showcase reward in ANY organization
  SELECT * INTO v_user_reward
  FROM public.user_rewards
  WHERE user_id = v_owner_id AND reward_type IN ('SHOWCASE_REWARD', 'SHOWCASE_CREDIT');

  IF FOUND THEN
    RAISE EXCEPTION 'First-event reward invariant violation: Owner has already received a lifetime showcase reward credit.';
  END IF;

  -- Defense-in-depth: check completed financial transactions
  SELECT * INTO v_existing_credit
  FROM public.wallet_transactions
  WHERE owner_user_id = v_owner_id
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

  -- 7. Verify Showcase Status & Publication
  IF (v_showcase.status <> 'PUBLISHED' AND COALESCE(v_showcase.publication_status, '') <> 'PUBLISHED') THEN
    RAISE EXCEPTION 'Showcase must be published before reward approval';
  END IF;

  -- 8. Verify Event is Paid
  SELECT * INTO v_event
  FROM public.events
  WHERE id = v_showcase.event_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event associated with showcase not found';
  END IF;

  IF v_event.payment_status <> 'PAID' THEN
    RAISE EXCEPTION 'Associated event must have payment_status = PAID';
  END IF;

  -- 9. Atomically reserve in authoritative public.user_rewards with canonical SHOWCASE_CREDIT
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

  -- 10. Insert Immutable Wallet Ledger Transaction
  v_reference_id := COALESCE(p_reference_id, 'showcase_' || v_showcase.id::text);

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
    gen_random_uuid(),
    v_showcase.organization_id,
    v_owner_id,
    v_showcase.event_id,
    'SHOWCASE_CREDIT',
    'SHOWCASE_CREDIT',
    v_credit_amount,
    'COMPLETED',
    'One-time Event Showcase completion reward credit',
    v_reference_id,
    p_reviewer_id,
    p_metadata || jsonb_build_object(
      'showcase_id', v_showcase.id,
      'owner_user_id', v_owner_id,
      'grant_type', 'OWNER_FIRST_SHOWCASE_REWARD',
      'credited_at', v_now
    ),
    v_now,
    v_now
  )
  RETURNING * INTO v_new_txn;

  -- Update user_rewards with transaction_id
  UPDATE public.user_rewards
  SET transaction_id = v_new_txn.id
  WHERE id = v_user_reward.id;

  -- 11. Record in owner_showcase_rewards table as DERIVED / AUDIT relationship
  INSERT INTO public.owner_showcase_rewards (
    owner_user_id,
    organization_id,
    event_id,
    showcase_id,
    transaction_id,
    amount,
    rewarded_at,
    created_at
  ) VALUES (
    v_owner_id,
    v_showcase.organization_id,
    v_showcase.event_id,
    v_showcase.id,
    v_new_txn.id,
    v_credit_amount,
    v_now,
    v_now
  )
  ON CONFLICT (owner_user_id) DO UPDATE SET
    transaction_id = EXCLUDED.transaction_id,
    rewarded_at = EXCLUDED.rewarded_at;

  -- 12. Credit Organization Wallet Balance
  UPDATE public.organization_wallets
  SET
    showcase_credit = COALESCE(showcase_credit, 0.00) + v_credit_amount,
    showcase_credit_granted = true,
    updated_at = v_now
  WHERE organization_id = v_showcase.organization_id
  RETURNING * INTO v_wallet;

  -- 13. Update event_showcases workflow/UI state
  UPDATE public.event_showcases
  SET
    owner_user_id = v_owner_id,
    reward_review_status = 'REWARDED',
    reward_reviewed_by = p_reviewer_id,
    reward_reviewed_at = v_now,
    reward_rejection_reason = NULL,
    reward_transaction_id = v_new_txn.id,
    reward_granted_at = v_now,
    reward_status = 'REWARDED',
    updated_at = v_now
  WHERE id = v_showcase.id
  RETURNING * INTO v_showcase;

  RETURN jsonb_build_object(
    'success', true,
    'already_rewarded', false,
    'showcase', to_jsonb(v_showcase),
    'transaction', to_jsonb(v_new_txn),
    'wallet', jsonb_build_object(
      'organization_id', v_showcase.organization_id,
      'paid_balance', v_wallet.paid_balance,
      'welcome_credit', v_wallet.welcome_credit,
      'showcase_credit', v_wallet.showcase_credit,
      'showcase_credit_granted', v_wallet.showcase_credit_granted,
      'topup_credit', v_wallet.topup_credit,
      'outstanding_balance', v_wallet.outstanding_balance,
      'total_balance', v_wallet.paid_balance + v_wallet.welcome_credit + v_wallet.showcase_credit + v_wallet.topup_credit
    ),
    'message', 'Showcase reward approved and RM300 credit granted successfully.'
  );
END;
$$;
