# Business Rules: Organization Wallet & Balances

This document details the wallet ledger architecture, top-up workflows, credit grant systems, ACID transaction controls, and refund rules in **Event Game Studio**, verified against `server/db/wallet.ts`, `supabase/migrations/20260904000000_atomic_outstanding_balance_settlement.sql`, and `20260904010000_atomic_checkout_claim.sql`.

---

## 1. Multi-Ledger Wallet Model

Every organization has a dedicated row in `public.organization_wallets` created upon organization onboarding. The platform maintains strictly isolated financial ledgers:

```
┌───────────────────────────────────────────────────────────────────────────┐
│                    ORGANIZATION WALLET STRUCTURE                          │
├───────────────────────────────────────────────────────────────────────────┤
│ 1. Paid Cash Balance (paid_balance)                                       │
│    Real deposited money from payment gateways (Stripe Checkout).          │
│                                                                           │
│ 2. Welcome Credit (welcome_credit)                                        │
│    One-time RM800.00 promotional credit granted upon registration.        │
│                                                                           │
│ 3. Showcase Credit (showcase_credit)                                      │
│    One-time RM300.00 reward credit awarded for first approved showcase.  │
│                                                                           │
│ 4. Top-Up Reward Credit (topup_credit)                                    │
│    Bonus credits awarded for qualifying top-up deposit tiers.             │
│                                                                           │
│ 5. Outstanding Balance (outstanding_balance)                              │
│    Debt balance requiring settlement before new purchases or activations. │
└───────────────────────────────────────────────────────────────────────────┘
```

### Total Balance Calculation
$$\text{total\_balance} = \text{paid\_balance} + \text{welcome\_credit} + \text{showcase\_credit} + \text{topup\_credit}$$

> **Important Security Boundary**:
> Frontend clients are NEVER trusted with balance amounts. Frontend components only request quotes or trigger payment actions; the backend calculates and verifies balances directly within locked database transactions.

---

## 2. Step-by-Step Money Flow: Wallet Top-Up

The complete top-up journey follows an asynchronous, idempotent flow:

```
[ Step 1: Request Quote ]
  Organizer selects package (e.g. Deposit RM5,000 → Bonus RM500)
  GET /api/organizations/:orgId/wallet/topup/quote?amount=5000
       │
       ▼
[ Step 2: Prepare Pending Order ]
  POST /api/wallet/topups (or /api/organizations/:orgId/wallet/topup-orders)
  Inserts row in public.topup_orders with status = 'PENDING'
       │
       ▼
[ Step 3: Atomic Checkout Claim ]
  POST /api/wallet/topups/:id/checkout
  Executes claimCheckoutSessionCreation (calls atomic_checkout_claim RPC)
  Prevents duplicate Stripe checkout session generation on rapid clicks
       │
       ▼
[ Step 4: Stripe Checkout Session Created ]
  Returns session URL to frontend; browser redirects to Stripe hosted payment
       │
       ▼
[ Step 5: User Completes Payment on Stripe ]
  Stripe sends signed webhook event: checkout.session.completed
       │
       ▼
[ Step 6: Webhook Ingress & Idempotency Check ]
  POST /api/webhooks/stripe verifies HMAC signature
  Checks if reference_id / payment_intent_id has already been processed
       │
       ▼
[ Step 7: Atomic Settlement & Balance Crediting ]
  Executes processTopupOrderStatus inside organization lock:
  1. Checks outstanding_balance: if > 0, settles debt first
  2. Credits paid_balance with net deposit
  3. Credits topup_credit with tier bonus
  4. Inserts completed records in wallet_transactions
  5. Updates topup_orders status to 'COMPLETED'
```

---

## 3. Top-Up Reward Tiers

Reward credits are dynamically calculated by `calculateTopupCredit(amount)`:
- Deposits below RM2,000: **RM0.00** bonus.
- Deposit RM2,000 – RM4,999: **RM200.00** Top-Up Credit.
- Deposit RM5,000 – RM9,999: **RM600.00** Top-Up Credit.
- Deposit RM10,000+: **RM1,500.00** Top-Up Credit.

*Note: Top-up credits can only be applied toward event license purchases up to the 20% cap of the event price.*

---

## 4. Promotional Credits Lifecycle

### Welcome Credit
- **Amount**: RM800.00 one-time grant.
- **Trigger**: Organization creation (`grantWelcomeCredit` or `create_organization_atomic`).
- **Idempotency**: Guarded by `welcome_credit_granted` boolean flag on the wallet row and unique constraint on `wallet_transactions (organization_id, reference_id)`.
- **Consumption**: Applied to the organization's first event license purchase.

### Showcase Reward Credit
- **Amount**: RM300.00 one-time grant.
- **Trigger**: Platform administrator approval of the organization's first eligible event showcase (`approve_first_event_showcase_reward_atomic`).
- **Idempotency**: Guarded by `showcase_credit_granted` flag on the wallet row. Subsequent showcases do not receive financial rewards.

---

## 5. Wallet Deductions for Event Licenses

When an event is activated via `processEventPayment`:
1. **Locking**: The backend acquires an exclusive row lock on `organization_wallets` using `withOrganizationLock(orgId)`.
2. **Eligibility Validation**: Verifies that any applied credits (`welcome_credit`, `showcase_credit`, `topup_credit`) do not exceed their authorized caps.
3. **Debit Transactions**: Creates corresponding negative entries in `wallet_transactions`:
   - `SHOWCASE_CREDIT` debit
   - `WELCOME_CREDIT` debit
   - `TOPUP_CREDIT` debit
   - `PAID_BALANCE` debit
4. **Row Decrement**: Atomically updates balance columns in `organization_wallets`.
5. **Rollback Guarantee**: If any ledger has insufficient funds, the entire transaction aborts with zero modifications.

---

## 6. Refunds & Balance Reversals

Refunds are supported via `refundEventPayment` and `reverseTransaction`:
- **Pre-Setup Day Cancellation**:
  - Full 100% refund of the paid balance and restoration of used credits.
  - Generates positive refund transaction entries in `wallet_transactions` with `transaction_type = 'REFUND'`.
  - Re-credits `paid_balance` and restores `welcome_credit` or `showcase_credit`.
- **Administrative Reversals**:
  - Developer admins can reverse specific transactions (`POST /api/developer/wallet/reverse`).
  - If reversing a credit results in a negative total balance, the negative amount is moved to `outstanding_balance` rather than leaving an illegal negative balance.

---

## 7. Relevant Database Tables & Functions

| Entity | Purpose |
| :--- | :--- |
| `public.organization_wallets` | Core balance table with separate balance columns per ledger |
| `public.wallet_transactions` | Immutable double-entry transaction log |
| `public.topup_orders` | Tracks top-up lifecycle (`PENDING`, `COMPLETED`, `FAILED`, `EXPIRED`) |
| `public.wallet_audit_events` | Security audit trail recording IP, user ID, and balance deltas |
| `atomic_checkout_claim` | Stored procedure preventing duplicate Stripe session generation |
| `atomic_outstanding_balance_settlement` | Stored procedure netting outstanding debts during top-ups |
| `withOrganizationLock` | Server-side transaction wrapper locking the wallet row `FOR UPDATE` |
