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
import { GameComponentProps, CatchBrandConfig } from '../types';

export const CatchBrandGame: React.FC<GameComponentProps<CatchBrandConfig>> = ({
  activeTheme: initialActiveTheme,
  settings: initialSettings,
  onStatsChange: externalOnStatsChange,
  onGameStateChange: externalOnGameStateChange,
  isMuted: initialIsMuted = false,
  onToggleMute: externalOnToggleMute,
  isFullscreen = false,
  onToggleFullscreen,
}) => {
  const gameRef = useRef<Phaser.Game | null>(null);
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
    if (initialActiveTheme && initialActiveTheme.id !== activeTheme.id) {
      setActiveThemeState(initialActiveTheme);
      setRegistryActiveTheme(initialActiveTheme);
      if (sceneRef.current) {
        sceneRef.current.refreshTheme();
      }
    }
  }, [initialActiveTheme, activeTheme.id]);

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
    });

    return () => {
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, []);

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

  return (
    <div className="w-full h-full relative overflow-hidden flex items-center justify-center">
      {/* Hidden Video for Gesture Tracking */}
      <video ref={videoRef} className="hidden" playsInline muted />

      {/* Phaser Canvas Container */}
      <div
        ref={containerRef}
        className="w-full h-full relative overflow-hidden flex items-center justify-center [&>canvas]:max-w-full [&>canvas]:max-h-full [&>canvas]:object-contain"
      />

      {/* Arcade UI Overlay */}
      <ArcadeUI
        gameState={gameState}
        stats={stats}
        countdownText={countdownText}
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
