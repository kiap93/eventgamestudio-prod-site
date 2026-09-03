-- Migration 016: Link Events directly to Games with ON DELETE RESTRICT
-- Ensures games are the single authoritative source of truth for events

-- 1. Ensure games status allows 'active', 'inactive', 'archived', 'draft'
ALTER TABLE public.games DROP CONSTRAINT IF EXISTS games_status_check;
ALTER TABLE public.games ADD CONSTRAINT games_status_check CHECK (status IN ('active', 'inactive', 'archived', 'draft'));

-- 2. Add game_id to events table if not already present
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS game_id UUID;

-- 3. Backfill events.game_id from game_themes.game_id
UPDATE public.events e
SET game_id = gt.game_id
FROM public.game_themes gt
WHERE e.game_theme_id = gt.id AND e.game_id IS NULL;

-- 4. If any events still have NULL game_id (e.g. orphan theme), assign to the canonical default system game
DO $$
DECLARE
  default_game_id UUID;
BEGIN
  SELECT id INTO default_game_id FROM public.games WHERE is_system = true OR organization_id IS NULL ORDER BY created_at ASC LIMIT 1;
  IF default_game_id IS NOT NULL THEN
    UPDATE public.events SET game_id = default_game_id WHERE game_id IS NULL;
  END IF;
END $$;

-- 5. Add Foreign Key Constraint ON DELETE RESTRICT on events.game_id
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS fk_events_game_id;
ALTER TABLE public.events
  ADD CONSTRAINT fk_events_game_id
  FOREIGN KEY (game_id) REFERENCES public.games (id) ON DELETE RESTRICT;

-- 6. Add Index on events.game_id for fast event lookups and referential integrity checks
CREATE INDEX IF NOT EXISTS idx_events_game_id ON public.events (game_id);
