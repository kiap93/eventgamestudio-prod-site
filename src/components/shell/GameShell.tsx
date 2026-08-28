import React, { useEffect, useState, useRef } from 'react';
import { GameTheme, initActiveTheme, getThemeById, getThemeGameType } from '../../themes';
import { GameSettings, GameState, GameStats } from '../../types';
import { getGameSettings, mapServerSettingsToGameSettings, setActiveGameSettings } from '../../game/settings';
import { useAuth } from '../../context/AuthContext';
import { getGameDefinition, DEFAULT_GAME_TYPE } from '../../games/registry';
import { GameTypeId } from '../../games/types';

export interface GameShellProps {
  gameType?: GameTypeId | string;
  theme?: GameTheme;
  customTheme?: GameTheme;
  customSettings?: GameSettings;
  className?: string;
  showCabinetFooter?: boolean;
  eventId?: string;
  publicToken?: string;
  allowImmersiveFullscreen?: boolean;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  organizationSlug?: string;
  isStudioPreview?: boolean;
}

export const GameShell: React.FC<GameShellProps> = ({
  gameType = DEFAULT_GAME_TYPE,
  theme,
  customTheme,
  customSettings,
  className = '',
  showCabinetFooter = true,
  eventId,
  publicToken,
  allowImmersiveFullscreen = true,
  isFullscreen: controlledFullscreen,
  onToggleFullscreen: controlledToggleFullscreen,
}) => {
  const effectiveThemeProp = customTheme || theme;
  const { activeGame, activeTheme: contextActiveTheme } = useAuth();
  const [internalFullscreen, setInternalFullscreen] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const isFullscreen = controlledFullscreen !== undefined ? controlledFullscreen : internalFullscreen;

  // Current game definition lookup
  const resolvedGameType = effectiveThemeProp
    ? getThemeGameType(effectiveThemeProp, gameType || DEFAULT_GAME_TYPE)
    : (gameType || (contextActiveTheme ? getThemeGameType(contextActiveTheme, DEFAULT_GAME_TYPE) : DEFAULT_GAME_TYPE));

  // Active theme resolution
  const [activeTheme, setActiveThemeState] = useState<GameTheme>(() => {
    if (effectiveThemeProp) return effectiveThemeProp;
    if (contextActiveTheme) return contextActiveTheme;
    if (resolvedGameType === 'memory-match') return getThemeById('memory-match');
    return initActiveTheme();
  });

  // Active settings resolution
  const [settings, setSettings] = useState<GameSettings>(
    () => customSettings || getGameSettings()
  );

  const gameDef = getGameDefinition(resolvedGameType);
  const GameComponent = gameDef.component;

  // Sync theme changes
  useEffect(() => {
    if (effectiveThemeProp) {
      setActiveThemeState(effectiveThemeProp);
    } else if (contextActiveTheme) {
      setActiveThemeState(contextActiveTheme);
    } else if (resolvedGameType === 'memory-match') {
      setActiveThemeState(getThemeById('memory-match'));
    }
  }, [effectiveThemeProp, contextActiveTheme, resolvedGameType]);

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
      setInternalFullscreen(
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
    if (controlledToggleFullscreen) {
      controlledToggleFullscreen();
      return;
    }

    const isCurrentlyFs =
      !!document.fullscreenElement || !!(document as any).webkitFullscreenElement;
    if (!isCurrentlyFs && !isFullscreen) {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else if ((document.documentElement as any).webkitRequestFullscreen) {
        (document.documentElement as any).webkitRequestFullscreen();
      }
      setInternalFullscreen(true);
    } else {
      if (document.fullscreenElement || (document as any).webkitFullscreenElement) {
        if (document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        } else if ((document as any).webkitExitFullscreen) {
          (document as any).webkitExitFullscreen();
        }
      }
      setInternalFullscreen(false);
    }
  };

  const handleToggleMute = () => {
    setIsMuted((prev) => !prev);
  };

  const useImmersiveLayout = isFullscreen && allowImmersiveFullscreen;

  return (
    <div
      className={
        useImmersiveLayout
          ? `w-full h-full min-w-0 min-h-0 max-w-none max-h-none p-0 m-0 overflow-hidden relative bg-[#07130b] ${className}`
          : `w-full h-full max-w-full max-h-full flex flex-col items-center justify-center bg-[#07130b] overflow-hidden relative ${className}`
      }
    >
      {/* Cabinet Frame Wrapper: Uses available viewport space dynamically */}
      <div
        className={
          useImmersiveLayout
            ? 'w-full h-full min-w-0 min-h-0 max-w-none max-h-none p-0 m-0 overflow-hidden flex items-center justify-center'
            : 'flex-1 w-full min-h-0 min-w-0 flex items-center justify-center overflow-hidden p-1 sm:p-2'
        }
      >
        <div
          ref={containerRef}
          className={
            useImmersiveLayout
              ? 'relative w-full h-full min-w-0 min-h-0 max-w-none max-h-none p-0 m-0 overflow-hidden flex items-center justify-center border-0 border-none rounded-none bg-[#07130b] shadow-none'
              : resolvedGameType === 'memory-match'
              ? 'relative w-full h-full max-w-5xl min-h-0 bg-[#0c2012] border-2 sm:border-4 border-[#1e4627] rounded-2xl sm:rounded-3xl shadow-[0_0_50px_rgba(16,185,129,0.15)] overflow-hidden flex flex-col items-center justify-center'
              : 'game-cabinet relative aspect-[16/9] bg-[#0c2012] border-2 sm:border-4 border-[#1e4627] rounded-2xl sm:rounded-3xl shadow-[0_0_50px_rgba(16,185,129,0.15)] overflow-hidden flex items-center justify-center'
          }
        >
          {/* Dynamic Game Component */}
          <GameComponent
            activeTheme={activeTheme}
            settings={settings}
            config={gameDef.defaultConfig}
            eventId={eventId}
            publicToken={publicToken}
            isMuted={isMuted}
            isFullscreen={isFullscreen}
            onToggleFullscreen={handleToggleFullscreen}
            onToggleMute={handleToggleMute}
          />
        </div>
      </div>

      {/* Footer Branding (only in windowed mode with footer enabled) */}
      {!useImmersiveLayout && showCabinetFooter && (
        <footer className="h-6 sm:h-7 mb-1 text-slate-500 font-mono text-[10px] sm:text-xs flex items-center gap-2 shrink-0 select-none">
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
