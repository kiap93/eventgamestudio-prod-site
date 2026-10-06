-- ==============================================================================
-- Migration: 20261011000000_country_based_game_pricing_with_fallback.sql
-- Description: Adds country_code to public.game_pricing, configures
--              DEFAULT_PRICING_COUNTRY in platform_settings, updates
--              validate_game_pricing_overlap trigger per (game_id, country_code),
--              and updates calculate_event_authoritative_price with country fallback.
--
-- Business Rules:
--   1. Pricing tiers belong to a specific ISO 3166-1 alpha-2 country (e.g., 'MY', 'US').
--   2. Existing pricing records default to 'MY' and currency 'MYR'.
--   3. Default pricing country defaults to 'US' in platform_settings.
--   4. Duration ranges must not overlap within the SAME game and SAME country.
--      Different countries can have independent duration pricing tiers for the same game.
--   5. Price resolution: Requested Country -> Fallback to DEFAULT_PRICING_COUNTRY -> Fail closed / Contact Us.
-- ==============================================================================

-- 1. Add country_code to public.game_pricing
ALTER TABLE public.game_pricing
  ADD COLUMN IF NOT EXISTS country_code VARCHAR(2) NOT NULL DEFAULT 'MY';

-- 2. Indexes for country-based pricing
CREATE INDEX IF NOT EXISTS idx_game_pricing_country
  ON public.game_pricing(country_code);

CREATE INDEX IF NOT EXISTS idx_game_pricing_game_country_days
  ON public.game_pricing(game_id, country_code, min_days, max_days);

-- 3. Update validate_game_pricing_overlap trigger function to be country-aware
CREATE OR REPLACE FUNCTION public.validate_game_pricing_overlap()
RETURNS TRIGGER AS $$
DECLARE
  v_conflicting RECORD;
BEGIN
  -- Only validate if the row being inserted or updated is active
  IF NEW.is_active = true THEN
    -- Check minimum and maximum day bounds
    IF NEW.min_days < 1 THEN
      RAISE EXCEPTION 'Minimum days must be an integer >= 1'
        USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.max_days IS NOT NULL AND NEW.max_days < NEW.min_days THEN
      RAISE EXCEPTION 'Maximum days must be greater than or equal to minimum days'
        USING ERRCODE = 'check_violation';
    END IF;

    -- Look for any other active pricing tier for the same game and same country that overlaps
    SELECT id, min_days, max_days, price, currency, country_code
    INTO v_conflicting
    FROM public.game_pricing
    WHERE game_id = NEW.game_id
      AND country_code = COALESCE(NEW.country_code, 'MY')
      AND is_active = true
      AND (NEW.id IS NULL OR id != NEW.id)
      AND (
        -- Overlap logic: A_min <= B_max AND B_min <= A_max
        NEW.min_days <= COALESCE(max_days, 2147483647)
        AND min_days <= COALESCE(NEW.max_days, 2147483647)
      )
    LIMIT 1;

    IF v_conflicting.id IS NOT NULL THEN
      RAISE EXCEPTION 'OVERLAPPING_PRICING_TIER: Pricing tier range (%–% days) for country % overlaps with existing active tier (%–% days) for this game.',
        NEW.min_days,
        COALESCE(NEW.max_days::text, '+'),
        COALESCE(NEW.country_code, 'MY'),
        v_conflicting.min_days,
        COALESCE(v_conflicting.max_days::text, '+')
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Ensure trigger is attached
DROP TRIGGER IF EXISTS trg_validate_game_pricing_overlap ON public.game_pricing;
CREATE TRIGGER trg_validate_game_pricing_overlap
  BEFORE INSERT OR UPDATE ON public.game_pricing
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_game_pricing_overlap();

-- 4. Configure DEFAULT_PRICING_COUNTRY in public.platform_settings
INSERT INTO public.platform_settings (key, value, description, updated_at)
VALUES (
  'default_pricing_country',
  '"US"'::jsonb,
  'Default fallback ISO 3166-1 alpha-2 country code for game pricing when country-specific pricing does not exist',
  timezone('utc'::text, now())
)
ON CONFLICT (key) DO NOTHING;

-- Also update event_pricing setting to record default_country if not present
UPDATE public.platform_settings
SET value = jsonb_set(value, '{default_country}', '"US"'::jsonb, true)
WHERE key = 'event_pricing'
  AND NOT (value ? 'default_country');

