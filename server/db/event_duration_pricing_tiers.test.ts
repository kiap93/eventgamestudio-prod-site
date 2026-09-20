import assert from 'node:assert';
import crypto from 'node:crypto';
import { createOrganization } from './organizations.js';
import { createGame } from './games.js';
import { createTheme } from './themes.js';
import { createEvent } from './events.js';
import { calculateEventCalendarDays } from './platformSettings.js';
import { localGamePricingCache, buildDefaultPricingTiers } from './gamePricing.js';

async function runEventDurationPricingTiersTestSuite() {
  console.log('=================================================================');
  console.log('--- STARTING EVENT DURATION PRICING TIERS TEST SUITE (12 TESTS) ---');
  console.log('=================================================================');

  const testOrg = await createOrganization({
    name: 'Duration Test Org ' + Date.now(),
    owner_id: crypto.randomUUID(),
  });
  const orgId = testOrg.id;

  // Initialize canonical games in local cache
  const catchGame = await createGame({
    organization_id: orgId,
    name: 'Catch the Brand Test',
    slug: 'catch-brand',
    game_type: 'catch-brand',
  });
  localGamePricingCache.set(catchGame.id, buildDefaultPricingTiers(catchGame.id, 'catch-brand'));

  const memoryGame = await createGame({
    organization_id: orgId,
    name: 'Memory Match Test',
    slug: 'memory-match',
    game_type: 'memory-match',
  });
  localGamePricingCache.set(memoryGame.id, buildDefaultPricingTiers(memoryGame.id, 'memory-match'));

  const reactionGame = await createGame({
    organization_id: orgId,
    name: 'Reaction Tap Test',
    slug: 'reaction-tap',
    game_type: 'reaction-tap',
  });
  localGamePricingCache.set(reactionGame.id, buildDefaultPricingTiers(reactionGame.id, 'reaction-tap'));

  // Create organization themes for each game (required for event creation)
  const catchTheme = await createTheme({
    organization_id: orgId,
    game_id: catchGame.id,
    name: 'Catch Theme Test',
    status: 'active',
  });

  const memoryTheme = await createTheme({
    organization_id: orgId,
    game_id: memoryGame.id,
    name: 'Memory Theme Test',
    status: 'active',
  });

  const reactionTheme = await createTheme({
    organization_id: orgId,
    game_id: reactionGame.id,
    name: 'Reaction Theme Test',
    status: 'active',
  });

  let passedCount = 0;

  // =========================================================================
  // TEST 1: Valid duration - 1 day
  // =========================================================================
  console.log('TEST 1: Valid duration - 1 day (1-day tier price RM1,400)...');
  {
    const startDate = '2026-10-01';
    const endDate = '2026-10-01';
    const days = calculateEventCalendarDays(startDate, endDate);
    assert.strictEqual(days, 1, 'Duration must be 1 day');

    const event = await createEvent({
      organization_id: orgId,
      game_id: catchGame.id,
      game_theme_id: catchTheme.id,
      name: '1-Day Event',
      start_date: startDate,
      end_date: endDate,
      skipPendingLimitCheck: true,
    });

    assert.strictEqual(event.duration_days, 1, 'Event duration_days must be 1');
    assert.strictEqual(Number(event.event_price), 1400.00, 'Price must match 1-day tier (1400.00)');
    passedCount++;
    console.log('✓ PASS: 1-day event created successfully with 1-day tier price (RM1,400)');
  }

  // =========================================================================
  // TEST 2: Valid duration - 3 days
  // =========================================================================
  console.log('TEST 2: Valid duration - 3 days (3-day tier price RM2,200)...');
  {
    const startDate = '2026-10-01';
    const endDate = '2026-10-03';
    const days = calculateEventCalendarDays(startDate, endDate);
    assert.strictEqual(days, 3, 'Duration must be 3 days');

    const event = await createEvent({
      organization_id: orgId,
      game_id: catchGame.id,
      game_theme_id: catchTheme.id,
      name: '3-Day Event',
      start_date: startDate,
      end_date: endDate,
      skipPendingLimitCheck: true,
    });

    assert.strictEqual(event.duration_days, 3, 'Event duration_days must be 3');
    assert.strictEqual(Number(event.event_price), 2200.00, 'Price must match 3-day tier (2200.00)');
    passedCount++;
    console.log('✓ PASS: 3-day event created successfully with 3-day tier price (RM2,200)');
  }

  // =========================================================================
  // TEST 3: Valid duration - 7 days
  // =========================================================================
  console.log('TEST 3: Valid duration - 7 days (4-7 day tier price RM2,800)...');
  {
    const startDate = '2026-10-01';
    const endDate = '2026-10-07';
    const days = calculateEventCalendarDays(startDate, endDate);
    assert.strictEqual(days, 7, 'Duration must be 7 days');

    const event = await createEvent({
      organization_id: orgId,
      game_id: catchGame.id,
      game_theme_id: catchTheme.id,
      name: '7-Day Event',
      start_date: startDate,
      end_date: endDate,
      skipPendingLimitCheck: true,
    });

    assert.strictEqual(event.duration_days, 7, 'Event duration_days must be 7');
    assert.strictEqual(Number(event.event_price), 2800.00, 'Price must match 7-day tier (2800.00)');
    passedCount++;
    console.log('✓ PASS: 7-day event created successfully with 4-7 day tier price (RM2,800)');
  }

  // =========================================================================
  // TEST 4: Valid duration - 30 days
  // =========================================================================
  console.log('TEST 4: Valid duration - 30 days (15-30 day tier price RM4,500)...');
  {
    const startDate = '2026-10-01';
    const endDate = '2026-10-30';
    const days = calculateEventCalendarDays(startDate, endDate);
    assert.strictEqual(days, 30, 'Duration must be 30 days');

    const event = await createEvent({
      organization_id: orgId,
      game_id: catchGame.id,
      game_theme_id: catchTheme.id,
      name: '30-Day Event',
      start_date: startDate,
      end_date: endDate,
      skipPendingLimitCheck: true,
    });

    assert.strictEqual(event.duration_days, 30, 'Event duration_days must be 30');
    assert.strictEqual(Number(event.event_price), 4500.00, 'Price must match 15-30 day tier (4500.00)');
    passedCount++;
    console.log('✓ PASS: 30-day event created successfully with 15-30 day tier price (RM4,500)');
  }

  // =========================================================================
  // TEST 5: Valid duration - 45 days (Previously blocked by 30-day limit)
  // =========================================================================
  console.log('TEST 5: Valid duration - 45 days (31-60 day tier price RM6,000)...');
  {
    const startDate = '2026-10-01';
    const endDate = '2026-11-14';
    const days = calculateEventCalendarDays(startDate, endDate);
    assert.strictEqual(days, 45, 'Duration must be 45 days');

    const event = await createEvent({
      organization_id: orgId,
      game_id: catchGame.id,
      game_theme_id: catchTheme.id,
      name: '45-Day Event',
      start_date: startDate,
      end_date: endDate,
      skipPendingLimitCheck: true,
    });

    assert.strictEqual(event.duration_days, 45, 'Event duration_days must be 45');
    assert.strictEqual(Number(event.event_price), 6000.00, 'Price must match 31-60 day tier (6000.00)');
    passedCount++;
    console.log('✓ PASS: 45-day event created successfully with 31-60 day tier price (RM6,000)');
  }

  // =========================================================================
  // TEST 6: Valid duration - 75 days (Previously blocked by 30-day limit)
  // =========================================================================
  console.log('TEST 6: Valid duration - 75 days (61-90 day tier price RM8,000)...');
  {
    const startDate = '2026-10-01';
    const endDate = '2026-12-14';
    const days = calculateEventCalendarDays(startDate, endDate);
    assert.strictEqual(days, 75, 'Duration must be 75 days');

    const event = await createEvent({
      organization_id: orgId,
      game_id: catchGame.id,
      game_theme_id: catchTheme.id,
      name: '75-Day Event',
      start_date: startDate,
      end_date: endDate,
      skipPendingLimitCheck: true,
    });

    assert.strictEqual(event.duration_days, 75, 'Event duration_days must be 75');
    assert.strictEqual(Number(event.event_price), 8000.00, 'Price must match 61-90 day tier (8000.00)');
    passedCount++;
    console.log('✓ PASS: 75-day event created successfully with 61-90 day tier price (RM8,000)');
  }

  // =========================================================================
  // TEST 7: Valid duration - 100 days (Previously blocked by 30-day limit)
  // =========================================================================
  console.log('TEST 7: Valid duration - 100 days (91+ day tier price RM10,000)...');
  {
    const startDate = '2026-10-01';
    const endDate = '2027-01-08';
    const days = calculateEventCalendarDays(startDate, endDate);
    assert.strictEqual(days, 100, 'Duration must be 100 days');

    const event = await createEvent({
      organization_id: orgId,
      game_id: catchGame.id,
      game_theme_id: catchTheme.id,
      name: '100-Day Event',
      start_date: startDate,
      end_date: endDate,
      skipPendingLimitCheck: true,
    });

    assert.strictEqual(event.duration_days, 100, 'Event duration_days must be 100');
    assert.strictEqual(Number(event.event_price), 10000.00, 'Price must match 91+ day tier (10000.00)');
    passedCount++;
    console.log('✓ PASS: 100-day event created successfully with 91+ day tier price (RM10,000)');
  }

  // =========================================================================
  // TEST 8: Duration with no tier - gap in tiers (tiers 1-7 and 14-30, duration 10)
  // =========================================================================
  console.log('TEST 8: Duration with no tier - gap in tiers (duration 10 with gap 8-13)...');
  {
    const gapGame = await createGame({
      organization_id: orgId,
      name: 'Gap Game Test',
      slug: 'gap-game',
      game_type: 'catch-brand',
    });
    const gapTheme = await createTheme({
      organization_id: orgId,
      game_id: gapGame.id,
      name: 'Gap Theme Test',
      status: 'active',
    });

    const now = new Date().toISOString();
    localGamePricingCache.set(gapGame.id, [
      {
        id: crypto.randomUUID(),
        game_id: gapGame.id,
        min_days: 1,
        max_days: 7,
        price: 1500,
        currency: 'MYR',
        is_active: true,
        is_base: true,
        created_at: now,
        updated_at: now,
      },
      {
        id: crypto.randomUUID(),
        game_id: gapGame.id,
        min_days: 14,
        max_days: 30,
        price: 3000,
        currency: 'MYR',
        is_active: true,
        is_base: false,
        created_at: now,
        updated_at: now,
      },
    ]);

    const startDate = '2026-10-01';
    const endDate = '2026-10-10'; // 10 days
    const days = calculateEventCalendarDays(startDate, endDate);
    assert.strictEqual(days, 10, 'Duration must be 10 days');

    try {
      await createEvent({
        organization_id: orgId,
        game_id: gapGame.id,
        game_theme_id: gapTheme.id,
        name: 'Gap Duration Event',
        start_date: startDate,
        end_date: endDate,
        skipPendingLimitCheck: true,
      });
      assert.fail('Expected event creation to fail with NO_PRICING_TIER for duration in gap');
    } catch (err: any) {
      assert.strictEqual(err.code, 'NO_PRICING_TIER', `Expected error code NO_PRICING_TIER, got: ${err.code}`);
      assert.strictEqual(err.status, 422, 'Expected status 422');
      passedCount++;
      console.log('✓ PASS: Duration in pricing gap correctly rejected with NO_PRICING_TIER (422)');
    }
  }

  // =========================================================================
  // TEST 9: Duration exceeding highest tier (max_days=30, no unbounded tier, duration 31)
  // =========================================================================
  console.log('TEST 9: Duration exceeding highest tier (max_days=30, no unbounded tier)...');
  {
    const boundedGame = await createGame({
      organization_id: orgId,
      name: 'Bounded Game Test',
      slug: 'bounded-game',
      game_type: 'catch-brand',
    });
    const boundedTheme = await createTheme({
      organization_id: orgId,
      game_id: boundedGame.id,
      name: 'Bounded Theme Test',
      status: 'active',
    });

    const now = new Date().toISOString();
    localGamePricingCache.set(boundedGame.id, [
      {
        id: crypto.randomUUID(),
        game_id: boundedGame.id,
        min_days: 1,
        max_days: 14,
        price: 1500,
        currency: 'MYR',
        is_active: true,
        is_base: true,
        created_at: now,
        updated_at: now,
      },
      {
        id: crypto.randomUUID(),
        game_id: boundedGame.id,
        min_days: 15,
        max_days: 30, // Highest tier stops at 30 days
        price: 2500,
        currency: 'MYR',
        is_active: true,
        is_base: false,
        created_at: now,
        updated_at: now,
      },
    ]);

    const startDate = '2026-10-01';
    const endDate = '2026-10-31'; // 31 days
    const days = calculateEventCalendarDays(startDate, endDate);
    assert.strictEqual(days, 31, 'Duration must be 31 days');

    try {
      await createEvent({
        organization_id: orgId,
        game_id: boundedGame.id,
        game_theme_id: boundedTheme.id,
        name: 'Exceeding Tier Event',
        start_date: startDate,
        end_date: endDate,
        skipPendingLimitCheck: true,
      });
      assert.fail('Expected event creation to fail when duration exceeds highest bounded tier');
    } catch (err: any) {
      assert.strictEqual(err.code, 'NO_PRICING_TIER', `Expected error code NO_PRICING_TIER, got: ${err.code}`);
      assert.strictEqual(err.status, 422, 'Expected status 422');
      passedCount++;
      console.log('✓ PASS: Duration exceeding highest tier correctly rejected with NO_PRICING_TIER (422)');
    }
  }

  // =========================================================================
  // TEST 10: Inactive tier (tier covers duration, but is_active=false)
  // =========================================================================
  console.log('TEST 10: Inactive tier (is_active=false must be rejected)...');
  {
    const inactiveTierGame = await createGame({
      organization_id: orgId,
      name: 'Inactive Tier Game Test',
      slug: 'inactive-tier-game',
      game_type: 'catch-brand',
    });
    const inactiveTierTheme = await createTheme({
      organization_id: orgId,
      game_id: inactiveTierGame.id,
      name: 'Inactive Tier Theme Test',
      status: 'active',
    });

    const now = new Date().toISOString();
    localGamePricingCache.set(inactiveTierGame.id, [
      {
        id: crypto.randomUUID(),
        game_id: inactiveTierGame.id,
        min_days: 1,
        max_days: 7,
        price: 1500,
        currency: 'MYR',
        is_active: true,
        is_base: true,
        created_at: now,
        updated_at: now,
      },
      {
        id: crypto.randomUUID(),
        game_id: inactiveTierGame.id,
        min_days: 8,
        max_days: 30,
        price: 3000,
        currency: 'MYR',
        is_active: false, // INACTIVE!
        is_base: false,
        created_at: now,
        updated_at: now,
      },
    ]);

    const startDate = '2026-10-01';
    const endDate = '2026-10-15'; // 15 days (covered only by inactive tier)

    try {
      await createEvent({
        organization_id: orgId,
        game_id: inactiveTierGame.id,
        game_theme_id: inactiveTierTheme.id,
        name: 'Inactive Tier Event',
        start_date: startDate,
        end_date: endDate,
        skipPendingLimitCheck: true,
      });
      assert.fail('Expected event creation to fail when matching tier is inactive');
    } catch (err: any) {
      assert.strictEqual(err.code, 'NO_PRICING_TIER', `Expected error code NO_PRICING_TIER, got: ${err.code}`);
      assert.strictEqual(err.status, 422, 'Expected status 422');
      passedCount++;
      console.log('✓ PASS: Inactive tier correctly rejected with NO_PRICING_TIER (422)');
    }
  }

  // =========================================================================
  // TEST 11: Game with no pricing tiers (fail-closed, never fallback to RM1,400)
  // =========================================================================
  console.log('TEST 11: Game with no pricing tiers (fail-closed)...');
  {
    const noPricingGame = await createGame({
      organization_id: orgId,
      name: 'No Pricing Game Test',
      slug: 'no-pricing-game',
      game_type: 'custom-type',
    });
    const noPricingTheme = await createTheme({
      organization_id: orgId,
      game_id: noPricingGame.id,
      name: 'No Pricing Theme Test',
      status: 'active',
    });

    // Explicitly set zero pricing tiers for this game
    localGamePricingCache.set(noPricingGame.id, []);

    const startDate = '2026-10-01';
    const endDate = '2026-10-01';

    try {
      await createEvent({
        organization_id: orgId,
        game_id: noPricingGame.id,
        game_theme_id: noPricingTheme.id,
        name: 'No Pricing Event',
        start_date: startDate,
        end_date: endDate,
        skipPendingLimitCheck: true,
      });
      assert.fail('Expected event creation to fail-closed when game has no pricing tiers');
    } catch (err: any) {
      assert.strictEqual(err.code, 'NO_PRICING_TIER', `Expected error code NO_PRICING_TIER, got: ${err.code}`);
      assert.strictEqual(err.status, 422, 'Expected status 422');
      passedCount++;
      console.log('✓ PASS: Game without pricing tiers failed closed with NO_PRICING_TIER (422)');
    }
  }

  // =========================================================================
  // TEST 12: Game pricing isolation (uses selected game price, not another game's)
  // =========================================================================
  console.log('TEST 12: Game pricing isolation across games...');
  {
    const startDate = '2026-10-01';
    const endDate = '2026-10-01'; // 1 day

    const catchEvent = await createEvent({
      organization_id: orgId,
      game_id: catchGame.id,
      game_theme_id: catchTheme.id,
      name: 'Catch Isolation Event',
      start_date: startDate,
      end_date: endDate,
      skipPendingLimitCheck: true,
    });

    const memoryEvent = await createEvent({
      organization_id: orgId,
      game_id: memoryGame.id,
      game_theme_id: memoryTheme.id,
      name: 'Memory Isolation Event',
      start_date: startDate,
      end_date: endDate,
      skipPendingLimitCheck: true,
    });

    const reactionEvent = await createEvent({
      organization_id: orgId,
      game_id: reactionGame.id,
      game_theme_id: reactionTheme.id,
      name: 'Reaction Isolation Event',
      start_date: startDate,
      end_date: endDate,
      skipPendingLimitCheck: true,
    });

    assert.strictEqual(Number(catchEvent.event_price), 1400.00, 'Catch event must be RM1,400');
    assert.strictEqual(Number(memoryEvent.event_price), 1200.00, 'Memory event must be RM1,200 (isolated from catch)');
    assert.strictEqual(Number(reactionEvent.event_price), 1000.00, 'Reaction event must be RM1,000 (isolated from catch and memory)');
    passedCount++;
    console.log('✓ PASS: Game pricing isolation verified (Catch: RM1,400, Memory: RM1,200, Reaction: RM1,000)');
  }

  console.log('=================================================================');
  console.log(`RESULTS: ${passedCount} OF 12 TESTS PASSED (0 FAILED)`);
  console.log('=================================================================');
}

runEventDurationPricingTiersTestSuite().catch((err) => {
  console.error('Test suite failed with error:', err);
  process.exit(1);
});
