import fs from 'fs';
import path from 'path';

function replaceExact(filePath: string, pairs: Array<[string, string]>) {
  const full = path.resolve(filePath);
  let content = fs.readFileSync(full, 'utf8');
  let count = 0;
  for (const [target, repl] of pairs) {
    if (content.includes(target)) {
      content = content.replaceAll(target, repl);
      count++;
    }
  }
  fs.writeFileSync(full, content, 'utf8');
  console.log(`Updated ${filePath}: ${count} replacements applied.`);
}

// 1. start-editor/PropertyInspectorPanel.tsx
replaceExact('src/components/studio/games/start-editor/PropertyInspectorPanel.tsx', [
  ['<span className="font-bold text-xs text-slate-200">Start Screen Canvas</span>', '<span className="font-bold text-xs text-slate-200">{t(\'editor.startScreenCanvas\', undefined, \'Start Screen Canvas\')}</span>'],
  ['<span className="text-slate-400">Logical Space:</span>', '<span className="text-slate-400">{t(\'editor.logicalSpace\', undefined, \'Logical Space:\')}</span>'],
  ['<span className="text-slate-400">Total Elements:</span>', '<span className="text-slate-400">{t(\'editor.totalElements\', undefined, \'Total Elements:\')}</span>'],
  ['Auto-scales responsively to match any device viewport.', "{t('editor.responsiveScaleNotice', undefined, 'Auto-scales responsively to match any device viewport.')}"],
  ['<span>Add Elements to Canvas</span>', '<span>{t(\'editor.addElementsToCanvas\', undefined, \'Add Elements to Canvas\')}</span>'],
  ['<span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">\n                  Containers\n                </span>', '<span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">\n                  {t(\'editor.containers\', undefined, \'Containers\')}\n                </span>'],
  ['<span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">\n                  Visual Elements\n                </span>', '<span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">\n                  {t(\'editor.visuals\', undefined, \'Visual Elements\')}\n                </span>'],
  ['<span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">\n                  Game Info & Content\n                </span>', '<span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">\n                  {t(\'editor.infoAndText\', undefined, \'Game Info & Content\')}\n                </span>'],
  ['<span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">\n                  Interactive Controls\n                </span>', '<span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">\n                  {t(\'editor.controls\', undefined, \'Interactive Controls\')}\n                </span>'],
  ['<label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">\n              Screen Background\n            </label>', '<label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">\n              {t(\'editor.screenBackground\', undefined, \'Screen Background\')}\n            </label>'],
  ['<label className="block text-[11px] text-slate-400 mb-1">Color</label>', '<label className="block text-[11px] text-slate-400 mb-1">{t(\'editor.colorLabel\', undefined, \'Color\')}</label>'],
  ['<label className="block text-[11px] text-slate-400">Background Image</label>', '<label className="block text-[11px] text-slate-400">{t(\'editor.backgroundImage\', undefined, \'Background Image\')}</label>'],
  ['<span>{isUploading ? \'Uploading Image...\' : \'Upload Background Image\'}</span>', '<span>{isUploading ? t(\'editor.uploadingBgImage\', undefined, \'Uploading Image...\') : t(\'editor.uploadBgImage\', undefined, \'Upload Background Image\')}</span>'],
  ['<label className="text-[11px] text-slate-400">Darkness Overlay</label>', '<label className="text-[11px] text-slate-400">{t(\'editor.darknessOverlay\', undefined, \'Darkness Overlay\')}</label>'],
  ['<span className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">\n              Canvas Dimensions\n            </span>', '<span className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">\n              {t(\'editor.canvasDimensions\', undefined, \'Canvas Dimensions\')}\n            </span>'],
  ['Responsive canvas automatically scales seamlessly across all desktop, tablet, and mobile screens.', "{t('editor.responsiveScaleNotice', undefined, 'Responsive canvas automatically scales seamlessly across all desktop, tablet, and mobile screens.')}"],
  ['{selectedIds.length} Elements Selected', '{t(\'editor.elementsSelectedCount\', { count: selectedIds.length }, `${selectedIds.length} Elements Selected`)}'],
  ['title={isAllSelectedLocked ? \'Unlock All\' : \'Lock All\'}', 'title={isAllSelectedLocked ? t(\'editor.unlockAll\', undefined, \'Unlock All\') : t(\'editor.lockAll\', undefined, \'Lock All\')}'],
  ['<span className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">\n              Align & Distribute\n            </span>', '<span className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">\n              {t(\'editor.alignAndDistribute\', undefined, \'Align & Distribute\')}\n            </span>'],
]);

