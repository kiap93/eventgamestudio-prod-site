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
  ['<span className="text-[9px]">Left</span>', "<span className=\"text-[9px]\">{t('common.left', undefined, 'Left')}</span>"],
  ['<span className="text-[9px]">Center H</span>', "<span className=\"text-[9px]\">{t('common.center', undefined, 'Center H')}</span>"],
  ['<span className="text-[9px]">Right</span>', "<span className=\"text-[9px]\">{t('common.right', undefined, 'Right')}</span>"],
  ['<span className="text-[9px]">Dist H</span>', "<span className=\"text-[9px]\">{t('editor.distributeHorizontally', undefined, 'Dist H')}</span>"],
  ['<span className="text-[9px]">Top</span>', "<span className=\"text-[9px]\">{t('common.top', undefined, 'Top')}</span>"],
  ['<span className="text-[9px]">Center V</span>', "<span className=\"text-[9px]\">{t('common.middle', undefined, 'Center V')}</span>"],
  ['<span className="text-[9px]">Bottom</span>', "<span className=\"text-[9px]\">{t('common.bottom', undefined, 'Bottom')}</span>"],
  ['<span className="text-[9px]">Dist V</span>', "<span className=\"text-[9px]\">{t('editor.distributeVertically', undefined, 'Dist V')}</span>"],
  ['<span>Logical Space:</span>', "<span>{t('editor.logicalSpace', undefined, 'Logical Space:')}</span>"],
]);

// 2. result-editor/PropertyInspectorPanel.tsx
replaceExact('src/components/studio/games/result-editor/PropertyInspectorPanel.tsx', [
  ['<span>Distribute Spacing (3+ Items)</span>', "<span>{t('editor.distributeHorizontally', undefined, 'Distribute Spacing (3+ Items)')}</span>"],
  ['<span>Layer Stacking</span>', "<span>{t('editor.layerStacking', undefined, 'Layer Stacking')}</span>"],
  ['<span>Back</span>', "<span>{t('editor.sendToBack', undefined, 'Back')}</span>"],
  ['<span>Group & Layer Control</span>', "<span>{t('editor.groupLayerControl', undefined, 'Group & Layer Control')}</span>"],
  ['title="Duplicate"', "title={t('editor.duplicateSelection', undefined, 'Duplicate')}"],
]);

// 3. result-editor/LayerTreePanel.tsx
replaceExact('src/components/studio/games/result-editor/LayerTreePanel.tsx', [
  ['title="Collapse Layers Panel"', "title={t('editor.collapsePanel', undefined, 'Collapse Layers Panel')}"],
  ['placeholder="Search layers..."', "placeholder={t('editor.filterLayers', undefined, 'Search layers...')}"],
  ['title="Group selected elements (Ctrl+G)"', "title={t('editor.groupTooltip', undefined, 'Group selected elements (Ctrl+G)')}"],
  ['<span>Group</span>', "<span>{t('editor.groupTooltip', undefined, 'Group')}</span>"],
  ['title="Ungroup selected (Ctrl+Shift+G)"', "title={t('editor.ungroupTooltip', undefined, 'Ungroup selected (Ctrl+Shift+G)')}"],
  ['<span>Ungroup</span>', "<span>{t('editor.ungroupTooltip', undefined, 'Ungroup')}</span>"],
]);

// 4. ResultScreenVisualEditor.tsx
replaceExact('src/components/studio/games/ResultScreenVisualEditor.tsx', [
  ['title="Resize Top-Left"', "title={t('editor.resizeHandle', undefined, 'Resize Top-Left')}"],
  ['title="Resize Top-Right"', "title={t('editor.resizeHandle', undefined, 'Resize Top-Right')}"],
  ['title="Resize Bottom-Left"', "title={t('editor.resizeHandle', undefined, 'Resize Bottom-Left')}"],
  ['title="Resize Bottom-Right"', "title={t('editor.resizeHandle', undefined, 'Resize Bottom-Right')}"],
  ['title="Resize Top Edge"', "title={t('editor.resizeHandle', undefined, 'Resize Top Edge')}"],
]);

// 5. DeveloperPricingManager.tsx
replaceExact('src/components/developer/DeveloperPricingManager.tsx', [
  ['<span className="text-xs font-bold text-white uppercase tracking-wider block">Duration Tiers</span>', "<span className=\"text-xs font-bold text-white uppercase tracking-wider block\">{t('developer.durationBasedPricingTiers', undefined, 'Duration Tiers')}</span>"],
  ['<span className="text-xs font-bold text-white uppercase tracking-wider block">Platform Events</span>', "<span className=\"text-xs font-bold text-white uppercase tracking-wider block\">{t('developer.platformEvents', undefined, 'Platform Events')}</span>"],
  ['<span className="text-xs font-bold text-white uppercase tracking-wider block">Custom Overrides</span>', "<span className=\"text-xs font-bold text-white uppercase tracking-wider block\">{t('developer.customOverrides', undefined, 'Custom Overrides')}</span>"],
  ['<span className="text-xs font-bold text-white uppercase tracking-wider block">Credit Coverage</span>', "<span className=\"text-xs font-bold text-white uppercase tracking-wider block\">{t('developer.creditCoverage', undefined, 'Credit Coverage')}</span>"],
]);

// 6. DeveloperGamePricingManager.tsx
replaceExact('src/components/developer/DeveloperGamePricingManager.tsx', [
  ['<span className="text-xs font-bold text-slate-200">Quick Setup Standard Tiers</span>', "<span className=\"text-xs font-bold text-slate-200\">{t('developer.quickSetupStandardTiers', undefined, 'Quick Setup Standard Tiers')}</span>"],
]);

console.log('Inspector spans updated.');
