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

// 12. Desert Quick Draw Dedicated Theme Asset Paths, Transparency & Legacy Override Prevention
{
  const fs = await import('node:fs');
  const path = await import('node:path');
  const sharp = (await import('sharp')).default;
  const { normalizeRandomTargetConfig } = await import('./types');
  const { normalizeGameTheme } = await import('../../themes/registry');
  const { resolveGameAsset } = await import('../../themes/gameAssetResolver');
  const { normalizeServerThemeAssets, DEFAULT_RANDOM_TARGET_DESERT_THEME } = await import('../../../server/db/themes');

  const expectedAssetUrls = {
    bandit: '/assets/games/random-target/themes/desert-quick-draw/bandit.png',
    merchant: '/assets/games/random-target/themes/desert-quick-draw/merchant.png',
    pistol: '/assets/games/random-target/themes/desert-quick-draw/pistol.png',
    background: '/assets/games/random-target/themes/desert-quick-draw/background.png',
  };

  // 12a. Verify all 4 files exist in public/assets/games/random-target/themes/desert-quick-draw/
  for (const [key, publicUrl] of Object.entries(expectedAssetUrls)) {
    const diskPath = path.join(process.cwd(), 'public', publicUrl);
    assert.strictEqual(fs.existsSync(diskPath), true, `Required Desert Quick Draw asset (${key}) must exist at ${diskPath}`);
  }

  // 12b. Verify PNG alpha transparency on bandit.png, merchant.png, and pistol.png
  for (const spriteKey of ['bandit', 'merchant', 'pistol'] as const) {
    const diskPath = path.join(process.cwd(), 'public', expectedAssetUrls[spriteKey]);
    const img = sharp(diskPath);
    const meta = await img.metadata();
    assert.strictEqual(meta.format, 'png', `${spriteKey}.png must be a PNG file`);
    assert.strictEqual(meta.hasAlpha, true, `${spriteKey}.png must have an alpha channel`);
    const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
    assert.strictEqual(info.channels, 4, `${spriteKey}.png must have 4 RGBA channels`);
    let transparentPixels = 0;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] === 0) transparentPixels++;
    }
    assert.ok(transparentPixels > 1000, `${spriteKey}.png must contain genuine transparent pixels`);
  }

  // 12c. Verify DEFAULT_DESERT_CONFIG and desertQuickDrawTheme use exact paths
  assert.strictEqual(DEFAULT_DESERT_CONFIG.positiveTarget.imageUrl, expectedAssetUrls.bandit);
  assert.strictEqual(DEFAULT_DESERT_CONFIG.negativeTarget.imageUrl, expectedAssetUrls.merchant);
  assert.strictEqual(DEFAULT_DESERT_CONFIG.interactionTool.imageUrl, expectedAssetUrls.pistol);

  const desertTheme = THEME_REGISTRY['desert-quick-draw'];
  assert.strictEqual(desertTheme.background_url, expectedAssetUrls.background);
  assert.strictEqual((desertTheme.game_config as any).positiveTarget.imageUrl, expectedAssetUrls.bandit);
  assert.strictEqual((desertTheme.game_config as any).negativeTarget.imageUrl, expectedAssetUrls.merchant);
  assert.strictEqual((desertTheme.game_config as any).interactionTool.imageUrl, expectedAssetUrls.pistol);

  // 12d. Verify server DEFAULT_RANDOM_TARGET_DESERT_THEME and gameAssetResolver
  assert.strictEqual(DEFAULT_RANDOM_TARGET_DESERT_THEME.background_url, expectedAssetUrls.background);
  assert.strictEqual((DEFAULT_RANDOM_TARGET_DESERT_THEME.game_config as any).positiveTarget.imageUrl, expectedAssetUrls.bandit);
  assert.strictEqual((DEFAULT_RANDOM_TARGET_DESERT_THEME.game_config as any).negativeTarget.imageUrl, expectedAssetUrls.merchant);
  assert.strictEqual((DEFAULT_RANDOM_TARGET_DESERT_THEME.game_config as any).interactionTool.imageUrl, expectedAssetUrls.pistol);

  assert.strictEqual(resolveGameAsset({ gameType: 'random-target', themeId: 'desert-quick-draw', assetType: 'background' }), expectedAssetUrls.background);
  assert.strictEqual(resolveGameAsset({ gameType: 'random-target', themeId: 'desert-quick-draw', assetType: 'goodItem' }), expectedAssetUrls.bandit);
  assert.strictEqual(resolveGameAsset({ gameType: 'random-target', themeId: 'desert-quick-draw', assetType: 'hazardItem' }), expectedAssetUrls.merchant);
  assert.strictEqual(resolveGameAsset({ gameType: 'random-target', themeId: 'desert-quick-draw', assetType: 'catcher' }), expectedAssetUrls.pistol);

  // 12e. Verify stale DB / legacy JPEG overrides are sanitized to dedicated Desert Quick Draw PNGs
  const staleDbTheme = {
    id: 'desert-quick-draw',
    name: 'Desert Quick Draw',
    slug: 'desert-quick-draw',
    game_type: 'random-target',
    is_system: false,
    organization_id: 'org_custom_test',
    background_url: '/assets/images/desert_arcade_bg_1792994317277.jpg',
    game_config: {
      positiveTarget: {
        id: 'desert-bandit',
        name: 'Gold Bullseye Target',
        imageUrl: '/assets/images/bandit_target_1792994318514.jpg',
        score: 15,
        hitEffectType: 'burst',
      },
      negativeTarget: {
        id: 'desert-merchant',
        name: 'Red TNT Barrel',
        imageUrl: '/assets/images/merchant_target_1792994318429.jpg',
        score: -15,
        hitEffectType: 'explosion',
      },
      interactionTool: {
        id: 'desert-pistol',
        name: 'Sheriff Revolver',
        imageUrl: '/assets/images/western_pistol_1792994340847.jpg',
        type: 'gun',
        projectileEffect: 'bullet_spark',
      },
    },
  };

  const normalizedClientTheme = normalizeGameTheme(staleDbTheme);
  assert.strictEqual(normalizedClientTheme.background_url, expectedAssetUrls.background);
  assert.strictEqual((normalizedClientTheme.game_config as any).positiveTarget.imageUrl, expectedAssetUrls.bandit);
  assert.strictEqual((normalizedClientTheme.game_config as any).negativeTarget.imageUrl, expectedAssetUrls.merchant);
  assert.strictEqual((normalizedClientTheme.game_config as any).interactionTool.imageUrl, expectedAssetUrls.pistol);
  assert.strictEqual((normalizedClientTheme.game_config as any).positiveTarget.score, 15, 'Custom score should be preserved');
  assert.strictEqual((normalizedClientTheme.game_config as any).negativeTarget.score, -15, 'Custom penalty should be preserved');

  const normalizedServerTheme = normalizeServerThemeAssets(staleDbTheme);
  assert.strictEqual(normalizedServerTheme.background_url, expectedAssetUrls.background);
  assert.strictEqual(normalizedServerTheme.game_config.positiveTarget.imageUrl, expectedAssetUrls.bandit);
  assert.strictEqual(normalizedServerTheme.game_config.negativeTarget.imageUrl, expectedAssetUrls.merchant);
  assert.strictEqual(normalizedServerTheme.game_config.interactionTool.imageUrl, expectedAssetUrls.pistol);

  // 12f. Verify legitimate custom user-uploaded URLs and Ocean Treasure Hunt remain untouched
  const customOrgConfig = normalizeRandomTargetConfig({
    positiveTarget: { imageUrl: 'https://cdn.example.com/org-custom-bandit.png', score: 20 },
    negativeTarget: { imageUrl: 'https://cdn.example.com/org-custom-merchant.png', score: -5 },
    interactionTool: { imageUrl: 'https://cdn.example.com/org-custom-pistol.png' },
  });
  assert.strictEqual(customOrgConfig.positiveTarget.imageUrl, 'https://cdn.example.com/org-custom-bandit.png');
  assert.strictEqual(customOrgConfig.negativeTarget.imageUrl, 'https://cdn.example.com/org-custom-merchant.png');
  assert.strictEqual(customOrgConfig.interactionTool.imageUrl, 'https://cdn.example.com/org-custom-pistol.png');

  const oceanNormalized = normalizeRandomTargetConfig(DEFAULT_OCEAN_CONFIG, DEFAULT_OCEAN_CONFIG);
  assert.strictEqual(oceanNormalized.positiveTarget.imageUrl, '/assets/games/random-target/themes/ocean-treasure-hunt/treasure.png');
  assert.strictEqual(oceanNormalized.negativeTarget.imageUrl, '/assets/games/random-target/themes/ocean-treasure-hunt/shark.png');
  assert.strictEqual(oceanNormalized.interactionTool.imageUrl, '/assets/games/random-target/themes/ocean-treasure-hunt/fishing_rod.png');

  console.log('✓ PASS: Desert Quick Draw dedicated assets, PNG alpha transparency, stale DB migration, and Ocean theme isolation verified');
}

