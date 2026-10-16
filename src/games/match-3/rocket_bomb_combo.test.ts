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

import { test, expect, describe } from 'bun:test';
import {
  createInitialBoard,
  isValidSwap,
  resolveSwap,
  resolveSpecialCombination,
  areAdjacent,
  cloneBoard,
} from './engine';
import { DEFAULT_MATCH3_CONFIG, DEFAULT_MATCH3_SCORING, Match3Tile } from './types';
import fs from 'node:fs';
import path from 'node:path';

describe('Rocket + Bomb Special Combo Integration & Regression Tests', () => {
  // Helper to create an 8x8 blank board with no natural matches
  function createBlankBoard(rows = 8, cols = 8): Match3Tile[][] {
    const board: Match3Tile[][] = [];
    for (let r = 0; r < rows; r++) {
      board[r] = [];
      for (let c = 0; c < cols; c++) {
        // Checkerboard tile types so no 3-in-a-row matches exist
        const typeIndex = ((r % 2) * 3 + (c % 3)) + 1;
        board[r][c] = {
          id: `tile_${r}_${c}`,
          row: r,
          col: c,
          type: `tile-0${typeIndex}`,
        };
      }
    }
    return board;
  }

  test('1. Swapping adjacent Rocket + Bomb tiles triggers the dedicated rocket-bomb combo', () => {
    const board = createBlankBoard(8, 8);
    // Place adjacent Rocket at (3, 3) and Bomb at (3, 4)
    board[3][3].special = 'rocket-horizontal';
    board[3][4].special = 'bomb';

    expect(isValidSwap(board, 3, 3, 3, 4, { specialTilesEnabled: true })).toBe(true);

    const resolution = resolveSwap(board, 3, 3, 3, 4, 6, DEFAULT_MATCH3_SCORING, Math.random, {
      specialTilesEnabled: true,
      comboEnabled: true,
      cascadeEnabled: true,
    });

    expect(resolution.isValid).toBe(true);
    expect(resolution.isSpecialCombo).toBe(true);
    expect(resolution.specialComboType).toBe('rocket-bomb');
    expect(resolution.specialComboDetails).toBeDefined();
    expect(resolution.specialComboDetails?.comboType).toBe('rocket-bomb');

    // After swapping (3, 3) and (3, 4):
    // The Bomb moved to (3, 3) and the Rocket moved to (3, 4)
    expect(resolution.specialComboDetails?.bombRow).toBe(3);
    expect(resolution.specialComboDetails?.bombCol).toBe(3);
    expect(resolution.specialComboDetails?.rocketRow).toBe(3);
    expect(resolution.specialComboDetails?.rocketCol).toBe(4);
    expect(resolution.specialComboDetails?.centerRow).toBe(3);
    expect(resolution.specialComboDetails?.centerCol).toBe(3);
  });

  test('2. The combo is NOT triggered for invalid swaps or non-adjacent tiles', () => {
    const board = createBlankBoard(8, 8);
    board[1][1].special = 'rocket-vertical';
    board[1][3].special = 'bomb'; // Non-adjacent (gap of 1)

    // Non-adjacent swap should be rejected
    expect(areAdjacent(1, 1, 1, 3)).toBe(false);
    expect(isValidSwap(board, 1, 1, 1, 3, { specialTilesEnabled: true })).toBe(false);

    const nonAdjacentRes = resolveSwap(board, 1, 1, 1, 3, 6, DEFAULT_MATCH3_SCORING, Math.random, {
      specialTilesEnabled: true,
    });
    expect(nonAdjacentRes.isValid).toBe(false);
    expect(nonAdjacentRes.isSpecialCombo).toBe(false);
    expect(nonAdjacentRes.steps.length).toBe(0);

    // Swap of regular tiles that creates no match is rejected
    const noMatchRes = resolveSwap(board, 5, 5, 5, 6, 6, DEFAULT_MATCH3_SCORING, Math.random, {
      specialTilesEnabled: true,
    });
    expect(noMatchRes.isValid).toBe(false);
    expect(noMatchRes.isSpecialCombo).toBe(false);
  });

  test('3. The combo executes exactly once per valid swap', () => {
    const board = createBlankBoard(8, 8);
    board[4][4].special = 'bomb';
    board[4][5].special = 'rocket-vertical';

    const resolution = resolveSwap(board, 4, 4, 4, 5, 6, DEFAULT_MATCH3_SCORING, Math.random, {
      specialTilesEnabled: true,
      cascadeEnabled: false, // Isolate step 0
    });

    expect(resolution.isValid).toBe(true);
    expect(resolution.steps.length).toBe(1);

    const step0 = resolution.steps[0];
    // Check that every cleared coordinate in step 0 is unique
    const uniqueCoords = new Set(step0.clearedCoords.map((c) => `${c.row},${c.col}`));
    expect(uniqueCoords.size).toBe(step0.clearedCoords.length);
    expect(step0.matchesCount).toBe(1);
    expect(resolution.totalMatches).toBe(1);
  });

  test('4. The actual affected coordinates match the visual 3-row and 3-column sweep and bomb center', () => {
    const rows = 8;
    const cols = 8;
    const board = createBlankBoard(rows, cols);

    // Place Bomb at (4, 4) and vertical Rocket at (4, 5)
    board[4][4].special = 'bomb';
    board[4][5].special = 'rocket-vertical';

    // Swap (4, 4) with (4, 5) -> Bomb ends up at (4, 5), Rocket at (4, 4)
    const resolution = resolveSwap(board, 4, 4, 4, 5, 6, DEFAULT_MATCH3_SCORING, Math.random, {
      specialTilesEnabled: true,
      cascadeEnabled: false,
    });

    const details = resolution.specialComboDetails!;
    expect(details.bombRow).toBe(4);
    expect(details.bombCol).toBe(5);
    expect(details.centerRow).toBe(4);
    expect(details.centerCol).toBe(5);

    // The 3 cleared rows must be [3, 4, 5]
    expect(details.clearedRows).toEqual([3, 4, 5]);
    // The 3 cleared cols must be [4, 5, 6]
    expect(details.clearedCols).toEqual([4, 5, 6]);

    const clearedSet = new Set(resolution.steps[0].clearedCoords.map((c) => `${c.row},${c.col}`));

    // Verify all tiles in the 3 rows are cleared
    for (const r of [3, 4, 5]) {
      for (let c = 0; c < cols; c++) {
        expect(clearedSet.has(`${r},${c}`)).toBe(true);
      }
    }

    // Verify all tiles in the 3 cols are cleared
    for (const c of [4, 5, 6]) {
      for (let r = 0; r < rows; r++) {
        expect(clearedSet.has(`${r},${c}`)).toBe(true);
      }
    }

    // Verify boundary tile (0, 0) is NOT cleared (since row 0 and col 0 are outside 3..5 and 4..6)
    expect(clearedSet.has('0,0')).toBe(false);
    expect(clearedSet.has('7,0')).toBe(false);
  });

  test('4b. Chained special tiles in the blast area detonate correctly', () => {
    const board = createBlankBoard(8, 8);
    // Rocket at (2, 2), Bomb at (2, 3)
    board[2][2].special = 'rocket-horizontal';
    board[2][3].special = 'bomb';

    // Place another Bomb at (2, 7) which is in the swept row 2!
    board[2][7].special = 'bomb';

    const resolution = resolveSwap(board, 2, 2, 2, 3, 6, DEFAULT_MATCH3_SCORING, Math.random, {
      specialTilesEnabled: true,
      cascadeEnabled: false,
    });

    const clearedSet = new Set(resolution.steps[0].clearedCoords.map((c) => `${c.row},${c.col}`));

    // The chained bomb at (2, 7) detonates its 3x3 surrounding tiles, e.g. (1, 6), (1, 7), (3, 6), (3, 7)
    // Row 1, Col 7 would not normally be cleared by rows 1,2,3 or cols 1,2,3, but it was cleared because of the chain!
    expect(clearedSet.has('1,7')).toBe(true);
    expect(clearedSet.has('3,7')).toBe(true);
  });

  test('5. Scoring and cascade resolution remain correct', () => {
    const board = createBlankBoard(8, 8);
    board[3][3].special = 'rocket-vertical';
    board[3][4].special = 'bomb';

    const resolution = resolveSwap(board, 3, 3, 3, 4, 6, DEFAULT_MATCH3_SCORING, Math.random, {
      specialTilesEnabled: true,
      comboEnabled: true,
      cascadeEnabled: true,
    });

    expect(resolution.totalScore).toBeGreaterThan(0);
    expect(resolution.finalBoard.length).toBe(8);
    expect(resolution.finalBoard[0].length).toBe(8);

    // Final board must have valid non-null tiles at every coordinate
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        expect(resolution.finalBoard[r][c]).toBeDefined();
        expect(resolution.finalBoard[r][c].type).toMatch(/^tile-\d{2}$/);
      }
    }
  });

  test('6. Existing Rocket + Rocket, Bomb + Bomb, and ordinary swaps still work', () => {
    // A: Rocket + Rocket (clears cross: 1 row and 1 column)
    const boardRR = createBlankBoard(8, 8);
    boardRR[2][2].special = 'rocket-horizontal';
    boardRR[2][3].special = 'rocket-vertical';

    const resRR = resolveSwap(boardRR, 2, 2, 2, 3, 6, DEFAULT_MATCH3_SCORING, Math.random, {
      specialTilesEnabled: true,
      cascadeEnabled: false,
    });
    expect(resRR.isValid).toBe(true);
    expect(resRR.specialComboType).toBe('double-rocket');
    const clearedRR = new Set(resRR.steps[0].clearedCoords.map((c) => `${c.row},${c.col}`));
    expect(clearedRR.has('2,0')).toBe(true);
    expect(clearedRR.has('0,3')).toBe(true);

    // B: Bomb + Bomb (clears 5x5)
    const boardBB = createBlankBoard(8, 8);
    boardBB[3][3].special = 'bomb';
    boardBB[3][4].special = 'bomb';

    const resBB = resolveSwap(boardBB, 3, 3, 3, 4, 6, DEFAULT_MATCH3_SCORING, Math.random, {
      specialTilesEnabled: true,
      cascadeEnabled: false,
    });
    expect(resBB.isValid).toBe(true);
    expect(resBB.specialComboType).toBe('double-bomb');

    // C: Ordinary swap forming a match-3
    const boardNorm = createBlankBoard(8, 8);
    boardNorm[0][0].type = 'tile-01';
    boardNorm[0][1].type = 'tile-01';
    boardNorm[0][2].type = 'tile-02';
    boardNorm[1][2].type = 'tile-01';

    const resNorm = resolveSwap(boardNorm, 0, 2, 1, 2, 6, DEFAULT_MATCH3_SCORING, Math.random, {
      specialTilesEnabled: true,
      cascadeEnabled: false,
    });
    expect(resNorm.isValid).toBe(true);
    expect(resNorm.isSpecialCombo).toBe(false);
    expect(resNorm.totalMatches).toBe(1);
  });

  test('7. Animation state and board dimensions remain stable', () => {
    const match3Source = fs.readFileSync(path.join(process.cwd(), 'src/games/match-3/Match3Game.tsx'), 'utf-8');
    const indexCssSource = fs.readFileSync(path.join(process.cwd(), 'src/index.css'), 'utf-8');

    // Check that state variables for Rocket + Bomb combo exist
    expect(match3Source).toContain('rocketBombWindUp');
    expect(match3Source).toContain('rocketBombAttack');
    expect(match3Source).toContain('comboBanner');
    expect(match3Source).toContain('isComboShaking');

    // Check that unmount cleanup resets all combo states
    expect(match3Source).toContain('setRocketBombWindUp(null)');
    expect(match3Source).toContain('setRocketBombAttack(null)');
    expect(match3Source).toContain('setComboBanner(null)');
    expect(match3Source).toContain('setIsComboShaking(false)');

    // Check that CSS contains all Rocket + Bomb effect animations
    expect(indexCssSource).toContain('animate-match3-screen-shake');
    expect(indexCssSource).toContain('animate-match3-windup');
    expect(indexCssSource).toContain('animate-match3-energy-link');
    expect(indexCssSource).toContain('animate-match3-mega-burst');
    expect(indexCssSource).toContain('animate-match3-lane-sweep-h');
    expect(indexCssSource).toContain('animate-match3-lane-sweep-v');
    expect(indexCssSource).toContain('animate-match3-rocket-shoot-left');
    expect(indexCssSource).toContain('animate-match3-rocket-shoot-right');
    expect(indexCssSource).toContain('animate-match3-rocket-shoot-up');
    expect(indexCssSource).toContain('animate-match3-rocket-shoot-down');
    expect(indexCssSource).toContain('animate-match3-combo-banner');

    // Check that prefers-reduced-motion is respected
    expect(indexCssSource).toContain('@media (prefers-reduced-motion: reduce)');

    // Check board layout stability: boardSize computation is square and stable
    expect(match3Source).toContain("aspectRatio: '1 / 1'");
  });
});
