-- ==============================================================================
-- Migration: Align Storage Bucket Limits and Provision Dedicated showcase-media Bucket
--
-- Architecture alignment:
-- 1. Update 'game-assets' bucket to 25MB (26,214,400 bytes) file size limit for general assets
-- 2. Create 'showcase-media' bucket with 200MB (209,715,200 bytes) file size limit for showcase photos and activation highlight videos
-- 3. Configure RLS policies for 'showcase-media' allowing public CDN reads and tenant-isolated uploads
-- ==============================================================================

-- 1. Ensure storage buckets exist with correct limits and allowed mime types
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('game-assets', 'game-assets', true, 26214400, ARRAY['image/png', 'image/jpeg', 'image/webp', 'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/aac']),
  ('showcase-media', 'showcase-media', true, 209715200, ARRAY['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. Clean up any existing policies on showcase-media before recreating
DROP POLICY IF EXISTS "Public read access for showcase-media" ON storage.objects;
DROP POLICY IF EXISTS "Organization members can upload to their org folder in showcase-media" ON storage.objects;
DROP POLICY IF EXISTS "Organization members can update their org assets in showcase-media" ON storage.objects;
DROP POLICY IF EXISTS "Organization members can delete their org assets in showcase-media" ON storage.objects;

-- 3. Public read CDN access for showcase-media
CREATE POLICY "Public read access for showcase-media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'showcase-media');

-- 4. Strict tenant-scoped upload policy for showcase-media
-- Enforces caller's organization path: organizations/<organization_id>/showcases/...
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

-- 5. Strict tenant-scoped update policy for showcase-media
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

-- 6. Strict tenant-scoped delete policy for showcase-media
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
