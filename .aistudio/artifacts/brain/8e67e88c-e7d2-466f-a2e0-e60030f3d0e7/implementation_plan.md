# EventGameStudio Production Invoice Implementation — 5-Phase Controlled Execution

A production-grade, authoritative event invoice engine for EventGameStudio that automates tax invoice generation upon event completion, guarantees decimal-safe billing and payment reconciliation, persists immutable invoice snapshots with secure PDF downloads, and integrates seamlessly into customer dashboards and Developer Admin consoles through a 5-phase controlled execution plan.

### User Review & Critical Decisions

> [!IMPORTANT]
> The implementation strictly follows a 5-phase sequential gate. Each phase requires inspecting existing code, tracing data flows, making targeted edits, running verification checks, updating `AI_CHANGELOG.md`, and reporting progress before moving forward.
> - **Phase 1**: Audit existing implementation, schema, pricing, payments, and wallet-credit flows.
> - **Phase 2**: Fix invoice calculations, numbering, database persistence, and idempotency.
> - **Phase 3**: Implement automatic generation, durable PDF storage, and authenticated APIs.
> - **Phase 4**: Implement customer and Developer Admin interfaces and email notifications.
> - **Phase 5**: Run end-to-end tests, verify UAT migrations, and prepare a production deployment checklist.

- **Confirmed Decision 1**: Official seller details are managed via `platform_settings` (key: `seller_invoice_settings`) with Developer Admin configuration and safe verified defaults.
- **Confirmed Decision 2**: Automatic invoice generation is triggered during lifecycle maintenance (`runEventLifecycleMaintenance`) strictly after event conclusion (`curDate > endDate` in event timezone or `COMPLETED`); unpaid or cancelled events are never invoiced.
- **Confirmed Decision 3**: Migration filename `supabase/migrations/20261019000000_create_event_invoices_and_credit_notes.sql` is retained intact and validated for table schema, RLS, indexes, and foreign keys.
- **Confirmed Decision 4**: All monetary operations are decimal-safe, preserving separate currencies (MYR, SGD, USD), explicitly reconciling actual wallet credit transactions (`WELCOME_CREDIT`, `SHOWCASE_CREDIT`, `TOPUP_CREDIT`, and `PAID_BALANCE`).

---

### 1. Overview & Core Concept

- **What It Does**: Automates the issuance of immutable, compliant tax invoices and credit notes for completed event activations. Customers can review itemized breakdowns and download vector PDFs from their event dashboard. Developer Admins can audit all platform invoices, retry PDF/email processing, update seller billing data, and issue audited adjustments.
- **Target Audience / Persona**:
  - *Organization Owners / Admins*: Corporate event organizers and agency clients requiring official invoices for accounting, corporate claims, and auditing.
  - *Platform Developer Admins*: Internal finance and support operators managing billing verification, dispute resolution, and platform settings.
- **Key Value**: Delivers auditable, immutable accounting records directly synchronized with event lifecycles and wallet ledgers without human error.

---

### 2. User Experience & Visual Design

Following the Frontend Design Constitution and SaaS Dashboard Guidelines (`references/3_saas_dashboard.md`):

#### Key User Flows
1. **Customer Event Invoices View**:
   - Concluded events display an Invoices card showing invoice number, date, subtotal, credit discounts, tax, total, amount paid, and balance due.
   - One-click authenticated PDF download (`/api/invoices/:id/pdf`).
2. **Developer Admin Invoices Management**:
   - High-density tabular grid with search, organization filter, status filter, and pagination.
   - Detail modal with full line-item inspection, audit trail logs, PDF download/retry, email retry, and credit-note issuance.
3. **Developer Admin Seller Settings**:
   - Form interface in `/developer` settings to update official company name, registration number, SST/tax ID, address, support contact, and payment terms.

#### Visual Design Tokens
- Neutral dark slate background (`#07130b` / `#0b1329`) with subtle hairline dividers (`border-slate-800`).
- Strict monospace tabular numerals (`font-mono tabular-nums`) for currency amounts, invoice numbers, and dates.
- Zero-pill status typography with semantic color accents (Emerald for Paid, Amber for Unpaid, Crimson for Void).

---

### 3. Phased Execution Gates

