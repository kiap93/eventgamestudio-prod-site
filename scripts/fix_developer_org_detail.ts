import fs from 'fs';

let content = fs.readFileSync('src/components/developer/DeveloperOrganizationDetail.tsx', 'utf8');

const replacements: Array<[string, string]> = [
  ['<h2 className="text-base font-bold text-white">Wallet & Ledger Balances</h2>', '<h2 className="text-base font-bold text-white">{t(\'developer.walletAndLedgerBalances\', undefined, \'Wallet & Ledger Balances\')}</h2>'],
  ['<span className="font-semibold text-slate-300">Financial Integrity Guard: </span>', '<span className="font-semibold text-slate-300">{t(\'developer.financialIntegrityGuard\', undefined, \'Financial Integrity Guard:\')} </span>'],
  ['<span className="text-[10px] text-slate-400 mt-1 block">Paid + All Event Credits</span>', '<span className="text-[10px] text-slate-400 mt-1 block">{t(\'developer.paidPlusEventCredits\', undefined, \'Paid + All Event Credits\')}</span>'],
  ['<span className="text-[10px] text-slate-500 mt-1 block">Deposited cash balance</span>', '<span className="text-[10px] text-slate-500 mt-1 block">{t(\'developer.depositedCashBalance\', undefined, \'Deposited cash balance\')}</span>'],
  ['<span className="text-[10px] text-slate-500 mt-1 block">Promotional manual grant</span>', '<span className="text-[10px] text-slate-500 mt-1 block">{t(\'developer.promotionalManualGrant\', undefined, \'Promotional manual grant\')}</span>'],
  ['<span className="text-[10px] text-slate-500 mt-1 block">RM300 review reward</span>', '<span className="text-[10px] text-slate-500 mt-1 block">{t(\'developer.reviewReward300\', undefined, \'RM300 review reward\')}</span>'],
  ['<span className="text-[10px] text-slate-500 mt-1 block">Deposit bonus credits</span>', '<span className="text-[10px] text-slate-500 mt-1 block">{t(\'developer.depositBonusCredits\', undefined, \'Deposit bonus credits\')}</span>'],
  ['<th className="py-3 px-4">Member</th>', '<th className="py-3 px-4">{t(\'developer.memberCol\', undefined, \'Member\')}</th>'],
  ['<th className="py-3 px-4">Email</th>', '<th className="py-3 px-4">{t(\'auth.email\', undefined, \'Email\')}</th>'],
  ['<th className="py-3 px-4">Role</th>', '<th className="py-3 px-4">{t(\'common.role\', undefined, \'Role\')}</th>'],
  ['<th className="py-3 px-4">Joined Date</th>', '<th className="py-3 px-4">{t(\'developer.joinedDateCol\', undefined, \'Joined Date\')}</th>'],
  ['<th className="py-3 px-4">Event Title</th>', '<th className="py-3 px-4">{t(\'developer.eventTitleCol\', undefined, \'Event Title\')}</th>'],
  ['<th className="py-3 px-4">Game</th>', '<th className="py-3 px-4">{t(\'common.game\', undefined, \'Game\')}</th>'],
  ['<th className="py-3 px-4">Status</th>', '<th className="py-3 px-4">{t(\'common.status\', undefined, \'Status\')}</th>'],
  ['<th className="py-3 px-4 text-right">Event Price</th>', '<th className="py-3 px-4 text-right">{t(\'developer.eventPriceCol\', undefined, \'Event Price\')}</th>'],
  ['<th className="py-3 px-4">Created</th>', '<th className="py-3 px-4">{t(\'developer.createdCol\', undefined, \'Created\')}</th>'],
  ['<th className="py-3 px-4 text-center">Public Link</th>', '<th className="py-3 px-4 text-center">{t(\'developer.publicLinkCol\', undefined, \'Public Link\')}</th>'],
  ['<span className="text-[11px] text-slate-400 font-mono">Source of Truth</span>', '<span className="text-[11px] text-slate-400 font-mono">{t(\'developer.sourceOfTruth\', undefined, \'Source of Truth\')}</span>'],
  ['<th className="py-3 px-4">Type / Description</th>', '<th className="py-3 px-4">{t(\'developer.typeDescriptionCol\', undefined, \'Type / Description\')}</th>'],
  ['<th className="py-3 px-4 text-right">Amount</th>', '<th className="py-3 px-4 text-right">{t(\'developer.amount\', undefined, \'Amount\')}</th>'],
  ['<th className="py-3 px-4 text-right">Balance After</th>', '<th className="py-3 px-4 text-right">{t(\'developer.balanceAfterCol\', undefined, \'Balance After\')}</th>'],
  ['<th className="py-3 px-4">Reference</th>', '<th className="py-3 px-4">{t(\'developer.referenceCol\', undefined, \'Reference\')}</th>'],
  ['<th className="py-3 px-4">Timestamp</th>', '<th className="py-3 px-4">{t(\'developer.timestampCol\', undefined, \'Timestamp\')}</th>'],
];

for (const [target, replacement] of replacements) {
  if (content.includes(target)) {
    content = content.replace(target, replacement);
  } else {
    console.warn('Target not found:', target);
  }
}

fs.writeFileSync('src/components/developer/DeveloperOrganizationDetail.tsx', content, 'utf8');
console.log('DeveloperOrganizationDetail.tsx updated!');
