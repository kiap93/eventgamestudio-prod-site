import React, { useState, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ThemeCard } from './ThemeCard';
import { CreateThemeDialog } from './CreateThemeDialog';
import { GameCatalogModal } from './GameCatalogModal';
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
} from 'lucide-react';

interface ThemeListProps {
  onEditTheme: (themeId: string) => void;
}

export const ThemeList: React.FC<ThemeListProps> = ({ onEditTheme }) => {
  const {
    themes,
    activeTheme,
    createTheme,
    duplicateTheme,
    deleteTheme,
    activateTheme,
    currentOrganization,
    fetchThemes,
  } = useAuth();

  const role = currentOrganization?.role || 'viewer';
  const isViewer = role === 'viewer';

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'draft'>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCatalogModal, setShowCatalogModal] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Filtered themes list
  const filteredThemes = useMemo(() => {
    return themes.filter((theme) => {
      const matchesSearch =
        searchQuery.trim() === '' ||
        theme.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (theme.description && theme.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
        theme.slug.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (theme.branding?.gameTitle && theme.branding.gameTitle.toLowerCase().includes(searchQuery.toLowerCase()));

      let matchesStatus = true;
      if (statusFilter === 'active') {
        matchesStatus = !!theme.is_active;
      } else if (statusFilter === 'draft') {
        matchesStatus = !theme.is_active;
      }

      return matchesSearch && matchesStatus;
    });
  }, [themes, searchQuery, statusFilter]);

  const showNotification = (type: 'success' | 'error', text: string) => {
    setActionMessage({ type, text });
    setTimeout(() => setActionMessage(null), 4000);
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

  const handleActivate = async (themeId: string) => {
    try {
      const updated = await activateTheme(themeId);
      showNotification('success', `"${updated.name}" is now the active live theme!`);
    } catch (err: any) {
      showNotification('error', err.message || 'Failed to activate theme');
    }
  };

  const handleDelete = async (themeId: string) => {
    if (themes.length <= 1) {
      showNotification('error', 'You cannot delete the only remaining theme.');
      return;
    }

    const target = themes.find((t) => t.id === themeId);
    const confirmed = window.confirm(`Are you sure you want to delete the theme "${target?.name || 'this theme'}"? This action cannot be undone.`);
    if (!confirmed) return;

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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-8">
      {/* 1. TOP HEADER SECTION */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-400">
              <Palette className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-100 tracking-tight">
                Theme Studio
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                Manage your game themes and customize them for different events.
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          <button
            type="button"
            onClick={() => setShowCatalogModal(true)}
            className="w-full sm:w-auto px-4 py-3 bg-slate-950 hover:bg-slate-800 border border-slate-700 active:scale-95 text-slate-200 font-bold text-xs sm:text-sm rounded-2xl transition-all flex items-center justify-center gap-2"
            title="Explore Multi-Game Catalog"
          >
            <Gamepad2 className="w-4 h-4 text-amber-400" />
            <span>Game Engines</span>
          </button>

          {/* Primary Create Button */}
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            disabled={isViewer}
            className="w-full sm:w-auto px-5 py-3 bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-black text-xs sm:text-sm rounded-2xl transition-all shadow-xl shadow-amber-500/10 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>+ Create New Theme</span>
          </button>
        </div>
      </div>

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

      {/* 2. SEARCH & FILTERS TOOLBAR */}
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

        {/* Status Filter Dropdown */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative w-full sm:w-48">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs font-semibold rounded-xl px-3.5 py-2 focus:outline-none focus:border-amber-500 cursor-pointer"
            >
              <option value="all">All Status ▼</option>
              <option value="active">Active Only</option>
              <option value="draft">Draft / Inactive</option>
            </select>
          </div>

          <div className="text-[11px] text-slate-500 font-medium px-2 hidden sm:inline whitespace-nowrap">
            {filteredThemes.length} {filteredThemes.length === 1 ? 'theme' : 'themes'}
          </div>
        </div>
      </div>

      {/* 3. THEME CARDS GRID */}
      {filteredThemes.length > 0 ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider">
              Your Themes ({filteredThemes.length})
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredThemes.map((theme) => (
              <ThemeCard
                key={theme.id}
                theme={theme}
                onEdit={onEditTheme}
                onDuplicate={handleDuplicate}
                onActivate={handleActivate}
                onDelete={handleDelete}
                isViewer={isViewer}
                isOnlyTheme={themes.length <= 1}
              />
            ))}
          </div>
        </div>
      ) : themes.length === 0 ? (
        /* Empty State: No themes at all */
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center max-w-lg mx-auto space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 mx-auto flex items-center justify-center">
            <FolderOpen className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-black text-slate-100">No themes yet</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Create your first game theme to customize the experience for your event.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            disabled={isViewer}
            className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-black text-xs rounded-xl transition-all inline-flex items-center gap-2 shadow-lg"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>+ Create New Theme</span>
          </button>
        </div>
      ) : (
        /* Empty State: Filter / Search returned 0 results */
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center max-w-lg mx-auto space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-slate-800 text-slate-400 mx-auto flex items-center justify-center">
            <Search className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-slate-200">No matching themes</h3>
            <p className="text-xs text-slate-400">
              No themes match your current search or filter criteria.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setStatusFilter('all');
            }}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition-all"
          >
            Reset Filters
          </button>
        </div>
      )}

      {/* CREATE THEME DIALOG */}
      <CreateThemeDialog
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={handleCreated}
        existingThemes={themes}
        activeTheme={activeTheme}
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
