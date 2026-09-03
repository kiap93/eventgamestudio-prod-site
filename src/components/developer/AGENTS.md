# Developer & Superadmin Panel — Local Agent Guidelines

**Applies to**: `/src/components/developer/` and `/server/db/platformSettings.ts`

This document defines the rules for implementing and maintaining developer admin tools, platform configuration, and superadmin controls.

---

## 1. Server-Side Authorization Mandate

- **Strict Privilege Verification**: Every developer endpoint under `/api/developer/*` MUST verify that the authenticated user possesses superadmin/developer privileges:
  - `user.is_developer === true` or email matches configured `DEVELOPER_EMAILS`.
- **No Client-Only Protection**: Route guarding in React (`DeveloperAdminLayout.tsx`) is for navigation convenience only. All write and read operations must be protected server-side.

---

## 2. Platform Pricing & Duration Tier Management

Managed in `DeveloperPricingManager.tsx` and backed by `platform_settings` / `server/db/platformSettings.ts`:

- **Platform Base Price**:
  - Global default base price for 1-day event licenses (default: RM1,400).
- **Duration Pricing Tiers (`pricing_rules`)**:
  - Array of `EventPricingRule` items with `min_days`, `max_days` (or `null` for unlimited), `price`, `currency`, and `active` status.
  - Rules must always be sorted in ascending order of `min_days`.
  - At least one active tier rule must always exist.
- **Custom Event Overrides**:
  - Developers can set custom locked rates (`event_price`, `is_custom_price = true`) on individual events without affecting other events in the organization.
- **Pricing Simulator**:
  - The duration simulator in the developer panel tests date range calculations against active duration tiers in real time.

---

## 3. System Themes & Global Game Templates

- **System Themes** (`is_system = true`, `organization_id = null`):
  - Created and edited exclusively by developer admins.
  - Act as immutable reference templates that organizations can preview or clone.
  - Must specify `game_id` and `game_type` correctly so they map to the intended game engine.

---

## 4. Lifecycle Maintenance Worker

- **Automated / Manual Maintenance**:
  - Cancels expired unpaid draft events whose scheduled end date has passed.
  - Marks expired live events as `COMPLETED`.
  - Restores or reactivates events upon administrative request with audit logging (`cancel_reason`, `updated_at`).
