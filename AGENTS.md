# Event Game Studio — AI Coding Agent Master Guidelines

Welcome to **Event Game Studio**, a multi-tenant SaaS platform for interactive event mini-games, custom branded activations, live leaderboard management, and duration-based event licensing.

All AI coding agents working on this codebase MUST strictly adhere to the project-wide architectural principles, security boundaries, and operational rules defined below.

---

## 1. Project & Architectural Overview

Event Game Studio combines a React (Vite + Tailwind CSS + Lucide Icons) single-page application with a dual-target backend:
- **Node.js / Express server** (`server.ts`, `server/`) for Cloud Run / local execution.
- **Cloudflare Worker** (`worker.ts`) for edge deployment.
- **Database & Storage layer** (`server/db/`, Supabase / PostgreSQL) supporting multi-tenant isolation, ACID wallet transactions, event lifecycle management, and storage buckets.
- **Package Manager & Lockfile**: The project exclusively uses Bun (`bun@1.4.0`) as its sole package manager. The root `bun.lock` is authoritative and must be preserved across all edits and syncs. Never create or commit competing lockfiles (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, or `bun.lockb`).

Core platform entities (**Organizations**, **Users/Members**, **Events**, **Games**, **Themes**, **Payments**, **Wallets**, and **Showcases**) must remain strictly isolated with clear domain boundaries.

---

## 2. Multi-Tenancy & Authorization

- **Zero Trust for Frontend Identifiers**: Never trust `organization_id`, `user_id`, or role flags passed in HTTP request bodies or URL query parameters.
- **Server-Side Verification**: Always resolve and verify the authenticated user from the verified JWT / session token.
- **Resource Ownership**: Every database operation on organizations, themes, events, wallet balances, and invitations MUST explicitly verify that the requesting user belongs to the target organization and holds the necessary role (`owner`, `admin`, or `member`).
- **No Cross-Tenant Leakage**: Queries for organization resources MUST include explicit `organization_id` filter conditions and authorization checks.

---

## 3. Event Dates & Duration Calculations

- **Business Timezone Standard**: All events explicitly use **Asia/Singapore / Malaysia UTC+8** business timezone (`Asia/Singapore`).
  - Unless an explicit `event_timezone` is defined on the event record, all calendar boundaries, setup day dates, and automated lifecycle state transitions evaluate against `Asia/Singapore` (UTC+8).
- **Inclusive Calendar-Day Logic**: Events are defined by calendar start and end dates (`start_date` and `end_date`).
  - Example: If `start_date = '2026-09-01'` and `end_date = '2026-09-02'`, the effective event window is:
    `2026-09-01 00:00:00` through `2026-09-02 23:59:59` (Asia/Singapore / Malaysia UTC+8).
  - Both the start date and end date are **inclusive**. A 1-day event has `start_date === end_date` (duration = 1 calendar day).
- **Duration Formula**: Always use the canonical helper `calculateEventCalendarDays(startDate, endDate)` from `src/lib/dateUtils.ts` (client) or `server/db/platformSettings.ts` (server).
- **Timezone Awareness**: Perform all calendar boundary checks consistently with end-of-day (`23:59:59.999`) inclusiveness in UTC+8.
- **Multi-Country & International Roadmap**: When expanding to international markets (e.g. Bangkok UTC+7, Tokyo UTC+9), events should support an optional `event_timezone` (or `organization_timezone`), while defaulting to `Asia/Singapore` (UTC+8).

---

## 4. Payment Flow & Event Lifecycle

- **Unpaid Events Never Go Live**: An event with `payment_status !== 'PAID'` must NEVER be publicly playable or marked `status = 'LIVE'`.
- **Authoritative Payment Verification**: Payment confirmation must only happen via:
  1. Verified webhook from the real payment provider (e.g., Stripe, HitPay, payment gateway).
  2. Server-side payment checkout/capture endpoint verifying payment intent state.
  3. Server-side combined credit / wallet deduction execution.
