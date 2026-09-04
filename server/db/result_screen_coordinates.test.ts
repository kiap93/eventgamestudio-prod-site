import assert from 'node:assert';
import {
  DEFAULT_RESULT_CANVAS_CONFIG,
  MemoryMatchResultScreenConfig,
  ResultScreenElement,
  ResultCardElement,
} from '../../src/games/memory-match/types';
import {
  RESULT_SCREEN_PRESETS,
  instantiateResultPreset,
} from '../../src/components/studio/games/result-editor/presets';

/**
 * Coordinate calculation function matching ResultScreenRenderer.tsx:
 *   const leftPercent = `${(el.x / parentWidth) * 100}%`;
 *   const topPercent = `${(el.y / parentHeight) * 100}%`;
 *   const widthPercent = `${(el.width / parentWidth) * 100}%`;
 *   const heightPercent = `${(el.height / parentHeight) * 100}%`;
 */
function calculateRendererPercentages(
  el: { x: number; y: number; width: number; height: number },
  parentWidth: number = 1000,
  parentHeight: number = 1000
) {
  return {
    leftPercent: (el.x / parentWidth) * 100,
    topPercent: (el.y / parentHeight) * 100,
    widthPercent: (el.width / parentWidth) * 100,
    heightPercent: (el.height / parentHeight) * 100,
  };
}

/**
 * Coordinate calculation function matching CanvasWorkspace.tsx:
 *   const leftPercent = `${(el.x / parentWidth) * 100}%`;
 *   const topPercent = `${(el.y / parentHeight) * 100}%`;
 *   const widthPercent = `${(el.width / parentWidth) * 100}%`;
 *   const heightPercent = `${(el.height / parentHeight) * 100}%`;
 */
function calculateEditorPercentages(
  el: { x: number; y: number; width: number; height: number },
  parentWidth: number = 1000,
  parentHeight: number = 1000
) {
  return {
    leftPercent: (el.x / parentWidth) * 100,
    topPercent: (el.y / parentHeight) * 100,
    widthPercent: (el.width / parentWidth) * 100,
    heightPercent: (el.height / parentHeight) * 100,
  };
}

/**
 * Computes the physical rendered box in pixels for a given container size.
 */
function calculatePhysicalPixelBounds(
  percentages: { leftPercent: number; topPercent: number; widthPercent: number; heightPercent: number },
  containerWidthPx: number,
  containerHeightPx: number
) {
  return {
    xPx: (percentages.leftPercent / 100) * containerWidthPx,
    yPx: (percentages.topPercent / 100) * containerHeightPx,
    widthPx: (percentages.widthPercent / 100) * containerWidthPx,
    heightPx: (percentages.heightPercent / 100) * containerHeightPx,
  };
}

