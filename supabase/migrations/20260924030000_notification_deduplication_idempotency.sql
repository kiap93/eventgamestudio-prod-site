-- Migration: 20260924030000_notification_deduplication_idempotency.sql
-- Description: Database-level transaction & idempotency protection for centralized notifications.
--              1. Installs explicit UNIQUE constraint on (recipient_user_id, deduplication_key)
--              2. Provides atomic stored procedure insert_notification_idempotent() executing:
--                 INSERT ... ON CONFLICT (recipient_user_id, deduplication_key) DO NOTHING
--              3. Prevents race conditions and duplicate alerts during concurrent worker & cron execution.

-- 1. Database-level UNIQUE constraint on (recipient_user_id, deduplication_key)
-- In PostgreSQL standard semantics, UNIQUE(col1, col2) allows multiple NULLs in deduplication_key,
-- but enforces strict uniqueness for any non-NULL deduplication_key per recipient.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'uq_notifications_recipient_dedup' 
      AND conrelid = 'public.notifications'::regclass
  ) THEN
    -- Ensure deduplication index is supported by an explicit unique constraint for ON CONFLICT target resolution
    ALTER TABLE public.notifications 
      ADD CONSTRAINT uq_notifications_recipient_dedup 
      UNIQUE (recipient_user_id, deduplication_key);
  END IF;
END $$;

-- 2. Atomic Stored Procedure for Idempotent Notification Creation
-- Executes INSERT ... ON CONFLICT (recipient_user_id, deduplication_key) DO NOTHING.
-- If inserted: returns the newly inserted row with is_inserted = true.
-- If conflict: retrieves the existing row with is_inserted = false.
CREATE OR REPLACE FUNCTION public.insert_notification_idempotent(
  p_id UUID,
  p_recipient_user_id UUID,
  p_organization_id UUID,
  p_type VARCHAR(64),
  p_category VARCHAR(32),
  p_title TEXT,
  p_message TEXT,
  p_priority VARCHAR(16),
  p_action_url TEXT,
  p_entity_type VARCHAR(64),
  p_entity_id TEXT,
  p_metadata JSONB,
  p_deduplication_key TEXT,
  p_created_at TIMESTAMPTZ,
  p_expires_at TIMESTAMPTZ
)
RETURNS TABLE (
  id UUID,
  recipient_user_id UUID,
  organization_id UUID,
  type VARCHAR(64),
  category VARCHAR(32),
  title TEXT,
  message TEXT,
  priority VARCHAR(16),
  action_url TEXT,
  entity_type VARCHAR(64),
  entity_id TEXT,
  metadata JSONB,
  is_read BOOLEAN,
  read_at TIMESTAMPTZ,
  deduplication_key TEXT,
  created_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  is_inserted BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted_id UUID;
BEGIN
  IF p_deduplication_key IS NOT NULL AND trim(p_deduplication_key) != '' THEN
    -- Deterministic insert with database-level ON CONFLICT DO NOTHING
    INSERT INTO public.notifications (
      id, recipient_user_id, organization_id, type, category,
      title, message, priority, action_url, entity_type,
      entity_id, metadata, is_read, read_at, deduplication_key,
      created_at, expires_at
    ) VALUES (
      COALESCE(p_id, gen_random_uuid()), p_recipient_user_id, p_organization_id, p_type, p_category,
      p_title, p_message, p_priority, p_action_url, p_entity_type,
      p_entity_id, COALESCE(p_metadata, '{}'::jsonb), false, NULL, p_deduplication_key,
      COALESCE(p_created_at, timezone('utc'::text, now())), p_expires_at
    )
    ON CONFLICT (recipient_user_id, deduplication_key) DO NOTHING
    RETURNING public.notifications.id INTO v_inserted_id;

    IF v_inserted_id IS NOT NULL THEN
      -- Notification was newly created
      RETURN QUERY
      SELECT n.id, n.recipient_user_id, n.organization_id, n.type, n.category,
             n.title, n.message, n.priority, n.action_url, n.entity_type,
             n.entity_id, n.metadata, n.is_read, n.read_at, n.deduplication_key,
             n.created_at, n.expires_at, true AS is_inserted
      FROM public.notifications n
      WHERE n.id = v_inserted_id;
      RETURN;
    ELSE
      -- Duplicate existed (concurrent insert won the race); retrieve existing record
      RETURN QUERY
      SELECT n.id, n.recipient_user_id, n.organization_id, n.type, n.category,
             n.title, n.message, n.priority, n.action_url, n.entity_type,
             n.entity_id, n.metadata, n.is_read, n.read_at, n.deduplication_key,
             n.created_at, n.expires_at, false AS is_inserted
      FROM public.notifications n
      WHERE n.recipient_user_id = p_recipient_user_id
        AND n.deduplication_key = p_deduplication_key
      ORDER BY n.created_at ASC
      LIMIT 1;
      RETURN;
    END IF;
  ELSE
    -- Non-deduplicated notification (deduplication_key IS NULL)
    INSERT INTO public.notifications (
      id, recipient_user_id, organization_id, type, category,
      title, message, priority, action_url, entity_type,
      entity_id, metadata, is_read, read_at, deduplication_key,
      created_at, expires_at
    ) VALUES (
      COALESCE(p_id, gen_random_uuid()), p_recipient_user_id, p_organization_id, p_type, p_category,
      p_title, p_message, p_priority, p_action_url, p_entity_type,
      p_entity_id, COALESCE(p_metadata, '{}'::jsonb), false, NULL, NULL,
      COALESCE(p_created_at, timezone('utc'::text, now())), p_expires_at
    )
    RETURNING public.notifications.id INTO v_inserted_id;

    RETURN QUERY
    SELECT n.id, n.recipient_user_id, n.organization_id, n.type, n.category,
           n.title, n.message, n.priority, n.action_url, n.entity_type,
           n.entity_id, n.metadata, n.is_read, n.read_at, n.deduplication_key,
           n.created_at, n.expires_at, true AS is_inserted
    FROM public.notifications n
    WHERE n.id = v_inserted_id;
    RETURN;
  END IF;
END;
$$;

-- Grant execution to authenticated users and service_role
GRANT EXECUTE ON FUNCTION public.insert_notification_idempotent TO service_role;
GRANT EXECUTE ON FUNCTION public.insert_notification_idempotent TO authenticated;
