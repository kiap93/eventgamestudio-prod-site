-- ==============================================================================
-- Migration: 20260914010000_disable_automatic_welcome_credit.sql
-- Description: Disable Automatic Welcome Credit upon Organization Creation:
--              1. Updates public.create_organization_atomic RPC to initialize wallets
--                 with RM0.00 balances and welcome_credit_granted = false.
--              2. Eliminates all automated inserts into public.user_rewards and
--                 public.wallet_transactions for WELCOME_CREDIT on org creation.
--              3. Preserves immutable historical transaction records in the ledger,
--                 while ensuring all new organizations start with zero welcome credit.
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

  -- 4. Create Initial Wallet with 0.00 balances (Automatic Welcome Credit is DISABLED)
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
  DO UPDATE SET
    updated_at = v_now
  RETURNING * INTO v_wallet;

  -- Note: Automatic Welcome Credit is completely removed. No user_rewards or wallet_transactions created here.

  RETURN jsonb_build_object(
    'success', true,
    'organization', row_to_json(v_org),
    'wallet', row_to_json(v_wallet),
    'welcome_credit_granted', false
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
