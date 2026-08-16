import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ThemeCard } from './ThemeCard';
import { CreateThemeDialog } from './CreateThemeDialog';
import { GameCatalogModal } from './GameCatalogModal';
import { GameShell } from '../shell/GameShell';
import { GameTheme } from '../../themes';
import {
  Palette,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Layers,
  CheckCircle2,
  AlertCircle,
  FolderOpen,
  Filter,
  Gamepad2,
  Play,
  ArrowLeft,
  RotateCcw,
  Maximize2,
  Minimize2,
  Edit3,
} from 'lucide-react';

interface ThemeListProps {
  onEditTheme: (themeId: string) => void;
}

export const ThemeList: React.FC<ThemeListProps> = ({ onEditTheme }) => {
  const {
    themes,
    createTheme,
    duplicateTheme,
    deleteTheme,
    currentOrganization,
    activeGame,
    fetchThemes,
    fetchSystemThemes,
    cloneSystemTheme,
  } = useAuth();

  const role = currentOrganization?.role || 'viewer';
  const isViewer = role === 'viewer';

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'archived'>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCatalogModal, setShowCatalogModal] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // System Themes state (Developer Admin templates)
  const [systemThemes, setSystemThemes] = useState<GameTheme[]>([]);
  const [isLoadingSystem, setIsLoadingSystem] = useState<boolean>(false);

  // Load system themes for active game
  const loadSystemThemes = useCallback(async () => {
    if (!activeGame?.id) return;
    setIsLoadingSystem(true);
    try {
      const list = await fetchSystemThemes(activeGame.id);
      setSystemThemes(list);
    } catch (err) {
      console.error('Failed to load system themes:', err);
    } finally {
      setIsLoadingSystem(false);
    }
  }, [activeGame?.id, fetchSystemThemes]);

  useEffect(() => {
    loadSystemThemes();
  }, [loadSystemThemes]);

  // Live Play Game State
  const [playingTheme, setPlayingTheme] = useState<GameTheme | null>(null);
  const [restartKey, setRestartKey] = useState<number>(0);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

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

  // Filtered System Themes
  const filteredSystemThemes = useMemo(() => {
    return systemThemes.filter((theme) => {
      const matchesSearch =
        searchQuery.trim() === '' ||
        theme.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (theme.description && theme.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
        theme.slug.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (theme.branding?.gameTitle && theme.branding.gameTitle.toLowerCase().includes(searchQuery.toLowerCase()));

      let matchesStatus = true;
      if (statusFilter === 'draft') {
        matchesStatus = theme.status === 'draft';
      } else if (statusFilter === 'archived') {
        matchesStatus = theme.status === 'archived';
      }

      return matchesSearch && matchesStatus;
    });
  }, [systemThemes, searchQuery, statusFilter]);

  // Filtered Customer-Owned (MY THEMES)
  const filteredMyThemes = useMemo(() => {
    return themes.filter((theme) => {
      const matchesSearch =
        searchQuery.trim() === '' ||
        theme.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (theme.description && theme.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
        theme.slug.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (theme.branding?.gameTitle && theme.branding.gameTitle.toLowerCase().includes(searchQuery.toLowerCase()));

      let matchesStatus = true;
      if (statusFilter === 'draft') {
        matchesStatus = theme.status === 'draft';
      } else if (statusFilter === 'archived') {
        matchesStatus = theme.status === 'archived';
      }

      return matchesSearch && matchesStatus;
    });
  }, [themes, searchQuery, statusFilter]);

  const showNotification = (type: 'success' | 'error', text: string) => {
    setActionMessage({ type, text });
    setTimeout(() => setActionMessage(null), 4000);
  };

  const handleCloneSystemTheme = async (sysTheme: GameTheme) => {
    try {
      const cloned = await cloneSystemTheme(sysTheme.id, undefined, activeGame?.id);
      showNotification('success', `Theme "${cloned.name}" cloned into your organization!`);
      fetchThemes();
    } catch (err: any) {
      showNotification('error', err.message || 'Failed to clone system theme');
    }
  };

  const handleDuplicate = async (themeId: string) => {
    try {
      const source = themes.find((t) => t.id === themeId);
      const dup = await duplicateTheme(themeId, source ? `${source.name} (Copy)` : undefined);
      showNotification('success', `Theme duplicated successfully as "${dup.name}"`);
    } catch (err: any) {
      showNotification('error', err.message || 'Failed to duplicate theme');
    }
  };

  const handleDelete = async (themeId: string) => {
    if (themes.length <= 1) {
      const target = themes.find((t) => t.id === themeId);
      const confirmed = window.confirm(`Are you sure you want to delete "${target?.name || 'this theme'}"?`);
      if (!confirmed) return;
    } else {
      const target = themes.find((t) => t.id === themeId);
      const confirmed = window.confirm(`Are you sure you want to delete the theme "${target?.name || 'this theme'}"? This action cannot be undone.`);
      if (!confirmed) return;
    }

    try {
      await deleteTheme(themeId);
      showNotification('success', 'Theme deleted successfully');
    } catch (err: any) {
      showNotification('error', err.message || 'Failed to delete theme');
    }
  };

  const handleCreated = (newThemeId: string) => {
    setShowCreateModal(false);
    onEditTheme(newThemeId);
  };

  // ============================================================
  // FULLSCREEN / DEDICATED LIVE GAME PLAY MODE
  // ============================================================
  if (playingTheme) {
    return (
      <div
        className={
          isFullscreen
            ? 'fixed inset-0 z-50 w-screen h-screen bg-[#07130b] flex flex-col p-0 m-0 overflow-hidden'
            : 'max-w-[1400px] mx-auto px-2 sm:px-4 py-3 flex flex-col h-[calc(100vh-80px)] space-y-3'
        }
      >
        {/* Game Navigation Header (hidden when fullscreen) */}
        {!isFullscreen && (
          <header className="bg-slate-900 border border-slate-800 rounded-2xl px-4 py-3 shadow-xl flex items-center justify-between gap-4 shrink-0">
            {/* Left: Back Button & Theme Name */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setPlayingTheme(null)}
                className="flex items-center gap-2 px-3 py-1.5 bg-slate-950 hover:bg-slate-800 active:scale-95 text-slate-300 hover:text-white border border-slate-800 rounded-xl text-xs font-bold transition-all shadow-sm"
                title="Back to Theme Studio"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Themes</span>
              </button>

              <div className="hidden sm:block">
                <h2 className="text-sm font-black text-slate-100 flex items-center gap-2">
                  <span>{playingTheme.name}</span>
                  <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
                    Play Mode
                  </span>
                </h2>
              </div>
            </div>

            {/* Right: Actions: Edit Theme, Restart, Fullscreen */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onEditTheme(playingTheme.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 hover:text-white border border-slate-700 rounded-xl text-xs font-bold transition-all shadow-sm"
                title="Edit theme in Theme Studio"
              >
                <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">Edit Theme</span>
              </button>

              <button
                type="button"
                onClick={() => setRestartKey((prev) => prev + 1)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 hover:text-white border border-slate-700 rounded-xl text-xs font-bold transition-all shadow-sm"
                title="Restart game"
              >
                <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                <span>Restart</span>
              </button>

              <button
                type="button"
                onClick={handleToggleFullscreen}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 hover:text-white border border-slate-700 rounded-xl text-xs font-bold transition-all shadow-sm"
                title={isFullscreen ? 'Exit Fullscreen' : 'Toggle Fullscreen'}
              >
                {isFullscreen ? (
                  <Minimize2 className="w-3.5 h-3.5 text-slate-300" />
                ) : (
                  <Maximize2 className="w-3.5 h-3.5 text-slate-300" />
                )}
                <span className="hidden sm:inline">{isFullscreen ? 'Exit' : 'Fullscreen'}</span>
              </button>
            </div>
          </header>
        )}

        {/* Game Viewport Container */}
        <div
          className={
            isFullscreen
              ? 'flex-1 w-full h-full flex items-center justify-center p-0 m-0 overflow-hidden'
              : 'flex-1 w-full flex flex-col items-center justify-center bg-slate-950 border border-slate-800 rounded-3xl p-2 sm:p-4 md:p-6 shadow-2xl overflow-hidden min-h-[600px]'
          }
        >
          <GameShell
            key={`live-game-${playingTheme.id}-${restartKey}`}
            customTheme={playingTheme}
            gameType={activeGame?.game_type_id || activeGame?.slug || 'durian'}
            showCabinetFooter={false}
            className="w-full h-full"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Notification Banner */}
      {actionMessage && (
        <div
          className={`px-4 py-3 rounded-2xl text-xs flex items-center gap-2 transition-all animate-in fade-in ${
            actionMessage.type === 'success'
              ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
          }`}
        >
          {actionMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>{actionMessage.text}</span>
        </div>
      )}

      {/* SEARCH, FILTERS & ACTIONS TOOLBAR */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900/60 border border-slate-800/80 p-3 rounded-2xl">
        {/* Search Input */}
        <div className="relative w-full sm:max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search themes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500 placeholder:text-slate-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs"
            >
              Clear
            </button>
          )}
        </div>

        {/* Status Filter Dropdown & Action Buttons */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
          <div className="relative w-full sm:w-40">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs font-semibold rounded-xl px-3.5 py-2 focus:outline-none focus:border-amber-500 cursor-pointer"
            >
              <option value="all">All Status ▼</option>
              <option value="draft">Drafts Only</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          <button
            type="button"
            onClick={() => setShowCatalogModal(true)}
            className="px-3.5 py-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-200 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 shrink-0"
            title="Explore Multi-Game Catalog"
          >
            <Gamepad2 className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden md:inline">Engines</span>
          </button>

          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            disabled={isViewer}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 shrink-0 disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5 stroke-[3]" />
            <span>Create Theme</span>
          </button>
        </div>
      </div>

      {/* 3. SYSTEM / DEFAULT THEMES SECTION */}
      <div className="space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-sm">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-100 tracking-wider">
                SYSTEM / DEFAULT THEMES
              </h2>
              <p className="text-[11px] text-slate-400">
                Official Developer Admin system templates for {activeGame?.name || 'this game'}. Preview or clone into your organization.
              </p>
            </div>
          </div>
          <span className="text-xs font-bold px-3 py-1 rounded-full bg-indigo-950/80 text-indigo-300 border border-indigo-500/40 shadow-sm">
            {filteredSystemThemes.length} available
          </span>
        </div>

        {filteredSystemThemes.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredSystemThemes.map((sysTheme) => (
              <ThemeCard
                key={`sys-${sysTheme.id}`}
                theme={sysTheme}
                isSystem={true}
                onPlay={(selectedTheme) => setPlayingTheme(selectedTheme)}
                onClone={handleCloneSystemTheme}
                isViewer={isViewer}
              />
            ))}
          </div>
        ) : (
          <div className="bg-slate-900/40 border border-dashed border-slate-800 rounded-2xl p-6 text-center text-slate-500 text-xs">
            {isLoadingSystem
              ? 'Loading system themes...'
              : searchQuery
              ? 'No system themes match your search query.'
              : 'No active system themes available for this game.'}
          </div>
        )}
      </div>

      {/* 4. MY THEMES SECTION */}
      <div className="space-y-4 pt-6">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-sm">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-100 tracking-wider">
                MY THEMES
              </h2>
              <p className="text-[11px] text-slate-400">
                Customer-owned themes customized for your events and campaigns.
              </p>
            </div>
          </div>
          <span className="text-xs font-bold px-3 py-1 rounded-full bg-amber-950/80 text-amber-300 border border-amber-500/40 shadow-sm">
            {filteredMyThemes.length} themes
          </span>
        </div>

        {filteredMyThemes.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredMyThemes.map((theme) => (
              <ThemeCard
                key={theme.id}
                theme={theme}
                isSystem={false}
                onPlay={(selectedTheme) => setPlayingTheme(selectedTheme)}
                onEdit={onEditTheme}
                onDuplicate={handleDuplicate}
                onDelete={handleDelete}
                isViewer={isViewer}
                isOnlyTheme={themes.length <= 1}
              />
            ))}
          </div>
        ) : themes.length === 0 ? (
          /* Empty State: Customer has no themes yet */
          <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-10 text-center max-w-lg mx-auto space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 mx-auto flex items-center justify-center">
              <FolderOpen className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-black text-slate-100">No organization themes yet</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Clone a System Theme from above or create a new custom theme from scratch.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              disabled={isViewer}
              className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-black text-xs rounded-xl transition-all inline-flex items-center gap-2 shadow-lg disabled:opacity-50"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>+ Create New Theme</span>
            </button>
          </div>
        ) : (
          /* Empty State: Search or filter returned 0 results for MY THEMES */
          <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-8 text-center max-w-lg mx-auto space-y-3">
            <div className="w-10 h-10 rounded-xl bg-slate-800 text-slate-400 mx-auto flex items-center justify-center">
              <Search className="w-5 h-5" />
            </div>
            <div className="space-y-0.5">
              <h3 className="text-xs font-bold text-slate-200">No matching customer themes</h3>
              <p className="text-[11px] text-slate-400">
                No organization themes match your current search or filter criteria.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('all');
              }}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition-all"
            >
              Reset Filters
            </button>
          </div>
        )}
      </div>

      {/* CREATE THEME DIALOG */}
      <CreateThemeDialog
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={handleCreated}
        existingThemes={themes}
        onCreate={createTheme}
        onDuplicate={duplicateTheme}
      />

      {/* MULTI-GAME PLATFORM CATALOG MODAL */}
      <GameCatalogModal
        isOpen={showCatalogModal}
        onClose={() => setShowCatalogModal(false)}
        selectedGameType="catch-brand"
      />
    </div>
  );
};
