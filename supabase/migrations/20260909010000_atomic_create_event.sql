-- Migration: 20260909010000_atomic_create_event.sql
-- Description: Introduces create_event_atomic RPC and database-level pending event limit enforcement
--              using row-level locking on public.organizations (FOR UPDATE) to guarantee atomic,
--              race-condition-free max 2 pending events per organization across distributed Cloudflare Workers.

-- ------------------------------------------------------------------------------
-- 1. ATOMIC DISTRIBUTED EVENT CREATION RPC WITH EXCLUSIVE ORGANIZATION LOCK
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
  p_event_price NUMERIC DEFAULT 1400.00,
  p_event_currency TEXT DEFAULT 'MYR',
  p_paid_amount NUMERIC DEFAULT 0.00,
  p_discount_amount NUMERIC DEFAULT 0.00,
  p_payment_mode TEXT DEFAULT NULL,
  p_public_token TEXT DEFAULT NULL,
  p_created_by UUID DEFAULT NULL,
  p_event_id UUID DEFAULT NULL,
  p_max_pending_events INT DEFAULT 2,
  p_skip_pending_limit_check BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org public.organizations%ROWTYPE;
  v_theme public.game_themes%ROWTYPE;
  v_game public.games%ROWTYPE;
  v_event public.events%ROWTYPE;
  v_pending_count INT := 0;
  v_is_pending BOOLEAN := false;
  v_target_game_id UUID;
  v_token TEXT;
  v_event_id UUID;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
  v_token_attempts INT := 0;
  v_max_limit INT := COALESCE(p_max_pending_events, 2);
BEGIN
  -- 1. Input validations
  IF p_organization_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'VALIDATION_ERROR',
      'error', 'Organization ID is required',
      'message', 'Organization ID is required'
    );
  END IF;

  IF p_game_theme_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'VALIDATION_ERROR',
      'error', 'Game Theme selection is required',
      'message', 'Game Theme selection is required'
    );
  END IF;

  IF p_name IS NULL OR TRIM(p_name) = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'VALIDATION_ERROR',
      'error', 'Event name is required',
      'message', 'Event name is required'
    );
  END IF;

  IF p_starts_at IS NULL OR p_expires_at IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'VALIDATION_ERROR',
      'error', 'Event starts_at and expires_at timestamps are required',
      'message', 'Event starts_at and expires_at timestamps are required'
    );
  END IF;

  -- 2. Concurrency Control: Exclusive row-level lock on the target organization.
  -- This serializes all event creations for this tenant across distributed Cloudflare Worker instances.
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

  -- 3. Theme & Game Isolation & Permissions Validation
  SELECT * INTO v_theme
  FROM public.game_themes
  WHERE id = p_game_theme_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'THEME_NOT_FOUND',
      'error', 'Selected Game Theme not found',
      'message', 'Selected Game Theme not found'
    );
  END IF;

  IF v_theme.is_system = true OR v_theme.ownership_type = 'system' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'SYSTEM_THEME_NOT_ALLOWED',
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

  v_target_game_id := COALESCE(p_game_id, v_theme.game_id);
  IF v_target_game_id IS NOT NULL THEN
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

    IF v_game.status = 'inactive' THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'GAME_INACTIVE',
        'error', 'This game is currently inactive and cannot be selected for new events.',
        'message', 'This game is currently inactive and cannot be selected for new events.'
      );
    END IF;
  END IF;

  -- 4. Evaluate whether the new event being created counts as a pending-payment event
  v_is_pending := (
    UPPER(COALESCE(p_payment_status, 'UNPAID')) IN ('PENDING_PAYMENT', 'UNPAID')
    OR LOWER(COALESCE(p_status, 'draft')) = 'pending_payment'
  );

  -- 5. Atomic check of pending event limit under the organization lock
  IF v_is_pending AND NOT COALESCE(p_skip_pending_limit_check, false) THEN
    SELECT COUNT(*) INTO v_pending_count
    FROM public.events
    WHERE organization_id = p_organization_id
      AND status NOT IN ('cancelled', 'expired')
      AND event_status NOT IN ('CANCELLED', 'EXPIRED')
      AND (
        LOWER(status) = 'pending_payment'
        OR UPPER(payment_status) = 'PENDING_PAYMENT'
        OR UPPER(payment_status) = 'UNPAID'
      );

    IF v_pending_count >= v_max_limit THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'PENDING_EVENT_LIMIT_REACHED',
        'error', 'Maximum 2 pending payment events reached. Please pay for or delete an existing pending event.',
        'message', 'Maximum 2 pending payment events reached. Please pay for or delete an existing pending event.',
        'pending_count', v_pending_count,
        'max_limit', v_max_limit
      );
    END IF;
  END IF;

  -- 6. Generate collision-resistant unique public token
  v_token := p_public_token;
  IF v_token IS NULL OR TRIM(v_token) = '' THEN
    v_token := lower(encode(gen_random_bytes(6), 'hex'));
  END IF;

  WHILE EXISTS (SELECT 1 FROM public.events WHERE public_token = v_token) AND v_token_attempts < 10 LOOP
    v_token := lower(encode(gen_random_bytes(6), 'hex'));
    v_token_attempts := v_token_attempts + 1;
  END LOOP;

  v_event_id := COALESCE(p_event_id, gen_random_uuid());

  -- 7. Insert the event record atomically within the serialized transaction
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
    cancel_reason,
    event_price,
    event_currency,
    paid_amount,
    discount_amount,
    payment_mode,
    public_token,
    created_by,
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
    p_cancel_reason,
    COALESCE(p_event_price, 1400.00),
    COALESCE(p_event_currency, 'MYR'),
    COALESCE(p_paid_amount, 0.00),
    COALESCE(p_discount_amount, 0.00),
    p_payment_mode,
    v_token,
    p_created_by,
    v_now,
    v_now
  )
  RETURNING * INTO v_event;

  -- 8. Return successfully created event record
  RETURN jsonb_build_object(
    'success', true,
    'event', to_jsonb(v_event),
    'pending_count', v_pending_count + (CASE WHEN v_is_pending THEN 1 ELSE 0 END)
  );
