import fs from 'fs';
import path from 'path';

const enPath = path.resolve('src/locales/en.ts');
const zhPath = path.resolve('src/locales/zh-CN.ts');
const msPath = path.resolve('src/locales/ms-MY.ts');

const newInspectorKeys: Record<string, { en: string; zh: string; ms: string }> = {
  cardBgImageOptional: { en: 'Card Background Image (Optional)', zh: '卡牌背景图片（选填）', ms: 'Imej Latar Belakang Kad (Pilihan)' },
  titleText: { en: 'Title Text', zh: '标题文字', ms: 'Teks Tajuk' },
  subtitleText: { en: 'Subtitle Text', zh: '副标题文字', ms: 'Teks Sari Kata' },
  labelField: { en: 'Label', zh: '标签', ms: 'Label' },
  overrideValue: { en: 'Override Value', zh: '自定义数值', ms: 'Nilai Penggantian' },
  valueColor: { en: 'Value Color', zh: '数值颜色', ms: 'Warna Nilai' },
  labelColor: { en: 'Label Color', zh: '标签颜色', ms: 'Warna Label' },
  textColor: { en: 'Text Color', zh: '文字颜色', ms: 'Warna Teks' },
  gridDimensionsMetric: { en: 'Grid Dimensions (e.g. 4×4 Cards)', zh: '网格规格（例：4×4 张卡牌）', ms: 'Dimensi Grid (cth. Kad 4×4)' },
  pairsCountMetric: { en: 'Pairs Count (e.g. 8 Pairs)', zh: '卡牌配对数（例：8 对）', ms: 'Bilangan Pasangan (cth. 8 Pasangan)' },
  timeLimitMetric: { en: 'Time Limit (e.g. 45s)', zh: '时间限制（例：45秒）', ms: 'Had Masa (cth. 45s)' },
  roundsCountMetric: { en: 'Rounds Count', zh: '回合总数', ms: 'Bilangan Pusingan' },
  lightsCountMetric: { en: 'Lights Count', zh: '指示灯数量', ms: 'Bilangan Lampu' },
  targetItemMetric: { en: 'Target Item', zh: '目标道具', ms: 'Item Sasaran' },
  hazardItemMetric: { en: 'Hazard Item', zh: '障碍道具', ms: 'Item Halangan' },
  customTextMetric: { en: 'Custom Text', zh: '自定义文本', ms: 'Teks Tersuai' },
  stackedVertical: { en: 'Stacked (Vertical)', zh: '纵向排列', ms: 'Tegak (Menegak)' },
  sideBySideHorizontal: { en: 'Side-by-Side (Horizontal)', zh: '横向并排', ms: 'Sebelah-menyebelah (Mendatar)' },
  playAgainRestart: { en: 'Play Again (Restart)', zh: '再玩一次（重新开始）', ms: 'Main Semula (Mulakan Semula)' },
  rankHeader: { en: 'Rank (#)', zh: '排名 (#)', ms: 'Kedudukan (#)' },
  scoreHeader: { en: 'Score', zh: '得分', ms: 'Skor' },
  movesHeader: { en: 'Moves', zh: '翻牌步数', ms: 'Langkah' },
  timeHeader: { en: 'Time', zh: '耗时', ms: 'Masa' },
  accuracyHeader: { en: 'Accuracy', zh: '准确率', ms: 'Ketepatan' },
  headerCol: { en: 'Header', zh: '表头', ms: 'Pengepala' },
  scoresCol: { en: 'Scores', zh: '分数', ms: 'Skor' },
  textCol: { en: 'Text', zh: '文字', ms: 'Teks' },
  successMessage: { en: 'Success Message', zh: '提交成功提示', ms: 'Mesej Kejayaan' },
  cardContainer: { en: 'Card Container', zh: '卡片容器', ms: 'Bekas Kad' },
  groupWrapper: { en: 'Group Wrapper', zh: '组合分组', ms: 'Pembalut Kumpulan' },
  textBlock: { en: 'Text Block', zh: '文本块', ms: 'Blok Teks' },
  imageIcon: { en: 'Image / Icon', zh: '图片 / 图标', ms: 'Imej / Ikon' },
  buttonEl: { en: 'Button', zh: '按钮', ms: 'Butang' },
};

