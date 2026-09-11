# Technical Architecture Overview

This document describes the high-level architecture of **Event Game Studio**, detailing the structural layers, runtime environments, data flow relationships, and external integrations.

---

## 1. System Topology & Dual Runtime

Event Game Studio operates on a **dual-runtime backend architecture** coupled with a unified client single-page application (SPA):

```
                                  ┌────────────────────────┐
                                  │   Browser Client SPA   │
                                  │   React 19 + Tailwind  │
                                  └───────────┬────────────┘
                                              │
                    HTTP / JSON Requests (Bearer Authorization: app_token)
                                              │
                      ┌───────────────────────┴───────────────────────┐
                      ▼                                               ▼
         ┌─────────────────────────┐                     ┌─────────────────────────┐
         │  Node.js / Express Dev  │                     │    Cloudflare Worker    │
         │  & Cloud Run Container  │                     │    Edge API Runtime     │
         │  (server.ts : 3000)     │                     │    (worker.ts)          │
         └────────────┬────────────┘                     └────────────┬────────────┘
                      │                                               │
                      └───────────────────────┬───────────────────────┘
                                              │
                                              ▼
                             ┌─────────────────────────────────┐
                             │    Shared Domain Data Layer     │
                             │         (server/db/*)           │
                             └────────────────┬────────────────┘
                                              │
                        Direct SQL / REST / PostgREST (Service Role)
                                              │
                                              ▼
                             ┌─────────────────────────────────┐
                             │       Supabase PostgreSQL       │
                             │   ACID RPCs, RLS, Triggers,     │
                             │   Storage: game-assets, media   │
                             └─────────────────────────────────┘
```

### Backend Targets
1. **Containerized Server (`server.ts`)**:
   - Runtime: Node.js with Express 4.
   - Used for Google Cloud Run production deployments and local development (`bun run dev`).
   - Serves the compiled static frontend from `./dist` in production when `NODE_ENV=production`.
   - Listens on port `3000` bound to host `0.0.0.0`.
2. **Cloudflare Worker Edge (`worker.ts`)**:
   - Runtime: Cloudflare Workers (V8 Isolate) configured with `compatibility_date = "2026-08-07"` and `nodejs_compat`.
   - Configuration files: `wrangler.toml` (SPA assets + worker) and `wrangler.api.toml` (dedicated API worker with scheduled cron trigger `* * * * *`).
   - Delegates asset serving to Cloudflare Assets (`env.ASSETS`) and handles `/api/*` endpoints.

---

## 2. Frontend Architecture

The frontend is a single-page application built with modern web technologies:
- **Core Framework**: React 19 (`react`, `react-dom`) with Vite 6.
- **Styling**: Tailwind CSS v4 (`@tailwindcss/vite`, `@import "tailwindcss";`) with a dark-slate design system palette (`slate-950`, `slate-900`, `amber-500`, `amber-400`).
- **Icons & Motion**: `lucide-react` for all application iconography; `motion` (`motion/react`) for interface animations.
- **Routing Engine**: Lightweight custom browser-history router implemented in `src/hooks/useRouteContext.ts` and controlled via `navigateTo(url)`. It avoids heavy routing dependencies and operates safely in iframe previews.
- **State Management**:
  - `AuthContext.tsx`: Global session state, user authentication, active organization switching, and token restoration from `localStorage`.
  - Local component state + hooks for event lists, theme studio editing, media upload queues, and game states.

### Frontend View Modes
The router (`useRouteContext.ts`) parses the URL path into distinct presentation modes:
- `landing`: Public marketing page (`/`)
- `public_event`: Unauthenticated live player kiosk view (`/play/:publicToken` or `/e/:publicToken`)
- `event_preview`: Authenticated organizer preview view (`/events/:eventId/preview`)
- `login`: Authentication login page (`/login`)
- `create_org`: Onboarding organization creation flow (`/create-organization`)
- `accept_invite`: Team member invitation claim flow (`/accept-invite?token=...`)
- `developer_admin`: Privileged platform administration portal (`/developer/*`)
- `studio`: Main authenticated organizer workspace (`/events`, `/events/:eventId/showcase`, `/game-themes`, `/team`, `/wallet`)

---

## 3. Backend Architecture & Domain Layer

Both backend entry points (`server.ts` and `worker.ts`) delegate all core database operations, financial logic, and business validation to the shared domain service modules in `server/db/`:

```
server/db/
├── events.ts            # Lifecycle transitions, date logic, access rules, event creation
├── wallet.ts            # Wallet balances, top-up orders, checkout sessions, ACID payments
├── highScores.ts        # Score submissions, session validation, test vs live quarantine
├── showcases.ts         # Showcase CRUD, moderation logging, reward evaluation & approval
├── showcaseMedia.ts     # Media records, file size/mime verification, storage mapping
├── themes.ts            # System vs org themes, cloning, asset resolution, customization
├── games.ts             # Game metadata, custom configurations, platform catalog
├── organizations.ts     # Multi-tenant orgs, country codes, currencies, timezone defaults
├── members.ts           # Member roles (owner, admin, designer, member, viewer), invitations
├── invitations.ts       # Invitation tokens, email verification, role assignment
├── platformSettings.ts  # Dynamic pricing tiers, base prices, platform-wide configuration
├── storage.ts           # Supabase Storage bucket uploads, limits, magic-byte validation
├── users.ts             # User profiles, Google OAuth profile syncing
└── googleMailSettings.ts# OAuth tokens & settings for transactional Gmail integration
```

