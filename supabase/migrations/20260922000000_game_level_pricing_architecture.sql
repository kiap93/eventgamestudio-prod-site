-- Migration: 20260922000000_game_level_pricing_architecture.sql
-- Description: Establishes game-level pricing ownership, game_pricing table,
--              event pricing snapshots (pricing_id, duration_days),
--              and updates create_event_atomic RPC.
-- Architecture: Strategy B post-baseline forward migration.

BEGIN;

-- 1. CREATE game_pricing TABLE
CREATE TABLE IF NOT EXISTS public.game_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  min_days INT NOT NULL CHECK (min_days >= 1),
  max_days INT CHECK (max_days IS NULL OR max_days >= min_days),
  price NUMERIC(10, 2) NOT NULL CHECK (price > 0),
  currency TEXT NOT NULL DEFAULT 'MYR',
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_base BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Indexes for game_pricing
CREATE INDEX IF NOT EXISTS idx_game_pricing_game_id ON public.game_pricing(game_id);
CREATE INDEX IF NOT EXISTS idx_game_pricing_active ON public.game_pricing(is_active);
CREATE INDEX IF NOT EXISTS idx_game_pricing_game_days ON public.game_pricing(game_id, min_days, max_days);
CREATE INDEX IF NOT EXISTS idx_game_pricing_is_base ON public.game_pricing(game_id, is_base) WHERE is_base = true;

-- 2. ENABLE ROW LEVEL SECURITY ON game_pricing
ALTER TABLE public.game_pricing ENABLE ROW LEVEL SECURITY;

-- Allow public and authenticated users to view active game pricing
DROP POLICY IF EXISTS "Anyone can view active game pricing" ON public.game_pricing;
CREATE POLICY "Anyone can view active game pricing"
  ON public.game_pricing
  FOR SELECT
  USING (true);

-- Allow service_role full access to manage game pricing
DROP POLICY IF EXISTS "Service role can manage game pricing" ON public.game_pricing;
CREATE POLICY "Service role can manage game pricing"
  ON public.game_pricing
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Allow developer admins to manage game pricing
DROP POLICY IF EXISTS "Developer admins can manage game pricing" ON public.game_pricing;
CREATE POLICY "Developer admins can manage game pricing"
  ON public.game_pricing
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
        AND (users.is_developer = true OR users.role = 'developer')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
        AND (users.is_developer = true OR users.role = 'developer')
    )
  );

-- 3. ADD SNAPSHOT COLUMNS TO public.events
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS pricing_id UUID REFERENCES public.game_pricing(id) ON DELETE SET NULL;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS duration_days INT;

CREATE INDEX IF NOT EXISTS idx_events_pricing_id ON public.events(pricing_id);

-- 4. SEED / MIGRATE INITIAL GAME PRICING TIERS
-- Catch the Brand (or Default) Pricing:
-- Base 1 day: RM1,400 | 2d: RM1,900 | 3d: RM2,200 | 4d: RM2,400 | 5d: RM2,500 | 6d: RM2,600 | 7d: RM2,800
-- 8-14d: RM3,500 | 15-30d: RM4,500 | 31-60d: RM6,000 | 61-90d: RM8,000 | 91+d: RM10,000
--
-- Brand Memory Match Pricing:
-- Base 1 day: RM1,200 | 2d: RM1,600 | 3d: RM1,900 | 4d: RM2,100 | 5d: RM2,300 | 6d: RM2,400 | 7d: RM2,600
-- 8-14d: RM3,200 | 15-30d: RM4,200 | 31-60d: RM5,500 | 61-90d: RM7,500 | 91+d: RM9,500
--
-- Formula Reaction Lights Pricing:
-- Base 1 day: RM1,000 | 2d: RM1,400 | 3d: RM1,700 | 4d: RM1,900 | 5d: RM2,000 | 6d: RM2,200 | 7d: RM2,400
-- 8-14d: RM3,000 | 15-30d: RM4,000 | 31-60d: RM5,000 | 61-90d: RM7,000 | 91+d: RM9,000

