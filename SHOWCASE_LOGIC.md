# Event Showcase Lifecycle, Moderation & Reward Logic Specification

**Document Version:** 1.0.0  
**Status:** Approved Architectural Blueprint (Pre-Implementation)  
**Target Platform:** Event Game Studio (Node.js/Express + Cloudflare Workers + Supabase/PostgreSQL)  
**Last Updated:** September 2026  

---

## Executive Summary & Core Principle

In Event Game Studio, an **Event Showcase** represents a real-world case study or marketing activation report uploaded by an event organizer (brand, agency, or event producer) showcasing photos, videos, attendee turnout, and venue execution of their interactive game installation.

### Core Principle: "Publish First, Moderate When Necessary" 

```
[ USER UPLOAD / SAVE ]
          │
          ▼
 [ SHOWCASE PUBLISHED ] ───► Publicly Viewable Instantly (No Admin Waiting)
          │
    (If Inappropriate)
          ▼
[ ADMIN MODERATION ] ─────► BLOCKED or DELETED (Preserved with Audit Trail)
```

1. **Unrestricted Upload & Immediate Publishing**: Normal Showcase uploads do **NOT** require admin pre-approval. Organizers should never be forced to wait for platform administrator approval before their showcase appears publicly in galleries, portfolios, or event summaries.
2. **Strict Separation of Visibility vs. Reward**:
   - **Showcase Visibility Approval does NOT exist.** Content is published immediately upon organizer action.
   - **First Event Case Reward Approval is strictly isolated.** Admin review applies **ONLY** to the organizer's **first eligible Event Showcase RM300 Reward Credit**. Subsequent showcases do not enter an admin approval queue for visibility or reward.
3. **Reactive Moderation**: Content is published by default; if inappropriate or abusive content is uploaded, administrators can block or delete the showcase post-publication.

---

## 1. Existing System Architecture Analysis

An exhaustive inspection of the codebase reveals the current baseline implementation:

### 1.1 Existing Database Tables & Schema

#### A. Table `public.event_showcases` (`supabase/migrations/20260903000000_initial_baseline.sql`)
```sql
CREATE TABLE IF NOT EXISTS public.event_showcases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL UNIQUE REFERENCES public.events(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  client_name TEXT,
  client_logo_url TEXT,
  cover_image_url TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'UNPUBLISHED')),
  review_status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (review_status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED')),
  publication_status TEXT NOT NULL DEFAULT 'UNPUBLISHED' CHECK (publication_status IN ('UNPUBLISHED', 'PUBLISHED')),
  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  rejection_reason TEXT,
  reward_transaction_id UUID REFERENCES public.wallet_transactions(id) ON DELETE SET NULL,
  reward_granted_at TIMESTAMPTZ,
  reward_status TEXT DEFAULT 'PENDING' CHECK (reward_status IN ('PENDING', 'REWARDED', 'NOT_ELIGIBLE')),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
```

#### B. Table `public.event_showcase_media`
```sql
CREATE TABLE IF NOT EXISTS public.event_showcase_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  showcase_id UUID NOT NULL REFERENCES public.event_showcases(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL CHECK (media_type IN ('IMAGE', 'VIDEO')),
  media_url TEXT NOT NULL,
  storage_path TEXT,
  thumbnail_url TEXT,
  file_name TEXT NOT NULL,
  file_size BIGINT NOT NULL CHECK (file_size > 0),
  mime_type TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
```

#### C. Table `public.organization_wallets` & `public.wallet_transactions`
- **`organization_wallets`**:
  - `paid_balance`: Cash balance topped up via payment gateway.
  - `showcase_credit`: Promotional credit balance specifically for approved showcases (default RM0.00).
  - `showcase_credit_granted`: Boolean flag indicating whether the one-time showcase reward has been awarded.
- **`wallet_transactions`**:
  - `transaction_type`: `'SHOWCASE_CREDIT'`
  - `balance_type`: `'SHOWCASE_CREDIT'`
  - `amount`: `300.00` (RM300)
  - `reference_id`: Unique idempotency identifier (e.g., `showcase_${organizationId}`)
  - Unique Constraint: `ux_wallet_txns_org_reference ON (organization_id, reference_id) WHERE reference_id IS NOT NULL;`

### 1.2 Existing Codebase Inconsistency & Architectural Flaw

