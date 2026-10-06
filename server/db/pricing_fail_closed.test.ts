import assert from 'node:assert';
import {
  getPlatformPricingSettings,
  calculateEventAuthoritativePrice,
  calculateEventPriceFromDuration,
} from './platformSettings.js';
import { calculateEventPayment } from './wallet.js';

async function runPricingFailClosedTests() {
  console.log('--- STARTING PRICING FAIL-CLOSED TESTS ---');

  // Test 1: Production environment without configured Supabase database MUST fail closed
  console.log('1. Testing production environment without Supabase configuration...');
  const fakeProdEnv = {
    NODE_ENV: 'production',
    SUPABASE_URL: '',
    SUPABASE_SERVICE_ROLE_KEY: '',
    ENABLE_LOCAL_STORAGE_FALLBACK: 'false',
  };

  try {
    await getPlatformPricingSettings(fakeProdEnv);
    assert.fail('Expected getPlatformPricingSettings to fail closed in production without database');
  } catch (err: any) {
    assert.strictEqual(err?.status, 503, 'Error must have 503 status code');
    assert(
      err?.message?.includes('Pricing service temporarily unavailable'),
      `Expected message to contain "Pricing service temporarily unavailable", got: ${err?.message}`
    );
    console.log('✓ Passed: Failed closed with 503 in production without Supabase');
  }

  // Test 2: Database query error when Supabase is configured MUST fail closed (NOT fall back to local or RM1,400)
  console.log('2. Testing database query error when Supabase is configured...');
  const fakeDbErrorEnv = {
    NODE_ENV: 'development',
    SUPABASE_URL: 'https://test-error.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key-xyz',
  };

  try {
    await getPlatformPricingSettings(fakeDbErrorEnv);
    assert.fail('Expected getPlatformPricingSettings to fail closed when database query fails');
  } catch (err: any) {
    assert.strictEqual(err?.status, 503, 'Error must have 503 status code');
    assert(
      err?.message?.includes('Pricing service temporarily unavailable'),
      `Expected message to contain "Pricing service temporarily unavailable", got: ${err?.message}`
    );
    console.log('✓ Passed: Database error properly fails closed with 503');
  }

  // Test 3: calculateEventAuthoritativePrice fails closed when pricing service is unavailable
  console.log('3. Testing calculateEventAuthoritativePrice fails closed...');
  try {
    await calculateEventAuthoritativePrice(
      {
        start_date: '2026-09-10',
        end_date: '2026-09-12',
      },
      fakeDbErrorEnv
    );
    assert.fail('Expected calculateEventAuthoritativePrice to fail closed');
  } catch (err: any) {
    assert.strictEqual(err?.status, 503, 'Error must have 503 status code');
    assert(
      err?.message?.includes('Pricing service temporarily unavailable'),
      `Expected message to contain "Pricing service temporarily unavailable", got: ${err?.message}`
    );
    console.log('✓ Passed: calculateEventAuthoritativePrice fails closed with 503');
  }

  // Test 4: calculateEventPayment fails closed if called without price and DB is unavailable
  console.log('4. Testing calculateEventPayment without price fails closed...');
  try {
    await calculateEventPayment(
      0, // missing/zero price
      'FULL_PAID',
      '00000000-0000-0000-0000-000000000001',
      undefined,
      fakeDbErrorEnv
    );
    assert.fail('Expected calculateEventPayment to fail closed when price is missing and pricing service unavailable');
  } catch (err: any) {
    assert.strictEqual(err?.status, 503, 'Error must have 503 status code');
    assert(
      err?.message?.includes('Pricing service temporarily unavailable') || err?.message?.includes('Pricing configuration error'),
      `Expected message to contain pricing error, got: ${err?.message}`
    );
    console.log('✓ Passed: calculateEventPayment fails closed with 503');
  }

  // Test 5: calculateEventPriceFromDuration fails closed if settings contain no price
  console.log('5. Testing calculateEventPriceFromDuration with corrupt settings...');
  try {
    calculateEventPriceFromDuration(1, {
      default_price: 0,
      default_currency: 'MYR',
      pricing_rules: [],
      updated_at: new Date().toISOString(),
      updated_by: null,
    });
    assert.fail('Expected calculateEventPriceFromDuration to throw when no valid price exists');
  } catch (err: any) {
    assert.strictEqual(err?.status, 503);
    assert(err?.message?.includes('Pricing service temporarily unavailable'));
    console.log('✓ Passed: calculateEventPriceFromDuration fails closed on corrupt settings');
  }

  // Test 6: Offline local dev/test fallback works ONLY when Supabase is completely unconfigured
  console.log('6. Testing offline dev environment when Supabase is unconfigured...');
  const offlineDevEnv = {
    NODE_ENV: 'test',
    SUPABASE_URL: '',
    SUPABASE_SERVICE_ROLE_KEY: '',
    ENABLE_LOCAL_STORAGE_FALLBACK: 'true',
  };
  const offlineSettings = await getPlatformPricingSettings(offlineDevEnv);
  assert(offlineSettings.default_price > 0, 'Offline settings have valid default price');
  console.log('✓ Passed: Offline dev sandbox works when Supabase is unconfigured:', offlineSettings.default_price);

  console.log('--- ALL PRICING FAIL-CLOSED TESTS PASSED ---');
}

runPricingFailClosedTests().catch((err) => {
  console.error('Pricing fail-closed test failed:', err);
  process.exit(1);
});
