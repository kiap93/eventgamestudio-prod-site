# Technical Systems: Centralized Notification System Architecture

This document details the design, implementation, and operational rules of the **Centralized Notification System** in **Event Game Studio**.

---

## 1. Architectural Overview & Single Ingress Principle

The notification system follows the **Single Ingress Principle**:
All business domains (wallet, events, themes, leaderboards, showcases, team security) must NEVER write directly to notification storage or instantiate notifications ad-hoc. All notifications flow through the singleton `NotificationDispatcher`.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        BUSINESS DOMAIN MODULES                         │
│   (Payments, Events Lifecycle, Wallets, Leaderboard, Showcases, Auth)  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ dispatchNotificationEvent(event)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   CENTRAL NOTIFICATION DISPATCHER                     │
│                (server/notifications/dispatcher.ts)                    │
│                                                                        │
│  1. Payload Resolution (Type mapping, templates, metadata)             │
│  2. Recipient Resolution (Owner isolation, admin broadcast)            │
│  3. Deduplication & Idempotency Key Engine                             │
└───────────────┬───────────────────┬───────────────────┬────────────────┘
                │                   │                   │
                ▼                   ▼                   ▼
    ┌──────────────────────┐ ┌──────────────┐ ┌───────────────────┐
    │  In-App Storage      │ │ Email (Log/  │ │ Push Alert        │
    │  Adapter             │ │ Resend)      │ │ Adapter           │
    │  (server/db/         │ │ Adapter      │ │ (Urgent Security) │
    │   notifications.ts)  │ └──────────────┘ └───────────────────┘
    └───────────┬──────────┘
                │
                ▼
    ┌──────────────────────┐
    │ Supabase Database    │
    │ (public.notifications│
    │  + Realtime channel) │
    └──────────────────────┘
