-- ==============================================================================
-- Migration: 20260914000000_user_level_reward_security_and_reconciliation.sql
-- Description: Complete User-Level Lifetime Reward Hardening:
--              1. Hardens public.owner_showcase_rewards foreign keys (ON DELETE SET NULL)
--                 so deleting an organization or event NEVER resets showcase credit eligibility.
--              2. Backfills all showcase reward records into public.user_rewards with
--                 reward_type = 'SHOWCASE_CREDIT' (UNIQUE per user account lifetime).
--              3. Safely reconciles any historical duplicate SHOWCASE_CREDIT transactions
--                 (status = 'REVERSED', preserving ledger immutability - NEVER DELETE).
--              4. Ensures unique partial index on wallet_transactions for owner showcase credit.
--              5. Hardens Row Level Security (RLS) on user_rewards and owner_showcase_rewards,
--                 preventing client-side direct tampering, inserts, updates, or deletes.
--              6. Updates approve_first_event_showcase_reward_atomic RPC to atomically reserve
--                 in public.user_rewards.
-- ==============================================================================

-- 1. Alter owner_showcase_rewards foreign keys so deleting an organization NEVER deletes the reward
ALTER TABLE public.owner_showcase_rewards
  ALTER COLUMN organization_id DROP NOT NULL,
  ALTER COLUMN event_id DROP NOT NULL,
  ALTER COLUMN showcase_id DROP NOT NULL;

-- Re-point foreign keys with ON DELETE SET NULL
DO $$
BEGIN
  -- organization_id
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'owner_showcase_rewards_organization_id_fkey'
      AND table_name = 'owner_showcase_rewards'
  ) THEN
    ALTER TABLE public.owner_showcase_rewards
      DROP CONSTRAINT owner_showcase_rewards_organization_id_fkey;
  END IF;

  ALTER TABLE public.owner_showcase_rewards
    ADD CONSTRAINT owner_showcase_rewards_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE SET NULL;

  -- event_id
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'owner_showcase_rewards_event_id_fkey'
      AND table_name = 'owner_showcase_rewards'
  ) THEN
    ALTER TABLE public.owner_showcase_rewards
      DROP CONSTRAINT owner_showcase_rewards_event_id_fkey;
  END IF;

  ALTER TABLE public.owner_showcase_rewards
    ADD CONSTRAINT owner_showcase_rewards_event_id_fkey
    FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE SET NULL;

  -- showcase_id
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'owner_showcase_rewards_showcase_id_fkey'
      AND table_name = 'owner_showcase_rewards'
  ) THEN
    ALTER TABLE public.owner_showcase_rewards
      DROP CONSTRAINT owner_showcase_rewards_showcase_id_fkey;
  END IF;

  ALTER TABLE public.owner_showcase_rewards
    ADD CONSTRAINT owner_showcase_rewards_showcase_id_fkey
    FOREIGN KEY (showcase_id) REFERENCES public.event_showcases(id) ON DELETE SET NULL;
END $$;

-- 2. Backfill public.user_rewards with SHOWCASE_CREDIT from owner_showcase_rewards
INSERT INTO public.user_rewards (
  id,
  user_id,
  reward_type,
  organization_id,
  transaction_id,
  amount,
  created_at
)
SELECT
  gen_random_uuid(),
  osr.owner_user_id,
  'SHOWCASE_CREDIT',
  osr.organization_id,
  osr.transaction_id,
  COALESCE(osr.amount, 300.00),
  osr.rewarded_at
FROM public.owner_showcase_rewards osr
WHERE osr.owner_user_id IS NOT NULL
ON CONFLICT (user_id, reward_type)
DO UPDATE SET
  transaction_id = COALESCE(user_rewards.transaction_id, EXCLUDED.transaction_id),
  organization_id = COALESCE(user_rewards.organization_id, EXCLUDED.organization_id);

-- Backfill any remaining completed SHOWCASE_CREDIT wallet transactions into user_rewards
INSERT INTO public.user_rewards (
  id,
  user_id,
  reward_type,
  organization_id,
  transaction_id,
  amount,
  created_at
)
SELECT
  gen_random_uuid(),
  wt.owner_user_id,
  'SHOWCASE_CREDIT',
  wt.organization_id,
  wt.id,
  wt.amount,
  wt.created_at
FROM public.wallet_transactions wt
WHERE wt.transaction_type = 'SHOWCASE_CREDIT'
  AND wt.status = 'COMPLETED'
  AND wt.owner_user_id IS NOT NULL
ON CONFLICT (user_id, reward_type)
DO NOTHING;

