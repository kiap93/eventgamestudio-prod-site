-- ==============================================================================
-- MIGRATION: 009_create_event_showcase_tables.sql
-- EVENT GAME STUDIO - EVENT SHOWCASES & SHOWCASE MEDIA
-- ==============================================================================

-- 1. EVENT SHOWCASES TABLE (1:1 with events)
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

-- Indexes for event_showcases
CREATE INDEX IF NOT EXISTS idx_event_showcases_event_id ON public.event_showcases (event_id);
CREATE INDEX IF NOT EXISTS idx_event_showcases_org_id ON public.event_showcases (organization_id);
CREATE INDEX IF NOT EXISTS idx_event_showcases_status ON public.event_showcases (status);

-- 2. EVENT SHOWCASE MEDIA TABLE
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

-- Indexes for event_showcase_media
CREATE INDEX IF NOT EXISTS idx_event_showcase_media_showcase_id ON public.event_showcase_media (showcase_id);
CREATE INDEX IF NOT EXISTS idx_event_showcase_media_org_id ON public.event_showcase_media (organization_id);
CREATE INDEX IF NOT EXISTS idx_event_showcase_media_sort_order ON public.event_showcase_media (showcase_id, sort_order ASC);

-- 3. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.event_showcases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_showcase_media ENABLE ROW LEVEL SECURITY;

-- EVENT SHOWCASES POLICIES
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

-- EVENT SHOWCASE MEDIA POLICIES
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
