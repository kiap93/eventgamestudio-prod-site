# API Error Handling & Environment-Controlled Debug Mode

## 1. Overview

Event Game Studio utilizes centralized, secure API error handling for both the Cloudflare Worker edge environment (`worker.ts`) and Node.js Express server (`server.ts`).

By default, in production, any unexpected internal server error or unhandled database exception is strictly masked to prevent information disclosure. The API returns a generic error payload paired with a unique request correlation ID (`requestId` / `x-correlation-id`).

To facilitate temporary production diagnosis and debugging of unexpected errors (such as database trigger failures or RPC errors during showcase publication), the system provides an environment-controlled debug flag: `EXPOSE_API_ERRORS`.

---

## 2. Modes of Operation

### Default / Safe Mode (`EXPOSE_API_ERRORS` missing or `false`)

When `EXPOSE_API_ERRORS` is not set or not equal to `true`:
- HTTP Status Code: 500 (or the appropriate error code).
- Response Payload:
  ```json
  {
    "error": "Something went wrong. Please try again.",
    "requestId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  }
  ```
- All underlying infrastructure messages (PostgreSQL codes, trigger failures, internal driver messages) are masked from the client.
- The detailed diagnostic log and stack trace are safely recorded in server logs and the persistent `api_error_logs` table for administrative review.

### Debug Mode (`EXPOSE_API_ERRORS=true`)

When `EXPOSE_API_ERRORS` is explicitly set to `true`:
- HTTP Status Code: Preserved identically (e.g. 500, 422, etc.).
- Response Payload:
  ```json
  {
    "error": "Database error creating showcase: duplicate key violates unique constraint",
    "requestId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  }
  ```
- The actual underlying error message is returned to the client to assist in rapid triage.
- Stack traces are stripped.
- Sensitive credentials (database passwords, connection URIs, Bearer tokens, JWT tokens, Stripe secret keys, Supabase service keys) are automatically sanitized and redacted by `getActualErrorMessage()`.

---

## 3. Strict Flag Evaluation Logic

Only the exact string `'true'` (case-insensitive) enables debug mode. The helper `shouldExposeApiErrors(env)` evaluates as follows:

| Environment Variable Value | Debug Mode Enabled? | Response Message |
| :--- | :---: | :--- |
| `undefined` (missing) | **No** (Safe) | `"Something went wrong. Please try again."` |
| `""` (empty) | **No** (Safe) | `"Something went wrong. Please try again."` |
| `"false"` | **No** (Safe) | `"Something went wrong. Please try again."` |
| `"FALSE"` | **No** (Safe) | `"Something went wrong. Please try again."` |
| `"0"` | **No** (Safe) | `"Something went wrong. Please try again."` |
| `"no"` / `"off"` | **No** (Safe) | `"Something went wrong. Please try again."` |
| `"true"` | **Yes** (Debug) | `<Actual Underlying Error Message>` |
| `"TRUE"` | **Yes** (Debug) | `<Actual Underlying Error Message>` |

---

## 4. Preservation of Operational & Business Errors

Legitimate operational business exceptions continue to return their intended, specific messages and HTTP status codes regardless of `EXPOSE_API_ERRORS`:

| Business Scenario | HTTP Status | Response `error` |
| :--- | :---: | :--- |
| Unauthenticated / Missing token | `401` | `"Invalid token"` |
| Unauthorized / Role insufficient | `403` | `"You do not have permission"` |
| Resource Not Found | `404` | `"Event not found"` / `"Showcase not found"` |
| Resource Conflict | `409` | `"An Event Showcase already exists for this event"` |
| Business Validation / Ineligible | `422` | `"Event is not eligible"` / `"Event is not completed"` |
| Rate Limit Exceeded | `429` | `"Too many requests. Please try again later."` |

---

## 5. Cloudflare Worker Configuration

### Temporary Production Debugging via Wrangler CLI

To enable debug mode temporarily on the live Cloudflare Worker:
```bash
# Set secret variable on production worker
npx wrangler secret put EXPOSE_API_ERRORS
# Prompt: Enter a secret value:
# Input: true
```

Or deploy with temporary variable:
```bash
npx wrangler deploy --var EXPOSE_API_ERRORS:true
```

### Temporary Production Debugging via Cloudflare Dashboard

1. Log in to the Cloudflare Dashboard.
2. Navigate to **Workers & Pages** -> Select `eventgamestudio-api`.
3. Go to **Settings** -> **Variables and Secrets**.
4. Click **Add variable**:
   - Variable name: `EXPOSE_API_ERRORS`
   - Value: `true`
5. Click **Deploy**.

### Reverting to Safe Production Mode

Immediately after diagnosing the issue, disable debug mode by removing the variable or setting it to `false`:
```bash
# Option A: Delete secret
npx wrangler secret delete EXPOSE_API_ERRORS

# Option B: Set to false
npx wrangler secret put EXPOSE_API_ERRORS
# Input: false
```
Via Cloudflare Dashboard: delete the variable or update its value to `false` and re-deploy.

---

## 6. Security Guarantees

1. **Zero Secret Leakage**:
   - The sanitizer strips Authorization headers, Bearer tokens, JWT tokens, Stripe API keys (`sk_live_...`, `whsec_...`), Supabase service keys, and PostgreSQL connection passwords before sending responses.
2. **No Stack Traces in Responses**:
   - V8/Node stack frames (`\n    at ...`) are removed from debug responses.
3. **Audit Trail**:
   - All errors (operational and unexpected) continue to be logged to the `api_error_logs` table with full diagnostic metadata, correlation IDs, and timestamps.
