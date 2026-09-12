import assert from 'node:assert';
import { runEventLifecycleMaintenance, localEventsCache } from './events.js';
import { isLocalFallbackAllowed, isProductionEnvironment, assertProductionMaintenanceSafe } from '../supabase.js';

async function runTests() {
  console.log('--- Starting Production Cron Fallback Safety Tests ---');
  localEventsCache.clear();

  // Test 1: Distinguishes production from development environments
  console.log('Test 1: Distinguishes production from development environments');
  const devEnv = { NODE_ENV: 'development', ALLOW_LOCAL_FALLBACK: 'true' };
  const prodEnv = { NODE_ENV: 'production' };
  const workerProdEnv = { ENVIRONMENT: 'production' };

  assert.strictEqual(isLocalFallbackAllowed(devEnv), true);
  assert.strictEqual(isLocalFallbackAllowed(prodEnv), false);
  assert.strictEqual(isLocalFallbackAllowed(workerProdEnv), false);
  assert.strictEqual(isProductionEnvironment(prodEnv), true);
  assert.strictEqual(isProductionEnvironment(workerProdEnv), true);
  console.log('✓ Test 1 passed');

  // Test 2: assertProductionMaintenanceSafe throws in production when Supabase is missing
  console.log('Test 2: assertProductionMaintenanceSafe throws in production when Supabase is missing');
  const unconfiguredProdEnv = {
    NODE_ENV: 'production',
    SUPABASE_URL: '',
    SUPABASE_SERVICE_ROLE_KEY: '',
  };

  assert.throws(
    () => {
      assertProductionMaintenanceSafe('runEventLifecycleMaintenance', unconfiguredProdEnv);
    },
    /Fatal: Event lifecycle maintenance operation "runEventLifecycleMaintenance" requires a valid Supabase database connection/
  );
  console.log('✓ Test 2 passed');

  // Test 3: runEventLifecycleMaintenance strictly throws fatal error in production if Supabase is unconfigured
  console.log('Test 3: runEventLifecycleMaintenance strictly throws fatal error in production if Supabase is unconfigured');
  localEventsCache.set('ev-1', {
    id: 'ev-1',
    organization_id: 'org-1',
    name: 'Test Event',
    game_id: 'catch-brand',
    game_theme_id: 'theme-1',
    status: 'scheduled',
    payment_status: 'UNPAID',
    start_date: '2026-09-01',
    end_date: '2026-09-02',
    starts_at: '2026-09-01T00:00:00.000Z',
    expires_at: '2026-09-02T23:59:59.999Z',
    public_token: 'token-1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  let threw3 = false;
  try {
    await runEventLifecycleMaintenance(unconfiguredProdEnv);
  } catch (err: any) {
    threw3 = true;
    assert.ok(err.message.includes('Fatal: Event lifecycle maintenance operation'));
  }
  assert.strictEqual(threw3, true, 'Should have thrown fatal error in unconfigured production environment');
  console.log('✓ Test 3 passed');

  // Test 4: runEventLifecycleMaintenance strictly throws in production if Supabase query fails or returns null
  console.log('Test 4: runEventLifecycleMaintenance strictly throws in production if Supabase query fails or returns null');
  const failingProdEnv = {
    NODE_ENV: 'production',
    SUPABASE_URL: 'https://test-error.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.testsecret',
  };

  localEventsCache.set('unpaid-expired-ev', {
    id: 'unpaid-expired-ev',
    organization_id: 'org-1',
    name: 'Unpaid Expired Event',
    game_id: 'catch-brand',
    game_theme_id: 'theme-1',
    status: 'scheduled',
    payment_status: 'UNPAID',
    start_date: '2026-09-01',
    end_date: '2026-09-02',
    starts_at: '2026-09-01T00:00:00.000Z',
    expires_at: '2026-09-02T23:59:59.999Z',
    public_token: 'token-expired',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  let threw4 = false;
  try {
    await runEventLifecycleMaintenance(failingProdEnv);
  } catch (err: any) {
    threw4 = true;
    assert.ok(/Fatal: Failed to (fetch|query) events from Supabase in production/.test(err.message));
    assert.ok(err.message.includes('Local cache fallback is strictly prohibited in production'));
  }
  assert.strictEqual(threw4, true, 'Should have thrown fatal error when Supabase query fails in production');

  // Verify local cache status was NOT touched by a failed production run
  const cached = localEventsCache.get('unpaid-expired-ev');
  assert.strictEqual(cached?.status, 'scheduled');
  console.log('✓ Test 4 passed');

  // Test 5: runEventLifecycleMaintenance works with local cache in development/test environment
  console.log('Test 5: runEventLifecycleMaintenance works with local cache in development/test environment');
  localEventsCache.clear();
  const testDevEnv = {
    NODE_ENV: 'test',
    ALLOW_LOCAL_FALLBACK: 'true',
  };

  const testNow = new Date('2026-09-10T00:00:00.000Z');
  localEventsCache.set('dev-unpaid-expired', {
    id: 'dev-unpaid-expired',
    organization_id: 'org-1',
    name: 'Dev Unpaid Expired Event',
    game_id: 'catch-brand',
    game_theme_id: 'theme-1',
    status: 'scheduled',
    payment_status: 'UNPAID',
    start_date: '2026-09-01',
    end_date: '2026-09-02',
    starts_at: '2026-09-01T00:00:00.000Z',
    expires_at: '2026-09-02T23:59:59.999Z',
    public_token: 'token-dev-1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const result = await runEventLifecycleMaintenance(testDevEnv, testNow);
  assert.strictEqual(result.expiredCount, 1);
  assert.ok(result.expiredEvents.includes('dev-unpaid-expired'));
  const updated = localEventsCache.get('dev-unpaid-expired');
  assert.strictEqual(updated?.status, 'expired');
  console.log('✓ Test 5 passed');

  console.log('======================================================');
  console.log('All Production Cron Fallback Safety Tests Passed!');
  console.log('======================================================');
}

runTests().catch((err) => {
  console.error('Fatal error in Production Cron Fallback Safety test:', err);
  process.exit(1);
});
