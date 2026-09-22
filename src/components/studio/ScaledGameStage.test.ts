import { calculateGameScale } from './ScaledGameStage';
import {
  REACTION_GAME_DESIGN_WIDTH,
  REACTION_GAME_DESIGN_HEIGHT,
} from '../../games/reaction-time/types';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  ✓ ${msg}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${msg}`);
    failed++;
  }
}

function assertCloseTo(val: number, expected: number, delta = 0.0001, msg: string) {
  if (Math.abs(val - expected) <= delta) {
    console.log(`  ✓ ${msg} (got ${val}, expected ~${expected})`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${msg} (got ${val}, expected ${expected})`);
    failed++;
  }
}

console.log('======================================================');
console.log('Running ScaledGameStage Scale Acceptance Tests');
console.log('======================================================');

// 1. Logical design dimensions
assert(REACTION_GAME_DESIGN_WIDTH === 1024, 'Design width must be exactly 1024');
assert(REACTION_GAME_DESIGN_HEIGHT === 576, 'Design height must be exactly 576');

// 2. Exact 1024x576 native resolution
assertCloseTo(calculateGameScale(1024, 576), 1.0, 0.0001, 'Native 1024x576 scale should be 1.0');

// 3. Proportional 16:9 previews
assertCloseTo(calculateGameScale(800, 450), 800 / 1024, 0.0001, '800x450 scale should be 0.78125');
assertCloseTo(calculateGameScale(640, 360), 640 / 1024, 0.0001, '640x360 scale should be 0.625');
assertCloseTo(calculateGameScale(480, 270), 480 / 1024, 0.0001, '480x270 scale should be 0.46875');
assertCloseTo(calculateGameScale(1280, 720), 1280 / 1024, 0.0001, '1280x720 scale should be 1.25');
assertCloseTo(calculateGameScale(1920, 1080), 1920 / 1024, 0.0001, '1920x1080 scale should be 1.875');

// 4. Non-16:9 aspect ratios
const heightConstrained = calculateGameScale(1000, 500);
assertCloseTo(heightConstrained, 500 / 576, 0.0001, '1000x500 should be constrained by height (500/576)');

const widthConstrained = calculateGameScale(800, 600);
assertCloseTo(widthConstrained, 800 / 1024, 0.0001, '800x600 should be constrained by width (800/1024)');

const letterbox = calculateGameScale(1200, 300);
assertCloseTo(letterbox, 300 / 576, 0.0001, '1200x300 extreme letterbox should be constrained by height');

const pillarbox = calculateGameScale(400, 800);
assertCloseTo(pillarbox, 400 / 1024, 0.0001, '400x800 extreme pillarbox should be constrained by width');

// 5. Edge cases
assert(calculateGameScale(0, 0) === 1, 'Zero dimensions fall back to 1.0');
assert(calculateGameScale(-100, 500) === 1, 'Negative width falls back to 1.0');
assert(calculateGameScale(500, -100) === 1, 'Negative height falls back to 1.0');

console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
