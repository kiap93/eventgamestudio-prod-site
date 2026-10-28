# Implementation Plan — Random Target Arcade Game Engine

Develop a complete, production-ready **Random Target Arcade** game engine for EventGameStudio. Players tap or click dynamically spawned positive targets to earn points while dodging negative penalty targets. The game supports two high-polish curated themes (**Desert Quick Draw** and **Ocean Treasure Hunt**) powered by a single unified, data-driven game engine.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The following key decisions were confirmed through interactive requirements clarification:
> - **Interaction Tool Reaction**: The bottom-right tool (Desert Pistol / Ocean Fishing Rod) rotates dynamically toward the tapped target coordinates and executes an animated projectile/cast sequence while keeping target hit registration immediate and responsive.
> - **Target Appearance Animation**: Targets spawn dynamically inside the safe arena zone using a lively pop-in scale-bounce animation (`scale: 0 -> 1.15 -> 1.0`).
> - **Default Round Duration**: Default game duration is set to **30 seconds** (optimized for fast-paced corporate event booth throughput and crowd engagement).

---

## 1. Overview & Core Concept

**Random Target Arcade** is a fast-paced reflex arcade game designed for live corporate activations, brand roadshows, trade exhibitions, and interactive marketing kiosks.

- **Game Mechanics**:
  - Targets spawn randomly within the safe playfield at intervals determined by a configurable difficulty ramp.
  - **Positive Targets**: Hitting them awards points (+10 by default) and triggers a hit celebration effect (sparks/dust or bubble/sparkle).
  - **Negative Targets**: Hitting them incurs a penalty (-10 by default) and displays a penalty indicator (smoke puff or splash ripple).
  - **Interaction Tool**: Fixed in the bottom-right corner (Pistol for Desert, Fishing Rod for Ocean), providing thematic arcade immersion without obstructing the playable arena.
  - **Scoring Integrity**: Scores clamp at zero by default; single-hit idempotency prevents double-taps; expired targets vanish harmlessly; and authoritative timers enforce game over state.
  - **Leaderboard & Lifecycle Integration**: Fully integrates with EventGameStudio's live/test score submission pipeline, anti-cheat validation, and the standard Start/Result screen renderer.

---

## 2. Curated Themes: Desert Quick Draw & Ocean Treasure Hunt

