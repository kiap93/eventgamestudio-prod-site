# Technical Systems: Database Schema & Security Architecture

This document details the relational database schema, defense-in-depth write protections, Row-Level Security (RLS) policies, atomic PostgreSQL stored procedures, and migration history in **Event Game Studio**, verified against `supabase/migrations/*.sql`.

---

## 1. Security Model: Backend-Write-Only Architecture

Event Game Studio operates on a **defense-in-depth backend-write-only model**.

Because browser clients possess the public `VITE_SUPABASE_ANON_KEY`, standard Supabase implementations often leak database update privileges if RLS policies have subtle oversights. Event Game Studio completely neutralizes this attack surface:

```
[ Frontend Browser Client ]
           │
  (Attempts Direct PostgREST Mutation)
           │
           ▼
┌────────────────────────────────────────────────────────┐
│  1. Table Privileges: REVOKE INSERT, UPDATE, DELETE    │
│     FROM anon, authenticated                           │
│                                                        │
│  2. Defense Triggers: BEFORE INSERT OR UPDATE OR DELETE│
│     Aborts with EXCEPTION if current_user != service   │
└────────────────────────────────────────────────────────┘
           │
        (BLOCKED)
```

### Secured Entities
The following core tables are strictly backend-write-only:
- `public.organizations`
- `public.organization_members`
- `public.organization_invitations`
- `public.events`
- `public.games`
- `public.themes`
- `public.event_showcases`
- `public.organization_wallets`
- `public.wallet_transactions`

All mutations MUST originate from the backend API (`server.ts` or `worker.ts`) using the privileged `SUPABASE_SERVICE_ROLE_KEY`.

---

## 2. Core Relational Tables

### 1. `public.users`
User account identities authenticated via Google OAuth.
- `id` (UUID, Primary Key): Internal unique user identifier.
- `email` (TEXT, Unique, NOT NULL): Normalized user email.
- `name` (TEXT): Display name.
- `avatar_url` (TEXT): Profile picture URL from Google.
- `is_developer` (BOOLEAN, Default: `false`): Platform administrator flag.
- `created_at`, `updated_at` (TIMESTAMPTZ).

### 2. `public.organizations`
Multi-tenant organizational accounts.
- `id` (UUID, Primary Key).
- `name` (TEXT, NOT NULL): Company / Agency name.
- `country_code` (TEXT, Default: `'MY'`): Two-letter country code.
- `currency` (TEXT, Default: `'MYR'`): Base accounting currency.
- `timezone` (TEXT, Default: `'Asia/Singapore'`): Business timezone.
- `created_at`, `updated_at` (TIMESTAMPTZ).

### 3. `public.organization_members`
Association between users and organizations.
- `id` (UUID, Primary Key).
- `organization_id` (UUID, Foreign Key $\rightarrow$ `organizations.id`, CASCADE).
- `user_id` (UUID, Foreign Key $\rightarrow$ `users.id`, CASCADE).
- `role` (TEXT, NOT NULL): `'owner'` | `'admin'` | `'designer'` | `'member'` | `'viewer'`.
- Unique constraint: `(organization_id, user_id)`.

### 4. `public.events`
Event activation bookings and licenses.
- `id` (UUID, Primary Key).
- `organization_id` (UUID, Foreign Key $\rightarrow$ `organizations.id`).
- `name` / `title` (TEXT, NOT NULL).
- `game_type` (TEXT, NOT NULL): References game catalog ID.
- `theme_id` (UUID, Foreign Key $\rightarrow$ `themes.id`).
- `start_date` (DATE, NOT NULL): Event opening day.
- `end_date` (DATE, NOT NULL): Event closing day.
- `status` (TEXT, Default: `'SCHEDULED'`): `'SCHEDULED'` | `'LIVE'` | `'COMPLETED'` | `'CANCELLED'` | `'EXPIRED'`.
- `payment_status` (TEXT, Default: `'UNPAID'`): `'UNPAID'` | `'PENDING_PAYMENT'` | `'PAID'` | `'REFUNDED'` | `'EXPIRED'`.
- `event_price` (NUMERIC(10,2), NOT NULL): Locked authoritative price in MYR.
- `public_token` (TEXT, Unique, NOT NULL): High-entropy slug for attendee kiosk URL.
- `test_scores_cleared_at` (TIMESTAMPTZ): Timestamp when rehearsal scores were wiped.

### 5. `public.organization_wallets`
Financial ledger balances per organization.
- `id` (UUID, Primary Key).
- `organization_id` (UUID, Unique, Foreign Key $\rightarrow$ `organizations.id`).
- `paid_balance` (NUMERIC(10,2), Default: 0.00): Cash balance.
- `welcome_credit` (NUMERIC(10,2), Default: 0.00): Onboarding credit balance.
- `showcase_credit` (NUMERIC(10,2), Default: 0.00): Showcase reward credit balance.
- `topup_credit` (NUMERIC(10,2), Default: 0.00): Top-up reward bonus balance.
- `outstanding_balance` (NUMERIC(10,2), Default: 0.00): Debt balance requiring settlement.
- `welcome_credit_granted` (BOOLEAN, Default: `false`): Idempotency guard for welcome bonus.
- `showcase_credit_granted` (BOOLEAN, Default: `false`): Idempotency guard for showcase reward.

