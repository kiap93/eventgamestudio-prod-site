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
  country_code VARCHAR(2) CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_organizations_slug ON public.organizations (slug);
CREATE INDEX IF NOT EXISTS idx_organizations_owner_id ON public.organizations (owner_id);
CREATE INDEX IF NOT EXISTS idx_organizations_country_code ON public.organizations (country_code);

-- Trigger Function: Enforce Owner-Level Organization Limit (Max 5 organizations per user)
CREATE OR REPLACE FUNCTION public.check_owner_organization_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.organizations
  WHERE owner_id = NEW.owner_id;

  IF v_count >= 5 THEN
    RAISE EXCEPTION 'Organization limit reached: You can own a maximum of 5 organizations.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_owner_organization_limit ON public.organizations;
CREATE TRIGGER trg_enforce_owner_organization_limit
  BEFORE INSERT ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.check_owner_organization_limit();

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
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived', 'draft')),
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
  game_config JSONB NOT NULL DEFAULT '{}'::jsonb,
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
  game_id UUID REFERENCES public.games (id) ON DELETE RESTRICT,
  game_theme_id UUID NOT NULL REFERENCES public.game_themes (id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  event_date TEXT,
  start_date TEXT,
  end_date TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'live', 'expired', 'cancelled', 'pending_payment', 'active', 'completed')),
  event_status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (event_status IN ('DRAFT', 'PAYMENT_PENDING', 'LIVE', 'COMPLETED', 'EXPIRED', 'CANCELLED')),
  payment_status TEXT NOT NULL DEFAULT 'UNPAID' CHECK (payment_status IN ('UNPAID', 'PENDING', 'PAID', 'FAILED', 'REFUNDED', 'PENDING_PAYMENT')),
  cancel_reason TEXT CHECK (cancel_reason IS NULL OR cancel_reason IN ('USER_CANCELLED', 'PAYMENT_TIMEOUT', 'ADMIN_CANCELLED')),
  payment_mode TEXT,
  event_price NUMERIC(10, 2) NOT NULL DEFAULT 1400.00,
  event_currency TEXT NOT NULL DEFAULT 'MYR',
  paid_amount NUMERIC(10, 2) DEFAULT 0.00,
  discount_amount NUMERIC(10, 2) DEFAULT 0.00,
  public_token TEXT UNIQUE NOT NULL,
  test_scores_cleared_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.users (id) ON DELETE SET NULL,
  event_timezone TEXT DEFAULT 'Asia/Singapore',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Ensure all canonical columns exist on public.events even if table already existed prior
DO $$
BEGIN
  -- 1. If legacy or mismatched column 'theme_id' exists on events, but 'game_theme_id' does not, rename it
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'theme_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'game_theme_id'
  ) THEN
    ALTER TABLE public.events RENAME COLUMN theme_id TO game_theme_id;
  END IF;

  -- 2. Ensure game_id can be UUID if it was previously created as TEXT or VARCHAR
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'game_id' AND data_type IN ('text', 'character varying', 'character')
  ) THEN
    BEGIN
      -- First resolve any text game slugs to game UUIDs if possible
      UPDATE public.events e
      SET game_id = g.id::text
      FROM public.games g
      WHERE e.game_id = g.slug
        AND e.game_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

      -- Now alter column to UUID using regex check (subqueries are forbidden in USING clause)
      ALTER TABLE public.events ALTER COLUMN game_id TYPE UUID USING (
        CASE 
          WHEN game_id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN game_id::text::uuid
          ELSE NULL
        END
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  -- 3. If start_date, end_date, or event_date was created as date or timestamp, safely alter to TEXT
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'start_date' AND data_type = 'date'
  ) THEN
    ALTER TABLE public.events ALTER COLUMN start_date TYPE TEXT USING to_char(start_date, 'YYYY-MM-DD');
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'end_date' AND data_type = 'date'
  ) THEN
    ALTER TABLE public.events ALTER COLUMN end_date TYPE TEXT USING to_char(end_date, 'YYYY-MM-DD');
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'event_date' AND data_type = 'date'
  ) THEN
    ALTER TABLE public.events ALTER COLUMN event_date TYPE TEXT USING to_char(event_date, 'YYYY-MM-DD');
  END IF;
END $$;

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS game_theme_id UUID REFERENCES public.game_themes (id) ON DELETE RESTRICT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS game_id UUID REFERENCES public.games (id) ON DELETE RESTRICT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS event_date TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS start_date TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS end_date TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft' NOT NULL;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS event_status TEXT DEFAULT 'DRAFT' NOT NULL;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'UNPAID' NOT NULL;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS payment_mode TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS event_price NUMERIC(10, 2) DEFAULT 1400.00 NOT NULL;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS event_currency TEXT DEFAULT 'MYR' NOT NULL;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(10, 2) DEFAULT 0.00;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10, 2) DEFAULT 0.00;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS public_token TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS test_scores_cleared_at TIMESTAMPTZ;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.users (id) ON DELETE SET NULL;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS event_timezone TEXT DEFAULT 'Asia/Singapore';

-- Backfill public_token if missing on any existing rows
UPDATE public.events 
SET public_token = encode(gen_random_bytes(16), 'hex') 
WHERE public_token IS NULL;

-- Backfill starts_at and expires_at if missing
UPDATE public.events 
SET starts_at = COALESCE(created_at, timezone('utc'::text, now())) 
WHERE starts_at IS NULL;

UPDATE public.events 
SET expires_at = COALESCE(starts_at + interval '1 day', timezone('utc'::text, now()) + interval '1 day') 
WHERE expires_at IS NULL;

-- Backfill game_theme_id if missing on existing rows
UPDATE public.events e
SET game_theme_id = (
  SELECT id FROM public.game_themes gt 
  WHERE gt.game_id::text = e.game_id::text 
     OR gt.game_id IN (SELECT g.id FROM public.games g WHERE g.slug = e.game_id::text)
     OR gt.is_system = true 
  ORDER BY gt.is_default DESC, gt.created_at ASC 
  LIMIT 1
)
WHERE e.game_theme_id IS NULL;

UPDATE public.events e
SET game_theme_id = (
  SELECT id FROM public.game_themes 
  ORDER BY created_at ASC 
  LIMIT 1
)
WHERE e.game_theme_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_events_org_id ON public.events (organization_id);
CREATE INDEX IF NOT EXISTS idx_events_game_id ON public.events (game_id);
CREATE INDEX IF NOT EXISTS idx_events_game_theme_id ON public.events (game_theme_id);
CREATE INDEX IF NOT EXISTS idx_events_public_token ON public.events (public_token);
CREATE INDEX IF NOT EXISTS idx_events_status ON public.events (status);
CREATE INDEX IF NOT EXISTS idx_events_event_status ON public.events (event_status);
CREATE INDEX IF NOT EXISTS idx_events_payment_status ON public.events (payment_status);
CREATE INDEX IF NOT EXISTS idx_events_event_timezone ON public.events (event_timezone);
CREATE INDEX IF NOT EXISTS idx_events_starts_at ON public.events (starts_at);
CREATE INDEX IF NOT EXISTS idx_events_expires_at ON public.events (expires_at);
CREATE INDEX IF NOT EXISTS idx_events_start_date ON public.events (start_date);
CREATE INDEX IF NOT EXISTS idx_events_end_date ON public.events (end_date);
CREATE INDEX IF NOT EXISTS idx_events_starts_expires ON public.events (starts_at, expires_at);
CREATE INDEX IF NOT EXISTS idx_events_lifecycle_cron ON public.events (event_status, starts_at, payment_status);
CREATE INDEX IF NOT EXISTS idx_events_completed_cron ON public.events (payment_status, expires_at, event_status);
CREATE INDEX IF NOT EXISTS idx_events_test_scores_cleared ON public.events (test_scores_cleared_at, event_date, starts_at);

-- ------------------------------------------------------------------------------
-- 7B. UPDATED_AT TRIGGER FUNCTION & TRIGGERS
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

CREATE OR REPLACE FUNCTION public.is_developer_admin(lookup_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE id = COALESCE(lookup_user_id, auth.uid()) AND is_developer = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- USERS POLICIES
DROP POLICY IF EXISTS "Users can view own user record" ON public.users;
CREATE POLICY "Users can view own user record"
  ON public.users FOR SELECT
  USING (id = auth.uid() OR public.is_developer_admin());

-- PRIVILEGE ESCALATION PREVENTION:
-- Direct client updates to public.users are strictly forbidden to prevent authenticated users
-- from modifying privileged columns like is_developer.
-- Profile updates (name, avatar_url) must be routed through the server API via service_role.
DROP POLICY IF EXISTS "Users can update own user record" ON public.users;
REVOKE UPDATE ON public.users FROM authenticated;
REVOKE UPDATE ON public.users FROM anon;

CREATE OR REPLACE FUNCTION public.prevent_user_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Prevent modifying primary key
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'User ID is immutable';
  END IF;

  -- Block email alterations via direct client updates (emails are managed via verified OAuth)
  IF NEW.email IS DISTINCT FROM OLD.email AND (auth.role() = 'authenticated' OR auth.role() = 'anon') THEN
    RAISE EXCEPTION 'User email cannot be modified directly';
  END IF;

  -- Block privilege escalation: is_developer cannot be altered by non-service-role clients
  IF NEW.is_developer IS DISTINCT FROM OLD.is_developer THEN
    IF (auth.role() = 'authenticated' OR auth.role() = 'anon') OR (auth.uid() IS NOT NULL AND auth.role() != 'service_role') THEN
      RAISE EXCEPTION 'Privilege escalation rejected: modifying is_developer is strictly prohibited';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_user_privilege_escalation ON public.users;
CREATE TRIGGER trg_prevent_user_privilege_escalation
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_user_privilege_escalation();

-- ORGANIZATIONS POLICIES (BACKEND-WRITE-ONLY)
-- Organization members and developer admins can SELECT their organizations.
-- Direct client INSERT, UPDATE, and DELETE are strictly disallowed.
-- All mutations must be processed through the backend server API via service_role.
DROP POLICY IF EXISTS "Members can view their organizations" ON public.organizations;
CREATE POLICY "Members can view their organizations"
  ON public.organizations FOR SELECT
  USING (public.is_org_member(id) OR public.is_developer_admin());

DROP POLICY IF EXISTS "Authenticated users can create organizations" ON public.organizations;
DROP POLICY IF EXISTS "Owners and admins can update organization" ON public.organizations;
DROP POLICY IF EXISTS "Owners and admins can delete organization" ON public.organizations;

REVOKE INSERT, UPDATE, DELETE ON public.organizations FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.organizations FROM anon;
GRANT SELECT ON public.organizations TO authenticated;
GRANT SELECT ON public.organizations TO anon;

CREATE OR REPLACE FUNCTION public.prevent_organization_unauthorized_client_mutations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role text;
  v_uid text;
BEGIN
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

  IF v_role IN ('authenticated', 'anon') OR (v_uid IS NOT NULL AND (v_role IS NULL OR v_role != 'service_role')) THEN
    RAISE EXCEPTION 'Direct client mutation on organizations is strictly prohibited. All organization operations must be routed through the server API.';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'Direct update of organization id is strictly prohibited';
    END IF;
    IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
      RAISE EXCEPTION 'Direct update of organization owner_id is strictly prohibited. Organization ownership cannot be changed directly.';
    END IF;
    IF NEW.slug IS DISTINCT FROM OLD.slug THEN
      RAISE EXCEPTION 'Direct update of organization slug is strictly prohibited';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    IF v_role IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'Direct client creation of organizations is strictly prohibited';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF v_role IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'Direct client deletion of organizations is strictly prohibited';
    END IF;
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_organization_unauthorized_client_mutations ON public.organizations;
CREATE TRIGGER trg_prevent_organization_unauthorized_client_mutations
  BEFORE INSERT OR UPDATE OR DELETE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_organization_unauthorized_client_mutations();

-- ORGANIZATION MEMBERS POLICIES (BACKEND-WRITE-ONLY)
DROP POLICY IF EXISTS "Members can view organization members" ON public.organization_members;
CREATE POLICY "Members can view organization members"
  ON public.organization_members FOR SELECT
  USING (public.is_org_member(organization_id) OR public.is_developer_admin());

DROP POLICY IF EXISTS "Owners and admins can manage members" ON public.organization_members;
DROP POLICY IF EXISTS "Owners and admins can update member roles" ON public.organization_members;
DROP POLICY IF EXISTS "Owners and admins can remove members" ON public.organization_members;

REVOKE INSERT, UPDATE, DELETE ON public.organization_members FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.organization_members FROM anon;
GRANT SELECT ON public.organization_members TO authenticated;
GRANT SELECT ON public.organization_members TO anon;

CREATE OR REPLACE FUNCTION public.prevent_organization_member_unauthorized_client_mutations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role text;
  v_uid text;
BEGIN
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

  IF v_role IN ('authenticated', 'anon') OR (v_uid IS NOT NULL AND (v_role IS NULL OR v_role != 'service_role')) THEN
    RAISE EXCEPTION 'Direct client mutation on organization_members is strictly prohibited. All membership operations must be routed through the server API.';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF v_role IS DISTINCT FROM 'service_role' THEN
      IF NEW.role IS DISTINCT FROM OLD.role THEN
        RAISE EXCEPTION 'Direct update of member role is strictly prohibited';
      END IF;
      IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
        RAISE EXCEPTION 'Direct update of member user_id is strictly prohibited';
      END IF;
      IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
        RAISE EXCEPTION 'Direct update of member organization_id is strictly prohibited';
      END IF;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    IF v_role IS DISTINCT FROM 'service_role' THEN
      IF NEW.role IN ('owner', 'admin') THEN
        RAISE EXCEPTION 'Direct creation of owner or admin membership is strictly prohibited';
      END IF;
      RAISE EXCEPTION 'Direct client creation of organization_members is strictly prohibited';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF v_role IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'Direct client deletion of organization_members is strictly prohibited';
    END IF;
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_organization_member_unauthorized_client_mutations ON public.organization_members;
CREATE TRIGGER trg_prevent_organization_member_unauthorized_client_mutations
  BEFORE INSERT OR UPDATE OR DELETE ON public.organization_members
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_organization_member_unauthorized_client_mutations();

-- ORGANIZATION INVITATIONS POLICIES (BACKEND-WRITE-ONLY)
DROP POLICY IF EXISTS "Members can view invitations" ON public.organization_invitations;
CREATE POLICY "Members can view invitations"
  ON public.organization_invitations FOR SELECT
  USING (public.is_org_member(organization_id) OR public.is_developer_admin());

DROP POLICY IF EXISTS "Owners and admins can create invitations" ON public.organization_invitations;
DROP POLICY IF EXISTS "Owners and admins can delete invitations" ON public.organization_invitations;
DROP POLICY IF EXISTS "Owners and admins can update invitations" ON public.organization_invitations;

REVOKE INSERT, UPDATE, DELETE ON public.organization_invitations FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.organization_invitations FROM anon;
GRANT SELECT ON public.organization_invitations TO authenticated;
GRANT SELECT ON public.organization_invitations TO anon;

CREATE OR REPLACE FUNCTION public.prevent_organization_invitation_unauthorized_client_mutations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role text;
  v_uid text;
BEGIN
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

  IF v_role IN ('authenticated', 'anon') OR (v_uid IS NOT NULL AND (v_role IS NULL OR v_role != 'service_role')) THEN
    RAISE EXCEPTION 'Direct client mutation on organization_invitations is strictly prohibited. All invitation operations must be routed through the server API.';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF v_role IS DISTINCT FROM 'service_role' THEN
      IF NEW.token IS DISTINCT FROM OLD.token OR NEW.token_hash IS DISTINCT FROM OLD.token_hash THEN
        RAISE EXCEPTION 'Direct update of invitation token is strictly prohibited';
      END IF;
      IF NEW.role IS DISTINCT FROM OLD.role THEN
        RAISE EXCEPTION 'Direct update of invitation role is strictly prohibited';
      END IF;
      IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
        RAISE EXCEPTION 'Direct update of invitation organization_id is strictly prohibited';
      END IF;
      IF NEW.status IS DISTINCT FROM OLD.status OR NEW.accepted_at IS DISTINCT FROM OLD.accepted_at THEN
        RAISE EXCEPTION 'Direct update of invitation status is strictly prohibited';
      END IF;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    IF v_role IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'Direct client creation of organization_invitations is strictly prohibited';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF v_role IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'Direct client deletion of organization_invitations is strictly prohibited';
    END IF;
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_organization_invitation_unauthorized_client_mutations ON public.organization_invitations;
CREATE TRIGGER trg_prevent_organization_invitation_unauthorized_client_mutations
  BEFORE INSERT OR UPDATE OR DELETE ON public.organization_invitations
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_organization_invitation_unauthorized_client_mutations();

-- GAMES POLICIES
DROP POLICY IF EXISTS "Developer admins can manage all games" ON public.games;
CREATE POLICY "Developer admins can manage all games"
  ON public.games FOR ALL
  USING (public.is_developer_admin());

DROP POLICY IF EXISTS "Anyone can view system games" ON public.games;
CREATE POLICY "Anyone can view system games"
  ON public.games FOR SELECT
  USING (is_system = true OR organization_id IS NULL);

-- GAMES POLICIES (BACKEND-WRITE-ONLY)
-- Normal authenticated organization members can SELECT games subject to tenant membership or system availability.
-- Direct client INSERT, UPDATE, and DELETE are strictly disallowed.
-- All mutations must be processed through the backend server API via service_role.
DROP POLICY IF EXISTS "Developer admins can manage all games" ON public.games;
DROP POLICY IF EXISTS "Owners, admins, designers can insert games" ON public.games;
DROP POLICY IF EXISTS "Owners, admins, designers can update games" ON public.games;
DROP POLICY IF EXISTS "Owners and admins can delete games" ON public.games;

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

  IF v_role IN ('authenticated', 'anon') OR (v_uid IS NOT NULL AND (v_role IS NULL OR v_role != 'service_role')) THEN
    RAISE EXCEPTION 'Direct client mutation on games is strictly prohibited. All game operations must be routed through the server API.';
  END IF;

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

-- GAME THEMES POLICIES (BACKEND-WRITE-ONLY)
-- Normal authenticated organization members can SELECT themes subject to tenant membership or system availability.
-- Direct client INSERT, UPDATE, and DELETE are strictly disallowed.
-- All mutations must be processed through the backend server API via service_role.
DROP POLICY IF EXISTS "Developer admins can manage all themes" ON public.game_themes;
DROP POLICY IF EXISTS "Owners, admins, designers can insert themes" ON public.game_themes;
DROP POLICY IF EXISTS "Owners, admins, designers can update themes" ON public.game_themes;
DROP POLICY IF EXISTS "Owners and admins can delete themes" ON public.game_themes;

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

  IF v_role IN ('authenticated', 'anon') OR (v_uid IS NOT NULL AND (v_role IS NULL OR v_role != 'service_role')) THEN
    RAISE EXCEPTION 'Direct client mutation on game_themes is strictly prohibited. All theme operations must be routed through the server API.';
  END IF;

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

-- EVENTS POLICIES (BACKEND-WRITE-ONLY)
-- Normal authenticated organization members can SELECT events subject to tenant membership.
-- Direct client INSERT, UPDATE, and DELETE are strictly disallowed.
-- All mutations must be processed through the backend server API via service_role.
DROP POLICY IF EXISTS "Members can view organization events" ON public.events;
CREATE POLICY "Members can view organization events"
  ON public.events FOR SELECT
  USING (public.is_org_member(organization_id) OR public.is_developer_admin());

DROP POLICY IF EXISTS "Owners, admins, designers can insert events" ON public.events;
DROP POLICY IF EXISTS "Owners, admins, designers can update events" ON public.events;
DROP POLICY IF EXISTS "Owners and admins can delete events" ON public.events;

-- Revoke direct table-level write privileges from client roles
REVOKE INSERT, UPDATE, DELETE ON public.events FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.events FROM anon;
GRANT SELECT ON public.events TO authenticated;
GRANT SELECT ON public.events TO anon;

-- Defense-in-depth trigger: Block any direct client mutation and safeguard sensitive columns
CREATE OR REPLACE FUNCTION public.prevent_event_unauthorized_client_mutations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role text;
  v_uid text;
BEGIN
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

  IF v_role IN ('authenticated', 'anon') OR (v_uid IS NOT NULL AND (v_role IS NULL OR v_role != 'service_role')) THEN
    RAISE EXCEPTION 'Direct client mutation on events is strictly prohibited. All event operations must be routed through the server API.';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF v_role IS DISTINCT FROM 'service_role' THEN
      IF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
        RAISE EXCEPTION 'Direct update of payment_status is strictly prohibited';
      END IF;
      IF NEW.event_status IS DISTINCT FROM OLD.event_status THEN
        RAISE EXCEPTION 'Direct update of event_status is strictly prohibited';
      END IF;
      IF NEW.status IS DISTINCT FROM OLD.status THEN
        RAISE EXCEPTION 'Direct update of status is strictly prohibited';
      END IF;
      IF NEW.paid_amount IS DISTINCT FROM OLD.paid_amount THEN
        RAISE EXCEPTION 'Direct update of paid_amount is strictly prohibited';
      END IF;
      IF NEW.discount_amount IS DISTINCT FROM OLD.discount_amount THEN
        RAISE EXCEPTION 'Direct update of discount_amount is strictly prohibited';
      END IF;
      IF NEW.event_price IS DISTINCT FROM OLD.event_price THEN
        RAISE EXCEPTION 'Direct update of event_price is strictly prohibited';
      END IF;
      IF NEW.payment_mode IS DISTINCT FROM OLD.payment_mode THEN
        RAISE EXCEPTION 'Direct update of payment_mode is strictly prohibited';
      END IF;
      IF NEW.cancel_reason IS DISTINCT FROM OLD.cancel_reason THEN
        RAISE EXCEPTION 'Direct update of cancel_reason is strictly prohibited';
      END IF;
      IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
        RAISE EXCEPTION 'Direct update of organization_id is strictly prohibited';
      END IF;
      IF NEW.public_token IS DISTINCT FROM OLD.public_token THEN
        RAISE EXCEPTION 'Direct update of public_token is strictly prohibited';
      END IF;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    IF v_role IS DISTINCT FROM 'service_role' THEN
      IF UPPER(COALESCE(NEW.payment_status, '')) = 'PAID' OR UPPER(COALESCE(NEW.event_status, '')) = 'LIVE' OR LOWER(COALESCE(NEW.status, '')) = 'live' THEN
        RAISE EXCEPTION 'Direct insert of PAID or LIVE event is strictly prohibited';
      END IF;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF v_role IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'Direct client deletion of events is strictly prohibited';
    END IF;
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_event_unauthorized_client_mutations ON public.events;
CREATE TRIGGER trg_prevent_event_unauthorized_client_mutations
  BEFORE INSERT OR UPDATE OR DELETE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_event_unauthorized_client_mutations();

-- ------------------------------------------------------------------------------
-- 9. SUPABASE STORAGE SETUP (game-assets and showcase-media buckets)
-- ------------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('game-assets', 'game-assets', true, 26214400, ARRAY['image/png', 'image/jpeg', 'image/webp', 'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/aac']),
  ('showcase-media', 'showcase-media', true, 209715200, ARRAY['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public read access for game-assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload game-assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update game-assets" ON storage.objects;
DROP POLICY IF EXISTS "Organization members can upload to their org folder in game-assets" ON storage.objects;
DROP POLICY IF EXISTS "Organization members can update their org assets in game-assets" ON storage.objects;
DROP POLICY IF EXISTS "Organization members can delete their org assets in game-assets" ON storage.objects;

DROP POLICY IF EXISTS "Public read access for showcase-media" ON storage.objects;
DROP POLICY IF EXISTS "Organization members can upload to their org folder in showcase-media" ON storage.objects;
DROP POLICY IF EXISTS "Organization members can update their org assets in showcase-media" ON storage.objects;
DROP POLICY IF EXISTS "Organization members can delete their org assets in showcase-media" ON storage.objects;

-- Public CDN read access (assets like backgrounds and themes are publicly viewable by URL)
CREATE POLICY "Public read access for game-assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'game-assets');

-- Strict tenant-scoped upload policy for game-assets:
-- Confined to caller's organization path: organizations/<organization_id>/...
CREATE POLICY "Organization members can upload to their org folder in game-assets"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'game-assets'
    AND auth.uid() IS NOT NULL
    AND (
      public.is_developer_admin()
      OR (
        (storage.foldername(name))[1] = 'organizations'
        AND (storage.foldername(name))[2] IS NOT NULL
        AND public.get_org_role(((storage.foldername(name))[2])::uuid) IN ('owner', 'admin', 'designer')
      )
    )
  );

-- Strict tenant-scoped update policy for game-assets
CREATE POLICY "Organization members can update their org assets in game-assets"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'game-assets'
    AND auth.uid() IS NOT NULL
    AND (
      public.is_developer_admin()
      OR (
        (storage.foldername(name))[1] = 'organizations'
        AND (storage.foldername(name))[2] IS NOT NULL
        AND public.get_org_role(((storage.foldername(name))[2])::uuid) IN ('owner', 'admin', 'designer')
      )
    )
  );

-- Strict tenant-scoped delete policy for game-assets
CREATE POLICY "Organization members can delete their org assets in game-assets"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'game-assets'
    AND auth.uid() IS NOT NULL
    AND (
      public.is_developer_admin()
      OR (
        (storage.foldername(name))[1] = 'organizations'
        AND (storage.foldername(name))[2] IS NOT NULL
        AND public.get_org_role(((storage.foldername(name))[2])::uuid) IN ('owner', 'admin')
      )
    )
  );

