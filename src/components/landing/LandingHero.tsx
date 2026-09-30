import React from 'react';
import { motion } from 'motion/react';
import { useAuth } from '../../context/AuthContext';
import { useLocalization } from '../../context/LocalizationContext';
import { navigateTo } from '../../hooks/useRouteContext';
import {
  Gamepad2,
  Sparkles,
  ArrowRight,
  Play,
  QrCode,
  Tv,
  Smartphone,
  CheckCircle2,
  Trophy,
} from 'lucide-react';

interface LandingHeroProps {
  onExploreGames: () => void;
  onLaunchDemo?: (gameId?: string) => void;
}

export const LandingHero: React.FC<LandingHeroProps> = ({ onExploreGames, onLaunchDemo }) => {
  const { t } = useLocalization();
  const { isAuthenticated } = useAuth();

  const handleCreateEvent = () => {
    if (isAuthenticated) {
      navigateTo('/events');
    } else {
      navigateTo('/login?redirect=/events');
    }
  };

  const handlePlayDemo = () => {
    if (onLaunchDemo) {
      onLaunchDemo('catch-brand');
    } else {
      onExploreGames();
    }
  };

  return (
    <section className="relative w-full pt-10 pb-16 sm:pt-16 sm:pb-24 lg:pt-20 lg:pb-32 overflow-hidden bg-white">
      {/* Ambient Lighting Gradients */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[400px] bg-gradient-to-b from-amber-500/10 via-amber-200/5 to-transparent blur-3xl pointer-events-none rounded-full" />
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-amber-100/40 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 -right-32 w-96 h-96 bg-emerald-100/40 rounded-full blur-3xl pointer-events-none" />

      {/* Grid Pattern */}
      <div
        className="absolute inset-0 opacity-40 pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(to right, #f1f5f9 1px, transparent 1px), linear-gradient(to bottom, #f1f5f9 1px, transparent 1px)`,
          backgroundSize: '48px 48px',
        }}
      />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-4xl mx-auto space-y-6 sm:space-y-8">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-50 border border-amber-200/80 shadow-xs"
          >
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
            </span>
            <span className="text-xs font-bold text-amber-900 tracking-wide">
              {t('landing.heroBadge')}
            </span>
          </motion.div>

          {/* Main Headline */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="space-y-4"
          >
            <h1 className="text-3xl sm:text-5xl md:text-6xl font-black tracking-tight text-slate-900 leading-[1.12]">
              {t('landing.heroMainTitle')}
            </h1>
            <p className="text-base sm:text-lg md:text-xl font-normal text-slate-600 max-w-3xl mx-auto leading-relaxed">
              {t('landing.heroMainSubtitle')}
            </p>
          </motion.div>

          {/* Primary Action Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-3.5 pt-2"
          >
            <button
              onClick={handleCreateEvent}
              className="w-full sm:w-auto px-7 py-3.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-sm sm:text-base flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all cursor-pointer transform hover:-translate-y-0.5 active:translate-y-0"
            >
              <span>{t('landing.createYourEvent')}</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              onClick={handlePlayDemo}
              className="w-full sm:w-auto px-7 py-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm sm:text-base flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
            >
              <Play className="w-4 h-4 text-amber-400 fill-amber-400" />
              <span>{t('landing.tryLiveDemo')}</span>
            </button>
          </motion.div>

          {/* Key Value Proof Points */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="pt-4 grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 max-w-3xl mx-auto text-left"
          >
            {[
              { text: t('landing.statNoApp'), icon: Smartphone },
              { text: t('landing.statInstantQr'), icon: QrCode },
              { text: t('landing.stat60Fps'), icon: Tv },
              { text: t('landing.statCustomBranded'), icon: Sparkles },
            ].map((item, idx) => {
              const IconComp = item.icon;
              return (
                <div
                  key={idx}
                  className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-50/80 border border-slate-200/60"
                >
                  <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                    <IconComp className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs font-semibold text-slate-700 leading-tight">
                    {item.text}
                  </span>
                </div>
              );
            })}
          </motion.div>

          {/* Interactive Hero Visual Showcase Card */}
          <motion.div
            initial={{ opacity: 0, y: 25 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.35 }}
            className="pt-6 sm:pt-8"
          >
            <div className="relative mx-auto max-w-4xl rounded-2xl sm:rounded-3xl border border-slate-200/90 bg-slate-950 p-2 sm:p-3 shadow-2xl overflow-hidden group">
              {/* Top Window Bar */}
              <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800 text-xs text-slate-400">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
                  </div>
                  <span className="ml-2 font-mono text-[11px] text-slate-500 hidden sm:inline">
                    catch-the-brand.live-stage.eventgamestudio.com
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    {t('landing.stageReady', { fps: 60 })}
                  </span>
                </div>
              </div>

              {/* Stage Viewport */}
              <div className="relative aspect-16/9 w-full rounded-xl overflow-hidden bg-slate-900 flex items-center justify-center">
                {/* Background Game Scenery */}
                <img
                  src="/assets/games/catch-brand/themes/carnival/background.png"
                  alt="Catch the Brand Stage Preview"
                  className="absolute inset-0 w-full h-full object-cover opacity-85"
                />

                {/* Ambient vignette */}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-slate-950/40 pointer-events-none" />

                {/* Score & HUD simulation */}
                <div className="absolute top-4 left-4 right-4 flex items-center justify-between pointer-events-none z-10">
                  <div className="bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-xl px-3.5 py-1.5 flex items-center gap-2.5 shadow-md">
                    <Trophy className="w-4 h-4 text-amber-400" />
                    <div className="text-left">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{t('game.score')}</div>
                      <div className="text-sm sm:text-base font-black text-white font-mono leading-none">18,450</div>
                    </div>
                  </div>

                  <div className="bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-xl px-3.5 py-1.5 flex items-center gap-2.5 shadow-md">
                    <div className="text-right">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{t('landing.timeLeft')}</div>
                      <div className="text-sm sm:text-base font-black text-amber-400 font-mono leading-none">00:18</div>
                    </div>
                  </div>
                </div>

                {/* Falling Objects Animation Decor */}
                <div className="absolute top-1/4 left-1/4 w-12 h-12 animate-bounce duration-1000">
                  <img
                    src="/assets/games/catch-brand/themes/carnival/item_normal_01.png"
                    alt="Collectible Item"
                    className="w-full h-full object-contain drop-shadow-lg"
                  />
                </div>
                <div className="absolute top-1/3 right-1/4 w-14 h-14 animate-pulse">
                  <img
                    src="/assets/games/catch-brand/themes/carnival/item_bonus_01.png"
                    alt="Bonus Item"
                    className="w-full h-full object-contain drop-shadow-xl"
                  />
                </div>

                {/* Catcher at bottom */}
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-28 sm:w-36 h-14 sm:h-18">
                  <img
                    src="/assets/games/catch-brand/themes/carnival/basket.png"
                    alt="Player Catcher"
                    className="w-full h-full object-contain drop-shadow-2xl"
                  />
                </div>

                {/* Center Hover Action: Instant Live Demo Trigger */}
                <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center transition-opacity duration-200">
                  <button
                    onClick={handlePlayDemo}
                    className="px-6 py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm sm:text-base flex items-center gap-2.5 shadow-xl hover:scale-105 transition-all cursor-pointer"
                  >
                    <div className="w-7 h-7 rounded-xl bg-slate-950 text-amber-400 flex items-center justify-center">
                      <Play className="w-4 h-4 fill-amber-400 ml-0.5" />
                    </div>
                    <span>{t('landing.playDemo')} — Catch the Brand</span>
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};
