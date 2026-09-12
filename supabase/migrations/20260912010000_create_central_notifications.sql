-- Migration: 20260912010000_create_central_notifications.sql
-- Description: Centralized Notification System schema
--              1. Creates public.notifications table with complete metadata, lifecycle, and deduplication
--              2. Installs performance and deduplication indexes
--              3. Configures Row Level Security (RLS) for tenant/recipient isolation
--              4. Registers notifications table with Supabase Realtime publication

-- 1. Create notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  type VARCHAR(64) NOT NULL,
  category VARCHAR(32) NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  priority VARCHAR(16) NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  action_url TEXT,
  entity_type VARCHAR(64),
  entity_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ,
  deduplication_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  expires_at TIMESTAMPTZ
);

-- 2. Performance and Query Indexes
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_user_id 
  ON public.notifications (recipient_user_id);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created 
  ON public.notifications (recipient_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_unread 
  ON public.notifications (recipient_user_id, created_at DESC) 
  WHERE is_read = false;

CREATE INDEX IF NOT EXISTS idx_notifications_org 
  ON public.notifications (organization_id);

CREATE INDEX IF NOT EXISTS idx_notifications_category 
  ON public.notifications (recipient_user_id, category);

-- Unique partial index for deterministic idempotency & deduplication
CREATE UNIQUE INDEX IF NOT EXISTS ux_notifications_recipient_dedup 
  ON public.notifications (recipient_user_id, deduplication_key) 
  WHERE deduplication_key IS NOT NULL;

-- 3. Row Level Security (RLS)
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to view only notifications addressed to them
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
CREATE POLICY "Users can view their own notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (recipient_user_id = auth.uid());

-- Allow authenticated users to update their own notifications (e.g. mark as read)
DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
CREATE POLICY "Users can update their own notifications"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (recipient_user_id = auth.uid())
  WITH CHECK (recipient_user_id = auth.uid());

-- Allow authenticated users to delete/dismiss their own notifications
DROP POLICY IF EXISTS "Users can delete their own notifications" ON public.notifications;
CREATE POLICY "Users can delete their own notifications"
  ON public.notifications FOR DELETE
  TO authenticated
  USING (recipient_user_id = auth.uid());

-- Backend service role maintains full administrative authority over notifications
GRANT ALL ON public.notifications TO service_role;
GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;

-- 4. Supabase Realtime Publication
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'notifications'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    END IF;
  END IF;
END $$;