-- Public CDN read access for showcase-media
CREATE POLICY "Public read access for showcase-media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'showcase-media');

-- Strict tenant-scoped upload policy for showcase-media
CREATE POLICY "Organization members can upload to their org folder in showcase-media"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'showcase-media'
    AND auth.uid() IS NOT NULL
    AND (
      public.is_developer_admin()
      OR (
        (storage.foldername(name))[1] = 'organizations'
        AND (storage.foldername(name))[2] IS NOT NULL
        AND public.get_org_role(((storage.foldername(name))[2])::uuid) IN ('owner', 'admin', 'designer', 'member')
      )
    )
  );

-- Strict tenant-scoped update policy for showcase-media
CREATE POLICY "Organization members can update their org assets in showcase-media"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'showcase-media'
    AND auth.uid() IS NOT NULL
    AND (
      public.is_developer_admin()
      OR (
        (storage.foldername(name))[1] = 'organizations'
        AND (storage.foldername(name))[2] IS NOT NULL
        AND public.get_org_role(((storage.foldername(name))[2])::uuid) IN ('owner', 'admin', 'designer', 'member')
      )
    )
  );

-- Strict tenant-scoped delete policy for showcase-media
CREATE POLICY "Organization members can delete their org assets in showcase-media"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'showcase-media'
    AND auth.uid() IS NOT NULL
    AND (
      public.is_developer_admin()
      OR (
        (storage.foldername(name))[1] = 'organizations'
        AND (storage.foldername(name))[2] IS NOT NULL
        AND public.get_org_role(((storage.foldername(name))[2])::uuid) IN ('owner', 'admin')
      )
    )
  );

-- ------------------------------------------------------------------------------
-- 10. WALLET ENGINE & IMMUTABLE TRANSACTION LEDGER
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organization_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  paid_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (paid_balance >= 0.00),
  welcome_credit NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (welcome_credit >= 0.00),
  showcase_credit NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (showcase_credit >= 0.00),
  topup_credit NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (topup_credit >= 0.00),
  outstanding_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (outstanding_balance >= 0.00),
  currency TEXT NOT NULL DEFAULT 'MYR',
  welcome_credit_granted BOOLEAN NOT NULL DEFAULT false,
  showcase_credit_granted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.organization_wallets
  ADD COLUMN IF NOT EXISTS outstanding_balance NUMERIC(12, 2) DEFAULT 0.00 NOT NULL;

CREATE INDEX IF NOT EXISTS idx_org_wallets_org_id ON public.organization_wallets (organization_id);

CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
  owner_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  transaction_type TEXT NOT NULL CHECK (
    transaction_type IN (
      'TOPUP',
      'TOPUP_CREDIT',
      'WELCOME_CREDIT',
      'SHOWCASE_CREDIT',
      'EVENT_PAYMENT',
      'CREDIT_USAGE',
      'WITHDRAWAL',
      'REFUND',
      'CREDIT_EXPIRY',
      'CREDIT_REVERSAL',
      'ADMIN_ADJUSTMENT'
    )
  ),
  balance_type TEXT NOT NULL CHECK (
    balance_type IN (
      'PAID_BALANCE',
      'WELCOME_CREDIT',
      'SHOWCASE_CREDIT',
      'TOPUP_CREDIT'
    )
  ),
  amount NUMERIC(12, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'MYR',
  status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK (
    status IN ('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED', 'REVERSED')
  ),
  reference_id TEXT,
  description TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.wallet_transactions
  ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_wallet_txns_org_id ON public.wallet_transactions (organization_id);
CREATE INDEX IF NOT EXISTS idx_wallet_txns_owner_user_id ON public.wallet_transactions (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_txns_event_id ON public.wallet_transactions (event_id);
CREATE INDEX IF NOT EXISTS idx_wallet_txns_type ON public.wallet_transactions (transaction_type);
CREATE INDEX IF NOT EXISTS idx_wallet_txns_balance_type ON public.wallet_transactions (balance_type);
CREATE INDEX IF NOT EXISTS idx_wallet_txns_status ON public.wallet_transactions (status);
CREATE INDEX IF NOT EXISTS idx_wallet_txns_ref_id ON public.wallet_transactions (reference_id);
CREATE INDEX IF NOT EXISTS idx_wallet_txns_created_at ON public.wallet_transactions (created_at DESC);

-- Unique idempotency constraint
CREATE UNIQUE INDEX IF NOT EXISTS ux_wallet_txns_org_reference 
  ON public.wallet_transactions (organization_id, reference_id) 
  WHERE reference_id IS NOT NULL AND status IN ('COMPLETED', 'PENDING');

CREATE UNIQUE INDEX IF NOT EXISTS ux_wallet_txns_reference_id_unique
  ON public.wallet_transactions (reference_id)
  WHERE reference_id IS NOT NULL AND status IN ('COMPLETED', 'PENDING');

-- Single-grant constraints
CREATE UNIQUE INDEX IF NOT EXISTS ux_wallet_txns_welcome_credit 
  ON public.wallet_transactions (organization_id) 
  WHERE transaction_type = 'WELCOME_CREDIT' AND status = 'COMPLETED';

CREATE UNIQUE INDEX IF NOT EXISTS ux_wallet_txns_showcase_credit 
  ON public.wallet_transactions (organization_id) 
  WHERE transaction_type = 'SHOWCASE_CREDIT' AND status = 'COMPLETED';

CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_tx_org_showcase_credit_unique
  ON public.wallet_transactions (organization_id)
  WHERE transaction_type = 'SHOWCASE_CREDIT' AND status = 'COMPLETED';

-- Wallet RLS
ALTER TABLE public.organization_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view organization wallet" ON public.organization_wallets;
CREATE POLICY "Members can view organization wallet"
  ON public.organization_wallets FOR SELECT
  USING (public.is_org_member(organization_id) OR public.is_developer_admin());

DROP POLICY IF EXISTS "Members can view organization wallet transactions" ON public.wallet_transactions;
CREATE POLICY "Members can view organization wallet transactions"
  ON public.wallet_transactions FOR SELECT
  USING (public.is_org_member(organization_id) OR public.is_developer_admin());

-- ------------------------------------------------------------------------------
-- 11. EVENT SHOWCASES & SHOWCASE MEDIA
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.event_showcases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL UNIQUE REFERENCES public.events(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  owner_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  client_name TEXT,
  client_logo_url TEXT,
  cover_image_url TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'UNPUBLISHED', 'BLOCKED', 'DELETED')),
  review_status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (review_status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED')),
  publication_status TEXT NOT NULL DEFAULT 'UNPUBLISHED' CHECK (publication_status IN ('UNPUBLISHED', 'PUBLISHED')),
  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  rejection_reason TEXT,
  reward_transaction_id UUID REFERENCES public.wallet_transactions(id) ON DELETE SET NULL,
  reward_granted_at TIMESTAMPTZ,
  reward_status TEXT DEFAULT 'PENDING' CHECK (reward_status IN ('PENDING', 'REWARDED', 'NOT_ELIGIBLE')),
  reward_review_status TEXT DEFAULT 'NOT_ELIGIBLE' CHECK (reward_review_status IN ('NOT_ELIGIBLE', 'AWAITING_APPROVAL', 'REWARDED', 'REJECTED')),
  reward_reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reward_reviewed_at TIMESTAMPTZ,
  reward_rejection_reason TEXT,
  moderated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  moderated_at TIMESTAMPTZ,
  moderation_reason TEXT,
  deleted_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Ensure all event_showcases columns exist defensively
ALTER TABLE public.event_showcases ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.event_showcases ADD COLUMN IF NOT EXISTS client_name TEXT;
ALTER TABLE public.event_showcases ADD COLUMN IF NOT EXISTS client_logo_url TEXT;
ALTER TABLE public.event_showcases ADD COLUMN IF NOT EXISTS cover_image_url TEXT;
ALTER TABLE public.event_showcases ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'DRAFT' NOT NULL;
ALTER TABLE public.event_showcases ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'DRAFT' NOT NULL;
ALTER TABLE public.event_showcases ADD COLUMN IF NOT EXISTS publication_status TEXT DEFAULT 'UNPUBLISHED' NOT NULL;
ALTER TABLE public.event_showcases ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;
ALTER TABLE public.event_showcases ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE public.event_showcases ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.event_showcases ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE public.event_showcases ADD COLUMN IF NOT EXISTS reward_transaction_id UUID REFERENCES public.wallet_transactions(id) ON DELETE SET NULL;
ALTER TABLE public.event_showcases ADD COLUMN IF NOT EXISTS reward_granted_at TIMESTAMPTZ;
ALTER TABLE public.event_showcases ADD COLUMN IF NOT EXISTS reward_status TEXT DEFAULT 'PENDING';
ALTER TABLE public.event_showcases ADD COLUMN IF NOT EXISTS reward_review_status TEXT DEFAULT 'NOT_ELIGIBLE';
ALTER TABLE public.event_showcases ADD COLUMN IF NOT EXISTS reward_reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.event_showcases ADD COLUMN IF NOT EXISTS reward_reviewed_at TIMESTAMPTZ;
ALTER TABLE public.event_showcases ADD COLUMN IF NOT EXISTS reward_rejection_reason TEXT;
ALTER TABLE public.event_showcases ADD COLUMN IF NOT EXISTS moderated_by UUID REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.event_showcases ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMPTZ;
ALTER TABLE public.event_showcases ADD COLUMN IF NOT EXISTS moderation_reason TEXT;
ALTER TABLE public.event_showcases ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.event_showcases ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.showcase_moderation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  showcase_id UUID NOT NULL REFERENCES public.event_showcases(id) ON DELETE CASCADE,
  moderator_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('BLOCK', 'UNBLOCK', 'DELETE', 'RESTORE', 'APPROVE_REWARD', 'REJECT_REWARD')),
  reason TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_showcase_mod_logs_showcase_id ON public.showcase_moderation_logs(showcase_id);
CREATE INDEX IF NOT EXISTS idx_showcase_mod_logs_moderator_id ON public.showcase_moderation_logs(moderator_id);
CREATE INDEX IF NOT EXISTS idx_showcase_mod_logs_created_at ON public.showcase_moderation_logs(created_at DESC);

ALTER TABLE public.showcase_moderation_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Developer admins can view moderation logs" ON public.showcase_moderation_logs;
CREATE POLICY "Developer admins can view moderation logs"
  ON public.showcase_moderation_logs FOR SELECT
  USING (public.is_developer_admin());

DROP POLICY IF EXISTS "Developer admins can insert moderation logs" ON public.showcase_moderation_logs;
CREATE POLICY "Developer admins can insert moderation logs"
  ON public.showcase_moderation_logs FOR INSERT
  WITH CHECK (public.is_developer_admin());

CREATE INDEX IF NOT EXISTS idx_event_showcases_event_id ON public.event_showcases (event_id);
CREATE INDEX IF NOT EXISTS idx_event_showcases_org_id ON public.event_showcases (organization_id);
CREATE INDEX IF NOT EXISTS idx_event_showcases_owner_user_id ON public.event_showcases (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_event_showcases_status ON public.event_showcases (status);
CREATE INDEX IF NOT EXISTS idx_event_showcases_review_status ON public.event_showcases (review_status);
CREATE INDEX IF NOT EXISTS idx_event_showcases_publication_status ON public.event_showcases (publication_status);
CREATE INDEX IF NOT EXISTS idx_event_showcases_reward_status ON public.event_showcases (reward_status);

-- ------------------------------------------------------------------------------
-- OWNER SHOWCASE REWARDS LEDGER (ONE-TIME PER OWNER USER LIFETIME)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.owner_showcase_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
  showcase_id UUID REFERENCES public.event_showcases(id) ON DELETE SET NULL,
  transaction_id UUID REFERENCES public.wallet_transactions(id) ON DELETE SET NULL,
  amount NUMERIC(10,2) NOT NULL DEFAULT 300.00,
  rewarded_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_owner_showcase_rewards_org ON public.owner_showcase_rewards (organization_id);
CREATE INDEX IF NOT EXISTS idx_owner_showcase_rewards_event ON public.owner_showcase_rewards (event_id);

CREATE TABLE IF NOT EXISTS public.event_showcase_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  showcase_id UUID NOT NULL REFERENCES public.event_showcases(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL CHECK (media_type IN ('IMAGE', 'VIDEO')),
  media_url TEXT NOT NULL,
  storage_path TEXT,
  thumbnail_url TEXT,
  file_name TEXT NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  mime_type TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_event_showcase_media_showcase_id ON public.event_showcase_media (showcase_id);
CREATE INDEX IF NOT EXISTS idx_event_showcase_media_org_id ON public.event_showcase_media (organization_id);
CREATE INDEX IF NOT EXISTS idx_event_showcase_media_storage_path ON public.event_showcase_media (storage_path);
CREATE INDEX IF NOT EXISTS idx_event_showcase_media_sort_order ON public.event_showcase_media (showcase_id, sort_order ASC);

-- Showcase RLS
ALTER TABLE public.event_showcases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_showcase_media ENABLE ROW LEVEL SECURITY;

-- Backend-write-only for event_showcases:
-- 1. Drop client write policies
DROP POLICY IF EXISTS "Owners, admins, designers can insert event showcases" ON public.event_showcases;
DROP POLICY IF EXISTS "Owners, admins, designers can update event showcases" ON public.event_showcases;
DROP POLICY IF EXISTS "Owners and admins can delete event showcases" ON public.event_showcases;
DROP POLICY IF EXISTS "Anyone can insert event showcases" ON public.event_showcases;
DROP POLICY IF EXISTS "Anyone can update event showcases" ON public.event_showcases;
DROP POLICY IF EXISTS "Anyone can delete event showcases" ON public.event_showcases;

-- 2. Ensure strict SELECT policy remains active for public active showcases, org members, and developer admins
DROP POLICY IF EXISTS "Anyone can view published showcases or org members" ON public.event_showcases;
DROP POLICY IF EXISTS "Public can view active published showcases" ON public.event_showcases;
CREATE POLICY "Public can view active published showcases"
  ON public.event_showcases FOR SELECT
  USING (
    (status = 'PUBLISHED' AND deleted_at IS NULL)
    OR (public.is_org_member(organization_id) AND deleted_at IS NULL)
    OR public.is_developer_admin()
  );

-- 3. Revoke direct client mutation privileges
REVOKE INSERT, UPDATE, DELETE ON public.event_showcases FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.event_showcases FROM anon;
GRANT SELECT ON public.event_showcases TO authenticated;
GRANT SELECT ON public.event_showcases TO anon;
GRANT ALL ON public.event_showcases TO service_role;
GRANT ALL ON public.event_showcases TO postgres;

-- 4. Defense-in-depth trigger blocking direct client mutations
CREATE OR REPLACE FUNCTION public.prevent_event_showcase_unauthorized_client_mutations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role text;
  v_uid text;
BEGIN
  -- Allow database administrator / migration scripts / direct postgres sessions
  IF current_user IN ('postgres', 'supabase_admin') OR session_user IN ('postgres', 'supabase_admin') THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    ELSE
      RETURN NEW;
    END IF;
  END IF;

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

  -- Direct SQL sessions without web claims are administrative
  IF v_role IS NULL AND v_uid IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  IF v_role IN ('authenticated', 'anon') OR (v_uid IS NOT NULL AND (v_role IS NULL OR v_role != 'service_role')) THEN
    RAISE EXCEPTION 'Direct client mutation on event_showcases is strictly prohibited. All showcase operations must be routed through the server API.';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF v_role IS DISTINCT FROM 'service_role' THEN
      IF NEW.review_status IS DISTINCT FROM OLD.review_status THEN
        RAISE EXCEPTION 'Direct update of review_status is strictly prohibited';
      END IF;
      IF NEW.reward_status IS DISTINCT FROM OLD.reward_status THEN
        RAISE EXCEPTION 'Direct update of reward_status is strictly prohibited';
      END IF;
      IF NEW.reward_transaction_id IS DISTINCT FROM OLD.reward_transaction_id THEN
        RAISE EXCEPTION 'Direct update of reward_transaction_id is strictly prohibited';
      END IF;
      IF NEW.reward_granted_at IS DISTINCT FROM OLD.reward_granted_at THEN
        RAISE EXCEPTION 'Direct update of reward_granted_at is strictly prohibited';
      END IF;
      IF NEW.reward_review_status IS DISTINCT FROM OLD.reward_review_status THEN
        RAISE EXCEPTION 'Direct update of reward_review_status is strictly prohibited';
      END IF;
      IF NEW.reward_reviewed_by IS DISTINCT FROM OLD.reward_reviewed_by THEN
        RAISE EXCEPTION 'Direct update of reward_reviewed_by is strictly prohibited';
      END IF;
      IF NEW.reward_reviewed_at IS DISTINCT FROM OLD.reward_reviewed_at THEN
        RAISE EXCEPTION 'Direct update of reward_reviewed_at is strictly prohibited';
      END IF;
      IF NEW.reward_rejection_reason IS DISTINCT FROM OLD.reward_rejection_reason THEN
        RAISE EXCEPTION 'Direct update of reward_rejection_reason is strictly prohibited';
      END IF;
      IF NEW.publication_status IS DISTINCT FROM OLD.publication_status THEN
        RAISE EXCEPTION 'Direct update of publication_status is strictly prohibited';
      END IF;
      IF NEW.published_at IS DISTINCT FROM OLD.published_at THEN
        RAISE EXCEPTION 'Direct update of published_at is strictly prohibited';
      END IF;
      IF NEW.status IS DISTINCT FROM OLD.status THEN
        RAISE EXCEPTION 'Direct update of status is strictly prohibited';
      END IF;
      IF NEW.moderated_by IS DISTINCT FROM OLD.moderated_by THEN
        RAISE EXCEPTION 'Direct update of moderated_by is strictly prohibited';
      END IF;
      IF NEW.moderated_at IS DISTINCT FROM OLD.moderated_at THEN
        RAISE EXCEPTION 'Direct update of moderated_at is strictly prohibited';
      END IF;
      IF NEW.moderation_reason IS DISTINCT FROM OLD.moderation_reason THEN
        RAISE EXCEPTION 'Direct update of moderation_reason is strictly prohibited';
      END IF;
      IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
        RAISE EXCEPTION 'Direct update of deleted_at is strictly prohibited';
      END IF;
      IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
        RAISE EXCEPTION 'Direct update of organization_id is strictly prohibited';
      END IF;
      IF NEW.event_id IS DISTINCT FROM OLD.event_id THEN
        RAISE EXCEPTION 'Direct update of event_id is strictly prohibited';
      END IF;
      IF NEW.id IS DISTINCT FROM OLD.id THEN
        RAISE EXCEPTION 'Direct update of id is strictly prohibited';
      END IF;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    IF v_role IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'Direct client creation of event_showcases is strictly prohibited';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF v_role IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'Direct client deletion of event_showcases is strictly prohibited';
    END IF;
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_event_showcase_unauthorized_client_mutations ON public.event_showcases;
CREATE TRIGGER trg_prevent_event_showcase_unauthorized_client_mutations
  BEFORE INSERT OR UPDATE OR DELETE ON public.event_showcases
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_event_showcase_unauthorized_client_mutations();

DROP POLICY IF EXISTS "View showcase media for published or org members" ON public.event_showcase_media;
CREATE POLICY "View showcase media for published or org members"
  ON public.event_showcase_media FOR SELECT
  USING (
    public.is_org_member(organization_id) 
    OR public.is_developer_admin()
    OR EXISTS (
      SELECT 1 FROM public.event_showcases
      WHERE public.event_showcases.id = showcase_id
      AND public.event_showcases.status = 'PUBLISHED'
    )
  );

-- Trigger function to enforce storage path hierarchy and strictly prohibit arbitrary external URLs & SVG uploads
CREATE OR REPLACE FUNCTION public.verify_showcase_media_record_security()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Storage path must follow organizations/<org_id>/showcases/<showcase_id>/<filename>
  IF NEW.storage_path IS NOT NULL AND NEW.storage_path <> '' THEN
    IF NOT (NEW.storage_path ~ ('^organizations/' || NEW.organization_id::text || '/showcases/' || NEW.showcase_id::text || '/[^/]+$')) THEN
      RAISE EXCEPTION 'Showcase media storage_path must match pattern organizations/<organization_id>/showcases/<showcase_id>/<filename>';
    END IF;
  END IF;

  -- Disallow SVG file names or svg extensions in media_url, file_name, or storage_path
  IF LOWER(NEW.file_name) LIKE '%.svg' 
     OR LOWER(NEW.media_url) LIKE '%.svg'
     OR (NEW.storage_path IS NOT NULL AND LOWER(NEW.storage_path) LIKE '%.svg') THEN
    RAISE EXCEPTION 'SVG showcase media files are strictly prohibited';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_verify_showcase_media_record_security ON public.event_showcase_media;
CREATE TRIGGER trg_verify_showcase_media_record_security
  BEFORE INSERT OR UPDATE ON public.event_showcase_media
  FOR EACH ROW
  EXECUTE FUNCTION public.verify_showcase_media_record_security();

-- Transition event_showcase_media to backend-write-only:
-- Revoke direct client mutations from authenticated and anon.
-- Only server API with service_role can insert, update, or delete media items.
DROP POLICY IF EXISTS "Owners, admins, designers can insert showcase media" ON public.event_showcase_media;
DROP POLICY IF EXISTS "Owners, admins, designers can update showcase media" ON public.event_showcase_media;
DROP POLICY IF EXISTS "Owners, admins, designers can delete showcase media" ON public.event_showcase_media;

REVOKE INSERT, UPDATE, DELETE ON public.event_showcase_media FROM authenticated, anon;
GRANT SELECT ON public.event_showcase_media TO authenticated, anon;
GRANT ALL ON public.event_showcase_media TO service_role;

-- ------------------------------------------------------------------------------
-- 15. ATOMIC EVENT PAYMENT RPC / TRANSACTION ENGINE
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_event_payment_atomic(
  p_organization_id UUID,
  p_event_id UUID,
  p_payment_mode TEXT,
  p_event_price NUMERIC DEFAULT NULL,
  p_topup_credit_requested NUMERIC DEFAULT 0.00,
  p_reference_id TEXT DEFAULT NULL,
  p_created_by UUID DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_wallet public.organization_wallets%ROWTYPE;
  v_event public.events%ROWTYPE;
  v_event_price NUMERIC;
  v_credit_to_use NUMERIC := 0.00;
  v_welcome_to_use NUMERIC := 0.00;
  v_showcase_to_use NUMERIC := 0.00;
  v_topup_to_use NUMERIC := 0.00;
  v_paid_to_use NUMERIC := 0.00;
  v_credit_balance_type TEXT := NULL;
  v_credit_txn public.wallet_transactions%ROWTYPE;
  v_topup_credit_txn public.wallet_transactions%ROWTYPE;
  v_paid_txn public.wallet_transactions%ROWTYPE;
  v_credit_ref TEXT;
  v_topup_ref TEXT;
  v_paid_ref TEXT;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
  v_existing_payment public.wallet_transactions%ROWTYPE;
  v_existing_credit public.wallet_transactions%ROWTYPE;
  v_existing_payment_found BOOLEAN := false;
  v_existing_credit_found BOOLEAN := false;
  v_credit_txn_created BOOLEAN := false;
  v_topup_credit_txn_created BOOLEAN := false;
  v_paid_txn_created BOOLEAN := false;
  v_max_cap NUMERIC;
  v_req NUMERIC;
BEGIN
  -- 1. Input validations
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'Organization ID is required';
  END IF;

  IF p_event_id IS NULL THEN
    RAISE EXCEPTION 'Event ID is required';
  END IF;

  IF p_payment_mode NOT IN ('FULL_PAID', 'WELCOME_CREDIT', 'SHOWCASE_CREDIT', 'TOPUP_CREDIT', 'COMBINED_CREDIT') THEN
    RAISE EXCEPTION 'Invalid payment mode: %', p_payment_mode;
  END IF;

  -- 2. Lock & Validate Event Record (if exists in events table)
  SELECT * INTO v_event
  FROM public.events
  WHERE id = p_event_id
  FOR UPDATE;

  IF v_event.id IS NOT NULL THEN
    IF v_event.organization_id <> p_organization_id THEN
      RAISE EXCEPTION 'Security Error: Event does not belong to your organization';
    END IF;
    IF v_event.payment_status = 'PAID' THEN
      RAISE EXCEPTION 'Event is already marked as PAID';
    END IF;
    -- Server-Authoritative: Event's own stored price and currency must be valid. Fail closed if missing or invalid.
    IF v_event.event_price IS NULL OR v_event.event_price <= 0 THEN
      RAISE EXCEPTION 'PRICING_CONFIGURATION_ERROR: Event is missing a valid authoritative price.';
    END IF;
    IF v_event.event_currency IS NULL OR trim(v_event.event_currency) = '' THEN
      RAISE EXCEPTION 'PRICING_CONFIGURATION_ERROR: Event is missing a valid authoritative currency.';
    END IF;
    v_event_price := v_event.event_price;
  ELSE
    IF p_event_price IS NULL OR p_event_price <= 0 THEN
      RAISE EXCEPTION 'PRICING_CONFIGURATION_ERROR: Valid event price is required.';
    END IF;
    v_event_price := p_event_price;
  END IF;

  IF v_event_price <= 0 THEN
    RAISE EXCEPTION 'Event price must be greater than 0';
  END IF;

  -- 3. Idempotency Protection: Check if event is already paid in transaction ledger
  SELECT * INTO v_existing_payment
  FROM public.wallet_transactions
  WHERE organization_id = p_organization_id
    AND event_id = p_event_id
    AND transaction_type = 'EVENT_PAYMENT'
    AND balance_type = 'PAID_BALANCE'
    AND status = 'COMPLETED'
  LIMIT 1;
  v_existing_payment_found := FOUND;

  SELECT * INTO v_existing_credit
  FROM public.wallet_transactions
  WHERE organization_id = p_organization_id
    AND event_id = p_event_id
    AND transaction_type = 'CREDIT_USAGE'
    AND status = 'COMPLETED'
  LIMIT 1;
  v_existing_credit_found := FOUND;

  IF v_existing_payment_found OR v_existing_credit_found THEN
    SELECT * INTO v_wallet FROM public.organization_wallets WHERE organization_id = p_organization_id;

    RETURN jsonb_build_object(
      'success', true,
      'is_idempotent_replay', true,
      'event_id', p_event_id,
      'payment_mode', p_payment_mode,
      'event_price', v_event_price,
      'paid_amount', CASE WHEN v_existing_payment_found THEN COALESCE(ABS(v_existing_payment.amount), 0.00) ELSE 0.00 END,
      'discount_amount', CASE WHEN v_existing_credit_found THEN COALESCE(ABS(v_existing_credit.amount), 0.00) ELSE 0.00 END,
      'credit_transaction', CASE WHEN v_existing_credit_found THEN to_jsonb(v_existing_credit) ELSE NULL END,
      'paid_transaction', CASE WHEN v_existing_payment_found THEN to_jsonb(v_existing_payment) ELSE NULL END,
      'wallet', jsonb_build_object(
        'paid_balance', COALESCE(v_wallet.paid_balance, 0.00),
        'welcome_credit', COALESCE(v_wallet.welcome_credit, 0.00),
        'showcase_credit', COALESCE(v_wallet.showcase_credit, 0.00),
        'topup_credit', COALESCE(v_wallet.topup_credit, 0.00)
      )
    );
  END IF;

  -- 4. Lock & Validate Organization Wallet
  SELECT * INTO v_wallet
  FROM public.organization_wallets
  WHERE organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.organization_wallets (
      organization_id,
      paid_balance,
      welcome_credit,
      showcase_credit,
      topup_credit
    ) VALUES (
      p_organization_id,
      0.00,
      0.00,
      0.00,
      0.00
    )
    RETURNING * INTO v_wallet;
  END IF;

  -- 5. Calculate and validate business rules for payment mode based on authoritative v_event_price
  IF p_payment_mode = 'FULL_PAID' THEN
    v_credit_to_use := 0.00;
    v_paid_to_use := v_event_price;

    IF v_wallet.paid_balance < v_paid_to_use THEN
      RAISE EXCEPTION 'Insufficient Paid Balance. Event price is RM%, but available Paid Balance is RM%.',
        ROUND(v_paid_to_use, 2)::text, ROUND(v_wallet.paid_balance, 2)::text;
    END IF;

  ELSIF p_payment_mode = 'WELCOME_CREDIT' THEN
    v_credit_balance_type := 'WELCOME_CREDIT';
    v_welcome_to_use := LEAST(800.00, v_wallet.welcome_credit, v_event_price);
    v_credit_to_use := v_welcome_to_use;
    v_paid_to_use := v_event_price - v_credit_to_use;

    IF v_wallet.welcome_credit < v_credit_to_use THEN
      RAISE EXCEPTION 'Insufficient Welcome Credit. Required: RM%, Available: RM%.',
        ROUND(v_credit_to_use, 2)::text, ROUND(v_wallet.welcome_credit, 2)::text;
    END IF;

    IF v_wallet.paid_balance < v_paid_to_use THEN
      RAISE EXCEPTION 'Insufficient Paid Balance for Welcome Credit payment. Required: RM%, Available: RM%.',
        ROUND(v_paid_to_use, 2)::text, ROUND(v_wallet.paid_balance, 2)::text;
    END IF;

  ELSIF p_payment_mode = 'SHOWCASE_CREDIT' THEN
    v_credit_balance_type := 'SHOWCASE_CREDIT';
    v_showcase_to_use := LEAST(300.00, v_wallet.showcase_credit, v_event_price);
    v_credit_to_use := v_showcase_to_use;
    v_paid_to_use := v_event_price - v_credit_to_use;

    IF v_wallet.showcase_credit < v_credit_to_use THEN
      RAISE EXCEPTION 'Insufficient Showcase Credit. Required: RM%, Available: RM%.',
        ROUND(v_credit_to_use, 2)::text, ROUND(v_wallet.showcase_credit, 2)::text;
    END IF;

    IF v_wallet.paid_balance < v_paid_to_use THEN
      RAISE EXCEPTION 'Insufficient Paid Balance for Showcase Credit payment. Required: RM%, Available: RM%.',
        ROUND(v_paid_to_use, 2)::text, ROUND(v_wallet.paid_balance, 2)::text;
    END IF;

  ELSIF p_payment_mode = 'TOPUP_CREDIT' THEN
    v_credit_balance_type := 'TOPUP_CREDIT';
    v_max_cap := ROUND(v_event_price * 0.20, 2);

    IF p_topup_credit_requested > 0 THEN
      IF p_topup_credit_requested > v_max_cap THEN
        RAISE EXCEPTION 'Top-up Credit cannot exceed 20%% of event price (Max RM%).', ROUND(v_max_cap, 2)::text;
      END IF;
      v_req := p_topup_credit_requested;
    ELSE
      v_req := v_max_cap;
    END IF;

    v_topup_to_use := LEAST(v_wallet.topup_credit, v_max_cap, v_req, v_event_price);
    v_credit_to_use := v_topup_to_use;
    v_paid_to_use := v_event_price - v_credit_to_use;

    IF v_credit_to_use <= 0 AND v_wallet.topup_credit <= 0 THEN
      RAISE EXCEPTION 'No Top-up Credit available in wallet.';
    END IF;

    IF v_wallet.paid_balance < v_paid_to_use THEN
      RAISE EXCEPTION 'Insufficient Paid Balance for Top-up Credit payment. Required: RM%, Available: RM%.',
        ROUND(v_paid_to_use, 2)::text, ROUND(v_wallet.paid_balance, 2)::text;
    END IF;

  ELSIF p_payment_mode = 'COMBINED_CREDIT' THEN
    -- Welcome credit component
    v_welcome_to_use := LEAST(800.00, v_wallet.welcome_credit, v_event_price);
    
    -- Topup credit component (20% cap)
    v_max_cap := ROUND(v_event_price * 0.20, 2);
    IF p_topup_credit_requested > 0 THEN
      v_req := LEAST(p_topup_credit_requested, v_max_cap);
    ELSE
      v_req := v_max_cap;
    END IF;
    
    v_topup_to_use := LEAST(v_wallet.topup_credit, v_max_cap, v_req, v_event_price - v_welcome_to_use);
    v_credit_to_use := v_welcome_to_use + v_topup_to_use;
    v_paid_to_use := v_event_price - v_credit_to_use;

    IF v_wallet.paid_balance < v_paid_to_use THEN
      RAISE EXCEPTION 'Insufficient Paid Balance for Combined Credit payment. Required: RM%, Available: RM%.',
        ROUND(v_paid_to_use, 2)::text, ROUND(v_wallet.paid_balance, 2)::text;
    END IF;
  END IF;

  -- 6. Insert promotional credit transaction(s) into ledger if used
  IF p_payment_mode = 'COMBINED_CREDIT' THEN
    IF v_welcome_to_use > 0 THEN
      v_credit_ref := COALESCE(p_reference_id || '_welcome_credit', 'event_' || p_event_id::text || '_welcome_credit');
      INSERT INTO public.wallet_transactions (
        organization_id,
        event_id,
        transaction_type,
        balance_type,
        amount,
        currency,
        status,
        reference_id,
        description,
        metadata,
        created_by,
        created_at
      ) VALUES (
        p_organization_id,
        p_event_id,
        'CREDIT_USAGE',
        'WELCOME_CREDIT',
        -v_welcome_to_use,
        'MYR',
        'COMPLETED',
        v_credit_ref,
        COALESCE(p_description, 'Applied RM' || ROUND(v_welcome_to_use, 2)::text || ' Welcome Credit discount'),
        p_metadata || jsonb_build_object(
          'event_id', p_event_id,
          'payment_mode', p_payment_mode,
          'credit_type', 'WELCOME_CREDIT',
          'credit_discount', v_welcome_to_use,
          'event_price', v_event_price
        ),
        p_created_by,
        v_now
      )
      RETURNING * INTO v_credit_txn;
      v_credit_txn_created := true;

      UPDATE public.organization_wallets
      SET welcome_credit = welcome_credit - v_welcome_to_use,
          updated_at = v_now
      WHERE organization_id = p_organization_id;
    END IF;

    IF v_topup_to_use > 0 THEN
      v_topup_ref := COALESCE(p_reference_id || '_topup_credit', 'event_' || p_event_id::text || '_topup_credit');
      INSERT INTO public.wallet_transactions (
        organization_id,
        event_id,
        transaction_type,
        balance_type,
        amount,
        currency,
        status,
        reference_id,
        description,
        metadata,
        created_by,
        created_at
      ) VALUES (
        p_organization_id,
        p_event_id,
        'CREDIT_USAGE',
        'TOPUP_CREDIT',
        -v_topup_to_use,
        'MYR',
        'COMPLETED',
        v_topup_ref,
        COALESCE(p_description, 'Applied RM' || ROUND(v_topup_to_use, 2)::text || ' Event Credit discount'),
        p_metadata || jsonb_build_object(
          'event_id', p_event_id,
          'payment_mode', p_payment_mode,
          'credit_type', 'TOPUP_CREDIT',
          'credit_discount', v_topup_to_use,
          'event_price', v_event_price
        ),
        p_created_by,
        v_now
      )
      RETURNING * INTO v_topup_credit_txn;
      v_topup_credit_txn_created := true;

      UPDATE public.organization_wallets
      SET topup_credit = topup_credit - v_topup_to_use,
          updated_at = v_now
      WHERE organization_id = p_organization_id;
    END IF;
  ELSE
    IF v_credit_to_use > 0 THEN
      v_credit_ref := COALESCE(p_reference_id || '_credit', 'event_' || p_event_id::text || '_credit');
      
      INSERT INTO public.wallet_transactions (
        organization_id,
        event_id,
        transaction_type,
        balance_type,
        amount,
        currency,
        status,
        reference_id,
        description,
        metadata,
        created_by,
        created_at
      ) VALUES (
        p_organization_id,
        p_event_id,
        'CREDIT_USAGE',
        v_credit_balance_type,
        -v_credit_to_use,
        'MYR',
        'COMPLETED',
        v_credit_ref,
        COALESCE(p_description, 'Applied RM' || ROUND(v_credit_to_use, 2)::text || ' ' || replace(p_payment_mode, '_', ' ') || ' discount'),
        p_metadata || jsonb_build_object(
          'event_id', p_event_id,
          'payment_mode', p_payment_mode,
          'credit_discount', v_credit_to_use,
          'event_price', v_event_price
        ),
        p_created_by,
        v_now
      )
      RETURNING * INTO v_credit_txn;
      v_credit_txn_created := true;

      -- Deduct credit balance from wallet
      IF v_credit_balance_type = 'WELCOME_CREDIT' THEN
        UPDATE public.organization_wallets
        SET welcome_credit = welcome_credit - v_credit_to_use,
            updated_at = v_now
        WHERE organization_id = p_organization_id;
      ELSIF v_credit_balance_type = 'SHOWCASE_CREDIT' THEN
        UPDATE public.organization_wallets
        SET showcase_credit = showcase_credit - v_credit_to_use,
            updated_at = v_now
        WHERE organization_id = p_organization_id;
      ELSIF v_credit_balance_type = 'TOPUP_CREDIT' THEN
        UPDATE public.organization_wallets
        SET topup_credit = topup_credit - v_credit_to_use,
            updated_at = v_now
        WHERE organization_id = p_organization_id;
      END IF;
    END IF;
  END IF;

  -- 7. Insert paid balance payment transaction into ledger
  IF v_paid_to_use > 0 THEN
    v_paid_ref := COALESCE(p_reference_id || '_paid', 'event_' || p_event_id::text || '_paid');

    INSERT INTO public.wallet_transactions (
      organization_id,
      event_id,
      transaction_type,
      balance_type,
      amount,
      currency,
      status,
      reference_id,
      description,
      metadata,
      created_by,
      created_at
    ) VALUES (
      p_organization_id,
      p_event_id,
      'EVENT_PAYMENT',
      'PAID_BALANCE',
      -v_paid_to_use,
      'MYR',
      'COMPLETED',
      v_paid_ref,
      COALESCE(p_description, 'Paid RM' || ROUND(v_paid_to_use, 2)::text || ' from Paid Balance for Event'),
      p_metadata || jsonb_build_object(
        'event_id', p_event_id,
        'payment_mode', p_payment_mode,
        'paid_amount', v_paid_to_use,
        'event_price', v_event_price
      ),
      p_created_by,
      v_now
    )
    RETURNING * INTO v_paid_txn;
    v_paid_txn_created := true;

    -- Deduct paid balance from wallet
    UPDATE public.organization_wallets
    SET paid_balance = paid_balance - v_paid_to_use,
        updated_at = v_now
    WHERE organization_id = p_organization_id;
  END IF;

  -- 8. Refresh wallet record
  SELECT * INTO v_wallet FROM public.organization_wallets WHERE organization_id = p_organization_id;

  -- 9. Mark Event as PAID in events table (and promote pending_payment to scheduled)
  IF v_event.id IS NOT NULL THEN
    UPDATE public.events
    SET payment_status = 'PAID',
        payment_mode = p_payment_mode,
        paid_amount = v_paid_to_use,
        discount_amount = v_credit_to_use,
        event_price = v_event_price,
        event_currency = 'MYR',
        status = CASE WHEN status = 'pending_payment' THEN 'scheduled' ELSE status END,
        event_status = 'LIVE',
        updated_at = v_now
    WHERE id = p_event_id;
  END IF;

  -- 10. Return JSON result payload
  RETURN jsonb_build_object(
    'success', true,
    'event_id', p_event_id,
    'payment_mode', p_payment_mode,
    'event_price', v_event_price,
    'paid_amount', v_paid_to_use,
    'discount_amount', v_credit_to_use,
    'credit_transaction', CASE WHEN v_credit_txn_created THEN to_jsonb(v_credit_txn) ELSE NULL END,
    'topup_credit_transaction', CASE WHEN v_topup_credit_txn_created THEN to_jsonb(v_topup_credit_txn) ELSE NULL END,
    'paid_transaction', CASE WHEN v_paid_txn_created THEN to_jsonb(v_paid_txn) ELSE NULL END,
    'wallet', jsonb_build_object(
      'paid_balance', v_wallet.paid_balance,
      'welcome_credit', v_wallet.welcome_credit,
      'showcase_credit', v_wallet.showcase_credit,
      'topup_credit', v_wallet.topup_credit
    )
  );
END;
$$;

-- ------------------------------------------------------------------------------
-- 16. WALLET TOP UP ORDERS TABLE & ATOMIC SETTLEMENT RPC (PHASE 3)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wallet_topup_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  currency TEXT NOT NULL DEFAULT 'MYR',
  top_up_amount NUMERIC(12, 2) NOT NULL CHECK (top_up_amount >= 0),
  expected_credit_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (expected_credit_amount >= 0),
  bonus_percentage NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
  total_wallet_value NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  included_outstanding_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  payable_amount NUMERIC(10, 2),
  total_due NUMERIC(10, 2),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (
    status IN ('PENDING', 'PAID', 'FAILED', 'EXPIRED', 'CANCELLED')
  ),
  payment_reference TEXT,
  payment_method TEXT,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  expired_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.wallet_topup_orders
  DROP CONSTRAINT IF EXISTS wallet_topup_orders_top_up_amount_check;
ALTER TABLE public.wallet_topup_orders
  ADD CONSTRAINT wallet_topup_orders_top_up_amount_check CHECK (top_up_amount >= 0.00);

ALTER TABLE public.wallet_topup_orders
  ADD COLUMN IF NOT EXISTS included_outstanding_amount NUMERIC(10, 2) DEFAULT 0.00 NOT NULL;
ALTER TABLE public.wallet_topup_orders
  ADD COLUMN IF NOT EXISTS payable_amount NUMERIC(10, 2);
ALTER TABLE public.wallet_topup_orders
  ADD COLUMN IF NOT EXISTS total_due NUMERIC(10, 2);

CREATE INDEX IF NOT EXISTS idx_wallet_topup_orders_org_id ON public.wallet_topup_orders (organization_id);
CREATE INDEX IF NOT EXISTS idx_wallet_topup_orders_user_id ON public.wallet_topup_orders (user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_topup_orders_status ON public.wallet_topup_orders (status);
CREATE INDEX IF NOT EXISTS idx_wallet_topup_orders_payment_ref ON public.wallet_topup_orders (payment_reference);
CREATE INDEX IF NOT EXISTS idx_wallet_topup_orders_created_at ON public.wallet_topup_orders (created_at DESC);

-- Unique constraints for idempotent payment settlement
CREATE UNIQUE INDEX IF NOT EXISTS ux_wallet_topup_orders_paid_payment_ref
  ON public.wallet_topup_orders (payment_reference)
  WHERE payment_reference IS NOT NULL AND status = 'PAID';

CREATE UNIQUE INDEX IF NOT EXISTS ux_wallet_topup_orders_paid_stripe_session
  ON public.wallet_topup_orders ((metadata->>'stripe_session_id'))
  WHERE (metadata->>'stripe_session_id') IS NOT NULL AND status = 'PAID';

CREATE UNIQUE INDEX IF NOT EXISTS ux_wallet_topup_orders_paid_payment_intent
  ON public.wallet_topup_orders ((metadata->>'stripe_payment_intent'))
  WHERE (metadata->>'stripe_payment_intent') IS NOT NULL AND status = 'PAID';

-- Dedicated table for logging and deduplicating payment provider webhooks
CREATE TABLE IF NOT EXISTS public.payment_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL DEFAULT 'stripe',
  event_type TEXT NOT NULL,
  order_id UUID REFERENCES public.wallet_topup_orders(id) ON DELETE SET NULL,
  status TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_order_id ON public.payment_webhook_events (order_id);
CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_created_at ON public.payment_webhook_events (created_at DESC);

ALTER TABLE public.wallet_topup_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view organization top-up orders" ON public.wallet_topup_orders;
CREATE POLICY "Members can view organization top-up orders"
  ON public.wallet_topup_orders FOR SELECT
  USING (
    public.is_org_member(organization_id) OR public.is_developer_admin()
  );

DROP POLICY IF EXISTS "Owners and admins can create top-up orders" ON public.wallet_topup_orders;
CREATE POLICY "Owners and admins can create top-up orders"
  ON public.wallet_topup_orders FOR INSERT
  WITH CHECK (
    public.get_org_role(organization_id) IN ('owner', 'admin') OR public.is_developer_admin()
  );

DROP POLICY IF EXISTS "Owners and admins can update top-up orders" ON public.wallet_topup_orders;
DROP POLICY IF EXISTS "Owners and admins can cancel pending top-up orders" ON public.wallet_topup_orders;
CREATE POLICY "Owners and admins can cancel pending top-up orders"
  ON public.wallet_topup_orders FOR UPDATE
  USING (
    public.get_org_role(organization_id) IN ('owner', 'admin') OR public.is_developer_admin()
  )
  WITH CHECK (
    (public.is_developer_admin()) OR
    (public.get_org_role(organization_id) IN ('owner', 'admin') AND status IN ('CANCELLED', 'PENDING'))
  );

CREATE OR REPLACE FUNCTION public.process_topup_order_atomic(
  p_order_id UUID,
  p_organization_id UUID,
  p_status TEXT,
  p_payment_reference TEXT DEFAULT NULL,
  p_payment_method TEXT DEFAULT NULL,
  p_processed_by UUID DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order public.wallet_topup_orders%ROWTYPE;
  v_wallet public.organization_wallets%ROWTYPE;
  v_topup_txn public.wallet_transactions%ROWTYPE;
  v_promo_txn public.wallet_transactions%ROWTYPE;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
  v_promo_credit NUMERIC := 0.00;
  v_tier_rate TEXT := '0%';
  v_existing_topup public.wallet_transactions%ROWTYPE;
  v_existing_promo public.wallet_transactions%ROWTYPE;
  v_existing_topup_found BOOLEAN := false;
  v_existing_promo_found BOOLEAN := false;
  v_topup_txn_created BOOLEAN := false;
  v_promo_txn_created BOOLEAN := false;
  v_included_outstanding NUMERIC(12,2) := 0.00;
  v_resolved_payment_ref TEXT;
BEGIN
  -- 1. Input validations
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'Order ID is required';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'Organization ID is required';
  END IF;

  IF p_status NOT IN ('PAID', 'FAILED', 'EXPIRED', 'CANCELLED', 'PENDING') THEN
    RAISE EXCEPTION 'Invalid status: %. Must be PAID, FAILED, EXPIRED, or CANCELLED', p_status;
  END IF;

  -- 2. Lock & Validate Top-up Order Record
  SELECT * INTO v_order
  FROM public.wallet_topup_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Top-up order not found: %', p_order_id;
  END IF;

  IF v_order.organization_id <> p_organization_id THEN
    RAISE EXCEPTION 'Security Error: Top-up order does not belong to your organization';
  END IF;

  -- 3. Idempotency Check: Already PAID order
  IF v_order.status = 'PAID' THEN
    IF p_status = 'PAID' THEN
      SELECT * INTO v_existing_topup
      FROM public.wallet_transactions
      WHERE organization_id = p_organization_id
        AND reference_id = 'topup_order_' || p_order_id::text
        AND transaction_type = 'TOPUP'
        AND status = 'COMPLETED'
      LIMIT 1;
      v_existing_topup_found := FOUND;

      SELECT * INTO v_existing_promo
      FROM public.wallet_transactions
      WHERE organization_id = p_organization_id
        AND reference_id = 'topup_order_' || p_order_id::text || '_promo'
        AND transaction_type = 'TOPUP_CREDIT'
        AND status = 'COMPLETED'
      LIMIT 1;
      v_existing_promo_found := FOUND;

      SELECT * INTO v_wallet FROM public.organization_wallets WHERE organization_id = p_organization_id;

      RETURN jsonb_build_object(
        'success', true,
        'is_idempotent_replay', true,
        'order', to_jsonb(v_order),
        'topup_transaction', CASE WHEN v_existing_topup_found THEN to_jsonb(v_existing_topup) ELSE NULL END,
        'promo_credit_transaction', CASE WHEN v_existing_promo_found THEN to_jsonb(v_existing_promo) ELSE NULL END,
        'wallet', jsonb_build_object(
          'paid_balance', COALESCE(v_wallet.paid_balance, 0.00),
          'welcome_credit', COALESCE(v_wallet.welcome_credit, 0.00),
          'showcase_credit', COALESCE(v_wallet.showcase_credit, 0.00),
          'topup_credit', COALESCE(v_wallet.topup_credit, 0.00),
          'outstanding_balance', COALESCE(v_wallet.outstanding_balance, 0.00),
          'currency', COALESCE(v_wallet.currency, 'MYR')
        ),
        'message', 'Top-up order is already marked as PAID and credited (idempotent no-op).'
      );
    ELSE
      RAISE EXCEPTION 'Cannot change status of an already PAID top-up order (%) to %', p_order_id, p_status;
    END IF;
  END IF;

  -- 4. Terminal State Transition Protection
  IF v_order.status IN ('FAILED', 'EXPIRED', 'CANCELLED') THEN
    IF v_order.status = p_status THEN
      RETURN jsonb_build_object(
        'success', true,
        'is_idempotent_replay', true,
        'order', to_jsonb(v_order),
        'message', 'Top-up order is already in status ' || p_status || '.'
      );
    ELSE
      RAISE EXCEPTION 'Cannot change status of a % top-up order (%) to %', v_order.status, p_order_id, p_status;
    END IF;
  END IF;

  -- 5. Process Transition to PAID
  IF p_status = 'PAID' THEN
    -- A. Security Gate: Verify trusted settlement flag
    IF (COALESCE(p_metadata->>'is_trusted_settlement', 'false') <> 'true') AND (CURRENT_USER NOT IN ('postgres', 'service_role')) THEN
      RAISE EXCEPTION 'Security Error: Top-up order status transition to PAID requires trusted settlement verification';
    END IF;

    -- B. Payment Reference Validation
    v_resolved_payment_ref := COALESCE(p_payment_reference, v_order.payment_reference);
    IF v_resolved_payment_ref IS NULL OR LENGTH(TRIM(v_resolved_payment_ref)) = 0 THEN
      RAISE EXCEPTION 'Security Error: Transition to PAID requires a valid non-empty payment reference';
    END IF;

    -- C. Lock Organization Wallet & Verify Currency
    SELECT * INTO v_wallet
    FROM public.organization_wallets
    WHERE organization_id = p_organization_id
    FOR UPDATE;

    IF NOT FOUND THEN
      INSERT INTO public.organization_wallets (
        organization_id,
        paid_balance,
        welcome_credit,
        showcase_credit,
        topup_credit,
        outstanding_balance,
        currency
      ) VALUES (
        p_organization_id,
        0.00,
        0.00,
        0.00,
        0.00,
        0.00,
        COALESCE(v_order.currency, 'MYR')
      )
      RETURNING * INTO v_wallet;
    END IF;

    -- Currency Match Enforcement: Order currency MUST match Wallet currency
    IF v_wallet.currency IS NOT NULL AND v_order.currency IS NOT NULL AND UPPER(v_order.currency) <> UPPER(v_wallet.currency) THEN
      RAISE EXCEPTION 'Currency mismatch: Top-up order currency (%) does not match organization wallet currency (%)', v_order.currency, v_wallet.currency;
    END IF;

    -- D. Calculate Qualifying Promotional Credit
    IF v_order.top_up_amount >= 10000.00 THEN
      v_promo_credit := ROUND(v_order.top_up_amount * 0.07, 2);
      v_tier_rate := '7%';
    ELSIF v_order.top_up_amount >= 6000.00 THEN
      v_promo_credit := ROUND(v_order.top_up_amount * 0.05, 2);
      v_tier_rate := '5%';
    ELSE
      v_promo_credit := 0.00;
      v_tier_rate := '0%';
    END IF;

    -- E. Update Order Record
    UPDATE public.wallet_topup_orders
    SET
      status = 'PAID',
      paid_at = v_now,
      updated_at = v_now,
      payment_reference = v_resolved_payment_ref,
      payment_method = COALESCE(p_payment_method, v_order.payment_method),
      notes = COALESCE(p_reason, v_order.notes),
      metadata = v_order.metadata || COALESCE(p_metadata, '{}'::jsonb)
    WHERE id = p_order_id
    RETURNING * INTO v_order;

    INSERT INTO public.wallet_transactions (
      organization_id,
      event_id,
      transaction_type,
      balance_type,
      amount,
      currency,
      status,
      reference_id,
      description,
      metadata,
      created_by,
      created_at
    ) VALUES (
      p_organization_id,
      NULL,
      'TOPUP',
      'PAID_BALANCE',
      v_order.top_up_amount,
      v_order.currency,
      'COMPLETED',
      'topup_order_' || p_order_id::text,
      'Top-up Order ' || UPPER(SUBSTRING(p_order_id::text, 1, 8)),
      jsonb_build_object(
        'topup_order_id', p_order_id,
        'payment_reference', v_order.payment_reference,
        'payment_method', v_order.payment_method,
        'reason', p_reason
      ) || COALESCE(p_metadata, '{}'::jsonb),
      COALESCE(p_processed_by, v_order.user_id),
      v_now
    )
    RETURNING * INTO v_topup_txn;
    v_topup_txn_created := true;

    IF v_promo_credit > 0 THEN
      INSERT INTO public.wallet_transactions (
        organization_id,
        event_id,
        transaction_type,
        balance_type,
        amount,
        currency,
        status,
        reference_id,
        description,
        metadata,
        created_by,
        created_at
      ) VALUES (
        p_organization_id,
        NULL,
        'TOPUP_CREDIT',
        'TOPUP_CREDIT',
        v_promo_credit,
        v_order.currency,
        'COMPLETED',
        'topup_order_' || p_order_id::text || '_promo',
        'Promotional ' || v_tier_rate || ' Top-up Credit on RM' || ROUND(v_order.top_up_amount, 2)::text || ' deposit',
        jsonb_build_object(
          'parent_topup_id', v_topup_txn.id,
          'topup_order_id', p_order_id,
          'qualifying_amount', v_order.top_up_amount,
          'reward_rate', v_tier_rate
        ) || COALESCE(p_metadata, '{}'::jsonb),
        COALESCE(p_processed_by, v_order.user_id),
        v_now
      )
      RETURNING * INTO v_promo_txn;
      v_promo_txn_created := true;
    END IF;

    -- Extract included outstanding balance from order record or metadata
    v_included_outstanding := GREATEST(
      0.00,
      COALESCE(
        NULLIF(v_order.included_outstanding_amount, 0),
        NULLIF((v_order.metadata->>'included_outstanding_amount'), '')::numeric,
        NULLIF((p_metadata->>'included_outstanding_amount'), '')::numeric,
        0.00
      )
    );

    -- ATOMIC UPDATE: Credit paid balance and top-up credit while simultaneously deducting outstanding balance
    UPDATE public.organization_wallets
    SET
      paid_balance = paid_balance + v_order.top_up_amount,
      topup_credit = topup_credit + v_promo_credit,
      outstanding_balance = GREATEST(0.00, COALESCE(outstanding_balance, 0.00) - v_included_outstanding),
      updated_at = v_now
    WHERE organization_id = p_organization_id
    RETURNING * INTO v_wallet;

    RETURN jsonb_build_object(
      'success', true,
      'is_idempotent_replay', false,
      'order', to_jsonb(v_order),
      'topup_transaction', CASE WHEN v_topup_txn_created THEN to_jsonb(v_topup_txn) ELSE NULL END,
      'promo_credit_transaction', CASE WHEN v_promo_txn_created THEN to_jsonb(v_promo_txn) ELSE NULL END,
      'wallet', jsonb_build_object(
        'paid_balance', v_wallet.paid_balance,
        'welcome_credit', v_wallet.welcome_credit,
        'showcase_credit', v_wallet.showcase_credit,
        'topup_credit', v_wallet.topup_credit,
        'outstanding_balance', COALESCE(v_wallet.outstanding_balance, 0.00),
        'currency', v_wallet.currency
      ),
      'message', 'Top-up order successfully marked as PAID. Wallet credited with RM' || ROUND(v_order.top_up_amount, 2)::text || ' cash balance and RM' || ROUND(v_promo_credit, 2)::text || ' promotional credits.'
    );
  END IF;

  -- 6. Process Non-PAID Transitions (FAILED, EXPIRED, CANCELLED)
  IF p_status = 'FAILED' THEN
    UPDATE public.wallet_topup_orders
    SET
      status = 'FAILED',
      failed_at = v_now,
      updated_at = v_now,
      notes = COALESCE(p_reason, notes),
      metadata = metadata || COALESCE(p_metadata, '{}'::jsonb)
    WHERE id = p_order_id
    RETURNING * INTO v_order;

    RETURN jsonb_build_object(
      'success', true,
      'is_idempotent_replay', false,
      'order', to_jsonb(v_order),
      'message', 'Top-up order marked as FAILED. No funds or credits were added to the wallet.'
    );
  ELSIF p_status = 'EXPIRED' THEN
    UPDATE public.wallet_topup_orders
    SET
      status = 'EXPIRED',
      expired_at = v_now,
      updated_at = v_now,
      notes = COALESCE(p_reason, notes),
      metadata = metadata || COALESCE(p_metadata, '{}'::jsonb)
    WHERE id = p_order_id
    RETURNING * INTO v_order;

    RETURN jsonb_build_object(
      'success', true,
      'is_idempotent_replay', false,
      'order', to_jsonb(v_order),
      'message', 'Top-up order marked as EXPIRED. No funds or credits were added to the wallet.'
    );
  ELSIF p_status = 'CANCELLED' THEN
    UPDATE public.wallet_topup_orders
    SET
      status = 'CANCELLED',
      cancelled_at = v_now,
      updated_at = v_now,
      notes = COALESCE(p_reason, notes),
      metadata = metadata || COALESCE(p_metadata, '{}'::jsonb)
    WHERE id = p_order_id
    RETURNING * INTO v_order;

    RETURN jsonb_build_object(
      'success', true,
      'is_idempotent_replay', false,
      'order', to_jsonb(v_order),
      'message', 'Top-up order marked as CANCELLED. No funds or credits were added to the wallet.'
    );
  END IF;

  RAISE EXCEPTION 'Unsupported status transition: %', p_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.settle_wallet_topup_order(
  p_order_id UUID,
  p_organization_id UUID,
  p_status TEXT,
  p_payment_reference TEXT DEFAULT NULL,
  p_payment_method TEXT DEFAULT NULL,
  p_processed_by UUID DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Authoritative settlement is delegated directly to the canonical process_topup_order_atomic function
  RETURN public.process_topup_order_atomic(
    p_order_id := p_order_id,
    p_organization_id := p_organization_id,
    p_status := p_status,
    p_payment_reference := p_payment_reference,
    p_payment_method := p_payment_method,
    p_processed_by := p_processed_by,
    p_reason := p_reason,
    p_metadata := p_metadata
  );
END;
$$;

-- ------------------------------------------------------------------------------
-- 17. EVENT HIGH SCORES TABLE & PERFORMANCE INDEXES
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.event_high_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  player_name VARCHAR(50) NOT NULL DEFAULT 'Player',
  score INTEGER NOT NULL DEFAULT 0 CHECK (score >= 0),
  session_id VARCHAR(100),
  score_mode VARCHAR(20) DEFAULT 'LIVE',
  is_test BOOLEAN DEFAULT false,
  score_environment VARCHAR(20) DEFAULT 'live',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT event_high_scores_score_environment_check CHECK (score_environment IN ('test', 'live', 'TEST', 'LIVE'))
);

-- Global leaderboard idempotency constraint
CREATE UNIQUE INDEX IF NOT EXISTS uq_event_high_scores_event_session
  ON public.event_high_scores (event_id, session_id)
  WHERE session_id IS NOT NULL AND session_id <> '';

CREATE INDEX IF NOT EXISTS idx_event_high_scores_metadata_session_id
  ON public.event_high_scores (event_id, (metadata->>'sessionId'))
  WHERE metadata->>'sessionId' IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_event_high_scores_event_score 
  ON public.event_high_scores (event_id, score DESC, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_event_high_scores_created_at 
  ON public.event_high_scores (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_event_high_scores_mode 
  ON public.event_high_scores (event_id, score_mode);

CREATE INDEX IF NOT EXISTS idx_event_high_scores_is_test
  ON public.event_high_scores (event_id, is_test);

CREATE INDEX IF NOT EXISTS idx_event_high_scores_score_environment
  ON public.event_high_scores (event_id, score_environment, score DESC, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_event_high_scores_clearing
  ON public.event_high_scores (event_id, score_environment, score_mode, is_test);

ALTER TABLE public.event_high_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view event high scores" ON public.event_high_scores;
DROP POLICY IF EXISTS "Anyone can view high scores of published events" ON public.event_high_scores;
DROP POLICY IF EXISTS "Public can insert event high scores" ON public.event_high_scores;
DROP POLICY IF EXISTS "Org members and developer admins can insert high scores" ON public.event_high_scores;
DROP POLICY IF EXISTS "Event managers can delete high scores" ON public.event_high_scores;
DROP POLICY IF EXISTS "Developer admins can update high scores" ON public.event_high_scores;

-- Hardened SELECT: Only allow viewing scores for live window/paid events or when user belongs to the event's organization
CREATE POLICY "Anyone can view high scores of published events"
  ON public.event_high_scores
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_high_scores.event_id
        AND (
          -- Path 1: Organization members and developer admins can always view their own event scores (including test scores)
          (auth.uid() IS NOT NULL AND public.get_org_role(e.organization_id) IS NOT NULL)
          OR public.is_developer_admin()
          -- Path 2: Public access requires the event to actually be in the public live window
          OR (
            e.payment_status = 'PAID'
            AND COALESCE(e.status, '') != 'cancelled'
            AND COALESCE(e.event_status, '') != 'CANCELLED'
            AND e.cancel_reason IS NULL
            AND (NOW() AT TIME ZONE 'Asia/Singapore')::date >= (
              COALESCE(
                CASE WHEN e.start_date::text ~ '^\d{4}-\d{2}-\d{2}$' THEN e.start_date::text::date ELSE NULL END,
                CASE WHEN e.event_date::text ~ '^\d{4}-\d{2}-\d{2}$' THEN e.event_date::text::date ELSE NULL END,
                (e.starts_at AT TIME ZONE 'Asia/Singapore')::date
              ) - 1
            )
            AND (NOW() AT TIME ZONE 'Asia/Singapore')::date <= (
              COALESCE(
                CASE WHEN e.end_date::text ~ '^\d{4}-\d{2}-\d{2}$' THEN e.end_date::text::date ELSE NULL END,
                (e.expires_at AT TIME ZONE 'Asia/Singapore')::date,
                CASE WHEN e.start_date::text ~ '^\d{4}-\d{2}-\d{2}$' THEN e.start_date::text::date ELSE NULL END,
                CASE WHEN e.event_date::text ~ '^\d{4}-\d{2}-\d{2}$' THEN e.event_date::text::date ELSE NULL END,
                (e.starts_at AT TIME ZONE 'Asia/Singapore')::date
              )
            )
            -- TEST scores should NEVER be exposed to public queries
            AND (event_high_scores.score_environment IS NULL OR event_high_scores.score_environment NOT IN ('test', 'TEST'))
            AND (event_high_scores.score_mode IS NULL OR event_high_scores.score_mode != 'TEST')
            AND (event_high_scores.is_test IS NOT TRUE)
            AND (event_high_scores.metadata IS NULL OR (
              (event_high_scores.metadata->>'score_mode') IS DISTINCT FROM 'TEST'
              AND (event_high_scores.metadata->>'score_environment') IS DISTINCT FROM 'test'
              AND (event_high_scores.metadata->>'score_environment') IS DISTINCT FROM 'TEST'
              AND (event_high_scores.metadata->>'is_test') IS DISTINCT FROM 'true'
            ))
          )
        )
    )
  );

-- Hardened INSERT:
-- Public player submissions MUST pass through the backend proxy (Worker/Server) with rate limiting
-- and validation using service-role. Direct anon client inserts are denied.
-- Authenticated org members or developer admins may submit scores for their events.
CREATE POLICY "Org members and developer admins can insert high scores"
  ON public.event_high_scores
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_high_scores.event_id
        AND (
          public.get_org_role(e.organization_id) IN ('owner', 'admin', 'designer', 'viewer')
          OR public.is_developer_admin()
        )
    )
  );

-- Hardened DELETE:
-- Only organization owners and admins (or developer admins) can delete/reset scores for their event.
CREATE POLICY "Event managers can delete high scores"
  ON public.event_high_scores
  FOR DELETE
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_high_scores.event_id
        AND (
          public.get_org_role(e.organization_id) IN ('owner', 'admin')
          OR public.is_developer_admin()
        )
    )
  );

-- Hardened UPDATE:
-- Only developer admins can update scores
CREATE POLICY "Developer admins can update high scores"
  ON public.event_high_scores
  FOR UPDATE
  USING (public.is_developer_admin());

-- ------------------------------------------------------------------------------
-- 17B. AUTOMATIC TEST SCORE CLEARING FUNCTIONS & TRIGGERS
-- ------------------------------------------------------------------------------

-- Stored Procedure: Clear all TEST scores for an event (idempotent, strictly preserves LIVE scores)
-- p_update_event: when true, updates events.test_scores_cleared_at; when false, skips updating events table
-- (useful when called from a BEFORE UPDATE trigger on events to eliminate recursive trigger execution).
CREATE OR REPLACE FUNCTION public.clear_event_test_scores(
  p_event_id UUID,
  p_update_event BOOLEAN DEFAULT TRUE
)
RETURNS INTEGER AS $$
DECLARE
  v_deleted_count INTEGER := 0;
BEGIN
  IF p_event_id IS NULL THEN
    RETURN 0;
  END IF;

  -- Delete only TEST scores, strictly preserving LIVE scores
  DELETE FROM public.event_high_scores
  WHERE event_id = p_event_id
    AND (
      score_environment IN ('test', 'TEST')
      OR score_mode = 'TEST'
      OR is_test = true
      OR (metadata->>'score_environment') ILIKE 'test'
      OR (metadata->>'score_mode') ILIKE 'test'
      OR (metadata->>'is_test') = 'true'
    );
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  -- Atomically record test_scores_cleared_at timestamp on the event record if requested
  IF p_update_event AND pg_trigger_depth() = 0 THEN
    UPDATE public.events
    SET test_scores_cleared_at = COALESCE(test_scores_cleared_at, NOW()),
        updated_at = NOW()
    WHERE id = p_event_id
      AND test_scores_cleared_at IS NULL;
  END IF;

  RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Batch Stored Procedure: Auto clear test scores for all events that reached their configured start date
CREATE OR REPLACE FUNCTION public.auto_clear_test_scores_for_started_events(p_current_date TEXT DEFAULT NULL)
RETURNS TABLE(event_id UUID, cleared_count INTEGER) AS $$
DECLARE
  v_cur_date TEXT;
  v_rec RECORD;
  v_cleared INTEGER;
BEGIN
  -- Derive Singapore calendar date (Asia/Singapore, UTC+8) if not explicitly provided
  IF p_current_date IS NOT NULL AND p_current_date::text ~ '^\d{4}-\d{2}-\d{2}$' THEN
    v_cur_date := p_current_date::text;
  ELSE
    v_cur_date := TO_CHAR((NOW() AT TIME ZONE 'Asia/Singapore'), 'YYYY-MM-DD');
  END IF;

  FOR v_rec IN
    SELECT e.id
    FROM public.events e
    WHERE e.test_scores_cleared_at IS NULL
      AND (
        (e.event_date IS NOT NULL AND e.event_date::text <= v_cur_date)
        OR (e.event_date IS NULL AND TO_CHAR((e.starts_at AT TIME ZONE 'Asia/Singapore'), 'YYYY-MM-DD') <= v_cur_date)
        OR e.starts_at <= NOW()
        OR e.event_status = 'LIVE'
        OR e.status IN ('live', 'active')
      )
      AND (e.status != 'cancelled' OR e.status IS NULL)
      AND (e.event_status != 'CANCELLED' OR e.event_status IS NULL)
      AND e.cancel_reason IS NULL
  LOOP
    v_cleared := public.clear_event_test_scores(v_rec.id, TRUE);
    event_id := v_rec.id;
    cleared_count := v_cleared;
    RETURN NEXT;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on events table: Automatically clear test scores when event reaches start date or becomes LIVE
-- Designed to be 100% RECURSION-SAFE:
-- - Uses pg_trigger_depth() check
-- - Directly mutates NEW.test_scores_cleared_at without issuing an UPDATE on public.events
-- - Calls clear_event_test_scores with p_update_event = FALSE
CREATE OR REPLACE FUNCTION public.trg_auto_clear_test_scores_on_event_update()
RETURNS TRIGGER AS $$
DECLARE
  v_cur_date TEXT;
  v_start_date TEXT;
  v_should_clear BOOLEAN := false;
BEGIN
  -- Prevent any nested trigger recursion
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  -- If already marked as cleared, nothing to do
  IF OLD.test_scores_cleared_at IS NOT NULL OR NEW.test_scores_cleared_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_cur_date := TO_CHAR((NOW() AT TIME ZONE 'Asia/Singapore'), 'YYYY-MM-DD');
  v_start_date := COALESCE(
    CASE WHEN NEW.event_date::text ~ '^\d{4}-\d{2}-\d{2}$' THEN NEW.event_date::text ELSE NULL END,
    TO_CHAR((NEW.starts_at AT TIME ZONE 'Asia/Singapore'), 'YYYY-MM-DD')
  );

  IF (v_start_date IS NOT NULL AND v_cur_date >= v_start_date)
     OR (NEW.starts_at IS NOT NULL AND NOW() >= NEW.starts_at)
     OR (NEW.status IN ('live', 'active'))
     OR (NEW.event_status = 'LIVE')
  THEN
    v_should_clear := true;
  END IF;

  IF v_should_clear 
     AND (NEW.status != 'cancelled' OR NEW.status IS NULL) 
     AND (NEW.event_status != 'CANCELLED' OR NEW.event_status IS NULL)
     AND NEW.cancel_reason IS NULL
  THEN
    -- Directly update the in-flight row state without triggering a recursive UPDATE statement
    NEW.test_scores_cleared_at := NOW();
    -- Purge TEST scores from event_high_scores (p_update_event := false to avoid re-triggering)
    PERFORM public.clear_event_test_scores(NEW.id, FALSE);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_events_auto_clear_test_scores ON public.events;
CREATE TRIGGER trg_events_auto_clear_test_scores
  BEFORE UPDATE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_auto_clear_test_scores_on_event_update();

-- Trigger on event_high_scores table: Enforce that started events purge test scores and record LIVE scores
-- Designed to be CONCURRENCY-SAFE:
-- - Uses atomic conditional UPDATE on public.events to ensure test scores are cleared only once across concurrent inserts
-- - Does not alter legitimate historical TEST scores before the event start date
-- - Strictly preserves all LIVE scores
CREATE OR REPLACE FUNCTION public.trg_event_high_scores_enforce_live()
RETURNS TRIGGER AS $$
DECLARE
  v_event RECORD;
  v_cur_date TEXT;
  v_start_date TEXT;
  v_is_started BOOLEAN := false;
BEGIN
  -- Prevent trigger recursion
  IF pg_trigger_depth() > 2 THEN
    RETURN NEW;
  END IF;

  SELECT id, event_date, starts_at, status, event_status, cancel_reason, test_scores_cleared_at
  INTO v_event
  FROM public.events
  WHERE id = NEW.event_id;

  IF FOUND THEN
    -- Skip cancelled events
    IF v_event.event_status = 'CANCELLED' OR v_event.status = 'cancelled' OR v_event.cancel_reason IS NOT NULL THEN
      RETURN NEW;
    END IF;

    v_cur_date := TO_CHAR((NOW() AT TIME ZONE 'Asia/Singapore'), 'YYYY-MM-DD');
    v_start_date := COALESCE(
      CASE WHEN v_event.event_date::text ~ '^\d{4}-\d{2}-\d{2}$' THEN v_event.event_date::text ELSE NULL END,
      TO_CHAR((v_event.starts_at AT TIME ZONE 'Asia/Singapore'), 'YYYY-MM-DD')
    );

    IF (v_start_date IS NOT NULL AND v_cur_date >= v_start_date)
       OR (v_event.starts_at IS NOT NULL AND NOW() >= v_event.starts_at)
       OR v_event.status IN ('live', 'active')
       OR v_event.event_status = 'LIVE'
    THEN
      v_is_started := true;
    END IF;

    -- Only enforce LIVE mode and score clearing if the event has officially reached its start date
    IF v_is_started THEN
      -- If test scores have not yet been marked cleared, atomically claim and clear them
      IF v_event.test_scores_cleared_at IS NULL THEN
        -- Atomic test-and-set: Only one concurrent transaction will get FOUND = true
        UPDATE public.events
        SET test_scores_cleared_at = NOW(),
            updated_at = NOW()
        WHERE id = v_event.id
          AND test_scores_cleared_at IS NULL;

        IF FOUND THEN
          PERFORM public.clear_event_test_scores(v_event.id, FALSE);
        END IF;
      END IF;

      -- Normalize new score submissions on started events to LIVE
      IF NEW.score_environment IN ('test', 'TEST') OR NEW.score_mode = 'TEST' OR NEW.is_test = true THEN
        NEW.score_environment := 'live';
        NEW.score_mode := 'LIVE';
        NEW.is_test := false;

        -- Clean metadata test flags if present
        IF NEW.metadata IS NOT NULL THEN
          IF (NEW.metadata->>'score_environment') ILIKE 'test' THEN
            NEW.metadata := jsonb_set(NEW.metadata, '{score_environment}', '"live"');
          END IF;
          IF (NEW.metadata->>'score_mode') ILIKE 'test' THEN
            NEW.metadata := jsonb_set(NEW.metadata, '{score_mode}', '"LIVE"');
          END IF;
          IF (NEW.metadata->>'is_test') = 'true' THEN
            NEW.metadata := jsonb_set(NEW.metadata, '{is_test}', 'false');
          END IF;
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_event_high_scores_enforce_live ON public.event_high_scores;
CREATE TRIGGER trg_event_high_scores_enforce_live
  BEFORE INSERT ON public.event_high_scores
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_event_high_scores_enforce_live();

-- ------------------------------------------------------------------------------
-- 18. PLATFORM SETTINGS TABLE (SERVER-AUTHORITATIVE GLOBAL CONFIGURATION)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

INSERT INTO public.platform_settings (key, value, description)
VALUES (
  'event_pricing',
  jsonb_build_object(
    'default_price', 1400.00,
    'default_currency', 'MYR',
    'pricing_rules', jsonb_build_array(
      jsonb_build_object('id', 'rule_1d', 'min_days', 1, 'max_days', 1, 'price', 1400.00, 'currency', 'MYR', 'active', true),
      jsonb_build_object('id', 'rule_2d', 'min_days', 2, 'max_days', 2, 'price', 1900.00, 'currency', 'MYR', 'active', true),
      jsonb_build_object('id', 'rule_3d', 'min_days', 3, 'max_days', 3, 'price', 2200.00, 'currency', 'MYR', 'active', true),
      jsonb_build_object('id', 'rule_4d', 'min_days', 4, 'max_days', 4, 'price', 2400.00, 'currency', 'MYR', 'active', true),
      jsonb_build_object('id', 'rule_5d', 'min_days', 5, 'max_days', 5, 'price', 2500.00, 'currency', 'MYR', 'active', true),
      jsonb_build_object('id', 'rule_6d', 'min_days', 6, 'max_days', 6, 'price', 2600.00, 'currency', 'MYR', 'active', true),
      jsonb_build_object('id', 'rule_7d', 'min_days', 7, 'max_days', 7, 'price', 2800.00, 'currency', 'MYR', 'active', true),
      jsonb_build_object('id', 'rule_8_14d', 'min_days', 8, 'max_days', 14, 'price', 3500.00, 'currency', 'MYR', 'active', true),
      jsonb_build_object('id', 'rule_15_30d', 'min_days', 15, 'max_days', 30, 'price', 4500.00, 'currency', 'MYR', 'active', true),
      jsonb_build_object('id', 'rule_31_60d', 'min_days', 31, 'max_days', 60, 'price', 6000.00, 'currency', 'MYR', 'active', true),
      jsonb_build_object('id', 'rule_61_90d', 'min_days', 61, 'max_days', 90, 'price', 8000.00, 'currency', 'MYR', 'active', true),
      jsonb_build_object('id', 'rule_91plus', 'min_days', 91, 'max_days', null, 'price', 10000.00, 'currency', 'MYR', 'active', true)
    )
  ),
  'Platform default event pricing configuration for new events'
)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read platform settings" ON public.platform_settings;
CREATE POLICY "Anyone can read platform settings"
  ON public.platform_settings FOR SELECT USING (true);

DROP POLICY IF EXISTS "Developer admins can manage platform settings" ON public.platform_settings;
CREATE POLICY "Developer admins can manage platform settings"
  ON public.platform_settings FOR ALL
  USING (public.is_developer_admin())
  WITH CHECK (public.is_developer_admin());

-- ------------------------------------------------------------------------------
-- 19. GOOGLE MAIL SETTINGS TABLE (GMAIL API INTEGRATION)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.google_mail_settings (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL UNIQUE DEFAULT 'google_mail',
  email_address TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'connected',
  last_error TEXT,
  last_connected_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  connected_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);

ALTER TABLE public.google_mail_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Developer admins can manage google_mail_settings" ON public.google_mail_settings;
CREATE POLICY "Developer admins can manage google_mail_settings"
  ON public.google_mail_settings FOR ALL
  USING (public.is_developer_admin())
  WITH CHECK (public.is_developer_admin());

-- ------------------------------------------------------------------------------
-- 20. FINANCIAL RPC SECURITY & EXECUTE PRIVILEGES
-- ------------------------------------------------------------------------------
-- CRITICAL PRODUCTION SECURITY:
-- Revoke all execute privileges on SECURITY DEFINER financial transaction RPCs
-- from PUBLIC, anon, and authenticated roles so they cannot be directly invoked
-- from client SDKs. Only the trusted server-side service_role can execute them.

-- A. settle_wallet_topup_order
REVOKE ALL ON FUNCTION public.settle_wallet_topup_order(
  UUID, UUID, TEXT, TEXT, TEXT, UUID, TEXT, JSONB
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.settle_wallet_topup_order(
  UUID, UUID, TEXT, TEXT, TEXT, UUID, TEXT, JSONB
) FROM anon;
REVOKE ALL ON FUNCTION public.settle_wallet_topup_order(
  UUID, UUID, TEXT, TEXT, TEXT, UUID, TEXT, JSONB
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.settle_wallet_topup_order(
  UUID, UUID, TEXT, TEXT, TEXT, UUID, TEXT, JSONB
) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_wallet_topup_order(
  UUID, UUID, TEXT, TEXT, TEXT, UUID, TEXT, JSONB
) TO postgres;

-- B. process_topup_order_atomic
REVOKE ALL ON FUNCTION public.process_topup_order_atomic(
  UUID, UUID, TEXT, TEXT, TEXT, UUID, TEXT, JSONB
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_topup_order_atomic(
  UUID, UUID, TEXT, TEXT, TEXT, UUID, TEXT, JSONB
) FROM anon;
REVOKE ALL ON FUNCTION public.process_topup_order_atomic(
  UUID, UUID, TEXT, TEXT, TEXT, UUID, TEXT, JSONB
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.process_topup_order_atomic(
  UUID, UUID, TEXT, TEXT, TEXT, UUID, TEXT, JSONB
) TO service_role;
GRANT EXECUTE ON FUNCTION public.process_topup_order_atomic(
  UUID, UUID, TEXT, TEXT, TEXT, UUID, TEXT, JSONB
) TO postgres;

-- C. process_event_payment_atomic
REVOKE ALL ON FUNCTION public.process_event_payment_atomic(
  UUID, UUID, TEXT, NUMERIC, NUMERIC, TEXT, UUID, TEXT, JSONB
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_event_payment_atomic(
  UUID, UUID, TEXT, NUMERIC, NUMERIC, TEXT, UUID, TEXT, JSONB
) FROM anon;
REVOKE ALL ON FUNCTION public.process_event_payment_atomic(
  UUID, UUID, TEXT, NUMERIC, NUMERIC, TEXT, UUID, TEXT, JSONB
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.process_event_payment_atomic(
  UUID, UUID, TEXT, NUMERIC, NUMERIC, TEXT, UUID, TEXT, JSONB
) TO service_role;
GRANT EXECUTE ON FUNCTION public.process_event_payment_atomic(
  UUID, UUID, TEXT, NUMERIC, NUMERIC, TEXT, UUID, TEXT, JSONB
) TO postgres;

-- ------------------------------------------------------------------------------
-- 17. ATOMIC DISTRIBUTED CHECKOUT CLAIM & CONCURRENCY LOCK
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_checkout_session_creation(
  p_order_id UUID,
  p_claim_id TEXT,
  p_timeout_seconds INT DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.wallet_topup_orders%ROWTYPE;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
  v_in_progress BOOLEAN := false;
  v_claimed_at TIMESTAMPTZ;
  v_claimed_by TEXT;
  v_current_attempt INT := 0;
  v_new_attempt INT := 1;
  v_timeout_seconds INT := GREATEST(5, LEAST(120, COALESCE(p_timeout_seconds, 30)));
  v_session_id TEXT;
  v_checkout_url TEXT;
  v_expires_at TIMESTAMPTZ;
  v_is_cancelled BOOLEAN := false;
BEGIN
  -- 1. Lock the top-up order exclusively
  SELECT * INTO v_order
  FROM public.wallet_topup_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'claimed', false,
      'error', 'order_not_found',
      'message', 'Top-up order not found'
    );
  END IF;

  -- 2. Verify status is PENDING
  IF v_order.status != 'PENDING' THEN
    RETURN jsonb_build_object(
      'success', false,
      'claimed', false,
      'error', 'order_not_pending',
      'status', v_order.status,
      'message', 'Cannot checkout order in status ' || v_order.status
    );
  END IF;

  -- 3. Check if there is already an active, valid session on this order
  v_session_id := COALESCE(v_order.metadata->>'stripe_session_id', v_order.metadata->>'sessionId');
  v_checkout_url := v_order.metadata->>'checkout_url';
  v_expires_at := NULLIF(v_order.metadata->>'checkout_expires_at', '')::TIMESTAMPTZ;
  IF v_expires_at IS NULL THEN
    v_expires_at := v_order.expired_at;
  END IF;

  v_is_cancelled := COALESCE((v_order.metadata->>'checkout_cancelled')::boolean, false)
                 OR COALESCE((v_order.metadata->>'session_status' = 'cancelled'), false)
                 OR (v_order.metadata->>'cancelled_at' IS NOT NULL);

  IF v_session_id IS NOT NULL AND v_session_id != '' AND NOT v_is_cancelled THEN
    IF v_expires_at IS NULL OR v_expires_at > v_now THEN
      RETURN jsonb_build_object(
        'success', true,
        'claimed', false,
        'already_has_session', true,
        'session_id', v_session_id,
        'checkout_url', v_checkout_url,
        'expires_at', v_expires_at,
        'order', to_jsonb(v_order),
        'message', 'Active checkout session already exists on order'
      );
    END IF;
  END IF;

  -- 4. Check if another worker currently holds an active, unexpired claim
  v_in_progress := COALESCE((v_order.metadata->>'checkout_in_progress')::boolean, false);
  v_claimed_at := NULLIF(v_order.metadata->>'checkout_claimed_at', '')::TIMESTAMPTZ;
  v_claimed_by := v_order.metadata->>'checkout_claim_id';
  v_current_attempt := COALESCE((v_order.metadata->>'checkout_attempt')::int, 0);

  IF v_in_progress AND v_claimed_at IS NOT NULL AND (v_now - v_claimed_at) < (v_timeout_seconds || ' seconds')::interval THEN
    IF v_claimed_by = p_claim_id THEN
      RETURN jsonb_build_object(
        'success', true,
        'claimed', true,
        'attempt', v_current_attempt,
        'claim_id', p_claim_id,
        'order', to_jsonb(v_order),
        'message', 'Existing claim re-acquired by same caller'
      );
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'claimed', false,
      'in_progress', true,
      'wait_required', true,
      'attempt', v_current_attempt,
      'claimed_at', v_claimed_at,
      'order', to_jsonb(v_order),
      'message', 'Checkout session creation in progress by another worker'
    );
  END IF;

  -- 5. No active claim or previous claim timed out. THIS REQUEST WINS THE CLAIM!
  v_new_attempt := v_current_attempt + 1;

  UPDATE public.wallet_topup_orders
  SET
    metadata = v_order.metadata || jsonb_build_object(
      'checkout_in_progress', true,
      'checkout_claim_id', p_claim_id,
      'checkout_claimed_at', v_now,
      'checkout_attempt', v_new_attempt
    ),
    updated_at = v_now
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  RETURN jsonb_build_object(
    'success', true,
    'claimed', true,
    'in_progress', true,
    'wait_required', false,
    'attempt', v_new_attempt,
    'claim_id', p_claim_id,
    'order', to_jsonb(v_order),
    'message', 'Checkout creation claim acquired'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.release_checkout_session_claim(
  p_order_id UUID,
  p_claim_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.wallet_topup_orders%ROWTYPE;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
  v_claimed_by TEXT;
BEGIN
  SELECT * INTO v_order
  FROM public.wallet_topup_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'order_not_found');
  END IF;

  v_claimed_by := v_order.metadata->>'checkout_claim_id';

  IF p_claim_id IS NULL OR v_claimed_by = p_claim_id THEN
    UPDATE public.wallet_topup_orders
    SET
      metadata = v_order.metadata || jsonb_build_object(
        'checkout_in_progress', false,
        'checkout_claim_id', null
      ),
      updated_at = v_now
    WHERE id = p_order_id
    RETURNING * INTO v_order;

    RETURN jsonb_build_object('success', true, 'released', true, 'order', to_jsonb(v_order));
  END IF;

  RETURN jsonb_build_object('success', true, 'released', false, 'message', 'Claim held by different worker');
END;
$$;

REVOKE ALL ON FUNCTION public.claim_checkout_session_creation(UUID, TEXT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_checkout_session_creation(UUID, TEXT, INT) FROM anon;
REVOKE ALL ON FUNCTION public.claim_checkout_session_creation(UUID, TEXT, INT) FROM authenticated;

REVOKE ALL ON FUNCTION public.release_checkout_session_claim(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_checkout_session_claim(UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.release_checkout_session_claim(UUID, TEXT) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.claim_checkout_session_creation(UUID, TEXT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_checkout_session_creation(UUID, TEXT, INT) TO postgres;

GRANT EXECUTE ON FUNCTION public.release_checkout_session_claim(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_checkout_session_claim(UUID, TEXT) TO postgres;

-- ----------------------------------------------------
-- ATOMIC SHOWCASE REWARD CREDIT GRANT (ONE PER ORG)
-- ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.grant_showcase_credit_atomic(
  p_organization_id UUID,
  p_event_id UUID DEFAULT NULL,
  p_created_by UUID DEFAULT NULL,
  p_reference_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_wallet public.organization_wallets%ROWTYPE;
  v_existing_credit public.wallet_transactions%ROWTYPE;
  v_new_txn public.wallet_transactions%ROWTYPE;
  v_reference_id TEXT;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
  v_credit_amount NUMERIC := 300.00;
  v_paid NUMERIC;
  v_welcome NUMERIC;
  v_showcase NUMERIC;
  v_topup NUMERIC;
  v_outstanding NUMERIC;
BEGIN
  -- 1. Input Validation
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'Organization ID is required';
  END IF;

  -- 2. Ensure organization wallet exists
  INSERT INTO public.organization_wallets (
    organization_id,
    paid_balance,
    welcome_credit,
    showcase_credit,
    topup_credit,
    outstanding_balance,
    created_at,
    updated_at
  ) VALUES (
    p_organization_id,
    0.00,
    0.00,
    0.00,
    0.00,
    0.00,
    v_now,
    v_now
  )
  ON CONFLICT (organization_id) DO NOTHING;

  -- 3. Lock organization wallet row with FOR UPDATE to serialize concurrent requests
  SELECT * INTO v_wallet
  FROM public.organization_wallets
  WHERE organization_id = p_organization_id
  FOR UPDATE;

  -- 4. Inside the serialized critical section, check if a completed SHOWCASE_CREDIT already exists
  SELECT * INTO v_existing_credit
  FROM public.wallet_transactions
  WHERE organization_id = p_organization_id
    AND transaction_type = 'SHOWCASE_CREDIT'
    AND status = 'COMPLETED'
  LIMIT 1;

  IF FOUND THEN
    v_paid := COALESCE(v_wallet.paid_balance, 0.00);
    v_welcome := COALESCE(v_wallet.welcome_credit, 0.00);
    v_showcase := COALESCE(v_wallet.showcase_credit, 0.00);
    v_topup := COALESCE(v_wallet.topup_credit, 0.00);
    v_outstanding := COALESCE(v_wallet.outstanding_balance, 0.00);

    RETURN jsonb_build_object(
      'success', true,
      'already_granted', true,
      'transaction', to_jsonb(v_existing_credit),
      'wallet', jsonb_build_object(
        'organization_id', p_organization_id,
        'paid_balance', v_paid,
        'welcome_credit', v_welcome,
        'showcase_credit', v_showcase,
        'topup_credit', v_topup,
        'outstanding_balance', v_outstanding,
        'total_balance', v_paid + v_welcome + v_showcase + v_topup
      ),
      'message', 'Showcase Credit has already been granted to this organization (one-time reward).'
    );
  END IF;

  -- 5. Insert new ledger transaction
  v_reference_id := COALESCE(p_reference_id, 'showcase_' || p_organization_id::text);

  INSERT INTO public.wallet_transactions (
    id,
    organization_id,
    event_id,
    transaction_type,
    balance_type,
    amount,
    currency,
    status,
    reference_id,
    description,
    metadata,
    created_by,
    created_at
  ) VALUES (
    gen_random_uuid(),
    p_organization_id,
    p_event_id,
    'SHOWCASE_CREDIT',
    'SHOWCASE_CREDIT',
    v_credit_amount,
    'MYR',
    'COMPLETED',
    v_reference_id,
    'One-time Event Showcase completion reward credit of RM' || to_char(v_credit_amount, 'FM999,990.00'),
    p_metadata || jsonb_build_object(
      'program', 'EVENT_SHOWCASE_APPROVED_REWARD',
      'event_id', p_event_id
    ),
    p_created_by,
    v_now
  )
  RETURNING * INTO v_new_txn;

  -- 6. Update locked organization wallet balance
  UPDATE public.organization_wallets
  SET showcase_credit = COALESCE(showcase_credit, 0.00) + v_credit_amount,
      updated_at = v_now
  WHERE organization_id = p_organization_id
  RETURNING * INTO v_wallet;

  v_paid := COALESCE(v_wallet.paid_balance, 0.00);
  v_welcome := COALESCE(v_wallet.welcome_credit, 0.00);
  v_showcase := COALESCE(v_wallet.showcase_credit, 0.00);
  v_topup := COALESCE(v_wallet.topup_credit, 0.00);
  v_outstanding := COALESCE(v_wallet.outstanding_balance, 0.00);

  RETURN jsonb_build_object(
    'success', true,
    'already_granted', false,
    'transaction', to_jsonb(v_new_txn),
    'wallet', jsonb_build_object(
      'organization_id', p_organization_id,
      'paid_balance', v_paid,
      'welcome_credit', v_welcome,
      'showcase_credit', v_showcase,
      'topup_credit', v_topup,
      'outstanding_balance', v_outstanding,
      'total_balance', v_paid + v_welcome + v_showcase + v_topup
    ),
    'message', 'Successfully granted RM' || to_char(v_credit_amount, 'FM999,990.00') || ' Showcase Reward Credit!'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.grant_showcase_credit_atomic(UUID, UUID, UUID, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.grant_showcase_credit_atomic(UUID, UUID, UUID, TEXT, JSONB) TO postgres;
REVOKE EXECUTE ON FUNCTION public.grant_showcase_credit_atomic(UUID, UUID, UUID, TEXT, JSONB) FROM authenticated, anon, public;

-- ==============================================================================
-- ATOMIC WELCOME CREDIT GRANT (OWNER-ONLY, USER-LEVEL, ONE-TIME LIFETIME LIMIT)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.grant_welcome_credit_atomic(
  p_org_id UUID,
  p_user_id UUID,
  p_reviewer_id UUID DEFAULT NULL,
  p_reference_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
  v_org public.organizations%ROWTYPE;
  v_wallet public.organization_wallets%ROWTYPE;
  v_welcome_amount NUMERIC(12, 2) := 800.00;
  v_user_reward public.user_rewards%ROWTYPE;
  v_new_txn public.wallet_transactions%ROWTYPE;
  v_ref_id TEXT;
BEGIN
  -- 1. Input Validation
  IF p_org_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'VALIDATION_ERROR',
      'error', 'Organization ID is required',
      'message', 'Organization ID is required'
    );
  END IF;

  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'VALIDATION_ERROR',
      'error', 'User ID is required',
      'message', 'User ID is required'
    );
  END IF;

  -- 2. Verify Organization Exists & Check Authoritative Ownership
  SELECT * INTO v_org
  FROM public.organizations
  WHERE id = p_org_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'ORGANIZATION_NOT_FOUND',
      'error', 'Organization not found',
      'message', 'Organization not found'
    );
  END IF;

  -- Strictly verify that the user is the OWNER of this organization
  IF v_org.owner_id IS DISTINCT FROM p_user_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'NOT_AN_OWNER',
      'not_eligible', true,
      'already_granted', false,
      'error', 'Welcome Credit can only be granted to the organization OWNER. Organization members are not eligible.',
      'message', 'Welcome Credit can only be granted to the organization OWNER. Organization members are not eligible.'
    );
  END IF;

  -- 3. Lock Organization Wallet to guarantee serial execution
  SELECT * INTO v_wallet
  FROM public.organization_wallets
  WHERE organization_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.organization_wallets (
      id,
      organization_id,
      balance,
      welcome_credit,
      welcome_credit_granted,
      topup_bonus_credit,
      showcase_credit,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid(),
      p_org_id,
      0.00,
      0.00,
      false,
      0.00,
      0.00,
      v_now,
      v_now
    )
    RETURNING * INTO v_wallet;
  END IF;

  -- 4. Check if User Has EVER Claimed Welcome Credit in Account Lifetime
  -- Check user_rewards table first
  SELECT * INTO v_user_reward
  FROM public.user_rewards
  WHERE user_id = p_user_id
    AND reward_type = 'WELCOME_CREDIT'
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_granted', true,
      'wallet', row_to_json(v_wallet),
      'message', 'Welcome Credit has already been granted to this user in their account lifetime (one-time lifetime limit).'
    );
  END IF;

  -- Check wallet_transactions ledger fallback for this owner_user_id
  SELECT * INTO v_new_txn
  FROM public.wallet_transactions
  WHERE owner_user_id = p_user_id
    AND transaction_type = 'WELCOME_CREDIT'
    AND status = 'COMPLETED'
  LIMIT 1;

  IF FOUND THEN
    -- Backfill user_rewards so future checks are fast
    INSERT INTO public.user_rewards (
      id,
      user_id,
      reward_type,
      organization_id,
      transaction_id,
      amount,
      created_at
    ) VALUES (
      gen_random_uuid(),
      p_user_id,
      'WELCOME_CREDIT',
      p_org_id,
      v_new_txn.id,
      v_welcome_amount,
      v_now
    )
    ON CONFLICT (user_id, reward_type) DO NOTHING;

    RETURN jsonb_build_object(
      'success', true,
      'already_granted', true,
      'wallet', row_to_json(v_wallet),
      'message', 'Welcome Credit has already been granted to this user in their account lifetime (one-time lifetime limit).'
    );
  END IF;

  -- Check any existing organization owned by this user that has welcome_credit_granted
  IF EXISTS (
    SELECT 1 FROM public.organizations o
    JOIN public.organization_wallets w ON w.organization_id = o.id
    WHERE o.owner_id = p_user_id
      AND (w.welcome_credit_granted = true OR w.welcome_credit > 0)
  ) THEN
    -- Backfill user_rewards record
    INSERT INTO public.user_rewards (
      id,
      user_id,
      reward_type,
      organization_id,
      transaction_id,
      amount,
      created_at
    ) VALUES (
      gen_random_uuid(),
      p_user_id,
      'WELCOME_CREDIT',
      p_org_id,
      NULL,
      v_welcome_amount,
      v_now
    )
    ON CONFLICT (user_id, reward_type) DO NOTHING;

    RETURN jsonb_build_object(
      'success', true,
      'already_granted', true,
      'wallet', row_to_json(v_wallet),
      'message', 'Welcome Credit has already been granted to this user in their account lifetime (one-time lifetime limit).'
    );
  END IF;

  -- 5. Atomic Insert into user_rewards (Strict Unique Constraint Lock)
  BEGIN
    INSERT INTO public.user_rewards (
      id,
      user_id,
      reward_type,
      organization_id,
      transaction_id,
      amount,
      created_at
    ) VALUES (
      gen_random_uuid(),
      p_user_id,
      'WELCOME_CREDIT',
      p_org_id,
      NULL,
      v_welcome_amount,
      v_now
    )
    RETURNING * INTO v_user_reward;
  EXCEPTION WHEN unique_violation THEN
    -- Race condition caught: another concurrent process just inserted this reward
    RETURN jsonb_build_object(
      'success', true,
      'already_granted', true,
      'wallet', row_to_json(v_wallet),
      'message', 'Welcome Credit has already been granted to this user in their account lifetime (one-time lifetime limit).'
    );
  END IF;

  -- 6. Insert into Immutable Wallet Transactions Ledger
  v_ref_id := COALESCE(p_reference_id, 'welcome_' || p_org_id::text);

  INSERT INTO public.wallet_transactions (
    id,
    organization_id,
    owner_user_id,
    event_id,
    transaction_type,
    balance_type,
    amount,
    status,
    reference_id,
    created_by,
    metadata,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    p_org_id,
    p_user_id,
    NULL,
    'WELCOME_CREDIT',
    'WELCOME_CREDIT',
    v_welcome_amount,
    'COMPLETED',
    v_ref_id,
    COALESCE(p_reviewer_id, p_user_id),
    p_metadata || jsonb_build_object(
      'owner_user_id', p_user_id,
      'program', 'ORGANIZATION_ONBOARDING_WELCOME',
      'credited_at', v_now
    ),
    v_now,
    v_now
  )
  RETURNING * INTO v_new_txn;

  -- Link transaction_id in user_rewards
  UPDATE public.user_rewards
  SET transaction_id = v_new_txn.id
  WHERE id = v_user_reward.id;

  -- 7. Credit Organization Wallet
  UPDATE public.organization_wallets
  SET
    welcome_credit = COALESCE(welcome_credit, 0.00) + v_welcome_amount,
    welcome_credit_granted = true,
    updated_at = v_now
  WHERE organization_id = p_org_id
  RETURNING * INTO v_wallet;

  RETURN jsonb_build_object(
    'success', true,
    'already_granted', false,
    'transaction', row_to_json(v_new_txn),
    'wallet', row_to_json(v_wallet),
    'user_reward', row_to_json(v_user_reward)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.grant_welcome_credit_atomic(UUID, UUID, UUID, TEXT, JSONB) TO service_role, postgres;
REVOKE EXECUTE ON FUNCTION public.grant_welcome_credit_atomic(UUID, UUID, UUID, TEXT, JSONB) FROM authenticated, anon, public;

-- ==============================================================================
-- ATOMIC FIRST-EVENT SHOWCASE REWARD APPROVAL (OWNER-LEVEL ONE-TIME REWARD)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.approve_first_event_showcase_reward_atomic(
  p_showcase_id UUID,
  p_reviewer_id UUID DEFAULT NULL,
  p_reference_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_showcase public.event_showcases%ROWTYPE;
  v_event public.events%ROWTYPE;
  v_org public.organizations%ROWTYPE;
  v_wallet public.organization_wallets%ROWTYPE;
  v_owner_reward public.owner_showcase_rewards%ROWTYPE;
  v_user_reward public.user_rewards%ROWTYPE;
  v_existing_credit public.wallet_transactions%ROWTYPE;
  v_new_txn public.wallet_transactions%ROWTYPE;
  v_owner_id UUID;
  v_reference_id TEXT;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
  v_credit_amount NUMERIC := 300.00;
  v_paid NUMERIC;
  v_welcome NUMERIC;
  v_showcase_credit NUMERIC;
  v_topup NUMERIC;
  v_outstanding NUMERIC;
BEGIN
  -- 1. Input Validation
  IF p_showcase_id IS NULL THEN
    RAISE EXCEPTION 'Showcase ID is required';
  END IF;

  -- 2. Lock & fetch Showcase Record
  SELECT * INTO v_showcase
  FROM public.event_showcases
  WHERE id = p_showcase_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Showcase not found: %', p_showcase_id;
  END IF;

  IF v_showcase.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Showcase has been deleted and cannot be rewarded';
  END IF;

  IF v_showcase.status = 'BLOCKED' THEN
    RAISE EXCEPTION 'Showcase is blocked and cannot receive rewards';
  END IF;

  -- 3. Resolve Organization & Owner ID
  SELECT * INTO v_org
  FROM public.organizations
  WHERE id = v_showcase.organization_id;

  v_owner_id := v_org.owner_id;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Organization owner could not be resolved for showcase %', p_showcase_id;
  END IF;

  -- Serialize multi-showcase/multi-org reward grants per user via explicit user row lock
  PERFORM 1 FROM public.users WHERE id = v_owner_id FOR UPDATE;

  -- 4. Idempotency Check: If this exact showcase is already rewarded, return current state safely
  IF (v_showcase.reward_review_status = 'REWARDED' OR v_showcase.reward_status = 'REWARDED') THEN
    SELECT * INTO v_existing_credit
    FROM public.wallet_transactions
    WHERE id = v_showcase.reward_transaction_id
       OR (owner_user_id = v_owner_id AND transaction_type = 'SHOWCASE_CREDIT' AND status = 'COMPLETED')
    ORDER BY created_at DESC
    LIMIT 1;

    SELECT * INTO v_wallet
    FROM public.organization_wallets
    WHERE organization_id = v_showcase.organization_id;

    RETURN jsonb_build_object(
      'success', true,
      'already_rewarded', true,
      'showcase', to_jsonb(v_showcase),
      'transaction', to_jsonb(v_existing_credit),
      'wallet', jsonb_build_object(
        'organization_id', v_showcase.organization_id,
        'paid_balance', COALESCE(v_wallet.paid_balance, 0.00),
        'welcome_credit', COALESCE(v_wallet.welcome_credit, 0.00),
        'showcase_credit', COALESCE(v_wallet.showcase_credit, 0.00),
        'showcase_credit_granted', COALESCE(v_wallet.showcase_credit_granted, true),
        'topup_credit', COALESCE(v_wallet.topup_credit, 0.00),
        'outstanding_balance', COALESCE(v_wallet.outstanding_balance, 0.00),
        'total_balance', COALESCE(v_wallet.paid_balance, 0.00) + COALESCE(v_wallet.welcome_credit, 0.00) + COALESCE(v_wallet.showcase_credit, 0.00) + COALESCE(v_wallet.topup_credit, 0.00)
      ),
      'message', 'Showcase has already been approved and rewarded.'
    );
  END IF;

  -- 5. Primary Authoritative Lifetime Invariant Check against user_rewards:
  -- Verify if owner_user_id has ALREADY received a lifetime showcase reward in ANY organization
  SELECT * INTO v_user_reward
  FROM public.user_rewards
  WHERE user_id = v_owner_id AND reward_type IN ('SHOWCASE_CREDIT', 'SHOWCASE_REWARD');

  IF FOUND THEN
    RAISE EXCEPTION 'First-event reward invariant violation: Owner has already received a lifetime showcase reward credit.';
  END IF;

  SELECT * INTO v_existing_credit
  FROM public.wallet_transactions
  WHERE owner_user_id = v_owner_id
    AND transaction_type = 'SHOWCASE_CREDIT'
    AND status = 'COMPLETED'
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'First-event reward invariant violation: Owner has already received a lifetime showcase reward credit.';
  END IF;

  -- 6. Lock Organization Wallet Row with FOR UPDATE
  INSERT INTO public.organization_wallets (
    organization_id,
    paid_balance,
    welcome_credit,
    showcase_credit,
    showcase_credit_granted,
    topup_credit,
    outstanding_balance,
    created_at,
    updated_at
  ) VALUES (
    v_showcase.organization_id,
    0.00,
    0.00,
    0.00,
    false,
    0.00,
    0.00,
    v_now,
    v_now
  )
  ON CONFLICT (organization_id) DO NOTHING;

  SELECT * INTO v_wallet
  FROM public.organization_wallets
  WHERE organization_id = v_showcase.organization_id
  FOR UPDATE;

  -- 7. Verify Showcase Status & Eligibility:
  IF (v_showcase.status <> 'PUBLISHED' AND COALESCE(v_showcase.publication_status, '') <> 'PUBLISHED') THEN
    RAISE EXCEPTION 'Showcase must be published before reward approval';
  END IF;

  -- 8. Verify Event is Paid and Concluded/Active
  SELECT * INTO v_event
  FROM public.events
  WHERE id = v_showcase.event_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event associated with showcase not found';
  END IF;

  IF v_event.payment_status <> 'PAID' THEN
    RAISE EXCEPTION 'Associated event must have payment_status = PAID';
  END IF;

  -- 9. Atomically reserve in public.user_rewards
  INSERT INTO public.user_rewards (
    id,
    user_id,
    reward_type,
    organization_id,
    amount,
    created_at
  ) VALUES (
    gen_random_uuid(),
    v_owner_id,
    'SHOWCASE_CREDIT',
    v_showcase.organization_id,
    v_credit_amount,
    v_now
  )
  ON CONFLICT (user_id, reward_type) DO NOTHING
  RETURNING * INTO v_user_reward;

  IF v_user_reward.id IS NULL THEN
    RAISE EXCEPTION 'First-event reward invariant violation: Owner has already received a lifetime showcase reward credit.';
  END IF;

  -- 10. Insert Immutable Wallet Ledger Transaction
  v_reference_id := COALESCE(p_reference_id, 'showcase_' || v_showcase.id::text);

  INSERT INTO public.wallet_transactions (
    id,
    organization_id,
    owner_user_id,
    event_id,
    transaction_type,
    balance_type,
    amount,
    status,
    description,
    reference_id,
    created_by,
    metadata,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    v_showcase.organization_id,
    v_owner_id,
    v_showcase.event_id,
    'SHOWCASE_CREDIT',
    'SHOWCASE_CREDIT',
    v_credit_amount,
    'COMPLETED',
    'One-time Event Showcase completion reward credit',
    v_reference_id,
    p_reviewer_id,
    p_metadata || jsonb_build_object(
      'showcase_id', v_showcase.id,
      'owner_user_id', v_owner_id,
      'grant_type', 'OWNER_FIRST_SHOWCASE_REWARD',
      'credited_at', v_now
    ),
    v_now,
    v_now
  )
  RETURNING * INTO v_new_txn;

  -- Update user_rewards with transaction_id
  UPDATE public.user_rewards
  SET transaction_id = v_new_txn.id
  WHERE id = v_user_reward.id;

  -- 11. Record in owner_showcase_rewards table
  INSERT INTO public.owner_showcase_rewards (
    owner_user_id,
    organization_id,
    event_id,
    showcase_id,
    transaction_id,
    amount,
    rewarded_at,
    created_at
  ) VALUES (
    v_owner_id,
    v_showcase.organization_id,
    v_showcase.event_id,
    v_showcase.id,
    v_new_txn.id,
    v_credit_amount,
    v_now,
    v_now
  )
  ON CONFLICT (owner_user_id) DO UPDATE SET
    transaction_id = EXCLUDED.transaction_id,
    rewarded_at = EXCLUDED.rewarded_at;

  -- 12. Credit Organization Wallet Balance
  UPDATE public.organization_wallets
  SET
    showcase_credit = COALESCE(showcase_credit, 0.00) + v_credit_amount,
    showcase_credit_granted = true,
    updated_at = v_now
  WHERE organization_id = v_showcase.organization_id
  RETURNING * INTO v_wallet;

  -- 13. Update Event Showcase Reward Status
  UPDATE public.event_showcases
  SET
    owner_user_id = v_owner_id,
    reward_review_status = 'REWARDED',
    reward_status = 'REWARDED',
    reward_reviewed_by = p_reviewer_id,
    reward_reviewed_at = v_now,
    reward_rejection_reason = NULL,
    reward_transaction_id = v_new_txn.id,
    reward_granted_at = v_now,
    updated_at = v_now
  WHERE id = v_showcase.id
  RETURNING * INTO v_showcase;

  -- 14. Audit Log
  INSERT INTO public.showcase_moderation_logs (
    id,
    showcase_id,
    moderator_id,
    action,
    reason,
    metadata,
    created_at
  ) VALUES (
    gen_random_uuid(),
    v_showcase.id,
    COALESCE(p_reviewer_id, '00000000-0000-0000-0000-000000000000'::uuid),
    'APPROVE_REWARD',
    'Owner first-event showcase RM300 reward approved',
    jsonb_build_object(
      'owner_user_id', v_owner_id,
      'amount', v_credit_amount,
      'transaction_id', v_new_txn.id,
      'organization_id', v_showcase.organization_id
    ),
    v_now
  );

  v_paid := COALESCE(v_wallet.paid_balance, 0.00);
  v_welcome := COALESCE(v_wallet.welcome_credit, 0.00);
  v_showcase_credit := COALESCE(v_wallet.showcase_credit, 0.00);
  v_topup := COALESCE(v_wallet.topup_credit, 0.00);
  v_outstanding := COALESCE(v_wallet.outstanding_balance, 0.00);

  RETURN jsonb_build_object(
    'success', true,
    'already_rewarded', false,
    'showcase', to_jsonb(v_showcase),
    'transaction', to_jsonb(v_new_txn),
    'wallet', jsonb_build_object(
      'organization_id', v_showcase.organization_id,
      'paid_balance', v_paid,
      'welcome_credit', v_welcome,
      'showcase_credit', v_showcase_credit,
      'showcase_credit_granted', true,
      'topup_credit', v_topup,
      'outstanding_balance', v_outstanding,
      'total_balance', v_paid + v_welcome + v_showcase_credit + v_topup
    ),
    'message', 'Owner first-event showcase RM300 reward successfully granted!'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_first_event_showcase_reward_atomic(UUID, UUID, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.approve_first_event_showcase_reward_atomic(UUID, UUID, TEXT, JSONB) TO postgres;
REVOKE EXECUTE ON FUNCTION public.approve_first_event_showcase_reward_atomic(UUID, UUID, TEXT, JSONB) FROM authenticated, anon, public;

-- ------------------------------------------------------------------------------
-- ATOMIC DISTRIBUTED EVENT CREATION RPC WITH EXCLUSIVE ORGANIZATION LOCK
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_event_atomic(
  p_organization_id UUID,
  p_game_theme_id UUID,
  p_name TEXT,
  p_start_date TEXT,
  p_end_date TEXT,
  p_starts_at TIMESTAMPTZ,
  p_expires_at TIMESTAMPTZ,
  p_game_id UUID DEFAULT NULL,
  p_event_date TEXT DEFAULT NULL,
  p_status TEXT DEFAULT 'draft',
  p_event_status TEXT DEFAULT 'DRAFT',
  p_payment_status TEXT DEFAULT 'UNPAID',
  p_cancel_reason TEXT DEFAULT NULL,
  p_event_price NUMERIC DEFAULT NULL,
  p_event_currency TEXT DEFAULT NULL,
  p_paid_amount NUMERIC DEFAULT 0.00,
  p_discount_amount NUMERIC DEFAULT 0.00,
  p_payment_mode TEXT DEFAULT NULL,
  p_public_token TEXT DEFAULT NULL,
  p_created_by UUID DEFAULT NULL,
  p_event_id UUID DEFAULT NULL,
  p_max_pending_events INT DEFAULT 2,
  p_skip_pending_limit_check BOOLEAN DEFAULT FALSE,
  p_event_timezone TEXT DEFAULT NULL,
  p_pricing_id UUID DEFAULT NULL,
  p_duration_days INT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_org public.organizations%ROWTYPE;
  v_theme public.game_themes%ROWTYPE;
  v_game public.games%ROWTYPE;
  v_event public.events%ROWTYPE;
  v_pending_count INT := 0;
  v_is_pending BOOLEAN := false;
  v_target_game_id UUID;
  v_token TEXT;
  v_event_id UUID;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
  v_token_attempts INT := 0;
  v_max_limit INT := COALESCE(p_max_pending_events, 2);
  v_event_timezone TEXT := p_event_timezone;
  v_pricing_id UUID := p_pricing_id;
  v_duration_days INT := p_duration_days;
  v_resolved_price NUMERIC(10,2) := p_event_price;
  v_resolved_currency TEXT := NULLIF(TRIM(p_event_currency), '');
  v_pricing_record RECORD;
BEGIN
  -- 1. Input validations
  IF p_organization_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'VALIDATION_ERROR',
      'error', 'Organization ID is required',
      'message', 'Organization ID is required'
    );
  END IF;

  IF p_game_theme_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'VALIDATION_ERROR',
      'error', 'Game Theme selection is required',
      'message', 'Game Theme selection is required'
    );
  END IF;

  IF p_name IS NULL OR TRIM(p_name) = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'VALIDATION_ERROR',
      'error', 'Event name is required',
      'message', 'Event name is required'
    );
  END IF;

  IF p_starts_at IS NULL OR p_expires_at IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'VALIDATION_ERROR',
      'error', 'Event starts_at and expires_at timestamps are required',
      'message', 'Event starts_at and expires_at timestamps are required'
    );
  END IF;

  -- 2. Concurrency Control: Exclusive row-level lock on the target organization.
  -- This serializes all event creations for this tenant across distributed Cloudflare Worker instances.
  SELECT * INTO v_org
  FROM public.organizations
  WHERE id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'ORGANIZATION_NOT_FOUND',
      'error', 'Organization not found',
      'message', 'Organization not found'
    );
  END IF;

  -- Resolve event timezone:
  -- explicit parameter -> organization country default -> 'Asia/Singapore' fallback
  IF v_event_timezone IS NULL OR TRIM(v_event_timezone) = '' THEN
    v_event_timezone := CASE UPPER(COALESCE(v_org.country_code, 'SG'))
      WHEN 'MY' THEN 'Asia/Kuala_Lumpur'
      WHEN 'TH' THEN 'Asia/Bangkok'
      WHEN 'ID' THEN 'Asia/Jakarta'
      WHEN 'PH' THEN 'Asia/Manila'
      WHEN 'VN' THEN 'Asia/Ho_Chi_Minh'
      WHEN 'JP' THEN 'Asia/Tokyo'
      WHEN 'KR' THEN 'Asia/Seoul'
      WHEN 'TW' THEN 'Asia/Taipei'
      WHEN 'HK' THEN 'Asia/Hong_Kong'
      WHEN 'AU' THEN 'Australia/Sydney'
      WHEN 'NZ' THEN 'Pacific/Auckland'
      WHEN 'IN' THEN 'Asia/Kolkata'
      WHEN 'US' THEN 'America/New_York'
      WHEN 'GB' THEN 'Europe/London'
      WHEN 'CA' THEN 'America/Toronto'
      WHEN 'DE' THEN 'Europe/Berlin'
      WHEN 'FR' THEN 'Europe/Paris'
      WHEN 'NL' THEN 'Europe/Amsterdam'
      WHEN 'CH' THEN 'Europe/Zurich'
      WHEN 'AE' THEN 'Asia/Dubai'
      WHEN 'SA' THEN 'Asia/Riyadh'
      WHEN 'BR' THEN 'America/Sao_Paulo'
      WHEN 'MX' THEN 'America/Mexico_City'
      WHEN 'ZA' THEN 'Africa/Johannesburg'
      WHEN 'ES' THEN 'Europe/Madrid'
      WHEN 'IT' THEN 'Europe/Rome'
      WHEN 'SE' THEN 'Europe/Stockholm'
      WHEN 'NO' THEN 'Europe/Oslo'
      WHEN 'IE' THEN 'Europe/Dublin'
      ELSE 'Asia/Singapore'
    END;
  END IF;

  -- 3. Theme & Game Isolation & Permissions Validation
  SELECT * INTO v_theme
  FROM public.game_themes
  WHERE id = p_game_theme_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'THEME_NOT_FOUND',
      'error', 'Selected Game Theme not found',
      'message', 'Selected Game Theme not found'
    );
  END IF;

  IF v_theme.is_system = true OR v_theme.ownership_type = 'system' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'SYSTEM_THEME_NOT_ALLOWED',
      'error', 'Only organization themes can be used for events.',
      'message', 'Only organization themes can be used for events.'
    );
  END IF;

  IF v_theme.organization_id <> p_organization_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'THEME_FORBIDDEN',
      'error', 'Only organization themes can be used for events.',
      'message', 'Only organization themes can be used for events.'
    );
  END IF;

  IF v_theme.status IS NOT NULL AND v_theme.status <> 'active' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'THEME_INACTIVE',
      'error', 'The selected theme is not active.',
      'message', 'The selected theme is not active.'
    );
  END IF;

  v_target_game_id := COALESCE(p_game_id, v_theme.game_id);
  IF v_target_game_id IS NOT NULL THEN
    SELECT * INTO v_game
    FROM public.games
    WHERE id = v_target_game_id;

    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'GAME_NOT_FOUND',
        'error', 'The selected game was not found.',
        'message', 'The selected game was not found.'
      );
    END IF;

    IF v_game.status = 'inactive' THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'GAME_INACTIVE',
        'error', 'This game is currently inactive and cannot be selected for new events.',
        'message', 'This game is currently inactive and cannot be selected for new events.'
      );
    END IF;
  END IF;

  -- 4. Calculate duration_days if not provided
  IF v_duration_days IS NULL OR v_duration_days <= 0 THEN
    BEGIN
      v_duration_days := GREATEST(1, (p_end_date::date - p_start_date::date) + 1);
    EXCEPTION WHEN OTHERS THEN
      v_duration_days := 1;
    END;
  END IF;

  -- Authoritative Pricing Tier Validation & Resolution
  IF v_pricing_id IS NOT NULL THEN
    -- Look up the specified pricing tier directly
    SELECT id, game_id, price, currency, is_active, min_days, max_days
    INTO v_pricing_record
    FROM public.game_pricing
    WHERE id = v_pricing_id;

    IF v_pricing_record.id IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'PRICING_TIER_NOT_FOUND',
        'error', 'The specified pricing tier does not exist.',
        'message', 'The specified pricing tier does not exist.'
      );
    END IF;

    -- Integrity Check 1: pricing.game_id = target_game_id (Reject cross-game pricing leakage)
    IF v_pricing_record.game_id <> v_target_game_id THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'PRICING_GAME_MISMATCH',
        'error', 'The specified pricing tier does not belong to the selected game.',
        'message', 'The specified pricing tier does not belong to the selected game.'
      );
    END IF;

    -- Integrity Check 2: pricing is active
    IF NOT COALESCE(v_pricing_record.is_active, false) THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'PRICING_TIER_INACTIVE',
        'error', 'The specified pricing tier is inactive and cannot be used.',
        'message', 'The specified pricing tier is inactive and cannot be used.'
      );
    END IF;

    -- Integrity Check 3: pricing covers duration_days
    IF v_duration_days < v_pricing_record.min_days OR (v_pricing_record.max_days IS NOT NULL AND v_duration_days > v_pricing_record.max_days) THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'PRICING_DURATION_MISMATCH',
        'error', 'The specified pricing tier does not cover this duration (' || v_duration_days || ' days).',
        'message', 'The specified pricing tier does not cover this duration (' || v_duration_days || ' days).'
      );
    END IF;

    -- Authoritative price and currency strictly derived from the verified tier
    v_resolved_price := v_pricing_record.price;
    v_resolved_currency := v_pricing_record.currency;
  ELSE
    -- Auto-resolve matching active pricing tier for the target game and duration
    SELECT id, game_id, price, currency, is_active, min_days, max_days
    INTO v_pricing_record
    FROM public.game_pricing
    WHERE game_id = v_target_game_id
      AND is_active = true
      AND min_days <= v_duration_days
      AND (max_days IS NULL OR max_days >= v_duration_days)
    ORDER BY min_days ASC
    LIMIT 1;

    IF v_pricing_record.id IS NOT NULL THEN
      v_pricing_id := v_pricing_record.id;
      v_resolved_price := v_pricing_record.price;
      v_resolved_currency := v_pricing_record.currency;
    ELSIF v_resolved_price IS NULL OR v_resolved_price <= 0 THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'NO_PRICING_TIER',
        'error', 'No pricing tier is configured for a ' || v_duration_days || '-day event for this game. Pricing cannot be resolved.',
        'message', 'No pricing tier is configured for a ' || v_duration_days || '-day event for this game. Pricing cannot be resolved.'
      );
    END IF;
  END IF;

  IF v_resolved_price IS NULL OR v_resolved_price <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'PRICING_CONFIGURATION_ERROR',
      'error', 'Event price must be positive and valid. Could not resolve pricing.',
      'message', 'Event price must be positive and valid. Could not resolve pricing.'
    );
  END IF;

  IF v_resolved_currency IS NULL OR TRIM(v_resolved_currency) = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'PRICING_CONFIGURATION_ERROR',
      'error', 'Event currency must be valid. Could not resolve pricing currency.',
      'message', 'Event currency must be valid. Could not resolve pricing currency.'
    );
  END IF;

  -- 5. Evaluate whether the new event being created counts as a pending-payment event
  v_is_pending := (
    UPPER(COALESCE(p_payment_status, 'UNPAID')) IN ('PENDING_PAYMENT', 'UNPAID')
    OR LOWER(COALESCE(p_status, 'draft')) = 'pending_payment'
  );

  -- 6. Atomic check of pending event limit under the organization lock
  IF v_is_pending AND NOT COALESCE(p_skip_pending_limit_check, false) THEN
    SELECT COUNT(*) INTO v_pending_count
    FROM public.events
    WHERE organization_id = p_organization_id
      AND status NOT IN ('cancelled', 'expired')
      AND event_status NOT IN ('CANCELLED', 'EXPIRED')
      AND (
        LOWER(status) = 'pending_payment'
        OR UPPER(payment_status) = 'PENDING_PAYMENT'
        OR UPPER(payment_status) = 'UNPAID'
      );

    IF v_pending_count >= v_max_limit THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'PENDING_EVENT_LIMIT_REACHED',
        'error', 'Maximum 2 pending payment events reached. Please pay for or delete an existing pending event.',
        'message', 'Maximum 2 pending payment events reached. Please pay for or delete an existing pending event.',
        'pending_count', v_pending_count,
        'max_limit', v_max_limit
      );
    END IF;
  END IF;

  -- 7. Generate collision-resistant unique public token
  v_token := p_public_token;
  IF v_token IS NULL OR TRIM(v_token) = '' THEN
    v_token := lower(encode(gen_random_bytes(6), 'hex'));
  END IF;

  WHILE EXISTS (SELECT 1 FROM public.events WHERE public_token = v_token) AND v_token_attempts < 10 LOOP
    v_token := lower(encode(gen_random_bytes(6), 'hex'));
    v_token_attempts := v_token_attempts + 1;
  END LOOP;

  v_event_id := COALESCE(p_event_id, gen_random_uuid());

  -- 8. Insert the event record atomically within the serialized transaction
  INSERT INTO public.events (
    id,
    organization_id,
    game_id,
    game_theme_id,
    name,
    event_date,
    start_date,
    end_date,
    starts_at,
    expires_at,
    status,
    event_status,
    payment_status,
    cancel_reason,
    event_price,
    event_currency,
    paid_amount,
    discount_amount,
    payment_mode,
    public_token,
    created_by,
    event_timezone,
    pricing_id,
    duration_days,
    created_at,
    updated_at
  ) VALUES (
    v_event_id,
    p_organization_id,
    v_target_game_id,
    p_game_theme_id,
    TRIM(p_name),
    COALESCE(p_event_date, p_start_date),
    p_start_date,
    p_end_date,
    p_starts_at,
    p_expires_at,
    COALESCE(p_status, 'draft'),
    COALESCE(p_event_status, 'DRAFT'),
    COALESCE(p_payment_status, 'UNPAID'),
    p_cancel_reason,
    v_resolved_price,
    v_resolved_currency,
    COALESCE(p_paid_amount, 0.00),
    COALESCE(p_discount_amount, 0.00),
    p_payment_mode,
    v_token,
    p_created_by,
    v_event_timezone,
    v_pricing_id,
    v_duration_days,
    v_now,
    v_now
  )
  RETURNING * INTO v_event;

  -- 9. Return successfully created event record
  RETURN jsonb_build_object(
    'success', true,
    'event', to_jsonb(v_event),
    'pending_count', v_pending_count + (CASE WHEN v_is_pending THEN 1 ELSE 0 END)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_event_atomic(UUID, UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, UUID, UUID, INT, BOOLEAN, TEXT, UUID, INT) TO service_role;
REVOKE EXECUTE ON FUNCTION public.create_event_atomic(UUID, UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, UUID, UUID, INT, BOOLEAN, TEXT, UUID, INT) FROM authenticated, anon, public;

-- ------------------------------------------------------------------------------
-- DATABASE-LEVEL TRIGGER FOR DISTRIBUTED PENDING LIMIT ENFORCEMENT
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_event_pending_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pending_count INT;
  v_is_pending BOOLEAN;
BEGIN
  v_is_pending := (
    UPPER(COALESCE(NEW.payment_status, 'UNPAID')) IN ('PENDING_PAYMENT', 'UNPAID')
    OR LOWER(COALESCE(NEW.status, 'draft')) = 'pending_payment'
  );

  IF v_is_pending AND LOWER(COALESCE(NEW.status, 'draft')) NOT IN ('cancelled', 'expired') AND UPPER(COALESCE(NEW.event_status, 'DRAFT')) NOT IN ('CANCELLED', 'EXPIRED') THEN
    PERFORM 1 FROM public.organizations WHERE id = NEW.organization_id FOR UPDATE;

    SELECT COUNT(*) INTO v_pending_count
    FROM public.events
    WHERE organization_id = NEW.organization_id
      AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND status NOT IN ('cancelled', 'expired')
      AND event_status NOT IN ('CANCELLED', 'EXPIRED')
      AND (
        LOWER(status) = 'pending_payment'
        OR UPPER(payment_status) = 'PENDING_PAYMENT'
        OR UPPER(payment_status) = 'UNPAID'
      );

    IF v_pending_count >= 2 THEN
      RAISE EXCEPTION 'PENDING_EVENT_LIMIT_REACHED: Maximum 2 pending payment events reached. Please pay for or delete an existing pending event.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_event_pending_limit ON public.events;
CREATE TRIGGER trg_check_event_pending_limit
  BEFORE INSERT OR UPDATE OF status, event_status, payment_status
  ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.check_event_pending_limit();

-- ------------------------------------------------------------------------------
-- DATABASE-LEVEL TRIGGER FOR PRICING INTEGRITY ENFORCEMENT
-- ------------------------------------------------------------------------------
-- Guarantees that any direct INSERT or UPDATE on public.events with a pricing_id
-- strictly matches the event's game_id, is active, and covers the duration_days.
CREATE OR REPLACE FUNCTION public.check_event_pricing_game_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_tier RECORD;
BEGIN
  IF NEW.pricing_id IS NOT NULL THEN
    SELECT id, game_id, is_active, min_days, max_days
    INTO v_tier
    FROM public.game_pricing
    WHERE id = NEW.pricing_id;

    IF v_tier.id IS NULL THEN
      RAISE EXCEPTION 'PRICING_TIER_NOT_FOUND: Pricing tier % does not exist', NEW.pricing_id
        USING ERRCODE = '23503';
    END IF;

    IF NEW.game_id IS NOT NULL AND v_tier.game_id <> NEW.game_id THEN
      RAISE EXCEPTION 'PRICING_GAME_MISMATCH: Pricing tier % belongs to game % but event belongs to game %',
        NEW.pricing_id, v_tier.game_id, NEW.game_id
        USING ERRCODE = '23514';
    END IF;

    IF v_tier.is_active = false THEN
      RAISE EXCEPTION 'PRICING_TIER_INACTIVE: Pricing tier % is inactive', NEW.pricing_id
        USING ERRCODE = '23514';
    END IF;

    IF NEW.duration_days IS NOT NULL AND NEW.duration_days > 0 THEN
      IF NEW.duration_days < v_tier.min_days OR (v_tier.max_days IS NOT NULL AND NEW.duration_days > v_tier.max_days) THEN
        RAISE EXCEPTION 'PRICING_DURATION_MISMATCH: Pricing tier % covers %-% days but event duration is % days',
          NEW.pricing_id, v_tier.min_days, COALESCE(v_tier.max_days::text, 'unlimited'), NEW.duration_days
          USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_event_pricing_game_integrity ON public.events;
CREATE TRIGGER trg_check_event_pricing_game_integrity
  BEFORE INSERT OR UPDATE OF pricing_id, game_id, duration_days ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.check_event_pricing_game_integrity();

-- ------------------------------------------------------------------------------
-- USER REWARDS TABLE & USER-LEVEL LIFETIME WELCOME CREDIT
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reward_type VARCHAR(50) NOT NULL, -- e.g. 'WELCOME_CREDIT'
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  transaction_id UUID,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 800.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT ux_user_rewards_user_reward UNIQUE (user_id, reward_type)
);

