import React from 'react';
import { motion } from 'motion/react';
import { GAME_REGISTRY } from '../../games/registry';
import {
  Gamepad2,
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
  Gamepad2: <Gamepad2 className="w-6 h-6 text-amber-600" />,
  Zap: <Zap className="w-6 h-6 text-amber-600" />,
  Grid3X3: <Grid3X3 className="w-6 h-6 text-emerald-600" />,
  HelpCircle: <HelpCircle className="w-6 h-6 text-blue-600" />,
};

const gameArtGradients: Record<string, { bg: string; accent: string; tag: string }> = {
  'catch-brand': {
    bg: 'from-amber-500/10 via-emerald-50 to-white',
    accent: 'border-amber-200 text-amber-700',
    tag: 'Flagship Event Arcade',
  },
  'memory-match': {
    bg: 'from-emerald-500/10 via-teal-50 to-white',
    accent: 'border-emerald-200 text-emerald-700',
    tag: 'Brand Memory Grid',
  },
  'speed-quiz': {
    bg: 'from-blue-500/10 via-cyan-50 to-white',
    accent: 'border-blue-200 text-blue-700',
    tag: 'Live Audience Trivia',
  },
  'quiz-rush': {
    bg: 'from-blue-500/10 via-cyan-50 to-white',
    accent: 'border-blue-200 text-blue-700',
    tag: 'Live Audience Trivia',
  },
  'reaction-tap': {
    bg: 'from-rose-500/10 via-purple-50 to-white',
    accent: 'border-rose-200 text-rose-700',
    tag: 'Lightning Reflex',
  },
  'reaction-time': {
    bg: 'from-rose-500/10 via-purple-50 to-white',
    accent: 'border-rose-200 text-rose-700',
    tag: 'Lightning Reflex',
  },
  'tap-reaction': {
    bg: 'from-rose-500/10 via-purple-50 to-white',
    accent: 'border-rose-200 text-rose-700',
    tag: 'Lightning Reflex',
  },
};

/**
 * Resolves a game's canonical identifier for robust deduplication.
 * Different games (with distinct canonical IDs) are never conflated.
 * Aliased entries (e.g. 'reaction-time' and 'reaction-tap') map to the same canonical ID.
 */
function getCanonicalGameId(id: string): string {
  const norm = id.trim().toLowerCase().replace(/_/g, '-');
  if (norm === 'reaction-tap' || norm === 'reaction-time' || norm === 'reaction-tap-f1-reflex' || norm === 'tap-reaction') {
    return 'reaction-tap';
  }
  if (norm === 'memory-match' || norm === 'brand-memory-match') {
    return 'memory-match';
  }
  if (norm === 'speed-quiz' || norm === 'quiz-rush' || norm === 'event-trivia-speed-quiz') {
    return 'speed-quiz';
  }
  return norm;
}

