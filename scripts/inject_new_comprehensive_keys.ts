import fs from 'fs';
import path from 'path';

const enPath = path.resolve('src/locales/en.ts');
const zhPath = path.resolve('src/locales/zh-CN.ts');
const msPath = path.resolve('src/locales/ms-MY.ts');

export const keyBundles: Record<string, Record<string, { en: string; zh: string; ms: string }>> = {
  common: {
    left: { en: 'Left', zh: '居左', ms: 'Kiri' },
    center: { en: 'Center', zh: '居中', ms: 'Tengah' },
    right: { en: 'Right', zh: '居右', ms: 'Kanan' },
    top: { en: 'Top', zh: '顶部', ms: 'Atas' },
    middle: { en: 'Middle', zh: '居中', ms: 'Tengah' },
    bottom: { en: 'Bottom', zh: '底部', ms: 'Bawah' },
    both: { en: 'Both', zh: '水平与垂直', ms: 'Kedua-duanya' },
    deselectAll: { en: 'Deselect All', zh: '取消全部选中', ms: 'Nyahpilih Semua' },
    add: { en: 'Add', zh: '添加', ms: 'Tambah' },
  },
  editor: {
    multiSelection: { en: 'Multi-Selection ({{count}})', zh: '多选元素 ({{count}})', ms: 'Pelbagai Pilihan ({{count}})' },
    elementsSelectedCount: { en: '{{count}} Elements Selected', zh: '已选中 {{count}} 个元素', ms: '{{count}} Elemen Dipilih' },
    unlockAll: { en: 'Unlock All', zh: '全部解锁', ms: 'Buka Kunci Semua' },
    lockAll: { en: 'Lock All', zh: '全部锁定', ms: 'Kunci Semua' },
    alignAndDistribute: { en: 'Align & Distribute', zh: '对齐与均分', ms: 'Jajar & Agih' },
    expandLayersPanel: { en: 'Expand Layers Panel', zh: '展开图层面板', ms: 'Kembangkan Panel Lapisan' },
    addNewRootElement: { en: 'Add New Root Element', zh: '添加顶级元素', ms: 'Tambah Elemen Induk Baharu' },
    stackingHierarchy: { en: 'Stacking hierarchy', zh: '层级排列', ms: 'Hierarki susunan' },
    uploadingBgImage: { en: 'Uploading Image...', zh: '正在上传图片...', ms: 'Memuat naik Imej...' },
    uploadBgImage: { en: 'Upload Background Image', zh: '上传背景图片', ms: 'Muat Naik Imej Latar' },
    colorLabel: { en: 'Color', zh: '颜色', ms: 'Warna' },
    themeMode: { en: 'Theme', zh: '主题', ms: 'Tema' },
    colorMode: { en: 'Color', zh: '纯色', ms: 'Warna' },
    imageMode: { en: 'Image', zh: '图片', ms: 'Imej' },
  },
  developer: {
    quickSetupStandardTiers: { en: 'Quick Setup Tiers', zh: '快捷预设档位', ms: 'Penyediaan Pantas Tahap' },
    pricingCountry: { en: 'Pricing Country', zh: '资费国家/地区', ms: 'Negara Penetapan Harga' },
    quickSwitch: { en: 'Quick Switch:', zh: '快速切换：', ms: 'Pantas Tukar:' },
    loadingGamePricingTiers: { en: 'Loading game pricing tiers...', zh: '正在加载游戏资费档位...', ms: 'Memuatkan tahap harga permainan...' },
    baseTier: { en: 'Base Tier', zh: '基础档位', ms: 'Tahap Asas' },
    perEventActivation: { en: 'per event activation', zh: '每次活动上线', ms: 'setiap pengaktifan acara' },
    startDateInclusive: { en: 'Start Date (Inclusive)', zh: '开始日期（含）', ms: 'Tarikh Mula (Termasuk)' },
    endDateInclusive: { en: 'End Date (Inclusive)', zh: '结束日期（含）', ms: 'Tarikh Tamat (Termasuk)' },
    totalCalendarDays: { en: 'Total Calendar Days:', zh: '日历天数总计：', ms: 'Jumlah Hari Kalendar:' },
    calculatedEventPrice: { en: 'Calculated Event Price', zh: '计算活动总价', ms: 'Harga Acara Dikira' },
    avgPerDay: { en: 'Avg / Day', zh: '日均', ms: 'Purata / Hari' },
    defaultFallback: { en: 'Default Fallback:', zh: '默认回退国家：', ms: 'Pilihan Lalai Sandaran:' },
    authoritativePriceRuleDesc: { en: 'Prices are locked into event records at creation time. Historical events preserve their original locked price. Events in unconfigured countries fall back to the Default Fallback Country.', zh: '资费在活动创建时锁定并写入记录。历史活动始终保留其原始锁定资费。未独立配置资费的国家将回退至默认资费。', ms: 'Harga dikunci ke dalam rekod acara semasa penciptaan. Acara sejarah mengekalkan harga terkunci asal. Acara di negara yang belum dikonfigurasikan kembali kepada Negara Sandaran Lalai.' },
    defaultBasePriceAmount: { en: 'Default Base Price Amount', zh: '默认基础资费金额', ms: 'Jumlah Harga Asas Lalai' },
    currencyCode: { en: 'Currency Code', zh: '货币代码', ms: 'Kod Mata Wang' },
    platformEvents: { en: 'Platform Events', zh: '平台活动', ms: 'Acara Platform' },
    customOverrides: { en: 'Custom Overrides', zh: '自定义覆盖', ms: 'Penggantian Tersuai' },
    creditCoverage: { en: 'Credit Coverage', zh: '额度抵扣上限', ms: 'Liputan Kredit' },
    deliveredTo: { en: 'Delivered To:', zh: '已送达至：', ms: 'Dihantar Kepada:' },
    mailtoTarget: { en: 'Mailto Target:', zh: '邮件发送目标：', ms: 'Sasaran Mailto:' },
    colMember: { en: 'Member', zh: '成员', ms: 'Ahli' },
    colEmail: { en: 'Email', zh: '邮箱', ms: 'Emel' },
    colRole: { en: 'Role', zh: '角色', ms: 'Peranan' },
    colJoinedDate: { en: 'Joined Date', zh: '加入日期', ms: 'Tarikh Sertai' },
    colEventTitle: { en: 'Event Title', zh: '活动名称', ms: 'Tajuk Acara' },
    colGame: { en: 'Game', zh: '游戏', ms: 'Permainan' },
    colStatus: { en: 'Status', zh: '状态', ms: 'Status' },
    colEventPrice: { en: 'Event Price', zh: '活动资费', ms: 'Harga Acara' },
    colCreated: { en: 'Created', zh: '创建时间', ms: 'Dicipta' },
    colPublicLink: { en: 'Public Link', zh: '公开链接', ms: 'Pautan Awam' },
    sourceOfTruth: { en: 'Source of Truth', zh: '数据基准', ms: 'Sumber Kebenaran' },
    colTypeDesc: { en: 'Type / Description', zh: '类型 / 说明', ms: 'Jenis / Penerangan' },
    colAmount: { en: 'Amount', zh: '金额', ms: 'Jumlah' },
    colBalanceAfter: { en: 'Balance After', zh: '变动后余额', ms: 'Baki Selepas' },
    colReference: { en: 'Reference', zh: '交易凭证', ms: 'Rujukan' },
    colTimestamp: { en: 'Timestamp', zh: '时间戳', ms: 'Cap Masa' },
    colStatusTime: { en: 'Status & Time', zh: '状态与时间', ms: 'Status & Masa' },
    colCorrelationId: { en: 'Request / Correlation ID', zh: '请求 / 追踪编号', ms: 'ID Permintaan / Korelasi' },
    colMethodEndpoint: { en: 'Method & Endpoint', zh: '请求方式与接口', ms: 'Kaedah & Titik Akhir' },
    colService: { en: 'Service', zh: '服务模块', ms: 'Perkhidmatan' },
    colErrorMessage: { en: 'Error Message / Type', zh: '错误信息 / 类型', ms: 'Mesej / Jenis Ralat' },
    activeFiltersApplied: { en: 'Active filters applied', zh: '已应用筛选条件', ms: 'Penapis aktif digunakan' },
    resetFilters: { en: 'Reset Filters', zh: '重置筛选', ms: 'Tetapkan Semula Penapis' },
    loadingApiErrorLogs: { en: 'Loading API error audit logs...', zh: '正在加载 API 错误审计日志...', ms: 'Memuatkan log audit ralat API...' },
    deliveringViaResend: { en: 'Delivering via Resend...', zh: '正在通过 Resend 发送...', ms: 'Menghantar melalui Resend...' },
    sendInvitationToRecipients: { en: 'Send Invitation to {{count}} Recipient(s)', zh: '向 {{count}} 位收件人发送邀请', ms: 'Hantar Jemputan kepada {{count}} Penerima' },
    companyNameRequired: { en: 'Company Name *', zh: '公司名称 *', ms: 'Nama Syarikat *' },
    contactPersonOptional: { en: 'Contact Person (Optional)', zh: '联系人姓名（选填）', ms: 'Orang Untuk Dihubungi (Pilihan)' },
    recipientEmailAddressesRequired: { en: 'Recipient Email Addresses * (At least 1 required)', zh: '收件人邮箱地址 *（至少填写 1 个）', ms: 'Alamat Emel Penerima * (Sekurang-kurangnya 1 diperlukan)' },
    lblEvent: { en: 'Event:', zh: '活动：', ms: 'Acara:' } as any,
    lblOrg: { en: 'Organization:', zh: '机构：', ms: 'Organisasi:' } as any,
    lblOwner: { en: 'Owner:', zh: '创建者：', ms: 'Pemilik:' } as any,
    lblPublished: { en: 'Published:', zh: '发布时间：', ms: 'Diterbitkan:' } as any,
    blockShowcase: { en: 'Block Showcase', zh: '屏蔽案例', ms: 'Sekat Pameran' },
    unblockShowcase: { en: 'Unblock Showcase', zh: '解除屏蔽', ms: 'Nyahsekat Pameran' },
    softDeleteShowcase: { en: 'Soft Delete Showcase', zh: '软删除案例', ms: 'Padam Lembut Pameran' },
    platformTitle: { en: 'Platform', zh: '平台中心', ms: 'Platform' },
    adminFooterNote: { en: 'Brand Engagement Games Platform • Developer Administration Architecture', zh: '品牌互动游戏平台 • 开发者管理架构', ms: 'Platform Permainan Penglibatan Jenama • Seni Bina Pentadbiran Pembangun' },
  },
  customizers: {
    quickColorPresets: { en: 'Quick Color Presets', zh: '常用预设颜色', ms: 'Pratetap Warna Pantas' },
    backgroundOpacity: { en: 'Background Opacity', zh: '背景不透明度', ms: 'Kelegapan Latar Belakang' },
    transparentPct: { en: '0% (Transparent)', zh: '0%（完全透明）', ms: '0% (Lutsinar)' },
    solidPct: { en: '100% (Solid)', zh: '100%（完全不透明）', ms: '100% (Legap)' },
    interactiveScaledCanvasPreview: { en: 'Interactive Scaled Canvas Preview (1024 × 576)', zh: '交互式缩放画布实时预览 (1024 × 576)', ms: 'Pratonton Kanvas Berskala Interaktif (1024 × 576)' },
  },
  landing: {
    stagePreviewAlt: { en: 'Catch the Brand Stage Preview', zh: '品牌接接乐游戏舞台预览', ms: 'Pratonton Peringkat Catch the Brand' },
    collectibleItemAlt: { en: 'Collectible Item', zh: '得分收集道具', ms: 'Item Kutipan' },
    bonusItemAlt: { en: 'Bonus Item', zh: '奖励加分道具', ms: 'Item Bonus' },
    playerCatcherAlt: { en: 'Player Catcher', zh: '接取道具篮', ms: 'Penyambut Pemain' },
    collectItemAlt: { en: 'Collect item', zh: '得分收集道具', ms: 'Item kutipan' },
    hazardItemAlt: { en: 'Hazard item', zh: '扣分障碍道具', ms: 'Item halangan' },
    catcherAlt: { en: 'Catcher', zh: '接物篮', ms: 'Penyambut' },
    normalItemAlt: { en: 'Normal item', zh: '常规得分道具', ms: 'Item biasa' },
  },
  game: {
    cardBackAlt: { en: 'Card Back', zh: '卡牌背面', ms: 'Belakang Kad' },
    addThemesGuide: { en: 'Add new themes cleanly by creating a configuration object in src/themes/', zh: '在 src/themes/ 中创建配置对象以快速添加新主题：', ms: 'Tambah tema baharu dengan mencipta objek konfigurasi dalam src/themes/:' },
  },
};

function injectKeysIntoFile(filePath: string, lang: 'en' | 'zh' | 'ms') {
  let content = fs.readFileSync(filePath, 'utf8');

  for (const [namespace, keys] of Object.entries(keyBundles)) {
    // Find namespace block: e.g. "  namespace: {\n"
    const nsRegex = new RegExp(`(\\n  ${namespace}:\\s*\\{[\\s\\S]*?)(\\n  \\},)`);
    const match = content.match(nsRegex);
    if (!match) {
      console.warn(`Namespace ${namespace} not found in ${filePath}`);
      continue;
    }

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
  console.log(`Updated ${filePath} for ${lang}`);
}

injectKeysIntoFile(enPath, 'en');
injectKeysIntoFile(zhPath, 'zh');
injectKeysIntoFile(msPath, 'ms');

console.log('Successfully injected synchronized keys into all three locale files!');
