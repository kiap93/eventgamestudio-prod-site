import { test, expect } from 'bun:test';
import {
  createInitialBoard,
  detectMatches,
  resolveSwap,
  isValidSwap,
  hasValidMoves,
  shuffleBoard,
  cloneBoard,
} from '../../src/games/match-3/engine';
import {
  Match3Tile,
  DEFAULT_MATCH3_CONFIG,
  DEFAULT_TILE_DEFINITIONS,
} from '../../src/games/match-3/types';
import { CATALOG_GAMES } from './games';
import {
  isMatch3Theme,
} from '../../src/themes/types';
import {
  getDefaultThemeForGameType,
  DEFAULT_MATCH3_THEME,
} from './themes';
import { normalizeGameType } from '../../src/games/gameIcons';

test('createInitialBoard generates valid board with moves and no initial matches', () => {
  const board = createInitialBoard(8, 8, 6);
  expect(board.length).toBe(8);
  expect(board[0].length).toBe(8);

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const tile = board[r][c];
      expect(tile).toBeDefined();
      expect(tile.row).toBe(r);
      expect(tile.col).toBe(c);
      expect(tile.id).toBeDefined();
      expect(tile.type).toBeDefined();
    }
  }

  const initialMatches = detectMatches(board);
  expect(initialMatches.matches.length).toBe(0);

  const initialHasMoves = hasValidMoves(board);
  expect(initialHasMoves).toBe(true);
});

test('detectMatches finds horizontal and vertical 3-in-a-row matches', () => {
  const testBoard: Match3Tile[][] = [
    [
      { id: '1', row: 0, col: 0, type: 'tile-01' },
      { id: '2', row: 0, col: 1, type: 'tile-01' },
      { id: '3', row: 0, col: 2, type: 'tile-01' },
      { id: '4', row: 0, col: 3, type: 'tile-02' },
    ],
    [
      { id: '5', row: 1, col: 0, type: 'tile-02' },
      { id: '6', row: 1, col: 1, type: 'tile-03' },
      { id: '7', row: 1, col: 2, type: 'tile-04' },
      { id: '8', row: 1, col: 3, type: 'tile-02' },
    ],
    [
      { id: '9', row: 2, col: 0, type: 'tile-03' },
      { id: '10', row: 2, col: 1, type: 'tile-04' },
      { id: '11', row: 2, col: 2, type: 'tile-05' },
      { id: '12', row: 2, col: 3, type: 'tile-02' },
    ],
  ];

  const matchesFound = detectMatches(testBoard);
  expect(matchesFound.matches.length).toBe(2);
});

test('detectMatches generates Rocket for 4-in-a-row and Color Bomb for 5-in-a-row', () => {
  // 4 in a row -> rocket
  const rocketBoard: Match3Tile[][] = [
    [
      { id: 'r1', row: 0, col: 0, type: 'tile-01' },
      { id: 'r2', row: 0, col: 1, type: 'tile-01' },
      { id: 'r3', row: 0, col: 2, type: 'tile-01' },
      { id: 'r4', row: 0, col: 3, type: 'tile-01' },
    ],
  ];
  const rocketMatch = detectMatches(rocketBoard, 3, { row: 0, col: 1 });
  expect(rocketMatch.specialsToCreate.length).toBe(1);
  const createdSpecial = rocketMatch.specialsToCreate[0].special;
  expect(createdSpecial === 'rocket-horizontal' || createdSpecial === 'rocket-vertical').toBe(true);

  // 5 in a row -> color-bomb
  const colorBombBoard: Match3Tile[][] = [
    [
      { id: 'cb1', row: 0, col: 0, type: 'tile-01' },
      { id: 'cb2', row: 0, col: 1, type: 'tile-01' },
      { id: 'cb3', row: 0, col: 2, type: 'tile-01' },
      { id: 'cb4', row: 0, col: 3, type: 'tile-01' },
      { id: 'cb5', row: 0, col: 4, type: 'tile-01' },
    ],
  ];
  const cbMatch = detectMatches(colorBombBoard, 3, { row: 0, col: 2 });
  expect(cbMatch.specialsToCreate.length).toBe(1);
  expect(cbMatch.specialsToCreate[0].special).toBe('color-bomb');
});