In the current code (`server/db/showcases.ts`, `server.ts`, `worker.ts`, and `EventShowcaseTab.tsx`):
1. **Showcase Visibility and Reward Approval Are Coupled**:
   - `submitShowcaseForReview` locks the showcase in `review_status = 'SUBMITTED'`.
   - Normal users are prevented from editing while submitted.
   - Admin approval (`approveShowcaseReview`) simultaneously sets `review_status = 'APPROVED'`, `publication_status = 'PUBLISHED'`, `status = 'PUBLISHED'`, and triggers `grantShowcaseCredit`.
   - **Flaw**: This creates an unnecessary "pending admin approval" bottleneck. A user cannot simply publish their showcase; they must wait for an administrator to review and approve the post before the public can view it.
2. **Missing Moderation States**:
   - The status column only supports `'DRAFT'`, `'PUBLISHED'`, and `'UNPUBLISHED'`.
   - There is no `'BLOCKED'` state for administrative moderation.
   - Deletion in `deleteShowcase` is a hard `DELETE FROM event_showcases`, destroying audit history.
   - There is no moderation audit log storing moderator ID, reason, and action timestamp.

---

## 2. Official Showcase Lifecycle & Status Model

### 2.1 Showcase Visibility States

The system will decouple content visibility from financial reward status. The authoritative Showcase Visibility lifecycle is defined by four states:

| Status | Public Visibility | Org Member Visibility | Description | Permitted Transitions |
| :--- | :--- | :--- | :--- | :--- |
| **`PUBLISHED`** (Active) | **Visible** | **Visible** | Normal active state. Immediately accessible by public URL, gallery, and visitors. | `-> UNPUBLISHED`<br>`-> BLOCKED`<br>`-> DELETED` |
| **`UNPUBLISHED`** (Draft) | **Hidden** | **Visible** | Author voluntary private state. Only organization members can view/edit. | `-> PUBLISHED`<br>`-> DELETED` |
| **`BLOCKED`** | **Hidden** | **Visible (Flagged)** | Administrative moderation action due to policy violations. Normal users cannot unblock. | `-> PUBLISHED` (Admin unblock only)<br>`-> DELETED` |
| **`DELETED`** | **Hidden** | **Hidden** | Soft-deleted record. Removed from all user and public feeds; preserved for audit. | *Terminal state* (Archived) |

> **Note on Naming**: While the prompt references `ACTIVE / PUBLISHED`, the database already standardizes on `'PUBLISHED'` for active state and `'UNPUBLISHED'` for draft state. Adding `'BLOCKED'` and `'DELETED'` to the `status` enum provides backwards-compatible parity without breaking existing frontend or reporting queries.

### 2.2 Permissions Matrix for Visibility Status Transitions

| Triggering Actor | Permitted Action | Source Status | Target Status | Validation / Conditions |
| :--- | :--- | :--- | :--- | :--- |
| **Org Owner / Admin** | Upload & Publish | None | `PUBLISHED` | Title required, event must belong to organization. |
| **Org Owner / Admin** | Unpublish | `PUBLISHED` | `UNPUBLISHED` | Voluntary hide by author. |
| **Org Owner / Admin** | Re-publish | `UNPUBLISHED` | `PUBLISHED` | Allowed if showcase is NOT `BLOCKED`. |
| **Org Owner / Admin** | Delete Own Showcase | `PUBLISHED` / `UNPUBLISHED` | `DELETED` | Soft-deletes showcase; removes media pointers. |
| **Normal User / Org** | Unblock Showcase | `BLOCKED` | `PUBLISHED` | **STRICTLY FORBIDDEN (403 Forbidden).** |
| **Developer Admin** | Block Showcase | `PUBLISHED` / `UNPUBLISHED` | `BLOCKED` | Requires mandatory rejection/block reason. |
| **Developer Admin** | Unblock Showcase | `BLOCKED` | `PUBLISHED` | Admin restores showcase after appeal or edit. |
| **Developer Admin** | Delete Showcase | Any | `DELETED` | Administrative purge/removal with audit reason. |

---

## 3. First Event Case Reward Architecture

### 3.1 Strict Separation of Concerns & Rules

$$\text{Showcase Publishing Eligibility} \neq \text{First Event Case Reward Eligibility}$$

The platform establishes two cleanly decoupled eligibility boundaries:

