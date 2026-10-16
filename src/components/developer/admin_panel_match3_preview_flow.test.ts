import './setup_test_dom';
import { test, expect } from 'bun:test';
import React from 'react';
import { renderToString } from 'react-dom/server';

// Dynamic imports ensure polyfills from setup_test_dom execute before Phaser imports
const { getThemeGameType, resolveAuthoritativeGameType, normalizeGameType, isMatch3Theme, isCatcherGameTheme } = await import('../../themes/types');
const { normalizeGameTheme } = await import('../../themes/registry');
const { getGameDefinition } = await import('../../games/registry');
const { Match3Game } = await import('../../games/match-3/Match3Game');
const { CatchBrandGame } = await import('../../games/catch-brand/CatchBrandGame');
const { MemoryMatchGame } = await import('../../games/memory-match/MemoryMatchGame');
const { ReactionGame } = await import('../../games/reaction-time/ReactionGame');
const { getGameById } = await import('../../../server/db/games');
const { getSystemThemesByGameId } = await import('../../../server/db/themes');
const { DeveloperPlayTestModal } = await import('./DeveloperPlayTestModal');
const { resolveDeveloperThemeBackground } = await import('./DeveloperGameDetail');
const { LocalizationProvider } = await import('../../context/LocalizationContext');
const { AuthProvider } = await import('../../context/AuthContext');

test('1. Match-3 system theme data and image path are correct and non-catcher', async () => {
  const m3Themes = await getSystemThemesByGameId('match-3');
  expect(m3Themes.length).toBeGreaterThan(0);
  const rawTheme = m3Themes[0];

  // Verify theme properties
  expect(rawTheme.slug).toBe('match-3');
  expect(rawTheme.name).toBe('Match-3 Classic');
  expect(rawTheme.background_url).toBe('/assets/games/match-3/themes/default/background.png');
  expect(rawTheme.background_url).not.toContain('/catch-brand/');

  // Normalized theme must preserve Match-3 background and have null basket_config
  const normalized = normalizeGameTheme(rawTheme);
  expect(normalized.background_url).toBe('/assets/games/match-3/themes/default/background.png');
  expect(normalized.background_url).not.toContain('/catch-brand/');
  expect(normalized.basket_config).toBeNull();
  expect(normalized.items_config).toEqual([]);

  // Verify the real asset file exists on disk
  const fs = await import('fs');
  const path = await import('path');
  const assetPath = path.resolve('public/assets/games/match-3/themes/default/background.png');
  expect(fs.existsSync(assetPath)).toBe(true);

  // Background resolver for theme thumbnail must produce Match-3 artwork
  const m3Game = await getGameById('match-3');
  expect(m3Game).not.toBeNull();
  const resolvedBg = resolveDeveloperThemeBackground(normalized, m3Game!);
  expect(resolvedBg).toBe('/assets/games/match-3/themes/default/background.png');
  expect(resolvedBg).not.toContain('/catch-brand/');
});

test('2. Floating quick-play action launches DeveloperPlayTestModal rendering Match3Game', async () => {
  const m3Game = await getGameById('match-3');
  expect(m3Game).not.toBeNull();
  const m3Themes = await getSystemThemesByGameId('match-3');
  const normalizedTheme = normalizeGameTheme(m3Themes[0]);

  // Simulate what clicking the floating quick-play button does in DeveloperGameDetail:
  // setPlaytestingTheme(theme) -> mounts <DeveloperPlayTestModal theme={theme} gameName={game.name} gameType={game.game_type || game.slug} game={game} />
  const modalProps = {
    theme: normalizedTheme,
    gameName: m3Game!.name,
    gameType: m3Game!.game_type || m3Game!.slug,
    game: m3Game!,
    onClose: () => {},
  };

  const html = renderToString(
    React.createElement(
      LocalizationProvider,
      null,
      React.createElement(
        AuthProvider,
        null,
        React.createElement(DeveloperPlayTestModal, modalProps)
      )
    )
  );

  // Check that the modal rendered Match-3 test play
  expect(html).toContain('match-3');
  expect(html).toContain('TEST PLAY');
  expect(html).toContain(normalizedTheme.name);

  // Trace down to GameShell & getGameDefinition:
  const authoritativeType = resolveAuthoritativeGameType({
    shellGameType: modalProps.gameType,
    game: modalProps.game,
    theme: modalProps.theme,
  });
  expect(authoritativeType).toBe('match-3');

  const gameDef = getGameDefinition(authoritativeType);
  expect(gameDef.id).toBe('match-3');
  expect(gameDef.component).toBe(Match3Game);
  expect(gameDef.component).not.toBe(CatchBrandGame);
});

