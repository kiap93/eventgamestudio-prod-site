# Event Lifecycle & Access Rules — Authoritative Architecture

This document defines the authoritative lifecycle rules, state transitions, date boundaries, payment coupling rules, and access controls for all events in **Event Game Studio**.

All frontend components, backend endpoints (`server.ts`, `worker.ts`, `server/db/events.ts`), scheduled maintenance workers, and database functions MUST strictly adhere to these specifications.

---

## 1. Core Principles & Status Decoupling

The platform strictly separates **Event Lifecycle Status** from **Payment Lifecycle Status**:

```
+-------------------------------------------------------------------------------+
|                             EVENT LIFECYCLE                                   |
|                                                                               |
|  [SCHEDULED] ----> [LIVE] (During Window & Paid) ----> [COMPLETED / EXPIRED]  |
|      |                                                                        |
|      +-----------> [CANCELLED] (ONLY via explicit user/admin action)          |
+-------------------------------------------------------------------------------+

+-------------------------------------------------------------------------------+
|                             PAYMENT LIFECYCLE                                 |
|                                                                               |
|     [UNPAID / PENDING_PAYMENT] ----------> [PAID] ----------> [REFUNDED]      |
|                 |                                                             |
|                 +------------------------> [EXPIRED]                          |
+-------------------------------------------------------------------------------+
```

### The Inviolable Separation Rule
> **`UNPAID`, `PENDING_PAYMENT`, or `EXPIRED` events must NEVER automatically become `event.status = 'CANCELLED'` or `event_status = 'CANCELLED'`.**
>
> `CANCELLED` is strictly reserved for explicit cancellation by the event organizer or platform admin.
> `PAYMENT_TIMEOUT` is a reason code for payment expirations, NOT an event cancellation trigger.

### Zero Automated Wallet Deductions Rule
> **The background maintenance cron (`runEventLifecycleMaintenance`) performs lifecycle maintenance ONLY. It MUST NEVER silently charge or automatically deduct customer wallet balances.**
>
> All payments and wallet deductions require deliberate, explicit user action in the UI.

```
Before Setup Day
    ↓
UNPAID
    ↓
User chooses Pay
    ↓
Payment succeeds
    ↓
PAID

Setup Day arrives
    ↓
If unpaid → remain UNPAID
    ↓
Do NOT automatically deduct wallet

Event starts
    ↓
If unpaid → remain UNPAID
    ↓
Live URL blocked

After event end
    ↓
UNPAID → EXPIRED
```

---

## 2. Event Date Boundaries & Setup Day

Events are defined by inclusive calendar start and end dates (`start_date` and `end_date`, format: `YYYY-MM-DD`):

### Authoritative Business Timezone Declaration
> **Standard Business Timezone**: All events operate on **Asia/Singapore / Malaysia UTC+8** (`Asia/Singapore`) business timezone.
>
> Both backend lifecycle crons and client calendar checks evaluate date boundaries (including Setup Day at `00:00:00` and Event Conclusion at `23:59:59.999`) against UTC+8.
>
> **Future Multi-Timezone Architecture**:
> When expanding to international agencies (e.g. Bangkok UTC+7, Tokyo UTC+9, London UTC+0), the event schema allows an optional `event_timezone` (or fallback to `organization_timezone`), transitioning the lifecycle from fixed Singapore time to `current date in event timezone`. In the absence of an explicit `event_timezone`, all systems strictly default to `Asia/Singapore` (UTC+8).

### Calendar Boundaries
- **Start Date (`start_date`)**: The first day the game is officially open for attendees (e.g. `2026-09-02` at `00:00:00` UTC+8).
- **End Date (`end_date`)**: The last day the game is officially open for attendees (e.g. `2026-09-03` through `23:59:59` UTC+8).
- **Setup Day (`live_open_date`)**: Exactly **1 calendar day prior** to `start_date` (e.g. `2026-09-01`).
  - Calculation: `start_date - 1 day` at `00:00:00` in the event's business timezone (default: `Asia/Singapore` UTC+8).
  - Purpose: Allows event organizers and venue teams to test the live game on event devices before attendees arrive.

