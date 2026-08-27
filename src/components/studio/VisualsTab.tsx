import React, { useState, useRef } from 'react';
import { GameTheme } from '../../themes/types';
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
  Palette,
} from 'lucide-react';
import {
  CatchBrandVisualsCustomizer,
  PRESET_CATCHERS,
} from './games/CatchBrandCustomizer';
import {
  MemoryMatchVisualsCustomizer,
  PRESET_CARD_BACKS,
} from './games/MemoryMatchCustomizer';

export { PRESET_CATCHERS, PRESET_CARD_BACKS };

export const PRESET_BACKGROUNDS = [
  { name: 'Carnival Stage', url: '/assets/themes/carnival/background.png' },
  { name: 'Neon Arcade', url: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=1200&q=80' },
  { name: 'Cosmic Sky', url: 'https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?auto=format&fit=crop&w=1200&q=80' },
  { name: 'Sunset Festival', url: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=1200&q=80' },
];

interface VisualsTabProps {
  theme: GameTheme;
  onChange: (updated: GameTheme) => void;
  onUploadAsset: (file: File, fieldKey: string) => Promise<string>;
  uploadingAsset: string | null;
  gameType?: string;
}

const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
const ALLOWED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'];

export const VisualsTab: React.FC<VisualsTabProps> = ({
  theme,
  onChange,
  onUploadAsset,
  uploadingAsset,
  gameType,
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dimensionNotice, setDimensionNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const replaceFileInputRef = useRef<HTMLInputElement | null>(null);

  const resolvedGameType =
    (gameType || theme.game_type || theme.game_slug || '').toLowerCase();
  const isMemoryMatch =
    resolvedGameType === 'memory-match' ||
    theme.slug?.includes('memory') ||
    theme.base_theme_id === 'memory-carnival';

  const currentBgUrl = theme.background_url || theme.background || '';

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

    // 4. Upload asset
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

  const handleRemoveBackground = () => {
    setUploadError(null);
    setDimensionNotice(null);
    onChange({
      ...theme,
      background_url: '',
      background: '',
    });
  };

  return (
    <div className="space-y-6">
      {/* 1. SHARED BACKGROUND IMAGE CUSTOMIZER (ALL GAMES) */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-5 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="p-2 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
              <ImageIcon className="w-4 h-4" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-100">Game Canvas Background</h3>
              <p className="text-xs text-slate-400">
                Shared backdrop canvas loaded behind all gameplay elements
              </p>
            </div>
          </div>
        </div>

        {/* Background Image Upload & Preview */}
        <div className="space-y-3">
          {currentBgUrl ? (
            <div className="relative rounded-2xl border border-slate-800 bg-slate-950 overflow-hidden group">
              <div className="aspect-[16/9] w-full max-h-56 relative bg-slate-900 flex items-center justify-center overflow-hidden">
                <img
                  src={currentBgUrl}
                  alt="Custom Background"
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 backdrop-blur-[2px]">
                  <input
                    type="file"
                    ref={replaceFileInputRef}
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        processBackgroundFile(e.target.files[0]);
                        e.target.value = '';
                      }
                    }}
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => replaceFileInputRef.current?.click()}
                    disabled={uploadingAsset === 'background'}
                    className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-bold rounded-xl transition-all flex items-center gap-2 border border-slate-700 shadow-xl"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${uploadingAsset === 'background' ? 'animate-spin' : ''}`} />
                    <span>Replace Image</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleRemoveBackground}
                    className="px-3.5 py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-bold rounded-xl transition-all flex items-center gap-2 border border-rose-500/40 shadow-xl"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remove</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-2xl p-7 text-center transition-all cursor-pointer ${
                dragActive
                  ? 'border-amber-400 bg-amber-500/10'
                  : 'border-slate-800 hover:border-slate-700 bg-slate-950/40 hover:bg-slate-950/70'
              }`}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    processBackgroundFile(e.target.files[0]);
                    e.target.value = '';
                  }
                }}
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
              />
              <div className="flex flex-col items-center justify-center space-y-2.5">
                <div className="p-3.5 rounded-full bg-slate-900 text-amber-400 border border-slate-800">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-200">
                    {uploadingAsset === 'background' ? 'Uploading background...' : 'Upload custom background graphic'}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Drag & drop 16:9 PNG, JPG or WebP (max 10MB)
                  </p>
                </div>
              </div>
            </div>
          )}

          {uploadError && (
            <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{uploadError}</span>
            </div>
          )}

          {dimensionNotice && (
            <div className="bg-sky-500/10 border border-sky-500/30 text-sky-300 px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-2">
              <Info className="w-4 h-4 shrink-0" />
              <span>{dimensionNotice}</span>
            </div>
          )}

          {/* Preset Background Quick Select */}
          <div className="space-y-2 pt-2 border-t border-slate-800/80">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              Preset Backgrounds
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {PRESET_BACKGROUNDS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => {
                    onChange({
                      ...theme,
                      background_url: preset.url,
                      background: preset.url,
                    });
                  }}
                  className={`p-2 rounded-xl border text-left flex flex-col gap-1.5 transition-all ${
                    currentBgUrl === preset.url
                      ? 'border-amber-500 bg-amber-500/10 ring-1 ring-amber-500/30'
                      : 'border-slate-800 hover:border-slate-700 bg-slate-950'
                  }`}
                >
                  <div className="aspect-[16/9] w-full rounded-lg overflow-hidden bg-slate-900">
                    <img
                      src={preset.url}
                      alt={preset.name}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <span className="text-[11px] font-bold text-slate-300 truncate">
                    {preset.name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 2. GAME-SPECIFIC VISUALS CUSTOMIZER */}
      {isMemoryMatch ? (
        <MemoryMatchVisualsCustomizer
          theme={theme}
          onChange={onChange}
          onUploadAsset={onUploadAsset}
          uploadingAsset={uploadingAsset}
        />
      ) : (
        <CatchBrandVisualsCustomizer
          theme={theme}
          onChange={onChange}
          onUploadAsset={onUploadAsset}
          uploadingAsset={uploadingAsset}
        />
      )}
    </div>
  );
};
