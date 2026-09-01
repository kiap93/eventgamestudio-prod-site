import {
  calculateBoardDimensions,
  normalizeBoardConfig,
  validateBoardLayout,
  calculateGridLayout,
  generateUpDownCardPositions,
  generateCardPositions,
  MIN_BOARD_ROWS,
  MAX_BOARD_ROWS,
  MIN_BOARD_COLS,
  MAX_BOARD_COLS,
  MAX_TOTAL_CARDS,
} from '../../src/games/memory-match/memoryMatchBoardLayout';
import { getMemoryMatchConfig } from '../../src/themes/types';
import { normalizeGameTheme } from '../../src/themes/registry';
import { createShuffledDeck } from '../../src/games/memory-match/cardDeck';

function runTests() {
  console.log('=== TEST 1: Board Limits Constants ===');
  if (MIN_BOARD_ROWS !== 2 || MAX_BOARD_ROWS !== 8) {
    throw new Error(`FAILED: Invalid row limits ${MIN_BOARD_ROWS}-${MAX_BOARD_ROWS}`);
  }
  if (MIN_BOARD_COLS !== 2 || MAX_BOARD_COLS !== 8) {
    throw new Error(`FAILED: Invalid col limits ${MIN_BOARD_COLS}-${MAX_BOARD_COLS}`);
  }
  if (MAX_TOTAL_CARDS !== 48) {
    throw new Error(`FAILED: Invalid MAX_TOTAL_CARDS ${MAX_TOTAL_CARDS}`);
  }
  console.log('PASSED: Constants verified.');

  console.log('=== TEST 2: calculateBoardDimensions for 2x8 and wide configurations ===');
  const dims2x8 = calculateBoardDimensions(2, 8);
  if (dims2x8.rows !== 2 || dims2x8.cols !== 8 || dims2x8.totalCards !== 16 || !dims2x8.isEven || dims2x8.requiredPairs !== 8) {
    throw new Error(`FAILED: 2x8 calculation mismatch: ${JSON.stringify(dims2x8)}`);
  }

  const dims3x8 = calculateBoardDimensions(3, 8);
  if (dims3x8.rows !== 3 || dims3x8.cols !== 8 || dims3x8.totalCards !== 24 || !dims3x8.isEven || dims3x8.requiredPairs !== 12) {
    throw new Error(`FAILED: 3x8 calculation mismatch: ${JSON.stringify(dims3x8)}`);
  }

  const dims4x8 = calculateBoardDimensions(4, 8);
  if (dims4x8.rows !== 4 || dims4x8.cols !== 8 || dims4x8.totalCards !== 32 || !dims4x8.isEven || dims4x8.requiredPairs !== 16) {
    throw new Error(`FAILED: 4x8 calculation mismatch: ${JSON.stringify(dims4x8)}`);
  }

  const dims5x8 = calculateBoardDimensions(5, 8);
  if (dims5x8.rows !== 5 || dims5x8.cols !== 8 || dims5x8.totalCards !== 40 || !dims5x8.isEven || dims5x8.requiredPairs !== 20) {
    throw new Error(`FAILED: 5x8 calculation mismatch: ${JSON.stringify(dims5x8)}`);
  }

  const dims6x8 = calculateBoardDimensions(6, 8);
  if (dims6x8.rows !== 6 || dims6x8.cols !== 8 || dims6x8.totalCards !== 48 || !dims6x8.isEven || dims6x8.requiredPairs !== 24) {
    throw new Error(`FAILED: 6x8 calculation mismatch: ${JSON.stringify(dims6x8)}`);
  }
  console.log('PASSED: calculateBoardDimensions handles 2x8 through 6x8 accurately.');

  console.log('=== TEST 3: normalizeBoardConfig does NOT clamp cols=8 back to cols=6 ===');
  const normalized2x8 = normalizeBoardConfig({ rows: 2, cols: 8, layoutMode: 'grid' });
  if (normalized2x8.rows !== 2 || normalized2x8.cols !== 8) {
    throw new Error(`FAILED: normalizeBoardConfig clamped 2x8 to ${normalized2x8.rows}x${normalized2x8.cols}`);
  }

  const normalized6x8 = normalizeBoardConfig({ rows: 6, cols: 8, layoutMode: 'grid' });
  if (normalized6x8.rows !== 6 || normalized6x8.cols !== 8) {
    throw new Error(`FAILED: normalizeBoardConfig clamped 6x8 to ${normalized6x8.rows}x${normalized6x8.cols}`);
  }
  console.log('PASSED: normalizeBoardConfig maintains cols=8.');

  console.log('=== TEST 4: validateBoardLayout validation rules ===');
  const valid2x8 = validateBoardLayout({ rows: 2, cols: 8 });
  if (!valid2x8.isValid || valid2x8.totalCards !== 16 || valid2x8.requiredPairs !== 8) {
    throw new Error(`FAILED: 2x8 failed validation: ${JSON.stringify(valid2x8)}`);
  }

  const odd5x7 = validateBoardLayout({ rows: 5, cols: 7 });
  if (odd5x7.isValid) {
    throw new Error(`FAILED: 5x7 odd card count should be invalid`);
  }

  const overLimit8x8 = validateBoardLayout({ rows: 8, cols: 8 });
  if (overLimit8x8.isValid) {
    throw new Error(`FAILED: 8x8 total 64 cards exceeds 48 max limit, should be invalid`);
  }
  console.log('PASSED: validateBoardLayout properly checks evenness and limits.');

  console.log('=== TEST 5: getMemoryMatchConfig resolves 2x8 from theme ===');
  const theme2x8 = normalizeGameTheme({
    id: 'test-2x8-theme',
    name: '2x8 Test Theme',
    game_slug: 'memory-match',
    game_config: {
      board: {
        layoutMode: 'grid',
        rows: 2,
        cols: 8,
      },
    },
  });

  const resolved2x8 = getMemoryMatchConfig(theme2x8);
  if (resolved2x8.board.rows !== 2 || resolved2x8.board.cols !== 8) {
    throw new Error(`FAILED: getMemoryMatchConfig resolved 2x8 as ${resolved2x8.board.rows}x${resolved2x8.board.cols}`);
  }
  console.log('PASSED: getMemoryMatchConfig resolves 2x8 configuration.');

  console.log('=== TEST 6: createShuffledDeck builds 16 cards (8 pairs) for 2x8 ===');
  const deck = createShuffledDeck(theme2x8);
  if (deck.length !== 16) {
    throw new Error(`FAILED: createShuffledDeck expected 16 cards, got ${deck.length}`);
  }

  // Verify there are exactly 8 distinct pairIds and 2 cards per pairId
  const pairCounts = new Map<string, number>();
  for (const card of deck) {
    pairCounts.set(card.pairId, (pairCounts.get(card.pairId) || 0) + 1);
  }
  if (pairCounts.size !== 8) {
    throw new Error(`FAILED: expected 8 unique pairIds, got ${pairCounts.size}`);
  }
  for (const [pairId, count] of pairCounts.entries()) {
    if (count !== 2) {
      throw new Error(`FAILED: pairId ${pairId} has ${count} cards, expected exactly 2`);
    }
  }
  console.log('PASSED: createShuffledDeck creates 16 cards forming 8 balanced matching pairs.');

  console.log('=== TEST 7: calculateGridLayout and positions for 2x8 ===');
  const gridLayout = calculateGridLayout(2, 8, 12, { width: 120, height: 120 });
  if (gridLayout.gridTemplateColumns !== 'repeat(8, minmax(0, 1fr))') {
    throw new Error(`FAILED: gridTemplateColumns expected 8 cols, got ${gridLayout.gridTemplateColumns}`);
  }
  if (gridLayout.gridTemplateRows !== 'repeat(2, minmax(0, 1fr))') {
    throw new Error(`FAILED: gridTemplateRows expected 2 rows, got ${gridLayout.gridTemplateRows}`);
  }

  const upDownPositions = generateUpDownCardPositions(16, { rows: 2, cols: 8, layoutMode: 'up-down' });
  if (upDownPositions.length !== 16) {
    throw new Error(`FAILED: upDownPositions expected 16, got ${upDownPositions.length}`);
  }
  for (let i = 0; i < upDownPositions.length; i++) {
    const pos = upDownPositions[i];
    const halfW = pos.widthPercent / 2;
    const halfH = pos.heightPercent / 2;
    if (pos.x - halfW < 0 || pos.x + halfW > 100 || pos.y - halfH < 0 || pos.y + halfH > 100) {
      throw new Error(`FAILED: card ${i} in 2x8 out of bounds`);
    }
  }
  console.log('PASSED: calculateGridLayout and card positions for 2x8 verified.');

  console.log('ALL TESTS PASSED SUCCESSFULLY!');
}

runTests();
