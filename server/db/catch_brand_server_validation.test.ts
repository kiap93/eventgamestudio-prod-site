import assert from 'node:assert';
import { createOrganization } from './organizations.js';
import { createGame } from './games.js';
import { createTheme } from './themes.js';
import { createEvent, resolveAuthoritativeCatchBrandConfig } from './events.js';
import { submitEventScore, getEventHighScores, clearEventHighScores } from './highScores.js';
import {
  calculateCatchBrandSanityLimits,
  validateCatchBrandResult,
} from '../games/catchBrandScoring.js';
import worker from '../../worker.js';

async function runTests() {
  console.log('=== Starting Catch The Brand Server-Side Sanity Validation Tests ===\n');

  // Setup mock organization and game
  const org = await createOrganization({
    name: 'CTB Security Org ' + Date.now(),
    owner_id: 'owner_' + Date.now(),
  });

  const game = await createGame({
    organization_id: org.id,
    name: 'Catch The Brand',
    slug: 'catch-brand',
    game_type: 'catch-brand',
    status: 'active',
  });

  // Create standard Catch The Brand theme (20s, 550ms spawn interval, 10/50/-10 items)
  const theme = await createTheme({
    organization_id: org.id,
    game_id: game.id,
    name: 'Carnival Theme',
    slug: 'carnival-theme-' + Date.now(),
    game_type: 'catch-brand',
    is_system: false,
    items_config: [
      { id: 'ticket', name: 'Ticket', points: 10, isHazard: false, isBonus: false, enabled: true, speedMultiplier: 1, spawnWeight: 10 },
      { id: 'mask', name: 'Mask', points: -10, isHazard: true, isBonus: false, enabled: true, speedMultiplier: 1, spawnWeight: 10 },
      { id: 'star', name: 'Star', points: 50, isHazard: false, isBonus: true, enabled: true, speedMultiplier: 1, spawnWeight: 5 },
    ] as any,
    physics_config: {
      gameDurationSeconds: 20,
      spawnIntervalMin: 550,
      difficultyStages: [
        { timeThreshold: 0, spawnInterval: 1000, stageName: 'Stage 1', speedMin: 150, speedMax: 250, hazardRatio: 0.1, bonusRatio: 0.1 },
        { timeThreshold: 7, spawnInterval: 750, stageName: 'Stage 2', speedMin: 200, speedMax: 300, hazardRatio: 0.15, bonusRatio: 0.1 },
        { timeThreshold: 14, spawnInterval: 550, stageName: 'Stage 3', speedMin: 250, speedMax: 350, hazardRatio: 0.2, bonusRatio: 0.1 },
      ],
    } as any,
  });

  // Create Live, Paid Event
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const nextWeekStr = nextWeek.toISOString().split('T')[0];

  const event = await createEvent({
    organization_id: org.id,
    game_id: game.id,
    game_theme_id: theme.id,
    name: 'Carnival Festival ' + Date.now(),
    start_date: todayStr,
    end_date: nextWeekStr,
    starts_at: `${todayStr}T00:00:00.000Z`,
    expires_at: `${nextWeekStr}T23:59:59.999Z`,
    status: 'active',
    payment_status: 'PAID',
    event_status: 'LIVE',
  });

  // Clean slate for scores
  await clearEventHighScores(event.id);

  // --------------------------------------------------------------------------
  // Test 1: Authoritative Configuration Resolution & Sanity Limits
  // --------------------------------------------------------------------------
  console.log('Test 1: Resolving authoritative configuration and calculating sanity limits...');
  const ctbConfig = await resolveAuthoritativeCatchBrandConfig(event);
  assert.strictEqual(ctbConfig.gameDurationSeconds, 20, 'Duration should be 20 seconds');
  assert.strictEqual(ctbConfig.minSpawnIntervalMs, 550, 'Minimum spawn interval should be 550ms');
  assert.strictEqual(ctbConfig.maxBonusPoints, 50, 'Max bonus item points should be 50');
  assert.strictEqual(ctbConfig.maxGoodPoints, 10, 'Max regular item points should be 10');
  assert.strictEqual(ctbConfig.minHazardPenalty, 10, 'Min hazard penalty should be 10');
  assert.ok(ctbConfig.theoreticalMaxSpawns <= 70, `Theoretical spawns (${ctbConfig.theoreticalMaxSpawns}) should be reasonable (< 70)`);
  assert.ok(ctbConfig.maxPossibleScore >= 3500 && ctbConfig.maxPossibleScore <= 6000, `Max score (${ctbConfig.maxPossibleScore}) should be reasonable`);
  console.log(`  ✓ Configuration resolved: maxSpawns=${ctbConfig.theoreticalMaxSpawns}, maxPossibleScore=${ctbConfig.maxPossibleScore}`);

  // --------------------------------------------------------------------------
  // Test 2: Forged Score (999,999) Rejection via direct function call
  // --------------------------------------------------------------------------
  console.log('\nTest 2: Direct rejection of forged score 999,999...');
  let forgedRejected = false;
  try {
    await submitEventScore({
      event_id: event.id,
      player_name: 'Cheater999',
      score: 999999,
      session_id: 'fake_sess_' + Date.now(),
    });
  } catch (err: any) {
    forgedRejected = true;
    assert.strictEqual(err.status, 422, 'Forged score must return 422');
    assert.strictEqual(err.code, 'SCORE_EXCEEDS_MAXIMUM_POSSIBLE', 'Must return code SCORE_EXCEEDS_MAXIMUM_POSSIBLE');
    console.log(`  ✓ Successfully rejected forged 999,999 score with 422 [${err.code}]: ${err.message}`);
  }
  assert.ok(forgedRejected, 'Forged score 999,999 must be rejected');

  // --------------------------------------------------------------------------
  // Test 3: Moderate Forged Score (50,000) Rejection
  // --------------------------------------------------------------------------
  console.log('\nTest 3: Direct rejection of forged score 50,000...');
  let moderateForgedRejected = false;
  try {
    await submitEventScore({
      event_id: event.id,
      player_name: 'Cheater50k',
      score: 50000,
      session_id: 'fake_sess_50k_' + Date.now(),
    });
  } catch (err: any) {
    moderateForgedRejected = true;
    assert.strictEqual(err.status, 422, 'Forged score 50,000 must return 422');
    assert.strictEqual(err.code, 'SCORE_EXCEEDS_MAXIMUM_POSSIBLE');
    console.log(`  ✓ Successfully rejected 50,000 score with 422 [${err.code}]: ${err.message}`);
  }
  assert.ok(moderateForgedRejected, 'Forged score 50,000 must be rejected');

  // --------------------------------------------------------------------------
  // Test 4: Catch Count Inconsistency (Reported Catches cannot yield claimed score)
  // --------------------------------------------------------------------------
  console.log('\nTest 4: Rejection when reported catches cannot mathematically yield claimed score...');
  let catchMismatchRejected = false;
  try {
    await submitEventScore({
      event_id: event.id,
      player_name: 'CatchLiar',
      score: 2500,
      session_id: 'sess_catch_liar_' + Date.now(),
      metadata: {
        greenCaught: 5, // 5 * 10 = 50 points max
        orangeCaught: 0,
        goldenCaught: 0,
      },
    });
  } catch (err: any) {
    catchMismatchRejected = true;
    assert.strictEqual(err.status, 422);
    assert.strictEqual(err.code, 'INVALID_CATCH_BRAND_SCORE');
    console.log(`  ✓ Successfully rejected catch mismatch with 422: ${err.message}`);
  }
  assert.ok(catchMismatchRejected, 'Score exceeding catches ceiling must be rejected');

  // --------------------------------------------------------------------------
  // Test 5: Impossible Item Catch Counts (Exceeding max theoretical spawns)
  // --------------------------------------------------------------------------
  console.log('\nTest 5: Rejection when item count exceeds maximum physically possible spawns...');
  let impossibleSpawnsRejected = false;
  try {
    await submitEventScore({
      event_id: event.id,
      player_name: 'BotSpammer',
      score: 1000,
      session_id: 'sess_bot_' + Date.now(),
      metadata: {
        greenCaught: 100, // 100 items impossible in 20s
        goldenCaught: 0,
      },
    });
  } catch (err: any) {
    impossibleSpawnsRejected = true;
    assert.strictEqual(err.status, 422);
    assert.strictEqual(err.code, 'INVALID_CATCH_BRAND_SCORE');
    console.log(`  ✓ Successfully rejected impossible item count: ${err.message}`);
  }
  assert.ok(impossibleSpawnsRejected, 'Items exceeding physical spawns must be rejected');

  // --------------------------------------------------------------------------
  // Test 6: Detailed Item Breakdown Validation (Authoritative item map calculation)
  // --------------------------------------------------------------------------
  console.log('\nTest 6: Authoritative validation using itemsCaughtById...');
  // 10 tickets (10*10=100) + 2 stars (2*50=100) - 1 mask (1*-10=-10) = 190 points
  const itemsBreakdown = {
    ticket: 10,
    star: 2,
    mask: 1,
  };

  // 6a: Attacker claims score 800 with breakdown that only equals 190
  let breakdownSpoofRejected = false;
  try {
    await submitEventScore({
      event_id: event.id,
      player_name: 'BreakdownSpoofer',
      score: 800,
      session_id: 'sess_breakdown_spoof_' + Date.now(),
      metadata: {
        itemsCaughtById: itemsBreakdown,
      },
    });
  } catch (err: any) {
    breakdownSpoofRejected = true;
    assert.strictEqual(err.status, 422);
    assert.strictEqual(err.code, 'INVALID_CATCH_BRAND_SCORE');
    console.log(`  ✓ Successfully rejected score mismatch with breakdown: ${err.message}`);
  }
  assert.ok(breakdownSpoofRejected, 'Score exceeding breakdown must be rejected');

  // 6b: Legitimate submission with matching breakdown
  const legitBreakdownSubmission = await submitEventScore({
    event_id: event.id,
    player_name: 'HonestPlayerBreakdown',
    score: 190,
    session_id: 'sess_honest_breakdown_' + Date.now(),
    metadata: {
      itemsCaughtById: itemsBreakdown,
    },
  });
  assert.strictEqual(legitBreakdownSubmission.score.score, 190, 'Score should be verified as 190');
  console.log('  ✓ Honest submission with item breakdown accepted with exact score 190');

  // --------------------------------------------------------------------------
  // Test 7: Legitimate Human Gameplay High Score Accepted
  // --------------------------------------------------------------------------
  console.log('\nTest 7: Legitimate human gameplay score (650) accepted...');
  const legitSubmission = await submitEventScore({
    event_id: event.id,
    player_name: 'ProGamer',
    score: 650,
    session_id: 'sess_pro_gamer_' + Date.now(),
    metadata: {
      greenCaught: 25,
      goldenCaught: 8,
      orangeCaught: 0,
    },
  });
  assert.strictEqual(legitSubmission.score.score, 650);
  assert.strictEqual(legitSubmission.rank, 1, 'ProGamer should be rank 1');
  console.log('  ✓ Legitimate human score 650 successfully accepted and placed at Rank #1');

  // --------------------------------------------------------------------------
  // Test 8: Public Worker Endpoint Anti-Cheat: Reject POST 999,999 with 422
  // --------------------------------------------------------------------------
  console.log('\nTest 8: Public API /api/public/events/:publicToken/high-scores blocks forged 999,999...');
  const workerEnv = {};
  const fakePublicReq = new Request(`https://api.eventgamestudio.local/api/public/events/${event.public_token}/high-scores`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      player_name: 'PublicAttacker',
      score: 999999,
      session_id: 'pub_attack_' + Date.now(),
    }),
  });

  const publicRes = await worker.fetch(fakePublicReq, workerEnv);
  assert.strictEqual(publicRes.status, 422, 'Public endpoint must reject forged score with HTTP 422');
  const publicError = await publicRes.json();
  assert.strictEqual((publicError as any).code, 'SCORE_EXCEEDS_MAXIMUM_POSSIBLE');
  console.log(`  ✓ Public endpoint returned HTTP 422 with code "${(publicError as any).code}"`);

  // --------------------------------------------------------------------------
  // Test 9: Public Worker Endpoint: Legitimate player accepted
  // --------------------------------------------------------------------------
  console.log('\nTest 9: Public API /api/public/events/:publicToken/high-scores accepts legitimate score (450)...');
  const legitPublicReq = new Request(`https://api.eventgamestudio.local/api/public/events/${event.public_token}/high-scores`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      player_name: 'LegitPublicPlayer',
      score: 450,
      session_id: 'pub_legit_' + Date.now(),
      metadata: {
        greenCaught: 15,
        goldenCaught: 6,
        orangeCaught: 0,
      },
    }),
  });

  const legitPublicRes = await worker.fetch(legitPublicReq, workerEnv);
  assert.strictEqual(legitPublicRes.status, 201, 'Public endpoint must accept legitimate score with HTTP 201');
  const legitPublicData = await legitPublicRes.json();
  assert.strictEqual((legitPublicData as any).success, true);
  console.log('  ✓ Public endpoint returned HTTP 201 Created and successfully saved score');

  // Verify leaderboard only contains legitimate scores, never 999,999
  const { scores } = await getEventHighScores(event.id);
  assert.ok(scores.length > 0, 'Leaderboard must have submitted scores');
  const highestScore = scores[0].score;
  assert.ok(highestScore < 1000, `Highest leaderboard score (${highestScore}) must be legitimate and < 1000`);
  assert.strictEqual(scores.some((s) => s.score > 5000), false, 'No forged scores must exist on leaderboard');
  console.log('  ✓ Leaderboard verified clean: no forged scores exist');

  console.log('\n=== All Catch The Brand Server-Side Sanity Validation Tests PASSED ===\n');
}

runTests().catch((err) => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
