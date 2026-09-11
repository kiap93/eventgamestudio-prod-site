# Business Rules: Event Showcase & Moderation Pipeline

This document details the architecture, lifecycle states, moderation models, and reward mechanisms of the **Event Showcase** subsystem in **Event Game Studio**, verified against `server/db/showcases.ts`, `server/db/showcaseMedia.ts`, `SHOWCASE_LOGIC.md`, and migrations `20260906000000` through `20260906030000`.

---

## 1. What is an Event Showcase?

An **Event Showcase** is a post-event marketing case study created by event organizers to document and display real-world event activations. It highlights:
- High-resolution event photographs (kiosk booth, attendees playing, branding).
- Event video recap (YouTube/Vimeo embed or uploaded video).
- Activation metrics: estimated attendance, number of kiosk game plays, client/brand name.
- Event summary and qualitative testimonials.

---

## 2. Core Architectural Principle: "Publish First, Moderate Later"

The platform strictly decouples **Public Visibility** from **Financial Rewards**:

```
                                  [ Organizer Publishes Showcase ]
                                                │
                                                ▼
                                    ┌───────────────────────┐
                                    │  Content Status:      │
                                    │  PUBLISHED            │
                                    └───────────┬───────────┘
                                                │
                                  Instantly Live & Public
                                                │
                                                ▼
                                    ┌───────────────────────┐
                                    │  Reward Status:       │
                                    │  AWAITING_APPROVAL    │
                                    │  (If Eligible)        │
                                    └───────────┬───────────┘
                                                │
                                    Admin Reviews for Reward Only
                                                │
                        ┌───────────────────────┴───────────────────────┐
                        ▼                                               ▼
            ┌───────────────────────┐                       ┌───────────────────────┐
            │   REWARD APPROVED     │                       │    REWARD REJECTED    │
            │  RM300 credit granted │                       │  Showcase stays live, │
            │  to organization      │                       │  no credit granted    │
            └───────────────────────┘                       └───────────────────────┘
```

### Inviolable Invariants
1. **No Visibility Approval Gate**: Organizers can publish their showcase immediately once the event has concluded. There is NO upfront approval required for a showcase to become publicly visible.
2. **Reactive Moderation**: Showcase content is presumed valid upon publication. Platform developer admins intervene only to **block** (`BLOCKED`) or **delete** (`DELETED`) inappropriate content.
3. **Decoupled Reward Review**: The developer admin review workflow (`DeveloperShowcaseReviews.tsx`) is solely for determining whether the organization qualifies for the **RM300 showcase reward credit**. Rejecting a reward does NOT unpublish or hide the showcase.

---

## 3. Status Matrices

### Content Status (`status`)
Controls visibility of the showcase:
- `DRAFT`: Showcase created by organizer; visible only to authenticated organization members.
- `PUBLISHED`: Publicly live. Content is accessible.
- `UNPUBLISHED`: Reverted to hidden state by organizer.
- `BLOCKED`: Blocked by platform developer admin due to policy violations (TOS, copyright, inappropriate imagery). Cannot be viewed publicly or re-published by organizer without admin unblocking.
- `DELETED`: Soft-deleted by organizer or administrator.

### Reward Status (`reward_status`)
Controls financial reward tracking:
- `NOT_ELIGIBLE`: Organization does not meet criteria (e.g. event was unpaid, not completed, or organization already received their one-time showcase reward).
- `AWAITING_APPROVAL`: Showcase meets automatic criteria and is queued for developer admin review.
- `REWARDED`: Admin approved reward; RM300 showcase credit deposited into wallet.
- `REJECTED`: Admin rejected reward (e.g. blurry photos, placeholder text, fake booth setup); showcase remains published without credit.

---

## 4. Showcase Reward Eligibility Criteria

To qualify for `AWAITING_APPROVAL` status and receive the **RM300 showcase credit**, all of the following rules MUST be satisfied (`evaluateShowcaseRewardEligibility` in `server/db/showcases.ts`):

1. **One Reward Per Organization Lifetime**:
   - The organization must NOT have previously received a showcase reward (`organization_wallets.showcase_credit_granted === false`).
2. **Paid Event Only**:
   - The associated event must have `payment_status = 'PAID'`. Free or comped activations do not qualify.
3. **Completed Event Window**:
   - Current date must be past the event end date (`current_date > end_date` in UTC+8).
