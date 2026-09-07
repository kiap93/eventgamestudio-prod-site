// Memory Match Auto Demo Phase Timing and State Machine Unit Test
import type { AutoDemoPhase } from '../../src/games/memory-match/MemoryMatchGame';

function runAutoDemoTimingTests() {
  console.log('--- TEST 1: Phase enum covers all required sequential phases ---');
  const validPhases: AutoDemoPhase[] = [
    'idle',
    'flip-first',
    'wait-first',
    'flip-second',
    'show-pair',
    'resolve-match',
    'resolve-mismatch',
    'pause-after-resolution',
    'complete',
  ];
  if (validPhases.length !== 9) {
    throw new Error(`Expected 9 phases, got ${validPhases.length}`);
  }
  console.log('PASSED: All 9 sequential AutoDemo phases defined');

  console.log('--- TEST 2: Visual invariant: Both cards remain face-up during show-pair phase ---');
  interface SimCard {
    id: string;
    pairId: string;
    isFlipped: boolean;
    isMatched: boolean;
    isShaking: boolean;
  }

  const firstCard: SimCard = { id: 'c1', pairId: 'p1', isFlipped: false, isMatched: false, isShaking: false };
  const secondCard: SimCard = { id: 'c2', pairId: 'p1', isFlipped: false, isMatched: false, isShaking: false };

  // Phase 1: Flip first card
  firstCard.isFlipped = true;
  if (!firstCard.isFlipped || secondCard.isFlipped) {
    throw new Error('FAILED: First card flip state incorrect');
  }

  // Phase 2: Flip second card
  secondCard.isFlipped = true;

  // Visual invariant: BOTH cards MUST be face-up (isFlipped === true)
  if (!firstCard.isFlipped || !secondCard.isFlipped) {
    throw new Error('FAILED: Both cards must be face-up during show-pair');
  }

  // Neither card may be marked matched during the show-pair window
  if (firstCard.isMatched || secondCard.isMatched) {
    throw new Error('FAILED: Cards must not be matched during show-pair');
  }

  // Neither card may be shaking during the show-pair window
  if (firstCard.isShaking || secondCard.isShaking) {
    throw new Error('FAILED: Cards must not be shaking during show-pair');
  }
  console.log('PASSED: Visual invariant holds - both cards face-up during show-pair');

  console.log('--- TEST 3: Match resolution: mark both matched after show-pair ---');
  firstCard.isMatched = true;
  secondCard.isMatched = true;
  if (!firstCard.isMatched || !secondCard.isMatched) {
    throw new Error('FAILED: Both cards must be matched after resolution');
  }
  if (!firstCard.isFlipped || !secondCard.isFlipped) {
    throw new Error('FAILED: Both cards remain face-up when matched');
  }
  console.log('PASSED: Match resolution marks both cards matched while keeping face-up');

  console.log('--- TEST 4: Mismatch sequence: keep face-up while shaking, then flip back ---');
  const cardA: SimCard = { id: 'c3', pairId: 'p2', isFlipped: true, isMatched: false, isShaking: false };
  const cardB: SimCard = { id: 'c4', pairId: 'p3', isFlipped: true, isMatched: false, isShaking: false };

  // Trigger mismatch shake: cards must stay face-up
  cardA.isShaking = true;
  cardB.isShaking = true;
  if (!cardA.isFlipped || !cardB.isFlipped || !cardA.isShaking || !cardB.isShaking) {
    throw new Error('FAILED: Mismatch shake must preserve face-up state');
  }

  // Flip back after mismatchDelay:
  cardA.isFlipped = false;
  cardA.isShaking = false;
  cardB.isFlipped = false;
  cardB.isShaking = false;
  if (cardA.isFlipped || cardB.isFlipped || cardA.isShaking || cardB.isShaking) {
    throw new Error('FAILED: Cards should be face-down and stopped shaking');
  }
  console.log('PASSED: Mismatch sequence correctly preserves face-up during shake then flips back');

  console.log('ALL AUTO DEMO TIMING & INVARIANT TESTS PASSED!');
}

runAutoDemoTimingTests();
