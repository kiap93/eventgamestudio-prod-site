import React, { useState } from 'react';
import { LandingHeader } from '../landing/LandingHeader';
import { LandingFooter } from '../landing/LandingFooter';
import { SEO } from '../common/SEO';
import { getPageSeo } from '../../lib/seo';
import { InternalLink } from '../common/InternalLink';
import { navigateTo } from '../../hooks/useRouteContext';
import { useAuth } from '../../context/AuthContext';
import { useLocalization } from '../../context/LocalizationContext';
import {
  Gamepad2,
  Sparkles,
  ArrowRight,
  ChevronRight,
  Clock,
  Users,
  Smartphone,
  Trophy,
  Sliders,
  CheckCircle2,
  Zap,
  Grid3X3,
  ShoppingBasket,
  HelpCircle,
  Play,
} from 'lucide-react';
import { LandingDemoModal } from '../landing/LandingDemoModal';

interface PublicGameCard {
  id: string;
  slug: string;
  name: string;
  category: string;
  duration: string;
  tagline: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  isAvailable: boolean;
  comingSoon?: boolean;
  features: string[];
  eventTypes: string[];
  bannerBg: string;
}

const PUBLIC_GAMES: PublicGameCard[] = [
  {
    id: 'catch-brand',
    slug: '/game-showcase/catch-the-brand',
    name: 'Catch the Brand',
    category: 'Arcade Action',
    duration: '20 seconds default',
    tagline: 'Fast-paced item catching challenge with scoring multipliers.',
    description:
      'Participants catch falling brand items while dodging hazardous obstacles and snagging golden multiplier bonuses before time expires. Ideal for high crowd turnover.',
    icon: ShoppingBasket,
    isAvailable: true,
    features: ['Custom catcher avatar & basket', 'Branded good & hazard items', 'Golden bonus multipliers', 'Touch, mouse & keyboard controls'],
    eventTypes: ['Roadshows', 'Exhibition Booths', 'Annual Dinners', 'Product Launches'],
    bannerBg: 'from-amber-500/20 via-orange-500/10 to-transparent',
  },
  {
    id: 'memory-match',
    slug: '/game-showcase/memory-match',
    name: 'Brand Memory Match',
    category: 'Memory Puzzle',
    duration: '45 seconds default',
    tagline: 'Classic card flip matching custom branded product pairs.',
    description:
      'Players flip cards across a 4x4 grid to match 8 pairs of branded items, logos, or executive portraits with combo bonuses for rapid consecutive matches.',
    icon: Grid3X3,
    isAvailable: true,
    features: ['8 custom card pairs', 'Branded card back cover', 'Combo multiplier streaks', 'Portrait & landscape support'],
    eventTypes: ['Trade Shows', 'Corporate Galas', 'Retail Activations', 'Summit Lounges'],
    bannerBg: 'from-blue-500/20 via-indigo-500/10 to-transparent',
  },
  {
    id: 'reaction-tap',
    slug: '/game-showcase/reaction-challenge',
    name: 'Formula Reaction Lights',
    category: 'Reflex Challenge',
    duration: '15 seconds default',
    tagline: 'Millisecond reflex contest based on motorsport starting lights.',
    description:
      'Five red lights light up one-by-one. When the lights extinguish at a random split-second interval, players react instantly to clock their reaction time in milliseconds.',
    icon: Zap,
    isAvailable: true,
    features: ['Millisecond accuracy', 'Jump-start penalty detection', 'Branded backdrops', 'Instant competitive leaderboard'],
    eventTypes: ['Auto Shows', 'VIP Lounges', 'Tech Summits', 'Sports Activations'],
    bannerBg: 'from-emerald-500/20 via-teal-500/10 to-transparent',
  },
  {
    id: 'speed-quiz',
    slug: '/game-showcase/speed-quiz',
    name: 'Event Trivia Speed Quiz',
    category: 'Trivia Challenge',
    duration: '30 seconds (Roadmap)',
    tagline: 'Interactive timed multiple-choice brand trivia challenge.',
    description:
      'Test crowd knowledge with custom company trivia, multiple-choice questions, and live buzzer scoring. Currently scheduled on the platform roadmap.',
    icon: HelpCircle,
    isAvailable: false,
    comingSoon: true,
    features: ['Timed question rounds', 'Custom brand trivia questions', 'Live buzzer mechanics', 'In active development'],
    eventTypes: ['Town Halls', 'Training Seminars', 'Corporate Quizzes'],
    bannerBg: 'from-purple-500/20 via-pink-500/10 to-transparent',
  },
];