-- 5. Update calculate_event_authoritative_price with country-based resolution and fallback
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
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event RECORD;
  v_target_game_id UUID;
  v_start_date DATE;
  v_end_date DATE;
  v_pricing_id UUID;
  v_duration_days INT;
  v_pricing_record RECORD;
  v_matching_count INT;
  v_resolved_price NUMERIC(10, 2);
  v_resolved_currency TEXT := 'MYR';
  v_is_custom_price BOOLEAN := false;
  v_requested_country TEXT;
  v_default_country TEXT := 'US';
  v_pricing_country TEXT;
  v_is_fallback BOOLEAN := false;
  v_settings_val JSONB;
BEGIN
  -- Retrieve default pricing country from platform_settings
  SELECT value INTO v_settings_val
  FROM public.platform_settings
  WHERE key = 'default_pricing_country';

  IF v_settings_val IS NOT NULL THEN
    v_default_country := TRIM(BOTH '"' FROM v_settings_val::text);
  ELSE
    SELECT value->>'default_country' INTO v_default_country
    FROM public.platform_settings
    WHERE key = 'event_pricing';
    IF v_default_country IS NULL OR v_default_country = '' THEN
      v_default_country := 'US';
    END IF;
  END IF;

  v_default_country := UPPER(TRIM(v_default_country));

  -- Load event if p_event_id provided
  IF p_event_id IS NOT NULL THEN
    SELECT e.id, e.game_id, e.start_date, e.end_date, e.starts_at, e.expires_at,
           e.pricing_id, e.is_custom_price, e.event_price, e.event_currency, e.duration_days,
           o.country_code AS org_country_code
    INTO v_event
    FROM public.events e
    LEFT JOIN public.organizations o ON o.id = e.organization_id
    WHERE e.id = p_event_id;

    IF v_event.id IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'EVENT_NOT_FOUND',
        'error', 'Event not found.'
      );
    END IF;

    v_target_game_id := COALESCE(p_game_id, v_event.game_id);
    v_start_date := COALESCE(
      p_start_date,
      CASE WHEN v_event.start_date ~ '^\d{4}-\d{2}-\d{2}' THEN (SUBSTRING(v_event.start_date FROM 1 FOR 10))::date ELSE NULL END,
      CASE WHEN v_event.event_date ~ '^\d{4}-\d{2}-\d{2}' THEN (SUBSTRING(v_event.event_date FROM 1 FOR 10))::date ELSE NULL END,
      CASE WHEN v_event.starts_at IS NOT NULL THEN (v_event.starts_at AT TIME ZONE 'Asia/Singapore')::date ELSE NULL END
    );
    v_end_date := COALESCE(
      p_end_date,
      CASE WHEN v_event.end_date ~ '^\d{4}-\d{2}-\d{2}' THEN (SUBSTRING(v_event.end_date FROM 1 FOR 10))::date ELSE NULL END,
      CASE WHEN v_event.expires_at IS NOT NULL THEN (v_event.expires_at AT TIME ZONE 'Asia/Singapore')::date ELSE NULL END,
      v_start_date
    );
    v_pricing_id := COALESCE(p_pricing_id, v_event.pricing_id);
    v_is_custom_price := COALESCE(v_event.is_custom_price, false);
    v_requested_country := UPPER(COALESCE(p_country_code, v_event.org_country_code, 'MY'));

    IF v_is_custom_price = true AND v_event.event_price IS NOT NULL AND v_event.event_price > 0 THEN
      RETURN jsonb_build_object(
        'success', true,
        'price', v_event.event_price,
        'currency', COALESCE(v_event.event_currency, 'MYR'),
        'duration_days', COALESCE(v_event.duration_days, 1),
        'is_custom_price', true,
        'pricing_id', v_event.pricing_id,
        'requested_country', v_requested_country,
        'pricing_country', v_requested_country,
        'is_fallback', false
      );
    END IF;
  ELSE
    v_target_game_id := p_game_id;
    v_start_date := p_start_date;
    v_end_date := p_end_date;
    v_pricing_id := p_pricing_id;
    v_requested_country := UPPER(COALESCE(p_country_code, 'MY'));
  END IF;

  IF v_start_date IS NULL OR v_end_date IS NULL THEN
    v_duration_days := 1;
  ELSE
    v_duration_days := GREATEST(1, (v_end_date - v_start_date) + 1);
  END IF;

  IF v_target_game_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'GAME_REQUIRED',
      'error', 'A game must be selected to calculate authoritative event pricing.'
    );
  END IF;

  -- If an explicit pricing tier was provided, validate it
  IF v_pricing_id IS NOT NULL THEN
    SELECT id, game_id, price, currency, is_active, min_days, max_days, country_code
    INTO v_pricing_record
    FROM public.game_pricing
    WHERE id = v_pricing_id;

    IF v_pricing_record.id IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'PRICING_TIER_NOT_FOUND',
        'error', 'Specified pricing tier does not exist.'
      );
    END IF;

    IF v_pricing_record.game_id != v_target_game_id THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'PRICING_GAME_MISMATCH',
        'error', 'Specified pricing tier does not belong to the selected game.'
      );
    END IF;

    IF v_pricing_record.is_active != true THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'PRICING_TIER_INACTIVE',
        'error', 'Specified pricing tier is inactive and cannot be used.'
      );
    END IF;

    IF v_duration_days < v_pricing_record.min_days OR (v_pricing_record.max_days IS NOT NULL AND v_duration_days > v_pricing_record.max_days) THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'PRICING_DURATION_MISMATCH',
        'error', 'The specified pricing tier does not cover this duration (' || v_duration_days || ' days).'
      );
    END IF;

    v_resolved_price := v_pricing_record.price;
    v_resolved_currency := v_pricing_record.currency;
    v_pricing_country := v_pricing_record.country_code;
    v_is_fallback := (v_pricing_country != v_requested_country);
  ELSE
    -- Automatic Resolution with Fallback:
    -- Step 1: Look for active tier in requested country
    SELECT count(*)
    INTO v_matching_count
    FROM public.game_pricing
    WHERE game_id = v_target_game_id
      AND country_code = v_requested_country
      AND is_active = true
      AND min_days <= v_duration_days
      AND (max_days IS NULL OR max_days >= v_duration_days);

    IF v_matching_count > 1 THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'AMBIGUOUS_PRICING_TIER',
        'error', 'Multiple active pricing tiers match duration of ' || v_duration_days || ' days for this game in country ' || v_requested_country || '. Overlapping active tiers must be resolved in Developer Settings.',
        'message', 'Multiple active pricing tiers match duration of ' || v_duration_days || ' days for this game in country ' || v_requested_country || '. Overlapping active tiers must be resolved in Developer Settings.'
      );
    END IF;

    IF v_matching_count = 1 THEN
      SELECT id, game_id, price, currency, is_active, min_days, max_days, country_code
      INTO v_pricing_record
      FROM public.game_pricing
      WHERE game_id = v_target_game_id
        AND country_code = v_requested_country
        AND is_active = true
        AND min_days <= v_duration_days
        AND (max_days IS NULL OR max_days >= v_duration_days);

      v_pricing_id := v_pricing_record.id;
      v_resolved_price := v_pricing_record.price;
      v_resolved_currency := v_pricing_record.currency;
      v_pricing_country := v_requested_country;
      v_is_fallback := false;
    ELSE
      -- Step 2: Fall back to default pricing country (if different)
      IF v_requested_country != v_default_country THEN
        SELECT count(*)
        INTO v_matching_count
        FROM public.game_pricing
        WHERE game_id = v_target_game_id
          AND country_code = v_default_country
          AND is_active = true
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
            AND is_active = true
            AND min_days <= v_duration_days
            AND (max_days IS NULL OR max_days >= v_duration_days);

          v_pricing_id := v_pricing_record.id;
          v_resolved_price := v_pricing_record.price;
          v_resolved_currency := v_pricing_record.currency;
          v_pricing_country := v_default_country;
          v_is_fallback := true;
        END IF;
      END IF;

      -- If neither has a matching tier -> Fail closed with NO_PRICING_TIER
      IF v_resolved_price IS NULL OR v_resolved_price <= 0 THEN
        RETURN jsonb_build_object(
          'success', false,
          'code', 'NO_PRICING_TIER',
          'error', 'No pricing tier is configured for a ' || v_duration_days || '-day event for this game. Pricing cannot be resolved.',
          'message', 'No pricing tier is configured for a ' || v_duration_days || '-day event for this game. Pricing cannot be resolved.',
          'requested_country', v_requested_country,
          'default_country', v_default_country
        );
      END IF;
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

  RETURN jsonb_build_object(
    'success', true,
    'price', v_resolved_price,
    'currency', v_resolved_currency,
    'duration_days', v_duration_days,
    'pricing_id', v_pricing_id,
    'is_custom_price', false,
    'requested_country', v_requested_country,
    'pricing_country', v_pricing_country,
    'is_fallback', v_is_fallback
  );
END;
$$;
