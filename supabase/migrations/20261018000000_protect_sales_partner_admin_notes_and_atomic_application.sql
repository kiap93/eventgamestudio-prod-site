-- Migration: 20261018000000_protect_sales_partner_admin_notes_and_atomic_application.sql
-- Description: 
--   1. Protect administrator-only information by isolating private admin notes into
--      a separate restricted table (sales_partner_admin_notes) with Developer Admin RLS.
--   2. Drop admin_notes from sales_partner_profiles so ordinary users/partners cannot
--      read private administrator notes via direct PostgREST/Supabase queries.
--   3. Create atomic RPC create_sales_partner_application_atomic for profile creation
--      and initial APPLIED audit log insertion in a single PostgreSQL transaction.
--   4. Update update_sales_partner_status_atomic to store admin notes in the isolated table.
--   5. Strengthen least privilege: explicitly revoke mutations on sales tables from non-admins.

-- ==============================================================================
-- 1. ISOLATE PRIVATE ADMINISTRATOR NOTES IN DEDICATED RESTRICTED TABLE
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.sales_partner_admin_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_user_id UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  admin_notes TEXT NOT NULL,
  updated_by UUID REFERENCES public.users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT unique_sales_partner_admin_notes UNIQUE (partner_user_id)
);

CREATE INDEX IF NOT EXISTS idx_sales_partner_admin_notes_user ON public.sales_partner_admin_notes (partner_user_id);

-- Enable Row-Level Security
ALTER TABLE public.sales_partner_admin_notes ENABLE ROW LEVEL SECURITY;

-- Developer Admins ONLY can view admin notes
DROP POLICY IF EXISTS "Developer admins view sales partner admin notes" ON public.sales_partner_admin_notes;
CREATE POLICY "Developer admins view sales partner admin notes"
  ON public.sales_partner_admin_notes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.is_developer = true
    )
  );

-- Developer Admins ONLY can insert, update, or delete admin notes
DROP POLICY IF EXISTS "Developer admins manage sales partner admin notes" ON public.sales_partner_admin_notes;
CREATE POLICY "Developer admins manage sales partner admin notes"
  ON public.sales_partner_admin_notes
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.is_developer = true
    )
  );

-- Revoke all direct client privileges from public / anon / authenticated
REVOKE ALL ON public.sales_partner_admin_notes FROM anon;
REVOKE ALL ON public.sales_partner_admin_notes FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_partner_admin_notes TO authenticated; -- Enforced by RLS
GRANT ALL ON public.sales_partner_admin_notes TO service_role;

-- ==============================================================================
-- 2. SAFE BACKFILL AND MIGRATION OF EXISTING NOTES
-- ==============================================================================

-- Step A: If legacy applicant details still exist in admin_notes, safely extract them
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'sales_partner_profiles' AND column_name = 'admin_notes'
  ) THEN
    -- Extract agency_name and application_notes if present in admin_notes
    UPDATE public.sales_partner_profiles
    SET
      agency_name = CASE
        WHEN agency_name IS NULL AND admin_notes LIKE '%Agency / Organization:%' THEN
          substring(admin_notes FROM 'Agency / Organization:\s*([^|]+)')
        ELSE agency_name
      END,
      application_notes = CASE
        WHEN application_notes IS NULL AND admin_notes LIKE '%Applicant Notes:%' THEN
          substring(admin_notes FROM 'Applicant Notes:\s*(.*)')
        WHEN application_notes IS NULL AND status = 'pending' AND admin_notes NOT LIKE '%Agency / Organization:%' AND admin_notes NOT LIKE '%[Admin]%' THEN
          admin_notes
        ELSE application_notes
      END
    WHERE admin_notes IS NOT NULL AND (agency_name IS NULL OR application_notes IS NULL);

    -- Step B: Migrate genuine administrator notes to sales_partner_admin_notes
    INSERT INTO public.sales_partner_admin_notes (partner_user_id, admin_notes)
    SELECT user_id, admin_notes
    FROM public.sales_partner_profiles
    WHERE admin_notes IS NOT NULL
      AND trim(admin_notes) <> ''
      AND admin_notes NOT LIKE 'Agency / Organization:%'
      AND admin_notes <> 'Self-applied as agent'
      AND admin_notes <> 'Pending review'
    ON CONFLICT (partner_user_id) DO UPDATE SET
      admin_notes = EXCLUDED.admin_notes,
      updated_at = timezone('utc'::text, now());

    -- Step C: Drop admin_notes column from sales_partner_profiles so no user can query it via PostgREST
    ALTER TABLE public.sales_partner_profiles DROP COLUMN IF EXISTS admin_notes;
  END IF;
END $$;