- **Strict Prohibition**: Never allow frontend code to set `payment_status = 'PAID'` or `status = 'LIVE'`.
- **No Checkout-Return Trust**: Returning from a checkout redirect does NOT mean payment succeeded. Only backend webhook/verification marks an event paid.
- **Expired Unpaid Events**: An event whose scheduled end date has passed while unpaid is considered expired/cancelled. Completing a delayed payment must NOT accidentally resurrect expired events into a live state.
- **Zero Automated Wallet Deductions by Cron**: The background cron (`runEventLifecycleMaintenance`) performs lifecycle transitions only (clearing test scores, transitioning completed/expired events). It must NEVER automatically deduct from an organization's wallet or charge customers on Setup Day or any other day. All payments require deliberate, explicit user action in the UI.

---

## 5. Preview vs. Live URLs

- **Preview URLs** (`/preview/:gameId`, `/theme-preview/:themeId`, `/admin/playtest/:gameId`):
  - Intended solely for organization members, theme designers, and developers to test game mechanics and inspect visual themes.
  - Accessible before the live window starts (`current_date < liveOpenDate`).
  - Must not write to production event leaderboards or consume event licenses.
- **Live / Public Event URLs** (`/play/:slug`, `/events/:id/play`):
  - Accessible to live event attendees.
  - MUST enforce full security checks:
    1. Event existence and active status (`LIVE` / not cancelled).
    2. Valid payment status (`PAID`).
    3. Current date within the live availability window (`current_date >= start_date - 1 day` [Setup Day] through `end_date 23:59:59`).
    4. Non-expired lifecycle status.

---

## 6. Pricing & Duration Tiers

- **No Hardcoded Pricing**: Do not hardcode event prices in client components or endpoint routes.
- **Configurable Platform Tiers**: Event pricing is dynamic business data resolved server-side:
  - Base price default: RM1,400 (1 calendar day).
  - Duration-based tiers (e.g., 2 days: RM1,900; 3 days: RM2,200; 4–7 days: RM2,800; etc.) managed in platform settings (`platform_settings` table / `server/db/platformSettings.ts`).
  - Custom per-event overrides (`is_custom_price`, `event_price`) configured by developer admins.
- **Price Resolution Single Source of Truth**: Always call `calculateEventAuthoritativePrice(durationDays, platformSettings)` on the backend.
- **Price Locking**: When an event is created or quoted, its resolved price is recorded in the event record. Backend checkout flows always verify against this locked authoritative price.

---

## 7. Wallet, Balances & Financial Transactions

- **Financial Integrity**: Wallet balance is critical financial data. All mutations (credits, deductions, refunds) MUST be performed server-side.
- **ACID Transactions**: Top-ups, event license purchases, and promotional redemptions must run within atomic transactions or database row locks to prevent double-spending and race conditions.
- **Idempotency**: All payment webhooks, top-up receipts, and credit allocations must store unique idempotency keys (`reference_id`, `payment_intent_id`, `stripe_session_id`) to prevent duplicate processing.
- **Never Trust Client Balance**: Frontend never sends the balance amount; it only requests an operation, and the backend verifies sufficient funds.

---

## 8. Promotional Credits vs. Cash Wallet

Keep distinct balance ledgers logically separated:
1. **Cash / Purchased Wallet Balance**: Real funds topped up via payment gateways.
2. **Welcome Credits**: One-time onboarding bonus awarded upon organization registration.
3. **Top-Up Reward Credits**: Bonus credits awarded on qualifying top-up tiers (subject to event payment application caps, e.g., max 20% of event price).
4. **Showcase Reward Credits**: Credits awarded for approved event showcases.
5. **Event Credits**: Specific promotional credits tied to event creation.

**Rules**:
- Prevent duplicate awards of one-time credits.
- Promotional credits are non-withdrawable and can only be applied toward event activations within the platform rules.

---

## 9. Game Isolation & Modular Architecture

- **Strict Game Engine Isolation**: Every mini-game (`catch-brand`, `memory-match`, `reaction-tap`, `speed-quiz`) must remain fully decoupled.
- **Never Fallback Cross-Game**: `memory-match` must NEVER redirect to or fallback on `catch-brand` logic, configurations, themes, or assets.
- **Independent Modules**: Each game must have its own:
  - Runtime container (`src/games/<game-id>/`)
  - Configuration schema (`types.ts`)
  - Customizer UI (`src/components/studio/games/<Game>Customizer.tsx`)
  - Sound effects & audio synthesis
  - Asset manifest & default asset fallbacks
  - Scoring & leaderboard validation algorithms
