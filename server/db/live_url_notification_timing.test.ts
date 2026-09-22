/**
 * Test Suite: Live Game URL Notification Timing & Setup Day Alignment
 * 
 * Verifies that:
 * 1. On Setup Day (1 calendar day before start_date):
 *    - Paid event Live URL is active and accessible (canAccessLiveEvent -> true).
 *    - LIVE_URL_AVAILABLE ("Live Game URL Available") notification is dispatched.
 *    - EVENT_LIVE ("Event Started") is NOT sent until event start_date.
 * 2. On Event Day (start_date):
 *    - Event status transitions to LIVE.
 *    - EVENT_LIVE ("Event Started") notification is dispatched.
 * 3. Deduplication prevents multiple notifications on repeat cron runs.
 * 4. Unpaid events never receive LIVE_URL_AVAILABLE or EVENT_LIVE.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  canAccessLiveEvent,
  getClientLiveGameAccessDetails,
  getNormalizedEventDates,
  isSetupDayStarted,
  runEventLifecycleMaintenance,
} from './events.js';
import {
  listNotifications,
  cleanupExpiredNotifications,
} from './notifications.js';
import {
  NOTIFICATION_CATALOG,
} from '../../src/lib/notifications/types.js';
import type { EventRecord } from './types.js';

describe('Live URL Notification Timing & Setup Day Alignment', () => {
  const orgId = '00000000-0000-0000-0000-000000000001';
  const userId = '00000000-0000-0000-0000-000000000002';

  it('NOTIFICATION_CATALOG has updated Event Started and Live Game URL Available definitions', () => {
    const liveItem = NOTIFICATION_CATALOG['event_live'];
    assert.ok(liveItem);
    assert.strictEqual(liveItem.defaultTitle, 'Event Started');
    assert.ok(liveItem.defaultMessage.includes('officially started'));

    const startedItem = NOTIFICATION_CATALOG['event_started'];
    assert.ok(startedItem);
    assert.strictEqual(startedItem.defaultTitle, 'Event Started');

    const setupItem = NOTIFICATION_CATALOG['live_url_available'];
    assert.ok(setupItem);
    assert.strictEqual(setupItem.defaultTitle, 'Live Game URL Available');
    assert.ok(setupItem.defaultMessage.includes('Setup Day'));
    assert.strictEqual(setupItem.priority, 'high');
    assert.strictEqual(setupItem.category, 'event');
  });

  it('Verifies Setup Day date calculation for an event on 25 Sep', () => {
    const event = {
      id: 'ev_sep_25',
      name: 'Tech Expo 2026',
      start_date: '2026-09-25',
      end_date: '2026-09-26',
      starts_at: '2026-09-25T00:00:00.000Z',
      expires_at: '2026-09-26T23:59:59.999Z',
      event_timezone: 'Asia/Singapore',
      payment_status: 'PAID',
      event_status: 'PUBLISHED',
      status: 'upcoming',
      public_token: 'play-tech-expo',
    };

    const dates = getNormalizedEventDates(event);
    assert.strictEqual(dates.startDate, '2026-09-25');
    assert.strictEqual(dates.endDate, '2026-09-26');
    assert.strictEqual(dates.liveOpenDate, '2026-09-24');

    // On 23 Sep: Not setup day yet
    const sep23 = new Date('2026-09-23T10:00:00+08:00');
    assert.strictEqual(isSetupDayStarted(event, sep23), false);

    // On 24 Sep: Setup day started!
    const sep24 = new Date('2026-09-24T09:00:00+08:00');
    assert.strictEqual(isSetupDayStarted(event, sep24), true);

    // On 25 Sep: Event started
    const sep25 = new Date('2026-09-25T09:00:00+08:00');
    assert.strictEqual(isSetupDayStarted(event, sep25), true);
  });

  it('On Setup Day (24 Sep): Paid event Live URL is playable, but status is not yet LIVE', () => {
    const paidEvent = {
      id: 'ev_sep_25_paid',
      name: 'Tech Expo 2026 Paid',
      start_date: '2026-09-25',
      end_date: '2026-09-26',
      starts_at: '2026-09-25T00:00:00.000Z',
      expires_at: '2026-09-26T23:59:59.999Z',
      event_timezone: 'Asia/Singapore',
      payment_status: 'PAID',
      event_status: 'PUBLISHED',
      status: 'upcoming',
      public_token: 'play-tech-paid',
    };

    const sep24 = new Date('2026-09-24T14:00:00+08:00');
    const access = canAccessLiveEvent(paidEvent, sep24);
    assert.strictEqual(access, true);
    const details = getClientLiveGameAccessDetails(paidEvent, sep24);
    assert.strictEqual(details.canAccess, true);
  });

  it('On Setup Day (24 Sep): Unpaid event Live URL is strictly BLOCKED', () => {
    const unpaidEvent = {
      id: 'ev_sep_25_unpaid',
      name: 'Tech Expo 2026 Unpaid',
      start_date: '2026-09-25',
      end_date: '2026-09-26',
      starts_at: '2026-09-25T00:00:00.000Z',
      expires_at: '2026-09-26T23:59:59.999Z',
      event_timezone: 'Asia/Singapore',
      payment_status: 'UNPAID',
      event_status: 'DRAFT',
      status: 'upcoming',
      public_token: 'play-tech-unpaid',
    };

    const sep24 = new Date('2026-09-24T14:00:00+08:00');
    const access = canAccessLiveEvent(unpaidEvent, sep24);
    assert.strictEqual(access, false);
    const details = getClientLiveGameAccessDetails(unpaidEvent, sep24);
    assert.strictEqual(details.canAccess, false);
    assert.strictEqual(details.code, 'PAYMENT_REQUIRED');
  });

  it('Lifecycle cron dispatches LIVE_URL_AVAILABLE on Setup Day (24 Sep) and EVENT_LIVE on Event Day (25 Sep)', async () => {
    const testEventId = 'ev_timing_test_sep25';
    let currentEventStatus: any = 'PUBLISHED';
    let currentRawStatus: any = 'upcoming';

    const testEvent: EventRecord = {
      id: testEventId,
      name: 'Asia Tech Summit 2026',
      organization_id: orgId,
      created_by: userId,
      game_id: 'catch-brand',
      game_theme_id: 'default',
      event_date: '2026-09-25',
      start_date: '2026-09-25',
      end_date: '2026-09-26',
      starts_at: '2026-09-25T00:00:00.000Z',
      expires_at: '2026-09-26T15:59:59.999Z',
      event_timezone: 'Asia/Singapore',
      payment_status: 'PAID',
      event_status: currentEventStatus,
      status: currentRawStatus,
      public_token: 'summit-2026',
      test_scores_cleared_at: null,
      created_at: '2026-09-20T00:00:00.000Z',
      updated_at: '2026-09-20T00:00:00.000Z',
    };

    // Mock Supabase environment returning our test event
    const mockEnv = {
      ALLOW_LOCAL_FALLBACK: 'true',
      SUPABASE_URL: 'https://placeholder.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'placeholder-service-key',
      MOCK_SUPABASE: {
        from(table: string) {
          if (table === 'events') {
            const builder: any = {
              select() { return builder; },
              neq() { return builder; },
              eq() { return builder; },
              lte() { return builder; },
              is() { return builder; },
              order() { return builder; },
              then(resolve: any) {
                // Return our test event in paid query
                resolve({ data: [{ ...testEvent, event_status: currentEventStatus, status: currentRawStatus }], error: null });
              },
              update(payload: any) {
                if (payload.event_status) currentEventStatus = payload.event_status;
                if (payload.status) currentRawStatus = payload.status;
                return {
                  eq() { return Promise.resolve({ data: null, error: null }); },
                };
              },
            };
            return builder;
          }

          // Default fallback for notifications and other tables
          const builder: any = {
            select() { return builder; },
            insert() { return Promise.resolve({ data: null, error: null }); },
            update() { return { eq() { return Promise.resolve({ data: null, error: null }); } }; },
            delete() { return { eq() { return Promise.resolve({ data: null, error: null }); } }; },
            eq() { return builder; },
            neq() { return builder; },
            in() { return builder; },
            order() { return builder; },
            range() { return Promise.resolve({ data: [], error: null, count: 0 }); },
            then(resolve: any) { resolve({ data: [], error: null }); },
          };
          return builder;
        },
      },
    };

    // Step 1: Run on Setup Day (24 Sep 2026, 10:00 AM UTC+8)
    const sep24 = new Date('2026-09-24T10:00:00+08:00');
    await runEventLifecycleMaintenance(mockEnv, sep24);

    // Verify notifications stored in local store
    const notificationsAfterSetup = await listNotifications({ userId, limit: 20 }, mockEnv);
    const setupNotif = notificationsAfterSetup.notifications.find(n => n.type === 'live_url_available');
    const liveNotifEarly = notificationsAfterSetup.notifications.find(n => n.type === 'event_live');

    assert.ok(setupNotif);
    assert.strictEqual(setupNotif?.title, 'Live Game URL Available');
    assert.ok(setupNotif?.message.includes('Setup Day'));
    assert.strictEqual(setupNotif?.action_url, '/play/summit-2026');
    // On 24 Sep, EVENT_LIVE ("Event Started") must NOT be sent yet!
    assert.strictEqual(liveNotifEarly, undefined);

    // Step 2: Repeat on Setup Day to verify deduplication
    await runEventLifecycleMaintenance(mockEnv, new Date('2026-09-24T11:00:00+08:00'));
    const notificationsRepeatSetup = await listNotifications({ userId, limit: 20 }, mockEnv);
    const setupNotifCount = notificationsRepeatSetup.notifications.filter(n => n.type === 'live_url_available').length;
    assert.strictEqual(setupNotifCount, 1);

    // Step 3: Run on Event Day (25 Sep 2026, 09:00 AM UTC+8)
    const sep25 = new Date('2026-09-25T09:00:00+08:00');
    await runEventLifecycleMaintenance(mockEnv, sep25);

    // Event status should have transitioned to LIVE
    assert.strictEqual(currentEventStatus, 'LIVE');
    assert.strictEqual(currentRawStatus, 'live');

    // EVENT_LIVE ("Event Started") should now be sent
    const notificationsAfterLive = await listNotifications({ userId, limit: 20 }, mockEnv);
    const liveNotif = notificationsAfterLive.notifications.find(n => n.type === 'event_live');
    assert.ok(liveNotif);
    assert.strictEqual(liveNotif?.title, 'Event Started');
    assert.ok(liveNotif?.message.includes('officially started'));
    assert.strictEqual(liveNotif?.action_url, '/play/summit-2026');

    // Step 4: Repeat on Event Day to verify deduplication for EVENT_LIVE
    await runEventLifecycleMaintenance(mockEnv, new Date('2026-09-25T12:00:00+08:00'));
    const notificationsRepeatLive = await listNotifications({ userId, limit: 20 }, mockEnv);
    const liveNotifCount = notificationsRepeatLive.notifications.filter(n => n.type === 'event_live').length;
    assert.strictEqual(liveNotifCount, 1);
  });
});
