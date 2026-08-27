import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { THEME_REGISTRY } from '../../themes/registry';
import { GameTheme } from '../../themes/types';
import {
  Palette,
  Sparkles,
  Building2,
  Image,
  Type,
  Layout,
  Sliders,
  CheckCircle2,
  ArrowRight,
  Tv,
} from 'lucide-react';
import { navigateTo } from '../../hooks/useRouteContext';
import { useAuth } from '../../context/AuthContext';

interface ThemePresetDisplay {
  id: string;
  name: string;
  clientMock: string;
  tagline: string;
  badge: string;
  accentColor: string;
  bgGradient: string;
  goodItemLabel: string;
  hazardItemLabel: string;
  bonusItemLabel: string;
  catcherLabel: string;
}

const THEME_PRESETS: ThemePresetDisplay[] = [
  {
    id: 'carnival',
    name: 'Carnival Fiesta',
    clientMock: 'Grand Carnival Expo 2026',
    tagline: 'Catch Golden Tickets & Cosmic Stars, dodge Cursed Masks!',
    badge: 'Carnival Celebration',
    accentColor: '#f59e0b',
    bgGradient: 'from-amber-950/60 via-slate-900 to-purple-950/40',
    goodItemLabel: 'Golden Carnival Ticket (+10 pts)',
    hazardItemLabel: 'Carnival Cursed Mask (-10 pts)',
    bonusItemLabel: 'Cosmic Carnival Star (+50 pts)',
    catcherLabel: 'Carnival Cart',
  },
  {
    id: 'chinese-new-year',
    name: 'Lunar New Year',
    clientMock: 'Bank of Asia Gala Dinner',
    tagline: 'Catch lucky Red Packets (Angpow), avoid fireworks!',
    badge: 'Spring Festival',
    accentColor: '#ef4444',
    bgGradient: 'from-red-950/60 via-slate-900 to-amber-950/40',
    goodItemLabel: 'Lucky Red Packet (+10 pts)',
    hazardItemLabel: 'Exploding Firecracker (-10 pts)',
    bonusItemLabel: 'Golden Yuanbao Ingot (+50 pts)',
    catcherLabel: 'Golden Fortune Catcher',
  },
  {
    id: 'christmas',
    name: 'Winter Holiday',
    clientMock: 'MegaMall Year-End Carnival',
    tagline: 'Catch Holiday Presents, dodge Melting Snowballs!',
    badge: 'Winter Wonderland',
    accentColor: '#06b6d4',
    bgGradient: 'from-cyan-950/60 via-slate-900 to-emerald-950/40',
    goodItemLabel: 'Wrapped Gift Box (+10 pts)',
    hazardItemLabel: 'Melting Snow Hazard (-10 pts)',
    bonusItemLabel: 'Golden Holiday Star (+50 pts)',
    catcherLabel: 'Santa Festive Sack',
  },
  {
    id: 'halloween',
    name: 'Spooky Night',
    clientMock: 'Night Festival Activation',
    tagline: 'Collect sweet Candy Corn, avoid Spooky Ghosts!',
    badge: 'Halloween Special',
    accentColor: '#a855f7',
    bgGradient: 'from-purple-950/60 via-slate-900 to-orange-950/40',
    goodItemLabel: 'Treat Candy Corn (+10 pts)',
    hazardItemLabel: 'Haunted Skull Hazard (-10 pts)',
    bonusItemLabel: 'Glowing Jack-o-Lantern (+50 pts)',
    catcherLabel: 'Witch Cauldron',
  },
  {
    id: 'mango',
    name: 'Summer Orchard',
    clientMock: 'Juice Bar Brand Launch',
    tagline: 'Catch sweet Honey Mangoes, avoid Tree Thorns!',
    badge: 'Summer Launch',
    accentColor: '#eab308',
    bgGradient: 'from-yellow-950/60 via-slate-900 to-emerald-950/40',
    goodItemLabel: 'Ripe Honey Mango (+10 pts)',
    hazardItemLabel: 'Thorny Branch (-10 pts)',
    bonusItemLabel: 'Golden Mango Nectar (+50 pts)',
    catcherLabel: 'Fruit Crate',
  },
];

