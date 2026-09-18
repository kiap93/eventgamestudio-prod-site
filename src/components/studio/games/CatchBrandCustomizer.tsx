import React, { useState, useRef, useMemo } from 'react';
import { GameTheme, ThemeDropItem, ThemeDifficultyStage } from '../../../themes/types';
import { ResultScreenVisualEditorModal, ResultScreenBasicEditor } from './result-editor';
import { ResultScreenRenderer } from '../../../games/shared/ResultScreenRenderer';
import { StartScreenVisualEditorModal } from './start-editor/StartScreenVisualEditorModal';
import { StartScreenRenderer } from '../../../games/shared/StartScreenRenderer';
import { getStartScreenConfig, saveStartScreenConfig } from '../../../games/shared/startScreenResolver';
import { StartScreenConfig } from '../../../games/shared/startScreenTypes';
import { StartScreenBasicEditor } from './start-editor/StartScreenBasicEditor';
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
  Zap,
  Clock,
  Gauge,
  Flame,
  Star,
  Activity,
  Plus,
  Copy,
  Maximize2,
  Palette,
} from 'lucide-react';

export const PRESET_CATCHERS = [
  { name: 'Woven Basket', url: '/assets/basket.png' },
  { name: 'Holiday Sleigh', url: 'https://images.unsplash.com/photo-1543258103-a62bdc069871?auto=format&fit=crop&w=300&q=80' },
  { name: 'Lunar Tray', url: 'https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&w=300&q=80' },
  { name: 'Cauldron', url: 'https://images.unsplash.com/photo-1509557965875-b88c97052f0e?auto=format&fit=crop&w=300&q=80' },
];

const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
const ALLOWED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'];

/* ==========================================================================
 * CATCH THE BRAND - VISUALS CUSTOMIZER (CATCHER ARTWORK & SIZING)
 * ========================================================================== */
interface CatchBrandVisualsCustomizerProps {
  theme: GameTheme;
  onChange: (updated: GameTheme) => void;
  onUploadAsset: (file: File, fieldKey: string) => Promise<string>;
  uploadingAsset: string | null;
}