CREATE INDEX IF NOT EXISTS idx_user_rewards_user_type ON public.user_rewards (user_id, reward_type);

ALTER TABLE public.wallet_transactions ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL;
DROP INDEX IF EXISTS public.idx_wallet_txns_owner_user_id;
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_owner_user_id ON public.wallet_transactions (owner_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_wallet_txns_user_welcome_credit_unique 
  ON public.wallet_transactions (owner_user_id) 
  WHERE transaction_type = 'WELCOME_CREDIT' AND status = 'COMPLETED' AND owner_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_wallet_txns_owner_showcase_credit_unique
  ON public.wallet_transactions (owner_user_id)
  WHERE transaction_type = 'SHOWCASE_CREDIT' AND status = 'COMPLETED' AND owner_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_user_rewards_showcase_lifetime_unique
  ON public.user_rewards (user_id)
  WHERE reward_type IN ('SHOWCASE_CREDIT', 'SHOWCASE_REWARD');

-- Descriptive comments establishing the authoritative hierarchy
COMMENT ON TABLE public.user_rewards IS
  'Authoritative user-level reward entitlement and lifetime uniqueness. Showcase reward eligibility must be enforced here and through the atomic reward RPC.';

COMMENT ON TABLE public.owner_showcase_rewards IS
  'Derived/audit relationship between an owner and Showcase reward. Not an independent lifetime eligibility authority.';

COMMENT ON COLUMN public.event_showcases.reward_status IS
  'Showcase-specific reward workflow/display state. Does not determine lifetime user eligibility.';

COMMENT ON COLUMN public.event_showcases.reward_review_status IS
  'Showcase-specific reward review state. Approval alone never grants wallet credit; atomic reward RPC is required.';

COMMENT ON COLUMN public.organization_wallets.showcase_credit_granted IS
  'Legacy/derived organization-level display or compatibility state. Never use as the authoritative user-level Showcase Reward eligibility check.';

-- ------------------------------------------------------------------------------
-- REWARD TABLES ROW LEVEL SECURITY (RLS) & CLIENT MUTATION LOCKDOWN
-- ------------------------------------------------------------------------------
ALTER TABLE public.user_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_showcase_rewards ENABLE ROW LEVEL SECURITY;

REVOKE INSERT, UPDATE, DELETE ON public.user_rewards FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.owner_showcase_rewards FROM anon, authenticated;

GRANT SELECT ON public.user_rewards TO authenticated;
GRANT SELECT ON public.owner_showcase_rewards TO authenticated;

GRANT ALL ON public.user_rewards TO service_role, postgres;
GRANT ALL ON public.owner_showcase_rewards TO service_role, postgres;

DROP POLICY IF EXISTS "Users can view own user_rewards" ON public.user_rewards;
CREATE POLICY "Users can view own user_rewards"
  ON public.user_rewards FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR (SELECT public.is_developer_admin())
  );

