import assert from 'node:assert';
import {
  determineScoreEnvironment,
  submitEventScore,
  getEventHighScores,
  clearEventHighScores,
  isEventTestScoresCleared,
  ensureTestScoresClearedForLiveEvent,
} from './highScores.js';
import { createOrganization } from './organizations.js';
import { createGame } from './games.js';
import { createTheme } from './themes.js';
import { createEvent, localEventsCache } from './events.js';

async function runEventTestScoreFlowTests() {
  console.log('====================================================');
  console.log('TEST SUITE: EVENT TEST SCORE FLOW (Scenarios 1 - 7)');
  console.log('====================================================\n');

  const org = await createOrganization({
    name: 'Event Flow Test Org ' + Date.now(),
    owner_id: '4c857d15-ab93-45a6-8de5-7858ab4d6bd2',
  });

  const game = await createGame({
    organization_id: org.id,
    name: 'Arcade Challenge',
    slug: 'arcade-flow-' + Date.now(),
    game_type: 'catch-brand',
  });

  const theme = await createTheme({
    organization_id: org.id,
    game_id: game.id,
    name: 'Arcade Theme',
  });

  const now = new Date();
  const tomorrowStr = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const dayAfterStr = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString().split('T')[0];
  const todayStr = now.toISOString().split('T')[0];
  const yesterdayStr = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const twoDaysAgoStr = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString().split('T')[0];

  // --------------------------------------------------------------------------
  // Scenario 1: Event before start date: TEST score is accepted.
  // --------------------------------------------------------------------------
  console.log('Scenario 1: Event before start date: TEST score is accepted...');
  const scheduledEvent = await createEvent({
    organization_id: org.id,
    game_id: game.id,
    game_theme_id: theme.id,
    name: 'Scheduled Future Event ' + Date.now(),
    start_date: tomorrowStr,
    end_date: dayAfterStr,
    starts_at: `${tomorrowStr}T00:00:00.000Z`,
    expires_at: `${dayAfterStr}T23:59:59.999Z`,
    status: 'scheduled',
    payment_status: 'UNPAID',
    event_status: 'SCHEDULED',
  });

  const testScore1 = await submitEventScore({
    event_id: scheduledEvent.id,
    player_name: 'PreEventTester1',
    score: 850,
    metadata: {
      sessionId: 'test_session_1',
      isEventTest: true,
    },
  });

  assert.strictEqual(testScore1.score_environment, 'test', 'Scenario 1: Score environment must be "test"');
  assert.strictEqual(testScore1.mode, 'TEST', 'Scenario 1: Score mode must be "TEST"');
  assert.strictEqual(testScore1.is_test, true, 'Scenario 1: is_test must be true');
  assert.strictEqual(testScore1.score.player_name, 'PreEventTester1');
  assert.strictEqual(testScore1.score.score, 850);
  console.log('  ✓ PASSED: TEST score accepted before start date with environment="test" and mode="TEST"');

  // --------------------------------------------------------------------------
  // Scenario 2: Event before start date: LIVE score is not accepted as official live score.
  // --------------------------------------------------------------------------
  console.log('\nScenario 2: Event before start date: LIVE score is not accepted as official live score...');
  // Client attempts to claim this is an official live score via metadata
  const spoofedLiveScore = await submitEventScore({
    event_id: scheduledEvent.id,
    player_name: 'SneakyPlayerClaimingLive',
    score: 990,
    metadata: {
      sessionId: 'test_session_2',
      score_environment: 'live',
      isTest: false,
      score_mode: 'LIVE',
    },
  });

  // Server authoritatively classifies it as 'test' because current date < start_date
  assert.strictEqual(
    spoofedLiveScore.score_environment,
    'test',
    'Scenario 2: Server must override client and set environment to "test"'
  );
  assert.strictEqual(
    spoofedLiveScore.mode,
    'TEST',
    'Scenario 2: Server must set mode to "TEST"'
  );
  assert.strictEqual(
    spoofedLiveScore.is_test,
    true,
    'Scenario 2: is_test must be true'
  );

  // Leaderboard before start date must only show test mode
  const preEventLeaderboard = await getEventHighScores(scheduledEvent.id);
  assert.strictEqual(preEventLeaderboard.is_test_mode, true, 'Scenario 2: Leaderboard must be in test mode');
  assert.strictEqual(preEventLeaderboard.score_environment, 'test', 'Scenario 2: Leaderboard environment must be test');
  assert.strictEqual(preEventLeaderboard.scores.length, 2, 'Scenario 2: Both pre-event scores exist in test mode');
  console.log('  ✓ PASSED: Server authoritatively rejects client LIVE claim before start date; score is recorded as TEST');

  // --------------------------------------------------------------------------
  // Scenario 3: Event reaches start date: TEST scores are cleared.
  // --------------------------------------------------------------------------
  console.log('\nScenario 3: Event reaches start date: TEST scores are cleared...');
  // Transition event to today (event window is now active and paid)
  scheduledEvent.start_date = todayStr;
  scheduledEvent.end_date = dayAfterStr;
  scheduledEvent.starts_at = `${todayStr}T00:00:00.000Z`;
  scheduledEvent.status = 'live';
  scheduledEvent.payment_status = 'PAID';
  scheduledEvent.event_status = 'LIVE';
  localEventsCache.set(scheduledEvent.id, scheduledEvent);

  // Submit first LIVE score on the active event
  const liveScore1 = await submitEventScore({
    event_id: scheduledEvent.id,
    player_name: 'OfficialLivePlayer1',
    score: 1200,
    metadata: {
      sessionId: 'live_session_1',
    },
  });

  assert.strictEqual(liveScore1.score_environment, 'live', 'Scenario 3: New score must be in "live" environment');
  assert.strictEqual(liveScore1.mode, 'LIVE', 'Scenario 3: New score mode must be "LIVE"');

  // Query leaderboard: TEST scores must have been completely purged!
  const liveLeaderboard = await getEventHighScores(scheduledEvent.id);
  assert.strictEqual(liveLeaderboard.is_test_mode, false, 'Scenario 3: Leaderboard is now official live mode');
  assert.strictEqual(liveLeaderboard.score_environment, 'live', 'Scenario 3: Score environment is "live"');
  assert.strictEqual(liveLeaderboard.scores.length, 1, 'Scenario 3: TEST scores were cleared; only LIVE score remains');
  assert.strictEqual(liveLeaderboard.scores[0].player_name, 'OfficialLivePlayer1', 'Scenario 3: Only official live player present');
  console.log('  ✓ PASSED: When event reaches start date, pre-event TEST scores are automatically cleared');

  // --------------------------------------------------------------------------
  // Scenario 4: Event reaches start date: clearing happens only once / is idempotent.
  // --------------------------------------------------------------------------
  console.log('\nScenario 4: Event reaches start date: clearing happens only once / is idempotent...');
  assert.strictEqual(
    isEventTestScoresCleared(scheduledEvent.id),
    true,
    'Scenario 4: isEventTestScoresCleared must return true'
  );

  // Submit a second LIVE score
  const liveScore2 = await submitEventScore({
    event_id: scheduledEvent.id,
    player_name: 'OfficialLivePlayer2',
    score: 1450,
    metadata: {
      sessionId: 'live_session_2',
    },
  });

  // Re-run clearance check to ensure idempotency does not clear existing LIVE scores
  await ensureTestScoresClearedForLiveEvent(scheduledEvent.id, scheduledEvent);

  const leaderboardAfterSecondClearance = await getEventHighScores(scheduledEvent.id);
  assert.strictEqual(
    leaderboardAfterSecondClearance.scores.length,
    2,
    'Scenario 4: Both LIVE scores preserved; clearing did not re-run or wipe LIVE data'
  );
  assert.strictEqual(
    leaderboardAfterSecondClearance.scores[0].player_name,
    'OfficialLivePlayer2',
    'Scenario 4: High score is rank 1'
  );
  assert.strictEqual(
    leaderboardAfterSecondClearance.scores[1].player_name,
    'OfficialLivePlayer1',
    'Scenario 4: Second score is rank 2'
  );
  console.log('  ✓ PASSED: Test score clearing is strictly idempotent and does not delete LIVE scores');

  // --------------------------------------------------------------------------
  // Scenario 5: After start date: new scores are LIVE.
  // --------------------------------------------------------------------------
  console.log('\nScenario 5: After start date: new scores are LIVE...');
  const liveScore3 = await submitEventScore({
    event_id: scheduledEvent.id,
    player_name: 'OfficialLivePlayer3',
    score: 1100,
    metadata: {
      sessionId: 'live_session_3',
    },
  });

  assert.strictEqual(liveScore3.score_environment, 'live', 'Scenario 5: Score environment is "live"');
  assert.strictEqual(liveScore3.mode, 'LIVE', 'Scenario 5: Mode is "LIVE"');
  assert.strictEqual(liveScore3.is_test, false, 'Scenario 5: is_test is false');
  console.log('  ✓ PASSED: After start date, newly submitted scores are authoritatively marked LIVE');

  // --------------------------------------------------------------------------
  // Scenario 6: After end date: new LIVE scores are rejected.
  // --------------------------------------------------------------------------
  console.log('\nScenario 6: After end date: new LIVE scores are rejected...');
  // Move event dates to the past (completed / expired)
  scheduledEvent.start_date = twoDaysAgoStr;
  scheduledEvent.end_date = yesterdayStr;
  scheduledEvent.starts_at = `${twoDaysAgoStr}T00:00:00.000Z`;
  scheduledEvent.expires_at = `${yesterdayStr}T23:59:59.999Z`;
  scheduledEvent.status = 'completed';
  scheduledEvent.event_status = 'COMPLETED';
  localEventsCache.set(scheduledEvent.id, scheduledEvent);

  let scoreSubmissionAfterExpiryRejected = false;
  try {
    await submitEventScore({
      event_id: scheduledEvent.id,
      player_name: 'LateComerAfterExpiry',
      score: 1500,
      metadata: {
        sessionId: 'late_session_expired',
      },
    });
  } catch (err: any) {
    scoreSubmissionAfterExpiryRejected = true;
    assert.strictEqual(err.status, 403, 'Scenario 6: Expected 403 status on expired event submission');
    assert.strictEqual(err.code, 'EVENT_COMPLETED', 'Scenario 6: Expected EVENT_COMPLETED code');
  }

  assert.strictEqual(
    scoreSubmissionAfterExpiryRejected,
    true,
    'Scenario 6: Submissions to expired event must be rejected'
  );
  console.log('  ✓ PASSED: After end date, new score submissions are rejected with 403 EVENT_COMPLETED');

  // --------------------------------------------------------------------------
  // Scenario 7: Final LIVE scores remain viewable after event expiry.
  // --------------------------------------------------------------------------
  console.log('\nScenario 7: Final LIVE scores remain viewable after event expiry...');
  const expiredEventLeaderboard = await getEventHighScores(scheduledEvent.id);

  assert.strictEqual(
    expiredEventLeaderboard.scores.length,
    3,
    'Scenario 7: All 3 LIVE scores remain intact after event expiry'
  );
  assert.strictEqual(
    expiredEventLeaderboard.score_environment,
    'live',
    'Scenario 7: Leaderboard environment remains official "live"'
  );
  assert.strictEqual(
    expiredEventLeaderboard.scores[0].player_name,
    'OfficialLivePlayer2',
    'Scenario 7: Winner rank 1 preserved'
  );
  assert.strictEqual(
    expiredEventLeaderboard.scores[0].score,
    1450,
    'Scenario 7: Winner score preserved'
  );
  assert.strictEqual(
    expiredEventLeaderboard.scores[1].player_name,
    'OfficialLivePlayer1',
    'Scenario 7: Rank 2 preserved'
  );
  assert.strictEqual(
    expiredEventLeaderboard.scores[2].player_name,
    'OfficialLivePlayer3',
    'Scenario 7: Rank 3 preserved'
  );
  console.log('  ✓ PASSED: Final LIVE scores remain permanently viewable after event expiry with correct rankings');

  // Clean up
  await clearEventHighScores(scheduledEvent.id);

  console.log('\n====================================================');
  console.log('🎉 ALL 7 EVENT TEST SCORE FLOW SCENARIOS PASSED!');
  console.log('====================================================\n');
}

runEventTestScoreFlowTests().catch((err) => {
  console.error('❌ Test execution failed:', err);
  process.exit(1);
});
