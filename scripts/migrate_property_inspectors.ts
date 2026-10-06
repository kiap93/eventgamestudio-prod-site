import fs from 'fs';
import path from 'path';

function updateFile(filePath: string, updater: (content: string) => string) {
  const fullPath = path.resolve(filePath);
  const content = fs.readFileSync(fullPath, 'utf8');
  const updated = updater(content);
  fs.writeFileSync(fullPath, updated, 'utf8');
  console.log(`Updated ${filePath}`);
}

// 1. result-editor/PropertyInspectorPanel.tsx
updateFile('src/components/studio/games/result-editor/PropertyInspectorPanel.tsx', (content) => {
  // Add import if not present
  if (!content.includes('useLocalization')) {
    content = `import { useLocalization } from '../../../../context/LocalizationContext';\n` + content;
  }
  // Add const { t } = useLocalization(); inside component
  if (!content.includes('const { t } = useLocalization();')) {
    content = content.replace(
      'const groupedElements = useMemo(() => getResultElementsGroupedByCategory(gameType), [gameType]);',
      `const { t } = useLocalization();\n  const groupedElements = useMemo(() => getResultElementsGroupedByCategory(gameType), [gameType]);`
    );
  }

  // Replacements
  const pairs: Array<[string, string]> = [
    ['title="Expand Property Inspector"', "title={t('editor.propertyInspector', undefined, 'Property Inspector')}"],
    ['<span>Properties</span>', "<span>{t('editor.propertyInspector', undefined, 'Properties')}</span>"],
    ['<span>Property Inspector</span>', "<span>{t('editor.propertyInspector', undefined, 'Property Inspector')}</span>"],
    ['title="Collapse Inspector"', "title={t('common.close', undefined, 'Collapse Inspector')}"],
    ['title="Click to isolate this element"', "title={t('editor.selectElementToEdit', undefined, 'Click to isolate this element')}"],
    ['<label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Container Centering</label>', "<label className=\"text-[10px] font-semibold text-slate-400 uppercase tracking-wider block\">{t('editor.containerCentering', undefined, 'Container Centering')}</label>"],
    ['<span>Center X</span>', "<span>{t('editor.centerX', undefined, 'Center X')}</span>"],
    ['<span>Center Y</span>', "<span>{t('editor.centerY', undefined, 'Center Y')}</span>"],
    ['<label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Relative Alignment</label>', "<label className=\"text-[10px] font-semibold text-slate-400 uppercase tracking-wider block\">{t('editor.relativeAlignment', undefined, 'Relative Alignment')}</label>"],
    ['<span>Horizontal</span>', "<span>{t('editor.horizontal', undefined, 'Horizontal')}</span>"],
    ['<span>Vertical</span>', "<span>{t('editor.vertical', undefined, 'Vertical')}</span>"],
    ['<label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Layer Stacking</label>', "<label className=\"text-[10px] font-semibold text-slate-400 uppercase tracking-wider block\">{t('editor.layerStacking', undefined, 'Layer Stacking')}</label>"],
    ['<span>Front</span>', "<span>{t('editor.front', undefined, 'Front')}</span>"],
    ['<span>Forward</span>', "<span>{t('editor.forward', undefined, 'Forward')}</span>"],
    ['<span>Backward</span>', "<span>{t('editor.backward', undefined, 'Backward')}</span>"],
    ['<span>Group &amp; Layer Control</span>', "<span>{t('editor.groupLayerControl', undefined, 'Group & Layer Control')}</span>"],
    ['title="Group selected elements into a single group (Ctrl+G)"', "title={t('editor.groupTooltip', undefined, 'Group selected elements into a single group (Ctrl+G)')}"],
    ['title="Ungroup selected group(s) (Ctrl+Shift+G)"', "title={t('editor.ungroupTooltip', undefined, 'Ungroup selected group(s) (Ctrl+Shift+G)')}"],
    ['<span>Ungroup</span>', "<span>{t('editor.ungroup', undefined, 'Ungroup')}</span>"],
    ['title="Toggle lock for all selected elements (Ctrl+L)"', "title={t('editor.lockSelection', undefined, 'Toggle lock for all selected elements (Ctrl+L)')}"],
    ['<label className="text-[10px] text-slate-400 block font-mono">X Pos</label>', "<label className=\"text-[10px] text-slate-400 block font-mono\">{t('editor.xPos', undefined, 'X Pos')}</label>"],
    ['<label className="text-[10px] text-slate-400 block font-mono">Y Pos</label>', "<label className=\"text-[10px] text-slate-400 block font-mono\">{t('editor.yPos', undefined, 'Y Pos')}</label>"],
    ['<label className="text-[10px] text-slate-400 block font-mono">Width</label>', "<label className=\"text-[10px] text-slate-400 block font-mono\">{t('editor.width', undefined, 'Width')}</label>"],
    ['<label className="text-[10px] text-slate-400 block font-mono">Height</label>', "<label className=\"text-[10px] text-slate-400 block font-mono\">{t('editor.height', undefined, 'Height')}</label>"],
    ['<label className="text-[10px] text-slate-400 block font-mono">Rotation</label>', "<label className=\"text-[10px] text-slate-400 block font-mono\">{t('editor.rotation', undefined, 'Rotation')}</label>"],
    ['<label className="text-[10px] text-slate-400 block font-mono">Opacity</label>', "<label className=\"text-[10px] text-slate-400 block font-mono\">{t('editor.opacity', undefined, 'Opacity')}</label>"],
    ['<label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Content String</label>', "<label className=\"text-[10px] font-semibold text-slate-400 uppercase tracking-wider block\">{t('editor.contentString', undefined, 'Content String')}</label>"],
    ['<label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Font Family</label>', "<label className=\"text-[10px] font-semibold text-slate-400 uppercase tracking-wider block\">{t('editor.fontFamily', undefined, 'Font Family')}</label>"],
    ['<label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Font Size</label>', "<label className=\"text-[10px] font-semibold text-slate-400 uppercase tracking-wider block\">{t('editor.fontSize', undefined, 'Font Size')}</label>"],
    ['<label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Border Radius</label>', "<label className=\"text-[10px] font-semibold text-slate-400 uppercase tracking-wider block\">{t('editor.borderRadius', undefined, 'Border Radius')}</label>"],
    ['<label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Border Width</label>', "<label className=\"text-[10px] font-semibold text-slate-400 uppercase tracking-wider block\">{t('editor.borderWidth', undefined, 'Border Width')}</label>"],
    ['<span>Upload BG</span>', "<span>{t('editor.uploadScreenWallpaper', undefined, 'Upload BG')}</span>"],
    ['<label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Custom Label</label>', "<label className=\"text-[10px] font-semibold text-slate-400 uppercase tracking-wider block\">{t('editor.customLabel', undefined, 'Custom Label')}</label>"],
    ['<label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Layout</label>', "<label className=\"text-[10px] font-semibold text-slate-400 uppercase tracking-wider block\">{t('editor.layout', undefined, 'Layout')}</label>"],
    ['<label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Value Font Size</label>', "<label className=\"text-[10px] font-semibold text-slate-400 uppercase tracking-wider block\">{t('editor.valueFontSize', undefined, 'Value Font Size')}</label>"],
    ['<label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Image URL</label>', "<label className=\"text-[10px] font-semibold text-slate-400 uppercase tracking-wider block\">{t('editor.imageUrl', undefined, 'Image URL')}</label>"],
    ['<span>Upload New Image</span>', "<span>{t('editor.uploadNewImage', undefined, 'Upload New Image')}</span>"],
    ['<label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Button Label</label>', "<label className=\"text-[10px] font-semibold text-slate-400 uppercase tracking-wider block\">{t('editor.buttonLabel', undefined, 'Button Label')}</label>"],
    ['<label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Action</label>', "<label className=\"text-[10px] font-semibold text-slate-400 uppercase tracking-wider block\">{t('editor.actionTrigger', undefined, 'Action')}</label>"],
    ['<span>Exit Game</span>', "<span>{t('editor.exitGame', undefined, 'Exit Game')}</span>"],
    ['<label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Corner Radius</label>', "<label className=\"text-[10px] font-semibold text-slate-400 uppercase tracking-wider block\">{t('editor.cornerRadius', undefined, 'Corner Radius')}</label>"],
    ['<span>Leaderboard Settings</span>', "<span>{t('editor.eventLeaderboard', undefined, 'Leaderboard Settings')}</span>"],
    ['<span>Dynamic Ranking</span>', "<span>{t('editor.eventLeaderboardDesc', undefined, 'Dynamic Ranking')}</span>"],
    ['<label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Header Title</label>', "<label className=\"text-[10px] font-semibold text-slate-400 uppercase tracking-wider block\">{t('editor.headerTitle', undefined, 'Header Title')}</label>"],
    ['<label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Displayed Rows</label>', "<label className=\"text-[10px] font-semibold text-slate-400 uppercase tracking-wider block\">{t('editor.displayedRows', undefined, 'Displayed Rows')}</label>"],
    ['<span>Highlight Current Player Row</span>', "<span>{t('editor.highlightCurrentPlayerRow', undefined, 'Highlight Current Player Row')}</span>"],
    ['<span>Ungroup Elements</span>', "<span>{t('editor.ungroupElements', undefined, 'Ungroup Elements')}</span>"],
    ['<span>No children</span>', "<span>{t('editor.noChildren', undefined, 'No children')}</span>"],
    ['<h4 className="text-xs font-bold text-white uppercase tracking-wider">Add Elements to Canvas</h4>', "<h4 className=\"text-xs font-bold text-white uppercase tracking-wider\">{t('editor.addElementsToCanvas', undefined, 'Add Elements to Canvas')}</h4>"],
    ['<h4 className="text-xs font-bold text-white uppercase tracking-wider">Screen Background</h4>', "<h4 className=\"text-xs font-bold text-white uppercase tracking-wider\">{t('editor.screenBackground', undefined, 'Screen Background')}</h4>"],
    ['<label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Background Type</label>', "<label className=\"text-[10px] font-semibold text-slate-400 uppercase tracking-wider block\">{t('editor.backgroundType', undefined, 'Background Type')}</label>"],
    ['<span>Upload Screen Wallpaper</span>', "<span>{t('editor.uploadScreenWallpaper', undefined, 'Upload Screen Wallpaper')}</span>"]
  ];

  for (const [target, repl] of pairs) {
    content = content.replaceAll(target, repl);
  }
  return content;
});

