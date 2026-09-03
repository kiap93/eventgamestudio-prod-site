-- ==============================================================================
-- Migration 027: Automatic Test Score Clearing on Event Start Date
-- ==============================================================================

-- 1. Add test_scores_cleared_at timestamp to events table
ALTER TABLE IF EXISTS public.events
  ADD COLUMN IF NOT EXISTS test_scores_cleared_at TIMESTAMPTZ;

-- 2. Index on events for test score lifecycle queries (using actual schema columns: event_date, starts_at)
CREATE INDEX IF NOT EXISTS idx_events_test_scores_cleared
  ON public.events (test_scores_cleared_at, event_date, starts_at);

-- Performance index for test score deletion on event_high_scores
CREATE INDEX IF NOT EXISTS idx_event_high_scores_clearing
  ON public.event_high_scores (event_id, score_environment, score_mode, is_test);

-- 3. Stored Procedure: Clear all TEST scores for an event (idempotent, preserves LIVE scores)
-- p_update_event: when true, updates events.test_scores_cleared_at; when false, skips updating events table
-- (useful when called from a BEFORE UPDATE trigger on events to eliminate recursive trigger execution).
CREATE OR REPLACE FUNCTION public.clear_event_test_scores(
  p_event_id UUID,
  p_update_event BOOLEAN DEFAULT TRUE
)
RETURNS INTEGER AS $$
DECLARE
  v_deleted_count INTEGER := 0;
BEGIN
  IF p_event_id IS NULL THEN
    RETURN 0;
  END IF;

  -- Delete only TEST scores, strictly preserving LIVE scores
  DELETE FROM public.event_high_scores
  WHERE event_id = p_event_id
    AND (
      score_environment IN ('test', 'TEST')
      OR score_mode = 'TEST'
      OR is_test = true
      OR (metadata->>'score_environment') ILIKE 'test'
      OR (metadata->>'score_mode') ILIKE 'test'
      OR (metadata->>'is_test') = 'true'
    );
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  -- Atomically record test_scores_cleared_at timestamp on the event record if requested
  IF p_update_event AND pg_trigger_depth() = 0 THEN
    UPDATE public.events
    SET test_scores_cleared_at = COALESCE(test_scores_cleared_at, NOW()),
        updated_at = NOW()
    WHERE id = p_event_id
      AND test_scores_cleared_at IS NULL;
  END IF;

  RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Batch Stored Procedure: Auto clear test scores for all events that reached their configured start date
CREATE OR REPLACE FUNCTION public.auto_clear_test_scores_for_started_events(p_current_date TEXT DEFAULT NULL)
RETURNS TABLE(event_id UUID, cleared_count INTEGER) AS $$
DECLARE
  v_cur_date TEXT;
  v_rec RECORD;
  v_cleared INTEGER;
BEGIN
  -- Derive Singapore calendar date (Asia/Singapore, UTC+8) if not explicitly provided
  IF p_current_date IS NOT NULL AND p_current_date ~ '^\d{4}-\d{2}-\d{2}$' THEN
    v_cur_date := p_current_date;
  ELSE
    v_cur_date := TO_CHAR((NOW() AT TIME ZONE 'Asia/Singapore'), 'YYYY-MM-DD');
  END IF;

  FOR v_rec IN
    SELECT e.id
    FROM public.events e
    WHERE e.test_scores_cleared_at IS NULL
      AND (
        (e.event_date IS NOT NULL AND e.event_date <= v_cur_date)
        OR (e.event_date IS NULL AND TO_CHAR((e.starts_at AT TIME ZONE 'Asia/Singapore'), 'YYYY-MM-DD') <= v_cur_date)
        OR e.starts_at <= NOW()
        OR e.event_status = 'LIVE'
        OR e.status IN ('live', 'active')
      )
      AND (e.status != 'cancelled' OR e.status IS NULL)
      AND (e.event_status != 'CANCELLED' OR e.event_status IS NULL)
      AND e.cancel_reason IS NULL
  LOOP
    v_cleared := public.clear_event_test_scores(v_rec.id, TRUE);
    event_id := v_rec.id;
    cleared_count := v_cleared;
    RETURN NEXT;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Trigger on events table: Automatically clear test scores when event reaches start date or becomes LIVE
-- Designed to be 100% RECURSION-SAFE:
-- - Uses pg_trigger_depth() check
-- - Directly mutates NEW.test_scores_cleared_at without issuing an UPDATE on public.events
-- - Calls clear_event_test_scores with p_update_event = FALSE
CREATE OR REPLACE FUNCTION public.trg_auto_clear_test_scores_on_event_update()
RETURNS TRIGGER AS $$
DECLARE
  v_cur_date TEXT;
  v_start_date TEXT;
  v_should_clear BOOLEAN := false;
