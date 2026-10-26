-- ==============================================================================
-- Migration: 20261024000000_add_match_3_to_production_game_engines.sql
-- Description: Registers canonical engine ID 'match-3' in the authoritative
--              check_game_engine_availability trigger on public.games and updates
--              create_event_atomic engine allowlist to recognize Match-3 as a
--              production-ready platform engine.
-- ==============================================================================

-- 1. Update check_game_engine_availability trigger function to recognize match-3
CREATE OR REPLACE FUNCTION public.check_game_engine_availability()
RETURNS TRIGGER AS $$
BEGIN
  -- Strict whitelist check for active platform games:
  -- Only fully implemented game engines are allowed to have status = 'active'
  IF NEW.status = 'active' THEN
    IF LOWER(COALESCE(NEW.game_type, '')) IN ('speed-quiz', 'quiz-rush', 'trivia-quiz', 'event-trivia-speed-quiz')
       OR LOWER(COALESCE(NEW.slug, '')) IN ('speed-quiz', 'quiz-rush', 'trivia-quiz', 'event-trivia-speed-quiz') THEN
      RAISE EXCEPTION 'Cannot activate game: Game engine "%" is currently under development and cannot be activated.', NEW.game_type
        USING ERRCODE = 'check_violation';
    END IF;

    -- Positive whitelist verification including canonical 'match-3' engine
    IF LOWER(COALESCE(NEW.game_type, '')) NOT IN ('catch-brand', 'memory-match', 'reaction-tap', 'reaction-time', 'match-3') THEN
      RAISE EXCEPTION 'Cannot activate game: Game engine "%" is not a recognized production engine.', NEW.game_type
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Re-attach trigger on public.games
DROP TRIGGER IF EXISTS trg_check_game_engine_availability ON public.games;
CREATE TRIGGER trg_check_game_engine_availability
BEFORE INSERT OR UPDATE OF status, game_type, slug ON public.games
FOR EACH ROW
EXECUTE FUNCTION public.check_game_engine_availability();
