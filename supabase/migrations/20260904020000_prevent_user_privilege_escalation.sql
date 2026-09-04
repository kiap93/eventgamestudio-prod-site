-- Migration: 20260904020000_prevent_user_privilege_escalation.sql
-- Description: Revoke direct UPDATE on public.users from authenticated and anon roles.
--              Drop vulnerable "Users can update own user record" RLS policy to prevent
--              privilege escalation to Developer Admin (is_developer = true).
--              Enforce defense-in-depth trigger to block any unauthorized alteration of
--              is_developer or user identification columns.

-- 1. Drop vulnerable UPDATE policy on public.users
DROP POLICY IF EXISTS "Users can update own user record" ON public.users;

-- 2. Revoke table-level UPDATE privileges from client roles
REVOKE UPDATE ON public.users FROM authenticated;
REVOKE UPDATE ON public.users FROM anon;

-- Ensure authenticated and anon users can still read user records subject to SELECT RLS
GRANT SELECT ON public.users TO authenticated;
GRANT SELECT ON public.users TO anon;

-- 3. Defense-in-depth trigger: Block any direct mutation of is_developer or immutable fields
CREATE OR REPLACE FUNCTION public.prevent_user_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Prevent modifying primary key
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'User ID is immutable';
  END IF;

  -- Block email alterations via direct client updates (emails are managed via verified OAuth)
  IF NEW.email IS DISTINCT FROM OLD.email AND (auth.role() = 'authenticated' OR auth.role() = 'anon') THEN
    RAISE EXCEPTION 'User email cannot be modified directly';
  END IF;

  -- Block privilege escalation: is_developer cannot be altered by non-service-role clients
  IF NEW.is_developer IS DISTINCT FROM OLD.is_developer THEN
    IF (auth.role() = 'authenticated' OR auth.role() = 'anon') OR (auth.uid() IS NOT NULL AND auth.role() != 'service_role') THEN
      RAISE EXCEPTION 'Privilege escalation rejected: modifying is_developer is strictly prohibited';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_user_privilege_escalation ON public.users;
CREATE TRIGGER trg_prevent_user_privilege_escalation
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_user_privilege_escalation();
