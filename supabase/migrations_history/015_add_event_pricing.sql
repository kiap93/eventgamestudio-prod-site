-- ==============================================================================
-- MIGRATION: 015_add_event_pricing.sql
-- EVENT GAME STUDIO - SERVER-AUTHORITATIVE EVENT PRICING & PLATFORM CONFIGURATION
-- ==============================================================================

-- 1. Safely add all event payment & pricing tracking columns if they do not exist
ALTER TABLE public.events 
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'UNPAID',
  ADD COLUMN IF NOT EXISTS payment_mode TEXT,
  ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(10, 2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10, 2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS event_price NUMERIC(10, 2) NOT NULL DEFAULT 1400.00,
  ADD COLUMN IF NOT EXISTS event_currency TEXT NOT NULL DEFAULT 'MYR';

-- 2. Safely ensure status check constraint includes 'pending_payment'
DO $$
BEGIN
  ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_status_check;
  ALTER TABLE public.events ADD CONSTRAINT events_status_check 
    CHECK (status IN ('draft', 'scheduled', 'live', 'expired', 'cancelled', 'pending_payment'));
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- 3. Safely ensure payment_status check constraint
DO $$
BEGIN
  ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_payment_status_check;
  ALTER TABLE public.events ADD CONSTRAINT events_payment_status_check 
    CHECK (payment_status IN ('PAID', 'UNPAID', 'REFUNDED', 'PENDING_PAYMENT'));
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- 4. Backfill existing records to ensure no NULL values exist
UPDATE public.events 
SET 
  event_price = COALESCE(event_price, paid_amount, 1400.00),
  event_currency = COALESCE(event_currency, 'MYR'),
  payment_status = COALESCE(payment_status, 'UNPAID'),
  paid_amount = COALESCE(paid_amount, 0.00),
  discount_amount = COALESCE(discount_amount, 0.00)
WHERE event_price IS NULL OR event_currency IS NULL OR payment_status IS NULL;

-- 5. Add platform_settings table for server-authoritative platform default pricing
CREATE TABLE IF NOT EXISTS public.platform_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 6. Seed default platform event pricing configuration
INSERT INTO public.platform_settings (key, value, description)
VALUES (
  'event_pricing',
  '{"default_price": 1400.00, "default_currency": "MYR"}'::jsonb,
  'Platform default event pricing configuration for new events'
)
ON CONFLICT (key) DO NOTHING;

-- 7. Update atomic payment RPC function to prioritize event.event_price stored on the event record
-- and support COMBINED_CREDIT alongside all single credit modes
CREATE OR REPLACE FUNCTION public.process_event_payment_atomic(
  p_organization_id UUID,
  p_event_id UUID,
  p_payment_mode TEXT,
  p_event_price NUMERIC DEFAULT 1400.00,
  p_topup_credit_requested NUMERIC DEFAULT 0.00,
  p_reference_id TEXT DEFAULT NULL,
  p_created_by UUID DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_wallet RECORD;
  v_event RECORD;
  v_event_price NUMERIC;
  v_credit_to_use NUMERIC := 0.00;
  v_welcome_to_use NUMERIC := 0.00;
  v_showcase_to_use NUMERIC := 0.00;
  v_topup_to_use NUMERIC := 0.00;
  v_paid_to_use NUMERIC := 0.00;
  v_credit_balance_type TEXT := NULL;
  v_credit_txn RECORD;
  v_topup_credit_txn RECORD;
  v_paid_txn RECORD;
  v_credit_ref TEXT;
  v_topup_ref TEXT;
  v_paid_ref TEXT;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
  v_existing_payment RECORD;
  v_existing_credit RECORD;
  v_max_cap NUMERIC;
  v_req NUMERIC;
BEGIN
  -- 1. Input validations
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'Organization ID is required';
  END IF;

  IF p_event_id IS NULL THEN
    RAISE EXCEPTION 'Event ID is required';
  END IF;

  IF p_payment_mode NOT IN ('FULL_PAID', 'WELCOME_CREDIT', 'SHOWCASE_CREDIT', 'TOPUP_CREDIT', 'COMBINED_CREDIT') THEN
    RAISE EXCEPTION 'Invalid payment mode: %', p_payment_mode;
  END IF;

  -- 2. Lock & Validate Event Record (if exists in events table)
  SELECT * INTO v_event
  FROM public.events
  WHERE id = p_event_id
  FOR UPDATE;

  IF v_event.id IS NOT NULL THEN
    IF v_event.organization_id <> p_organization_id THEN
      RAISE EXCEPTION 'Security Error: Event does not belong to your organization';
    END IF;
    IF v_event.payment_status = 'PAID' THEN
      RAISE EXCEPTION 'Event is already marked as PAID';
    END IF;
    -- Server-Authoritative: Event's own stored price takes precedence
    v_event_price := COALESCE(v_event.event_price, p_event_price, 1400.00);
  ELSE
    v_event_price := COALESCE(p_event_price, 1400.00);
  END IF;

  IF v_event_price <= 0 THEN
    RAISE EXCEPTION 'Event price must be greater than 0';
  END IF;

  -- 3. Idempotency Protection: Check if event is already paid in transaction ledger
  SELECT * INTO v_existing_payment
  FROM public.wallet_transactions
  WHERE organization_id = p_organization_id
    AND event_id = p_event_id
    AND transaction_type = 'EVENT_PAYMENT'
    AND balance_type = 'PAID_BALANCE'
    AND status = 'COMPLETED'
  LIMIT 1;

  IF v_existing_payment.id IS NOT NULL THEN
    SELECT * INTO v_existing_credit
    FROM public.wallet_transactions
    WHERE organization_id = p_organization_id
      AND event_id = p_event_id
      AND transaction_type = 'CREDIT_USAGE'
      AND status = 'COMPLETED'
    LIMIT 1;

    SELECT * INTO v_wallet FROM public.organization_wallets WHERE organization_id = p_organization_id;

    RETURN jsonb_build_object(
      'success', true,
      'is_idempotent_replay', true,
      'event_id', p_event_id,
      'payment_mode', p_payment_mode,
      'event_price', v_event_price,
      'paid_amount', ABS(v_existing_payment.amount),
      'discount_amount', COALESCE(ABS(v_existing_credit.amount), 0.00),
      'credit_transaction', CASE WHEN v_existing_credit.id IS NOT NULL THEN to_jsonb(v_existing_credit) ELSE NULL END,
      'paid_transaction', to_jsonb(v_existing_payment),
      'wallet', jsonb_build_object(
        'paid_balance', COALESCE(v_wallet.paid_balance, 0.00),
        'welcome_credit', COALESCE(v_wallet.welcome_credit, 0.00),
        'showcase_credit', COALESCE(v_wallet.showcase_credit, 0.00),
        'topup_credit', COALESCE(v_wallet.topup_credit, 0.00)
      )
    );
  END IF;

  -- 4. Lock & Validate Organization Wallet
  SELECT * INTO v_wallet
  FROM public.organization_wallets
  WHERE organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.organization_wallets (
      organization_id,
      paid_balance,
      welcome_credit,
      showcase_credit,
      topup_credit
    ) VALUES (
      p_organization_id,
      0.00,
      0.00,
      0.00,
      0.00
    )
    RETURNING * INTO v_wallet;
  END IF;

  -- 5. Calculate and validate business rules for payment mode based on authoritative v_event_price
  IF p_payment_mode = 'FULL_PAID' THEN
    v_credit_to_use := 0.00;
    v_paid_to_use := v_event_price;

    IF v_wallet.paid_balance < v_paid_to_use THEN
      RAISE EXCEPTION 'Insufficient Paid Balance. Event price is RM%, but available Paid Balance is RM%.',
        ROUND(v_paid_to_use, 2)::text, ROUND(v_wallet.paid_balance, 2)::text;
    END IF;

  ELSIF p_payment_mode = 'WELCOME_CREDIT' THEN
    v_credit_balance_type := 'WELCOME_CREDIT';
    v_welcome_to_use := LEAST(800.00, v_wallet.welcome_credit, v_event_price);
    v_credit_to_use := v_welcome_to_use;
    v_paid_to_use := v_event_price - v_credit_to_use;

    IF v_wallet.welcome_credit < v_credit_to_use THEN
      RAISE EXCEPTION 'Insufficient Welcome Credit. Required: RM%, Available: RM%.',
        ROUND(v_credit_to_use, 2)::text, ROUND(v_wallet.welcome_credit, 2)::text;
    END IF;

    IF v_wallet.paid_balance < v_paid_to_use THEN
      RAISE EXCEPTION 'Insufficient Paid Balance for Welcome Credit payment. Required: RM%, Available: RM%.',
        ROUND(v_paid_to_use, 2)::text, ROUND(v_wallet.paid_balance, 2)::text;
    END IF;

  ELSIF p_payment_mode = 'SHOWCASE_CREDIT' THEN
    v_credit_balance_type := 'SHOWCASE_CREDIT';
    v_showcase_to_use := LEAST(300.00, v_wallet.showcase_credit, v_event_price);
    v_credit_to_use := v_showcase_to_use;
    v_paid_to_use := v_event_price - v_credit_to_use;

    IF v_wallet.showcase_credit < v_credit_to_use THEN
      RAISE EXCEPTION 'Insufficient Showcase Credit. Required: RM%, Available: RM%.',
        ROUND(v_credit_to_use, 2)::text, ROUND(v_wallet.showcase_credit, 2)::text;
    END IF;

    IF v_wallet.paid_balance < v_paid_to_use THEN
      RAISE EXCEPTION 'Insufficient Paid Balance for Showcase Credit payment. Required: RM%, Available: RM%.',
        ROUND(v_paid_to_use, 2)::text, ROUND(v_wallet.paid_balance, 2)::text;
    END IF;

  ELSIF p_payment_mode = 'TOPUP_CREDIT' THEN
    v_credit_balance_type := 'TOPUP_CREDIT';
    v_max_cap := ROUND(v_event_price * 0.20, 2);

    IF p_topup_credit_requested > 0 THEN
      IF p_topup_credit_requested > v_max_cap THEN
        RAISE EXCEPTION 'Top-up Credit cannot exceed 20%% of event price (Max RM%).', ROUND(v_max_cap, 2)::text;
      END IF;
      v_req := p_topup_credit_requested;
    ELSE
      v_req := v_max_cap;
    END IF;

    v_topup_to_use := LEAST(v_wallet.topup_credit, v_max_cap, v_req, v_event_price);
    v_credit_to_use := v_topup_to_use;
    v_paid_to_use := v_event_price - v_credit_to_use;

    IF v_credit_to_use <= 0 AND v_wallet.topup_credit <= 0 THEN
      RAISE EXCEPTION 'No Top-up Credit available in wallet.';
    END IF;

    IF v_wallet.paid_balance < v_paid_to_use THEN
      RAISE EXCEPTION 'Insufficient Paid Balance for Top-up Credit payment. Required: RM%, Available: RM%.',
        ROUND(v_paid_to_use, 2)::text, ROUND(v_wallet.paid_balance, 2)::text;
    END IF;

  ELSIF p_payment_mode = 'COMBINED_CREDIT' THEN
    -- Welcome credit component
    v_welcome_to_use := LEAST(800.00, v_wallet.welcome_credit, v_event_price);
    
    -- Topup credit component (20% cap)
    v_max_cap := ROUND(v_event_price * 0.20, 2);
    IF p_topup_credit_requested > 0 THEN
      v_req := LEAST(p_topup_credit_requested, v_max_cap);
    ELSE
      v_req := v_max_cap;
    END IF;
    
    v_topup_to_use := LEAST(v_wallet.topup_credit, v_max_cap, v_req, v_event_price - v_welcome_to_use);
    v_credit_to_use := v_welcome_to_use + v_topup_to_use;
    v_paid_to_use := v_event_price - v_credit_to_use;

    IF v_wallet.paid_balance < v_paid_to_use THEN
      RAISE EXCEPTION 'Insufficient Paid Balance for Combined Credit payment. Required: RM%, Available: RM%.',
        ROUND(v_paid_to_use, 2)::text, ROUND(v_wallet.paid_balance, 2)::text;
    END IF;
  END IF;

  -- 6. Insert promotional credit transaction(s) into ledger if used
  IF p_payment_mode = 'COMBINED_CREDIT' THEN
    IF v_welcome_to_use > 0 THEN
      v_credit_ref := COALESCE(p_reference_id || '_welcome_credit', 'event_' || p_event_id::text || '_welcome_credit');
      INSERT INTO public.wallet_transactions (
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
        p_organization_id,
        p_event_id,
        'CREDIT_USAGE',
        'WELCOME_CREDIT',
        -v_welcome_to_use,
        'MYR',
        'COMPLETED',
        v_credit_ref,
        COALESCE(p_description, 'Applied RM' || ROUND(v_welcome_to_use, 2)::text || ' Welcome Credit discount'),
        p_metadata || jsonb_build_object(
          'event_id', p_event_id,
          'payment_mode', p_payment_mode,
          'credit_type', 'WELCOME_CREDIT',
          'credit_discount', v_welcome_to_use,
          'event_price', v_event_price
        ),
        p_created_by,
        v_now
      )
      RETURNING * INTO v_credit_txn;

      UPDATE public.organization_wallets
      SET welcome_credit = welcome_credit - v_welcome_to_use,
          updated_at = v_now
      WHERE organization_id = p_organization_id;
    END IF;

    IF v_topup_to_use > 0 THEN
      v_topup_ref := COALESCE(p_reference_id || '_topup_credit', 'event_' || p_event_id::text || '_topup_credit');
      INSERT INTO public.wallet_transactions (
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
        p_organization_id,
        p_event_id,
        'CREDIT_USAGE',
        'TOPUP_CREDIT',
        -v_topup_to_use,
        'MYR',
        'COMPLETED',
        v_topup_ref,
        COALESCE(p_description, 'Applied RM' || ROUND(v_topup_to_use, 2)::text || ' Event Credit discount'),
        p_metadata || jsonb_build_object(
          'event_id', p_event_id,
          'payment_mode', p_payment_mode,
          'credit_type', 'TOPUP_CREDIT',
          'credit_discount', v_topup_to_use,
          'event_price', v_event_price
        ),
        p_created_by,
        v_now
      )
      RETURNING * INTO v_topup_credit_txn;

      UPDATE public.organization_wallets
      SET topup_credit = topup_credit - v_topup_to_use,
          updated_at = v_now
      WHERE organization_id = p_organization_id;
    END IF;
  ELSE
    IF v_credit_to_use > 0 THEN
      v_credit_ref := COALESCE(p_reference_id || '_credit', 'event_' || p_event_id::text || '_credit');
      
      INSERT INTO public.wallet_transactions (
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
        p_organization_id,
        p_event_id,
        'CREDIT_USAGE',
        v_credit_balance_type,
        -v_credit_to_use,
        'MYR',
        'COMPLETED',
        v_credit_ref,
        COALESCE(p_description, 'Applied RM' || ROUND(v_credit_to_use, 2)::text || ' ' || replace(p_payment_mode, '_', ' ') || ' discount'),
        p_metadata || jsonb_build_object(
          'event_id', p_event_id,
          'payment_mode', p_payment_mode,
          'credit_discount', v_credit_to_use,
          'event_price', v_event_price
        ),
        p_created_by,
        v_now
      )
      RETURNING * INTO v_credit_txn;

      -- Deduct credit balance from wallet
      IF v_credit_balance_type = 'WELCOME_CREDIT' THEN
        UPDATE public.organization_wallets
        SET welcome_credit = welcome_credit - v_credit_to_use,
            updated_at = v_now
        WHERE organization_id = p_organization_id;
      ELSIF v_credit_balance_type = 'SHOWCASE_CREDIT' THEN
        UPDATE public.organization_wallets
        SET showcase_credit = showcase_credit - v_credit_to_use,
            updated_at = v_now
        WHERE organization_id = p_organization_id;
      ELSIF v_credit_balance_type = 'TOPUP_CREDIT' THEN
        UPDATE public.organization_wallets
        SET topup_credit = topup_credit - v_credit_to_use,
            updated_at = v_now
        WHERE organization_id = p_organization_id;
      END IF;
    END IF;
  END IF;

  -- 7. Insert paid balance payment transaction into ledger
  IF v_paid_to_use > 0 THEN
    v_paid_ref := COALESCE(p_reference_id || '_paid', 'event_' || p_event_id::text || '_paid');

    INSERT INTO public.wallet_transactions (
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
      p_organization_id,
      p_event_id,
      'EVENT_PAYMENT',
      'PAID_BALANCE',
      -v_paid_to_use,
      'MYR',
      'COMPLETED',
      v_paid_ref,
      COALESCE(p_description, 'Paid RM' || ROUND(v_paid_to_use, 2)::text || ' from Paid Balance for Event'),
      p_metadata || jsonb_build_object(
        'event_id', p_event_id,
        'payment_mode', p_payment_mode,
        'paid_amount', v_paid_to_use,
        'event_price', v_event_price
      ),
      p_created_by,
      v_now
    )
    RETURNING * INTO v_paid_txn;

    -- Deduct paid balance from wallet
    UPDATE public.organization_wallets
    SET paid_balance = paid_balance - v_paid_to_use,
        updated_at = v_now
    WHERE organization_id = p_organization_id;
  END IF;

  -- 8. Refresh wallet record
  SELECT * INTO v_wallet FROM public.organization_wallets WHERE organization_id = p_organization_id;

  -- 9. Mark Event as PAID in events table (and promote pending_payment to scheduled)
  IF v_event.id IS NOT NULL THEN
    UPDATE public.events
    SET payment_status = 'PAID',
        payment_mode = p_payment_mode,
        paid_amount = v_paid_to_use,
        discount_amount = v_credit_to_use,
        event_price = v_event_price,
        event_currency = 'MYR',
        status = CASE WHEN status = 'pending_payment' THEN 'scheduled' ELSE status END,
        updated_at = v_now
    WHERE id = p_event_id;
  END IF;

  -- 10. Return JSON result payload
  RETURN jsonb_build_object(
    'success', true,
    'event_id', p_event_id,
    'payment_mode', p_payment_mode,
    'event_price', v_event_price,
    'paid_amount', v_paid_to_use,
    'discount_amount', v_credit_to_use,
    'credit_transaction', CASE WHEN v_credit_txn.id IS NOT NULL THEN to_jsonb(v_credit_txn) ELSE NULL END,
    'paid_transaction', to_jsonb(v_paid_txn),
    'wallet', jsonb_build_object(
      'paid_balance', v_wallet.paid_balance,
      'welcome_credit', v_wallet.welcome_credit,
      'showcase_credit', v_wallet.showcase_credit,
      'topup_credit', v_wallet.topup_credit
    )
  );
END;
$$;
