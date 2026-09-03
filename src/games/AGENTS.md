# Game Subsystem & Catalog — Local Agent Guidelines

**Applies to**: `/src/games/` and `/src/components/studio/games/`

This document defines the architectural rules for developing, registering, and maintaining interactive mini-games in Event Game Studio.

---

## 1. Game Subsystem Architecture

The mini-game engine is built around a pluggable registry architecture defined in `src/games/registry.ts`:

- **Game Definition**: Every game implements `GameDefinition<TConfig>` specifying:
  - `id`: Unique kebab-case identifier (`catch-brand`, `memory-match`, `reaction-tap`, `speed-quiz`).
  - `name` & `shortName`: Display name and label.
  - `defaultConfig`: Type-safe default game parameters.
  - `component`: React component responsible for hosting the game runtime.
  - `supportedInputTypes`: Array of input methods (`keyboard`, `touch`, `mouse`, `motion`).
  - `isAvailable`: Availability flag in the studio catalog.

---

## 2. Core Game Isolation Mandates

1. **Strict Engine Separation**:
   - Each game MUST execute within its own isolated component tree.
   - Never import game-specific components or state hooks across different game engines (e.g., do not import catcher mechanics into puzzle games).
2. **Independent Game Configurations**:
   - Every game must define its own config interface in `src/games/<game-id>/types.ts` extending `BaseGameConfig`.
   - Never force a game to conform to an unrelated game's config fields (e.g., `basket_config` and `items_config` belong strictly to catch games; `boardConfig`, `cardConfig`, and `pairs` belong strictly to memory match).
3. **Dedicated Studio Customizers**:
   - Each game must have its own customizer component in `src/components/studio/games/` (e.g., `CatchBrandCustomizer.tsx`, `MemoryMatchCustomizer.tsx`).
   - The customizer renders preview controls, asset uploaders, physics/timing sliders, and layout editors specific to that game type.
4. **Theme Normalization & Mapping**:
   - Themes stored in `game_themes` have a `game_config` JSONB column for game-specific attributes.
   - When loading a theme for a game, the game engine must only read and write its own configuration subset.

---

## 3. High Score & Leaderboard Integration

- All games report scores via the unified score submission API (`/api/events/:id/score` or `/api/play/:slug/score`).
- Payload must include:
  - `player_name` / `player_identifier`
  - `score` (integer >= 0)
  - `game_type` (matching the game definition ID)
  - `metadata` (optional gameplay statistics such as combos, duration, accuracy, moves)
- Validation: The server verifies score validity against the game duration and maximum theoretical points per second.

---

## 4. Audio & Sound Architecture

- Use Web Audio API synthesizers or HTML5 Audio elements with graceful fallback if browser autoplay is restricted.
- Always provide user-facing mute toggles for both sound effects (SFX) and background music (BGM).
- Respect global audio volume settings defined in the active theme.
