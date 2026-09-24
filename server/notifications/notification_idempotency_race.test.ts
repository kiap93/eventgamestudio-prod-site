/**
 * Concurrency & Database-Level Idempotency Test Suite for Notifications
 *
 * Verifies:
 * 1. Database-level UNIQUE(recipient_user_id, deduplication_key) + ON CONFLICT DO NOTHING semantics.
 * 2. Elimination of the classic race condition:
 *    Request A -> doesn't find notification
 *    Request B -> doesn't find notification
 *    Request A -> INSERT
 *    Request B -> INSERT (Blocked by DB unique constraint / resolved via ON CONFLICT DO NOTHING)
 * 3. Prevention of duplicate email/push adapter dispatch on concurrent worker/cron execution.
 * 4. Preservation of identical notification record across concurrent callers.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { createNotification, getNotificationByDeduplicationKey, listNotifications } from '../db/notifications.js';
import { NotificationDispatcher, dispatchNotificationEvent } from './dispatcher.js';
import type { NotificationChannelAdapter } from './types.js';
import fs from 'node:fs';
import path from 'node:path';

describe('Notification DB-Level Idempotency & Race Protection', () => {
  const mockEnv = { ALLOW_LOCAL_FALLBACK: 'true' };

  it('handles concurrent createNotification calls atomically with ON CONFLICT DO NOTHING semantics', async () => {
    const testUserId = `user_race_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const dedupKey = `dedup_race_${Date.now()}`;

    // Launch 10 concurrent insertion attempts with the exact same deduplication key
    const concurrency = 10;
    const promises = Array.from({ length: concurrency }).map((_, i) =>
      createNotification(
        {
          recipientUserId: testUserId,
          type: 'event_live',
          title: `Concurrent Event ${i}`,
          message: 'Your event is live now.',
          priority: 'high',
          deduplicationKey: dedupKey,
        },
        mockEnv
      )
    );

    const results = await Promise.all(promises);

    // Verify all 10 calls succeeded without throwing errors
    expect(results.length).toBe(concurrency);

    // Verify all returned records share the exact same ID (idempotent result)
    const canonicalId = results[0].id;
    for (const res of results) {
      expect(res.id).toBe(canonicalId);
      expect(res.recipient_user_id).toBe(testUserId);
      expect(res.deduplication_key).toBe(dedupKey);
    }

    // Verify exactly ONE call was newly inserted (is_inserted === true), and the other 9 were conflicts (is_inserted === false)
    const insertedCount = results.filter((r) => r.is_inserted === true).length;
    const conflictCount = results.filter((r) => r.is_inserted === false).length;

    expect(insertedCount).toBe(1);
    expect(conflictCount).toBe(concurrency - 1);

    // Verify storage only contains 1 notification for this user
    const list = await listNotifications({ userId: testUserId }, mockEnv);
    const userNotifications = list.notifications.filter((n) => n.deduplication_key === dedupKey);
    expect(userNotifications.length).toBe(1);
  });

  it('prevents duplicate secondary channel delivery (email/push) when dispatcher executions race', async () => {
    const dispatcher = NotificationDispatcher.getInstance();

    let adapterSendCallCount = 0;
    const sentRecordIds: string[] = [];

    const mockAdapter: NotificationChannelAdapter = {
      name: 'test_spy_adapter',
      enabled: true,
      send: async (record) => {
        adapterSendCallCount++;
        sentRecordIds.push(record.id);
      },
    };

    dispatcher.registerAdapter(mockAdapter);

    const testUserId = `user_dispatch_race_${Date.now()}`;
    const testOrgId = `org_dispatch_race_${Date.now()}`;
    const testRef = `ref_race_${Date.now()}`;

    // Simulate 5 overlapping Worker cron executions triggering the exact same payment success notification
    const dispatchPromises = Array.from({ length: 5 }).map(() =>
      dispatcher.dispatch(
        {
          eventType: 'PAYMENT_SUCCESS',
          recipientUserId: testUserId,
          organizationId: testOrgId,
          referenceId: testRef,
          amount: 1400,
          subject: 'Standard Event Package',
        },
        mockEnv
      )
    );

    const dispatchResults = await Promise.all(dispatchPromises);

    // Total notifications returned across all dispatches
    const flattenedCreated = dispatchResults.flat();

    // Exactly 1 dispatch should have created and reported the notification
    expect(flattenedCreated.length).toBe(1);
    expect(flattenedCreated[0].recipient_user_id).toBe(testUserId);

    // The secondary adapter MUST have been invoked exactly ONCE, never duplicated
    expect(adapterSendCallCount).toBe(1);
    expect(sentRecordIds.length).toBe(1);
    expect(sentRecordIds[0]).toBe(flattenedCreated[0].id);
  });

  it('allows different non-conflicting deduplication keys for the same recipient', async () => {
    const testUserId = `user_multi_dedup_${Date.now()}`;

    const recordA = await createNotification(
      {
        recipientUserId: testUserId,
        type: 'event_created',
        title: 'Event A Created',
        message: 'Your event A was created.',
        deduplicationKey: `event_a_${Date.now()}`,
      },
      mockEnv
    );

    const recordB = await createNotification(
      {
        recipientUserId: testUserId,
        type: 'event_created',
        title: 'Event B Created',
        message: 'Your event B was created.',
        deduplicationKey: `event_b_${Date.now()}`,
      },
      mockEnv
    );

    expect(recordA.is_inserted).toBe(true);
    expect(recordB.is_inserted).toBe(true);
    expect(recordA.id).not.toBe(recordB.id);

    const list = await listNotifications({ userId: testUserId }, mockEnv);
    expect(list.notifications.length).toBe(2);
  });

  it('allows notifications with NULL deduplication keys without unique constraint collisions', async () => {
    const testUserId = `user_null_dedup_${Date.now()}`;

    const [record1, record2] = await Promise.all([
      createNotification(
        {
          recipientUserId: testUserId,
          type: 'event_live',
          title: 'Live Event 1',
          message: 'No dedup key 1',
          deduplicationKey: null,
        },
        mockEnv
      ),
      createNotification(
        {
          recipientUserId: testUserId,
          type: 'event_live',
          title: 'Live Event 2',
          message: 'No dedup key 2',
          deduplicationKey: null,
        },
        mockEnv
      ),
    ]);

    expect(record1.is_inserted).toBe(true);
    expect(record2.is_inserted).toBe(true);
    expect(record1.id).not.toBe(record2.id);

    const list = await listNotifications({ userId: testUserId }, mockEnv);
    expect(list.notifications.length).toBe(2);
  });

  it('verifies SQL migration and schema files contain UNIQUE constraint and ON CONFLICT DO NOTHING', () => {
    const migrationPath = path.join(
      process.cwd(),
      'supabase/migrations/20260924030000_notification_deduplication_idempotency.sql'
    );
    const schemaPath = path.join(process.cwd(), 'supabase/schema.sql');

    expect(fs.existsSync(migrationPath)).toBe(true);
    const migrationSql = fs.readFileSync(migrationPath, 'utf-8');

    // 1. Database-level UNIQUE constraint on (recipient_user_id, deduplication_key)
    expect(migrationSql).toContain('UNIQUE (recipient_user_id, deduplication_key)');
    expect(migrationSql).toContain('uq_notifications_recipient_dedup');

    // 2. INSERT ... ON CONFLICT DO NOTHING logic
    expect(migrationSql).toContain('ON CONFLICT (recipient_user_id, deduplication_key) DO NOTHING');
    expect(migrationSql).toContain('insert_notification_idempotent');

    // 3. Schema.sql synchronization
    const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
    expect(schemaSql).toContain('UNIQUE (recipient_user_id, deduplication_key)');
    expect(schemaSql).toContain('ON CONFLICT (recipient_user_id, deduplication_key) DO NOTHING');
    expect(schemaSql).toContain('insert_notification_idempotent');
  });
});
