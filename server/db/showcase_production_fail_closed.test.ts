/**
 * Showcase Production Fail-Closed Architecture Test Suite
 * 
 * Verifies that:
 * 1. Production RPC calls fail closed on missing RPC, schema mismatch, or database error.
 * 2. NO direct-table fallback occurs in production under any error condition.
 * 3. Fallback is strictly gated and allowed only in non-production environments.
 * 4. Accidentally enabling fallback flags in production does NOT allow fallback.
 * 5. EXPOSE_API_ERRORS correctly controls client-visible errors without changing transactional behavior.
 * 6. Duplicate showcase reward protection remains strictly intact.
 */

import {
  publishShowcase,
  createShowcase,
  updateShowcase,
  deleteShowcase,
  approveShowcaseReward,
  localShowcasesCache,
  isShowcaseFallbackAllowed,
} from './showcases.js';
import { handleWorkerApiError, shouldExposeApiErrors } from '../errors.js';
import { EventRecord } from './types.js';
import { localEventsCache } from './events.js';
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

console.log('========================================================================');
console.log(' RUNNING: Showcase Production Fail-Closed Architecture Tests');
console.log('========================================================================\n');

// Mock setup helper
const orgId = crypto.randomUUID();
const ownerUserId = crypto.randomUUID();

localOrgsCache.set(orgId, {
  id: orgId,
  name: 'Fail Closed Org',
  slug: 'fail-closed-org',
  owner_id: ownerUserId,
  country_code: 'MY',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
} as any);

