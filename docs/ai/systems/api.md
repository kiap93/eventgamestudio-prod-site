# Technical Systems: API Endpoint Reference

This document catalogs the verified REST API endpoints implemented across the Node.js/Express backend (`server.ts`) and Cloudflare Worker runtime (`worker.ts`).

---

## 1. Authentication & Users

### `POST /api/auth/google`
- **Purpose**: Authenticates a user via Google Identity Services (GSI) credential token.
- **Auth**: Public (Rate-limited).
- **Body**: `{ "credential": "<google_id_token>" }`.
- **Response**: `200 OK` with `{ "token": "<jwt>", "user": {...}, "organization": {...}, "organizations": [...] }`.
- **DB Interaction**: Verifies token via Google JWKS; upserts `public.users`; reads `public.organization_members`.

### `GET /api/auth/me`
- **Purpose**: Restores and validates user session on frontend boot.
- **Auth**: `Bearer <token>` (`authenticateJWT`).
- **Response**: `200 OK` with `{ "user": {...}, "organization": {...}, "organizations": [...] }` or `401 Unauthorized`.

### `POST /api/auth/switch-org`
- **Purpose**: Switches the active organization context for the authenticated user.
- **Auth**: `Bearer <token>` (`authenticateJWT`).
- **Body**: `{ "organizationId": "<uuid>" }`.
- **Response**: `200 OK` with new `{ "token": "<jwt>", "organization": {...} }`.

### `PATCH` / `PUT /api/auth/profile`
- **Purpose**: Updates user display name and profile metadata.
- **Auth**: `Bearer <token>`.
- **Body**: `{ "name": "...", "avatar_url": "..." }`.

---

## 2. Organizations & Members

### `GET /api/organizations`
- **Purpose**: Lists all organizations where the current user holds membership.
- **Auth**: `Bearer <token>`.

### `POST /api/organizations`
- **Purpose**: Onboards a new organization.
- **Auth**: `Bearer <token>`.
- **Body**: `{ "name": "Acme Events", "country_code": "MY", "timezone": "Asia/Singapore" }`.
- **DB Interaction**: Executes `create_organization_atomic` RPC to insert organization, owner membership, and wallet row.

### `GET /api/organizations/:id`
- **Purpose**: Retrieves details of a specific organization.
- **Auth**: `Bearer <token>` (User must belong to target organization).

### `PATCH /api/organizations/:id`
- **Purpose**: Updates organization name, country, or settings.
- **Auth**: `Bearer <token>` (`owner` or `admin`).

### `GET /api/organizations/:id/members`
- **Purpose**: Lists all active members and pending invitations.
- **Auth**: `Bearer <token>`.

### `POST /api/organizations/:id/invitations`
- **Purpose**: Invites a team member by email with an assigned role.
- **Auth**: `Bearer <token>` (`owner` or `admin`).
- **Body**: `{ "email": "...", "role": "admin" | "designer" | "member" | "viewer" }`.

### `GET /api/invitations/verify?token=...`
- **Purpose**: Validates an invitation token for an invitee before acceptance.
- **Auth**: Public.

### `POST /api/invitations/accept`
- **Purpose**: Accepts an invitation and adds user to `organization_members`.
- **Auth**: Public or authenticated with invite token.

---

## 3. Events Lifecycle & Management

### `GET /api/events` (alias `/api/organizations/:id/events`)
- **Purpose**: Lists all events belonging to the active organization.
- **Auth**: `Bearer <token>`.

### `GET /api/events/:id`
- **Purpose**: Retrieves full event details, locked price, and configuration.
- **Auth**: `Bearer <token>`.

### `POST /api/events/quote`
- **Purpose**: Calculates dynamic price quote based on duration and platform tiers.
- **Auth**: `Bearer <token>`.
- **Body**: `{ "start_date": "YYYY-MM-DD", "end_date": "YYYY-MM-DD" }`.
- **Response**: `{ "durationDays": 2, "eventPrice": 1900, "currency": "MYR" }`.

### `POST /api/events`
- **Purpose**: Creates an event with locked authoritative price.
- **Auth**: `Bearer <token>`.
- **Body**: `{ "name": "...", "game_type": "...", "theme_id": "...", "start_date": "...", "end_date": "..." }`.
- **Validation**: Rejects past end dates (`422 EVENT_DATE_PASSED`).