4. **Minimum Media Quantity**:
   - Showcase must contain at least **3 uploaded photos** or **1 video + 2 photos** in `event_showcase_media`.
5. **Meaningful Content**:
   - Non-empty client/brand name, non-empty event summary ($>50$ characters), and estimated attendee count.

---

## 5. Atomic Reward Approval RPC

To prevent race conditions, double payouts, and ledger desynchronization, reward approval runs inside a single PostgreSQL stored procedure (`approve_first_event_showcase_reward_atomic` in migration `20260906030000`):

```sql
SELECT * FROM public.approve_first_event_showcase_reward_atomic(
  p_showcase_id => '...',
  p_reviewer_id => '...',
  p_feedback    => 'Approved activation photos'
);
```

### Procedure Actions (ACID Transaction):
1. Acquires row locks (`FOR UPDATE`) on `event_showcases` and `organization_wallets`.
2. Verifies that `wallet.showcase_credit_granted` is still `false`.
3. Verifies that `showcase.reward_status` is `AWAITING_APPROVAL`.
4. Credits `showcase_credit` by `RM300.00` and sets `showcase_credit_granted = true`.
5. Inserts an immutable transaction row into `wallet_transactions` with `transaction_type = 'SHOWCASE_REWARD'`.
6. Updates `event_showcases.reward_status = 'REWARDED'`, `reward_amount = 300.00`, and `reviewed_at = now()`.
7. Inserts an entry into `showcase_moderation_logs`.

---

## 6. Media Handling & Storage Limits

Managed via `server/db/showcaseMedia.ts` and Supabase Storage bucket `showcase-media`:
- **Allowed Mime Types**: JPEG, PNG, WebP, GIF, MP4, WebM. (SVG is rejected to prevent XSS).
- **Max File Size**:
  - Images: 10 MB
  - Videos: 50 MB
- **Magic Bytes Validation**: Files undergo binary magic-byte verification on the backend before being written to storage.
- **Direct Client Upload Defense**: Direct client uploads to storage buckets are blocked via RLS; uploads must route through the backend API (`POST /api/events/:eventId/showcase/media`).

---

## 7. Frontend Interface & Routing Gaps

### Organization Showcase Management / Editor
- **Component**: `src/components/events/EventShowcasePage.tsx`
- **Route**: `/events/:eventId/showcase`
- **Access**: Embedded within `DashboardLayout.tsx`. Requires authenticated organization membership (`owner`, `admin`, or `member`).
- **Features**: Media upload zone with drag-and-drop, photo reordering, YouTube embed parser, metric inputs, and live preview card. Includes direct "View Public Showcase" action to open `/showcase/:showcaseId` in a new tab.

### Public Showcase View Page
- **Component**: `src/components/events/PublicShowcaseView.tsx`
- **Route**: `/showcase/:showcaseId` (or `/s/:showcaseId`)
- **Access**: Unauthenticated public route (configured in `src/hooks/useRouteContext.ts` and `src/App.tsx` via `routeContext.mode === 'public_showcase'`).
- **Authorization Rule**: Read-only presentation. Accessible without login if `showcase.status === 'PUBLISHED'` and content is not `BLOCKED` or `DELETED`. Organization members / developers can view unpublished drafts with an ambient `[PREVIEW MODE]` indicator badge.
- **Features**: Full-bleed hero banner, interactive photo grid with full-screen lightbox modal, video player, activation metrics cards, client testimonials, and native social share/link copying.

### Developer Admin Showcase Portal
- **Component**: `src/components/developer/DeveloperShowcaseReviews.tsx`
- **Route**: `/developer/showcases`
- **Access**: Restricted to verified developer admins (`user.is_developer === true`).
- **Features**: Filter by reward status (`AWAITING_APPROVAL`, `REWARDED`, `REJECTED`), media inspector, one-click reward approval/rejection with feedback. Provides direct links to the public showcase view.

---

## 8. Database Tables & Defense-in-Depth Security

| Table | Purpose |
| :--- | :--- |
| `public.event_showcases` | Core showcase record with status, reward_status, metrics |
| `public.event_showcase_media` | Associated media attachments with display order |
| `public.showcase_moderation_logs` | Audit trail of all admin moderation and reward decisions |
| `trg_prevent_event_showcase_unauthorized_client_mutations` | Trigger blocking direct client mutations on `event_showcases` |
