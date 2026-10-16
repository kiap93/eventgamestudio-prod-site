import fs from 'fs';
import path from 'path';

const enPath = path.resolve('src/locales/en.ts');
const zhPath = path.resolve('src/locales/zh-CN.ts');
const msPath = path.resolve('src/locales/ms-MY.ts');

const newPassKeys: Record<string, Record<string, { en: string; zh: string; ms: string }>> = {
  common: {
    show: { en: 'Show', zh: '显示', ms: 'Papar' },
  },
  editor: {
    containedChildren: { en: 'Contained Children:', zh: '包含子元素：', ms: 'Elemen Anak Terkandung:' },
    contain: { en: 'Contain', zh: '等比包含', ms: 'Muat (Contain)' },
    cover: { en: 'Cover', zh: '等比覆盖', ms: 'Liput (Cover)' },
    fill: { en: 'Fill', zh: '拉伸铺满', ms: 'Penuh (Fill)' },
    placeholderAutoGrid: { en: 'AUTO (e.g. GRID)', zh: '自动 (例：GRID)', ms: 'AUTO (cth. GRID)' },
    unpackGroupTooltip: { en: 'Unpack group children into parent coordinate system (Ctrl+Shift+G)', zh: '将分组子元素释放到上层坐标系 (Ctrl+Shift+G)', ms: 'Bongkar elemen anak kumpulan ke sistem koordinat induk (Ctrl+Shift+G)' },
    childrenInGroup: { en: 'Children in this group:', zh: '本组内子元素：', ms: 'Elemen anak dalam kumpulan ini:' },
  },
  developer: {
    requestedCountry: { en: 'Requested Country:', zh: '请求国家/地区：', ms: 'Negara Diminta:' },
    matchedRule: { en: 'Matched Rule:', zh: '匹配定价规则：', ms: 'Peraturan Sepadan:' },
    activeTierCheckbox: { en: 'Active Tier', zh: '启用档位', ms: 'Tahap Aktif' },
    baseTierCheckbox: { en: 'Base Tier (Primary 1-day quote)', zh: '基础档位（主要1天报价基准）', ms: 'Tahap Asas (Sebut harga utama 1 hari)' },
    unlimitedMaxDays: { en: 'Unlimited (e.g. 31+)', zh: '无上限（例：31天及以上）', ms: 'Tanpa Had (cth. 31+)' },
    colDateTime: { en: 'Date / Time', zh: '日期 / 时间', ms: 'Tarikh / Masa' },
    colRecipientEmail: { en: 'Recipient Email', zh: '收件人邮箱', ms: 'Emel Penerima' },
    colProvider: { en: 'Provider', zh: '发信服务商', ms: 'Penyedia' },
    colDetails: { en: 'Details', zh: '详细信息', ms: 'Butiran' },
    emailAlreadyAssociatedTitle: { en: 'Email Already Associated With Another Company', zh: '该邮箱已被其他公司关联', ms: 'Emel Sudah Dikaitkan Dengan Syarikat Lain' },
    existingCompanyLabel: { en: 'Existing company:', zh: '现有公司：', ms: 'Syarikat sedia ada:' },
    linkCopied: { en: 'Link copied', zh: '链接已复制', ms: 'Pautan disalin' },
    serviceDedicatedResend: { en: 'Service: Dedicated Resend API', zh: '发送通道：专享 Resend API', ms: 'Perkhidmatan: API Resend Khas' },
    configuredViaResend: { en: 'Configured via RESEND_INVITATION_FROM (Resend)', zh: '通过环境变量 RESEND_INVITATION_FROM 配置 (Resend)', ms: 'Dikonfigurasikan melalui RESEND_INVITATION_FROM (Resend)' },
  },
};

