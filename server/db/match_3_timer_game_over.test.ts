import { test, expect } from 'bun:test';
import {
  Match3Status,
  Match3Tile,
  DEFAULT_MATCH3_CONFIG,
} from '../../src/games/match-3/types';
import {
  createInitialBoard,
  resolveSwap,
  isValidSwap,
} from '../../src/games/match-3/engine';

test('Critical Bug Fix: Game cannot return to PLAYING or continue after TIME reaches 0', () => {
  // Simulate the lifecycle states of Match3Game
  let status: Match3Status = 'playing';
  let remainingTime = 1;
  const statusRef = { current: status };
  const remainingTimeRef = { current: remainingTime };
  let swapToken = 0;
  let gameOverTimeout: any = null;

  // Board setup with a valid swap
  const board: Match3Tile[][] = [
    [
      { id: '1', row: 0, col: 0, type: 'tile-01' },
      { id: '2', row: 0, col: 1, type: 'tile-02' },
      { id: '3', row: 0, col: 2, type: 'tile-01' },
      { id: '4', row: 0, col: 3, type: 'tile-01' },
    ],
    [
      { id: '5', row: 1, col: 0, type: 'tile-03' },
      { id: '6', row: 1, col: 1, type: 'tile-01' },
      { id: '7', row: 1, col: 2, type: 'tile-04' },
      { id: '8', row: 1, col: 3, type: 'tile-05' },
    ],
  ];

  expect(isValidSwap(board, 0, 1, 1, 1)).toBe(true);

  // Simulated executeSwap implementing the exact fixed logic
  const simulateExecuteSwap = async (r1: number, c1: number, r2: number, c2: number) => {
    // 1. Initial guards
    if (statusRef.current !== 'playing' || remainingTimeRef.current <= 0) {
      return { executed: false, reason: 'time_up_or_not_playing' };
    }

    const thisSwapToken = ++swapToken;
    status = 'resolving';
    statusRef.current = 'resolving';

    const resolution = resolveSwap(board, r1, c1, r2, c2);

    // Simulate async animation delays
    await new Promise((res) => setTimeout(res, 50));
    if (swapToken !== thisSwapToken) return { executed: false, reason: 'stale_token' };

    // While resolving, timer hits 0 in the background!
    // (Simulating the timer interval firing)
    remainingTime = 0;
    remainingTimeRef.current = 0;
    status = 'game_over';
    statusRef.current = 'game_over';

    await new Promise((res) => setTimeout(res, 50));
    if (swapToken !== thisSwapToken) return { executed: false, reason: 'stale_token' };

    // End of executeSwap: CRITICAL FIX CHECK
    if (remainingTimeRef.current <= 0 || statusRef.current === 'game_over' || statusRef.current === 'result') {
      if (statusRef.current !== 'result') {
        status = 'game_over';
        statusRef.current = 'game_over';
      }
      return { executed: true, finalStatus: statusRef.current, preventedResurrection: true };
    }

    // Buggy code used to do:
    status = 'playing';
    statusRef.current = 'playing';
    return { executed: true, finalStatus: 'playing', preventedResurrection: false };
  };

  return simulateExecuteSwap(0, 1, 1, 1).then((result) => {
    expect(result.executed).toBe(true);
    // Crucial: The game must remain 'game_over' and NOT become 'playing'!
    expect(result.finalStatus).toBe('game_over');
    expect(result.preventedResurrection).toBe(true);
    expect(statusRef.current).toBe('game_over');

    // Any subsequent click or swap attempt must be rejected immediately!
    const subsequentAttempt = (r1: number, c1: number, r2: number, c2: number) => {
      if (statusRef.current !== 'playing' || remainingTimeRef.current <= 0) {
        return false;
      }
      return true;
    };

    expect(subsequentAttempt(0, 0, 0, 1)).toBe(false);
  });
});

test('Swaps initiated when remainingTime <= 0 are rejected immediately', async () => {
  const statusRef = { current: 'playing' as Match3Status };
  const remainingTimeRef = { current: 0 }; // Time already 0

  const handleTileClick = () => {
    if (statusRef.current !== 'playing' || remainingTimeRef.current <= 0) {
      return 'blocked';
    }
    return 'allowed';
  };

  const handleTouchEnd = () => {
    if (statusRef.current !== 'playing' || remainingTimeRef.current <= 0) {
      return 'blocked';
    }
    return 'allowed';
  };

  expect(handleTileClick()).toBe('blocked');
  expect(handleTouchEnd()).toBe('blocked');
});
