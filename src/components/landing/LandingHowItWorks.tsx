import React from 'react';
import {
  Gamepad2,
  Palette,
  CalendarDays,
  QrCode,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { useLocalization } from '../../context/LocalizationContext';

export const LandingHowItWorks: React.FC = () => {
  const { t } = useLocalization();

  const steps = [
    {
      number: '01',
      title: t('landing.howItWorksStep1Title'),
      description: t('landing.howItWorksStep1Desc'),
      icon: Gamepad2,
      iconBg: 'bg-amber-100 text-amber-800',
    },
    {
      number: '02',
      title: t('landing.howItWorksStep2Title'),
      description: t('landing.howItWorksStep2Desc'),
      icon: Palette,
      iconBg: 'bg-emerald-100 text-emerald-800',
    },
    {
      number: '03',
      title: t('landing.howItWorksStep3Title'),
      description: t('landing.howItWorksStep3Desc'),
      icon: CalendarDays,
      iconBg: 'bg-blue-100 text-blue-800',
    },
    {
      number: '04',
      title: t('landing.howItWorksStep4Title'),
      description: t('landing.howItWorksStep4Desc'),
      icon: QrCode,
      iconBg: 'bg-purple-100 text-purple-800',
    },
  ];

  return (
    <section id="how-it-works" className="relative scroll-mt-16 sm:scroll-mt-20 py-16 sm:py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12 sm:space-y-16">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700 uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>{t('landing.howItWorksBadge')}</span>
          </div>
          <h2 className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight">
            {t('landing.howItWorksTitle')}
          </h2>
          <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
            {t('landing.howItWorksSubtitle')}
          </p>
        </div>

        {/* 4 Steps Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((step, idx) => {
            const IconComp = step.icon;
            return (
              <div
                key={idx}
                className="relative flex flex-col justify-between p-6 sm:p-7 rounded-2xl bg-slate-50 border border-slate-200/90 shadow-xs hover:shadow-md transition-all duration-200 group"
              >
                <div className="space-y-4">
                  {/* Step Top Bar: Icon and Big Number */}
                  <div className="flex items-center justify-between">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold shadow-xs ${step.iconBg}`}>
                      <IconComp className="w-6 h-6" />
                    </div>
                    <span className="font-mono text-3xl font-black text-slate-300 group-hover:text-amber-500 transition-colors">
                      {step.number}
                    </span>
                  </div>

                  <h3 className="text-base sm:text-lg font-bold text-slate-900 leading-snug">
                    {step.title}
                  </h3>

                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                    {step.description}
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
