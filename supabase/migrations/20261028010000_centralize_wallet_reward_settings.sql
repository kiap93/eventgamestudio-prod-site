-- ==============================================================================
-- Migration: 20261028010000_centralize_wallet_reward_settings.sql
-- Description: Centralized Wallet Reward Settings & Multi-Currency Top-Up Tiers.
--              Introduces public.wallet_reward_settings, public.wallet_topup_tiers,
--              and public.wallet_reward_settings_history with RLS policies, seeds
--              initial configurations (MY, SG, US), and refactors atomic functions:
--              grant_welcome_credit_atomic, approve_first_event_showcase_reward_atomic,
--              and process_topup_order_atomic to use the centralized settings.
-- ==============================================================================

-- 1. Create public.wallet_reward_settings table
CREATE TABLE IF NOT EXISTS public.wallet_reward_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code VARCHAR(2) NOT NULL,
  currency VARCHAR(3) NOT NULL,
  welcome_credit_amount NUMERIC(12, 2) NOT NULL DEFAULT 800.00 CHECK (welcome_credit_amount >= 0),
  welcome_credit_enabled BOOLEAN NOT NULL DEFAULT true,
  showcase_credit_amount NUMERIC(12, 2) NOT NULL DEFAULT 300.00 CHECK (showcase_credit_amount >= 0),
  showcase_credit_enabled BOOLEAN NOT NULL DEFAULT true,
  topup_bonus_enabled BOOLEAN NOT NULL DEFAULT true,
  max_topup_credit_per_event_percent NUMERIC(5, 4) NOT NULL DEFAULT 0.2000 CHECK (max_topup_credit_per_event_percent >= 0 AND max_topup_credit_per_event_percent <= 1),
  is_active BOOLEAN NOT NULL DEFAULT true,
  version INT NOT NULL DEFAULT 1,
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT uq_wallet_reward_settings_country UNIQUE (country_code)
);

-- 2. Create public.wallet_topup_tiers table
CREATE TABLE IF NOT EXISTS public.wallet_topup_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reward_settings_id UUID NOT NULL REFERENCES public.wallet_reward_settings(id) ON DELETE CASCADE,
  country_code VARCHAR(2) NOT NULL,
  currency VARCHAR(3) NOT NULL,
  tier_name TEXT NOT NULL,
  min_deposit NUMERIC(12, 2) NOT NULL CHECK (min_deposit >= 0),
  max_deposit NUMERIC(12, 2) CHECK (max_deposit IS NULL OR max_deposit >= min_deposit),
  calculation_type VARCHAR(20) NOT NULL DEFAULT 'PERCENTAGE' CHECK (calculation_type IN ('PERCENTAGE', 'FIXED')),
  bonus_rate NUMERIC(6, 4) NOT NULL DEFAULT 0.0000 CHECK (bonus_rate >= 0),
  bonus_fixed_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (bonus_fixed_amount >= 0),
  max_bonus_amount NUMERIC(12, 2) CHECK (max_bonus_amount IS NULL OR max_bonus_amount >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. Create public.wallet_reward_settings_history table
CREATE TABLE IF NOT EXISTS public.wallet_reward_settings_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settings_id UUID NOT NULL,
  country_code VARCHAR(2) NOT NULL,
  currency VARCHAR(3) NOT NULL,
  version INT NOT NULL,
  snapshot JSONB NOT NULL,
  changed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  change_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_wallet_reward_settings_country ON public.wallet_reward_settings(country_code);
CREATE INDEX IF NOT EXISTS idx_wallet_reward_settings_currency ON public.wallet_reward_settings(currency);
CREATE INDEX IF NOT EXISTS idx_wallet_topup_tiers_country ON public.wallet_topup_tiers(country_code, is_active);
CREATE INDEX IF NOT EXISTS idx_wallet_topup_tiers_settings ON public.wallet_topup_tiers(reward_settings_id);
CREATE INDEX IF NOT EXISTS idx_wallet_topup_tiers_currency_active ON public.wallet_topup_tiers(currency, is_active);
CREATE INDEX IF NOT EXISTS idx_wallet_reward_settings_history_settings ON public.wallet_reward_settings_history(settings_id);

-- Enable Row Level Security
ALTER TABLE public.wallet_reward_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_topup_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_reward_settings_history ENABLE ROW LEVEL SECURITY;

-- Read policies: Authenticated users & service_role can read active reward settings
DROP POLICY IF EXISTS "Anyone can view active reward settings" ON public.wallet_reward_settings;
CREATE POLICY "Anyone can view active reward settings"
  ON public.wallet_reward_settings
  FOR SELECT
  TO authenticated, anon, service_role
  USING (true);

DROP POLICY IF EXISTS "Anyone can view active topup tiers" ON public.wallet_topup_tiers;
CREATE POLICY "Anyone can view active topup tiers"
  ON public.wallet_topup_tiers
  FOR SELECT
  TO authenticated, anon, service_role
  USING (true);

DROP POLICY IF EXISTS "Only developer admins can view reward settings history" ON public.wallet_reward_settings_history;
CREATE POLICY "Only developer admins can view reward settings history"
  ON public.wallet_reward_settings_history
  FOR SELECT
  TO authenticated, service_role
  USING (
    CURRENT_USER = 'service_role' OR
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_developer = true)
  );

