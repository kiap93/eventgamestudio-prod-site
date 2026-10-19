# Event Creation Pricing Resolution & Multi-Dimensional Lookup Fix

Fix the event creation pricing lookup in EventGameStudio where adding USD pricing caused event creation to fail with an ambiguous-pricing error (`AMBIGUOUS_PRICING_TIER`) reporting multiple matching pricing records.

## User Review & Critical Decisions

> [!IMPORTANT]
> **Key Architecture Decisions for Review:**
> - **Multi-Dimensional Pricing Filter**: Every pricing query and RPC will strictly resolve on **5 dimensions simultaneously**: `(game_id, country_code, currency, duration_days, is_active = true)`. Records for different countries or currencies are distinct and will never collide or trigger ambiguous pricing errors.
> - **Authoritative Organization-Driven Pricing**: Malaysia (`MY`) organizations strictly resolve to `MYR` pricing. United States (`US`) organizations strictly resolve to `USD` pricing. Client-submitted currency or country overrides in request bodies are ignored/rejected in favor of the authenticated organization's database record.
> - **Fail-Closed Missing Pricing**: When USD pricing is missing for a duration (or for games with no USD tiers), the system returns `NO_PRICING_TIER` (Contact Us), never silently falling back to Malaysia (`MYR`) pricing or picking the first record.
> - **Database Repair Migration**: Existing database records in `public.game_pricing` with `currency = 'USD'` that were stamped with `country_code = 'MY'` will be migrated to `country_code = 'US'`, and legacy overloads of `calculate_event_authoritative_price` will be cleaned up.

---

## 1. Overview & Root Cause Analysis

### The Problem
When USD pricing tiers were added to `game_pricing`, creating an event for games with both MYR and USD tiers began failing with `AMBIGUOUS_PRICING_TIER: Multiple active pricing tiers match duration of X days for this game`.

### Root Cause
1. **Database RPC Overload & Missing Dimensions**:
   - Migration `20260925000000` / `20260930000000` created a 5-parameter version of `calculate_event_authoritative_price(p_event_id, p_game_id, p_start_date, p_end_date, p_pricing_id)`. Its query checked:
     `WHERE game_id = v_target_game_id AND is_active = true AND min_days <= v_duration_days AND (max_days IS NULL OR max_days >= v_duration_days)`
     without filtering by `country_code` or `currency`.
   - Migration `20261011000000` introduced a 6-parameter version (`p_country_code VARCHAR DEFAULT NULL`), but did not drop the 5-parameter overload.
   - Crucially, even in the updated query, `currency` was omitted from the matching criteria, and historical records with `currency = 'USD'` were updated to `country_code = 'MY'`.
2. **Server-Side Fallback Leaking Across Currencies**:
   - `resolveGamePrice()` in `server/db/gamePricing.ts` contained a secondary fallback to Malaysia (`MYR`) if default country pricing was missing, which violated the requirement that US organizations must never fall back to MYR.
   - Client endpoints (`/api/events/quote`) accepted `body.country_code` directly instead of strictly resolving from `organization.country_code`.
3. **Database Validation Trigger Collision**:
   - `validate_game_pricing_overlap` trigger did not partition by `currency` alongside `country_code`, causing false positive overlap errors during pricing management.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              PRICING RESOLUTION FLOW                                   │
