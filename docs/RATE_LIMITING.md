# API Rate Limiting Architecture & Audit

**Project:** Event Game Studio  
**Layer:** Edge Runtime (Cloudflare Workers) & Origin Runtime (Node.js / Express)  
**Implementation:** `server/rateLimiter.ts`, `worker.ts`, `server.ts`

---

## 1. Architectural Overview & Topology

Event Game Studio utilizes an **in-memory sliding window** rate limiting architecture as a fast, zero-dependency first line of defense. The algorithm tracks rolling request timestamps within discrete memory stores keyed by client identity (IP address or authenticated User ID).

### Architectural Boundary: Worker-Local vs. Globally Distributed

> ⚠️ **CRITICAL ARCHITECTURAL FACT:**  
> **Worker-local and process-local in-memory rate limiting is NOT globally distributed.**

It is vital for developers and operators to understand the execution topology:

1. **Cloudflare Worker Isolates & Edge PoPs:**
   - Cloudflare routes public requests to hundreds of global edge Points of Presence (PoPs) worldwide (e.g., Singapore, Tokyo, Sydney, Frankfurt, London, Ashburn, San Jose).
   - Within any single PoP, multiple Worker isolates may execute concurrently across separate V8 engine sandboxes.
   - The in-memory JavaScript `Map<string, ClientRecord>` lives inside the memory heap of an **individual Worker isolate**.
   - Consequently, requests arriving at different edge data centers (or separate isolate instances within the same region) do **not** share state or increment the same in-memory counters.

2. **Lifecycle & Resets:**
   - Worker isolates recycle periodically when idle, during code deployments, or when Cloudflare rebalances traffic.
   - When an isolate is spun down, its local in-memory counters reset to zero.

3. **Role as a Zero-Latency First Layer:**
   - **Why this design is intentional:** In-memory sliding window checks execute in sub-millisecond time (< 0.05ms) with zero network overhead.
   - **No External Dependencies:** It does not introduce third-party services (Redis, Upstash, external rate-limiting APIs) that would add round-trip latency, external point-of-failure risks, or recurring network egress costs.
   - **Protection Provided:** It effectively thwarts single-node script hammering, automated brute-force loops, and rapid-fire API spam hitting any given edge node.

---

## 2. Protection of Legitimate Event Gameplay

A primary failure mode of naive rate limiting in interactive event platforms is throttling genuine attendees during live competitions. Event Game Studio specifically addresses this risk.

### The Venue Wi-Fi / Shared NAT IP Challenge
During a live physical activation (corporate gala, exhibition booth, festival, wedding, retail marketing roadshow):
- **High Concurrency:** Between 50 and 500 attendees may be actively playing mini-games (e.g., *Catch the Brand*, *Memory Match*, *Reaction Tap*, *Speed Quiz*) simultaneously.
- **Shared IP:** All attendees in the venue connect to the same venue Wi-Fi router or cellular hotspot, sharing a single public IP address (`CF-Connecting-IP` or `X-Forwarded-For`).
- **Burst Submissions:** Because game rounds typically conclude within 30–60 seconds, 30 to 100 players can easily submit scores within the same 60-second window during tournament rushes.

### How Gameplay Is Safeguarded
1. **Generous High-Score Rate Limit Ceiling (300 requests / 60 seconds per IP):**
   - The limit for high-score submissions (`highScoreRateLimiter` and `worker_high_scores`) is set to **300 requests per minute** (~5 submissions per second) per IP.
   - This generous ceiling ensures that a room of 200 players actively submitting tournament scores from the same venue Wi-Fi network will **never** receive false-positive `HTTP 429 Too Many Requests` errors.

2. **Exemption from Generic Mutating Rate Limiting:**
   - In `server.ts`, `/high-scores` endpoints bypass the generic 120 req/min mutating API limiter (`generalApiRateLimiter`), ensuring the shared venue IP is not throttled at 120.

3. **Database-Level Idempotency & Replay Protection (Migration 029):**
   - True security against score manipulation does not rely on fragile IP throttling.
   - Migration 029 enforces a unique database index on `(event_id, session_id)` in `event_high_scores`.
   - Each game play session produces a unique `session_id`. Multiple score submission attempts for the same session are handled idempotently, preserving the earliest verified record and rejecting replay attacks at the database engine level.