END;
$$;

-- Security Permissions: Grant execute to service_role, revoke from client roles
GRANT EXECUTE ON FUNCTION public.create_event_atomic(UUID, UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, UUID, UUID, INT, BOOLEAN) TO service_role;
REVOKE EXECUTE ON FUNCTION public.create_event_atomic(UUID, UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, UUID, UUID, INT, BOOLEAN) FROM authenticated, anon, public;

-- ------------------------------------------------------------------------------
-- 2. DATABASE-LEVEL TRIGGER FOR DISTRIBUTED PENDING LIMIT ENFORCEMENT
-- Defense-in-depth trigger: Ensures that even direct table mutations via service_role
-- cannot bypass the maximum 2 pending events limit.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_event_pending_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pending_count INT;
  v_is_pending BOOLEAN;
BEGIN
  v_is_pending := (
    UPPER(COALESCE(NEW.payment_status, 'UNPAID')) IN ('PENDING_PAYMENT', 'UNPAID')
    OR LOWER(COALESCE(NEW.status, 'draft')) = 'pending_payment'
  );

  -- Only check if the event is entering or in pending state, and not cancelled/expired
  IF v_is_pending AND LOWER(COALESCE(NEW.status, 'draft')) NOT IN ('cancelled', 'expired') AND UPPER(COALESCE(NEW.event_status, 'DRAFT')) NOT IN ('CANCELLED', 'EXPIRED') THEN
    -- Lock organization to serialize concurrent inserts across workers
    PERFORM 1 FROM public.organizations WHERE id = NEW.organization_id FOR UPDATE;

    SELECT COUNT(*) INTO v_pending_count
    FROM public.events
    WHERE organization_id = NEW.organization_id
      AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND status NOT IN ('cancelled', 'expired')
      AND event_status NOT IN ('CANCELLED', 'EXPIRED')
      AND (
        LOWER(status) = 'pending_payment'
        OR UPPER(payment_status) = 'PENDING_PAYMENT'
        OR UPPER(payment_status) = 'UNPAID'
      );

    IF v_pending_count >= 2 THEN
      RAISE EXCEPTION 'PENDING_EVENT_LIMIT_REACHED: Maximum 2 pending payment events reached. Please pay for or delete an existing pending event.'
        USING ERRCODE = '23514'; -- check_violation
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
