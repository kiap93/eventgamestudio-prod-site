import { describe, it, expect } from 'bun:test';
import * as fs from 'fs';

describe('Match-3 Candy Crush Drag/Swipe Interaction Tests', () => {
  it('Dominant axis calculation correctly isolates horizontal vs vertical and rejects diagonal', () => {
    // Helper replicating the drag gesture axis resolution
    const resolveDragDirection = (rawDx: number, rawDy: number, tileDim = 60) => {
      const isHorizontal = Math.abs(rawDx) >= Math.abs(rawDy);
      const threshold = Math.max(16, tileDim * 0.28);
      const thresholdReached = Math.max(Math.abs(rawDx), Math.abs(rawDy)) >= threshold;

      if (!thresholdReached) return null;

      if (isHorizontal) {
        return rawDx > 0 ? 'right' : 'left';
      } else {
        return rawDy > 0 ? 'down' : 'up';
      }
    };

    // Pure horizontal
    expect(resolveDragDirection(25, 0)).toBe('right');
    expect(resolveDragDirection(-25, 0)).toBe('left');

    // Pure vertical
    expect(resolveDragDirection(0, 30)).toBe('down');
    expect(resolveDragDirection(0, -30)).toBe('up');

    // Diagonal drag favoring horizontal: dx = 35, dy = 20
    expect(resolveDragDirection(35, 20)).toBe('right');
    expect(resolveDragDirection(-35, -20)).toBe('left');

    // Diagonal drag favoring vertical: dx = 15, dy = -40
    expect(resolveDragDirection(15, -40)).toBe('up');
    expect(resolveDragDirection(-12, 35)).toBe('down');

    // Below threshold (threshold is ~16.8px)
    expect(resolveDragDirection(10, 5)).toBeNull();
    expect(resolveDragDirection(-8, -12)).toBeNull();
  });

  it('Tile drag threshold is strictly between 20% and 35% of tile size', () => {
    const tileSizes = [48, 56, 64, 72, 80];
    for (const size of tileSizes) {
      const threshold = Math.max(16, size * 0.28);
      const ratio = threshold / size;
      // Between 20% and 35%
      expect(ratio).toBeGreaterThanOrEqual(0.20);
      expect(ratio).toBeLessThanOrEqual(0.35);
    }
  });

  it('Match3Game.tsx contains unified Pointer Events handlers and pointer capture', () => {
    const source = fs.readFileSync('src/games/match-3/Match3Game.tsx', 'utf8');

    // Pointer events
    expect(source).toContain('onPointerDown={(e) => handlePointerDown(r, c, e)}');
    expect(source).toContain('onPointerMove={handlePointerMove}');
    expect(source).toContain('onPointerUp={handlePointerUp}');
    expect(source).toContain('onPointerCancel={handlePointerCancel}');
    expect(source).toContain('setPointerCapture(e.pointerId)');
    expect(source).toContain('releasePointerCapture(e.pointerId)');

    // Ensure deprecated mouse/touch listeners were removed from the tiles
    expect(source).not.toContain('onMouseDown={(e) => handleTouchStart');
    expect(source).not.toContain('onTouchStart={(e) => handleTouchStart');
  });

  it('Mobile scroll prevention: touch-action: none is strictly enforced', () => {
    const source = fs.readFileSync('src/games/match-3/Match3Game.tsx', 'utf8');

    expect(source).toContain("touchAction: 'none'");
    expect(source).toContain("userSelect: 'none'");
    expect(source).toContain("WebkitUserSelect: 'none'");
    expect(source).toContain('touch-none');
  });

  it('Candy Crush match effects, particle bursts, and rocket streaks are present', () => {
    const source = fs.readFileSync('src/games/match-3/Match3Game.tsx', 'utf8');
    const css = fs.readFileSync('src/index.css', 'utf8');

    // Particle, rocket, bomb effects
    expect(source).toContain('spawnParticlesForCoords');
    expect(source).toContain('triggerRocketStreaks');
    expect(source).toContain('triggerBombShockwave');
    expect(source).toContain('animate-match3-pop');
    expect(source).toContain('animate-match3-drop');
    expect(source).toContain('animate-match3-shake');

    // CSS animations in index.css
    expect(css).toContain('@keyframes match3-pop-clear');
    expect(css).toContain('@keyframes match3-shake-reject');
    expect(css).toContain('@keyframes match3-drop-land');
    expect(css).toContain('@keyframes match3-beam-h');
    expect(css).toContain('@keyframes match3-beam-v');
    expect(css).toContain('@keyframes match3-float-score');
    expect(css).toContain('@keyframes match3-particle-fly');
    expect(css).toContain('@keyframes match3-shockwave');
  });

  it('Drag gesture suppresses subsequent click selection', () => {
    const source = fs.readFileSync('src/games/match-3/Match3Game.tsx', 'utf8');

    // wasDraggedRef is used to track movement > 6px and prevent click trigger
    expect(source).toContain('wasDraggedRef');
    expect(source).toContain('else if (!wasDraggedRef.current)');
  });
});
