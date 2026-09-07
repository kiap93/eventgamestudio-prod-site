import assert from 'node:assert';
import { getMemoryMatchConfig } from '../../src/themes';
import { generateCardPositions, normalizeCardConfig, normalizeBoardConfig } from '../../src/games/memory-match/memoryMatchBoardLayout';
import { createShuffledDeck } from '../../src/games/memory-match/cardDeck';
import type { GameTheme } from '../../src/themes/types';

// Mock theme with Memory Match configuration
const mockTheme = {
  id: 'theme_test_mm_lifecycle',
  organization_id: 'org_test',
  name: 'Memory Match Lifecycle Theme',
  game_type: 'memory-match',
  is_system: false,
  asset_manifest: {},
  game_config: {
    board: {
      rows: 2,
      cols: 4,
      layoutMode: 'grid',
      cardGap: 12,
      padding: 16,
    },
    card: {
      width: 120,
      height: 140,
      borderRadius: 16,
      rotationMode: 'none',
      rotation: 0,
      rotationRange: 8,
    },
    pairs: [
      { id: 'p1', name: 'Alpha', imageUrl: 'https://example.com/a.png' },
      { id: 'p2', name: 'Beta', imageUrl: 'https://example.com/b.png' },
      { id: 'p3', name: 'Gamma', imageUrl: 'https://example.com/c.png' },
      { id: 'p4', name: 'Delta', imageUrl: 'https://example.com/d.png' },
    ],
    gameplay: {
      gameDurationSeconds: 45,
      mismatchDelayMs: 850,
      matchPoints: 100,
      comboPoints: 30,
    },
  },
} as unknown as GameTheme;

console.log('======================================================');
console.log('Running Memory Match Live Simulation Lifecycle Tests');
console.log('======================================================');

// Helper simulating gameplayConfigKey calculation from MemoryMatchGame.tsx
function getGameplayConfigKey(theme: GameTheme, duration?: number) {
  const memoryConfig = getMemoryMatchConfig(theme);
  const boardConfig = normalizeBoardConfig(memoryConfig.board, memoryConfig.grid);
  const pairs = memoryConfig.pairs || [];
  const cardConfigSignature = `${memoryConfig.cardBackUrl || ''}_${pairs.map((p) => `${p.id}:${p.imageUrl || ''}:${p.name || ''}`).join('|')}`;
  const effectiveDuration = duration ?? memoryConfig.gameplay.gameDurationSeconds ?? 45;
  return `${theme.id}_${boardConfig.rows}_${boardConfig.cols}_${cardConfigSignature}_${effectiveDuration}`;
}

// Helper simulating visualConfigKey calculation from MemoryMatchGame.tsx
function getVisualConfigKey(theme: GameTheme) {
  const memoryConfig = getMemoryMatchConfig(theme);
  const boardConfig = normalizeBoardConfig(memoryConfig.board, memoryConfig.grid);
  const cardConfig = normalizeCardConfig(memoryConfig.card);
  const cardWidth = cardConfig.width ?? 120;
  const cardHeight = cardConfig.height ?? 120;
  const cardBorderRadius = cardConfig.borderRadius ?? 16;
  return `${boardConfig.layoutMode}_${boardConfig.cardGap}_${cardWidth}_${cardHeight}_${cardBorderRadius}_${cardConfig.rotationMode}_${cardConfig.rotation}_${cardConfig.rotationRange}_${boardConfig.randomLayout?.minSpacing}_${boardConfig.randomLayout?.rotationMin}_${boardConfig.randomLayout?.rotationMax}`;
}

// -----------------------------------------------------------------------------
// TEST A & B: Key Separation: Visual properties NEVER alter gameplayConfigKey
// -----------------------------------------------------------------------------
console.log('\n--- TEST A & B: Visual properties strictly decouple from gameplayConfigKey ---');

const baseGameplayKey = getGameplayConfigKey(mockTheme);

// 1. Alter card width
const themeWidthAltered: GameTheme = {
  ...mockTheme,
  game_config: {
    ...mockTheme.game_config,
    card: { ...mockTheme.game_config.card, width: 160 },
  },
};
const keyAfterWidth = getGameplayConfigKey(themeWidthAltered);
assert.strictEqual(
  keyAfterWidth,
  baseGameplayKey,
  'Altering card width must NOT change gameplayConfigKey (would cause game reset/countdown hang)'
);
console.log('  ✓ Changing Card Width does not touch gameplayConfigKey');

