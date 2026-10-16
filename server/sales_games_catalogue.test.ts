import { test, expect, describe, beforeEach } from 'bun:test';
import {
  signAppToken,
} from './auth.js';
import {
  createUser,
} from './db/index.js';
import {
  clearLocalSalesPartnersCache,
  createSalesPartnerApplication,
  updateSalesPartnerStatus,
} from './db/salesPartners.js';
import {
  getApprovedSalesGames,
  getApprovedSalesGameById,
  hasVerifiedPlayablePreview,
  resolveSalesPricing,
  APPROVED_SALES_GAME_ENGINES,
} from './db/salesGames.js';
import { parseRoute } from '../src/hooks/useRouteContext.js';
import worker from '../worker.js';

describe('Phase 3 — Sales Partner Game Catalogue, Verified Previews, and Pricing Tiers', () => {
  const testEnv = {
    SUPABASE_URL: 'https://placeholder.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'placeholder-service-key',
    JWT_SECRET: 'test-jwt-secret-for-phase3-sales-catalogue-32b',
    NODE_ENV: 'test',
  };

  beforeEach(() => {
    clearLocalSalesPartnersCache();
  });

  // 1. Unauthenticated request to /api/sales/games returns 401
  test('1. Unauthenticated request to /api/sales/games returns 401', async () => {
    const req = new Request('https://api.eventgamestudio.local/api/sales/games', {
      method: 'GET',
    });
    const res = await worker.fetch(req, testEnv);
    expect(res.status).toBe(401);
  });

  // 2. Regular Customer without Sales Partner access returns 403
  test('2. Regular customer without Sales Partner access receives 403 on /api/sales/games', async () => {
    const customer = await createUser(
      { email: 'customer.regular@brand.com', name: 'Regular Customer' },
      testEnv
    );
    const token = await signAppToken(customer.id, undefined, undefined, testEnv.JWT_SECRET, testEnv);

    const req = new Request('https://api.eventgamestudio.local/api/sales/games', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const res = await worker.fetch(req, testEnv);
    expect(res.status).toBe(403);
    const body: any = await res.json();
    expect(body.code).toBe('SALES_PARTNER_ACCESS_REQUIRED');
  });

  // 3. Suspended Sales Partner receives 403 on /api/sales/games
  test('3. Suspended sales partner receives 403 on /api/sales/games', async () => {
    const partner = await createUser(
      { email: 'partner.suspended@sales.com', name: 'Suspended Partner' },
      testEnv
    );
    await createSalesPartnerApplication(partner.id, 'Applying', testEnv);
    await updateSalesPartnerStatus(partner.id, 'active', 'Admin approved', testEnv);
    await updateSalesPartnerStatus(partner.id, 'suspended', 'Admin suspended', testEnv);

    const token = await signAppToken(partner.id, undefined, undefined, testEnv.JWT_SECRET, testEnv);

    const req = new Request('https://api.eventgamestudio.local/api/sales/games', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const res = await worker.fetch(req, testEnv);
    expect(res.status).toBe(403);
    const body: any = await res.json();
    expect(body.code).toBe('SALES_PARTNER_ACCESS_REQUIRED');
  });

  // 4. Active Sales Partner can retrieve the approved catalogue
  test('4. Active Sales Partner can retrieve approved game catalogue with 200 OK', async () => {
    const partner = await createUser(
      { email: 'partner.active@agency.com', name: 'Active Partner' },
      testEnv
    );
    await createSalesPartnerApplication(partner.id, 'Applying as partner', testEnv);
    await updateSalesPartnerStatus(partner.id, 'active', 'Admin approved', testEnv);

    const token = await signAppToken(partner.id, undefined, undefined, testEnv.JWT_SECRET, testEnv);

    const req = new Request('https://api.eventgamestudio.local/api/sales/games', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const res = await worker.fetch(req, testEnv);
    expect(res.status).toBe(200);

    const body: any = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.games)).toBe(true);
    expect(body.games.length).toBeGreaterThan(0);

    // Verify all returned games belong to approved engines
    for (const g of body.games) {
      expect(APPROVED_SALES_GAME_ENGINES.has(g.game_type)).toBe(true);
      expect(g.name).toBeTruthy();
      expect(g.highlight).toBeTruthy();
      expect(g.category).toBeTruthy();
      expect(g.cover_image_url).toBeTruthy();
      expect(g.supported_input_types.length).toBeGreaterThan(0);
      expect(g.orientations.length).toBeGreaterThan(0);
      expect(g.pricing).toBeTruthy();
      expect(g.pricing.display_price).toBeTruthy();
    }
  });

  // 5. Playable preview check logic: Only verified engines get has_playable_preview = true
  test('5. hasVerifiedPlayablePreview only returns true for verified engines and published games', () => {
    expect(hasVerifiedPlayablePreview('catch-brand', true)).toBe(true);
    expect(hasVerifiedPlayablePreview('memory-match', true)).toBe(true);
    expect(hasVerifiedPlayablePreview('reaction-tap', true)).toBe(true);
    expect(hasVerifiedPlayablePreview('reaction-time', true)).toBe(true);
    expect(hasVerifiedPlayablePreview('match-3', true)).toBe(true);

    // False if unpublished
    expect(hasVerifiedPlayablePreview('catch-brand', false)).toBe(false);

    // False for unverified or fictitious engine
    expect(hasVerifiedPlayablePreview('unreleased-vr-fps', true)).toBe(false);
    expect(hasVerifiedPlayablePreview('speed-quiz', true)).toBe(false);
  });

  // 6. Pricing resolution logic across different countries
  test('6. resolveSalesPricing resolves authoritative pricing tiers for Malaysia (MY) and Singapore (SG)', async () => {
    // MY resolution
    const pricingMY = await resolveSalesPricing('catch-brand', 'MY', testEnv);
    expect(pricingMY.requires_custom_quote).toBe(false);
    expect(pricingMY.currency).toBe('MYR');
    expect(pricingMY.pricing_country).toBe('MY');
    expect(pricingMY.base_price).toBeGreaterThan(0);
    expect(pricingMY.display_price).toContain('MYR');
    expect(pricingMY.tiers.length).toBeGreaterThan(0);

    // SG resolution
    const pricingSG = await resolveSalesPricing('catch-brand', 'SG', testEnv);
    expect(pricingSG.currency).toBe('SGD');
    expect(pricingSG.pricing_country).toBe('SG');
    expect(pricingSG.base_price).toBeGreaterThan(0);
    expect(pricingSG.display_price).toContain('SGD');

    // Unknown country falls back gracefully
    const pricingUnknown = await resolveSalesPricing('catch-brand', 'ZZ', testEnv);
    expect(pricingUnknown.requires_custom_quote).toBe(false);
    expect(pricingUnknown.is_fallback).toBe(true);
  });

  // 7. GET /api/sales/games/:gameId returns detailed specifications
  test('7. Active sales partner can fetch detailed game specifications by slug or id', async () => {
    const partner = await createUser(
      { email: 'partner.detail@agency.com', name: 'Detail Partner' },
      testEnv
    );
    await createSalesPartnerApplication(partner.id, 'Applying', testEnv);
    await updateSalesPartnerStatus(partner.id, 'active', 'Admin approved', testEnv);

    const token = await signAppToken(partner.id, undefined, undefined, testEnv.JWT_SECRET, testEnv);

    const req = new Request('https://api.eventgamestudio.local/api/sales/games/catch-brand?country=MY', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const res = await worker.fetch(req, testEnv);
    expect(res.status).toBe(200);

    const body: any = await res.json();
    expect(body.success).toBe(true);
    expect(body.game).toBeTruthy();
    expect(body.game.slug).toBe('catch-brand');
    expect(body.game.name).toBe('Catch the Brand');
    expect(body.game.gameplay_instructions.length).toBe(4);
    expect(body.game.suitable_event_types.length).toBeGreaterThan(0);
    expect(body.game.customization_capabilities.length).toBeGreaterThan(0);
    expect(body.game.pricing.tiers.length).toBeGreaterThan(0);
  });

  // 8. GET /api/sales/games/:gameId returns 404 for non-existent game
  test('8. GET /api/sales/games/:gameId returns 404 for unknown game id', async () => {
    const partner = await createUser(
      { email: 'partner.404@agency.com', name: '404 Partner' },
      testEnv
    );
    await createSalesPartnerApplication(partner.id, 'Applying', testEnv);
    await updateSalesPartnerStatus(partner.id, 'active', 'Admin approved', testEnv);

    const token = await signAppToken(partner.id, undefined, undefined, testEnv.JWT_SECRET, testEnv);

    const req = new Request('https://api.eventgamestudio.local/api/sales/games/non-existent-game-xyz', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const res = await worker.fetch(req, testEnv);
    expect(res.status).toBe(404);

    const body: any = await res.json();
    expect(body.error).toContain('not found');
  });

  // 9. Route parser tests for /sales, /sales/games, /sales/games/:gameId
  test('9. parseRoute correctly parses sales routes and presentation modes', () => {
    const portalRoute = parseRoute('/sales');
    expect(portalRoute.isSalesRoute).toBe(true);
    expect(portalRoute.mode).toBe('sales_dashboard');
    expect(portalRoute.salesSection).toBe('portal');

    const gamesRoute = parseRoute('/sales/games');
    expect(gamesRoute.isSalesRoute).toBe(true);
    expect(gamesRoute.mode).toBe('sales_games');
    expect(gamesRoute.salesSection).toBe('games');

    const detailRoute = parseRoute('/sales/games/catch-brand');
    expect(detailRoute.isSalesRoute).toBe(true);
    expect(detailRoute.mode).toBe('sales_game_detail');
    expect(detailRoute.salesGameId).toBe('catch-brand');
    expect(detailRoute.salesSection).toBe('games');
  });
});
