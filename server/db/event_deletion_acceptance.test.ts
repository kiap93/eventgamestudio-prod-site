import assert from 'node:assert';
import {
  canDeleteEvent,
  canCancelEvent,
  determineEventRefund,
  deleteEvent,
  cancelEvent,
  localEventsCache,
  getEventById,
} from './events.js';
import {
  createUser,
  createOrganization,
  addMember,
  createTheme,
  localUsersCache,
  localMembersCache,
  localThemesCache,
} from './index.js';
import {
  getWalletBalance,
  processEventPayment,
  createTopup,
} from './wallet.js';
import { signAppToken } from '../auth.js';
import worker from '../../worker.js';

console.log('======================================================');
console.log('Running Acceptance Tests: Event Deletion Rules');
console.log('======================================================\n');

async function runAcceptanceTests() {
  const env = {
    JWT_SECRET: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    SUPABASE_URL: 'https://placeholder.supabase.co',
    SUPABASE_ANON_KEY: 'placeholder-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'placeholder-service-key',
    NODE_ENV: 'test',
  };

  // 1. Setup organizations and users
  const ownerA = await createUser({ email: 'owner_a@test.com', name: 'Owner A' }, env);
  const ownerB = await createUser({ email: 'owner_b@test.com', name: 'Owner B' }, env);

  const orgA = await createOrganization(
    { name: 'Organization A', owner_id: ownerA.id, country_code: 'MY' },
    env
  );
  const orgB = await createOrganization(
    { name: 'Organization B', owner_id: ownerB.id, country_code: 'MY' },
    env
  );

  const tokenOwnerA = await signAppToken(ownerA.id, orgA.id, 'owner', undefined, env);
  const tokenOwnerB = await signAppToken(ownerB.id, orgB.id, 'owner', undefined, env);

  const themeA = await createTheme(
    { organization_id: orgA.id, name: 'Theme A', game_id: 'catch-brand' },
    env
  );

  let seq = 1;
  function createTestEvent(overrides: Record<string, any>) {
    const id = `ev-del-acc-${seq++}`;
    const base = {
      id,
      organization_id: orgA.id,
      game_id: 'catch-brand',
      game_theme_id: themeA.id,
      name: `Acceptance Event ${id}`,
      start_date: '2026-11-10',
      end_date: '2026-11-12',
      starts_at: '2026-11-09T16:00:00.000Z',
      expires_at: '2026-11-12T15:59:59.999Z',
      status: 'scheduled',
      event_status: 'SCHEDULED',
      payment_status: 'UNPAID',
      paid_amount: 0,
      discount_amount: 0,
      event_price: 1900,
      event_currency: 'MYR',
      public_token: `TOK${id.replace(/-/g, '')}`,
      event_timezone: 'Asia/Singapore',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const ev = { ...base, ...overrides };
    localEventsCache.set(id, ev as any);
    return ev;
  }

  const dateNow = new Date('2026-10-21T10:00:00.000Z');
  const datePast = new Date('2026-11-20T10:00:00.000Z'); // After end_date 2026-11-12

  // --------------------------------------------------------------------------
  // Acceptance Test 1: Newly created unpaid event: deletion allowed
  // --------------------------------------------------------------------------
  console.log('Test 1: Newly created unpaid event -> deletion allowed');
  const ev1 = createTestEvent({
    payment_status: 'UNPAID',
    paid_amount: 0,
    status: 'scheduled',
  });

  const check1 = canDeleteEvent(ev1, dateNow);
  assert.strictEqual(check1.canDelete, true, 'Acceptance 1: canDelete must be true for newly created unpaid event');
  assert.strictEqual(check1.code, 'ELIGIBLE_FOR_DELETION');

  const httpDelRes1 = await worker.fetch(
    new Request(`https://api.eventgamestudio.local/api/events/${ev1.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenOwnerA}` },
    }),
    env
  );
  assert.strictEqual(httpDelRes1.status, 200, 'Acceptance 1: HTTP DELETE must return 200');
  const httpDelData1 = (await httpDelRes1.json()) as any;
  assert.strictEqual(httpDelData1.success, true);
  assert.strictEqual(localEventsCache.has(ev1.id), false, 'Acceptance 1: Event must be removed from cache/db');
  console.log('  ✓ PASS: Newly created unpaid event was deleted successfully.\n');

  // --------------------------------------------------------------------------
  // Acceptance Test 2: Unpaid event with a past event date: deletion allowed
  // --------------------------------------------------------------------------
  console.log('Test 2: Unpaid event with a past event date -> deletion allowed');
  const ev2 = createTestEvent({
    start_date: '2026-10-01',
    end_date: '2026-10-03',
    starts_at: '2026-09-30T16:00:00.000Z',
    expires_at: '2026-10-03T15:59:59.999Z',
    payment_status: 'UNPAID',
    paid_amount: 0,
    status: 'expired',
    event_status: 'EXPIRED',
  });

  const check2 = canDeleteEvent(ev2, dateNow);
  assert.strictEqual(check2.canDelete, true, 'Acceptance 2: canDelete must be true for unpaid event with past event date');
  assert.strictEqual(check2.code, 'ELIGIBLE_FOR_DELETION');
  assert.strictEqual(check2.lifecycle, 'EXPIRED');

  const httpDelRes2 = await worker.fetch(
    new Request(`https://api.eventgamestudio.local/api/events/${ev2.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenOwnerA}` },
    }),
    env
  );
  assert.strictEqual(httpDelRes2.status, 200, 'Acceptance 2: HTTP DELETE must return 200');
  assert.strictEqual(localEventsCache.has(ev2.id), false, 'Acceptance 2: Expired unpaid event must be removed from cache/db');
  console.log('  ✓ PASS: Unpaid event with past event date was deleted successfully.\n');

  // --------------------------------------------------------------------------
  // Acceptance Test 3: Paid event: deletion blocked unless an authorized cancellation/refund workflow exists
  // --------------------------------------------------------------------------
  console.log('Test 3: Paid event -> deletion blocked (must use Cancel & Refund workflow before Setup Day)');
  const ev3 = createTestEvent({
    start_date: '2026-12-01',
    end_date: '2026-12-02',
    starts_at: '2026-11-30T16:00:00.000Z',
    expires_at: '2026-12-02T15:59:59.999Z',
    payment_status: 'PAID',
    paid_amount: 1900,
    status: 'scheduled',
    event_status: 'SCHEDULED',
  });

  const check3 = canDeleteEvent(ev3, dateNow);
  assert.strictEqual(check3.canDelete, false, 'Acceptance 3: canDelete must be false for paid event');
  assert.strictEqual(check3.code, 'EVENT_PAID');

  const httpDelRes3 = await worker.fetch(
    new Request(`https://api.eventgamestudio.local/api/events/${ev3.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenOwnerA}` },
    }),
    env
  );
  assert.strictEqual(httpDelRes3.status, 422, 'Acceptance 3: HTTP DELETE must return 422 on paid event');
  const httpDelData3 = (await httpDelRes3.json()) as any;
  assert.strictEqual(httpDelData3.code, 'EVENT_PAID');
  assert.strictEqual(localEventsCache.has(ev3.id), true, 'Acceptance 3: Paid event must NOT be deleted');

  // Verify authorized cancellation/refund workflow exists for this paid event before Setup Day
  const cancelCheck3 = canCancelEvent(ev3, dateNow);
  assert.strictEqual(cancelCheck3.canCancel, true, 'Acceptance 3: Cancellation workflow is available for paid event');
  assert.strictEqual(cancelCheck3.canRefund, true, 'Acceptance 3: Refund workflow is available for paid event');
  console.log('  ✓ PASS: Paid event deletion is blocked; Cancel & Refund workflow is available.\n');

  // --------------------------------------------------------------------------
  // Acceptance Test 4: Event owned by another organization: deletion blocked
  // --------------------------------------------------------------------------
  console.log('Test 4: Event owned by another organization -> deletion blocked');
  const ev4 = createTestEvent({
    organization_id: orgA.id,
    payment_status: 'UNPAID',
    paid_amount: 0,
    status: 'scheduled',
  });

  // Owner B tries to delete Event belonging to Org A
  const httpDelRes4 = await worker.fetch(
    new Request(`https://api.eventgamestudio.local/api/events/${ev4.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenOwnerB}` },
    }),
    env
  );
  assert.strictEqual(httpDelRes4.status, 403, 'Acceptance 4: HTTP DELETE by another org member must return 403 Forbidden');
  assert.strictEqual(localEventsCache.has(ev4.id), true, 'Acceptance 4: Event must remain intact');
  console.log('  ✓ PASS: Cross-tenant deletion attempt strictly blocked with 403 Forbidden.\n');

  // --------------------------------------------------------------------------
  // Acceptance Test 5: API failure: event remains visible and an error is shown
  // --------------------------------------------------------------------------
  console.log('Test 5: API failure -> event remains visible and error is returned');
  const ev5 = createTestEvent({
    payment_status: 'UNPAID',
    paid_amount: 0,
  });

  // Request without auth token fails with 401
  const failRes1 = await worker.fetch(
    new Request(`https://api.eventgamestudio.local/api/events/${ev5.id}`, {
      method: 'DELETE',
    }),
    env
  );
  assert.strictEqual(failRes1.status, 401, 'Acceptance 5: Unauthenticated delete fails with 401');
  assert.strictEqual(localEventsCache.has(ev5.id), true, 'Acceptance 5: Event remains visible');

  // Request for non-existent event returns 404
  const failRes2 = await worker.fetch(
    new Request(`https://api.eventgamestudio.local/api/events/non-existent-id-12345`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenOwnerA}` },
    }),
    env
  );
  assert.strictEqual(failRes2.status, 404, 'Acceptance 5: Non-existent event returns 404');
  console.log('  ✓ PASS: On API failure, event remains visible and clear error is returned.\n');

  console.log('======================================================');
  console.log('ALL ACCEPTANCE TESTS PASSED SUCCESSFULLY!');
  console.log('======================================================');
}

runAcceptanceTests().catch((err) => {
  console.error('Acceptance tests failed:', err);
  process.exit(1);
});
