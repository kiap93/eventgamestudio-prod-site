-- ==============================================================================
-- Migration: 20260906040000_owner_level_showcase_reward.sql
-- Description: Refactor First-Event Showcase Reward from organization-level to
-- OWNER-LEVEL (user-based) reward identity (owner_user_id).
-- 
-- Key Architectural Rules:
-- 1. FIRST-EVENT SHOWCASE REWARD IS AN OWNER-LEVEL REWARD:
--    Anchored to owner_user_id (auth.users id). A user receives this reward at most
--    ONCE in their lifetime across all organizations they own or create.
-- 2. ADMIN EVENT REVIEW IS A SEPARATE WORKFLOW:
--    review_status (DRAFT, SUBMITTED, APPROVED, REJECTED) is an editorial/event review
--    independent of the financial reward approval (reward_review_status).
-- 3. SHOWCASE PUBLISHING IS SEPARATE:
--    Self-serve publication (status = PUBLISHED) does not require admin approval.
-- ==============================================================================

-- 1. Add owner_user_id to public.event_showcases
ALTER TABLE public.event_showcases
  ADD COLUMN IF NOT EXISTS owner_user_id UUID;

CREATE INDEX IF NOT EXISTS idx_event_showcases_owner_user_id
  ON public.event_showcases (owner_user_id);

-- Safely disable trigger during backfill if present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'trg_prevent_event_showcase_unauthorized_client_mutations'
      AND tgrelid = 'public.event_showcases'::regclass
  ) THEN
    ALTER TABLE public.event_showcases DISABLE TRIGGER trg_prevent_event_showcase_unauthorized_client_mutations;
  END IF;
END $$;

-- Backfill owner_user_id from organizations.owner_id
UPDATE public.event_showcases es
SET owner_user_id = o.owner_id
FROM public.organizations o
WHERE es.organization_id = o.id
  AND es.owner_user_id IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'trg_prevent_event_showcase_unauthorized_client_mutations'
      AND tgrelid = 'public.event_showcases'::regclass
  ) THEN
    ALTER TABLE public.event_showcases ENABLE TRIGGER trg_prevent_event_showcase_unauthorized_client_mutations;
  END IF;
END $$;

-- 2. Add owner_user_id to public.wallet_transactions
ALTER TABLE public.wallet_transactions
  ADD COLUMN IF NOT EXISTS owner_user_id UUID;

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_owner_user_id
  ON public.wallet_transactions (owner_user_id);

-- Safely drop unique indexes temporarily during backfill if they exist
-- (e.g. if migrations are re-run on an existing database where 20260912000000 or unique indexes were already applied)
DROP INDEX IF EXISTS public.ux_wallet_txns_user_welcome_credit_unique;
DROP INDEX IF EXISTS public.ux_wallet_txns_owner_showcase_credit_unique;

-- Backfill owner_user_id for existing transactions
UPDATE public.wallet_transactions wt
SET owner_user_id = o.owner_id
FROM public.organizations o
WHERE wt.organization_id = o.id
  AND wt.owner_user_id IS NULL;

-- Fallback backfill from created_by if owner_id was not set
UPDATE public.wallet_transactions wt
SET owner_user_id = wt.created_by
WHERE wt.owner_user_id IS NULL
  AND wt.created_by IS NOT NULL;

-- If multiple completed WELCOME_CREDIT transactions exist for the same owner_user_id,
-- safely reconcile duplicates to REVERSED (consistent with user-level lifetime limit)
DO $$
BEGIN
  WITH ranked_welcome_credits AS (
    SELECT
      wt.id,
      ROW_NUMBER() OVER (
        PARTITION BY wt.owner_user_id
        ORDER BY
          -- Prioritize transaction where welcome credit was actually consumed
          CASE WHEN EXISTS (
            SELECT 1 FROM public.wallet_transactions usage_txn
            WHERE usage_txn.organization_id = wt.organization_id
              AND usage_txn.balance_type = 'WELCOME_CREDIT'
              AND usage_txn.amount < 0
              AND usage_txn.status = 'COMPLETED'
          ) THEN 0 ELSE 1 END,
          wt.created_at ASC,
          wt.id ASC
      ) AS rank_num
    FROM public.wallet_transactions wt
    WHERE wt.transaction_type = 'WELCOME_CREDIT'
      AND wt.status = 'COMPLETED'
      AND wt.owner_user_id IS NOT NULL
  )
  UPDATE public.wallet_transactions wt
  SET
    status = 'REVERSED',
    description = COALESCE(wt.description, 'Welcome credit') || ' [RECONCILED: Duplicate welcome credit revoked for user-level lifetime limit]',
    metadata = COALESCE(wt.metadata, '{}'::jsonb) || jsonb_build_object(
      'reconciled_at', timezone('utc'::text, now()),
      'reconciliation_reason', 'DUPLICATE_WELCOME_CREDIT_REVOKED',
      'original_status', 'COMPLETED'
    )
  FROM ranked_welcome_credits rwc
  WHERE wt.id = rwc.id
    AND rwc.rank_num > 1;

  -- Restore ux_wallet_txns_user_welcome_credit_unique if user_rewards table exists (migration 20260912000000+)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'user_rewards'
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS ux_wallet_txns_user_welcome_credit_unique 
      ON public.wallet_transactions (owner_user_id) 
      WHERE transaction_type = 'WELCOME_CREDIT' AND status = 'COMPLETED' AND owner_user_id IS NOT NULL;
  END IF;
