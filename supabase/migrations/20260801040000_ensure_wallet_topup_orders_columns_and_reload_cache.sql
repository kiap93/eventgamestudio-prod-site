-- ==============================================================================
-- MIGRATION 020: Ensure Wallet Top-Up Orders Columns and Reload PostgREST Cache
-- ==============================================================================
-- Description:
--   Guarantees all columns on public.wallet_topup_orders exist, including
--   created_by for schema compatibility, and notifies PostgREST to reload cache.
-- ==============================================================================

BEGIN;

-- 1. Ensure table exists
CREATE TABLE IF NOT EXISTS public.wallet_topup_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  currency TEXT NOT NULL DEFAULT 'MYR',
  top_up_amount NUMERIC(12, 2) NOT NULL CHECK (top_up_amount > 0),
  expected_credit_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (expected_credit_amount >= 0),
  bonus_percentage NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
  total_wallet_value NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (
    status IN ('PENDING', 'PAID', 'FAILED', 'EXPIRED', 'CANCELLED')
  ),
  payment_reference TEXT,
  payment_method TEXT,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  expired_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. Add optional created_by column for backwards/forward compatibility with schema cache
ALTER TABLE public.wallet_topup_orders ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

-- 3. Populate created_by from user_id if null
UPDATE public.wallet_topup_orders
SET created_by = user_id
WHERE created_by IS NULL;

-- 4. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

COMMIT;
