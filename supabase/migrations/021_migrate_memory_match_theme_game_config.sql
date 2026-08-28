-- ==============================================================================
-- MIGRATION 021: Migrate Memory Match Theme to game_config Architecture
-- ==============================================================================
-- Description:
--   Populates game_config for Brand Memory Match theme(s) with cardBackUrl,
--   pairs (8 pairs), grid (4x4), and gameplay settings (timer, delays, points).
--   Ensures Memory Match stops relying on legacy Catch Brand columns (basket_config,
--   physics_config, items_config).
--   Maintains full backward-compatibility and does NOT touch Catch Brand themes.
-- ==============================================================================

BEGIN;

-- Allow basket_config and other game-specific columns to be nullable for non-catcher games
ALTER TABLE public.game_themes ALTER COLUMN basket_config DROP NOT NULL;

-- Migrate target Memory Match theme dd423275-9ed8-457a-8f1e-2231af720e01 and any other memory-match themes
UPDATE public.game_themes
SET
  game_config = jsonb_build_object(
    'cardBackUrl', COALESCE(visuals_config->>'cardBackUrl', NULL),
    'pairs', jsonb_build_array(
      jsonb_build_object('id', 'pair_diamond', 'name', 'Diamond', 'imageUrl', NULL, 'points', 100),
      jsonb_build_object('id', 'pair_crown', 'name', 'Crown', 'imageUrl', NULL, 'points', 100),
      jsonb_build_object('id', 'pair_star', 'name', 'Star', 'imageUrl', NULL, 'points', 100),
      jsonb_build_object('id', 'pair_heart', 'name', 'Heart', 'imageUrl', NULL, 'points', 100),
      jsonb_build_object('id', 'pair_lightning', 'name', 'Lightning', 'imageUrl', NULL, 'points', 100),
      jsonb_build_object('id', 'pair_shield', 'name', 'Shield', 'imageUrl', NULL, 'points', 100),
      jsonb_build_object('id', 'pair_trophy', 'name', 'Trophy', 'imageUrl', NULL, 'points', 100),
      jsonb_build_object('id', 'pair_rocket', 'name', 'Rocket', 'imageUrl', NULL, 'points', 100)
    ),
    'grid', jsonb_build_object(
      'rows', 4,
      'cols', 4
    ),
    'gameplay', jsonb_build_object(
      'gameDurationSeconds', COALESCE((physics_config->>'gameDurationSeconds')::int, 45),
      'mismatchDelayMs', COALESCE((physics_config->>'spawnIntervalMin')::int, 850),
      'matchPoints', 100,
      'comboPoints', 30
    )
  ),
  background_url = NULL,
  basket_config = '{}'::jsonb
WHERE
  id = 'dd423275-9ed8-457a-8f1e-2231af720e01'
  OR base_theme_id = 'dd423275-9ed8-457a-8f1e-2231af720e01'
  OR slug = 'memory-match'
  OR slug ILIKE '%memory%'
  OR game_id = 'c782cc78-d2f6-4e70-ac90-bbf9824c62f9'
  OR game_id IN (
    SELECT id FROM public.games WHERE slug = 'memory-match' OR game_type = 'memory-match'
  );

COMMIT;
