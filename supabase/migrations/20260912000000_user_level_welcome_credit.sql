-- Migration: 20260912000000_user_level_welcome_credit.sql
-- Description: Enforce that Welcome Credit (RM800.00) is granted strictly ONCE per user account lifetime.
--              1. Creates public.user_rewards table with UNIQUE(user_id, reward_type).
--              2. Adds owner_user_id to wallet_transactions with unique partial index on WELCOME_CREDIT.
--              3. Backfills existing Welcome Credit grants into user_rewards.
--              4. Updates public.create_organization_atomic RPC to atomically enforce user-level Welcome Credit check.

-- 1. Create user_rewards table
CREATE TABLE IF NOT EXISTS public.user_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reward_type VARCHAR(50) NOT NULL, -- e.g. 'WELCOME_CREDIT'
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  transaction_id UUID,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 800.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT ux_user_rewards_user_reward UNIQUE (user_id, reward_type)
);

CREATE INDEX IF NOT EXISTS idx_user_rewards_user_type ON public.user_rewards (user_id, reward_type);

-- 2. Ensure owner_user_id column exists on wallet_transactions (added in 20260906040000_owner_level_showcase_reward.sql)
ALTER TABLE public.wallet_transactions ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL;
-- Clean up redundant index if created by earlier versions, maintaining canonical idx_wallet_transactions_owner_user_id
DROP INDEX IF EXISTS public.idx_wallet_txns_owner_user_id;
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_owner_user_id ON public.wallet_transactions (owner_user_id);
-- Temporarily drop unique index prior to duplicate reconciliation and backfill if re-running
DROP INDEX IF EXISTS public.ux_wallet_txns_user_welcome_credit_unique;

-- 3. Backfill owner_user_id on existing transactions
-- Backfill from organizations table (owner_id)
UPDATE public.wallet_transactions wt
SET owner_user_id = o.owner_id
FROM public.organizations o
WHERE wt.organization_id = o.id
  AND wt.owner_user_id IS NULL
  AND o.owner_id IS NOT NULL;

-- Fallback backfill from created_by if owner_id was not set
UPDATE public.wallet_transactions wt
SET owner_user_id = wt.created_by
WHERE wt.owner_user_id IS NULL
  AND wt.created_by IS NOT NULL;

-- 4. Detect duplicates and safely reconcile historical duplicates BEFORE creating the unique index
-- Business rule: Each user account may receive the Welcome Credit strictly ONCE in their lifetime.
-- Financial ledger immutability:
--   - Transactions are NEVER deleted.
--   - For each owner_user_id with multiple completed WELCOME_CREDIT transactions:
--     * Determine the single canonical transaction:
--       1) Prioritize transaction already linked in user_rewards (if any)
--       2) Prioritize transaction where welcome credit was actually consumed for an event
--       3) Earliest created transaction (created_at ASC, id ASC)
--     * Mark all other duplicate transactions as status = 'REVERSED' with audit metadata.
--     * Reconcile unspent wallet balances in organization_wallets so duplicate credits cannot be used.

DO $$
DECLARE
  v_reconciled_count INTEGER := 0;
