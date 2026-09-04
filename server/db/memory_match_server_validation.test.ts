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
import { createEvent, resolveAuthoritativeMemoryMatchConfig } from './events.js';

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
      err.message.includes('Client cannot change totalPairs') || err.message.includes('Score mismatch') || err.message.includes('totalPairs'),
      `Scenario 11: Error message should mention totalPairs tampering or score mismatch, got: ${err.message}`
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

  // --------------------------------------------------------------------------
  // Scenario 13: Authoritative pair count enforcement & cross-game fallback prevention
  // --------------------------------------------------------------------------
  console.log('\nScenario 13: Authoritative pair count enforcement & cross-game fallback prevention...');

  // 13a. Actual event = 8 pairs, client claims = 48 pairs -> REJECT
  console.log('  13a: actual event = 8 pairs, client claims = 48 pairs -> REJECT');
  let claims48MatchedRejected = false;
  try {
    await submitEventScore({
      event_id: mmEvent.id, // 8-pair event
      player_name: 'Claim48MatchedOn8Event',
      score: 5000,
      metadata: {
        moves: 50,
        duration: 60,
        matchedPairs: 48, // Claims 48 matched pairs on an 8-pair event!
        totalPairs: 48,
        sessionId: 'session_claim_48_matched_on_8',
      },
    });
  } catch (err: any) {
    claims48MatchedRejected = true;
    assert.strictEqual(err.status, 422, '13a: Expected 422 status');
    assert.strictEqual(err.code, 'INVALID_MEMORY_MATCH_SCORE', '13a: Expected INVALID_MEMORY_MATCH_SCORE');
  }
  assert.strictEqual(claims48MatchedRejected, true, '13a: Client claiming 48 pairs on an 8-pair event must be rejected');

  let claims48TotalPairsRejected = false;
  try {
    await submitEventScore({
      event_id: mmEvent.id, // 8-pair event
      player_name: 'Claim48TotalPairsOn8Event',
      score: 1200,
      metadata: {
        moves: 12,
        duration: 25,
        matchedPairs: 8,
        totalPairs: 48, // Claims totalPairs is 48 on an 8-pair event!
        sessionId: 'session_claim_48_total_on_8',
      },
    });
  } catch (err: any) {
    claims48TotalPairsRejected = true;
    assert.strictEqual(err.status, 422, '13a: Expected 422 status');
    assert.strictEqual(err.code, 'INVALID_MEMORY_MATCH_SCORE', '13a: Expected INVALID_MEMORY_MATCH_SCORE');
  }
  assert.strictEqual(claims48TotalPairsRejected, true, '13a: Client claiming totalPairs=48 on an 8-pair event must be rejected');

  // 13b. Actual event = 48 pairs, client claims = 8 pairs -> server still uses 48
  console.log('  13b: actual event = 48 pairs, client claims = 8 pairs -> server still uses 48');
  const mmTheme48 = await createTheme({
    organization_id: org.id,
    game_id: mmGame.id,
    name: '48 Pairs Memory Match Theme',
    game_type: 'memory-match',
    game_config: {
      totalPairs: 48,
      board: {
        rows: 8,
        cols: 12,
        layoutMode: 'grid',
      },
    },
  });

  const mmEvent48 = await createEvent({
    organization_id: org.id,
    game_id: mmGame.id,
    game_theme_id: mmTheme48.id,
    name: '48 Pairs Memory Match Live Event ' + Date.now(),
    status: 'live',
    payment_status: 'PAID',
    event_status: 'LIVE',
    starts_at: new Date(Date.now() - 3600000).toISOString(),
    expires_at: new Date(Date.now() + 86400000).toISOString(),
  });

  // Client matched 8 pairs so far and client-provided metadata claims totalPairs: 8.
  // The server MUST NOT trust client's 8 pairs; server MUST use authoritative 48 pairs.
  // Since totalPairs is 48, 8 matched pairs is NOT a victory (no completion bonus, isVictory: false).
  const expectedPartialScore48 = calculateMemoryMatchScore({
    moves: 14,
    duration: 25,
    matchedPairs: 8,
    totalPairs: 48, // Evaluated with authoritative 48!
  });

  const submitOn48Res = await submitEventScore({
    event_id: mmEvent48.id,
    player_name: 'PlayerOn48Event',
    score: expectedPartialScore48,
    metadata: {
      moves: 14,
      duration: 25,
      matchedPairs: 8,
      totalPairs: 8, // Client claims 8 pairs!
      sessionId: 'session_client_claims_8_on_48',
    },
  });

  assert.strictEqual(
    submitOn48Res.score.metadata?.totalPairs,
    48,
    '13b: Server MUST still use authoritative 48 totalPairs regardless of client metadata claim of 8'
  );
  assert.strictEqual(
    submitOn48Res.score.metadata?.isVictory,
    false,
    '13b: 8 matched pairs out of authoritative 48 pairs is not a victory'
  );

  // If client tries to submit an 8-pair victory score (e.g. including completion bonus for 8/8) on the 48-pair event:
  const forgedVictoryScore8 = calculateMemoryMatchScore({
    moves: 14,
    duration: 25,
    matchedPairs: 8,
    totalPairs: 8, // Forged score claiming full board completion!
  });

  let forgedVictoryOn48Rejected = false;
  try {
    await submitEventScore({
      event_id: mmEvent48.id,
      player_name: 'ForgedVictoryPlayer',
      score: forgedVictoryScore8,
      metadata: {
        moves: 14,
        duration: 25,
        matchedPairs: 8,
        totalPairs: 8, // Client claims victory for 8 pairs
        sessionId: 'session_forged_victory_on_48',
      },
    });
  } catch (err: any) {
    forgedVictoryOn48Rejected = true;
    assert.strictEqual(err.status, 422, '13b: Expected 422 status');
    assert.strictEqual(err.code, 'INVALID_MEMORY_MATCH_SCORE', '13b: Expected INVALID_MEMORY_MATCH_SCORE');
  }
  assert.strictEqual(
    forgedVictoryOn48Rejected,
    true,
    '13b: Submitting score based on client pair count instead of authoritative 48 pairs must be rejected'
  );

  // 13c. Verify server resolves correct theme/configuration and CANNOT fall back to another game's configuration
  console.log('  13c: verify server resolves correct theme/configuration and cannot fall back cross-game');
  const resolved8 = await resolveAuthoritativeMemoryMatchConfig(mmEvent);
  assert.strictEqual(resolved8.authoritativeTotalPairs, 8, '13c: Event 1 resolves to 8 pairs');
  assert.strictEqual(resolved8.theme?.id, mmTheme2x8.id, '13c: Event 1 resolves to its 2x8 theme');

  const resolved48 = await resolveAuthoritativeMemoryMatchConfig(mmEvent48);
  assert.strictEqual(resolved48.authoritativeTotalPairs, 48, '13c: Event 2 resolves to 48 pairs');
  assert.strictEqual(resolved48.theme?.id, mmTheme48.id, '13c: Event 2 resolves to its 48-pair theme');

  // Verify that an event configured with Catch The Brand theme CANNOT be resolved or used as Memory Match config:
  const cbTheme = await createTheme({
    organization_id: org.id,
    name: 'Catch The Brand Theme',
    game_type: 'catch-brand',
    game_slug: 'catch-brand',
    items_config: [
      { id: 'item_1', name: 'Durian', points: 10, speedMultiplier: 1, spawnWeight: 50, enabled: true, isHazard: false },
    ],
  });

  const crossGameEvent = await createEvent({
    organization_id: org.id,
    game_id: mmGame.id,
    game_theme_id: cbTheme.id,
    name: 'Cross Game Test Event ' + Date.now(),
    status: 'live',
    payment_status: 'PAID',
    event_status: 'LIVE',
    starts_at: new Date(Date.now() - 3600000).toISOString(),
    expires_at: new Date(Date.now() + 86400000).toISOString(),
  });

  let crossGameFallbackPrevented = false;
  try {
    await resolveAuthoritativeMemoryMatchConfig(crossGameEvent);
  } catch (err: any) {
    crossGameFallbackPrevented = true;
    assert.strictEqual(err.code, 'THEME_GAME_MISMATCH', '13c: Expected THEME_GAME_MISMATCH error code');
  }
  assert.strictEqual(
    crossGameFallbackPrevented,
    true,
    '13c: Server must reject cross-game configuration fallback to catch-brand'
  );
  console.log('  ✓ PASSED: Server authoritatively enforced totalPairs and prevented cross-game fallback');

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
