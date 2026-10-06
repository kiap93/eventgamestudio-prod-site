import React, { useState } from 'react';
import { useLocalization } from '../../context/LocalizationContext';
import { useAuth } from '../../context/AuthContext';
import { navigateTo } from '../../hooks/useRouteContext';
import {
  ShieldCheck,
  Gamepad2,
  Sparkles,
  Layers,
  ArrowLeft,
  LogOut,
  User as UserIcon,
  Menu,
  X,
  ExternalLink,
  Code2,
  Activity,
  ChevronRight,
  Gift,
  Coins,
  Building2,
  Mail,
  AlertOctagon,
  MessageSquare,
  UserPlus,
} from 'lucide-react';
import { NotificationBell } from '../notifications/NotificationBell';
import { LanguageSelector } from '../common/LanguageSelector';

interface DeveloperAdminLayoutProps {
  children: React.ReactNode;
  activeSection?: 'games' | 'stats' | 'themes' | 'showcases' | 'pricing' | 'organizations' | 'email' | 'errors' | 'contact' | 'customer-invitations';
}

export const DeveloperAdminLayout: React.FC<DeveloperAdminLayoutProps> = ({
  children,
  activeSection = 'games',
}) => {
  const { t } = useLocalization();
  const { currentUser, currentOrganization, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  const navItems = [
    {
      id: 'games',
      path: '/developer',
      icon: Gamepad2,
      label: t('developer.gamesAndSystemThemes'),
      activeColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
      iconColor: 'text-emerald-400',
    },
    {
      id: 'organizations',
      path: '/developer/organizations',
      icon: Building2,
      label: t('nav.organizations', undefined, 'Organizations'),
      activeColor: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
      iconColor: 'text-emerald-400',
    },
    {
      id: 'showcases',
      path: '/developer/showcases',
      icon: Gift,
      label: t('nav.showcaseReviews', undefined, 'Showcase Reviews'),
      activeColor: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
      iconColor: 'text-amber-400',
    },
    {
      id: 'pricing',
      path: '/developer/pricing',
      icon: Coins,
      label: t('developer.eventPricingControl'),
      activeColor: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
      iconColor: 'text-cyan-400',
    },
    {
      id: 'email',
      path: '/developer/email',
      icon: Mail,
      label: t('developer.gmailApiEmail'),
      activeColor: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
      iconColor: 'text-indigo-400',
    },
    {
      id: 'errors',
      path: '/developer/errors',
      icon: AlertOctagon,
      label: t('developer.errorLogs'),
      activeColor: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
      iconColor: 'text-rose-400',
    },
    {
      id: 'contact',
      path: '/developer/contact',
      icon: MessageSquare,
      label: t('developer.contactSupportSettings'),
      activeColor: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
      iconColor: 'text-emerald-400',
    },
    {
      id: 'customer-invitations',
      path: '/developer/customer-invitations',
      icon: UserPlus,
      label: t('developer.customerInvitations', undefined, 'Customer Invitations'),
      activeColor: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
      iconColor: 'text-amber-400',
    },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-white">
      {/* Platform Top Notification Strip */}
      <div className="bg-gradient-to-r from-emerald-950 via-slate-900 to-emerald-950 border-b border-emerald-500/20 px-4 py-1.5 flex items-center justify-between text-xs">
        <div className="flex items-center space-x-2">
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-emerald-400 font-bold uppercase tracking-wider text-[10px]">
            {t('developer.devAdminPlatform')}
          </span>
          <span className="hidden sm:inline text-slate-500">|</span>
          <span className="hidden sm:inline text-slate-400 text-[11px]">
            {t('developer.platformTopNotification')}
          </span>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => navigateTo('/studio')}
            className="flex items-center space-x-1 text-emerald-400 hover:text-emerald-300 font-semibold text-[11px] hover:underline cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{t('developer.returnToStudio')}</span>
          </button>
        </div>
      </div>

      {/* Main Developer Top Header */}
      <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          {/* Left Brand Identity */}
          <div
            className="flex items-center space-x-3 cursor-pointer group shrink-0"
            onClick={() => navigateTo('/developer')}
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-slate-950 shadow-lg shadow-emerald-950/40 group-hover:scale-105 transition-transform shrink-0">
              <Code2 className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <span className="text-base font-black text-white tracking-tight flex items-center whitespace-nowrap">
                DevAdmin <span className="text-emerald-400 ml-1">Platform</span>
              </span>
              <span className="text-[10px] font-mono text-slate-400 block -mt-0.5 whitespace-nowrap">
                {t('developer.gamesThemesReviews')}
              </span>
            </div>
          </div>

          {/* Right Controls & User Info */}
          <div className="flex items-center space-x-2 sm:space-x-3 shrink-0">
            {/* Active Org Context Badge */}
            {currentOrganization && (
              <div className="hidden lg:flex items-center space-x-2 px-3 py-1.5 bg-slate-950 rounded-xl border border-slate-800 text-xs whitespace-nowrap">
                <span className="text-slate-500">Org:</span>
                <span className="text-slate-300 font-semibold truncate max-w-[140px]">{currentOrganization.name}</span>
              </div>
            )}

            {/* Language Selector */}
            <LanguageSelector variant="compact" />

            {/* Notification Bell */}
            <NotificationBell />

            {/* Current Developer User */}
            <div className="flex items-center space-x-2 px-2.5 py-1.5 bg-slate-800/80 rounded-xl border border-slate-700/80 text-xs shrink-0">
              <div className="w-6 h-6 rounded-full bg-emerald-600/30 text-emerald-400 flex items-center justify-center font-bold text-xs shrink-0">
                {currentUser?.name?.charAt(0) || 'D'}
              </div>
              <div className="hidden sm:block text-left">
                <span className="text-white font-semibold block leading-tight text-xs whitespace-nowrap max-w-[120px] truncate">{currentUser?.name}</span>
                <span className="text-[10px] text-emerald-400 font-mono block">developer_admin</span>
              </div>
            </div>

            {/* Logout / Exit */}
            <button
              onClick={logout}
              className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors cursor-pointer shrink-0"
              title={t('auth.signOut', undefined, 'Sign Out')}
            >
              <LogOut className="w-4 h-4" />
            </button>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 md:hidden text-slate-400 hover:text-white rounded-xl cursor-pointer shrink-0"
              aria-label={t('nav.toggleMenu', undefined, 'Toggle Navigation Menu')}
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Dedicated Horizontal Sub-Navigation Strip (Full Container Width) */}
        <div className="border-t border-slate-800/60 bg-slate-950/60">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <nav className="flex items-center gap-1.5 py-2 overflow-x-auto no-scrollbar scroll-smooth">
              {navItems.map((item) => {
                const IconComponent = item.icon;
                const isSelected = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => navigateTo(item.path)}
                    className={`flex items-center space-x-2 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                      isSelected
                        ? item.activeColor
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                    }`}
                  >
                    <IconComponent className={`w-4 h-4 shrink-0 ${isSelected ? item.iconColor : 'text-slate-400'}`} />
                    <span className="whitespace-nowrap cjk-keep-all">{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-800 bg-slate-900 px-4 py-3 space-y-2 animate-in fade-in slide-in-from-top-2 duration-150">
            {navItems.map((item) => {
              const IconComponent = item.icon;
              const isSelected = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    navigateTo(item.path);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                    isSelected
                      ? item.activeColor
                      : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <IconComponent className={`w-4 h-4 shrink-0 ${item.iconColor}`} />
                  <span className="whitespace-nowrap cjk-keep-all">{item.label}</span>
                </button>
              );
            })}

            <button
              onClick={() => {
                navigateTo('/studio');
                setMobileMenuOpen(false);
              }}
              className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-800 cursor-pointer pt-2 border-t border-slate-800"
            >
              <ArrowLeft className="w-4 h-4 shrink-0" />
              <span className="whitespace-nowrap cjk-keep-all">{t('developer.returnToStudio')}</span>
            </button>
          </div>
        )}
      </header>

      {/* Main Viewport Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 py-4 bg-slate-950 text-center text-xs text-slate-600">
        <p>Brand Engagement Games Platform • Developer Administration Architecture</p>
      </footer>
    </div>
  );
};
