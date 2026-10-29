# Centralized Wallet Reward Settings & Multi-Currency Architecture

## Executive Summary & System Overview

This document specifies the architecture, data schema, configuration precedence, and migration strategy for **Centralized Wallet Reward Settings** in Event Game Studio.

Historically, the platform's promotional and reward amounts were hardcoded in multiple decoupled layers:
1. **Welcome Credit**: RM800.00 hardcoded in `server/db/wallet.ts` (`WELCOME_CREDIT_AMOUNT`), `grant_welcome_credit_atomic()` in PostgreSQL, and locale strings.
2. **Showcase Credit**: RM300.00 hardcoded in `server/db/wallet.ts` (`SHOWCASE_CREDIT_AMOUNT`), `server/db/showcaseRewardSubmissions.ts`, `approve_first_event_showcase_reward_atomic()` in PostgreSQL, and locale strings.
3. **Top-Up Bonus**: Tier 1 (5% at RM6,000) and Tier 2 (7% at RM10,000) hardcoded in `server/db/wallet.ts` (`calculateTopupCredit()`), `process_topup_order_atomic()` in PostgreSQL, and `TopUpPage.tsx`.

The goal of this architecture is to transition the platform to a single, authoritative, multi-currency configuration source managed via the Developer Admin Panel, backed by PostgreSQL tables with strict audit history, while preserving 100% of the existing ACID guarantees, idempotency protections, and user/owner lifetime eligibility invariants.

---

## 1. Inventory of Identified Hardcoded Values

### Application Code
- `server/db/wallet.ts`:
  - `WELCOME_CREDIT_AMOUNT = 800.00`
  - `SHOWCASE_CREDIT_AMOUNT = 300.00`
  - `TOPUP_TIER_1_MIN = 6000.00`, `TOPUP_TIER_1_RATE = 0.05`
  - `TOPUP_TIER_2_MIN = 10000.00`, `TOPUP_TIER_2_RATE = 0.07`
  - `MAX_TOPUP_CREDIT_PER_EVENT_PERCENT = 0.20`
  - `calculateTopupCredit(amount: number)` uses hardcoded cents calculation for 6,000 and 10,000
  - `getTopupQuote()` returns hardcoded `tiers` object
  - `grantWelcomeCredit()` and `grantShowcaseCredit()` fallback messages and transaction descriptions
- `server/db/rewards.ts`:
  - `getShowcaseRewardEligibility()` returns hardcoded `RM300 Showcase Reward...` strings
- `server/db/showcaseRewardSubmissions.ts`:
  - Line 518: `reward_amount: 300.0`
  - Authoritative validation strings: `RM300 Showcase Reward has already been claimed...`

### Database Functions (PostgreSQL)
- `grant_welcome_credit_atomic(p_org_id UUID, p_user_id UUID, ...)`:
  - Line 5086: `v_welcome_amount NUMERIC(12, 2) := 800.00;`
- `approve_first_event_showcase_reward_atomic(p_showcase_id UUID, ...)`:
  - Line 5376: `v_credit_amount NUMERIC := 300.00;`
- `process_topup_order_atomic(p_order_id UUID, p_organization_id UUID, ...)`:
  - Lines 3426–3435:
    ```sql
    IF v_order.top_up_amount >= 10000.00 THEN
      v_promo_credit := ROUND(v_order.top_up_amount * 0.07, 2);
      v_tier_rate := '7%';
    ELSIF v_order.top_up_amount >= 6000.00 THEN
      v_promo_credit := ROUND(v_order.top_up_amount * 0.05, 2);
      v_tier_rate := '5%';
    ELSE
      v_promo_credit := 0.00;
      v_tier_rate := '0%';
    END IF;
    ```

### Frontend Components
- `src/components/wallet/TopUpPage.tsx`:
  - Line 474: `tier1Min = quote?.tiers.tier1_min ?? 6000`
  - Line 475: `tier2Min = quote?.tiers.tier2_min ?? 10000`
  - Hardcoded upgrade helper hints assuming MYR amounts