-- Write policies: Developer admins & service_role only
DROP POLICY IF EXISTS "Developer admins can manage reward settings" ON public.wallet_reward_settings;
CREATE POLICY "Developer admins can manage reward settings"
  ON public.wallet_reward_settings
  FOR ALL
  TO authenticated, service_role
  USING (
    CURRENT_USER = 'service_role' OR
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_developer = true)
  )
  WITH CHECK (
    CURRENT_USER = 'service_role' OR
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_developer = true)
  );

DROP POLICY IF EXISTS "Developer admins can manage topup tiers" ON public.wallet_topup_tiers;
CREATE POLICY "Developer admins can manage topup tiers"
  ON public.wallet_topup_tiers
  FOR ALL
  TO authenticated, service_role
  USING (
    CURRENT_USER = 'service_role' OR
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_developer = true)
  )
  WITH CHECK (
    CURRENT_USER = 'service_role' OR
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_developer = true)
  );

DROP POLICY IF EXISTS "Developer admins can insert reward settings history" ON public.wallet_reward_settings_history;
CREATE POLICY "Developer admins can insert reward settings history"
  ON public.wallet_reward_settings_history
  FOR INSERT
  TO authenticated, service_role
  WITH CHECK (
    CURRENT_USER = 'service_role' OR
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_developer = true)
  );

-- 4. Seed Verified Baseline Settings (MY, SG, US)
DO $$
DECLARE
  v_my_id UUID;
  v_sg_id UUID;
  v_us_id UUID;