DO $$
DECLARE
  v_game RECORD;
  v_is_catch BOOLEAN;
  v_is_memory BOOLEAN;
  v_is_reaction BOOLEAN;
BEGIN
  FOR v_game IN SELECT id, slug, game_type FROM public.games LOOP
    -- Only seed if no pricing tiers exist for this game yet
    IF NOT EXISTS (SELECT 1 FROM public.game_pricing WHERE game_id = v_game.id) THEN
      v_is_memory := (LOWER(COALESCE(v_game.slug, '')) = 'memory-match' OR LOWER(COALESCE(v_game.game_type, '')) = 'memory-match');
      v_is_reaction := (LOWER(COALESCE(v_game.slug, '')) IN ('reaction-tap', 'reaction-time') OR LOWER(COALESCE(v_game.game_type, '')) IN ('reaction-tap', 'reaction-time'));

      IF v_is_memory THEN
        INSERT INTO public.game_pricing (game_id, min_days, max_days, price, currency, is_active, is_base) VALUES
          (v_game.id, 1, 1, 1200.00, 'MYR', true, true),
          (v_game.id, 2, 2, 1600.00, 'MYR', true, false),
          (v_game.id, 3, 3, 1900.00, 'MYR', true, false),
          (v_game.id, 4, 4, 2100.00, 'MYR', true, false),
          (v_game.id, 5, 5, 2300.00, 'MYR', true, false),
          (v_game.id, 6, 6, 2400.00, 'MYR', true, false),
          (v_game.id, 7, 7, 2600.00, 'MYR', true, false),
          (v_game.id, 8, 14, 3200.00, 'MYR', true, false),
          (v_game.id, 15, 30, 4200.00, 'MYR', true, false),
          (v_game.id, 31, 60, 5500.00, 'MYR', true, false),
          (v_game.id, 61, 90, 7500.00, 'MYR', true, false),
          (v_game.id, 91, NULL, 9500.00, 'MYR', true, false);
      ELSIF v_is_reaction THEN
        INSERT INTO public.game_pricing (game_id, min_days, max_days, price, currency, is_active, is_base) VALUES
          (v_game.id, 1, 1, 1000.00, 'MYR', true, true),
          (v_game.id, 2, 2, 1400.00, 'MYR', true, false),
          (v_game.id, 3, 3, 1700.00, 'MYR', true, false),
          (v_game.id, 4, 4, 1900.00, 'MYR', true, false),
          (v_game.id, 5, 5, 2000.00, 'MYR', true, false),
          (v_game.id, 6, 6, 2200.00, 'MYR', true, false),
          (v_game.id, 7, 7, 2400.00, 'MYR', true, false),
          (v_game.id, 8, 14, 3000.00, 'MYR', true, false),
          (v_game.id, 15, 30, 4000.00, 'MYR', true, false),
          (v_game.id, 31, 60, 5000.00, 'MYR', true, false),
          (v_game.id, 61, 90, 7000.00, 'MYR', true, false),
          (v_game.id, 91, NULL, 9000.00, 'MYR', true, false);
      ELSE
        -- Default (Catch the Brand or generic standard)
        INSERT INTO public.game_pricing (game_id, min_days, max_days, price, currency, is_active, is_base) VALUES
          (v_game.id, 1, 1, 1400.00, 'MYR', true, true),
          (v_game.id, 2, 2, 1900.00, 'MYR', true, false),
          (v_game.id, 3, 3, 2200.00, 'MYR', true, false),
          (v_game.id, 4, 4, 2400.00, 'MYR', true, false),
          (v_game.id, 5, 5, 2500.00, 'MYR', true, false),
          (v_game.id, 6, 6, 2600.00, 'MYR', true, false),
          (v_game.id, 7, 7, 2800.00, 'MYR', true, false),
          (v_game.id, 8, 14, 3500.00, 'MYR', true, false),
          (v_game.id, 15, 30, 4500.00, 'MYR', true, false),
          (v_game.id, 31, 60, 6000.00, 'MYR', true, false),
          (v_game.id, 61, 90, 8000.00, 'MYR', true, false),
          (v_game.id, 91, NULL, 10000.00, 'MYR', true, false);
      END IF;
    END IF;
  END LOOP;
