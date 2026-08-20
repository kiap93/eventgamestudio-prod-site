import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { GameCustomizerPage } from '../studio/GameCustomizerPage';
import { TeamMembersPage } from '../org/TeamMembersPage';
import { EventsPage } from '../events/EventsPage';
import { EventShowcasePage } from '../events/EventShowcasePage';
import { navigateTo, useRouteContext } from '../../hooks/useRouteContext';
import {
  Gamepad2,
  Building2,
  Users,
  LogOut,
  ChevronDown,
  Plus,
  Palette,
  Calendar,
} from 'lucide-react';

export const DashboardLayout: React.FC = () => {
  const routeContext = useRouteContext();
  const {
    currentUser,
    currentOrganization,
    organizations,
    switchOrganization,
    logout,
  } = useAuth();


  const getInitialTab = (): 'events' | 'customizer' | 'team' => {
    const path = window.location.pathname;
    if (path === '/events' || path.startsWith('/events')) return 'events';
    if (path === '/team') return 'team';
    if (path.startsWith('/game-themes') || path === '/studio') return 'customizer';
    return 'events';
  };

  const [activeTab, setActiveTab] = useState<'events' | 'customizer' | 'team'>(() => getInitialTab());
  const [showOrgDropdown, setShowOrgDropdown] = useState(false);

  // Sync tab with browser URL history
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      if (path === '/events' || path.startsWith('/events')) {
        setActiveTab('events');
      } else if (path === '/team') {
        setActiveTab('team');
      } else if (path.startsWith('/game-themes') || path === '/studio') {
        setActiveTab('customizer');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleTabChange = (tab: 'events' | 'customizer' | 'team') => {
    setActiveTab(tab);
    if (tab === 'events') {
      if (window.location.pathname !== '/events') {
        navigateTo('/events');
      }
    } else if (tab === 'customizer') {
      if (!window.location.pathname.startsWith('/game-themes')) {
        navigateTo('/game-themes');
      }
    } else if (tab === 'team') {
      if (window.location.pathname !== '/team') {
        navigateTo('/team');
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Navigation Bar */}
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          {/* Brand & Organization Selector */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigateTo('/')}
              title="View Public Landing Page"
              className="flex items-center gap-2 group text-left transition-transform focus:outline-none"
            >
              <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400 group-hover:border-amber-400/60 group-hover:bg-amber-500/20 transition-all">
                <Gamepad2 className="w-5 h-5 group-hover:scale-105 transition-transform" />
              </div>
              <span className="font-bold text-sm tracking-tight text-amber-400 hidden sm:inline group-hover:text-amber-300 transition-colors">
                Event Game Studio
              </span>
            </button>

            {/* Organization Switcher Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowOrgDropdown(!showOrgDropdown)}
                className="flex items-center gap-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-200 transition-colors"
              >
                <Building2 className="w-4 h-4 text-amber-400" />
                <span className="max-w-[140px] truncate">{currentOrganization?.name || 'Select Workspace'}</span>
                {currentOrganization?.role && (
                  <span className="uppercase text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    {currentOrganization.role}
                  </span>
                )}
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {showOrgDropdown && (
                <div className="absolute left-0 mt-2 w-64 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-2 z-50 space-y-1">
                  <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider font-bold text-slate-500">
                    Your Organizations ({organizations.length})
                  </div>
                  {organizations.map((org) => (
                    <button
                      key={org.id}
                      onClick={() => {
                        switchOrganization(org.id);
                        setShowOrgDropdown(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs text-left transition-colors ${
                        org.id === currentOrganization?.id
                          ? 'bg-amber-500/20 text-amber-300 font-bold'
                          : 'hover:bg-slate-800 text-slate-300'
                      }`}
                    >
                      <span className="truncate">{org.name}</span>
                      <span className="uppercase text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                        {org.role}
                      </span>
                    </button>
                  ))}

                  <div className="border-t border-slate-800 pt-1 mt-1">
                    <a
                      href="/create-organization"
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-amber-400 hover:bg-slate-800 rounded-xl transition-colors font-medium"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Create New Organization</span>
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 border border-slate-800 rounded-xl text-xs">
            <button
              onClick={() => handleTabChange('events')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-semibold transition-all ${
                activeTab === 'events'
                  ? 'bg-amber-500 text-slate-950 shadow-md font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Events</span>
            </button>

            <button
              onClick={() => handleTabChange('customizer')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-semibold transition-all ${
                activeTab === 'customizer'
                  ? 'bg-amber-500 text-slate-950 shadow-md font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Palette className="w-3.5 h-3.5" />
              <span>Game Themes</span>
            </button>

            <button
              onClick={() => handleTabChange('team')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-semibold transition-all ${
                activeTab === 'team'
                  ? 'bg-amber-500 text-slate-950 shadow-md font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Team</span>
            </button>
          </div>

          {/* Developer Admin Link & User Profile & Sign Out */}
          <div className="flex items-center gap-3">
            {currentUser?.is_developer && (
              <button
                onClick={() => navigateTo('/developer')}
                title="Open Developer Admin"
                className="flex items-center gap-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors shadow-sm"
              >
                <Gamepad2 className="w-3.5 h-3.5" />
                <span>Dev Admin</span>
              </button>
            )}

            <div className="hidden sm:flex items-center gap-2 text-xs">
              <div className="w-7 h-7 rounded-full bg-amber-500/20 border border-amber-500/30 overflow-hidden flex items-center justify-center font-bold text-amber-300">
                {currentUser?.avatar_url ? (
                  <img src={currentUser.avatar_url} alt={currentUser.name} className="w-full h-full object-cover" />
                ) : (
                  currentUser?.name.charAt(0).toUpperCase()
                )}
              </div>
              <span className="font-semibold text-slate-200 max-w-[100px] truncate">{currentUser?.name}</span>
            </div>

            <button
              onClick={logout}
              title="Sign Out"
              className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Body */}
      <main className="flex-1 py-6">
        {routeContext.isShowcaseRoute && routeContext.eventId ? (
          <EventShowcasePage eventId={routeContext.eventId} />
        ) : (
          <>
            {activeTab === 'events' && <EventsPage />}
            {activeTab === 'customizer' && <GameCustomizerPage />}
            {activeTab === 'team' && <TeamMembersPage />}
          </>
        )}
      </main>
    </div>
  );
};
