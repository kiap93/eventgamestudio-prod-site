# Technical Systems: Themes & Asset Customization

This document details the theme architecture, system vs. organization ownership, asset role mappings, fallback resolution, and cloning rules in **Event Game Studio**, verified against `src/themes/`, `server/db/themes.ts`, and `src/components/studio/`.

---

## 1. System Themes vs. Organization Themes

Event Game Studio supports two distinct classes of visual themes:

```
┌───────────────────────────────────────┐       ┌───────────────────────────────────────┐
│            SYSTEM THEMES              │       │          ORGANIZATION THEMES          │
├───────────────────────────────────────┤       ├───────────────────────────────────────┤
│ • is_system = true                    │       │ • is_system = false                   │
│ • organization_id = null              │       │ • organization_id = '<uuid>'          │
│ • Curated by Developer Admins         │       │ • Created or Cloned by Org Members    │
│ • Read-only global templates          │       │ • Fully customizable & editable       │
│ • Immutable to standard organizations │       │ • Scoped strictly to the owning org   │
└───────────────────┬───────────────────┘       └───────────────────▲───────────────────┘
                    │                                               │
                    └──────────── "Clone Theme" Action ─────────────┘
                               (Deep copies configuration)
```

### Inviolable Invariants
1. **System Theme Immutability**: Organizations can never mutate a system theme directly. Clicking "Edit" or "Customize" on a system theme creates a cloned organization-owned copy.
2. **Theme-Game Association**: A theme is tied to a specific `game_type` (`catch-brand`, `memory-match`, `reaction-tap`). A theme designed for `catch-brand` must NEVER be applied to `memory-match` or vice versa.
3. **Listing Deduplication**: When querying themes for an organization (`getThemesByOrganizationId`), the API filters out system themes that have already been cloned by that organization, preventing duplicate display in the Theme Gallery.

---

## 2. Built-in Curated Themes

The platform ships with pre-configured themes in `src/themes/` and `server/db/themes.ts`:

| Theme ID | Associated Game | Default? | Visual Concept | Primary Asset Palette |
| :--- | :--- | :--- | :--- | :--- |
| `default` | `catch-brand` | **Yes (Authoritative)** | Clean corporate arcade | Dark neon backdrop, wooden basket, brand token, hazard spike, golden bonus star (`/assets/games/catch-brand/themes/default/`) |
| `carnival` | `catch-brand` | No (Selectable theme) | Retro circus / amusement park | Striped tent background, carnival cart, golden ticket, cursed mask, cosmic star (`/assets/games/catch-brand/themes/carnival/` or `/assets/themes/carnival/`) |
| `cny` | `catch-brand` | No (Selectable theme) | Lunar New Year | Red lantern festive night, gold ingot bowl, mandarin oranges, firecrackers |
| `christmas` | `catch-brand` | No (Selectable theme) | Holiday winter festival | Snowy night forest, Santa's sack, candy canes, snowballs |
| `halloween` | `catch-brand` | No (Selectable theme) | Spooky haunted house | Graveyard night, pumpkin bucket, wrapped sweets, flying bats |
| `mango` | `catch-brand` | No (Selectable theme) | Tropical summer fruit | Bright beach orchard, rattan basket, ripe mangoes, rotten fruit |
| `memory-match`| `memory-match`| **Yes (Authoritative)** | Branded corporate puzzle | Modern geometric grid, dark corporate card back, product logo pairs (`/assets/games/memory-match/themes/default/`) |
| `reaction-time`| `reaction-tap`| **Yes (Authoritative)** | F1 Grand Prix starting grid | Pit-lane tarmac, carbon-fiber lights chassis, 5 red F1 light bulbs (`/assets/games/reaction-tap/themes/default/`) |

---

## 3. Asset Roles & Mappings

Themes assign image and audio assets to standardized functional roles:

### Catcher / Arcade Roles (`catch-brand`)
- **`background`**: Full-screen backdrop image (optimal: 1920×1080 or 1024×576).
- **`basket`** (or `catcher`): The player-controlled avatar moved along the bottom stage.
- **`reward`** / `good_item`: Positive scoring targets (e.g. brand token, product logo).
- **`hazard`** / `bad_item`: Negative scoring obstacles (e.g. hazard spike, negative penalty item).
- **`bonus`**: Rare golden multiplier target (+50 points).

### Puzzle Roles (`memory-match`)
- **`card_back`**: Default patterned texture displayed when cards are face-down.
- **`card_pairs`**: Array of distinct branded images (minimum 8 distinct images for a 4×4 grid of 8 pairs).

### Reaction Roles (`reaction-tap`)
- **`lights_frame`**: Chassis or gantry housing the starting lights.
- **`light_off`** / `light_on`: Bulbs indicating armed vs. live states.

---

## 4. Asset Resolution & Fallback Pipeline

The system enforces game-scoped default themes via `getDefaultThemeForGameType(gameType)` on the server and `defaultCatchBrandTheme` / `gameAssetResolver.ts` on the client. **Carnival is strictly a selectable theme and is never an implicit fallback.**

```
[ Custom Theme Uploaded Asset ]
             │
      (If Missing / 404)
             │
             ▼
[ Explicit Theme Asset (e.g., /assets/games/{gameType}/themes/{themeId}/{filename}) ]
             │
      (If Missing / 404)
             │
             ▼
[ Game Default Theme Asset (/assets/games/{gameType}/themes/default/{filename}) ]
```

