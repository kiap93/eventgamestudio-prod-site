-- ==============================================================================
-- Migration: 20260929000000_fix_showcase_service_role_trigger.sql
-- Description: 1. Hardens prevent_event_showcase_unauthorized_client_mutations trigger
--                 to robustly recognise service_role backend connections via PostgREST
--                 JWT claims, session user, and role settings.
--              2. Adds save_event_showcase_atomic RPC function for atomic organizer
--                 showcase saving (Draft, Published, Updates) with strict null semantics.
--              3. Adds publish_event_showcase_atomic RPC function for atomic backend
--                 publishing under SECURITY DEFINER context with strict null semantics.
--              4. Adds delete_event_showcase_atomic RPC function for atomic backend deletion.
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

-- Ensure the trigger is properly attached
DROP TRIGGER IF EXISTS trg_prevent_event_showcase_unauthorized_client_mutations ON public.event_showcases;
CREATE TRIGGER trg_prevent_event_showcase_unauthorized_client_mutations
  BEFORE INSERT OR UPDATE OR DELETE ON public.event_showcases
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_event_showcase_unauthorized_client_mutations();

-- ==============================================================================
-- 2. Atomic Backend RPC for saving an event showcase (Draft / Published / Update)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.save_event_showcase_atomic(
  p_event_id UUID,
  p_payload JSONB DEFAULT '{}'::jsonb,
  p_owner_user_id UUID DEFAULT NULL,
  p_bypass_blocked_check BOOLEAN DEFAULT FALSE
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
  v_status TEXT;
  v_pub_status TEXT;
  v_title TEXT;
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

  -- Defense-in-depth: Verify organization association if passed in payload
  IF p_payload ? 'organization_id' AND (p_payload ->> 'organization_id')::uuid != v_event.organization_id THEN
    RAISE EXCEPTION 'Event does not belong to the specified organization' USING ERRCODE = 'P0006';
  END IF;

  -- Defense-in-depth: Verify event payment and lifecycle
  IF UPPER(COALESCE(v_event.payment_status, 'UNPAID')) != 'PAID' THEN
    RAISE EXCEPTION 'Showcase requires a confirmed, paid event.' USING ERRCODE = 'P0004';
  END IF;

  IF UPPER(COALESCE(v_event.event_status, 'DRAFT')) IN ('CANCELLED', 'EXPIRED')
     OR LOWER(COALESCE(v_event.status, 'draft')) IN ('cancelled', 'expired') THEN
    RAISE EXCEPTION 'Showcase is not available for cancelled or expired events.' USING ERRCODE = 'P0005';
  END IF;

  -- 2. Fetch organization to resolve owner
  SELECT id, owner_id
  INTO v_org
  FROM public.organizations
  WHERE id = v_event.organization_id;

  v_owner_id := COALESCE(
    p_owner_user_id,
    CASE WHEN p_payload ? 'owner_user_id' AND (p_payload ->> 'owner_user_id') IS NOT NULL THEN (p_payload ->> 'owner_user_id')::uuid ELSE NULL END,
    v_org.owner_id
  );

  -- 3. Lock existing showcase if present
  SELECT *
  INTO v_existing
  FROM public.event_showcases
  WHERE event_id = p_event_id
  FOR UPDATE;

  IF FOUND THEN
    -- Enforce moderation: BLOCKED showcase cannot be updated unless bypassed by administrator
    IF v_existing.status = 'BLOCKED' AND NOT p_bypass_blocked_check THEN
      RAISE EXCEPTION 'This showcase has been blocked by administrators and cannot be edited. Please contact support.' USING ERRCODE = 'P0003';
    END IF;

    -- Enforce DELETED showcase
    IF (v_existing.status = 'DELETED' OR v_existing.deleted_at IS NOT NULL) AND NOT p_bypass_blocked_check THEN
      RAISE EXCEPTION 'Event Showcase has been deleted' USING ERRCODE = 'P0007';
    END IF;

    -- Resolve status
    IF p_payload ? 'status' AND (p_payload ->> 'status') IS NOT NULL THEN
      v_status := p_payload ->> 'status';
    ELSE
      v_status := v_existing.status;
    END IF;

    IF p_payload ? 'publication_status' AND (p_payload ->> 'publication_status') IS NOT NULL THEN
      v_pub_status := p_payload ->> 'publication_status';
    ELSE
      v_pub_status := CASE WHEN v_status = 'PUBLISHED' THEN 'PUBLISHED' ELSE 'UNPUBLISHED' END;
    END IF;

    -- Update existing showcase with strict null semantics:
    -- Present key with null value clears the field. Omitted key preserves existing value.
    UPDATE public.event_showcases
    SET
      title = CASE
        WHEN p_payload ? 'title' AND NULLIF(TRIM(p_payload ->> 'title'), '') IS NOT NULL THEN TRIM(p_payload ->> 'title')
        ELSE v_existing.title
      END,
      description = CASE
        WHEN p_payload ? 'description' THEN NULLIF(TRIM(p_payload ->> 'description'), '')
        ELSE v_existing.description
      END,
      client_name = CASE
        WHEN p_payload ? 'client_name' THEN NULLIF(TRIM(p_payload ->> 'client_name'), '')
        ELSE v_existing.client_name
      END,
      client_logo_url = CASE
        WHEN p_payload ? 'client_logo_url' THEN NULLIF(TRIM(p_payload ->> 'client_logo_url'), '')
        ELSE v_existing.client_logo_url
      END,
      cover_image_url = CASE
        WHEN p_payload ? 'cover_image_url' THEN NULLIF(TRIM(p_payload ->> 'cover_image_url'), '')
        ELSE v_existing.cover_image_url
      END,
      status = v_status,
      publication_status = v_pub_status,
      review_status = CASE
        WHEN p_payload ? 'review_status' AND (p_payload ->> 'review_status') IS NOT NULL THEN (p_payload ->> 'review_status')::text
        ELSE v_existing.review_status
      END,
      reward_review_status = CASE
        WHEN p_payload ? 'reward_review_status' AND (p_payload ->> 'reward_review_status') IS NOT NULL THEN (p_payload ->> 'reward_review_status')::text
        ELSE v_existing.reward_review_status
      END,
      reward_reviewed_by = CASE
        WHEN p_payload ? 'reward_reviewed_by' THEN (p_payload ->> 'reward_reviewed_by')::uuid
        ELSE v_existing.reward_reviewed_by
      END,
      reward_reviewed_at = CASE
        WHEN p_payload ? 'reward_reviewed_at' THEN (p_payload ->> 'reward_reviewed_at')::timestamptz
        ELSE v_existing.reward_reviewed_at
      END,
      reward_rejection_reason = CASE
        WHEN p_payload ? 'reward_rejection_reason' THEN (p_payload ->> 'reward_rejection_reason')::text
        ELSE v_existing.reward_rejection_reason
      END,
      moderated_by = CASE
        WHEN p_payload ? 'moderated_by' THEN (p_payload ->> 'moderated_by')::uuid
        ELSE v_existing.moderated_by
      END,
      moderated_at = CASE
        WHEN p_payload ? 'moderated_at' THEN (p_payload ->> 'moderated_at')::timestamptz
        ELSE v_existing.moderated_at
      END,
      moderation_reason = CASE
        WHEN p_payload ? 'moderation_reason' THEN (p_payload ->> 'moderation_reason')::text
        ELSE v_existing.moderation_reason
      END,
      deleted_at = CASE
        WHEN p_payload ? 'deleted_at' THEN (p_payload ->> 'deleted_at')::timestamptz
        ELSE v_existing.deleted_at
      END,
      submitted_at = CASE
        WHEN p_payload ? 'submitted_at' THEN (p_payload ->> 'submitted_at')::timestamptz
        ELSE v_existing.submitted_at
      END,
      reviewed_at = CASE
        WHEN p_payload ? 'reviewed_at' THEN (p_payload ->> 'reviewed_at')::timestamptz
        ELSE v_existing.reviewed_at
      END,
      reviewed_by = CASE
        WHEN p_payload ? 'reviewed_by' THEN (p_payload ->> 'reviewed_by')::uuid
        ELSE v_existing.reviewed_by
      END,
      rejection_reason = CASE
        WHEN p_payload ? 'rejection_reason' THEN (p_payload ->> 'rejection_reason')::text
        ELSE v_existing.rejection_reason
      END,
      reward_transaction_id = CASE
        WHEN p_payload ? 'reward_transaction_id' THEN (p_payload ->> 'reward_transaction_id')::uuid
        ELSE v_existing.reward_transaction_id
      END,
      reward_granted_at = CASE
        WHEN p_payload ? 'reward_granted_at' THEN (p_payload ->> 'reward_granted_at')::timestamptz
        ELSE v_existing.reward_granted_at
      END,
      reward_status = CASE
        WHEN p_payload ? 'reward_status' AND (p_payload ->> 'reward_status') IS NOT NULL THEN (p_payload ->> 'reward_status')::text
        ELSE v_existing.reward_status
      END,
      published_at = CASE
        WHEN v_status = 'PUBLISHED' THEN COALESCE(v_existing.published_at, v_now)
        ELSE v_existing.published_at
      END,
      owner_user_id = COALESCE(v_existing.owner_user_id, v_owner_id),
      updated_at = v_now
    WHERE id = v_existing.id
    RETURNING * INTO v_showcase;

  ELSE
    -- Resolve initial status for new showcase
    IF p_payload ? 'status' AND (p_payload ->> 'status') IS NOT NULL THEN
      v_status := p_payload ->> 'status';
    ELSE
      v_status := 'PUBLISHED';
    END IF;

    IF p_payload ? 'publication_status' AND (p_payload ->> 'publication_status') IS NOT NULL THEN
      v_pub_status := p_payload ->> 'publication_status';
    ELSE
      v_pub_status := CASE WHEN v_status = 'PUBLISHED' THEN 'PUBLISHED' ELSE 'UNPUBLISHED' END;
    END IF;

    v_title := CASE
      WHEN p_payload ? 'title' AND NULLIF(TRIM(p_payload ->> 'title'), '') IS NOT NULL THEN TRIM(p_payload ->> 'title')
      ELSE COALESCE(NULLIF(TRIM(v_event.name), ''), 'Event Showcase')
    END;

    BEGIN
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
        v_title,
        CASE WHEN p_payload ? 'description' THEN NULLIF(TRIM(p_payload ->> 'description'), '') ELSE NULL END,
        CASE WHEN p_payload ? 'client_name' THEN NULLIF(TRIM(p_payload ->> 'client_name'), '') ELSE NULL END,
        CASE WHEN p_payload ? 'client_logo_url' THEN NULLIF(TRIM(p_payload ->> 'client_logo_url'), '') ELSE NULL END,
        CASE WHEN p_payload ? 'cover_image_url' THEN NULLIF(TRIM(p_payload ->> 'cover_image_url'), '') ELSE NULL END,
        v_status,
        COALESCE(p_payload ->> 'review_status', 'DRAFT'),
        v_pub_status,
        COALESCE(p_payload ->> 'reward_status', 'PENDING'),
        COALESCE(p_payload ->> 'reward_review_status', 'NOT_ELIGIBLE'),
        CASE WHEN v_status = 'PUBLISHED' THEN v_now ELSE NULL END,
        v_now,
        v_now
      )
      RETURNING * INTO v_showcase;
    EXCEPTION WHEN unique_violation THEN
      -- Handle concurrent race condition: fetch, lock, and update
      SELECT * INTO v_existing FROM public.event_showcases WHERE event_id = p_event_id FOR UPDATE;

      IF v_existing.status = 'BLOCKED' AND NOT p_bypass_blocked_check THEN
        RAISE EXCEPTION 'This showcase has been blocked by administrators and cannot be edited. Please contact support.' USING ERRCODE = 'P0003';
      END IF;

      UPDATE public.event_showcases
      SET
        title = CASE
          WHEN p_payload ? 'title' AND NULLIF(TRIM(p_payload ->> 'title'), '') IS NOT NULL THEN TRIM(p_payload ->> 'title')
          ELSE v_existing.title
        END,
        description = CASE
          WHEN p_payload ? 'description' THEN NULLIF(TRIM(p_payload ->> 'description'), '')
          ELSE v_existing.description
        END,
        client_name = CASE
          WHEN p_payload ? 'client_name' THEN NULLIF(TRIM(p_payload ->> 'client_name'), '')
          ELSE v_existing.client_name
        END,
        client_logo_url = CASE
          WHEN p_payload ? 'client_logo_url' THEN NULLIF(TRIM(p_payload ->> 'client_logo_url'), '')
          ELSE v_existing.client_logo_url
        END,
        cover_image_url = CASE
          WHEN p_payload ? 'cover_image_url' THEN NULLIF(TRIM(p_payload ->> 'cover_image_url'), '')
          ELSE v_existing.cover_image_url
        END,
        status = v_status,
        publication_status = v_pub_status,
        published_at = CASE
          WHEN v_status = 'PUBLISHED' THEN COALESCE(v_existing.published_at, v_now)
          ELSE v_existing.published_at
        END,
        owner_user_id = COALESCE(v_existing.owner_user_id, v_owner_id),
        updated_at = v_now
      WHERE id = v_existing.id
      RETURNING * INTO v_showcase;
    END;
  END IF;

  RETURN to_jsonb(v_showcase);
