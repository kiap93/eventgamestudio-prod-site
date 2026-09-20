import assert from 'node:assert';
import {
  getEventByPublicToken,
  canAccessLiveEvent,
  getClientLiveGameAccessDetails,
  deriveEventLifecycleStatus,
  localEventsCache,
} from './events';
import { EventRecord } from './types';

console.log('======================================================');
console.log('RUNNING PUBLIC EVENT ACCESS CONTROL & LIFECYCLE TESTS');
console.log('======================================================');

const mockEnv = {
  SUPABASE_URL: 'https://placeholder.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'placeholder_key',
  DATABASE_URL: 'placeholder_db',
};

// Helper to create mock event record
function createMockEvent(overrides: Partial<EventRecord>): EventRecord {
  return {
    id: 'ev-default',
    organization_id: 'org-test-1',
    name: 'Test Event',
    game_id: 'game-1',
    game_theme_id: 'default-theme',
    event_status: 'SCHEDULED',
    status: 'scheduled',
    payment_status: 'UNPAID',
    starts_at: '2026-09-01T00:00:00Z',
    expires_at: '2026-09-10T23:59:59Z',
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    ...overrides,
  } as EventRecord;
}

// Test 1: Completed event (end date in past, status was not updated by cron yet)
const pastEvent = createMockEvent({
  id: 'ev-past-1',
  name: 'Past Tech Conference 2026',
  public_token: 'Y8Z67U6P7FR29AQ3',
  event_status: 'LIVE', // Cron has not transitioned it yet!
  status: 'live',
  payment_status: 'PAID',
  start_date: '2026-08-01',
  end_date: '2026-08-05',
  starts_at: '2026-08-01T00:00:00Z',
  expires_at: '2026-08-05T23:59:59Z',
});
localEventsCache.set(pastEvent.id, pastEvent);

// Check canAccessLiveEvent
assert.strictEqual(
  canAccessLiveEvent(pastEvent),
  false,
  'canAccessLiveEvent must return false for past event'
);

const pastAccess = getClientLiveGameAccessDetails(pastEvent);
assert.strictEqual(pastAccess.canAccess, false, 'Access must be denied');
assert.ok(
  pastAccess.code === 'EVENT_COMPLETED' || pastAccess.code === 'EVENT_EXPIRED',
  `Code must be EVENT_COMPLETED or EVENT_EXPIRED, got ${pastAccess.code}`
);

// getEventByPublicToken must return null for public access
const publicResult = await getEventByPublicToken('Y8Z67U6P7FR29AQ3', mockEnv);
assert.strictEqual(
  publicResult,
  null,
  'Public resolution must return null for completed event even if status is still live in DB'
);

// However, internal preview/status inspection (allowUnpaid: true) should still return the event record
const internalResult = await getEventByPublicToken('Y8Z67U6P7FR29AQ3', mockEnv, { allowUnpaid: true });
assert.ok(
  internalResult !== null,
  'Internal preview resolution (allowUnpaid: true) should return event metadata'
);
assert.strictEqual(internalResult.id, 'ev-past-1');

console.log('✓ PASS 1: Completed event is blocked from public access even when cron has not run');

// Test 2: Active paid live event
const activeEvent = createMockEvent({
  id: 'ev-active-1',
  name: 'Active Gala 2026',
  public_token: 'ACTIVE1234567890',
  event_status: 'LIVE',
  status: 'live',
  payment_status: 'PAID',
  start_date: '2026-09-01',
  end_date: '2026-12-31',
  starts_at: '2026-09-01T00:00:00Z',
  expires_at: '2026-12-31T23:59:59Z',
});
localEventsCache.set(activeEvent.id, activeEvent);

const activeAccess = getClientLiveGameAccessDetails(activeEvent);
assert.strictEqual(activeAccess.canAccess, true, 'Active event within window must allow access');

const activeResult = await getEventByPublicToken('ACTIVE1234567890', mockEnv);
assert.ok(activeResult !== null, 'Active event must be returned for public token');
assert.strictEqual(activeResult.id, 'ev-active-1');

console.log('✓ PASS 2: Active live event is accessible via public token');

// Test 3: Unpaid event
const unpaidEvent = createMockEvent({
  id: 'ev-unpaid-1',
  name: 'Unpaid Expo 2026',
  public_token: 'UNPAID1234567890',
  event_status: 'PENDING_PAYMENT',
  status: 'pending_payment',
  payment_status: 'UNPAID',
  start_date: '2026-09-01',
  end_date: '2026-12-31',
});
localEventsCache.set(unpaidEvent.id, unpaidEvent);

const unpaidResult = await getEventByPublicToken('UNPAID1234567890', mockEnv);
assert.strictEqual(unpaidResult, null, 'Unpaid event must return null for public access');

console.log('✓ PASS 3: Unpaid event is blocked from public access');

// Test 4: Cancelled event
const cancelledEvent = createMockEvent({
  id: 'ev-cancelled-1',
  name: 'Cancelled Festival 2026',
  public_token: 'CANCEL1234567890',
  event_status: 'CANCELLED',
  status: 'cancelled',
  cancel_reason: 'USER_CANCELLED',
  payment_status: 'REFUNDED',
  start_date: '2026-09-01',
  end_date: '2026-12-31',
});
localEventsCache.set(cancelledEvent.id, cancelledEvent);

const cancelledResult = await getEventByPublicToken('CANCEL1234567890', mockEnv);
assert.strictEqual(cancelledResult, null, 'Cancelled event must return null for public access');

console.log('✓ PASS 4: Cancelled event is blocked from public access');

// Test 5: Scheduled future event (before Setup Day)
const futureEvent = createMockEvent({
  id: 'ev-future-1',
  name: 'Future Launch 2027',
  public_token: 'FUTURE1234567890',
  event_status: 'SCHEDULED',
  status: 'scheduled',
  payment_status: 'PAID',
  start_date: '2027-01-01',
  end_date: '2027-01-05',
  starts_at: '2027-01-01T00:00:00Z',
  expires_at: '2027-01-05T23:59:59Z',
});
localEventsCache.set(futureEvent.id, futureEvent);

const futureResult = await getEventByPublicToken('FUTURE1234567890', mockEnv);
assert.strictEqual(futureResult, null, 'Scheduled future event before setup day must return null for public access');

console.log('✓ PASS 5: Future event before setup day is blocked from public access');

console.log('======================================================');
console.log('ALL PUBLIC EVENT ACCESS CONTROL TESTS PASSED!');
console.log('======================================================');
