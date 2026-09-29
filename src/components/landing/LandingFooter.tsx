import React from 'react';
import { Gamepad2, ArrowUpRight, ShieldCheck, Sparkles, MessageSquare, Phone } from 'lucide-react';
import { navigateTo } from '../../hooks/useRouteContext';
import { useAuth } from '../../context/AuthContext';
import { usePlatformContactSettings } from '../../hooks/usePlatformContactSettings';
import { APP_VERSION } from '../../types';

export const LandingFooter: React.FC = () => {
  const { isAuthenticated, currentUser } = useAuth();
  const { whatsappDisplay, whatsappUrl, officeLocation } = usePlatformContactSettings();

  return (
    <footer className="w-full bg-slate-50 border-t border-slate-200 text-slate-600 text-xs py-12 md:py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-8 pb-10 border-b border-slate-200">
          {/* 1. Brand Info */}
          <div className="sm:col-span-2 md:col-span-1 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-600">
                <Gamepad2 className="w-5 h-5" />
              </div>
              <span className="text-base font-black text-slate-900 tracking-tight">
                EventGameStudio
              </span>
            </div>
            <p className="text-slate-600 text-xs leading-relaxed max-w-sm">
              The premier interactive event gaming platform. Create branded arcade games, custom themes, and live stage leaderboards for corporate summits, product launches, exhibitions, and brand activations.
            </p>
            <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Interactive Games for Events</span>
            </div>
          </div>

          {/* 2. Event Solutions */}
          <div className="space-y-3">
            <div className="text-[11px] uppercase tracking-wider font-bold text-slate-900">
              Event Solutions
            </div>
            <ul className="space-y-2 text-xs">
              <li>
                <button
                  onClick={() => navigateTo('/interactive-event-games')}
                  className="hover:text-amber-600 transition-colors text-left cursor-pointer"
                >
                  Interactive Event Games
                </button>
              </li>
              <li>
                <button
                  onClick={() => navigateTo('/corporate-event-games')}
                  className="hover:text-amber-600 transition-colors text-left cursor-pointer"
                >
                  Corporate Event Games
                </button>
              </li>
              <li>
                <button
                  onClick={() => navigateTo('/brand-activation-games')}
                  className="hover:text-amber-600 transition-colors text-left cursor-pointer"
                >
                  Brand Activation Games
                </button>
              </li>
              <li>
                <button
                  onClick={() => navigateTo('/roadshow-games')}
                  className="hover:text-amber-600 transition-colors text-left cursor-pointer"
                >
                  Roadshow Games
                </button>
              </li>
              <li>
                <button
                  onClick={() => navigateTo('/exhibition-games')}
                  className="hover:text-amber-600 transition-colors text-left cursor-pointer"
                >
                  Exhibition & Booth Games
                </button>
              </li>
              <li>
                <button
                  onClick={() => navigateTo('/event-mini-games')}
                  className="hover:text-amber-600 transition-colors text-left cursor-pointer"
                >
                  Event Mini-Games
                </button>
              </li>
              <li>
                <button
                  onClick={() => navigateTo('/branded-event-games')}
                  className="hover:text-amber-600 transition-colors text-left cursor-pointer"
                >
                  Branded Event Games
                </button>
              </li>
              <li>
                <button
                  onClick={() => navigateTo('/digital-event-games')}
                  className="hover:text-amber-600 transition-colors text-left cursor-pointer"
                >
                  Digital Event Games
                </button>
              </li>
            </ul>
          </div>

          {/* 3. Event Games */}
          <div className="space-y-3">
            <div className="text-[11px] uppercase tracking-wider font-bold text-slate-900">
              Game Engines
            </div>
            <ul className="space-y-2 text-xs">
              <li>
                <button
                  onClick={() => navigateTo('/games')}
                  className="hover:text-amber-600 transition-colors text-left cursor-pointer font-bold text-slate-900 flex items-center gap-1"
                >
                  <span>All Games Catalog</span>
                  <ArrowUpRight className="w-3 h-3 text-slate-400" />
                </button>
              </li>
              <li>
                <button
                  onClick={() => navigateTo('/games/catch-the-brand')}
                  className="hover:text-amber-600 transition-colors text-left cursor-pointer"
                >
                  Catch the Brand
                </button>
              </li>
              <li>
                <button
                  onClick={() => navigateTo('/games/memory-match')}
                  className="hover:text-amber-600 transition-colors text-left cursor-pointer"
                >
                  Brand Memory Match
                </button>
              </li>
              <li>
                <button
                  onClick={() => navigateTo('/games/reaction-challenge')}
                  className="hover:text-amber-600 transition-colors text-left cursor-pointer"
                >
                  Formula Reaction Lights
                </button>
              </li>
              <li>
                <button
                  onClick={() => navigateTo('/showcase')}
                  className="hover:text-amber-600 transition-colors text-left cursor-pointer font-semibold text-slate-800 flex items-center gap-1 pt-1"
                >
                  <span>Event Showcases</span>
                  <ArrowUpRight className="w-3 h-3 text-slate-400" />
                </button>
              </li>
            </ul>
          </div>

          {/* 4. Platform & Workspaces */}
          <div className="space-y-3">
            <div className="text-[11px] uppercase tracking-wider font-bold text-slate-900">
              Organizer Studio
            </div>
            <ul className="space-y-2 text-xs">
              <li>
                <button
                  onClick={() => navigateTo(isAuthenticated ? '/events' : '/login')}
                  className="hover:text-amber-600 transition-colors flex items-center gap-1 text-left cursor-pointer"
                >
                  <span>Events Dashboard</span>
                  <ArrowUpRight className="w-3 h-3 text-slate-400" />
                </button>
              </li>
              <li>
                <button
                  onClick={() => navigateTo(isAuthenticated ? '/game-themes' : '/login')}
                  className="hover:text-amber-600 transition-colors flex items-center gap-1 text-left cursor-pointer"
                >
                  <span>Theme Customizer</span>
                  <ArrowUpRight className="w-3 h-3 text-slate-400" />
                </button>
              </li>
              <li>
                <button
                  onClick={() => navigateTo(isAuthenticated ? '/team' : '/login')}
                  className="hover:text-amber-600 transition-colors flex items-center gap-1 text-left cursor-pointer"
                >
                  <span>Team Workspaces</span>
                  <ArrowUpRight className="w-3 h-3 text-slate-400" />
                </button>
              </li>
              <li>
                <button
                  onClick={() => navigateTo(isAuthenticated ? '/wallet' : '/login')}
                  className="hover:text-amber-600 transition-colors flex items-center gap-1 text-left cursor-pointer"
                >
                  <span>Wallet & Credits</span>
                  <ArrowUpRight className="w-3 h-3 text-slate-400" />
                </button>
              </li>
              {currentUser?.is_developer && (
                <li>
                  <button
                    onClick={() => navigateTo('/developer')}
                    className="hover:text-emerald-600 text-emerald-700 font-semibold transition-colors text-left cursor-pointer"
                  >
                    Developer Admin
                  </button>
                </li>
              )}
            </ul>
          </div>

          {/* 5. Contact & Support */}
          <div className="space-y-3">
            <div className="text-[11px] uppercase tracking-wider font-bold text-slate-900">
              Contact & Enquiries
            </div>
            <ul className="space-y-2 text-xs">
              <li>
                <button
                  onClick={() => navigateTo('/contact')}
                  className="hover:text-amber-600 transition-colors flex items-center gap-1.5 text-left cursor-pointer font-bold text-slate-900"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-amber-500" />
                  <span>Contact Form</span>
                </button>
              </li>
              <li>
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-emerald-600 transition-colors flex items-center gap-1.5 text-left cursor-pointer font-medium text-slate-700"
                >
                  <Phone className="w-3.5 h-3.5 text-emerald-500" />
                  <span>WhatsApp: {whatsappDisplay}</span>
                  <ArrowUpRight className="w-3 h-3 text-slate-400" />
                </a>
              </li>
              <li className="text-slate-500 text-[11px] pt-1">
                {officeLocation}
              </li>
              <li className="pt-2">
                <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-[10px] text-slate-600 shadow-xs">
                  <ShieldCheck className="w-3 h-3 text-emerald-600" />
                  <span>Enterprise Ready</span>
                </div>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-slate-500">
          <div>
            © {new Date().getFullYear()} EventGameStudio · v{APP_VERSION}
          </div>
          <div className="flex items-center gap-6">
            <span>Make Your Events Playable.</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
