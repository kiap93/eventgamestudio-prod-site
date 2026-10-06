import fs from 'fs';
import path from 'path';

const enPath = path.resolve('src/locales/en.ts');
const zhPath = path.resolve('src/locales/zh-CN.ts');
const msPath = path.resolve('src/locales/ms-MY.ts');

interface TranslationItem {
  en: string;
  zh: string;
  ms: string;
}

const newKeys: Record<string, Record<string, TranslationItem>> = {
  auth: {
    goToDashboard: { en: 'Go to Dashboard', zh: '前往控制台', ms: 'Pergi ke Papan Pemuka' },
    emailCode: { en: 'Email Code', zh: '邮箱验证码', ms: 'Kod E-mel' },
    sixDigits: { en: '6 digits', zh: '6 位数字', ms: '6 digit' },
    yourNamePlaceholder: { en: 'Your Name', zh: '您的姓名', ms: 'Nama Anda' },
    min8Chars: { en: 'min. 8 chars', zh: '最少 8 位字符', ms: 'min. 8 aksara' },
    enterPasswordMin8: { en: 'Enter password (min 8 characters)', zh: '输入密码 (最少 8 个字符)', ms: 'Masukkan kata laluan (min 8 aksara)' },
    confirmPasswordPlaceholder: { en: 'Confirm password', zh: '确认密码', ms: 'Sahkan kata laluan' },
    hidePassword: { en: 'Hide password', zh: '隐藏密码', ms: 'Sembunyikan kata laluan' },
    showPassword: { en: 'Show password', zh: '显示密码', ms: 'Tunjukkan kata laluan' },
    hideConfirmPassword: { en: 'Hide confirm password', zh: '隐藏确认密码', ms: 'Sembunyikan pengesahan kata laluan' },
    showConfirmPassword: { en: 'Show confirm password', zh: '显示确认密码', ms: 'Tunjukkan pengesahan kata laluan' },
    chars8Plus: { en: '8+ characters', zh: '8+ 位字符', ms: '8+ aksara' },
    pwdLetter: { en: 'Letter', zh: '字母', ms: 'Huruf' },
    pwdNumber: { en: 'Number', zh: '数字', ms: 'Nombor' },
  },
  event: {
    durationLockedPaid: { en: '· Duration locked to paid license', zh: '· 活动天数已锁定至已支付许可证', ms: '· Tempoh dikunci pada lesen berbayar' },
    activeForWholeCalendarDays: { en: 'Active for whole calendar day{{plural}}:', zh: '全天生效日历天数{{plural}}：', ms: 'Aktif untuk keseluruhan hari kalendar{{plural}}:' },
  },
  studio: {
    switchLiveMode: { en: 'Switch to full-page live playable game mode', zh: '切换至全屏实机试玩模式', ms: 'Beralih ke mod permainan boleh dimainkan halaman penuh' },
    toggleInteractiveSim: { en: 'Toggle between Interactive Player Control and Auto-Attract Simulation', zh: '在玩家交互控制与自动试玩演示之间切换', ms: 'Togol antara Kawalan Pemain Interaktif dan Simulasi Tarikan Auto' },
    portraitLabel: { en: 'Portrait', zh: '竖屏', ms: 'Potret' },
    landscapeLabel: { en: 'Landscape', zh: '横屏', ms: 'Landskap' },
    speedGentle: { en: '50% (Gentle)', zh: '50% (温和)', ms: '50% (Lembut)' },
    speedStandard: { en: '100% (Standard)', zh: '100% (标准)', ms: '100% (Standard)' },
    speedIntense: { en: '150% (Intense)', zh: '150% (激烈)', ms: '150% (Intensif)' },
    dropLabel: { en: 'Drop:', zh: '掉落：', ms: 'Jatuhkan:' },
    exitFullscreen: { en: 'Exit Fullscreen', zh: '退出全屏', ms: 'Keluar Skrin Penuh' },
    exitFullscreenModeEsc: { en: 'Exit Fullscreen Mode (Esc)', zh: '退出全屏模式 (Esc)', ms: 'Keluar Mod Skrin Penuh (Esc)' },
    closeSettings: { en: 'Close Settings', zh: '关闭设置', ms: 'Tutup Tetapan' },
    activeTheme: { en: 'Active Theme', zh: '当前主题', ms: 'Tema Aktif' },
    unsavedChangesBanner: { en: 'You have unsaved changes', zh: '您有尚未保存的更改', ms: 'Anda mempunyai perubahan yang belum disimpan' },
    myThemesTab: { en: 'MY THEMES', zh: '我的主题', ms: 'TEMA SAYA' },
    deleteItem: { en: 'Delete item', zh: '删除道具', ms: 'Padam item' },
    cardFrontBgDefault: { en: 'Reset Card Front Background to default (#0F172A at 95%)', zh: '将卡牌正面背景重置为默认值 (#0F172A，95% 不透明度)', ms: 'Tetapkan semula Latar Belakang Hadapan Kad ke lalai (#0F172A pada 95%)' },
    matchSuccessBgDefault: { en: 'Reset Match Success Background to default (#064E3B at 85%)', zh: '将匹配成功背景重置为默认值 (#064E3B，85% 不透明度)', ms: 'Tetapkan semula Latar Belakang Kejayaan Padanan ke lalai (#064E3B pada 85%)' },
  },
  game: {
    reactionTapInstructions: { en: 'Click, tap, or press SPACE on canvas to react as soon as lights go out!', zh: '红灯熄灭瞬间，立即在画布上点击、轻触或按空格键以极速反应！', ms: 'Klik, ketik, atau tekan SPACE pada kanvas untuk bertindak balas sebaik sahaja lampu padam!' },
    controls: { en: 'Controls', zh: '操作控制', ms: 'Kawalan' },
    keyboard: { en: 'Keyboard:', zh: '键盘：', ms: 'Papan Kekunci:' },
    keyboardControls: { en: 'Left/Right arrow keys or A/D keys', zh: '左/右方向键或 A/D 键', ms: 'Kekunci anak panah Kiri/Kanan atau kekunci A/D' },
    mouseTouch: { en: 'Mouse/Touch:', zh: '鼠标/触控：', ms: 'Tetikus/Sentuhan:' },
    mouseTouchControls: { en: 'Move cursor or drag finger horizontally across screen', zh: '移动鼠标光标或在屏幕上水平拖动手指', ms: 'Gerakkan kursor atau seret jari secara mendatar merentasi skrin' },
    multiThemeSystem: { en: 'Multi-Theme System', zh: '多主题系统', ms: 'Sistem Pelbagai Tema' },
    beTheFirstToScore: { en: 'Be the first to submit a high score!', zh: '成为首位登上高分榜的玩家吧！', ms: 'Jadilah yang pertama untuk menghantar skor tinggi!' },
    noScoresRecorded: { en: 'No scores recorded yet', zh: '暂未记录到任何得分', ms: 'Tiada skor direkodkan lagi' },
    clearedOnEventStart: { en: 'Cleared on event start', zh: '将在活动正式开始时清空', ms: 'Dikosongkan semasa acara bermula' },
    jumpStart: { en: 'Jump Start', zh: '抢跑违规', ms: 'Mula Terlebih Dahulu' },
    memoryCardBoard: { en: 'Memory Card Board', zh: '记忆翻牌盘', ms: 'Papan Kad Memori' },
  },
  developer: {
    gameNotFound: { en: 'Game Not Found', zh: '未找到游戏', ms: 'Permainan Tidak Dijumpai' },
    gameNotFoundDesc: { en: 'The specified platform game could not be retrieved.', zh: '无法获取指定的平台游戏。', ms: 'Permainan platform yang ditentukan tidak dapat diambil.' },
    backToPlatformGames: { en: 'Back to Platform Games', zh: '返回平台游戏列表', ms: 'Kembali ke Permainan Platform' },
    editGameMetadata: { en: 'Edit Game Metadata', zh: '编辑游戏元数据', ms: 'Edit Metadata Permainan' },
    createDefaultTheme: { en: 'Create Default Theme', zh: '创建官方默认主题', ms: 'Cipta Tema Lalai' },
    gameEngineDefaults: { en: 'Game Engine Defaults & Schema', zh: '游戏引擎默认项与架构规范', ms: 'Lalai & Skema Enjin Permainan' },
    noSystemThemesConfigured: { en: 'No System Themes Configured', zh: '尚未配置任何系统主题', ms: 'Tiada Tema Sistem Dikonfigurasikan' },
    noCustomBackground: { en: 'No Custom Background', zh: '无自定义背景', ms: 'Tiada Latar Belakang Tersuai' },
    primaryDefault: { en: 'Primary Default', zh: '首要默认主题', ms: 'Lalai Utama' },
    testPlayTheme: { en: 'Test Play Theme', zh: '试玩测试主题', ms: 'Uji Main Tema' },
    unsetPrimaryDefault: { en: 'Unset Primary Default', zh: '取消首要默认', ms: 'Nyahset Lalai Utama' },
    setAsPrimaryDefault: { en: 'Set as Primary Default', zh: '设为首要默认', ms: 'Tetapkan sebagai Lalai Utama' },
    duplicateTheme: { en: 'Duplicate Theme', zh: '复制主题', ms: 'Duplikasi Tema' },
    deleteTheme: { en: 'Delete Theme', zh: '删除主题', ms: 'Padam Tema' },
    engineSpecifications: { en: 'Engine Specifications & Physics Baseline', zh: '引擎技术规格与物理基线', ms: 'Spesifikasi Enjin & Garis Dasar Fizik' },
    gameEngineKey: { en: 'Game Engine Key', zh: '游戏引擎标识符', ms: 'Kekunci Enjin Permainan' },
    mappedToEngineModule: { en: 'Mapped to engine module in registry', zh: '已映射至注册表中的引擎模块', ms: 'Dipetakan ke modul enjin dalam pendaftaran' },
    ownershipModel: { en: 'Ownership Model', zh: '所有权归属模式', ms: 'Model Pemilikan' },
    platformWideGame: { en: 'Platform-wide standard game', zh: '全平台标准通用游戏', ms: 'Permainan standard seluruh platform' },
    activeDefaultTheme: { en: 'Active Default Theme', zh: '当前默认主题', ms: 'Tema Lalai Aktif' },
    themeProvidedToNewTenants: { en: 'Theme provided to new tenants', zh: '为新租户组织提供的预置主题', ms: 'Tema yang disediakan kepada penyewa baharu' },
    unsetPrimaryDefaultConfirm: { en: 'Unset Primary Default?', zh: '确定取消首要默认设置吗？', ms: 'Nyahset Lalai Utama?' },
    currentPrimaryDefault: { en: 'Current Primary Default', zh: '当前首要默认', ms: 'Lalai Utama Semasa' },
    gameUnderDevelopment: { en: 'Cannot activate: Game engine is under development', zh: '无法激活：游戏引擎仍在开发中', ms: 'Tidak dapat mengaktifkan: Enjin permainan sedang dibangunkan' },
    prodSecurityArch: { en: 'Production Security Architecture', zh: '生产级安全架构', ms: 'Seni Bina Keselamatan Pengeluaran' },
    serverSideAes: { en: 'Server-Side AES-256-GCM:', zh: '服务端 AES-256-GCM 加密：', ms: 'AES-256-GCM Sebelah Pelayan:' },
    serverSideAesDesc: { en: 'Refresh tokens are encrypted with a 256-bit secret key and never exposed to the frontend browser.', zh: '刷新令牌采用 256 位密钥安全加密，绝不会泄露给前端浏览器。', ms: 'Token penyegar disulitkan dengan kunci rahsia 256-bit dan tidak pernah didedahkan kepada pelayar frontend.' },
    hmacSignedState: { en: 'HMAC-Signed OAuth State:', zh: 'HMAC 签名 OAuth 状态：', ms: 'Keadaan OAuth Ditandatangani HMAC:' },
    hmacSignedStateDesc: { en: 'Anti-CSRF verification prevents unauthorized callback hijacking.', zh: '防 CSRF 跨站请求伪造验证，杜绝未授权回调劫持。', ms: 'Pengesahan anti-CSRF menghalang perampasan panggilan balik tanpa kebenaran.' },
    singlePlatformSender: { en: 'Single Platform Sender:', zh: '统一平台发件人：', ms: 'Penghantar Platform Tunggal:' },
    singlePlatformSenderDesc: { en: 'Individual customers never connect personal inboxes; all team invites originate from the verified EventGameStudio platform address.', zh: '客户无需连接个人邮箱，所有团队邀请邮件均由 EventGameStudio 官方平台认证地址发出。', ms: 'Pelanggan individu tidak pernah menyambungkan peti masuk peribadi; semua jemputan pasukan berasal dari alamat platform EventGameStudio yang disahkan.' },
    zeroThirdPartyRelays: { en: 'Zero Third-Party Relays:', zh: '零第三方中继服务：', ms: 'Sifar Geganti Pihak Ketiga:' },
    zeroThirdPartyRelaysDesc: { en: 'No SMTP relays, Nodemailer servers, or untrusted middleman services are used.', zh: '不使用任何外部 SMTP 中继、Nodemailer 服务器或不可信的中间人服务。', ms: 'Tiada geganti SMTP, pelayan Nodemailer, atau perkhidmatan perantara tidak dipercayai digunakan.' },
    walletAndLedgerBalances: { en: 'Wallet & Ledger Balances', zh: '钱包与总账余额', ms: 'Baki Dompet & Lejar' },
    financialIntegrityGuard: { en: 'Financial Integrity Guard:', zh: '财务完整性保障：', ms: 'Pengawal Integriti Kewangan:' },
    paidPlusEventCredits: { en: 'Paid + All Event Credits', zh: '充值金额 + 全部活动信用额度', ms: 'Berbayar + Semua Kredit Acara' },
    depositedCashBalance: { en: 'Deposited cash balance', zh: '已充值现金余额', ms: 'Baki tunai didepositkan' },
    promotionalManualGrant: { en: 'Promotional manual grant', zh: '推广活动手动发放额度', ms: 'Pemberian manual promosi' },
    reviewReward300: { en: 'RM300 review reward', zh: 'RM300 案例审核奖励', ms: 'Ganjaran ulasan RM300' },
    depositBonusCredits: { en: 'Deposit bonus credits', zh: '充值赠送积分', ms: 'Kredit bonus deposit' },
    noEventsCreatedYet: { en: 'No events created yet.', zh: '尚未创建任何活动。', ms: 'Tiada acara dibuat lagi.' },
    memberCol: { en: 'Member', zh: '成员', ms: 'Ahli' },
    joinedDateCol: { en: 'Joined Date', zh: '加入日期', ms: 'Tarikh Menyertai' },
    eventTitleCol: { en: 'Event Title', zh: '活动名称', ms: 'Tajuk Acara' },
    eventPriceCol: { en: 'Event Price', zh: '活动价格', ms: 'Harga Acara' },
    createdCol: { en: 'Created', zh: '创建时间', ms: 'Dicipta' },
    publicLinkCol: { en: 'Public Link', zh: '公开链接', ms: 'Pautan Awam' },
    sourceOfTruth: { en: 'Source of Truth', zh: '唯一权威来源', ms: 'Sumber Kebenaran' },
    typeDescriptionCol: { en: 'Type / Description', zh: '类型 / 说明', ms: 'Jenis / Penerangan' },
    balanceAfterCol: { en: 'Balance After', zh: '交易后余额', ms: 'Baki Selepas' },
    referenceCol: { en: 'Reference', zh: '凭据参考号', ms: 'Rujukan' },
    timestampCol: { en: 'Timestamp', zh: '时间戳', ms: 'Cap Masa' },
    channelConfiguration: { en: 'Channel Configuration', zh: '沟通渠道配置', ms: 'Konfigurasi Saluran' },
    receivedEnquiries: { en: 'Received Enquiries', zh: '已收到的咨询', ms: 'Pertanyaan Diterima' },
    clientEnquiriesAndSubmissions: { en: 'Client Enquiries & Form Submissions', zh: '客户咨询与表单提交', ms: 'Pertanyaan Pelanggan & Penyerahan Borang' },
    searchTicketPlaceholder: { en: 'Search ticket, name, email...', zh: '搜索工单号、姓名、邮箱...', ms: 'Cari tiket, nama, e-mel...' },
    loadingReceivedEnquiries: { en: 'Loading received enquiries...', zh: '正在加载收到的咨询...', ms: 'Memuatkan pertanyaan yang diterima...' },
    noEnquiriesReceivedYet: { en: 'No Enquiries Received Yet', zh: '暂未收到任何咨询', ms: 'Tiada Pertanyaan Diterima Lagi' },
    testWhatsAppLink: { en: 'Test WhatsApp Link', zh: '测试 WhatsApp 跳转链接', ms: 'Uji Pautan WhatsApp' },
    testMailtoLink: { en: 'Test Mailto Link', zh: '测试 Mailto 邮件链接', ms: 'Uji Pautan Mailto' },
    publicSurfaceImpact: { en: 'Public Surface Impact', zh: '公开页面影响范围', ms: 'Kesan Permukaan Awam' },
    saveContactSettings: { en: 'Save Contact Settings', zh: '保存联系方式设置', ms: 'Simpan Tetapan Hubungan' },
    statusAndTime: { en: 'Status & Time', zh: '状态与时间', ms: 'Status & Masa' },
    requestCorrelationId: { en: 'Request / Correlation ID', zh: '请求 / 追踪关联 ID', ms: 'ID Permintaan / Korelasi' },
    methodAndEndpoint: { en: 'Method & Endpoint', zh: '请求方法与端点', ms: 'Kaedah & Titik Akhir' },
    errorMessageType: { en: 'Error Message / Type', zh: '错误信息 / 类型', ms: 'Mesej Ralat / Jenis' },
    copyFullRequestId: { en: 'Copy full Request ID', zh: '复制完整请求 ID', ms: 'Salin ID Permintaan Penuh' },
    rowsPerPage: { en: 'Rows per page:', zh: '每页行数：', ms: 'Baris setiap halaman:' },
    copyStack: { en: 'Copy Stack', zh: '复制堆栈信息', ms: 'Salin Tindanan' },
    copyJson: { en: 'Copy JSON', zh: '复制 JSON 数据', ms: 'Salin JSON' },
    filterByTimeRange: { en: 'Filter by Time Range', zh: '按时间范围筛选', ms: 'Tapis mengikut Julat Masa' },
    allTime: { en: 'All Time', zh: '全部历史时间', ms: 'Sepanjang Masa' },
    last24Hours: { en: 'Last 24 Hours', zh: '最近 24 小时', ms: '24 Jam Terakhir' },
    last7Days: { en: 'Last 7 Days', zh: '最近 7 天', ms: '7 Hari Terakhir' },
    last30Days: { en: 'Last 30 Days', zh: '最近 30 天', ms: '30 Hari Terakhir' },
    activeFiltersApplied: { en: 'Active filters applied', zh: '已应用激活的筛选条件', ms: 'Penapis aktif digunakan' },
    previewCustomerEmailTemplate: { en: 'Preview the exact email template sent to customers', zh: '预览发送给客户的邮件模板真实效果', ms: 'Pratonton templat e-mel tepat yang dihantar kepada pelanggan' },
    viewCustomerInvitationAuditLog: { en: 'View full audit log of all customer invitation deliveries', zh: '查看全部客户邀请邮件投递的完整审计日志', ms: 'Lihat log audit penuh bagi semua penghantaran jemputan pelanggan' },
    emailInvitationTemplatePreview: { en: 'Email Invitation Template Preview', zh: '邀请邮件模板预览', ms: 'Pratonton Templat Jemputan E-mel' },
    enterSampleCompanyName: { en: 'Enter sample company name...', zh: '输入示例企业名称...', ms: 'Masukkan nama syarikat sampel...' },
    emailHtmlPreview: { en: 'Email HTML Preview', zh: '邮件 HTML 预览', ms: 'Pratonton HTML E-mel' },
    copiedToClipboard: { en: 'Copied to Clipboard!', zh: '已成功复制到剪贴板！', ms: 'Disalin ke Papan Keratan!' },
    copyPlainText: { en: 'Copy Plain Text', zh: '复制纯文本内容', ms: 'Salin Teks Biasa' },
    customerInvitationAuditLogs: { en: 'Customer Invitation Audit Logs', zh: '客户邀请审计日志', ms: 'Log Audit Jemputan Pelanggan' },
    recipientEmailCol: { en: 'Recipient Email', zh: '收件人邮箱', ms: 'E-mel Penerima' },
    providerCol: { en: 'Provider', zh: '服务商', ms: 'Penyedia' },
    detailsCol: { en: 'Details', zh: '详细详情', ms: 'Butiran' },
    hasCoverBanner: { en: 'Has Cover Banner', zh: '包含封面横幅', ms: 'Mempunyai Sepanduk Muka Depan' },
    openShowcaseNewTab: { en: 'Open Public Showcase in New Tab', zh: '在新标签页中打开公开活动案例', ms: 'Buka Pameran Awam dalam Tab Baharu' },
    shareShowcaseUrl: { en: 'Share Public Showcase URL', zh: '分享公开活动案例链接', ms: 'Kongsi URL Pameran Awam' },
    linkCopied: { en: 'Link copied', zh: '链接已复制', ms: 'Pautan disalin' },
    approveReward300: { en: 'Approve Reward (RM300)', zh: '批准奖励 (RM300)', ms: 'Luluskan Ganjaran (RM300)' },
    blockShowcase: { en: 'Block Showcase', zh: '封禁展示案例', ms: 'Sekat Pameran' },
    unblockShowcase: { en: 'Unblock Showcase', zh: '解封展示案例', ms: 'Nyahsekat Pameran' },
    softDeleteShowcase: { en: 'Soft Delete Showcase', zh: '软删除展示案例', ms: 'Padam Lembut Pameran' },
  },
  editor: {
    resetCardFrontBg: { en: 'Reset Card Front Background to default', zh: '将卡牌正面背景重置为默认值', ms: 'Tetapkan semula Latar Belakang Hadapan Kad ke lalai' },
    resetMatchSuccessBg: { en: 'Reset Match Success Background to default', zh: '将匹配成功背景重置为默认值', ms: 'Tetapkan semula Latar Belakang Kejayaan Padanan ke lalai' },
    layerVisibility: { en: 'Toggle Layer Visibility', zh: '切换图层显示状态', ms: 'Togol Keterlihatan Lapisan' },
    layerLock: { en: 'Toggle Layer Lock', zh: '切换图层锁定状态', ms: 'Togol Kunci Lapisan' },
    selectLayer: { en: 'Select Layer', zh: '选择图层', ms: 'Pilih Lapisan' },
    duplicateLayer: { en: 'Duplicate Layer', zh: '复制图层', ms: 'Duplikasi Lapisan' },
    deleteLayer: { en: 'Delete Layer', zh: '删除图层', ms: 'Padam Lapisan' },
  }
};

function inject(filePath: string, lang: 'en' | 'zh' | 'ms') {
  let content = fs.readFileSync(filePath, 'utf8');

  for (const [namespace, items] of Object.entries(newKeys)) {
    // Find namespace opening: e.g. "  namespace: {"
    const regex = new RegExp(`(\\n\\s*${namespace}:\\s*\\{[\\s\\S]*?)(\\n\\s*\\},)`, 'm');
    const match = content.match(regex);
    if (!match) {
      console.error(`Namespace ${namespace} not found in ${filePath}`);
      continue;
    }

    let injection = '';
    for (const [k, v] of Object.entries(items)) {
      if (match[1].includes(`${k}:`)) {
        continue;
      }
      const val = v[lang].replace(/'/g, "\\'");
      injection += `    ${k}: '${val}',\n`;
    }

    if (injection) {
      content = content.replace(regex, `$1\n${injection}  },`);
    }
  }

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Updated ${filePath}`);
}

inject(enPath, 'en');
inject(zhPath, 'zh');
inject(msPath, 'ms');
console.log('Done injecting new keys!');
