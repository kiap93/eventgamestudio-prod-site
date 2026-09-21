# Quality & Audit: Known Architectural Issues & Gaps

This document tracks verified architectural gaps, technical debt, and pending issues identified during codebase inspection of **Event Game Studio**.

---

## Issue 1: Public Showcase View Route Missing in Client Router

- **Affected Files**:
  - `src/hooks/useRouteContext.ts`
  - `src/App.tsx`
  - `src/components/events/EventShowcasePage.tsx`
  - `src/components/events/PublicShowcaseView.tsx`
- **Initial Behavior**:
  When an event organizer published a showcase and clicked "View Public Showcase" or copied the share link, the link pointed to `/events/:eventId/showcase`. In the client router (`src/App.tsx`), this route was registered only within `DashboardLayout.tsx`. If an unauthenticated attendee opened the link, `DashboardLayout` detected no active session and immediately redirected the user to `/login`.
- **Resolution**:
  Resolved by introducing the dedicated `/showcase/:showcaseId` (and `/s/:showcaseId`) public route handled by `PublicShowcaseView.tsx`. The route is marked as `isPublicRoute` in `src/App.tsx` and can be accessed without login when `status === 'PUBLISHED'`. Backend endpoints `GET /api/showcases/:id` and `GET /api/showcases/:id/media` serve public showcase data with defense-in-depth authorization checks across both Express (`server.ts`) and Cloudflare Worker (`worker.ts`).
- **Status**: `RESOLVED` (Production-ready standalone public presentation view)

---

## Issue 2: Speed Quiz Engine Availability & Hardened Isolation

- **Affected Files**:
  - `src/games/registry.ts`
  - `src/games/speed-quiz/SpeedQuizUnavailablePlaceholder.tsx`
  - `src/components/shell/GameShell.tsx`
  - `server/db/games.ts`
  - `server/db/events.ts`
  - `server.ts` & `worker.ts`
  - `supabase/migrations/20260920000000_enforce_game_engine_availability.sql`
- **Initial Behavior**:
  The `speed-quiz` game was registered in `GAME_REGISTRY` with `isAvailable: false` and `comingSoon: true`, but its component reference was stubbed to `CatchBrandGame`. If an administrator manually modified the database to mark `speed-quiz` active or assigned `game_type = 'speed-quiz'` to an event, the system could have silently rendered Catch the Brand.
- **Resolution**:
  Fully hardened across all application layers:
  1. **Backend Database & Atomic Functions**: Database trigger `trg_check_game_engine_availability` blocks setting `speed-quiz` or any in-development engine to `status = 'active'`. The atomic event creation function `create_event_atomic` strictly verifies `game.status = 'active'` and validates against an authoritative engine whitelist.
  2. **TypeScript Server Isolation**: `createPlatformGame` and `updatePlatformGame` reject activating unavailable engines; `createEvent` rejects creating events with unavailable engines (`GAME_UNAVAILABLE`); `getAvailableGamesForStudio` filters out unavailable engines; `GET /api/public/events/:token` blocks access with `403 GAME_UNAVAILABLE`.
  3. **No Cross-Game Fallback**: Dedicated component `SpeedQuizUnavailablePlaceholder` replaces the `CatchBrandGame` fallback in `GAME_REGISTRY`. `resolveEventGameType` returns `'speed-quiz'` directly, and `GameShell` intercepts unavailable engines to render an informative development notice instead of running another game.
  4. **Developer UI Guards**: Status toggles and game creation dialogs enforce `isEngineAvailable` checks, preventing developer/admin activation in the frontend.
- **Status**: `RESOLVED` (Hardened engine isolation; dedicated quiz mechanics remain scheduled for future implementation)

---

## Issue 3: Dual-Runtime Routing Parity Maintenance Overhead

- **Affected Files**:
  - `server.ts` (Express routing)
  - `worker.ts` (Cloudflare Worker fetch dispatcher)
- **Current Behavior**:
  API routes are defined separately in Express syntax (`app.get(...)`, `app.post(...)`) in `server.ts` and via manual URL path parsing (`url.pathname.startsWith(...)`) in `worker.ts`. While both delegate to the same domain functions in `server/db/`, adding a new endpoint to Express does not automatically wire it into the Worker.
- **Intended Behavior**:
  Maintain automated parity tests or adopt a universal routing layer (such as Hono or Itty-Router) to eliminate dual-file route declarations.
- **Risk / Impact**:
  **Medium**. Endpoints tested and working in the Node.js container may return 404 on Cloudflare Worker edge deployments if forgotten in `worker.ts`.
- **Status**: `PARTIALLY FIXED` (Domain logic is unified in `server/db/`, but routing dispatch remains dual).
- **Workaround**: Always verify both `server.ts` and `worker.ts` whenever introducing new API endpoints.

---

## Issue 4: Legacy Token Fallback in Client Transport

- **Affected Files**:
  - `src/lib/api.ts`
  - `src/components/developer/DeveloperEmailSettings.tsx`
  - `src/context/AuthContext.tsx`
- **Behavior**:
  Legacy prototype key `durian_app_token` has been removed. A clean one-time migration (`migrateLegacyAppToken`) copies any existing `durian_app_token` to `app_token` (if not already set) and immediately removes the legacy key from `localStorage`. All components and transport functions now standardize strictly on `app_token`.
- **Status**: `RESOLVED`
- **Workaround**: None needed.

---

## Issue 5: Ephemeral Development JWT Secret Invalidation

- **Affected Files**:
  - `server/auth.ts` (lines 41–55)
- **Current Behavior**:
  In local Node.js development mode, if `JWT_SECRET` is not provided in `.env`, the server generates an ephemeral in-memory 256-bit secret. Whenever the server restarts (e.g. on file edit), all active user sessions are invalidated, forcing a re-login.
- **Intended Behavior**:
  Developers should always define `JWT_SECRET` in `.env` to ensure session persistence across server restarts.
- **Risk / Impact**:
  **Low**. Ephemeral secrets are strictly rejected in production and in Cloudflare Workers by explicit assertions.
- **Status**: `OPEN`
- **Workaround**: Set `JWT_SECRET` in your local `.env`.