test('3. Card Test button action launches DeveloperPlayTestModal rendering Match3Game', async () => {
  const m3Game = await getGameById('match-3');
  expect(m3Game).not.toBeNull();
  const m3Themes = await getSystemThemesByGameId('match-3');
  const normalizedTheme = normalizeGameTheme(m3Themes[0]);

  // Both the floating play button and the card "Test" button invoke:
  // setPlaytestingTheme(theme), passing the identical authoritative game props
  const modalElement = React.createElement(
    LocalizationProvider,
    null,
    React.createElement(
      AuthProvider,
      null,
      React.createElement(DeveloperPlayTestModal, {
        theme: normalizedTheme,
        gameName: m3Game!.name,
        gameType: m3Game!.game_type,
        game: m3Game!,
        onClose: () => {},
      })
    )
  );

  const html = renderToString(modalElement);
  expect(html).toContain('match-3');
  expect(html).toContain('Grid:');
  expect(html).toContain('Tiles:');
  expect(html).toContain('Colors');

  const resolvedType = resolveAuthoritativeGameType({
    shellGameType: m3Game!.game_type,
    game: m3Game!,
    theme: normalizedTheme,
  });
  expect(resolvedType).toBe('match-3');
  expect(getGameDefinition(resolvedType).component).toBe(Match3Game);
});

test('4. Theme Editor test-play path receives authoritative game and launches Match3Game', async () => {
  const m3Game = await getGameById('match-3');
  expect(m3Game).not.toBeNull();
  const m3Themes = await getSystemThemesByGameId('match-3');
  const theme = normalizeGameTheme(m3Themes[0]);

  // In DeveloperThemeEditor, loadedGame is fetched for gameId="match-3" and passed into DeveloperPlayTestModal:
  const editorModalProps = {
    theme,
    gameName: m3Game?.name || 'Match-3',
    gameType: m3Game?.game_type || m3Game?.slug || normalizeGameType('match-3', '') || getThemeGameType(theme),
    game: m3Game,
    onClose: () => {},
  };

  const html = renderToString(
    React.createElement(
      LocalizationProvider,
      null,
      React.createElement(
        AuthProvider,
        null,
        React.createElement(DeveloperPlayTestModal, editorModalProps)
      )
    )
  );

  expect(html).toContain('match-3');
  expect(html).toContain('TEST PLAY');

  const resolved = resolveAuthoritativeGameType({
    shellGameType: editorModalProps.gameType,
    game: editorModalProps.game,
    theme: editorModalProps.theme,
  });
  expect(resolved).toBe('match-3');
  expect(getGameDefinition(resolved).component).toBe(Match3Game);
  expect(getGameDefinition(resolved).component).not.toBe(CatchBrandGame);
});

