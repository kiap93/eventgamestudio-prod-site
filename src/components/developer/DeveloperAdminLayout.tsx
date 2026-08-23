import React, { useState } from 'react';
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
} from 'lucide-react';

interface DeveloperAdminLayoutProps {
  children: React.ReactNode;
  activeSection?: 'games' | 'stats' | 'themes' | 'showcases' | 'pricing';
}

export const DeveloperAdminLayout: React.FC<DeveloperAdminLayoutProps> = ({
  children,
  activeSection = 'games',
}) => {
  const { currentUser, currentOrganization, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

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
            DEVELOPER ADMIN PLATFORM
          </span>
          <span className="hidden sm:inline text-slate-500">|</span>
          <span className="hidden sm:inline text-slate-400 text-[11px]">
            Game Catalog, Themes & Showcase Reviews
          </span>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => navigateTo('/studio')}
            className="flex items-center space-x-1 text-emerald-400 hover:text-emerald-300 font-semibold text-[11px] hover:underline cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Return to Studio Workspace</span>
          </button>
        </div>
      </div>

      {/* Main Developer Header */}
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Left Brand Identity */}
          <div className="flex items-center space-x-6">
            <div
              className="flex items-center space-x-3 cursor-pointer group"
              onClick={() => navigateTo('/developer')}
            >
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-slate-950 shadow-lg shadow-emerald-950/40 group-hover:scale-105 transition-transform">
                <Code2 className="w-5 h-5 stroke-[2.5]" />
              </div>
              <div>
                <span className="text-base font-black text-white tracking-tight flex items-center">
                  DevAdmin <span className="text-emerald-400 ml-1">Platform</span>
                </span>
                <span className="text-[10px] font-mono text-slate-400 block -mt-0.5">
                  GAMES, THEMES & REVIEWS
                </span>
              </div>
            </div>

            {/* Desktop Navigation Links */}
            <nav className="hidden md:flex items-center space-x-2 border-l border-slate-800 pl-6">
              <button
                onClick={() => navigateTo('/developer')}
                className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                  activeSection === 'games'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Gamepad2 className="w-4 h-4" />
                <span>Games & System Themes</span>
              </button>

              <button
                onClick={() => navigateTo('/developer/showcases')}
                className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                  activeSection === 'showcases'
                    ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Gift className="w-4 h-4 text-amber-400" />
                <span>Showcase Reviews (RM300)</span>
              </button>

              <button
                onClick={() => navigateTo('/developer/pricing')}
                className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                  activeSection === 'pricing'
                    ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Coins className="w-4 h-4 text-cyan-400" />
                <span>Event Pricing Control</span>
              </button>
            </nav>
          </div>

          {/* Right Controls & User Info */}
          <div className="flex items-center space-x-3">
            {/* Active Org Context Badge */}
            {currentOrganization && (
              <div className="hidden lg:flex items-center space-x-2 px-3 py-1.5 bg-slate-950 rounded-xl border border-slate-800 text-xs">
                <span className="text-slate-500">Org:</span>
                <span className="text-slate-300 font-semibold">{currentOrganization.name}</span>
              </div>
            )}

            {/* Current Developer User */}
            <div className="flex items-center space-x-2.5 px-3 py-1.5 bg-slate-800/80 rounded-xl border border-slate-700/80 text-xs">
              <div className="w-6 h-6 rounded-full bg-emerald-600/30 text-emerald-400 flex items-center justify-center font-bold">
                {currentUser?.name?.charAt(0) || 'D'}
              </div>
              <div className="hidden sm:block text-left">
                <span className="text-white font-semibold block leading-tight">{currentUser?.name}</span>
                <span className="text-[10px] text-emerald-400 font-mono">developer_admin</span>
              </div>
            </div>

            {/* Logout / Exit */}
            <button
              onClick={logout}
              className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors cursor-pointer"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 md:hidden text-slate-400 hover:text-white rounded-xl"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-800 bg-slate-900 px-4 py-3 space-y-2">
            <button
              onClick={() => {
                navigateTo('/developer');
                setMobileMenuOpen(false);
              }}
              className="w-full flex items-center space-x-2 px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
            >
              <Gamepad2 className="w-4 h-4" />
              <span>Games & Themes</span>
            </button>

            <button
              onClick={() => {
                navigateTo('/developer/showcases');
                setMobileMenuOpen(false);
              }}
              className="w-full flex items-center space-x-2 px-3 py-2 rounded-xl text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20"
            >
              <Gift className="w-4 h-4" />
              <span>Showcase Reviews</span>
            </button>

            <button
              onClick={() => {
                navigateTo('/developer/pricing');
                setMobileMenuOpen(false);
              }}
              className="w-full flex items-center space-x-2 px-3 py-2 rounded-xl text-xs font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
            >
              <Coins className="w-4 h-4" />
              <span>Event Pricing Control</span>
            </button>

            <button
              onClick={() => {
                navigateTo('/studio');
                setMobileMenuOpen(false);
              }}
              className="w-full flex items-center space-x-2 px-3 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-800"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Return to Studio</span>
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
