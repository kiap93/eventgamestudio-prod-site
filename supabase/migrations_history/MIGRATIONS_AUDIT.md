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
- **No Rewriting of Applied Migrations**: Migrations that may already have been executed against production/staging databases (`001` through `029`) have their versions, filenames, and contents preserved without modification.
- **Archive Preserved**: All 34 original historical files (including colliding files and branches) are archived verbatim in `supabase/migrations_history/`.

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

---

## 4. Final Clean Migration Directory

The active `supabase/migrations/` directory now contains a strictly sequential, continuous, and non-conflicting series from `001` to `030`:
- `001_upgrade_to_multiple_games.sql`
- `002_add_game_layout_config.sql`
- `003_remove_theme_active_state.sql`
- `004_developer_admin_system_themes.sql`
- `005_remove_games_active_theme_id.sql`
- `006_prevent_duplicate_system_games.sql`
- `007_ensure_all_games_columns_and_reload_cache.sql`
- `008_wallet_engine_and_ledger.sql`
- `009_create_event_showcase_tables.sql`
- `010_event_showcase_review_workflow.sql`
- `011_atomic_event_payment_rpc.sql`
- `012_create_wallet_topup_orders.sql`
- `013_create_event_high_scores.sql`
- `014_lock_topup_settlement_security.sql`
- `015_add_event_pricing.sql`
- `016_link_events_to_games_with_restrict.sql`
- `017_add_theme_game_config.sql`
- `018_separate_event_lifecycle_and_payment_status.sql`
- `019_lock_down_rls_and_storage_security.sql`
- `020_ensure_wallet_topup_orders_columns_and_reload_cache.sql`
- `021_migrate_memory_match_theme_game_config.sql`
- `022_fix_atomic_event_payment_record_unassigned.sql`
- `023_fix_settle_wallet_topup_order_unassigned.sql`
- `024_restrict_financial_rpcs_to_service_role.sql`
- `025_score_environment_lifecycle.sql`
- `026_add_database_score_environment.sql`
- `027_automatic_test_score_clearing.sql`
- `028_fix_wallet_topup_settlement_atomic.sql`
- `029_leaderboard_idempotency_constraint.sql`
- `030_add_google_mail_settings.sql`
