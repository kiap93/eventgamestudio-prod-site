import {
  calculateMemoryMatchScore,
  validateMemoryMatchResult,
} from '../games/memoryMatchScoring.js';
import { submitEventScore, getEventHighScores, clearEventHighScores } from './highScores.js';
import { createOrganization } from './organizations.js';
import { createGame } from './games.js';
import { createTheme } from './themes.js';
import { createEvent, resolveEventGameType } from './events.js';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ Assertion Failed: ${message}`);
    process.exit(1);
  }
}

async function runTests() {
  console.log('🧪 Starting Memory Match Game Type Validation Tests...\n');

  const org = await createOrganization({
    name: 'Validation Test Org ' + Date.now(),
    owner_id: '4c857d15-ab93-45a6-8de5-7858ab4d6bd2',
  });

  // 1. Create Memory Match Game, Theme, and Event
  const mmGame = await createGame({
    organization_id: org.id,
    name: 'Memory Match Master',
    slug: 'mm-master-' + Date.now(),
    game_type: 'memory-match',
  });
  const mmTheme = await createTheme({
    organization_id: org.id,
    game_id: mmGame.id,
    name: 'Memory Match Festival',
  });
  const mmEvent = await createEvent({
    organization_id: org.id,
    game_id: mmGame.id,
    game_theme_id: mmTheme.id,
    name: 'Live Memory Match Event ' + Date.now(),
    starts_at: new Date(Date.now() - 3600000).toISOString(),
    expires_at: new Date(Date.now() + 86400000).toISOString(),
    status: 'active',
    payment_status: 'PAID',
    event_status: 'LIVE',
  });

  // 2. Create Catch The Brand Game, Theme, and Event
  const ctbGame = await createGame({
    organization_id: org.id,
    name: 'Catch The Brand Arcade',
    slug: 'ctb-arcade-' + Date.now(),
    game_type: 'catch-brand',
  });
  const ctbTheme = await createTheme({
    organization_id: org.id,
    game_id: ctbGame.id,
    name: 'Carnival Catcher',
  });
  const ctbEvent = await createEvent({
    organization_id: org.id,
    game_id: ctbGame.id,
    game_theme_id: ctbTheme.id,
    name: 'Live Catch The Brand Event ' + Date.now(),
    starts_at: new Date(Date.now() - 3600000).toISOString(),
    expires_at: new Date(Date.now() + 86400000).toISOString(),
    status: 'active',
    payment_status: 'PAID',
    event_status: 'LIVE',
  });

  // ----------------------------------------------------
  // Test 1: Authoritative Game Type Resolution
  // ----------------------------------------------------
  console.log('Test 1: Verifying resolveEventGameType accurately identifies configured game...');
  const resolvedMMType = await resolveEventGameType(mmEvent);
  const resolvedCTBType = await resolveEventGameType(ctbEvent);

  assert(resolvedMMType === 'memory-match', `Expected mmEvent to resolve to 'memory-match', got '${resolvedMMType}'`);
  assert(resolvedCTBType === 'catch-brand', `Expected ctbEvent to resolve to 'catch-brand', got '${resolvedCTBType}'`);
  console.log('✅ Game type resolution passed');

  // ----------------------------------------------------
  // Test 2: Memory Match Event - Rejecting Bypasses Without metadata.gameType
  // ----------------------------------------------------
  console.log('Test 2: Verifying Memory Match event blocks submissions omitting metadata.gameType if stats are missing or invalid...');

  // Submitting raw score with NO metadata at all (attempting to bypass MM validation)
  let rawBypassRejected = false;
  try {
    await submitEventScore({
      event_id: mmEvent.id,
      player_name: 'CheaterNoMeta',
      score: 5000,
      metadata: {}, // Omitted gameType and omitted moves/duration/pairs
    });
  } catch (err: any) {
    rawBypassRejected = true;
    assert(err.status === 422, `Expected 422 status, got ${err.status}`);
    assert(err.code === 'INVALID_MEMORY_MATCH_SCORE', `Expected INVALID_MEMORY_MATCH_SCORE code, got ${err.code}`);
  }
  assert(rawBypassRejected, 'Expected submission with empty metadata on Memory Match event to be rejected');
  console.log('✅ Empty metadata bypass rejection passed');

  // Submitting impossible moves without metadata.gameType
  let impossibleMovesRejected = false;
  try {
    await submitEventScore({
      event_id: mmEvent.id,
      player_name: 'ImpossibleMoves',
      score: 500,
      metadata: {
        // gameType omitted!
        moves: 3,
        matchedPairs: 8,
        totalPairs: 8,
        duration: 20,
      },
    });
  } catch (err: any) {
    impossibleMovesRejected = true;
    assert(err.status === 422, `Expected 422 status, got ${err.status}`);
  }
  assert(impossibleMovesRejected, 'Expected impossible moves count to be rejected even without metadata.gameType');
  console.log('✅ Impossible moves rejection without gameType passed');

  // Submitting forged score (mismatch with expected score) without metadata.gameType
  let forgedScoreRejected = false;
  try {
    await submitEventScore({
      event_id: mmEvent.id,
      player_name: 'ForgedScore',
      score: 99999, // Forged score
      metadata: {
        // gameType omitted!
        moves: 12,
        matchedPairs: 8,
        totalPairs: 8,
        duration: 20,
      },
    });
  } catch (err: any) {
    forgedScoreRejected = true;
    assert(err.status === 422, `Expected 422 status, got ${err.status}`);
  }
  assert(forgedScoreRejected, 'Expected forged score on Memory Match event to be rejected even without metadata.gameType');
  console.log('✅ Forged score rejection without gameType passed');

  // ----------------------------------------------------
  // Test 3: Memory Match Event - Automatic Validation of Valid Submission Without metadata.gameType
  // ----------------------------------------------------
  console.log('Test 3: Verifying valid Memory Match submission without metadata.gameType is automatically validated...');
  const expectedValidScore = calculateMemoryMatchScore({
    moves: 14,
    duration: 22,
    matchedPairs: 8,
    totalPairs: 8,
  });

  const validSubmission = await submitEventScore({
    event_id: mmEvent.id,
    player_name: 'LegitPlayerNoGameType',
    score: expectedValidScore,
    metadata: {
      // metadata.gameType is omitted on purpose!
      moves: 14,
      duration: 22,
      matchedPairs: 8,
      totalPairs: 8,
      sessionId: 'session_legit_1',
    },
  });

  assert(validSubmission.score.score === expectedValidScore, `Expected score ${expectedValidScore}, got ${validSubmission.score.score}`);
  assert(validSubmission.score.metadata?.gameType === 'memory-match', 'Expected metadata.gameType to be set to memory-match');
  assert(validSubmission.score.metadata?.moves === 14, 'Expected moves to be recorded');
  assert(validSubmission.score.metadata?.matchedPairs === 8, 'Expected matchedPairs to be recorded');
  assert(validSubmission.score.metadata?.isVictory === true, 'Expected isVictory to be true');
  console.log('✅ Automatic validation of valid Memory Match submission passed');

  // ----------------------------------------------------
  // Test 4: Memory Match Event - Rejecting Cross-Game Spoof (metadata.gameType = 'catch-brand')
  // ----------------------------------------------------
  console.log('Test 4: Verifying Memory Match event rejects metadata.gameType = catch-brand...');
  let spoofCTBRejected = false;
  try {
    await submitEventScore({
      event_id: mmEvent.id,
      player_name: 'CrossGameSpoofer',
      score: 500,
      metadata: {
        gameType: 'catch-brand',
        greenCaught: 10,
      },
    });
  } catch (err: any) {
    spoofCTBRejected = true;
    assert(err.status === 422, `Expected 422 status, got ${err.status}`);
    assert(err.code === 'GAME_TYPE_MISMATCH', `Expected GAME_TYPE_MISMATCH, got ${err.code}`);
  }
  assert(spoofCTBRejected, 'Expected catch-brand gameType submitted to Memory Match event to be rejected');
  console.log('✅ Cross-game spoof rejection on Memory Match event passed');

  // ----------------------------------------------------
  // Test 5: Catch The Brand Event - Preserving Catch The Brand Validation & Behavior
  // ----------------------------------------------------
  console.log('Test 5: Verifying Catch The Brand event preserves existing Catch The Brand validation and behavior...');
  const ctbSubmission = await submitEventScore({
    event_id: ctbEvent.id,
    player_name: 'ArcadeMaster',
    score: 850,
    metadata: {
      greenCaught: 5,
      orangeCaught: 2,
      duriansMissed: 1,
    },
  });

  assert(ctbSubmission.score.score === 850, `Expected score 850, got ${ctbSubmission.score.score}`);
  assert(ctbSubmission.score.metadata?.gameType === 'catch-brand', 'Expected metadata.gameType to be catch-brand');
  assert(ctbSubmission.score.metadata?.greenCaught === 5, 'Expected greenCaught to be preserved');
  console.log('✅ Catch The Brand valid submission passed');

  // Catch The Brand rejecting Memory Match gameType
  let spoofMMRejected = false;
  try {
    await submitEventScore({
      event_id: ctbEvent.id,
      player_name: 'CrossGameSpoofer2',
      score: 500,
      metadata: {
        gameType: 'memory-match',
        moves: 10,
        duration: 20,
        matchedPairs: 8,
      },
    });
  } catch (err: any) {
    spoofMMRejected = true;
    assert(err.status === 422, `Expected 422 status, got ${err.status}`);
    assert(err.code === 'GAME_TYPE_MISMATCH', `Expected GAME_TYPE_MISMATCH, got ${err.code}`);
  }
  assert(spoofMMRejected, 'Expected memory-match gameType submitted to Catch The Brand event to be rejected');
  console.log('✅ Cross-game spoof rejection on Catch The Brand event passed');

  // Cleanup
  await clearEventHighScores(mmEvent.id);
  await clearEventHighScores(ctbEvent.id);

  console.log('\n🎉 ALL Memory Match Game Type Validation tests passed successfully!');
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
