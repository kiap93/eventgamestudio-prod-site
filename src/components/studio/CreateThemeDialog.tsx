import React, { useState } from 'react';
import { GameTheme, durianTheme } from '../../themes';
import { Sparkles, Copy, Plus, AlertCircle, Check, X, Layers } from 'lucide-react';

interface CreateThemeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (newThemeId: string) => void;
  existingThemes: GameTheme[];
  activeTheme: GameTheme | null;
  onCreate: (themeData: Partial<GameTheme>) => Promise<GameTheme>;
  onDuplicate: (themeId: string, newName?: string) => Promise<GameTheme>;
}

export const CreateThemeDialog: React.FC<CreateThemeDialogProps> = ({
  isOpen,
  onClose,
  onCreated,
  existingThemes,
  activeTheme,
  onCreate,
  onDuplicate,
}) => {
  const [creationMode, setCreationMode] = useState<'scratch' | 'duplicate'>('scratch');
  const [themeName, setThemeName] = useState('');
  const [sourceThemeId, setSourceThemeId] = useState<string>(() => {
    return activeTheme?.id || (existingThemes.length > 0 ? existingThemes[0].id : '');
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!themeName.trim()) {
      setErrorMessage('Please enter a theme name');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      if (creationMode === 'duplicate') {
        const targetSource = sourceThemeId || existingThemes[0]?.id;
        if (!targetSource) {
          throw new Error('Please select a source theme to duplicate');
        }
        const newTheme = await onDuplicate(targetSource, themeName.trim());
        onCreated(newTheme.id);
      } else {
        // Start from scratch using clean baseline defaults
        const base = activeTheme || durianTheme;
        const newTheme = await onCreate({
          name: themeName.trim(),
          slug: themeName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          description: `Custom game theme: ${themeName.trim()}`,
          branding: {
            gameTitle: themeName.trim(),
            subtitle: `Catch custom items in ${themeName.trim()}!`,
            logoUrl: null,
            clientLogoUrl: null,
          },
          background_url: base.background_url || durianTheme.background_url,
          basket_config: base.basket_config
            ? JSON.parse(JSON.stringify(base.basket_config))
            : {
                name: 'Basket',
                imageUrl: null,
                width: 140,
                height: 70,
                catchAreaRatio: 0.75,
                speed: 550,
              },
          items_config: base.items_config
            ? JSON.parse(JSON.stringify(base.items_config))
            : [
                {
                  id: 'item_good_1',
                  name: 'Standard Collectible',
                  points: 10,
                  speedMultiplier: 1.0,
                  spawnWeight: 75,
                  enabled: true,
                  isHazard: false,
                  isBonus: false,
                },
                {
                  id: 'item_bad_1',
                  name: 'Hazard Penalty',
                  points: -10,
                  speedMultiplier: 1.15,
                  spawnWeight: 20,
                  enabled: true,
                  isHazard: true,
                  isBonus: false,
                },
              ],
          physics_config: base.physics_config
            ? JSON.parse(JSON.stringify(base.physics_config))
            : {
                gameDurationSeconds: 20,
                fallSpeedMultiplier: 0.7,
                basketSpeed: 550,
                baseFallSpeed: 300,
                spawnIntervalMin: 600,
                spawnIntervalMax: 1200,
                difficultyStages: [],
              },
          visuals_config: base.visuals_config
            ? JSON.parse(JSON.stringify(base.visuals_config))
            : {
                accent: '#f59e0b',
                primary: '#0f172a',
                hudColor: '#fbbf24',
              },
          sounds_config: base.sounds_config
            ? JSON.parse(JSON.stringify(base.sounds_config))
            : {
                soundEnabled: true,
                bgmEnabled: true,
                soundVolume: 0.8,
              },
        });
        onCreated(newTheme.id);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to create theme');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-7 max-w-lg w-full shadow-2xl space-y-6 animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-400">
              <Plus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-100 tracking-tight">Create New Theme</h3>
              <p className="text-xs text-slate-400">Choose how you want to set up your game theme</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Selector Radio Cards */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Start from Scratch Option */}
            <div
              onClick={() => setCreationMode('scratch')}
              className={`p-4 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between space-y-2 ${
                creationMode === 'scratch'
                  ? 'bg-amber-500/10 border-amber-500 text-slate-100 ring-2 ring-amber-500/20'
                  : 'bg-slate-950 border-slate-800/80 hover:border-slate-700 text-slate-400 hover:text-slate-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-amber-400">
                  <Sparkles className="w-4 h-4" />
                </div>
                <input
                  type="radio"
                  name="creationMode"
                  checked={creationMode === 'scratch'}
                  onChange={() => setCreationMode('scratch')}
                  className="accent-amber-500"
                />
              </div>
              <div>
                <h4 className="text-xs font-black text-slate-200">Start from scratch</h4>
                <p className="text-[11px] text-slate-400 leading-relaxed mt-0.5">
                  Clean baseline template ready for custom graphics & physics.
                </p>
              </div>
            </div>

            {/* Duplicate Existing Theme Option */}
            <div
              onClick={() => setCreationMode('duplicate')}
              className={`p-4 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between space-y-2 ${
                creationMode === 'duplicate'
                  ? 'bg-amber-500/10 border-amber-500 text-slate-100 ring-2 ring-amber-500/20'
                  : 'bg-slate-950 border-slate-800/80 hover:border-slate-700 text-slate-400 hover:text-slate-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-blue-400">
                  <Copy className="w-4 h-4" />
                </div>
                <input
                  type="radio"
                  name="creationMode"
                  checked={creationMode === 'duplicate'}
                  onChange={() => setCreationMode('duplicate')}
                  className="accent-amber-500"
                />
              </div>
              <div>
                <h4 className="text-xs font-black text-slate-200">Duplicate existing theme</h4>
                <p className="text-[11px] text-slate-400 leading-relaxed mt-0.5">
                  Copy items, physics, audio, and branding from an existing theme.
                </p>
              </div>
            </div>
          </div>

          {/* Source Theme Picker (Only if Duplicate mode) */}
          {creationMode === 'duplicate' && (
            <div className="bg-slate-950 border border-slate-800 p-3.5 rounded-2xl space-y-2">
              <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-blue-400" />
                <span>Select Theme to Duplicate</span>
              </label>
              <select
                value={sourceThemeId}
                onChange={(e) => setSourceThemeId(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-xs font-semibold rounded-xl px-3 py-2.5 focus:outline-none focus:border-amber-500"
              >
                {existingThemes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} {t.is_active ? '★ (Active Live)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Theme Name Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300">Theme Name</label>
            <input
              type="text"
              placeholder="e.g. Summer Festival 2026, Neon Cyberpunk, Fruit Carnival"
              value={themeName}
              onChange={(e) => setThemeName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500 placeholder:text-slate-600"
              autoFocus
            />
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Modal Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800/80">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 text-xs font-bold rounded-xl transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!themeName.trim() || isSubmitting}
              className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 text-xs font-black rounded-xl transition-all shadow-md flex items-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  <span>Creating...</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 stroke-[3]" />
                  <span>Continue</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
