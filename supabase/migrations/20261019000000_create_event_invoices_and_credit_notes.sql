-- ==============================================================================
-- Migration: 20261019000000_create_event_invoices_and_credit_notes.sql
-- Description: Automatic Invoice Generation, Credit Notes, and Audit Logging
-- Architecture: Multi-tenant isolated, backend-authoritative billing engine
-- ==============================================================================

-- 1. Invoices Table
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number VARCHAR(50) UNIQUE NOT NULL,
  event_id UUID UNIQUE NOT NULL REFERENCES public.events(id) ON DELETE RESTRICT,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  customer_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'unpaid'
    CHECK (status IN ('unpaid', 'partially_paid', 'paid', 'overdue', 'void', 'cancelled')),
  currency VARCHAR(10) NOT NULL DEFAULT 'MYR',
  subtotal NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  discount_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  welcome_credit_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  tax_rate NUMERIC(5, 4) NOT NULL DEFAULT 0.0000,
  tax_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  total_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  amount_paid NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  outstanding_balance NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  issue_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  due_date TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '14 days'),
  seller_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  customer_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  event_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  line_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  pdf_path VARCHAR(500),
  pdf_status VARCHAR(30) NOT NULL DEFAULT 'pending'
    CHECK (pdf_status IN ('pending', 'generated', 'failed')),
  pdf_generated_at TIMESTAMPTZ,
  email_status VARCHAR(30) NOT NULL DEFAULT 'pending'
    CHECK (email_status IN ('pending', 'sent', 'failed', 'skipped')),
  email_sent_at TIMESTAMPTZ,
  email_error TEXT,
  payment_reference VARCHAR(255),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Credit Notes Table
CREATE TABLE IF NOT EXISTS public.credit_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_note_number VARCHAR(50) UNIQUE NOT NULL,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE RESTRICT,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  currency VARCHAR(10) NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  reason TEXT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'issued'
    CHECK (status IN ('issued', 'applied', 'void')),
  issued_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Invoice Audit Logs Table
CREATE TABLE IF NOT EXISTS public.invoice_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  action VARCHAR(50) NOT NULL,
  actor_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  actor_email VARCHAR(255),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Performance & Look-up Indexes
CREATE INDEX IF NOT EXISTS idx_invoices_event_id ON public.invoices(event_id);
CREATE INDEX IF NOT EXISTS idx_invoices_organization_id ON public.invoices(organization_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number ON public.invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_issue_date ON public.invoices(issue_date);
CREATE INDEX IF NOT EXISTS idx_credit_notes_invoice_id ON public.credit_notes(invoice_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_organization_id ON public.credit_notes(organization_id);
CREATE INDEX IF NOT EXISTS idx_invoice_audit_logs_invoice_id ON public.invoice_audit_logs(invoice_id);

-- 5. Row Level Security (RLS)
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_audit_logs ENABLE ROW LEVEL SECURITY;

-- Organization members can read their own invoices
CREATE POLICY "org_members_read_invoices" ON public.invoices
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

-- Organization members can read their own credit notes
CREATE POLICY "org_members_read_credit_notes" ON public.credit_notes
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

-- Backend Write Only: Revoke direct mutation from authenticated and anon clients
REVOKE INSERT, UPDATE, DELETE ON public.invoices FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.credit_notes FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.invoice_audit_logs FROM anon, authenticated;

-- 6. Atomic Sequences & Numbering Procedures
CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS public.credit_note_number_seq START WITH 1 INCREMENT BY 1;

CREATE OR REPLACE FUNCTION public.next_invoice_number(p_year INT DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next_val BIGINT;
BEGIN
  v_next_val := nextval('public.invoice_number_seq');
  RETURN 'INV-' || p_year::TEXT || '-' || LPAD(v_next_val::TEXT, 5, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.next_credit_note_number(p_year INT DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next_val BIGINT;
BEGIN
  v_next_val := nextval('public.credit_note_number_seq');
  RETURN 'CN-' || p_year::TEXT || '-' || LPAD(v_next_val::TEXT, 5, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_invoice_number(INT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.next_credit_note_number(INT) TO authenticated, service_role;