### 6. `public.wallet_transactions`
Immutable double-entry transaction history.
- `id` (UUID, Primary Key).
- `organization_id` (UUID, Foreign Key $\rightarrow$ `organizations.id`).
- `amount` (NUMERIC(10,2), NOT NULL): Positive for credits, negative for debits.
- `transaction_type` (TEXT, NOT NULL): `'DEPOSIT'` | `'EVENT_PAYMENT'` | `'WELCOME_CREDIT'` | `'SHOWCASE_REWARD'` | `'TOPUP_REWARD'` | `'REFUND'` | `'REVERSAL'`.
- `ledger` (TEXT, NOT NULL): `'PAID_BALANCE'` | `'WELCOME_CREDIT'` | `'SHOWCASE_CREDIT'` | `'TOPUP_CREDIT'`.
- `reference_id` (TEXT): Unique external payment or idempotency key.
- `created_at` (TIMESTAMPTZ, Default: `now()`).

### 7. `public.event_high_scores`
Live tournament and rehearsal score logs.
- `id` (UUID, Primary Key).
- `event_id` (UUID, Foreign Key $\rightarrow$ `events.id`).
- `score` (NUMERIC(10,2), NOT NULL): Achieved score.
- `score_environment` (TEXT, NOT NULL): `'test'` vs `'live'`.
- `is_test` (BOOLEAN, NOT NULL): Flag for rehearsal quarantine.
- `session_id` (TEXT, NOT NULL): Validated client gameplay session ID.
- `player_name` (TEXT, NOT NULL): Sanitized attendee name.
- `metadata` (JSONB): Telemetry (duration, combo, inputs).

### 8. `public.event_showcases` & `event_showcase_media`
Marketing case studies and attached media assets.
- `event_showcases.id` (UUID, Primary Key).
- `event_showcases.event_id` (UUID, Unique, Foreign Key $\rightarrow$ `events.id`).
- `event_showcases.status` (TEXT): `'DRAFT'` | `'PUBLISHED'` | `'UNPUBLISHED'` | `'BLOCKED'` | `'DELETED'`.
- `event_showcases.reward_status` (TEXT): `'NOT_ELIGIBLE'` | `'AWAITING_APPROVAL'` | `'REWARDED'` | `'REJECTED'`.
- `event_showcase_media.id` (UUID, Primary Key).
- `event_showcase_media.media_type` (TEXT): `'photo'` | `'video'`.
- `event_showcase_media.storage_path` (TEXT): Object key in `showcase-media` bucket.
- `event_showcase_media.display_order` (INTEGER): Manual sorting index.

---

## 3. Atomic PostgreSQL Stored Procedures (RPCs)

Critical multi-step operations execute inside PostgreSQL stored procedures with explicit row-level locks (`FOR UPDATE`):

### `public.approve_first_event_showcase_reward_atomic`
- **Migration**: `20260906030000_atomic_showcase_reward_approval.sql`
- **Actions**:
  1. Locks `event_showcases` and `organization_wallets` rows `FOR UPDATE`.
  2. Verifies `wallet.showcase_credit_granted = false`.
  3. Verifies `showcase.reward_status = 'AWAITING_APPROVAL'`.
  4. Increments `wallet.showcase_credit` by `300.00` and sets `showcase_credit_granted = true`.
  5. Inserts `wallet_transactions` row with `SHOWCASE_REWARD`.
  6. Updates `showcase.reward_status = 'REWARDED'` and sets `reviewed_at = now()`.

### `public.atomic_checkout_claim`
- **Migration**: `20260904010000_atomic_checkout_claim.sql`
- **Actions**: Locks the pending `topup_orders` row and claims checkout session creation, preventing duplicate Stripe sessions from rapid clicking.

### `public.atomic_outstanding_balance_settlement`
- **Migration**: `20260904000000_atomic_outstanding_balance_settlement.sql`
- **Actions**: Deducts deposited top-up funds against any existing debt in `outstanding_balance` before crediting `paid_balance`.

### `public.create_organization_atomic`
- **Migration**: `20260909000000_atomic_create_organization.sql`
- **Actions**: Atomically inserts the organization, inserts the owner membership, and initializes the wallet row with `welcome_credit = 800.00`.

---

## 4. Migration History & Timeline

Migrations in `/supabase/migrations/` document the progressive security hardening:

| Migration File | Architectural Milestone |
| :--- | :--- |
| `20260901000000_initial_schema.sql` | Base schema: users, orgs, events, games, themes, scores, wallets |
| `20260902000000_wallet_multi_ledger.sql` | Split wallet into cash, welcome, showcase, and topup ledgers |
| `20260903000000_score_environments.sql` | Added `score_environment` ('test' / 'live') and session tracking |
| `20260904000000_atomic_outstanding_balance_settlement.sql` | Implemented outstanding balance settlement RPC |
| `20260904010000_atomic_checkout_claim.sql` | Implemented atomic checkout session lock RPC |
| `20260904020000_organizations_backend_write_only.sql` | Revoked client writes; added defense triggers to orgs and members |
| `20260904030000_events_backend_write_only.sql` | Enforced backend-write-only security on events table |
| `20260906000000_showcase_moderation_and_reward_decoupling.sql` | Decoupled showcase visibility (`PUBLISHED`) from rewards |
| `20260906010000_event_showcases_backend_write_only.sql` | Revoked direct client mutations on `event_showcases` |
| `20260906030000_atomic_showcase_reward_approval.sql` | Implemented `approve_first_event_showcase_reward_atomic` RPC |
| `20260909000000_atomic_create_organization.sql` | Implemented `create_organization_atomic` RPC |
| `20260909010000_atomic_create_event.sql` | Implemented `create_event_atomic` RPC |
