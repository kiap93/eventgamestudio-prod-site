import { describe, it, expect } from 'bun:test';
import { Match3GameConfig, DEFAULT_MATCH3_CONFIG, DEFAULT_MATCH3_HAZARD_CONFIG } from './types';
import { createInitialBoard, isValidSwap, resolveSwap } from './engine';

describe('Match-3 Gameplay Customizer & Objective Configuration Tests', () => {
  it('objective editor updates score target without destroying other fields', () => {
    let cfg: Match3GameConfig = { ...DEFAULT_MATCH3_CONFIG };

    // Set score objective
    cfg = {
      ...cfg,
      objective: {
        ...cfg.objective,
        type: 'score',
        targetScore: 25000,
      },
    };

    expect(cfg.objective.type).toBe('score');
    expect(cfg.objective.targetScore).toBe(25000);
    // Preserves default collect & hazard counts for non-destructive switching
    expect(cfg.objective.targetCollectCount).toBe(30);
    expect(cfg.objective.targetHazardCount).toBe(3);
  });

  it('switching to collect objective preserves gameplay settings and target count', () => {
    let cfg: Match3GameConfig = {
      ...DEFAULT_MATCH3_CONFIG,
      gameDurationSeconds: 45,
      rows: 7,
      cols: 7,
      comboEnabled: false,
    };

    cfg = {
      ...cfg,
      objective: {
        ...cfg.objective,
        type: 'collect',
        targetTileType: 'tile-03',
        targetCollectCount: 40,
      },
    };

    expect(cfg.gameDurationSeconds).toBe(45);
    expect(cfg.rows).toBe(7);
    expect(cfg.cols).toBe(7);
    expect(cfg.comboEnabled).toBe(false);
    expect(cfg.objective.type).toBe('collect');
    expect(cfg.objective.targetTileType).toBe('tile-03');
    expect(cfg.objective.targetCollectCount).toBe(40);
  });

  it('switching to remove objective preserves settings and target hazard count', () => {
    let cfg: Match3GameConfig = {
      ...DEFAULT_MATCH3_CONFIG,
      hazardConfig: {
        ...DEFAULT_MATCH3_HAZARD_CONFIG,
        enabled: true,
        type: 'stone',
        initialCount: 5,
        clearCondition: 'adjacent_match',
      },
    };

    cfg = {
      ...cfg,
      objective: {
        ...cfg.objective,
        type: 'remove',
        targetHazardCount: 5,
      },
    };

    expect(cfg.objective.type).toBe('remove');
    expect(cfg.objective.targetHazardCount).toBe(5);
    expect(cfg.hazardConfig?.enabled).toBe(true);
    expect(cfg.hazardConfig?.initialCount).toBe(5);
  });

  it('tracks tile collections correctly in cascade resolution', () => {
    const board = [
      [
        { id: '1', type: 'tile-02', row: 0, col: 0 },
        { id: '2', type: 'tile-05', row: 0, col: 1 },
        { id: '3', type: 'tile-02', row: 0, col: 2 },
      ],
      [
        { id: '4', type: 'tile-04', row: 1, col: 0 },
        { id: '5', type: 'tile-02', row: 1, col: 1 },
        { id: '6', type: 'tile-03', row: 1, col: 2 },
      ],
      [
        { id: '7', type: 'tile-01', row: 2, col: 0 },
        { id: '8', type: 'tile-06', row: 2, col: 1 },
        { id: '9', type: 'tile-04', row: 2, col: 2 },
      ],
    ];

    const res = resolveSwap(board, 1, 1, 0, 1, 6, undefined, () => 0.1, {
      minimumMatch: 3,
      specialTilesEnabled: false,
      cascadeEnabled: false,
    });

    expect(res.isValid).toBe(true);
    expect(res.totalClearedTileTypes['tile-02']).toBe(3);
    expect(res.totalClearedTileTypes['tile-01'] || 0).toBe(0);
  });
});
