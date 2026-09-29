import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { GamesPage } from '../games/GamesPage';
import { TeamMembersPage } from '../org/TeamMembersPage';
import { EventsPage } from '../events/EventsPage';
import { EventShowcasePage } from '../events/EventShowcasePage';
import { OrganizationWalletPage } from '../wallet/OrganizationWalletPage';
import { TopUpPage } from '../wallet/TopUpPage';
import { navigateTo, useRouteContext } from '../../hooks/useRouteContext';
import { apiFetch } from '../../lib/api';
import { WalletBalanceSummary } from '../../types';
import { getCountryByCode } from '../../lib/countryUtils';
import {
  Gamepad2,
  Building2,
  Users,
  LogOut,
  ChevronDown,
  Plus,
  Palette,
  Calendar,
  Wallet,
  Check,
  ShieldCheck,
  Menu,
  X,
} from 'lucide-react';
import { NotificationBell } from '../notifications/NotificationBell';
import { LanguageSelector } from '../common/LanguageSelector';
import { useLocalization } from '../../context/LocalizationContext';
import {
  MAIN_NAVIGATION_ITEMS,
  matchesMainSection,
  handleMainTabNavigation,
} from '../../lib/navigation';

export { MAIN_NAVIGATION_ITEMS, matchesMainSection, handleMainTabNavigation };

