-- Migration: 20260921000000_fix_notification_expiration_architecture.sql
-- Description: Centralize and correct notification expiration architecture:
--              1. Clear invalid expires_at timestamps on non-expiring notification records
--                 (e.g., team_member_invited, org_invitation, payment_failed, event_payment_failed,
--                  security_settings_changed, welcome_credit_added, payment_success, etc.)
--              2. Establish performance index for active notification filtering (expires_at IS NULL OR expires_at > NOW())
--              3. Provide server-authoritative cleanup_notifications_retention() RPC decoupling retention cleanup
--                 from notification display expiration.

-- 1. Reset incorrectly assigned expires_at timestamps on all non-expiring notification types
UPDATE public.notifications
SET expires_at = NULL
WHERE type IN (
  'team_member_invited',
  'org_invitation',
  'member_joined',
  'payment_failed',
  'event_payment_failed',
  'payment_success',
  'welcome_credit_added',
  'security_settings_changed',
  'event_created',
  'event_expired',
  'theme_ready',
  'showcase_draft_created',
  'showcase_published',
  'showcase_unpublished',
  'showcase_updated'
)
AND expires_at IS NOT NULL;

-- 2. Performance index for active notifications filtering
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_active
  ON public.notifications (recipient_user_id, is_read, created_at DESC)
  WHERE expires_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_expires
  ON public.notifications (recipient_user_id, expires_at)
  WHERE expires_at IS NOT NULL;

-- 3. Server-authoritative retention cleanup function
-- Retention is decoupled from expires_at. Storage cleanup only purges records older than catalog retentionDays.
CREATE OR REPLACE FUNCTION public.cleanup_notifications_retention()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER := 0;
BEGIN
  WITH deleted AS (
    DELETE FROM public.notifications
    WHERE
      -- 365 days retention for financial, security, and membership notifications
      (type IN (
        'welcome_credit_added',
        'payment_success',
        'payment_failed',
        'event_payment_failed',
        'security_settings_changed',
        'org_invitation',
        'team_member_invited',
        'member_joined'
      ) AND created_at < NOW() - INTERVAL '365 days')
      OR
      -- 180 days retention for themes and showcases
      (type IN (
        'showcase_draft_created',
        'showcase_published',
        'showcase_unpublished',
        'showcase_updated',
        'theme_ready'
      ) AND created_at < NOW() - INTERVAL '180 days')
      OR
      -- 90 days retention for operational events and balance notifications
      (type IN (
        'event_created',
        'event_approaching',
        'event_live',
        'event_expiring',
        'event_expired',
        'wallet_low_balance',
        'insufficient_balance',
        'payment_pending'
      ) AND created_at < NOW() - INTERVAL '90 days')
      OR
      -- Default fallback: 90 days for any unlisted types
      (type NOT IN (
        'welcome_credit_added',
        'payment_success',
        'payment_failed',
        'event_payment_failed',
        'security_settings_changed',
        'org_invitation',
        'team_member_invited',
        'member_joined',
        'showcase_draft_created',
        'showcase_published',
        'showcase_unpublished',
        'showcase_updated',
        'theme_ready',
        'event_created',
        'event_approaching',
        'event_live',
        'event_expiring',
        'event_expired',
        'wallet_low_balance',
        'insufficient_balance',
        'payment_pending'
      ) AND created_at < NOW() - INTERVAL '90 days')
    RETURNING id
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;

  RETURN deleted_count;
END;
$$;

-- Grant execution permission to service_role only
REVOKE ALL ON FUNCTION public.cleanup_notifications_retention() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_notifications_retention() TO service_role;
