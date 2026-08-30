import { normalizeGameTheme } from '../../src/themes/registry';
import { getMemoryMatchConfig } from '../../src/themes/types';
import { createShuffledDeck } from '../../src/games/memory-match/cardDeck';

function runTests() {
  console.log('--- TEST 1: normalizeGameTheme preserves custom game_config with cardBackUrl and pair imageUrls ---');

  const customThemeInput = {
    id: 'custom-memory-theme-1',
    name: 'Custom Brand Memory Theme',
    game_slug: 'memory-match',
    game_type: 'memory-match',
    game_config: {
      cardBackUrl: 'https://example.com/custom_card_back.png',
      pairs: [
        {
          id: 'custom_pair_1',
          name: 'Golden Watch',
          imageUrl: 'https://example.com/golden_watch.png',
          points: 150,
        },
        {
          id: 'custom_pair_2',
          name: 'Diamond Ring',
          imageUrl: 'https://example.com/diamond_ring.png',
          points: 200,
        },
      ],
      grid: {
        rows: 2,
        cols: 2,
      },
      gameplay: {
        gameDurationSeconds: 60,
        mismatchDelayMs: 900,
        matchPoints: 150,
        comboPoints: 40,
      },
    },
  };

  const normalized = normalizeGameTheme(customThemeInput);

  if (!normalized.game_config) {
    throw new Error('FAILED: normalized.game_config is undefined or null');
  }

  if (normalized.game_config.cardBackUrl !== 'https://example.com/custom_card_back.png') {
    throw new Error(`FAILED: expected cardBackUrl https://example.com/custom_card_back.png, got ${normalized.game_config.cardBackUrl}`);
  }

  if (normalized.visuals_config.cardBackUrl !== 'https://example.com/custom_card_back.png') {
    throw new Error(`FAILED: expected visuals_config.cardBackUrl https://example.com/custom_card_back.png, got ${normalized.visuals_config.cardBackUrl}`);
  }

  const memoryConfig = getMemoryMatchConfig(normalized);

  if (memoryConfig.cardBackUrl !== 'https://example.com/custom_card_back.png') {
    throw new Error(`FAILED: getMemoryMatchConfig returned cardBackUrl: ${memoryConfig.cardBackUrl}`);
  }

  const pair1 = memoryConfig.pairs.find((p) => p.id === 'custom_pair_1');
  if (!pair1 || pair1.imageUrl !== 'https://example.com/golden_watch.png') {
    throw new Error(`FAILED: pair1 not found or imageUrl mismatch: ${JSON.stringify(pair1)}`);
  }

  console.log('PASSED: normalizeGameTheme & getMemoryMatchConfig preserved custom cardBackUrl and pair imageUrls');

  console.log('--- TEST 2: createShuffledDeck builds deck with custom card images ---');
  const deck = createShuffledDeck(normalized);
  if (deck.length !== 4) {
    throw new Error(`FAILED: Expected deck of 4 cards for 2x2 board, got ${deck.length}`);
  }

  const cardA = deck.find((c) => c.pairId === 'custom_pair_1');
  if (!cardA || cardA.imageUrl !== 'https://example.com/golden_watch.png') {
    throw new Error(`FAILED: Deck card imageUrl mismatch: ${JSON.stringify(cardA)}`);
  }

  console.log('PASSED: createShuffledDeck properly generates cards with pair imageUrl');

  console.log('--- TEST 3: stringified JSON game_config from database is parsed and preserved ---');
  const rawDbTheme = {
    id: 'db-theme-1',
    name: 'DB Memory Theme',
    game_slug: 'memory-match',
    game_config: JSON.stringify({
      cardBackUrl: 'https://example.com/db_back.png',
      pairs: [
        { id: 'p1', name: 'Coffee Cup', imageUrl: 'https://example.com/coffee.png', points: 100 },
      ],
    }),
  };

  const normalizedDbTheme = normalizeGameTheme(rawDbTheme);
  if (normalizedDbTheme.game_config?.cardBackUrl !== 'https://example.com/db_back.png') {
    throw new Error('FAILED: Stringified JSON game_config was not parsed correctly');
  }

  console.log('PASSED: Stringified JSON game_config handled correctly');

  console.log('ALL TESTS PASSED SUCCESSFULLY!');
}

runTests();
