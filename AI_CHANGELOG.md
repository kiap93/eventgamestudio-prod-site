# AI Changelog

This changelog records major structural, architectural, business logic, and documentation changes performed by AI coding agents on the **Event Game Studio** codebase.

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
