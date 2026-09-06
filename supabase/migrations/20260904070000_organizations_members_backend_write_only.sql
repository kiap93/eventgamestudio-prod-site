-- Migration: 20260904070000_organizations_members_backend_write_only.sql
-- Description: Make public.organizations, public.organization_members, and public.organization_invitations
--              backend-write-only to eliminate direct client mutation risks via Supabase RLS.
--              - Drops client INSERT, UPDATE, DELETE policies on organizations, organization_members, and organization_invitations.
--              - Revokes INSERT, UPDATE, DELETE privileges from authenticated and anon roles on all three tables.
--              - Preserves SELECT policies for tenant members and developer admins.
--              - Installs defense-in-depth triggers to prevent unauthorized client writes and safeguard critical columns.

-- ==============================================================================
-- 1. DROP VULNERABLE CLIENT WRITE POLICIES
-- ==============================================================================

-- Organizations write policies
DROP POLICY IF EXISTS "Authenticated users can create organizations" ON public.organizations;
DROP POLICY IF EXISTS "Owners and admins can update organization" ON public.organizations;
DROP POLICY IF EXISTS "Owners and admins can delete organization" ON public.organizations;

-- Organization members write policies
DROP POLICY IF EXISTS "Owners and admins can manage members" ON public.organization_members;
DROP POLICY IF EXISTS "Owners and admins can update member roles" ON public.organization_members;
DROP POLICY IF EXISTS "Owners and admins can remove members" ON public.organization_members;

-- Organization invitations write policies
DROP POLICY IF EXISTS "Owners and admins can create invitations" ON public.organization_invitations;
DROP POLICY IF EXISTS "Owners and admins can delete invitations" ON public.organization_invitations;
DROP POLICY IF EXISTS "Owners and admins can update invitations" ON public.organization_invitations;

-- ==============================================================================
-- 2. ENSURE STRICT SELECT POLICIES REMAIN FOR TENANT MEMBERS & DEVELOPER ADMINS
-- ==============================================================================

-- Organizations SELECT policy
DROP POLICY IF EXISTS "Members can view their organizations" ON public.organizations;
CREATE POLICY "Members can view their organizations"
  ON public.organizations FOR SELECT
  USING (public.is_org_member(id) OR public.is_developer_admin());

-- Organization members SELECT policy
DROP POLICY IF EXISTS "Members can view organization members" ON public.organization_members;
CREATE POLICY "Members can view organization members"
  ON public.organization_members FOR SELECT
  USING (public.is_org_member(organization_id) OR public.is_developer_admin());

-- Organization invitations SELECT policy
DROP POLICY IF EXISTS "Members can view invitations" ON public.organization_invitations;
CREATE POLICY "Members can view invitations"
  ON public.organization_invitations FOR SELECT
  USING (public.is_org_member(organization_id) OR public.is_developer_admin());

-- ==============================================================================
-- 3. REVOKE DIRECT TABLE-LEVEL MUTATION PRIVILEGES FROM CLIENT ROLES
-- ==============================================================================

-- Organizations
REVOKE INSERT, UPDATE, DELETE ON public.organizations FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.organizations FROM anon;
GRANT SELECT ON public.organizations TO authenticated;
GRANT SELECT ON public.organizations TO anon;

-- Organization members
REVOKE INSERT, UPDATE, DELETE ON public.organization_members FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.organization_members FROM anon;
GRANT SELECT ON public.organization_members TO authenticated;
GRANT SELECT ON public.organization_members TO anon;

-- Organization invitations
REVOKE INSERT, UPDATE, DELETE ON public.organization_invitations FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.organization_invitations FROM anon;
GRANT SELECT ON public.organization_invitations TO authenticated;
GRANT SELECT ON public.organization_invitations TO anon;

-- ==============================================================================
-- 4. DEFENSE-IN-DEPTH TRIGGERS BLOCKING DIRECT CLIENT MUTATIONS
-- ==============================================================================

