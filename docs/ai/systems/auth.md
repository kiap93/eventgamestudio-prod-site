# Technical Systems: Authentication & Role-Based Access Control

This document details the authentication protocols, JWT token issuance, session restoration, organization-level RBAC, and route guards in **Event Game Studio**, verified against `server/auth.ts`, `src/context/AuthContext.tsx`, and `src/App.tsx`.

---

## 1. Authentication Architecture

Event Game Studio utilizes **Google Identity Services (GSI) OAuth 2.0** on the client coupled with **Server-Signed HS256 JWT Access Tokens**:

```
┌─────────────────────────────────┐
│       Browser Client (SPA)      │
│  Google GSI Login Popup/Prompt  │
└────────────────┬────────────────┘
                 │
      1. Receives Google ID Token (credential)
                 │
                 ▼
┌─────────────────────────────────┐
│     POST /api/auth/google       │
│  (server.ts / worker.ts)        │
└────────────────┬────────────────┘
                 │
      2. Server verifies Google ID token via Google JWKS (verifyGoogleJwt)
      3. Upserts user in public.users table
      4. Queries active organization membership (public.organization_members)
      5. Signs custom HS256 JWT (signAppToken) with 7-day expiration
                 │
                 ▼
┌─────────────────────────────────┐
│  Returns { token, user, org }   │
│  Client saves in localStorage:  │
│  localStorage.setItem(          │
│    'app_token', token           │
│  )                              │
└─────────────────────────────────┘
```

---

## 2. JWT Structure & Storage

### Token Payload (`AppJWTPayload`)
The server signs tokens using `jose` with the secret key `JWT_SECRET` (256-bit):
```typescript
interface AppJWTPayload {
  sub: string;             // User UUID (references public.users.id)
  organizationId?: string; // Active Organization UUID
  role?: OrgRole;          // Role in organization ('owner' | 'admin' | 'designer' | 'member' | 'viewer')
  iat?: number;            // Issued-at Unix timestamp
  exp?: number;            // Expiration Unix timestamp (default: 7 days)
}
```

### Token Storage & Transport
- **Storage**: The token is stored in the browser's `localStorage` under the key `'app_token'`.
- **Legacy Fallback**: `apiFetch` in `src/lib/api.ts` also checks `localStorage.getItem('durian_app_token')` as a migration fallback.
- **Request Transport**: Sent via the standard HTTP Authorization header:
  `Authorization: Bearer <app_token>`

---

## 3. Session Restoration & Validation

On initial page load, `AuthContext.tsx` validates the persisted session:
1. Reads `app_token` from `localStorage`.
2. If present, calls `GET /api/auth/me`.
3. Backend middleware `authenticateJWT`:
   - Decodes and cryptographically verifies the token using `JWT_SECRET`.
   - Fetches the current user profile from `public.users`.
   - Fetches all organizations the user belongs to from `public.organization_members`.
4. If token is invalid or expired:
   - Backend returns `401 Unauthorized`.
   - Client clears `localStorage.removeItem('app_token')` and resets auth state to unauthenticated.

---

## 4. Organization Roles & Permissions (RBAC)

The platform enforces 5 distinct organization roles defined in `public.organization_members`:

| Role | Hierarchy | Capabilities |
| :--- | :--- | :--- |
| **`owner`** | Level 5 (Highest) | Full control: delete organization, transfer ownership, manage billing, purchase licenses, invite members, edit all themes and events. |
| **`admin`** | Level 4 | Operational control: manage billing, purchase licenses, invite members, create/edit all events and themes. |
| **`designer`**| Level 3 | Creative control: create and edit themes, customize game visuals, assets, and canvas layouts. Cannot manage billing or invite members. |
| **`member`** | Level 2 | Standard access: create events, view live leaderboards, submit showcases. Cannot manage billing or alter organization settings. |
| **`viewer`** | Level 1 (Lowest) | Read-only access: inspect event dashboards, view reports and leaderboards. Cannot edit themes or events. |

### Server Authorization Middleware (`server/auth.ts`)
- **`requireAuth`**: Ensures valid JWT and sets `req.user`.
- **`requireOrgMember(allowedRoles)`**: Ensures `req.user` is a member of the target organization with at least one of the specified roles:
  ```typescript
  app.post(
    '/api/organizations/:orgId/wallet/pay-event',
    requireAuth,
    requireOrgMember(['owner', 'admin']),
    handlePayEvent
  );
  ```

---

## 5. Developer Admin Privileges

Platform-wide developer administrators bypass organization restrictions to manage platform pricing, global themes, email settings, and moderation:

### Developer Identification Rules:
1. `user.is_developer === true` in `public.users` table.
2. OR `user.email` matches the comma-separated `DEVELOPER_EMAILS` environment variable.
3. Server guard: `requireDeveloperAdmin` middleware returns `403 Forbidden` if neither condition is satisfied.
4. Client guard: Developer routes (`/developer/*`) redirect non-admin users to `/events`.

---

## 6. Public vs. Authenticated Access Matrix

| Route / Resource | Auth Requirement | Security Guard |
| :--- | :--- | :--- |
| **Marketing Landing** (`/`) | Public | None |
| **Public Game Kiosk** (`/play/:publicToken`) | Public | Valid public token; Setup Day & Paid status verified by API |
| **Public Leaderboard** (`/api/public/events/:token/high-scores`) | Public | Rate-limited; live scores only |
| **Claim Invitation** (`/accept-invite?token=...`) | Public Token | Verifies invitation token from email |
| **Organizer Preview** (`/events/:id/preview`) | Authenticated | Requires org membership; quarantine test scores |
| **Studio Workspace** (`/events`, `/themes`, `/wallet`) | Authenticated | Requires valid JWT; redirects to `/login` if unauthenticated |
| **Developer Admin** (`/developer/*`) | Developer Admin | Server & client checks `is_developer === true` |

---

## 7. Frontend Route Guards (`src/App.tsx`)

Routing decisions in `src/App.tsx` evaluate against `AuthContext`:
- **Unauthenticated Users**:
  - Requesting protected routes (`/events`, `/wallet`, `/themes`) $\rightarrow$ Redirects to `/login`.
  - Can freely view `/play/*`, `/e/*`, `/accept-invite`, and `/`.
- **Users Without Organization**:
  - Authenticated user whose `organizations.length === 0` $\rightarrow$ Redirects to `/create-organization`.
- **Active Organization Context**:
  - Selected organization is stored in `AuthContext` and synced to `localStorage.getItem('active_org_id')`.
  - Switching organizations updates the active JWT via `POST /api/auth/switch-org`.
