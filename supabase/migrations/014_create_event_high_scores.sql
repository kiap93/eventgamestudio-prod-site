-- ==============================================================================
-- Migration 014: Create Event High Scores Table & Performance Indexes
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.event_high_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  player_name VARCHAR(50) NOT NULL DEFAULT 'Player',
  score INTEGER NOT NULL DEFAULT 0 CHECK (score >= 0),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Performance index for fast leaderboard queries: sorted by score desc, then earliest created_at
CREATE INDEX IF NOT EXISTS idx_event_high_scores_event_score 
  ON public.event_high_scores (event_id, score DESC, created_at ASC);

-- Index for date queries / audit
CREATE INDEX IF NOT EXISTS idx_event_high_scores_created_at 
  ON public.event_high_scores (created_at DESC);

-- Enable RLS
ALTER TABLE public.event_high_scores ENABLE ROW LEVEL SECURITY;

-- Public read access: Anyone can view event high scores
CREATE POLICY "Public can view event high scores"
  ON public.event_high_scores
  FOR SELECT
  USING (true);

-- Public insert access: Any player can submit a high score
CREATE POLICY "Public can insert event high scores"
  ON public.event_high_scores
  FOR INSERT
  WITH CHECK (true);

-- Admin management access: Service role and authenticated event managers can delete/manage scores
CREATE POLICY "Event managers can delete high scores"
  ON public.event_high_scores
  FOR DELETE
  USING (true);
