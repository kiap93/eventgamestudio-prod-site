import React, { useState, useEffect, useMemo, useRef } from 'react';
import { GameShell } from '../shell/GameShell';
import { THEME_REGISTRY, DEFAULT_ACTIVE_THEME_ID, getDefaultThemeForGameType } from '../../themes/registry';
import { GameTheme, getThemeGameType } from '../../themes/types';
import {
  X,
  Play,
  RotateCcw,
  Sparkles,
  Palette,
  Maximize2,
  Minimize2,
  ChevronDown,
  Check,
} from 'lucide-react';
import { navigateTo } from '../../hooks/useRouteContext';
import { useAuth } from '../../context/AuthContext';
import {
  getAvailableGameDefinitions,
  getGameDefinition,
  DEFAULT_GAME_TYPE,
} from '../../games/registry';
import { getGameTypeIconComponent, normalizeGameType } from '../../games/gameIcons';

interface LandingDemoModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialGameId?: string;
  initialThemeId?: string;
  gameTitle?: string;
}

export const LandingDemoModal: React.FC<LandingDemoModalProps> = ({
  isOpen,
  onClose,
  initialGameId = DEFAULT_GAME_TYPE,
  initialThemeId = DEFAULT_ACTIVE_THEME_ID,
  gameTitle,
}) => {
  const { isAuthenticated } = useAuth();

  // Canonical Game & Theme state
  const [selectedGameId, setSelectedGameId] = useState<string>(() =>
    normalizeGameType(initialGameId) || DEFAULT_GAME_TYPE
  );
  const [selectedThemeId, setSelectedThemeId] = useState<string>(initialThemeId);
  const [sessionKey, setSessionKey] = useState<number>(Date.now());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isGameDropdownOpen, setIsGameDropdownOpen] = useState(false);

  const gameDropdownRef = useRef<HTMLDivElement>(null);

  // Authoritative available games from registry
  const availableGames = useMemo(() => {
    return getAvailableGameDefinitions();
  }, []);

  // Currently active game definition
  const currentGameDef = useMemo(() => {
    return getGameDefinition(selectedGameId);
  }, [selectedGameId]);

  // Retrieve raw candidate themes
  const rawCandidateThemes = Object.values(THEME_REGISTRY);

  // Defensive deduplication by theme.id
  const uniqueThemes = Array.from(
    new Map(rawCandidateThemes.map((theme) => [theme.id, theme])).values()
  );

  // Filter ONLY system themes (is_system_theme = true).
  // Custom, client, and test themes (such as tt, test, or org-specific themes) must never appear in Landing Demo.
  const systemDemoThemes = uniqueThemes.filter((theme) => {
    const isSystemTheme = Boolean(
      theme.is_system_theme === true ||
      theme.is_system === true ||
      theme.ownership_type === 'system' ||
      (!theme.organization_id && (
        theme.id === 'default' ||
        theme.id === 'carnival' ||
        theme.id === 'christmas' ||
        theme.id === 'chinese-new-year' ||
        theme.id === 'halloween' ||
        theme.id === 'mango' ||
        theme.id === 'memory-match' ||
        theme.id === 'memory-carnival' ||
        theme.id === 'reaction-tap' ||
        theme.id === 'reaction-time'
      ))
    );

    if (theme.organization_id) return false;
    return isSystemTheme;
  });

  // Strict game-theme association: keep themes matching the current selected game
  const availableGameThemes = useMemo(() => {
    const currentCanonicalGame = normalizeGameType(selectedGameId);
    return systemDemoThemes.filter((theme) => {
      const themeGameType = normalizeGameType(getThemeGameType(theme));
      return themeGameType === currentCanonicalGame;
    });
  }, [systemDemoThemes, selectedGameId]);

  // Active theme resolution
  const currentTheme: GameTheme = useMemo(() => {
    const match = availableGameThemes.find((t) => t.id === selectedThemeId);
    if (match) return match;
    if (availableGameThemes.length > 0) return availableGameThemes[0];
    return getDefaultThemeForGameType(selectedGameId);
  }, [availableGameThemes, selectedThemeId, selectedGameId]);

  // Sync initial game and theme when modal opens or initialGameId changes
  useEffect(() => {
    if (isOpen) {
      const canonicalGame = normalizeGameType(initialGameId) || DEFAULT_GAME_TYPE;
      setSelectedGameId(canonicalGame);

      // Determine valid initial theme for this game
      const defaultTheme = getDefaultThemeForGameType(canonicalGame);
      const isInitialThemeValid = systemDemoThemes.some(
        (t) => t.id === initialThemeId && normalizeGameType(getThemeGameType(t)) === canonicalGame
      );
      setSelectedThemeId(isInitialThemeValid ? initialThemeId : defaultTheme.id);
      setSessionKey(Date.now());
      setIsGameDropdownOpen(false);
    }
  }, [isOpen, initialGameId, initialThemeId]);

  // Handle outside click & escape key for game selector dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (gameDropdownRef.current && !gameDropdownRef.current.contains(event.target as Node)) {
        setIsGameDropdownOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isGameDropdownOpen) {
        setIsGameDropdownOpen(false);
      }
    };
    if (isGameDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isGameDropdownOpen]);

  // Debug logging in non-production
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' && isOpen) {
      console.log(
        '[LandingDemo] Selected game:', selectedGameId,
        'Available themes:', availableGameThemes.map((t) => ({ id: t.id, name: t.name, slug: t.slug }))
      );
    }
  }, [isOpen, selectedGameId, availableGameThemes.length]);

  // Fullscreen change listener
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

  // Handle Game switching
  const handleSelectGame = (gameId: string) => {
    const newCanonical = normalizeGameType(gameId);
    if (newCanonical === selectedGameId) {
      setIsGameDropdownOpen(false);
      return;
    }

    setSelectedGameId(newCanonical);
    setIsGameDropdownOpen(false);

    // Resolve compatible theme for the newly selected game
    const currentThemeCandidate = THEME_REGISTRY[selectedThemeId];
    const isThemeCompatible =
      currentThemeCandidate &&
      normalizeGameType(getThemeGameType(currentThemeCandidate)) === newCanonical;

    if (isThemeCompatible) {
      // Preserve theme if compatible
    } else {
      // Automatically fall back to that game's default theme
      const fallback = getDefaultThemeForGameType(newCanonical);
      setSelectedThemeId(fallback.id);
    }

    // Safely reinitialize game session
    setSessionKey(Date.now());
  };

  // Handle Theme switching
  const handleSelectTheme = (themeId: string) => {
    setSelectedThemeId(themeId);
    setSessionKey(Date.now());
  };

  const handleRestart = () => {
    setSessionKey(Date.now());
  };

  const handleCreateEvent = () => {
    onClose();
    const gameParam = encodeURIComponent(selectedGameId);
    if (isAuthenticated) {
      navigateTo(`/events?create=true&game=${gameParam}`);
    } else {
      navigateTo(`/login?redirect=${encodeURIComponent(`/events?create=true&game=${gameParam}`)}`);
    }
  };

  // Game-specific gameplay instructions
  const getGameInstructions = (gameId: string) => {
    const canonical = normalizeGameType(gameId);
    if (canonical === 'memory-match') {
      return 'Click or tap cards to flip and match all 8 pairs before time runs out.';
    }
    if (canonical === 'reaction-tap') {
      return 'Wait for the 5 red lights to turn off, then tap as fast as you can!';
    }
    return 'Use mouse, keyboard arrows, or touch to catch high-value objects.';
  };

  // Display presentation title: e.g. "Mango Orchard Arcade" or "Brand Memory Match"
  const themePresentationTitle = currentTheme.name.toLowerCase().includes('arcade') ||
    currentTheme.name.toLowerCase().includes('challenge') ||
    currentTheme.name.toLowerCase().includes('match')
    ? currentTheme.name
    : `${currentTheme.name} Arcade`;

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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between px-4 sm:px-6 py-3 bg-white border-b border-slate-200 gap-3">
          {/* Header Left: Hierarchy with Game Title and Theme Presentation */}
          <div className="flex items-center space-x-3 min-w-0">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-amber-50 text-amber-600 border border-amber-200 shadow-xs shrink-0">
              <Play className="w-4 h-4 fill-amber-500" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-2">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 uppercase tracking-wider shrink-0">
                  INTERACTIVE DEMO
                </span>
                <span className="text-xs text-slate-500 font-semibold truncate hidden md:inline">
                  {currentGameDef.name}
                </span>
              </div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight truncate">
                {themePresentationTitle}
              </h2>
            </div>
          </div>

          {/* Header Center & Right: Game Selector, Theme Selector, and Actions */}
          <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2">
            {/* 1. GAME SELECTOR DROPDOWN */}
            <div className="relative" ref={gameDropdownRef}>
              <button
                type="button"
                onClick={() => setIsGameDropdownOpen(!isGameDropdownOpen)}
                aria-expanded={isGameDropdownOpen}
                aria-haspopup="true"
                aria-label="Select Game Engine"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-800 shadow-xs transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500/40"
              >
                <span className="text-[10px] uppercase font-bold text-amber-600 tracking-wider">GAME:</span>
                <span className="max-w-[130px] sm:max-w-[160px] truncate text-slate-900">
                  {currentGameDef.name}
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
                    isGameDropdownOpen ? 'rotate-180 text-amber-600' : ''
                  }`}
                />
              </button>

              {/* Game Dropdown Menu */}
              {isGameDropdownOpen && (
                <div
                  role="menu"
                  aria-orientation="vertical"
                  className="absolute left-0 sm:left-auto sm:right-0 mt-1.5 w-64 sm:w-72 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 py-1.5 animate-in fade-in zoom-in-95 duration-100 divide-y divide-slate-100"
                >
                  <div className="px-3 py-1.5 flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    <span>Select Game</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-mono">
                      {availableGames.length} Engines
                    </span>
                  </div>
                  <div className="py-1 max-h-64 overflow-y-auto">
                    {availableGames.map((game) => {
                      const isSelected = normalizeGameType(game.id) === selectedGameId;
                      const GameIcon = getGameTypeIconComponent(game.id);

                      return (
                        <button
                          key={game.id}
                          role="menuitem"
                          type="button"
                          onClick={() => handleSelectGame(game.id)}
                          className={`w-full text-left px-3 py-2 flex items-center justify-between gap-2.5 text-xs transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-amber-50/80 text-amber-950 font-bold'
                              : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div
                              className={`p-1.5 rounded-lg border shrink-0 ${
                                isSelected
                                  ? 'bg-amber-500 text-slate-950 border-amber-500'
                                  : 'bg-slate-100 text-slate-500 border-slate-200'
                              }`}
                            >
                              <GameIcon className="w-3.5 h-3.5" />
                            </div>
                            <div className="truncate">
                              <div className="truncate font-semibold">{game.name}</div>
                              <div className="text-[10px] text-slate-400 font-normal capitalize">
                                {game.category} • {game.defaultDurationSeconds}s
                              </div>
                            </div>
                          </div>
                          {isSelected && (
                            <Check className="w-4 h-4 text-amber-600 shrink-0 stroke-[2.5]" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* 2. THEME SELECTOR PILL BAR */}
            {availableGameThemes.length > 0 && (
              <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-200 max-w-full overflow-x-auto">
                <span className="text-[10px] font-semibold text-slate-500 uppercase px-2 flex items-center gap-1 shrink-0">
                  <Palette className="w-3 h-3 text-amber-500" /> Theme:
                </span>
                {availableGameThemes.map((th) => (
                  <button
                    key={th.id}
                    type="button"
                    onClick={() => handleSelectTheme(th.id)}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all shrink-0 cursor-pointer ${
                      selectedThemeId === th.id
                        ? 'bg-white text-slate-900 shadow-xs border border-amber-500 font-bold'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    {th.name.split(' ')[0]}
                  </button>
                ))}
              </div>
            )}

            {/* 3. RIGHT ACTION CONTROLS */}
            <div className="flex items-center space-x-1.5 shrink-0 ml-auto sm:ml-0">
              <button
                type="button"
                onClick={handleRestart}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl border border-slate-200 transition-colors cursor-pointer"
                title="Restart Game Session"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Restart</span>
              </button>

              <button
                type="button"
                onClick={handleToggleFullscreen}
                className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                aria-label={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              >
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>

              <button
                type="button"
                onClick={onClose}
                className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                aria-label="Close Demo"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Game Canvas Viewport */}
        <div className="relative flex-1 bg-slate-950 overflow-hidden flex items-center justify-center p-0">
          <div className="w-full h-full flex items-center justify-center">
            <GameShell
              key={`${selectedGameId}-${selectedThemeId}-${sessionKey}`}
              gameType={selectedGameId}
              customTheme={currentTheme}
              showCabinetFooter={false}
              className="w-full h-full overflow-hidden"
              isFullscreen={isFullscreen}
              onToggleFullscreen={handleToggleFullscreen}
            />
          </div>
        </div>

        {/* Footer Bar with CTA */}
        <div className="px-4 sm:px-6 py-3.5 bg-white border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs shrink-0">
          <div className="flex items-center gap-2 text-slate-600">
            <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
            <span>{getGameInstructions(selectedGameId)}</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleCreateEvent}
              className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black rounded-xl shadow-md shadow-amber-500/20 transition-all text-xs cursor-pointer flex items-center gap-1.5"
            >
              <span>Create Event With This Game</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