test('resolveSwap validates swaps, rejects invalid swaps, and computes cascade steps', () => {
  const swapBoard: Match3Tile[][] = [
    [
      { id: 's1', row: 0, col: 0, type: 'tile-01' },
      { id: 's2', row: 0, col: 1, type: 'tile-02' },
      { id: 's3', row: 0, col: 2, type: 'tile-01' },
      { id: 's4', row: 0, col: 3, type: 'tile-01' },
    ],
    [
      { id: 's5', row: 1, col: 0, type: 'tile-03' },
      { id: 's6', row: 1, col: 1, type: 'tile-01' },
      { id: 's7', row: 1, col: 2, type: 'tile-04' },
      { id: 's8', row: 1, col: 3, type: 'tile-05' },
    ],
  ];

  // Invalid swap
  const invalidRes = resolveSwap(swapBoard, 0, 0, 1, 0);
  expect(invalidRes.isValid).toBe(false);

  // Valid swap
  const validRes = resolveSwap(swapBoard, 0, 1, 1, 1);
  expect(validRes.isValid).toBe(true);
  expect(validRes.totalScore).toBeGreaterThan(0);
  expect(validRes.totalMatches).toBeGreaterThanOrEqual(1);
  expect(validRes.steps.length).toBeGreaterThanOrEqual(1);
});

test('shuffleBoard successfully reshuffles board', () => {
  const board = createInitialBoard(8, 8, 6);
  const shuffled = shuffleBoard(board, 6);
  expect(shuffled.length).toBe(8);
  expect(shuffled[0].length).toBe(8);
});

test('Match-3 catalog, normalization, and isolation rules', () => {
  const match3Catalog = CATALOG_GAMES.find((g) => g.game_type === 'match-3');
  expect(match3Catalog).toBeDefined();
  expect(match3Catalog?.slug).toBe('match-3');
  expect(match3Catalog?.name).toBe('Match-3');
  expect(match3Catalog?.icon_name).toBe('Sparkles');

  expect(normalizeGameType('match-3')).toBe('match-3');
  expect(normalizeGameType('match3')).toBe('match-3');
  expect(normalizeGameType('Match-3 Cascade')).toBe('match-3');

  expect(match3Catalog?.slug).not.toBe('catch-brand');
  expect(match3Catalog?.slug).not.toBe('memory-match');
  expect(match3Catalog?.slug).not.toBe('reaction-tap');

  const defaultM3Theme = getDefaultThemeForGameType('match-3');
  expect(defaultM3Theme.slug).toBe('match-3');
  expect(isMatch3Theme(defaultM3Theme as any)).toBe(true);
  expect(isMatch3Theme({ game_type: 'catch-brand' } as any)).toBe(false);
  expect(isMatch3Theme({ game_type: 'memory-match' } as any)).toBe(false);
  expect(isMatch3Theme({ game_type: 'reaction-tap' } as any)).toBe(false);
});