DROP POLICY IF EXISTS "Owners can view own showcase_rewards" ON public.owner_showcase_rewards;
CREATE POLICY "Owners can view own showcase_rewards"
  ON public.owner_showcase_rewards FOR SELECT
  TO authenticated
  USING (
    owner_user_id = auth.uid()
    OR (SELECT public.is_developer_admin())
  );

-- Defense-in-depth anti-tamper trigger
CREATE OR REPLACE FUNCTION public.prevent_direct_reward_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF current_user = 'postgres' OR current_user = 'service_role' OR current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Direct client manipulation of financial reward tables is strictly forbidden.';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_tamper_user_rewards ON public.user_rewards;
CREATE TRIGGER trg_prevent_tamper_user_rewards
  BEFORE INSERT OR UPDATE OR DELETE ON public.user_rewards
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_direct_reward_tampering();

DROP TRIGGER IF EXISTS trg_prevent_tamper_owner_showcase_rewards ON public.owner_showcase_rewards;
CREATE TRIGGER trg_prevent_tamper_owner_showcase_rewards
  BEFORE INSERT OR UPDATE OR DELETE ON public.owner_showcase_rewards
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_direct_reward_tampering();

-- ------------------------------------------------------------------------------
-- ATOMIC ORGANIZATION CREATION RPC
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_organization_atomic(
  p_name TEXT,
  p_owner_id UUID,
  p_logo_url TEXT DEFAULT NULL,
  p_country_code TEXT DEFAULT NULL,
  p_org_id UUID DEFAULT NULL,
  p_slug TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_slug TEXT;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
  v_org public.organizations%ROWTYPE;
  v_wallet public.organization_wallets%ROWTYPE;
  v_base_slug TEXT;
  v_suffix TEXT;
  v_country VARCHAR(2);
  v_grant_res JSONB;
  v_welcome_granted BOOLEAN := false;
  v_welcome_amount NUMERIC(12, 2) := 0.00;
  v_existing_org_count INTEGER := 0;
BEGIN
  -- 1. Input validations
  IF p_name IS NULL OR trim(p_name) = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'VALIDATION_ERROR',
      'error', 'Organization name is required',
      'message', 'Organization name is required'
    );
  END IF;

  IF p_owner_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'VALIDATION_ERROR',
      'error', 'Owner ID is required',
      'message', 'Owner ID is required'
    );
  END IF;

  -- Verify owner user exists
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_owner_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'USER_NOT_FOUND',
      'error', 'Owner user not found',
      'message', 'Owner user not found'
    );
  END IF;

  -- 2. Check Owner-Level Organization Limit (Maximum 5 organizations per user)
  SELECT count(*) INTO v_existing_org_count
  FROM public.organizations
  WHERE owner_id = p_owner_id;

  IF v_existing_org_count >= 5 THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'ORGANIZATION_LIMIT_REACHED',
      'error', 'Organization limit reached: You can own a maximum of 5 organizations.',
      'message', 'Organization limit reached: You can own a maximum of 5 organizations. Please manage or delete existing organizations before creating a new one.',
      'current_count', v_existing_org_count,
      'max_allowed', 5
    );
  END IF;

  v_org_id := COALESCE(p_org_id, gen_random_uuid());
  v_country := NULL;
  IF p_country_code IS NOT NULL AND trim(p_country_code) <> '' THEN
    v_country := upper(trim(p_country_code));
  END IF;

  -- Generate slug if not provided
  IF p_slug IS NOT NULL AND trim(p_slug) <> '' THEN
    v_slug := trim(p_slug);
  ELSE
    v_base_slug := lower(regexp_replace(trim(p_name), '[^a-zA-Z0-9]+', '-', 'g'));
    v_base_slug := trim(both '-' from v_base_slug);
    IF v_base_slug = '' THEN
      v_base_slug := 'org';
    END IF;
    v_suffix := substr(md5(random()::text || clock_timestamp()::text), 1, 6);
    v_slug := v_base_slug || '-' || v_suffix;
  END IF;

  -- 2. Create Organization
  INSERT INTO public.organizations (
    id,
    name,
    slug,
    owner_id,
    logo_url,
    country_code,
    created_at,
    updated_at
  ) VALUES (
    v_org_id,
    trim(p_name),
    v_slug,
    p_owner_id,
    p_logo_url,
    v_country,
    v_now,
    v_now
  )
  RETURNING * INTO v_org;

  -- 3. Create Owner Membership (idempotent ON CONFLICT)
  INSERT INTO public.organization_members (
    id,
    organization_id,
    user_id,
    role,
    created_at
  ) VALUES (
    gen_random_uuid(),
    v_org_id,
    p_owner_id,
    'owner',
    v_now
  )
  ON CONFLICT (organization_id, user_id) 
  DO UPDATE SET role = 'owner';

  -- 4. Initialize Organization Wallet (ensures wallet row exists)
  INSERT INTO public.organization_wallets (
    id,
    organization_id,
    paid_balance,
    welcome_credit,
    showcase_credit,
    topup_credit,
    outstanding_balance,
    currency,
    welcome_credit_granted,
    showcase_credit_granted,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    v_org_id,
    0.00,
    0.00,
    0.00,
    0.00,
    0.00,
    'MYR',
    false,
    false,
    v_now,
    v_now
  )
  ON CONFLICT (organization_id)
  DO UPDATE SET updated_at = v_now
  RETURNING * INTO v_wallet;

  -- 5. Evaluate and Grant First-Organization Welcome Credit
  -- Reuses the authoritative owner-only, user-level grant function: grant_welcome_credit_atomic.
  -- grant_welcome_credit_atomic authoritatively checks:
  --   a) organization exists and p_owner_id is the actual owner (v_org.owner_id = p_user_id)
  --   b) user has not claimed WELCOME_CREDIT in public.user_rewards or past completed transactions
  --   c) atomically inserts into public.user_rewards (ON CONFLICT DO NOTHING)
  --   d) inserts into public.wallet_transactions and credits organization_wallets
  v_grant_res := public.grant_welcome_credit_atomic(
    v_org_id,
    p_owner_id,
    p_owner_id,
    'welcome_' || v_org_id::text,
    jsonb_build_object(
      'source', 'AUTO_ORGANIZATION_CREATION',
      'organization_name', trim(p_name),
      'owner_user_id', p_owner_id,
      'program', 'ORGANIZATION_ONBOARDING_WELCOME'
    )
  );

  IF (COALESCE((v_grant_res->>'success')::boolean, false) = true) AND
     (COALESCE((v_grant_res->>'already_granted')::boolean, true) = false) THEN
    v_welcome_granted := true;
    v_welcome_amount := 800.00;
  ELSE
    v_welcome_granted := false;
    v_welcome_amount := 0.00;
  END IF;

  -- Re-read latest wallet state
  SELECT * INTO v_wallet
  FROM public.organization_wallets
  WHERE organization_id = v_org_id;

  RETURN jsonb_build_object(
    'success', true,
    'organization', row_to_json(v_org),
    'wallet', row_to_json(v_wallet),
    'welcome_credit_granted', v_welcome_granted,
    'welcome_credit_amount', v_welcome_amount
  );

