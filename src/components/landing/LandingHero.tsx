import React, { useState } from 'react';
import { motion } from 'motion/react';
import { useAuth } from '../../context/AuthContext';
import { navigateTo } from '../../hooks/useRouteContext';
import {
  Gamepad2,
  Sparkles,
  ArrowRight,
  QrCode,
  Trophy,
  Sliders,
  CheckCircle2,
  Tv,
  Zap,
} from 'lucide-react';

interface LandingHeroProps {
  onExploreGames: () => void;
}

export const LandingHero: React.FC<LandingHeroProps> = ({ onExploreGames }) => {
  const { isAuthenticated } = useAuth();
  const [interactiveBasketX, setInteractiveBasketX] = useState(50);
  const [score, setScore] = useState(14820);
  const [caughtAnim, setCaughtAnim] = useState(false);

  const handleCreateEvent = () => {
    if (isAuthenticated) {
      navigateTo('/events');
    } else {
      navigateTo('/login');
    }
  };

  const handleStageMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = Math.max(12, Math.min(88, (x / rect.width) * 100));
    setInteractiveBasketX(pct);
  };

  const triggerBonusCatch = () => {
    setScore((prev) => prev + 50);
    setCaughtAnim(true);
    setTimeout(() => setCaughtAnim(false), 700);
  };

  return (
    <section className="relative w-full pt-12 pb-20 md:pt-20 md:pb-28 overflow-hidden bg-white">
      {/* Light Ambient Atmosphere */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1100px] h-[500px] bg-gradient-to-b from-amber-500/10 via-emerald-500/5 to-transparent blur-3xl pointer-events-none rounded-full" />
      <div className="absolute top-1/4 -left-48 w-[450px] h-[450px] bg-amber-200/30 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 -right-48 w-[450px] h-[450px] bg-emerald-200/30 rounded-full blur-3xl pointer-events-none" />

      {/* Subtle Light Grid */}
      <div
        className="absolute inset-0 opacity-60 pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(to right, #f1f5f9 1px, transparent 1px), linear-gradient(to bottom, #f1f5f9 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
        }}
      />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Main Hero Header Block */}
        <div className="text-center max-w-4xl mx-auto space-y-6 md:space-y-7">
          {/* Positioning Pill */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-amber-50 border border-amber-200/80 shadow-xs backdrop-blur-md"
          >
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
            </span>
            <span className="text-[11px] sm:text-xs font-black uppercase tracking-widest text-amber-800">
              Interactive Games for Events
            </span>
          </motion.div>

          {/* Dominant Display Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.08 }}
            className="text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-black tracking-tight text-slate-900 leading-[1.05]"
          >
            Make Your Events{' '}
            <span className="bg-gradient-to-r from-amber-500 via-amber-600 to-emerald-600 bg-clip-text text-transparent drop-shadow-xs">
              Playable.
            </span>
          </motion.h1>

          {/* Clear Value Supporting Text */}
          <motion.p
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.16 }}
            className="text-base sm:text-xl md:text-2xl text-slate-600 leading-relaxed max-w-3xl mx-auto font-normal"
          >
            Create branded interactive arcade games for corporate events, product launches, roadshows, exhibitions, and brand activations.
          </motion.p>

          {/* CTA Buttons Hierarchy */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.24 }}
            className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3.5 sm:gap-4"
          >
            {/* Primary CTA */}
            <button
              onClick={handleCreateEvent}
              className="w-full sm:w-auto min-h-[48px] px-8 py-4 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black text-sm uppercase tracking-wider rounded-2xl shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40 transition-all transform hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-3 group cursor-pointer"
            >
              <Gamepad2 className="w-5 h-5" />
              <span>Create Your First Event</span>
              <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
            </button>

            {/* Secondary CTA */}
            <button
              onClick={onExploreGames}
              className="w-full sm:w-auto min-h-[48px] px-8 py-4 bg-white hover:bg-slate-50 border border-slate-300 hover:border-amber-400 text-slate-700 hover:text-slate-900 font-bold text-sm rounded-2xl shadow-xs transition-all transform hover:-translate-y-0.5 flex items-center justify-center gap-2.5 cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>Explore Games</span>
            </button>
          </motion.div>

          {/* Trust & Event Readiness Badges */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.32 }}
            id="hero-features"
            className="pt-3 flex flex-wrap items-center justify-center gap-y-2.5 gap-x-6 text-xs text-slate-600 font-medium"
          >
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              Zero App Downloads
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-amber-500 shrink-0" />
              Instant Brand Customization
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              Mainstage 4K & Mobile QR Ready
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-amber-500 shrink-0" />
              Real-time Live Leaderboards
            </span>
          </motion.div>
        </div>

        {/* Hero Interactive Stage Showcase: Large Visual Centerpiece */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.35 }}
          className="mt-12 md:mt-16 max-w-5xl mx-auto"
        >
          <div className="relative rounded-3xl p-1.5 bg-gradient-to-b from-slate-200 via-slate-100 to-amber-100/50 shadow-2xl shadow-slate-300/50">
            {/* Outer Frame */}
            <div className="bg-slate-950 rounded-[22px] border border-slate-200 overflow-hidden shadow-inner">
              {/* Event Showcase Top Bar */}
              <div className="bg-slate-900 px-4 sm:px-6 py-3.5 border-b border-slate-800 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-rose-500/80 inline-block" />
                    <span className="w-3 h-3 rounded-full bg-amber-500/80 inline-block" />
                    <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block" />
                  </div>
                  <div className="h-4 w-px bg-slate-800" />
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                      <Tv className="w-3 h-3" /> LIVE ARENA
                    </span>
                    <span className="text-xs font-semibold text-slate-300 truncate hidden sm:inline">
                      TechSummit Expo 2026 • Interactive Brand Stage
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-xs">
                  <div className="flex items-center gap-1.5 bg-slate-950 px-3 py-1 rounded-xl border border-slate-800 text-slate-300 font-mono text-[11px]">
                    <QrCode className="w-3.5 h-3.5 text-amber-400" />
                    <span>Scan QR to Play</span>
                  </div>
                </div>
              </div>

              {/* Interactive Game Stage Viewport */}
              <div
                onMouseMove={handleStageMouseMove}
                onClick={triggerBonusCatch}
                className="relative h-[320px] sm:h-[440px] md:h-[500px] w-full cursor-crosshair overflow-hidden select-none"
                style={{
                  backgroundImage: `url('/assets/games/catch-brand/themes/default/background.png')`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
              >
                {/* Dark Vignette Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-transparent to-slate-950/40 pointer-events-none" />

                {/* Floating In-Game HUD */}
                <div className="absolute top-3 sm:top-4 left-3 sm:left-4 right-3 sm:right-4 flex items-center justify-between pointer-events-none gap-2">
                  {/* Score & Combo */}
                  <div className="bg-slate-950/85 backdrop-blur-md border border-amber-500/40 px-3 sm:px-4 py-1.5 sm:py-2 rounded-2xl shadow-xl flex items-center gap-3 sm:gap-4">
                    <div>
                      <div className="text-[9px] sm:text-[10px] uppercase font-bold text-amber-400/90 tracking-wider">Score</div>
                      <div className="text-lg sm:text-2xl font-black text-amber-300 font-mono tracking-tight">
                        {score.toLocaleString()}
                      </div>
                    </div>
                    <div className="h-6 sm:h-7 w-px bg-slate-800" />
                    <div>
                      <div className="text-[9px] sm:text-[10px] uppercase font-bold text-emerald-400/90 tracking-wider">Combo</div>
                      <div className="text-xs sm:text-base font-bold text-emerald-300 font-mono">x5 BONUS</div>
                    </div>
                  </div>

                  {/* Brand Stage Badge */}
                  <div className="hidden md:flex bg-slate-950/85 backdrop-blur-md border border-slate-800 px-3.5 py-1.5 rounded-2xl shadow-xl items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-bold text-slate-100">Official Brand Activation</span>
                  </div>

                  {/* Timer */}
                  <div className="bg-slate-950/85 backdrop-blur-md border border-slate-800 px-3 sm:px-4 py-1.5 sm:py-2 rounded-2xl shadow-xl flex items-center gap-2">
                    <div className="text-right">
                      <div className="text-[9px] sm:text-[10px] uppercase font-bold text-slate-400">Time Left</div>
                      <div className="text-base sm:text-lg font-bold text-rose-400 font-mono">00:18</div>
                    </div>
                  </div>
                </div>

                {/* Animated Falling Collectibles */}
                <div className="absolute top-16 left-[25%] animate-bounce duration-1000 pointer-events-none">
                  <img
                    src="/assets/games/catch-brand/themes/default/item_normal_01.png"
                    alt="Brand Object"
                    className="w-12 h-12 sm:w-16 sm:h-16 drop-shadow-[0_10px_15px_rgba(0,0,0,0.5)] transform -rotate-12"
                    loading="eager"
                  />
                  <span className="px-2 py-0.5 rounded bg-emerald-500/90 text-slate-950 font-black text-[10px] shadow absolute -top-2 -right-2">
                    +50
                  </span>
                </div>

                <div className="absolute top-28 right-[30%] animate-pulse pointer-events-none">
                  <img
                    src="/assets/games/catch-brand/themes/default/item_hazard_01.png"
                    alt="Obstacle Object"
                    className="w-10 h-10 sm:w-14 sm:h-14 drop-shadow-[0_10px_15px_rgba(0,0,0,0.5)] transform rotate-12 opacity-90"
                    loading="eager"
                  />
                </div>

                {/* Catch Popup Animation */}
                {caughtAnim && (
                  <div
                    className="absolute bottom-28 transition-all pointer-events-none transform -translate-x-1/2"
                    style={{ left: `${interactiveBasketX}%` }}
                  >
                    <span className="px-3 py-1 rounded-full bg-amber-400 text-slate-950 font-black text-xs shadow-xl animate-ping inline-block">
                      GREAT CATCH! +50
                    </span>
                  </div>
                )}

                {/* Interactive Player Basket (Controlled by mouse hover) */}
                <div
                  className="absolute bottom-6 transition-all duration-75 pointer-events-none transform -translate-x-1/2 flex flex-col items-center"
                  style={{ left: `${interactiveBasketX}%` }}
                >
                  <img
                    src="/assets/games/catch-brand/themes/default/basket.png"
                    alt="Player Catcher"
                    className="w-24 sm:w-32 h-auto drop-shadow-[0_15px_20px_rgba(0,0,0,0.6)]"
                    loading="eager"
                  />
                  <div className="mt-1 px-2.5 py-0.5 bg-slate-950/85 border border-amber-500/40 rounded-full text-[10px] font-bold text-amber-300 whitespace-nowrap shadow-md">
                    Hover to steer catcher
                  </div>
                </div>

                {/* Floating Feature Pills Over Stage */}
                <div className="absolute bottom-4 left-4 right-4 hidden sm:flex items-center justify-between pointer-events-none">
                  <div className="flex items-center gap-2 bg-slate-950/90 backdrop-blur-md border border-slate-800 px-3.5 py-2 rounded-xl text-xs text-slate-300">
                    <Sliders className="w-3.5 h-3.5 text-amber-400" />
                    <span>Real-time Custom Theme Engine</span>
                  </div>

                  <div className="flex items-center gap-2 bg-slate-950/90 backdrop-blur-md border border-slate-800 px-3.5 py-2 rounded-xl text-xs text-slate-300">
                    <Trophy className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Instant Live Leaderboard Sync</span>
                  </div>
                </div>
              </div>

              {/* Stage Sub-bar */}
              <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-500 shrink-0" />
                  <span className="font-semibold text-slate-800">
                    Turn your booth or venue into an interactive gaming experience in minutes.
                  </span>
                </div>
                <button
                  onClick={handleCreateEvent}
                  className="font-bold text-amber-600 hover:text-amber-700 flex items-center gap-1 transition-colors self-end sm:self-auto cursor-pointer"
                >
                  <span>Launch Event Now</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};
