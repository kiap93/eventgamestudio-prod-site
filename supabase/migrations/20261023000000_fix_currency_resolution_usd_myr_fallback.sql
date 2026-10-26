-- Migration: 20261023000000_fix_currency_resolution_usd_myr_fallback.sql
-- Description: Implement authoritative pricing-resolution policy with USD -> MYR fallback for unconfigured organizations
--              and fix create_event_atomic country code normalization.

-- 1. UPDATE calculate_event_authoritative_price
CREATE OR REPLACE FUNCTION public.calculate_event_authoritative_price(
  p_event_id UUID DEFAULT NULL,
  p_game_id UUID DEFAULT NULL,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL,
  p_pricing_id UUID DEFAULT NULL,
  p_country_code VARCHAR DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event RECORD;
  v_target_game_id UUID;
  v_start_date DATE;
  v_end_date DATE;
  v_duration_days INTEGER;
  v_pricing_id UUID := p_pricing_id;
  v_pricing_record RECORD;
  v_default_country VARCHAR := 'US';
  v_requested_country VARCHAR := NULL;
  v_expected_currency VARCHAR := 'USD';
  v_matching_count INTEGER := 0;
  v_us_active_tiers_count INTEGER := 0;
BEGIN
  -- If event_id is supplied, read authoritative attributes from event
  IF p_event_id IS NOT NULL THEN
    SELECT * INTO v_event FROM public.events WHERE id = p_event_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'EVENT_NOT_FOUND',
        'error', 'Event not found',
        'message', 'Event not found'
      );
    END IF;

    -- If event already has authoritative event_price and event_currency, return them directly
    IF v_event.event_price IS NOT NULL AND v_event.event_price > 0 AND v_event.event_currency IS NOT NULL THEN
      RETURN jsonb_build_object(
        'success', true,
        'price', v_event.event_price,
        'currency', v_event.event_currency,
        'duration_days', COALESCE(v_event.duration_days, 1),
        'is_custom_price', COALESCE(v_event.is_custom_price, false),
        'pricing_id', v_event.pricing_id,
        'requested_country', v_event.pricing_country,
        'pricing_country', v_event.pricing_country,
        'is_fallback', false,
        'fallback_level', 0
      );
    END IF;

    v_target_game_id := COALESCE(p_game_id, v_event.game_id);
    v_start_date := COALESCE(p_start_date, v_event.start_date, v_event.event_date);
    v_end_date := COALESCE(p_end_date, v_event.end_date, v_event.start_date, v_event.event_date);
  ELSE
    v_target_game_id := p_game_id;
    v_start_date := p_start_date;
    v_end_date := COALESCE(p_end_date, p_start_date);
  END IF;

  -- Validate target game exists
  IF v_target_game_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'GAME_NOT_FOUND',
      'error', 'Game ID is required to calculate pricing',
      'message', 'Game ID is required to calculate pricing'
    );
  END IF;

  -- Validate dates
  IF v_start_date IS NULL OR v_end_date IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'INVALID_EVENT_DATES',
      'error', 'Valid event start and end dates are required',
      'message', 'Valid event start and end dates are required'
    );
  END IF;

  IF v_end_date < v_start_date THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'INVALID_EVENT_DATES',
      'error', 'Event end_date must be on or after start_date',
      'message', 'Event end_date must be on or after start_date'
    );
  END IF;

  -- Inclusive calendar duration
  v_duration_days := (v_end_date - v_start_date) + 1;

  -- Resolve default country from platform settings if available
  BEGIN
    SELECT COALESCE(default_pricing_country, 'US')
    INTO v_default_country
    FROM public.platform_settings
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_default_country := 'US';
  END;

  IF v_default_country IS NULL OR TRIM(v_default_country) = '' THEN
    v_default_country := 'US';
  END IF;
  v_default_country := UPPER(TRIM(v_default_country));

  -- Normalize requested country
  IF p_country_code IS NOT NULL AND TRIM(p_country_code) <> '' THEN
    v_requested_country := UPPER(TRIM(p_country_code));
  END IF;

  -- =========================================================================
  -- PRIORITY A: Explicitly configured organization country
  -- =========================================================================
  IF v_requested_country IS NOT NULL THEN
    v_expected_currency := CASE v_requested_country
      WHEN 'MY' THEN 'MYR'
      WHEN 'SG' THEN 'SGD'
      WHEN 'US' THEN 'USD'
      WHEN 'GB' THEN 'GBP'
      WHEN 'EU' THEN 'EUR'
      WHEN 'DE' THEN 'EUR'
      WHEN 'FR' THEN 'EUR'
      WHEN 'JP' THEN 'JPY'
      WHEN 'AU' THEN 'AUD'
      ELSE 'USD'
    END;

    -- Look for exact matching tier for (game, country, expected_currency, duration)
    SELECT count(*)
    INTO v_matching_count
    FROM public.game_pricing
    WHERE game_id = v_target_game_id
      AND country_code = v_requested_country
      AND currency = v_expected_currency
      AND is_active = true
      AND price > 0
      AND min_days <= v_duration_days
      AND (max_days IS NULL OR max_days >= v_duration_days);

    IF v_matching_count > 1 THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'AMBIGUOUS_PRICING_TIER',
        'error', 'Multiple active pricing tiers match duration of ' || v_duration_days || ' days for this game in country ' || v_requested_country || ' (' || v_expected_currency || ').',
        'message', 'Multiple active pricing tiers match duration of ' || v_duration_days || ' days for this game in country ' || v_requested_country || ' (' || v_expected_currency || ').'
      );
    END IF;

    IF v_matching_count = 1 THEN
      SELECT id, game_id, price, currency, is_active, min_days, max_days, country_code
      INTO v_pricing_record
      FROM public.game_pricing
      WHERE game_id = v_target_game_id
        AND country_code = v_requested_country
        AND currency = v_expected_currency
        AND is_active = true
        AND price > 0
        AND min_days <= v_duration_days
        AND (max_days IS NULL OR max_days >= v_duration_days);

      IF v_pricing_id IS NOT NULL AND v_pricing_id != v_pricing_record.id THEN
        RETURN jsonb_build_object(
          'success', false,
          'code', 'PRICING_COUNTRY_MISMATCH',
          'error', 'The specified pricing tier does not match the authoritative pricing tier for your country and duration.',
          'message', 'The specified pricing tier does not match the authoritative pricing tier for your country and duration.'
        );
      END IF;

      RETURN jsonb_build_object(
        'success', true,
        'price', v_pricing_record.price,
        'currency', v_pricing_record.currency,
        'duration_days', v_duration_days,
        'is_custom_price', false,
        'pricing_id', v_pricing_record.id,
        'requested_country', v_requested_country,
        'pricing_country', v_requested_country,
        'is_fallback', false,
        'fallback_level', 0
      );
    END IF;

    -- Strict fail-closed for primary markets US and MY
    IF v_requested_country IN ('US', 'MY') THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'NO_PRICING_TIER',
        'error', 'No pricing tier is configured for a ' || v_duration_days || '-day event for this game in country ' || v_requested_country || '.',
        'message', 'No pricing tier is configured for a ' || v_duration_days || '-day event for this game in country ' || v_requested_country || '.',
        'requested_country', v_requested_country,
        'pricing_country', NULL,
        'default_country', v_default_country
      );
    END IF;

    -- Non-primary international country lacking domestic tiers (e.g. VN, FR):
    -- Check if default country (US) has ANY active tiers for this game
    SELECT count(*)
    INTO v_us_active_tiers_count
    FROM public.game_pricing
    WHERE game_id = v_target_game_id
      AND country_code = v_default_country
      AND currency = 'USD'
      AND is_active = true
      AND price > 0;

    IF v_us_active_tiers_count > 0 THEN
      -- Case A: US has active pricing for this game -> US is the sole fallback market
      SELECT count(*)
      INTO v_matching_count
      FROM public.game_pricing
      WHERE game_id = v_target_game_id
        AND country_code = v_default_country
        AND currency = 'USD'
        AND is_active = true
        AND price > 0
        AND min_days <= v_duration_days
        AND (max_days IS NULL OR max_days >= v_duration_days);

      IF v_matching_count > 1 THEN
        RETURN jsonb_build_object(
          'success', false,
          'code', 'AMBIGUOUS_PRICING_TIER',
          'error', 'Multiple active fallback pricing tiers match duration of ' || v_duration_days || ' days for this game in default country ' || v_default_country || '.',
          'message', 'Multiple active fallback pricing tiers match duration of ' || v_duration_days || ' days for this game in default country ' || v_default_country || '.'
        );
      END IF;

      IF v_matching_count = 1 THEN
        SELECT id, game_id, price, currency, is_active, min_days, max_days, country_code
        INTO v_pricing_record
        FROM public.game_pricing
        WHERE game_id = v_target_game_id
          AND country_code = v_default_country
          AND currency = 'USD'
          AND is_active = true
          AND price > 0
          AND min_days <= v_duration_days
          AND (max_days IS NULL OR max_days >= v_duration_days);

        IF v_pricing_id IS NOT NULL AND v_pricing_id != v_pricing_record.id THEN
          RETURN jsonb_build_object(
            'success', false,
            'code', 'PRICING_COUNTRY_MISMATCH',
            'error', 'The specified pricing tier does not match the authoritative pricing tier for your country and duration.',
            'message', 'The specified pricing tier does not match the authoritative pricing tier for your country and duration.'
          );
        END IF;

        RETURN jsonb_build_object(
          'success', true,
          'price', v_pricing_record.price,
          'currency', v_pricing_record.currency,
          'duration_days', v_duration_days,
          'is_custom_price', false,
          'pricing_id', v_pricing_record.id,
          'requested_country', v_requested_country,
          'pricing_country', v_default_country,
          'is_fallback', true,
          'fallback_level', 1
        );
      END IF;

      -- US has tiers for this game but none for this duration -> fail closed (MUST NOT fall through to MY)
      RETURN jsonb_build_object(
        'success', false,
        'code', 'NO_PRICING_TIER',
        'error', 'No pricing tier is configured for a ' || v_duration_days || '-day event for this game.',
        'message', 'No pricing tier is configured for a ' || v_duration_days || '-day event for this game.',
        'requested_country', v_requested_country,
        'pricing_country', NULL,
        'default_country', v_default_country
      );
    ELSE
      -- Case B: US has ZERO active tiers for this game -> secondary fallback MY
      SELECT count(*)
      INTO v_matching_count
      FROM public.game_pricing
      WHERE game_id = v_target_game_id
        AND country_code = 'MY'
        AND currency = 'MYR'
        AND is_active = true
        AND price > 0
        AND min_days <= v_duration_days
        AND (max_days IS NULL OR max_days >= v_duration_days);

      IF v_matching_count > 1 THEN
        RETURN jsonb_build_object(
          'success', false,
          'code', 'AMBIGUOUS_PRICING_TIER',
          'error', 'Multiple active fallback pricing tiers match duration of ' || v_duration_days || ' days for this game in secondary fallback country MY.',
          'message', 'Multiple active fallback pricing tiers match duration of ' || v_duration_days || ' days for this game in secondary fallback country MY.'
        );
      END IF;

      IF v_matching_count = 1 THEN
        SELECT id, game_id, price, currency, is_active, min_days, max_days, country_code
        INTO v_pricing_record
        FROM public.game_pricing
        WHERE game_id = v_target_game_id
          AND country_code = 'MY'
          AND currency = 'MYR'
          AND is_active = true
          AND price > 0
          AND min_days <= v_duration_days
          AND (max_days IS NULL OR max_days >= v_duration_days);

        IF v_pricing_id IS NOT NULL AND v_pricing_id != v_pricing_record.id THEN
          RETURN jsonb_build_object(
            'success', false,
            'code', 'PRICING_COUNTRY_MISMATCH',
            'error', 'The specified pricing tier does not match the authoritative pricing tier for your country and duration.',
            'message', 'The specified pricing tier does not match the authoritative pricing tier for your country and duration.'
          );
        END IF;

        RETURN jsonb_build_object(
          'success', true,
          'price', v_pricing_record.price,
          'currency', v_pricing_record.currency,
          'duration_days', v_duration_days,
          'is_custom_price', false,
          'pricing_id', v_pricing_record.id,
          'requested_country', v_requested_country,
          'pricing_country', 'MY',
          'is_fallback', true,
          'fallback_level', 2
        );
      END IF;

      RETURN jsonb_build_object(
        'success', false,
        'code', 'NO_PRICING_TIER',
        'error', 'No pricing tier is configured for a ' || v_duration_days || '-day event for this game.',
        'message', 'No pricing tier is configured for a ' || v_duration_days || '-day event for this game.',
        'requested_country', v_requested_country,
        'pricing_country', NULL,
        'default_country', v_default_country
      );
    END IF;
  END IF;

  -- =========================================================================
  -- PRIORITY B: Organization has NO configured country setting
  -- Attempt default pricing country (US / USD) for the requested duration.
  -- =========================================================================
  SELECT count(*)
  INTO v_matching_count
  FROM public.game_pricing
  WHERE game_id = v_target_game_id
    AND country_code = v_default_country
    AND currency = 'USD'
    AND is_active = true
    AND price > 0
    AND min_days <= v_duration_days
    AND (max_days IS NULL OR max_days >= v_duration_days);

  IF v_matching_count > 1 THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'AMBIGUOUS_PRICING_TIER',
      'error', 'Multiple active fallback pricing tiers match duration of ' || v_duration_days || ' days for this game in default country ' || v_default_country || '.',
      'message', 'Multiple active fallback pricing tiers match duration of ' || v_duration_days || ' days for this game in default country ' || v_default_country || '.'
    );
  END IF;

  IF v_matching_count = 1 THEN
    SELECT id, game_id, price, currency, is_active, min_days, max_days, country_code
    INTO v_pricing_record
    FROM public.game_pricing
    WHERE game_id = v_target_game_id
      AND country_code = v_default_country
      AND currency = 'USD'
      AND is_active = true
      AND price > 0
      AND min_days <= v_duration_days
      AND (max_days IS NULL OR max_days >= v_duration_days);

    IF v_pricing_id IS NOT NULL AND v_pricing_id != v_pricing_record.id THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'PRICING_COUNTRY_MISMATCH',
        'error', 'The specified pricing tier does not match the authoritative pricing tier for your country and duration.',
        'message', 'The specified pricing tier does not match the authoritative pricing tier for your country and duration.'
      );
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'price', v_pricing_record.price,
      'currency', v_pricing_record.currency,
      'duration_days', v_duration_days,
      'is_custom_price', false,
      'pricing_id', v_pricing_record.id,
      'requested_country', v_default_country,
      'pricing_country', v_default_country,
      'is_fallback', true,
      'fallback_level', 1
    );
  END IF;

  -- =========================================================================
  -- PRIORITY C: MYR fallback for unconfigured organizations
  -- If default country has no matching tier for the selected duration
  -- (even if it has tiers for other durations!), continue to MYR fallback.
  -- =========================================================================
  SELECT count(*)
  INTO v_matching_count
  FROM public.game_pricing
  WHERE game_id = v_target_game_id
    AND country_code = 'MY'
    AND currency = 'MYR'
    AND is_active = true
    AND price > 0
    AND min_days <= v_duration_days
    AND (max_days IS NULL OR max_days >= v_duration_days);

  IF v_matching_count > 1 THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'AMBIGUOUS_PRICING_TIER',
      'error', 'Multiple active fallback pricing tiers match duration of ' || v_duration_days || ' days for this game in secondary fallback country MY.',
      'message', 'Multiple active fallback pricing tiers match duration of ' || v_duration_days || ' days for this game in secondary fallback country MY.'
    );
  END IF;

  IF v_matching_count = 1 THEN
    SELECT id, game_id, price, currency, is_active, min_days, max_days, country_code
    INTO v_pricing_record
    FROM public.game_pricing
    WHERE game_id = v_target_game_id
      AND country_code = 'MY'
      AND currency = 'MYR'
      AND is_active = true
      AND price > 0
      AND min_days <= v_duration_days
      AND (max_days IS NULL OR max_days >= v_duration_days);

    IF v_pricing_id IS NOT NULL AND v_pricing_id != v_pricing_record.id THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'PRICING_COUNTRY_MISMATCH',
        'error', 'The specified pricing tier does not match the authoritative pricing tier for your country and duration.',
        'message', 'The specified pricing tier does not match the authoritative pricing tier for your country and duration.'
      );
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'price', v_pricing_record.price,
      'currency', v_pricing_record.currency,
      'duration_days', v_duration_days,
      'is_custom_price', false,
      'pricing_id', v_pricing_record.id,
      'requested_country', v_default_country,
      'pricing_country', 'MY',
      'is_fallback', true,
      'fallback_level', 2
    );
  END IF;

  -- =========================================================================
  -- PRIORITY D: No valid tier anywhere
  -- =========================================================================
  RETURN jsonb_build_object(
    'success', false,
    'code', 'NO_PRICING_TIER',
    'error', 'No pricing tier is configured for a ' || v_duration_days || '-day event for this game.',
    'message', 'No pricing tier is configured for a ' || v_duration_days || '-day event for this game.',
    'requested_country', COALESCE(v_requested_country, v_default_country),
    'pricing_country', NULL,
    'default_country', v_default_country
  );
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.calculate_event_authoritative_price(UUID, UUID, DATE, DATE, UUID, VARCHAR) TO authenticated, service_role;