1. **Showcase Creation & Publishing Eligibility** (`isEventEligibleForShowcase`):
   - **Trigger**: The event has **STARTED** (is `LIVE` or `COMPLETED`, `current_date >= start_date` in Asia/Singapore UTC+8).
   - **Payment Rule**: The event must have `payment_status === 'PAID'`.
   - **Behavior**: 100% self-serve. Organizers can create the showcase, upload event photos/videos, edit descriptions, and publish immediately once the event is underway.
   - **Ineligible States**: `DRAFT`, `PENDING_PAYMENT` / unpaid, `SCHEDULED` (before event start date), `EXPIRED` (unpaid after end date), and `CANCELLED`.

2. **Reward Review & Approval Eligibility** (`isEventEligibleForShowcaseReward`, `evaluateShowcaseRewardEligibility`):
   - **Trigger**: The event has **COMPLETED** (is `COMPLETED`, `current_date > end_date` in Asia/Singapore UTC+8).
   - **Payment Rule**: The event must have `payment_status === 'PAID'`.
   - **Behavior**: While an event is still `LIVE`, the showcase can be published and viewed publicly, but reward review remains in `NOT_ELIGIBLE` status (*"Reward review is available once the event has completed"*). Once the event concludes, the showcase is automatically evaluated for the First-Event Case Reward audit.

### 3.2 Reward Qualification Rules

An Event Showcase qualifies for First Event Case Reward evaluation (`AWAITING_APPROVAL`) if and only if **ALL** of the following conditions are met:
1. **First-Time Account Owner Reward**: The account owner (`owner_user_id`) has never received a showcase credit across any organization (`owner_showcase_rewards` and `user_rewards` contain no completed `SHOWCASE_CREDIT`).
2. **Paid Event Requirement**: The associated event must have `payment_status === 'PAID'` (free or test events cannot generate paid reward credits).
3. **Completed Event Window**: The event has **COMPLETED** (`status === 'completed'` / `COMPLETED`, `current_date > end_date` in UTC+8). Live or scheduled events do not qualify for reward review until completion.
4. **Media Completeness**: The showcase has at least **3 high-resolution photos or 1 video clip** uploaded to its gallery.
5. **Content Completeness**: Showcase has a non-empty `title`, `description` ($\ge 50$ characters), and verified client/event details.
6. **Not Blocked**: The showcase is in `PUBLISHED` status (not `BLOCKED` or `DELETED`).

### 3.3 Reward Lifecycle States (`reward_review_status`)

To prevent overloading the content `status` field, the reward workflow uses a dedicated ledger state:

| State | Meaning | User Experience | Admin Action |
| :--- | :--- | :--- | :--- |
| **`NOT_ELIGIBLE`** | Organization already claimed its one-time reward on a previous event, or event does not qualify. | Showcase is published normally. No reward banner. | None required. |
| **`AWAITING_APPROVAL`** | Showcase meets first-event criteria and is queued for developer admin reward audit. | Showcase is live. Banner indicates: *"First Event Showcase Reward under review."* | Admin reviews media authenticity and event proof. |
| **`REWARDED`** | Developer admin approved the reward. RM300 promotional credit granted. | Wallet credited with RM300 Showcase Credit. Success badge shown. | Complete. Idempotently locked. |
| **`REJECTED`** | Developer admin determined media was fraudulent, stock photos, or invalid. | Showcase remains live (unless also blocked), but reward denied with feedback. | Admin provides mandatory reason. |

---

## 4. Financial & Wallet Reward Engine Integration

### 4.1 Authoritative Reward Amount & Rules

The showcase reward utilizes the existing financial ledger infrastructure defined in `server/db/wallet.ts`:
- **Reward Value**: `SHOWCASE_CREDIT_AMOUNT = 300.00` (RM300.00).
- **Balance Type**: `SHOWCASE_CREDIT` (separate from `PAID_BALANCE`, `WELCOME_CREDIT`, and `TOPUP_CREDIT`).
- **Non-Withdrawable**: Showcase credit cannot be cashed out or refunded.
- **Application**: Can be applied toward future event activations up to RM300 max per event, reducing the cash required from `paid_balance`.
- **One-Time Only**: Each **Account Owner (`owner_user_id`)** is entitled to exactly **one** lifetime first-event showcase reward across all organizations they own or create. Tracked authoritatively in `owner_showcase_rewards`.

### 4.2 Idempotency & Concurrency Guarantees

To ensure bulletproof protection against duplicate awards, race conditions, or replay attacks:

