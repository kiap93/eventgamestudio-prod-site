import assert from 'node:assert';
import { test } from 'bun:test';
import { getPublicGamesPricing, localGamePricingCache } from './db/gamePricing.js';
import { matchGamePricingTier, getGameStartingPrice } from '../src/lib/publicPricing.js';
import worker from '../worker.js';

const workerEnv = {
  JWT_SECRET: 'test-jwt-secret-key-at-least-32-chars-long!!',
  NODE_ENV: 'test',
  PLATFORM_BUSINESS_TIMEZONE: 'Asia/Singapore',
  DEFAULT_EVENT_PRICE: '1400',
  DEFAULT_EVENT_CURRENCY: 'MYR',
  SUPABASE_URL: 'https://placeholder-project.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'placeholder-service-key',
};

async function runPublicGamePricingTestSuite() {
  console.log('======================================================');
  console.log('--- STARTING PUBLIC GAME PRICING TEST SUITE ---');
  console.log('======================================================');

  // Clear cache to simulate a completely clean state where no admin pricing has been configured yet
  localGamePricingCache.clear();

  // 1. Fetch public games pricing when NO active tiers are configured
  console.log('1. Testing public pricing when admin has not configured any tiers...');
  const emptyRes = await getPublicGamesPricing(workerEnv);
  assert.strictEqual(emptyRes.success, true, 'getPublicGamesPricing must succeed');
  assert.ok(Array.isArray(emptyRes.games), 'res.games must be an array');
  assert.ok(emptyRes.games.length >= 3, 'Must return at least 3 platform games');

  for (const game of emptyRes.games) {
    assert.deepStrictEqual(game.tiers, [], `Game ${game.slug} must have empty tiers array when unconfigured`);
    const startingPrice = getGameStartingPrice(game);
    assert.strictEqual(startingPrice, null, `Starting price must be null for unconfigured game ${game.slug}`);
    const matched = matchGamePricingTier(game.tiers, 1);
    assert.strictEqual(matched, null, `Duration match must be null (Custom Pricing / Contact Us) for ${game.slug}`);
  }
  console.log('✓ Unconfigured games authoritatively return tiers: [] with null starting price (Contact Us)');

  // 2. Verify no private / admin / sensitive fields are exposed
  for (const game of emptyRes.games) {
    const sensitiveKeys = [
      'organization_id',
      'created_by',
      'settings_config',
      'basket_config',
      'items_config',
      'jwt',
      'token',
      'secret',
    ];
    for (const key of sensitiveKeys) {
      assert.strictEqual(
        (game as any)[key],
        undefined,
        `Game ${game.name} must NOT expose sensitive key '${key}'`
      );
    }
    assert.ok(game.id, 'game must have id');
    assert.ok(game.name, 'game must have name');
    assert.ok(game.slug, 'game must have slug');
    assert.ok(game.game_type, 'game must have game_type');
  }
  console.log('✓ Zero private/admin/sensitive fields leaked in public response');

  // =========================================================================
  // CASE A — Exact tier
  // Admin configures: 1–7 = RM2,800
  // Selected: 5 days
  // Expected: RM2,800 + normal action (matched tier)
  // =========================================================================
  console.log('\n--- Case A: Exact tier match ---');
  {
    const caseATiers = [
      { min_days: 1, max_days: 7, price: 2800, currency: 'MYR' },
    ];
    const match5 = matchGamePricingTier(caseATiers, 5);
    assert.ok(match5 !== null, 'Day 5 must match tier 1–7');
    assert.strictEqual(match5.price, 2800, 'Price must be RM2,800');
    assert.strictEqual(match5.price > 0, true, 'Normal action button enabled (price > 0)');

    const match1 = matchGamePricingTier(caseATiers, 1);
    assert.strictEqual(match1?.price, 2800, 'Day 1 must match RM2,800');

    const match7 = matchGamePricingTier(caseATiers, 7);
    assert.strictEqual(match7?.price, 2800, 'Day 7 must match RM2,800');
    console.log('✓ Case A Passed: Selected 5 days matches 1–7 tier @ RM2,800 with normal action button');
  }

  // =========================================================================
  // CASE B — Gap between tiers
  // Admin configures: 1–3 = RM2,000, 5–7 = RM3,000
  // Selected: 4 days
  // Expected: Custom Pricing, Contact Us (matchGamePricingTier returns null)
  // =========================================================================
  console.log('\n--- Case B: Gap between tiers ---');
  {
    const caseBTiers = [
      { min_days: 1, max_days: 3, price: 2000, currency: 'MYR' },
      { min_days: 5, max_days: 7, price: 3000, currency: 'MYR' },
    ];

    // Day 3 matches Tier 1
    const match3 = matchGamePricingTier(caseBTiers, 3);
    assert.ok(match3 !== null, 'Day 3 must match 1–3 tier');
    assert.strictEqual(match3.price, 2000, 'Day 3 price must be RM2,000');

    // Day 4 falls in gap -> Custom Pricing / Contact Us
    const match4 = matchGamePricingTier(caseBTiers, 4);
    assert.strictEqual(match4, null, 'Day 4 in gap must return null (Custom Pricing / Contact Us)');

    // Day 5 matches Tier 2
    const match5 = matchGamePricingTier(caseBTiers, 5);
    assert.ok(match5 !== null, 'Day 5 must match 5–7 tier');
    assert.strictEqual(match5.price, 3000, 'Day 5 price must be RM3,000');
    console.log('✓ Case B Passed: Day 3 -> RM2,000, Day 4 -> Contact Us (null), Day 5 -> RM3,000');
  }

  // =========================================================================
  // CASE C — No pricing at all
  // Admin configures: no active tiers
  // Expected: Custom Pricing, Contact Us
  // No default tier should appear
  // =========================================================================
  console.log('\n--- Case C: No pricing at all ---');
  {
    const caseCTiers: any[] = [];
    const match1 = matchGamePricingTier(caseCTiers, 1);
    const match10 = matchGamePricingTier(caseCTiers, 10);
    assert.strictEqual(match1, null, 'No tiers must return null for day 1');
    assert.strictEqual(match10, null, 'No tiers must return null for day 10');
    console.log('✓ Case C Passed: Empty tiers return null (Custom Pricing / Contact Us), zero default tiers');
  }

  // =========================================================================
  // CASE D — Open-ended tier
  // Admin configures: 31–NULL = custom configured price (RM7,500)
  // Selected: 40 days
  // Expected: configured price (RM7,500), normal action
  // =========================================================================
  console.log('\n--- Case D: Open-ended tier (31–NULL) ---');
  {
    const caseDTiers = [
      { min_days: 1, max_days: 30, price: 4500, currency: 'MYR' },
      { min_days: 31, max_days: null, price: 7500, currency: 'MYR' },
    ];
    const match40 = matchGamePricingTier(caseDTiers, 40);
    assert.ok(match40 !== null, 'Day 40 must match open-ended tier');
    assert.strictEqual(match40.price, 7500, 'Price for day 40 must be RM7,500');

    const match31 = matchGamePricingTier(caseDTiers, 31);
    assert.strictEqual(match31?.price, 7500, 'Day 31 must match open-ended tier @ RM7,500');

    const match30 = matchGamePricingTier(caseDTiers, 30);
    assert.strictEqual(match30?.price, 4500, 'Day 30 must match 1–30 tier @ RM4,500');
    console.log('✓ Case D Passed: Open-ended tier (31–NULL) correctly covers 31 and 40 days at configured price');
  }

  // =========================================================================
  // CASE E — No 31+ tier
  // Admin configures: 1–30 = configured, no 31+ tier
  // Selected: 31 days
  // Expected: Custom Pricing, Contact Us
  // =========================================================================
  console.log('\n--- Case E: No 31+ tier ---');
  {
    const caseETiers = [
      { min_days: 1, max_days: 30, price: 4500, currency: 'MYR' },
    ];
    const match31 = matchGamePricingTier(caseETiers, 31);
    assert.strictEqual(match31, null, 'Day 31 with no 31+ tier must return null (Custom Pricing / Contact Us)');

    const match40 = matchGamePricingTier(caseETiers, 40);
    assert.strictEqual(match40, null, 'Day 40 with no 31+ tier must return null (Custom Pricing / Contact Us)');
    console.log('✓ Case E Passed: Days 31 and 40 return null (Custom Pricing / Contact Us) when no 31+ tier exists');
  }

  // =========================================================================
  // CASE F — Inactive tier
  // Admin configures: 31–NULL exists but is_active = false
  // Selected: 40 days
  // Expected: Custom Pricing, Contact Us
  // =========================================================================
  console.log('\n--- Case F: Inactive tier ---');
  {
    const caseFTiers = [
      { min_days: 1, max_days: 30, price: 4500, currency: 'MYR', is_active: true },
      { min_days: 31, max_days: null, price: 7500, currency: 'MYR', is_active: false },
    ];
    const match40 = matchGamePricingTier(caseFTiers, 40);
    assert.strictEqual(match40, null, 'Day 40 matching inactive tier must return null (Custom Pricing / Contact Us)');
    console.log('✓ Case F Passed: Inactive tier is never matched, returns null (Custom Pricing / Contact Us)');
  }

  // =========================================================================
  // CASE G — Multiple games pricing isolation
  // Game A: 1–7 days = RM2,000
  // Game B: 1–7 days = RM3,000
  // Pricing for Game A never leaks into Game B
  // =========================================================================
  console.log('\n--- Case G: Multiple games isolation ---');
  {
    const gameATiers = [{ min_days: 1, max_days: 7, price: 2000, currency: 'MYR' }];
    const gameBTiers = [{ min_days: 1, max_days: 7, price: 3000, currency: 'MYR' }];

    const matchA = matchGamePricingTier(gameATiers, 5);
    const matchB = matchGamePricingTier(gameBTiers, 5);

    assert.strictEqual(matchA?.price, 2000, 'Game A day 5 price must be RM2,000');
    assert.strictEqual(matchB?.price, 3000, 'Game B day 5 price must be RM3,000');

    // Also verify getGameStartingPrice isolation
    const startingA = getGameStartingPrice({ id: 'game-a', slug: 'game-a', name: 'Game A', game_type: 'catch-brand', status: 'active', tiers: gameATiers });
    const startingB = getGameStartingPrice({ id: 'game-b', slug: 'game-b', name: 'Game B', game_type: 'memory-match', status: 'active', tiers: gameBTiers });

    assert.strictEqual(startingA?.price, 2000, 'Game A starting price must be RM2,000');
    assert.strictEqual(startingB?.price, 3000, 'Game B starting price must be RM3,000');
    console.log('✓ Case G Passed: Game A (RM2,000) and Game B (RM3,000) remain strictly isolated');
  }

  // =========================================================================
  // Integration Test: Populate specific admin tiers into cache and test API & Worker
  // =========================================================================
  console.log('\n--- Integration: Admin-configured game tiers through Public API & Worker ---');
  const catchGame = emptyRes.games.find((g) => g.slug === 'catch-brand' || g.game_type === 'catch-brand')!;
  const memoryGame = emptyRes.games.find((g) => g.slug === 'memory-match' || g.game_type === 'memory-match')!;
  const reactionGame = emptyRes.games.find((g) => g.slug === 'reaction-tap' || g.game_type === 'reaction-tap')!;

  // Admin explicitly configures Catch the Brand: 1 day = RM1,400, 2 days = RM1,900, 3 days = RM2,200, 4–7 days = RM2,800
  localGamePricingCache.set(catchGame.id, [
    { id: 'c1', game_id: catchGame.id, min_days: 1, max_days: 1, price: 1400, currency: 'MYR', is_active: true, is_base: true, created_at: '', updated_at: '' },
    { id: 'c2', game_id: catchGame.id, min_days: 2, max_days: 2, price: 1900, currency: 'MYR', is_active: true, is_base: false, created_at: '', updated_at: '' },
    { id: 'c3', game_id: catchGame.id, min_days: 3, max_days: 3, price: 2200, currency: 'MYR', is_active: true, is_base: false, created_at: '', updated_at: '' },
    { id: 'c4', game_id: catchGame.id, min_days: 4, max_days: 7, price: 2800, currency: 'MYR', is_active: true, is_base: false, created_at: '', updated_at: '' },
  ]);

  // Admin explicitly configures Memory Match: only 1–3 days = RM2,000 and 5–7 days = RM3,000 (gap at day 4!)
  localGamePricingCache.set(memoryGame.id, [
    { id: 'm1', game_id: memoryGame.id, min_days: 1, max_days: 3, price: 2000, currency: 'MYR', is_active: true, is_base: true, created_at: '', updated_at: '' },
    { id: 'm2', game_id: memoryGame.id, min_days: 5, max_days: 7, price: 3000, currency: 'MYR', is_active: true, is_base: false, created_at: '', updated_at: '' },
  ]);

  // Reaction Tap remains unconfigured (tiers: [])
  localGamePricingCache.set(reactionGame.id, []);

  // Fetch updated public games pricing
  const updatedRes = await getPublicGamesPricing(workerEnv);
  const updatedCatch = updatedRes.games.find((g) => g.id === catchGame.id)!;
  const updatedMemory = updatedRes.games.find((g) => g.id === memoryGame.id)!;
  const updatedReaction = updatedRes.games.find((g) => g.id === reactionGame.id)!;

  assert.strictEqual(updatedCatch.tiers.length, 4, 'Catch must have exactly 4 configured tiers');
  assert.strictEqual(updatedMemory.tiers.length, 2, 'Memory must have exactly 2 configured tiers');
  assert.strictEqual(updatedReaction.tiers.length, 0, 'Reaction must have 0 tiers (unconfigured)');

  // Test Catch duration evaluations
  assert.strictEqual(matchGamePricingTier(updatedCatch.tiers, 1)?.price, 1400);
  assert.strictEqual(matchGamePricingTier(updatedCatch.tiers, 3)?.price, 2200);
  assert.strictEqual(matchGamePricingTier(updatedCatch.tiers, 5)?.price, 2800);
  assert.strictEqual(matchGamePricingTier(updatedCatch.tiers, 10), null); // Gap above day 7 -> Contact Us

  // Test Memory duration evaluations (exact gap matching)
  assert.strictEqual(matchGamePricingTier(updatedMemory.tiers, 3)?.price, 2000);
  assert.strictEqual(matchGamePricingTier(updatedMemory.tiers, 4), null); // 4 days -> Contact Us!
  assert.strictEqual(matchGamePricingTier(updatedMemory.tiers, 5)?.price, 3000);

  // Test Reaction duration evaluations (no tiers)
  assert.strictEqual(matchGamePricingTier(updatedReaction.tiers, 1), null); // Contact Us!
  console.log('✓ Public pricing endpoint returns configured tiers accurately; unconfigured returns empty tiers');

  // Verify Cloudflare Worker endpoint
  const workerReq = new Request('https://api.eventgamestudio.local/api/public/games/pricing', {
    method: 'GET',
  });
  const workerRes = await worker.fetch(workerReq, workerEnv, {} as any);
  assert.strictEqual(workerRes.status, 200, 'Worker endpoint must return 200 OK');
  const workerData: any = await workerRes.json();
  assert.strictEqual(workerData.success, true);
  assert.ok(Array.isArray(workerData.games));
  console.log('✓ Cloudflare Worker GET /api/public/games/pricing returns 200 with admin-authoritative pricing');

  console.log('\n======================================================');
  console.log('ALL PUBLIC GAME PRICING TESTS PASSED (100%)');
  console.log('======================================================');
}

test('public game pricing test suite', async () => {
  await runPublicGamePricingTestSuite();
});
