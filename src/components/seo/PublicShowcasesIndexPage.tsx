import React, { useState, useEffect } from 'react';
import { LandingHeader } from '../landing/LandingHeader';
import { LandingFooter } from '../landing/LandingFooter';
import { SEO } from '../common/SEO';
import { getPageSeo } from '../../lib/seo';
import { InternalLink } from '../common/InternalLink';
import { navigateTo } from '../../hooks/useRouteContext';
import { useAuth } from '../../context/AuthContext';
import { useLocalization } from '../../context/LocalizationContext';
import { apiFetch } from '../../lib/api';
import { EventShowcase } from '../../types/showcase';
import {
  Sparkles,
  Trophy,
  ArrowRight,
  ChevronRight,
  Calendar,
  Building2,
  Gamepad2,
  Layers,
  Search,
  ExternalLink,
  Eye,
  CheckCircle2,
} from 'lucide-react';

export const PublicShowcasesIndexPage: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const { t } = useLocalization();
  const pageSeo = getPageSeo('/showcase');

  const [showcases, setShowcases] = useState<EventShowcase[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedFilter, setSelectedFilter] = useState<string>('ALL');

  useEffect(() => {
    let isMounted = true;
    async function loadShowcases() {
      setLoading(true);
      try {
        const res = await apiFetch('/api/showcases');
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            // Strictly filter out any unapproved or non-published records
            const publishedOnly = (Array.isArray(data.showcases) ? data.showcases : []).filter(
              (s: any) =>
                (s.status === 'PUBLISHED' || s.publication_status === 'PUBLISHED') &&
                s.status !== 'BLOCKED' &&
                !s.deleted_at
            );
            setShowcases(publishedOnly);
            setLoading(false);
            return;
          }
        }
      } catch (err) {
        console.warn('Could not load public showcases from API:', err);
      }

      if (isMounted) {
        setShowcases([]);
        setLoading(false);
      }
    }

    loadShowcases();
    return () => {
      isMounted = false;
    };
  }, []);

  const filteredShowcases = showcases.filter((s) => {
    if (selectedFilter === 'ALL') return true;
    return (s as any).game_type === selectedFilter || (s as any).game_id === selectedFilter;
  });

  return (
    <div className="min-h-screen bg-white text-slate-900 flex flex-col font-sans selection:bg-amber-100 selection:text-amber-900">
      <SEO config={pageSeo} />

      <LandingHeader onExploreGames={() => navigateTo('/game-showcase')} />

      <main className="flex-1">
        {/* Breadcrumb Navigation */}
        <div className="w-full bg-slate-50 border-b border-slate-200/80 py-2.5">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <nav className="flex items-center gap-2 text-xs text-slate-500 font-medium">
              <InternalLink href="/" className="hover:text-amber-600 transition-colors">
                {t('nav.home')}
              </InternalLink>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-900 font-semibold">{t('nav.showcases')}</span>
            </nav>
          </div>
        </div>

        {/* Hero */}
        <section className="pt-12 pb-14 md:pt-16 md:pb-20 bg-gradient-to-b from-amber-500/5 via-white to-white border-b border-slate-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-4">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-800 text-xs font-bold uppercase tracking-wider">
              <Trophy className="w-3.5 h-3.5 text-amber-600" />
              <span>{t('publicShowcase.realWorldActivations')}</span>
            </div>
            <h1 className="text-3xl sm:text-5xl md:text-6xl font-black text-slate-900 tracking-tight">
              {t('publicShowcase.eventGameShowcases')}
            </h1>
            <p className="text-base sm:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
              {t('publicShowcase.showcasesSubtitle')}
            </p>
          </div>
        </section>

        {/* Showcases Directory */}
        <section className="py-12 md:py-16 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
            {/* Filter Tabs */}
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
              <div className="flex items-center gap-2 text-xs font-bold">
                <span className="text-slate-400 uppercase tracking-wider text-[11px] mr-1">{t('publicShowcase.filterLabel')}</span>
                <button
                  onClick={() => setSelectedFilter('ALL')}
                  className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                    selectedFilter === 'ALL'
                      ? 'bg-amber-500 text-slate-950 shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {t('publicShowcase.allFormats')}
                </button>
                <button
                  onClick={() => setSelectedFilter('catch-brand')}
                  className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                    selectedFilter === 'catch-brand'
                      ? 'bg-amber-500 text-slate-950 shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {t('publicShowcase.catchTheBrand')}
                </button>
                <button
                  onClick={() => setSelectedFilter('memory-match')}
                  className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                    selectedFilter === 'memory-match'
                      ? 'bg-amber-500 text-slate-950 shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {t('publicShowcase.memoryMatch')}
                </button>
                <button
                  onClick={() => setSelectedFilter('reaction-tap')}
                  className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                    selectedFilter === 'reaction-tap'
                      ? 'bg-amber-500 text-slate-950 shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {t('publicShowcase.reactionLights')}
                </button>
              </div>

              <div className="text-xs text-slate-500">
                {t('publicShowcase.showingPublishedActivations', { count: filteredShowcases.length })}
              </div>
            </div>

            {/* Loading state */}
            {loading && (
              <div className="py-20 flex flex-col items-center justify-center space-y-3">
                <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-xs text-slate-500">{t('common.loading')}</p>
              </div>
            )}

            {/* Empty state / Fallback presentation */}
            {!loading && filteredShowcases.length === 0 && (
              <div className="py-16 px-6 rounded-3xl bg-slate-50 border border-slate-200 text-center max-w-xl mx-auto space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center mx-auto">
                  <Gamepad2 className="w-7 h-7" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">{t('publicShowcase.liveActivationsInProgress')}</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {t('publicShowcase.liveActivationsDesc')}
                </p>
                <div className="pt-2">
                  <button
                    onClick={() => navigateTo(isAuthenticated ? '/events' : '/login')}
                    className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-colors cursor-pointer"
                  >
                    {isAuthenticated ? t('publicShowcase.openOrganizerStudio') : t('publicShowcase.signInToPublishShowcase')}
                  </button>
                </div>
              </div>
            )}

            {/* Showcase Cards Grid */}
            {!loading && filteredShowcases.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredShowcases.map((sc) => {
                  const targetId = sc.id || sc.event_id;
                  const coverImage = sc.cover_image_url || '/og-image.jpg';

                  return (
                    <article
                      key={targetId}
                      className="rounded-3xl border border-slate-200 bg-white overflow-hidden shadow-xs hover:border-amber-400 hover:shadow-xl hover:shadow-slate-900/5 transition-all flex flex-col justify-between group"
                    >
                      <div>
                        {/* Cover Media */}
                        <div className="relative aspect-video w-full bg-slate-950 overflow-hidden">
                          <img
                            src={coverImage}
                            alt={sc.title || 'Event Game Showcase'}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            loading="lazy"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent pointer-events-none" />
                          {sc.client_name && (
                            <span className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur-md text-[10px] font-bold text-white border border-white/20">
                              {sc.client_name}
                            </span>
                          )}
                          <span className="absolute bottom-3 left-3 text-[11px] font-bold text-white flex items-center gap-1.5 drop-shadow-md">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            <span>{t('publicShowcase.verifiedEvent')}</span>
                          </span>
                        </div>

                        {/* Body Content */}
                        <div className="p-6 space-y-3">
                          <h2 className="text-lg font-black text-slate-900 group-hover:text-amber-800 transition-colors line-clamp-1">
                            {sc.title}
                          </h2>
                          <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                            {sc.description || 'Interactive event mini-game activation with real-time live stage leaderboard.'}
                          </p>
                        </div>
                      </div>

                      {/* Footer Link */}
                      <div className="p-6 pt-0 border-t border-slate-100 flex items-center justify-between text-xs">
                        <span className="text-[11px] text-slate-400 font-medium">
                          {sc.published_at ? new Date(sc.published_at).toLocaleDateString() : t('publicShowcase.activeEvent')}
                        </span>
                        <InternalLink
                          href={`/showcase/${targetId}`}
                          className="font-bold text-amber-700 hover:text-amber-800 flex items-center gap-1 group-hover:translate-x-0.5 transition-all"
                        >
                          <span>{t('publicShowcase.viewShowcase')}</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </InternalLink>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Reward Info Callout */}
        <section className="py-12 bg-slate-50 border-t border-slate-200">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-3">
            <h2 className="text-lg sm:text-xl font-bold text-slate-900">
              {t('publicShowcase.hostYourOwn')}
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 max-w-xl mx-auto">
              {t('publicShowcase.hostYourOwnDesc')}
            </p>
            <div className="pt-2">
              <button
                onClick={() => navigateTo(isAuthenticated ? '/events' : '/login')}
                className="px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition-colors cursor-pointer shadow-xs"
              >
                {t('publicShowcase.createEventActivation')}
              </button>
            </div>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
};
