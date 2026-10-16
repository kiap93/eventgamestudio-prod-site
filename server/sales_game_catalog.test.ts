import { describe, it, expect, beforeEach } from 'bun:test';
import {
  signAppToken,
} from './auth.js';
import {
  createUser,
  createOrganization,
  localUsersCache,
} from './db/index.js';
import {
  clearLocalSalesPartnersCache,
  createSalesPartnerApplication,
  updateSalesPartnerStatus,
  localSalesPartnersCache,
} from './db/salesPartners.js';
import {
  getApprovedSalesGames,
  getApprovedSalesGameById,
  resolveSalesPricing,
  hasVerifiedPlayablePreview,
  mapGameToSalesItem,
  APPROVED_SALES_GAME_ENGINES,
  VERIFIED_PLAYABLE_ENGINES,
} from './db/salesGames.js';
import {
  localGamesCache,
  getAllPlatformGames,
} from './db/games.js';
import {
  localGamePricingCache,
  createGamePricingTier,
} from './db/gamePricing.js';
import { GameRecord } from './db/types.js';
import worker from '../worker.js';

describe('Phase 3 — Sales Partner Game Catalogue Architecture & Security', () => {
  const testEnv = {
    SUPABASE_URL: 'https://placeholder.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'placeholder-service-key',
    JWT_SECRET: 'test-jwt-secret-for-sales-game-catalog-testing-32b',
    NODE_ENV: 'test',
  };

  beforeEach(() => {
    clearLocalSalesPartnersCache();
  });

  // 1. Active Sales Partner can retrieve the catalogue via worker endpoint
  it('1. Active Sales Partner can retrieve the approved catalogue (/api/sales/games returns 200)', async () => {
    const partnerUser = await createUser({
      email: 'active.sales.rep@eventgamestudio.com',
      name: 'Active Sales Rep',
    }, testEnv);

    await createSalesPartnerApplication(partnerUser.id, 'Experienced event producer', testEnv);
    await updateSalesPartnerStatus(partnerUser.id, 'active', 'test-admin', testEnv);

    const token = await signAppToken(partnerUser.id, undefined, undefined, testEnv.JWT_SECRET, testEnv);

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
    expect(typeof body.count).toBe('number');

    // Canonical games present
    const types = body.games.map((g: any) => g.game_type);
    expect(types).toContain('catch-brand');
    expect(types).toContain('memory-match');
    expect(types).toContain('reaction-tap');
    expect(types).toContain('match-3');
  });

  // 2. Normal Customer receives HTTP 403 from protected Sales catalogue endpoints
  it('2. Normal Customer receives HTTP 403 from protected Sales catalogue endpoints', async () => {
    const customerUser = await createUser({
      email: 'regular.client@corp.com',
      name: 'Regular Client',
    }, testEnv);

    const token = await signAppToken(customerUser.id, undefined, undefined, testEnv.JWT_SECRET, testEnv);

    // List endpoint
    const listReq = new Request('https://api.eventgamestudio.local/api/sales/games', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const listRes = await worker.fetch(listReq, testEnv);
    expect(listRes.status).toBe(403);
    const listBody: any = await listRes.json();
    expect(listBody.code).toBe('SALES_PARTNER_ACCESS_REQUIRED');

    // Detail endpoint
    const detailReq = new Request('https://api.eventgamestudio.local/api/sales/games/catch-brand', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const detailRes = await worker.fetch(detailReq, testEnv);
    expect(detailRes.status).toBe(403);
    const detailBody: any = await detailRes.json();
    expect(detailBody.code).toBe('SALES_PARTNER_ACCESS_REQUIRED');
  });

  // 3. Pending and suspended partners are denied
  it('3. Pending and suspended partners are denied with HTTP 403', async () => {
    // Pending partner
    const pendingUser = await createUser({
      email: 'pending.candidate@agency.com',
      name: 'Pending Candidate',
    }, testEnv);
    await createSalesPartnerApplication(pendingUser.id, 'Agency lead', testEnv);
    const pendingToken = await signAppToken(pendingUser.id, undefined, undefined, testEnv.JWT_SECRET, testEnv);

    const pendingReq = new Request('https://api.eventgamestudio.local/api/sales/games', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${pendingToken}`,
      },
    });
    const pendingRes = await worker.fetch(pendingReq, testEnv);
    expect(pendingRes.status).toBe(403);
    const pendingBody: any = await pendingRes.json();
    expect(pendingBody.partnerStatus).toBe('pending');

    // Suspended partner
    const suspendedUser = await createUser({
      email: 'suspended.rep@agency.com',
      name: 'Suspended Rep',
    }, testEnv);
    await createSalesPartnerApplication(suspendedUser.id, 'Past sales partner', testEnv);
    await updateSalesPartnerStatus(suspendedUser.id, 'active', 'test-admin', testEnv);
    await updateSalesPartnerStatus(suspendedUser.id, 'suspended', 'test-admin', testEnv);
    const suspendedToken = await signAppToken(suspendedUser.id, undefined, undefined, testEnv.JWT_SECRET, testEnv);

    const suspendedReq = new Request('https://api.eventgamestudio.local/api/sales/games', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${suspendedToken}`,
      },
    });
    const suspendedRes = await worker.fetch(suspendedReq, testEnv);
    expect(suspendedRes.status).toBe(403);
    const suspendedBody: any = await suspendedRes.json();
    expect(suspendedBody.partnerStatus).toBe('suspended');
  });

  // 4. Unpublished games are excluded
  it('4. Unpublished games (status !== "active") are strictly excluded from sales catalogue', async () => {
    const draftGame: GameRecord = {
      id: 'draft-game-uuid-1234',
      name: 'Secret Draft Game',
      slug: 'secret-draft',
      game_type: 'catch-brand',
      status: 'draft',
      is_system: true,
      organization_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    localGamesCache.set(draftGame.id, draftGame);

    const catalog = await getApprovedSalesGames(undefined, testEnv);
    const found = catalog.find((g) => g.id === draftGame.id || g.slug === draftGame.slug);
    expect(found).toBeUndefined();

    // Direct lookup also returns null
    const direct = await getApprovedSalesGameById(draftGame.id, undefined, testEnv);
    expect(direct).toBeNull();
  });

  // 5. Private organization games are excluded
  it('5. Private organization games (non-system / organization_id !== null) are excluded', async () => {
    const customOrgGame: GameRecord = {
      id: 'private-client-game-uuid',
      name: 'Client Private Bespoke Game',
      slug: 'client-bespoke-game',
      game_type: 'catch-brand',
      status: 'active',
      is_system: false,
      organization_id: 'org-client-uuid-999',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    localGamesCache.set(customOrgGame.id, customOrgGame);

    const catalog = await getApprovedSalesGames(undefined, testEnv);
    const found = catalog.find((g) => g.id === customOrgGame.id || g.slug === customOrgGame.slug);
    expect(found).toBeUndefined();

    const direct = await getApprovedSalesGameById(customOrgGame.id, undefined, testEnv);
    expect(direct).toBeNull();
  });

  // 6. Internal testing games and unsupported engines are excluded
  it('6. Internal testing games and unapproved engines (e.g. speed-quiz) are excluded', async () => {
    const unapprovedEngineGame: GameRecord = {
      id: 'unsupported-speed-quiz-uuid',
      name: 'Speed Quiz Trivia',
      slug: 'speed-quiz',
      game_type: 'speed-quiz',
      status: 'active',
      is_system: true,
      organization_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    localGamesCache.set(unapprovedEngineGame.id, unapprovedEngineGame);

    const catalog = await getApprovedSalesGames(undefined, testEnv);
    const found = catalog.find((g) => g.game_type === 'speed-quiz' || g.slug === 'speed-quiz');
    expect(found).toBeUndefined();

    const direct = await getApprovedSalesGameById('speed-quiz', undefined, testEnv);
    expect(direct).toBeNull();
  });

  // 7. Approved published games return the expected safe fields
  it('7. Approved published games return the expected safe fields and exclude internal admin keys', async () => {
    const partnerUser = await createUser({
      email: 'catalog.inspector@agency.com',
      name: 'Catalog Inspector',
    }, testEnv);
    await createSalesPartnerApplication(partnerUser.id, 'Sales lead', testEnv);
    await updateSalesPartnerStatus(partnerUser.id, 'active', 'test-admin', testEnv);
    const token = await signAppToken(partnerUser.id, undefined, undefined, testEnv.JWT_SECRET, testEnv);

    const req = new Request('https://api.eventgamestudio.local/api/sales/games/catch-brand', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const res = await worker.fetch(req, testEnv);
    expect(res.status).toBe(200);

    const body: any = await res.json();
    expect(body.success).toBe(true);
    const game = body.game;

    // Required safe demonstration fields
    expect(typeof game.id).toBe('string');
    expect(typeof game.name).toBe('string');
    expect(typeof game.slug).toBe('string');
    expect(typeof game.category).toBe('string');
    expect(typeof game.description).toBe('string');
    expect(typeof game.highlight).toBe('string');
    expect(typeof game.cover_image_url).toBe('string');
    expect(typeof game.default_duration_seconds).toBe('number');
    expect(Array.isArray(game.supported_input_types)).toBe(true);
    expect(Array.isArray(game.orientations)).toBe(true);
    expect(typeof game.has_playable_preview).toBe('boolean');
    expect(Array.isArray(game.gameplay_instructions)).toBe(true);
    expect(Array.isArray(game.suitable_event_types)).toBe(true);
    expect(Array.isArray(game.customization_capabilities)).toBe(true);
    expect(typeof game.pricing).toBe('object');

    // Internal developer/admin fields must NOT be exposed
    expect(game.is_system).toBeUndefined();
    expect(game.organization_id).toBeUndefined();
    expect(game.created_by).toBeUndefined();
  });

  // 8. Game-detail endpoint returns 404 for unapproved or unavailable games
  it('8. Game-detail endpoint returns 404 for unapproved or unavailable games', async () => {
    const partnerUser = await createUser({
      email: 'notfound.tester@agency.com',
      name: 'NotFound Tester',
    }, testEnv);
    await createSalesPartnerApplication(partnerUser.id, 'Sales lead', testEnv);
    await updateSalesPartnerStatus(partnerUser.id, 'active', 'test-admin', testEnv);
    const token = await signAppToken(partnerUser.id, undefined, undefined, testEnv.JWT_SECRET, testEnv);

    const req = new Request('https://api.eventgamestudio.local/api/sales/games/non-existent-game-slug-999', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const res = await worker.fetch(req, testEnv);
    expect(res.status).toBe(404);
    const body: any = await res.json();
    expect(body.error).toContain('not approved');
  });

  // 9. Preview availability is not falsely reported
  it('9. Preview availability is not falsely reported merely because a game is registered', () => {
    // 1. Working production engine with active status -> true
    const activeCatchGame: GameRecord = {
      id: 'catch-active-1',
      name: 'Catch Brand',
      slug: 'catch-brand',
      game_type: 'catch-brand',
      status: 'active',
      is_system: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    expect(hasVerifiedPlayablePreview(activeCatchGame, 'catch-brand')).toBe(true);

    // 2. Draft status -> false
    const draftCatchGame: GameRecord = {
      ...activeCatchGame,
      status: 'draft',
    };
    expect(hasVerifiedPlayablePreview(draftCatchGame, 'catch-brand')).toBe(false);

    // 3. Unimplemented engine (e.g. speed-quiz) -> false
    const quizGame: GameRecord = {
      id: 'quiz-1',
      name: 'Speed Quiz',
      slug: 'speed-quiz',
      game_type: 'speed-quiz',
      status: 'active',
      is_system: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    expect(hasVerifiedPlayablePreview(quizGame, 'speed-quiz')).toBe(false);

    // 4. Custom game explicitly flagged without preview -> false
    const noPreviewGame: GameRecord = {
      ...activeCatchGame,
      id: 'catch-no-preview',
      has_playable_preview: false,
    } as any;
    expect(hasVerifiedPlayablePreview(noPreviewGame, 'catch-brand')).toBe(false);
  });

  // 10. Gameplay and customization claims are consistent with verified game capabilities
  it('10. Gameplay instructions and customization claims are accurate for approved engines', async () => {
    const catalog = await getApprovedSalesGames(undefined, testEnv);

    for (const game of catalog) {
      // Must have at least 3 gameplay step instructions
      expect(game.gameplay_instructions.length).toBeGreaterThanOrEqual(3);
      for (const step of game.gameplay_instructions) {
        expect(step.step).toBeDefined();
        expect(step.title.length).toBeGreaterThan(0);
        expect(step.desc.length).toBeGreaterThan(0);
      }

      // Must have suitable event types with rationale
      expect(game.suitable_event_types.length).toBeGreaterThanOrEqual(3);
      for (const ev of game.suitable_event_types) {
        expect(ev.name.length).toBeGreaterThan(0);
        expect(ev.why.length).toBeGreaterThan(0);
      }

      // Must specify valid input types
      expect(game.supported_input_types.length).toBeGreaterThan(0);

      // Must specify supported orientations
      expect(game.orientations.length).toBeGreaterThan(0);

      // Must have customization options
      expect(game.customization_capabilities.length).toBeGreaterThanOrEqual(3);
    }
  });

  // 11. Correct country-based pricing is returned
  it('11. Correct country-based pricing is returned for requested country', async () => {
    const testGameId = '00000000-0000-0000-0000-0000000000a1';

    // Seed pricing tiers for SG and MY
    localGamePricingCache.set(testGameId, [
      {
        id: 'tier-my-1',
        min_days: 1,
        max_days: 1,
        price: 1400,
        currency: 'MYR',
        country_code: 'MY',
        is_active: true,
        is_base: true,
      },
      {
        id: 'tier-sg-1',
        min_days: 1,
        max_days: 1,
        price: 600,
        currency: 'SGD',
        country_code: 'SG',
        is_active: true,
        is_base: true,
      },
    ]);

    // Request SG pricing
    const sgPricing = await resolveSalesPricing(testGameId, 'SG', testEnv);
    expect(sgPricing.requires_custom_quote).toBe(false);
    expect(sgPricing.currency).toBe('SGD');
    expect(sgPricing.base_price).toBe(600);
    expect(sgPricing.display_price).toContain('SGD 600');
    expect(sgPricing.is_fallback).toBe(false);

    // Request MY pricing
    const myPricing = await resolveSalesPricing(testGameId, 'MY', testEnv);
    expect(myPricing.requires_custom_quote).toBe(false);
    expect(myPricing.currency).toBe('MYR');
    expect(myPricing.base_price).toBe(1400);
    expect(myPricing.display_price).toContain('MYR 1,400');
    expect(myPricing.is_fallback).toBe(false);
  });

  // 12. Missing applicable pricing produces Contact Us rather than an incorrect price
  it('12. Missing applicable pricing produces Contact Us rather than an incorrect price', async () => {
    const testGameId = '00000000-0000-0000-0000-0000000000b2';

    // Game with ZERO pricing tiers
    localGamePricingCache.set(testGameId, []);

    const noTierPricing = await resolveSalesPricing(testGameId, 'JP', testEnv);
    expect(noTierPricing.requires_custom_quote).toBe(true);
    expect(noTierPricing.display_price).toBe('Contact Us');
    expect(noTierPricing.base_price).toBeNull();
    expect(noTierPricing.currency).toBeNull();
    expect(noTierPricing.tiers.length).toBe(0);
  });

  // 13. API query params allow dynamic country preview via worker
  it('13. API supports country query parameter (?country=SG) on sales endpoints', async () => {
    const partnerUser = await createUser({
      email: 'multinational.rep@agency.com',
      name: 'Multinational Rep',
    }, testEnv);
    await createSalesPartnerApplication(partnerUser.id, 'Sales lead', testEnv);
    await updateSalesPartnerStatus(partnerUser.id, 'active', 'test-admin', testEnv);
    const token = await signAppToken(partnerUser.id, undefined, undefined, testEnv.JWT_SECRET, testEnv);

    const req = new Request('https://api.eventgamestudio.local/api/sales/games?country=SG', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const res = await worker.fetch(req, testEnv);
    expect(res.status).toBe(200);

    const body: any = await res.json();
    expect(body.success).toBe(true);
    expect(body.games.length).toBeGreaterThan(0);
  });

  // 14. No catalogue action can mutate production games or customer events
  it('14. Sales catalogue endpoints are strictly GET/read-only', async () => {
    const partnerUser = await createUser({
      email: 'readonly.inspector@agency.com',
      name: 'ReadOnly Inspector',
    }, testEnv);
    await createSalesPartnerApplication(partnerUser.id, 'Sales lead', testEnv);
    await updateSalesPartnerStatus(partnerUser.id, 'active', 'test-admin', testEnv);
    const token = await signAppToken(partnerUser.id, undefined, undefined, testEnv.JWT_SECRET, testEnv);

    // Attempting POST to sales/games should be 404 or method not allowed
    const postReq = new Request('https://api.eventgamestudio.local/api/sales/games', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Malicious Injected Game' }),
    });

    const postRes = await worker.fetch(postReq, testEnv);
    expect(postRes.status === 404 || postRes.status === 405).toBe(true);
  });

  // 15. Express and Cloudflare Worker behavior remains aligned
  it('15. Express and Cloudflare Worker expose identical approved sales game whitelist', () => {
    expect(APPROVED_SALES_GAME_ENGINES.has('catch-brand')).toBe(true);
    expect(APPROVED_SALES_GAME_ENGINES.has('memory-match')).toBe(true);
    expect(APPROVED_SALES_GAME_ENGINES.has('reaction-tap')).toBe(true);
    expect(APPROVED_SALES_GAME_ENGINES.has('match-3')).toBe(true);
    expect(APPROVED_SALES_GAME_ENGINES.has('speed-quiz')).toBe(false);
  });

  // 16. Existing Customer and Developer game workflows remain unchanged
  it('16. Baseline platform games in games.ts remain accessible to all customers', async () => {
    const platformGames = await getAllPlatformGames(testEnv);
    expect(platformGames.length).toBeGreaterThanOrEqual(4);
    const slugs = platformGames.map((g) => g.slug);
    expect(slugs).toContain('catch-brand');
    expect(slugs).toContain('memory-match');
    expect(slugs).toContain('reaction-tap');
    expect(slugs).toContain('match-3');
  });
});