function inject(filePath: string, lang: 'en' | 'zh' | 'ms') {
  let content = fs.readFileSync(filePath, 'utf8');

  for (const [namespace, keys] of Object.entries(newPassKeys)) {
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
console.log('Injected final pass keys.');

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
  ['<span>Contained Children:</span>', "<span>{t('editor.containedChildren', undefined, 'Contained Children:')}</span>"],
  ['<option value="contain">Contain</option>', "<option value=\"contain\">{t('editor.contain', undefined, 'Contain')}</option>"],
  ['<option value="cover">Cover</option>', "<option value=\"cover\">{t('editor.cover', undefined, 'Cover')}</option>"],
  ['<option value="fill">Fill</option>', "<option value=\"fill\">{t('editor.fill', undefined, 'Fill')}</option>"],
  ['placeholder="AUTO (e.g. GRID)"', "placeholder={t('editor.placeholderAutoGrid', undefined, 'AUTO (e.g. GRID)')}"],
]);

// 2. result-editor/PropertyInspectorPanel.tsx
replaceExact('src/components/studio/games/result-editor/PropertyInspectorPanel.tsx', [
  ['<span className="text-[10px] text-slate-500 font-mono">Dynamic Ranking</span>', "<span className=\"text-[10px] text-slate-500 font-mono\">{t('editor.eventLeaderboardDesc', undefined, 'Dynamic Ranking')}</span>"],
  ['<span className="text-[10px] text-slate-400">Show</span>', "<span className=\"text-[10px] text-slate-400\">{t('common.show', undefined, 'Show')}</span>"],
  ['title="Unpack group children into parent coordinate system (Ctrl+Shift+G)"', "title={t('editor.unpackGroupTooltip', undefined, 'Unpack group children into parent coordinate system (Ctrl+Shift+G)')}"],
  ['<span className="text-[10px] text-slate-400 font-semibold block">Children in this group:</span>', "<span className=\"text-[10px] text-slate-400 font-semibold block\">{t('editor.childrenInGroup', undefined, 'Children in this group:')}</span>"],
  ['<span className="text-[10px] text-slate-500 italic">No children</span>', "<span className=\"text-[10px] text-slate-500 italic\">{t('editor.noChildren', undefined, 'No children')}</span>"],
]);

// 3. DeveloperGamePricingManager.tsx
replaceExact('src/components/developer/DeveloperGamePricingManager.tsx', [
  ['<span>United States (USD)</span>', "<span>{getCountryDisplayName('US')} (USD)</span>"],
  ['<span>Malaysia (MYR)</span>', "<span>{getCountryDisplayName('MY')} (MYR)</span>"],
  ['<h3 className="text-sm font-bold text-white">Duration Simulator</h3>', "<h3 className=\"text-sm font-bold text-white\">{t('developer.durationPricingSimulator', undefined, 'Duration Simulator')}</h3>"],
  ['<span>Start Date (Inclusive)</span>', "<span>{t('developer.startDateInclusive', undefined, 'Start Date (Inclusive)')}</span>"],
  ['<span>End Date (Inclusive)</span>', "<span>{t('developer.endDateInclusive', undefined, 'End Date (Inclusive)')}</span>"],
  ['<span className="text-slate-400">Requested Country:</span>', "<span className=\"text-slate-400\">{t('developer.requestedCountry', undefined, 'Requested Country:')}</span>"],
  ['<span className="text-slate-400">Matched Rule:</span>', "<span className=\"text-slate-400\">{t('developer.matchedRule', undefined, 'Matched Rule:')}</span>"],
  ['<span className="text-[10px] text-slate-500 uppercase tracking-wider block">Calculated Event Price</span>', "<span className=\"text-[10px] text-slate-500 uppercase tracking-wider block\">{t('developer.calculatedEventPrice', undefined, 'Calculated Event Price')}</span>"],
  ['<span className="text-[10px] text-slate-500 block">Avg / Day</span>', "<span className=\"text-[10px] text-slate-500 block\">{t('developer.avgPerDay', undefined, 'Avg / Day')}</span>"],
  ['<span>Active Tier</span>', "<span>{t('developer.activeTierCheckbox', undefined, 'Active Tier')}</span>"],
  ['<span>Base Tier (Primary 1-day quote)</span>', "<span>{t('developer.baseTierCheckbox', undefined, 'Base Tier (Primary 1-day quote)')}</span>"],
  ['<span>Unlimited (e.g. 31+)</span>', "<span>{t('developer.unlimitedMaxDays', undefined, 'Unlimited (e.g. 31+)')}</span>"],
  ['<label className="text-xs font-semibold text-slate-300 block mb-1">Minimum Days</label>', "<label className=\"text-xs font-semibold text-slate-300 block mb-1\">{t('developer.minDaysHeader', undefined, 'Minimum Days')}</label>"],
]);

