import React, { useState, useEffect } from 'react';
import { PlatformGame } from '../../types/developer';
import { GameTheme } from '../../themes/types';
import { navigateTo } from '../../hooks/useRouteContext';
import { CreateDefaultThemeModal } from './CreateDefaultThemeModal';
import { CreateGameModal } from './CreateGameModal';
import { DeveloperPlayTestModal } from './DeveloperPlayTestModal';
import {
  Gamepad2,
  Sparkles,
  Plus,
  ArrowLeft,
  Edit2,
  Play,
  Copy,
  Trash2,
  CheckCircle2,
  Star,
  Layers,
  Settings,
  Sliders,
  Image as ImageIcon,
  Check,
  AlertCircle,
  AlertTriangle,
  X,
} from 'lucide-react';

interface DeveloperGameDetailProps {
  gameId: string;
  onBack: () => void;
  fetchGameDetails: (gameId: string) => Promise<{ game: PlatformGame; themes: GameTheme[] } | null>;
  onUpdateGame: (gameId: string, data: Partial<PlatformGame>) => Promise<PlatformGame>;
  onCreateSystemTheme: (gameId: string, data: Partial<GameTheme>) => Promise<GameTheme>;
  onDuplicateSystemTheme: (themeId: string, name?: string) => Promise<GameTheme>;
  onDeleteSystemTheme: (themeId: string) => Promise<void>;
  onSetPrimaryDefaultTheme: (themeId: string) => Promise<void>;
  onUnsetPrimaryDefaultTheme: (themeId: string) => Promise<void>;
}

