import React, { useState, useMemo } from 'react';
import {
  Gamepad2,
  Search,
  Sparkles,
  Layers,
  Calendar,
  Play,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Filter,
  RefreshCw,
  Activity,
  Layers2,
  ExternalLink,
} from 'lucide-react';
import { GameRecord } from '../../types';

interface GameCatalogViewProps {
  games: GameRecord[];
  isLoading: boolean;
  onSelectGame: (game: GameRecord) => void;
  onPlayDemo: (game: GameRecord) => void;
  onRefresh: () => void;
}

export const GameCatalogView: React.FC<GameCatalogViewProps> = ({
  games,
  isLoading,
  onSelectGame,
  onPlayDemo,
  onRefresh,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'draft'>('all');

  // Extract unique game types for filtering
  const availableGameTypes = useMemo(() => {
    const types = new Set<string>();
    games.forEach((g) => {
      if (g.game_type) types.add(g.game_type);
    });
    return Array.from(types);
  }, [games]);

  // Filtered games
  const filteredGames = useMemo(() => {
    return games.filter((game) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        q === '' ||
        game.name.toLowerCase().includes(q) ||
        (game.description && game.description.toLowerCase().includes(q)) ||
        (game.game_type && game.game_type.toLowerCase().includes(q)) ||
        game.slug.toLowerCase().includes(q);

      const matchesType = typeFilter === 'all' || game.game_type === typeFilter;
      const matchesStatus = statusFilter === 'all' || game.status === statusFilter;

      return matchesSearch && matchesType && matchesStatus;
    });
  }, [games, searchQuery, typeFilter, statusFilter]);

  // Helper to format game type name
  const formatGameTypeName = (type?: string) => {
    if (!type) return 'Arcade Game';
    switch (type) {
      case 'catch-brand':
        return 'Catch The Brand';
      case 'memory-match':
        return 'Memory Match';
      case 'spin-wheel':
        return 'Lucky Wheel';
      case 'trivia-quiz':
        return 'Trivia Quiz';
      case 'tap-reflex':
        return 'Reflex Tap';
      default:
        return type
          .split('-')
          .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
          .join(' ');
    }
  };

  // Helper to pick banner colors/illustrations per game type
  const getGameVisualGradient = (type?: string) => {
    switch (type) {
      case 'catch-brand':
        return 'from-amber-600/30 via-orange-600/20 to-slate-900 border-amber-500/30';
      case 'memory-match':
        return 'from-indigo-600/30 via-purple-600/20 to-slate-900 border-indigo-500/30';
      case 'trivia-quiz':
        return 'from-emerald-600/30 via-teal-600/20 to-slate-900 border-emerald-500/30';
      case 'spin-wheel':
        return 'from-rose-600/30 via-pink-600/20 to-slate-900 border-rose-500/30';
      default:
        return 'from-cyan-600/30 via-blue-600/20 to-slate-900 border-cyan-500/30';
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8 font-sans animate-in fade-in duration-200">
      {/* Top Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 border border-slate-800 rounded-3xl p-6 sm:p-8 relative overflow-hidden shadow-xl">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-radial from-amber-500/10 to-transparent pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold uppercase tracking-wider">
              <Gamepad2 className="w-3.5 h-3.5" />
              <span>Platform Game Catalog</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-100 tracking-tight">
              Interactive Event Games
            </h1>
            <p className="text-sm text-slate-400 leading-relaxed">
              Explore available game engines, manage branded themes, customize physics and visuals, and configure games for your live promotional events.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onRefresh}
              disabled={isLoading}
              className="px-3.5 py-2 bg-slate-800/80 hover:bg-slate-700 active:scale-95 text-slate-300 border border-slate-700/60 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900/90 border border-slate-800/90 rounded-2xl p-3 sm:p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md">
        {/* Search Input */}
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Search games by title, type, or tags..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          {/* Game Type Filter */}
          {availableGameTypes.length > 1 && (
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-amber-500 cursor-pointer shrink-0"
            >
              <option value="all">All Game Types</option>
              {availableGameTypes.map((t) => (
                <option key={t} value={t}>
                  {formatGameTypeName(t)}
                </option>
              ))}
            </select>
          )}

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-amber-500 cursor-pointer shrink-0"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active Only</option>
            <option value="draft">Draft Only</option>
          </select>
        </div>
      </div>

      {/* Games Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="bg-slate-900 border border-slate-800 rounded-3xl p-6 h-72 animate-pulse flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="w-12 h-12 bg-slate-800 rounded-2xl" />
                <div className="w-3/4 h-5 bg-slate-800 rounded-lg" />
                <div className="w-full h-12 bg-slate-800/60 rounded-lg" />
              </div>
              <div className="w-full h-10 bg-slate-800 rounded-xl" />
            </div>
          ))}
        </div>
      ) : filteredGames.length === 0 ? (
        <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-12 text-center space-y-4">
          <div className="w-16 h-16 bg-slate-800 rounded-3xl mx-auto flex items-center justify-center text-slate-500">
            <Gamepad2 className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-slate-200">No games found</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              {searchQuery || typeFilter !== 'all' || statusFilter !== 'all'
                ? 'No games match your active filters. Try adjusting your search query.'
                : 'No games are available in this catalog yet.'}
            </p>
          </div>
          {(searchQuery || typeFilter !== 'all' || statusFilter !== 'all') && (
            <button
              onClick={() => {
                setSearchQuery('');
                setTypeFilter('all');
                setStatusFilter('all');
              }}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
            >
              Clear Filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredGames.map((game) => {
            const visualClass = getGameVisualGradient(game.game_type);
            const themeCount = game.theme_count ?? 0;
            const eventCount = game.event_count ?? 0;

            return (
              <div
                key={game.id}
                className="group bg-slate-900 border border-slate-800 hover:border-amber-500/40 rounded-3xl overflow-hidden transition-all duration-200 hover:shadow-2xl hover:shadow-amber-500/5 flex flex-col justify-between relative"
              >
                {/* Visual Header / Banner */}
                <div className={`p-6 bg-gradient-to-b ${visualClass} border-b border-slate-800 relative`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="p-3 bg-slate-950/80 border border-slate-800/80 rounded-2xl text-amber-400 shadow-inner group-hover:scale-105 transition-transform">
                      <Gamepad2 className="w-6 h-6" />
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-slate-950/80 border border-slate-800 text-slate-300">
                        {formatGameTypeName(game.game_type)}
                      </span>
                      {game.status === 'active' ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                          Active
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400">
                          Draft
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 space-y-1">
                    <h3 className="text-lg font-black text-slate-100 tracking-tight group-hover:text-amber-300 transition-colors">
                      {game.name}
                    </h3>
                    <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                      {game.description || 'Customizable arcade experience with responsive physics, sound effects, and branded drop collectibles.'}
                    </p>
                  </div>
                </div>

                {/* Metrics & Info */}
                <div className="p-6 space-y-5 flex-1 flex flex-col justify-between">
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-3 flex items-center gap-3">
                      <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl">
                        <Layers className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-black text-slate-200">
                          {themeCount} {themeCount === 1 ? 'Theme' : 'Themes'}
                        </div>
                        <div className="text-[10px] text-slate-500 font-medium">Configured</div>
                      </div>
                    </div>

                    <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-3 flex items-center gap-3">
                      <div className="p-2 bg-blue-500/10 text-blue-400 rounded-xl">
                        <Calendar className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-black text-slate-200">
                          {eventCount} {eventCount === 1 ? 'Event' : 'Events'}
                        </div>
                        <div className="text-[10px] text-slate-500 font-medium">Linked</div>
                      </div>
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="flex items-center gap-2 pt-2 border-t border-slate-800/70">
                    <button
                      onClick={() => onPlayDemo(game)}
                      title="Quick play test demo"
                      className="px-3.5 py-2.5 bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-slate-100 border border-slate-700/60 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5 fill-current text-amber-400" />
                      <span>Demo</span>
                    </button>

                    <button
                      onClick={() => onSelectGame(game)}
                      className="flex-1 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 active:scale-98 text-slate-950 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 shadow-md hover:shadow-amber-500/20 cursor-pointer"
                    >
                      <span>Manage Game</span>
                      <ArrowRight className="w-3.5 h-3.5 stroke-[2.5]" />
                    </button>
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
