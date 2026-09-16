-- ==============================================================================
-- Migration: 20260916000000_owner_only_user_level_promotions.sql
-- Description: Enforce Owner-Only, User-Level, One-Time Reward Architecture
--              for Welcome Credit and Showcase Reward.
--
-- Business Rules:
-- 1. One-time promotions are granted only to an organization OWNER.
-- 2. Eligibility belongs to the OWNER'S USER ACCOUNT, not to the organization.
-- 3. Each promotion can be received only once per user lifetime (UNIQUE(user_id, reward_type)).
-- 4. Organization MEMBERS can never receive these promotions.
-- 5. Independent tracking for WELCOME_CREDIT and SHOWCASE_REWARD.
-- 6. Historical claims preserved and reconciled into public.user_rewards.
-- ==============================================================================

-- ==============================================================================
-- 0. PREREQUISITE TABLE DEFENSIVE DEFINITIONS
-- Guarantees core wallet, showcase, and user/organization tables exist so this
-- migration can execute cleanly either sequentially or standalone in the Supabase SQL editor.
-- ==============================================================================

-- Ensure users table exists
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  avatar_url TEXT,
  is_developer BOOLEAN NOT NULL DEFAULT false,
  google_id TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Ensure organizations table exists
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  owner_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  country_code VARCHAR(2) NOT NULL DEFAULT 'MY',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.organizations 
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES public.users(id) ON DELETE CASCADE;

-- Ensure organization_members table exists
CREATE TABLE IF NOT EXISTS public.organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT ux_org_members_org_user UNIQUE (organization_id, user_id)
);

-- Ensure events table exists
CREATE TABLE IF NOT EXISTS public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  game_id TEXT NOT NULL,
  theme_id UUID,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  payment_status TEXT NOT NULL DEFAULT 'UNPAID',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Ensure organization_wallets exists
CREATE TABLE IF NOT EXISTS public.organization_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  paid_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (paid_balance >= 0.00),
  welcome_credit NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (welcome_credit >= 0.00),
  showcase_credit NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (showcase_credit >= 0.00),
  topup_credit NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (topup_credit >= 0.00),
  outstanding_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (outstanding_balance >= 0.00),
  currency TEXT NOT NULL DEFAULT 'MYR',
  welcome_credit_granted BOOLEAN NOT NULL DEFAULT false,
  showcase_credit_granted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.organization_wallets 
  ADD COLUMN IF NOT EXISTS outstanding_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (outstanding_balance >= 0.00);

-- Ensure wallet_transactions exists
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_id UUID,
  owner_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  transaction_type TEXT NOT NULL,
  balance_type TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'MYR',
  status TEXT NOT NULL DEFAULT 'COMPLETED',
  reference_id TEXT,
  description TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.wallet_transactions 
  ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.wallet_transactions 
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now());

-- Ensure event_showcases exists
CREATE TABLE IF NOT EXISTS public.event_showcases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL UNIQUE REFERENCES public.events(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  owner_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  headline TEXT,
  game_id TEXT NOT NULL,
  theme_id UUID,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  reward_status TEXT NOT NULL DEFAULT 'NOT_ELIGIBLE',
  reward_review_status TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
  reward_reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reward_reviewed_at TIMESTAMPTZ,
  reward_rejection_reason TEXT,
  reward_transaction_id UUID REFERENCES public.wallet_transactions(id) ON DELETE SET NULL,
  reward_granted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.event_showcases
  ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.event_showcases
  ADD COLUMN IF NOT EXISTS reward_status TEXT NOT NULL DEFAULT 'NOT_ELIGIBLE';
ALTER TABLE public.event_showcases
  ADD COLUMN IF NOT EXISTS reward_review_status TEXT NOT NULL DEFAULT 'PENDING_REVIEW';
ALTER TABLE public.event_showcases
  ADD COLUMN IF NOT EXISTS reward_reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.event_showcases
  ADD COLUMN IF NOT EXISTS reward_reviewed_at TIMESTAMPTZ;
ALTER TABLE public.event_showcases
  ADD COLUMN IF NOT EXISTS reward_rejection_reason TEXT;
ALTER TABLE public.event_showcases
  ADD COLUMN IF NOT EXISTS reward_transaction_id UUID REFERENCES public.wallet_transactions(id) ON DELETE SET NULL;
ALTER TABLE public.event_showcases
  ADD COLUMN IF NOT EXISTS reward_granted_at TIMESTAMPTZ;

-- Ensure owner_showcase_rewards exists
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

-- ==============================================================================
-- 1. Ensure public.user_rewards table exists with strict UNIQUE(user_id, reward_type)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.user_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reward_type VARCHAR(50) NOT NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  transaction_id UUID,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 800.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT ux_user_rewards_user_reward UNIQUE (user_id, reward_type)
);

