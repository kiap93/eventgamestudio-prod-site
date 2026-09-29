-- Migration: 20261007000000_add_event_and_content_translations.sql
-- Description: Centralized localization tables for user-generated content (events, showcases, game instructions) and async translation jobs.

-- 1. Create event_translations table
CREATE TABLE IF NOT EXISTS public.event_translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  language_code TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  game_instructions TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_event_translations_event_lang UNIQUE (event_id, language_code)
);

CREATE INDEX IF NOT EXISTS idx_event_translations_event_id
  ON public.event_translations (event_id);

CREATE INDEX IF NOT EXISTS idx_event_translations_lang
  ON public.event_translations (language_code);

-- 2. Create showcase_translations table
CREATE TABLE IF NOT EXISTS public.showcase_translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  showcase_id UUID NOT NULL REFERENCES public.event_showcases(id) ON DELETE CASCADE,
  language_code TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  cta_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_showcase_translations_showcase_lang UNIQUE (showcase_id, language_code)
);

CREATE INDEX IF NOT EXISTS idx_showcase_translations_showcase_id
  ON public.showcase_translations (showcase_id);

CREATE INDEX IF NOT EXISTS idx_showcase_translations_lang
  ON public.showcase_translations (language_code);

-- 3. Create translation_jobs table
CREATE TABLE IF NOT EXISTS public.translation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  source_language TEXT NOT NULL,
  target_language TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
  provider TEXT NOT NULL DEFAULT 'gemini',
  error TEXT,
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_translation_jobs_entity
  ON public.translation_jobs (entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_translation_jobs_status
  ON public.translation_jobs (status);

-- 4. Enable RLS
ALTER TABLE public.event_translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.showcase_translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.translation_jobs ENABLE ROW LEVEL SECURITY;

-- 5. Safe Read Policies (Public read for active/published content, authenticated read for tenant members)
DROP POLICY IF EXISTS "Public and members can view event translations" ON public.event_translations;
CREATE POLICY "Public and members can view event translations"
  ON public.event_translations
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Public and members can view showcase translations" ON public.showcase_translations;
CREATE POLICY "Public and members can view showcase translations"
  ON public.showcase_translations
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Service role has full access to translation_jobs" ON public.translation_jobs;
CREATE POLICY "Service role has full access to translation_jobs"
  ON public.translation_jobs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Backend Write Only: Writes to event_translations and showcase_translations are strictly reserved for service_role
DROP POLICY IF EXISTS "Service role full access to event_translations" ON public.event_translations;
CREATE POLICY "Service role full access to event_translations"
  ON public.event_translations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access to showcase_translations" ON public.showcase_translations;
CREATE POLICY "Service role full access to showcase_translations"
  ON public.showcase_translations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
