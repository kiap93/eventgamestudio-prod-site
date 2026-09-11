# Technical Systems: Game Engines & Registry

This document details the game engine architecture, registration system, configuration schemas, lifecycle state machines, and the exact step-by-step process for adding new mini-games in **Event Game Studio**, verified against `src/games/`.

---

## 1. Implemented Game Catalog

The platform registers games centrally in `src/games/registry.ts`:

| Game ID | Name | Category | Status | Engine Path | Primary Mechanics |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `catch-brand` | Catch the Brand | Action Arcade | **Available** | `src/games/catch-brand/` | Move catcher left/right to catch falling good items (+10) and bonus gold items (+50) while dodging hazards (-10). |
| `memory-match` | Brand Memory Match | Puzzle | **Available** | `src/games/memory-match/` | Flip custom branded cards in a grid (4×4 default) to find matching pairs before timer expires. Streak combos grant bonus points. |
| `reaction-tap`<br>(alias `reaction-time`) | Formula Reaction Lights | Reaction Speed | **Available** | `src/games/reaction-time/` | F1-style 5-red-light sequence. Tap immediately when lights extinguish. Measures millisecond reaction times across multiple rounds. |
| `speed-quiz` | Event Trivia Speed Quiz | Trivia / Quiz | **Coming Soon** | `src/games/speed-quiz/` *(Stub)* | Registered in catalog as `isAvailable: false, comingSoon: true`. Currently falls back to `CatchBrandGame` until full implementation. |

---

## 2. Game Registry Architecture

Game definitions implement the generic `GameDefinition<TConfig>` interface in `src/games/types.ts`:

```typescript
export interface GameDefinition<TConfig = Record<string, any>> {
  id: string;
  name: string;
  shortName: string;
  description: string;
  iconName: string;
  category: 'action' | 'puzzle' | 'reaction' | 'trivia' | 'arcade';
  minPlayers: number;
  maxPlayers: number;
  defaultDurationSeconds: number;
  supportedInputTypes: ('keyboard' | 'touch' | 'mouse' | 'motion')[];
  defaultConfig: TConfig;
  component: React.ComponentType<GameComponentProps<TConfig>>;
  isAvailable: boolean;
  comingSoon?: boolean;
}
```

### Registry Resolver (`src/games/registry.ts`)
- `getGameDefinition(gameType)`: Normalizes game identifiers, trims whitespace, replaces underscores with dashes, and resolves aliases:
  - `"reaction"`, `"reflex"`, `"reaction-time"` $\rightarrow$ `reaction-tap`
  - `"memory"`, `"match"` $\rightarrow$ `memory-match`
  - `"catch"`, `"catcher"`, `"basket"` $\rightarrow$ `catch-brand`
  - Fallback default: `catch-brand`
- `getAllGameDefinitions()`: Returns all catalog games.
- `getAvailableGameDefinitions()`: Returns only `isAvailable: true` games.

---

## 3. Game Lifecycle State Machine

Every game engine adheres to a standardized state lifecycle:

```
                  ┌────────────────────────┐
                  │         IDLE           │
                  │   (Start Screen)       │
                  └───────────┬────────────┘
                              │
                    User Taps "Start Game"
                              │
                              ▼
                  ┌────────────────────────┐
                  │       COUNTDOWN        │
                  │     (3-2-1 Ready)      │
                  └───────────┬────────────┘
                              │
                     Countdown Finishes
                              │
                              ▼
                  ┌────────────────────────┐
                  │        PLAYING         │◄─────────┐
                  │ (Live Input & Physics) │          │
                  └───────────┬────────────┘          │
                              │                  User Resumes
                         User Pauses                  │
                              │                       │
                              ▼                       │
                  ┌────────────────────────┐          │
                  │         PAUSED         │──────────┘
                  │     (Overlay Open)     │
                  └───────────┬────────────┘
                              │
                    Timer Reaches 0 / Round Ends
                              │
                              ▼
                  ┌────────────────────────┐
                  │       GAME_OVER        │
                  │     (Result Screen)    │
                  └───────────┬────────────┘
                              │
                    Submit Score / Play Again
                              │
                              ▼
                   (Transitions to IDLE)
```

### Component Contract (`GameComponentProps`)
Games receive uniform props from the parent stage (`GameContainer.tsx` or `ArcadeUI.tsx`):
- `config`: Merged game configuration (defaults overridden by theme/event custom settings).
- `theme`: Active visual theme object (`ThemeConfig`) including resolved image assets and colors.
- `isMuted` / `volume`: Global audio controls.
- `onGameOver`: Callback passed final score, accuracy, and telemetry to trigger the Result Screen.
- `onScoreUpdate`: Callback updating the in-game HUD score in real-time.
- `onRestart`: Callback resetting game loop.

