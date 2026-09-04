-- Migration: 20260904030000_events_backend_write_only.sql
-- Description: Make public.events backend-write-only to eliminate direct client mutation risks via Supabase RLS.
--              Drops client INSERT, UPDATE, DELETE policies on public.events.
--              Revokes INSERT, UPDATE, DELETE privileges on public.events from authenticated and anon roles.
--              Preserves SELECT policy for organization members.
--              Installs defense-in-depth trigger to prevent unauthorized client writes and safeguard sensitive columns:
--              payment_status, event_status, status, paid_amount, discount_amount, event_price, payment_mode, cancel_reason.

-- 1. Drop vulnerable client write policies on public.events
DROP POLICY IF EXISTS "Owners, admins, designers can insert events" ON public.events;
DROP POLICY IF EXISTS "Owners, admins, designers can update events" ON public.events;
DROP POLICY IF EXISTS "Owners and admins can delete events" ON public.events;

-- 2. Ensure only SELECT policy remains for organization members
DROP POLICY IF EXISTS "Members can view organization events" ON public.events;
CREATE POLICY "Members can view organization events"
  ON public.events FOR SELECT
  USING (public.is_org_member(organization_id) OR public.is_developer_admin());

-- 3. Revoke direct table-level mutation privileges from client roles
REVOKE INSERT, UPDATE, DELETE ON public.events FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.events FROM anon;

-- Explicitly ensure SELECT is allowed for authenticated and anon users subject to RLS
GRANT SELECT ON public.events TO authenticated;
GRANT SELECT ON public.events TO anon;

-- 4. Defense-in-depth trigger function to block any direct client mutation and protect sensitive columns
CREATE OR REPLACE FUNCTION public.prevent_event_unauthorized_client_mutations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role text;
  v_uid text;
BEGIN
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

  -- Block any mutation attempt originating from client roles (authenticated or anon)
  IF v_role IN ('authenticated', 'anon') OR (v_uid IS NOT NULL AND (v_role IS NULL OR v_role != 'service_role')) THEN
    RAISE EXCEPTION 'Direct client mutation on events is strictly prohibited. All event operations must be routed through the server API.';
  END IF;

  -- Defense-in-depth: Even if role check is bypassed, safeguard critical columns
  IF TG_OP = 'UPDATE' THEN
    IF v_role IS DISTINCT FROM 'service_role' THEN
      IF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
        RAISE EXCEPTION 'Direct update of payment_status is strictly prohibited';
      END IF;
      IF NEW.event_status IS DISTINCT FROM OLD.event_status THEN
        RAISE EXCEPTION 'Direct update of event_status is strictly prohibited';
      END IF;
      IF NEW.status IS DISTINCT FROM OLD.status THEN
        RAISE EXCEPTION 'Direct update of status is strictly prohibited';
      END IF;
      IF NEW.paid_amount IS DISTINCT FROM OLD.paid_amount THEN
        RAISE EXCEPTION 'Direct update of paid_amount is strictly prohibited';
      END IF;
      IF NEW.discount_amount IS DISTINCT FROM OLD.discount_amount THEN
        RAISE EXCEPTION 'Direct update of discount_amount is strictly prohibited';
      END IF;
      IF NEW.event_price IS DISTINCT FROM OLD.event_price THEN
        RAISE EXCEPTION 'Direct update of event_price is strictly prohibited';
      END IF;
      IF NEW.payment_mode IS DISTINCT FROM OLD.payment_mode THEN
        RAISE EXCEPTION 'Direct update of payment_mode is strictly prohibited';
      END IF;
      IF NEW.cancel_reason IS DISTINCT FROM OLD.cancel_reason THEN
        RAISE EXCEPTION 'Direct update of cancel_reason is strictly prohibited';
      END IF;
      IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
        RAISE EXCEPTION 'Direct update of organization_id is strictly prohibited';
      END IF;
      IF NEW.public_token IS DISTINCT FROM OLD.public_token THEN
        RAISE EXCEPTION 'Direct update of public_token is strictly prohibited';
      END IF;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    IF v_role IS DISTINCT FROM 'service_role' THEN
      IF UPPER(COALESCE(NEW.payment_status, '')) = 'PAID' OR UPPER(COALESCE(NEW.event_status, '')) = 'LIVE' OR LOWER(COALESCE(NEW.status, '')) = 'live' THEN
        RAISE EXCEPTION 'Direct insert of PAID or LIVE event is strictly prohibited';
      END IF;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF v_role IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'Direct client deletion of events is strictly prohibited';
    END IF;
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_event_unauthorized_client_mutations ON public.events;
CREATE TRIGGER trg_prevent_event_unauthorized_client_mutations
  BEFORE INSERT OR UPDATE OR DELETE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_event_unauthorized_client_mutations();