### Safety Rules:
- **No Implicit Carnival Fallback**: Catch The Brand defaults strictly to `default` theme (`/assets/games/catch-brand/themes/default/`). Carnival is preserved as a fully-featured, selectable theme.
- **No Cross-Game Fallback**: A missing `memory-match` card back or pair must NEVER fall back to a `catch-brand` basket or Carnival items. Fallbacks remain strictly scoped to that specific game's asset catalog.
- **Safe URLs**: All resolved asset URLs are sanitized. External URLs must use HTTPS. Direct data URIs are capped to prevent payload bloat.

---

## 5. Theme Configuration Schema (`ThemeConfig`)

```typescript
export interface ThemeConfig {
  id: string;
  name: string;
  game_type: string;
  is_system: boolean;
  organization_id: string | null;
  visuals: {
    background_url: string;
    primary_color: string;
    accent_color: string;
    surface_color: string;
    catcher_url?: string;
    good_item_urls?: string[];
    bad_item_urls?: string[];
    bonus_item_url?: string;
    card_back_url?: string;
    card_face_urls?: string[];
  };
  layout: {
    orientation?: 'auto' | 'landscape' | 'portrait';
    catcher_width_ratio?: number;  // e.g. 0.15 (15% of stage width)
    item_size_ratio?: number;      // e.g. 0.08
    hud_position?: 'top' | 'floating';
    portraitLayout?: Partial<GameLayoutConfig>; // Explicit portrait HUD coordinate overrides
  };
  audio: {
    bgm_url?: string;
    sfx_catch_url?: string;
    sfx_hazard_url?: string;
    sfx_game_over_url?: string;
    bgm_volume: number;
    sfx_volume: number;
  };
  start_screen_config?: StartScreenConfig;  // Start screen canvas overrides
  result_screen_config?: ResultScreenConfig;// Game-over screen overrides
}
```

### Orientation & Dual-Layout System (`src/themes/responsive.ts`)
- **Orientation Modes**:
  - `'landscape'`: Enforces 16:9 stage (`1024 × 576`).
  - `'portrait'`: Enforces 9:16 stage (`576 × 1024`).
  - `'auto'`: Dynamically detects based on container aspect ratio.
- **Dual-Layout Resolution (`getEffectiveGameLayout`)**:
  - Reads base landscape coordinates (`layout[key]`).
  - When in portrait mode, checks for explicit overrides in `layout.portraitLayout[key]`.
  - If unset, automatically falls back to curated default portrait coordinates per game type (`DEFAULT_PORTRAIT_CATCH_LAYOUT`, `DEFAULT_PORTRAIT_MEMORY_LAYOUT`, `DEFAULT_PORTRAIT_REACTION_LAYOUT`).
  - Ensures seamless dragging in the Studio editor without coordinate jumps or cross-contamination.

---

## 6. Theme Cloning Flow

When an organization customizes a system theme (`POST /api/themes/:id/clone`):
1. Verifies the user is an authenticated member of the organization.
2. Fetches the source system theme.
3. Generates a new UUID for the clone.
4. Sets `is_system = false` and `organization_id = user.organization_id`.
5. Sets `name = "${source.name} (Custom)"`.
6. Deep-copies the `visuals`, `layout`, `audio`, and screen editor JSON blobs.
7. Inserts the new row into `public.themes`.
8. Returns the newly created organization theme ID for editing in the Studio.

---

## 7. Creating New Themes: "Start from Scratch" vs. "Duplicate"

The platform strictly separates "Start from scratch" creation from "Duplicate" operations:

```
                          ┌─────────────────────────────┐
                          │   Create New Theme Action   │
                          └──────────────┬──────────────┘
                                         │
                 ┌───────────────────────┴───────────────────────┐
                 │                                               │
                 ▼                                               ▼
     [ "Start From Scratch" ]                          [ "Duplicate Theme" ]
                 │                                               │
   Resolves authoritative game baseline              Uses explicitly selected source
                 │                                               │
    ┌────────────┼────────────┐                                  ▼
    │            │            │                      [ Cloned Source Assets ]
    ▼            ▼            ▼                   (e.g., Carnival -> Carnival
Catch The      Memory      Reaction Time               CNY -> CNY, etc.)
  Brand        Match
    │            │            │
    ▼            ▼            ▼
defaultCatch  memoryMatch  reactionTheme
BrandTheme      Theme
```

### Inviolable Invariants:
1. **Scratch Creation Baseline**:
   - Creating a new theme from scratch for `catch-brand` **ALWAYS** seeds from `defaultCatchBrandTheme` (`/assets/games/catch-brand/themes/default/`).
   - It **NEVER** inherits `carnivalTheme` or random existing themes.
   - Creating for `memory-match` **ALWAYS** seeds from `memoryMatchTheme`.
   - Creating for `reaction-tap` **ALWAYS** seeds from `reactionTheme`.
2. **Explicit Duplication**:
   - Duplication strictly copies the user-selected `sourceThemeId`. Duplicating Carnival creates a Carnival clone; duplicating Default creates a Default clone.
3. **Backend Creation Single Source of Truth**:
   - Server-side `createTheme()` resolves defaults via `getDefaultThemeForGameType(gameType)`.
   - `DEFAULT_DURIAN_THEME` is an alias mapped to `DEFAULT_CATCH_BRAND_THEME` so no legacy route can re-introduce Carnival.

