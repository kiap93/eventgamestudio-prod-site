# AI Changelog

This changelog records major structural, architectural, business logic, and documentation changes performed by AI coding agents on the **Event Game Studio** codebase.

---

## [2026-09-24] - Fix Showcase "Submit for RM300 Reward" Flow: Autosave on Submit

### Summary
Fixed the Showcase reward submission workflow where users edit their showcase description and immediately click **“Submit for RM300 Reward”**. Previously, if the latest description had not been manually saved beforehand, the submission endpoint evaluated the stale saved record and could return a validation error (`"Showcase description must be at least 50 characters to qualify for reward review."`). The button now automatically detects unsaved showcase changes, seamlessly triggers the existing `handleSave` action first, waits for the save to succeed, and only then initiates the reward review submission.

### Key Changes Implemented
1. **Autosave Sequence in `handleSubmitReward` (`src/components/events/EventShowcasePage.tsx`)**:
   - Integrated `hasUnsavedChanges()` verification into `handleSubmitReward`.
   - If unsaved changes exist, calls the existing `handleSave(undefined, { silentSuccess: true })` and awaits successful completion before triggering `POST /api/events/:eventId/showcase/reward-submission`.
   - If save fails, halts the submission pipeline, preserves user input in the form, and displays the error banner.
   - If no unsaved changes exist, proceeds directly to reward submission without redundant save requests.
2. **Double-Click & Concurrency Guard**:
   - Utilizes `submittingRewardRef` and `savingRef` to immediately block concurrent duplicate clicks and prevents firing save and submit calls in parallel.
   - Displays `"Submitting..."` on the reward button during processing with `disabled={submittingReward || saving}`.
3. **Backend Validation Authority**:
   - Preserves strict backend validation requiring >= 50 characters and minimum media criteria for review qualification.
4. **Verification & Testing (`server/showcase_autosave_reward_submission.test.ts`)**:
   - Verified direct submission when no changes are pending.
   - Verified save-first sequence when valid edits are unsaved.
   - Verified save-first with backend rejection when edited description is under 50 characters.
   - Verified abort on save failure with error retention.
   - Verified concurrent click rejection.

---

## [2026-09-24] - Fix Event Showcase Publish 500 Error: null value in column "game_id" violates not-null constraint

### Summary
Fixed the HTTP 500 Internal Server Error when publishing an event showcase on `POST /api/events/:eventId/showcase/publish`:
`"Database error publishing showcase: null value in column \"game_id\" of relation \"event_showcases\" violates not-null constraint"`
The database RPCs `publish_event_showcase_atomic` and `save_event_showcase_atomic` did not fetch `game_id` from the parent event record and omitted `game_id` from the `INSERT` statements when creating new showcase records. Additionally, the backend service code did not supply `game_id` in the RPC payload or direct fallback insertions, and `event_showcases.game_id` possessed a `NOT NULL` constraint in some environments.

### Key Changes Implemented
1. **Database Migration (`supabase/migrations/20261001000000_ensure_showcase_game_id_and_atomic_rpcs.sql`)**:
   - Added migration to ensure `game_id` column exists on `public.event_showcases`, relaxes any `NOT NULL` constraint (`ALTER TABLE public.event_showcases ALTER COLUMN game_id DROP NOT NULL`), and adds an index `idx_event_showcases_game_id`.
   - Backfilled existing null `game_id` values on `event_showcases` by joining with parent events and game themes.
   - Updated `publish_event_showcase_atomic` and `save_event_showcase_atomic` under `SECURITY DEFINER` to:
     - Fetch `game_id` and `game_theme_id` from `public.events`.
     - Resolve `v_game_id` with fallback cascade (`v_event.game_id` -> `game_themes.game_id` -> payload `game_id` -> default system game).
     - Populate `game_id` on both `INSERT` and `UPDATE` statements for `event_showcases`.
2. **Schema & Historical Migrations (`supabase/schema.sql`, `supabase/migrations/20260929000000_fix_showcase_service_role_trigger.sql`)**:
   - Updated cumulative schema and migration files to maintain full parity.
