import fs from 'fs';
import path from 'path';

const enPath = path.resolve('src/locales/en.ts');
const zhPath = path.resolve('src/locales/zh-CN.ts');
const msPath = path.resolve('src/locales/ms-MY.ts');

export const remainingTranslations: Record<string, { en: Record<string, string>; zh: Record<string, string>; ms: Record<string, string> }> = {
  studio: {
    en: {
      dragToResizeWidth: 'Drag to resize width',
    },
    zh: {
      dragToResizeWidth: '拖动调整宽度',
    },
    ms: {
      dragToResizeWidth: 'Seret untuk mengubah saiz lebar',
    },
  },
  gamesCatalog: {
    en: {
      platformGameCatalog: 'Platform Game Catalog',
      searchPlaceholder: 'Search games by title, type, or tags...',
      allGameTypes: 'All Game Types',
      allStatuses: 'All Statuses',
      activeOnly: 'Active Only',
      draftOnly: 'Draft Only',
      noGamesFound: 'No games found',
      noGamesMatchFilter: 'No games match your active filters. Try adjusting your search query.',
      noGamesInCatalog: 'No games are available in this catalog yet.',
      clearFilters: 'Clear Filters',
      demo: 'Demo',
      manageGame: 'Manage Game',
      themeCount: '{{count}} Theme',
      themesCount: '{{count}} Themes',
      eventCount: '{{count}} Event',
      eventsCount: '{{count}} Events',
      configured: 'Configured',
      linked: 'Linked',
      demoEngine: 'Demo Engine: {{name}}',
      interactiveEngineTest: "Interactive engine test. Click 'Manage Game' to customize themes, visuals, and audio.",
      restart: 'Restart',
      fullscreen: 'Fullscreen',
      exitFullscreen: 'Exit Fullscreen',
      close: 'Close',
      statusActive: 'Active',
      statusDraft: 'Draft',
    },
    zh: {
      platformGameCatalog: '平台游戏目录',
      searchPlaceholder: '按标题、类型或标签搜索游戏...',
      allGameTypes: '所有游戏类型',
      allStatuses: '所有状态',
      activeOnly: '仅活跃',
      draftOnly: '仅草稿',
      noGamesFound: '未找到游戏',
      noGamesMatchFilter: '没有游戏符合您当前筛选条件。请尝试调整搜索词。',
      noGamesInCatalog: '此目录中暂无可用游戏。',
      clearFilters: '清除筛选',
      demo: '试玩',
      manageGame: '管理游戏',
      themeCount: '{{count}} 个主题',
      themesCount: '{{count}} 个主题',
      eventCount: '{{count}} 个活动',
      eventsCount: '{{count}} 个活动',
      configured: '已配置',
      linked: '已关联',
      demoEngine: '演示引擎：{{name}}',
      interactiveEngineTest: '交互式引擎测试。点击“管理游戏”以自定义主题、视觉效果和音频。',
      restart: '重新开始',
      fullscreen: '全屏',
      exitFullscreen: '退出全屏',
      close: '关闭',
      statusActive: '活跃',
      statusDraft: '草稿',
    },
    ms: {
      platformGameCatalog: 'Katalog Permainan Platform',
      searchPlaceholder: 'Cari permainan mengikut tajuk, jenis, atau teg...',
      allGameTypes: 'Semua Jenis Permainan',
      allStatuses: 'Semua Status',
      activeOnly: 'Aktif Sahaja',
      draftOnly: 'Draf Sahaja',
      noGamesFound: 'Tiada permainan ditemui',
      noGamesMatchFilter: 'Tiada permainan sepadan dengan penapis aktif anda. Cuba sesuaikan carian anda.',
      noGamesInCatalog: 'Belum ada permainan yang tersedia dalam katalog ini.',
      clearFilters: 'Kosongkan Penapis',
      demo: 'Demo',
      manageGame: 'Urus Permainan',
      themeCount: '{{count}} Tema',
      themesCount: '{{count}} Tema',
      eventCount: '{{count}} Acara',
      eventsCount: '{{count}} Acara',
      configured: 'Dikonfigurasi',
      linked: 'Dihubungkan',
      demoEngine: 'Enjin Demo: {{name}}',
      interactiveEngineTest: "Ujian enjin interaktif. Klik 'Urus Permainan' untuk menyesuaikan tema, visual, dan audio.",
      restart: 'Mula Semula',
      fullscreen: 'Skrin Penuh',
      exitFullscreen: 'Keluar Skrin Penuh',
      close: 'Tutup',
      statusActive: 'Aktif',
      statusDraft: 'Draf',
    },
  },
  gameDetail: {
    en: {
      myThemes: 'Organization Themes',
      systemThemes: 'System Templates',
      createTheme: 'Create Theme',
      cloneAll: 'Clone All System Themes',
      searchThemes: 'Search themes by title, author, or tags...',
      allStatuses: 'All Statuses',
      draftOnly: 'Draft Only',
      archivedOnly: 'Archived Only',
      noThemesFound: 'No themes found',
      noThemesFoundDesc: 'No themes match your active filter. Create a new theme or clone a system template to get started.',
      systemTemplatesNotice: 'System themes are global curated templates. Clone a theme to customize its visuals, branding, and physics.',
    },
    zh: {
      myThemes: '组织主题',
      systemThemes: '系统模板',
      createTheme: '创建主题',
      cloneAll: '克隆所有系统主题',
      searchThemes: '按标题、作者或标签搜索主题...',
      allStatuses: '所有状态',
      draftOnly: '仅草稿',
      archivedOnly: '仅归档',
      noThemesFound: '未找到主题',
      noThemesFoundDesc: '没有符合您当前筛选条件的主题。创建新主题或克隆系统模板以开始。',
      systemTemplatesNotice: '系统主题是全局精选模板。克隆主题以自定义其视觉、品牌和物理效果。',
    },
    ms: {
      myThemes: 'Tema Organisasi',
      systemThemes: 'Templat Sistem',
      createTheme: 'Cipta Tema',
      cloneAll: 'Klon Semua Tema Sistem',
      searchThemes: 'Cari tema mengikut tajuk, pengarang, atau teg...',
      allStatuses: 'Semua Status',
      draftOnly: 'Draf Sahaja',
      archivedOnly: 'Diarkib Sahaja',
      noThemesFound: 'Tiada tema ditemui',
      noThemesFoundDesc: 'Tiada tema sepadan dengan penapis aktif anda. Cipta tema baharu atau klon templat sistem untuk bermula.',
      systemTemplatesNotice: 'Tema sistem ialah templat susun atur global. Klon tema untuk menyesuaikan visual, penjenamaan, dan fizik.',
    },
  },
  developer: {
    en: {
      returnToStudio: 'Return to Studio Workspace',
      platformTopNotification: 'Game Catalog, Themes & Showcase Reviews',
      devAdminPlatform: 'DEVELOPER ADMIN PLATFORM',
      gamesThemesReviews: 'GAMES, THEMES & REVIEWS',
      gamesAndSystemThemes: 'Games & System Themes',
      eventPricingControl: 'Event Pricing Control',
      gmailApiEmail: 'Gmail API Email',
      errorLogs: 'Error Logs',
      contactSupportSettings: 'Contact & Support',
    },
    zh: {
      returnToStudio: '返回工作室工作区',
      platformTopNotification: '游戏目录、主题与展示评审',
      devAdminPlatform: '开发者管理平台',
      gamesThemesReviews: '游戏、主题与评审',
      gamesAndSystemThemes: '游戏与系统主题',
      eventPricingControl: '活动定价管理',
      gmailApiEmail: 'Gmail API 邮件设置',
      errorLogs: '错误日志',
      contactSupportSettings: '联系与支持设置',
    },
    ms: {
      returnToStudio: 'Kembali ke Ruang Kerja Studio',
      platformTopNotification: 'Katalog Permainan, Tema & Ulasan Pameran',
      devAdminPlatform: 'PLATFORM PENTADBIR PEMBANGUN',
      gamesThemesReviews: 'PERMAINAN, TEMA & ULASAN',
      gamesAndSystemThemes: 'Permainan & Tema Sistem',
      eventPricingControl: 'Kawalan Harga Acara',
      gmailApiEmail: 'E-mel Gmail API',
      errorLogs: 'Log Ralat',
      contactSupportSettings: 'Hubungi & Sokongan',
    },
  },
  payment: {
    en: {
      allTime: 'All Time',
      today: 'Today',
      last7Days: 'Last 7 Days',
      last30Days: 'Last 30 Days',
      last90Days: 'Last 90 Days',
      thisMonth: 'This Month',
      customPreset: 'Custom Date Range',
      allTypes: 'All Transactions',
      topUpsFilter: 'Top Ups',
      eventUsageFilter: 'Event Activations',
      creditsFilter: 'Promotional Credits',
      refundsFilter: 'Refunds',
      copied: 'Copied!',
      copy: 'Copy',
      cardPaymentMethod: 'Credit / Debit Card',
      onlinePaymentMethod: 'Online Payment',
      directDeposit: 'Direct Top Up Deposit',
      unpaid: 'Unpaid',
      pending: 'Pending',
      completed: 'Completed',
      failed: 'Failed',
      cancelled: 'Cancelled',
      expired: 'Expired',
    },
    zh: {
      allTime: '全部时间',
      today: '今天',
      last7Days: '最近7天',
      last30Days: '最近30天',
      last90Days: '最近90天',
      thisMonth: '本月',
      customPreset: '自定义日期范围',
      allTypes: '全部交易',
      topUpsFilter: '充值记录',
      eventUsageFilter: '活动激活扣费',
      creditsFilter: '推广积分与奖励',
      refundsFilter: '退款',
      copied: '已复制！',
      copy: '复制',
      cardPaymentMethod: '信用卡 / 借记卡',
      onlinePaymentMethod: '在线支付',
      directDeposit: '直接充值入账',
      unpaid: '未支付',
      pending: '处理中',
      completed: '已完成',
      failed: '失败',
      cancelled: '已取消',
      expired: '已过期',
    },
    ms: {
      allTime: 'Semua Masa',
      today: 'Hari Ini',
      last7Days: '7 Hari Lepas',
      last30Days: '30 Hari Lepas',
      last90Days: '90 Hari Lepas',
      thisMonth: 'Bulan Ini',
      customPreset: 'Julat Tarikh Tersuai',
      allTypes: 'Semua Transaksi',
      topUpsFilter: 'Tambah Nilai',
      eventUsageFilter: 'Pengaktifan Acara',
      creditsFilter: 'Kredit Promosi',
      refundsFilter: 'Bayaran Balik',
      copied: 'Disalin!',
      copy: 'Salin',
      cardPaymentMethod: 'Kad Kredit / Debit',
      onlinePaymentMethod: 'Pembayaran Dalam Talian',
      directDeposit: 'Deposit Tambah Nilai Terus',
      unpaid: 'Belum Bayar',
      pending: 'Belum Selesai',
      completed: 'Selesai',
      failed: 'Gagal',
      cancelled: 'Dibatalkan',
      expired: 'Tamat Tempoh',
    },
  },
};

