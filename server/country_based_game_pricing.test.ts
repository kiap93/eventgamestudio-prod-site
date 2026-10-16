import { describe, it, expect, beforeEach } from 'bun:test';
import {
  localGamePricingCache,
  createGamePricingTier,
  getGamePricing,
  getActiveGamePricing,
  resolveGamePrice,
  getPublicGamesPricing,
  validateNoOverlappingPricingTier,
  bulkUpsertGamePricing,
  updateGamePricingTier,
  deleteGamePricingTier,
} from './db/gamePricing.js';
import {
  calculateEventAuthoritativePrice,
  getDefaultPricingCountry,
  updatePlatformPricingSettings,
} from './db/platformSettings.js';
import { createEvent, localEventsCache } from './db/events.js';
import { localOrgsCache } from './db/organizations.js';
import { localThemesCache } from './db/themes.js';
import { localGamesCache } from './db/games.js';

const testEnv = {
  NODE_ENV: 'test',
};

describe('Country-Based Game Pricing with Authoritative Fallback Architecture', () => {
  beforeEach(async () => {
    localGamePricingCache.clear();
    await updatePlatformPricingSettings({
      default_pricing_country: 'US',
    }, 'test-admin', testEnv);
  });

  it('Test 1: Default pricing country is retrieved from platform settings and defaults to US', async () => {
    const defaultCountry = await getDefaultPricingCountry(testEnv);
    expect(defaultCountry).toBe('US');
  });

  it('Test 2: Authoritative Matrix — Case A: US has active pricing, so US is the single fallback country', async () => {
    // Game where:
    // US has: 1 Day = $500, 4–7 Days = not configured
    // MY has: 1 Day = RM1,400, 4–7 Days = RM2,800
    // VN has: not configured
    const gameId = '00000000-0000-0000-0000-0000000000a1';

    const tiers = [
      // US tiers (1 Day only, 4–7 not configured)
      { id: 'tier-us-1d', min_days: 1, max_days: 1, price: 500, currency: 'USD', country_code: 'US', is_active: true, is_base: true },

      // MY tiers (1 Day and 4–7 Days both configured)
      { id: 'tier-my-1d', min_days: 1, max_days: 1, price: 1400, currency: 'MYR', country_code: 'MY', is_active: true, is_base: true },
      { id: 'tier-my-4-7d', min_days: 4, max_days: 7, price: 2800, currency: 'MYR', country_code: 'MY', is_active: true, is_base: false },
    ];
    localGamePricingCache.set(gameId, tiers);

    // 1. VN 1 Day -> US has pricing for this game -> US has 1 Day -> USD 500 (Fallback Level 1)
    const vn1d = await resolveGamePrice(gameId, 1, 'VN', testEnv);
    expect(vn1d.success).toBe(true);
    if (vn1d.success) {
      expect(vn1d.price).toBe(500);
      expect(vn1d.currency).toBe('USD');
      expect(vn1d.requestedCountry).toBe('VN');
      expect(vn1d.pricingCountry).toBe('US');
      expect(vn1d.isFallback).toBe(true);
      expect(vn1d.fallbackLevel).toBe(1);
    }

    // 2. VN 4–7 Days -> US has pricing for this game -> US does NOT have 4–7 Days -> Contact Us
    // CRITICAL REQUIREMENT: MUST NOT fall through to MYR 2,800!
    const vn4d = await resolveGamePrice(gameId, 5, 'VN', testEnv);
    expect(vn4d.success).toBe(false);
    expect(vn4d.error).toBe('NO_PRICING_TIER');
    expect(vn4d.requestedCountry).toBe('VN');
    expect(vn4d.pricingCountry).toBeNull();
    expect(vn4d.isFallback).toBe(false);

    // 3. US itself 1 Day -> USD 500 (Fallback Level 0)
    const us1d = await resolveGamePrice(gameId, 1, 'US', testEnv);
    expect(us1d.success).toBe(true);
    if (us1d.success) {
      expect(us1d.price).toBe(500);
      expect(us1d.currency).toBe('USD');
      expect(us1d.requestedCountry).toBe('US');
      expect(us1d.pricingCountry).toBe('US');
      expect(us1d.isFallback).toBe(false);
      expect(us1d.fallbackLevel).toBe(0);
    }

    // 4. US itself 4–7 Days -> US has pricing for this game -> US does not have 4–7 Days -> Contact Us
    const us4d = await resolveGamePrice(gameId, 5, 'US', testEnv);
    expect(us4d.success).toBe(false);
    expect(us4d.error).toBe('NO_PRICING_TIER');
    expect(us4d.requestedCountry).toBe('US');
    expect(us4d.pricingCountry).toBeNull();

    // 5. MY 1 Day -> MYR 1,400 (Fallback Level 0)
    const my1d = await resolveGamePrice(gameId, 1, 'MY', testEnv);
    expect(my1d.success).toBe(true);
    if (my1d.success) {
      expect(my1d.price).toBe(1400);
      expect(my1d.currency).toBe('MYR');
      expect(my1d.requestedCountry).toBe('MY');
      expect(my1d.pricingCountry).toBe('MY');
      expect(my1d.isFallback).toBe(false);
      expect(my1d.fallbackLevel).toBe(0);
    }

    // 6. MY 4–7 Days -> MYR 2,800 (Fallback Level 0)
    const my4d = await resolveGamePrice(gameId, 5, 'MY', testEnv);
    expect(my4d.success).toBe(true);
    if (my4d.success) {
      expect(my4d.price).toBe(2800);
      expect(my4d.currency).toBe('MYR');
      expect(my4d.requestedCountry).toBe('MY');
      expect(my4d.pricingCountry).toBe('MY');
      expect(my4d.isFallback).toBe(false);
      expect(my4d.fallbackLevel).toBe(0);
    }
  });

  it('Test 3: Authoritative Matrix — Case B: US has ZERO active pricing, so MY becomes the fallback', async () => {
    // Game where:
    // US has: NO active pricing at all
    // MY has: 1 Day = RM1,400, 4–7 Days = RM2,800
    // VN has: not configured
    const gameId = '00000000-0000-0000-0000-0000000000b2';

    const tiers = [
      // Only MY tiers
      { id: 'tier-my-caseb-1d', min_days: 1, max_days: 1, price: 1400, currency: 'MYR', country_code: 'MY', is_active: true, is_base: true },
      { id: 'tier-my-caseb-4-7d', min_days: 4, max_days: 7, price: 2800, currency: 'MYR', country_code: 'MY', is_active: true, is_base: false },
    ];
    localGamePricingCache.set(gameId, tiers);

    // 1. VN 1 Day -> US has 0 tiers -> MY becomes fallback -> MYR 1,400 (Fallback Level 2)
    const vn1d = await resolveGamePrice(gameId, 1, 'VN', testEnv);
    expect(vn1d.success).toBe(true);
    if (vn1d.success) {
      expect(vn1d.price).toBe(1400);
      expect(vn1d.currency).toBe('MYR');
      expect(vn1d.requestedCountry).toBe('VN');
      expect(vn1d.pricingCountry).toBe('MY');
      expect(vn1d.isFallback).toBe(true);
      expect(vn1d.fallbackLevel).toBe(2);
    }

    // 2. VN 4–7 Days -> US has 0 tiers -> MY becomes fallback -> MYR 2,800 (Fallback Level 2)
    const vn4d = await resolveGamePrice(gameId, 5, 'VN', testEnv);
    expect(vn4d.success).toBe(true);
    if (vn4d.success) {
      expect(vn4d.price).toBe(2800);
      expect(vn4d.currency).toBe('MYR');
      expect(vn4d.requestedCountry).toBe('VN');
      expect(vn4d.pricingCountry).toBe('MY');
      expect(vn4d.isFallback).toBe(true);
      expect(vn4d.fallbackLevel).toBe(2);
    }

    // 3. VN 8+ Days -> Neither US nor MY has 8+ days -> Contact Us
    const vn8d = await resolveGamePrice(gameId, 10, 'VN', testEnv);
    expect(vn8d.success).toBe(false);
    expect(vn8d.error).toBe('NO_PRICING_TIER');
    expect(vn8d.requestedCountry).toBe('VN');
    expect(vn8d.pricingCountry).toBeNull();
  });

  it('Test 4: Fail-closed integration with calculateEventAuthoritativePrice', async () => {
    const gameId = '00000000-0000-0000-0000-0000000000c3';
    localGamePricingCache.set(gameId, [
      { id: 'tier-us-1d', min_days: 1, max_days: 1, price: 500, currency: 'USD', country_code: 'US', is_active: true, is_base: true },
      { id: 'tier-my-4-7d', min_days: 4, max_days: 7, price: 2800, currency: 'MYR', country_code: 'MY', is_active: true, is_base: false },
    ]);

    // VN 1 Day succeeds via US fallback
    const auth1d = await calculateEventAuthoritativePrice({
      game_id: gameId,
      startDate: '2026-12-01',
      endDate: '2026-12-01',
      country_code: 'VN',
    }, testEnv);
    expect(auth1d.price).toBe(500);
    expect(auth1d.currency).toBe('USD');
    expect(auth1d.requestedCountry).toBe('VN');
    expect(auth1d.pricingCountry).toBe('US');
    expect(auth1d.isFallback).toBe(true);
    expect(auth1d.fallbackLevel).toBe(1);

    // VN 5 Days fails closed with 422 NO_PRICING_TIER (because US has active tiers but lacks 5 days)
    let failedClosed = false;
    try {
      await calculateEventAuthoritativePrice({
        game_id: gameId,
        startDate: '2026-12-01',
        endDate: '2026-12-05', // 5 days
        country_code: 'VN',
      }, testEnv);
    } catch (err: any) {
      failedClosed = true;
      expect(err.status).toBe(422);
      expect(err.code).toBe('NO_PRICING_TIER');
      expect(err.requestedCountry).toBe('VN');
      expect(err.defaultCountry).toBe('US');
    }
    expect(failedClosed).toBe(true);
  });

  it('Test 5: Explicit resolution metadata structure on both success and Contact Us', async () => {
    const gameId = '00000000-0000-0000-0000-0000000000d4';
    localGamePricingCache.set(gameId, [
      { id: 'tier-sg-1-3', min_days: 1, max_days: 3, price: 800, currency: 'SGD', country_code: 'SG', is_active: true, is_base: true },
    ]);

    // Success response format
    const quoteSuccess = await resolveGamePrice(gameId, 2, 'SG', testEnv);
    expect(quoteSuccess).toEqual({
      success: true,
      price: 800,
      currency: 'SGD',
      pricingId: 'tier-sg-1-3',
      tierId: 'tier-sg-1-3',
      tier: expect.objectContaining({ id: 'tier-sg-1-3', price: 800 }),
      ruleLabel: '1–3 days',
      durationDays: 2,
      requestedCountry: 'SG',
      pricingCountry: 'SG',
      isFallback: false,
      fallbackLevel: 0,
    });

    // Contact Us response format
    const quoteContactUs = await resolveGamePrice(gameId, 10, 'SG', testEnv);
    expect(quoteContactUs).toEqual({
      success: false,
      error: 'NO_PRICING_TIER',
      message: expect.any(String),
      requestedCountry: 'SG',
      pricingCountry: null,
      isFallback: false,
      defaultCountry: 'US',
    });
  });

  it('Test 6: Configurable platform default pricing country in platform settings', async () => {
    const gameId = '00000000-0000-0000-0000-0000000000e5';
    localGamePricingCache.set(gameId, [
      { id: 'tier-sg-1d', min_days: 1, max_days: 1, price: 750, currency: 'SGD', country_code: 'SG', is_active: true, is_base: true },
      { id: 'tier-us-1d', min_days: 1, max_days: 1, price: 500, currency: 'USD', country_code: 'US', is_active: true, is_base: true },
    ]);

    // Initial default is US
    const quoteBefore = await resolveGamePrice(gameId, 1, 'VN', testEnv);
    expect(quoteBefore.success).toBe(true);
    if (quoteBefore.success) {
      expect(quoteBefore.pricingCountry).toBe('US');
      expect(quoteBefore.currency).toBe('USD');
      expect(quoteBefore.price).toBe(500);
    }

    // Admin updates platform default pricing country to SG
    await updatePlatformPricingSettings({
      default_pricing_country: 'SG',
    }, 'test-admin', testEnv);

    const updatedDefault = await getDefaultPricingCountry(testEnv);
    expect(updatedDefault).toBe('SG');

    // VN now falls back to SG
    const quoteAfter = await resolveGamePrice(gameId, 1, 'VN', testEnv);
    expect(quoteAfter.success).toBe(true);
    if (quoteAfter.success) {
      expect(quoteAfter.pricingCountry).toBe('SG');
      expect(quoteAfter.currency).toBe('SGD');
      expect(quoteAfter.price).toBe(750);
      expect(quoteAfter.fallbackLevel).toBe(1);
    }
  });

  it('Test 7: Overlapping pricing tier validation is scoped per country', async () => {
    const gameId = '00000000-0000-0000-0000-0000000000f6';
    localGamePricingCache.set(gameId, [
      { id: 'tier-us-1-3', min_days: 1, max_days: 3, price: 500, currency: 'USD', country_code: 'US', is_active: true, is_base: true },
    ]);

    // Overlapping tier in SAME country (US 2–5 vs US 1–3) must be rejected
    let rejected = false;
    try {
      await validateNoOverlappingPricingTier(gameId, 'US', 2, 5, undefined, testEnv);
    } catch (err: any) {
      rejected = true;
      expect(err.status).toBe(409);
      expect(err.code).toBe('OVERLAPPING_PRICING_TIER');
    }
    expect(rejected).toBe(true);

    // Same duration in DIFFERENT country (FR 1–3 vs US 1–3) is allowed
    let frAllowed = true;
    try {
      await validateNoOverlappingPricingTier(gameId, 'FR', 1, 3, undefined, testEnv);
    } catch {
      frAllowed = false;
    }
    expect(frAllowed).toBe(true);
  });

  it('Test 8: Bulk upserting US pricing does not overwrite or mutate Malaysia pricing', async () => {
    const gameId = '00000000-0000-0000-0000-0000000000g7';

    // 1. Initial Malaysia tiers
    const myTiers = [
      { min_days: 1, max_days: 1, price: 1400, currency: 'MYR', country_code: 'MY', is_active: true, is_base: true },
      { min_days: 2, max_days: 2, price: 1900, currency: 'MYR', country_code: 'MY', is_active: true, is_base: false },
    ];
    await bulkUpsertGamePricing(gameId, myTiers, testEnv);

    // 2. Add US tiers
    const usTiers = [
      { min_days: 1, max_days: 1, price: 450, currency: 'USD', country_code: 'US', is_active: true, is_base: true },
      { min_days: 2, max_days: 2, price: 750, currency: 'USD', country_code: 'US', is_active: true, is_base: false },
    ];
    await bulkUpsertGamePricing(gameId, usTiers, testEnv);

    const loadedAll = await getGamePricing(gameId, undefined, testEnv);
    expect(loadedAll.length).toBe(4);

    const loadedMY = await getGamePricing(gameId, 'MY', testEnv);
    expect(loadedMY.length).toBe(2);
    expect(loadedMY[0].price).toBe(1400);
    expect(loadedMY[0].currency).toBe('MYR');

    const loadedUS = await getGamePricing(gameId, 'US', testEnv);
    expect(loadedUS.length).toBe(2);
    expect(loadedUS[0].price).toBe(450);
    expect(loadedUS[0].currency).toBe('USD');
  });

  it('Test 9: Malicious or cross-country client pricing_id is rejected with PRICING_COUNTRY_MISMATCH', async () => {
    const gameId = '00000000-0000-0000-0000-0000000000h8';
    const orgId = '00000000-0000-0000-0000-000000000088';
    const themeId = '00000000-0000-0000-0000-000000000099';

    // Set up US org
    localOrgsCache.set(orgId, {
      id: orgId,
      name: 'US Enterprise',
      slug: 'us-enterprise',
      country_code: 'US',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any);

    localGamesCache.set(gameId, {
      id: gameId,
      name: 'Reaction Game',
      slug: 'reaction-tap',
      status: 'active',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any);

    localThemesCache.set(themeId, {
      id: themeId,
      organization_id: orgId,
      game_id: gameId,
      name: 'US Theme',
      status: 'active',
      is_system: false,
      is_active: true,
      ownership_type: 'organization',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any);

    // Setup pricing: US tier = USD 500, MY tier = MYR 1400
    localGamePricingCache.set(gameId, [
      { id: 'tier-us-1d', game_id: gameId, min_days: 1, max_days: 1, price: 500, currency: 'USD', country_code: 'US', is_active: true, is_base: true },
      { id: 'tier-my-1d', game_id: gameId, min_days: 1, max_days: 1, price: 1400, currency: 'MYR', country_code: 'MY', is_active: true, is_base: false },
    ]);

    // Client maliciously attempts to supply the cheaper MY tier ID for a US organization
    let threw = false;
    try {
      await createEvent({
        organization_id: orgId,
        game_id: gameId,
        game_theme_id: themeId,
        name: 'US Event Attempting MY Pricing',
        start_date: '2026-11-01',
        end_date: '2026-11-01',
        pricing_id: 'tier-my-1d',
      }, testEnv);
    } catch (err: any) {
      threw = true;
      expect(err.code).toBe('PRICING_COUNTRY_MISMATCH');
      expect(err.status).toBe(422);
    }
    expect(threw).toBe(true);
  });

  it('Test 10: Server snapshots authoritative price, currency, pricing_id, and pricing_country without modifying organization country', async () => {
    const gameId = '00000000-0000-0000-0000-000000000029';
    const orgId = '00000000-0000-0000-0000-0000000000aa';
    const themeId = '00000000-0000-0000-0000-0000000000bb';

    // VN organization
    localOrgsCache.set(orgId, {
      id: orgId,
      name: 'Vietnam Org',
      slug: 'vietnam-org',
      country_code: 'VN',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any);

    localGamesCache.set(gameId, {
      id: gameId,
      name: 'Catch Game',
      slug: 'catch-brand',
      status: 'active',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any);

    localThemesCache.set(themeId, {
      id: themeId,
      organization_id: orgId,
      game_id: gameId,
      name: 'VN Theme',
      status: 'active',
      is_system: false,
      is_active: true,
      ownership_type: 'organization',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any);

    // US tier configured: 1 Day = USD 500
    localGamePricingCache.set(gameId, [
      { id: 'tier-us-1d-snap', game_id: gameId, min_days: 1, max_days: 1, price: 500, currency: 'USD', country_code: 'US', is_active: true, is_base: true },
    ]);

    // Create event for VN organization
    const event = await createEvent({
      organization_id: orgId,
      game_id: gameId,
      game_theme_id: themeId,
      name: 'VN Event Fallback to US Pricing',
      start_date: '2026-11-01',
      end_date: '2026-11-01',
    }, testEnv);

    expect(event).toBeDefined();
    // Authoritatively snapshotted
    expect(event.event_price).toBe(500);
    expect(event.event_currency).toBe('USD');
    expect(event.pricing_id).toBe('tier-us-1d-snap');
    expect((event as any).pricing_country).toBe('US');

    // Organization country MUST NOT be changed during fallback!
    const orgAfter = localOrgsCache.get(orgId);
    expect(orgAfter?.country_code).toBe('VN');
  });
});
