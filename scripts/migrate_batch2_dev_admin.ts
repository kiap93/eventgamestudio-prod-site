import fs from 'fs';
import path from 'path';

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

// 1. DeveloperGameDetail.tsx
replaceExact('src/components/developer/DeveloperGameDetail.tsx', [
  ['alt="Catcher Basket"', "alt={t('developer.catcherBasketAlt', undefined, 'Catcher Basket')}"],
  ['<span className="text-[10px] text-slate-500 uppercase block">Items</span>', "<span className=\"text-[10px] text-slate-500 uppercase block\">{t('developer.itemsLabel', undefined, 'Items')}</span>"],
  ['<span className="text-[10px] text-emerald-400 uppercase block">Rewards</span>', "<span className=\"text-[10px] text-emerald-400 uppercase block\">{t('developer.rewardsLabel', undefined, 'Rewards')}</span>"],
  ['<span className="text-[10px] text-rose-400 uppercase block">Hazards</span>', "<span className=\"text-[10px] text-rose-400 uppercase block\">{t('developer.hazardsLabel', undefined, 'Hazards')}</span>"],
  ['<h3 className="text-base font-bold text-white mb-1">No System Themes Configured</h3>', "<h3 className=\"text-base font-bold text-white mb-1\">{t('developer.noSystemThemesConfigured', undefined, 'No System Themes Configured')}</h3>"],
  ['<span className="text-[10px]">No Custom Background</span>', "<span className=\"text-[10px]\">{t('developer.noCustomBackground', undefined, 'No Custom Background')}</span>"],
]);

// 2. DeveloperOrganizationDetail.tsx
replaceExact('src/components/developer/DeveloperOrganizationDetail.tsx', [
  ['<span className="text-[10px] text-slate-500 mt-1 block">Promotional manual grant</span>', "<span className=\"text-[10px] text-slate-500 mt-1 block\">{t('developer.promotionalManualGrant', undefined, 'Promotional manual grant')}</span>"],
  ['<span className="text-[10px] text-slate-500 mt-1 block">RM300 review reward</span>', "<span className=\"text-[10px] text-slate-500 mt-1 block\">{t('developer.showcaseReviewRewardDesc', undefined, 'RM300 review reward')}</span>"],
  ['<span className="text-[10px] text-slate-500 mt-1 block">Deposit bonus credits</span>', "<span className=\"text-[10px] text-slate-500 mt-1 block\">{t('developer.depositBonusCredits', undefined, 'Deposit bonus credits')}</span>"],
  ['<th className="py-3 px-4">Member</th>', "<th className=\"py-3 px-4\">{t('developer.colMember', undefined, 'Member')}</th>"],
  ['<th className="py-3 px-4">Email</th>', "<th className=\"py-3 px-4\">{t('developer.colEmail', undefined, 'Email')}</th>"],
  ['<th className="py-3 px-4">Role</th>', "<th className=\"py-3 px-4\">{t('developer.colRole', undefined, 'Role')}</th>"],
  ['<th className="py-3 px-4">Joined Date</th>', "<th className=\"py-3 px-4\">{t('developer.colJoinedDate', undefined, 'Joined Date')}</th>"],
  ['<th className="py-3 px-4">Event Title</th>', "<th className=\"py-3 px-4\">{t('developer.colEventTitle', undefined, 'Event Title')}</th>"],
  ['<th className="py-3 px-4">Game</th>', "<th className=\"py-3 px-4\">{t('developer.colGame', undefined, 'Game')}</th>"],
  ['<th className="py-3 px-4">Status</th>', "<th className=\"py-3 px-4\">{t('developer.colStatus', undefined, 'Status')}</th>"],
  ['<th className="py-3 px-4 text-right">Event Price</th>', "<th className=\"py-3 px-4 text-right\">{t('developer.colEventPrice', undefined, 'Event Price')}</th>"],
  ['<th className="py-3 px-4">Created</th>', "<th className=\"py-3 px-4\">{t('developer.colCreated', undefined, 'Created')}</th>"],
  ['<th className="py-3 px-4 text-center">Public Link</th>', "<th className=\"py-3 px-4 text-center\">{t('developer.colPublicLink', undefined, 'Public Link')}</th>"],
  ['<span className="text-[11px] text-slate-400">Source of Truth</span>', "<span className=\"text-[11px] text-slate-400\">{t('developer.sourceOfTruth', undefined, 'Source of Truth')}</span>"],
  ['<th className="py-3 px-4">Type / Description</th>', "<th className=\"py-3 px-4\">{t('developer.colTypeDesc', undefined, 'Type / Description')}</th>"],
  ['<th className="py-3 px-4">Amount</th>', "<th className=\"py-3 px-4\">{t('developer.colAmount', undefined, 'Amount')}</th>"],
  ['<th className="py-3 px-4">Balance After</th>', "<th className=\"py-3 px-4\">{t('developer.colBalanceAfter', undefined, 'Balance After')}</th>"],
  ['<th className="py-3 px-4">Reference</th>', "<th className=\"py-3 px-4\">{t('developer.colReference', undefined, 'Reference')}</th>"],
  ['<th className="py-3 px-4">Timestamp</th>', "<th className=\"py-3 px-4\">{t('developer.colTimestamp', undefined, 'Timestamp')}</th>"],
]);

