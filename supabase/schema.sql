-- ==============================================================================
-- EVENT GAME STUDIO - SUPABASE POSTGRESQL CANONICAL SCHEMA
-- ==============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------------------------
-- 1. USERS TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_id TEXT UNIQUE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  avatar_url TEXT,
  is_developer BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_users_email ON public.users (email);
CREATE INDEX IF NOT EXISTS idx_users_google_id ON public.users (google_id);
CREATE INDEX IF NOT EXISTS idx_users_is_developer ON public.users (is_developer);

-- ------------------------------------------------------------------------------
-- 2. ORGANIZATIONS TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  owner_id UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  logo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_organizations_slug ON public.organizations (slug);
CREATE INDEX IF NOT EXISTS idx_organizations_owner_id ON public.organizations (owner_id);

-- ------------------------------------------------------------------------------
-- 3. ORGANIZATION MEMBERS TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'designer', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT unique_org_user UNIQUE (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_user_id ON public.organization_members (user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org_id ON public.organization_members (organization_id);

-- ------------------------------------------------------------------------------
-- 4. ORGANIZATION INVITATIONS TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organization_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'designer', 'viewer')),
  token_hash TEXT NOT NULL,
  invited_by UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_org_invitations_token_hash ON public.organization_invitations (token_hash);
CREATE INDEX IF NOT EXISTS idx_org_invitations_org_id ON public.organization_invitations (organization_id);
CREATE INDEX IF NOT EXISTS idx_org_invitations_email ON public.organization_invitations (email);

-- ------------------------------------------------------------------------------
-- 5. GAMES TABLE
-- System Game: organization_id = NULL, is_system = true, ownership_type = 'system'
-- Client Game: organization_id = tenant_id, is_system = false, ownership_type = 'organization'
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  game_type TEXT NOT NULL DEFAULT 'catch-brand',
  description TEXT,
  icon_name TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'draft')),
  is_system BOOLEAN NOT NULL DEFAULT false,
  ownership_type TEXT NOT NULL DEFAULT 'organization' CHECK (ownership_type IN ('system', 'organization')),
  background_url TEXT,
  basket_config JSONB,
  items_config JSONB,
  settings_config JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_games_org_id ON public.games (organization_id);
CREATE INDEX IF NOT EXISTS idx_games_slug ON public.games (slug);
CREATE INDEX IF NOT EXISTS idx_games_game_type ON public.games (game_type);
CREATE INDEX IF NOT EXISTS idx_games_is_system ON public.games (is_system);
CREATE INDEX IF NOT EXISTS idx_games_ownership_type ON public.games (ownership_type);
-- Exactly ONE system game per game_type and unique system game slugs
CREATE UNIQUE INDEX IF NOT EXISTS ux_system_games_game_type ON public.games (game_type) WHERE is_system = true;
CREATE UNIQUE INDEX IF NOT EXISTS ux_system_games_slug ON public.games (slug) WHERE is_system = true;

-- ------------------------------------------------------------------------------
-- 6. GAME THEMES TABLE
-- System Theme: organization_id = NULL, game_id = system_game.id, is_system = true, ownership_type = 'system'
-- Client Theme: organization_id = tenant_id, game_id = client_game.id, is_system = false, ownership_type = 'organization'
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.game_themes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations (id) ON DELETE CASCADE,
  game_id UUID REFERENCES public.games (id) ON DELETE CASCADE,
  base_theme_id UUID REFERENCES public.game_themes (id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'draft')),
  is_system BOOLEAN NOT NULL DEFAULT false,
  is_default BOOLEAN NOT NULL DEFAULT false,
  ownership_type TEXT NOT NULL DEFAULT 'organization' CHECK (ownership_type IN ('system', 'organization')),
  branding JSONB NOT NULL DEFAULT '{}'::jsonb,
  background_url TEXT,
  basket_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  items_config JSONB NOT NULL DEFAULT '[]'::jsonb,
  physics_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  visuals_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  sounds_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  layout JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_game_themes_org_id ON public.game_themes (organization_id);
CREATE INDEX IF NOT EXISTS idx_game_themes_game_id ON public.game_themes (game_id);
CREATE INDEX IF NOT EXISTS idx_game_themes_base_theme_id ON public.game_themes (base_theme_id);
CREATE INDEX IF NOT EXISTS idx_game_themes_slug ON public.game_themes (slug);
CREATE INDEX IF NOT EXISTS idx_game_themes_is_system ON public.game_themes (is_system);
CREATE INDEX IF NOT EXISTS idx_game_themes_is_default ON public.game_themes (is_default);
CREATE INDEX IF NOT EXISTS idx_game_themes_ownership_type ON public.game_themes (ownership_type);