BEGIN
  -- Malaysia (MY / MYR)
  INSERT INTO public.wallet_reward_settings (
    country_code,
    currency,
    welcome_credit_amount,
    welcome_credit_enabled,
    showcase_credit_amount,
    showcase_credit_enabled,
    topup_bonus_enabled,
    max_topup_credit_per_event_percent,
    is_active,
    version
  ) VALUES (
    'MY',
    'MYR',
    800.00,
    true,
    300.00,
    true,
    true,
    0.2000,
    true,
    1
  )
  ON CONFLICT (country_code) DO UPDATE
  SET
    currency = EXCLUDED.currency,
    updated_at = timezone('utc'::text, now())
  RETURNING id INTO v_my_id;

  IF v_my_id IS NOT NULL THEN
    -- Tier 1: RM6,000 -> 5%
    INSERT INTO public.wallet_topup_tiers (
      reward_settings_id, country_code, currency, tier_name,
      min_deposit, max_deposit, calculation_type, bonus_rate,
      bonus_fixed_amount, is_active, sort_order
    )
    SELECT
      v_my_id, 'MY', 'MYR', 'Tier 1 (5% Bonus)',
      6000.00, NULL, 'PERCENTAGE', 0.0500,
      0.00, true, 1
    WHERE NOT EXISTS (
      SELECT 1 FROM public.wallet_topup_tiers WHERE reward_settings_id = v_my_id AND min_deposit = 6000.00
    );

    -- Tier 2: RM10,000 -> 7%
    INSERT INTO public.wallet_topup_tiers (
      reward_settings_id, country_code, currency, tier_name,
      min_deposit, max_deposit, calculation_type, bonus_rate,
      bonus_fixed_amount, is_active, sort_order
    )
    SELECT
      v_my_id, 'MY', 'MYR', 'Tier 2 (7% Bonus)',
      10000.00, NULL, 'PERCENTAGE', 0.0700,
      0.00, true, 2
    WHERE NOT EXISTS (
      SELECT 1 FROM public.wallet_topup_tiers WHERE reward_settings_id = v_my_id AND min_deposit = 10000.00
    );
  END IF;

  -- Singapore (SG / SGD)
  INSERT INTO public.wallet_reward_settings (
    country_code,
    currency,
    welcome_credit_amount,
    welcome_credit_enabled,
    showcase_credit_amount,
    showcase_credit_enabled,
    topup_bonus_enabled,
    max_topup_credit_per_event_percent,
    is_active,
    version
  ) VALUES (
    'SG',
    'SGD',
    300.00,
    true,
    100.00,
    true,
    true,
    0.2000,
    true,
    1
  )
  ON CONFLICT (country_code) DO NOTHING
  RETURNING id INTO v_sg_id;

  IF v_sg_id IS NULL THEN
    SELECT id INTO v_sg_id FROM public.wallet_reward_settings WHERE country_code = 'SG';
  END IF;

  IF v_sg_id IS NOT NULL THEN
    INSERT INTO public.wallet_topup_tiers (
      reward_settings_id, country_code, currency, tier_name,
      min_deposit, max_deposit, calculation_type, bonus_rate,
      bonus_fixed_amount, is_active, sort_order
    )
    SELECT
      v_sg_id, 'SG', 'SGD', 'Tier 1 (5% Bonus)',
      2000.00, NULL, 'PERCENTAGE', 0.0500,
      0.00, true, 1
    WHERE NOT EXISTS (
      SELECT 1 FROM public.wallet_topup_tiers WHERE reward_settings_id = v_sg_id AND min_deposit = 2000.00
    );

    INSERT INTO public.wallet_topup_tiers (
      reward_settings_id, country_code, currency, tier_name,
      min_deposit, max_deposit, calculation_type, bonus_rate,
      bonus_fixed_amount, is_active, sort_order
    )
    SELECT
      v_sg_id, 'SG', 'SGD', 'Tier 2 (7% Bonus)',
      3500.00, NULL, 'PERCENTAGE', 0.0700,
      0.00, true, 2
    WHERE NOT EXISTS (
      SELECT 1 FROM public.wallet_topup_tiers WHERE reward_settings_id = v_sg_id AND min_deposit = 3500.00
    );
  END IF;

  -- United States (US / USD)
  INSERT INTO public.wallet_reward_settings (
    country_code,
    currency,
    welcome_credit_amount,
    welcome_credit_enabled,
    showcase_credit_amount,
    showcase_credit_enabled,
    topup_bonus_enabled,
    max_topup_credit_per_event_percent,
    is_active,
    version
  ) VALUES (
    'US',
    'USD',
    200.00,
    true,
    75.00,
    true,
    true,
    0.2000,
    true,
    1
  )
  ON CONFLICT (country_code) DO NOTHING
  RETURNING id INTO v_us_id;

  IF v_us_id IS NULL THEN
    SELECT id INTO v_us_id FROM public.wallet_reward_settings WHERE country_code = 'US';
  END IF;

  IF v_us_id IS NOT NULL THEN
    INSERT INTO public.wallet_topup_tiers (
      reward_settings_id, country_code, currency, tier_name,
      min_deposit, max_deposit, calculation_type, bonus_rate,
      bonus_fixed_amount, is_active, sort_order
    )
    SELECT
      v_us_id, 'US', 'USD', 'Tier 1 (5% Bonus)',
      1500.00, NULL, 'PERCENTAGE', 0.0500,
      0.00, true, 1
    WHERE NOT EXISTS (
      SELECT 1 FROM public.wallet_topup_tiers WHERE reward_settings_id = v_us_id AND min_deposit = 1500.00
    );

    INSERT INTO public.wallet_topup_tiers (
      reward_settings_id, country_code, currency, tier_name,
      min_deposit, max_deposit, calculation_type, bonus_rate,
      bonus_fixed_amount, is_active, sort_order
    )
    SELECT
      v_us_id, 'US', 'USD', 'Tier 2 (7% Bonus)',
      2500.00, NULL, 'PERCENTAGE', 0.0700,
      0.00, true, 2
    WHERE NOT EXISTS (
      SELECT 1 FROM public.wallet_topup_tiers WHERE reward_settings_id = v_us_id AND min_deposit = 2500.00
    );
  END IF;
END $$;

