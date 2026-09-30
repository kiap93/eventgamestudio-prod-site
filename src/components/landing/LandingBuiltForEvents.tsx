import React from 'react';
import {
  Code2,
  Palette,
  Tv,
  Zap,
  ShieldCheck,
  Headphones,
  Sparkles,
} from 'lucide-react';
import { useLocalization } from '../../context/LocalizationContext';

export const LandingBuiltForEvents: React.FC = () => {
  const { t } = useLocalization();

  const benefits = [
    {
      title: t('landing.benefitZeroCodingTitle'),
      desc: t('landing.benefitZeroCodingDesc'),
      icon: Code2,
      accent: 'bg-amber-100 text-amber-800',
    },
    {
      title: t('landing.benefitBrandCustomTitle'),
      desc: t('landing.benefitBrandCustomDesc'),
      icon: Palette,
      accent: 'bg-emerald-100 text-emerald-800',
    },
    {
      title: t('landing.benefitQrBigScreenTitle'),
      desc: t('landing.benefitQrBigScreenDesc'),
      icon: Tv,
      accent: 'bg-blue-100 text-blue-800',
    },
    {
      title: t('landing.benefitFastSetupTitle'),
      desc: t('landing.benefitFastSetupDesc'),
      icon: Zap,
      accent: 'bg-purple-100 text-purple-800',
    },
    {
      title: t('landing.benefitWhiteLabelTitle'),
      desc: t('landing.benefitWhiteLabelDesc'),
      icon: ShieldCheck,
      accent: 'bg-rose-100 text-rose-800',
    },
    {
      title: t('landing.benefitSupportTitle'),
      desc: t('landing.benefitSupportDesc'),
      icon: Headphones,
      accent: 'bg-cyan-100 text-cyan-800',
    },
  ];

  return (
    <section className="w-full py-16 sm:py-24 bg-slate-50 border-b border-slate-200/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12 sm:space-y-16">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-200/80 border border-slate-300 text-slate-800 text-xs font-bold uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>{t('landing.builtForEventsBadge')}</span>
          </div>
          <h2 className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight">
            {t('landing.builtForEventsTitle')}
          </h2>
          <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
            {t('landing.builtForEventsSubtitle')}
          </p>
        </div>

        {/* 6 Benefits Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
          {benefits.map((benefit, idx) => {
            const IconComp = benefit.icon;
            return (
              <div
                key={idx}
                className="p-6 sm:p-7 rounded-2xl bg-white border border-slate-200/90 shadow-xs hover:shadow-md transition-all duration-200 space-y-4 group"
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold shadow-xs ${benefit.accent} group-hover:scale-105 transition-transform`}>
                  <IconComp className="w-6 h-6" />
                </div>

                <div className="space-y-1.5">
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 group-hover:text-amber-600 transition-colors">
                    {benefit.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                    {benefit.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
