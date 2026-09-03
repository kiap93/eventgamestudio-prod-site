import {
  manualClearEventTestScores,
  getEventTestScoresCount,
  submitEventScore,
  localHighScoresCache,
  getEventHighScores,
} from './highScores';
import { localEventsCache, isEventBeforeStartDate } from './events';
import { EventRecord } from './types';

async function runManualClearTestScoresTests() {
  console.log('=== Running Manual Clear Test Scores Tests ===\n');

  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // 1. Create a pre-event (start_date is tomorrow)
  const preEventId = 'test-manual-clear-' + Date.now();
  const preEvent: EventRecord = {
    id: preEventId,
    organization_id: 'org-test-manual',
    name: 'Pre-Event Test Game',
    game_id: 'catch-brand',
    game_theme_id: 'theme-test',
    status: 'scheduled',
    payment_status: 'PAID',
    start_date: tomorrow,
    end_date: nextWeek,
    starts_at: `${tomorrow}T00:00:00.000Z`,
    expires_at: `${nextWeek}T23:59:59.999Z`,
    public_token: 'token-pre-' + Date.now(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  localEventsCache.set(preEventId, preEvent);

  // Verify helper
  if (!isEventBeforeStartDate(preEvent)) {
    throw new Error('Expected isEventBeforeStartDate to be true for tomorrow event');
  }
  console.log('✓ [Check 1] isEventBeforeStartDate returns true for pre-event');

  // 2. Submit test scores
  await submitEventScore({
    event_id: preEventId,
    player_name: 'Tester Alpha',
    score: 1200,
    metadata: { test: true },
  });
  await submitEventScore({
    event_id: preEventId,
    player_name: 'Tester Beta',
    score: 2500,
    metadata: { test: true },
  });
  await submitEventScore({
    event_id: preEventId,
    player_name: 'Tester Gamma',
    score: 800,
    metadata: { test: true },
  });

  // Also manually inject a LIVE score to prove LIVE scores are protected
  const liveScoreId = 'live-preserved-' + Date.now();
  const existingScores = localHighScoresCache.get(preEventId) || [];
  existingScores.push({
    id: liveScoreId,
    event_id: preEventId,
    player_name: 'VIP Live Player',
    score: 9999,
    score_environment: 'live',
    score_mode: 'LIVE',
    is_test: false,
    created_at: new Date().toISOString(),
  });
  localHighScoresCache.set(preEventId, existingScores);

  // 3. Check getEventTestScoresCount
  const testCount = await getEventTestScoresCount(preEventId);
  if (testCount !== 3) {
    throw new Error(`Expected getEventTestScoresCount to be 3, got ${testCount}`);
  }
  console.log(`✓ [Check 2] getEventTestScoresCount correctly counted ${testCount} TEST scores`);

  // 4. Execute manualClearEventTestScores
  const initialEventState = JSON.stringify(localEventsCache.get(preEventId));
  const clearResult = await manualClearEventTestScores(preEventId);

  if (clearResult.deleted_count !== 3) {
    throw new Error(`Expected clearResult.deleted_count to be 3, got ${clearResult.deleted_count}`);
  }
  console.log(`✓ [Check 3] manualClearEventTestScores successfully cleared 3 test scores`);

  // Check that test scores are 0 now
  const countAfterClear = await getEventTestScoresCount(preEventId);
  if (countAfterClear !== 0) {
    throw new Error(`Expected test scores count after clear to be 0, got ${countAfterClear}`);
  }
  console.log('✓ [Check 4] Test scores count is now 0');

  // Check that LIVE score was strictly preserved
  const remainingScores = localHighScoresCache.get(preEventId) || [];
  if (remainingScores.length !== 1 || remainingScores[0].id !== liveScoreId) {
    throw new Error(`Expected LIVE score to be preserved! Remaining: ${JSON.stringify(remainingScores)}`);
  }
  console.log('✓ [Check 5] LIVE score was strictly preserved and NOT deleted');

  // Verify event dates, status, payment status, and test_scores_cleared_at state
  const eventAfter = localEventsCache.get(preEventId)!;
  if (eventAfter.status !== 'scheduled' || eventAfter.payment_status !== 'PAID' || eventAfter.start_date !== tomorrow) {
    throw new Error('Event state was modified during test scores clear');
  }
  if (eventAfter.test_scores_cleared_at) {
    throw new Error('manualClearEventTestScores must NOT set test_scores_cleared_at, so users can continue testing');
  }
  console.log('✓ [Check 6] Event state, status, dates, and billing are untouched; test_scores_cleared_at is NOT set');

  // 5. Subsequent test scores can be added and tested again
  await submitEventScore({
    event_id: preEventId,
    player_name: 'Tester Delta',
    score: 1500,
    metadata: { test: true },
  });
  const countAfterRetest = await getEventTestScoresCount(preEventId);
  if (countAfterRetest !== 1) {
    throw new Error(`Expected re-test score count to be 1, got ${countAfterRetest}`);
  }
  console.log('✓ [Check 7] Pre-event testing continues seamlessly after manual clear (1 new test score recorded)');

  // 6. Test safety rejection: Event already reached its start date
  const startedEventId = 'test-started-event-' + Date.now();
  const startedEvent: EventRecord = {
    id: startedEventId,
    organization_id: 'org-test-started',
    name: 'Started Live Event',
    game_id: 'catch-brand',
    game_theme_id: 'theme-test',
    status: 'live',
    payment_status: 'PAID',
    start_date: yesterday,
    end_date: nextWeek,
    starts_at: `${yesterday}T00:00:00.000Z`,
    expires_at: `${nextWeek}T23:59:59.999Z`,
    public_token: 'token-started-' + Date.now(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  localEventsCache.set(startedEventId, startedEvent);

  if (isEventBeforeStartDate(startedEvent)) {
    throw new Error('Expected isEventBeforeStartDate to be false for started event');
  }

  let rejected = false;
  try {
    await manualClearEventTestScores(startedEventId);
  } catch (err: any) {
    rejected = true;
    if (err.code !== 'EVENT_ALREADY_STARTED') {
      throw new Error(`Expected error code EVENT_ALREADY_STARTED, got ${err.code}`);
    }
  }

  if (!rejected) {
    throw new Error('Expected manualClearEventTestScores to reject for started event');
  }
  console.log('✓ [Check 8] Backend strictly rejected manualClearEventTestScores on started event with EVENT_ALREADY_STARTED');

  // 7. Idempotency test when test scores are already 0
  const cleanEventId = 'test-clean-' + Date.now();
  localEventsCache.set(cleanEventId, {
    ...preEvent,
    id: cleanEventId,
  });
  localHighScoresCache.set(cleanEventId, []);

  const emptyResult = await manualClearEventTestScores(cleanEventId);
  if (emptyResult.deleted_count !== 0) {
    throw new Error(`Expected 0 deleted count on empty test scores, got ${emptyResult.deleted_count}`);
  }
  console.log('✓ [Check 9] Idempotent execution on 0 test scores returned deleted_count: 0 cleanly');

  console.log('\n======================================================');
  console.log('ALL MANUAL CLEAR TEST SCORES UNIT & SAFETY TESTS PASSED!');
  console.log('======================================================\n');
}

runManualClearTestScoresTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
