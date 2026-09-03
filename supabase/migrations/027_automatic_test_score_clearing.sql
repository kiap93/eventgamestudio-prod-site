-- ==============================================================================
-- Migration 027: Automatic Test Score Clearing on Event Start Date
-- ==============================================================================

-- 1. Add test_scores_cleared_at timestamp to events table
ALTER TABLE IF EXISTS public.events
  ADD COLUMN IF NOT EXISTS test_scores_cleared_at TIMESTAMPTZ;

-- 2. Index on events for test score lifecycle queries
CREATE INDEX IF NOT EXISTS idx_events_test_scores_cleared
  ON public.events (test_scores_cleared_at, start_date, event_date);

-- 3. Stored Procedure: Clear all TEST scores for an event (idempotent, preserves LIVE scores)
CREATE OR REPLACE FUNCTION public.clear_event_test_scores(p_event_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_deleted_count INTEGER := 0;
BEGIN
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

  -- Record test_scores_cleared_at timestamp on the event record
  UPDATE public.events
  SET test_scores_cleared_at = COALESCE(test_scores_cleared_at, NOW()),
      updated_at = NOW()
  WHERE id = p_event_id;

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
        (e.start_date IS NOT NULL AND e.start_date <= v_cur_date)
        OR (e.start_date IS NULL AND e.event_date IS NOT NULL AND e.event_date <= v_cur_date)
        OR (e.start_date IS NULL AND e.event_date IS NULL AND e.starts_at <= NOW())
      )
      AND (e.status != 'cancelled' OR e.status IS NULL)
      AND (e.event_status != 'CANCELLED' OR e.event_status IS NULL)
  LOOP
    v_cleared := public.clear_event_test_scores(v_rec.id);
    event_id := v_rec.id;
    cleared_count := v_cleared;
    RETURN NEXT;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Trigger on events table: Automatically clear test scores when event reaches start date or becomes LIVE
CREATE OR REPLACE FUNCTION public.trg_auto_clear_test_scores_on_event_update()
RETURNS TRIGGER AS $$
DECLARE
  v_cur_date TEXT;
  v_should_clear BOOLEAN := false;
BEGIN
  IF NEW.test_scores_cleared_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_cur_date := TO_CHAR((NOW() AT TIME ZONE 'Asia/Singapore'), 'YYYY-MM-DD');

  IF (NEW.start_date IS NOT NULL AND NEW.start_date <= v_cur_date)
     OR (NEW.start_date IS NULL AND NEW.event_date IS NOT NULL AND NEW.event_date <= v_cur_date)
     OR (NEW.start_date IS NULL AND NEW.event_date IS NULL AND NEW.starts_at <= NOW())
     OR (NEW.status IN ('live', 'active'))
     OR (NEW.event_status = 'LIVE')
  THEN
    v_should_clear := true;
  END IF;

  IF v_should_clear 
     AND (NEW.status != 'cancelled' OR NEW.status IS NULL) 
     AND (NEW.event_status != 'CANCELLED' OR NEW.event_status IS NULL) 
  THEN
    NEW.test_scores_cleared_at := COALESCE(NEW.test_scores_cleared_at, NOW());
    PERFORM public.clear_event_test_scores(NEW.id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_events_auto_clear_test_scores ON public.events;
CREATE TRIGGER trg_events_auto_clear_test_scores
  BEFORE UPDATE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_auto_clear_test_scores_on_event_update();

-- 6. Trigger on event_high_scores table: Enforce that started events purge test scores and only record LIVE scores
CREATE OR REPLACE FUNCTION public.trg_event_high_scores_enforce_live()
RETURNS TRIGGER AS $$
DECLARE
  v_event RECORD;
  v_cur_date TEXT;
BEGIN
  SELECT * INTO v_event FROM public.events WHERE id = NEW.event_id;
  IF FOUND THEN
    v_cur_date := TO_CHAR((NOW() AT TIME ZONE 'Asia/Singapore'), 'YYYY-MM-DD');
    IF (v_event.start_date IS NOT NULL AND v_event.start_date <= v_cur_date)
       OR (v_event.start_date IS NULL AND v_event.starts_at <= NOW())
       OR v_event.status IN ('live', 'active')
       OR v_event.event_status = 'LIVE'
    THEN
      -- Trigger test score cleanup if not yet marked
      IF v_event.test_scores_cleared_at IS NULL THEN
        PERFORM public.clear_event_test_scores(v_event.id);
      END IF;

      -- Normalize score environment to LIVE for active/started events
      IF NEW.score_environment IN ('test', 'TEST') OR NEW.score_mode = 'TEST' OR NEW.is_test = true THEN
        NEW.score_environment := 'live';
        NEW.score_mode := 'LIVE';
        NEW.is_test := false;
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
