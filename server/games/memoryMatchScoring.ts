/**
 * Server-side Memory Match Scoring & Result Validation Module
 */

export const MEMORY_MATCH_GAME_VERSION = 1;
export const MEMORY_MATCH_SCORING_VERSION = 1;

export interface MemoryMatchScoringParams {
  moves: number;
  duration: number; // in seconds
  matchedPairs: number;
  totalPairs?: number;
}

export interface MemoryMatchResultValidation {
  isValid: boolean;
  reason?: string;
  expectedScore?: number;
}

export function calculateMemoryMatchScore(params: MemoryMatchScoringParams): number {
  const totalPairs = params.totalPairs && params.totalPairs > 0 ? Math.floor(params.totalPairs) : 8;
  const matchedPairs = Math.max(0, Math.min(totalPairs, Math.floor(params.matchedPairs || 0)));
  const moves = Math.max(0, Math.floor(params.moves || 0));
  const duration = Math.max(0, Math.floor(params.duration || 0));

  if (matchedPairs === 0) {
    return 0;
  }

  const basePoints = matchedPairs * 100;
  const isComplete = matchedPairs === totalPairs;
  const completionBonus = isComplete ? 400 : 0;
  const excessMoves = Math.max(0, moves - matchedPairs);
  const movePenalty = Math.min(300, excessMoves * 15);
  const timePenalty = Math.min(300, duration * 3);
  const speedBonus = isComplete ? Math.max(0, (60 - duration) * 5) : 0;

  const rawScore = basePoints + completionBonus + speedBonus - movePenalty - timePenalty;
  return Math.max(10, Math.round(rawScore));
}

export function validateMemoryMatchResult(params: {
  moves: number;
  duration: number;
  matchedPairs: number;
  totalPairs?: number;
  submittedScore?: number;
}): MemoryMatchResultValidation {
  const totalPairs = params.totalPairs ?? 8;
  const { moves, duration, matchedPairs, submittedScore } = params;

  if (typeof moves !== 'number' || moves < 0 || !Number.isInteger(moves)) {
    return { isValid: false, reason: 'Moves must be a non-negative integer' };
  }

  if (typeof duration !== 'number' || duration < 0) {
    return { isValid: false, reason: 'Duration must be a non-negative number' };
  }

  if (typeof matchedPairs !== 'number' || matchedPairs < 0 || matchedPairs > totalPairs || !Number.isInteger(matchedPairs)) {
    return { isValid: false, reason: `Matched pairs must be an integer between 0 and ${totalPairs}` };
  }

  if (moves < matchedPairs) {
    return { isValid: false, reason: `Impossible move count: ${moves} moves for ${matchedPairs} matched pairs` };
  }

  if (matchedPairs === totalPairs && duration < 1) {
    return { isValid: false, reason: 'Impossible completion duration: less than 1 second' };
  }

  const expectedScore = calculateMemoryMatchScore({
    moves,
    duration,
    matchedPairs,
    totalPairs,
  });

  if (submittedScore !== undefined && submittedScore !== null) {
    if (Math.abs(submittedScore - expectedScore) > 10) {
      return {
        isValid: false,
        reason: `Score mismatch: submitted ${submittedScore}, expected ${expectedScore}`,
        expectedScore,
      };
    }
  }

  return { isValid: true, expectedScore };
}