export const PublicGamesPage: React.FC = () => {
  const { t } = useLocalization();
  const { isAuthenticated } = useAuth();
  const pageSeo = getPageSeo('/game-showcase');
  const [demoModalOpen, setDemoModalOpen] = useState(false);
  const [selectedDemoGameId, setSelectedDemoGameId] = useState<string>('catch-brand');

  const handleLaunchDemo = (gameId: string) => {
    setSelectedDemoGameId(gameId);
    setDemoModalOpen(true);
  };

  const handleGetStarted = () => {
    if (isAuthenticated) {
      navigateTo('/events');
    } else {
      navigateTo('/login');
    }
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 flex flex-col font-sans selection:bg-amber-100 selection:text-amber-900">
      <SEO config={pageSeo} />

      <LandingHeader onExploreGames={() => {}} />

      <main className="flex-1">
        {/* Breadcrumbs */}
        <div className="w-full bg-slate-50 border-b border-slate-200/80 py-2.5">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <nav className="flex items-center gap-2 text-xs text-slate-500 font-medium">
              <InternalLink href="/" className="hover:text-amber-600 transition-colors">
                {t('nav.home')}
              </InternalLink>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-900 font-semibold">{t('nav.games')}</span>
            </nav>
          </div>
        </div>

        {/* Hero */}
        <section className="pt-12 pb-14 md:pt-16 md:pb-20 bg-gradient-to-b from-amber-500/5 via-white to-white border-b border-slate-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-4">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-800 text-xs font-bold uppercase tracking-wider">
              <Gamepad2 className="w-3.5 h-3.5 text-amber-600" />
              <span>{t('gamesCatalog.heroTitle')}</span>
            </div>
            <h1 className="text-3xl sm:text-5xl md:text-6xl font-black text-slate-900 tracking-tight">
              {t('gamesCatalog.catalogHeading', undefined, 'Interactive Event Games')}
            </h1>
            <p className="text-base sm:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
              {t('gamesCatalog.heroSubtitle')}
            </p>
          </div>
        </section>

        {/* Games Grid */}
        <section className="py-14 md:py-20 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {PUBLIC_GAMES.map((game) => {
                const IconComponent = game.icon;
                return (
                  <div
                    key={game.id}
                    className="rounded-3xl border border-slate-200/90 bg-white hover:border-amber-400/80 hover:shadow-xl hover:shadow-slate-900/5 transition-all p-7 sm:p-8 flex flex-col justify-between space-y-6 relative overflow-hidden group"
                  >
                    {/* Top ambient banner */}
                    <div className={`absolute top-0 left-0 right-0 h-28 bg-gradient-to-b ${game.bannerBg} pointer-events-none`} />

                    <div className="relative space-y-5">
                      {/* Category & Status Pill */}
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[11px] font-black uppercase tracking-wider px-3 py-1 rounded-full bg-slate-100 text-slate-700">
                          {game.category}
                        </span>
                        {game.isAvailable ? (
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            <span>{t('event.statusLive')}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
                            <Clock className="w-3 h-3 text-amber-600" />
                            <span>{t('gamesCatalog.comingSoon')}</span>
                          </span>
                        )}
                      </div>

                      {/* Title & Tagline */}
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-2xl bg-slate-900 text-amber-400 flex items-center justify-center shrink-0">
                            <IconComponent className="w-6 h-6" />
                          </div>
                          <div>
                            <h2 className="text-2xl font-black text-slate-900 group-hover:text-amber-700 transition-colors">
                              {game.name}
                            </h2>
                            <p className="text-xs text-slate-500 font-medium">{game.duration}</p>
                          </div>
                        </div>
                        <p className="text-xs sm:text-sm text-slate-600 leading-relaxed pt-2">
                          {game.description}
                        </p>
                      </div>

                      {/* Feature Checklist */}
                      <div className="space-y-2 pt-2 border-t border-slate-100">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                          {t('gamesCatalog.keyFeatures')}
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-700">
                          {game.features.map((feat, fIdx) => (
                            <div key={fIdx} className="flex items-center gap-2">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              <span>{feat}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Event Types */}
                      <div className="flex flex-wrap gap-1.5 pt-2">
                        {game.eventTypes.map((et, etIdx) => (
                          <span key={etIdx} className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-50 text-slate-600 border border-slate-200/70">
                            {et}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="pt-4 border-t border-slate-100 flex items-center gap-3">
                      {game.isAvailable ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleLaunchDemo(game.id)}
                            className="flex-1 py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition-colors cursor-pointer flex items-center justify-center gap-2"
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                            <span>{t('gamesCatalog.launchDemo')}</span>
                          </button>
                          <InternalLink
                            href={game.slug}
                            className="py-3 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs transition-colors flex items-center gap-1.5"
                          >
                            <span>{t('gamesCatalog.viewGameDetails')}</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </InternalLink>
                        </>
                      ) : (
                        <InternalLink
                          href={game.slug}
                          className="w-full py-3 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors flex items-center justify-center gap-1.5 text-center"
                        >
                          <span>{t('landing.preOrderEnquire')}</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </InternalLink>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Event Solutions Link Matrix */}
        <section className="py-14 bg-slate-50 border-t border-slate-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
            <div className="text-center max-w-2xl mx-auto space-y-2">
              <h2 className="text-xl sm:text-2xl font-black text-slate-900">
                {t('seoSolutions.provenUseCases')}
              </h2>
              <p className="text-xs sm:text-sm text-slate-600">
                {t('seoSolutions.exploreRelatedSolutions')}
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 text-xs font-semibold">
              <InternalLink
                href="/corporate-event-games"
                className="p-4 rounded-xl bg-white border border-slate-200 hover:border-amber-400 text-left transition-colors block"
              >
                <span className="text-slate-900 block">{t('seoSolutions.corporateGamesTitle')}</span>
                <span className="text-[11px] text-slate-500 font-normal">{t('seoSolutions.corporateGamesSubtitle')}</span>
              </InternalLink>
              <InternalLink
                href="/brand-activation-games"
                className="p-4 rounded-xl bg-white border border-slate-200 hover:border-amber-400 text-left transition-colors block"
              >
                <span className="text-slate-900 block">{t('seoSolutions.brandActivationsTitle')}</span>
                <span className="text-[11px] text-slate-500 font-normal">{t('seoSolutions.brandActivationsSubtitle')}</span>
              </InternalLink>
              <InternalLink
                href="/roadshow-games"
                className="p-4 rounded-xl bg-white border border-slate-200 hover:border-amber-400 text-left transition-colors block"
              >
                <span className="text-slate-900 block">{t('seoSolutions.roadshowGamesTitle')}</span>
                <span className="text-[11px] text-slate-500 font-normal">{t('seoSolutions.roadshowGamesSubtitle')}</span>
              </InternalLink>
              <InternalLink
                href="/exhibition-games"
                className="p-4 rounded-xl bg-white border border-slate-200 hover:border-amber-400 text-left transition-colors block"
              >
                <span className="text-slate-900 block">{t('seoSolutions.exhibitionGamesTitle')}</span>
                <span className="text-[11px] text-slate-500 font-normal">{t('seoSolutions.exhibitionGamesSubtitle')}</span>
              </InternalLink>
            </div>
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="py-14 bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 text-center">
          <div className="max-w-4xl mx-auto px-4 space-y-4">
            <h2 className="text-2xl sm:text-4xl font-black">
              {t('landing.finalCtaHeadline')}
            </h2>
            <p className="text-sm sm:text-base font-medium max-w-xl mx-auto text-slate-900/80">
              {t('landing.finalCtaSubtitle')}
            </p>
            <div className="pt-2 flex justify-center gap-3">
              <button
                type="button"
                onClick={handleGetStarted}
                className="px-7 py-3.5 rounded-2xl bg-slate-950 text-white font-black text-xs hover:bg-slate-900 transition-colors shadow-lg cursor-pointer"
              >
                {t('event.createEvent')}
              </button>
              <InternalLink
                href="/contact"
                className="px-6 py-3.5 rounded-2xl bg-white text-slate-950 font-bold text-xs hover:bg-slate-50 transition-colors inline-block text-center"
              >
                {t('nav.contact')}
              </InternalLink>
            </div>
          </div>
        </section>
      </main>

      <LandingFooter />

      {demoModalOpen && (
        <LandingDemoModal
          isOpen={demoModalOpen}
          onClose={() => setDemoModalOpen(false)}
          initialGameId={selectedDemoGameId}
        />
      )}
    </div>
  );
};
