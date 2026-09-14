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

## 2. Logical Coordinate Systems & Responsive Architecture

Event Game Studio implements a unified, single-source-of-truth responsive engine in `src/themes/responsive.ts` supporting both standard widescreen (16:9) and mobile vertical (9:16) stages:

### Logical Stage Dimensions
- **Landscape (16:9)**: `1024 × 576` (`LANDSCAPE_DESIGN_WIDTH` × `LANDSCAPE_DESIGN_HEIGHT`)
- **Portrait (9:16)**: `576 × 1024` (`PORTRAIT_DESIGN_WIDTH` × `PORTRAIT_DESIGN_HEIGHT`)

### Single Source of Truth (`useResponsiveLayout`)
The `useResponsiveLayout(containerRef, orientationPreference, overrideOrientation)` hook manages all viewport observation, scale calculations, safe area insets, and orientation resolution across all games (`catch-brand`, `memory-match`, `reaction-time`) and the Studio `LiveThemePreview`.

```typescript
export interface ResponsiveLayoutState {
  width: number;
  height: number;
  stageWidth: number;
  stageHeight: number;
  aspectRatio: number;
  orientation: 'portrait' | 'landscape';
  isPortrait: boolean;
  isLandscape: boolean;
  uiScale: number;
  designWidth: number;   // 1024 (landscape) or 576 (portrait)
  designHeight: number;  // 576 (landscape) or 1024 (portrait)
  safeArea: SafeAreaInsets;
}
```

### Orientation Resolution Hierarchy
1. **Studio/Preview Override (`overrideOrientation`)**: Explicitly overrides orientation when an organizer toggles the Mobile/Desktop preview button in Studio or Event Preview.
2. **Theme Configuration (`theme.layout.orientation`)**: 'portrait' or 'landscape' when explicitly forced by the theme design.
3. **Automatic Detection (`'auto'`)**: Viewport dimensions observed via `ResizeObserver`. Viewports with `height > width * 1.05` evaluate to `portrait`; otherwise `landscape`.

### Uniform Scaling Formula
Stage scales uniformly to fit the container without distortion or aspect ratio drift:
```typescript
const scaleX = containerWidth / designWidth;
const scaleY = containerHeight / designHeight;
const uiScale = Math.min(scaleX, scaleY);
```

### Stage CSS Implementation & Custom Properties
Containers inject CSS variables to ensure child overlay elements and HUD widgets scale proportionally:
```tsx
<div
  ref={containerRef}
  className="relative rounded-2xl overflow-hidden bg-slate-950 ..."
  style={{
    '--game-ui-scale': responsive.uiScale,
    '--game-design-width': `${responsive.designWidth}px`,
    '--game-design-height': `${responsive.designHeight}px`,
  } as React.CSSProperties}
>
  {/* Game Canvas / Phaser Container / Start / Result Screens */}
</div>
```

### Canonical Gameplay Coordinate Architecture (Phaser & Catch The Brand)

In mini-game runtimes powered by Phaser (`src/games/catch-brand/`), gameplay physics and sprite rendering MUST operate strictly within canonical logical coordinates:
- **Landscape**: $1024 \times 576$ logical units.
- **Portrait**: $576 \times 1024$ logical units.

#### Principles & Invariants:
1. **Separation of Logical Space and Pixel Presentation**:
   - The DOM layer (`CatchBrandGame.tsx`) hosts a `<div className="game-stage">` sized precisely to `stageWidth × stageHeight` computed by `useResponsiveLayout`.
   - Phaser's canvas fills this stage (`100% width and height`).
   - The internal Phaser scale manager runs in `Phaser.Scale.FIT` configured with canonical design dimensions (`576 × 1024` for portrait, `1024 × 576` for landscape).
2. **Arcade Physics World Bounds**:
   - `this.physics.world.setBounds(0, 0, logicalWidth, logicalHeight)` is strictly bound to logical design dimensions.
   - Gameplay code must NEVER query `window.innerWidth`, `window.innerHeight`, or raw viewport pixels for game mechanics.
3. **Catcher (Basket) Positioning & Bounds**:
   - Base vertical position: `logicalHeight - 70` (consistently 70 logical units above stage bottom in both landscape and portrait).
   - Horizontal clamping: $X \in [\text{halfWidth}, \text{logicalWidth} - \text{halfWidth}]$, dynamically derived from `basket.getBasketWidth() / 2` rather than hardcoded viewport offsets.
   - Bounce tween targets `logicalHeight - 70 + 4` and returns to `logicalHeight - 70`.
4. **Drop Item System & Spawn Bounds**:
   - Spawns at $Y = -30$ with $X \in [\text{minSpawnX}, \text{logicalWidth} - \text{minSpawnX}]$.
   - Fall velocity scales proportionally with aspect height ratio ($\frac{\text{logicalHeight}}{576}$) so that item traverse duration from sky to ground remains constant regardless of aspect ratio.
   - Floor miss threshold: $Y > \text{logicalHeight} + \text{itemRadius} + 10$.
5. **Dynamic Orientation & Resize Resynchronization**:
   - When orientation flips (landscape $\leftrightarrow$ portrait) or container resizes:
     - `game.scale.resize(responsive.designWidth, responsive.designHeight)` updates the renderer.
     - `GameScene.resizeLayout(newWidth, newHeight)` updates logical dimensions, physics world bounds, background cover scale, ambient weather emitter zones, and repositions the basket and falling items proportionally ($X_{\text{new}} = X_{\text{old}} \times \frac{W_{\text{new}}}{W_{\text{old}}}$).
6. **Touch & Pointer Input Mapping**:
   - Pointer events in Phaser (`pointer.x`, `pointer.y`) are automatically transformed by Phaser's input manager into logical coordinates matching the canvas coordinate space.
   - Clamping uses canonical `logicalWidth`, ensuring that touch/mouse controls stay perfectly inside the gameplay arena on mobile screens.

---

## 3. Screen Renderers & Orientation Adaptation

### Start Screen (`StartScreenRenderer.tsx`)
Renders authored visual compositions with uniform scaling:
- **`startScreenResolver.ts`**: Merges base theme defaults with custom layout overrides stored in the theme JSON (`theme.startScreenConfig`).
- **Canvas Scaling**: Fits either landscape or portrait viewport bounds while preserving all typography, button coordinates, and branding proportions without reflow defects.

### In-Game HUD & Layout Engine (`getEffectiveGameLayout` & `GameLayoutHudOverlay.tsx`)
- **Dual-Layout Resolution**: When `isPortrait = true`, `getEffectiveGameLayout` checks for explicit `portraitLayout` definitions in the theme JSON, falling back cleanly to curated portrait coordinate presets for each game (`DEFAULT_PORTRAIT_CATCH_LAYOUT`, `DEFAULT_PORTRAIT_MEMORY_LAYOUT`, `DEFAULT_PORTRAIT_REACTION_LAYOUT`).
- **Drag-and-Drop WYSIWYG**: In the Studio's Theme Editor, dragging HUD elements in Portrait mode commits updates directly to `theme.layout.portraitLayout`, keeping Landscape and Portrait configurations neatly decoupled.

### Result Screen (`ResultScreenRenderer.tsx`)
- Dynamically adapts canvas aspect ratio (`targetDimensions={{ width: responsive.designWidth, height: responsive.designHeight }}`) to seamlessly center in both landscape and portrait viewports.
- Utilizes container query units (`cqi`), percentages, and proportional font scaling (`ResultElementContent.tsx`) for crisp display across mobile phones, tablets, and tournament kiosk displays.

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
