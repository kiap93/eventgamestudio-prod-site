import React, { useState, useEffect } from 'react';
import { GameShell } from '../shell/GameShell';
import { THEME_REGISTRY, DEFAULT_ACTIVE_THEME_ID } from '../../themes/registry';
import { GameTheme } from '../../themes/types';
import { X, Play, RotateCcw, Sparkles, Palette, Maximize2, Minimize2 } from 'lucide-react';
import { navigateTo } from '../../hooks/useRouteContext';
import { useAuth } from '../../context/AuthContext';

interface LandingDemoModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialThemeId?: string;
  gameTitle?: string;
}

export const LandingDemoModal: React.FC<LandingDemoModalProps> = ({
  isOpen,
  onClose,
  initialThemeId = DEFAULT_ACTIVE_THEME_ID,
  gameTitle = 'Catch the Brand (Carnival Fiesta)',
}) => {
  const { isAuthenticated } = useAuth();
  const [selectedThemeId, setSelectedThemeId] = useState<string>(initialThemeId);
  const [sessionKey, setSessionKey] = useState<number>(Date.now());
  const [isFullscreen, setIsFullscreen] = useState(false);

  // 1 & 2. Retrieve and trace raw candidate themes BEFORE transformation
  const rawCandidateThemes = Object.values(THEME_REGISTRY);

  // 8. Add final defensive deduplication by theme.id
  const uniqueThemes = Array.from(
    new Map(rawCandidateThemes.map((theme) => [theme.id, theme])).values()
  );

  // 9 & 10. Filter ONLY system themes (is_system_theme = true).
  // Custom, client, and test themes (such as tt, test, or org-specific themes) must never appear in Landing Demo.
  const systemDemoThemes = uniqueThemes.filter((theme) => {
    const isSystemTheme = Boolean(
      theme.is_system_theme === true ||
      theme.is_system === true ||
      theme.ownership_type === 'system' ||
      (!theme.organization_id && (
        theme.id === 'carnival' ||
        theme.id === 'christmas' ||
        theme.id === 'chinese-new-year' ||
        theme.id === 'halloween' ||
        theme.id === 'mango' ||
        theme.id === 'memory-match' ||
        theme.id === 'memory-carnival'
      ))
    );

    // Custom/client/test themes with organization_id must never appear in Landing Demo
    if (theme.organization_id) return false;
    if (!isSystemTheme) return false;

    // Strict game-theme association: keep themes matching the demo game
    const isMemoryMatchGame = gameTitle?.toLowerCase().includes('memory');
    if (isMemoryMatchGame) {
      return theme.game_type === 'memory-match' || theme.game_slug === 'memory-match' || theme.id === 'memory-match';
    } else {
      return (
        (!theme.game_type || theme.game_type === 'catch-brand' || theme.game_slug === 'catch-brand') &&
        theme.id !== 'memory-match' &&
        theme.id !== 'reaction-tap' &&
        theme.game_type !== 'reaction-time'
      );
    }
  });

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' && isOpen) {
      console.log(
        '[LandingDemo] Raw candidate themes before transformation:',
        rawCandidateThemes.map((t) => ({
          id: t.id,
          name: t.name,
          slug: t.slug,
          is_system: t.is_system,
          is_system_theme: t.is_system_theme,
          organization_id: t.organization_id,
        }))
      );
      console.log(
        '[LandingDemo] System demo themes after deduplication & is_system_theme filtering:',
        systemDemoThemes.map((t) => ({ id: t.id, name: t.name, slug: t.slug }))
      );
    }
  }, [isOpen, rawCandidateThemes.length, systemDemoThemes.length]);

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(
        !!document.fullscreenElement || !!(document as any).webkitFullscreenElement
      );
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
    };
  }, []);

  const handleToggleFullscreen = () => {
    const isCurrentlyFs =
      !!document.fullscreenElement || !!(document as any).webkitFullscreenElement;
    if (!isCurrentlyFs && !isFullscreen) {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else if ((document.documentElement as any).webkitRequestFullscreen) {
        (document.documentElement as any).webkitRequestFullscreen();
      }
      setIsFullscreen(true);
    } else {
      if (document.fullscreenElement || (document as any).webkitFullscreenElement) {
        if (document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        } else if ((document as any).webkitExitFullscreen) {
          (document as any).webkitExitFullscreen();
        }
      }
      setIsFullscreen(false);
    }
  };

  if (!isOpen) return null;

  const currentTheme: GameTheme =
    systemDemoThemes.find((t) => t.id === selectedThemeId) ||
    THEME_REGISTRY[selectedThemeId] ||
    systemDemoThemes[0] ||
    THEME_REGISTRY['carnival'];

  const handleRestart = () => {
    setSessionKey(Date.now());
  };

  const handleCreateEvent = () => {
    onClose();
    if (isAuthenticated) {
      navigateTo('/events');
    } else {
      navigateTo('/login');
    }
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200 ${
        isFullscreen ? 'p-0' : 'p-2 sm:p-4'
      }`}
    >
      <div
        className={`relative flex flex-col bg-white border border-slate-200 shadow-2xl overflow-hidden ${
          isFullscreen
            ? 'w-full h-full max-w-none max-h-none rounded-none border-none'
            : 'w-full max-w-5xl xl:max-w-6xl h-[92vh] max-h-[860px] rounded-3xl'
        }`}
      >
        {/* Top Header Bar */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 bg-white border-b border-slate-200">
          <div className="flex items-center space-x-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-amber-50 text-amber-600 border border-amber-200 shadow-xs">
              <Play className="w-4 h-4 fill-amber-500" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                  INTERACTIVE DEMO
                </span>
                <span className="text-xs text-slate-500 font-medium hidden sm:inline">{gameTitle}</span>
              </div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight">
                {currentTheme.name} Arcade
              </h2>
            </div>
          </div>

          {/* Theme Selector Pill Bar */}
          <div className="hidden md:flex items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-200">
            <span className="text-[10px] font-semibold text-slate-500 uppercase px-2 flex items-center gap-1">
              <Palette className="w-3 h-3 text-amber-500" /> Theme:
            </span>
            {systemDemoThemes.map((th) => (
              <button
                key={th.id}
                onClick={() => {
                  setSelectedThemeId(th.id);
                  setSessionKey(Date.now());
                }}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  selectedThemeId === th.id
                    ? 'bg-white text-slate-900 shadow-xs border border-amber-500 font-bold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                {th.name.split(' ')[0]}
              </button>
            ))}
          </div>

          {/* Right Action Controls */}
          <div className="flex items-center space-x-2">
            <button
              onClick={handleRestart}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl border border-slate-200 transition-colors cursor-pointer"
              title="Restart Game Session"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Restart</span>
            </button>

            <button
              onClick={handleToggleFullscreen}
              className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              aria-label={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              aria-label="Close Demo"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Game Canvas Viewport */}
        <div className="relative flex-1 bg-slate-950 overflow-hidden flex items-center justify-center p-0">
          <div className="w-full h-full flex items-center justify-center">
            <GameShell
              key={sessionKey}
              customTheme={currentTheme}
              showCabinetFooter={false}
              className="w-full h-full overflow-hidden"
              isFullscreen={isFullscreen}
              onToggleFullscreen={handleToggleFullscreen}
            />
          </div>
        </div>

        {/* Footer Bar with CTA */}
        <div className="px-4 sm:px-6 py-3.5 bg-white border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-600">
            <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
            <span>
              Use mouse, keyboard arrows, or touch to catch high-value objects.
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleCreateEvent}
              className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black rounded-xl shadow-md shadow-amber-500/20 transition-all text-xs cursor-pointer"
            >
              Create Event With This Game
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
