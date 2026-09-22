import React, { useState, useRef } from 'react';
import {
  GameTheme,
  ThemeDropItem,
  isMemoryMatchTheme,
  isReactionTheme,
  getDropItemDisplaySize,
  DEFAULT_MAX_DROP_ITEM_SIZE,
  memoryMatchTheme,
} from '../../themes';
import { MemoryMatchCardsCustomizer } from './games/MemoryMatchCustomizer';
import {
  Sparkles,
  Plus,
  Trash2,
  Copy,
  Upload,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';

interface ItemsTabProps {
  theme: GameTheme;
  onChange: (updated: GameTheme) => void;
  onUploadAsset: (file: File, fieldKey: string) => Promise<string>;
  uploadingAsset: string | null;
}

const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
const ALLOWED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'];

interface DropItemArtworkUploadProps {
  index: number;
  itemId: string;
  imageUrl: string;
  itemName: string;
  scale?: number;
  onUpload: (file: File) => Promise<void>;
  onRemove: () => void;
  isUploading: boolean;
}

const DropItemArtworkUpload: React.FC<DropItemArtworkUploadProps> = ({
  imageUrl,
  itemName,
  scale,
  onUpload,
  onRemove,
  isUploading,
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [imgDims, setImgDims] = useState<{
    naturalW: number;
    naturalH: number;
    displayW: number;
    displayH: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const replaceFileInputRef = useRef<HTMLInputElement | null>(null);

  const processFile = async (file: File) => {
    setUploadError(null);

    const extension = '.' + (file.name.split('.').pop() || '').toLowerCase();
    const isValidFormat =
      ALLOWED_MIME_TYPES.includes(file.type.toLowerCase()) ||
      ALLOWED_EXTENSIONS.includes(extension);

    if (!isValidFormat) {
      setUploadError(
        `Unsupported format "${file.name}". Please upload a PNG, WebP, or JPG image.`
      );
      return;
    }

    if (file?.size && file.size > 10 * 1024 * 1024) {
      setUploadError(
        `File is too large (${((file.size || 0) / (1024 * 1024)).toFixed(1)}MB). Maximum allowed size is 10MB.`
      );
      return;
    }

    try {
      await onUpload(file);
    } catch (err: any) {
      setUploadError(err.message || 'Failed to upload image');
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
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-2">
      <label className="text-[11px] font-semibold text-slate-400">Sprite Artwork</label>

      {uploadError && (
        <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center gap-2 text-xs text-rose-300">
          <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
          <span className="flex-1">{uploadError}</span>
        </div>
      )}

      {imageUrl ? (
        /* AFTER IMAGE UPLOADED: PREVIEW WITH REPLACE & REMOVE ACTIONS */
        <div className="space-y-2">
          <div className="relative rounded-2xl overflow-hidden border border-slate-800 bg-slate-950/90 p-3 flex items-center justify-center min-h-[110px] max-h-[140px] group shadow-inner">
            {/* Transparent checkered background pattern */}
            <div className="absolute inset-0 opacity-15 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:12px_12px]" />

            <img
              src={imageUrl}
              alt={itemName || 'Sprite Artwork'}
              onLoad={(e) => {
                const nw = e.currentTarget.naturalWidth;
                const nh = e.currentTarget.naturalHeight;
                if (nw > 0 && nh > 0) {
                  const d = getDropItemDisplaySize(nw, nh, DEFAULT_MAX_DROP_ITEM_SIZE, scale);
                  setImgDims({ naturalW: nw, naturalH: nh, displayW: d.width, displayH: d.height });
                }
              }}
              className="max-h-24 max-w-full object-contain filter drop-shadow-md group-hover:scale-105 transition-transform duration-200 z-10"
              referrerPolicy="no-referrer"
            />

            {isUploading && (
              <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center gap-1.5 text-amber-400 z-20">
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span className="text-[11px] font-bold text-slate-200">Uploading sprite...</span>
              </div>
            )}
          </div>

          {/* Intrinsic Artwork Dimensions & In-Game Proportional Sizing Badge */}
          {imgDims && (
            <div className="flex items-center justify-between px-3 py-1.5 bg-slate-950/90 border border-slate-800 rounded-xl text-[10px] font-mono text-slate-400 shadow-inner">
              <span>Artwork: <strong className="text-slate-200">{imgDims.naturalW}×{imgDims.naturalH}px</strong></span>
              <span className="text-emerald-400 font-semibold">Game Size: <strong>{imgDims.displayW}×{imgDims.displayH}px</strong></span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <input
              ref={replaceFileInputRef}
              type="file"
              accept="image/png,image/webp,image/jpeg,image/jpg"
              className="hidden"
              disabled={isUploading}
              onChange={handleFileInputChange}
            />
            <button
              type="button"
              onClick={() => replaceFileInputRef.current?.click()}
              disabled={isUploading}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 text-xs font-bold rounded-xl border border-slate-700 flex items-center gap-1.5 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isUploading ? 'animate-spin' : ''}`} />
              <span>{isUploading ? 'Uploading...' : 'Replace Image'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setUploadError(null);
                onRemove();
              }}
              disabled={isUploading}
              className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 active:scale-95 text-rose-400 text-xs font-bold rounded-xl border border-rose-500/20 flex items-center gap-1.5 transition-all disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Remove</span>
            </button>
          </div>
        </div>
      ) : (
        /* BEFORE IMAGE UPLOADED: VISUAL UPLOAD AREA */
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`cursor-pointer rounded-2xl border-2 border-dashed p-4 transition-all flex flex-col items-center justify-center text-center gap-2 ${
            dragActive
              ? 'border-emerald-400 bg-emerald-500/10 scale-[1.01]'
              : 'border-slate-800 hover:border-slate-700 bg-slate-950/60 hover:bg-slate-950'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/webp,image/jpeg,image/jpg"
            className="hidden"
            disabled={isUploading}
            onChange={handleFileInputChange}
          />

          <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-emerald-400 shadow-sm">
            {isUploading ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
          </div>

          <div className="space-y-0.5">
            <p className="text-xs font-bold text-slate-200">
              {isUploading ? 'Uploading sprite...' : dragActive ? 'Drop sprite image here' : 'Upload Image'}
            </p>
            <p className="text-[10px] text-slate-400">
              PNG / WebP recommended
            </p>
          </div>

          <button
            type="button"
            className="mt-0.5 px-3 py-1 bg-slate-800 text-slate-200 text-[11px] font-bold rounded-lg border border-slate-700 flex items-center gap-1.5 pointer-events-none"
          >
            <Upload className="w-3 h-3 text-emerald-400" />
            <span>Upload Image</span>
          </button>
        </div>
      )}
    </div>
  );
};

export const ItemsTab: React.FC<ItemsTabProps> = ({
  theme,
  onChange,
  onUploadAsset,
  uploadingAsset,
}) => {
  const isMemoryMatch = isMemoryMatchTheme(theme);

  if (isReactionTheme(theme)) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 text-center space-y-4 shadow-xl">
        <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400">
          <Sparkles className="w-6 h-6" />
        </div>
        <div className="max-w-md mx-auto space-y-1.5">
          <h3 className="text-base font-bold text-slate-100">Reaction Gantry Sequence</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            The Reaction Game uses high-precision F1-style starting gantry lights and reflex timing rather than collectible items or card pairs. Configure light sequences, bulb designs, delay windows, and penalty rules in the <span className="text-amber-400 font-semibold">Gameplay</span> and <span className="text-amber-400 font-semibold">Screens</span> tabs.
          </p>
        </div>
      </div>
    );
  }

  if (isMemoryMatch) {
    return (
      <MemoryMatchCardsCustomizer
        theme={theme}
        onChange={onChange}
        onUploadAsset={onUploadAsset}
        uploadingAsset={uploadingAsset}
      />
    );
  }

  const items = theme.items_config || [];

  const handleResetDefaultPairs = () => {
    const defaultPairs: ThemeDropItem[] = memoryMatchTheme.items_config || [];
    onChange({
      ...theme,
      items_config: defaultPairs,
    });
  };

  const handleAddItem = () => {
    const newItem: ThemeDropItem = {
      id: `item_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      name: isMemoryMatch ? `Card Pair ${items.length + 1}` : 'New Item',
      imageUrl: '',
      points: isMemoryMatch ? 100 : 10,
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

  const handleUpdateItem = (index: number, updates: Partial<ThemeDropItem>) => {
    const updated = [...items];
    const currentItem = updated[index];
    const nextPoints = updates.points !== undefined ? updates.points : currentItem.points;

    updated[index] = {
      ...currentItem,
      ...updates,
      points: nextPoints,
      isHazard: nextPoints < 0,
      isBonus: nextPoints >= 50,
    };

    onChange({
      ...theme,
      items_config: updated,
    });
  };

  const handleDuplicateItem = (index: number) => {
    const source = items[index];
    const duplicate: ThemeDropItem = {
      ...JSON.parse(JSON.stringify(source)),
      id: `item_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      name: `${source.name} (Copy)`,
    };
    onChange({
      ...theme,
      items_config: [...items, duplicate],
    });
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) {
      alert('A theme must have at least one falling item.');
      return;
    }
    const updated = items.filter((_, i) => i !== index);
    onChange({
      ...theme,
      items_config: updated,
    });
  };

  const handleItemUpload = async (file: File, index: number) => {
    const itemId = items[index]?.id || `item_${index}`;
    const url = await onUploadAsset(file, `item_${itemId}`);
    handleUpdateItem(index, { imageUrl: url });
  };

  const handleItemRemoveImage = (index: number) => {
    handleUpdateItem(index, { imageUrl: '' });
  };

  // Calculate spawn weight totals and percentages
  const totalWeight =
    items.filter((i) => i.enabled).reduce((sum, it) => sum + (it.spawnWeight || 10), 0) || 1;

  return (
    <div className="space-y-6">
      {/* Header & Quick Action Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
              <Sparkles className="w-4 h-4" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-100">
                {isMemoryMatch ? 'Memory Match Card Pairs' : 'Drop Items & Hazards'}
              </h3>
              <p className="text-xs text-slate-400">
                {isMemoryMatch
                  ? 'Define the unique card pairs, custom front face sprites, and match points for the memory board'
                  : 'Define collectible points, speed, artwork, and spawn weight'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isMemoryMatch ? (
            <>
              <button
                type="button"
                onClick={handleResetDefaultPairs}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 font-semibold text-xs rounded-xl border border-slate-700 transition-all flex items-center gap-1.5"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Reset 8 Pairs</span>
              </button>
              <span
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${
                  items.length >= 8
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                }`}
              >
                {items.length} / 8 Pairs {items.length >= 8 ? '✓' : ''}
              </span>
              <button
                type="button"
                onClick={handleAddItem}
                disabled={items.length >= 12}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-slate-950 font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5 disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Pair</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleAddItem}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-slate-950 font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Item</span>
            </button>
          )}
        </div>
      </div>

      {/* Memory Match Helper Alert if fewer than 8 pairs */}
      {isMemoryMatch && items.length < 8 && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-start gap-3 text-xs text-amber-300">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-1">
            <span className="font-bold">4x4 Grid Board Requirement:</span>
            <p className="text-amber-300/90">
              Memory Match requires at least 8 unique card pairs to fill the 16 cards on the 4×4 grid. Click &quot;Reset 8 Pairs&quot; or add more pairs so all 8 slots have custom designs.
            </p>
          </div>
        </div>
      )}

      {/* Spawn Distribution Summary Bar (Only for Arcade drop items) */}
      {!isMemoryMatch && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
          <div className="flex justify-between items-center text-xs font-semibold text-slate-300">
            <span>Relative Spawn Chance Distribution</span>
            <span className="text-slate-400 font-mono text-[11px]">
              {items.filter((i) => i.enabled).length} active items
            </span>
          </div>

          <div className="h-3 w-full bg-slate-950 rounded-full overflow-hidden flex p-0.5 gap-0.5 border border-slate-800">
            {items
              .filter((i) => i.enabled)
              .map((item, idx) => {
                const weight = Number(item.spawnWeight) || 10;
                const safeTotal = Number(totalWeight) || 1;
                const pct = (weight / safeTotal) * 100;
                const bgClass =
                  item.points < 0
                    ? 'bg-rose-500'
                    : item.points >= 50
                    ? 'bg-amber-400'
                    : 'bg-emerald-500';
                return (
                  <div
                    key={item.id || idx}
                    style={{ width: `${Math.max(4, pct)}%` }}
                    className={`h-full rounded-sm ${bgClass} transition-all duration-300`}
                    title={`${item.name}: ${(Number(pct) || 0).toFixed(1)}% chance`}
                  />
                );
              })}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400 pt-1">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span>Positive Item (+Pts)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
              <span>Hazard / Bomb (-Pts)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              <span>Bonus Special (+50 Pts)</span>
            </div>
          </div>
        </div>
      )}

      {/* Items Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {items.map((item, index) => {
          const itemWeight = Number(item.spawnWeight) || 10;
          const safeTotal = Number(totalWeight) || 1;
          const spawnPct = (((itemWeight) / safeTotal) * 100).toFixed(1);
          const isHazard = item.points < 0;
          const isBonus = item.points >= 50;
          const itemId = item.id || `item_${index}`;
          const isUploading = uploadingAsset === `item_${itemId}`;

          return (
            <div
              key={itemId}
              className={`bg-slate-900 border rounded-3xl p-5 space-y-4 shadow-lg relative transition-all ${
                isHazard && !isMemoryMatch
                  ? 'border-rose-500/40 bg-gradient-to-b from-rose-950/20 to-slate-900'
                  : isBonus && !isMemoryMatch
                  ? 'border-amber-500/40 bg-gradient-to-b from-amber-950/20 to-slate-900'
                  : 'border-slate-800'
              } ${!item.enabled ? 'opacity-60' : ''}`}
            >
              {/* Item Card Header */}
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-bold text-slate-300 flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-lg bg-slate-800 text-amber-400 font-mono text-[11px] border border-slate-700">
                    {isMemoryMatch ? `Pair #${index + 1}` : `Item #${index + 1}`}
                  </span>
                  {!isMemoryMatch && isHazard && (
                    <span className="px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 text-[10px] border border-rose-500/30">
                      Hazard
                    </span>
                  )}
                  {!isMemoryMatch && isBonus && (
                    <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 text-[10px] border border-amber-500/30">
                      Bonus
                    </span>
                  )}
                </div>

                {/* Duplicate & Delete Actions */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleDuplicateItem(index)}
                    className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
                    title="Duplicate item"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemoveItem(index)}
                    className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                    title="Delete item"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Item Name & Points inputs */}
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2 space-y-1">
                  <label className="text-[11px] font-semibold text-slate-400">
                    {isMemoryMatch ? 'Card Pair Title' : 'Item Name'}
                  </label>
                  <input
                    type="text"
                    value={item.name}
                    onChange={(e) => handleUpdateItem(index, { name: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-400">
                    {isMemoryMatch ? 'Pair Points' : 'Score Points'}
                  </label>
                  <input
                    type="number"
                    value={item.points}
                    onChange={(e) =>
                      handleUpdateItem(index, { points: parseInt(e.target.value) || 0 })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 font-mono font-bold focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Sprite Artwork Visual Upload / Preview */}
              <DropItemArtworkUpload
                index={index}
                itemId={itemId}
                imageUrl={item.imageUrl || ''}
                itemName={item.name}
                scale={item.scale}
                onUpload={(file) => handleItemUpload(file, index)}
                onRemove={() => handleItemRemoveImage(index)}
                isUploading={isUploading}
              />

              {/* Speed Multiplier, Spawn Weight & Proportional Size Scale Sliders (Only for falling games) */}
              {!isMemoryMatch && (
                <div className="grid grid-cols-3 gap-2.5 pt-2 border-t border-slate-800/80">
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] font-semibold text-slate-300">
                      <span>Speed</span>
                      <span className="text-amber-400 font-mono">
                        {(Number(item.speedMultiplier) || 1.0).toFixed(1)}x
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="2.5"
                      step="0.1"
                      value={item.speedMultiplier || 1.0}
                      onChange={(e) =>
                        handleUpdateItem(index, {
                          speedMultiplier: parseFloat(e.target.value) || 1.0,
                        })
                      }
                      className="w-full accent-amber-500 cursor-pointer"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] font-semibold text-slate-300">
                      <span>Weight</span>
                      <span className="text-amber-400 font-mono">
                        {item.spawnWeight || 10} ({spawnPct}%)
                      </span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="50"
                      step="1"
                      value={item.spawnWeight || 10}
                      onChange={(e) =>
                        handleUpdateItem(index, {
                          spawnWeight: parseInt(e.target.value) || 10,
                        })
                      }
                      className="w-full accent-amber-500 cursor-pointer"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] font-semibold text-slate-300">
                      <span>Scale</span>
                      <span className="text-emerald-400 font-mono">
                        {(Number(item.scale) || 1.0).toFixed(1)}x
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="2.0"
                      step="0.1"
                      value={item.scale || 1.0}
                      onChange={(e) =>
                        handleUpdateItem(index, {
                          scale: parseFloat(e.target.value) || 1.0,
                        })
                      }
                      className="w-full accent-emerald-500 cursor-pointer"
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
