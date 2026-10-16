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
  ['alt="Card Back"', "alt={t('game.cardBackAlt', undefined, 'Card Back')}"],
  ['<label className="text-[11px] font-semibold text-slate-300">Background Color</label>', "<label className=\"text-[11px] font-semibold text-slate-300\">{t('editor.backgroundColor', undefined, 'Background Color')}</label>"],
  ['<label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">\n                    Quick Color Presets\n                  </label>', "<label className=\"text-[10px] font-semibold text-slate-400 uppercase tracking-wider\">\n                    {t('customizers.quickColorPresets', undefined, 'Quick Color Presets')}\n                  </label>"],
  ['<span className="font-semibold text-slate-300">Background Opacity</span>', "<span className=\"font-semibold text-slate-300\">{t('customizers.backgroundOpacity', undefined, 'Background Opacity')}</span>"],
  ['0% (Transparent)', "{t('customizers.transparentPct', undefined, '0% (Transparent)')}"],
  ['100% (Solid)', "{t('customizers.solidPct', undefined, '100% (Solid)')}"],
]);

// 2. CatchBrandCustomizer.tsx
replaceExact('src/components/studio/games/CatchBrandCustomizer.tsx', [
  ['alt="Current Catcher"', "alt={t('customizers.currentCatcher', undefined, 'Current Catcher')}"],
  ['Interactive Scaled Canvas Preview (1024 × 576)', "{t('customizers.interactiveScaledCanvasPreview', undefined, 'Interactive Scaled Canvas Preview (1024 × 576)')}"],
]);

// 3. VisualsTab.tsx
replaceExact('src/components/studio/VisualsTab.tsx', [
  ['alt="Game Background Preview"', "alt={t('studio.gameBgPreviewAlt', undefined, 'Game Background Preview')}"],
  ['PNG / JPG / WebP', "{t('editor.supportsPngJpgWebp', undefined, 'PNG / JPG / WebP')}"],
  ['alt="Card Back Preview"', "alt={t('studio.cardBackPreviewAlt', undefined, 'Card Back Preview')}"],
]);

// 4. BrandingTab.tsx
replaceExact('src/components/studio/BrandingTab.tsx', [
  ['alt="Client Logo Preview"', "alt={t('studio.clientLogoPreviewAlt', undefined, 'Client Logo Preview')}"],
]);

// 5. GameLayoutHudOverlay.tsx
replaceExact('src/components/studio/GameLayoutHudOverlay.tsx', [
  ['alt="Client Logo"', "alt={t('studio.clientLogoAlt', undefined, 'Client Logo')}"],
]);

// 6. ArcadeUI.tsx
replaceExact('src/components/ArcadeUI.tsx', [
  ['alt="Client Logo"', "alt={t('studio.clientLogoAlt', undefined, 'Client Logo')}"],
  ['Add new themes cleanly by creating a configuration object in', "{t('game.addThemesGuide', undefined, 'Add new themes cleanly by creating a configuration object in')}"],
]);

// 7. LandingHero.tsx
replaceExact('src/components/landing/LandingHero.tsx', [
  ['alt="Catch the Brand Stage Preview"', "alt={t('landing.stagePreviewAlt', undefined, 'Catch the Brand Stage Preview')}"],
  ['alt="Collectible Item"', "alt={t('landing.collectibleItemAlt', undefined, 'Collectible Item')}"],
  ['alt="Bonus Item"', "alt={t('landing.bonusItemAlt', undefined, 'Bonus Item')}"],
  ['alt="Player Catcher"', "alt={t('landing.playerCatcherAlt', undefined, 'Player Catcher')}"],
]);

// 8. LandingBrandYourGame.tsx
replaceExact('src/components/landing/LandingBrandYourGame.tsx', [
  ['alt="Collect item"', "alt={t('landing.collectItemAlt', undefined, 'Collect item')}"],
  ['alt="Bonus item"', "alt={t('landing.bonusItemAlt', undefined, 'Bonus item')}"],
  ['alt="Hazard item"', "alt={t('landing.hazardItemAlt', undefined, 'Hazard item')}"],
  ['alt="Catcher"', "alt={t('landing.catcherAlt', undefined, 'Catcher')}"],
  ['alt="Normal item"', "alt={t('landing.normalItemAlt', undefined, 'Normal item')}"],
]);

// 9. LandingHeader.tsx & PublicShowcaseView.tsx
replaceExact('src/components/landing/LandingHeader.tsx', [
  ['aria-label="EventGameStudio Home"', "aria-label={t('landing.homeAria', undefined, 'EventGameStudio Home')}"],
]);

replaceExact('src/components/events/PublicShowcaseView.tsx', [
  ['aria-label="EventGameStudio Home"', "aria-label={t('landing.homeAria', undefined, 'EventGameStudio Home')}"],
]);

// 10. EventShowcasePage.tsx & EventShowcaseTab.tsx
replaceExact('src/components/events/EventShowcasePage.tsx', [
  ['alt="Client Logo"', "alt={t('showcase.clientLogo', undefined, 'Client Logo')}"],
  ['alt="Showcase Cover"', "alt={t('showcase.coverImage', undefined, 'Showcase Cover')}"],
]);

replaceExact('src/components/events/EventShowcaseTab.tsx', [
  ['alt="Client Logo"', "alt={t('showcase.clientLogo', undefined, 'Client Logo')}"],
  ['alt="Showcase Cover"', "alt={t('showcase.coverImage', undefined, 'Showcase Cover')}"],
]);

// 11. MemoryMatchGame.tsx
replaceExact('src/games/memory-match/MemoryMatchGame.tsx', [
  ['alt="Card Back"', "alt={t('game.cardBackAlt', undefined, 'Card Back')}"],
]);

// 12. VerifyEmailPage.tsx
replaceExact('src/components/auth/VerifyEmailPage.tsx', [
  ['placeholder="you@company.com"', "placeholder={t('auth.emailPlaceholder', undefined, 'you@company.com')}"],
]);

// 13. ContactPage.tsx
replaceExact('src/components/contact/ContactPage.tsx', [
  ['<span>Website</span>', "<span>{t('contact.website', undefined, 'Website')}</span>"],
]);

console.log('Batch 3 & 4 migrations completed.');
