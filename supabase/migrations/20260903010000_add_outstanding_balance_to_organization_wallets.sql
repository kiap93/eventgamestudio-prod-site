-- Migration: 20260903010000_add_outstanding_balance_to_organization_wallets.sql
-- Description: Post-baseline migration adding outstanding_balance to organization_wallets
--              and min-payment / outstanding balance tracking fields to wallet_topup_orders.
-- Architecture: Strategy B - Canonical timestamp equivalent of Migration 031.
-- Boundary Date: Post 2026-09-03 00:00:00 UTC baseline snapshot.

-- 1. Add outstanding_balance column to organization_wallets if not exists
ALTER TABLE public.organization_wallets
ADD COLUMN IF NOT EXISTS outstanding_balance NUMERIC(10, 2) NOT NULL DEFAULT 0.00;

-- 2. Update wallet_topup_orders constraints to allow 0.00 top_up_amount when paying outstanding balance
ALTER TABLE public.wallet_topup_orders
DROP CONSTRAINT IF EXISTS wallet_topup_orders_top_up_amount_check;

ALTER TABLE public.wallet_topup_orders
ADD CONSTRAINT wallet_topup_orders_top_up_amount_check
CHECK (top_up_amount >= 0.00);

-- 3. Add minimum payment and outstanding settlement tracking columns to wallet_topup_orders
ALTER TABLE public.wallet_topup_orders
ADD COLUMN IF NOT EXISTS included_outstanding_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00;

ALTER TABLE public.wallet_topup_orders
ADD COLUMN IF NOT EXISTS payable_amount NUMERIC(10, 2);

ALTER TABLE public.wallet_topup_orders
ADD COLUMN IF NOT EXISTS total_due NUMERIC(10, 2);

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
