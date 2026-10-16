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

// 1. result-editor/PropertyInspectorPanel.tsx
replaceExact('src/components/studio/games/result-editor/PropertyInspectorPanel.tsx', [
  ['<span>X Pos</span>', "<span>{t('editor.xPos', undefined, 'X Pos')}</span>"],
  ['<span>Y Pos</span>', "<span>{t('editor.yPos', undefined, 'Y Pos')}</span>"],
  ['<span>Width</span>', "<span>{t('editor.width', undefined, 'Width')}</span>"],
  ['<span>Height</span>', "<span>{t('editor.height', undefined, 'Height')}</span>"],
  ['<span className="font-bold text-slate-400">Rotation</span>', "<span className=\"font-bold text-slate-400\">{t('editor.rotation', undefined, 'Rotation')}</span>"],
  ['<span className="font-bold text-slate-400">Opacity</span>', "<span className=\"font-bold text-slate-400\">{t('editor.opacity', undefined, 'Opacity')}</span>"],
  ['<span>Combined Bounds</span>', "<span>{t('editor.canvasDimensions', undefined, 'Combined Bounds')}</span>"],
  ['<span>Group & Actions</span>', "<span>{t('editor.groupLayerControl', undefined, 'Group & Actions')}</span>"],
  ['title="Delete"', "title={t('editor.deleteLayer', undefined, 'Delete')}"],
]);

// 2. start-editor/PropertyInspectorPanel.tsx
replaceExact('src/components/studio/games/start-editor/PropertyInspectorPanel.tsx', [
  ['<span className="text-slate-500">Min X:</span>', "<span className=\"text-slate-500\">{t('editor.xPos', undefined, 'Min X:')}</span>"],
  ['<span className="text-slate-500">Min Y:</span>', "<span className=\"text-slate-500\">{t('editor.yPos', undefined, 'Min Y:')}</span>"],
  ['<span className="text-slate-500">Width:</span>', "<span className=\"text-slate-500\">{t('editor.width', undefined, 'Width:')}</span>"],
  ['<span className="text-slate-500">Height:</span>', "<span className=\"text-slate-500\">{t('editor.height', undefined, 'Height:')}</span>"],
  ['<span>Group Selected Elements (Ctrl+G)</span>', "<span>{t('editor.groupTooltip', undefined, 'Group Selected Elements (Ctrl+G)')}</span>"],
  ['Combined Bounds', "{t('editor.canvasDimensions', undefined, 'Combined Bounds')}"],
  ['Group & Actions', "{t('editor.groupLayerControl', undefined, 'Group & Actions')}"],
]);

console.log('Remaining inspector strings replaced.');
