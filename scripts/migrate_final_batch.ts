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

// 1. MemoryMatchCustomizer.tsx
replaceExact('src/components/studio/games/MemoryMatchCustomizer.tsx', [
  ['Card Dimensions, Shape & Rotation', "{t('customizers.cardDimensionsShapeRotation', undefined, 'Card Dimensions, Shape & Rotation')}"],
  ['Combo Streak Bonus', "{t('customizers.comboStreakBonus', undefined, 'Combo Streak Bonus')}"],
  ['Leaderboard & Social Display', "{t('customizers.leaderboardSocialDisplay', undefined, 'Leaderboard & Social Display')}"],
  ['Interactive Scaled Canvas Preview (1024 × 576)', "{t('customizers.interactiveScaledCanvasPreview', undefined, 'Interactive Scaled Canvas Preview (1024 × 576)')}"],
  ['Memory Sound FX Previews', "{t('customizers.memorySoundFxPreviews', undefined, 'Memory Sound FX Previews')}"],
]);

// 2. PresetLibraryModal.tsx (result-editor)
replaceExact('src/components/studio/games/result-editor/PresetLibraryModal.tsx', [
  ['title="Delete template"', "title={t('editor.deleteTemplate', undefined, 'Delete template')}"],
]);

// 3. PresetLibraryModal.tsx (start-editor)
replaceExact('src/components/studio/games/start-editor/PresetLibraryModal.tsx', [
  ['title="Delete Template"', "title={t('editor.deleteTemplate', undefined, 'Delete Template')}"],
]);

// 4. ResultScreenBasicEditor.tsx
replaceExact('src/components/studio/games/result-editor/ResultScreenBasicEditor.tsx', [
  ['alt="Result Screen Background"', "alt={t('editor.resultScreenBg', undefined, 'Result Screen Background')}"],
]);

// 5. StartScreenBasicEditor.tsx
replaceExact('src/components/studio/games/start-editor/StartScreenBasicEditor.tsx', [
  ['alt="Start Screen Background"', "alt={t('editor.startScreenBg', undefined, 'Start Screen Background')}"],
]);

// 6. ThemeCard.tsx
replaceExact('src/components/studio/ThemeCard.tsx', [
  ['Formula Reflex', "Formula Reaction Lights"],
]);

// 7. DeveloperContactSettings.tsx
replaceExact('src/components/developer/DeveloperContactSettings.tsx', [
  ['<span className="hidden sm:inline">Refresh</span>', "<span className=\"hidden sm:inline\">{t('common.refresh', undefined, 'Refresh')}</span>"],
]);

// 8. DeveloperGamePricingManager.tsx
replaceExact('src/components/developer/DeveloperGamePricingManager.tsx', [
  ['<span>Add Tier</span>', "<span>{t('developer.addTier', undefined, 'Add Tier')}</span>"],
]);

// 9. DeveloperCustomerInvitations.tsx
replaceExact('src/components/developer/invitations/DeveloperCustomerInvitations.tsx', [
  ['<span>Send Customer Invitation</span>', "<span>{t('developer.sendCustomerInvitationBtn', undefined, 'Send Customer Invitation')}</span>"],
  ['<span className="text-[10px] text-slate-500">Required</span>', "<span className=\"text-[10px] text-slate-500\">{t('common.required', undefined, 'Required')}</span>"],
]);

// 10. DeveloperShowcaseReviews.tsx
replaceExact('src/components/developer/DeveloperShowcaseReviews.tsx', [
  ['<span>View</span>', "<span>{t('common.view', undefined, 'View')}</span>"],
  ['<span>Share</span>', "<span>{t('common.share', undefined, 'Share')}</span>"],
  ['<span>Reason:</span>', "<span>{t('developer.lblReason', undefined, 'Reason:')}</span>"],
]);

console.log('Final batch replacements applied.');
