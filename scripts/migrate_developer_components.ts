import fs from 'fs';
import path from 'path';

function updateFile(filePath: string, replacements: Array<[string, string]>) {
  const fullPath = path.resolve(filePath);
  let content = fs.readFileSync(fullPath, 'utf8');
  let count = 0;
  for (const [target, repl] of replacements) {
    if (content.includes(target)) {
      content = content.replaceAll(target, repl);
      count++;
    }
  }
  fs.writeFileSync(fullPath, content, 'utf8');
  console.log(`Updated ${filePath} (${count} replacements)`);
}

// 1. DeveloperGameDetail.tsx
updateFile('src/components/developer/DeveloperGameDetail.tsx', [
  ['<h3 className="text-lg font-bold text-white mb-2">Game Not Found</h3>', "<h3 className=\"text-lg font-bold text-white mb-2\">{t('developer.gameNotFound', undefined, 'Game Not Found')}</h3>"],
  ['<h4 className="text-sm font-bold text-white mb-1">No System Themes Configured</h4>', "<h4 className=\"text-sm font-bold text-white mb-1\">{t('developer.noSystemThemesConfigured', undefined, 'No System Themes Configured')}</h4>"],
  ['<span className="text-slate-500 font-mono">No Custom Background</span>', "<span className=\"text-slate-500 font-mono\">{t('developer.noCustomBackground', undefined, 'No Custom Background')}</span>"],
  ['<span className="text-[10px] text-slate-400">Rewards</span>', "<span className=\"text-[10px] text-slate-400\">{t('developer.rewardsLabel', undefined, 'Rewards')}</span>"],
  ['<span className="text-[10px] text-slate-400">Hazards</span>', "<span className=\"text-[10px] text-slate-400\">{t('developer.hazardsLabel', undefined, 'Hazards')}</span>"],
  ['<h3 className="text-base font-bold text-white">Unset Primary Default?</h3>', "<h3 className=\"text-base font-bold text-white\">{t('developer.unsetPrimaryDefaultTitle', undefined, 'Unset Primary Default?')}</h3>"],
]);

// 2. DeveloperContactSettings.tsx
updateFile('src/components/developer/DeveloperContactSettings.tsx', [
  ['<h2 className="text-sm font-bold text-white">Contact &amp; Enquiry Variables</h2>', "<h2 className=\"text-sm font-bold text-white\">{t('developer.contactEnquiryVars', undefined, 'Contact & Enquiry Variables')}</h2>"],
  ['title="Reload settings from database"', "title={t('developer.reloadSettingsDatabase', undefined, 'Reload settings from database')}"],
  ['<h3 className="text-sm font-bold text-white">Client Enquiries &amp; Form Submissions</h3>', "<h3 className=\"text-sm font-bold text-white\">{t('developer.clientEnquiriesSubmissions', undefined, 'Client Enquiries & Form Submissions')}</h3>"],
  ['<h3 className="text-sm font-bold text-slate-300">No Enquiries Received Yet</h3>', "<h3 className=\"text-sm font-bold text-slate-300\">{t('developer.noEnquiriesReceivedYet', undefined, 'No Enquiries Received Yet')}</h3>"],
  ['<h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Public Surface Impact</h4>', "<h4 className=\"text-xs font-bold text-slate-300 uppercase tracking-wider\">{t('developer.publicSurfaceImpact', undefined, 'Public Surface Impact')}</h4>"],
]);

// 3. DeveloperShowcaseReviews.tsx
updateFile('src/components/developer/DeveloperShowcaseReviews.tsx', [
  ['<span>View / Inspect</span>', "<span>{t('developer.viewInspect', undefined, 'View / Inspect')}</span>"],
  ['<th className="px-4 py-3">Media</th>', "<th className=\"px-4 py-3\">{t('developer.colMedia', undefined, 'Media')}</th>"],
  ['<th className="px-4 py-3">RM300 Reward</th>', "<th className=\"px-4 py-3\">{t('developer.colReward', undefined, 'RM300 Reward')}</th>"],
  ['<th className="px-4 py-3">Visibility</th>', "<th className=\"px-4 py-3\">{t('developer.colVisibility', undefined, 'Visibility')}</th>"],
  ['<th className="px-4 py-3 text-right">Actions</th>', "<th className=\"px-4 py-3 text-right\">{t('developer.colActions', undefined, 'Actions')}</th>"],
  ['<span>Approve Reward</span>', "<span>{t('developer.approveRewardBtn', undefined, 'Approve Reward')}</span>"],
]);

