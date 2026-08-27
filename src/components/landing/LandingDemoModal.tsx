import React, { useState } from 'react';
import { GameShell } from '../shell/GameShell';
import { THEME_REGISTRY, DEFAULT_ACTIVE_THEME_ID } from '../../themes/registry';
import { GameTheme } from '../../themes/types';
import { X, Play, RotateCcw, Sparkles, Monitor, Palette } from 'lucide-react';
import { navigateTo } from '../../hooks/useRouteContext';
import { useAuth } from '../../context/AuthContext';

interface LandingDemoModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialThemeId?: string;
  gameTitle?: string;
}

export const LandingDemoModal: React.FC<LandingDemoModalProps> = ({
  isOpen,
  onClose,
  initialThemeId = DEFAULT_ACTIVE_THEME_ID,
  gameTitle = 'Catch the Brand (Carnival Fiesta)',
}) => {
  const { isAuthenticated } = useAuth();
  const [selectedThemeId, setSelectedThemeId] = useState<string>(initialThemeId);
  const [sessionKey, setSessionKey] = useState<number>(Date.now());

  if (!isOpen) return null;

  const currentTheme: GameTheme = THEME_REGISTRY[selectedThemeId] || THEME_REGISTRY['carnival'];

  const handleRestart = () => {
    setSessionKey(Date.now());
  };

  const handleCreateEvent = () => {
    onClose();
    if (isAuthenticated) {
      navigateTo('/events');
    } else {
      navigateTo('/login');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="relative flex flex-col w-full max-w-5xl h-[92vh] max-h-[860px] bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden">
        {/* Top Header Bar */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 bg-slate-950 border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <Play className="w-4 h-4 fill-amber-400" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
                  INTERACTIVE DEMO
                </span>
                <span className="text-xs text-slate-400 font-medium hidden sm:inline">{gameTitle}</span>
              </div>
              <h2 className="text-sm sm:text-base font-bold text-white tracking-tight">
                {currentTheme.name} Arcade
              </h2>
            </div>
          </div>

          {/* Theme Selector Pill Bar */}
          <div className="hidden md:flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
            <span className="text-[10px] font-semibold text-slate-500 uppercase px-2 flex items-center gap-1">
              <Palette className="w-3 h-3 text-amber-400" /> Theme:
            </span>
            {Object.values(THEME_REGISTRY).map((th) => (
              <button
                key={th.id}
                onClick={() => {
                  setSelectedThemeId(th.id);
                  setSessionKey(Date.now());
                }}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
                  selectedThemeId === th.id
                    ? 'bg-amber-500 text-slate-950 shadow-sm font-bold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/80'
                }`}
              >
                {th.name.split(' ')[0]}
              </button>
            ))}
          </div>

          {/* Right Action Controls */}
          <div className="flex items-center space-x-2">
            <button
              onClick={handleRestart}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition-colors"
              title="Restart Game Session"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Restart</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
              aria-label="Close Demo"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Game Canvas Viewport */}
        <div className="relative flex-1 bg-slate-950 overflow-hidden flex items-center justify-center p-2 sm:p-4">
          <div className="w-full h-full max-w-4xl max-h-full flex items-center justify-center">
            <GameShell
              key={sessionKey}
              customTheme={currentTheme}
              showCabinetFooter={false}
              className="w-full h-full rounded-2xl shadow-xl border border-slate-800 overflow-hidden"
            />
          </div>
        </div>

        {/* Footer Bar with CTA */}
        <div className="px-4 sm:px-6 py-3.5 bg-slate-950 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-400">
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              Use mouse, keyboard arrows, or touch to catch high-value objects.
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleCreateEvent}
              className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black rounded-xl shadow-lg shadow-amber-500/20 transition-all text-xs"
            >
              Create Event With This Game
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
