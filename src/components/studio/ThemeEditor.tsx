import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { GameTheme } from '../../themes';
import { LiveThemePreview } from './LiveThemePreview';
import { VisualsTab } from './VisualsTab';
import { ItemsTab } from './ItemsTab';
import { GameplayTab } from './GameplayTab';
import { AudioTab } from './AudioTab';
import { BrandingTab } from './BrandingTab';
import {
  ArrowLeft,
  Palette,
  Layers,
  Sparkles,
  Zap,
  Volume2,
  Save,
  Check,
  RotateCcw,
  CheckCircle2,
  CircleDot,
  AlertCircle,
  Play,
  Gamepad2,
} from 'lucide-react';

interface ThemeEditorProps {
  themeId: string;
  onBack: () => void;
}

export const ThemeEditor: React.FC<ThemeEditorProps> = ({ themeId, onBack }) => {
  const {
    themes,
    updateTheme,
    activateTheme,
    uploadAsset,
    currentOrganization,
    activeGame,
    fetchThemes,
  } = useAuth();

  const role = currentOrganization?.role || 'viewer';
  const isViewer = role === 'viewer';

  const [activeTab, setActiveTab] = useState<'visuals' | 'items' | 'gameplay' | 'audio' | 'branding'>('visuals');

  // Draft theme currently being edited
  const [draftTheme, setDraftTheme] = useState<GameTheme | null>(null);

  // Snapshot of saved state for diff / reset
  const [savedThemeSnapshot, setSavedThemeSnapshot] = useState<GameTheme | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [uploadingAsset, setUploadingAsset] = useState<string | null>(null);

  // Unsaved changes confirmation dialog
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);

  // Initialize or fetch theme
  useEffect(() => {
    const found = themes.find((t) => t.id === themeId);
    if (found) {
      const cloned = JSON.parse(JSON.stringify(found));
      setDraftTheme(cloned);
      setSavedThemeSnapshot(cloned);
    } else {
      // If themes list is empty or not yet loaded, fetch
      fetchThemes().then((list) => {
        const t = list.find((item) => item.id === themeId);
        if (t) {
          const cloned = JSON.parse(JSON.stringify(t));
          setDraftTheme(cloned);
          setSavedThemeSnapshot(cloned);
        }
      });
    }
  }, [themeId, themes]);

  // Determine if there are unsaved changes
  const hasUnsavedChanges = useMemo(() => {
    if (!draftTheme || !savedThemeSnapshot) return false;
    return JSON.stringify(draftTheme) !== JSON.stringify(savedThemeSnapshot);
  }, [draftTheme, savedThemeSnapshot]);

  // Handle Back to Themes with unsaved changes guard
  const handleBackClick = () => {
    if (hasUnsavedChanges) {
      setShowUnsavedModal(true);
    } else {
      onBack();
    }
  };

  // Reset Draft
  const handleResetDraft = () => {
    if (!savedThemeSnapshot) return;
    setDraftTheme(JSON.parse(JSON.stringify(savedThemeSnapshot)));
    setErrorMessage(null);
  };

  // Navigate to live game URL /:organization-slug/:game-slug
  const handlePlayLiveGame = () => {
    const orgSlug = currentOrganization?.slug || 'organization';
    const gameSlug = activeGame?.slug || 'durian';
    const publicUrl = `/${orgSlug}/${gameSlug}`;
    window.history.pushState(null, '', publicUrl);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  // Save Theme to Supabase
  const handleSaveTheme = async () => {
    if (!draftTheme || isViewer) return;
    setSaving(true);
    setErrorMessage(null);
    setSaveSuccess(false);

    try {
      const updated = await updateTheme(draftTheme.id, draftTheme);
      const cloned = JSON.parse(JSON.stringify(updated));
      setDraftTheme(cloned);
      setSavedThemeSnapshot(cloned);
      setSaveSuccess(true);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save theme');
    } finally {
      setSaving(false);
    }
  };

  // Activate Theme
  const handleActivate = async () => {
    if (!draftTheme || isViewer) return;
    try {
      setSaving(true);
      const updated = await activateTheme(draftTheme.id);
      const cloned = JSON.parse(JSON.stringify(updated));
      setDraftTheme(cloned);
      setSavedThemeSnapshot(cloned);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to activate theme');
    } finally {
      setSaving(false);
    }
  };

  // Asset upload handler
  const handleUploadAssetFile = async (file: File, fieldKey: string): Promise<string> => {
    try {
      setUploadingAsset(fieldKey);
      const url = await uploadAsset(file);
      return url;
    } finally {
      setUploadingAsset(null);
    }
  };

  if (!draftTheme) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 text-center text-slate-400 space-y-4">
        <div className="w-10 h-10 border-3 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="font-bold text-xs tracking-wider uppercase">Loading Theme Configuration...</p>
        <button
          onClick={onBack}
          className="text-xs text-amber-400 hover:underline inline-flex items-center gap-1 mt-2"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Return to Themes</span>
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-4 space-y-6">
      {/* 1. TOP BAR: BACK BUTTON, THEME HEADER & ACTIONS */}
      <header className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl flex flex-col xl:flex-row items-start xl:items-center justify-between gap-5">
        {/* Left: Back Button + Theme Title & Status */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full xl:w-auto">
          {/* Back to Themes Button */}
          <button
            type="button"
            onClick={handleBackClick}
            className="flex items-center gap-2 px-3.5 py-2 bg-slate-950 hover:bg-slate-800 active:scale-95 text-slate-300 hover:text-white border border-slate-800 rounded-2xl text-xs font-bold transition-all shadow-sm shrink-0"
          >
            <ArrowLeft className="w-4 h-4 text-amber-400" />
            <span>Back to Themes</span>
          </button>

          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-black text-slate-100 tracking-tight">
                {draftTheme.name}
              </h1>

              {/* Active / Draft Live Status */}
              {draftTheme.is_active ? (
                <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-xs font-black flex items-center gap-1.5 shadow-sm">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>● Active</span>
                </span>
              ) : (
                <span className="px-3 py-1 rounded-full bg-slate-800 text-slate-400 border border-slate-700 text-xs font-semibold flex items-center gap-1.5">
                  <CircleDot className="w-3.5 h-3.5 text-slate-500" />
                  <span>○ Draft / Inactive</span>
                </span>
              )}

              {/* Unsaved Changes Indicator */}
              {hasUnsavedChanges ? (
                <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[11px] font-bold flex items-center gap-1.5 animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  Unsaved changes
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full bg-slate-800/80 text-slate-400 border border-slate-700/80 text-[11px] font-semibold flex items-center gap-1">
                  <Check className="w-3 h-3 text-emerald-400" />
                  All changes saved
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">
              Customize visuals, drop collectibles, physics tuning, and audio for this theme.
            </p>
          </div>
        </div>

        {/* Right: Actions: Reset, Set as Active, Test Theme, Save Theme */}
        <div className="flex flex-wrap items-center gap-2.5 w-full xl:w-auto justify-end">
          {/* Activate Button (if draft is not active) */}
          {!draftTheme.is_active && (
            <button
              type="button"
              onClick={handleActivate}
              disabled={saving || isViewer}
              className="px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-slate-950 font-black text-xs rounded-xl transition-all flex items-center gap-1.5 shadow-md disabled:opacity-50"
              title="Set this theme as the active live game theme"
            >
              <Check className="w-3.5 h-3.5 stroke-[3]" />
              <span>Set as Active</span>
            </button>
          )}

          {/* Reset / Undo Draft Button */}
          {hasUnsavedChanges && (
            <button
              type="button"
              onClick={handleResetDraft}
              disabled={saving}
              className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 border border-slate-700"
              title="Discard unsaved edits and restore last saved state"
            >
              <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
              <span>Reset</span>
            </button>
          )}

          {/* Test Theme Button (Scrolls to Live Game Simulation or quick test) */}
          <button
            type="button"
            onClick={() => {
              const previewEl = document.getElementById('live-theme-preview-container');
              if (previewEl) {
                previewEl.scrollIntoView({ behavior: 'smooth' });
              }
            }}
            className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-amber-400 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 border border-slate-700"
          >
            <Gamepad2 className="w-4 h-4" />
            <span>Test Theme</span>
          </button>

          {/* PRIMARY ACTION: SAVE THEME */}
          <button
            type="button"
            onClick={handleSaveTheme}
            disabled={saving || isViewer || !hasUnsavedChanges}
            className={`px-5 py-2.5 rounded-xl font-black text-xs shadow-xl transition-all flex items-center gap-2 ${
              hasUnsavedChanges
                ? 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 active:scale-95 ring-2 ring-amber-400/30'
                : 'bg-slate-800 text-slate-400 border border-slate-700 cursor-default'
            }`}
          >
            {saving ? (
              <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
            ) : saveSuccess ? (
              <Check className="w-4 h-4 text-emerald-400" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            <span>{saving ? 'Saving...' : saveSuccess ? 'Saved!' : 'Save Theme'}</span>
          </button>
        </div>
      </header>

      {/* Error / Success Notifications */}
      {saveSuccess && (
        <div className="bg-emerald-950/80 border border-emerald-500/40 text-emerald-200 p-4 sm:p-5 rounded-3xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl backdrop-blur-sm animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-center gap-3.5">
            <div className="p-2.5 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shrink-0">
              <Check className="w-5 h-5 stroke-[3]" />
            </div>
            <div>
              <h4 className="text-sm font-black text-slate-100 flex items-center gap-2">
                <span>Theme saved successfully</span>
              </h4>
              <p className="text-xs text-emerald-300/80 font-medium mt-0.5">
                {draftTheme.is_active
                  ? 'Your saved changes are now active in the game.'
                  : 'Theme saved to database. Activate it when you are ready to publish.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end shrink-0">
            <button
              type="button"
              onClick={handlePlayLiveGame}
              className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs rounded-xl shadow-lg transition-all flex items-center gap-2 active:scale-95"
            >
              <Gamepad2 className="w-4 h-4" />
              <span>Play Live Game</span>
            </button>

            <button
              type="button"
              onClick={handleBackClick}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl border border-slate-700 transition-all flex items-center gap-1.5 active:scale-95"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-amber-400" />
              <span>Back to Themes</span>
            </button>
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 px-4 py-3 rounded-2xl text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* 2. TWO-COLUMN RESPONSIVE LAYOUT (Editor on Left, Live Simulation on Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT / MAIN COLUMN: 5 TABS & EDITORS (7 cols on lg) */}
        <main className="lg:col-span-7 xl:col-span-7 space-y-5">
          {/* Navigation Tab Pills */}
          <nav className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 p-1.5 rounded-2xl overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveTab('visuals')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                activeTab === 'visuals'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>1. Visuals</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('items')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                activeTab === 'items'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>2. Items</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('gameplay')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                activeTab === 'gameplay'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>3. Gameplay</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('audio')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                activeTab === 'audio'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>4. Audio</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('branding')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                activeTab === 'branding'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Palette className="w-3.5 h-3.5" />
              <span>5. Branding</span>
            </button>
          </nav>

          {/* ACTIVE TAB CONTENT */}
          <div className="space-y-4">
            {activeTab === 'visuals' && (
              <VisualsTab
                theme={draftTheme}
                onChange={setDraftTheme}
                onUploadAsset={handleUploadAssetFile}
                uploadingAsset={uploadingAsset}
              />
            )}

            {activeTab === 'items' && (
              <ItemsTab
                theme={draftTheme}
                onChange={setDraftTheme}
                onUploadAsset={handleUploadAssetFile}
                uploadingAsset={uploadingAsset}
              />
            )}

            {activeTab === 'gameplay' && (
              <GameplayTab
                theme={draftTheme}
                onChange={setDraftTheme}
              />
            )}

            {activeTab === 'audio' && (
              <AudioTab
                theme={draftTheme}
                onChange={setDraftTheme}
              />
            )}

            {activeTab === 'branding' && (
              <BrandingTab
                theme={draftTheme}
                onChange={setDraftTheme}
                onUploadAsset={handleUploadAssetFile}
                uploadingAsset={uploadingAsset}
              />
            )}
          </div>
        </main>

        {/* RIGHT COLUMN: STICKY LIVE GAME PREVIEW (5 cols on lg) */}
        <aside
          id="live-theme-preview-container"
          className="lg:col-span-5 xl:col-span-5 space-y-4 lg:sticky lg:top-20"
        >
          <LiveThemePreview theme={draftTheme} />
        </aside>
      </div>

      {/* UNSAVED CHANGES WARNING MODAL */}
      {showUnsavedModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center">
              <AlertCircle className="w-5 h-5" />
            </div>

            <div className="space-y-1">
              <h3 className="text-base font-black text-slate-100">You have unsaved changes</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                If you leave now, your recent edits to "{draftTheme.name}" will be discarded. Do you want to stay and save or leave without saving?
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800/80">
              <button
                type="button"
                onClick={() => setShowUnsavedModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 text-xs font-bold rounded-xl transition-all"
              >
                Stay
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowUnsavedModal(false);
                  onBack();
                }}
                className="px-4 py-2 bg-rose-500/20 hover:bg-rose-500/30 active:scale-95 text-rose-300 border border-rose-500/40 text-xs font-bold rounded-xl transition-all"
              >
                Leave Without Saving
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