3. **Backend Service Layer (`server/db/showcases.ts` & `server/db/types.ts`)**:
   - Updated `publishShowcase` to resolve `game_id` from the event or theme and pass `payload.game_id` into `publish_event_showcase_atomic`.
   - Updated direct table fallback paths in `createShowcase` and `publishShowcase` to set `game_id` and gracefully retry if encountering older schemas without the column.
   - Updated `EventShowcaseRecord` TypeScript definition in `server/db/types.ts` to include `game_id?: string | null`.
4. **Verification & Test Suite (`server/db/showcase_game_id_not_null_fix.test.ts`)**:
   - Added automated tests verifying schema SQL, migrations, and backend service payload handling for `game_id`.
   - Ran complete linting and compilation passes with zero errors.

---

## [2026-09-24] - Fix Event Payment 500 Error: COALESCE Types Text and Date Cannot Be Matched

### Summary
Fixed the HTTP 500 Internal Server Error when executing event activation payment on `POST /api/events/:eventId/pay`:
`"Financial ledger transaction failed: COALESCE types text and date cannot be matched"`
The database RPCs `process_event_payment_atomic` and `calculate_event_authoritative_price` were calling `COALESCE` with mixed incompatible types: the `TEXT` columns `v_event.start_date`, `v_event.end_date`, and `v_event.event_date` together with PostgreSQL `DATE` expressions `(starts_at AT TIME ZONE tz)::date` and `p_start_date`. In PostgreSQL, `COALESCE` strictly requires all arguments to have identical or coercible data types; because `TEXT` and `DATE` cannot be implicitly matched, PostgreSQL raised a type resolution exception during payment transaction execution.

### Key Changes Implemented
1. **Migration & RPC Standardization (`supabase/migrations/20260930000000_fix_coalesce_date_type_mismatch_in_payment_and_pricing.sql`)**:
   - Created new dedicated post-baseline migration `20260930000000_fix_coalesce_date_type_mismatch_in_payment_and_pricing.sql`.
   - Updated `process_event_payment_atomic` to parse string dates into `DATE` safely via regex validation (`CASE WHEN v_event.start_date ~ '^\d{4}-\d{2}-\d{2}' THEN (SUBSTRING(v_event.start_date FROM 1 FOR 10))::date ELSE NULL END`) before passing them to `COALESCE`.
   - Updated `calculate_event_authoritative_price` to standardize date resolution with identical explicit date casting.
2. **Schema & Historical Migrations (`supabase/schema.sql`, `supabase/migrations/20260926000000_...`, `supabase/migrations/20260925000000_...`)**:
   - Updated cumulative `supabase/schema.sql` and prior migration files so fresh installations and existing environments both resolve dates consistently without type mismatch errors.
3. **Automated Test Suite (`server/db/coalesce_payment_date_type_fix.test.ts`)**:
   - Added automated tests verifying that no migration or schema file contains mismatched `COALESCE(text, date)` patterns.
   - Tested event payment execution with the exact user payload parameters (`payment_mode: "FULL_PAID"`, `topup_credit_requested: 0`, `use_event_credit: true`, `use_welcome_credit: false`, `welcome_credit_requested: 0`), verifying successful completion and wallet deduction.

---

## [2026-09-24] - Fix Event Showcases `created_by` NOT NULL Constraint in Atomic Publish RPC

### Summary
Fixed the database error:
`Database error publishing showcase: null value in column "created_by" of relation "event_showcases" violates not-null constraint`
when executing `POST /api/events/:eventId/showcase/publish` or calling `publish_event_showcase_atomic`. The column `created_by` was missing from the `INSERT` column list in both `publish_event_showcase_atomic` and `save_event_showcase_atomic`, causing inserts of brand-new event showcases to fail when `created_by` has a `NOT NULL` constraint in the database schema.

