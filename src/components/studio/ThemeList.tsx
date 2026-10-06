import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ThemeCard } from './ThemeCard';
import { CreateThemeDialog } from './CreateThemeDialog';
import { RenameThemeDialog } from './RenameThemeDialog';
import { GameCatalogModal } from './GameCatalogModal';
import { GameShell } from '../shell/GameShell';
import { GameTheme } from '../../themes';
import { useLocalization } from '../../context/LocalizationContext';
import {
  Palette,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Layers,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  FolderOpen,
  Filter,
  Gamepad2,
  Play,
  ArrowLeft,
  RotateCcw,
  Maximize2,
  Minimize2,
  Edit3,
  Copy,
  Loader2,
  RefreshCw,
} from 'lucide-react';

interface ThemeListProps {
  onEditTheme: (themeId: string) => void;
}

export const ThemeList: React.FC<ThemeListProps> = ({ onEditTheme }) => {
  const { t } = useLocalization();
  const {
    themes,
    createTheme,
    duplicateTheme,
    renameTheme,
    deleteTheme,
    currentOrganization,
    activeGame,
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

  // System Themes state (Developer Admin templates)
  const [systemThemes, setSystemThemes] = useState<GameTheme[]>([]);
  const [isLoadingSystem, setIsLoadingSystem] = useState<boolean>(false);
  const [systemThemeError, setSystemThemeError] = useState<string | null>(null);

  // Load system themes for active game
  const loadSystemThemes = useCallback(async () => {
    if (!activeGame?.id) return;
    setIsLoadingSystem(true);
    setSystemThemeError(null);
    try {
      const list = await fetchSystemThemes(activeGame.id);
      setSystemThemes(list);
      setSystemThemeError(null);
    } catch (err: any) {
      console.error('Failed to load system themes:', err);
      setSystemThemeError(err.message || 'Failed to load system themes');
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
    if (cloningThemeRef.current || isCloningAll) return;
    cloningThemeRef.current = sysTheme.id;
    setCloningThemeId(sysTheme.id);

    try {
      const cloned = await cloneSystemTheme(sysTheme.id, undefined, activeGame?.id);
      showNotification('success', `Theme "${cloned.name}" cloned to My Themes!`);
      await fetchThemes();
      setActiveTab('my-themes');
    } catch (err: any) {
      showNotification('error', err.message || 'Failed to clone system theme');
    } finally {
      cloningThemeRef.current = null;
      setCloningThemeId(null);
    }
  };

  const handleConfirmCloneAll = async () => {
    if (!activeGame?.id) {
      showNotification('error', 'No active game selected');
      return;
    }
    if (isCloningAll || isCloningAllRef.current) return;
    isCloningAllRef.current = true;
    setIsCloningAll(true);

    try {
      const clonedList = await cloneAllSystemThemes(activeGame.id);
      setShowCloneAllModal(false);
      showNotification(
        'success',
        `Successfully cloned ${clonedList.length} default themes into My Themes!`
      );
      await fetchThemes();
      setActiveTab('my-themes');
    } catch (err: any) {
      showNotification('error', err.message || 'Failed to clone default themes');
    } finally {
      isCloningAllRef.current = false;
      setIsCloningAll(false);
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

  const handleRename = async (targetThemeId: string, newName: string) => {
    try {
      await renameTheme(targetThemeId, newName);
      showNotification('success', `Theme renamed to "${newName}" successfully`);
      await fetchThemes();
    } catch (err: any) {
      showNotification('error', err.message || 'Failed to rename theme');
      throw err;
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
    const isSystemPlaying = Boolean(
      playingTheme.is_system || (playingTheme as any).ownership_type === 'system' || !(playingTheme as any).organization_id
    );

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
                title={t('studio.returnToThemes')}
              >
                <ArrowLeft className="w-4 h-4" />
                <span>{t('studio.returnToThemes')}</span>
              </button>

              <div className="hidden sm:block">
                <h2 className="text-sm font-black text-slate-100 flex items-center gap-2">
                  <span>{playingTheme.name}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                    isSystemPlaying
                      ? 'text-indigo-300 bg-indigo-500/10 border border-indigo-500/30'
                      : 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/30'
                  }`}>
                    {isSystemPlaying ? t('studio.systemTheme') : t('event.testMode')}
                  </span>
                </h2>
              </div>
            </div>

            {/* Right: Actions: Edit Theme / Clone, Restart, Fullscreen */}
            <div className="flex items-center gap-2">
              {!isSystemPlaying ? (
                <button
                  type="button"
                  onClick={() => onEditTheme(playingTheme.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 hover:text-white border border-slate-700 rounded-xl text-xs font-bold transition-all shadow-sm"
                  title={t('studio.editTheme')}
                >
                  <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden sm:inline">{t('studio.editTheme')}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    handleCloneSystemTheme(playingTheme);
                    setPlayingTheme(null);
                  }}
                  disabled={isViewer}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-black rounded-xl text-xs transition-all shadow-sm disabled:opacity-50 cursor-pointer"
                  title={t('studio.cloneTheme')}
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{t('studio.cloneTheme')}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setRestartKey((prev) => prev + 1)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 hover:text-white border border-slate-700 rounded-xl text-xs font-bold transition-all shadow-sm"
                title={t('common.restart')}
              >
                <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                <span>{t('common.restart')}</span>
              </button>

              <button
                type="button"
                onClick={handleToggleFullscreen}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 hover:text-white border border-slate-700 rounded-xl text-xs font-bold transition-all shadow-sm"
                title={isFullscreen ? t('common.exitFullscreen') : t('common.fullscreen')}
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
              : 'flex-1 w-full flex flex-col items-center justify-center bg-slate-950 border border-slate-800 rounded-3xl p-2 sm:p-4 md:p-6 shadow-2xl overflow-hidden min-h-[580px] h-[calc(100vh-140px)]'
          }
        >
          <GameShell
            key={`live-game-${playingTheme.id}-${restartKey}`}
            customTheme={playingTheme}
            gameType={activeGame?.game_type_id || activeGame?.slug || 'catch-brand'}
            showCabinetFooter={false}
            className="w-full h-full"
            isFullscreen={isFullscreen}
            onToggleFullscreen={handleToggleFullscreen}
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

      {/* TWO MAIN SEPARATED TABS: [ My Themes ] [ System Themes ] */}
      <div className="flex items-center justify-between border-b border-slate-800 gap-2 overflow-x-auto">
        <div className="flex items-center gap-2 shrink-0">
          <button
            id="tab-my-themes"
            type="button"
            onClick={() => setActiveTab('my-themes')}
            className={`flex items-center gap-2.5 px-6 py-3.5 text-sm font-black border-b-2 transition-all cursor-pointer ${
              activeTab === 'my-themes'
                ? 'border-amber-400 text-amber-400 bg-amber-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>{t('studio.myThemes')}</span>
            <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${
              activeTab === 'my-themes'
                ? 'bg-amber-400/20 text-amber-300'
                : 'bg-slate-800 text-slate-400'
            }`}>
              {themes.length}
            </span>
          </button>

          <button
            id="tab-system-themes"
            type="button"
            onClick={() => setActiveTab('system-themes')}
            className={`flex items-center gap-2.5 px-6 py-3.5 text-sm font-black border-b-2 transition-all cursor-pointer ${
              activeTab === 'system-themes'
                ? 'border-indigo-400 text-indigo-400 bg-indigo-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>{t('studio.systemThemes')}</span>
            <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${
              activeTab === 'system-themes'
                ? 'bg-indigo-400/20 text-indigo-300'
                : 'bg-slate-800 text-slate-400'
            }`}>
              {systemThemes.length}
            </span>
          </button>
        </div>

        {/* Global Action: + Create Theme Button */}
        <div className="flex items-center gap-2 shrink-0 py-2">
          <button
            id="btn-create-theme-header"
            type="button"
            onClick={() => setShowCreateModal(true)}
            disabled={isViewer}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-black text-xs rounded-xl transition-all shadow-md flex items-center gap-1.5 shrink-0 disabled:opacity-50 cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>+ {t('studio.createTheme')}</span>
          </button>
        </div>
      </div>

      {/* SEARCH, FILTERS & ACTIONS TOOLBAR */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900/60 border border-slate-800/80 p-3 rounded-2xl">
        {/* Search Input */}
        <div className="relative w-full sm:max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            id="input-search-themes"
            type="text"
            placeholder={activeTab === 'my-themes' ? 'Search My Themes...' : 'Search System Themes...'}
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
              id="select-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs font-semibold rounded-xl px-3.5 py-2 focus:outline-none focus:border-amber-500 cursor-pointer"
            >
              <option value="all">{t('common.allStatus')} ▼</option>
              <option value="draft">{t('common.draft')}</option>
              <option value="archived">{t('common.archived')}</option>
            </select>
          </div>

          <button
            id="btn-engine-catalog"
            type="button"
            onClick={() => setShowCatalogModal(true)}
            className="px-3.5 py-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-200 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 shrink-0"
            title={t('game.gameEngines')}
          >
            <Gamepad2 className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden md:inline">{t('game.gameEngines')}</span>
          </button>
        </div>
      </div>

      {/* ============================================================ */}
      {/* TAB 1: MY THEMES VIEW */}
      {/* ============================================================ */}
      {activeTab === 'my-themes' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
            <div>
              <h2 className="text-sm font-black text-slate-100 tracking-wider flex items-center gap-2">
                <span>{t('studio.myThemesTab', undefined, 'MY THEMES')}</span>
                <span className="text-[11px] font-normal text-slate-400">
                  (Organization Custom Themes)
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Themes belonging exclusively to your organization for events and marketing campaigns.
              </p>
            </div>
            <span className="text-xs font-bold px-3 py-1 rounded-full bg-amber-950/80 text-amber-300 border border-amber-500/40 shadow-sm">
              {filteredMyThemes.length} {filteredMyThemes.length === 1 ? 'theme' : 'themes'}
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
                  onRename={(target) => setThemeToRename(target)}
                  onDuplicate={handleDuplicate}
                  onDelete={handleDelete}
                  isViewer={isViewer}
                  isOnlyTheme={themes.length <= 1}
                />
              ))}
            </div>
          ) : themes.length === 0 ? (
            /* EXACT REQUIRED EMPTY STATE: No custom themes yet */
            <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-12 text-center max-w-lg mx-auto space-y-6 my-4 shadow-xl">
              <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 mx-auto flex items-center justify-center shadow-inner">
                <FolderOpen className="w-8 h-8" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-black text-slate-100">{t('studio.noThemesYet')}</h3>
                <p className="text-xs text-slate-400 leading-relaxed max-w-sm mx-auto">
                  Create your first custom theme from scratch,<br />
                  or start with one of our System Themes.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                <button
                  id="btn-browse-system-themes"
                  type="button"
                  onClick={() => setActiveTab('system-themes')}
                  className="w-full sm:w-auto px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-black text-xs rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>{t('studio.browseSystemThemes')}</span>
                </button>
                <button
                  id="btn-create-theme-empty"
                  type="button"
                  onClick={() => setShowCreateModal(true)}
                  disabled={isViewer}
                  className="w-full sm:w-auto px-5 py-2.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 hover:text-white font-bold text-xs rounded-xl transition-all border border-slate-700 flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ {t('studio.createTheme')}</span>
                </button>
              </div>
            </div>
          ) : (
            /* Search / filter zero results */
            <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-8 text-center max-w-lg mx-auto space-y-3 my-4">
              <div className="w-10 h-10 rounded-xl bg-slate-800 text-slate-400 mx-auto flex items-center justify-center">
                <Search className="w-5 h-5" />
              </div>
              <div className="space-y-0.5">
                <h3 className="text-xs font-bold text-slate-200">{t('studio.noMatchingThemes')}</h3>
                <p className="text-[11px] text-slate-400">
                  No themes in My Themes match your current search or filter criteria.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('all');
                }}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition-all cursor-pointer"
              >
                Reset Filters
              </button>
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* TAB 2: SYSTEM THEMES VIEW */}
      {/* ============================================================ */}
      {activeTab === 'system-themes' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-800/80">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-sm shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-black text-slate-100 tracking-wider">
                  SYSTEM THEMES
                </h2>
                <p className="text-xs text-slate-400">
                  EventGameStudio-provided system templates. Preview or clone any template into your organization.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-indigo-950/80 text-indigo-300 border border-indigo-500/40 shadow-sm">
                {filteredSystemThemes.length} available
              </span>
              {filteredSystemThemes.length > 0 && (
                <button
                  id="btn-clone-all-themes"
                  type="button"
                  onClick={() => setShowCloneAllModal(true)}
                  disabled={isViewer || isCloningAll}
                  className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-bold text-xs rounded-xl transition-all shadow-md flex items-center gap-1.5 shrink-0 disabled:opacity-50 cursor-pointer"
                  title={t('studio.cloneAllDefaultThemes')}
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{t('studio.cloneAllDefaultThemes')}</span>
                </button>
              )}
            </div>
          </div>

          {/* Informative notice explaining system templates are read-only */}
          <div className="bg-indigo-950/20 border border-indigo-500/20 rounded-2xl px-4 py-3 text-xs text-indigo-200/90 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
              <span>
                {t('studio.systemThemesReadOnlyNotice')}
              </span>
            </div>
          </div>

          {systemThemeError ? (
            <div className="bg-rose-950/25 border border-rose-800/50 rounded-2xl p-6 text-center space-y-3">
              <div className="flex items-center justify-center gap-2 text-rose-400 text-sm font-semibold">
                <AlertTriangle className="w-4 h-4" />
                <span>{t('studio.unableToLoadThemes')}</span>
              </div>
              <p className="text-xs text-rose-300/70 max-w-md mx-auto">{systemThemeError}</p>
              <button
                type="button"
                onClick={loadSystemThemes}
                className="px-4 py-1.5 bg-rose-900/80 hover:bg-rose-800 text-rose-200 text-xs font-bold rounded-xl transition-colors inline-flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{t('common.retry')}</span>
              </button>
            </div>
          ) : filteredSystemThemes.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredSystemThemes.map((sysTheme) => (
                <ThemeCard
                  key={`sys-${sysTheme.id}`}
                  theme={sysTheme}
                  isSystem={true}
                  onPlay={(selectedTheme) => setPlayingTheme(selectedTheme)}
                  onClone={handleCloneSystemTheme}
                  isCloning={cloningThemeId === sysTheme.id}
                  isViewer={isViewer}
                />
              ))}
            </div>
          ) : (
            <div className="bg-slate-900/40 border border-dashed border-slate-800 rounded-2xl p-6 text-center text-slate-500 text-xs space-y-2">
              {isLoadingSystem ? (
                <div className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                  <span>{t('studio.loadingSystemThemes')}</span>
                </div>
              ) : searchQuery ? (
                'No system themes match your search query.'
              ) : (
                <div className="space-y-2">
                  <p>{t('studio.noActiveSystemThemes')}</p>
                  <button
                    type="button"
                    onClick={loadSystemThemes}
                    className="text-xs text-indigo-400 hover:text-indigo-300 underline inline-flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>{t('common.refresh')}</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* CREATE THEME DIALOG */}
      <CreateThemeDialog
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={handleCreated}
        existingThemes={themes}
        onCreate={createTheme}
        onDuplicate={duplicateTheme}
        gameId={activeGame?.id}
        gameName={activeGame?.name}
        gameSlug={activeGame?.slug}
        gameType={(activeGame as any)?.game_type}
      />

      {/* MULTI-GAME PLATFORM CATALOG MODAL */}
      <GameCatalogModal
        isOpen={showCatalogModal}
        onClose={() => setShowCatalogModal(false)}
        selectedGameType="catch-brand"
      />

      {/* CLONE ALL DEFAULT THEMES CONFIRMATION DIALOG */}
      {showCloneAllModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
                <Copy className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-black text-slate-100">
                  Clone All Default Themes?
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  This will create a new copy of every active default theme for your organization.
                </p>
                <p className="text-xs font-bold text-indigo-400 pt-1">
                  Duplicate copies are allowed.
                </p>
              </div>
            </div>

            <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-3 text-xs text-slate-300 space-y-1.5">
              <div className="font-bold text-slate-400 flex items-center justify-between">
                <span>{t('studio.selectedGame')}</span>
                <span className="text-slate-200">{activeGame?.name || 'Current Game'}</span>
              </div>
              <div className="font-bold text-slate-400 flex items-center justify-between">
                <span>{t('studio.themesToClone')}</span>
                <span className="text-indigo-400 font-black">{filteredSystemThemes.length} active themes</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowCloneAllModal(false)}
                disabled={isCloningAll}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition-all disabled:opacity-50"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleConfirmCloneAll}
                disabled={isCloningAll || isViewer}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-black text-xs rounded-xl transition-all shadow-lg shadow-indigo-600/20 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCloningAll ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{t('studio.cloningAll')}</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>{t('studio.cloneAll')}</span>
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
          onRename={handleRename}
        />
      )}
    </div>
  );
};