-- ------------------------------------------------------------------------------
-- 7. EVENTS TABLE (DEPLOYMENT INSTANCE LINKING A GAME THEME)
-- Events explicitly select and bind to specific themes via game_theme_id.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  game_theme_id UUID NOT NULL REFERENCES public.game_themes (id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  event_date TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('draft', 'scheduled', 'live', 'expired', 'cancelled')),
  public_token TEXT UNIQUE NOT NULL,
  created_by UUID REFERENCES public.users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_events_org_id ON public.events (organization_id);
CREATE INDEX IF NOT EXISTS idx_events_game_theme_id ON public.events (game_theme_id);
CREATE INDEX IF NOT EXISTS idx_events_public_token ON public.events (public_token);
CREATE INDEX IF NOT EXISTS idx_events_status ON public.events (status);
CREATE INDEX IF NOT EXISTS idx_events_starts_expires ON public.events (starts_at, expires_at);

-- ------------------------------------------------------------------------------
-- 8. ROW LEVEL SECURITY & HELPER FUNCTIONS
-- ------------------------------------------------------------------------------
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_org_member(org_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = org_id AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_org_role(org_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT role INTO v_role
  FROM public.organization_members
  WHERE organization_id = org_id AND user_id = auth.uid();
  RETURN v_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_developer_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND is_developer = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- USERS POLICIES
DROP POLICY IF EXISTS "Users can view own user record" ON public.users;
CREATE POLICY "Users can view own user record"
  ON public.users FOR SELECT
  USING (id = auth.uid() OR public.is_developer_admin());

DROP POLICY IF EXISTS "Users can update own user record" ON public.users;
CREATE POLICY "Users can update own user record"
  ON public.users FOR UPDATE
  USING (id = auth.uid());

-- ORGANIZATIONS POLICIES
DROP POLICY IF EXISTS "Members can view their organizations" ON public.organizations;
CREATE POLICY "Members can view their organizations"
  ON public.organizations FOR SELECT
  USING (public.is_org_member(id) OR public.is_developer_admin());

DROP POLICY IF EXISTS "Authenticated users can create organizations" ON public.organizations;
CREATE POLICY "Authenticated users can create organizations"
  ON public.organizations FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Owners and admins can update organization" ON public.organizations;
CREATE POLICY "Owners and admins can update organization"
  ON public.organizations FOR UPDATE
  USING (public.get_org_role(id) IN ('owner', 'admin') OR public.is_developer_admin());

-- MEMBERS POLICIES
DROP POLICY IF EXISTS "Members can view organization members" ON public.organization_members;
CREATE POLICY "Members can view organization members"
  ON public.organization_members FOR SELECT
  USING (public.is_org_member(organization_id) OR public.is_developer_admin());

DROP POLICY IF EXISTS "Owners and admins can manage members" ON public.organization_members;
CREATE POLICY "Owners and admins can manage members"
  ON public.organization_members FOR INSERT
  WITH CHECK (public.get_org_role(organization_id) IN ('owner', 'admin') OR public.is_developer_admin());

DROP POLICY IF EXISTS "Owners and admins can update member roles" ON public.organization_members;
CREATE POLICY "Owners and admins can update member roles"
  ON public.organization_members FOR UPDATE
  USING (public.get_org_role(organization_id) IN ('owner', 'admin') OR public.is_developer_admin());

DROP POLICY IF EXISTS "Owners and admins can remove members" ON public.organization_members;
CREATE POLICY "Owners and admins can remove members"
  ON public.organization_members FOR DELETE
  USING (public.get_org_role(organization_id) IN ('owner', 'admin') OR user_id = auth.uid() OR public.is_developer_admin());

-- INVITATIONS POLICIES
DROP POLICY IF EXISTS "Members can view invitations" ON public.organization_invitations;
CREATE POLICY "Members can view invitations"
  ON public.organization_invitations FOR SELECT
  USING (public.is_org_member(organization_id) OR public.is_developer_admin());

DROP POLICY IF EXISTS "Owners and admins can create invitations" ON public.organization_invitations;
CREATE POLICY "Owners and admins can create invitations"
  ON public.organization_invitations FOR INSERT
  WITH CHECK (public.get_org_role(organization_id) IN ('owner', 'admin') OR public.is_developer_admin());

DROP POLICY IF EXISTS "Owners and admins can delete invitations" ON public.organization_invitations;
CREATE POLICY "Owners and admins can delete invitations"
  ON public.organization_invitations FOR DELETE
  USING (public.get_org_role(organization_id) IN ('owner', 'admin') OR public.is_developer_admin());

-- GAMES POLICIES
DROP POLICY IF EXISTS "Developer admins can manage all games" ON public.games;
CREATE POLICY "Developer admins can manage all games"
  ON public.games FOR ALL
  USING (public.is_developer_admin());

DROP POLICY IF EXISTS "Anyone can view system games" ON public.games;
CREATE POLICY "Anyone can view system games"
  ON public.games FOR SELECT
  USING (is_system = true OR organization_id IS NULL);

DROP POLICY IF EXISTS "Members can view organization games" ON public.games;
CREATE POLICY "Members can view organization games"
  ON public.games FOR SELECT
  USING (organization_id IS NOT NULL AND public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Owners, admins, designers can insert games" ON public.games;
CREATE POLICY "Owners, admins, designers can insert games"
  ON public.games FOR INSERT
  WITH CHECK (organization_id IS NOT NULL AND public.get_org_role(organization_id) IN ('owner', 'admin', 'designer'));

DROP POLICY IF EXISTS "Owners, admins, designers can update games" ON public.games;
CREATE POLICY "Owners, admins, designers can update games"
  ON public.games FOR UPDATE
  USING (organization_id IS NOT NULL AND public.get_org_role(organization_id) IN ('owner', 'admin', 'designer'));

DROP POLICY IF EXISTS "Owners and admins can delete games" ON public.games;
CREATE POLICY "Owners and admins can delete games"
  ON public.games FOR DELETE
  USING (organization_id IS NOT NULL AND public.get_org_role(organization_id) IN ('owner', 'admin'));

-- GAME THEMES POLICIES
DROP POLICY IF EXISTS "Developer admins can manage all themes" ON public.game_themes;
CREATE POLICY "Developer admins can manage all themes"
  ON public.game_themes FOR ALL
  USING (public.is_developer_admin());

DROP POLICY IF EXISTS "Anyone can view system themes" ON public.game_themes;
CREATE POLICY "Anyone can view system themes"
  ON public.game_themes FOR SELECT
  USING (is_system = true OR organization_id IS NULL);

DROP POLICY IF EXISTS "Members can view organization themes" ON public.game_themes;
CREATE POLICY "Members can view organization themes"
  ON public.game_themes FOR SELECT
  USING (organization_id IS NOT NULL AND public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Owners, admins, designers can insert themes" ON public.game_themes;
CREATE POLICY "Owners, admins, designers can insert themes"
  ON public.game_themes FOR INSERT
  WITH CHECK (organization_id IS NOT NULL AND public.get_org_role(organization_id) IN ('owner', 'admin', 'designer'));

DROP POLICY IF EXISTS "Owners, admins, designers can update themes" ON public.game_themes;
CREATE POLICY "Owners, admins, designers can update themes"
  ON public.game_themes FOR UPDATE
  USING (organization_id IS NOT NULL AND public.get_org_role(organization_id) IN ('owner', 'admin', 'designer'));

DROP POLICY IF EXISTS "Owners and admins can delete themes" ON public.game_themes;
CREATE POLICY "Owners and admins can delete themes"
  ON public.game_themes FOR DELETE
  USING (organization_id IS NOT NULL AND public.get_org_role(organization_id) IN ('owner', 'admin'));

-- EVENTS POLICIES
DROP POLICY IF EXISTS "Members can view organization events" ON public.events;
CREATE POLICY "Members can view organization events"
  ON public.events FOR SELECT
  USING (public.is_org_member(organization_id) OR public.is_developer_admin());

DROP POLICY IF EXISTS "Owners, admins, designers can insert events" ON public.events;
CREATE POLICY "Owners, admins, designers can insert events"
  ON public.events FOR INSERT
  WITH CHECK (public.get_org_role(organization_id) IN ('owner', 'admin', 'designer') OR public.is_developer_admin());

DROP POLICY IF EXISTS "Owners, admins, designers can update events" ON public.events;
CREATE POLICY "Owners, admins, designers can update events"
  ON public.events FOR UPDATE
  USING (public.get_org_role(organization_id) IN ('owner', 'admin', 'designer') OR public.is_developer_admin());

DROP POLICY IF EXISTS "Owners and admins can delete events" ON public.events;
CREATE POLICY "Owners and admins can delete events"
  ON public.events FOR DELETE
  USING (public.get_org_role(organization_id) IN ('owner', 'admin') OR public.is_developer_admin());

-- ------------------------------------------------------------------------------
-- 9. SUPABASE STORAGE SETUP (game-assets bucket)
-- ------------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('game-assets', 'game-assets', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read access for game-assets" ON storage.objects;
CREATE POLICY "Public read access for game-assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'game-assets');

DROP POLICY IF EXISTS "Authenticated users can upload game-assets" ON storage.objects;
CREATE POLICY "Authenticated users can upload game-assets"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'game-assets');

DROP POLICY IF EXISTS "Authenticated users can update game-assets" ON storage.objects;
CREATE POLICY "Authenticated users can update game-assets"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'game-assets');
