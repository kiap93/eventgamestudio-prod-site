-- Migration: 20261010000000_event_creation_atomic_rollback.sql
-- Description: Enforce safe internal rollback for failed event creation transactions on Setup Day
--              without compromising customer deletion protection:
--              1. Updates enforce_event_deletion_rules trigger function to allow authorized internal
--                 rollback when app.internal_rollback_event_id is set and event meets strict safety criteria:
--                 - Event is UNPAID (payment_status <> 'PAID' and paid_amount = 0)
--                 - Event is not cancelled or refunded
--                 - Event was freshly created (< 30 minutes ago)
--              2. Provides rollback_failed_event_creation RPC with exclusive row locking,
--                 reversing any partial financial operations (re-crediting wallet, deleting partial txns),
--                 and cleanly removing the event record.
--              3. Revokes execute permissions on rollback_failed_event_creation from public/anon/authenticated.

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

-- ------------------------------------------------------------------------------
-- Dedicated Internal Rollback RPC for Failed Event Creation
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rollback_failed_event_creation(
  p_event_id UUID,
  p_organization_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_event RECORD;
  v_tx RECORD;
  v_reversed_count INT := 0;
BEGIN
  -- 1. Fetch event with exclusive row lock
  SELECT * INTO v_event
  FROM public.events
  WHERE id = p_event_id AND organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'rolled_back_event_id', p_event_id,
      'reversed_transactions_count', 0,
      'message', 'Event already not present'
    );
  END IF;

  -- 2. Verify safety invariants: MUST NOT be paid
  IF UPPER(COALESCE(v_event.payment_status, '')) = 'PAID' OR COALESCE(v_event.paid_amount, 0) > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'EVENT_IS_PAID',
      'message', 'Cannot rollback a paid event. Paid events must use Cancel & Refund.'
    );
  END IF;

  -- 3. Verify event is uncompleted/unpaid
  IF UPPER(COALESCE(v_event.payment_status, '')) <> 'UNPAID' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INVALID_STATUS',
      'message', 'Event is not in unpaid status'
    );
  END IF;

  -- 4. Reverse any partial wallet transactions associated with this event if any exist
  FOR v_tx IN
    SELECT * FROM public.wallet_transactions
    WHERE event_id = p_event_id
    FOR UPDATE
  LOOP
    IF v_tx.amount < 0 THEN
      UPDATE public.organization_wallets
      SET
        paid_balance = paid_balance + CASE WHEN v_tx.type = 'PAYMENT' OR v_tx.balance_type = 'PAID_BALANCE' THEN ABS(v_tx.amount) ELSE 0 END,
        welcome_credit = welcome_credit + CASE WHEN v_tx.type = 'WELCOME_CREDIT_SPENT' OR v_tx.balance_type = 'WELCOME_CREDIT' THEN ABS(v_tx.amount) ELSE 0 END,
        showcase_credit = showcase_credit + CASE WHEN v_tx.type = 'SHOWCASE_CREDIT_SPENT' OR v_tx.balance_type = 'SHOWCASE_CREDIT' THEN ABS(v_tx.amount) ELSE 0 END,
        topup_credit = topup_credit + CASE WHEN v_tx.type = 'TOPUP_CREDIT_SPENT' OR v_tx.balance_type = 'TOPUP_CREDIT' THEN ABS(v_tx.amount) ELSE 0 END,
        updated_at = now()
      WHERE organization_id = p_organization_id;
      v_reversed_count := v_reversed_count + 1;
    END IF;
    DELETE FROM public.wallet_transactions WHERE id = v_tx.id;
  END LOOP;

  -- 5. Delete any notifications generated for this pending event
  DELETE FROM public.notifications WHERE event_id = p_event_id;

  -- 6. Set internal session variable so the DELETE trigger permits rollback
  PERFORM set_config('app.internal_rollback_event_id', p_event_id::text, true);

  -- 7. Delete the event record
  DELETE FROM public.events WHERE id = p_event_id;

  -- 8. Clear the session variable
  PERFORM set_config('app.internal_rollback_event_id', '', true);

  RETURN jsonb_build_object(
    'success', true,
    'rolled_back_event_id', p_event_id,
    'reversed_transactions_count', v_reversed_count,
    'message', 'Failed event creation rolled back cleanly'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rollback_failed_event_creation(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rollback_failed_event_creation(UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.rollback_failed_event_creation(UUID, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rollback_failed_event_creation(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.rollback_failed_event_creation(UUID, UUID) TO postgres;
