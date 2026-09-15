import assert from 'node:assert';
import { submitEventScore, getEventHighScores, clearEventHighScores } from './highScores.js';
import { createOrganization } from './organizations.js';
import { createGame } from './games.js';
import { createTheme } from './themes.js';
import { createEvent } from './events.js';

async function runIdempotencyTests() {
  console.log('====================================================');
  console.log('TEST SUITE: IDEMPOTENCY & CONCURRENCY (Scenarios 13 & 14)');
  console.log('====================================================\n');

  const org = await createOrganization({
    name: 'Idempotency Org ' + Date.now(),
    owner_id: '4c857d15-ab93-45a6-8de5-7858ab4d6bd2',
  });

  const game = await createGame({
    organization_id: org.id,
    name: 'Idempotency Game',
    slug: 'idempotency-game-' + Date.now(),
    game_type: 'catch-brand',
  });

  const theme = await createTheme({
    organization_id: org.id,
    game_id: game.id,
    name: 'Idempotency Theme',
  });

  const event = await createEvent({
    organization_id: org.id,
    game_id: game.id,
    game_theme_id: theme.id,
    name: 'Idempotency Test Event ' + Date.now(),
    status: 'live',
    payment_status: 'PAID',
    event_status: 'LIVE',
    starts_at: new Date(Date.now() - 3600000).toISOString(),
    expires_at: new Date(Date.now() + 86400000).toISOString(),
  });

  // --------------------------------------------------------------------------
  // Scenario 13: Same event + sessionId submitted twice creates one score.
  // --------------------------------------------------------------------------
  console.log('Scenario 13: Same event + sessionId submitted twice creates one score...');
  const sessionIdSequential = 'session_seq_13_' + Date.now();

  const firstSubmission = await submitEventScore({
    event_id: event.id,
    player_name: 'PlayerSequential',
    score: 250,
    metadata: {
      sessionId: sessionIdSequential,
      greenCaught: 25,
    },
  });

  assert.strictEqual(firstSubmission.score.score, 250, 'Scenario 13: Initial score must be 250');
  assert.strictEqual(firstSubmission.rank, 1, 'Scenario 13: First score is rank 1');
  assert.strictEqual(firstSubmission.isNewHighScore, true, 'Scenario 13: isNewHighScore is true');
  const recordId = firstSubmission.score.id;

  // Second submission with identical event and sessionId
  const secondSubmission = await submitEventScore({
    event_id: event.id,
    player_name: 'PlayerSequential',
    score: 250,
    metadata: {
      sessionId: sessionIdSequential,
      greenCaught: 25,
    },
  });

  assert.strictEqual(
    secondSubmission.score.id,
    recordId,
    'Scenario 13: Second submission must return existing score record ID'
  );
  assert.strictEqual(
    secondSubmission.isNewHighScore,
    false,
    'Scenario 13: Duplicate submission is not a new high score'
  );

  const leaderboardAfterSeq = await getEventHighScores(event.id);
  assert.strictEqual(
    leaderboardAfterSeq.scores.length,
    1,
    'Scenario 13: Leaderboard must contain exactly 1 score row'
  );
  assert.strictEqual(
    leaderboardAfterSeq.totalCount,
    1,
    'Scenario 13: Total count must be 1'
  );
  console.log('  ✓ PASSED: Same event + sessionId submitted twice creates exactly one score record');

  // --------------------------------------------------------------------------
  // Scenario 14: Concurrent duplicate submissions are also safe.
  // --------------------------------------------------------------------------
  console.log('\nScenario 14: Concurrent duplicate submissions are also safe...');
  const sessionIdConcurrent = 'session_concurrent_14_' + Date.now();

  // Fire 5 concurrent submissions simultaneously with the exact same event_id and sessionId
  const concurrentSubmissions = await Promise.all([
    submitEventScore({
      event_id: event.id,
      player_name: 'ConcurrentRacer',
      score: 300,
      metadata: { sessionId: sessionIdConcurrent, greenCaught: 30 },
    }),
    submitEventScore({
      event_id: event.id,
      player_name: 'ConcurrentRacer',
      score: 300,
      metadata: { sessionId: sessionIdConcurrent, greenCaught: 30 },
    }),
    submitEventScore({
      event_id: event.id,
      player_name: 'ConcurrentRacer',
      score: 300,
      metadata: { sessionId: sessionIdConcurrent, greenCaught: 30 },
    }),
    submitEventScore({
      event_id: event.id,
      player_name: 'ConcurrentRacer',
      score: 300,
      metadata: { sessionId: sessionIdConcurrent, greenCaught: 30 },
    }),
    submitEventScore({
      event_id: event.id,
      player_name: 'ConcurrentRacer',
      score: 300,
      metadata: { sessionId: sessionIdConcurrent, greenCaught: 30 },
    }),
  ]);

  // All 5 promises resolved without error
  assert.strictEqual(concurrentSubmissions.length, 5, 'Scenario 14: All 5 concurrent submissions resolved');
  const canonicalId = concurrentSubmissions[0].score.id;

  for (let i = 1; i < concurrentSubmissions.length; i++) {
    assert.strictEqual(
      concurrentSubmissions[i].score.id,
      canonicalId,
      `Scenario 14: Submission ${i} returned different record ID`
    );
  }

  // Check the leaderboard: should have exactly 2 records in total (1 from Scenario 13, 1 from Scenario 14)
  const leaderboardAfterConcurrent = await getEventHighScores(event.id);
  assert.strictEqual(
    leaderboardAfterConcurrent.scores.length,
    2,
    'Scenario 14: Leaderboard must have exactly 2 scores total (1 from seq + 1 from concurrent)'
  );
  assert.strictEqual(
    leaderboardAfterConcurrent.totalCount,
    2,
    'Scenario 14: totalCount must be exactly 2'
  );
  console.log('  ✓ PASSED: 5 concurrent duplicate submissions safely deduplicated into exactly one score');

  // Clean up
  await clearEventHighScores(event.id);

  console.log('\n====================================================');
  console.log('🎉 ALL IDEMPOTENCY & CONCURRENCY SCENARIOS PASSED!');
  console.log('====================================================\n');
}

runIdempotencyTests().catch((err) => {
  console.error('❌ Test execution failed:', err);
  process.exit(1);
});
