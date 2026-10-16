import { test, expect } from 'bun:test';
import { createOrganization } from './organizations.js';
import { createGame, CATALOG_GAMES } from './games.js';
import { createTheme, getDefaultThemeForGameType, DEFAULT_MATCH3_THEME } from './themes.js';
import { createEvent, resolveEventGameType } from './events.js';
import { submitEventScore, getEventHighScores } from './highScores.js';
import { DEFAULT_MATCH3_CONFIG } from '../../src/games/match-3/types.js';
import { DEFAULT_GAME_PRICING_TEMPLATES, buildDefaultPricingTiers, localGamePricingCache } from './gamePricing.js';
import { isMatch3Theme } from '../../src/themes/types.js';

test('Match-3 catalog and pricing registration', async () => {
  // 1. Check CATALOG_GAMES
  const match3Catalog = CATALOG_GAMES.find((g) => g.game_type === 'match-3');
  expect(match3Catalog).toBeDefined();
  expect(match3Catalog?.slug).toBe('match-3');
  expect(match3Catalog?.name).toBe('Match-3');
  expect(match3Catalog?.icon_name).toBe('Sparkles');

  // 2. Check Pricing Templates
  const match3Pricing = DEFAULT_GAME_PRICING_TEMPLATES['match-3'];
  expect(match3Pricing).toBeDefined();
  expect(match3Pricing.length).toBeGreaterThan(0);
  expect(match3Pricing[0].is_base).toBe(true);
  expect(match3Pricing[0].min_days).toBe(1);

  // 3. Build default pricing tiers for match-3
  const tiers = buildDefaultPricingTiers('game_m3', 'match-3');
  expect(tiers.length).toBeGreaterThan(0);
  expect(tiers[0].price).toBe(1400.00);
});

test('Match-3 organization theme creation and resolution', async () => {
  const org = await createOrganization({
    name: 'Match-3 Test Org ' + Date.now(),
    owner_id: 'owner_m3_' + Date.now(),
  });

  const game = await createGame({
    organization_id: org.id,
    name: 'Match-3 Game',
    slug: 'match-3',
    game_type: 'match-3',
    status: 'active',
  });

  const defaultTheme = getDefaultThemeForGameType('match-3');
  expect(defaultTheme.slug).toBe('match-3');
  expect(isMatch3Theme(defaultTheme as any)).toBe(true);

  const theme = await createTheme({
    organization_id: org.id,
    game_id: game.id,
    name: 'Branded Match-3 Cascade',
    slug: 'match-3-branded-' + Date.now(),
    game_type: 'match-3',
    is_system: false,
    game_config: DEFAULT_MATCH3_CONFIG as any,
  });

  expect(theme.id).toBeDefined();
  expect(isMatch3Theme(theme as any)).toBe(true);
});

test('Match-3 event creation and game type resolution', async () => {
  const org = await createOrganization({
    name: 'M3 Event Org ' + Date.now(),
    owner_id: 'owner_m3_ev_' + Date.now(),
  });

  const game = await createGame({
    organization_id: org.id,
    name: 'Match-3 Game',
    slug: 'match-3',
    game_type: 'match-3',
    status: 'active',
  });
  localGamePricingCache.set(game.id, buildDefaultPricingTiers(game.id, 'match-3'));

  const theme = await createTheme({
    organization_id: org.id,
    game_id: game.id,
    name: 'Tournament Match-3 Theme',
    slug: 'tournament-match-3-' + Date.now(),
    game_type: 'match-3',
    is_system: false,
    game_config: DEFAULT_MATCH3_CONFIG as any,
  });

  const todayStr = new Date().toISOString().split('T')[0];
  const nextWeekStr = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

  const event = await createEvent({
    organization_id: org.id,
    name: 'Corporate Match-3 Tournament',
    game_id: game.id,
    game_theme_id: theme.id,
    start_date: todayStr,
    end_date: nextWeekStr,
    payment_status: 'PAID',
    status: 'LIVE',
  });

  expect(event.id).toBeDefined();

  // Resolve game type for this event
  const resolvedType = await resolveEventGameType(event);
  expect(resolvedType).toBe('match-3');
});

test('Match-3 high score submission, metadata validation, and leaderboard sorting', async () => {
  const org = await createOrganization({
    name: 'M3 Score Org ' + Date.now(),
    owner_id: 'owner_m3_score_' + Date.now(),
  });

  const game = await createGame({
    organization_id: org.id,
    name: 'Match-3 Game',
    slug: 'match-3',
    game_type: 'match-3',
    status: 'active',
  });
  localGamePricingCache.set(game.id, buildDefaultPricingTiers(game.id, 'match-3'));

  const theme = await createTheme({
    organization_id: org.id,
    game_id: game.id,
    name: 'M3 High Score Theme',
    slug: 'm3-high-score-' + Date.now(),
    game_type: 'match-3',
    is_system: false,
    game_config: DEFAULT_MATCH3_CONFIG as any,
  });

  const todayStr = new Date().toISOString().split('T')[0];
  const nextWeekStr = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

  const event = await createEvent({
    organization_id: org.id,
    name: 'Match-3 Leaderboard Championship',
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

  // Submit multiple scores with Match-3 metadata
  const sub1 = await submitEventScore({
    event_id: event.id,
    player_name: 'Alice',
    score: 15400,
    session_id: 'm3_sess_1_' + Date.now(),
    metadata: {
      gameType: 'match-3',
      matches: 28,
      bestCombo: 5,
      specialTilesCreated: 6,
      duration: 60,
    },
  });
  expect(sub1.score).toBeDefined();

  const sub2 = await submitEventScore({
    event_id: event.id,
    player_name: 'Bob',
    score: 22100, // Higher score
    session_id: 'm3_sess_2_' + Date.now(),
    metadata: {
      gameType: 'match-3',
      matches: 42,
      bestCombo: 8,
      specialTilesCreated: 11,
      duration: 60,
    },
  });
  expect(sub2.score).toBeDefined();

  const sub3 = await submitEventScore({
    event_id: event.id,
    player_name: 'Charlie',
    score: 9800, // Lower score
    session_id: 'm3_sess_3_' + Date.now(),
    metadata: {
      gameType: 'match-3',
      matches: 16,
      bestCombo: 3,
      specialTilesCreated: 2,
      duration: 60,
    },
  });
  expect(sub3.score).toBeDefined();

  // Retrieve leaderboard - should be sorted descending by score (Bob -> Alice -> Charlie)
  const res = await getEventHighScores(event.id);
  const leaderboard = res.scores;
  expect(leaderboard.length).toBe(3);
  expect(leaderboard[0].player_name).toBe('Bob');
  expect(leaderboard[0].score).toBe(22100);
  expect(leaderboard[0].metadata?.matches).toBe(42);
  expect(leaderboard[0].metadata?.bestCombo).toBe(8);
  expect(leaderboard[0].metadata?.specialTilesCreated).toBe(11);

  expect(leaderboard[1].player_name).toBe('Alice');
  expect(leaderboard[1].score).toBe(15400);

  expect(leaderboard[2].player_name).toBe('Charlie');
  expect(leaderboard[2].score).toBe(9800);

  // Validate negative score rejection
  let rejected = false;
  try {
    await submitEventScore({
      event_id: event.id,
      player_name: 'Negative Cheater',
      score: -500,
      session_id: 'm3_sess_bad_' + Date.now(),
      metadata: { gameType: 'match-3' },
    });
  } catch (err: any) {
    rejected = true;
    expect(err.code === 'INVALID_MATCH3_SCORE' || err.status === 422).toBe(true);
  }
  expect(rejected).toBe(true);
});
