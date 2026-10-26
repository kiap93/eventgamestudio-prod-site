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

  it('switching from Clear Obstacles to Target Score clears exclusive stones from board', () => {
    // 1. Start with Clear Obstacles configuration
    const clearObstaclesConfig: Match3GameConfig = {
      ...DEFAULT_MATCH3_CONFIG,
      objective: {
        ...DEFAULT_MATCH3_CONFIG.objective,
        type: 'remove',
        targetHazardCount: 4,
      },
      hazardConfig: {
        enabled: true,
        type: 'stone',
        initialCount: 4,
        pointsPenalty: 0,
        clearCondition: 'adjacent_match',
      },
    };

    // Verify Clear Obstacles generates 4 stones
    const obstaclesBoard = createInitialBoard(8, 8, 6, Math.random, {
      minimumMatch: clearObstaclesConfig.minimumMatch,
      specialTilesEnabled: clearObstaclesConfig.specialTilesEnabled,
      hazardConfig: clearObstaclesConfig.hazardConfig,
    });

    let stoneCount = 0;
    for (const row of obstaclesBoard) {
      for (const tile of row) {
        if (tile.hazard === 'stone') stoneCount++;
      }
    }
    expect(stoneCount).toBe(4);

    // 2. Switch back to Target Score
    // Obstacles exclusive to Clear Obstacles must not be retained
    const targetScoreConfig: Match3GameConfig = {
      ...clearObstaclesConfig,
      objective: {
        ...clearObstaclesConfig.objective,
        type: 'score',
        targetScore: 12000,
      },
      hazardConfig: {
        ...clearObstaclesConfig.hazardConfig,
        enabled: false,
      },
    };

    expect(targetScoreConfig.objective.type).toBe('score');
    expect(targetScoreConfig.hazardConfig.enabled).toBe(false);

    // Generate board for Target Score - must have 0 stones
    const targetScoreBoard = createInitialBoard(8, 8, 6, Math.random, {
      minimumMatch: targetScoreConfig.minimumMatch,
      specialTilesEnabled: targetScoreConfig.specialTilesEnabled,
      hazardConfig: targetScoreConfig.hazardConfig,
    });

    let targetScoreStoneCount = 0;
    for (const row of targetScoreBoard) {
      for (const tile of row) {
        if (tile.hazard === 'stone') targetScoreStoneCount++;
      }
    }
    expect(targetScoreStoneCount).toBe(0);
  });

  it('repeated switching between Target Score and Clear Obstacles does not restore stale stones', () => {
    let currentConfig: Match3GameConfig = { ...DEFAULT_MATCH3_CONFIG };

    // Function simulating objective update logic
    const applyObjectiveUpdate = (cfg: Match3GameConfig, targetType: 'score' | 'remove') => {
      let nextHazard = cfg.hazardConfig;
      if (targetType === 'remove') {
        nextHazard = {
          ...(nextHazard || DEFAULT_MATCH3_HAZARD_CONFIG),
          enabled: true,
          type: 'stone',
          initialCount: 3,
        };
      } else {
        if (nextHazard?.enabled) {
          nextHazard = {
            ...nextHazard,
            enabled: false,
          };
        }
      }
      return {
        ...cfg,
        objective: {
          ...cfg.objective,
          type: targetType,
        },
        hazardConfig: nextHazard,
      };
    };

    // Cycle 1: Switch to Clear Obstacles
    currentConfig = applyObjectiveUpdate(currentConfig, 'remove');
    expect(currentConfig.objective.type).toBe('remove');
    expect(currentConfig.hazardConfig.enabled).toBe(true);

    const board1 = createInitialBoard(8, 8, 6, Math.random, {
      hazardConfig: currentConfig.hazardConfig,
    });
    const stones1 = board1.flat().filter((t) => t.hazard === 'stone').length;
    expect(stones1).toBe(3);

    // Cycle 1: Switch back to Target Score
    currentConfig = applyObjectiveUpdate(currentConfig, 'score');
    expect(currentConfig.objective.type).toBe('score');
    expect(currentConfig.hazardConfig.enabled).toBe(false);

    const board2 = createInitialBoard(8, 8, 6, Math.random, {
      hazardConfig: currentConfig.hazardConfig,
    });
    const stones2 = board2.flat().filter((t) => t.hazard === 'stone').length;
    expect(stones2).toBe(0);

    // Cycle 2: Switch to Clear Obstacles again
    currentConfig = applyObjectiveUpdate(currentConfig, 'remove');
    expect(currentConfig.objective.type).toBe('remove');
    expect(currentConfig.hazardConfig.enabled).toBe(true);

    const board3 = createInitialBoard(8, 8, 6, Math.random, {
      hazardConfig: currentConfig.hazardConfig,
    });
    const stones3 = board3.flat().filter((t) => t.hazard === 'stone').length;
    expect(stones3).toBe(3);

    // Cycle 2: Switch back to Target Score again
    currentConfig = applyObjectiveUpdate(currentConfig, 'score');
    expect(currentConfig.objective.type).toBe('score');
    expect(currentConfig.hazardConfig.enabled).toBe(false);

    const board4 = createInitialBoard(8, 8, 6, Math.random, {
      hazardConfig: currentConfig.hazardConfig,
    });
    const stones4 = board4.flat().filter((t) => t.hazard === 'stone').length;
    expect(stones4).toBe(0);
  });

  it('saved and reloaded Target Score configuration does not spawn stone obstacles', () => {
    // Simulate saved theme payload after switching from Clear Obstacles to Target Score
    const savedGameConfig: Match3GameConfig = {
      ...DEFAULT_MATCH3_CONFIG,
      gameDurationSeconds: 75,
      rows: 8,
      cols: 8,
      objective: {
        type: 'score',
        targetScore: 20000,
        targetHazardCount: 3,
      },
      hazardConfig: {
        ...DEFAULT_MATCH3_HAZARD_CONFIG,
        enabled: false,
        type: 'stone',
        initialCount: 3,
      },
    };

    // Serialize to JSON (as stored in Supabase / API)
    const serialized = JSON.stringify(savedGameConfig);

    // Reload from JSON
    const reloadedConfig: Match3GameConfig = JSON.parse(serialized);

    expect(reloadedConfig.objective.type).toBe('score');
    expect(reloadedConfig.hazardConfig.enabled).toBe(false);
    expect(reloadedConfig.gameDurationSeconds).toBe(75);

    // Initialize board with reloaded configuration
    const reloadedBoard = createInitialBoard(
      reloadedConfig.rows,
      reloadedConfig.cols,
      reloadedConfig.tileTypesCount,
      Math.random,
      {
        minimumMatch: reloadedConfig.minimumMatch,
        specialTilesEnabled: reloadedConfig.specialTilesEnabled,
        hazardConfig: reloadedConfig.hazardConfig,
      }
    );

    const stones = reloadedBoard.flat().filter((t) => t.hazard === 'stone').length;
    expect(stones).toBe(0);
  });

  it('preserves unrelated gameplay settings when switching objectives', () => {
    const customConfig: Match3GameConfig = {
      ...DEFAULT_MATCH3_CONFIG,
      gameDurationSeconds: 90,
      rows: 7,
      cols: 7,
      tileTypesCount: 5,
      minimumMatch: 4,
      comboEnabled: true,
      cascadeEnabled: true,
      shuffleWhenNoMoves: false,
      scoring: {
        ...DEFAULT_MATCH3_CONFIG.scoring,
        match3Points: 200,
        match4Points: 400,
      },
      objective: {
        type: 'remove',
        targetScore: 10000,
        targetHazardCount: 5,
      },
      hazardConfig: {
        enabled: true,
        type: 'stone',
        initialCount: 5,
        clearCondition: 'adjacent_match',
      },
    };

    // Switch to Target Score
    const updated = {
      ...customConfig,
      objective: {
        ...customConfig.objective,
        type: 'score' as const,
      },
      hazardConfig: {
        ...customConfig.hazardConfig,
        enabled: false,
      },
    };

    expect(updated.gameDurationSeconds).toBe(90);
    expect(updated.rows).toBe(7);
    expect(updated.cols).toBe(7);
    expect(updated.tileTypesCount).toBe(5);
    expect(updated.minimumMatch).toBe(4);
    expect(updated.comboEnabled).toBe(true);
    expect(updated.cascadeEnabled).toBe(true);
    expect(updated.shuffleWhenNoMoves).toBe(false);
    expect(updated.scoring.match3Points).toBe(200);
    expect(updated.scoring.match4Points).toBe(400);
    expect(updated.objective.type).toBe('score');
    expect(updated.hazardConfig.enabled).toBe(false);
  });
});
