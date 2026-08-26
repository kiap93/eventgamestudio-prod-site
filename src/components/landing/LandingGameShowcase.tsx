import React from 'react';
import { motion } from 'motion/react';
import { GAME_REGISTRY } from '../../games/registry';
import {
  Gamepad2,
  Sparkles,
  Play,
  ArrowRight,
  Zap,
  Grid3X3,
  HelpCircle,
  Layers,
  CheckCircle2,
  Clock,
  Smartphone,
  Tv,
  Monitor,
  Flame,
} from 'lucide-react';
import { navigateTo } from '../../hooks/useRouteContext';
import { useAuth } from '../../context/AuthContext';

interface LandingGameShowcaseProps {
  onTryDemo: (gameId: string) => void;
  onExploreAll: () => void;
}

const iconMap: Record<string, React.ReactNode> = {
  Gamepad2: <Gamepad2 className="w-6 h-6 text-amber-400" />,
  Zap: <Zap className="w-6 h-6 text-amber-400" />,
  Grid3X3: <Grid3X3 className="w-6 h-6 text-emerald-400" />,
  HelpCircle: <HelpCircle className="w-6 h-6 text-cyan-400" />,
};

const gameArtGradients: Record<string, { bg: string; accent: string; tag: string }> = {
  'catch-brand': {
    bg: 'from-amber-500/20 via-emerald-950/40 to-slate-950',
    accent: 'border-amber-500/40 text-amber-400',
    tag: 'Flagship Event Arcade',
  },
  'memory-match': {
    bg: 'from-emerald-600/20 via-teal-950/40 to-slate-950',
    accent: 'border-emerald-500/40 text-emerald-400',
    tag: 'Brand Memory Grid',
  },
  'quiz-rush': {
    bg: 'from-cyan-600/20 via-blue-950/40 to-slate-950',
    accent: 'border-cyan-500/40 text-cyan-400',
    tag: 'Live Audience Trivia',
  },
  'tap-reaction': {
    bg: 'from-rose-600/20 via-purple-950/40 to-slate-950',
    accent: 'border-rose-500/40 text-rose-400',
    tag: 'Lightning Reflex',
  },
};