- **Registry Integration**: Register all games centrally in `src/games/registry.ts`.

---

## 10. Theme System & Asset Roles

- **System Themes vs. Organization Themes**:
  - **System Themes** (`is_system = true`, `organization_id = null`): Global read-only templates curated by developer admins.
  - **Organization Themes** (`organization_id = '<uuid>'`): Custom themes created or cloned by specific organizations.
- **Cloning Rules**: Cloning a system theme creates an organization-owned duplicate. Never mutate a system theme when an organization edits their cloned copy.
- **No Duplicate Display**: When listing themes for an organization, deduplicate system originals from cloned copies so organizations do not see confusing duplicated entries.
- **Strict Game-Theme Association**: A theme created for `memory-match` must NEVER be applied to `catch-brand` or vice-versa.
- **Asset Roles**: Keep asset slots distinctly typed:
  - `background` (canvas/screen background)
  - `basket` / `catcher` (catcher avatar)
  - `reward` / `good_item` (positive score targets)
  - `hazard` / `bad_item` (negative score obstacles)
  - `bonus` (special multiplier / golden item)
  - `card_back` / `card_pairs` (Memory Match specific)
- **Asset Fallbacks**: When custom assets are missing, fall back to that specific game's curated default assets—never cross-contaminate assets between different games.

---

## 11. Developer & Admin Security

- **Server-Authoritative RBAC**: Developer/Admin views (`/developer/*`) and backend endpoints (`/api/developer/*`) must verify that `user.is_developer === true` or email matches `DEVELOPER_EMAILS` server-side.
- **No Client-Only Hiding**: Hiding a UI button or protecting a client-side route is not security. Every sensitive API endpoint must enforce authorization guards.
- **Platform-Level Controls**: Platform pricing rules, email configuration, organization impersonation, and maintenance jobs are privileged developer-admin operations.

---

## 12. Sensitive Keys & Environment Security

- **Never Leak Secrets to the Browser**:
  - `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, `STRIPE_SECRET_KEY`, `HITPAY_API_KEY`, `RESEND_API_KEY`, `GEMINI_API_KEY`, and OAuth client secrets MUST remain server-only.
  - Client-side variables must only use `VITE_` prefixed public keys (e.g., `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
- **Declaration**: All environment variables must be declared in `.env.example`.

---

## 13. API Route Conventions

Every sensitive backend endpoint must follow the 5-step lifecycle:
1. **Authenticate**: Validate token and identify user.
2. **Authorize**: Verify user role and organization permissions.
3. **Validate Input**: Sanitise and validate payload types, date formats, and values.
4. **Verify Resource Ownership**: Ensure target event/theme/wallet belongs to the tenant.
5. **Execute Safely**: Perform the operation with transactional integrity and return standard JSON.

---

## 14. Validation & Quality Checklist

Before completing any task, run the full validation suite:
1. **Lint / TypeScript check**: `bun run lint` or `bunx tsc --noEmit` must pass with zero errors.
2. **Applet Compilation**: `bun run build` must compile cleanly without missing modules or type mismatches.
3. **Regression Prevention**: Verify both `server.ts` (Express) and `worker.ts` (Cloudflare) if shared backend logic was updated.
4. **Package Manager & Lockfile**: Exclusively use Bun (`bun@1.4.0`) with `bun.lock`. Never run `npm install` or generate `package-lock.json`.
5. **No Premature Success Claims**: Never declare completion until all validation tools succeed.

---

## 15. Agent Development Principles

1. **Inspect First**: Always inspect existing implementations, types, and schemas before editing.
2. **Single Source of Truth**: Identify the canonical logic and avoid writing conflicting parallel logic.
3. **Smallest Safe Edit**: Make surgical, clean, and minimal changes that satisfy requirements without side-effects.
4. **Test Key Flows**: Trace all affected flows (e.g., event creation -> pricing quote -> payment -> activation).
