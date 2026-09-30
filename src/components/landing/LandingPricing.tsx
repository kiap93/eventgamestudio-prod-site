import React, { useState, useEffect } from 'react';
import {
  Tag,
  CheckCircle2,
  ArrowRight,
  Calculator,
  AlertCircle,
  RefreshCw,
  Gamepad2,
  ShoppingBasket,
  Grid3X3,
  Zap,
} from 'lucide-react';
import { useLocalization } from '../../context/LocalizationContext';
import { useAuth } from '../../context/AuthContext';
import { navigateTo } from '../../hooks/useRouteContext';
import {
  fetchPublicGamesPricing,
  matchGamePricingTier,
  formatPublicPrice,
  PublicGameWithPricing,
} from '../../lib/publicPricing';

export const LandingPricing: React.FC = () => {
  const { t } = useLocalization();
  const { isAuthenticated } = useAuth();

  const [games, setGames] = useState<PublicGameWithPricing[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<string>('');
  const [selectedDays, setSelectedDays] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadPricing = async (forceRefresh = false) => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchPublicGamesPricing(forceRefresh);
      setGames(data);
      if (data.length > 0 && (!selectedGameId || !data.some((g) => g.id === selectedGameId))) {
        setSelectedGameId(data[0].id);
      }
    } catch (err: any) {
      console.error('Failed to load public game pricing:', err);
      setError(err?.message || 'Failed to load pricing');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPricing();
  }, []);

  const selectedGame = games.find((g) => g.id === selectedGameId) || games[0] || null;
  const selectedGameTiers = selectedGame?.tiers || [];

  // Authoritative duration matching:
  // selectedDays >= min_days AND (max_days IS NULL OR selectedDays <= max_days)
  const matchedTier = matchGamePricingTier(selectedGameTiers, selectedDays);
  const isCustomQuote = !matchedTier || matchedTier.price <= 0 || (selectedDays >= 31 && (!matchedTier || matchedTier.max_days === null && matchedTier.min_days > 90));

  const handleActionClick = () => {
    if (isCustomQuote) {
      navigateTo('/contact');
    } else if (isAuthenticated) {
      navigateTo('/events');
    } else {
      navigateTo('/login?redirect=/events');
    }
  };

  const getGameIcon = (slugOrType: string) => {
    const norm = String(slugOrType || '').toLowerCase();
    if (norm.includes('catch')) return ShoppingBasket;
    if (norm.includes('memory')) return Grid3X3;
    if (norm.includes('reaction')) return Zap;
    return Gamepad2;
  };

  const getGameDisplayName = (game: PublicGameWithPricing) => {
    const norm = String(game.game_type || game.slug || '').toLowerCase();
    if (norm.includes('catch')) return t('landing.catchBrandName') || game.name;
    if (norm.includes('memory')) return t('landing.memoryMatchName') || game.name;
    if (norm.includes('reaction')) return t('landing.reactionTapName') || game.name;
    return game.name;
  };

  const includedFeatures = [
    t('landing.pricingFeature1'),
    t('landing.pricingFeature2'),
    t('landing.pricingFeature3'),
    t('landing.pricingFeature4'),
    t('landing.pricingFeature5'),
    t('landing.pricingFeature6'),
  ];

  const durationOptions = [
    { label: t('landing.pricingTier1Day'), days: 1 },
    { label: t('landing.pricingTier2Days'), days: 2 },
    { label: t('landing.pricingTier3Days'), days: 3 },
    { label: t('landing.pricingTier4to7Days'), days: 7 },
    { label: t('landing.pricingTier8to14Days'), days: 14 },
    { label: t('landing.pricingTier15to30Days'), days: 30 },
    { label: t('landing.pricingTier31Plus'), days: 31 },
  ];

  return (
    <section id="pricing" className="scroll-mt-16 sm:scroll-mt-20 w-full py-16 sm:py-24 bg-white border-b border-slate-200/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12 sm:space-y-16">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold uppercase tracking-wider">
            <Tag className="w-3.5 h-3.5" />
            <span>{t('landing.pricingBadge')}</span>
          </div>
          <h2 className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight">
            {t('landing.pricingTitle')}
          </h2>
          <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
            {t('landing.pricingSubtitle')}
          </p>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="max-w-4xl mx-auto rounded-3xl bg-slate-50 border border-slate-200/90 p-12 text-center space-y-4">
            <div className="inline-block animate-spin text-amber-500">
              <RefreshCw className="w-8 h-8" />
            </div>
            <p className="text-sm font-semibold text-slate-600">
              {t('landing.pricingLoading')}
            </p>
          </div>
        )}

        {/* Error State */}
        {!loading && error && (
          <div className="max-w-2xl mx-auto rounded-2xl bg-rose-50 border border-rose-200 p-6 text-center space-y-4">
            <div className="flex items-center justify-center gap-2 text-rose-600 font-bold text-sm">
              <AlertCircle className="w-5 h-5" />
              <span>{t('landing.pricingLoadError')}</span>
            </div>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => loadPricing(true)}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{t('landing.pricingRetry')}</span>
              </button>
              <button
                onClick={() => navigateTo('/contact')}
                className="px-4 py-2 rounded-xl bg-white border border-slate-300 text-slate-800 text-xs font-bold hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <span>{t('landing.pricingContactForQuote')}</span>
              </button>
            </div>
          </div>
        )}

        {/* Interactive Duration Calculator Card */}
        {!loading && !error && selectedGame && (
          <div className="max-w-4xl mx-auto rounded-3xl bg-slate-50 border border-slate-200/90 p-6 sm:p-10 shadow-sm space-y-8">
            {/* A. Game Selector Bar */}
            <div className="space-y-3 pb-6 border-b border-slate-200">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  {t('landing.pricingGameSelectLabel')}
                </label>
                <span className="text-xs font-semibold text-slate-400">
                  {games.length} {games.length === 1 ? 'Game' : 'Games'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {games.map((g) => {
                  const Icon = getGameIcon(g.game_type || g.slug);
                  const isSelected = g.id === selectedGame.id;
                  return (
                    <button
                      key={g.id}
                      onClick={() => setSelectedGameId(g.id)}
                      className={`px-4 py-3 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-2.5 transition-all text-left cursor-pointer border ${
                        isSelected
                          ? 'bg-slate-900 text-white border-slate-900 shadow-sm ring-2 ring-amber-500/50'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-100/70'
                      }`}
                    >
                      <Icon className={`w-4 h-4 shrink-0 ${isSelected ? 'text-amber-400' : 'text-slate-500'}`} />
                      <span className="truncate">{getGameDisplayName(g)}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* B. Duration Header & Quick Selector Pills */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-600 uppercase tracking-wider">
                  <Calculator className="w-4 h-4" />
                  <span>{t('landing.pricingCalculatorTitle')}</span>
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-slate-900">
                  {t('landing.pricingCalculatorSubtitle')}
                </h3>
              </div>

              {/* Quick Days Selector Pills */}
              <div className="flex flex-wrap items-center gap-1.5">
                {durationOptions.map((opt) => (
                  <button
                    key={opt.days}
                    onClick={() => setSelectedDays(opt.days)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                      selectedDays === opt.days ||
                      (opt.days === 7 && selectedDays >= 4 && selectedDays <= 7) ||
                      (opt.days === 14 && selectedDays >= 8 && selectedDays <= 14) ||
                      (opt.days === 30 && selectedDays >= 15 && selectedDays <= 30) ||
                      (opt.days === 31 && selectedDays >= 31)
                        ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Slider & Dynamic Result Display */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
              {/* Slider Column */}
              <div className="md:col-span-7 space-y-6">
                <div className="flex items-center justify-between">
                  <label htmlFor="duration-slider" className="text-sm font-bold text-slate-800">
                    {t('landing.pricingDaysLabel')}
                  </label>
                  <div className="flex items-baseline gap-1">
                    <span className="font-mono text-3xl font-black text-slate-900">
                      {selectedDays >= 31 ? '31+' : selectedDays}
                    </span>
                    <span className="text-xs font-semibold text-slate-500">
                      {selectedDays === 1 ? t('landing.pricingDayUnit') : t('landing.pricingDaysUnit')}
                    </span>
                  </div>
                </div>

                <input
                  id="duration-slider"
                  type="range"
                  min="1"
                  max="31"
                  step="1"
                  value={selectedDays}
                  onChange={(e) => setSelectedDays(Number(e.target.value))}
                  className="w-full h-2.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-amber-500"
                />

                <div className="flex justify-between text-[11px] font-semibold text-slate-400">
                  <span>1 Day</span>
                  <span>7 Days</span>
                  <span>14 Days</span>
                  <span>30 Days</span>
                  <span>31+ Days</span>
                </div>

                <p className="text-xs text-slate-500 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>{t('landing.pricingSetupDayIncluded')}</span>
                </p>
              </div>

              {/* Calculated Quote Column */}
              <div className="md:col-span-5 p-6 rounded-2xl bg-white border border-slate-200 shadow-sm text-center space-y-4">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  {t('landing.pricingAuthoritativeFee')}
                </div>

                {isCustomQuote ? (
                  <div className="space-y-2">
                    <div className="text-2xl sm:text-3xl font-black text-slate-900">
                      {t('landing.pricingCustomQuote')}
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      {t('landing.pricingCustomQuoteDesc')}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="text-3xl sm:text-4xl font-black text-slate-900">
                      {matchedTier ? formatPublicPrice(matchedTier.price, matchedTier.currency) : '—'}
                    </div>
                    <div className="text-xs font-semibold text-slate-500">
                      {t('landing.pricingPerEvent')}
                    </div>
                  </div>
                )}

                <button
                  onClick={handleActionClick}
                  className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
                >
                  <span>{isCustomQuote ? t('landing.pricingCustomQuoteCta') : t('landing.pricingChoosePlan')}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Dynamic Tier Cards Grid */}
        {!loading && !error && selectedGame && (
          <div className="space-y-4">
            <div className="text-center">
              <h3 className="text-lg sm:text-xl font-bold text-slate-900">
                {t('landing.pricingTiersTitle')}
              </h3>
              <p className="text-xs sm:text-sm text-slate-500">
                {t('landing.pricingTiersDesc')} ({getGameDisplayName(selectedGame)})
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 sm:gap-4">
              {durationOptions.map((opt) => {
                const tier = matchGamePricingTier(selectedGameTiers, opt.days);
                const isCustom = opt.days >= 31 && (!tier || tier.max_days === null && tier.min_days > 90) || !tier || tier.price <= 0;
                const isHighlighted = opt.days === 7;

                return (
                  <div
                    key={opt.days}
                    className={`p-4 rounded-xl border flex flex-col justify-between text-center space-y-2 transition-all ${
                      isHighlighted
                        ? 'bg-amber-50/80 border-amber-200/80 shadow-xs'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className={`text-xs font-bold ${isHighlighted ? 'text-amber-900' : 'text-slate-600'}`}>
                      {opt.label}
                    </div>
                    <div className="font-mono text-base sm:text-lg font-black text-slate-900">
                      {isCustom ? (
                        <span className="text-xs sm:text-sm font-bold text-slate-700">
                          {t('landing.pricingCustomQuote')}
                        </span>
                      ) : (
                        formatPublicPrice(tier.price, tier.currency)
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Included Features Row */}
        <div className="pt-4 border-t border-slate-100 max-w-4xl mx-auto">
          <div className="text-center text-xs font-bold uppercase tracking-wider text-slate-400 mb-6">
            {t('landing.includedWithEveryLicense')}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
            {includedFeatures.map((feat, idx) => (
              <div key={idx} className="flex items-center gap-2 text-xs font-medium text-slate-700">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>{feat}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