export const LandingGameShowcase: React.FC<LandingGameShowcaseProps> = ({
  onTryDemo,
  onExploreAll,
}) => {
  const { isAuthenticated } = useAuth();
  const gamesList = Object.values(GAME_REGISTRY);

  const handleCreateEvent = () => {
    if (isAuthenticated) {
      navigateTo('/events');
    } else {
      navigateTo('/login');
    }
  };

  return (
    <section id="game-showcase" className="relative py-20 md:py-32 bg-slate-950 border-t border-slate-900 overflow-hidden">
      {/* Dynamic Background Glow */}
      <div className="absolute top-1/3 -left-40 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 sm:mb-16 gap-6">
          <div className="max-w-2xl space-y-4">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs font-black text-amber-400 uppercase tracking-widest">
              <Gamepad2 className="w-3.5 h-3.5" />
              <span>Event Game Catalog</span>
            </div>
            <h2 className="text-3xl sm:text-5xl md:text-6xl font-black text-white tracking-tight leading-[1.1]">
              Games Built for Events
            </h2>
            <p className="text-base sm:text-lg text-slate-400 leading-relaxed font-normal">
              Engineered for high spectator appeal, 20-45 second quick guest turnaround, instant QR access, and complete brand asset customization.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={onExploreAll}
              className="px-5 py-3 rounded-2xl bg-slate-900 border border-slate-700/80 hover:border-amber-500/50 text-slate-200 hover:text-white font-bold text-xs flex items-center gap-2 transition-all shadow-md cursor-pointer hover:-translate-y-0.5"
            >
              <Layers className="w-4 h-4 text-amber-400" />
              <span>View Full Catalog</span>
            </button>
          </div>
        </div>

        {/* Primary Flagship Cover: Catch the Brand (Durian Catch) */}
        <div className="mb-10 sm:mb-14">
          {gamesList
            .filter((g) => g.id === 'catch-brand')
            .map((game) => (
              <motion.div
                key={game.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6 }}
                className="relative rounded-3xl p-1 bg-gradient-to-r from-amber-500/40 via-slate-800 to-emerald-500/30 shadow-2xl shadow-slate-950 group"
              >
                <div className="rounded-[22px] bg-slate-900/95 border border-slate-800/90 overflow-hidden grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-10 p-6 sm:p-10 items-center">
                  {/* Left Column: Premium Game Cover & Live Stage Simulator */}
                  <div className="lg:col-span-7 relative group rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 aspect-[16/9] shadow-2xl">
                    <div
                      className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
                      style={{
                        backgroundImage: `url('/assets/themes/carnival/background.png')`,
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/95 via-slate-950/20 to-slate-950/40" />

                    {/* Game Cover Holographic Badges */}
                    <div className="absolute top-3 sm:top-4 left-3 sm:left-4 right-3 sm:right-4 flex items-center justify-between pointer-events-none gap-2">
                      <span className="px-3 py-1 rounded-full bg-emerald-500 text-slate-950 font-black text-[11px] uppercase tracking-wider shadow-lg flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" /> LIVE IN PRODUCTION
                      </span>
                      <span className="px-3 py-1 rounded-full bg-slate-950/90 backdrop-blur-md border border-amber-500/40 text-amber-300 font-mono text-[11px] font-bold">
                        ARCADE CATCHER
                      </span>
                    </div>

                    {/* Animated Stage Elements */}
                    <div className="absolute top-1/3 left-1/4 animate-bounce duration-1000">
                      <img
                        src="/assets/themes/carnival/item_normal_01.png"
                        alt="Catchable item"
                        className="w-12 h-12 sm:w-16 sm:h-16 drop-shadow-[0_12px_16px_rgba(0,0,0,0.7)] transform -rotate-6"
                        loading="lazy"
                      />
                    </div>
                    <div className="absolute top-1/4 right-1/4 animate-pulse">
                      <img
                        src="/assets/themes/carnival/item_hazard_01.png"
                        alt="Obstacle item"
                        className="w-10 h-10 sm:w-14 sm:h-14 drop-shadow-[0_12px_16px_rgba(0,0,0,0.7)] transform rotate-12 opacity-90"
                        loading="lazy"
                      />
                    </div>
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
                      <img
                        src="/assets/themes/carnival/basket.png"
                        alt="Player catcher"
                        className="w-28 sm:w-36 h-auto drop-shadow-[0_20px_25px_rgba(0,0,0,0.8)]"
                        loading="lazy"
                      />
                    </div>

                    {/* Hover Play Button Overlay */}
                    <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-xs">
                      <button
                        onClick={() => onTryDemo(game.id)}
                        className="px-6 py-3.5 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black text-sm uppercase tracking-wider rounded-2xl shadow-2xl flex items-center gap-2 transform translate-y-2 group-hover:translate-y-0 transition-all cursor-pointer"
                      >
                        <Play className="w-4 h-4 fill-slate-950" />
                        <span>Launch Live Demo</span>
                      </button>
                    </div>
                  </div>

                  {/* Right Column: Premium Game Specifications & Direct CTAs */}
                  <div className="lg:col-span-5 space-y-6 flex flex-col justify-between h-full">
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 text-xs font-black text-amber-400 uppercase tracking-widest">
                        <Flame className="w-4 h-4 text-amber-400" />
                        <span>Flagship Interactive Title</span>
                      </div>

                      <h3 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
                        {game.name}
                      </h3>

                      <p className="text-sm sm:text-base text-slate-300 leading-relaxed font-normal">
                        Catch falling branded objects while avoiding penalty hazards. Fast-paced 30-second rounds that create immense crowd excitement and continuous spectator queues.
                      </p>

                      {/* Technical Specs Grid */}
                      <div className="pt-2 grid grid-cols-2 gap-3 text-xs">
                        <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-1">
                          <span className="text-slate-500 block text-[10px] uppercase font-bold tracking-wider">Device Compatibility</span>
                          <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                            <Tv className="w-3.5 h-3.5 text-amber-400" />
                            <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
                            <Monitor className="w-3.5 h-3.5 text-cyan-400" />
                            LED, Touch & Mobile
                          </span>
                        </div>
                        <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-1">
                          <span className="text-slate-500 block text-[10px] uppercase font-bold tracking-wider">Round Duration</span>
                          <span className="font-semibold text-amber-300 font-mono">
                            30s (Adjustable 15-90s)
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Action CTAs */}
                    <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                      <button
                        onClick={() => onTryDemo(game.id)}
                        className="flex-1 min-h-[44px] px-5 py-3.5 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer hover:-translate-y-0.5"
                      >
                        <Play className="w-4 h-4 fill-slate-950" />
                        <span>Try Demo</span>
                      </button>

                      <button
                        onClick={handleCreateEvent}
                        className="flex-1 min-h-[44px] px-5 py-3.5 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl border border-slate-700 transition-all flex items-center justify-center gap-2 cursor-pointer hover:-translate-y-0.5"
                      >
                        <span>Create Event</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
        </div>

        {/* Secondary Pipeline Grid: Styled as Premium Upcoming Game Covers */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {gamesList
            .filter((g) => g.id !== 'catch-brand')
            .map((game, idx) => {
              const theme = gameArtGradients[game.id] || {
                bg: 'from-slate-800/40 to-slate-950',
                accent: 'border-slate-700 text-slate-300',
                tag: 'Upcoming Game',
              };

              return (
                <motion.div
                  key={game.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: idx * 0.1 }}
                  className="rounded-3xl bg-gradient-to-b from-slate-900/90 to-slate-950 border border-slate-800/90 p-6 flex flex-col justify-between space-y-6 hover:border-slate-700 transition-all shadow-xl group relative overflow-hidden"
                >
                  {/* Subtle Top Gradient Aura */}
                  <div className={`absolute top-0 inset-x-0 h-32 bg-gradient-to-b ${theme.bg} opacity-30 pointer-events-none`} />

                  <div className="space-y-4 relative z-10">
                    <div className="flex items-center justify-between">
                      <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 shadow-inner group-hover:scale-105 transition-transform">
                        {iconMap[game.iconName] || <Gamepad2 className="w-6 h-6 text-amber-400" />}
                      </div>
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black bg-slate-950 text-amber-400 border border-slate-800">
                        <Clock className="w-3 h-3 text-amber-400" /> COMING SOON
                      </span>
                    </div>

                    <div>
                      <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                        {theme.tag}
                      </div>
                      <h4 className="text-xl font-bold text-white mt-1 group-hover:text-amber-300 transition-colors">
                        {game.name}
                      </h4>
                      <p className="text-xs text-slate-400 mt-2 leading-relaxed font-normal">
                        {game.description}
                      </p>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-500 relative z-10">
                    <span className="font-mono text-[11px] text-slate-400">1 - 4 Players</span>
                    <span className="font-bold text-amber-400/90 text-[11px]">Roadmap 2026</span>
                  </div>
                </motion.div>
              );
            })}
        </div>
      </div>
    </section>
  );
};

