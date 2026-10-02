-- ============================================================================
-- Migration: 20261008000000_create_customer_invitations.sql
-- Description: Create prospective customer companies, recipients, and invitation
--              audit logs for the Admin Customer Invitation Management system.
-- ============================================================================

-- 1. Prospective Customer Companies Table
CREATE TABLE IF NOT EXISTS public.customer_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  contact_person TEXT,
  notes TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_companies_name ON public.customer_companies(company_name);
CREATE INDEX IF NOT EXISTS idx_customer_companies_created_at ON public.customer_companies(created_at DESC);

-- 2. Customer Company Recipients Table (1 company -> multiple recipients)
CREATE TABLE IF NOT EXISTS public.customer_company_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.customer_companies(id) ON DELETE CASCADE,
  recipient_name TEXT,
  email TEXT NOT NULL,
  invitation_count INT NOT NULL DEFAULT 0,
  last_invited_at TIMESTAMPTZ,
  last_invitation_status TEXT NOT NULL DEFAULT 'never_invited' CHECK (last_invitation_status IN ('never_invited', 'sent', 'failed')),
  last_invitation_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_customer_recipient_company_email UNIQUE(company_id, email)
);

CREATE INDEX IF NOT EXISTS idx_customer_company_recipients_company ON public.customer_company_recipients(company_id);
CREATE INDEX IF NOT EXISTS idx_customer_company_recipients_email ON public.customer_company_recipients(email);
CREATE INDEX IF NOT EXISTS idx_customer_company_recipients_status ON public.customer_company_recipients(last_invitation_status);

-- 3. Customer Invitation Logs (Audit trail of every invitation sent)
CREATE TABLE IF NOT EXISTS public.customer_invitation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.customer_companies(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES public.customer_company_recipients(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  subject TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'resend',
  provider_message_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
  error_message TEXT,
  sent_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_invitation_logs_company ON public.customer_invitation_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_customer_invitation_logs_recipient ON public.customer_invitation_logs(recipient_id);
CREATE INDEX IF NOT EXISTS idx_customer_invitation_logs_created_at ON public.customer_invitation_logs(created_at DESC);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.customer_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_company_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_invitation_logs ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies: Exclusive to authenticated developer administrators
CREATE POLICY "Developer admins can manage customer companies"
  ON public.customer_companies
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.is_developer = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.is_developer = true
    )
  );

CREATE POLICY "Developer admins can manage customer company recipients"
  ON public.customer_company_recipients
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.is_developer = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.is_developer = true
    )
  );

CREATE POLICY "Developer admins can view customer invitation logs"
  ON public.customer_invitation_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.is_developer = true
    )
  );

CREATE POLICY "Developer admins can insert customer invitation logs"
  ON public.customer_invitation_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.is_developer = true
    )
  );
