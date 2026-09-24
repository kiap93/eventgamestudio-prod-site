import assert from 'node:assert';
import {
  createUser,
  createOrganization,
  createTheme,
  getAllPlatformGames,
  createEvent,
  getPendingEventsCountByOrgId,
  deleteEvent,
} from './index.js';

async function runAtomicEventCreationTests() {
  console.log('======================================================');
  console.log(' RUNNING ATOMIC EVENT CREATION & CONCURRENCY TEST SUITE');
  console.log('======================================================\n');

  const testEnv = {
    TEST_MODE: true,
  };

  const games = await getAllPlatformGames(testEnv);
  const gameId = games[0]?.id || 'game-catch-brand';

  const user = await createUser({
    email: `atomic_${Date.now()}@example.com`,
    name: 'Atomic Tester',
  }, testEnv);

  const org = await createOrganization({
    name: 'Distributed Racing Org',
    owner_id: user.id,
  }, testEnv);

  const theme = await createTheme({
    organization_id: org.id,
    game_id: gameId,
    name: 'Atomic Theme',
    slug: `atomic-theme-${Date.now()}`,
  }, testEnv);

  console.log('--- Test 1: Baseline Pending Count is 0 ---');
  let pendingCount = await getPendingEventsCountByOrgId(org.id, testEnv);
  assert.strictEqual(pendingCount, 0, 'Initial pending count must be 0');
  console.log('  ✓ PASS: Initial pending count is 0');

  console.log('--- Test 2: Create Pending Events Up to Limit - 1 (Count = 4) ---');
  const event1 = await createEvent({
    organization_id: org.id,
    game_id: gameId,
    game_theme_id: theme.id,
    name: 'Event 1 - Pending',
    start_date: '2026-10-01',
    end_date: '2026-10-02',
    event_price: 1400,
    payment_status: 'UNPAID',
    status: 'draft',
    created_by: user.id,
  }, testEnv);

  await createEvent({
    organization_id: org.id,
    game_id: gameId,
    game_theme_id: theme.id,
    name: 'Event 2 - Pending',
    start_date: '2026-10-03',
    end_date: '2026-10-04',
    event_price: 1400,
    payment_status: 'UNPAID',
    status: 'draft',
    created_by: user.id,
  }, testEnv);

  await createEvent({
    organization_id: org.id,
    game_id: gameId,
    game_theme_id: theme.id,
    name: 'Event 3 - Pending',
    start_date: '2026-10-05',
    end_date: '2026-10-06',
    event_price: 1400,
    payment_status: 'UNPAID',
    status: 'draft',
    created_by: user.id,
  }, testEnv);

  await createEvent({
    organization_id: org.id,
    game_id: gameId,
    game_theme_id: theme.id,
    name: 'Event 4 - Pending',
    start_date: '2026-10-07',
    end_date: '2026-10-08',
    event_price: 1400,
    payment_status: 'UNPAID',
    status: 'draft',
    created_by: user.id,
  }, testEnv);

  pendingCount = await getPendingEventsCountByOrgId(org.id, testEnv);
  assert.strictEqual(pendingCount, 4, 'Pending count must be 4 after 4 events');
  console.log('  ✓ PASS: Four pending events created successfully, pending count = 4');

  console.log('--- Test 3: Concurrent Race Condition Simulation (Promise.all) ---');
  // Two simultaneous requests attempt to create an event at the exact same moment when only 1 slot (5th) is remaining.
  // In a distributed environment, locking guarantees that only ONE succeeds, and the other is rejected.
  const createPromiseA = createEvent({
    organization_id: org.id,
    game_id: gameId,
    game_theme_id: theme.id,
    name: 'Concurrent Event A',
    start_date: '2026-10-09',
    end_date: '2026-10-10',
    event_price: 1400,
    payment_status: 'UNPAID',
    status: 'draft',
    created_by: user.id,
  }, testEnv).then(
    (ev) => ({ success: true, event: ev, error: null }),
    (err) => ({ success: false, event: null, error: err })
  );

  const createPromiseB = createEvent({
    organization_id: org.id,
    game_id: gameId,
    game_theme_id: theme.id,
    name: 'Concurrent Event B',
    start_date: '2026-10-11',
    end_date: '2026-10-12',
    event_price: 1400,
    payment_status: 'UNPAID',
    status: 'draft',
    created_by: user.id,
  }, testEnv).then(
    (ev) => ({ success: true, event: ev, error: null }),
    (err) => ({ success: false, event: null, error: err })
  );

  const [resultA, resultB] = await Promise.all([createPromiseA, createPromiseB]);

  const successes = [resultA, resultB].filter((r) => r.success);
  const failures = [resultA, resultB].filter((r) => !r.success);

  assert.strictEqual(successes.length, 1, 'Exactly 1 concurrent request must succeed');
  assert.strictEqual(failures.length, 1, 'Exactly 1 concurrent request must be rejected');

  const rejectedError: any = failures[0].error;
  assert.strictEqual(rejectedError.code, 'PENDING_EVENT_LIMIT_REACHED', 'Error code must be PENDING_EVENT_LIMIT_REACHED');
  assert.strictEqual(rejectedError.status, 422, 'Status must be 422');

  pendingCount = await getPendingEventsCountByOrgId(org.id, testEnv);
  assert.strictEqual(pendingCount, 5, 'Pending count must strictly be 5, never 6');
  console.log('  ✓ PASS: Distributed concurrency race condition prevented! Exactly 1 succeeded, 1 rejected, count = 5');

  console.log('--- Test 4: Subsequent Pending Creation When Limit (5) is Full ---');
  let sixthRejected = false;
  try {
    await createEvent({
      organization_id: org.id,
      game_id: gameId,
      game_theme_id: theme.id,
      name: 'Event 6 - Rejected',
      start_date: '2026-10-13',
      end_date: '2026-10-14',
      event_price: 1400,
      payment_status: 'UNPAID',
      status: 'draft',
      created_by: user.id,
    }, testEnv);
  } catch (err: any) {
    sixthRejected = true;
    assert.strictEqual(err.code, 'PENDING_EVENT_LIMIT_REACHED');
    assert.strictEqual(err.status, 422);
  }
  assert.strictEqual(sixthRejected, true, 'Sixth pending event must be rejected');
  console.log('  ✓ PASS: Subsequent pending creation rejected while 5 pending events exist');

  console.log('--- Test 5: Paid Event Creation Bypasses Pending Limit ---');
  // Creating an already-paid event (or admin event with skipPendingLimitCheck) does not consume a pending slot
  const paidEvent = await createEvent({
    organization_id: org.id,
    game_id: gameId,
    game_theme_id: theme.id,
    name: 'Paid Event - Bypasses Limit',
    start_date: '2026-10-15',
    end_date: '2026-10-16',
    event_price: 1400,
    payment_status: 'PAID',
    status: 'scheduled',
    created_by: user.id,
  }, testEnv);
  assert.ok(paidEvent.id, 'Paid event created successfully');

  pendingCount = await getPendingEventsCountByOrgId(org.id, testEnv);
  assert.strictEqual(pendingCount, 5, 'Pending count remains 5 after paid event creation');
  console.log('  ✓ PASS: Paid event does not count towards pending events limit');

  console.log('--- Test 6: Deleting an Event Frees Up Slot ---');
  await deleteEvent(event1.id, testEnv);
  pendingCount = await getPendingEventsCountByOrgId(org.id, testEnv);
  assert.strictEqual(pendingCount, 4, 'Pending count drops to 4 after deleting event 1');

  // Now creating another pending event should succeed
  const eventReplacement = await createEvent({
    organization_id: org.id,
    game_id: gameId,
    game_theme_id: theme.id,
    name: 'Event Replacement - Slot Reused',
    start_date: '2026-10-17',
    end_date: '2026-10-18',
    event_price: 1400,
    payment_status: 'UNPAID',
    status: 'draft',
    created_by: user.id,
  }, testEnv);
  assert.ok(eventReplacement.id, 'New pending event successfully created');

  pendingCount = await getPendingEventsCountByOrgId(org.id, testEnv);
  assert.strictEqual(pendingCount, 5, 'Pending count back at 5');
  console.log('  ✓ PASS: Deletion frees slot and allows new pending event creation');

  console.log('\n======================================================');
  console.log(' ALL ATOMIC EVENT CREATION TESTS PASSED PERFECTLY');
  console.log('======================================================\n');
}

runAtomicEventCreationTests().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
