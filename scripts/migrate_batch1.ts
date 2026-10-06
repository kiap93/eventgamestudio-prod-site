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

// 1. ThemeEditor.tsx
replaceInFile('src/components/studio/ThemeEditor.tsx', [
  ['<span>1. Visuals</span>', "<span>1. {t('studio.tabs.visuals', undefined, 'Visuals')}</span>"],
  [
    `              <span>
                {isReactionTheme(draftTheme)
                  ? '2. Gantry & Lights'
                  : isMemoryMatchTheme(draftTheme)
                  ? '2. Card Pairs'
                  : '2. Items'}
              </span>`,
    `              <span>
                {isReactionTheme(draftTheme)
                  ? \`2. \${t('studio.gantryAndLights', undefined, 'Gantry & Lights')}\`
                  : isMemoryMatchTheme(draftTheme)
                  ? \`2. \${t('studio.cardPairs', undefined, 'Card Pairs')}\`
                  : \`2. \${t('studio.tabs.items', undefined, 'Items')}\`}
              </span>`
  ],
  ['<span>3. Gameplay</span>', "<span>3. {t('studio.tabs.gameplay', undefined, 'Gameplay')}</span>"],
  ['<span>4. Audio</span>', "<span>4. {t('studio.tabs.audio', undefined, 'Audio')}</span>"],
  ['<span>5. Branding</span>', "<span>5. {t('studio.tabs.branding', undefined, 'Branding')}</span>"],
  ['<span>6. Layout</span>', "<span>6. {t('studio.tabs.layout', undefined, 'Layout')}</span>"],
  ['<span>7. Game Screens</span>', "<span>7. {t('studio.tabs.screens', undefined, 'Game Screens')}</span>"],
  ['<span>You have unsaved changes</span>', "<span>{t('studio.unsavedChangesBanner', undefined, 'You have unsaved changes')}</span>"],
]);

// 2. ThemeList.tsx
replaceInFile('src/components/studio/ThemeList.tsx', [
  ['<span>MY THEMES</span>', "<span>{t('studio.myThemesTab', undefined, 'MY THEMES')}</span>"],
]);

// 3. EditEventDialog.tsx
replaceInFile('src/components/events/EditEventDialog.tsx', [
  ['Active for whole calendar day{startDate === endDate ? \'\' : \'s\'}:', "{t('event.activeForWholeCalendarDays', { plural: startDate === endDate ? '' : 's' }, 'Active for whole calendar day')}"],
  ['{isPaid && <span className="ml-2 text-slate-500">· Duration locked to paid license</span>}', "{isPaid && <span className=\"ml-2 text-slate-500\">{t('event.durationLockedPaid', undefined, '· Duration locked to paid license')}</span>}"],
]);

// 4. AcceptInvitePage.tsx
replaceInFile('src/components/auth/AcceptInvitePage.tsx', [
  ['<span>Go to Dashboard</span>', "<span>{t('auth.goToDashboard', undefined, 'Go to Dashboard')}</span>"],
  ['<span>Email Code</span>', "<span>{t('auth.emailCode', undefined, 'Email Code')}</span>"],
  ['<span className="text-[10px] text-slate-400">6 digits</span>', "<span className=\"text-[10px] text-slate-400\">{t('auth.sixDigits', undefined, '6 digits')}</span>"],
  ['placeholder="Your Name"', "placeholder={t('auth.yourNamePlaceholder', undefined, 'Your Name')}"],
  ['<span className="text-[10px] text-slate-500">min. 8 chars</span>', "<span className=\"text-[10px] text-slate-500\">{t('auth.min8Chars', undefined, 'min. 8 chars')}</span>"],
  ['placeholder="Enter password (min 8 characters)"', "placeholder={t('auth.enterPasswordMin8', undefined, 'Enter password (min 8 characters)')}"],
  ['placeholder="Confirm password"', "placeholder={t('auth.confirmPasswordPlaceholder', undefined, 'Confirm password')}"],
  ['aria-label={showPassword ? \'Hide password\' : \'Show password\'}', "aria-label={showPassword ? t('auth.hidePassword', undefined, 'Hide password') : t('auth.showPassword', undefined, 'Show password')}"],
  ['aria-label={showConfirmPassword ? \'Hide confirm password\' : \'Show confirm password\'}', "aria-label={showConfirmPassword ? t('auth.hideConfirmPassword', undefined, 'Hide confirm password') : t('auth.showConfirmPassword', undefined, 'Show confirm password')}"],
  ['8+ characters', "{t('auth.chars8Plus', undefined, '8+ characters')}"],
  ['Letter', "{t('auth.pwdLetter', undefined, 'Letter')}"],
  ['Number', "{t('auth.pwdNumber', undefined, 'Number')}"],
  ['{passwordsMatch ? \'Passwords match\' : \'Passwords do not match\'}', "{passwordsMatch ? t('auth.passwordsMatch', undefined, 'Passwords match') : t('auth.passwordsDoNotMatch', undefined, 'Passwords do not match')}"],
]);

