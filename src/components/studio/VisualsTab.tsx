import React, { useState, useRef } from 'react';
import { useLocalization } from '../../context/LocalizationContext';
import {
  GameTheme,
  isMemoryMatchTheme,
  isCatcherGameTheme,
  getMemoryMatchConfig,
  CARD_FRONT_BG_PRESETS,
  CARD_GOOD_BG_PRESETS,
  getCardFrontBg,
  getCardGoodBg,
} from '../../themes';
import {
  Layers,
  Sparkles,
  Upload,
  ChevronDown,
  ChevronUp,
  Sliders,
  Info,
  Trash2,
  Image as ImageIcon,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';

export const PRESET_CATCHERS = [
  { name: 'Woven Basket', url: '/assets/basket.png' },
  { name: 'Holiday Sleigh', url: 'https://images.unsplash.com/photo-1543258103-a62bdc069871?auto=format&fit=crop&w=300&q=80' },
  { name: 'Lunar Tray', url: 'https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&w=300&q=80' },
  { name: 'Cauldron', url: 'https://images.unsplash.com/photo-1509557965875-b88c97052f0e?auto=format&fit=crop&w=300&q=80' },
];

interface VisualsTabProps {
  theme: GameTheme;
  onChange: (updated: GameTheme) => void;
  onUploadAsset: (file: File, fieldKey: string) => Promise<string>;
  uploadingAsset: string | null;
}

const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
const ALLOWED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'];

export const VisualsTab: React.FC<VisualsTabProps> = ({
  theme,
  onChange,
  onUploadAsset,
  uploadingAsset,
}) => {
  const { t } = useLocalization();
  const [showAdvancedBasket, setShowAdvancedBasket] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dimensionNotice, setDimensionNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const replaceFileInputRef = useRef<HTMLInputElement | null>(null);

  // Catcher Artwork upload state & refs
  const [catcherDragActive, setCatcherDragActive] = useState(false);
  const [catcherUploadError, setCatcherUploadError] = useState<string | null>(null);
  const catcherFileInputRef = useRef<HTMLInputElement | null>(null);
  const catcherReplaceFileInputRef = useRef<HTMLInputElement | null>(null);

  const isMemoryMatch = isMemoryMatchTheme(theme);
  const isCatcherGame = isCatcherGameTheme(theme);

  const currentBgUrl = theme.background_url || theme.background || '';
  const currentCardBackUrl = theme.visuals_config?.cardBackUrl || theme.basket_config?.imageUrl || theme.basket || '';
  const currentCatcherUrl = currentCardBackUrl;

  const processBackgroundFile = async (file: File) => {
    setUploadError(null);
    setDimensionNotice(null);

    // 1. Validate file format
    const extension = '.' + (file.name.split('.').pop() || '').toLowerCase();
    const isValidFormat =
      ALLOWED_MIME_TYPES.includes(file.type.toLowerCase()) ||
      ALLOWED_EXTENSIONS.includes(extension);

    if (!isValidFormat) {
      setUploadError(
        `Unsupported file format "${file.name}". Please upload a PNG, JPG/JPEG, or WebP image.`
      );
      return;
    }

    // 2. Validate file size (10MB limit)
    if (file?.size && file.size > 10 * 1024 * 1024) {
      setUploadError(
        `File is too large (${((file.size || 0) / (1024 * 1024)).toFixed(1)}MB). Maximum allowed size is 10MB.`
      );
      return;
    }

    // 3. Inspect image dimensions and check aspect ratio
    try {
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to read image dimensions'));
        img.src = objectUrl;
      });

      const width = img.naturalWidth;
      const height = img.naturalHeight;
      const ratio = width / (height || 1);
      const targetRatio = 16 / 9; // 1.7778

      if (Math.abs(ratio - targetRatio) > 0.15) {
        setDimensionNotice(
          `Image is ${width}×${height}px (~${(Number(ratio) || 1).toFixed(2)}:1). Recommended aspect ratio is 16:9 (1024×576px). It will be scaled to fit the game canvas.`
        );
      } else {
        setDimensionNotice(`Optimal 16:9 aspect ratio detected (${width}×${height}px).`);
      }

      URL.revokeObjectURL(objectUrl);
    } catch (dimErr) {
      console.warn('Could not inspect image dimensions:', dimErr);
    }

    // 4. Upload to Supabase Storage game-assets bucket
    try {
      const uploadedUrl = await onUploadAsset(file, 'background');
      onChange({
        ...theme,
        background_url: uploadedUrl,
        background: uploadedUrl,
      });
    } catch (err: any) {
      setUploadError(err.message || 'Failed to upload background image');
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processBackgroundFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processBackgroundFile(e.target.files[0]);
      e.target.value = '';
    }
  };

  const handleRemoveBackground = () => {
    setUploadError(null);
    setDimensionNotice(null);
    onChange({
      ...theme,
      background_url: '',
      background: '',
    });
  };

  const processCatcherFile = async (file: File) => {
    setCatcherUploadError(null);

    // 1. Validate file format
    const extension = '.' + (file.name.split('.').pop() || '').toLowerCase();
    const isValidFormat =
      ALLOWED_MIME_TYPES.includes(file.type.toLowerCase()) ||
      ALLOWED_EXTENSIONS.includes(extension) ||
      file.type === 'image/svg+xml';

    if (!isValidFormat) {
      setCatcherUploadError(
        `Unsupported file format "${file.name}". Please upload a PNG, WebP, or JPG image.`
      );
      return;
    }

    // 2. Validate file size (10MB limit)
    if (file?.size && file.size > 10 * 1024 * 1024) {
      setCatcherUploadError(
        `File is too large (${((file.size || 0) / (1024 * 1024)).toFixed(1)}MB). Maximum allowed size is 10MB.`
      );
      return;
    }

    // 3. Upload using onUploadAsset(file, 'basket')
    try {
      const uploadedUrl = await onUploadAsset(file, 'basket');
      const nextGameConfig = isMemoryMatch
        ? {
            ...getMemoryMatchConfig(theme),
            cardBackUrl: uploadedUrl,
          }
        : theme.game_config;

      onChange({
        ...theme,
        game_config: nextGameConfig,
        basket: uploadedUrl,
        basket_config: {
          ...theme.basket_config,
          imageUrl: uploadedUrl,
        },
        visuals_config: {
          ...theme.visuals_config,
          cardBackUrl: uploadedUrl,
        },
      });
    } catch (err: any) {
      setCatcherUploadError(err.message || 'Failed to upload image');
    }
  };

  const handleCatcherDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setCatcherDragActive(true);
    } else if (e.type === 'dragleave') {
      setCatcherDragActive(false);
    }
  };

  const handleCatcherDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCatcherDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processCatcherFile(e.dataTransfer.files[0]);
    }
  };

  const handleCatcherFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processCatcherFile(e.target.files[0]);
      e.target.value = '';
    }
  };

  const handleRemoveCatcher = () => {
    setCatcherUploadError(null);
    const nextGameConfig = isMemoryMatch
      ? {
          ...getMemoryMatchConfig(theme),
          cardBackUrl: null,
        }
      : theme.game_config;

    onChange({
      ...theme,
      game_config: nextGameConfig,
      basket: '',
      basket_config: {
        ...theme.basket_config,
        imageUrl: '',
      },
      visuals_config: {
        ...theme.visuals_config,
        cardBackUrl: null,
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* 1. GAME BACKGROUND CANVAS (FILE-UPLOAD-ONLY INTERFACE) */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="p-2 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
              <Layers className="w-4 h-4" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-100">{t('studio.gameBackgroundCanvas')}</h3>
              <p className="text-xs text-slate-400">
                {t('studio.visualEditor')}
              </p>
            </div>
          </div>
        </div>

        {/* ERROR MESSAGE DISPLAY */}
        {uploadError && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-start gap-2.5 text-xs text-rose-300">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1">{uploadError}</div>
          </div>
        )}

        {/* DIMENSION & ASPECT RATIO NOTICE */}
        {dimensionNotice && !uploadError && (
          <div className="p-3 bg-slate-950 border border-slate-800 rounded-2xl flex items-start gap-2.5 text-xs text-slate-300">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div className="flex-1">{dimensionNotice}</div>
          </div>
        )}

        {/* IF BACKGROUND IS UPLOADED: SHOW PREVIEW WITH REPLACE & REMOVE ACTIONS */}
        {currentBgUrl ? (
          <div className="space-y-3">
            <div className="relative rounded-2xl overflow-hidden aspect-video border-2 border-slate-700 bg-slate-950 group shadow-md">
              <img
                src={currentBgUrl}
                alt="Game Background Preview"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-black/20 opacity-80 group-hover:opacity-90 transition-opacity" />

              {/* Status Badge */}
              <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900/90 border border-slate-700/80 text-[11px] font-semibold text-slate-200 backdrop-blur-sm">
                <ImageIcon className="w-3 h-3 text-amber-400" />
                <span>{t('studio.activeBackground')}</span>
              </div>

              {/* Dimensions hint badge */}
              <div className="absolute bottom-3 left-3 px-2.5 py-1 rounded-lg bg-slate-950/90 border border-slate-800 text-[11px] font-mono text-slate-300 backdrop-blur-sm">
                16:9 Canvas Resolution
              </div>

              {/* Overlay loading state if replacing */}
              {uploadingAsset === 'background' && (
                <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center gap-2 text-amber-400">
                  <RefreshCw className="w-6 h-6 animate-spin" />
                  <span className="text-xs font-bold text-slate-200">{t('studio.uploadingNewBackground')}</span>
                </div>
              )}
            </div>

            {/* Actions Toolbar */}
            <div className="flex items-center justify-between gap-3 pt-1">
              <div className="text-xs text-slate-400">
                Format: <span className="text-slate-200 font-medium">PNG / JPG / WebP</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  ref={replaceFileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  className="hidden"
                  disabled={uploadingAsset === 'background'}
                  onChange={handleFileInputChange}
                />
                <button
                  type="button"
                  onClick={() => replaceFileInputRef.current?.click()}
                  disabled={uploadingAsset === 'background'}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 text-xs font-bold rounded-xl border border-slate-700 flex items-center gap-2 transition-all cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${uploadingAsset === 'background' ? 'animate-spin' : ''}`} />
                  <span>{uploadingAsset === 'background' ? '...' : t('studio.uploadImage')}</span>
                </button>

                <button
                  type="button"
                  onClick={handleRemoveBackground}
                  disabled={uploadingAsset === 'background'}
                  className="px-3.5 py-2 bg-rose-500/10 hover:bg-rose-500/20 active:scale-95 text-rose-400 text-xs font-bold rounded-xl border border-rose-500/20 flex items-center gap-2 transition-all cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{t('common.remove')}</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* IF NO BACKGROUND: SHOW DRAG & DROP / FILE UPLOAD CONTROL */
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`cursor-pointer rounded-2xl border-2 border-dashed p-8 transition-all flex flex-col items-center justify-center text-center gap-3 ${
              dragActive
                ? 'border-amber-400 bg-amber-500/10 scale-[1.01]'
                : 'border-slate-800 hover:border-slate-700 bg-slate-950/60 hover:bg-slate-950'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp"
              className="hidden"
              disabled={uploadingAsset === 'background'}
              onChange={handleFileInputChange}
            />

            <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-amber-400 shadow-md">
              {uploadingAsset === 'background' ? (
                <RefreshCw className="w-6 h-6 animate-spin" />
              ) : (
                <Upload className="w-6 h-6" />
              )}
            </div>

            <div className="space-y-1">
              <p className="text-xs font-bold text-slate-200">
                {uploadingAsset === 'background'
                  ? 'Uploading background image...'
                  : dragActive
                  ? 'Drop your background image here'
                  : 'Click to upload or drag & drop background'}
              </p>
              <p className="text-[11px] text-slate-400">
                PNG, JPG/JPEG, or WebP image files supported (up to 10MB)
              </p>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <span className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-[10px] font-mono text-amber-400 font-semibold">
                16:9 Aspect Ratio
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-[10px] font-mono text-slate-300">
                1024 × 576 px Recommended
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 2. CATCHER OR MEMORY MATCH CARD BACK */}
      {isMemoryMatch && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-5 shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
                <Sparkles className="w-4 h-4" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-slate-100">{t('studio.cardBackArtworkAndDeckStyling')}</h3>
                <p className="text-xs text-slate-400">
                  {t('studio.cardPairs')}
                </p>
              </div>
            </div>
          </div>

          {/* Card Back Visual Upload / Preview Section */}
          <div className="space-y-2.5">
            <label className="text-xs font-semibold text-slate-300">{t('studio.cardBackFaceArtwork')}</label>

            {catcherUploadError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-start gap-2.5 text-xs text-rose-300">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div className="flex-1">{catcherUploadError}</div>
              </div>
            )}

            {currentCardBackUrl ? (
              <div className="space-y-3">
                <div className="relative rounded-2xl overflow-hidden border-2 border-slate-700 bg-slate-950/90 p-6 flex flex-col items-center justify-center min-h-[160px] max-h-[220px] group shadow-inner">
                  <div className="w-24 h-32 rounded-xl bg-slate-900 border-2 border-amber-500/60 p-2 flex items-center justify-center overflow-hidden shadow-xl group-hover:scale-105 transition-transform">
                    <img
                      src={currentCardBackUrl}
                      alt="Card Back Preview"
                      className="max-h-full max-w-full object-contain filter drop-shadow-md"
                      referrerPolicy="no-referrer"
                    />
                  </div>

                  {uploadingAsset === 'basket' && (
                    <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center gap-2 text-amber-400 z-20">
                      <RefreshCw className="w-6 h-6 animate-spin" />
                      <span className="text-xs font-bold text-slate-200">{t('studio.tabs.uploadingNewCardBack')}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2">
                  <input
                    ref={catcherReplaceFileInputRef}
                    type="file"
                    accept="image/png,image/webp,image/jpeg,image/jpg"
                    className="hidden"
                    disabled={uploadingAsset === 'basket'}
                    onChange={handleCatcherFileInputChange}
                  />
                  <button
                    type="button"
                    onClick={() => catcherReplaceFileInputRef.current?.click()}
                    disabled={uploadingAsset === 'basket'}
                    className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 text-xs font-bold rounded-xl border border-slate-700 flex items-center gap-2 transition-all disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${uploadingAsset === 'basket' ? 'animate-spin' : ''}`} />
                    <span>{uploadingAsset === 'basket' ? t('common.uploading') : t('customizers.replaceArtwork', undefined, 'Replace Card Back')}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleRemoveCatcher}
                    disabled={uploadingAsset === 'basket'}
                    className="px-3.5 py-2 bg-rose-500/10 hover:bg-rose-500/20 active:scale-95 text-rose-400 text-xs font-bold rounded-xl border border-rose-500/20 flex items-center gap-2 transition-all disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{t('common.remove')}</span>
                  </button>
                </div>
              </div>
            ) : (
              <div
                onDragEnter={handleCatcherDrag}
                onDragLeave={handleCatcherDrag}
                onDragOver={handleCatcherDrag}
                onDrop={handleCatcherDrop}
                onClick={() => catcherFileInputRef.current?.click()}
                className={`cursor-pointer rounded-2xl border-2 border-dashed p-8 transition-all flex flex-col items-center justify-center text-center gap-3 ${
                  catcherDragActive
                    ? 'border-emerald-400 bg-emerald-500/10 scale-[1.01]'
                    : 'border-slate-800 hover:border-slate-700 bg-slate-950/60 hover:bg-slate-950'
                }`}
              >
                <input
                  ref={catcherFileInputRef}
                  type="file"
                  accept="image/png,image/webp,image/jpeg,image/jpg"
                  className="hidden"
                  disabled={uploadingAsset === 'basket'}
                  onChange={handleCatcherFileInputChange}
                />

                <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-emerald-400 shadow-md">
                  {uploadingAsset === 'basket' ? (
                    <RefreshCw className="w-6 h-6 animate-spin" />
                  ) : (
                    <Upload className="w-6 h-6" />
                  )}
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-bold text-slate-200">
                    {uploadingAsset === 'basket'
                      ? 'Uploading card back image...'
                      : catcherDragActive
                      ? 'Drop card back image here'
                      : 'Upload Custom Card Back'}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    PNG / WebP (leave empty to use default carnival geometric pattern)
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Card Front Background Customization */}
          <div className="bg-slate-950 border border-slate-800/90 rounded-2xl p-4 space-y-4 shadow-sm pt-4 border-t border-slate-800/80">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-200">{t('studio.tabs.cardFrontBackground')}</span>
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[10px] font-bold">
                    {t('studio.tabs.faceUp')}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Solid or semi-transparent background color shown when cards are flipped open
                </p>
              </div>

              {/* Reset to Default Button */}
              <button
                type="button"
                onClick={() => {
                  onChange({
                    ...theme,
                    visuals_config: {
                      ...theme.visuals_config,
                      cardFrontBg: '#0F172A',
                      cardFrontBgOpacity: 0.95,
                    },
                  });
                }}
                className="self-start sm:self-auto px-2.5 py-1 text-[11px] font-semibold text-slate-400 hover:text-slate-200 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg transition-colors flex items-center gap-1"
                title={t('studio.tabs.resetCardFrontBgTitle')}
              >
                <RotateCcw className="w-3 h-3" />
                <span>{t('common.reset')}</span>
              </button>
            </div>

            {/* Main Interactive Controls & Live Mini Card Preview */}
            <div className="flex flex-col md:flex-row items-center gap-4">
              {/* Mini Face-Up Preview Card */}
              <div
                className="w-24 h-32 rounded-2xl border-2 flex flex-col items-center justify-between p-2 shadow-lg shrink-0 transition-all"
                style={{
                  backgroundColor: getCardFrontBg(
                    theme.visuals_config?.cardFrontBg || '#0F172A',
                    theme.visuals_config?.cardFrontBgOpacity ?? 0.95
                  ),
                  borderColor: theme.visuals_config?.cardBadBorder || '#f59e0b',
                }}
              >
                <div className="w-full flex justify-end">
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-400/80" />
                </div>
                <div className="flex flex-col items-center justify-center gap-1">
                  <Sparkles className="w-6 h-6 text-amber-400 animate-pulse" />
                  <span className="text-[9px] font-bold text-slate-200">{t('studio.tabs.faceUp')}</span>
                </div>
                <span className="text-[8px] font-mono text-slate-400/90">
                  {Math.round((theme.visuals_config?.cardFrontBgOpacity ?? 0.95) * 100)}%
                </span>
              </div>

              {/* Controls Column */}
              <div className="flex-1 w-full space-y-3">
                {/* Color Input & Hex Code */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-slate-300">{t('customizers.backgroundColor')}</label>
                  <div className="flex items-center gap-2">
                    <div className="relative w-9 h-9 rounded-xl border border-slate-700 overflow-hidden shrink-0 shadow-inner bg-slate-900">
                      <input
                        type="color"
                        value={
                          theme.visuals_config?.cardFrontBg?.startsWith('#') && theme.visuals_config.cardFrontBg.length === 7
                            ? theme.visuals_config.cardFrontBg
                            : '#0F172A'
                        }
                        onChange={(e) => {
                          onChange({
                            ...theme,
                            visuals_config: {
                              ...theme.visuals_config,
                              cardFrontBg: e.target.value.toUpperCase(),
                            },
                          });
                        }}
                        className="absolute -top-2 -left-2 w-14 h-14 cursor-pointer border-0 bg-transparent"
                      />
                    </div>
                    <div className="relative flex-1">
                      <input
                        type="text"
                        value={theme.visuals_config?.cardFrontBg || '#0F172A'}
                        onChange={(e) => {
                          const val = e.target.value;
                          onChange({
                            ...theme,
                            visuals_config: {
                              ...theme.visuals_config,
                              cardFrontBg: val,
                            },
                          });
                        }}
                        placeholder="#0F172A"
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 font-mono tracking-wider focus:outline-none focus:border-amber-500/70"
                      />
                    </div>
                  </div>
                </div>

                {/* Preset Color Swatches */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    Quick Color Presets
                  </label>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {CARD_FRONT_BG_PRESETS.map((preset) => {
                      const isSelected =
                        (theme.visuals_config?.cardFrontBg || '#0F172A').toUpperCase() === preset.hex.toUpperCase();
                      return (
                        <button
                          key={preset.name}
                          type="button"
                          onClick={() => {
                            onChange({
                              ...theme,
                              visuals_config: {
                                ...theme.visuals_config,
                                cardFrontBg: preset.hex,
                              },
                            });
                          }}
                          className={`group relative flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[11px] font-medium transition-all ${
                            isSelected
                              ? 'border-amber-400 bg-amber-500/10 text-amber-300 ring-1 ring-amber-400/40'
                              : 'border-slate-800 bg-slate-900/80 hover:bg-slate-800 text-slate-300'
                          }`}
                          title={t('studio.setBackgroundToPreset', { name: preset.name, hex: preset.hex }, `Set background to ${preset.name} (${preset.hex})`)}
                        >
                          <span
                            className="w-3 h-3 rounded-full border border-white/20 shadow-sm shrink-0"
                            style={{ backgroundColor: preset.hex }}
                          />
                          <span>{preset.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Opacity Slider */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-slate-300">{t('customizers.backgroundOpacity')}</span>
                    <span className="font-mono text-amber-400 font-bold">
                      {Math.round((theme.visuals_config?.cardFrontBgOpacity ?? 0.95) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={theme.visuals_config?.cardFrontBgOpacity ?? 0.95}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      onChange({
                        ...theme,
                        visuals_config: {
                          ...theme.visuals_config,
                          cardFrontBgOpacity: isNaN(val) ? 0.95 : Math.max(0, Math.min(1, val)),
                        },
                      });
                    }}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                  />
                  <div className="flex items-center justify-between text-[10px] text-slate-500">
                    <span>{t('customizers.transparent')}</span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          onChange({
                            ...theme,
                            visuals_config: { ...theme.visuals_config, cardFrontBgOpacity: 0.5 },
                          })
                        }
                        className="hover:text-amber-400"
                      >
                        50%
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onChange({
                            ...theme,
                            visuals_config: { ...theme.visuals_config, cardFrontBgOpacity: 0.8 },
                          })
                        }
                        className="hover:text-amber-400"
                      >
                        80%
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onChange({
                            ...theme,
                            visuals_config: { ...theme.visuals_config, cardFrontBgOpacity: 0.95 },
                          })
                        }
                        className="hover:text-amber-400"
                      >
                        95%
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onChange({
                            ...theme,
                            visuals_config: { ...theme.visuals_config, cardFrontBgOpacity: 1.0 },
                          })
                        }
                        className="hover:text-amber-400"
                      >
                        100%
                      </button>
                    </div>
                    <span>{t('customizers.solid')}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Match Success Background (Successfully Matched State) */}
          <div className="bg-slate-950 border border-slate-800/90 rounded-2xl p-4 space-y-4 shadow-sm pt-4 border-t border-slate-800/80">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-200">{t('studio.tabs.matchSuccessBackground')}</span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
                    {t('studio.tabs.matched')}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Solid or semi-transparent background color displayed on cards after they are successfully matched
                </p>
              </div>

              {/* Reset to Default Button */}
              <button
                type="button"
                onClick={() => {
                  onChange({
                    ...theme,
                    visuals_config: {
                      ...theme.visuals_config,
                      cardGoodBg: '#064E3B',
                      cardGoodBgOpacity: 0.85,
                    },
                  });
                }}
                className="self-start sm:self-auto px-2.5 py-1 text-[11px] font-semibold text-slate-400 hover:text-slate-200 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg transition-colors flex items-center gap-1"
                title={t('studio.tabs.resetMatchSuccessBgTitle')}
              >
                <RotateCcw className="w-3 h-3" />
                <span>{t('common.reset')}</span>
              </button>
            </div>

            {/* Main Interactive Controls & Live Mini Card Preview */}
            <div className="flex flex-col md:flex-row items-center gap-4">
              {/* Mini Matched Preview Card */}
              <div
                className="w-24 h-32 rounded-2xl border-2 flex flex-col items-center justify-between p-2 shadow-lg shrink-0 transition-all relative"
                style={{
                  backgroundColor: getCardGoodBg(
                    theme.visuals_config?.cardGoodBg || '#064E3B',
                    theme.visuals_config?.cardGoodBgOpacity ?? 0.85
                  ),
                  borderColor: theme.visuals_config?.cardGoodBorder || '#10b981',
                }}
              >
                <div className="w-full flex justify-end">
                  <div className="w-4 h-4 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center shadow">
                    <CheckCircle2 className="w-3 h-3" />
                  </div>
                </div>
                <div className="flex flex-col items-center justify-center gap-1">
                  <Sparkles className="w-6 h-6 text-emerald-400 animate-pulse" />
                  <span className="text-[9px] font-bold text-emerald-200">{t('studio.tabs.matched')}</span>
                </div>
                <span className="text-[8px] font-mono text-emerald-300/90">
                  {Math.round((theme.visuals_config?.cardGoodBgOpacity ?? 0.85) * 100)}%
                </span>
              </div>

              {/* Controls Column */}
              <div className="flex-1 w-full space-y-3">
                {/* Color Input & Hex Code */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-slate-300">{t('customizers.backgroundColor')}</label>
                  <div className="flex items-center gap-2">
                    <div className="relative w-9 h-9 rounded-xl border border-slate-700 overflow-hidden shrink-0 shadow-inner bg-slate-900">
                      <input
                        type="color"
                        value={
                          theme.visuals_config?.cardGoodBg?.startsWith('#') && theme.visuals_config.cardGoodBg.length === 7
                            ? theme.visuals_config.cardGoodBg
                            : '#064E3B'
                        }
                        onChange={(e) => {
                          onChange({
                            ...theme,
                            visuals_config: {
                              ...theme.visuals_config,
                              cardGoodBg: e.target.value.toUpperCase(),
                            },
                          });
                        }}
                        className="absolute -top-2 -left-2 w-14 h-14 cursor-pointer border-0 bg-transparent"
                      />
                    </div>
                    <div className="relative flex-1">
                      <input
                        type="text"
                        value={theme.visuals_config?.cardGoodBg || '#064E3B'}
                        onChange={(e) => {
                          const val = e.target.value;
                          onChange({
                            ...theme,
                            visuals_config: {
                              ...theme.visuals_config,
                              cardGoodBg: val,
                            },
                          });
                        }}
                        placeholder="#064E3B"
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 font-mono tracking-wider focus:outline-none focus:border-emerald-500/70"
                      />
                    </div>
                  </div>
                </div>

                {/* Preset Color Swatches */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    Quick Color Presets
                  </label>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {CARD_GOOD_BG_PRESETS.map((preset) => {
                      const isSelected =
                        (theme.visuals_config?.cardGoodBg || '#064E3B').toUpperCase() === preset.hex.toUpperCase();
                      return (
                        <button
                          key={preset.name}
                          type="button"
                          onClick={() => {
                            onChange({
                              ...theme,
                              visuals_config: {
                                ...theme.visuals_config,
                                cardGoodBg: preset.hex,
                              },
                            });
                          }}
                          className={`group relative flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[11px] font-medium transition-all ${
                            isSelected
                              ? 'border-emerald-400 bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-400/40'
                              : 'border-slate-800 bg-slate-900/80 hover:bg-slate-800 text-slate-300'
                          }`}
                          title={t('studio.setBackgroundToPreset', { name: preset.name, hex: preset.hex }, `Set background to ${preset.name} (${preset.hex})`)}
                        >
                          <span
                            className="w-3 h-3 rounded-full border border-white/20 shadow-sm shrink-0"
                            style={{ backgroundColor: preset.hex }}
                          />
                          <span>{preset.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Opacity Slider */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-slate-300">{t('customizers.backgroundOpacity')}</span>
                    <span className="font-mono text-emerald-400 font-bold">
                      {Math.round((theme.visuals_config?.cardGoodBgOpacity ?? 0.85) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={theme.visuals_config?.cardGoodBgOpacity ?? 0.85}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      onChange({
                        ...theme,
                        visuals_config: {
                          ...theme.visuals_config,
                          cardGoodBgOpacity: isNaN(val) ? 0.85 : Math.max(0, Math.min(1, val)),
                        },
                      });
                    }}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                  />
                  <div className="flex items-center justify-between text-[10px] text-slate-500">
                    <span>{t('customizers.transparent')}</span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          onChange({
                            ...theme,
                            visuals_config: { ...theme.visuals_config, cardGoodBgOpacity: 0.5 },
                          })
                        }
                        className="hover:text-emerald-400"
                      >
                        50%
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onChange({
                            ...theme,
                            visuals_config: { ...theme.visuals_config, cardGoodBgOpacity: 0.75 },
                          })
                        }
                        className="hover:text-emerald-400"
                      >
                        75%
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onChange({
                            ...theme,
                            visuals_config: { ...theme.visuals_config, cardGoodBgOpacity: 0.85 },
                          })
                        }
                        className="hover:text-emerald-400"
                      >
                        85%
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onChange({
                            ...theme,
                            visuals_config: { ...theme.visuals_config, cardGoodBgOpacity: 1.0 },
                          })
                        }
                        className="hover:text-emerald-400"
                      >
                        100%
                      </button>
                    </div>
                    <span>{t('customizers.solid')}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Card Color Themes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-slate-800/80">
            {/* Card Face Color */}
            <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-3.5 space-y-2">
              <span className="text-xs font-semibold text-slate-300">{t('studio.tabs.cardFrontBorderColor')}</span>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={theme.visuals_config?.cardBadBorder || '#f59e0b'}
                  onChange={(e) =>
                    onChange({
                      ...theme,
                      visuals_config: {
                        ...theme.visuals_config,
                        cardBadBorder: e.target.value,
                      },
                    })
                  }
                  className="w-8 h-8 rounded-lg bg-transparent border-0 cursor-pointer"
                />
                <input
                  type="text"
                  value={theme.visuals_config?.cardBadBorder || '#f59e0b'}
                  onChange={(e) =>
                    onChange({
                      ...theme,
                      visuals_config: {
                        ...theme.visuals_config,
                        cardBadBorder: e.target.value,
                      },
                    })
                  }
                  className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1 text-xs text-slate-200 font-mono"
                />
              </div>
            </div>

            {/* Matched Pair Border Color */}
            <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-3.5 space-y-2">
              <span className="text-xs font-semibold text-slate-300">{t('studio.tabs.matchedPairBorderColor')}</span>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={theme.visuals_config?.cardGoodBorder || '#10b981'}
                  onChange={(e) =>
                    onChange({
                      ...theme,
                      visuals_config: {
                        ...theme.visuals_config,
                        cardGoodBorder: e.target.value,
                      },
                    })
                  }
                  className="w-8 h-8 rounded-lg bg-transparent border-0 cursor-pointer"
                />
                <input
                  type="text"
                  value={theme.visuals_config?.cardGoodBorder || '#10b981'}
                  onChange={(e) =>
                    onChange({
                      ...theme,
                      visuals_config: {
                        ...theme.visuals_config,
                        cardGoodBorder: e.target.value,
                      },
                    })
                  }
                  className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1 text-xs text-slate-200 font-mono"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {isCatcherGame && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-5 shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
                <Sparkles className="w-4 h-4" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-slate-100">{t('studio.catcherBasket')}</h3>
                <p className="text-xs text-slate-400">
                  {t('studio.gameControls')}
                </p>
              </div>
            </div>
          </div>

          {/* Catcher Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">{t('studio.catcherName')}</label>
            <input
              type="text"
              value={theme.basket_config?.name || theme.basketName || 'Basket'}
              onChange={(e) =>
                onChange({
                  ...theme,
                  basketName: e.target.value,
                  basket_config: {
                    ...theme.basket_config,
                    name: e.target.value,
                  },
                })
              }
              placeholder={t('customizers.catcherNamePlaceholder', undefined, 'e.g. Golden Basket, Sleigh, Tray')}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Catcher Artwork Visual Upload / Preview Section */}
          <div className="space-y-2.5">
            <label className="text-xs font-semibold text-slate-300">{t('studio.catcherArtwork')}</label>

            {catcherUploadError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-start gap-2.5 text-xs text-rose-300">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div className="flex-1">{catcherUploadError}</div>
              </div>
            )}

            {currentCatcherUrl ? (
              /* AFTER IMAGE UPLOADED: PREVIEW WITH REPLACE & REMOVE ACTIONS */
              <div className="space-y-3">
                <div className="relative rounded-2xl overflow-hidden border-2 border-slate-700 bg-slate-950/90 p-6 flex flex-col items-center justify-center min-h-[160px] max-h-[220px] group shadow-inner">
                  {/* Subtle checkered transparent canvas background pattern */}
                  <div className="absolute inset-0 opacity-15 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:16px_16px]" />

                  <img
                    src={currentCatcherUrl}
                    alt={theme.basket_config?.name || 'Catcher Preview'}
                    className="max-h-28 max-w-full object-contain filter drop-shadow-lg group-hover:scale-105 transition-transform duration-300 z-10"
                    referrerPolicy="no-referrer"
                  />

                  {uploadingAsset === 'basket' && (
                    <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center gap-2 text-amber-400 z-20">
                      <RefreshCw className="w-6 h-6 animate-spin" />
                      <span className="text-xs font-bold text-slate-200">{t('studio.tabs.uploadingNewCatcher')}</span>
                    </div>
                  )}
                </div>

                {/* Action Buttons: Replace Image and Remove */}
                <div className="flex items-center justify-end gap-2">
                  <input
                    ref={catcherReplaceFileInputRef}
                    type="file"
                    accept="image/png,image/webp,image/jpeg,image/jpg"
                    className="hidden"
                    disabled={uploadingAsset === 'basket'}
                    onChange={handleCatcherFileInputChange}
                  />
                  <button
                    type="button"
                    onClick={() => catcherReplaceFileInputRef.current?.click()}
                    disabled={uploadingAsset === 'basket'}
                    className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 text-xs font-bold rounded-xl border border-slate-700 flex items-center gap-2 transition-all disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${uploadingAsset === 'basket' ? 'animate-spin' : ''}`} />
                    <span>{uploadingAsset === 'basket' ? t('common.uploading') : t('customizers.replaceGraphic', undefined, 'Replace Image')}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleRemoveCatcher}
                    disabled={uploadingAsset === 'basket'}
                    className="px-3.5 py-2 bg-rose-500/10 hover:bg-rose-500/20 active:scale-95 text-rose-400 text-xs font-bold rounded-xl border border-rose-500/20 flex items-center gap-2 transition-all disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{t('common.remove')}</span>
                  </button>
                </div>
              </div>
            ) : (
              /* BEFORE IMAGE UPLOADED: VISUAL UPLOAD AREA */
              <div
                onDragEnter={handleCatcherDrag}
                onDragLeave={handleCatcherDrag}
                onDragOver={handleCatcherDrag}
                onDrop={handleCatcherDrop}
                onClick={() => catcherFileInputRef.current?.click()}
                className={`cursor-pointer rounded-2xl border-2 border-dashed p-8 transition-all flex flex-col items-center justify-center text-center gap-3 ${
                  catcherDragActive
                    ? 'border-emerald-400 bg-emerald-500/10 scale-[1.01]'
                    : 'border-slate-800 hover:border-slate-700 bg-slate-950/60 hover:bg-slate-950'
                }`}
              >
                <input
                  ref={catcherFileInputRef}
                  type="file"
                  accept="image/png,image/webp,image/jpeg,image/jpg"
                  className="hidden"
                  disabled={uploadingAsset === 'basket'}
                  onChange={handleCatcherFileInputChange}
                />

                <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-emerald-400 shadow-md">
                  {uploadingAsset === 'basket' ? (
                    <RefreshCw className="w-6 h-6 animate-spin" />
                  ) : (
                    <Upload className="w-6 h-6" />
                  )}
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-bold text-slate-200">
                    {uploadingAsset === 'basket'
                      ? t('studio.tabs.uploadingNewCatcher')
                      : catcherDragActive
                      ? 'Drop catcher image here'
                      : 'Upload Catcher'}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    PNG / WebP recommended
                  </p>
                </div>

                <button
                  type="button"
                  className="mt-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl border border-slate-700 flex items-center gap-2 pointer-events-none"
                >
                  <Upload className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{t('studio.tabs.uploadImage')}</span>
                </button>
              </div>
            )}
          </div>

          {/* Visual Catcher Dimension Sliders */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-800/80">
            <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-3.5 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-slate-300">{t('studio.tabs.catcherWidth')}</span>
                <span className="text-amber-400 font-bold font-mono">
                  {theme.basket_config?.width || 120} px
                </span>
              </div>
              <input
                type="range"
                min="80"
                max="240"
                step="5"
                value={theme.basket_config?.width || 120}
                onChange={(e) =>
                  onChange({
                    ...theme,
                    basket_config: {
                      ...theme.basket_config,
                      width: parseInt(e.target.value) || 120,
                    },
                  })
                }
                className="w-full accent-amber-500 cursor-pointer"
              />
              <p className="text-[11px] text-slate-500">
                Width of the displayed catcher sprite on screen
              </p>
            </div>

            <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-3.5 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-slate-300">{t('studio.tabs.catchOpeningRatio')}</span>
                <span className="text-amber-400 font-bold font-mono">
                  {Math.round((theme.basket_config?.catchAreaRatio || 0.85) * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0.5"
                max="1.0"
                step="0.05"
                value={theme.basket_config?.catchAreaRatio || 0.85}
                onChange={(e) =>
                  onChange({
                    ...theme,
                    basket_config: {
                      ...theme.basket_config,
                      catchAreaRatio: parseFloat(e.target.value) || 0.85,
                    },
                  })
                }
                className="w-full accent-amber-500 cursor-pointer"
              />
              <p className="text-[11px] text-slate-500">
                Percentage of catcher width that successfully catches items
              </p>
            </div>
          </div>

          {/* Collapsible Advanced Collision & Hitbox Section */}
          <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-950/50">
            <button
              type="button"
              onClick={() => setShowAdvancedBasket(!showAdvancedBasket)}
              className="w-full px-4 py-3 bg-slate-950 hover:bg-slate-900/80 flex items-center justify-between text-xs font-bold text-slate-300 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Sliders className="w-3.5 h-3.5 text-amber-400" />
                <span>{t('studio.tabs.advancedCollisionPhysicsTuning')}</span>
              </div>
              <div className="flex items-center gap-1 text-slate-400">
                <span className="text-[10px] font-normal">
                  {showAdvancedBasket ? t('common.hide') : t('common.showAdvanced')}
                </span>
                {showAdvancedBasket ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </div>
            </button>

            {showAdvancedBasket && (
              <div className="p-4 border-t border-slate-800 space-y-4 text-xs">
                <div className="bg-slate-900/60 border border-slate-800 p-3 rounded-xl flex items-start gap-2.5 text-slate-400 text-[11px]">
                  <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    These ratios allow precise pixel matching for custom PNG artwork that may have transparent padding around the rim.
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-400">
                      Collision Width Ratio
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.3"
                      max="1.0"
                      value={theme.basket_config?.collisionWidthRatio || 0.72}
                      onChange={(e) =>
                        onChange({
                          ...theme,
                          basket_config: {
                            ...theme.basket_config,
                            collisionWidthRatio: parseFloat(e.target.value) || 0.72,
                          },
                        })
                      }
                      className="w-full mt-1 bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-slate-200 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-400">
                      Collision Height Ratio
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.05"
                      max="0.5"
                      value={theme.basket_config?.collisionHeightRatio || 0.13}
                      onChange={(e) =>
                        onChange({
                          ...theme,
                          basket_config: {
                            ...theme.basket_config,
                            collisionHeightRatio: parseFloat(e.target.value) || 0.13,
                          },
                        })
                      }
                      className="w-full mt-1 bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-slate-200 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-400">
                      Vertical Rim Offset Ratio
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.0"
                      max="0.8"
                      value={theme.basket_config?.collisionOffsetYRatio || 0.34}
                      onChange={(e) =>
                        onChange({
                          ...theme,
                          basket_config: {
                            ...theme.basket_config,
                            collisionOffsetYRatio: parseFloat(e.target.value) || 0.34,
                          },
                        })
                      }
                      className="w-full mt-1 bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-slate-200 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
