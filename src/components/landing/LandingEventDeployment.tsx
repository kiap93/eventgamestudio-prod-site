import React from 'react';
import {
  Tv,
  Smartphone,
  Touchpad,
  QrCode,
  CheckCircle2,
  Monitor,
  Flame,
  Zap,
} from 'lucide-react';
import { useLocalization } from '../../context/LocalizationContext';

export const LandingEventDeployment: React.FC = () => {
  const { t } = useLocalization();

  const deployments = [
    {
      id: 'mainstage',
      title: t('landing.deploymentLedTitle'),
      subtitle: t('landing.deploymentLedSubtitle'),
      desc: t('landing.deploymentLedDesc'),
      icon: Tv,
      points: [
        t('landing.deploymentLedPoint1'),
        t('landing.deploymentLedPoint2'),
        t('landing.deploymentLedPoint3'),
      ],
      tag: '16:9 4K FULLSCREEN',
      accent: 'border-amber-500/30 text-amber-500 bg-amber-500/10',
    },
    {
      id: 'kiosk',
      title: t('landing.deploymentKioskTitle'),
      subtitle: t('landing.deploymentKioskSubtitle'),
      desc: t('landing.deploymentKioskDesc'),
      icon: Monitor,
      points: [
        t('landing.deploymentKioskPoint1'),
        t('landing.deploymentKioskPoint2'),
        t('landing.deploymentKioskPoint3'),
      ],
      tag: 'AUTO-RESET TOTEM',
      accent: 'border-emerald-500/30 text-emerald-500 bg-emerald-500/10',
    },
    {
      id: 'mobile-qr',
      title: t('landing.deploymentQrTitle'),
      subtitle: t('landing.deploymentQrSubtitle'),
      desc: t('landing.deploymentQrDesc'),
      icon: Smartphone,
      points: [
        t('landing.deploymentQrPoint1'),
        t('landing.deploymentQrPoint2'),
        t('landing.deploymentQrPoint3'),
      ],
      tag: 'ZERO APP DOWNLOAD',
      accent: 'border-blue-500/30 text-blue-500 bg-blue-500/10',
    },
  ];

  return (
    <section className="w-full py-16 sm:py-24 bg-slate-900 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-xs font-bold text-amber-400 uppercase tracking-wider">
            <Tv className="w-3.5 h-3.5" />
            <span>{t('landing.deploymentBadge')}</span>
          </div>
          <h2 className="text-2xl sm:text-4xl font-black tracking-tight text-white">
            {t('landing.deploymentTitle')}
          </h2>
          <p className="text-sm sm:text-base text-slate-400 leading-relaxed">
            {t('landing.deploymentSubtitle')}
          </p>
        </div>

        {/* 3 Deployment Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
          {deployments.map((dep) => {
            const IconComp = dep.icon;
            return (
              <div
                key={dep.id}
                className="flex flex-col justify-between p-6 sm:p-8 rounded-2xl bg-slate-850 border border-slate-800 hover:border-slate-700 shadow-xl transition-all duration-200 group"
              >
                <div className="space-y-5">
                  <div className="flex items-center justify-between">
                    <div className="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-amber-400 group-hover:scale-105 transition-transform">
                      <IconComp className="w-6 h-6" />
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black tracking-wider border ${dep.accent}`}>
                      {dep.tag}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <h3 className="text-lg sm:text-xl font-bold text-white group-hover:text-amber-400 transition-colors">
                      {dep.title}
                    </h3>
                    <p className="text-xs font-semibold text-slate-400">
                      {dep.subtitle}
                    </p>
                  </div>

                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                    {dep.desc}
                  </p>

                  <div className="space-y-2 pt-2 border-t border-slate-800/80">
                    {dep.points.map((point, pIdx) => (
                      <div key={pIdx} className="flex items-start gap-2.5 text-xs text-slate-300">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <span>{point}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
