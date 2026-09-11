# Event Game Studio — AI-to-AI System Documentation

Welcome to the master AI documentation system for **Event Game Studio**. This documentation is specifically designed for AI coding agents to navigate, understand, and safely modify this codebase without violating architectural invariants, security boundaries, or multi-tenant isolation.

---

## What is Event Game Studio?

**Event Game Studio** is a multi-tenant B2B SaaS platform for interactive event mini-games, custom branded physical kiosk activations, live leaderboard management, and duration-based event licensing.

Key capabilities include:
- **Game Engine**: Browser-based interactive HTML5/Canvas arcade games (`catch-brand`, `memory-match`, `reaction-tap`) optimized for touchscreens, iPads, tablets, and kiosks.
- **Studio Customizer**: In-browser visual studio for customizing themes, assets (catcher, falling objects, cards, backgrounds), audio, branding, and a 1024×576 logical canvas editor for Start and Result screens.
- **Event Lifecycle & Licensing**: Timezone-aware (Asia/Singapore UTC+8) calendar scheduling, Setup Day pre-event testing, duration-based pricing tiers, and public kiosk links.
- **Financial & Wallet Engine**: Multi-tenant wallet architecture separating real cash balances from promotional credits (welcome, top-up reward, showcase reward) with atomic PostgreSQL transactions.
- **Live Leaderboard & Anti-Cheat**: Session-validated score submissions, separate quarantine for organizer test scores, automatic test score clearing on live open, and live tournament boards.
- **Event Showcases**: Post-event marketing case study reports with photos, videos, and an automated first-event reward pipeline.

---

## What This Documentation System Is For

This documentation serves as the **authoritative single source of truth for AI agents** working on Event Game Studio. 

Because Event Game Studio is an enterprise full-stack platform featuring dual backend runtimes (Node.js/Express + Cloudflare Workers), sophisticated database-level security triggers, and strictly separated financial ledgers, code edits must never be made based on surface-level assumptions. Every agent must consult these documents to understand:
1. Exact business rules and life cycles before modifying data flows.
2. The dual-runtime requirements (`server.ts` and `worker.ts`).
3. Database invariants, backend-write-only security triggers, and RPC procedures.
4. Game engine architecture, coordinate systems, and theme resolution pipelines.

---

## Source-of-Truth Hierarchy

When sources of information conflict within this repository, all AI agents MUST adhere to this strict precedence order:

1. **Actual running/application implementation** (the verified runtime behavior in `src/`, `server/`, `server.ts`, and `worker.ts`)
2. **Database schema and migrations** (`supabase/migrations/*.sql`)
3. **API implementation and test suites** (`server/db/*.test.ts`, `server/*.test.ts`)
4. **Existing documentation** (`EVENT_LIFECYCLE.md`, `SHOWCASE_LOGIC.md`, `AGENTS.md`, `docs/*.md`)
5. **Inline code comments**
6. **Historical changelogs and commit messages**

> **Rule**: Historical documentation or comments must NEVER override current runtime code or database constraints. If an implementation diverges from older documentation, the actual implementation is authoritative.

---

## Documentation Map

The documentation is organized into two primary divisions: **Business Rules** (domain logic, money flows, lifecycle states) and **Technical Systems** (runtime architectures, UI engines, APIs, and schemas).

```
/docs/ai/
├── README.md                     # Master AI entry point & navigation guide (this file)
├── architecture.md               # High-level full-stack architecture & runtime topology
├── business_rules/
│   ├── event_flow.md             # Authoritative event lifecycle, dates, and access windows
│   ├── payment_flow.md           # Pricing resolution, checkout, and payment confirmation
│   ├── wallet.md                 # Multi-ledger wallet model, top-ups, and ACID deductions
│   ├── scores.md                 # Live vs Test score lifecycle, clearing, and anti-cheat
│   └── showcase.md               # Showcase publication, media management, and reward reviews
├── systems/
│   ├── games.md                  # Game definitions, registry, lifecycle, and configs
│   ├── game_ui.md                # 1024×576 canvas, scaling, stage, HUD, and editors
│   ├── themes.md                 # System vs Org themes, asset roles, and resolver engine
│   ├── auth.md                   # Google OAuth, JWT sessions, RBAC, and route guards
│   ├── api.md                    # Complete endpoint reference for Express and Cloudflare
│   └── database.md               # PostgreSQL schema, backend-write-only RLS, and RPCs
├── deployment.md                 # Cloud Run, Cloudflare Workers, Bun lockfile, and env vars
└── known_issues.md               # Verified architectural gaps, technical debt, and bugs
```

### Business Rules vs. Technical Systems

