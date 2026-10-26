# EventGameStudio Official Invoice Template Redesign (Pure White B2B System)

## Title & Summary
Redesign the official EventGameStudio tax invoice system across the in-app modal preview (`EventInvoiceModal.tsx`), developer management drawer (`DeveloperInvoicesManager.tsx`), transactional email (`invoiceEmailTemplate.ts`), and the authoritative PDF vector renderer (`pdfGenerator.ts`). The new design establishes a pure white background (`#FFFFFF`) corporate B2B aesthetic tailored for enterprise event clients in Malaysia, Singapore, and international markets.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The following key decisions were confirmed through interactive clarification and are locked into the blueprint:

- **Confirmed Decision 1 (Invoice Metadata Structure)**: Clean 4-column horizontal info bar with light background (`#F8FAFC`), subtle borders (`#E2E8F0`), and clear labels for Invoice Number, Issue Date, Due Date, and Status/Currency.
- **Confirmed Decision 2 (Event Details Presentation)**: Formatted as an itemized line item with event dates and duration breakdown directly within the itemized breakdown table, providing a cohesive single-table financial audit structure.
- **Confirmed Decision 3 (In-App Modal Presentation)**: White document paper sheet container (`bg-white`) inside the modal backdrop for high contrast, ensuring the invoice preview remains pure white regardless of whether the platform is in dark mode.

---

## 1. Overview & Core Concept

- **What It Does**: Replaces the previous dark-slate/amber invoice styling with a pure white (`#FFFFFF`), executive-grade B2B invoice template.
- **Target Audience / Persona**: Corporate event directors, agency producers, enterprise procurement teams, and finance/accounting departments requiring official, auditable tax invoices in Malaysia (MYR), Singapore (SGD), and international (USD) currencies.
- **Key Value**: Delivers 100% visual parity between the in-app document preview and downloaded official PDF, eliminating dark-mode visual bleed and adhering to corporate invoicing standards.

---

## 2. User Experience & Visual Design

### Mandatory Color System
- **Page & Surface Canvas**: `#FFFFFF` (pure white, no dark mode tint)
- **Primary Typography & Headings**: `#172B4D` (deep corporate navy)
- **Body Text**: `#334155` (slate 700)
- **Secondary / Meta Labels**: `#64748B` (slate 500)
- **Dividers & Table Borders**: `#E2E8F0` (slate 200 hairline border)
- **Metadata Panel Background**: `#F8FAFC` (slate 50 subtle panel)
- **Total Amount / Highlight**: `#172B4D` (large bold navy)
- **Status Badges (Restrained & Accessible)**:
  - Paid: Text `#065F46` / Border `#A7F3D0` / Background `#ECFDF5`
  - Unpaid / Pending: Text `#92400E` / Border `#FDE68A` / Background `#FFFBEB`
  - Overdue: Text `#991B1B` / Border `#FECACA` / Background `#FEF2F2`

### Layout Architecture
```
┌────────────────────────────────────────────────────────────────────────┐
│  EVENTGAMESTUDIO                         INVOICE                       │
│  Interactive Event Gaming Solutions      INV-2026-0001                 │
├────────────────────────────────────────────────────────────────────────┤
│  FROM                                    BILL TO                       │
│  Event Game Studio Sdn. Bhd.             Acme Corporation Pte Ltd      │
│  Reg: 202601009876 (1509876-V)           Attn: Sarah Tan               │
│  Level 28, The Exchange 106, TRX KL      sarah@acme.com                │
├────────────────────────────────────────────────────────────────────────┤
│  [ INVOICE NO ]     [ ISSUE DATE ]     [ DUE DATE ]     [ STATUS ]     │
│  INV-2026-0001      2026-09-02         2026-09-16       PAID [MYR]     │
├────────────────────────────────────────────────────────────────────────┤
│  DESCRIPTION                   QTY       UNIT PRICE          AMOUNT    │
│  ────────────────────────────────────────────────────────────────────  │
│  Durian Drop Interactive Game   1          RM 1,900.00     RM 1,900.00 │
│  Event: "Annual Gala 2026"                                             │
│  Duration: 2 Days (2026-09-01 - 2026-09-02)                            │
│                                                                        │
│  Welcome Credit Promotion       1         -RM   800.00    -RM   800.00 │
├────────────────────────────────────────────────────────────────────────┤
│  PAYMENT & SELLER DETAILS        │  Subtotal:              RM 1,900.00 │
│  Payment Ref: INV-2026-0001      │  Promotional Credit:   -RM   800.00 │
│  Settled via Platform Wallet     │  Tax (0.0%):            RM     0.00 │
│  Support: eventgamestudio@gmail  │  ────────────────────────────────── │
│                                  │  Total Amount:          RM 1,100.00 │
│                                  │  Amount Paid:           RM 1,100.00 │
│                                  │  Balance Due:               RM 0.00 │
├────────────────────────────────────────────────────────────────────────┤
│  Thank you for choosing EventGameStudio. • https://eventgamestudio.com │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Vector-Based Native PDF vs Headless Browser**
  - *Chosen Approach*: Maintain and enhance the pure TypeScript ISO 32000 (PDF 1.4) vector generator in `server/invoices/pdfGenerator.ts`.
  - *Why*: Runs instantaneously in Cloudflare Workers and Node.js without Puppeteer, Chrome binaries, or memory spikes. Updated with exact RGB floating-point equivalents of `#FFFFFF`, `#172B4D`, `#334155`, `#64748B`, `#E2E8F0`, and `#F8FAFC`.
  - *Alternatives Considered*: HTML-to-PDF via Puppeteer was rejected because it cannot run inside Cloudflare Worker isolates.