function injectKeys(filePath: string, lang: 'en' | 'zh' | 'ms') {
  let content = fs.readFileSync(filePath, 'utf8');
  const nsRegex = /(\n  editor:\s*\{[\s\S]*?)(\n  \},)/;
  const match = content.match(nsRegex);
  if (!match) return;

  const currentBlock = match[1];
  let toAppend = '';

  for (const [key, valObj] of Object.entries(newInspectorKeys)) {
    if (!currentBlock.includes(`\n    ${key}:`)) {
      const val = valObj[lang].replace(/'/g, "\\'");
      toAppend += `    ${key}: '${val}',\n`;
    }
  }

  if (toAppend) {
    content = content.replace(nsRegex, `$1\n${toAppend}  },`);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Injected inspector keys into ${filePath}`);
  }
}

injectKeys(enPath, 'en');
injectKeys(zhPath, 'zh');
injectKeys(msPath, 'ms');

// Helper for exact replacement
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

// Update start-editor/PropertyInspectorPanel.tsx
replaceExact('src/components/studio/games/start-editor/PropertyInspectorPanel.tsx', [
  ['<label className="text-[10px] text-slate-500 font-mono">ROTATION (°)</label>', "<label className=\"text-[10px] text-slate-500 font-mono\">{t('editor.rotation', undefined, 'ROTATION (°)')}</label>"],
  ['<label className="text-[10px] text-slate-500 font-mono">OPACITY (%)</label>', "<label className=\"text-[10px] text-slate-500 font-mono\">{t('editor.opacity', undefined, 'OPACITY (%)')}</label>"],
  ['<label className="text-[10px] text-slate-400 block mb-1">Background Color</label>', "<label className=\"text-[10px] text-slate-400 block mb-1\">{t('editor.backgroundColor', undefined, 'Background Color')}</label>"],
  ['<label className="text-[10px] text-slate-400 block mb-1">Border Radius</label>', "<label className=\"text-[10px] text-slate-400 block mb-1\">{t('editor.borderRadius', undefined, 'Border Radius')}</label>"],
  ['<label className="text-[10px] text-slate-400 block mb-1">Border Width</label>', "<label className=\"text-[10px] text-slate-400 block mb-1\">{t('editor.borderWidth', undefined, 'Border Width')}</label>"],
  ['<label className="text-[10px] text-slate-400 block mb-1">Border Color</label>', "<label className=\"text-[10px] text-slate-400 block mb-1\">{t('editor.borderColor', undefined, 'Border Color')}</label>"],
  ['<label className="text-[10px] text-slate-400 block mb-1">Card Background Image (Optional)</label>', "<label className=\"text-[10px] text-slate-400 block mb-1\">{t('editor.cardBgImageOptional', undefined, 'Card Background Image (Optional)')}</label>"],
  ['<label className="text-[10px] text-slate-400 block mb-1">Title Text</label>', "<label className=\"text-[10px] text-slate-400 block mb-1\">{t('editor.titleText', undefined, 'Title Text')}</label>"],
  ['<label className="text-[10px] text-slate-400 block mb-1">Font Size (px)</label>', "<label className=\"text-[10px] text-slate-400 block mb-1\">{t('editor.fontSize', undefined, 'Font Size (px)')}</label>"],
  ['<label className="text-[10px] text-slate-400 block mb-1">Color</label>', "<label className=\"text-[10px] text-slate-400 block mb-1\">{t('editor.colorLabel', undefined, 'Color')}</label>"],
  ['<label className="text-[10px] text-slate-400 block mb-1">Subtitle Text</label>', "<label className=\"text-[10px] text-slate-400 block mb-1\">{t('editor.subtitleText', undefined, 'Subtitle Text')}</label>"],
  ['<label className="text-[10px] text-slate-400 block mb-1">Content</label>', "<label className=\"text-[10px] text-slate-400 block mb-1\">{t('editor.contentString', undefined, 'Content')}</label>"],
  ['<label className="text-[10px] text-slate-400 block mb-1">Font Size</label>', "<label className=\"text-[10px] text-slate-400 block mb-1\">{t('editor.fontSize', undefined, 'Font Size')}</label>"],
  ['<label className="text-[10px] text-slate-400 block mb-1">Image URL</label>', "<label className=\"text-[10px] text-slate-400 block mb-1\">{t('editor.imageUrl', undefined, 'Image URL')}</label>"],
  ['<label className="text-[10px] text-slate-400 block mb-1">Object Fit</label>', "<label className=\"text-[10px] text-slate-400 block mb-1\">{t('editor.objectFit', undefined, 'Object Fit')}</label>"],
  ['<label className="text-[10px] text-slate-400 block mb-1">Metric Type</label>', "<label className=\"text-[10px] text-slate-400 block mb-1\">{t('editor.metricType', undefined, 'Metric Type')}</label>"],
  ['<option value="grid">Grid Dimensions (e.g. 4×4 Cards)</option>', "<option value=\"grid\">{t('editor.gridDimensionsMetric', undefined, 'Grid Dimensions (e.g. 4×4 Cards)')}</option>"],
  ['<option value="pairs">Pairs Count (e.g. 8 Pairs)</option>', "<option value=\"pairs\">{t('editor.pairsCountMetric', undefined, 'Pairs Count (e.g. 8 Pairs)')}</option>"],
  ['<option value="timer">Time Limit (e.g. 45s)</option>', "<option value=\"timer\">{t('editor.timeLimitMetric', undefined, 'Time Limit (e.g. 45s)')}</option>"],
  ['<option value="rounds">Rounds Count</option>', "<option value=\"rounds\">{t('editor.roundsCountMetric', undefined, 'Rounds Count')}</option>"],
  ['<option value="lights">Lights Count</option>', "<option value=\"lights\">{t('editor.lightsCountMetric', undefined, 'Lights Count')}</option>"],
  ['<option value="target-item">Target Item</option>', "<option value=\"target-item\">{t('editor.targetItemMetric', undefined, 'Target Item')}</option>"],
  ['<option value="hazard-item">Hazard Item</option>', "<option value=\"hazard-item\">{t('editor.hazardItemMetric', undefined, 'Hazard Item')}</option>"],
  ['<option value="custom">Custom Text</option>', "<option value=\"custom\">{t('editor.customTextMetric', undefined, 'Custom Text')}</option>"],
  ['<label className="text-[10px] text-slate-400 block mb-1">Label</label>', "<label className=\"text-[10px] text-slate-400 block mb-1\">{t('editor.labelField', undefined, 'Label')}</label>"],
  ['<label className="text-[10px] text-slate-400 block mb-1">Override Value</label>', "<label className=\"text-[10px] text-slate-400 block mb-1\">{t('editor.overrideValue', undefined, 'Override Value')}</label>"],
  ['<label className="text-[10px] text-slate-400 block mb-1">Value Color</label>', "<label className=\"text-[10px] text-slate-400 block mb-1\">{t('editor.valueColor', undefined, 'Value Color')}</label>"],
  ['<label className="text-[10px] text-slate-400 block mb-1">Label Color</label>', "<label className=\"text-[10px] text-slate-400 block mb-1\">{t('editor.labelColor', undefined, 'Label Color')}</label>"],
  ['<label className="text-[10px] text-slate-400 block mb-1">Button Label</label>', "<label className=\"text-[10px] text-slate-400 block mb-1\">{t('editor.buttonLabel', undefined, 'Button Label')}</label>"],
  ['<label className="text-[10px] text-slate-400 block mb-1">Action Trigger</label>', "<label className=\"text-[10px] text-slate-400 block mb-1\">{t('editor.actionTrigger', undefined, 'Action Trigger')}</label>"],
  ['<label className="text-[10px] text-slate-400 block mb-1">Background</label>', "<label className=\"text-[10px] text-slate-400 block mb-1\">{t('editor.backgroundColor', undefined, 'Background')}</label>"],
  ['<label className="text-[10px] text-slate-400 block mb-1">Text Color</label>', "<label className=\"text-[10px] text-slate-400 block mb-1\">{t('editor.textColor', undefined, 'Text Color')}</label>"],
  ['<label className="text-[10px] text-slate-400 block mb-1">Header Title</label>', "<label className=\"text-[10px] text-slate-400 block mb-1\">{t('editor.headerTitle', undefined, 'Header Title')}</label>"],
  ['<label className="text-[10px] text-slate-400 block mb-1">Description</label>', "<label className=\"text-[10px] text-slate-400 block mb-1\">{t('editor.description', undefined, 'Description')}</label>"],
  ['<label className="text-[10px] text-slate-400 block mb-1">Max Rows</label>', "<label className=\"text-[10px] text-slate-400 block mb-1\">{t('editor.displayedRows', undefined, 'Max Rows')}</label>"],
]);

// Update result-editor/PropertyInspectorPanel.tsx
replaceExact('src/components/studio/games/result-editor/PropertyInspectorPanel.tsx', [
  ['<label className="text-[10px] text-slate-400">Content String</label>', "<label className=\"text-[10px] text-slate-400\">{t('editor.contentString', undefined, 'Content String')}</label>"],
  ['<label className="text-[10px] text-slate-400">Font Family</label>', "<label className=\"text-[10px] text-slate-400\">{t('editor.fontFamily', undefined, 'Font Family')}</label>"],
  ['<label className="text-[10px] text-slate-400">Font Size</label>', "<label className=\"text-[10px] text-slate-400\">{t('editor.fontSize', undefined, 'Font Size')}</label>"],
  ['<span className="text-[10px] text-slate-400">Color:</span>', "<span className=\"text-[10px] text-slate-400\">{t('editor.colorLabel', undefined, 'Color:')}</span>"],
  ['<label className="text-[10px] text-slate-400">Border Radius</label>', "<label className=\"text-[10px] text-slate-400\">{t('editor.borderRadius', undefined, 'Border Radius')}</label>"],
  ['<label className="text-[10px] text-slate-400">Border Width</label>', "<label className=\"text-[10px] text-slate-400\">{t('editor.borderWidth', undefined, 'Border Width')}</label>"],
  ['<span className="text-[10px] text-slate-400">BG Color:</span>', "<span className=\"text-[10px] text-slate-400\">{t('editor.backgroundColor', undefined, 'BG Color:')}</span>"],
  ['<span className="text-[10px] text-slate-400">Border Color:</span>', "<span className=\"text-[10px] text-slate-400\">{t('editor.borderColor', undefined, 'Border Color:')}</span>"],
  ['<span className="text-[10px] text-slate-400">Background Image:</span>', "<span className=\"text-[10px] text-slate-400\">{t('editor.backgroundImage', undefined, 'Background Image:')}</span>"],
  ['<label className="text-[10px] text-slate-400">Custom Label</label>', "<label className=\"text-[10px] text-slate-400\">{t('editor.customLabel', undefined, 'Custom Label')}</label>"],
  ['<label className="text-[10px] text-slate-400">Layout</label>', "<label className=\"text-[10px] text-slate-400\">{t('editor.layout', undefined, 'Layout')}</label>"],
  ['<option value="vertical">Stacked (Vertical)</option>', "<option value=\"vertical\">{t('editor.stackedVertical', undefined, 'Stacked (Vertical)')}</option>"],
  ['<option value="horizontal">Side-by-Side (Horizontal)</option>', "<option value=\"horizontal\">{t('editor.sideBySideHorizontal', undefined, 'Side-by-Side (Horizontal)')}</option>"],
  ['<label className="text-[10px] text-slate-400">Value Font Size</label>', "<label className=\"text-[10px] text-slate-400\">{t('editor.valueFontSize', undefined, 'Value Font Size')}</label>"],
  ['<span className="text-[10px] text-slate-400">Label Color:</span>', "<span className=\"text-[10px] text-slate-400\">{t('editor.labelColor', undefined, 'Label Color:')}</span>"],
  ['<span className="text-[10px] text-slate-400">Value Color:</span>', "<span className=\"text-[10px] text-slate-400\">{t('editor.valueColor', undefined, 'Value Color:')}</span>"],
  ['<label className="text-[10px] text-slate-400">Image URL</label>', "<label className=\"text-[10px] text-slate-400\">{t('editor.imageUrl', undefined, 'Image URL')}</label>"],
  ['<label className="text-[10px] text-slate-400">Button Label</label>', "<label className=\"text-[10px] text-slate-400\">{t('editor.buttonLabel', undefined, 'Button Label')}</label>"],
  ['<label className="text-[10px] text-slate-400">Action</label>', "<label className=\"text-[10px] text-slate-400\">{t('editor.actionTrigger', undefined, 'Action')}</label>"],
  ['<option value="playAgain">Play Again (Restart)</option>', "<option value=\"playAgain\">{t('editor.playAgainRestart', undefined, 'Play Again (Restart)')}</option>"],
  ['<option value="exit">Exit Game</option>', "<option value=\"exit\">{t('editor.exitGame', undefined, 'Exit Game')}</option>"],
  ['<label className="text-[10px] text-slate-400">Corner Radius</label>', "<label className=\"text-[10px] text-slate-400\">{t('editor.cornerRadius', undefined, 'Corner Radius')}</label>"],
  ['<span className="text-[10px] text-slate-400">Text Color:</span>', "<span className=\"text-[10px] text-slate-400\">{t('editor.textColor', undefined, 'Text Color:')}</span>"],
  ['<label className="text-[10px] text-slate-400">Header Title</label>', "<label className=\"text-[10px] text-slate-400\">{t('editor.headerTitle', undefined, 'Header Title')}</label>"],
  ['<label className="text-[10px] text-slate-400">Displayed Rows</label>', "<label className=\"text-[10px] text-slate-400\">{t('editor.displayedRows', undefined, 'Displayed Rows')}</label>"],
  ['<span className="text-[11px]">Rank (#)</span>', "<span className=\"text-[11px]\">{t('editor.rankHeader', undefined, 'Rank (#)')}</span>"],
  ['<span className="text-[11px]">Player Name</span>', "<span className=\"text-[11px]\">{t('editor.playerName', undefined, 'Player Name')}</span>"],
  ['<span className="text-[11px]">Score</span>', "<span className=\"text-[11px]\">{t('editor.scoreHeader', undefined, 'Score')}</span>"],
  ['<span className="text-[11px]">Moves</span>', "<span className=\"text-[11px]\">{t('editor.movesHeader', undefined, 'Moves')}</span>"],
  ['<span className="text-[11px]">Time</span>', "<span className=\"text-[11px]\">{t('editor.timeHeader', undefined, 'Time')}</span>"],
  ['<span className="text-[11px]">Accuracy</span>', "<span className=\"text-[11px]\">{t('editor.accuracyHeader', undefined, 'Accuracy')}</span>"],
  ['<label className="text-[10px] text-slate-400">Base Font Size</label>', "<label className=\"text-[10px] text-slate-400\">{t('editor.baseFontSize', undefined, 'Base Font Size')}</label>"],
  ['<span className="text-[9px] text-slate-400 block">Header</span>', "<span className=\"text-[9px] text-slate-400 block\">{t('editor.headerCol', undefined, 'Header')}</span>"],
  ['<span className="text-[9px] text-slate-400 block">Scores</span>', "<span className=\"text-[9px] text-slate-400 block\">{t('editor.scoresCol', undefined, 'Scores')}</span>"],
  ['<span className="text-[9px] text-slate-400 block">Text</span>', "<span className=\"text-[9px] text-slate-400 block\">{t('editor.textCol', undefined, 'Text')}</span>"],
  ['<label className="text-[10px] text-slate-400">Input Placeholder</label>', "<label className=\"text-[10px] text-slate-400\">{t('editor.inputPlaceholder', undefined, 'Input Placeholder')}</label>"],
  ['<label className="text-[10px] text-slate-400">Max Name Length</label>', "<label className=\"text-[10px] text-slate-400\">{t('editor.maxNameLength', undefined, 'Max Name Length')}</label>"],
  ['<label className="text-[10px] text-slate-400">Success Message</label>', "<label className=\"text-[10px] text-slate-400\">{t('editor.successMessage', undefined, 'Success Message')}</label>"],
  ['<span className="truncate">Card Container</span>', "<span className=\"truncate\">{t('editor.cardContainer', undefined, 'Card Container')}</span>"],
  ['<span className="truncate">Group Wrapper</span>', "<span className=\"truncate\">{t('editor.groupWrapper', undefined, 'Group Wrapper')}</span>"],
  ['<span className="truncate">Text Block</span>', "<span className=\"truncate\">{t('editor.textBlock', undefined, 'Text Block')}</span>"],
  ['<span className="truncate">Image / Icon</span>', "<span className=\"truncate\">{t('editor.imageIcon', undefined, 'Image / Icon')}</span>"],
  ['<span className="truncate">Button</span>', "<span className=\"truncate\">{t('editor.buttonEl', undefined, 'Button')}</span>"],
  ['<label className="text-[10px] text-slate-400">Background Type</label>', "<label className=\"text-[10px] text-slate-400\">{t('editor.backgroundType', undefined, 'Background Type')}</label>"],
  ['<span className="text-[11px] text-slate-300">Solid Color:</span>', "<span className=\"text-[11px] text-slate-300\">{t('editor.solidColor', undefined, 'Solid Color:')}</span>"],
]);

console.log('All Property Inspector labels successfully migrated.');
