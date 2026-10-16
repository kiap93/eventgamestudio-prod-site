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
  ['title="Bring To Front"', "title={t('editor.bringToFront', undefined, 'Bring To Front')}"],
  ['title="Bring Forward (1 step)"', "title={t('editor.bringForward', undefined, 'Bring Forward (1 step)')}"],
  ['title="Send Backward (1 step)"', "title={t('editor.sendBackward', undefined, 'Send Backward (1 step)')}"],
  ['title="Send To Back"', "title={t('editor.sendToBack', undefined, 'Send To Back')}"],
  ['Root Canvas (1000×1000)', "{t('editor.resultScreenCanvas', undefined, 'Root Canvas (1000×1000)')}"],
  ['<label className="text-[10px] text-slate-400">Container Placement:</label>', "<label className=\"text-[10px] text-slate-400\">{t('editor.relativeAlignment', undefined, 'Container Placement:')}</label>"],
]);

// 2. start-editor/PropertyInspectorPanel.tsx
replaceExact('src/components/studio/games/start-editor/PropertyInspectorPanel.tsx', [
  ['title="Deselect (View Canvas & Add Elements)"', "title={t('editor.closeEditor', undefined, 'Deselect (View Canvas & Add Elements)')}"],
  ['<label className="text-[10px] font-bold text-slate-400 block font-mono">X (px)</label>', "<label className=\"text-[10px] font-bold text-slate-400 block font-mono\">{t('editor.xPos', undefined, 'X (px)')}</label>"],
  ['<label className="text-[10px] font-bold text-slate-400 block font-mono">Y (px)</label>', "<label className=\"text-[10px] font-bold text-slate-400 block font-mono\">{t('editor.yPos', undefined, 'Y (px)')}</label>"],
  ['<label className="text-[10px] font-bold text-slate-400 block font-mono">WIDTH</label>', "<label className=\"text-[10px] font-bold text-slate-400 block font-mono\">{t('editor.width', undefined, 'WIDTH')}</label>"],
  ['<label className="text-[10px] font-bold text-slate-400 block font-mono">HEIGHT</label>', "<label className=\"text-[10px] font-bold text-slate-400 block font-mono\">{t('editor.height', undefined, 'HEIGHT')}</label>"],
]);

// 3. ResultScreenVisualEditor.tsx
replaceExact('src/components/studio/games/ResultScreenVisualEditor.tsx', [
  ['title="Resize Bottom Edge"', "title={t('editor.resizeHandle', undefined, 'Resize Bottom Edge')}"],
  ['title="Resize Left Edge"', "title={t('editor.resizeHandle', undefined, 'Resize Left Edge')}"],
  ['title="Resize Right Edge"', "title={t('editor.resizeHandle', undefined, 'Resize Right Edge')}"],
  ['title="Bring To Front"', "title={t('editor.bringToFront', undefined, 'Bring To Front')}"],
  ['title="Bring Forward (1 step)"', "title={t('editor.bringForward', undefined, 'Bring Forward (1 step)')}"],
  ['title="Send Backward (1 step)"', "title={t('editor.sendBackward', undefined, 'Send Backward (1 step)')}"],
  ['title="Send To Back"', "title={t('editor.sendToBack', undefined, 'Send To Back')}"],
]);

console.log('Done subcomponent migrations.');
