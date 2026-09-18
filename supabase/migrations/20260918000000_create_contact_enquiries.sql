-- ============================================================================
-- Migration: 20260918000000_create_contact_enquiries.sql
-- Description: Create contact_enquiries table for persistent event enquiries
--              and agency messages with Gmail delivery tracking.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.contact_enquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  company TEXT,
  category TEXT NOT NULL DEFAULT 'General enquiry',
  event_date DATE,
  expected_attendees TEXT,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_review', 'contacted', 'resolved', 'archived')),
  email_status TEXT NOT NULL DEFAULT 'pending' CHECK (email_status IN ('pending', 'sent', 'failed', 'not_configured')),
  email_sent_at TIMESTAMPTZ,
  email_error TEXT,
  email_message_id TEXT,
  recipient_email TEXT NOT NULL DEFAULT 'eventgamestudio@gmail.com',
  idempotency_key TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_enquiries_ticket_id ON public.contact_enquiries(ticket_id);
CREATE INDEX IF NOT EXISTS idx_contact_enquiries_email ON public.contact_enquiries(email);
CREATE INDEX IF NOT EXISTS idx_contact_enquiries_created_at ON public.contact_enquiries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_enquiries_idempotency_key ON public.contact_enquiries(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_contact_enquiries_email_status ON public.contact_enquiries(email_status);

-- Enable RLS
ALTER TABLE public.contact_enquiries ENABLE ROW LEVEL SECURITY;

-- Allow authenticated developer admins to view and update enquiries
CREATE POLICY "Developer admins can view contact enquiries"
  ON public.contact_enquiries
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.is_developer = true
    )
  );

CREATE POLICY "Developer admins can update contact enquiries"
  ON public.contact_enquiries
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.is_developer = true
    )
  );