const createMockEvent = (overrides?: Partial<EventRecord>): EventRecord => {
  const event: EventRecord = {
    id: overrides?.id || crypto.randomUUID(),
    organization_id: orgId,
    name: 'Fail Closed Test Event',
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

// Universal mock chain builder using Proxy
function createMockChain(data: any = null, error: any = null) {
  const target: any = {
    single: async () => ({ data, error }),
    maybeSingle: async () => ({ data, error }),
    then: (resolve: any) => resolve({ data, error }),
  };
  const proxy = new Proxy(target, {
    get(t, prop) {
      if (prop in t) return t[prop];
      return () => proxy;
    },
  });
  return proxy;
}

// --- Test 1: Production - RPC succeeds -> operation succeeds and no fallback occurs ---
console.log('--- Test 1: Production - Successful RPC execution ---');
{
  const event = createMockEvent();
  const mockShowcase = {
    id: crypto.randomUUID(),
    event_id: event.id,
    organization_id: orgId,
    title: 'Successful Showcase',
    status: 'PUBLISHED',
    publication_status: 'PUBLISHED',
  };

  const prodEnvWithWorkingRpc = {
    ENVIRONMENT: 'production',
    SUPABASE_URL: 'https://real-project.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'real-service-key-12345',
    __supabaseClient: {
      from: (table: string) => {
        if (table === 'events') return createMockChain(event);
        return createMockChain(null);
      },
      rpc: async (fn: string) => {
        if (fn === 'publish_event_showcase_atomic') {
          return { data: mockShowcase, error: null };
        }
        return { data: null, error: null };
      },
    },
  };

  const result = await publishShowcase(event.id, { title: 'Successful Showcase' }, prodEnvWithWorkingRpc);
  assert(!!result, 'publishShowcase succeeded via RPC');
  assertEqual(result.title, 'Successful Showcase', 'Title matches RPC return');
  assertEqual(result.status, 'PUBLISHED', 'Status matches RPC return');
}

// --- Test 2: Production - RPC Missing (PGRST202 / 42883) -> Operation FAILS CLOSED, no fallback ---
console.log('\n--- Test 2: Production - Missing RPC fails closed without fallback ---');
{
  const event = createMockEvent();
  let directShowcaseTableMutated = false;

  const prodEnvWithMissingRpc = {
    ENVIRONMENT: 'production',
    SUPABASE_URL: 'https://real-project.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'real-service-key-12345',
    __supabaseClient: {
      from: (table: string) => {
        const chain = createMockChain(table === 'events' ? event : null);
        if (table === 'event_showcases') {
          chain.insert = () => {
            directShowcaseTableMutated = true;
            return createMockChain({});
          };
          chain.update = () => {
            directShowcaseTableMutated = true;
            return createMockChain({});
          };
        }
        return chain;
      },
      rpc: async (fn: string) => {
        return {
          data: null,
          error: {
            code: 'PGRST202',
            message: `Could not find the function public.${fn} in the schema cache`,
          },
        };
      },
    },
  };

  let threw = false;
  let caughtError: any = null;
  try {
    await publishShowcase(event.id, { title: 'Missing RPC Attempt' }, prodEnvWithMissingRpc);
  } catch (err: any) {
    threw = true;
    caughtError = err;
  }

  assert(threw, 'publishShowcase threw when RPC was missing in production');
  assertEqual(directShowcaseTableMutated, false, 'No direct event_showcases table mutation occurred when RPC failed');
  assert(caughtError?.code === 'PGRST202', 'Error preserved original postgres code PGRST202');
}

// --- Test 3: Production - Schema Mismatch (42804 datatype mismatch / 42703 undefined column) ---
console.log('\n--- Test 3: Production - Schema mismatch fails closed without fallback ---');
{
  const event = createMockEvent();
  let directShowcaseTableMutated = false;

  const prodEnvWithSchemaMismatch = {
    ENVIRONMENT: 'production',
    SUPABASE_URL: 'https://real-project.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'real-service-key-12345',
    __supabaseClient: {
      from: (table: string) => {
        const chain = createMockChain(table === 'events' ? event : null);
        if (table === 'event_showcases') {
          chain.insert = () => {
            directShowcaseTableMutated = true;
            return createMockChain({});
          };
          chain.update = () => {
            directShowcaseTableMutated = true;
            return createMockChain({});
          };
        }
        return chain;
      },
      rpc: async () => {
        return {
          data: null,
          error: {
            code: '42804',
            message: 'COALESCE types text and uuid cannot be matched',
          },
        };
      },
    },
  };

  let threw = false;
  let caughtError: any = null;
  try {
    await publishShowcase(event.id, { title: 'Schema Mismatch Attempt' }, prodEnvWithSchemaMismatch);
  } catch (err: any) {
    threw = true;
    caughtError = err;
  }

  assert(threw, 'publishShowcase threw on schema mismatch 42804 in production');
  assertEqual(directShowcaseTableMutated, false, 'event_showcases table was NOT mutated on schema mismatch');
  assert(caughtError?.postgresCode === '42804', 'PostgreSQL error code 42804 was preserved');
}

// --- Test 4: Production - Reward Approval RPC fails closed on missing function or schema error ---
console.log('\n--- Test 4: Production - Reward approval RPC fails closed without fallback ---');
{
  const showcaseId = crypto.randomUUID();
  const mockShowcaseRecord = {
    id: showcaseId,
    organization_id: orgId,
    owner_user_id: ownerUserId,
    event_id: crypto.randomUUID(),
    reward_review_status: 'AWAITING_APPROVAL',
    reward_status: 'PENDING',
  };

  const prodEnv = {
    ENVIRONMENT: 'production',
    SUPABASE_URL: 'https://real-project.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'real-service-key-12345',
    __supabaseClient: {
      from: (table: string) => {
        if (table === 'event_showcases') return createMockChain(mockShowcaseRecord);
        return createMockChain(null);
      },
      rpc: async (fn: string) => {
        if (fn === 'approve_first_event_showcase_reward_atomic') {
          return {
            data: null,
            error: {
              code: '42P01',
              message: 'relation "user_rewards" does not exist',
            },
          };
        }
        return { data: null, error: null };
      },
    },
  };

  let threw = false;
  let caughtError: any = null;
  try {
    await approveShowcaseReward(showcaseId, 'reviewer-uuid', prodEnv);
  } catch (err: any) {
    threw = true;
    caughtError = err;
  }

  assert(threw, 'approveShowcaseReward threw when RPC encountered missing table 42P01 in production');
  assert(caughtError?.code === '42P01' || caughtError?.postgresCode === '42P01', 'Error code 42P01 preserved');
}

// --- Test 5: Production - Accidentally enabled fallback flag does NOT permit fallback in production ---
console.log('\n--- Test 5: Production - Fallback flag accidentally enabled is rejected ---');
{
  const dangerousEnv = {
    ENVIRONMENT: 'production',
    ALLOW_LOCAL_FALLBACK: 'true',
    ENABLE_SHOWCASE_FALLBACK: 'true',
  };

  const allowed = isShowcaseFallbackAllowed(dangerousEnv);
  assertEqual(allowed, false, 'isShowcaseFallbackAllowed returns false in production regardless of flags');

  const event = createMockEvent();
  let threw = false;
  try {
    // Calling publish with unconfigured database in production must fail closed
    await publishShowcase(event.id, { title: 'Accidental Flag Attempt' }, dangerousEnv);
  } catch (err: any) {
    threw = true;
  }
  assert(threw, 'publishShowcase strictly failed closed in production even with fallback flags set');
}

// --- Test 6: Development/Test - Non-production environment permits compatibility fallback when allowed ---
console.log('\n--- Test 6: Development/Test - Non-production environment compatibility ---');
{
  const devEnv = {
    ENVIRONMENT: 'development',
    ALLOW_LOCAL_FALLBACK: 'true',
  };

  const allowed = isShowcaseFallbackAllowed(devEnv);
  assertEqual(allowed, true, 'isShowcaseFallbackAllowed returns true in development with explicit flag');

  const event = createMockEvent();
  const published = await publishShowcase(event.id, { title: 'Dev Showcase' }, devEnv);
  assert(!!published, 'publishShowcase succeeds in development via local store');
  assertEqual(published.title, 'Dev Showcase', 'Title matches in dev store');
}

// --- Test 7: Error Exposure - EXPOSE_API_ERRORS=false returns generic client error and logs details ---
console.log('\n--- Test 7: EXPOSE_API_ERRORS=false returns generic client error ---');
{
  const mockError = new Error('column events_1.event_type does not exist');
  (mockError as any).code = '42703';
  (mockError as any).postgresCode = '42703';

  const mockRequest = new Request('https://api.example.com/api/events/123/showcase/publish', {
    method: 'POST',
  });

  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
  };

  const envWithoutExpose = {
    ENVIRONMENT: 'production',
    EXPOSE_API_ERRORS: 'false',
  };

  const response = await handleWorkerApiError(mockError, mockRequest, cors, envWithoutExpose);
  const responseBody = await response.json();

  assertEqual(response.status, 500, 'HTTP status is 500');
  assertEqual(
    responseBody.error,
    'Something went wrong. Please try again.',
    'Client receives generic sanitized error when EXPOSE_API_ERRORS=false'
  );
  assert(!!responseBody.requestId, 'Response includes correlation requestId');
  assert(!responseBody.error.includes('event_type'), 'Database column error is NOT leaked to client');
}

// --- Test 8: Error Exposure - EXPOSE_API_ERRORS=true exposes detailed error for debugging ---
console.log('\n--- Test 8: EXPOSE_API_ERRORS=true exposes detailed error ---');
{
  const mockError = new Error('Database error updating showcase: column events_1.event_type does not exist');
  (mockError as any).code = '42703';

  const mockRequest = new Request('https://api.example.com/api/events/123/showcase/publish', {
    method: 'POST',
  });

  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
  };

  const envWithExpose = {
    ENVIRONMENT: 'production',
    EXPOSE_API_ERRORS: 'true',
  };

  const response = await handleWorkerApiError(mockError, mockRequest, cors, envWithExpose);
  const responseBody = await response.json();

  assertEqual(response.status, 500, 'HTTP status is 500');
  assert(
    responseBody.error.includes('column events_1.event_type does not exist'),
    'Detailed error exposed to client when EXPOSE_API_ERRORS=true'
  );
  assert(!!responseBody.requestId, 'Response includes correlation requestId');
}

