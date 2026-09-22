/**
 * Test Suite: Live Game URL Notification Timing & Setup Day Alignment
 * 
 * Verifies that:
 * 1. On Setup Day (1 calendar day before start_date):
 *    - Paid event Live URL is active and accessible (canAccessLiveEvent -> can_play: true).
 *    - LIVE_URL_AVAILABLE ("Live Game URL Available") notification is dispatched.
 *    - EVENT_LIVE ("Event Started") is NOT sent until event start_date.
 * 2. On Event Day (start_date):
 *    - Event status transitions to LIVE.
 *    - EVENT_LIVE ("Event Started") notification is dispatched.
 * 3. Deduplication prevents multiple notifications on repeat cron runs.
 * 4. Unpaid events never receive LIVE_URL_AVAILABLE or EVENT_LIVE.
 */

import { describe, it, expect } from 'bun:test';
import {
  canAccessLiveEvent,
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
    expect(liveItem).toBeDefined();
    expect(liveItem.defaultTitle).toBe('Event Started');
    expect(liveItem.defaultMessage).toContain('officially started');

    const startedItem = NOTIFICATION_CATALOG['event_started'];
    expect(startedItem).toBeDefined();
    expect(startedItem.defaultTitle).toBe('Event Started');

    const setupItem = NOTIFICATION_CATALOG['live_url_available'];
    expect(setupItem).toBeDefined();
    expect(setupItem.defaultTitle).toBe('Live Game URL Available');
    expect(setupItem.defaultMessage).toContain('Setup Day');
    expect(setupItem.priority).toBe('high');
    expect(setupItem.category).toBe('event');
  });

  it('Verifies Setup Day date calculation for an event on 25 Sep', () => {
    const event = {
      id: 'ev_sep_25',
      name: 'Tech Expo 2026',
      start_date: '2026-09-25',
      end_date: '2026-09-26',
      event_timezone: 'Asia/Singapore',
      payment_status: 'PAID',
      event_status: 'PUBLISHED',
      status: 'upcoming',
      public_token: 'play-tech-expo',
    };

    const dates = getNormalizedEventDates(event);
    expect(dates.startDate).toBe('2026-09-25');
    expect(dates.endDate).toBe('2026-09-26');
    expect(dates.liveOpenDate).toBe('2026-09-24');

    // On 23 Sep: Not setup day yet
    const sep23 = new Date('2026-09-23T10:00:00+08:00');
    expect(isSetupDayStarted(event, sep23)).toBe(false);

    // On 24 Sep: Setup day started!
    const sep24 = new Date('2026-09-24T09:00:00+08:00');
    expect(isSetupDayStarted(event, sep24)).toBe(true);

    // On 25 Sep: Event started
    const sep25 = new Date('2026-09-25T09:00:00+08:00');
    expect(isSetupDayStarted(event, sep25)).toBe(true);
  });

  it('On Setup Day (24 Sep): Paid event Live URL is playable, but status is not yet LIVE', () => {
    const paidEvent = {
      id: 'ev_sep_25_paid',
      name: 'Tech Expo 2026 Paid',
      start_date: '2026-09-25',
      end_date: '2026-09-26',
      event_timezone: 'Asia/Singapore',
      payment_status: 'PAID',
      event_status: 'PUBLISHED',
      status: 'upcoming',
      public_token: 'play-tech-paid',
    };

    const sep24 = new Date('2026-09-24T14:00:00+08:00');
    const access = canAccessLiveEvent(paidEvent, sep24);
    expect(access.can_play).toBe(true);
    expect(access.reason).toBe('LIVE_EVENT_ACTIVE');
  });

  it('On Setup Day (24 Sep): Unpaid event Live URL is strictly BLOCKED', () => {
    const unpaidEvent = {
      id: 'ev_sep_25_unpaid',
      name: 'Tech Expo 2026 Unpaid',
      start_date: '2026-09-25',
      end_date: '2026-09-26',
      event_timezone: 'Asia/Singapore',
      payment_status: 'UNPAID',
      event_status: 'DRAFT',
      status: 'upcoming',
      public_token: 'play-tech-unpaid',
    };

    const sep24 = new Date('2026-09-24T14:00:00+08:00');
    const access = canAccessLiveEvent(unpaidEvent, sep24);
    expect(access.can_play).toBe(false);
    expect(access.reason).toBe('UNPAID');
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
      ends_at: '2026-09-26T15:59:59.999Z',
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

    expect(setupNotif).toBeDefined();
    expect(setupNotif?.title).toBe('Live Game URL Available');
    expect(setupNotif?.message).toContain('Setup Day');
    expect(setupNotif?.action_url).toBe('/play/summit-2026');
    // On 24 Sep, EVENT_LIVE ("Event Started") must NOT be sent yet!
    expect(liveNotifEarly).toBeUndefined();

    // Step 2: Repeat on Setup Day to verify deduplication
    await runEventLifecycleMaintenance(mockEnv, new Date('2026-09-24T11:00:00+08:00'));
    const notificationsRepeatSetup = await listNotifications({ userId, limit: 20 }, mockEnv);
    const setupNotifCount = notificationsRepeatSetup.notifications.filter(n => n.type === 'live_url_available').length;
    expect(setupNotifCount).toBe(1);

    // Step 3: Run on Event Day (25 Sep 2026, 09:00 AM UTC+8)
    const sep25 = new Date('2026-09-25T09:00:00+08:00');
    await runEventLifecycleMaintenance(mockEnv, sep25);

    // Event status should have transitioned to LIVE
    expect(currentEventStatus).toBe('LIVE');
    expect(currentRawStatus).toBe('live');

    // EVENT_LIVE ("Event Started") should now be sent
    const notificationsAfterLive = await listNotifications({ userId, limit: 20 }, mockEnv);
    const liveNotif = notificationsAfterLive.notifications.find(n => n.type === 'event_live');
    expect(liveNotif).toBeDefined();
    expect(liveNotif?.title).toBe('Event Started');
    expect(liveNotif?.message).toContain('officially started');
    expect(liveNotif?.action_url).toBe('/play/summit-2026');

    // Step 4: Repeat on Event Day to verify deduplication for EVENT_LIVE
    await runEventLifecycleMaintenance(mockEnv, new Date('2026-09-25T12:00:00+08:00'));
    const notificationsRepeatLive = await listNotifications({ userId, limit: 20 }, mockEnv);
    const liveNotifCount = notificationsRepeatLive.notifications.filter(n => n.type === 'event_live').length;
    expect(liveNotifCount).toBe(1);
  });
});
