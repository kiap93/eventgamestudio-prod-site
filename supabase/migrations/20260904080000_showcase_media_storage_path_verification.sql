-- Migration: 20260904080000_showcase_media_storage_path_verification.sql
-- Description: Adds storage_path verification, defense-in-depth trigger validation,
-- and backend-write-only security to public.event_showcase_media to prevent arbitrary media URLs.

-- 1. Add storage_path column to public.event_showcase_media
ALTER TABLE public.event_showcase_media 
  ADD COLUMN IF NOT EXISTS storage_path TEXT;

CREATE INDEX IF NOT EXISTS idx_event_showcase_media_storage_path 
  ON public.event_showcase_media (storage_path);

-- 2. Trigger function to enforce storage path hierarchy and strictly prohibit arbitrary external URLs & SVG uploads
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

-- 3. Transition event_showcase_media to backend-write-only:
-- Revoke direct client mutations from authenticated and anon.
-- Only server API with service_role can insert, update, or delete media items.
DROP POLICY IF EXISTS "Owners, admins, designers can insert showcase media" ON public.event_showcase_media;
DROP POLICY IF EXISTS "Owners, admins, designers can update showcase media" ON public.event_showcase_media;
DROP POLICY IF EXISTS "Owners, admins, designers can delete showcase media" ON public.event_showcase_media;

REVOKE INSERT, UPDATE, DELETE ON public.event_showcase_media FROM authenticated, anon;
GRANT SELECT ON public.event_showcase_media TO authenticated, anon;
GRANT ALL ON public.event_showcase_media TO service_role;
