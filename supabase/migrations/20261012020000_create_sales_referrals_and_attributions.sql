-- Migration: 20261012020000_create_sales_referrals_and_attributions.sql
-- Description: Phase 4 — Sales referrals, customer attribution, ownership,
--              duplicate prevention, and audit history.

-- 1. Create sales_referral_codes table
CREATE TABLE IF NOT EXISTS public.sales_referral_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_partner_id UUID NOT NULL REFERENCES public.sales_partner_profiles (id) ON DELETE CASCADE,
  partner_user_id UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_sales_referral_codes_partner ON public.sales_referral_codes (sales_partner_id);
CREATE INDEX IF NOT EXISTS idx_sales_referral_codes_user ON public.sales_referral_codes (partner_user_id);
CREATE INDEX IF NOT EXISTS idx_sales_referral_codes_code ON public.sales_referral_codes (code);

-- 2. Create customer_attributions table
CREATE TABLE IF NOT EXISTS public.customer_attributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_partner_id UUID NOT NULL REFERENCES public.sales_partner_profiles (id) ON DELETE RESTRICT,
  partner_user_id UUID NOT NULL REFERENCES public.users (id) ON DELETE RESTRICT,
  referral_code TEXT NOT NULL,
  referral_method TEXT NOT NULL DEFAULT 'link' CHECK (referral_method IN ('link', 'code', 'admin_lead', 'direct')),
  prospect_email TEXT,
  referred_user_id UUID REFERENCES public.users (id) ON DELETE SET NULL,
  organization_id UUID REFERENCES public.organizations (id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'reassigned', 'needs_review')),
  is_self_referral BOOLEAN NOT NULL DEFAULT false,
  is_existing_customer BOOLEAN NOT NULL DEFAULT false,
  is_competing_claim BOOLEAN NOT NULL DEFAULT false,
  competing_attribution_id UUID REFERENCES public.customer_attributions (id) ON DELETE SET NULL,
  review_reason TEXT,
  decision_reason TEXT,
  decided_by_user_id UUID REFERENCES public.users (id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  established_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Crucial: Guarantee at most ONE approved attribution per customer organization
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_approved_org_attribution
  ON public.customer_attributions (organization_id)
  WHERE status = 'approved' AND organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customer_attributions_partner ON public.customer_attributions (sales_partner_id);
CREATE INDEX IF NOT EXISTS idx_customer_attributions_user ON public.customer_attributions (partner_user_id);
CREATE INDEX IF NOT EXISTS idx_customer_attributions_referred_user ON public.customer_attributions (referred_user_id);
CREATE INDEX IF NOT EXISTS idx_customer_attributions_org ON public.customer_attributions (organization_id);
CREATE INDEX IF NOT EXISTS idx_customer_attributions_email ON public.customer_attributions (prospect_email);
CREATE INDEX IF NOT EXISTS idx_customer_attributions_status ON public.customer_attributions (status);
CREATE INDEX IF NOT EXISTS idx_customer_attributions_code ON public.customer_attributions (referral_code);

-- 3. Create customer_attribution_audit_logs table
CREATE TABLE IF NOT EXISTS public.customer_attribution_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attribution_id UUID NOT NULL REFERENCES public.customer_attributions (id) ON DELETE CASCADE,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  previous_partner_id UUID,
  new_partner_id UUID,
  action TEXT NOT NULL CHECK (action IN ('CREATED', 'APPROVED', 'REJECTED', 'REASSIGNED', 'FLAGGED_REVIEW', 'ORG_LINKED')),
  reason TEXT,
  actor_user_id UUID REFERENCES public.users (id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_attribution_audit_attribution ON public.customer_attribution_audit_logs (attribution_id);
CREATE INDEX IF NOT EXISTS idx_attribution_audit_created ON public.customer_attribution_audit_logs (created_at);

-- 4. Enable Row Level Security
ALTER TABLE public.sales_referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_attributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_attribution_audit_logs ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
-- sales_referral_codes
DROP POLICY IF EXISTS "Partners view own referral codes" ON public.sales_referral_codes;
CREATE POLICY "Partners view own referral codes"
  ON public.sales_referral_codes
  FOR SELECT
  USING (auth.uid() = partner_user_id);

DROP POLICY IF EXISTS "Developer admins view all referral codes" ON public.sales_referral_codes;
CREATE POLICY "Developer admins view all referral codes"
  ON public.sales_referral_codes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.is_developer = true
    )
  );

-- customer_attributions
DROP POLICY IF EXISTS "Partners view own attributions" ON public.customer_attributions;
CREATE POLICY "Partners view own attributions"
  ON public.customer_attributions
  FOR SELECT
  USING (auth.uid() = partner_user_id);

DROP POLICY IF EXISTS "Developer admins view all attributions" ON public.customer_attributions;
CREATE POLICY "Developer admins view all attributions"
  ON public.customer_attributions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.is_developer = true
    )
  );

-- customer_attribution_audit_logs
DROP POLICY IF EXISTS "Developer admins view all attribution audit logs" ON public.customer_attribution_audit_logs;
CREATE POLICY "Developer admins view all attribution audit logs"
  ON public.customer_attribution_audit_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.is_developer = true
    )
  );

-- 6. Revoke direct client write access (backend API service-role authority only)
REVOKE INSERT, UPDATE, DELETE ON public.sales_referral_codes FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.sales_referral_codes FROM anon;
GRANT SELECT ON public.sales_referral_codes TO authenticated;
GRANT SELECT ON public.sales_referral_codes TO anon;
GRANT ALL ON public.sales_referral_codes TO service_role;

REVOKE INSERT, UPDATE, DELETE ON public.customer_attributions FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.customer_attributions FROM anon;
GRANT SELECT ON public.customer_attributions TO authenticated;
GRANT ALL ON public.customer_attributions TO service_role;

REVOKE INSERT, UPDATE, DELETE ON public.customer_attribution_audit_logs FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.customer_attribution_audit_logs FROM anon;
GRANT SELECT ON public.customer_attribution_audit_logs TO authenticated;
GRANT ALL ON public.customer_attribution_audit_logs TO service_role;

-- 7. Defense-in-depth trigger: prevent client-side status tampering on customer_attributions
CREATE OR REPLACE FUNCTION public.prevent_customer_attribution_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Customer attribution ID is immutable';
  END IF;

  IF (auth.role() = 'authenticated' OR auth.role() = 'anon') AND auth.role() != 'service_role' THEN
    IF NEW.status IS DISTINCT FROM OLD.status OR NEW.sales_partner_id IS DISTINCT FROM OLD.sales_partner_id THEN
      RAISE EXCEPTION 'Privilege escalation rejected: altering attribution status or partner requires service-role / developer-admin authority';
    END IF;
  END IF;

  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_customer_attribution_tampering ON public.customer_attributions;
CREATE TRIGGER trg_prevent_customer_attribution_tampering
  BEFORE UPDATE ON public.customer_attributions
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_customer_attribution_tampering();
