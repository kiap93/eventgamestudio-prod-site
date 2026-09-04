import assert from 'node:assert';
import {
  calculateBoardDimensions,
  normalizeBoardConfig,
} from '../../src/games/memory-match/memoryMatchBoardLayout';
import { createShuffledDeck } from '../../src/games/memory-match/cardDeck';
import { getMemoryMatchConfig } from '../../src/themes/types';
import { calculateMemoryMatchScore } from '../games/memoryMatchScoring.js';
import { submitEventScore, clearEventHighScores } from './highScores.js';
import { createOrganization } from './organizations.js';
import { createGame } from './games.js';
import { createTheme } from './themes.js';
import { createEvent } from './events.js';

async function runMemoryMatchServerValidationTests() {
  console.log('====================================================');
  console.log('TEST SUITE: MEMORY MATCH (Scenarios 8 - 12)');
  console.log('====================================================\n');

  // --------------------------------------------------------------------------
  // Scenario 8: 2 × 8 produces 16 cards.
  // --------------------------------------------------------------------------
  console.log('Scenario 8: 2 × 8 produces 16 cards...');
  const dims2x8 = calculateBoardDimensions(2, 8);
  assert.strictEqual(dims2x8.rows, 2, 'Scenario 8: Rows must be 2');
  assert.strictEqual(dims2x8.cols, 8, 'Scenario 8: Cols must be 8');
  assert.strictEqual(dims2x8.totalCards, 16, 'Scenario 8: 2 × 8 must produce 16 cards');

  // Also verify with card deck creation
  const theme2x8: any = {
    id: 'theme-2x8-' + Date.now(),
    name: '2x8 Theme',
    game_config: {
      board: {
        rows: 2,
        cols: 8,
        layoutMode: 'grid',
      },
    },
  };
  const deck = createShuffledDeck(theme2x8);
  assert.strictEqual(deck.length, 16, 'Scenario 8: Deck must contain exactly 16 cards');
  console.log('  ✓ PASSED: 2 × 8 board layout produces exactly 16 cards');

  // --------------------------------------------------------------------------
  // Scenario 9: 2 × 8 produces 8 pairs.
  // --------------------------------------------------------------------------
  console.log('\nScenario 9: 2 × 8 produces 8 pairs...');
  assert.strictEqual(dims2x8.requiredPairs, 8, 'Scenario 9: 2 × 8 requires 8 pairs');

  // Check unique pairIds in deck
  const pairCounts: Record<string, number> = {};
  for (const card of deck) {
    pairCounts[card.pairId] = (pairCounts[card.pairId] || 0) + 1;
  }
  const uniquePairs = Object.keys(pairCounts);
  assert.strictEqual(uniquePairs.length, 8, 'Scenario 9: Deck must have 8 unique matching pairs');
  for (const pId of uniquePairs) {
    assert.strictEqual(pairCounts[pId], 2, `Scenario 9: Pair ${pId} must have exactly 2 cards`);
  }
  console.log('  ✓ PASSED: 2 × 8 board layout produces exactly 8 pairs with 2 cards each');

  // --------------------------------------------------------------------------
  // Scenario 10: Server derives 8 pairs from event configuration.
  // --------------------------------------------------------------------------
  console.log('\nScenario 10: Server derives 8 pairs from event configuration...');
  const org = await createOrganization({
    name: 'Memory Match Org ' + Date.now(),
    owner_id: '4c857d15-ab93-45a6-8de5-7858ab4d6bd2',
  });

  const mmGame = await createGame({
    organization_id: org.id,
    name: 'Memory Match Arena',
    slug: 'mm-arena-' + Date.now(),
    game_type: 'memory-match',
  });

  const mmTheme2x8 = await createTheme({
    organization_id: org.id,
    game_id: mmGame.id,
    name: '2x8 Memory Theme',
    game_config: {
      board: {
        rows: 2,
        cols: 8,
        layoutMode: 'grid',
      },
    },
  });

  const mmEvent = await createEvent({
    organization_id: org.id,
    game_id: mmGame.id,
    game_theme_id: mmTheme2x8.id,
    name: '2x8 Memory Match Live Event ' + Date.now(),
    status: 'live',
    payment_status: 'PAID',
    event_status: 'LIVE',
    starts_at: new Date(Date.now() - 3600000).toISOString(),
    expires_at: new Date(Date.now() + 86400000).toISOString(),
  });

  const expectedScore = calculateMemoryMatchScore({
    moves: 12,
    duration: 20,
    matchedPairs: 8,
    totalPairs: 8,
  });

  const validScore = await submitEventScore({
    event_id: mmEvent.id,
    player_name: 'LegitPlayer',
    score: expectedScore,
    metadata: {
      moves: 12,
      duration: 20,
      matchedPairs: 8,
      sessionId: 'session_server_derived_8',
    },
  });

  assert.strictEqual(
    validScore.score.metadata?.totalPairs,
    8,
    'Scenario 10: Server must derive 8 totalPairs from event configuration'
  );
  assert.strictEqual(
    validScore.score.metadata?.isVictory,
    true,
    'Scenario 10: 8 matched pairs out of 8 derived pairs is a victory'
  );
  console.log('  ✓ PASSED: Server authoritatively derived 8 pairs from event configuration');

  // --------------------------------------------------------------------------
  // Scenario 11: Client cannot change totalPairs by sending metadata.
  // --------------------------------------------------------------------------
  console.log('\nScenario 11: Client cannot change totalPairs by sending metadata...');
  let spoofFewerPairsRejected = false;
  try {
    // Client attempts to claim event has only 4 pairs to get an early completion bonus
    await submitEventScore({
      event_id: mmEvent.id,
      player_name: 'SpoofFewerPairs',
      score: 1200,
      metadata: {
        moves: 6,
        duration: 15,
        matchedPairs: 4,
        totalPairs: 4, // Client tampering!
        sessionId: 'session_tampered_total_pairs_4',
      },
    });
  } catch (err: any) {
    spoofFewerPairsRejected = true;
    assert.strictEqual(err.status, 422, 'Scenario 11: Expected 422 status');
    assert.strictEqual(err.code, 'INVALID_MEMORY_MATCH_SCORE', 'Scenario 11: Expected INVALID_MEMORY_MATCH_SCORE');
    assert.ok(
      err.message.includes('Client cannot change totalPairs'),
      `Scenario 11: Error message should mention totalPairs tampering, got: ${err.message}`
    );
  }
  assert.strictEqual(
    spoofFewerPairsRejected,
    true,
    'Scenario 11: Client attempt to change totalPairs to 4 must be rejected'
  );

  let spoofMorePairsRejected = false;
  try {
    // Client attempts to claim event has 12 pairs
    await submitEventScore({
      event_id: mmEvent.id,
      player_name: 'SpoofMorePairs',
      score: 1500,
      metadata: {
        moves: 18,
        duration: 35,
        matchedPairs: 12,
        totalPairs: 12, // Client tampering!
        sessionId: 'session_tampered_total_pairs_12',
      },
    });
  } catch (err: any) {
    spoofMorePairsRejected = true;
    assert.strictEqual(err.status, 422, 'Scenario 11: Expected 422 status');
    assert.strictEqual(err.code, 'INVALID_MEMORY_MATCH_SCORE', 'Scenario 11: Expected INVALID_MEMORY_MATCH_SCORE');
  }
  assert.strictEqual(
    spoofMorePairsRejected,
    true,
    'Scenario 11: Client attempt to change totalPairs to 12 must be rejected'
  );
  console.log('  ✓ PASSED: Server rejected client metadata attempts to change totalPairs from 8');

  // --------------------------------------------------------------------------
  // Scenario 12: Client cannot bypass Memory Match validation by omitting gameType.
  // --------------------------------------------------------------------------
  console.log('\nScenario 12: Client cannot bypass Memory Match validation by omitting gameType...');
  // 12a. Submitting completely empty metadata to bypass MM validation
  let emptyMetadataBypassRejected = false;
  try {
    await submitEventScore({
      event_id: mmEvent.id,
      player_name: 'BypassEmptyMeta',
      score: 9999,
      metadata: {}, // Omitted gameType and omitted gameplay statistics
    });
  } catch (err: any) {
    emptyMetadataBypassRejected = true;
    assert.strictEqual(err.status, 422, 'Scenario 12a: Expected 422 status');
    assert.strictEqual(err.code, 'INVALID_MEMORY_MATCH_SCORE', 'Scenario 12a: Expected INVALID_MEMORY_MATCH_SCORE');
  }
  assert.strictEqual(emptyMetadataBypassRejected, true, 'Scenario 12a: Empty metadata submission must be rejected');

  // 12b. Submitting impossible move counts without gameType (e.g., 2 moves for 8 matches)
  let impossibleMovesBypassRejected = false;
  try {
    await submitEventScore({
      event_id: mmEvent.id,
      player_name: 'BypassImpossibleMoves',
      score: 500,
      metadata: {
        // gameType omitted
        moves: 2,
        matchedPairs: 8,
        duration: 25,
      },
    });
  } catch (err: any) {
    impossibleMovesBypassRejected = true;
    assert.strictEqual(err.status, 422, 'Scenario 12b: Expected 422 status');
    assert.strictEqual(err.code, 'INVALID_MEMORY_MATCH_SCORE', 'Scenario 12b: Expected INVALID_MEMORY_MATCH_SCORE');
  }
  assert.strictEqual(impossibleMovesBypassRejected, true, 'Scenario 12b: Impossible moves must be rejected without gameType');

  // 12c. Submitting impossible duration without gameType (0 seconds for 8 matches)
  let impossibleDurationBypassRejected = false;
  try {
    await submitEventScore({
      event_id: mmEvent.id,
      player_name: 'BypassZeroSeconds',
      score: 500,
      metadata: {
        // gameType omitted
        moves: 10,
        matchedPairs: 8,
        duration: 0.2, // Impossible
      },
    });
  } catch (err: any) {
    impossibleDurationBypassRejected = true;
    assert.strictEqual(err.status, 422, 'Scenario 12c: Expected 422 status');
  }
  assert.strictEqual(impossibleDurationBypassRejected, true, 'Scenario 12c: Impossible duration must be rejected without gameType');

  // 12d. Submitting forged score without gameType
  let forgedScoreBypassRejected = false;
  try {
    await submitEventScore({
      event_id: mmEvent.id,
      player_name: 'BypassForgedScore',
      score: 77777, // Forged score
      metadata: {
        // gameType omitted
        moves: 14,
        matchedPairs: 8,
        duration: 25,
      },
    });
  } catch (err: any) {
    forgedScoreBypassRejected = true;
    assert.strictEqual(err.status, 422, 'Scenario 12d: Expected 422 status');
  }
  assert.strictEqual(forgedScoreBypassRejected, true, 'Scenario 12d: Forged score must be rejected without gameType');

  // 12e. Legitimate submission without gameType is validated properly and marked with gameType
  const legitScoreNoGameType = calculateMemoryMatchScore({
    moves: 16,
    duration: 30,
    matchedPairs: 8,
    totalPairs: 8,
  });

  const validNoGameTypeRes = await submitEventScore({
    event_id: mmEvent.id,
    player_name: 'LegitPlayerNoGameType',
    score: legitScoreNoGameType,
    metadata: {
      // gameType omitted!
      moves: 16,
      duration: 30,
      matchedPairs: 8,
      sessionId: 'session_no_game_type_legit',
    },
  });

  assert.strictEqual(validNoGameTypeRes.score.score, legitScoreNoGameType, 'Scenario 12e: Score matches expected');
  assert.strictEqual(validNoGameTypeRes.score.metadata?.gameType, 'memory-match', 'Scenario 12e: gameType set to memory-match');
  assert.strictEqual(validNoGameTypeRes.score.metadata?.moves, 16, 'Scenario 12e: moves preserved');
  assert.strictEqual(validNoGameTypeRes.score.metadata?.matchedPairs, 8, 'Scenario 12e: matchedPairs preserved');
  console.log('  ✓ PASSED: Client cannot bypass Memory Match validation by omitting gameType; server enforces full rules');

  // Clean up
  await clearEventHighScores(mmEvent.id);

  console.log('\n====================================================');
  console.log('🎉 ALL 5 MEMORY MATCH SCENARIOS PASSED!');
  console.log('====================================================\n');
}

runMemoryMatchServerValidationTests().catch((err) => {
  console.error('❌ Test execution failed:', err);
  process.exit(1);
});
