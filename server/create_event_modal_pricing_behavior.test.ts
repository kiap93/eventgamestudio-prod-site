import { describe, it, expect } from 'bun:test';
import { isNoPricingTierError, formatEventErrorMessage } from '../src/components/events/eventErrorUtils.js';
import { resolveGamePrice, localGamePricingCache } from './db/gamePricing.js';
import { calculateEventAuthoritativePrice } from './db/platformSettings.js';
import { calculateEventCalendarDays } from '../src/lib/dateUtils.js';

describe('Create Event Modal Pricing Behavior', () => {
  const testEnv = {
    PLATFORM_PRICING_TEST_MODE: 'true',
  };

  it('1. isNoPricingTierError correctly classifies missing pricing tier errors', () => {
    expect(isNoPricingTierError({ code: 'NO_PRICING_TIER' })).toBe(true);
    expect(isNoPricingTierError({ code: 'UNSUPPORTED_DURATION' })).toBe(true);
    expect(isNoPricingTierError({ code: 'DURATION_NOT_SUPPORTED' })).toBe(true);
    expect(isNoPricingTierError({ error: 'No pricing tier is configured for a 57-day event for this game.' })).toBe(true);
    expect(isNoPricingTierError({ message: 'No pricing tier is configured for a 100-day event.' })).toBe(true);
    expect(isNoPricingTierError({ error: 'not configured for a 57-day event' })).toBe(true);

    // Operational errors that are NOT pricing tier absence:
    expect(isNoPricingTierError({ code: 'INVALID_DATE_RANGE' })).toBe(false);
    expect(isNoPricingTierError({ code: 'INSUFFICIENT_BALANCE' })).toBe(false);
    expect(isNoPricingTierError({ code: 'GAME_INACTIVE' })).toBe(false);
    expect(isNoPricingTierError({ error: 'Internal Server Error' })).toBe(false);
  });

  it('2. formatEventErrorMessage replaces old red error text with friendly text', () => {
    const rawError = {
      error: 'No pricing tier is configured for a 57-day event for this game. Pricing cannot be resolved.',
      code: 'NO_PRICING_TIER',
    };
    const formatted = formatEventErrorMessage(rawError, 422);

    expect(formatted).not.toContain('No pricing tier is configured');
    expect(formatted).toBe('Pricing unavailable for this event duration. Please contact us for a custom quotation.');
  });

  it('3. Multiple event durations with pricing return valid authoritative prices', async () => {
    const gameId = '00000000-0000-0000-0000-000000000099';
    // Configure tiers: 1-1 days, 2-7 days, 8-15 days, 16-30 days
    localGamePricingCache.set(gameId, [
      { id: 'tier-1d', min_days: 1, max_days: 1, price: 1400, currency: 'MYR', country_code: 'MY', is_active: true, is_base: true },
      { id: 'tier-7d', min_days: 2, max_days: 7, price: 2800, currency: 'MYR', country_code: 'MY', is_active: true, is_base: false },
      { id: 'tier-15d', min_days: 8, max_days: 15, price: 4000, currency: 'MYR', country_code: 'MY', is_active: true, is_base: false },
      { id: 'tier-30d', min_days: 16, max_days: 30, price: 5000, currency: 'MYR', country_code: 'MY', is_active: true, is_base: false },
    ]);

    // Test 1-day event
    const q1 = await resolveGamePrice(gameId, 1, 'MY', testEnv);
    expect(q1.success).toBe(true);
    if (q1.success) {
      expect(q1.price).toBe(1400);
      expect(q1.currency).toBe('MYR');
    }

    // Test 7-day event
    const q7 = await resolveGamePrice(gameId, 7, 'MY', testEnv);
    expect(q7.success).toBe(true);
    if (q7.success) {
      expect(q7.price).toBe(2800);
    }

    // Test 15-day event
    const q15 = await resolveGamePrice(gameId, 15, 'MY', testEnv);
    expect(q15.success).toBe(true);
    if (q15.success) {
      expect(q15.price).toBe(4000);
    }
  });

  it('4. Event duration without pricing (57 days) returns NO_PRICING_TIER failure', async () => {
    const gameId = '00000000-0000-0000-0000-000000000099';
    // Duration 57 days is NOT covered by the 1-30 day tiers
    const q57 = await resolveGamePrice(gameId, 57, 'MY', testEnv);
    expect(q57.success).toBe(false);
    if (!q57.success) {
      expect(q57.error).toBe('NO_PRICING_TIER');
      expect(isNoPricingTierError(q57)).toBe(true);
    }

    // Also test calculateEventAuthoritativePrice fails closed with 422 NO_PRICING_TIER
    let caught: any = null;
    try {
      await calculateEventAuthoritativePrice({
        game_id: gameId,
        startDate: '2026-10-01',
        endDate: '2026-11-26', // 57 days
        country_code: 'MY',
      }, testEnv);
    } catch (err: any) {
      caught = err;
    }

    expect(caught).not.toBeNull();
    expect(caught.status).toBe(422);
    expect(caught.code).toBe('NO_PRICING_TIER');
    expect(isNoPricingTierError(caught)).toBe(true);
  });

  it('5. Dynamic date changes: 57 days (unavailable) -> change to 1 day (available)', async () => {
    const gameId = '00000000-0000-0000-0000-000000000099';

    // Step A: 57 days -> Unavailable
    const days57 = calculateEventCalendarDays('2026-10-01', '2026-11-26');
    expect(days57).toBe(57);
    const qA = await resolveGamePrice(gameId, days57, 'MY', testEnv);
    expect(qA.success).toBe(false);
    expect(isNoPricingTierError(qA)).toBe(true);

    // Step B: User changes end date back to same start date (1 day) -> Available
    const days1 = calculateEventCalendarDays('2026-10-01', '2026-10-01');
    expect(days1).toBe(1);
    const qB = await resolveGamePrice(gameId, days1, 'MY', testEnv);
    expect(qB.success).toBe(true);
    if (qB.success) {
      expect(qB.price).toBe(1400);
    }
  });

  it('6. Dynamic game changes: Game with tiers vs Game without tiers for duration', async () => {
    const gameA = '00000000-0000-0000-0000-000000000099';
    const gameB = '00000000-0000-0000-0000-000000000088';

    // Game B only has 1-day tier
    localGamePricingCache.set(gameB, [
      { id: 'tier-b-1d', min_days: 1, max_days: 1, price: 900, currency: 'MYR', country_code: 'MY', is_active: true, is_base: true },
    ]);

    // 7 days for Game A has pricing
    const quoteA = await resolveGamePrice(gameA, 7, 'MY', testEnv);
    expect(quoteA.success).toBe(true);

    // 7 days for Game B has NO pricing
    const quoteB = await resolveGamePrice(gameB, 7, 'MY', testEnv);
    expect(quoteB.success).toBe(false);
    expect(isNoPricingTierError(quoteB)).toBe(true);
  });
});