### Key Changes Implemented
1. **Migration & Schema Consolidation (`supabase/migrations/20260929000000_fix_showcase_service_role_trigger.sql`, `supabase/schema.sql`)**:
   - Updated `publish_event_showcase_atomic` to include `created_by` in the `INSERT INTO public.event_showcases` column list and assign it `v_owner_id`.
   - Updated `save_event_showcase_atomic` to include `created_by` in the `INSERT INTO public.event_showcases` column list and assign it `v_owner_id`.
2. **Server & Fallback Handlers (`server/db/showcases.ts`)**:
   - In `createShowcase` and `publishShowcase` direct table fallback logic, included `created_by: creatorUserId` (resolved from `updates?.owner_user_id` or organization `owner_id`).
   - Added resilient retry handlers checking `isMissingColumnError(err, 'created_by')` for maximum forward and backward compatibility across differing database schemas.
3. **Automated Test Verification (`server/db/showcase_atomic_publish.test.ts`)**:
   - Verified that newly published showcases have `created_by` populated and matching the organization owner.
   - All 28 test assertions in `server/db/showcase_atomic_publish.test.ts` passed cleanly.

---

## [2026-09-24] - Environment-Controlled Error Message Mode (EXPOSE_API_ERRORS)

### Summary
Implemented a secure, environment-controlled error-message mode across the EventGameStudio API (`worker.ts`, `server.ts`, and `server/errors.ts`). By default (safe mode), internal server errors are masked behind `"Something went wrong. Please try again."` with a correlation `requestId`. When `EXPOSE_API_ERRORS=true` is explicitly enabled for temporary production debugging, the API returns the actual underlying error message while automatically stripping stack traces and redacting sensitive credentials, tokens, and database passwords.

### Key Changes Implemented
1. **Centralized Error Handlers (`server/errors.ts`)**:
   - Implemented `shouldExposeApiErrors(env)` adhering to strict boolean evaluation (only exact case-insensitive match for `'true'` enables debug mode; `undefined`, `false`, `0`, `yes`, etc. remain safe).
   - Implemented `getActualErrorMessage(err)` extracting clean, informative error strings, stripping V8/Node stack frames, and redacting database passwords, JWT tokens, Bearer authorization credentials, Stripe secret keys, and Supabase service keys.
   - Updated both `handleWorkerApiError` (Cloudflare Worker) and `handleApiError` (Express) to conditionally return the underlying error when enabled, while preserving the existing correlation `requestId` and HTTP status codes (400, 401, 403, 404, 409, 422, 500).
2. **Environment & Worker Typing (`worker.ts`, `.env.example`)**:
   - Added `EXPOSE_API_ERRORS?: string;` to `Env` interface in `worker.ts`.
   - Documented `EXPOSE_API_ERRORS="false"` in `.env.example`.
3. **Comprehensive Verification & Testing (`server/errors.test.ts`, `server/expose_api_errors.test.ts`)**:
   - Verified default safe mode returns `"Something went wrong. Please try again."` with `requestId`.
   - Verified debug mode returns actual underlying messages on `POST /api/events/:eventId/showcase/publish`, `POST /api/events/:eventId/showcase` (draft creation), and `PATCH /api/events/:eventId/showcase` (draft update).
   - Verified status code preservation (400, 401, 403, 404, 409, 422, 500) and operational error routing.
   - Verified credential redaction in debug responses.
4. **Documentation (`docs/ai/error_handling.md`)**:
   - Documented Wrangler CLI commands (`npx wrangler secret put EXPOSE_API_ERRORS`) and Cloudflare Dashboard instructions for temporary production debugging and reverting to safe mode.

---

## [2026-09-24] - Event Showcase Publish 500 Fix & Atomic RPC Consolidation

### Summary
Diagnosed and resolved the production HTTP 500 error on `POST /api/events/:eventId/showcase/publish`. Replaced the direct table mutation trigger vulnerability with the canonical `publish_event_showcase_atomic` SECURITY DEFINER RPC, hardened the `prevent_event_showcase_unauthorized_client_mutations` trigger against modern PostgREST / Cloudflare Worker service-role execution patterns, accepted nullable showcase fields safely, and enriched Worker error observability.