├──────────────────────────┬─────────────────────────────┬───────────────────────────────┤
│ 1. Client Event Dialog   │ 2. Server API Route         │ 3. Database & Resolver        │
│    (CreateEventDialog)   │    (/api/events & quote)    │    (resolveGamePrice & RPC)   │
├──────────────────────────┼─────────────────────────────┼───────────────────────────────┤
│ User selects dates/game  │ Resolve Org Country from DB │ Match on 5 Dimensions:        │
│                          │ • Org country = 'MY' -> MYR │ • game_id = target_game_id    │
│                          │ • Org country = 'US' -> USD │ • country_code = org_country  │
│                          │ Reject/ignore client-sent   │ • currency = expected_currency│
│                          │ currency or country override│ • duration within [min, max]  │
│                          │                             │ • is_active = true            │
│                          │                             ├───────────────────────────────┤
│                          │                             │ Result:                       │
│                          │                             │ • 1 match  -> OK (Price/Tier) │
│                          │                             │ • 0 match  -> Contact Us (422)│
│                          │                             │ • >1 match -> Ambiguous (409) │
└──────────────────────────┴─────────────────────────────┴───────────────────────────────┘
```

---

## 2. Key Product Decisions & Trade-Offs

- **Decision 1: Country-to-Currency Determinism**
  - *Chosen Approach*: The expected currency is derived authoritatively from the organization's country (`MY` -> `MYR`, `US` -> `USD`).
  - *Why*: Eliminates ambiguity and prevents foreign currency exploitation while guaranteeing domestic customers always see local pricing.
- **Decision 2: Strict Fail-Closed (No Cross-Country Fallbacks for Configured Markets)**
  - *Chosen Approach*: If a US organization schedules an event for a duration where USD pricing is missing, the resolver returns `NO_PRICING_TIER` (Contact Us), rather than falling back to MYR.
  - *Why*: Enforces Requirement 7 ("Do not silently choose the first record, use another country's pricing, or fall back to MYR when USD pricing is missing").
- **Decision 3: Non-Destructive Data Correction**
  - *Chosen Approach*: Write a targeted migration that corrects `country_code` to `'US'` for records with `currency = 'USD'` where `country_code` was erroneously set to `'MY'`, while preserving all pricing rows.

---

## 3. Technical Architecture & Implementation Steps

### Step 1: Database Migration (`supabase/migrations/20261022000000_fix_game_pricing_multi_dimensional_lookup.sql`)
1. **Data Cleanup**:
   - Update `game_pricing` rows with `currency = 'USD'` and `country_code = 'MY'` to `country_code = 'US'`.
   - Update any remaining rows where `country_code IS NULL` to appropriate country based on currency (`MYR` -> `MY`, `USD` -> `US`).
2. **Drop Conflicting Function Overloads**:
   - `DROP FUNCTION IF EXISTS public.calculate_event_authoritative_price(UUID, UUID, DATE, DATE, UUID);`
   - `DROP FUNCTION IF EXISTS public.calculate_event_authoritative_price(UUID, UUID, DATE, DATE, UUID, VARCHAR);`
3. **Redefine `public.calculate_event_authoritative_price`**:
   - Accept `(p_event_id, p_game_id, p_start_date, p_end_date, p_pricing_id, p_country_code)`.
   - Derive `v_expected_currency` from `v_requested_country`.
   - Strict 5-dimension query in Step 1:
     ```sql
     SELECT count(*) INTO v_matching_count
     FROM public.game_pricing
     WHERE game_id = v_target_game_id
       AND country_code = v_requested_country
       AND currency = v_expected_currency
       AND is_active = true
       AND min_days <= v_duration_days
       AND (max_days IS NULL OR max_days >= v_duration_days);
     ```
   - If `v_requested_country = 'US'`, do NOT fall back to `MY`.
   - If `v_requested_country = 'MY'`, do NOT fall back to `US`.
   - Only unconfigured third countries fall back to the platform default country (`US`).
4. **Update `public.validate_game_pricing_overlap()`**:
   - Check overlap scoped to `game_id`, `country_code`, and `currency`.
5. **Update `create_event_atomic`**:
   - Ensure `create_event_atomic` passes `v_org_country` into `calculate_event_authoritative_price`.

### Step 2: TypeScript Pricing Resolver Updates (`server/db/gamePricing.ts`)
1. **Multi-Dimensional Matching in `resolveGamePrice`**:
   - Derive `expectedCurrency = getCurrencyForCountry(requestedCountry)`.
   - Filter `requestedTiers` matching both `t.country_code === requestedCountry` AND `t.currency === expectedCurrency`.
   - If `requestedCountry` is `'US'` or `'MY'`, disable cross-country secondary fallbacks to satisfy Requirement 7.
2. **Fix `validateNoOverlappingPricingTier` & `bulkUpsertGamePricing`**:
   - Prevent eager unintended auto-seeding of default tiers during validation.
   - Scope overlap checks to `(game_id, country_code, currency)`.

### Step 3: API Endpoints & Server Hardening (`server.ts`, `worker.ts`, `server/db/events.ts`)
1. In `/api/events/quote`:
   - Resolve `quoteCountry` directly from the authenticated organization's record (`org.country_code`).
   - Disallow client request body from overriding country or injecting arbitrary currency.
2. In `createEvent` (`server/db/events.ts`):
   - Ensure authoritative country and currency snapshot match organization settings.
   - Pass resolved country down to `calculateEventAuthoritativePrice`.

### Step 4: Sync Schema & Public Pricing (`supabase/schema.sql`, `src/lib/publicPricing.ts`)
1. Keep `supabase/schema.sql` in full sync with the new migration.
2. Ensure `getPublicGamesPricing` and `matchGamePricingTier` filter active tiers matching the requested country's expected currency.

---

## 4. Verification & Regression Test Plan

### Automated Test Suite (`server/game_pricing_multidimensional.test.ts` & existing suites)
1. **Test A: Coexisting MYR and USD pricing for the same game & duration**:
   - Game with 1-day MYR tier (RM1,400) and 1-day USD tier ($500).
   - Ensure neither is flagged as ambiguous.
2. **Test B: Malaysia organization event creation**:
   - Organization with `country_code = 'MY'` creates 1-day event -> resolves to RM1,400 (`MYR`).
3. **Test C: US organization event creation**:
   - Organization with `country_code = 'US'` creates 1-day event -> resolves to $500 (`USD`).
4. **Test D: Missing USD pricing returns Contact Us**:
   - US organization requests 57 days (no tier configured) -> returns `NO_PRICING_TIER` (Contact Us), never falls back to MYR.
5. **Test E: Explicit duplicate detection for identical dimensions**:
   - Two active tiers for same game, same country (`US`), same currency (`USD`), same duration (1 day) -> explicitly flags `AMBIGUOUS_PRICING_TIER` (409).
6. **Test F: Existing duration tiers preserved**:
   - Verify 1 day, 2 days, 3 days, 4–7 days, 8–14 days, 15–30 days remain fully functional.
7. **Test G: Currency manipulation rejection**:
   - US organization submitting request body with `event_currency: 'MYR'` or `country_code: 'MY'` is ignored/rejected in favor of organization settings (`USD`).
8. **Test H: Run existing regression tests**:
   - `bun test server/country_based_game_pricing.test.ts`
   - `bun test server/pricing_id_game_validation.test.ts`
   - `bun test server/create_event_modal_pricing_behavior.test.ts`
   - `bun test server/db/event_duration_pricing_tiers.test.ts`
   - `bun run build` / `bun run lint`
