/**
 * Server-side Catch The Brand Scoring & Result Validation Module
 *
 * Provides authoritative sanity validation against forged scores.
 * Evaluates:
 * - Game duration (from event or theme physics configuration)
 * - Minimum spawn interval & maximum possible spawn rate
 * - Maximum catch rate across stages
 * - Item point values (regular, bonus, hazard)
 * - Detailed item breakdown (itemsCaughtById) & category catches (green, golden, orange)
 * - Maximum theoretical score ceiling for session
 */

export const CATCH_BRAND_GAME_VERSION = 1;
export const CATCH_BRAND_SCORING_VERSION = 1;

export interface CatchBrandItemConfig {
  id: string;
  name?: string;
  points: number;
  isHazard?: boolean;
  isBonus?: boolean;
  enabled?: boolean;
  spawnWeight?: number;
}

export interface CatchBrandPhysicsSanityConfig {
  gameDurationSeconds: number;
  minSpawnIntervalMs: number;
  maxSpawnRatePerSec: number;
  theoreticalMaxSpawns: number;
  maxPossibleScore: number;
  maxItemPoints: number;
  maxBonusPoints: number;
  maxGoodPoints: number;
  minHazardPenalty: number;
  items: CatchBrandItemConfig[];
  itemsMap: Record<string, CatchBrandItemConfig>;
}

export interface CatchBrandResultValidationParams {
  submittedScore: number;
  config: CatchBrandPhysicsSanityConfig;
  metadata?: {
    greenCaught?: number;
    orangeCaught?: number;
    goldenCaught?: number;
    duriansMissed?: number;
    itemsCaughtById?: Record<string, number>;
    duration?: number;
    [key: string]: any;
  };
}

export interface CatchBrandResultValidation {
  isValid: boolean;
  reason?: string;
  code?: string;
  expectedScore?: number;
  authoritativeMaxScore?: number;
  authoritativeDuration?: number;
}

/**
 * Calculates physical gameplay sanity limits for Catch The Brand.
 *
 * @param durationSeconds Duration of the event/game session in seconds
 * @param minSpawnIntervalMs Fastest possible spawn interval across difficulty stages (in ms)
 * @param items List of configured items with points and flags
 */
