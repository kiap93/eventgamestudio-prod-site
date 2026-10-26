import { describe, it, expect } from 'bun:test';
import {
  createInitialBoard,
  resolveSwap,
  isValidSwap,
} from './engine';
import { DEFAULT_MATCH3_SCORING, Match3Tile } from './types';

// Helper to create a deterministic clean board with no natural matches
function createTestBoard(rows: number = 8, cols: number = 8): Match3Tile[][] {
  const board = createInitialBoard(rows, cols, 4, Math.random);
  const types = ['tile-01', 'tile-02', 'tile-03', 'tile-04'];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      board[r][c].type = types[(r + 2 * c) % 4];
      board[r][c].special = null;
      board[r][c].hazard = null;
    }
  }
  return board;
}

describe('Color Bomb + Special Combos: Horizontal Rocket, Vertical Rocket & Explosive Bomb', () => {
  // =========================================================================
  // 1. Color Bomb + Horizontal Rocket (Rainbow Horizontal Chain Reaction)
  // =========================================================================
  describe('Color Bomb + Horizontal Rocket', () => {
    it('detects combination and converts eligible tiles of target color into horizontal rockets (Color Bomb -> Rocket)', () => {
      const board = createTestBoard(8, 8);
      
      // Setup swap at (3, 3) and (3, 4)
      board[3][3].special = 'color-bomb';
      board[3][3].type = 'tile-01';
      board[3][4].special = 'rocket-horizontal';
      board[3][4].type = 'tile-02'; // Target color is tile-02

      // Scatter several tile-02 tiles on the board
      board[1][1].type = 'tile-02';
      board[5][6].type = 'tile-02';

      expect(isValidSwap(board, 3, 3, 3, 4, { minimumMatch: 3, specialTilesEnabled: true })).toBe(true);

      const res = resolveSwap(board, 3, 3, 3, 4, 4, DEFAULT_MATCH3_SCORING, Math.random, {
        minimumMatch: 3,
        comboEnabled: true,
        specialTilesEnabled: true,
        cascadeEnabled: true,
      });

      expect(res.isSpecialCombo).toBe(true);
      expect(res.specialComboType).toBe('color-bomb-rocket-horizontal');
      expect(res.specialComboDetails?.targetSpecial).toBe('rocket-horizontal');
      expect(res.specialComboDetails?.targetColor).toBe('tile-02');

      // The cleared rows must include row 3 (where the rocket was) and rows of converted tiles (rows 1 and 5)
      const clearedRows = res.specialComboDetails?.clearedRows || [];
      expect(clearedRows).toContain(3);
      expect(clearedRows).toContain(1);
      expect(clearedRows).toContain(5);

      // Verify that all tiles in the affected rows are cleared in step 0
      const step0Coords = new Set(res.steps[0].clearedCoords.map((c) => `${c.row},${c.col}`));
      for (let c = 0; c < 8; c++) {
        expect(step0Coords.has(`3,${c}`)).toBe(true);
        expect(step0Coords.has(`1,${c}`)).toBe(true);
        expect(step0Coords.has(`5,${c}`)).toBe(true);
      }
    });

    it('detects combination regardless of swap direction (Horizontal Rocket -> Color Bomb)', () => {
      const board = createTestBoard(8, 8);
      
      // Swap rocket into color bomb
      board[2][4].special = 'rocket-horizontal';
      board[2][4].type = 'tile-03';
      board[2][5].special = 'color-bomb';
      board[2][5].type = 'tile-01';

      board[6][2].type = 'tile-03';

      expect(isValidSwap(board, 2, 4, 2, 5, { minimumMatch: 3, specialTilesEnabled: true })).toBe(true);

      const res = resolveSwap(board, 2, 4, 2, 5, 4, DEFAULT_MATCH3_SCORING, Math.random, {
        minimumMatch: 3,
        comboEnabled: true,
        specialTilesEnabled: true,
        cascadeEnabled: true,
      });

      expect(res.isSpecialCombo).toBe(true);
      expect(res.specialComboType).toBe('color-bomb-rocket-horizontal');
      expect(res.specialComboDetails?.targetSpecial).toBe('rocket-horizontal');
      expect(res.specialComboDetails?.targetColor).toBe('tile-03');

      const clearedRows = res.specialComboDetails?.clearedRows || [];
      expect(clearedRows).toContain(2);
      expect(clearedRows).toContain(6);
    });
  });

  // =========================================================================
  // 2. Color Bomb + Vertical Rocket (Rainbow Vertical Laser Storm)
  // =========================================================================
  describe('Color Bomb + Vertical Rocket', () => {
    it('detects combination and converts eligible tiles of target color into vertical rockets (Color Bomb -> Rocket)', () => {
      const board = createTestBoard(8, 8);
      
      board[4][3].special = 'color-bomb';
      board[4][3].type = 'tile-01';
      board[5][3].special = 'rocket-vertical';
      board[5][3].type = 'tile-03'; // Target color is tile-03

      board[1][1].type = 'tile-03';
      board[2][6].type = 'tile-03';

      expect(isValidSwap(board, 4, 3, 5, 3, { minimumMatch: 3, specialTilesEnabled: true })).toBe(true);

      const res = resolveSwap(board, 4, 3, 5, 3, 4, DEFAULT_MATCH3_SCORING, Math.random, {
        minimumMatch: 3,
        comboEnabled: true,
        specialTilesEnabled: true,
        cascadeEnabled: true,
      });

      expect(res.isSpecialCombo).toBe(true);
      expect(res.specialComboType).toBe('color-bomb-rocket-vertical');
      expect(res.specialComboDetails?.targetSpecial).toBe('rocket-vertical');
      expect(res.specialComboDetails?.targetColor).toBe('tile-03');

      // The cleared columns must include col 3 (swapped vertical rocket) and cols 1 and 6
      const clearedCols = res.specialComboDetails?.clearedCols || [];
      expect(clearedCols).toContain(3);
      expect(clearedCols).toContain(1);
      expect(clearedCols).toContain(6);

      // Verify that all tiles in the affected columns are cleared in step 0
      const step0Coords = new Set(res.steps[0].clearedCoords.map((c) => `${c.row},${c.col}`));
      for (let r = 0; r < 8; r++) {
        expect(step0Coords.has(`${r},3`)).toBe(true);
        expect(step0Coords.has(`${r},1`)).toBe(true);
        expect(step0Coords.has(`${r},6`)).toBe(true);
      }
    });

    it('detects combination regardless of swap direction (Vertical Rocket -> Color Bomb)', () => {
      const board = createTestBoard(8, 8);
      
      board[4][2].special = 'rocket-vertical';
      board[4][2].type = 'tile-04';
      board[4][3].special = 'color-bomb';
      board[4][3].type = 'tile-01';

      board[0][7].type = 'tile-04';

      expect(isValidSwap(board, 4, 2, 4, 3, { minimumMatch: 3, specialTilesEnabled: true })).toBe(true);

      const res = resolveSwap(board, 4, 2, 4, 3, 4, DEFAULT_MATCH3_SCORING, Math.random, {
        minimumMatch: 3,
        comboEnabled: true,
        specialTilesEnabled: true,
        cascadeEnabled: true,
      });

      expect(res.isSpecialCombo).toBe(true);
      expect(res.specialComboType).toBe('color-bomb-rocket-vertical');
      expect(res.specialComboDetails?.targetSpecial).toBe('rocket-vertical');
      expect(res.specialComboDetails?.targetColor).toBe('tile-04');

      const clearedCols = res.specialComboDetails?.clearedCols || [];
      expect(clearedCols).toContain(2);
      expect(clearedCols).toContain(7);
    });
  });

  // =========================================================================
  // 3. Color Bomb + Explosive Bomb (Rainbow Mega Explosion)
  // =========================================================================
  describe('Color Bomb + Explosive Bomb', () => {
    it('detects combination and converts eligible tiles of target color into explosive bombs', () => {
      const board = createTestBoard(8, 8);
      
      board[3][3].special = 'color-bomb';
      board[3][3].type = 'tile-01';
      board[3][4].special = 'bomb';
      board[3][4].type = 'tile-02'; // Target color is tile-02

      board[1][1].type = 'tile-02';
      board[6][6].type = 'tile-02';

      expect(isValidSwap(board, 3, 3, 3, 4, { minimumMatch: 3, specialTilesEnabled: true })).toBe(true);

      const res = resolveSwap(board, 3, 3, 3, 4, 4, DEFAULT_MATCH3_SCORING, Math.random, {
        minimumMatch: 3,
        comboEnabled: true,
        specialTilesEnabled: true,
        cascadeEnabled: true,
      });

      expect(res.isSpecialCombo).toBe(true);
      expect(res.specialComboType).toBe('color-bomb-bomb');
      expect(res.specialComboDetails?.targetSpecial).toBe('bomb');
      expect(res.specialComboDetails?.targetColor).toBe('tile-02');

      const convertedCoords = res.specialComboDetails?.convertedCoords || [];
      expect(convertedCoords.some((c) => c.row === 1 && c.col === 1)).toBe(true);
      expect(convertedCoords.some((c) => c.row === 6 && c.col === 6)).toBe(true);

      // Verify that 3x3 areas around the swapped bomb and converted bombs are cleared
      const step0Coords = new Set(res.steps[0].clearedCoords.map((c) => `${c.row},${c.col}`));
      // (1, 1) 3x3 blast: (0..2, 0..2)
      for (let r = 0; r <= 2; r++) {
        for (let c = 0; c <= 2; c++) {
          expect(step0Coords.has(`${r},${c}`)).toBe(true);
        }
      }
      // (3, 4) 3x3 blast: (2..4, 3..5)
      for (let r = 2; r <= 4; r++) {
        for (let c = 3; c <= 5; c++) {
          expect(step0Coords.has(`${r},${c}`)).toBe(true);
        }
      }
      // (6, 6) 3x3 blast: (5..7, 5..7)
      for (let r = 5; r <= 7; r++) {
        for (let c = 5; c <= 7; c++) {
          expect(step0Coords.has(`${r},${c}`)).toBe(true);
        }
      }
    });

    it('detects combination regardless of swap direction (Bomb -> Color Bomb)', () => {
      const board = createTestBoard(8, 8);
      
      board[2][2].special = 'bomb';
      board[2][2].type = 'tile-03';
      board[2][3].special = 'color-bomb';
      board[2][3].type = 'tile-01';

      expect(isValidSwap(board, 2, 2, 2, 3, { minimumMatch: 3, specialTilesEnabled: true })).toBe(true);

      const res = resolveSwap(board, 2, 2, 2, 3, 4, DEFAULT_MATCH3_SCORING, Math.random, {
        minimumMatch: 3,
        comboEnabled: true,
        specialTilesEnabled: true,
        cascadeEnabled: true,
      });

      expect(res.isSpecialCombo).toBe(true);
      expect(res.specialComboType).toBe('color-bomb-bomb');
      expect(res.specialComboDetails?.targetSpecial).toBe('bomb');
      expect(res.specialComboDetails?.targetColor).toBe('tile-03');
    });
  });

  // =========================================================================
  // 4. Edge Cases: Corner Placement, Non-Duplication, and Gravity Cascades
  // =========================================================================
  describe('Edge Cases and Cascade Settling', () => {
    it('handles corner placement gracefully without out-of-bounds errors', () => {
      const board = createTestBoard(8, 8);
      
      // Place Color Bomb and Bomb in top-left corner
      board[0][0].special = 'color-bomb';
      board[0][0].type = 'tile-01';
      board[0][1].special = 'bomb';
      board[0][1].type = 'tile-04';

      expect(isValidSwap(board, 0, 0, 0, 1, { minimumMatch: 3, specialTilesEnabled: true })).toBe(true);

      const res = resolveSwap(board, 0, 0, 0, 1, 4, DEFAULT_MATCH3_SCORING, Math.random, {
        minimumMatch: 3,
        comboEnabled: true,
        specialTilesEnabled: true,
        cascadeEnabled: true,
      });

      expect(res.isSpecialCombo).toBe(true);
      expect(res.specialComboType).toBe('color-bomb-bomb');
      expect(res.steps.length).toBeGreaterThanOrEqual(1);

      // Verify no coordinate is out-of-bounds
      for (const step of res.steps) {
        for (const c of step.clearedCoords) {
          expect(c.row).toBeGreaterThanOrEqual(0);
          expect(c.row).toBeLessThan(8);
          expect(c.col).toBeGreaterThanOrEqual(0);
          expect(c.col).toBeLessThan(8);
        }
      }
    });

    it('clears each tile at most once per resolution step (no duplicate coords)', () => {
      const board = createTestBoard(8, 8);
      
      board[3][3].special = 'color-bomb';
      board[3][3].type = 'tile-01';
      board[3][4].special = 'rocket-horizontal';
      board[3][4].type = 'tile-02';

      // Two converted tiles in the same row
      board[5][2].type = 'tile-02';
      board[5][5].type = 'tile-02';

      const res = resolveSwap(board, 3, 3, 3, 4, 4, DEFAULT_MATCH3_SCORING, Math.random, {
        minimumMatch: 3,
        comboEnabled: true,
        specialTilesEnabled: true,
        cascadeEnabled: true,
      });

      for (const step of res.steps) {
        const seen = new Set<string>();
        for (const coord of step.clearedCoords) {
          const key = `${coord.row},${coord.col}`;
          expect(seen.has(key)).toBe(false);
          seen.add(key);
        }
      }
    });

    it('cascades and settles cleanly after color bomb combo', () => {
      const board = createTestBoard(8, 8);
      
      board[4][4].special = 'color-bomb';
      board[4][4].type = 'tile-01';
      board[4][5].special = 'rocket-vertical';
      board[4][5].type = 'tile-03';

      const res = resolveSwap(board, 4, 4, 4, 5, 4, DEFAULT_MATCH3_SCORING, Math.random, {
        minimumMatch: 3,
        comboEnabled: true,
        specialTilesEnabled: true,
        cascadeEnabled: true,
      });

      // Must have at least 1 step, a final board, and awarded positive score
      expect(res.steps.length).toBeGreaterThanOrEqual(1);
      expect(res.finalBoard.length).toBe(8);
      expect(res.finalBoard[0].length).toBe(8);
      expect(res.totalScore).toBeGreaterThan(0);

      // Verify no empty/null tile slots on final settled board
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          expect(res.finalBoard[r][c].type).toBeTruthy();
        }
      }
    });
  });
});
