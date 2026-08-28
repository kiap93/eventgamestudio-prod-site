import React, { useState, useRef } from 'react';
import { GameTheme, ThemeDropItem } from '../../../themes/types';
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
} from 'lucide-react';
import { memorySounds } from '../../../games/memory-match/memorySounds';

const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
const ALLOWED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'];

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

  const currentCardBackUrl = theme.visuals_config?.cardBackUrl || '';

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
      onChange({
        ...theme,
        visuals_config: {
          ...theme.visuals_config,
          cardBackUrl: uploadedUrl,
        },
      });
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
                  onClick={() => {
                    onChange({
                      ...theme,
                      visuals_config: {
                        ...theme.visuals_config,
                        cardBackUrl: null,
                      },
                    });
                  }}
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
                onClick={() => {
                  onChange({
                    ...theme,
                    visuals_config: {
                      ...theme.visuals_config,
                      cardBackUrl: preset.url,
                    },
                  });
                }}
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
 * MEMORY MATCH - CARDS CUSTOMIZER (8 CARD PAIRS MANAGEMENT)
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
  // Ensure we display 8 card pairs
  const rawItems = theme.items_config || [];
  const [editingPairIdx, setEditingPairIdx] = useState<number | null>(null);

  // Initialize or ensure 8 card items
  const cardPairs: ThemeDropItem[] = Array.from({ length: 8 }).map((_, idx) => {
    if (rawItems[idx]) {
      return rawItems[idx];
    }
    return {
      id: `pair_${idx + 1}`,
      name: `Card Pair ${idx + 1}`,
      imageUrl: null,
      points: 100,
      enabled: true,
      isHazard: false,
      isBonus: false,
      speedMultiplier: 1.0,
      spawnWeight: 10,
    };
  });

  const handleUpdateCardPair = (index: number, updates: Partial<ThemeDropItem>) => {
    const updated = [...cardPairs];
    updated[index] = { ...updated[index], ...updates };
    onChange({
      ...theme,
      items_config: updated,
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
            <Grid3X3 className="w-4 h-4" />
          </span>
          <div>
            <h3 className="text-sm font-bold text-slate-100">8 Memory Card Pairs (16 Cards)</h3>
            <p className="text-xs text-slate-400">
              Customize the front art, title, and symbol for each of the 8 unique matching pairs
            </p>
          </div>
        </div>
      </div>

      {/* 8 Pairs Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {cardPairs.map((pair, idx) => {
          const isUploadingThis = uploadingAsset === `card_pair_${idx}`;
          const currentImg = pair.imageUrl;

          return (
            <div
              key={pair.id || idx}
              className="bg-slate-900 border border-slate-800 hover:border-slate-700/80 rounded-3xl p-4.5 space-y-3.5 shadow-lg transition-all"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-6 h-6 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-mono font-bold flex items-center justify-center shrink-0">
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
                <span className="text-[10px] font-mono text-emerald-400 font-bold px-2 py-0.5 bg-emerald-500/10 rounded-full border border-emerald-500/20">
                  +{pair.points || 100} pts
                </span>
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
 * MEMORY MATCH - GAMEPLAY CUSTOMIZER (GRID, TIMER, DELAYS & SCORING)
 * ========================================================================== */
interface MemoryMatchGameplayCustomizerProps {
  theme: GameTheme;
  onChange: (updated: GameTheme) => void;
}

export const MemoryMatchGameplayCustomizer: React.FC<MemoryMatchGameplayCustomizerProps> = ({
  theme,
  onChange,
}) => {
  const physics = theme.physics_config || {
    gameDurationSeconds: 45,
    baseFallSpeed: 500,
    fallSpeedMultiplier: 1.0,
    spawnIntervalMin: 850,
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
              <Grid3X3 className="w-4 h-4" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-100">Memory Puzzle Dynamics</h3>
              <p className="text-xs text-slate-400">
                Configure game session countdown, mismatch reveal timing, and match points
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
                {physics.gameDurationSeconds || 45}s
              </span>
            </div>
            <input
              type="range"
              min="15"
              max="90"
              step="5"
              value={physics.gameDurationSeconds || 45}
              onChange={(e) =>
                handleUpdatePhysics({
                  gameDurationSeconds: parseInt(e.target.value) || 45,
                })
              }
              className="w-full accent-amber-500 cursor-pointer"
            />
            <p className="text-[11px] text-slate-500">Total allowed puzzle completion time</p>
          </div>

          {/* Mismatch Reveal Delay */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-sky-400" />
                Mismatch Delay
              </span>
              <span className="text-sky-400 font-bold font-mono text-sm">
                {physics.spawnIntervalMin || 850}ms
              </span>
            </div>
            <input
              type="range"
              min="400"
              max="1500"
              step="50"
              value={physics.spawnIntervalMin || 850}
              onChange={(e) =>
                handleUpdatePhysics({
                  spawnIntervalMin: parseInt(e.target.value) || 850,
                })
              }
              className="w-full accent-sky-500 cursor-pointer"
            />
            <p className="text-[11px] text-slate-500">Duration cards stay visible when mismatched</p>
          </div>

          {/* Grid Layout Spec */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Grid3X3 className="w-3.5 h-3.5 text-emerald-400" />
                Board Layout
              </span>
              <span className="text-emerald-400 font-bold font-mono text-sm">
                4 × 4 Board
              </span>
            </div>
            <div className="py-1">
              <p className="text-xs font-bold text-slate-200">16 Cards • 8 Matching Pairs</p>
              <p className="text-[11px] text-slate-500 mt-1">Standard square responsive grid matrix</p>
            </div>
          </div>
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