- **Decision 2: Strict White Paper Sheet inside Modal**
  - *Chosen Approach*: Wrap the modal invoice content in a white document sheet (`bg-white text-slate-800 rounded-xl p-8 border border-slate-200 shadow-2xl`) while keeping the modal backdrop dark (`bg-slate-950/80`).
  - *Why*: Provides clean separation, mimics physical A4 stationery, avoids eye strain, and preserves the surrounding app navigation while guaranteeing the invoice itself is 100% white.

- **Decision 3: Multi-Page Pagination Geometry in PDF**
  - *Chosen Approach*: Implement dynamic pagination calculation in `pdfGenerator.ts`. When line items exceed page capacity (taking into account header, billed to, metadata, and totals block), cleanly spill items to Page 2, repeat table header, and render `Page X of Y`.

- **Decision 4: Authentic Business Data Only**
  - *Chosen Approach*: Only display fields configured in `platform_settings` / `seller_details` and verified `customer_details`. Hide null/empty fields (e.g. tax number if 0% tax or not registered) rather than displaying placeholder strings.

---

## 4. Technical Architecture & File Strategy

```
┌──────────────────────────────────────────────────────────────┐
│                    EventGameStudio Platform                  │
└──────────────┬───────────────────────────────┬───────────────┘
               │                               │
       Frontend Preview                Backend PDF & Email
               │                               │
   ┌───────────┴───────────┐       ┌───────────┴───────────┐
   │ EventInvoiceModal     │       │ pdfGenerator.ts       │
   │ (Pure White Sheet UI) │       │ (ISO 32000 White A4)  │
   ├───────────────────────┤       ├───────────────────────┤
   │ DeveloperInvoices-    │       │ invoiceEmail-         │
   │ Manager Drawer        │       │ Template.ts           │
   └───────────────────────┘       └───────────────────────┘
```

### Components to Update:
1. `server/invoices/pdfGenerator.ts`:
   - Replace `#0b1329` dark background with `#FFFFFF` pure white canvas.
   - Update typography to `#172B4D` (headings) and `#334155` (body).
   - Draw the 4-column metadata panel with `#F8FAFC` background and `#E2E8F0` border.
   - Refactor line items table to render event dates/duration subtitle in the item row.
   - Add multi-page pagination support with table header repetition and `Page X of Y`.
   - Update totals block with navy headers and subtle dividers.
   - Update footer with "Thank you for choosing EventGameStudio."

2. `src/components/events/EventInvoiceModal.tsx`:
   - Replace dark slate preview (`bg-slate-950`) with a white paper document card (`bg-white`).
   - Match colors `#172B4D`, `#334155`, `#64748B`, `#E2E8F0`, and `#F8FAFC`.
   - Implement the 4-column metadata bar and right-aligned financial summary.
   - Ensure the printed / previewed layout matches the PDF layout precisely.

3. `src/components/developer/DeveloperInvoicesManager.tsx`:
   - Update the invoice inspection detail drawer to render the same white document card structure.

4. `server/email/invoiceEmailTemplate.ts`:
   - Sync email template styling to pure white B2B layout with `#172B4D` and `#334155`.

---

## 5. Verification Plan

1. **Unit & Integration Tests**:
   - Run `bun test server/invoice_pdf_auth.test.ts` to ensure PDF authentication and permission guards are preserved.
   - Run `bun test server/db/invoices.test.ts` and `server/db/invoices_phase2.test.ts` to ensure invoice calculations and credit notes remain untouched.
2. **Visual & Structural Verification**:
   - Verify generated PDF byte stream starts with `%PDF-1.4` and renders pure white background (`1.0 1.0 1.0 rg`).
   - Verify multi-page pagination logic if line items exceed single-page height.
   - Verify in-app modal preview renders pure white sheet inside `EventInvoiceModal.tsx`.
   - Verify developer drawer in `DeveloperInvoicesManager.tsx`.
3. **Applet Compilation**:
   - Run `compile_applet` / `npm run build` to verify clean TypeScript compilation with zero errors.
