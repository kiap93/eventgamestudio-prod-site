# Start Screen Editor Architecture & Game Integration Flow

## Overview

The **Start Screen Editor** provides a dual-mode editing experience across all games in the Event Game Studio platform:
1. **Basic Editor (`StartScreenBasicEditor.tsx`)**: High-level background controls (Theme Wallpaper, Solid Color, Custom Image upload), dark overlay contrast slider, and game-specific element visibility toggles.
2. **Advanced Visual Canvas Editor (`StartScreenVisualEditorModal.tsx`)**: Full 1024×576 drag-and-drop WYSIWYG canvas powered by the unified canvas engine (`shared-editor/CanvasWorkspace.tsx`), layer tree management, element insertion (cards, text, images, buttons, badges, rules, icons, keyboard hints, leaderboards), real-time zoom & pan, grid snap, and alignment guides.

Both editors operate on the **same single source of truth**: `StartScreenConfig`. Changes in either editor are synchronized immediately and persisted to the theme via `saveStartScreenConfig()`.

---

## 1. Directory Structure

```text
src/
├── components/
│   └── studio/
│       ├── ScreensTab.tsx                      # Routes theme to appropriate game customizer
│       └── games/
│           ├── CatchBrandCustomizer.tsx         # Catch the Brand customizer & Screens tab
│           ├── MemoryMatchCustomizer.tsx        # Memory Match customizer & Screens tab
│           ├── ReactionGameCustomizer.tsx       # Reaction Tap customizer & Screens tab
│           ├── shared-editor/
│           │   ├── CanvasWorkspace.tsx          # Shared canvas engine (zoom, pan, snap, guides)
│           │   ├── AlignmentToolbar.tsx         # Element alignment & distribution tools
│           │   ├── DistanceGuides.tsx           # Precision pixel measurement overlays
│           │   └── ...
│           └── start-editor/
│               ├── StartScreenBasicEditor.tsx   # Shared Basic Editor component
│               ├── StartScreenVisualEditorModal.tsx # Fullscreen modal container
│               ├── CanvasWorkspace.tsx          # Start Screen canvas workspace wrapper
│               ├── CanvasOverlay.tsx            # Selection boxes, handles, and transform bounds
│               ├── LeftPanel.tsx                # Element tree, add elements, template presets
│               ├── RightPanel.tsx               # Element property inspector & styling controls
│               └── TopToolbar.tsx               # Undo, redo, zoom, fit-to-screen, save controls
├── games/
│   ├── shared/
│   │   ├── startScreenTypes.ts                  # StartScreenConfig, element types, default templates
│   │   ├── startScreenResolver.ts               # getStartScreenConfig, saveStartScreenConfig, visibility sync
│   │   └── StartScreenRenderer.tsx              # Runtime 1024x576 scaler & element renderer
│   ├── catch-brand/
│   │   └── CatchBrandGame.tsx                   # Renders StartScreenRenderer in START state
│   ├── memory-match/
│   │   └── MemoryMatchGame.tsx                  # Renders StartScreenRenderer in START state
│   └── reaction-time/
│       └── ReactionGame.tsx                     # Renders StartScreenRenderer in START state
```

---

## 2. Core Architectural Principles

### 2.1 Single Source of Truth
- Both Basic and Advanced editors read and write `StartScreenConfig`.
- There are no competing or divergent configurations.
- When basic properties are toggled (e.g., `showIcon`, `showGridInfo`, `showTimerInfo`), `updateStartScreenElementsVisibilityMap()` recursively synchronizes the `visible` property of matching elements inside the element hierarchy.
- When elements are modified on the visual canvas, those elements are saved directly into `StartScreenConfig.elements`.

### 2.2 Dual-Location Synchronization
To ensure 100% backwards compatibility and database schema conformance across all game types:
- `saveStartScreenConfig(theme, nextStartConfig, gameType)` writes the start screen configuration to:
  1. `theme.game_config.screens.start` (game-specific configuration location)
  2. `theme.screens.start` (global theme screen configuration location)
- Both locations are kept identical on every update.

### 2.3 Authoritative 1024×576 Landscape Coordinate Space
- The canvas engine uses a standard 1024×576 resolution (16:9 aspect ratio).
- Elements are positioned in absolute virtual coordinates relative to parent cards or the root canvas.
- At runtime, `StartScreenRenderer.tsx` measures the game container and dynamically calculates the exact scale factor (`min(containerWidth / 1024, containerHeight / 576)`), guaranteeing pixel-identical rendering across mobile, desktop, and arcade cabinet viewports.

---

## 3. Supported Games Matrix

