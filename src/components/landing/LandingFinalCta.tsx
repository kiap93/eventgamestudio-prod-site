import React from 'react';
import {
  ArrowRight,
  MessageSquare,
  Sparkles,
  CheckCircle2,
  Send,
} from 'lucide-react';
import { useLocalization } from '../../context/LocalizationContext';
import { useAuth } from '../../context/AuthContext';
import { navigateTo } from '../../hooks/useRouteContext';
import { usePlatformContactSettings } from '../../hooks/usePlatformContactSettings';

export const LandingFinalCta: React.FC = () => {
  const { t } = useLocalization();
  const { isAuthenticated } = useAuth();
  const { settings } = usePlatformContactSettings();

  const handleCreateEvent = () => {
    if (isAuthenticated) {
      navigateTo('/events');
    } else {
      navigateTo('/login?redirect=/events');
    }
  };

  const handleContactSales = () => {
    if (settings?.whatsapp_number) {
      const cleanNum = settings.whatsapp_number.replace(/\D/g, '');
      const text = encodeURIComponent(
        settings.whatsapp_prefill_message || 'Hi Event Game Studio, I would like to enquire about interactive event games.'
      );
      window.open(`https://wa.me/${cleanNum}?text=${text}`, '_blank', 'noopener,noreferrer');
      return;
    }
    navigateTo('/contact');
  };

  return (
    <section className="w-full py-16 sm:py-24 bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative rounded-3xl bg-slate-900 border border-slate-800 p-8 sm:p-14 lg:p-16 text-center text-white overflow-hidden shadow-2xl">
          {/* Subtle Glows */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-48 bg-amber-500/10 blur-3xl pointer-events-none rounded-full" />

          <div className="relative max-w-3xl mx-auto space-y-6 sm:space-y-8">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-xs font-bold text-amber-400 uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5" />
              <span>{t('landing.transformActivationBadge')}</span>
            </div>

            <h2 className="text-2xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white leading-tight">
              {t('landing.finalCtaHeadline')}
            </h2>

            <p className="text-sm sm:text-base md:text-lg text-slate-300 max-w-2xl mx-auto leading-relaxed">
              {t('landing.finalCtaSubtitle')}
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 pt-2">
              <button
                onClick={handleCreateEvent}
                className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm sm:text-base flex items-center justify-center gap-2 shadow-lg transition-transform transform hover:-translate-y-0.5 cursor-pointer"
              >
                <span>{t('landing.finalCtaPrimary')}</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                onClick={handleContactSales}
                className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm sm:text-base flex items-center justify-center gap-2 border border-slate-700 transition-colors cursor-pointer"
              >
                <MessageSquare className="w-4 h-4 text-amber-400" />
                <span>{t('landing.finalCtaSecondary')}</span>
              </button>
            </div>

            {/* 3 Trust Points */}
            <div className="pt-6 border-t border-slate-800/80 flex flex-wrap items-center justify-center gap-4 sm:gap-8 text-xs text-slate-400 font-medium">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>{t('landing.finalCtaTrust1')}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>{t('landing.finalCtaTrust2')}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>{t('landing.finalCtaTrust3')}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
