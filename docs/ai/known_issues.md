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

## Issue 2: Speed Quiz Engine Placeholder Stub

- **Affected Files**:
  - `src/games/registry.ts` (lines 93–114)
  - `src/games/types.ts`
- **Current Behavior**:
  The `speed-quiz` game is registered in `GAME_REGISTRY` with `isAvailable: false` and `comingSoon: true`. However, its component reference is stubbed to the catcher game:
  ```typescript
  component: CatchBrandGame, // Fallback until implemented
  ```
- **Intended Behavior**:
  A dedicated quiz engine component (`SpeedQuizGame.tsx`) with questions, countdown timers, multiple-choice options, and score validation should be built before making the game available.
- **Risk / Impact**:
  **Medium**. If an administrator marks `isAvailable: true` or manually assigns `game_type = 'speed-quiz'` to an event, players will see Catch the Brand instead of a quiz game.
- **Status**: `OPEN`
- **Workaround**: Keep `isAvailable: false` in `src/games/registry.ts`.

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
  - `src/lib/api.ts` (line 49)
- **Current Behavior**:
  `apiFetch` retrieves tokens using:
  ```typescript
  const token = localStorage.getItem('app_token') || localStorage.getItem('durian_app_token');
  ```
  `durian_app_token` is a legacy artifact from an earlier prototype.
- **Intended Behavior**:
  Standardize entirely on `'app_token'` and clean up legacy storage keys.
- **Risk / Impact**:
  **Low**. Harmless backward compatibility.
- **Status**: `PARTIALLY FIXED`
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
