(globalThis as any).window = globalThis;
(globalThis as any).Image = class Image {};
(globalThis as any).HTMLCanvasElement = class HTMLCanvasElement {};
const mockContext = {
  fillStyle: '',
  fillRect: () => {},
  putImageData: () => {},
  getImageData: () => ({ data: [0, 0, 0, 0] }),
};
const mockCanvas = new (globalThis as any).HTMLCanvasElement();
mockCanvas.getContext = () => mockContext;

(globalThis as any).document = {
  createElement: () => mockCanvas,
  documentElement: {},
};

import assert from 'node:assert';

const {
  calculateCurrentDifficulty,
  spawnRandomTarget,
  handleTargetHit,
  handleTargetExpirations,
  calculateAimAngleDeg,
} = await import('./engine');

const {
  DEFAULT_DESERT_CONFIG,
  DEFAULT_OCEAN_CONFIG,
} = await import('./types');

const { THEME_REGISTRY, getDefaultThemeForGameType } = await import('../../themes/registry');
const { getThemeGameType, isRandomTargetTheme, isCatcherGameTheme, isMatch3Theme, isMemoryMatchTheme, isReactionTheme } = await import('../../themes/types');
const { getGameDefinition, GAME_REGISTRY } = await import('../registry');
const { validateRandomTargetResult, calculateRandomTargetScore } = await import('../../../server/games/randomTargetScoring');

console.log('======================================================');
console.log('RUNNING RANDOM TARGET ARCADE ENGINE & RESOLUTION TESTS');
console.log('======================================================');

// 1. GAME_REGISTRY verification
{
  const rtDef = getGameDefinition('random-target');
  assert.ok(rtDef, 'Random Target Arcade definition must exist in registry');
  assert.strictEqual(rtDef.id, 'random-target');
  assert.strictEqual(rtDef.name, 'Random Target Arcade');
  assert.ok(rtDef.component, 'Random Target Arcade must have a component');
  assert.strictEqual(rtDef.isAvailable, true);
  console.log('✓ PASS: GAME_REGISTRY contains Random Target Arcade');
}

// 2. Theme Registration and Defaults
{
  const desertTheme = THEME_REGISTRY['desert-quick-draw'];
  assert.ok(desertTheme, 'Desert Quick Draw theme must be registered in THEME_REGISTRY');
  assert.strictEqual(desertTheme.game_type, 'random-target');
  assert.strictEqual(isRandomTargetTheme(desertTheme), true);

  const oceanTheme = THEME_REGISTRY['ocean-treasure-hunt'];
  assert.ok(oceanTheme, 'Ocean Treasure Hunt theme must be registered in THEME_REGISTRY');
  assert.strictEqual(oceanTheme.game_type, 'random-target');
  assert.strictEqual(isRandomTargetTheme(oceanTheme), true);

  const defaultTheme = getDefaultThemeForGameType('random-target');
  assert.strictEqual(defaultTheme.id, 'desert-quick-draw', 'Default theme for random-target must be desert-quick-draw');
  console.log('✓ PASS: Theme registry and default theme resolution for random-target');
}

// 3. Game Isolation: random-target themes never claim other games
{
  const desertTheme = THEME_REGISTRY['desert-quick-draw'];
  const oceanTheme = THEME_REGISTRY['ocean-treasure-hunt'];

  assert.strictEqual(getThemeGameType(desertTheme), 'random-target');
  assert.strictEqual(getThemeGameType(oceanTheme), 'random-target');

  assert.strictEqual(isCatcherGameTheme(desertTheme), false);
  assert.strictEqual(isMatch3Theme(desertTheme), false);
  assert.strictEqual(isMemoryMatchTheme(desertTheme), false);
  assert.strictEqual(isReactionTheme(desertTheme), false);

  assert.strictEqual(isCatcherGameTheme(oceanTheme), false);
  assert.strictEqual(isMatch3Theme(oceanTheme), false);
  assert.strictEqual(isMemoryMatchTheme(oceanTheme), false);
  assert.strictEqual(isReactionTheme(oceanTheme), false);
  console.log('✓ PASS: Game engine isolation verified (no cross-game contamination)');
}

