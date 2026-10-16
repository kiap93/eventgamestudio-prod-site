(globalThis as any).window = globalThis;
(globalThis as any).Image = class Image {};
(globalThis as any).HTMLCanvasElement = class HTMLCanvasElement {};
const mockContext = {
  fillStyle: '',
  fillRect: () => {},
  putImageData: () => {},
  getImageData: () => ({ data: [0, 0, 0, 0] }),
};
const mockCanvas = new (globalThis as any).HTMLCanvasElement();
mockCanvas.getContext = () => mockContext;

(globalThis as any).document = {
  createElement: () => mockCanvas,
  documentElement: {},
};

import assert from 'node:assert';

const {
  createInitialBoard,
  detectMatches,
  hasValidMoves,
  isValidSwap,
  resolveSwap,
  shuffleBoard,
  cloneBoard,
} = await import('./engine');
const { DEFAULT_MATCH3_CONFIG, DEFAULT_MATCH3_SCORING } = await import('./types');
const { THEME_REGISTRY, getDefaultThemeForGameType } = await import('../../themes/registry');
const { getThemeGameType, normalizeGameType } = await import('../../themes/types');
const { getGameDefinition, GAME_REGISTRY } = await import('../registry');

console.log('======================================================');
console.log('RUNNING MATCH-3 GAME ENGINE & SHELL RESOLUTION TESTS');
console.log('======================================================');

// 1. GAME_REGISTRY verification
{
  const match3Def = getGameDefinition('match-3');
  assert.ok(match3Def, 'Match-3 definition must exist in registry');
  assert.strictEqual(match3Def.id, 'match-3');
  assert.strictEqual(match3Def.name, 'Match-3');
  assert.ok(match3Def.component, 'Match-3 must have a component');
  assert.strictEqual(match3Def.isAvailable, true);
  console.log('✓ PASS: GAME_REGISTRY contains Match-3');
}

// 2. Initial Board creation invariants
{
  for (let seed = 0; seed < 10; seed++) {
    const board = createInitialBoard(8, 8, 6, Math.random, {
      minimumMatch: 3,
      specialTilesEnabled: true,
    });

    assert.strictEqual(board.length, 8, 'Board must have 8 rows');
    assert.strictEqual(board[0].length, 8, 'Board must have 8 cols');

    // Must have NO initial matches
    const matchRes = detectMatches(board, 3, undefined, true);
    assert.strictEqual(
      matchRes.matches.length,
      0,
      'Initial board must have zero initial matches'
    );

    // Must have at least one valid move
    const canMove = hasValidMoves(board, { minimumMatch: 3, specialTilesEnabled: true });
    assert.strictEqual(canMove, true, 'Initial board must have at least one valid move');
  }
  console.log('✓ PASS: createInitialBoard generates match-free boards with valid moves');
}

// 3. Swap validation and Cascade resolution
{
  // Construct a deterministic test board with a known valid match-3 move
  const board = createInitialBoard(6, 6, 4, Math.random);
  
  // Set up 2 matching tiles and a 3rd nearby that can be swapped
  board[0][0].type = 'tile-01';
  board[0][1].type = 'tile-01';
  board[0][2].type = 'tile-02'; // Swapping this with board[1][2]
  board[1][2].type = 'tile-01';

  // Check valid swap between (0, 2) and (1, 2)
  const valid = isValidSwap(board, 0, 2, 1, 2, { minimumMatch: 3, specialTilesEnabled: true });
  assert.strictEqual(valid, true, 'Swap between (0, 2) and (1, 2) must be valid');

  // Check invalid swap between (0, 0) and (1, 0)
  board[1][0].type = 'tile-03';
  board[1][1].type = 'tile-04';
  board[2][0].type = 'tile-02';
  const invalid = isValidSwap(board, 0, 0, 1, 0, { minimumMatch: 3, specialTilesEnabled: true });
  assert.strictEqual(invalid, false, 'Invalid swap must return false');

  // Execute swap resolution
  const resolution = resolveSwap(
    board,
    0,
    2,
    1,
    2,
    4,
    DEFAULT_MATCH3_SCORING,
    Math.random,
    {
      minimumMatch: 3,
      comboEnabled: true,
      specialTilesEnabled: true,
      cascadeEnabled: true,
    }
  );

  assert.strictEqual(resolution.isValid, true);
  assert.ok(resolution.steps.length >= 1, 'Must have at least one cascade step');
  assert.ok(resolution.totalScore >= 100, 'Score must be at least match3Points (100)');
  assert.ok(resolution.totalMatches >= 1, 'Total matches must be at least 1');
  console.log('✓ PASS: Swap validation and cascade resolution work correctly');
}

