# Business Rules: Event Lifecycle & Access Flow

This document details the authoritative business rules, calendar logic, payment couplings, and lifecycle transitions for events in **Event Game Studio**, verified against `server/db/events.ts`, `EVENT_LIFECYCLE.md`, `server.ts`, and `worker.ts`.

---

## 1. Core Principles & Decoupling

The platform enforces strict separation between **Event Lifecycle Status** and **Payment Status**:

```
EVENT LIFECYCLE:
  [SCHEDULED] ───► [LIVE] (During Window & Paid) ───► [COMPLETED / EXPIRED]
      │
      └─────────► [CANCELLED] (ONLY via explicit user/admin action)

PAYMENT STATUS:
  [UNPAID / PENDING_PAYMENT] ───► [PAID] ───► [REFUNDED]
            │
            └─────────────────► [EXPIRED]
```

### Inviolable Separation Rules
1. **Unpaid events NEVER automatically become `CANCELLED`**: An unpaid event that passes its end date transitions to `status = 'EXPIRED'` with `payment_status = 'EXPIRED'`. The `CANCELLED` status is strictly reserved for explicit cancellation by the event organizer or a developer admin.
2. **Unpaid events NEVER go live**: An event with `payment_status !== 'PAID'` cannot be accessed by public players and cannot record live leaderboard scores.
3. **Zero Automated Wallet Deductions by Cron**: The background cron maintenance (`runEventLifecycleMaintenance`) performs status transitions only. It **never charges or deducts** an organization's wallet balance automatically on Setup Day or event start. All payments require deliberate, explicit user action.

---

## 2. Calendar Dates & Business Timezone (UTC+8)

All event dates operate on **inclusive calendar dates** formatted as `YYYY-MM-DD`:

### Authoritative Timezone
- **Default Business Timezone**: `Asia/Singapore` / Malaysia UTC+8 (`PLATFORM_BUSINESS_TIMEZONE = 'Asia/Singapore'`).
- All calendar boundary checks, Setup Day calculations, and scheduled crons evaluate against `Asia/Singapore` (UTC+8).
- **International Roadmap**: The event record supports an optional `event_timezone` (or organization timezone). If omitted, it strictly defaults to `Asia/Singapore`.

### Key Date Boundaries
- **Start Date (`start_date`)**: The first calendar day the event is officially open to attendees (e.g. `2026-09-02 00:00:00` UTC+8).
- **End Date (`end_date`)**: The last calendar day of the event. The event remains active through `23:59:59.999` UTC+8 of this day.
- **Duration (Calendar Days)**: Calculated using `calculateEventCalendarDays(startDate, endDate)`. Both dates are inclusive. A 1-day event has `start_date === end_date` (duration = 1 day).
- **Setup Day (`live_open_date`)**: Exactly **1 calendar day prior** to `start_date` at `00:00:00` UTC+8 (`start_date - 1 day`).
  - *Purpose*: Allows organizers and venue technicians to run rehearsals and test live game kiosks at the physical venue before public attendees arrive.

---

## 3. Event Creation Validation Rules

When an event is created via `POST /api/events` or `createEvent`:
1. **Past Date Prevention**:
   - Condition: `event_end_date < current_calendar_date` (in `Asia/Singapore` UTC+8).
   - Enforced by backend: Creation is rejected with status `422 Unprocessable Entity` (`EVENT_DATE_PASSED`).
2. **Date Order**:
   - Condition: `end_date < start_date`.
   - Enforced by backend: Creation is rejected with status `400 Bad Request`.
3. **Required Fields**:
   - `name` / `title` (non-empty string).
   - `game_type` / `game_id` (must exist in platform catalog).
   - `theme_id` (must belong to organization or be an active system theme).
   - `start_date` and `end_date` (ISO format `YYYY-MM-DD`).
4. **Authoritative Price Locking**:
   - At creation, the event calculates its authoritative price via `calculateEventAuthoritativePrice(durationDays, platformSettings)`.
   - The price and tier are locked into the event record (`event_price`, `currency = 'MYR'`).

---

## 4. Phase-by-Phase Lifecycle Behavior

```
Timeline:
       Creation         Setup Day (Start - 1)          Start Date               End Date 23:59:59
──────────┼─────────────────────┼───────────────────────────┼───────────────────────────┼──────────►
          │◄─── Pre-Event ────►│◄────────── Rehearsal ─────►│◄────── Live Tournament ──►│
          │                     │                           │                           │
Unpaid:   │ Preview Only        │ Live URL Blocked (403)     │ Live URL Blocked (403)     │ EXPIRED
Paid:     │ Preview Only        │ Live URL Open (Test Score)│ Live URL Open (Live Score)│ COMPLETED
```

### Phase 1: Before Event Start (Pre-Event Period)
- **Current Date**: `current_date < live_open_date` (more than 1 day before `start_date`).
- **Access Behavior**:
  - Public live URL (`/play/:publicToken`): **BLOCKED** with `403 EVENT_NOT_OPEN`.
  - Authenticated organizer preview (`/events/:eventId/preview`): **ALLOWED**.