CREATE INDEX IF NOT EXISTS idx_user_rewards_user_type ON public.user_rewards (user_id, reward_type);

-- 2. Backfill and reconcile historical rewards into public.user_rewards

-- Migrate any existing SHOWCASE_CREDIT entries to SHOWCASE_REWARD
UPDATE public.user_rewards
SET reward_type = 'SHOWCASE_REWARD'
WHERE reward_type = 'SHOWCASE_CREDIT';

-- Backfill completed WELCOME_CREDIT transactions from ledger
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
  COALESCE(wt.owner_user_id, wt.created_by),
  'WELCOME_CREDIT',
  wt.organization_id,
  wt.id,
  wt.amount,
  wt.created_at
FROM public.wallet_transactions wt
WHERE wt.transaction_type = 'WELCOME_CREDIT'
  AND wt.status = 'COMPLETED'
  AND COALESCE(wt.owner_user_id, wt.created_by) IS NOT NULL
ON CONFLICT (user_id, reward_type) DO NOTHING;

-- Backfill completed SHOWCASE_CREDIT transactions from ledger as SHOWCASE_REWARD
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
  COALESCE(wt.owner_user_id, wt.created_by),
  'SHOWCASE_REWARD',
  wt.organization_id,
  wt.id,
  wt.amount,
  wt.created_at
FROM public.wallet_transactions wt
WHERE wt.transaction_type = 'SHOWCASE_CREDIT'
  AND wt.status = 'COMPLETED'
  AND COALESCE(wt.owner_user_id, wt.created_by) IS NOT NULL
ON CONFLICT (user_id, reward_type) DO NOTHING;

-- Backfill from owner_showcase_rewards table
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
  'SHOWCASE_REWARD',
  osr.organization_id,
  osr.transaction_id,
  COALESCE(osr.amount, 300.00),
  osr.rewarded_at
FROM public.owner_showcase_rewards osr
WHERE osr.owner_user_id IS NOT NULL
ON CONFLICT (user_id, reward_type) DO NOTHING;

