import React, { useState } from 'react';
import { THEME_REGISTRY } from '../../themes/registry';
import {
  Palette,
  Sparkles,
  Image,
  ArrowRight,
  Sliders,
  CheckCircle2,
} from 'lucide-react';
import { navigateTo } from '../../hooks/useRouteContext';
import { useAuth } from '../../context/AuthContext';
import { useLocalization } from '../../context/LocalizationContext';

export const LandingBrandYourGame: React.FC = () => {
  const { t } = useLocalization();
  const { isAuthenticated } = useAuth();
  const [activePresetId, setActivePresetId] = useState('carnival');

  const presets = [
    {
      id: 'carnival',
      name: t('landing.themePresetCarnival'),
      tagline: t('landing.themePresetCarnivalTagline'),
      bgPath: '/assets/games/catch-brand/themes/carnival/background.png',
      basketPath: '/assets/games/catch-brand/themes/carnival/basket.png',
      itemNormal: '/assets/games/catch-brand/themes/carnival/item_normal_01.png',
      itemBonus: '/assets/games/catch-brand/themes/carnival/item_bonus_01.png',
      itemHazard: '/assets/games/catch-brand/themes/carnival/item_hazard_01.png',
      color: 'bg-amber-500',
    },
    {
      id: 'chinese-new-year',
      name: t('landing.themePresetCny'),
      tagline: t('landing.themePresetCnyTagline'),
      bgPath: '/assets/games/catch-brand/themes/cny/background.png',
      basketPath: '/assets/games/catch-brand/themes/cny/basket.png',
      itemNormal: '/assets/games/catch-brand/themes/cny/item_normal_01.png',
      itemBonus: '/assets/games/catch-brand/themes/cny/item_bonus_01.png',
      itemHazard: '/assets/games/catch-brand/themes/cny/item_hazard_01.png',
      color: 'bg-red-500',
    },
    {
      id: 'christmas',
      name: t('landing.themePresetHoliday'),
      tagline: t('landing.themePresetHolidayTagline'),
      bgPath: '/assets/games/catch-brand/themes/christmas/background.png',
      basketPath: '/assets/games/catch-brand/themes/christmas/basket.png',
      itemNormal: '/assets/games/catch-brand/themes/christmas/item_normal_01.png',
      itemBonus: '/assets/games/catch-brand/themes/christmas/item_bonus_01.png',
      itemHazard: '/assets/games/catch-brand/themes/christmas/item_hazard_01.png',
      color: 'bg-emerald-500',
    },
    {
      id: 'halloween',
      name: t('landing.themePresetHalloween'),
      tagline: t('landing.themePresetHalloweenTagline'),
      bgPath: '/assets/games/catch-brand/themes/halloween/background.png',
      basketPath: '/assets/games/catch-brand/themes/halloween/basket.png',
      itemNormal: '/assets/games/catch-brand/themes/halloween/item_normal_01.png',
      itemBonus: '/assets/games/catch-brand/themes/halloween/item_bonus_01.png',
      itemHazard: '/assets/games/catch-brand/themes/halloween/item_hazard_01.png',
      color: 'bg-purple-500',
    },
    {
      id: 'mango',
      name: t('landing.themePresetMango'),
      tagline: t('landing.themePresetMangoTagline'),
      bgPath: '/assets/games/catch-brand/themes/mango/background.png',
      basketPath: '/assets/games/catch-brand/themes/mango/basket.png',
      itemNormal: '/assets/games/catch-brand/themes/mango/item_normal_01.png',
      itemBonus: '/assets/games/catch-brand/themes/mango/item_bonus_01.png',
      itemHazard: '/assets/games/catch-brand/themes/mango/item_hazard_01.png',
      color: 'bg-yellow-500',
    },
  ];

  const current = presets.find((p) => p.id === activePresetId) || presets[0];

  const handleOpenStudio = () => {
    if (isAuthenticated) {
      navigateTo('/game-themes');
    } else {
      navigateTo('/login?redirect=/game-themes');
    }
  };

  const assetSlots = [
    t('landing.assetBackgroundLabel'),
    t('landing.assetCatcherLabel'),
    t('landing.assetCollectiblesLabel'),
    t('landing.assetBonusLabel'),
    t('landing.assetHazardsLabel'),
    t('landing.assetAudioLabel'),
  ];

  return (
    <section className="w-full py-16 sm:py-24 bg-white border-b border-slate-200/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold uppercase tracking-wider">
            <Palette className="w-3.5 h-3.5" />
            <span>{t('landing.brandYourGameBadge')}</span>
          </div>
          <h2 className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight">
            {t('landing.brandYourGameTitle')}
          </h2>
          <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
            {t('landing.brandYourGameDesc')}
          </p>
        </div>

        {/* Theme Segmented Switcher */}
        <div className="flex flex-wrap items-center justify-center gap-2 max-w-4xl mx-auto">
          {presets.map((preset) => {
            const isActive = preset.id === activePresetId;
            return (
              <button
                key={preset.id}
                onClick={() => setActivePresetId(preset.id)}
                className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                  isActive
                    ? 'bg-slate-900 text-white shadow-md'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                <span>{preset.name}</span>
              </button>
            );
          })}
        </div>

        {/* Studio Showcase Two-Column Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center max-w-6xl mx-auto">
          {/* Left Column: Asset Specification & Controls */}
          <div className="lg:col-span-5 space-y-6">
            <div className="space-y-2">
              <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">
                {current.name}
              </span>
              <h3 className="text-xl sm:text-2xl font-black text-slate-900 leading-snug">
                {current.tagline}
              </h3>
            </div>

            <div className="space-y-3 pt-2">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                {t('landing.customizableAssetsTitle')}
              </div>

              <div className="space-y-2.5">
                {assetSlots.map((slot, idx) => (
                  <div key={idx} className="flex items-center gap-2.5 text-xs sm:text-sm text-slate-700 font-medium">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>{slot}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Sprites Row */}
            <div className="pt-2">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                Active Theme Sprites
              </div>
              <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="w-10 h-10 p-1 bg-white rounded-lg border border-slate-200 flex items-center justify-center shrink-0">
                  <img src={current.itemNormal} alt="Collect item" className="w-full h-full object-contain" />
                </div>
                <div className="w-10 h-10 p-1 bg-white rounded-lg border border-slate-200 flex items-center justify-center shrink-0">
                  <img src={current.itemBonus} alt="Bonus item" className="w-full h-full object-contain" />
                </div>
                <div className="w-10 h-10 p-1 bg-white rounded-lg border border-slate-200 flex items-center justify-center shrink-0">
                  <img src={current.itemHazard} alt="Hazard item" className="w-full h-full object-contain" />
                </div>
                <div className="w-14 h-10 p-1 bg-white rounded-lg border border-slate-200 flex items-center justify-center shrink-0">
                  <img src={current.basketPath} alt="Catcher" className="w-full h-full object-contain" />
                </div>
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={handleOpenStudio}
                className="px-5 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs sm:text-sm flex items-center gap-2 transition-colors cursor-pointer"
              >
                <span>{t('landing.customizeThemesCta')}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Right Column: Live Mockup Viewport */}
          <div className="lg:col-span-7">
            <div className="relative aspect-16/10 rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 shadow-xl">
              {/* Background Art */}
              <img
                src={current.bgPath}
                alt={current.name}
                className="absolute inset-0 w-full h-full object-cover transition-opacity duration-300"
              />

              {/* Dark subtle overlay for contrast */}
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-slate-950/40" />

              {/* Mock HUD */}
              <div className="absolute top-4 left-4 right-4 flex items-center justify-between text-xs text-white z-10">
                <span className="px-3 py-1 rounded-lg bg-slate-900/80 backdrop-blur-md border border-slate-700 font-mono font-bold">
                  Score: 12,500
                </span>
                <span className="px-3 py-1 rounded-lg bg-slate-900/80 backdrop-blur-md border border-slate-700 font-mono font-bold text-amber-400">
                  00:24
                </span>
              </div>

              {/* Floating Items */}
              <div className="absolute top-1/4 left-1/3 w-12 h-12">
                <img src={current.itemNormal} alt="Normal item" className="w-full h-full object-contain drop-shadow-md" />
              </div>
              <div className="absolute top-1/3 right-1/4 w-14 h-14">
                <img src={current.itemBonus} alt="Bonus item" className="w-full h-full object-contain drop-shadow-lg" />
              </div>
              <div className="absolute top-1/2 left-1/4 w-10 h-10">
                <img src={current.itemHazard} alt="Hazard item" className="w-full h-full object-contain drop-shadow-md" />
              </div>

              {/* Bottom Catcher */}
              <div className="absolute bottom-5 left-1/2 -translate-x-1/2 w-32 h-16">
                <img src={current.basketPath} alt="Catcher" className="w-full h-full object-contain drop-shadow-2xl" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
