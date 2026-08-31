import { calculateSnap, calculateResizeSnap } from './snapping';
import { ResultScreenElement } from '../../../../games/memory-match/types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASS: ${message}`);
  }
}

console.log('--- Testing Advanced Snapping & Alignment Guides (Phase 9.1) ---');

// 1. Root element snapping to Canvas Center & Canvas Edges (1000 x 1000)
{
  const movingRoot = { x: 498, y: 105, width: 200, height: 100 }; // Center is at 498 + 100 = 598. If x is 402, center is 502 -> snap to 500
  const proposedCenter = { x: 402, y: 2, width: 200, height: 100 };
  
  const snapResult = calculateSnap(
    proposedCenter,
    1000,
    1000,
    [],
    [],
    8,
    true // isRoot
  );

  assert(snapResult.x === 400, `Root element snaps to Canvas Center X (expected 400, got ${snapResult.x})`);
  assert(snapResult.y === 0, `Root element snaps to Canvas Top Edge (expected 0, got ${snapResult.y})`);
  assert(snapResult.guides.length >= 2, `Expected 2 canvas guides (got ${snapResult.guides.length})`);
  assert(snapResult.guides.some(g => g.label?.includes('Canvas Center')), 'Canvas Center guide is generated');
  assert(snapResult.guides.some(g => g.label?.includes('Canvas')), 'Canvas Edge guide is generated');
}

// 2. Sibling Snapping (Edge and Center alignment)
{
  const siblingA: ResultScreenElement = {
    id: 'sibling-1',
    type: 'card',
    x: 100,
    y: 100,
    width: 300,
    height: 200,
  };

  // Dragging element B near sibling A's right edge (400)
  const proposedNearRightEdge = { x: 403, y: 102, width: 150, height: 100 };
  const snapResult = calculateSnap(
    proposedNearRightEdge,
    1000,
    1000,
    [siblingA],
    ['moving-b'],
    8,
    true
  );

  assert(snapResult.x === 400, `Snaps to sibling right edge (expected 400, got ${snapResult.x})`);
  assert(snapResult.y === 100, `Snaps to sibling top edge (expected 100, got ${snapResult.y})`);
  assert(snapResult.guides.some(g => g.targetType === 'sibling-edge'), 'Generates sibling alignment guide');
}

// 3. Card Children Snapping (Parent 600 x 500)
{
  const child1: ResultScreenElement = {
    id: 'child-1',
    type: 'text',
    text: 'Player Score',
    x: 50,
    y: 50,
    width: 200,
    height: 40,
  };

  const child2Moving = { x: 53, y: 102, width: 200, height: 40 };

  const snapResult = calculateSnap(
    child2Moving,
    600, // Parent width
    500, // Parent height
    [child1],
    ['child-2'],
    8,
    false // not root, nested inside Card
  );

  assert(snapResult.x === 50, `Child snaps to sibling child's left edge (expected 50, got ${snapResult.x})`);
  assert(!snapResult.guides.some(g => g.label?.includes('Canvas')), 'Nested children do NOT generate root canvas guides');
  assert(snapResult.guides.length > 0, 'Generates nested sibling guide');
}

// 4. Resize Snapping
{
  const sibling1: ResultScreenElement = {
    id: 'sib-1',
    type: 'button',
    text: 'Play Again',
    action: 'restart',
    x: 100,
    y: 100,
    width: 400,
    height: 60,
  };

  // Resizing right handle of a box starting at x=100, proposed width 397 (near 400)
  const resizeSnap = calculateResizeSnap(
    { x: 100, y: 200, width: 397, height: 60 },
    'r',
    1000,
    1000,
    [sibling1],
    ['resizing-box'],
    8,
    true
  );

  assert(resizeSnap.box.width === 400, `Resize right handle snaps to sibling right edge width 400 (got ${resizeSnap.box.width})`);
  assert(resizeSnap.guides.length > 0, 'Resize generates alignment guide');
}

// 5. Threshold boundary check (>8px should NOT snap)
{
  const proposedFar = { x: 420, y: 100, width: 200, height: 100 }; // Canvas center is 500, proposed center is 520 (distance 20px > threshold 8px)
  const snapResult = calculateSnap(
    proposedFar,
    1000,
    1000,
    [],
    [],
    8,
    true
  );

  assert(snapResult.x === 420, `Far element (>8px) does NOT snap (expected 420, got ${snapResult.x})`);
  assert(snapResult.guides.length === 0, 'No guides generated for elements outside snap threshold');
}

console.log('🎉 All Phase 9.1 snapping tests passed successfully!');