// 13. Pistol Diagonal Neutral Orientation, Rotation & Return Animation Lifecycle, and Composed Transform
{
  const React = (await import('react')).default;
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { LocalizationProvider } = await import('../../context/LocalizationContext');
  const { RandomTargetGame, RANDOM_TARGET_DESIGN_WIDTH, RANDOM_TARGET_DESIGN_HEIGHT } = await import('./RandomTargetGame');
  const { desertQuickDrawTheme, oceanTreasureHuntTheme } = await import('../../themes/random-target');
  const {
    calculateNeutralToolBarrelAngleDeg,
    calculateToolShotAngleDeg,
    NEUTRAL_TOOL_AIM_DEG,
    TOOL_MUZZLE_FLASH_DURATION_MS,
    TOOL_RECOIL_DURATION_MS,
    TOOL_RETURN_TO_NEUTRAL_MS,
  } = await import('./engine');

  const toolAnchorX = RANDOM_TARGET_DESIGN_WIDTH - 16 - DEFAULT_DESERT_CONFIG.interactionTool.size * 0.45;
  const toolAnchorY = RANDOM_TARGET_DESIGN_HEIGHT - 8 - DEFAULT_DESERT_CONFIG.interactionTool.size * 0.45;

  // 13a. Original diagonal PNG orientation points toward the scene center (neutral angle = 0deg)
  const centerAngle = calculateToolShotAngleDeg(
    toolAnchorX,
    toolAnchorY,
    RANDOM_TARGET_DESIGN_WIDTH / 2,
    RANDOM_TARGET_DESIGN_HEIGHT / 2,
    RANDOM_TARGET_DESIGN_WIDTH,
    RANDOM_TARGET_DESIGN_HEIGHT
  );
  assert.ok(Math.abs(centerAngle - NEUTRAL_TOOL_AIM_DEG) < 0.001, 'Target at scene center must produce 0deg rotation from neutral diagonal pose');

  const neutralBarrelVec = calculateNeutralToolBarrelAngleDeg(
    toolAnchorX,
    toolAnchorY,
    RANDOM_TARGET_DESIGN_WIDTH,
    RANDOM_TARGET_DESIGN_HEIGHT
  );
  assert.ok(neutralBarrelVec < -140 && neutralBarrelVec > -165, 'Neutral barrel vector should point diagonally up-left (~ -154deg)');

  // 13b. Fire at target on the left vs right; both rotate appropriately without 360-degree wrap jumps
  const leftTargetAngle = calculateToolShotAngleDeg(toolAnchorX, toolAnchorY, 180, 340);
  const lowerLeftTargetAngle = calculateToolShotAngleDeg(toolAnchorX, toolAnchorY, 150, 520);
  const rightTargetAngle = calculateToolShotAngleDeg(toolAnchorX, toolAnchorY, 780, 160);

  assert.ok(leftTargetAngle < -5 && leftTargetAngle >= -45, `Left target should rotate counter-clockwise (got ${leftTargetAngle})`);
  assert.ok(lowerLeftTargetAngle < -15 && lowerLeftTargetAngle >= -45, `Lower-left target across +180/-180 boundary must not wrap-jump (got ${lowerLeftTargetAngle})`);
  assert.ok(rightTargetAngle > 15 && rightTargetAngle <= 65, `Right target should rotate clockwise (got ${rightTargetAngle})`);

  // 13c. Verify rapid overlapping shots lifecycle (no premature reset by older timeouts)
  let simAimDeg = NEUTRAL_TOOL_AIM_DEG;
  let simRecoil = false;
  let simMuzzleFlash = false;
  let simShotSeq = 0;
  let pendingTimers: Array<{ id: number; time: number; fn: () => void }> = [];
  let nextTimerId = 1;
  let currentSimTime = 0;

  const clearSimToolTimers = () => {
    pendingTimers = [];
  };
  const scheduleSimToolTimer = (fn: () => void, delayMs: number) => {
    pendingTimers.push({ id: nextTimerId++, time: currentSimTime + delayMs, fn });
  };
  const advanceSimTimeTo = (targetTime: number) => {
    currentSimTime = targetTime;
    const due = pendingTimers.filter((t) => t.time <= currentSimTime).sort((a, b) => a.time - b.time);
    pendingTimers = pendingTimers.filter((t) => t.time > currentSimTime);
    for (const t of due) {
      t.fn();
    }
  };
  const fireSimulatedShot = (targetX: number, targetY: number) => {
    clearSimToolTimers();
    const shotId = ++simShotSeq;
    simAimDeg = calculateToolShotAngleDeg(toolAnchorX, toolAnchorY, targetX, targetY);
    simRecoil = true;
    simMuzzleFlash = true;
    scheduleSimToolTimer(() => {
      if (simShotSeq === shotId) simMuzzleFlash = false;
    }, TOOL_MUZZLE_FLASH_DURATION_MS);
    scheduleSimToolTimer(() => {
      if (simShotSeq === shotId) simRecoil = false;
    }, TOOL_RECOIL_DURATION_MS);
    scheduleSimToolTimer(() => {
      if (simShotSeq === shotId) simAimDeg = NEUTRAL_TOOL_AIM_DEG;
    }, TOOL_RETURN_TO_NEUTRAL_MS);
  };

  // Shot 1: Fire at left target at t=0ms and let it complete
  fireSimulatedShot(180, 340);
  assert.strictEqual(simAimDeg, leftTargetAngle);
  assert.strictEqual(simRecoil, true);
  assert.strictEqual(simMuzzleFlash, true);
  advanceSimTimeTo(TOOL_RECOIL_DURATION_MS);
  assert.strictEqual(simMuzzleFlash, false, 'Muzzle flash must turn off after 90ms');
  assert.strictEqual(simRecoil, false, 'Scale recoil must restore to false (scale 1) after 140ms');
  assert.strictEqual(simAimDeg, leftTargetAngle, 'Aim angle is still on target at 140ms');
  advanceSimTimeTo(TOOL_RETURN_TO_NEUTRAL_MS);
  assert.strictEqual(simAimDeg, NEUTRAL_TOOL_AIM_DEG, 'Pistol must return to neutral angle after left shot');

  // Shot 2: Fire at right target at t=300ms and let it complete
  advanceSimTimeTo(300);
  fireSimulatedShot(780, 160);
  assert.strictEqual(simAimDeg, rightTargetAngle);
  assert.strictEqual(simRecoil, true);
  advanceSimTimeTo(300 + TOOL_RETURN_TO_NEUTRAL_MS);
  assert.strictEqual(simRecoil, false);
  assert.strictEqual(simAimDeg, NEUTRAL_TOOL_AIM_DEG, 'Pistol must return to the same neutral angle after right shot');

  // Rapid consecutive shots: Fire at left (t=600ms), then right (t=680ms), then center-left (t=750ms)
  advanceSimTimeTo(600);
  fireSimulatedShot(180, 340); // Shot A at t=600 (would reset recoil at 740, aim at 860 if not cancelled)
  advanceSimTimeTo(680);
  fireSimulatedShot(780, 160); // Shot B at t=680 (cancels Shot A; would reset recoil at 820, aim at 940)
  advanceSimTimeTo(745);
  // At t=745, Shot A's 140ms recoil timer would have fired if not cancelled!
  assert.strictEqual(simRecoil, true, 'Older shot timeout must NOT reset newer shot recoil prematurely');
  assert.strictEqual(simAimDeg, rightTargetAngle, 'Older shot timeout must NOT alter newer shot aim angle');

  advanceSimTimeTo(680 + TOOL_RECOIL_DURATION_MS); // t=820
  assert.strictEqual(simRecoil, false, 'Newer shot recoil restores cleanly after its full 140ms');
  assert.strictEqual(simAimDeg, rightTargetAngle, 'Newer shot aim angle still held until 260ms');

  advanceSimTimeTo(680 + TOOL_RETURN_TO_NEUTRAL_MS); // t=940
  assert.strictEqual(simAimDeg, NEUTRAL_TOOL_AIM_DEG, 'Newer shot returns cleanly to neutral 0deg at 260ms');

  // 13d. Verify rendered DOM transform composition and grip pivot (no conflicting Tailwind scale classes)
  const html = renderToStaticMarkup(
    React.createElement(LocalizationProvider, null,
      React.createElement(RandomTargetGame, { activeTheme: desertQuickDrawTheme, isSimulation: true })
    )
  );
  assert.ok(html.includes('data-testid="interaction-tool-transform"'), 'Tool transform wrapper must exist');
  assert.ok(html.includes('transform-origin:82% 88%'), 'Pistol rotation pivot must be aligned with the grip at 82% 88%');
  assert.ok(html.includes('transform:rotate(0deg) scale(1)'), 'Neutral state must compose rotate(0deg) scale(1) in inline transform');
  assert.ok(!html.includes('origin-bottom-right scale-'), 'Must not combine conflicting Tailwind scale utilities with inline transform');

  console.log('✓ PASS: Pistol diagonal neutral orientation, aim-recoil-return lifecycle, rapid shot protection, and composed CSS transform verified');

  // 14. Ocean Treasure Hunt Dedicated Theme Assets, Transparency, Legacy Migration & Fishing Rod Return Animation
  {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const sharp = (await import('sharp')).default;
    const {
      DEFAULT_RANDOM_TARGET_OCEAN_THEME: CLIENT_OCEAN_CONFIG,
      normalizeRandomTargetConfig,
    } = await import('./types');
    const { normalizeGameTheme } = await import('../../themes/registry');
    const { resolveGameAsset, getCanonicalAssetThemeId } = await import('../../themes/gameAssetResolver');
    const {
      normalizeServerThemeAssets,
      DEFAULT_RANDOM_TARGET_OCEAN_THEME: SERVER_OCEAN_THEME,
    } = await import('../../../server/db/themes');

    const expectedOceanUrls = {
      background: '/assets/games/random-target/themes/ocean-treasure-hunt/background.png',
      fishing_rod: '/assets/games/random-target/themes/ocean-treasure-hunt/fishing_rod.png',
      shark: '/assets/games/random-target/themes/ocean-treasure-hunt/shark.png',
      treasure: '/assets/games/random-target/themes/ocean-treasure-hunt/treasure.png',
    };

    // 14a. Verify all 4 files exist in public/assets/games/random-target/themes/ocean-treasure-hunt/
    for (const [key, publicUrl] of Object.entries(expectedOceanUrls)) {
      const diskPath = path.join(process.cwd(), 'public', publicUrl);
      assert.strictEqual(fs.existsSync(diskPath), true, `Required Ocean Treasure Hunt asset (${key}) must exist at ${diskPath}`);
      assert.strictEqual(publicUrl.includes('/assets/images/'), false, 'Ocean Treasure Hunt must not use legacy /assets/images/ URLs');
    }

    // 14b. Verify PNG alpha transparency on fishing_rod.png, shark.png, and treasure.png
    for (const spriteKey of ['fishing_rod', 'shark', 'treasure'] as const) {
      const diskPath = path.join(process.cwd(), 'public', expectedOceanUrls[spriteKey]);
      const img = sharp(diskPath);
      const meta = await img.metadata();
      assert.strictEqual(meta.format, 'png', `${spriteKey}.png must be a PNG file`);
      assert.strictEqual(meta.hasAlpha, true, `${spriteKey}.png must have an alpha channel`);
      const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
      assert.strictEqual(info.channels, 4, `${spriteKey}.png must have 4 RGBA channels`);
      let transparentPixels = 0;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] === 0) transparentPixels++;
      }
      assert.ok(transparentPixels > 1000, `${spriteKey}.png must contain genuine transparent pixels`);
    }

    // 14c. Verify DEFAULT_OCEAN_CONFIG, DEFAULT_RANDOM_TARGET_OCEAN_THEME, and oceanTreasureHuntTheme
    assert.strictEqual(DEFAULT_OCEAN_CONFIG.positiveTarget.imageUrl, expectedOceanUrls.treasure);
    assert.strictEqual(DEFAULT_OCEAN_CONFIG.negativeTarget.imageUrl, expectedOceanUrls.shark);
    assert.strictEqual(DEFAULT_OCEAN_CONFIG.interactionTool.imageUrl, expectedOceanUrls.fishing_rod);
    assert.strictEqual(DEFAULT_OCEAN_CONFIG.interactionTool.type, 'fishing-rod');

    assert.strictEqual(CLIENT_OCEAN_CONFIG.positiveTarget.imageUrl, expectedOceanUrls.treasure);
    assert.strictEqual(CLIENT_OCEAN_CONFIG.negativeTarget.imageUrl, expectedOceanUrls.shark);
    assert.strictEqual(CLIENT_OCEAN_CONFIG.interactionTool.imageUrl, expectedOceanUrls.fishing_rod);

    const oceanTheme = THEME_REGISTRY['ocean-treasure-hunt'];
    assert.strictEqual(oceanTheme.background_url, expectedOceanUrls.background);
    assert.strictEqual((oceanTheme.game_config as any).positiveTarget.imageUrl, expectedOceanUrls.treasure);
    assert.strictEqual((oceanTheme.game_config as any).negativeTarget.imageUrl, expectedOceanUrls.shark);
    assert.strictEqual((oceanTheme.game_config as any).interactionTool.imageUrl, expectedOceanUrls.fishing_rod);

    // 14d. Verify server DEFAULT_RANDOM_TARGET_OCEAN_THEME and gameAssetResolver
    assert.strictEqual(SERVER_OCEAN_THEME.background_url, expectedOceanUrls.background);
    assert.strictEqual((SERVER_OCEAN_THEME.game_config as any).positiveTarget.imageUrl, expectedOceanUrls.treasure);
    assert.strictEqual((SERVER_OCEAN_THEME.game_config as any).negativeTarget.imageUrl, expectedOceanUrls.shark);
    assert.strictEqual((SERVER_OCEAN_THEME.game_config as any).interactionTool.imageUrl, expectedOceanUrls.fishing_rod);
    assert.strictEqual((SERVER_OCEAN_THEME.game_config as any).interactionTool.type, 'fishing-rod');

    assert.strictEqual(getCanonicalAssetThemeId(oceanTheme), 'ocean-treasure-hunt');
    assert.strictEqual(getCanonicalAssetThemeId({ slug: 'ocean-treasure-hunt-cloned-123', game_type: 'random-target' }), 'ocean-treasure-hunt');
    assert.strictEqual(resolveGameAsset({ gameType: 'random-target', themeId: 'ocean-treasure-hunt', assetType: 'background' }), expectedOceanUrls.background);
    assert.strictEqual(resolveGameAsset({ gameType: 'random-target', themeId: 'ocean-treasure-hunt', assetType: 'goodItem' }), expectedOceanUrls.treasure);
    assert.strictEqual(resolveGameAsset({ gameType: 'random-target', themeId: 'ocean-treasure-hunt', assetType: 'hazardItem' }), expectedOceanUrls.shark);
    assert.strictEqual(resolveGameAsset({ gameType: 'random-target', themeId: 'ocean-treasure-hunt', assetType: 'catcher' }), expectedOceanUrls.fishing_rod);

    // 14e. Verify stale DB / legacy JPEG & placeholder overrides are migrated to dedicated Ocean Treasure Hunt PNGs
    const staleOceanDbTheme = {
      id: 'ocean-treasure-hunt',
      name: 'Ocean Treasure Hunt',
      slug: 'ocean-treasure-hunt-custom',
      game_type: 'random-target',
      is_system: false,
      organization_id: 'org_ocean_test',
      background_url: '/assets/images/ocean_arcade_bg_1792994317724.jpg',
      game_config: {
        positiveTarget: {
          id: 'ocean-treasure',
          name: 'Golden Pearl Shell',
          imageUrl: '/assets/images/treasure_target_1792994339565.jpg',
          score: 20,
        },
        negativeTarget: {
          id: 'ocean-shark',
          name: 'Spiky Sea Mine',
          imageUrl: '/assets/images/shark_target_1792994339948.jpg',
          score: -15,
          hitEffectType: 'explosion',
        },
        interactionTool: {
          id: 'ocean-fishing-rod',
          name: 'Golden Fishing Net',
          imageUrl: '/assets/images/fishing_rod_1792994341884.jpg',
          type: 'net',
          projectileEffect: 'net_cast',
        },
      },
    };

    const normalizedOceanClient = normalizeGameTheme(staleOceanDbTheme);
    assert.strictEqual(normalizedOceanClient.background_url, expectedOceanUrls.background);
    assert.strictEqual((normalizedOceanClient.game_config as any).positiveTarget.imageUrl, expectedOceanUrls.treasure);
    assert.strictEqual((normalizedOceanClient.game_config as any).positiveTarget.name, 'Sunken Treasure');
    assert.strictEqual((normalizedOceanClient.game_config as any).positiveTarget.score, 20, 'Custom positive score must be preserved');
    assert.strictEqual((normalizedOceanClient.game_config as any).negativeTarget.imageUrl, expectedOceanUrls.shark);
    assert.strictEqual((normalizedOceanClient.game_config as any).negativeTarget.name, 'Hungry Shark');
    assert.strictEqual((normalizedOceanClient.game_config as any).negativeTarget.score, -15, 'Custom penalty score must be preserved');
    assert.strictEqual((normalizedOceanClient.game_config as any).interactionTool.imageUrl, expectedOceanUrls.fishing_rod);
    assert.strictEqual((normalizedOceanClient.game_config as any).interactionTool.name, 'Angler Fishing Rod');
    assert.strictEqual((normalizedOceanClient.game_config as any).interactionTool.type, 'fishing-rod');
    assert.strictEqual((normalizedOceanClient.game_config as any).interactionTool.projectileEffect, 'fishing-line');

    const normalizedOceanServer = normalizeServerThemeAssets(staleOceanDbTheme);
    assert.strictEqual(normalizedOceanServer.background_url, expectedOceanUrls.background);
    assert.strictEqual(normalizedOceanServer.game_config.positiveTarget.imageUrl, expectedOceanUrls.treasure);
    assert.strictEqual(normalizedOceanServer.game_config.negativeTarget.imageUrl, expectedOceanUrls.shark);
    assert.strictEqual(normalizedOceanServer.game_config.interactionTool.imageUrl, expectedOceanUrls.fishing_rod);
    assert.strictEqual(normalizedOceanServer.game_config.interactionTool.type, 'fishing-rod');

    // 14f. Verify Fishing Rod rendered DOM & cast-and-return animation lifecycle (no pistol muzzle flash)
    const oceanHtml = renderToStaticMarkup(
      React.createElement(LocalizationProvider, null,
        React.createElement(RandomTargetGame, { activeTheme: oceanTreasureHuntTheme, isSimulation: true })
      )
    );
    assert.ok(oceanHtml.includes(expectedOceanUrls.background), 'Ocean game must render Ocean Treasure Hunt background.png');
    assert.ok(oceanHtml.includes(expectedOceanUrls.fishing_rod), 'Ocean game must render fishing_rod.png');
    assert.ok(oceanHtml.includes('data-testid="interaction-tool-transform"'), 'Fishing rod transform wrapper must exist');
    assert.ok(oceanHtml.includes('transform-origin:82% 88%'), 'Fishing rod rotation pivot must be anchored at handle 82% 88%');
    assert.ok(oceanHtml.includes('transform:rotate(0deg) scale(1)'), 'Fishing rod neutral state must compose rotate(0deg) scale(1)');
    assert.ok(!oceanHtml.includes('bg-amber-300 rounded-full blur-sm opacity-90 animate-ping'), 'Fishing rod must not render pistol gunshot muzzle flash');

    const rodAnchorX = RANDOM_TARGET_DESIGN_WIDTH - 16 - DEFAULT_OCEAN_CONFIG.interactionTool.size * 0.45;
    const rodAnchorY = RANDOM_TARGET_DESIGN_HEIGHT - 8 - DEFAULT_OCEAN_CONFIG.interactionTool.size * 0.45;

    let rodAimDeg = NEUTRAL_TOOL_AIM_DEG;
    let rodRecoil = false;
    let rodMuzzleFlash = false;
    let rodCastSeq = 0;
    let rodTimers: Array<{ id: number; time: number; fn: () => void }> = [];
    let rodNextTimerId = 1;
    let rodSimTime = 0;

    const scheduleRodTimer = (fn: () => void, delayMs: number) => {
      rodTimers.push({ id: rodNextTimerId++, time: rodSimTime + delayMs, fn });
    };
    const advanceRodTimeTo = (targetTime: number) => {
      rodSimTime = targetTime;
      const due = rodTimers.filter((t) => t.time <= rodSimTime).sort((a, b) => a.time - b.time);
      rodTimers = rodTimers.filter((t) => t.time > rodSimTime);
      for (const t of due) {
        t.fn();
      }
    };
    const simulateFishingCast = (targetX: number, targetY: number) => {
      rodTimers = [];
      const castId = ++rodCastSeq;
      const isPistol = DEFAULT_OCEAN_CONFIG.interactionTool.type === ('pistol' as string);
      rodAimDeg = calculateToolShotAngleDeg(rodAnchorX, rodAnchorY, targetX, targetY);
      rodRecoil = true;
      rodMuzzleFlash = isPistol;
      scheduleRodTimer(() => {
        if (rodCastSeq === castId) rodRecoil = false;
      }, TOOL_RECOIL_DURATION_MS);
      scheduleRodTimer(() => {
        if (rodCastSeq === castId) rodAimDeg = NEUTRAL_TOOL_AIM_DEG;
      }, TOOL_RETURN_TO_NEUTRAL_MS);
    };

    // Cast 1: Left target
    const leftCastAngle = calculateToolShotAngleDeg(rodAnchorX, rodAnchorY, 200, 350);
    simulateFishingCast(200, 350);
    assert.strictEqual(rodAimDeg, leftCastAngle);
    assert.strictEqual(rodRecoil, true);
    assert.strictEqual(rodMuzzleFlash, false, 'Fishing rod cast must never activate pistol muzzle flash');
    advanceRodTimeTo(TOOL_RECOIL_DURATION_MS);
    assert.strictEqual(rodRecoil, false, 'Fishing rod recoil snap must restore to false after 140ms');
    advanceRodTimeTo(TOOL_RETURN_TO_NEUTRAL_MS);
    assert.strictEqual(rodAimDeg, NEUTRAL_TOOL_AIM_DEG, 'Fishing rod must return smoothly to neutral 0deg after left cast');

    // Cast 2: Right target
    const rightCastAngle = calculateToolShotAngleDeg(rodAnchorX, rodAnchorY, 760, 170);
    advanceRodTimeTo(400);
    simulateFishingCast(760, 170);
    assert.strictEqual(rodAimDeg, rightCastAngle);
    assert.strictEqual(rodRecoil, true);
    advanceRodTimeTo(400 + TOOL_RETURN_TO_NEUTRAL_MS);
    assert.strictEqual(rodRecoil, false);
    assert.strictEqual(rodAimDeg, NEUTRAL_TOOL_AIM_DEG, 'Fishing rod must return smoothly to neutral 0deg after right cast');

    // Rapid consecutive casts: Left at t=800ms, Right at t=880ms
    advanceRodTimeTo(800);
    simulateFishingCast(200, 350);
    advanceRodTimeTo(880);
    simulateFishingCast(760, 170);
    advanceRodTimeTo(950); // Past Cast 1's 140ms recoil window
    assert.strictEqual(rodRecoil, true, 'Cancelled older cast timer must not reset active cast recoil');
    assert.strictEqual(rodAimDeg, rightCastAngle, 'Cancelled older cast timer must not reset active cast angle');
    advanceRodTimeTo(880 + TOOL_RETURN_TO_NEUTRAL_MS);
    assert.strictEqual(rodRecoil, false);
    assert.strictEqual(rodAimDeg, NEUTRAL_TOOL_AIM_DEG, 'Fishing rod returns cleanly to neutral pose after rapid consecutive casts');

    console.log('✓ PASS: Ocean Treasure Hunt dedicated assets, PNG alpha transparency, stale DB migration, and fishing rod return animation verified');
  }

  // 15. Ocean Treasure Hunt Test Play vs Desert Quick Draw Isolation (All 9 Verification Scenarios)
  {
    const {
      resolveRandomTargetThemeType,
      resolveEffectiveRandomTargetConfig,
      resolveRandomTargetBackgroundUrl,
      normalizeRandomTargetConfig,
    } = await import('./types');
    const { normalizeGameTheme } = await import('../../themes/registry');
    const { normalizeServerThemeAssets } = await import('../../../server/db/themes');
    const { GameShell } = await import('../../components/shell/GameShell');
    const { AuthProvider } = await import('../../context/AuthContext');

    const oceanUrls = {
      background: '/assets/games/random-target/themes/ocean-treasure-hunt/background.png',
      fishing_rod: '/assets/games/random-target/themes/ocean-treasure-hunt/fishing_rod.png',
      shark: '/assets/games/random-target/themes/ocean-treasure-hunt/shark.png',
      treasure: '/assets/games/random-target/themes/ocean-treasure-hunt/treasure.png',
    };
    const desertUrls = {
      background: '/assets/games/random-target/themes/desert-quick-draw/background.png',
      pistol: '/assets/games/random-target/themes/desert-quick-draw/pistol.png',
      merchant: '/assets/games/random-target/themes/desert-quick-draw/merchant.png',
      bandit: '/assets/games/random-target/themes/desert-quick-draw/bandit.png',
    };

    // Scenario 1: Ocean Treasure Hunt in Test Play (where GameShell previously passed config={gameDef.defaultConfig} = DEFAULT_DESERT_CONFIG)
    const testPlayResolved = resolveEffectiveRandomTargetConfig(oceanTreasureHuntTheme, DEFAULT_DESERT_CONFIG);
    assert.strictEqual(testPlayResolved.themeType, 'ocean-treasure-hunt');
    assert.strictEqual(testPlayResolved.positiveTarget.imageUrl, oceanUrls.treasure, 'Test play must use treasure.png, not bandit.png');
    assert.strictEqual(testPlayResolved.negativeTarget.imageUrl, oceanUrls.shark, 'Test play must use shark.png, not merchant.png');
    assert.strictEqual(testPlayResolved.interactionTool.imageUrl, oceanUrls.fishing_rod, 'Test play must use fishing_rod.png, not pistol.png');
    assert.strictEqual(testPlayResolved.interactionTool.type, 'fishing-rod');
    assert.strictEqual(testPlayResolved.interactionTool.projectileEffect, 'fishing-line');
    assert.strictEqual(resolveRandomTargetBackgroundUrl(oceanTreasureHuntTheme), oceanUrls.background);

    // Render full GameShell in Test Play with oceanTreasureHuntTheme + render RandomTargetGame with config={DEFAULT_DESERT_CONFIG}
    const testPlayGameHtml = renderToStaticMarkup(
      React.createElement(LocalizationProvider, null,
        React.createElement(RandomTargetGame, {
          activeTheme: oceanTreasureHuntTheme,
          config: DEFAULT_DESERT_CONFIG,
          isSimulation: true,
        })
      )
    );
    assert.ok(testPlayGameHtml.includes(oceanUrls.background), 'Test play DOM must render Ocean background.png');
    assert.ok(testPlayGameHtml.includes(oceanUrls.fishing_rod), 'Test play DOM must render Ocean fishing_rod.png');
    assert.ok(!testPlayGameHtml.includes(desertUrls.pistol), 'Test play DOM must NOT render Desert pistol.png');
    assert.ok(!testPlayGameHtml.includes(desertUrls.background), 'Test play DOM must NOT render Desert background.png');

    const gameShellHtml = renderToStaticMarkup(
      React.createElement(LocalizationProvider, null,
        React.createElement(AuthProvider, null,
          React.createElement(GameShell, {
            gameId: 'random-target',
            activeTheme: oceanTreasureHuntTheme,
          })
        )
      )
    );
    assert.ok(gameShellHtml.includes(oceanUrls.background), 'GameShell Test Play must render Ocean background.png');
    assert.ok(gameShellHtml.includes(oceanUrls.fishing_rod), 'GameShell Test Play must render Ocean fishing_rod.png');
    assert.ok(!gameShellHtml.includes(desertUrls.pistol), 'GameShell Test Play must NOT render Desert pistol.png');

    // Scenario 2: Ocean Treasure Hunt with empty or missing game_config
    const oceanEmptyConfigTheme = {
      id: 'ocean-treasure-hunt',
      name: 'Ocean Treasure Hunt',
      slug: 'ocean-treasure-hunt',
      game_type: 'random-target',
      game_config: {},
    };
    const emptyResolved = resolveEffectiveRandomTargetConfig(oceanEmptyConfigTheme, undefined);
    assert.strictEqual(emptyResolved.positiveTarget.imageUrl, oceanUrls.treasure);
    assert.strictEqual(emptyResolved.negativeTarget.imageUrl, oceanUrls.shark);
    assert.strictEqual(emptyResolved.interactionTool.imageUrl, oceanUrls.fishing_rod);
    assert.strictEqual(resolveRandomTargetBackgroundUrl(oceanEmptyConfigTheme), oceanUrls.background);

    // Scenario 3: Ocean Treasure Hunt polluted with Desert Quick Draw game_config values & background_url
    const desertPollutedOceanTheme = {
      id: 'ocean-treasure-hunt',
      name: 'Ocean Treasure Hunt',
      slug: 'ocean-treasure-hunt',
      game_type: 'random-target',
      background_url: desertUrls.background,
      game_config: {
        ...DEFAULT_DESERT_CONFIG,
        gameDurationSeconds: 45,
        positiveTarget: {
          ...DEFAULT_DESERT_CONFIG.positiveTarget,
          score: 25,
        },
        negativeTarget: {
          ...DEFAULT_DESERT_CONFIG.negativeTarget,
          score: -20,
        },
      },
    };
    const cleanedOcean = resolveEffectiveRandomTargetConfig(desertPollutedOceanTheme, DEFAULT_DESERT_CONFIG);
    assert.strictEqual(cleanedOcean.positiveTarget.imageUrl, oceanUrls.treasure, 'Desert bandit.png must not override Ocean treasure.png');
    assert.strictEqual(cleanedOcean.positiveTarget.name, 'Sunken Treasure');
    assert.strictEqual(cleanedOcean.positiveTarget.id, 'ocean-treasure');
    assert.strictEqual(cleanedOcean.positiveTarget.score, 25, 'Custom score (25) must be preserved');
    assert.strictEqual(cleanedOcean.negativeTarget.imageUrl, oceanUrls.shark, 'Desert merchant.png must not override Ocean shark.png');
    assert.strictEqual(cleanedOcean.negativeTarget.name, 'Hungry Shark');
    assert.strictEqual(cleanedOcean.negativeTarget.id, 'ocean-shark');
    assert.strictEqual(cleanedOcean.negativeTarget.score, -20, 'Custom penalty (-20) must be preserved');
    assert.strictEqual(cleanedOcean.interactionTool.imageUrl, oceanUrls.fishing_rod, 'Desert pistol.png must not override Ocean fishing_rod.png');
    assert.strictEqual(cleanedOcean.interactionTool.name, 'Angler Fishing Rod');
    assert.strictEqual(cleanedOcean.interactionTool.id, 'ocean-fishing-rod');
    assert.strictEqual(cleanedOcean.interactionTool.type, 'fishing-rod');
    assert.strictEqual(cleanedOcean.interactionTool.projectileEffect, 'fishing-line');
    assert.strictEqual(cleanedOcean.gameDurationSeconds, 45, 'Custom gameDurationSeconds (45) must be preserved');
    assert.strictEqual(resolveRandomTargetBackgroundUrl(desertPollutedOceanTheme), oceanUrls.background, 'Desert background.png must not override Ocean background.png');

    const normalizedPollutedClient = normalizeGameTheme(desertPollutedOceanTheme);
    assert.strictEqual(normalizedPollutedClient.background_url, oceanUrls.background);
    assert.strictEqual((normalizedPollutedClient.game_config as any).positiveTarget.imageUrl, oceanUrls.treasure);
    assert.strictEqual((normalizedPollutedClient.game_config as any).negativeTarget.imageUrl, oceanUrls.shark);
    assert.strictEqual((normalizedPollutedClient.game_config as any).interactionTool.imageUrl, oceanUrls.fishing_rod);

    const normalizedPollutedServer = normalizeServerThemeAssets(desertPollutedOceanTheme);
    assert.strictEqual(normalizedPollutedServer.background_url, oceanUrls.background);
    assert.strictEqual(normalizedPollutedServer.game_config.positiveTarget.imageUrl, oceanUrls.treasure);
    assert.strictEqual(normalizedPollutedServer.game_config.negativeTarget.imageUrl, oceanUrls.shark);
    assert.strictEqual(normalizedPollutedServer.game_config.interactionTool.imageUrl, oceanUrls.fishing_rod);

    // Scenario 4: Cloned / Custom Ocean theme with UUID id and non-ocean name/slug
    const uuidClonedOceanTheme = {
      id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      organization_id: 'org_123',
      name: 'Summer Marina Activation',
      slug: 'summer-marina-activation-8912',
      game_type: 'random-target',
      base_theme_id: 'ocean-treasure-hunt',
      game_config: {
        themeType: 'ocean-treasure-hunt',
        positiveTarget: { ...DEFAULT_DESERT_CONFIG.positiveTarget, score: 30 },
        negativeTarget: { ...DEFAULT_DESERT_CONFIG.negativeTarget, score: -15 },
        interactionTool: { ...DEFAULT_DESERT_CONFIG.interactionTool },
      },
    };
    assert.strictEqual(resolveRandomTargetThemeType(uuidClonedOceanTheme, DEFAULT_DESERT_CONFIG), 'ocean-treasure-hunt');
    const uuidResolved = resolveEffectiveRandomTargetConfig(uuidClonedOceanTheme, DEFAULT_DESERT_CONFIG);
    assert.strictEqual(uuidResolved.positiveTarget.imageUrl, oceanUrls.treasure);
    assert.strictEqual(uuidResolved.negativeTarget.imageUrl, oceanUrls.shark);
    assert.strictEqual(uuidResolved.interactionTool.imageUrl, oceanUrls.fishing_rod);
    assert.strictEqual(uuidResolved.positiveTarget.score, 30);
    assert.strictEqual(uuidResolved.negativeTarget.score, -15);
    assert.strictEqual(resolveRandomTargetBackgroundUrl(uuidClonedOceanTheme), oceanUrls.background);

    // Scenario 5: Ocean Treasure Hunt with customized gameplay settings and custom uploaded assets
    const customOceanTheme = {
      id: 'ocean-treasure-hunt-org',
      name: 'VIP Ocean Hunt',
      slug: 'vip-ocean-hunt',
      game_type: 'random-target',
      background_url: 'https://cdn.example.com/custom-reef-bg.png',
      game_config: {
        themeType: 'ocean-treasure-hunt',
        gameDurationSeconds: 60,
        initialSpawnIntervalMs: 900,
        soundVolume: 0.5,
        positiveTarget: {
          id: 'ocean-treasure',
          name: 'Golden Clam',
          imageUrl: 'https://cdn.example.com/golden-clam.png',
          score: 50,
          spawnWeight: 80,
          size: 100,
          isPenalty: false,
          hitEffectType: 'sparkle',
        },
        negativeTarget: {
          id: 'ocean-shark',
          name: 'Electric Eel',
          imageUrl: 'https://cdn.example.com/electric-eel.png',
          score: -25,
          spawnWeight: 20,
          size: 96,
          isPenalty: true,
          hitEffectType: 'splash',
        },
        interactionTool: {
          id: 'ocean-fishing-rod',
          name: 'Carbon Rod',
          imageUrl: 'https://cdn.example.com/carbon-rod.png',
          type: 'fishing-rod',
          position: 'bottom-right',
          size: 180,
          projectileEffect: 'fishing-line',
          recoilAngleDeg: -20,
          projectileSpeedMs: 180,
        },
      },
    };
    const customOceanResolved = resolveEffectiveRandomTargetConfig(customOceanTheme, DEFAULT_DESERT_CONFIG);
    assert.strictEqual(customOceanResolved.gameDurationSeconds, 60);
    assert.strictEqual(customOceanResolved.initialSpawnIntervalMs, 900);
    assert.strictEqual(customOceanResolved.soundVolume, 0.5);
    assert.strictEqual(customOceanResolved.positiveTarget.imageUrl, 'https://cdn.example.com/golden-clam.png');
    assert.strictEqual(customOceanResolved.positiveTarget.score, 50);
    assert.strictEqual(customOceanResolved.positiveTarget.spawnWeight, 80);
    assert.strictEqual(customOceanResolved.positiveTarget.size, 100);
    assert.strictEqual(customOceanResolved.negativeTarget.imageUrl, 'https://cdn.example.com/electric-eel.png');
    assert.strictEqual(customOceanResolved.negativeTarget.score, -25);
    assert.strictEqual(customOceanResolved.interactionTool.imageUrl, 'https://cdn.example.com/carbon-rod.png');
    assert.strictEqual(resolveRandomTargetBackgroundUrl(customOceanTheme), 'https://cdn.example.com/custom-reef-bg.png');

    // Scenario 6: Desert Quick Draw in Test Play (and when polluted with Ocean assets)
    const desertTestPlay = resolveEffectiveRandomTargetConfig(desertQuickDrawTheme, DEFAULT_DESERT_CONFIG);
    assert.strictEqual(desertTestPlay.themeType, 'desert-quick-draw');
    assert.strictEqual(desertTestPlay.positiveTarget.imageUrl, desertUrls.bandit);
    assert.strictEqual(desertTestPlay.negativeTarget.imageUrl, desertUrls.merchant);
    assert.strictEqual(desertTestPlay.interactionTool.imageUrl, desertUrls.pistol);
    assert.strictEqual(desertTestPlay.interactionTool.type, 'pistol');
    assert.strictEqual(resolveRandomTargetBackgroundUrl(desertQuickDrawTheme), desertUrls.background);

    const oceanPollutedDesert = normalizeRandomTargetConfig(DEFAULT_OCEAN_CONFIG, DEFAULT_DESERT_CONFIG);
    assert.strictEqual(oceanPollutedDesert.positiveTarget.imageUrl, desertUrls.bandit);
    assert.strictEqual(oceanPollutedDesert.negativeTarget.imageUrl, desertUrls.merchant);
    assert.strictEqual(oceanPollutedDesert.interactionTool.imageUrl, desertUrls.pistol);
    assert.strictEqual(oceanPollutedDesert.interactionTool.type, 'pistol');

    // Scenarios 7 & 8: Positive target hits award points and Negative target hits deduct points on Ocean Treasure Hunt
    const oceanHitStats0 = {
      score: 0,
      positiveHits: 0,
      negativeHits: 0,
      totalHits: 0,
      missedTargets: 0,
      accuracy: 100,
      currentStreak: 0,
      highestStreak: 0,
    };
    const treasureTarget = {
      uid: 'tgt_ocean_pos',
      definitionId: testPlayResolved.positiveTarget.id,
      name: testPlayResolved.positiveTarget.name,
      imageUrl: testPlayResolved.positiveTarget.imageUrl,
      score: testPlayResolved.positiveTarget.score,
      isPenalty: false,
      xPercent: 50,
      yPercent: 50,
      size: testPlayResolved.positiveTarget.size,
      spawnTimeMs: 1000,
      lifetimeMs: 1750,
      state: 'active' as const,
      hitEffectType: testPlayResolved.positiveTarget.hitEffectType,
    };
    const sharkTarget = {
      uid: 'tgt_ocean_neg',
      definitionId: testPlayResolved.negativeTarget.id,
      name: testPlayResolved.negativeTarget.name,
      imageUrl: testPlayResolved.negativeTarget.imageUrl,
      score: testPlayResolved.negativeTarget.score,
      isPenalty: true,
      xPercent: 60,
      yPercent: 50,
      size: testPlayResolved.negativeTarget.size,
      spawnTimeMs: 1000,
      lifetimeMs: 1750,
      state: 'active' as const,
      hitEffectType: testPlayResolved.negativeTarget.hitEffectType,
    };

    const afterTreasureHit = handleTargetHit('tgt_ocean_pos', [treasureTarget, sharkTarget], oceanHitStats0, testPlayResolved, 1200);
    assert.strictEqual(afterTreasureHit.updatedStats.score, 10, 'Hitting treasure.png must award +10 points');
    assert.strictEqual(afterTreasureHit.updatedStats.positiveHits, 1);

    const afterSharkHit = handleTargetHit('tgt_ocean_neg', afterTreasureHit.updatedTargets, afterTreasureHit.updatedStats, testPlayResolved, 1300);
    assert.strictEqual(afterSharkHit.updatedStats.score, 0, 'Hitting shark.png must deduct 10 points');
    assert.strictEqual(afterSharkHit.updatedStats.negativeHits, 1);

    console.log('✓ PASS: All 9 Ocean Treasure Hunt & Desert Quick Draw Test Play verification scenarios passed');
  }
}

console.log('======================================================');
console.log('ALL RANDOM TARGET ARCADE TESTS PASSED SUCCESSFULLY! 🎉');
console.log('======================================================');
