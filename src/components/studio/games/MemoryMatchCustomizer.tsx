import React, { useState, useRef } from 'react';
import { GameTheme, ThemeDropItem, getMemoryMatchConfig, DEFAULT_CARD_CONFIG } from '../../../themes/types';
import { MemoryMatchGameConfig, MemoryMatchPairConfig, MemoryMatchCardConfig, MemoryMatchUiConfig } from '../../../games/memory-match/types';
import { ensureRequiredPairs, DEFAULT_CARD_PROTOTYPES } from '../../../games/memory-match/cardDeck';
import {
  Grid3X3,
  Layers,
  Sparkles,
  Upload,
  RefreshCw,
  AlertCircle,
  Clock,
  Zap,
  Volume2,
  CheckCircle2,
  Image as ImageIcon,
  Ticket,
  Star,
  ShoppingBag,
  Tent,
  PartyPopper,
  Trophy,
  Disc,
  Flame,
  Gift,
  HelpCircle,
  Eye,
  Sliders,
  Play,
  RotateCcw,
  Trash2,
  Plus,
  Minus,
  Check,
  AlertTriangle,
  Shuffle,
  Maximize2,
  RotateCw,
  Square,
  RectangleHorizontal,
  RectangleVertical,
  Award,
} from 'lucide-react';
import { memorySounds } from '../../../games/memory-match/memorySounds';

const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
const ALLOWED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'];

export const CARD_SHAPE_PRESETS = [
  { label: 'Square', width: 120, height: 120, borderRadius: 16, desc: '120 × 120 (Standard Classic)' },
  { label: 'Portrait', width: 100, height: 140, borderRadius: 14, desc: '100 × 140 (Playing Card)' },
  { label: 'Landscape', width: 150, height: 105, borderRadius: 14, desc: '150 × 105 (Wide / Film)' },
  { label: 'Tall Card', width: 90, height: 150, borderRadius: 12, desc: '90 × 150 (Slim Portrait)' },
  { label: 'Banner Card', width: 160, height: 95, borderRadius: 12, desc: '160 × 95 (Banner / Ticket)' },
];

export const PRESET_CARD_BACKS: Array<{ name: string; url: string }> = [
  {
    name: 'Geometric Star',
    url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="%23f59e0b"><polygon points="50,10 61,38 91,38 67,56 76,84 50,67 24,84 33,56 9,38 39,38"/></svg>',
  },
  {
    name: 'Crown Emblem',
    url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="%236366f1"><path d="M15,75 L85,75 L80,35 L60,55 L50,25 L40,55 L20,35 Z"/></svg>',
  },
  {
    name: 'Diamond Shield',
    url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="%2310b981"><polygon points="50,15 85,35 85,65 50,85 15,65 15,35"/></svg>',
  },
  {
    name: 'Infinity Loop',
    url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="%23ec4899"><circle cx="35" cy="50" r="18" fill="none" stroke="%23ec4899" stroke-width="8"/><circle cx="65" cy="50" r="18" fill="none" stroke="%23ec4899" stroke-width="8"/></svg>',
  },
];

const CARD_ICONS = [
  { name: 'Ticket', icon: Ticket },
  { name: 'Sparkles', icon: Sparkles },
  { name: 'Star', icon: Star },
  { name: 'ShoppingBag', icon: ShoppingBag },
  { name: 'Tent', icon: Tent },
  { name: 'PartyPopper', icon: PartyPopper },
  { name: 'Trophy', icon: Trophy },
  { name: 'Disc', icon: Disc },
  { name: 'Flame', icon: Flame },
  { name: 'Gift', icon: Gift },
];

/* ==========================================================================
 * MEMORY MATCH - VISUALS CUSTOMIZER (CARD BACK ARTWORK & CARD STYLES)
 * ========================================================================== */
interface MemoryMatchVisualsCustomizerProps {
  theme: GameTheme;
  onChange: (updated: GameTheme) => void;
  onUploadAsset: (file: File, fieldKey: string) => Promise<string>;
  uploadingAsset: string | null;
}

