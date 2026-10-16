import { describe, it, expect } from 'bun:test';
import {
  createInitialBoard,
  detectMatches,
  isValidSwap,
  resolveSwap,
  shuffleBoard,
  hasValidMoves,
  Match3Tile,
} from './engine';
import { DEFAULT_MATCH3_SCORING, Match3HazardConfig } from './types';

describe('Match-3 Hazard Engine & Customization Tests', () => {
  it('creates board with configured hazard initialCount and hazard type', () => {
    const hazardConfig: Match3HazardConfig = {
      enabled: true,
      type: 'stone',
      initialCount: 5,
      clearCondition: 'adjacent_match',
      pointsPenalty: 50,
    };

    const board = createInitialBoard(8, 8, 6, Math.random, {
      minimumMatch: 3,
      specialTilesEnabled: true,
      hazardConfig,
    });

    let stoneCount = 0;
    for (const row of board) {
      for (const tile of row) {
        if (tile.hazard === 'stone') {
          stoneCount++;
        }
      }
    }

    expect(stoneCount).toBe(5);
  });

  it('adjacent_match obstacles cannot be directly swapped', () => {
    const board: Match3Tile[][] = [
      [
        { id: '1', type: 'tile-01', row: 0, col: 0, hazard: 'stone' },
        { id: '2', type: 'tile-01', row: 0, col: 1 },
        { id: '3', type: 'tile-01', row: 0, col: 2 },
      ],
      [
        { id: '4', type: 'tile-02', row: 1, col: 0 },
        { id: '5', type: 'tile-02', row: 1, col: 1 },
        { id: '6', type: 'tile-02', row: 1, col: 2 },
      ],
      [
        { id: '7', type: 'tile-03', row: 2, col: 0 },
        { id: '8', type: 'tile-03', row: 2, col: 1 },
        { id: '9', type: 'tile-03', row: 2, col: 2 },
      ],
    ];

    const hazardConfig: Match3HazardConfig = {
      enabled: true,
      type: 'stone',
      initialCount: 1,
      clearCondition: 'adjacent_match',
      pointsPenalty: 0,
    };

    // Swap (0,0) [stone] with (1,0) [normal]
    const valid = isValidSwap(board, 0, 0, 1, 0, {
      minimumMatch: 3,
      specialTilesEnabled: true,
      hazardConfig,
    });

    expect(valid).toBe(false);
  });

  it('direct_match hazards CAN be swapped and clear on 3-in-a-row match with penalty deduction', () => {
    // Board with direct_match hazard at (1, 1) that can be swapped with (1, 0) to form a row of 3 tile-01s
    const board: Match3Tile[][] = [
      [
        { id: '1', type: 'tile-03', row: 0, col: 0 },
        { id: '2', type: 'tile-04', row: 0, col: 1 },
        { id: '3', type: 'tile-05', row: 0, col: 2 },
      ],
      [
        { id: '4', type: 'tile-02', row: 1, col: 0 },
        { id: '5', type: 'tile-01', row: 1, col: 1, hazard: 'bubble' }, // swappable hazard
        { id: '6', type: 'tile-02', row: 1, col: 2 },
      ],
      [
        { id: '7', type: 'tile-01', row: 2, col: 0 },
        { id: '8', type: 'tile-04', row: 2, col: 1 },
        { id: '9', type: 'tile-01', row: 2, col: 2 },
      ],
    ];

    const hazardConfig: Match3HazardConfig = {
      enabled: true,
      type: 'bubble',
      initialCount: 1,
      clearCondition: 'direct_match',
      pointsPenalty: 25,
    };

    // Swapping (1, 1) into (2, 1) lines up 3 tile-01s along row 2: (2,0), (2,1)[bubble], (2,2)
    const valid = isValidSwap(board, 1, 1, 2, 1, {
      minimumMatch: 3,
      specialTilesEnabled: true,
      hazardConfig,
    });

    expect(valid).toBe(true);

    const resolution = resolveSwap(board, 1, 1, 2, 1, 6, DEFAULT_MATCH3_SCORING, () => 0.1, {
      minimumMatch: 3,
      specialTilesEnabled: true,
      comboEnabled: false,
      cascadeEnabled: false,
      hazardConfig,
    });

    expect(resolution.isValid).toBe(true);
    expect(resolution.totalHazardsCleared).toBe(1);
    // 3-match gives 100 base score, minus 25 pointsPenalty = 75 totalScore
    expect(resolution.totalScore).toBe(75);
    // Hazard tile should NOT be counted in totalClearedTileTypes
    expect(resolution.totalClearedTileTypes['tile-01']).toBe(2);
  });

  it('adjacent_match blast clears neighboring obstacle when match occurs adjacent to it', () => {
    const board: Match3Tile[][] = [
      [
        { id: '1', type: 'tile-01', row: 0, col: 0 },
        { id: '2', type: 'tile-06', row: 0, col: 1 },
        { id: '3', type: 'tile-01', row: 0, col: 2 },
        { id: '4', type: 'tile-05', row: 0, col: 3, hazard: 'ice' }, // adjacent obstacle to (0, 2)
      ],
      [
        { id: '5', type: 'tile-04', row: 1, col: 0 },
        { id: '6', type: 'tile-01', row: 1, col: 1 }, // swap this to (0, 1) to match 3 tile-01s
        { id: '7', type: 'tile-03', row: 1, col: 2 },
        { id: '8', type: 'tile-02', row: 1, col: 3 },
      ],
      [
        { id: '9', type: 'tile-02', row: 2, col: 0 },
        { id: '10', type: 'tile-03', row: 2, col: 1 },
        { id: '11', type: 'tile-05', row: 2, col: 2 },
        { id: '12', type: 'tile-06', row: 2, col: 3 },
      ],
      [
        { id: '13', type: 'tile-04', row: 3, col: 0 },
        { id: '14', type: 'tile-05', row: 3, col: 1 },
        { id: '15', type: 'tile-02', row: 3, col: 2 },
        { id: '16', type: 'tile-03', row: 3, col: 3 },
      ],
    ];

    const hazardConfig: Match3HazardConfig = {
      enabled: true,
      type: 'ice',
      initialCount: 1,
      clearCondition: 'adjacent_match',
      pointsPenalty: 30,
    };

    const resolution = resolveSwap(board, 1, 1, 0, 1, 6, DEFAULT_MATCH3_SCORING, () => 0.2, {
      minimumMatch: 3,
      specialTilesEnabled: false,
      comboEnabled: false,
      cascadeEnabled: false,
      hazardConfig,
    });

    expect(resolution.isValid).toBe(true);
    expect(resolution.totalHazardsCleared).toBe(1);
    // 4 tiles cleared (3 matched tile-01s + 1 obstacle tile at 0,3)
    // 100 points - 30 penalty = 70 points
    expect(resolution.totalScore).toBe(70);
  });
});
