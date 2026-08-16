-- ==============================================================================
-- MIGRATION 007: Ensure All Games & Themes Columns and Reload Schema Cache
-- ==============================================================================
-- Description:
--   Guarantees that all required columns on 'games' and 'game_themes' exist in the database,
--   including 'description', 'icon_name', 'game_type', 'is_system', 'ownership_type', etc.
--   Sends NOTIFY pgrst, 'reload schema' to force Supabase PostgREST to reload its schema cache.
-- ==============================================================================

BEGIN;

-- 1. Ensure all columns exist on public.games
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS icon_name TEXT DEFAULT 'Gamepad2';
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS game_type TEXT NOT NULL DEFAULT 'catch-brand';
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS ownership_type TEXT NOT NULL DEFAULT 'organization';
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS background_url TEXT;
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS basket_config JSONB;
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS items_config JSONB;
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS settings_config JSONB;
ALTER TABLE public.games ALTER COLUMN organization_id DROP NOT NULL;

-- 2. Ensure all columns exist on public.game_themes
ALTER TABLE public.game_themes ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.game_themes ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE public.game_themes ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.game_themes ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.game_themes ADD COLUMN IF NOT EXISTS ownership_type TEXT NOT NULL DEFAULT 'organization';
ALTER TABLE public.game_themes ADD COLUMN IF NOT EXISTS base_theme_id UUID REFERENCES public.game_themes (id) ON DELETE SET NULL;
ALTER TABLE public.game_themes ADD COLUMN IF NOT EXISTS background_url TEXT;
ALTER TABLE public.game_themes ADD COLUMN IF NOT EXISTS basket_config JSONB;
ALTER TABLE public.game_themes ADD COLUMN IF NOT EXISTS items_config JSONB;
ALTER TABLE public.game_themes ADD COLUMN IF NOT EXISTS physics_config JSONB;
ALTER TABLE public.game_themes ADD COLUMN IF NOT EXISTS visuals_config JSONB;
ALTER TABLE public.game_themes ADD COLUMN IF NOT EXISTS sounds_config JSONB;
ALTER TABLE public.game_themes ADD COLUMN IF NOT EXISTS layout JSONB;
ALTER TABLE public.game_themes ALTER COLUMN organization_id DROP NOT NULL;

-- 3. Unique partial indexes for system games
CREATE UNIQUE INDEX IF NOT EXISTS ux_system_games_game_type ON public.games (game_type) WHERE is_system = true;
CREATE UNIQUE INDEX IF NOT EXISTS ux_system_games_slug ON public.games (slug) WHERE is_system = true;

-- 4. Notify PostgREST to reload its schema cache immediately
NOTIFY pgrst, 'reload schema';

COMMIT;