EXCEPTION
  WHEN unique_violation THEN
    IF SQLERRM LIKE '%organizations_slug%' OR SQLERRM LIKE '%slug%' THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'SLUG_TAKEN',
        'error', 'An organization with this URL slug already exists. Please choose another name or slug.',
        'message', 'An organization with this URL slug already exists'
      );
    ELSE
      RETURN jsonb_build_object(
        'success', false,
        'code', 'UNIQUE_VIOLATION',
        'error', SQLERRM,
        'message', 'A unique constraint was violated while creating the organization'
      );
    END IF;
  WHEN OTHERS THEN
    IF SQLSTATE = 'P0001' AND SQLERRM LIKE '%Organization limit reached%' THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'ORGANIZATION_LIMIT_REACHED',
        'error', SQLERRM,
        'message', 'Organization limit reached: You can own a maximum of 5 organizations.',
        'current_count', 5,
        'max_allowed', 5
      );
    END IF;
    RETURN jsonb_build_object(
      'success', false,
      'code', 'INTERNAL_ERROR',
      'error', SQLERRM,
      'message', 'An unexpected error occurred while creating the organization'
    );
END;
$$;

-- Security Permissions: Backend-write-only
GRANT EXECUTE ON FUNCTION public.create_organization_atomic(TEXT, UUID, TEXT, TEXT, UUID, TEXT) TO service_role;
REVOKE EXECUTE ON FUNCTION public.create_organization_atomic(TEXT, UUID, TEXT, TEXT, UUID, TEXT) FROM authenticated, anon, public;

