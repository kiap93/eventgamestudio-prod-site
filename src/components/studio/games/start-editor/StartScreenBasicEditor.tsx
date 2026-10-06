import { useLocalization } from '../../../../context/LocalizationContext';
import React, { useRef, useState } from 'react';
import {
  Palette,
  Layers,
  Image as ImageIcon,
  RotateCcw,
  Check,
  Upload,
  RefreshCw,
  Trash2,
  AlertCircle,
  Eye,
  Sparkles,
  Grid3X3,
  Clock,
  Zap,
  HelpCircle,
  Trophy,
  Sliders,
  Keyboard,
} from 'lucide-react';
import { GameTheme } from '../../../../themes/types';
import {
  StartScreenConfig,
  StartScreenGameMeta,
  StartScreenElement,
} from '../../../../games/shared/startScreenTypes';
import {
  findStartScreenElementVisibility,
  updateStartScreenElementVisibility,
} from '../../../../games/shared/startScreenResolver';

export const START_BG_COLOR_PRESETS = [
  { name: 'Navy', hex: '#0f172a' },
  { name: 'Deep Space', hex: '#030712' },
  { name: 'Pure Black', hex: '#000000' },
  { name: 'Dark Slate', hex: '#1e293b' },
  { name: 'Emerald', hex: '#064e3b' },
  { name: 'Deep Teal', hex: '#134e4a' },
  { name: 'Burgundy', hex: '#4c0519' },
  { name: 'Gold/Amber', hex: '#78350f' },
  { name: 'Dark Purple', hex: '#3b0764' },
  { name: 'Charcoal', hex: '#18181b' },
];

export interface StartScreenBasicEditorProps {
  startConfig: StartScreenConfig;
  theme?: Partial<GameTheme> | null;
  gameType: string;
  gameMeta?: StartScreenGameMeta;
  onChange: (updates: Partial<StartScreenConfig>) => void;
  onUploadAsset?: (file: File, fieldKey: string) => Promise<string>;
  uploadingAsset?: string | null;
}

