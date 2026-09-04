-- ==============================================================================
-- MIGRATION: 031_add_outstanding_balance_to_organization_wallets.sql
-- (Timestamp Track Equivalent: 20260903010000_add_outstanding_balance_to_organization_wallets.sql)
-- EVENT GAME STUDIO - STRIPE MINIMUM PAYMENT HANDLING & OUTSTANDING BALANCE
-- ==============================================================================
-- POST-BASELINE ARCHITECTURAL DEFINITION (STRATEGY B):
-- This migration is the FIRST POST-BASELINE MIGRATION.
-- It applies directly on top of `20260903000000_initial_baseline.sql` (baseline date: 2026-09-03 00:00:00 UTC).
-- It introduces:
--   1. `outstanding_balance` on `public.organization_wallets`
--   2. `included_outstanding_amount`, `payable_amount`, `total_due` on `public.wallet_topup_orders`
--   3. Allows `top_up_amount >= 0.00` to support RM0 evaluation orders.
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