### Root Cause Analysis
1. **Trigger Rejection of Service Role Backend Connections**:
   - The database trigger `prevent_event_showcase_unauthorized_client_mutations` previously relied exclusively on `current_setting('request.jwt.claim.role', true)` and `auth.role()`.
   - In modern PostgREST / Supabase environments and Cloudflare Workers executing with `SUPABASE_SERVICE_ROLE_KEY`, claims are often packaged in `request.jwt.claims` JSON or evaluated under session roles where individual claim settings are absent, causing legitimate backend operations to be misclassified as client mutations and rejected.
2. **Missing Authoritative RPC Utilization**:
   - Migration `20260929000000_fix_showcase_service_role_trigger.sql` existed in the repository defining `publish_event_showcase_atomic` and a hardened trigger, but the active runtime path in `worker.ts` and `server/db/showcases.ts` was still attempting direct table mutations on `event_showcases`.

### Key Changes Implemented
1. **Migration & Schema Hardening (`supabase/migrations/20260929000000_fix_showcase_service_role_trigger.sql`, `supabase/schema.sql`)**:
   - Trigger `prevent_event_showcase_unauthorized_client_mutations` now robustly inspects:
     - `current_user` and `session_user` in `('postgres', 'supabase_admin', 'service_role')`
     - `current_setting('role', true) = 'service_role'`
     - `request.jwt.claim.role`
     - JSON parsing of `request.jwt.claims ->> 'role'`
     - `auth.role() = 'service_role'`
   - Added concurrency row locks (`FOR UPDATE`) and `unique_violation` exception recovery to `publish_event_showcase_atomic`.
   - Added defense-in-depth checks requiring `payment_status = 'PAID'` and non-cancelled/non-expired lifecycle status in the RPC.
   - Restricted RPC execution via `REVOKE ... FROM PUBLIC, anon, authenticated` and `GRANT ... TO service_role, postgres`.
2. **Authoritative Backend Publish Path (`server/db/showcases.ts`, `worker.ts`, `server.ts`)**:
   - Updated `publishShowcase` to invoke `supabase.rpc('publish_event_showcase_atomic', ...)` as the primary production execution path with fallback to direct table / in-memory local caching only if RPC is missing or in mock environments.
   - Safely handles optional/nullable metadata (`description`, `client_name`, `client_logo_url`, `cover_image_url`).
   - Maintained self-service publication: no admin approval or reward review gating required to publish.
3. **Structured Logging & Error Observability (`worker.ts`, `server.ts`)**:
   - Added structured error logs in the Cloudflare Worker publish route logging `requestId`, `eventId`, `userId`, `organizationId`, `existingShowcaseId`, `existingShowcaseStatus`, `publishPath`, and sanitized error codes/details.
   - Preserved appropriate 4xx status codes (403 for blocked showcase, 404 for event not found, 422 for unstarted/unpaid event).
4. **Verification & Regression Testing (`server/db/showcase_atomic_publish.test.ts`, `server/db/migration_integrity.test.ts`, `server/db/showcase_decoupled_flow.test.ts`)**:
   - Created `server/db/showcase_atomic_publish.test.ts` verifying the exact production payload (`title: 'egefa'`, null metadata fields), updates to existing showcases, blocked showcase rejection (403), unpaid event rejection (422), unstarted event rejection (422), and reward decoupling.
   - Verified that all 46 decoupled showcase scenarios and migration integrity tests pass with 0 errors.

---

## [2026-09-24] - Organization Pending Event Limit Updated from 2 to 5

### Summary
Updated the organization-level active unpaid/pending event limit from 2 to 5. Ensured that expired events (both explicitly marked `EXPIRED` and unpaid events whose scheduled end date has passed in the event business timezone) do not consume a pending-event slot.

