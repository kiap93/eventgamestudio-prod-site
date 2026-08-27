/**
 * Memory Match Scoring & Result Calculation Engine
 * 
 * Deterministic scoring function based on:
 * - Completed pair matches
 * - Move efficiency (excess moves penalty)
 * - Elapsed duration (speed bonus & time penalty)
 * 
 * Versioned for long-term historical interpretability.
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

/**
 * Calculates deterministic score for Memory Match
 * 
 * Rules:
 * 1. Base Score: 100 points per matched pair (max 800 for 8 pairs)
 * 2. Completion Bonus: 400 points when all pairs are matched
 * 3. Move Penalty: 15 points penalty for every move above the number of matched pairs (capped at 300)
 * 4. Time Penalty: 3 points per second elapsed (capped at 300)
 * 5. Speed Bonus: (60 - duration) * 5 points if completed under 60 seconds
 * 
 * Guarantees:
 * - Deterministic: Identical inputs produce identical outputs
 * - Monotonic in efficiency: Fewer moves produce higher scores
 * - Monotonic in speed: Faster completion produces higher scores
 * - Non-negative integer (minimum 10 points if at least 1 pair was matched)
 */
export function calculateMemoryMatchScore(params: MemoryMatchScoringParams): number {
  const totalPairs = params.totalPairs && params.totalPairs > 0 ? Math.floor(params.totalPairs) : 8;
  const matchedPairs = Math.max(0, Math.min(totalPairs, Math.floor(params.matchedPairs || 0)));
  const moves = Math.max(0, Math.floor(params.moves || 0));
  const duration = Math.max(0, Math.floor(params.duration || 0));

  if (matchedPairs === 0) {
    return 0;
  }

  // 1. Base points for matching pairs
  const basePoints = matchedPairs * 100;

  // 2. Completion bonus
  const isComplete = matchedPairs === totalPairs;
  const completionBonus = isComplete ? 400 : 0;

  // 3. Move efficiency penalty (excess moves beyond matched pairs)
  const excessMoves = Math.max(0, moves - matchedPairs);
  const movePenalty = Math.min(300, excessMoves * 15);

  // 4. Time penalty (elapsed seconds)
  const timePenalty = Math.min(300, duration * 3);

  // 5. Speed bonus for fast complete runs
  const speedBonus = isComplete ? Math.max(0, (60 - duration) * 5) : 0;

  const rawScore = basePoints + completionBonus + speedBonus - movePenalty - timePenalty;

  return Math.max(10, Math.round(rawScore));
}

/**
 * Validates a submitted Memory Match result
 */
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

  // Minimum physical moves: at least 1 move per matched pair
  if (moves < matchedPairs) {
    return { isValid: false, reason: `Impossible move count: ${moves} moves for ${matchedPairs} matched pairs` };
  }

  // If completed all pairs, minimum physical duration is at least 1 second
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
    // Allow slight tolerance if client had minor rounding, or exact match
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
