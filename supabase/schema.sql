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
  starts_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'live', 'expired', 'cancelled', 'pending_payment', 'active', 'completed')),
  event_status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (event_status IN ('DRAFT', 'PAYMENT_PENDING', 'LIVE', 'COMPLETED', 'CANCELLED')),
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_events_org_id ON public.events (organization_id);
CREATE INDEX IF NOT EXISTS idx_events_game_id ON public.events (game_id);
CREATE INDEX IF NOT EXISTS idx_events_game_theme_id ON public.events (game_theme_id);
CREATE INDEX IF NOT EXISTS idx_events_public_token ON public.events (public_token);
CREATE INDEX IF NOT EXISTS idx_events_status ON public.events (status);
CREATE INDEX IF NOT EXISTS idx_events_event_status ON public.events (event_status);
CREATE INDEX IF NOT EXISTS idx_events_payment_status ON public.events (payment_status);
CREATE INDEX IF NOT EXISTS idx_events_starts_expires ON public.events (starts_at, expires_at);
CREATE INDEX IF NOT EXISTS idx_events_lifecycle_cron ON public.events (event_status, starts_at, payment_status);

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
DROP POLICY IF EXISTS "Authenticated users can upload game-assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update game-assets" ON storage.objects;
DROP POLICY IF EXISTS "Organization members can upload to their org folder in game-assets" ON storage.objects;
DROP POLICY IF EXISTS "Organization members can update their org assets in game-assets" ON storage.objects;
DROP POLICY IF EXISTS "Organization members can delete their org assets in game-assets" ON storage.objects;

-- Public CDN read access (assets like backgrounds and themes are publicly viewable by URL)
CREATE POLICY "Public read access for game-assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'game-assets');

-- Strict tenant-scoped upload policy:
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

-- Strict tenant-scoped update policy
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

-- Strict tenant-scoped delete policy
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
    -- Server-Authoritative: Event's own stored price takes precedence
    v_event_price := COALESCE(v_event.event_price, p_event_price, 1400.00);
  ELSE
    v_event_price := COALESCE(p_event_price, 1400.00);
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
  top_up_amount NUMERIC(12, 2) NOT NULL CHECK (top_up_amount > 0),
  expected_credit_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (expected_credit_amount >= 0),
  bonus_percentage NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
  total_wallet_value NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
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

CREATE INDEX IF NOT EXISTS idx_wallet_topup_orders_org_id ON public.wallet_topup_orders (organization_id);
CREATE INDEX IF NOT EXISTS idx_wallet_topup_orders_user_id ON public.wallet_topup_orders (user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_topup_orders_status ON public.wallet_topup_orders (status);
CREATE INDEX IF NOT EXISTS idx_wallet_topup_orders_payment_ref ON public.wallet_topup_orders (payment_reference);
CREATE INDEX IF NOT EXISTS idx_wallet_topup_orders_created_at ON public.wallet_topup_orders (created_at DESC);

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
        currency
      ) VALUES (
        p_organization_id,
        0.00,
        0.00,
        0.00,
        0.00,
        'MYR'
      )
      RETURNING * INTO v_wallet;
    END IF;

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

    UPDATE public.wallet_topup_orders
    SET
      status = 'PAID',
      paid_at = v_now,
      updated_at = v_now,
      payment_reference = COALESCE(p_payment_reference, v_order.payment_reference),
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

    UPDATE public.organization_wallets
    SET
      paid_balance = paid_balance + v_order.top_up_amount,
      topup_credit = topup_credit + v_promo_credit,
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
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_event_high_scores_event_score 
  ON public.event_high_scores (event_id, score DESC, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_event_high_scores_created_at 
  ON public.event_high_scores (created_at DESC);

ALTER TABLE public.event_high_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view event high scores" ON public.event_high_scores;
DROP POLICY IF EXISTS "Anyone can view high scores of published events" ON public.event_high_scores;
DROP POLICY IF EXISTS "Public can insert event high scores" ON public.event_high_scores;
DROP POLICY IF EXISTS "Org members and developer admins can insert high scores" ON public.event_high_scores;
DROP POLICY IF EXISTS "Event managers can delete high scores" ON public.event_high_scores;
DROP POLICY IF EXISTS "Developer admins can update high scores" ON public.event_high_scores;

-- Hardened SELECT: Only allow viewing scores for live/paid events or when user belongs to the event's organization
CREATE POLICY "Anyone can view high scores of published events"
  ON public.event_high_scores
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_high_scores.event_id
        AND (
          e.event_status = 'LIVE'
          OR e.payment_status = 'PAID'
          OR (auth.uid() IS NOT NULL AND public.get_org_role(e.organization_id) IS NOT NULL)
          OR public.is_developer_admin()
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
  '{"default_price": 1400.00, "default_currency": "MYR"}'::jsonb,
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






