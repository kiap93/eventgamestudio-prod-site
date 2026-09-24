-- Migration: 20260923000000_fail_closed_event_pricing.sql
-- Description: Enforce fail-closed event pricing in process_event_payment_atomic RPC.
-- Removes the default 1400.00 fallback and raises PRICING_CONFIGURATION_ERROR if
-- stored event_price or event_currency is missing/invalid.

CREATE OR REPLACE FUNCTION public.process_event_payment_atomic(
  p_organization_id UUID,
  p_event_id UUID,
  p_payment_mode TEXT,
  p_event_price NUMERIC DEFAULT NULL,
  p_topup_credit_requested NUMERIC DEFAULT 0.00,
  p_reference_id TEXT DEFAULT NULL,
  p_created_by UUID DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_wallet public.organization_wallets%ROWTYPE;
  v_event public.events%ROWTYPE;
  v_event_price NUMERIC;
  v_credit_to_use NUMERIC := 0.00;
  v_welcome_to_use NUMERIC := 0.00;
  v_showcase_to_use NUMERIC := 0.00;
  v_topup_to_use NUMERIC := 0.00;
  v_paid_to_use NUMERIC := 0.00;
  v_credit_balance_type TEXT := NULL;
  v_credit_txn public.wallet_transactions%ROWTYPE;
  v_topup_credit_txn public.wallet_transactions%ROWTYPE;
  v_paid_txn public.wallet_transactions%ROWTYPE;
  v_credit_ref TEXT;
  v_topup_ref TEXT;
  v_paid_ref TEXT;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
  v_existing_payment public.wallet_transactions%ROWTYPE;
  v_existing_credit public.wallet_transactions%ROWTYPE;
  v_existing_payment_found BOOLEAN := false;
  v_existing_credit_found BOOLEAN := false;
  v_credit_txn_created BOOLEAN := false;
  v_topup_credit_txn_created BOOLEAN := false;
  v_paid_txn_created BOOLEAN := false;
  v_max_cap NUMERIC;
  v_req NUMERIC;
BEGIN
  -- 1. Input validations
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'Organization ID is required';
  END IF;

  IF p_event_id IS NULL THEN
    RAISE EXCEPTION 'Event ID is required';
  END IF;

  IF p_payment_mode NOT IN ('FULL_PAID', 'WELCOME_CREDIT', 'SHOWCASE_CREDIT', 'TOPUP_CREDIT', 'COMBINED_CREDIT') THEN
    RAISE EXCEPTION 'Invalid payment mode: %', p_payment_mode;
  END IF;

  -- 2. Lock & Validate Event Record (if exists in events table)
  SELECT * INTO v_event
  FROM public.events
  WHERE id = p_event_id
  FOR UPDATE;

  IF v_event.id IS NOT NULL THEN
    IF v_event.organization_id <> p_organization_id THEN
      RAISE EXCEPTION 'Security Error: Event does not belong to your organization';
    END IF;
    IF v_event.payment_status = 'PAID' THEN
      RAISE EXCEPTION 'Event is already marked as PAID';
    END IF;
    -- Server-Authoritative: Event's own stored price and currency must be valid. Fail closed if missing or invalid.
    IF v_event.event_price IS NULL OR v_event.event_price <= 0 THEN
      RAISE EXCEPTION 'PRICING_CONFIGURATION_ERROR: Event is missing a valid authoritative price.';
    END IF;
    IF v_event.event_currency IS NULL OR trim(v_event.event_currency) = '' THEN
      RAISE EXCEPTION 'PRICING_CONFIGURATION_ERROR: Event is missing a valid authoritative currency.';
    END IF;
    v_event_price := v_event.event_price;
  ELSE
    IF p_event_price IS NULL OR p_event_price <= 0 THEN
      RAISE EXCEPTION 'PRICING_CONFIGURATION_ERROR: Valid event price is required.';
    END IF;
    v_event_price := p_event_price;
  END IF;

  IF v_event_price <= 0 THEN
    RAISE EXCEPTION 'Event price must be greater than 0';
  END IF;

  -- 3. Idempotency Protection: Check if event is already paid in transaction ledger
  SELECT * INTO v_existing_payment
  FROM public.wallet_transactions
  WHERE organization_id = p_organization_id
    AND event_id = p_event_id
    AND transaction_type = 'EVENT_PAYMENT'
    AND balance_type = 'PAID_BALANCE'
    AND status = 'COMPLETED'
  LIMIT 1;
  v_existing_payment_found := FOUND;

  SELECT * INTO v_existing_credit
  FROM public.wallet_transactions
  WHERE organization_id = p_organization_id
    AND event_id = p_event_id
    AND transaction_type = 'CREDIT_USAGE'
    AND status = 'COMPLETED'
  LIMIT 1;
  v_existing_credit_found := FOUND;

  IF v_existing_payment_found OR v_existing_credit_found THEN
    SELECT * INTO v_wallet FROM public.organization_wallets WHERE organization_id = p_organization_id;

    RETURN jsonb_build_object(
      'success', true,
      'is_idempotent_replay', true,
      'event_id', p_event_id,
      'payment_mode', p_payment_mode,
      'event_price', v_event_price,
      'paid_amount', CASE WHEN v_existing_payment_found THEN COALESCE(ABS(v_existing_payment.amount), 0.00) ELSE 0.00 END,
      'discount_amount', CASE WHEN v_existing_credit_found THEN COALESCE(ABS(v_existing_credit.amount), 0.00) ELSE 0.00 END,
      'credit_transaction', CASE WHEN v_existing_credit_found THEN to_jsonb(v_existing_credit) ELSE NULL END,
      'paid_transaction', CASE WHEN v_existing_payment_found THEN to_jsonb(v_existing_payment) ELSE NULL END,
      'wallet', jsonb_build_object(
        'paid_balance', COALESCE(v_wallet.paid_balance, 0.00),
        'welcome_credit', COALESCE(v_wallet.welcome_credit, 0.00),
        'showcase_credit', COALESCE(v_wallet.showcase_credit, 0.00),
        'topup_credit', COALESCE(v_wallet.topup_credit, 0.00)
      )
    );
  END IF;

  -- 4. Lock & Validate Organization Wallet
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
      topup_credit
    ) VALUES (
      p_organization_id,
      0.00,
      0.00,
      0.00,
      0.00
    )
    RETURNING * INTO v_wallet;
  END IF;

  -- 5. Calculate Deductions by Payment Mode
  IF p_payment_mode = 'FULL_PAID' THEN
    v_paid_to_use := v_event_price;
    v_credit_to_use := 0.00;

  ELSIF p_payment_mode = 'WELCOME_CREDIT' THEN
    v_credit_balance_type := 'WELCOME_CREDIT';
    IF COALESCE(v_wallet.welcome_credit, 0.00) >= v_event_price THEN
      v_welcome_to_use := v_event_price;
      v_paid_to_use := 0.00;
    ELSE
      v_welcome_to_use := COALESCE(v_wallet.welcome_credit, 0.00);
      v_paid_to_use := v_event_price - v_welcome_to_use;
    END IF;
    v_credit_to_use := v_welcome_to_use;

  ELSIF p_payment_mode = 'SHOWCASE_CREDIT' THEN
    v_credit_balance_type := 'SHOWCASE_CREDIT';
    IF COALESCE(v_wallet.showcase_credit, 0.00) >= v_event_price THEN
      v_showcase_to_use := v_event_price;
      v_paid_to_use := 0.00;
    ELSE
      v_showcase_to_use := COALESCE(v_wallet.showcase_credit, 0.00);
      v_paid_to_use := v_event_price - v_showcase_to_use;
    END IF;
    v_credit_to_use := v_showcase_to_use;

  ELSIF p_payment_mode = 'TOPUP_CREDIT' THEN
    v_credit_balance_type := 'TOPUP_CREDIT';
    -- 20% cap rule: Max 20% of Event Price can be discounted by top-up credit
    v_max_cap := ROUND(v_event_price * 0.20, 2);
    v_req := COALESCE(p_topup_credit_requested, 0.00);
    IF v_req <= 0.00 THEN
      v_topup_to_use := LEAST(COALESCE(v_wallet.topup_credit, 0.00), v_max_cap);
    ELSE
      v_topup_to_use := LEAST(v_req, COALESCE(v_wallet.topup_credit, 0.00), v_max_cap);
    END IF;
    v_paid_to_use := v_event_price - v_topup_to_use;
    v_credit_to_use := v_topup_to_use;

  ELSIF p_payment_mode = 'COMBINED_CREDIT' THEN
    -- Welcome credit applied first up to full price
    IF COALESCE(v_wallet.welcome_credit, 0.00) >= v_event_price THEN
      v_welcome_to_use := v_event_price;
      v_paid_to_use := 0.00;
      v_topup_to_use := 0.00;
    ELSE
      v_welcome_to_use := COALESCE(v_wallet.welcome_credit, 0.00);
      v_paid_to_use := v_event_price - v_welcome_to_use;

      -- If remaining unpaid amount exists, apply topup credit up to 20% of event price
      IF v_paid_to_use > 0.00 THEN
        v_max_cap := ROUND(v_event_price * 0.20, 2);
        v_req := COALESCE(p_topup_credit_requested, 0.00);
        IF v_req <= 0.00 THEN
          v_topup_to_use := LEAST(COALESCE(v_wallet.topup_credit, 0.00), v_max_cap, v_paid_to_use);
        ELSE
          v_topup_to_use := LEAST(v_req, COALESCE(v_wallet.topup_credit, 0.00), v_max_cap, v_paid_to_use);
        END IF;
        v_paid_to_use := v_paid_to_use - v_topup_to_use;
      ELSE
        v_topup_to_use := 0.00;
      END IF;
    END IF;
    v_credit_to_use := v_welcome_to_use + v_topup_to_use;
  END IF;

  -- 6. Verify Wallet Balances (Atomic check)
  IF v_welcome_to_use > 0.00 AND COALESCE(v_wallet.welcome_credit, 0.00) < v_welcome_to_use THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE: Insufficient welcome credit (available: %, required: %)',
      v_wallet.welcome_credit, v_welcome_to_use;
  END IF;

  IF v_showcase_to_use > 0.00 AND COALESCE(v_wallet.showcase_credit, 0.00) < v_showcase_to_use THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE: Insufficient showcase credit (available: %, required: %)',
      v_wallet.showcase_credit, v_showcase_to_use;
  END IF;

  IF v_topup_to_use > 0.00 AND COALESCE(v_wallet.topup_credit, 0.00) < v_topup_to_use THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE: Insufficient top-up credit (available: %, required: %)',
      v_wallet.topup_credit, v_topup_to_use;
  END IF;

  IF v_paid_to_use > 0.00 AND COALESCE(v_wallet.paid_balance, 0.00) < v_paid_to_use THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE: Insufficient paid balance (available: %, required: %)',
      v_wallet.paid_balance, v_paid_to_use;
  END IF;

  -- 7. Deduct from Organization Wallet
  UPDATE public.organization_wallets
  SET
    welcome_credit = welcome_credit - v_welcome_to_use,
    showcase_credit = showcase_credit - v_showcase_to_use,
    topup_credit = topup_credit - v_topup_to_use,
    paid_balance = paid_balance - v_paid_to_use,
    updated_at = v_now
  WHERE organization_id = p_organization_id
  RETURNING * INTO v_wallet;

  -- 8. Generate Traceable References
  v_credit_ref := 'TXN-CRED-' || UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', '') FROM 1 FOR 12));
  v_topup_ref := 'TXN-TOPC-' || UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', '') FROM 1 FOR 12));
  v_paid_ref := 'TXN-PAID-' || UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', '') FROM 1 FOR 12));

  -- 9. Insert Immutable Transaction Records
  -- 9a. Welcome Credit or Showcase Credit Transaction
  IF v_welcome_to_use > 0.00 THEN
    INSERT INTO public.wallet_transactions (
      organization_id,
      event_id,
      amount,
      transaction_type,
      balance_type,
      status,
      description,
      reference_id,
      created_by,
      created_at,
      metadata
    ) VALUES (
      p_organization_id,
      p_event_id,
      -v_welcome_to_use,
      'CREDIT_USAGE',
      'WELCOME_CREDIT',
      'COMPLETED',
      COALESCE(p_description, 'Welcome credit applied to event activation'),
      v_credit_ref,
      p_created_by,
      v_now,
      jsonb_build_object(
        'payment_mode', p_payment_mode,
        'event_price', v_event_price,
        'original_reference', p_reference_id
      ) || p_metadata
    )
    RETURNING * INTO v_credit_txn;
    v_credit_txn_created := true;
  ELSIF v_showcase_to_use > 0.00 THEN
    INSERT INTO public.wallet_transactions (
      organization_id,
      event_id,
      amount,
      transaction_type,
      balance_type,
      status,
      description,
      reference_id,
      created_by,
      created_at,
      metadata
    ) VALUES (
      p_organization_id,
      p_event_id,
      -v_showcase_to_use,
      'CREDIT_USAGE',
      'SHOWCASE_CREDIT',
      'COMPLETED',
      COALESCE(p_description, 'Showcase reward credit applied to event activation'),
      v_credit_ref,
      p_created_by,
      v_now,
      jsonb_build_object(
        'payment_mode', p_payment_mode,
        'event_price', v_event_price,
        'original_reference', p_reference_id
      ) || p_metadata
    )
    RETURNING * INTO v_credit_txn;
    v_credit_txn_created := true;
  END IF;

  -- 9b. Topup Credit Transaction (e.g. In TOPUP_CREDIT or COMBINED_CREDIT)
  IF v_topup_to_use > 0.00 THEN
    INSERT INTO public.wallet_transactions (
      organization_id,
      event_id,
      amount,
      transaction_type,
      balance_type,
      status,
      description,
      reference_id,
      created_by,
      created_at,
      metadata
    ) VALUES (
      p_organization_id,
      p_event_id,
      -v_topup_to_use,
      'CREDIT_USAGE',
      'TOPUP_CREDIT',
      'COMPLETED',
      COALESCE(p_description, 'Top-up reward credit applied to event activation (20% cap)'),
      v_topup_ref,
      p_created_by,
      v_now,
      jsonb_build_object(
        'payment_mode', p_payment_mode,
        'event_price', v_event_price,
        'original_reference', p_reference_id
      ) || p_metadata
    )
    RETURNING * INTO v_topup_credit_txn;
    v_topup_credit_txn_created := true;
  END IF;

  -- 9c. Paid Balance Transaction
  IF v_paid_to_use > 0.00 THEN
    INSERT INTO public.wallet_transactions (
      organization_id,
      event_id,
      amount,
      transaction_type,
      balance_type,
      status,
      description,
      reference_id,
      created_by,
      created_at,
      metadata
    ) VALUES (
      p_organization_id,
      p_event_id,
      -v_paid_to_use,
      'EVENT_PAYMENT',
      'PAID_BALANCE',
      'COMPLETED',
      COALESCE(p_description, 'Event activation payment deducted from cash balance'),
      v_paid_ref,
      p_created_by,
      v_now,
      jsonb_build_object(
        'payment_mode', p_payment_mode,
        'event_price', v_event_price,
        'original_reference', p_reference_id
      ) || p_metadata
    )
    RETURNING * INTO v_paid_txn;
    v_paid_txn_created := true;
  END IF;

  -- 10. Update Event Status & Link Payment References (if exists in events table)
  IF v_event.id IS NOT NULL THEN
    UPDATE public.events
    SET
      status = 'UPCOMING',
      payment_status = 'PAID',
      event_price = v_event_price,
      updated_at = v_now
    WHERE id = p_event_id;
  END IF;

  -- 11. Return Detailed Result Payload
  RETURN jsonb_build_object(
    'success', true,
    'event_id', p_event_id,
    'payment_mode', p_payment_mode,
    'event_price', v_event_price,
    'paid_amount', v_paid_to_use,
    'discount_amount', v_credit_to_use,
    'welcome_credit_used', v_welcome_to_use,
    'showcase_credit_used', v_showcase_to_use,
    'topup_credit_used', v_topup_to_use,
    'credit_transaction', CASE WHEN v_credit_txn_created THEN to_jsonb(v_credit_txn) ELSE NULL END,
    'topup_credit_transaction', CASE WHEN v_topup_credit_txn_created THEN to_jsonb(v_topup_credit_txn) ELSE NULL END,
    'paid_transaction', CASE WHEN v_paid_txn_created THEN to_jsonb(v_paid_txn) ELSE NULL END,
    'wallet', jsonb_build_object(
      'paid_balance', v_wallet.paid_balance,
      'welcome_credit', v_wallet.welcome_credit,
      'showcase_credit', v_wallet.showcase_credit,
      'topup_credit', v_wallet.topup_credit
    )
  );
