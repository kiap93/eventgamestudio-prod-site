# Technical Systems: Game UI, Canvas & Visual Editors

This document details the presentation architecture, coordinate systems, scaling algorithms, screen renderers, and visual editors that comprise the game UI in **Event Game Studio**, verified against `src/games/shared/`, `src/components/studio/games/`, and `src/components/ArcadeUI.tsx`.

---

## 1. UI Hierarchy & Component Relationships

The Game UI follows a nested stage architecture separating canvas composition from responsive viewport scaling:

```
┌───────────────────────────────────────────────────────────────────────────┐
│ Host Viewport (Window / Iframe / Kiosk Display / Mobile Screen)           │
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │ GameContainer.tsx / ArcadeUI.tsx (Responsive Container)             │  │
│  │                                                                     │  │
│  │   ┌─────────────────────────────────────────────────────────────┐   │  │
│  │   │ Scaled Stage Wrapper                                        │   │  │
│  │   │ transform: translate(-50%, -50%) scale(uniformScale)        │   │  │
│  │   │ width: 1024px; height: 576px (16:9 Aspect Ratio)            │   │  │
│  │   │                                                             │   │  │
│  │   │   [ Active Game Phase Rendering ]:                          │   │  │
│  │   │   1. IDLE:        StartScreenRenderer.tsx                   │   │  │
│  │   │   2. PLAYING:     In-Game Engine Canvas + GameLayoutHud     │   │  │
│  │   │   3. GAME OVER:   ResultScreenRenderer.tsx                  │   │  │
│  │   │                                                             │   │  │
│  │   └─────────────────────────────────────────────────────────────┘   │  │
│  │                                                                     │  │
│  │   Top HUD Overlay: Fullscreen Toggle, Mute Button, Quit Action      │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────────┘
```

### Studio Visual Editors (Creator Experience)
- **`StartScreenVisualEditor.tsx`**: Drag-and-drop 1024×576 WYSIWYG editor for customizing Start Screen compositions (moving title, subtitle, rules card, custom logos, start buttons).
- **`ResultScreenVisualEditor.tsx`**: WYSIWYG editor for styling the tournament game-over screen (points card, rank badge, leaderboard action, retry button).

---

## 2. The 1024×576 Logical Canvas Rule

Event Game Studio strictly enforces a **1024×576 logical coordinate system** (standard 16:9 widescreen) as the single source of truth for all screen layouts.

### Inviolable Canvas Invariants
1. **Single Source of Truth**: All element X/Y positions, dimensions, font sizes, border radii, and paddings are authored and stored against a logical `1024 × 576` plane.
2. **No Second Layout for Normal Screen**: The system **MUST NOT** reflow, reorder, wrap, or rearrange elements between the Full Studio Editor and normal game screen. Normal screens render the exact same composition scaled down uniformly.
3. **Uniform Aspect Ratio Scaling**: Stretching or independent X/Y distortion is strictly prohibited. The canvas must scale uniformly using `scale(min(containerWidth / 1024, containerHeight / 576))`.

### Uniform Scaling Formula
```typescript
const LOGICAL_WIDTH = 1024;
const LOGICAL_HEIGHT = 576;

// Measured from the container via ResizeObserver
const scaleX = containerWidth / LOGICAL_WIDTH;
const scaleY = containerHeight / LOGICAL_HEIGHT;

// Strict uniform scale factor:
const scale = Math.min(scaleX, scaleY);
```

### Stage CSS Implementation
```tsx
<div className="relative w-full h-full overflow-hidden flex items-center justify-center bg-slate-950">
  <div
    style={{
      width: '1024px',
      height: '576px',
      transform: `translate(-50%, -50%) scale(${scale})`,
      position: 'absolute',
      top: '50%',
      left: '50%',
      transformOrigin: 'center center',
    }}
  >
    {/* All canvas elements render inside this fixed 1024x576 container */}
  </div>
</div>
```

---

## 3. Screen Renderers

### Start Screen (`StartScreenRenderer.tsx`)
Renders the authored 1024×576 composition prior to gameplay:
- **`startScreenResolver.ts`**: Merges base theme defaults with custom layout overrides stored in the theme JSON (`theme.startScreenConfig`).
- **Elements Supported**:
  - `brand_logo`: Top/center sponsor branding with configurable width and opacity.
  - `game_title`: Primary display headline with custom font, size, and drop shadow.
  - `game_subtitle`: Secondary tag line or event slogan.
  - `rules_card`: Frosted-glass container outlining gameplay rules, point values, and controls.
  - `start_button`: Primary action button triggering the 3-2-1 countdown sequence.
  - `custom_badge`: Optional organizer badge (e.g. "Tournament Mode", "Live Rehearsal").
- **Error Boundary**: Wrapped in `StartScreenErrorBoundary.tsx`. If custom JSON contains corrupt coordinates or invalid image URLs, it falls back to a clean default start screen without crashing the game.

### In-Game HUD (`GameLayoutHudOverlay.tsx`)
Overlay displayed during live gameplay:
- **Score Counter**: Top-left display showing current points with bounce animation on positive score.
- **Timer Bar**: Center/top visual progress bar indicating remaining seconds.
- **Lives / Lights Indicator**: Displays remaining lives or active F1 light bulbs.
- **Combo Meter**: Multiplier pill displaying consecutive match streak.
- **Pause Trigger**: Floating button opening the pause drawer.

### Result Screen (`ResultScreenRenderer.tsx`)
Rendered when time expires or the game completes:
- **Score Card**: Large typographic display of final achieved score.
- **High Score Indicator**: Animated badge triggered if score ranks in the event's top 10.
- **Action Group**:
  - "Play Again": Resets the game loop for a new session.
  - "View Leaderboard": Opens `EventLeaderboardModal.tsx` showing current event rankings.
- **Telemetry Display**: Displays accuracy %, total items caught, or millisecond reaction time.

---

## 4. Viewport, Fullscreen & Orientation Handling

Physical kiosks, iPad tablets, and mobile phones require dedicated viewport handling:

### Fullscreen Control
- Managed via `requestFullscreen` with cross-browser fallbacks (`webkitRequestFullscreen`, `mozRequestFullScreen`, `msRequestFullscreen`).
- The HUD provides a floating fullscreen toggle button in the top-right corner.
- Fullscreen change events (`fullscreenchange`) trigger a `ResizeObserver` update to recalculate uniform canvas scale.

### Landscape vs. Portrait Adaptation
- **Native Orientation**: All games are designed for 16:9 **Landscape** orientation.
- **Mobile Portrait Detection**:
  - When container aspect ratio is vertical (`width < height`), the stage centers the 16:9 canvas with black letterbox bars on top and bottom.
  - On handheld mobile devices, an orientation prompt ("Please rotate your device to landscape for the best tournament experience") is displayed when in portrait mode.

---

## 5. Architectural Duplication Analysis

During inspection of the game UI codebase, two legacy patterns were identified:
1. **`ArcadeUI.tsx` vs. Game-Specific Containers**:
   - `ArcadeUI.tsx` was originally built as a monolithic container for `catch-brand`. Later games (`memory-match`, `reaction-time`) introduced their own container wrappers.
   - *Current State*: The platform has standardized on extracting shared screen logic to `src/games/shared/` (`StartScreenRenderer`, `ResultScreenRenderer`), while games maintain their internal loop canvas.
2. **Start Screen Scaling Parity**:
   - Previous versions created separate responsive reflow layouts for small screens, causing custom button placements to break in preview mode.
   - *Current State*: The 1024×576 logical canvas is now uniformly scaled everywhere (both Full Studio Editor and normal previews) using CSS `transform: scale()`.