BEGIN
  -- Prevent any nested trigger recursion
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  -- If already marked as cleared, nothing to do
  IF OLD.test_scores_cleared_at IS NOT NULL OR NEW.test_scores_cleared_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_cur_date := TO_CHAR((NOW() AT TIME ZONE 'Asia/Singapore'), 'YYYY-MM-DD');
  v_start_date := COALESCE(
    CASE WHEN NEW.event_date ~ '^\d{4}-\d{2}-\d{2}$' THEN NEW.event_date ELSE NULL END,
    TO_CHAR((NEW.starts_at AT TIME ZONE 'Asia/Singapore'), 'YYYY-MM-DD')
  );

  IF (v_start_date IS NOT NULL AND v_cur_date >= v_start_date)
     OR (NEW.starts_at IS NOT NULL AND NOW() >= NEW.starts_at)
     OR (NEW.status IN ('live', 'active'))
     OR (NEW.event_status = 'LIVE')
  THEN
    v_should_clear := true;
  END IF;

  IF v_should_clear 
     AND (NEW.status != 'cancelled' OR NEW.status IS NULL) 
     AND (NEW.event_status != 'CANCELLED' OR NEW.event_status IS NULL)
     AND NEW.cancel_reason IS NULL
  THEN
    -- Directly update the in-flight row state without triggering a recursive UPDATE statement
    NEW.test_scores_cleared_at := NOW();
    -- Purge TEST scores from event_high_scores (p_update_event := false to avoid re-triggering)
    PERFORM public.clear_event_test_scores(NEW.id, FALSE);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_events_auto_clear_test_scores ON public.events;
CREATE TRIGGER trg_events_auto_clear_test_scores
  BEFORE UPDATE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_auto_clear_test_scores_on_event_update();

-- 6. Trigger on event_high_scores table: Enforce that started events purge test scores and record LIVE scores
-- Designed to be CONCURRENCY-SAFE:
-- - Uses atomic conditional UPDATE on public.events to ensure test scores are cleared only once across concurrent inserts
-- - Does not alter legitimate historical TEST scores before the event start date
-- - Strictly preserves all LIVE scores
CREATE OR REPLACE FUNCTION public.trg_event_high_scores_enforce_live()
RETURNS TRIGGER AS $$
DECLARE
  v_event RECORD;
  v_cur_date TEXT;
  v_start_date TEXT;
  v_is_started BOOLEAN := false;
BEGIN
  -- Prevent trigger recursion
  IF pg_trigger_depth() > 2 THEN
    RETURN NEW;
  END IF;

  SELECT id, event_date, starts_at, status, event_status, cancel_reason, test_scores_cleared_at
  INTO v_event
  FROM public.events
  WHERE id = NEW.event_id;

  IF FOUND THEN
    -- Skip cancelled events
    IF v_event.event_status = 'CANCELLED' OR v_event.status = 'cancelled' OR v_event.cancel_reason IS NOT NULL THEN
      RETURN NEW;
    END IF;

    v_cur_date := TO_CHAR((NOW() AT TIME ZONE 'Asia/Singapore'), 'YYYY-MM-DD');
    v_start_date := COALESCE(
      CASE WHEN v_event.event_date ~ '^\d{4}-\d{2}-\d{2}$' THEN v_event.event_date ELSE NULL END,
      TO_CHAR((v_event.starts_at AT TIME ZONE 'Asia/Singapore'), 'YYYY-MM-DD')
    );

    IF (v_start_date IS NOT NULL AND v_cur_date >= v_start_date)
       OR (v_event.starts_at IS NOT NULL AND NOW() >= v_event.starts_at)
       OR v_event.status IN ('live', 'active')
       OR v_event.event_status = 'LIVE'
    THEN
      v_is_started := true;
    END IF;

    -- Only enforce LIVE mode and score clearing if the event has officially reached its start date
    IF v_is_started THEN
      -- If test scores have not yet been marked cleared, atomically claim and clear them
      IF v_event.test_scores_cleared_at IS NULL THEN
        -- Atomic test-and-set: Only one concurrent transaction will get FOUND = true
        UPDATE public.events
        SET test_scores_cleared_at = NOW(),
            updated_at = NOW()
        WHERE id = v_event.id
          AND test_scores_cleared_at IS NULL;

        IF FOUND THEN
          PERFORM public.clear_event_test_scores(v_event.id, FALSE);
        END IF;
      END IF;

      -- Normalize new score submissions on started events to LIVE
      IF NEW.score_environment IN ('test', 'TEST') OR NEW.score_mode = 'TEST' OR NEW.is_test = true THEN
        NEW.score_environment := 'live';
        NEW.score_mode := 'LIVE';
        NEW.is_test := false;

        -- Clean metadata test flags if present
        IF NEW.metadata IS NOT NULL THEN
          IF (NEW.metadata->>'score_environment') ILIKE 'test' THEN
            NEW.metadata := jsonb_set(NEW.metadata, '{score_environment}', '"live"');
          END IF;
          IF (NEW.metadata->>'score_mode') ILIKE 'test' THEN
            NEW.metadata := jsonb_set(NEW.metadata, '{score_mode}', '"LIVE"');
          END IF;
          IF (NEW.metadata->>'is_test') = 'true' THEN
            NEW.metadata := jsonb_set(NEW.metadata, '{is_test}', 'false');
          END IF;
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_event_high_scores_enforce_live ON public.event_high_scores;
CREATE TRIGGER trg_event_high_scores_enforce_live
  BEFORE INSERT ON public.event_high_scores
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_event_high_scores_enforce_live();