4. **Public Leaderboard Polling & Display Screens (GET Endpoints):**
   - Public event detail retrieval (`GET /api/public/events/:publicToken`) and leaderboard queries (`GET /api/public/events/:publicToken/high-scores`) are read operations.
   - They are **exempt** from mutating rate limiters to allow spectator screens, venue projector displays, and mobile client leaderboards to poll live standings cleanly without disruption.

---

## 3. Production Endpoint Rate Limiting Reference

The following table summarizes all production rate limiters across the platform:

| Limiter Key | Endpoints Protected | Window | Max Req | Primary Target / Key | Purpose & Attack Vector Mitigated |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `worker_auth` / `auth` | `POST /api/auth/google`<br>`POST /api/auth/switch-org` | 60s | 10 | IP / User ID | Prevents token stuffing, rapid auth exchange spam, and session enumeration. |
| `worker_invitations` / `invitations` | `POST /api/organizations/:id/invitations`<br>`POST /api/invitations/accept` | 60s | 15 | IP / User ID | Protects against invite spamming, inbox bombing, and token brute-force attempts. |
| `worker_org_creation` / `org_creation` | `POST /api/organizations` | 60s | 10 | IP / User ID | Prevents tenant creation spam and database cluttering. |
| `worker_event_creation` / `event_creation` | `POST /api/events` | 10m (600s) | 3 | Organization / User ID | Dedicated rate limit preventing rapid delete-and-recreate cycles and license abuse. |
| `worker_events` / `events` | `POST /api/events/quote`<br>`POST /api/events/:id/cancel`<br>`PUT /api/events/:id` | 60s | 20 | IP / User ID | Protects event pricing calculations, cancellations, and metadata modifications. |
| `worker_wallet` / `wallet` | `POST /api/organizations/:id/wallet/*`<br>`POST /api/wallet/topups/*`<br>`POST /api/events/:id/pay` | 60s | 15 | IP / User ID | Prevents rapid checkout creation, payment hammering, and race conditions. |
| `worker_high_scores` / `high_scores` | `POST /api/events/:id/high-scores`<br>`POST /api/public/events/:token/high-scores` | 60s | 300 | IP address | Protects leaderboard submission while accommodating 50–200 concurrent players on shared venue Wi-Fi (~5 req/sec). |
| `worker_showcase` / `showcase` | `POST/PATCH/DELETE /api/events/:id/showcase/*` | 60s | 30 | IP / User ID | Protects showcase reviews, media reordering, and publishing workflows. |
| `worker_uploads` / `uploads` | `POST /api/upload`<br>`POST /api/events/:id/showcase/media/upload-url` | 60s | 20 | IP / User ID | Protects storage buckets and server bandwidth against volumetric payload abuse. |
| `webhooks` (Exemption) | `POST /api/webhooks/*`<br>`POST /api/wallet/webhooks/*` | — | Unlimited | Cryptographic HMAC | Exempted from IP rate limiting; authenticated strictly via Stripe / HitPay cryptographic HMAC signatures. |
| `worker_general_api` / `general_api` | All other mutating endpoints (`POST`, `PUT`, `PATCH`, `DELETE`) | 60s | 120 | IP / User ID | Broad baseline anti-flood protection for non-specialized mutating endpoints. |

---

## 4. HTTP Headers & Standard Error Responses

When a client approaches or exceeds rate limits, standard rate limiting headers are returned:

### Standard Headers
- `RateLimit-Limit` & `X-RateLimit-Limit`: Maximum requests permitted within the rolling window.
- `RateLimit-Remaining` & `X-RateLimit-Remaining`: Remaining request quota in the current window.
- `RateLimit-Reset` & `X-RateLimit-Reset`: Unix epoch timestamp (seconds) when quota resets.
- `Retry-After`: Number of seconds the client must wait before retrying (sent on `429 Too Many Requests`).

