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

Every notification dispatched on the platform must be registered in the authoritative **Notification Catalog** (`src/lib/notifications/types.ts` & `server/notifications/types.ts`).

| Notification Type | Category | Priority | Default Retention | Duplicate Allowed | Recipient Target |
|---|---|---|---|---|---|
| `welcome_credit_added` | `wallet` | `normal` | 90 days | No | Org Members / Owner |
| `payment_success` | `billing` | `high` | 180 days | Yes (per ref) | Billing Actor / Owner |
| `payment_pending` | `billing` | `normal` | 30 days | No | Order Creator |
| `event_created` | `event` | `normal` | 90 days | No | Org Admins & Owner |
| `event_live` | `event` | `high` | 60 days | No | Org Admins & Owner |
| `event_expiring` | `event` | `high` | 30 days | Daily dedup | Org Admins & Owner |
| `event_expired` | `event` | `normal` | 60 days | No | Org Admins & Owner |
| `wallet_low_balance` | `wallet` | `high` | 30 days | Daily dedup | Org Admins & Owner |
| `theme_ready` | `theme` | `low` | 45 days | No | Theme Creator / Org |
| `leaderboard_high_score` | `leaderboard` | `normal` | 30 days | No | Org Admins & Owner |
| `showcase_draft_created` | `showcase` | `normal` | 60 days | No | **Showcase Owner Only** |
| `showcase_published` | `showcase` | `normal` | 90 days | No | **Showcase Owner Only** |
| `showcase_unpublished` | `showcase` | `normal` | 60 days | No | **Showcase Owner Only** |
| `showcase_updated` | `showcase` | `low` | 45 days | 1-min window | **Showcase Owner Only** |
| `security_settings_changed` | `security` | `urgent` | 180 days | No | Targeted User / Admins |

---

## 3. Recipient Isolation & Security Boundary Rules

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
- `POST /api/developer/notifications/test-dispatch` — Privileged developer endpoint for testing dispatches across all 12 types.

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
