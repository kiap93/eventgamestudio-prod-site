import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { GameTheme, getThemeGameType, isMemoryMatchTheme, isReactionTheme } from '../../themes';
import { deepEqual } from '../../lib/deepEqual';
import { LiveThemePreview } from './LiveThemePreview';
import { VisualsTab } from './VisualsTab';
import { ItemsTab } from './ItemsTab';
import { GameplayTab } from './GameplayTab';
import { AudioTab } from './AudioTab';
import { BrandingTab } from './BrandingTab';
import { LayoutTab } from './LayoutTab';
import { ScreensTab } from './ScreensTab';
import { GameShell } from '../shell/GameShell';
import { LayoutElementKey, GameLayoutConfig, getDefaultUILayout } from '../../themes/layout';
import { navigateTo } from '../../hooks/useRouteContext';
import { RenameThemeDialog } from './RenameThemeDialog';
import { useLocalization } from '../../context/LocalizationContext';
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
  Grid,
  Maximize2,
  Minimize2,
  Tv,
  Edit3,
} from 'lucide-react';

interface ThemeEditorProps {
  themeId: string;
  onBack: () => void;
  isOnboarding?: boolean;
}

export const ThemeEditor: React.FC<ThemeEditorProps> = ({ themeId, onBack, isOnboarding = false }) => {
  const {
    themes,
    updateTheme,
    renameTheme,
    uploadAsset,
    currentOrganization,
    activeGame,
    fetchThemes,
  } = useAuth();
  const { t } = useLocalization();

  const role = currentOrganization?.role || 'viewer';
  const isViewer = role === 'viewer';

  // Check if opened within mandatory theme setup flow
  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const isFlowOnboarding = isOnboarding || searchParams.get('onboarding') === 'true';

  const [activeTab, setActiveTab] = useState<'visuals' | 'items' | 'gameplay' | 'audio' | 'branding' | 'layout' | 'screens'>('visuals');
  const [selectedLayoutElement, setSelectedLayoutElement] = useState<LayoutElementKey>('clientLogo');

  // Dedicated Play Live Game state
  const [isPlayingLiveGame, setIsPlayingLiveGame] = useState<boolean>(false);
  const [restartKey, setRestartKey] = useState<number>(0);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const liveGameContainerRef = useRef<HTMLDivElement | null>(null);

  // Fullscreen change listener & resize dispatcher
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isCurrentlyFs =
        !!document.fullscreenElement || !!(document as any).webkitFullscreenElement;
      setIsFullscreen(isCurrentlyFs);
      // Dispatch resize event so games/canvases smoothly adapt layout
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 50);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        handleCloseFullscreen();
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFullscreen]);

  const handleCloseFullscreen = async () => {
    try {
      if (document.fullscreenElement || (document as any).webkitFullscreenElement) {
        if (document.exitFullscreen) {
          await document.exitFullscreen().catch(() => {});
        } else if ((document as any).webkitExitFullscreen) {
          (document as any).webkitExitFullscreen();
        }
      }
    } catch {
      // Ignored
    } finally {
      setIsFullscreen(false);
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 50);
    }
  };

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
      handleCloseFullscreen();
    }
  };

  // Draft theme currently being edited
  const [draftTheme, setDraftTheme] = useState<GameTheme | null>(null);

  // Snapshot of saved state for diff / reset
  const [savedThemeSnapshot, setSavedThemeSnapshot] = useState<GameTheme | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [uploadingAsset, setUploadingAsset] = useState<string | null>(null);
  const [hasCompletedOnboardingSave, setHasCompletedOnboardingSave] = useState(false);

  // Unsaved changes confirmation dialog
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);

  // Active orientation editing mode synchronized between Layout tab and Live Preview
  const [layoutOrientation, setLayoutOrientation] = useState<'landscape' | 'portrait'>('landscape');

  useEffect(() => {
    if (draftTheme?.layout?.orientation === 'portrait') {
      setLayoutOrientation('portrait');
    }
  }, [draftTheme?.layout?.orientation]);

  // Ref tracking current draft for in-flight save comparison (Scenario 8)
  const draftThemeRef = useRef<GameTheme | null>(draftTheme);
  draftThemeRef.current = draftTheme;

  // Ref tracking loaded theme ID to prevent context updates from overriding dirty state
  const loadedThemeIdRef = useRef<string | null>(null);

  // Initialize or fetch theme
  useEffect(() => {
    // Only load if we haven't loaded this themeId yet
    if (loadedThemeIdRef.current === themeId && draftTheme) {
      return;
    }

    const found = themes.find((t) => t.id === themeId);
    if (found) {
      const cloned = JSON.parse(JSON.stringify(found));
      setDraftTheme(cloned);
      setSavedThemeSnapshot(cloned);
      loadedThemeIdRef.current = themeId;
    } else {
      // If themes list is empty or not yet loaded, fetch
      fetchThemes().then((list) => {
        const t = list.find((item) => item.id === themeId);
        if (t) {
          const cloned = JSON.parse(JSON.stringify(t));
          setDraftTheme(cloned);
          setSavedThemeSnapshot(cloned);
          loadedThemeIdRef.current = themeId;
        }
      });
    }
  }, [themeId, themes, draftTheme]);

  // Determine if there are unsaved changes
  const hasUnsavedChanges = useMemo(() => {
    if (!draftTheme || !savedThemeSnapshot) return false;
    return !deepEqual(draftTheme, savedThemeSnapshot);
  }, [draftTheme, savedThemeSnapshot]);

  // Handle Back to Themes with unsaved changes guard
  const handleBackClick = () => {
    if (hasUnsavedChanges) {
      setShowUnsavedModal(true);
    } else {
      onBack();
    }
  };

  // Safe theme change dispatcher for all tabs and customizers
  const handleThemeChange = useCallback((updated: GameTheme | ((prev: GameTheme | null) => GameTheme | null)) => {
    setDraftTheme((prev) => {
      const next = typeof updated === 'function' ? (updated as any)(prev) : updated;
      return next;
    });
    setErrorMessage(null);
  }, []);

  // Reset Draft
  const handleResetDraft = () => {
    if (!savedThemeSnapshot) return;
    setDraftTheme(JSON.parse(JSON.stringify(savedThemeSnapshot)));
    setErrorMessage(null);
    setSaveSuccess(false);
  };

  // Save Theme to Supabase
  const handleSaveTheme = async () => {
    if (!draftTheme || isViewer || saving) return;

    // Capture exact snapshot being submitted
    const themeBeingSaved = JSON.parse(JSON.stringify(draftTheme));

    setSaving(true);
    setErrorMessage(null);
    setSaveSuccess(false);

    try {
      const updated = await updateTheme(themeBeingSaved.id, themeBeingSaved);
      const clonedSaved = JSON.parse(JSON.stringify(updated));

      // Update saved baseline to what server persisted
      setSavedThemeSnapshot(clonedSaved);

      // Check if user made additional changes while save was in-flight (Scenario 8)
      const currentDraft = draftThemeRef.current;
      if (currentDraft && deepEqual(currentDraft, themeBeingSaved)) {
        // No changes occurred during save
        setDraftTheme(clonedSaved);
        setSaveSuccess(true);
      } else {
        // Newer unsaved changes were made during in-flight save!
        // Keep currentDraft in draftTheme so user's work is preserved.
        setSaveSuccess(false);
      }

      await fetchThemes();

      // If user is in the mandatory onboarding theme setup flow, seamlessly guide them to create their first event
      if (isFlowOnboarding) {
        setHasCompletedOnboardingSave(true);
        setTimeout(() => {
          navigateTo('/events?create=true');
        }, 1200);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save theme');
      setSaveSuccess(false);
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

  // Rename theme modal state and handler
  const [showRenameModal, setShowRenameModal] = useState<boolean>(false);

  const handleRenameTheme = async (targetThemeId: string, newName: string) => {
    const updated = await renameTheme(targetThemeId, newName);

    // Update saved snapshot with the new name and slug (as server persisted it)
    setSavedThemeSnapshot((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        name: updated.name,
        slug: updated.slug,
      };
    });

    // Update current draft with the new name and slug, preserving any in-progress unsaved visual customizations!
    setDraftTheme((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        name: updated.name,
        slug: updated.slug,
      };
    });

    // Refresh themes list so all navigation and lists update
    await fetchThemes();
  };

  if (!draftTheme) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 text-center text-slate-400 space-y-4">
        <div className="w-10 h-10 border-3 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="font-bold text-xs tracking-wider uppercase">{t('studio.loadingThemeConfig')}</p>
        <button
          onClick={onBack}
          className="text-xs text-amber-400 hover:underline inline-flex items-center gap-1 mt-2"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>{t('studio.returnToThemes')}</span>
        </button>
      </div>
    );
  }

  // ============================================================
  // PLAY LIVE GAME MODE: CLEAN FULL-PAGE GAME PREVIEW
  // HIDE Theme Settings / Editor panel, sidebar, tabs, controls
  // ONLY render the simple toolbar + actual GameShell
  // ============================================================
  if (isPlayingLiveGame) {
    return (
      <div
        ref={liveGameContainerRef}
        className={
          isFullscreen
            ? 'fixed inset-0 z-[99999] w-screen h-screen bg-[#07130b] overflow-hidden p-0 m-0 flex flex-col items-center justify-center'
            : 'max-w-[1600px] mx-auto px-4 sm:px-6 py-4 flex flex-col space-y-4 min-h-[calc(100vh-120px)]'
        }
      >
        {/* Simple Toolbar (hidden in fullscreen) */}
        {!isFullscreen && (
          <header className="bg-slate-900 border border-slate-800 rounded-2xl px-4 sm:px-6 py-3 shadow-xl flex items-center justify-between gap-4">
            {/* Left: Back to Editor + Theme Name */}
            <div className="flex items-center gap-3 sm:gap-4 min-w-0">
              <button
                type="button"
                onClick={() => setIsPlayingLiveGame(false)}
                className="flex items-center gap-2 px-3.5 py-2 bg-slate-950 hover:bg-slate-800 active:scale-95 text-slate-300 hover:text-white border border-slate-800 rounded-xl text-xs font-bold transition-all shadow-sm shrink-0"
              >
                <ArrowLeft className="w-4 h-4 text-amber-400" />
                <span>{t('studio.backToEditor')}</span>
              </button>

              <div className="h-5 w-px bg-slate-800 hidden sm:block shrink-0" />

              {/* Theme Name */}
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                <h1 className="text-sm sm:text-base font-black text-slate-100 tracking-tight truncate">
                  {draftTheme.name}
                </h1>
                <span className="text-[11px] font-mono text-slate-400 bg-slate-950 px-2 py-0.5 rounded-lg border border-slate-800 hidden md:inline-block shrink-0">
                  {t('studio.liveGameMode')}
                </span>
              </div>
            </div>

            {/* Right: Restart & Fullscreen */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setRestartKey((prev) => prev + 1)}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 hover:text-white border border-slate-700 rounded-xl text-xs font-bold transition-all shadow-sm"
                title={t('studio.restartGame')}
              >
                <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                <span>{t('common.restart')}</span>
              </button>

              <button
                type="button"
                onClick={handleToggleFullscreen}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 hover:text-white border border-slate-700 rounded-xl text-xs font-bold transition-all shadow-sm"
                title={isFullscreen ? t('common.exitFullscreen') : t('common.fullscreen')}
              >
                {isFullscreen ? (
                  <Minimize2 className="w-3.5 h-3.5 text-slate-300" />
                ) : (
                  <Maximize2 className="w-3.5 h-3.5 text-slate-300" />
                )}
                <span className="hidden sm:inline">{isFullscreen ? t('common.exitFullscreen') : t('common.fullscreen')}</span>
              </button>
            </div>
          </header>
        )}

        {/* Full-width Game Viewport using current draftTheme */}
        <div
          className={`flex-1 w-full flex flex-col items-center justify-center overflow-hidden ${
            isFullscreen
              ? 'p-0 m-0 bg-[#07130b] border-none rounded-none shadow-none h-full'
              : 'bg-slate-950 border border-slate-800 rounded-3xl p-2 sm:p-4 md:p-6 shadow-2xl min-h-[580px] h-[calc(100vh-140px)]'
          }`}
        >
          <GameShell
            key={`live-game-${draftTheme.id}-${restartKey}`}
            customTheme={draftTheme}
            gameType={getThemeGameType(draftTheme, activeGame?.game_type_id || activeGame?.slug || 'catch-brand')}
            showCabinetFooter={false}
            className="w-full h-full"
            isFullscreen={isFullscreen}
            onToggleFullscreen={handleToggleFullscreen}
          />
        </div>

        {isFullscreen && (
          <button
            type="button"
            onClick={handleCloseFullscreen}
            className="fixed top-4 right-4 z-[100000] flex items-center gap-2 px-4 py-2 bg-slate-900/90 hover:bg-slate-800 active:scale-95 text-slate-200 hover:text-white border border-slate-700/80 rounded-xl text-xs font-bold transition-all shadow-2xl backdrop-blur-md cursor-pointer"
            title={t('studio.closeFullscreen')}
          >
            <Minimize2 className="w-4 h-4 text-amber-400" />
            <span>{t('studio.closeFullscreen')}</span>
            <span className="text-[10px] text-slate-400 font-mono ml-1 px-1.5 py-0.5 bg-slate-950 rounded border border-slate-800">
              ESC
            </span>
          </button>
        )}
      </div>
    );
  }

  // ============================================================
  // STANDARD GAME STUDIO THEME EDITOR LAYOUT
  // ============================================================
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
            <span>{t('studio.returnToThemes')}</span>
          </button>

          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-black text-slate-100 tracking-tight">
                {draftTheme.name}
              </h1>

              {/* Rename Theme Action */}
              {!isViewer && !draftTheme.is_system && (
                <button
                  type="button"
                  id="theme-editor-rename-button"
                  onClick={() => setShowRenameModal(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-800/80 hover:bg-slate-700/80 active:scale-95 text-slate-300 hover:text-amber-400 border border-slate-700/60 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-sm"
                  title={t('studio.renameTheme')}
                  aria-label={t('studio.renameTheme')}
                >
                  <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                  <span>{t('common.rename')}</span>
                </button>
              )}

              {/* Status Badge */}
              {draftTheme.status === 'draft' && (
                <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-amber-400 border border-amber-500/30 text-xs font-semibold flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  <span>{t('common.draft')}</span>
                </span>
              )}
              {draftTheme.status === 'archived' && (
                <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 text-xs font-semibold flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                  <span>{t('common.archived')}</span>
                </span>
              )}

              {/* Unsaved Changes Indicator */}
              {hasUnsavedChanges ? (
                <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[11px] font-bold flex items-center gap-1.5 animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  {t('studio.unsavedChanges')}
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full bg-slate-800/80 text-slate-400 border border-slate-700/80 text-[11px] font-semibold flex items-center gap-1">
                  <Check className="w-3 h-3 text-emerald-400" />
                  {t('studio.allChangesSaved')}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">
              {t('studio.themeCustomizationDesc')}
            </p>
          </div>
        </div>

        {/* Right: Actions: Reset, Play Live Game, Save Theme */}
        <div className="flex flex-wrap items-center gap-2.5 w-full xl:w-auto justify-end">
          {/* Reset / Undo Draft Button */}
          {hasUnsavedChanges && (
            <button
              type="button"
              onClick={handleResetDraft}
              disabled={saving}
              className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 border border-slate-700"
              title={t('studio.discardEditsDesc')}
            >
              <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
              <span>{t('common.reset')}</span>
            </button>
          )}

          {/* PLAY LIVE GAME BUTTON */}
          <button
            type="button"
            onClick={() => setIsPlayingLiveGame(true)}
            className="px-3.5 py-2.5 bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-slate-950 font-black text-xs rounded-xl transition-all flex items-center gap-1.5 shadow-md"
            title={t('studio.playLiveGameDesc')}
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>{t('studio.playLiveGame')}</span>
          </button>

          {/* PRIMARY ACTION: SAVE THEME */}
          {(() => {
            const isOnboardingInitial = isFlowOnboarding && !hasCompletedOnboardingSave;
            const canSave = hasUnsavedChanges || isOnboardingInitial;
            const isSaved = !hasUnsavedChanges && !isOnboardingInitial;

            return (
              <button
                type="button"
                id="theme-editor-save-button"
                onClick={handleSaveTheme}
                disabled={saving || isViewer || !canSave}
                className={`px-5 py-2.5 rounded-xl font-black text-xs shadow-xl transition-all flex items-center gap-2 ${
                  saving
                    ? 'bg-amber-600/80 text-slate-950 cursor-wait'
                    : canSave
                    ? 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 active:scale-95 ring-2 ring-amber-400/30 cursor-pointer'
                    : 'bg-slate-800 text-slate-400 border border-slate-700 cursor-default'
                }`}
              >
                {saving ? (
                  <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                ) : isSaved ? (
                  <Check className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                <span>
                  {saving
                    ? 'Saving...'
                    : isSaved
                    ? isFlowOnboarding
                      ? 'Saved! Unlocking Event...'
                      : 'Saved!'
                    : isFlowOnboarding
                    ? 'Save & Continue'
                    : 'Save Theme'}
                </span>
              </button>
            );
          })()}
        </div>
      </header>

      {/* Mandatory Onboarding Banner */}
      {isFlowOnboarding && (
        <div className="bg-amber-500/10 border border-amber-500/30 text-amber-200 px-5 py-3.5 rounded-2xl text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
            <div>
              <span className="font-bold text-amber-300">{t('studio.mandatoryThemeSetup')}</span>{' '}
              <span className="text-slate-300">
                {t('studio.mandatoryThemeDesc')}
              </span>
            </div>
          </div>
          {saveSuccess && !hasUnsavedChanges ? (
            <span className="font-bold text-emerald-400 shrink-0 flex items-center gap-1.5 animate-pulse">
              <Check className="w-4 h-4 text-emerald-400" />
              {t('studio.themeSetupCompleteRedirect')}
            </span>
          ) : (
            <span className="text-[11px] text-amber-300/80 shrink-0 bg-amber-500/20 px-2.5 py-1 rounded-full font-semibold">
              {t('studio.eventCreationUnlocksOnSave')}
            </span>
          )}
        </div>
      )}

      {/* Error / Success Notifications */}
      {saveSuccess && !hasUnsavedChanges && (
        <div className="bg-emerald-950/80 border border-emerald-500/40 text-emerald-200 p-4 sm:p-5 rounded-3xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl backdrop-blur-sm animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-center gap-3.5">
            <div className="p-2.5 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shrink-0">
              <Check className="w-5 h-5 stroke-[3]" />
            </div>
            <div>
              <h4 className="text-sm font-black text-slate-100 flex items-center gap-2">
                <span>{t('studio.themeSaved')}</span>
              </h4>
              <p className="text-xs text-emerald-300/80 font-medium mt-0.5">
                {t('studio.themeSavedDesc')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end shrink-0">
            <button
              type="button"
              onClick={() => setIsPlayingLiveGame(true)}
              className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs rounded-xl shadow-lg transition-all flex items-center gap-2 active:scale-95"
            >
              <Gamepad2 className="w-4 h-4" />
              <span>{t('studio.playLiveGame')}</span>
            </button>

            <button
              type="button"
              onClick={handleBackClick}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl border border-slate-700 transition-all flex items-center gap-1.5 active:scale-95"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-amber-400" />
              <span>{t('studio.returnToThemes')}</span>
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
        {/* LEFT / MAIN COLUMN: 6 TABS & EDITORS (7 cols on lg) */}
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
              <span>
                {isReactionTheme(draftTheme)
                  ? '2. Gantry & Lights'
                  : isMemoryMatchTheme(draftTheme)
                  ? '2. Card Pairs'
                  : '2. Items'}
              </span>
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

            <button
              type="button"
              onClick={() => setActiveTab('layout')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                activeTab === 'layout'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Grid className="w-3.5 h-3.5" />
              <span>6. Layout</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('screens')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                activeTab === 'screens'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Tv className="w-3.5 h-3.5" />
              <span>7. Game Screens</span>
            </button>
          </nav>

          {/* ACTIVE TAB CONTENT */}
          <div className="space-y-4">
            {activeTab === 'visuals' && (
              <VisualsTab
                theme={draftTheme}
                onChange={handleThemeChange}
                onUploadAsset={handleUploadAssetFile}
                uploadingAsset={uploadingAsset}
              />
            )}

            {activeTab === 'items' && (
              <ItemsTab
                theme={draftTheme}
                onChange={handleThemeChange}
                onUploadAsset={handleUploadAssetFile}
                uploadingAsset={uploadingAsset}
              />
            )}

            {activeTab === 'gameplay' && (
              <GameplayTab
                theme={draftTheme}
                onChange={handleThemeChange}
              />
            )}

            {activeTab === 'audio' && (
              <AudioTab
                theme={draftTheme}
                onChange={handleThemeChange}
              />
            )}

            {activeTab === 'branding' && (
              <BrandingTab
                theme={draftTheme}
                onChange={handleThemeChange}
                onUploadAsset={handleUploadAssetFile}
                uploadingAsset={uploadingAsset}
              />
            )}

            {activeTab === 'layout' && (
              <LayoutTab
                theme={draftTheme}
                onChange={handleThemeChange}
                selectedElementKey={selectedLayoutElement}
                onSelectElementKey={setSelectedLayoutElement}
                activeOrientation={layoutOrientation}
                onOrientationChange={setLayoutOrientation}
              />
            )}

            {activeTab === 'screens' && (
              <ScreensTab
                theme={draftTheme}
                onChange={handleThemeChange}
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
          <LiveThemePreview
            theme={draftTheme}
            editableLayout={activeTab === 'layout'}
            selectedElementKey={selectedLayoutElement}
            onSelectElementKey={setSelectedLayoutElement}
            onPlayLiveGame={() => setIsPlayingLiveGame(true)}
            forcedOrientation={activeTab === 'layout' ? layoutOrientation : undefined}
            onOrientationChange={activeTab === 'layout' ? setLayoutOrientation : undefined}
            onUpdateLayout={(newLayoutOrUpdater) => {
              handleThemeChange((prev) => {
                if (!prev) return prev;
                const currentLayout = prev.layout || getDefaultUILayout(getThemeGameType(prev));
                const nextLayout =
                  typeof newLayoutOrUpdater === 'function'
                    ? newLayoutOrUpdater(currentLayout)
                    : newLayoutOrUpdater;
                return {
                  ...prev,
                  layout: nextLayout,
                };
              });
            }}
          />
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

      {/* Rename Theme Dialog */}
      {showRenameModal && (
        <RenameThemeDialog
          isOpen={showRenameModal}
          onClose={() => setShowRenameModal(false)}
          theme={draftTheme}
          existingThemes={themes}
          onRename={handleRenameTheme}
        />
      )}
    </div>
  );
};