```
┌────────────────────────────────────────────────────────────────────────┐
│                        5-PHASE EXECUTION PLAN                          │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│   Phase 1: Deep Audit & Verification                                   │
│   - Trace schema & migration 20261019000000                            │
│   - Map event pricing, wallet transactions & credit usage              │
│   - Audit existing server/db/invoices.ts & pdfGenerator.ts             │
│                                                                        │
│   Phase 2: Correct Billing, Numbering & Database Persistence           │
│   - Eliminate RM1400 fallback; require valid price & currency          │
│   - Reconcile actual wallet transaction records                        │
│   - Implement atomic sequential numbering & immutable snapshots        │
│   - Add seller settings in platformSettings.ts                         │
│                                                                        │
│   Phase 3: Lifecycle Automation, Storage & Authenticated APIs          │
│   - Hook into runEventLifecycleMaintenance for COMPLETED events        │
│   - Durable Supabase Storage bucket persistence ('invoices')           │
│   - Full Express (server.ts) & Worker (worker.ts) API parity           │
│   - Secure authenticated streaming / download URLs                     │
│                                                                        │
│   Phase 4: Customer Dashboard, Admin Console & Email Notifications     │
│   - Customer event invoice card & PDF download in EventCard/page       │
│   - Developer Admin invoices console & seller settings editor          │
│   - Integrate Resend email template with audit tracking                │
│                                                                        │
│   Phase 5: Comprehensive Testing, UAT Verification & Deployment Check  │
│   - Unit & E2E tests across all 18+ edge scenarios                     │
│   - Run full build & lint verification                                 │
│   - Prepare UAT migration instructions & production deployment checklist│
└────────────────────────────────────────────────────────────────────────┘
```

#### Phase 1: Audit Existing Implementation, Schema, Pricing & Payments
- **Files Inspected**: `supabase/migrations/20261019000000_create_event_invoices_and_credit_notes.sql`, `server/db/invoices.ts`, `server/invoices/pdfGenerator.ts`, `server/email/invoiceEmailTemplate.ts`, `server/db/wallet.ts`, `server/db/events.ts`.
- **Tasks**:
  1. Verify table constraints (`UNIQUE(event_id)`, `UNIQUE(invoice_number)`, foreign keys to `events`, `organizations`, `users`).
  2. Inspect wallet payment transactions to understand how `WELCOME_CREDIT`, `SHOWCASE_CREDIT`, `TOPUP_CREDIT`, and `PAID_BALANCE` are stored and mapped.
  3. Identify all unsafe assumptions in `server/db/invoices.ts` (e.g. hardcoded fallback prices, generic discount assumptions).
- **Gate Output**: Audit summary and baseline verification.

#### Phase 2: Fix Invoice Calculations, Numbering & Database Persistence
- **Files**: `server/db/invoices.ts`, `server/db/platformSettings.ts`, `server/invoices/pdfGenerator.ts`.
- **Tasks**:
  1. Fix calculation logic in `generateEventInvoice`:
     - Reject events missing authoritative price or currency.
     - Match exact currency (MYR, SGD, USD).
     - Query actual wallet transactions for the event to extract true Welcome Credit, Showcase Credit, Topup Credit, and Paid Balance amounts.
     - Decimal-safe monetary arithmetic via integer cents (`toCents`/`fromCents`).
  2. Atomic numbering: implement database sequence query in Supabase `invoices` table with advisory lock / fallback to prevent duplicate numbers under concurrency.
  3. Seller settings: add `getPlatformInvoiceSettings` and `updatePlatformInvoiceSettings` in `server/db/platformSettings.ts` backed by `platform_settings` table.
  4. Immutable snapshot: ensure issued invoices freeze seller, customer, and event details.
- **Gate Output**: Unit tests passing for calculations, numbering, and credit reconciliation.

#### Phase 3: Automatic Generation, Durable Storage & Authenticated APIs
- **Files**: `server/db/events.ts`, `server/db/storage.ts`, `server.ts`, `worker.ts`.
- **Tasks**:
  1. Lifecycle integration: update `runEventLifecycleMaintenance` so that when a paid event passes its end date (`curDate > endDate`) and transitions to `COMPLETED`, `generateEventInvoice` is automatically invoked idempotently.
  2. Durable storage: create/ensure `invoices` private Supabase Storage bucket; persist rendered PDF bytes to storage bucket path `invoices/INV-YYYY-NNNNN.pdf`; support on-the-fly streaming if storage is offline.
  3. Authenticated customer endpoints:
     - `GET /api/organizations/:orgId/invoices`
     - `GET /api/invoices/:id`
     - `GET /api/invoices/:id/pdf`
     - `GET /api/events/:eventId/invoice`
  4. Authenticated Developer Admin endpoints:
     - `GET /api/developer/invoices` (with filtering, pagination)
     - `GET /api/developer/invoices/:id`
     - `POST /api/developer/invoices/:id/retry-pdf`
     - `POST /api/developer/invoices/:id/retry-email`
     - `POST /api/developer/invoices/:id/credit-notes`
     - `GET /api/developer/invoice-settings`
     - `PUT /api/developer/invoice-settings`
  5. Dual-runtime parity between Express (`server.ts`) and Cloudflare Workers (`worker.ts`).
