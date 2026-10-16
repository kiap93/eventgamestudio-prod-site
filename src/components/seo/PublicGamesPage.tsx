import React from 'react';
import { LandingHeader } from '../landing/LandingHeader';
import { LandingFooter } from '../landing/LandingFooter';
import { SEO } from '../common/SEO';
import { getPageSeo } from '../../lib/seo';
import { InternalLink } from '../common/InternalLink';
import { useLocalization } from '../../context/LocalizationContext';
import {
  Gamepad2,
  Sparkles,
  ArrowRight,
  ChevronRight,
  Clock,
  Smartphone,
  Trophy,
  Zap,
  Grid3X3,
  ShoppingBasket,
  HelpCircle,
  Play,
  RotateCcw,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';

interface PublicGameSummary {
  id: string;
  slug: string;
  name: string;
  category: string;
  icon: React.ElementType;
  duration: string;
  description: string;
  highlight: string;
  isAvailable: boolean;
  comingSoon?: boolean;
}

const PUBLIC_GAMES: PublicGameSummary[] = [
  {
    id: 'catch-brand',
    slug: 'catch-the-brand',
    name: 'Catch the Brand',
    category: 'Arcade Catcher',
    icon: ShoppingBasket,
    duration: '20s - 60s',
    description: 'Fast-paced arcade catcher! Catch falling branded items, dodge hazards, and collect golden bonus multipliers.',
    highlight: 'Highest attendee throughput (60+ players/hr). Perfect for roadshows & booth activations.',
    isAvailable: true,
  },
  {
    id: 'match-3',
    slug: 'brand-match-3',
    name: 'Match-3 Puzzle Challenge',
    category: 'Puzzle',
    icon: Grid3X3,
    duration: '30s - 60s',
    description: 'Swap adjacent custom branded tiles to make rows or columns of 3, 4, or 5 with cascading combos and explosive power-ups.',
    highlight: 'Universal appeal for all age demographics. Custom tile icons, special gems, and audio.',
    isAvailable: true,
  },
  {
    id: 'reaction-tap',
    slug: 'formula-reaction-lights',
    name: 'Formula Reaction Lights',
    category: 'Precision Reflex',
    icon: Zap,
    duration: '10s - 20s',
    description: 'Measure reaction speed in an F1-style starting gantry light sequence. When the lights go out, tap as fast as possible!',
    highlight: 'Instant competitive excitement with millisecond-precision timing. Perfect for sports & auto events.',
    isAvailable: true,
  },
  {
    id: 'memory-match',
    slug: 'card-memory-match',
    name: 'Card Memory Match',
    category: 'Memory & Recall',
    icon: RotateCcw,
    duration: '30s - 60s',
    description: 'Flip cards and match branded pairs against the countdown clock. Showcases multiple products or corporate trivia.',
    highlight: 'Exceptional brand retention. Features 8 custom branded product pair faces and custom card back.',
    isAvailable: true,
  },
  {
    id: 'speed-quiz',
    slug: 'speed-trivia-quiz',
    name: 'Speed Trivia Quiz',
    category: 'Trivia & Education',
    icon: HelpCircle,
    duration: '30s - 60s',
    description: 'Rapid-fire multiple choice trivia questions testing product knowledge, brand history, or annual summit themes.',
    highlight: 'Coming soon. Educational activations and corporate training summits.',
    isAvailable: false,
    comingSoon: true,
  },
];

export const PublicGamesPage: React.FC = () => {
  const { t } = useLocalization();
  const pageSeo = getPageSeo('/game-showcase');

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-500 selection:text-slate-950">
      <SEO
        title={pageSeo.title}
        description={pageSeo.description}
        canonical={pageSeo.canonical}
        h1={pageSeo.h1}
        breadcrumbs={pageSeo.breadcrumbs}
      />

      <LandingHeader onOpenCatalog={() => {}} />

      <main className="flex-1 pt-24 pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Hero Section */}
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold tracking-wide">
              <Gamepad2 className="w-3.5 h-3.5" />
              <span>{t('games.catalogBadge', undefined, 'Interactive Event Mini-Game Suite')}</span>
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-slate-100 tracking-tight">
              {t('games.catalogTitle', undefined, 'Branded Mini-Games for Live Events')}
            </h1>

            <p className="text-sm sm:text-base text-slate-400 leading-relaxed max-w-2xl mx-auto">
              {t('games.catalogSubtitle', undefined, 'Choose from our proven event game engines. Customize artwork, sound effects, scoring rules, and leaderboards in minutes.')}
            </p>
          </div>

          {/* Game Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8 mb-20">
            {PUBLIC_GAMES.map((game) => {
              const IconComp = game.icon;
              return (
                <div
                  key={game.id}
                  className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-7 shadow-xl hover:border-amber-500/40 transition-all flex flex-col justify-between group"
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="w-12 h-12 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center justify-center text-amber-400 group-hover:scale-105 transition-transform">
                        <IconComp className="w-6 h-6" />
                      </div>
                      <div className="flex items-center gap-2">
                        {game.comingSoon ? (
                          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                            {t('common.comingSoon', undefined, 'Coming Soon')}
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            {t('common.readyToPlay', undefined, 'Ready to Deploy')}
                          </span>
                        )}
                      </div>
                    </div>

                    <div>
                      <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider">
                        {game.category}
                      </span>
                      <h3 className="text-lg font-bold text-slate-100 mt-0.5 group-hover:text-amber-400 transition-colors">
                        {game.name}
                      </h3>
                    </div>

                    <p className="text-xs text-slate-400 leading-relaxed">
                      {game.description}
                    </p>

                    <div className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-2xl text-[11px] text-slate-300 leading-relaxed">
                      <span className="font-semibold text-amber-300">{t('games.keyAdvantage', undefined, 'Best For')}: </span>
                      {game.highlight}
                    </div>
                  </div>

                  <div className="pt-6 mt-6 border-t border-slate-800/80 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                      <Clock className="w-3.5 h-3.5 text-amber-400" />
                      <span>{game.duration}</span>
                    </div>

                    <InternalLink
                      to={`/game-showcase/${game.slug}`}
                      className="inline-flex items-center gap-1 text-xs font-bold text-amber-400 hover:text-amber-300 transition-colors"
                    >
                      <span>{t('games.viewDetails', undefined, 'Details & Specs')}</span>
                      <ChevronRight className="w-4 h-4" />
                    </InternalLink>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Solutions Cross-Links Grid */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-3xl p-8 sm:p-10 shadow-2xl">
            <div className="max-w-2xl mb-8">
              <h2 className="text-xl font-bold text-slate-100 mb-2">
                {t('games.solutionsTitle', undefined, 'Tailored for Every Event Format')}
              </h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                {t('games.solutionsSubtitle', undefined, 'Explore specialized play setups and live leaderboard architectures designed for different event environments.')}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <InternalLink
                to="/corporate-event-games"
                className="p-4 bg-slate-950 border border-slate-800 hover:border-amber-500/40 rounded-2xl transition-all group block"
              >
                <p className="text-xs font-bold text-slate-200 group-hover:text-amber-400 transition-colors">
                  Corporate Event Games
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Annual Dinners & Galas →
                </p>
              </InternalLink>

              <InternalLink
                to="/brand-activation-games"
                className="p-4 bg-slate-950 border border-slate-800 hover:border-amber-500/40 rounded-2xl transition-all group block"
              >
                <p className="text-xs font-bold text-slate-200 group-hover:text-amber-400 transition-colors">
                  Brand Activations
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Pop-Ups & Retail Tours →
                </p>
              </InternalLink>

              <InternalLink
                to="/roadshow-games"
                className="p-4 bg-slate-950 border border-slate-800 hover:border-amber-500/40 rounded-2xl transition-all group block"
              >
                <p className="text-xs font-bold text-slate-200 group-hover:text-amber-400 transition-colors">
                  Roadshow Games
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Mall Kiosks & Touchscreens →
                </p>
              </InternalLink>

              <InternalLink
                to="/exhibition-games"
                className="p-4 bg-slate-950 border border-slate-800 hover:border-amber-500/40 rounded-2xl transition-all group block"
              >
                <p className="text-xs font-bold text-slate-200 group-hover:text-amber-400 transition-colors">
                  Exhibition Games
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Trade Booth Crowd Magnets →
                </p>
              </InternalLink>
            </div>
          </div>
        </div>
      </main>

      <LandingFooter />
    </div>
  );
};
