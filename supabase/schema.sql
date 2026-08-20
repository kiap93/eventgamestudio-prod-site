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
  currency TEXT NOT NULL DEFAULT 'MYR',
  welcome_credit_granted BOOLEAN NOT NULL DEFAULT false,
  showcase_credit_granted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_org_wallets_org_id ON public.organization_wallets (organization_id);

CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
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

CREATE INDEX IF NOT EXISTS idx_wallet_txns_org_id ON public.wallet_transactions (organization_id);
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

-- Single-grant constraints
CREATE UNIQUE INDEX IF NOT EXISTS ux_wallet_txns_welcome_credit 
  ON public.wallet_transactions (organization_id) 
  WHERE transaction_type = 'WELCOME_CREDIT' AND status = 'COMPLETED';

CREATE UNIQUE INDEX IF NOT EXISTS ux_wallet_txns_showcase_credit 
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
  title TEXT NOT NULL,
  description TEXT,
  client_name TEXT,
  client_logo_url TEXT,
  cover_image_url TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'UNPUBLISHED')),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_event_showcases_event_id ON public.event_showcases (event_id);
CREATE INDEX IF NOT EXISTS idx_event_showcases_org_id ON public.event_showcases (organization_id);
CREATE INDEX IF NOT EXISTS idx_event_showcases_status ON public.event_showcases (status);