-- ====================================================================
-- CENTRAL NOTIFICATIONS SYSTEM
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  type VARCHAR(64) NOT NULL,
  category VARCHAR(32) NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  priority VARCHAR(16) NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  action_url TEXT,
  entity_type VARCHAR(64),
  entity_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ,
  deduplication_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_user_id 
  ON public.notifications (recipient_user_id);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created 
  ON public.notifications (recipient_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_unread 
  ON public.notifications (recipient_user_id, created_at DESC) 
  WHERE is_read = false;

CREATE INDEX IF NOT EXISTS idx_notifications_org 
  ON public.notifications (organization_id);

CREATE INDEX IF NOT EXISTS idx_notifications_category 
  ON public.notifications (recipient_user_id, category);

CREATE UNIQUE INDEX IF NOT EXISTS ux_notifications_recipient_dedup 
  ON public.notifications (recipient_user_id, deduplication_key) 
  WHERE deduplication_key IS NOT NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
CREATE POLICY "Users can view their own notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (recipient_user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
CREATE POLICY "Users can update their own notifications"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (recipient_user_id = auth.uid())
  WITH CHECK (recipient_user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete their own notifications" ON public.notifications;
CREATE POLICY "Users can delete their own notifications"
  ON public.notifications FOR DELETE
  TO authenticated
  USING (recipient_user_id = auth.uid());

GRANT ALL ON public.notifications TO service_role;
GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;

-- ==============================================================================
-- 29. API ERROR LOGS TABLE & DEVELOPER AUDITING
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.api_error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  method TEXT,
  endpoint TEXT,
  status_code INTEGER,
  error_type TEXT,
  error_code TEXT,
  error_message TEXT,
  stack_trace TEXT,
  service TEXT,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_api_error_logs_request_id ON public.api_error_logs (request_id);
CREATE INDEX IF NOT EXISTS idx_api_error_logs_created_at_desc ON public.api_error_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_error_logs_endpoint ON public.api_error_logs (endpoint);
CREATE INDEX IF NOT EXISTS idx_api_error_logs_status_code ON public.api_error_logs (status_code);
CREATE INDEX IF NOT EXISTS idx_api_error_logs_service ON public.api_error_logs (service);
CREATE INDEX IF NOT EXISTS idx_api_error_logs_user_id ON public.api_error_logs (user_id);

ALTER TABLE public.api_error_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages api error logs" ON public.api_error_logs;
CREATE POLICY "Service role manages api error logs"
  ON public.api_error_logs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Developer admins can view api error logs" ON public.api_error_logs;
CREATE POLICY "Developer admins can view api error logs"
  ON public.api_error_logs FOR SELECT
  TO authenticated
  USING (public.is_developer_admin());

GRANT ALL ON public.api_error_logs TO service_role;
GRANT SELECT ON public.api_error_logs TO authenticated;

-- ------------------------------------------------------------------------------
-- GAME PRICING & EVENT PRICING SNAPSHOTS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.game_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  min_days INT NOT NULL CHECK (min_days >= 1),
  max_days INT CHECK (max_days IS NULL OR max_days >= min_days),
  price NUMERIC(10, 2) NOT NULL CHECK (price > 0),
  currency TEXT NOT NULL DEFAULT 'MYR',
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_base BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_game_pricing_game_id ON public.game_pricing(game_id);
CREATE INDEX IF NOT EXISTS idx_game_pricing_active ON public.game_pricing(is_active);
CREATE INDEX IF NOT EXISTS idx_game_pricing_game_days ON public.game_pricing(game_id, min_days, max_days);
CREATE INDEX IF NOT EXISTS idx_game_pricing_is_base ON public.game_pricing(game_id, is_base) WHERE is_base = true;

ALTER TABLE public.game_pricing ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view active game pricing" ON public.game_pricing;
CREATE POLICY "Anyone can view active game pricing"
  ON public.game_pricing
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Service role can manage game pricing" ON public.game_pricing;
CREATE POLICY "Service role can manage game pricing"
  ON public.game_pricing
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS pricing_id UUID REFERENCES public.game_pricing(id) ON DELETE SET NULL;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS duration_days INT;
CREATE INDEX IF NOT EXISTS idx_events_pricing_id ON public.events(pricing_id);




