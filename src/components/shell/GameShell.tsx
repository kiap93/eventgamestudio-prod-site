import React, { useEffect, useState, useRef } from 'react';
import { GameTheme, initActiveTheme } from '../../themes';
import { GameSettings, GameState, GameStats } from '../../types';
import { getGameSettings, mapServerSettingsToGameSettings, setActiveGameSettings } from '../../game/settings';
import { useAuth } from '../../context/AuthContext';
import { getGameDefinition, DEFAULT_GAME_TYPE } from '../../games/registry';
import { GameTypeId } from '../../games/types';

export interface GameShellProps {
  gameType?: GameTypeId | string;
  customTheme?: GameTheme;
  customSettings?: GameSettings;
  className?: string;
  showCabinetFooter?: boolean;
}

export const GameShell: React.FC<GameShellProps> = ({
  gameType = DEFAULT_GAME_TYPE,
  customTheme,
  customSettings,
  className = '',
  showCabinetFooter = true,
}) => {
  const { activeGame, activeTheme: contextActiveTheme } = useAuth();
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Active theme resolution
  const [activeTheme, setActiveThemeState] = useState<GameTheme>(
    () => customTheme || contextActiveTheme || initActiveTheme()
  );

  // Active settings resolution
  const [settings, setSettings] = useState<GameSettings>(
    () => customSettings || getGameSettings()
  );

  // Current game definition lookup
  const gameDef = getGameDefinition(gameType);
  const GameComponent = gameDef.component;

  // Sync theme changes
  useEffect(() => {
    if (customTheme) {
      setActiveThemeState(customTheme);
    } else if (contextActiveTheme) {
      setActiveThemeState(contextActiveTheme);
    }
  }, [customTheme, contextActiveTheme]);

  // Sync Supabase backend activeGame configuration to settings
  useEffect(() => {
    if (customSettings) {
      setSettings(customSettings);
    } else if (activeGame && activeGame.settings_config) {
      const serverSettings = mapServerSettingsToGameSettings(activeGame.settings_config);
      setSettings(serverSettings);
      setActiveGameSettings(serverSettings);
    }
  }, [customSettings, activeGame]);

  // Fullscreen change listener
  useEffect(() => {
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
    };
  }, []);

  const handleToggleFullscreen = () => {
    const targetElement = containerRef.current?.parentElement || document.documentElement;
    if (!document.fullscreenElement) {
      if (targetElement.requestFullscreen) {
        targetElement.requestFullscreen().catch(() => {});
      } else if ((targetElement as any).webkitRequestFullscreen) {
        (targetElement as any).webkitRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      } else if ((document as any).webkitExitFullscreen) {
        (document as any).webkitExitFullscreen();
      }
    }
  };

  const handleToggleMute = () => {
    setIsMuted((prev) => !prev);
  };

  return (
    <div className={`w-full h-full flex flex-col items-center justify-center bg-[#07130b] overflow-hidden relative ${className}`}>
      {/* Outer Cabinet Frame */}
      <div
        ref={containerRef}
        className="game-cabinet relative w-full max-w-[1024px] aspect-[16/9] bg-[#0c2012] border-4 border-[#1e4627] rounded-3xl shadow-[0_0_50px_rgba(16,185,129,0.15)] overflow-hidden flex items-center justify-center [container-type:size]"
      >
        {/* Dynamic Game Component */}
        <GameComponent
          activeTheme={activeTheme}
          settings={settings}
          config={gameDef.defaultConfig}
          isMuted={isMuted}
          isFullscreen={isFullscreen}
          onToggleFullscreen={handleToggleFullscreen}
          onToggleMute={handleToggleMute}
        />
      </div>

      {/* Footer Branding */}
      {showCabinetFooter && (
        <footer className="mt-3 text-slate-500 font-mono text-xs flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>{activeTheme.gameTitle || gameDef.name}</span>
          <span className="text-slate-600">•</span>
          <span className="text-slate-400 font-semibold">{gameDef.name}</span>
          <span className="text-slate-600">•</span>
          <span>MULTI-GAME PLATFORM</span>
        </footer>
      )}
    </div>
  );
};
