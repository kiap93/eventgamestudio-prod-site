-- ==============================================================================
-- Migration: 20261022000000_fix_game_pricing_multi_dimensional_lookup.sql
-- Description: Fixes event creation failure where multiple matching pricing records
--              were reported when USD pricing was added.
--
-- Root Cause:
--   1. Historical records with currency = 'USD' were incorrectly assigned country_code = 'MY'.
--   2. Legacy 5-parameter calculate_event_authoritative_price overload matched across all
--      countries/currencies without partitioning on (country_code, currency).
--   3. Pricing resolution did not filter on both country_code AND expected currency simultaneously.
--   4. Fallback logic allowed US organizations without configured duration to fall back to MYR.
--
-- Business Invariants:
--   1. Pricing tiers are resolved on 5 dimensions: (game_id, country_code, currency, duration_days, is_active).
--   2. Malaysia organizations strictly use MYR pricing. US organizations strictly use USD pricing.
--   3. Missing pricing fails closed (NO_PRICING_TIER / Contact Us); never falls back to MYR for US orgs.
--   4. Overlapping tier validation trigger is scoped per (game_id, country_code, currency).
-- ==============================================================================

-- 1. DATA REPAIR: Correct country_code for USD pricing rows and unassigned rows
-- Deactivate any misassigned duplicates if an active US tier already covers the same duration
UPDATE public.game_pricing gp
  SET is_active = false
  WHERE gp.currency = 'USD'
    AND (gp.country_code IS NULL OR gp.country_code = 'MY')
    AND EXISTS (
      SELECT 1 FROM public.game_pricing existing
      WHERE existing.game_id = gp.game_id
        AND existing.country_code = 'US'
        AND existing.currency = 'USD'
        AND existing.is_active = true
        AND existing.id != gp.id
        AND existing.min_days <= COALESCE(gp.max_days, 2147483647)
        AND gp.min_days <= COALESCE(existing.max_days, 2147483647)
    );

UPDATE public.game_pricing
  SET country_code = 'US'
  WHERE currency = 'USD' AND (country_code IS NULL OR country_code = 'MY');

UPDATE public.game_pricing
  SET country_code = 'MY'
  WHERE currency = 'MYR' AND country_code IS NULL;

UPDATE public.game_pricing
  SET country_code = 'US'
  WHERE country_code IS NULL;

UPDATE public.game_pricing
  SET currency = 'MYR'
  WHERE currency IS NULL AND country_code = 'MY';

UPDATE public.game_pricing
  SET currency = 'USD'
  WHERE currency IS NULL;

-- Ensure NOT NULL constraints are preserved
ALTER TABLE public.game_pricing
  ALTER COLUMN country_code SET NOT NULL;

ALTER TABLE public.game_pricing
  ALTER COLUMN currency SET NOT NULL;

-- 2. DROP ALL LEGACY OVERLOADS OF calculate_event_authoritative_price
DROP FUNCTION IF EXISTS public.calculate_event_authoritative_price(UUID, UUID, DATE, DATE, UUID);
DROP FUNCTION IF EXISTS public.calculate_event_authoritative_price(UUID, UUID, DATE, DATE, UUID, VARCHAR);
DROP FUNCTION IF EXISTS public.calculate_event_authoritative_price(UUID, UUID, DATE, DATE, UUID, TEXT);

