import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ThemeCard } from '../studio/ThemeCard';
import { CreateThemeDialog } from '../studio/CreateThemeDialog';
import { RenameThemeDialog } from '../studio/RenameThemeDialog';
import { GameShell } from '../shell/GameShell';
import { GameTheme } from '../../themes';
import { GameRecord } from '../../types';
import { getGameTypeIcon, formatGameTypeName } from '../../games';
import {
  Gamepad2,
  ArrowLeft,
  Plus,
  Search,
  Sparkles,
  Layers,
  Calendar,
  Play,
  RotateCcw,
  Maximize2,
  Minimize2,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  FolderOpen,
  Filter,
  Copy,
  Loader2,
  RefreshCw,
  Info,
} from 'lucide-react';

interface GameDetailViewProps {
  game: GameRecord;
  onBack: () => void;
  onEditTheme: (themeId: string) => void;
}

export const GameDetailView: React.FC<GameDetailViewProps> = ({
  game,
  onBack,
  onEditTheme,
}) => {
  const {
    themes,
    createTheme,
    duplicateTheme,
    renameTheme,
    deleteTheme,
    currentOrganization,
    fetchThemes,
    fetchSystemThemes,
    cloneSystemTheme,
    cloneAllSystemThemes,
  } = useAuth();

  const role = currentOrganization?.role || 'viewer';
  const isViewer = role === 'viewer';

  const [activeTab, setActiveTab] = useState<'my-themes' | 'system-themes'>('my-themes');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'archived'>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [themeToRename, setThemeToRename] = useState<GameTheme | null>(null);
  const [showCatalogModal, setShowCatalogModal] = useState(false);
  const [showCloneAllModal, setShowCloneAllModal] = useState(false);
  const [isCloningAll, setIsCloningAll] = useState(false);
  const isCloningAllRef = useRef(false);
  const [cloningThemeId, setCloningThemeId] = useState<string | null>(null);
  const cloningThemeRef = useRef<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // System Themes state for this specific game
  const [systemThemes, setSystemThemes] = useState<GameTheme[]>([]);
  const [isLoadingSystem, setIsLoadingSystem] = useState<boolean>(false);
  const [systemThemeError, setSystemThemeError] = useState<string | null>(null);

  // Live Play Game State
  const [playingTheme, setPlayingTheme] = useState<GameTheme | null>(null);
  const [restartKey, setRestartKey] = useState<number>(0);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Load system themes for this specific game
  const loadSystemThemes = useCallback(async () => {
    if (!game?.id) return;
    setIsLoadingSystem(true);
    setSystemThemeError(null);
    try {
      const list = await fetchSystemThemes(game.id);
      setSystemThemes(list);
      setSystemThemeError(null);
    } catch (err: any) {
      console.error('Failed to load system themes for game:', err);
      setSystemThemeError(err.message || 'Failed to load system templates');
    } finally {
      setIsLoadingSystem(false);
    }
  }, [game?.id, fetchSystemThemes]);

  useEffect(() => {
    loadSystemThemes();
  }, [loadSystemThemes]);

  // Sync fullscreen state
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

  // Filter organization themes SCOPED to this game
  const myGameThemes = useMemo(() => {
    return themes.filter((t) => {
      // Must match this game
      if (t.game_id && t.game_id !== game.id) return false;
      return true;
    });
  }, [themes, game.id]);

  // Filtered My Themes
  const filteredMyThemes = useMemo(() => {
    return myGameThemes.filter((theme) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        q === '' ||
        theme.name.toLowerCase().includes(q) ||
        (theme.description && theme.description.toLowerCase().includes(q)) ||
        theme.slug.toLowerCase().includes(q) ||
        (theme.branding?.gameTitle && theme.branding.gameTitle.toLowerCase().includes(q));

      let matchesStatus = true;
      if (statusFilter === 'draft') {
        matchesStatus = theme.status === 'draft';
      } else if (statusFilter === 'archived') {
        matchesStatus = theme.status === 'archived';
      }

      return matchesSearch && matchesStatus;
    });
  }, [myGameThemes, searchQuery, statusFilter]);

  // Filtered System Themes
  const filteredSystemThemes = useMemo(() => {
    return systemThemes.filter((theme) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        q === '' ||
        theme.name.toLowerCase().includes(q) ||
        (theme.description && theme.description.toLowerCase().includes(q)) ||
        theme.slug.toLowerCase().includes(q) ||
        (theme.branding?.gameTitle && theme.branding.gameTitle.toLowerCase().includes(q));

      let matchesStatus = true;
      if (statusFilter === 'draft') {
        matchesStatus = theme.status === 'draft';
      } else if (statusFilter === 'archived') {
        matchesStatus = theme.status === 'archived';
      }

      return matchesSearch && matchesStatus;
    });
  }, [systemThemes, searchQuery, statusFilter]);

  const showNotification = (type: 'success' | 'error', text: string) => {
    setActionMessage({ type, text });
    setTimeout(() => setActionMessage(null), 4000);
  };

  const handleCloneSystemTheme = async (sysTheme: GameTheme) => {
    if (cloningThemeRef.current || isCloningAll) return;
    cloningThemeRef.current = sysTheme.id;
    setCloningThemeId(sysTheme.id);

    try {
      const cloned = await cloneSystemTheme(sysTheme.id, undefined, game.id);
      showNotification('success', `Theme "${cloned.name}" cloned to My Themes!`);
      await fetchThemes(game.id);
      setActiveTab('my-themes');
    } catch (err: any) {
      showNotification('error', err.message || 'Failed to clone system theme');
    } finally {
      cloningThemeRef.current = null;
      setCloningThemeId(null);
    }
  };

  const handleConfirmCloneAll = async () => {
    if (!game?.id) {
      showNotification('error', 'No game selected');
      return;
    }
    if (isCloningAll || isCloningAllRef.current) return;
    isCloningAllRef.current = true;
    setIsCloningAll(true);

    try {
      const clonedList = await cloneAllSystemThemes(game.id);
      setShowCloneAllModal(false);
      showNotification(
        'success',
        `Successfully cloned ${clonedList.length} default themes into My Themes!`
      );
      await fetchThemes(game.id);
      setActiveTab('my-themes');
    } catch (err: any) {
      showNotification('error', err.message || 'Failed to clone default themes');
    } finally {
      isCloningAllRef.current = false;
      setIsCloningAll(false);
    }
  };

  const handleDuplicateTheme = async (themeId: string) => {
    try {
      const dup = await duplicateTheme(themeId);
      showNotification('success', `Theme duplicated as "${dup.name}"`);
      await fetchThemes(game.id);
    } catch (err: any) {
      showNotification('error', err.message || 'Failed to duplicate theme');
    }
  };

  const handleRenameTheme = async (targetThemeId: string, newName: string) => {
    try {
      await renameTheme(targetThemeId, newName);
      showNotification('success', `Theme renamed to "${newName}" successfully`);
      await fetchThemes(game.id);
    } catch (err: any) {
      showNotification('error', err.message || 'Failed to rename theme');
      throw err;
    }
  };

  const handleDeleteTheme = async (themeId: string) => {
    const target = myGameThemes.find((t) => t.id === themeId);
    if (!target) return;
    if (!window.confirm(`Are you sure you want to delete the theme "${target.name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await deleteTheme(themeId);
      showNotification('success', `Theme "${target.name}" deleted successfully`);
      await fetchThemes(game.id);
    } catch (err: any) {
      showNotification('error', err.message || 'Failed to delete theme');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8 font-sans animate-in fade-in duration-200">
      {/* Top Breadcrumb / Back Button */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 px-3.5 py-2 bg-slate-900 hover:bg-slate-850 active:scale-95 text-slate-300 hover:text-slate-100 border border-slate-800 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          <span>Back to All Games</span>
        </button>

        {actionMessage && (
          <div
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-150 ${
              actionMessage.type === 'success'
                ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                : 'bg-rose-500/10 border border-rose-500/30 text-rose-400'
            }`}
          >
            {actionMessage.type === 'success' ? (
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            ) : (
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            )}
            <span>{actionMessage.text}</span>
          </div>
        )}
      </div>

      {/* Game Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 border border-slate-800 rounded-3xl p-6 sm:p-7 relative overflow-hidden shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="flex items-start gap-4">
            <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-400 shrink-0">
              {getGameTypeIcon(game.game_type || game.icon_name || game.slug, 'w-7 h-7')}
            </div>
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-slate-100 tracking-tight">
                  {game.name}
                </h1>
                <span className="text-[10px] uppercase font-bold px-2.5 py-0.5 rounded-full bg-slate-950 border border-slate-800 text-slate-300">
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
              <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
                {game.description || 'Interactive branded game engine. Manage visual drop items, catcher physics, custom sound effects, and promotional themes for this game.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 self-start md:self-auto">
            {!isViewer && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 rounded-xl text-xs font-black transition-all flex items-center gap-2 shadow-md hover:shadow-amber-500/20 cursor-pointer"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                <span>Create Theme</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs & Actions Bar */}
      <div className="bg-slate-900/90 border border-slate-800/90 rounded-2xl p-3 sm:p-4 flex flex-col md:flex-row items-center justify-between gap-4 shadow-md">
        {/* Sub Tabs: My Themes vs System Templates */}
        <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 w-full md:w-auto">
          <button
            onClick={() => setActiveTab('my-themes')}
            className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'my-themes'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>My Themes ({myGameThemes.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('system-themes')}
            className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'system-themes'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Default Templates ({systemThemes.length})</span>
          </button>
        </div>

        {/* Search & Status Filters */}
        <div className="flex items-center gap-2.5 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search themes by name or item..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-amber-500 cursor-pointer shrink-0"
          >
            <option value="all">All</option>
            <option value="draft">Drafts</option>
            <option value="archived">Archived</option>
          </select>

          {activeTab === 'system-themes' && !isViewer && systemThemes.length > 0 && (
            <button
              onClick={() => setShowCloneAllModal(true)}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 border border-slate-700/60 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
              title="Clone all default templates into your organization"
            >
              <Copy className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Clone All</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Tab Content */}
      {activeTab === 'my-themes' ? (
        /* MY THEMES FOR THIS GAME */
        <div>
          {filteredMyThemes.length === 0 ? (
            <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-10 text-center space-y-4">
              <div className="w-14 h-14 bg-slate-800 rounded-2xl mx-auto flex items-center justify-center text-slate-500">
                <FolderOpen className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-200">
                  {searchQuery ? 'No matching themes' : `No custom themes for ${game.name} yet`}
                </h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  {searchQuery
                    ? 'Try clearing your search query or status filter.'
                    : `Create your first custom theme for ${game.name}, or clone one of the default system templates.`}
                </p>
              </div>
              {!searchQuery && !isViewer && (
                <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-md"
                  >
                    <Plus className="w-4 h-4 stroke-[3]" />
                    <span>Create Theme from Scratch</span>
                  </button>
                  {systemThemes.length > 0 && (
                    <button
                      onClick={() => setActiveTab('system-themes')}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer border border-slate-700"
                    >
                      <Sparkles className="w-4 h-4 text-amber-400" />
                      <span>Browse System Templates ({systemThemes.length})</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredMyThemes.map((theme) => (
                <ThemeCard
                  key={theme.id}
                  theme={theme}
                  onPlay={(t) => setPlayingTheme(t)}
                  onEdit={!isViewer ? () => onEditTheme(theme.id) : undefined}
                  onRename={!isViewer ? (theme) => setThemeToRename(theme) : undefined}
                  onDuplicate={!isViewer ? () => handleDuplicateTheme(theme.id) : undefined}
                  onDelete={!isViewer ? () => handleDeleteTheme(theme.id) : undefined}
                  isSystem={false}
                  isViewer={isViewer}
                  isOnlyTheme={myGameThemes.length === 1}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        /* SYSTEM TEMPLATES FOR THIS GAME */
        <div>
          {isLoadingSystem ? (
            <div className="flex flex-col items-center justify-center p-12 text-slate-500 gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
              <p className="text-xs font-medium">Loading default templates...</p>
            </div>
          ) : systemThemeError ? (
            <div className="bg-rose-500/10 border border-rose-500/30 text-rose-400 p-6 rounded-2xl text-xs space-y-2">
              <div className="flex items-center gap-2 font-bold">
                <AlertCircle className="w-4 h-4" />
                <span>Failed to load default templates</span>
              </div>
              <p>{systemThemeError}</p>
              <button
                onClick={loadSystemThemes}
                className="px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 rounded-lg font-bold transition-colors cursor-pointer"
              >
                Retry
              </button>
            </div>
          ) : filteredSystemThemes.length === 0 ? (
            <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-10 text-center space-y-3">
              <div className="w-14 h-14 bg-slate-800 rounded-2xl mx-auto flex items-center justify-center text-slate-500">
                <Sparkles className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-200">No system templates found</h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  No default templates are currently configured for this game type.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-3.5 flex items-center gap-3 text-xs text-amber-300">
                <Info className="w-4 h-4 shrink-0 text-amber-400" />
                <span>
                  System templates are read-only baseline themes for <strong>{game.name}</strong>. Clone any template into <strong>My Themes</strong> to customize drop items, branding logos, speed multipliers, and audio.
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredSystemThemes.map((theme) => (
                  <ThemeCard
                    key={theme.id}
                    theme={theme}
                    onPlay={(t) => setPlayingTheme(t)}
                    onClone={!isViewer ? () => handleCloneSystemTheme(theme) : undefined}
                    isCloning={cloningThemeId === theme.id}
                    isSystem={true}
                    isViewer={isViewer}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Live Play Game Testing Modal */}
      {playingTheme && (
        <div
          className={`fixed inset-0 bg-slate-950/90 backdrop-blur-md z-50 flex items-center justify-center p-2 sm:p-4 ${
            isFullscreen ? 'p-0' : ''
          }`}
        >
          <div
            className={`bg-slate-900 border border-slate-800 flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 ${
              isFullscreen
                ? 'w-full h-full rounded-none border-none max-w-none max-h-none'
                : 'w-full max-w-5xl xl:max-w-6xl h-[88vh] max-h-[840px] rounded-3xl'
            }`}
          >
            {/* Modal Header */}
            <div className="bg-slate-950 border-b border-slate-800 px-4 py-3 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-1.5 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-400">
                  <Play className="w-4 h-4 fill-current" />
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-black text-slate-100 flex items-center gap-2">
                    <span>Testing: {playingTheme.name}</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-800 text-slate-400 rounded-full">
                      {game.name}
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400 hidden sm:block">
                    Interactive playable test mode. Catch items, test hazards, and preview layout.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setRestartKey((k) => k + 1)}
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                  title="Restart game"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Restart</span>
                </button>

                <button
                  onClick={handleToggleFullscreen}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors cursor-pointer"
                  title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                >
                  {isFullscreen ? (
                    <Minimize2 className="w-4 h-4" />
                  ) : (
                    <Maximize2 className="w-4 h-4" />
                  )}
                </button>

                <button
                  onClick={() => setPlayingTheme(null)}
                  className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-bold rounded-lg transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>

            {/* Game Canvas Container */}
            <div className="flex-1 relative bg-black overflow-hidden flex items-center justify-center">
              <GameShell
                key={`${playingTheme.id}-${restartKey}`}
                theme={playingTheme}
                gameType={game.game_type || game.slug || (game.name?.toLowerCase().includes('reaction') ? 'reaction-tap' : game.name?.toLowerCase().includes('memory') ? 'memory-match' : 'catch-brand')}
                organizationSlug={currentOrganization?.slug || 'preview'}
                isStudioPreview={true}
                isFullscreen={isFullscreen}
                onToggleFullscreen={handleToggleFullscreen}
              />
            </div>
          </div>
        </div>
      )}

      {/* Create Theme Dialog (Scoped to this game) */}
      <CreateThemeDialog
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={async (newThemeId) => {
          setShowCreateModal(false);
          await fetchThemes(game.id);
          showNotification('success', 'Theme created successfully!');
          onEditTheme(newThemeId);
        }}
        existingThemes={myGameThemes}
        onCreate={createTheme}
        onDuplicate={duplicateTheme}
        gameId={game.id}
        gameName={game.name}
        gameSlug={game.slug}
        gameType={game.game_type}
      />

      {/* Clone All Default Themes Confirmation Modal */}
      {showCloneAllModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-400">
                <Copy className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-100">Clone Default Templates</h3>
                <p className="text-xs text-slate-400">Copy all system themes for {game.name}</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              This will create custom copies of all <strong>{systemThemes.length} default themes</strong> into your organization workspace so you can freely edit graphics, scoring, and branding.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCloneAllModal(false)}
                disabled={isCloningAll}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmCloneAll}
                disabled={isCloningAll}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black rounded-xl transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCloningAll ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Cloning...</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Clone All Templates</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Theme Dialog */}
      {themeToRename && (
        <RenameThemeDialog
          isOpen={!!themeToRename}
          onClose={() => setThemeToRename(null)}
          theme={themeToRename}
          existingThemes={themes}
          onRename={handleRenameTheme}
        />
      )}
    </div>
  );
};
