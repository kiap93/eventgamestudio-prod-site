-- ============================================================================
-- Migration: 20261002000000_create_showcase_reward_submissions.sql
-- Description: Create dedicated showcase_reward_submissions table for
--              user-initiated RM300 Showcase Reward submissions and admin approvals.
--
-- Business Rules:
-- 1. Showcase Reward is strictly an OWNER-LEVEL one-time lifetime promotion.
-- 2. Explicit submission workflow:
--    User clicks "Submit for RM300 Reward" -> PENDING submission record.
-- 3. Admin reviews submission in dedicated Pending Reward Approvals queue ->
--    APPROVE (grants RM300 once) or REJECT (with feedback).
-- 4. Database-level constraints enforce:
--    - Maximum 1 PENDING submission per user at a time
--    - Maximum 1 PENDING submission per showcase at a time
--    - Maximum 1 APPROVED submission per user lifetime
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.showcase_reward_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  showcase_id UUID NOT NULL REFERENCES public.event_showcases(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  reward_amount NUMERIC(12, 2) NOT NULL DEFAULT 300.00,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  rejection_reason TEXT,
  reward_transaction_id UUID REFERENCES public.wallet_transactions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Unique constraint: A user can have at most ONE pending submission at a time
CREATE UNIQUE INDEX IF NOT EXISTS ux_showcase_reward_submissions_user_pending
  ON public.showcase_reward_submissions (user_id)
  WHERE status = 'PENDING';

-- Unique constraint: A showcase can have at most ONE pending submission at a time
CREATE UNIQUE INDEX IF NOT EXISTS ux_showcase_reward_submissions_showcase_pending
  ON public.showcase_reward_submissions (showcase_id)
  WHERE status = 'PENDING';

-- Unique constraint: A user can have at most ONE approved submission in their lifetime
CREATE UNIQUE INDEX IF NOT EXISTS ux_showcase_reward_submissions_user_approved
  ON public.showcase_reward_submissions (user_id)
  WHERE status = 'APPROVED';

-- General indexing for performance
CREATE INDEX IF NOT EXISTS idx_showcase_reward_submissions_status 
  ON public.showcase_reward_submissions (status);

CREATE INDEX IF NOT EXISTS idx_showcase_reward_submissions_user_id 
  ON public.showcase_reward_submissions (user_id);

CREATE INDEX IF NOT EXISTS idx_showcase_reward_submissions_showcase_id 
  ON public.showcase_reward_submissions (showcase_id);

CREATE INDEX IF NOT EXISTS idx_showcase_reward_submissions_event_id 
  ON public.showcase_reward_submissions (event_id);

CREATE INDEX IF NOT EXISTS idx_showcase_reward_submissions_submitted_at 
  ON public.showcase_reward_submissions (submitted_at ASC);

-- Enable RLS
ALTER TABLE public.showcase_reward_submissions ENABLE ROW LEVEL SECURITY;

-- Backend / Service Role write-only access policy (matching other financial / reward tables)
DROP POLICY IF EXISTS "Service role full access on showcase_reward_submissions" ON public.showcase_reward_submissions;
CREATE POLICY "Service role full access on showcase_reward_submissions"
  ON public.showcase_reward_submissions
  FOR ALL
  TO service_role, postgres
  USING (true)
  WITH CHECK (true);

-- Authenticated read-only policy for owners to view their own submissions
DROP POLICY IF EXISTS "Users can view own reward submissions" ON public.showcase_reward_submissions;
CREATE POLICY "Users can view own reward submissions"
  ON public.showcase_reward_submissions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

COMMENT ON TABLE public.showcase_reward_submissions IS
  'Dedicated user-initiated RM300 showcase reward submissions and administrative approval lifecycle records.';
