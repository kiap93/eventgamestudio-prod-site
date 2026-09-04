# Migration History Audit & Cleanup Documentation

## Overview

This document records the migration audit and forward-only migration cleanup executed on the `supabase/migrations` directory.

---

## 1. Context & Historical Root Cause

During parallel branch development and feature rollouts, several migration files were created with colliding sequential numeric prefixes:
1. **Prefix 013 Collision**:
   - `013_create_event_high_scores.sql` (high scores table and indexes)
   - `013_lock_topup_settlement_security.sql` (hardened top-up settlement RLS policies)
2. **Prefix 014 Collision**:
   - `014_create_event_high_scores.sql` (duplicate of 013 high scores)
   - `014_lock_topup_settlement_security.sql` (duplicate of 013 lock topup)
   - `014_add_event_pricing.sql` (initial event pricing migration)
3. **Prefix 015 Supersession**:
   - `015_add_event_pricing.sql` (expanded event pricing migration including combined credit modes and event lifecycle promotion, superseding 014)
4. **Prefix 017 / 017b Collision**:
   - `017_add_google_mail_settings.sql` (Gmail settings table and RLS)
   - `017_add_theme_game_config.sql` (generic JSONB game_config for game themes)
   - `017b_add_google_mail_settings.sql` (duplicate of 017 Gmail settings with non-standard 'b' suffix)

---

## 2. Historical Preservation Policy

In accordance with strict production database safety principles:
- **No Rewriting of Applied Migrations**: Migrations that may already have been executed against production/staging databases (`001` through `031`) have their versions, filenames, and contents preserved without modification.
- **Archive Preserved**: All 36 original historical files (including colliding files and branches, through 031) are archived verbatim in `supabase/migrations_history/`.

---

## 3. Forward-Only Migration Strategy

To resolve collisions for new deployment environments while preserving compatibility with existing databases:
1. **Continuous 001–029 Baseline**:
   - Kept `013_create_event_high_scores.sql` (canonical version 013).
   - Kept `014_lock_topup_settlement_security.sql` (canonical version 014).
   - Kept `015_add_event_pricing.sql` (canonical version 015).
   - Kept `016_link_events_to_games_with_restrict.sql` (canonical version 016).
   - Kept `017_add_theme_game_config.sql` (canonical version 017).
   - Kept `018` through `029` with their exact existing numbers and filenames so production schema tracking (`supabase_migrations.schema_migrations`) remains 100% synchronized.
2. **Forward Migration 030**:
   - Created `030_add_google_mail_settings.sql` using idempotent DDL (`CREATE TABLE IF NOT EXISTS public.google_mail_settings`, `CREATE POLICY ...`).
   - For existing databases where the table may already exist, migration 030 safely no-ops without error and marks itself applied in `schema_migrations`.
   - For new databases, migration 030 runs in strict chronological order after 029.
3. **Historical Archive Preservation**:
   - Both `030_add_google_mail_settings.sql` and `031_add_outstanding_balance_to_organization_wallets.sql` are preserved in `supabase/migrations_history/` alongside `001`–`029`.

---

## 4. Final Clean Migration Directory

The active `supabase/migrations/` directory now contains ONLY the 4 canonical timestamp migrations:
- `20260903000000_initial_baseline.sql`
- `20260903010000_add_outstanding_balance_to_organization_wallets.sql`
- `20260904000000_atomic_outstanding_balance_settlement.sql`
- `20260904010000_atomic_checkout_claim.sql`

---

## 5. Baseline Architecture & Post-Baseline Sequence (Strategy B)

### 5.1 The Baseline Boundary Date
The baseline migration file `20260903000000_initial_baseline.sql` is formally defined as:
- **Production Schema Snapshot as of 2026-09-03 00:00:00 UTC**.
- Equivalent to cumulative migrations 001 through 030.
- Contains the 14 core platform tables and initial financial RPCs.
- **Explicitly does NOT contain `outstanding_balance`** on `organization_wallets` or post-baseline order fields.

### 5.2 Post-Baseline Delta (Migration 031 & Subsequent Migrations)
The schema evolved post-baseline via the following strictly chronological sequence:
1. **Migration 031 / `20260903010000_add_outstanding_balance_to_organization_wallets.sql`**:
   - Added `outstanding_balance` column to `organization_wallets`.
   - Added `included_outstanding_amount`, `payable_amount`, `total_due` to `wallet_topup_orders`.
   - Updated constraint to allow `top_up_amount >= 0.00`.
2. **Migration `20260904000000_atomic_outstanding_balance_settlement.sql`**:
   - Upgraded `process_topup_order_atomic` and `settle_wallet_topup_order_atomic` to atomically deduct outstanding balance upon order settlement.
3. **Migration `20260904010000_atomic_checkout_claim.sql`**:
   - Added `claim_checkout_session_creation` and `release_checkout_session_claim` for distributed concurrency locking across worker instances.

### 5.3 Canonical Single-File Snapshot
`supabase/schema.sql` is maintained as the single-file cumulative latest schema containing the baseline plus all post-baseline additions.

For complete developer guidelines and migration runbook, refer to `supabase/MIGRATIONS.md`.