END $$;

-- 5. BACKFILL DURATION_DAYS ON EXISTING EVENTS (WITHOUT OVERWRITING EVENT_PRICE)
-- If start_date and end_date exist: compute calendar days
DO $$
DECLARE
  v_ev RECORD;
  v_days INT;
  v_matched_pricing_id UUID;
BEGIN
  FOR v_ev IN 
    SELECT id, game_id, start_date, end_date, event_date, starts_at, expires_at 
    FROM public.events 
    WHERE duration_days IS NULL
  LOOP
    BEGIN
      IF v_ev.start_date IS NOT NULL AND v_ev.end_date IS NOT NULL THEN
        v_days := GREATEST(1, (v_ev.end_date::date - v_ev.start_date::date) + 1);
      ELSIF v_ev.starts_at IS NOT NULL AND v_ev.expires_at IS NOT NULL THEN
        v_days := GREATEST(1, (DATE(v_ev.expires_at) - DATE(v_ev.starts_at)) + 1);
      ELSE
        v_days := 1;
      END IF;

      -- Try to find matching pricing tier for this event's game and duration
      IF v_ev.game_id IS NOT NULL THEN
        SELECT id INTO v_matched_pricing_id
        FROM public.game_pricing
        WHERE game_id = v_ev.game_id
          AND is_active = true
          AND min_days <= v_days
          AND (max_days IS NULL OR max_days >= v_days)
        ORDER BY min_days ASC
        LIMIT 1;
      ELSE
        v_matched_pricing_id := NULL;
      END IF;

      UPDATE public.events
      SET duration_days = v_days,
          pricing_id = COALESCE(pricing_id, v_matched_pricing_id)
      WHERE id = v_ev.id;
    EXCEPTION WHEN OTHERS THEN
      -- If date parsing fails, default duration_days to 1
      UPDATE public.events SET duration_days = 1 WHERE id = v_ev.id;
    END;
  END LOOP;
END $$;

-- 6. UPDATE create_event_atomic RPC TO SUPPORT pricing_id AND duration_days
-- Drop older overloads cleanly to avoid ambiguous signature errors
DROP FUNCTION IF EXISTS public.create_event_atomic(
  UUID, UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, UUID, UUID, INT, BOOLEAN, TEXT
);
DROP FUNCTION IF EXISTS public.create_event_atomic(
  UUID, TEXT, UUID, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, BOOLEAN, NUMERIC, TEXT, TEXT, UUID, UUID, INT, BOOLEAN, TEXT
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
      'error', 'Only organization themes can be used for events.',
      'message', 'Only organization themes can be used for events.'
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

  -- Resolve pricing_id if not provided
  IF v_pricing_id IS NULL THEN
    SELECT id INTO v_pricing_id
    FROM public.game_pricing
    WHERE game_id = v_target_game_id
      AND is_active = true
      AND min_days <= v_duration_days
      AND (max_days IS NULL OR max_days >= v_duration_days)
    ORDER BY min_days ASC
    LIMIT 1;
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

  -- 7. Public Token Generation
  IF p_public_token IS NOT NULL AND TRIM(p_public_token) <> '' THEN
    v_token := TRIM(p_public_token);
  ELSE
    LOOP
      v_token_attempts := v_token_attempts + 1;
      v_token := LOWER(SUBSTRING(MD5(RANDOM()::TEXT || clock_timestamp()::TEXT) FROM 1 FOR 10));
      PERFORM 1 FROM public.events WHERE public_token = v_token;
      IF NOT FOUND THEN
        EXIT;
      END IF;
      IF v_token_attempts > 10 THEN
        v_token := REPLACE(gen_random_uuid()::TEXT, '-', '');
        EXIT;
      END IF;
    END LOOP;
  END IF;

  v_event_id := COALESCE(p_event_id, gen_random_uuid());

  -- 8. Insert the event with pricing snapshot
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
    COALESCE(p_event_price, 1400.00),
    COALESCE(p_event_currency, 'MYR'),
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

COMMIT;
