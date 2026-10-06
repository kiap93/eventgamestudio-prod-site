import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  Gamepad2,
  Play,
  ArrowRight,
  Zap,
  Grid3X3,
  HelpCircle,
  Clock,
  Tv,
  Smartphone,
  Trophy,
  Tag,
} from 'lucide-react';
import { useLocalization } from '../../context/LocalizationContext';
import { InternalLink } from '../common/InternalLink';
import {
  fetchPublicGamesPricing,
  getGameStartingPrice,
  formatPublicPrice,
  PublicGameWithPricing,
} from '../../lib/publicPricing';

interface LandingGameShowcaseProps {
  onTryDemo: (gameId: string) => void;
  onExploreAll: () => void;
}

export const LandingGameShowcase: React.FC<LandingGameShowcaseProps> = ({
  onTryDemo,
  onExploreAll,
}) => {
  const { t } = useLocalization();
  const [publicGames, setPublicGames] = useState<PublicGameWithPricing[]>([]);
  const [loadingPricing, setLoadingPricing] = useState<boolean>(true);
  const [pricingError, setPricingError] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    fetchPublicGamesPricing()
      .then((games) => {
        if (isMounted) {
          setPublicGames(games);
          setLoadingPricing(false);
        }
      })
      .catch((err) => {
        console.error('Failed to load public games pricing in showcase:', err);
        if (isMounted) {
          setPricingError(true);
          setLoadingPricing(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const games = [
    {
      id: 'catch-brand',
      name: t('landing.catchBrandName'),
      type: '2D Physics Arcade Catcher',
      desc: t('landing.catchBrandDesc'),
      duration: '30s Round',
      screens: 'LED & Mobile',
      image: '/assets/games/catch-brand/themes/carnival/background.png',
      badge: 'POPULAR',
      badgeColor: 'bg-amber-100 text-amber-800 border-amber-200',
      icon: Gamepad2,
      isLive: true,
      slug: '/game-showcase/catch-the-brand',
      itemOverlay: '/assets/games/catch-brand/themes/carnival/item_bonus_01.png',
      catcherOverlay: '/assets/games/catch-brand/themes/carnival/basket.png',
    },
    {
      id: 'memory-match',
      name: t('landing.memoryMatchName'),
      type: 'Card Flip Pair Puzzle',
      desc: t('landing.memoryMatchDesc'),
      duration: '45s Round',
      screens: 'Touch & iPads',
      image: '/assets/games/memory-match/themes/default/background.png',
      badge: 'HIGH ENGAGEMENT',
      badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      icon: Grid3X3,
      isLive: true,
      slug: '/game-showcase/memory-match',
      itemOverlay: '/assets/games/memory-match/themes/default/pair01.png',
      catcherOverlay: '/assets/games/memory-match/themes/default/cardback.png',
    },
    {
      id: 'reaction-tap',
      name: t('landing.reactionTapName'),
      type: 'Motorsport Millisecond Reflex',
      desc: t('landing.reactionTapDesc'),
      duration: '15s Round',
      screens: 'Stage & Kiosks',
      image: '/assets/games/reaction-tap/themes/default/background.png',
      badge: 'FASTEST QUEUE',
      badgeColor: 'bg-rose-100 text-rose-800 border-rose-200',
      icon: Zap,
      isLive: true,
      slug: '/game-showcase/reaction-challenge',
      itemOverlay: null,
      catcherOverlay: null,
    },
    {
      id: 'speed-quiz',
      name: t('landing.speedQuizName'),
      type: 'Live Audience Trivia Challenge',
      desc: t('landing.speedQuizDesc'),
      duration: '60s Round',
      screens: 'Simultaneous Crowd QR',
      image: null,
      badge: 'ROADMAP',
      badgeColor: 'bg-blue-100 text-blue-800 border-blue-200',
      icon: HelpCircle,
      isLive: false,
      slug: '/game-showcase',
      itemOverlay: null,
      catcherOverlay: null,
    },
  ];

  return (
    <section id="games" className="w-full py-16 sm:py-24 bg-slate-50 border-y border-slate-200/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-100/80 border border-amber-200 text-amber-900 text-xs font-bold uppercase tracking-wider">
              <Gamepad2 className="w-3.5 h-3.5" />
              <span>{t('landing.gameShowcaseBadge')}</span>
            </div>
            <h2 className="text-2xl sm:text-4xl font-black tracking-tight text-slate-900">
              {t('landing.gameShowcaseTitle')}
            </h2>
            <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
              {t('landing.gameShowcaseSubtitle')}
            </p>
          </div>

          <div className="shrink-0">
            <InternalLink
              to="/game-showcase"
              className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-slate-900 hover:text-amber-600 transition-colors"
            >
              <span>{t('landing.viewFullCatalog')}</span>
              <ArrowRight className="w-4 h-4" />
            </InternalLink>
          </div>
        </div>

        {/* 4 Games Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {games.map((game) => {
            const IconComp = game.icon;
            return (
              <div
                key={game.id}
                className="flex flex-col rounded-2xl bg-white border border-slate-200/90 shadow-xs hover:shadow-md transition-all duration-200 overflow-hidden group"
              >
                {/* Visual Header / Thumbnail */}
                <div className="relative aspect-16/10 w-full bg-slate-900 overflow-hidden flex items-center justify-center">
                  {game.image ? (
                    <img
                      src={game.image}
                      alt={game.name}
                      className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 opacity-80"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center">
                      <HelpCircle className="w-12 h-12 text-blue-400/40" />
                    </div>
                  )}

                  {/* Top Badge */}
                  <div className="absolute top-3 left-3 z-10">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wider border shadow-xs ${game.badgeColor}`}>
                      {game.badge}
                    </span>
                  </div>

                  {/* Floating Action Button on Hover */}
                  {game.isLive ? (
                    <button
                      onClick={() => onTryDemo(game.id)}
                      className="relative z-10 px-4 py-2 rounded-xl bg-white/95 hover:bg-white text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-lg backdrop-blur-xs transition-transform transform group-hover:scale-105 cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5 fill-amber-500 text-amber-500 ml-0.5" />
                      <span>{t('landing.playDemo')}</span>
                    </button>
                  ) : (
                    <div className="relative z-10 px-3.5 py-1.5 rounded-xl bg-slate-950/80 border border-slate-700 text-slate-300 font-semibold text-xs backdrop-blur-xs">
                      {t('landing.comingSoon')}
                    </div>
                  )}
                </div>

                {/* Content Body */}
                <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold">
                      <IconComp className="w-3.5 h-3.5 text-amber-600" />
                      <span>{game.type}</span>
                    </div>

                    <h3 className="text-lg font-bold text-slate-900 group-hover:text-amber-600 transition-colors">
                      {game.name}
                    </h3>

                    <p className="text-xs text-slate-600 leading-relaxed line-clamp-3">
                      {game.desc}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] font-semibold text-slate-500">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-400" />
                      <span>{game.duration}</span>
                    </div>

                    <div className="flex items-center gap-1">
                      <Tv className="w-3 h-3 text-slate-400" />
                      <span>{game.screens}</span>
                    </div>
                  </div>

                  {/* Dynamic Backend Starting Price */}
                  {game.isLive && (
                    <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between">
                      {(() => {
                        const backendGame = publicGames.find(
                          (pg) =>
                            pg.id === game.id ||
                            pg.slug === game.id ||
                            pg.game_type === game.id ||
                            (pg.slug && game.id && (pg.slug.includes(game.id) || game.id.includes(pg.slug)))
                        );
                        const startingPrice = backendGame ? getGameStartingPrice(backendGame) : null;

                        if (loadingPricing) {
                          return (
                            <div className="h-4 w-28 bg-slate-100 animate-pulse rounded" />
                          );
                        }

                        if (startingPrice) {
                          return (
                            <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                              <Tag className="w-3.5 h-3.5 text-amber-500" />
                              <span>
                                {t('landing.pricingStartingFrom', {
                                  price: formatPublicPrice(startingPrice.price, startingPrice.currency),
                                })}
                              </span>
                            </span>
                          );
                        }

                        if (pricingError) {
                          return (
                            <span className="text-[11px] font-medium text-slate-400">
                              {t('landing.pricingContactForQuote')}
                            </span>
                          );
                        }

                        return (
                          <span className="text-[11px] font-medium text-slate-500">
                            {t('landing.pricingCustomPricing', undefined, 'Custom Pricing')}
                          </span>
                        );
                      })()}
                    </div>
                  )}
                </div>

                {/* Bottom Card Action */}
                <div className="px-5 pb-5 pt-0">
                  {game.isLive ? (
                    <button
                      onClick={() => onTryDemo(game.id)}
                      className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Play className="w-3 h-3 fill-amber-400 text-amber-400" />
                      <span>{t('landing.playDemo')}</span>
                    </button>
                  ) : (
                    <InternalLink
                      to="/contact"
                      className="w-full py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <span>{t('landing.preOrderEnquire')}</span>
                    </InternalLink>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