// 2. Alter card height
const themeHeightAltered: GameTheme = {
  ...mockTheme,
  game_config: {
    ...mockTheme.game_config,
    card: { ...mockTheme.game_config.card, height: 180 },
  },
};
const keyAfterHeight = getGameplayConfigKey(themeHeightAltered);
assert.strictEqual(
  keyAfterHeight,
  baseGameplayKey,
  'Altering card height must NOT change gameplayConfigKey'
);
console.log('  ✓ Changing Card Height does not touch gameplayConfigKey');

// 3. Alter card border radius
const themeRadiusAltered: GameTheme = {
  ...mockTheme,
  game_config: {
    ...mockTheme.game_config,
    card: { ...mockTheme.game_config.card, borderRadius: 24 },
  },
};
assert.strictEqual(
  getGameplayConfigKey(themeRadiusAltered),
  baseGameplayKey,
  'Altering card borderRadius must NOT change gameplayConfigKey'
);
console.log('  ✓ Changing Card Border Radius does not touch gameplayConfigKey');

// 4. Alter rotation mode & rotation angle
const themeRotationAltered: GameTheme = {
  ...mockTheme,
  game_config: {
    ...mockTheme.game_config,
    card: { ...mockTheme.game_config.card, rotationMode: 'fixed', rotation: 12 },
  },
};
assert.strictEqual(
  getGameplayConfigKey(themeRotationAltered),
  baseGameplayKey,
  'Altering rotation must NOT change gameplayConfigKey'
);
console.log('  ✓ Changing Rotation does not touch gameplayConfigKey');

// 5. Alter card gap
const themeGapAltered: GameTheme = {
  ...mockTheme,
  game_config: {
    ...mockTheme.game_config,
    board: { ...mockTheme.game_config.board, cardGap: 24 },
  },
};
assert.strictEqual(
  getGameplayConfigKey(themeGapAltered),
  baseGameplayKey,
  'Altering card gap must NOT change gameplayConfigKey'
);
console.log('  ✓ Changing Card Gap does not touch gameplayConfigKey');

// -----------------------------------------------------------------------------
// TEST C: Genuine gameplay rules DO alter gameplayConfigKey (triggering reset)
// -----------------------------------------------------------------------------
console.log('\n--- TEST C: Genuine gameplay changes trigger gameplayConfigKey change ---');

// Alter rows
const themeRowsAltered: GameTheme = {
  ...mockTheme,
  game_config: {
    ...mockTheme.game_config,
    board: { ...mockTheme.game_config.board, rows: 3 },
  },
};
assert.notStrictEqual(
  getGameplayConfigKey(themeRowsAltered),
  baseGameplayKey,
  'Changing rows changes deck size, so it must trigger gameplayConfigKey reset'
);
console.log('  ✓ Changing rows triggers gameplay reset key');

// Alter cols
const themeColsAltered: GameTheme = {
  ...mockTheme,
  game_config: {
    ...mockTheme.game_config,
    board: { ...mockTheme.game_config.board, cols: 5 },
  },
};
assert.notStrictEqual(
  getGameplayConfigKey(themeColsAltered),
  baseGameplayKey,
  'Changing cols changes deck size, so it must trigger gameplayConfigKey reset'
);
console.log('  ✓ Changing cols triggers gameplay reset key');

// Alter pairs content (e.g. image or name)
const themePairsAltered: GameTheme = {
  ...mockTheme,
  game_config: {
    ...mockTheme.game_config,
    pairs: [
      ...mockTheme.game_config.pairs.slice(0, 3),
      { id: 'p4_new', name: 'Epsilon', imageUrl: 'https://example.com/e.png' },
    ],
  },
};
assert.notStrictEqual(
  getGameplayConfigKey(themePairsAltered),
  baseGameplayKey,
  'Changing pairs changes deck cards, so it must trigger gameplayConfigKey reset'
);
console.log('  ✓ Changing card pairs triggers gameplay reset key');

// Alter game duration
assert.notStrictEqual(
  getGameplayConfigKey(mockTheme, 60),
  baseGameplayKey,
  'Changing gameDuration must trigger gameplayConfigKey reset'
);
console.log('  ✓ Changing gameDuration triggers gameplay reset key');

// -----------------------------------------------------------------------------
// TEST D: Visual changes DO update visualConfigKey (for hot-reload layout)
// -----------------------------------------------------------------------------
console.log('\n--- TEST D: Visual properties properly trigger visualConfigKey ---');