| Game Type | Game Name | Customizer Component | Basic Editor | Advanced Editor | Runtime Renderer |
| :--- | :--- | :--- | :---: | :---: | :---: |
| `catch-brand` | Catch the Brand | `CatchBrandCustomizer.tsx` | `<StartScreenBasicEditor />` | `<StartScreenVisualEditorModal />` | `<StartScreenRenderer />` in `ArcadeUI.tsx` |
| `reaction-tap` / `reaction-time` | Formula Reaction Lights | `ReactionGameCustomizer.tsx` | `<StartScreenBasicEditor />` | `<StartScreenVisualEditorModal />` | `<StartScreenRenderer />` in `ReactionGame.tsx` |
| `memory-match` | Brand Memory Match | `MemoryMatchCustomizer.tsx` | `<StartScreenBasicEditor />` | `<StartScreenVisualEditorModal />` | `<StartScreenRenderer />` in `MemoryMatchGame.tsx` |

---

## 4. Basic Editor Capabilities (`StartScreenBasicEditor`)

1. **Background Modes**:
   - **Active Theme Background**: Inherits the game's wallpaper asset.
   - **Solid Color**: Interactive native color picker and quick swatches with hex preview.
   - **Custom Image**: Drag-and-drop or file upload for dedicated start screen backdrops.
2. **Dark Backdrop Overlay**:
   - Range slider (0% to 100%) with quick presets (0%, 30%, 50%, 75%, 90%) for text readability.
3. **Element Visibility Toggles**:
   - Adapts dynamically to `gameType` and `gameMeta`:
     - **Catch the Brand**: Game Header Icon, How-to-Play Rules Card, Keyboard Hints, Live Leaderboard Badge.
     - **Reaction Tap**: Header Icon, Total Rounds Badge, Starting Lights Guide, Live Leaderboard Badge.
     - **Memory Match**: Header Icon, Grid Dimensions Badge (`rows×cols`), Pairs Count Badge, Timer Pill.

---

## 5. Advanced Editor Capabilities (`StartScreenVisualEditorModal`)

1. **Canvas System (`shared-editor/CanvasWorkspace.tsx`)**:
   - Unified canvas engine shared between Start Screen and Result Screen editors.
   - Accurate zoom percentage display, zoom-in, zoom-out, and fit-to-screen (`fitZoom`).
   - Configurable grid overlay with toggleable grid sizes (8px, 16px, 24px, 32px) and snap-to-grid.
   - Multi-axis distance measurement guides between selected elements and parent boundaries.
2. **Element Layer Management**:
   - Hierarchical element tree with nested card and group support.
   - Drag-to-reorder, layer locking (`locked: true`), and instant visibility toggling (`visible: boolean`).
3. **Element Types Supported**:
   - `card`: Container cards with background colors, borders, and rounded corners.
   - `text` / `title` / `description`: Text elements with dynamic meta placeholders (`{gameTitle}`, `{duration}`, `{totalPairs}`).
   - `image`: Custom artwork and logos with preserve-aspect options.
   - `button`: Primary interactive CTA buttons ("TAP TO START", "PLAY NOW").
   - `badge`: Status chips and gameplay metadata pills.
   - `rules`: Structured gameplay instructions and scoring guidelines.
   - `icon`: Lucide icon badges.
   - `keyboard-hints`: Controls indicators (e.g., `←`, `→` arrow keys).
   - `leaderboard`: Preview table of top player ranks.

---

## 6. Integration Flow

```text
1. User navigates to Studio Theme Editor -> "Screens" tab.
2. ScreensTab renders the customizer for the active theme's game type.
3. Customizer initializes StartScreenConfig via getStartScreenConfig(theme, gameType, gameMeta).
4. User modifies settings in Basic Editor:
   - StartScreenBasicEditor calls onChange(updates).
   - updates are merged and saved via saveStartScreenConfig(theme, nextStartConfig, gameType).
   - Recursive visibility mapper updates element tree.
5. User clicks "Open Start Screen Editor":
   - StartScreenVisualEditorModal opens in fullscreen with 1024x576 CanvasWorkspace.
   - User manipulates canvas elements (add, drag, resize, align, style).
   - On save, saveStartScreenConfig() writes the complete element tree to theme state.
6. User clicks "Save Theme":
   - Theme is written to Supabase / PostgreSQL database.
7. Runtime Game Execution:
   - When game is played (/play/:slug or Studio Live Preview), Game component mounts StartScreenRenderer.
   - StartScreenRenderer resolves StartScreenConfig and scales to the viewport.
   - User clicks CTA button -> onStartGame() triggers gameplay transition.
```