```
[ Admin Clicks "Approve Reward" ]
              │
              ▼
[ Server Authenticates Developer Admin ]
              │
              ▼
[ Check organization_wallets.showcase_credit_granted ]
       ├── If TRUE ──► Return { alreadyRewarded: true } (Zero State Mutation)
       └── If FALSE
              │
              ▼
[ BEGIN Database Transaction ]
              │
    SELECT * FROM wallet_transactions 
    WHERE organization_id = $orgId 
      AND transaction_type = 'SHOWCASE_CREDIT' 
      AND status = 'COMPLETED'
    FOR UPDATE;
              │
       ├── If Record Exists ──► Rollback & Return alreadyRewarded: true
       └── If None Found
              │
              ▼
    INSERT INTO wallet_transactions (
      organization_id, event_id, transaction_type, balance_type,
      amount, status, reference_id, description, metadata, created_by
    ) VALUES (
      $orgId, $eventId, 'SHOWCASE_CREDIT', 'SHOWCASE_CREDIT',
      300.00, 'COMPLETED', 'showcase_' || $orgId,
      'One-time Event Showcase completion reward credit of RM300.00',
      ..., $adminId
    );
              │
              ▼
    UPDATE organization_wallets
    SET showcase_credit = showcase_credit + 300.00,
        showcase_credit_granted = true,
        updated_at = NOW()
    WHERE organization_id = $orgId;
              │
              ▼
    UPDATE event_showcases
    SET reward_review_status = 'REWARDED',
        reward_status = 'REWARDED',
        reward_transaction_id = $txnId,
        reward_granted_at = NOW()
    WHERE id = $showcaseId;
              │
              ▼
[ COMMIT Database Transaction ]
```

- **Unique DB Index**: `ux_wallet_txns_org_reference` on `(organization_id, reference_id)` guarantees that even if concurrent requests bypass application locks, the database rejects the second write with a unique constraint violation (`23505`).
- **Reference Identifier**: Stored as `showcase_${organization_id}`.

---

## 5. Administrative Moderation & Sensitive Content

### 5.1 Moderation Philosophy
1. **Public Default**: Users are trusted to upload authentic event photos.
2. **Rapid Takedown (Block)**: If a showcase contains spam, copyright infringement, explicit media, or false event data, administrators can instantaneously toggle `status = 'BLOCKED'`.
3. **Immediate Public Revocation**: RLS policies and server endpoints immediately drop blocked showcases from public feeds, search queries, and direct permalinks.
4. **Preservation of Evidence**: Blocked records and their uploaded media pointers are **never** hard-deleted immediately. They remain in the database with status `BLOCKED` and full moderation metadata so platform administrators can audit abuse, handle customer disputes, or preserve evidence.

### 5.2 Moderation Audit Trail

Every moderation intervention must be recorded in an immutable audit ledger (`showcase_moderation_logs`):
- `id`: UUID PRIMARY KEY
- `showcase_id`: Foreign key to `event_showcases.id`
- `moderator_id`: User ID of the administrator
- `action`: `'BLOCK'` | `'UNBLOCK'` | `'DELETE'` | `'RESTORE'`
- `reason`: Mandatory text explaining the violation (e.g., *"Inappropriate imagery"*, *"Copyright claim"*, *"Spam"*)
- `created_at`: Timestamp (UTC)

### 5.3 User Exposure & Information Hiding
- **Public Visitors**: Receive standard `404 Not Found` when requesting a blocked or deleted showcase. No internal moderation details or administrative comments are ever disclosed.
- **Organization Dashboard**: Displays a neutral warning banner: *"This showcase is currently unavailable because it has been flagged for moderation. Please contact support if you believe this is an error."* Internal moderator notes remain hidden from regular users unless specifically designated as customer-facing feedback.

---

## 6. User Roles & Permission Matrix

The platform recognizes three operational permission tiers:

| Capability | Regular User / Org Member (`member`, `designer`, `viewer`) | Organization Admin / Owner (`admin`, `owner`) | Developer / Platform Admin (`is_developer === true`) |
| :--- | :---: | :---: | :---: |
| **Upload / Create Showcase** | No (Read-only for viewer/member) | **Yes** | **Yes** |
| **Publish / Unpublish Own Showcase** | No | **Yes** | **Yes** |
| **Edit Own Active Showcase** | No | **Yes** | **Yes** |
| **Delete Own Showcase (Soft Delete)** | No | **Yes** | **Yes** |
| **View Own Showcase (Any Status)** | **Yes** (Member of org) | **Yes** | **Yes** |
| **View Public Showcases (`PUBLISHED`)** | **Yes** | **Yes** | **Yes** |
| **View Blocked Showcases** | No (Hidden from public) | Only flagged warning in dashboard | **Yes** (Full moderation view) |
| **Block / Suspend Any Showcase** | **No** (Forbidden) | **No** (Forbidden) | **Yes** |
| **Unblock a Blocked Showcase** | **No** (Forbidden) | **No** (Forbidden) | **Yes** |
| **Review First-Event Reward Cases** | **No** (Forbidden) | **No** (Forbidden) | **Yes** |
| **Approve / Reject RM300 Reward** | **No** (Forbidden) | **No** (Forbidden) | **Yes** |
| **Approve Own Organization Reward** | **No** (Forbidden) | **No** (Forbidden) | **No** (Anti-Self-Approval check) |
| **View Moderation History & Logs** | **No** (Forbidden) | **No** (Forbidden) | **Yes** |