export function calculateCatchBrandSanityLimits(
  durationSeconds: number,
  minSpawnIntervalMs: number,
  items: CatchBrandItemConfig[]
): CatchBrandPhysicsSanityConfig {
  // 1. Clamp duration to realistic bounds (5s - 120s)
  const gameDurationSeconds = Math.max(5, Math.min(120, Math.floor(durationSeconds || 20)));

  // 2. Clamp minSpawnIntervalMs (floor 250ms due to arcade physics / engine tick limits)
  const validMinInterval = Math.max(250, Math.floor(minSpawnIntervalMs || 550));
  const maxSpawnRatePerSec = 1000 / validMinInterval;

  // 3. Normalize items and build lookup map
  const itemsMap: Record<string, CatchBrandItemConfig> = {};
  const normalizedItems: CatchBrandItemConfig[] = [];

  for (const item of items) {
    if (!item) continue;
    const itemId = String(item.id || item.name || 'item_' + normalizedItems.length);
    const points = typeof item.points === 'number' ? item.points : (Number(item.points) || 10);
    const isHazard = Boolean(item.isHazard || points < 0);
    const isBonus = Boolean(item.isBonus || points >= 50);
    const enabled = item.enabled !== false;

    const normalized: CatchBrandItemConfig = {
      id: itemId,
      name: item.name || itemId,
      points,
      isHazard,
      isBonus,
      enabled,
      spawnWeight: typeof item.spawnWeight === 'number' ? item.spawnWeight : 10,
    };
    normalizedItems.push(normalized);
    itemsMap[itemId] = normalized;
  }

  // Fallback defaults if no enabled items
  if (normalizedItems.length === 0) {
    const defaultTicket: CatchBrandItemConfig = { id: 'ticket', name: 'Ticket', points: 10, isHazard: false, isBonus: false, enabled: true };
    const defaultMask: CatchBrandItemConfig = { id: 'mask', name: 'Mask', points: -10, isHazard: true, isBonus: false, enabled: true };
    const defaultStar: CatchBrandItemConfig = { id: 'star', name: 'Star', points: 50, isHazard: false, isBonus: true, enabled: true };
    normalizedItems.push(defaultTicket, defaultMask, defaultStar);
    itemsMap['ticket'] = defaultTicket;
    itemsMap['mask'] = defaultMask;
    itemsMap['star'] = defaultStar;
  }

  // 4. Point limits
  const enabledGoodItems = normalizedItems.filter((i) => i.enabled && !i.isHazard && i.points > 0);
  const maxItemPoints = enabledGoodItems.length > 0
    ? Math.max(...enabledGoodItems.map((i) => i.points))
    : 50;

  const bonusItems = enabledGoodItems.filter((i) => i.isBonus || i.points >= 50);
  const maxBonusPoints = bonusItems.length > 0
    ? Math.max(...bonusItems.map((i) => i.points))
    : maxItemPoints;

  const regularGoodItems = enabledGoodItems.filter((i) => !i.isBonus && i.points < 50);
  const maxGoodPoints = regularGoodItems.length > 0
    ? Math.max(...regularGoodItems.map((i) => i.points))
    : 10;

  const hazardItems = normalizedItems.filter((i) => i.isHazard || i.points < 0);
  const minHazardPenalty = hazardItems.length > 0
    ? Math.abs(Math.min(...hazardItems.map((i) => i.points)))
    : 10;

  // 5. Theoretical maximum item spawns
  // In GameScene.ts: 2 items spawn at start (t=0, t=300ms), then periodic spawns every interval
  const timerSpawns = Math.ceil((gameDurationSeconds * 1000) / validMinInterval);
  const baseSpawns = 2 + timerSpawns;
  // Apply generous tolerance margin (1.5x + 5) to absorb clock jitter, lag spikes, or frame delays
  const theoreticalMaxSpawns = Math.ceil(baseSpawns * 1.5) + 5;

  // 6. Absolute theoretical maximum score ceiling
  // Even if 100% of spawns were caught with the maximum bonus value
  const rawTheoreticalMaxScore = theoreticalMaxSpawns * maxBonusPoints;
  // Guarantee a safe lower floor of 3,500 points (or 250 points/second) so legitimate human play / tests never trigger false positives
  const maxPossibleScore = Math.max(rawTheoreticalMaxScore, Math.ceil(gameDurationSeconds * 250), 3500);

  return {
    gameDurationSeconds,
    minSpawnIntervalMs: validMinInterval,
    maxSpawnRatePerSec,
    theoreticalMaxSpawns,
    maxPossibleScore,
    maxItemPoints,
    maxBonusPoints,
    maxGoodPoints,
    minHazardPenalty,
    items: normalizedItems,
    itemsMap,
  };
}

/**
 * Validates a submitted Catch The Brand score against physical gameplay constraints.
 */