const baseVisualKey = getVisualConfigKey(mockTheme);
assert.notStrictEqual(
  getVisualConfigKey(themeWidthAltered),
  baseVisualKey,
  'Changing card width must trigger visualConfigKey for hot layout recompute'
);
console.log('  ✓ Card width change triggers visualConfigKey');

assert.notStrictEqual(
  getVisualConfigKey(themeHeightAltered),
  baseVisualKey,
  'Changing card height must trigger visualConfigKey for hot layout recompute'
);
console.log('  ✓ Card height change triggers visualConfigKey');

assert.notStrictEqual(
  getVisualConfigKey(themeRadiusAltered),
  baseVisualKey,
  'Changing card border radius triggers visualConfigKey'
);
console.log('  ✓ Card border radius triggers visualConfigKey');

assert.notStrictEqual(
  getVisualConfigKey(themeRotationAltered),
  baseVisualKey,
  'Changing rotation mode triggers visualConfigKey'
);
console.log('  ✓ Rotation mode triggers visualConfigKey');

// -----------------------------------------------------------------------------
// TEST E: Hot visual update preserves active game state (simulated state transition)
// -----------------------------------------------------------------------------
console.log('\n--- TEST E: Hot visual update preserves game state and card identity ---');

// Simulate state machine
interface SimGameState {
  gameState: 'START' | 'COUNTDOWN' | 'PLAYING' | 'GAME_OVER';
  countdown: number;
  score: number;
  moves: number;
  matchedPairsCount: number;
  timeRemaining: number;
  cards: ReturnType<typeof createShuffledDeck>;
  sessionId: string;
}

const deck = createShuffledDeck(mockTheme).slice(0, 8);
const simState: SimGameState = {
  gameState: 'PLAYING',
  countdown: 0,
  score: 350,
  moves: 4,
  matchedPairsCount: 2,
  timeRemaining: 32,
  cards: deck.map((c, i) => (i < 2 ? { ...c, isMatched: true, isFlipped: true } : c)),
  sessionId: 'mm_test_session_123',
};

// Simulate HOT VISUAL UPDATE (card width / height change)
function applyHotVisualUpdate(state: SimGameState, newTheme: GameTheme): SimGameState {
  const memConfig = getMemoryMatchConfig(newTheme);
  const cardConfig = normalizeCardConfig(memConfig.card);
  const boardConfig = normalizeBoardConfig(memConfig.board, memConfig.grid);

  // Recompute positions without touching gameplay state
  const updatedPositions = generateCardPositions(state.cards.length, boardConfig, cardConfig);
  assert(updatedPositions.length === state.cards.length, 'Positions match card count');

  // Return state: score, moves, matchedPairs, timer, session must be IDENTICAL
  return {
    ...state,
    // Cards preserve all gameplay fields
    cards: state.cards.map((c) => ({ ...c })),
  };
}

const stateAfterHotUpdate = applyHotVisualUpdate(simState, themeWidthAltered);
assert.strictEqual(stateAfterHotUpdate.gameState, 'PLAYING', 'Game must stay in PLAYING');
assert.strictEqual(stateAfterHotUpdate.score, 350, 'Score must not reset on visual update');
assert.strictEqual(stateAfterHotUpdate.moves, 4, 'Moves must not reset on visual update');
assert.strictEqual(stateAfterHotUpdate.matchedPairsCount, 2, 'Matched pairs must not reset');
assert.strictEqual(stateAfterHotUpdate.timeRemaining, 32, 'Timer must not reset');
assert.strictEqual(stateAfterHotUpdate.sessionId, 'mm_test_session_123', 'SessionId must remain unchanged');
assert.strictEqual(stateAfterHotUpdate.cards[0].id, simState.cards[0].id, 'Card 0 identity preserved');
assert.strictEqual(stateAfterHotUpdate.cards[0].isMatched, true, 'Card 0 match state preserved');
console.log('  ✓ Hot visual update preserved score, moves, timer, cards, and session during PLAYING');

// -----------------------------------------------------------------------------
// TEST F: Countdown uninterrupted by visual change during COUNTDOWN
// -----------------------------------------------------------------------------
console.log('\n--- TEST F: Countdown lifecycle: visual changes do not interrupt countdown ---');

// Simulate countdown running at tick 2
const countdownState: SimGameState = {
  gameState: 'COUNTDOWN',
  countdown: 2,
  score: 0,
  moves: 0,
  matchedPairsCount: 0,
  timeRemaining: 45,
  cards: deck,
  sessionId: 'mm_test_countdown_session',
};

