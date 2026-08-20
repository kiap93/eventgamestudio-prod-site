import React from 'react';
import { Gamepad2, ArrowUpRight, ShieldCheck, Sparkles } from 'lucide-react';
import { navigateTo } from '../../hooks/useRouteContext';
import { useAuth } from '../../context/AuthContext';

export const LandingFooter: React.FC = () => {
  const { isAuthenticated, currentUser } = useAuth();

  return (
    <footer className="w-full bg-slate-950 border-t border-slate-900 text-slate-400 text-xs py-12 md:py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 pb-8 border-b border-slate-900">
          {/* Brand Info */}
          <div className="md:col-span-2 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
                <Gamepad2 className="w-5 h-5" />
              </div>
              <span className="text-base font-black text-slate-100 tracking-tight">
                EventGameStudio
              </span>
            </div>
            <p className="text-slate-400 text-xs leading-relaxed max-w-md">
              The premier interactive event gaming platform. Create branded arcade games, custom themes, and live stage leaderboards for corporate summits, product launches, exhibitions, and brand activations.
            </p>
            <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Interactive Games for Events</span>
            </div>
          </div>

          {/* Quick Platform Links */}
          <div className="space-y-3">
            <div className="text-[11px] uppercase tracking-wider font-bold text-slate-200">
              Platform
            </div>
            <ul className="space-y-2 text-xs">
              <li>
                <button
                  onClick={() => navigateTo(isAuthenticated ? '/events' : '/login')}
                  className="hover:text-amber-400 transition-colors flex items-center gap-1 text-left"
                >
                  <span>Events Dashboard</span>
                  <ArrowUpRight className="w-3 h-3 text-slate-600" />
                </button>
              </li>
              <li>
                <button
                  onClick={() => navigateTo(isAuthenticated ? '/game-themes' : '/login')}
                  className="hover:text-amber-400 transition-colors flex items-center gap-1 text-left"
                >
                  <span>Theme Customizer</span>
                  <ArrowUpRight className="w-3 h-3 text-slate-600" />
                </button>
              </li>
              <li>
                <button
                  onClick={() => navigateTo(isAuthenticated ? '/team' : '/login')}
                  className="hover:text-amber-400 transition-colors flex items-center gap-1 text-left"
                >
                  <span>Team Workspaces</span>
                  <ArrowUpRight className="w-3 h-3 text-slate-600" />
                </button>
              </li>
            </ul>
          </div>

          {/* Access & Developer */}
          <div className="space-y-3">
            <div className="text-[11px] uppercase tracking-wider font-bold text-slate-200">
              Access
            </div>
            <ul className="space-y-2 text-xs">
              {isAuthenticated ? (
                <>
                  <li>
                    <button
                      onClick={() => navigateTo('/events')}
                      className="hover:text-amber-400 transition-colors text-left"
                    >
                      Studio App
                    </button>
                  </li>
                  {currentUser?.is_developer && (
                    <li>
                      <button
                        onClick={() => navigateTo('/developer')}
                        className="hover:text-emerald-400 text-emerald-500/90 font-medium transition-colors text-left"
                      >
                        Developer Admin
                      </button>
                    </li>
                  )}
                </>
              ) : (
                <li>
                  <button
                    onClick={() => navigateTo('/login')}
                    className="hover:text-amber-400 transition-colors text-left"
                  >
                    Organizer Sign In
                  </button>
                </li>
              )}
              <li className="pt-2">
                <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-[10px] text-slate-400">
                  <ShieldCheck className="w-3 h-3 text-emerald-400" />
                  <span>Enterprise Ready</span>
                </div>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-slate-500">
          <div>
            © {new Date().getFullYear()} EventGameStudio. All rights reserved.
          </div>
          <div className="flex items-center gap-6">
            <span>Make Your Events Playable.</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