// 2. result-editor/PropertyInspectorPanel.tsx
replaceExact('src/components/studio/games/result-editor/PropertyInspectorPanel.tsx', [
  ['<span className="text-xs font-bold text-slate-200 block">Property Inspector</span>', '<span className="text-xs font-bold text-slate-200 block">{t(\'editor.propertyInspector\', undefined, \'Property Inspector\')}</span>'],
  ['Deselect All', "{t('common.deselectAll', undefined, 'Deselect All')}"],
  ['<span>Both</span>', '<span>{t(\'common.both\', undefined, \'Both\')}</span>'],
  ['<span>Left</span>', '<span>{t(\'common.left\', undefined, \'Left\')}</span>'],
  ['<span>Center</span>', '<span>{t(\'common.center\', undefined, \'Center\')}</span>'],
  ['<span>Right</span>', '<span>{t(\'common.right\', undefined, \'Right\')}</span>'],
  ['<span>Top</span>', '<span>{t(\'common.top\', undefined, \'Top\')}</span>'],
  ['<span>Middle</span>', '<span>{t(\'common.middle\', undefined, \'Middle\')}</span>'],
  ['<span>Bottom</span>', '<span>{t(\'common.bottom\', undefined, \'Bottom\')}</span>'],
  ['<span>Container Centering</span>', '<span>{t(\'editor.containerCentering\', undefined, \'Container Centering\')}</span>'],
  ['<span>Relative Alignment</span>', '<span>{t(\'editor.relativeAlignment\', undefined, \'Relative Alignment\')}</span>'],
  ['Multi-Selection ({selectedElements.length})', '{t(\'editor.multiSelection\', { count: selectedElements.length }, `Multi-Selection (${selectedElements.length})`)}'],
  ['title="Align Left"', 'title={t(\'editor.alignLeft\', undefined, \'Align Left\')}'],
  ['title="Align Center Horizontally"', 'title={t(\'editor.centerHorizontally\', undefined, \'Align Center Horizontally\')}'],
  ['title="Align Right"', 'title={t(\'editor.alignRight\', undefined, \'Align Right\')}'],
  ['title="Align Top"', 'title={t(\'editor.alignTop\', undefined, \'Align Top\')}'],
  ['title="Align Center Vertically"', 'title={t(\'editor.centerVertically\', undefined, \'Align Center Vertically\')}'],
  ['title="Align Bottom"', 'title={t(\'editor.alignBottom\', undefined, \'Align Bottom\')}'],
  ['title="Distribute Horizontally"', 'title={t(\'editor.distributeHorizontally\', undefined, \'Distribute Horizontally\')}'],
  ['title="Distribute Vertically"', 'title={t(\'editor.distributeVertically\', undefined, \'Distribute Vertically\')}'],
]);

// 3. result-editor/LayerTreePanel.tsx
replaceExact('src/components/studio/games/result-editor/LayerTreePanel.tsx', [
  ['title="Duplicate"', 'title={t(\'editor.duplicateLayer\', undefined, \'Duplicate\')}'],
  ['title="Delete"', 'title={t(\'editor.deleteLayer\', undefined, \'Delete\')}'],
  ['title="Expand Layers Panel"', 'title={t(\'editor.expandLayersPanel\', undefined, \'Expand Layers Panel\')}'],
  ['title="Browse Result Screen Presets"', 'title={t(\'editor.browsePresetLayouts\', undefined, \'Browse Result Screen Presets\')}'],
  ['<span className="text-[11px] hidden sm:inline">Presets</span>', '<span className="text-[11px] hidden sm:inline">{t(\'editor.presetLibraryBtn\', undefined, \'Presets\')}</span>'],
  ['title="Add New Root Element"', 'title={t(\'editor.addNewRootElement\', undefined, \'Add New Root Element\')}'],
  ['<span className="text-[11px]">Add</span>', '<span className="text-[11px]">{t(\'common.add\', undefined, \'Add\')}</span>'],
]);

// 4. shared-editor/LayerTreePanel.tsx
replaceExact('src/components/studio/games/shared-editor/LayerTreePanel.tsx', [
  ['title="Group Selection (Cmd G)"', 'title={t(\'editor.groupTooltip\', undefined, \'Group Selection (Cmd G)\')}'],
  ['title="Ungroup (Cmd Shift G)"', 'title={t(\'editor.ungroupTooltip\', undefined, \'Ungroup (Cmd Shift G)\')}'],
  ['title="Duplicate (Cmd D)"', 'title={t(\'editor.duplicateSelection\', undefined, \'Duplicate (Cmd D)\')}'],
  ['title="Delete Layer"', 'title={t(\'editor.deleteLayer\', undefined, \'Delete Layer\')}'],
]);

// 5. ResultScreenVisualEditor.tsx
replaceExact('src/components/studio/games/ResultScreenVisualEditor.tsx', [
  ['title="Drag to Rotate (Degrees)"', 'title={t(\'editor.dragToRotate\', undefined, \'Drag to Rotate (Degrees)\')}'],
]);

console.log('Batch 1 Studio migrations completed.');
