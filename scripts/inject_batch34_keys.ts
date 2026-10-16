import fs from 'fs';
import path from 'path';

const enPath = path.resolve('src/locales/en.ts');
const zhPath = path.resolve('src/locales/zh-CN.ts');
const msPath = path.resolve('src/locales/ms-MY.ts');

export const batch34Keys: Record<string, Record<string, { en: string; zh: string; ms: string }>> = {
  customizers: {
    currentCatcher: { en: 'Current Catcher', zh: '当前接物篮', ms: 'Penyambut Semasa' },
  },
  studio: {
    gameBgPreviewAlt: { en: 'Game Background Preview', zh: '游戏背景预览', ms: 'Pratonton Latar Belakang Permainan' },
    cardBackPreviewAlt: { en: 'Card Back Preview', zh: '卡牌背面预览', ms: 'Pratonton Belakang Kad' },
    clientLogoPreviewAlt: { en: 'Client Logo Preview', zh: '客户标识预览', ms: 'Pratonton Logo Pelanggan' },
    clientLogoAlt: { en: 'Client Logo', zh: '客户品牌标识', ms: 'Logo Pelanggan' },
  },
  landing: {
    homeAria: { en: 'EventGameStudio Home', zh: 'EventGameStudio 首页', ms: 'Laman Utama EventGameStudio' },
  },
  contact: {
    website: { en: 'Website', zh: '官方网站', ms: 'Laman Web' },
  },
};

function inject(filePath: string, lang: 'en' | 'zh' | 'ms') {
  let content = fs.readFileSync(filePath, 'utf8');

  for (const [namespace, keys] of Object.entries(batch34Keys)) {
    const nsRegex = new RegExp(`(\\n  ${namespace}:\\s*\\{[\\s\\S]*?)(\\n  \\},)`);
    const match = content.match(nsRegex);
    if (!match) continue;

    const currentBlock = match[1];
    let toAppend = '';

    for (const [key, valObj] of Object.entries(keys)) {
      if (!currentBlock.includes(`\n    ${key}:`)) {
        const val = valObj[lang].replace(/'/g, "\\'");
        toAppend += `    ${key}: '${val}',\n`;
      }
    }

    if (toAppend) {
      content = content.replace(nsRegex, `$1\n${toAppend}  },`);
    }
  }

  fs.writeFileSync(filePath, content, 'utf8');
}

inject(enPath, 'en');
inject(zhPath, 'zh');
inject(msPath, 'ms');
console.log('Injected batch 3 & 4 keys.');