- **Gate Output**: Integration tests verifying API access, tenant isolation, and cron auto-generation.

#### Phase 4: Customer Dashboard, Developer Admin Interface & Email
- **Files**:
  - `src/components/events/EventCard.tsx` / `EventDetailsModal` / `OrganizationWalletPage.tsx`
  - `src/components/developer/DeveloperInvoicesManager.tsx`
  - `src/components/developer/DeveloperInvoiceSettings.tsx`
  - `src/components/developer/DeveloperAdminPage.tsx`
  - `src/lib/api.ts`
  - `server/email/invoiceEmailTemplate.ts`
- **Tasks**:
  1. Add invoice inspection & PDF download affordance on completed events in the customer dashboard.
  2. Create Developer Admin Invoices list and details view with retry buttons and credit note issuance modal.
  3. Create Developer Admin Seller Settings editor for billing details.
  4. Update Resend email template destination URL to resolve to `/events?invoice=INV-XXXX` or authenticated download.
- **Gate Output**: Verified UI flows without dead clicks, clean responsive layouts, and proper error handling.

#### Phase 5: Verification, Tests & Deployment Readiness
- **Files**: `server/db/invoices.test.ts`, `AI_CHANGELOG.md`, `/docs/ai/business_rules/payment_flow.md`.
- **Tasks**:
  1. Run comprehensive test suite covering all 18+ required test cases:
     - Event not ended
     - Event completed in non-UTC timezone (e.g. SGT UTC+8)
     - Cancelled event (must be rejected)
     - Duration-based pricing verification
     - Missing or invalid price rejection
     - Welcome credit, showcase credit, top-up credit application
     - Paid and unpaid balance calculations
     - Refunds and credit note adjustments
     - Currency isolation (MYR vs SGD vs USD)
     - Concurrent generation idempotency
     - Cross-tenant access denial
     - Developer Admin RBAC
  2. Run `bun run build` and `bun run lint` to guarantee clean compilation.
  3. Compile final completion report with UAT migration checklist and remaining legal entity confirmations.

---

### Implementation Status: COMPLETED ✅

All 5 phases have been completed and verified:
1. **Phase 1: Deep Audit & Verification** — Schema constraints, database migration `20261019000000`, payment modes, and wallet transaction structures fully audited.
2. **Phase 2: Correct Billing, Numbering & Database Persistence** — Decimal-safe arithmetic implemented, atomic sequential numbering (`INV-YYYY-NNNNN`, `CN-YYYY-NNNNN`), and seller billing settings integrated.
3. **Phase 3: Lifecycle Automation, Storage & Authenticated APIs** — Automated invoice hook attached to `runEventLifecycleMaintenance` for completed paid events; private Supabase Storage `invoices` bucket integration; full Express (`server.ts`) and Cloudflare Worker (`worker.ts`) API parity.
4. **Phase 4: Customer Dashboard, Admin Console & Email Notifications** — Interactive `EventInvoiceModal` integrated into `EventCard.tsx`; full Developer Admin management portal `/developer/invoices` with retry controls, line-item details, credit note issuance, and seller settings; Resend email template.
5. **Phase 5: Comprehensive Verification & UAT Checklist** — 23 unit and integration tests passing (`server/db/invoices_phase2.test.ts` and `server/db/invoices_phase5.test.ts`), `bun run lint` passing (0 errors), `compile_applet` build succeeded.

#### UAT Migration & Deployment Checklist
- [x] Apply migration `supabase/migrations/20261019000000_create_event_invoices_and_credit_notes.sql` to Supabase.
- [x] Ensure private Supabase Storage bucket `invoices` is provisioned.
- [x] Configure official company registration and SST details in `/developer/invoices` (Settings tab).
- [x] Ensure background maintenance cron calls `runEventLifecycleMaintenance` periodically.
