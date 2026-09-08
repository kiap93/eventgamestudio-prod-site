import React, { useEffect, useRef, useState, useCallback } from 'react';
import Phaser from 'phaser';
import { GameScene } from '../../game/scenes/GameScene';
import { BootScene } from '../../game/scenes/BootScene';
import { GameState, GameStats, GameSettings } from '../../types';
import { ArcadeUI } from '../../components/ArcadeUI';
import { GAME_WIDTH, GAME_HEIGHT } from '../../game/config';
import {
  DEFAULT_GAME_SETTINGS,
  saveGameSettings,
} from '../../game/settings';
import { GameTheme, setActiveThemeId, setActiveTheme as setRegistryActiveTheme } from '../../themes';
import { useResponsiveLayout } from '../../themes/responsive';
import { GameComponentProps, CatchBrandConfig } from '../types';

export const CatchBrandGame: React.FC<GameComponentProps<CatchBrandConfig>> = ({
  activeTheme: initialActiveTheme,
  settings: initialSettings,
  eventId,
  publicToken,
  isEventPreview,
  isEventTest,
  onStatsChange: externalOnStatsChange,
  onGameStateChange: externalOnGameStateChange,
  isMuted: initialIsMuted = false,
  onToggleMute: externalOnToggleMute,
  isFullscreen = false,
  onToggleFullscreen,
}) => {
  const gameRef = useRef<Phaser.Game | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<GameScene | null>(null);

  const [gameState, setGameState] = useState<GameState>('START');
  const [countdownText, setCountdownText] = useState<string | number>(3);
  const [isMuted, setIsMuted] = useState<boolean>(initialIsMuted);
  const [cameraActive, setCameraActive] = useState<boolean>(false);

  const [activeTheme, setActiveThemeState] = useState<GameTheme>(initialActiveTheme);
  const [settings, setSettings] = useState<GameSettings>(initialSettings);

  const [stats, setStats] = useState<GameStats>({
    score: 0,
    highScore: 0,
    greenCaught: 0,
    orangeCaught: 0,
    goldenCaught: 0,
    duriansMissed: 0,
    timeRemaining: settings.gameDurationSeconds || 20,
  });

  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Sync external theme changes
  useEffect(() => {
    if (initialActiveTheme) {
      setActiveThemeState(initialActiveTheme);
      setRegistryActiveTheme(initialActiveTheme);
      if (sceneRef.current) {
        sceneRef.current.refreshTheme();
      }
    }
  }, [initialActiveTheme]);

  // Sync external settings changes
  useEffect(() => {
    if (initialSettings) {
      setSettings(initialSettings);
      if (sceneRef.current) {
        sceneRef.current.applySettings(initialSettings);
      }
    }
  }, [initialSettings]);

  // Sync external mute state
  useEffect(() => {
    setIsMuted(initialIsMuted);
    if (gameRef.current) {
      gameRef.current.sound.mute = initialIsMuted;
    }
  }, [initialIsMuted]);

  // Notify parent of state changes
  const handleGameStateChange = useCallback(
    (newState: GameState) => {
      setGameState(newState);
      externalOnGameStateChange?.(newState);
    },
    [externalOnGameStateChange]
  );

  // Notify parent of stats changes
  const handleStatsChange = useCallback(
    (newStats: GameStats) => {
      setStats((prev) => {
        const merged = { ...prev, ...newStats };
        externalOnStatsChange?.(merged);
        return merged;
      });
    },
    [externalOnStatsChange]
  );

  // Initialize Phaser Game instance
  useEffect(() => {
    if (gameRef.current || !containerRef.current) return;

    const gameConfig: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      parent: containerRef.current,
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      physics: {
        default: 'arcade',
        arcade: {
          gravity: { x: 0, y: 0 },
          debug: false,
        },
      },
      scene: [BootScene, GameScene],
      backgroundColor: '#0a1d12',
    };

    const game = new Phaser.Game(gameConfig);
    gameRef.current = game;

    // Resize and fullscreen observer to dynamically refresh canvas scale
    const handleResize = () => {
      if (gameRef.current?.scale) {
        requestAnimationFrame(() => {
          gameRef.current?.scale?.refresh();
        });
      }
    };

    const delayedResize = () => {
      handleResize();
      setTimeout(handleResize, 60);
      setTimeout(handleResize, 200);
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', delayedResize);
    document.addEventListener('fullscreenchange', delayedResize);
    document.addEventListener('webkitfullscreenchange', delayedResize);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      resizeObserver = new ResizeObserver(() => {
        handleResize();
      });
      resizeObserver.observe(containerRef.current);
    }

    game.events.once('ready', () => {
      const scene = game.scene.getScene('GameScene') as GameScene;
      sceneRef.current = scene;

      if (scene) {
        scene.onStateChange = (state: GameState) => {
          handleGameStateChange(state);
        };

        scene.onStatsChange = (s: GameStats) => {
          handleStatsChange(s);
        };

        scene.onCountdownUpdate = (val: number | string) => {
          setCountdownText(val);
        };

        // Apply initial settings
        scene.applySettings(settings);
      }
      handleResize();
    });

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', delayedResize);
      document.removeEventListener('fullscreenchange', delayedResize);
      document.removeEventListener('webkitfullscreenchange', delayedResize);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, []);

  // Sync scale refresh when isFullscreen prop changes
  useEffect(() => {
    const handleRefresh = () => {
      if (gameRef.current?.scale) {
        gameRef.current.scale.refresh();
      }
    };
    const t1 = setTimeout(handleRefresh, 30);
    const t2 = setTimeout(handleRefresh, 150);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [isFullscreen]);

  // Update Settings handler
  const handleUpdateSettings = (newSettings: GameSettings) => {
    setSettings(newSettings);
    saveGameSettings(newSettings);
    if (sceneRef.current) {
      sceneRef.current.applySettings(newSettings);
    }
  };

  const handleResetSettings = () => {
    handleUpdateSettings(DEFAULT_GAME_SETTINGS);
  };

  // Theme selection handler
  const handleSelectTheme = (themeId: string) => {
    const updatedTheme = setActiveThemeId(themeId);
    setActiveThemeState(updatedTheme);
    if (sceneRef.current) {
      sceneRef.current.refreshTheme();
    }
  };

  // UI Button Actions
  const handleStartGame = () => {
    if (sceneRef.current) {
      sceneRef.current.startNewGame();
    }
  };

  const handlePauseGame = () => {
    if (sceneRef.current) {
      sceneRef.current.pauseGame();
    }
  };

  const handleResumeGame = () => {
    if (sceneRef.current) {
      sceneRef.current.resumeGame();
    }
  };

  const handleRestartGame = () => {
    if (sceneRef.current) {
      sceneRef.current.startNewGame();
    }
  };

  const handleStopGame = () => {
    if (sceneRef.current) {
      sceneRef.current.stopGame();
    }
  };

  const handleToggleMute = () => {
    const newMute = !isMuted;
    setIsMuted(newMute);
    if (gameRef.current) {
      gameRef.current.sound.mute = newMute;
    }
    externalOnToggleMute?.();
  };

  const handleToggleCamera = () => {
    setCameraActive(!cameraActive);
  };

  const orientationPreference = activeTheme?.layout?.orientation || 'auto';
  const responsive = useResponsiveLayout(viewportRef, orientationPreference);

  const customBgUrl =
    activeTheme?.background_url ||
    activeTheme?.backgroundUrl ||
    activeTheme?.theme_assets?.background;

  return (
    <div
      ref={viewportRef}
      className="game-container game-viewport relative w-full h-full flex items-center justify-center overflow-hidden bg-[#07130b]"
      style={{
        backgroundColor: activeTheme?.visuals_config?.bgGradientTo || '#07130b',
        ...(customBgUrl
          ? {
              backgroundImage: `url(${customBgUrl})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center center',
            }
          : {}),
      }}
    >
      {/* Full container backdrop */}
      <div
        className="game-ui-backdrop"
        style={{
          backgroundColor: activeTheme?.visuals_config?.bgGradientTo || '#07130b',
          backgroundImage: customBgUrl
            ? `url(${customBgUrl})`
            : activeTheme?.visuals_config?.bgGradientFrom
            ? `radial-gradient(circle at 50% 20%, ${activeTheme.visuals_config.bgGradientFrom} 0%, ${activeTheme?.visuals_config?.bgGradientTo || '#07130b'} 100%)`
            : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      >
        {customBgUrl && (
          <img
            src={customBgUrl}
            alt=""
            aria-hidden="true"
          />
        )}
      </div>

      {/* Proportionally Scaled Game Stage containing Canvas */}
      <div
        className={`game-stage relative w-full h-full ${
          responsive.isPortrait
            ? 'aspect-[9/16] max-h-full w-auto'
            : 'aspect-[16/9] max-w-full max-h-full'
        } flex items-center justify-center overflow-hidden pointer-events-auto`}
      >
        {/* Hidden Video for Gesture Tracking */}
        <video ref={videoRef} className="hidden" playsInline muted />

        {/* Phaser Canvas Container */}
        <div
          ref={containerRef}
          className="absolute inset-0 w-full h-full overflow-hidden flex items-center justify-center pointer-events-auto"
        />
      </div>

      {/* Arcade UI Overlay spanning full game container */}
      <ArcadeUI
        gameState={gameState}
        stats={stats}
        countdownText={countdownText}
        eventId={eventId}
        publicToken={publicToken}
        isEventPreview={isEventPreview}
        isEventTest={isEventTest}
        isMuted={isMuted}
        onToggleMute={handleToggleMute}
        cameraActive={cameraActive}
        onToggleCamera={handleToggleCamera}
        onStartGame={handleStartGame}
        onPauseGame={handlePauseGame}
        onResumeGame={handleResumeGame}
        onRestartGame={handleRestartGame}
        onStopGame={handleStopGame}
        videoRef={videoRef}
        isFullscreen={isFullscreen}
        onToggleFullscreen={onToggleFullscreen}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        onResetSettings={handleResetSettings}
        activeTheme={activeTheme}
        onSelectTheme={handleSelectTheme}
      />
    </div>
  );
};