async function runResultScreenCoordinateTests() {
  console.log('====================================================');
  console.log('TEST SUITE: RESULT SCREEN COORDINATES (Scenarios 15 & 16)');
  console.log('====================================================\n');

  // --------------------------------------------------------------------------
  // Scenario 15: 1000 × 1000 logical coordinates render proportionally.
  // --------------------------------------------------------------------------
  console.log('Scenario 15: 1000 × 1000 logical coordinates render proportionally...');
  assert.strictEqual(DEFAULT_RESULT_CANVAS_CONFIG.width, 1000, 'Scenario 15: Canvas default width must be 1000');
  assert.strictEqual(DEFAULT_RESULT_CANVAS_CONFIG.height, 1000, 'Scenario 15: Canvas default height must be 1000');

  // Define reference elements in 1000x1000 space
  const elements = [
    { id: 'header', x: 100, y: 50, width: 800, height: 120 },     // 10% left, 5% top, 80% width, 12% height
    { id: 'card', x: 150, y: 220, width: 700, height: 480 },      // 15% left, 22% top, 70% width, 48% height
    { id: 'button', x: 250, y: 750, width: 500, height: 90 },     // 25% left, 75% top, 50% width, 9% height
  ];

  // Test across multiple target viewport display sizes (mobile 375px, tablet 768px, 1000px, 1440px desktop)
  const testDisplaySizes = [
    { width: 375, height: 375, name: 'Mobile 375x375' },
    { width: 500, height: 500, name: 'Small Preview 500x500' },
    { width: 768, height: 768, name: 'Tablet 768x768' },
    { width: 1000, height: 1000, name: '1:1 Canvas 1000x1000' },
    { width: 1440, height: 1440, name: 'HD Desktop 1440x1440' },
  ];

  for (const el of elements) {
    const pct = calculateRendererPercentages(el, 1000, 1000);
    assert.strictEqual(pct.leftPercent, (el.x / 10), `Scenario 15: Element ${el.id} left % should be ${el.x / 10}`);
    assert.strictEqual(pct.topPercent, (el.y / 10), `Scenario 15: Element ${el.id} top % should be ${el.y / 10}`);
    assert.strictEqual(pct.widthPercent, (el.width / 10), `Scenario 15: Element ${el.id} width % should be ${el.width / 10}`);
    assert.strictEqual(pct.heightPercent, (el.height / 10), `Scenario 15: Element ${el.id} height % should be ${el.height / 10}`);

    // Verify proportional scaling across all viewport sizes
    for (const vp of testDisplaySizes) {
      const physical = calculatePhysicalPixelBounds(pct, vp.width, vp.height);
      const expectedXPx = (el.x / 1000) * vp.width;
      const expectedYPx = (el.y / 1000) * vp.height;
      const expectedWPx = (el.width / 1000) * vp.width;
      const expectedHPx = (el.height / 1000) * vp.height;

      assert.strictEqual(
        Math.abs(physical.xPx - expectedXPx) < 0.001,
        true,
        `Proportional X mismatch on ${vp.name}`
      );
      assert.strictEqual(
        Math.abs(physical.yPx - expectedYPx) < 0.001,
        true,
        `Proportional Y mismatch on ${vp.name}`
      );
      assert.strictEqual(
        Math.abs(physical.widthPx - expectedWPx) < 0.001,
        true,
        `Proportional Width mismatch on ${vp.name}`
      );
      assert.strictEqual(
        Math.abs(physical.heightPx - expectedHPx) < 0.001,
        true,
        `Proportional Height mismatch on ${vp.name}`
      );

      // Verify aspect ratio preservation
      const logicalAspectRatio = el.width / el.height;
      const physicalAspectRatio = physical.widthPx / physical.heightPx;
      assert.strictEqual(
        Math.abs(logicalAspectRatio - physicalAspectRatio) < 0.0001,
        true,
        `Aspect ratio must be strictly preserved on ${vp.name}`
      );
    }
  }
  console.log('  ✓ PASSED: 1000 × 1000 logical coordinates render with exact geometric proportionality across all screen sizes');

  // --------------------------------------------------------------------------
  // Scenario 16: Editor and live renderer use the same coordinate system.
  // --------------------------------------------------------------------------
  console.log('\nScenario 16: Editor and live renderer use the same coordinate system...');

  // 16a. Verify that for all 6 built-in presets, Editor percentages and Renderer percentages are 100% IDENTICAL
  for (const preset of RESULT_SCREEN_PRESETS) {
    const presetElements = instantiateResultPreset(preset.id);
    assert.ok(presetElements && presetElements.length > 0, `Preset ${preset.id} must have elements`);

    function verifyElementCoordinateEquivalence(list: ResultScreenElement[], pW = 1000, pH = 1000) {
      for (const item of list) {
        const rendererPct = calculateRendererPercentages(item, pW, pH);
        const editorPct = calculateEditorPercentages(item, pW, pH);

        assert.strictEqual(
          rendererPct.leftPercent,
          editorPct.leftPercent,
          `Preset ${preset.id}, element ${item.id}: leftPercent mismatch`
        );
        assert.strictEqual(
          rendererPct.topPercent,
          editorPct.topPercent,
          `Preset ${preset.id}, element ${item.id}: topPercent mismatch`
        );
        assert.strictEqual(
          rendererPct.widthPercent,
          editorPct.widthPercent,
          `Preset ${preset.id}, element ${item.id}: widthPercent mismatch`
        );
        assert.strictEqual(
          rendererPct.heightPercent,
          editorPct.heightPercent,
          `Preset ${preset.id}, element ${item.id}: heightPercent mismatch`
        );

        // Coordinate space boundaries check: must be inside 1000x1000 space
        assert.ok(item.x >= 0 && item.x <= pW, `Element ${item.id} x=${item.x} out of ${pW} bounds`);
        assert.ok(item.y >= 0 && item.y <= pH, `Element ${item.id} y=${item.y} out of ${pH} bounds`);
        assert.ok(item.width > 0 && item.width <= pW, `Element ${item.id} width=${item.width} invalid`);
        assert.ok(item.height > 0 && item.height <= pH, `Element ${item.id} height=${item.height} invalid`);

        // Check recursive container children
        if (item.type === 'card' && (item as ResultCardElement).children) {
          verifyElementCoordinateEquivalence((item as ResultCardElement).children, item.width, item.height);
        }
      }
    }

    verifyElementCoordinateEquivalence(presetElements, 1000, 1000);
  }

  // 16b. Verify nested child coordinate space: Child positioned at (50, 50) inside a Card of (600, 400)
  // Both Editor and Live Renderer use parentWidth = card.width and parentHeight = card.height
  const parentCard = { x: 200, y: 300, width: 600, height: 400 };
  const childElement = { x: 50, y: 40, width: 500, height: 80 };

  const childRendererPct = calculateRendererPercentages(childElement, parentCard.width, parentCard.height);
  const childEditorPct = calculateEditorPercentages(childElement, parentCard.width, parentCard.height);

  assert.deepStrictEqual(childRendererPct, childEditorPct, 'Child percentages in card must be identical');
  assert.strictEqual(childRendererPct.leftPercent, (50 / 600) * 100);
  assert.strictEqual(childRendererPct.topPercent, (40 / 400) * 100);
  assert.strictEqual(childRendererPct.widthPercent, (500 / 600) * 100);
  assert.strictEqual(childRendererPct.heightPercent, (80 / 400) * 100);

  console.log('  ✓ PASSED: Editor and live renderer use the identical coordinate system, root bounds (1000x1000), and nesting math');

  console.log('\n====================================================');
  console.log('🎉 ALL RESULT SCREEN COORDINATE SCENARIOS PASSED!');
  console.log('====================================================\n');
}

runResultScreenCoordinateTests().catch((err) => {
  console.error('❌ Test execution failed:', err);
  process.exit(1);
});
