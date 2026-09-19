-- Migration: 20260919000000_fix_create_event_atomic_overload_and_error_handling.sql
-- Description: Drops legacy 23-parameter create_event_atomic overload to resolve PGRST202 ambiguity,
--              and updates create_event_atomic with search_path = public, extensions.

BEGIN;

-- 1. Drop the legacy 23-parameter overload of create_event_atomic if it still exists
DROP FUNCTION IF EXISTS public.create_event_atomic(
  UUID, UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, UUID, UUID, INT, BOOLEAN
);

-- 2. Define canonical 24-parameter create_event_atomic with search_path = public, extensions
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

  IF p_game_theme_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'VALIDATION_ERROR',
      'error', 'Game Theme selection is required',
      'message', 'Game Theme selection is required'
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

  IF v_game.status = 'inactive' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'GAME_INACTIVE',
      'error', 'This game is currently inactive and cannot be selected for new events.',
      'message', 'This game is currently inactive and cannot be selected for new events.'
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
        'error', 'Maximum ' || v_max_limit || ' pending payment events reached. Please pay for or delete an existing pending event.',
        'message', 'Maximum ' || v_max_limit || ' pending payment events reached. Please pay for or delete an existing pending event.',
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
    event_timezone,
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
    v_event_timezone,
    v_now,
    v_now
  )
  RETURNING * INTO v_event;

  RETURN jsonb_build_object(
    'success', true,
    'event', row_to_json(v_event)
  );

EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE '%PENDING_EVENT_LIMIT_REACHED%' OR SQLSTATE = '23514' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'PENDING_EVENT_LIMIT_REACHED',
      'error', 'Maximum ' || v_max_limit || ' pending payment events reached. Please pay for or delete an existing pending event.',
      'message', 'Maximum ' || v_max_limit || ' pending payment events reached. Please pay for or delete an existing pending event.',
      'pending_count', v_pending_count,
      'max_limit', v_max_limit
    );
  END IF;

  RETURN jsonb_build_object(
    'success', false,
    'code', 'EVENT_CREATION_FAILED',
    'error', SQLERRM,
    'message', SQLERRM
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_event_atomic(
  UUID, UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, UUID, UUID, INT, BOOLEAN, TEXT
) TO service_role;

REVOKE EXECUTE ON FUNCTION public.create_event_atomic(
  UUID, UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, UUID, UUID, INT, BOOLEAN, TEXT
) FROM authenticated, anon, public;

COMMIT;