### `POST /api/events/:id/pay`
- **Purpose**: Deducts funds and activates an event license.
- **Auth**: `Bearer <token>` (`owner` or `admin`).
- **Body**: `{ "paymentMode": "FULL_PAID" | "WELCOME_CREDIT" | "SHOWCASE_CREDIT" | "TOPUP_CREDIT" }`.
- **DB Interaction**: Executes `processEventPayment` within row lock; transitions `payment_status = 'PAID'`.

### `GET /api/events/:id/cancellation-eligibility`
- **Purpose**: Evaluates whether cancellation qualifies for a 100% wallet refund.
- **Auth**: `Bearer <token>`.

### `POST /api/events/:id/cancel`
- **Purpose**: Explicitly cancels an event; executes refund if prior to Setup Day.
- **Auth**: `Bearer <token>` (`owner` or `admin`).

### `GET /api/events/:id/preview`
- **Purpose**: Returns complete game and theme configuration for authenticated organizer preview.
- **Auth**: `Bearer <token>`.

### `GET /api/public/events/:publicToken`
- **Purpose**: Serves live event game configuration to public attendee kiosks.
- **Auth**: Public (Rate-limited).
- **Guard**: Rejects with `403 PAYMENT_REQUIRED` if unpaid; rejects `403 EVENT_NOT_OPEN` before Setup Day.

---

## 4. High Scores & Leaderboards

### `GET /api/public/events/:publicToken/high-scores`
- **Purpose**: Returns official tournament leaderboard for live display kiosks.
- **Auth**: Public (Rate-limited, Cache-Control: max-age=5).
- **Filter**: Returns ONLY `score_environment = 'live'`. Quarantines test scores.

### `POST /api/public/events/:publicToken/high-scores`
- **Purpose**: Submits a score from a public player kiosk.
- **Auth**: Public.
- **Body**: `{ "player_name": "...", "score": 120, "session_id": "<token>", "metadata": {...} }`.
- **Anti-Cheat**: Validates session token; overrides client `is_test` to `false` during live window.

### `GET /api/events/:id/admin/high-scores`
- **Purpose**: Full score inspection for organizers (includes rehearsal/test scores and attendee leads).
- **Auth**: `Bearer <token>`.

### `POST /api/events/:id/admin/high-scores/clear`
- **Purpose**: Manually wipes quarantined test rehearsal scores before attendees arrive.
- **Auth**: `Bearer <token>`.
- **Body**: `{ "target": "test" | "all" }`.

---

## 5. Wallet & Payments

### `GET /api/organizations/:id/wallet`
- **Purpose**: Returns multi-ledger wallet balances (`paid_balance`, `welcome_credit`, `showcase_credit`, `topup_credit`, `outstanding_balance`).
- **Auth**: `Bearer <token>`.

### `GET /api/organizations/:id/wallet/transactions`
- **Purpose**: Returns double-entry transaction history ledger.
- **Auth**: `Bearer <token>`.

### `GET /api/organizations/:id/wallet/topup/quote?amount=...`
- **Purpose**: Returns reward credit bonus calculation for a deposit amount.
- **Auth**: `Bearer <token>`.

### `POST /api/wallet/topups` (alias `/api/organizations/:id/wallet/topup-orders`)
- **Purpose**: Creates a pending top-up order record.
- **Auth**: `Bearer <token>`.

### `POST /api/wallet/topups/:id/checkout`
- **Purpose**: Atomically claims checkout creation (`atomic_checkout_claim`) and creates Stripe Checkout session.
- **Auth**: `Bearer <token>`.
- **Response**: `{ "checkoutUrl": "https://checkout.stripe.com/..." }`.

### `POST /api/webhooks/stripe` (alias `/api/webhooks/payment`)
- **Purpose**: Asynchronously processes Stripe payment confirmation (`checkout.session.completed`).
- **Auth**: HMAC Signature verification (`PAYMENT_WEBHOOK_SECRET` / Stripe signature).
- **Action**: Credits paid balance and top-up bonus; nets outstanding balance.

---

## 6. Themes & Customization

### `GET /api/themes`
- **Purpose**: Returns organization themes and available system themes (deduplicated).
- **Auth**: `Bearer <token>`.

### `GET /api/themes/system`
- **Purpose**: Returns global system theme catalog.
- **Auth**: `Bearer <token>`.