### Error Response Schema (`HTTP 429`)
```json
{
  "error": "Too Many Requests",
  "message": "High score submission limit reached. Please wait a few moments before submitting again.",
  "retryAfterSeconds": 15
}
```

---

## 5. Globally Distributed Cloudflare-Native Rate Limiting (Dual-Layer Defense)

Event Game Studio deploys a **dual-layer defense-in-depth architecture** for rate limiting:

```
[Incoming HTTP Request]
         │
         ▼
┌────────────────────────────────────────────────────────┐
│ Layer 1: Cloudflare-Native Edge Rate Limiter           │
│ (Globally synchronized across all Cloudflare Edge PoPs)│
│  - AUTH_RATE_LIMITER    (/api/auth/*)        10 req/min│
│  - ORG_RATE_LIMITER     (/api/organizations) 10 req/min│
│  - WALLET_RATE_LIMITER  (/api/*/wallet/*)    15 req/min│
│  - PUBLIC_RATE_LIMITER  (/api/public/events) 60 req/min│
│  - SCORE_RATE_LIMITER   (/api/*/high-scores)300 req/min│
│  - RATE_LIMITER         (General fallback)  120 req/min│
└────────────────────────────────────────────────────────┘
         │ (Passed Layer 1)
         ▼
┌────────────────────────────────────────────────────────┐
│ Layer 2: Worker Isolate In-Memory Sliding Window Bucket│
│ (Sub-millisecond local burst protection per isolate)   │
│  - Protects against micro-burst hammering              │
│  - Provides seamless local dev and offline fallback    │
└────────────────────────────────────────────────────────┘
         │ (Passed Layer 2)
         ▼
[Core Application Logic / Database Transaction]
```

### Approach A: Cloudflare Workers Rate Limiting Bindings (`[[ratelimits]]`)
Configured in `wrangler.toml` and `wrangler.api.toml`:
```toml
[[ratelimits]]
name = "AUTH_RATE_LIMITER"
namespace_id = "1001"
simple = { limit = 10, period = 60 }

[[ratelimits]]
name = "ORG_RATE_LIMITER"
namespace_id = "1002"
simple = { limit = 10, period = 60 }

[[ratelimits]]
name = "WALLET_RATE_LIMITER"
namespace_id = "1003"
simple = { limit = 15, period = 60 }

[[ratelimits]]
name = "PUBLIC_RATE_LIMITER"
namespace_id = "1004"
simple = { limit = 60, period = 60 }

[[ratelimits]]
name = "SCORE_RATE_LIMITER"
namespace_id = "1005"
simple = { limit = 300, period = 60 }

[[ratelimits]]
name = "RATE_LIMITER"
namespace_id = "1006"
simple = { limit = 120, period = 60 }
```

In `worker.ts`, `checkWorkerRateLimitWithCloudflare(request, options, env)` resolves the route-appropriate binding (`AUTH_RATE_LIMITER`, `WALLET_RATE_LIMITER`, etc.) and invokes Cloudflare's globally distributed counter across edge PoPs before running the in-memory isolate check.

### Approach B: Cloudflare Edge WAF Rate Limiting Rules (Production Perimeter)
In the Cloudflare Dashboard, administrators can configure complementary edge WAF rules:
1. Navigate to **Security** -> **WAF** -> **Rate limiting rules**.
2. **Rule 1: Auth & Login Protection**
   - Expression: `http.request.uri.path starts_with "/api/auth/"`
   - Threshold: `10 requests per 1 minute`
   - Action: `Block` or `Managed Challenge`
3. **Rule 2: Wallet & Payment Protection**
   - Expression: `http.request.uri.path contains "/wallet/"`
   - Threshold: `15 requests per 1 minute`
   - Action: `Block`
4. **Rule 3: Organization Creation Protection**
   - Expression: `http.request.uri.path eq "/api/organizations" and http.request.method eq "POST"`
   - Threshold: `10 requests per 1 minute`
   - Action: `Block`
5. **Rule 4: High Scores Submission Protection**
   - Expression: `http.request.uri.path contains "/high-scores" and http.request.method eq "POST"`
   - Threshold: `300 requests per 1 minute`
   - Action: `Block`