---

## 7. API Route Architecture & Security

All routes must exist in both **Node.js Express** (`server.ts`) and **Cloudflare Workers** (`worker.ts`).

### 7.1 Organizer / User Showcase Endpoints

| Method & Route | Auth & Guard | Request Body | Response & Behavior |
| :--- | :--- | :--- | :--- |
| `GET /api/events/:eventId/showcase` | Optional Bearer JWT | None | Public: returns showcase only if `status === 'PUBLISHED'`.<br>Org Member: returns showcase if `status IN ('PUBLISHED', 'UNPUBLISHED', 'BLOCKED')`. Blocked returns `is_blocked: true`. |
| `POST /api/events/:eventId/showcase` | `authenticateJWT` + Org `event.edit` | `{ title, description, client_name, client_logo_url, cover_image_url, auto_publish?: boolean }` | Creates showcase. If `auto_publish === true` (default), initializes `status = 'PUBLISHED'`. Evaluates first-event reward eligibility. |
| `PATCH /api/events/:eventId/showcase` | `authenticateJWT` + Org `event.edit` | `{ title, description, client_name, client_logo_url, cover_image_url }` | Updates showcase details. **Blocked check**: Returns `403 Forbidden` if showcase is `BLOCKED`. |
| `POST /api/events/:eventId/showcase/publish` | `authenticateJWT` + Org `event.edit` | None | Changes `status = 'PUBLISHED'`. **Blocked check**: Rejects if showcase is currently `BLOCKED`. |
| `POST /api/events/:eventId/showcase/unpublish` | `authenticateJWT` + Org `event.edit` | None | Changes `status = 'UNPUBLISHED'`. Hides from public gallery. |
| `DELETE /api/events/:eventId/showcase` | `authenticateJWT` + Org `event.edit` | None | Soft-deletes showcase (`status = 'DELETED'`, `deleted_at = NOW()`). |

### 7.2 Media Upload Endpoints

| Method & Route | Auth & Guard | Request Body | Response & Behavior |
| :--- | :--- | :--- | :--- |
| `POST /api/events/:eventId/showcase/media/upload-url` | `authenticateJWT` + Org `event.edit` | `{ fileName, fileType, fileSize }` | Generates signed presigned URL for direct Supabase / R2 bucket storage. Verifies showcase is not `BLOCKED`. |
| `POST /api/events/showcase-media/direct-upload` | `authenticateJWT` + Org `event.edit` | Multipart `FormData` (`file`, `showcaseId`) | Stream upload directly to bucket with MIME and size constraints (images $\le 10\text{MB}$, videos $\le 100\text{MB}$). |
| `DELETE /api/events/:eventId/showcase/media/:mediaId` | `authenticateJWT` + Org `event.edit` | None | Deletes media asset record and storage object. |

### 7.3 Developer Admin Moderation Endpoints

All admin endpoints enforce `authenticateDeveloperAdmin` (`is_developer === true`):

| Method & Route | Auth & Guard | Request Body | Response & Behavior |
| :--- | :--- | :--- | :--- |
| `GET /api/developer/showcases` | `authenticateDeveloperAdmin` | Query: `?status=&reward_status=&search=` | Lists all platform showcases with filter by visibility (`PUBLISHED`, `BLOCKED`, `DELETED`) and reward queue. |
| `POST /api/developer/showcases/:showcaseId/block` | `authenticateDeveloperAdmin` | `{ reason: string }` | Sets `status = 'BLOCKED'`. Writes to `showcase_moderation_logs`. Immediately drops showcase from public RLS queries. |
| `POST /api/developer/showcases/:showcaseId/unblock` | `authenticateDeveloperAdmin` | `{ reason?: string }` | Restores `status = 'PUBLISHED'`. Logs action in moderation history. |
| `DELETE /api/developer/showcases/:showcaseId` | `authenticateDeveloperAdmin` | `{ reason: string }` | Sets `status = 'DELETED'`. Logs administrative deletion in moderation history. |

