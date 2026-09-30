import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { navigateTo, useRouteContext } from '../../hooks/useRouteContext';
import { InternalLink } from '../common/InternalLink';
import {
  Gamepad2,
  Sparkles,
  ArrowRight,
  User as UserIcon,
  LogOut,
  LayoutDashboard,
  Menu,
  X,
  ChevronDown,
  Building2,
  Tv,
  Store,
  QrCode,
  Coins,
  Send,
} from 'lucide-react';
import { NotificationBell } from '../notifications/NotificationBell';
import { LanguageSelector } from '../common/LanguageSelector';
import { useLocalization } from '../../context/LocalizationContext';

interface LandingHeaderProps {
  onExploreGames?: () => void;
}

export const LandingHeader: React.FC<LandingHeaderProps> = ({ onExploreGames }) => {
  const { t } = useLocalization();
  const { isAuthenticated, currentUser, currentOrganization, logout } = useAuth();
  const routeContext = useRouteContext();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [solutionsDropdownOpen, setSolutionsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const isContactPage = routeContext.mode === 'contact';
  const isGamesPage = routeContext.mode === 'public_games' || routeContext.mode === 'public_game_detail';

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setSolutionsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCreateEventClick = () => {
    if (isAuthenticated) {
      navigateTo('/events');
    } else {
      navigateTo('/login?redirect=/events');
    }
  };

  const handleSignInClick = () => {
    navigateTo('/login');
  };

  const handleDashboardClick = () => {
    navigateTo('/events');
  };

  const scrollToSection = (id: string) => {
    setMobileMenuOpen(false);
    setSolutionsDropdownOpen(false);
    if (routeContext.mode !== 'landing') {
      navigateTo('/');
      setTimeout(() => {
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 100);
      return;
    }

    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const solutionsList = [
    {
      title: t('landing.solutionCorporateEvents'),
      desc: t('landing.solutionCorporateEventsDesc'),
      href: '/corporate-event-games',
      icon: Building2,
    },
    {
      title: t('landing.solutionBrandActivations'),
      desc: t('landing.solutionBrandActivationsDesc'),
      href: '/brand-activation-games',
      icon: Sparkles,
    },
    {
      title: t('landing.solutionRoadshows'),
      desc: t('landing.solutionRoadshowsDesc'),
      href: '/roadshow-games',
      icon: Store,
    },
    {
      title: t('landing.solutionExhibitions'),
      desc: t('landing.solutionExhibitionsDesc'),
      href: '/exhibition-games',
      icon: Tv,
    },
    {
      title: t('landing.solutionInteractive'),
      desc: t('landing.solutionInteractiveDesc'),
      href: '/interactive-event-games',
      icon: QrCode,
    },
  ];

  return (
    <header
      id="landing-header"
      className="sticky top-0 z-50 w-full bg-white/95 backdrop-blur-md border-b border-slate-200/90 shadow-xs transition-all"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between gap-4">
        {/* Brand Logo Zone */}
        <div className="flex items-center gap-6">
          <InternalLink
            to="/"
            className="flex items-center gap-3 group focus:outline-hidden"
            aria-label="EventGameStudio Home"
          >
            <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-amber-400 shadow-xs group-hover:scale-105 transition-transform duration-200">
              <Gamepad2 className="w-5 h-5" />
            </div>
            <span className="text-lg sm:text-xl font-black tracking-tight text-slate-900 flex items-center">
              EventGame<span className="text-amber-500">Studio</span>
            </span>
          </InternalLink>
        </div>

        {/* Desktop Navigation Links */}
        <nav className="hidden lg:flex items-center gap-1 xl:gap-2">
          {/* Games */}
          <button
            onClick={() => scrollToSection('games')}
            className={`px-3 py-2 text-sm font-semibold rounded-lg transition-colors cursor-pointer ${
              isGamesPage ? 'text-amber-600 bg-amber-50/80' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
            }`}
          >
            {t('landing.navGames')}
          </button>

          {/* Solutions Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setSolutionsDropdownOpen(!solutionsDropdownOpen)}
              className="px-3 py-2 text-sm font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
              aria-expanded={solutionsDropdownOpen}
            >
              <span>{t('landing.navSolutions')}</span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${
                  solutionsDropdownOpen ? 'rotate-180 text-slate-700' : ''
                }`}
              />
            </button>

            {solutionsDropdownOpen && (
              <div className="absolute top-full left-0 mt-2 w-80 bg-white border border-slate-200 rounded-2xl shadow-xl p-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="space-y-1">
                  {solutionsList.map((sol) => {
                    const IconComponent = sol.icon;
                    return (
                      <InternalLink
                        key={sol.href}
                        to={sol.href}
                        onClick={() => setSolutionsDropdownOpen(false)}
                        className="flex items-start gap-3 p-2.5 rounded-xl hover:bg-slate-50 transition-colors group"
                      >
                        <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 group-hover:bg-amber-100 transition-colors">
                          <IconComponent className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-900 group-hover:text-amber-600 transition-colors">
                            {sol.title}
                          </div>
                          <div className="text-[11px] text-slate-500 leading-tight">
                            {sol.desc}
                          </div>
                        </div>
                      </InternalLink>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* How It Works */}
          <button
            onClick={() => scrollToSection('how-it-works')}
            className="px-3 py-2 text-sm font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 rounded-lg transition-colors cursor-pointer"
          >
            {t('landing.navHowItWorks')}
          </button>

          {/* Pricing */}
          <button
            onClick={() => scrollToSection('pricing')}
            className="px-3 py-2 text-sm font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 rounded-lg transition-colors cursor-pointer"
          >
            {t('landing.navPricing')}
          </button>

          {/* Contact */}
          <InternalLink
            to="/contact"
            className={`px-3 py-2 text-sm font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
              isContactPage ? 'text-amber-600 bg-amber-50/80' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
            }`}
          >
            <span>{t('landing.navContact')}</span>
          </InternalLink>
        </nav>

        {/* Right Zone: Language Selector & Auth CTAs */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          <div className="hidden sm:block">
            <LanguageSelector variant="compact" />
          </div>

          {isAuthenticated ? (
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="hidden md:flex items-center gap-2 px-2.5 py-1 rounded-xl bg-slate-100 border border-slate-200/80">
                <div className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-slate-600">
                  <UserIcon className="w-3 h-3" />
                </div>
                <div className="text-left text-xs">
                  <span className="font-semibold text-slate-800 line-clamp-1 max-w-[120px]">
                    {currentUser?.name || currentUser?.email || 'User'}
                  </span>
                  {currentOrganization && (
                    <span className="block text-[10px] text-slate-500 font-medium line-clamp-1 max-w-[120px]">
                      {currentOrganization.name}
                    </span>
                  )}
                </div>
              </div>

              <NotificationBell />

              <button
                onClick={handleDashboardClick}
                className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs sm:text-sm flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
              >
                <LayoutDashboard className="w-3.5 h-3.5 text-amber-400" />
                <span>{t('landing.openStudio')}</span>
              </button>

              <button
                onClick={() => logout()}
                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                title={t('nav.logout')}
                aria-label={t('nav.logout')}
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                onClick={handleSignInClick}
                className="px-3 py-2 text-xs sm:text-sm font-semibold text-slate-700 hover:text-slate-900 transition-colors cursor-pointer"
              >
                {t('landing.signIn')}
              </button>

              <button
                onClick={handleCreateEventClick}
                className="px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs sm:text-sm flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs hover:shadow-sm"
              >
                <span>{t('landing.createYourEvent')}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Mobile Menu Hamburger */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-white border-b border-slate-200 px-4 pt-3 pb-6 space-y-4 shadow-lg animate-in slide-in-from-top-4 duration-200">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Language</span>
            <LanguageSelector variant="compact" />
          </div>

          <div className="space-y-1">
            <button
              onClick={() => scrollToSection('games')}
              className="w-full text-left px-3 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50 rounded-xl"
            >
              {t('landing.navGames')}
            </button>
            <button
              onClick={() => scrollToSection('how-it-works')}
              className="w-full text-left px-3 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50 rounded-xl"
            >
              {t('landing.navHowItWorks')}
            </button>
            <button
              onClick={() => scrollToSection('pricing')}
              className="w-full text-left px-3 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50 rounded-xl"
            >
              {t('landing.navPricing')}
            </button>
            <InternalLink
              to="/contact"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50 rounded-xl"
            >
              {t('landing.navContact')}
            </InternalLink>
          </div>

          {/* Mobile Solutions List */}
          <div className="pt-2 border-t border-slate-100">
            <div className="px-3 py-1 text-xs font-bold uppercase tracking-wider text-slate-400">
              {t('landing.navSolutions')}
            </div>
            <div className="grid grid-cols-1 gap-1 mt-1">
              {solutionsList.map((sol) => (
                <InternalLink
                  key={sol.href}
                  to={sol.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="px-3 py-2 text-xs text-slate-600 hover:text-amber-600 hover:bg-amber-50/50 rounded-lg flex items-center justify-between"
                >
                  <span>{sol.title}</span>
                  <ArrowRight className="w-3 h-3 text-slate-300" />
                </InternalLink>
              ))}
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100">
            {isAuthenticated ? (
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  handleDashboardClick();
                }}
                className="w-full py-2.5 bg-slate-900 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
              >
                <LayoutDashboard className="w-4 h-4 text-amber-400" />
                <span>{t('landing.openStudio')}</span>
              </button>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    handleSignInClick();
                  }}
                  className="w-full py-2.5 border border-slate-300 text-slate-800 rounded-xl text-sm font-semibold"
                >
                  {t('landing.signIn')}
                </button>
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    handleCreateEventClick();
                  }}
                  className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5"
                >
                  <span>{t('landing.createYourEvent')}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
