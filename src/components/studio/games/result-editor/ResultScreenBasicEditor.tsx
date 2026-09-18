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
  Trophy,
  Sliders,
  Type,
  Clock,
  Zap,
  Target,
  Gauge,
  Timer,
  Play,
} from 'lucide-react';
import { GameTheme } from '../../../../themes/types';
import {
  ResultScreenConfig,
  ResultScreenElement,
  findResultScreenElementVisibility,
  updateResultScreenElementVisibility,
  findResultScreenElementText,
  updateResultScreenElementText,
  updateResultScreenButtonText,
  generateDefaultResultScreenElements,
  generateDefaultCatchBrandResultScreenElements,
  generateDefaultReactionResultScreenElements,
} from '../../../../games/shared/resultScreenTypes';

export const RESULT_BG_COLOR_PRESETS = [
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

export interface ResultScreenBasicEditorProps {
  resultConfig: ResultScreenConfig;
  theme?: Partial<GameTheme> | null;
  gameType: 'catch-brand' | 'memory-match' | 'reaction-tap' | 'reaction-time' | string;
  onChange: (updates: Partial<ResultScreenConfig>) => void;
  onUploadAsset?: (file: File, fieldKey: string) => Promise<string>;
  uploadingAsset?: string | null;
}

export const ResultScreenBasicEditor: React.FC<ResultScreenBasicEditorProps> = ({
  resultConfig,
  theme: _theme,
  gameType,
  onChange,
  onUploadAsset,
  uploadingAsset,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const isMemory = gameType === 'memory-match';
  const isReaction = gameType === 'reaction-tap' || gameType === 'reaction-time';
  const isCatch = !isMemory && !isReaction;

  const currentBgType =
    resultConfig.backgroundType || resultConfig.background?.type || 'theme';
  const currentBgColor =
    resultConfig.backgroundColor || resultConfig.background?.color || '#0f172a';
  const currentBgImageUrl =
    resultConfig.backgroundImageUrl !== undefined
      ? resultConfig.backgroundImageUrl
      : (resultConfig.background?.imageUrl ?? null);
  const currentOverlayOpacity =
    resultConfig.backgroundOverlayOpacity !== undefined
      ? resultConfig.backgroundOverlayOpacity
      : (resultConfig.background?.overlayOpacity ?? 0.3);

  // Authoritative elements tree fallback
  const rawElements = resultConfig.elements;
  const elements = React.useMemo(() => {
    if (Array.isArray(rawElements) && rawElements.length > 0) {
      return rawElements;
    }
    if (isReaction) {
      return generateDefaultReactionResultScreenElements(resultConfig);
    }
    if (isCatch) {
      return generateDefaultCatchBrandResultScreenElements(resultConfig);
    }
    return generateDefaultResultScreenElements(resultConfig);
  }, [rawElements, isReaction, isCatch, resultConfig]);

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
        const uploadedUrl = await onUploadAsset(file, 'result_screen_bg');
        if (uploadedUrl) {
          handleUpdateBackground({
            backgroundType: 'image',
            backgroundImageUrl: uploadedUrl,
          });
          return;
        }
      }

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
    const nextElements = updateResultScreenElementVisibility(elements, elementId, nextVisible);

    const legacyUpdates: Partial<ResultScreenConfig> = {
      elements: nextElements,
    };

    if (elementId === 'stat-score' || elementId === 'score') {
      legacyUpdates.showScore = nextVisible;
    } else if (elementId === 'stat-moves' || elementId === 'moves') {
      legacyUpdates.showMoves = nextVisible;
    } else if (elementId === 'stat-pairs' || elementId === 'pairs') {
      legacyUpdates.showPairs = nextVisible;
    } else if (elementId === 'stat-accuracy' || elementId === 'accuracy') {
      legacyUpdates.showAccuracy = nextVisible;
    }

    onChange(legacyUpdates);
  };

  // Title / text updater
  const handleUpdateTitleText = (newText: string) => {
    const titleId = isCatch ? 'title-catch' : isReaction ? 'title-reaction' : 'title-victory';
    const nextElements = updateResultScreenElementText(elements, titleId, newText);
    onChange({
      elements: nextElements,
    });
  };

  // Button text updater
  const handleUpdateButtonText = (newText: string) => {
    const nextElements = updateResultScreenButtonText(elements, 'playAgain', newText);
    onChange({
      elements: nextElements,
    });
  };

  // Current title text
  const currentTitle =
    findResultScreenElementText(
      elements,
      isCatch ? 'title-catch' : isReaction ? 'title-reaction' : 'title-victory'
    ) ?? (isCatch ? 'GAME OVER!' : isReaction ? 'GREAT REFLEXES!' : 'VICTORY!');

  // Current button text
  const currentBtnText = 'PLAY AGAIN';

  return (
    <div className="space-y-6">
      {/* 1. BACKGROUND SELECTION CARD */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-5 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="p-2 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
              <Palette className="w-4 h-4" />
            </span>
            <div>
              <h4 className="text-sm font-bold text-slate-100">Result Screen Background</h4>
              <p className="text-xs text-slate-400">
                Choose between theme wallpaper, solid backdrop color, or custom uploaded image
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleResetBackground}
            className="px-2.5 py-1 text-[11px] font-semibold text-slate-400 hover:text-slate-200 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
            title="Reset Result Screen background to Theme defaults"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset</span>
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
              <span className="text-xs block">Active Theme BG</span>
              <span className="text-[10px] text-slate-500 block truncate">Uses theme wallpaper</span>
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
              <span className="text-xs block">Solid Color</span>
              <span className="text-[10px] text-slate-500 block truncate">Custom backdrop color</span>
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
              <span className="text-xs block">Custom Image</span>
              <span className="text-[10px] text-slate-500 block truncate">Independent artwork upload</span>
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
                  <label className="text-xs font-semibold text-slate-300 block">Custom Color</label>
                  <input
                    type="text"
                    value={currentBgColor}
                    onChange={(e) => handleUpdateBackground({ backgroundColor: e.target.value })}
                    className="mt-0.5 px-2 py-0.5 bg-slate-900 border border-slate-800 rounded font-mono text-xs text-slate-200 uppercase w-24 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Color Presets */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {RESULT_BG_COLOR_PRESETS.map((preset) => (
                  <button
                    key={preset.hex}
                    type="button"
                    onClick={() => handleUpdateBackground({ backgroundColor: preset.hex })}
                    title={preset.name}
                    className={`w-6 h-6 rounded-lg border transition-transform hover:scale-110 cursor-pointer ${
                      currentBgColor.toLowerCase() === preset.hex.toLowerCase()
                        ? 'border-amber-400 scale-110 shadow-sm shadow-amber-500/50'
                        : 'border-slate-700'
                    }`}
                    style={{ backgroundColor: preset.hex }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Sub-Panel: Custom Image Uploader */}
        {currentBgType === 'image' && (
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                  handleUploadBgFile(e.dataTransfer.files[0]);
                }
              }}
              className={`border-2 border-dashed rounded-2xl p-4 text-center transition-colors ${
                dragActive
                  ? 'border-amber-500 bg-amber-500/10'
                  : 'border-slate-800 hover:border-slate-700 bg-slate-900/50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleUploadBgFile(e.target.files[0]);
                  }
                }}
              />

              {currentBgImageUrl ? (
                <div className="flex flex-col sm:flex-row items-center gap-4 justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={currentBgImageUrl}
                      alt="Result Screen Background"
                      referrerPolicy="no-referrer"
                      className="w-16 h-12 rounded-xl object-cover border border-slate-700 shrink-0"
                    />
                    <div className="text-left min-w-0">
                      <span className="text-xs font-semibold text-slate-200 block truncate">
                        Custom Result Background
                      </span>
                      <span className="text-[10px] text-emerald-400 block">Active &amp; Ready</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingAsset === 'result_screen_bg'}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-xl border border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {uploadingAsset === 'result_screen_bg' ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Upload className="w-3.5 h-3.5" />
                      )}
                      <span>Change</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdateBackground({ backgroundImageUrl: null })}
                      className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-xl border border-rose-500/20 transition-colors cursor-pointer"
                      title="Remove custom image"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 py-2">
                  <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto border border-amber-500/20">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-xs font-bold text-amber-400 hover:text-amber-300 underline underline-offset-2 cursor-pointer"
                    >
                      Click to upload
                    </button>
                    <span className="text-xs text-slate-400"> or drag and drop</span>
                  </div>
                  <p className="text-[10px] text-slate-500">
                    Recommended 1920×1080 or 1024×576 PNG / WebP (Max 10MB)
                  </p>
                </div>
              )}
            </div>

            {uploadError && (
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}
          </div>
        )}

        {/* Background Overlay Dimming Slider */}
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <Sliders className="w-3.5 h-3.5 text-slate-400" />
              <span className="font-semibold text-slate-300">Background Overlay Dimming</span>
            </div>
            <span className="font-mono text-amber-400 font-bold">
              {Math.round(currentOverlayOpacity * 100)}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={0.9}
            step={0.05}
            value={currentOverlayOpacity}
            onChange={(e) =>
              handleUpdateBackground({ backgroundOverlayOpacity: parseFloat(e.target.value) })
            }
            className="w-full accent-amber-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
          />
          <p className="text-[10px] text-slate-500">
            Darks the background to ensure high contrast for result cards and scores.
          </p>
        </div>
      </div>

      {/* 2. TITLE & MESSAGE SETTINGS CARD */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-4 shadow-lg">
        <div className="flex items-center gap-2">
          <span className="p-2 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
            <Type className="w-4 h-4" />
          </span>
          <div>
            <h4 className="text-sm font-bold text-slate-100">Result Screen Text &amp; Labels</h4>
            <p className="text-xs text-slate-400">
              Customize headline greetings and button text
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 block">Headline Title</label>
            <input
              type="text"
              value={currentTitle}
              onChange={(e) => handleUpdateTitleText(e.target.value)}
              placeholder={isCatch ? 'GAME OVER!' : isReaction ? 'GREAT REFLEXES!' : 'VICTORY!'}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 block">Play Again Button</label>
            <input
              type="text"
              defaultValue={currentBtnText}
              onChange={(e) => handleUpdateButtonText(e.target.value)}
              placeholder="PLAY AGAIN"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>
      </div>

      {/* 3. STATISTICS & ELEMENTS VISIBILITY TOGGLES CARD */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-4 shadow-lg">
        <div className="flex items-center gap-2">
          <span className="p-2 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
            <Trophy className="w-4 h-4" />
          </span>
          <div>
            <h4 className="text-sm font-bold text-slate-100">Result Statistics &amp; Elements</h4>
            <p className="text-xs text-slate-400">
              Toggle visibility for supported result screen elements and performance metrics
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* CATCH THE BRAND ELEMENTS */}
          {isCatch && (
            <>
              {/* Final Score */}
              {(() => {
                const isVis =
                  findResultScreenElementVisibility(elements, 'stat-score') !== false &&
                  resultConfig.showScore !== false;
                return (
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-emerald-400 shrink-0">
                        <Trophy className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-slate-200 block truncate">Final Score</span>
                        <span className="text-[10px] text-slate-400 block truncate">Total brand points collected</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isVis}
                      onClick={() => handleToggleElementVisibility('stat-score', isVis)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                        isVis ? 'bg-emerald-500' : 'bg-slate-800'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          isVis ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                );
              })()}

              {/* Time Elapsed */}
              {(() => {
                const isVis = findResultScreenElementVisibility(elements, 'stat-time') !== false;
                return (
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-sky-400 shrink-0">
                        <Clock className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-slate-200 block truncate">Time Elapsed</span>
                        <span className="text-[10px] text-slate-400 block truncate">Active catching duration</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isVis}
                      onClick={() => handleToggleElementVisibility('stat-time', isVis)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                        isVis ? 'bg-emerald-500' : 'bg-slate-800'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          isVis ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                );
              })()}

              {/* Catch Accuracy */}
              {(() => {
                const isVis =
                  findResultScreenElementVisibility(elements, 'stat-accuracy') !== false &&
                  resultConfig.showAccuracy !== false;
                return (
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-amber-400 shrink-0">
                        <Target className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-slate-200 block truncate">Catch Accuracy</span>
                        <span className="text-[10px] text-slate-400 block truncate">Good items caught vs missed</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isVis}
                      onClick={() => handleToggleElementVisibility('stat-accuracy', isVis)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                        isVis ? 'bg-emerald-500' : 'bg-slate-800'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          isVis ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                );
              })()}

              {/* Event Leaderboard */}
              {(() => {
                const isVis = findResultScreenElementVisibility(elements, 'leaderboard-catch') !== false;
                return (
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-violet-400 shrink-0">
                        <Trophy className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-slate-200 block truncate">Event Leaderboard</span>
                        <span className="text-[10px] text-slate-400 block truncate">Top ranking players list</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isVis}
                      onClick={() => handleToggleElementVisibility('leaderboard-catch', isVis)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                        isVis ? 'bg-emerald-500' : 'bg-slate-800'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          isVis ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                );
              })()}

              {/* Play Again Button */}
              {(() => {
                const isVis = findResultScreenElementVisibility(elements, 'btn-play-again') !== false;
                return (
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-amber-400 shrink-0">
                        <Play className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-slate-200 block truncate">Play Again Button</span>
                        <span className="text-[10px] text-slate-400 block truncate">Replay game action trigger</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isVis}
                      onClick={() => handleToggleElementVisibility('btn-play-again', isVis)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                        isVis ? 'bg-emerald-500' : 'bg-slate-800'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          isVis ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                );
              })()}
            </>
          )}

          {/* MEMORY MATCH ELEMENTS */}
          {isMemory && (
            <>
              {/* Final Score */}
              {(() => {
                const isVis =
                  findResultScreenElementVisibility(elements, 'stat-score') !== false &&
                  resultConfig.showScore !== false;
                return (
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-amber-400 shrink-0">
                        <Trophy className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-slate-200 block truncate">Final Score</span>
                        <span className="text-[10px] text-slate-400 block truncate">Total score and combo points</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isVis}
                      onClick={() => handleToggleElementVisibility('stat-score', isVis)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                        isVis ? 'bg-emerald-500' : 'bg-slate-800'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          isVis ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                );
              })()}

              {/* Moves Count */}
              {(() => {
                const isVis =
                  findResultScreenElementVisibility(elements, 'stat-moves') !== false &&
                  resultConfig.showMoves !== false;
                return (
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-cyan-400 shrink-0">
                        <Clock className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-slate-200 block truncate">Moves Count</span>
                        <span className="text-[10px] text-slate-400 block truncate">Total card flip attempts</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isVis}
                      onClick={() => handleToggleElementVisibility('stat-moves', isVis)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                        isVis ? 'bg-emerald-500' : 'bg-slate-800'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          isVis ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                );
              })()}

              {/* Pairs Matched */}
              {(() => {
                const isVis =
                  findResultScreenElementVisibility(elements, 'stat-pairs') !== false &&
                  resultConfig.showPairs !== false;
                return (
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-emerald-400 shrink-0">
                        <Layers className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-slate-200 block truncate">Pairs Matched</span>
                        <span className="text-[10px] text-slate-400 block truncate">Completed card pairs</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isVis}
                      onClick={() => handleToggleElementVisibility('stat-pairs', isVis)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                        isVis ? 'bg-emerald-500' : 'bg-slate-800'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          isVis ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                );
              })()}

              {/* Accuracy Rate */}
              {(() => {
                const isVis =
                  findResultScreenElementVisibility(elements, 'stat-accuracy') !== false &&
                  resultConfig.showAccuracy !== false;
                return (
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-violet-400 shrink-0">
                        <Zap className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-slate-200 block truncate">Accuracy Rate</span>
                        <span className="text-[10px] text-slate-400 block truncate">Matching precision percentage</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isVis}
                      onClick={() => handleToggleElementVisibility('stat-accuracy', isVis)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                        isVis ? 'bg-emerald-500' : 'bg-slate-800'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          isVis ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                );
              })()}

              {/* Event Leaderboard */}
              {(() => {
                const isVis = findResultScreenElementVisibility(elements, 'leaderboard-memory') !== false;
                return (
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-violet-400 shrink-0">
                        <Trophy className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-slate-200 block truncate">Event Leaderboard</span>
                        <span className="text-[10px] text-slate-400 block truncate">Top ranking players list</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isVis}
                      onClick={() => handleToggleElementVisibility('leaderboard-memory', isVis)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                        isVis ? 'bg-emerald-500' : 'bg-slate-800'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          isVis ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                );
              })()}

              {/* Play Again Button */}
              {(() => {
                const isVis = findResultScreenElementVisibility(elements, 'btn-play-again') !== false;
                return (
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-amber-400 shrink-0">
                        <Play className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-slate-200 block truncate">Play Again Button</span>
                        <span className="text-[10px] text-slate-400 block truncate">Replay game action trigger</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isVis}
                      onClick={() => handleToggleElementVisibility('btn-play-again', isVis)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                        isVis ? 'bg-emerald-500' : 'bg-slate-800'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          isVis ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                );
              })()}
            </>
          )}

          {/* FORMULA (REACTION LIGHTS) ELEMENTS */}
          {isReaction && (
            <>
              {/* Average Reaction Time */}
              {(() => {
                const isVis = findResultScreenElementVisibility(elements, 'metric-avg-reaction') !== false;
                return (
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-amber-400 shrink-0">
                        <Timer className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-slate-200 block truncate">Average Reaction Time</span>
                        <span className="text-[10px] text-slate-400 block truncate">Primary reflex benchmark metric</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isVis}
                      onClick={() => handleToggleElementVisibility('metric-avg-reaction', isVis)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                        isVis ? 'bg-emerald-500' : 'bg-slate-800'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          isVis ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                );
              })()}

              {/* Best Reaction Time */}
              {(() => {
                const isVis = findResultScreenElementVisibility(elements, 'metric-best-reaction') !== false;
                return (
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-emerald-400 shrink-0">
                        <Zap className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-slate-200 block truncate">Best Reaction</span>
                        <span className="text-[10px] text-slate-400 block truncate">Fastest single round reflex</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isVis}
                      onClick={() => handleToggleElementVisibility('metric-best-reaction', isVis)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                        isVis ? 'bg-emerald-500' : 'bg-slate-800'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          isVis ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                );
              })()}

              {/* Worst Reaction Time */}
              {(() => {
                const isVis = findResultScreenElementVisibility(elements, 'metric-worst-reaction') !== false;
                return (
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-rose-400 shrink-0">
                        <Clock className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-slate-200 block truncate">Worst Reaction</span>
                        <span className="text-[10px] text-slate-400 block truncate">Slowest reaction or penalty</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isVis}
                      onClick={() => handleToggleElementVisibility('metric-worst-reaction', isVis)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                        isVis ? 'bg-emerald-500' : 'bg-slate-800'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          isVis ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                );
              })()}

              {/* Round Results Breakdown */}
              {(() => {
                const isVis = findResultScreenElementVisibility(elements, 'round-results-breakdown') !== false;
                return (
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-sky-400 shrink-0">
                        <Gauge className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-slate-200 block truncate">Round Results</span>
                        <span className="text-[10px] text-slate-400 block truncate">Individual 5-round reaction times</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isVis}
                      onClick={() => handleToggleElementVisibility('round-results-breakdown', isVis)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                        isVis ? 'bg-emerald-500' : 'bg-slate-800'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          isVis ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                );
              })()}

              {/* Reaction Rating Tier */}
              {(() => {
                const isVis = findResultScreenElementVisibility(elements, 'metric-rating') !== false;
                return (
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-yellow-400 shrink-0">
                        <Trophy className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-slate-200 block truncate">Reaction Tier Rating</span>
                        <span className="text-[10px] text-slate-400 block truncate">Godlike, F1 Driver, Fast tier</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isVis}
                      onClick={() => handleToggleElementVisibility('metric-rating', isVis)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                        isVis ? 'bg-emerald-500' : 'bg-slate-800'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          isVis ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                );
              })()}

              {/* Event Leaderboard */}
              {(() => {
                const isVis = findResultScreenElementVisibility(elements, 'leaderboard-reaction') !== false;
                return (
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-violet-400 shrink-0">
                        <Trophy className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-slate-200 block truncate">Event Leaderboard</span>
                        <span className="text-[10px] text-slate-400 block truncate">Top ranking reaction scores</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isVis}
                      onClick={() => handleToggleElementVisibility('leaderboard-reaction', isVis)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                        isVis ? 'bg-emerald-500' : 'bg-slate-800'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          isVis ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                );
              })()}

              {/* Play Again Button */}
              {(() => {
                const isVis = findResultScreenElementVisibility(elements, 'btn-play-again') !== false;
                return (
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-amber-400 shrink-0">
                        <Play className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-slate-200 block truncate">Play Again Button</span>
                        <span className="text-[10px] text-slate-400 block truncate">Replay game action trigger</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isVis}
                      onClick={() => handleToggleElementVisibility('btn-play-again', isVis)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                        isVis ? 'bg-emerald-500' : 'bg-slate-800'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          isVis ? 'translate-x-5' : 'translate-x-0'
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