### 7.4 First-Event Reward Endpoints

| Method & Route | Auth & Guard | Request Body | Response & Behavior |
| :--- | :--- | :--- | :--- |
| `GET /api/developer/showcase-rewards` | `authenticateDeveloperAdmin` | Query: `?status=AWAITING_APPROVAL` | Returns list of showcases pending first-event reward review with event payment details, media count, and org details. |
| `POST /api/developer/showcase-rewards/:showcaseId/approve` | `authenticateDeveloperAdmin` | None | Idempotently executes `grantShowcaseCredit` (RM300) into organization wallet. Updates `reward_review_status = 'REWARDED'`. |
| `POST /api/developer/showcase-rewards/:showcaseId/reject` | `authenticateDeveloperAdmin` | `{ reason: string }` | Rejects reward application with mandatory explanation. Sets `reward_review_status = 'REJECTED'`. Showcase remains live. |

---

## 8. Database Schema & Migration Specification

To migrate the existing database non-destructively, we define a backward-compatible migration:

```sql
-- ==============================================================================
-- Migration: 20260906000000_showcase_moderation_and_reward_decoupling.sql
-- ==============================================================================

-- 1. Extend the status CHECK constraint on public.event_showcases
ALTER TABLE public.event_showcases 
  DROP CONSTRAINT IF EXISTS event_showcases_status_check;

ALTER TABLE public.event_showcases 
  ADD CONSTRAINT event_showcases_status_check 
  CHECK (status IN ('DRAFT', 'PUBLISHED', 'UNPUBLISHED', 'BLOCKED', 'DELETED'));

-- 2. Add Dedicated Reward and Moderation Audit Columns
ALTER TABLE public.event_showcases
  ADD COLUMN IF NOT EXISTS reward_review_status TEXT DEFAULT 'NOT_ELIGIBLE' 
    CHECK (reward_review_status IN ('NOT_ELIGIBLE', 'AWAITING_APPROVAL', 'REWARDED', 'REJECTED')),
  ADD COLUMN IF NOT EXISTS reward_reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reward_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reward_rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS moderated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS moderation_reason TEXT,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 3. Create Showcase Moderation History / Audit Table
CREATE TABLE IF NOT EXISTS public.showcase_moderation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  showcase_id UUID NOT NULL REFERENCES public.event_showcases(id) ON DELETE CASCADE,
  moderator_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('BLOCK', 'UNBLOCK', 'DELETE', 'RESTORE')),
  reason TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_showcase_mod_logs_showcase_id 
  ON public.showcase_moderation_logs(showcase_id);
CREATE INDEX IF NOT EXISTS idx_showcase_mod_logs_moderator_id 
  ON public.showcase_moderation_logs(moderator_id);
CREATE INDEX IF NOT EXISTS idx_showcase_mod_logs_created_at 
  ON public.showcase_moderation_logs(created_at DESC);

-- 4. Update Row Level Security (RLS) Policies on event_showcases
DROP POLICY IF EXISTS "Anyone can view published showcases or org members" ON public.event_showcases;
CREATE POLICY "Public can view active published showcases"
  ON public.event_showcases FOR SELECT
  USING (
    (status = 'PUBLISHED' AND deleted_at IS NULL)
    OR (public.is_org_member(organization_id) AND deleted_at IS NULL)
    OR public.is_developer_admin()
  );

-- 5. Prevent non-admins from updating BLOCKED showcases or tampering with status
DROP POLICY IF EXISTS "Owners, admins, designers can update event showcases" ON public.event_showcases;
CREATE POLICY "Owners, admins, designers can update event showcases"
  ON public.event_showcases FOR UPDATE
  USING (
    (public.get_org_role(organization_id) IN ('owner', 'admin', 'designer') AND status != 'BLOCKED' AND deleted_at IS NULL)
    OR public.is_developer_admin()
  )
  WITH CHECK (
    (public.get_org_role(organization_id) IN ('owner', 'admin', 'designer') AND status IN ('PUBLISHED', 'UNPUBLISHED'))
    OR public.is_developer_admin()
  );
```

---

## 9. State Machine Diagrams

### 9.1 Showcase Visibility & Content Lifecycle

