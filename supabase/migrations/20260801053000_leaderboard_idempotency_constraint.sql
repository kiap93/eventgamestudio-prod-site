-- ==============================================================================
-- Migration 029: Global Leaderboard Idempotency Constraint
-- ==============================================================================

-- 1. Ensure public.event_high_scores has session_id column for canonical idempotency
ALTER TABLE IF EXISTS public.event_high_scores
  ADD COLUMN IF NOT EXISTS session_id VARCHAR(100);

-- 2. Backfill session_id from existing metadata (sessionId, session_id, playId, play_id)
UPDATE public.event_high_scores
SET session_id = COALESCE(
  NULLIF(TRIM(metadata->>'sessionId'), ''),
  NULLIF(TRIM(metadata->>'session_id'), ''),
  NULLIF(TRIM(metadata->>'playId'), ''),
  NULLIF(TRIM(metadata->>'play_id'), '')
)
WHERE (session_id IS NULL OR session_id = '')
  AND (
    metadata->>'sessionId' IS NOT NULL
    OR metadata->>'session_id' IS NOT NULL
    OR metadata->>'playId' IS NOT NULL
    OR metadata->>'play_id' IS NOT NULL
  );

-- 3. Deduplicate any existing duplicate (event_id, session_id) rows if present,
-- strictly preserving the highest score and earliest submission
WITH duplicates AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY event_id, session_id
           ORDER BY score DESC, created_at ASC, id ASC
         ) as rn
  FROM public.event_high_scores
  WHERE session_id IS NOT NULL AND session_id <> ''
)
DELETE FROM public.event_high_scores
WHERE id IN (SELECT id FROM duplicates WHERE rn > 1);

-- 4. Create database-level unique index on (event_id, session_id)
-- Guarantees cross-worker and multi-instance idempotency at the database engine level
CREATE UNIQUE INDEX IF NOT EXISTS uq_event_high_scores_event_session
  ON public.event_high_scores (event_id, session_id)
  WHERE session_id IS NOT NULL AND session_id <> '';

-- 5. Additional index on (event_id, (metadata->>'sessionId')) for legacy JSONB lookups
CREATE INDEX IF NOT EXISTS idx_event_high_scores_metadata_session_id
  ON public.event_high_scores (event_id, (metadata->>'sessionId'))
  WHERE metadata->>'sessionId' IS NOT NULL;
