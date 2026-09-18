-- Migration: 20260916010000_repair_events_game_theme_id_and_columns.sql
-- Description: Ensures game_theme_id column exists on public.events, migrates legacy theme_id if present,
--              and guarantees all canonical events columns, constraints, and indexes exist.
-- Architecture: Post-baseline forward migration repairing schema drift on public.events.

BEGIN;

-- 1. If legacy or mismatched column 'theme_id' exists on events, but 'game_theme_id' does not, rename it
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'theme_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'game_theme_id'
  ) THEN
    ALTER TABLE public.events RENAME COLUMN theme_id TO game_theme_id;
  END IF;

  -- Ensure game_id can be UUID if it was previously created as TEXT or VARCHAR
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'game_id' AND data_type IN ('text', 'character varying', 'character')
  ) THEN
    BEGIN
      -- First resolve any text game slugs to game UUIDs if possible
      UPDATE public.events e
      SET game_id = g.id::text
      FROM public.games g
      WHERE e.game_id = g.slug
        AND e.game_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

      -- Now alter column to UUID using regex check (subqueries are forbidden in USING clause)
      ALTER TABLE public.events ALTER COLUMN game_id TYPE UUID USING (
        CASE 
          WHEN game_id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN game_id::text::uuid
          ELSE NULL
        END
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  -- Ensure event_date, start_date, end_date are TEXT if they were created as DATE
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'start_date' AND data_type = 'date'
  ) THEN
    ALTER TABLE public.events ALTER COLUMN start_date TYPE TEXT USING to_char(start_date, 'YYYY-MM-DD');
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'end_date' AND data_type = 'date'
  ) THEN
    ALTER TABLE public.events ALTER COLUMN end_date TYPE TEXT USING to_char(end_date, 'YYYY-MM-DD');
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'event_date' AND data_type = 'date'
  ) THEN
    ALTER TABLE public.events ALTER COLUMN event_date TYPE TEXT USING to_char(event_date, 'YYYY-MM-DD');
  END IF;
END $$;

-- 2. Ensure all canonical columns exist on public.events
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS game_theme_id UUID REFERENCES public.game_themes (id) ON DELETE RESTRICT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS game_id UUID REFERENCES public.games (id) ON DELETE RESTRICT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS event_date TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS start_date TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS end_date TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft' NOT NULL;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS event_status TEXT DEFAULT 'DRAFT' NOT NULL;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'UNPAID' NOT NULL;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS payment_mode TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS event_price NUMERIC(10, 2) DEFAULT 1400.00 NOT NULL;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS event_currency TEXT DEFAULT 'MYR' NOT NULL;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(10, 2) DEFAULT 0.00;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10, 2) DEFAULT 0.00;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS public_token TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS test_scores_cleared_at TIMESTAMPTZ;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.users (id) ON DELETE SET NULL;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS event_timezone TEXT DEFAULT 'Asia/Singapore';

-- 3. Backfill public_token if missing on any existing rows
UPDATE public.events 
SET public_token = encode(gen_random_bytes(16), 'hex') 
WHERE public_token IS NULL;

-- 4. Backfill starts_at and expires_at if missing
UPDATE public.events 
SET starts_at = COALESCE(created_at, timezone('utc'::text, now())) 
WHERE starts_at IS NULL;

UPDATE public.events 
SET expires_at = COALESCE(starts_at + interval '1 day', timezone('utc'::text, now()) + interval '1 day') 
WHERE expires_at IS NULL;

-- 5. Backfill game_theme_id if missing on existing rows
UPDATE public.events e
SET game_theme_id = (
  SELECT id FROM public.game_themes gt 
  WHERE gt.game_id::text = e.game_id::text 
     OR gt.game_id IN (SELECT g.id FROM public.games g WHERE g.slug = e.game_id::text)
     OR gt.is_system = true 
  ORDER BY gt.is_default DESC, gt.created_at ASC 
  LIMIT 1
)
WHERE e.game_theme_id IS NULL;

UPDATE public.events e
SET game_theme_id = (
  SELECT id FROM public.game_themes 
  ORDER BY created_at ASC 
  LIMIT 1
)
WHERE e.game_theme_id IS NULL;