-- 5. Refactor grant_welcome_credit_atomic to use centralized settings
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
  v_welcome_enabled BOOLEAN := true;
  v_settings public.wallet_reward_settings%ROWTYPE;
  v_user_reward public.user_rewards%ROWTYPE;
  v_new_txn public.wallet_transactions%ROWTYPE;
  v_ref_id TEXT;
  v_country TEXT;
  v_currency TEXT;
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

  -- Strictly verify that the user is the OWNER of this organization
  IF v_org.owner_id IS DISTINCT FROM p_user_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'NOT_AN_OWNER',
      'not_eligible', true,
      'already_granted', false,
      'error', 'Welcome Credit can only be granted to the organization OWNER. Organization members are not eligible.',
      'message', 'Welcome Credit can only be granted to the organization OWNER. Organization members are not eligible.'
    );
  END IF;

  -- 3. Resolve Country and Reward Settings
  v_country := UPPER(COALESCE(v_org.country_code, 'MY'));

  SELECT * INTO v_settings
  FROM public.wallet_reward_settings
  WHERE country_code = v_country AND is_active = true;

  IF NOT FOUND THEN
    -- Fallback to default MY settings if currency matches MYR
    SELECT * INTO v_settings
    FROM public.wallet_reward_settings
    WHERE country_code = 'MY' AND is_active = true;
  END IF;

  IF FOUND THEN
    v_welcome_amount := v_settings.welcome_credit_amount;
    v_welcome_enabled := v_settings.welcome_credit_enabled;
    v_currency := v_settings.currency;
  ELSE
    v_welcome_amount := 800.00;
    v_welcome_enabled := true;
    v_currency := 'MYR';
  END IF;

  IF NOT v_welcome_enabled THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'WELCOME_CREDIT_DISABLED',
      'not_eligible', true,
      'already_granted', false,
      'error', 'Welcome Credit grants are currently disabled for this region.',
      'message', 'Welcome Credit grants are currently disabled for this region.'
    );
  END IF;

  IF v_welcome_amount <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'WELCOME_CREDIT_ZERO',
      'not_eligible', true,
      'already_granted', false,
      'error', 'Welcome Credit amount is configured as zero.',
      'message', 'Welcome Credit amount is configured as zero.'
    );
  END IF;

  -- 4. Lock Organization Wallet to guarantee serial execution
  SELECT * INTO v_wallet
  FROM public.organization_wallets
  WHERE organization_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.organization_wallets (
      id,
      organization_id,
      balance,
      welcome_credit,
      welcome_credit_granted,
      topup_bonus_credit,
      showcase_credit,
      currency
    ) VALUES (
      gen_random_uuid(),
      p_org_id,
      0.00,
      0.00,
      false,
      0.00,
      0.00,
      COALESCE(v_currency, 'MYR')
    )
    RETURNING * INTO v_wallet;
  END IF;

  -- Verify currency match
  IF v_wallet.currency IS NOT NULL AND v_currency IS NOT NULL AND UPPER(v_wallet.currency) <> UPPER(v_currency) THEN
    -- If wallet currency doesn't match configured reward settings currency, fail closed
    RETURN jsonb_build_object(
      'success', false,
      'code', 'CURRENCY_MISMATCH',
      'not_eligible', true,
      'already_granted', false,
      'error', 'Wallet currency does not match reward currency configuration.',
      'message', 'Wallet currency does not match reward currency configuration.'
    );
  END IF;

  -- 5. Lock User Record for Serialization
  PERFORM 1 FROM public.users WHERE id = p_user_id FOR UPDATE;

  -- 6. Check Lifetime Grant in public.user_rewards
  SELECT * INTO v_user_reward
  FROM public.user_rewards
  WHERE user_id = p_user_id
    AND reward_type = 'WELCOME_CREDIT'
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'ALREADY_GRANTED',
      'already_granted', true,
      'not_eligible', true,
      'claimed_at', v_user_reward.created_at,
      'claimed_org_id', v_user_reward.organization_id,
      'error', 'Welcome Credit has already been claimed for this user account (lifetime limit: 1).',
      'message', 'Welcome Credit has already been claimed for this user account (lifetime limit: 1).'
    );
  END IF;

  -- 7. Check if this specific organization already received Welcome Credit
  IF v_wallet.welcome_credit_granted = true THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'ALREADY_GRANTED_ORG',
      'already_granted', true,
      'not_eligible', true,
      'error', 'Welcome Credit has already been granted to this organization.',
      'message', 'Welcome Credit has already been granted to this organization.'
    );
  END IF;

  -- 8. Apply Welcome Credit atomically
  v_ref_id := COALESCE(p_reference_id, 'welcome_credit_' || p_user_id::text);

  INSERT INTO public.user_rewards (
    id,
    user_id,
    reward_type,
    amount,
    currency,
    organization_id,
    reference_id,
    metadata,
    created_at
  ) VALUES (
    gen_random_uuid(),
    p_user_id,
    'WELCOME_CREDIT',
    v_welcome_amount,
    COALESCE(v_wallet.currency, 'MYR'),
    p_org_id,
    v_ref_id,
    jsonb_build_object(
      'granted_by', COALESCE(p_reviewer_id::text, 'system'),
      'org_id', p_org_id::text,
      'settings_version', COALESCE(v_settings.version, 1)
    ) || p_metadata,
    v_now
  )
  RETURNING * INTO v_user_reward;

  -- Update Organization Wallet balance
  UPDATE public.organization_wallets
  SET
    welcome_credit = COALESCE(welcome_credit, 0.00) + v_welcome_amount,
    welcome_credit_granted = true,
    updated_at = v_now
  WHERE organization_id = p_org_id
  RETURNING * INTO v_wallet;

  -- Record in public.wallet_transactions
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
    p_org_id,
    NULL,
    'WELCOME_CREDIT',
    'WELCOME_CREDIT',
    v_welcome_amount,
    COALESCE(v_wallet.currency, 'MYR'),
    'COMPLETED',
    v_ref_id,
    'One-time Welcome Credit grant of ' || COALESCE(v_wallet.currency, 'MYR') || ' ' || v_welcome_amount::text,
    jsonb_build_object(
      'reward_type', 'WELCOME_CREDIT',
      'user_id', p_user_id::text,
      'user_reward_id', v_user_reward.id::text,
      'settings_version', COALESCE(v_settings.version, 1)
    ) || p_metadata,
    COALESCE(p_reviewer_id, p_user_id),
    v_now
  )
  RETURNING * INTO v_new_txn;

  RETURN jsonb_build_object(
    'success', true,
    'amount', v_welcome_amount,
    'currency', COALESCE(v_wallet.currency, 'MYR'),
    'user_reward', to_jsonb(v_user_reward),
    'transaction', to_jsonb(v_new_txn),
    'wallet', jsonb_build_object(
      'organization_id', p_org_id,
      'paid_balance', COALESCE(v_wallet.paid_balance, 0.00),
      'welcome_credit', COALESCE(v_wallet.welcome_credit, 0.00),
      'showcase_credit', COALESCE(v_wallet.showcase_credit, 0.00),
      'topup_credit', COALESCE(v_wallet.topup_credit, 0.00),
      'total_balance', (COALESCE(v_wallet.paid_balance, 0.00) + COALESCE(v_wallet.welcome_credit, 0.00) + COALESCE(v_wallet.showcase_credit, 0.00) + COALESCE(v_wallet.topup_credit, 0.00)),
      'currency', COALESCE(v_wallet.currency, 'MYR')
    ),
    'message', 'Successfully granted ' || COALESCE(v_wallet.currency, 'MYR') || ' ' || v_welcome_amount::text || ' Welcome Credit!'
  );
