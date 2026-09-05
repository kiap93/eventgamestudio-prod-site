-- ==============================================================================
-- MIGRATION 002: Add Layout Configuration to Game Themes
-- ==============================================================================
-- Description:
--   Adds a JSONB `layout` column to `public.game_themes` to store percentage-based
--   responsive positioning, sizing, and visibility for game UI elements:
--   (Client Logo, Score HUD, Timer, Game Title, Footer / Sponsor).
-- ==============================================================================

BEGIN;

-- 1. Safely add layout column to game_themes
ALTER TABLE public.game_themes ADD COLUMN IF NOT EXISTS layout JSONB DEFAULT '{
  "clientLogo": { "visible": true, "x": 4, "y": 4, "width": 14 },
  "scoreHud": { "visible": true, "x": 4, "y": 14, "width": 18 },
  "timer": { "visible": true, "x": 78, "y": 4, "width": 18 },
  "gameTitle": { "visible": true, "x": 38, "y": 4, "width": 24 },
  "footerSponsor": { "visible": true, "x": 35, "y": 92, "width": 30 }
}'::jsonb;

-- 2. Backfill existing themes that have null layout
UPDATE public.game_themes
SET layout = '{
  "clientLogo": { "visible": true, "x": 4, "y": 4, "width": 14 },
  "scoreHud": { "visible": true, "x": 4, "y": 14, "width": 18 },
  "timer": { "visible": true, "x": 78, "y": 4, "width": 18 },
  "gameTitle": { "visible": true, "x": 38, "y": 4, "width": 24 },
  "footerSponsor": { "visible": true, "x": 35, "y": 92, "width": 30 }
}'::jsonb
WHERE layout IS NULL;

COMMIT;