test('Engine respects minimumMatch setting across detectMatches, isValidSwap, and resolveSwap', () => {
  // Board with 3-in-a-row ready setup:
  // (0,0)=tile-01, (0,1)=tile-02, (0,2)=tile-01, (0,3)=tile-01
  // (1,0)=tile-03, (1,1)=tile-01, (1,2)=tile-04, (1,3)=tile-05
  // Swapping (0,1) and (1,1) creates a 3-in-a-row of tile-01 at (0,0), (0,1), (0,2)
  const threeMatchBoard: Match3Tile[][] = [
    [
      { id: 't1', row: 0, col: 0, type: 'tile-01' },
      { id: 't2', row: 0, col: 1, type: 'tile-02' },
      { id: 't3', row: 0, col: 2, type: 'tile-01' },
      { id: 't4', row: 0, col: 3, type: 'tile-03' },
    ],
    [
      { id: 't5', row: 1, col: 0, type: 'tile-04' },
      { id: 't6', row: 1, col: 1, type: 'tile-01' },
      { id: 't7', row: 1, col: 2, type: 'tile-05' },
      { id: 't8', row: 1, col: 3, type: 'tile-06' },
    ],
  ];

  // 1. With minimumMatch = 3 (default): swap (0,1) with (1,1) is valid
  expect(isValidSwap(threeMatchBoard, 0, 1, 1, 1, 3)).toBe(true);
  const res3 = resolveSwap(threeMatchBoard, 0, 1, 1, 1, 6, undefined, undefined, { minimumMatch: 3 });
  expect(res3.isValid).toBe(true);
  expect(res3.totalMatches).toBeGreaterThanOrEqual(1);

  // 2. With minimumMatch = 4: swap (0,1) with (1,1) only creates 3-in-a-row, which must be REJECTED!
  expect(isValidSwap(threeMatchBoard, 0, 1, 1, 1, { minimumMatch: 4 })).toBe(false);
  const res4 = resolveSwap(threeMatchBoard, 0, 1, 1, 1, 6, undefined, undefined, { minimumMatch: 4 });
  expect(res4.isValid).toBe(false);
  expect(res4.steps.length).toBe(0);

  // 3. detectMatches with minimumMatch = 4 ignores 3-in-a-row
  const boardWith3 = [
    [
      { id: 'a1', row: 0, col: 0, type: 'tile-01' },
      { id: 'a2', row: 0, col: 1, type: 'tile-01' },
      { id: 'a3', row: 0, col: 2, type: 'tile-01' },
      { id: 'a4', row: 0, col: 3, type: 'tile-02' },
    ],
  ];
  expect(detectMatches(boardWith3, 3).matches.length).toBe(1);
  expect(detectMatches(boardWith3, 4).matches.length).toBe(0);

  // 4. detectMatches with minimumMatch = 4 recognizes 4-in-a-row
  const boardWith4 = [
    [
      { id: 'b1', row: 0, col: 0, type: 'tile-01' },
      { id: 'b2', row: 0, col: 1, type: 'tile-01' },
      { id: 'b3', row: 0, col: 2, type: 'tile-01' },
      { id: 'b4', row: 0, col: 3, type: 'tile-01' },
    ],
  ];
  expect(detectMatches(boardWith4, 4).matches.length).toBe(1);
});