END;
$$;

-- 6. Refactor approve_first_event_showcase_reward_atomic to use centralized settings
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
  v_credit_amount NUMERIC(12, 2) := 300.00;
  v_credit_enabled BOOLEAN := true;
  v_settings public.wallet_reward_settings%ROWTYPE;
  v_country TEXT;
  v_currency TEXT;
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

  v_owner_id := v_org.owner_id;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Organization owner could not be resolved for showcase %', p_showcase_id;
  END IF;

  -- Serialize multi-showcase/multi-org reward grants per user via explicit user row lock
  PERFORM 1 FROM public.users WHERE id = v_owner_id FOR UPDATE;

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
        'topup_credit', COALESCE(v_wallet.topup_credit, 0.00),
        'outstanding_balance', COALESCE(v_wallet.outstanding_balance, 0.00),
        'currency', COALESCE(v_wallet.currency, 'MYR')
      ),
      'message', 'Showcase has already been rewarded.'
    );
  END IF;

  -- 5. Primary Check: User-level lifetime uniqueness in public.user_rewards
  SELECT * INTO v_user_reward
  FROM public.user_rewards
  WHERE user_id = v_owner_id
    AND reward_type IN ('SHOWCASE_CREDIT', 'SHOWCASE_REWARD', 'SHOWCASE_REWARD_RM300')
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'USER_REWARD_ALREADY_EXISTS: User % has already received their one-time showcase reward (user_reward ID %)',
      v_owner_id, v_user_reward.id;
  END IF;

  -- Secondary Check: owner_showcase_rewards table
  SELECT * INTO v_owner_reward
  FROM public.owner_showcase_rewards
  WHERE owner_user_id = v_owner_id
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'OWNER_REWARD_ALREADY_EXISTS: Owner % has already received their one-time showcase reward',
      v_owner_id;
  END IF;

  -- Tertiary Check: wallet_transactions table
  SELECT * INTO v_existing_credit
  FROM public.wallet_transactions
  WHERE owner_user_id = v_owner_id
    AND transaction_type = 'SHOWCASE_CREDIT'
    AND status = 'COMPLETED'
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'LIFETIME_REWARD_EXHAUSTED: Owner % has already received their lifetime showcase reward credit (Transaction %)',
      v_owner_id, v_existing_credit.id;
  END IF;

  -- 6. Resolve Country and Configured Showcase Reward Amount
  v_country := UPPER(COALESCE(v_org.country_code, 'MY'));

  SELECT * INTO v_settings
  FROM public.wallet_reward_settings
  WHERE country_code = v_country AND is_active = true;

  IF NOT FOUND THEN
    SELECT * INTO v_settings
    FROM public.wallet_reward_settings
    WHERE country_code = 'MY' AND is_active = true;
  END IF;

  IF FOUND THEN
    v_credit_amount := v_settings.showcase_credit_amount;
    v_credit_enabled := v_settings.showcase_credit_enabled;
    v_currency := v_settings.currency;
  ELSE
    v_credit_amount := 300.00;
    v_credit_enabled := true;
    v_currency := 'MYR';
  END IF;

  IF NOT v_credit_enabled THEN
    RAISE EXCEPTION 'SHOWCASE_CREDIT_DISABLED: Showcase rewards are currently disabled for this region';
  END IF;

  IF v_credit_amount <= 0 THEN
    RAISE EXCEPTION 'SHOWCASE_CREDIT_ZERO: Showcase reward amount is configured as zero';
  END IF;

  -- 7. Lock or create Organization Wallet
  SELECT * INTO v_wallet
  FROM public.organization_wallets
  WHERE organization_id = v_showcase.organization_id
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
      v_showcase.organization_id,
      0.00,
      0.00,
      0.00,
      0.00,
      0.00,
      COALESCE(v_currency, 'MYR')
    )
    RETURNING * INTO v_wallet;
  END IF;

  -- 8. Generate reference ID
  v_reference_id := COALESCE(p_reference_id, 'showcase_reward_' || v_showcase.id::text);

  -- 9. Insert into public.user_rewards
  INSERT INTO public.user_rewards (
    id,
    user_id,
    reward_type,
    amount,
    currency,
    organization_id,
    reference_id,
    metadata,
    created_at
  ) VALUES (
    gen_random_uuid(),
    v_owner_id,
    'SHOWCASE_CREDIT',
    v_credit_amount,
    COALESCE(v_wallet.currency, 'MYR'),
    v_showcase.organization_id,
    v_reference_id,
    jsonb_build_object(
      'showcase_id', v_showcase.id,
      'event_id', v_showcase.event_id,
      'reviewer_id', p_reviewer_id,
      'settings_version', COALESCE(v_settings.version, 1)
    ) || p_metadata,
    v_now
  )
  RETURNING * INTO v_user_reward;

  -- 10. Insert into public.owner_showcase_rewards
  INSERT INTO public.owner_showcase_rewards (
    id,
    owner_user_id,
    showcase_id,
    event_id,
    organization_id,
    amount,
    currency,
    status,
    reviewer_user_id,
    review_notes,
    awarded_at
  ) VALUES (
    gen_random_uuid(),
    v_owner_id,
    v_showcase.id,
    v_showcase.event_id,
    v_showcase.organization_id,
    v_credit_amount,
    COALESCE(v_wallet.currency, 'MYR'),
    'APPROVED',
    p_reviewer_id,
    'Showcase approved for owner reward credit',
    v_now
  )
  RETURNING * INTO v_owner_reward;

  -- 11. Credit Organization Wallet
  UPDATE public.organization_wallets
  SET
    showcase_credit = COALESCE(showcase_credit, 0.00) + v_credit_amount,
    updated_at = v_now
  WHERE organization_id = v_showcase.organization_id
  RETURNING * INTO v_wallet;

  -- 12. Insert Wallet Transaction
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
    owner_user_id,
    metadata,
    created_by,
    created_at
  ) VALUES (
    v_showcase.organization_id,
    v_showcase.event_id,
    'SHOWCASE_CREDIT',
    'SHOWCASE_CREDIT',
    v_credit_amount,
    COALESCE(v_wallet.currency, 'MYR'),
    'COMPLETED',
    v_reference_id,
    'One-time Event Showcase completion reward credit of ' || COALESCE(v_wallet.currency, 'MYR') || ' ' || v_credit_amount::text,
    v_owner_id,
    jsonb_build_object(
      'showcase_id', v_showcase.id,
      'event_id', v_showcase.event_id,
      'owner_user_id', v_owner_id,
      'reward_type', 'SHOWCASE_CREDIT',
      'settings_version', COALESCE(v_settings.version, 1)
    ) || p_metadata,
    COALESCE(p_reviewer_id, v_owner_id),
    v_now
  )
  RETURNING * INTO v_new_txn;

  -- 13. Update Event Showcase Record
  UPDATE public.event_showcases
  SET
    reward_status = 'REWARDED',
    reward_review_status = 'REWARDED',
    reward_amount = v_credit_amount,
    reward_transaction_id = v_new_txn.id,
    reward_awarded_at = v_now,
    reviewer_user_id = COALESCE(p_reviewer_id, reviewer_user_id),
    updated_at = v_now
  WHERE id = v_showcase.id
  RETURNING * INTO v_showcase;

  -- 14. Synchronize showcase_reward_submissions table if a submission exists
  UPDATE public.showcase_reward_submissions
  SET
    status = 'APPROVED',
    reward_amount = v_credit_amount,
    reviewed_at = v_now,
    reviewed_by = p_reviewer_id,
    updated_at = v_now
  WHERE showcase_id = v_showcase.id
    AND status = 'PENDING';

  RETURN jsonb_build_object(
    'success', true,
    'showcase', to_jsonb(v_showcase),
    'transaction', to_jsonb(v_new_txn),
    'user_reward', to_jsonb(v_user_reward),
    'owner_reward', to_jsonb(v_owner_reward),
    'wallet', jsonb_build_object(
      'organization_id', v_showcase.organization_id,
      'paid_balance', COALESCE(v_wallet.paid_balance, 0.00),
      'welcome_credit', COALESCE(v_wallet.welcome_credit, 0.00),
      'showcase_credit', COALESCE(v_wallet.showcase_credit, 0.00),
      'topup_credit', COALESCE(v_wallet.topup_credit, 0.00),
      'outstanding_balance', COALESCE(v_wallet.outstanding_balance, 0.00),
      'currency', COALESCE(v_wallet.currency, 'MYR')
    ),
    'message', 'Showcase successfully approved and rewarded.'
  );
