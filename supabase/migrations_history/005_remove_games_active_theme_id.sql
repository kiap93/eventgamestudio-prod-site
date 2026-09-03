-- ==============================================================================
-- MIGRATION 005: Remove games.active_theme_id and Enforce Clean Schema
-- ==============================================================================
-- Description:
--   Completely cleans up legacy `games.active_theme_id` references.
--   The system strictly uses:
--     - Platform Game (is_system = true, organization_id IS NULL)
--     - Client Game (is_system = false, organization_id = tenant_id)
--     - System Theme (is_system = true, organization_id IS NULL, game_id = system_game.id)
--     - Client Theme (is_system = false, organization_id = tenant_id, game_id = client_game.id)
--     - Event (binds explicitly to game_theme_id)
--   Theme default designation is tracked via `game_themes.is_default`.
-- ==============================================================================

BEGIN;

-- 1. Drop foreign key constraint on games.active_theme_id if exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_games_active_theme' AND table_name = 'games'
  ) THEN
    ALTER TABLE public.games DROP CONSTRAINT fk_games_active_theme;
  END IF;
END $$;

-- 2. Drop active_theme_id column from games table
ALTER TABLE public.games DROP COLUMN IF EXISTS active_theme_id;

-- 3. Ensure index for game_themes.is_default
CREATE INDEX IF NOT EXISTS idx_game_themes_is_default ON public.game_themes (is_default);

COMMIT;
