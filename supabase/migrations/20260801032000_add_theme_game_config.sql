-- ==============================================================================
-- 17. ADD GAME_CONFIG JSONB FIELD TO GAME_THEMES (NON-DESTRUCTIVE PHASE 1)
-- ==============================================================================
-- Adds generic game-specific configuration storage while preserving all legacy
-- columns (basket_config, items_config, physics_config) for complete backward compatibility.

ALTER TABLE public.game_themes
ADD COLUMN IF NOT EXISTS game_config JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Notify PostgREST schema cache to reload
NOTIFY pgrst, 'reload schema';