CREATE TABLE IF NOT EXISTS public.event_showcase_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  showcase_id UUID NOT NULL REFERENCES public.event_showcases(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL CHECK (media_type IN ('IMAGE', 'VIDEO')),
  media_url TEXT NOT NULL,
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
CREATE INDEX IF NOT EXISTS idx_event_showcase_media_sort_order ON public.event_showcase_media (showcase_id, sort_order ASC);

-- Showcase RLS
ALTER TABLE public.event_showcases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_showcase_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view published showcases or org members" ON public.event_showcases;
CREATE POLICY "Anyone can view published showcases or org members"
  ON public.event_showcases FOR SELECT
  USING (
    status = 'PUBLISHED' 
    OR public.is_org_member(organization_id) 
    OR public.is_developer_admin()
  );

DROP POLICY IF EXISTS "Owners, admins, designers can insert event showcases" ON public.event_showcases;
CREATE POLICY "Owners, admins, designers can insert event showcases"
  ON public.event_showcases FOR INSERT
  WITH CHECK (
    public.get_org_role(organization_id) IN ('owner', 'admin', 'designer') 
    OR public.is_developer_admin()
  );

DROP POLICY IF EXISTS "Owners, admins, designers can update event showcases" ON public.event_showcases;
CREATE POLICY "Owners, admins, designers can update event showcases"
  ON public.event_showcases FOR UPDATE
  USING (
    public.get_org_role(organization_id) IN ('owner', 'admin', 'designer') 
    OR public.is_developer_admin()
  );

DROP POLICY IF EXISTS "Owners and admins can delete event showcases" ON public.event_showcases;
CREATE POLICY "Owners and admins can delete event showcases"
  ON public.event_showcases FOR DELETE
  USING (
    public.get_org_role(organization_id) IN ('owner', 'admin') 
    OR public.is_developer_admin()
  );

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

DROP POLICY IF EXISTS "Owners, admins, designers can insert showcase media" ON public.event_showcase_media;
CREATE POLICY "Owners, admins, designers can insert showcase media"
  ON public.event_showcase_media FOR INSERT
  WITH CHECK (
    public.get_org_role(organization_id) IN ('owner', 'admin', 'designer') 
    OR public.is_developer_admin()
  );

DROP POLICY IF EXISTS "Owners, admins, designers can update showcase media" ON public.event_showcase_media;
CREATE POLICY "Owners, admins, designers can update showcase media"
  ON public.event_showcase_media FOR UPDATE
  USING (
    public.get_org_role(organization_id) IN ('owner', 'admin', 'designer') 
    OR public.is_developer_admin()
  );

DROP POLICY IF EXISTS "Owners, admins, designers can delete showcase media" ON public.event_showcase_media;
CREATE POLICY "Owners, admins, designers can delete showcase media"
  ON public.event_showcase_media FOR DELETE
  USING (
    public.get_org_role(organization_id) IN ('owner', 'admin', 'designer') 
    OR public.is_developer_admin()
  );

-- ------------------------------------------------------------------------------
-- 15. ATOMIC EVENT PAYMENT RPC / TRANSACTION ENGINE
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_event_payment_atomic(
  p_organization_id UUID,
  p_event_id UUID,
  p_payment_mode TEXT,
  p_event_price NUMERIC DEFAULT 1400.00,
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
  v_wallet RECORD;
  v_event RECORD;
  v_event_price NUMERIC := COALESCE(p_event_price, 1400.00);
  v_credit_to_use NUMERIC := 0.00;
  v_paid_to_use NUMERIC := 0.00;
  v_credit_balance_type TEXT := NULL;
  v_credit_txn RECORD;
  v_paid_txn RECORD;
  v_credit_ref TEXT;
  v_paid_ref TEXT;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
  v_existing_payment RECORD;
  v_existing_credit RECORD;
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

  IF p_payment_mode NOT IN ('FULL_PAID', 'WELCOME_CREDIT', 'SHOWCASE_CREDIT', 'TOPUP_CREDIT') THEN
    RAISE EXCEPTION 'Invalid payment mode: %', p_payment_mode;
  END IF;

  IF v_event_price <= 0 THEN
    RAISE EXCEPTION 'Event price must be greater than 0';
  END IF;

  -- 2. Idempotency Protection: Check if event is already paid in transaction ledger
  SELECT * INTO v_existing_payment
  FROM public.wallet_transactions
  WHERE organization_id = p_organization_id
    AND event_id = p_event_id
    AND transaction_type = 'EVENT_PAYMENT'
    AND balance_type = 'PAID_BALANCE'
    AND status = 'COMPLETED'
  LIMIT 1;

  IF v_existing_payment.id IS NOT NULL THEN
    SELECT * INTO v_existing_credit
    FROM public.wallet_transactions
    WHERE organization_id = p_organization_id
      AND event_id = p_event_id
      AND transaction_type = 'CREDIT_USAGE'
      AND status = 'COMPLETED'
    LIMIT 1;

    SELECT * INTO v_wallet FROM public.organization_wallets WHERE organization_id = p_organization_id;

    RETURN jsonb_build_object(
      'success', true,
      'is_idempotent_replay', true,
      'event_id', p_event_id,
      'payment_mode', p_payment_mode,
      'event_price', v_event_price,
      'paid_amount', ABS(v_existing_payment.amount),
      'discount_amount', COALESCE(ABS(v_existing_credit.amount), 0.00),
      'credit_transaction', CASE WHEN v_existing_credit.id IS NOT NULL THEN to_jsonb(v_existing_credit) ELSE NULL END,
      'paid_transaction', to_jsonb(v_existing_payment),
      'wallet', jsonb_build_object(
        'paid_balance', COALESCE(v_wallet.paid_balance, 0.00),
        'welcome_credit', COALESCE(v_wallet.welcome_credit, 0.00),
        'showcase_credit', COALESCE(v_wallet.showcase_credit, 0.00),
        'topup_credit', COALESCE(v_wallet.topup_credit, 0.00)
      )
    );
  END IF;

  -- 3. Lock & Validate Organization Wallet (Row-level lock prevents race conditions & double-spend)
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

  -- 4. Lock & Validate Event Record (if exists in events table)
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
  END IF;

  -- 5. Calculate and validate business rules for payment mode
  IF p_payment_mode = 'FULL_PAID' THEN
    v_credit_to_use := 0.00;
    v_paid_to_use := v_event_price;

    IF v_wallet.paid_balance < v_paid_to_use THEN
      RAISE EXCEPTION 'Insufficient Paid Balance. Event price is RM%, but available Paid Balance is RM%.',
        ROUND(v_paid_to_use, 2)::text, ROUND(v_wallet.paid_balance, 2)::text;
    END IF;

  ELSIF p_payment_mode = 'WELCOME_CREDIT' THEN
    v_credit_balance_type := 'WELCOME_CREDIT';
    v_credit_to_use := LEAST(800.00, v_event_price);
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
    v_credit_to_use := LEAST(300.00, v_event_price);
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
    v_req := COALESCE(p_topup_credit_requested, v_max_cap);
    v_credit_to_use := LEAST(v_req, v_max_cap, v_wallet.topup_credit, v_event_price);
    v_paid_to_use := v_event_price - v_credit_to_use;

    IF v_wallet.topup_credit < v_credit_to_use THEN
      RAISE EXCEPTION 'Insufficient Top-up Credit. Required: RM%, Available: RM%.',
        ROUND(v_credit_to_use, 2)::text, ROUND(v_wallet.topup_credit, 2)::text;
    END IF;

    IF v_wallet.paid_balance < v_paid_to_use THEN
      RAISE EXCEPTION 'Insufficient Paid Balance for Top-up Credit payment. Required: RM%, Available: RM%.',
        ROUND(v_paid_to_use, 2)::text, ROUND(v_wallet.paid_balance, 2)::text;
    END IF;
  END IF;

  -- 6. Setup references
  IF p_reference_id IS NOT NULL AND p_reference_id <> '' THEN
    v_credit_ref := p_reference_id || '_credit';
    v_paid_ref := p_reference_id || '_paid';
  ELSE
    v_credit_ref := 'event_' || p_event_id::text || '_credit';
    v_paid_ref := 'event_' || p_event_id::text || '_paid';
  END IF;

  -- 7. Insert Credit Deduction in immutable ledger (if promotional credit used)
  IF v_credit_to_use > 0 AND v_credit_balance_type IS NOT NULL THEN
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
      COALESCE(p_description, 'Applied RM' || ROUND(v_credit_to_use, 2)::text || ' ' || replace(p_payment_mode, '_', ' ') || ' for Event'),
      jsonb_build_object(
        'event_id', p_event_id,
        'payment_mode', p_payment_mode,
        'credit_type', v_credit_balance_type,
        'credit_discount', v_credit_to_use,
        'event_price', v_event_price
      ) || COALESCE(p_metadata, '{}'::jsonb),
      p_created_by,
      v_now
    )
    RETURNING * INTO v_credit_txn;
  END IF;

  -- 8. Insert Paid Balance Deduction in immutable ledger (if paid amount > 0)
  IF v_paid_to_use > 0 THEN
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
      'Paid RM' || ROUND(v_paid_to_use, 2)::text || ' from Paid Balance for Event',
      jsonb_build_object(
        'event_id', p_event_id,
        'payment_mode', p_payment_mode,
        'paid_amount', v_paid_to_use,
        'credit_applied', v_credit_to_use,
        'total_event_cost', v_event_price
      ) || COALESCE(p_metadata, '{}'::jsonb),
      p_created_by,
      v_now
    )
    RETURNING * INTO v_paid_txn;
  END IF;

  -- 9. Update Organization Wallets Cached Balances
  UPDATE public.organization_wallets
  SET
    paid_balance = paid_balance - v_paid_to_use,
    welcome_credit = CASE WHEN v_credit_balance_type = 'WELCOME_CREDIT' THEN welcome_credit - v_credit_to_use ELSE welcome_credit END,
    showcase_credit = CASE WHEN v_credit_balance_type = 'SHOWCASE_CREDIT' THEN showcase_credit - v_credit_to_use ELSE showcase_credit END,
    topup_credit = CASE WHEN v_credit_balance_type = 'TOPUP_CREDIT' THEN topup_credit - v_credit_to_use ELSE topup_credit END,
    updated_at = v_now
  WHERE organization_id = p_organization_id
  RETURNING * INTO v_wallet;

  -- 10. Mark Event as PAID in events table (if event exists)
  IF v_event.id IS NOT NULL THEN
    UPDATE public.events
    SET
      payment_status = 'PAID',
      payment_mode = p_payment_mode,
      paid_amount = v_paid_to_use,
      discount_amount = v_credit_to_use,
      updated_at = v_now
    WHERE id = p_event_id;
  END IF;

  -- 11. Return atomic transaction payload
  RETURN jsonb_build_object(
    'success', true,
    'event_id', p_event_id,
    'payment_mode', p_payment_mode,
    'event_price', v_event_price,
    'paid_amount', v_paid_to_use,
    'discount_amount', v_credit_to_use,
    'credit_transaction', CASE WHEN v_credit_txn.id IS NOT NULL THEN to_jsonb(v_credit_txn) ELSE NULL END,
    'paid_transaction', CASE WHEN v_paid_txn.id IS NOT NULL THEN to_jsonb(v_paid_txn) ELSE NULL END,
    'wallet', jsonb_build_object(
      'paid_balance', v_wallet.paid_balance,
      'welcome_credit', v_wallet.welcome_credit,
      'showcase_credit', v_wallet.showcase_credit,
      'topup_credit', v_wallet.topup_credit
    )
  );
END;
$$;


