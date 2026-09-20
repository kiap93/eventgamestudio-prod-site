import React from 'react';
import { GameComponentProps } from '../types';
import { HelpCircle, Clock, ShieldAlert, Sparkles, Layers, ArrowLeft } from 'lucide-react';
import { navigateTo } from '../../hooks/useRouteContext';

/**
 * Dedicated Engine Unavailable Placeholder for Speed Quiz.
 *
 * Replaces the legacy fallback to CatchBrandGame.
 * This guarantees that even if an administrator manually creates or selects
 * an event with game_type = 'speed-quiz', the engine will NEVER silently
 * render Catch the Brand or any other unrelated game.
 */
export const SpeedQuizUnavailablePlaceholder: React.FC<GameComponentProps<any>> = ({
  isEventPreview = false,
  isEventTest = false,
}) => {
  const handleReturnToStudio = () => {
    navigateTo('/studio');
  };

  return (
    <div
      id="speed-quiz-unavailable-placeholder"
      className="relative w-full h-full min-h-[480px] flex items-center justify-center bg-slate-950 text-slate-100 p-6 overflow-hidden select-none"
    >
      {/* Subtle Background Lighting */}
      <div className="absolute top-1/4 -left-20 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-20 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative max-w-md w-full bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 text-center space-y-6 shadow-2xl backdrop-blur-sm">
        {/* Engine Icon & Status Pill */}
        <div className="space-y-3">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 shadow-inner">
            <HelpCircle className="w-8 h-8" />
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-amber-500/10 text-amber-300 border border-amber-500/30">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span>Engine Under Development</span>
          </div>
        </div>

        {/* Title & Description */}
        <div className="space-y-2">
          <h2 className="text-2xl font-black tracking-tight text-white">
            Event Trivia Speed Quiz
          </h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            This interactive trivia engine is scheduled on the platform roadmap and is not yet available for live event gameplay.
          </p>
        </div>

        {/* Architecture Isolation Notice */}
        <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 text-left space-y-2 text-xs">
          <div className="flex items-center gap-2 text-emerald-400 font-bold text-[11px] uppercase tracking-wide">
            <ShieldAlert className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Game Engine Isolation Enforced</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            In compliance with Event Game Studio master guidelines, unavailable games are strictly barred from falling back to or silently rendering another game.
          </p>
        </div>

        {/* Feature Roadmap Chips */}
        <div className="grid grid-cols-3 gap-2 text-[10px] font-medium text-slate-400">
          <div className="p-2 rounded-xl bg-slate-800/60 border border-slate-700/60 flex flex-col items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-blue-400" />
            <span>Timed Rounds</span>
          </div>
          <div className="p-2 rounded-xl bg-slate-800/60 border border-slate-700/60 flex flex-col items-center gap-1">
            <Layers className="w-3.5 h-3.5 text-amber-400" />
            <span>Brand Trivia</span>
          </div>
          <div className="p-2 rounded-xl bg-slate-800/60 border border-slate-700/60 flex flex-col items-center gap-1">
            <HelpCircle className="w-3.5 h-3.5 text-emerald-400" />
            <span>Live Buzzers</span>
          </div>
        </div>

        {/* Action Button */}
        {(isEventPreview || isEventTest) && (
          <div className="pt-2">
            <button
              onClick={handleReturnToStudio}
              className="w-full py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer border border-slate-700"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Return to Studio</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
