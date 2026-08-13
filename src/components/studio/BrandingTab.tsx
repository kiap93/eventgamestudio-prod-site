import React from 'react';
import { GameTheme } from '../../themes/types';
import {
  Palette,
  Upload,
  Sparkles,
  Type,
  ImageIcon,
} from 'lucide-react';

interface BrandingTabProps {
  theme: GameTheme;
  onChange: (updated: GameTheme) => void;
  onUploadAsset: (file: File, fieldKey: string) => Promise<string>;
  uploadingAsset: string | null;
}

const PARTICLE_PRESETS = [
  { id: 'particle_leaf', name: 'Forest Leaves', icon: '🍃' },
  { id: 'particle_snow', name: 'Winter Flakes', icon: '❄️' },
  { id: 'particle_sparkle', name: 'Gold Sparkles', icon: '✨' },
  { id: 'particle_fire', name: 'Spooky Embers', icon: '🔥' },
];

export const BrandingTab: React.FC<BrandingTabProps> = ({
  theme,
  onChange,
  onUploadAsset,
  uploadingAsset,
}) => {
  const branding = theme.branding || {
    gameTitle: theme.name || 'Custom Theme',
    subtitle: 'Catch items, avoid hazards!',
    logoUrl: null,
    clientLogoUrl: null,
    accentColor: '#10b981',
    primaryColor: '#0c2012',
    hudColor: '#c8e038',
  };

  const visuals = theme.visuals_config || {
    primaryColor: '#10b981',
    secondaryColor: '#0c2012',
    accentColor: '#10b981',
    textColor: '#ffffff',
    particleGood: 'particle_leaf',
    particleBad: 'particle_leaf',
    particleBonus: 'particle_sparkle',
  };

  const handleUpdateBranding = (updates: Partial<typeof branding>) => {
    onChange({
      ...theme,
      gameTitle: updates.gameTitle ?? theme.gameTitle,
      subtitle: updates.subtitle ?? theme.subtitle,
      branding: {
        ...branding,
        ...updates,
      },
    });
  };

  const handleUpdateVisuals = (updates: Partial<typeof visuals>) => {
    onChange({
      ...theme,
      visuals_config: {
        ...visuals,
        ...updates,
      },
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, key: string) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const url = await onUploadAsset(file, key);
      handleUpdateBranding({
        clientLogoUrl: url,
        logoUrl: url,
      });
      onChange({
        ...theme,
        logo: url,
        clientLogo: url,
        branding: {
          ...branding,
          clientLogoUrl: url,
          logoUrl: url,
        },
      });
    } catch {
      // Error handled in parent
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. TITLES & COPY */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-lg">
        <div className="flex items-center gap-2">
          <span className="p-2 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
            <Type className="w-4 h-4" />
          </span>
          <div>
            <h3 className="text-sm font-bold text-slate-100">Game Title & Copy</h3>
            <p className="text-xs text-slate-400">
              Customize title headings, promotional subtitles, and event descriptions
            </p>
          </div>
        </div>

        <div className="space-y-3 pt-1">
          <div>
            <label className="text-xs font-semibold text-slate-300">Game Title</label>
            <input
              type="text"
              value={branding.gameTitle || theme.name || ''}
              onChange={(e) => {
                handleUpdateBranding({ gameTitle: e.target.value });
                onChange({
                  ...theme,
                  name: e.target.value,
                  gameTitle: e.target.value,
                  branding: { ...branding, gameTitle: e.target.value },
                });
              }}
              placeholder="e.g. DURIAN CATCHER, HOLIDAY SLEIGH RUSH"
              className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-bold text-slate-200 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300">Tagline / Subtitle</label>
            <input
              type="text"
              value={branding.subtitle || theme.subtitle || ''}
              onChange={(e) => handleUpdateBranding({ subtitle: e.target.value })}
              placeholder="e.g. Catch fresh fruits, avoid rotten hazards!"
              className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300">Theme Description (Internal Notes)</label>
            <textarea
              rows={2}
              value={theme.description || ''}
              onChange={(e) => onChange({ ...theme, description: e.target.value })}
              placeholder="Event activation notes, brand campaign info, or designer guidelines..."
              className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>
      </div>

      {/* 2. BRAND LOGO & COLOR PALETTE */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Brand Logo Upload */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-lg">
          <div className="flex items-center gap-2">
            <span className="p-2 bg-purple-500/10 text-purple-400 rounded-xl border border-purple-500/20">
              <ImageIcon className="w-4 h-4" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-100">Event / Client Logo</h3>
              <p className="text-xs text-slate-400">
                Displays in the top-left HUD corner of the arcade canvas
              </p>
            </div>
          </div>

          <div className="space-y-3 pt-1">
            <div className="flex gap-2">
              <input
                type="text"
                value={branding.clientLogoUrl || branding.logoUrl || theme.clientLogo || theme.logo || ''}
                onChange={(e) => {
                  handleUpdateBranding({
                    clientLogoUrl: e.target.value,
                    logoUrl: e.target.value,
                  });
                  onChange({
                    ...theme,
                    clientLogo: e.target.value,
                    logo: e.target.value,
                    branding: { ...branding, clientLogoUrl: e.target.value },
                  });
                }}
                placeholder="https://example.com/logo.png"
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
              />
              <label className="cursor-pointer bg-slate-800 hover:bg-slate-700 px-3.5 py-2 rounded-xl text-xs font-bold text-slate-200 flex items-center gap-1.5 transition-all border border-slate-700 shrink-0">
                <Upload className="w-3.5 h-3.5" />
                <span>{uploadingAsset === 'logo' ? '...' : 'Upload'}</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploadingAsset === 'logo'}
                  onChange={(e) => handleFileUpload(e, 'logo')}
                />
              </label>
            </div>

            {(branding.clientLogoUrl || branding.logoUrl) && (
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3 flex items-center justify-center h-20">
                <img
                  src={branding.clientLogoUrl || branding.logoUrl || ''}
                  alt="Client Logo Preview"
                  className="max-h-14 max-w-full object-contain"
                />
              </div>
            )}
          </div>
        </div>

        {/* Color Palette Swatches */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-lg">
          <div className="flex items-center gap-2">
            <span className="p-2 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
              <Palette className="w-4 h-4" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-100">Color Palette & HUD</h3>
              <p className="text-xs text-slate-400">
                Theme accent tones and arcade score glow colors
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3 space-y-2">
              <label className="text-[11px] font-semibold text-slate-300">Accent Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={branding.accentColor || visuals.accentColor || '#10b981'}
                  onChange={(e) => {
                    handleUpdateBranding({ accentColor: e.target.value });
                    handleUpdateVisuals({ accentColor: e.target.value, primaryColor: e.target.value });
                  }}
                  className="w-9 h-9 rounded-xl bg-transparent border-0 cursor-pointer"
                />
                <span className="text-xs font-mono font-bold text-slate-300">
                  {branding.accentColor || '#10b981'}
                </span>
              </div>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3 space-y-2">
              <label className="text-[11px] font-semibold text-slate-300">HUD Score Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={branding.hudColor || '#c8e038'}
                  onChange={(e) => handleUpdateBranding({ hudColor: e.target.value })}
                  className="w-9 h-9 rounded-xl bg-transparent border-0 cursor-pointer"
                />
                <span className="text-xs font-mono font-bold text-slate-300">
                  {branding.hudColor || '#c8e038'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. AMBIENT PARTICLES EFFECT */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-lg">
        <div className="flex items-center gap-2">
          <span className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
            <Sparkles className="w-4 h-4" />
          </span>
          <div>
            <h3 className="text-sm font-bold text-slate-100">Ambient Weather & Particles</h3>
            <p className="text-xs text-slate-400">
              Atmospheric falling particles rendered over the gameplay arena
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
          {PARTICLE_PRESETS.map((preset) => {
            const isSelected =
              visuals.particleGood === preset.id ||
              theme.particles?.good === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() =>
                  handleUpdateVisuals({
                    particleGood: preset.id,
                    particleBad: preset.id,
                  })
                }
                className={`p-3 rounded-2xl border flex items-center gap-2.5 transition-all text-left ${
                  isSelected
                    ? 'border-amber-400 bg-amber-500/10 text-slate-100 shadow-md ring-2 ring-amber-400/20'
                    : 'border-slate-800 bg-slate-950 hover:border-slate-700 text-slate-400'
                }`}
              >
                <span className="text-xl">{preset.icon}</span>
                <span className="text-xs font-bold truncate">{preset.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
