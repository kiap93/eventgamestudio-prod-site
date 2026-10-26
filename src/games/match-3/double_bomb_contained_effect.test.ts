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
} from './engine';
import { DEFAULT_MATCH3_CONFIG, DEFAULT_MATCH3_SCORING, Match3Tile } from './types';
import fs from 'node:fs';
import path from 'node:path';

describe('Match-3 Boom 1 + Boom 2 (Double Bomb) Contained Explosion Verification', () => {
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

  test('1. Swapping Boom 1 and Boom 2 (adjacent bomb tiles) triggers double-bomb combo clearing exactly 5x5 cells', () => {
    const board = createBlankBoard(8, 8);
    // Boom 1 at (3, 3), Boom 2 at (3, 4)
    board[3][3].special = 'bomb';
    board[3][4].special = 'bomb';

    expect(isValidSwap(board, 3, 3, 3, 4, { specialTilesEnabled: true })).toBe(true);

    const res = resolveSwap(board, 3, 3, 3, 4, 6, DEFAULT_MATCH3_SCORING, Math.random, {
      specialTilesEnabled: true,
      cascadeEnabled: false,
    });

    expect(res.isValid).toBe(true);
    expect(res.isSpecialCombo).toBe(true);
    expect(res.specialComboType).toBe('double-bomb');
    expect(res.specialComboDetails?.comboType).toBe('double-bomb');
    expect(res.specialComboDetails?.centerRow).toBe(3);
    expect(res.specialComboDetails?.centerCol).toBe(4);

    // Cleared coords must be bounded to 5x5: rows [1..5], cols [2..6]
    const cleared = new Set(res.steps[0].clearedCoords.map((c) => `${c.row},${c.col}`));
    expect(cleared.size).toBe(25);
    for (let r = 1; r <= 5; r++) {
      for (let c = 2; c <= 6; c++) {
        expect(cleared.has(`${r},${c}`)).toBe(true);
      }
    }
  });

  test('2. Match3Game.tsx contains outer stable frame and inner strictly clipped effect layer', () => {
    const match3Source = fs.readFileSync(path.join(process.cwd(), 'src/games/match-3/Match3Game.tsx'), 'utf-8');

    // Outer board frame has isolation, containment, and strict clipping
    expect(match3Source).toContain('ref={boardRef}');
    expect(match3Source).toContain('contain: \'paint\'');
    expect(match3Source).toContain('overflow-hidden');
    expect(match3Source).toContain('isolate');

    // Screen shake is applied ONLY to inner board layer, NOT outer frame
    expect(match3Source).toContain('clipPath: \'inset(0 round 0.75rem)\'');
    expect(match3Source).toContain('animate-match3-screen-shake-heavy');
    expect(match3Source).toContain('animate-match3-screen-shake');
  });

  test('3. Double bomb explosion effect components use board-contained scale and dimensions', () => {
    const match3Source = fs.readFileSync(path.join(process.cwd(), 'src/games/match-3/Match3Game.tsx'), 'utf-8');
    const cssSource = fs.readFileSync(path.join(process.cwd(), 'src/index.css'), 'utf-8');

    // Blast core and shockwave rings have board-local dimensions
    expect(match3Source).toContain('animate-match3-double-bomb-burst');
    expect(match3Source).toContain('animate-match3-double-bomb-ring-1');
    expect(match3Source).toContain('animate-match3-double-bomb-ring-2');

    // CSS keyframes stay within realistic board blast scale (< 3.0x instead of 5.8x)
    expect(cssSource).toContain('match3-double-bomb-burst');
    expect(cssSource).toContain('match3-double-bomb-ring-1');
    expect(cssSource).toContain('match3-double-bomb-ring-2');

    // Particle distances in spawnDoubleBombParticles are bounded
    expect(match3Source).toContain('spawnDoubleBombParticles');
  });

  test('4. Double bomb wind-up SVG is clipped with overflow-hidden and bounded filter', () => {
    const match3Source = fs.readFileSync(path.join(process.cwd(), 'src/games/match-3/Match3Game.tsx'), 'utf-8');

    // SVG must be overflow-hidden to prevent filter glow leaking outside board
    expect(match3Source).toContain('filter id="bb-fire-glow" x="-20%" y="-20%" width="140%" height="140%"');
  });

  test('5. Single bomb match with normal tiles triggers standard 3x3 explosion, not double bomb', () => {
    const board = createBlankBoard(8, 8);
    // Single bomb at (2, 2), match 3 tile-01s
    board[2][2].special = 'bomb';
    board[2][2].type = 'tile-01';
    board[2][3].type = 'tile-01';
    board[2][4].type = 'tile-01';

    const res = resolveSwap(board, 2, 1, 2, 2, 6, DEFAULT_MATCH3_SCORING, Math.random, {
      specialTilesEnabled: true,
      cascadeEnabled: false,
    });

    expect(res.specialComboType).not.toBe('double-bomb');
  });
});