-- ==============================================================================
-- 3. DEFENSE-IN-DEPTH: STRENGTHEN TAMPERING TRIGGER & ACCESS CONTROLS
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.prevent_sales_partner_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Prevent modifying primary key or user_id foreign key
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Sales partner profile ID is immutable';
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Sales partner user ID is immutable';
  END IF;

  -- Block status or commission rate alterations by non-service-role clients
  IF NEW.status IS DISTINCT FROM OLD.status OR
     NEW.custom_commission_rate IS DISTINCT FROM OLD.custom_commission_rate OR
     NEW.first_order_commission_rate IS DISTINCT FROM OLD.first_order_commission_rate OR
     NEW.repeat_order_commission_rate IS DISTINCT FROM OLD.repeat_order_commission_rate THEN
    IF (auth.role() = 'authenticated' OR auth.role() = 'anon') OR (auth.uid() IS NOT NULL AND auth.role() != 'service_role') THEN
      IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.is_developer = true) THEN
        RAISE EXCEPTION 'Privilege escalation rejected: modifying sales partner status or commission rates requires developer-admin authority';
      END IF;
    END IF;
  END IF;

  -- Maintain updated_at timestamp
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_sales_partner_tampering ON public.sales_partner_profiles;
CREATE TRIGGER trg_prevent_sales_partner_tampering
  BEFORE UPDATE ON public.sales_partner_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_sales_partner_tampering();

-- Explicitly revoke write access on opportunities, commissions, and payout tables
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sales_opportunities') THEN
    REVOKE INSERT, UPDATE, DELETE ON public.sales_opportunities FROM authenticated;
    REVOKE INSERT, UPDATE, DELETE ON public.sales_opportunities FROM anon;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sales_commissions') THEN
    REVOKE INSERT, UPDATE, DELETE ON public.sales_commissions FROM authenticated;
    REVOKE INSERT, UPDATE, DELETE ON public.sales_commissions FROM anon;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sales_payout_batches') THEN
    REVOKE INSERT, UPDATE, DELETE ON public.sales_payout_batches FROM authenticated;
    REVOKE INSERT, UPDATE, DELETE ON public.sales_payout_batches FROM anon;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sales_commission_audit_logs') THEN
    REVOKE INSERT, UPDATE, DELETE ON public.sales_commission_audit_logs FROM authenticated;
    REVOKE INSERT, UPDATE, DELETE ON public.sales_commission_audit_logs FROM anon;
  END IF;
END $$;