### `POST /api/themes/clone-system/:id`
- **Purpose**: Deep-copies a system theme to the user's organization for custom editing.
- **Auth**: `Bearer <token>`.

### `POST /api/themes`
- **Purpose**: Creates a new custom theme.
- **Auth**: `Bearer <token>`.

### `PUT /api/themes/:id`
- **Purpose**: Updates theme visuals, audio, layout, and 1024×576 screen editor JSON.
- **Auth**: `Bearer <token>`.

### `DELETE /api/themes/:id`
- **Purpose**: Deletes an organization theme (system themes are protected).
- **Auth**: `Bearer <token>`.

---

## 7. Event Showcases & Media

### `GET /api/showcases/:id`
- **Purpose**: Retrieves showcase record by showcase UUID (or fallback event ID) for public unauthenticated presentation.
- **Auth**: Optional JWT. Publicly accessible without credentials when showcase status is `PUBLISHED` (and not `BLOCKED` or `DELETED`). Authenticated organization members/developers can also view drafts or preview state (`isPreview: true`).
- **Response**: `{ showcase, event, media, isPreview }`

### `GET /api/showcases/:id/media`
- **Purpose**: Retrieves approved/published showcase media attachments by showcase UUID.
- **Auth**: Optional JWT. Publicly accessible when parent showcase is `PUBLISHED`.
- **Response**: `{ media: EventShowcaseMedia[] }`

### `GET /api/events/:id/showcase`
- **Purpose**: Retrieves showcase record associated with an event.
- **Auth**: Optional JWT (public if status is `PUBLISHED`).

### `POST /api/events/:id/showcase`
- **Purpose**: Initializes a showcase draft.
- **Auth**: `Bearer <token>`.

### `PATCH /api/events/:id/showcase`
- **Purpose**: Updates showcase content, metrics, client name, and testimonials.
- **Auth**: `Bearer <token>`.

### `POST /api/events/:id/showcase/publish`
- **Purpose**: Publishes showcase live immediately ("Publish First, Moderate Later") via atomic backend RPC (`publish_event_showcase_atomic`).
- **Auth**: `Bearer <token>` (Org owner or admin).
- **Request Body (Optional / Nullable)**:
  ```json
  {
    "title": "Client Brand Activation",
    "description": null,
    "client_name": null,
    "client_logo_url": null,
    "cover_image_url": null
  }
  ```
- **Backend Execution**: Executes `publish_event_showcase_atomic` under `SECURITY DEFINER` with row locks. Supports both new showcase creation and updating existing showcase. Nullable fields are safely accepted without failing validation.
- **Side-Effect**: Triggers asynchronous background reward evaluation; sets `reward_status = 'AWAITING_APPROVAL'` if first-completed event criteria are met. Reward evaluation does NOT gate publication. Structured error logging records `requestId`, `eventId`, `userId`, `organizationId`, `publishPath`, and database error codes.

### `POST /api/events/:id/showcase/media`
- **Purpose**: Uploads and attaches a photo or video to the showcase.
- **Auth**: `Bearer <token>`.
- **Validation**: Magic bytes verification; rejects SVG.

---

## 8. Developer Admin Portal

All endpoints require `user.is_developer === true` or email in `DEVELOPER_EMAILS`:

| Method & Route | Purpose |
| :--- | :--- |
| `GET /api/developer/stats` | Platform KPIs (active orgs, live events, wallet deposits) |
| `GET /api/developer/showcases` | Filterable list of all showcases for reward reviews & moderation |
| `POST /api/developer/showcases/:id/reward/approve` | Grants RM300 showcase credit via atomic RPC |
| `POST /api/developer/showcases/:id/reward/reject` | Rejects reward while leaving showcase published |
| `POST /api/developer/showcases/:id/block` | Blocks violating showcase from public visibility |
| `POST /api/developer/showcases/:id/unblock` | Restores blocked showcase |
| `DELETE /api/developer/showcases/:id` | Administrator soft-deletion |
| `GET /api/developer/pricing/settings` | Inspects base price and duration tiers |
| `PUT /api/developer/pricing/settings` | Updates platform pricing configuration |
| `PUT /api/developer/events/:id/pricing` | Overrides authoritative price for a custom event |
| `POST /api/developer/events/:id/reactivate` | Reactivates an expired unpaid event |
| `POST /api/developer/events/maintenance` | Triggers immediate lifecycle maintenance |
