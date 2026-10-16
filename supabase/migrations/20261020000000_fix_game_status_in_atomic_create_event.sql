-- ==============================================================================
-- Migration: 20261020000000_fix_game_status_in_atomic_create_event.sql
-- Description: Fixes create_event_atomic RPC game validation to use authoritative
--              status column on public.games ('active', 'inactive', 'archived', 'draft')
--              instead of nonexistent is_active and engine_status columns.
-- ==============================================================================

-- Drop existing overloads of create_event_atomic
DROP FUNCTION IF EXISTS public.create_event_atomic(
  UUID, UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, UUID, UUID, INT, BOOLEAN, TEXT, UUID, INT
);

DROP FUNCTION IF EXISTS public.create_event_atomic(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, UUID, UUID, INT, BOOLEAN, TEXT, UUID, INT
);

DROP FUNCTION IF EXISTS public.create_event_atomic(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, UUID, UUID, INT, BOOLEAN, TEXT, UUID, INT, TEXT
);

CREATE OR REPLACE FUNCTION public.create_event_atomic(
  p_organization_id UUID,
  p_game_id UUID,
  p_game_theme_id UUID,
  p_name TEXT,
  p_start_date TEXT,
  p_end_date TEXT,
  p_event_date TEXT DEFAULT NULL,
  p_starts_at TIMESTAMPTZ DEFAULT NULL,
  p_expires_at TIMESTAMPTZ DEFAULT NULL,
  p_status TEXT DEFAULT 'draft',
  p_event_status TEXT DEFAULT 'DRAFT',
  p_payment_status TEXT DEFAULT 'UNPAID',
  p_event_price NUMERIC DEFAULT NULL,
  p_event_currency TEXT DEFAULT NULL,
  p_paid_amount NUMERIC DEFAULT 0,
  p_discount_amount NUMERIC DEFAULT 0,
  p_payment_mode TEXT DEFAULT NULL,
  p_public_token TEXT DEFAULT NULL,
  p_created_by UUID DEFAULT NULL,
  p_event_id UUID DEFAULT NULL,
  p_max_pending_events INT DEFAULT 5,
  p_skip_pending_limit_check BOOLEAN DEFAULT FALSE,
  p_event_timezone TEXT DEFAULT NULL,
  p_pricing_id UUID DEFAULT NULL,
  p_duration_days INT DEFAULT NULL,
  p_cancel_reason TEXT DEFAULT NULL
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
  v_max_limit INT := COALESCE(p_max_pending_events, 5);
  v_is_pending BOOLEAN;
  v_event_id UUID;
  v_token TEXT;
  v_token_attempts INT := 0;
  v_event RECORD;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
  v_event_timezone TEXT;
  v_pricing_id UUID := p_pricing_id;
  v_duration_days INT := p_duration_days;
  v_pricing_country TEXT := NULL;
  v_start_date DATE;
  v_end_date DATE;
  v_calculated_days INT;
  v_pricing_record RECORD;
  v_resolved_price NUMERIC;
  v_resolved_currency TEXT;
  v_org_country TEXT;
  v_price_quote JSONB;
BEGIN
  -- 1. Validate and Lock Organization
  SELECT * INTO v_org
  FROM public.organizations
  WHERE id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'ORGANIZATION_NOT_FOUND',
      'error', 'Organization not found'
    );
  END IF;

  v_org_country := UPPER(COALESCE(v_org.country_code, 'US'));

  -- Resolve authoritative event timezone
  v_event_timezone := COALESCE(NULLIF(TRIM(p_event_timezone), ''), 'Asia/Singapore');

  -- Parse and validate start and end dates
  BEGIN
    IF p_start_date ~ '^\d{4}-\d{2}-\d{2}' THEN
      v_start_date := (SUBSTRING(p_start_date FROM 1 FOR 10))::date;
    ELSE
      v_start_date := (p_starts_at AT TIME ZONE v_event_timezone)::date;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_start_date := NULL;
  END;

  BEGIN
    IF p_end_date ~ '^\d{4}-\d{2}-\d{2}' THEN
      v_end_date := (SUBSTRING(p_end_date FROM 1 FOR 10))::date;
    ELSE
      v_end_date := (p_expires_at AT TIME ZONE v_event_timezone)::date;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_end_date := NULL;
  END;

  IF v_start_date IS NULL OR v_end_date IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'INVALID_EVENT_DATES',
      'error', 'Valid start_date and end_date are required'
    );
  END IF;

  IF v_end_date < v_start_date THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'INVALID_EVENT_DATES',
      'error', 'Event end_date must be on or after start_date'
    );
  END IF;

  -- Inclusive calendar duration calculation
  v_calculated_days := (v_end_date - v_start_date) + 1;
  IF v_duration_days IS NULL OR v_duration_days <= 0 THEN
    v_duration_days := v_calculated_days;
  END IF;

  -- 2. Validate Game Theme Existence and Ownership
  SELECT * INTO v_theme
  FROM public.game_themes
  WHERE id = p_game_theme_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'THEME_NOT_FOUND',
      'error', 'Selected game theme not found'
    );
  END IF;

  IF v_theme.is_system IS NOT TRUE AND v_theme.organization_id <> p_organization_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'THEME_NOT_OWNED',
      'error', 'Theme does not belong to this organization'
    );
  END IF;

  -- 3. Resolve Target Game ID
  v_target_game_id := COALESCE(p_game_id, v_theme.game_id);

  IF v_target_game_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'GAME_NOT_FOUND',
      'error', 'A valid game must be specified'
    );
  END IF;

  IF v_theme.game_id IS NOT NULL AND v_theme.game_id <> v_target_game_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'THEME_GAME_MISMATCH',
      'error', 'Theme does not belong to the selected game'
    );
  END IF;

  -- 4. Validate Game Existence and Availability (status must be 'active')
  SELECT * INTO v_game
  FROM public.games
  WHERE id = v_target_game_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'GAME_NOT_FOUND',
      'error', 'Specified game was not found'
    );
  END IF;

  IF v_game.status IS NULL OR v_game.status <> 'active' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'GAME_INACTIVE',
      'error', 'Specified game is currently inactive'
    );
  END IF;

  -- 5. Authoritative Fail-Closed Server Pricing Verification with Country Resolution
  IF p_event_price IS NOT NULL AND p_event_price > 0 AND p_event_currency IS NOT NULL THEN
    -- Explicit authoritative price passed from verified server-side caller
    v_resolved_price := p_event_price;
    v_resolved_currency := UPPER(TRIM(p_event_currency));
  ELSE
    -- Resolve through authoritative calculate_event_authoritative_price RPC (enforces country fallback and checks v_pricing_id)
    v_price_quote := public.calculate_event_authoritative_price(
      NULL,
      v_target_game_id,
      v_start_date,
      v_end_date,
      v_pricing_id,
      v_org_country
    );

    IF v_price_quote->>'success' IS NOT TRUE OR (v_price_quote->>'price')::numeric <= 0 THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', COALESCE(v_price_quote->>'code', 'NO_PRICING_TIER'),
        'error', COALESCE(v_price_quote->>'error', 'Pricing cannot be resolved for this game and duration.'),
        'message', COALESCE(v_price_quote->>'message', v_price_quote->>'error', 'Pricing cannot be resolved for this game and duration.'),
        'requested_country', v_org_country
      );
    END IF;

    v_resolved_price := (v_price_quote->>'price')::numeric;
    v_resolved_currency := v_price_quote->>'currency';
    IF v_price_quote->>'pricing_id' IS NOT NULL THEN
      v_pricing_id := (v_price_quote->>'pricing_id')::uuid;
    END IF;
    v_pricing_country := COALESCE(v_pricing_country, v_price_quote->>'pricing_country');
  END IF;

  IF v_resolved_price IS NULL OR v_resolved_price <= 0 OR v_resolved_currency IS NULL OR v_resolved_currency = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'NO_PRICING_TIER',
      'error', 'Pricing cannot be resolved for this game and duration.'
    );
  END IF;

  -- 6. Evaluate Active Pending-Payment Status & Authoritative End Date
  v_is_pending := (
    UPPER(COALESCE(p_payment_status, 'UNPAID')) IN ('PENDING_PAYMENT', 'UNPAID')
    OR LOWER(COALESCE(p_status, 'draft')) = 'pending_payment'
  );

  IF v_is_pending AND NOT COALESCE(p_skip_pending_limit_check, false) THEN
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
        'error', 'You have reached the maximum allowed limit of 5 unpaid events. Please pay for or delete an existing pending event before creating a new one.',
        'pending_count', v_pending_count,
        'max_limit', v_max_limit
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

  -- 8. Assign Event ID
  v_event_id := COALESCE(p_event_id, gen_random_uuid());

  -- 9. Insert Event Record with Authoritative Price & Currency
  INSERT INTO public.events (
    id,
    organization_id,
    game_id,
    game_theme_id,
    name,
    start_date,
    end_date,
    event_date,
    starts_at,
    expires_at,
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
    pricing_country,
    created_at,
    updated_at
  ) VALUES (
    v_event_id,
    p_organization_id,
    v_target_game_id,
    p_game_theme_id,
    TRIM(p_name),
    p_start_date,
    p_end_date,
    COALESCE(p_event_date, p_start_date),
    p_starts_at,
    p_expires_at,
    COALESCE(p_status, 'draft'),
    COALESCE(p_event_status, 'DRAFT'),
    COALESCE(p_payment_status, 'UNPAID'),
    p_cancel_reason,
    v_resolved_price,
    v_resolved_currency,
    COALESCE(p_paid_amount, 0),
    COALESCE(p_discount_amount, 0),
    p_payment_mode,
    v_token,
    p_created_by,
    v_event_timezone,
    v_pricing_id,
    v_duration_days,
    v_pricing_country,
    v_now,
    v_now
  )
  RETURNING * INTO v_event;

  RETURN jsonb_build_object(
    'success', true,
    'event_id', v_event.id,
    'event', to_jsonb(v_event)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_event_atomic(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, UUID, UUID, INT, BOOLEAN, TEXT, UUID, INT, TEXT
) TO service_role;

REVOKE EXECUTE ON FUNCTION public.create_event_atomic(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, UUID, UUID, INT, BOOLEAN, TEXT, UUID, INT, TEXT
) FROM authenticated, anon, public;
