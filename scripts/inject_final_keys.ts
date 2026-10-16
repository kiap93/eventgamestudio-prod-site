import fs from 'fs';
import path from 'path';

const enPath = path.resolve('src/locales/en.ts');
const zhPath = path.resolve('src/locales/zh-CN.ts');
const msPath = path.resolve('src/locales/ms-MY.ts');

export const finalKeys: Record<string, Record<string, { en: string; zh: string; ms: string }>> = {
  customizers: {
    cardDimensionsShapeRotation: { en: 'Card Dimensions, Shape & Rotation', zh: '卡牌尺寸、形状与旋转', ms: 'Dimensi Kad, Bentuk & Putaran' },
    comboStreakBonus: { en: 'Combo Streak Bonus', zh: '连击连胜奖励', ms: 'Bonus Rentetan Kombo' },
    leaderboardSocialDisplay: { en: 'Leaderboard & Social Display', zh: '排行榜与社交展示', ms: 'Papan Pendahulu & Paparan Sosial' },
    memorySoundFxPreviews: { en: 'Memory Sound FX Previews', zh: '记忆翻牌音效试听', ms: 'Pratonton Kesan Bunyi Memori' },
  },
  developer: {
    sendCustomerInvitationBtn: { en: 'Send Customer Invitation', zh: '发送客户邀请', ms: 'Hantar Jemputan Pelanggan' },
    addTier: { en: 'Add Tier', zh: '添加档位', ms: 'Tambah Tahap' },
    lblReason: { en: 'Reason:', zh: '原因：', ms: 'Sebab:' },
  },
};

function inject(filePath: string, lang: 'en' | 'zh' | 'ms') {
  let content = fs.readFileSync(filePath, 'utf8');

  for (const [namespace, keys] of Object.entries(finalKeys)) {
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
console.log('Injected final batch keys.');
