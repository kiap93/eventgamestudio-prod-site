import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLocalization } from '../../context/LocalizationContext';
import { navigateTo } from '../../hooks/useRouteContext';
import { LanguageSelector } from '../common/LanguageSelector';
import {
  Gamepad2,
  Building2,
  ShieldCheck,
  LogOut,
  Menu,
  X,
  ExternalLink,
  ChevronRight,
  Share2,
  Coins,
  Users,
} from 'lucide-react';

interface SalesNavbarProps {
  activeSection?: 'games' | 'portal' | 'referrals' | 'commissions' | 'customers';
}

export const SalesNavbar: React.FC<SalesNavbarProps> = ({ activeSection = 'games' }) => {
  const { currentUser, logout } = useAuth();
  const { t } = useLocalization();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const partnerEmail = currentUser?.email || 'Active Partner';

  const navItems = [
    {
      key: 'portal' as const,
      label: t('sales.nav.dashboard'),
      path: '/sales',
      icon: ShieldCheck,
    },
    {
      key: 'customers' as const,
      label: t('sales.nav.customers'),
      path: '/sales/customers',
      icon: Users,
    },
    {
      key: 'referrals' as const,
      label: t('sales.nav.referrals'),
      path: '/sales/referrals',
      icon: Share2,
    },
    {
      key: 'commissions' as const,
      label: t('sales.nav.commissions'),
      shortLabel: t('sales.nav.commissionsShort'),
      path: '/sales/commissions',
      icon: Coins,
    },
    {
      key: 'games' as const,
      label: t('sales.nav.games'),
      path: '/sales/games',
      icon: Gamepad2,
    },
  ];

  return (
    <header className="sticky top-0 z-40 bg-slate-950/95 backdrop-blur-md border-b border-slate-800 transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-2 lg:gap-3 xl:gap-4 min-w-0">
            {/* Left: Brand & Desktop Navigation Lockup */}
            <div className="flex items-center gap-2 xl:gap-3 min-w-0 shrink">
              {/* Brand Logo & Title */}
              <button
                type="button"
                onClick={() => navigateTo('/sales')}
                className="flex items-center gap-2.5 text-left group cursor-pointer shrink-0"
                title={`${t('sales.nav.brandTitle')} - ${t('sales.nav.portalSubtitle')}`}
              >
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-400 flex items-center justify-center text-slate-950 font-black shadow-md shadow-amber-500/10 group-hover:scale-105 transition-transform shrink-0">
                  <Gamepad2 className="w-5 h-5 text-slate-950" />
                </div>
                <div className="hidden sm:block shrink-0">
                  <div className="text-sm font-extrabold text-white tracking-tight flex items-center gap-1.5 whitespace-nowrap">
                    <span>{t('sales.nav.brandTitle')}</span>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                      {t('sales.nav.partnerBadge')}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 font-medium hidden 2xl:block whitespace-nowrap">
                    {t('sales.nav.portalSubtitle')}
                  </div>
                </div>
              </button>

              {/* Vertical Divider */}
              <div className="hidden lg:block h-6 w-px bg-slate-800 mx-1.5 xl:mx-2.5 shrink-0" aria-hidden="true" />

              {/* Desktop Navigation Tabs */}
              <nav className="hidden lg:flex items-center gap-1 xl:gap-1.5 shrink-0" aria-label={t('sales.nav.ariaPartnerNav', undefined, 'Partner Navigation')}>
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeSection === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => navigateTo(item.path)}
                      className={`px-2 xl:px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                        isActive
                          ? 'bg-amber-500 text-slate-950 shadow-sm font-bold'
                          : 'text-slate-300 hover:text-white hover:bg-slate-900'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      {item.shortLabel ? (
                        <span>
                          {item.shortLabel}
                          <span className="hidden xl:inline">
                            {item.label.slice(item.shortLabel.length)}
                          </span>
                        </span>
                      ) : (
                        <span>{item.label}</span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Right: Tools, Language, Partner Info & Actions (Desktop) */}
            <div className="hidden lg:flex items-center gap-1.5 xl:gap-2.5 min-w-0 shrink-0">
              {/* Language Selector */}
              <LanguageSelector variant="compact" className="shrink-0" />

              {/* Partner Account Pill */}
              <div
                className="flex items-center gap-1.5 px-2 xl:px-2.5 py-1.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs text-slate-300 min-w-0 shrink max-w-[110px] xl:max-w-[170px]"
                title={partnerEmail}
                aria-label={`Signed in as ${partnerEmail}`}
              >
                <div className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" aria-hidden="true" />
                <span className="font-medium text-slate-200 font-mono truncate min-w-0">
                  {partnerEmail}
                </span>
              </div>

              {/* Customer Workspace Switch Button */}
              <button
                type="button"
                onClick={() => navigateTo('/events')}
                className="flex items-center gap-1.5 px-2 xl:px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-750 text-xs font-semibold text-slate-200 hover:text-white transition-all cursor-pointer shrink-0 whitespace-nowrap"
                title={t('sales.nav.customerWorkspace')}
              >
                <Building2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>
                  <span className="hidden 2xl:inline">{t('sales.nav.customerWorkspace', undefined, 'Customer Workspace')}</span>
                  <span className="2xl:hidden">{t('sales.nav.customerWorkspaceShort', undefined, 'Workspace')}</span>
                </span>
                <ExternalLink className="w-3 h-3 text-slate-400 shrink-0" />
              </button>

              {/* Logout Button */}
              <button
                type="button"
                onClick={() => logout && logout()}
                className="p-1.5 xl:p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors cursor-pointer shrink-0 flex items-center justify-center min-w-[32px] min-h-[32px]"
                title={t('sales.nav.signOut')}
                aria-label={t('sales.nav.signOut')}
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>

            {/* Mobile & Tablet Controls (< lg) */}
            <div className="flex lg:hidden items-center gap-2">
              <LanguageSelector variant="compact" className="shrink-0" />
              <button
                type="button"
                onClick={() => navigateTo('/events')}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-200 hover:text-white transition-colors shrink-0"
                title={t('sales.nav.customerWorkspace')}
              >
                <Building2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>{t('sales.nav.workspace')}</span>
              </button>
              <button
                type="button"
                onClick={() => setMobileMenuOpen((prev) => !prev)}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-900 border border-slate-800 transition-colors shrink-0"
                aria-label={mobileMenuOpen ? t('sales.nav.closeMenu') : t('sales.nav.openMenu')}
                aria-expanded={mobileMenuOpen}
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile & Tablet Dropdown Drawer (< lg) */}
        {mobileMenuOpen && (
          <div className="lg:hidden px-4 py-3 bg-slate-950/98 border-t border-slate-800 space-y-3 shadow-2xl">
            {/* Partner Account Info Card */}
            <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-900/90 border border-slate-800 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" aria-hidden="true" />
                <span className="text-slate-400 shrink-0">{t('sales.nav.partner')}:</span>
                <span className="font-mono text-slate-200 truncate font-medium min-w-0" title={partnerEmail}>
                  {partnerEmail}
                </span>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shrink-0 ml-2">
                {t('sales.nav.active')}
              </span>
            </div>

            {/* Navigation Items (Accessible stacked list) */}
            <nav className="space-y-1" aria-label={t('sales.nav.ariaMobilePartnerNav', undefined, 'Mobile Partner Navigation')}>
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeSection === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      navigateTo(item.path);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                      isActive
                        ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/10'
                        : 'text-slate-300 hover:text-white hover:bg-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{item.label}</span>
                    </div>
                    {isActive && <ChevronRight className="w-4 h-4 shrink-0" />}
                  </button>
                );
              })}
            </nav>

            {/* Drawer Actions: Workspace & Sign Out */}
            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-3 text-xs">
              <button
                type="button"
                onClick={() => {
                  navigateTo('/events');
                  setMobileMenuOpen(false);
                }}
                className="flex items-center gap-1.5 text-slate-300 hover:text-white transition-colors py-1 cursor-pointer"
              >
                <Building2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>{t('sales.nav.customerWorkspace')}</span>
                <ExternalLink className="w-3 h-3 text-slate-500 shrink-0" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  logout && logout();
                }}
                className="flex items-center gap-1.5 text-rose-400 hover:text-rose-300 transition-colors cursor-pointer font-medium py-1 px-2 rounded-lg hover:bg-rose-500/10"
              >
                <LogOut className="w-3.5 h-3.5 shrink-0" />
                <span>{t('sales.nav.signOut')}</span>
              </button>
            </div>
          </div>
        )}
      </header>
  );
};
