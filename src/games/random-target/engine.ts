import {
  ActiveTarget,
  RandomTargetGameConfig,
  RandomTargetStats,
  TargetDefinition,
} from './types';

/**
 * Calculates current difficulty parameters based on game elapsed progress (0 to 1).
 */
export function calculateCurrentDifficulty(
  progress: number,
  config: RandomTargetGameConfig
): { spawnIntervalMs: number; targetLifetimeMs: number } {
  const p = Math.max(0, Math.min(1, progress));

  if (config.difficultyProgression === 'none') {
    return {
      spawnIntervalMs: config.initialSpawnIntervalMs,
      targetLifetimeMs: config.targetLifetimeMs,
    };
  }

  const curve = config.difficultyProgression === 'exponential' ? Math.pow(p, 1.6) : p;

  const spawnIntervalMs = Math.round(
    config.initialSpawnIntervalMs - curve * (config.initialSpawnIntervalMs - config.minSpawnIntervalMs)
  );

  const targetLifetimeMs = Math.round(
    config.targetLifetimeMs - curve * (config.targetLifetimeMs - config.minTargetLifetimeMs)
  );

  return {
    spawnIntervalMs: Math.max(config.minSpawnIntervalMs, spawnIntervalMs),
    targetLifetimeMs: Math.max(config.minTargetLifetimeMs, targetLifetimeMs),
  };
}

/**
 * Checks whether a candidate coordinate overlaps with any existing target.
 */
export function isPositionOverlapping(
  candidateX: number,
  candidateY: number,
  candidateSizePct: number,
  existingTargets: ActiveTarget[]
): boolean {
  for (const target of existingTargets) {
    if (target.state !== 'active' && target.state !== 'spawning') continue;

    const dx = candidateX - target.xPercent;
    const dy = candidateY - target.yPercent;
    const distance = Math.hypot(dx, dy);

    // Minimum distance threshold in percent
    const minDistance = (candidateSizePct + (target.size / 5.76)) * 0.75;
    if (distance < minDistance) {
      return true;
    }
  }
  return false;
}

/**
 * Spawns a new active target if within simultaneous target limits and valid position found.
 */
