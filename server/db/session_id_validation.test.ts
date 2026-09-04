import assert from 'node:assert';
import {
  submitEventScore,
  validateSessionId,
  checkSessionIdValidity,
  isValidSessionId,
  SAFE_SESSION_ID_REGEX,
} from './highScores.js';
import { calculateMemoryMatchScore } from '../games/memoryMatchScoring.js';
import { createOrganization } from './organizations.js';
import { createGame } from './games.js';
import { createTheme } from './themes.js';
import { createEvent } from './events.js';

async function runSessionIdValidationTests() {
  console.log('====================================================');
  console.log('TEST SUITE: BLOCKER 5 — Strict session_id Validation');
  console.log('====================================================\n');

  // --------------------------------------------------------------------------
  // Setup test organization and games
  // --------------------------------------------------------------------------
  const org = await createOrganization({
    name: 'Session Validation Org ' + Date.now(),
    owner_id: '4c857d15-ab93-45a6-8de5-7858ab4d6bd2',
  });

  const catchGame = await createGame({
    organization_id: org.id,
    name: 'Catch The Brand Validation',
    slug: 'catch-validation-' + Date.now(),
    game_type: 'catch-brand',
  });

  const memoryGame = await createGame({
    organization_id: org.id,
    name: 'Memory Match Validation',
    slug: 'memory-validation-' + Date.now(),
    game_type: 'memory-match',
  });

  const catchTheme = await createTheme({
    organization_id: org.id,
    game_id: catchGame.id,
    name: 'Catch Theme',
  });

  const memoryTheme = await createTheme({
    organization_id: org.id,
    game_id: memoryGame.id,
    name: 'Memory Theme',
    game_type: 'memory-match',
    game_config: {
      totalPairs: 8,
      gridCols: 4,
      gridRows: 4,
    },
  });

  const catchEvent = await createEvent({
    organization_id: org.id,
    game_id: catchGame.id,
    game_theme_id: catchTheme.id,
    name: 'Catch Event ' + Date.now(),
    status: 'live',
    payment_status: 'PAID',
    event_status: 'LIVE',
    starts_at: new Date(Date.now() - 3600000).toISOString(),
    expires_at: new Date(Date.now() + 86400000).toISOString(),
  });

  const memoryEvent = await createEvent({
    organization_id: org.id,
    game_id: memoryGame.id,
    game_theme_id: memoryTheme.id,
    name: 'Memory Event ' + Date.now(),
    status: 'live',
    payment_status: 'PAID',
    event_status: 'LIVE',
    starts_at: new Date(Date.now() - 3600000).toISOString(),
    expires_at: new Date(Date.now() + 86400000).toISOString(),
  });

  // --------------------------------------------------------------------------
  // Test 1: Valid Session IDs
  // --------------------------------------------------------------------------
  console.log('Test 1: Valid session ID formats...');
  const validFormats = [
    'cb_1725400000000_abc123',
    'mm_1725400000000_xyz789',
    '550e8400-e29b-41d4-a716-446655440000',
    'session_test_valid_123',
    'cs_egs_0123456789abcdef',
    'a',
    'SESSION-123_456',
  ];

  for (const validId of validFormats) {
    assert.strictEqual(isValidSessionId(validId), true, `Format "${validId}" must be valid`);
    const validated = validateSessionId(validId);
    assert.strictEqual(validated, validId, `Validated ID must equal original ID`);
    assert.strictEqual(SAFE_SESSION_ID_REGEX.test(validated), true, `ID "${validId}" must match regex`);
  }

  // Submit score with valid format
  const validSub = await submitEventScore({
    event_id: catchEvent.id,
    player_name: 'ValidPlayer',
    score: 500,
    session_id: 'cb_1725400000000_valid1',
    metadata: {
      greenCaught: 5,
    },
  });
  assert.strictEqual(validSub.score.session_id, 'cb_1725400000000_valid1');
  assert.strictEqual(validSub.score.metadata?.sessionId, 'cb_1725400000000_valid1');
  console.log('  Passed Test 1: Valid session IDs are accepted and preserved.');

  // --------------------------------------------------------------------------
  // Test 2: Empty Session ID
  // --------------------------------------------------------------------------
  console.log('\nTest 2: Empty session ID rejection...');
  const emptyCases = ['', '   ', null, undefined];
  for (const emptyVal of emptyCases) {
    const check = checkSessionIdValidity(emptyVal);
    assert.strictEqual(check.isValid, false, `Value ${JSON.stringify(emptyVal)} must be invalid`);
    assert.strictEqual(check.code, 'INVALID_SESSION_ID');
    assert.strictEqual(check.status, 422);

    assert.throws(
      () => validateSessionId(emptyVal, { required: true }),
      (err: any) => err.status === 422 && err.message.includes('empty'),
      `validateSessionId must throw 422 for empty value ${JSON.stringify(emptyVal)}`
    );
  }

  // Reject empty session_id in submitEventScore
  await assert.rejects(
    async () => {
      await submitEventScore({
        event_id: catchEvent.id,
        player_name: 'EmptySessionPlayer',
        score: 100,
        session_id: '',
      });
    },
    (err: any) => {
      assert.strictEqual(err.status, 422);
      assert.strictEqual(err.code, 'INVALID_SESSION_ID');
      assert.match(err.message, /empty/i);
      return true;
    },
    'Empty session_id string must be rejected with 422'
  );

  // Reject whitespace session_id in submitEventScore
  await assert.rejects(
    async () => {
      await submitEventScore({
        event_id: catchEvent.id,
        player_name: 'WhitespaceSessionPlayer',
        score: 100,
        session_id: '    ',
      });
    },
    (err: any) => {
      assert.strictEqual(err.status, 422);
      assert.strictEqual(err.code, 'INVALID_SESSION_ID');
      assert.match(err.message, /empty/i);
      return true;
    },
    'Whitespace session_id must be rejected with 422'
  );

  // Reject empty sessionId inside metadata
  await assert.rejects(
    async () => {
      await submitEventScore({
        event_id: catchEvent.id,
        player_name: 'EmptyMetaSessionPlayer',
        score: 100,
        metadata: {
          sessionId: '',
        },
      });
    },
    (err: any) => {
      assert.strictEqual(err.status, 422);
      assert.strictEqual(err.code, 'INVALID_SESSION_ID');
      assert.match(err.message, /empty/i);
      return true;
    },
    'Empty metadata.sessionId must be rejected with 422'
  );
  console.log('  Passed Test 2: Empty session IDs are rejected with 422.');

  // --------------------------------------------------------------------------
  // Test 3: Extremely Long Session ID
  // --------------------------------------------------------------------------
  console.log('\nTest 3: Extremely long session ID rejection...');
  const longSessionId101 = 'a'.repeat(101);
  const longSessionId500 = 'session_' + 'x'.repeat(500);

  const checkLong101 = checkSessionIdValidity(longSessionId101);
  assert.strictEqual(checkLong101.isValid, false);
  assert.strictEqual(checkLong101.status, 422);
  assert.match(checkLong101.error || '', /excessively long/i);

  await assert.rejects(
    async () => {
      await submitEventScore({
        event_id: catchEvent.id,
        player_name: 'LongSessionPlayer',
        score: 100,
        session_id: longSessionId500,
      });
    },
    (err: any) => {
      assert.strictEqual(err.status, 422);
      assert.strictEqual(err.code, 'INVALID_SESSION_ID');
      assert.match(err.message, /excessively long/i);
      return true;
    },
    'Overlong session_id must be rejected with 422'
  );
  console.log('  Passed Test 3: Extremely long session IDs are rejected with 422.');

  // --------------------------------------------------------------------------
  // Test 4: Special Characters
  // --------------------------------------------------------------------------
  console.log('\nTest 4: Special characters rejection...');
  const specialCharCases = [
    'session!test',
    'session@home',
    'session#123',
    'session$id',
    'session%token',
    'session^power',
    'session&more',
    'session*star',
    'session+plus',
    'session=equal',
    'session?query',
    'session<tag>',
    'session{curly}',
    'session[bracket]',
    'session|pipe',
    'session~tilde',
  ];

  for (const badVal of specialCharCases) {
    const check = checkSessionIdValidity(badVal);
    assert.strictEqual(check.isValid, false, `Special characters in "${badVal}" must be rejected`);
    assert.strictEqual(check.status, 422);

    await assert.rejects(
      async () => {
        await submitEventScore({
          event_id: catchEvent.id,
          player_name: 'SpecialCharPlayer',
          score: 100,
          session_id: badVal,
        });
      },
      (err: any) => {
        assert.strictEqual(err.status, 422);
        assert.strictEqual(err.code, 'INVALID_SESSION_ID');
        return true;
      },
      `Special character session_id "${badVal}" must be rejected with 422`
    );
  }
  console.log('  Passed Test 4: Special characters are rejected with 422.');

  // --------------------------------------------------------------------------
  // Test 5: Quote Characters
  // --------------------------------------------------------------------------
  console.log('\nTest 5: Quote characters rejection...');
  const quoteCases = [
    "session' OR '1'='1",
    "cb_123'--",
    'session"injection"',
    'session`backtick`',
    "admin'--",
  ];

  for (const quoteVal of quoteCases) {
    const check = checkSessionIdValidity(quoteVal);
    assert.strictEqual(check.isValid, false, `Quote in "${quoteVal}" must be rejected`);
    assert.strictEqual(check.status, 422);
    assert.match(check.error || '', /quote/i);

    await assert.rejects(
      async () => {
        await submitEventScore({
          event_id: catchEvent.id,
          player_name: 'QuotePlayer',
          score: 100,
          session_id: quoteVal,
        });
      },
      (err: any) => {
        assert.strictEqual(err.status, 422);
        assert.strictEqual(err.code, 'INVALID_SESSION_ID');
        assert.match(err.message, /quote/i);
        return true;
      },
      `Quote session_id "${quoteVal}" must be rejected with 422`
    );
  }
  console.log('  Passed Test 5: Quote characters are rejected with 422.');

  // --------------------------------------------------------------------------
  // Test 6: Filter-Expression Characters
  // --------------------------------------------------------------------------
  console.log('\nTest 6: Filter-expression characters rejection...');
  const filterAttackCases = [
    'normal_session,session_id.neq.null',
    'session.eq.admin',
    'session;select*from users',
    'session(select id)',
    'session:custom',
    'session/path',
    'session\\backslash',
    'session with spaces',
    'session%20encoded',
    'session.gt.0',
    'session.in.(1,2)',
  ];

  for (const filterVal of filterAttackCases) {
    const check = checkSessionIdValidity(filterVal);
    assert.strictEqual(check.isValid, false, `Filter character in "${filterVal}" must be rejected`);
    assert.strictEqual(check.status, 422);
    assert.match(check.error || '', /filter-expression|alphanumeric/i);

    await assert.rejects(
      async () => {
        await submitEventScore({
          event_id: catchEvent.id,
          player_name: 'FilterPlayer',
          score: 100,
          session_id: filterVal,
        });
      },
      (err: any) => {
        assert.strictEqual(err.status, 422);
        assert.strictEqual(err.code, 'INVALID_SESSION_ID');
        return true;
      },
      `Filter expression session_id "${filterVal}" must be rejected with 422`
    );
  }
  console.log('  Passed Test 6: Filter-expression characters are rejected with 422.');

  // --------------------------------------------------------------------------
  // Test 7: Duplicate Session ID Handling
  // --------------------------------------------------------------------------
  console.log('\nTest 7: Duplicate session ID idempotency...');
  const dupSessionId = 'cb_1725400000000_dup_test_01';

  // First submission
  const firstSub = await submitEventScore({
    event_id: catchEvent.id,
    player_name: 'DupPlayer',
    score: 750,
    session_id: dupSessionId,
    metadata: {
      sessionId: dupSessionId,
      greenCaught: 7,
    },
  });
  assert.strictEqual(firstSub.score.score, 750);
  assert.strictEqual(firstSub.score.session_id, dupSessionId);
  const firstRecordId = firstSub.score.id;

  // Second submission with exact same event and session ID
  const secondSub = await submitEventScore({
    event_id: catchEvent.id,
    player_name: 'DupPlayer',
    score: 750,
    session_id: dupSessionId,
    metadata: {
      sessionId: dupSessionId,
      greenCaught: 7,
    },
  });

  assert.strictEqual(secondSub.score.id, firstRecordId, 'Duplicate session submission must return original record id');
  assert.strictEqual(secondSub.score.score, 750, 'Duplicate session submission score must match');
  assert.strictEqual(secondSub.totalEntries, firstSub.totalEntries, 'Duplicate submission must not increment totalEntries');
  console.log('  Passed Test 7: Duplicate session ID is handled idempotently without duplicate records.');

  // --------------------------------------------------------------------------
  // Test 8: Normal Memory Match Submission
  // --------------------------------------------------------------------------
  console.log('\nTest 8: Normal Memory Match submission...');
  const mmSessionId = `mm_${Date.now()}_player_mem1`;
  const memoryStats = {
    matchedPairs: 8,
    totalPairs: 8,
    moves: 16,
    duration: 25,
  };
  const authoritativeScore = calculateMemoryMatchScore(memoryStats);

  const memorySub = await submitEventScore({
    event_id: memoryEvent.id,
    player_name: 'MemoryMaster',
    score: authoritativeScore,
    session_id: mmSessionId,
    metadata: {
      sessionId: mmSessionId,
      matchedPairs: 8,
      moves: 16,
      duration: 25,
      boardLayout: '4x4',
    },
  });

  assert.ok(memorySub.score, 'Memory Match score record must be returned');
  assert.strictEqual(memorySub.score.score, authoritativeScore, 'Score must match authoritative score');
  assert.strictEqual(memorySub.score.session_id, mmSessionId, 'Session ID must be preserved in score record');
  assert.strictEqual(memorySub.score.metadata?.sessionId, mmSessionId, 'Session ID must be preserved in metadata');
  assert.ok(memorySub.rank >= 1, 'Rank must be a positive integer');
  console.log(`  Passed Test 8: Normal Memory Match score submitted successfully with rank #${memorySub.rank} (score: ${authoritativeScore}).`);

  // --------------------------------------------------------------------------
  // Test 9: Normal Catch The Brand Submission
  // --------------------------------------------------------------------------
  console.log('\nTest 9: Normal Catch The Brand submission...');
  const cbSessionId = `cb_${Date.now()}_player_cb1`;

  const catchSub = await submitEventScore({
    event_id: catchEvent.id,
    player_name: 'CatchMaster',
    score: 1200,
    session_id: cbSessionId,
    metadata: {
      sessionId: cbSessionId,
      greenCaught: 12,
      orangeCaught: 0,
      duration: 30,
    },
  });

  assert.ok(catchSub.score, 'Catch The Brand score record must be returned');
  assert.strictEqual(catchSub.score.session_id, cbSessionId, 'Session ID must be preserved in score record');
  assert.strictEqual(catchSub.score.metadata?.sessionId, cbSessionId, 'Session ID must be preserved in metadata');
  assert.ok(catchSub.rank >= 1, 'Rank must be a positive integer');
  console.log(`  Passed Test 9: Normal Catch The Brand score submitted successfully with rank #${catchSub.rank}.`);

  console.log('\n====================================================');
  console.log('ALL BLOCKER 5 TESTS PASSED SUCCESSFULLY! (9/9)');
  console.log('====================================================');
}

runSessionIdValidationTests().catch((err) => {
  console.error('Session ID Validation Tests failed:', err);
  process.exit(1);
});
