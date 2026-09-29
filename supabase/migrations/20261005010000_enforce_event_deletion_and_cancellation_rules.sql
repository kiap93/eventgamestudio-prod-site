-- Migration: 20261005000000_enforce_event_deletion_and_cancellation_rules.sql
-- Description: Enforce server-authoritative database trigger protection on public.events:
--              1. Paid events cannot be physically deleted (must use Cancel & Refund before Setup Day).
--              2. Cancelled or refunded events cannot be physically deleted (preserves financial/event audit history).
--              3. On or after Setup Day, events cannot be deleted under any circumstances.
--              4. Unpaid events before Setup Day may be permanently deleted.

CREATE OR REPLACE FUNCTION public.enforce_event_deletion_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_paid boolean;
  v_setup_day date;
  v_today date;
  v_tz text;
BEGIN
  -- 1. If event was paid, NEVER allow physical deletion through normal or direct deletion
  v_is_paid := (UPPER(COALESCE(OLD.payment_status, '')) = 'PAID' OR COALESCE(OLD.paid_amount, 0) > 0);
  IF v_is_paid THEN
    RAISE EXCEPTION 'This paid event cannot be deleted. Use Cancel & Refund before Setup Day.';
  END IF;

  -- 2. If event is already refunded or explicitly cancelled, do not allow physical deletion to preserve audit history
  IF UPPER(COALESCE(OLD.payment_status, '')) = 'REFUNDED' OR UPPER(COALESCE(OLD.event_status, '')) = 'CANCELLED' OR LOWER(COALESCE(OLD.status, '')) = 'cancelled' THEN
    RAISE EXCEPTION 'Cancelled or refunded events cannot be deleted. Financial and event history must be preserved.';
  END IF;

  -- 3. Resolve timezone and calculate current date in event timezone
  v_tz := COALESCE(OLD.event_timezone, 'Asia/Singapore');
  BEGIN
    v_today := (timezone(v_tz, now()))::date;
  EXCEPTION WHEN OTHERS THEN
    v_today := (timezone('Asia/Singapore', now()))::date;
  END;

  -- 4. Calculate Setup Day (startDate - 1 calendar day)
  IF OLD.start_date IS NOT NULL AND OLD.start_date ~ '^\d{4}-\d{2}-\d{2}' THEN
    v_setup_day := (OLD.start_date::date - 1);
  ELSIF OLD.starts_at IS NOT NULL THEN
    v_setup_day := ((timezone(v_tz, OLD.starts_at))::date - 1);
  ELSE
    v_setup_day := NULL;
  END IF;

  -- 5. If Setup Day has started, deletion is permanently locked
  IF v_setup_day IS NOT NULL AND v_today >= v_setup_day THEN
    RAISE EXCEPTION 'This event can no longer be deleted because Setup Day has started.';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_event_deletion_rules ON public.events;
CREATE TRIGGER trg_enforce_event_deletion_rules
  BEFORE DELETE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_event_deletion_rules();
