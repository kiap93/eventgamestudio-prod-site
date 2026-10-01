import fs from 'fs';
import path from 'path';

const IGNORED_STRINGS = new Set([
  'Event Game Studio', 'EventGameStudio', 'RM', 'MYR', 'Stripe', 'HitPay', 'DuitNow',
  'Catch The Brand', 'Catch the Brand', 'Brand Memory Match', 'Formula Reaction Lights',
  'Reaction Time', 'Event Trivia Speed Quiz', 'UTC+8', 'Asia/Singapore',
  'POST', 'GET', 'PUT', 'PATCH', 'DELETE', 'ID', 'UUID', 'PNG', 'JPG', 'SVG', 'WEBP',
  'JSON', 'CSS', 'HTML', 'API', 'URL', 'QR', 'HTTP', 'HTTPS', 'OK', 'px', 's', 'ms',
  '2D', '3D', 'F1', 'UI', 'UX', 'AI', 'PRO', 'VIP', 'LIVE', 'PAID', 'PENDING'
]);

export interface Finding {
  lineNum: number;
  type: string;
  text: string;
}

export function auditFile(filePath: string): Finding[] {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const issues: Finding[] = [];

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    const trimmed = line.trim();
    if (
      trimmed.startsWith('import ') ||
      trimmed.startsWith('//') ||
      trimmed.startsWith('/*') ||
      trimmed.startsWith('*') ||
      trimmed.startsWith('console.')
    ) {
      return;
    }

    // Check for hardcoded JSX text between > and <
    const jsxTextMatches = line.matchAll(/>([^<>{}\n]+)</g);
    for (const match of jsxTextMatches) {
      const text = match[1].trim();
      if (text.length > 1 && /[a-zA-Z]/.test(text)) {
        if (!/^[0-9\s.,\/#!$%\^&\*;:{}=\-_`~()@+?><\[\]'\"|]+$/.test(text)) {
          if (
            !IGNORED_STRINGS.has(text) &&
            !text.startsWith('&') &&
            !text.startsWith('http') &&
            !text.includes('className') &&
            !text.includes('const ') &&
            !text.includes('return ') &&
            !text.includes('function ') &&
            !text.includes('interface ')
          ) {
            issues.push({ lineNum, type: 'JSX_TEXT', text });
          }
        }
      }
    }

    // Check for placeholder="..." where not using t(
    const placeholderMatch = line.match(/placeholder=["']([^"']+)["']/);
    if (placeholderMatch) {
      const text = placeholderMatch[1].trim();
      if (text && !text.startsWith('{') && !IGNORED_STRINGS.has(text)) {
        issues.push({ lineNum, type: 'PLACEHOLDER', text });
      }
    }

    // Check for aria-label="..." where not using t(
    const ariaMatch = line.match(/aria-label=["']([^"']+)["']/);
    if (ariaMatch) {
      const text = ariaMatch[1].trim();
      if (text && !text.startsWith('{') && !IGNORED_STRINGS.has(text)) {
        issues.push({ lineNum, type: 'ARIA_LABEL', text });
      }
    }

    // Check for title="..." where not using t(
    const titleMatch = line.match(/\btitle=["']([^"']+)["']/);
    if (titleMatch) {
      const text = titleMatch[1].trim();
      if (text && !text.startsWith('{') && !IGNORED_STRINGS.has(text)) {
        issues.push({ lineNum, type: 'TITLE_ATTR', text });
      }
    }
  });

  return issues;
}

