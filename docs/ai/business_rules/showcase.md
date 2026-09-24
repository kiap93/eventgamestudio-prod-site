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

The platform strictly decouples **Public Visibility**, **Admin Event Review**, and **Financial Rewards**:

```
                                  [ Organizer Publishes Showcase ]
                                                │
                                                ▼
                                    ┌───────────────────────┐
                                    │  Publication Status:  │
                                    │  PUBLISHED            │
                                    └───────────┬───────────┘
                                                │
                                  Instantly Live & Public (Self-Serve)
                                                │
                ┌───────────────────────────────┴───────────────────────────────┐
                ▼                                                               ▼
    ┌───────────────────────┐                                       ┌───────────────────────┐
    │  Admin Event Review:  │                                       │  Reward Status:       │
    │  SUBMITTED / PENDING  │                                       │  AWAITING_APPROVAL    │
    │  (Quality Feedback)   │                                       │  (Owner First Event)  │
    └───────────┬───────────┘                                       └───────────┬───────────┘
                │                                                               │
    Admin Reviews Event Quality                                     Admin Reviews Reward Eligibility
                │                                                               │
        ┌───────┴───────┐                                               ┌───────┴───────┐
        ▼               ▼                                               ▼               ▼
   [ APPROVED ]   [ REJECTED ]                                    [ REWARDED ]    [ REJECTED ]
    Quality OK     Feedback Sent                                  RM300 credit     No credit
   (Showcase stays published)                                     to org wallet   (Showcase stays live)
```

### Inviolable Invariants
1. **No Visibility Approval Gate**: Organizers can create, upload media to, and publish their showcase immediately once the event has started (is LIVE or COMPLETED, and PAID). There is NO upfront approval required for a showcase to become publicly visible.
2. **Reactive Content Moderation**: Showcase content is presumed valid upon publication. Platform developer admins intervene only to **block** (`BLOCKED`) or **delete** (`DELETED`) inappropriate content (TOS, copyright, illegal material).
3. **Owner-Level First-Event Reward**: The **RM300 Showcase Reward** is tied to the **Account Owner** (`owner_user_id`), NOT the organization. An account owner is eligible for at most **one** showcase reward in their lifetime across all organizations they own or create. Reward review strictly requires that the event has **COMPLETED**.
4. **Three Fully Decoupled Workflows**:
   - **Showcase Publishing** (`status`: `DRAFT`, `PUBLISHED`, `UNPUBLISHED`, `BLOCKED`, `DELETED`) is self-serve once the event starts.
   - **Admin Event Review** (`review_status`: `DRAFT`, `SUBMITTED`, `APPROVED`, `REJECTED`) is an editorial quality review.
   - **Reward Approval** (`reward_status` / `reward_review_status`: `NOT_ELIGIBLE`, `AWAITING_APPROVAL`, `REWARDED`, `REJECTED`) is a financial decision tracked in `owner_showcase_rewards` evaluated after event completion.
   - Rejecting an event review or reward NEVER unpublishes or blocks the showcase!

---

## 3. Status Matrices

### Content / Publication Status (`status`, `publication_status`)
Controls visibility of the showcase:
- `DRAFT`: Showcase created by organizer; visible only to authenticated organization members.
- `PUBLISHED`: Publicly live. Content is accessible.
- `UNPUBLISHED`: Reverted to hidden state by organizer.
- `BLOCKED`: Blocked by platform developer admin due to policy violations (TOS, copyright, inappropriate imagery). Cannot be viewed publicly or re-published by organizer without admin unblocking.
- `DELETED`: Soft-deleted by organizer or administrator.

### Admin Event Review Status (`review_status`)
Controls editorial and quality assessment of the event activation:
- `DRAFT`: Organizer is assembling case study notes.
- `SUBMITTED`: Organizer submitted event details for platform quality review.
- `APPROVED`: Developer admin verified high-quality event activation.
- `REJECTED`: Quality feedback given to organizer. Does NOT unpublish the showcase.

### Reward Status (`reward_status` / `reward_review_status`)
Controls financial reward tracking at the Account Owner level:
- `NOT_ELIGIBLE`: Account owner already received their lifetime reward, or event does not meet requirements.
- `AWAITING_APPROVAL`: First completed event by this account owner meeting all criteria, queued for reward audit.
- `REWARDED`: Admin approved reward; RM300 showcase credit deposited into the organization's wallet and recorded in `owner_showcase_rewards`.
- `REJECTED`: Admin rejected reward (e.g. fraudulent or insufficient media); showcase remains published without credit.

---

## 4. Showcase Reward Eligibility Criteria

To qualify for `AWAITING_APPROVAL` status and receive the **RM300 showcase credit**, all of the following rules MUST be satisfied (`evaluateShowcaseRewardEligibility` in `server/db/showcases.ts`):

1. **One Reward Per Account Owner Lifetime (`owner_user_id`)**:
   - The account owner must NOT have previously received a showcase reward (`owner_showcase_rewards` table must have no existing record for this `owner_user_id`).
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

To prevent race conditions, double payouts, and ledger desynchronization, reward approval runs inside a single PostgreSQL stored procedure (`approve_first_event_showcase_reward_atomic` in migration `20260906040000`):