### Key Changes Implemented
1. **Centralized Constant & Database Defaults (`server/db/events.ts`, `supabase/schema.sql`)**:
   - Set `MAX_PENDING_EVENTS_PER_ORGANIZATION = 5` in `server/db/events.ts`.
   - Updated `create_event_atomic` RPC parameter default `p_max_pending_events` to 5.
   - Updated `check_event_pending_limit` trigger function to enforce the 5-event boundary (`v_pending_count >= 5`).
   - Created consolidated migration `supabase/migrations/20260928000000_update_pending_event_limit_to_5.sql`.
2. **Error Message & UX Alignment**:
   - Updated user-facing message across database, API error handlers, and frontend utilities:
     `"You have reached the maximum allowed limit of 5 unpaid events. Please pay for or delete an existing pending event before creating a new one."`
   - Only active pending events count toward this limit; expired, cancelled, completed, paid, and past-end-date events do not count.
3. **Concurrency & Atomicity**:
   - Preserved row-level locking (`SELECT ... FOR UPDATE` on `organizations`) to prevent race conditions under concurrent event creations.
4. **Verification & Regression Testing**:
   - Updated and passed `server/db/atomic_event_creation.test.ts` verifying limits 0 through 5, 6th creation rejection, concurrency race condition prevention, and slot reclamation on deletion/payment.
   - Updated and passed `server/db/event_lifecycle_payment_separation.test.ts` covering 5 pending event limit and complete lifecycle/payment transitions.

---

## [2026-09-19] - Showcase Approval Flow Consolidation, Decoupling & Comprehensive Verification

### Summary
Fully consolidated and audited the Showcase system to ensure that **SHOWCASE PUBLISHING DOES NOT REQUIRE ADMIN APPROVAL** and that Showcase content publishing and the RM300 first-event showcase reward lifecycle are completely separated across all backend engines, API routes, moderation pipelines, and tests.

### Key Work Accomplished
1. **Showcase Publishing & Public Visibility Consolidation (`server/db/showcases.ts`, `server.ts`, `worker.ts`)**:
   - Verified and consolidated self-service showcase publishing (`publishShowcase`, `unpublishShowcase`).
   - Standardized public visibility: a showcase is immediately viewable when `status === 'PUBLISHED'` (or `publication_status === 'PUBLISHED'`) and `status !== 'BLOCKED'` and `status !== 'DELETED'`, completely independent of `review_status` or `reward_status`.
   - Preserved reactive moderation actions: platform administrators can `blockShowcase` / `unblockShowcase` and `adminDeleteShowcase` with mandatory moderation reasons logged to `showcase_moderation_logs`.
2. **Decoupled Reward and Event Review Lifecycles**:
   - Re-verified complete separation of the RM300 first-event showcase reward (`reward_status` / `reward_review_status`: `NOT_ELIGIBLE`, `AWAITING_APPROVAL`, `REWARDED`, `REJECTED`) from editorial review (`review_status`: `DRAFT`, `SUBMITTED`, `APPROVED`, `REJECTED`) and publishing status.
   - Rejecting or approving a reward or editorial review never alters `status` or hides a published showcase.
3. **Automated Verification Test Suite (`server/db/showcase_decoupled_flow.test.ts`)**:
   - Created exhaustive test suite verifying:
     - Test 1: Showcase publishing is self-serve (starts in DRAFT, publishes immediately without admin intervention).
     - Test 2: Public visibility rules (published is visible, unpublished is hidden, republished is visible).
     - Test 3: Reward approval is decoupled from publication status (approved reward transitions to REWARDED while showcase status remains PUBLISHED and visible).
     - Test 4: Reward rejection does NOT unpublish showcase (rejected reward stores reason, status remains PUBLISHED and visible).
     - Test 5: Admin moderation pipeline (BLOCK immediately hides showcase with reason, UNBLOCK restores to PUBLISHED and visible).
     - Test 6: Soft deletion (DELETED sets deleted_at and hides showcase from public).
   - All 34 test assertions pass cleanly (`34 PASSED, 0 FAILED`).