// 4. Spawning Invariants & Safe Bounds
{
  const config = DEFAULT_DESERT_CONFIG;
  const existingTargets: any[] = [];

  for (let i = 0; i < 20; i++) {
    const spawned = spawnRandomTarget(config, existingTargets, config.targetLifetimeMs);
    assert.ok(spawned, 'Target must spawn when under max count');
    
    // Bounds check percentages
    assert.ok(spawned.xPercent >= config.playArea.leftPercent, 'Target X% must respect safe margin left');
    assert.ok(spawned.xPercent <= config.playArea.rightPercent, 'Target X% must respect safe margin right');
    assert.ok(spawned.yPercent >= config.playArea.topPercent, 'Target Y% must respect safe margin top');
    assert.ok(spawned.yPercent <= config.playArea.bottomPercent, 'Target Y% must respect safe margin bottom');

    assert.ok(spawned.uid.startsWith('tgt_'), 'Target UID must have prefix');
    assert.strictEqual(spawned.state, 'spawning');
  }
  console.log('✓ PASS: Spawning coordinates respect safe area boundaries');
}

// 5. Difficulty Progression
{
  const config = DEFAULT_DESERT_CONFIG;
  const startDiff = calculateCurrentDifficulty(0, config);
  assert.strictEqual(startDiff.spawnIntervalMs, config.initialSpawnIntervalMs);

  const midDiff = calculateCurrentDifficulty(0.5, config);
  assert.ok(midDiff.spawnIntervalMs < startDiff.spawnIntervalMs, 'Spawn interval must decrease at mid-round');
  assert.ok(midDiff.spawnIntervalMs >= config.minSpawnIntervalMs, 'Spawn interval cannot fall below minimum');

  const endDiff = calculateCurrentDifficulty(1.0, config);
  assert.ok(endDiff.spawnIntervalMs <= midDiff.spawnIntervalMs, 'Spawn interval at round end is at or near minimum');
  assert.strictEqual(endDiff.spawnIntervalMs, config.minSpawnIntervalMs);
  console.log('✓ PASS: Difficulty scaling progression is monotonic and bounded');
}

// 6. Hit Detection & Scoring Logic
{
  const config = DEFAULT_DESERT_CONFIG;
  const spawned = spawnRandomTarget(config, [], config.targetLifetimeMs)!;
  // Mark active
  spawned.state = 'active';

  const initialStats = {
    score: 0,
    positiveHits: 0,
    negativeHits: 0,
    totalHits: 0,
    missedTargets: 0,
    accuracy: 100,
    currentStreak: 0,
    highestStreak: 0,
  };

  const hitResult = handleTargetHit(spawned.uid, [spawned], initialStats, config);
  assert.ok(hitResult.hitTarget, 'Hit must identify target');
  assert.strictEqual(hitResult.hitTarget.state, 'hit');

  if (!spawned.isPenalty) {
    assert.strictEqual(hitResult.updatedStats.score, spawned.score);
    assert.strictEqual(hitResult.updatedStats.positiveHits, 1);
    assert.strictEqual(hitResult.updatedStats.currentStreak, 1);
  } else {
    assert.strictEqual(hitResult.updatedStats.score, Math.max(0, spawned.score));
    assert.strictEqual(hitResult.updatedStats.negativeHits, 1);
    assert.strictEqual(hitResult.updatedStats.currentStreak, 0);
  }

  // Double hit on same target must be ignored
  const doubleHit = handleTargetHit(spawned.uid, hitResult.updatedTargets, hitResult.updatedStats, config);
  assert.strictEqual(doubleHit.hitTarget, null);
  assert.strictEqual(doubleHit.updatedStats.score, hitResult.updatedStats.score);
  console.log('✓ PASS: Hit detection and score calculation correctly handled');
}

