/**
 * Showcase Atomic Publish & Production Fix Verification
 * Tests the fix for the production 500 error on POST /api/events/:eventId/showcase/publish
 * Verifies publish_event_showcase_atomic RPC logic, nullable fields, and business rule defenses.
 */

import {
  publishShowcase,
  unpublishShowcase,
  getShowcaseByEventId,
  createShowcase,
  localShowcasesCache,
} from './showcases.js';
import { isEventEligibleForShowcase, localEventsCache } from './events.js';
import { EventRecord } from './types.js';
import { localOrgsCache } from './organizations.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ PASS: ${message}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual === expected) {
    passed++;
    console.log(`  ✓ PASS: ${message} (expected ${expected}, got ${actual})`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${message} (expected ${expected}, got ${actual})`);
  }
}

async function runTests() {
  console.log('========================================================================');
  console.log(' RUNNING: Showcase Atomic Publish & Production Fix Tests');
  console.log('========================================================================\n');

  localShowcasesCache.clear();
  localEventsCache.clear();

  const orgId = crypto.randomUUID();
  const ownerUserId = crypto.randomUUID();

  localOrgsCache.set(orgId, {
    id: orgId,
    name: 'Mega Carnival Org',
    slug: 'mega-carnival',
    owner_id: ownerUserId,
    country_code: 'MY',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as any);

  const createMockEvent = (overrides?: Partial<EventRecord>): EventRecord => {
    const event: EventRecord = {
      id: overrides?.id || crypto.randomUUID(),
      organization_id: orgId,
      name: 'Mega Carnival 2026',
      game_id: crypto.randomUUID(),
      game_theme_id: crypto.randomUUID(),
      public_token: 'TOK_' + Math.random().toString(36).substring(7),
      status: 'active',
      event_status: 'COMPLETED',
      payment_status: 'PAID',
      start_date: '2026-09-01',
      end_date: '2026-09-02',
      starts_at: '2026-09-01T00:00:00.000Z',
      expires_at: '2026-09-02T23:59:59.000Z',
      event_price: 1400,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...overrides,
    };
    localEventsCache.set(event.id, event as any);
    return event;
  };

  console.log('--- Scenario 1: Exact Production Payload with Nullable Fields Succeeds ---');
  const event1 = createMockEvent();
  const productionPayload = {
    title: 'egefa',
    description: null,
    client_name: null,
    client_logo_url: null,
    cover_image_url: null,
  };

  const published1 = await publishShowcase(event1.id, productionPayload);
  assert(!!published1, 'publishShowcase returns published showcase');
  assertEqual(published1.event_id, event1.id, 'event_id matches');
  assertEqual(published1.title, 'egefa', 'title set correctly');
  assert(published1.description === null, 'description is null');
  assert(published1.client_name === null, 'client_name is null');
  assert(published1.client_logo_url === null, 'client_logo_url is null');
  assert(published1.cover_image_url === null, 'cover_image_url is null');
  assertEqual(published1.status, 'PUBLISHED', 'status is PUBLISHED');
  assertEqual(published1.publication_status, 'PUBLISHED', 'publication_status is PUBLISHED');
  assert(!!published1.published_at, 'published_at is timestamped');
  assert(!!published1.created_by, 'created_by is populated and not null');
  assertEqual(published1.created_by, ownerUserId, 'created_by matches organization owner');

  console.log('\n--- Scenario 2: Publishing an Existing Showcase Updates and Preserves Values ---');
  const event2 = createMockEvent({ id: 'a1111111-2222-3333-4444-555555555555' });
  const initial = await publishShowcase(event2.id, {
    title: 'First Title',
    description: 'Initial description',
    client_name: 'Acme Corp',
  });
  assertEqual(initial.title, 'First Title', 'initial title set');
  assertEqual(initial.description, 'Initial description', 'initial description set');

  const updated = await publishShowcase(event2.id, {
    title: 'Updated Title',
    description: null,
  });
  assertEqual(updated.id, initial.id, 'showcase ID preserved');
  assertEqual(updated.title, 'Updated Title', 'title updated');
  assert(updated.description === null, 'description explicitly updated to null');
  assertEqual(updated.status, 'PUBLISHED', 'remains PUBLISHED');

  console.log('\n--- Scenario 3: Blocked Showcase Cannot Be Published (HTTP 403 SHOWCASE_BLOCKED) ---');
  const event3 = createMockEvent({ id: 'b2222222-3333-4444-5555-666666666666' });
  const sc = await createShowcase({
    event_id: event3.id,
    organization_id: event3.organization_id,
    title: 'Suspicious Showcase',
    status: 'BLOCKED',
  });
  assertEqual(sc.status, 'BLOCKED', 'showcase is blocked');

  try {
    await publishShowcase(event3.id, { title: 'Attempt Unblock via Publish' });
    assert(false, 'Should have thrown SHOWCASE_BLOCKED');
  } catch (err: any) {
    assertEqual(err.code, 'SHOWCASE_BLOCKED', 'error code is SHOWCASE_BLOCKED');
    assertEqual(err.status, 403, 'status code is 403');
  }

  console.log('\n--- Scenario 4: Unpaid Event Cannot Be Published (HTTP 422) ---');
  const unpaidEvent = createMockEvent({
    id: 'c3333333-4444-5555-6666-777777777777',
    payment_status: 'UNPAID',
  });
  try {
    await publishShowcase(unpaidEvent.id, { title: 'Unpaid Publish Attempt' });
    assert(false, 'Should have thrown for unpaid event');
  } catch (err: any) {
    assert(err.status === 422 || err.status === 400, 'unpaid event rejected with 422/400');
  }

  console.log('\n--- Scenario 5: Future Event Not Yet Started Cannot Be Published ---');
  const futureEvent = createMockEvent({
    id: 'd4444444-5555-6666-7777-888888888888',
    start_date: '2029-01-01',
    end_date: '2029-01-02',
    status: 'scheduled',
    event_status: 'SCHEDULED',
  });
  const eligibility = isEventEligibleForShowcase(futureEvent);
  assertEqual(eligibility.eligible, false, 'future event is not eligible');
  try {
    await publishShowcase(futureEvent.id, { title: 'Future Event Showcase' });
    assert(false, 'Should have thrown for unstarted event');
  } catch (err: any) {
    assertEqual(err.status, 422, 'unstarted event rejected with 422');
  }

  console.log('\n--- Scenario 6: Showcase Publication is Self-Serve and Decoupled from Rewards ---');
  const event6 = createMockEvent({ id: 'e5555555-6666-7777-8888-999999999999' });
  const published6 = await publishShowcase(event6.id, {
    title: 'Decoupled Showcase',
  });
  assertEqual(published6.status, 'PUBLISHED', 'showcase status is PUBLISHED');
  assertEqual(published6.publication_status, 'PUBLISHED', 'showcase publication_status is PUBLISHED');
  assert(published6.reward_status !== 'REWARDED', 'reward is not prematurely granted');
  assert(published6.reward_review_status !== 'REWARDED', 'reward_review_status is not REWARDED');

  console.log('\n========================================================================');
  console.log(` RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================\n');

  if (failed > 0) {
    throw new Error(`${failed} tests failed!`);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