END $$;

-- 3. Create Dedicated Owner Showcase Reward Ledger Table
CREATE TABLE IF NOT EXISTS public.owner_showcase_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
  showcase_id UUID REFERENCES public.event_showcases(id) ON DELETE SET NULL,
  transaction_id UUID REFERENCES public.wallet_transactions(id) ON DELETE SET NULL,
  amount NUMERIC(10,2) NOT NULL DEFAULT 300.00,
  rewarded_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_owner_showcase_rewards_org
  ON public.owner_showcase_rewards (organization_id);

CREATE INDEX IF NOT EXISTS idx_owner_showcase_rewards_event
  ON public.owner_showcase_rewards (event_id);

-- Ensure showcase_moderation_logs supports reward actions
DO $$
BEGIN
  ALTER TABLE public.showcase_moderation_logs
    DROP CONSTRAINT IF EXISTS showcase_moderation_logs_action_check;
  ALTER TABLE public.showcase_moderation_logs
    ADD CONSTRAINT showcase_moderation_logs_action_check
    CHECK (action IN ('BLOCK', 'UNBLOCK', 'DELETE', 'RESTORE', 'APPROVE_REWARD', 'REJECT_REWARD'));
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

-- 4. Database-Level Unique Constraints for Owner-Level Idempotency
-- Enforce that at most ONE completed SHOWCASE_CREDIT transaction can ever exist per owner_user_id
DO $$
BEGIN
  -- Reconcile any duplicate SHOWCASE_CREDIT transactions if present
  WITH ranked_showcase_credits AS (
    SELECT
      wt.id,
      ROW_NUMBER() OVER (
        PARTITION BY wt.owner_user_id
        ORDER BY
          CASE WHEN EXISTS (
            SELECT 1 FROM public.wallet_transactions usage_txn
            WHERE usage_txn.organization_id = wt.organization_id
              AND usage_txn.balance_type = 'SHOWCASE_CREDIT'
              AND usage_txn.amount < 0
              AND usage_txn.status = 'COMPLETED'
          ) THEN 0 ELSE 1 END,
          wt.created_at ASC,
          wt.id ASC
      ) AS rank_num
    FROM public.wallet_transactions wt
    WHERE wt.transaction_type = 'SHOWCASE_CREDIT'
      AND wt.status = 'COMPLETED'
      AND wt.owner_user_id IS NOT NULL
  )
  UPDATE public.wallet_transactions wt
  SET
    status = 'REVERSED',
    metadata = COALESCE(wt.metadata, '{}'::jsonb) || jsonb_build_object(
      'reversal_reason', 'DUPLICATE_SHOWCASE_CREDIT_REVOKED',
      'reconciled_at', timezone('utc'::text, now())
    )
  FROM ranked_showcase_credits rsc
  WHERE wt.id = rsc.id
    AND rsc.rank_num > 1;

  CREATE UNIQUE INDEX IF NOT EXISTS ux_wallet_txns_owner_showcase_credit_unique
    ON public.wallet_transactions (owner_user_id)
    WHERE transaction_type = 'SHOWCASE_CREDIT' AND status = 'COMPLETED' AND owner_user_id IS NOT NULL;
END $$;

-- 5. Atomic PostgreSQL RPC Function for Owner-Level Showcase Reward Approval
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
  v_existing_credit public.wallet_transactions%ROWTYPE;
  v_new_txn public.wallet_transactions%ROWTYPE;
  v_owner_id UUID;
  v_reference_id TEXT;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
  v_credit_amount NUMERIC := 300.00;
  v_image_count INT := 0;
  v_video_count INT := 0;
  v_cur_date TEXT;
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

  -- 9. Insert Immutable Wallet Ledger Transaction
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

  -- 10. Record in owner_showcase_rewards table
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
  );

  -- 11. Credit Organization Wallet Balance
  UPDATE public.organization_wallets
  SET
    showcase_credit = COALESCE(showcase_credit, 0.00) + v_credit_amount,
    showcase_credit_granted = true,
    updated_at = v_now
  WHERE organization_id = v_showcase.organization_id
  RETURNING * INTO v_wallet;

  -- 12. Update Event Showcase Reward Status (Separated from review_status!)
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

  -- 13. Audit Log
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
    'owner_user_id', v_owner_id,
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
    'message', 'Owner first-event showcase reward approved and RM300 credit granted successfully.'
  );
END;
$$;
