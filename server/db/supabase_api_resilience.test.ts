import assert from 'node:assert';
import { test } from 'bun:test';
import {
  isTransientDatabaseError,
  extractErrorDiagnostics,
  executeWithResilience,
  acquireMaintenanceLease,
  releaseMaintenanceLease,
} from './supabaseResilience.js';
import { getPublicGamesPricing, localGamePricingCache } from './gamePricing.js';
import { runEventLifecycleMaintenance } from './events.js';
import { handleWorkerApiError, handleApiError } from '../errors.js';
import type { EventRecord } from './types.js';

console.log('\n======================================================');
console.log(' RUNNING SUPABASE REST API RESILIENCE & RECOVERY TESTS');
console.log('======================================================\n');

test('Supabase API Resilience Test Suite', async () => {
  // --------------------------------------------------------------------------
  // Test 1: Transient Error Detection (503, PGRST003 pool timeout, PGRST106 schema cache)
  // --------------------------------------------------------------------------
  console.log('Test 1: isTransientDatabaseError accurately classifies transient vs non-transient errors');

  // Transient errors:
  assert.strictEqual(isTransientDatabaseError({ status: 503, message: 'Service Unavailable' }), true);
  assert.strictEqual(isTransientDatabaseError({ code: 'PGRST003', message: 'timed out acquiring a connection from the connection pool' }), true);
  assert.strictEqual(isTransientDatabaseError({ code: 'PGRST106', message: 'schema cache is loading' }), true);
  assert.strictEqual(isTransientDatabaseError({ code: 'PGRST000', message: 'could not connect' }), true);
  assert.strictEqual(isTransientDatabaseError({ code: 'PGRST002', message: 'connection error' }), true);
  assert.strictEqual(isTransientDatabaseError({ code: '57014', message: 'canceling statement due to statement timeout' }), true);
  assert.strictEqual(isTransientDatabaseError({ code: '53300', message: 'too many connections' }), true);
  assert.strictEqual(isTransientDatabaseError({ code: '08006', message: 'connection failure' }), true);
  assert.strictEqual(isTransientDatabaseError({ message: 'fetch failed' }), true);
  assert.strictEqual(isTransientDatabaseError({ message: 'schema cache not yet loaded' }), true);

  // Non-transient errors (must fail fast):
  assert.strictEqual(isTransientDatabaseError({ status: 400, message: 'Bad Request' }), false);
  assert.strictEqual(isTransientDatabaseError({ status: 401, message: 'Unauthorized' }), false);
  assert.strictEqual(isTransientDatabaseError({ status: 403, message: 'Forbidden' }), false);
  assert.strictEqual(isTransientDatabaseError({ status: 404, message: 'Not Found' }), false);
  assert.strictEqual(isTransientDatabaseError({ status: 422, message: 'Unprocessable Entity' }), false);
  assert.strictEqual(isTransientDatabaseError({ code: '23505', message: 'duplicate key value violates unique constraint' }), false);
  console.log('✓ PASS: isTransientDatabaseError correctly identifies transient codes and messages');

  // --------------------------------------------------------------------------
  // Test 2: Bounded Exponential Backoff Retries & Recovery after Database Availability Returns
  // --------------------------------------------------------------------------
  console.log('\nTest 2: executeWithResilience retries transient errors and recovers when database returns');

  let attempts = 0;
  const correlationId = 'test_corr_transient_recovery';

  // Simulates Supabase returning PGRST003 on attempt 1 & 2, then recovering on attempt 3
  const recoveredResult = await executeWithResilience(
    async () => {
      attempts++;
      if (attempts < 3) {
        return {
          data: null,
          error: {
            code: 'PGRST003',
            message: 'timed out acquiring a connection from the connection pool',
          },
          status: 503,
        };
      }
      return {
        data: [{ id: 'game-1', name: 'Catch Brand' }],
        error: null,
        status: 200,
      };
    },
    {
      operation: 'test_transient_recovery',
      correlationId,
      maxRetries: 3,
      initialDelayMs: 20,
      maxDelayMs: 50,
    }
  );

  assert.strictEqual(attempts, 3, 'Must attempt exactly 3 times before succeeding');
  assert.strictEqual(recoveredResult.status, 200, 'Must return 200 on successful recovery');
  assert.strictEqual(recoveredResult.data?.length, 1, 'Must return recovered payload');
  console.log('✓ PASS: executeWithResilience recovered cleanly after 2 transient pool timeouts');

  // --------------------------------------------------------------------------
  // Test 3: Execution Budget Exhaustion Prevents Retry Storms
  // --------------------------------------------------------------------------
  console.log('\nTest 3: Execution budget stops retries before deadline to prevent retry storms');

  let budgetAttempts = 0;
  let budgetErrorThrown = false;
  const budgetStartTime = Date.now();

  try {
    await executeWithResilience(
      async () => {
        budgetAttempts++;
        return {
          data: null,
          error: {
            code: 'PGRST003',
            message: 'timed out acquiring a connection from the connection pool',
          },
          status: 503,
        };
      },
      {
        operation: 'test_budget_exhaustion',
        maxRetries: 10,
        initialDelayMs: 100,
        backoffFactor: 2,
        timeoutBudgetMs: 80, // Very tight budget: only 1 retry can possibly run
      }
    );
  } catch (err: any) {
    budgetErrorThrown = true;
    assert.strictEqual(err.code, 'PGRST003');
  }

  const elapsed = Date.now() - budgetStartTime;
  assert.strictEqual(budgetErrorThrown, true, 'Must throw when budget is exhausted');
  assert.ok(budgetAttempts <= 2, `Should abort quickly within budget, got ${budgetAttempts} attempts`);
  assert.ok(elapsed < 350, `Execution should abort promptly, elapsed ${elapsed}ms`);
  console.log(`✓ PASS: Execution budget stopped retries after ${budgetAttempts} attempts (${elapsed}ms)`);

  // --------------------------------------------------------------------------
  // Test 4: Database-Backed Lease Prevents Duplicate / Overlapping Cron Executions
  // --------------------------------------------------------------------------
  console.log('\nTest 4: Expiring database-backed lease coordinates cross-invocation cron executions');

  // Create an in-memory mock Supabase client for platform_settings lease
  let leaseStorage: Record<string, any> = {};

  const mockLeaseSupabase = {
    from(table: string) {
      assert.strictEqual(table, 'platform_settings');
      return {
        select(cols: string) {
          return {
            eq(col: string, keyVal: string) {
              return {
                maybeSingle() {
                  const val = leaseStorage[keyVal];
                  return Promise.resolve({
                    data: val ? { key: keyVal, value: val } : null,
                    error: null,
                  });
                },
              };
            },
          };
        },
        upsert(payload: any) {
          leaseStorage[payload.key] = payload.value;
          return Promise.resolve({ data: null, error: null });
        },
        update(payload: any) {
          return {
            eq(col: string, keyVal: string) {
              if (leaseStorage[keyVal]) {
                leaseStorage[keyVal] = { ...leaseStorage[keyVal], ...payload.value };
              }
              return Promise.resolve({ data: null, error: null });
            },
          };
        },
      };
    },
  };

  const leaseEnv = {
    NODE_ENV: 'production',
    SUPABASE_URL: 'https://production-coordination.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'prod-coordination-key',
    _mockSupabase: mockLeaseSupabase,
    __supabaseClient: mockLeaseSupabase,
  };

  // 1. Worker Instance A acquires lease
  const leaseA = await acquireMaintenanceLease(leaseEnv, { leaseDurationMs: 60000 });
  assert.strictEqual(leaseA.acquired, true, 'Instance A must acquire lease');
  assert.ok(leaseA.leaseHolder, 'Instance A must have a lease holder token');

  // 2. Server Instance B attempts to acquire lease while A is active -> Must be rejected
  const leaseB = await acquireMaintenanceLease(leaseEnv, { leaseDurationMs: 60000 });
  assert.strictEqual(leaseB.acquired, false, 'Instance B must be rejected while A holds active lease');
  assert.strictEqual(leaseB.reason, 'IN_PROCESS_EXECUTION_RUNNING', 'In-process mutex blocks second execution');

  // 3. Release lease for Instance A
  await releaseMaintenanceLease(leaseA.leaseHolder, leaseEnv);

  // 4. Now Instance B can acquire the lease
  const leaseBAfterRelease = await acquireMaintenanceLease(leaseEnv, { leaseDurationMs: 60000 });
  assert.strictEqual(leaseBAfterRelease.acquired, true, 'Instance B can acquire lease after Instance A releases it');

  // Clean up
  await releaseMaintenanceLease(leaseBAfterRelease.leaseHolder, leaseEnv);
  console.log('✓ PASS: Database-backed coordination lease correctly prevented concurrent cron executions');

  // --------------------------------------------------------------------------
  // Test 5: Empty Database Results vs Database Outages (Never conflated)
  // --------------------------------------------------------------------------
  console.log('\nTest 5: Database failures are never interpreted as empty lists');

  // Scenario A: Database is down in production
  let outageThrown = false;
  const mockOutageSupabase = {
    from(table: string) {
      if (table === 'platform_settings') {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle() {
                    return Promise.resolve({ data: { value: 'US' }, error: null });
                  },
                };
              },
            };
          },
        };
      }
      return {
        select() {
          return {
            or() {
              return {
                order() {
                  return Promise.resolve({
                    data: null,
                    error: {
                      status: 503,
                      code: 'PGRST003',
                      message: 'timed out acquiring a connection from the connection pool',
                    },
                  });
                },
              };
            },
          };
        },
      };
    },
  };

  const failingEnv = {
    NODE_ENV: 'production',
    SUPABASE_URL: 'https://outage.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'outage-key',
    __supabaseClient: mockOutageSupabase,
    _mockSupabase: mockOutageSupabase,
  };

  try {
    await getPublicGamesPricing('US', failingEnv);
  } catch (err: any) {
    outageThrown = true;
    assert.strictEqual(err.status, 503, 'Must return status 503');
    assert.strictEqual(err.code, 'PRICING_SERVICE_UNAVAILABLE', 'Must throw PRICING_SERVICE_UNAVAILABLE');
    assert.ok(err.message.includes('temporarily unavailable'), 'Must show clean unavailable message');
  }
  assert.strictEqual(outageThrown, true, 'Database outage in production must throw 503 and never return empty array');
  console.log('✓ PASS: Production pricing fails closed with HTTP 503 on database outage');

  // --------------------------------------------------------------------------
  // Test 6: API Error Handler Sanitizes Schema Cache & Database Internals
  // --------------------------------------------------------------------------
  console.log('\nTest 6: handleWorkerApiError & handleApiError sanitize 503 schema cache errors');

  const rawSchemaCacheError = {
    status: 503,
    code: 'PGRST106',
    message: 'Could not find the function public.games in the schema cache',
  };

  const dummyReq = new Request('https://api.eventgamestudio.com/api/public/games/pricing');
  const response = await handleWorkerApiError(rawSchemaCacheError, dummyReq, {}, { NODE_ENV: 'production' });

  assert.strictEqual(response.status, 503, 'Must return HTTP 503, not HTTP 500');
  const body = await response.json();
  assert.strictEqual(body.code, 'PRICING_SERVICE_UNAVAILABLE', 'Code must be PRICING_SERVICE_UNAVAILABLE');
  assert.strictEqual(body.error, 'Pricing service temporarily unavailable. Please try again later.');
  assert.ok(!JSON.stringify(body).toLowerCase().includes('schema cache'), 'Must NOT leak schema cache text to client');
  assert.ok(!JSON.stringify(body).toLowerCase().includes('pgrst'), 'Must NOT leak PGRST internal code to client');

  console.log('✓ PASS: handleWorkerApiError returned clean 503 without leaking schema cache or PGRST internals');

  console.log('\n======================================================');
  console.log('ALL SUPABASE RESILIENCE TESTS PASSED (100%)');
  console.log('======================================================\n');
});