-- 3. RE-CREATE CANONICAL 6-PARAMETER calculate_event_authoritative_price
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
  v_resolved_currency TEXT;
  v_expected_currency TEXT;
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
    v_requested_country := UPPER(COALESCE(p_country_code, v_event.org_country_code, v_default_country));

    IF v_is_custom_price = true AND v_event.event_price IS NOT NULL AND v_event.event_price > 0 THEN
      v_resolved_currency := v_event.event_currency;
      IF v_resolved_currency IS NULL OR v_resolved_currency = '' THEN
        v_resolved_currency := CASE v_requested_country
          WHEN 'MY' THEN 'MYR'
          WHEN 'SG' THEN 'SGD'
          WHEN 'TH' THEN 'THB'
          WHEN 'ID' THEN 'IDR'
          WHEN 'PH' THEN 'PHP'
          WHEN 'VN' THEN 'VND'
          WHEN 'JP' THEN 'JPY'
          WHEN 'KR' THEN 'KRW'
          WHEN 'TW' THEN 'TWD'
          WHEN 'HK' THEN 'HKD'
          WHEN 'AU' THEN 'AUD'
          WHEN 'NZ' THEN 'NZD'
          WHEN 'IN' THEN 'INR'
          WHEN 'US' THEN 'USD'
          WHEN 'GB' THEN 'GBP'
          WHEN 'CA' THEN 'CAD'
          WHEN 'DE' THEN 'EUR'
          WHEN 'FR' THEN 'EUR'
          ELSE 'USD'
        END;
      END IF;

      RETURN jsonb_build_object(
        'success', true,
        'price', v_event.event_price,
        'currency', v_resolved_currency,
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
    v_requested_country := UPPER(COALESCE(p_country_code, v_default_country));
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

  -- Derive expected currency strictly from the requested country
  v_expected_currency := CASE v_requested_country
    WHEN 'MY' THEN 'MYR'
    WHEN 'SG' THEN 'SGD'
    WHEN 'TH' THEN 'THB'
    WHEN 'ID' THEN 'IDR'
    WHEN 'PH' THEN 'PHP'
    WHEN 'VN' THEN 'VND'
    WHEN 'JP' THEN 'JPY'
    WHEN 'KR' THEN 'KRW'
    WHEN 'TW' THEN 'TWD'
    WHEN 'HK' THEN 'HKD'
    WHEN 'AU' THEN 'AUD'
    WHEN 'NZ' THEN 'NZD'
    WHEN 'IN' THEN 'INR'
    WHEN 'US' THEN 'USD'
    WHEN 'GB' THEN 'GBP'
    WHEN 'CA' THEN 'CAD'
    WHEN 'DE' THEN 'EUR'
    WHEN 'FR' THEN 'EUR'
    ELSE 'USD'
  END;

  -- If explicit pricing tier was provided, validate existence, game association, status, and duration
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

    IF v_pricing_record.game_id <> v_target_game_id THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'PRICING_GAME_MISMATCH',
        'error', 'Specified pricing tier does not belong to the selected game.'
      );
    END IF;

    IF NOT COALESCE(v_pricing_record.is_active, false) THEN
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
  END IF;

  -- STEP 1: Multi-dimensional lookup in requested country AND expected currency
  SELECT count(*)
  INTO v_matching_count
  FROM public.game_pricing
  WHERE game_id = v_target_game_id
    AND country_code = v_requested_country
    AND currency = v_expected_currency
    AND is_active = true
    AND min_days <= v_duration_days
    AND (max_days IS NULL OR max_days >= v_duration_days);

  IF v_matching_count > 1 THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'AMBIGUOUS_PRICING_TIER',
      'error', 'Multiple active pricing tiers match duration of ' || v_duration_days || ' days for this game in country ' || v_requested_country || ' (' || v_expected_currency || '). Overlapping active tiers must be resolved in Developer Settings.',
      'message', 'Multiple active pricing tiers match duration of ' || v_duration_days || ' days for this game in country ' || v_requested_country || ' (' || v_expected_currency || '). Overlapping active tiers must be resolved in Developer Settings.'
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
      AND min_days <= v_duration_days
      AND (max_days IS NULL OR max_days >= v_duration_days);

    -- If client supplied a pricing_id, verify that it matches this authoritative tier
    IF v_pricing_id IS NOT NULL AND v_pricing_id != v_pricing_record.id THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'PRICING_COUNTRY_MISMATCH',
        'error', 'The specified pricing tier does not match the authoritative pricing tier for your country and duration.',
        'message', 'The specified pricing tier does not match the authoritative pricing tier for your country and duration.'
      );
    END IF;

    v_pricing_id := v_pricing_record.id;
    v_resolved_price := v_pricing_record.price;
    v_resolved_currency := v_pricing_record.currency;
    v_pricing_country := v_requested_country;
    v_is_fallback := false;

    RETURN jsonb_build_object(
      'success', true,
      'price', v_resolved_price,
      'currency', v_resolved_currency,
      'duration_days', v_duration_days,
      'is_custom_price', false,
      'pricing_id', v_pricing_id,
      'requested_country', v_requested_country,
      'pricing_country', v_pricing_country,
      'is_fallback', false,
      'fallback_level', 0
    );
  END IF;

  -- STEP 2: Requested country has NO match.
  -- Strict Fail-Closed Rule for Primary Configured Markets (US and MY):
  -- Malaysia organizations must use MYR. US organizations must use USD.
  -- They MUST NOT cross-fallback to another country or currency.
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

  -- STEP 3: Unconfigured third-country fallback (e.g. VN, FR)
  -- Fall back to default pricing country (US with USD)
  SELECT count(*)
  INTO v_matching_count
  FROM public.game_pricing
  WHERE game_id = v_target_game_id
    AND country_code = v_default_country
    AND currency = 'USD'
    AND is_active = true
    AND price > 0;

  IF v_matching_count > 0 THEN
    SELECT count(*)
    INTO v_matching_count
    FROM public.game_pricing
    WHERE game_id = v_target_game_id
      AND country_code = v_default_country
      AND currency = 'USD'
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
        AND currency = 'USD'
        AND is_active = true
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

    -- Default country has tiers but none cover this duration -> fail closed
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

  -- Default country (US) has ZERO active tiers for this game. Check secondary fallback MY.
  SELECT count(*)
  INTO v_matching_count
  FROM public.game_pricing
  WHERE game_id = v_target_game_id
    AND country_code = 'MY'
    AND currency = 'MYR'
    AND is_active = true
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

  -- No tier found anywhere
  RETURN jsonb_build_object(
    'success', false,
    'code', 'NO_PRICING_TIER',
    'error', 'No pricing tier is configured for a ' || v_duration_days || '-day event for this game.',
    'message', 'No pricing tier is configured for a ' || v_duration_days || '-day event for this game.',
    'requested_country', v_requested_country,
    'pricing_country', NULL,
    'default_country', v_default_country
  );
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.calculate_event_authoritative_price(UUID, UUID, DATE, DATE, UUID, VARCHAR) TO authenticated, service_role;

