-- ==============================================================================
-- Migration: 20261005020000_email_password_auth_and_verification.sql
-- Description: Adds email/password registration, email verification, and password reset
--              to public.users while preserving existing Google OAuth identities.
--
-- Security Rules:
-- 1. Unverified email accounts cannot receive Welcome Credit.
-- 2. Google OAuth accounts continue to be considered email-verified.
-- 3. Token hashes are stored instead of plaintext tokens.
-- 4. Passwords are never stored in plaintext.
-- ==============================================================================

-- 1. Add email/password and verification columns to public.users
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS password_hash TEXT,
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verification_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS verification_token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS password_reset_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS password_reset_expires_at TIMESTAMPTZ;

-- 2. Create indexes for high-performance token lookup
CREATE INDEX IF NOT EXISTS idx_users_verification_token_hash ON public.users (verification_token_hash) WHERE verification_token_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_password_reset_token_hash ON public.users (password_reset_token_hash) WHERE password_reset_token_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_email_verified ON public.users (email_verified);

-- 3. Existing Google users are automatically verified (Google verified their identity)
UPDATE public.users
SET
  email_verified = true,
  verified_at = COALESCE(verified_at, created_at)
WHERE google_id IS NOT NULL AND email_verified = false;

-- 4. Update grant_welcome_credit_atomic to strictly enforce email verification
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
  v_user_verified BOOLEAN := false;
  v_google_id TEXT;
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

  -- 2. Verify User Exists and is Email-Verified
  SELECT email_verified, google_id INTO v_user_verified, v_google_id
  FROM public.users
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'USER_NOT_FOUND',
      'error', 'User not found',
      'message', 'User not found'
    );
  END IF;

  -- MANDATORY EMAIL VERIFICATION CHECK:
  -- User must have verified email or authenticated via verified Google identity
  IF NOT (COALESCE(v_user_verified, false) = true OR v_google_id IS NOT NULL) THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'EMAIL_NOT_VERIFIED',
      'not_eligible', true,
      'already_granted', false,
      'error', 'Email address must be verified before claiming promotional Welcome Credit.',
      'message', 'Email address must be verified before claiming promotional Welcome Credit.'
    );
  END IF;

  -- 3. Verify Organization Exists & Check Authoritative Ownership
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

  -- 4. Check Lifetime Claim Record (user_rewards)
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

  -- 5. Lock Organization Wallet Row with FOR UPDATE
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

  -- Double check if wallet already shows welcome_credit_granted
  IF v_wallet.welcome_credit_granted = true OR v_wallet.welcome_credit >= v_welcome_amount THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_granted', true,
      'not_eligible', true,
      'wallet', row_to_json(v_wallet),
      'message', 'Welcome Credit has already been applied to this organization wallet.'
    );
  END IF;

  -- 6. Atomically Insert Lifetime Claim into public.user_rewards
  BEGIN
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
    RETURNING * INTO v_user_reward;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT * INTO v_wallet
      FROM public.organization_wallets
      WHERE organization_id = p_org_id;

      RETURN jsonb_build_object(
        'success', true,
        'already_granted', true,
        'not_eligible', true,
        'wallet', row_to_json(v_wallet),
        'message', 'Welcome Credit has already been granted to this user in their account lifetime (concurrent race detected).'
      );
  END;

  -- 7. Append Immutable Transaction to wallet_transactions
  v_ref_id := COALESCE(p_reference_id, 'welcome_' || p_org_id::text);

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
    'MYR',
    'COMPLETED',
    v_ref_id,
    'One-time Welcome Credit grant of RM' || to_char(v_welcome_amount, 'FM999,990.00'),
    jsonb_build_object(
      'organization_name', v_org.name,
      'source', COALESCE(p_metadata->>'source', 'MANUAL_GRANT'),
      'program', 'ORGANIZATION_ONBOARDING_WELCOME',
      'owner_user_id', p_user_id
    ) || p_metadata,
    COALESCE(p_reviewer_id, p_user_id),
    v_now,
    v_now
  )
  RETURNING * INTO v_new_txn;

  -- Link transaction_id back into user_rewards
  UPDATE public.user_rewards
  SET transaction_id = v_new_txn.id
  WHERE id = v_user_reward.id;

  -- 8. Credit the Organization Wallet
  UPDATE public.organization_wallets
  SET
    welcome_credit = v_welcome_amount,
    welcome_credit_granted = true,
    updated_at = v_now
  WHERE organization_id = p_org_id
  RETURNING * INTO v_wallet;

  -- 9. Return Successful Grant
  RETURN jsonb_build_object(
    'success', true,
    'already_granted', false,
    'not_eligible', false,
    'amount', v_welcome_amount,
    'transaction', row_to_json(v_new_txn),
    'wallet', row_to_json(v_wallet),
    'message', 'Successfully granted RM' || to_char(v_welcome_amount, 'FM999,990.00') || ' Welcome Credit!'
  );
