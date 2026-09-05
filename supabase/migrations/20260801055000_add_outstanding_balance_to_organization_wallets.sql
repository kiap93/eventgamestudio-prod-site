-- ==============================================================================
-- MIGRATION: 20260801055000_add_outstanding_balance_to_organization_wallets.sql
-- EVENT GAME STUDIO - STRIPE MINIMUM PAYMENT HANDLING & OUTSTANDING BALANCE
-- ==============================================================================

-- 1. Add outstanding_balance column to organization_wallets table
ALTER TABLE public.organization_wallets
  ADD COLUMN IF NOT EXISTS outstanding_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (outstanding_balance >= 0.00);

-- 2. Update wallet_topup_orders check constraint to allow 0.00 (for RM0 evaluation)
ALTER TABLE public.wallet_topup_orders
  DROP CONSTRAINT IF EXISTS wallet_topup_orders_top_up_amount_check;

ALTER TABLE public.wallet_topup_orders
  ADD CONSTRAINT wallet_topup_orders_top_up_amount_check CHECK (top_up_amount >= 0.00);

-- 3. Add columns to wallet_topup_orders for tracking included outstanding amounts
ALTER TABLE public.wallet_topup_orders
  ADD COLUMN IF NOT EXISTS included_outstanding_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS payable_amount NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS total_due NUMERIC(12, 2);

-- 4. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