// 3. DeveloperErrorLogs.tsx
replaceExact('src/components/developer/DeveloperErrorLogs.tsx', [
  ['<th className="py-3 px-4">Status & Time</th>', "<th className=\"py-3 px-4\">{t('developer.colStatusTime', undefined, 'Status & Time')}</th>"],
  ['<th className="py-3 px-4">Request / Correlation ID</th>', "<th className=\"py-3 px-4\">{t('developer.colCorrelationId', undefined, 'Request / Correlation ID')}</th>"],
  ['<th className="py-3 px-4">Method & Endpoint</th>', "<th className=\"py-3 px-4\">{t('developer.colMethodEndpoint', undefined, 'Method & Endpoint')}</th>"],
  ['<th className="py-3 px-4">Service</th>', "<th className=\"py-3 px-4\">{t('developer.colService', undefined, 'Service')}</th>"],
  ['<th className="py-3 px-4">Error Message / Type</th>', "<th className=\"py-3 px-4\">{t('developer.colErrorMessage', undefined, 'Error Message / Type')}</th>"],
  ['<th className="py-3 px-4 text-right">Action</th>', "<th className=\"py-3 px-4 text-right\">{t('developer.colActions', undefined, 'Action')}</th>"],
  ['<span className="text-slate-400">Active filters applied</span>', "<span className=\"text-slate-400\">{t('developer.activeFiltersApplied', undefined, 'Active filters applied')}</span>"],
  ['Reset Filters', "{t('developer.resetFilters', undefined, 'Reset Filters')}"],
  ['Loading API error audit logs...', "{t('developer.loadingApiErrorLogs', undefined, 'Loading API error audit logs...')}"],
]);

// 4. DeveloperPricingManager.tsx
replaceExact('src/components/developer/DeveloperPricingManager.tsx', [
  ['<span>Default Fallback:</span>', "<span>{t('developer.defaultFallback', undefined, 'Default Fallback:')}</span>"],
  ['<option value="MYR">MYR (Malaysian Ringgit)</option>', "<option value=\"MYR\">{t('developer.currencyMYR', undefined, 'MYR (Malaysian Ringgit)')}</option>"],
  ['<option value="USD">USD (US Dollar)</option>', "<option value=\"USD\">{t('developer.currencyUSD', undefined, 'USD (US Dollar)')}</option>"],
  ['<option value="SGD">SGD (Singapore Dollar)</option>', "<option value=\"SGD\">{t('developer.currencySGD', undefined, 'SGD (Singapore Dollar)')}</option>"],
  ['<span className="text-xs font-bold text-white uppercase tracking-wider block">Duration Tiers</span>', "<span className=\"text-xs font-bold text-white uppercase tracking-wider block\">{t('developer.durationBasedPricingTiers', undefined, 'Duration Tiers')}</span>"],
  ['<span className="text-xs font-bold text-white uppercase tracking-wider block">Platform Events</span>', "<span className=\"text-xs font-bold text-white uppercase tracking-wider block\">{t('developer.platformEvents', undefined, 'Platform Events')}</span>"],
  ['<span className="text-xs font-bold text-white uppercase tracking-wider block">Custom Overrides</span>', "<span className=\"text-xs font-bold text-white uppercase tracking-wider block\">{t('developer.customOverrides', undefined, 'Custom Overrides')}</span>"],
  ['<span className="text-xs font-bold text-white uppercase tracking-wider block">Credit Coverage</span>', "<span className=\"text-xs font-bold text-white uppercase tracking-wider block\">{t('developer.creditCoverage', undefined, 'Credit Coverage')}</span>"],
  ['title="Execute background maintenance job to cancel expired unpaid events and complete expired live events"', "title={t('developer.executeMaintenanceTooltip', undefined, 'Execute background maintenance job to cancel expired unpaid events and complete expired live events')}"],
]);

