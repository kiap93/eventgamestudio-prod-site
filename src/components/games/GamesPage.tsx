import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLocalization } from '../../context/LocalizationContext';
import { apiFetch } from '../../lib/api';
import { navigateTo } from '../../hooks/useRouteContext';
import { GameRecord } from '../../types';
import { GameDetailView } from './GameDetailView';
import { getGameTypeIconComponent, formatGameTypeName, normalizeGameType } from '../../games';
import {
  Gamepad2,
  Sparkles,
  ArrowRight,
  Layers,
  Play,
  RotateCcw,
  CheckCircle2,
  Clock,
  Search,
  Filter,
} from 'lucide-react';

export const GamesPage: React.FC = () => {
  const { t } = useLocalization();
  const { currentOrganization, themes, fetchThemes } = useAuth();

  const [games, setGames] = useState<GameRecord[]>([]);
  const [selectedGame, setSelectedGame] = useState<GameRecord | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const loadGames = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/games');
      if (res.ok) {
        const data = await res.json();
        setGames(data.games || []);
      }
    } catch (err) {
      console.warn('Failed to load games:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGames();
    fetchThemes();
  }, [loadGames, fetchThemes, currentOrganization?.id]);

  if (selectedGame) {
    return (
      <GameDetailView
        game={selectedGame}
        onBack={() => setSelectedGame(null)}
        onEditTheme={(themeId) => navigateTo(`/studio/${themeId}`)}
      />
    );
  }

  const filteredGames = games.filter((g) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      g.name.toLowerCase().includes(q) ||
      (g.description && g.description.toLowerCase().includes(q)) ||
      g.game_type.toLowerCase().includes(q)
    );
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400 shrink-0">
            <Gamepad2 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-100">
              {t('common.interactiveEventGames', undefined, 'Interactive Event Games')}
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              {t(
                'games.catalogSubtitle',
                undefined,
                'Manage your branded themes, playtest mechanics, and configure games for upcoming live events.'
              )}
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64 shrink-0">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('common.search', undefined, 'Search games...')}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 outline-none focus:border-amber-500 transition-all placeholder:text-slate-600"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center p-16 space-y-3">
          <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-slate-400">{t('common.loading', undefined, 'Loading games...')}</p>
        </div>
      ) : filteredGames.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center text-slate-500 text-xs">
          <Gamepad2 className="w-10 h-10 mx-auto opacity-30 mb-3" />
          <p>{t('games.noGamesFound', undefined, 'No games found matching your search.')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredGames.map((game) => {
            const normalizedType = normalizeGameType(game.game_type);
            const GameIcon = getGameTypeIconComponent(normalizedType);
            const gameThemes = themes.filter((th) => {
              const thType = normalizeGameType(th.game_type || '');
              return thType === normalizedType || th.game_id === game.id;
            });

            return (
              <div
                key={game.id}
                onClick={() => setSelectedGame(game)}
                className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl hover:border-amber-500/50 transition-all cursor-pointer flex flex-col justify-between group"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="w-12 h-12 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center justify-center text-amber-400 group-hover:scale-105 transition-transform">
                      <GameIcon className="w-6 h-6" />
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                      <Layers className="w-3 h-3" />
                      {gameThemes.length} {gameThemes.length === 1 ? 'Theme' : 'Themes'}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider">
                      {formatGameTypeName(normalizedType)}
                    </span>
                    <h3 className="text-lg font-bold text-slate-100 group-hover:text-amber-400 transition-colors">
                      {game.name}
                    </h3>
                  </div>

                  <p className="text-xs text-slate-400 leading-relaxed line-clamp-3">
                    {game.description || t('games.defaultDescription', undefined, 'Customizable interactive mini-game for live brand activations.')}
                  </p>
                </div>

                <div className="pt-6 mt-6 border-t border-slate-800/80 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-400 group-hover:text-slate-200 transition-colors">
                    {t('games.manageThemes', undefined, 'Manage Themes & Playtest')}
                  </span>
                  <div className="p-2 rounded-xl bg-slate-800 group-hover:bg-amber-500 text-slate-400 group-hover:text-slate-950 transition-all">
                    <ArrowRight className="w-4 h-4" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