-- ==============================================================================
-- 4. ATOMIC APPLICATION CREATION AND AUDIT LOGGING RPC
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.create_sales_partner_application_atomic(
  p_user_id UUID,
  p_agency_name TEXT DEFAULT NULL,
  p_application_notes TEXT DEFAULT NULL,
  p_actor_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_existing RECORD;
  v_new_profile RECORD;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
  v_audit_reason TEXT;
  v_actor UUID := COALESCE(p_actor_user_id, p_user_id);
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User ID is required to apply for Sales Partner';
  END IF;

  -- Validate length constraints
  IF p_agency_name IS NOT NULL AND length(p_agency_name) > 150 THEN
    RAISE EXCEPTION 'Agency name cannot exceed 150 characters';
  END IF;
  IF p_application_notes IS NOT NULL AND length(p_application_notes) > 1000 THEN
    RAISE EXCEPTION 'Application details cannot exceed 1,000 characters';
  END IF;

  -- Check if profile already exists using row lock
  SELECT * INTO v_existing
  FROM public.sales_partner_profiles
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'already_exists', true,
      'profile', to_jsonb(v_existing)
    );
  END IF;

  -- Insert profile
  INSERT INTO public.sales_partner_profiles (
    user_id,
    status,
    applied_at,
    activated_at,
    suspended_at,
    agency_name,
    application_notes,
    created_at,
    updated_at
  ) VALUES (
    p_user_id,
    'pending',
    v_now,
    NULL,
    NULL,
    p_agency_name,
    p_application_notes,
    v_now,
    v_now
  )
  RETURNING * INTO v_new_profile;

  -- Build audit reason
  IF p_agency_name IS NOT NULL AND trim(p_agency_name) <> '' THEN
    v_audit_reason := 'Sales Partner application submitted (' || trim(p_agency_name) || ')';
  ELSE
    v_audit_reason := 'Sales Partner application submitted';
  END IF;

  -- Insert audit log in same atomic transaction
  INSERT INTO public.sales_partner_audit_logs (
    partner_user_id,
    sales_partner_id,
    previous_status,
    new_status,
    action,
    actor_user_id,
    reason,
    metadata,
    created_at
  ) VALUES (
    p_user_id,
    v_new_profile.id,
    NULL,
    'pending',
    'APPLIED',
    v_actor,
    v_audit_reason,
    jsonb_build_object(
      'agency_name', p_agency_name,
      'application_notes', p_application_notes
    ),
    v_now
  );

  RETURN jsonb_build_object(
    'already_exists', false,
    'profile', to_jsonb(v_new_profile)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_sales_partner_application_atomic(UUID, TEXT, TEXT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_sales_partner_application_atomic(UUID, TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_sales_partner_application_atomic(UUID, TEXT, TEXT, UUID) TO service_role;

-- ==============================================================================
-- 5. UPDATE ATOMIC STATUS PROCEDURE TO USE ISOLATED ADMIN NOTES TABLE
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.update_sales_partner_status_atomic(
  p_user_id UUID,
  p_status TEXT,
  p_admin_notes TEXT DEFAULT NULL,
  p_actor_user_id UUID DEFAULT NULL,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_profile RECORD;
  v_prev_status TEXT;
  v_action TEXT;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
  v_admin_notes TEXT := NULL;
BEGIN
  IF p_status NOT IN ('pending', 'active', 'suspended', 'rejected') THEN
    RAISE EXCEPTION 'Invalid status: %', p_status;
  END IF;

  SELECT * INTO v_profile
  FROM public.sales_partner_profiles
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sales partner profile not found for user %', p_user_id;
  END IF;

  v_prev_status := v_profile.status;

  IF (p_status IN ('suspended', 'rejected') OR (v_prev_status IN ('suspended', 'rejected') AND p_status = 'active')) AND (p_reason IS NULL OR trim(p_reason) = '') THEN
    RAISE EXCEPTION 'A non-empty reason is required for consequential status changes';
  END IF;

  IF v_prev_status = 'pending' AND p_status = 'active' THEN
    v_action := 'ACTIVATED';
  ELSIF (v_prev_status = 'suspended' OR v_prev_status = 'rejected') AND p_status = 'active' THEN
    v_action := 'REACTIVATED';
  ELSIF p_status = 'suspended' THEN
    v_action := 'SUSPENDED';
  ELSIF p_status = 'rejected' THEN
    v_action := 'REJECTED';
  ELSE
    v_action := 'UPDATED';
  END IF;

  -- Update profile status and timestamps
  UPDATE public.sales_partner_profiles
  SET
    status = p_status,
    activated_at = CASE WHEN p_status = 'active' AND activated_at IS NULL THEN v_now ELSE activated_at END,
    suspended_at = CASE WHEN p_status = 'suspended' THEN v_now WHEN p_status = 'active' THEN NULL ELSE suspended_at END,
    updated_at = v_now
  WHERE user_id = p_user_id;

  -- Store private admin notes in dedicated restricted table
  IF p_admin_notes IS NOT NULL THEN
    INSERT INTO public.sales_partner_admin_notes (partner_user_id, admin_notes, updated_by, updated_at)
    VALUES (p_user_id, p_admin_notes, p_actor_user_id, v_now)
    ON CONFLICT (partner_user_id) DO UPDATE SET
      admin_notes = EXCLUDED.admin_notes,
      updated_by = EXCLUDED.updated_by,
      updated_at = v_now;
  END IF;

  -- Retrieve current admin notes
  SELECT admin_notes INTO v_admin_notes
  FROM public.sales_partner_admin_notes
  WHERE partner_user_id = p_user_id;

  -- Insert audit log
  INSERT INTO public.sales_partner_audit_logs (
    partner_user_id,
    sales_partner_id,
    previous_status,
    new_status,
    action,
    actor_user_id,
    reason,
    metadata,
    created_at
  ) VALUES (
    p_user_id,
    v_profile.id,
    v_prev_status,
    p_status,
    v_action,
    p_actor_user_id,
    COALESCE(p_reason, p_admin_notes, 'Status updated'),
    jsonb_build_object('admin_notes', p_admin_notes),
    v_now
  );

  SELECT * INTO v_profile FROM public.sales_partner_profiles WHERE user_id = p_user_id;
  RETURN jsonb_build_object(
    'id', v_profile.id,
    'user_id', v_profile.user_id,
    'status', v_profile.status,
    'applied_at', v_profile.applied_at,
    'activated_at', v_profile.activated_at,
    'suspended_at', v_profile.suspended_at,
    'agency_name', v_profile.agency_name,
    'application_notes', v_profile.application_notes,
    'admin_notes', v_admin_notes,
    'custom_commission_rate', v_profile.custom_commission_rate,
    'first_order_commission_rate', v_profile.first_order_commission_rate,
    'repeat_order_commission_rate', v_profile.repeat_order_commission_rate,
    'created_at', v_profile.created_at,
    'updated_at', v_profile.updated_at
  );
END;
$$;