BEGIN
  -- Perform ranking and status reconciliation for duplicate welcome credit transactions
  WITH ranked_welcome_credits AS (
    SELECT
      wt.id,
      wt.organization_id,
      wt.owner_user_id,
      wt.amount,
      wt.created_at,
      ROW_NUMBER() OVER (
        PARTITION BY wt.owner_user_id
        ORDER BY
          -- 1. Prioritize transaction already linked in user_rewards (if any)
          CASE WHEN ur.transaction_id = wt.id THEN 0 ELSE 1 END,
          -- 2. Prioritize transaction where welcome credit was actually consumed
          CASE WHEN EXISTS (
            SELECT 1 FROM public.wallet_transactions usage_txn
            WHERE usage_txn.organization_id = wt.organization_id
              AND usage_txn.balance_type = 'WELCOME_CREDIT'
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
          CASE WHEN ur.transaction_id = wt.id THEN 0 ELSE 1 END,
          CASE WHEN EXISTS (
            SELECT 1 FROM public.wallet_transactions usage_txn
            WHERE usage_txn.organization_id = wt.organization_id
              AND usage_txn.balance_type = 'WELCOME_CREDIT'
              AND usage_txn.amount < 0
              AND usage_txn.status = 'COMPLETED'
          ) THEN 0 ELSE 1 END,
          wt.created_at ASC,
          wt.id ASC
      ) AS canonical_txn_id
    FROM public.wallet_transactions wt
    LEFT JOIN public.user_rewards ur 
      ON ur.user_id = wt.owner_user_id AND ur.reward_type = 'WELCOME_CREDIT'
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
      'canonical_transaction_id', rwc.canonical_txn_id,
      'original_status', 'COMPLETED'
    )
  FROM ranked_welcome_credits rwc
  WHERE wt.id = rwc.id
    AND rwc.rank_num > 1;

  GET DIAGNOSTICS v_reconciled_count = ROW_COUNT;
  IF v_reconciled_count > 0 THEN
    RAISE NOTICE 'Reconciled % duplicate WELCOME_CREDIT transactions to status REVERSED', v_reconciled_count;
  END IF;

  -- Reconcile organization_wallets for organizations affected by duplicate welcome credit revocations.
  -- Recalculates welcome_credit balance from the remaining active completed transactions
  -- and sets welcome_credit_granted = false if no completed welcome credit remains for that organization.
  UPDATE public.organization_wallets ow
  SET
    welcome_credit = GREATEST(0.00, COALESCE(calc.net_welcome, 0.00)),
    welcome_credit_granted = COALESCE(calc.has_completed_welcome, false),
    updated_at = timezone('utc'::text, now())
  FROM (
    SELECT
      o.id AS org_id,
      COALESCE(SUM(CASE WHEN wt.balance_type = 'WELCOME_CREDIT' AND wt.status = 'COMPLETED' THEN wt.amount ELSE 0 END), 0.00) AS net_welcome,
      COALESCE(BOOL_OR(wt.transaction_type = 'WELCOME_CREDIT' AND wt.status = 'COMPLETED'), false) AS has_completed_welcome
    FROM public.organizations o
    LEFT JOIN public.wallet_transactions wt ON wt.organization_id = o.id
    WHERE o.id IN (
      SELECT DISTINCT organization_id
      FROM public.wallet_transactions
      WHERE transaction_type = 'WELCOME_CREDIT'
        AND status = 'REVERSED'
        AND (metadata->>'reconciliation_reason') = 'DUPLICATE_WELCOME_CREDIT_REVOKED'
    )
    GROUP BY o.id
  ) calc
  WHERE ow.organization_id = calc.org_id;

END $$;

-- 5. Backfill user_rewards table with the single canonical welcome credit for each user
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
  'WELCOME_CREDIT',
  wt.organization_id,
  wt.id,
  wt.amount,
  wt.created_at
FROM public.wallet_transactions wt
WHERE wt.transaction_type = 'WELCOME_CREDIT'
  AND wt.status = 'COMPLETED'
  AND wt.owner_user_id IS NOT NULL
ON CONFLICT (user_id, reward_type) 
DO UPDATE SET
  transaction_id = COALESCE(user_rewards.transaction_id, EXCLUDED.transaction_id),
  organization_id = COALESCE(user_rewards.organization_id, EXCLUDED.organization_id);

-- 6. Enforce at database index level: each user can only have at most one completed WELCOME_CREDIT transaction
CREATE UNIQUE INDEX IF NOT EXISTS ux_wallet_txns_user_welcome_credit_unique 
  ON public.wallet_transactions (owner_user_id) 
  WHERE transaction_type = 'WELCOME_CREDIT' AND status = 'COMPLETED' AND owner_user_id IS NOT NULL;

-- 7. Recreate create_organization_atomic RPC with user-level Welcome Credit grant logic
CREATE OR REPLACE FUNCTION public.create_organization_atomic(
  p_name TEXT,
  p_owner_id UUID,
  p_logo_url TEXT DEFAULT NULL,
  p_country_code TEXT DEFAULT NULL,
  p_org_id UUID DEFAULT NULL,
  p_slug TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_slug TEXT;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
  v_org public.organizations%ROWTYPE;
  v_wallet public.organization_wallets%ROWTYPE;
  v_welcome_amount NUMERIC(12, 2) := 800.00;
  v_base_slug TEXT;
  v_suffix TEXT;
  v_country VARCHAR(2);
  v_already_received BOOLEAN := false;
  v_grant_welcome BOOLEAN := false;
  v_user_reward_id UUID := NULL;
  v_txn_id UUID;
BEGIN
  -- 1. Input validations
  IF p_name IS NULL OR trim(p_name) = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'VALIDATION_ERROR',
      'error', 'Organization name is required',
      'message', 'Organization name is required'
    );
  END IF;

  IF p_owner_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'VALIDATION_ERROR',
      'error', 'Owner ID is required',
      'message', 'Owner ID is required'
    );
  END IF;

  -- Verify owner user exists
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_owner_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'USER_NOT_FOUND',
      'error', 'Owner user not found',
      'message', 'Owner user not found'
    );
  END IF;

  v_org_id := COALESCE(p_org_id, gen_random_uuid());
  v_country := NULL;
  IF p_country_code IS NOT NULL AND trim(p_country_code) <> '' THEN
    v_country := upper(trim(p_country_code));
  END IF;

  -- Generate slug if not provided
  IF p_slug IS NOT NULL AND trim(p_slug) <> '' THEN
    v_slug := trim(p_slug);
  ELSE
    v_base_slug := lower(regexp_replace(trim(p_name), '[^a-zA-Z0-9]+', '-', 'g'));
    v_base_slug := trim(both '-' from v_base_slug);
    IF v_base_slug = '' THEN
      v_base_slug := 'org';
    END IF;
    v_suffix := substr(md5(random()::text || clock_timestamp()::text), 1, 6);
    v_slug := v_base_slug || '-' || v_suffix;
  END IF;

  -- Check if user already received Welcome Credit in their account lifetime
  SELECT EXISTS(
    SELECT 1 FROM public.user_rewards 
    WHERE user_id = p_owner_id AND reward_type = 'WELCOME_CREDIT'
  ) INTO v_already_received;

  IF NOT v_already_received THEN
    SELECT EXISTS(
      SELECT 1 FROM public.wallet_transactions 
      WHERE transaction_type = 'WELCOME_CREDIT' 
        AND status = 'COMPLETED'
        AND (owner_user_id = p_owner_id OR created_by = p_owner_id)
    ) INTO v_already_received;
  END IF;

  -- 2. Create Organization
  INSERT INTO public.organizations (
    id,
    name,
    slug,
    owner_id,
    logo_url,
    country_code,
    created_at,
    updated_at
  ) VALUES (
    v_org_id,
    trim(p_name),
    v_slug,
    p_owner_id,
    p_logo_url,
    v_country,
    v_now,
    v_now
  )
  RETURNING * INTO v_org;

  -- 3. Create Owner Membership (idempotent ON CONFLICT)
  INSERT INTO public.organization_members (
    id,
    organization_id,
    user_id,
    role,
    created_at
  ) VALUES (
    gen_random_uuid(),
    v_org_id,
    p_owner_id,
    'owner',
    v_now
  )
  ON CONFLICT (organization_id, user_id) 
  DO UPDATE SET role = 'owner';

  -- 4. Determine Welcome Credit Eligibility
  IF NOT v_already_received THEN
    -- Attempt to reserve in user_rewards atomically
    INSERT INTO public.user_rewards (
      id,
      user_id,
      reward_type,
      organization_id,
      amount,
      created_at
    ) VALUES (
      gen_random_uuid(),
      p_owner_id,
      'WELCOME_CREDIT',
      v_org_id,
      v_welcome_amount,
      v_now
    )
    ON CONFLICT (user_id, reward_type) DO NOTHING
    RETURNING id INTO v_user_reward_id;

    IF v_user_reward_id IS NOT NULL THEN
      v_grant_welcome := true;
    ELSE
      v_grant_welcome := false;
    END IF;
  ELSE
    v_grant_welcome := false;
  END IF;

  -- 5. Create Wallet (idempotent ON CONFLICT)
  INSERT INTO public.organization_wallets (
    id,
    organization_id,
    paid_balance,
    welcome_credit,
    showcase_credit,
    topup_credit,
    currency,
    welcome_credit_granted,
    showcase_credit_granted,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    v_org_id,
    0.00,
    CASE WHEN v_grant_welcome THEN v_welcome_amount ELSE 0.00 END,
    0.00,
    0.00,
    'MYR',
    v_grant_welcome,
    false,
    v_now,
    v_now
  )
  ON CONFLICT (organization_id)
  DO UPDATE SET
    welcome_credit = CASE 
      WHEN v_grant_welcome THEN GREATEST(organization_wallets.welcome_credit, v_welcome_amount)
      ELSE organization_wallets.welcome_credit
    END,
    welcome_credit_granted = CASE
      WHEN v_grant_welcome THEN true
      ELSE organization_wallets.welcome_credit_granted
    END,
    updated_at = v_now
  RETURNING * INTO v_wallet;

  -- 6. Grant Welcome Credit transaction in immutable ledger if eligible
  IF v_grant_welcome THEN
    v_txn_id := gen_random_uuid();
    INSERT INTO public.wallet_transactions (
      id,
      organization_id,
      owner_user_id,
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
      v_txn_id,
      v_org_id,
      p_owner_id,
      NULL,
      'WELCOME_CREDIT',
      'WELCOME_CREDIT',
      v_welcome_amount,
      'MYR',
      'COMPLETED',
      'welcome_' || v_org_id::text,
      'One-time Welcome Credit grant of RM' || to_char(v_welcome_amount, 'FM999,990.00'),
      jsonb_build_object(
        'organization_name', v_org.name,
        'owner_user_id', p_owner_id,
        'source', 'AUTO_ORGANIZATION_CREATION',
        'program', 'ORGANIZATION_ONBOARDING_WELCOME'
      ),
      p_owner_id,
      v_now
    )
    ON CONFLICT (organization_id, reference_id) WHERE reference_id IS NOT NULL AND status IN ('COMPLETED', 'PENDING')
    DO NOTHING;

    -- Update user_rewards with transaction_id
    IF v_user_reward_id IS NOT NULL THEN
      UPDATE public.user_rewards
      SET transaction_id = v_txn_id
      WHERE id = v_user_reward_id;
    END IF;
  END IF;

  -- 7. Return response
  RETURN jsonb_build_object(
    'success', true,
    'organization', to_jsonb(v_org),
    'wallet', to_jsonb(v_wallet),
    'welcome_credit_granted', v_grant_welcome,
    'message', 'Organization created successfully'
  );