| Document | Category | Core Purpose |
| :--- | :--- | :--- |
| `business_rules/event_flow.md` | Business Rules | Date calculation (UTC+8), Setup Day, status transitions, live gating |
| `business_rules/payment_flow.md`| Business Rules | Dynamic tier pricing, checkout claiming, payment status vs event status |
| `business_rules/wallet.md` | Business Rules | Cash balance vs promotional credits, idempotency, wallet deduction flow |
| `business_rules/scores.md` | Business Rules | Quarantine of test scores, auto-clearing on Setup Day, leaderboard rules |
| `business_rules/showcase.md` | Business Rules | "Publish first, moderate later", first-showcase RM300 reward criteria |
| `systems/games.md` | Technical System | Game registry, configuration schemas, engine interfaces, adding games |
| `systems/game_ui.md` | Technical System | 1024×576 canvas math, uniform scaling, start/result visual editors |
| `systems/themes.md` | Technical System | Theme cloning, asset slots, default fallbacks, custom uploads |
| `systems/auth.md` | Technical System | JWT structure, bearer authentication, organization roles, route protection |
| `systems/api.md` | Technical System | Exhaustive API endpoint index with parameters, auth, and response codes |
| `systems/database.md` | Technical System | Tables, columns, RLS policies, write-defense triggers, atomic RPCs |
| `deployment.md` | Operations | Bun 1.4.0, Cloud Run container vs Worker edge, build pipeline, env secrets |
| `known_issues.md` | Quality / Audit | Verified gaps, incomplete stubs, and architectural discrepancies |

---

## Documents to Read for Common Tasks

Before modifying code, read the specific documents relevant to your task:

| If your task involves... | Mandatory Reading Sequence |
| :--- | :--- |
| **Adding or modifying a Game** | `systems/games.md` → `systems/game_ui.md` → `systems/themes.md` |
| **Modifying Event creation or scheduling** | `business_rules/event_flow.md` → `business_rules/payment_flow.md` → `systems/api.md` |
| **Editing pricing or payment logic** | `business_rules/payment_flow.md` → `business_rules/wallet.md` → `systems/database.md` |
| **Updating Wallet or Credit balances** | `business_rules/wallet.md` → `systems/database.md` → `systems/api.md` |
| **Modifying High Scores or Leaderboards** | `business_rules/scores.md` → `business_rules/event_flow.md` → `systems/api.md` |
| **Working on Theme Studio or Visual Editors**| `systems/game_ui.md` → `systems/themes.md` → `systems/games.md` |
| **Updating Showcase or Moderation** | `business_rules/showcase.md` → `systems/database.md` → `systems/api.md` |
| **Modifying Authentication or RBAC** | `systems/auth.md` → `systems/database.md` → `systems/api.md` |
| **Changing Server Endpoints or Middlewares** | `systems/api.md` → `architecture.md` → `deployment.md` *(Check both Express and Worker!)* |
| **Updating Database Migrations or Policies** | `systems/database.md` → `systems/auth.md` → `architecture.md` |

---

## AI Change Workflow

All AI coding agents modifying this codebase MUST follow this 9-step protocol:

```
[1. Read README.md]
        │
        ▼
[2. Identify Affected Subsystem]
        │
        ▼
[3. Read Relevant /docs/ai/*.md Documents]
        │
        ▼
[4. Read Relevant Entries in /AI_CHANGELOG.md]
        │
        ▼
[5. Inspect Actual Implementation (Read-Before-Write)]
        │
        ▼
[6. Make the Smallest Safe Surgical Change]
        │
        ▼
[7. Test & Validate Functionality (bun test / bun run build)]
        │
        ▼
[8. Update /docs/ai/*.md if Architecture or Behavior Changed]
        │
        ▼
[9. Append Change Entry to /AI_CHANGELOG.md]
```

### Protocol Steps:
1. **Read `/docs/ai/README.md`**: Confirm scope, rules, and document mappings.
2. **Identify the affected subsystem**: Determine if the task touches business rules, game engines, UI, or backend runtimes.
3. **Read the relevant documentation**: Review the subsystem documents completely before writing code.
4. **Read `/AI_CHANGELOG.md`**: Review recent historical changes to avoid regressing recent fixes.
5. **Inspect the actual implementation**: Call `view_file` on existing files. Never guess interfaces, imports, or variable names.
6. **Make the smallest safe change**: Edit code surgically. Maintain dual-runtime parity (`server.ts` and `worker.ts`).
7. **Test the affected functionality**: Run targeted test suites (`bun test <file>`), `bun run lint` (`tsc --noEmit`), and `bun run build`.
8. **Update documentation**: If architecture, endpoints, or rules changed, update the relevant `/docs/ai/*.md` file.
9. **Append to `/AI_CHANGELOG.md`**: Record the date, change summary, affected files, and validation results.
