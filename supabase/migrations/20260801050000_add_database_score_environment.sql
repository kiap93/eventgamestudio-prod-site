-- ==============================================================================
-- Migration 026: Add Database Support for Score Environment (TEST vs LIVE)
-- ==============================================================================

-- 1. Add score_environment column to event_high_scores if not already present
ALTER TABLE IF EXISTS public.event_high_scores
  ADD COLUMN IF NOT EXISTS score_environment VARCHAR(20) DEFAULT 'live';

-- 2. Backfill existing rows to ensure compatibility with existing score data
-- If is_test is true, legacy score_mode is TEST, or metadata indicates test, set to 'test', otherwise 'live'
UPDATE public.event_high_scores
  SET score_environment = CASE
    WHEN is_test = true
      OR score_mode = 'TEST'
      OR (metadata->>'score_environment') ILIKE 'test'
      OR (metadata->>'score_mode') ILIKE 'test'
      OR (metadata->>'is_test') = 'true'
    THEN 'test'
    ELSE 'live'
  END
WHERE score_environment IS NULL OR score_environment = '';

-- 3. Add CHECK constraint allowing 'test' and 'live'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'event_high_scores_score_environment_check'
  ) THEN
    ALTER TABLE public.event_high_scores
      ADD CONSTRAINT event_high_scores_score_environment_check
      CHECK (score_environment IN ('test', 'live', 'TEST', 'LIVE'));
  END IF;
END $$;

-- 4. Composite index for optimal query performance on score_environment filtered leaderboards
CREATE INDEX IF NOT EXISTS idx_event_high_scores_score_environment
  ON public.event_high_scores (event_id, score_environment, score DESC, created_at ASC);
