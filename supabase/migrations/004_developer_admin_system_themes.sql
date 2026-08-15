-- ==============================================================================
-- MIGRATION 004: Developer Admin, System Games & Default Themes Architecture
-- ==============================================================================
-- Description:
--   Enables platform developer administration of Games and System Default Themes.
--   Allows games and game_themes to be either system-level (ownership_type = 'system',
--   organization_id IS NULL or system org) or organization-specific.
--   Enables organizations to clone system default themes into their own workspace.
-- ==============================================================================

BEGIN;

-- 1. Add is_developer column to users table
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_developer BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_users_is_developer ON public.users (is_developer);

-- 2. Update games table to allow system-level games (organization_id NULLable)
ALTER TABLE public.games ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS ownership_type TEXT NOT NULL DEFAULT 'organization' CHECK (ownership_type IN ('system', 'organization'));
CREATE INDEX IF NOT EXISTS idx_games_is_system ON public.games (is_system);
CREATE INDEX IF NOT EXISTS idx_games_ownership_type ON public.games (ownership_type);

-- 3. Update game_themes table for system default themes
ALTER TABLE public.game_themes ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE public.game_themes ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.game_themes ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.game_themes ADD COLUMN IF NOT EXISTS ownership_type TEXT NOT NULL DEFAULT 'organization' CHECK (ownership_type IN ('system', 'organization'));
ALTER TABLE public.game_themes ADD COLUMN IF NOT EXISTS base_theme_id UUID REFERENCES public.game_themes (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_game_themes_is_system ON public.game_themes (is_system);
CREATE INDEX IF NOT EXISTS idx_game_themes_ownership_type ON public.game_themes (ownership_type);
CREATE INDEX IF NOT EXISTS idx_game_themes_base_theme_id ON public.game_themes (base_theme_id);

-- 4. Developer Admin RLS helper function
CREATE OR REPLACE FUNCTION public.is_developer_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND is_developer = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. RLS Policies for Developer Admin access to Games & Themes
DROP POLICY IF EXISTS "Developer admins can manage all games" ON public.games;
CREATE POLICY "Developer admins can manage all games"
  ON public.games FOR ALL
  USING (public.is_developer_admin());

DROP POLICY IF EXISTS "Anyone can view system games" ON public.games;
CREATE POLICY "Anyone can view system games"
  ON public.games FOR SELECT
  USING (is_system = true OR organization_id IS NULL);

DROP POLICY IF EXISTS "Developer admins can manage all themes" ON public.game_themes;
CREATE POLICY "Developer admins can manage all themes"
  ON public.game_themes FOR ALL
  USING (public.is_developer_admin());

DROP POLICY IF EXISTS "Anyone can view system themes" ON public.game_themes;
CREATE POLICY "Anyone can view system themes"
  ON public.game_themes FOR SELECT
  USING (is_system = true OR organization_id IS NULL);

COMMIT;