END;
$$;

-- 5. Update create_organization_atomic to verify email verification before granting Welcome Credit
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
  v_base_slug TEXT;
  v_suffix TEXT;
  v_country VARCHAR(2);
  v_grant_res JSONB;
  v_welcome_granted BOOLEAN := false;
  v_welcome_amount NUMERIC(12, 2) := 0.00;
  v_owner_verified BOOLEAN := false;
  v_owner_google_id TEXT;
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

  -- Verify owner user exists and fetch verification status
  SELECT email_verified, google_id INTO v_owner_verified, v_owner_google_id
  FROM public.users
  WHERE id = p_owner_id;

  IF NOT FOUND THEN
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

  -- 4. Initialize Organization Wallet (ensures wallet row exists)
  INSERT INTO public.organization_wallets (
    id,
    organization_id,
    paid_balance,
    welcome_credit,
    showcase_credit,
    topup_credit,
    outstanding_balance,
    currency,
    welcome_credit_granted,
    showcase_credit_granted,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    v_org_id,
    0.00,
    0.00,
    0.00,
    0.00,
    0.00,
    'MYR',
    false,
    false,
    v_now,
    v_now
  )
  ON CONFLICT (organization_id)
  DO UPDATE SET updated_at = v_now
  RETURNING * INTO v_wallet;

  -- 5. Evaluate and Grant First-Organization Welcome Credit
  -- Only grant Welcome Credit if owner email is verified (or authenticated via Google)
  IF (COALESCE(v_owner_verified, false) = true OR v_owner_google_id IS NOT NULL) THEN
    v_grant_res := public.grant_welcome_credit_atomic(
      v_org_id,
      p_owner_id,
      p_owner_id,
      'welcome_' || v_org_id::text,
      jsonb_build_object(
        'source', 'AUTO_ORGANIZATION_CREATION',
        'organization_name', trim(p_name),
        'owner_user_id', p_owner_id,
        'program', 'ORGANIZATION_ONBOARDING_WELCOME'
      )
    );

    IF v_grant_res IS NOT NULL AND (v_grant_res->>'success')::boolean = true AND (v_grant_res->>'already_granted')::boolean = false THEN
      v_welcome_granted := true;
      v_welcome_amount := COALESCE((v_grant_res->>'amount')::numeric, 800.00);
      SELECT * INTO v_wallet FROM public.organization_wallets WHERE organization_id = v_org_id;
    END IF;
  END IF;

  -- 6. Return response
  RETURN jsonb_build_object(
    'success', true,
    'organization', to_jsonb(v_org),
    'wallet', to_jsonb(v_wallet),
    'welcome_credit_granted', v_welcome_granted,
    'welcome_credit_amount', v_welcome_amount,
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

    INSERT INTO public.organization_wallets (
      id,
      organization_id,
      paid_balance,
      welcome_credit,
      showcase_credit,
      topup_credit,
      outstanding_balance,
      currency,
      welcome_credit_granted,
      showcase_credit_granted,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid(),
      v_org_id,
      0.00,
      0.00,
      0.00,
      0.00,
      0.00,
      'MYR',
      false,
      false,
      v_now,
      v_now
    )
    ON CONFLICT (organization_id)
    DO UPDATE SET updated_at = v_now
    RETURNING * INTO v_wallet;

    IF (COALESCE(v_owner_verified, false) = true OR v_owner_google_id IS NOT NULL) THEN
      v_grant_res := public.grant_welcome_credit_atomic(
        v_org_id,
        p_owner_id,
        p_owner_id,
        'welcome_' || v_org_id::text,
        jsonb_build_object(
          'source', 'AUTO_ORGANIZATION_CREATION',
          'organization_name', trim(p_name),
          'owner_user_id', p_owner_id,
          'program', 'ORGANIZATION_ONBOARDING_WELCOME'
        )
      );

      IF v_grant_res IS NOT NULL AND (v_grant_res->>'success')::boolean = true AND (v_grant_res->>'already_granted')::boolean = false THEN
        v_welcome_granted := true;
        v_welcome_amount := COALESCE((v_grant_res->>'amount')::numeric, 800.00);
        SELECT * INTO v_wallet FROM public.organization_wallets WHERE organization_id = v_org_id;
      END IF;
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'organization', to_jsonb(v_org),
      'wallet', to_jsonb(v_wallet),
      'welcome_credit_granted', v_welcome_granted,
      'welcome_credit_amount', v_welcome_amount,
      'message', 'Organization created successfully'
    );
END;
$$;
