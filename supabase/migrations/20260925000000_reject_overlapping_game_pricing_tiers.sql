-- ==============================================================================
-- Migration: 20260925000000_reject_overlapping_game_pricing_tiers.sql
-- Description: Enforces financial integrity by rejecting overlapping active duration
--              ranges on game_pricing for the same game, and fails closed with
--              AMBIGUOUS_PRICING_TIER if multiple active tiers ever match a given
--              event duration.
--
-- Business Invariants:
--   1. An active pricing tier cannot overlap with any other active pricing tier
--      for the same game.
--   2. Direct database inserts and updates are checked via BEFORE INSERT OR UPDATE
--      trigger trg_validate_game_pricing_overlap on public.game_pricing.
--   3. When creating or updating a pricing tier, if it is active, the system
--      ensures min_days >= 1, max_days >= min_days (if max_days is not null),
--      and that no other active tier exists for the game where:
--        NEW.min_days <= COALESCE(max_days, 2147483647)
--        AND min_days <= COALESCE(NEW.max_days, 2147483647)
--   4. Resolvers (calculate_event_authoritative_price and create_event_atomic)
--      must fail closed with AMBIGUOUS_PRICING_TIER if multiple active tiers match,
--      preventing silent arbitrary selection.
-- ==============================================================================

-- 1. Create validation function for game_pricing overlap rejection
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

    -- Look for any other active pricing tier for the same game that overlaps
    SELECT id, min_days, max_days, price, currency
    INTO v_conflicting
    FROM public.game_pricing
    WHERE game_id = NEW.game_id
      AND is_active = true
      AND (NEW.id IS NULL OR id != NEW.id)
      AND (
        -- Overlap logic: A_min <= B_max AND B_min <= A_max
        NEW.min_days <= COALESCE(max_days, 2147483647)
        AND min_days <= COALESCE(NEW.max_days, 2147483647)
      )
    LIMIT 1;

    IF v_conflicting.id IS NOT NULL THEN
      RAISE EXCEPTION 'OVERLAPPING_PRICING_TIER: Pricing tier range (%–% days) overlaps with existing active tier (%–% days) for this game.',
        NEW.min_days,
        COALESCE(NEW.max_days::text, '+'),
        v_conflicting.min_days,
        COALESCE(v_conflicting.max_days::text, '+')
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Attach trigger to public.game_pricing
DROP TRIGGER IF EXISTS trg_validate_game_pricing_overlap ON public.game_pricing;
CREATE TRIGGER trg_validate_game_pricing_overlap
  BEFORE INSERT OR UPDATE ON public.game_pricing
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_game_pricing_overlap();

-- 3. Update calculate_event_authoritative_price to fail closed on ambiguous / multiple matching tiers
CREATE OR REPLACE FUNCTION public.calculate_event_authoritative_price(
  p_event_id UUID DEFAULT NULL,
  p_game_id UUID DEFAULT NULL,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL,
  p_pricing_id UUID DEFAULT NULL
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
BEGIN
  -- Load event if p_event_id provided
  IF p_event_id IS NOT NULL THEN
    SELECT id, game_id, start_date, end_date, starts_at, expires_at,
           pricing_id, is_custom_price, event_price, event_currency, duration_days
    INTO v_event
    FROM public.events
    WHERE id = p_event_id;

    IF v_event.id IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'EVENT_NOT_FOUND',
        'error', 'Event not found.'
      );
    END IF;

    v_target_game_id := COALESCE(p_game_id, v_event.game_id);
    v_start_date := COALESCE(p_start_date, v_event.start_date, DATE(v_event.starts_at));
    v_end_date := COALESCE(p_end_date, v_event.end_date, DATE(v_event.expires_at));
    v_pricing_id := COALESCE(p_pricing_id, v_event.pricing_id);
    v_is_custom_price := COALESCE(v_event.is_custom_price, false);

    IF v_is_custom_price = true AND v_event.event_price IS NOT NULL AND v_event.event_price > 0 THEN
      RETURN jsonb_build_object(
        'success', true,
        'price', v_event.event_price,
        'currency', COALESCE(v_event.event_currency, 'MYR'),
        'duration_days', COALESCE(v_event.duration_days, 1),
        'is_custom_price', true,
        'pricing_id', v_event.pricing_id
      );
    END IF;
  ELSE
    v_target_game_id := p_game_id;
    v_start_date := p_start_date;
    v_end_date := p_end_date;
    v_pricing_id := p_pricing_id;
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

  IF v_pricing_id IS NOT NULL THEN
    SELECT id, game_id, price, currency, is_active, min_days, max_days
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
  ELSE
    -- Check for ambiguous / multiple matching tiers (fails closed)
    SELECT count(*)
    INTO v_matching_count
    FROM public.game_pricing
    WHERE game_id = v_target_game_id
      AND is_active = true
      AND min_days <= v_duration_days
      AND (max_days IS NULL OR max_days >= v_duration_days);

    IF v_matching_count > 1 THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'AMBIGUOUS_PRICING_TIER',
        'error', 'Multiple active pricing tiers match duration of ' || v_duration_days || ' days for this game. Overlapping active tiers must be resolved in Developer Settings.',
        'message', 'Multiple active pricing tiers match duration of ' || v_duration_days || ' days for this game. Overlapping active tiers must be resolved in Developer Settings.'
      );
    END IF;

    SELECT id, game_id, price, currency, is_active, min_days, max_days
    INTO v_pricing_record
    FROM public.game_pricing
    WHERE game_id = v_target_game_id
      AND is_active = true
      AND min_days <= v_duration_days
      AND (max_days IS NULL OR max_days >= v_duration_days);

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

  RETURN jsonb_build_object(
    'success', true,
    'price', v_resolved_price,
    'currency', v_resolved_currency,
    'duration_days', v_duration_days,
    'pricing_id', v_pricing_id,
    'is_custom_price', false
  );
END;
$$;