END;
$$;

-- Secure grants for process_event_payment_atomic
REVOKE ALL ON FUNCTION public.process_event_payment_atomic(
  UUID, UUID, TEXT, NUMERIC, NUMERIC, TEXT, UUID, TEXT, JSONB
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_event_payment_atomic(
  UUID, UUID, TEXT, NUMERIC, NUMERIC, TEXT, UUID, TEXT, JSONB
) FROM anon;
REVOKE ALL ON FUNCTION public.process_event_payment_atomic(
  UUID, UUID, TEXT, NUMERIC, NUMERIC, TEXT, UUID, TEXT, JSONB
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.process_event_payment_atomic(
  UUID, UUID, TEXT, NUMERIC, NUMERIC, TEXT, UUID, TEXT, JSONB
) TO service_role;
GRANT EXECUTE ON FUNCTION public.process_event_payment_atomic(
  UUID, UUID, TEXT, NUMERIC, NUMERIC, TEXT, UUID, TEXT, JSONB
) TO postgres;

-- ------------------------------------------------------------------------------
-- Hardened create_event_atomic RPC with fail-closed game-level pricing
-- Eliminates legacy RM1,400 fallback and requires/validates pricing against game_pricing
-- ------------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.create_event_atomic(
  UUID, UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, UUID, UUID, INT, BOOLEAN, TEXT
);
DROP FUNCTION IF EXISTS public.create_event_atomic(
  UUID, UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, UUID, UUID, INT, BOOLEAN, TEXT, UUID, INT
);

CREATE OR REPLACE FUNCTION public.create_event_atomic(
  p_organization_id UUID,
  p_game_theme_id UUID,
  p_name TEXT,
  p_start_date TEXT,
  p_end_date TEXT,
  p_starts_at TIMESTAMPTZ,
  p_expires_at TIMESTAMPTZ,
  p_game_id UUID DEFAULT NULL,
  p_event_date TEXT DEFAULT NULL,
  p_status TEXT DEFAULT 'draft',
  p_event_status TEXT DEFAULT 'DRAFT',
  p_payment_status TEXT DEFAULT 'UNPAID',
  p_cancel_reason TEXT DEFAULT NULL,
  p_event_price NUMERIC DEFAULT NULL,
  p_event_currency TEXT DEFAULT NULL,
  p_paid_amount NUMERIC DEFAULT 0.00,
  p_discount_amount NUMERIC DEFAULT 0.00,
  p_payment_mode TEXT DEFAULT NULL,
  p_public_token TEXT DEFAULT NULL,
  p_created_by UUID DEFAULT NULL,
  p_event_id UUID DEFAULT NULL,
  p_max_pending_events INT DEFAULT 2,
  p_skip_pending_limit_check BOOLEAN DEFAULT FALSE,
  p_event_timezone TEXT DEFAULT NULL,
  p_pricing_id UUID DEFAULT NULL,
  p_duration_days INT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_org RECORD;
  v_theme RECORD;
  v_game RECORD;
  v_target_game_id UUID;
  v_pending_count INT;
  v_max_limit INT := COALESCE(p_max_pending_events, 2);
  v_is_pending BOOLEAN;
  v_event_id UUID;
  v_token TEXT;
  v_token_attempts INT := 0;
  v_event RECORD;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
  v_event_timezone TEXT;
  v_pricing_id UUID := p_pricing_id;
  v_duration_days INT := p_duration_days;
  v_resolved_price NUMERIC(10,2) := p_event_price;
  v_resolved_currency TEXT := NULLIF(TRIM(p_event_currency), '');
  v_pricing_record RECORD;
BEGIN
  -- 1. Lock organization row FOR UPDATE
  SELECT * INTO v_org
  FROM public.organizations
  WHERE id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'ORGANIZATION_NOT_FOUND',
      'error', 'Organization not found',
      'message', 'Organization not found'
    );
  END IF;

  -- Authoritative event timezone resolution
  v_event_timezone := TRIM(COALESCE(p_event_timezone, ''));
  IF v_event_timezone = '' THEN
    IF UPPER(COALESCE(v_org.country_code, 'MY')) = 'SG' THEN
      v_event_timezone := 'Asia/Singapore';
    ELSE
      v_event_timezone := 'Asia/Kuala_Lumpur';
    END IF;
  END IF;

  -- 2. Input parameter validations
  IF p_name IS NULL OR TRIM(p_name) = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'VALIDATION_ERROR',
      'error', 'Event name is required',
      'message', 'Event name is required'
    );
  END IF;

  IF p_start_date IS NULL OR TRIM(p_start_date) = '' OR p_end_date IS NULL OR TRIM(p_end_date) = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'VALIDATION_ERROR',
      'error', 'Start date and End date are required',
      'message', 'Start date and End date are required'
    );
  END IF;

  IF p_end_date < p_start_date THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'INVALID_DATE_RANGE',
      'error', 'The event end date cannot be earlier than the start date. Please select a valid date range.',
      'message', 'The event end date cannot be earlier than the start date. Please select a valid date range.'
    );
  END IF;

  -- 3. Validate Theme Ownership, Existence and Active Status
  SELECT * INTO v_theme
  FROM public.game_themes
  WHERE id = p_game_theme_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'THEME_NOT_FOUND',
      'error', 'The selected theme was not found.',
      'message', 'The selected theme was not found.'
    );
  END IF;

  IF v_theme.is_system = TRUE OR v_theme.ownership_type = 'system' OR v_theme.organization_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'SYSTEM_THEME_NOT_ALLOWED',
      'error', 'Only organization themes can be used for events. System template themes cannot be directly attached to an event.',
      'message', 'Only organization themes can be used for events. System template themes cannot be directly attached to an event.'
    );
  END IF;

  IF v_theme.organization_id <> p_organization_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'THEME_FORBIDDEN',
      'error', 'The selected theme belongs to another organization.',
      'message', 'The selected theme belongs to another organization.'
    );
  END IF;

  IF v_theme.status IS NOT NULL AND v_theme.status <> 'active' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'THEME_INACTIVE',
      'error', 'The selected theme is not active.',
      'message', 'The selected theme is not active.'
    );
  END IF;

  -- 4. Validate Target Game & Theme Game Mismatch
  v_target_game_id := COALESCE(p_game_id, v_theme.game_id);
  IF v_target_game_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'GAME_NOT_SPECIFIED',
      'error', 'No valid Game specified for this event.',
      'message', 'No valid Game specified for this event.'
    );
  END IF;

  IF p_game_id IS NOT NULL AND v_theme.game_id IS NOT NULL AND p_game_id <> v_theme.game_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'THEME_GAME_MISMATCH',
      'error', 'Selected theme does not belong to the chosen game.',
      'message', 'Selected theme does not belong to the chosen game.'
    );
  END IF;

  SELECT * INTO v_game
  FROM public.games
  WHERE id = v_target_game_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'GAME_NOT_FOUND',
      'error', 'The selected game was not found.',
      'message', 'The selected game was not found.'
    );
  END IF;

  IF v_game.status IS NULL OR v_game.status <> 'active' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'GAME_NOT_ACTIVE',
      'error', 'This game is currently not active and cannot be selected for new events.',
      'message', 'This game is currently not active and cannot be selected for new events.'
    );
  END IF;

  -- 5. Calculate duration_days if not provided
  IF v_duration_days IS NULL OR v_duration_days <= 0 THEN
    BEGIN
      v_duration_days := GREATEST(1, (p_end_date::date - p_start_date::date) + 1);
    EXCEPTION WHEN OTHERS THEN
      v_duration_days := 1;
    END;
  END IF;

  -- Authoritative Pricing Tier Validation & Resolution
  IF v_pricing_id IS NOT NULL THEN
    -- Look up the specified pricing tier directly
    SELECT id, game_id, price, currency, is_active, min_days, max_days
    INTO v_pricing_record
    FROM public.game_pricing
    WHERE id = v_pricing_id;

    IF v_pricing_record.id IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'PRICING_TIER_NOT_FOUND',
        'error', 'The specified pricing tier does not exist.',
        'message', 'The specified pricing tier does not exist.'
      );
    END IF;

    -- Integrity Check 1: pricing.game_id = target_game_id (Reject cross-game pricing leakage)
    IF v_pricing_record.game_id <> v_target_game_id THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'PRICING_GAME_MISMATCH',
        'error', 'The specified pricing tier does not belong to the selected game.',
        'message', 'The specified pricing tier does not belong to the selected game.'
      );
    END IF;

    -- Integrity Check 2: pricing is active
    IF NOT COALESCE(v_pricing_record.is_active, false) THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'PRICING_TIER_INACTIVE',
        'error', 'The specified pricing tier is inactive and cannot be used.',
        'message', 'The specified pricing tier is inactive and cannot be used.'
      );
    END IF;

    -- Integrity Check 3: pricing covers duration_days
    IF v_duration_days < v_pricing_record.min_days OR (v_pricing_record.max_days IS NOT NULL AND v_duration_days > v_pricing_record.max_days) THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'PRICING_DURATION_MISMATCH',
        'error', 'The specified pricing tier does not cover this duration (' || v_duration_days || ' days).',
        'message', 'The specified pricing tier does not cover this duration (' || v_duration_days || ' days).'
      );
    END IF;

    -- Authoritative price and currency strictly derived from the verified tier
    v_resolved_price := v_pricing_record.price;
    v_resolved_currency := v_pricing_record.currency;
  ELSE
    -- Auto-resolve matching active pricing tier for the target game and duration
    SELECT id, game_id, price, currency, is_active, min_days, max_days
    INTO v_pricing_record
    FROM public.game_pricing
    WHERE game_id = v_target_game_id
      AND is_active = true
      AND min_days <= v_duration_days
      AND (max_days IS NULL OR max_days >= v_duration_days)
    ORDER BY min_days ASC
    LIMIT 1;

    IF v_pricing_record.id IS NOT NULL THEN
      v_pricing_id := v_pricing_record.id;
      v_resolved_price := v_pricing_record.price;
      v_resolved_currency := v_pricing_record.currency;
    ELSIF v_resolved_price IS NULL OR v_resolved_price <= 0 THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'NO_PRICING_TIER',
        'error', 'No pricing tier is configured for a ' || v_duration_days || '-day event for this game. Pricing cannot be resolved.',
        'message', 'No pricing tier is configured for a ' || v_duration_days || '-day event for this game. Pricing cannot be resolved.'
      );
    END IF;
  END IF;

  IF v_resolved_price IS NULL OR v_resolved_price <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'PRICING_CONFIGURATION_ERROR',
      'error', 'Event price must be positive and valid. Could not resolve pricing.',
      'message', 'Event price must be positive and valid. Could not resolve pricing.'
    );
  END IF;

  IF v_resolved_currency IS NULL OR TRIM(v_resolved_currency) = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'PRICING_CONFIGURATION_ERROR',
      'error', 'Event currency must be valid. Could not resolve pricing currency.',
      'message', 'Event currency must be valid. Could not resolve pricing currency.'
    );
  END IF;

  -- 6. Pending Payment Limit Enforcement (Max 2 Pending Events per Organization)
  v_is_pending := (
    UPPER(COALESCE(p_payment_status, 'UNPAID')) IN ('PENDING_PAYMENT', 'UNPAID')
    OR LOWER(COALESCE(p_status, 'draft')) = 'pending_payment'
  );

  IF v_is_pending AND NOT COALESCE(p_skip_pending_limit_check, FALSE) THEN
    SELECT COUNT(*) INTO v_pending_count
    FROM public.events
    WHERE organization_id = p_organization_id
      AND (
        UPPER(COALESCE(payment_status, 'UNPAID')) IN ('PENDING_PAYMENT', 'UNPAID')
        OR LOWER(COALESCE(status, 'draft')) = 'pending_payment'
      )
      AND UPPER(COALESCE(payment_status, 'UNPAID')) NOT IN ('PAID', 'REFUNDED')
      AND LOWER(COALESCE(status, 'draft')) NOT IN ('cancelled', 'expired', 'completed')
      AND UPPER(COALESCE(event_status, 'DRAFT')) NOT IN ('CANCELLED', 'EXPIRED', 'COMPLETED')
      AND (
        (now() AT TIME ZONE COALESCE(NULLIF(TRIM(event_timezone), ''), 'Asia/Singapore'))::date <= COALESCE(
          CASE
            WHEN end_date ~ '^\d{4}-\d{2}-\d{2}' THEN (SUBSTRING(end_date FROM 1 FOR 10))::date
            WHEN start_date ~ '^\d{4}-\d{2}-\d{2}' THEN (SUBSTRING(start_date FROM 1 FOR 10))::date
            WHEN event_date ~ '^\d{4}-\d{2}-\d{2}' THEN (SUBSTRING(event_date FROM 1 FOR 10))::date
            ELSE NULL
          END,
          (expires_at AT TIME ZONE COALESCE(NULLIF(TRIM(event_timezone), ''), 'Asia/Singapore'))::date
        )
      );

    IF v_pending_count >= v_max_limit THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'PENDING_EVENT_LIMIT_REACHED',
        'error', 'You have reached the maximum allowed pending events limit (' || v_max_limit || '). Please complete payment or cancel an existing unpaid event before creating a new one.',
        'message', 'You have reached the maximum allowed pending events limit (' || v_max_limit || '). Please complete payment or cancel an existing unpaid event before creating a new one.'
      );
    END IF;
  END IF;

  -- 7. Generate Collision-Resistant Public Token
  IF p_public_token IS NOT NULL AND TRIM(p_public_token) <> '' THEN
    v_token := TRIM(p_public_token);
  ELSE
    LOOP
      v_token := encode(gen_random_bytes(16), 'hex');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.events WHERE public_token = v_token);
      v_token_attempts := v_token_attempts + 1;
      IF v_token_attempts > 10 THEN
        v_token := encode(gen_random_bytes(24), 'hex');
        EXIT;
      END IF;
    END LOOP;
  END IF;

  v_event_id := COALESCE(p_event_id, gen_random_uuid());

  -- 8. Insert Event Record with Authoritative Fail-Closed Pricing
  INSERT INTO public.events (
    id,
    organization_id,
    game_theme_id,
    game_id,
    name,
    start_date,
    end_date,
    starts_at,
    expires_at,
    event_date,
    status,
    event_status,
    payment_status,
    cancel_reason,
    event_price,
    event_currency,
    paid_amount,
    discount_amount,
    payment_mode,
    public_token,
    created_by,
    event_timezone,
    pricing_id,
    duration_days,
    created_at,
    updated_at
  ) VALUES (
    v_event_id,
    p_organization_id,
    p_game_theme_id,
    v_target_game_id,
    TRIM(p_name),
    TRIM(p_start_date),
    TRIM(p_end_date),
    p_starts_at,
    p_expires_at,
    COALESCE(p_event_date, p_start_date),
    COALESCE(p_status, 'draft'),
    COALESCE(p_event_status, 'DRAFT'),
    UPPER(COALESCE(p_payment_status, 'UNPAID')),
    p_cancel_reason,
    v_resolved_price,
    v_resolved_currency,
    COALESCE(p_paid_amount, 0.00),
    COALESCE(p_discount_amount, 0.00),
    p_payment_mode,
    v_token,
    p_created_by,
    v_event_timezone,
    v_pricing_id,
    v_duration_days,
    v_now,
    v_now
  )
  RETURNING * INTO v_event;

  RETURN jsonb_build_object(
    'success', true,
    'event_id', v_event.id,
    'public_token', v_event.public_token,
    'event', to_jsonb(v_event)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_event_atomic(
  UUID, UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, UUID, UUID, INT, BOOLEAN, TEXT, UUID, INT
) TO service_role;

REVOKE EXECUTE ON FUNCTION public.create_event_atomic(
  UUID, UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, UUID, UUID, INT, BOOLEAN, TEXT, UUID, INT
) FROM authenticated, anon, public;

-- ------------------------------------------------------------------------------
-- DATABASE-LEVEL TRIGGER FOR PRICING INTEGRITY ENFORCEMENT
-- ------------------------------------------------------------------------------
-- Guarantees that any direct INSERT or UPDATE on public.events with a pricing_id
-- strictly matches the event's game_id, is active, and covers the duration_days.
CREATE OR REPLACE FUNCTION public.check_event_pricing_game_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_tier RECORD;
BEGIN
  IF NEW.pricing_id IS NOT NULL THEN
    SELECT id, game_id, is_active, min_days, max_days
    INTO v_tier
    FROM public.game_pricing
    WHERE id = NEW.pricing_id;

    IF v_tier.id IS NULL THEN
      RAISE EXCEPTION 'PRICING_TIER_NOT_FOUND: Pricing tier % does not exist', NEW.pricing_id
        USING ERRCODE = '23503';
    END IF;

    IF NEW.game_id IS NOT NULL AND v_tier.game_id <> NEW.game_id THEN
      RAISE EXCEPTION 'PRICING_GAME_MISMATCH: Pricing tier % belongs to game % but event belongs to game %',
        NEW.pricing_id, v_tier.game_id, NEW.game_id
        USING ERRCODE = '23514';
    END IF;

    IF v_tier.is_active = false THEN
      RAISE EXCEPTION 'PRICING_TIER_INACTIVE: Pricing tier % is inactive', NEW.pricing_id
        USING ERRCODE = '23514';
    END IF;

    IF NEW.duration_days IS NOT NULL AND NEW.duration_days > 0 THEN
      IF NEW.duration_days < v_tier.min_days OR (v_tier.max_days IS NOT NULL AND NEW.duration_days > v_tier.max_days) THEN
        RAISE EXCEPTION 'PRICING_DURATION_MISMATCH: Pricing tier % covers %-% days but event duration is % days',
          NEW.pricing_id, v_tier.min_days, COALESCE(v_tier.max_days::text, 'unlimited'), NEW.duration_days
          USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_event_pricing_game_integrity ON public.events;
CREATE TRIGGER trg_check_event_pricing_game_integrity
  BEFORE INSERT OR UPDATE OF pricing_id, game_id, duration_days ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.check_event_pricing_game_integrity();

