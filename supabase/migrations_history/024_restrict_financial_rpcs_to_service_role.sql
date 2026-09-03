-- ==============================================================================
-- MIGRATION: 024_restrict_financial_rpcs_to_service_role.sql
-- EVENT GAME STUDIO - REVOKE PUBLIC/ANON/AUTHENTICATED EXECUTE ON FINANCIAL RPCS
-- ==============================================================================

-- 1. REVOKE EXECUTE from PUBLIC, anon, and authenticated roles
-- ==============================================================================
-- These functions are SECURITY DEFINER and execute with elevated database privileges.
-- They must only be callable by trusted backend services executing with the service_role.

-- A. settle_wallet_topup_order
REVOKE ALL ON FUNCTION public.settle_wallet_topup_order(
  UUID, UUID, TEXT, TEXT, TEXT, UUID, TEXT, JSONB
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.settle_wallet_topup_order(
  UUID, UUID, TEXT, TEXT, TEXT, UUID, TEXT, JSONB
) FROM anon;
REVOKE ALL ON FUNCTION public.settle_wallet_topup_order(
  UUID, UUID, TEXT, TEXT, TEXT, UUID, TEXT, JSONB
) FROM authenticated;

-- B. process_topup_order_atomic
REVOKE ALL ON FUNCTION public.process_topup_order_atomic(
  UUID, UUID, TEXT, TEXT, TEXT, UUID, TEXT, JSONB
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_topup_order_atomic(
  UUID, UUID, TEXT, TEXT, TEXT, UUID, TEXT, JSONB
) FROM anon;
REVOKE ALL ON FUNCTION public.process_topup_order_atomic(
  UUID, UUID, TEXT, TEXT, TEXT, UUID, TEXT, JSONB
) FROM authenticated;

-- C. process_event_payment_atomic
REVOKE ALL ON FUNCTION public.process_event_payment_atomic(
  UUID, UUID, TEXT, NUMERIC, NUMERIC, TEXT, UUID, TEXT, JSONB
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_event_payment_atomic(
  UUID, UUID, TEXT, NUMERIC, NUMERIC, TEXT, UUID, TEXT, JSONB
) FROM anon;
REVOKE ALL ON FUNCTION public.process_event_payment_atomic(
  UUID, UUID, TEXT, NUMERIC, NUMERIC, TEXT, UUID, TEXT, JSONB
) FROM authenticated;


-- 2. GRANT EXECUTE explicitly to service_role and postgres
-- ==============================================================================
GRANT EXECUTE ON FUNCTION public.settle_wallet_topup_order(
  UUID, UUID, TEXT, TEXT, TEXT, UUID, TEXT, JSONB
) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_wallet_topup_order(
  UUID, UUID, TEXT, TEXT, TEXT, UUID, TEXT, JSONB
) TO postgres;

GRANT EXECUTE ON FUNCTION public.process_topup_order_atomic(
  UUID, UUID, TEXT, TEXT, TEXT, UUID, TEXT, JSONB
) TO service_role;
GRANT EXECUTE ON FUNCTION public.process_topup_order_atomic(
  UUID, UUID, TEXT, TEXT, TEXT, UUID, TEXT, JSONB
) TO postgres;

GRANT EXECUTE ON FUNCTION public.process_event_payment_atomic(
  UUID, UUID, TEXT, NUMERIC, NUMERIC, TEXT, UUID, TEXT, JSONB
) TO service_role;
GRANT EXECUTE ON FUNCTION public.process_event_payment_atomic(
  UUID, UUID, TEXT, NUMERIC, NUMERIC, TEXT, UUID, TEXT, JSONB
) TO postgres;