---

## 2. Proposed Database Schema

To support multi-currency, flexible bonus tiers, and historical configuration reproducibility, three database tables are created:

### A. `public.wallet_reward_settings`
Stores the country-level reward settings and feature flags:
```sql
CREATE TABLE IF NOT EXISTS public.wallet_reward_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code VARCHAR(2) NOT NULL,
  currency VARCHAR(3) NOT NULL,
  welcome_credit_amount NUMERIC(12, 2) NOT NULL DEFAULT 800.00 CHECK (welcome_credit_amount >= 0),
  welcome_credit_enabled BOOLEAN NOT NULL DEFAULT true,
  showcase_credit_amount NUMERIC(12, 2) NOT NULL DEFAULT 300.00 CHECK (showcase_credit_amount >= 0),
  showcase_credit_enabled BOOLEAN NOT NULL DEFAULT true,
  topup_bonus_enabled BOOLEAN NOT NULL DEFAULT true,
  max_topup_credit_per_event_percent NUMERIC(5, 4) NOT NULL DEFAULT 0.2000 CHECK (max_topup_credit_per_event_percent >= 0 AND max_topup_credit_per_event_percent <= 1),
  is_active BOOLEAN NOT NULL DEFAULT true,
  version INT NOT NULL DEFAULT 1,
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT uq_wallet_reward_settings_country UNIQUE (country_code)
);
```

### B. `public.wallet_topup_tiers`
Stores the ordered deposit bonus tiers for each country/currency configuration:
```sql
CREATE TABLE IF NOT EXISTS public.wallet_topup_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reward_settings_id UUID NOT NULL REFERENCES public.wallet_reward_settings(id) ON DELETE CASCADE,
  country_code VARCHAR(2) NOT NULL,
  currency VARCHAR(3) NOT NULL,
  tier_name TEXT NOT NULL,
  min_deposit NUMERIC(12, 2) NOT NULL CHECK (min_deposit >= 0),
  max_deposit NUMERIC(12, 2) CHECK (max_deposit IS NULL OR max_deposit >= min_deposit),
  calculation_type VARCHAR(20) NOT NULL DEFAULT 'PERCENTAGE' CHECK (calculation_type IN ('PERCENTAGE', 'FIXED')),
  bonus_rate NUMERIC(6, 4) NOT NULL DEFAULT 0.0000 CHECK (bonus_rate >= 0),
  bonus_fixed_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (bonus_fixed_amount >= 0),
  max_bonus_amount NUMERIC(12, 2) CHECK (max_bonus_amount IS NULL OR max_bonus_amount >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
```

### C. `public.wallet_reward_settings_history`
Maintains an immutable snapshot audit log of all changes made by administrators:
```sql
CREATE TABLE IF NOT EXISTS public.wallet_reward_settings_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settings_id UUID NOT NULL,
  country_code VARCHAR(2) NOT NULL,
  currency VARCHAR(3) NOT NULL,
  version INT NOT NULL,
  snapshot JSONB NOT NULL,
  changed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  change_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
```

---

## 3. Configuration Precedence & Country Resolution

When determining reward amounts and top-up bonus tiers:
1. **Target Organization Country Resolution**:
   - Query `public.organizations.country_code` for the target organization.
   - If missing or unconfigured, resolve from organization defaults via `countryUtils.ts`.
2. **Exact Country Match**:
   - Query `public.wallet_reward_settings` WHERE `country_code = v_org_country` AND `is_active = true`.
3. **Currency Validation**:
   - Verify that the resolved settings `currency` strictly matches the organization's wallet `currency`.
   - Never cross-denominate (e.g. apply MYR amounts to an SGD wallet).