test('Engine respects specialTilesEnabled: false and suppresses special tile generation', () => {
  // 4 in a row
  const fourBoard: Match3Tile[][] = [
    [
      { id: 'f1', row: 0, col: 0, type: 'tile-01' },
      { id: 'f2', row: 0, col: 1, type: 'tile-01' },
      { id: 'f3', row: 0, col: 2, type: 'tile-01' },
      { id: 'f4', row: 0, col: 3, type: 'tile-01' },
    ],
  ];

  // When specialTilesEnabled: true -> creates rocket
  const matchWithSpecials = detectMatches(fourBoard, 3, undefined, true);
  expect(matchWithSpecials.specialsToCreate.length).toBe(1);

  // When specialTilesEnabled: false -> NO specials created
  const matchWithoutSpecials = detectMatches(fourBoard, 3, undefined, false);
  expect(matchWithoutSpecials.matches.length).toBe(1);
  expect(matchWithoutSpecials.specialsToCreate.length).toBe(0);
  expect(matchWithoutSpecials.matches[0].isSpecialCreate).toBeNull();

  // 5 in a row
  const fiveBoard: Match3Tile[][] = [
    [
      { id: 'g1', row: 0, col: 0, type: 'tile-01' },
      { id: 'g2', row: 0, col: 1, type: 'tile-01' },
      { id: 'g3', row: 0, col: 2, type: 'tile-01' },
      { id: 'g4', row: 0, col: 3, type: 'tile-01' },
      { id: 'g5', row: 0, col: 4, type: 'tile-01' },
    ],
  ];
  const fiveWithoutSpecials = detectMatches(fiveBoard, 3, undefined, false);
  expect(fiveWithoutSpecials.matches.length).toBe(1);
  expect(fiveWithoutSpecials.specialsToCreate.length).toBe(0);

  // resolveSwap with specialTilesEnabled = false must never create special tiles
  const swap4Board: Match3Tile[][] = [
    [
      { id: 's1', row: 0, col: 0, type: 'tile-01' },
      { id: 's2', row: 0, col: 1, type: 'tile-02' },
      { id: 's3', row: 0, col: 2, type: 'tile-01' },
      { id: 's4', row: 0, col: 3, type: 'tile-01' },
    ],
    [
      { id: 's5', row: 1, col: 0, type: 'tile-03' },
      { id: 's6', row: 1, col: 1, type: 'tile-01' },
      { id: 's7', row: 1, col: 2, type: 'tile-04' },
      { id: 's8', row: 1, col: 3, type: 'tile-05' },
    ],
  ];
  const swapRes = resolveSwap(swap4Board, 0, 1, 1, 1, 6, undefined, undefined, {
    specialTilesEnabled: false,
  });
  expect(swapRes.isValid).toBe(true);
  expect(swapRes.totalSpecialsCreated).toBe(0);
  for (const step of swapRes.steps) {
    expect(step.specialsCreated.length).toBe(0);
  }
});

test('Engine respects comboEnabled: false and does not scale combo or multipliers', () => {
  const cascadeBoard: Match3Tile[][] = [
    [
      { id: 'c1', row: 0, col: 0, type: 'tile-01' },
      { id: 'c2', row: 0, col: 1, type: 'tile-02' },
      { id: 'c3', row: 0, col: 2, type: 'tile-01' },
    ],
    [
      { id: 'c4', row: 1, col: 0, type: 'tile-03' },
      { id: 'c5', row: 1, col: 1, type: 'tile-01' },
      { id: 'c6', row: 1, col: 2, type: 'tile-04' },
    ],
  ];

  const resNoCombo = resolveSwap(cascadeBoard, 0, 1, 1, 1, 6, undefined, undefined, {
    comboEnabled: false,
  });

  expect(resNoCombo.isValid).toBe(true);
  expect(resNoCombo.bestCombo).toBe(1);
  for (const step of resNoCombo.steps) {
    expect(step.combo).toBe(1);
  }
});

test('Engine respects cascadeEnabled: false and terminates after initial swap match', () => {
  // A board designed where clearing first match would naturally create a 2nd match if gravity & cascade continued
  // Row 0: tile-01, tile-02, tile-01
  // Row 1: tile-03, tile-01, tile-04
  // Row 2: tile-05, tile-05, tile-05
  // Deterministic PRNG returning tile-05 for all new tiles
  const deterministicPrng = () => 0.6; // produces tile-04 or tile-05

  const board: Match3Tile[][] = [
    [
      { id: 'd1', row: 0, col: 0, type: 'tile-01' },
      { id: 'd2', row: 0, col: 1, type: 'tile-02' },
      { id: 'd3', row: 0, col: 2, type: 'tile-01' },
    ],
    [
      { id: 'd4', row: 1, col: 0, type: 'tile-03' },
      { id: 'd5', row: 1, col: 1, type: 'tile-01' },
      { id: 'd6', row: 1, col: 2, type: 'tile-04' },
    ],
  ];

  // When cascadeEnabled is false, resolution MUST stop after step 1
  const resNoCascade = resolveSwap(board, 0, 1, 1, 1, 6, undefined, deterministicPrng, {
    cascadeEnabled: false,
  });

  expect(resNoCascade.isValid).toBe(true);
  expect(resNoCascade.steps.length).toBe(1);
});

