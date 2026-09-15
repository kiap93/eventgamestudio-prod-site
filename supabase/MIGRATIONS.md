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
| **Post-Baseline 7** | `supabase/migrations/20260904050000_leaderboard_rls_live_window.sql` | **Leaderboard RLS Live Window**: Restricts public SELECT on `event_high_scores` strictly to paid events in their active live window and hides test scores. |
| **Post-Baseline 8** | `supabase/migrations/20260904060000_storage_buckets_alignment.sql` | **Storage Bucket Limits & Media Alignment**: Sets 25MB limit on `game-assets`, provisions dedicated 200MB `showcase-media` bucket with tenant-scoped policies. |
| **Post-Baseline 9** | `supabase/migrations/20260904070000_organizations_members_backend_write_only.sql` | **Organizations & Membership Backend-Write-Only**: Revokes direct client mutations on `organizations`, `organization_members`, and `organization_invitations`, enforcing single server API authority. |
| **Post-Baseline 10** | `supabase/migrations/20260904080000_showcase_media_storage_path_verification.sql` | **Showcase Media Backend-Write-Only & Storage Validation**: Enforces storage path hierarchy, disallows SVG uploads, and revokes direct client mutations on `event_showcase_media`. |
| **Post-Baseline 11** | `supabase/migrations/20260906000000_showcase_moderation_and_reward_decoupling.sql` | **Showcase Moderation & Reward Decoupling**: Decouples content visibility from financial reward, adds moderation audit log table (`showcase_moderation_logs`), and introduces `BLOCKED`/`DELETED` statuses. |
| **Post-Baseline 12** | `supabase/migrations/20260906010000_event_showcases_backend_write_only.sql` | **Event Showcases Backend-Write-Only**: Revokes direct client mutation privileges (`INSERT`, `UPDATE`, `DELETE`) on `event_showcases`, preserves tenant SELECT, and installs defense-in-depth triggers protecting critical reward/moderation columns. |
| **Post-Baseline 13** | `supabase/migrations/20260906020000_atomic_showcase_credit_reward.sql` | **Atomic Showcase Credit Reward**: Implements atomic showcase reward reservation RPC. |
| **Post-Baseline 14** | `supabase/migrations/20260906030000_atomic_showcase_reward_approval.sql` | **Atomic Showcase Reward Approval**: Implements atomic developer approval RPC. |
| **Post-Baseline 15** | `supabase/migrations/20260906040000_owner_level_showcase_reward.sql` | **Owner-Level Showcase Reward**: Dedicated `public.owner_showcase_rewards` ledger, `owner_user_id` on showcases and transactions, unique constraints and atomic approval RPC. |
| **Post-Baseline 16** | `supabase/migrations/20260907000000_add_expired_to_event_status.sql` | **Event Lifecycle Expired Status**: Adds `EXPIRED` status check constraint to `public.events`. |
| **Post-Baseline 17** | `supabase/migrations/20260909000000_add_country_code_to_organizations.sql` | **Country Code Support**: Adds `country_code` to `public.organizations`. |
| **Post-Baseline 18** | `supabase/migrations/20260909010000_atomic_create_event.sql` | **Atomic Event Creation**: Implements `create_event_atomic` RPC. |
| **Post-Baseline 19** | `supabase/migrations/20260910000000_atomic_create_organization.sql` | **Atomic Organization Creation**: Implements `create_organization_atomic` RPC. |
| **Post-Baseline 20** | `supabase/migrations/20260912000000_user_level_welcome_credit.sql` | **User-Level Welcome Credit**: Dedicated `public.user_rewards` ledger table with unique constraint `(user_id, reward_type)`. |
| **Post-Baseline 21** | `supabase/migrations/20260912010000_create_central_notifications.sql` | **Central Notifications**: Dedicated `public.central_notifications` table for system notifications. |
| **Post-Baseline 22** | `supabase/migrations/20260913000000_add_event_timezone_to_events.sql` | **Event Timezone**: Adds `event_timezone` column to `public.events`. |
| **Post-Baseline 23** | `supabase/migrations/20260914000000_user_level_reward_security_and_reconciliation.sql` | **User-Level Reward Security & Reconciliation**: Hardens `owner_showcase_rewards` foreign keys (`ON DELETE SET NULL`), backfills `user_rewards`, reconciles historical duplicate transactions to `REVERSED`, and hardens RLS. |
| **Post-Baseline 24** | `supabase/migrations/20260914010000_disable_automatic_welcome_credit.sql` | **Disable Automatic Welcome Credit**: Updates `create_organization_atomic` RPC to initialize wallets with RM0.00 and eliminates automated welcome credit grants on organization creation. |
| **Post-Baseline 25** | `supabase/migrations/20260914020000_lock_topup_payment_constraints_and_idempotency.sql` | **Top-Up Payment Constraints & Idempotency**: Adds unique indexes for transaction reference IDs, paid payment references, Stripe session & payment intent IDs, `payment_webhook_events` dedup table, and hardened settlement RPC. |
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
Contains the canonical timestamp migrations:
- `20260903000000_initial_baseline.sql` — Historical baseline (snapshot as of 2026-09-03 00:00:00 UTC)
- `20260903010000_add_outstanding_balance_to_organization_wallets.sql` — Canonical timestamp equivalent of Migration 031 (chronologically ordered directly after the baseline)
- `20260904000000_atomic_outstanding_balance_settlement.sql` — Atomic settlement RPC
- `20260904010000_atomic_checkout_claim.sql` — Distributed checkout session claim
- `20260904020000_prevent_user_privilege_escalation.sql` — User privilege escalation protection
- `20260904030000_events_backend_write_only.sql` — Events backend-write-only RLS hardening
- `20260904040000_games_themes_backend_write_only.sql` — Games & themes backend-write-only RLS hardening
- `20260904050000_leaderboard_rls_live_window.sql` — Leaderboard RLS live window protection
- `20260904060000_storage_buckets_alignment.sql` — Storage bucket limits & dedicated showcase-media bucket
- `20260904070000_organizations_members_backend_write_only.sql` — Organizations, members & invitations backend-write-only RLS hardening
- `20260904080000_showcase_media_storage_path_verification.sql` — Showcase media backend-write-only & storage path security
- `20260906000000_showcase_moderation_and_reward_decoupling.sql` — Showcase moderation & reward decoupling with audit log table
- `20260906010000_event_showcases_backend_write_only.sql` — Event showcases backend-write-only RLS hardening & trigger protection
- `20260906020000_atomic_showcase_credit_reward.sql` — Atomic PostgreSQL RPC & unique constraint preventing concurrent duplicate showcase reward grants
- `20260906030000_atomic_showcase_reward_approval.sql` — Showcase reward approval atomic procedure
- `20260906040000_owner_level_showcase_reward.sql` — Owner-level showcase reward constraint & verification
- `20260907000000_add_expired_to_event_status.sql` — Adds EXPIRED enum state to event status
- `20260909000000_add_country_code_to_organizations.sql` — Adds country_code column to organizations
- `20260909010000_atomic_create_event.sql` — Atomic event creation procedure with collision-resistant token generation
- `20260910000000_atomic_create_organization.sql` — Atomic organization creation procedure
- `20260912000000_user_level_welcome_credit.sql` — User-level welcome credit granting and tracking
- `20260912010000_create_central_notifications.sql` — Central notifications ledger and trigger system
- `20260913000000_add_event_timezone_to_events.sql` — Adds event_timezone column to public.events and updates create_event_atomic with country-based resolution and override support
- `20260914000000_user_level_reward_security_and_reconciliation.sql` — User-level reward security and reconciliation
- `20260914010000_disable_automatic_welcome_credit.sql` — Disables automatic welcome credit grant on organization creation
- `20260914020000_lock_topup_payment_constraints_and_idempotency.sql` — Topup payment constraints, webhook event dedup, and idempotency
- `20260915000000_create_api_error_logs.sql` — Centralized API error logs table, indexes, and service role / developer admin RLS policies

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
