-- ==============================================================================
-- Migration: 20260928000000_update_pending_event_limit_to_5.sql
-- Description: Updates the maximum active unpaid/pending event limit per
--              organization from 2 to 5.
--              Preserves all date-based expiration checks and atomic locking.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. UPDATE check_event_pending_limit TRIGGER FUNCTION
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_event_pending_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_pending_count INT;
  v_is_pending BOOLEAN;
  v_new_tz TEXT;
  v_new_end_date DATE;
  v_new_cur_date DATE;
  v_new_is_past BOOLEAN := FALSE;
BEGIN
  -- 1. Determine if the incoming / updated record is in pending-payment state
  v_is_pending := (
    UPPER(COALESCE(NEW.payment_status, 'UNPAID')) IN ('PENDING_PAYMENT', 'UNPAID')
    OR LOWER(COALESCE(NEW.status, 'draft')) = 'pending_payment'
  )
  AND UPPER(COALESCE(NEW.payment_status, 'UNPAID')) NOT IN ('PAID', 'REFUNDED')
  AND LOWER(COALESCE(NEW.status, 'draft')) NOT IN ('cancelled', 'expired', 'completed')
  AND UPPER(COALESCE(NEW.event_status, 'DRAFT')) NOT IN ('CANCELLED', 'EXPIRED', 'COMPLETED');

  -- 2. If incoming record is unpaid, check if its end date has already passed in its authoritative timezone
  IF v_is_pending THEN
    v_new_tz := COALESCE(NULLIF(TRIM(NEW.event_timezone), ''), 'Asia/Singapore');
    v_new_cur_date := (now() AT TIME ZONE v_new_tz)::date;

    v_new_end_date := COALESCE(
      CASE
        WHEN NEW.end_date ~ '^\d{4}-\d{2}-\d{2}' THEN (SUBSTRING(NEW.end_date FROM 1 FOR 10))::date
        WHEN NEW.start_date ~ '^\d{4}-\d{2}-\d{2}' THEN (SUBSTRING(NEW.start_date FROM 1 FOR 10))::date
        WHEN NEW.event_date ~ '^\d{4}-\d{2}-\d{2}' THEN (SUBSTRING(NEW.event_date FROM 1 FOR 10))::date
        ELSE NULL
      END,
      (NEW.expires_at AT TIME ZONE v_new_tz)::date
    );

    IF v_new_end_date IS NOT NULL AND v_new_cur_date > v_new_end_date THEN
      v_new_is_past := TRUE;
    END IF;
  END IF;

  -- 3. Only count against the 5-event limit if the record is actively pending AND not past its end date
  IF v_is_pending AND NOT v_new_is_past THEN
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
-- 2. UPDATE create_event_atomic RPC WITH 5 PENDING-EVENT ENFORCEMENT
-- ------------------------------------------------------------------------------
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
  p_event_price NUMERIC DEFAULT 1400.00,
  p_event_currency TEXT DEFAULT 'MYR',
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
  v_start_date DATE;
  v_end_date DATE;
  v_calculated_days INT;
  v_game_pricing RECORD;
  v_matched_tier RECORD;
  v_resolved_price NUMERIC;
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

  -- 4. Validate Game Existence and Engine Readiness
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

  IF v_game.is_active IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'GAME_INACTIVE',
      'error', 'Specified game is currently inactive'
    );
  END IF;

  IF LOWER(COALESCE(v_game.engine_status, 'ready')) <> 'ready' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'GAME_ENGINE_NOT_READY',
      'error', 'Game engine is not ready for live event deployment'
    );
  END IF;

  -- 5. Authoritative Fail-Closed Server Pricing Verification
  SELECT * INTO v_game_pricing
  FROM public.game_pricing
  WHERE game_id = v_target_game_id
    AND is_active = TRUE;

  IF FOUND THEN
    SELECT
      (t->>'min_days')::int AS min_days,
      (t->>'max_days')::int AS max_days,
      (t->>'price')::numeric AS price
    INTO v_matched_tier
    FROM jsonb_array_elements(v_game_pricing.pricing_tiers) AS t
    WHERE v_calculated_days >= (t->>'min_days')::int
      AND (
        t->>'max_days' IS NULL
        OR (t->>'max_days')::int = 0
        OR v_calculated_days <= (t->>'max_days')::int
      )
    ORDER BY (t->>'min_days')::int DESC
    LIMIT 1;

    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'NO_PRICING_TIER',
        'error', 'No pricing tier found for the specified duration (' || v_calculated_days || ' days). Fail-closed.'
      );
    END IF;

    v_resolved_price := v_matched_tier.price;
    v_pricing_id := v_game_pricing.id;
  ELSE
    v_resolved_price := COALESCE(p_event_price, 1400.00);
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

  -- 8. Assign or Generate Event ID
  v_event_id := COALESCE(p_event_id, gen_random_uuid());

  -- 9. Insert Event Record Atomically
  INSERT INTO public.events (
    id,
    organization_id,
    game_id,
    game_theme_id,
    name,
    event_date,
    start_date,
    end_date,
    starts_at,
    expires_at,
    status,
    event_status,
    payment_status,
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
    v_target_game_id,
    p_game_theme_id,
    TRIM(p_name),
    COALESCE(p_event_date, p_start_date),
    p_start_date,
    p_end_date,
    p_starts_at,
    p_expires_at,
    COALESCE(p_status, 'draft'),
    COALESCE(p_event_status, 'DRAFT'),
    COALESCE(p_payment_status, 'UNPAID'),
    v_resolved_price,
    COALESCE(p_event_currency, 'MYR'),
    COALESCE(p_paid_amount, 0),
    COALESCE(p_discount_amount, 0),
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
    'event', row_to_json(v_event)
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'code', SQLSTATE,
    'error', SQLERRM
  );
END;
$$;
