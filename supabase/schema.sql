-- ==============================================================================
-- DURAN CATCHER ARCADE & STUDIO - SUPABASE POSTGRESQL SCHEMA MIGRATION
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Index on email for quick lookup
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users (email);
CREATE INDEX IF NOT EXISTS idx_users_google_id ON public.users (google_id);

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
-- 5. GAME THEMES TABLE (SINGLE SOURCE OF TRUTH FOR THEMES)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.game_themes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'draft')),
  is_active BOOLEAN NOT NULL DEFAULT false,
  branding JSONB NOT NULL DEFAULT '{}'::jsonb,
  background_url TEXT,
  basket_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  items_config JSONB NOT NULL DEFAULT '[]'::jsonb,
  physics_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  visuals_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  sounds_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_game_themes_org_id ON public.game_themes (organization_id);
CREATE INDEX IF NOT EXISTS idx_game_themes_slug ON public.game_themes (slug);
CREATE INDEX IF NOT EXISTS idx_game_themes_is_active ON public.game_themes (is_active);

-- ------------------------------------------------------------------------------
-- 6. GAMES TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  active_theme_id UUID REFERENCES public.game_themes (id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'draft')),
  background_url TEXT,
  basket_config JSONB,
  items_config JSONB,
  settings_config JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_games_org_id ON public.games (organization_id);
CREATE INDEX IF NOT EXISTS idx_games_slug ON public.games (slug);
CREATE INDEX IF NOT EXISTS idx_games_active_theme_id ON public.games (active_theme_id);

-- ------------------------------------------------------------------------------
-- 7. AUTOMATIC UPDATED_AT TRIGGER FUNCTION
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_users_updated_at ON public.users;
CREATE TRIGGER set_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_orgs_updated_at ON public.organizations;
CREATE TRIGGER set_orgs_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_game_themes_updated_at ON public.game_themes;
CREATE TRIGGER set_game_themes_updated_at
  BEFORE UPDATE ON public.game_themes
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_games_updated_at ON public.games;
CREATE TRIGGER set_games_updated_at
  BEFORE UPDATE ON public.games
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ------------------------------------------------------------------------------
-- 8. ROW LEVEL SECURITY (RLS) POLICIES
-- ------------------------------------------------------------------------------

-- Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;

