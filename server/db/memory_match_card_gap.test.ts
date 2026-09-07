import {
  normalizeBoardConfig,
  generateUpDownCardPositions,
  generateCardPositions,
  calculateGridLayout,
} from '../../src/games/memory-match/memoryMatchBoardLayout';
import { getMemoryMatchConfig } from '../../src/themes/types';
import { normalizeGameTheme } from '../../src/themes/registry';
import { createShuffledDeck } from '../../src/games/memory-match/cardDeck';

console.log('=== TEST 1: normalizeBoardConfig preserves cardGap (0 to 80px range) ===');
const boardWithGap20 = normalizeBoardConfig({ cardGap: 20, layoutMode: 'grid', rows: 4, cols: 4 });
if (boardWithGap20.cardGap !== 20) {
  throw new Error(`FAILED: expected cardGap 20, got ${boardWithGap20.cardGap}`);
}

const boardWithGap40 = normalizeBoardConfig({ cardGap: 40, layoutMode: 'up-down', rows: 3, cols: 4 });
if (boardWithGap40.cardGap !== 40) {
  throw new Error(`FAILED: expected cardGap 40, got ${boardWithGap40.cardGap}`);
}

const boardWithGap0 = normalizeBoardConfig({ cardGap: 0, layoutMode: 'random', rows: 2, cols: 4 });
if (boardWithGap0.cardGap !== 0) {
  throw new Error(`FAILED: expected cardGap 0, got ${boardWithGap0.cardGap}`);
}
console.log('PASSED: normalizeBoardConfig correctly preserves cardGap values');

console.log('=== TEST 2: getMemoryMatchConfig resolves cardGap from theme configuration ===');
const themeWithCustomGap = normalizeGameTheme({
  id: 'test-card-gap-theme',
  name: 'Card Gap Test Theme',
  game_slug: 'memory-match',
  game_config: {
    board: {
      cardGap: 40,
      rows: 4,
      cols: 4,
      layoutMode: 'grid',
    },
    card: {
      width: 120,
      height: 120,
    },
  },
});

const resolvedConfig = getMemoryMatchConfig(themeWithCustomGap);
if (resolvedConfig.board.cardGap !== 40) {
  throw new Error(`FAILED: expected resolved cardGap 40, got ${resolvedConfig.board.cardGap}`);
}
if (resolvedConfig.card.width !== 120 || resolvedConfig.card.height !== 120) {
  throw new Error(`FAILED: expected card dimensions 120x120, got ${resolvedConfig.card.width}x${resolvedConfig.card.height}`);
}
console.log('PASSED: getMemoryMatchConfig correctly resolves cardGap: 40 without modifying card size');

console.log('=== TEST 3: Card Width and Height remain exactly authoritative regardless of Card Gap ===');
const gaps = [0, 10, 20, 40, 60];
const customCard = { width: 120, height: 120, borderRadius: 16, rotation: 0, rotationMode: 'none' as const };
const layoutModes = ['grid', 'random', 'up-down', 'up-down-rotation'] as const;

for (const gap of gaps) {
  for (const mode of layoutModes) {
    const positions = generateCardPositions(
      16,
      { rows: 4, cols: 4, layoutMode: mode, cardGap: gap, card: customCard },
      customCard
    );

    for (let i = 0; i < positions.length; i++) {
      const pos = positions[i];
      if (pos.width !== 120) {
        throw new Error(`FAILED: Gap ${gap} in mode ${mode} modified card width to ${pos.width}, expected 120`);
      }
      if (pos.height !== 120) {
        throw new Error(`FAILED: Gap ${gap} in mode ${mode} modified card height to ${pos.height}, expected 120`);
      }
    }
  }
}
console.log('PASSED: Card dimensions (120x120) remain strictly fixed across all gaps and all layout modes');

console.log('=== TEST 4: Grid layout uses cardGap for CSS gap without resizing cards ===');
const gridResult20 = calculateGridLayout(4, 4, 20, customCard);
if (gridResult20.gap !== '20px') {
  throw new Error(`FAILED: expected gap '20px', got '${gridResult20.gap}'`);
}

const gridResult40 = calculateGridLayout(4, 4, 40, customCard);
if (gridResult40.gap !== '40px') {
  throw new Error(`FAILED: expected gap '40px', got '${gridResult40.gap}'`);
}
console.log('PASSED: Grid layout correctly applies cardGap directly to grid gap');

console.log('=== TEST 5: Up-Down layout spacing respects cardGap ===');
const upDownPos20 = generateUpDownCardPositions(
  8,
  { rows: 2, cols: 4, layoutMode: 'up-down', cardGap: 20, card: customCard },
  customCard,
  false
);

const upDownPos40 = generateUpDownCardPositions(
  8,
  { rows: 2, cols: 4, layoutMode: 'up-down', cardGap: 40, card: customCard },
  customCard,
  false
);

// Verify all positions are strictly bounded
for (const pos of [...upDownPos20, ...upDownPos40]) {
  const halfW = pos.widthPercent / 2;
  const halfH = pos.heightPercent / 2;
  const leftEdge = pos.x - halfW;
  const rightEdge = pos.x + halfW;
  const topEdge = pos.y - halfH;
  const bottomEdge = pos.y + halfH;

  if (leftEdge < -0.1 || rightEdge > 100.1 || topEdge < -0.1 || bottomEdge > 100.1) {
    throw new Error(`FAILED: Up-down card out of bounds: left=${leftEdge}, right=${rightEdge}, top=${topEdge}, bottom=${bottomEdge}`);
  }
}
console.log('PASSED: Up-down layout respects bounds and applies cardGap cleanly');

console.log('=== TEST 6: Card Gap does NOT affect deck generation or card count ===');
for (const gap of [0, 20, 40, 60]) {
  const testTheme = normalizeGameTheme({
    id: `theme-gap-${gap}`,
    name: `Theme Gap ${gap}`,
    game_slug: 'memory-match',
    game_config: {
      board: {
        rows: 3,
        cols: 4,
        cardGap: gap,
        layoutMode: 'grid',
      },
    },
  });

  const deck = createShuffledDeck(testTheme);
  if (deck.length !== 12) {
    throw new Error(`FAILED: expected 12 cards for 3x4 board with gap ${gap}, got ${deck.length}`);
  }
}
console.log('PASSED: Deck generation and card count are completely independent of cardGap');

console.log('ALL MEMORY MATCH CARD GAP TESTS PASSED SUCCESSFULLY!');
