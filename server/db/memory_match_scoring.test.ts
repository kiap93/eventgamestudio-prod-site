import {
  calculateMemoryMatchScore,
  validateMemoryMatchResult,
  MEMORY_MATCH_GAME_VERSION,
  MEMORY_MATCH_SCORING_VERSION,
} from '../games/memoryMatchScoring.js';
import { submitEventScore, getEventHighScores, getEventScoreStats, clearEventHighScores } from './highScores.js';
import { createOrganization } from './organizations.js';
import { createGame, ensureDefaultGame } from './games.js';
import { createTheme } from './themes.js';
import { createEvent } from './events.js';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ Assertion Failed: ${message}`);
    process.exit(1);
  }
}

async function runTests() {
  console.log('🧪 Starting Memory Match Scoring & Result Tests...\n');

  // ----------------------------------------------------
  // Test 1: Deterministic Output
  // ----------------------------------------------------
  console.log('Test 1: Verifying deterministic score calculation...');
  const input1 = { moves: 14, duration: 25, matchedPairs: 8, totalPairs: 8 };
  const scoreA = calculateMemoryMatchScore(input1);
  const scoreB = calculateMemoryMatchScore(input1);
  assert(scoreA === scoreB, `Expected deterministic scores to match, got ${scoreA} and ${scoreB}`);
  assert(scoreA > 0, `Expected score to be positive, got ${scoreA}`);
  console.log(`✅ Deterministic test passed: Score = ${scoreA}`);

  // ----------------------------------------------------
  // Test 2: Monotonicity on Moves (Fewer moves -> Higher score)
  // ----------------------------------------------------
  console.log('Test 2: Verifying move efficiency monotonicity...');
  const scoreFewerMoves = calculateMemoryMatchScore({ moves: 10, duration: 30, matchedPairs: 8 });
  const scoreMoreMoves = calculateMemoryMatchScore({ moves: 22, duration: 30, matchedPairs: 8 });
  assert(
    scoreFewerMoves > scoreMoreMoves,
    `Fewer moves (${scoreFewerMoves}) should yield higher score than more moves (${scoreMoreMoves})`
  );
  console.log(`✅ Move monotonicity passed (${scoreFewerMoves} > ${scoreMoreMoves})`);

  // ----------------------------------------------------
  // Test 3: Monotonicity on Duration (Faster completion -> Higher score)
  // ----------------------------------------------------
  console.log('Test 3: Verifying duration speed bonus monotonicity...');
  const scoreFast = calculateMemoryMatchScore({ moves: 16, duration: 15, matchedPairs: 8 });
  const scoreSlow = calculateMemoryMatchScore({ moves: 16, duration: 45, matchedPairs: 8 });
  assert(
    scoreFast > scoreSlow,
    `Faster game (${scoreFast}) should yield higher score than slower game (${scoreSlow})`
  );
  console.log(`✅ Duration monotonicity passed (${scoreFast} > ${scoreSlow})`);

  // ----------------------------------------------------
  // Test 4: Zero Matched Pairs
  // ----------------------------------------------------
  console.log('Test 4: Verifying zero matches calculation...');
  const zeroScore = calculateMemoryMatchScore({ moves: 5, duration: 20, matchedPairs: 0 });
  assert(zeroScore === 0, `Expected 0 matched pairs to score 0, got ${zeroScore}`);
  console.log('✅ Zero matches test passed');

  // ----------------------------------------------------
  // Test 5: Result Validation Rules
  // ----------------------------------------------------
  console.log('Test 5: Verifying result validation engine...');
  
  // Valid result
  const validRes = validateMemoryMatchResult({ moves: 12, duration: 20, matchedPairs: 8, totalPairs: 8 });
  assert(validRes.isValid === true, 'Expected valid parameters to pass');

  // Impossible moves (fewer moves than matched pairs)
  const impossibleMoves = validateMemoryMatchResult({ moves: 4, duration: 20, matchedPairs: 8, totalPairs: 8 });
  assert(impossibleMoves.isValid === false, 'Expected impossible move count to fail validation');

  // Impossible duration (0 seconds for 8 pairs)
  const impossibleDuration = validateMemoryMatchResult({ moves: 10, duration: 0, matchedPairs: 8, totalPairs: 8 });
  assert(impossibleDuration.isValid === false, 'Expected impossible 0s duration to fail validation');

  // Invalid matchedPairs (> totalPairs)
  const invalidPairs = validateMemoryMatchResult({ moves: 10, duration: 15, matchedPairs: 12, totalPairs: 8 });
  assert(invalidPairs.isValid === false, 'Expected matchedPairs > totalPairs to fail validation');

  console.log('✅ Result validation tests passed');

  // ----------------------------------------------------
  // Create Test Event Fixture
  // ----------------------------------------------------
  const org = await createOrganization({
    name: 'MM Test Org ' + Date.now(),
    owner_id: '4c857d15-ab93-45a6-8de5-7858ab4d6bd2',
  });
  const game = await createGame({
    organization_id: org.id,
    name: 'Memory Match Championship Game',
    slug: 'mm-champ-' + Date.now(),
    game_type: 'memory-match',
  });
  const theme = await createTheme({
    organization_id: org.id,
    game_id: game.id,
    name: 'Memory Festival',
  });
  const testEvent = await createEvent({
    organization_id: org.id,
    game_id: game.id,
    game_theme_id: theme.id,
    name: 'Memory Match Championship ' + Date.now(),
    starts_at: new Date(Date.now() - 3600000).toISOString(),
    expires_at: new Date(Date.now() + 86400000).toISOString(),
    status: 'active',
    payment_status: 'PAID',
    event_status: 'LIVE',
  });

  const testEventId = testEvent.id;
  const sessionId = 'session_test_xyz_123';

  // ----------------------------------------------------
  // Test 5.5: Preview & Unplayable Event Score Rejection
  // ----------------------------------------------------
  console.log('Test 5.5: Verifying preview test scores and unplayable events are rejected...');

  // Test preview flag rejection
  let previewRejected = false;
  try {
    await submitEventScore({
      event_id: testEventId,
      player_name: 'PreviewTester',
      score: 5000,
      metadata: {
        gameType: 'memory-match',
        isEventPreview: true,
      },
    });
  } catch (err: any) {
    previewRejected = true;
    assert(err.status === 403, 'Expected 403 status for preview score submission');
  }
  assert(previewRejected, 'Expected isEventPreview=true to be rejected from submitting to leaderboard');
  console.log('✅ Preview test score rejection passed');

  // Test unpaid event rejection
  const unpaidEvent = await createEvent({
    organization_id: org.id,
    game_id: game.id,
    game_theme_id: theme.id,
    name: 'Unpaid Championship',
    starts_at: new Date(Date.now() - 3600000).toISOString(),
    expires_at: new Date(Date.now() + 86400000).toISOString(),
    status: 'draft',
    payment_status: 'UNPAID',
    event_status: 'DRAFT',
  });

  let unpaidRejected = false;
  try {
    await submitEventScore({
      event_id: unpaidEvent.id,
      player_name: 'UnpaidPlayer',
      score: 5000,
      metadata: {
        gameType: 'memory-match',
      },
    });
  } catch (err: any) {
    unpaidRejected = true;
    assert(err.status === 403, 'Expected 403 status for unpaid event score submission');
  }
  assert(unpaidRejected, 'Expected unpaid event to be rejected from submitting score');
  console.log('✅ Unpaid event score rejection passed');

  // ----------------------------------------------------
  // Test 6: Submit Score & Idempotency
  // ----------------------------------------------------
  console.log('Test 6: Verifying score submission and session idempotency...');

  // Clear any existing test event scores
  await clearEventHighScores(testEventId);

  const score1 = calculateMemoryMatchScore({
    moves: 14,
    duration: 25,
    matchedPairs: 8,
    totalPairs: 8,
  });

  const sub1 = await submitEventScore({
    event_id: testEventId,
    player_name: 'Alice',
    score: score1,
    metadata: {
      gameType: 'memory-match',
      moves: 14,
      duration: 25,
      matchedPairs: 8,
      totalPairs: 8,
      sessionId,
      isVictory: true,
    },
  });

  assert(sub1.score.player_name === 'Alice', 'Expected player Alice');
  assert(sub1.rank === 1, 'Expected rank 1');

  // Submit same session again (duplicate network call or retry)
  const sub2 = await submitEventScore({
    event_id: testEventId,
    player_name: 'Alice Duplicate',
    score: score1,
    metadata: {
      gameType: 'memory-match',
      moves: 14,
      duration: 25,
      matchedPairs: 8,
      totalPairs: 8,
      sessionId,
      isVictory: true,
    },
  });

  assert(sub2.score.id === sub1.score.id, 'Expected duplicate session to return identical record idempotently');
  assert(sub2.totalEntries === 1, `Expected total entries to remain 1, got ${sub2.totalEntries}`);
  console.log('✅ Session idempotency test passed');

  // Submit fresh replay session (Play Again)
  const score3 = calculateMemoryMatchScore({
    moves: 10,
    duration: 15,
    matchedPairs: 8,
    totalPairs: 8,
  });

  const sub3 = await submitEventScore({
    event_id: testEventId,
    player_name: 'Bob',
    score: score3,
    metadata: {
      gameType: 'memory-match',
      moves: 10,
      duration: 15,
      matchedPairs: 8,
      totalPairs: 8,
      sessionId: 'session_bob_play2',
      isVictory: true,
    },
  });

  assert(sub3.totalEntries === 2, `Expected total entries to be 2, got ${sub3.totalEntries}`);
  assert(sub3.rank === 1, 'Expected Bob to be rank 1 with higher score');
  console.log('✅ Replay session submission passed');

  // ----------------------------------------------------
  // Test 7: Analytics & Stats Aggregation
  // ----------------------------------------------------
  console.log('Test 7: Verifying analytics aggregation...');
  const stats = await getEventScoreStats(testEventId);

  assert(stats.totalEntries === 2, `Expected 2 entries, got ${stats.totalEntries}`);
  assert(stats.uniquePlayers === 2, `Expected 2 unique players, got ${stats.uniquePlayers}`);
  assert(stats.highScore === Math.max(sub1.score.score, sub3.score.score), 'Expected highest score');
  assert(stats.completionRate === 100, `Expected 100% completion rate, got ${stats.completionRate}`);
  assert(typeof stats.averageMoves === 'number', 'Expected average moves');
  assert(typeof stats.averageDuration === 'number', 'Expected average duration');
  assert(Boolean(stats.gameTypeBreakdown?.['memory-match']), 'Expected memory-match gameType breakdown');

  console.log('✅ Analytics test passed:', {
    totalEntries: stats.totalEntries,
    uniquePlayers: stats.uniquePlayers,
    highScore: stats.highScore,
    averageScore: stats.averageScore,
    completionRate: stats.completionRate,
    averageMoves: stats.averageMoves,
    averageDuration: stats.averageDuration,
  });

  // Cleanup
  await clearEventHighScores(testEventId);

  console.log('\n🎉 ALL Phase 4 Memory Match Result, Score & Analytics tests passed successfully!');
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