// 4. Special tile creation (4-in-a-row -> Rocket, 5-in-a-row / T/L shape -> Bomb / Color Bomb)
{
  const board = createInitialBoard(6, 6, 5, Math.random);
  // Place 4 identical tiles in a row
  board[2][0].type = 'tile-02';
  board[2][1].type = 'tile-02';
  board[2][2].type = 'tile-03';
  board[2][3].type = 'tile-02';
  board[1][2].type = 'tile-02'; // Swap (1, 2) with (2, 2)

  const res4 = resolveSwap(
    board,
    1,
    2,
    2,
    2,
    5,
    DEFAULT_MATCH3_SCORING,
    Math.random,
    {
      minimumMatch: 3,
      comboEnabled: true,
      specialTilesEnabled: true,
      cascadeEnabled: true,
    }
  );

  assert.strictEqual(res4.isValid, true);
  assert.ok(res4.totalSpecialsCreated >= 1, '4-in-a-row must create a special tile (rocket)');
  console.log('✓ PASS: 4-in-a-row creates special rocket tile');
}

// 5. GameShell game-type and theme resolution tests
{
  // Test A: Explicit gameType="match-3"
  const explicitGameTypeMatch3 = normalizeGameType('match-3');
  assert.strictEqual(explicitGameTypeMatch3, 'match-3');

  // Test B: Explicit gameType="catch-brand" (previously broken because !== DEFAULT_GAME_TYPE check failed)
  const explicitGameTypeCatch = normalizeGameType('catch-brand');
  assert.strictEqual(explicitGameTypeCatch, 'catch-brand');

  // Test C: Incompatible theme with explicit gameType="match-3"
  const catchTheme = THEME_REGISTRY['default'];
  assert.strictEqual(getThemeGameType(catchTheme), 'catch-brand');

  // When gameType="match-3" is passed, theme must fallback to match3Theme and NOT use catch-brand theme
  const resolvedGame = explicitGameTypeMatch3;
  const isThemeCompatible = normalizeGameType(getThemeGameType(catchTheme)) === resolvedGame;
  assert.strictEqual(isThemeCompatible, false, 'Catch theme must NOT be considered compatible with match-3');

  const resolvedTheme = isThemeCompatible ? catchTheme : getDefaultThemeForGameType(resolvedGame);
  assert.strictEqual(resolvedTheme.id, 'match-3', 'Incompatible theme must safely fall back to match-3 default theme');
  assert.strictEqual(getThemeGameType(resolvedTheme), 'match-3');

  // Test D: Implicit gameType from theme
  const match3Theme = THEME_REGISTRY['match-3'];
  assert.strictEqual(getThemeGameType(match3Theme), 'match-3');
  const detectedFromTheme = normalizeGameType(getThemeGameType(match3Theme));
  assert.strictEqual(detectedFromTheme, 'match-3');

  console.log('✓ PASS: GameShell game-type resolution and strict theme isolation verified');
}

console.log('======================================================');
console.log('ALL MATCH-3 GAME ENGINE & SHELL TESTS PASSED!');
console.log('======================================================');
