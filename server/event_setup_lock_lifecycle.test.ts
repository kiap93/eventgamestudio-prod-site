import assert from 'node:assert';
import worker from '../worker.js';
import { signAppToken } from './auth.js';
import { createUser } from './db/users.js';
import { createOrganization } from './db/organizations.js';
import { ensureDefaultGame } from './db/games.js';
import { createTheme } from './db/themes.js';
import {
  createEvent,
  getEventById,
  updateEvent,
  cancelEvent,
  runEventLifecycleMaintenance,
  deriveEventLifecycleStatus,
} from './db/events.js';
import { calculateEventStatus } from '../src/lib/dateUtils.js';

let passed = 0;
let failed = 0;

function test(description: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`  ✓ ${description}`);
      passed++;
    })
    .catch((err) => {
      console.error(`  ✗ ${description}`);
      console.error(err);
      failed++;
    });
}

async function runEventSetupLockLifecycleTests() {
  console.log('======================================================');
  console.log('Running Event Setup Lock & Automatic Lifecycle Tests');
  console.log('======================================================\n');

  const workerEnv: Record<string, any> = {
    JWT_SECRET: 'test_jwt_secret_key_32_bytes_long_minimum!!',
    SUPABASE_URL: 'https://placeholder.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'placeholder_key',
    RATE_LIMIT_DISABLED: 'true',
  };

  const user = await createUser({
    email: `owner_${Date.now()}@example.com`,
    name: 'Event Owner',
  }, workerEnv);

  const org = await createOrganization({
    name: 'Lock Test Org',
    owner_id: user.id,
  }, workerEnv);

  const game = await ensureDefaultGame(org.id, 'Lock Test Game', workerEnv);
  const theme = await createTheme({
    organization_id: org.id,
    game_id: game.id,
    name: 'Lock Test Theme',
    slug: `theme-lock-${Date.now()}`,
  }, workerEnv);

  const theme2 = await createTheme({
    organization_id: org.id,
    game_id: game.id,
    name: 'Lock Test Theme 2',
    slug: `theme-lock-2-${Date.now()}`,
  }, workerEnv);

  const token = await signAppToken(
    user.id,
    org.id,
    'owner',
    workerEnv.JWT_SECRET,
    workerEnv
  );

  // --------------------------------------------------------------------------
  // SECTION 1: Unpaid Event Allows Normal Setup Edits
  // --------------------------------------------------------------------------
  console.log('--- Section 1: Unpaid Event Setup Edits ---');

  const unpaidEvent = await createEvent({
    organization_id: org.id,
    game_id: game.id,
    game_theme_id: theme.id,
    name: 'Unpaid Editable Event',
    event_date: '2026-11-01',
    start_date: '2026-11-01',
    end_date: '2026-11-02',
    startDate: '2026-11-01',
    endDate: '2026-11-02',
    starts_at: '2026-11-01T00:00:00.000Z',
    expires_at: '2026-11-02T23:59:59.999Z',
    status: 'scheduled',
    event_status: 'PENDING_PAYMENT',
    payment_status: 'UNPAID',
    created_by: user.id,
    event_price: 1400,
  }, workerEnv);

  await test('1a. Owner can update event setup (name, theme, dates) for UNPAID event', async () => {
    const req = new Request(`http://localhost/api/events/${unpaidEvent.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: 'Updated Unpaid Name',
        game_theme_id: theme2.id,
        start_date: '2026-11-03',
        end_date: '2026-11-04',
      }),
    });

    const res = await worker.fetch(req, workerEnv, {} as any);
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const json = (await res.json()) as any;
    assert.strictEqual(json.event.name, 'Updated Unpaid Name');
    assert.strictEqual(json.event.game_theme_id, theme2.id);
    assert.strictEqual(json.event.start_date, '2026-11-03');
  });

  // --------------------------------------------------------------------------
  // SECTION 2: Paid Event Locks Manual Admin Changes
  // --------------------------------------------------------------------------
  console.log('\n--- Section 2: Paid Event Locks Manual Admin Changes ---');

  const paidEvent = await createEvent({
    organization_id: org.id,
    game_id: game.id,
    game_theme_id: theme.id,
    name: 'Paid Activated Event',
    event_date: '2026-11-10',
    start_date: '2026-11-10',
    end_date: '2026-11-12',
    startDate: '2026-11-10',
    endDate: '2026-11-12',
    starts_at: '2026-11-10T00:00:00.000Z',
    expires_at: '2026-11-12T23:59:59.999Z',
    status: 'scheduled',
    event_status: 'SCHEDULED',
    payment_status: 'PAID',
    paid_amount: 1400,
    created_by: user.id,
    event_price: 1400,
  }, workerEnv);

  await test('2a. PUT /api/events/:id rejected with 403 and EVENT_LOCKED_AFTER_PAYMENT for paid event', async () => {
    const req = new Request(`http://localhost/api/events/${paidEvent.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: 'Hacked Name Change',
      }),
    });

    const res = await worker.fetch(req, workerEnv, {} as any);
    assert.strictEqual(res.status, 403, `Expected 403, got ${res.status}`);
    const json = (await res.json()) as any;
    assert.strictEqual(json.code, 'EVENT_LOCKED_AFTER_PAYMENT');
    assert.ok(json.error.includes('Event setup cannot be modified after payment'));
  });

  await test('2b. PATCH /api/events/:id rejected with 403 and EVENT_LOCKED_AFTER_PAYMENT for paid event', async () => {
    const req = new Request(`http://localhost/api/events/${paidEvent.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        game_theme_id: theme2.id,
      }),
    });

    const res = await worker.fetch(req, workerEnv, {} as any);
    assert.strictEqual(res.status, 403, `Expected 403, got ${res.status}`);
    const json = (await res.json()) as any;
    assert.strictEqual(json.code, 'EVENT_LOCKED_AFTER_PAYMENT');
  });

  await test('2c. Admin manual status change (Active -> Draft) is BLOCKED after payment', async () => {
    const req = new Request(`http://localhost/api/events/${paidEvent.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        status: 'draft',
      }),
    });

    const res = await worker.fetch(req, workerEnv, {} as any);
    assert.strictEqual(res.status, 403, `Expected 403, got ${res.status}`);
    const json = (await res.json()) as any;
    assert.strictEqual(json.code, 'EVENT_LOCKED_AFTER_PAYMENT');
  });

  await test('2d. Direct updateEvent throws EVENT_LOCKED_AFTER_PAYMENT on paid event without system lifecycle flag', async () => {
    let threw = false;
    try {
      await updateEvent(
        paidEvent.id,
        { name: 'Direct Bypassed Name' },
        workerEnv
      );
    } catch (err: any) {
      threw = true;
      assert.strictEqual(err.code, 'EVENT_LOCKED_AFTER_PAYMENT');
      assert.strictEqual(err.status, 403);
    }
    assert.ok(threw, 'Direct updateEvent must throw EVENT_LOCKED_AFTER_PAYMENT');
  });

  // --------------------------------------------------------------------------
  // SECTION 3: System Automatic Lifecycle Transitions Continue To Work
  // --------------------------------------------------------------------------
  console.log('\n--- Section 3: Automatic System Lifecycle Transitions ---');

  await test('3a. deriveEventLifecycleStatus: Paid + event date passed -> COMPLETED (ALLOWED)', () => {
    const pastPaidEvent: any = {
      payment_status: 'PAID',
      start_date: '2026-08-01',
      end_date: '2026-08-02',
      starts_at: '2026-08-01T00:00:00.000Z',
      expires_at: '2026-08-02T23:59:59.999Z',
    };
    const now = new Date('2026-08-03T12:00:00.000Z');
    const status = deriveEventLifecycleStatus(pastPaidEvent, now);
    assert.strictEqual(status, 'COMPLETED');
  });

  await test('3b. calculateEventStatus: Paid + event date passed -> completed (ALLOWED)', () => {
    const pastPaidEvent: any = {
      payment_status: 'PAID',
      start_date: '2026-08-01',
      end_date: '2026-08-02',
      starts_at: '2026-08-01T00:00:00.000Z',
      expires_at: '2026-08-02T23:59:59.999Z',
    };
    const now = new Date('2026-08-03T12:00:00.000Z');
    const status = calculateEventStatus(pastPaidEvent, now);
    assert.strictEqual(status, 'completed');
  });

  await test('3c. deriveEventLifecycleStatus: Unpaid + event date passed -> EXPIRED (ALLOWED)', () => {
    const pastUnpaidEvent: any = {
      payment_status: 'UNPAID',
      start_date: '2026-08-01',
      end_date: '2026-08-02',
      starts_at: '2026-08-01T00:00:00.000Z',
      expires_at: '2026-08-02T23:59:59.999Z',
    };
    const now = new Date('2026-08-03T12:00:00.000Z');
    const status = deriveEventLifecycleStatus(pastUnpaidEvent, now);
    assert.strictEqual(status, 'EXPIRED');
  });

  await test('3d. calculateEventStatus: Unpaid + event date passed -> expired (ALLOWED)', () => {
    const pastUnpaidEvent: any = {
      payment_status: 'UNPAID',
      start_date: '2026-08-01',
      end_date: '2026-08-02',
      starts_at: '2026-08-01T00:00:00.000Z',
      expires_at: '2026-08-02T23:59:59.999Z',
    };
    const now = new Date('2026-08-03T12:00:00.000Z');
    const status = calculateEventStatus(pastUnpaidEvent, now);
    assert.strictEqual(status, 'expired');
  });

  await test('3e. deriveEventLifecycleStatus: Paid + current date within event window -> LIVE (ALLOWED)', () => {
    const activePaidEvent: any = {
      payment_status: 'PAID',
      start_date: '2026-09-08',
      end_date: '2026-09-10',
      starts_at: '2026-09-08T00:00:00.000Z',
      expires_at: '2026-09-10T23:59:59.999Z',
    };
    const now = new Date('2026-09-09T12:00:00.000Z');
    const status = deriveEventLifecycleStatus(activePaidEvent, now);
    assert.strictEqual(status, 'LIVE');
  });

  await test('3f. System runEventLifecycleMaintenance transitions past events without lock blocking', async () => {
    const pastEventRecord = await createEvent({
      organization_id: org.id,
      game_id: game.id,
      game_theme_id: theme.id,
      name: 'Past Paid Event for Maintenance',
      event_date: '2026-11-20',
      start_date: '2026-11-20',
      end_date: '2026-11-21',
      startDate: '2026-11-20',
      endDate: '2026-11-21',
      starts_at: '2026-11-20T00:00:00.000Z',
      expires_at: '2026-11-21T23:59:59.999Z',
      status: 'scheduled',
      event_status: 'SCHEDULED',
      payment_status: 'PAID',
      paid_amount: 1400,
      created_by: user.id,
      event_price: 1400,
    }, workerEnv);

    // Run system lifecycle maintenance simulated after the event has passed
    const maintenanceResult = await runEventLifecycleMaintenance(workerEnv, new Date('2026-11-25T00:00:00.000Z'));
    assert.ok(maintenanceResult.completedCount >= 1, 'At least 1 completed event transitioned');

    const updated = await getEventById(pastEventRecord.id, workerEnv);
    assert.ok(updated, 'Updated event must exist');
    assert.strictEqual(updated.event_status, 'COMPLETED');
    assert.strictEqual(updated.status, 'completed');
  });

  await test('3g. Direct updateEvent with { isSystemLifecycle: true } allows system lifecycle transitions', async () => {
    const systemUpdated = await updateEvent(
      paidEvent.id,
      {
        status: 'completed',
        event_status: 'COMPLETED',
      },
      workerEnv,
      { isSystemLifecycle: true }
    );
    assert.strictEqual(systemUpdated.status, 'completed');
    assert.strictEqual(systemUpdated.event_status, 'COMPLETED');
  });

  console.log('\n======================================================');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('======================================================\n');

  if (failed > 0) {
    throw new Error(`${failed} tests failed`);
  }
}

runEventSetupLockLifecycleTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
