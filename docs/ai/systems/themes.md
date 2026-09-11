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

The platform ships with pre-configured themes in `src/themes/`:

| Theme ID | Associated Game | Visual Concept | Primary Asset Palette |
| :--- | :--- | :--- | :--- |
| `carnival` | `catch-brand` | Retro circus / amusement park | Striped tent background, pop-corn bucket, balloons, ticking bombs |
| `durian` | `catch-brand` | Tropical fruit festival | Malaysian fruit orchard, bamboo basket, Musang King durian, spikes |
| `cny` | `catch-brand` | Lunar New Year | Red lantern festive night, gold ingot bowl, mandarin oranges, firecrackers |
| `christmas` | `catch-brand` | Holiday winter festival | Snowy night forest, Santa's sack, candy canes, snowballs |
| `halloween` | `catch-brand` | Spooky haunted house | Graveyard night, pumpkin bucket, wrapped sweets, flying bats |
| `mango` | `catch-brand` | Tropical summer fruit | Bright beach orchard, rattan basket, ripe mangoes, rotten fruit |
| `memory-match`| `memory-match`| Branded corporate puzzle | Modern geometric grid, dark corporate card back, product logo pairs |
| `reaction-time`| `reaction-tap`| F1 Grand Prix starting grid | Pit-lane tarmac, carbon-fiber lights chassis, 5 red F1 light bulbs |

---

## 3. Asset Roles & Mappings

Themes assign image and audio assets to standardized functional roles:

### Catcher / Arcade Roles (`catch-brand`)
- **`background`**: Full-screen backdrop image (optimal: 1920×1080 or 1024×576).
- **`basket`** (or `catcher`): The player-controlled avatar moved along the bottom stage.
- **`reward`** / `good_item`: Positive scoring targets (e.g. durian, golden coin, product logo).
- **`hazard`** / `bad_item`: Negative scoring obstacles (e.g. bomb, rotten fruit, thorn).
- **`bonus`**: Rare golden multiplier target (+50 points).

### Puzzle Roles (`memory-match`)
- **`card_back`**: Default patterned texture displayed when cards are face-down.
- **`card_pairs`**: Array of distinct branded images (minimum 8 distinct images for a 4×4 grid of 8 pairs).

### Reaction Roles (`reaction-tap`)
- **`lights_frame`**: Chassis or gantry housing the starting lights.
- **`light_off`** / `light_on`: Bulbs indicating armed vs. live states.

---

## 4. Asset Resolution & Fallback Pipeline

Custom assets uploaded by organizers can occasionally fail to load or be missing. The theme resolver (`resolveThemeConfig` in `src/themes/registry.ts`) implements a strict fallback hierarchy:

```
[ Custom Theme Uploaded Asset ]
             │
      (If Missing / 404)
             │
             ▼
[ Curated Base Theme Asset (e.g. carnival/basket.png) ]
             │
      (If Missing / 404)
             │
             ▼
[ Platform Default Asset (public/assets/durian_brown.png) ]
```

### Safety Rules:
- **No Cross-Game Fallback**: A missing `memory-match` card back must NEVER fall back to a `catch-brand` basket. Fallbacks remain strictly scoped to that specific game's asset catalog.
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
    catcher_width_ratio: number;  // e.g. 0.15 (15% of stage width)
    item_size_ratio: number;      // e.g. 0.08
    hud_position: 'top' | 'floating';
  };
  audio: {
    bgm_url?: string;
    sfx_catch_url?: string;
    sfx_hazard_url?: string;
    sfx_game_over_url?: string;
    bgm_volume: number;
    sfx_volume: number;
  };
  start_screen_config?: StartScreenConfig;  // 1024x576 canvas overrides
  result_screen_config?: ResultScreenConfig;// Game-over screen overrides
}
```

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