export const StartScreenBasicEditor: React.FC<StartScreenBasicEditorProps> = ({
  startConfig,
  theme,
  gameType,
  gameMeta,
  onChange,
  onUploadAsset,
  uploadingAsset,
}) => {
  const { t } = useLocalization();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const currentBgType =
    startConfig.backgroundType || startConfig.background?.type || 'theme';
  const currentBgColor =
    startConfig.backgroundColor || startConfig.background?.color || '#0f172a';
  const currentBgImageUrl =
    startConfig.backgroundImageUrl !== undefined
      ? startConfig.backgroundImageUrl
      : (startConfig.background?.imageUrl ?? null);
  const currentOverlayOpacity =
    startConfig.backgroundOverlayOpacity !== undefined
      ? startConfig.backgroundOverlayOpacity
      : (startConfig.background?.overlayOpacity ?? 0.3);

  const elements = startConfig.elements || [];

  const handleUpdateBackground = (updates: {
    backgroundType?: 'theme' | 'color' | 'image';
    backgroundColor?: string;
    backgroundImageUrl?: string | null;
    backgroundOverlayOpacity?: number;
  }) => {
    const nextType = updates.backgroundType ?? currentBgType;
    const nextColor = updates.backgroundColor ?? currentBgColor;
    const nextImage =
      updates.backgroundImageUrl !== undefined
        ? updates.backgroundImageUrl
        : currentBgImageUrl;
    const nextOpacity =
      updates.backgroundOverlayOpacity !== undefined
        ? updates.backgroundOverlayOpacity
        : currentOverlayOpacity;

    onChange({
      backgroundType: nextType,
      backgroundColor: nextColor,
      backgroundImageUrl: nextImage,
      backgroundOverlayOpacity: nextOpacity,
      background: {
        type: nextType,
        color: nextColor,
        imageUrl: nextImage,
        overlayOpacity: nextOpacity,
      },
    });
  };

  const handleResetBackground = () => {
    handleUpdateBackground({
      backgroundType: 'theme',
      backgroundColor: '#0f172a',
      backgroundImageUrl: null,
      backgroundOverlayOpacity: 0.3,
    });
  };

  const handleUploadBgFile = async (file: File) => {
    setUploadError(null);
    if (!file.type.startsWith('image/')) {
      setUploadError('Please select a valid image file (PNG, JPG, WebP)');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setUploadError('Image size exceeds 10MB limit');
      return;
    }

    try {
      if (onUploadAsset) {
        const uploadedUrl = await onUploadAsset(file, 'start_screen_bg');
        if (uploadedUrl) {
          handleUpdateBackground({
            backgroundType: 'image',
            backgroundImageUrl: uploadedUrl,
          });
          return;
        }
      }

      // Fallback: local FileReader data URL
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          handleUpdateBackground({
            backgroundType: 'image',
            backgroundImageUrl: reader.result,
          });
        }
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setUploadError(err?.message || 'Failed to upload background image');
    }
  };

  // Visibility toggle handler
  const handleToggleElementVisibility = (elementId: string, currentVisible: boolean) => {
    const nextVisible = !currentVisible;
    const nextElements = updateStartScreenElementVisibility(elements, elementId, nextVisible);

    // Also update any legacy flags matching this element
    const legacyUpdates: Partial<StartScreenConfig> = {
      elements: nextElements,
    };

    if (elementId === 'top-icon' || elementId === 'client-logo' || elementId === 'eyebrow-text') {
      legacyUpdates.showIcon = nextVisible;
    } else if (elementId === 'badge-grid') {
      legacyUpdates.showGridInfo = nextVisible;
    } else if (elementId === 'badge-pairs') {
      legacyUpdates.showPairsInfo = nextVisible;
    } else if (elementId === 'badge-timer') {
      legacyUpdates.showTimerInfo = nextVisible;
    } else if (elementId === 'rules-cards') {
      legacyUpdates.showRules = nextVisible;
    } else if (elementId === 'keyboard-hints') {
      legacyUpdates.showKeyboardHints = nextVisible;
    } else if (elementId === 'leaderboard-btn') {
      legacyUpdates.showLeaderboard = nextVisible;
    } else if (elementId === 'guide-btn') {
      legacyUpdates.showGuide = nextVisible;
    } else if (elementId === 'badge-rounds') {
      legacyUpdates.showRoundsInfo = nextVisible;
    } else if (elementId === 'badge-lights') {
      legacyUpdates.showLightsInfo = nextVisible;
    }

    onChange(legacyUpdates);
  };

  // Determine which visibility controls to show based on game type
  const isMemory = gameType === 'memory-match';
  const isReaction = gameType === 'reaction-tap' || gameType === 'reaction-time';
  const isCatch = !isMemory && !isReaction;

  return (
    <div className="space-y-6">
      {/* 1. BACKGROUND SELECTION CARD */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-5 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
              <Palette className="w-4 h-4" />
            </span>
            <div>
              <h4 className="text-sm font-bold text-slate-100">{t('editor.startScreenBg', undefined, 'Start Screen Background')}</h4>
              <p className="text-xs text-slate-400">
                Choose between theme background, solid color, or custom uploaded image
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleResetBackground}
            className="px-2.5 py-1 text-[11px] font-semibold text-slate-400 hover:text-slate-200 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg transition-colors flex items-center gap-1"
            title={t('editor.resetCanvasLayout', undefined, 'Reset Start Screen background to Theme defaults')}
          >
            <RotateCcw className="w-3 h-3" />
            <span>{t('common.reset', undefined, 'Reset')}</span>
          </button>
        </div>

        {/* Background Type Selector */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <button
            type="button"
            onClick={() => handleUpdateBackground({ backgroundType: 'theme' })}
            className={`p-3 rounded-2xl border text-left flex items-center gap-2.5 transition-all cursor-pointer ${
              currentBgType === 'theme'
                ? 'bg-amber-500/15 border-amber-500/60 text-amber-300 shadow-md shadow-amber-500/10 font-bold'
                : 'bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-400 font-medium'
            }`}
          >
            <Layers className="w-4 h-4 text-amber-400 shrink-0" />
            <div className="min-w-0">
              <span className="text-xs block">{t('editor.activeThemeBg', undefined, 'Active Theme BG')}</span>
              <span className="text-[10px] text-slate-500 block truncate">{t('editor.activeThemeBgDesc', undefined, 'Uses theme wallpaper')}</span>
            </div>
            {currentBgType === 'theme' && <Check className="w-3.5 h-3.5 text-amber-400 ml-auto" />}
          </button>

          <button
            type="button"
            onClick={() => handleUpdateBackground({ backgroundType: 'color' })}
            className={`p-3 rounded-2xl border text-left flex items-center gap-2.5 transition-all cursor-pointer ${
              currentBgType === 'color'
                ? 'bg-amber-500/15 border-amber-500/60 text-amber-300 shadow-md shadow-amber-500/10 font-bold'
                : 'bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-400 font-medium'
            }`}
          >
            <Palette className="w-4 h-4 text-amber-400 shrink-0" />
            <div className="min-w-0">
              <span className="text-xs block">{t('editor.solidColor', undefined, 'Solid Color')}</span>
              <span className="text-[10px] text-slate-500 block truncate">{t('editor.solidColorDesc', undefined, 'Custom backdrop color')}</span>
            </div>
            {currentBgType === 'color' && <Check className="w-3.5 h-3.5 text-amber-400 ml-auto" />}
          </button>

          <button
            type="button"
            onClick={() => handleUpdateBackground({ backgroundType: 'image' })}
            className={`p-3 rounded-2xl border text-left flex items-center gap-2.5 transition-all cursor-pointer ${
              currentBgType === 'image'
                ? 'bg-amber-500/15 border-amber-500/60 text-amber-300 shadow-md shadow-amber-500/10 font-bold'
                : 'bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-400 font-medium'
            }`}
          >
            <ImageIcon className="w-4 h-4 text-amber-400 shrink-0" />
            <div className="min-w-0">
              <span className="text-xs block">{t('editor.customImage', undefined, 'Custom Image')}</span>
              <span className="text-[10px] text-slate-500 block truncate">{t('editor.customImageDesc', undefined, 'Independent artwork upload')}</span>
            </div>
            {currentBgType === 'image' && <Check className="w-3.5 h-3.5 text-amber-400 ml-auto" />}
          </button>
        </div>

        {/* Sub-Panel: Solid Color Picker */}
        {currentBgType === 'color' && (
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={currentBgColor}
                  onChange={(e) => handleUpdateBackground({ backgroundColor: e.target.value })}
                  className="w-9 h-9 rounded-xl cursor-pointer bg-transparent border-0"
                />
                <div>
                  <label className="text-xs font-semibold text-slate-300 block">{t('editor.customColor', undefined, 'Custom Color')}</label>
                  <input
                    type="text"
                    value={currentBgColor}
                    onChange={(e) => handleUpdateBackground({ backgroundColor: e.target.value })}
                    className="font-mono text-xs text-amber-400 font-bold bg-slate-900 border border-slate-700 rounded px-2 py-0.5 mt-0.5 uppercase"
                  />
                </div>
              </div>

              {/* Swatches */}
              <div className="flex flex-wrap items-center gap-1.5">
                {START_BG_COLOR_PRESETS.map((preset) => (
                  <button
                    key={preset.hex}
                    type="button"
                    onClick={() => handleUpdateBackground({ backgroundColor: preset.hex })}
                    className={`w-6 h-6 rounded-lg border transition-all ${
                      currentBgColor.toLowerCase() === preset.hex.toLowerCase()
                        ? 'ring-2 ring-amber-400 scale-110 border-white'
                        : 'border-white/20 hover:scale-105'
                    }`}
                    style={{ backgroundColor: preset.hex }}
                    title={preset.name}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Sub-Panel: Custom Image Upload */}
        {currentBgType === 'image' && (
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUploadBgFile(f);
              }}
            />

            {currentBgImageUrl ? (
              <div className="flex flex-col sm:flex-row items-center gap-4">
                <div className="relative w-full sm:w-48 aspect-video rounded-xl overflow-hidden border border-slate-700 bg-slate-900 shrink-0">
                  <img
                    src={currentBgImageUrl}
                    alt="Start Screen Background"
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>

                <div className="space-y-2 flex-1 w-full text-center sm:text-left">
                  <p className="text-xs font-semibold text-slate-200">{t('editor.customStartBgLoaded', undefined, 'Custom Start Screen Background Loaded')}</p>
                  <p className="text-[11px] text-slate-400">{t('editor.aspectRatio16_9', undefined, '16:9 recommended aspect ratio (1024×576px or higher)')}</p>

                  <div className="flex items-center justify-center sm:justify-start gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingAsset === 'start_screen_bg'}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl border border-slate-700 transition-all flex items-center gap-1.5"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
                      <span>{t('editor.replaceImage', undefined, 'Replace Image')}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        handleUpdateBackground({ backgroundImageUrl: null, backgroundType: 'theme' })
                      }
                      className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs font-bold rounded-xl border border-rose-500/30 transition-all flex items-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{t('common.remove', undefined, 'Remove')}</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragActive(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) handleUploadBgFile(f);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
                  dragActive
                    ? 'border-amber-400 bg-amber-500/10'
                    : 'border-slate-800 hover:border-amber-500/50 bg-slate-900/50 hover:bg-slate-900'
                }`}
              >
                <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto mb-2">
                  <Upload className="w-5 h-5" />
                </div>
                <p className="text-xs font-bold text-slate-200">
                  Drag & Drop Start Screen Image here or click to browse
                </p>
                <p className="text-[11px] text-slate-400 mt-1">{t('editor.supportsPngJpgWebp', undefined, 'Supports PNG, JPG, WebP (Max 10MB)')}</p>
              </div>
            )}

            {uploadError && (
              <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 px-3 py-2 rounded-xl text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}
          </div>
        )}

        {/* Dark Overlay Opacity Slider */}
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-slate-300 block">{t('editor.darkBackdropOverlay', undefined, 'Dark Backdrop Overlay')}</span>
              <span className="text-[10px] text-slate-500">
                Darkens background to ensure maximum legibility for text and elements
              </span>
            </div>
            <span className="text-amber-400 font-bold font-mono text-xs">
              {Math.round(currentOverlayOpacity * 100)}%
            </span>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={currentOverlayOpacity}
              onChange={(e) =>
                handleUpdateBackground({ backgroundOverlayOpacity: parseFloat(e.target.value) })
              }
              className="w-full accent-amber-500 cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
            <button
              type="button"
              onClick={() => handleUpdateBackground({ backgroundOverlayOpacity: 0 })}
              className="hover:text-amber-400"
            >
              0% (Clear)
            </button>
            <button
              type="button"
              onClick={() => handleUpdateBackground({ backgroundOverlayOpacity: 0.3 })}
              className="hover:text-amber-400"
            >
              30% (Default)
            </button>
            <button
              type="button"
              onClick={() => handleUpdateBackground({ backgroundOverlayOpacity: 0.5 })}
              className="hover:text-amber-400"
            >
              50%
            </button>
            <button
              type="button"
              onClick={() => handleUpdateBackground({ backgroundOverlayOpacity: 0.75 })}
              className="hover:text-amber-400"
            >
              75%
            </button>
            <button
              type="button"
              onClick={() => handleUpdateBackground({ backgroundOverlayOpacity: 0.9 })}
              className="hover:text-amber-400"
            >
              90%
            </button>
          </div>
        </div>
      </div>

      {/* 2. VISIBILITY CONTROLS CARD */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-4 shadow-lg">
        <div className="flex items-center gap-2">
          <span className="p-2 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
            <Eye className="w-4 h-4" />
          </span>
          <div>
            <h4 className="text-sm font-bold text-slate-100">{t('editor.startElementVisibility', undefined, 'Start Screen Element Visibility')}</h4>
            <p className="text-xs text-slate-400">
              Toggle headers, gameplay information pills, rules cards, and action buttons
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          {/* CATCH THE BRAND SPECIFIC VISIBILITY CONTROLS */}
          {isCatch && (
            <>
              {/* Eyebrow / Logo */}
              {(() => {
                const targetId =
                  findStartScreenElementVisibility(elements, 'client-logo') !== undefined
                    ? 'client-logo'
                    : 'eyebrow-text';
                const isVisible =
                  findStartScreenElementVisibility(elements, targetId) ??
                  startConfig.showIcon !== false;

                return (
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-amber-400">
                        <Sparkles className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-slate-200 block">{t('editor.headerLogoEyebrow', undefined, 'Header Eyebrow / Logo')}</span>
                        <span className="text-[10px] text-slate-400">{t('editor.headerLogoEyebrowDesc', undefined, 'Top arcade badge or brand logo')}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={isVisible}
                      onClick={() => handleToggleElementVisibility(targetId, isVisible)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                        isVisible ? 'bg-emerald-500' : 'bg-slate-800'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          isVisible ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                );
              })()}

              {/* Rules Cards (Good & Bad Item) */}
              {(() => {
                const isVisible =
                  findStartScreenElementVisibility(elements, 'rules-cards') ??
                  startConfig.showRules !== false;

                return (
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-emerald-400">
                        <Sliders className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-slate-200 block">{t('editor.rulesCollectiblesCards', undefined, 'Rules & Collectibles Cards')}</span>
                        <span className="text-[10px] text-slate-400">{t('editor.rulesCollectiblesCardsDesc', undefined, 'Shows target (+10) and hazard (-10)')}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={isVisible}
                      onClick={() => handleToggleElementVisibility('rules-cards', isVisible)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                        isVisible ? 'bg-emerald-500' : 'bg-slate-800'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          isVisible ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                );
              })()}

              {/* Keyboard Hints */}
              {(() => {
                const isVisible =
                  findStartScreenElementVisibility(elements, 'keyboard-hints') ??
                  startConfig.showKeyboardHints !== false;

                return (
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-cyan-400">
                        <Keyboard className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-slate-200 block">{t('editor.keyboardHintsPill', undefined, 'Keyboard Hints Pill')}</span>
                        <span className="text-[10px] text-slate-400">{t('editor.keyboardHintsPillDesc', undefined, 'Shows Arrow & A/D controls')}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={isVisible}
                      onClick={() => handleToggleElementVisibility('keyboard-hints', isVisible)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                        isVisible ? 'bg-emerald-500' : 'bg-slate-800'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          isVisible ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                );
              })()}

              {/* {t('editor.leaderboardBtn', undefined, 'Leaderboard Button')} */}
              {(() => {
                const isVisible =
                  findStartScreenElementVisibility(elements, 'leaderboard-btn') ??
                  startConfig.showLeaderboard !== false;

                return (
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-amber-400">
                        <Trophy className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-slate-200 block">{t('editor.leaderboardBtn', undefined, 'Leaderboard Button')}</span>
                        <span className="text-[10px] text-slate-400">{t('editor.leaderboardBtnDesc', undefined, 'Shortcut button to scores')}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={isVisible}
                      onClick={() => handleToggleElementVisibility('leaderboard-btn', isVisible)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                        isVisible ? 'bg-emerald-500' : 'bg-slate-800'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          isVisible ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                );
              })()}

              {/* Guide Button */}
              {(() => {
                const isVisible =
                  findStartScreenElementVisibility(elements, 'guide-btn') ??
                  startConfig.showGuide !== false;

                return (
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-purple-400">
                        <HelpCircle className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-slate-200 block">{t('editor.howToPlayBtn', undefined, 'How-To-Play Guide Button')}</span>
                        <span className="text-[10px] text-slate-400">{t('editor.howToPlayBtnDesc', undefined, 'Help modal button in footer')}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={isVisible}
                      onClick={() => handleToggleElementVisibility('guide-btn', isVisible)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                        isVisible ? 'bg-emerald-500' : 'bg-slate-800'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          isVisible ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                );
              })()}
            </>
          )}

          {/* MEMORY MATCH SPECIFIC VISIBILITY CONTROLS */}
          {isMemory && (
            <>
              {/* Top Icon */}
              {(() => {
                const isVisible =
                  findStartScreenElementVisibility(elements, 'top-icon') ??
                  startConfig.showIcon !== false;

                return (
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-amber-400">
                        <Sparkles className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-slate-200 block">{t('editor.gameHeaderIcon', undefined, 'Game Header Icon')}</span>
                        <span className="text-[10px] text-slate-400">{t('editor.gameHeaderIconDesc', undefined, 'Grid symbol badge at the top')}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={isVisible}
                      onClick={() => handleToggleElementVisibility('top-icon', isVisible)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                        isVisible ? 'bg-emerald-500' : 'bg-slate-800'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          isVisible ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                );
              })()}

              {/* {t('editor.gridDimensionsPill', undefined, 'Grid Dimensions Pill')} */}
              {(() => {
                const isVisible =
                  findStartScreenElementVisibility(elements, 'badge-grid') ??
                  startConfig.showGridInfo !== false;
                const rows = gameMeta?.rows ?? 4;
                const cols = gameMeta?.cols ?? 4;
                const totalCards = gameMeta?.totalCards ?? rows * cols;

                return (
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-emerald-400">
                        <Grid3X3 className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-slate-200 block">{t('editor.gridDimensionsPill', undefined, 'Grid Dimensions Pill')}</span>
                        <span className="text-[10px] text-slate-400">
                          Shows "{rows}×{cols} ({totalCards} Cards)"
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={isVisible}
                      onClick={() => handleToggleElementVisibility('badge-grid', isVisible)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                        isVisible ? 'bg-emerald-500' : 'bg-slate-800'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          isVisible ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                );
              })()}

              {/* {t('editor.pairsCountPill', undefined, 'Pairs Count Pill')} */}
              {(() => {
                const isVisible =
                  findStartScreenElementVisibility(elements, 'badge-pairs') ??
                  startConfig.showPairsInfo !== false;
                const totalPairs = gameMeta?.totalPairs ?? 8;

                return (
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-purple-400">
                        <Layers className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-slate-200 block">{t('editor.pairsCountPill', undefined, 'Pairs Count Pill')}</span>
                        <span className="text-[10px] text-slate-400">
                          Shows "{totalPairs} Pairs to Match"
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={isVisible}
                      onClick={() => handleToggleElementVisibility('badge-pairs', isVisible)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                        isVisible ? 'bg-emerald-500' : 'bg-slate-800'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          isVisible ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                );
              })()}

              {/* {t('editor.timerDurationPill', undefined, 'Timer Duration Pill')} */}
              {(() => {
                const isVisible =
                  findStartScreenElementVisibility(elements, 'badge-timer') ??
                  startConfig.showTimerInfo !== false;
                const duration = gameMeta?.duration ?? 45;

                return (
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-amber-400">
                        <Clock className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-slate-200 block">{t('editor.timerDurationPill', undefined, 'Timer Duration Pill')}</span>
                        <span className="text-[10px] text-slate-400">Shows "{duration}s Timer"</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={isVisible}
                      onClick={() => handleToggleElementVisibility('badge-timer', isVisible)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                        isVisible ? 'bg-emerald-500' : 'bg-slate-800'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          isVisible ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                );
              })()}

              {/* Leaderboard Button */}
              {(() => {
                const isVisible =
                  findStartScreenElementVisibility(elements, 'leaderboard-btn') ??
                  startConfig.showLeaderboard !== false;

                return (
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-amber-400">
                        <Trophy className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-slate-200 block">{t('editor.leaderboardBtn', undefined, 'Leaderboard Button')}</span>
                        <span className="text-[10px] text-slate-400">{t('editor.leaderboardBtnDesc', undefined, 'Shortcut button to scores')}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={isVisible}
                      onClick={() => handleToggleElementVisibility('leaderboard-btn', isVisible)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                        isVisible ? 'bg-emerald-500' : 'bg-slate-800'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          isVisible ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                );
              })()}
            </>
          )}

          {/* REACTION TAP SPECIFIC VISIBILITY CONTROLS */}
          {isReaction && (
            <>
              {/* Top Zap Icon */}
              {(() => {
                const isVisible =
                  findStartScreenElementVisibility(elements, 'top-icon') ??
                  startConfig.showIcon !== false;

                return (
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-red-400">
                        <Zap className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-slate-200 block">{t('editor.startingGantryIcon', undefined, 'Starting Gantry Icon')}</span>
                        <span className="text-[10px] text-slate-400">{t('editor.startingGantryIconDesc', undefined, 'Top reaction zap symbol')}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={isVisible}
                      onClick={() => handleToggleElementVisibility('top-icon', isVisible)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                        isVisible ? 'bg-emerald-500' : 'bg-slate-800'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          isVisible ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                );
              })()}

              {/* {t('editor.roundsCountPill', undefined, 'Rounds Count Pill')} */}
              {(() => {
                const isVisible =
                  findStartScreenElementVisibility(elements, 'badge-rounds') ??
                  startConfig.showRoundsInfo !== false;
                const rounds = gameMeta?.roundsCount ?? 5;

                return (
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-amber-400">
                        <Sliders className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-slate-200 block">{t('editor.roundsCountPill', undefined, 'Rounds Count Pill')}</span>
                        <span className="text-[10px] text-slate-400">Shows "{rounds} Rounds"</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={isVisible}
                      onClick={() => handleToggleElementVisibility('badge-rounds', isVisible)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                        isVisible ? 'bg-emerald-500' : 'bg-slate-800'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          isVisible ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                );
              })()}

              {/* {t('editor.gantryLightsPill', undefined, 'Gantry Lights Pill')} */}
              {(() => {
                const isVisible =
                  findStartScreenElementVisibility(elements, 'badge-lights') ??
                  startConfig.showLightsInfo !== false;
                const lights = gameMeta?.lightCount ?? 5;

                return (
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-rose-400">
                        <Clock className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-slate-200 block">{t('editor.gantryLightsPill', undefined, 'Gantry Lights Pill')}</span>
                        <span className="text-[10px] text-slate-400">Shows "{lights} Lights"</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={isVisible}
                      onClick={() => handleToggleElementVisibility('badge-lights', isVisible)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                        isVisible ? 'bg-emerald-500' : 'bg-slate-800'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          isVisible ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                );
              })()}

              {/* Leaderboard Button */}
              {(() => {
                const isVisible =
                  findStartScreenElementVisibility(elements, 'leaderboard-btn') ??
                  startConfig.showLeaderboard !== false;

                return (
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-amber-400">
                        <Trophy className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-slate-200 block">{t('editor.leaderboardBtn', undefined, 'Leaderboard Button')}</span>
                        <span className="text-[10px] text-slate-400">{t('editor.leaderboardBtnDesc', undefined, 'Shortcut button to scores')}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={isVisible}
                      onClick={() => handleToggleElementVisibility('leaderboard-btn', isVisible)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                        isVisible ? 'bg-emerald-500' : 'bg-slate-800'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          isVisible ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                );
              })()}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