```sql
SELECT * FROM public.approve_first_event_showcase_reward_atomic(
  p_showcase_id => '...',
  p_reviewer_id => '...',
  p_feedback    => 'Approved activation photos'
);
```

### Procedure Actions (ACID Transaction):
1. Acquires row locks (`FOR UPDATE`) on `event_showcases` and `organization_wallets`.
2. Resolves `owner_user_id` from `event_showcases` or `organizations.owner_id`.
3. Verifies that neither `owner_showcase_rewards` nor `user_rewards(user_id, 'SHOWCASE_CREDIT')` contains `owner_user_id`.
4. Verifies that `showcase.reward_status` is `AWAITING_APPROVAL` (or `PENDING`).
5. Atomically inserts records into:
   - `owner_showcase_rewards(owner_user_id, showcase_id, organization_id, amount, ...)`
   - `user_rewards(user_id, 'SHOWCASE_CREDIT', organization_id, amount, ...)`
6. Credits `showcase_credit` by `RM300.00` and sets `showcase_credit_granted = true` in `organization_wallets`.
7. Inserts an immutable transaction row into `wallet_transactions` with `transaction_type = 'SHOWCASE_CREDIT'` and `owner_user_id`.
8. Updates `event_showcases.reward_status = 'REWARDED'`, `reward_amount = 300.00`, and `reward_granted_at = now()`.
9. Inserts an entry into `showcase_moderation_logs`.

> **Critical Lifetime Reward Preservation**:
> In `owner_showcase_rewards`, `organization_id`, `event_id`, and `showcase_id` foreign keys are configured with `ON DELETE SET NULL`. If an organization, event, or showcase is subsequently deleted, the reward record remains permanently anchored to `owner_user_id`, guaranteeing that deleting an entity can NEVER reset the owner's lifetime reward eligibility.

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

### Account Owner First-Event Showcase Reward Banner
- **Component**: `src/components/events/EventsPage.tsx`
- **Route**: `/events` (Event Deployments / Events Page)
- **Position**: Placed immediately below the Metrics Summary Cards and directly above Search/Filters & Event List.
- **Lifetime Scoping**: Evaluates the authenticated user's lifetime reward status from `/api/user/showcase-reward-status` (`getOwnerShowcaseRewardStatus(user.id)`). Never scoped by organization ID or wallet balance.
- **Owner Scope**: Visible strictly to organization owners (`currentOrganization?.role === 'owner'`). Hidden for non-owner members (`admin`, `designer`, `viewer`).
- **Event Count Independence**: Displays regardless of event count (e.g. `events.length === 0`, initial empty state, or active events before reward claim).
- **CTA Action**: "Deploy First Event" invokes the canonical `CreateEventDialog` flow (`setIsCreateOpen(true)`).
- **Zero Side-Effects**: Purely read-only onboarding presentation; rendering or dismissing never writes records, credits wallets, or mutates review states.

---

## 8. Database Tables & Defense-in-Depth Security

| Table | Purpose |
| :--- | :--- |
| `public.event_showcases` | Core showcase record with status, reward_status, metrics |
| `public.event_showcase_media` | Associated media attachments with display order |
| `public.owner_showcase_rewards` | Authoritative ledger enforcing one showcase reward per owner lifetime |
| `public.user_rewards` | Centralized user-level promotional ledger (type: 'SHOWCASE_CREDIT') |
| `public.showcase_moderation_logs` | Audit trail of all admin moderation and reward decisions |
| `trg_prevent_event_showcase_unauthorized_client_mutations` | Trigger blocking direct client mutations on `event_showcases` while securely allowing `service_role` backend connections across PostgREST JWT claims, role settings, and SECURITY DEFINER RPCs |

---

## 9. Authoritative Backend Publish Flow (`publish_event_showcase_atomic`)

To ensure atomic self-service publication and defense against race conditions, the backend uses a dedicated PostgreSQL stored procedure (`publish_event_showcase_atomic` in migration `20260929000000`):

```sql
SELECT * FROM public.publish_event_showcase_atomic(
  p_event_id       => '...',
  p_title          => '...',
  p_description    => NULL,
  p_client_name    => NULL,
  p_client_logo_url => NULL,
  p_cover_image_url => NULL,
  p_owner_user_id  => '...'
);
```

### Key Properties:
- **SECURITY DEFINER Context**: Executes with elevated database privileges so the operation is not rejected by `trg_prevent_event_showcase_unauthorized_client_mutations`.
- **Nullable Metadata Support**: Allows `description`, `client_name`, `client_logo_url`, and `cover_image_url` to be `null` without throwing database nullability or validation errors.
- **Atomic Upsert Logic**: Performs a row-lock (`FOR UPDATE`) on any existing showcase for the event. If found, updates metadata and transitions status to `PUBLISHED`. If none exists, performs an atomic insert with unique-violation conflict handling.
- **Idempotent Self-Service**: Multiple publish invocations safely update metadata and maintain `status = 'PUBLISHED'` and `publication_status = 'PUBLISHED'`.
- **Decoupled Workflows**: Does not require editorial event review or reward approval. If an existing showcase is `BLOCKED`, publication is rejected with `SHOWCASE_BLOCKED` (HTTP 403).

