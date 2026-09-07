import { normalizeBoardConfig, generateUpDownCardPositions, generateCardPositions } from '../../src/games/memory-match/memoryMatchBoardLayout';
import { getMemoryMatchConfig } from '../../src/themes/types';
import { normalizeGameTheme } from '../../src/themes/registry';
import { createShuffledDeck } from '../../src/games/memory-match/cardDeck';

function runTests() {
  console.log('--- TEST 1: normalizeBoardConfig preserves up-down and up-down-rotation ---');
  const upDownBoard = normalizeBoardConfig({ layoutMode: 'up-down', rows: 4, cols: 4 });
  if (upDownBoard.layoutMode !== 'up-down') {
    throw new Error(`FAILED: expected up-down, got ${upDownBoard.layoutMode}`);
  }

  const upDownRotBoard = normalizeBoardConfig({ layoutMode: 'up-down-rotation', rows: 4, cols: 5 });
  if (upDownRotBoard.layoutMode !== 'up-down-rotation') {
    throw new Error(`FAILED: expected up-down-rotation, got ${upDownRotBoard.layoutMode}`);
  }
  console.log('PASSED: normalizeBoardConfig correctly handles both new layout modes');

  console.log('--- TEST 2: getMemoryMatchConfig resolves up-down layout modes from theme game_config ---');
  const themeWithUpDown = normalizeGameTheme({
    id: 'test-up-down-theme',
    name: 'Up Down Test Theme',
    game_slug: 'memory-match',
    game_config: {
      board: {
        layoutMode: 'up-down',
        rows: 4,
        cols: 4,
      },
    },
  });

  const resolvedConfig = getMemoryMatchConfig(themeWithUpDown);
  if (resolvedConfig.board.layoutMode !== 'up-down') {
    throw new Error(`FAILED: getMemoryMatchConfig expected up-down, got ${resolvedConfig.board.layoutMode}`);
  }

  const themeWithUpDownRot = normalizeGameTheme({
    id: 'test-up-down-rot-theme',
    name: 'Up Down Rotation Test Theme',
    game_slug: 'memory-match',
    game_config: {
      board: {
        layoutMode: 'up-down-rotation',
        rows: 3,
        cols: 4,
      },
    },
  });

  const resolvedRotConfig = getMemoryMatchConfig(themeWithUpDownRot);
  if (resolvedRotConfig.board.layoutMode !== 'up-down-rotation') {
    throw new Error(`FAILED: getMemoryMatchConfig expected up-down-rotation, got ${resolvedRotConfig.board.layoutMode}`);
  }
  console.log('PASSED: getMemoryMatchConfig correctly resolves new layout modes from game_config');

  console.log('--- TEST 3: generateUpDownCardPositions generates valid alternating positions within boundaries ---');
  const positions16 = generateUpDownCardPositions(16, { rows: 4, cols: 4, layoutMode: 'up-down' }, undefined, false);
  if (positions16.length !== 16) {
    throw new Error(`FAILED: expected 16 positions, got ${positions16.length}`);
  }

  for (let i = 0; i < positions16.length; i++) {
    const pos = positions16[i];
    const halfW = pos.widthPercent / 2;
    const halfH = pos.heightPercent / 2;
    const leftEdge = pos.x - halfW;
    const rightEdge = pos.x + halfW;
    const topEdge = pos.y - halfH;
    const bottomEdge = pos.y + halfH;

    if (leftEdge < 0 || rightEdge > 100 || topEdge < 0 || bottomEdge > 100) {
      throw new Error(`FAILED: card ${i} out of bounds: left=${leftEdge}, right=${rightEdge}, top=${topEdge}, bottom=${bottomEdge}`);
    }

    if (pos.rotation !== 0) {
      throw new Error(`FAILED: expected 0 rotation for up-down mode, got ${pos.rotation}`);
    }
  }

  // Verify alternating Up-Down pattern between adjacent columns in same row
  const row0col0 = positions16[0]; // even col -> Up (lower y)
  const row0col1 = positions16[1]; // odd col -> Down (higher y)
  if (row0col0.y >= row0col1.y) {
    throw new Error(`FAILED: expected col 0 (Up, y=${row0col0.y}) to have lower y than col 1 (Down, y=${row0col1.y})`);
  }

  console.log('PASSED: generateUpDownCardPositions respects boundaries and alternates vertical positions');

  console.log('--- TEST 4: generateCardPositions with up-down-rotation generates valid rotation values ---');
  const rotPositions = generateCardPositions(16, {
    rows: 4,
    cols: 4,
    layoutMode: 'up-down-rotation',
    randomLayout: { minSpacing: 12, rotationMin: -8, rotationMax: 8 },
  });

  if (rotPositions.length !== 16) {
    throw new Error(`FAILED: expected 16 positions, got ${rotPositions.length}`);
  }

  let hasNonZeroRotation = false;
  for (const pos of rotPositions) {
    if (pos.rotation < -8.5 || pos.rotation > 8.5) {
      throw new Error(`FAILED: rotation ${pos.rotation} out of range [-8, 8]`);
    }
    if (pos.rotation !== 0) {
      hasNonZeroRotation = true;
    }
  }

  if (!hasNonZeroRotation) {
    throw new Error('FAILED: expected some non-zero rotations in up-down-rotation mode');
  }

  console.log('PASSED: generateCardPositions with up-down-rotation applies random rotation within range');

  console.log('--- TEST 5: Card dimensions are authoritative and independent from layout mode ---');
  const customCard = { width: 80, height: 120, borderRadius: 12, rotation: 0, rotationMode: 'none' as const };
  const modes = ['grid', 'random', 'up-down', 'up-down-rotation'] as const;

  for (const mode of modes) {
    const cardPositions = generateCardPositions(
      16,
      { rows: 4, cols: 4, layoutMode: mode, card: customCard },
      customCard
    );

    for (let i = 0; i < cardPositions.length; i++) {
      const pos = cardPositions[i];
      if (pos.width !== 80) {
        throw new Error(`FAILED: Mode ${mode} altered card width to ${pos.width}, expected 80`);
      }
      if (pos.height !== 120) {
        throw new Error(`FAILED: Mode ${mode} altered card height to ${pos.height}, expected 120`);
      }
    }
  }
  console.log('PASSED: All layouts preserve authoritative 80x120 card dimensions without modification');

  console.log('--- TEST 6: Changing layoutMode changes X/Y position only, not card dimensions ---');
  const upDownResult = generateCardPositions(8, { rows: 2, cols: 4, layoutMode: 'up-down', card: customCard }, customCard);
  const randomResult = generateCardPositions(8, { rows: 2, cols: 4, layoutMode: 'random', card: customCard }, customCard);

  // Width and height must be identical across modes
  if (upDownResult[0].width !== randomResult[0].width || upDownResult[0].height !== randomResult[0].height) {
    throw new Error('FAILED: Card dimensions differ between up-down and random layout modes');
  }
  console.log('PASSED: Card size remains fixed while layout mode controls position only');

  console.log('--- TEST 7: Verify all board presets across all 4 layout modes maintain exact card and position counts ---');
  const presets = [
    { rows: 2, cols: 4, expectedCards: 8, expectedPairs: 4 },
    { rows: 3, cols: 4, expectedCards: 12, expectedPairs: 6 },
    { rows: 4, cols: 4, expectedCards: 16, expectedPairs: 8 },
    { rows: 2, cols: 8, expectedCards: 16, expectedPairs: 8 },
  ];
  const layoutModes = ['grid', 'random', 'up-down', 'up-down-rotation'] as const;

  for (const preset of presets) {
    for (const mode of layoutModes) {
      const theme = normalizeGameTheme({
        id: `preset-${preset.rows}x${preset.cols}-${mode}`,
        name: `Preset ${preset.rows}x${preset.cols}`,
        game_slug: 'memory-match',
        game_config: {
          board: {
            rows: preset.rows,
            cols: preset.cols,
            layoutMode: mode,
          },
        },
      });

      const deck = createShuffledDeck(theme);
      if (deck.length !== preset.expectedCards) {
        throw new Error(`FAILED: Preset ${preset.rows}x${preset.cols} in ${mode} produced ${deck.length} cards, expected ${preset.expectedCards}`);
      }

      // Verify pair counts in deck
      const pairCounts = new Map<string, number>();
      for (const card of deck) {
        pairCounts.set(card.pairId, (pairCounts.get(card.pairId) || 0) + 1);
      }
      if (pairCounts.size !== preset.expectedPairs) {
        throw new Error(`FAILED: Preset ${preset.rows}x${preset.cols} in ${mode} has ${pairCounts.size} pairs, expected ${preset.expectedPairs}`);
      }
      for (const [pairId, count] of pairCounts.entries()) {
        if (count !== 2) {
          throw new Error(`FAILED: Pair ${pairId} has ${count} cards, expected exactly 2`);
        }
      }

      // Verify positions match cards count
      const positions = generateCardPositions(deck.length, {
        rows: preset.rows,
        cols: preset.cols,
        layoutMode: mode,
      });
      if (positions.length !== deck.length) {
        throw new Error(`FAILED: Preset ${preset.rows}x${preset.cols} in ${mode} generated ${positions.length} positions, expected ${deck.length}`);
      }
    }
  }
  console.log('PASSED: All standard presets (2x4, 3x4, 4x4, 2x8) maintain exact counts across all 4 layout modes');

  console.log('--- TEST 8: Configured library with 16 pairs on 3x4 board strictly yields 12 cards (6 pairs) in all layout modes ---');
  const library16Pairs = Array.from({ length: 16 }, (_, i) => ({
    id: `custom_pair_${i + 1}`,
    name: `Custom Pair ${i + 1}`,
    imageUrl: `https://example.com/item_${i + 1}.png`,
    points: 100,
  }));

  for (const mode of layoutModes) {
    const themeWith16Pairs = normalizeGameTheme({
      id: `theme-16-pairs-${mode}`,
      name: '16 Pairs Theme',
      game_slug: 'memory-match',
      game_config: {
        board: {
          rows: 3,
          cols: 4,
          layoutMode: mode,
        },
        pairs: library16Pairs,
      },
    });

    const deck12 = createShuffledDeck(themeWith16Pairs);
    if (deck12.length !== 12) {
      throw new Error(`FAILED: Theme with 16 configured pairs on 3x4 board produced ${deck12.length} cards in ${mode}, expected 12`);
    }

    const uniquePairIds = new Set(deck12.map((c) => c.pairId));
    if (uniquePairIds.size !== 6) {
      throw new Error(`FAILED: Expected exactly 6 unique pairs, got ${uniquePairIds.size}`);
    }

    // Must strictly be the first 6 active pairs (custom_pair_1 through custom_pair_6)
    for (const card of deck12) {
      const pairNum = parseInt(card.pairId.replace('custom_pair_', ''), 10);
      if (pairNum > 6) {
        throw new Error(`FAILED: Card from inactive pair ${card.pairId} leaked into 3x4 board deck`);
      }
    }

    const positions12 = generateCardPositions(deck12.length, {
      rows: 3,
      cols: 4,
      layoutMode: mode,
    });
    if (positions12.length !== 12) {
      throw new Error(`FAILED: Expected 12 positions in mode ${mode}, got ${positions12.length}`);
    }
  }
  console.log('PASSED: Theme library with extra pairs only activates first 6 pairs on 3x4 board across all layout modes');

  console.log('--- TEST 9: Switching layoutMode keeps card count identical ---');
  const baseTheme = normalizeGameTheme({
    id: 'base-theme-layout-switching',
    name: 'Layout Switch Theme',
    game_slug: 'memory-match',
    game_config: {
      board: { rows: 3, cols: 4, layoutMode: 'grid' },
    },
  });

  const gridDeck = createShuffledDeck(baseTheme);
  const randomDeck = createShuffledDeck({
    ...baseTheme,
    game_config: { ...baseTheme.game_config, board: { rows: 3, cols: 4, layoutMode: 'random' } },
  });
  const upDownDeck = createShuffledDeck({
    ...baseTheme,
    game_config: { ...baseTheme.game_config, board: { rows: 3, cols: 4, layoutMode: 'up-down' } },
  });
  const upDownRotDeck = createShuffledDeck({
    ...baseTheme,
    game_config: { ...baseTheme.game_config, board: { rows: 3, cols: 4, layoutMode: 'up-down-rotation' } },
  });

  if (gridDeck.length !== 12 || randomDeck.length !== 12 || upDownDeck.length !== 12 || upDownRotDeck.length !== 12) {
    throw new Error('FAILED: Card count varied across layout modes!');
  }
  console.log('PASSED: Switching layout mode keeps card count strictly invariant at 12 cards');

  console.log('ALL MEMORY MATCH UP-DOWN & CARD-COUNT TESTS PASSED!');
}

runTests();
