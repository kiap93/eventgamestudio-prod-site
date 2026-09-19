-- Migration: 20260919010000_ensure_platform_pricing_settings.sql
-- Ensure platform default event pricing settings and duration rules exist in platform_settings

INSERT INTO public.platform_settings (key, value, description, updated_at)
VALUES (
  'event_pricing',
  jsonb_build_object(
    'default_price', 1400.00,
    'default_currency', 'MYR',
    'pricing_rules', jsonb_build_array(
      jsonb_build_object('id', 'rule_1d', 'min_days', 1, 'max_days', 1, 'price', 1400.00, 'currency', 'MYR', 'active', true),
      jsonb_build_object('id', 'rule_2d', 'min_days', 2, 'max_days', 2, 'price', 1900.00, 'currency', 'MYR', 'active', true),
      jsonb_build_object('id', 'rule_3d', 'min_days', 3, 'max_days', 3, 'price', 2200.00, 'currency', 'MYR', 'active', true),
      jsonb_build_object('id', 'rule_4d', 'min_days', 4, 'max_days', 4, 'price', 2400.00, 'currency', 'MYR', 'active', true),
      jsonb_build_object('id', 'rule_5d', 'min_days', 5, 'max_days', 5, 'price', 2500.00, 'currency', 'MYR', 'active', true),
      jsonb_build_object('id', 'rule_6d', 'min_days', 6, 'max_days', 6, 'price', 2600.00, 'currency', 'MYR', 'active', true),
      jsonb_build_object('id', 'rule_7d', 'min_days', 7, 'max_days', 7, 'price', 2800.00, 'currency', 'MYR', 'active', true),
      jsonb_build_object('id', 'rule_8_14d', 'min_days', 8, 'max_days', 14, 'price', 3500.00, 'currency', 'MYR', 'active', true),
      jsonb_build_object('id', 'rule_15_30d', 'min_days', 15, 'max_days', 30, 'price', 4500.00, 'currency', 'MYR', 'active', true),
      jsonb_build_object('id', 'rule_31_60d', 'min_days', 31, 'max_days', 60, 'price', 6000.00, 'currency', 'MYR', 'active', true),
      jsonb_build_object('id', 'rule_61_90d', 'min_days', 61, 'max_days', 90, 'price', 8000.00, 'currency', 'MYR', 'active', true),
      jsonb_build_object('id', 'rule_91plus', 'min_days', 91, 'max_days', null, 'price', 10000.00, 'currency', 'MYR', 'active', true)
    ),
    'updated_at', timezone('utc'::text, now())
  ),
  'Platform default event pricing and duration rules for new events',
  timezone('utc'::text, now())
)
ON CONFLICT (key) DO UPDATE
SET value = CASE
  WHEN (public.platform_settings.value ? 'pricing_rules') THEN public.platform_settings.value
  ELSE EXCLUDED.value
END;
