import React, { useState } from 'react';
import {
  HelpCircle,
  ChevronDown,
  Sparkles,
} from 'lucide-react';
import { useLocalization } from '../../context/LocalizationContext';

export const LandingFaq: React.FC = () => {
  const { t } = useLocalization();
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  const faqs = [
    { q: t('landing.faqQ1'), a: t('landing.faqA1') },
    { q: t('landing.faqQ2'), a: t('landing.faqA2') },
    { q: t('landing.faqQ3'), a: t('landing.faqA3') },
    { q: t('landing.faqQ4'), a: t('landing.faqA4') },
    { q: t('landing.faqQ5'), a: t('landing.faqA5') },
    { q: t('landing.faqQ6'), a: t('landing.faqA6') },
    { q: t('landing.faqQ7'), a: t('landing.faqA7') },
    { q: t('landing.faqQ8'), a: t('landing.faqA8') },
  ];

  const toggle = (idx: number) => {
    setOpenIdx(openIdx === idx ? null : idx);
  };

  return (
    <section id="faq" className="scroll-mt-16 sm:scroll-mt-20 w-full py-16 sm:py-24 bg-white border-b border-slate-200/80">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        {/* Section Header */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-xs font-bold text-slate-800 uppercase tracking-wider">
            <HelpCircle className="w-3.5 h-3.5 text-amber-500" />
            <span>{t('landing.faqBadge')}</span>
          </div>
          <h2 className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight">
            {t('landing.faqTitle')}
          </h2>
          <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
            {t('landing.faqSubtitle')}
          </p>
        </div>

        {/* FAQ Accordion List */}
        <div className="space-y-3">
          {faqs.map((faq, idx) => {
            const isOpen = openIdx === idx;
            return (
              <div
                key={idx}
                className="rounded-2xl border border-slate-200 bg-slate-50/60 overflow-hidden transition-all duration-200"
              >
                <button
                  onClick={() => toggle(idx)}
                  className="w-full p-5 sm:p-6 text-left flex items-center justify-between gap-4 cursor-pointer focus:outline-hidden"
                  aria-expanded={isOpen}
                >
                  <span className="text-sm sm:text-base font-bold text-slate-900 leading-snug">
                    {faq.q}
                  </span>
                  <div
                    className={`w-7 h-7 rounded-full bg-white border border-slate-200 flex items-center justify-center shrink-0 transition-transform duration-200 ${
                      isOpen ? 'rotate-180 bg-amber-50 border-amber-200' : ''
                    }`}
                  >
                    <ChevronDown className={`w-4 h-4 ${isOpen ? 'text-amber-600' : 'text-slate-400'}`} />
                  </div>
                </button>

                {isOpen && (
                  <div className="px-5 pb-5 sm:px-6 sm:pb-6 pt-0 text-xs sm:text-sm text-slate-600 leading-relaxed border-t border-slate-100 bg-white">
                    <p className="pt-3">{faq.a}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
