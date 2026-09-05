-- ==============================================================================
-- MIGRATION 003: Remove Game Themes Active State Mechanism
-- ==============================================================================
-- Description:
--   The new architecture decouples theme selection from the global theme level.
--   Events explicitly select and bind to specific themes via `events.game_theme_id`.
--   This migration removes the index on `game_themes.is_active` and safely
--   deprecates the column so there is no global "active theme" concept.
-- ==============================================================================

BEGIN;

-- 1. Drop index on is_active if it exists
DROP INDEX IF EXISTS idx_game_themes_is_active;

-- 2. Drop the column is_active from game_themes safely
ALTER TABLE public.game_themes DROP COLUMN IF EXISTS is_active;

COMMIT;
