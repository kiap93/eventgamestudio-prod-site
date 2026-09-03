-- ==============================================================================
-- MIGRATION: 013_lock_topup_settlement_security.sql
-- EVENT GAME STUDIO - LOCK TOP-UP ORDER SETTLEMENT SECURITY (PRODUCTION SECURITY FIX)
-- ==============================================================================

-- 1. HARDEN RLS UPDATE POLICY ON WALLET TOP-UP ORDERS
-- Ensure normal organization owners/admins CANNOT update orders to 'PAID' or 'COMPLETED' directly via SQL/REST.
-- Direct updates by owners/admins are strictly limited to cancelling their pending orders.
-- Transition to 'PAID' and wallet crediting is strictly restricted to trusted payment webhooks and developer admin reconciliation.

DROP POLICY IF EXISTS "Owners and admins can update top-up orders" ON public.wallet_topup_orders;
DROP POLICY IF EXISTS "Owners and admins can cancel pending top-up orders" ON public.wallet_topup_orders;

CREATE POLICY "Owners and admins can cancel pending top-up orders"
  ON public.wallet_topup_orders FOR UPDATE
  USING (
    public.get_org_role(organization_id) IN ('owner', 'admin') OR public.is_developer_admin()
  )
  WITH CHECK (
    -- Normal organization users can ONLY set status to 'CANCELLED' or 'PENDING'
    -- 'PAID' status can only be set by developer admins or internal SECURITY DEFINER functions
    (public.is_developer_admin()) OR
    (public.get_org_role(organization_id) IN ('owner', 'admin') AND status IN ('CANCELLED', 'PENDING'))
  );

-- 2. HARDEN AUDIT LOGGING FOR UNAUTHORIZED ATTEMPTS
-- Ensure wallet audit event table has index on event_type and created_at
CREATE INDEX IF NOT EXISTS idx_wallet_audit_events_event_type ON public.wallet_audit_events (event_type);
