import React, { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import { GameScene } from '../game/scenes/GameScene';
import { BootScene } from '../game/scenes/BootScene';
import { GameState, GameStats, GameSettings } from '../types';
import { ArcadeUI } from './ArcadeUI';
import { GAME_WIDTH, GAME_HEIGHT } from '../game/config';
import {
  getGameSettings,
  saveGameSettings,
  DEFAULT_GAME_SETTINGS,
  mapServerSettingsToGameSettings,
  setActiveGameSettings,
} from '../game/settings';
import { GameTheme, initActiveTheme, setActiveThemeId, setActiveTheme as setRegistryActiveTheme } from '../themes';
import { useAuth } from '../context/AuthContext';

export const GameContainer: React.FC = () => {
  const { activeGame, activeTheme: contextActiveTheme } = useAuth();
  const gameRef = useRef<Phaser.Game | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<GameScene | null>(null);

  const [gameState, setGameState] = useState<GameState>('START');
  const [countdownText, setCountdownText] = useState<string | number>(3);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  const [activeTheme, setActiveThemeState] = useState<GameTheme>(() => contextActiveTheme || initActiveTheme());

  const [settings, setSettings] = useState<GameSettings>(() => getGameSettings());

  // Sync context activeTheme to container state and running game
  useEffect(() => {
    if (contextActiveTheme && contextActiveTheme.id !== activeTheme.id) {
      setActiveThemeState(contextActiveTheme);
      setRegistryActiveTheme(contextActiveTheme);
      if (sceneRef.current) {
        sceneRef.current.refreshTheme();
      }
    }
  }, [contextActiveTheme, activeTheme.id]);

  // Sync Supabase backend activeGame configuration to settings and running game
  useEffect(() => {
    if (activeGame && activeGame.settings_config) {
      const serverSettings = mapServerSettingsToGameSettings(activeGame.settings_config);
      setSettings(serverSettings);
      setActiveGameSettings(serverSettings);
      if (sceneRef.current) {
        sceneRef.current.applySettings(serverSettings);
      }
    }
  }, [activeGame]);

  const [stats, setStats] = useState<GameStats>({
    score: 0,
    highScore: 0,
    greenCaught: 0,
    orangeCaught: 0,
    goldenCaught: 0,
    duriansMissed: 0,
    timeRemaining: settings.gameDurationSeconds,
  });

  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Initialize Phaser Game
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
          setGameState(state);
        };

        scene.onStatsChange = (newStats: GameStats) => {
          setStats((prev) => ({ ...prev, ...newStats }));
        };

        scene.onCountdownUpdate = (val: number | string) => {
          setCountdownText(val);
        };
      }
    });

    const handleFullscreenChange = () => {
      setIsFullscreen(
        !!document.fullscreenElement || !!(document as any).webkitFullscreenElement
      );
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, []);

  // Sync settings changes to running Phaser scene
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
  };

  const handleToggleCamera = () => {
    setCameraActive(!cameraActive);
  };

  const handleToggleFullscreen = () => {
    if (sceneRef.current) {
      sceneRef.current.toggleFullscreen(containerRef.current?.parentElement);
    }
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-[#07130b] overflow-hidden relative">
      {/* Outer Cabinet Frame */}
      <div className="game-cabinet relative w-full max-w-[1024px] aspect-[16/9] bg-[#0c2012] border-4 border-[#1e4627] rounded-3xl shadow-[0_0_50px_rgba(16,185,129,0.15)] overflow-hidden flex items-center justify-center [container-type:size]">
        {/* Hidden Video for Gesture Tracking */}
        <video
          ref={videoRef}
          className="hidden"
          playsInline
          muted
        />

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
          onToggleFullscreen={handleToggleFullscreen}
          settings={settings}
          onUpdateSettings={handleUpdateSettings}
          onResetSettings={handleResetSettings}
          activeTheme={activeTheme}
          onSelectTheme={handleSelectTheme}
        />
      </div>

      {/* Footer Branding */}
      <footer className="mt-3 text-slate-500 font-mono text-xs flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        {activeTheme.gameTitle} 2D RETRO ARCADE ENGINE • CANVAS & PROCEDURAL AUDIO
      </footer>
    </div>
  );
};