### Middleware & Cross-Cutting Concerns
- **CORS Handling**: Strict origin whitelisting via `ALLOWED_ORIGINS` with credentials support.
- **Authentication**: JWT verification middleware extracting user identity and verifying active organization membership.
- **Rate Limiting**: Multi-tiered rate limiters protecting authentication, event creation, wallet transactions, uploads, and high-score submissions.
- **Scheduled Cron**: Cloudflare Worker scheduled event handler (`export default { fetch, scheduled }`) running minutely maintenance to transition completed/expired events and clear test scores on Setup Day.

---

## 4. Database Architecture

The data layer is hosted on **Supabase (PostgreSQL 15+)**:
- **Connection**: Backend communicates with Supabase via `@supabase/supabase-js` using the privileged `SUPABASE_SERVICE_ROLE_KEY`.
- **Defense-in-Depth Write Security**:
  - Client-side direct mutations (via Supabase Anon/Authenticated keys) are strictly revoked. Tables `organizations`, `organization_members`, `organization_invitations`, `events`, `games`, `themes`, and `event_showcases` are **backend-write-only**.
  - Database triggers (`trg_prevent_*_unauthorized_client_mutations`) abort unauthorized direct client writes while allowing backend service role execution.
- **ACID Transaction Functions**: Critical operations run inside PostgreSQL stored procedures with row-level locks (`FOR UPDATE`):
  - `create_organization_atomic`: Creates organization, inserts owner membership, and initializes wallet row atomically.
  - `create_event_atomic`: Creates event with locked price and performs atomic payment deduction if requested.
  - `approve_first_event_showcase_reward_atomic`: Re-validates showcase eligibility, grants RM300 showcase credit, logs wallet transaction, and transitions showcase status in a single transaction.
  - `atomic_checkout_claim`: Prevents duplicate Stripe checkout session creations across concurrent browser clicks.
  - `atomic_outstanding_balance_settlement`: Automatically nets negative balances during wallet top-ups.

---

## 5. Major Application Layers

```
Layer               Primary Components & Paths                   Responsibility
────────────────────────────────────────────────────────────────────────────────────────────────────
Presentation        src/components/, src/games/                  User interface, 1024×576 canvas,
                                                                 responsive layouts, user interactions
Navigation & State  src/hooks/useRouteContext.ts,                URL routing, session persistence,
                    src/context/AuthContext.tsx                  organization context
Client Transport    src/lib/api.ts (`apiFetch`)                  HTTP client, token injection,
                                                                 base URL resolution
API Ingress         server.ts, worker.ts                         Route dispatching, CORS, rate limits,
                                                                 JWT authorization
Domain Services     server/db/*.ts                               Business logic, data transformations,
                                                                 authoritative validations
Persistence & Store supabase/migrations/*.sql,                   Relational integrity, ACID RPCs,
                    PostgreSQL tables, Supabase Storage          RLS policies, write-guard triggers
```

---

## 6. Important Directories

| Directory | Purpose |
| :--- | :--- |
| `/src/games/` | Game engine modules (`catch-brand`, `memory-match`, `reaction-time`, `shared/`) |
| `/src/themes/` | Theme registry, built-in themes (`carnival`, `cny`, `christmas`, etc.), layout engines |
| `/src/components/studio/`| Theme Customizer, Visual Canvas Editors for Start Screen and Result Screen |
| `/src/components/events/`| Event calendar, creation modal, payment checkout modal, live game views |
| `/src/components/wallet/`| Organization wallet dashboard, top-up wizard, transaction history |
| `/src/components/developer/` | Platform developer admin portal (pricing, showcases, games, orgs, email) |
| `/server/db/` | Shared domain logic, database operations, and unit test suites |
| `/supabase/migrations/` | Canonical database migration scripts |
| `/public/` & `/assets/` | Static media, default game audio, fallback icons, and image assets |
| `/docs/ai/` | Authoritative AI-to-AI system documentation |

---

## 7. Major Dependencies

### Runtime Dependencies
- `react` (v19.0.1) & `react-dom`: Modern concurrent UI library.
- `express` (v4.21.2): Node.js HTTP server for container runtime.
- `@supabase/supabase-js` (v2.112.3): Supabase PostgreSQL client.
- `stripe` (v22.5.0): Stripe payment processing SDK.
- `jsonwebtoken` (v9.0.3) & `jose` (v6.2.8): JWT creation, verification, and decoding across Node and Worker.
- `lucide-react` (v0.546.0): UI vector icon set.
- `motion` (v12.23.24): UI animation library.
- `multer` (v2.2.0): Multipart form handling for file uploads on Express.

### Build & Dev Dependencies
- `bun` (v1.4.0): Sole authorized package manager and test runner.
- `vite` (v6.2.3): Frontend build tool and asset bundler.
- `tailwindcss` (v4.1.14): Utility-first CSS framework.
- `esbuild` (v0.25.0): Bundler compiling `server.ts` to `dist/server.cjs`.
- `tsx` (v4.21.0): TypeScript execution engine for development and test scripts.
- `wrangler` (v4.0.0): Cloudflare Worker CLI and dev server.

---

## 8. Important External Services

1. **Supabase**:
   - PostgreSQL Database hosting relational data, stored procedures, and triggers.
   - Storage Buckets: `game-assets` (custom theme graphics, audio) and `showcase-media` (photos and videos).
2. **Stripe**:
   - Stripe Checkout for wallet balance top-ups.
   - Webhook processing (`/api/webhooks/stripe`) for asynchronous payment confirmation.
3. **Google Identity Services (GSI)**:
   - Client-side OAuth login acquiring Google ID tokens verified server-side.
4. **Google Gmail API**:
   - OAuth 2.0 integration allowing platform developer admins to send transactional event emails directly via authenticated Gmail.
5. **Cloudflare**:
   - Cloudflare Workers for edge execution.
   - Cloudflare Cron Triggers for minutely lifecycle automation.