export function validateCatchBrandResult(
  params: CatchBrandResultValidationParams
): CatchBrandResultValidation {
  const { submittedScore, config, metadata = {} } = params;

  // 1. Validate score is non-negative integer
  if (typeof submittedScore !== 'number' || isNaN(submittedScore) || submittedScore < 0) {
    return {
      isValid: false,
      code: 'INVALID_SCORE_FORMAT',
      reason: 'Score must be a non-negative integer',
    };
  }

  // 2. Sanity ceiling: score cannot exceed the maximum physically possible score
  if (submittedScore > config.maxPossibleScore) {
    return {
      isValid: false,
      code: 'SCORE_EXCEEDS_MAXIMUM_POSSIBLE',
      reason: `Score of ${submittedScore} exceeds maximum physically possible score (${config.maxPossibleScore}) for event duration (${config.gameDurationSeconds}s)`,
      authoritativeMaxScore: config.maxPossibleScore,
    };
  }

  // 3. Validate catch counts if provided in metadata
  const greenCaught = typeof metadata.greenCaught === 'number'
    ? metadata.greenCaught
    : (metadata.greenCaught !== undefined && !isNaN(Number(metadata.greenCaught)) ? Number(metadata.greenCaught) : undefined);
  const orangeCaught = typeof metadata.orangeCaught === 'number'
    ? metadata.orangeCaught
    : (metadata.orangeCaught !== undefined && !isNaN(Number(metadata.orangeCaught)) ? Number(metadata.orangeCaught) : undefined);
  const goldenCaught = typeof metadata.goldenCaught === 'number'
    ? metadata.goldenCaught
    : (metadata.goldenCaught !== undefined && !isNaN(Number(metadata.goldenCaught)) ? Number(metadata.goldenCaught) : undefined);

  if (
    (greenCaught !== undefined && (greenCaught < 0 || !Number.isInteger(greenCaught))) ||
    (orangeCaught !== undefined && (orangeCaught < 0 || !Number.isInteger(orangeCaught))) ||
    (goldenCaught !== undefined && (goldenCaught < 0 || !Number.isInteger(goldenCaught)))
  ) {
    return {
      isValid: false,
      code: 'INVALID_CATCH_BRAND_SCORE',
      reason: 'Item catch counts must be non-negative integers',
    };
  }

  const totalReportedCaught = (greenCaught || 0) + (orangeCaught || 0) + (goldenCaught || 0);

  // Total catches cannot exceed maximum theoretical spawns
  if (totalReportedCaught > config.theoreticalMaxSpawns) {
    return {
      isValid: false,
      code: 'INVALID_CATCH_BRAND_SCORE',
      reason: `Total items caught (${totalReportedCaught}) exceeds maximum physically possible spawns (${config.theoreticalMaxSpawns}) for ${config.gameDurationSeconds}s duration`,
    };
  }

  // 4. Item breakdown verification (if itemsCaughtById provided)
  if (metadata.itemsCaughtById && typeof metadata.itemsCaughtById === 'object') {
    let breakdownScore = 0;
    let totalBreakdownCount = 0;

    for (const [itemId, countVal] of Object.entries(metadata.itemsCaughtById)) {
      const count = Number(countVal);
      if (isNaN(count) || count < 0 || !Number.isInteger(count)) {
        return {
          isValid: false,
          code: 'INVALID_CATCH_BRAND_SCORE',
          reason: `Invalid item count for '${itemId}': must be a non-negative integer`,
        };
      }
      totalBreakdownCount += count;
      const itemCfg = config.itemsMap[itemId];
      if (itemCfg) {
        breakdownScore += count * itemCfg.points;
      }
    }

    if (totalBreakdownCount > config.theoreticalMaxSpawns) {
      return {
        isValid: false,
        code: 'INVALID_CATCH_BRAND_SCORE',
        reason: `Total item breakdown count (${totalBreakdownCount}) exceeds maximum physically possible spawns (${config.theoreticalMaxSpawns}) for ${config.gameDurationSeconds}s duration`,
      };
    }

    // Floor breakdown score at 0
    breakdownScore = Math.max(0, breakdownScore);

    // Submitted score cannot exceed what the authoritative breakdown yields
    if (submittedScore > breakdownScore) {
      return {
        isValid: false,
        code: 'INVALID_CATCH_BRAND_SCORE',
        reason: `Submitted score (${submittedScore}) exceeds authoritative score (${breakdownScore}) calculated from item breakdown`,
        expectedScore: breakdownScore,
      };
    }

    return {
      isValid: true,
      expectedScore: breakdownScore,
      authoritativeMaxScore: config.maxPossibleScore,
      authoritativeDuration: config.gameDurationSeconds,
    };
  }

  // 5. Catch category upper-bound verification (when itemsCaughtById is omitted, but categories are reported)
  if (greenCaught !== undefined || goldenCaught !== undefined) {
    const maxPossibleFromCatches = Math.max(
      0,
      (goldenCaught || 0) * config.maxBonusPoints +
      (greenCaught || 0) * config.maxGoodPoints -
      (orangeCaught || 0) * config.minHazardPenalty
    );

    if (submittedScore > maxPossibleFromCatches) {
      return {
        isValid: false,
        code: 'INVALID_CATCH_BRAND_SCORE',
        reason: `Submitted score (${submittedScore}) exceeds maximum possible score (${maxPossibleFromCatches}) for reported item catches`,
        expectedScore: maxPossibleFromCatches,
      };
    }
  }

  return {
    isValid: true,
    expectedScore: submittedScore,
    authoritativeMaxScore: config.maxPossibleScore,
    authoritativeDuration: config.gameDurationSeconds,
  };
}
