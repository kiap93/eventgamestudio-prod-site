import fs from 'fs';
import path from 'path';

function replaceInFile(filePath: string, replacements: Array<[string | RegExp, string]>) {
  if (!fs.existsSync(filePath)) {
    console.warn(`File not found: ${filePath}`);
    return;
  }
  let content = fs.readFileSync(filePath, 'utf8');
  let count = 0;
  for (const [target, replacement] of replacements) {
    if (typeof target === 'string') {
      if (content.includes(target)) {
        content = content.replace(target, replacement);
        count++;
      }
    } else {
      if (target.test(content)) {
        content = content.replace(target, replacement);
        count++;
      }
    }
  }
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Updated ${filePath}: ${count} replacements applied.`);
}

function ensureUseLocalizationImport(filePath: string, relativePathToContext: string) {
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf8');
  if (!content.includes('useLocalization')) {
    content = `import { useLocalization } from '${relativePathToContext}';\n` + content;
    // Also add `const { t } = useLocalization();` right inside the main component function
    // Match export const ComponentName: React.FC<...> = (...) => {
    content = content.replace(/(\nexport const \w+:\s*React\.FC(?:<[^>]+>)?\s*=\s*\([^\)]*\)\s*=>\s*\{)/, '$1\n  const { t } = useLocalization();');
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Added useLocalization import and hook to ${filePath}`);
  }
}

// 1. StartScreenBasicEditor.tsx
ensureUseLocalizationImport('src/components/studio/games/start-editor/StartScreenBasicEditor.tsx', '../../../../context/LocalizationContext');
replaceInFile('src/components/studio/games/start-editor/StartScreenBasicEditor.tsx', [
  ['Start Screen Background', "{t('editor.startScreenBg', undefined, 'Start Screen Background')}"],
  ['title="Reset Start Screen background to Theme defaults"', "title={t('editor.resetCanvasLayout', undefined, 'Reset Start Screen background to Theme defaults')}"],
  ['Active Theme BG', "{t('editor.activeThemeBg', undefined, 'Active Theme BG')}"],
  ['Uses theme wallpaper', "{t('editor.activeThemeBgDesc', undefined, 'Uses theme wallpaper')}"],
  ['Solid Color', "{t('editor.solidColor', undefined, 'Solid Color')}"],
  ['Custom backdrop color', "{t('editor.solidColorDesc', undefined, 'Custom backdrop color')}"],
  ['Custom Image', "{t('editor.customImage', undefined, 'Custom Image')}"],
  ['Independent artwork upload', "{t('editor.customImageDesc', undefined, 'Independent artwork upload')}"],
  ['Custom Color', "{t('editor.customColor', undefined, 'Custom Color')}"],
  ['Custom Start Screen Background Loaded', "{t('editor.customStartBgLoaded', undefined, 'Custom Start Screen Background Loaded')}"],
  ['16:9 recommended aspect ratio (1024×576px or higher)', "{t('editor.aspectRatio16_9', undefined, '16:9 recommended aspect ratio (1024×576px or higher)')}"],
  ['Replace Image', "{t('editor.replaceImage', undefined, 'Replace Image')}"],
  ['Supports PNG, JPG, WebP (Max 10MB)', "{t('editor.supportsPngJpgWebp', undefined, 'Supports PNG, JPG, WebP (Max 10MB)')}"],
  ['Dark Backdrop Overlay', "{t('editor.darkBackdropOverlay', undefined, 'Dark Backdrop Overlay')}"],
  ['Start Screen Element Visibility', "{t('editor.startElementVisibility', undefined, 'Start Screen Element Visibility')}"],
  ['Header Eyebrow / Logo', "{t('editor.headerLogoEyebrow', undefined, 'Header Eyebrow / Logo')}"],
  ['Top arcade badge or brand logo', "{t('editor.headerLogoEyebrowDesc', undefined, 'Top arcade badge or brand logo')}"],
  ['Rules & Collectibles Cards', "{t('editor.rulesCollectiblesCards', undefined, 'Rules & Collectibles Cards')}"],
  ['Shows target (+10) and hazard (-10)', "{t('editor.rulesCollectiblesCardsDesc', undefined, 'Shows target (+10) and hazard (-10)')}"],
  ['Keyboard Hints Pill', "{t('editor.keyboardHintsPill', undefined, 'Keyboard Hints Pill')}"],
  ['Shows Arrow & A/D controls', "{t('editor.keyboardHintsPillDesc', undefined, 'Shows Arrow & A/D controls')}"],
  ['Leaderboard Button', "{t('editor.leaderboardBtn', undefined, 'Leaderboard Button')}"],
  ['Shortcut button to scores', "{t('editor.leaderboardBtnDesc', undefined, 'Shortcut button to scores')}"],
  ['How-To-Play Guide Button', "{t('editor.howToPlayBtn', undefined, 'How-To-Play Guide Button')}"],
  ['Help modal button in footer', "{t('editor.howToPlayBtnDesc', undefined, 'Help modal button in footer')}"],
  ['Game Header Icon', "{t('editor.gameHeaderIcon', undefined, 'Game Header Icon')}"],
  ['Grid symbol badge at the top', "{t('editor.gameHeaderIconDesc', undefined, 'Grid symbol badge at the top')}"],
  ['Grid Dimensions Pill', "{t('editor.gridDimensionsPill', undefined, 'Grid Dimensions Pill')}"],
  ['Pairs Count Pill', "{t('editor.pairsCountPill', undefined, 'Pairs Count Pill')}"],
  ['Timer Duration Pill', "{t('editor.timerDurationPill', undefined, 'Timer Duration Pill')}"],
  ['Starting Gantry Icon', "{t('editor.startingGantryIcon', undefined, 'Starting Gantry Icon')}"],
  ['Top reaction zap symbol', "{t('editor.startingGantryIconDesc', undefined, 'Top reaction zap symbol')}"],
  ['Rounds Count Pill', "{t('editor.roundsCountPill', undefined, 'Rounds Count Pill')}"],
  ['Gantry Lights Pill', "{t('editor.gantryLightsPill', undefined, 'Gantry Lights Pill')}"],
]);