-- 4. UPDATE validate_game_pricing_overlap TRIGGER FUNCTION (SCOPED TO SAME GAME, COUNTRY, AND CURRENCY)
CREATE OR REPLACE FUNCTION public.validate_game_pricing_overlap()
RETURNS TRIGGER AS $$
DECLARE
  v_conflicting RECORD;
BEGIN
  -- Only validate if the row being inserted or updated is active
  IF NEW.is_active = true THEN
    -- Validate country_code is present
    IF NEW.country_code IS NULL OR TRIM(NEW.country_code) = '' THEN
      RAISE EXCEPTION 'Country code is required for pricing tiers'
        USING ERRCODE = 'check_violation';
    END IF;

    NEW.country_code := UPPER(TRIM(NEW.country_code));

    IF NEW.currency IS NULL OR TRIM(NEW.currency) = '' THEN
      NEW.currency := CASE NEW.country_code
        WHEN 'MY' THEN 'MYR'
        WHEN 'US' THEN 'USD'
        ELSE 'USD'
      END;
    END IF;

    NEW.currency := UPPER(TRIM(NEW.currency));

    -- Check minimum and maximum day bounds
    IF NEW.min_days < 1 THEN
      RAISE EXCEPTION 'Minimum days must be an integer >= 1'
        USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.max_days IS NOT NULL AND NEW.max_days < NEW.min_days THEN
      RAISE EXCEPTION 'Maximum days must be greater than or equal to minimum days'
        USING ERRCODE = 'check_violation';
    END IF;

    -- Look for any other active pricing tier for the SAME game, SAME country, and SAME currency that overlaps
    SELECT id, min_days, max_days, price, currency, country_code
    INTO v_conflicting
    FROM public.game_pricing
    WHERE game_id = NEW.game_id
      AND country_code = NEW.country_code
      AND currency = NEW.currency
      AND is_active = true
      AND (NEW.id IS NULL OR id != NEW.id)
      AND (
        NEW.min_days <= COALESCE(max_days, 2147483647)
        AND min_days <= COALESCE(NEW.max_days, 2147483647)
      )
    LIMIT 1;

    IF v_conflicting.id IS NOT NULL THEN
      RAISE EXCEPTION 'OVERLAPPING_PRICING_TIER: Pricing tier range (%–% days) for country % (%) overlaps with existing active tier (%–% days) for this game.',
        NEW.min_days,
        COALESCE(NEW.max_days::text, '+'),
        NEW.country_code,
        NEW.currency,
        v_conflicting.min_days,
        COALESCE(v_conflicting.max_days::text, '+')
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Ensure trigger is active
DROP TRIGGER IF EXISTS trg_validate_game_pricing_overlap ON public.game_pricing;
CREATE TRIGGER trg_validate_game_pricing_overlap
  BEFORE INSERT OR UPDATE ON public.game_pricing
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_game_pricing_overlap();