export const MemoryMatchVisualsCustomizer: React.FC<MemoryMatchVisualsCustomizerProps> = ({
  theme,
  onChange,
  onUploadAsset,
  uploadingAsset,
}) => {
  const [cardBackDragActive, setCardBackDragActive] = useState(false);
  const [cardBackUploadError, setCardBackUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const replaceFileInputRef = useRef<HTMLInputElement | null>(null);

  const memoryConfig = getMemoryMatchConfig(theme);
  const currentCardBackUrl = memoryConfig.cardBackUrl || '';

  const updateCardBack = (newCardBackUrl: string | null) => {
    const nextMemoryConfig: MemoryMatchGameConfig = {
      ...memoryConfig,
      cardBackUrl: newCardBackUrl,
    };
    onChange({
      ...theme,
      game_config: nextMemoryConfig,
      visuals_config: {
        ...theme.visuals_config,
        cardBackUrl: newCardBackUrl,
      },
    });
  };

  const processCardBackFile = async (file: File) => {
    setCardBackUploadError(null);

    const extension = '.' + (file.name.split('.').pop() || '').toLowerCase();
    const isValidFormat =
      ALLOWED_MIME_TYPES.includes(file.type.toLowerCase()) ||
      ALLOWED_EXTENSIONS.includes(extension) ||
      file.type === 'image/svg+xml';

    if (!isValidFormat) {
      setCardBackUploadError(
        `Unsupported file format "${file.name}". Please upload a PNG, WebP, or JPG image.`
      );
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setCardBackUploadError(
        `File is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Maximum allowed size is 5MB.`
      );
      return;
    }

    try {
      const uploadedUrl = await onUploadAsset(file, 'cardBack');
      updateCardBack(uploadedUrl);
    } catch (err: any) {
      setCardBackUploadError(err.message || 'Failed to upload card back artwork');
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setCardBackDragActive(true);
    } else if (e.type === 'dragleave') {
      setCardBackDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCardBackDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processCardBackFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-6 shadow-lg">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="p-2 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
            <Layers className="w-4 h-4" />
          </span>
          <div>
            <h3 className="text-sm font-bold text-slate-100">Card Back Pattern & Artwork</h3>
            <p className="text-xs text-slate-400">
              The face-down design displayed on all 16 memory cards before they are flipped
            </p>
          </div>
        </div>
      </div>

      {/* Card Back Upload & Interactive Card Flip Preview */}
      <div className="space-y-4">
        {currentCardBackUrl ? (
          <div className="relative rounded-2xl border border-slate-800 bg-slate-950/60 p-4 flex flex-col sm:flex-row items-center gap-5">
            {/* 3D Card Preview Badge */}
            <div className="w-24 h-32 bg-gradient-to-br from-slate-900 via-amber-950/40 to-slate-900 rounded-2xl border-2 border-amber-500/40 flex flex-col items-center justify-center p-2 shadow-xl shrink-0 group">
              <div className="w-14 h-14 bg-slate-950/80 rounded-xl border border-amber-500/30 flex items-center justify-center p-1.5 shadow-inner">
                <img
                  src={currentCardBackUrl}
                  alt="Card Back"
                  className="max-h-full max-w-full object-contain filter drop-shadow group-hover:scale-105 transition-transform"
                  referrerPolicy="no-referrer"
                />
              </div>
              <span className="text-[10px] font-bold text-amber-400/80 mt-1.5 uppercase tracking-wider">
                Card Back
              </span>
            </div>

            <div className="flex-1 space-y-1.5 min-w-0 text-center sm:text-left">
              <div className="flex items-center justify-center sm:justify-start gap-2">
                <h4 className="text-xs font-bold text-slate-200">Active Card Back Cover</h4>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
                  Active
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Centered symbol or pattern printed on the reverse of every card
              </p>
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1">
                <input
                  type="file"
                  ref={replaceFileInputRef}
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      processCardBackFile(e.target.files[0]);
                      e.target.value = '';
                    }
                  }}
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => replaceFileInputRef.current?.click()}
                  disabled={uploadingAsset === 'cardBack'}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 border border-slate-700"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${uploadingAsset === 'cardBack' ? 'animate-spin' : ''}`} />
                  <span>Replace Artwork</span>
                </button>
                <button
                  type="button"
                  onClick={() => updateCardBack(null)}
                  className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 active:scale-95 text-rose-300 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 border border-rose-500/30"
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
            className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer ${
              cardBackDragActive
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
                  processCardBackFile(e.target.files[0]);
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
                  {uploadingAsset === 'cardBack' ? 'Uploading card back...' : 'Upload custom card back graphic'}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Drag & drop transparent PNG or WebP (max 5MB)
                </p>
              </div>
            </div>
          </div>
        )}

        {cardBackUploadError && (
          <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{cardBackUploadError}</span>
          </div>
        )}

        {/* Preset Card Back Selection */}
        <div className="space-y-2 pt-2 border-t border-slate-800/80">
          <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            Preset Card Backs
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {PRESET_CARD_BACKS.map((preset) => (
              <button
                key={preset.name}
                type="button"
                onClick={() => updateCardBack(preset.url)}
                className={`p-2.5 rounded-xl border text-left flex flex-col items-center gap-2 transition-all ${
                  currentCardBackUrl === preset.url
                    ? 'border-amber-500 bg-amber-500/10 ring-1 ring-amber-500/30'
                    : 'border-slate-800 hover:border-slate-700 bg-slate-950'
                }`}
              >
                <div className="w-12 h-12 flex items-center justify-center bg-slate-900/80 rounded-lg p-1">
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

        {/* Card Style & Glow Accents */}
        <div className="pt-4 border-t border-slate-800/80 space-y-3">
          <h4 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-amber-400" />
            Card Theme & Accent Colors
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {/* Card Matched Border Color */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3 space-y-1.5">
              <label className="text-slate-400 font-semibold">Match Success Border</label>
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
                  className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                />
                <span className="font-mono text-slate-200 uppercase font-bold text-xs">
                  {theme.visuals_config?.cardGoodBorder || '#10b981'}
                </span>
              </div>
            </div>

            {/* Card Mismatch Border Color */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3 space-y-1.5">
              <label className="text-slate-400 font-semibold">Mismatch Alert Border</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={theme.visuals_config?.cardBadBorder || '#f43f5e'}
                  onChange={(e) =>
                    onChange({
                      ...theme,
                      visuals_config: {
                        ...theme.visuals_config,
                        cardBadBorder: e.target.value,
                      },
                    })
                  }
                  className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                />
                <span className="font-mono text-slate-200 uppercase font-bold text-xs">
                  {theme.visuals_config?.cardBadBorder || '#f43f5e'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ==========================================================================
 * MEMORY MATCH - CARDS CUSTOMIZER (DYNAMIC CARD PAIRS MANAGEMENT)
 * ========================================================================== */
interface MemoryMatchCardsCustomizerProps {
  theme: GameTheme;
  onChange: (updated: GameTheme) => void;
  onUploadAsset: (file: File, fieldKey: string) => Promise<string>;
  uploadingAsset: string | null;
}

export const MemoryMatchCardsCustomizer: React.FC<MemoryMatchCardsCustomizerProps> = ({
  theme,
  onChange,
  onUploadAsset,
  uploadingAsset,
}) => {
  const memoryConfig = getMemoryMatchConfig(theme);
  const rows = Math.max(2, memoryConfig.board?.rows ?? memoryConfig.grid?.rows ?? 4);
  const cols = Math.max(2, memoryConfig.board?.cols ?? memoryConfig.grid?.cols ?? 4);
  const layoutMode = memoryConfig.board?.layoutMode ?? 'grid';
  const totalCards = (rows * cols) % 2 === 0 ? rows * cols : 16;
  const requiredPairsCount = Math.floor(totalCards / 2);

  // Ensure we have at least requiredPairsCount pairs available for editing
  const pairs: MemoryMatchPairConfig[] = ensureRequiredPairs(memoryConfig.pairs, requiredPairsCount);

  const handleUpdateCardPair = (index: number, updates: Partial<MemoryMatchPairConfig>) => {
    const updatedPairs = [...pairs];
    updatedPairs[index] = { ...updatedPairs[index], ...updates };

    const nextMemoryConfig: MemoryMatchGameConfig = {
      ...memoryConfig,
      pairs: updatedPairs,
    };

    // Also mirror to items_config for backwards-compatibility
    const nextItemsConfig: ThemeDropItem[] = updatedPairs.map((p, i) => ({
      id: p.id || `pair_${i + 1}`,
      name: p.name || `Card Pair ${i + 1}`,
      imageUrl: p.imageUrl || null,
      points: p.points ?? 100,
      enabled: true,
      isHazard: false,
      isBonus: false,
      speedMultiplier: 1.0,
      spawnWeight: 10,
    }));

    onChange({
      ...theme,
      game_config: nextMemoryConfig,
      items_config: nextItemsConfig,
    });
  };

  const handleUploadCardArtwork = async (index: number, file: File) => {
    try {
      const url = await onUploadAsset(file, `card_pair_${index}`);
      handleUpdateCardPair(index, { imageUrl: url });
    } catch (err: any) {
      console.error('Failed to upload card artwork:', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-lg flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="p-2 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
            {layoutMode === 'random' ? <Shuffle className="w-4 h-4" /> : <Grid3X3 className="w-4 h-4" />}
          </span>
          <div>
            <h3 className="text-sm font-bold text-slate-100">
              {requiredPairsCount} Memory Card Pairs ({totalCards} Cards)
            </h3>
            <p className="text-xs text-slate-400">
              Customize the front art, title, and symbol for the {rows} × {cols} {layoutMode === 'random' ? 'scattered' : 'grid'} board ({requiredPairsCount} active pairs)
            </p>
          </div>
        </div>
      </div>

      {/* Pairs Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {pairs.map((pair, idx) => {
          const isUploadingThis = uploadingAsset === `card_pair_${idx}`;
          const currentImg = pair.imageUrl;
          const isActiveOnBoard = idx < requiredPairsCount;

          return (
            <div
              key={pair.id || idx}
              className={`bg-slate-900 border ${
                isActiveOnBoard ? 'border-slate-800 hover:border-slate-700/80' : 'border-slate-855 opacity-75'
              } rounded-3xl p-4.5 space-y-3.5 shadow-lg transition-all`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className={`w-6 h-6 rounded-lg ${
                    isActiveOnBoard
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                      : 'bg-slate-800 border-slate-700 text-slate-400'
                  } border text-xs font-mono font-bold flex items-center justify-center shrink-0`}>
                    {idx + 1}
                  </span>
                  <input
                    type="text"
                    value={pair.name || `Pair ${idx + 1}`}
                    onChange={(e) => handleUpdateCardPair(idx, { name: e.target.value })}
                    className="bg-transparent text-xs font-bold text-slate-100 border-b border-transparent hover:border-slate-700 focus:border-amber-500 focus:outline-none px-1 truncate"
                    placeholder={`Card Pair ${idx + 1}`}
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                    isActiveOnBoard
                      ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                      : 'text-slate-400 bg-slate-800 border-slate-700'
                  }`}>
                    +{pair.points || 100} pts
                  </span>
                  {!isActiveOnBoard && (
                    <span className="text-[9px] font-mono text-slate-500 px-1.5 py-0.5 bg-slate-950 rounded border border-slate-800" title="Preserved in theme configuration">
                      Saved
                    </span>
                  )}
                </div>
              </div>

              {/* Card Artwork & Upload Button */}
              <div className="flex items-center gap-3.5 bg-slate-950/80 p-3 rounded-2xl border border-slate-850">
                <div className="w-14 h-14 bg-slate-900 rounded-xl border border-slate-800 flex items-center justify-center p-1 shrink-0 overflow-hidden relative">
                  {currentImg ? (
                    <img
                      src={currentImg}
                      alt={pair.name}
                      className="max-h-full max-w-full object-contain filter drop-shadow"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <Sparkles className="w-6 h-6 text-amber-400/60" />
                  )}
                </div>

                <div className="flex-1 min-w-0 space-y-1.5">
                  <label className="block text-[11px] font-semibold text-slate-300">
                    {currentImg ? 'Custom Card Artwork' : 'Default Theme Graphic'}
                  </label>
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl cursor-pointer transition-all border border-slate-700 active:scale-95">
                    <Upload className={`w-3.5 h-3.5 ${isUploadingThis ? 'animate-bounce' : ''}`} />
                    <span>{isUploadingThis ? 'Uploading...' : 'Upload Image'}</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          handleUploadCardArtwork(idx, e.target.files[0]);
                          e.target.value = '';
                        }
                      }}
                      className="hidden"
                    />
                  </label>
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
 * MEMORY MATCH - GAME LAYOUT CUSTOMIZER (BOARD, GRID / RANDOM, CARD SHAPES)
 * ========================================================================== */
interface MemoryMatchGameLayoutCustomizerProps {
  theme: GameTheme;
  onChange: (updated: GameTheme) => void;
}

const GRID_PRESETS = [
  { label: '4 × 4', rows: 4, cols: 4, desc: '16 Cards • 8 Pairs (Standard)' },
  { label: '4 × 5', rows: 4, cols: 5, desc: '20 Cards • 10 Pairs (Medium)' },
  { label: '5 × 6', rows: 5, cols: 6, desc: '30 Cards • 15 Pairs (Large)' },
  { label: '6 × 6', rows: 6, cols: 6, desc: '36 Cards • 18 Pairs (Expert)' },
  { label: '3 × 4', rows: 3, cols: 4, desc: '12 Cards • 6 Pairs (Quick)' },
  { label: '2 × 4', rows: 2, cols: 4, desc: '8 Cards • 4 Pairs (Mini)' },
];

const RANDOM_PRESETS = [
  { label: '8 Cards', rows: 2, cols: 4, desc: '4 Pairs (Scattered Mini)' },
  { label: '12 Cards', rows: 3, cols: 4, desc: '6 Pairs (Scattered Quick)' },
  { label: '16 Cards', rows: 4, cols: 4, desc: '8 Pairs (Scattered Standard)' },
  { label: '20 Cards', rows: 4, cols: 5, desc: '10 Pairs (Scattered Medium)' },
  { label: '24 Cards', rows: 4, cols: 6, desc: '12 Pairs (Scattered Large)' },
  { label: '30 Cards', rows: 5, cols: 6, desc: '15 Pairs (Scattered Expert)' },
];

export const MemoryMatchGameLayoutCustomizer: React.FC<MemoryMatchGameLayoutCustomizerProps> = ({
  theme,
  onChange,
}) => {
  const memoryConfig = getMemoryMatchConfig(theme);
  const board = memoryConfig.board;
  const cardConfig = memoryConfig.card || board.card || DEFAULT_CARD_CONFIG;

  const currentLayoutMode = board.layoutMode;
  const currentRows = board.rows;
  const currentCols = board.cols;
  const currentCardGap = board.cardGap ?? 12;
  const currentMinSpacing = board.randomLayout.minSpacing ?? 12;
  const currentRotationMin = board.randomLayout.rotationMin ?? -8;
  const currentRotationMax = board.randomLayout.rotationMax ?? 8;

  const cardWidth = cardConfig.width ?? 120;
  const cardHeight = cardConfig.height ?? 120;
  const cardBorderRadius = cardConfig.borderRadius ?? 16;
  const cardRotationMode = cardConfig.rotationMode ?? 'none';
  const cardRotation = cardConfig.rotation ?? 0;
  const cardRotationRange = cardConfig.rotationRange ?? 8;

  const [rowsInput, setRowsInput] = useState<number>(currentRows);
  const [colsInput, setColsInput] = useState<number>(currentCols);

  // Keep local inputs in sync with incoming theme
  React.useEffect(() => {
    setRowsInput(board.rows);
    setColsInput(board.cols);
  }, [board.rows, board.cols]);

  const totalCards = rowsInput * colsInput;
  const isOdd = totalCards % 2 !== 0;

  const handleUpdateCardConfig = (updates: Partial<MemoryMatchCardConfig>) => {
    const nextCardConfig: MemoryMatchCardConfig = {
      ...cardConfig,
      ...updates,
    };
    const nextBoard = {
      ...board,
      card: nextCardConfig,
    };
    const nextMemoryConfig: MemoryMatchGameConfig = {
      ...memoryConfig,
      card: nextCardConfig,
      board: nextBoard,
    };
    onChange({
      ...theme,
      game_config: nextMemoryConfig,
    });
  };

  const handleUpdateBoard = (updates: Partial<typeof board>) => {
    const nextBoard = {
      ...board,
      ...updates,
    };

    const validRows = Math.min(6, Math.max(2, nextBoard.rows));
    const validCols = Math.min(6, Math.max(2, nextBoard.cols));
    nextBoard.rows = validRows;
    nextBoard.cols = validCols;

    setRowsInput(validRows);
    setColsInput(validCols);

    const product = validRows * validCols;
    if (product % 2 !== 0) {
      // Don't commit invalid odd card count to theme
      return;
    }

    const requiredPairs = product / 2;
    // Safely preserve all existing pair definitions and backfill if increasing
    const updatedPairs = ensureRequiredPairs(memoryConfig.pairs, requiredPairs);

    const nextMemoryConfig: MemoryMatchGameConfig = {
      ...memoryConfig,
      board: nextBoard,
      grid: {
        rows: validRows,
        cols: validCols,
      },
      pairs: updatedPairs,
    };

    // Mirror to items_config for backwards-compatibility
    const nextItemsConfig: ThemeDropItem[] = updatedPairs.map((p, i) => ({
      id: p.id || `pair_${i + 1}`,
      name: p.name || `Card Pair ${i + 1}`,
      imageUrl: p.imageUrl || null,
      points: p.points ?? 100,
      enabled: true,
      isHazard: false,
      isBonus: false,
      speedMultiplier: 1.0,
      spawnWeight: 10,
    }));

    onChange({
      ...theme,
      game_config: nextMemoryConfig,
      items_config: nextItemsConfig,
    });
  };

  return (
    <div className="space-y-6">
      {/* 1. Board Layout Customization Section */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-5 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
              {currentLayoutMode === 'random' ? <Shuffle className="w-4 h-4" /> : <Grid3X3 className="w-4 h-4" />}
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-100">Board Layout & Card Arrangement</h3>
              <p className="text-xs text-slate-400">
                Choose between structured CSS Grid or dynamic Scattered / Random card placement
              </p>
            </div>
          </div>
          <div className="text-right">
            <span className="text-emerald-400 font-bold font-mono text-sm block">
              {currentRows} × {currentCols} ({currentLayoutMode === 'random' ? 'Random' : 'Grid'})
            </span>
            <span className="text-[11px] text-slate-400 font-mono">
              {currentRows * currentCols} Cards • {(currentRows * currentCols) / 2} Pairs
            </span>
          </div>
        </div>

        {/* Layout Style Toggle: [ Grid ] [ Random / Scattered ] */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-300 block">
            Layout Style
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleUpdateBoard({ layoutMode: 'grid' })}
              className={`p-3 rounded-2xl border flex items-center justify-center gap-2.5 transition-all cursor-pointer ${
                currentLayoutMode === 'grid'
                  ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-300 shadow-md shadow-emerald-500/10 font-bold'
                  : 'bg-slate-950/80 border-slate-800 hover:border-slate-700 text-slate-400 font-medium'
              }`}
            >
              <Grid3X3 className="w-4 h-4 text-emerald-400" />
              <span className="text-xs">Grid Layout</span>
              {currentLayoutMode === 'grid' && <Check className="w-3.5 h-3.5 text-emerald-400 ml-1" />}
            </button>

            <button
              type="button"
              onClick={() => handleUpdateBoard({ layoutMode: 'random' })}
              className={`p-3 rounded-2xl border flex items-center justify-center gap-2.5 transition-all cursor-pointer ${
                currentLayoutMode === 'random'
                  ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-300 shadow-md shadow-emerald-500/10 font-bold'
                  : 'bg-slate-950/80 border-slate-800 hover:border-slate-700 text-slate-400 font-medium'
              }`}
            >
              <Shuffle className="w-4 h-4 text-emerald-400" />
              <span className="text-xs">Random / Scattered</span>
              {currentLayoutMode === 'random' && <Check className="w-3.5 h-3.5 text-emerald-400 ml-1" />}
            </button>
          </div>
        </div>

        {/* Quick Layout Presets */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-300 block">
            {currentLayoutMode === 'random' ? 'Quick Card Count Presets' : 'Quick Grid Presets'}
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {(currentLayoutMode === 'random' ? RANDOM_PRESETS : GRID_PRESETS).map((preset) => {
              const isSelected = currentRows === preset.rows && currentCols === preset.cols;
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => handleUpdateBoard({ rows: preset.rows, cols: preset.cols })}
                  className={`p-2.5 rounded-2xl border text-left transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-emerald-500/15 border-emerald-500/60 shadow-md shadow-emerald-500/10'
                      : 'bg-slate-950/80 border-slate-800 hover:border-slate-700 text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-xs text-slate-100">
                      {preset.label}
                    </span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                  </div>
                  <span className="text-[10px] text-slate-400 block mt-0.5 truncate">
                    {preset.desc}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom Row & Column Dimension Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
          {/* Rows Selector */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300">
                Rows (2 – 6)
              </span>
              <span className="text-emerald-400 font-bold font-mono text-sm">
                {rowsInput} Rows
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={rowsInput <= 2}
                onClick={() => handleUpdateBoard({ rows: rowsInput - 1, cols: colsInput })}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 transition-colors cursor-pointer"
              >
                <Minus className="w-4 h-4" />
              </button>
              <input
                type="range"
                min="2"
                max="6"
                step="1"
                value={rowsInput}
                onChange={(e) => handleUpdateBoard({ rows: parseInt(e.target.value) || 2, cols: colsInput })}
                className="flex-1 accent-emerald-500 cursor-pointer"
              />
              <button
                type="button"
                disabled={rowsInput >= 6}
                onClick={() => handleUpdateBoard({ rows: rowsInput + 1, cols: colsInput })}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Columns Selector */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300">
                Columns (2 – 6)
              </span>
              <span className="text-emerald-400 font-bold font-mono text-sm">
                {colsInput} Columns
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={colsInput <= 2}
                onClick={() => handleUpdateBoard({ rows: rowsInput, cols: colsInput - 1 })}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 transition-colors cursor-pointer"
              >
                <Minus className="w-4 h-4" />
              </button>
              <input
                type="range"
                min="2"
                max="6"
                step="1"
                value={colsInput}
                onChange={(e) => handleUpdateBoard({ rows: rowsInput, cols: parseInt(e.target.value) || 2 })}
                className="flex-1 accent-emerald-500 cursor-pointer"
              />
              <button
                type="button"
                disabled={colsInput >= 6}
                onClick={() => handleUpdateBoard({ rows: rowsInput, cols: colsInput + 1 })}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Mode-Specific Fine Tuning Controls */}
        {currentLayoutMode === 'grid' ? (
          /* Grid Mode: Card Gap Control */
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300">
                Grid Card Gap (4 – 32 px)
              </span>
              <span className="text-emerald-400 font-bold font-mono text-sm">
                {currentCardGap} px
              </span>
            </div>
            <input
              type="range"
              min="4"
              max="32"
              step="2"
              value={currentCardGap}
              onChange={(e) => handleUpdateBoard({ cardGap: parseInt(e.target.value) || 12 })}
              className="w-full accent-emerald-500 cursor-pointer"
            />
          </div>
        ) : (
          /* Random Mode: Minimum Spacing & Rotation Range Controls */
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Minimum Spacing */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300">
                  Min Card Spacing (0 – 40 px)
                </span>
                <span className="text-emerald-400 font-bold font-mono text-sm">
                  {currentMinSpacing} px
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="40"
                step="2"
                value={currentMinSpacing}
                onChange={(e) =>
                  handleUpdateBoard({
                    randomLayout: {
                      ...board.randomLayout,
                      minSpacing: parseInt(e.target.value) || 0,
                    },
                  })
                }
                className="w-full accent-emerald-500 cursor-pointer"
              />
              <p className="text-[10px] text-slate-500">
                Guarantees minimum distance between scattered card centers
              </p>
            </div>

            {/* Card Rotation Range */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300">
                  Card Tilt Range ({currentRotationMin}° to {currentRotationMax}°)
                </span>
                <span className="text-emerald-400 font-bold font-mono text-sm">
                  ±{Math.max(Math.abs(currentRotationMin), Math.abs(currentRotationMax))}°
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="15"
                step="1"
                value={Math.max(Math.abs(currentRotationMin), Math.abs(currentRotationMax))}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || 0;
                  handleUpdateBoard({
                    randomLayout: {
                      ...board.randomLayout,
                      rotationMin: -val,
                      rotationMax: val,
                    },
                  });
                }}
                className="w-full accent-emerald-500 cursor-pointer"
              />
              <p className="text-[10px] text-slate-500">
                Random angle range applied to scattered cards (0° to 15°)
              </p>
            </div>
          </div>
        )}

        {/* Odd Product Validation Warning */}
        {isOdd && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-center gap-2.5 text-rose-400 text-xs animate-in fade-in">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <p>
              <strong>Odd Card Count ({totalCards} Cards):</strong> Memory Match requires an even total number of cards so every card has a matching twin. Please adjust rows or columns to make the product even.
            </p>
          </div>
        )}

        {/* Dynamic Matrix Summary Callout */}
        <div className="bg-slate-950/70 border border-slate-850 rounded-2xl p-3.5 flex items-center justify-between text-xs">
          <div className="space-y-0.5">
            <span className="font-bold text-slate-200 block">
              Active Configuration: {currentRows} × {currentCols} ({currentLayoutMode === 'random' ? 'Scattered Layout' : 'CSS Grid'})
            </span>
            <span className="text-[11px] text-slate-400">
              {currentRows * currentCols} Cards total • {(currentRows * currentCols) / 2} Matching Pairs
            </span>
          </div>
          <span className="px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full font-mono font-bold text-[11px]">
            {(currentRows * currentCols) / 2} Pairs Active
          </span>
        </div>
      </div>

      {/* 2. Card Dimensions, Shape & Rotation Section */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-5 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="p-2 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20">
              <Layers className="w-4 h-4" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-100">Card Dimensions, Shape & Rotation</h3>
              <p className="text-xs text-slate-400">
                Configure card width, height, corner roundness, and individual card rotation
              </p>
            </div>
          </div>
          <div className="text-right">
            <span className="text-indigo-400 font-bold font-mono text-sm block">
              {cardWidth} × {cardHeight} px
            </span>
            <span className="text-[11px] text-slate-400 font-mono">
              {(cardWidth / cardHeight).toFixed(2)} : 1 •{' '}
              {cardWidth === cardHeight ? 'Square' : cardWidth > cardHeight ? 'Landscape' : 'Portrait'}
            </span>
          </div>
        </div>

        {/* Shape Presets */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-300 block">
            Card Shape Presets
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {CARD_SHAPE_PRESETS.map((preset) => {
              const isSelected =
                cardWidth === preset.width &&
                cardHeight === preset.height &&
                cardBorderRadius === preset.borderRadius;

              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() =>
                    handleUpdateCardConfig({
                      width: preset.width,
                      height: preset.height,
                      borderRadius: preset.borderRadius,
                    })
                  }
                  className={`p-2.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? 'bg-indigo-500/15 border-indigo-500/60 shadow-md shadow-indigo-500/10'
                      : 'bg-slate-950/80 border-slate-800 hover:border-slate-700 text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-xs text-slate-100">
                      {preset.label}
                    </span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-indigo-400" />}
                  </div>
                  <span className="text-[10px] text-slate-400 block mt-1">
                    {preset.desc}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Independent Width and Height Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
          {/* Card Width */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <RectangleHorizontal className="w-3.5 h-3.5 text-indigo-400" />
                Card Width (60 – 240 px)
              </span>
              <span className="text-indigo-400 font-bold font-mono text-sm">
                {cardWidth} px
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={cardWidth <= 60}
                onClick={() => handleUpdateCardConfig({ width: Math.max(60, cardWidth - 10) })}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 transition-colors cursor-pointer"
              >
                <Minus className="w-4 h-4" />
              </button>
              <input
                type="range"
                min="60"
                max="240"
                step="5"
                value={cardWidth}
                onChange={(e) => handleUpdateCardConfig({ width: parseInt(e.target.value) || 120 })}
                className="flex-1 accent-indigo-500 cursor-pointer"
              />
              <button
                type="button"
                disabled={cardWidth >= 240}
                onClick={() => handleUpdateCardConfig({ width: Math.min(240, cardWidth + 10) })}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Card Height */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <RectangleVertical className="w-3.5 h-3.5 text-indigo-400" />
                Card Height (60 – 240 px)
              </span>
              <span className="text-indigo-400 font-bold font-mono text-sm">
                {cardHeight} px
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={cardHeight <= 60}
                onClick={() => handleUpdateCardConfig({ height: Math.max(60, cardHeight - 10) })}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 transition-colors cursor-pointer"
              >
                <Minus className="w-4 h-4" />
              </button>
              <input
                type="range"
                min="60"
                max="240"
                step="5"
                value={cardHeight}
                onChange={(e) => handleUpdateCardConfig({ height: parseInt(e.target.value) || 120 })}
                className="flex-1 accent-indigo-500 cursor-pointer"
              />
              <button
                type="button"
                disabled={cardHeight >= 240}
                onClick={() => handleUpdateCardConfig({ height: Math.min(240, cardHeight + 10) })}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Card Border Radius Control */}
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300">
              Corner Border Radius (0 – 36 px)
            </span>
            <span className="text-indigo-400 font-bold font-mono text-sm">
              {cardBorderRadius} px
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={cardBorderRadius <= 0}
              onClick={() => handleUpdateCardConfig({ borderRadius: Math.max(0, cardBorderRadius - 2) })}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 transition-colors cursor-pointer"
            >
              <Minus className="w-4 h-4" />
            </button>
            <input
              type="range"
              min="0"
              max="36"
              step="2"
              value={cardBorderRadius}
              onChange={(e) => handleUpdateCardConfig({ borderRadius: parseInt(e.target.value) || 0 })}
              className="flex-1 accent-indigo-500 cursor-pointer"
            />
            <button
              type="button"
              disabled={cardBorderRadius >= 36}
              onClick={() => handleUpdateCardConfig({ borderRadius: Math.min(36, cardBorderRadius + 2) })}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Card Rotation Mode Selector & Controls */}
        <div className="space-y-3 pt-2 border-t border-slate-800/80">
          <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <RotateCw className="w-3.5 h-3.5 text-indigo-400" />
            Card Rotation Mode
          </label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => handleUpdateCardConfig({ rotationMode: 'none', rotation: 0 })}
              className={`p-3 rounded-2xl border text-center transition-all cursor-pointer ${
                cardRotationMode === 'none'
                  ? 'bg-indigo-500/20 border-indigo-500/60 text-indigo-300 font-bold shadow-md shadow-indigo-500/10'
                  : 'bg-slate-950/80 border-slate-800 hover:border-slate-700 text-slate-400 font-medium'
              }`}
            >
              <span className="text-xs block">Upright (0°)</span>
              <span className="text-[10px] text-slate-500">No rotation</span>
            </button>

            <button
              type="button"
              onClick={() => handleUpdateCardConfig({ rotationMode: 'fixed' })}
              className={`p-3 rounded-2xl border text-center transition-all cursor-pointer ${
                cardRotationMode === 'fixed'
                  ? 'bg-indigo-500/20 border-indigo-500/60 text-indigo-300 font-bold shadow-md shadow-indigo-500/10'
                  : 'bg-slate-950/80 border-slate-800 hover:border-slate-700 text-slate-400 font-medium'
              }`}
            >
              <span className="text-xs block">Fixed Angle</span>
              <span className="text-[10px] text-slate-500">Uniform angle</span>
            </button>

            <button
              type="button"
              onClick={() => handleUpdateCardConfig({ rotationMode: 'random' })}
              className={`p-3 rounded-2xl border text-center transition-all cursor-pointer ${
                cardRotationMode === 'random'
                  ? 'bg-indigo-500/20 border-indigo-500/60 text-indigo-300 font-bold shadow-md shadow-indigo-500/10'
                  : 'bg-slate-950/80 border-slate-800 hover:border-slate-700 text-slate-400 font-medium'
              }`}
            >
              <span className="text-xs block">Random Tilt</span>
              <span className="text-[10px] text-slate-500">Stable per card</span>
            </button>
          </div>

          {/* Fixed Rotation Slider */}
          {cardRotationMode === 'fixed' && (
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300">
                  Fixed Card Angle (-45° to +45°)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleUpdateCardConfig({ rotation: 0 })}
                    className="px-2 py-0.5 text-[10px] rounded bg-slate-800 text-slate-300 hover:bg-slate-700"
                  >
                    Reset (0°)
                  </button>
                  <span className="text-indigo-400 font-bold font-mono text-sm">
                    {cardRotation}°
                  </span>
                </div>
              </div>
              <input
                type="range"
                min="-45"
                max="45"
                step="1"
                value={cardRotation}
                onChange={(e) => handleUpdateCardConfig({ rotation: parseInt(e.target.value) || 0 })}
                className="w-full accent-indigo-500 cursor-pointer"
              />
              <p className="text-[10px] text-slate-500">
                Rotates each card on the board uniformly by {cardRotation}° without rotating the entire board container.
              </p>
            </div>
          )}

          {/* Random Rotation Range Slider */}
          {cardRotationMode === 'random' && (
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300">
                  Random Tilt Range (±1° to ±30°)
                </span>
                <span className="text-indigo-400 font-bold font-mono text-sm">
                  ±{cardRotationRange}°
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="30"
                step="1"
                value={cardRotationRange}
                onChange={(e) => handleUpdateCardConfig({ rotationRange: parseInt(e.target.value) || 8 })}
                className="w-full accent-indigo-500 cursor-pointer"
              />
              <p className="text-[10px] text-slate-500">
                Each card gets a stable, deterministic random rotation angle within [-{cardRotationRange}°, +{cardRotationRange}°] assigned at shuffle time.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* ==========================================================================
 * MEMORY MATCH - GAMEPLAY CUSTOMIZER (TIMER, SCORING, LEADERBOARD TOGGLE)
 * ========================================================================== */
interface MemoryMatchGameplayCustomizerProps {
  theme: GameTheme;
  onChange: (updated: GameTheme) => void;
}

export const MemoryMatchGameplayCustomizer: React.FC<MemoryMatchGameplayCustomizerProps> = ({
  theme,
  onChange,
}) => {
  const memoryConfig = getMemoryMatchConfig(theme);
  const gameplay = memoryConfig.gameplay;
  const showLeaderboard = memoryConfig.ui?.showLeaderboard !== false;

  const handleUpdateGameplay = (updates: Partial<typeof gameplay>) => {
    const nextGameplay = {
      ...gameplay,
      ...updates,
    };
    const nextMemoryConfig: MemoryMatchGameConfig = {
      ...memoryConfig,
      gameplay: nextGameplay,
    };

    // Mirror to physics_config for backward-compatibility
    const nextPhysics = {
      ...(theme.physics_config || {}),
      gameDurationSeconds: nextGameplay.gameDurationSeconds,
      spawnIntervalMin: nextGameplay.mismatchDelayMs,
    };

    onChange({
      ...theme,
      game_config: nextMemoryConfig,
      physics_config: nextPhysics as any,
    });
  };

  const handleUpdateUi = (updates: Partial<MemoryMatchUiConfig>) => {
    const nextUi: MemoryMatchUiConfig = {
      showLeaderboard: memoryConfig.ui?.showLeaderboard !== false,
      ...updates,
    };
    const nextMemoryConfig: MemoryMatchGameConfig = {
      ...memoryConfig,
      ui: nextUi,
    };

    onChange({
      ...theme,
      game_config: nextMemoryConfig,
    });
  };

  return (
    <div className="space-y-6">
      {/* 1. Session Timing & Mismatch Delay Section */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-5 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="p-2 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
              <Clock className="w-4 h-4" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-100">Session Timer & Mismatch Reveal</h3>
              <p className="text-xs text-slate-400">
                Configure game session countdown duration and mismatch reveal speed
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Match Duration */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                Match Duration
              </span>
              <span className="text-amber-400 font-bold font-mono text-sm">
                {gameplay.gameDurationSeconds || 45}s
              </span>
            </div>
            <input
              type="range"
              min="15"
              max="180"
              step="5"
              value={gameplay.gameDurationSeconds || 45}
              onChange={(e) => handleUpdateGameplay({ gameDurationSeconds: parseInt(e.target.value) || 45 })}
              className="w-full accent-amber-500 cursor-pointer"
            />
          </div>

          {/* Mismatch Delay */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                Mismatch Delay
              </span>
              <span className="text-amber-400 font-bold font-mono text-sm">
                {gameplay.mismatchDelayMs || 850}ms
              </span>
            </div>
            <input
              type="range"
              min="300"
              max="2000"
              step="50"
              value={gameplay.mismatchDelayMs || 850}
              onChange={(e) => handleUpdateGameplay({ mismatchDelayMs: parseInt(e.target.value) || 850 })}
              className="w-full accent-amber-500 cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* 2. Points & Combo Bonuses */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-5 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
              <Sparkles className="w-4 h-4" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-100">Scoring & Combo Multipliers</h3>
              <p className="text-xs text-slate-400">
                Reward players for swift matching and consecutive combos
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Match Base Points */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300">Base Match Points</span>
              <span className="text-emerald-400 font-bold font-mono text-sm">
                +{gameplay.matchPoints || 100} pts
              </span>
            </div>
            <input
              type="range"
              min="50"
              max="500"
              step="25"
              value={gameplay.matchPoints || 100}
              onChange={(e) => handleUpdateGameplay({ matchPoints: parseInt(e.target.value) || 100 })}
              className="w-full accent-emerald-500 cursor-pointer"
            />
          </div>

          {/* Combo Streak Bonus */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300">Combo Streak Bonus</span>
              <span className="text-emerald-400 font-bold font-mono text-sm">
                +{gameplay.comboPoints || 30} pts/streak
              </span>
            </div>
            <input
              type="range"
              min="10"
              max="100"
              step="5"
              value={gameplay.comboPoints || 30}
              onChange={(e) => handleUpdateGameplay({ comboPoints: parseInt(e.target.value) || 30 })}
              className="w-full accent-emerald-500 cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* 3. Leaderboard & End Screen Settings */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-5 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="p-2 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
              <Award className="w-4 h-4" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-100">Leaderboard & Social Display</h3>
              <p className="text-xs text-slate-400">
                Control whether the arcade high-score board and player submission prompt appear
              </p>
            </div>
          </div>
          <span
            className={`px-3 py-1 rounded-full text-[11px] font-bold border transition-all ${
              showLeaderboard
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}
          >
            {showLeaderboard ? 'Leaderboard Enabled' : 'Leaderboard Hidden'}
          </span>
        </div>

        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex items-center justify-between gap-4">
          <div className="space-y-1 max-w-md">
            <label htmlFor="showLeaderboardToggle" className="text-sm font-bold text-slate-200 cursor-pointer flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-400" />
              Show Leaderboard
            </label>
            <p className="text-xs text-slate-400">
              Display the high-score leaderboard and submission prompt at the end of the game.
              When disabled, only the game summary and replay button are shown.
            </p>
          </div>

          <button
            id="showLeaderboardToggle"
            type="button"
            role="switch"
            aria-checked={showLeaderboard}
            onClick={() => handleUpdateUi({ showLeaderboard: !showLeaderboard })}
            className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
              showLeaderboard ? 'bg-emerald-500' : 'bg-slate-800'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                showLeaderboard ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  );
};

/* ==========================================================================
 * MEMORY MATCH - AUDIO SOUND TESTER
 * ========================================================================== */
export const MemoryMatchAudioTester: React.FC = () => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-lg">
      <div className="flex items-center gap-2">
        <span className="p-2 bg-purple-500/10 text-purple-400 rounded-xl border border-purple-500/20">
          <Volume2 className="w-4 h-4" />
        </span>
        <div>
          <h3 className="text-sm font-bold text-slate-100">Memory Sound FX Previews</h3>
          <p className="text-xs text-slate-400">
            Synthesized zero-latency Web Audio sound effects crafted for card matching
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
        <button
          type="button"
          onClick={() => memorySounds.playCardFlip()}
          className="p-3 bg-slate-950 hover:bg-slate-850 active:scale-95 border border-slate-800 hover:border-amber-500/40 rounded-2xl flex flex-col items-center gap-1.5 text-center transition-all text-xs font-bold text-slate-200"
        >
          <RotateCcw className="w-4 h-4 text-amber-400" />
          <span>Card Flip</span>
        </button>

        <button
          type="button"
          onClick={() => memorySounds.playMatchSuccess(1)}
          className="p-3 bg-slate-950 hover:bg-slate-850 active:scale-95 border border-slate-800 hover:border-emerald-500/40 rounded-2xl flex flex-col items-center gap-1.5 text-center transition-all text-xs font-bold text-slate-200"
        >
          <Sparkles className="w-4 h-4 text-emerald-400" />
          <span>Match Chime</span>
        </button>

        <button
          type="button"
          onClick={() => memorySounds.playMismatch()}
          className="p-3 bg-slate-950 hover:bg-slate-850 active:scale-95 border border-slate-800 hover:border-rose-500/40 rounded-2xl flex flex-col items-center gap-1.5 text-center transition-all text-xs font-bold text-slate-200"
        >
          <AlertCircle className="w-4 h-4 text-rose-400" />
          <span>Mismatch Buzz</span>
        </button>

        <button
          type="button"
          onClick={() => memorySounds.playVictory()}
          className="p-3 bg-slate-950 hover:bg-slate-850 active:scale-95 border border-slate-800 hover:border-amber-500/40 rounded-2xl flex flex-col items-center gap-1.5 text-center transition-all text-xs font-bold text-slate-200"
        >
          <Trophy className="w-4 h-4 text-amber-400" />
          <span>Victory Fanfare</span>
        </button>
      </div>
    </div>
  );
};

