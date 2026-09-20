import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { createEvent, localEventsCache } from './db/events.js';
import { localGamePricingCache, getGamePricingTierById } from './db/gamePricing.js';
import { localThemesCache } from './db/themes.js';
import { localOrgsCache } from './db/organizations.js';

console.log('========================================================================');
console.log('Running Pricing ID & Game Integrity Checks (Database RPC & TypeScript)');
console.log('========================================================================\n');

const orgId = '11111111-1111-1111-1111-111111111111';
const catchBrandThemeId = '22222222-2222-2222-2222-222222222222';
const memoryMatchThemeId = '33333333-3333-3333-3333-333333333333';

function resetTestData() {
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
}

async function runTests() {
  // Test 1: Retrieves a pricing tier by ID correctly
  {
    resetTestData();
    const tier = await getGamePricingTierById('catch-tier-1d');
    assert.ok(tier !== null, 'Pricing tier should not be null');
    assert.strictEqual(tier?.id, 'catch-tier-1d');
    assert.strictEqual(tier?.game_id, 'catch-brand');
    assert.strictEqual(tier?.price, 1400);

    const nonExistent = await getGamePricingTierById('unknown-tier-999');
    assert.strictEqual(nonExistent, null, 'Non-existent tier must return null');
    console.log('  ✓ Test 1: Retrieves a pricing tier by ID correctly');
  }

  // Test 2: Rejects event creation if pricing_id belongs to a different game (cross-game leakage prevention)
  {
    resetTestData();
    let threw = false;
    try {
      await createEvent({
        organization_id: orgId,
        game_theme_id: catchBrandThemeId,
        game_id: 'catch-brand',
        name: 'Brand Activation 2026',
        start_date: '2026-10-01',
        end_date: '2026-10-01',
        pricing_id: 'memory-tier-1d', // Memory Match pricing ID supplied for Catch the Brand event!
      });
    } catch (err: any) {
      threw = true;
      assert.strictEqual(err.code, 'PRICING_GAME_MISMATCH');
      assert.strictEqual(err.status, 422);
      assert.ok(err.message.includes('does not belong to the selected game'));
    }
    assert.ok(threw, 'Should have thrown PRICING_GAME_MISMATCH');
    console.log('  ✓ Test 2: Rejects event creation if pricing_id belongs to a different game (cross-game leakage prevention)');
  }

  // Test 3: Rejects event creation if pricing_id is inactive
  {
    resetTestData();
    let threw = false;
    try {
      await createEvent({
        organization_id: orgId,
        game_theme_id: catchBrandThemeId,
        game_id: 'catch-brand',
        name: 'Brand Activation 2026',
        start_date: '2026-10-01',
        end_date: '2026-10-03', // 3 days
        pricing_id: 'catch-tier-inactive', // Inactive tier
      });
    } catch (err: any) {
      threw = true;
      assert.strictEqual(err.code, 'PRICING_TIER_INACTIVE');
      assert.strictEqual(err.status, 422);
      assert.ok(err.message.includes('inactive'));
    }
    assert.ok(threw, 'Should have thrown PRICING_TIER_INACTIVE');
    console.log('  ✓ Test 3: Rejects event creation if pricing_id is inactive');
  }

  // Test 4: Rejects event creation if pricing_id does not cover the duration
  {
    resetTestData();
    let threw = false;
    try {
      await createEvent({
        organization_id: orgId,
        game_theme_id: catchBrandThemeId,
        game_id: 'catch-brand',
        name: 'Brand Activation 2026',
        start_date: '2026-10-01',
        end_date: '2026-10-02', // 2 days
        pricing_id: 'catch-tier-1d', // 1-day tier supplied for a 2-day event!
      });
    } catch (err: any) {
      threw = true;
      assert.strictEqual(err.code, 'PRICING_DURATION_MISMATCH');
      assert.strictEqual(err.status, 422);
      assert.ok(err.message.includes('does not cover this duration'));
    }
    assert.ok(threw, 'Should have thrown PRICING_DURATION_MISMATCH');
    console.log('  ✓ Test 4: Rejects event creation if pricing_id does not cover the duration');
  }

  // Test 5: Rejects event creation if pricing_id does not exist
  {
    resetTestData();
    let threw = false;
    try {
      await createEvent({
        organization_id: orgId,
        game_theme_id: catchBrandThemeId,
        game_id: 'catch-brand',
        name: 'Brand Activation 2026',
        start_date: '2026-10-01',
        end_date: '2026-10-01',
        pricing_id: 'ghost-tier-uuid',
      });
    } catch (err: any) {
      threw = true;
      assert.strictEqual(err.code, 'PRICING_TIER_NOT_FOUND');
      assert.strictEqual(err.status, 422);
      assert.ok(err.message.includes('does not exist'));
    }
    assert.ok(threw, 'Should have thrown PRICING_TIER_NOT_FOUND');
    console.log('  ✓ Test 5: Rejects event creation if pricing_id does not exist');
  }

  // Test 6: Successfully creates an event with a valid, matching, active pricing_id
  {
    resetTestData();
    const event = await createEvent({
      organization_id: orgId,
      game_theme_id: catchBrandThemeId,
      game_id: 'catch-brand',
      name: 'Brand Activation 2026',
      start_date: '2026-10-01',
      end_date: '2026-10-02', // 2 days
      pricing_id: 'catch-tier-2d',
    });

    assert.ok(event, 'Event should be defined');
    assert.strictEqual(event.pricing_id, 'catch-tier-2d');
    assert.strictEqual(event.duration_days, 2);
    assert.strictEqual(event.event_price, 1900);
    assert.strictEqual(event.event_currency, 'MYR');
    console.log('  ✓ Test 6: Successfully creates an event with a valid, matching, active pricing_id');
  }

  // Test 7: Auto-resolves the correct pricing tier when pricing_id is omitted
  {
    resetTestData();
    const event = await createEvent({
      organization_id: orgId,
      game_theme_id: catchBrandThemeId,
      game_id: 'catch-brand',
      name: 'Brand Activation 2026',
      start_date: '2026-10-01',
      end_date: '2026-10-01', // 1 day
    });

    assert.ok(event, 'Event should be defined');
    assert.strictEqual(event.pricing_id, 'catch-tier-1d');
    assert.strictEqual(event.duration_days, 1);
    assert.strictEqual(event.event_price, 1400);
    console.log('  ✓ Test 7: Auto-resolves the correct pricing tier when pricing_id is omitted');
  }

  // Test 8: Verify database RPC create_event_atomic enforces all 3 pricing integrity checks in SQL
  {
    const migrationFile = path.resolve(process.cwd(), 'supabase/migrations/20260923000000_fail_closed_event_pricing.sql');
    const schemaFile = path.resolve(process.cwd(), 'supabase/schema.sql');

    assert.ok(fs.existsSync(migrationFile), 'Migration 20260923000000 must exist');
    assert.ok(fs.existsSync(schemaFile), 'supabase/schema.sql must exist');

    const migrationSql = fs.readFileSync(migrationFile, 'utf-8');
    const schemaSql = fs.readFileSync(schemaFile, 'utf-8');

    for (const [name, sql] of [['Migration', migrationSql], ['Schema', schemaSql]]) {
      // Check 1: pricing.game_id = target_game_id
      assert.ok(
        sql.includes('v_pricing_record.game_id <> v_target_game_id') &&
        sql.includes('PRICING_GAME_MISMATCH'),
        `${name} RPC must enforce: pricing.game_id = target_game_id and reject cross-game pricing`
      );

      // Check 2: pricing is active
      assert.ok(
        sql.includes('NOT COALESCE(v_pricing_record.is_active, false)') &&
        sql.includes('PRICING_TIER_INACTIVE'),
        `${name} RPC must enforce: pricing is active and reject inactive tiers`
      );

      // Check 3: pricing covers duration_days
      assert.ok(
        sql.includes('v_duration_days < v_pricing_record.min_days') &&
        sql.includes('PRICING_DURATION_MISMATCH'),
        `${name} RPC must enforce: pricing covers duration_days`
      );
    }
    console.log('  ✓ Test 8: Database RPC create_event_atomic enforces all 3 pricing invariants in SQL (Migration + Schema)');
  }

  console.log('\n========================================================================');
  console.log('ALL PRICING ID & GAME INTEGRITY VALIDATION TESTS PASSED SUCCESSFULLY!');
  console.log('========================================================================\n');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