// 4. DeveloperShowcaseReviews.tsx
replaceExact('src/components/developer/DeveloperShowcaseReviews.tsx', [
  ['<span className="text-emerald-400 font-bold">Link copied</span>', "<span className=\"text-emerald-400 font-bold\">{t('developer.linkCopied', undefined, 'Link copied')}</span>"],
  ['<h3 className="text-base font-bold text-white">Block Showcase</h3>', "<h3 className=\"text-base font-bold text-white\">{t('developer.blockShowcase', undefined, 'Block Showcase')}</h3>"],
  ['<h3 className="text-base font-bold text-white">Unblock Showcase</h3>', "<h3 className=\"text-base font-bold text-white\">{t('developer.unblockShowcase', undefined, 'Unblock Showcase')}</h3>"],
  ['<h3 className="text-base font-bold text-white">Soft Delete Showcase</h3>', "<h3 className=\"text-base font-bold text-white\">{t('developer.softDeleteShowcase', undefined, 'Soft Delete Showcase')}</h3>"],
]);

// 5. DeveloperCustomerInvitations.tsx
replaceExact('src/components/developer/invitations/DeveloperCustomerInvitations.tsx', [
  ['<h3 className="text-base font-bold text-white">Send Customer Invitation</h3>', "<h3 className=\"text-base font-bold text-white\">{t('developer.sendInvitationModalTitle', undefined, 'Send Customer Invitation')}</h3>"],
  ['<span className="text-slate-500">Service: Dedicated Resend API</span>', "<span className=\"text-slate-500\">{t('developer.serviceDedicatedResend', undefined, 'Service: Dedicated Resend API')}</span>"],
  ['Configured via RESEND_INVITATION_FROM (Resend)', "{t('developer.configuredViaResend', undefined, 'Configured via RESEND_INVITATION_FROM (Resend)')}"],
  ['<span>Email Already Associated With Another Company</span>', "<span>{t('developer.emailAlreadyAssociatedTitle', undefined, 'Email Already Associated With Another Company')}</span>"],
  ['<span className="text-slate-500">Existing company:</span>', "<span className=\"text-slate-500\">{t('developer.existingCompanyLabel', undefined, 'Existing company:')}</span>"],
  ['<th className="py-2.5 px-3">Date / Time</th>', "<th className=\"py-2.5 px-3\">{t('developer.colDateTime', undefined, 'Date / Time')}</th>"],
  ['<th className="py-2.5 px-3">Recipient Email</th>', "<th className=\"py-2.5 px-3\">{t('developer.colRecipientEmail', undefined, 'Recipient Email')}</th>"],
  ['<th className="py-2.5 px-3">Provider</th>', "<th className=\"py-2.5 px-3\">{t('developer.colProvider', undefined, 'Provider')}</th>"],
  ['<th className="py-2.5 px-3">Status</th>', "<th className=\"py-2.5 px-3\">{t('common.status', undefined, 'Status')}</th>"],
  ['<th className="py-2.5 px-3">Details</th>', "<th className=\"py-2.5 px-3\">{t('developer.colDetails', undefined, 'Details')}</th>"],
]);

console.log('Final pass migration complete!');
