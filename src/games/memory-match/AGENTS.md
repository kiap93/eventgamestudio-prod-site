# Brand Memory Match — Local Game Engine Guidelines

**Applies to**: `/src/games/memory-match/` and `/src/components/studio/games/MemoryMatchCustomizer.tsx`

This document defines the strict operational and architectural rules for the **Brand Memory Match** game engine.

---

## 1. Absolute Independence Mandates

1. **Never Redirect to Catch the Brand**:
   - Under no circumstances should Memory Match redirect to, render, or fallback on `catch-brand` or Phaser catcher scenes.
2. **Never Use Catch the Brand Configuration**:
   - Memory Match MUST NOT use or inherit `basket_config`, `items_config`, `drop_speed`, or catcher physics as fallbacks.
3. **Independent Game Customization**:
   - Customization is managed exclusively via `MemoryMatchCustomizer.tsx` and saved in `theme.game_config.memory_match`.
4. **Independent Assets & Card Pairs**:
   - Memory Match uses `card_back` images, card pair icons/images, and card frame colors.
   - Never substitute missing card assets with catcher basket or fruit drop assets. If custom pair assets are missing, use the built-in geometric/fruit card deck presets from `src/games/memory-match/cardDeck.ts`.

---

## 2. Board Layout Modes & Mathematical Matrix

Memory Match supports 4 distinct board layout modes (`MemoryMatchLayoutMode`):

1. **`grid` (Standard Matrix Grid)**:
   - Configurable grid dimensions from 2x2 up to 8x8 (total cards must be an even number between 4 and 48).
   - Card dimensions and gaps adapt responsively to viewport width and height.
2. **`random` (Scattered / Angled Cards)**:
   - Cards placed with organic spacing, configurable rotation jitter (`rotationMin` to `rotationMax`, e.g., -8° to +8°), and dynamic collision avoidance.
3. **`up-down` (Split Dual-Row Layout)**:
   - Two opposing horizontal or vertical rows (e.g., 2x4, 2x6, 2x8) for head-to-head or dual-shelf brand displays.
4. **`up-down-rotation` (Split Dual-Row with Angled Cards)**:
   - Split dual rows with individualized deterministic card angles for a dynamic card game feel.

---

## 3. Card Deck Generation & State Engine

- **Pair Generation**:
  - Total cards = `rows * cols` (or `pairCount * 2`).
  - Generate exactly `N / 2` pairs with identical `pairId` and matching visual assets.
  - Shuffle cards using a deterministic Fisher-Yates shuffle algorithm.
- **Card States**:
  - `isFlipped`: Currently flipped face-up during gameplay.
  - `isMatched`: Successfully paired and locked open or faded.
  - `isShaking`: Mismatched feedback animation state (triggers brief shake effect before flipping back).
- **Mismatch Delay**:
  - Configurable pause (`mismatchDelayMs`, typically 600ms to 1200ms) before unflipping two non-matching cards, during which player input is locked.

---

## 4. Scoring, Combos & Speed Bonuses

Scoring logic is implemented in `src/games/memory-match/scoring.ts` (and validated server-side in `server/games/memoryMatchScoring.ts`):

- **Base Match Points**: Points awarded per successfully paired cards (e.g., 100 pts).
- **Streak & Combo Multiplier**: Consecutive successful matches without a mismatch increment the combo streak (e.g., +30 pts per active combo tier).
- **Time Remaining Bonus**: Fast clears receive bonus points calculated from remaining countdown seconds.
- **Efficiency Bonus**: Fewer total turns/attempts awards additional perfection bonuses.

---

## 5. Audio & Sound Synthesis

- Sound synthesis is located in `src/games/memory-match/memorySounds.ts`.
- Uses Web Audio API oscillator synthesis:
  - `playCardFlipSound()`: Subtle acoustic card turn click.
  - `playCardMatchSound()`: Harmonious celebratory chime with pitch scaling for combos.
  - `playCardMismatchSound()`: Gentle low-pitch error tone.
  - `playGameCompleteSound()`: Ascending victory fanfare.
- Must honor player and theme mute preferences (`soundEnabled`, `soundVolume`).

---

## 6. Result Screen & Custom Visual Renderer

- Uses `ResultScreenRenderer.tsx` and `ResultElementContent.tsx` to render rich, brandable post-game victory screens.
- Displays final score, time elapsed, moves count, accuracy percentage, and leaderboard rank.
