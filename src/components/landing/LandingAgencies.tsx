import React from 'react';
import { motion } from 'motion/react';
import {
  Palette,
  Zap,
  CalendarDays,
  Repeat,
  Sparkles,
  BarChart3,
  Building2,
  CheckCircle2,
} from 'lucide-react';
import { useLocalization } from '../../context/LocalizationContext';

export const LandingAgencies: React.FC = () => {
  const { t } = useLocalization();

  const benefits = [
    {
      title: t('landing.agencyBenefit1Title'),
      description: t('landing.agencyBenefit1Desc'),
      icon: Palette,
      iconBg: 'bg-amber-50',
      iconColor: 'text-amber-600',
      borderColor: 'border-amber-200',
    },
    {
      title: t('landing.agencyBenefit2Title'),
      description: t('landing.agencyBenefit2Desc'),
      icon: Zap,
      iconBg: 'bg-emerald-50',
      iconColor: 'text-emerald-600',
      borderColor: 'border-emerald-200',
    },
    {
      title: t('landing.agencyBenefit3Title'),
      description: t('landing.agencyBenefit3Desc'),
      icon: CalendarDays,
      iconBg: 'bg-blue-50',
      iconColor: 'text-blue-600',
      borderColor: 'border-blue-200',
    },
    {
      title: t('landing.agencyBenefit4Title'),
      description: t('landing.agencyBenefit4Desc'),
      icon: Repeat,
      iconBg: 'bg-purple-50',
      iconColor: 'text-purple-600',
      borderColor: 'border-purple-200',
    },
    {
      title: t('landing.agencyBenefit5Title'),
      description: t('landing.agencyBenefit5Desc'),
      icon: Sparkles,
      iconBg: 'bg-amber-50',
      iconColor: 'text-amber-600',
      borderColor: 'border-amber-200',
    },
    {
      title: t('landing.agencyBenefit6Title'),
      description: t('landing.agencyBenefit6Desc'),
      icon: BarChart3,
      iconBg: 'bg-cyan-50',
      iconColor: 'text-cyan-600',
      borderColor: 'border-cyan-200',
    },
  ];

  return (
    <section id="agencies" className="relative scroll-mt-16 sm:scroll-mt-20 py-20 md:py-32 bg-slate-50 border-t border-b border-slate-200/80 overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-gradient-to-b from-amber-500/5 via-emerald-500/5 to-transparent blur-3xl pointer-events-none rounded-full" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4 mb-16 md:mb-20">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-white border border-slate-200 text-xs font-bold text-amber-800 uppercase tracking-widest shadow-xs">
            <Building2 className="w-3.5 h-3.5 text-amber-600" />
            <span>{t('landing.agencyReadyBadge')}</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-black text-slate-900 tracking-tight">
            {t('landing.builtForAgenciesTitle')}
          </h2>
          <p className="text-base sm:text-lg text-slate-600 leading-relaxed">
            {t('landing.builtForAgenciesDesc')}
          </p>
        </div>

        {/* 6 Benefits Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
          {benefits.map((b, idx) => {
            const Icon = b.icon;
            return (
              <motion.div
                key={b.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: idx * 0.08 }}
                className="group relative rounded-3xl bg-white border border-slate-200 p-8 flex flex-col justify-between space-y-6 hover:border-amber-400 transition-all hover:-translate-y-1 shadow-xs hover:shadow-xl"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className={`p-3.5 rounded-2xl ${b.iconBg} border ${b.borderColor} ${b.iconColor} shadow-xs`}>
                      <Icon className="w-6 h-6" />
                    </div>
                    <span className="text-[11px] font-mono font-bold text-slate-400 group-hover:text-slate-600">
                      0{idx + 1}
                    </span>
                  </div>

                  <h3 className="text-xl font-bold text-slate-900 group-hover:text-amber-700 transition-colors tracking-tight">
                    {b.title}
                  </h3>

                  <p className="text-sm text-slate-600 leading-relaxed font-normal">
                    {b.description}
                  </p>
                </div>

                <div className="pt-4 border-t border-slate-100 flex items-center gap-2 text-xs text-slate-600 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>{t('landing.productionTested')}</span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
