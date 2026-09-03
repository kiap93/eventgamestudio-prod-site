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

## 5. Integrating Globally Distributed Cloudflare-Native Rate Limiting

For organizations requiring globally synchronized rate limiting across all Cloudflare edge locations, the platform is pre-architected to support two Cloudflare-native approaches without altering core code:

### Approach A: Cloudflare WAF Rate Limiting Rules (Recommended)
Configure rate limiting rules directly in the **Cloudflare Dashboard**:
1. Navigate to **Security** -> **WAF** -> **Rate limiting rules**.
2. Define a rule matching sensitive API paths (e.g. `http.request.uri.path eq "/api/auth/google"`).
3. Set action to **Block** or **Managed Challenge** with the desired global threshold (e.g., 20 requests per 10 seconds).
4. Cloudflare's edge network synchronizes these rules globally across all edge PoPs automatically.

### Approach B: Cloudflare Workers Native Rate Limiting Binding (`[[ratelimits]]`)
If using Cloudflare's Workers Rate Limiting API:
1. In `wrangler.toml`, add the binding:
   ```toml
   [[ratelimits]]
   binding = "RATE_LIMITER"
   namespace_id = "1001"
   simple = { limit = 120, period = 60 }
   ```
2. The `checkWorkerRateLimitWithCloudflare` function in `server/rateLimiter.ts` automatically detects `env.RATE_LIMITER` and enforces Cloudflare edge-synchronized rate limiting before falling back to local memory.
