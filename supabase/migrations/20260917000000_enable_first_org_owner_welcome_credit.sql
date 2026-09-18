-- ==============================================================================
-- Migration: 20260917000000_enable_first_org_owner_welcome_credit.sql
-- Description: Enable Automatic Welcome Credit for First Organization Owner
--
-- Business Rules:
-- 1. A new user creating their FIRST organization as the OWNER automatically
--    receives RM800.00 Welcome Credit.
-- 2. Strictly preserves owner-only, user-level, one-time lifetime architecture:
--    - Eligibility belongs to the OWNER'S USER ACCOUNT, not to the organization.
--    - Reuses authoritative public.grant_welcome_credit_atomic() function.
--    - Enforced via public.user_rewards UNIQUE(user_id, reward_type).
-- 3. Subsequent organizations created by the same user receive RM0.00 Welcome Credit.
-- 4. Organization members are never eligible and receive RM0.00.
-- 5. Safe under concurrency: if a user creates two organizations simultaneously,
--    the unique constraint on public.user_rewards ensures exactly ONE receives RM800.00,
--    and the other receives RM0.00.
-- ==============================================================================

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
  -- Reuses the authoritative owner-only, user-level grant function: grant_welcome_credit_atomic.
  -- grant_welcome_credit_atomic authoritatively checks:
  --   a) organization exists and p_owner_id is the actual owner (v_org.owner_id = p_user_id)
  --   b) user has not claimed WELCOME_CREDIT in public.user_rewards or past completed transactions
  --   c) atomically inserts into public.user_rewards (ON CONFLICT DO NOTHING)
  --   d) inserts into public.wallet_transactions and credits organization_wallets
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

  IF (COALESCE((v_grant_res->>'success')::boolean, false) = true) AND
     (COALESCE((v_grant_res->>'already_granted')::boolean, true) = false) THEN
    v_welcome_granted := true;
    v_welcome_amount := 800.00;
  ELSE
    v_welcome_granted := false;
    v_welcome_amount := 0.00;
  END IF;

  -- Re-read latest wallet state
  SELECT * INTO v_wallet
  FROM public.organization_wallets
  WHERE organization_id = v_org_id;

  RETURN jsonb_build_object(
    'success', true,
    'organization', row_to_json(v_org),
    'wallet', row_to_json(v_wallet),
    'welcome_credit_granted', v_welcome_granted,
    'welcome_credit_amount', v_welcome_amount
  );

EXCEPTION
  WHEN unique_violation THEN
    IF SQLERRM LIKE '%organizations_slug%' OR SQLERRM LIKE '%slug%' THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'SLUG_TAKEN',
        'error', 'An organization with this URL slug already exists. Please choose another name or slug.',
        'message', 'An organization with this URL slug already exists'
      );
    ELSE
      RETURN jsonb_build_object(
        'success', false,
        'code', 'UNIQUE_VIOLATION',
        'error', SQLERRM,
        'message', 'A unique constraint was violated while creating the organization'
      );
    END IF;
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'INTERNAL_ERROR',
      'error', SQLERRM,
      'message', 'An unexpected error occurred while creating the organization'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_organization_atomic(TEXT, UUID, TEXT, TEXT, UUID, TEXT) TO service_role;
REVOKE EXECUTE ON FUNCTION public.create_organization_atomic(TEXT, UUID, TEXT, TEXT, UUID, TEXT) FROM authenticated, anon, public;
