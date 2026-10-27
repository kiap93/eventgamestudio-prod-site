/**
 * Server-side Random Target Arcade Scoring & Result Validation Module
 *
 * Shared Scoring Contract (Client `src/games/random-target/engine.ts` & Server):
 * - Initial score starts at `startingScore` (default: 0).
 * - Each positive target hit adds `positiveScore` (default: +10).
 * - Each negative target hit adds `negativePenalty` (default: -10, always <= 0).
 * - No hidden streak multiplier is applied; streaks are tracked purely as gameplay telemetry.
 * - When `allowNegativeScore === false` (default), score is clamped at 0 after each hit (`Math.max(0, score + delta)`).
 * - When `allowNegativeScore === true`, score is unclamped and equals `startingScore + positiveHits * positiveScore + negativeHits * negativePenalty`.
 *
 * Security Note:
 * Because individual target taps are executed on the client in real time, server validation enforces:
 * 1. Exact mathematical consistency between reported hit counts, configured target values, clamping rules, and final score.
 * 2. Authoritative session/event configuration bounds (duration, spawn intervals, positive/negative point values).
 * 3. Statistical and physical plausibility ceilings (human tap rate limit, spawn capacity, streak bounds).
 */

export const RANDOM_TARGET_GAME_VERSION = 1;
export const RANDOM_TARGET_SCORING_VERSION = 1;

export interface RandomTargetScoringParams {
  duration: number; // seconds
  hits: number;
  positiveHits: number;
  negativeHits: number;
  misses?: number;
  maxStreak?: number;
  startingScore?: number;
  positiveScore?: number;
  negativePenalty?: number;
  allowNegativeScore?: boolean;
}

export interface AuthoritativeRandomTargetSanityConfig {
  gameDurationSeconds?: number;
  startingScore?: number;
  positiveScore?: number;
  negativePenalty?: number;
  initialSpawnIntervalMs?: number;
  minSpawnIntervalMs?: number;
  targetLifetimeMs?: number;
  minTargetLifetimeMs?: number;
  maxSimultaneousTargets?: number;
  allowNegativeScore?: boolean;
}

export interface RandomTargetResultValidation {
  isValid: boolean;
  reason?: string;
  expectedScore?: number;
  code?: string;
}

function gcd(a: number, b: number): number {
  let x = Math.abs(Math.trunc(a));
  let y = Math.abs(Math.trunc(b));
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x;
}

export function normalizeNegativePenalty(penalty: number | undefined): number {
  if (typeof penalty !== 'number' || !Number.isFinite(penalty)) {
    return -10;
  }
  const intPenalty = Math.trunc(penalty);
  return intPenalty > 0 ? -intPenalty : intPenalty;
}

export function calculateRandomTargetScore(params: {
  positiveHits: number;
  negativeHits: number;
  maxStreak?: number;
  startingScore?: number;
  positiveScore?: number;
  negativePenalty?: number;
  allowNegativeScore?: boolean;
}): number {
  const pos = Math.max(0, Math.floor(params.positiveHits || 0));
  const neg = Math.max(0, Math.floor(params.negativeHits || 0));
  const startScore =
    typeof params.startingScore === 'number' && Number.isFinite(params.startingScore)
      ? Math.trunc(params.startingScore)
      : 0;
  const posScore =
    typeof params.positiveScore === 'number' && Number.isFinite(params.positiveScore)
      ? Math.trunc(params.positiveScore)
      : 10;
  const negPenalty = normalizeNegativePenalty(params.negativePenalty);

  const rawScore = startScore + pos * posScore + neg * negPenalty;
  return params.allowNegativeScore ? rawScore : Math.max(0, rawScore);
}