-- 3. Safely reconcile any historical duplicate SHOWCASE_CREDIT transactions
-- Financial ledger immutability:
--   - Transactions are NEVER deleted.
--   - Mark duplicate transactions as status = 'REVERSED' with audit metadata.
--   - Reconcile unspent showcase credit in organization_wallets.
DO $$
DECLARE
  v_reconciled_count INTEGER := 0;
BEGIN
  WITH ranked_showcase_credits AS (
    SELECT
      wt.id,
      wt.organization_id,
      wt.owner_user_id,
      wt.amount,
      wt.created_at,
      ROW_NUMBER() OVER (
        PARTITION BY wt.owner_user_id
        ORDER BY
          -- 1. Prioritize transaction already linked in owner_showcase_rewards or user_rewards
          CASE 
            WHEN osr.transaction_id = wt.id THEN 0 
            WHEN ur.transaction_id = wt.id THEN 0 
            ELSE 1 
          END,
          -- 2. Prioritize transaction where showcase credit was actually consumed
          CASE WHEN EXISTS (
            SELECT 1 FROM public.wallet_transactions usage_txn
            WHERE usage_txn.organization_id = wt.organization_id
              AND usage_txn.balance_type = 'SHOWCASE_CREDIT'
              AND usage_txn.amount < 0
              AND usage_txn.status = 'COMPLETED'
          ) THEN 0 ELSE 1 END,
          -- 3. Earliest created transaction
          wt.created_at ASC,
          wt.id ASC
      ) AS rank_num,
      FIRST_VALUE(wt.id) OVER (
        PARTITION BY wt.owner_user_id
        ORDER BY
          CASE 
            WHEN osr.transaction_id = wt.id THEN 0 
            WHEN ur.transaction_id = wt.id THEN 0 
            ELSE 1 
          END,
          CASE WHEN EXISTS (
            SELECT 1 FROM public.wallet_transactions usage_txn
            WHERE usage_txn.organization_id = wt.organization_id
              AND usage_txn.balance_type = 'SHOWCASE_CREDIT'
              AND usage_txn.amount < 0
              AND usage_txn.status = 'COMPLETED'
          ) THEN 0 ELSE 1 END,
          wt.created_at ASC,
          wt.id ASC
      ) AS canonical_txn_id
    FROM public.wallet_transactions wt
    LEFT JOIN public.owner_showcase_rewards osr 
      ON osr.owner_user_id = wt.owner_user_id
    LEFT JOIN public.user_rewards ur 
      ON ur.user_id = wt.owner_user_id AND ur.reward_type = 'SHOWCASE_CREDIT'
    WHERE wt.transaction_type = 'SHOWCASE_CREDIT'
      AND wt.status = 'COMPLETED'
      AND wt.owner_user_id IS NOT NULL
  ),
  duplicates_to_reverse AS (
    SELECT
      r.id,
      r.organization_id,
      r.owner_user_id,
      r.amount,
      r.canonical_txn_id
    FROM ranked_showcase_credits r
    WHERE r.rank_num > 1
  )
  UPDATE public.wallet_transactions wt
  SET
    status = 'REVERSED',
    metadata = COALESCE(wt.metadata, '{}'::jsonb) || jsonb_build_object(
      'reversal_reason', 'DUPLICATE_SHOWCASE_CREDIT_REVOKED',
      'canonical_transaction_id', d.canonical_txn_id,
      'reconciled_at', timezone('utc'::text, now()),
      'reconciled_by', 'MIGRATION_20260914000000_USER_REWARDS_HARDENING'
    ),
    updated_at = timezone('utc'::text, now())
  FROM duplicates_to_reverse d
  WHERE wt.id = d.id;

  GET DIAGNOSTICS v_reconciled_count = ROW_COUNT;
  IF v_reconciled_count > 0 THEN
    RAISE NOTICE 'Reconciled % duplicate SHOWCASE_CREDIT transactions to status = REVERSED', v_reconciled_count;

    -- Recalculate organization_wallets for affected organizations
    UPDATE public.organization_wallets ow
    SET
      showcase_credit = GREATEST(0.00, COALESCE((
        SELECT SUM(amount)
        FROM public.wallet_transactions wt
        WHERE wt.organization_id = ow.organization_id
          AND wt.balance_type = 'SHOWCASE_CREDIT'
          AND wt.status = 'COMPLETED'
      ), 0.00)),
      showcase_credit_granted = EXISTS (
        SELECT 1
        FROM public.wallet_transactions wt
        WHERE wt.organization_id = ow.organization_id
          AND wt.transaction_type = 'SHOWCASE_CREDIT'
          AND wt.status = 'COMPLETED'
      ),
      updated_at = timezone('utc'::text, now())
    WHERE ow.organization_id IN (
      SELECT DISTINCT organization_id FROM public.wallet_transactions
      WHERE metadata->>'reversal_reason' = 'DUPLICATE_SHOWCASE_CREDIT_REVOKED'
    );
  END IF;
