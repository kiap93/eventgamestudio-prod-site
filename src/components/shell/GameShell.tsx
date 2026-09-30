import React, { useEffect, useState, useRef } from 'react';
import { GameTheme, initActiveTheme, getThemeById, getThemeGameType } from '../../themes';
import { useResponsiveLayout } from '../../themes/responsive';
import { GameSettings, GameState, GameStats } from '../../types';
import { getGameSettings, mapServerSettingsToGameSettings, setActiveGameSettings } from '../../game/settings';
import { useAuth } from '../../context/AuthContext';
import { getGameDefinition, DEFAULT_GAME_TYPE } from '../../games/registry';
import { GameTypeId } from '../../games/types';
import { useLocalization } from '../../context/LocalizationContext';

export interface GameShellProps {
  gameType?: GameTypeId | string;
  theme?: GameTheme;
  customTheme?: GameTheme;
  customSettings?: GameSettings;
  className?: string;
  showCabinetFooter?: boolean;
  eventId?: string;
  publicToken?: string;
  isEventPreview?: boolean;
  isEventTest?: boolean;
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
  isEventPreview,
  isEventTest,
  allowImmersiveFullscreen = true,
  isFullscreen: controlledFullscreen,
  onToggleFullscreen: controlledToggleFullscreen,
}) => {
  const { t } = useLocalization();
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
    if (resolvedGameType === 'reaction-tap' || resolvedGameType === 'reaction-time') return getThemeById('reaction-time');
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
    } else if (resolvedGameType === 'reaction-tap' || resolvedGameType === 'reaction-time') {
      setActiveThemeState(getThemeById('reaction-time'));
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

  const handleToggleFullscreen = async () => {
    if (controlledToggleFullscreen) {
      controlledToggleFullscreen();
      return;
    }

    const isCurrentlyFs =
      !!document.fullscreenElement || !!(document as any).webkitFullscreenElement;
    if (!isCurrentlyFs) {
      const el = containerRef.current || document.documentElement;
      const reqFs =
        el.requestFullscreen ||
        (el as any).webkitRequestFullscreen ||
        (el as any).mozRequestFullScreen ||
        (el as any).msRequestFullscreen;
      if (reqFs) {
        try {
          await reqFs.call(el);
        } catch (err) {
          console.warn('Fullscreen request failed:', err);
        }
      }
    } else {
      const exitFs =
        document.exitFullscreen ||
        (document as any).webkitExitFullscreen ||
        (document as any).mozCancelFullScreen ||
        (document as any).msExitFullscreen;
      if (exitFs) {
        try {
          await exitFs.call(document);
        } catch (err) {
          console.warn('Exit fullscreen failed:', err);
        }
      }
    }
  };

  const handleToggleMute = () => {
    setIsMuted((prev) => !prev);
  };

  const useImmersiveLayout = isFullscreen && allowImmersiveFullscreen;
  const orientationPreference = activeTheme?.layout?.orientation || 'auto';
  const responsive = useResponsiveLayout(containerRef, orientationPreference);

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
              : `game-cabinet relative ${
                  responsive.isPortrait
                    ? 'aspect-[9/16] max-h-[96vh] w-auto h-full max-w-full'
                    : 'aspect-[16/9] max-w-full max-h-full'
                } bg-[#0c2012] border-2 sm:border-4 border-[#1e4627] rounded-2xl sm:rounded-3xl shadow-[0_0_50px_rgba(16,185,129,0.15)] overflow-hidden flex items-center justify-center`
          }
        >
          {/* Dynamic Game Component */}
          <GameComponent
            activeTheme={activeTheme}
            settings={settings}
            config={gameDef.defaultConfig}
            eventId={eventId}
            publicToken={publicToken}
            isEventPreview={isEventPreview}
            isEventTest={isEventTest}
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
          <span>{t('landing.multiGamePlatform')}</span>
        </footer>
      )}
    </div>
  );
};
