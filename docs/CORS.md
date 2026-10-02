# Production CORS Security Architecture & Audit

**Project:** Event Game Studio  
**Layer:** Edge Runtime (`worker.ts`) & Node.js Origin Server (`server.ts`, `server/cors.ts`)  
**Test Suite:** `server/cors.test.ts` (51 automated assertions)

---

## 1. Executive Summary & Audit Findings

An audit of the production Cross-Origin Resource Sharing (CORS) implementation revealed that broad wildcard matching was previously active across all environments:
```typescript
// PREVIOUS INSECURE PATTERN:
hostname.endsWith('.workers.dev') ||
hostname.endsWith('.pages.dev') ||
hostname.endsWith('.run.app')
```

### Risk Identified
In a production deployment, allowing blanket suffix wildcards for multi-tenant hosting platforms (`*.workers.dev`, `*.pages.dev`, `*.run.app`) permits **any third-party user or attacker** who deploys a site on Cloudflare Workers, Cloudflare Pages, or Google Cloud Run to issue authenticated, credentialed cross-origin requests (`Access-Control-Allow-Credentials: true`) against Event Game Studio's backend APIs.

### Remedy Applied
1. **Restricted in Production:** Broad platform wildcards (`*.workers.dev`, `*.pages.dev`, `*.run.app`) are **strictly prohibited** in production mode (`isProduction === true`).
2. **Preserved Real Production Domains:**
   - Exact production origins:
     - `https://eventgamestudio.com`
     - `https://www.eventgamestudio.com`
     - `https://app.eventgamestudio.com`
     - `https://eventgamestudio.pages.dev` (Official Cloudflare Pages frontend)
     - `https://eventgamestudio-prod.pages.dev` (Official Cloudflare Pages production frontend)
   - Tenant subdomains: `https://*.eventgamestudio.com` (for branded organization workspaces)
   - Same-origin requests (`originUrl.origin === reqUrl.origin` or `originUrl.host === reqHost`)
   - Custom domains explicitly configured via the `ALLOWED_ORIGINS` environment variable.
3. **Preserved Development & Staging Origins:**
   - When running in development or preview mode (`NODE_ENV !== 'production'`), `localhost`, `127.0.0.1`, `*.localhost`, and cloud staging previews (`*.run.app` Google AI Studio dev/preview sandboxes, `*.pages.dev` staging branches, `*.workers.dev` staging workers) are permitted.

---

## 2. Environment Comparison Matrix

| Origin Pattern | Development / Staging (`isProduction: false`) | Production (`isProduction: true`) | Rationale |
| :--- | :---: | :---: | :--- |
| `https://eventgamestudio.com` | ✅ Allowed | ✅ Allowed | Primary canonical apex production domain. |
| `https://www.eventgamestudio.com` | ✅ Allowed | ✅ Allowed | Primary canonical www production domain. |
| `https://app.eventgamestudio.com` | ✅ Allowed | ✅ Allowed | Production app portal. |
| `https://eventgamestudio.pages.dev` | ✅ Allowed | ✅ Allowed | Cloudflare Pages deployment URL. |
| `https://eventgamestudio-prod.pages.dev` | ✅ Allowed | ✅ Allowed | Official Cloudflare Pages production deployment URL. |
| `https://*.eventgamestudio.com` | ✅ Allowed | ✅ Allowed | Branded tenant organization subdomains. |
| Specific domain in `ALLOWED_ORIGINS` | ✅ Allowed | ✅ Allowed | Explicit operator-configured whitelist via environment variable. |
| Same-origin (`origin === host`) | ✅ Allowed | ✅ Allowed | Reverse-proxy and collocated routing. |
| `http://localhost:*`, `http://127.0.0.1:*` | ✅ Allowed | ❌ Rejected | Local development debugging only; forbidden in production. |
| Arbitrary `*.workers.dev` | ✅ Allowed (preview) | ❌ Rejected | Block untrusted third-party Worker scripts in production. |
| Arbitrary `*.pages.dev` | ✅ Allowed (preview) | ❌ Rejected | Block untrusted third-party Pages deployments in production. |
| Arbitrary `*.run.app` | ✅ Allowed (preview) | ❌ Rejected | Block untrusted third-party Cloud Run containers in production. |

---

## 3. Configuration & Operators Guide

### Explicit Custom Production Origins
If an organization or enterprise partner requires a dedicated frontend domain outside of `*.eventgamestudio.com`, configure the `ALLOWED_ORIGINS` environment variable as a comma-separated list:

```bash
# Cloudflare Worker (wrangler.toml / dashboard environment variables):
ALLOWED_ORIGINS="https://partner-portal.com, https://events.customclient.com"

# Node.js / Express Server (.env or Cloud Run container env):
ALLOWED_ORIGINS="https://partner-portal.com, https://events.customclient.com"
```

The system automatically parses, trims, and normalizes each origin into standard URL protocol + host format.

---

## 4. Header & Security Behavior

1. **Exact Dynamic Reflection:**
   - The API dynamically reflects only the verified incoming origin in `Access-Control-Allow-Origin`.
   - It **never** returns wildcard `*` with credentials.
   - It **never** returns comma-separated origin lists in the header (which violates CORS specifications and triggers browser CORS failures).

2. **Credentialed Requests:**
   - Emits `Access-Control-Allow-Credentials: true` only when the request origin matches the whitelist.
   - Emits `Vary: Origin` on all CORS responses to ensure edge CDN caches and browser caches do not serve a cached response generated for one origin to a different origin.

3. **Preflight Request Handling:**
   - Permitted preflights return HTTP `204 No Content` with `Access-Control-Max-Age: 86400` (24 hours caching) to eliminate redundant preflight roundtrips for active users.
   - Unauthorized preflights from untrusted origins return HTTP `403 Forbidden` with no `Access-Control-Allow-Origin` header.