// 4. DeveloperCustomerInvitations.tsx
updateFile('src/components/developer/invitations/DeveloperCustomerInvitations.tsx', [
  ['<h3 className="text-lg font-bold text-white">Send Customer Invitations</h3>', "<h3 className=\"text-lg font-bold text-white\">{t('developer.sendCustomerInvitations', undefined, 'Send Customer Invitations')}</h3>"],
  ['<label className="text-xs font-semibold text-slate-300">Notes / Industry</label>', "<label className=\"text-xs font-semibold text-slate-300\">{t('developer.notesIndustry', undefined, 'Notes / Industry')}</label>"],
  ['<h3 className="text-sm font-bold text-white">Customer Invitation Audit Logs</h3>', "<h3 className=\"text-sm font-bold text-white\">{t('developer.customerInvitationAuditLogs', undefined, 'Customer Invitation Audit Logs')}</h3>"],
  ['<th className="p-3">Date / Time</th>', "<th className=\"p-3\">{t('developer.colDateTime', undefined, 'Date / Time')}</th>"],
  ['<th className="p-3">Recipient Email</th>', "<th className=\"p-3\">{t('developer.colRecipientEmail', undefined, 'Recipient Email')}</th>"],
  ['<th className="p-3">Provider</th>', "<th className=\"p-3\">{t('developer.colProvider', undefined, 'Provider')}</th>"],
  ['<h3 className="text-base font-bold text-white">Delete Customer Company?</h3>', "<h3 className=\"text-base font-bold text-white\">{t('developer.deleteCustomerCompanyModalTitle', undefined, 'Delete Customer Company?')}</h3>"],
]);

// 5. DeveloperErrorLogs.tsx
updateFile('src/components/developer/DeveloperErrorLogs.tsx', [
  ['<option value="all">All Time</option>', "<option value=\"all\">{t('developer.allTime', undefined, 'All Time')}</option>"],
  ['<option value="24h">Last 24 Hours</option>', "<option value=\"24h\">{t('developer.last24Hours', undefined, 'Last 24 Hours')}</option>"],
  ['<option value="7d">Last 7 Days</option>', "<option value=\"7d\">{t('developer.last7Days', undefined, 'Last 7 Days')}</option>"],
  ['<option value="30d">Last 30 Days</option>', "<option value=\"30d\">{t('developer.last30Days', undefined, 'Last 30 Days')}</option>"],
  ['<th className="p-3.5">Status &amp; Time</th>', "<th className=\"p-3.5\">{t('developer.colStatusTime', undefined, 'Status & Time')}</th>"],
  ['<th className="p-3.5">Request / Correlation ID</th>', "<th className=\"p-3.5\">{t('developer.colCorrelationId', undefined, 'Request / Correlation ID')}</th>"],
  ['<th className="p-3.5">Method &amp; Endpoint</th>', "<th className=\"p-3.5\">{t('developer.colMethodEndpoint', undefined, 'Method & Endpoint')}</th>"],
  ['<th className="p-3.5">Service</th>', "<th className=\"p-3.5\">{t('developer.colService', undefined, 'Service')}</th>"],
  ['<th className="p-3.5">Error Message / Type</th>', "<th className=\"p-3.5\">{t('developer.colErrorMessage', undefined, 'Error Message / Type')}</th>"],
  ['<th className="p-3.5 text-right">Action</th>', "<th className=\"p-3.5 text-right\">{t('developer.colActions', undefined, 'Action')}</th>"],
  ['<span>Copy Stack</span>', "<span>{t('developer.copyStack', undefined, 'Copy Stack')}</span>"],
  ['<span>Copy JSON</span>', "<span>{t('developer.copyJson', undefined, 'Copy JSON')}</span>"],
]);