---

## 3. Event Creation Validation Rules

When creating an event:
1. **Past Date Check**:
   - `IF event_end_date < current_calendar_date`:
     - **BLOCK EVENT CREATION**
     - Error: `"This event date has already passed. Please select a current or future event date."`
     - Status: `422 Unprocessable Entity` (Code: `EVENT_DATE_PASSED`)
2. **Chronological Validity**:
   - `IF event_end_date < event_start_date`:
     - **BLOCK EVENT CREATION**
     - Error: `"Event end date cannot be earlier than start date."`
     - Status: `422 Unprocessable Entity` (Code: `INVALID_DATE_RANGE`)
3. **Creation State**:
   - Status: `SCHEDULED` (`status: 'scheduled'`)
   - Payment Status: `UNPAID` (`payment_status: 'PENDING_PAYMENT'`)
   - Organization Limit: Maximum 5 unpaid/pending payment events per organization at any time (events whose end date has passed or are expired/cancelled/paid do not count against this limit).

---

## 4. Lifecycle Phases (Example: Event 2-Sep to 3-Sep, Setup Day 1-Sep)

### Phase 1: Before Setup Day (Before 1-Sep, e.g. 31-Aug)
- **Status**: `SCHEDULED`
- **Payment Status**: `UNPAID` or `PAID`
- **Live Game Access**: `CLOSED` (Reason: `EVENT_NOT_OPEN`)
- **Preview / Test Mode**: `AVAILABLE`
- **Public `/play/:slug` URL**: Shows "Not Open Yet" screen.
- **Organizer Actions**: Full editing permitted. Free cancellation permitted (full refund if paid).

### Phase 2: On Setup Day (1-Sep)
- **Status**:
  - If Paid: `LIVE` (or `SCHEDULED` ready for setup test)
  - If Unpaid: `SCHEDULED` (Never Cancelled)
- **Payment Status**: `UNPAID` or `PAID`
- **Live Game Access**:
  - If Paid: `AVAILABLE` (Live setup testing open)
  - If Unpaid: `BLOCKED` (Reason: `PAYMENT_REQUIRED`)
- **Preview / Test Mode**: `AVAILABLE`
- **Public `/play/:slug` URL**:
  - If Paid: Live Game loads and is playable.
  - If Unpaid: Shows "Awaiting Activation" screen (NOT Cancelled).
- **Automated Maintenance**:
  - Setup Day changes cancellation/refund eligibility: the event becomes strictly non-refundable and non-cancellable.
  - Setup Day does NOT trigger automated payment or wallet balance deduction. Payment remains an explicit user action.
  - An unpaid event on Setup Day remains `UNPAID` and `SCHEDULED` (Never Cancelled, Never Auto-Charged).

### Phase 3: During Event Window (2-Sep & 3-Sep)
- **Status**:
  - If Paid: `LIVE`
  - If Unpaid: `SCHEDULED` (Never Cancelled)
- **Payment Status**: `UNPAID` or `PAID`
- **Live Game Access**:
  - If Paid: `AVAILABLE`
  - If Unpaid: `BLOCKED` (Reason: `PAYMENT_REQUIRED`)
- **Preview / Test Mode**: `AVAILABLE`
- **Public `/play/:slug` URL**:
  - If Paid: Live Game loads and is playable.
  - If Unpaid: Shows "Awaiting Activation" screen (NOT Cancelled).
- **Leaderboard**: Active recording and updates.

### Phase 4: After End Date (4-Sep Onwards)
- **Status**:
  - If Paid: `COMPLETED` (`status: 'expired'`)
  - If Unpaid: `EXPIRED` (`status: 'expired'`, payment remains `UNPAID` or `EXPIRED`)
  - **NEVER `CANCELLED`**