---

## 4. Configuration Schemas

### 1. Catch the Brand (`CatchBrandConfig`)
```typescript
interface CatchBrandConfig {
  gameDurationSeconds: number;   // Default: 20s
  fallSpeedMultiplier: number;   // Default: 0.7 (scales difficulty)
  soundVolume: number;           // Default: 0.8
  soundEnabled: boolean;         // Default: true
  bgmEnabled: boolean;           // Default: true
  goodItemScore: number;         // Default: +10
  badItemScore: number;          // Default: -10
  bonusItemScore: number;        // Default: +50
  spawnIntervalMs?: number;      // Item spawn frequency
}
```

### 2. Brand Memory Match (`MemoryMatchConfig`)
```typescript
interface MemoryMatchConfig {
  gameDurationSeconds: number;   // Default: 45s
  gridRows: number;              // Default: 4
  gridCols: number;              // Default: 4
  pairCount: number;             // Default: 8
  mismatchDelayMs: number;       // Default: 850ms flip back delay
  matchPoints: number;           // Default: 100
  comboPoints: number;           // Default: 30
  soundVolume: number;
  soundEnabled: boolean;
  bgmEnabled: boolean;
}
```

### 3. Formula Reaction Lights (`ReactionGameConfig`)
```typescript
interface ReactionGameConfig {
  rounds: number;                // Default: 3 rounds
  lightsCount: number;           // Default: 5 lights
  lightIntervalMs: number;       // Time between each light turning red (1000ms)
  randomDelayMinMs: number;      // Min delay after 5th light before out (1000ms)
  randomDelayMaxMs: number;      // Max delay after 5th light before out (3000ms)
  falseStartPenaltyMs: number;   // Penalty for jumping before lights out (1000ms)
  soundVolume: number;
  soundEnabled: boolean;
  bgmEnabled: boolean;
}
```

---

## 5. Shared Game Infrastructure (`src/games/shared/`)

To avoid duplicating UI, screens, and canvas mathematics, games share common rendering infrastructure:
- **`StartScreenRenderer.tsx`**: Renders the 1024×576 logical Start Screen composition, uniform aspect-ratio scaling, and interactive button handlers.
- **`StartElementContent.tsx`**: Renders individual Start Screen visual elements (brand titles, rules cards, countdown tags, custom logos).
- **`startScreenResolver.ts`**: Merges theme defaults with custom canvas layouts, ensuring standard layout geometry.
- **`ResultScreenRenderer.tsx`**: Renders the game over screen with score, tournament ranking, retry action, and leaderboard modals.
- **`ResultElementContent.tsx`**: Renders result screen badges, confetti triggers, and stat pills.
- **`StartScreenErrorBoundary.tsx`**: Prevents game crashes from broken custom element JSON, rendering a safe fallback start view.

---

## 6. How to Add a New Mini-Game (Step-by-Step)

When implementing a new mini-game, an AI agent MUST follow this exact sequence:

```
[ Step 1: Create Game Folder in src/games/<game-id>/ ]
  ├── <GameName>Game.tsx    (Main React/Canvas component)
  ├── types.ts              (Config interface & DEFAULT_CONFIG)
  ├── audio.ts              (Web Audio API synth sound effects)
  └── index.ts              (Barrel export)
       │
       ▼
[ Step 2: Register in src/games/registry.ts ]
  1. Import Game component and config types
  2. Add entry to GAME_REGISTRY with unique id, name, iconName, defaultConfig
  3. Add alias matching in getGameDefinition()
       │
       ▼
[ Step 3: Create Studio Customizer in src/components/studio/games/ ]
  Create <GameName>Customizer.tsx for game-specific parameter tweaking
  (e.g. speeds, points, grid dimensions)
       │
       ▼
[ Step 4: Register Customizer in src/components/studio/GameplayTab.tsx ]
  Render the customizer when activeGameId matches the new game
       │
       ▼
[ Step 5: Define Default Theme & Assets in src/themes/ ]
  Create curated theme presets and register in src/themes/registry.ts
       │
       ▼
[ Step 6: Add Database Seed Record ]
  Ensure public.games table has matching record with id, name, and config schema
       │
       ▼
[ Step 7: Validate & Test ]
  Run bun test and verify game launches in /preview/<game-id> and live views
```