END;
$$;

-- 7. Refactor process_topup_order_atomic to use bound order promo credit or dynamic tiers
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
SET search_path = public
AS $$
DECLARE
  v_order public.wallet_topup_orders%ROWTYPE;
  v_wallet public.organization_wallets%ROWTYPE;
  v_topup_txn public.wallet_transactions%ROWTYPE;
  v_promo_txn public.wallet_transactions%ROWTYPE;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
  v_promo_credit NUMERIC(12, 2) := 0.00;
  v_tier_rate TEXT := '0%';
  v_existing_topup public.wallet_transactions%ROWTYPE;
  v_existing_promo public.wallet_transactions%ROWTYPE;
  v_existing_topup_found BOOLEAN := false;
  v_existing_promo_found BOOLEAN := false;
  v_topup_txn_created BOOLEAN := false;
  v_promo_txn_created BOOLEAN := false;
  v_included_outstanding NUMERIC(12, 2) := 0.00;
  v_resolved_payment_ref TEXT;
  v_tier public.wallet_topup_tiers%ROWTYPE;
  v_settings public.wallet_reward_settings%ROWTYPE;
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
    -- Priority 1: Use bound expected_credit_amount on order record if explicitly saved and valid
    IF v_order.expected_credit_amount IS NOT NULL AND v_order.expected_credit_amount >= 0 THEN
      v_promo_credit := v_order.expected_credit_amount;
      v_tier_rate := COALESCE(v_order.bonus_percentage::text || '%', '0%');
    ELSE
      -- Priority 2: Dynamic lookup from public.wallet_topup_tiers for order currency
      SELECT * INTO v_tier
      FROM public.wallet_topup_tiers
      WHERE UPPER(currency) = UPPER(v_order.currency)
        AND is_active = true
        AND min_deposit <= v_order.top_up_amount
        AND (max_deposit IS NULL OR max_deposit >= v_order.top_up_amount)
      ORDER BY min_deposit DESC
      LIMIT 1;

      IF FOUND THEN
        IF v_tier.calculation_type = 'FIXED' THEN
          v_promo_credit := v_tier.bonus_fixed_amount;
          v_tier_rate := 'Fixed';
        ELSE
          v_promo_credit := ROUND(v_order.top_up_amount * v_tier.bonus_rate, 2);
          v_tier_rate := (v_tier.bonus_rate * 100)::text || '%';
        END IF;

        IF v_tier.max_bonus_amount IS NOT NULL AND v_promo_credit > v_tier.max_bonus_amount THEN
          v_promo_credit := v_tier.max_bonus_amount;
        END IF;
      ELSE
        -- Priority 3: Legacy hardcoded fallback for MYR
        IF UPPER(v_order.currency) = 'MYR' THEN
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
        ELSE
          v_promo_credit := 0.00;
          v_tier_rate := '0%';
        END IF;
      END IF;
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

    -- F. Insert Paid Balance Transaction
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

    -- G. Insert Promotional Credit Transaction if qualifying
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
        'Top-up Bonus Credit (' || v_tier_rate || ') for Order ' || UPPER(SUBSTRING(p_order_id::text, 1, 8)),
        jsonb_build_object(
          'topup_order_id', p_order_id,
          'qualifying_amount', v_order.top_up_amount,
          'tier_rate', v_tier_rate
        ) || COALESCE(p_metadata, '{}'::jsonb),
        COALESCE(p_processed_by, v_order.user_id),
        v_now
      )
      RETURNING * INTO v_promo_txn;
      v_promo_txn_created := true;
    END IF;

    -- H. Outstanding balance settlement
    v_included_outstanding := COALESCE(v_order.included_outstanding_amount, 0.00);

    UPDATE public.organization_wallets
    SET
      paid_balance = COALESCE(paid_balance, 0.00) + v_order.top_up_amount,
      topup_credit = COALESCE(topup_credit, 0.00) + v_promo_credit,
      outstanding_balance = GREATEST(0.00, COALESCE(outstanding_balance, 0.00) - v_included_outstanding),
      updated_at = v_now
    WHERE organization_id = p_organization_id
    RETURNING * INTO v_wallet;

    RETURN jsonb_build_object(
      'success', true,
      'order', to_jsonb(v_order),
      'topup_transaction', to_jsonb(v_topup_txn),
      'promo_credit_transaction', CASE WHEN v_promo_txn_created THEN to_jsonb(v_promo_txn) ELSE NULL END,
      'wallet', jsonb_build_object(
        'paid_balance', COALESCE(v_wallet.paid_balance, 0.00),
        'welcome_credit', COALESCE(v_wallet.welcome_credit, 0.00),
        'showcase_credit', COALESCE(v_wallet.showcase_credit, 0.00),
        'topup_credit', COALESCE(v_wallet.topup_credit, 0.00),
        'outstanding_balance', COALESCE(v_wallet.outstanding_balance, 0.00),
        'currency', COALESCE(v_wallet.currency, 'MYR')
      ),
      'message', 'Top-up order successfully marked as PAID and credited.'
    );
  END IF;

  -- 6. Process Cancellation or Failure
  UPDATE public.wallet_topup_orders
  SET
    status = p_status,
    failed_at = CASE WHEN p_status = 'FAILED' THEN v_now ELSE failed_at END,
    cancelled_at = CASE WHEN p_status = 'CANCELLED' THEN v_now ELSE cancelled_at END,
    notes = COALESCE(p_reason, notes),
    updated_at = v_now
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  SELECT * INTO v_wallet FROM public.organization_wallets WHERE organization_id = p_organization_id;

  RETURN jsonb_build_object(
    'success', true,
    'order', to_jsonb(v_order),
    'topup_transaction', NULL,
    'promo_credit_transaction', NULL,
    'wallet', jsonb_build_object(
      'paid_balance', COALESCE(v_wallet.paid_balance, 0.00),
      'welcome_credit', COALESCE(v_wallet.welcome_credit, 0.00),
      'showcase_credit', COALESCE(v_wallet.showcase_credit, 0.00),
      'topup_credit', COALESCE(v_wallet.topup_credit, 0.00),
      'outstanding_balance', COALESCE(v_wallet.outstanding_balance, 0.00),
      'currency', COALESCE(v_wallet.currency, 'MYR')
    ),
    'message', 'Top-up order marked as ' || p_status || '.'
  );
END;
$$;

-- Grant execute permissions to service_role and postgres
GRANT EXECUTE ON FUNCTION public.grant_welcome_credit_atomic(UUID, UUID, UUID, TEXT, JSONB) TO service_role, postgres;
GRANT EXECUTE ON FUNCTION public.approve_first_event_showcase_reward_atomic(UUID, UUID, TEXT, JSONB) TO service_role, postgres;
GRANT EXECUTE ON FUNCTION public.process_topup_order_atomic(UUID, UUID, TEXT, TEXT, TEXT, UUID, TEXT, JSONB) TO service_role, postgres;