// 5. DeveloperGamePricingManager.tsx
replaceExact('src/components/developer/DeveloperGamePricingManager.tsx', [
  ['<span>Quick Setup Tiers</span>', "<span>{t('developer.quickSetupStandardTiers', undefined, 'Quick Setup Tiers')}</span>"],
  ['<span>Add Duration Tier</span>', "<span>{t('developer.addDurationTier', undefined, 'Add Duration Tier')}</span>"],
  ['<span className="text-xs font-bold text-white block">Pricing Country</span>', "<span className=\"text-xs font-bold text-white block\">{t('developer.pricingCountry', undefined, 'Pricing Country')}</span>"],
  ['<span className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider">Quick Switch:</span>', "<span className=\"text-[10px] uppercase font-semibold text-slate-500 tracking-wider\">{t('developer.quickSwitch', undefined, 'Quick Switch:')}</span>"],
  ['Loading game pricing tiers...', "{t('developer.loadingGamePricingTiers', undefined, 'Loading game pricing tiers...')}"],
  ['<span className="text-xs font-bold text-white">Base Tier</span>', "<span className=\"text-xs font-bold text-white\">{t('developer.baseTier', undefined, 'Base Tier')}</span>"],
  ['<span className="text-xs text-slate-400">per event activation</span>', "<span className=\"text-xs text-slate-400\">{t('developer.perEventActivation', undefined, 'per event activation')}</span>"],
  ['<label className="text-xs font-semibold text-slate-300">Minimum Days</label>', "<label className=\"text-xs font-semibold text-slate-300\">{t('developer.minDaysHeader', undefined, 'Minimum Days')}</label>"],
  ['<label className="text-xs font-semibold text-slate-300">Maximum Days</label>', "<label className=\"text-xs font-semibold text-slate-300\">{t('developer.maxDaysHeader', undefined, 'Maximum Days')}</label>"],
  ['<h4 className="text-sm font-bold text-white">Duration Simulator</h4>', "<h4 className=\"text-sm font-bold text-white\">{t('developer.durationPricingSimulator', undefined, 'Duration Simulator')}</h4>"],
  ['<label className="block text-xs font-semibold text-slate-400 mb-1">Start Date (Inclusive)</label>', "<label className=\"block text-xs font-semibold text-slate-400 mb-1\">{t('developer.startDateInclusive', undefined, 'Start Date (Inclusive)')}</label>"],
  ['<label className="block text-xs font-semibold text-slate-400 mb-1">End Date (Inclusive)</label>', "<label className=\"block text-xs font-semibold text-slate-400 mb-1\">{t('developer.endDateInclusive', undefined, 'End Date (Inclusive)')}</label>"],
  ['<span className="text-slate-400">Total Calendar Days:</span>', "<span className=\"text-slate-400\">{t('developer.totalCalendarDays', undefined, 'Total Calendar Days:')}</span>"],
  ['<span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Calculated Event Price</span>', "<span className=\"text-xs font-semibold text-slate-400 uppercase tracking-wider block\">{t('developer.calculatedEventPrice', undefined, 'Calculated Event Price')}</span>"],
  ['<span className="text-xs text-slate-400">Avg / Day</span>', "<span className=\"text-xs text-slate-400\">{t('developer.avgPerDay', undefined, 'Avg / Day')}</span>"],
]);

