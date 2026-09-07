import assert from 'node:assert';
import { createOrganization } from './organizations.js';
import { createGame } from './games.js';
import { createTheme } from './themes.js';
import { createEvent } from './events.js';
import { submitEventScore, getEventHighScores, clearEventHighScores } from './highScores.js';
import { DEFAULT_REACTION_CONFIG } from '../../src/games/reaction-time/types.js';
import worker from '../../worker.js';

async function runTests() {
  console.log('=== Starting Reaction Tap / Reaction Time Server-Side Validation Tests ===\n');

  // 1. Setup mock organization and game
  const org = await createOrganization({
    name: 'Reflex Speed Org ' + Date.now(),
    owner_id: 'owner_' + Date.now(),
  });

  const game = await createGame({
    organization_id: org.id,
    name: 'Reaction Game',
    slug: 'reaction-tap',
    game_type: 'reaction-tap',
    status: 'active',
  });

  // 2. Create reaction-tap theme
  const theme = await createTheme({
    organization_id: org.id,
    game_id: game.id,
    name: 'Formula Reflex Theme',
    slug: 'reaction-tap-' + Date.now(),
    game_type: 'reaction-tap',
    is_system: false,
    game_config: DEFAULT_REACTION_CONFIG as any,
  });

  // 3. Create Live, Paid Event
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const nextWeekStr = nextWeek.toISOString().split('T')[0];

  const event = await createEvent({
    organization_id: org.id,
    name: 'Formula 1 Reflex Challenge',
    game_id: game.id,
    game_theme_id: theme.id,
    start_date: todayStr,
    end_date: nextWeekStr,
    starts_at: `${todayStr}T00:00:00.000Z`,
    expires_at: `${nextWeekStr}T23:59:59.999Z`,
    status: 'active',
    payment_status: 'PAID',
    event_status: 'LIVE',
  });

  await clearEventHighScores(event.id);

  console.log('Test 1: Legitimate score (average 220ms, 5 rounds) is accepted');
  const validRes = await submitEventScore({
    event_id: event.id,
    player_name: 'Lewis Hamilton',
    score: 220,
    metadata: {
      gameType: 'reaction-tap',
      averageReactionTimeMs: 220,
      bestReactionTimeMs: 195,
      worstReactionTimeMs: 245,
      roundsCount: 5,
      rounds: [
        { round: 1, reactionTimeMs: 210, falseStart: false, timestamp: Date.now() - 8000 },
        { round: 2, reactionTimeMs: 195, falseStart: false, timestamp: Date.now() - 6000 },
        { round: 3, reactionTimeMs: 230, falseStart: false, timestamp: Date.now() - 4000 },
        { round: 4, reactionTimeMs: 220, falseStart: false, timestamp: Date.now() - 2000 },
        { round: 5, reactionTimeMs: 245, falseStart: false, timestamp: Date.now() },
      ],
      rating: 'PRO RACER',
    },
  });

  assert.strictEqual(validRes.rank, 1, 'First valid score must be Rank 1');
  assert.strictEqual(validRes.isNewHighScore, true, 'First score must be new high score');
  console.log('  ✓ Accepted: rank 1, isNewHighScore true');

  console.log('\nTest 2: Ascending ranking verification (Faster 185ms takes Rank 1 over 220ms)');
  const fasterRes = await submitEventScore({
    event_id: event.id,
    player_name: 'Max Verstappen',
    score: 185,
    metadata: {
      gameType: 'reaction-tap',
      averageReactionTimeMs: 185,
      bestReactionTimeMs: 172,
      worstReactionTimeMs: 198,
      roundsCount: 5,
      rounds: [
        { round: 1, reactionTimeMs: 180, falseStart: false, timestamp: Date.now() },
        { round: 2, reactionTimeMs: 172, falseStart: false, timestamp: Date.now() },
        { round: 3, reactionTimeMs: 190, falseStart: false, timestamp: Date.now() },
        { round: 4, reactionTimeMs: 185, falseStart: false, timestamp: Date.now() },
        { round: 5, reactionTimeMs: 198, falseStart: false, timestamp: Date.now() },
      ],
      rating: 'SUPERHUMAN',
    },
  });

  assert.strictEqual(fasterRes.rank, 1, '185ms must beat 220ms and take Rank 1');
  assert.strictEqual(fasterRes.isNewHighScore, true, 'Faster score must be new high score');
  console.log('  ✓ Faster score takes Rank 1');

  console.log('\nTest 3: Slower score (310ms) takes Rank 3');
  const slowerRes = await submitEventScore({
    event_id: event.id,
    player_name: 'Rookie Racer',
    score: 310,
    metadata: {
      gameType: 'reaction-tap',
      averageReactionTimeMs: 310,
      bestReactionTimeMs: 290,
      worstReactionTimeMs: 340,
      roundsCount: 5,
      rounds: [
        { round: 1, reactionTimeMs: 310, falseStart: false, timestamp: Date.now() },
      ],
      rating: 'GREAT REFLEXES',
    },
  });

  assert.strictEqual(slowerRes.rank, 3, '310ms must be ranked after 185ms and 220ms (Rank 3)');
  assert.strictEqual(slowerRes.isNewHighScore, false, 'Slower score must not be new high score');
  console.log('  ✓ Slower score takes Rank 3');

  console.log('\nTest 4: Leaderboard retrieval reflects ascending order (185ms, 220ms, 310ms)');
  const leaderboard = await getEventHighScores(event.id, { limit: 10, scoreEnvironment: 'live' });
  assert.strictEqual(leaderboard.scores.length, 3);
  assert.strictEqual(leaderboard.scores[0].score, 185, 'Leaderboard 1st must be 185ms');
  assert.strictEqual(leaderboard.scores[1].score, 220, 'Leaderboard 2nd must be 220ms');
  assert.strictEqual(leaderboard.scores[2].score, 310, 'Leaderboard 3rd must be 310ms');
  console.log('  ✓ Leaderboard correctly sorted in ascending order (lower reaction time = better rank)');

  console.log('\nTest 5: Game type mismatch rejected');
  let mismatchCaught = false;
  try {
    await submitEventScore({
      event_id: event.id,
      player_name: 'Cheater',
      score: 500,
      metadata: {
        gameType: 'memory-match',
      },
    });
  } catch (err: any) {
    mismatchCaught = true;
    assert.strictEqual(err.code, 'GAME_TYPE_MISMATCH');
  }
  assert.strictEqual(mismatchCaught, true, 'Submitting memory-match score to reaction-tap event must be rejected');
  console.log('  ✓ Incompatible game type rejected with GAME_TYPE_MISMATCH');

  console.log('\nTest 6: Public Worker endpoint accepts legitimate reaction score');
  const publicReq = new Request(`https://api.eventgamestudio.local/api/public/events/${event.public_token}/high-scores`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      player_name: 'Public Racer',
      score: 205,
      session_id: 'rt_sess_' + Date.now(),
      metadata: {
        gameType: 'reaction-tap',
        averageReactionTimeMs: 205,
        bestReactionTimeMs: 195,
        worstReactionTimeMs: 215,
        roundsCount: 5,
        rounds: [
          { round: 1, reactionTimeMs: 205, falseStart: false, timestamp: Date.now() },
        ],
        rating: 'PRO RACER',
      },
    }),
  });

  const workerRes = await worker.fetch(publicReq, {} as any);
  assert.strictEqual(workerRes.status, 201, 'Public endpoint must respond with 201 Created');
  const workerJson = await workerRes.json();
  assert.strictEqual(workerJson.success, true);
  console.log('  ✓ Public Worker endpoint successfully accepts reaction score');

  console.log('\n======================================================');
  console.log('All Reaction Game Server-Side Validation Tests Passed!');
  console.log('======================================================\n');
}

runTests().catch((err) => {
  console.error('Test failure:', err);
  process.exit(1);
});
