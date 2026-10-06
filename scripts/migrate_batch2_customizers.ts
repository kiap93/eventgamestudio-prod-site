import fs from 'fs';
import path from 'path';

function replaceInFile(filePath: string, replacements: Array<[string, string]>) {
  if (!fs.existsSync(filePath)) {
    console.warn(`File not found: ${filePath}`);
    return;
  }
  let content = fs.readFileSync(filePath, 'utf8');
  let count = 0;
  for (const [target, replacement] of replacements) {
    if (content.includes(target)) {
      content = content.replace(target, replacement);
      count++;
    } else {
      console.warn(`[NOT FOUND in ${filePath}]: ${target.slice(0, 40)}...`);
    }
  }
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Updated ${filePath}: ${count}/${replacements.length} replacements applied.`);
}

// 1. CatchBrandCustomizer.tsx
replaceInFile('src/components/studio/games/CatchBrandCustomizer.tsx', [
  ['Catcher Scale, Catch Area & Physics', "{t('customizers.catcherScalePhysics', undefined, 'Catcher Scale, Catch Area & Physics')}"],
  ['Catcher Name', "{t('customizers.catcherName', undefined, 'Catcher Name')}"],
  ['placeholder="e.g. Woven Basket"', "placeholder={t('customizers.catcherNamePlaceholder', undefined, 'e.g. Woven Basket')}"],
  ['Catch Sweet Spot', "{t('customizers.catchSweetSpot', undefined, 'Catch Sweet Spot')}"],
  ['placeholder="Item Name"', "placeholder={t('customizers.itemName', undefined, 'Item Name')}"],
  ['title="Delete item"', "title={t('studio.deleteItem', undefined, 'Delete item')}"],
  ['Points Value', "{t('customizers.pointsValue', undefined, 'Points Value')}"],
  ['Spawn Frequency', "{t('customizers.spawnFrequency', undefined, 'Spawn Frequency')}"],
  ['Speed Modifier', "{t('customizers.speedModifier', undefined, 'Speed Modifier')}"],
  ['Proportional Scale', "{t('customizers.proportionalScale', undefined, 'Proportional Scale')}"],
  ['Session length before time expires', "{t('customizers.sessionLengthDesc', undefined, 'Session length before time expires')}"],
  ['Speed rate of falling objects', "{t('customizers.speedRateDesc', undefined, 'Speed rate of falling objects')}"],
  ['Delay between consecutive item spawns', "{t('customizers.spawnIntervalDesc', undefined, 'Delay between consecutive item spawns')}"],
  ['Interactive Scaled Canvas Preview (1024 × 576)', "{t('customizers.interactiveCanvasPreview', undefined, 'Interactive Scaled Canvas Preview (1024 × 576)')}"],
]);

// 2. MemoryMatchCustomizer.tsx
replaceInFile('src/components/studio/games/MemoryMatchCustomizer.tsx', [
  ['Card Front Background', "{t('customizers.cardFrontBackground', undefined, 'Card Front Background')}"],
  ['title="Reset Card Front Background to default (#0F172A at 95%)"', "title={t('studio.cardFrontBgDefault', undefined, 'Reset Card Front Background to default (#0F172A at 95%)')}"],
  ['<span>Face-Up</span>', "<span>{t('customizers.faceUp', undefined, 'Face-Up')}</span>"],
  ['Background Color', "{t('customizers.backgroundColor', undefined, 'Background Color')}"],
  ['Background Opacity', "{t('customizers.backgroundOpacity', undefined, 'Background Opacity')}"],
  ['0% (Transparent)', "{t('customizers.transparent', undefined, '0% (Transparent)')}"],
  ['100% (Solid)', "{t('customizers.solid', undefined, '100% (Solid)')}"],
  ['Match Success Background', "{t('customizers.matchSuccessBackground', undefined, 'Match Success Background')}"],
  ['title="Reset Match Success Background to default (#064E3B at 85%)"', "title={t('studio.matchSuccessBgDefault', undefined, 'Reset Match Success Background to default (#064E3B at 85%)')}"],
  ['<span>Matched</span>', "<span>{t('studio.matched', undefined, 'Matched')}</span>"],
  ['Match Success Border', "{t('customizers.matchSuccessBorder', undefined, 'Match Success Border')}"],
  ['Mismatch Alert Border', "{t('customizers.mismatchAlertBorder', undefined, 'Mismatch Alert Border')}"],
  ['Card Library', "{t('customizers.cardLibrary', undefined, 'Card Library')}"],
  ['Board Layout & Card Arrangement', "{t('customizers.boardLayoutArrangement', undefined, 'Board Layout & Card Arrangement')}"],
  ['<span>Grid</span>', "<span>{t('customizers.layoutGrid', undefined, 'Grid')}</span>"],
  ['<span>Random / Scattered</span>', "<span>{t('customizers.layoutScattered', undefined, 'Random / Scattered')}</span>"],
  ['<span>Up-Down</span>', "<span>{t('customizers.layoutUpDown', undefined, 'Up-Down')}</span>"],
  ['<span>Up-Down + Random Rotation</span>', "<span>{t('customizers.layoutUpDownRotated', undefined, 'Up-Down + Random Rotation')}</span>"],
  ['Card Dimensions, Shape & Rotation', "{t('customizers.cardDimensionsShape', undefined, 'Card Dimensions, Shape & Rotation')}"],
  ['Upright (0°)', "{t('customizers.rotationUpright', undefined, 'Upright (0°)')}"],
  ['No rotation', "{t('customizers.rotationNone', undefined, 'No rotation')}"],
  ['Fixed Angle', "{t('customizers.rotationFixed', undefined, 'Fixed Angle')}"],
  ['Uniform angle', "{t('customizers.rotationFixedDesc', undefined, 'Uniform angle')}"],
  ['Random Tilt', "{t('customizers.rotationRandom', undefined, 'Random Tilt')}"],
  ['Stable per card', "{t('customizers.rotationRandomDesc', undefined, 'Stable per card')}"],
  ['Session Timer & Mismatch Reveal', "{t('customizers.sessionTimerMismatch', undefined, 'Session Timer & Mismatch Reveal')}"],
  ['Scoring & Combo Multipliers', "{t('customizers.scoringComboMultipliers', undefined, 'Scoring & Combo Multipliers')}"],
  ['Base Match Points', "{t('customizers.baseMatchPoints', undefined, 'Base Match Points')}"],
  ['Combo Streak Bonus', "{t('customizers.comboStreakBonus', undefined, 'Combo Streak Bonus')}"],
  ['Game Screens Customization', "{t('customizers.gameScreensCustomization', undefined, 'Game Screens Customization')}"],
  ['<span>Start Screen</span>', "<span>{t('customizers.startScreen', undefined, 'Start Screen')}</span>"],
  ['<span>Result Screen</span>', "<span>{t('customizers.resultScreen', undefined, 'Result Screen')}</span>"],
  ['Start Screen Visual Canvas Editor', "{t('customizers.startScreenVisualCanvasEditor', undefined, 'Start Screen Visual Canvas Editor')}"],
  ['Open Start Screen Editor', "{t('customizers.openStartScreenEditor', undefined, 'Open Start Screen Editor')}"],
  ['Result Screen Visual Canvas Editor', "{t('customizers.resultScreenVisualCanvasEditor', undefined, 'Result Screen Visual Canvas Editor')}"],
  ['Open Result Screen Editor', "{t('customizers.openResultScreenEditor', undefined, 'Open Result Screen Editor')}"],
  ['Viewport:', "{t('customizers.viewport', undefined, 'Viewport:')}"],
  ['Interactive Scaled Canvas Preview (1024 × 576)', "{t('customizers.interactiveCanvasPreview', undefined, 'Interactive Scaled Canvas Preview (1024 × 576)')}"],
  ['<span>Card Flip</span>', "<span>{t('customizers.cardFlip', undefined, 'Card Flip')}</span>"],
  ['<span>Match Chime</span>', "<span>{t('customizers.matchChime', undefined, 'Match Chime')}</span>"],
  ['<span>Mismatch Buzz</span>', "<span>{t('customizers.mismatchBuzz', undefined, 'Mismatch Buzz')}</span>"],
  ['<span>Victory Fanfare</span>', "<span>{t('customizers.victoryFanfare', undefined, 'Victory Fanfare')}</span>"],
]);

// 3. ReactionGameCustomizer.tsx
replaceInFile('src/components/studio/games/ReactionGameCustomizer.tsx', [
  ['1 (Fast)', "{t('customizers.roundsFast', undefined, '1 (Fast)')}"],
  ['5 (Standard)', "{t('customizers.roundsStandard', undefined, '5 (Standard)')}"],
  ['10 (Thorough)', "{t('customizers.roundsThorough', undefined, '10 (Thorough)')}"],
  ['3 Lights', "{t('customizers.lights3', undefined, '3 Lights')}"],
  ['4 Lights', "{t('customizers.lights4', undefined, '4 Lights')}"],
  ['5 (F1 Classic)', "{t('customizers.lights5', undefined, '5 (F1 Classic)')}"],
  ['400ms (Rapid)', "{t('customizers.stepRapid', undefined, '400ms (Rapid)')}"],
  ['1000ms (Classic)', "{t('customizers.stepClassic', undefined, '1000ms (Classic)')}"],
  ['1500ms (Deliberate)', "{t('customizers.stepDeliberate', undefined, '1500ms (Deliberate)')}"],
  ['Retry Round (Discard Jump Start)', "{t('customizers.jumpRetry', undefined, 'Retry Round (Discard Jump Start)')}"],
  ['+1000ms Penalty Added', "{t('customizers.jumpPenalty', undefined, '+1000ms Penalty Added')}"],
  ['Mark Round as Disqualified', "{t('customizers.jumpDisqualify', undefined, 'Mark Round as Disqualified')}"],
  ['Minimum Delay', "{t('customizers.minDelay', undefined, 'Minimum Delay')}"],
  ['Maximum Delay', "{t('customizers.maxDelay', undefined, 'Maximum Delay')}"],
  ['Circular Lens (Classic)', "{t('customizers.lensCircular', undefined, 'Circular Lens (Classic)')}"],
  ['Rounded Square', "{t('customizers.lensRoundedSquare', undefined, 'Rounded Square')}"],
  ['Vertical Capsule / Pill', "{t('customizers.lensCapsule', undefined, 'Vertical Capsule / Pill')}"],
  ['Lights Out (Formula 1 Standard)', "{t('customizers.signalLightsOut', undefined, 'Lights Out (Formula 1 Standard)')}"],
  ['All Turn Green', "{t('customizers.signalAllGreen', undefined, 'All Turn Green')}"],
  ['<span>Light 1 Tick</span>', "<span>{t('customizers.lightTick', undefined, 'Light Tick')}</span>"],
  ['<span>Light 5 Tick</span>', "<span>{t('customizers.lightTick', undefined, 'Light Tick')}</span>"],
  ['<span>Lights Out Chime</span>', "<span>{t('customizers.lightsOutChime', undefined, 'Lights Out Chime')}</span>"],
  ['<span>False Start Buzz</span>', "<span>{t('customizers.falseStartBuzz', undefined, 'False Start Buzz')}</span>"],
  ['<span>Victory Fanfare</span>', "<span>{t('customizers.victoryFanfare', undefined, 'Victory Fanfare')}</span>"],
  ['<span>Start Screen</span>', "<span>{t('customizers.startScreen', undefined, 'Start Screen')}</span>"],
  ['<span>Result Screen</span>', "<span>{t('customizers.resultScreen', undefined, 'Result Screen')}</span>"],
  ['Start Screen Visual Canvas Editor', "{t('customizers.startScreenVisualCanvasEditor', undefined, 'Start Screen Visual Canvas Editor')}"],
  ['Open Start Screen Editor', "{t('customizers.openStartScreenEditor', undefined, 'Open Start Screen Editor')}"],
  ['Result Screen Visual Canvas Editor', "{t('customizers.resultScreenVisualCanvasEditor', undefined, 'Result Screen Visual Canvas Editor')}"],
  ['Open Result Screen Editor', "{t('customizers.openResultScreenEditor', undefined, 'Open Result Screen Editor')}"],
  ['Viewport:', "{t('customizers.viewport', undefined, 'Viewport:')}"],
  ['Interactive Scaled Canvas Preview (1024 × 576)', "{t('customizers.interactiveCanvasPreview', undefined, 'Interactive Scaled Canvas Preview (1024 × 576)')}"],
]);

console.log('Batch 2 migration completed.');