export const DashboardLayout: React.FC = () => {
  const routeContext = useRouteContext();
  const { t } = useLocalization();
  const {
    currentUser,
    currentOrganization,
    organizations,
    switchOrganization,
    startCreateOrganization,
    logout,
  } = useAuth();

  const getInitialTab = (): 'events' | 'games' | 'team' | 'wallet' | 'wallet-topup' => {
    const path = window.location.pathname;
    if (matchesMainSection(path, '/wallet/top-up')) return 'wallet-topup';
    if (matchesMainSection(path, '/wallet')) return 'wallet';
    if (matchesMainSection(path, '/games')) return 'games';
    if (matchesMainSection(path, '/team')) return 'team';
    if (matchesMainSection(path, '/events')) return 'events';
    return 'events';
  };

  const [activeTab, setActiveTab] = useState<'events' | 'games' | 'team' | 'wallet' | 'wallet-topup'>(() => getInitialTab());
  const [showOrgDropdown, setShowOrgDropdown] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [wallet, setWallet] = useState<WalletBalanceSummary | null>(null);
  const [loadingWallet, setLoadingWallet] = useState<boolean>(true);
  const [walletError, setWalletError] = useState<boolean>(false);

  const ownedOrgsCount = organizations.filter((o) => o.role === 'owner').length;
  const isOrgLimitReached = ownedOrgsCount >= 5;

  const headerRef = useRef<HTMLElement | null>(null);

  // Close dropdowns on outside click or escape key
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (headerRef.current && !headerRef.current.contains(event.target as Node)) {
        setShowOrgDropdown(false);
        setShowUserDropdown(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowOrgDropdown(false);
        setShowUserDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Fetch current organization's wallet balance from existing Wallet Engine
  const fetchWallet = useCallback(async (resetState: boolean = false) => {
    if (!currentOrganization?.id) {
      setWallet(null);
      setLoadingWallet(false);
      setWalletError(false);
      return;
    }

    try {
      if (resetState) {
        setWallet(null);
      }
      setLoadingWallet(true);
      setWalletError(false);
      const res = await apiFetch(`/api/organizations/${currentOrganization.id}/wallet`);
      if (res.ok) {
        const data = await res.json();
        setWallet(data.wallet || null);
        setWalletError(false);
      } else {
        console.error('Failed to load organization wallet:', await res.text());
        setWalletError(true);
      }
    } catch (err) {
      console.error('Failed to load organization wallet:', err);
      setWalletError(true);
    } finally {
      setLoadingWallet(false);
    }
  }, [currentOrganization?.id]);

  // When organization changes, trigger a fresh fetch and reset previous org balance
  useEffect(() => {
    fetchWallet(true);
  }, [fetchWallet]);

  // Listen for custom wallet_updated events from event mutations & payments
  useEffect(() => {
    const handleWalletUpdated = () => {
      fetchWallet(false);
    };
    window.addEventListener('wallet_updated', handleWalletUpdated);
    return () => window.removeEventListener('wallet_updated', handleWalletUpdated);
  }, [fetchWallet]);

  // Sync tab with browser URL history and route changes
  useEffect(() => {
    const path = routeContext.pathname || window.location.pathname;
    if (matchesMainSection(path, '/wallet/top-up')) {
      setActiveTab('wallet-topup');
    } else if (matchesMainSection(path, '/wallet')) {
      setActiveTab('wallet');
    } else if (matchesMainSection(path, '/games')) {
      setActiveTab('games');
    } else if (matchesMainSection(path, '/team')) {
      setActiveTab('team');
    } else if (matchesMainSection(path, '/events')) {
      setActiveTab('events');
    }
  }, [routeContext.pathname]);

  const currentPath = routeContext.pathname || (typeof window !== 'undefined' ? window.location.pathname : '/');

  /**
   * Main Navigation Handler:
   * 1. Active state only controls styling.
   * 2. Clicking a main navigation tab always navigates to that tab's root landing route.
   * 3. Never use logic like `if (isActive) return;` to prevent navigation.
   * 4. If already on the root landing route, remain there while resetting nested states.
   * 5. If on a nested route, navigate to the root route.
   */
  const handleNavigation = (href: string) => {
    handleMainTabNavigation(href);
  };

  const handleTabChange = (tab: 'events' | 'games' | 'team' | 'wallet' | 'wallet-topup') => {
    setActiveTab(tab);
    if (tab === 'events') {
      handleNavigation('/events');
    } else if (tab === 'games') {
      handleNavigation('/games');
    } else if (tab === 'team') {
      handleNavigation('/team');
    } else if (tab === 'wallet') {
      handleNavigation('/wallet');
    } else if (tab === 'wallet-topup') {
      handleNavigation('/wallet/top-up');
    }
  };

  // Helper for formatting currency according to organization's currency
  const formatCurrency = (amount?: number | null, currencyCode: string = 'MYR') => {
    const num = Number(amount) || 0;
    const formatted = num % 1 === 0
      ? num.toLocaleString('en-US')
      : num.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
    const prefix = currencyCode === 'MYR' ? 'RM' : currencyCode === 'USD' ? '$' : currencyCode === 'SGD' ? 'S$' : currencyCode;
    return `${prefix}${formatted}`;
  };

  const currencyCode = wallet?.currency || 'MYR';
  const availableBalanceText = formatCurrency(wallet?.total_balance, currencyCode);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Navigation Bar */}
      <header ref={headerRef} className="bg-slate-900 border-b border-slate-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-2 sm:gap-4">
          {/* Left: Brand + Mobile Toggle */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Mobile Menu Toggle [☰] */}
            <button
              id="dashboard-mobile-nav-btn"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              title="Toggle Navigation Menu"
              className="md:hidden p-2 -ml-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl cursor-pointer shrink-0"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            <button
              onClick={() => navigateTo('/')}
              title="View Public Landing Page"
              className="flex items-center gap-2 group text-left transition-transform focus:outline-none cursor-pointer"
            >
              <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400 group-hover:border-amber-400/60 group-hover:bg-amber-500/20 transition-all">
                <Gamepad2 className="w-5 h-5 group-hover:scale-105 transition-transform" />
              </div>
              <span className="font-bold text-sm tracking-tight text-amber-400 group-hover:text-amber-300 transition-colors">
                Event Game Studio
              </span>
            </button>
          </div>

          {/* Center: Main Navigation (Desktop) */}
          <div className="hidden md:flex items-center gap-1 bg-slate-950 p-1 border border-slate-800 rounded-xl text-xs shrink-0">
            {MAIN_NAVIGATION_ITEMS.map((item) => {
              const isActive = matchesMainSection(currentPath, item.href);
              const Icon = item.icon;
              const label =
                item.id === 'events'
                  ? t('nav.events')
                  : item.id === 'games'
                  ? t('nav.games')
                  : item.id === 'team'
                  ? t('nav.team')
                  : item.id === 'wallet'
                  ? t('nav.wallet')
                  : item.label;
              return (
                <button
                  key={item.id}
                  id={`dashboard-nav-${item.id}`}
                  onClick={() => handleNavigation(item.href)}
                  className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-amber-500 text-slate-950 shadow-md font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>

          {/* Right: Workspace & Account (Organization ▼ | Wallet Balance | User ▼ | Logout) */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            {/* Developer Admin Link (if developer) */}
            {currentUser?.is_developer && (
              <button
                onClick={() => navigateTo('/developer')}
                title="Open Developer Admin"
                className="hidden xl:flex items-center gap-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-colors shadow-sm cursor-pointer"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Dev Admin</span>
              </button>
            )}

            {/* 1. Organization Selector */}
            <div className="relative hidden lg:block">
              <button
                onClick={() => {
                  setShowOrgDropdown(!showOrgDropdown);
                  setShowUserDropdown(false);
                }}
                title="Select Organization Workspace"
                className={`flex items-center gap-1.5 sm:gap-2 bg-slate-950 hover:bg-slate-800 border ${
                  showOrgDropdown ? 'border-amber-500/50 bg-slate-850' : 'border-slate-800'
                } px-2 sm:px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-200 transition-colors cursor-pointer`}
              >
                <Building2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400 shrink-0" />
                <span className="max-w-[75px] xs:max-w-[95px] sm:max-w-[120px] lg:max-w-[150px] truncate">
                  {currentOrganization?.name || 'Select Workspace'}
                </span>
                {currentOrganization?.country_code && (
                  <span className="text-xs shrink-0" title={getCountryByCode(currentOrganization.country_code)?.name}>
                    {getCountryByCode(currentOrganization.country_code)?.flag}
                  </span>
                )}
                {currentOrganization?.role && (
                  <span className="hidden md:inline uppercase text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    {currentOrganization.role}
                  </span>
                )}
                <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${showOrgDropdown ? 'rotate-180' : ''}`} />
              </button>

              {showOrgDropdown && (
                <div className="absolute right-0 sm:left-auto mt-2 w-64 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-2 z-50 space-y-1 animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider font-bold text-slate-500">
                    {t('nav.switchOrg')} ({organizations.length})
                  </div>
                  <div className="max-h-60 overflow-y-auto space-y-1">
                    {organizations.map((org) => (
                      <button
                        key={org.id}
                        onClick={() => {
                          switchOrganization(org.id);
                          setShowOrgDropdown(false);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs text-left transition-colors cursor-pointer ${
                          org.id === currentOrganization?.id
                            ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30'
                            : 'hover:bg-slate-800 text-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          {org.id === currentOrganization?.id && <Check className="w-3 h-3 text-amber-400 shrink-0" />}
                          {org.country_code && (
                            <span className="text-xs shrink-0" title={getCountryByCode(org.country_code)?.name}>
                              {getCountryByCode(org.country_code)?.flag}
                            </span>
                          )}
                          <span className="truncate">{org.name}</span>
                        </div>
                        <span className="uppercase text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono shrink-0">
                          {org.role}
                        </span>
                      </button>
                    ))}
                  </div>

                  <div className="border-t border-slate-800 pt-1 mt-1">
                    {isOrgLimitReached ? (
                      <div
                        id="org-dropdown-limit-notice"
                        className="px-3 py-2 text-[11px] text-slate-400 bg-slate-950/60 rounded-xl flex items-center justify-between"
                        title="You have reached the maximum of 5 owned organizations allowed per account."
                      >
                        <span className="flex items-center gap-1.5 text-slate-400">
                          <Building2 className="w-3.5 h-3.5 text-slate-500" />
                          <span>Max 5 Orgs Reached</span>
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-amber-400 font-bold">
                          {ownedOrgsCount}/5
                        </span>
                      </div>
                    ) : (
                      <button
                        id="create-new-org-btn"
                        type="button"
                        onClick={() => {
                          setShowOrgDropdown(false);
                          startCreateOrganization();
                        }}
                        className="w-full flex items-center justify-between px-3 py-2 text-xs text-amber-400 hover:bg-slate-800 rounded-xl transition-colors font-medium cursor-pointer text-left"
                      >
                        <span className="flex items-center gap-2">
                          <Plus className="w-4 h-4" />
                          <span>{t('nav.createOrg')}</span>
                        </span>
                        <span className="text-[10px] font-mono text-slate-500">
                          {ownedOrgsCount}/5
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* 2. Organization Available Balance Button [ Balance RM6,000 ] */}
            <button
              onClick={() => handleTabChange('wallet')}
              title={`Organization Balance (${currentOrganization?.name || 'Workspace'}) - Click to view wallet details`}
              className={`flex items-center gap-1.5 sm:gap-2 bg-slate-950 hover:bg-slate-800 border ${
                activeTab === 'wallet' || activeTab === 'wallet-topup'
                  ? 'border-amber-500 bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/40 shadow-sm'
                  : 'border-slate-800 hover:border-slate-700 text-slate-200'
              } px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold transition-all group cursor-pointer shrink-0`}
            >
              <Wallet className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${activeTab === 'wallet' ? 'text-amber-300' : 'text-amber-400'} group-hover:scale-105 transition-transform shrink-0`} />
              
              {loadingWallet && !wallet && !walletError ? (
                <span className="flex items-center gap-1.5 text-xs text-amber-400/80">
                  <span className="text-slate-400 font-sans font-medium hidden sm:inline">{t('payment.balance')}</span>
                  <span className="inline-flex items-center gap-1 text-slate-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                    <span className="text-[11px] font-mono">...</span>
                  </span>
                </span>
              ) : walletError && !wallet ? (
                <span className="flex items-center gap-1 text-xs text-slate-400 whitespace-nowrap">
                  <span className="text-slate-400 font-sans font-medium hidden sm:inline">{t('payment.balance')}</span>
                  <span className="text-rose-400/90 font-medium">{t('common.na')}</span>
                </span>
              ) : wallet ? (
                <span className="flex items-center gap-1.5 text-xs font-bold whitespace-nowrap">
                  <span className="text-slate-400 font-sans font-medium hidden sm:inline">{t('payment.balance')}</span>
                  <span className="font-mono text-amber-400 font-bold">{formatCurrency(wallet.total_balance, currencyCode)}</span>
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs text-slate-400 whitespace-nowrap">
                  <span className="text-slate-400 font-sans font-medium hidden sm:inline">{t('payment.balance')}</span>
                  <span>{t('common.na')}</span>
                </span>
              )}
            </button>

            {/* Language Selector */}
            <LanguageSelector variant="standard" />

            {/* Notification Bell */}
            <NotificationBell />

            {/* 3. User Name Dropdown */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowUserDropdown(!showUserDropdown);
                  setShowOrgDropdown(false);
                }}
                title="Account profile and settings"
                className={`flex items-center gap-1.5 sm:gap-2 bg-slate-950 hover:bg-slate-800 border ${
                  showUserDropdown ? 'border-amber-500/50 bg-slate-850' : 'border-slate-800'
                } px-2 sm:px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-200 transition-colors cursor-pointer`}
              >
                <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-amber-500/20 border border-amber-500/30 overflow-hidden flex items-center justify-center font-bold text-amber-300 text-[10px] sm:text-xs shrink-0">
                  {currentUser?.avatar_url ? (
                    <img src={currentUser.avatar_url} alt={currentUser.name} className="w-full h-full object-cover" />
                  ) : (
                    currentUser?.name?.charAt(0).toUpperCase() || 'U'
                  )}
                </div>
                <span className="font-semibold text-slate-200 max-w-[70px] sm:max-w-[100px] lg:max-w-[120px] truncate hidden sm:inline">
                  {currentUser?.name}
                </span>
                <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${showUserDropdown ? 'rotate-180' : ''}`} />
              </button>

              {showUserDropdown && (
                <div className="absolute right-0 mt-2 w-60 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-3 z-50 space-y-2.5 animate-in fade-in zoom-in-95 duration-150">
                  <div className="flex items-center gap-2.5 px-1 py-1 border-b border-slate-800 pb-2.5">
                    <div className="w-9 h-9 rounded-full bg-amber-500/20 border border-amber-500/30 overflow-hidden flex items-center justify-center font-bold text-amber-300 shrink-0">
                      {currentUser?.avatar_url ? (
                        <img src={currentUser.avatar_url} alt={currentUser.name} className="w-full h-full object-cover" />
                      ) : (
                        currentUser?.name?.charAt(0).toUpperCase() || 'U'
                      )}
                    </div>
                    <div className="overflow-hidden">
                      <div className="text-xs font-bold text-slate-100 truncate">{currentUser?.name}</div>
                      <div className="text-[11px] text-slate-400 truncate">{currentUser?.email}</div>
                    </div>
                  </div>

                  <div className="px-1 text-[11px] text-slate-400 flex items-center justify-between">
                    <span>{t('common.role')}:</span>
                    <span className="uppercase text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      {currentOrganization?.role || 'Member'}
                    </span>
                  </div>

                  <button
                    onClick={() => {
                      setShowUserDropdown(false);
                      handleTabChange('wallet');
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-amber-400 hover:bg-amber-500/10 rounded-xl transition-colors font-medium border border-amber-500/20 cursor-pointer"
                  >
                    <Wallet className="w-4 h-4" />
                    <span>{t('payment.wallet')}</span>
                  </button>

                  {currentUser?.is_developer && (
                    <button
                      onClick={() => {
                        setShowUserDropdown(false);
                        navigateTo('/developer');
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-emerald-400 hover:bg-emerald-500/10 rounded-xl transition-colors font-medium border border-emerald-500/20 cursor-pointer"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      <span>{t('nav.developer')}</span>
                    </button>
                  )}

                  <div className="border-t border-slate-800 pt-1.5">
                    <button
                      onClick={() => {
                        setShowUserDropdown(false);
                        logout();
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors font-medium cursor-pointer"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>{t('nav.logout')}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 4. Logout Button */}
            <button
              onClick={logout}
              title={t('nav.logout')}
              className="hidden sm:flex p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors cursor-pointer shrink-0"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div
            id="dashboard-mobile-nav-drawer"
            className="md:hidden px-4 py-3 bg-slate-950/98 border-t border-slate-800 space-y-3 animate-in slide-in-from-top-2 duration-150"
          >
            <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-900 border border-slate-800 rounded-xl text-xs">
              {MAIN_NAVIGATION_ITEMS.map((item) => {
                const isActive = matchesMainSection(currentPath, item.href);
                const Icon = item.icon;
                const label =
                  item.id === 'events'
                    ? t('nav.events')
                    : item.id === 'games'
                    ? t('nav.games')
                    : item.id === 'team'
                    ? t('nav.team')
                    : item.id === 'wallet'
                    ? t('nav.wallet')
                    : item.label;
                return (
                  <button
                    key={item.id}
                    id={`mobile-nav-${item.id}`}
                    onClick={() => {
                      handleNavigation(item.href);
                      setMobileMenuOpen(false);
                    }}
                    className={`flex items-center justify-center gap-1.5 py-2 rounded-lg font-semibold transition-all cursor-pointer ${
                      isActive
                        ? 'bg-amber-500 text-slate-950 font-bold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>

            {/* Mobile Workspace & Balance Row */}
            <div className="flex items-center justify-between gap-2 p-2.5 bg-slate-900/80 border border-slate-800 rounded-xl text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <Building2 className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="font-semibold text-slate-200 truncate">
                  {currentOrganization?.name || 'My Workspace'}
                </span>
              </div>

              <button
                onClick={() => {
                  handleTabChange('wallet');
                  setMobileMenuOpen(false);
                }}
                className="flex items-center gap-1 px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-lg text-xs font-bold text-amber-300 shrink-0 cursor-pointer"
              >
                <Wallet className="w-3.5 h-3.5" />
                <span>{availableBalanceText}</span>
              </button>
            </div>

            {/* Mobile Actions */}
            <div className="flex items-center justify-between pt-1 border-t border-slate-800/80 text-xs">
              {currentUser?.is_developer && (
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    navigateTo('/developer');
                  }}
                  className="flex items-center gap-1.5 text-emerald-400 font-semibold p-1 cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>{t('nav.developer')}</span>
                </button>
              )}

              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  logout();
                }}
                className="flex items-center gap-1.5 text-rose-400 font-semibold ml-auto p-1 cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>{t('nav.logout')}</span>
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Main Content Body */}
      <main className="flex-1 py-6">
        {routeContext.isShowcaseRoute && routeContext.eventId ? (
          <EventShowcasePage eventId={routeContext.eventId} />
        ) : (
          <>
            {activeTab === 'events' && <EventsPage />}
            {activeTab === 'games' && <GamesPage />}
            {activeTab === 'team' && <TeamMembersPage />}
            {activeTab === 'wallet' && (
              <OrganizationWalletPage
                onNavigateTab={handleTabChange}
                onNavigateToTopUp={() => handleTabChange('wallet-topup')}
              />
            )}
            {activeTab === 'wallet-topup' && (
              <TopUpPage
                onBackToWallet={() => handleTabChange('wallet')}
                onNavigateTab={handleTabChange}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
};