// 7. Expiration Detection
{
  const config = DEFAULT_DESERT_CONFIG;
  const now = 10000;
  const target = {
    uid: 'test_exp',
    definitionId: 'pos',
    name: 'Target',
    imageUrl: '',
    score: 10,
    isPenalty: false,
    xPercent: 50,
    yPercent: 50,
    size: 88,
    spawnTimeMs: now,
    lifetimeMs: 1500,
    state: 'active' as const,
  };

  const initialStats = {
    score: 0,
    positiveHits: 0,
    negativeHits: 0,
    totalHits: 0,
    missedTargets: 0,
    accuracy: 100,
    currentStreak: 0,
    highestStreak: 0,
  };

  const beforeExp = handleTargetExpirations(now + 1000, [target], initialStats);
  assert.strictEqual(beforeExp.newlyExpiredCount, 0);
  assert.strictEqual(beforeExp.updatedTargets[0].state, 'active');

  const afterExp = handleTargetExpirations(now + 1600, [target], initialStats);
  assert.strictEqual(afterExp.newlyExpiredCount, 1);
  assert.strictEqual(afterExp.updatedTargets[0].state, 'expired');
  console.log('✓ PASS: Target lifetime and expiration tracking');
}

// 8. Tool Aim Angle Calculation
{
  const toolX = 900;
  const toolY = 500;

  // Target directly above tool
  const angleUp = calculateAimAngleDeg(toolX, toolY, 900, 300);
  assert.ok(Math.abs(angleUp - (-90)) < 1, 'Angle straight up should be ~ -90 deg');

  // Target to left of tool
  const angleLeft = calculateAimAngleDeg(toolX, toolY, 500, 500);
  assert.ok(Math.abs(angleLeft - (-180)) < 1 || Math.abs(angleLeft - 180) < 1, 'Angle straight left should be ~ 180 deg');
  console.log('✓ PASS: Tool aim angle calculations are geometrically accurate');
}

