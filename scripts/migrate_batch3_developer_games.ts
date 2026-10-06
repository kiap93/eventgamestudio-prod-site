import fs from 'fs';
import path from 'path';

function replaceInFile(filePath: string, replacements: Array<[string, string]>) {
  if (!fs.existsSync(filePath)) {
    console.warn(`File not found: ${filePath}`);
    return;
  }
  let content = fs.readFileSync(filePath, 'utf8');
  let count = 0;
  for (const [target, replacement] of replacements) {
    if (content.includes(target)) {
      content = content.replace(target, replacement);
      count++;
    } else {
      console.warn(`[NOT FOUND in ${filePath}]: ${target.slice(0, 40)}...`);
    }
  }
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Updated ${filePath}: ${count}/${replacements.length} replacements applied.`);
}

// 1. DeveloperAdminLayout.tsx
replaceInFile('src/components/developer/DeveloperAdminLayout.tsx', [
  ['title="Sign Out"', "title={t('auth.signOut', undefined, 'Sign Out')}"],
  ['aria-label="Toggle Navigation Menu"', "aria-label={t('nav.toggleMenu', undefined, 'Toggle Navigation Menu')}"],
]);

// 2. MemoryMatchCustomizer.tsx (remaining)
replaceInFile('src/components/studio/games/MemoryMatchCustomizer.tsx', [
  ['<h3 className="text-sm font-bold text-slate-200">Card Front Background</h3>', "<h3 className=\"text-sm font-bold text-slate-200\">{t('customizers.cardFrontBackground', undefined, 'Card Front Background')}</h3>"],
  ['<h3 className="text-sm font-bold text-slate-200">Match Success Background</h3>', "<h3 className=\"text-sm font-bold text-slate-200\">{t('customizers.matchSuccessBackground', undefined, 'Match Success Background')}</h3>"],
  ['<h3 className="text-sm font-bold text-slate-200">Card Dimensions, Shape & Rotation</h3>', "<h3 className=\"text-sm font-bold text-slate-200\">{t('customizers.cardDimensionsShape', undefined, 'Card Dimensions, Shape & Rotation')}</h3>"],
  ['<span className="text-xs text-slate-200 font-bold">Combo Streak Bonus</span>', "<span className=\"text-xs text-slate-200 font-bold\">{t('customizers.comboStreakBonus', undefined, 'Combo Streak Bonus')}</span>"],
  ['<h3 className="text-sm font-bold text-slate-200">Leaderboard & Social Display</h3>', "<h3 className=\"text-sm font-bold text-slate-200\">{t('studio.leaderboardAndSocial', undefined, 'Leaderboard & Social Display')}</h3>"],
  ['<h3 className="text-sm font-bold text-slate-200">Memory Sound FX Previews</h3>', "<h3 className=\"text-sm font-bold text-slate-200\">{t('studio.memorySoundPreviews', undefined, 'Memory Sound FX Previews')}</h3>"],
]);

// 3. MemoryMatchGame.tsx
replaceInFile('src/games/memory-match/MemoryMatchGame.tsx', [
  ['aria-label="Memory Card Board"', "aria-label={t('game.memoryCardBoard', undefined, 'Memory Card Board')}"],
  ['<h3 className="text-lg font-black text-slate-100 uppercase tracking-wider">Game Paused</h3>', "<h3 className=\"text-lg font-black text-slate-100 uppercase tracking-wider\">{t('game.gamePaused', undefined, 'Game Paused')}</h3>"],
  ['<span>Resume Game</span>', "<span>{t('game.resumeGame', undefined, 'Resume Game')}</span>"],
  ['<span>Restart Board</span>', "<span>{t('game.restartBoard', undefined, 'Restart Board')}</span>"],
  ['<span>Stop Game</span>', "<span>{t('game.stopGame', undefined, 'Stop Game')}</span>"],
  ['<h3 className="text-base font-black text-slate-100 flex items-center gap-2">High Scores</h3>', "<h3 className=\"text-base font-black text-slate-100 flex items-center gap-2\">{t('game.highScores', undefined, 'High Scores')}</h3>"],
  ['<div className="text-xs text-slate-400 font-mono">Loading Leaderboard...</div>', "<div className=\"text-xs text-slate-400 font-mono\">{t('game.loadingLeaderboard', undefined, 'Loading Leaderboard...')}</div>"],
  ['<div className="font-bold text-slate-300">No Scores Yet!</div>', "<div className=\"font-bold text-slate-300\">{t('game.noScoresYetTitle', undefined, 'No Scores Yet!')}</div>"],
  ['<p className="text-xs text-slate-500 mt-1">Be the first to submit a high score!</p>', "<p className=\"text-xs text-slate-500 mt-1\">{t('game.beTheFirstToScore', undefined, 'Be the first to submit a high score!')}</p>"],
]);

// 4. ResultElementContent.tsx
replaceInFile('src/games/shared/ResultElementContent.tsx', [
  ['Loading rankings...', "{t('game.loadingRankings', undefined, 'Loading rankings...')}"],
  ['Leaderboard unavailable', "{t('game.leaderboardUnavailable', undefined, 'Leaderboard unavailable')}"],
  ['No scores recorded yet', "{t('game.noScoresRecorded', undefined, 'No scores recorded yet')}"],
  ['title="Moves"', "title={t('game.moves', undefined, 'Moves')}"],
  ['title="Duration"', "title={t('game.duration', undefined, 'Duration')}"],
  ['title="Accuracy"', "title={t('game.accuracy', undefined, 'Accuracy')}"],
  ['Cleared on event start', "{t('game.clearedOnEventStart', undefined, 'Cleared on event start')}"],
  ['<span>Submitting...</span>', "<span>{t('game.submitting', undefined, 'Submitting...')}</span>"],
]);

// 5. StartElementContent.tsx
replaceInFile('src/games/shared/StartElementContent.tsx', [
  ['<span>Match Pairs</span>', "<span>{t('game.matchPairs', undefined, 'Match Pairs')}</span>"],
  ['<span>+POINTS FOR MATCH</span>', "<span>{t('game.pointsForMatch', undefined, '+POINTS FOR MATCH')}</span>"],
  ['<span>Beat Timer</span>', "<span>{t('game.beatTimer', undefined, 'Beat Timer')}</span>"],
  ['<span>COMBO STREAK BONUS</span>', "<span>{t('game.comboStreakBonus', undefined, 'COMBO STREAK BONUS')}</span>"],
  ['<span>Tap On Green</span>', "<span>{t('game.tapOnGreen', undefined, 'Tap On Green')}</span>"],
  ['<span>FASTEST MILLISECONDS</span>', "<span>{t('game.fastestMilliseconds', undefined, 'FASTEST MILLISECONDS')}</span>"],
  ['<span>Jump Start</span>', "<span>{t('game.jumpStart', undefined, 'Jump Start')}</span>"],
  ['<span>PENALTY FOR EARLY TAP</span>', "<span>{t('game.penaltyForEarlyTap', undefined, 'PENALTY FOR EARLY TAP')}</span>"],
  ['Loading rankings...', "{t('game.loadingRankings', undefined, 'Loading rankings...')}"],
  ['Leaderboard unavailable', "{t('game.leaderboardUnavailable', undefined, 'Leaderboard unavailable')}"],
  ['No scores recorded yet', "{t('game.noScoresRecorded', undefined, 'No scores recorded yet')}"],
]);

// 6. DeveloperCustomerInvitations.tsx
replaceInFile('src/components/developer/invitations/DeveloperCustomerInvitations.tsx', [
  ['title="Preview the exact email template sent to customers"', "title={t('developer.previewCustomerEmailTemplate', undefined, 'Preview the exact email template sent to customers')}"],
  ['title="View full audit log of all customer invitation deliveries"', "title={t('developer.viewCustomerInvitationAuditLog', undefined, 'View full audit log of all customer invitation deliveries')}"],
  ['title="Refresh list"', "title={t('common.refresh', undefined, 'Refresh list')}"],
  ['Loading customer companies...', "{t('developer.loadingCustomerCompanies', undefined, 'Loading customer companies...')}"],
  ['No customer companies found', "{t('developer.noCompaniesFound', undefined, 'No customer companies found')}"],
  ['<span>Add Your First Company</span>', "<span>{t('developer.addFirstCompany', undefined, 'Add Your First Company')}</span>"],
  ['<span>Contact:</span>', "<span>{t('developer.contactPerson', undefined, 'Contact:')}</span>"],
  ['<span>Never</span>', "<span>{t('developer.neverInvited', undefined, 'Never')}</span>"],
  ['title="Send platform invitation email"', "title={t('developer.sendInvitations', undefined, 'Send platform invitation email')}"],
  ['<span>Invite</span>', "<span>{t('developer.sendInvitations', undefined, 'Invite')}</span>"],
  ['title="Edit company & recipients"', "title={t('developer.editCompany', undefined, 'Edit company & recipients')}"],
  ['title="Delete company"', "title={t('developer.deleteCompany', undefined, 'Delete company')}"],
  ['<h3 className="text-sm font-bold text-slate-200">Send Customer Invitations</h3>', "<h3 className=\"text-sm font-bold text-slate-200\">{t('developer.sendInvitationModalTitle', undefined, 'Send Customer Invitations')}</h3>"],
  ['<h3 className="text-sm font-bold text-slate-200">Email Invitation Template Preview</h3>', "<h3 className=\"text-sm font-bold text-slate-200\">{t('developer.emailInvitationTemplatePreview', undefined, 'Email Invitation Template Preview')}</h3>"],
  ['placeholder="Enter sample company name..."', "placeholder={t('developer.enterSampleCompanyName', undefined, 'Enter sample company name...')}"],
  ['title="Email HTML Preview"', "title={t('developer.emailHtmlPreview', undefined, 'Email HTML Preview')}"],
  ['Copied to Clipboard!', "{t('developer.copiedToClipboard', undefined, 'Copied to Clipboard!')}"],
  ['<span>Copy Plain Text</span>', "<span>{t('developer.copyPlainText', undefined, 'Copy Plain Text')}</span>"],
  ['<h3 className="text-sm font-bold text-slate-200">Customer Invitation Audit Logs</h3>', "<h3 className=\"text-sm font-bold text-slate-200\">{t('developer.customerInvitationAuditLogs', undefined, 'Customer Invitation Audit Logs')}</h3>"],
  ['Loading logs...', "{t('developer.loadingLogs', undefined, 'Loading logs...')}"],
  ['<th className="px-4 py-2.5 text-left text-slate-400 font-semibold">Date / Time</th>', "<th className=\"px-4 py-2.5 text-left text-slate-400 font-semibold\">{t('developer.statusAndTime', undefined, 'Date / Time')}</th>"],
  ['<th className="px-4 py-2.5 text-left text-slate-400 font-semibold">Recipient Email</th>', "<th className=\"px-4 py-2.5 text-left text-slate-400 font-semibold\">{t('developer.recipientEmailCol', undefined, 'Recipient Email')}</th>"],
  ['<th className="px-4 py-2.5 text-left text-slate-400 font-semibold">Provider</th>', "<th className=\"px-4 py-2.5 text-left text-slate-400 font-semibold\">{t('developer.providerCol', undefined, 'Provider')}</th>"],
  ['<th className="px-4 py-2.5 text-left text-slate-400 font-semibold">Status</th>', "<th className=\"px-4 py-2.5 text-left text-slate-400 font-semibold\">{t('common.status', undefined, 'Status')}</th>"],
  ['<th className="px-4 py-2.5 text-left text-slate-400 font-semibold">Details</th>', "<th className=\"px-4 py-2.5 text-left text-slate-400 font-semibold\">{t('developer.detailsCol', undefined, 'Details')}</th>"],
  ['<h3 className="text-base font-bold text-slate-200">Delete Customer Company?</h3>', "<h3 className=\"text-base font-bold text-slate-200\">{t('developer.deleteCompanyConfirmTitle', undefined, 'Delete Customer Company?')}</h3>"],
  ['<span>Delete Company</span>', "<span>{t('developer.deleteCompany', undefined, 'Delete Company')}</span>"],
  ['<span>Saving...</span>', "<span>{t('common.saving', undefined, 'Saving...')}</span>"],
  ['<span>Deleting...</span>', "<span>{t('common.deleting', undefined, 'Deleting...')}</span>"],
  ['<span>Add Recipient</span>', "<span>{t('developer.addRecipient', undefined, 'Add Recipient')}</span>"],
  ['placeholder="recipient@example.com"', "placeholder={t('developer.recipientEmailPlaceholder', undefined, 'recipient@example.com')}"],
  ['placeholder="Name (optional)"', "placeholder={t('developer.recipientNamePlaceholder', undefined, 'Name (optional)')}"],
  ['title="Remove recipient"', "title={t('developer.removeRecipient', undefined, 'Remove recipient')}"],
]);

// 7. DeveloperGameDetail.tsx
replaceInFile('src/components/developer/DeveloperGameDetail.tsx', [
  ['<h3 className="text-base font-black text-slate-100">Game Not Found</h3>', "<h3 className=\"text-base font-black text-slate-100\">{t('developer.gameNotFound', undefined, 'Game Not Found')}</h3>"],
  ['The specified platform game could not be retrieved.', "{t('developer.gameNotFoundDesc', undefined, 'The specified platform game could not be retrieved.')}"],
  ['title="Back to Platform Games"', "title={t('developer.backToPlatformGames', undefined, 'Back to Platform Games')}"],
  ['<span>Edit Game Metadata</span>', "<span>{t('developer.editGameMetadata', undefined, 'Edit Game Metadata')}</span>"],
  ['<span>Create Default Theme</span>', "<span>{t('developer.createDefaultTheme', undefined, 'Create Default Theme')}</span>"],
  ['<span>Game Pricing Tiers</span>', "<span>{t('developer.gamePricingTiers', undefined, 'Game Pricing Tiers')}</span>"],
  ['<span>Game Engine Defaults & Schema</span>', "<span>{t('developer.gameEngineDefaults', undefined, 'Game Engine Defaults & Schema')}</span>"],
  ['<p className="text-xs text-slate-500">No System Themes Configured</p>', "<p className=\"text-xs text-slate-500\">{t('developer.noSystemThemesConfigured', undefined, 'No System Themes Configured')}</p>"],
  ['<span className="text-[10px] text-slate-500 font-mono">No Custom Background</span>', "<span className=\"text-[10px] text-slate-500 font-mono\">{t('developer.noCustomBackground', undefined, 'No Custom Background')}</span>"],
  ['<span>Primary Default</span>', "<span>{t('developer.primaryDefault', undefined, 'Primary Default')}</span>"],
  ['title="Test Play Theme"', "title={t('developer.testPlayTheme', undefined, 'Test Play Theme')}"],
  ['title="Unset Primary Default"', "title={t('developer.unsetPrimaryDefault', undefined, 'Unset Primary Default')}"],
  ['title="Set as Primary Default"', "title={t('developer.setAsPrimaryDefault', undefined, 'Set as Primary Default')}"],
  ['title="Duplicate Theme"', "title={t('developer.duplicateTheme', undefined, 'Duplicate Theme')}"],
  ['title="Delete Theme"', "title={t('developer.deleteTheme', undefined, 'Delete Theme')}"],
  ['<span>Test</span>', "<span>{t('developer.test', undefined, 'Test')}</span>"],
  ['<span>Configure</span>', "<span>{t('developer.configure', undefined, 'Configure')}</span>"],
  ['Engine Specifications & Physics Baseline', "{t('developer.engineSpecifications', undefined, 'Engine Specifications & Physics Baseline')}"],
  ['Game Engine Key', "{t('developer.gameEngineKey', undefined, 'Game Engine Key')}"],
  ['Mapped to engine module in registry', "{t('developer.mappedToEngineModule', undefined, 'Mapped to engine module in registry')}"],
  ['Ownership Model', "{t('developer.ownershipModel', undefined, 'Ownership Model')}"],
  ['Platform-wide standard game', "{t('developer.platformWideGame', undefined, 'Platform-wide standard game')}"],
  ['Active Default Theme', "{t('developer.activeDefaultTheme', undefined, 'Active Default Theme')}"],
  ['Theme provided to new tenants', "{t('developer.themeProvidedToNewTenants', undefined, 'Theme provided to new tenants')}"],
  ['<h3 className="text-sm font-bold text-slate-100">Unset Primary Default?</h3>', "<h3 className=\"text-sm font-bold text-slate-100\">{t('developer.unsetPrimaryDefaultConfirm', undefined, 'Unset Primary Default?')}</h3>"],
  ['Current Primary Default', "{t('developer.currentPrimaryDefault', undefined, 'Current Primary Default')}"],
]);

// 8. DeveloperGamePricingManager.tsx
replaceInFile('src/components/developer/DeveloperGamePricingManager.tsx', [
  ['Loading game pricing tiers...', "{t('developer.loadingPricingTiers', undefined, 'Loading game pricing tiers...')}"],
  ['<span>Base Tier</span>', "<span>{t('developer.baseTier', undefined, 'Base Tier')}</span>"],
  ['per event activation', "{t('developer.perEventActivation', undefined, 'per event activation')}"],
  ['title="Edit Tier"', "title={t('developer.editTier', undefined, 'Edit Tier')}"],
  ['title="Delete Tier"', "title={t('developer.deleteTier', undefined, 'Delete Tier')}"],
  ['<label className="text-xs font-semibold text-slate-300">Minimum Days</label>', "<label className=\"text-xs font-semibold text-slate-300\">{t('developer.minimumDays', undefined, 'Minimum Days')}</label>"],
  ['<label className="text-xs font-semibold text-slate-300">Maximum Days</label>', "<label className=\"text-xs font-semibold text-slate-300\">{t('developer.maximumDays', undefined, 'Maximum Days')}</label>"],
  ['Unlimited (e.g. 91+)', "{t('developer.unlimitedDays', undefined, 'Unlimited (e.g. 91+)')}"],
  ['<span>Active Tier</span>', "<span>{t('developer.activeTier', undefined, 'Active Tier')}</span>"],
  ['Base Tier (Primary 1-day quote)', "{t('developer.baseTierPrimaryQuote', undefined, 'Base Tier (Primary 1-day quote)')}"],
  ['Start Date (Inclusive)', "{t('event.startDateInclusive', undefined, 'Start Date (Inclusive)')}"],
  ['End Date (Inclusive)', "{t('event.endDateInclusive', undefined, 'End Date (Inclusive)')}"],
  ['Total Calendar Days:', "{t('developer.totalCalendarDays', undefined, 'Total Calendar Days:')}"],
  ['Matched Rule:', "{t('developer.matchedRule', undefined, 'Matched Rule:')}"],
  ['Calculated Event Price', "{t('developer.calculatedEventPrice', undefined, 'Calculated Event Price')}"],
  ['Avg / Day', "{t('developer.avgPerDay', undefined, 'Avg / Day')}"],
]);

// 9. DeveloperPricingManager.tsx
replaceInFile('src/components/developer/DeveloperPricingManager.tsx', [
  ['<span>Duration Tiers</span>', "<span>{t('developer.durationTiers', undefined, 'Duration Tiers')}</span>"],
  ['<span>Platform Events</span>', "<span>{t('developer.platformEvents', undefined, 'Platform Events')}</span>"],
  ['<span>Custom Overrides</span>', "<span>{t('developer.customOverrides', undefined, 'Custom Overrides')}</span>"],
  ['<span>Credit Coverage</span>', "<span>{t('developer.creditCoverage', undefined, 'Credit Coverage')}</span>"],
  ['<span>20% Cap</span>', "<span>{t('developer.cap20Pct', undefined, '20% Cap')}</span>"],
]);

// 10. DeveloperGamesList.tsx
replaceInFile('src/components/developer/DeveloperGamesList.tsx', [
  ['title="Cannot activate: Game engine is under development"', "title={t('developer.gameUnderDevelopment', undefined, 'Cannot activate: Game engine is under development')}"],
]);

// 11. DeveloperErrorLogs.tsx
replaceInFile('src/components/developer/DeveloperErrorLogs.tsx', [
  ['aria-label="Filter by Time Range"', "aria-label={t('developer.filterByTimeRange', undefined, 'Filter by Time Range')}"],
  ['<span>All Time</span>', "<span>{t('developer.allTime', undefined, 'All Time')}</span>"],
  ['<span>Last 24 Hours</span>', "<span>{t('developer.last24Hours', undefined, 'Last 24 Hours')}</span>"],
  ['<span>Last 7 Days</span>', "<span>{t('developer.last7Days', undefined, 'Last 7 Days')}</span>"],
  ['<span>Last 30 Days</span>', "<span>{t('developer.last30Days', undefined, 'Last 30 Days')}</span>"],
  ['<span>Active filters applied</span>', "<span>{t('developer.activeFiltersApplied', undefined, 'Active filters applied')}</span>"],
  ['<th className="px-4 py-3 text-left font-semibold">Status & Time</th>', "<th className=\"px-4 py-3 text-left font-semibold\">{t('developer.statusAndTime', undefined, 'Status & Time')}</th>"],
  ['<th className="px-4 py-3 text-left font-semibold">Request / Correlation ID</th>', "<th className=\"px-4 py-3 text-left font-semibold\">{t('developer.requestCorrelationId', undefined, 'Request / Correlation ID')}</th>"],
  ['<th className="px-4 py-3 text-left font-semibold">Method & Endpoint</th>', "<th className=\"px-4 py-3 text-left font-semibold\">{t('developer.methodAndEndpoint', undefined, 'Method & Endpoint')}</th>"],
  ['<th className="px-4 py-3 text-left font-semibold">Service</th>', "<th className=\"px-4 py-3 text-left font-semibold\">{t('developer.service', undefined, 'Service')}</th>"],
  ['<th className="px-4 py-3 text-left font-semibold">Error Message / Type</th>', "<th className=\"px-4 py-3 text-left font-semibold\">{t('developer.errorMessageType', undefined, 'Error Message / Type')}</th>"],
  ['<th className="px-4 py-3 text-right font-semibold">Action</th>', "<th className=\"px-4 py-3 text-right font-semibold\">{t('common.actions', undefined, 'Action')}</th>"],
  ['title="Copy full Request ID"', "title={t('developer.copyFullRequestId', undefined, 'Copy full Request ID')}"],
  ['<span>Inspect</span>', "<span>{t('developer.inspect', undefined, 'Inspect')}</span>"],
  ['<span>Rows per page:</span>', "<span>{t('developer.rowsPerPage', undefined, 'Rows per page:')}</span>"],
  ['aria-label="Rows per page"', "aria-label={t('developer.rowsPerPage', undefined, 'Rows per page')}"]
]);

// 12. DeveloperOrganizationDetail.tsx
replaceInFile('src/components/developer/DeveloperOrganizationDetail.tsx', [
  ['<span>Back to Organizations</span>', "<span>{t('developer.backToOrganizations', undefined, 'Back to Organizations')}</span>"],
  ['Loading organization details and ledger...', "{t('developer.loadingOrgDetails', undefined, 'Loading organization details and ledger...')}"],
  ['<h3 className="text-base font-bold text-white">Error Loading Organization</h3>', "<h3 className=\"text-base font-bold text-white\">{t('developer.errorLoadingOrg', undefined, 'Error Loading Organization')}</h3>"],
  ['<h3 className="text-sm font-bold text-white">Wallet & Ledger Balances</h3>', "<h3 className=\"text-sm font-bold text-white\">{t('developer.walletAndLedgerBalances', undefined, 'Wallet & Ledger Balances')}</h3>"],
  ['<span>Financial Integrity Guard:</span>', "<span>{t('developer.financialIntegrityGuard', undefined, 'Financial Integrity Guard:')}</span>"],
  ['<span>Paid + All Event Credits</span>', "<span>{t('developer.paidPlusEventCredits', undefined, 'Paid + All Event Credits')}</span>"],
  ['<span>Deposited cash balance</span>', "<span>{t('developer.depositedCashBalance', undefined, 'Deposited cash balance')}</span>"],
  ['<span>Promotional manual grant</span>', "<span>{t('developer.promotionalManualGrant', undefined, 'Promotional manual grant')}</span>"],
  ['<span>RM300 review reward</span>', "<span>{t('developer.reviewReward300', undefined, 'RM300 review reward')}</span>"],
  ['<span>Deposit bonus credits</span>', "<span>{t('developer.depositBonusCredits', undefined, 'Deposit bonus credits')}</span>"],
  ['No events created yet.', "{t('developer.noEventsCreatedYet', undefined, 'No events created yet.')}"],
  ['<th className="px-4 py-3 text-left font-semibold">Member</th>', "<th className=\"px-4 py-3 text-left font-semibold\">{t('developer.memberCol', undefined, 'Member')}</th>"],
  ['<th className="px-4 py-3 text-left font-semibold">Email</th>', "<th className=\"px-4 py-3 text-left font-semibold\">{t('auth.email', undefined, 'Email')}</th>"],
  ['<th className="px-4 py-3 text-left font-semibold">Role</th>', "<th className=\"px-4 py-3 text-left font-semibold\">{t('common.role', undefined, 'Role')}</th>"],
  ['<th className="px-4 py-3 text-left font-semibold">Joined Date</th>', "<th className=\"px-4 py-3 text-left font-semibold\">{t('developer.joinedDateCol', undefined, 'Joined Date')}</th>"],
  ['<th className="px-4 py-3 text-left font-semibold">Event Title</th>', "<th className=\"px-4 py-3 text-left font-semibold\">{t('developer.eventTitleCol', undefined, 'Event Title')}</th>"],
  ['<th className="px-4 py-3 text-left font-semibold">Game</th>', "<th className=\"px-4 py-3 text-left font-semibold\">{t('common.game', undefined, 'Game')}</th>"],
  ['<th className="px-4 py-3 text-left font-semibold">Status</th>', "<th className=\"px-4 py-3 text-left font-semibold\">{t('common.status', undefined, 'Status')}</th>"],
  ['<th className="px-4 py-3 text-left font-semibold">Event Price</th>', "<th className=\"px-4 py-3 text-left font-semibold\">{t('developer.eventPriceCol', undefined, 'Event Price')}</th>"],
  ['<th className="px-4 py-3 text-left font-semibold">Created</th>', "<th className=\"px-4 py-3 text-left font-semibold\">{t('developer.createdCol', undefined, 'Created')}</th>"],
  ['<th className="px-4 py-3 text-left font-semibold">Public Link</th>', "<th className=\"px-4 py-3 text-left font-semibold\">{t('developer.publicLinkCol', undefined, 'Public Link')}</th>"],
  ['<span>Open</span>', "<span>{t('common.open', undefined, 'Open')}</span>"],
  ['<h3 className="text-sm font-bold text-white">Source of Truth</h3>', "<h3 className=\"text-sm font-bold text-white\">{t('developer.sourceOfTruth', undefined, 'Source of Truth')}</h3>"],
  ['<th className="px-4 py-3 text-left font-semibold">Type / Description</th>', "<th className=\"px-4 py-3 text-left font-semibold\">{t('developer.typeDescriptionCol', undefined, 'Type / Description')}</th>"],
  ['<th className="px-4 py-3 text-left font-semibold">Amount</th>', "<th className=\"px-4 py-3 text-left font-semibold\">{t('developer.amount', undefined, 'Amount')}</th>"],
  ['<th className="px-4 py-3 text-left font-semibold">Balance After</th>', "<th className=\"px-4 py-3 text-left font-semibold\">{t('developer.balanceAfterCol', undefined, 'Balance After')}</th>"],
  ['<th className="px-4 py-3 text-left font-semibold">Reference</th>', "<th className=\"px-4 py-3 text-left font-semibold\">{t('developer.referenceCol', undefined, 'Reference')}</th>"],
  ['<th className="px-4 py-3 text-left font-semibold">Timestamp</th>', "<th className=\"px-4 py-3 text-left font-semibold\">{t('developer.timestampCol', undefined, 'Timestamp')}</th>"],
]);

// 13. DeveloperShowcaseReviews.tsx (remaining)
replaceInFile('src/components/developer/DeveloperShowcaseReviews.tsx', [
  ['title="Has Cover Banner"', "title={t('developer.hasCoverBanner', undefined, 'Has Cover Banner')}"],
  ['title="Open Public Showcase in New Tab"', "title={t('developer.openShowcaseNewTab', undefined, 'Open Public Showcase in New Tab')}"],
  ['title="Share Public Showcase URL"', "title={t('developer.shareShowcaseUrl', undefined, 'Share Public Showcase URL')}"],
  ['<span>Link copied</span>', "<span>{t('developer.linkCopied', undefined, 'Link copied')}</span>"],
  ['<span>Approve Reward (RM300)</span>', "<span>{t('developer.approveReward300', undefined, 'Approve Reward (RM300)')}</span>"],
  ['<span>Block Showcase</span>', "<span>{t('developer.blockShowcase', undefined, 'Block Showcase')}</span>"],
  ['<span>Unblock Showcase</span>', "<span>{t('developer.unblockShowcase', undefined, 'Unblock Showcase')}</span>"],
  ['<span>Soft Delete Showcase</span>', "<span>{t('developer.softDeleteShowcase', undefined, 'Soft Delete Showcase')}</span>"],
]);

// 14. DeveloperEmailSettings.tsx
replaceInFile('src/components/developer/DeveloperEmailSettings.tsx', [
  ['<span>Production Security Architecture</span>', "<span>{t('developer.prodSecurityArch', undefined, 'Production Security Architecture')}</span>"],
  ['<strong className="text-white">Server-Side AES-256-GCM:</strong> Refresh tokens are encrypted with a 256-bit secret key and never exposed to the frontend browser.', "<strong className=\"text-white\">{t('developer.serverSideAes', undefined, 'Server-Side AES-256-GCM:')}</strong> {t('developer.serverSideAesDesc', undefined, 'Refresh tokens are encrypted with a 256-bit secret key and never exposed to the frontend browser.')}"],
  ['<strong className="text-white">HMAC-Signed OAuth State:</strong> Anti-CSRF verification prevents unauthorized callback hijacking.', "<strong className=\"text-white\">{t('developer.hmacSignedState', undefined, 'HMAC-Signed OAuth State:')}</strong> {t('developer.hmacSignedStateDesc', undefined, 'Anti-CSRF verification prevents unauthorized callback hijacking.')}"],
  ['<strong className="text-white">Single Platform Sender:</strong> Individual customers never connect personal inboxes; all team invites originate from the verified EventGameStudio platform address.', "<strong className=\"text-white\">{t('developer.singlePlatformSender', undefined, 'Single Platform Sender:')}</strong> {t('developer.singlePlatformSenderDesc', undefined, 'Individual customers never connect personal inboxes; all team invites originate from the verified EventGameStudio platform address.')}"],
  ['<strong className="text-white">Zero Third-Party Relays:</strong> No SMTP relays, Nodemailer servers, or untrusted middleman services are used.', "<strong className=\"text-white\">{t('developer.zeroThirdPartyRelays', undefined, 'Zero Third-Party Relays:')}</strong> {t('developer.zeroThirdPartyRelaysDesc', undefined, 'No SMTP relays, Nodemailer servers, or untrusted middleman services are used.')}"],
]);

// 15. DeveloperContactSettings.tsx
replaceInFile('src/components/developer/DeveloperContactSettings.tsx', [
  ['<span>Channel Configuration</span>', "<span>{t('developer.channelConfiguration', undefined, 'Channel Configuration')}</span>"],
  ['<span>Received Enquiries</span>', "<span>{t('developer.receivedEnquiries', undefined, 'Received Enquiries')}</span>"],
  ['<h3 className="text-sm font-bold text-white">Client Enquiries & Form Submissions</h3>', "<h3 className=\"text-sm font-bold text-white\">{t('developer.clientEnquiriesAndSubmissions', undefined, 'Client Enquiries & Form Submissions')}</h3>"],
  ['placeholder="Search ticket, name, email..."', "placeholder={t('developer.searchTicketPlaceholder', undefined, 'Search ticket, name, email...')}"],
  ['Loading received enquiries...', "{t('developer.loadingReceivedEnquiries', undefined, 'Loading received enquiries...')}"],
  ['<p className="text-xs text-slate-500">No Enquiries Received Yet</p>', "<p className=\"text-xs text-slate-500\">{t('developer.noEnquiriesReceivedYet', undefined, 'No Enquiries Received Yet')}</p>"],
  ['<span>Test WhatsApp Link</span>', "<span>{t('developer.testWhatsAppLink', undefined, 'Test WhatsApp Link')}</span>"],
  ['<span>Test Mailto Link</span>', "<span>{t('developer.testMailtoLink', undefined, 'Test Mailto Link')}</span>"],
  ['<h3 className="text-sm font-bold text-white">Public Surface Impact</h3>', "<h3 className=\"text-sm font-bold text-white\">{t('developer.publicSurfaceImpact', undefined, 'Public Surface Impact')}</h3>"],
  ['<span>Save Contact Settings</span>', "<span>{t('developer.saveContactSettings', undefined, 'Save Contact Settings')}</span>"],
]);

console.log('Batch 3 migration executed.');