```
                 ┌───────────────────────────┐
                 │        User Upload        │
                 │   (Creates Event Showcase)│
                 └─────────────┬─────────────┘
                               │
               ┌───────────────┴───────────────┐
               ▼                               ▼
    [ Voluntary Draft ]                 [ Auto-Publish ]
   status = 'UNPUBLISHED'              status = 'PUBLISHED'
               │                               ▲
               │ (User clicks Publish)         │ (User clicks Re-Publish)
               └───────────────────────────────┤
                                               │
                                               ▼
                                      ┌─────────────────┐
                                      │ Publicly Active │
                                      │ (In Gallery/App)│
                                      └────────┬────────┘
                                               │
                         ┌─────────────────────┴─────────────────────┐
                         │                                           │
         (Inappropriate Content Flagged)                   (Author Deletes)
                         │                                           │
                         ▼                                           ▼
               [ ADMIN MODERATION ]                          [ SOFT DELETED ]
               status = 'BLOCKED'                           status = 'DELETED'
                 (Hidden from Public)                      (Archived / Hidden)
                         │
        ┌────────────────┴────────────────┐
        ▼                                 ▼
 (Admin Unblocks)                 (Admin Deletes)
status = 'PUBLISHED'             status = 'DELETED'
```

### 9.2 First-Event Reward Approval Lifecycle

```
              ┌─────────────────────────────────────┐
              │ Organizer Publishes Event Showcase  │
              └──────────────────┬──────────────────┘
                                 │
                                 ▼
          ┌───────────────────────────────────────────────┐
          │  Check: Org Already Claimed Showcase Credit?  │
          └──────────────────────┬────────────────────────┘
                                 │
                ┌────────────────┴────────────────┐
                ▼                                 ▼
            [ YES ]                            [ NO ]
  reward_review_status =               Check: Paid Event &
      'NOT_ELIGIBLE'                   Media Count >= 3?
  (No Action Required)                            │
                                         ┌────────┴────────┐
                                         ▼                 ▼
                                      [ NO ]            [ YES ]
                                  'NOT_ELIGIBLE'  reward_review_status =
                               (Showcase is live) 'AWAITING_APPROVAL'
                                                  (Showcase is live)
                                                           │
                                                           ▼
                                                ┌─────────────────────┐
                                                │ Admin Reviews Proof │
                                                └──────────┬──────────┘
                                                           │
                                          ┌────────────────┴────────────────┐
                                          ▼                                 ▼
                                     [ REJECT ]                         [ APPROVE ]
                               reward_review_status =            reward_review_status =
                                     'REJECTED'                        'REWARDED'
                               (Showcase stays live;             Idempotently grant RM300
                                feedback to org)                  credit to Org Wallet
```

---

## 10. Frontend Architecture & User Experience

### 10.1 Organizer Event Showcase Tab (`EventShowcaseTab.tsx`)

1. **Eliminate False Barriers**:
   - Remove the requirement that users must "Submit for Review" before publishing.
   - Replace the confusing `Submit for Review` button with a clear, direct `Publish Showcase` / `Save & Publish` action.
   - Showcase becomes immediately live and provides a copyable public permalink (`https://eventgamestudio.com/showcase/:id` or `/events/:id/showcase`).
2. **First-Event Reward Status Banner**:
   - If `reward_review_status === 'AWAITING_APPROVAL'`:
     Display an informational badge:
     > **RM300 Welcome Showcase Reward Under Review**  
     > *Your showcase is published and publicly visible! Our platform team is reviewing your event photos to verify your one-time RM300 event showcase reward.*
   - If `reward_review_status === 'REWARDED'`:
     Display a celebration badge:
     > **RM300 Showcase Reward Granted**  
     > *RM300 promotional credit has been deposited into your organization wallet.*
   - If `status === 'BLOCKED'`:
     Display an administrative alert:
     > **Showcase Flagged for Moderation**  
     > *This showcase has been hidden by platform moderators. Reason: [Admin Reason]. Please contact support to resolve.*

### 10.2 Developer Admin Console (`DeveloperShowcaseReviews.tsx`)

The admin interface will be divided into two purpose-built workspaces:

1. **First-Event Reward Review Queue**:
   - Displays only showcases with `reward_review_status === 'AWAITING_APPROVAL'`.
   - Admin inspects proof of live execution, attendee turnout, and branding photos.
   - Buttons: **Approve RM300 Reward** or **Reject Reward (Requires Reason)**.
   - Approving grants the credit; rejecting denies the credit but leaves the showcase published.