test('5. Conflicting Catch The Brand theme metadata cannot override authoritative Match-3 game type', async () => {
  const m3Game = await getGameById('match-3');
  expect(m3Game).not.toBeNull();

  // Create a theme maliciously or incorrectly tagged with catch-brand properties
  const conflictingTheme = {
    id: 'theme-conflicting-999',
    name: 'Corrupted Catcher Theme',
    slug: 'catch-brand',
    game_type: 'catch-brand',
    background_url: '/assets/games/catch-brand/themes/default/background.png',
    basket_config: {
      imageUrl: '/assets/games/catch-brand/themes/default/basket.png',
    },
    items_config: [
      { id: '1', name: 'Item', points: 10, speedMultiplier: 1, enabled: true, isHazard: false },
    ],
  };

  // When launched from Match-3 admin panel or theme editor:
  const modalProps = {
    theme: conflictingTheme as any,
    gameName: m3Game!.name,
    gameType: m3Game!.game_type,
    game: m3Game!,
    onClose: () => {},
  };

  const html = renderToString(
    React.createElement(
      LocalizationProvider,
      null,
      React.createElement(
        AuthProvider,
        null,
        React.createElement(DeveloperPlayTestModal, modalProps)
      )
    )
  );

  // Authoritative game ("match-3") must take absolute priority over conflicting theme.game_type
  expect(html).toContain('match-3');
  expect(html).toContain('TEST PLAY');

  const resolvedType = resolveAuthoritativeGameType({
    shellGameType: modalProps.gameType,
    game: modalProps.game,
    theme: modalProps.theme,
  });
  expect(resolvedType).toBe('match-3');
  expect(getGameDefinition(resolvedType).component).toBe(Match3Game);
  expect(getGameDefinition(resolvedType).component).not.toBe(CatchBrandGame);
});

test('6. Catch The Brand continues to launch CatchBrandGame properly', async () => {
  const catchGame = await getGameById('catch-brand');
  expect(catchGame).not.toBeNull();
  const catchThemes = await getSystemThemesByGameId('catch-brand');
  const defaultCatchTheme = catchThemes[0];

  const modalProps = {
    theme: defaultCatchTheme,
    gameName: catchGame!.name,
    gameType: catchGame!.game_type,
    game: catchGame!,
    onClose: () => {},
  };

  const html = renderToString(
    React.createElement(
      LocalizationProvider,
      null,
      React.createElement(
        AuthProvider,
        null,
        React.createElement(DeveloperPlayTestModal, modalProps)
      )
    )
  );

  expect(html).toContain('catch-brand');
  expect(html).toContain('TEST PLAY');

  const resolvedType = resolveAuthoritativeGameType({
    shellGameType: modalProps.gameType,
    game: modalProps.game,
    theme: modalProps.theme,
  });
  expect(resolvedType).toBe('catch-brand');
  expect(getGameDefinition(resolvedType).component).toBe(CatchBrandGame);
  expect(getGameDefinition(resolvedType).component).not.toBe(Match3Game);
});

test('7. Thumbnail background resolution correctly isolates all game types', async () => {
  const m3Game = await getGameById('match-3');
  const catchGame = await getGameById('catch-brand');

  // Match-3 theme with catcher background gets cleaned up
  const corruptedM3Theme: any = {
    id: 'm3-dirty',
    name: 'Dirty Match-3',
    background_url: '/assets/games/catch-brand/themes/default/background.png',
  };
  const resolvedM3Bg = resolveDeveloperThemeBackground(corruptedM3Theme, m3Game!);
  expect(resolvedM3Bg).toBe('/assets/games/match-3/themes/default/background.png');

  // Catch-brand theme retains its catcher background
  const catchTheme: any = {
    id: 'catch-clean',
    name: 'Clean Catcher',
    background_url: '/assets/games/catch-brand/themes/default/background.png',
  };
  const resolvedCatchBg = resolveDeveloperThemeBackground(catchTheme, catchGame!);
  expect(resolvedCatchBg).toBe('/assets/games/catch-brand/themes/default/background.png');

  // Custom user uploaded background is always preserved
  const customUploadedTheme: any = {
    id: 'custom-upload',
    name: 'Custom Branded Theme',
    background_url: 'https://example.com/storage/v1/object/public/custom.png',
  };
  expect(resolveDeveloperThemeBackground(customUploadedTheme, m3Game!)).toBe(
    'https://example.com/storage/v1/object/public/custom.png'
  );
});
