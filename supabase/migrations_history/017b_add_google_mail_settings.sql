-- ------------------------------------------------------------------------------
-- 17. ADD GOOGLE MAIL SETTINGS TABLE AND PLATFORM SETTINGS SEED FOR GMAIL
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.google_mail_settings (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL UNIQUE DEFAULT 'google_mail',
  email_address TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'connected',
  last_error TEXT,
  last_connected_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  connected_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);

ALTER TABLE public.google_mail_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Developer admins can manage google_mail_settings" ON public.google_mail_settings;
CREATE POLICY "Developer admins can manage google_mail_settings"
  ON public.google_mail_settings FOR ALL
  USING (public.is_developer_admin())
  WITH CHECK (public.is_developer_admin());
