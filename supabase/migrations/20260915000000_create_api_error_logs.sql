-- Migration: 20260915000000_create_api_error_logs.sql
-- Description: Creates the centralized api_error_logs table for production error tracking,
-- correlation ID tracing, sanitized metadata capture, and developer-admin auditing.

CREATE TABLE IF NOT EXISTS public.api_error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  method TEXT,
  endpoint TEXT,
  status_code INTEGER,
  error_type TEXT,
  error_code TEXT,
  error_message TEXT,
  stack_trace TEXT,
  service TEXT,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_api_error_logs_request_id ON public.api_error_logs (request_id);
CREATE INDEX IF NOT EXISTS idx_api_error_logs_created_at_desc ON public.api_error_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_error_logs_endpoint ON public.api_error_logs (endpoint);
CREATE INDEX IF NOT EXISTS idx_api_error_logs_status_code ON public.api_error_logs (status_code);
CREATE INDEX IF NOT EXISTS idx_api_error_logs_service ON public.api_error_logs (service);
CREATE INDEX IF NOT EXISTS idx_api_error_logs_user_id ON public.api_error_logs (user_id);

-- Enable Row Level Security
ALTER TABLE public.api_error_logs ENABLE ROW LEVEL SECURITY;

-- 1. Service role policy: full CRUD access for backend API servers
DROP POLICY IF EXISTS "Service role manages api error logs" ON public.api_error_logs;
CREATE POLICY "Service role manages api error logs"
  ON public.api_error_logs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 2. Developer Admin read policy: only authenticated users with verified developer_admin privileges can read
DROP POLICY IF EXISTS "Developer admins can view api error logs" ON public.api_error_logs;
CREATE POLICY "Developer admins can view api error logs"
  ON public.api_error_logs FOR SELECT
  TO authenticated
  USING (public.is_developer_admin(auth.uid()));
