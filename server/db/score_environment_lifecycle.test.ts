import {
  determineScoreEnvironment,
  submitEventScore,
  getEventHighScores,
  clearEventHighScores,
  clearEventTestScores,
  isEventTestScoresCleared,
} from './highScores';
import { localEventsCache, runEventLifecycleMaintenance } from './events';
import { EventRecord } from './types';

async function runTests() {
  console.log('--- Starting Score Environment Lifecycle Tests ---');

  // Test 1: determineScoreEnvironment logic
  console.log('\n[Test 1] determineScoreEnvironment unit checks');
  const now = new Date();
  const futureStart = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const futureEnd = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString().split('T')[0];
  const pastStart = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString().split('T')[0];
  const pastEnd = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const today = now.toISOString().split('T')[0];

  const scheduledEvent: EventRecord = {
    id: 'test-event-sched',
    organization_id: 'org-1',
    name: 'Future Event',
    game_id: 'catch-brand',
    game_theme_id: 'theme-1',
    status: 'scheduled',
    payment_status: 'UNPAID',
    start_date: futureStart,
    end_date: futureEnd,
    starts_at: `${futureStart}T00:00:00.000Z`,
    expires_at: `${futureEnd}T23:59:59.999Z`,
    public_token: 'token-sched',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const liveEvent: EventRecord = {
    id: 'test-event-live',
    organization_id: 'org-1',
    name: 'Active Live Event',
    game_id: 'catch-brand',
    game_theme_id: 'theme-1',
    status: 'live',
    payment_status: 'PAID',
    start_date: today,
    end_date: futureEnd,
    starts_at: `${today}T00:00:00.000Z`,
    expires_at: `${futureEnd}T23:59:59.999Z`,
    public_token: 'token-live',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const endedEvent: EventRecord = {
    id: 'test-event-ended',
    organization_id: 'org-1',
    name: 'Past Event',
    game_id: 'catch-brand',
    game_theme_id: 'theme-1',
    status: 'completed',
    payment_status: 'PAID',
    start_date: pastStart,
    end_date: pastEnd,
    starts_at: `${pastStart}T00:00:00.000Z`,
    expires_at: `${pastEnd}T23:59:59.999Z`,
    public_token: 'token-ended',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const envSched = determineScoreEnvironment(scheduledEvent);
  if (envSched !== 'test') {
    throw new Error(`Expected test environment for scheduled future event, got ${envSched}`);
  }
  console.log('✓ Scheduled future event maps to test environment');

  const envLive = determineScoreEnvironment(liveEvent);
  if (envLive !== 'live') {
    throw new Error(`Expected live environment for active live event, got ${envLive}`);
  }
  console.log('✓ Active live event maps to live environment');

  const envEnded = determineScoreEnvironment(endedEvent);
  if (envEnded !== 'live') {
    throw new Error(`Expected live environment for past event (official live scores), got ${envEnded}`);
  }
  console.log('✓ Past event maps to live (official) score environment');

  // Test 2: TEST score submissions allowed before start date
  console.log('\n[Test 2] TEST score submission for scheduled event');
  const eventId = 'test-lifecycle-event-' + Date.now();
  const lifecycleEvent: EventRecord = {
    id: eventId,
    organization_id: 'org-lifecycle',
    name: 'Lifecycle Test Event',
    game_id: 'catch-brand',
    game_theme_id: 'theme-1',
    status: 'scheduled',
    payment_status: 'UNPAID', // Unpaid allowed in TEST mode
    start_date: futureStart,
    end_date: futureEnd,
    starts_at: `${futureStart}T00:00:00.000Z`,
    expires_at: `${futureEnd}T23:59:59.999Z`,
    public_token: 'token-lifecycle',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  localEventsCache.set(eventId, lifecycleEvent);

  const testScore1 = await submitEventScore({
    event_id: eventId,
    player_name: 'Tester Alpha',
    score: 1500,
  });

  if (testScore1.score_environment !== 'test' || !testScore1.is_test) {
    throw new Error(`Expected testScore1 to have score_environment='test', got ${testScore1.score_environment}`);
  }
  console.log('✓ Pre-event test score 1 submitted successfully with score_environment=test');

  const testScore2 = await submitEventScore({
    event_id: eventId,
    player_name: 'Tester Beta',
    score: 2200,
  });

  if (testScore2.score_environment !== 'test' || !testScore2.is_test) {
    throw new Error(`Expected testScore2 to have score_environment='test', got ${testScore2.score_environment}`);
  }
  console.log('✓ Pre-event test score 2 submitted successfully with score_environment=test');

  // Verify TEST scores leaderboard
  const testScoresList = await getEventHighScores(eventId, { limit: 10 });
  if (testScoresList.scores.length !== 2) {
    throw new Error(`Expected 2 test scores in leaderboard, got ${testScoresList.scores.length}`);
  }
  if (!testScoresList.is_test_mode) {
    throw new Error('Expected is_test_mode to be true in leaderboard response');
  }
  console.log('✓ Test leaderboard correctly lists 2 test scores in test mode');

  // Test 3: Transition to LIVE mode and automatic test score clearance
  console.log('\n[Test 3] Transition to LIVE and clearing of TEST scores');
  // Transition event to today (start date reached) and marked PAID
  lifecycleEvent.start_date = today;
  lifecycleEvent.status = 'live';
  lifecycleEvent.payment_status = 'PAID';
  localEventsCache.set(eventId, lifecycleEvent);

  const activeEnv = determineScoreEnvironment(lifecycleEvent);
  if (activeEnv !== 'live') {
    throw new Error(`Expected activeEnv to be live, got ${activeEnv}`);
  }

  // Submit first LIVE score
  const liveScore1 = await submitEventScore({
    event_id: eventId,
    player_name: 'Live Champion',
    score: 3000,
  });

  if (liveScore1.score_environment !== 'live' || liveScore1.is_test) {
    throw new Error(`Expected liveScore1 to have score_environment='live', got ${liveScore1.score_environment}`);
  }
  console.log('✓ First live score submitted with score_environment=live');

  // Verify that previous TEST scores were cleared upon entering LIVE mode!
  const liveScoresList = await getEventHighScores(eventId, { limit: 10 });
  if (liveScoresList.scores.length !== 1) {
    throw new Error(`Expected exactly 1 live score after test scores cleared, got ${liveScoresList.scores.length}`);
  }
  if (liveScoresList.scores[0].player_name !== 'Live Champion') {
    throw new Error(`Expected top player to be 'Live Champion', got ${liveScoresList.scores[0].player_name}`);
  }
  if (liveScoresList.is_test_mode) {
    throw new Error('Expected is_test_mode to be false for LIVE event leaderboard');
  }
  console.log('✓ TEST scores automatically purged; only LIVE scores present on live leaderboard');

  // Test 4: Unpaid LIVE event rejects live score submission
  console.log('\n[Test 4] LIVE event with UNPAID status rejects live score submission');
  const unpaidLiveId = 'unpaid-live-' + Date.now();
  const unpaidLiveEvent: EventRecord = {
    id: unpaidLiveId,
    organization_id: 'org-unpaid',
    name: 'Unpaid Live Event',
    game_id: 'catch-brand',
    game_theme_id: 'theme-1',
    status: 'live',
    payment_status: 'UNPAID',
    start_date: today,
    end_date: futureEnd,
    starts_at: `${today}T00:00:00.000Z`,
    expires_at: `${futureEnd}T23:59:59.999Z`,
    public_token: 'token-unpaid',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  localEventsCache.set(unpaidLiveId, unpaidLiveEvent);

  let paymentBlocked = false;
  try {
    await submitEventScore({
      event_id: unpaidLiveId,
      player_name: 'Cheater',
      score: 9999,
    });
  } catch (err: any) {
    paymentBlocked = true;
    if (err.code !== 'PAYMENT_REQUIRED') {
      throw new Error(`Expected code PAYMENT_REQUIRED, got ${err.code}`);
    }
  }
  if (!paymentBlocked) {
    throw new Error('Expected submitEventScore to fail for unpaid live event');
  }
  console.log('✓ Unpaid live event score submission correctly blocked with PAYMENT_REQUIRED');

  // Test 5: Client-provided metadata flags must NOT be authoritative
  console.log('\n[Test 5] Server-authoritative determination (client flags are NOT authoritative)');
  // Case A: Client passes isTest: false on a scheduled event -> server still enforces score_environment = 'test'
  const spoofAttempt1 = await submitEventScore({
    event_id: eventId === unpaidLiveId ? 'test-lifecycle-event-' + Date.now() : eventId,
    player_name: 'SpoofAttemptTestToLive',
    score: 1111,
    metadata: {
      isTest: false,
      isPreview: false,
      score_environment: 'live',
    },
  });
  // Note: eventId was transitioned to live earlier, so let's test specifically on scheduled vs live:
  const freshSchedId = 'sched-auth-test-' + Date.now();
  const freshSchedEvent: EventRecord = {
    id: freshSchedId,
    organization_id: 'org-sched',
    name: 'Future Event Auth Test',
    game_id: 'catch-brand',
    game_theme_id: 'theme-1',
    status: 'scheduled',
    payment_status: 'UNPAID',
    start_date: futureStart,
    end_date: futureEnd,
    starts_at: `${futureStart}T00:00:00.000Z`,
    expires_at: `${futureEnd}T23:59:59.999Z`,
    public_token: 'token-sched-auth',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  localEventsCache.set(freshSchedId, freshSchedEvent);

  // Client attempts to spoof 'live' by passing isTest: false and score_environment: 'live'
  const schedSubmission = await submitEventScore({
    event_id: freshSchedId,
    player_name: 'ClientSpoofLive',
    score: 2500,
    metadata: {
      isTest: false,
      isPreview: false,
      score_environment: 'live',
    },
  });
  if (schedSubmission.score_environment !== 'test' || !schedSubmission.is_test) {
    throw new Error(`Expected server to ignore client spoof and assign test, got ${schedSubmission.score_environment}`);
  }
  console.log('✓ Client flag isTest=false on scheduled event ignored: server authoritatively recorded test');

  // Case B: Client attempts to spoof 'test' by passing isTest: true on a live event
  const liveSpoofSubmission = await submitEventScore({
    event_id: eventId, // active live event
    player_name: 'ClientSpoofTest',
    score: 2600,
    metadata: {
      isTest: true,
      isPreview: true,
      score_environment: 'test',
    },
  });
  if (liveSpoofSubmission.score_environment !== 'live' || liveSpoofSubmission.is_test) {
    throw new Error(`Expected server to ignore client spoof and assign live, got ${liveSpoofSubmission.score_environment}`);
  }
  console.log('✓ Client flag isTest=true on live event ignored: server authoritatively recorded live');

  // Test 6: Automatic test score clearing when event reaches configured start date
  console.log('\n[Test 6] Automatic test score clearing on start date with idempotency and live score preservation');
  const autoClearEventId = 'auto-clear-event-' + Date.now();
  const autoClearEvent: EventRecord = {
    id: autoClearEventId,
    organization_id: 'org-autoclear',
    name: 'Auto Clear Test Event',
    game_id: 'catch-brand',
    game_theme_id: 'theme-1',
    status: 'scheduled',
    payment_status: 'PAID',
    start_date: today, // Start date is reached today!
    end_date: futureEnd,
    starts_at: `${today}T00:00:00.000Z`,
    expires_at: `${futureEnd}T23:59:59.999Z`,
    public_token: 'token-autoclear',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  localEventsCache.set(autoClearEventId, autoClearEvent);

  // Directly seed two TEST scores and one LIVE score to verify selective clearing
  const testScoreRecord1 = {
    id: 'test-score-1',
    event_id: autoClearEventId,
    player_name: 'Setup Tester 1',
    score: 800,
    score_environment: 'test' as const,
    score_mode: 'TEST' as const,
    is_test: true,
    metadata: { score_environment: 'test' },
    created_at: new Date(Date.now() - 3600000).toISOString(),
  };
  const testScoreRecord2 = {
    id: 'test-score-2',
    event_id: autoClearEventId,
    player_name: 'Setup Tester 2',
    score: 1200,
    score_environment: 'test' as const,
    score_mode: 'TEST' as const,
    is_test: true,
    metadata: { score_environment: 'test' },
    created_at: new Date(Date.now() - 1800000).toISOString(),
  };
  const liveScoreRecord = {
    id: 'live-score-preserved',
    event_id: autoClearEventId,
    player_name: 'Official Attendee',
    score: 5000,
    score_environment: 'live' as const,
    score_mode: 'LIVE' as const,
    is_test: false,
    metadata: { score_environment: 'live' },
    created_at: new Date().toISOString(),
  };

  // Seed into high scores cache
  const { localHighScoresCache } = await import('./highScores');
  localHighScoresCache.set(autoClearEventId, [testScoreRecord1, testScoreRecord2, liveScoreRecord]);

  // Verify before clearing: 3 total scores in cache
  const beforeScores = localHighScoresCache.get(autoClearEventId) || [];
  if (beforeScores.length !== 3) {
    throw new Error(`Expected 3 scores before clearing, got ${beforeScores.length}`);
  }

  // Run automatic maintenance (which automatically checks reached start date)
  const maintenanceResult = await runEventLifecycleMaintenance(undefined, now);
  console.log(`✓ Maintenance completed. Cleared events count: ${maintenanceResult.testScoresClearedCount}`);

  // Verify that TEST scores were removed, and LIVE score is preserved!
  const afterScores = localHighScoresCache.get(autoClearEventId) || [];
  if (afterScores.length !== 1) {
    throw new Error(`Expected exactly 1 score remaining, got ${afterScores.length}`);
  }
  if (afterScores[0].id !== 'live-score-preserved' || afterScores[0].player_name !== 'Official Attendee') {
    throw new Error(`Expected remaining score to be 'Official Attendee', got ${afterScores[0].player_name}`);
  }
  console.log('✓ TEST scores removed and LIVE score strictly preserved');

  // Verify idempotency: running maintenance again or clearEventTestScores again produces zero errors and preserves LIVE scores
  const secondMaintenance = await runEventLifecycleMaintenance(undefined, now);
  const scoresAfterSecondRun = localHighScoresCache.get(autoClearEventId) || [];
  if (scoresAfterSecondRun.length !== 1 || scoresAfterSecondRun[0].id !== 'live-score-preserved') {
    throw new Error(`Idempotency failure: live score corrupted or duplicated on second run`);
  }
  console.log('✓ Operation is idempotent: second execution preserved LIVE scores with no unintended side effects');

  const isCleared = isEventTestScoresCleared(autoClearEventId, autoClearEvent);
  if (!isCleared) {
    throw new Error(`Expected isEventTestScoresCleared to be true for ${autoClearEventId}`);
  }
  console.log('✓ isEventTestScoresCleared returns true');

  console.log('\n=============================================');
  console.log('ALL SCORE ENVIRONMENT LIFECYCLE TESTS PASSED!');
  console.log('=============================================\n');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
