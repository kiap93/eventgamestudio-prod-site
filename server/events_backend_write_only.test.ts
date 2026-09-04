import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import worker from '../worker.js';
import { signAppToken } from './auth.js';
import { createUser } from './db/users.js';
import { createOrganization } from './db/organizations.js';
import { ensureDefaultGame } from './db/games.js';
import { createTheme } from './db/themes.js';
import { createEvent, getEventById } from './db/events.js';

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

async function runEventsBackendWriteOnlyTests() {
  console.log('======================================================');
  console.log('Running Events Backend-Write-Only & RLS Hardening Tests');
  console.log('======================================================\n');

  const migrationPath = path.resolve(
    process.cwd(),
    'supabase/migrations/20260904030000_events_backend_write_only.sql'
  );
  const baselinePath = path.resolve(
    process.cwd(),
    'supabase/migrations/20260903000000_initial_baseline.sql'
  );
  const schemaPath = path.resolve(process.cwd(), 'supabase/schema.sql');

  // --------------------------------------------------------------------------
  // SECTION 1: Migration & Schema Policy Hardening
  // --------------------------------------------------------------------------
  console.log('--- Section 1: Migration & Schema Policy Hardening ---');

  await test('1a. Migration 20260904030000_events_backend_write_only.sql exists', () => {
    assert.ok(fs.existsSync(migrationPath), 'Migration file must exist');
  });

  await test('1b. Migration drops vulnerable client mutation policies on public.events', () => {
    const content = fs.readFileSync(migrationPath, 'utf-8');
    assert.ok(
      content.includes('DROP POLICY IF EXISTS "Owners, admins, designers can insert events" ON public.events'),
      'Must drop client insert policy'
    );
    assert.ok(
      content.includes('DROP POLICY IF EXISTS "Owners, admins, designers can update events" ON public.events'),
      'Must drop client update policy'
    );
    assert.ok(
      content.includes('DROP POLICY IF EXISTS "Owners and admins can delete events" ON public.events'),
      'Must drop client delete policy'
    );
  });

  await test('1c. Migration revokes direct table mutation privileges from client roles', () => {
    const content = fs.readFileSync(migrationPath, 'utf-8');
    assert.ok(
      content.includes('REVOKE INSERT, UPDATE, DELETE ON public.events FROM authenticated'),
      'Must revoke mutations from authenticated'
    );
    assert.ok(
      content.includes('REVOKE INSERT, UPDATE, DELETE ON public.events FROM anon'),
      'Must revoke mutations from anon'
    );
    assert.ok(
      content.includes('GRANT SELECT ON public.events TO authenticated'),
      'Must preserve SELECT for authenticated'
    );
  });

  await test('1d. Migration installs defense-in-depth trigger protecting sensitive columns', () => {
    const content = fs.readFileSync(migrationPath, 'utf-8');
    assert.ok(
      content.includes('CREATE OR REPLACE FUNCTION public.prevent_event_unauthorized_client_mutations'),
      'Must create trigger function'
    );
    assert.ok(
      content.includes('trg_prevent_event_unauthorized_client_mutations'),
      'Must attach trigger to public.events'
    );
    const sensitiveColumns = [
      'payment_status',
      'event_status',
      'status',
      'paid_amount',
      'discount_amount',
      'event_price',
      'payment_mode',
      'cancel_reason',
      'organization_id',
      'public_token',
    ];
    for (const col of sensitiveColumns) {
      assert.ok(
        content.includes(col),
        `Trigger function must explicitly protect sensitive column ${col}`
      );
    }
  });

  await test('1e. Baseline migration and schema.sql do not contain vulnerable client mutation policies', () => {
    const baseline = fs.readFileSync(baselinePath, 'utf-8');
    const schema = fs.readFileSync(schemaPath, 'utf-8');

    for (const [name, content] of [['baseline', baseline], ['schema.sql', schema]]) {
      assert.ok(
        !content.includes('CREATE POLICY "Owners, admins, designers can insert events"'),
        `${name} must not contain vulnerable insert policy`
      );
      assert.ok(
        !content.includes('CREATE POLICY "Owners, admins, designers can update events"'),
        `${name} must not contain vulnerable update policy`
      );
      assert.ok(
        !content.includes('CREATE POLICY "Owners and admins can delete events"'),
        `${name} must not contain vulnerable delete policy`
      );
      assert.ok(
        content.includes('REVOKE INSERT, UPDATE, DELETE ON public.events FROM authenticated'),
        `${name} must revoke client mutations`
      );
    }
  });

  // --------------------------------------------------------------------------
  // SECTION 2: Worker API Attack Scenarios (Client Cannot Bypass via Worker)
  // --------------------------------------------------------------------------
  console.log('\n--- Section 2: Worker API Attack Scenarios & Guard Verification ---');

  const workerEnv = {
    JWT_SECRET: '0123456789abcdef0123456789abcdef',
    SUPABASE_URL: 'https://placeholder.supabase.co',
    SUPABASE_ANON_KEY: 'placeholder-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'placeholder-service-key',
    NODE_ENV: 'development',
  };

  const user = await createUser({
    email: `event_org_owner_${Date.now()}@example.com`,
    name: 'Event Organizer',
    is_developer: false,
  }, workerEnv);

  const org = await createOrganization({
    name: 'Secure Events Org',
    owner_id: user.id,
  }, workerEnv);

  const game = await ensureDefaultGame(org.id, 'Test Game', workerEnv);
  const theme = await createTheme({
    organization_id: org.id,
    game_id: game.id,
    name: 'Safe Theme',
  }, workerEnv);

  const token = await signAppToken(
    user.id,
    org.id,
    'owner',
    workerEnv.JWT_SECRET,
    workerEnv
  );

  await test('2a. Worker rejects POST /api/events with payment_status = PAID', async () => {
    const maliciousPayload = {
      name: 'Hacked Paid Event',
      game_id: game.id,
      game_theme_id: theme.id,
      start_date: '2026-10-01',
      end_date: '2026-10-02',
      payment_status: 'PAID',
    };

    const req = new Request('http://localhost/api/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(maliciousPayload),
    });

    const res = await worker.fetch(req, workerEnv, {} as any);
    assert.strictEqual(res.status, 400, 'Must respond with 400 Bad Request');
    const json = (await res.json()) as any;
    assert.ok(
      json.error.includes('Direct initialization of event payment'),
      'Error message must explain policy violation'
    );
  });

  await test('2b. Worker rejects POST /api/events with event_status = LIVE or status = live', async () => {
    const maliciousPayload = {
      name: 'Hacked Live Event',
      game_id: game.id,
      game_theme_id: theme.id,
      start_date: '2026-10-01',
      end_date: '2026-10-02',
      event_status: 'LIVE',
      status: 'live',
    };

    const req = new Request('http://localhost/api/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(maliciousPayload),
    });

    const res = await worker.fetch(req, workerEnv, {} as any);
    assert.strictEqual(res.status, 400, 'Must respond with 400 Bad Request');
  });

  await test('2c. Worker rejects POST /api/events with paid_amount or payment_mode injected', async () => {
    const maliciousPayload = {
      name: 'Hacked Amount Event',
      game_id: game.id,
      game_theme_id: theme.id,
      start_date: '2026-10-01',
      end_date: '2026-10-02',
      paid_amount: 1400,
      payment_mode: 'WALLET',
    };

    const req = new Request('http://localhost/api/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(maliciousPayload),
    });

    const res = await worker.fetch(req, workerEnv, {} as any);
    assert.strictEqual(res.status, 400, 'Must respond with 400 Bad Request');
  });

  // Create a real initial event in memory via Service Role
  const createdEvent = await createEvent({
    organization_id: org.id,
    game_id: game.id,
    game_theme_id: theme.id,
    name: 'Authoritative Safe Event',
    event_date: '2026-10-01',
    start_date: '2026-10-01',
    end_date: '2026-10-02',
    startDate: '2026-10-01',
    endDate: '2026-10-02',
    starts_at: '2026-10-01T00:00:00.000Z',
    expires_at: '2026-10-02T23:59:59.999Z',
    status: 'draft',
    event_status: 'DRAFT',
    payment_status: 'UNPAID',
    created_by: user.id,
    event_price: 1400,
  }, workerEnv);

  await test('2d. Worker rejects PUT /api/events/:id attempting to flip payment_status to PAID', async () => {
    const req = new Request(`http://localhost/api/events/${createdEvent.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        payment_status: 'PAID',
      }),
    });

    const res = await worker.fetch(req, workerEnv, {} as any);
    assert.strictEqual(res.status, 400, 'Must reject with 400 Bad Request');
    const json = (await res.json()) as any;
    assert.ok(
      json.error.includes("Modifying protected field 'payment_status' is strictly prohibited"),
      `Error must reject payment_status modification: ${json.error}`
    );
  });

  await test('2e. Worker rejects PATCH /api/events/:id attempting to alter event_price or discount_amount', async () => {
    const req = new Request(`http://localhost/api/events/${createdEvent.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        event_price: 10,
        discount_amount: 1390,
      }),
    });

    const res = await worker.fetch(req, workerEnv, {} as any);
    assert.strictEqual(res.status, 400, 'Must reject with 400 Bad Request');
    const json = (await res.json()) as any;
    assert.ok(
      json.error.includes('Modifying protected field'),
      `Error must reject pricing mutation: ${json.error}`
    );
  });

  await test('2f. Worker rejects attempts to modify organization_id, cancel_reason, or public_token', async () => {
    const sensitiveAttempts = [
      { organization_id: '11111111-1111-1111-1111-111111111111' },
      { cancel_reason: 'fraud_override' },
      { public_token: 'malicious_token' },
      { status: 'live' },
    ];

    for (const payload of sensitiveAttempts) {
      const req = new Request(`http://localhost/api/events/${createdEvent.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const res = await worker.fetch(req, workerEnv, {} as any);
      assert.strictEqual(res.status, 400, `Must reject ${Object.keys(payload)[0]} with 400`);
    }
  });

  await test('2g. Worker allows legitimate updates to event name and event dates', async () => {
    const req = new Request(`http://localhost/api/events/${createdEvent.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: 'Renamed Legitimate Event',
        start_date: '2026-10-05',
        end_date: '2026-10-06',
      }),
    });

    const res = await worker.fetch(req, workerEnv, {} as any);
    assert.strictEqual(res.status, 200, 'Must accept valid event parameter update');
    const json = (await res.json()) as any;
    assert.strictEqual(json.event.name, 'Renamed Legitimate Event');
  });

  // --------------------------------------------------------------------------
  // SECTION 3: Service-Role Exclusivity
  // --------------------------------------------------------------------------
  console.log('\n--- Section 3: Service Role Exclusivity Verification ---');

  await test('3a. Stored event retains payment_status = UNPAID after failed attack attempts', async () => {
    const verified = await getEventById(createdEvent.id, workerEnv);
    assert.ok(verified, 'Event must exist');
    assert.strictEqual(verified.payment_status, 'UNPAID', 'Payment status must remain UNPAID');
    assert.strictEqual(verified.event_status, 'DRAFT', 'Event status must remain DRAFT');
  });

  console.log('\n======================================================');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('======================================================\n');

  if (failed > 0) {
    throw new Error(`${failed} tests failed`);
  }
}

runEventsBackendWriteOnlyTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