//9: Server Score Validation & Anti-Cheat Contract (Phase 2)
{
  // 9a. Legitimate game submission (12 positive * 10 = 120, 1 negative at start clamped at 0 -> 120, or 110)
  const validExact = validateRandomTargetResult({
    submittedScore: 110,
    metadata: {
      duration: 30,
      positiveHits: 12,
      negativeHits: 1,
      maxStreak: 5,
    },
  });
  assert.strictEqual(validExact.isValid, true);
  assert.strictEqual(validExact.expectedScore, 110);

  // Legitimate when negative hit occurred at score 0 (clamped at 0, then 12 positive hits = 120)
  const validClamped = validateRandomTargetResult({
    submittedScore: 120,
    metadata: {
      duration: 30,
      positiveHits: 12,
      negativeHits: 1,
      maxStreak: 5,
    },
  });
  assert.strictEqual(validClamped.isValid, true);
  assert.strictEqual(validClamped.expectedScore, 120);

  // 9b. Configurable scoring values (+25 positive, -15 negative, startingScore: 50)
  const customConfig = {
    gameDurationSeconds: 45,
    startingScore: 50,
    positiveScore: 25,
    negativePenalty: -15,
    allowNegativeScore: false,
  };
  const expectedCustom = calculateRandomTargetScore({
    positiveHits: 4,
    negativeHits: 2,
    startingScore: 50,
    positiveScore: 25,
    negativePenalty: -15,
    allowNegativeScore: false,
  });
  assert.strictEqual(expectedCustom, 50 + 4 * 25 - 2 * 15); // 120

  const validCustom = validateRandomTargetResult({
    submittedScore: 120,
    metadata: {
      duration: 45,
      positiveHits: 4,
      negativeHits: 2,
      totalHits: 6,
      missedTargets: 1,
      highestStreak: 3,
    },
    config: customConfig,
  });
  assert.strictEqual(validCustom.isValid, true);
  assert.strictEqual(validCustom.expectedScore, 120);

  // 9c. Score clamping & allowNegativeScore = true vs false
  const negForbidden = validateRandomTargetResult({
    submittedScore: -20,
    metadata: {
      duration: 30,
      positiveHits: 0,
      negativeHits: 2,
    },
    config: { allowNegativeScore: false, positiveScore: 10, negativePenalty: -10 },
  });
  assert.strictEqual(negForbidden.isValid, false);
  assert.strictEqual(negForbidden.code, 'NEGATIVE_SCORE_FORBIDDEN');

  const negAllowed = validateRandomTargetResult({
    submittedScore: -20,
    metadata: {
      duration: 30,
      positiveHits: 1,
      negativeHits: 3,
    },
    config: { allowNegativeScore: true, positiveScore: 10, negativePenalty: -10 },
  });
  assert.strictEqual(negAllowed.isValid, true);
  assert.strictEqual(negAllowed.expectedScore, -20);

  // 9d. Inconsistent final scores (client claims arbitrary high or low score)
  const inflatedScore = validateRandomTargetResult({
    submittedScore: 500,
    metadata: {
      duration: 30,
      positiveHits: 5,
      negativeHits: 0,
    },
  });
  assert.strictEqual(inflatedScore.isValid, false);
  assert.strictEqual(inflatedScore.code, 'SCORE_EXCEEDS_MAX_POSSIBLE');

  const deflatedScore = validateRandomTargetResult({
    submittedScore: 20,
    metadata: {
      duration: 30,
      positiveHits: 5,
      negativeHits: 0,
    },
  });
  assert.strictEqual(deflatedScore.isValid, false);
  assert.strictEqual(deflatedScore.code, 'SCORE_MISMATCH');

  // Step GCD mismatch (e.g., submittedScore: 115 when positiveScore=10, negativePenalty=-10)
  const stepMismatch = validateRandomTargetResult({
    submittedScore: 115,
    metadata: {
      duration: 30,
      positiveHits: 12,
      negativeHits: 1,
    },
  });
  assert.strictEqual(stepMismatch.isValid, false);
  assert.strictEqual(stepMismatch.code, 'SCORE_MISMATCH');

  // 9e. Invalid and non-integer values
  const floatScore = validateRandomTargetResult({
    submittedScore: 100.5,
    metadata: { duration: 30, positiveHits: 10, negativeHits: 0 },
  });
  assert.strictEqual(floatScore.isValid, false);
  assert.strictEqual(floatScore.code, 'INVALID_SCORE');

  const floatHits = validateRandomTargetResult({
    submittedScore: 100,
    metadata: { duration: 30, positiveHits: 10.5, negativeHits: 0 },
  });
  assert.strictEqual(floatHits.isValid, false);
  assert.strictEqual(floatHits.code, 'INVALID_HITS');

  const negativeHitResult = validateRandomTargetResult({
    submittedScore: 100,
    metadata: { duration: 30, positiveHits: -5, negativeHits: 0 },
  });
  assert.strictEqual(negativeHitResult.isValid, false);
  assert.strictEqual(negativeHitResult.code, 'INVALID_HITS');

  const invalidStreak = validateRandomTargetResult({
    submittedScore: 30,
    metadata: { duration: 30, positiveHits: 3, negativeHits: 0, highestStreak: 10 },
  });
  assert.strictEqual(invalidStreak.isValid, false);
  assert.strictEqual(invalidStreak.code, 'INVALID_STREAK');

  const durationExceeded = validateRandomTargetResult({
    submittedScore: 50,
    metadata: { duration: 120, positiveHits: 5, negativeHits: 0 },
    config: { gameDurationSeconds: 30 },
  });
  assert.strictEqual(durationExceeded.isValid, false);
  assert.strictEqual(durationExceeded.code, 'DURATION_EXCEEDED');

  // 9f. Impossible hit rate (e.g. 500 hits in 10 seconds)
  const impossibleResult = validateRandomTargetResult({
    submittedScore: 5000,
    metadata: {
      duration: 10,
      positiveHits: 500,
      negativeHits: 0,
    },
  });
  assert.strictEqual(impossibleResult.isValid, false);
  assert.strictEqual(impossibleResult.code, 'IMPOSSIBLE_HIT_RATE');

  console.log('✓ PASS: Server-side Random Target result validation robustly guards leaderboards');
}

