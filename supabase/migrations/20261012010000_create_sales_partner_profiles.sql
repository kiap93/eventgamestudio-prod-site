-- Migration: 20261012010000_create_sales_partner_profiles.sql
-- Description: Create dedicated sales_partner_profiles table linked to public.users.
--              Implements separate platform-level capability for Sales Partners
--              with strict status lifecycle, RLS policies, and defense-in-depth triggers.

-- 1. Create sales_partner_profiles table
CREATE TABLE IF NOT EXISTS public.sales_partner_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended', 'rejected')),
  applied_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  activated_at TIMESTAMPTZ,
  suspended_at TIMESTAMPTZ,
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT unique_sales_partner_user UNIQUE (user_id)
);

-- 2. Indexes for efficient lookup by user and status filtering
CREATE INDEX IF NOT EXISTS idx_sales_partner_profiles_user_id ON public.sales_partner_profiles (user_id);
CREATE INDEX IF NOT EXISTS idx_sales_partner_profiles_status ON public.sales_partner_profiles (status);

-- 3. Enable Row-Level Security
ALTER TABLE public.sales_partner_profiles ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
-- Users can view their own sales partner profile
DROP POLICY IF EXISTS "Users can view own sales partner profile" ON public.sales_partner_profiles;
CREATE POLICY "Users can view own sales partner profile"
  ON public.sales_partner_profiles
  FOR SELECT
  USING (auth.uid() = user_id);

-- Developer admins can view all sales partner profiles
DROP POLICY IF EXISTS "Developer admins can view all sales partner profiles" ON public.sales_partner_profiles;
CREATE POLICY "Developer admins can view all sales partner profiles"
  ON public.sales_partner_profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.is_developer = true
    )
  );

-- 5. Revoke direct client write access (least privilege)
REVOKE INSERT, UPDATE, DELETE ON public.sales_partner_profiles FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.sales_partner_profiles FROM anon;

GRANT SELECT ON public.sales_partner_profiles TO authenticated;
GRANT SELECT ON public.sales_partner_profiles TO anon;
GRANT ALL ON public.sales_partner_profiles TO service_role;

-- 6. Defense-in-depth trigger: prevent client-side tampering and maintain updated_at
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

  -- Block status alterations by non-service-role clients
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF (auth.role() = 'authenticated' OR auth.role() = 'anon') OR (auth.uid() IS NOT NULL AND auth.role() != 'service_role') THEN
      RAISE EXCEPTION 'Privilege escalation rejected: modifying sales partner status requires service-role / developer-admin authority';
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