// 2. ResultScreenBasicEditor.tsx
ensureUseLocalizationImport('src/components/studio/games/result-editor/ResultScreenBasicEditor.tsx', '../../../../context/LocalizationContext');
replaceInFile('src/components/studio/games/result-editor/ResultScreenBasicEditor.tsx', [
  ['Result Screen Background', "{t('editor.resultScreenBg', undefined, 'Result Screen Background')}"],
  ['Active Theme BG', "{t('editor.activeThemeBg', undefined, 'Active Theme BG')}"],
  ['Uses theme wallpaper', "{t('editor.activeThemeBgDesc', undefined, 'Uses theme wallpaper')}"],
  ['Solid Color', "{t('editor.solidColor', undefined, 'Solid Color')}"],
  ['Custom backdrop color', "{t('editor.solidColorDesc', undefined, 'Custom backdrop color')}"],
  ['Custom Image', "{t('editor.customImage', undefined, 'Custom Image')}"],
  ['Independent artwork upload', "{t('editor.customImageDesc', undefined, 'Independent artwork upload')}"],
  ['Custom Color', "{t('editor.customColor', undefined, 'Custom Color')}"],
  ['16:9 recommended aspect ratio (1024×576px or higher)', "{t('editor.aspectRatio16_9', undefined, '16:9 recommended aspect ratio (1024×576px or higher)')}"],
  ['Replace Image', "{t('editor.replaceImage', undefined, 'Replace Image')}"],
  ['Supports PNG, JPG, WebP (Max 10MB)', "{t('editor.supportsPngJpgWebp', undefined, 'Supports PNG, JPG, WebP (Max 10MB)')}"],
  ['Dark Backdrop Overlay', "{t('editor.darkBackdropOverlay', undefined, 'Dark Backdrop Overlay')}"],
  ['Result Screen Element Visibility', "{t('editor.startElementVisibility', undefined, 'Result Screen Element Visibility')}"],
  ['Headline / Game Over Title', "{t('editor.headlineTitle', undefined, 'Headline / Game Over Title')}"],
  ['Final Score Card', "{t('editor.finalScore', undefined, 'Final Score Card')}"],
  ['Play Again Button', "{t('editor.playAgainBtn', undefined, 'Play Again Button')}"],
  ['Catch Accuracy Stat', "{t('editor.catchAccuracy', undefined, 'Catch Accuracy Stat')}"],
  ['Time Elapsed Stat', "{t('editor.timeElapsed', undefined, 'Time Elapsed Stat')}"],
  ['Event Leaderboard Card', "{t('editor.eventLeaderboard', undefined, 'Event Leaderboard Card')}"],
  ['Moves Count Stat', "{t('editor.movesCount', undefined, 'Moves Count Stat')}"],
  ['Pairs Matched Stat', "{t('editor.pairsMatched', undefined, 'Pairs Matched Stat')}"],
  ['Accuracy Rate Stat', "{t('editor.accuracyRate', undefined, 'Accuracy Rate Stat')}"],
  ['Average Reaction Time', "{t('editor.avgReactionTime', undefined, 'Average Reaction Time')}"],
  ['Best Reaction Stat', "{t('editor.bestReaction', undefined, 'Best Reaction Stat')}"],
  ['Round Results Breakdown', "{t('editor.roundResults', undefined, 'Round Results Breakdown')}"],
  ['Reaction Tier Rating', "{t('editor.reactionTierRating', undefined, 'Reaction Tier Rating')}"],
]);