- **Score Behavior**:
  - Any score submitted in preview mode is quarantined with `is_test = true` (`environment: 'TEST'`).
- **Editing Restrictions**:
  - Organizers can freely edit title, game configuration, theme assets, and dates.
  - If dates change, the event price is dynamically recalculated.

### Phase 2: On Setup Day (`live_open_date = start_date - 1`)
- **Current Date**: Exactly `start_date - 1 day` (`00:00:00` to `23:59:59` UTC+8).
- **If Event is PAID**:
  - Public live URL (`/play/:publicToken`): **ACCESSIBLE**.
  - Score Submission: Allowed, but quarantined as `is_test = true` (`environment: 'TEST'`) because public attendees have not arrived yet.
  - Test Score Auto-Clearing: When entering Setup Day, the system or scheduled cron executes `ensureTestScoresClearedForLiveEvent`, recording `test_scores_cleared_at`.
- **If Event is UNPAID**:
  - Public live URL: **BLOCKED** with `403 PAYMENT_REQUIRED`.
  - Organizer Preview: Accessible, but warning displayed indicating payment is required before live activation.

### Phase 3: During LIVE Period (`start_date` through `end_date 23:59:59`)
- **Current Date**: `current_date >= start_date` AND `current_date <= end_date`.
- **If Event is PAID**:
  - Event status: Evaluates to `LIVE`.
  - Public live URL (`/play/:publicToken`): Fully active for attendees.
  - Score Submission: Recorded authoritatively as `is_test = false` (`environment: 'LIVE'`).
  - Spoofing Prevention: If a player client attempts to submit `is_test = true` while hitting the public endpoint on a live event, the backend forcibly overrides it to `is_test = false`.
  - Public Leaderboard: Displays top live scores.
- **If Event is UNPAID**:
  - Public live URL: **BLOCKED** with `403 PAYMENT_REQUIRED`.
  - Organizers can still complete payment in the Studio to immediately open the event.

### Phase 4: After Event End (`current_date > end_date`)
- **Current Date**: `current_date > end_date` (evaluated at `00:00:00` UTC+8 following `end_date`).
- **If Event was PAID**:
  - Event status: Transitions to `COMPLETED`.
  - Public live URL: Blocks new gameplay with `403 EVENT_CONCLUDED`.
  - Leaderboard: Preserved as a read-only historical archive.
  - Showcase: Event becomes eligible for self-service Showcase creation and immediate publishing (no admin approval required to go live). Editorial event quality review and the one-time RM300 first-event showcase reward are separate, decoupled workflows.
- **If Event was UNPAID**:
  - Event status: Transitions to `EXPIRED`.
  - Payment status: Transitions to `EXPIRED`.
  - Delayed Payment Guard: The event cannot be paid for or resurrected into a live state without administrator reactivation (`POST /api/developer/events/:id/reactivate`).

---

## 5. Cancellation & Refund Rules

Event cancellation is handled by `cancelEvent` and `determineEventRefund` in `server/db/events.ts`:
- **Unpaid Events**: Can be cancelled at any time before `end_date`. No financial refund is required.
- **Paid Events Cancelled BEFORE Setup Day (`current_date < live_open_date`)**:
  - Status: Transitions to `CANCELLED`.
  - Refund Eligibility: Eligible for a **100% refund** credited back to the organization's wallet (`determineEventRefund` returns `eligible: true, refundPercentage: 100`).
  - Payment status: Transitions to `REFUNDED`.
- **Paid Events Cancelled ON OR AFTER Setup Day (`current_date >= live_open_date`)**:
  - Status: Transitions to `CANCELLED`.
  - Refund Eligibility: **No refund** (`eligible: false, refundPercentage: 0`). Platform licenses are committed once rehearsal opens.

---

## 6. Frontend vs. Backend Enforcement Matrix

| Rule | Frontend UI Check | Backend / Database Enforcement |
| :--- | :--- | :--- |
| Block past dates on creation | Datepicker disables past dates | `createEvent` checks UTC+8 date and throws `422 EVENT_DATE_PASSED` |
| Block live game access if UNPAID | Displays "Payment Required" modal | `canAccessLiveEvent` returns `403 PAYMENT_REQUIRED` |
| Block live game access before Setup Day | Displays countdown / locked banner | `canAccessLiveEvent` returns `403 EVENT_NOT_OPEN` |
| Quarantine test scores | Passes preview context flag | Backend verifies JWT/token and tags score `is_test = true` |
| Block live scores after end date | Disables submit button in UI | `submitEventScore` checks date and rejects `EVENT_CONCLUDED` |
| Transition to EXPIRED | UI marks status tag "Expired" | Cron / `runEventLifecycleMaintenance` updates DB status |
| Immutability of event records | UI disables inputs for closed events| Database RLS trigger blocks unauthorized client writes |
