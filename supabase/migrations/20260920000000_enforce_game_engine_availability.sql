-- ==============================================================================
-- Migration: 20260920000000_enforce_game_engine_availability.sql
-- Description: Enforces strict game engine availability at the database level.
-- 1. Adds check trigger on public.games preventing unavailable / in-development engines (e.g. speed-quiz) from being set to 'active'.
-- 2. Sets any existing speed-quiz games to 'draft' status.
-- 3. Hardens create_event_atomic to reject any game not in 'active' status or whose engine is unavailable.
-- ==============================================================================

-- 1. Ensure any existing speed-quiz records in public.games are safely kept in 'draft' status
UPDATE public.games
SET status = 'draft',
    updated_at = timezone('utc'::text, now())
WHERE LOWER(game_type) IN ('speed-quiz', 'quiz-rush', 'trivia-quiz', 'event-trivia-speed-quiz')
   OR LOWER(slug) IN ('speed-quiz', 'quiz-rush', 'trivia-quiz', 'event-trivia-speed-quiz');

-- 2. Create trigger function to enforce game engine availability on public.games
CREATE OR REPLACE FUNCTION public.check_game_engine_availability()
RETURNS TRIGGER AS $$
BEGIN
  -- Strict whitelist check for active platform games:
  -- Only fully implemented game engines are allowed to have status = 'active'
  IF NEW.status = 'active' THEN
    IF LOWER(COALESCE(NEW.game_type, '')) IN ('speed-quiz', 'quiz-rush', 'trivia-quiz', 'event-trivia-speed-quiz')
       OR LOWER(COALESCE(NEW.slug, '')) IN ('speed-quiz', 'quiz-rush', 'trivia-quiz', 'event-trivia-speed-quiz') THEN
      RAISE EXCEPTION 'Cannot activate game: Game engine "%" is currently under development and cannot be activated.', NEW.game_type
        USING ERRCODE = 'check_violation';
    END IF;

    -- Positive whitelist verification
    IF LOWER(COALESCE(NEW.game_type, '')) NOT IN ('catch-brand', 'memory-match', 'reaction-tap', 'reaction-time') THEN
      RAISE EXCEPTION 'Cannot activate game: Game engine "%" is not a recognized production engine.', NEW.game_type
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_game_engine_availability ON public.games;
CREATE TRIGGER trg_check_game_engine_availability
BEFORE INSERT OR UPDATE OF status, game_type, slug ON public.games
FOR EACH ROW
EXECUTE FUNCTION public.check_game_engine_availability();

