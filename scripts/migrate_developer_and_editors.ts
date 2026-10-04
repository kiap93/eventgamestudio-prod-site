import fs from 'fs';
import path from 'path';

function replaceInFile(filePath: string, replacements: Array<[string | RegExp, string]>) {
  if (!fs.existsSync(filePath)) {
    console.warn(`File not found: ${filePath}`);
    return;
  }
  let content = fs.readFileSync(filePath, 'utf8');
  let count = 0;
  for (const [target, replacement] of replacements) {
    if (typeof target === 'string') {
      if (content.includes(target)) {
        content = content.replace(target, replacement);
        count++;
      }
    } else {
      if (target.test(content)) {
        content = content.replace(target, replacement);
        count++;
      }
    }
  }
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Updated ${filePath}: ${count} replacements applied.`);
}

// 1. DeveloperPricingManager.tsx
replaceInFile('src/components/developer/DeveloperPricingManager.tsx', [
  ['Platform Default Base Price (1 Day)', "{t('developer.platformDefaultBasePrice', undefined, 'Platform Default Base Price (1 Day)')}"],
  ['Authoritative base price fallback applied to 1-day events across all organizations', "{t('developer.platformDefaultBasePriceDesc', undefined, 'Authoritative base price fallback applied to 1-day events across all organizations')}"],
  ['Edit Base', "{t('developer.editBase', undefined, 'Edit Base')}"],
  ['/ 1 calendar day', "{t('developer.calendarDay', undefined, '/ 1 calendar day')}"],
  ['Server-authoritative database setting', "{t('developer.serverAuthSetting', undefined, 'Server-authoritative database setting')}"],
  ['Active tier rules', "{t('developer.activeTierRules', undefined, 'Active tier rules')}"],
  ['Across all orgs', "{t('developer.acrossAllOrgs', undefined, 'Across all orgs')}"],
  ['Admin custom rates', "{t('developer.adminCustomRates', undefined, 'Admin custom rates')}"],
  ['Top-up bonus max', "{t('developer.topUpBonusMax', undefined, 'Top-up bonus max')}"],
  ['Duration-Based Pricing Tiers', "{t('developer.durationBasedPricingTiers', undefined, 'Duration-Based Pricing Tiers')}"],
  ['Add Duration Tier', "{t('developer.addDurationTier', undefined, 'Add Duration Tier')}"],
  ['Duration Range', "{t('developer.durationRange', undefined, 'Duration Range')}"],
  ['Min Days', "{t('developer.minDaysHeader', undefined, 'Min Days')}"],
  ['Max Days', "{t('developer.maxDaysHeader', undefined, 'Max Days')}"],
  ['Authoritative Price', "{t('developer.authoritativePrice', undefined, 'Authoritative Price')}"],
  ['Daily Equivalent', "{t('developer.dailyEquivalent', undefined, 'Daily Equivalent')}"],
  ['title="Edit Tier"', "title={t('developer.editTier', undefined, 'Edit Tier')}"],
  ['title="Delete Tier"', "title={t('developer.deleteTier', undefined, 'Delete Tier')}"],
  ['Duration Pricing Simulator', "{t('developer.durationPricingSimulator', undefined, 'Duration Pricing Simulator')}"],
  ['Calculated Duration:', "{t('developer.calculatedDuration', undefined, 'Calculated Duration:')}"],
  ['Simulated Quote:', "{t('developer.simulatedQuote', undefined, 'Simulated Quote:')}"],
  ['Event Pricing Inventory', "{t('developer.eventPricingInventory', undefined, 'Event Pricing Inventory')}"],
  ['placeholder="Search event or organization..."', "placeholder={t('developer.searchEventOrOrg', undefined, 'Search event or organization...')}"],
  ['All Pricing Types', "{t('developer.allPricingTypes', undefined, 'All Pricing Types')}"],
  ['Custom Overrides Only', "{t('developer.customOverridesOnly', undefined, 'Custom Overrides Only')}"],
  ['Standard Tiers Only', "{t('developer.standardTiersOnly', undefined, 'Standard Tiers Only')}"],
  ['All Event & Payment Statuses', "{t('developer.allStatuses', undefined, 'All Event & Payment Statuses')}"],
  ['Event: DRAFT', "{t('developer.eventDraft', undefined, 'Event: DRAFT')}"],
  ['Event: LIVE', "{t('developer.eventLive', undefined, 'Event: LIVE')}"],
  ['Event: COMPLETED', "{t('developer.eventCompleted', undefined, 'Event: COMPLETED')}"],
  ['Event: CANCELLED', "{t('developer.eventCancelled', undefined, 'Event: CANCELLED')}"],
  ['Payment: PAID', "{t('developer.paymentPaid', undefined, 'Payment: PAID')}"],
  ['Payment: UNPAID', "{t('developer.paymentUnpaid', undefined, 'Payment: UNPAID')}"],
  ['Loading event pricing ledger...', "{t('developer.loadingEventPricing', undefined, 'Loading event pricing ledger...')}"],
  ['No events found', "{t('developer.noEventsFound', undefined, 'No events found')}"],
  ['Try adjusting your search or filters.', "{t('developer.adjustSearchOrFilters', undefined, 'Try adjusting your search or filters.')}"],
  ['Event Name', "{t('developer.eventName', undefined, 'Event Name')}"],
  ['Duration & Dates', "{t('developer.durationAndDates', undefined, 'Duration & Dates')}"],
  ['Effective Price', "{t('developer.effectivePrice', undefined, 'Effective Price')}"],
  ['Pricing Status', "{t('developer.pricingStatus', undefined, 'Pricing Status')}"],
  ['Event Status', "{t('developer.eventStatus', undefined, 'Event Status')}"],
  ['Payment Status', "{t('developer.paymentStatus', undefined, 'Payment Status')}"],
  ['Pending Quote', "{t('developer.pendingQuote', undefined, 'Pending Quote')}"],
  ['title="Edit Price"', "title={t('developer.editPrice', undefined, 'Edit Price')}"],
  ['<span>Edit Price</span>', "<span>{t('developer.editPrice', undefined, 'Edit Price')}</span>"],
  ['title="Manually override status & reactivate event"', "title={t('developer.reactivateEvent', undefined, 'Manually override status & reactivate event')}"],
  ['Configure day range and fixed rate', "{t('developer.configureDayRange', undefined, 'Configure day range and fixed rate')}"],
  ['Edit Event Price', "{t('developer.editEventPriceTitle', undefined, 'Edit Event Price')}"],
  ['Current Effective Price:', "{t('developer.currentEffectivePrice', undefined, 'Current Effective Price:')}"],
  ['Saving Price...', "{t('developer.savingPrice', undefined, 'Saving Price...')}"],
  ['Saving Base...', "{t('developer.savingBase', undefined, 'Saving Base...')}"],
  ['Save Platform Base', "{t('developer.savePlatformBase', undefined, 'Save Platform Base')}"],
  ['Save Event Price', "{t('developer.saveEventPriceBtn', undefined, 'Save Event Price')}"],
]);

// 2. DeveloperShowcaseReviews.tsx
replaceInFile('src/components/developer/DeveloperShowcaseReviews.tsx', [
  ['title="Refresh Pending Reward Queue"', "title={t('developer.refreshPendingRewardQueue', undefined, 'Refresh Pending Reward Queue')}"],
  ['<span>Sync Queue</span>', "<span>{t('developer.syncQueue', undefined, 'Sync Queue')}</span>"],
  ['Checking pending reward approvals...', "{t('developer.checkingPendingRewards', undefined, 'Checking pending reward approvals...')}"],
  ['No Rewards Waiting for Approval', "{t('developer.noRewardsWaiting', undefined, 'No Rewards Waiting for Approval')}"],
  ['title="Inspect showcase details, media, and description"', "title={t('developer.inspectShowcaseDetails', undefined, 'Inspect showcase details, media, and description')}"],
  ['View / Inspect', "{t('developer.viewInspect', undefined, 'View / Inspect')}"],
  ['title="Reject Showcase Reward (Showcase remains published)"', "title={t('developer.rejectRewardBtn', undefined, 'Reject Showcase Reward')}"],
  ['<span>Reject Reward</span>', "<span>{t('developer.rejectRewardBtn', undefined, 'Reject Reward')}</span>"],
  ['title="Approve RM300 Showcase Reward"', "title={t('developer.approveRM300Btn', undefined, 'Approve RM300 Showcase Reward')}"],
  ['<span>Approve RM300</span>', "<span>{t('developer.approveRM300Btn', undefined, 'Approve RM300')}</span>"],
  ['placeholder="Search event, org, client..."', "placeholder={t('developer.searchEventOrgClient', undefined, 'Search event, org, client...')}"],
  ['Loading showcase submissions...', "{t('developer.loadingSubmissions', undefined, 'Loading showcase submissions...')}"],
  ['No Showcase Submissions Found', "{t('developer.noSubmissionsFound', undefined, 'No Showcase Submissions Found')}"],
  ['Showcase & Event', "{t('developer.showcaseAndEvent', undefined, 'Showcase & Event')}"],
  ['Organization & Client', "{t('developer.organizationAndClient', undefined, 'Organization & Client')}"],
  ['Created / Published', "{t('developer.createdPublished', undefined, 'Created / Published')}"],
  ['RM300 Reward', "{t('developer.rm300Reward', undefined, 'RM300 Reward')}"],
  ['Visibility', "{t('developer.visibilityHeader', undefined, 'Visibility')}"],
  ['No client specified', "{t('developer.noClientSpecified', undefined, 'No client specified')}"],
  ['RM300 Granted', "{t('developer.rm300Granted', undefined, 'RM300 Granted')}"],
  ['title="Open Public Showcase in New Tab"', "title={t('developer.openPublicShowcaseNewTab', undefined, 'Open Public Showcase in New Tab')}"],
  ['title="Share Public Showcase URL"', "title={t('developer.sharePublicShowcaseUrl', undefined, 'Share Public Showcase URL')}"],
  ['Link copied', "{t('developer.linkCopied', undefined, 'Link copied')}"],
  ['title="Inspect Showcase Details & Media"', "title={t('developer.inspectShowcaseDetails', undefined, 'Inspect Showcase Details & Media')}"],
  ['title="Approve First-Event Showcase Reward (RM300)"', "title={t('developer.approveOwnerRewardTitle', undefined, 'Approve First-Event Showcase Reward (RM300)')}"],
  ['title="Block Showcase (Hide Publicly)"', "title={t('developer.blockShowcaseTitle', undefined, 'Block Showcase (Hide Publicly)')}"],
  ['title="Unblock Showcase (Restore Public Access)"', "title={t('developer.unblockShowcaseTitle', undefined, 'Unblock Showcase (Restore Public Access)')}"],
  ['<span>Unblock</span>', "<span>{t('developer.unblockShowcaseModalTitle', undefined, 'Unblock')}</span>"],
  ['title="Admin Soft Delete Showcase"', "title={t('developer.adminSoftDelete', undefined, 'Admin Soft Delete Showcase')}"],
  ['Approve Owner First-Event Reward', "{t('developer.approveOwnerRewardTitle', undefined, 'Approve Owner First-Event Reward')}"],
  ['Owner-Level Reward Execution', "{t('developer.ownerRewardExecution', undefined, 'Owner-Level Reward Execution')}"],
  ['Reject First-Event Showcase Reward', "{t('developer.rejectFirstEventRewardTitle', undefined, 'Reject First-Event Showcase Reward')}"],
  ['placeholder="e.g. Please provide at least 3 high-resolution photos of the booth activation and ensure the client logo is transparent."', "placeholder={t('developer.rejectFeedbackPlaceholder', undefined, 'e.g. Please provide at least 3 high-resolution photos of the booth activation and ensure the client logo is transparent.')}"],
  ['Showcase Blocked by Moderation', "{t('developer.showcaseBlockedNotice', undefined, 'Showcase Blocked by Moderation')}"],
  ['Showcase Administratively Soft-Deleted', "{t('developer.showcaseSoftDeletedNotice', undefined, 'Showcase Administratively Soft-Deleted')}"],
  ['Loading gallery items...', "{t('developer.loadingGalleryItems', undefined, 'Loading gallery items...')}"],
  ['title="Open original"', "title={t('developer.openOriginal', undefined, 'Open original')}"],
  ['Audit Information:', "{t('developer.auditInfo', undefined, 'Audit Information:')}"],
  ['Unblock Showcase', "{t('developer.unblockShowcaseModalTitle', undefined, 'Unblock Showcase')}"],
  ['Block Showcase', "{t('developer.blockShowcaseModalTitle', undefined, 'Block Showcase')}"],
  ['placeholder="e.g. Contains sensitive client proprietary assets, or violates community guidelines."', "placeholder={t('developer.blockReasonPlaceholder', undefined, 'e.g. Contains sensitive client proprietary assets, or violates community guidelines.')}"],
  ['placeholder="e.g. Sensitive assets reviewed and cleared with event organizer."', "placeholder={t('developer.unblockReasonPlaceholder', undefined, 'e.g. Sensitive assets reviewed and cleared with event organizer.')}"],
  ['Soft Delete Showcase', "{t('developer.softDeleteModalTitle', undefined, 'Soft Delete Showcase')}"],
  ['placeholder="e.g. Inappropriate content, copyright infringement, or spam."', "placeholder={t('developer.softDeleteReasonPlaceholder', undefined, 'e.g. Inappropriate content, copyright infringement, or spam.')}"],
]);

console.log('Migration script completed.');
