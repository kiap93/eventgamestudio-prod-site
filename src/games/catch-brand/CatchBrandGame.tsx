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
import { GameTheme, setActiveTheme as setRegistryActiveTheme } from '../../themes';
import { useResponsiveLayout } from '../../themes/responsive';
import { GameComponentProps, CatchBrandConfig } from '../types';

export const CatchBrandGame: React.FC<GameComponentProps<CatchBrandConfig>> = ({
  activeTheme: initialActiveTheme,
  settings: initialSettings,
  eventId,
  publicToken,
  isEventPreview,
  isEventTest,
  overrideOrientation,
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
    itemsMissed: 0,
    timeRemaining: settings.gameDurationSeconds || 20,
  });

  const orientationPreference = activeTheme?.layout?.orientation || 'auto';
  const responsive = useResponsiveLayout(viewportRef, orientationPreference, overrideOrientation);

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

  // Dynamic layout resize on orientation change
  useEffect(() => {
    if (gameRef.current?.scale) {
      gameRef.current.scale.resize(responsive.designWidth, responsive.designHeight);
      gameRef.current.scale.refresh();
      if (sceneRef.current?.resizeLayout) {
        sceneRef.current.resizeLayout(responsive.designWidth, responsive.designHeight);
      }
    }
  }, [responsive.designWidth, responsive.designHeight, responsive.isPortrait]);

  // Initialize Phaser Game instance
  useEffect(() => {
    if (gameRef.current || !containerRef.current) return;

    const initialWidth = responsive.designWidth || GAME_WIDTH;
    const initialHeight = responsive.designHeight || GAME_HEIGHT;

    const gameConfig: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      parent: containerRef.current,
      width: initialWidth,
      height: initialHeight,
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.NO_CENTER,
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

        // Ensure canonical logical sizing once GameScene finishes create lifecycle
        scene.events.once('create', () => {
          scene.resizeLayout(responsive.designWidth, responsive.designHeight);
          handleResize();
        });
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
      }}
    >
      {/* Ambient letterbox backdrop behind GameStage - purely visual, non-competing */}
      {customBgUrl && (
        <div
          className="game-ui-backdrop absolute inset-0 pointer-events-none overflow-hidden"
          style={{
            backgroundImage: `url(${customBgUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            filter: 'blur(24px) brightness(0.25)',
            opacity: 0.45,
            transform: 'scale(1.1)',
          }}
          aria-hidden="true"
        />
      )}

      {/* Authoritative Single Game Stage (16:9 Landscape / 9:16 Portrait) */}
      <div
        id="catch-brand-game-stage"
        className={`game-stage relative overflow-hidden pointer-events-auto shrink-0 ${
          responsive.isPortrait ? 'is-portrait aspect-[9/16]' : 'aspect-[16/9]'
        }`}
        style={{
          width: `${responsive.stageWidth}px`,
          height: `${responsive.stageHeight}px`,
          maxWidth: '100%',
          maxHeight: '100%',
          backgroundColor: activeTheme?.visuals_config?.bgGradientTo || '#07130b',
        }}
      >
        {/* Hidden Video for Gesture Tracking */}
        <video ref={videoRef} className="hidden" playsInline muted />

        {/* Phaser Canvas Container: Authoritative canvas layer matching GameStage bounds */}
        <div
          ref={containerRef}
          id="phaser-canvas-container"
          className="absolute inset-0 w-full h-full overflow-hidden pointer-events-auto"
        />

        {/* Arcade UI Overlay directly mounted inside game stage over canvas with unified scale */}
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
          responsive={responsive}
        />
      </div>
    </div>
  );
};
