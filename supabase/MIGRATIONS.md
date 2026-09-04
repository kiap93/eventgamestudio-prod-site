# Supabase Database Migration Architecture & Canonical Schema Guide

## Executive Summary & Architecture Strategy (Strategy B)

This document establishes the authoritative definition of the database schema, migration tracks, baseline boundaries, and post-baseline migration sequence for **Event Game Studio**.

In accordance with **Strategy B** (explicit baseline date boundary + post-baseline delta):

| Component | Identifier / Path | Canonical Definition |
| :--- | :--- | :--- |
| **Historical Baseline** | `supabase/migrations/20260903000000_initial_baseline.sql` | **Production Schema Snapshot as of 2026-09-03 00:00:00 UTC** (Migrations 001–030 equivalent). Does **NOT** contain `outstanding_balance`. |
| **Post-Baseline 1** | `supabase/migrations/20260903010000_add_outstanding_balance_to_organization_wallets.sql` | **Immediate Post-Baseline Migration**: Introduces `outstanding_balance` on `organization_wallets` and minimum-payment tracking on `wallet_topup_orders` (timestamp equivalent of historical 031). |
| **Post-Baseline 2** | `supabase/migrations/20260904000000_atomic_outstanding_balance_settlement.sql` | **Atomic Balance Settlement**: Atomic deduction of outstanding balance in `process_topup_order_atomic`. |
| **Post-Baseline 3** | `supabase/migrations/20260904010000_atomic_checkout_claim.sql` | **Distributed Concurrency Lock**: Distributed checkout session claim (`claim_checkout_session_creation`, `release_checkout_session_claim`). |
| **Post-Baseline 4** | `supabase/migrations/20260904020000_prevent_user_privilege_escalation.sql` | **User Privilege Escalation Protection**: Triggers preventing non-service_role tampering with `is_developer` flag. |
| **Post-Baseline 5** | `supabase/migrations/20260904030000_events_backend_write_only.sql` | **Events Backend-Write-Only**: Revokes direct client mutations on `events`, enforces server API authority. |
| **Post-Baseline 6** | `supabase/migrations/20260904040000_games_themes_backend_write_only.sql` | **Games & Themes Backend-Write-Only**: Revokes direct client mutations on `games` & `game_themes`, enforces immutable game-theme association and system template protection. |
| **Complete Cumulative Schema** | `supabase/schema.sql` | **Latest Canonical Single-File Snapshot**: Contains all tables, indexes, RLS policies, `outstanding_balance`, and all RPCs. |

---

## 1. Why Strategy B Was Adopted

### The Architectural Problem
When creating a consolidated baseline file (`20260903000000_initial_baseline.sql`), it captured the database schema prior to the introduction of the Stripe minimum payment & outstanding balance ledger.

If a developer or automated tool assumes that `20260903000000_initial_baseline.sql` contains the **current** production schema, that assumption is false:
1. `20260903000000_initial_baseline.sql` **does not contain** `outstanding_balance` on `public.organization_wallets`.
2. `20260903000000_initial_baseline.sql` **does not contain** `included_outstanding_amount`, `payable_amount`, or `total_due` on `public.wallet_topup_orders`.
3. `20260903000000_initial_baseline.sql` **does not contain** the atomic deduction logic in `process_topup_order_atomic` or the distributed claim lock RPCs.

### The Resolution (Strategy B)
Rather than destructively mutating an already-applied historical baseline file, we explicitly define:
1. **`20260903000000_initial_baseline.sql` is strictly the schema as of September 3, 2026 00:00:00 UTC**.
2. **Migration 031 (`031_add_outstanding_balance_to_organization_wallets.sql`) is explicitly post-baseline**, representing the schema evolution that occurred after the baseline snapshot date.
3. Subsequent migrations (`20260904000000` and `20260904010000`) continue the sequential, forward-only evolution.

---

## 2. Chronological Schema Evolution Timeline

