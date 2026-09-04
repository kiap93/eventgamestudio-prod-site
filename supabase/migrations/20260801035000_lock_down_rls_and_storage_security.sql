-- ==============================================================================
-- MIGRATION: 019_lock_down_rls_and_storage_security.sql
-- LOCK DOWN SUPABASE RLS AND STORAGE POLICIES (PRODUCTION SECURITY HARDENING)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. HARDEN EVENT HIGH SCORES TABLE RLS
-- ------------------------------------------------------------------------------
-- Drop insecure open policies (WITH CHECK true / USING true)
DROP POLICY IF EXISTS "Public can insert event high scores" ON public.event_high_scores;
DROP POLICY IF EXISTS "Event managers can delete high scores" ON public.event_high_scores;
DROP POLICY IF EXISTS "Public can view event high scores" ON public.event_high_scores;
DROP POLICY IF EXISTS "Anyone can view high scores of published events" ON public.event_high_scores;
DROP POLICY IF EXISTS "Org members and developer admins can insert high scores" ON public.event_high_scores;
DROP POLICY IF EXISTS "Developer admins can update high scores" ON public.event_high_scores;

-- Ensure RLS is active
ALTER TABLE public.event_high_scores ENABLE ROW LEVEL SECURITY;

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
-- 2. HARDEN SUPABASE STORAGE RLS (game-assets bucket)
-- ------------------------------------------------------------------------------
-- Drop insecure open policies
DROP POLICY IF EXISTS "Authenticated users can upload game-assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update game-assets" ON storage.objects;
DROP POLICY IF EXISTS "Public read access for game-assets" ON storage.objects;
DROP POLICY IF EXISTS "Organization members can upload to their org folder in game-assets" ON storage.objects;
DROP POLICY IF EXISTS "Organization members can update their org assets in game-assets" ON storage.objects;
DROP POLICY IF EXISTS "Organization members can delete their org assets in game-assets" ON storage.objects;

-- 2.1 Public CDN read access (safe, assets like banners and game sprites are public)
CREATE POLICY "Public read access for game-assets"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'game-assets');

-- 2.2 Strict tenant-scoped upload policy:
-- Direct authenticated uploads are strictly confined to the caller's organization path:
-- Path format: organizations/<organization_id>/...
-- Or developer admin uploading anywhere in game-assets.
CREATE POLICY "Organization members can upload to their org folder in game-assets"
  ON storage.objects
  FOR INSERT
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

-- 2.3 Strict tenant-scoped update policy
CREATE POLICY "Organization members can update their org assets in game-assets"
  ON storage.objects
  FOR UPDATE
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

-- 2.4 Strict tenant-scoped delete policy
CREATE POLICY "Organization members can delete their org assets in game-assets"
  ON storage.objects
  FOR DELETE
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