-- 2. UPDATE create_event_atomic TO PRESERVE NULL ORG COUNTRY INSTEAD OF COALESCING TO 'US'
CREATE OR REPLACE FUNCTION public.create_event_atomic(
  p_organization_id UUID,
  p_game_theme_id UUID,
  p_name VARCHAR,
  p_start_date VARCHAR,
  p_end_date VARCHAR,
  p_starts_at TIMESTAMPTZ,
  p_expires_at TIMESTAMPTZ,
  p_game_id UUID DEFAULT NULL,
  p_event_date VARCHAR DEFAULT NULL,
  p_status VARCHAR DEFAULT 'draft',
  p_event_status VARCHAR DEFAULT 'DRAFT',
  p_payment_status VARCHAR DEFAULT 'UNPAID',
  p_cancel_reason TEXT DEFAULT NULL,
  p_event_price NUMERIC DEFAULT NULL,
  p_event_currency VARCHAR DEFAULT NULL,
  p_paid_amount NUMERIC DEFAULT 0,
  p_discount_amount NUMERIC DEFAULT 0,
  p_payment_mode VARCHAR DEFAULT NULL,
  p_public_token VARCHAR DEFAULT NULL,
  p_created_by UUID DEFAULT NULL,
  p_event_id UUID DEFAULT NULL,
  p_max_pending_events INTEGER DEFAULT 5,
  p_skip_pending_limit_check BOOLEAN DEFAULT false,
  p_event_timezone VARCHAR DEFAULT 'Asia/Singapore',
  p_pricing_id UUID DEFAULT NULL,
  p_duration_days INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org RECORD;
  v_theme RECORD;
  v_game RECORD;
  v_target_game_id UUID;
  v_start_date DATE;
  v_end_date DATE;
  v_event_timezone VARCHAR;
  v_calculated_days INTEGER;
  v_duration_days INTEGER := p_duration_days;
  v_pending_count INTEGER;
  v_event_id UUID;
  v_public_token VARCHAR;
  v_now TIMESTAMPTZ := clock_timestamp();
  v_org_country VARCHAR;
  v_price_quote JSONB;
  v_resolved_price NUMERIC;
  v_resolved_currency VARCHAR;
  v_pricing_id UUID := p_pricing_id;
  v_pricing_country VARCHAR := NULL;
  v_new_event RECORD;
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

  -- Only uppercase when present; keep NULL if unconfigured to allow USD -> MYR fallback
  IF v_org.country_code IS NOT NULL AND TRIM(v_org.country_code) <> '' THEN
    v_org_country := UPPER(TRIM(v_org.country_code));
  ELSE
    v_org_country := NULL;
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
        'error', COALESCE(v_price_quote->>'error', 'No pricing tier is configured for a ' || v_duration_days || '-day event for this game.')
      );
    END IF;

    v_resolved_price := (v_price_quote->>'price')::numeric;
    v_resolved_currency := UPPER(TRIM(v_price_quote->>'currency'));
    IF v_pricing_id IS NULL AND v_price_quote->>'pricing_id' IS NOT NULL THEN
      v_pricing_id := (v_price_quote->>'pricing_id')::uuid;
    END IF;
    v_pricing_country := v_price_quote->>'pricing_country';
  END IF;

  -- 6. Check Pending Unpaid Event Limit (max allowed per organization)
  IF NOT p_skip_pending_limit_check AND (p_payment_status = 'UNPAID' OR p_status = 'pending_payment') THEN
    SELECT count(*) INTO v_pending_count
    FROM public.events
    WHERE organization_id = p_organization_id
      AND payment_status = 'UNPAID'
      AND status <> 'cancelled'
      AND event_status <> 'EXPIRED'
      AND status <> 'expired';

    IF v_pending_count >= p_max_pending_events THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'PENDING_EVENT_LIMIT_REACHED',
        'error', 'Maximum ' || p_max_pending_events || ' pending payment events reached. Please pay for or delete an existing pending event.'
      );
    END IF;
  END IF;

  -- 7. Generate Event ID and Public Token
  v_event_id := COALESCE(p_event_id, gen_random_uuid());
  v_public_token := COALESCE(NULLIF(TRIM(p_public_token), ''), encode(gen_random_bytes(16), 'hex'));

  -- 8. Insert Event Record
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
    updated_at,
    event_timezone,
    pricing_id,
    duration_days,
    pricing_country
  ) VALUES (
    v_event_id,
    p_organization_id,
    v_target_game_id,
    p_game_theme_id,
    TRIM(p_name),
    v_start_date,
    v_start_date,
    v_end_date,
    COALESCE(p_starts_at, (v_start_date::text || ' 00:00:00')::timestamp AT TIME ZONE v_event_timezone),
    COALESCE(p_expires_at, (v_end_date::text || ' 23:59:59.999')::timestamp AT TIME ZONE v_event_timezone),
    p_status,
    p_event_status,
    p_payment_status,
    p_cancel_reason,
    v_resolved_price,
    v_resolved_currency,
    p_paid_amount,
    p_discount_amount,
    p_payment_mode,
    v_public_token,
    p_created_by,
    v_now,
    v_now,
    v_event_timezone,
    v_pricing_id,
    v_duration_days,
    v_pricing_country
  )
  RETURNING * INTO v_new_event;

  RETURN jsonb_build_object(
    'success', true,
    'event', row_to_json(v_new_event)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_event_atomic(
  UUID, UUID, VARCHAR, VARCHAR, VARCHAR, TIMESTAMPTZ, TIMESTAMPTZ, UUID, VARCHAR,
  VARCHAR, VARCHAR, VARCHAR, TEXT, NUMERIC, VARCHAR, NUMERIC, NUMERIC, VARCHAR,
  VARCHAR, UUID, UUID, INTEGER, BOOLEAN, VARCHAR, UUID, INTEGER
) TO authenticated, service_role;
