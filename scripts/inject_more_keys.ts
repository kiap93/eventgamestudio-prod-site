import fs from 'fs';
import path from 'path';

const enPath = path.resolve('src/locales/en.ts');
const zhPath = path.resolve('src/locales/zh-CN.ts');
const msPath = path.resolve('src/locales/ms-MY.ts');

export const moreKeys: Record<string, Record<string, { en: string; zh: string; ms: string }>> = {
  developer: {
    itemsLabel: { en: 'Items', zh: '道具数量', ms: 'Item' },
    catcherBasketAlt: { en: 'Catcher Basket', zh: '接物篮预览', ms: 'Bakul Penyambut' },
    currencyMYR: { en: 'MYR (Malaysian Ringgit)', zh: 'MYR（马来西亚令吉）', ms: 'MYR (Ringgit Malaysia)' },
    currencyUSD: { en: 'USD (US Dollar)', zh: 'USD（美元）', ms: 'USD (Dolar AS)' },
    currencySGD: { en: 'SGD (Singapore Dollar)', zh: 'SGD（新加坡元）', ms: 'SGD (Dolar Singapura)' },
    executeMaintenanceTooltip: {
      en: 'Execute background maintenance job to cancel expired unpaid events and complete expired live events',
      zh: '执行后台维护任务：取消已过期的未支付活动，并完成已过期的实时活动',
      ms: 'Laksanakan tugas penyelenggaraan latar belakang untuk membatalkan acara belum bayar yang tamat tempoh dan melengkapkan acara langsung yang tamat tempoh'
    },
    subjectLabel: { en: 'Subject:', zh: '邮件主题：', ms: 'Subjek:' },
    invitationSubject: { en: 'Invitation to Try EventGameStudio', zh: '邀请体验 EventGameStudio 互动平台', ms: 'Jemputan untuk Mencuba EventGameStudio' },
  },
};

function inject(filePath: string, lang: 'en' | 'zh' | 'ms') {
  let content = fs.readFileSync(filePath, 'utf8');

  for (const [namespace, keys] of Object.entries(moreKeys)) {
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
console.log('Injected more keys.');