-- 3. Create Atomic Function for Owner-Only Welcome Credit Grant
CREATE OR REPLACE FUNCTION public.grant_welcome_credit_atomic(
  p_org_id UUID,
  p_user_id UUID,
  p_reviewer_id UUID DEFAULT NULL,
  p_reference_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
  v_org public.organizations%ROWTYPE;
  v_wallet public.organization_wallets%ROWTYPE;
  v_welcome_amount NUMERIC(12, 2) := 800.00;
  v_user_reward public.user_rewards%ROWTYPE;
  v_new_txn public.wallet_transactions%ROWTYPE;
  v_ref_id TEXT;
BEGIN
  -- 1. Input Validation
  IF p_org_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'VALIDATION_ERROR',
      'error', 'Organization ID is required',
      'message', 'Organization ID is required'
    );
  END IF;

  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'VALIDATION_ERROR',
      'error', 'User ID is required',
      'message', 'User ID is required'
    );
  END IF;

  -- 2. Verify Organization Exists & Check Authoritative Ownership
  SELECT * INTO v_org
  FROM public.organizations
  WHERE id = p_org_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'ORGANIZATION_NOT_FOUND',
      'error', 'Organization not found',
      'message', 'Organization not found'
    );
  END IF;

  -- OWNER-ONLY CONSTRAINT: Only the actual organization owner is eligible
  IF v_org.owner_id <> p_user_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'NOT_OWNER',
      'not_eligible', true,
      'already_granted', false,
      'error', 'Only the organization owner is eligible for Welcome Credit. Members are not eligible.',
      'message', 'Only the organization owner is eligible for Welcome Credit. Members are not eligible.'
    );
  END IF;

  -- 3. Check Lifetime Claim Record (user_rewards)
  SELECT * INTO v_user_reward
  FROM public.user_rewards
  WHERE user_id = p_user_id
    AND reward_type = 'WELCOME_CREDIT';

  IF FOUND THEN
    SELECT * INTO v_wallet
    FROM public.organization_wallets
    WHERE organization_id = p_org_id;

    RETURN jsonb_build_object(
      'success', true,
      'already_granted', true,
      'not_eligible', true,
      'wallet', row_to_json(v_wallet),
      'message', 'Welcome Credit has already been granted to this user in their account lifetime (one-time lifetime limit).'
    );
  END IF;

  -- Also check wallet_transactions ledger for any past completed Welcome Credit for this owner
  IF EXISTS (
    SELECT 1 FROM public.wallet_transactions
    WHERE (owner_user_id = p_user_id OR created_by = p_user_id)
      AND transaction_type = 'WELCOME_CREDIT'
      AND status = 'COMPLETED'
  ) THEN
    SELECT * INTO v_wallet
    FROM public.organization_wallets
    WHERE organization_id = p_org_id;

    RETURN jsonb_build_object(
      'success', true,
      'already_granted', true,
      'not_eligible', true,
      'wallet', row_to_json(v_wallet),
      'message', 'Welcome Credit has already been granted to this user in their account lifetime (one-time lifetime limit).'
    );
  END IF;

  -- 4. Lock Organization Wallet Row with FOR UPDATE
  INSERT INTO public.organization_wallets (
    organization_id,
    paid_balance,
    welcome_credit,
    showcase_credit,
    topup_credit,
    outstanding_balance,
    welcome_credit_granted,
    created_at,
    updated_at
  ) VALUES (
    p_org_id,
    0.00,
    0.00,
    0.00,
    0.00,
    0.00,
    false,
    v_now,
    v_now
  )
  ON CONFLICT (organization_id) DO NOTHING;

  SELECT * INTO v_wallet
  FROM public.organization_wallets
  WHERE organization_id = p_org_id
  FOR UPDATE;

  -- 5. Atomically reserve in public.user_rewards (enforcing UNIQUE(user_id, reward_type))
  INSERT INTO public.user_rewards (
    id,
    user_id,
    reward_type,
    organization_id,
    amount,
    created_at
  ) VALUES (
    gen_random_uuid(),
    p_user_id,
    'WELCOME_CREDIT',
    p_org_id,
    v_welcome_amount,
    v_now
  )
  ON CONFLICT (user_id, reward_type) DO NOTHING
  RETURNING * INTO v_user_reward;

  IF v_user_reward.id IS NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_granted', true,
      'not_eligible', true,
      'wallet', row_to_json(v_wallet),
      'message', 'Welcome Credit has already been granted to this user in their account lifetime (one-time lifetime limit).'
    );
  END IF;

  -- 6. Insert into Immutable Wallet Transactions Ledger
  v_ref_id := COALESCE(p_reference_id, 'welcome_' || p_org_id::text);

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
    p_org_id,
    p_user_id,
    NULL,
    'WELCOME_CREDIT',
    'WELCOME_CREDIT',
    v_welcome_amount,
    'COMPLETED',
    v_ref_id,
    COALESCE(p_reviewer_id, p_user_id),
    p_metadata || jsonb_build_object(
      'owner_user_id', p_user_id,
      'program', 'ORGANIZATION_ONBOARDING_WELCOME',
      'credited_at', v_now
    ),
    v_now,
    v_now
  )
  RETURNING * INTO v_new_txn;

  -- Link transaction_id in user_rewards
  UPDATE public.user_rewards
  SET transaction_id = v_new_txn.id
  WHERE id = v_user_reward.id;

  -- 7. Credit Organization Wallet
  UPDATE public.organization_wallets
  SET
    welcome_credit = COALESCE(welcome_credit, 0.00) + v_welcome_amount,
    welcome_credit_granted = true,
    updated_at = v_now
  WHERE organization_id = p_org_id
  RETURNING * INTO v_wallet;

  RETURN jsonb_build_object(
    'success', true,
    'already_granted', false,
    'transaction', row_to_json(v_new_txn),
    'wallet', row_to_json(v_wallet),
    'user_reward', row_to_json(v_user_reward)
  );
