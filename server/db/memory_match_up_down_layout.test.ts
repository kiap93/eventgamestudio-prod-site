import { normalizeBoardConfig, generateUpDownCardPositions, generateCardPositions } from '../../src/games/memory-match/memoryMatchBoardLayout';
import { getMemoryMatchConfig } from '../../src/themes/types';
import { normalizeGameTheme } from '../../src/themes/registry';

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

  console.log('ALL MEMORY MATCH UP-DOWN TESTS PASSED!');
}

runTests();
