-- ==============================================================================
-- MIGRATION 001: Upgrade to Multiple Games, Themes per Game & Event Deployments
-- ==============================================================================
-- Description:
--   Upgrades the existing single-game Catch Brand schema into a multi-game,
--   multi-theme per game, and event-based deployment architecture.
--   Safely preserves existing Catch Brand games, themes, and configurations.
--
-- Hierarchy:
--   Organization -> Games -> Game Themes -> Events (game_theme_id)
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 0. EXTENSIONS & PREREQUISITES
-- ------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------------------------
-- 1. USERS & ORGANIZATIONS BASELINE (SAFE CHECKS)
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

CREATE INDEX IF NOT EXISTS idx_users_email ON public.users (email);
CREATE INDEX IF NOT EXISTS idx_users_google_id ON public.users (google_id);

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
-- 2. UPGRADE GAMES TABLE (PRESERVE EXISTING CATCH BRAND DATA)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Safely add missing columns
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS game_type TEXT NOT NULL DEFAULT 'catch-brand';
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS icon_name TEXT;
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS active_theme_id UUID;
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS background_url TEXT;
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS basket_config JSONB;
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS items_config JSONB;
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS settings_config JSONB;

-- For existing records that may have NULL game_type, default to 'catch-brand'
UPDATE public.games
SET game_type = 'catch-brand'
WHERE game_type IS NULL OR game_type = '';

-- Indexes for games table
CREATE INDEX IF NOT EXISTS idx_games_org_id ON public.games (organization_id);
CREATE INDEX IF NOT EXISTS idx_games_slug ON public.games (slug);
CREATE INDEX IF NOT EXISTS idx_games_game_type ON public.games (game_type);

-- ------------------------------------------------------------------------------
-- 3. UPGRADE GAME_THEMES TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.game_themes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Safely add missing theme columns
ALTER TABLE public.game_themes ADD COLUMN IF NOT EXISTS game_id UUID;
ALTER TABLE public.game_themes ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.game_themes ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE public.game_themes ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.game_themes ADD COLUMN IF NOT EXISTS branding JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.game_themes ADD COLUMN IF NOT EXISTS background_url TEXT;
ALTER TABLE public.game_themes ADD COLUMN IF NOT EXISTS basket_config JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.game_themes ADD COLUMN IF NOT EXISTS items_config JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.game_themes ADD COLUMN IF NOT EXISTS physics_config JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.game_themes ADD COLUMN IF NOT EXISTS visuals_config JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.game_themes ADD COLUMN IF NOT EXISTS sounds_config JSONB NOT NULL DEFAULT '{}'::jsonb;

-- ------------------------------------------------------------------------------
-- 4. EXISTING CATCH BRAND DATA BACKFILL & ASSOCIATION
-- ------------------------------------------------------------------------------
-- Associate orphaned themes (where game_id IS NULL) with the organization's
-- Catch Brand game. If no Catch Brand game exists for an org that has themes,
-- create one safely before associating.

DO $$
DECLARE
  org_rec RECORD;
  catch_game_id UUID;
BEGIN
  -- For each organization with existing game_themes lacking game_id
  FOR org_rec IN
    SELECT DISTINCT organization_id
    FROM public.game_themes
    WHERE game_id IS NULL
  LOOP
    -- 1. Look for existing Catch Brand game in this organization
    SELECT id INTO catch_game_id
    FROM public.games
    WHERE organization_id = org_rec.organization_id
      AND (game_type = 'catch-brand' OR slug = 'durian-catcher' OR slug = 'catch-brand')
    ORDER BY created_at ASC
    LIMIT 1;

    -- 2. If no explicit catch game found, take the first game in that organization
    IF catch_game_id IS NULL THEN
      SELECT id INTO catch_game_id
      FROM public.games
      WHERE organization_id = org_rec.organization_id
      ORDER BY created_at ASC
      LIMIT 1;
    END IF;

    -- 3. If the organization has NO games at all, create a default Catch Brand game
    IF catch_game_id IS NULL THEN
      INSERT INTO public.games (
        id,
        organization_id,
        name,
        slug,
        game_type,
        description,
        icon_name,
        status,
        background_url,
        created_at,
        updated_at
      ) VALUES (
        gen_random_uuid(),
        org_rec.organization_id,
        'Durian Catcher',
        'durian-catcher',
        'catch-brand',
        'Catch falling branded collectibles with precision paddle/basket mechanics.',
        'Gamepad2',
        'active',
        '/assets/background.png',
        timezone('utc'::text, now()),
        timezone('utc'::text, now())
      ) RETURNING id INTO catch_game_id;
    END IF;

    -- 4. Assign all orphaned themes for this organization to this game
    UPDATE public.game_themes
    SET game_id = catch_game_id
    WHERE organization_id = org_rec.organization_id
      AND game_id IS NULL;
  END LOOP;
