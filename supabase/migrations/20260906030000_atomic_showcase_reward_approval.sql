-- ==============================================================================
-- Migration: 20260906030000_atomic_showcase_reward_approval.sql
-- Description: Fully atomic PostgreSQL RPC to approve first-event showcase rewards.
-- Guarantees that wallet locking, first-reward invariant checking, review status
-- verification, full eligibility re-validation, wallet transaction insertion,
-- organization wallet balance crediting, and event showcase status updates occur
-- inside a SINGLE ATOMIC TRANSACTION with complete rollback on any failure.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.approve_first_event_showcase_reward_atomic(
  p_showcase_id UUID,
  p_reviewer_id UUID DEFAULT NULL,
  p_reference_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_showcase public.event_showcases%ROWTYPE;
  v_event public.events%ROWTYPE;
  v_wallet public.organization_wallets%ROWTYPE;
  v_existing_credit public.wallet_transactions%ROWTYPE;
  v_new_txn public.wallet_transactions%ROWTYPE;
  v_reference_id TEXT;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
  v_credit_amount NUMERIC := 300.00;
  v_image_count INT := 0;
  v_video_count INT := 0;
  v_other_showcase_id UUID;
  v_reviewer_id UUID := NULL;
  v_cur_date TEXT;
  v_paid NUMERIC;
  v_welcome NUMERIC;
  v_showcase_credit NUMERIC;
  v_topup NUMERIC;
  v_outstanding NUMERIC;
BEGIN
  -- 1. Input Validation
  IF p_showcase_id IS NULL THEN
    RAISE EXCEPTION 'Showcase ID is required';
  END IF;

  -- 2. Lock & fetch Showcase Record
  SELECT * INTO v_showcase
  FROM public.event_showcases
  WHERE id = p_showcase_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Showcase not found: %', p_showcase_id;
  END IF;

  IF v_showcase.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Showcase has been deleted and cannot be rewarded';
  END IF;

  IF v_showcase.status = 'BLOCKED' THEN
    RAISE EXCEPTION 'Showcase is blocked and cannot receive rewards';
  END IF;

  -- 3. Idempotency Check: If this showcase is already rewarded, return current state safely
  IF (v_showcase.reward_review_status = 'REWARDED' OR v_showcase.reward_status = 'REWARDED') THEN
    SELECT * INTO v_existing_credit
    FROM public.wallet_transactions
    WHERE id = v_showcase.reward_transaction_id
       OR (organization_id = v_showcase.organization_id AND transaction_type = 'SHOWCASE_CREDIT' AND status = 'COMPLETED')
    ORDER BY created_at DESC
    LIMIT 1;

    SELECT * INTO v_wallet
    FROM public.organization_wallets
    WHERE organization_id = v_showcase.organization_id;

    RETURN jsonb_build_object(
      'success', true,
      'already_rewarded', true,
      'showcase', to_jsonb(v_showcase),
      'transaction', to_jsonb(v_existing_credit),
      'wallet', jsonb_build_object(
        'organization_id', v_showcase.organization_id,
        'paid_balance', COALESCE(v_wallet.paid_balance, 0.00),
        'welcome_credit', COALESCE(v_wallet.welcome_credit, 0.00),
        'showcase_credit', COALESCE(v_wallet.showcase_credit, 0.00),
        'showcase_credit_granted', COALESCE(v_wallet.showcase_credit_granted, true),
        'topup_credit', COALESCE(v_wallet.topup_credit, 0.00),
        'outstanding_balance', COALESCE(v_wallet.outstanding_balance, 0.00),
        'total_balance', COALESCE(v_wallet.paid_balance, 0.00) + COALESCE(v_wallet.welcome_credit, 0.00) + COALESCE(v_wallet.showcase_credit, 0.00) + COALESCE(v_wallet.topup_credit, 0.00)
      ),
      'message', 'Showcase has already been approved and rewarded.'
    );
  END IF;

  -- 4. Lock Organization Wallet Row with FOR UPDATE
  -- Ensure wallet row exists first
  INSERT INTO public.organization_wallets (
    organization_id,
    paid_balance,
    welcome_credit,
    showcase_credit,
    showcase_credit_granted,
    topup_credit,
    outstanding_balance,
    created_at,
    updated_at
  ) VALUES (
    v_showcase.organization_id,
    0.00,
    0.00,
    0.00,
    false,
    0.00,
    0.00,
    v_now,
    v_now
  )
  ON CONFLICT (organization_id) DO NOTHING;

  SELECT * INTO v_wallet
  FROM public.organization_wallets
  WHERE organization_id = v_showcase.organization_id
  FOR UPDATE;

  -- 5. Verify First-Reward Invariant:
  -- Check if organization already received showcase credit
  SELECT * INTO v_existing_credit
  FROM public.wallet_transactions
  WHERE organization_id = v_showcase.organization_id
    AND transaction_type = 'SHOWCASE_CREDIT'
    AND status = 'COMPLETED'
  LIMIT 1;

  IF FOUND OR v_wallet.showcase_credit_granted = true OR COALESCE(v_wallet.showcase_credit, 0.00) > 0 THEN
    RAISE EXCEPTION 'First-event reward invariant violation: Organization has already received a showcase reward credit.';
  END IF;

  -- Check if any other showcase in this organization was already rewarded
  SELECT id INTO v_other_showcase_id
  FROM public.event_showcases
  WHERE organization_id = v_showcase.organization_id
    AND id <> v_showcase.id
    AND (reward_review_status = 'REWARDED' OR reward_status = 'REWARDED')
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'First-event reward invariant violation: Organization already has another rewarded showcase (%)', v_other_showcase_id;
  END IF;

  -- 6. Verify Showcase is AWAITING_APPROVAL
  IF NOT (
    v_showcase.reward_review_status = 'AWAITING_APPROVAL' OR 
    v_showcase.reward_status = 'PENDING' OR
    v_showcase.review_status = 'SUBMITTED'
  ) THEN
    RAISE EXCEPTION 'Showcase is not awaiting reward approval (current reward review status: %)', v_showcase.reward_review_status;
  END IF;

  -- 7. Verify All Eligibility Conditions:
  -- 7a. Event existence & payment status
  SELECT * INTO v_event
  FROM public.events
  WHERE id = v_showcase.event_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event not found for showcase';
  END IF;

  IF v_event.payment_status <> 'PAID' THEN
    RAISE EXCEPTION 'Eligibility check failed: Event must be PAID (current: %)', v_event.payment_status;
  END IF;

  -- 7b. Event started or concluded
  -- (status in LIVE, COMPLETED or start_date <= Asia/Singapore calendar date)
  v_cur_date := TO_CHAR((NOW() AT TIME ZONE 'Asia/Singapore'), 'YYYY-MM-DD');

  IF NOT (
    v_event.status IN ('LIVE', 'COMPLETED') OR
    (v_event.start_date IS NOT NULL AND v_event.start_date <= v_cur_date)
  ) THEN
    RAISE EXCEPTION 'Eligibility check failed: Event must be started or concluded';
  END IF;

  -- 7c. Showcase must be published
  IF NOT (v_showcase.status = 'PUBLISHED' OR v_showcase.publication_status = 'PUBLISHED') THEN
    RAISE EXCEPTION 'Eligibility check failed: Showcase must be published';
  END IF;

  -- 7d. Title required
  IF v_showcase.title IS NULL OR length(trim(v_showcase.title)) = 0 THEN
    RAISE EXCEPTION 'Eligibility check failed: Showcase title is required';
  END IF;

  -- 7e. Description at least 50 characters
  IF v_showcase.description IS NULL OR length(trim(v_showcase.description)) < 50 THEN
    RAISE EXCEPTION 'Eligibility check failed: Showcase description must be at least 50 characters';
  END IF;

  -- 7f. Media: at least 3 photos OR at least 1 video
  SELECT 
    COUNT(*) FILTER (WHERE media_type = 'IMAGE' OR mime_type LIKE 'image/%'),
    COUNT(*) FILTER (WHERE media_type = 'VIDEO' OR mime_type LIKE 'video/%')
  INTO v_image_count, v_video_count
  FROM public.event_showcase_media
  WHERE showcase_id = v_showcase.id;

  IF NOT (v_image_count >= 3 OR v_video_count >= 1) THEN
    RAISE EXCEPTION 'Eligibility check failed: Showcase media must contain at least 3 images or 1 video (found % images, % videos)', v_image_count, v_video_count;
  END IF;

  -- Verify reviewer foreign key reference safely
  IF p_reviewer_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.users WHERE id = p_reviewer_id) THEN
      v_reviewer_id := p_reviewer_id;
    END IF;
  END IF;

  -- 8. Create SHOWCASE_CREDIT Transaction
  v_reference_id := COALESCE(p_reference_id, 'showcase_' || v_showcase.id::text);

  INSERT INTO public.wallet_transactions (
    id,
    organization_id,
    event_id,
    transaction_type,
    balance_type,
    amount,
    currency,
    status,
    reference_id,
    description,
    metadata,
    created_by,
    created_at
  ) VALUES (
    gen_random_uuid(),
    v_showcase.organization_id,
    v_showcase.event_id,
    'SHOWCASE_CREDIT',
    'SHOWCASE_CREDIT',
    v_credit_amount,
    'MYR',
    'COMPLETED',
    v_reference_id,
    'One-time Event Showcase completion reward credit of RM300.00',
    p_metadata || jsonb_build_object(
      'program', 'EVENT_SHOWCASE_APPROVED_REWARD',
      'showcase_id', v_showcase.id,
      'event_id', v_showcase.event_id,
      'reviewer_id', p_reviewer_id,
      'approved_at', v_now
    ),
    v_reviewer_id,
    v_now
  )
  RETURNING * INTO v_new_txn;

  -- 9. Update Organization Wallets
  UPDATE public.organization_wallets
  SET showcase_credit = COALESCE(showcase_credit, 0.00) + v_credit_amount,
      showcase_credit_granted = true,
      updated_at = v_now
  WHERE organization_id = v_showcase.organization_id
  RETURNING * INTO v_wallet;

  -- 10. Update Event Showcases
  UPDATE public.event_showcases
  SET reward_review_status = 'REWARDED',
      reward_status = 'REWARDED',
      reward_transaction_id = v_new_txn.id,
      reward_reviewed_by = v_reviewer_id,
      reward_reviewed_at = v_now,
      reward_granted_at = COALESCE(reward_granted_at, v_now),
      reward_rejection_reason = NULL,
      review_status = 'APPROVED',
      reviewed_at = v_now,
      reviewed_by = v_reviewer_id,
      rejection_reason = NULL,
      publication_status = 'PUBLISHED',
      status = CASE WHEN status = 'BLOCKED' THEN 'BLOCKED' ELSE 'PUBLISHED' END,
      updated_at = v_now
  WHERE id = v_showcase.id
  RETURNING * INTO v_showcase;

  -- 11. Return atomically updated results
  v_paid := COALESCE(v_wallet.paid_balance, 0.00);
  v_welcome := COALESCE(v_wallet.welcome_credit, 0.00);
  v_showcase_credit := COALESCE(v_wallet.showcase_credit, 0.00);
  v_topup := COALESCE(v_wallet.topup_credit, 0.00);
  v_outstanding := COALESCE(v_wallet.outstanding_balance, 0.00);

  RETURN jsonb_build_object(
    'success', true,
    'already_rewarded', false,
    'showcase', to_jsonb(v_showcase),
    'transaction', to_jsonb(v_new_txn),
    'wallet', jsonb_build_object(
      'organization_id', v_showcase.organization_id,
      'paid_balance', v_paid,
      'welcome_credit', v_welcome,
      'showcase_credit', v_showcase_credit,
      'showcase_credit_granted', v_wallet.showcase_credit_granted,
      'topup_credit', v_topup,
      'outstanding_balance', v_outstanding,
      'total_balance', v_paid + v_welcome + v_showcase_credit + v_topup
    ),
    'message', 'Showcase approved successfully and RM300 credit granted to organization'
  );
END;
$$;

-- Security Permissions: Grant execute exclusively to service_role (Backend-Write-Only)
GRANT EXECUTE ON FUNCTION public.approve_first_event_showcase_reward_atomic(UUID, UUID, TEXT, JSONB) TO service_role;
REVOKE EXECUTE ON FUNCTION public.approve_first_event_showcase_reward_atomic(UUID, UUID, TEXT, JSONB) FROM authenticated, anon, public;
