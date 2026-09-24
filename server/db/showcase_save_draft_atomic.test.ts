/**
 * Showcase Save Draft Atomic & Null Semantics Test
 * Verifies that save_event_showcase_atomic RPC and updateShowcase/createShowcase
 * correctly handle:
 * 1. Creating a new draft showcase
 * 2. Updating an existing showcase with explicit null values
 * 3. Preserving existing values when properties are omitted
 * 4. Moderation checks (blocked and deleted showcases cannot be modified by organizers)
 * 5. Strict null semantics matching production payloads
 */

import {
  createShowcase,
  updateShowcase,
  publishShowcase,
  getShowcaseByEventId,
  localShowcasesCache,
} from './showcases.js';
import { localEventsCache } from './events.js';
import { localOrgsCache } from './organizations.js';
import { EventRecord } from './types.js';

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
  console.log(' RUNNING: Showcase Save Draft & Null Semantics Tests');
  console.log('========================================================================\n');

  localShowcasesCache.clear();
  localEventsCache.clear();
  localOrgsCache.clear();

  const orgId = crypto.randomUUID();
  const ownerUserId = crypto.randomUUID();

  localOrgsCache.set(orgId, {
    id: orgId,
    name: 'Acme Events',
    slug: 'acme-events',
    owner_id: ownerUserId,
    country_code: 'MY',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as any);

  const createMockEvent = (overrides?: Partial<EventRecord>): EventRecord => {
    const event: EventRecord = {
      id: overrides?.id || crypto.randomUUID(),
      organization_id: orgId,
      name: 'Annual Gala 2026',
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

  console.log('--- Test 1: createShowcase with null optional fields ---');
  const event1 = createMockEvent();
  const created = await createShowcase({
    event_id: event1.id,
    organization_id: orgId,
    title: 'Gala Showcase Draft',
    description: null,
    client_name: null,
    client_logo_url: null,
    cover_image_url: null,
    status: 'DRAFT',
  });

  assert(!!created, 'Draft created successfully');
  assertEqual(created.event_id, event1.id, 'event_id matches');
  assertEqual(created.title, 'Gala Showcase Draft', 'title set correctly');
  assertEqual(created.description, null, 'description is null');
  assertEqual(created.client_name, null, 'client_name is null');
  assertEqual(created.client_logo_url, null, 'client_logo_url is null');
  assertEqual(created.cover_image_url, null, 'cover_image_url is null');
  assertEqual(created.status, 'DRAFT', 'status is DRAFT');

  console.log('\n--- Test 2: updateShowcase preserves omitted fields ---');
  const updated1 = await updateShowcase(event1.id, {
    description: 'Added exciting gala description',
  });

  assertEqual(updated1.title, 'Gala Showcase Draft', 'title preserved when omitted');
  assertEqual(updated1.description, 'Added exciting gala description', 'description updated');
  assertEqual(updated1.client_name, null, 'client_name preserved as null');

  console.log('\n--- Test 3: updateShowcase explicitly clears fields when passed null ---');
  const updated2 = await updateShowcase(event1.id, {
    description: null,
  });

  assertEqual(updated2.title, 'Gala Showcase Draft', 'title preserved');
  assertEqual(updated2.description, null, 'description explicitly cleared to null');

  console.log('\n--- Test 4: updateShowcase rejects blocked showcases ---');
  await updateShowcase(
    event1.id,
    { status: 'BLOCKED' as any, moderation_reason: 'Inappropriate content' },
    undefined,
    true // bypassBlockedCheck = true for moderator
  );

  const blocked = await getShowcaseByEventId(event1.id);
  assertEqual(blocked?.status, 'BLOCKED', 'showcase is now BLOCKED');

  try {
    await updateShowcase(event1.id, { title: 'Hacked Title' });
    assert(false, 'Should have thrown error for blocked showcase');
  } catch (err: any) {
    assertEqual(err.code, 'SHOWCASE_BLOCKED', 'error code is SHOWCASE_BLOCKED');
    assertEqual(err.status, 403, 'status code is 403');
  }

  console.log('\n--- Test 5: Production Publish Payload After Draft ---');
  const event2 = createMockEvent();
  // First save draft
  await createShowcase({
    event_id: event2.id,
    organization_id: orgId,
    title: 'egefa',
    description: null,
    client_name: null,
    client_logo_url: null,
    cover_image_url: null,
    status: 'DRAFT',
  });

  // Then publish
  const published = await publishShowcase(event2.id, {
    title: 'egefa',
    description: null,
    client_name: null,
    client_logo_url: null,
    cover_image_url: null,
  });

  assertEqual(published.title, 'egefa', 'published title is egefa');
  assertEqual(published.status, 'PUBLISHED', 'status is PUBLISHED');
  assertEqual(published.publication_status, 'PUBLISHED', 'publication_status is PUBLISHED');
  assertEqual(published.description, null, 'description is null');

  console.log('\n========================================================================');
  console.log(` RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================\n');

  if (failed > 0) {
    throw new Error(`${failed} tests failed!`);
  }
}

runTests().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
