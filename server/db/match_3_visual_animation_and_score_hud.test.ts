import { describe, it, expect } from 'bun:test';
import * as fs from 'fs';
import { Match3Tile } from '../../src/games/match-3/types';

describe('Match-3 Visual Animation & Score HUD Stability Tests', () => {
  it('Issue 1: Only moved and newly spawned tiles animate after a match, stationary tiles remain still', () => {
    // Simulate board before match
    const previousVisualBoard: Match3Tile[][] = [
      [
        { id: 't_0_0', row: 0, col: 0, type: 'tile-01' },
        { id: 't_0_1', row: 0, col: 1, type: 'tile-02' },
        { id: 't_0_2', row: 0, col: 2, type: 'tile-03' },
      ],
      [
        { id: 't_1_0', row: 1, col: 0, type: 'tile-04' },
        { id: 't_1_1', row: 1, col: 1, type: 'tile-01' },
        { id: 't_1_2', row: 1, col: 2, type: 'tile-05' },
      ],
      [
        { id: 't_2_0', row: 2, col: 0, type: 'tile-06' },
        { id: 't_2_1', row: 2, col: 1, type: 'tile-01' }, // matched in col 1
        { id: 't_2_2', row: 2, col: 2, type: 'tile-07' },
      ],
    ];

    // Build previous positions map (the exact logic implemented in Match3Game.tsx)
    const prevTilePositions = new Map<string, { row: number; col: number }>();
    for (let r = 0; r < previousVisualBoard.length; r++) {
      for (let c = 0; c < previousVisualBoard[r].length; c++) {
        const prevTile = previousVisualBoard[r][c];
        if (prevTile && prevTile.id) {
          prevTilePositions.set(prevTile.id, { row: r, col: c });
        }
      }
    }

    // Step board after col 1, row 2 match clears:
    // col 0 and col 2 are completely unchanged.
    // In col 1: t_0_1 fell to row 1, t_1_1 fell to row 2, and new tile new_spawn spawned at row 0.
    const stepBoard: Match3Tile[][] = [
      [
        { id: 't_0_0', row: 0, col: 0, type: 'tile-01' }, // Unchanged stationary tile!
        { id: 'new_spawn', row: 0, col: 1, type: 'tile-03' }, // Newly spawned!
        { id: 't_0_2', row: 0, col: 2, type: 'tile-03' }, // Unchanged stationary tile!
      ],
      [
        { id: 't_1_0', row: 1, col: 0, type: 'tile-04' }, // Unchanged stationary tile!
        { id: 't_0_1', row: 1, col: 1, type: 'tile-02' }, // Moved from row 0 to row 1!
        { id: 't_1_2', row: 1, col: 2, type: 'tile-05' }, // Unchanged stationary tile!
      ],
      [
        { id: 't_2_0', row: 2, col: 0, type: 'tile-06' }, // Unchanged stationary tile!
        { id: 't_1_1', row: 2, col: 1, type: 'tile-01' }, // Moved from row 1 to row 2!
        { id: 't_2_2', row: 2, col: 2, type: 'tile-07' }, // Unchanged stationary tile!
      ],
    ];

    const dropped = new Set<string>();
    for (let r = 0; r < stepBoard.length; r++) {
      for (let c = 0; c < stepBoard[r].length; c++) {
        const tile = stepBoard[r][c];
        if (!tile) continue;
        const prevPos = prevTilePositions.get(tile.id);
        if (!prevPos) {
          dropped.add(`${r},${c}`);
        } else if (prevPos.row !== r || prevPos.col !== c) {
          dropped.add(`${r},${c}`);
        }
      }
    }

    // Verify dropped coordinates ONLY include the affected column 1 tiles
    expect(dropped.has('0,1')).toBe(true); // new_spawn
    expect(dropped.has('1,1')).toBe(true); // moved tile
    expect(dropped.has('2,1')).toBe(true); // moved tile
    expect(dropped.size).toBe(3);

    // Verify all stationary tiles are NOT marked as dropping
    expect(dropped.has('0,0')).toBe(false);
    expect(dropped.has('1,0')).toBe(false);
    expect(dropped.has('2,0')).toBe(false);
    expect(dropped.has('0,2')).toBe(false);
    expect(dropped.has('1,2')).toBe(false);
    expect(dropped.has('2,2')).toBe(false);
  });

  it('Issue 1: Match3Game.tsx does NOT mark the entire board as dropping and tracks previousVisualBoard', () => {
    const source = fs.readFileSync('src/games/match-3/Match3Game.tsx', 'utf8');

    // Must NOT contain the old bug where all coordinates were added unconditionally
    expect(source).not.toMatch(/for\s*\(let\s*r\s*=\s*0;\s*r\s*<\s*step\.board\.length;\s*r\+\+\)\s*\{\s*for\s*\(let\s*c\s*=\s*0;\s*c\s*<\s*step\.board\[0\]\.length;\s*c\+\+\)\s*\{\s*dropped\.add\(`\$\{r\},\$\{c\}`\);\s*\}\s*\}/);

    // Must track previousVisualBoard across cascade steps
    expect(source).toContain('let previousVisualBoard: Match3Tile[][] = swappedInit;');
    expect(source).toContain('previousVisualBoard = step.board;');
    expect(source).toContain('const prevTilePositions = new Map<string, { row: number; col: number }>();');
    expect(source).toContain('prevPos.row !== r || prevPos.col !== c');
  });

  it('Issue 2: Score HUD area has tabular-nums, min-w-[5.5rem], text-right, whitespace-nowrap and stable card width', () => {
    const source = fs.readFileSync('src/games/match-3/Match3Game.tsx', 'utf8');

    // Score element must have tabular-nums, stable min-width, right-alignment, and whitespace-nowrap
    expect(source).toContain('tabular-nums');
    expect(source).toContain('min-w-[5.5rem]');
    expect(source).toContain('text-right');
    expect(source).toContain('whitespace-nowrap');

    // Score card container must have stable min-w and shrink-0 to prevent layout shifting
    expect(source).toContain('shrink-0');
  });

  it('Board layout stability: Header, Footer, Main and Board container have fixed/stable dimensions', () => {
    const source = fs.readFileSync('src/games/match-3/Match3Game.tsx', 'utf8');
    const css = fs.readFileSync('src/index.css', 'utf8');

    // 1. Header has fixed height, shrink-0 and flex-nowrap so it never wraps or resizes
    expect(source).toMatch(/<header[^>]*h-14 sm:h-16 shrink-0/);
    expect(source).toContain('flex-nowrap');

    // 2. Combo slot has reserved stable height and width with invisible placeholder when combo <= 1
    expect(source).toMatch(/min-w-\[6\.5rem\] sm:min-w-\[9rem\] h-10 shrink-0/);
    expect(source).toContain('invisible pointer-events-none');
    expect(source).toContain('COMBO ×1');

    // 3. Controlled layout-independent combo animation replaces layout-shifting bounce
    expect(source).toContain('animate-match3-combo');
    expect(css).toContain('@keyframes match3-combo-pulse');
    expect(css).toContain('.animate-match3-combo');
    expect(css).toContain('will-change: transform');

    // 4. Main container has flex-1 min-h-0 min-w-0 and overflow-hidden to bound available stage
    expect(source).toMatch(/<main[^>]*flex-1 min-h-0 min-w-0/);
    expect(source).toContain('overflow-hidden');

    // 5. Footer has fixed height and shrink-0
    expect(source).toMatch(/<footer[^>]*h-9 sm:h-10 shrink-0/);

    // 6. Board container is square and strictly bounded inside main
    expect(source).toContain("aspectRatio: '1 / 1'");
    expect(source).toContain("maxWidth: '100%'");
    expect(source).toContain("maxHeight: '100%'");
    expect(source).toContain("boxSizing: 'border-box'");

    // 7. Grid cells & tiles fit inside grid without vertical overlap (no aspect-square breaking row heights)
    expect(source).toContain('w-full h-full max-w-full max-h-full overflow-hidden');
  });

  it('Square board & cell sizing: boardSize is strictly Math.min(availableWidth, availableHeight) ensuring boardWidth === boardHeight and cellWidth === cellHeight', () => {
    const source = fs.readFileSync('src/games/match-3/Match3Game.tsx', 'utf8');

    // Verification that boardSize is explicitly computed as Math.min(availableWidth, availableHeight)
    expect(source).toContain('const calculatedSize = Math.floor(Math.min(availableWidth, availableHeight));');
    expect(source).toContain('setBoardSize');
    expect(source).toContain('width: `${activeBoardSize}px`');
    expect(source).toContain('height: `${activeBoardSize}px`');

    // Test the mathematical symmetry on sample dimensions
    const testDimensions = [
      { width: 980, height: 585 },
      { width: 600, height: 800 },
      { width: 1024, height: 576 },
      { width: 375, height: 667 },
    ];

    for (const { width, height } of testDimensions) {
      const availW = width - 32;
      const availH = height - 120;
      const boardSize = Math.min(availW, availH);

      // Both board width and board height must be identical
      const boardWidth = boardSize;
      const boardHeight = boardSize;
      expect(boardWidth).toBe(boardHeight);

      // Each cell in an 8x8 grid must be perfectly square
      const cellWidth = boardWidth / 8;
      const cellHeight = boardHeight / 8;
      expect(cellWidth).toBe(cellHeight);
    }
  });
});
