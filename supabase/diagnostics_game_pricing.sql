-- ==============================================================================
-- Read-Only Database Diagnostics: Game Pricing Data Integrity Inspection
-- ==============================================================================
-- Run these queries in the Supabase SQL Editor prior to applying migration
-- 20261022000000_fix_game_pricing_multi_dimensional_lookup.sql to inspect
-- existing production pricing records without modifying any data.
-- ==============================================================================

-- DIAGNOSTIC 1: USD rows currently assigned to country_code = 'MY'
-- Root Cause: Historical migration 20261011000000 set country_code = 'MY' for all null rows.
SELECT
  id,
  game_id,
  country_code,
  currency,
  price,
  min_days,
  max_days,
  is_active,
  is_base,
  created_at
FROM public.game_pricing
WHERE currency = 'USD'
  AND country_code = 'MY'
ORDER BY game_id, min_days;

-- DIAGNOSTIC 2: Duplicate active rows for the same game, country, currency, and duration
-- Identifies identical active duration tiers that create ambiguity.
SELECT
  game_id,
  country_code,
  currency,
  min_days,
  max_days,
  COUNT(*) AS duplicate_count,
  ARRAY_AGG(id) AS tier_ids,
  ARRAY_AGG(price) AS prices
FROM public.game_pricing
WHERE is_active = true
GROUP BY game_id, country_code, currency, min_days, max_days
HAVING COUNT(*) > 1;

-- DIAGNOSTIC 3: Overlapping active duration ranges within the same game, country, and currency
-- Two active ranges [minA, maxA] and [minB, maxB] overlap when minA <= maxB and minB <= maxA.
SELECT
  a.id AS tier_a_id,
  a.game_id,
  a.country_code,
  a.currency,
  a.min_days AS a_min,
  a.max_days AS a_max,
  a.price AS a_price,
  b.id AS tier_b_id,
  b.min_days AS b_min,
  b.max_days AS b_max,
  b.price AS b_price
FROM public.game_pricing a
JOIN public.game_pricing b
  ON a.game_id = b.game_id
  AND a.country_code = b.country_code
  AND a.currency = b.currency
  AND a.is_active = true
  AND b.is_active = true
  AND a.id < b.id
  AND a.min_days <= COALESCE(b.max_days, 2147483647)
  AND b.min_days <= COALESCE(a.max_days, 2147483647)
ORDER BY a.game_id, a.country_code, a.currency, a.min_days;

-- DIAGNOSTIC 4: Pricing rows with missing or invalid country or currency values
SELECT
  id,
  game_id,
  country_code,
  currency,
  price,
  min_days,
  max_days,
  is_active
FROM public.game_pricing
WHERE country_code IS NULL
   OR TRIM(country_code) = ''
   OR currency IS NULL
   OR TRIM(currency) = ''
   OR price IS NULL
   OR price <= 0;

-- SUMMARY OVERVIEW: Counts of active pricing tiers by country and currency
SELECT
  country_code,
  currency,
  is_active,
  COUNT(*) AS total_tiers
FROM public.game_pricing
GROUP BY country_code, currency, is_active
ORDER BY country_code, currency, is_active;
