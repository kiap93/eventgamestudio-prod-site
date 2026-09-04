-- ==============================================================================
-- Migration 025: Support 3-tier Score Environments (PREVIEW, TEST, LIVE)
-- ==============================================================================

-- Optional columns for high score table to explicitly distinguish score environments
ALTER TABLE IF EXISTS public.event_high_scores
  ADD COLUMN IF NOT EXISTS score_mode VARCHAR(20) DEFAULT 'LIVE',
  ADD COLUMN IF NOT EXISTS is_test BOOLEAN DEFAULT false;

-- Indexes for mode-filtered leaderboard queries and cleanup
CREATE INDEX IF NOT EXISTS idx_event_high_scores_mode 
  ON public.event_high_scores (event_id, score_mode);

CREATE INDEX IF NOT EXISTS idx_event_high_scores_is_test
  ON public.event_high_scores (event_id, is_test);
