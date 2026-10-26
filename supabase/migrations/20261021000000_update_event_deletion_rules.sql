-- Migration: 20261021000000_update_event_deletion_rules.sql
-- Description: Update event deletion trigger rules on public.events:
--              1. Paid events cannot be physically deleted (must use Cancel & Refund before Setup Day).
--              2. Cancelled or refunded events cannot be physically deleted (preserves financial/event audit history).
--              3. Events with existing tax invoice or credit note records cannot be deleted (retention safeguard).
--              4. Events with confirmed payment wallet transactions cannot be deleted.
--              5. Unpaid events may be deleted at any time (newly created, on Setup Day, or past event date / expired).

CREATE OR REPLACE FUNCTION public.enforce_event_deletion_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_paid boolean;
  v_rollback_id text;
BEGIN
  -- Internal creation rollback check:
  -- Only allow if explicitly authorized by an internal system transaction and all safety invariants hold
  v_rollback_id := NULLIF(current_setting('app.internal_rollback_event_id', true), '');
  IF v_rollback_id IS NOT NULL AND v_rollback_id = OLD.id::text THEN
    -- Verify safety invariants: event MUST be unpaid, zero amount paid, and freshly created (< 30 minutes)
    IF (UPPER(COALESCE(OLD.payment_status, '')) = 'UNPAID' OR LOWER(COALESCE(OLD.status, '')) IN ('draft', 'pending_payment'))
       AND COALESCE(OLD.paid_amount, 0) = 0
       AND UPPER(COALESCE(OLD.payment_status, '')) <> 'REFUNDED'
       AND UPPER(COALESCE(OLD.event_status, '')) <> 'CANCELLED'
       AND LOWER(COALESCE(OLD.status, '')) <> 'cancelled'
       AND OLD.created_at >= (now() - INTERVAL '30 minutes') THEN
      -- Authorized internal creation rollback: allow deletion and exit trigger immediately
      RETURN OLD;
    ELSE
      RAISE EXCEPTION 'Internal rollback rejected: event does not meet safety criteria for creation rollback.';
    END IF;
  END IF;

  -- 1. If event was paid, NEVER allow physical deletion through normal or direct deletion
  v_is_paid := (UPPER(COALESCE(OLD.payment_status, '')) = 'PAID' OR COALESCE(OLD.paid_amount, 0) > 0);
  IF v_is_paid THEN
    RAISE EXCEPTION 'This paid event cannot be deleted. Use Cancel & Refund before Setup Day.';
  END IF;

  -- 2. If event is already refunded or explicitly cancelled, do not allow physical deletion to preserve audit history
  IF UPPER(COALESCE(OLD.payment_status, '')) = 'REFUNDED' OR UPPER(COALESCE(OLD.event_status, '')) = 'CANCELLED' OR LOWER(COALESCE(OLD.status, '')) = 'cancelled' THEN
    RAISE EXCEPTION 'Cancelled or refunded events cannot be deleted. Financial and event history must be preserved.';
  END IF;

  -- 3. Financial Retention Safeguard: Invoices and credit notes must be preserved for tax/audit records
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'event_invoices') THEN
    IF EXISTS (SELECT 1 FROM public.event_invoices WHERE event_id = OLD.id) THEN
      RAISE EXCEPTION 'Cannot delete event with existing invoice records. Financial records must be retained.';
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'event_credit_notes') THEN
    IF EXISTS (SELECT 1 FROM public.event_credit_notes WHERE event_id = OLD.id) THEN
      RAISE EXCEPTION 'Cannot delete event with existing credit note records. Financial records must be retained.';
    END IF;
  END IF;

  -- 4. Financial Safeguard: Completed payment transactions must be preserved
  IF EXISTS (
    SELECT 1 FROM public.wallet_transactions
    WHERE event_id = OLD.id
      AND transaction_type IN ('EVENT_PAYMENT', 'CREDIT_USAGE')
      AND status = 'COMPLETED'
  ) THEN
    RAISE EXCEPTION 'Cannot delete event with completed financial transactions.';
  END IF;

  -- 5. Unpaid events (newly created, on Setup Day, or past event date / expired) can be deleted
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_event_deletion_rules ON public.events;
CREATE TRIGGER trg_enforce_event_deletion_rules
  BEFORE DELETE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_event_deletion_rules();
