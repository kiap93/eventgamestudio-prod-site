import {
  getEditableGameLayout,
  DEFAULT_PORTRAIT_CATCH_BRAND_LAYOUT,
} from '../../themes/responsive';
import type { GameLayoutConfig } from '../../types';

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

console.log('======================================================');
console.log('Running Independent Orientation Layout Acceptance Tests');
console.log('======================================================');

// Test 1: editing landscape layout does not alter portraitLayout overrides
{
  const initialLayout: GameLayoutConfig = {
    orientation: 'landscape',
    clientLogo: { x: 10, y: 10, width: 20, visible: true },
    scoreHud: { x: 5, y: 5, width: 15, visible: true },
    timer: { x: 75, y: 5, width: 15, visible: true },
    gameTitle: { x: 35, y: 5, width: 30, visible: true },
    footerSponsor: { x: 30, y: 92, width: 40, visible: true },
    portraitLayout: {
      scoreHud: { x: 12, y: 22, width: 18, visible: true },
    },
  };

  const updatedLandscape: GameLayoutConfig = {
    ...initialLayout,
    scoreHud: {
      ...initialLayout.scoreHud,
      x: 8,
      y: 8,
    },
  };

  assert(updatedLandscape.portraitLayout?.scoreHud?.x === 12, 'Portrait scoreHud X preserved after landscape edit');
  assert(updatedLandscape.portraitLayout?.scoreHud?.y === 22, 'Portrait scoreHud Y preserved after landscape edit');

  const resolvedLandscape = getEditableGameLayout(updatedLandscape, false, 'catch-brand');
  assert(resolvedLandscape.scoreHud.x === 8, 'Resolved landscape scoreHud X is 8');
  assert(resolvedLandscape.scoreHud.y === 8, 'Resolved landscape scoreHud Y is 8');

  const resolvedPortrait = getEditableGameLayout(updatedLandscape, true, 'catch-brand');
  assert(resolvedPortrait.scoreHud.x === 12, 'Resolved portrait scoreHud X is 12');
  assert(resolvedPortrait.scoreHud.y === 22, 'Resolved portrait scoreHud Y is 22');
}

// Test 2: editing portrait layout writes to portraitLayout without altering landscape coordinates
{
  const initialLayout: GameLayoutConfig = {
    orientation: 'auto',
    clientLogo: { x: 10, y: 10, width: 20, visible: true },
    scoreHud: { x: 5, y: 5, width: 15, visible: true },
    timer: { x: 75, y: 5, width: 15, visible: true },
    gameTitle: { x: 35, y: 5, width: 30, visible: true },
    footerSponsor: { x: 30, y: 92, width: 40, visible: true },
  };

  const updatedPortrait: GameLayoutConfig = {
    ...initialLayout,
    portraitLayout: {
      clientLogo: { x: 25, y: 4, width: 50, visible: true },
      scoreHud: { x: 8, y: 16, width: 40, visible: true },
      timer: { x: 52, y: 16, width: 40, visible: true },
      gameTitle: { x: 15, y: 24, width: 70, visible: true },
      footerSponsor: { x: 10, y: 95, width: 80, visible: true },
    },
  };

  assert(updatedPortrait.clientLogo.x === 10, 'Landscape clientLogo X untouched');
  assert(updatedPortrait.scoreHud.x === 5, 'Landscape scoreHud X untouched');
  assert(updatedPortrait.timer.x === 75, 'Landscape timer X untouched');
  assert(updatedPortrait.gameTitle.x === 35, 'Landscape gameTitle X untouched');
  assert(updatedPortrait.footerSponsor.x === 30, 'Landscape footerSponsor X untouched');

  const resolvedLandscape = getEditableGameLayout(updatedPortrait, false, 'catch-brand');
  assert(resolvedLandscape.clientLogo.x === 10, 'Resolved landscape clientLogo X is 10');
  assert(resolvedLandscape.scoreHud.x === 5, 'Resolved landscape scoreHud X is 5');
  assert(resolvedLandscape.timer.x === 75, 'Resolved landscape timer X is 75');
  assert(resolvedLandscape.gameTitle.x === 35, 'Resolved landscape gameTitle X is 35');
  assert(resolvedLandscape.footerSponsor.x === 30, 'Resolved landscape footerSponsor X is 30');

  const resolvedPortrait = getEditableGameLayout(updatedPortrait, true, 'catch-brand');
  assert(resolvedPortrait.clientLogo.x === 25, 'Resolved portrait clientLogo X is 25');
  assert(resolvedPortrait.scoreHud.x === 8, 'Resolved portrait scoreHud X is 8');
  assert(resolvedPortrait.timer.x === 52, 'Resolved portrait timer X is 52');
  assert(resolvedPortrait.gameTitle.x === 15, 'Resolved portrait gameTitle X is 15');
  assert(resolvedPortrait.footerSponsor.x === 10, 'Resolved portrait footerSponsor X is 10');
}

// Test 3: un-customized portrait elements fallback cleanly
{
  const layout: GameLayoutConfig = {
    orientation: 'portrait',
    clientLogo: { x: 41, y: 9.5, width: 18, visible: true },
    scoreHud: { x: 3.5, y: 3.5, width: 17, visible: true },
    timer: { x: 79.5, y: 11, width: 17, visible: true },
    gameTitle: { x: 35, y: 3.5, width: 30, visible: true },
    footerSponsor: { x: 32, y: 94.5, width: 36, visible: true },
  };

  const resolvedPortrait = getEditableGameLayout(layout, true, 'catch-brand');
  assert(resolvedPortrait.scoreHud.x === DEFAULT_PORTRAIT_CATCH_BRAND_LAYOUT.scoreHud.x, 'Default portrait scoreHud X');
  assert(resolvedPortrait.scoreHud.y === DEFAULT_PORTRAIT_CATCH_BRAND_LAYOUT.scoreHud.y, 'Default portrait scoreHud Y');
  assert(resolvedPortrait.timer.x === DEFAULT_PORTRAIT_CATCH_BRAND_LAYOUT.timer.x, 'Default portrait timer X');
  assert(resolvedPortrait.footerSponsor.y === DEFAULT_PORTRAIT_CATCH_BRAND_LAYOUT.footerSponsor.y, 'Default portrait footerSponsor Y');
}

console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}

