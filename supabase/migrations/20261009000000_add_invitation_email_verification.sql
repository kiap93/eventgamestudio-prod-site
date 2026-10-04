-- ==============================================================================
-- Migration: 20261009000000_add_invitation_email_verification.sql
-- Description: Adds single-use email verification code columns to public.organization_invitations
--              allowing invited users from all email providers (Outlook, Hotmail,
--              Yahoo, custom domains, etc.) to securely verify email ownership and accept invitations.
-- ==============================================================================

ALTER TABLE public.organization_invitations
  ADD COLUMN IF NOT EXISTS email_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_error TEXT,
  ADD COLUMN IF NOT EXISTS verification_code_hash TEXT,
  ADD COLUMN IF NOT EXISTS verification_code_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verification_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_code_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_org_invitations_verification_code_hash 
  ON public.organization_invitations (verification_code_hash) 
  WHERE verification_code_hash IS NOT NULL;