// 3. result-editor/EditorTopBar.tsx
ensureUseLocalizationImport('src/components/studio/games/result-editor/EditorTopBar.tsx', '../../../../context/LocalizationContext');
replaceInFile('src/components/studio/games/result-editor/EditorTopBar.tsx', [
  ['<span>Add Element</span>', "<span>{t('editor.addElement', undefined, 'Add Element')}</span>"],
  ['<span>Result Screen Visual Editor</span>', "<span>{t('editor.resultPresetLibraryTitle', undefined, 'Result Screen Visual Editor')}</span>"],
  ['title="Undo (Ctrl+Z / Cmd+Z)"', "title={t('editor.undoTooltip', undefined, 'Undo (Ctrl+Z)')}"],
  ['title="Redo (Ctrl+Shift+Z / Cmd+Shift+Z / Ctrl+Y)"', "title={t('editor.redoTooltip', undefined, 'Redo (Ctrl+Y)')}"],
  ['<span className="hidden md:inline text-[11px]">Undo</span>', '<span className="hidden md:inline text-[11px]">{t(\'editor.undoTooltip\', undefined, \'Undo\')}</span>'],
  ['<span className="hidden md:inline text-[11px]">Redo</span>', '<span className="hidden md:inline text-[11px]">{t(\'editor.redoTooltip\', undefined, \'Redo\')}</span>'],
  ['title="Browse pre-designed result screen layout presets and custom templates"', "title={t('editor.presetLibraryBtn', undefined, 'Templates')}"],
  ['<span className="hidden sm:inline">Templates</span>', '<span className="hidden sm:inline">{t(\'editor.presetLibraryBtn\', undefined, \'Templates\')}</span>'],
  ['title="Save current layout as a reusable custom template"', "title={t('editor.saveAsTemplateBtn', undefined, 'Save Template')}"],
  ['<span className="hidden sm:inline">Save Template</span>', '<span className="hidden sm:inline">{t(\'editor.saveAsTemplateBtn\', undefined, \'Save Template\')}</span>'],
  ['title="Reset to default result screen layout"', "title={t('editor.resetCanvasLayout', undefined, 'Reset')}"],
  ['<span className="hidden sm:inline">Reset</span>', '<span className="hidden sm:inline">{t(\'common.reset\', undefined, \'Reset\')}</span>'],
  ['<span>Done</span>', "<span>{t('common.done', undefined, 'Done')}</span>"],
  ['title="Center Horizontally"', "title={t('editor.centerHCanvas', undefined, 'Center Horizontally')}"],
  ['title="Center Vertically"', "title={t('editor.centerVCanvas', undefined, 'Center Vertically')}"],
  ['title="Bring to Front (Ctrl+Shift+])"', "title={t('editor.bringToFront', undefined, 'Bring to Front')}"],
  ['title="Bring Forward (Ctrl+])"', "title={t('editor.bringForward', undefined, 'Bring Forward')}"],
  ['title="Send Backward (Ctrl+[)"', "title={t('editor.sendBackward', undefined, 'Send Backward')}"],
  ['title="Send to Back (Ctrl+Shift+[)"', "title={t('editor.sendToBack', undefined, 'Send to Back')}"],
  ['title="Duplicate Selected (Ctrl+D)"', "title={t('editor.duplicateSelection', undefined, 'Duplicate')}"],
  ['title="Delete Selected (Del)"', "title={t('editor.deleteSelection', undefined, 'Delete')}"],
  ['Select elements on canvas or in layers panel to inspect & edit', "{t('editor.selectElementToEdit', undefined, 'Select elements on canvas or in layers panel to inspect & edit')}"],
  ['Reset Layout?', "{t('editor.resetCanvasLayout', undefined, 'Reset Layout?')}"],
  ['Cancel', "{t('common.cancel', undefined, 'Cancel')}"],
]);

// 4. result-editor/LayerTreePanel.tsx
ensureUseLocalizationImport('src/components/studio/games/result-editor/LayerTreePanel.tsx', '../../../../context/LocalizationContext');
replaceInFile('src/components/studio/games/result-editor/LayerTreePanel.tsx', [
  ['<span>Layers</span>', "<span>{t('editor.layers', undefined, 'Layers')}</span>"],
  ['placeholder="Filter layers..."', "placeholder={t('editor.filterLayers', undefined, 'Filter layers...')}"]
]);