```
                                    BASELINE SNAPSHOT
                                (2026-09-03 00:00:00 UTC)
                                           │
 Historical Migrations 001 - 030          │
 ┌──────────────────────────────────────┐  │
 │ 001: upgrade_to_multiple_games       │  │
 │ 008: wallet_engine_and_ledger        │  │
 │ 012: wallet_topup_orders             │  │
 │ 015: event_pricing                   │  │
 │ 019: lock_down_rls_and_storage       │  │
 │ 028: fix_wallet_topup_settlement     │  │
 │ 029: leaderboard_idempotency         │  │
 │ 030: google_mail_settings            │  │
 └──────────────────────────────────────┘  │
                    │                      │
                    ▼                      ▼
       20260903000000_initial_baseline.sql ────────────────┐
       (Pre-outstanding-balance schema snapshot)           │
                                                           │
                                                           ▼ POST-BASELINE MIGRATIONS
                                            ┌─────────────────────────────────────────────────┐
                                            │ Migration 031 / 20260903010000                  │
                                            │ • Add outstanding_balance to wallets            │
                                            │ • Add included_outstanding_amount to orders     │
                                            │ • Allow top_up_amount >= 0.00                   │
                                            └─────────────────────────────────────────────────┘
                                                           │
                                                           ▼
                                            ┌─────────────────────────────────────────────────┐
                                            │ Migration 20260904000000                        │
                                            │ • Atomic outstanding balance deduction in       │
                                            │   process_topup_order_atomic                    │
                                            └─────────────────────────────────────────────────┘
                                                           │
                                                           ▼
                                            ┌─────────────────────────────────────────────────┐
                                            │ Migration 20260904010000                        │
                                            │ • Atomic checkout claim & distributed lock      │
                                            │   claim_checkout_session_creation               │
                                            └─────────────────────────────────────────────────┘
                                                           │
                                                           ▼
                                                CURRENT PRODUCTION SCHEMA
                                                  (supabase/schema.sql)
```

---

## 3. Migration Tracks & Directory Structure

The repository maintains an active canonical directory and an immutable historical archive:

### Active Directory (`supabase/migrations/`)
Contains ONLY the 4 canonical timestamp migrations:
- `20260903000000_initial_baseline.sql` — Historical baseline (snapshot as of 2026-09-03 00:00:00 UTC)
- `20260903010000_add_outstanding_balance_to_organization_wallets.sql` — Canonical timestamp equivalent of Migration 031 (chronologically ordered directly after the baseline)
- `20260904000000_atomic_outstanding_balance_settlement.sql` — Atomic settlement RPC
- `20260904010000_atomic_checkout_claim.sql` — Distributed checkout session claim

### Historical Archive (`supabase/migrations_history/`)
Preserves the complete original sequential migration chain (`001_...` through `031_...`), branch collision variants (`013`, `014`, `017b`), and `MIGRATIONS_AUDIT.md`.
**No historical migration file in `supabase/migrations_history/` may ever be rewritten or deleted.**

---

## 4. Deployment Guides

### Option A: Fresh Database via Single Canonical Script (Recommended for Dev/Local)
Execute `supabase/schema.sql` directly:
```bash
psql $DATABASE_URL -f supabase/schema.sql
```
This script is strictly cumulative and contains:
- All baseline tables, RLS policies, and triggers
- `outstanding_balance` and minimum-payment order tracking
- All atomic RPCs including `process_topup_order_atomic`, `settle_wallet_topup_order`, and `claim_checkout_session_creation`

### Option B: Fresh Database via Baseline + Post-Baseline Migrations
If using the Supabase CLI migration runner or automated CI/CD:
1. Apply baseline:
   ```bash
   psql $DATABASE_URL -f supabase/migrations/20260903000000_initial_baseline.sql
   ```
2. Apply post-baseline migrations in order:
   ```bash
   psql $DATABASE_URL -f supabase/migrations/20260903010000_add_outstanding_balance_to_organization_wallets.sql
   psql $DATABASE_URL -f supabase/migrations/20260904000000_atomic_outstanding_balance_settlement.sql
   psql $DATABASE_URL -f supabase/migrations/20260904010000_atomic_checkout_claim.sql
   ```

### Option C: Existing Production Database (Already on 030 or Baseline)
If the database was already migrated up to 030 or baseline:
1. Apply `20260903010000_add_outstanding_balance_to_organization_wallets.sql` (safe idempotent `ADD COLUMN IF NOT EXISTS`).
2. Apply `20260904000000_atomic_outstanding_balance_settlement.sql` (`CREATE OR REPLACE FUNCTION`).
3. Apply `20260904010000_atomic_checkout_claim.sql` (`CREATE OR REPLACE FUNCTION`).

---

## 5. Historical Archive Policy

The directory `supabase/migrations_history/` preserves all 36 historical migration files (including branch collisions 013, 014, 017b, 030, and 031) and `MIGRATIONS_AUDIT.md`.
**No historical migration file in `supabase/migrations_history/` may ever be rewritten or deleted.**