function injectKeys(filePath: string, lang: 'en' | 'zh' | 'ms') {
  let content = fs.readFileSync(filePath, 'utf8');

  for (const [namespace, langMap] of Object.entries(remainingTranslations)) {
    const keys = langMap[lang];
    if (!keys) continue;

    // Check if namespace exists in file
    const nsRegex = new RegExp(`(\\b${namespace}\\s*:\\s*\\{)`, 'g');
    const match = nsRegex.exec(content);

    if (match) {
      const insertPos = match.index + match[0].length;
      let newEntries = '';
      for (const [k, v] of Object.entries(keys)) {
        // Only insert if key does not already exist in namespace
        const checkKeyRegex = new RegExp(`\\b${k}\\s*:`);
        const namespaceBlock = content.slice(insertPos, content.indexOf('},', insertPos) + 1);
        if (!checkKeyRegex.test(namespaceBlock)) {
          const escapedVal = v.replace(/'/g, "\\'");
          newEntries += `\n    ${k}: '${escapedVal}',`;
        }
      }
      if (newEntries) {
        content = content.slice(0, insertPos) + newEntries + content.slice(insertPos);
      }
    }
  }

  fs.writeFileSync(filePath, content, 'utf8');
}

injectKeys(enPath, 'en');
injectKeys(zhPath, 'zh');
injectKeys(msPath, 'ms');
console.log('Remaining keys injected successfully.');
