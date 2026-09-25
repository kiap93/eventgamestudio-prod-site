-- ============================================================================
-- Migration: 20261004000000_authoritative_showcase_reward_eligibility_rpc.sql
-- Description: Authoritative Database-Level Showcase Reward Eligibility RPC
--
-- Consolidates the complete reward eligibility waterfall into ONE database-level
-- authoritative function:
--   owner eligibility
--         ↓
--   showcase eligibility
--         ↓
--   published
--         ↓
--   event started
--         ↓
--   content quality
--         ↓
--   media requirements
--         ↓
--   user lifetime eligibility (user_rewards, wallet_transactions, approved submissions)
--         ↓
--   pending submission (at most 1 active pending claim across platform)
--
-- This guarantees UI, API, and Database share the EXACT same single source of truth.
-- ============================================================================

-- 1. Authoritative Showcase Reward Eligibility RPC
CREATE OR REPLACE FUNCTION public.check_showcase_reward_eligibility(
  p_event_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_showcase_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := p_user_id;
  v_event_id UUID := p_event_id;
  v_showcase_id UUID := p_showcase_id;
  v_user RECORD;
  v_event RECORD;
  v_org RECORD;
  v_showcase RECORD;
  v_user_reward RECORD;
  v_existing_credit RECORD;
  v_approved_sub RECORD;
  v_pending_sub RECORD;
  v_this_sub RECORD;
  v_desc_len INTEGER := 0;
  v_photo_count INTEGER := 0;
  v_video_count INTEGER := 0;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
BEGIN
  -- Resolve showcase / event if one is provided
  IF v_showcase_id IS NOT NULL AND v_event_id IS NULL THEN
    SELECT event_id INTO v_event_id FROM public.event_showcases WHERE id = v_showcase_id;
  END IF;

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'eligible', false,
      'code', 'UNAUTHORIZED',
      'reason', 'Authenticated user ID is required to verify reward eligibility.',
      'userRewardStatus', 'NOT_ELIGIBLE',
      'alreadyClaimed', false,
      'hasReceivedReward', false,
      'hasPendingSubmission', false
    );
  END IF;

  -- 1. Verify User Exists
  SELECT id, email, is_developer INTO v_user FROM public.users WHERE id = v_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'eligible', false,
      'code', 'USER_NOT_FOUND',
      'reason', 'User account could not be found.',
      'userRewardStatus', 'NOT_ELIGIBLE',
      'alreadyClaimed', false,
      'hasReceivedReward', false,
      'hasPendingSubmission', false
    );
  END IF;

  -- 2. User Lifetime Invariant Check (Across ALL organizations & events)
  -- 2A. Check user_rewards table
  SELECT * INTO v_user_reward
  FROM public.user_rewards
  WHERE user_id = v_user_id
    AND reward_type IN ('SHOWCASE_CREDIT', 'SHOWCASE_REWARD', 'SHOWCASE_REWARD_RM300')
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'eligible', false,
      'code', 'LIFETIME_REWARD_EXHAUSTED',
      'reason', 'RM300 Showcase Reward has already been claimed for this account.',
      'userRewardStatus', 'REWARDED',
      'alreadyClaimed', true,
      'hasReceivedReward', true,
      'hasPendingSubmission', false
    );
  END IF;

  -- 2B. Check wallet_transactions table
  SELECT * INTO v_existing_credit
  FROM public.wallet_transactions
  WHERE (owner_user_id = v_user_id OR created_by = v_user_id)
    AND transaction_type = 'SHOWCASE_CREDIT'
    AND status = 'COMPLETED'
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'eligible', false,
      'code', 'LIFETIME_REWARD_EXHAUSTED',
      'reason', 'RM300 Showcase Reward has already been claimed for this account.',
      'userRewardStatus', 'REWARDED',
      'alreadyClaimed', true,
      'hasReceivedReward', true,
      'hasPendingSubmission', false
    );
  END IF;

  -- 2C. Check showcase_reward_submissions for any APPROVED submission by this user
  SELECT * INTO v_approved_sub
  FROM public.showcase_reward_submissions
  WHERE user_id = v_user_id
    AND status = 'APPROVED'
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'eligible', false,
      'code', 'LIFETIME_REWARD_EXHAUSTED',
      'reason', 'RM300 Showcase Reward has already been claimed for this account.',
      'userRewardStatus', 'REWARDED',
      'alreadyClaimed', true,
      'hasReceivedReward', true,
      'hasPendingSubmission', false
    );
  END IF;

  -- 3. Check Pending Submissions across ANY event/showcase (Max 1 active pending claim)
  SELECT * INTO v_pending_sub
  FROM public.showcase_reward_submissions
  WHERE user_id = v_user_id
    AND status = 'PENDING'
  LIMIT 1;

  IF FOUND THEN
    IF v_event_id IS NOT NULL AND v_pending_sub.event_id = v_event_id THEN
      RETURN jsonb_build_object(
        'eligible', false,
        'code', 'SUBMISSION_PENDING',
        'reason', 'Your RM300 reward submission is waiting for admin approval.',
        'userRewardStatus', 'NOT_ELIGIBLE',
        'alreadyClaimed', false,
        'hasReceivedReward', false,
        'hasPendingSubmission', true,
        'pendingSubmissionId', v_pending_sub.id
      );
    ELSE
      RETURN jsonb_build_object(
        'eligible', false,
        'code', 'SUBMISSION_PENDING',
        'reason', 'You already have an RM300 showcase reward submission pending review for your account. Only one active claim is allowed at a time.',
        'userRewardStatus', 'NOT_ELIGIBLE',
        'alreadyClaimed', false,
        'hasReceivedReward', false,
        'hasPendingSubmission', true,
        'pendingSubmissionId', v_pending_sub.id
      );
    END IF;
  END IF;

  -- If no event_id was provided, user has passed all user-level lifetime checks
  IF v_event_id IS NULL THEN
    RETURN jsonb_build_object(
      'eligible', true,
      'code', 'USER_ELIGIBLE',
      'reason', 'User account is eligible to submit an event showcase for RM300 reward.',
      'userRewardStatus', 'ELIGIBLE',
      'alreadyClaimed', false,
      'hasReceivedReward', false,
      'hasPendingSubmission', false
    );
  END IF;

  -- 4. Check Event Existence & Organization Ownership (Owner-level promotion only)
  SELECT * INTO v_event FROM public.events WHERE id = v_event_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'eligible', false,
      'code', 'EVENT_NOT_FOUND',
      'reason', 'Event not found.',
      'userRewardStatus', 'NOT_ELIGIBLE',
      'alreadyClaimed', false,
      'hasReceivedReward', false,
      'hasPendingSubmission', false
    );
  END IF;

  SELECT * INTO v_org FROM public.organizations WHERE id = v_event.organization_id;
  IF NOT FOUND OR v_org.owner_id <> v_user_id THEN
    RETURN jsonb_build_object(
      'eligible', false,
      'code', 'OWNER_ONLY_REWARD',
      'reason', 'Only organization owners are eligible to submit for the RM300 Showcase Reward. Organization members cannot receive promotional rewards.',
      'userRewardStatus', 'NOT_ELIGIBLE',
      'alreadyClaimed', false,
      'hasReceivedReward', false,
      'hasPendingSubmission', false
    );
  END IF;

  -- 5. Check Event Payment Status
  IF v_event.payment_status <> 'PAID' THEN
    RETURN jsonb_build_object(
      'eligible', false,
      'code', 'EVENT_NOT_PAID',
      'reason', 'Showcase reward requires a confirmed, paid event that is live or completed.',
      'userRewardStatus', 'NOT_ELIGIBLE',
      'alreadyClaimed', false,
      'hasReceivedReward', false,
      'hasPendingSubmission', false
    );
  END IF;

  -- 6. Check Event Started / Timing (LIVE, COMPLETED, or start_date <= today in Asia/Singapore UTC+8)
  IF v_event.status NOT IN ('LIVE', 'COMPLETED') AND (v_event.start_date IS NULL OR v_event.start_date > (v_now AT TIME ZONE 'Asia/Singapore')::date) THEN
    RETURN jsonb_build_object(
      'eligible', false,
      'code', 'EVENT_NOT_STARTED',
      'reason', 'Showcase reward submission is available once the event starts.',
      'userRewardStatus', 'NOT_ELIGIBLE',
      'alreadyClaimed', false,
      'hasReceivedReward', false,
      'hasPendingSubmission', false
    );
  END IF;

  -- 7. Check Showcase Existence & Publication Status
  SELECT * INTO v_showcase
  FROM public.event_showcases
  WHERE event_id = v_event_id
    AND deleted_at IS NULL
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'eligible', false,
      'code', 'SHOWCASE_NOT_FOUND',
      'reason', 'Save your showcase first before submitting for the RM300 reward.',
      'userRewardStatus', 'NOT_ELIGIBLE',
      'alreadyClaimed', false,
      'hasReceivedReward', false,
      'hasPendingSubmission', false
    );
  END IF;

  IF v_showcase.status = 'BLOCKED' THEN
    RETURN jsonb_build_object(
      'eligible', false,
      'code', 'SHOWCASE_BLOCKED',
      'reason', 'Showcase is blocked and cannot receive rewards.',
      'userRewardStatus', 'NOT_ELIGIBLE',
      'alreadyClaimed', false,
      'hasReceivedReward', false,
      'hasPendingSubmission', false
    );
  END IF;

  IF v_showcase.status <> 'PUBLISHED' AND COALESCE(v_showcase.publication_status, '') <> 'PUBLISHED' THEN
    RETURN jsonb_build_object(
      'eligible', false,
      'code', 'SHOWCASE_NOT_PUBLISHED',
      'reason', 'Showcase must be published before submitting for the RM300 reward.',
      'userRewardStatus', 'NOT_ELIGIBLE',
      'alreadyClaimed', false,
      'hasReceivedReward', false,
      'hasPendingSubmission', false
    );
  END IF;

  -- 8. Check This Specific Showcase Submission Status
  SELECT * INTO v_this_sub
  FROM public.showcase_reward_submissions
  WHERE showcase_id = v_showcase.id OR event_id = v_event_id
  ORDER BY submitted_at DESC
  LIMIT 1;

  IF FOUND THEN
    IF v_this_sub.status = 'APPROVED' THEN
      RETURN jsonb_build_object(
        'eligible', false,
        'code', 'LIFETIME_REWARD_EXHAUSTED',
        'reason', 'RM300 Showcase Reward has already been claimed for this account.',
        'userRewardStatus', 'REWARDED',
        'alreadyClaimed', true,
        'hasReceivedReward', true,
        'hasPendingSubmission', false
      );
    ELSIF v_this_sub.status = 'PENDING' THEN
      RETURN jsonb_build_object(
        'eligible', false,
        'code', 'SUBMISSION_PENDING',
        'reason', 'Your RM300 reward submission is waiting for admin approval.',
        'userRewardStatus', 'NOT_ELIGIBLE',
        'alreadyClaimed', false,
        'hasReceivedReward', false,
        'hasPendingSubmission', true,
        'pendingSubmissionId', v_this_sub.id
      );
    END IF;
    -- If REJECTED, proceed to check content & media so user can resubmit
  END IF;

  -- 9. Check Content Quality: Title & Description
  IF trim(COALESCE(v_showcase.title, '')) = '' THEN
    RETURN jsonb_build_object(
      'eligible', false,
      'code', 'INSUFFICIENT_TITLE',
      'reason', 'Showcase title is required.',
      'userRewardStatus', 'NOT_ELIGIBLE',
      'alreadyClaimed', false,
      'hasReceivedReward', false,
      'hasPendingSubmission', false
    );
  END IF;

  v_desc_len := length(trim(COALESCE(v_showcase.description, '')));
  IF v_desc_len < 50 THEN
    RETURN jsonb_build_object(
      'eligible', false,
      'code', 'INSUFFICIENT_DESCRIPTION',
      'reason', 'Showcase description must be at least 50 characters to qualify for reward review.',
      'userRewardStatus', 'NOT_ELIGIBLE',
      'alreadyClaimed', false,
      'hasReceivedReward', false,
      'hasPendingSubmission', false,
      'details', jsonb_build_object(
        'description_length', v_desc_len,
        'required_length', 50
      )
    );
  END IF;

  -- 10. Check Media Requirements: >= 3 photos or >= 1 video
  SELECT
    COALESCE(COUNT(*) FILTER (WHERE media_type = 'IMAGE' OR (media_type IS NULL AND (mime_type IS NULL OR mime_type NOT LIKE 'video/%'))), 0),
    COALESCE(COUNT(*) FILTER (WHERE media_type = 'VIDEO' OR (mime_type IS NOT NULL AND mime_type LIKE 'video/%')), 0)
  INTO v_photo_count, v_video_count
  FROM public.showcase_media
  WHERE showcase_id = v_showcase.id;

  IF v_photo_count < 3 AND v_video_count < 1 THEN
    RETURN jsonb_build_object(
      'eligible', false,
      'code', 'INSUFFICIENT_MEDIA',
      'reason', 'Upload at least 3 photos or 1 video to qualify for reward review (' || v_photo_count || '/3 photos, ' || v_video_count || ' videos).',
      'userRewardStatus', 'NOT_ELIGIBLE',
      'alreadyClaimed', false,
      'hasReceivedReward', false,
      'hasPendingSubmission', false,
      'details', jsonb_build_object(
        'photo_count', v_photo_count,
        'video_count', v_video_count,
        'required_photos', 3,
        'required_videos', 1
      )
    );
  END IF;

  -- 11. Fully Qualified & Eligible!
  RETURN jsonb_build_object(
    'eligible', true,
    'code', 'ELIGIBLE',
    'reason', 'Eligible for RM300 Showcase Reward',
    'userRewardStatus', 'ELIGIBLE',
    'alreadyClaimed', false,
    'hasReceivedReward', false,
    'hasPendingSubmission', false,
    'details', jsonb_build_object(
      'user_id', v_user_id,
      'event_id', v_event_id,
      'showcase_id', v_showcase.id,
      'is_owner', true,
      'event_paid', true,
      'event_started', true,
      'showcase_published', true,
      'description_length', v_desc_len,
      'photo_count', v_photo_count,
      'video_count', v_video_count,
      'is_resubmission', (v_this_sub IS NOT NULL AND v_this_sub.status = 'REJECTED')
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_showcase_reward_eligibility(UUID, UUID, UUID) TO authenticated, service_role, postgres;

-- 2. Authoritative Atomic Showcase Reward Submission RPC
CREATE OR REPLACE FUNCTION public.create_showcase_reward_submission_atomic(
  p_event_id UUID,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_eligibility JSONB;
  v_showcase RECORD;
  v_submission RECORD;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
BEGIN
  -- 1. Call authoritative eligibility function
  v_eligibility := public.check_showcase_reward_eligibility(p_event_id, p_user_id);
  
  IF NOT (v_eligibility->>'eligible')::boolean THEN
    RAISE EXCEPTION '%', (v_eligibility->>'reason')
      USING ERRCODE = CASE
        WHEN v_eligibility->>'code' = 'OWNER_ONLY_REWARD' THEN 'P0003'
        WHEN v_eligibility->>'code' = 'SUBMISSION_PENDING' THEN 'P0004'
        ELSE 'P0001'
      END;
  END IF;

  -- 2. Lock user row to prevent race conditions
  PERFORM 1 FROM public.users WHERE id = p_user_id FOR UPDATE;

  -- 3. Resolve showcase
  SELECT * INTO v_showcase
  FROM public.event_showcases
  WHERE event_id = p_event_id AND deleted_at IS NULL
  FOR UPDATE;

  -- 4. Insert into showcase_reward_submissions
  INSERT INTO public.showcase_reward_submissions (
    id,
    showcase_id,
    event_id,
    user_id,
    status,
    reward_amount,
    submitted_at,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    v_showcase.id,
    p_event_id,
    p_user_id,
    'PENDING',
    300.00,
    v_now,
    v_now,
    v_now
  )
  RETURNING * INTO v_submission;

  -- 5. Update event_showcases status
  UPDATE public.event_showcases
  SET
    reward_status = 'AWAITING_APPROVAL',
    reward_review_status = 'AWAITING_APPROVAL',
    updated_at = v_now
  WHERE id = v_showcase.id;

  RETURN jsonb_build_object(
    'success', true,
    'submission', row_to_json(v_submission),
    'showcase_id', v_showcase.id,
    'message', 'Showcase submitted for RM300 reward review'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_showcase_reward_submission_atomic(UUID, UUID) TO authenticated, service_role, postgres;
