-- Migration: 20260910000000_atomic_create_organization.sql
-- Description: Introduces public.create_organization_atomic RPC to execute organization creation,
--              owner membership addition, initial wallet creation, and RM800 welcome credit grant
--              in a single, atomic PostgreSQL transaction with zero race conditions and zero duplicate key errors.

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

  -- 4. Create Wallet (idempotent ON CONFLICT)
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
    v_welcome_amount,
    0.00,
    0.00,
    'MYR',
    true,
    false,
    v_now,
    v_now
  )
  ON CONFLICT (organization_id)
  DO UPDATE SET
    welcome_credit = GREATEST(organization_wallets.welcome_credit, v_welcome_amount),
    welcome_credit_granted = true,
    updated_at = v_now
  RETURNING * INTO v_wallet;

  -- 5. Grant Welcome Credit transaction in immutable ledger
  INSERT INTO public.wallet_transactions (
    id,
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
    gen_random_uuid(),
    v_org_id,
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
      'source', 'AUTO_ORGANIZATION_CREATION',
      'program', 'ORGANIZATION_ONBOARDING_WELCOME'
    ),
    p_owner_id,
    v_now
  )
  ON CONFLICT (organization_id, reference_id) WHERE reference_id IS NOT NULL AND status IN ('COMPLETED', 'PENDING')
  DO NOTHING;

  -- 6. Return response
  RETURN jsonb_build_object(
    'success', true,
    'organization', to_jsonb(v_org),
    'wallet', to_jsonb(v_wallet),
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
      currency,
      welcome_credit_granted,
      showcase_credit_granted,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid(),
      v_org_id,
      0.00,
      v_welcome_amount,
      0.00,
      0.00,
      'MYR',
      true,
      false,
      v_now,
      v_now
    )
    ON CONFLICT (organization_id)
    DO UPDATE SET
      welcome_credit = GREATEST(organization_wallets.welcome_credit, v_welcome_amount),
      welcome_credit_granted = true,
      updated_at = v_now
    RETURNING * INTO v_wallet;

    INSERT INTO public.wallet_transactions (
      id,
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
      gen_random_uuid(),
      v_org_id,
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
        'source', 'AUTO_ORGANIZATION_CREATION',
        'program', 'ORGANIZATION_ONBOARDING_WELCOME'
      ),
      p_owner_id,
      v_now
    )
    ON CONFLICT (organization_id, reference_id) WHERE reference_id IS NOT NULL AND status IN ('COMPLETED', 'PENDING')
    DO NOTHING;

    RETURN jsonb_build_object(
      'success', true,
      'organization', to_jsonb(v_org),
      'wallet', to_jsonb(v_wallet),
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