// 10. Expired / Post-Game-Over Target Hit Rejection & Exponential Progression
{
  const config = { ...DEFAULT_DESERT_CONFIG, difficultyProgression: 'exponential' as const };
  const expMid = calculateCurrentDifficulty(0.5, config);
  const linMid = calculateCurrentDifficulty(0.5, { ...DEFAULT_DESERT_CONFIG, difficultyProgression: 'linear' });
  assert.ok(expMid.spawnIntervalMs > linMid.spawnIntervalMs, 'Exponential curve should differ from linear at midpoint');

  const now = 20000;
  const expiredByTimeTarget = {
    uid: 'tgt_late',
    definitionId: 'pos',
    name: 'Bandit',
    imageUrl: '',
    score: 10,
    isPenalty: false,
    xPercent: 40,
    yPercent: 40,
    size: 88,
    spawnTimeMs: now - 2000,
    lifetimeMs: 1500,
    state: 'active' as const,
    hitEffectType: 'sparks' as const,
  };
  const initialStats = {
    score: 50,
    positiveHits: 5,
    negativeHits: 0,
    totalHits: 5,
    missedTargets: 0,
    accuracy: 100,
    currentStreak: 5,
    highestStreak: 5,
  };
  const lateHit = handleTargetHit('tgt_late', [expiredByTimeTarget], initialStats, config, now);
  assert.strictEqual(lateHit.hitTarget, null, 'Target past its lifetimeMs must not register a hit');
  assert.strictEqual(lateHit.updatedStats.score, 50, 'Score must not change on expired target tap');
  console.log('✓ PASS: Expired targets and post-window taps are strictly rejected');
}

