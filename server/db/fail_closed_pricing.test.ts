import assert from 'node:assert';
import { PricingConfigurationError } from '../errors.js';
import { calculateEventPaymentQuote, processEventPayment } from './wallet.js';
import { localEventsCache } from './events.js';

async function runFailClosedPricingTests() {
  console.log('--- STARTING FAIL-CLOSED PRICING TESTS ---');

  const orgId = '00000000-0000-0000-0000-000000000001';

  // 1. Test event with missing price in cache
  const brokenEventId = '11111111-1111-1111-1111-111111111111';
  localEventsCache.set(brokenEventId, {
    id: brokenEventId,
    organization_id: orgId,
    name: 'Broken Pricing Event',
    game_id: 'catch-brand',
    theme_id: 'default-theme',
    start_date: '2026-10-01',
    end_date: '2026-10-01',
    status: 'DRAFT',
    payment_status: 'UNPAID',
    event_price: undefined as any,
    event_currency: undefined as any,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as any);

  console.log('Test 1: calculateEventPaymentQuote with missing price fails closed...');
  let quoteErrorCaught = false;
  try {
    await calculateEventPaymentQuote({
      organizationId: orgId,
      eventId: brokenEventId,
      creditChoice: 'NONE',
    });
  } catch (err: any) {
    quoteErrorCaught = true;
    assert.strictEqual(err instanceof PricingConfigurationError, true, 'Error should be instance of PricingConfigurationError');
    assert.strictEqual(err.statusCode, 503, 'Status code must be 503');
    assert.strictEqual(err.code, 'PRICING_CONFIGURATION_ERROR', 'Error code must be PRICING_CONFIGURATION_ERROR');
    console.log('✓ Caught expected PricingConfigurationError on quote calculation:', err.message);
  }
  assert.strictEqual(quoteErrorCaught, true, 'Must fail closed with PricingConfigurationError');

  console.log('Test 2: processEventPayment with missing price fails closed...');
  let paymentErrorCaught = false;
  try {
    await processEventPayment({
      organizationId: orgId,
      eventId: brokenEventId,
      paymentMode: 'FULL_PAID',
    });
  } catch (err: any) {
    paymentErrorCaught = true;
    assert.strictEqual(err instanceof PricingConfigurationError, true, 'Error should be instance of PricingConfigurationError');
    assert.strictEqual(err.statusCode, 503, 'Status code must be 503');
    assert.strictEqual(err.code, 'PRICING_CONFIGURATION_ERROR', 'Error code must be PRICING_CONFIGURATION_ERROR');
    console.log('✓ Caught expected PricingConfigurationError on processEventPayment:', err.message);
  }
  assert.strictEqual(paymentErrorCaught, true, 'Must fail closed on payment execution');

  console.log('Test 3: Event with zero/negative price fails closed...');
  const zeroPriceEventId = '22222222-2222-2222-2222-222222222222';
  localEventsCache.set(zeroPriceEventId, {
    id: zeroPriceEventId,
    organization_id: orgId,
    name: 'Zero Price Event',
    game_id: 'catch-brand',
    theme_id: 'default-theme',
    start_date: '2026-10-01',
    end_date: '2026-10-01',
    status: 'DRAFT',
    payment_status: 'UNPAID',
    event_price: 0,
    event_currency: 'MYR',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as any);

  let zeroErrorCaught = false;
  try {
    await calculateEventPaymentQuote({
      organizationId: orgId,
      eventId: zeroPriceEventId,
      creditChoice: 'NONE',
    });
  } catch (err: any) {
    zeroErrorCaught = true;
    assert.strictEqual(err instanceof PricingConfigurationError, true);
    assert.strictEqual(err.statusCode, 503);
    assert.strictEqual(err.code, 'PRICING_CONFIGURATION_ERROR');
    console.log('✓ Caught expected PricingConfigurationError on zero price:', err.message);
  }
  assert.strictEqual(zeroErrorCaught, true, 'Must fail closed on zero price');

  console.log('--- ALL FAIL-CLOSED PRICING TESTS PASSED SUCCESSFULLY! ---');
}

runFailClosedPricingTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