const batches: Record<string, string[]> = {
  'Batch 1 (Shared)': [
    'src/components/common/LanguageSelector.tsx',
    'src/components/common/CountrySelect.tsx',
    'src/components/common/InternalLink.tsx',
    'src/components/common/SEO.tsx',
    'src/components/notifications/NotificationBell.tsx',
    'src/components/notifications/NotificationCenterModal.tsx',
    'src/components/layout/DashboardLayout.tsx',
    'src/components/shell/GameShell.tsx',
    'src/components/GameContainer.tsx'
  ],
  'Batch 2 (Landing/SEO)': [
    'src/components/landing/LandingPage.tsx',
    'src/components/landing/LandingHeader.tsx',
    'src/components/landing/LandingHero.tsx',
    'src/components/landing/LandingHowItWorks.tsx',
    'src/components/landing/LandingGameShowcase.tsx',
    'src/components/landing/LandingBrandYourGame.tsx',
    'src/components/landing/LandingEventDeployment.tsx',
    'src/components/landing/LandingEventShowcase.tsx',
    'src/components/landing/LandingAgencies.tsx',
    'src/components/landing/LandingBuiltForEvents.tsx',
    'src/components/landing/LandingPricing.tsx',
    'src/components/landing/LandingTopUpPromotion.tsx',
    'src/components/landing/LandingFaq.tsx',
    'src/components/landing/LandingFinalCta.tsx',
    'src/components/landing/LandingFooter.tsx',
    'src/components/landing/LandingDemoModal.tsx',
    'src/components/seo/PublicGameDetailPage.tsx',
    'src/components/seo/PublicGamesPage.tsx',
    'src/components/seo/PublicShowcasesIndexPage.tsx',
    'src/components/seo/SeoLandingPage.tsx'
  ],
  'Batch 3 (Auth/Contact)': [
    'src/components/auth/LoginPage.tsx',
    'src/components/auth/CreateOrganizationPage.tsx',
    'src/components/auth/AcceptInvitePage.tsx',
    'src/components/auth/ResetPasswordPage.tsx',
    'src/components/auth/SetOrganizationCountryModal.tsx',
    'src/components/auth/VerifyEmailPage.tsx',
    'src/components/contact/ContactPage.tsx'
  ],
  'Batch 4 (Events/Showcases)': [
    'src/components/events/EventsPage.tsx',
    'src/components/events/CreateEventDialog.tsx',
    'src/components/events/EditEventDialog.tsx',
    'src/components/events/DeleteEventModal.tsx',
    'src/components/events/CancelEventModal.tsx',
    'src/components/events/EventCalendarView.tsx',
    'src/components/events/EventCard.tsx',
    'src/components/events/EventLeaderboardModal.tsx',
    'src/components/events/EventPaymentModal.tsx',
    'src/components/events/EventPreviewGameView.tsx',
    'src/components/events/EventShowcasePage.tsx',
    'src/components/events/EventShowcaseTab.tsx',
    'src/components/events/EventTranslationsModal.tsx',
    'src/components/events/PublicEventGameView.tsx',
    'src/components/events/PublicShowcaseView.tsx',
    'src/components/events/showcase/ShowcaseMediaCard.tsx',
    'src/components/events/showcase/ShowcaseMediaManager.tsx',
    'src/components/events/showcase/ShowcaseMediaPreviewModal.tsx',
    'src/components/events/showcase/ShowcaseMediaUploadQueue.tsx',
    'src/components/org/TeamMembersPage.tsx'
  ],
  'Batch 5 (Studio/Theme Editor)': [
    'src/components/studio/AudioTab.tsx',
    'src/components/studio/BrandingTab.tsx',
    'src/components/studio/CreateThemeDialog.tsx',
    'src/components/studio/GameCatalogModal.tsx',
    'src/components/studio/GameControlBar.tsx',
    'src/components/studio/GameCustomizerPage.tsx',
    'src/components/studio/GameLayoutHudOverlay.tsx',
    'src/components/studio/GameplayTab.tsx',
    'src/components/studio/ItemsTab.tsx',
    'src/components/studio/LayoutTab.tsx',
    'src/components/studio/LiveThemePreview.tsx',
    'src/components/studio/RenameThemeDialog.tsx',
    'src/components/studio/ScaledGameStage.tsx',
    'src/components/studio/ScreensTab.tsx',
    'src/components/studio/ThemeCard.tsx',
    'src/components/studio/ThemeEditor.tsx',
    'src/components/studio/ThemeList.tsx',
    'src/components/studio/VisualsTab.tsx',
    'src/components/onboarding/ThemeSetupOnboardingPage.tsx'
  ],
  'Batch 6 (Games & Game Editors)': [
    'src/components/studio/games/CatchBrandCustomizer.tsx',
    'src/components/studio/games/MemoryMatchCustomizer.tsx',
    'src/components/studio/games/ReactionGameCustomizer.tsx',
    'src/components/studio/games/ResultScreenVisualEditor.tsx',
    'src/components/studio/games/StartScreenVisualEditor.tsx',
    'src/components/studio/games/start-editor/StartScreenBasicEditor.tsx',
    'src/components/studio/games/start-editor/StartScreenVisualEditorModal.tsx',
    'src/components/studio/games/start-editor/EditorTopBar.tsx',
    'src/components/studio/games/start-editor/LayerTreePanel.tsx',
    'src/components/studio/games/start-editor/PresetLibraryModal.tsx',
    'src/components/studio/games/start-editor/PropertyInspectorPanel.tsx',
    'src/components/studio/games/start-editor/SaveTemplateModal.tsx',
    'src/components/studio/games/result-editor/ResultScreenBasicEditor.tsx',
    'src/components/studio/games/result-editor/ResultScreenVisualEditorModal.tsx',
    'src/components/studio/games/result-editor/EditorTopBar.tsx',
    'src/components/studio/games/result-editor/LayerTreePanel.tsx',
    'src/components/studio/games/result-editor/PresetLibraryModal.tsx',
    'src/components/studio/games/result-editor/PropertyInspectorPanel.tsx',
    'src/components/studio/games/result-editor/SaveTemplateModal.tsx',
    'src/games/catch-brand/CatchBrandGame.tsx',
    'src/games/memory-match/MemoryMatchGame.tsx',
    'src/games/reaction-time/ReactionGame.tsx',
    'src/games/speed-quiz/SpeedQuizUnavailablePlaceholder.tsx'
  ],
  'Batch 7 (Developer/Admin)': [
    'src/components/developer/DeveloperAdminLayout.tsx',
    'src/components/developer/DeveloperAdminPage.tsx',
    'src/components/developer/DeveloperContactSettings.tsx',
    'src/components/developer/DeveloperEmailSettings.tsx',
    'src/components/developer/DeveloperErrorLogs.tsx',
    'src/components/developer/DeveloperGameDetail.tsx',
    'src/components/developer/DeveloperGamePricingManager.tsx',
    'src/components/developer/DeveloperGamesList.tsx',
    'src/components/developer/DeveloperOrganizationDetail.tsx',
    'src/components/developer/DeveloperOrganizationsList.tsx',
    'src/components/developer/DeveloperPlayTestModal.tsx',
    'src/components/developer/DeveloperPricingManager.tsx',
    'src/components/developer/DeveloperShowcaseReviews.tsx',
    'src/components/developer/DeveloperThemeEditor.tsx',
    'src/components/developer/CreateDefaultThemeModal.tsx',
    'src/components/developer/CreateGameModal.tsx'
  ],
  'Batch 8 (Wallet/Payment)': [
    'src/components/wallet/OrganizationWalletPage.tsx',
    'src/components/wallet/PaymentCheckoutModal.tsx',
    'src/components/wallet/TopUpPage.tsx'
  ]
};

for (const [batchName, fileList] of Object.entries(batches)) {
  console.log('\n========================================');
  console.log(batchName);
  console.log('========================================');
  let batchIssues = 0;
  for (const f of fileList) {
    if (!fs.existsSync(f)) {
      console.log('MISSING FILE:', f);
      continue;
    }
    const issues = auditFile(f);
    if (issues.length > 0) {
      console.log('--- ' + f + ' (' + issues.length + ' findings) ---');
      issues.forEach(i => console.log('  L' + i.lineNum + ' [' + i.type + ']: ' + i.text));
      batchIssues += issues.length;
    } else {
      console.log('✓ ' + f + ' (CLEAN)');
    }
  }
  console.log('Total findings in ' + batchName + ': ' + batchIssues);
}