// 11. Server Event & Theme Resolution + End-to-End High Score Submission Integration
{
  const { resolveEventGameType, resolveAuthoritativeRandomTargetConfig, localEventsCache } = await import('../../../server/db/events');
  const { resolveServerGameType } = await import('../../../server/db/themes');
  const { submitEventScore, getEventHighScores } = await import('../../../server/db/highScores');

  // Verify server theme & event game type resolution
  assert.strictEqual(resolveServerGameType('random-target', 'desert-quick-draw', 'Desert Quick Draw'), 'random-target');
  assert.strictEqual(resolveServerGameType(undefined, 'ocean-treasure-hunt', 'Ocean Treasure Hunt'), 'random-target');

  const mockEvent = {
    id: 'evt_rt_unit_test_1',
    name: 'Wild West Quick Draw Event',
    game_id: 'game-random-target',
    game_type: 'random-target',
    game_theme_id: 'desert-quick-draw',
    status: 'live',
    event_status: 'LIVE',
    payment_status: 'PAID',
    start_date: '2020-01-01',
    end_date: '2099-12-31',
    game_config: {
      gameDurationSeconds: 30,
      startingScore: 0,
      positiveTarget: { score: 15 },
      negativeTarget: { score: -5 },
      allowNegativeScore: false,
    },
  };

  const resolvedType = await resolveEventGameType(mockEvent);
  assert.strictEqual(resolvedType, 'random-target', 'resolveEventGameType must resolve random-target');

  const resolvedRtConfig = await resolveAuthoritativeRandomTargetConfig(mockEvent);
  assert.strictEqual(resolvedRtConfig.gameType, 'random-target');
  assert.strictEqual(resolvedRtConfig.positiveScore, 15);
  assert.strictEqual(resolvedRtConfig.negativePenalty, -5);
  assert.strictEqual(resolvedRtConfig.gameDurationSeconds, 30);

  // Register a local test event for end-to-end submitEventScore verification
  const testEventId = `evt_rt_e2e_${Date.now()}`;
  localEventsCache.set(testEventId, {
    id: testEventId,
    name: 'Random Target E2E Test Event',
    organization_id: 'org_test_rt',
    game_id: 'game-random-target',
    game_type: 'random-target',
    game_theme_id: 'desert-quick-draw',
    status: 'live',
    event_status: 'LIVE',
    payment_status: 'PAID',
    start_date: '2020-01-01',
    end_date: '2099-12-31',
    public_token: `tok_${testEventId}`,
    test_scores_cleared_at: new Date().toISOString(),
    game_config: {
      gameDurationSeconds: 30,
      positiveTarget: { score: 15 },
      negativeTarget: { score: -5 },
      allowNegativeScore: false,
    },
  } as any);

  const sessionId = `rt_sess_${Date.now()}_abc123`;

  // 11a. Valid LIVE submission with custom playerName
  const sub1 = await submitEventScore({
    event_id: testEventId,
    player_name: 'Sheriff Alice',
    score: 55, // 4 * 15 - 1 * 5 = 55
    session_id: sessionId,
    metadata: {
      gameType: 'random-target',
      positiveHits: 4,
      negativeHits: 1,
      totalHits: 5,
      missedTargets: 2,
      highestStreak: 3,
      duration: 30,
      isPublicSubmission: true,
    },
  });
  assert.strictEqual(sub1.score.player_name, 'Sheriff Alice');
  assert.strictEqual(sub1.score.score, 55);
  assert.strictEqual(sub1.score_environment, 'live');
  assert.strictEqual(sub1.mode, 'LIVE');

  // 11b. Duplicate submission with same session_id must be idempotent
  const subDup = await submitEventScore({
    event_id: testEventId,
    player_name: 'Sheriff Alice',
    score: 55,
    session_id: sessionId,
    metadata: {
      gameType: 'random-target',
      positiveHits: 4,
      negativeHits: 1,
      totalHits: 5,
      duration: 30,
      isPublicSubmission: true,
    },
  });
  assert.strictEqual(subDup.score.id, sub1.score.id, 'Duplicate session_id submission must return original record');
  assert.strictEqual(subDup.isNewHighScore, false);

  // 11c. Tampered / inconsistent score must be rejected with 422
  let tamperedRejected = false;
  try {
    await submitEventScore({
      event_id: testEventId,
      player_name: 'Cheater Bob',
      score: 9990,
      session_id: `rt_sess_${Date.now()}_cheat1`,
      metadata: {
        gameType: 'random-target',
        positiveHits: 4,
        negativeHits: 0,
        duration: 30,
      },
    });
  } catch (err: any) {
    tamperedRejected = err.status === 422;
  }
  assert.strictEqual(tamperedRejected, true, 'Tampered score must be rejected with HTTP 422');

  // 11d. TEST vs LIVE separation
  const testSub = await submitEventScore({
    event_id: testEventId,
    player_name: 'Tester Charlie',
    score: 150, // 10 * 15 = 150
    session_id: `rt_sess_${Date.now()}_testmode`,
    metadata: {
      gameType: 'random-target',
      positiveHits: 10,
      negativeHits: 0,
      totalHits: 10,
      duration: 30,
      isEventTest: true,
    },
  });
  assert.strictEqual(testSub.score_environment, 'test');
  assert.strictEqual(testSub.mode, 'TEST');

  const liveBoard = await getEventHighScores(testEventId, { limit: 10, scoreEnvironment: 'live' });
  assert.strictEqual(liveBoard.scores.some((r) => r.player_name === 'Sheriff Alice'), true);
  assert.strictEqual(liveBoard.scores.some((r) => r.player_name === 'Tester Charlie'), false, 'TEST scores must not leak into LIVE leaderboard');

  const testBoard = await getEventHighScores(testEventId, { limit: 10, scoreEnvironment: 'test' });
  assert.strictEqual(testBoard.scores.some((r) => r.player_name === 'Tester Charlie'), true);
  assert.strictEqual(testBoard.scores.some((r) => r.player_name === 'Sheriff Alice'), false, 'LIVE scores must not leak into TEST leaderboard');

  // 11e. Studio preview submissions must be rejected with 403 PREVIEW_SCORE_FORBIDDEN
  let previewRejected = false;
  try {
    await submitEventScore({
      event_id: testEventId,
      player_name: 'Previewer',
      score: 30,
      session_id: `rt_sess_${Date.now()}_prev`,
      metadata: {
        gameType: 'random-target',
        positiveHits: 2,
        negativeHits: 0,
        duration: 30,
        isEventPreview: true,
        isEventTest: false,
      },
    });
  } catch (err: any) {
    previewRejected = err.status === 403 && err.code === 'PREVIEW_SCORE_FORBIDDEN';
  }
  assert.strictEqual(previewRejected, true, 'Studio preview scores must be forbidden from official leaderboards');

  // 11f. Unauthorized / Unpaid event score submission must be rejected with 403
  const unpaidEventId = `evt_rt_unpaid_${Date.now()}`;
  localEventsCache.set(unpaidEventId, {
    id: unpaidEventId,
    name: 'Unpaid Random Target Event',
    organization_id: 'org_test_rt',
    game_id: 'game-random-target',
    game_type: 'random-target',
    game_theme_id: 'desert-quick-draw',
    status: 'pending_payment',
    event_status: 'PAYMENT_PENDING',
    payment_status: 'UNPAID',
    start_date: '2020-01-01',
    end_date: '2099-12-31',
    public_token: `tok_${unpaidEventId}`,
    game_config: {
      gameDurationSeconds: 30,
      positiveTarget: { score: 15 },
      negativeTarget: { score: -5 },
    },
  } as any);

  let unpaidRejected = false;
  try {
    await submitEventScore({
      event_id: unpaidEventId,
      player_name: 'Unpaid Player',
      score: 30,
      session_id: `rt_sess_${Date.now()}_unpaid`,
      metadata: {
        gameType: 'random-target',
        positiveHits: 2,
        negativeHits: 0,
        duration: 30,
      },
    });
  } catch (err: any) {
    unpaidRejected = err.status === 403;
  }
  assert.strictEqual(unpaidRejected, true, 'Unpaid event submissions must be rejected with HTTP 403');

  // 11g. Concluded / Expired event score submission must be rejected with 403
  const expiredEventId = `evt_rt_expired_${Date.now()}`;
  localEventsCache.set(expiredEventId, {
    id: expiredEventId,
    name: 'Concluded Random Target Event',
    organization_id: 'org_test_rt',
    game_id: 'game-random-target',
    game_type: 'random-target',
    game_theme_id: 'desert-quick-draw',
    status: 'completed',
    event_status: 'COMPLETED',
    payment_status: 'PAID',
    start_date: '2020-01-01',
    end_date: '2020-01-02',
    public_token: `tok_${expiredEventId}`,
    game_config: {
      gameDurationSeconds: 30,
      positiveTarget: { score: 15 },
      negativeTarget: { score: -5 },
    },
  } as any);

  let expiredRejected = false;
  try {
    await submitEventScore({
      event_id: expiredEventId,
      player_name: 'Late Player',
      score: 30,
      session_id: `rt_sess_${Date.now()}_late`,
      metadata: {
        gameType: 'random-target',
        positiveHits: 2,
        negativeHits: 0,
        duration: 30,
      },
    });
  } catch (err: any) {
    expiredRejected = err.status === 403;
  }
  assert.strictEqual(expiredRejected, true, 'Concluded/expired event submissions must be rejected with HTTP 403');

  console.log('✓ PASS: End-to-end event resolution, idempotency, anti-cheat, unauthorized/unpaid/expired guards, and TEST/LIVE isolation verified');
}

console.log('======================================================');
console.log('ALL RANDOM TARGET ARCADE TESTS PASSED SUCCESSFULLY! 🎉');
console.log('======================================================');

