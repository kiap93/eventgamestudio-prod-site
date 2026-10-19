# Event Game Studio — Go-Live Hardening & Production Readiness Plan

## Baseline Assessment Summary

A comprehensive audit of the Event Game Studio codebase was conducted across TypeScript compilation, build systems, dual backend runtimes (`server.ts` and `worker.ts`), database migrations, and existing automated test suites.

### 1. Current State & Baseline Status
- **TypeScript Compiler (`tsc --noEmit`)**: Clean (0 errors).
- **Vite & Server Build (`bun run build`)**: Clean (0 errors).
- **Core Wallet, ACID & Payment Ledgers (`test:wallet`)**: 34/34 passing.
- **Fail-Closed Pricing & Duration Tiers (`test:fail-closed-pricing`)**: 12/12 passing.
- **Showcase Decoupled Publishing & Moderation (`test:showcase-decoupled`)**: 34/34 passing.
- **Invoice Engine & Credit Breakdown (`invoices_phase2.test.ts`, `invoices_phase5.test.ts`)**: 23/23 passing.
- **Magic Bytes & Upload Security (`test:upload-validation`, `test:upload-security`)**: 58/58 passing.

---

## 2. Prioritized Report of Confirmed Defects & Issues

### A. Critical Database Migration Defect (BLOCKING)
- **Duplicate Migration Timestamp**: `supabase/migrations/20261020000000_add_whatsapp_customer_invitations_and_onboarding.sql` is a duplicate of `20261020010000_add_whatsapp_customer_invitations_and_onboarding.sql` and collides with `20261020000000_fix_game_status_in_atomic_create_event.sql`.
- **Impact**: `test:migration` (`server/db/migration_integrity.test.ts`) fails with `duplicate timestamp` error.

### B. CI/CD Pre-Deployment Safety Gating (BLOCKING)
- **Missing Deployment Gates**: `.github/workflows/deploy-api.yml` and `.github/workflows/deploy-frontend.yml` lack pre-deployment gates (`tsc --noEmit`, automated test execution, and frozen lockfile verification) prior to deploying to Cloudflare Workers.
- **Impact**: Broken builds or regressions could be deployed automatically to production.

### C. Multi-Currency Sales Game Pricing Resolution
- **Issue**: `resolveSalesPricing` in `server/db/salesGames.ts` does not synthesize default tiers for second requested countries (e.g. `SG`) if `localGamePricingCache` already contains tiers for `MY`, causing `SG` pricing requests to fall back to `USD` instead of `SGD`.
- **Impact**: Sales partners inspecting games in Singapore see USD instead of SGD pricing.

### D. Sales Partner Developer Endpoint Compatibility
- **Issue**: `GET /api/developer/sales-partners` in `worker.ts` and `server.ts` returns `{ success: true, salesPartners: partners }` without alias `partners: partners`.
- **Impact**: Calling clients expecting `res.partners` encounter an undefined error.

### E. Payout Batch Creation Parameter Flexibility
- **Issue**: `createPayoutBatch` in `server/db/salesCommissions.ts` only accepts array of commission IDs (`commissionIds: string[]`) and requires `c.status === 'approved'`, failing when called with `{ partner_user_id, currency }` or with commissions in `'ready'` status.
- **Impact**: Automated batch payout creation fails when grouping ready commissions by partner and currency.

### F. Outdated Test Assertions & Dynamic Date Handling
- **`server/db/coalesce_payment_date_type_fix.test.ts`**: Hardcoded test dates `2026-10-15` to `2026-10-16` are now in the past relative to execution clock (2026-10-18), causing `EVENT_DATE_PASSED` (422) during event creation. Must use dynamic relative dates.
- **`server/db/showcase_game_id_not_null_fix.test.ts`**: Contains rigid literal string matches that fail against modernized schema definitions and optional chaining in `showcases.ts`.

---

## 3. Phased Execution Gates

### Phase 2: Fix Confirmed Defects
1. **Migration Deduplication**:
   - Remove redundant `supabase/migrations/20261020000000_add_whatsapp_customer_invitations_and_onboarding.sql`.
   - Verify `server/db/migration_integrity.test.ts` passes with 0 timestamp collisions.
2. **Sales Pricing & Batching Fixes**:
   - Update `server/db/salesGames.ts` to generate currency tiers for `normCountry` if missing.
   - Update `server/db/salesCommissions.ts` `createPayoutBatch` to support `{ partner_user_id, currency }` objects and accept status `'ready'`.
   - Update `worker.ts` and `server.ts` to return `{ success: true, salesPartners: partners, partners }`.
3. **Test Hardening**:
   - Update `server/db/coalesce_payment_date_type_fix.test.ts` with relative future dates.
   - Align `server/db/showcase_game_id_not_null_fix.test.ts` assertions with actual implementation.

### Phase 3: CI/CD & Deployment Safety
1. **Update `.github/workflows/deploy-api.yml`**:
   - Add step: `bun run lint` (`tsc --noEmit`).
   - Add step: `bun test` for core automated test suites.
   - Enforce fail-fast before deploying to Cloudflare Workers.
2. **Update `.github/workflows/deploy-frontend.yml`**:
   - Add step: `bun run lint`.
   - Ensure build succeeds before deployment.

### Phase 4: Regression Gates & Verification
1. Run all regression test suites:
   - `test:wallet`, `test:credits`, `test:security`, `test:flow`, `test:payment-methods`.
   - `test:migration`, `test:fail-closed-pricing`, `test:pending-limit`, `test:timezone`.
   - `test:showcase`, `test:showcase-decoupled`, `test:showcase-flow`, `test:showcase-lifetime`.
   - `test:upload-security`, `test:upload-validation`, `test:tile-upload`, `test:bucket-limits`.
   - Sales test suites (Phases 3, 4, 5, 6, 7, 8).
   - Invoicing test suites (Phases 2 & 5).
2. Verify full production compilation: `bun run build`.

### Phase 5: Production Deployment Checklist & Recommendation
1. Compile final report with:
   - All confirmed issues and resolutions.
   - Files modified.
   - Verified automated tests.
   - Database migrations required.
   - Go-Live Recommendation.
