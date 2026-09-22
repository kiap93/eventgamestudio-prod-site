import { describe, it } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import {
  createEvent,
  getEventById,
  deriveEventLifecycleStatus,
  canAccessLiveEvent,
  getClientLiveGameAccessDetails,
  runEventLifecycleMaintenance,
  localEventsCache,
} from './events.js';
import { createOrganization } from './organizations.js';
import { createTheme } from './themes.js';
import { createTopup, processEventPayment, getWalletBalance } from './wallet.js';

describe('Decouple Payment Activation from Event Lifecycle', () => {
  it('should set event_status=SCHEDULED and status=scheduled upon payment, and transition to LIVE only on start date', async () => {
    const env = {
      NODE_ENV: 'test',
      ALLOW_TEST_LOCAL_STORE: 'true',
    };

    // 1. Create Organization & Theme
    const orgOwnerId = crypto.randomUUID();
    const org = await createOrganization(
      {
        name: 'Decoupled Lifecycle Org',
        owner_id: orgOwnerId,
        country_code: 'MY',
      },
      env
    );

    const theme = await createTheme(
      {
        organization_id: org.id,
        game_id: 'catch-brand',
        name: 'Carnival Theme',
        slug: `carnival-${Date.now()}`,
      },
      env
    );

    // 2. Fund organization wallet
    await createTopup(
      {
        organizationId: org.id,
        amount: 5000,
        referenceId: `topup_lifecycle_${Date.now()}`,
      },
      env
    );

    const wallet = await getWalletBalance(org.id, env);
    assert.ok(wallet.paid_balance >= 1400, 'Org wallet must have sufficient funds');

    // 3. Create Event for future dates (e.g., 30 Sep to 01 Oct 2026)
    // Simulated current date: 2026-09-22
    const startDate = '2026-09-30';
    const endDate = '2026-10-01';
    const startsAt = '2026-09-30T00:00:00.000Z';
    const expiresAt = '2026-10-01T23:59:59.999Z';

    const event = await createEvent(
      {
        organization_id: org.id,
        game_theme_id: theme.id,
        name: 'Annual Tech Festival 2026',
        start_date: startDate,
        end_date: endDate,
        starts_at: startsAt,
        expires_at: expiresAt,
        event_price: 1400,
        event_currency: 'MYR',
        currentDate: '2026-09-22',
      },
      env
    );

    assert.strictEqual(event.payment_status, 'UNPAID', 'Initial payment status must be UNPAID');
    assert.strictEqual(event.event_status, 'DRAFT', 'Initial lifecycle status must be DRAFT');
    assert.strictEqual(event.status, 'draft', 'Initial status must be draft');

    // 4. Complete Payment on 2026-09-22
    const paymentResult = await processEventPayment(
      {
        organizationId: org.id,
        eventId: event.id,
        paymentMode: 'FULL_PAID',
        eventPrice: 1400,
      },
      env
    );

    assert.strictEqual(paymentResult.success, true, 'Payment must succeed');

    // 5. Verify event state right after payment
    // Must be payment_status = PAID, event_status = SCHEDULED, status = scheduled
    const paidEvent = await getEventById(event.id, env);
    assert.ok(paidEvent, 'Event must exist');
    assert.strictEqual(paidEvent.payment_status, 'PAID', 'Payment status must be PAID');
    assert.strictEqual(
      paidEvent.event_status,
      'SCHEDULED',
      'Lifecycle event_status must be SCHEDULED (NOT LIVE) before actual start date'
    );
    assert.strictEqual(
      paidEvent.status,
      'scheduled',
      'Event status must be scheduled (NOT live) before actual start date'
    );

    // 6. Access Control: Before Setup Day (e.g. 2026-09-27)
    // Should NOT be accessible publicly (EVENT_NOT_OPEN)
    const preSetupAccessBool = canAccessLiveEvent(paidEvent, '2026-09-27');
    assert.strictEqual(preSetupAccessBool, false, 'Pre-setup day access must be blocked');
    const preSetupAccessDetails = getClientLiveGameAccessDetails(paidEvent, '2026-09-27');
    assert.strictEqual(preSetupAccessDetails.canAccess, false, 'Pre-setup day access must be blocked');
    assert.strictEqual(preSetupAccessDetails.code, 'EVENT_NOT_OPEN', 'Pre-setup day code must be EVENT_NOT_OPEN');

    // 7. Access Control: Setup Day (2026-09-29, 1 day before start_date)
    // Public Live URL is open for testing/setup, but event_status remains SCHEDULED
    const setupDayAccessBool = canAccessLiveEvent(paidEvent, '2026-09-29');
    assert.strictEqual(setupDayAccessBool, true, 'Setup Day access must be permitted for testing');
    const setupDayAccessDetails = getClientLiveGameAccessDetails(paidEvent, '2026-09-29');
    assert.strictEqual(setupDayAccessDetails.canAccess, true, 'Setup Day access must be permitted for testing');
    const setupDayDerived = deriveEventLifecycleStatus(paidEvent, '2026-09-29');
    assert.strictEqual(setupDayDerived, 'SCHEDULED', 'Setup Day lifecycle status must still be SCHEDULED');

    // 8. Event Start Date (2026-09-30)
    // Lifecycle maintenance transitions event to LIVE
    await runEventLifecycleMaintenance(env, new Date('2026-09-30T10:00:00+08:00'));

    const liveEvent = await getEventById(event.id, env);
    assert.ok(liveEvent, 'Event must exist');
    assert.strictEqual(liveEvent.payment_status, 'PAID');
    assert.strictEqual(
      liveEvent.event_status,
      'LIVE',
      'On event start date, lifecycle must transition to LIVE'
    );
    assert.strictEqual(
      liveEvent.status,
      'live',
      'On event start date, status must transition to live'
    );

    // Live access check on start date
    const liveAccess = canAccessLiveEvent(liveEvent, '2026-09-30');
    assert.strictEqual(liveAccess, true, 'Live event must be accessible during event dates');

    // 9. Post Event Date (2026-10-02)
    // Lifecycle maintenance transitions completed event to COMPLETED
    await runEventLifecycleMaintenance(env, new Date('2026-10-02T10:00:00+08:00'));

    const completedEvent = await getEventById(event.id, env);
    assert.ok(completedEvent, 'Event must exist');
    assert.strictEqual(
      completedEvent.event_status,
      'COMPLETED',
      'After event end date, lifecycle must transition to COMPLETED'
    );
    assert.strictEqual(
      completedEvent.status,
      'completed',
      'After event end date, status must transition to completed'
    );
  });
});