Both themes operate on the identical underlying Random Target Game Engine schema:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Random Target Game Engine                       │
├───────────────────────────────────┬────────────────────────────────────┤
│     Desert Quick Draw Theme       │     Ocean Treasure Hunt Theme      │
├───────────────────────────────────┼────────────────────────────────────┤
│ • Background: Warm desert dunes,  │ • Background: Vibrant ocean deep,  │
│   western saloon & red canyon     │   coral reef, bubbles & sea plants │
│ • Positive: Bandit / Outlaw (+10) │ • Positive: Treasure Chest (+10)   │
│ • Negative: Town Merchant (-10)   │ • Negative: Hungry Shark (-10)     │
│ • Tool: Cartoon Western Revolver  │ • Tool: Cartoon Fishing Rod        │
│ • SFX: Gunshot, ricochet, whistle │ • SFX: Bubble pop, splash, reel   │
└───────────────────────────────────┴────────────────────────────────────┘
```

---

## 3. System Architecture & Component Mapping

```
┌──────────────────────────────────────────────────────────────────────────┐
│                             Client Application                           │
├────────────────────────────────┬─────────────────────────────────────────┤
│ Game Registry & Theme Resolver │ • src/games/registry.ts                 │
│                                │ • src/themes/registry.ts & types.ts     │
├────────────────────────────────┼─────────────────────────────────────────┤
│ Game Runtime & Shell           │ • src/games/random-target/              │
│                                │   ├── RandomTargetGame.tsx (Container)  │
│                                │   ├── engine.ts (Spawn & lifecycle)     │
│                                │   ├── randomTargetSounds.ts (Web Audio) │
│                                │   └── types.ts (Config & State)         │
├────────────────────────────────┼─────────────────────────────────────────┤
│ Game Studio Customizer         │ • src/components/studio/games/          │
│                                │   RandomTargetCustomizer.tsx            │
├────────────────────────────────┼─────────────────────────────────────────┤
│ Localization Engine            │ • src/locales/en.ts, ms-MY.ts, zh-CN.ts │
└────────────────────────────────┴─────────────────────────────────────────┘
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                             Backend Services                             │
├────────────────────────────────┬─────────────────────────────────────────┤
│ High Score & Fraud Validation  │ • server/games/randomTargetScoring.ts   │
│                                │ • server/db/highScores.ts               │
├────────────────────────────────┼─────────────────────────────────────────┤
│ Catalog & Production Engine DB │ • server/db/games.ts                    │
│                                │ • supabase/migrations/                  │
│                                │   20261026000000_add_random_target.sql  │
└────────────────────────────────┴─────────────────────────────────────────┘
```

---

## 4. Implementation Steps & Validation Gates

### Gate 1: Types & Configuration Schemas
- Add `'random-target'` to `GameTypeId` in `src/games/types.ts`.
- Define `RandomTargetGameConfig`, `RandomTargetState`, `TargetEntity`, and `ToolConfig` in `src/games/random-target/types.ts`.
- Extend theme types in `src/themes/types.ts` with normalization helpers (`isRandomTargetTheme`, `tryNormalizeGameType`, `getThemeGameType`).

### Gate 2: Theme Definitions & High-Fidelity Assets
- Create `src/themes/random-target.ts` defining:
  - `desertQuickDrawTheme` (Desert landscape, outlaw bandit, civilian merchant, pistol)
  - `oceanTreasureHuntTheme` (Deep ocean reef, sunken treasure chest, cartoon shark, fishing rod)
- Wire them into `THEME_REGISTRY` in `src/themes/registry.ts` and asset resolution in `src/themes/gameAssetResolver.ts`.
- Include resilient SVG/CSS vector fallbacks so gameplay is immediately playable even in offline/asset-restricted environments.

### Gate 3: Core Game Engine & Runtime Component
- Build `src/games/random-target/engine.ts`:
  - Weighted random spawning with safe bounds calculation (avoiding HUD and tool corners).
  - Target overlap avoidance with retry limit.
  - Difficulty ramp scaling spawn frequency and lifetime as remaining time decreases.
  - Single-hit consumption preventing double-tap race conditions.
- Build `src/games/random-target/randomTargetSounds.ts`:
  - Synthesized Web Audio API sound effects (shots, reel/bubbles, positive dings, penalty buzzers, countdown chimes).
- Build `src/games/random-target/RandomTargetGame.tsx`:
  - Responsive scaled design canvas (`1024x576`).
  - Aim-and-shoot rotation animation for bottom-right tool.
  - HUD integration (Score, Countdown Timer, Accuracy/Hits).
  - Seamless hookup with `StartScreenRenderer` and `ResultScreenRenderer`.

### Gate 4: Game Studio Customizer
- Implement `src/components/studio/games/RandomTargetCustomizer.tsx`:
  - **General Settings**: Duration, spawn interval, min spawn interval, target lifetime, max simultaneous targets, sound toggles.
  - **Positive Target Settings**: Image, title, score value (+1 to +100), spawn weight.
  - **Negative Target Settings**: Image, title, penalty value (-1 to -100), spawn weight.
  - **Interaction Tool Settings**: Tool image, position, scale, projectile effect.
  - **Background & Safe Area**: Background selection and safe zone margins.
- Register customizer in `src/components/studio/GameCustomizerPage.tsx`.

### Gate 5: Backend Engine Registration & Score Validation
- Create `server/games/randomTargetScoring.ts` with server-authoritative score verification (validating maximum possible score given spawn rate and duration, hit ratio sanity checks).
- Update `server/db/highScores.ts` to route `random-target` score submissions.
- Update `server/db/games.ts` (`CATALOG_GAMES`, `BASELINE_PLATFORM_GAMES`, `PRODUCTION_GAME_ENGINES`).
- Create database migration `supabase/migrations/20261026000000_add_random_target_to_production_game_engines.sql`.

### Gate 6: Localization & Translations
- Update `src/locales/en.ts`, `src/locales/zh-CN.ts`, and `src/locales/ms-MY.ts` with all strings for Random Target Arcade, both themes, target labels, and customizer controls.

### Gate 7: Automated Tests & Verification
- Unit test suite for spawning logic, collision detection, and score idempotency.
- Server test for authoritative score validation and cheating prevention.
- Full compilation check via `compile_applet`.
