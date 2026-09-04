-- Migration: 20260904040000_games_themes_backend_write_only.sql
-- Description: Make public.games and public.game_themes backend-write-only to eliminate
--              direct client mutation risks via Supabase RLS.
--              Drops client INSERT, UPDATE, DELETE policies on public.games and public.game_themes.
--              Revokes INSERT, UPDATE, DELETE privileges on public.games and public.game_themes from authenticated and anon roles.
--              Preserves SELECT policies for system items and organization members.
--              Installs defense-in-depth triggers to prevent unauthorized client writes and safeguard sensitive columns:
--              For games: organization_id, game_type, slug, is_system.
--              For game_themes: organization_id, game_id, is_system, ownership_type, and protects system themes from alteration/deletion.

-- ==============================================================================
-- 1. PUBLIC.GAMES: BACKEND-WRITE-ONLY POLICIES & PERMISSIONS
-- ==============================================================================

-- Drop vulnerable client write policies on public.games
DROP POLICY IF EXISTS "Owners, admins, designers can insert games" ON public.games;
DROP POLICY IF EXISTS "Owners, admins, designers can update games" ON public.games;
DROP POLICY IF EXISTS "Owners and admins can delete games" ON public.games;
DROP POLICY IF EXISTS "Developer admins can manage all games" ON public.games;

-- Ensure read policies are clean and properly scoped
DROP POLICY IF EXISTS "Anyone can view system games" ON public.games;
CREATE POLICY "Anyone can view system games"
  ON public.games FOR SELECT
  USING (is_system = true OR organization_id IS NULL);

DROP POLICY IF EXISTS "Members can view organization games" ON public.games;
CREATE POLICY "Members can view organization games"
  ON public.games FOR SELECT
  USING (organization_id IS NOT NULL AND (public.is_org_member(organization_id) OR public.is_developer_admin()));

-- Revoke direct table-level mutation privileges from client roles
REVOKE INSERT, UPDATE, DELETE ON public.games FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.games FROM anon;

-- Explicitly ensure SELECT is allowed for authenticated and anon users subject to RLS
GRANT SELECT ON public.games TO authenticated;
GRANT SELECT ON public.games TO anon;

-- Defense-in-depth trigger function for public.games
CREATE OR REPLACE FUNCTION public.prevent_game_unauthorized_client_mutations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role text;
  v_uid text;
BEGIN
  -- Retrieve auth context from Supabase JWT claims
  BEGIN
    v_role := current_setting('request.jwt.claim.role', true);
  EXCEPTION WHEN OTHERS THEN
    v_role := NULL;
  END;

  IF v_role IS NULL THEN
    BEGIN
      v_role := auth.role();
    EXCEPTION WHEN OTHERS THEN
      v_role := NULL;
    END;
  END IF;

  BEGIN
    v_uid := current_setting('request.jwt.claim.sub', true);
  EXCEPTION WHEN OTHERS THEN
    v_uid := NULL;
  END;

  IF v_uid IS NULL THEN
    BEGIN
      v_uid := auth.uid()::text;
    EXCEPTION WHEN OTHERS THEN
      v_uid := NULL;
    END;
  END IF;

  -- Block any mutation attempt originating from client roles (authenticated or anon)
  IF v_role IN ('authenticated', 'anon') OR (v_uid IS NOT NULL AND (v_role IS NULL OR v_role != 'service_role')) THEN
    RAISE EXCEPTION 'Direct client mutation on games is strictly prohibited. All game operations must be routed through the server API.';
  END IF;

  -- Defense-in-depth: safeguard critical columns if not service_role
  IF TG_OP = 'UPDATE' THEN
    IF v_role IS DISTINCT FROM 'service_role' THEN
      IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
        RAISE EXCEPTION 'Direct update of organization_id on games is strictly prohibited';
      END IF;
      IF NEW.game_type IS DISTINCT FROM OLD.game_type THEN
        RAISE EXCEPTION 'Direct update of game_type on games is strictly prohibited';
      END IF;
      IF NEW.slug IS DISTINCT FROM OLD.slug THEN
        RAISE EXCEPTION 'Direct update of slug on games is strictly prohibited';
      END IF;
      IF NEW.is_system IS DISTINCT FROM OLD.is_system THEN
        RAISE EXCEPTION 'Direct update of is_system on games is strictly prohibited';
      END IF;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    IF v_role IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'Direct client insert on games is strictly prohibited';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF v_role IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'Direct client deletion of games is strictly prohibited';
    END IF;
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_game_unauthorized_client_mutations ON public.games;
CREATE TRIGGER trg_prevent_game_unauthorized_client_mutations
  BEFORE INSERT OR UPDATE OR DELETE ON public.games
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_game_unauthorized_client_mutations();