END $$;

-- Verify all themes now have a valid game_id
DO $$
DECLARE
  unassigned_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO unassigned_count
  FROM public.game_themes
  WHERE game_id IS NULL;

  IF unassigned_count > 0 THEN
    RAISE EXCEPTION 'Migration Error: % theme(s) still have NULL game_id. Please assign them before proceeding.', unassigned_count;
  END IF;
END $$;

-- Now enforce NOT NULL on game_id
ALTER TABLE public.game_themes ALTER COLUMN game_id SET NOT NULL;

-- Ensure foreign key from game_themes to games exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_game_themes_game_id' AND table_name = 'game_themes'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'game_themes_game_id_fkey' AND table_name = 'game_themes'
  ) THEN
    ALTER TABLE public.game_themes
    ADD CONSTRAINT fk_game_themes_game_id
    FOREIGN KEY (game_id) REFERENCES public.games (id) ON DELETE CASCADE;
  END IF;
END $$;

-- Indexes for game_themes table
CREATE INDEX IF NOT EXISTS idx_game_themes_org_id ON public.game_themes (organization_id);
CREATE INDEX IF NOT EXISTS idx_game_themes_game_id ON public.game_themes (game_id);
CREATE INDEX IF NOT EXISTS idx_game_themes_slug ON public.game_themes (slug);
CREATE INDEX IF NOT EXISTS idx_game_themes_is_active ON public.game_themes (is_active);

-- ------------------------------------------------------------------------------
-- 5. ACTIVE THEME SINGLE SOURCE OF TRUTH (games.active_theme_id)
-- ------------------------------------------------------------------------------
-- Backfill games.active_theme_id from game_themes.is_active if not already populated
UPDATE public.games g
SET active_theme_id = gt.id
FROM public.game_themes gt
WHERE g.id = gt.game_id
  AND gt.is_active = true
  AND g.active_theme_id IS NULL;

-- Fallback: If a game still has NULL active_theme_id, set it to the oldest theme for that game
UPDATE public.games g
SET active_theme_id = (
  SELECT id FROM public.game_themes
  WHERE game_id = g.id
  ORDER BY created_at ASC
  LIMIT 1
)
WHERE g.active_theme_id IS NULL
  AND EXISTS (SELECT 1 FROM public.game_themes WHERE game_id = g.id);

-- Foreign key for games.active_theme_id -> game_themes(id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_games_active_theme' AND table_name = 'games'
  ) THEN
    ALTER TABLE public.games
    ADD CONSTRAINT fk_games_active_theme
    FOREIGN KEY (active_theme_id) REFERENCES public.game_themes (id) ON DELETE SET NULL;
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 6. EVENTS TABLE (DEPLOYMENT INSTANCE LINKING A SINGLE GAME THEME)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  game_theme_id UUID NOT NULL REFERENCES public.game_themes (id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  event_date TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('draft', 'scheduled', 'live', 'expired', 'cancelled', 'pending_payment')),
  payment_status TEXT NOT NULL DEFAULT 'UNPAID' CHECK (payment_status IN ('PAID', 'UNPAID', 'REFUNDED', 'PENDING_PAYMENT')),
  payment_mode TEXT,
  event_price NUMERIC(10, 2) NOT NULL DEFAULT 1400.00,
  event_currency TEXT NOT NULL DEFAULT 'MYR',
  paid_amount NUMERIC(10, 2) DEFAULT 0.00,
  discount_amount NUMERIC(10, 2) DEFAULT 0.00,
  public_token TEXT UNIQUE NOT NULL,
  created_by UUID REFERENCES public.users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Safely add any missing columns to existing events table
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS event_date TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'scheduled';
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'UNPAID';
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS payment_mode TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS event_price NUMERIC(10, 2) NOT NULL DEFAULT 1400.00;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS event_currency TEXT NOT NULL DEFAULT 'MYR';
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(10, 2) DEFAULT 0.00;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10, 2) DEFAULT 0.00;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS public_token TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS created_by UUID;