test('Rocket + Bomb combo detects swap, sweeps 3 rows and 3 cols, and populates specialComboDetails', () => {
  // Construct a 7x7 board
  const board: Match3Tile[][] = [];
  for (let r = 0; r < 7; r++) {
    board[r] = [];
    for (let c = 0; c < 7; c++) {
      board[r][c] = {
        id: `t_${r}_${c}`,
        row: r,
        col: c,
        type: `tile-0${(r + c) % 5 + 1}`,
      };
    }
  }

  // Place Rocket at (3, 3) and Bomb at (3, 4)
  board[3][3].special = 'rocket-horizontal';
  board[3][4].special = 'bomb';

  // Swapping (3, 3) with (3, 4)
  const res = resolveSwap(board, 3, 3, 3, 4, 5);

  expect(res.isValid).toBe(true);
  expect(res.isSpecialCombo).toBe(true);
  expect(res.specialComboType).toBe('rocket-bomb');
  expect(res.specialComboDetails).toBeDefined();

  // After swapping, Bomb is at (3, 3) and Rocket is at (3, 4)
  const details = res.specialComboDetails!;
  expect(details.comboType).toBe('rocket-bomb');
  expect(details.bombRow).toBe(3);
  expect(details.bombCol).toBe(3);
  expect(details.rocketRow).toBe(3);
  expect(details.rocketCol).toBe(4);

  // Cleared rows should include 2, 3, 4 (centered on Bomb's resolved position 3)
  expect(details.clearedRows).toContain(2);
  expect(details.clearedRows).toContain(3);
  expect(details.clearedRows).toContain(4);

  // Cleared cols should include 2, 3, 4 (centered on Bomb's resolved position 3)
  expect(details.clearedCols).toContain(2);
  expect(details.clearedCols).toContain(3);
  expect(details.clearedCols).toContain(4);

  // First cascade step should contain the cleared tiles
  expect(res.steps.length).toBeGreaterThanOrEqual(1);
  const firstStep = res.steps[0];
  expect(firstStep.clearedCoords.length).toBeGreaterThan(0);

  // Check that all tiles in the 3 rows and 3 cols were cleared
  const clearedCoords = new Set(firstStep.clearedCoords.map((t) => `${t.row},${t.col}`));
  for (const r of [2, 3, 4]) {
    for (let c = 0; c < 7; c++) {
      expect(clearedCoords.has(`${r},${c}`)).toBe(true);
    }
  }
  for (const c of [2, 3, 4]) {
    for (let r = 0; r < 7; r++) {
      expect(clearedCoords.has(`${r},${c}`)).toBe(true);
    }
  }
});

test('Rocket + Bomb combo works symmetrically when Bomb is swapped into Rocket', () => {
  const board: Match3Tile[][] = [];
  for (let r = 0; r < 6; r++) {
    board[r] = [];
    for (let c = 0; c < 6; c++) {
      board[r][c] = {
        id: `t_${r}_${c}`,
        row: r,
        col: c,
        type: `tile-0${(r * 2 + c) % 4 + 1}`,
      };
    }
  }

  // Bomb at (2, 2), Vertical Rocket at (2, 3)
  board[2][2].special = 'bomb';
  board[2][3].special = 'rocket-vertical';

  const res = resolveSwap(board, 2, 2, 2, 3, 4);

  expect(res.isValid).toBe(true);
  expect(res.isSpecialCombo).toBe(true);
  expect(res.specialComboType).toBe('rocket-bomb');
  // After swapping, Bomb moved to (2, 3) and Rocket moved to (2, 2)
  expect(res.specialComboDetails?.bombRow).toBe(2);
  expect(res.specialComboDetails?.bombCol).toBe(3);
  expect(res.specialComboDetails?.rocketRow).toBe(2);
  expect(res.specialComboDetails?.rocketCol).toBe(2);
});