```

---

## 2. Notification Catalog & Business Event Types

Every notification dispatched on the platform must be registered in the authoritative **Notification Catalog** (`src/lib/notifications/types.ts` & `server/notifications/types.ts`). The catalog is the **single source of truth** for all 21 platform notification types, their visual metadata, priority, retention, and expiration behavior:

| Notification Type | Category | Priority | Default Retention | Expires by Default | Default Expiry Window | Deduplication Policy | Recipient Target |
|---|---|---|---|---|---|---|---|
| `welcome_credit_added` | `wallet` | `normal` | 365 days | `false` | None (Permanent) | Deduplicated by user/org | Org Members / Owner |
| `payment_success` | `billing` | `high` | 365 days | `false` | None (Permanent) | Deduplicated by reference ID | Billing Actor / Owner |
| `payment_pending` | `billing` | `normal` | 90 days | `true` | 3 days | Deduplicated by order ID | Order Creator |
| `payment_failed` | `billing` | `urgent` | 365 days | `false` | None (Permanent) | Deduplicated by reference/order ID | Billing Actor / Owner |
| `event_created` | `event` | `normal` | 90 days | `false` | None (Permanent) | Deduplicated by event ID | Org Admins & Owner |
| `event_approaching` | `event` | `normal` | 90 days | `true` | 3 days | Deduplicated by event ID + start date | Org Admins & Owner |
| `event_live` | `event` | `high` | 90 days | `true` | 7 days | Deduplicated by event ID | Org Admins & Owner |
| `event_expiring` | `event` | `high` | 90 days | `true` | 2 days | Daily window deduplication | Org Admins & Owner |
| `event_expired` | `event` | `normal` | 90 days | `false` | None (Permanent) | Deduplicated by event ID | Org Admins & Owner |
| `event_payment_failed` | `billing` | `urgent` | 365 days | `false` | None (Permanent) | 1-minute window deduplication | Org Admins & Owner |
| `wallet_low_balance` | `wallet` | `high` | 90 days | `true` | 14 days | Daily window deduplication | Org Admins & Owner |
| `insufficient_balance` | `wallet` | `high` | 90 days | `true` | 7 days | 1-minute window deduplication | Billing Actor / Owner |
| `theme_ready` | `theme` | `low` | 180 days | `false` | None (Permanent) | Deduplicated by theme ID | Theme Creator / Org |
| `showcase_draft_created` | `showcase` | `normal` | 180 days | `false` | None (Permanent) | Deduplicated by showcase ID | **Showcase Owner Only** |
| `showcase_published` | `showcase` | `normal` | 180 days | `false` | None (Permanent) | Deduplicated by showcase ID | **Showcase Owner Only** |
| `showcase_unpublished` | `showcase` | `normal` | 180 days | `false` | None (Permanent) | Deduplicated by showcase ID | **Showcase Owner Only** |
| `showcase_updated` | `showcase` | `low` | 180 days | `false` | None (Permanent) | 1-minute window deduplication | **Showcase Owner Only** |
| `org_invitation` | `security` | `normal` | 365 days | `false` | None (Permanent) | Deduplicated by org ID + invitee email | Invitee User |
| `team_member_invited` | `security` | `normal` | 365 days | `false` | None (Permanent) | Deduplicated by org ID + invitee email | Invitee User |
| `member_joined` | `security` | `normal` | 365 days | `false` | None (Permanent) | Deduplicated by org ID + member user ID | Org Admins & Owner |
| `security_settings_changed` | `security` | `urgent` | 365 days | `false` | None (Permanent) | 1-minute window deduplication | Targeted User / Admins |

---

## 3. Centralized Notification Expiry Architecture & Expiry vs. Retention Separation

The platform enforces a strict separation between **Visibility Expiration (`expires_at`)** and **Storage Retention (`retentionDays`)**:

### A. Visibility Expiration (`expires_at`)
- **Purpose**: Controls when a notification is no longer relevant for the user to see in their inbox or notification bell.
- **Rule**:
  ```text
  Active Notification Condition:
  expires_at IS NULL OR expires_at > NOW()
  ```
- **Authoritative Catalog Source**:
  - Every catalog item defines `expiresByDefault: boolean` and optional `defaultExpiryDays: number`.
  - Non-expiring types (invitations, payments, receipts, security alerts, permanent milestones) explicitly have `expiresByDefault: false` and `expires_at = NULL`.
  - Time-sensitive types (pending orders, live events, approaching alerts, temporary low-balance warnings) have `expiresByDefault: true` with a catalog-defined `defaultExpiryDays`.
  - `calculateNotificationExpiry(type, explicitExpiresAt)` in `src/lib/notifications/types.ts` is the single canonical computation engine.
- **Query Enforcements**:
  - `listNotifications`: Always queries `(expires_at IS NULL OR expires_at > NOW())`. Expired alerts are hidden from pagination and inbox lists.
  - `getUnreadNotificationCount`: Badge counts only include active unread notifications.
  - `markNotificationAsRead` / `markAllNotificationsAsRead`: Only active notifications can be marked as read.

### B. Storage Retention (`retentionDays`)
- **Purpose**: Governs physical record cleanup from the database (`public.notifications`) for storage optimization and compliance.
- **Rule**: Notifications are only purged from physical storage when `created_at < NOW() - INTERVAL '<retentionDays> days'`.
- **Decoupling**:
  - An expired notification (`expires_at < NOW()`) is NOT deleted from the database immediately. It remains in storage until its retention period elapses.
  - A non-expiring notification (`expires_at IS NULL`) is purged only when its full retention period (e.g. 365 days) has passed.
  - Cleanup is executed via the server-authoritative `cleanup_notifications_retention()` stored procedure or `cleanupNotificationsByRetention()` DB helper.

---

## 4. Recipient Isolation & Security Boundary Rules

1. **Showcase Recipient Isolation**:
   - Showcase rewards and showcase publishing are strictly account-owner-level actions.
   - `SHOWCASE_DRAFT_CREATED`, `SHOWCASE_PUBLISHED`, `SHOWCASE_UNPUBLISHED`, and `SHOWCASE_UPDATED` strictly resolve to `showcase.owner_user_id`. They do NOT broadcast to non-owner organization members.
2. **Multi-Tenant Scoping**:
   - Notifications created with an `organization_id` strictly partition visibility.
   - Queries and list operations verify the recipient's authenticated `user_id` and matching `organization_id`.
3. **Security Alert Escalation**:
   - `SECURITY_SETTINGS_CHANGED` carries `urgent` priority and automatically invokes both the primary storage adapter and the urgent push channel adapter.

---

## 4. Idempotency & Deduplication Engine

To eliminate duplicate alerts from network retries, webhooks, or rapid UI saves:
- **Composite Deduplication Key**:
  Notifications generate deterministic deduplication keys:
  - Payments: `payment_success_${referenceId}_${userId}`
  - Pending Orders: `payment_pending_${orderId}_${userId}`
  - Events: `event_created_${eventId}_${userId}`, `event_live_${eventId}_${userId}`
  - Expiring Warnings: `event_expiring_${eventId}_${todayDate}_${userId}`
  - Showcase Updates: `showcase_updated_${showcaseId}_${minuteBucket}_${userId}`
- **Deduplication Enforcement**:
  `NotificationDispatcher` checks for prior existing records matching `(recipient_user_id, deduplication_key)` before inserting and before triggering external channel adapters. If matched, the dispatch is safely suppressed.

---

## 5. Storage Layer & API Endpoints

### Database Schema (`public.notifications`)
- `id` (UUID, Primary Key)
- `recipient_user_id` (UUID, Foreign Key to `public.users.id`, Index)
- `organization_id` (UUID, Nullable, Index)
- `type` (TEXT, NOT NULL)
- `category` (TEXT, NOT NULL)
- `title` (TEXT, NOT NULL)
- `message` (TEXT, NOT NULL)
- `priority` (TEXT, NOT NULL, DEFAULT `'normal'`)
- `action_url` (TEXT, Nullable)
- `entity_type` (TEXT, Nullable)
- `entity_id` (TEXT, Nullable)
- `metadata` (JSONB, DEFAULT `'{}'::jsonb`)
- `is_read` (BOOLEAN, DEFAULT `false`, Index)
- `read_at` (TIMESTAMPTZ, Nullable)
- `deduplication_key` (TEXT, Nullable, Index)
- `created_at` (TIMESTAMPTZ, DEFAULT `now()`, Index)
- `expires_at` (TIMESTAMPTZ, Nullable, Index)

### REST Endpoints
Supported across both Node.js Express (`server.ts`) and Cloudflare Workers (`worker.ts`):
- `GET /api/notifications` — List notifications with filtering (`category`, `unreadOnly`, `organizationId`, pagination).
- `GET /api/notifications/unread-count` — Fast count of unread notifications.
- `POST /api/notifications/:id/read` — Mark single notification as read.
- `POST /api/notifications/mark-all-read` — Mark all notifications as read for current user/org.
- `DELETE /api/notifications/:id` — Delete a notification.
- `POST /api/developer/notifications/test-dispatch` — Privileged developer endpoint for testing dispatches across all 20 types.

---

## 6. Frontend Architecture

- **`NotificationProvider`** (`src/context/NotificationContext.tsx`):
  - Manages notifications state, unread badge count, active filters, and modal view states.
  - Subscribes to Supabase Realtime channel `notifications_for_<userId>` with instant state updates on incoming INSERTs.
  - Performs optimistic UI updates when marking as read or deleting, with silent background synchronization.
- **`NotificationBell`** (`src/components/notifications/NotificationBell.tsx`):
  - Compact header widget displaying animated unread pill counter badge.
  - Flyout panel with quick-action links, category indicators, and unread toggle.
- **`NotificationCenterModal`** (`src/components/notifications/NotificationCenterModal.tsx`):
  - Full-screen / centered workspace modal with full-text search, category tabs, mark-all-read action, and direct navigation links.