- **Live Game Access**: `CLOSED` (Reason: `EVENT_EXPIRED`)
- **Preview / Test Mode**: `CLOSED`
- **Public `/play/:slug` URL**: Shows "Event Concluded / Expired" screen (NOT Cancelled, NOT Payment Pending).
- **Leaderboard**: Read-only archive mode.

---

## 5. Explicit Deletion, Cancellation & Refund Rules

### Authoritative Business Rule Matrix:
| Lifecycle | Payment | Delete | Cancel/Refund |
| :--- | :--- | :--- | :--- |
| **BEFORE_SETUP_DAY** | **UNPAID** | **ALLOWED** | N/A (unpaid; delete instead) |
| **BEFORE_SETUP_DAY** | **PAID** | **FORBIDDEN** | **ALLOWED** (full ledger refund) |
| **SETUP_DAY** | **UNPAID** | **FORBIDDEN** | **FORBIDDEN** (operationally locked) |
| **SETUP_DAY** | **PAID** | **FORBIDDEN** | **FORBIDDEN** (operationally locked) |
| **LIVE** | **PAID** | **FORBIDDEN** | **FORBIDDEN** |
| **COMPLETED** | **PAID** | **FORBIDDEN** | **FORBIDDEN** |
| **EXPIRED** | **UNPAID** | **FORBIDDEN** | **FORBIDDEN** |
| **EXPIRED** | **PAID** | **FORBIDDEN** | **FORBIDDEN** |
| **CANCELLED** | — | **FORBIDDEN** | **FORBIDDEN** |

### Detailed Rules:
1. **Before Setup Day**:
   - **Unpaid event**: Delete is allowed. No refund is applicable because nothing was paid. The event can be permanently deleted.
   - **Paid event**: Delete is NOT allowed. "Cancel & Refund" is allowed with full audit ledger refund.
2. **Once Setup Day Begins (Setup Day, Live, Completed, Expired, Cancelled)**:
   - Delete is strictly NOT allowed.
   - Cancellation is strictly NOT allowed.
   - Refund is strictly NOT allowed.
   - The event is operationally locked.
3. **Cancelled Events**:
   - Delete is NOT allowed.
   - Second cancellation/refund is strictly rejected (idempotent, single refund guarantee).
   - Financial audit trail and ledger entries remain intact.

---

## 6. Access Control Matrix

| Date / State | Live Game (/play) | Preview Mode | Leaderboard |
| :--- | :--- | :--- | :--- |
| **Before Setup Day (Unpaid)** | Closed (`EVENT_NOT_OPEN`) | **Allowed** | Inactive |
| **Before Setup Day (Paid)** | Closed (`EVENT_NOT_OPEN`) | **Allowed** | Inactive |
| **Setup Day (Unpaid)** | Blocked (`PAYMENT_REQUIRED`) | **Allowed** | Inactive |
| **Setup Day (Paid)** | **Playable** | **Allowed** | Active |
| **Event Window (Unpaid)** | Blocked (`PAYMENT_REQUIRED`) | **Allowed** | Inactive |
| **Event Window (Paid)** | **Playable** | **Allowed** | Active |
| **After End Date (Unpaid)** | Closed (`EVENT_EXPIRED`) | Closed | Read-only |
| **After End Date (Paid)** | Closed (`EVENT_EXPIRED`) | Closed | Read-only |
| **Explicitly Cancelled** | Closed (`EVENT_CANCELLED`) | Closed | Inactive |

---

## 7. Canonical Helper Functions

- `server/db/events.ts` & `src/lib/dateUtils.ts`:
  - `deriveEventLifecycleStatus(event, currentDate)`
  - `getClientLiveGameAccessDetails(event, currentDate)`
  - `canAccessPreviewEvent(event, currentDate)`
  - `isEventExplicitlyCancelled(event)`
  - `normalizeEventDateBoundaries(dates, options)`
  - `calculateEventCalendarDays(startDate, endDate)`
