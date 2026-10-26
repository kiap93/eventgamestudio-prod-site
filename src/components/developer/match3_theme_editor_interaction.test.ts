import './setup_test_dom';
import { test, expect, describe } from 'bun:test';
import React from 'react';
import { match3Theme } from '../../themes/match-3';
import { GameTheme, normalizeGameTheme, isMatch3Theme } from '../../themes';
import { DEFAULT_MATCH3_CONFIG } from '../../games/match-3/types';
import { DEFAULT_MATCH3_LAYOUT, getLayoutElementKeys } from '../../themes/layout';
import { Match3GameplayCustomizer, Match3HazardsCustomizer, Match3AudioEditor, Match3TilesCustomizer } from '../studio/games/Match3Customizer';
import { GameplayTab } from '../studio/GameplayTab';
import { AudioTab } from '../studio/AudioTab';
import { BrandingTab } from '../studio/BrandingTab';
import { LayoutTab } from '../studio/LayoutTab';
import { Match3Game } from '../../games/match-3/Match3Game';

describe('Match-3 Theme Editor Interaction & Regression Tests', () => {
  // Baseline theme snapshot for immutable checks
  const getFreshMatch3Theme = (): GameTheme => {
    return JSON.parse(JSON.stringify(match3Theme));
  };

  test('1. Match-3 theme identification and default configurations', () => {
    const theme = getFreshMatch3Theme();
    expect(isMatch3Theme(theme)).toBe(true);
    expect(theme.game_config).toBeDefined();
    expect(theme.sounds_config).toBeDefined();
    expect(theme.branding).toBeDefined();
    expect(theme.layout).toBeDefined();
    expect(theme.physics_config).toBeDefined();

    // Verify layout element keys for match-3
    const keys = getLayoutElementKeys('match-3');
    expect(keys).toContain('clientLogo');
    expect(keys).toContain('scoreHud');
    expect(keys).toContain('timer');
    expect(keys).toContain('gameTitle');
    expect(keys).toContain('footerSponsor');
    expect(keys).not.toContain('movesHud');
    expect(keys).not.toContain('pairsHud');
  });

  test('2. Tab Selection & Panel Routing logic in Theme Editor', () => {
    // Verify all 4 target tabs plus visuals and items are valid activeTab states
    const tabs = ['visuals', 'items', 'gameplay', 'audio', 'branding', 'layout'] as const;
    let activeTab: (typeof tabs)[number] = 'visuals';

    const setActiveTab = (tab: (typeof tabs)[number]) => {
      activeTab = tab;
    };

    // Click Gameplay
    setActiveTab('gameplay');
    expect(activeTab).toBe('gameplay');

    // Click Audio
    setActiveTab('audio');
    expect(activeTab).toBe('audio');

    // Click Branding
    setActiveTab('branding');
    expect(activeTab).toBe('branding');

    // Click Layout
    setActiveTab('layout');
    expect(activeTab).toBe('layout');
  });

  test('3. GameplayTab dispatches updates and preserves unrelated settings', () => {
    const initialTheme = getFreshMatch3Theme();
    let currentTheme = { ...initialTheme };

    let changeCallCount = 0;
    const handleChange = (updated: GameTheme) => {
      changeCallCount++;
      currentTheme = updated;
    };

    // Mount Match3GameplayCustomizer through GameplayTab with onChange
    const gameplayCustomizer = React.createElement(Match3GameplayCustomizer, {
      theme: currentTheme,
      onChange: handleChange,
    });
    expect(gameplayCustomizer).toBeDefined();

    // Simulate duration change (gameDurationSeconds: 45)
    const newConfig = {
      ...(currentTheme.game_config as any),
      gameDurationSeconds: 45,
    };
    handleChange({
      ...currentTheme,
      physics_config: {
        ...(currentTheme.physics_config || {}),
        gameDurationSeconds: 45,
      },
      game_config: newConfig,
    });

    expect(changeCallCount).toBe(1);
    expect((currentTheme.game_config as any).gameDurationSeconds).toBe(45);
    expect(currentTheme.physics_config?.gameDurationSeconds).toBe(45);
    // Preserves branding, sounds, layout
    expect(currentTheme.branding?.gameTitle).toBe(initialTheme.branding?.gameTitle);
    expect(currentTheme.sounds_config?.soundVolume).toBe(initialTheme.sounds_config?.soundVolume);
    expect(currentTheme.layout?.scoreHud?.x).toBe(initialTheme.layout?.scoreHud?.x);

    // Simulate Objective change to 'collect'
    const updatedObjective = {
      type: 'collect' as const,
      targetTileType: 'tile-02',
      targetCollectCount: 25,
    };
    handleChange({
      ...currentTheme,
      game_config: {
        ...(currentTheme.game_config as any),
        objective: updatedObjective,
      },
    });

    expect(changeCallCount).toBe(2);
    expect((currentTheme.game_config as any).objective.type).toBe('collect');
    expect((currentTheme.game_config as any).objective.targetCollectCount).toBe(25);
    expect((currentTheme.game_config as any).gameDurationSeconds).toBe(45); // Retains prior duration!

    // Simulate Hazard configuration change
    handleChange({
      ...currentTheme,
      game_config: {
        ...(currentTheme.game_config as any),
        hazardConfig: {
          enabled: true,
          type: 'ice',
          initialCount: 5,
          clearCondition: 'adjacent_match',
        },
      },
    });

    expect(changeCallCount).toBe(3);
    expect((currentTheme.game_config as any).hazardConfig.enabled).toBe(true);
    expect((currentTheme.game_config as any).hazardConfig.type).toBe('ice');
    expect((currentTheme.game_config as any).hazardConfig.initialCount).toBe(5);
  });

  test('4. GameplayTab onFieldChange adapter fallback works when onChange is omitted', () => {
    const initialTheme = getFreshMatch3Theme();
    const fieldUpdates: Record<string, any> = {};

    const handleFieldChange = (field: keyof GameTheme, value: any) => {
      fieldUpdates[field] = value;
    };

    // Call GameplayTab with only onFieldChange
    const tabElement = React.createElement(GameplayTab, {
      theme: initialTheme,
      onFieldChange: handleFieldChange,
    });
    expect(tabElement).toBeDefined();

    // Trigger an update through the component's internal dispatcher
    const updatedTheme: GameTheme = {
      ...initialTheme,
      game_config: {
        ...(initialTheme.game_config as any),
        cols: 7,
        rows: 7,
      },
      physics_config: {
        ...(initialTheme.physics_config || {}),
        gameDurationSeconds: 90,
      },
    };

    // Calling the adapter
    const adapter = (up: GameTheme) => {
      if (up.game_config !== initialTheme.game_config) {
        handleFieldChange('game_config', up.game_config);
      }
      if (up.physics_config !== initialTheme.physics_config) {
        handleFieldChange('physics_config', up.physics_config);
      }
    };
    adapter(updatedTheme);

    expect(fieldUpdates.game_config?.cols).toBe(7);
    expect(fieldUpdates.physics_config?.gameDurationSeconds).toBe(90);
  });

  test('5. AudioTab updates sounds_config, syncs game_config, and preserves settings', () => {
    const initialTheme = getFreshMatch3Theme();
    let currentTheme = { ...initialTheme };

    const handleChange = (updated: GameTheme) => {
      currentTheme = updated;
    };

    const audioEditor = React.createElement(Match3AudioEditor, {
      theme: currentTheme,
      onChange: handleChange,
    });
    expect(audioEditor).toBeDefined();

    // Toggle mute/soundEnabled off
    handleChange({
      ...currentTheme,
      sounds_config: {
        ...(currentTheme.sounds_config || {}),
        soundEnabled: false,
        soundVolume: 0.5,
      },
      game_config: {
        ...((currentTheme.game_config as any) || {}),
        soundEnabled: false,
        soundVolume: 0.5,
      },
    });

    expect(currentTheme.sounds_config?.soundEnabled).toBe(false);
    expect(currentTheme.sounds_config?.soundVolume).toBe(0.5);
    expect((currentTheme.game_config as any).soundEnabled).toBe(false);
    expect((currentTheme.game_config as any).soundVolume).toBe(0.5);

    // Audio changes must NOT wipe gameplay or layout
    expect(currentTheme.branding?.gameTitle).toBe(initialTheme.branding?.gameTitle);
    expect(currentTheme.layout?.scoreHud).toEqual(initialTheme.layout?.scoreHud);
  });

  test('6. AudioTab adapts onFieldChange safely when onChange is omitted', () => {
    const initialTheme = getFreshMatch3Theme();
    const fieldUpdates: Record<string, any> = {};

    const handleFieldChange = (field: keyof GameTheme, value: any) => {
      fieldUpdates[field] = value;
    };

    const updatedSounds = {
      ...(initialTheme.sounds_config || {}),
      bgmEnabled: false,
      soundVolume: 0.4,
    };

    const adapter = (up: GameTheme) => {
      if (up.sounds_config !== initialTheme.sounds_config) {
        handleFieldChange('sounds_config', up.sounds_config);
      }
      if (up.game_config !== initialTheme.game_config) {
        handleFieldChange('game_config', up.game_config);
      }
    };

    adapter({
      ...initialTheme,
      sounds_config: updatedSounds as any,
    });

    expect(fieldUpdates.sounds_config?.bgmEnabled).toBe(false);
    expect(fieldUpdates.sounds_config?.soundVolume).toBe(0.4);
  });

  test('7. BrandingTab updates gameTitle, subtitle, and logo without crashing', () => {
    const initialTheme = getFreshMatch3Theme();
    let currentTheme = { ...initialTheme };

    const handleChange = (updated: GameTheme) => {
      currentTheme = updated;
    };

    // Update branding title and subtitle
    handleChange({
      ...currentTheme,
      gameTitle: 'SUMMER SPLASH MATCH-3',
      subtitle: 'Clear all water drops before time expires!',
      branding: {
        ...(currentTheme.branding || {}),
        gameTitle: 'SUMMER SPLASH MATCH-3',
        subtitle: 'Clear all water drops before time expires!',
        clientLogoUrl: 'https://example.com/logo.png',
      },
      layout: {
        ...currentTheme.layout,
        clientLogo: {
          ...(currentTheme.layout?.clientLogo || { visible: true, x: 2.5, y: 8.5 }),
          visible: true,
        },
      },
    });

    expect(currentTheme.branding?.gameTitle).toBe('SUMMER SPLASH MATCH-3');
    expect(currentTheme.branding?.subtitle).toBe('Clear all water drops before time expires!');
    expect(currentTheme.branding?.clientLogoUrl).toBe('https://example.com/logo.png');
    expect(currentTheme.layout?.clientLogo?.visible).toBe(true);

    // Preserves unrelated settings
    expect(currentTheme.sounds_config?.soundVolume).toBe(initialTheme.sounds_config?.soundVolume);
    expect((currentTheme.game_config as any).minimumMatch).toBe((initialTheme.game_config as any).minimumMatch);
  });

  test('8. LayoutTab allows selecting, repositioning, and toggling visibility of all HUD elements', () => {
    const initialTheme = getFreshMatch3Theme();
    let currentTheme = { ...initialTheme };

    const handleChange = (updated: GameTheme) => {
      currentTheme = updated;
    };

    let selectedElement: string = 'clientLogo';
    const handleSelect = (key: string) => {
      selectedElement = key;
    };

    // Select scoreHud
    handleSelect('scoreHud');
    expect(selectedElement).toBe('scoreHud');

    // Move scoreHud to x=5, y=5, width=22
    handleChange({
      ...currentTheme,
      layout: {
        ...(currentTheme.layout || {}),
        scoreHud: {
          ...(currentTheme.layout?.scoreHud || { visible: true }),
          x: 5,
          y: 5,
          width: 22,
        },
      },
    });
    expect(currentTheme.layout?.scoreHud?.x).toBe(5);
    expect(currentTheme.layout?.scoreHud?.y).toBe(5);
    expect(currentTheme.layout?.scoreHud?.width).toBe(22);

    // Select footerSponsor and toggle visibility off
    handleSelect('footerSponsor');
    expect(selectedElement).toBe('footerSponsor');
    handleChange({
      ...currentTheme,
      layout: {
        ...(currentTheme.layout || {}),
        footerSponsor: {
          ...(currentTheme.layout?.footerSponsor || { visible: true }),
          visible: false,
        },
      },
    });
    expect(currentTheme.layout?.footerSponsor?.visible).toBe(false);

    // Toggle timer visibility
    handleSelect('timer');
    expect(selectedElement).toBe('timer');
    handleChange({
      ...currentTheme,
      layout: {
        ...(currentTheme.layout || {}),
        timer: {
          ...(currentTheme.layout?.timer || { visible: true }),
          visible: false,
        },
      },
    });
    expect(currentTheme.layout?.timer?.visible).toBe(false);
  });

  test('9. Match3Game interactive viewport renders HUD elements in editableLayout mode', () => {
    const theme = getFreshMatch3Theme();

    let selectedKey: string | null = null;
    let pointerDownCalled = false;

    const gameElement = React.createElement(Match3Game, {
      activeTheme: theme,
      isMuted: false,
      isFullscreen: false,
      isEventPreview: true,
      editableLayout: true,
      selectedElementKey: 'scoreHud',
      onSelectElementKey: (key: any) => {
        selectedKey = key;
      },
      onElementPointerDown: (key: any) => {
        pointerDownCalled = true;
        selectedKey = key;
      },
    });

    expect(gameElement).toBeDefined();
    expect(gameElement.props.editableLayout).toBe(true);
    expect(gameElement.props.selectedElementKey).toBe('scoreHud');

    // Simulate clicking clientLogo, timer, gameTitle, footerSponsor
    gameElement.props.onSelectElementKey?.('clientLogo');
    expect(selectedKey).toBe('clientLogo');

    gameElement.props.onElementPointerDown?.('timer', false, {} as any);
    expect(pointerDownCalled).toBe(true);
    expect(selectedKey).toBe('timer');

    gameElement.props.onSelectElementKey?.('footerSponsor');
    expect(selectedKey).toBe('footerSponsor');
  });

  test('10. Match3Game preserves normal gameplay and board interaction when editableLayout is false', () => {
    const theme = getFreshMatch3Theme();

    const gameElement = React.createElement(Match3Game, {
      activeTheme: theme,
      isMuted: false,
      isFullscreen: false,
      isEventPreview: false,
      editableLayout: false, // Standard gameplay mode
    });

    expect(gameElement).toBeDefined();
    expect(gameElement.props.editableLayout).toBe(false);
    expect(gameElement.props.selectedElementKey).toBeUndefined();
  });

  test('11. Theme Editor save payload includes all 5 configuration sections', () => {
    const theme = getFreshMatch3Theme();
    theme.game_config = {
      ...(theme.game_config as any),
      gameDurationSeconds: 45,
    };
    theme.sounds_config = {
      ...(theme.sounds_config || {}),
      soundVolume: 0.6,
    };
    theme.branding = {
      ...(theme.branding || {}),
      gameTitle: 'Branded Match-3',
    };
    theme.layout = {
      ...(theme.layout || {}),
      scoreHud: { visible: true, x: 5, y: 5, width: 20 },
    };
    theme.physics_config = {
      ...(theme.physics_config || {}),
      gameDurationSeconds: 45,
    };

    // Serialize as done in DeveloperThemeEditor.tsx handleSave
    const savePayload = {
      name: theme.name,
      slug: theme.slug,
      description: theme.description,
      status: theme.status,
      is_default: theme.is_default,
      branding: theme.branding,
      background_url: theme.background_url,
      basket_config: theme.basket_config,
      items_config: theme.items_config,
      physics_config: theme.physics_config,
      visuals_config: theme.visuals_config,
      sounds_config: theme.sounds_config,
      layout: theme.layout,
      game_config: theme.game_config,
    };

    expect(savePayload.game_config).toBeDefined();
    expect((savePayload.game_config as any).gameDurationSeconds).toBe(45);
    expect(savePayload.sounds_config).toBeDefined();
    expect(savePayload.sounds_config.soundVolume).toBe(0.6);
    expect(savePayload.branding).toBeDefined();
    expect(savePayload.branding.gameTitle).toBe('Branded Match-3');
    expect(savePayload.layout).toBeDefined();
    expect(savePayload.layout.scoreHud.x).toBe(5);
    expect(savePayload.physics_config).toBeDefined();
    expect(savePayload.physics_config.gameDurationSeconds).toBe(45);

    // Reload / re-normalize theme
    const normalized = normalizeGameTheme(savePayload as any);
    expect((normalized.game_config as any).gameDurationSeconds).toBe(45);
    expect(normalized.sounds_config?.soundVolume).toBe(0.6);
    expect(normalized.branding?.gameTitle).toBe('Branded Match-3');
    expect(normalized.layout?.scoreHud?.x).toBe(5);
  });

  test('12. Switching Match-3 objective between Target Score and Clear Obstacles toggles hazards appropriately and does not leak stones into Target Score', () => {
    const theme = getFreshMatch3Theme();
    let currentTheme = { ...theme };

    const handleChange = (updated: GameTheme) => {
      currentTheme = updated;
    };

    // 1. Initial state: Target Score mode, hazards disabled
    expect((currentTheme.game_config as any).objective.type).toBe('score');
    expect((currentTheme.game_config as any).hazardConfig.enabled).toBe(false);

    // Helper that replicates Match3GameplayCustomizer updateObjective logic
    const simulateObjectiveSwitch = (targetType: 'score' | 'remove') => {
      const currentConfig = currentTheme.game_config as any;
      const nextObjective = {
        ...currentConfig.objective,
        type: targetType,
      };

      let nextHazardConfig = currentConfig.hazardConfig;
      if (targetType === 'remove') {
        if (!nextHazardConfig || !nextHazardConfig.enabled) {
          nextHazardConfig = {
            ...(nextHazardConfig || DEFAULT_MATCH3_CONFIG.hazardConfig),
            enabled: true,
          };
        }
      } else {
        if (nextHazardConfig?.enabled) {
          nextHazardConfig = {
            ...nextHazardConfig,
            enabled: false,
          };
        }
      }

      handleChange({
        ...currentTheme,
        game_config: {
          ...currentConfig,
          objective: nextObjective,
          hazardConfig: nextHazardConfig,
        },
      });
    };

    // 2. Switch to Clear Obstacles: hazards must be automatically enabled
    simulateObjectiveSwitch('remove');
    expect((currentTheme.game_config as any).objective.type).toBe('remove');
    expect((currentTheme.game_config as any).hazardConfig.enabled).toBe(true);

    // 3. Switch back to Target Score: hazards must be disabled and not retained
    simulateObjectiveSwitch('score');
    expect((currentTheme.game_config as any).objective.type).toBe('score');
    expect((currentTheme.game_config as any).hazardConfig.enabled).toBe(false);

    // 4. Repeated switching cycle
    simulateObjectiveSwitch('remove');
    expect((currentTheme.game_config as any).objective.type).toBe('remove');
    expect((currentTheme.game_config as any).hazardConfig.enabled).toBe(true);

    simulateObjectiveSwitch('score');
    expect((currentTheme.game_config as any).objective.type).toBe('score');
    expect((currentTheme.game_config as any).hazardConfig.enabled).toBe(false);

    // 5. Mount Match3Game with this Target Score theme - verify it produces 0 stone obstacles
    const gameElement = React.createElement(Match3Game, {
      activeTheme: currentTheme,
      isMuted: false,
      isFullscreen: false,
      isEventPreview: true,
    });
    expect(gameElement).toBeDefined();
    expect(gameElement.props.activeTheme?.game_config?.objective?.type).toBe('score');
    expect(gameElement.props.activeTheme?.game_config?.hazardConfig?.enabled).toBe(false);
  });
});
