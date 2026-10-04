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

-- 6. Atomic Customer Company & Recipients Creation Procedure
CREATE OR REPLACE FUNCTION public.create_customer_company_atomic(
  p_company_name TEXT,
  p_contact_person TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_created_by UUID DEFAULT NULL,
  p_recipients JSONB DEFAULT '[]'::jsonb,
  p_company_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company_id UUID;
  v_created_by UUID := NULL;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
  v_comp public.customer_companies%ROWTYPE;
  v_recipient_elem JSONB;
  v_recipient_email TEXT;
  v_recipient_name TEXT;
  v_recipient_id UUID;
  v_inserted_recipients JSONB := '[]'::jsonb;
  v_recipient_row public.customer_company_recipients%ROWTYPE;
  v_seen_emails TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- 1. Input validations
  IF p_company_name IS NULL OR TRIM(p_company_name) = '' THEN
    RAISE EXCEPTION 'Company name is required';
  END IF;

  IF p_recipients IS NULL OR jsonb_array_length(p_recipients) = 0 THEN
    RAISE EXCEPTION 'At least one recipient email address is required';
  END IF;

  v_company_id := COALESCE(p_company_id, gen_random_uuid());

  -- Safely verify created_by references an existing user; if not found, store NULL to avoid foreign key failure
  IF p_created_by IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.users WHERE id = p_created_by) THEN
      v_created_by := p_created_by;
    END IF;
  END IF;

  -- 2. Insert company
  INSERT INTO public.customer_companies (
    id,
    company_name,
    contact_person,
    notes,
    created_by,
    created_at,
    updated_at
  ) VALUES (
    v_company_id,
    TRIM(p_company_name),
    NULLIF(TRIM(p_contact_person), ''),
    NULLIF(TRIM(p_notes), ''),
    v_created_by,
    v_now,
    v_now
  )
  RETURNING * INTO v_comp;

  -- 3. Insert recipients atomically
  FOR v_recipient_elem IN SELECT * FROM jsonb_array_elements(p_recipients)
  LOOP
    v_recipient_email := LOWER(TRIM(v_recipient_elem->>'email'));
    v_recipient_name := NULLIF(TRIM(v_recipient_elem->>'recipient_name'), '');
    
    IF v_recipient_email IS NULL OR v_recipient_email = '' THEN
      CONTINUE;
    END IF;

    -- Validate email syntax
    IF v_recipient_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN
      RAISE EXCEPTION 'Invalid recipient email address: %', v_recipient_elem->>'email';
    END IF;

    -- Deduplicate within company
    IF v_recipient_email = ANY(v_seen_emails) THEN
      CONTINUE;
    END IF;
    v_seen_emails := array_append(v_seen_emails, v_recipient_email);

    v_recipient_id := CASE 
      WHEN v_recipient_elem->>'id' IS NOT NULL AND (v_recipient_elem->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN (v_recipient_elem->>'id')::uuid
      ELSE gen_random_uuid()
    END;

    INSERT INTO public.customer_company_recipients (
      id,
      company_id,
      recipient_name,
      email,
      invitation_count,
      last_invited_at,
      last_invitation_status,
      last_invitation_error,
      created_at,
      updated_at
    ) VALUES (
      v_recipient_id,
      v_company_id,
      v_recipient_name,
      v_recipient_email,
      0,
      NULL,
      'never_invited',
      NULL,
      v_now,
      v_now
    )
    RETURNING * INTO v_recipient_row;

    v_inserted_recipients := v_inserted_recipients || jsonb_build_array(to_jsonb(v_recipient_row));
  END LOOP;

  IF jsonb_array_length(v_inserted_recipients) = 0 THEN
    RAISE EXCEPTION 'At least one valid recipient email address is required';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'company', to_jsonb(v_comp),
    'recipients', v_inserted_recipients
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_customer_company_atomic(TEXT, TEXT, TEXT, UUID, JSONB, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_customer_company_atomic(TEXT, TEXT, TEXT, UUID, JSONB, UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_customer_company_atomic(TEXT, TEXT, TEXT, UUID, JSONB, UUID) TO service_role;

-- 7. Atomic Customer Company & Recipients Update Procedure
CREATE OR REPLACE FUNCTION public.update_customer_company_atomic(
  p_company_id UUID,
  p_company_name TEXT DEFAULT NULL,
  p_contact_person TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_recipients JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
  v_comp public.customer_companies%ROWTYPE;
  v_recipient_elem JSONB;
  v_recipient_email TEXT;
  v_recipient_name TEXT;
  v_recipient_id UUID;
  v_inserted_recipients JSONB := '[]'::jsonb;
  v_recipient_row public.customer_company_recipients%ROWTYPE;
  v_seen_emails TEXT[] := ARRAY[]::TEXT[];
  v_keep_ids UUID[] := ARRAY[]::UUID[];
BEGIN
  -- 1. Check company existence with row lock
  SELECT * INTO v_comp
  FROM public.customer_companies
  WHERE id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer company not found';
  END IF;

  -- 2. Validate company_name if provided
  IF p_company_name IS NOT NULL AND TRIM(p_company_name) = '' THEN
    RAISE EXCEPTION 'Company name cannot be empty';
  END IF;

  -- 3. Update company fields
  UPDATE public.customer_companies
  SET
    company_name = COALESCE(NULLIF(TRIM(p_company_name), ''), company_name),
    contact_person = CASE WHEN p_contact_person IS NOT NULL THEN NULLIF(TRIM(p_contact_person), '') ELSE contact_person END,
    notes = CASE WHEN p_notes IS NOT NULL THEN NULLIF(TRIM(p_notes), '') ELSE notes END,
    updated_at = v_now
  WHERE id = p_company_id
  RETURNING * INTO v_comp;

  -- 4. Reconcile recipients if provided
  IF p_recipients IS NOT NULL THEN
    IF jsonb_array_length(p_recipients) = 0 THEN
      RAISE EXCEPTION 'At least one recipient email address is required';
    END IF;

    FOR v_recipient_elem IN SELECT * FROM jsonb_array_elements(p_recipients)
    LOOP
      v_recipient_email := LOWER(TRIM(v_recipient_elem->>'email'));
      v_recipient_name := NULLIF(TRIM(v_recipient_elem->>'recipient_name'), '');

      IF v_recipient_email IS NULL OR v_recipient_email = '' THEN
        CONTINUE;
      END IF;

      IF v_recipient_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN
        RAISE EXCEPTION 'Invalid recipient email address: %', v_recipient_elem->>'email';
      END IF;

      IF v_recipient_email = ANY(v_seen_emails) THEN
        CONTINUE;
      END IF;
      v_seen_emails := array_append(v_seen_emails, v_recipient_email);

      -- Check if recipient already exists by ID or email for this company
      v_recipient_id := NULL;
      IF v_recipient_elem->>'id' IS NOT NULL AND (v_recipient_elem->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
        SELECT id INTO v_recipient_id
        FROM public.customer_company_recipients
        WHERE id = (v_recipient_elem->>'id')::uuid AND company_id = p_company_id;
      END IF;

      IF v_recipient_id IS NULL THEN
        SELECT id INTO v_recipient_id
        FROM public.customer_company_recipients
        WHERE company_id = p_company_id AND email = v_recipient_email;
      END IF;

      IF v_recipient_id IS NOT NULL THEN
        -- Update existing recipient
        UPDATE public.customer_company_recipients
        SET
          email = v_recipient_email,
          recipient_name = v_recipient_name,
          updated_at = v_now
        WHERE id = v_recipient_id
        RETURNING * INTO v_recipient_row;
      ELSE
        -- Insert new recipient
        v_recipient_id := gen_random_uuid();
        INSERT INTO public.customer_company_recipients (
          id,
          company_id,
          recipient_name,
          email,
          invitation_count,
          last_invited_at,
          last_invitation_status,
          last_invitation_error,
          created_at,
          updated_at
        ) VALUES (
          v_recipient_id,
          p_company_id,
          v_recipient_name,
          v_recipient_email,
          0,
          NULL,
          'never_invited',
          NULL,
          v_now,
          v_now
        )
        RETURNING * INTO v_recipient_row;
      END IF;

      v_keep_ids := array_append(v_keep_ids, v_recipient_id);
    END LOOP;

    IF array_length(v_keep_ids, 1) IS NULL OR array_length(v_keep_ids, 1) = 0 THEN
      RAISE EXCEPTION 'At least one valid recipient email address is required';
    END IF;

    -- Delete recipients that were removed
    DELETE FROM public.customer_company_recipients
    WHERE company_id = p_company_id AND NOT (id = ANY(v_keep_ids));
  END IF;

  -- Build final recipient list
  SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.created_at ASC), '[]'::jsonb)
  INTO v_inserted_recipients
  FROM public.customer_company_recipients r
  WHERE r.company_id = p_company_id;

  RETURN jsonb_build_object(
    'success', true,
    'company', to_jsonb(v_comp),
    'recipients', v_inserted_recipients
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_customer_company_atomic(UUID, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_customer_company_atomic(UUID, TEXT, TEXT, TEXT, JSONB) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_customer_company_atomic(UUID, TEXT, TEXT, TEXT, JSONB) TO service_role;

-- 8. Atomic Record Customer Invitation Dispatch Procedure
CREATE OR REPLACE FUNCTION public.record_customer_invitation_dispatch_atomic(
  p_company_id UUID,
  p_recipient_id UUID,
  p_email TEXT,
  p_subject TEXT,
  p_provider TEXT,
  p_provider_message_id TEXT,
  p_status TEXT,
  p_error_message TEXT DEFAULT NULL,
  p_sent_by_user_id UUID DEFAULT NULL,
  p_log_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
  v_log_id UUID := COALESCE(p_log_id, gen_random_uuid());
  v_sent_by UUID := NULL;
  v_log_row public.customer_invitation_logs%ROWTYPE;
  v_recipient_row public.customer_company_recipients%ROWTYPE;
BEGIN
  -- Safe check for user
  IF p_sent_by_user_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.users WHERE id = p_sent_by_user_id) THEN
      v_sent_by := p_sent_by_user_id;
    END IF;
  END IF;

  -- 1. Insert audit log
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
    created_at
  ) VALUES (
    v_log_id,
    p_company_id,
    p_recipient_id,
    p_email,
    p_subject,
    COALESCE(p_provider, 'resend'),
    p_provider_message_id,
    p_status,
    p_error_message,
    v_sent_by,
    v_now
  )
  RETURNING * INTO v_log_row;

  -- 2. Update recipient status and count
  UPDATE public.customer_company_recipients
  SET
    invitation_count = CASE WHEN p_status = 'sent' THEN invitation_count + 1 ELSE invitation_count END,
    last_invited_at = CASE WHEN p_status = 'sent' THEN v_now ELSE last_invited_at END,
    last_invitation_status = p_status,
    last_invitation_error = CASE WHEN p_status = 'failed' THEN COALESCE(p_error_message, 'Delivery failed') ELSE NULL END,
    updated_at = v_now
  WHERE id = p_recipient_id
  RETURNING * INTO v_recipient_row;

  RETURN jsonb_build_object(
    'success', true,
    'log', to_jsonb(v_log_row),
    'recipient', to_jsonb(v_recipient_row)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_customer_invitation_dispatch_atomic(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_customer_invitation_dispatch_atomic(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_customer_invitation_dispatch_atomic(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, UUID) TO service_role;

