-- Migration: 20260904050000_leaderboard_rls_live_window.sql
-- Description: Harden RLS for public.event_high_scores to prevent TEST scores leaking
--              for paid-but-not-live events.
--              Enforces that public SELECT access to event high scores requires the event
--              to actually be in the public live window:
--              1. payment_status = 'PAID'
--              2. Current Singapore date >= start_date - 1 day (Setup Day)
--              3. Current Singapore date <= end_date (Event Conclusion)
--              4. Event is not cancelled
--              5. TEST scores are never exposed to public queries.
--              Organization members and developer admins retain full access to view their
--              own event leaderboards, including pre-event TEST scores.

-- ==============================================================================
-- 1. ENSURE EVENT DATE COLUMNS AND DATE SYNC TRIGGER ON PUBLIC.EVENTS
-- ==============================================================================

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS start_date TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS end_date TEXT;

CREATE INDEX IF NOT EXISTS idx_events_start_date ON public.events (start_date);
CREATE INDEX IF NOT EXISTS idx_events_end_date ON public.events (end_date);

-- Backfill start_date and end_date if missing
UPDATE public.events
SET start_date = COALESCE(
  NULLIF(start_date, ''),
  CASE WHEN event_date ~ '^\d{4}-\d{2}-\d{2}$' THEN event_date ELSE NULL END,
  TO_CHAR((starts_at AT TIME ZONE 'Asia/Singapore'), 'YYYY-MM-DD')
)
WHERE start_date IS NULL OR start_date = '';

UPDATE public.events
SET end_date = COALESCE(
  NULLIF(end_date, ''),
  TO_CHAR((expires_at AT TIME ZONE 'Asia/Singapore'), 'YYYY-MM-DD'),
  NULLIF(start_date, ''),
  CASE WHEN event_date ~ '^\d{4}-\d{2}-\d{2}$' THEN event_date ELSE NULL END
)
WHERE end_date IS NULL OR end_date = '';

