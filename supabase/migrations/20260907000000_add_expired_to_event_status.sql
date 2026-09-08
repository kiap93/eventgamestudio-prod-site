-- Migration: Add EXPIRED to event_status check constraint on public.events
-- Date: 2026-09-07
-- Authoritative rule:
--   PAID + event ended -> COMPLETED (status = 'completed')
--   UNPAID + event ended -> EXPIRED (status = 'expired')

DO $$
DECLARE
  v_constraint_name text;
BEGIN
  -- Drop existing CHECK constraint on event_status if present
  FOR v_constraint_name IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'events'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%event_status%'
  LOOP
    EXECUTE 'ALTER TABLE public.events DROP CONSTRAINT IF EXISTS ' || quote_ident(v_constraint_name);
  END LOOP;
END $$;

ALTER TABLE public.events
  ADD CONSTRAINT events_event_status_check
  CHECK (event_status IN ('DRAFT', 'PAYMENT_PENDING', 'LIVE', 'COMPLETED', 'EXPIRED', 'CANCELLED'));

-- Also create index for expired/completed maintenance if not exists
CREATE INDEX IF NOT EXISTS idx_events_expired_cron ON public.events (payment_status, expires_at, event_status);
