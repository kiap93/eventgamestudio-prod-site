-- Migration: 20260927000000_exclude_expired_unpaid_events_from_pending_limit.sql
-- Description: Excludes expired unpaid events whose end date has passed from the organization maximum 2 pending events limit
--              Updates both check_event_pending_limit trigger function and create_event_atomic RPC to enforce date-based
--              and status-based expiration filtering under authoritative timezone evaluation.

-- ------------------------------------------------------------------------------
-- 1. UPDATE check_event_pending_limit TRIGGER FUNCTION
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_event_pending_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pending_count INT;
  v_is_pending BOOLEAN;
  v_new_end_date DATE;
  v_new_is_past BOOLEAN := FALSE;
BEGIN
  v_is_pending := (
    UPPER(COALESCE(NEW.payment_status, 'UNPAID')) IN ('PENDING_PAYMENT', 'UNPAID')
    OR LOWER(COALESCE(NEW.status, 'draft')) = 'pending_payment'
  );

  -- Determine if NEW is already past its end date in its timezone
  v_new_end_date := COALESCE(
    CASE
      WHEN NEW.end_date ~ '^\d{4}-\d{2}-\d{2}' THEN (SUBSTRING(NEW.end_date FROM 1 FOR 10))::date
      WHEN NEW.start_date ~ '^\d{4}-\d{2}-\d{2}' THEN (SUBSTRING(NEW.start_date FROM 1 FOR 10))::date
      WHEN NEW.event_date ~ '^\d{4}-\d{2}-\d{2}' THEN (SUBSTRING(NEW.event_date FROM 1 FOR 10))::date
      ELSE NULL
    END,
    (NEW.expires_at AT TIME ZONE COALESCE(NULLIF(TRIM(NEW.event_timezone), ''), 'Asia/Singapore'))::date
  );

  IF v_new_end_date IS NOT NULL AND (now() AT TIME ZONE COALESCE(NULLIF(TRIM(NEW.event_timezone), ''), 'Asia/Singapore'))::date > v_new_end_date THEN
    v_new_is_past := TRUE;
  END IF;

  -- Only check if the event is entering or in pending state, not cancelled/expired/completed, and its end date has not passed
  IF v_is_pending
     AND NOT v_new_is_past
     AND LOWER(COALESCE(NEW.status, 'draft')) NOT IN ('cancelled', 'expired', 'completed')
     AND UPPER(COALESCE(NEW.event_status, 'DRAFT')) NOT IN ('CANCELLED', 'EXPIRED', 'COMPLETED')
     AND UPPER(COALESCE(NEW.payment_status, 'UNPAID')) NOT IN ('PAID', 'REFUNDED') THEN

    PERFORM 1 FROM public.organizations WHERE id = NEW.organization_id FOR UPDATE;

    SELECT COUNT(*) INTO v_pending_count
    FROM public.events
    WHERE organization_id = NEW.organization_id
      AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
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

    IF v_pending_count >= 5 THEN
      RAISE EXCEPTION 'PENDING_EVENT_LIMIT_REACHED: You have reached the maximum allowed limit of 5 unpaid events. Please pay for or delete an existing pending event before creating a new one.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_event_pending_limit ON public.events;
CREATE TRIGGER trg_check_event_pending_limit
  BEFORE INSERT OR UPDATE OF status, event_status, payment_status
  ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.check_event_pending_limit();

-- ------------------------------------------------------------------------------
-- 2. UPDATE create_event_atomic RPC WITH ACCURATE PENDING-EVENT ENFORCEMENT
-- ------------------------------------------------------------------------------
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
  p_max_pending_events INT DEFAULT 5,
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
  -- A pending event slot is consumed ONLY when the event is:
  -- - belonging to the same organization
  -- - unpaid / pending payment
  -- - not explicitly cancelled, expired, or completed
  -- - event end date has NOT already passed (inclusive of end date) in its authoritative timezone
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
        'error', 'You have reached the maximum allowed limit of 5 unpaid events. Please pay for or delete an existing pending event before creating a new one.',
        'message', 'You have reached the maximum allowed limit of 5 unpaid events. Please pay for or delete an existing pending event before creating a new one.',
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