export const LandingBrandYourGame: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const [selectedPresetId, setSelectedPresetId] = useState<string>('carnival');

  const currentPreset = THEME_PRESETS.find((p) => p.id === selectedPresetId) || THEME_PRESETS[0];
  const registeredTheme: GameTheme = THEME_REGISTRY[selectedPresetId] || THEME_REGISTRY['carnival'];

  const handleCustomizeClick = () => {
    if (isAuthenticated) {
      navigateTo('/game-themes');
    } else {
      navigateTo('/login');
    }
  };

  return (
    <section id="brand-your-game" className="relative py-20 md:py-32 bg-slate-950/90 border-t border-slate-900 overflow-hidden">
      {/* Dynamic Background Glow matching selected theme */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[500px] blur-3xl opacity-20 pointer-events-none transition-all duration-700 rounded-full"
        style={{ backgroundColor: currentPreset.accentColor }}
      />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4 mb-16">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs font-bold text-amber-400 uppercase tracking-widest">
            <Palette className="w-3.5 h-3.5" />
            <span>Theme & Branding Engine</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
            Your Client's Brand. Their Game.
          </h2>
          <p className="text-base sm:text-lg text-slate-400 leading-relaxed">
            Every visual element is customizable. Turn any game into an exclusive, branded corporate experience in seconds without writing a line of code.
          </p>
        </div>

        {/* Interactive Theme Switcher Pills */}
        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 mb-12">
          {THEME_PRESETS.map((preset) => {
            const isSelected = preset.id === selectedPresetId;
            return (
              <button
                key={preset.id}
                onClick={() => setSelectedPresetId(preset.id)}
                className={`px-4 sm:px-6 py-2.5 sm:py-3 rounded-2xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2.5 ${
                  isSelected
                    ? 'bg-slate-800 text-white border border-amber-500/60 shadow-lg shadow-amber-500/10 scale-105'
                    : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 border border-slate-800 hover:bg-slate-850'
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full inline-block"
                  style={{ backgroundColor: preset.accentColor }}
                />
                <span>{preset.name}</span>
                <span className="hidden md:inline text-[10px] uppercase font-semibold text-slate-400">
                  • {preset.badge}
                </span>
              </button>
            );
          })}
        </div>

        {/* Interactive Brand Transformer Card */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left Column: Brand Customization Specs */}
          <div className="lg:col-span-5 space-y-4">
            <div className="rounded-3xl bg-slate-900/90 border border-slate-800 p-6 sm:p-8 space-y-6">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-wider">
                  <Sliders className="w-4 h-4" />
                  <span>Customization Controls</span>
                </div>
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300">
                  Live Preview
                </span>
              </div>

              {/* 5 Key Customization Points */}
              <div className="space-y-4 text-xs">
                {/* 1. Client Logo & Branding */}
                <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800/80 flex items-start gap-3">
                  <Building2 className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <span className="font-bold text-slate-200 block text-xs">Client Logo & Event Title</span>
                    <span className="text-slate-400 text-[11px] block mt-0.5">
                      Current client header: <strong className="text-amber-300">{currentPreset.clientMock}</strong>
                    </span>
                  </div>
                </div>

                {/* 2. Custom Game Theme & Rules */}
                <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800/80 flex items-start gap-3">
                  <Type className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <span className="font-bold text-slate-200 block text-xs">Custom Gameplay Rules</span>
                    <span className="text-slate-400 text-[11px] block mt-0.5">
                      {registeredTheme.branding.subtitle || currentPreset.tagline}
                    </span>
                  </div>
                </div>

                {/* 3. Branded Collectibles & Items */}
                <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800/80 flex items-start gap-3">
                  <Sparkles className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <span className="font-bold text-slate-200 block text-xs">Custom Brand Collectibles</span>
                    <div className="mt-1.5 space-y-1 text-[11px]">
                      <div className="text-emerald-400 font-mono">✓ {currentPreset.goodItemLabel}</div>
                      <div className="text-rose-400 font-mono">✕ {currentPreset.hazardItemLabel}</div>
                      <div className="text-amber-400 font-mono">★ {currentPreset.bonusItemLabel}</div>
                    </div>
                  </div>
                </div>

                {/* 4. Custom Catcher & Background Artwork */}
                <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800/80 flex items-start gap-3">
                  <Image className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <span className="font-bold text-slate-200 block text-xs">Catcher & Background Artwork</span>
                    <span className="text-slate-400 text-[11px] block mt-0.5">
                      Catcher asset: <strong className="text-slate-200">{currentPreset.catcherLabel}</strong>
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <button
                  onClick={handleCustomizeClick}
                  className="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-2"
                >
                  <Palette className="w-4 h-4" />
                  <span>Customize Themes in Studio</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Visual Mockup of Branded Game Display */}
          <div className="lg:col-span-7">
            <div className="relative rounded-3xl p-1 bg-gradient-to-b from-slate-700 via-slate-800 to-amber-500/30 shadow-2xl">
              <div className="rounded-[22px] bg-slate-950 border border-slate-800 overflow-hidden">
                {/* Event Stage Display Header */}
                <div className="bg-slate-900/90 px-6 py-3.5 border-b border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-xs font-bold text-slate-200">
                      {currentPreset.clientMock}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded bg-slate-950 border border-slate-800 text-amber-400">
                    STAGE MODE: 16:9 4K READY
                  </span>
                </div>

                {/* Branded Game Stage Frame */}
                <div className={`relative h-[340px] sm:h-[420px] bg-gradient-to-b ${currentPreset.bgGradient} p-6 flex flex-col justify-between overflow-hidden transition-all duration-500`}>
                  {/* Subtle Grid Accent */}
                  <div className="absolute inset-0 opacity-[0.05] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '24px 24px' }} />

                  {/* Top Game Banner */}
                  <div className="relative z-10 flex items-center justify-between">
                    <div className="bg-slate-950/80 backdrop-blur-md border border-slate-800 px-4 py-2 rounded-2xl shadow-lg">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        {registeredTheme.branding.gameTitle || currentPreset.name}
                      </div>
                      <div className="text-xs font-semibold text-amber-300">
                        {currentPreset.clientMock}
                      </div>
                    </div>

                    <div className="bg-slate-950/80 backdrop-blur-md border border-slate-800 px-4 py-2 rounded-2xl shadow-lg text-right">
                      <div className="text-[10px] font-bold text-slate-400 uppercase">Target Score</div>
                      <div className="text-lg font-black text-amber-400 font-mono">15,000 PTS</div>
                    </div>
                  </div>

                  {/* Center Collectibles Showcase */}
                  <div className="relative z-10 flex items-center justify-around py-4">
                    <motion.div
                      key={`good-${selectedPresetId}`}
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="flex flex-col items-center gap-2 bg-slate-950/70 backdrop-blur-sm border border-slate-800 p-3 sm:p-4 rounded-2xl"
                    >
                      <span className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-300 font-black text-xs sm:text-sm shadow-md">
                        +10
                      </span>
                      <span className="text-[10px] sm:text-xs font-bold text-emerald-300 text-center max-w-[100px]">
                        {currentPreset.goodItemLabel.split('(')[0]}
                      </span>
                    </motion.div>

                    <motion.div
                      key={`bonus-${selectedPresetId}`}
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.1 }}
                      className="flex flex-col items-center gap-2 bg-slate-950/70 backdrop-blur-sm border border-amber-500/40 p-3 sm:p-4 rounded-2xl shadow-lg shadow-amber-500/10"
                    >
                      <span className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-amber-500/20 border border-amber-500/50 flex items-center justify-center text-amber-300 font-black text-sm sm:text-base shadow-md animate-pulse">
                        ★ +50
                      </span>
                      <span className="text-[10px] sm:text-xs font-bold text-amber-300 text-center max-w-[100px]">
                        {currentPreset.bonusItemLabel.split('(')[0]}
                      </span>
                    </motion.div>

                    <motion.div
                      key={`hazard-${selectedPresetId}`}
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.2 }}
                      className="flex flex-col items-center gap-2 bg-slate-950/70 backdrop-blur-sm border border-slate-800 p-3 sm:p-4 rounded-2xl"
                    >
                      <span className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-300 font-black text-xs sm:text-sm shadow-md">
                        -10
                      </span>
                      <span className="text-[10px] sm:text-xs font-bold text-rose-300 text-center max-w-[100px]">
                        {currentPreset.hazardItemLabel.split('(')[0]}
                      </span>
                    </motion.div>
                  </div>

                  {/* Bottom Catcher Representation */}
                  <div className="relative z-10 flex flex-col items-center">
                    <div className="px-6 py-2 rounded-2xl bg-slate-950/90 border border-slate-700/80 shadow-2xl flex items-center gap-3">
                      <span className="text-xs font-black text-slate-100 uppercase tracking-wide">
                        [ {currentPreset.catcherLabel} ]
                      </span>
                      <span className="text-[10px] font-bold text-amber-400 bg-amber-500/20 px-2 py-0.5 rounded-full">
                        ACTIVE CATCHER
                      </span>
                    </div>
                  </div>
                </div>

                {/* Bottom Frame Spec Bar */}
                <div className="bg-slate-900/90 px-6 py-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Real-time CSS & Asset Swapping</span>
                  </span>
                  <span className="font-semibold text-slate-300">
                    Zero game engine reload required
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