-- ==============================================================================
-- 2. PUBLIC.GAME_THEMES: BACKEND-WRITE-ONLY POLICIES & PERMISSIONS
-- ==============================================================================

-- Drop vulnerable client write policies on public.game_themes
DROP POLICY IF EXISTS "Owners, admins, designers can insert themes" ON public.game_themes;
DROP POLICY IF EXISTS "Owners, admins, designers can update themes" ON public.game_themes;
DROP POLICY IF EXISTS "Owners and admins can delete themes" ON public.game_themes;
DROP POLICY IF EXISTS "Developer admins can manage all themes" ON public.game_themes;

-- Ensure read policies are clean and properly scoped
DROP POLICY IF EXISTS "Anyone can view system themes" ON public.game_themes;
CREATE POLICY "Anyone can view system themes"
  ON public.game_themes FOR SELECT
  USING (is_system = true OR organization_id IS NULL);

DROP POLICY IF EXISTS "Members can view organization themes" ON public.game_themes;
CREATE POLICY "Members can view organization themes"
  ON public.game_themes FOR SELECT
  USING (organization_id IS NOT NULL AND (public.is_org_member(organization_id) OR public.is_developer_admin()));

-- Revoke direct table-level mutation privileges from client roles
REVOKE INSERT, UPDATE, DELETE ON public.game_themes FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.game_themes FROM anon;

-- Explicitly ensure SELECT is allowed for authenticated and anon users subject to RLS
GRANT SELECT ON public.game_themes TO authenticated;
GRANT SELECT ON public.game_themes TO anon;

-- Defense-in-depth trigger function for public.game_themes
CREATE OR REPLACE FUNCTION public.prevent_game_theme_unauthorized_client_mutations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role text;
  v_uid text;
BEGIN
  -- Retrieve auth context from Supabase JWT claims
  BEGIN
    v_role := current_setting('request.jwt.claim.role', true);
  EXCEPTION WHEN OTHERS THEN
    v_role := NULL;
  END;

  IF v_role IS NULL THEN
    BEGIN
      v_role := auth.role();
    EXCEPTION WHEN OTHERS THEN
      v_role := NULL;
    END;
  END IF;

  BEGIN
    v_uid := current_setting('request.jwt.claim.sub', true);
  EXCEPTION WHEN OTHERS THEN
    v_uid := NULL;
  END;

  IF v_uid IS NULL THEN
    BEGIN
      v_uid := auth.uid()::text;
    EXCEPTION WHEN OTHERS THEN
      v_uid := NULL;
    END;
  END IF;

  -- Block any mutation attempt originating from client roles (authenticated or anon)
  IF v_role IN ('authenticated', 'anon') OR (v_uid IS NOT NULL AND (v_role IS NULL OR v_role != 'service_role')) THEN
    RAISE EXCEPTION 'Direct client mutation on game_themes is strictly prohibited. All theme operations must be routed through the server API.';
  END IF;

  -- Defense-in-depth: safeguard critical columns and isolation rules even if role check is bypassed
  IF TG_OP = 'UPDATE' THEN
    IF v_role IS DISTINCT FROM 'service_role' THEN
      IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
        RAISE EXCEPTION 'Direct update of organization_id on game_themes is strictly prohibited';
      END IF;
      IF NEW.game_id IS DISTINCT FROM OLD.game_id THEN
        RAISE EXCEPTION 'Direct update of game_id on game_themes is strictly prohibited (game association is immutable)';
      END IF;
      IF NEW.is_system IS DISTINCT FROM OLD.is_system THEN
        RAISE EXCEPTION 'Direct update of is_system on game_themes is strictly prohibited';
      END IF;
      IF NEW.ownership_type IS DISTINCT FROM OLD.ownership_type THEN
        RAISE EXCEPTION 'Direct update of ownership_type on game_themes is strictly prohibited';
      END IF;
      IF OLD.is_system = true OR OLD.organization_id IS NULL THEN
        RAISE EXCEPTION 'Direct mutation of system themes is strictly prohibited. System themes are read-only templates.';
      END IF;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    IF v_role IS DISTINCT FROM 'service_role' THEN
      IF NEW.is_system = true OR NEW.organization_id IS NULL THEN
        RAISE EXCEPTION 'Direct creation of system themes is strictly prohibited';
      END IF;
      RAISE EXCEPTION 'Direct client insert on game_themes is strictly prohibited';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF v_role IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'Direct client deletion of game_themes is strictly prohibited';
    END IF;
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_game_theme_unauthorized_client_mutations ON public.game_themes;
CREATE TRIGGER trg_prevent_game_theme_unauthorized_client_mutations
  BEFORE INSERT OR UPDATE OR DELETE ON public.game_themes
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_game_theme_unauthorized_client_mutations();
