-- Migration 018: Separate Event Lifecycle Status and Payment Status
-- 1. Add event_status and cancel_reason to public.events
-- 2. Ensure payment_status check constraint supports UNPAID, PENDING, PAID, FAILED, REFUNDED, PENDING_PAYMENT
-- 3. Safely backfill existing events without breaking active data

-- Step 1: Add cancel_reason column with check constraint
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_cancel_reason_check;
ALTER TABLE public.events ADD CONSTRAINT events_cancel_reason_check
  CHECK (cancel_reason IS NULL OR cancel_reason IN ('USER_CANCELLED', 'PAYMENT_TIMEOUT', 'ADMIN_CANCELLED'));

-- Step 2: Update payment_status check constraint to support all statuses
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_payment_status_check;
ALTER TABLE public.events ADD CONSTRAINT events_payment_status_check
  CHECK (payment_status IN ('UNPAID', 'PENDING', 'PAID', 'FAILED', 'REFUNDED', 'PENDING_PAYMENT'));

-- Step 3: Add event_status column with check constraint
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS event_status TEXT;
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_event_status_check;
ALTER TABLE public.events ADD CONSTRAINT events_event_status_check
  CHECK (event_status IN ('DRAFT', 'PAYMENT_PENDING', 'LIVE', 'COMPLETED', 'CANCELLED'));

-- Step 4: Safely backfill event_status based on existing data
-- A. If event was explicitly cancelled:
UPDATE public.events
SET event_status = 'CANCELLED',
    cancel_reason = COALESCE(cancel_reason, 'USER_CANCELLED')
WHERE status = 'cancelled' AND (event_status IS NULL OR event_status != 'CANCELLED');

-- B. If event was confirmed PAID:
-- If event expiration time has already passed: mark COMPLETED
UPDATE public.events
SET event_status = 'COMPLETED'
WHERE payment_status = 'PAID'
  AND expires_at <= NOW()
  AND (event_status IS NULL OR event_status NOT IN ('COMPLETED', 'CANCELLED'));

-- If event is paid and still valid/scheduled/live: mark LIVE
UPDATE public.events
SET event_status = 'LIVE'
WHERE payment_status = 'PAID'
  AND expires_at > NOW()
  AND (event_status IS NULL OR event_status != 'LIVE');

-- C. If event was unpaid / pending_payment:
-- If event start time has already passed and it was never paid: mark CANCELLED with PAYMENT_TIMEOUT
UPDATE public.events
SET event_status = 'CANCELLED',
    cancel_reason = 'PAYMENT_TIMEOUT',
    status = 'cancelled'
WHERE (payment_status IN ('UNPAID', 'PENDING', 'PENDING_PAYMENT') OR payment_status IS NULL)
  AND starts_at <= NOW()
  AND (event_status IS NULL OR event_status != 'CANCELLED');

-- If event is unpaid and start time is still in the future: mark DRAFT / PAYMENT_PENDING
UPDATE public.events
SET event_status = 'PAYMENT_PENDING'
WHERE (payment_status IN ('UNPAID', 'PENDING', 'PENDING_PAYMENT') OR payment_status IS NULL)
  AND (status = 'pending_payment' OR status IS NULL)
  AND starts_at > NOW()
  AND event_status IS NULL;

UPDATE public.events
SET event_status = 'DRAFT'
WHERE event_status IS NULL;

-- Step 5: Set default for event_status
ALTER TABLE public.events ALTER COLUMN event_status SET DEFAULT 'DRAFT';

-- Step 6: Create compound indexes for cron query performance and lookups
CREATE INDEX IF NOT EXISTS idx_events_event_status ON public.events (event_status);
CREATE INDEX IF NOT EXISTS idx_events_lifecycle_cron ON public.events (event_status, starts_at, payment_status);
CREATE INDEX IF NOT EXISTS idx_events_completed_cron ON public.events (payment_status, expires_at, event_status);
