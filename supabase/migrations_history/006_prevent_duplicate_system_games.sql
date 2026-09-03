-- ==============================================================================
-- MIGRATION 006: Prevent Duplicate System Games & Enforce 1 System Game Per Game Type
-- ==============================================================================
-- Description:
--   Enforces that the platform can register only ONE system game per `game_type`
--   and ensures unique slugs for system games.
--
-- Hierarchy:
--   Platform Game (System: 1 per game_type)
--     └── Multiple System Default Themes
--           └── Client / Tenant clones into Organization Theme
--                 └── Event (binds to specific game_theme_id)
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. CLEAN UP / MERGE ANY EXISTING DUPLICATE SYSTEM GAMES
-- ------------------------------------------------------------------------------
-- Step 1A: Deduplicate by game_type for system games (is_system = true OR organization_id IS NULL)
DO $$
DECLARE
  rec RECORD;
  canonical_id UUID;
  dup RECORD;
BEGIN
  -- Find duplicate game_types among system games
  FOR rec IN
    SELECT game_type, COUNT(*) as count
    FROM public.games
    WHERE is_system = true OR organization_id IS NULL
    GROUP BY game_type
    HAVING COUNT(*) > 1
  LOOP
    -- Pick canonical game: Prefer the one with the most themes, or the earliest created
    SELECT g.id INTO canonical_id
    FROM public.games g
    LEFT JOIN (
      SELECT game_id, COUNT(*) as theme_cnt
      FROM public.game_themes
      GROUP BY game_id
    ) t ON t.game_id = g.id
    WHERE (g.is_system = true OR g.organization_id IS NULL)
      AND g.game_type = rec.game_type
    ORDER BY COALESCE(t.theme_cnt, 0) DESC, g.created_at ASC
    LIMIT 1;

    -- For each duplicate system game with the same game_type, merge themes & reassign
    FOR dup IN
      SELECT id, name, slug
      FROM public.games
      WHERE (is_system = true OR organization_id IS NULL)
        AND game_type = rec.game_type
        AND id != canonical_id
    LOOP
      RAISE NOTICE 'Merging duplicate system game "%" (%) into canonical game % for game_type %', dup.name, dup.id, canonical_id, rec.game_type;

      -- Reassign any themes pointing to the duplicate game
      UPDATE public.game_themes
      SET game_id = canonical_id
      WHERE game_id = dup.id;

      -- Delete the duplicate system game
      DELETE FROM public.games
      WHERE id = dup.id;
    END LOOP;
  END LOOP;
END $$;

-- Step 1B: Deduplicate by slug for system games
DO $$
DECLARE
  rec RECORD;
  canonical_id UUID;
  dup RECORD;
BEGIN
  -- Find duplicate slugs among system games
  FOR rec IN
    SELECT slug, COUNT(*) as count
    FROM public.games
    WHERE is_system = true OR organization_id IS NULL
    GROUP BY slug
    HAVING COUNT(*) > 1
  LOOP
    -- Pick canonical game
    SELECT id INTO canonical_id
    FROM public.games
    WHERE (is_system = true OR organization_id IS NULL)
      AND slug = rec.slug
    ORDER BY created_at ASC
    LIMIT 1;

    -- For duplicate system games with the same slug, merge & delete
    FOR dup IN
      SELECT id, name
      FROM public.games
      WHERE (is_system = true OR organization_id IS NULL)
        AND slug = rec.slug
        AND id != canonical_id
    LOOP
      RAISE NOTICE 'Merging duplicate slug system game "%" (%) into canonical game % for slug %', dup.name, dup.id, canonical_id, rec.slug;

      UPDATE public.game_themes
      SET game_id = canonical_id
      WHERE game_id = dup.id;

      DELETE FROM public.games
      WHERE id = dup.id;
    END LOOP;
  END LOOP;
END $$;

-- Ensure all system games have is_system = true and ownership_type = 'system'
UPDATE public.games
SET is_system = true,
    ownership_type = 'system'
WHERE organization_id IS NULL;

-- ------------------------------------------------------------------------------
-- 2. CREATE UNIQUE PARTIAL INDEXES FOR SYSTEM GAMES
-- ------------------------------------------------------------------------------

-- Unique partial index on game_type for system games: Exactly ONE system game per game_type
CREATE UNIQUE INDEX IF NOT EXISTS ux_system_games_game_type
ON public.games (game_type)
WHERE is_system = true;

-- Unique partial index on slug for system games: Unique URL-friendly slug
CREATE UNIQUE INDEX IF NOT EXISTS ux_system_games_slug
ON public.games (slug)
WHERE is_system = true;

COMMIT;