-- Indexes for events table
CREATE INDEX IF NOT EXISTS idx_events_org_id ON public.events (organization_id);
CREATE INDEX IF NOT EXISTS idx_events_game_theme_id ON public.events (game_theme_id);
CREATE INDEX IF NOT EXISTS idx_events_public_token ON public.events (public_token);
CREATE INDEX IF NOT EXISTS idx_events_status ON public.events (status);
CREATE INDEX IF NOT EXISTS idx_events_payment_status ON public.events (payment_status);
CREATE INDEX IF NOT EXISTS idx_events_starts_at ON public.events (starts_at);
CREATE INDEX IF NOT EXISTS idx_events_expires_at ON public.events (expires_at);

-- ------------------------------------------------------------------------------
-- 7. UPDATED_AT TRIGGER FUNCTION & TRIGGERS
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

DROP TRIGGER IF EXISTS set_games_updated_at ON public.games;
CREATE TRIGGER set_games_updated_at
  BEFORE UPDATE ON public.games
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_game_themes_updated_at ON public.game_themes;
CREATE TRIGGER set_game_themes_updated_at
  BEFORE UPDATE ON public.game_themes
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_events_updated_at ON public.events;
CREATE TRIGGER set_events_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ------------------------------------------------------------------------------
-- 8. ROW LEVEL SECURITY (RLS) & HELPER FUNCTIONS
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
  SELECT role INTO v_role FROM public.organization_members
  WHERE organization_id = org_id AND user_id = auth.uid();
  RETURN v_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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

-- EVENTS POLICIES
DROP POLICY IF EXISTS "Members can view organization events" ON public.events;
CREATE POLICY "Members can view organization events"
  ON public.events FOR SELECT
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Owners, admins, designers can insert events" ON public.events;
CREATE POLICY "Owners, admins, designers can insert events"
  ON public.events FOR INSERT
  WITH CHECK (public.get_org_role(organization_id) IN ('owner', 'admin', 'designer'));

DROP POLICY IF EXISTS "Owners, admins, designers can update events" ON public.events;
CREATE POLICY "Owners, admins, designers can update events"
  ON public.events FOR UPDATE
  USING (public.get_org_role(organization_id) IN ('owner', 'admin', 'designer'));

DROP POLICY IF EXISTS "Owners and admins can delete events" ON public.events;
CREATE POLICY "Owners and admins can delete events"
  ON public.events FOR DELETE
  USING (public.get_org_role(organization_id) IN ('owner', 'admin'));

-- ------------------------------------------------------------------------------
-- 9. STORAGE SETUP (game-assets bucket)
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

COMMIT;

-- ==============================================================================
-- 10. MIGRATION VERIFICATION QUERIES
-- ==============================================================================
-- Run these queries to verify the migration status:
--
-- 1. Check all games and their assigned active themes:
-- SELECT g.id, g.organization_id, g.name, g.slug, g.game_type, g.active_theme_id, gt.name as active_theme_name
-- FROM public.games g
-- LEFT JOIN public.game_themes gt ON g.active_theme_id = gt.id;
--
-- 2. Check all themes and their parent games (must not have NULL game_id):
-- SELECT gt.id, gt.name, gt.slug, gt.organization_id, gt.game_id, g.name as parent_game_name
-- FROM public.game_themes gt
-- LEFT JOIN public.games g ON gt.game_id = g.id;
--
-- 3. Check all events and their linked game theme & game:
-- SELECT e.id, e.name, e.status, e.public_token, e.starts_at, e.expires_at, gt.name as theme_name, g.name as game_name
-- FROM public.events e
-- LEFT JOIN public.game_themes gt ON e.game_theme_id = gt.id
-- LEFT JOIN public.games g ON gt.game_id = g.id;
--
-- 4. Integrity assertions (should return 0 rows):
-- SELECT * FROM public.game_themes WHERE game_id IS NULL;
-- SELECT * FROM public.events WHERE game_theme_id IS NULL;
