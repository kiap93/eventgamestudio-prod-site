-- ==============================================================================
-- Migration: 20260924000000_enforce_owner_organization_limit.sql
-- Description: Enforces maximum 5 organizations per user at both the trigger
--              and atomic RPC level.
--
-- Business Invariants:
--   1. An account owner cannot create or own more than 5 organizations
--      (MAX_ORGANIZATIONS_PER_OWNER = 5).
--   2. Direct database inserts are checked via BEFORE INSERT trigger
--      trg_enforce_owner_organization_limit.
--   3. create_organization_atomic checks the count and returns a structured
--      JSON response with code: 'ORGANIZATION_LIMIT_REACHED' if count >= 5.
--   4. Welcome Credit and Showcase Reward architecture remains intact.
-- ==============================================================================

-- 1. Trigger Function to Enforce Owner-Level Organization Limit
CREATE OR REPLACE FUNCTION public.check_owner_organization_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Count how many organizations are currently owned by this user
  SELECT count(*) INTO v_count
  FROM public.organizations
  WHERE owner_id = NEW.owner_id;

  IF v_count >= 5 THEN
    RAISE EXCEPTION 'Organization limit reached: You can own a maximum of 5 organizations.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_owner_organization_limit ON public.organizations;
CREATE TRIGGER trg_enforce_owner_organization_limit
  BEFORE INSERT ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.check_owner_organization_limit();

-- 2. Update create_organization_atomic RPC with explicit limit check
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
  v_existing_org_count INTEGER := 0;
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

  -- 2. Check Owner-Level Organization Limit (Maximum 5 organizations per user)
  SELECT count(*) INTO v_existing_org_count
  FROM public.organizations
  WHERE owner_id = p_owner_id;

  IF v_existing_org_count >= 5 THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'ORGANIZATION_LIMIT_REACHED',
      'error', 'Organization limit reached: You can own a maximum of 5 organizations.',
      'message', 'Organization limit reached: You can own a maximum of 5 organizations. Please manage or delete existing organizations before creating a new one.',
      'current_count', v_existing_org_count,
      'max_allowed', 5
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

  -- 3. Create Organization
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

  -- 4. Create Owner Membership (idempotent ON CONFLICT)
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

  -- 5. Initialize Organization Wallet (ensures wallet row exists)
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

  -- 6. Evaluate and Grant First-Organization Welcome Credit
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
    IF SQLSTATE = 'P0001' AND SQLERRM LIKE '%Organization limit reached%' THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'ORGANIZATION_LIMIT_REACHED',
        'error', SQLERRM,
        'message', 'Organization limit reached: You can own a maximum of 5 organizations.',
        'current_count', 5,
        'max_allowed', 5
      );
    END IF;
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
