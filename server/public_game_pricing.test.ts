import assert from 'node:assert';
import { getPublicGamesPricing } from './db/gamePricing.js';
import { matchGamePricingTier, getGameStartingPrice } from '../src/lib/publicPricing.js';
import worker from '../worker.js';

const workerEnv = {
  JWT_SECRET: 'test-jwt-secret-key-at-least-32-chars-long!!',
  NODE_ENV: 'test',
  PLATFORM_BUSINESS_TIMEZONE: 'Asia/Singapore',
  DEFAULT_EVENT_PRICE: '1400',
  DEFAULT_EVENT_CURRENCY: 'MYR',
};

async function runPublicGamePricingTestSuite() {
  console.log('======================================================');
  console.log('--- STARTING PUBLIC GAME PRICING TEST SUITE ---');
  console.log('======================================================');

  // 1. Fetch public games pricing
  const res = await getPublicGamesPricing();
  assert.strictEqual(res.success, true, 'getPublicGamesPricing must succeed');
  assert.ok(Array.isArray(res.games), 'res.games must be an array');
  assert.ok(res.games.length >= 3, 'Must return at least 3 platform games');

  console.log(`✓ Fetched ${res.games.length} public games`);

  // 2. Verify no private / admin / sensitive fields are exposed
  for (const game of res.games) {
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
    assert.ok(Array.isArray(game.tiers), 'game must have tiers array');

    for (const tier of game.tiers) {
      assert.ok(tier.min_days >= 1, 'tier min_days must be >= 1');
      assert.ok(typeof tier.price === 'number' && tier.price > 0, 'tier price must be a positive number');
      assert.ok(tier.currency, 'tier currency must be set');
      assert.strictEqual((tier as any).game_id, undefined, 'tier should not leak internal raw game_id if not needed');
    }
  }
  console.log('✓ Zero private/admin/sensitive fields leaked in public response');

  // 3. Verify game pricing isolation & distinct starting prices
  const catchGame = res.games.find((g) => g.slug === 'catch-brand' || g.game_type === 'catch-brand');
  const memoryGame = res.games.find((g) => g.slug === 'memory-match' || g.game_type === 'memory-match');
  const reactionGame = res.games.find((g) => g.slug === 'reaction-tap' || g.game_type === 'reaction-tap');

  assert.ok(catchGame, 'Catch the Brand must be present');
  assert.ok(memoryGame, 'Brand Memory Match must be present');
  assert.ok(reactionGame, 'Formula Reaction Lights must be present');

  const catchStart = getGameStartingPrice(catchGame);
  const memoryStart = getGameStartingPrice(memoryGame);
  const reactionStart = getGameStartingPrice(reactionGame);

  assert.strictEqual(catchStart?.price, 1400, 'Catch the Brand starting price must be RM1,400');
  assert.strictEqual(memoryStart?.price, 1200, 'Memory Match starting price must be RM1,200');
  assert.strictEqual(reactionStart?.price, 1000, 'Reaction Lights starting price must be RM1,000');

  console.log('✓ Starting prices isolated per game: Catch RM1,400, Memory RM1,200, Reaction RM1,000');

  // 4. Verify duration matching logic
  // Test Catch the Brand durations
  const catchDay1 = matchGamePricingTier(catchGame.tiers, 1);
  assert.strictEqual(catchDay1?.price, 1400, 'Catch day 1 tier must be 1,400');

  const catchDay2 = matchGamePricingTier(catchGame.tiers, 2);
  assert.strictEqual(catchDay2?.price, 1900, 'Catch day 2 tier must be 1,900');

  const catchDay3 = matchGamePricingTier(catchGame.tiers, 3);
  assert.strictEqual(catchDay3?.price, 2200, 'Catch day 3 tier must be 2,200');

  const catchDay7 = matchGamePricingTier(catchGame.tiers, 7);
  assert.strictEqual(catchDay7?.price, 2800, 'Catch day 7 tier must be 2,800');

  const catchDay14 = matchGamePricingTier(catchGame.tiers, 14);
  assert.strictEqual(catchDay14?.price, 3500, 'Catch day 14 tier must be 3,500');

  const catchDay30 = matchGamePricingTier(catchGame.tiers, 30);
  assert.strictEqual(catchDay30?.price, 4500, 'Catch day 30 tier must be 4,500');

  // Test Memory Match durations
  const memoryDay1 = matchGamePricingTier(memoryGame.tiers, 1);
  assert.strictEqual(memoryDay1?.price, 1200, 'Memory day 1 tier must be 1,200');

  const memoryDay2 = matchGamePricingTier(memoryGame.tiers, 2);
  assert.strictEqual(memoryDay2?.price, 1600, 'Memory day 2 tier must be 1,600');

  const memoryDay3 = matchGamePricingTier(memoryGame.tiers, 3);
  assert.strictEqual(memoryDay3?.price, 1900, 'Memory day 3 tier must be 1,900');

  const memoryDay7 = matchGamePricingTier(memoryGame.tiers, 7);
  assert.strictEqual(memoryDay7?.price, 2600, 'Memory day 7 tier must be 2,600');

  const memoryDay14 = matchGamePricingTier(memoryGame.tiers, 14);
  assert.strictEqual(memoryDay14?.price, 3200, 'Memory day 14 tier must be 3,200');

  const memoryDay30 = matchGamePricingTier(memoryGame.tiers, 30);
  assert.strictEqual(memoryDay30?.price, 4200, 'Memory day 30 tier must be 4,200');

  // Test Reaction Tap durations
  const reactionDay1 = matchGamePricingTier(reactionGame.tiers, 1);
  assert.strictEqual(reactionDay1?.price, 1000, 'Reaction day 1 tier must be 1,000');

  const reactionDay2 = matchGamePricingTier(reactionGame.tiers, 2);
  assert.strictEqual(reactionDay2?.price, 1400, 'Reaction day 2 tier must be 1,400');

  const reactionDay7 = matchGamePricingTier(reactionGame.tiers, 7);
  assert.strictEqual(reactionDay7?.price, 2400, 'Reaction day 7 tier must be 2,400');

  console.log('✓ Duration matching resolves distinct tiers across different games correctly');

  // 5. Verify Custom Quote behavior for gaps or unbounded
  const noTierGameTiers = [
    { min_days: 1, max_days: 1, price: 1000, currency: 'MYR' },
    { min_days: 2, max_days: 5, price: 2000, currency: 'MYR' },
  ];
  // Gap at day 10
  const gapMatch = matchGamePricingTier(noTierGameTiers, 10);
  assert.strictEqual(gapMatch, null, 'Gap in tiers must return null to trigger Custom Quote');

  // 31+ days with no tier
  const over30Match = matchGamePricingTier(noTierGameTiers, 31);
  assert.strictEqual(over30Match, null, '31+ days with no tier must return null to trigger Custom Quote');

  console.log('✓ Gaps and missing 31+ tiers correctly return null for Custom Quote');

  // 6. Verify Worker route: GET /api/public/games/pricing
  const workerReq = new Request('https://api.eventgamestudio.local/api/public/games/pricing', {
    method: 'GET',
  });
  const workerRes = await worker.fetch(workerReq, workerEnv, {} as any);
  assert.strictEqual(workerRes.status, 200, 'Worker endpoint must return 200 OK');
  const workerData: any = await workerRes.json();
  assert.strictEqual(workerData.success, true, 'Worker response must have success: true');
  assert.ok(Array.isArray(workerData.games), 'Worker games must be an array');
  assert.ok(workerData.games.length >= 3, 'Worker must return at least 3 platform games');
  console.log('✓ Cloudflare Worker GET /api/public/games/pricing returns 200 with active game tiers');

  console.log('======================================================');
  console.log('ALL PUBLIC GAME PRICING TESTS PASSED (100%)');
  console.log('======================================================');
}

runPublicGamePricingTestSuite().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