END;
$$;

-- Restrict execution to service_role and postgres
REVOKE EXECUTE ON FUNCTION public.save_event_showcase_atomic(UUID, JSONB, UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_event_showcase_atomic(UUID, JSONB, UUID, BOOLEAN) TO service_role, postgres;

-- ==============================================================================
-- 3. Atomic Backend RPC for publishing an event showcase under SECURITY DEFINER
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.publish_event_showcase_atomic(
  p_event_id UUID,
  p_payload JSONB DEFAULT '{}'::jsonb,
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
  v_title TEXT;
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

  -- Defense-in-depth: Verify event payment and lifecycle
  IF UPPER(COALESCE(v_event.payment_status, 'UNPAID')) != 'PAID' THEN
    RAISE EXCEPTION 'Showcase requires a confirmed, paid event.' USING ERRCODE = 'P0004';
  END IF;

  IF UPPER(COALESCE(v_event.event_status, 'DRAFT')) IN ('CANCELLED', 'EXPIRED')
     OR LOWER(COALESCE(v_event.status, 'draft')) IN ('cancelled', 'expired') THEN
    RAISE EXCEPTION 'Showcase is not available for cancelled or expired events.' USING ERRCODE = 'P0005';
  END IF;

  -- 2. Fetch organization to resolve owner
  SELECT id, owner_id
  INTO v_org
  FROM public.organizations
  WHERE id = v_event.organization_id;

  v_owner_id := COALESCE(
    p_owner_user_id,
    CASE WHEN p_payload ? 'owner_user_id' AND (p_payload ->> 'owner_user_id') IS NOT NULL THEN (p_payload ->> 'owner_user_id')::uuid ELSE NULL END,
    v_org.owner_id
  );

  -- 3. Check for existing showcase with row-lock
  SELECT *
  INTO v_existing
  FROM public.event_showcases
  WHERE event_id = p_event_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.status = 'BLOCKED' THEN
      RAISE EXCEPTION 'Cannot publish a blocked showcase. Please contact support.' USING ERRCODE = 'P0003';
    END IF;

    IF v_existing.status = 'DELETED' OR v_existing.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'Event Showcase has been deleted' USING ERRCODE = 'P0007';
    END IF;

    -- Strict null semantics:
    -- If key is present in p_payload and null/empty string, it clears the field to NULL.
    -- If key is omitted from p_payload, it preserves the existing value.
    UPDATE public.event_showcases
    SET
      title = CASE
        WHEN p_payload ? 'title' AND NULLIF(TRIM(p_payload ->> 'title'), '') IS NOT NULL THEN TRIM(p_payload ->> 'title')
        ELSE v_existing.title
      END,
      description = CASE
        WHEN p_payload ? 'description' THEN NULLIF(TRIM(p_payload ->> 'description'), '')
        ELSE v_existing.description
      END,
      client_name = CASE
        WHEN p_payload ? 'client_name' THEN NULLIF(TRIM(p_payload ->> 'client_name'), '')
        ELSE v_existing.client_name
      END,
      client_logo_url = CASE
        WHEN p_payload ? 'client_logo_url' THEN NULLIF(TRIM(p_payload ->> 'client_logo_url'), '')
        ELSE v_existing.client_logo_url
      END,
      cover_image_url = CASE
        WHEN p_payload ? 'cover_image_url' THEN NULLIF(TRIM(p_payload ->> 'cover_image_url'), '')
        ELSE v_existing.cover_image_url
      END,
      owner_user_id = COALESCE(v_existing.owner_user_id, v_owner_id),
      status = 'PUBLISHED',
      publication_status = 'PUBLISHED',
      published_at = COALESCE(v_existing.published_at, v_now),
      deleted_at = NULL,
      updated_at = v_now
    WHERE id = v_existing.id
    RETURNING * INTO v_showcase;

  ELSE
    v_title := CASE
      WHEN p_payload ? 'title' AND NULLIF(TRIM(p_payload ->> 'title'), '') IS NOT NULL THEN TRIM(p_payload ->> 'title')
      ELSE COALESCE(NULLIF(TRIM(v_event.name), ''), 'Event Showcase')
    END;

    BEGIN
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
        v_title,
        CASE WHEN p_payload ? 'description' THEN NULLIF(TRIM(p_payload ->> 'description'), '') ELSE NULL END,
        CASE WHEN p_payload ? 'client_name' THEN NULLIF(TRIM(p_payload ->> 'client_name'), '') ELSE NULL END,
        CASE WHEN p_payload ? 'client_logo_url' THEN NULLIF(TRIM(p_payload ->> 'client_logo_url'), '') ELSE NULL END,
        CASE WHEN p_payload ? 'cover_image_url' THEN NULLIF(TRIM(p_payload ->> 'cover_image_url'), '') ELSE NULL END,
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
    EXCEPTION WHEN unique_violation THEN
      -- Handle concurrent insert race condition gracefully
      SELECT * INTO v_existing FROM public.event_showcases WHERE event_id = p_event_id FOR UPDATE;
      IF v_existing.status = 'BLOCKED' THEN
        RAISE EXCEPTION 'Cannot publish a blocked showcase. Please contact support.' USING ERRCODE = 'P0003';
      END IF;

      UPDATE public.event_showcases
      SET
        title = CASE
          WHEN p_payload ? 'title' AND NULLIF(TRIM(p_payload ->> 'title'), '') IS NOT NULL THEN TRIM(p_payload ->> 'title')
          ELSE v_existing.title
        END,
        description = CASE
          WHEN p_payload ? 'description' THEN NULLIF(TRIM(p_payload ->> 'description'), '')
          ELSE v_existing.description
        END,
        client_name = CASE
          WHEN p_payload ? 'client_name' THEN NULLIF(TRIM(p_payload ->> 'client_name'), '')
          ELSE v_existing.client_name
        END,
        client_logo_url = CASE
          WHEN p_payload ? 'client_logo_url' THEN NULLIF(TRIM(p_payload ->> 'client_logo_url'), '')
          ELSE v_existing.client_logo_url
        END,
        cover_image_url = CASE
          WHEN p_payload ? 'cover_image_url' THEN NULLIF(TRIM(p_payload ->> 'cover_image_url'), '')
          ELSE v_existing.cover_image_url
        END,
        owner_user_id = COALESCE(v_existing.owner_user_id, v_owner_id),
        status = 'PUBLISHED',
        publication_status = 'PUBLISHED',
        published_at = COALESCE(v_existing.published_at, v_now),
        deleted_at = NULL,
        updated_at = v_now
      WHERE id = v_existing.id
      RETURNING * INTO v_showcase;
    END;
  END IF;

  RETURN to_jsonb(v_showcase);
END;
$$;

-- Overload publish_event_showcase_atomic for backward compatibility with positional parameters
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
  v_payload JSONB := '{}'::jsonb;
BEGIN
  IF p_title IS NOT NULL THEN
    v_payload := jsonb_set(v_payload, '{title}', to_jsonb(p_title));
  END IF;
  IF p_description IS NOT NULL THEN
    v_payload := jsonb_set(v_payload, '{description}', to_jsonb(p_description));
  END IF;
  IF p_client_name IS NOT NULL THEN
    v_payload := jsonb_set(v_payload, '{client_name}', to_jsonb(p_client_name));
  END IF;
  IF p_client_logo_url IS NOT NULL THEN
    v_payload := jsonb_set(v_payload, '{client_logo_url}', to_jsonb(p_client_logo_url));
  END IF;
  IF p_cover_image_url IS NOT NULL THEN
    v_payload := jsonb_set(v_payload, '{cover_image_url}', to_jsonb(p_cover_image_url));
  END IF;

  RETURN public.publish_event_showcase_atomic(p_event_id, v_payload, p_owner_user_id);
END;
$$;

-- Restrict execution to service_role and postgres
REVOKE EXECUTE ON FUNCTION public.publish_event_showcase_atomic(UUID, JSONB, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_event_showcase_atomic(UUID, JSONB, UUID) TO service_role, postgres;

REVOKE EXECUTE ON FUNCTION public.publish_event_showcase_atomic(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_event_showcase_atomic(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) TO service_role, postgres;

-- ==============================================================================
-- 4. Atomic Backend RPC for deleting an event showcase under SECURITY DEFINER
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.delete_event_showcase_atomic(
  p_event_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
BEGIN
  DELETE FROM public.event_showcases WHERE event_id = p_event_id;
  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_event_showcase_atomic(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_event_showcase_atomic(UUID) TO service_role, postgres;
