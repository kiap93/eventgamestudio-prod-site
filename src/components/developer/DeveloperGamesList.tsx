import React, { useState } from 'react';
import { PlatformGame, PlatformStats } from '../../types/developer';
import { navigateTo } from '../../hooks/useRouteContext';
import { CreateGameModal } from './CreateGameModal';
import { getGameTypeIcon } from '../../games';
import {
  Gamepad2,
  Plus,
  Search,
  Layers,
  Sparkles,
  Edit2,
  Trash2,
  CheckCircle,
  Clock,
  Archive,
  ArrowRight,
  ShieldCheck,
  LayoutGrid,
  Activity,
  Sliders,
} from 'lucide-react';

interface DeveloperGamesListProps {
  games: PlatformGame[];
  stats: PlatformStats | null;
  loading: boolean;
  onRefresh: () => void;
  onCreateGame: (data: Partial<PlatformGame>) => Promise<PlatformGame>;
  onUpdateGame: (gameId: string, data: Partial<PlatformGame>) => Promise<PlatformGame>;
  onDeleteGame: (gameId: string) => Promise<void>;
}

export const DeveloperGamesList: React.FC<DeveloperGamesListProps> = ({
  games,
  stats,
  loading,
  onRefresh,
  onCreateGame,
  onUpdateGame,
  onDeleteGame,
}) => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [editingGame, setEditingGame] = useState<PlatformGame | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const handleDelete = async (game: PlatformGame) => {
    setActionError(null);
    if (!confirm(`Are you sure you want to delete "${game.name}"? If any events have used this game, deletion will be blocked.`)) {
      return;
    }

    try {
      await onDeleteGame(game.id);
    } catch (err: any) {
      setActionError(err.message || 'Failed to delete game');
    }
  };

  const handleToggleStatus = async (game: PlatformGame) => {
    setActionError(null);
    setTogglingId(game.id);
    try {
      const nextStatus = game.status === 'active' ? 'draft' : 'active';
      await onUpdateGame(game.id, { status: nextStatus });
    } catch (err: any) {
      setActionError(err.message || 'Failed to update game status');
    } finally {
      setTogglingId(null);
    }
  };

  const filteredGames = games.filter((game) => {
    const matchesSearch =
      game.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      game.slug.toLowerCase().includes(searchTerm.toLowerCase()) ||
      game.game_type.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (game.description && game.description.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesStatus = statusFilter === 'all' || game.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {actionError && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-between text-xs text-rose-300">
          <div className="flex items-center gap-2.5">
            <Archive className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{actionError}</span>
          </div>
          <button
            onClick={() => setActionError(null)}
            className="text-slate-400 hover:text-white p-1 rounded"
          >
            Dismiss
          </button>
        </div>
      )}
      {/* Platform Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Registered Games</p>
            <p className="text-2xl font-black text-white mt-1">{stats?.totalGames ?? games.length}</p>
            <span className="text-[11px] text-emerald-400 font-medium flex items-center mt-1">
              <CheckCircle className="w-3 h-3 mr-1 inline" />
              {stats?.activeGames ?? games.filter((g) => g.status === 'active').length} active in catalog
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center">
            <Gamepad2 className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Default Themes</p>
            <p className="text-2xl font-black text-white mt-1">{stats?.totalDefaultThemes ?? 0}</p>
            <span className="text-[11px] text-amber-400 font-medium flex items-center mt-1">
              <Sparkles className="w-3 h-3 mr-1 inline" />
              {stats?.activeThemes ?? 0} published presets
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center">
            <Sparkles className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Architecture</p>
            <p className="text-base font-bold text-slate-200 mt-1">System Hierarchy</p>
            <span className="text-[11px] text-slate-400 font-mono flex items-center mt-1">
              Game → Themes
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center justify-center">
            <Layers className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Developer Security</p>
            <p className="text-base font-bold text-emerald-400 mt-1">Developer Admin</p>
            <span className="text-[11px] text-slate-400 font-medium flex items-center mt-1">
              <ShieldCheck className="w-3 h-3 mr-1 text-emerald-400 inline" />
              Direct Platform Access
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center justify-center">
            <Activity className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Action and Search Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/80 p-4 border border-slate-800 rounded-2xl">
        <div className="flex items-center gap-3 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search games by title, slug, or engine type..."
              className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        <button
          onClick={() => {
            setEditingGame(null);
            setIsCreateModalOpen(true);
          }}
          className="flex items-center justify-center space-x-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-lg shadow-emerald-950/40 transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Register New Game</span>
        </button>
      </div>

      {/* Games Catalog Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20 bg-slate-900/40 border border-slate-800/80 rounded-2xl">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500" />
        </div>
      ) : filteredGames.length === 0 ? (
        <div className="text-center py-16 bg-slate-900/40 border border-slate-800/80 rounded-2xl p-8">
          <Gamepad2 className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-bold text-white mb-1">No Games Found</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto mb-4">
            {searchTerm ? 'No games match your search query.' : 'Get started by registering a platform game.'}
          </p>
          <button
            onClick={() => {
              setEditingGame(null);
              setIsCreateModalOpen(true);
            }}
            className="inline-flex items-center space-x-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl"
          >
            <Plus className="w-4 h-4" />
            <span>Add Game</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredGames.map((game) => {
            const isActive = game.status === 'active';
            const themeCount = game.system_theme_count ?? game.theme_count ?? 0;
            return (
              <div
                key={game.id}
                className="group relative bg-slate-900/90 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-5 flex flex-col justify-between transition-all duration-200 hover:shadow-xl hover:shadow-emerald-950/20"
              >
                <div>
                  {/* Top Game Card Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center space-x-3">
                      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-600/20 to-teal-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-inner">
                        {getGameTypeIcon(game.game_type || game.icon_name || game.slug, 'w-6 h-6')}
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-white group-hover:text-emerald-400 transition-colors">
                          {game.name}
                        </h3>
                        <p className="text-[11px] font-mono text-slate-400">/{game.slug}</p>
                      </div>
                    </div>

                    <span
                      className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full border ${
                        isActive
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : game.status === 'draft'
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      {game.status}
                    </span>
                  </div>

                  {/* Engine Specs Box */}
                  <div className="p-3 bg-slate-950/70 rounded-xl border border-slate-800/80 mb-3 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400 text-[11px]">Game Type:</span>
                      <span className="text-[11px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {game.game_type}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400 text-[11px]">Slug:</span>
                      <span className="text-[11px] font-mono text-slate-300">/{game.slug}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400 text-[11px] flex items-center">
                        <Sparkles className="w-3 h-3 mr-1 text-amber-400" />
                        Themes:
                      </span>
                      <span className="font-bold text-white font-mono bg-slate-800/90 px-2 py-0.5 rounded border border-slate-700">
                        {themeCount} Default {themeCount === 1 ? 'Theme' : 'Themes'}
                      </span>
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-xs text-slate-400 line-clamp-2 min-h-[32px] mb-4">
                    {game.description || 'Interactive brand engagement game engine and mechanics.'}
                  </p>
                </div>

                {/* Bottom Actions */}
                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => handleToggleStatus(game)}
                      disabled={togglingId === game.id}
                      className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition-colors ${
                        isActive
                          ? 'bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20'
                          : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20'
                      }`}
                      title={isActive ? 'Deactivate game' : 'Activate game'}
                    >
                      {isActive ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      onClick={() => {
                        setEditingGame(game);
                        setIsCreateModalOpen(true);
                      }}
                      className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                      title="Edit Game Metadata"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(game)}
                      className="p-2 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                      title="Delete Game (Blocked if events exist)"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <button
                    onClick={() => navigateTo(`/developer/games/${game.id}`)}
                    className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/30 hover:border-emerald-500 text-xs font-semibold rounded-xl transition-all"
                  >
                    <span>Manage Themes</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      <CreateGameModal
        initialGame={editingGame}
        existingGames={games}
        isOpen={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false);
          setEditingGame(null);
        }}
        onSave={async (data) => {
          if (editingGame) {
            await onUpdateGame(editingGame.id, data);
          } else {
            await onCreateGame(data);
          }
          onRefresh();
        }}
      />
    </div>
  );
};