-- 4a. Trigger Function for public.organizations
CREATE OR REPLACE FUNCTION public.prevent_organization_unauthorized_client_mutations()
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
    RAISE EXCEPTION 'Direct client mutation on organizations is strictly prohibited. All organization operations must be routed through the server API.';
  END IF;

  -- Safeguard critical columns: enforce database-level immutability on owner_id and id
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'Direct update of organization id is strictly prohibited';
    END IF;
    IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
      RAISE EXCEPTION 'Direct update of organization owner_id is strictly prohibited. Organization ownership cannot be changed directly.';
    END IF;
    IF NEW.slug IS DISTINCT FROM OLD.slug THEN
      RAISE EXCEPTION 'Direct update of organization slug is strictly prohibited';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    IF v_role IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'Direct client creation of organizations is strictly prohibited';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF v_role IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'Direct client deletion of organizations is strictly prohibited';
    END IF;
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_organization_unauthorized_client_mutations ON public.organizations;
CREATE TRIGGER trg_prevent_organization_unauthorized_client_mutations
  BEFORE INSERT OR UPDATE OR DELETE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_organization_unauthorized_client_mutations();

-- 4b. Trigger Function for public.organization_members
CREATE OR REPLACE FUNCTION public.prevent_organization_member_unauthorized_client_mutations()
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
    END IF;
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
    RAISE EXCEPTION 'Direct client mutation on organization_members is strictly prohibited. All membership operations must be routed through the server API.';
  END IF;

  -- Defense-in-depth: safeguard critical membership columns
  IF TG_OP = 'UPDATE' THEN
    IF v_role IS DISTINCT FROM 'service_role' THEN
      IF NEW.role IS DISTINCT FROM OLD.role THEN
        RAISE EXCEPTION 'Direct update of member role is strictly prohibited';
      END IF;
      IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
        RAISE EXCEPTION 'Direct update of member user_id is strictly prohibited';
      END IF;
      IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
        RAISE EXCEPTION 'Direct update of member organization_id is strictly prohibited';
      END IF;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    IF v_role IS DISTINCT FROM 'service_role' THEN
      IF NEW.role IN ('owner', 'admin') THEN
        RAISE EXCEPTION 'Direct creation of owner or admin membership is strictly prohibited';
      END IF;
      RAISE EXCEPTION 'Direct client creation of organization_members is strictly prohibited';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF v_role IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'Direct client deletion of organization_members is strictly prohibited';
    END IF;
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_organization_member_unauthorized_client_mutations ON public.organization_members;
CREATE TRIGGER trg_prevent_organization_member_unauthorized_client_mutations
  BEFORE INSERT OR UPDATE OR DELETE ON public.organization_members
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_organization_member_unauthorized_client_mutations();

-- 4c. Trigger Function for public.organization_invitations
CREATE OR REPLACE FUNCTION public.prevent_organization_invitation_unauthorized_client_mutations()
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
    RAISE EXCEPTION 'Direct client mutation on organization_invitations is strictly prohibited. All invitation operations must be routed through the server API.';
  END IF;

  -- Defense-in-depth: safeguard critical invitation columns
  IF TG_OP = 'UPDATE' THEN
    IF v_role IS DISTINCT FROM 'service_role' THEN
      IF NEW.role IS DISTINCT FROM OLD.role THEN
        RAISE EXCEPTION 'Direct update of invitation role is strictly prohibited';
      END IF;
      IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
        RAISE EXCEPTION 'Direct update of invitation organization_id is strictly prohibited';
      END IF;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    IF v_role IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'Direct client creation of organization_invitations is strictly prohibited';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF v_role IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'Direct client deletion of organization_invitations is strictly prohibited';
    END IF;
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_organization_invitation_unauthorized_client_mutations ON public.organization_invitations;
CREATE TRIGGER trg_prevent_organization_invitation_unauthorized_client_mutations
  BEFORE INSERT OR UPDATE OR DELETE ON public.organization_invitations
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_organization_invitation_unauthorized_client_mutations();
