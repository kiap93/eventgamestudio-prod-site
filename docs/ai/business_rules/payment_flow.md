# Business Rules: Payment Flow & Pricing Lifecycle

This document describes the financial workflows, pricing resolution, credit deduction rules, and payment state transitions in **Event Game Studio**, verified against `server/db/wallet.ts`, `server/db/events.ts`, and `server/db/platformSettings.ts`.

---

## 1. Distinction: Payment State vs. Event Lifecycle State

Payment status and event lifecycle status are strictly decoupled:

| Status Category | Possible Values | Meaning |
| :--- | :--- | :--- |
| **Payment Status** (`payment_status`) | `UNPAID`<br>`PENDING_PAYMENT`<br>`PAID`<br>`REFUNDED`<br>`EXPIRED` | Financial state of the event license. Governs whether the live event is allowed to open to players. |
| **Event Lifecycle Status** (`status`) | `SCHEDULED`<br>`LIVE`<br>`COMPLETED`<br>`CANCELLED`<br>`EXPIRED` | Operational state of the event timeline based on calendar dates and administrator actions. |

### The Core Invariant
- **An event NEVER goes live while `payment_status !== 'PAID'`**.
- An event being `UNPAID` does not cancel the event; it simply prevents the public live URL from admitting players on and after Setup Day.
- When an unpaid event passes its `end_date`, its payment status transitions to `payment_status = 'EXPIRED'`.

---

## 2. Dynamic Pricing & Authoritative Price Resolution

Event Game Studio prohibits hardcoding prices in frontend components or API route strings. Pricing is dynamic business data resolved server-side:

### Platform Pricing Model
- **Base Price Default**: RM1,400 (for 1 calendar day).
- **Duration-Based Tier Schedule**:
  - 1 Day: RM1,400
  - 2 Days: RM1,900
  - 3 Days: RM2,200
  - 4–7 Days: RM2,800
  - 8–14 Days: RM4,500
  - 15–30 Days: RM7,500
  - 31+ Days: Custom quote / configurable in `platform_settings` table.
- **Developer Overrides**: Platform developer admins can set `is_custom_price = true` and define `event_price` per event record (`PUT /api/developer/events/:id/pricing`).

### Authoritative Resolution Flow
1. Client requests a quote via `POST /api/events/quote` or `POST /api/organizations/:orgId/wallet/quote-payment`.
2. Backend calls `calculateEventAuthoritativePrice(durationDays, platformSettings)`.
3. When the event is created, this authoritative price is recorded in the `events` table (`event_price`, `currency = 'MYR'`).
4. Subsequent payment transactions verify against the locked `event.event_price`, preventing price fluctuation after booking.

---

## 3. Payment Modes & Credit Deduction Rules

When an event license is purchased, the total event price can be covered through wallet balances under strict business rules (`calculateEventPayment` in `server/db/wallet.ts`):

```
                       ┌───────────────────────────────┐
                       │   Event Price (e.g. RM1,400)  │
                       └───────────────┬───────────────┘
                                       │
           ┌───────────────────────────┴───────────────────────────┐
           ▼                                                       ▼
┌───────────────────────┐                               ┌───────────────────────┐
│  Promotional Credits  │                               │   Paid Cash Balance   │
│  (Up to Allowed Cap)  │                               │    (Minimum Share)    │
└───────────────────────┘                               └───────────────────────┘
```

### Supported Payment Modes
1. **`FULL_PAID`**:
   - 100% of event price paid using cash wallet balance (`paid_balance`).
   - Zero promotional credits used.
2. **`WELCOME_CREDIT`**:
   - Up to RM800.00 from `welcome_credit` balance.
   - Remaining balance (minimum RM600.00 for a RM1,400 event) must be covered by `paid_balance`.
   - One-time credit awarded upon organization registration.
3. **`SHOWCASE_CREDIT`**:
   - Up to RM300.00 from `showcase_credit` balance.
   - Remaining balance (minimum RM1,100.00 for a RM1,400 event) covered by `paid_balance`.
   - One-time reward awarded upon approval of the organization's first eligible event showcase.