EXCEPTION
  WHEN unique_violation THEN
    -- If slug collided, retry once with longer random suffix
    v_suffix := substr(md5(random()::text || clock_timestamp()::text), 1, 8);
    v_slug := v_base_slug || '-' || v_suffix;

    INSERT INTO public.organizations (
      id,
      name,
      slug,
      owner_id,
      logo_url,
      country_code,
      created_at,
      updated_at
    ) VALUES (
      v_org_id,
      trim(p_name),
      v_slug,
      p_owner_id,
      p_logo_url,
      v_country,
      v_now,
      v_now
    )
    RETURNING * INTO v_org;

    INSERT INTO public.organization_members (
      id,
      organization_id,
      user_id,
      role,
      created_at
    ) VALUES (
      gen_random_uuid(),
      v_org_id,
      p_owner_id,
      'owner',
      v_now
    )
    ON CONFLICT (organization_id, user_id) 
    DO UPDATE SET role = 'owner';

    -- Check if user already received Welcome Credit in their account lifetime
    SELECT EXISTS(
      SELECT 1 FROM public.user_rewards 
      WHERE user_id = p_owner_id AND reward_type = 'WELCOME_CREDIT'
    ) INTO v_already_received;

    IF NOT v_already_received THEN
      SELECT EXISTS(
        SELECT 1 FROM public.wallet_transactions 
        WHERE transaction_type = 'WELCOME_CREDIT' 
          AND status = 'COMPLETED'
          AND (owner_user_id = p_owner_id OR created_by = p_owner_id)
      ) INTO v_already_received;
    END IF;

    IF NOT v_already_received THEN
      INSERT INTO public.user_rewards (
        id,
        user_id,
        reward_type,
        organization_id,
        amount,
        created_at
      ) VALUES (
        gen_random_uuid(),
        p_owner_id,
        'WELCOME_CREDIT',
        v_org_id,
        v_welcome_amount,
        v_now
      )
      ON CONFLICT (user_id, reward_type) DO NOTHING
      RETURNING id INTO v_user_reward_id;

      IF v_user_reward_id IS NOT NULL THEN
        v_grant_welcome := true;
      ELSE
        v_grant_welcome := false;
      END IF;
    ELSE
      v_grant_welcome := false;
    END IF;

    INSERT INTO public.organization_wallets (
      id,
      organization_id,
      paid_balance,
      welcome_credit,
      showcase_credit,
      topup_credit,
      currency,
      welcome_credit_granted,
      showcase_credit_granted,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid(),
      v_org_id,
      0.00,
      CASE WHEN v_grant_welcome THEN v_welcome_amount ELSE 0.00 END,
      0.00,
      0.00,
      'MYR',
      v_grant_welcome,
      false,
      v_now,
      v_now
    )
    ON CONFLICT (organization_id)
    DO UPDATE SET
      welcome_credit = CASE 
        WHEN v_grant_welcome THEN GREATEST(organization_wallets.welcome_credit, v_welcome_amount)
        ELSE organization_wallets.welcome_credit
      END,
      welcome_credit_granted = CASE
        WHEN v_grant_welcome THEN true
        ELSE organization_wallets.welcome_credit_granted
      END,
      updated_at = v_now
    RETURNING * INTO v_wallet;

    IF v_grant_welcome THEN
      v_txn_id := gen_random_uuid();
      INSERT INTO public.wallet_transactions (
        id,
        organization_id,
        owner_user_id,
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
        v_txn_id,
        v_org_id,
        p_owner_id,
        NULL,
        'WELCOME_CREDIT',
        'WELCOME_CREDIT',
        v_welcome_amount,
        'MYR',
        'COMPLETED',
        'welcome_' || v_org_id::text,
        'One-time Welcome Credit grant of RM' || to_char(v_welcome_amount, 'FM999,990.00'),
        jsonb_build_object(
          'organization_name', v_org.name,
          'owner_user_id', p_owner_id,
          'source', 'AUTO_ORGANIZATION_CREATION',
          'program', 'ORGANIZATION_ONBOARDING_WELCOME'
        ),
        p_owner_id,
        v_now
      )
      ON CONFLICT (organization_id, reference_id) WHERE reference_id IS NOT NULL AND status IN ('COMPLETED', 'PENDING')
      DO NOTHING;

      IF v_user_reward_id IS NOT NULL THEN
        UPDATE public.user_rewards
        SET transaction_id = v_txn_id
        WHERE id = v_user_reward_id;
      END IF;
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'organization', to_jsonb(v_org),
      'wallet', to_jsonb(v_wallet),
      'welcome_credit_granted', v_grant_welcome,
      'message', 'Organization created successfully'
    );
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', SQLSTATE,
      'error', SQLERRM,
      'message', 'Failed to create organization atomically: ' || SQLERRM
    );
END;
$$;

-- Security Permissions: Backend-write-only
GRANT EXECUTE ON FUNCTION public.create_organization_atomic(TEXT, UUID, TEXT, TEXT, UUID, TEXT) TO service_role;
REVOKE EXECUTE ON FUNCTION public.create_organization_atomic(TEXT, UUID, TEXT, TEXT, UUID, TEXT) FROM authenticated, anon, public;