export const DeveloperGameDetail: React.FC<DeveloperGameDetailProps> = ({
  gameId,
  onBack,
  fetchGameDetails,
  onUpdateGame,
  onCreateSystemTheme,
  onDuplicateSystemTheme,
  onDeleteSystemTheme,
  onSetPrimaryDefaultTheme,
  onUnsetPrimaryDefaultTheme,
}) => {
  const [game, setGame] = useState<PlatformGame | null>(null);
  const [themes, setThemes] = useState<GameTheme[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isThemeModalOpen, setIsThemeModalOpen] = useState<boolean>(false);
  const [isGameModalOpen, setIsGameModalOpen] = useState<boolean>(false);
  const [themeToUnsetDefault, setThemeToUnsetDefault] = useState<GameTheme | null>(null);
  const [unsettingDefault, setUnsettingDefault] = useState<boolean>(false);
  const [playtestingTheme, setPlaytestingTheme] = useState<GameTheme | null>(null);
  const [activeTab, setActiveTab] = useState<'themes' | 'engine'>('themes');
  const [notification, setNotification] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    const result = await fetchGameDetails(gameId);
    if (result) {
      setGame(result.game);
      setThemes(result.themes);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [gameId]);

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500" />
      </div>
    );
  }

  if (!game) {
    return (
      <div className="text-center py-20 bg-slate-900/50 border border-slate-800 rounded-2xl p-8">
        <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-white mb-2">Game Not Found</h3>
        <p className="text-xs text-slate-400 mb-4">The specified platform game could not be retrieved.</p>
        <button
          onClick={onBack}
          className="inline-flex items-center space-x-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-xl"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Games</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {notification && (
        <div className="fixed top-6 right-6 z-50 flex items-center space-x-2 px-4 py-3 bg-emerald-600 text-white text-xs font-semibold rounded-xl shadow-2xl animate-in slide-in-from-top-4">
          <Check className="w-4 h-4" />
          <span>{notification}</span>
        </div>
      )}

      {/* Top Breadcrumb & Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-sm">
        <div className="flex items-center space-x-4">
          <button
            onClick={onBack}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-colors shrink-0"
            title="Back to Platform Games"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center space-x-2 text-xs text-slate-400 mb-1">
              <span className="cursor-pointer hover:text-white" onClick={onBack}>
                Games Catalog
              </span>
              <span>/</span>
              <span className="text-emerald-400 font-mono">/{game.slug}</span>
            </div>
            <div className="flex items-center space-x-3">
              <h1 className="text-2xl font-black text-white">{game.name}</h1>
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                {game.game_type}
              </span>
              <span
                className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full border ${
                  game.status === 'active'
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                }`}
              >
                {game.status}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2.5">
          <button
            onClick={() => setIsGameModalOpen(true)}
            className="flex items-center space-x-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition-colors"
          >
            <Edit2 className="w-3.5 h-3.5" />
            <span>Edit Game Metadata</span>
          </button>

          <button
            onClick={() => setIsThemeModalOpen(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 text-xs font-bold rounded-xl shadow-lg shadow-amber-950/30 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Create Default Theme</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center space-x-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('themes')}
          className={`flex items-center space-x-2 px-4 py-2 text-xs font-semibold rounded-xl transition-colors ${
            activeTab === 'themes'
              ? 'bg-slate-800 text-amber-400 border border-slate-700'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>System Default Themes ({themes.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('engine')}
          className={`flex items-center space-x-2 px-4 py-2 text-xs font-semibold rounded-xl transition-colors ${
            activeTab === 'engine'
              ? 'bg-slate-800 text-emerald-400 border border-slate-700'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>Game Engine Defaults & Schema</span>
        </button>
      </div>

      {/* Tab 1: System Default Themes Catalog */}
      {activeTab === 'themes' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400">
              System default themes are published templates available for all tenant organizations to clone and brand.
            </p>
          </div>

          {themes.length === 0 ? (
            <div className="text-center py-16 bg-slate-900/40 border border-slate-800 rounded-2xl p-8">
              <Sparkles className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <h3 className="text-base font-bold text-white mb-1">No System Themes Configured</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto mb-4">
                Create default themes so organizations have ready-to-use branded templates when launching events.
              </p>
              <button
                onClick={() => setIsThemeModalOpen(true)}
                className="inline-flex items-center space-x-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-xl"
              >
                <Plus className="w-4 h-4" />
                <span>Create First Theme</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {themes.map((theme) => {
                const isDefault = Boolean(theme.is_default);
                const itemsCount = theme.items_config?.length || 0;
                const positiveItems = theme.items_config?.filter((i) => i.points > 0).length || 0;
                const hazardsCount = theme.items_config?.filter((i) => i.points < 0 || i.is_bomb).length || 0;

                return (
                  <div
                    key={theme.id}
                    className={`group relative bg-slate-900/90 border rounded-2xl overflow-hidden flex flex-col justify-between transition-all duration-200 hover:shadow-xl ${
                      isDefault ? 'border-amber-500/60 shadow-amber-950/20' : 'border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div>
                      {/* Visual Header / Background Preview */}
                      <div className="relative h-40 w-full bg-slate-950 overflow-hidden flex items-center justify-center border-b border-slate-800">
                        {theme.background_url ? (
                          <img
                            src={theme.background_url}
                            alt={theme.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center text-slate-600">
                            <ImageIcon className="w-8 h-8 mb-1" />
                            <span className="text-[10px]">No Custom Background</span>
                          </div>
                        )}

                        {/* Basket Thumbnail Overlay */}
                        {theme.basket_config?.image_url && (
                          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-12 h-12 rounded-lg bg-black/40 backdrop-blur-sm border border-white/20 p-1 flex items-center justify-center shadow-lg">
                            <img
                              src={theme.basket_config.image_url}
                              alt="Catcher Basket"
                              className="max-h-full max-w-full object-contain"
                            />
                          </div>
                        )}

                        {/* Top Badges */}
                        <div className="absolute top-3 left-3 flex items-center space-x-1.5">
                          {isDefault && (
                            <span className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 text-[10px] font-black uppercase shadow-lg">
                              <Star className="w-3 h-3 fill-slate-950" />
                              <span>Primary Default</span>
                            </span>
                          )}
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase backdrop-blur-md ${
                              theme.status === 'active'
                                ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/30'
                                : 'bg-slate-900/80 text-slate-300 border border-slate-700'
                            }`}
                          >
                            {theme.status}
                          </span>
                        </div>

                        {/* Quick Test Play Floating Button */}
                        <button
                          onClick={() => setPlaytestingTheme(theme)}
                          className="absolute top-3 right-3 p-2 bg-slate-900/80 hover:bg-emerald-600 text-slate-200 hover:text-white rounded-xl backdrop-blur-sm border border-slate-700 hover:border-emerald-500 transition-all shadow-lg group-hover:scale-110"
                          title="Test Play Theme"
                        >
                          <Play className="w-4 h-4 fill-current" />
                        </button>
                      </div>

                      {/* Content Details */}
                      <div className="p-4 space-y-3">
                        <div>
                          <h3 className="text-base font-bold text-white group-hover:text-amber-400 transition-colors">
                            {theme.name}
                          </h3>
                          <p className="text-xs text-slate-400 line-clamp-2 mt-0.5">
                            {theme.description || 'System preset theme configuration.'}
                          </p>
                        </div>

                        {/* Droppable Items Stats */}
                        <div className="grid grid-cols-3 gap-2 py-2 px-3 bg-slate-950/60 rounded-xl border border-slate-800/80 text-center text-xs">
                          <div>
                            <span className="text-[10px] text-slate-500 uppercase block">Items</span>
                            <span className="font-bold text-slate-200 font-mono">{itemsCount}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-emerald-400 uppercase block">Rewards</span>
                            <span className="font-bold text-emerald-400 font-mono">{positiveItems}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-rose-400 uppercase block">Hazards</span>
                            <span className="font-bold text-rose-400 font-mono">{hazardsCount}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Actions Bar */}
                    <div className="p-4 pt-0 flex items-center justify-between border-t border-slate-800/80 mt-2 gap-2">
                      <div className="flex items-center space-x-1">
                        {isDefault ? (
                          <button
                            type="button"
                            onClick={() => setThemeToUnsetDefault(theme)}
                            className="p-2 text-amber-400 bg-amber-500/15 border border-amber-500/30 hover:bg-amber-500/25 hover:border-amber-500/50 hover:text-amber-300 rounded-lg transition-colors cursor-pointer shadow-sm"
                            title="Unset Primary Default"
                          >
                            <Star className="w-4 h-4 fill-current" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await onSetPrimaryDefaultTheme(theme.id);
                                showNotification(`"${theme.name}" is now the primary default theme.`);
                                await loadData();
                              } catch (err: any) {
                                showNotification(err.message || 'Failed to set primary default theme.');
                              }
                            }}
                            className="p-2 text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition-colors cursor-pointer"
                            title="Set as Primary Default"
                          >
                            <Star className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={async () => {
                            await onDuplicateSystemTheme(theme.id);
                            showNotification(`Theme duplicated successfully.`);
                            await loadData();
                          }}
                          className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
                          title="Duplicate Theme"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <button
                          onClick={async () => {
                            if (confirm(`Delete default theme "${theme.name}"?`)) {
                              await onDeleteSystemTheme(theme.id);
                              showNotification('Theme deleted.');
                              await loadData();
                            }
                          }}
                          className="p-2 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                          title="Delete Theme"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => setPlaytestingTheme(theme)}
                          className="flex items-center space-x-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition-colors"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          <span>Test</span>
                        </button>

                        <button
                          onClick={() => navigateTo(`/developer/games/${game.id}/themes/${theme.id}/edit`)}
                          className="flex items-center space-x-1 px-3.5 py-1.5 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/30 hover:border-emerald-500 text-xs font-semibold rounded-xl transition-all"
                        >
                          <Edit2 className="w-3 h-3" />
                          <span>Configure</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Game Engine Defaults & Schema */}
      {activeTab === 'engine' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-base font-bold text-white">Engine Specifications & Physics Baseline</h3>
              <p className="text-xs text-slate-400">
                Core physics, gameplay parameters, and configuration schema for <strong>{game.name}</strong>.
              </p>
            </div>
            <span className="font-mono text-xs text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-lg border border-emerald-500/20">
              Phaser 3 Canvas Runtime
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-slate-950 rounded-xl border border-slate-800">
              <label className="text-xs font-semibold text-slate-400 uppercase block mb-1">Game Engine Key</label>
              <p className="text-sm font-mono font-bold text-white">{game.game_type}</p>
              <p className="text-[11px] text-slate-500 mt-1">Mapped to engine module in registry</p>
            </div>

            <div className="p-4 bg-slate-950 rounded-xl border border-slate-800">
              <label className="text-xs font-semibold text-slate-400 uppercase block mb-1">Ownership Model</label>
              <p className="text-sm font-bold text-emerald-400">{game.ownership_type?.toUpperCase() || 'SYSTEM'}</p>
              <p className="text-[11px] text-slate-500 mt-1">Platform-wide standard game</p>
            </div>

            <div className="p-4 bg-slate-950 rounded-xl border border-slate-800">
              <label className="text-xs font-semibold text-slate-400 uppercase block mb-1">Active Default Theme</label>
              <p className="text-sm font-mono font-bold text-amber-400">
                {themes.find((t) => t.is_default)?.name || 'None (No Primary Default)'}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">Theme provided to new tenants</p>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {/* Unset Primary Default Confirmation Modal */}
      {themeToUnsetDefault && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 bg-slate-800/80 border-b border-slate-700">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <Star className="w-5 h-5 fill-current" />
                </div>
                <h3 className="text-base font-bold text-white">Unset Primary Default?</h3>
              </div>
              <button
                type="button"
                onClick={() => setThemeToUnsetDefault(null)}
                disabled={unsettingDefault}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700/60 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-5">
              <p className="text-sm text-slate-300 leading-relaxed">
                This will remove the Primary Default status from this theme. No theme will be selected as the Primary Default for this game.
              </p>

              <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl flex items-center space-x-3">
                <div className="w-10 h-10 rounded-lg bg-slate-900 border border-slate-700 overflow-hidden flex items-center justify-center shrink-0">
                  {themeToUnsetDefault.background_url ? (
                    <img
                      src={themeToUnsetDefault.background_url}
                      alt={themeToUnsetDefault.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <ImageIcon className="w-5 h-5 text-slate-500" />
                  )}
                </div>
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold text-white truncate">{themeToUnsetDefault.name}</h4>
                  <p className="text-xs text-amber-400/80">Current Primary Default</p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setThemeToUnsetDefault(null)}
                  disabled={unsettingDefault}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!themeToUnsetDefault) return;
                    setUnsettingDefault(true);
                    try {
                      await onUnsetPrimaryDefaultTheme(themeToUnsetDefault.id);
                      showNotification(`Primary default status removed from "${themeToUnsetDefault.name}".`);
                      setThemeToUnsetDefault(null);
                      await loadData();
                    } catch (err: any) {
                      showNotification(err.message || 'Failed to unset primary default theme.');
                    } finally {
                      setUnsettingDefault(false);
                    }
                  }}
                  disabled={unsettingDefault}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-bold transition-colors disabled:opacity-50 cursor-pointer shadow-lg"
                >
                  {unsettingDefault ? 'Unsetting...' : 'Unset Primary Default'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <CreateDefaultThemeModal
        gameId={game.id}
        gameName={game.name}
        isOpen={isThemeModalOpen}
        onClose={() => setIsThemeModalOpen(false)}
        onSave={async (themeData) => {
          await onCreateSystemTheme(game.id, themeData);
          showNotification('System default theme created successfully.');
          loadData();
        }}
      />

      <CreateGameModal
        initialGame={game}
        isOpen={isGameModalOpen}
        onClose={() => setIsGameModalOpen(false)}
        onSave={async (data) => {
          await onUpdateGame(game.id, data);
          showNotification('Game metadata updated.');
          loadData();
        }}
      />

      {playtestingTheme && (
        <DeveloperPlayTestModal
          theme={playtestingTheme}
          gameName={game.name}
          onClose={() => setPlaytestingTheme(null)}
        />
      )}
    </div>
  );
};