// 5. ArcadeUI.tsx
replaceInFile('src/components/ArcadeUI.tsx', [
  ['<h4 className="font-bold text-amber-400 mb-1">⚡ Controls</h4>', "<h4 className=\"font-bold text-amber-400 mb-1\">⚡ {t('game.controls', undefined, 'Controls')}</h4>"],
  ['<li><strong>Keyboard:</strong> Left/Right arrow keys or A/D keys</li>', "<li><strong>{t('game.keyboard', undefined, 'Keyboard:')}</strong> {t('game.keyboardControls', undefined, 'Left/Right arrow keys or A/D keys')}</li>"],
  ['<li><strong>Mouse/Touch:</strong> Move cursor or drag finger horizontally across screen</li>', "<li><strong>{t('game.mouseTouch', undefined, 'Mouse/Touch:')}</strong> {t('game.mouseTouchControls', undefined, 'Move cursor or drag finger horizontally across screen')}</li>"],
  ['<h4 className="font-bold text-teal-400">🎨 Multi-Theme System</h4>', "<h4 className=\"font-bold text-teal-400\">🎨 {t('game.multiThemeSystem', undefined, 'Multi-Theme System')}</h4>"],
]);

// 6. LiveThemePreview.tsx
replaceInFile('src/components/studio/LiveThemePreview.tsx', [
  ['title="Switch to full-page live playable game mode"', "title={t('studio.switchLiveMode', undefined, 'Switch to full-page live playable game mode')}"],
  ['title="Toggle between Interactive Player Control and Auto-Attract Simulation"', "title={t('studio.toggleInteractiveSim', undefined, 'Toggle between Interactive Player Control and Auto-Attract Simulation')}"],
  ['<span>Play Live Game</span>', "<span>{t('studio.playLiveGame', undefined, 'Play Live Game')}</span>"],
  ['<span>Portrait</span>', "<span>{t('studio.portraitLabel', undefined, 'Portrait')}</span>"],
  ['<span>Landscape</span>', "<span>{t('studio.landscapeLabel', undefined, 'Landscape')}</span>"],
  ['title="Restart simulation"', "title={t('studio.restartSimulation', undefined, 'Restart simulation')}"],
  ['title="Close Fullscreen (Esc)"', "title={t('studio.closeFullscreen', undefined, 'Close Fullscreen (Esc)')}"],
  ['<span>Close</span>', "<span>{t('common.close', undefined, 'Close')}</span>"],
  ['title="Close Settings"', "title={t('studio.closeSettings', undefined, 'Close Settings')}"],
  ['<span>Active Theme</span>', "<span>{t('studio.activeTheme', undefined, 'Active Theme')}</span>"],
  ['<span>50% (Gentle)</span>', "<span>{t('studio.speedGentle', undefined, '50% (Gentle)')}</span>"],
  ['<span>100% (Standard)</span>', "<span>{t('studio.speedStandard', undefined, '100% (Standard)')}</span>"],
  ['<span>150% (Intense)</span>', "<span>{t('studio.speedIntense', undefined, '150% (Intense)')}</span>"],
  ['<span>Restart Simulation</span>', "<span>{t('studio.restartSimulation', undefined, 'Restart Simulation')}</span>"],
  ['<span>Apply & Resume</span>', "<span>{t('studio.applyAndResume', undefined, 'Apply & Resume')}</span>"],
  ['Instant Drop Tester:', "{t('studio.instantDropTester', undefined, 'Instant Drop Tester:')}"],
  ['Drop:', "{t('studio.dropLabel', undefined, 'Drop:')}"],
  ['title="Exit Fullscreen Mode (Esc)"', "title={t('studio.exitFullscreenModeEsc', undefined, 'Exit Fullscreen Mode (Esc)')}"],
  ['<span>Exit Fullscreen</span>', "<span>{t('studio.exitFullscreen', undefined, 'Exit Fullscreen')}</span>"],
  ['Click, tap, or press SPACE on canvas to react as soon as lights go out!', "{t('game.reactionTapInstructions', undefined, 'Click, tap, or press SPACE on canvas to react as soon as lights go out!')}"],
]);

console.log('Batch 1 migration script executed.');