// 6. DeveloperOrganizationDetail.tsx
updateFile('src/components/developer/DeveloperOrganizationDetail.tsx', [
  ['<h3 className="text-base font-bold text-white">Wallet &amp; Ledger Balances</h3>', "<h3 className=\"text-base font-bold text-white\">{t('developer.walletLedgerBalances', undefined, 'Wallet & Ledger Balances')}</h3>"],
  ['<p className="text-[11px] text-slate-500 mt-1">Deposited cash balance</p>', "<p className=\"text-[11px] text-slate-500 mt-1\">{t('developer.depositedCashBalance', undefined, 'Deposited cash balance')}</p>"],
  ['<p className="text-[11px] text-slate-500 mt-1">Promotional manual grant</p>', "<p className=\"text-[11px] text-slate-500 mt-1\">{t('developer.promotionalManualGrant', undefined, 'Promotional manual grant')}</p>"],
  ['<p className="text-[11px] text-slate-500 mt-1">RM300 review reward</p>', "<p className=\"text-[11px] text-slate-500 mt-1\">{t('developer.showcaseReviewRewardDesc', undefined, 'RM300 review reward')}</p>"],
  ['<p className="text-[11px] text-slate-500 mt-1">Deposit bonus credits</p>', "<p className=\"text-[11px] text-slate-500 mt-1\">{t('developer.depositBonusCredits', undefined, 'Deposit bonus credits')}</p>"],
  ['<th className="px-4 py-3">Member</th>', "<th className=\"px-4 py-3\">{t('developer.colMember', undefined, 'Member')}</th>"],
  ['<th className="px-4 py-3">Email</th>', "<th className=\"px-4 py-3\">{t('developer.colEmail', undefined, 'Email')}</th>"],
  ['<th className="px-4 py-3">Joined Date</th>', "<th className=\"px-4 py-3\">{t('developer.colJoinedDate', undefined, 'Joined Date')}</th>"],
  ['<th className="px-4 py-3">Event Title</th>', "<th className=\"px-4 py-3\">{t('developer.colEventTitle', undefined, 'Event Title')}</th>"],
  ['<th className="px-4 py-3">Status</th>', "<th className=\"px-4 py-3\">{t('developer.colStatus', undefined, 'Status')}</th>"],
  ['<th className="px-4 py-3">Event Price</th>', "<th className=\"px-4 py-3\">{t('developer.colEventPrice', undefined, 'Event Price')}</th>"],
  ['<th className="px-4 py-3">Created</th>', "<th className=\"px-4 py-3\">{t('developer.colCreated', undefined, 'Created')}</th>"],
  ['<th className="px-4 py-3">Public Link</th>', "<th className=\"px-4 py-3\">{t('developer.colPublicLink', undefined, 'Public Link')}</th>"],
  ['<span className="text-[11px] text-slate-400">Source of Truth</span>', "<span className=\"text-[11px] text-slate-400\">{t('developer.sourceOfTruth', undefined, 'Source of Truth')}</span>"],
  ['<th className="px-4 py-3">Type / Description</th>', "<th className=\"px-4 py-3\">{t('developer.colTypeDesc', undefined, 'Type / Description')}</th>"],
  ['<th className="px-4 py-3">Amount</th>', "<th className=\"px-4 py-3\">{t('developer.colAmount', undefined, 'Amount')}</th>"],
  ['<th className="px-4 py-3">Balance After</th>', "<th className=\"px-4 py-3\">{t('developer.colBalanceAfter', undefined, 'Balance After')}</th>"],
  ['<th className="px-4 py-3">Reference</th>', "<th className=\"px-4 py-3\">{t('developer.colReference', undefined, 'Reference')}</th>"],
  ['<th className="px-4 py-3">Timestamp</th>', "<th className=\"px-4 py-3\">{t('developer.colTimestamp', undefined, 'Timestamp')}</th>"],
]);

console.log('Finished migrating developer components.');