END;
$$;

-- 4. Recreate Atomic Showcase Reward Approval Function with Owner-Only User-Level Guarantee
CREATE OR REPLACE FUNCTION public.approve_first_event_showcase_reward_atomic(
  p_showcase_id UUID,
  p_reviewer_id UUID DEFAULT NULL,
  p_reference_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_showcase public.event_showcases%ROWTYPE;
  v_org public.organizations%ROWTYPE;
  v_event public.events%ROWTYPE;
  v_wallet public.organization_wallets%ROWTYPE;
  v_owner_id UUID;
  v_user_reward public.user_rewards%ROWTYPE;
  v_existing_credit public.wallet_transactions%ROWTYPE;
  v_new_txn public.wallet_transactions%ROWTYPE;
  v_credit_amount NUMERIC(12, 2) := 300.00;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
  v_reference_id TEXT;
BEGIN
  -- 1. Fetch Showcase Record
  SELECT * INTO v_showcase
  FROM public.event_showcases
  WHERE id = p_showcase_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Showcase not found: %', p_showcase_id;
  END IF;

  -- 2. Verify Showcase is not blocked
  IF v_showcase.status = 'BLOCKED' THEN
    RAISE EXCEPTION 'Showcase is blocked and cannot receive rewards';
  END IF;

  -- 3. Resolve Organization and AUTHORITATIVE Organization Owner
  SELECT * INTO v_org
  FROM public.organizations
  WHERE id = v_showcase.organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization not found for showcase %', p_showcase_id;
  END IF;

  -- AUTHORITATIVE OWNER: The owner of the organization, NOT the showcase uploader / member
  v_owner_id := v_org.owner_id;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Organization owner could not be resolved for showcase %', p_showcase_id;
  END IF;

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

  -- 5. Owner-Level First-Reward Invariant Check:
  -- Verify if owner_user_id has ALREADY received a lifetime showcase reward in ANY organization
  SELECT * INTO v_user_reward
  FROM public.user_rewards
  WHERE user_id = v_owner_id AND reward_type IN ('SHOWCASE_REWARD', 'SHOWCASE_CREDIT');

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

  -- 9. Atomically reserve in public.user_rewards with SHOWCASE_REWARD
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
    'SHOWCASE_REWARD',
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

  -- 13. Update event_showcases record
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
    'message', 'Showcase approved and RM300 reward credited successfully to organization.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.grant_welcome_credit_atomic(UUID, UUID, UUID, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.approve_first_event_showcase_reward_atomic(UUID, UUID, TEXT, JSONB) TO service_role;
REVOKE EXECUTE ON FUNCTION public.grant_welcome_credit_atomic(UUID, UUID, UUID, TEXT, JSONB) FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.approve_first_event_showcase_reward_atomic(UUID, UUID, TEXT, JSONB) FROM authenticated, anon, public;