-- 3. Update create_event_atomic to strictly enforce game status = 'active' and engine whitelist
CREATE OR REPLACE FUNCTION public.create_event_atomic(
  p_organization_id UUID,
  p_name TEXT,
  p_theme_id UUID,
  p_start_date TEXT,
  p_end_date TEXT,
  p_game_id UUID DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_status TEXT DEFAULT 'draft',
  p_payment_status TEXT DEFAULT 'UNPAID',
  p_base_price NUMERIC DEFAULT 1400.00,
  p_calculated_price NUMERIC DEFAULT 1400.00,
  p_final_price NUMERIC DEFAULT 1400.00,
  p_is_custom_price BOOLEAN DEFAULT FALSE,
  p_discount_amount NUMERIC DEFAULT 0.00,
  p_payment_mode TEXT DEFAULT NULL,
  p_public_token TEXT DEFAULT NULL,
  p_created_by UUID DEFAULT NULL,
  p_event_id UUID DEFAULT NULL,
  p_max_pending_events INT DEFAULT 2,
  p_skip_pending_limit_check BOOLEAN DEFAULT FALSE,
  p_event_timezone TEXT DEFAULT NULL
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
BEGIN
  -- 1. Lock the organization row FOR UPDATE to enforce serialized concurrency
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

  -- Resolve authoritative event timezone: explicit parameter -> organization country default -> business default (Asia/Singapore)
  v_event_timezone := TRIM(COALESCE(p_event_timezone, ''));
  IF v_event_timezone = '' THEN
    IF UPPER(COALESCE(v_org.country_code, 'MY')) = 'SG' THEN
      v_event_timezone := 'Asia/Singapore';
    ELSE
      v_event_timezone := 'Asia/Kuala_Lumpur';
    END IF;
  END IF;

  -- 2. Input Validation
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

  -- 3. Theme Resolution and Tenant Isolation
  SELECT * INTO v_theme
  FROM public.themes
  WHERE id = p_theme_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'THEME_NOT_FOUND',
      'error', 'The selected theme was not found.',
      'message', 'The selected theme was not found.'
    );
  END IF;

  IF v_theme.is_system = TRUE OR v_theme.organization_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'THEME_SYSTEM_FORBIDDEN',
      'error', 'Only organization themes can be used for events.',
      'message', 'Only organization themes can be used for events.'
    );
  END IF;

  IF v_theme.organization_id <> p_organization_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'THEME_FORBIDDEN',
      'error', 'Only organization themes can be used for events.',
      'message', 'Only organization themes can be used for events.'
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

  -- 4. Target Game Resolution and Isolation
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

  -- ENFORCE GAME STATUS: Must be strictly 'active'
  IF v_game.status IS NULL OR v_game.status <> 'active' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'GAME_NOT_ACTIVE',
      'error', 'This game is currently not active and cannot be selected for new events.',
      'message', 'This game is currently not active and cannot be selected for new events.'
    );
  END IF;

  -- ENFORCE ENGINE AVAILABILITY: Reject unavailable or in-development engines
  IF LOWER(COALESCE(v_game.game_type, '')) IN ('speed-quiz', 'quiz-rush', 'trivia-quiz', 'event-trivia-speed-quiz')
     OR LOWER(COALESCE(v_game.slug, '')) IN ('speed-quiz', 'quiz-rush', 'trivia-quiz', 'event-trivia-speed-quiz')
     OR LOWER(COALESCE(v_game.game_type, '')) NOT IN ('catch-brand', 'memory-match', 'reaction-tap', 'reaction-time') THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'GAME_UNAVAILABLE',
      'error', 'The selected game engine is currently under development and cannot be used for events.',
      'message', 'The selected game engine is currently under development and cannot be used for events.'
    );
  END IF;

  -- 5. Pending Payment Limit Enforcement (Max 2 Pending Events per Organization)
  v_is_pending := (
    UPPER(COALESCE(p_payment_status, 'UNPAID')) IN ('PENDING_PAYMENT', 'UNPAID')
    OR LOWER(COALESCE(p_status, 'draft')) = 'pending_payment'
  );

  IF v_is_pending AND NOT COALESCE(p_skip_pending_limit_check, FALSE) THEN
    SELECT COUNT(*) INTO v_pending_count
    FROM public.events
    WHERE organization_id = p_organization_id
      AND (
        UPPER(payment_status) IN ('PENDING_PAYMENT', 'UNPAID')
        OR LOWER(status) = 'pending_payment'
      )
      AND LOWER(status) <> 'cancelled'
      AND UPPER(event_status) <> 'CANCELLED';

    IF v_pending_count >= v_max_limit THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'PENDING_EVENT_LIMIT_REACHED',
        'error', 'You have reached the maximum allowed pending events limit (' || v_max_limit || '). Please complete payment or cancel an existing unpaid event before creating a new one.',
        'message', 'You have reached the maximum allowed pending events limit (' || v_max_limit || '). Please complete payment or cancel an existing unpaid event before creating a new one.'
      );
    END IF;
  END IF;

  -- 6. Generate Unique Public Token (Base32/Base36 URL-safe format)
  IF p_public_token IS NOT NULL AND TRIM(p_public_token) <> '' THEN
    v_token := TRIM(p_public_token);
  ELSE
    LOOP
      v_token_attempts := v_token_attempts + 1;
      -- Generate 10-char alphanumeric slug
      v_token := LOWER(SUBSTRING(MD5(RANDOM()::TEXT || clock_timestamp()::TEXT) FROM 1 FOR 10));
      
      -- Verify uniqueness
      PERFORM 1 FROM public.events WHERE public_token = v_token;
      IF NOT FOUND THEN
        EXIT;
      END IF;

      IF v_token_attempts > 10 THEN
        -- Fallback to UUID-based string if collisions occur
        v_token := REPLACE(gen_random_uuid()::TEXT, '-', '');
        EXIT;
      END IF;
    END LOOP;
  END IF;

  -- 7. Insert the event
  v_event_id := COALESCE(p_event_id, gen_random_uuid());

  INSERT INTO public.events (
    id,
    organization_id,
    theme_id,
    game_id,
    name,
    description,
    start_date,
    end_date,
    event_timezone,
    status,
    payment_status,
    base_price,
    calculated_price,
    final_price,
    is_custom_price,
    discount_amount,
    payment_mode,
    public_token,
    created_by,
    created_at,
    updated_at
  ) VALUES (
    v_event_id,
    p_organization_id,
    p_theme_id,
    v_target_game_id,
    TRIM(p_name),
    TRIM(p_description),
    TRIM(p_start_date),
    TRIM(p_end_date),
    v_event_timezone,
    COALESCE(p_status, 'draft'),
    UPPER(COALESCE(p_payment_status, 'UNPAID')),
    COALESCE(p_base_price, 1400.00),
    COALESCE(p_calculated_price, 1400.00),
    COALESCE(p_final_price, 1400.00),
    COALESCE(p_is_custom_price, FALSE),
    COALESCE(p_discount_amount, 0.00),
    p_payment_mode,
    v_token,
    p_created_by,
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
