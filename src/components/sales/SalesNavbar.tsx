import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { navigateTo, useRouteContext } from '../../hooks/useRouteContext';
import { useLocalization } from '../../context/LocalizationContext';
import {
  Gamepad2,
  Building2,
  ShieldCheck,
  LogOut,
  Menu,
  X,
  ExternalLink,
  ChevronRight,
  Sparkles,
  Share2,
  Coins,
  Users,
} from 'lucide-react';

interface SalesNavbarProps {
  activeSection?: 'games' | 'portal' | 'referrals' | 'commissions' | 'customers';
}

export const SalesNavbar: React.FC<SalesNavbarProps> = ({ activeSection = 'games' }) => {
  const { t } = useLocalization();
  const { currentUser, salesPartnerStatus, currentOrganization, logout } = useAuth();
  const routeContext = useRouteContext();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 bg-slate-950/90 backdrop-blur-md border-b border-slate-800 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          {/* Left: Brand & Portal Badge */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => navigateTo('/sales')}
              className="flex items-center gap-2.5 text-left group cursor-pointer shrink-0"
              title="Sales Partner Portal"
            >
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-400 flex items-center justify-center text-slate-950 font-black shadow-md shadow-amber-500/10 group-hover:scale-105 transition-transform">
                <Gamepad2 className="w-5 h-5 text-slate-950" />
              </div>
              <div className="hidden sm:block">
                <div className="text-sm font-extrabold text-white tracking-tight flex items-center gap-1.5">
                  <span>Event Game Studio</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    Partner
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 font-medium">Sales Partner Portal</div>
              </div>
            </button>

            {/* Desktop Navigation Tabs */}
            <nav className="hidden md:flex items-center gap-1 ml-6 border-l border-slate-800 pl-6">
              <button
                onClick={() => navigateTo('/sales')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeSection === 'portal'
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-900'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Dashboard</span>
              </button>
              <button
                onClick={() => navigateTo('/sales/customers')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeSection === 'customers'
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-900'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Customers</span>
              </button>
              <button
                onClick={() => navigateTo('/sales/referrals')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeSection === 'referrals'
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-900'
                }`}
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Referrals</span>
              </button>
              <button
                onClick={() => navigateTo('/sales/commissions')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeSection === 'commissions'
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-900'
                }`}
              >
                <Coins className="w-3.5 h-3.5" />
                <span>Commissions & Payouts</span>
              </button>
              <button
                onClick={() => navigateTo('/sales/games')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeSection === 'games'
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-900'
                }`}
              >
                <Gamepad2 className="w-3.5 h-3.5" />
                <span>Game Catalogue</span>
              </button>
            </nav>
          </div>

          {/* Right: Partner Info & Customer Workspace Switch */}
          <div className="hidden md:flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs text-slate-300">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-slate-400">Partner:</span>
              <span className="font-medium text-slate-200 font-mono truncate max-w-[160px]">
                {currentUser?.email || 'Active Partner'}
              </span>
            </div>

            <button
              onClick={() => navigateTo('/events')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-750 text-xs font-semibold text-slate-200 hover:text-white transition-all cursor-pointer"
              title="Return to Customer Organization Workspace"
            >
              <Building2 className="w-3.5 h-3.5 text-amber-400" />
              <span>Customer Workspace</span>
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </button>

            <button
              onClick={() => logout && logout()}
              className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors cursor-pointer shrink-0"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>

          {/* Mobile Menu Button */}
          <div className="flex md:hidden items-center gap-2">
            <button
              onClick={() => navigateTo('/events')}
              className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-200"
            >
              Workspace
            </button>
            <button
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-900 border border-slate-800"
              aria-label="Toggle Menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden px-4 py-3 bg-slate-950 border-t border-slate-800 space-y-2">
          <div className="grid grid-cols-5 gap-1 text-[11px]">
            <button
              onClick={() => {
                navigateTo('/sales');
                setMobileMenuOpen(false);
              }}
              className={`flex flex-col items-center justify-center gap-1 py-2 rounded-lg font-semibold cursor-pointer ${
                activeSection === 'portal'
                  ? 'bg-amber-500 text-slate-950 font-bold'
                  : 'bg-slate-900 text-slate-300'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Dashboard</span>
            </button>
            <button
              onClick={() => {
                navigateTo('/sales/customers');
                setMobileMenuOpen(false);
              }}
              className={`flex flex-col items-center justify-center gap-1 py-2 rounded-lg font-semibold cursor-pointer ${
                activeSection === 'customers'
                  ? 'bg-amber-500 text-slate-950 font-bold'
                  : 'bg-slate-900 text-slate-300'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Customers</span>
            </button>
            <button
              onClick={() => {
                navigateTo('/sales/referrals');
                setMobileMenuOpen(false);
              }}
              className={`flex flex-col items-center justify-center gap-1 py-2 rounded-lg font-semibold cursor-pointer ${
                activeSection === 'referrals'
                  ? 'bg-amber-500 text-slate-950 font-bold'
                  : 'bg-slate-900 text-slate-300'
              }`}
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Referrals</span>
            </button>
            <button
              onClick={() => {
                navigateTo('/sales/commissions');
                setMobileMenuOpen(false);
              }}
              className={`flex flex-col items-center justify-center gap-1 py-2 rounded-lg font-semibold cursor-pointer ${
                activeSection === 'commissions'
                  ? 'bg-amber-500 text-slate-950 font-bold'
                  : 'bg-slate-900 text-slate-300'
              }`}
            >
              <Coins className="w-3.5 h-3.5" />
              <span>Commissions</span>
            </button>
            <button
              onClick={() => {
                navigateTo('/sales/games');
                setMobileMenuOpen(false);
              }}
              className={`flex flex-col items-center justify-center gap-1 py-2 rounded-lg font-semibold cursor-pointer ${
                activeSection === 'games'
                  ? 'bg-amber-500 text-slate-950 font-bold'
                  : 'bg-slate-900 text-slate-300'
              }`}
            >
              <Gamepad2 className="w-3.5 h-3.5" />
              <span>Games</span>
            </button>
          </div>

          <div className="pt-2 border-t border-slate-900 flex items-center justify-between text-xs text-slate-400">
            <span className="truncate max-w-[200px]">{currentUser?.email}</span>
            <button
              onClick={() => logout && logout()}
              className="text-rose-400 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