END $$;

-- 4. Ensure unique partial index on wallet_transactions for owner showcase credit
CREATE UNIQUE INDEX IF NOT EXISTS ux_wallet_txns_owner_showcase_credit_unique
  ON public.wallet_transactions (owner_user_id)
  WHERE transaction_type = 'SHOWCASE_CREDIT' AND status = 'COMPLETED' AND owner_user_id IS NOT NULL;

-- 5. Row Level Security (RLS) Hardening on user_rewards and owner_showcase_rewards
ALTER TABLE public.user_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_showcase_rewards ENABLE ROW LEVEL SECURITY;

-- Revoke all write permissions from client roles (anon, authenticated)
REVOKE INSERT, UPDATE, DELETE ON public.user_rewards FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.owner_showcase_rewards FROM anon, authenticated;

-- Grant SELECT only to authenticated users (read own rewards)
GRANT SELECT ON public.user_rewards TO authenticated;
GRANT SELECT ON public.owner_showcase_rewards TO authenticated;

-- Grant ALL privileges to service_role and postgres
GRANT ALL ON public.user_rewards TO service_role, postgres;
GRANT ALL ON public.owner_showcase_rewards TO service_role, postgres;

-- Policies for public.user_rewards
DROP POLICY IF EXISTS "Users can view own user_rewards" ON public.user_rewards;
CREATE POLICY "Users can view own user_rewards"
  ON public.user_rewards FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR (SELECT public.is_developer_admin())
  );

-- Policies for public.owner_showcase_rewards
DROP POLICY IF EXISTS "Owners can view own showcase_rewards" ON public.owner_showcase_rewards;
CREATE POLICY "Owners can view own showcase_rewards"
  ON public.owner_showcase_rewards FOR SELECT
  TO authenticated
  USING (
    owner_user_id = auth.uid()
    OR (SELECT public.is_developer_admin())
  );

-- Defense-in-depth trigger: strictly prevent unauthorized client mutation of rewards
CREATE OR REPLACE FUNCTION public.prevent_direct_reward_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Allow service_role and superusers
  IF current_user = 'postgres' OR current_user = 'service_role' OR current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Block any client attempt
  RAISE EXCEPTION 'Direct client manipulation of financial reward tables is strictly forbidden.';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_tamper_user_rewards ON public.user_rewards;
CREATE TRIGGER trg_prevent_tamper_user_rewards
  BEFORE INSERT OR UPDATE OR DELETE ON public.user_rewards
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_direct_reward_tampering();

DROP TRIGGER IF EXISTS trg_prevent_tamper_owner_showcase_rewards ON public.owner_showcase_rewards;
CREATE TRIGGER trg_prevent_tamper_owner_showcase_rewards
  BEFORE INSERT OR UPDATE OR DELETE ON public.owner_showcase_rewards
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_direct_reward_tampering();