export const CatchBrandVisualsCustomizer: React.FC<CatchBrandVisualsCustomizerProps> = ({
  theme,
  onChange,
  onUploadAsset,
  uploadingAsset,
}) => {
  const [showAdvancedBasket, setShowAdvancedBasket] = useState(false);
  const [catcherDragActive, setCatcherDragActive] = useState(false);
  const [catcherUploadError, setCatcherUploadError] = useState<string | null>(null);
  const catcherFileInputRef = useRef<HTMLInputElement | null>(null);
  const catcherReplaceFileInputRef = useRef<HTMLInputElement | null>(null);

  const currentCatcherUrl = theme.basket_config?.imageUrl || theme.basket || '';

  const processCatcherFile = async (file: File) => {
    setCatcherUploadError(null);

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

    if (file.size > 5 * 1024 * 1024) {
      setCatcherUploadError(
        `File is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Maximum allowed size for catcher is 5MB.`
      );
      return;
    }

    try {
      const uploadedUrl = await onUploadAsset(file, 'catcher');
      onChange({
        ...theme,
        catcher: uploadedUrl,
        basket_config: {
          ...theme.basket_config,
          imageUrl: uploadedUrl,
        },
      });
    } catch (err: any) {
      setCatcherUploadError(err.message || 'Failed to upload catcher artwork');
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

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-5 shadow-lg">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="p-2 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
            <Layers className="w-4 h-4" />
          </span>
          <div>
            <h3 className="text-sm font-bold text-slate-100">Catcher Artwork & Dimensions</h3>
            <p className="text-xs text-slate-400">
              The player vessel controlled horizontally at the bottom of the screen
            </p>
          </div>
        </div>
      </div>

      {/* Catcher Image Upload & Preview */}
      <div className="space-y-4">
        {currentCatcherUrl ? (
          <div className="relative rounded-2xl border border-slate-800 bg-slate-950/60 p-4 flex flex-col sm:flex-row items-center gap-5">
            <div className="w-28 h-20 bg-slate-900 rounded-xl border border-slate-800 flex items-center justify-center p-2 shrink-0">
              <img
                src={currentCatcherUrl}
                alt="Current Catcher"
                className="max-h-full max-w-full object-contain filter drop-shadow-md"
                referrerPolicy="no-referrer"
              />
            </div>

            <div className="flex-1 space-y-1.5 min-w-0 text-center sm:text-left">
              <div className="flex items-center justify-center sm:justify-start gap-2">
                <h4 className="text-xs font-bold text-slate-200 truncate">
                  {theme.basket_config?.name || 'Active Catcher Graphic'}
                </h4>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
                  Active
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Transparent PNG or WebP recommended (~300×150px)
              </p>
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1">
                <input
                  type="file"
                  ref={catcherReplaceFileInputRef}
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      processCatcherFile(e.target.files[0]);
                      e.target.value = '';
                    }
                  }}
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => catcherReplaceFileInputRef.current?.click()}
                  disabled={uploadingAsset === 'catcher'}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 border border-slate-700"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${uploadingAsset === 'catcher' ? 'animate-spin' : ''}`} />
                  <span>Replace Graphic</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div
            onDragEnter={handleCatcherDrag}
            onDragLeave={handleCatcherDrag}
            onDragOver={handleCatcherDrag}
            onDrop={handleCatcherDrop}
            className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer ${
              catcherDragActive
                ? 'border-amber-400 bg-amber-500/10'
                : 'border-slate-800 hover:border-slate-700 bg-slate-950/40 hover:bg-slate-950/70'
            }`}
            onClick={() => catcherFileInputRef.current?.click()}
          >
            <input
              type="file"
              ref={catcherFileInputRef}
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  processCatcherFile(e.target.files[0]);
                  e.target.value = '';
                }
              }}
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="hidden"
            />
            <div className="flex flex-col items-center justify-center space-y-2">
              <div className="p-3 rounded-full bg-slate-900 text-amber-400 border border-slate-800">
                <Upload className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-200">
                  {uploadingAsset === 'catcher' ? 'Uploading catcher artwork...' : 'Upload custom catcher graphic'}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Drag & drop transparent PNG, WebP (max 5MB)
                </p>
              </div>
            </div>
          </div>
        )}

        {catcherUploadError && (
          <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{catcherUploadError}</span>
          </div>
        )}

        {/* Preset Catcher Quick Select */}
        <div className="space-y-2 pt-2 border-t border-slate-800/80">
          <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            Preset Catchers
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {PRESET_CATCHERS.map((preset) => (
              <button
                key={preset.name}
                type="button"
                onClick={() => {
                  onChange({
                    ...theme,
                    catcher: preset.url,
                    catcherName: preset.name,
                    basket_config: {
                      ...theme.basket_config,
                      name: preset.name,
                      imageUrl: preset.url,
                    },
                  });
                }}
                className={`p-2.5 rounded-xl border text-left flex flex-col items-center gap-2 transition-all ${
                  currentCatcherUrl === preset.url
                    ? 'border-amber-500 bg-amber-500/10 ring-1 ring-amber-500/30'
                    : 'border-slate-800 hover:border-slate-700 bg-slate-950'
                }`}
              >
                <div className="w-12 h-10 flex items-center justify-center">
                  <img
                    src={preset.url}
                    alt={preset.name}
                    className="max-h-full max-w-full object-contain"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <span className="text-[11px] font-bold text-slate-300 truncate w-full text-center">
                  {preset.name}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Advanced Catcher Physics & Dimensions Collapsible */}
        <div className="border border-slate-800/80 rounded-2xl bg-slate-950/60 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowAdvancedBasket(!showAdvancedBasket)}
            className="w-full px-4 py-3 flex items-center justify-between text-xs font-bold text-slate-300 hover:text-white transition-colors"
          >
            <span className="flex items-center gap-2">
              <Sliders className="w-3.5 h-3.5 text-amber-400" />
              <span>Catcher Scale, Catch Area & Physics</span>
            </span>
            {showAdvancedBasket ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showAdvancedBasket && (
            <div className="p-4 border-t border-slate-800 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Catcher Name */}
                <div className="space-y-1.5">
                  <label className="text-slate-300 font-semibold">Catcher Name</label>
                  <input
                    type="text"
                    value={theme.basket_config?.name || ''}
                    onChange={(e) =>
                      onChange({
                        ...theme,
                        catcherName: e.target.value,
                        basket_config: { ...theme.basket_config, name: e.target.value },
                      })
                    }
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-200 font-medium focus:outline-none focus:border-amber-500"
                    placeholder="e.g. Woven Basket"
                  />
                </div>

                {/* Catch Area Ratio */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-slate-300 font-semibold">Catch Sweet Spot</label>
                    <span className="text-amber-400 font-mono font-bold">
                      {Math.round((theme.basket_config?.catchAreaRatio ?? 0.72) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.3"
                    max="1.0"
                    step="0.02"
                    value={theme.basket_config?.catchAreaRatio ?? 0.72}
                    onChange={(e) =>
                      onChange({
                        ...theme,
                        basket_config: {
                          ...theme.basket_config,
                          catchAreaRatio: parseFloat(e.target.value) || 0.72,
                        },
                      })
                    }
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* ==========================================================================
 * CATCH THE BRAND - ITEMS CUSTOMIZER (FALLING COLLECTIBLES)
 * ========================================================================== */
interface CatchBrandItemsCustomizerProps {
  theme: GameTheme;
  onChange: (updated: GameTheme) => void;
  onUploadAsset: (file: File, fieldKey: string) => Promise<string>;
  uploadingAsset: string | null;
}

export const CatchBrandItemsCustomizer: React.FC<CatchBrandItemsCustomizerProps> = ({
  theme,
  onChange,
  onUploadAsset,
  uploadingAsset,
}) => {
  const items = theme.items_config || [];

  const handleUpdateItem = (index: number, updates: Partial<ThemeDropItem>) => {
    const updated = [...items];
    if (updated[index]) {
      updated[index] = { ...updated[index], ...updates };
      onChange({
        ...theme,
        items_config: updated,
      });
    }
  };

  const handleAddItem = () => {
    const newItem: ThemeDropItem = {
      id: `item_${Date.now()}`,
      name: `Collect Item ${items.length + 1}`,
      imageUrl: null,
      points: 10,
      speedMultiplier: 1.0,
      spawnWeight: 10,
      enabled: true,
      isHazard: false,
      isBonus: false,
    };
    onChange({
      ...theme,
      items_config: [...items, newItem],
    });
  };

  const handleDeleteItem = (index: number) => {
    if (items.length <= 1) return;
    const updated = items.filter((_, i) => i !== index);
    onChange({
      ...theme,
      items_config: updated,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header & Add Button */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-lg flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="p-2 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
            <Sparkles className="w-4 h-4" />
          </span>
          <div>
            <h3 className="text-sm font-bold text-slate-100">Falling Objects & Collectibles</h3>
            <p className="text-xs text-slate-400">
              Configure good point items, hazardous penalty obstacles, and golden bonus drops
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleAddItem}
          className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 text-xs font-black rounded-xl transition-all flex items-center gap-1.5 shadow-md"
        >
          <Plus className="w-3.5 h-3.5 stroke-[3]" />
          <span>Add Item</span>
        </button>
      </div>

      {/* Items List */}
      <div className="space-y-4">
        {items.map((item, idx) => {
          const isHazard = item.isHazard || item.points < 0;
          const isBonus = item.isBonus || item.points >= 50;

          return (
            <div
              key={item.id || idx}
              className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-lg"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span
                    className={`px-2.5 py-1 rounded-xl text-[11px] font-bold border ${
                      isHazard
                        ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                        : isBonus
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                        : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    }`}
                  >
                    {isHazard ? 'Hazard / Penalty' : isBonus ? 'Golden Bonus' : 'Standard Good'}
                  </span>
                  <input
                    type="text"
                    value={item.name || ''}
                    onChange={(e) => handleUpdateItem(idx, { name: e.target.value })}
                    className="bg-transparent text-sm font-bold text-slate-100 border-b border-transparent hover:border-slate-700 focus:border-amber-500 focus:outline-none px-1"
                    placeholder="Item Name"
                  />
                </div>

                <div className="flex items-center gap-2">
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleDeleteItem(idx)}
                      className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
                      title="Delete item"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Item Details Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                {/* Points */}
                <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 space-y-1.5">
                  <label className="text-slate-400 font-semibold">Points Value</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={item.points}
                      onChange={(e) => {
                        const pts = parseInt(e.target.value) || 0;
                        handleUpdateItem(idx, {
                          points: pts,
                          isHazard: pts < 0,
                          isBonus: pts >= 50,
                        });
                      }}
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 font-mono font-bold focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                {/* Spawn Weight */}
                <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-slate-400 font-semibold">Spawn Frequency</label>
                    <span className="text-amber-400 font-mono font-bold">{item.spawnWeight || 10}</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="50"
                    value={item.spawnWeight || 10}
                    onChange={(e) =>
                      handleUpdateItem(idx, { spawnWeight: parseInt(e.target.value) || 10 })
                    }
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                </div>

                {/* Speed Multiplier */}
                <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-slate-400 font-semibold">Speed Modifier</label>
                    <span className="text-emerald-400 font-mono font-bold">
                      {(item.speedMultiplier || 1.0).toFixed(1)}x
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="2.0"
                    step="0.1"
                    value={item.speedMultiplier || 1.0}
                    onChange={(e) =>
                      handleUpdateItem(idx, { speedMultiplier: parseFloat(e.target.value) || 1.0 })
                    }
                    className="w-full accent-emerald-500 cursor-pointer"
                  />
                </div>

                {/* Size Scale */}
                <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-slate-400 font-semibold">Proportional Scale</label>
                    <span className="text-amber-400 font-mono font-bold">
                      {(item.scale || 1.0).toFixed(1)}x
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="2.0"
                    step="0.1"
                    value={item.scale || 1.0}
                    onChange={(e) =>
                      handleUpdateItem(idx, { scale: parseFloat(e.target.value) || 1.0 })
                    }
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ==========================================================================
 * CATCH THE BRAND - GAMEPLAY CUSTOMIZER (PHYSICS & VELOCITY)
 * ========================================================================== */
interface CatchBrandGameplayCustomizerProps {
  theme: GameTheme;
  onChange: (updated: GameTheme) => void;
}

export const CatchBrandGameplayCustomizer: React.FC<CatchBrandGameplayCustomizerProps> = ({
  theme,
  onChange,
}) => {
  const physics = theme.physics_config || {
    gameDurationSeconds: 20,
    fallSpeedMultiplier: 0.7,
    baseFallSpeed: 500,
    spawnIntervalMin: 550,
    spawnIntervalMax: 1000,
    difficultyStages: [],
  };

  const handleUpdatePhysics = (updates: Partial<typeof physics>) => {
    onChange({
      ...theme,
      physics_config: {
        ...physics,
        ...updates,
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-5 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="p-2 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
              <Zap className="w-4 h-4" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-100">Match Dynamics & Speed</h3>
              <p className="text-xs text-slate-400">
                Adjust game session duration, falling velocity, and catcher responsiveness
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Match Duration */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                Match Duration
              </span>
              <span className="text-amber-400 font-bold font-mono text-sm">
                {physics.gameDurationSeconds || 20}s
              </span>
            </div>
            <input
              type="range"
              min="10"
              max="60"
              step="5"
              value={physics.gameDurationSeconds || 20}
              onChange={(e) =>
                handleUpdatePhysics({
                  gameDurationSeconds: parseInt(e.target.value) || 20,
                })
              }
              className="w-full accent-amber-500 cursor-pointer"
            />
            <p className="text-[11px] text-slate-500">Session length before time expires</p>
          </div>

          {/* Fall Speed Multiplier */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Gauge className="w-3.5 h-3.5 text-emerald-400" />
                Fall Velocity
              </span>
              <span className="text-emerald-400 font-bold font-mono text-sm">
                {(Number(physics?.fallSpeedMultiplier) || 0.7).toFixed(2)}x
              </span>
            </div>
            <input
              type="range"
              min="0.3"
              max="1.8"
              step="0.05"
              value={physics.fallSpeedMultiplier || 0.7}
              onChange={(e) =>
                handleUpdatePhysics({
                  fallSpeedMultiplier: parseFloat(e.target.value) || 0.7,
                })
              }
              className="w-full accent-emerald-500 cursor-pointer"
            />
            <p className="text-[11px] text-slate-500">Speed rate of falling objects</p>
          </div>

          {/* Spawn Interval Min */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-sky-400" />
                Spawn Cadence
              </span>
              <span className="text-sky-400 font-bold font-mono text-sm">
                {physics.spawnIntervalMin || 550}ms
              </span>
            </div>
            <input
              type="range"
              min="300"
              max="1200"
              step="50"
              value={physics.spawnIntervalMin || 550}
              onChange={(e) =>
                handleUpdatePhysics({
                  spawnIntervalMin: parseInt(e.target.value) || 550,
                })
              }
              className="w-full accent-sky-500 cursor-pointer"
            />
            <p className="text-[11px] text-slate-500">Delay between consecutive item spawns</p>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ==========================================================================
 * CATCH THE BRAND - SCREENS CUSTOMIZER (START SCREEN & RESULT SCREEN)
 * ========================================================================== */
interface CatchBrandScreensCustomizerProps {
  theme: GameTheme;
  onChange: (updated: GameTheme) => void;
  onUploadAsset?: (file: File, fieldKey: string) => Promise<string>;
  uploadingAsset?: string | null;
}

export const CatchBrandScreensCustomizer: React.FC<CatchBrandScreensCustomizerProps> = ({
  theme,
  onChange,
  onUploadAsset,
  uploadingAsset,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'start' | 'result'>('start');
  const [isStartEditorModalOpen, setIsStartEditorModalOpen] = useState(false);
  const [isResultEditorModalOpen, setIsResultEditorModalOpen] = useState(false);
  const [resultViewportPreset, setResultViewportPreset] = useState<'fit' | '1024x576' | '800x450' | '600x400' | '400x300'>('fit');
  const [resultScaleInfo, setResultScaleInfo] = useState<{ scale: number; width: number; height: number }>({ scale: 1, width: 0, height: 0 });

  const gameConfig = (theme.game_config || {}) as Record<string, any>;
  const catchGameMeta = useMemo(() => ({
    duration: gameConfig.gameplay?.duration || 30,
    gameTitle: theme.name || 'Catch The Brand',
    logoUrl: theme.branding?.clientLogoUrl || theme.clientLogo || theme.logo || null,
    catcherImg: (theme as any)?.catcher || (theme as any)?.basket || null,
    goodItemImg: (theme as any)?.drop_items?.find((i: any) => i.type === 'normal' || i.type === 'good')?.url || null,
    badItemImg: (theme as any)?.drop_items?.find((i: any) => i.type === 'hazard' || i.type === 'bad')?.url || null,
  }), [gameConfig.gameplay?.duration, theme]);

  const startConfig = getStartScreenConfig(theme, 'catch-brand', catchGameMeta, { width: 1024, height: 576 });

  const resultConfig = gameConfig.screens?.result || theme.screens?.result || {
    background: { type: 'solid', color: '#070b14' },
    elements: [],
  };

  const handleUpdateStartConfig = (updated: Partial<StartScreenConfig>) => {
    const nextStart: StartScreenConfig = {
      ...startConfig,
      ...updated,
      canvas: updated.canvas || startConfig.canvas || { width: 1024, height: 576, coordinateSpace: 'landscape-1024x576', version: 2 },
    };
    const updatedTheme = saveStartScreenConfig(theme, nextStart, 'catch-brand');
    onChange(updatedTheme);
  };

  const handleUpdateResultConfig = (updated: any) => {
    const nextResult = {
      ...resultConfig,
      ...updated,
    };
    const nextGameConfig = {
      ...gameConfig,
      screens: {
        ...(gameConfig.screens || {}),
        result: nextResult,
      },
    };
    onChange({
      ...theme,
      game_config: nextGameConfig as any,
      screens: {
        ...(theme.screens || {}),
        result: nextResult as any,
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Subtabs Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveSubTab('start')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeSubTab === 'start'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 border border-slate-800'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Start Screen</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('result')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeSubTab === 'result'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 border border-slate-800'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Result Screen</span>
          </button>
        </div>
      </div>

      {activeSubTab === 'start' ? (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* 1. BASIC EDITOR */}
          <StartScreenBasicEditor
            startConfig={startConfig}
            theme={theme}
            gameType="catch-brand"
            gameMeta={catchGameMeta}
            onChange={handleUpdateStartConfig}
            onUploadAsset={onUploadAsset as any}
            uploadingAsset={uploadingAsset}
          />

          {/* 2. ADVANCED VISUAL CANVAS EDITOR */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-4 shadow-lg">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Palette className="w-4 h-4 text-amber-400" />
                  <span>Start Screen Visual Canvas Editor</span>
                </h4>
                <p className="text-xs text-slate-400 mt-1">
                  Design elements, layouts, start button, rules cards, and badges directly on the 1024×576 canvas.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsStartEditorModalOpen(true)}
                className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 transition-all cursor-pointer shrink-0"
              >
                <Maximize2 className="w-4 h-4" />
                <span>Open Start Screen Editor</span>
              </button>
            </div>

            {/* Live Scaled Preview Frame */}
            <div className="flex flex-col items-center justify-center p-4 bg-slate-950/60 rounded-xl border border-slate-800/80">
              <div className="w-full max-w-[500px] aspect-[16/9] rounded-xl overflow-hidden border border-slate-700/60 shadow-2xl relative">
                <StartScreenRenderer
                  config={startConfig}
                  theme={theme}
                  gameType="catch-brand"
                  gameMeta={catchGameMeta}
                  onStartGame={() => {}}
                  isSimulation={true}
                />
              </div>
              <span className="text-[11px] text-slate-500 mt-2 font-mono">
                Interactive Scaled Canvas Preview (1024 × 576)
              </span>
            </div>
          </div>

          <StartScreenVisualEditorModal
            isOpen={isStartEditorModalOpen}
            onClose={() => setIsStartEditorModalOpen(false)}
            startConfig={startConfig}
            theme={theme}
            gameType="catch-brand"
            gameMeta={catchGameMeta}
            onChange={handleUpdateStartConfig}
            onUploadAsset={onUploadAsset as any}
          />
        </div>
      ) : (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* 1. BASIC EDITOR */}
          <ResultScreenBasicEditor
            resultConfig={resultConfig as any}
            theme={theme}
            gameType="catch-brand"
            onChange={handleUpdateResultConfig}
            onUploadAsset={onUploadAsset as any}
            uploadingAsset={uploadingAsset}
          />

          {/* 2. ADVANCED VISUAL CANVAS EDITOR */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-4 shadow-lg">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Palette className="w-4 h-4 text-amber-400" />
                  <span>Result Screen Visual Canvas Editor</span>
                </h4>
                <p className="text-xs text-slate-400 mt-1">
                  Design result cards, typography, stats badges, leaderboard layout, and buttons directly on the canvas.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsResultEditorModalOpen(true)}
                className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 transition-all cursor-pointer shrink-0"
              >
                <Maximize2 className="w-4 h-4" />
                <span>Open Result Screen Editor</span>
              </button>
            </div>

            {/* Live Scaled Preview Frame */}
            <div className="flex flex-col items-center justify-center p-4 bg-slate-950/60 rounded-xl border border-slate-800/80 gap-3">
              {/* Viewport Dimension Presets for Verification */}
              <div className="flex flex-wrap items-center justify-center gap-1.5 p-1 bg-slate-900/90 rounded-lg border border-slate-800 text-[11px] font-mono">
                <span className="text-slate-400 px-2 font-medium">Viewport:</span>
                {(
                  [
                    { id: 'fit', label: 'Fit (Auto)' },
                    { id: '1024x576', label: '1024 × 576 (1.0x)' },
                    { id: '800x450', label: '800 × 450 (0.781x)' },
                    { id: '600x400', label: '600 × 400 (0.586x)' },
                    { id: '400x300', label: '400 × 300 (0.391x)' },
                  ] as const
                ).map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setResultViewportPreset(preset.id)}
                    className={`px-2 py-1 rounded transition-colors cursor-pointer ${
                      resultViewportPreset === preset.id
                        ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {/* Viewport Frame with overflow handling and dynamic dimensions */}
              <div
                className="w-full flex items-center justify-center overflow-auto p-2"
                style={{ maxHeight: '600px' }}
              >
                <div
                  className="rounded-xl overflow-hidden border border-slate-700/60 shadow-2xl relative transition-all duration-200"
                  style={{
                    width:
                      resultViewportPreset === '1024x576'
                        ? '1024px'
                        : resultViewportPreset === '800x450'
                        ? '800px'
                        : resultViewportPreset === '600x400'
                        ? '600px'
                        : resultViewportPreset === '400x300'
                        ? '400px'
                        : '100%',
                    maxWidth: '100%',
                    height:
                      resultViewportPreset === '1024x576'
                        ? '576px'
                        : resultViewportPreset === '800x450'
                        ? '450px'
                        : resultViewportPreset === '600x400'
                        ? '400px'
                        : resultViewportPreset === '400x300'
                        ? '300px'
                        : undefined,
                    aspectRatio: resultViewportPreset === 'fit' ? '16 / 9' : undefined,
                  }}
                >
                  <ResultScreenRenderer
                    resultConfig={resultConfig as any}
                    theme={theme}
                    layout={theme.layout}
                    stats={{
                      score: 350,
                      highScore: 500,
                      timeElapsedSeconds: gameConfig.gameplay?.duration || 20,
                      accuracyPercent: 92,
                      isVictory: true,
                      gameType: 'catch-brand',
                    }}
                    isSimulation={true}
                    onScaleChange={(scale, w, h) => {
                      setResultScaleInfo({ scale, width: Math.round(w), height: Math.round(h) });
                    }}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2 text-[11px] text-slate-500 font-mono">
                <span>Interactive Scaled Canvas Preview (1024 × 576)</span>
                <span className="text-slate-600">•</span>
                <span className="text-amber-400 font-semibold">
                  Scale: {resultScaleInfo.scale.toFixed(3)}
                </span>
                <span className="text-slate-600">•</span>
                <span className="text-slate-400">
                  Viewport: {resultScaleInfo.width} × {resultScaleInfo.height}
                </span>
              </div>
            </div>
          </div>

          <ResultScreenVisualEditorModal
            isOpen={isResultEditorModalOpen}
            onClose={() => setIsResultEditorModalOpen(false)}
            resultConfig={resultConfig as any}
            theme={theme}
            gameType="catch-brand"
            onChange={handleUpdateResultConfig}
            onUploadAsset={onUploadAsset as any}
          />
        </div>
      )}

    </div>
  );
};

