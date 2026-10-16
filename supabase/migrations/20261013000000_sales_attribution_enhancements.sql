-- Migration: 20261013000000_sales_attribution_enhancements.sql
-- Description: Phase 4 Enhancements — Idempotency constraints, duplicate prevention per partner,
--              audit log performance indexes, and strict attribution integrity.

-- 1. Prevent duplicate attribution claims from the same partner for the same registered user
CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_attributions_partner_user_unique
  ON public.customer_attributions (sales_partner_id, referred_user_id)
  WHERE referred_user_id IS NOT NULL;

-- 2. Prevent duplicate prospective claims from the same partner for the same email
CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_attributions_partner_email_unique
  ON public.customer_attributions (sales_partner_id, lower(prospect_email))
  WHERE referred_user_id IS NULL AND prospect_email IS NOT NULL;

-- 3. Index for audit logs actor lookup
CREATE INDEX IF NOT EXISTS idx_customer_attribution_audit_actor
  ON public.customer_attribution_audit_logs (actor_user_id);

-- 4. Index on customer_attributions for competing claims
CREATE INDEX IF NOT EXISTS idx_customer_attributions_competing
  ON public.customer_attributions (competing_attribution_id);