-- 6. Update approve_first_event_showcase_reward_atomic RPC
CREATE OR REPLACE FUNCTION public.approve_first_event_showcase_reward_atomic(
  p_showcase_id UUID,
  p_reviewer_id UUID DEFAULT NULL,
  p_reference_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_showcase public.event_showcases%ROWTYPE;
  v_event public.events%ROWTYPE;
  v_org public.organizations%ROWTYPE;
  v_wallet public.organization_wallets%ROWTYPE;
  v_owner_reward public.owner_showcase_rewards%ROWTYPE;
  v_user_reward public.user_rewards%ROWTYPE;
  v_existing_credit public.wallet_transactions%ROWTYPE;
  v_new_txn public.wallet_transactions%ROWTYPE;
  v_owner_id UUID;
  v_reference_id TEXT;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
  v_credit_amount NUMERIC := 300.00;
  v_paid NUMERIC;
  v_welcome NUMERIC;
  v_showcase_credit NUMERIC;
  v_topup NUMERIC;
  v_outstanding NUMERIC;
BEGIN
  -- 1. Input Validation
  IF p_showcase_id IS NULL THEN
    RAISE EXCEPTION 'Showcase ID is required';
  END IF;

  -- 2. Lock & fetch Showcase Record
  SELECT * INTO v_showcase
  FROM public.event_showcases
  WHERE id = p_showcase_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Showcase not found: %', p_showcase_id;
  END IF;

  IF v_showcase.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Showcase has been deleted and cannot be rewarded';
  END IF;

  IF v_showcase.status = 'BLOCKED' THEN
    RAISE EXCEPTION 'Showcase is blocked and cannot receive rewards';
  END IF;

  -- 3. Resolve Organization & Owner ID
  SELECT * INTO v_org
  FROM public.organizations
  WHERE id = v_showcase.organization_id;

  v_owner_id := COALESCE(v_showcase.owner_user_id, v_org.owner_id);

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Organization owner could not be resolved for showcase %', p_showcase_id;
  END IF;

  -- 4. Idempotency Check: If this exact showcase is already rewarded, return current state safely
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

  -- 5. Owner-Level First-Reward Invariant Check:
  -- Verify if owner_user_id has ALREADY received a lifetime showcase reward in ANY organization
  SELECT * INTO v_user_reward
  FROM public.user_rewards
  WHERE user_id = v_owner_id AND reward_type = 'SHOWCASE_CREDIT';

  IF FOUND THEN
    RAISE EXCEPTION 'First-event reward invariant violation: Owner has already received a lifetime showcase reward credit.';
  END IF;

  SELECT * INTO v_owner_reward
  FROM public.owner_showcase_rewards
  WHERE owner_user_id = v_owner_id;

  IF FOUND THEN
    RAISE EXCEPTION 'First-event reward invariant violation: Owner has already received a lifetime showcase reward credit.';
  END IF;

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

  -- 7. Verify Showcase Status & Eligibility:
  IF (v_showcase.status <> 'PUBLISHED' AND COALESCE(v_showcase.publication_status, '') <> 'PUBLISHED') THEN
    RAISE EXCEPTION 'Showcase must be published before reward approval';
  END IF;

  -- 8. Verify Event is Paid and Concluded/Active
  SELECT * INTO v_event
  FROM public.events
  WHERE id = v_showcase.event_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event associated with showcase not found';
  END IF;

  IF v_event.payment_status <> 'PAID' THEN
    RAISE EXCEPTION 'Associated event must have payment_status = PAID';
  END IF;

  -- 9. Atomically reserve in public.user_rewards
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

  -- 11. Record in owner_showcase_rewards table
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

  -- 13. Update Event Showcase Reward Status
  UPDATE public.event_showcases
  SET
    owner_user_id = v_owner_id,
    reward_review_status = 'REWARDED',
    reward_status = 'REWARDED',
    reward_reviewed_by = p_reviewer_id,
    reward_reviewed_at = v_now,
    reward_rejection_reason = NULL,
    reward_transaction_id = v_new_txn.id,
    reward_granted_at = v_now,
    updated_at = v_now
  WHERE id = v_showcase.id
  RETURNING * INTO v_showcase;

  -- 14. Audit Log
  INSERT INTO public.showcase_moderation_logs (
    id,
    showcase_id,
    moderator_id,
    action,
    reason,
    metadata,
    created_at
  ) VALUES (
    gen_random_uuid(),
    v_showcase.id,
    COALESCE(p_reviewer_id, '00000000-0000-0000-0000-000000000000'::uuid),
    'APPROVE_REWARD',
    'Owner first-event showcase RM300 reward approved',
    jsonb_build_object(
      'owner_user_id', v_owner_id,
      'amount', v_credit_amount,
      'transaction_id', v_new_txn.id,
      'organization_id', v_showcase.organization_id
    ),
    v_now
  );

  v_paid := COALESCE(v_wallet.paid_balance, 0.00);
  v_welcome := COALESCE(v_wallet.welcome_credit, 0.00);
  v_showcase_credit := COALESCE(v_wallet.showcase_credit, 0.00);
  v_topup := COALESCE(v_wallet.topup_credit, 0.00);
  v_outstanding := COALESCE(v_wallet.outstanding_balance, 0.00);

  RETURN jsonb_build_object(
    'success', true,
    'already_rewarded', false,
    'showcase', to_jsonb(v_showcase),
    'transaction', to_jsonb(v_new_txn),
    'wallet', jsonb_build_object(
      'organization_id', v_showcase.organization_id,
      'paid_balance', v_paid,
      'welcome_credit', v_welcome,
      'showcase_credit', v_showcase_credit,
      'showcase_credit_granted', true,
      'topup_credit', v_topup,
      'outstanding_balance', v_outstanding,
      'total_balance', v_paid + v_welcome + v_showcase_credit + v_topup
    ),
    'message', 'Owner first-event showcase RM300 reward successfully granted!'
  );
END;
$$;