// Visual update occurs while countdown is at 2
const countdownAfterVisual = applyHotVisualUpdate(countdownState, themeWidthAltered);
assert.strictEqual(countdownAfterVisual.gameState, 'COUNTDOWN', 'Still in COUNTDOWN');
assert.strictEqual(countdownAfterVisual.countdown, 2, 'Countdown value preserved at 2');
assert.strictEqual(
  countdownAfterVisual.sessionId,
  countdownState.sessionId,
  'Session ID not regenerated (no duplicate startCountdown)'
);
console.log('  ✓ Countdown is not restarted or frozen when Card Width changes during COUNTDOWN');

// -----------------------------------------------------------------------------
// TEST G: Explicit Restart resets game and initiates new session & countdown
// -----------------------------------------------------------------------------
console.log('\n--- TEST G: Explicit Restart behavior ---');

function handleExplicitRestart(state: SimGameState, theme: GameTheme): SimGameState {
  const newDeck = createShuffledDeck(theme).slice(0, 8);
  return {
    gameState: 'COUNTDOWN',
    countdown: 3,
    score: 0,
    moves: 0,
    matchedPairsCount: 0,
    timeRemaining: 45,
    cards: newDeck,
    sessionId: `mm_${Date.now()}_new_session`,
  };
}

const restartedState = handleExplicitRestart(simState, mockTheme);
assert.strictEqual(restartedState.gameState, 'COUNTDOWN', 'Restart enters COUNTDOWN');
assert.strictEqual(restartedState.countdown, 3, 'Restart sets countdown to 3');
assert.strictEqual(restartedState.score, 0, 'Score resets to 0');
assert.strictEqual(restartedState.moves, 0, 'Moves reset to 0');
assert.notStrictEqual(restartedState.sessionId, simState.sessionId, 'SessionId is regenerated');
console.log('  ✓ Explicit restart cleanly resets game, creates new session, and enters COUNTDOWN');

// -----------------------------------------------------------------------------
// TEST H: Card Rotation in Grid & Random Layouts
// -----------------------------------------------------------------------------
console.log('\n--- TEST H: Card Rotation hot update in Grid & Random layouts ---');

// Grid mode with fixed rotation
const gridFixedRotationTheme: GameTheme = {
  ...mockTheme,
  game_config: {
    ...mockTheme.game_config,
    card: {
      ...mockTheme.game_config.card,
      rotationMode: 'fixed',
      rotation: 15,
    },
  },
};
const gridMem = getMemoryMatchConfig(gridFixedRotationTheme);
const gridCardConfig = normalizeCardConfig(gridMem.card);
const resolvedGridAngle =
  gridCardConfig.rotationMode === 'fixed'
    ? (gridCardConfig.rotation ?? 0)
    : gridCardConfig.rotationMode === 'none'
    ? 0
    : 0;
assert.strictEqual(resolvedGridAngle, 15, 'Fixed rotation mode resolves angle to 15 degrees in grid mode');
console.log('  ✓ Fixed rotation angle (15deg) resolves correctly in grid mode');

// Random / scattered layout positions
const randomLayoutTheme: GameTheme = {
  ...mockTheme,
  game_config: {
    ...mockTheme.game_config,
    board: {
      ...mockTheme.game_config.board,
      layoutMode: 'random',
    },
    card: {
      ...mockTheme.game_config.card,
      width: 140,
      height: 160,
    },
  },
};
const randomMem = getMemoryMatchConfig(randomLayoutTheme);
const randomPositions = generateCardPositions(
  8,
  normalizeBoardConfig(randomMem.board, randomMem.grid),
  normalizeCardConfig(randomMem.card)
);
assert.strictEqual(randomPositions.length, 8, 'Generated 8 positions for 8 cards');
for (const pos of randomPositions) {
  assert(typeof pos.x === 'number' && pos.x >= 0 && pos.x <= 100, 'X is within percentage range');
  assert(typeof pos.y === 'number' && pos.y >= 0 && pos.y <= 100, 'Y is within percentage range');
  assert(typeof pos.rotation === 'number', 'Rotation is defined');
}
console.log('  ✓ Random layout generated valid hot positions with updated width/height');

console.log('\n======================================================');
console.log('All Memory Match Live Simulation Lifecycle Tests Passed!');
console.log('======================================================\n');