4. **`TOPUP_CREDIT`**:
   - Up to **maximum 20% of the event price** (e.g. max RM280.00 for RM1,400 event) from `topup_credit`.
   - Remaining balance (minimum RM1,120.00 for RM1,400 event) covered by `paid_balance`.
5. **`COMBINED_CREDIT`**:
   - Applies eligible promotional credits in prioritized sequence subject to their respective caps, requiring the remaining balance to be satisfied by `paid_balance`.

### Inviolable Credit Rules
- **Server-Authoritative Calculation**: Frontend never submits payment deduction amounts. The frontend passes only the desired `paymentMode` (or toggle flags), and the backend calculates exact deduction amounts from the database.
- **Sufficient Balance Check**: If `paid_balance` is insufficient to cover the post-credit cash requirement, the transaction aborts with `400 INSUFFICIENT_FUNDS`.

---

## 4. Payment Execution & Atomic Settlement

Event payments are executed via `processEventPayment` (`POST /api/organizations/:orgId/wallet/pay-event` or `POST /api/events/:id/pay`):

```
[ Organizer Clicks Pay ]
          │
          ▼
[ Acquire Organization Row Lock (FOR UPDATE) ]
          │
          ▼
[ Check Outstanding Balance ] ──(If > 0)──► [ Abort: Settle Outstanding First ]
          │
          ▼
[ Calculate Authoritative Deductions ]
          │
          ▼
[ Verify Sufficient Balances ] ──(If Insufficient)──► [ Abort: 400 Insufficient Funds ]
          │
          ▼
[ Atomic Transaction: ]
  1. Insert Debit Wallet Transactions (SHOWCASE_CREDIT, TOPUP_CREDIT, PAID_BALANCE)
  2. Decrement organization_wallets columns
  3. Update events table: payment_status = 'PAID', paid_at = now()
  4. Record Audit Trail Event
          │
          ▼
[ Return 200 OK with Receipt & New Balances ]
```

### What Happens Before Payment
- Event record has `payment_status = 'UNPAID'`.
- Organizer can customize themes, configure gameplay, and test in `/events/:id/preview`.
- Public live kiosk link returns `403 PAYMENT_REQUIRED`.

### What Happens After Payment
- Event record has `payment_status = 'PAID'` and `paid_at` timestamp.
- On and after Setup Day (`start_date - 1 day`), the public kiosk link immediately admits players.
- Score submissions on live days record as official live scores.

### What Happens If Payment Fails
- Database transaction rolls back completely.
- Zero funds are deducted from wallet balances.
- Event remains `payment_status = 'UNPAID'`.

---

## 5. Stripe Integration & Webhook Handling

For top-up orders where an organization deposits cash funds into their wallet:
1. **Order Preparation**: `preparePendingTopupOrder` creates a `topup_orders` record with status `PENDING`.
2. **Session Claiming**: `claimCheckoutSessionCreation` uses an atomic row update to lock the order and generate a Stripe Checkout session, preventing duplicate sessions from double-clicking.
3. **Stripe Checkout**: The user is redirected to Stripe's hosted payment page.
4. **Webhook Processing**:
   - Endpoint: `/api/webhooks/stripe` (and `/api/webhooks/payment`).
   - Webhook signature is validated using `PAYMENT_WEBHOOK_SECRET` (mandatory in production; Stripe signing secret `whsec_...` or gateway HMAC key). If missing, webhook processing throws `MISSING_WEBHOOK_SECRET` and returns HTTP 500.
   - On `checkout.session.completed`, `processTopupOrderStatus` executes:
     - Sets order status to `COMPLETED`.
     - Credits `paid_balance` by the net paid amount.
     - Credits qualifying `topup_credit` bonus tiers.
     - Automatically settles any existing `outstanding_balance` if present (`atomic_outstanding_balance_settlement`).

---

## 6. Outstanding Balance Netting

If an organization incurs an outstanding balance (e.g. from an administrative balance reversal or chargeback):
- `organization_wallets.outstanding_balance` records the debt.
- Any event payment attempt is **strictly blocked** while `outstanding_balance > 0`.
- During subsequent top-ups, `atomic_outstanding_balance_settlement` intercepts incoming funds:
  - First applies deposited cash to satisfy `outstanding_balance = 0`.
  - Credits only the net remaining funds to `paid_balance`.