-- 6. Ensure indexes on public.events exist safely
CREATE INDEX IF NOT EXISTS idx_events_org_id ON public.events (organization_id);
CREATE INDEX IF NOT EXISTS idx_events_game_id ON public.events (game_id);
CREATE INDEX IF NOT EXISTS idx_events_game_theme_id ON public.events (game_theme_id);
CREATE INDEX IF NOT EXISTS idx_events_public_token ON public.events (public_token);
CREATE INDEX IF NOT EXISTS idx_events_status ON public.events (status);
CREATE INDEX IF NOT EXISTS idx_events_event_status ON public.events (event_status);
CREATE INDEX IF NOT EXISTS idx_events_payment_status ON public.events (payment_status);
CREATE INDEX IF NOT EXISTS idx_events_event_timezone ON public.events (event_timezone);
CREATE INDEX IF NOT EXISTS idx_events_starts_at ON public.events (starts_at);
CREATE INDEX IF NOT EXISTS idx_events_expires_at ON public.events (expires_at);
CREATE INDEX IF NOT EXISTS idx_events_start_date ON public.events (start_date);
CREATE INDEX IF NOT EXISTS idx_events_end_date ON public.events (end_date);
CREATE INDEX IF NOT EXISTS idx_events_starts_expires ON public.events (starts_at, expires_at);
CREATE INDEX IF NOT EXISTS idx_events_lifecycle_cron ON public.events (event_status, starts_at, payment_status);
CREATE INDEX IF NOT EXISTS idx_events_completed_cron ON public.events (payment_status, expires_at, event_status);
CREATE INDEX IF NOT EXISTS idx_events_test_scores_cleared ON public.events (test_scores_cleared_at, event_date, starts_at);

-- 7. Ensure event_showcases columns and indexes exist safely
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'event_showcases' AND column_name = 'theme_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'event_showcases' AND column_name = 'game_theme_id'
  ) THEN
    ALTER TABLE public.event_showcases RENAME COLUMN theme_id TO game_theme_id;
  END IF;
END $$;

ALTER TABLE public.event_showcases ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.event_showcases ADD COLUMN IF NOT EXISTS client_name TEXT;
ALTER TABLE public.event_showcases ADD COLUMN IF NOT EXISTS client_logo_url TEXT;
ALTER TABLE public.event_showcases ADD COLUMN IF NOT EXISTS cover_image_url TEXT;
ALTER TABLE public.event_showcases ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'DRAFT' NOT NULL;
ALTER TABLE public.event_showcases ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'DRAFT' NOT NULL;
ALTER TABLE public.event_showcases ADD COLUMN IF NOT EXISTS publication_status TEXT DEFAULT 'UNPUBLISHED' NOT NULL;
ALTER TABLE public.event_showcases ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;
ALTER TABLE public.event_showcases ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE public.event_showcases ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.event_showcases ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE public.event_showcases ADD COLUMN IF NOT EXISTS reward_transaction_id UUID REFERENCES public.wallet_transactions(id) ON DELETE SET NULL;
ALTER TABLE public.event_showcases ADD COLUMN IF NOT EXISTS reward_granted_at TIMESTAMPTZ;
ALTER TABLE public.event_showcases ADD COLUMN IF NOT EXISTS reward_status TEXT DEFAULT 'PENDING';
ALTER TABLE public.event_showcases ADD COLUMN IF NOT EXISTS reward_review_status TEXT DEFAULT 'NOT_ELIGIBLE';
ALTER TABLE public.event_showcases ADD COLUMN IF NOT EXISTS reward_reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.event_showcases ADD COLUMN IF NOT EXISTS reward_reviewed_at TIMESTAMPTZ;
ALTER TABLE public.event_showcases ADD COLUMN IF NOT EXISTS reward_rejection_reason TEXT;
ALTER TABLE public.event_showcases ADD COLUMN IF NOT EXISTS moderated_by UUID REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.event_showcases ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMPTZ;
ALTER TABLE public.event_showcases ADD COLUMN IF NOT EXISTS moderation_reason TEXT;
ALTER TABLE public.event_showcases ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.event_showcases ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

-- 8. Ensure organization_wallets and wallet_topup_orders have post-baseline columns
ALTER TABLE public.organization_wallets 
  ADD COLUMN IF NOT EXISTS outstanding_balance NUMERIC(12, 2) DEFAULT 0.00 NOT NULL;

ALTER TABLE public.wallet_topup_orders 
  ADD COLUMN IF NOT EXISTS included_outstanding_amount NUMERIC(10, 2) DEFAULT 0.00 NOT NULL;
ALTER TABLE public.wallet_topup_orders 
  ADD COLUMN IF NOT EXISTS payable_amount NUMERIC(10, 2);
ALTER TABLE public.wallet_topup_orders 
  ADD COLUMN IF NOT EXISTS total_due NUMERIC(10, 2);

-- 9. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

COMMIT;