4. **Deterministic Fallback Policy**:
   - If an organization's country has no active custom settings, fall back to the platform default base configuration (`DEFAULT_COUNTRY = 'MY'`, `currency = 'MYR'`) ONLY if the organization's wallet currency is `MYR`.
   - For non-MYR currencies (e.g. `SGD`, `USD`), if no specific configuration exists for that country/currency, **fail closed** with a safe, clear error (`REWARD_SETTINGS_NOT_CONFIGURED`) rather than granting an incorrect or misdenominated reward.

---

## 4. Top-Up Order Lifecycle & Immutability

1. **Order Creation (`createTopupOrder`)**:
   - Resolves active `wallet_reward_settings` and `wallet_topup_tiers` for the organization's country & currency.
   - Calculates `expected_credit_amount` and `bonus_percentage`.
   - Binds the configuration snapshot and version into the top-up order:
     ```json
     {
       "reward_settings_version": 1,
       "applied_tier_id": "uuid",
       "tier_name": "Tier 1 (5%)",
       "calculation_type": "PERCENTAGE",
       "bonus_rate": 0.05
     }
     ```
2. **Settlement (`process_topup_order_atomic`)**:
   - Authoritative settlement verifies the order status transition to `PAID`.
   - Checks if order metadata contains bound `expected_credit_amount`.
   - If present, credits the bound credit amount; if legacy or unconfigured, evaluates against active tiers for the order's currency.
   - Guarantees that editing tier percentages in the Developer Admin Panel never alters pending or completed past orders.

---

## 5. PostgreSQL Functions Refactoring Plan

1. **`grant_welcome_credit_atomic`**:
   - Reads `welcome_credit_amount` and `welcome_credit_enabled` from `public.wallet_reward_settings` matching `v_org.country_code`.
   - If disabled (`welcome_credit_enabled = false`), aborts with `WELCOME_CREDIT_DISABLED`.
   - If enabled, credits the exact configured amount to `organization_wallets.welcome_credit` and records transaction.
2. **`approve_first_event_showcase_reward_atomic`**:
   - Reads `showcase_credit_amount` and `showcase_credit_enabled` from `public.wallet_reward_settings` matching `v_org.country_code`.
   - If disabled, aborts with `SHOWCASE_CREDIT_DISABLED`.
   - If enabled, credits the exact configured amount to `organization_wallets.showcase_credit`, records transaction, and records in `owner_showcase_rewards` and `user_rewards`.
3. **`process_topup_order_atomic`**:
   - Prioritizes order's bound `expected_credit_amount` stored at creation.
   - Resolves tiers from `public.wallet_topup_tiers` for `v_order.currency` and `v_order.top_up_amount`.

---

## 6. Migration and Seeding Plan

- Initial migration: `20261028010000_centralize_wallet_reward_settings.sql` (chronologically ordered after `20261028000000_add_organization_last_login_tracking.sql`).
- Seed verified baseline business rules:
  - **Malaysia (MY / MYR)**:
    - Welcome Credit: RM800.00 (enabled)
    - Showcase Credit: RM300.00 (enabled)
    - Top-up Bonus: enabled, 20% event cap
      - Tier 1: min RM6,000.00, 5% bonus rate
      - Tier 2: min RM10,000.00, 7% bonus rate
  - **Singapore (SG / SGD)**:
    - Welcome Credit: S$300.00 (enabled)
    - Showcase Credit: S$100.00 (enabled)
    - Top-up Bonus: enabled, 20% event cap
      - Tier 1: min S$2,000.00, 5% bonus rate
      - Tier 2: min S$3,500.00, 7% bonus rate
  - **United States (US / USD)**:
    - Welcome Credit: $200.00 (enabled)
    - Showcase Credit: $75.00 (enabled)
    - Top-up Bonus: enabled, 20% event cap
      - Tier 1: min $1,500.00, 5% bonus rate
      - Tier 2: min $2,500.00, 7% bonus rate
- Backward compatibility: Existing wallet balances, completed orders, and historical transactions remain untouched.
