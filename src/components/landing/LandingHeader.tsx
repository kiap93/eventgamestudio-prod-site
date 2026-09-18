import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { navigateTo, useRouteContext } from '../../hooks/useRouteContext';
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
} from 'lucide-react';
import { NotificationBell } from '../notifications/NotificationBell';

interface LandingHeaderProps {
  onExploreGames?: () => void;
}

export const LandingHeader: React.FC<LandingHeaderProps> = ({ onExploreGames }) => {
  const { isAuthenticated, currentUser, currentOrganization, logout } = useAuth();
  const routeContext = useRouteContext();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isContactPage = routeContext.mode === 'contact';

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
    if (isContactPage) {
      navigateTo('/');
      // Allow transition then scroll
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
          <button
            onClick={() => navigateTo('/')}
            className="flex items-center gap-3 text-left group transition-transform focus:outline-none cursor-pointer"
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
          </button>

          {/* Desktop Navigation Links */}
          <nav className="hidden lg:flex items-center gap-1 ml-4 pl-4 border-l border-slate-200">
            <button
              onClick={() => scrollToSection('how-it-works')}
              className="px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
            >
              How It Works
            </button>
            <button
              onClick={() => scrollToSection('game-showcase')}
              className="px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
            >
              Games
            </button>
            <button
              onClick={() => scrollToSection('brand-your-game')}
              className="px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
            >
              Brand Customizer
            </button>
            <button
              onClick={() => scrollToSection('event-showcase')}
              className="px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
            >
              Production Formats
            </button>
            <button
              onClick={() => scrollToSection('agencies')}
              className="px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
            >
              For Agencies
            </button>
            <button
              onClick={handleContactClick}
              className={`px-3 py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                isContactPage
                  ? 'bg-amber-50 text-amber-800 border border-amber-200 font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5 text-amber-500" />
              <span>Contact</span>
            </button>

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
            <button
              onClick={() => scrollToSection('how-it-works')}
              className="w-full text-left p-2.5 rounded-xl hover:bg-slate-100 text-slate-700"
            >
              How It Works
            </button>
            <button
              onClick={() => scrollToSection('game-showcase')}
              className="w-full text-left p-2.5 rounded-xl hover:bg-slate-100 text-slate-700"
            >
              Game Showcase
            </button>
            <button
              onClick={() => scrollToSection('brand-your-game')}
              className="w-full text-left p-2.5 rounded-xl hover:bg-slate-100 text-slate-700"
            >
              Brand Customization
            </button>
            <button
              onClick={() => scrollToSection('event-showcase')}
              className="w-full text-left p-2.5 rounded-xl hover:bg-slate-100 text-slate-700"
            >
              Production Formats
            </button>
            <button
              onClick={() => scrollToSection('agencies')}
              className="w-full text-left p-2.5 rounded-xl hover:bg-slate-100 text-slate-700"
            >
              For Event Agencies
            </button>
            <button
              onClick={handleContactClick}
              className={`w-full text-left p-2.5 rounded-xl flex items-center gap-2 ${
                isContactPage
                  ? 'bg-amber-50 text-amber-900 font-bold border border-amber-200'
                  : 'hover:bg-slate-100 text-slate-700'
              }`}
            >
              <MessageSquare className="w-4 h-4 text-amber-500" />
              <span>Contact Us</span>
            </button>

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
