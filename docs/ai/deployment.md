# Operations: Deployment & Infrastructure Configuration

This document describes the dual runtime deployment architecture, package management constraints, build pipelines, and environment variable requirements for **Event Game Studio**.

---

## 1. Dual Deployment Targets

Event Game Studio is designed to run across two distinct deployment targets:

### Target A: Google Cloud Run (Containerized Node.js Runtime)
- **Entry Point**: `server.ts` compiled to `dist/server.cjs`.
- **Production Start Command**: `node dist/server.cjs` (as defined in `package.json`).
- **Network Ingress**:
  - Bound to host: `0.0.0.0`
  - Bound to port: `3000` (strictly hardcoded and required by the container reverse proxy).
- **Static Assets**: Express serves compiled frontend static assets from `./dist` when `NODE_ENV=production`. SPA client fallback serves `./dist/index.html` on unmatched non-API routes.

### Target B: Cloudflare Workers (Edge Serverless Runtime)
- **Entry Point**: `worker.ts`.
- **Configuration Files**:
  - `wrangler.toml`: Static assets + worker proxy for user-facing domain (`eventgamestudio`). Configured with `not_found_handling = "single-page-application"` and `run_worker_first = ["/api/*"]`.
  - `wrangler.api.toml`: Dedicated edge API worker (`eventgamestudio-api`) running with `compatibility_flags = ["nodejs_compat"]` and a minutely scheduled cron trigger:
    ```toml
    [triggers]
    crons = ["* * * * *"]
    ```
- **Scheduled Cron Handler**: The worker's `scheduled` export executes `runEventLifecycleMaintenance` minutely to transition completed/expired events and clear rehearsal scores on Setup Day.

---

## 2. Package Manager & Lockfile Constraints

> [!CAUTION]
> **Bun (`bun@1.4.0`) is the SOLE authorized package manager for this repository.**

- **Authoritative Lockfile**: The root `bun.lock` is authoritative and must be preserved.
- **Forbidden Actions**:
  - **NEVER** run `npm install`, `npm i`, or generate `package-lock.json`.
  - **NEVER** run `yarn` or generate `yarn.lock`.
  - **NEVER** run `pnpm` or generate `pnpm-lock.yaml`.
- **Installing Packages**: Always use `bun add <package>` or platform installation tools that preserve Bun compatibility.

---

## 3. Build & Verification Commands

The project configuration defines standardized build and lint commands:

### Production Build Command
```bash
bun run build
```
Under the hood, this executes:
1. `vite build`: Compiles the React SPA, Tailwind CSS v4 stylesheets, and client assets into `./dist`.
2. `esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs`:
   - Bundles the TypeScript backend into a single CommonJS (`.cjs`) output file.
   - Bypasses Node.js runtime ES Module relative import resolution issues.
   - Preserves sourcemaps for runtime stack-trace debugging.
   - Keeps all external node modules (`@supabase/supabase-js`, `express`, `stripe`, etc.) external.

### Lint & Typecheck Command
```bash
bun run lint
# or
bunx tsc --noEmit
```

### Test Suite Execution
```bash
bun test
# or targeted test:
bun test server/cloudflare_cron_trigger.test.ts
```

---

## 4. Environment Variables Catalog

All environment variables must be declared in `/.env.example`. Secrets must never be checked into Git or exposed with `VITE_` prefixes.

### Server-Side Secrets (Never Expose to Browser)
| Variable Name | Required | Purpose |
| :--- | :--- | :--- |
| `SUPABASE_URL` | Yes | Supabase Project REST URL (e.g. `https://xyz.supabase.co`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase Privileged Service Role Secret Key (bypasses RLS) |
| `JWT_SECRET` | Yes | 256-bit secret key used to cryptographically sign session JWTs |
| `STRIPE_SECRET_KEY` | Yes | Stripe Secret Key for creating Checkout Sessions |
| `PAYMENT_WEBHOOK_SECRET` | Optional | HMAC key for verifying incoming payment gateway webhooks |
| `DEVELOPER_EMAILS` | Optional | Comma-separated list of admin emails with platform rights |
| `GOOGLE_MAIL_CLIENT_ID` | Optional | Google Cloud OAuth Client ID for Gmail API sending |
| `GOOGLE_MAIL_CLIENT_SECRET` | Optional | Google Cloud OAuth Client Secret for Gmail API |
| `GOOGLE_MAIL_REDIRECT_URI` | Optional | Authorized OAuth redirect callback for Gmail token acquisition |
| `GOOGLE_MAIL_TOKEN_ENCRYPTION_KEY` | Optional | AES key encrypting stored Gmail refresh tokens at rest |
| `GEMINI_API_KEY` | Optional | API key for server-side Google GenAI / Gemini features |
| `ALLOWED_ORIGINS` | Optional | Comma-separated CORS allowed web origins |

### Client-Side Variables (`VITE_` Prefixed)
| Variable Name | Purpose |
| :--- | :--- |
| `VITE_SUPABASE_URL` | Public Supabase project URL for frontend browser SDK |
| `VITE_SUPABASE_ANON_KEY` | Public anonymous API key (read-only / safe for browser) |
| `VITE_API_BASE_URL` | Cloudflare Worker API URL (e.g. `https://eventgamestudio-api...`) |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth Client ID for Google Identity Services prompt |

---

## 5. Webhook Endpoints

The backend exposes authenticated webhook endpoints for external payment callbacks:
- **`POST /api/webhooks/stripe`**: Primary webhook handler for Stripe events (`checkout.session.completed`).
- **`POST /api/webhooks/payment`**: Generic payment gateway webhook handler.

Both handlers verify signatures before mutating wallet balances and enforce transaction idempotency using external `reference_id` keys.