export const LandingGameShowcase: React.FC<LandingGameShowcaseProps> = ({
  onTryDemo,
  onExploreAll,
}) => {
  const { isAuthenticated } = useAuth();
  const gamesList = Object.values(GAME_REGISTRY);

  // Deduplicate pipeline games by stable canonical game ID
  const upcomingGames = React.useMemo(() => {
    const seen = new Set<string>();
    const list: typeof gamesList = [];
    for (const game of gamesList) {
      if (game.id === 'catch-brand') continue;
      const canonicalId = getCanonicalGameId(game.id);
      if (!seen.has(canonicalId)) {
        seen.add(canonicalId);
        list.push(game);
      }
    }
    return list;
  }, [gamesList]);

  const handleCreateEvent = () => {
    if (isAuthenticated) {
      navigateTo('/events');
    } else {
      navigateTo('/login');
    }
  };

  return (
    <section id="game-showcase" className="relative scroll-mt-16 sm:scroll-mt-20 py-20 md:py-32 bg-white border-t border-slate-200/80 overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute top-1/3 -left-40 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 sm:mb-16 gap-6">
          <div className="max-w-2xl space-y-4">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-xs font-black text-amber-800 uppercase tracking-widest">
              <Gamepad2 className="w-3.5 h-3.5 text-amber-600" />
              <span>Event Game Catalog</span>
            </div>
            <h2 className="text-3xl sm:text-5xl md:text-6xl font-black text-slate-900 tracking-tight leading-[1.1]">
              Games Built for Events
            </h2>
            <p className="text-base sm:text-lg text-slate-600 leading-relaxed font-normal">
              Engineered for high spectator appeal, 20-45 second quick guest turnaround, instant QR access, and complete brand asset customization.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={onExploreAll}
              className="px-5 py-3 rounded-2xl bg-white border border-slate-300 hover:border-amber-400 text-slate-700 hover:text-slate-900 font-bold text-xs flex items-center gap-2 transition-all shadow-xs cursor-pointer hover:-translate-y-0.5"
            >
              <Layers className="w-4 h-4 text-amber-500" />
              <span>View Full Catalog</span>
            </button>
          </div>
        </div>

        {/* Primary Flagship Cover: Catch the Brand */}
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
                className="relative rounded-3xl p-1 bg-gradient-to-r from-amber-200 via-slate-200 to-emerald-200 shadow-xl shadow-slate-200/60 group"
              >
                <div className="rounded-[22px] bg-white border border-slate-200 overflow-hidden grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-10 p-6 sm:p-10 items-center">
                  {/* Left Column: Game Cover & Live Stage Simulator */}
                  <div className="lg:col-span-7 relative group rounded-2xl overflow-hidden border border-slate-200 bg-slate-950 aspect-[16/9] shadow-xl">
                    <div
                      className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
                      style={{
                        backgroundImage: `url('/assets/games/catch-brand/themes/default/background.png')`,
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/95 via-slate-950/20 to-slate-950/40" />

                    {/* Game Cover Badges */}
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
                        src="/assets/games/catch-brand/themes/default/item_normal_01.png"
                        alt="Catchable item"
                        className="w-12 h-12 sm:w-16 sm:h-16 drop-shadow-[0_12px_16px_rgba(0,0,0,0.7)] transform -rotate-6"
                        loading="lazy"
                      />
                    </div>
                    <div className="absolute top-1/4 right-1/4 animate-pulse">
                      <img
                        src="/assets/games/catch-brand/themes/default/item_hazard_01.png"
                        alt="Obstacle item"
                        className="w-10 h-10 sm:w-14 sm:h-14 drop-shadow-[0_12px_16px_rgba(0,0,0,0.7)] transform rotate-12 opacity-90"
                        loading="lazy"
                      />
                    </div>
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
                      <img
                        src="/assets/games/catch-brand/themes/default/basket.png"
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
                      <div className="flex items-center gap-2 text-xs font-black text-amber-700 uppercase tracking-widest">
                        <Flame className="w-4 h-4 text-amber-600" />
                        <span>Flagship Interactive Title</span>
                      </div>

                      <h3 className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight">
                        {game.name}
                      </h3>

                      <p className="text-sm sm:text-base text-slate-600 leading-relaxed font-normal">
                        Catch falling branded objects while avoiding penalty hazards. Fast-paced 30-second rounds that create immense crowd excitement and continuous spectator queues.
                      </p>

                      {/* Technical Specs Grid */}
                      <div className="pt-2 grid grid-cols-2 gap-3 text-xs">
                        <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
                          <span className="text-slate-500 block text-[10px] uppercase font-bold tracking-wider">Device Compatibility</span>
                          <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                            <Tv className="w-3.5 h-3.5 text-amber-600" />
                            <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
                            <Monitor className="w-3.5 h-3.5 text-blue-600" />
                            LED, Touch & Mobile
                          </span>
                        </div>
                        <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
                          <span className="text-slate-500 block text-[10px] uppercase font-bold tracking-wider">Round Duration</span>
                          <span className="font-semibold text-amber-800 font-mono">
                            30s (Adjustable 15-90s)
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Action CTAs */}
                    <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                      <button
                        onClick={() => onTryDemo(game.id)}
                        className="flex-1 min-h-[44px] px-5 py-3.5 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-md shadow-amber-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer hover:-translate-y-0.5"
                      >
                        <Play className="w-4 h-4 fill-slate-950" />
                        <span>Try Demo</span>
                      </button>

                      <button
                        onClick={handleCreateEvent}
                        className="flex-1 min-h-[44px] px-5 py-3.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs uppercase tracking-wider rounded-xl border border-slate-900 transition-all flex items-center justify-center gap-2 cursor-pointer hover:-translate-y-0.5"
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

        {/* Secondary Pipeline Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {upcomingGames.map((game, idx) => {
            const canonicalId = getCanonicalGameId(game.id);
            const theme = gameArtGradients[canonicalId] || gameArtGradients[game.id] || {
              bg: 'from-slate-100 to-white',
              accent: 'border-slate-200 text-slate-700',
              tag: 'Upcoming Game',
            };

              return (
                <motion.div
                  key={game.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: idx * 0.1 }}
                  className="rounded-3xl bg-white border border-slate-200 p-6 flex flex-col justify-between space-y-6 hover:border-amber-300 transition-all shadow-xs hover:shadow-lg group relative overflow-hidden"
                >
                  {/* Subtle Top Gradient Aura */}
                  <div className={`absolute top-0 inset-x-0 h-32 bg-gradient-to-b ${theme.bg} opacity-60 pointer-events-none`} />

                  <div className="space-y-4 relative z-10">
                    <div className="flex items-center justify-between">
                      <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 shadow-xs group-hover:scale-105 transition-transform">
                        {iconMap[game.iconName] || <Gamepad2 className="w-6 h-6 text-amber-600" />}
                      </div>
                      {game.isAvailable ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-800 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" /> PLAYABLE DEMO
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black bg-slate-100 text-slate-700 border border-slate-200">
                          <Clock className="w-3 h-3 text-slate-500" /> COMING SOON
                        </span>
                      )}
                    </div>

                    <div>
                      <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                        {theme.tag}
                      </div>
                      <h4 className="text-xl font-bold text-slate-900 mt-1 group-hover:text-amber-700 transition-colors">
                        {game.name}
                      </h4>
                      <p className="text-xs text-slate-600 mt-2 leading-relaxed font-normal">
                        {game.description}
                      </p>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 relative z-10 gap-2">
                    <span className="font-mono text-[11px] text-slate-500">
                      {game.minPlayers === game.maxPlayers ? `${game.minPlayers} Player` : `${game.minPlayers} - ${game.maxPlayers} Players`}
                    </span>
                    {game.isAvailable ? (
                      <button
                        type="button"
                        onClick={() => onTryDemo(game.id)}
                        className="px-3.5 py-1.5 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer hover:-translate-y-0.5"
                      >
                        <Play className="w-3.5 h-3.5 fill-slate-950" />
                        <span>Try Demo</span>
                      </button>
                    ) : (
                      <span className="font-bold text-amber-700 text-[11px]">Roadmap 2026</span>
                    )}
                  </div>
                </motion.div>
              );
            })}
        </div>
      </div>
    </section>
  );
};
