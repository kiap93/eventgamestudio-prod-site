import assert from 'node:assert';
import {
  createUser,
  createOrganization,
  createTheme,
  getAllPlatformGames,
  createEvent,
  listNotifications,
  submitEventScore,
  getNotificationByDeduplicationKey,
} from './index.js';
import { getSupabaseServerClient } from '../supabase.js';
import { dispatchNotificationEvent } from '../notifications/dispatcher.js';
import { NOTIFICATION_CATALOG } from '../../src/lib/notifications/types.js';

// Enable local test environment
process.env.ALLOW_LOCAL_FALLBACK = 'true';

async function runEventNotificationRegressionTests() {
  console.log('======================================================');
  console.log('🧪 RUNNING EVENT NOTIFICATION TRIGGER REGRESSION TESTS');
  console.log('======================================================\n');

  const testEnv = {
    ALLOW_LOCAL_FALLBACK: 'true',
    TEST_MODE: true,
  };

  const games = await getAllPlatformGames(testEnv);
  const gameId = games[0]?.id || 'game-catch-brand';

  const creatorUser = await createUser(
    {
      email: `creator_${Date.now()}@example.com`,
      name: 'Event Creator',
    },
    testEnv
  );

  const org = await createOrganization(
    {
      name: 'Notification Test Org',
      owner_id: creatorUser.id,
    },
    testEnv
  );

  const theme = await createTheme(
    {
      organization_id: org.id,
      game_id: gameId,
      name: 'Neon Horizon',
      slug: `neon-theme-${Date.now()}`,
    },
    testEnv
  );

  // -----------------------------------------------------------------
  // Test 1: Direct/Fallback Event Creation triggers EVENT_CREATED
  // -----------------------------------------------------------------
  console.log('--- Test 1: Event Creation Dispatches EVENT_CREATED to Creator ---');
  const eventName1 = 'Launch Festival 2026';
  const event1 = await createEvent(
    {
      organization_id: org.id,
      game_id: gameId,
      game_theme_id: theme.id,
      name: eventName1,
      start_date: '2026-11-01',
      end_date: '2026-11-02',
      event_price: 1400,
      payment_status: 'UNPAID',
      status: 'draft',
      created_by: creatorUser.id,
    },
    testEnv
  );

  assert.ok(event1?.id, 'Event 1 created successfully');

  // Verify notification was created specifically for creatorUser.id
  const notifsUser1 = await listNotifications({ userId: creatorUser.id }, testEnv);
  const createdNotif = notifsUser1.notifications.find(
    (n) => n.type === 'event_created' && n.entity_id === event1.id
  );

  assert.ok(createdNotif, 'EVENT_CREATED notification must exist for creator');
  assert.strictEqual(createdNotif.recipient_user_id, creatorUser.id, 'Recipient must strictly match created_by');
  assert.strictEqual(createdNotif.category, 'event', 'Category must be event');
  assert.strictEqual(createdNotif.title, 'New Event Created', 'Title must match catalog template');
  assert.ok(
    createdNotif.message.includes(eventName1),
    `Message must include event name: "${createdNotif.message}"`
  );
  assert.ok(
    createdNotif.message.includes('2026-11-01'),
    `Message must include start date: "${createdNotif.message}"`
  );
  console.log('  ✓ PASS: Event creation correctly dispatched EVENT_CREATED to creator');

  // -----------------------------------------------------------------
  // Test 2: Simulated RPC Success triggers EVENT_CREATED
  // -----------------------------------------------------------------
  console.log('\n--- Test 2: create_event_atomic RPC Success Path Dispatches Notification ---');
  const client = getSupabaseServerClient(testEnv);
  const originalRpc = client.rpc;

  const rpcEventId = `rpc-ev-${Date.now()}`;
  const rpcEventName = 'Atomic RPC Grand Prix';

  // Mock successful RPC execution
  client.rpc = (async (fnName: string, params?: any) => {
    if (fnName === 'create_event_atomic') {
      return {
        data: {
          success: true,
          event: {
            id: rpcEventId,
            organization_id: org.id,
            game_id: gameId,
            game_theme_id: theme.id,
            name: rpcEventName,
            status: 'draft',
            event_status: 'DRAFT',
            payment_status: 'UNPAID',
            start_date: '2026-11-10',
            end_date: '2026-11-12',
            event_date: '2026-11-10',
            created_by: creatorUser.id,
            event_price: 1400,
            event_currency: 'MYR',
            public_token: `token-${rpcEventId}`,
            created_at: new Date().toISOString(),
          },
        },
        error: null,
      } as any;
    }
    return originalRpc.call(client, fnName, params);
  }) as any;

  try {
    const rpcCreated = await createEvent(
      {
        organization_id: org.id,
        game_id: gameId,
        game_theme_id: theme.id,
        name: rpcEventName,
        start_date: '2026-11-10',
        end_date: '2026-11-12',
        event_price: 1400,
        payment_status: 'UNPAID',
        status: 'draft',
        created_by: creatorUser.id,
      },
      testEnv
    );

    assert.strictEqual(rpcCreated.id, rpcEventId, 'RPC path returned expected fullRecord');

    const notifsAfterRpc = await listNotifications({ userId: creatorUser.id }, testEnv);
    const rpcNotif = notifsAfterRpc.notifications.find(
      (n) => n.type === 'event_created' && n.entity_id === rpcEventId
    );

    assert.ok(rpcNotif, 'EVENT_CREATED notification must be dispatched on RPC success');
    assert.strictEqual(rpcNotif.recipient_user_id, creatorUser.id, 'Recipient must match creator');
    assert.ok(
      rpcNotif.message.includes(rpcEventName),
      `Notification message must include RPC event name: "${rpcNotif.message}"`
    );
    console.log('  ✓ PASS: RPC success path correctly triggers EVENT_CREATED notification before return');
  } finally {
    // Restore original RPC
    client.rpc = originalRpc;
  }

  // -----------------------------------------------------------------
  // Test 3: Simulated RPC Failure/Limit Reached does NOT dispatch notification
  // -----------------------------------------------------------------
  console.log('\n--- Test 3: create_event_atomic Failure does NOT Dispatch Notification ---');
  const failedEventName = 'Should Never Be Notified';
  const failedEventId = `failed-ev-${Date.now()}`;

  client.rpc = (async (fnName: string, params?: any) => {
    if (fnName === 'create_event_atomic') {
      return {
        data: {
          success: false,
          code: 'PENDING_EVENT_LIMIT_REACHED',
          message: 'You have reached the maximum allowed limit of 5 unpaid events. Please pay for or delete an existing pending event before creating a new one.',
        },
        error: null,
      } as any;
    }
    return originalRpc.call(client, fnName, params);
  }) as any;

  let failedThrown = false;
  try {
    await createEvent(
      {
        organization_id: org.id,
        game_id: gameId,
        game_theme_id: theme.id,
        name: failedEventName,
        start_date: '2026-12-01',
        end_date: '2026-12-02',
        event_price: 1400,
        payment_status: 'UNPAID',
        status: 'draft',
        created_by: creatorUser.id,
      },
      testEnv
    );
  } catch (err: any) {
    failedThrown = true;
    assert.strictEqual(err.code, 'PENDING_EVENT_LIMIT_REACHED', 'Should throw PENDING_EVENT_LIMIT_REACHED');
  } finally {
    client.rpc = originalRpc;
  }

  assert.strictEqual(failedThrown, true, 'createEvent must throw on RPC failure');

  // Verify NO notification was dispatched
  const notifsAfterFailed = await listNotifications({ userId: creatorUser.id }, testEnv);
  const ghostNotif = notifsAfterFailed.notifications.find(
    (n) => n.message?.includes(failedEventName) || n.entity_id === failedEventId
  );
  assert.strictEqual(ghostNotif, undefined, 'No notification should be dispatched when RPC fails');
  console.log('  ✓ PASS: RPC failure properly aborts without emitting EVENT_CREATED');

  // -----------------------------------------------------------------
  // Test 4: Deduplication Idempotency on EVENT_CREATED
  // -----------------------------------------------------------------
  console.log('\n--- Test 4: Deduplication Prevents Duplicate EVENT_CREATED ---');
  const dedupTestEventId = `dedup-ev-${Date.now()}`;

  // First dispatch
  const firstDispatches = await dispatchNotificationEvent(
    {
      eventType: 'EVENT_CREATED',
      organizationId: org.id,
      recipientUserId: creatorUser.id,
      eventId: dedupTestEventId,
      eventName: 'Dedup Festival',
      startDate: '2026-11-20',
      endDate: '2026-11-21',
    },
    testEnv
  );
  assert.strictEqual(firstDispatches.length, 1, 'First dispatch must create 1 notification');

  // Duplicate dispatch
  const secondDispatches = await dispatchNotificationEvent(
    {
      eventType: 'EVENT_CREATED',
      organizationId: org.id,
      recipientUserId: creatorUser.id,
      eventId: dedupTestEventId,
      eventName: 'Dedup Festival',
      startDate: '2026-11-20',
      endDate: '2026-11-21',
    },
    testEnv
  );
  assert.strictEqual(secondDispatches.length, 0, 'Duplicate dispatch must be suppressed (0 created)');
  console.log('  ✓ PASS: Deduplication key correctly suppresses duplicate EVENT_CREATED');

  // -----------------------------------------------------------------
  // Test 5: High Score Recording does NOT Emit LEADERBOARD_HIGH_SCORE
  // -----------------------------------------------------------------
  console.log('\n--- Test 5: No Leaderboard High Score Notification Generated ---');
  const paidLiveEvent = await createEvent(
    {
      organization_id: org.id,
      game_id: gameId,
      game_theme_id: theme.id,
      name: 'Paid High Score Event',
      start_date: '2026-11-01',
      end_date: '2026-11-05',
      event_price: 1400,
      payment_status: 'PAID',
      status: 'scheduled',
      event_status: 'LIVE',
      created_by: creatorUser.id,
      skipPendingLimitCheck: true,
    },
    testEnv
  );

  // Record a rank 1 live score
  const scoreResult = await submitEventScore(
    {
      event_id: paidLiveEvent.id,
      player_name: 'SuperPlayer99',
      score: 250,
    },
    testEnv
  );

  assert.ok(scoreResult.score, 'High score recorded successfully');
  assert.strictEqual(scoreResult.rank, 1, 'Score is rank 1');

  // Verify that NO notification of type leaderboard_high_score exists anywhere
  const allUserNotifs = await listNotifications({ userId: creatorUser.id }, testEnv);
  const highScoreNotifs = allUserNotifs.notifications.filter(
    (n) => (n.type as string) === 'leaderboard_high_score'
  );
  assert.strictEqual(
    highScoreNotifs.length,
    0,
    'Zero leaderboard_high_score notifications must exist after rank 1 score'
  );

  // Check NOTIFICATION_CATALOG does not contain leaderboard_high_score
  assert.strictEqual(
    (NOTIFICATION_CATALOG as any)['leaderboard_high_score'],
    undefined,
    'NOTIFICATION_CATALOG must not have leaderboard_high_score'
  );
  console.log('  ✓ PASS: Leaderboard high score records successfully with zero notifications generated');

  // -----------------------------------------------------------------
  // Test 6: Paid and Live Event Creation also triggers EVENT_LIVE
  // -----------------------------------------------------------------
  console.log('\n--- Test 6: Paid & Live Event triggers EVENT_LIVE ---');
  const liveEventName = 'Immediate Live Carnival';
  const liveEvent = await createEvent(
    {
      organization_id: org.id,
      game_id: gameId,
      game_theme_id: theme.id,
      name: liveEventName,
      start_date: '2026-11-01',
      end_date: '2026-11-05',
      event_price: 1400,
      payment_status: 'PAID',
      status: 'scheduled',
      event_status: 'LIVE',
      created_by: creatorUser.id,
      skipPendingLimitCheck: true,
    },
    testEnv
  );

  const notifsAfterLive = await listNotifications({ userId: creatorUser.id }, testEnv);
  const liveNotif = notifsAfterLive.notifications.find(
    (n) => n.type === 'event_live' && n.entity_id === liveEvent.id
  );

  assert.ok(liveNotif, 'EVENT_LIVE notification must be dispatched when paid & live');
  assert.strictEqual(liveNotif.recipient_user_id, creatorUser.id, 'Recipient must match creator');
  console.log('  ✓ PASS: Paid & Live event properly dispatched EVENT_LIVE');

  console.log('\n======================================================');
  console.log('🎉 ALL EVENT NOTIFICATION REGRESSION TESTS PASSED!');
  console.log('======================================================\n');
}

runEventNotificationRegressionTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
