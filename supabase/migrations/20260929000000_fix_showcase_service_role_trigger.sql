-- ==============================================================================
-- Migration: 20260929000000_fix_showcase_service_role_trigger.sql
-- Description: Hardens prevent_event_showcase_unauthorized_client_mutations trigger
--              to robustly recognise service_role backend connections via PostgREST
--              JWT claims, session user, and role settings.
--              Adds publish_event_showcase_atomic RPC function for atomic backend
--              publishing under SECURITY DEFINER context.
-- ==============================================================================

-- 1. Replace the trigger function with robust service_role detection
CREATE OR REPLACE FUNCTION public.prevent_event_showcase_unauthorized_client_mutations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_role text;
  v_uid text;
  v_claims jsonb;
BEGIN
  -- 1. Allow database administrator / migration scripts / direct postgres sessions
  IF current_user IN ('postgres', 'supabase_admin') OR session_user IN ('postgres', 'supabase_admin') THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  -- 2. Allow service_role connections (API server backend using SUPABASE_SERVICE_ROLE_KEY)
  IF current_user = 'service_role' OR session_user = 'service_role' OR current_setting('role', true) = 'service_role' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  -- 3. Retrieve auth context from Supabase JWT claims
  BEGIN
    v_role := current_setting('request.jwt.claim.role', true);
  EXCEPTION WHEN OTHERS THEN
    v_role := NULL;
  END;

  -- In modern PostgREST / Supabase, all claims are stored in request.jwt.claims JSON
  IF v_role IS NULL THEN
    BEGIN
      v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
      IF v_claims IS NOT NULL THEN
        v_role := v_claims ->> 'role';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_role := NULL;
    END;
  END IF;

  IF v_role IS NULL THEN
    BEGIN
      v_role := auth.role();
    EXCEPTION WHEN OTHERS THEN
      v_role := NULL;
    END;
  END IF;

  -- If the role is service_role, allow all backend operations
  IF v_role = 'service_role' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  BEGIN
    v_uid := current_setting('request.jwt.claim.sub', true);
  EXCEPTION WHEN OTHERS THEN
    v_uid := NULL;
  END;

  IF v_uid IS NULL THEN
    BEGIN
      IF v_claims IS NOT NULL THEN
        v_uid := v_claims ->> 'sub';
      ELSE
        v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
        IF v_claims IS NOT NULL THEN
          v_uid := v_claims ->> 'sub';
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_uid := NULL;
    END;
  END IF;

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

  -- Block any mutation attempt originating from client roles (authenticated or anon)
  IF v_role IN ('authenticated', 'anon') OR (v_uid IS NOT NULL AND (v_role IS NULL OR v_role != 'service_role')) THEN
    RAISE EXCEPTION 'Direct client mutation on event_showcases is strictly prohibited. All showcase operations must be routed through the server API.';
  END IF;

  -- Defense-in-depth: Even if role check is bypassed, safeguard critical columns
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

-- 2. Ensure the trigger is properly attached
DROP TRIGGER IF EXISTS trg_prevent_event_showcase_unauthorized_client_mutations ON public.event_showcases;
CREATE TRIGGER trg_prevent_event_showcase_unauthorized_client_mutations
  BEFORE INSERT OR UPDATE OR DELETE ON public.event_showcases
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_event_showcase_unauthorized_client_mutations();

-- 3. Atomic Backend RPC for publishing an event showcase under SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.publish_event_showcase_atomic(
  p_event_id UUID,
  p_title TEXT,
  p_description TEXT DEFAULT NULL,
  p_client_name TEXT DEFAULT NULL,
  p_client_logo_url TEXT DEFAULT NULL,
  p_cover_image_url TEXT DEFAULT NULL,
  p_owner_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_event RECORD;
  v_org RECORD;
  v_existing RECORD;
  v_showcase RECORD;
  v_owner_id UUID;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
BEGIN
  -- 1. Fetch event
  SELECT id, organization_id, name, payment_status, event_status, status, start_date, end_date
  INTO v_event
  FROM public.events
  WHERE id = p_event_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event not found' USING ERRCODE = 'P0002';
  END IF;

  -- 2. Fetch organization to resolve owner
  SELECT id, owner_id
  INTO v_org
  FROM public.organizations
  WHERE id = v_event.organization_id;

  v_owner_id := COALESCE(p_owner_user_id, v_org.owner_id);

  -- 3. Check for existing showcase
  SELECT *
  INTO v_existing
  FROM public.event_showcases
  WHERE event_id = p_event_id;

  IF FOUND THEN
    IF v_existing.status = 'BLOCKED' THEN
      RAISE EXCEPTION 'Cannot publish a blocked showcase. Please contact support.' USING ERRCODE = 'P0003';
    END IF;

    UPDATE public.event_showcases
    SET
      title = COALESCE(NULLIF(TRIM(p_title), ''), v_existing.title),
      description = CASE WHEN p_description IS NOT NULL THEN NULLIF(TRIM(p_description), '') ELSE v_existing.description END,
      client_name = CASE WHEN p_client_name IS NOT NULL THEN NULLIF(TRIM(p_client_name), '') ELSE v_existing.client_name END,
      client_logo_url = CASE WHEN p_client_logo_url IS NOT NULL THEN NULLIF(TRIM(p_client_logo_url), '') ELSE v_existing.client_logo_url END,
      cover_image_url = CASE WHEN p_cover_image_url IS NOT NULL THEN NULLIF(TRIM(p_cover_image_url), '') ELSE v_existing.cover_image_url END,
      owner_user_id = COALESCE(v_existing.owner_user_id, v_owner_id),
      status = 'PUBLISHED',
      publication_status = 'PUBLISHED',
      published_at = COALESCE(v_existing.published_at, v_now),
      deleted_at = NULL,
      updated_at = v_now
    WHERE id = v_existing.id
    RETURNING * INTO v_showcase;
  ELSE
    INSERT INTO public.event_showcases (
      event_id,
      organization_id,
      owner_user_id,
      title,
      description,
      client_name,
      client_logo_url,
      cover_image_url,
      status,
      review_status,
      publication_status,
      reward_status,
      reward_review_status,
      published_at,
      created_at,
      updated_at
    ) VALUES (
      p_event_id,
      v_event.organization_id,
      v_owner_id,
      COALESCE(NULLIF(TRIM(p_title), ''), v_event.name, 'Event Showcase'),
      NULLIF(TRIM(p_description), ''),
      NULLIF(TRIM(p_client_name), ''),
      NULLIF(TRIM(p_client_logo_url), ''),
      NULLIF(TRIM(p_cover_image_url), ''),
      'PUBLISHED',
      'DRAFT',
      'PUBLISHED',
      'PENDING',
      'NOT_ELIGIBLE',
      v_now,
      v_now,
      v_now
    )
    RETURNING * INTO v_showcase;
  END IF;

  RETURN to_jsonb(v_showcase);
END;
$$;

-- Grant execution to authenticated & service_role
GRANT EXECUTE ON FUNCTION public.publish_event_showcase_atomic(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.publish_event_showcase_atomic(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) TO postgres;
