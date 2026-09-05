-- ==============================================================================
-- MIGRATION: 010_event_showcase_review_workflow.sql
-- EVENT SHOWCASE SUBMISSION & DEVELOPER REVIEW WORKFLOW
-- ==============================================================================

-- 1. Add review and publication workflow columns to event_showcases
ALTER TABLE public.event_showcases 
  ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (review_status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED')),
  ADD COLUMN IF NOT EXISTS publication_status TEXT NOT NULL DEFAULT 'UNPUBLISHED' CHECK (publication_status IN ('UNPUBLISHED', 'PUBLISHED')),
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS reward_transaction_id UUID REFERENCES public.wallet_transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reward_granted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reward_status TEXT DEFAULT 'PENDING' CHECK (reward_status IN ('PENDING', 'REWARDED', 'NOT_ELIGIBLE'));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_event_showcases_review_status ON public.event_showcases (review_status);
CREATE INDEX IF NOT EXISTS idx_event_showcases_publication_status ON public.event_showcases (publication_status);
CREATE INDEX IF NOT EXISTS idx_event_showcases_reward_status ON public.event_showcases (reward_status);