4. **Documentation Alignment**:
   - Updated `/docs/ai/business_rules/showcase.md`, `/docs/ai/business_rules/event_flow.md`, and `/docs/ai/business_rules/wallet.md` to reinforce the self-serve, decoupled model.

---

## [2026-09-15] - Notification System Contract Alignment Audit & Inconsistency Repair

### Summary
Conducted a full-system Contract Alignment Audit of the Centralized Notification System. Repaired catalog discrepancies, dispatcher mappings, action URL fallbacks, deduplication keys, and documentation, ensuring absolute contract alignment across all 20 platform notification types without altering core architectural foundations.

### Key Changes Implemented
1. **Catalog Alignment & Export (`src/lib/notifications/types.ts`)**:
   - Replaced stale documentation comments referring to "12 platform notification types" with the authoritative 20 notification types.
   - Exported `NOTIFICATION_TYPES` readonly array encompassing all 20 types for test suites and runtime validations.
   - Reconciled `duplicatesAllowed` flags (`event_created` and `theme_ready` set to `false` matching strict entity-level deduplication keys).
2. **Dispatcher Contract Alignment (`server/notifications/dispatcher.ts`)**:
   - Fixed `THEME_READY` mapping to respect `event.previewUrl || '/games'` instead of hardcoded `/games`.
   - Fixed `EVENT_LIVE` mapping to correctly adopt `event.publicUrl || event.liveUrl || '/events'` (resolving parameter divergence from `server/db/events.ts`).
   - Fixed `PAYMENT_PENDING` mapping to gracefully fall back from `event.orderId` to `event.referenceId` or metadata, preventing `payment_pending_undefined` deduplication keys.
   - Fixed `PAYMENT_FAILED` deduplication key to fall back to `orderId` or `eventId` if `referenceId` is omitted.
   - Aligned `SHOWCASE_DRAFT_CREATED`, `SHOWCASE_PUBLISHED`, and `SHOWCASE_UPDATED` to support `event.publicUrl` while preserving `/events` fallback.
   - Updated TypeScript interfaces (`ShowcaseDraftCreatedEvent`, `ShowcasePublishedEvent`, `ShowcaseUnpublishedEvent`, `ShowcaseUpdatedEvent`) to include optional `publicUrl`.
3. **Comprehensive Contract Verification Suite (`server/notifications/notifications.test.ts`)**:
   - Verified all 20 catalog types exist with valid priorities, categories, and retention days.
   - Expanded Test Group 6 to assert dispatch handling, priority, action URLs, and interpolated messages across all 20 business domain event types.
   - Added Test Group 7: Exhaustive Catalog Template Placeholders Audit, confirming that all 20 templates have 100% of their `{placeholder}` parameters resolved without dangling syntax.
   - All 237 test assertions in `server/notifications/notifications.test.ts` pass cleanly.
4. **Documentation Alignment (`docs/ai/systems/notifications.md`)**:
   - Updated Section 2 to include a complete 20-row Alignment Matrix covering Category, Priority, Default Retention, Deduplication Policy, and Recipient Target.
   - Corrected developer test endpoint description from 12 types to 20 types.

---

## [2026-09-11] - Owner-Level First-Event Showcase Reward & Decoupled Workflows Refactor

### Summary
Refactored the First-Event Showcase Reward system from an organization-level reward to an **Owner-Level Reward** (`owner_user_id`), and completely decoupled **Showcase Publishing**, **Admin Event Quality Review**, and **Financial Reward Approval**.

### Key Architectural Changes
1. **Owner-Level Lifetime Reward (`owner_user_id`)**:
   - The first-event showcase reward is strictly evaluated against the Account Owner (`owner_user_id`) with a lifetime limit of 1 reward per owner.
   - Created database table `public.owner_showcase_rewards` with unique constraint on `owner_user_id`.
   - Migration `20260906040000_owner_level_showcase_reward.sql` provides the atomic RPC `approve_first_event_showcase_reward_atomic`.
   - Wallet credit grant in `server/db/wallet.ts` verifies `owner_showcase_rewards` before executing the RM300 deposit.
