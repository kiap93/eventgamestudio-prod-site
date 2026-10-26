import fs from 'fs';
import path from 'path';

function replaceExact(filePath: string, pairs: Array<[string, string]>) {
  const full = path.resolve(filePath);
  if (!fs.existsSync(full)) {
    console.warn(`File not found: ${filePath}`);
    return;
  }
  let content = fs.readFileSync(full, 'utf8');
  let count = 0;
  for (const [target, repl] of pairs) {
    if (content.includes(target)) {
      content = content.replaceAll(target, repl);
      count++;
    } else {
      console.warn(`[NOT FOUND in ${filePath}]: ${target.slice(0, 50)}...`);
    }
  }
  fs.writeFileSync(full, content, 'utf8');
  console.log(`Updated ${filePath}: ${count} replacements applied.`);
}

// 1. Match3Game.tsx
replaceExact('src/games/match-3/Match3Game.tsx', [
  ['<span>Logo</span>', "<span>{t('studio.logo', undefined, 'Logo')}</span>"],
  ['<span>Logo (Hidden)</span>', "<span>{t('studio.logoHidden', undefined, 'Logo (Hidden)')}</span>"],
  ['<span className="text-[10px] font-bold">Score (Hidden)</span>', "<span className=\"text-[10px] font-bold\">{t('studio.scoreHidden', undefined, 'Score (Hidden)')}</span>"],
  ['<span className="text-[10px] text-slate-400 italic">Game Title</span>', "<span className=\"text-[10px] text-slate-400 italic\">{t('studio.gameTitle', undefined, 'Game Title')}</span>"],
  ['<span className="text-[10px] text-slate-500 border border-dashed border-slate-700 rounded px-1.5 py-0.5">Title (Hidden)</span>', "<span className=\"text-[10px] text-slate-500 border border-dashed border-slate-700 rounded px-1.5 py-0.5\">{t('studio.titleHidden', undefined, 'Title (Hidden)')}</span>"],
  ['<span className="text-[10px] font-bold">Timer (Hidden)</span>', "<span className=\"text-[10px] font-bold\">{t('studio.timerHidden', undefined, 'Timer (Hidden)')}</span>"],
  ['title={isMuted ? \'Unmute\' : \'Mute\'}', "title={isMuted ? t('common.unmute', undefined, 'Unmute') : t('common.mute', undefined, 'Mute')}"],
  ['<span>Target:</span>', "<span>{t('match3.target', undefined, 'Target:')}</span>"],
  ['<span className="text-slate-300">Clear Obstacles:</span>', "<span className=\"text-slate-300\">{t('match3.clearObstacles', undefined, 'Clear Obstacles:')}</span>"],
  ['<span className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-tighter">STONE</span>', "<span className=\"text-[9px] font-mono font-bold text-slate-400 uppercase tracking-tighter\">{t('match3.hazardStone', undefined, 'STONE')}</span>"],
  ['<span className="text-[9px] font-mono font-bold text-white uppercase tracking-tighter">ICE</span>', "<span className=\"text-[9px] font-mono font-bold text-white uppercase tracking-tighter\">{t('match3.hazardIce', undefined, 'ICE')}</span>"],
  ['<span className="text-[10px]">Footer Sponsor (Hidden)</span>', "<span className=\"text-[10px]\">{t('studio.footerSponsorHidden', undefined, 'Footer Sponsor (Hidden)')}</span>"],
  ['<span className="tabular-nums">Matches: <strong className="text-slate-200">{matchesCount}</strong></span>', "<span className=\"tabular-nums\">{t('match3.matches', undefined, 'Matches:')} <strong className=\"text-slate-200\">{matchesCount}</strong></span>"],
  ['<span className="tabular-nums">Specials: <strong className="text-amber-400">{specialsCreatedCount}</strong></span>', "<span className=\"tabular-nums\">{t('match3.specials', undefined, 'Specials:')} <strong className=\"text-amber-400\">{specialsCreatedCount}</strong></span>"],
]);

// 2. StartScreenBasicEditor.tsx
replaceExact('src/components/studio/games/start-editor/StartScreenBasicEditor.tsx', [
  ['<span className="text-xs font-bold text-slate-200 block">Board Dimensions Pill</span>', "<span className=\"text-xs font-bold text-slate-200 block\">{t('editor.gridDimensionsPill', undefined, 'Board Dimensions Pill')}</span>"],
]);

// 3. AudioTab.tsx
replaceExact('src/components/studio/AudioTab.tsx', [
  ['title="Toggle background music on or off"', "title={t('studio.toggleBgmTitle', undefined, 'Toggle background music on or off')}"],
]);

// 4. start-editor/PropertyInspectorPanel.tsx
replaceExact('src/components/studio/games/start-editor/PropertyInspectorPanel.tsx', [
  ['placeholder="AUTO"', "placeholder={t('editor.placeholderAutoGrid', undefined, 'AUTO')}"],
  ['<option value="start">Start Game / Play</option>', "<option value=\"start\">{t('editor.startGameAction', undefined, 'Start Game / Play')}</option>"],
  ['<option value="leaderboard">Open Leaderboard</option>', "<option value=\"leaderboard\">{t('editor.openLeaderboardAction', undefined, 'Open Leaderboard')}</option>"],
  ['<option value="rules">Open Rules / How to Play</option>', "<option value=\"rules\">{t('editor.openRulesAction', undefined, 'Open Rules / How to Play')}</option>"],
  ['<option value="settings">Open Settings</option>', "<option value=\"settings\">{t('editor.openSettingsAction', undefined, 'Open Settings')}</option>"],
]);

// 5. result-editor/PropertyInspectorPanel.tsx
replaceExact('src/components/studio/games/result-editor/PropertyInspectorPanel.tsx', [
  ['<span className="text-[10px] text-slate-400 font-mono">ID:</span>', "<span className=\"text-[10px] text-slate-400 font-mono\">{t('editor.idLabel', undefined, 'ID:')}</span>"],
  ['<span className="text-slate-400">Total Elements:</span>', "<span className=\"text-slate-400\">{t('editor.totalElements', undefined, 'Total Elements:')}</span>"],
  ['<span className="text-slate-400">Coordinates:</span>', "<span className=\"text-slate-400\">{t('editor.coordinates', undefined, 'Coordinates:')}</span>"],
  ['<h4 className="text-xs font-bold text-slate-300">Add Elements to Canvas</h4>', "<h4 className=\"text-xs font-bold text-slate-300\">{t('editor.addElementsToCanvas', undefined, 'Add Elements to Canvas')}</h4>"],
  ['<h3 className="text-xs font-bold text-slate-200">Screen Background</h3>', "<h3 className=\"text-xs font-bold text-slate-200\">{t('editor.screenBackground', undefined, 'Screen Background')}</h3>"],
]);

console.log('Match-3 and Editor subcomponents migration finished.');
