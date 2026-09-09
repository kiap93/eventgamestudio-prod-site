import {
  getStartScreenConfig,
  normalizeStartScreenConfigForStage,
} from '../src/games/shared/startScreenResolver';
import {
  generateDefaultStartScreenElements,
  StartScreenConfig,
} from '../src/games/shared/startScreenTypes';
import {
  getAvailableStartElements,
  getStartElementsGroupedByCategory,
} from '../src/components/studio/games/start-editor/startElementRegistry';
import { GameTheme } from '../src/themes/types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ Assertion Failed: ${message}`);
    process.exit(1);
  }
}

async function runTests() {
  console.log('🧪 Starting Start Screen Canvas Editor Integration Tests...\n');

  const dummyTheme: Partial<GameTheme> = {
    id: 'theme-123',
    name: 'Neon Cyberpunk',
    description: 'A glowing retro theme',
  };

  function collectAllElementIds(elements: any[]): string[] {
    const ids: string[] = [];
    const traverse = (list: any[]) => {
      for (const el of list) {
        if (el && el.id) ids.push(el.id);
        if (el && Array.isArray(el.children)) {
          traverse(el.children);
        }
      }
    };
    traverse(elements);
    return ids;
  }

  // Test 1: Game Isolation - Memory Match elements
  console.log('Test 1: Verifying Memory Match elements isolation...');
  const startConfigMemory = getStartScreenConfig(dummyTheme, 'memory-match', {
    rows: 4,
    cols: 4,
    totalCards: 16,
    totalPairs: 8,
    duration: 45,
  });

  assert(startConfigMemory.elements.length > 0, 'Memory Match elements should not be empty');

  const allMemoryElementIds = collectAllElementIds(startConfigMemory.elements);

  assert(allMemoryElementIds.includes('main-start-card'), 'Memory Match should contain main-start-card');
  assert(allMemoryElementIds.includes('badge-grid'), 'Memory Match should contain badge-grid');
  assert(allMemoryElementIds.includes('badge-pairs'), 'Memory Match should contain badge-pairs');
  assert(allMemoryElementIds.includes('badge-timer'), 'Memory Match should contain badge-timer');
  assert(allMemoryElementIds.includes('start-button'), 'Memory Match should contain start-button');

  // Must NEVER receive Catch Brand elements
  assert(!allMemoryElementIds.includes('catch-brand-good-item'), 'Memory Match must NOT contain catch-brand-good-item');
  assert(!allMemoryElementIds.includes('catch-brand-bad-item'), 'Memory Match must NOT contain catch-brand-bad-item');
  assert(!allMemoryElementIds.includes('catch-brand-catcher'), 'Memory Match must NOT contain catch-brand-catcher');
  console.log('✅ Memory Match isolation verified');

  // Test 2: Reaction Tap elements
  console.log('Test 2: Verifying Reaction Tap reflexes elements...');
  const startConfigReaction = getStartScreenConfig(dummyTheme, 'reaction-tap', {
    roundsCount: 5,
    lightCount: 5,
  });

  const allReactionIds = collectAllElementIds(startConfigReaction.elements);
  assert(allReactionIds.includes('badge-rounds'), 'Reaction Tap should contain badge-rounds');
  assert(allReactionIds.includes('badge-lights'), 'Reaction Tap should contain badge-lights');
  console.log('✅ Reaction Tap elements verified');

  // Test 3: Catch Brand elements
  console.log('Test 3: Verifying Catch Brand elements...');
  const startConfigCatch = getStartScreenConfig(dummyTheme, 'catch-brand', {
    duration: 30,
  });
  assert(startConfigCatch.elements.length > 0, 'Catch Brand should have start elements');
  console.log('✅ Catch Brand elements verified');

  // Test 4: Registry categorization
  console.log('Test 4: Verifying Start Element Registry categorization...');
  const memoryElements = getAvailableStartElements('memory-match');
  const reactionElements = getAvailableStartElements('reaction-tap');
  assert(memoryElements.length > 0, 'Memory Match should have registry elements');
  assert(reactionElements.length > 0, 'Reaction Tap should have registry elements');

  const memoryGrouped = getStartElementsGroupedByCategory('memory-match');
  assert(memoryGrouped.containers.length > 0, 'Memory Match should have container elements');
  assert(memoryGrouped.controls.length > 0, 'Memory Match should have control elements');
  console.log('✅ Element registry verified');

  // Test 5: Coordinate Normalization
  console.log('Test 5: Verifying 1000x1000 to 1024x576 Stage Normalization...');
  const baseElements = generateDefaultStartScreenElements('memory-match', dummyTheme, {
    rows: 4,
    cols: 4,
    totalCards: 16,
    totalPairs: 8,
    duration: 45,
  });

  const initialConfig: StartScreenConfig = {
    canvas: { width: 1000, height: 1000, coordinateSpace: 'square-1000x1000' },
    background: { type: 'theme', color: '#0f172a', overlayOpacity: 0.3 },
    elements: baseElements,
  };

  const normalized = normalizeStartScreenConfigForStage(initialConfig, 1024, 576);
  assert(normalized.canvas?.width === 1024, 'Normalized width should be 1024');
  assert(normalized.canvas?.height === 576, 'Normalized height should be 576');
  assert(normalized.canvas?.coordinateSpace === 'landscape-1024x576', 'Coordinate space should be landscape-1024x576');

  const card = normalized.elements.find((el) => el.id === 'main-start-card');
  assert(card !== undefined, 'Card should exist in normalized elements');
  assert(card!.x === 132, `Card x should be 132, got ${card!.x}`);
  assert(card!.y === 53, `Card y should be 53, got ${card!.y}`);
  assert(card!.width === 760, `Card width should be 760, got ${card!.width}`);
  assert(card!.height === 470, `Card height should be 470, got ${card!.height}`);

  // Test idempotency
  const normalizedAgain = normalizeStartScreenConfigForStage(normalized, 1024, 576);
  assert(normalizedAgain.canvas?.width === 1024, 'Idempotent width should stay 1024');
  assert(normalizedAgain.canvas?.height === 576, 'Idempotent height should stay 576');
  console.log('✅ Coordinate normalization & idempotency verified');

  // Test 6: Persistence & Re-resolution
  console.log('Test 6: Verifying Persistence & Re-resolution...');
  const testTheme: GameTheme = {
    id: 'theme-memory-test',
    name: 'Retro Memory',
    organization_id: 'org-test',
    game_id: 'memory-match',
    game_config: {
      screens: {
        start: {
          ...initialConfig,
          background: {
            type: 'color',
            color: '#1e1b4b',
            overlayOpacity: 0.6,
          },
        },
      },
    } as any,
  } as any;

  const rehydrated = getStartScreenConfig(testTheme, 'memory-match');
  assert(rehydrated.background?.type === 'color', 'Rehydrated background type should be color');
  assert(rehydrated.background?.color === '#1e1b4b', 'Rehydrated background color should be #1e1b4b');
  assert(rehydrated.background?.overlayOpacity === 0.6, 'Rehydrated overlay opacity should be 0.6');
  assert(rehydrated.elements.length > 0, 'Rehydrated elements should be preserved');
  console.log('✅ Persistence & Re-resolution verified');

  console.log('\n🎉 ALL Start Screen Canvas Editor Architecture Tests Passed Successfully!\n');
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