// 5. result-editor/PresetLibraryModal.tsx
ensureUseLocalizationImport('src/components/studio/games/result-editor/PresetLibraryModal.tsx', '../../../../context/LocalizationContext');
replaceInFile('src/components/studio/games/result-editor/PresetLibraryModal.tsx', [
  ['Apply Preset', "{t('editor.applyPresetConfirm', undefined, 'Apply Preset')}"],
  ['Cancel', "{t('common.cancel', undefined, 'Cancel')}"]
]);

// 6. result-editor/SaveTemplateModal.tsx
ensureUseLocalizationImport('src/components/studio/games/result-editor/SaveTemplateModal.tsx', '../../../../context/LocalizationContext');
replaceInFile('src/components/studio/games/result-editor/SaveTemplateModal.tsx', [
  ['Save Layout as Template', "{t('editor.saveTemplateTitle', undefined, 'Save Layout as Template')}"],
  ['Template Name', "{t('editor.templateNameLabel', undefined, 'Template Name')}"],
  ['Category', "{t('editor.templateCategoryLabel', undefined, 'Category')}"],
  ['Description (Optional)', "{t('editor.templateDescLabel', undefined, 'Description (Optional)')}"],
  ['Cancel', "{t('common.cancel', undefined, 'Cancel')}"],
  ['Save Template', "{t('editor.saveTemplateBtn', undefined, 'Save Template')}"]
]);

// 7. shared-editor/EditorTopBar.tsx
ensureUseLocalizationImport('src/components/studio/games/shared-editor/EditorTopBar.tsx', '../../../../context/LocalizationContext');
replaceInFile('src/components/studio/games/shared-editor/EditorTopBar.tsx', [
  ['<span>Add Element</span>', "<span>{t('editor.addElement', undefined, 'Add Element')}</span>"],
  ['<span>Exit Preview</span>', "<span>{t('editor.previewActive', undefined, 'Exit Preview')}</span>"],
  ['<span>Preview</span>', "<span>{t('editor.preview', undefined, 'Preview')}</span>"],
  ['<span>Presets</span>', "<span>{t('editor.presetLibraryBtn', undefined, 'Presets')}</span>"],
  ['<span>Save Template</span>', "<span>{t('editor.saveAsTemplateBtn', undefined, 'Save Template')}</span>"],
  ['<span>Reset</span>', "<span>{t('common.reset', undefined, 'Reset')}</span>"],
  ['<span>Done</span>', "<span>{t('common.done', undefined, 'Done')}</span>"]
]);

// 8. shared-editor/LayerTreePanel.tsx
ensureUseLocalizationImport('src/components/studio/games/shared-editor/LayerTreePanel.tsx', '../../../../context/LocalizationContext');
replaceInFile('src/components/studio/games/shared-editor/LayerTreePanel.tsx', [
  ['<span>Layers</span>', "<span>{t('editor.layers', undefined, 'Layers')}</span>"],
  ['placeholder="Search layers..."', "placeholder={t('editor.filterLayers', undefined, 'Search layers...')}"]
]);

// 9. shared-editor/PresetLibraryModal.tsx
ensureUseLocalizationImport('src/components/studio/games/shared-editor/PresetLibraryModal.tsx', '../../../../context/LocalizationContext');
replaceInFile('src/components/studio/games/shared-editor/PresetLibraryModal.tsx', [
  ['Apply Preset', "{t('editor.applyPresetConfirm', undefined, 'Apply Preset')}"],
  ['Cancel', "{t('common.cancel', undefined, 'Cancel')}"]
]);

// 10. shared-editor/SaveTemplateModal.tsx
ensureUseLocalizationImport('src/components/studio/games/shared-editor/SaveTemplateModal.tsx', '../../../../context/LocalizationContext');
replaceInFile('src/components/studio/games/shared-editor/SaveTemplateModal.tsx', [
  ['Save Layout as Template', "{t('editor.saveTemplateTitle', undefined, 'Save Layout as Template')}"],
  ['Template Name', "{t('editor.templateNameLabel', undefined, 'Template Name')}"],
  ['Category', "{t('editor.templateCategoryLabel', undefined, 'Category')}"],
  ['Description (Optional)', "{t('editor.templateDescLabel', undefined, 'Description (Optional)')}"],
  ['Cancel', "{t('common.cancel', undefined, 'Cancel')}"],
  ['Save Template', "{t('editor.saveTemplateBtn', undefined, 'Save Template')}"]
]);

console.log('Finished migrating all remaining components!');