export function validateRandomTargetResult(params: {
  submittedScore?: number;
  metadata?: any;
  config?: AuthoritativeRandomTargetSanityConfig;
}): RandomTargetResultValidation {
  const meta = params.metadata && typeof params.metadata === 'object' ? params.metadata : {};
  const config = params.config;

  // 1. Validate submittedScore is an explicit finite integer
  if (
    params.submittedScore === undefined ||
    params.submittedScore === null ||
    typeof params.submittedScore !== 'number' ||
    !Number.isFinite(params.submittedScore) ||
    !Number.isInteger(params.submittedScore)
  ) {
    return {
      isValid: false,
      reason: 'Submitted score must be a valid finite integer',
      code: 'INVALID_SCORE',
    };
  }
  const submitted = params.submittedScore;

  // 2. Resolve authoritative configuration parameters
  const authDuration =
    typeof config?.gameDurationSeconds === 'number' && config.gameDurationSeconds > 0
      ? config.gameDurationSeconds
      : 30;
  const startScore =
    typeof config?.startingScore === 'number' && Number.isFinite(config.startingScore)
      ? Math.trunc(config.startingScore)
      : 0;
  const posScore =
    typeof config?.positiveScore === 'number' && Number.isFinite(config.positiveScore)
      ? Math.trunc(config.positiveScore)
      : 10;
  const negPenalty = normalizeNegativePenalty(config?.negativePenalty);
  const allowNegativeScore = Boolean(config?.allowNegativeScore);

  // 3. Validate duration
  const rawDuration = meta.duration !== undefined ? meta.duration : authDuration;
  if (typeof rawDuration !== 'number' || !Number.isFinite(rawDuration) || rawDuration <= 0) {
    return {
      isValid: false,
      reason: 'Duration must be a positive finite number',
      code: 'INVALID_DURATION',
    };
  }
  if (rawDuration > authDuration + 5) {
    return {
      isValid: false,
      reason: `Reported duration (${rawDuration}s) exceeds configured game duration (${authDuration}s)`,
      code: 'DURATION_EXCEEDED',
    };
  }
  const effectiveDuration = Math.min(rawDuration, authDuration);

  // 4. Validate hit counts (must be explicit non-negative integers, not floats or negative)
  const rawPositiveHits = meta.positiveHits !== undefined ? meta.positiveHits : meta.hits;
  const positiveHits = rawPositiveHits !== undefined ? rawPositiveHits : 0;
  if (
    typeof positiveHits !== 'number' ||
    !Number.isFinite(positiveHits) ||
    !Number.isInteger(positiveHits) ||
    positiveHits < 0
  ) {
    return {
      isValid: false,
      reason: 'Positive hits must be a non-negative integer',
      code: 'INVALID_HITS',
    };
  }

  const negativeHits = meta.negativeHits !== undefined ? meta.negativeHits : 0;
  if (
    typeof negativeHits !== 'number' ||
    !Number.isFinite(negativeHits) ||
    !Number.isInteger(negativeHits) ||
    negativeHits < 0
  ) {
    return {
      isValid: false,
      reason: 'Negative hits must be a non-negative integer',
      code: 'INVALID_PENALTIES',
    };
  }

  const totalHits = positiveHits + negativeHits;

  // Validate totalHits / hits if explicitly provided alongside positiveHits
  const reportedTotalHits = meta.totalHits !== undefined ? meta.totalHits : meta.hits;
  if (reportedTotalHits !== undefined) {
    if (
      typeof reportedTotalHits !== 'number' ||
      !Number.isFinite(reportedTotalHits) ||
      !Number.isInteger(reportedTotalHits) ||
      reportedTotalHits < 0
    ) {
      return {
        isValid: false,
        reason: 'Total hits must be a non-negative integer',
        code: 'INVALID_HITS',
      };
    }
    if (meta.positiveHits !== undefined && reportedTotalHits !== totalHits) {
      return {
        isValid: false,
        reason: `Reported totalHits (${reportedTotalHits}) does not match positiveHits (${positiveHits}) + negativeHits (${negativeHits})`,
        code: 'INVALID_HITS',
      };
    }
  }

  // Validate missedTargets / misses if provided
  const rawMisses = meta.missedTargets !== undefined ? meta.missedTargets : meta.misses;
  if (rawMisses !== undefined) {
    if (
      typeof rawMisses !== 'number' ||
      !Number.isFinite(rawMisses) ||
      !Number.isInteger(rawMisses) ||
      rawMisses < 0
    ) {
      return {
        isValid: false,
        reason: 'Missed targets count must be a non-negative integer',
        code: 'INVALID_MISSES',
      };
    }
  }

  // Validate streak if provided
  const rawStreak = meta.highestStreak !== undefined ? meta.highestStreak : meta.maxStreak;
  if (rawStreak !== undefined) {
    if (
      typeof rawStreak !== 'number' ||
      !Number.isFinite(rawStreak) ||
      !Number.isInteger(rawStreak) ||
      rawStreak < 0 ||
      rawStreak > positiveHits
    ) {
      return {
        isValid: false,
        reason: `Invalid streak (${rawStreak}) for ${positiveHits} positive hits`,
        code: 'INVALID_STREAK',
      };
    }
  }

  // 5. Plausible physical & spawn rate limits
  // Human physical tap limit: at least 120ms per distinct aimed target hit
  const maxHumanHitsInDuration = Math.ceil((effectiveDuration * 1000) / 120) + 3;
  // Spawn interval limit based on configured minimum spawn interval
  const minSpawnMs = Math.max(100, config?.minSpawnIntervalMs ?? 600);
  const maxSimultaneous = Math.max(1, config?.maxSimultaneousTargets ?? 4);
  // Allow generous buffer for simultaneous targets while blocking impossible hit counts
  const maxSpawnableTargets = Math.ceil((effectiveDuration * 1000) / Math.min(200, minSpawnMs)) + maxSimultaneous + 5;
  const maxAllowedHits = Math.min(maxHumanHitsInDuration, maxSpawnableTargets);

  if (totalHits > maxAllowedHits) {
    return {
      isValid: false,
      reason: `Impossible hit count: ${totalHits} hits in ${effectiveDuration} seconds (max allowed: ${maxAllowedHits})`,
      code: 'IMPOSSIBLE_HIT_RATE',
    };
  }

  // 6. Negative score clamping enforcement
  if (!allowNegativeScore && submitted < 0) {
    return {
      isValid: false,
      reason: `Negative score (${submitted}) is not allowed when allowNegativeScore is false`,
      code: 'NEGATIVE_SCORE_FORBIDDEN',
    };
  }

  // 7. Authoritative Score Consistency Check
  // Unclamped final score: startScore + positiveHits * posScore + negativeHits * negPenalty
  const rawUnclampedScore = startScore + positiveHits * posScore + negativeHits * negPenalty;

  // When allowNegativeScore === true, no floor clamping occurs so the score is exact.
  // When allowNegativeScore === false, intermediate hits cannot drop below 0:
  // - Minimum possible final score: all positive hits first, then all negative hits -> max(0, rawUnclampedScore)
  // - Maximum possible final score: all negative hits first (absorbed at 0 floor), then all positive hits -> max(0, startScore + negativeHits * negPenalty) + positiveHits * posScore
  const minExpectedScore = allowNegativeScore
    ? rawUnclampedScore
    : Math.max(0, rawUnclampedScore);

  const maxExpectedScore = allowNegativeScore
    ? rawUnclampedScore
    : Math.max(0, startScore + negativeHits * negPenalty) + positiveHits * posScore;

  if (submitted > maxExpectedScore) {
    return {
      isValid: false,
      reason: `Submitted score (${submitted}) exceeds maximum valid score (${maxExpectedScore}) for ${positiveHits} positive and ${negativeHits} negative hits`,
      code: 'SCORE_EXCEEDS_MAX_POSSIBLE',
    };
  }

  if (submitted < minExpectedScore) {
    return {
      isValid: false,
      reason: `Submitted score (${submitted}) is below minimum valid score (${minExpectedScore}) for ${positiveHits} positive and ${negativeHits} negative hits`,
      code: 'SCORE_MISMATCH',
    };
  }

  // Step granularity verification: every score transition is +posScore, +negPenalty, or clamp to 0.
  const stepGcd = gcd(posScore, Math.abs(negPenalty));
  if (stepGcd > 1 && startScore % stepGcd === 0 && Math.abs(submitted) % stepGcd !== 0) {
    return {
      isValid: false,
      reason: `Submitted score (${submitted}) does not align with point increments (${posScore} / ${negPenalty})`,
      code: 'SCORE_MISMATCH',
    };
  }

  return {
    isValid: true,
    expectedScore: submitted,
  };
}

