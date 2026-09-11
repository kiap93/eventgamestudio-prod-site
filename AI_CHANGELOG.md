# AI Changelog

This changelog records major structural, architectural, business logic, and documentation changes performed by AI coding agents on the **Event Game Studio** codebase.

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
