import React from 'react';
import { Gamepad2, ArrowUpRight, ShieldCheck, Sparkles, MessageSquare, Phone } from 'lucide-react';
import { navigateTo } from '../../hooks/useRouteContext';
import { InternalLink } from '../common/InternalLink';
import { useAuth } from '../../context/AuthContext';
import { usePlatformContactSettings } from '../../hooks/usePlatformContactSettings';
import { APP_VERSION } from '../../types';
import { useLocalization } from '../../context/LocalizationContext';
import { LanguageSelector } from '../common/LanguageSelector';

export const LandingFooter: React.FC = () => {
  const { t } = useLocalization();
  const { isAuthenticated, currentUser } = useAuth();
  const { whatsappDisplay, whatsappUrl, officeLocation, supportHours } = usePlatformContactSettings();

  return (
    <footer className="w-full bg-slate-900 border-t border-slate-800 text-slate-400 text-xs py-12 md:py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-8 pb-10 border-b border-slate-800">
          {/* 1. Brand Info */}
          <div className="sm:col-span-2 md:col-span-1 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-amber-400">
                <Gamepad2 className="w-4 h-4" />
              </div>
              <span className="text-base font-black text-white tracking-tight">
                EventGame<span className="text-amber-500">Studio</span>
              </span>
            </div>
            <p className="text-slate-400 text-xs leading-relaxed max-w-sm">
              {t('landing.footerDescription')}
            </p>
            <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>{t('landing.heroBadge')}</span>
            </div>
          </div>

          {/* 2. Event Solutions */}
          <div className="space-y-3">
            <div className="text-[11px] uppercase tracking-wider font-bold text-white">
              {t('landing.solutions')}
            </div>
            <ul className="space-y-2 text-xs">
              <li>
                <InternalLink
                  to="/corporate-event-games"
                  className="hover:text-amber-400 transition-colors block"
                >
                  {t('landing.solutionCorporateEvents')}
                </InternalLink>
              </li>
              <li>
                <InternalLink
                  to="/brand-activation-games"
                  className="hover:text-amber-400 transition-colors block"
                >
                  {t('landing.solutionBrandActivations')}
                </InternalLink>
              </li>
              <li>
                <InternalLink
                  to="/roadshow-games"
                  className="hover:text-amber-400 transition-colors block"
                >
                  {t('landing.solutionRoadshows')}
                </InternalLink>
              </li>
              <li>
                <InternalLink
                  to="/exhibition-games"
                  className="hover:text-amber-400 transition-colors block"
                >
                  {t('landing.solutionExhibitions')}
                </InternalLink>
              </li>
              <li>
                <InternalLink
                  to="/interactive-event-games"
                  className="hover:text-amber-400 transition-colors block"
                >
                  {t('landing.solutionInteractive')}
                </InternalLink>
              </li>
              <li>
                <InternalLink
                  to="/event-mini-games"
                  className="hover:text-amber-400 transition-colors block"
                >
                  {t('landing.eventMiniGames')}
                </InternalLink>
              </li>
              <li>
                <InternalLink
                  to="/branded-event-games"
                  className="hover:text-amber-400 transition-colors block"
                >
                  {t('landing.brandedEventGames')}
                </InternalLink>
              </li>
              <li>
                <InternalLink
                  to="/digital-event-games"
                  className="hover:text-amber-400 transition-colors block"
                >
                  {t('landing.digitalEventGames')}
                </InternalLink>
              </li>
            </ul>
          </div>

          {/* 3. Game Engines */}
          <div className="space-y-3">
            <div className="text-[11px] uppercase tracking-wider font-bold text-white">
              {t('landing.gameEngines')}
            </div>
            <ul className="space-y-2 text-xs">
              <li>
                <InternalLink
                  to="/game-showcase"
                  className="hover:text-amber-400 transition-colors font-semibold text-slate-300 block"
                >
                  {t('landing.allGamesCatalog')}
                </InternalLink>
              </li>
              <li>
                <InternalLink
                  to="/game-showcase/catch-the-brand"
                  className="hover:text-amber-400 transition-colors block"
                >
                  {t('landing.catchBrandName')}
                </InternalLink>
              </li>
              <li>
                <InternalLink
                  to="/game-showcase/memory-match"
                  className="hover:text-amber-400 transition-colors block"
                >
                  {t('landing.memoryMatchName')}
                </InternalLink>
              </li>
              <li>
                <InternalLink
                  to="/game-showcase/reaction-challenge"
                  className="hover:text-amber-400 transition-colors block"
                >
                  {t('landing.reactionTapName')}
                </InternalLink>
              </li>
              <li>
                <InternalLink
                  to="/showcase"
                  className="hover:text-amber-400 transition-colors block"
                >
                  {t('landing.browseShowcases')}
                </InternalLink>
              </li>
            </ul>
          </div>

          {/* 4. Platform & Workspaces */}
          <div className="space-y-3">
            <div className="text-[11px] uppercase tracking-wider font-bold text-white">
              {t('landing.platform')}
            </div>
            <ul className="space-y-2 text-xs">
              <li>
                <InternalLink
                  to="/events"
                  className="hover:text-amber-400 transition-colors block"
                >
                  {t('nav.events')}
                </InternalLink>
              </li>
              <li>
                <InternalLink
                  to="/game-themes"
                  className="hover:text-amber-400 transition-colors block"
                >
                  {t('nav.themes')}
                </InternalLink>
              </li>
              <li>
                <InternalLink
                  to="/team"
                  className="hover:text-amber-400 transition-colors block"
                >
                  {t('nav.team')}
                </InternalLink>
              </li>
              <li>
                <InternalLink
                  to="/wallet"
                  className="hover:text-amber-400 transition-colors block"
                >
                  {t('nav.wallet')}
                </InternalLink>
              </li>
              {currentUser?.is_developer && (
                <li>
                  <InternalLink
                    to="/developer"
                    className="text-amber-400 hover:text-amber-300 font-semibold block"
                  >
                    {t('nav.developer')}
                  </InternalLink>
                </li>
              )}
            </ul>
          </div>

          {/* 5. Contact & Support */}
          <div className="space-y-3">
            <InternalLink
              href="/contact"
              to="/contact"
              className="text-[11px] uppercase tracking-wider font-bold text-white hover:text-amber-400 transition-colors inline-block cursor-pointer"
            >
              {t('landing.contact')}
            </InternalLink>
            <ul className="space-y-2.5 text-xs">
              <li>
                <InternalLink
                  href="/contact"
                  to="/contact"
                  className="hover:text-amber-400 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-amber-400" />
                  <span>{t('landing.contactForm')}</span>
                </InternalLink>
              </li>
              {whatsappUrl && (
                <li>
                  <a
                    href={whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-amber-400 transition-colors flex items-center gap-1.5"
                  >
                    <Phone className="w-3.5 h-3.5 text-emerald-400" />
                    <span>WhatsApp: {whatsappDisplay}</span>
                  </a>
                </li>
              )}
              {officeLocation && (
                <li className="text-[11px] text-slate-400 leading-tight">
                  {officeLocation}
                </li>
              )}
              <li className="pt-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800 border border-slate-700 text-[10px] text-slate-300 font-semibold">
                  <ShieldCheck className="w-3 h-3 text-emerald-400" />
                  <span>{t('landing.enterpriseReady')}</span>
                </span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar: Copyright, Language, Version */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-slate-500">
          <div>
            &copy; {new Date().getFullYear()} EventGameStudio. All rights reserved.
          </div>

          <div className="flex items-center gap-4">
            <LanguageSelector variant="compact" />
            <span>v{APP_VERSION}</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