export function spawnRandomTarget(
  config: RandomTargetGameConfig,
  currentTargets: ActiveTarget[],
  targetLifetimeMs: number
): ActiveTarget | null {
  const activeCount = currentTargets.filter(
    (t) => t.state === 'active' || t.state === 'spawning'
  ).length;

  if (activeCount >= config.maxSimultaneousTargets) {
    return null;
  }

  // Weighted random pick between positive and negative
  const posWeight = Math.max(1, config.positiveTarget.spawnWeight || 70);
  const negWeight = Math.max(1, config.negativeTarget.spawnWeight || 30);
  const totalWeight = posWeight + negWeight;
  const roll = Math.random() * totalWeight;
  const isPos = roll < posWeight;
  const def: TargetDefinition = isPos ? config.positiveTarget : config.negativeTarget;

  // Safe area bounds in percent
  const left = config.playArea.leftPercent;
  const right = config.playArea.rightPercent;
  const top = config.playArea.topPercent;
  const bottom = config.playArea.bottomPercent;

  const targetSize = def.size || 88;
  const sizePctX = (targetSize / 1024) * 100;
  const sizePctY = (targetSize / 576) * 100;

  // Retry up to 8 times to find non-overlapping location
  const spanX = Math.max(1, right - left - sizePctX);
  const spanY = Math.max(1, bottom - top - sizePctY);
  let chosenX = left + Math.random() * spanX;
  let chosenY = top + Math.random() * spanY;

  for (let attempt = 0; attempt < 8; attempt++) {
    const candidateX = left + Math.random() * spanX;
    const candidateY = top + Math.random() * spanY;

    if (!isPositionOverlapping(candidateX, candidateY, sizePctX, currentTargets)) {
      chosenX = candidateX;
      chosenY = candidateY;
      break;
    }
  }

  const uid = `tgt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const normalizedScore = def.isPenalty
    ? -Math.abs(Math.trunc(def.score))
    : Math.max(0, Math.trunc(def.score));

  return {
    uid,
    definitionId: def.id,
    name: def.name,
    imageUrl: def.imageUrl,
    score: normalizedScore,
    isPenalty: def.isPenalty,
    xPercent: chosenX,
    yPercent: chosenY,
    size: targetSize,
    spawnTimeMs: Date.now(),
    lifetimeMs: targetLifetimeMs,
    state: 'spawning',
    hitEffectType: def.hitEffectType,
  };
}

/**
 * Authoritatively handles player tap / click on target.
 * Guarantees single-hit consumption and updates score and stats.
 */
export function handleTargetHit(
  targetUid: string,
  currentTargets: ActiveTarget[],
  currentStats: RandomTargetStats,
  config: RandomTargetGameConfig,
  currentTimeMs: number = Date.now()
): {
  updatedTargets: ActiveTarget[];
  updatedStats: RandomTargetStats;
  hitTarget: ActiveTarget | null;
} {
  const targetIndex = currentTargets.findIndex((t) => t.uid === targetUid);
  if (targetIndex === -1) {
    return { updatedTargets: currentTargets, updatedStats: currentStats, hitTarget: null };
  }

  const target = currentTargets[targetIndex];
  // Target already hit or expired (including by timestamp) - reject
  if (
    (target.state !== 'active' && target.state !== 'spawning') ||
    currentTimeMs - target.spawnTimeMs >= target.lifetimeMs
  ) {
    return { updatedTargets: currentTargets, updatedStats: currentStats, hitTarget: null };
  }

  const isPositive = !target.isPenalty;
  const configuredDelta = isPositive
    ? Math.max(0, Math.trunc(config.positiveTarget?.score ?? target.score))
    : -Math.abs(Math.trunc(config.negativeTarget?.score ?? target.score));

  // Mark target as hit
  const updatedTargets = [...currentTargets];
  const hitTarget: ActiveTarget = {
    ...target,
    score: configuredDelta,
    state: 'hit',
  };
  updatedTargets[targetIndex] = hitTarget;

  // Calculate score delta using shared scoring contract
  let newScore = currentStats.score + configuredDelta;
  if (!config.allowNegativeScore && newScore < 0) {
    newScore = 0;
  }

  const newPositiveHits = currentStats.positiveHits + (isPositive ? 1 : 0);
  const newNegativeHits = currentStats.negativeHits + (isPositive ? 0 : 1);
  const newTotalHits = currentStats.totalHits + 1;
  const newStreak = isPositive ? currentStats.currentStreak + 1 : 0;
  const newHighestStreak = Math.max(currentStats.highestStreak, newStreak);
  const totalAttempts = newTotalHits + currentStats.missedTargets;
  const newAccuracy = totalAttempts > 0 ? Math.round((newPositiveHits / totalAttempts) * 100) : 100;

  const updatedStats: RandomTargetStats = {
    score: newScore,
    positiveHits: newPositiveHits,
    negativeHits: newNegativeHits,
    totalHits: newTotalHits,
    missedTargets: currentStats.missedTargets,
    accuracy: newAccuracy,
    currentStreak: newStreak,
    highestStreak: newHighestStreak,
  };

  return {
    updatedTargets,
    updatedStats,
    hitTarget,
  };
}

/**
 * Handles expiration of targets that weren't tapped in time,
 * and transitions newly spawned targets from 'spawning' to 'active'.
 */
export function handleTargetExpirations(
  currentTimeMs: number,
  currentTargets: ActiveTarget[],
  currentStats: RandomTargetStats
): { updatedTargets: ActiveTarget[]; updatedStats: RandomTargetStats; newlyExpiredCount: number } {
  let newlyExpiredCount = 0;

  const updatedTargets = currentTargets.map((t) => {
    if (t.state === 'active' || t.state === 'spawning') {
      const ageMs = currentTimeMs - t.spawnTimeMs;
      if (ageMs >= t.lifetimeMs) {
        newlyExpiredCount += t.isPenalty ? 0 : 1; // Expired positive target is counted as a missed opportunity
        return { ...t, state: 'expired' as const };
      }
      if (t.state === 'spawning' && ageMs >= 160) {
        return { ...t, state: 'active' as const };
      }
    }
    return t;
  });

  if (newlyExpiredCount === 0) {
    return { updatedTargets, updatedStats: currentStats, newlyExpiredCount: 0 };
  }

  const newMissed = currentStats.missedTargets + newlyExpiredCount;
  const totalAttempts = currentStats.totalHits + newMissed;
  const newAccuracy = totalAttempts > 0 ? Math.round((currentStats.positiveHits / totalAttempts) * 100) : 100;

  const updatedStats: RandomTargetStats = {
    ...currentStats,
    missedTargets: newMissed,
    accuracy: newAccuracy,
  };

  return {
    updatedTargets,
    updatedStats,
    newlyExpiredCount,
  };
}

export const NEUTRAL_TOOL_AIM_DEG = 0;
export const TOOL_MUZZLE_FLASH_DURATION_MS = 90;
export const TOOL_RECOIL_DURATION_MS = 140;
export const TOOL_RETURN_TO_NEUTRAL_MS = 260;

/**
 * Computes angle in degrees from tool position to target position,
 * normalized to [-180, 180] relative to baseAngleDeg.
 */
export function calculateAimAngleDeg(
  toolX: number,
  toolY: number,
  targetX: number,
  targetY: number,
  baseAngleDeg: number = 0
): number {
  const dx = targetX - toolX;
  const dy = targetY - toolY;
  const rad = Math.atan2(dy, dx);
  const deg = (rad * 180) / Math.PI;
  let delta = deg - baseAngleDeg;
  while (delta > 180) delta -= 360;
  while (delta < -180) delta += 360;
  return delta;
}

/**
 * Computes the natural diagonal angle (in screen degrees) from the bottom-right tool anchor
 * toward the center of the game scene. Since the pistol artwork is already drawn diagonally
 * pointing toward the center of the scene, this defines the 0deg neutral reference vector.
 */
export function calculateNeutralToolBarrelAngleDeg(
  toolX: number,
  toolY: number,
  sceneWidth: number = 1024,
  sceneHeight: number = 576
): number {
  return calculateAimAngleDeg(toolX, toolY, sceneWidth / 2, sceneHeight / 2, 0);
}

/**
 * Computes the relative aiming rotation offset (in degrees) from the tool's neutral
 * diagonal orientation toward a target at (targetX, targetY).
 * - Returns 0 when aiming at the center of the scene (preserving the artwork's natural diagonal pose).
 * - Returns negative degrees (counter-clockwise) when aiming to the left of center.
 * - Returns positive degrees (clockwise) when aiming to the right/upper-right of center.
 */
export function calculateToolShotAngleDeg(
  toolX: number,
  toolY: number,
  targetX: number,
  targetY: number,
  sceneWidth: number = 1024,
  sceneHeight: number = 576
): number {
  const neutralBarrelAngleDeg = calculateNeutralToolBarrelAngleDeg(
    toolX,
    toolY,
    sceneWidth,
    sceneHeight
  );
  const rawDelta = calculateAimAngleDeg(toolX, toolY, targetX, targetY, neutralBarrelAngleDeg);
  return Math.max(-45, Math.min(65, rawDelta));
}

