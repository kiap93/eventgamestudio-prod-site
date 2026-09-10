-- Migration: 20260906010000_event_showcases_backend_write_only.sql
-- Description: Make public.event_showcases backend-write-only to eliminate direct client mutation risks via Supabase RLS.
--              - Drops client INSERT, UPDATE, DELETE policies on public.event_showcases.
--              - Revokes INSERT, UPDATE, DELETE privileges on public.event_showcases from authenticated and anon roles.
--              - Explicitly grants SELECT to authenticated and anon (enforced via RLS).
--              - Grants ALL privileges on public.event_showcases to service_role and postgres.
--              - Preserves strict SELECT policy for public published showcases, organization members, and developer admins.
--              - Installs defense-in-depth trigger to prevent unauthorized client writes and safeguard critical columns:
--                review_status, reward_status, reward_transaction_id, reward_granted_at,
--                reward_review_status, reward_reviewed_by, reward_reviewed_at, reward_rejection_reason,
--                publication_status, published_at, status, moderated_by, moderated_at, moderation_reason,
--                deleted_at, organization_id, event_id.

-- ==============================================================================
-- 1. DROP VULNERABLE CLIENT WRITE POLICIES ON public.event_showcases
-- ==============================================================================

DROP POLICY IF EXISTS "Owners, admins, designers can insert event showcases" ON public.event_showcases;
DROP POLICY IF EXISTS "Owners, admins, designers can update event showcases" ON public.event_showcases;
DROP POLICY IF EXISTS "Owners and admins can delete event showcases" ON public.event_showcases;
DROP POLICY IF EXISTS "Anyone can insert event showcases" ON public.event_showcases;
DROP POLICY IF EXISTS "Anyone can update event showcases" ON public.event_showcases;
DROP POLICY IF EXISTS "Anyone can delete event showcases" ON public.event_showcases;

-- ==============================================================================
-- 2. ENSURE STRICT SELECT POLICY REMAINS ACTIVE
-- ==============================================================================

DROP POLICY IF EXISTS "Anyone can view published showcases or org members" ON public.event_showcases;
DROP POLICY IF EXISTS "Public can view active published showcases" ON public.event_showcases;

CREATE POLICY "Public can view active published showcases"
  ON public.event_showcases FOR SELECT
  USING (
    (status = 'PUBLISHED' AND deleted_at IS NULL)
    OR (public.is_org_member(organization_id) AND deleted_at IS NULL)
    OR public.is_developer_admin()
  );

-- ==============================================================================
-- 3. REVOKE DIRECT TABLE-LEVEL MUTATION PRIVILEGES FROM CLIENT ROLES
-- ==============================================================================

REVOKE INSERT, UPDATE, DELETE ON public.event_showcases FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.event_showcases FROM anon;

-- Explicitly ensure SELECT is allowed for authenticated and anon users subject to RLS
GRANT SELECT ON public.event_showcases TO authenticated;
GRANT SELECT ON public.event_showcases TO anon;

-- Backend execution roles retain full permissions
GRANT ALL ON public.event_showcases TO service_role;
GRANT ALL ON public.event_showcases TO postgres;

-- ==============================================================================
-- 4. DEFENSE-IN-DEPTH TRIGGER BLOCKING DIRECT CLIENT MUTATIONS
-- ==============================================================================

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

  -- Retrieve auth context from Supabase JWT claims
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

DROP TRIGGER IF EXISTS trg_prevent_event_showcase_unauthorized_client_mutations ON public.event_showcases;
CREATE TRIGGER trg_prevent_event_showcase_unauthorized_client_mutations
  BEFORE INSERT OR UPDATE OR DELETE ON public.event_showcases
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_event_showcase_unauthorized_client_mutations();