-- Helper security function to check if current auth.uid() is a member of an organization
CREATE OR REPLACE FUNCTION public.is_org_member(org_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = org_id AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper security function to check if current auth.uid() has specific role
CREATE OR REPLACE FUNCTION public.get_org_role(org_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT role INTO v_role FROM public.organization_members
  WHERE organization_id = org_id AND user_id = auth.uid();
  RETURN v_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- GAME THEMES POLICIES
DROP POLICY IF EXISTS "Members can view organization game themes" ON public.game_themes;
CREATE POLICY "Members can view organization game themes"
  ON public.game_themes FOR SELECT
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Owners, admins, designers can insert game themes" ON public.game_themes;
CREATE POLICY "Owners, admins, designers can insert game themes"
  ON public.game_themes FOR INSERT
  WITH CHECK (public.get_org_role(organization_id) IN ('owner', 'admin', 'designer'));

DROP POLICY IF EXISTS "Owners, admins, designers can update game themes" ON public.game_themes;
CREATE POLICY "Owners, admins, designers can update game themes"
  ON public.game_themes FOR UPDATE
  USING (public.get_org_role(organization_id) IN ('owner', 'admin', 'designer'));

DROP POLICY IF EXISTS "Owners and admins can delete game themes" ON public.game_themes;
CREATE POLICY "Owners and admins can delete game themes"
  ON public.game_themes FOR DELETE
  USING (public.get_org_role(organization_id) IN ('owner', 'admin'));

-- USERS POLICIES
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
CREATE POLICY "Users can view own profile"
  ON public.users FOR SELECT
  USING (auth.uid() = id OR id IN (
    SELECT om.user_id FROM public.organization_members om
    WHERE om.organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  ));

DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
CREATE POLICY "Users can update own profile"
  ON public.users FOR UPDATE
  USING (auth.uid() = id);

-- ORGANIZATIONS POLICIES
DROP POLICY IF EXISTS "Members can view their organizations" ON public.organizations;
CREATE POLICY "Members can view their organizations"
  ON public.organizations FOR SELECT
  USING (public.is_org_member(id) OR owner_id = auth.uid());

DROP POLICY IF EXISTS "Authenticated users can create organizations" ON public.organizations;
CREATE POLICY "Authenticated users can create organizations"
  ON public.organizations FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owners and admins can update organizations" ON public.organizations;
CREATE POLICY "Owners and admins can update organizations"
  ON public.organizations FOR UPDATE
  USING (public.get_org_role(id) IN ('owner', 'admin') OR owner_id = auth.uid());

DROP POLICY IF EXISTS "Owners can delete organizations" ON public.organizations;
CREATE POLICY "Owners can delete organizations"
  ON public.organizations FOR DELETE
  USING (owner_id = auth.uid());

-- ORGANIZATION MEMBERS POLICIES
DROP POLICY IF EXISTS "Members can view organization member list" ON public.organization_members;
CREATE POLICY "Members can view organization member list"
  ON public.organization_members FOR SELECT
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Owners and admins can manage members" ON public.organization_members;
CREATE POLICY "Owners and admins can manage members"
  ON public.organization_members FOR INSERT
  WITH CHECK (public.get_org_role(organization_id) IN ('owner', 'admin'));

DROP POLICY IF EXISTS "Owners and admins can update member roles" ON public.organization_members;
CREATE POLICY "Owners and admins can update member roles"
  ON public.organization_members FOR UPDATE
  USING (public.get_org_role(organization_id) IN ('owner', 'admin'));

DROP POLICY IF EXISTS "Owners and admins can remove members" ON public.organization_members;
CREATE POLICY "Owners and admins can remove members"
  ON public.organization_members FOR DELETE
  USING (public.get_org_role(organization_id) IN ('owner', 'admin') OR user_id = auth.uid());

-- INVITATIONS POLICIES
DROP POLICY IF EXISTS "Members can view invitations" ON public.organization_invitations;
CREATE POLICY "Members can view invitations"
  ON public.organization_invitations FOR SELECT
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Owners and admins can create invitations" ON public.organization_invitations;
CREATE POLICY "Owners and admins can create invitations"
  ON public.organization_invitations FOR INSERT
  WITH CHECK (public.get_org_role(organization_id) IN ('owner', 'admin'));

DROP POLICY IF EXISTS "Owners and admins can delete invitations" ON public.organization_invitations;
CREATE POLICY "Owners and admins can delete invitations"
  ON public.organization_invitations FOR DELETE
  USING (public.get_org_role(organization_id) IN ('owner', 'admin'));

-- GAMES POLICIES
DROP POLICY IF EXISTS "Members can view organization games" ON public.games;
CREATE POLICY "Members can view organization games"
  ON public.games FOR SELECT
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Owners, admins, designers can insert games" ON public.games;
CREATE POLICY "Owners, admins, designers can insert games"
  ON public.games FOR INSERT
  WITH CHECK (public.get_org_role(organization_id) IN ('owner', 'admin', 'designer'));

DROP POLICY IF EXISTS "Owners, admins, designers can update games" ON public.games;
CREATE POLICY "Owners, admins, designers can update games"
  ON public.games FOR UPDATE
  USING (public.get_org_role(organization_id) IN ('owner', 'admin', 'designer'));

DROP POLICY IF EXISTS "Owners and admins can delete games" ON public.games;
CREATE POLICY "Owners and admins can delete games"
  ON public.games FOR DELETE
  USING (public.get_org_role(organization_id) IN ('owner', 'admin'));

-- ------------------------------------------------------------------------------
-- 8. SUPABASE STORAGE SETUP (game-assets bucket)
-- ------------------------------------------------------------------------------
-- Insert bucket if not exists into storage.buckets
INSERT INTO storage.buckets (id, name, public)
VALUES ('game-assets', 'game-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for game-assets bucket:
-- Allow public access to view assets
DROP POLICY IF EXISTS "Public read access for game-assets" ON storage.objects;
CREATE POLICY "Public read access for game-assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'game-assets');

-- Allow authenticated uploads to game-assets
DROP POLICY IF EXISTS "Authenticated users can upload game-assets" ON storage.objects;
CREATE POLICY "Authenticated users can upload game-assets"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'game-assets');

DROP POLICY IF EXISTS "Authenticated users can update game-assets" ON storage.objects;
CREATE POLICY "Authenticated users can update game-assets"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'game-assets');