2. **Three Fully Decoupled Workflows**:
   - **Showcase Publishing**: Immediate, self-serve publishing (`status`: `DRAFT`, `PUBLISHED`, `UNPUBLISHED`, `BLOCKED`, `DELETED`). Organizers can publish directly once the event ends without admin waiting. Content moderation is reactive.
   - **Admin Event Review**: Dedicated editorial review workflow (`review_status`: `DRAFT`, `SUBMITTED`, `APPROVED`, `REJECTED`) with quality feedback endpoints (`/review/approve`, `/review/reject`).
   - **Reward Approval**: Financial approval workflow (`reward_status`: `NOT_ELIGIBLE`, `AWAITING_APPROVAL`, `REWARDED`, `REJECTED`) with endpoints (`/reward/approve`, `/reward/reject`). Rejecting a reward or review never unpublishes the showcase.
3. **Dual-Runtime API Parity**:
   - Added separated endpoints in both `server.ts` (Express) and `worker.ts` (Cloudflare Worker).
   - Added owner reward status endpoint (`/api/developer/showcases/owner-status/:ownerUserId`).
4. **Onboarding & UI Updates**:
   - Updated `src/components/events/EventShowcaseTab.tsx` with owner-level reward explanations and `REJECTED` status handling.
   - Updated `src/components/events/EventsPage.tsx` with an Owner First-Event Onboarding Banner.
   - Updated `src/components/auth/CreateOrganizationPage.tsx` explaining owner reward benefits.
   - Updated `src/components/developer/DeveloperShowcaseReviews.tsx` to reflect the decoupled workflows and display owner-level verification details.
5. **AI Documentation Updated**:
   - Updated `/docs/ai/business_rules/showcase.md`, `SHOWCASE_LOGIC.md`, and `AGENTS.md`.

---

## [2026-09-11] - Public Showcase View Page Implementation

### Summary
Implemented a dedicated, standalone, read-only public presentation page (`/showcase/:showcaseId` and `/s/:showcaseId`) for published event showcases. Unauthenticated attendees, clients, and partners can view published showcases without logging in, resolving the routing gap where public links redirected to the authenticated dashboard login.

### Changes Implemented
- **Frontend Routing**:
  - Updated `src/hooks/useRouteContext.ts` to add `public_showcase` mode and route parser for `/showcase/:showcaseId` and `/s/:showcaseId`.
  - Updated `src/App.tsx` to include `public_showcase` in `isPublicRoute` (exempt from authentication redirects) and render `<PublicShowcaseView />`.
- **Public Showcase View Component**:
  - Created `src/components/events/PublicShowcaseView.tsx`:
    - Full-bleed branded hero header with organization branding and event metadata.
    - Activation statistics metrics grid (estimated attendance, game plays, client name, event duration).
    - Responsive media gallery (photos and embedded video players) with full-screen lightbox navigation, keyboard support (Arrow keys, Escape), and touch-friendly controls.
    - Testimonial and qualitative highlights block.
    - Social sharing integration (Web Share API + clipboard fallback).
    - Unauthenticated public access guard (enforcing `PUBLISHED` status, blocking `BLOCKED` or `DELETED` content).
    - Organization member / developer preview badge when viewing unpublished drafts.
- **Backend API Endpoints (Dual-Runtime Parity)**:
  - Added public `GET /api/showcases/:id` and `GET /api/showcases/:id/media` to `server.ts` (Express) and `worker.ts` (Cloudflare Worker edge).
  - Enforces public access rules with optional JWT parsing: unauthenticated requests receive data only for `PUBLISHED` showcases; authenticated organization members or developers can preview draft showcases.