// 2. start-editor/PropertyInspectorPanel.tsx
updateFile('src/components/studio/games/start-editor/PropertyInspectorPanel.tsx', (content) => {
  // Add import if not present
  if (!content.includes('useLocalization')) {
    content = `import { useLocalization } from '../../../../context/LocalizationContext';\n` + content;
  }
  // Add const { t } = useLocalization(); inside component
  if (!content.includes('const { t } = useLocalization();')) {
    content = content.replace(
      'const fileInputRef = useRef<HTMLInputElement | null>(null);',
      `const { t } = useLocalization();\n  const fileInputRef = useRef<HTMLInputElement | null>(null);`
    );
  }

  const pairs: Array<[string, string]> = [
    ['<h4 className="text-xs font-bold text-white uppercase tracking-wider">Start Screen Canvas</h4>', "<h4 className=\"text-xs font-bold text-white uppercase tracking-wider\">{t('editor.startScreenCanvas', undefined, 'Start Screen Canvas')}</h4>"],
    ['<h4 className="text-xs font-bold text-white uppercase tracking-wider">Add Elements to Canvas</h4>', "<h4 className=\"text-xs font-bold text-white uppercase tracking-wider\">{t('editor.addElementsToCanvas', undefined, 'Add Elements to Canvas')}</h4>"],
    ['<label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Background Image</label>', "<label className=\"text-[10px] font-semibold text-slate-400 uppercase tracking-wider block\">{t('editor.backgroundImage', undefined, 'Background Image')}</label>"],
    ['<label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Darkness Overlay</label>', "<label className=\"text-[10px] font-semibold text-slate-400 uppercase tracking-wider block\">{t('editor.darknessOverlay', undefined, 'Darkness Overlay')}</label>"],
    ['title="Deselect All (Esc)"', "title={t('editor.closeEditor', undefined, 'Deselect All (Esc)')}"],
    ['title="Duplicate All (Ctrl+D)"', "title={t('editor.duplicateSelection', undefined, 'Duplicate All (Ctrl+D)')}"],
    ['title="Delete All (Del)"', "title={t('editor.deleteSelection', undefined, 'Delete All (Del)')}"],
    ['title="Align Left"', "title={t('editor.alignLeftTooltip', undefined, 'Align Left')}"],
    ['title="Align Center Horizontally"', "title={t('editor.alignCenterHTooltip', undefined, 'Align Center Horizontally')}"],
    ['title="Align Right"', "title={t('editor.alignRightTooltip', undefined, 'Align Right')}"],
    ['title="Align Top"', "title={t('editor.alignTopTooltip', undefined, 'Align Top')}"],
    ['title="Align Center Vertically"', "title={t('editor.alignCenterVTooltip', undefined, 'Align Center Vertically')}"],
    ['title="Align Bottom"', "title={t('editor.alignBottomTooltip', undefined, 'Align Bottom')}"],
    ['title="Distribute Horizontally (requires 3+ elements)"', "title={t('editor.distributeHTooltip', undefined, 'Distribute Horizontally (requires 3+ elements)')}"],
    ['title="Distribute Vertically (requires 3+ elements)"', "title={t('editor.distributeVTooltip', undefined, 'Distribute Vertically (requires 3+ elements)')}"],
    ['<span>Lock / Unlock Selected</span>', "<span>{t('editor.lockSelection', undefined, 'Lock / Unlock Selected')}</span>"],
    ['title="Duplicate"', "title={t('editor.duplicateSelection', undefined, 'Duplicate')}"],
    ['title="Delete"', "title={t('editor.deleteSelection', undefined, 'Delete')}"],
    ['<label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Background Color</label>', "<label className=\"text-[10px] font-semibold text-slate-400 uppercase tracking-wider block\">{t('editor.backgroundColor', undefined, 'Background Color')}</label>"],
    ['<label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Border Radius</label>', "<label className=\"text-[10px] font-semibold text-slate-400 uppercase tracking-wider block\">{t('editor.borderRadius', undefined, 'Border Radius')}</label>"],
    ['<label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Border Width</label>', "<label className=\"text-[10px] font-semibold text-slate-400 uppercase tracking-wider block\">{t('editor.borderWidth', undefined, 'Border Width')}</label>"],
    ['<label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Border Color</label>', "<label className=\"text-[10px] font-semibold text-slate-400 uppercase tracking-wider block\">{t('editor.borderColor', undefined, 'Border Color')}</label>"],
    ['<span>Insert Element into Card</span>', "<span>{t('editor.insertIntoCard', undefined, 'Insert Element into Card')}</span>"],
    ['<span>Ungroup Elements</span>', "<span>{t('editor.ungroupElements', undefined, 'Ungroup Elements')}</span>"],
    ['<span>Insert Element into Group</span>', "<span>{t('editor.insertIntoGroup', undefined, 'Insert Element into Group')}</span>"],
    ['<label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Title Text</label>', "<label className=\"text-[10px] font-semibold text-slate-400 uppercase tracking-wider block\">{t('editor.headerTitle', undefined, 'Title Text')}</label>"],
    ['<label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Subtitle Text</label>', "<label className=\"text-[10px] font-semibold text-slate-400 uppercase tracking-wider block\">{t('editor.description', undefined, 'Subtitle Text')}</label>"],
    ['<label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Font Size</label>', "<label className=\"text-[10px] font-semibold text-slate-400 uppercase tracking-wider block\">{t('editor.fontSize', undefined, 'Font Size')}</label>"],
    ['<label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Image URL</label>', "<label className=\"text-[10px] font-semibold text-slate-400 uppercase tracking-wider block\">{t('editor.imageUrl', undefined, 'Image URL')}</label>"],
    ['<label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Object Fit</label>', "<label className=\"text-[10px] font-semibold text-slate-400 uppercase tracking-wider block\">{t('editor.objectFit', undefined, 'Object Fit')}</label>"],
    ['<label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Metric Type</label>', "<label className=\"text-[10px] font-semibold text-slate-400 uppercase tracking-wider block\">{t('editor.metricType', undefined, 'Metric Type')}</label>"],
    ['<label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Button Label</label>', "<label className=\"text-[10px] font-semibold text-slate-400 uppercase tracking-wider block\">{t('editor.buttonLabel', undefined, 'Button Label')}</label>"],
    ['<label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Action Trigger</label>', "<label className=\"text-[10px] font-semibold text-slate-400 uppercase tracking-wider block\">{t('editor.actionTrigger', undefined, 'Action Trigger')}</label>"],
    ['<span>Start Game / Play</span>', "<span>{t('editor.startGamePlay', undefined, 'Start Game / Play')}</span>"],
    ['<span>Open Leaderboard</span>', "<span>{t('editor.openLeaderboard', undefined, 'Open Leaderboard')}</span>"],
    ['<span>Open Rules / How to Play</span>', "<span>{t('editor.openRules', undefined, 'Open Rules / How to Play')}</span>"],
    ['<span>Open Settings</span>', "<span>{t('editor.openSettings', undefined, 'Open Settings')}</span>"],
    ['<label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Header Title</label>', "<label className=\"text-[10px] font-semibold text-slate-400 uppercase tracking-wider block\">{t('editor.headerTitle', undefined, 'Header Title')}</label>"],
    ['<label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Description</label>', "<label className=\"text-[10px] font-semibold text-slate-400 uppercase tracking-wider block\">{t('editor.description', undefined, 'Description')}</label>"],
    ['<label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Max Rows</label>', "<label className=\"text-[10px] font-semibold text-slate-400 uppercase tracking-wider block\">{t('editor.displayedRows', undefined, 'Max Rows')}</label>"]
  ];

  for (const [target, repl] of pairs) {
    content = content.replaceAll(target, repl);
  }
  return content;
});

console.log('Finished migrating PropertyInspectorPanels.');
