import assert from 'node:assert';
import { canDeleteEvent, deleteEvent, localEventsCache, getEventById } from './db/events';
import { createUser, createOrganization, addMember, createTheme } from './db/index';
import { signAppToken } from './auth';
import worker from '../worker';

console.log('========================================================================');
console.log('ACCEPTANCE TESTS: EVENT DELETION RULES & MULTI-TENANT SECURITY');
console.log('========================================================================\n');

async function runAcceptanceTests() {
  const env = {
    JWT_SECRET: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    SUPABASE_URL: 'https://placeholder.supabase.co',
    SUPABASE_ANON_KEY: 'placeholder-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'placeholder-service-key',
    NODE_ENV: 'test',
  };

  // 1. Setup multi-tenant test fixture: Org 1 (Owner, Admin, Designer) and Org 2 (Stranger)
  const org1Owner = await createUser({ email: 'owner1@eventgamestudio.local', name: 'Org 1 Owner' }, env);
  const org1Admin = await createUser({ email: 'admin1@eventgamestudio.local', name: 'Org 1 Admin' }, env);
  const org1Designer = await createUser({ email: 'designer1@eventgamestudio.local', name: 'Org 1 Designer' }, env);
  const org2Owner = await createUser({ email: 'owner2@othercompany.local', name: 'Org 2 Owner' }, env);

  const org1 = await createOrganization(
    { name: 'Organization 1', owner_id: org1Owner.id, country_code: 'SG' },
    env
  );
  const org2 = await createOrganization(
    { name: 'Organization 2', owner_id: org2Owner.id, country_code: 'SG' },
    env
  );

  await addMember({ organization_id: org1.id, user_id: org1Admin.id, role: 'admin' }, env);
  await addMember({ organization_id: org1.id, user_id: org1Designer.id, role: 'designer' }, env);

  const org1OwnerJwt = await signAppToken(org1Owner.id, org1.id, 'owner', undefined, env);
  const org1AdminJwt = await signAppToken(org1Admin.id, org1.id, 'admin', undefined, env);
  const org1DesignerJwt = await signAppToken(org1Designer.id, org1.id, 'designer', undefined, env);
  const org2OwnerJwt = await signAppToken(org2Owner.id, org2.id, 'owner', undefined, env);

  const theme1 = await createTheme(
    { organization_id: org1.id, name: 'Brand Catch Theme', game_id: 'catch-brand' },
    env
  );

  let seq = 1;
  function mockEvent(overrides: Record<string, any>) {
    const id = `ev-acc-${seq++}-${Date.now()}`;
    const ev = {
      id,
      organization_id: org1.id,
      game_id: 'catch-brand',
      game_theme_id: theme1.id,
      name: `Acceptance Test Event ${id}`,
      start_date: '2026-11-20',
      end_date: '2026-11-21',
      starts_at: '2026-11-19T16:00:00.000Z',
      expires_at: '2026-11-21T15:59:59.999Z',
      status: 'scheduled',
      event_status: 'SCHEDULED',
      payment_status: 'UNPAID',
      paid_amount: 0,
      discount_amount: 0,
      event_price: 1400,
      event_currency: 'MYR',
      public_token: `TOK${id.replace(/-/g, '')}`,
      event_timezone: 'Asia/Singapore',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...overrides,
    };
    localEventsCache.set(id, ev as any);
    return ev;
  }

  // --------------------------------------------------------------------------
  // TEST 1: Newly created unpaid event -> deletion allowed
  // --------------------------------------------------------------------------
  console.log('--- Test 1: Newly created unpaid event deletion ---');
  const ev1 = mockEvent({ payment_status: 'UNPAID', paid_amount: 0 });
  
  const el1 = canDeleteEvent(ev1);
  assert.strictEqual(el1.canDelete, true, 'canDeleteEvent must return true for new unpaid event');
  assert.strictEqual(el1.code, 'ELIGIBLE_FOR_DELETION');

  const res1 = await worker.fetch(
    new Request(`https://api.eventgamestudio.local/api/events/${ev1.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${org1OwnerJwt}` },
    }),
    env
  );
  assert.strictEqual(res1.status, 200, 'HTTP DELETE on new unpaid event must return 200');
  const data1 = await res1.json() as any;
  assert.strictEqual(data1.success, true);
  assert.strictEqual(await getEventById(ev1.id, env), null, 'Event must be purged from database');
  console.log('  ✓ PASS: Newly created unpaid event is successfully deleted');

  // --------------------------------------------------------------------------
  // TEST 2: Unpaid event with past event date (expired) -> deletion allowed
  // --------------------------------------------------------------------------
  console.log('--- Test 2: Unpaid event with past event date deletion ---');
  const ev2 = mockEvent({
    payment_status: 'UNPAID',
    paid_amount: 0,
    start_date: '2026-08-01',
    end_date: '2026-08-02',
    starts_at: '2026-07-31T16:00:00.000Z',
    expires_at: '2026-08-02T15:59:59.999Z',
    status: 'expired',
    event_status: 'EXPIRED',
  });

  const el2 = canDeleteEvent(ev2);
  assert.strictEqual(el2.canDelete, true, 'canDeleteEvent must return true for past unpaid event');
  assert.strictEqual(el2.code, 'ELIGIBLE_FOR_DELETION');
  assert.strictEqual(el2.lifecycle, 'EXPIRED');

  const res2 = await worker.fetch(
    new Request(`https://api.eventgamestudio.local/api/events/${ev2.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${org1OwnerJwt}` },
    }),
    env
  );
  assert.strictEqual(res2.status, 200, 'HTTP DELETE on past unpaid event must return 200');
  const data2 = await res2.json() as any;
  assert.strictEqual(data2.success, true);
  assert.strictEqual(await getEventById(ev2.id, env), null, 'Past unpaid event must be purged from database');
  console.log('  ✓ PASS: Past unpaid event is successfully deleted');

  // --------------------------------------------------------------------------
  // TEST 3: Paid event -> deletion blocked (must use Cancel & Refund workflow)
  // --------------------------------------------------------------------------
  console.log('--- Test 3: Paid event deletion blocked ---');
  const ev3 = mockEvent({
    payment_status: 'PAID',
    paid_amount: 1400,
    start_date: '2026-11-20',
    end_date: '2026-11-21',
  });

  const el3 = canDeleteEvent(ev3);
  assert.strictEqual(el3.canDelete, false, 'canDeleteEvent must return false for paid event');
  assert.strictEqual(el3.code, 'EVENT_PAID');

  const res3 = await worker.fetch(
    new Request(`https://api.eventgamestudio.local/api/events/${ev3.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${org1OwnerJwt}` },
    }),
    env
  );
  assert.strictEqual(res3.status, 422, 'HTTP DELETE on paid event must return 422');
  const data3 = await res3.json() as any;
  assert.strictEqual(data3.code, 'EVENT_PAID');
  assert.match(data3.error, /This paid event cannot be deleted/);
  assert.ok(await getEventById(ev3.id, env), 'Paid event must remain intact in database');
  console.log('  ✓ PASS: Paid event deletion is strictly blocked and remains in database');

  // --------------------------------------------------------------------------
  // TEST 4: Event owned by another organization -> deletion blocked (403 Forbidden)
  // --------------------------------------------------------------------------
  console.log('--- Test 4: Cross-tenant unauthorized deletion blocked ---');
  const ev4 = mockEvent({ payment_status: 'UNPAID', paid_amount: 0 });

  const res4 = await worker.fetch(
    new Request(`https://api.eventgamestudio.local/api/events/${ev4.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${org2OwnerJwt}` }, // Org 2 Owner trying to delete Org 1's event
    }),
    env
  );
  assert.strictEqual(res4.status, 403, 'Cross-tenant DELETE must return 403 Forbidden');
  const data4 = await res4.json() as any;
  assert.match(data4.error, /Permission denied/);
  assert.ok(await getEventById(ev4.id, env), 'Event must not be modified or deleted by another tenant');
  console.log('  ✓ PASS: Cross-tenant deletion attempt is strictly blocked (403)');

  // --------------------------------------------------------------------------
  // TEST 5: Member without event.manage (Designer) -> deletion blocked (403 Forbidden)
  // --------------------------------------------------------------------------
  console.log('--- Test 5: Role-based permissions guard (Designer) ---');
  const ev5 = mockEvent({ payment_status: 'UNPAID', paid_amount: 0 });

  const res5 = await worker.fetch(
    new Request(`https://api.eventgamestudio.local/api/events/${ev5.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${org1DesignerJwt}` },
    }),
    env
  );
  assert.strictEqual(res5.status, 403, 'Designer DELETE must return 403 Forbidden');
  assert.ok(await getEventById(ev5.id, env), 'Event must not be deleted by member without event.manage');
  console.log('  ✓ PASS: Non-admin member cannot delete event (403)');

  // --------------------------------------------------------------------------
  // TEST 6: Organization Admin -> deletion allowed for unpaid event
  // --------------------------------------------------------------------------
  console.log('--- Test 6: Organization Admin deletion allowed ---');
  const ev6 = mockEvent({ payment_status: 'UNPAID', paid_amount: 0 });

  const res6 = await worker.fetch(
    new Request(`https://api.eventgamestudio.local/api/events/${ev6.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${org1AdminJwt}` },
    }),
    env
  );
  assert.strictEqual(res6.status, 200, 'Admin DELETE on unpaid event must return 200');
  assert.strictEqual(await getEventById(ev6.id, env), null, 'Admin can delete unpaid event');
  console.log('  ✓ PASS: Organization Admin can delete unpaid event');

  // --------------------------------------------------------------------------
  // TEST 7: Cancelled or Refunded event -> deletion blocked to preserve audit records
  // --------------------------------------------------------------------------
  console.log('--- Test 7: Cancelled event deletion blocked for audit retention ---');
  const ev7 = mockEvent({
    payment_status: 'REFUNDED',
    event_status: 'CANCELLED',
    status: 'cancelled',
  });

  const el7 = canDeleteEvent(ev7);
  assert.strictEqual(el7.canDelete, false);
  assert.strictEqual(el7.code, 'ALREADY_CANCELLED');

  const res7 = await worker.fetch(
    new Request(`https://api.eventgamestudio.local/api/events/${ev7.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${org1OwnerJwt}` },
    }),
    env
  );
  assert.strictEqual(res7.status, 422);
  const data7 = await res7.json() as any;
  assert.strictEqual(data7.code, 'ALREADY_CANCELLED');
  console.log('  ✓ PASS: Cancelled / refunded event cannot be deleted (audit history preserved)');

  // --------------------------------------------------------------------------
  // TEST 8: API failure simulation -> event remains visible and error surfaced
  // --------------------------------------------------------------------------
  console.log('--- Test 8: UI state resilience on API failure ---');
  const ev8 = mockEvent({ payment_status: 'UNPAID' });
  let uiEventsList = [ev8];
  let uiErrorMessage: string | null = null;

  // Simulate UI delete call with invalid authorization to trigger an API failure
  const failRes = await worker.fetch(
    new Request(`https://api.eventgamestudio.local/api/events/${ev8.id}`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer invalid_or_expired_token' },
    }),
    env
  );

  if (!failRes.ok) {
    const errorData = await failRes.json().catch(() => ({}));
    uiErrorMessage = errorData.error || errorData.message || 'Failed to delete event';
  } else {
    uiEventsList = uiEventsList.filter((e) => e.id !== ev8.id);
  }

  assert.strictEqual(uiEventsList.length, 1, 'Event must remain visible in list on API failure');
  assert.strictEqual(uiEventsList[0].id, ev8.id, 'Original event is retained');
  assert.ok(uiErrorMessage, 'UI error message must be set and surfaced to user');
  console.log('  ✓ PASS: On API failure, event remains visible and clear error is displayed');

  console.log('\n========================================================================');
  console.log('ALL ACCEPTANCE TESTS COMPLETED SUCCESSFULLY!');
  console.log('========================================================================');
}

runAcceptanceTests().catch((err) => {
  console.error('Acceptance Test Suite Failed:', err);
  process.exit(1);
});
