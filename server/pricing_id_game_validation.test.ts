import { describe, it, expect, beforeEach } from 'bun:test';
import { createEvent, localEventsCache } from './db/events.js';
import { localGamePricingCache, getGamePricingTierById, getGamePricing } from './db/gamePricing.js';
import { localThemesCache } from './db/themes.js';
import { localOrgsCache } from './db/organizations.js';

describe('Pricing ID & Game Integrity Checks (create_event_atomic & TypeScript)', () => {
  const orgId = '11111111-1111-1111-1111-111111111111';
  const catchBrandThemeId = '22222222-2222-2222-2222-222222222222';
  const memoryMatchThemeId = '33333333-3333-3333-3333-333333333333';

  beforeEach(() => {
    localEventsCache.clear();
    localGamePricingCache.clear();
    localThemesCache.clear();
    localOrgsCache.clear();

    // Setup Organization
    localOrgsCache.set(orgId, {
      id: orgId,
      name: 'Test Agency Org',
      slug: 'test-agency',
      owner_id: 'owner-1',
      country_code: 'MY',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any);

    // Setup Catch the Brand Theme
    localThemesCache.set(catchBrandThemeId, {
      id: catchBrandThemeId,
      organization_id: orgId,
      game_id: 'catch-brand',
      name: 'Catch Theme',
      status: 'active',
      is_system: false,
      is_active: true,
      ownership_type: 'organization',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any);

    // Setup Memory Match Theme
    localThemesCache.set(memoryMatchThemeId, {
      id: memoryMatchThemeId,
      organization_id: orgId,
      game_id: 'memory-match',
      name: 'Memory Match Theme',
      status: 'active',
      is_system: false,
      is_active: true,
      ownership_type: 'organization',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any);

    // Setup Game Pricing Tiers for Catch the Brand
    localGamePricingCache.set('catch-brand', [
      {
        id: 'catch-tier-1d',
        game_id: 'catch-brand',
        min_days: 1,
        max_days: 1,
        price: 1400,
        currency: 'MYR',
        is_active: true,
        is_base: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'catch-tier-2d',
        game_id: 'catch-brand',
        min_days: 2,
        max_days: 2,
        price: 1900,
        currency: 'MYR',
        is_active: true,
        is_base: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'catch-tier-inactive',
        game_id: 'catch-brand',
        min_days: 3,
        max_days: 3,
        price: 2100,
        currency: 'MYR',
        is_active: false,
        is_base: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]);

    // Setup Game Pricing Tiers for Memory Match
    localGamePricingCache.set('memory-match', [
      {
        id: 'memory-tier-1d',
        game_id: 'memory-match',
        min_days: 1,
        max_days: 1,
        price: 1200,
        currency: 'MYR',
        is_active: true,
        is_base: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]);
  });

  it('retrieves a pricing tier by ID correctly', async () => {
    const tier = await getGamePricingTierById('catch-tier-1d');
    expect(tier).not.toBeNull();
    expect(tier?.id).toBe('catch-tier-1d');
    expect(tier?.game_id).toBe('catch-brand');
    expect(tier?.price).toBe(1400);

    const nonExistent = await getGamePricingTierById('unknown-tier-999');
    expect(nonExistent).toBeNull();
  });

  it('rejects event creation if pricing_id belongs to a different game (cross-game leakage prevention)', async () => {
    try {
      await createEvent({
        organization_id: orgId,
        game_theme_id: catchBrandThemeId,
        game_id: 'catch-brand',
        name: 'Brand Activation 2026',
        start_date: '2026-10-01',
        end_date: '2026-10-01',
        pricing_id: 'memory-tier-1d', // Memory Match pricing ID supplied for Catch the Brand event!
      } as any);
      expect(true).toBe(false); // Should have thrown
    } catch (err: any) {
      expect(err.code).toBe('PRICING_GAME_MISMATCH');
      expect(err.status).toBe(422);
      expect(err.message).toContain('does not belong to the selected game');
    }
  });

  it('rejects event creation if pricing_id is inactive', async () => {
    try {
      await createEvent({
        organization_id: orgId,
        game_theme_id: catchBrandThemeId,
        game_id: 'catch-brand',
        name: 'Brand Activation 2026',
        start_date: '2026-10-01',
        end_date: '2026-10-03', // 3 days
        pricing_id: 'catch-tier-inactive', // Inactive tier
      } as any);
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.code).toBe('PRICING_TIER_INACTIVE');
      expect(err.status).toBe(422);
      expect(err.message).toContain('inactive');
    }
  });

  it('rejects event creation if pricing_id does not cover the duration', async () => {
    try {
      await createEvent({
        organization_id: orgId,
        game_theme_id: catchBrandThemeId,
        game_id: 'catch-brand',
        name: 'Brand Activation 2026',
        start_date: '2026-10-01',
        end_date: '2026-10-02', // 2 days
        pricing_id: 'catch-tier-1d', // 1-day tier supplied for a 2-day event!
      } as any);
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.code).toBe('PRICING_DURATION_MISMATCH');
      expect(err.status).toBe(422);
      expect(err.message).toContain('does not cover this duration');
    }
  });

  it('rejects event creation if pricing_id does not exist', async () => {
    try {
      await createEvent({
        organization_id: orgId,
        game_theme_id: catchBrandThemeId,
        game_id: 'catch-brand',
        name: 'Brand Activation 2026',
        start_date: '2026-10-01',
        end_date: '2026-10-01',
        pricing_id: 'ghost-tier-uuid',
      } as any);
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.code).toBe('PRICING_TIER_NOT_FOUND');
      expect(err.status).toBe(422);
      expect(err.message).toContain('does not exist');
    }
  });

  it('successfully creates an event with a valid, matching, active pricing_id', async () => {
    const event = await createEvent({
      organization_id: orgId,
      game_theme_id: catchBrandThemeId,
      game_id: 'catch-brand',
      name: 'Brand Activation 2026',
      start_date: '2026-10-01',
      end_date: '2026-10-02', // 2 days
      pricing_id: 'catch-tier-2d',
    } as any);

    expect(event).toBeDefined();
    expect(event.pricing_id).toBe('catch-tier-2d');
    expect(event.duration_days).toBe(2);
    expect(event.event_price).toBe(1900);
    expect(event.event_currency).toBe('MYR');
  });

  it('auto-resolves the correct pricing tier when pricing_id is omitted', async () => {
    const event = await createEvent({
      organization_id: orgId,
      game_theme_id: catchBrandThemeId,
      game_id: 'catch-brand',
      name: 'Brand Activation 2026',
      start_date: '2026-10-01',
      end_date: '2026-10-01', // 1 day
    } as any);

    expect(event).toBeDefined();
    expect(event.pricing_id).toBe('catch-tier-1d');
    expect(event.duration_days).toBe(1);
    expect(event.event_price).toBe(1400);
  });
});
