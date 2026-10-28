-- ==============================================================================
-- Migration: 20261028000000_add_organization_last_login_tracking.sql
-- Description: Adds last successful login tracking for users and organizations.
--              Includes atomic RPC to record user and member-organization logins.
-- ==============================================================================

-- 1. Add last_login_at to public.users
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

-- 2. Add last_login_at and last_login_user_id to public.organizations
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_login_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

-- 3. Create high-performance indexes for sorting and filtering
CREATE INDEX IF NOT EXISTS idx_users_last_login_at ON public.users(last_login_at DESC);
CREATE INDEX IF NOT EXISTS idx_organizations_last_login_at ON public.organizations(last_login_at DESC);
CREATE INDEX IF NOT EXISTS idx_organizations_last_login_user_id ON public.organizations(last_login_user_id);

-- 4. Create atomic RPC to record user login and propagate to affiliated organizations
CREATE OR REPLACE FUNCTION public.record_user_and_organization_login(
  p_user_id UUID,
  p_login_time TIMESTAMPTZ DEFAULT clock_timestamp()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_effective_time TIMESTAMPTZ := COALESCE(p_login_time, clock_timestamp());
  v_updated_orgs_count INT := 0;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User ID is required');
  END IF;

  -- Update public.users last_login_at
  UPDATE public.users
  SET
    last_login_at = v_effective_time,
    updated_at = v_effective_time
  WHERE id = p_user_id;

  -- Update organizations where user is owner or an active member
  WITH target_orgs AS (
    SELECT DISTINCT o.id AS org_id
    FROM public.organizations o
    LEFT JOIN public.organization_members om ON om.organization_id = o.id
    WHERE o.owner_id = p_user_id OR om.user_id = p_user_id
  )
  UPDATE public.organizations o
  SET
    last_login_at = v_effective_time,
    last_login_user_id = p_user_id,
    updated_at = v_effective_time
  FROM target_orgs
  WHERE o.id = target_orgs.org_id;

  GET DIAGNOSTICS v_updated_orgs_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'last_login_at', v_effective_time,
    'organizations_updated', v_updated_orgs_count
  );
END;
$$;

-- 5. Grant execute privileges
GRANT EXECUTE ON FUNCTION public.record_user_and_organization_login(UUID, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_user_and_organization_login(UUID, TIMESTAMPTZ) TO authenticated;
