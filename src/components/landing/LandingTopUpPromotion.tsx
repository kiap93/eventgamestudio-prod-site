import React from 'react';
import {
  Coins,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  TrendingUp,
  ShieldCheck,
} from 'lucide-react';
import { useLocalization } from '../../context/LocalizationContext';
import { useAuth } from '../../context/AuthContext';
import { navigateTo } from '../../hooks/useRouteContext';

export const LandingTopUpPromotion: React.FC = () => {
  const { t } = useLocalization();
  const { isAuthenticated } = useAuth();

  const handleTopUpClick = () => {
    if (isAuthenticated) {
      navigateTo('/wallet/top-up');
    } else {
      navigateTo('/login?redirect=/wallet/top-up');
    }
  };

  return (
    <section className="w-full py-16 sm:py-24 bg-slate-900 text-white border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12 sm:space-y-16">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-xs font-bold text-amber-400 uppercase tracking-wider">
            <Coins className="w-3.5 h-3.5" />
            <span>{t('landing.topUpBadge')}</span>
          </div>
          <h2 className="text-2xl sm:text-4xl font-black tracking-tight text-white">
            {t('landing.topUpTitle')}
          </h2>
          <p className="text-sm sm:text-base text-slate-400 leading-relaxed">
            {t('landing.topUpSubtitle')}
          </p>
        </div>

        {/* Two Top-Up Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          {/* Card 1: RM6,000 Top-Up */}
          <div className="relative flex flex-col justify-between p-7 sm:p-9 rounded-3xl bg-slate-850 border border-slate-700/80 shadow-xl space-y-6 group hover:border-amber-500/50 transition-colors">
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <span className="px-3 py-1 rounded-full bg-slate-800 text-[11px] font-bold text-slate-300 border border-slate-700">
                  {t('landing.topUpTier1Rate')}
                </span>
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
                  <Coins className="w-4 h-4" />
                </div>
              </div>

              <div>
                <h3 className="text-2xl sm:text-3xl font-black text-white">
                  {t('landing.topUpTier1Title')}
                </h3>
                <div className="inline-block mt-2 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs sm:text-sm font-bold">
                  {t('landing.topUpTier1Bonus')}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  {t('landing.totalSpendingPower')}
                </div>
                <div className="text-xl sm:text-2xl font-black text-white font-mono mt-0.5">
                  {t('landing.topUpTier1Total')}
                </div>
              </div>

              <div className="space-y-2.5 pt-2">
                <div className="flex items-center gap-2.5 text-xs sm:text-sm text-slate-300">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{t('landing.topUpTier1Benefit1')}</span>
                </div>
                <div className="flex items-center gap-2.5 text-xs sm:text-sm text-slate-300">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{t('landing.topUpTier1Benefit2')}</span>
                </div>
                <div className="flex items-center gap-2.5 text-xs sm:text-sm text-slate-300">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{t('landing.topUpTier1Benefit3')}</span>
                </div>
              </div>
            </div>

            <button
              onClick={handleTopUpClick}
              className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer border border-slate-700"
            >
              <span>{t('landing.topUpCta')}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Card 2: RM10,000 Top-Up (Featured) */}
          <div className="relative flex flex-col justify-between p-7 sm:p-9 rounded-3xl bg-slate-850 border-2 border-amber-500 shadow-2xl space-y-6 group">
            {/* Top Recommended Tag */}
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-amber-500 text-slate-950 font-black text-[10px] sm:text-xs tracking-wider uppercase shadow-md">
              {t('landing.bestValueAgencies')}
            </div>

            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <span className="px-3 py-1 rounded-full bg-amber-500/20 text-[11px] font-bold text-amber-300 border border-amber-500/40">
                  {t('landing.topUpTier2Rate')}
                </span>
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4" />
                </div>
              </div>

              <div>
                <h3 className="text-2xl sm:text-3xl font-black text-white">
                  {t('landing.topUpTier2Title')}
                </h3>
                <div className="inline-block mt-2 px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs sm:text-sm font-bold">
                  {t('landing.topUpTier2Bonus')}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900 border border-amber-500/30">
                <div className="text-[11px] font-bold uppercase tracking-wider text-amber-400/80">
                  {t('landing.totalSpendingPower')}
                </div>
                <div className="text-xl sm:text-2xl font-black text-amber-300 font-mono mt-0.5">
                  {t('landing.topUpTier2Total')}
                </div>
              </div>

              <div className="space-y-2.5 pt-2">
                <div className="flex items-center gap-2.5 text-xs sm:text-sm text-slate-200">
                  <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>{t('landing.topUpTier2Benefit1')}</span>
                </div>
                <div className="flex items-center gap-2.5 text-xs sm:text-sm text-slate-200">
                  <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>{t('landing.topUpTier2Benefit2')}</span>
                </div>
                <div className="flex items-center gap-2.5 text-xs sm:text-sm text-slate-200">
                  <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>{t('landing.topUpTier2Benefit3')}</span>
                </div>
              </div>
            </div>

            <button
              onClick={handleTopUpClick}
              className="w-full py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-md"
            >
              <span>{t('landing.topUpCta')}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
