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
| `PAYMENT_WEBHOOK_SECRET` | Yes (Mandatory) | Stripe signing secret (`whsec_...`) or payment provider HMAC key for verifying incoming webhooks and crediting wallet balances |
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

> [!CAUTION]
> **`PAYMENT_WEBHOOK_SECRET` is MANDATORY in Production.**
> The server strictly validates incoming HMAC-SHA256 signatures before crediting wallet balances. If `PAYMENT_WEBHOOK_SECRET` (or `STRIPE_WEBHOOK_SECRET`) is not set:
> 1. The handler throws HTTP 500 (`MISSING_WEBHOOK_SECRET: Server security configuration error: PAYMENT_WEBHOOK_SECRET is not configured on the server. Webhook verification rejected.`).
> 2. The payment provider webhook is rejected.
> 3. **Critical failure mode**: The customer's credit card is charged by Stripe, but their order remains `PENDING` and their wallet balance is never credited.
>
> Always configure `PAYMENT_WEBHOOK_SECRET` with the signing secret (e.g. `whsec_...` from the Stripe Dashboard) before accepting real payments.

---

## 6. Production Deployment Checklist

Before launching or promoting Event Game Studio to a production environment (Google Cloud Run or Cloudflare Workers), verify every item in this checklist:

### A. Mandatory Secrets & Environment Configuration
- [ ] **`SUPABASE_URL`**: Verified connection to the production Supabase database.
- [ ] **`SUPABASE_SERVICE_ROLE_KEY`**: Privileged key configured server-side (never exposed to client).
- [ ] **`JWT_SECRET`**: Secure 256-bit cryptographically random string configured.
- [ ] **`STRIPE_SECRET_KEY`**: Production Stripe Secret Key (`sk_live_...`) configured.
- [ ] **`PAYMENT_WEBHOOK_SECRET` (MANDATORY)**: Production Stripe webhook endpoint signing secret (`whsec_...`) configured in Cloud Run environment variables and Cloudflare Worker secrets (`wrangler secret put PAYMENT_WEBHOOK_SECRET`).
- [ ] **`VITE_SUPABASE_URL` & `VITE_SUPABASE_ANON_KEY`**: Configured for client-side build.
- [ ] **`VITE_GOOGLE_CLIENT_ID`**: Production Google Cloud OAuth 2.0 Client ID authorized for production origins.

### B. Payment Gateway & Webhook Setup
- [ ] **Webhook Endpoint Registration**: In Stripe Dashboard -> Developers -> Webhooks, add endpoint:
  `https://<your-production-domain>/api/webhooks/stripe`
- [ ] **Event Subscriptions**: Subscribe to `checkout.session.completed`.
- [ ] **Signing Secret Verification**: Copy the endpoint's signing secret (`whsec_...`) directly into `PAYMENT_WEBHOOK_SECRET`.
- [ ] **End-to-End Test**: Trigger a test top-up checkout or test webhook event to confirm HTTP 200 response and verified signature.

### C. Build & Platform Verification
- [ ] **Dependency Lockfile Integrity**: Confirm `bun.lock` is unchanged and no competing lockfiles exist (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`).
- [ ] **Type & Lint Check**: `bun run lint` (or `bunx tsc --noEmit`) passes with zero errors.
- [ ] **Compilation**: `bun run build` succeeds cleanly, generating `./dist` and `dist/server.cjs`.
- [ ] **Automated Test Suite**: `bun test` passes completely.
- [ ] **Cron Trigger (Lifecycle Maintenance)**: Cloudflare Worker scheduled trigger (`crons = ["* * * * *"]`) active for `runEventLifecycleMaintenance`.

