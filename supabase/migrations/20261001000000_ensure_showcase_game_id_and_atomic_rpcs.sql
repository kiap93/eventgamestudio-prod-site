-- Migration: 20261001000000_ensure_showcase_game_id_and_atomic_rpcs.sql
-- Description: Ensure game_id on public.event_showcases is nullable, backfilled,
--              and populated atomically in publish_event_showcase_atomic and save_event_showcase_atomic.

-- 1. Ensure column game_id exists and is nullable on public.event_showcases
ALTER TABLE public.event_showcases ADD COLUMN IF NOT EXISTS game_id UUID REFERENCES public.games(id) ON DELETE SET NULL;
ALTER TABLE public.event_showcases ALTER COLUMN game_id DROP NOT NULL;
CREATE INDEX IF NOT EXISTS idx_event_showcases_game_id ON public.event_showcases (game_id);

-- 2. Backfill game_id on existing event_showcases from parent events or their game themes
UPDATE public.event_showcases es
SET game_id = COALESCE(
  e.game_id,
  gt.game_id,
  (SELECT id FROM public.games WHERE is_system = true ORDER BY created_at ASC LIMIT 1)
)
FROM public.events e
LEFT JOIN public.game_themes gt ON gt.id = e.game_theme_id
WHERE es.event_id = e.id AND es.game_id IS NULL;

-- 3. Atomic Backend RPC for saving an event showcase draft under SECURITY DEFINER
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
  v_game_id UUID;
  v_status TEXT;
  v_pub_status TEXT;
  v_title TEXT;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
BEGIN
  -- 1. Fetch event
  SELECT id, organization_id, game_id, game_theme_id, name, payment_status, event_status, status, start_date, end_date
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

  -- Resolve game_id from event, event's theme, payload, or canonical system game
  v_game_id := COALESCE(
    v_event.game_id,
    (SELECT game_id FROM public.game_themes WHERE id = v_event.game_theme_id),
    CASE WHEN p_payload ? 'game_id' AND (p_payload ->> 'game_id') IS NOT NULL THEN (p_payload ->> 'game_id')::uuid ELSE NULL END,
    (SELECT id FROM public.games WHERE is_system = true ORDER BY created_at ASC LIMIT 1)
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
      game_id = COALESCE(v_existing.game_id, v_game_id),
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
        game_id,
        owner_user_id,
        created_by,
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
        v_game_id,
        v_owner_id,
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
        game_id = COALESCE(v_existing.game_id, v_game_id),
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

-- 4. Atomic Backend RPC for publishing an event showcase under SECURITY DEFINER
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
  v_game_id UUID;
  v_title TEXT;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
BEGIN
  -- 1. Fetch event
  SELECT id, organization_id, game_id, game_theme_id, name, payment_status, event_status, status, start_date, end_date
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

  -- Resolve game_id from event, event's theme, payload, or canonical system game
  v_game_id := COALESCE(
    v_event.game_id,
    (SELECT game_id FROM public.game_themes WHERE id = v_event.game_theme_id),
    CASE WHEN p_payload ? 'game_id' AND (p_payload ->> 'game_id') IS NOT NULL THEN (p_payload ->> 'game_id')::uuid ELSE NULL END,
    (SELECT id FROM public.games WHERE is_system = true ORDER BY created_at ASC LIMIT 1)
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
      game_id = COALESCE(v_existing.game_id, v_game_id),
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
        game_id,
        owner_user_id,
        created_by,
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
        v_game_id,
        v_owner_id,
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
      SELECT * INTO v_existing FROM public.event_showcases WHERE event_id = p_event_id FOR UPDATE;

      IF v_existing.status = 'BLOCKED' THEN
        RAISE EXCEPTION 'Cannot publish a blocked showcase. Please contact support.' USING ERRCODE = 'P0003';
      END IF;

      IF v_existing.status = 'DELETED' OR v_existing.deleted_at IS NOT NULL THEN
        RAISE EXCEPTION 'Event Showcase has been deleted' USING ERRCODE = 'P0007';
      END IF;

      UPDATE public.event_showcases
      SET
        game_id = COALESCE(v_existing.game_id, v_game_id),
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
