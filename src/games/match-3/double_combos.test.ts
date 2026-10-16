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

describe('Bomb + Bomb and Rocket + Rocket Special Combo Integration & Regression Tests', () => {
  function createBlankBoard(rows = 8, cols = 8): Match3Tile[][] {
    const board: Match3Tile[][] = [];
    for (let r = 0; r < rows; r++) {
      board[r] = [];
      for (let c = 0; c < cols; c++) {
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

  // =================== BOMB + BOMB TESTS ===================
  describe('Bomb + Bomb: Mega Explosion', () => {
    test('1. Swapping adjacent Bomb + Bomb triggers double-bomb combo with center coordinates', () => {
      const board = createBlankBoard(8, 8);
      board[3][3].special = 'bomb';
      board[3][4].special = 'bomb';

      expect(isValidSwap(board, 3, 3, 3, 4, { specialTilesEnabled: true })).toBe(true);

      const res = resolveSwap(board, 3, 3, 3, 4, 6, DEFAULT_MATCH3_SCORING, Math.random, {
        specialTilesEnabled: true,
        comboEnabled: true,
        cascadeEnabled: false,
      });

      expect(res.isValid).toBe(true);
      expect(res.isSpecialCombo).toBe(true);
      expect(res.specialComboType).toBe('double-bomb');
      expect(res.specialComboDetails).toBeDefined();
      expect(res.specialComboDetails?.comboType).toBe('double-bomb');
      expect(res.specialComboDetails?.centerRow).toBe(3);
      expect(res.specialComboDetails?.centerCol).toBe(4);
    });

    test('2. Double Bomb clears exact 5x5 blast area centered on combination in center of board', () => {
      const board = createBlankBoard(8, 8);
      board[4][4].special = 'bomb';
      board[4][5].special = 'bomb';

      const res = resolveSwap(board, 4, 4, 4, 5, 6, DEFAULT_MATCH3_SCORING, Math.random, {
        specialTilesEnabled: true,
        cascadeEnabled: false,
      });

      expect(res.isValid).toBe(true);
      const clearedSet = new Set(res.steps[0].clearedCoords.map((c) => `${c.row},${c.col}`));
      // In center of 8x8, center is (r2, c2) = (4, 5), range is rows [2..6], cols [3..7] -> exactly 25 tiles
      expect(clearedSet.size).toBe(25);

      for (let r = 2; r <= 6; r++) {
        for (let c = 3; c <= 7; c++) {
          expect(clearedSet.has(`${r},${c}`)).toBe(true);
        }
      }
      // Tiles outside 5x5 must NOT be cleared
      expect(clearedSet.has('1,5')).toBe(false);
      expect(clearedSet.has('7,5')).toBe(false);
      expect(clearedSet.has('4,2')).toBe(false);
    });

    test('3. Double Bomb correctly clips at board edges and corners without out-of-bounds errors', () => {
      // Corner blast at (0, 0)
      const boardCorner = createBlankBoard(8, 8);
      boardCorner[0][0].special = 'bomb';
      boardCorner[0][1].special = 'bomb';

      const resCorner = resolveSwap(boardCorner, 0, 1, 0, 0, 6, DEFAULT_MATCH3_SCORING, Math.random, {
        specialTilesEnabled: true,
        cascadeEnabled: false,
      });

      expect(resCorner.isValid).toBe(true);
      expect(resCorner.specialComboType).toBe('double-bomb');
      const clearedCorner = new Set(resCorner.steps[0].clearedCoords.map((c) => `${c.row},${c.col}`));
      // Center is (0, 0). 5x5 clipped is rows [0..2], cols [0..2] -> 3x3 = 9 tiles
      expect(clearedCorner.size).toBe(9);
      for (let r = 0; r <= 2; r++) {
        for (let c = 0; c <= 2; c++) {
          expect(clearedCorner.has(`${r},${c}`)).toBe(true);
        }
      }

      // Edge blast at top row (0, 4)
      const boardEdge = createBlankBoard(8, 8);
      boardEdge[0][4].special = 'bomb';
      boardEdge[0][5].special = 'bomb';

      const resEdge = resolveSwap(boardEdge, 0, 5, 0, 4, 6, DEFAULT_MATCH3_SCORING, Math.random, {
        specialTilesEnabled: true,
        cascadeEnabled: false,
      });

      expect(resEdge.isValid).toBe(true);
      const clearedEdge = new Set(resEdge.steps[0].clearedCoords.map((c) => `${c.row},${c.col}`));
      // Rows [0..2] (3 rows), Cols [2..6] (5 cols) -> 15 tiles
      expect(clearedEdge.size).toBe(15);
    });

    test('4. Double Bomb executes cleanly with score, gravity, and cascade integration', () => {
      const board = createBlankBoard(8, 8);
      board[3][3].special = 'bomb';
      board[3][4].special = 'bomb';

      const res = resolveSwap(board, 3, 3, 3, 4, 6, DEFAULT_MATCH3_SCORING, Math.random, {
        specialTilesEnabled: true,
        comboEnabled: true,
        cascadeEnabled: true,
      });

      expect(res.totalScore).toBeGreaterThan(0);
      expect(res.steps.length).toBeGreaterThanOrEqual(1);
      expect(res.finalBoard.length).toBe(8);
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          expect(res.finalBoard[r][c]).toBeDefined();
        }
      }
    });
  });

  // =================== ROCKET + ROCKET TESTS ===================
  describe('Rocket + Rocket: Crossfire Strike', () => {
    test('5. Swapping adjacent Rocket + Rocket triggers double-rocket combo', () => {
      const board = createBlankBoard(8, 8);
      board[2][2].special = 'rocket-horizontal';
      board[2][3].special = 'rocket-vertical';

      expect(isValidSwap(board, 2, 2, 2, 3, { specialTilesEnabled: true })).toBe(true);

      const res = resolveSwap(board, 2, 2, 2, 3, 6, DEFAULT_MATCH3_SCORING, Math.random, {
        specialTilesEnabled: true,
        comboEnabled: true,
        cascadeEnabled: false,
      });

      expect(res.isValid).toBe(true);
      expect(res.isSpecialCombo).toBe(true);
      expect(res.specialComboType).toBe('double-rocket');
      expect(res.specialComboDetails).toBeDefined();
      expect(res.specialComboDetails?.comboType).toBe('double-rocket');
      expect(res.specialComboDetails?.centerRow).toBe(2);
      expect(res.specialComboDetails?.centerCol).toBe(3);
    });

    test('6. Works with all rocket orientation pairs (H+H, V+V, H+V, V+H)', () => {
      const pairs: [string, string][] = [
        ['rocket-horizontal', 'rocket-horizontal'],
        ['rocket-vertical', 'rocket-vertical'],
        ['rocket-horizontal', 'rocket-vertical'],
        ['rocket-vertical', 'rocket-horizontal'],
      ];

      for (const [s1, s2] of pairs) {
        const board = createBlankBoard(8, 8);
        board[1][1].special = s1 as any;
        board[1][2].special = s2 as any;

        const res = resolveSwap(board, 1, 1, 1, 2, 6, DEFAULT_MATCH3_SCORING, Math.random, {
          specialTilesEnabled: true,
          cascadeEnabled: false,
        });

        expect(res.isValid).toBe(true);
        expect(res.specialComboType).toBe('double-rocket');
        // Swapping (1, 1) and (1, 2) makes center (1, 2). Must clear full row 1 and full column 2
        const cleared = new Set(res.steps[0].clearedCoords.map((c) => `${c.row},${c.col}`));
        // 8 row tiles + 8 col tiles - 1 intersection = 15 tiles
        expect(cleared.size).toBe(15);
        for (let c = 0; c < 8; c++) expect(cleared.has(`1,${c}`)).toBe(true);
        for (let r = 0; r < 8; r++) expect(cleared.has(`${r},2`)).toBe(true);
      }
    });

    test('7. Double Rocket executes cleanly with score, gravity, and cascade integration', () => {
      const board = createBlankBoard(8, 8);
      board[3][3].special = 'rocket-horizontal';
      board[3][4].special = 'rocket-vertical';

      const res = resolveSwap(board, 3, 3, 3, 4, 6, DEFAULT_MATCH3_SCORING, Math.random, {
        specialTilesEnabled: true,
        comboEnabled: true,
        cascadeEnabled: true,
      });

      expect(res.totalScore).toBeGreaterThan(0);
      expect(res.steps.length).toBeGreaterThanOrEqual(1);
      expect(res.finalBoard.length).toBe(8);
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          expect(res.finalBoard[r][c]).toBeDefined();
        }
      }
    });
  });

  // =================== VISUAL & CODEBASE INTEGRATION TESTS ===================
  describe('Visual State & Animation Architecture Verification', () => {
    test('8. Match3Game.tsx contains dedicated state, particle spawners, sound calls, and cleanup', () => {
      const match3Source = fs.readFileSync(path.join(process.cwd(), 'src/games/match-3/Match3Game.tsx'), 'utf-8');

      // State declarations
      expect(match3Source).toContain('doubleBombWindUp');
      expect(match3Source).toContain('doubleBombAttack');
      expect(match3Source).toContain('doubleRocketWindUp');
      expect(match3Source).toContain('doubleRocketAttack');

      // Cleanup on unmount
      expect(match3Source).toContain('setDoubleBombWindUp(null)');
      expect(match3Source).toContain('setDoubleBombAttack(null)');
      expect(match3Source).toContain('setDoubleRocketWindUp(null)');
      expect(match3Source).toContain('setDoubleRocketAttack(null)');

      // Particle spawners
      expect(match3Source).toContain('spawnDoubleBombParticles');
      expect(match3Source).toContain('spawnDoubleRocketParticles');

      // Audio manager triggers
      expect(match3Source).toContain('match3Sounds.playDoubleBombWindUp()');
      expect(match3Source).toContain('match3Sounds.playDoubleBombDetonation()');
      expect(match3Source).toContain('match3Sounds.playDoubleRocketWindUp()');
      expect(match3Source).toContain('match3Sounds.playDoubleRocketFire()');

      // Combo banners
      expect(match3Source).toContain("'DOUBLE BOMB!'");
      expect(match3Source).toContain("'MEGA BLAST!'");
      expect(match3Source).toContain("'DOUBLE ROCKET!'");
      expect(match3Source).toContain("'CROSSFIRE STRIKE!'");
    });

    test('9. match3Sounds.ts contains high-impact audio methods for both combos', () => {
      const soundsSource = fs.readFileSync(path.join(process.cwd(), 'src/games/match-3/match3Sounds.ts'), 'utf-8');

      expect(soundsSource).toContain('playDoubleBombWindUp');
      expect(soundsSource).toContain('playDoubleBombDetonation');
      expect(soundsSource).toContain('playDoubleRocketWindUp');
      expect(soundsSource).toContain('playDoubleRocketFire');
    });

    test('10. index.css contains dedicated keyframes and classes for Mega Bomb & Crossfire Strike', () => {
      const cssSource = fs.readFileSync(path.join(process.cwd(), 'src/index.css'), 'utf-8');

      // Double Bomb animations
      expect(cssSource).toContain('animate-match3-bomb-windup');
      expect(cssSource).toContain('animate-match3-energy-link-fire');
      expect(cssSource).toContain('animate-match3-double-bomb-burst');
      expect(cssSource).toContain('animate-match3-double-bomb-ring-1');
      expect(cssSource).toContain('animate-match3-double-bomb-ring-2');
      expect(cssSource).toContain('animate-match3-bomb-area-highlight');

      // Double Rocket animations
      expect(cssSource).toContain('animate-match3-rocket-windup');
      expect(cssSource).toContain('animate-match3-energy-link-electric');
      expect(cssSource).toContain('animate-match3-cross-beam-h');
      expect(cssSource).toContain('animate-match3-cross-beam-v');
      expect(cssSource).toContain('animate-match3-cross-flash');

      // Reduced motion support
      expect(cssSource).toContain('@media (prefers-reduced-motion: reduce)');
      expect(cssSource).toContain('animate-match3-double-bomb-burst');
      expect(cssSource).toContain('animate-match3-cross-flash');
      expect(cssSource).toContain('animate-match3-energy-link-fire');
      expect(cssSource).toContain('animate-match3-energy-link-electric');
    });
  });
});