// 6. DeveloperContactSettings.tsx
replaceExact('src/components/developer/DeveloperContactSettings.tsx', [
  ['<span>Contact & Enquiry Variables</span>', "<span>{t('developer.contactEnquiryVars', undefined, 'Contact & Enquiry Variables')}</span>"],
  ['<span className="hidden sm:inline">Refresh</span>', "<span className=\"hidden sm:inline\">{t('common.refresh', undefined, 'Refresh')}</span>"],
  ['<span className="font-bold">Error: </span>', "<span className=\"font-bold\">{t('common.error', undefined, 'Error')}: </span>"],
  ['<span className="font-bold">Success: </span>', "<span className=\"font-bold\">{t('common.success', undefined, 'Success')}: </span>"],
  ['<span>Client Enquiries & Form Submissions</span>', "<span>{t('developer.clientEnquiriesSubmissions', undefined, 'Client Enquiries & Form Submissions')}</span>"],
  ['<span className="text-slate-400">Delivered To: </span>', "<span className=\"text-slate-400\">{t('developer.deliveredTo', undefined, 'Delivered To:')} </span>"],
  ['<span className="text-slate-400">Mailto Target: </span>', "<span className=\"text-slate-400\">{t('developer.mailtoTarget', undefined, 'Mailto Target:')} </span>"],
  ['<h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Public Surface Impact</h4>', "<h4 className=\"text-xs font-bold text-slate-300 uppercase tracking-wider\">{t('developer.publicSurfaceImpact', undefined, 'Public Surface Impact')}</h4>"],
]);

// 7. DeveloperShowcaseReviews.tsx
replaceExact('src/components/developer/DeveloperShowcaseReviews.tsx', [
  ['<span className="text-slate-500">Event:</span>', "<span className=\"text-slate-500\">{t('developer.lblEvent', undefined, 'Event:')}</span>"],
  ['<span className="text-slate-500">Organization:</span>', "<span className=\"text-slate-500\">{t('developer.lblOrg', undefined, 'Organization:')}</span>"],
  ['<span className="text-slate-500">Owner:</span>', "<span className=\"text-slate-500\">{t('developer.lblOwner', undefined, 'Owner:')}</span>"],
  ['<span className="text-slate-500">Published:</span>', "<span className=\"text-slate-500\">{t('developer.lblPublished', undefined, 'Published:')}</span>"],
  ['<span className="text-slate-500">Media:</span>', "<span className=\"text-slate-500\">{t('developer.colMedia', undefined, 'Media:')}</span>"],
  ['<span>Block Showcase</span>', "<span>{t('developer.blockShowcase', undefined, 'Block Showcase')}</span>"],
  ['<span>Unblock Showcase</span>', "<span>{t('developer.unblockShowcase', undefined, 'Unblock Showcase')}</span>"],
  ['<span>Soft Delete Showcase</span>', "<span>{t('developer.softDeleteShowcase', undefined, 'Soft Delete Showcase')}</span>"],
]);

// 8. DeveloperCustomerInvitations.tsx
replaceExact('src/components/developer/invitations/DeveloperCustomerInvitations.tsx', [
  ['<span>Subject: <strong className="text-white">Invitation to Try EventGameStudio</strong></span>', "<span>{t('developer.subjectLabel', undefined, 'Subject:')} <strong className=\"text-white\">{t('developer.invitationSubject', undefined, 'Invitation to Try EventGameStudio')}</strong></span>"],
  ['<span>Delivering via Resend...</span>', "<span>{t('developer.deliveringViaResend', undefined, 'Delivering via Resend...')}</span>"],
  ['<span>Company Name *</span>', "<span>{t('developer.companyNameRequired', undefined, 'Company Name *')}</span>"],
  ['<label className="text-slate-300 font-semibold">Contact Person (Optional)</label>', "<label className=\"text-slate-300 font-semibold\">{t('developer.contactPersonOptional', undefined, 'Contact Person (Optional)')}</label>"],
  ['<span>Recipient Email Addresses * (At least 1 required)</span>', "<span>{t('developer.recipientEmailAddressesRequired', undefined, 'Recipient Email Addresses * (At least 1 required)')}</span>"],
]);

// 9. DeveloperAdminLayout.tsx
replaceExact('src/components/developer/DeveloperAdminLayout.tsx', [
  ['DevAdmin <span className="text-emerald-400 ml-1">Platform</span>', "DevAdmin <span className=\"text-emerald-400 ml-1\">{t('developer.platformTitle', undefined, 'Platform')}</span>"],
  ['<span className="text-slate-500">Org:</span>', "<span className=\"text-slate-500\">{t('developer.lblOrg', undefined, 'Org:')}</span>"],
  ['Brand Engagement Games Platform • Developer Administration Architecture', "{t('developer.adminFooterNote', undefined, 'Brand Engagement Games Platform • Developer Administration Architecture')}"],
]);

console.log('Batch 2 Developer Admin migrations completed.');
