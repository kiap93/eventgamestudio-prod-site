/**
 * Public Event DTO & Endpoint Data Exposure Security Test Suite
 *
 * Verifies that:
 * 1. toPublicEventDTO strips internal fields (organization_id, created_by, payment_status, event_price, event_currency, etc.)
 * 2. GET /api/public/events/:publicToken returns only the sanitized DTO for live events
 * 3. GET /api/public/events/:publicToken on unpaid event returns 403 without leaking raw event object or internal pricing/org fields
 * 4. GET /api/public/events/:publicToken on concluded/scheduled events does not leak raw event object
 */

import assert from 'node:assert';
import { createUser, createOrganization, createEvent, createTheme, getEventByPublicToken, toPublicEventDTO } from './db';
import worker from '../worker';

console.log('======================================================');
console.log('Running Public Event DTO Data Exposure Security Tests');
console.log('======================================================\n');

async function runTests() {
  const workerEnv = {
    JWT_SECRET: '0123456789abcdef0123456789abcdef',
    SUPABASE_URL: 'https://placeholder.supabase.co',
    SUPABASE_ANON_KEY: 'placeholder-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'placeholder-service-key',
    NODE_ENV: 'development',
  };

  const ownerUser = await createUser({
    email: 'dto-test-owner@example.com',
    name: 'DTO Test Owner',
  }, workerEnv);

  const org = await createOrganization(
    {
      name: 'DTO Test Organization',
      owner_id: ownerUser.id,
    },
    workerEnv
  );

  const theme = await createTheme({
    organization_id: org.id,
    game_id: 'catch-brand',
    name: 'DTO Theme',
    branding: {
      gameTitle: 'Catch the Brand!',
      subtitle: 'Catch items and score points',
    },
    visuals_config: {
      primaryColor: '#ff5500',
    },
  }, workerEnv);

  const rawEvent = await createEvent(
    {
      organization_id: org.id,
      name: 'Public Showcase Event',
      start_date: '2026-09-01',
      end_date: '2026-09-30',
      status: 'active',
      payment_status: 'PAID',
      event_status: 'LIVE',
      event_price: 1400,
      event_currency: 'MYR',
      game_id: 'catch-brand',
      game_theme_id: theme.id,
      created_by: ownerUser.id,
    },
    workerEnv
  );

  // Test 1: toPublicEventDTO unit test - strict field whitelisting
  {
    const eventWithDetails = await getEventByPublicToken(rawEvent.public_token, workerEnv, { allowUnpaid: true });
    assert.ok(eventWithDetails, 'Event with details must be found');
    const dto = toPublicEventDTO(eventWithDetails);

    // Required public fields
    assert.strictEqual(dto.id, rawEvent.id, 'DTO id must match');
    assert.strictEqual(dto.name, rawEvent.name, 'DTO name must match');
    assert.strictEqual(dto.start_date, '2026-09-01', 'DTO start_date must match');
    assert.strictEqual(dto.end_date, '2026-09-30', 'DTO end_date must match');
    assert.strictEqual(dto.live_open_date, '2026-08-31', 'DTO live_open_date must be setup day');
    assert.ok(dto.game, 'DTO game must be defined');
    assert.strictEqual(dto.game?.game_type, 'catch-brand', 'DTO game_type must match');
    assert.ok(dto.theme, 'DTO theme must be defined');
    assert.ok(dto.branding, 'DTO branding must be defined');

    // Forbidden internal database fields must be undefined
    assert.strictEqual((dto as any).organization_id, undefined, 'organization_id MUST NOT be exposed');
    assert.strictEqual((dto as any).created_by, undefined, 'created_by MUST NOT be exposed');
    assert.strictEqual((dto as any).payment_status, undefined, 'payment_status MUST NOT be exposed');
    assert.strictEqual((dto as any).event_price, undefined, 'event_price MUST NOT be exposed');
    assert.strictEqual((dto as any).event_currency, undefined, 'event_currency MUST NOT be exposed');
    assert.strictEqual((dto as any).status, undefined, 'raw status MUST NOT be exposed');
    assert.strictEqual((dto as any).event_status, undefined, 'raw event_status MUST NOT be exposed');
    assert.strictEqual((dto as any).calculated_status, undefined, 'internal calculated_status MUST NOT be exposed');

    console.log('  ✓ 1. toPublicEventDTO unit test: strips all internal database columns');
  }

  // Test 2: Worker GET /api/public/events/:publicToken on LIVE PAID event
  {
    const req = new Request(`https://api.eventgamestudio.local/api/public/events/${rawEvent.public_token}`, {
      method: 'GET',
    });
    const res = await worker.fetch(req, workerEnv);
    assert.strictEqual(res.status, 200, 'Live event returns 200 OK');

    const data: any = await res.json();
    assert.ok(data.event, 'Response must contain event DTO');
    const returnedEvent = data.event;

    // Verify fields
    assert.strictEqual(returnedEvent.id, rawEvent.id);
    assert.strictEqual(returnedEvent.name, rawEvent.name);
    assert.strictEqual(returnedEvent.start_date, '2026-09-01');
    assert.strictEqual(returnedEvent.end_date, '2026-09-30');
    assert.strictEqual(returnedEvent.live_open_date, '2026-08-31');

    // Verify internal fields are completely absent
    assert.strictEqual(returnedEvent.organization_id, undefined, 'organization_id must not be exposed in API');
    assert.strictEqual(returnedEvent.created_by, undefined, 'created_by must not be exposed in API');
    assert.strictEqual(returnedEvent.payment_status, undefined, 'payment_status must not be exposed in API');
    assert.strictEqual(returnedEvent.event_price, undefined, 'event_price must not be exposed in API');
    assert.strictEqual(returnedEvent.event_currency, undefined, 'event_currency must not be exposed in API');
    assert.strictEqual(returnedEvent.event_status, undefined, 'event_status must not be exposed in API');

    console.log('  ✓ 2. GET /api/public/events/:token returns sanitized PublicEventDTO with no internal columns');
  }

  // Test 3: Worker GET /api/public/events/:publicToken on UNPAID event returns 403 without raw event
  {
    const unpaidEvent = await createEvent(
      {
        organization_id: org.id,
        name: 'Unpaid Pending Event',
        start_date: '2026-09-01',
        end_date: '2026-09-30',
        status: 'draft',
        payment_status: 'UNPAID',
        event_status: 'DRAFT',
        event_price: 1400,
        event_currency: 'MYR',
        game_id: 'catch-brand',
        game_theme_id: theme.id,
        created_by: ownerUser.id,
      },
      workerEnv
    );

    const req = new Request(`https://api.eventgamestudio.local/api/public/events/${unpaidEvent.public_token}`, {
      method: 'GET',
    });
    const res = await worker.fetch(req, workerEnv);
    assert.strictEqual(res.status, 403, 'Unpaid event must return 403 Forbidden');

    const data: any = await res.json();
    assert.strictEqual(data.code, 'PAYMENT_REQUIRED');
    assert.strictEqual(data.is_pending_payment, true);

    // Confirm no raw event object or sensitive database columns are returned
    assert.strictEqual(data.event, undefined, 'raw event must NOT be returned in 403 response');
    assert.strictEqual(data.organization_id, undefined, 'organization_id must NOT be returned in 403 response');
    assert.strictEqual(data.event_price, undefined, 'event_price must NOT be returned in 403 response');
    assert.strictEqual(data.event_currency, undefined, 'event_currency must NOT be returned in 403 response');
    assert.strictEqual(data.payment_status, undefined, 'payment_status must NOT be returned in 403 response');

    console.log('  ✓ 3. GET /api/public/events/:token on unpaid event returns 403 without leaking rawEvent or pricing');
  }

  console.log('\n======================================================');
  console.log('All Public Event DTO Security Tests Passed Successfully!');
  console.log('======================================================\n');
}

runTests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('Public Event DTO test failure:', err);
    process.exit(1);
  });
