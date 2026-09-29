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
  MessageSquare,
  ChevronDown,
  Trophy,
  Building2,
  Tv,
} from 'lucide-react';
import { NotificationBell } from '../notifications/NotificationBell';

interface LandingHeaderProps {
  onExploreGames?: () => void;
}

export const LandingHeader: React.FC<LandingHeaderProps> = ({ onExploreGames }) => {
  const { isAuthenticated, currentUser, currentOrganization, logout } = useAuth();
  const routeContext = useRouteContext();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [solutionsDropdownOpen, setSolutionsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const isContactPage = routeContext.mode === 'contact';
  const isGamesPage = routeContext.mode === 'public_games' || routeContext.mode === 'public_game_detail';
  const isShowcasePage = routeContext.mode === 'public_showcases' || routeContext.mode === 'public_showcase';
  const isSolutionsPage = routeContext.mode === 'seo_landing';

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
      navigateTo('/login');
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

  const handleContactClick = () => {
    setMobileMenuOpen(false);
    setSolutionsDropdownOpen(false);
    navigateTo('/contact');
  };

  return (
    <header
      id="landing-header"
      className="sticky top-0 z-50 w-full bg-white/95 backdrop-blur-xl border-b border-slate-200/90 shadow-xs transition-all"
      style={{ position: 'sticky', top: 0 }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between gap-4">
        {/* Brand Logo */}
        <div className="flex items-center gap-6">
          <InternalLink
            href="/"
            className="flex items-center gap-3 text-left group transition-transform focus:outline-none"
            aria-label="EventGameStudio Home"
          >
            <div className="relative p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-600 group-hover:border-amber-500 group-hover:bg-amber-500/15 group-hover:shadow-[0_0_20px_rgba(245,158,11,0.2)] transition-all">
              <Gamepad2 className="w-6 h-6 transform group-hover:scale-110 transition-transform text-amber-600" />
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-white animate-pulse" />
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-black tracking-tight text-slate-900 group-hover:text-amber-600 transition-colors flex items-center gap-1.5">
                EventGameStudio
              </span>
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest -mt-0.5">
                Interactive Games for Events
              </span>
            </div>
          </InternalLink>

          {/* Desktop Navigation Links */}
          <nav className="hidden lg:flex items-center gap-1 ml-4 pl-4 border-l border-slate-200">
            <InternalLink
              href="/game-showcase"
              className={`px-3 py-2 text-xs font-semibold rounded-xl transition-all ${
                isGamesPage
                  ? 'bg-amber-50 text-amber-800 border border-amber-200 font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              Games
            </InternalLink>

            <InternalLink
              href="/showcase"
              className={`px-3 py-2 text-xs font-semibold rounded-xl transition-all ${
                isShowcasePage
                  ? 'bg-amber-50 text-amber-800 border border-amber-200 font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              Showcase
            </InternalLink>

            {/* Solutions Dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setSolutionsDropdownOpen((prev) => !prev)}
                className={`px-3 py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer flex items-center gap-1 ${
                  isSolutionsPage
                    ? 'bg-amber-50 text-amber-800 border border-amber-200 font-bold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
                aria-expanded={solutionsDropdownOpen}
              >
                <span>Solutions</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${solutionsDropdownOpen ? 'rotate-180 text-amber-600' : ''}`} />
              </button>

              {solutionsDropdownOpen && (
                <div className="absolute top-full left-0 mt-1 w-64 p-2 bg-white rounded-2xl border border-slate-200 shadow-xl shadow-slate-900/10 z-50 animate-in fade-in slide-in-from-top-2 duration-150 space-y-1">
                  <InternalLink
                    href="/corporate-event-games"
                    onClick={() => setSolutionsDropdownOpen(false)}
                    className="w-full p-2.5 text-left rounded-xl hover:bg-amber-50/70 transition-colors group block"
                  >
                    <span className="text-xs font-bold text-slate-900 group-hover:text-amber-800 block">
                      Corporate Events
                    </span>
                    <span className="text-[11px] text-slate-500 block">Annual dinners, summits & galas</span>
                  </InternalLink>
                  <InternalLink
                    href="/brand-activation-games"
                    onClick={() => setSolutionsDropdownOpen(false)}
                    className="w-full p-2.5 text-left rounded-xl hover:bg-amber-50/70 transition-colors group block"
                  >
                    <span className="text-xs font-bold text-slate-900 group-hover:text-amber-800 block">
                      Brand Activations
                    </span>
                    <span className="text-[11px] text-slate-500 block">Experiential & product campaigns</span>
                  </InternalLink>
                  <InternalLink
                    href="/roadshow-games"
                    onClick={() => setSolutionsDropdownOpen(false)}
                    className="w-full p-2.5 text-left rounded-xl hover:bg-amber-50/70 transition-colors group block"
                  >
                    <span className="text-xs font-bold text-slate-900 group-hover:text-amber-800 block">
                      Roadshows & Pop-Ups
                    </span>
                    <span className="text-[11px] text-slate-500 block">Mall concourse & touch kiosks</span>
                  </InternalLink>
                  <InternalLink
                    href="/exhibition-games"
                    onClick={() => setSolutionsDropdownOpen(false)}
                    className="w-full p-2.5 text-left rounded-xl hover:bg-amber-50/70 transition-colors group block"
                  >
                    <span className="text-xs font-bold text-slate-900 group-hover:text-amber-800 block">
                      Exhibitions & Booths
                    </span>
                    <span className="text-[11px] text-slate-500 block">Trade show crowd attraction</span>
                  </InternalLink>
                  <InternalLink
                    href="/interactive-event-games"
                    onClick={() => setSolutionsDropdownOpen(false)}
                    className="w-full p-2.5 text-left rounded-xl hover:bg-amber-50/70 transition-colors group border-t border-slate-100 block"
                  >
                    <span className="text-xs font-bold text-slate-900 group-hover:text-amber-800 block">
                      Interactive Event Games
                    </span>
                    <span className="text-[11px] text-slate-500 block">QR browser play & live leaderboards</span>
                  </InternalLink>
                </div>
              )}
            </div>

            <button
              onClick={() => scrollToSection('how-it-works')}
              className="px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
            >
              How It Works
            </button>

            <InternalLink
              href="/contact"
              className={`px-3 py-2 text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5 ${
                isContactPage
                  ? 'bg-amber-50 text-amber-800 border border-amber-200 font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5 text-amber-500" />
              <span>Contact</span>
            </InternalLink>

            {onExploreGames && (
              <button
                onClick={onExploreGames}
                className="px-3 py-2 text-xs font-semibold text-amber-700 hover:text-amber-800 hover:bg-amber-50 rounded-xl transition-all flex items-center gap-1.5 ml-1 border border-amber-200/80 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>Catalog</span>
              </button>
            )}
          </nav>
        </div>

        {/* Right Actions */}
        <div className="hidden sm:flex items-center gap-3">
          {isAuthenticated ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-2xl">
                <div className="w-7 h-7 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-700 text-xs font-bold overflow-hidden">
                  {currentUser?.avatar_url ? (
                    <img src={currentUser.avatar_url} alt={currentUser.name} className="w-full h-full object-cover" />
                  ) : (
                    currentUser?.name?.charAt(0).toUpperCase() || <UserIcon className="w-3.5 h-3.5" />
                  )}
                </div>
                <div className="flex flex-col text-left">
                  <span className="text-xs font-bold text-slate-900 leading-tight max-w-[120px] truncate">
                    {currentUser?.name || 'User'}
                  </span>
                  <span className="text-[10px] text-amber-700 font-medium leading-none max-w-[120px] truncate">
                    {currentOrganization?.name || 'Workspace'}
                  </span>
                </div>
              </div>

              <button
                onClick={handleDashboardClick}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-bold text-xs rounded-xl shadow-md shadow-amber-500/20 hover:shadow-amber-500/30 transition-all transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                <span>Open Studio</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>

              <NotificationBell />

              <button
                onClick={logout}
                title="Sign Out"
                className="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer border border-transparent hover:border-rose-200"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2.5">
              <button
                onClick={handleSignInClick}
                className="px-4 py-2 text-xs font-bold text-slate-700 hover:text-slate-900 hover:bg-slate-100 border border-slate-200/80 rounded-xl transition-all cursor-pointer"
              >
                Sign In
              </button>
              <button
                onClick={handleCreateEventClick}
                className="group relative flex items-center gap-2 px-4.5 py-2.5 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black text-xs rounded-xl shadow-md shadow-amber-500/20 hover:shadow-amber-500/30 transition-all transform hover:-translate-y-0.5 cursor-pointer"
              >
                <span>Create Your First Event</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>
          )}
        </div>

        {/* Mobile Menu Toggle & Actions */}
        <div className="sm:hidden flex items-center gap-2">
          {isAuthenticated && <NotificationBell />}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-xl border border-slate-200 cursor-pointer"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="sm:hidden px-4 pt-2 pb-6 bg-white border-b border-slate-200 space-y-3 shadow-lg">
          <div className="flex flex-col gap-1 text-xs font-semibold">
            <InternalLink
              href="/game-showcase"
              onClick={() => setMobileMenuOpen(false)}
              className="w-full text-left p-2.5 rounded-xl hover:bg-slate-100 text-slate-900 font-bold block"
            >
              Interactive Games
            </InternalLink>
            <InternalLink
              href="/showcase"
              onClick={() => setMobileMenuOpen(false)}
              className="w-full text-left p-2.5 rounded-xl hover:bg-slate-100 text-slate-900 font-bold block"
            >
              Event Showcases
            </InternalLink>

            {/* Mobile Solutions Section */}
            <div className="py-1 px-2.5 text-[10px] font-black uppercase tracking-wider text-slate-400">
              Event Solutions
            </div>
            <InternalLink
              href="/corporate-event-games"
              onClick={() => setMobileMenuOpen(false)}
              className="w-full text-left p-2 rounded-xl hover:bg-slate-100 text-slate-700 pl-4 block"
            >
              Corporate Event Games
            </InternalLink>
            <InternalLink
              href="/brand-activation-games"
              onClick={() => setMobileMenuOpen(false)}
              className="w-full text-left p-2 rounded-xl hover:bg-slate-100 text-slate-700 pl-4 block"
            >
              Brand Activation Games
            </InternalLink>
            <InternalLink
              href="/roadshow-games"
              onClick={() => setMobileMenuOpen(false)}
              className="w-full text-left p-2 rounded-xl hover:bg-slate-100 text-slate-700 pl-4 block"
            >
              Roadshow & Pop-Up Games
            </InternalLink>
            <InternalLink
              href="/exhibition-games"
              onClick={() => setMobileMenuOpen(false)}
              className="w-full text-left p-2 rounded-xl hover:bg-slate-100 text-slate-700 pl-4 block"
            >
              Exhibition & Booth Games
            </InternalLink>
            <InternalLink
              href="/interactive-event-games"
              onClick={() => setMobileMenuOpen(false)}
              className="w-full text-left p-2 rounded-xl hover:bg-slate-100 text-slate-700 pl-4 block"
            >
              Interactive Event Games
            </InternalLink>

            <div className="border-t border-slate-100 my-1" />

            <button
              onClick={() => scrollToSection('how-it-works')}
              className="w-full text-left p-2.5 rounded-xl hover:bg-slate-100 text-slate-700"
            >
              How It Works
            </button>
            <InternalLink
              href="/contact"
              onClick={() => setMobileMenuOpen(false)}
              className={`w-full text-left p-2.5 rounded-xl flex items-center gap-2 ${
                isContactPage
                  ? 'bg-amber-50 text-amber-900 font-bold border border-amber-200'
                  : 'hover:bg-slate-100 text-slate-700'
              }`}
            >
              <MessageSquare className="w-4 h-4 text-amber-500" />
              <span>Contact Us</span>
            </InternalLink>

            {onExploreGames && (
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onExploreGames();
                }}
                className="w-full flex items-center justify-between p-3 rounded-xl bg-amber-50/80 border border-amber-200 text-xs font-semibold text-amber-800 mt-1"
              >
                <span className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  Explore All Games Catalog
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
              </button>
            )}
          </div>

          <div className="pt-2 border-t border-slate-200 flex flex-col gap-2">
            {isAuthenticated ? (
              <>
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    handleDashboardClick();
                  }}
                  className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-md shadow-amber-500/20"
                >
                  <LayoutDashboard className="w-4 h-4" />
                  <span>Open Event Studio</span>
                </button>
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    logout();
                  }}
                  className="w-full py-2.5 bg-slate-100 border border-slate-200 hover:bg-rose-50 hover:text-rose-600 text-slate-600 font-semibold text-xs rounded-xl flex items-center justify-center gap-2"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    handleCreateEventClick();
                  }}
                  className="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-400 text-slate-950 font-black text-xs rounded-xl flex items-center justify-center gap-2 shadow-md shadow-amber-500/20"
                >
                  <span>Create Your First Event</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    handleSignInClick();
                  }}
                  className="w-full py-2.5 bg-slate-100 border border-slate-200 text-slate-700 font-semibold text-xs rounded-xl flex items-center justify-center"
                >
                  Sign In to Studio
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