- **Management UI Integration**:
  - Updated `EventShowcasePage.tsx` and `EventShowcaseTab.tsx`: "View" buttons now open `/showcase/:id` in a new tab, and share links point to the public showcase route.
  - Updated `EventCard.tsx` and `DeveloperShowcaseReviews.tsx`: "View" action buttons directly launch the public showcase view.
  - Updated `src/lib/api.ts` to ensure API calls in container environments seamlessly resolve to relative URLs.
- **Documentation**:
  - Updated `/docs/ai/business_rules/showcase.md` and `/docs/ai/systems/api.md`.
  - Updated `/docs/ai/known_issues.md` marking Issue 1 as resolved.

### Validation
- TypeScript type checking: `tsc --noEmit` passed with 0 errors.
- Applet compilation: `vite build` completed cleanly.
- Preserved existing management, publishing, moderation, and reward workflows without regression.

---

## [2026-09-11] - AI Documentation System Initialization

### Summary
Created the comprehensive AI-to-AI master documentation system under `/docs/ai/` based on a full inspection of the running React SPA, Node.js/Express server (`server.ts`), Cloudflare Worker runtime (`worker.ts`), and Supabase PostgreSQL schema/migrations.

### Changes Implemented
- **Master Guide**: Created `/docs/ai/README.md` defining system purpose, source-of-truth hierarchy, document map, and the 9-step AI Change Workflow protocol.
- **Architecture**: Created `/docs/ai/architecture.md` detailing the dual-runtime backend (Express container vs Cloudflare Worker edge), frontend routing context, and data layers.
- **Business Rules Documentation**:
  - `/docs/ai/business_rules/event_flow.md`: Documented timezone handling (Asia/Singapore UTC+8), Setup Day rules, lifecycle states (`SCHEDULED`, `LIVE`, `COMPLETED`, `CANCELLED`, `EXPIRED`), access gating, and pre-event quarantine.
  - `/docs/ai/business_rules/payment_flow.md`: Documented dynamic pricing tiers, payment modes (`FULL_PAID`, `WELCOME_CREDIT`, `SHOWCASE_CREDIT`, `TOPUP_CREDIT`, `COMBINED_CREDIT`), Stripe checkout, and webhook confirmation.
  - `/docs/ai/business_rules/wallet.md`: Documented multi-ledger wallet balances, deposit top-up workflows, ACID transactions, and refund rules.
  - `/docs/ai/business_rules/scores.md`: Documented test vs live score quarantine, automatic score clearing on Setup Day, session token anti-cheat, and leaderboard sanitization.
  - `/docs/ai/business_rules/showcase.md`: Documented "Publish First, Moderate Later" model, media requirements, and the atomic RM300 first-showcase reward approval RPC.
- **Technical Systems Documentation**:
  - `/docs/ai/systems/games.md`: Documented active game catalog (`catch-brand`, `memory-match`, `reaction-tap`), lifecycle state machines, configuration schemas, and the step-by-step game creation guide.
  - `/docs/ai/systems/game_ui.md`: Documented the 1024×576 logical canvas rule, uniform aspect ratio scaling, HUD overlays, and start/result screen visual editors.
  - `/docs/ai/systems/themes.md`: Documented system themes vs organization themes, asset roles, cloning mechanics, and fallback resolution.
  - `/docs/ai/systems/auth.md`: Documented Google Identity Services OAuth, JWT token issuance, session restoration, and 5-tier organization RBAC.
  - `/docs/ai/systems/api.md`: Cataloged all verified endpoints across Express and Cloudflare Worker runtimes.
  - `/docs/ai/systems/database.md`: Documented relational schema, defense-in-depth backend-write-only security triggers, RLS policies, and stored procedures.
- **Operations & Quality**:
  - `/docs/ai/deployment.md`: Documented Cloud Run container vs Cloudflare Worker deployment, Bun 1.4.0 lockfile exclusivity, and environment secrets catalog.
  - `/docs/ai/known_issues.md`: Documented verified gaps including the missing public showcase router view and incomplete speed-quiz stub.

### Validation
- Validated existing TypeScript and build health (`bun run build`).
- Confirmed zero application code was modified; all changes are strictly confined to markdown documentation.