// --- Test 9: EXPOSE_API_ERRORS does NOT influence fallback decisions ---
console.log('\n--- Test 9: EXPOSE_API_ERRORS does NOT enable fallback ---');
{
  const envWithExposeInProd = {
    ENVIRONMENT: 'production',
    EXPOSE_API_ERRORS: 'true',
  };

  assertEqual(
    isShowcaseFallbackAllowed(envWithExposeInProd),
    false,
    'isShowcaseFallbackAllowed is FALSE even when EXPOSE_API_ERRORS=true'
  );
}

// --- Test 10: Duplicate Showcase Reward Protection Remains Intact ---
console.log('\n--- Test 10: Duplicate Showcase Reward Protection ---');
{
  const eventA = createMockEvent();
  const showcaseA = {
    id: crypto.randomUUID(),
    organization_id: orgId,
    owner_user_id: ownerUserId,
    event_id: eventA.id,
    reward_review_status: 'AWAITING_APPROVAL',
    reward_status: 'PENDING',
  };

  let rpcCallCount = 0;
  const prodEnvWithSupabase = {
    ENVIRONMENT: 'production',
    SUPABASE_URL: 'https://real-project.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'real-service-key-12345',
    __supabaseClient: {
      from: (table: string) => {
        if (table === 'event_showcases') return createMockChain(showcaseA);
        return createMockChain(null);
      },
      rpc: async (fn: string) => {
        if (fn === 'approve_first_event_showcase_reward_atomic') {
          rpcCallCount++;
          if (rpcCallCount === 1) {
            return {
              data: {
                success: true,
                already_rewarded: false,
                showcase: {
                  ...showcaseA,
                  reward_review_status: 'REWARDED',
                  reward_status: 'REWARDED',
                  reward_transaction_id: crypto.randomUUID(),
                  reward_granted_at: new Date().toISOString(),
                },
              },
              error: null,
            };
          } else {
            return {
              data: {
                success: true,
                already_rewarded: true,
                showcase: {
                  ...showcaseA,
                  reward_review_status: 'REWARDED',
                  reward_status: 'REWARDED',
                },
              },
              error: null,
            };
          }
        }
        return { data: null, error: null };
      },
    },
  };

  const firstApproval = await approveShowcaseReward(showcaseA.id, 'reviewer-1', prodEnvWithSupabase);
  assertEqual(firstApproval.alreadyRewarded, false, 'First approval awards reward');

  const secondApproval = await approveShowcaseReward(showcaseA.id, 'reviewer-1', prodEnvWithSupabase);
  assertEqual(secondApproval.alreadyRewarded, true, 'Second approval detects already rewarded and does not duplicate');
}

console.log('\n========================================================================');
console.log(` RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log('========================================================================');

if (failed > 0) {
  process.exit(1);
}