-- Trigger function to automatically maintain start_date and end_date on events
CREATE OR REPLACE FUNCTION public.handle_event_dates_sync()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.start_date IS NULL OR NEW.start_date = '' THEN
    NEW.start_date := COALESCE(
      CASE WHEN NEW.event_date ~ '^\d{4}-\d{2}-\d{2}$' THEN NEW.event_date ELSE NULL END,
      TO_CHAR((NEW.starts_at AT TIME ZONE 'Asia/Singapore'), 'YYYY-MM-DD')
    );
  END IF;

  IF NEW.end_date IS NULL OR NEW.end_date = '' THEN
    NEW.end_date := COALESCE(
      TO_CHAR((NEW.expires_at AT TIME ZONE 'Asia/Singapore'), 'YYYY-MM-DD'),
      NEW.start_date
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_events_sync_dates ON public.events;
CREATE TRIGGER trg_events_sync_dates
  BEFORE INSERT OR UPDATE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_event_dates_sync();

-- ==============================================================================
-- 2. HELPER FUNCTION: IS EVENT IN PUBLIC LIVE WINDOW (SINGAPORE TIME)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.is_event_in_public_live_window(p_event_id UUID)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_cur_date date;
  v_start_date date;
  v_end_date date;
  v_event public.events%ROWTYPE;
BEGIN
  SELECT * INTO v_event FROM public.events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- 1. Must be PAID
  IF v_event.payment_status IS DISTINCT FROM 'PAID' THEN
    RETURN false;
  END IF;

  -- 2. Must not be cancelled
  IF COALESCE(v_event.status, '') = 'cancelled'
     OR COALESCE(v_event.event_status, '') = 'CANCELLED'
     OR v_event.cancel_reason IS NOT NULL THEN
    RETURN false;
  END IF;

  -- 3. Singapore calendar date evaluation
  v_cur_date := (NOW() AT TIME ZONE 'Asia/Singapore')::date;

  v_start_date := COALESCE(
    CASE WHEN v_event.start_date ~ '^\d{4}-\d{2}-\d{2}$' THEN v_event.start_date::date ELSE NULL END,
    CASE WHEN v_event.event_date ~ '^\d{4}-\d{2}-\d{2}$' THEN v_event.event_date::date ELSE NULL END,
    (v_event.starts_at AT TIME ZONE 'Asia/Singapore')::date
  );

  v_end_date := COALESCE(
    CASE WHEN v_event.end_date ~ '^\d{4}-\d{2}-\d{2}$' THEN v_event.end_date::date ELSE NULL END,
    (v_event.expires_at AT TIME ZONE 'Asia/Singapore')::date,
    v_start_date
  );

  IF v_start_date IS NULL OR v_end_date IS NULL THEN
    RETURN false;
  END IF;

  -- 4. Public Live Window: current Singapore date >= start_date - 1 day AND current Singapore date <= end_date
  RETURN (v_cur_date >= (v_start_date - 1) AND v_cur_date <= v_end_date);
END;
$$;

-- ==============================================================================
-- 3. HARDENED RLS SELECT POLICY ON PUBLIC.EVENT_HIGH_SCORES
-- ==============================================================================

DROP POLICY IF EXISTS "Public can view event high scores" ON public.event_high_scores;
DROP POLICY IF EXISTS "Anyone can view high scores of published events" ON public.event_high_scores;

CREATE POLICY "Anyone can view high scores of published events"
  ON public.event_high_scores
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_high_scores.event_id
        AND (
          -- Path 1: Organization members and developer admins can always view their own event scores (including test scores)
          (auth.uid() IS NOT NULL AND public.get_org_role(e.organization_id) IS NOT NULL)
          OR public.is_developer_admin()
          -- Path 2: Public access requires the event to actually be in the public live window
          OR (
            e.payment_status = 'PAID'
            AND COALESCE(e.status, '') != 'cancelled'
            AND COALESCE(e.event_status, '') != 'CANCELLED'
            AND e.cancel_reason IS NULL
            AND (NOW() AT TIME ZONE 'Asia/Singapore')::date >= (
              COALESCE(
                CASE WHEN e.start_date ~ '^\d{4}-\d{2}-\d{2}$' THEN e.start_date::date ELSE NULL END,
                CASE WHEN e.event_date ~ '^\d{4}-\d{2}-\d{2}$' THEN e.event_date::date ELSE NULL END,
                (e.starts_at AT TIME ZONE 'Asia/Singapore')::date
              ) - 1
            )
            AND (NOW() AT TIME ZONE 'Asia/Singapore')::date <= (
              COALESCE(
                CASE WHEN e.end_date ~ '^\d{4}-\d{2}-\d{2}$' THEN e.end_date::date ELSE NULL END,
                (e.expires_at AT TIME ZONE 'Asia/Singapore')::date,
                CASE WHEN e.start_date ~ '^\d{4}-\d{2}-\d{2}$' THEN e.start_date::date ELSE NULL END,
                CASE WHEN e.event_date ~ '^\d{4}-\d{2}-\d{2}$' THEN e.event_date::date ELSE NULL END,
                (e.starts_at AT TIME ZONE 'Asia/Singapore')::date
              )
            )
            -- TEST scores should NEVER be exposed to public queries
            AND (event_high_scores.score_environment IS NULL OR event_high_scores.score_environment NOT IN ('test', 'TEST'))
            AND (event_high_scores.score_mode IS NULL OR event_high_scores.score_mode != 'TEST')
            AND (event_high_scores.is_test IS NOT TRUE)
            AND (event_high_scores.metadata IS NULL OR (
              (event_high_scores.metadata->>'score_mode') IS DISTINCT FROM 'TEST'
              AND (event_high_scores.metadata->>'score_environment') IS DISTINCT FROM 'test'
              AND (event_high_scores.metadata->>'score_environment') IS DISTINCT FROM 'TEST'
              AND (event_high_scores.metadata->>'is_test') IS DISTINCT FROM 'true'
            ))
          )
        )
    )
  );

GRANT SELECT ON public.event_high_scores TO authenticated;
GRANT SELECT ON public.event_high_scores TO anon;
