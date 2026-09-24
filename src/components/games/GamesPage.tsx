import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useRouteContext, navigateTo } from '../../hooks/useRouteContext';
import { apiFetch } from '../../lib/api';
import { GameRecord } from '../../types';
import { GameCatalogView } from './GameCatalogView';
import { GameDetailView } from './GameDetailView';
import { ThemeEditor } from '../studio/ThemeEditor';
import { GameShell } from '../shell/GameShell';
import { getActiveTheme } from '../../themes';
import {
  Gamepad2,
  Play,
  RotateCcw,
  Maximize2,
  Minimize2,
} from 'lucide-react';

export const GamesPage: React.FC = () => {
  const { currentOrganization, fetchThemes } = useAuth();
  const routeContext = useRouteContext();

  const [games, setGames] = useState<GameRecord[]>([]);
  const [isLoadingGames, setIsLoadingGames] = useState<boolean>(true);
  const [gamesError, setGamesError] = useState<string | null>(null);

  // URL parsing helper
  const parseGamesRoute = () => {
    const pathname = window.location.pathname;
    const searchParams = new URLSearchParams(window.location.search);
    const queryThemeId = searchParams.get('editTheme');

    // Pattern 1: /games/:gameId/themes/:themeId/edit
    const matchNestedEdit = pathname.match(/^\/games\/([^/]+)\/themes\/([^/]+)\/edit$/);
    if (matchNestedEdit) {
      return { gameId: matchNestedEdit[1], themeId: matchNestedEdit[2] };
    }

    // Pattern 2: /game-themes/:themeId/edit (backward-compat)
    const matchLegacyEdit = pathname.match(/^\/game-themes\/([^/]+)\/edit$/);
    if (matchLegacyEdit) {
      return { gameId: null, themeId: matchLegacyEdit[1] };
    }

    // Pattern 3: query param ?editTheme=...
    if (queryThemeId) {
      return { gameId: null, themeId: queryThemeId };
    }

    // Pattern 4: /games/:gameId
    const matchGameDetail = pathname.match(/^\/games\/([^/]+)$/);
    if (matchGameDetail && matchGameDetail[1] !== 'themes') {
      return { gameId: matchGameDetail[1], themeId: null };
    }

    return { gameId: null, themeId: null };
  };

  const initialRoute = parseGamesRoute();
  const [selectedGameId, setSelectedGameId] = useState<string | null>(initialRoute.gameId);
  const [editingThemeId, setEditingThemeId] = useState<string | null>(initialRoute.themeId);

  // Check if current flow is onboarding
  const isOnboarding = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('onboarding') === 'true';

  // Quick Demo Play Modal
  const [demoPlayingGame, setDemoPlayingGame] = useState<GameRecord | null>(null);
  const [demoRestartKey, setDemoRestartKey] = useState<number>(0);
  const [isDemoFullscreen, setIsDemoFullscreen] = useState<boolean>(false);

  // Synchronize fullscreen state with browser events
  useEffect(() => {
    const handleFsChange = () => {
      setIsDemoFullscreen(
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

  const handleToggleDemoFullscreen = () => {
    const isCurrentlyFs =
      !!document.fullscreenElement || !!(document as any).webkitFullscreenElement;
    if (!isCurrentlyFs && !isDemoFullscreen) {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else if ((document.documentElement as any).webkitRequestFullscreen) {
        (document.documentElement as any).webkitRequestFullscreen();
      }
      setIsDemoFullscreen(true);
    } else {
      if (document.fullscreenElement || (document as any).webkitFullscreenElement) {
        if (document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        } else if ((document as any).webkitExitFullscreen) {
          (document as any).webkitExitFullscreen();
        }
      }
      setIsDemoFullscreen(false);
    }
  };

  // Fetch games list
  const loadGames = useCallback(async () => {
    setIsLoadingGames(true);
    setGamesError(null);
    try {
      const res = await apiFetch('/api/games');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.games)) {
          setGames(data.games);
        }
      } else {
        const err = await res.json().catch(() => ({}));
        setGamesError(err.error || 'Failed to load games catalog');
      }
    } catch (err: any) {
      console.error('Error fetching games:', err);
      setGamesError(err.message || 'Network error loading games');
    } finally {
      setIsLoadingGames(false);
    }
  }, []);

  useEffect(() => {
    loadGames();
    fetchThemes();
  }, [loadGames, fetchThemes]);

  // Handle browser back / forward navigation and global route synchronization
  useEffect(() => {
    const handlePopState = () => {
      const route = parseGamesRoute();
      setSelectedGameId(route.gameId);
      setEditingThemeId(route.themeId);
      if (!route.gameId && !route.themeId) {
        setDemoPlayingGame(null);
        setIsDemoFullscreen(false);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  // React immediately to routeContext changes (e.g. clicking global Games tab)
  useEffect(() => {
    const route = parseGamesRoute();
    setSelectedGameId(route.gameId);
    setEditingThemeId(route.themeId);
    if (!route.gameId && !route.themeId) {
      setDemoPlayingGame(null);
      setIsDemoFullscreen(false);
    }
  }, [routeContext.pathname]);

  // Navigation Handlers
  const handleSelectGame = (game: GameRecord) => {
    const newPath = `/games/${game.id}`;
    setSelectedGameId(game.id);
    setEditingThemeId(null);
    fetchThemes(game.id);
    navigateTo(newPath, { gameId: game.id });
  };

  const handleBackToCatalog = () => {
    setSelectedGameId(null);
    setEditingThemeId(null);
    loadGames();
    navigateTo('/games');
  };

  const handleOpenThemeEditor = (themeId: string) => {
    const gameId = selectedGameId || (games.length > 0 ? games[0].id : 'default');
    const newPath = `/games/${gameId}/themes/${themeId}/edit`;
    setEditingThemeId(themeId);
    navigateTo(newPath, { gameId, themeId });
  };

  const handleBackFromThemeEditor = () => {
    if (selectedGameId) {
      const newPath = `/games/${selectedGameId}`;
      setEditingThemeId(null);
      fetchThemes(selectedGameId);
      navigateTo(newPath, { gameId: selectedGameId });
    } else {
      handleBackToCatalog();
    }
  };

  // Find the currently selected game object
  const selectedGame = selectedGameId
    ? games.find((g) => g.id === selectedGameId) || {
        id: selectedGameId,
        name: 'Catch The Brand',
        slug: 'catch-brand',
        game_type: 'catch-brand',
        status: 'active',
        description: 'Interactive customizable arcade experience.',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
    : null;

  // View 1: Theme Editor
  if (editingThemeId) {
    return (
      <ThemeEditor
        themeId={editingThemeId}
        onBack={handleBackFromThemeEditor}
        isOnboarding={isOnboarding}
      />
    );
  }

  // View 2: Game Detail & Scoped Theme Management
  if (selectedGame) {
    return (
      <GameDetailView
        game={selectedGame}
        onBack={handleBackToCatalog}
        onEditTheme={handleOpenThemeEditor}
      />
    );
  }

  // View 3: Games Catalog View (Default)
  return (
    <>
      <GameCatalogView
        games={games}
        isLoading={isLoadingGames}
        onSelectGame={handleSelectGame}
        onPlayDemo={(game) => {
          setDemoPlayingGame(game);
          setDemoRestartKey((k) => k + 1);
        }}
        onRefresh={loadGames}
      />

      {/* Quick Play Demo Modal */}
      {demoPlayingGame && (
        <div
          className={`fixed inset-0 bg-slate-950/90 backdrop-blur-md z-50 flex items-center justify-center p-2 sm:p-4 ${
            isDemoFullscreen ? 'p-0' : ''
          }`}
        >
          <div
            className={`bg-slate-900 border border-slate-800 flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 ${
              isDemoFullscreen
                ? 'w-full h-full rounded-none border-none max-w-none max-h-none'
                : 'w-full max-w-5xl xl:max-w-6xl h-[88vh] max-h-[840px] rounded-3xl'
            }`}
          >
            <div className="bg-slate-950 border-b border-slate-800 px-4 py-3 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-1.5 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-400">
                  <Play className="w-4 h-4 fill-current" />
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-black text-slate-100 flex items-center gap-2">
                    <span>Demo Engine: {demoPlayingGame.name}</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-800 text-slate-400 rounded-full">
                      {demoPlayingGame.game_type || 'catch-brand'}
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400 hidden sm:block">
                    Interactive engine test. Click &apos;Manage Game&apos; to customize themes, visuals, and audio.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setDemoRestartKey((k) => k + 1)}
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                  title="Restart demo"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Restart</span>
                </button>

                <button
                  onClick={handleToggleDemoFullscreen}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors cursor-pointer"
                  title={isDemoFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                >
                  {isDemoFullscreen ? (
                    <Minimize2 className="w-4 h-4" />
                  ) : (
                    <Maximize2 className="w-4 h-4" />
                  )}
                </button>

                <button
                  onClick={() => setDemoPlayingGame(null)}
                  className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-bold rounded-lg transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="flex-1 relative bg-black overflow-hidden flex items-center justify-center">
              <GameShell
                key={`demo-${demoPlayingGame.id}-${demoRestartKey}`}
                theme={getActiveTheme()}
                gameType={demoPlayingGame.game_type || 'catch-brand'}
                organizationSlug={currentOrganization?.slug || 'preview'}
                isStudioPreview={true}
                isFullscreen={isDemoFullscreen}
                onToggleFullscreen={handleToggleDemoFullscreen}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
};
