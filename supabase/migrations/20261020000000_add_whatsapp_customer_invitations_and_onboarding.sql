-- ==============================================================================
-- Migration: 20261020000000_add_whatsapp_customer_invitations_and_onboarding.sql
-- Description: Adds WhatsApp invitation support, contact phone numbers,
--              organization linking, and onboarding funnel tracking for
--              customer invitations.
-- ==============================================================================

-- 1. Extend customer_companies with organization link and lead status
ALTER TABLE public.customer_companies
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS lead_status TEXT NOT NULL DEFAULT 'lead'
    CHECK (lead_status IN ('lead', 'invited', 'onboarding', 'active', 'dormant'));

CREATE INDEX IF NOT EXISTS idx_customer_companies_org_id ON public.customer_companies(organization_id);
CREATE INDEX IF NOT EXISTS idx_customer_companies_lead_status ON public.customer_companies(lead_status);

-- 2. Extend customer_company_recipients with phone, channel, WhatsApp tracking, and notes
ALTER TABLE public.customer_company_recipients
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'both'
    CHECK (channel IN ('email', 'whatsapp', 'both')),
  ADD COLUMN IF NOT EXISTS invitation_id UUID REFERENCES public.organization_invitations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS whatsapp_status TEXT NOT NULL DEFAULT 'never_sent'
    CHECK (whatsapp_status IN ('never_sent', 'initiated', 'delivered', 'read', 'failed')),
  ADD COLUMN IF NOT EXISTS whatsapp_initiated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS whatsapp_message_text TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_error TEXT,
  ADD COLUMN IF NOT EXISTS accepted_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE INDEX IF NOT EXISTS idx_customer_recipients_phone ON public.customer_company_recipients(phone);
CREATE INDEX IF NOT EXISTS idx_customer_recipients_channel ON public.customer_company_recipients(channel);
CREATE INDEX IF NOT EXISTS idx_customer_recipients_invitation_id ON public.customer_company_recipients(invitation_id);
CREATE INDEX IF NOT EXISTS idx_customer_recipients_whatsapp_status ON public.customer_company_recipients(whatsapp_status);

-- 3. Extend organization_invitations with phone, channel, WhatsApp status, and company references
ALTER TABLE public.organization_invitations
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'email'
    CHECK (channel IN ('email', 'whatsapp', 'both')),
  ADD COLUMN IF NOT EXISTS invitation_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (invitation_status IN ('pending', 'accepted', 'expired', 'revoked')),
  ADD COLUMN IF NOT EXISTS whatsapp_status TEXT NOT NULL DEFAULT 'never_sent'
    CHECK (whatsapp_status IN ('never_sent', 'initiated', 'delivered', 'read', 'failed')),
  ADD COLUMN IF NOT EXISTS whatsapp_initiated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS accepted_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS customer_company_id UUID REFERENCES public.customer_companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS customer_recipient_id UUID REFERENCES public.customer_company_recipients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE INDEX IF NOT EXISTS idx_org_invitations_phone ON public.organization_invitations(phone);
CREATE INDEX IF NOT EXISTS idx_org_invitations_status ON public.organization_invitations(invitation_status);
CREATE INDEX IF NOT EXISTS idx_org_invitations_company_id ON public.organization_invitations(customer_company_id);
CREATE INDEX IF NOT EXISTS idx_org_invitations_recipient_id ON public.organization_invitations(customer_recipient_id);

-- 4. Extend customer_invitation_logs to record channel
ALTER TABLE public.customer_invitation_logs
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'email'
    CHECK (channel IN ('email', 'whatsapp'));

CREATE INDEX IF NOT EXISTS idx_customer_invitation_logs_channel ON public.customer_invitation_logs(channel);

-- 5. Atomic function: Record WhatsApp invitation initiation
CREATE OR REPLACE FUNCTION public.record_whatsapp_invitation_initiation_atomic(
  p_company_id UUID,
  p_recipient_id UUID,
  p_invitation_id UUID,
  p_phone TEXT,
  p_message_text TEXT,
  p_sent_by_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
  v_rec public.customer_company_recipients%ROWTYPE;
  v_log_id UUID := gen_random_uuid();
BEGIN
  -- 1. Verify recipient exists
  SELECT * INTO v_rec
  FROM public.customer_company_recipients
  WHERE id = p_recipient_id AND company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recipient not found in company';
  END IF;

  -- 2. Update recipient status to initiated (NOT delivered/read)
  UPDATE public.customer_company_recipients
  SET
    phone = COALESCE(NULLIF(TRIM(p_phone), ''), phone),
    invitation_id = p_invitation_id,
    whatsapp_status = 'initiated',
    whatsapp_initiated_at = v_now,
    whatsapp_message_text = p_message_text,
    invitation_count = invitation_count + 1,
    last_invited_at = v_now,
    last_invitation_status = 'sent',
    last_invitation_error = NULL,
    updated_at = v_now
  WHERE id = p_recipient_id;

  -- 3. Update organization invitation if present
  IF p_invitation_id IS NOT NULL THEN
    UPDATE public.organization_invitations
    SET
      phone = COALESCE(NULLIF(TRIM(p_phone), ''), phone),
      whatsapp_status = 'initiated',
      whatsapp_initiated_at = v_now,
      customer_company_id = p_company_id,
      customer_recipient_id = p_recipient_id
    WHERE id = p_invitation_id;
  END IF;

  -- 4. Record audit log
  INSERT INTO public.customer_invitation_logs (
    id,
    company_id,
    recipient_id,
    email,
    subject,
    provider,
    provider_message_id,
    status,
    error_message,
    sent_by_user_id,
    channel,
    created_at
  ) VALUES (
    v_log_id,
    p_company_id,
    p_recipient_id,
    v_rec.email,
    'WhatsApp Invitation (Initiated)',
    'whatsapp_web',
    NULL,
    'sent',
    NULL,
    p_sent_by_user_id,
    'whatsapp',
    v_now
  );

  -- 5. Update company lead status to 'invited'
  UPDATE public.customer_companies
  SET
    lead_status = CASE WHEN lead_status = 'lead' THEN 'invited' ELSE lead_status END,
    updated_at = v_now
  WHERE id = p_company_id;

  RETURN jsonb_build_object(
    'success', true,
    'recipient_id', p_recipient_id,
    'invitation_id', p_invitation_id,
    'initiated_at', v_now
  );
END;
$$;