2. **Platform Showcase Moderation Workspace**:
   - Displays all platform showcases with filter by status (`ALL`, `PUBLISHED`, `BLOCKED`, `DELETED`).
   - Moderation Controls:
     - **Block Showcase**: Prompts for violation reason, immediately revokes public visibility.
     - **Unblock Showcase**: Restores public visibility.
     - **Delete Showcase**: Soft-deletes showcase with audit log.

---

## 11. Edge Cases & Handling Protocols

| # | Edge Case Scenario | Expected System Behavior & Resolution Rule |
| :---: | :--- | :--- |
| **1** | **User uploads multiple Showcases** | Every showcase is published immediately. Only the first qualifying showcase triggers `AWAITING_APPROVAL`. Subsequent showcases are automatically set to `reward_review_status = 'NOT_ELIGIBLE'` and remain live without admin review. |
| **2** | **User uploads showcase before event finishes** | Showcase can be published immediately. However, reward eligibility requires the event to have taken place (`starts_at` occurred and `payment_status === 'PAID'`). Reward review remains queued until event execution is verified. |
| **3** | **User attempts to qualify for reward multiple times across events** | Idempotency guard: `showcase_credit_granted` on `organization_wallets` and database unique constraint `ux_wallet_txns_org_reference` reject any second reward grant. |
| **4** | **Showcase is blocked before reward review** | If an admin blocks a showcase for spam or explicit content, its reward status is automatically set to `REJECTED` with reason *"Showcase blocked by moderation."* |
| **5** | **Showcase is deleted before reward review** | If an organizer deletes their showcase, any pending reward evaluation is cancelled. |
| **6** | **Reward is approved, then showcase is later blocked** | The previously granted RM300 credit is not automatically revoked from the wallet (to avoid negative balance edge-cases), but an administrative audit event is logged. The showcase itself is hidden immediately. |
| **7** | **Duplicate/concurrent admin approval requests** | The SQL atomic transaction and row-level lock ensure that if two admins click approve simultaneously, exactly one transaction commits; the second returns `alreadyRewarded: true`. |
| **8** | **Normal user tries to call admin moderation API** | Guarded by `authenticateDeveloperAdmin`. Responds with `403 Forbidden: Developer admin access required`. |
| **9** | **User tries to unblock their own blocked showcase** | RLS policy `WITH CHECK` and backend route explicitly forbid updates to records with `status = 'BLOCKED'`. Attempt returns `403 Forbidden`. |
| **10** | **Direct upload to blocked showcase** | Direct upload endpoints verify the parent showcase status; uploads to blocked showcases are rejected. |
| **11** | **Unpaid Event Showcase Upload** | An organizer can upload and publish a showcase for any of their events. However, unpaid events are disqualified from receiving the RM300 cash-equivalent reward credit. |

---

## 12. Implementation Plan & Order of Execution

*(Reference: See Section 13 of prompt for staging roadmap)*

1. **Stage 1: Database Migration**
   - Apply additive migration `20260906000000_showcase_moderation_and_reward_decoupling.sql`.
   - Update RLS policies for `BLOCKED` and `DELETED` states.
   - Create `showcase_moderation_logs` table.
2. **Stage 2: Core Server Functions (`server/db/showcases.ts` & `server/db/wallet.ts`)**
   - Implement `blockShowcase`, `unblockShowcase`, and `softDeleteShowcase`.
   - Decouple `approveShowcaseReview` into `approveFirstEventReward` and `moderateShowcase`.
   - Update `createShowcase` to default to `status = 'PUBLISHED'` and evaluate `reward_review_status`.
3. **Stage 3: Dual Backend API Routes (`server.ts` and `worker.ts`)**
   - Add `/api/developer/showcases/:id/block`, `/unblock`.
   - Add `/api/developer/showcase-rewards` and `/approve`, `/reject`.
   - Update public showcase GET to filter out `BLOCKED` and `DELETED` records.
4. **Stage 4: Frontend UI Alignment**
   - Refactor `EventShowcaseTab.tsx`: publish-first flow, reward status banners, blocked notice.
   - Refactor `DeveloperShowcaseReviews.tsx`: separate reward approval queue from moderation tools.
5. **Stage 5: Test Suite Verification**
   - Update `server/db/showcase_reward.test.ts` to reflect the decoupled workflow.
   - Verify zero compile errors and lint pass.

---

*This specification establishes the official architecture for Event Game Studio's Showcase & Moderation system.*
