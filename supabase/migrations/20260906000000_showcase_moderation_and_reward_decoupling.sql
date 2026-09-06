-- ==============================================================================
-- Migration: 20260906000000_showcase_moderation_and_reward_decoupling.sql
-- Decouples showcase content visibility from financial reward status.
-- Implements "Publish First, Moderate Later" (Visibility approval does not exist).
-- ==============================================================================

-- 1. Extend the status CHECK constraint on public.event_showcases
ALTER TABLE public.event_showcases 
  DROP CONSTRAINT IF EXISTS event_showcases_status_check;

ALTER TABLE public.event_showcases 
  ADD CONSTRAINT event_showcases_status_check 
  CHECK (status IN ('DRAFT', 'PUBLISHED', 'UNPUBLISHED', 'BLOCKED', 'DELETED'));

-- 2. Add Dedicated Reward and Moderation Audit Columns
ALTER TABLE public.event_showcases
  ADD COLUMN IF NOT EXISTS reward_review_status TEXT DEFAULT 'NOT_ELIGIBLE' 
    CHECK (reward_review_status IN ('NOT_ELIGIBLE', 'AWAITING_APPROVAL', 'REWARDED', 'REJECTED')),
  ADD COLUMN IF NOT EXISTS reward_reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reward_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reward_rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS moderated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS moderation_reason TEXT,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 3. Backfill reward_review_status based on existing records
UPDATE public.event_showcases
SET reward_review_status = CASE
  WHEN review_status = 'APPROVED' OR reward_status = 'REWARDED' OR reward_status = 'GRANTED' THEN 'REWARDED'
  WHEN review_status = 'SUBMITTED' OR reward_status = 'PENDING' THEN 'AWAITING_APPROVAL'
  WHEN review_status = 'REJECTED' THEN 'REJECTED'
  ELSE 'NOT_ELIGIBLE'
END
WHERE reward_review_status IS NULL OR reward_review_status = 'NOT_ELIGIBLE';

-- 4. Create Showcase Moderation History / Audit Table
CREATE TABLE IF NOT EXISTS public.showcase_moderation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  showcase_id UUID NOT NULL REFERENCES public.event_showcases(id) ON DELETE CASCADE,
  moderator_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('BLOCK', 'UNBLOCK', 'DELETE', 'RESTORE')),
  reason TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_showcase_mod_logs_showcase_id 
  ON public.showcase_moderation_logs(showcase_id);
CREATE INDEX IF NOT EXISTS idx_showcase_mod_logs_moderator_id 
  ON public.showcase_moderation_logs(moderator_id);
CREATE INDEX IF NOT EXISTS idx_showcase_mod_logs_created_at 
  ON public.showcase_moderation_logs(created_at DESC);

-- 5. Enable RLS on moderation logs
ALTER TABLE public.showcase_moderation_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Developer admins can view moderation logs" ON public.showcase_moderation_logs;
CREATE POLICY "Developer admins can view moderation logs"
  ON public.showcase_moderation_logs FOR SELECT
  USING (public.is_developer_admin());

DROP POLICY IF EXISTS "Developer admins can insert moderation logs" ON public.showcase_moderation_logs;
CREATE POLICY "Developer admins can insert moderation logs"
  ON public.showcase_moderation_logs FOR INSERT
  WITH CHECK (public.is_developer_admin());

-- 6. Update Row Level Security (RLS) Policies on event_showcases
DROP POLICY IF EXISTS "Anyone can view published showcases or org members" ON public.event_showcases;
DROP POLICY IF EXISTS "Public can view active published showcases" ON public.event_showcases;

CREATE POLICY "Public can view active published showcases"
  ON public.event_showcases FOR SELECT
  USING (
    (status = 'PUBLISHED' AND deleted_at IS NULL)
    OR (public.is_org_member(organization_id) AND deleted_at IS NULL)
    OR public.is_developer_admin()
  );

DROP POLICY IF EXISTS "Owners, admins, designers can update event showcases" ON public.event_showcases;
CREATE POLICY "Owners, admins, designers can update event showcases"
  ON public.event_showcases FOR UPDATE
  USING (
    (
      public.has_org_permission(organization_id, 'event.edit')
      AND status != 'BLOCKED'
      AND status != 'DELETED'
      AND deleted_at IS NULL
    )
    OR public.is_developer_admin()
  )
  WITH CHECK (
    (
      public.has_org_permission(organization_id, 'event.edit')
      AND status IN ('DRAFT', 'PUBLISHED', 'UNPUBLISHED')
      AND deleted_at IS NULL
    )
    OR public.is_developer_admin()
  );
